// -----------------------------------------------------------------------------
// A parte da rodada do carteiro que FALA COM O CLIENTE (rodada 5 · verificação C8).
//
// Saiu do server.js para ser testada de ponta a ponta com um banco e um CodeWords
// de mentira (scripts/testes-rodada5-c8.mjs): o que o carteiro decide mandar quando
// a fila acumulou é a parte mais perigosa do Comunicar. Nada aqui importa o banco:
// `dados`, `wa`, `patio` e `carteiro` chegam por parâmetro.
//
// Regras desta função (nesta ordem, para cada mensagem devida):
//   1. pausa geral, janela de envio, domingo e "só horário comercial" seguram TUDO;
//   2. limites por hora, por dia e por minuto definem quantas saem;
//   3. a fila vem por PRIORIDADE (pátio pronto > lembrete > … > campanha);
//   4. quem pediu para parar (aceita_mensagens = false) NÃO recebe — nem o que já estava na fila;
//   5. o mesmo cliente: 1 aviso por intervalo (também entre rodadas) e no máximo N por dia;
//   6. lembrete/pátio conferem a situação de AGORA; reserva antes de enviar;
//   7. erro estrutural ou 429 para a rodada sem gastar tentativa;
//   8. timeout/conexão caída DEPOIS do pedido = "sem confirmação": NUNCA tenta de novo sozinho
//      (o cliente receberia duas) — fica para a equipe conferir (Chegou / Reenviar) e a rodada para.
// -----------------------------------------------------------------------------

export async function enviarFila({ cfg, dados, wa, patio, carteiro, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), agora = new Date(), log = console }) {
  const { hora, minuto, diaSemana, data } = dados.agoraSP(agora);
  if (cfg.pausa_geral) return { bloqueado: true, aviso: 'Envios pausados: a pausa geral está ligada.' };
  if (hora < cfg.janela_inicio || hora >= cfg.janela_fim) return { bloqueado: true, aviso: `Fora da janela de envio (${cfg.janela_inicio}h–${cfg.janela_fim}h).` };
  if (diaSemana === 0 && !cfg.envia_domingo) return { bloqueado: true, aviso: 'Domingo: envios automáticos pausados.' };
  if (cfg.so_horario_comercial && !carteiro.dentroDoHorarioComercial({ diaSemana, hora, minuto })) {
    return { bloqueado: true, aviso: 'Fora do horário comercial (seg–sáb, 8h–17h30): os envios esperam a loja abrir.' };
  }

  // limites: por hora (padrão 60), por dia (padrão 300) e por minuto (padrão 10) — cadência segura
  const [ultimaHora, enviadasHoje] = await Promise.all([dados.enviadasNaUltimaHora().catch(() => 0), dados.enviadasHoje().catch(() => 0)]);
  const vagasHora = dados.vagasNestaRodada(cfg.limite_por_hora, ultimaHora);
  if (!vagasHora) return { bloqueado: true, aviso: `Limite de ${cfg.limite_por_hora} mensagens por hora atingido — o resto sai na próxima rodada.` };
  const vagas = carteiro.vagasPorCadencia({ limitePorMinuto: cfg.limite_por_minuto, limitePorDia: cfg.limite_por_dia, enviadasHoje, vagasHora });
  if (!vagas) return { bloqueado: true, aviso: `Limite diário de ${cfg.limite_por_dia} mensagens atingido — o resto sai amanhã.` };
  const pausaMs = carteiro.pausaEntreEnvios(cfg.limite_por_minuto);

  const nomeFeriado = dados.feriado(data);
  const proximoDia = () => dados.proximoDiaDeEnvio(data, cfg.hora_envio, cfg.envia_domingo);

  /* A fila por PRIORIDADE de verdade: os avisos que o cliente espera (pátio, lembrete…)
     são buscados à parte — antes, uma fila velha de campanha (as 40 mais antigas) escondia
     o "seu carro está pronto" que chegou depois. */
  const [urgentes, demais] = await Promise.all([
    dados.enviosDevidos(60, { tipos: [...carteiro.TIPOS_URGENTES] }),
    dados.enviosDevidos(100, { exceto: [...carteiro.TIPOS_URGENTES] }),
  ]);
  const ordenada = carteiro.ordenarFila([...urgentes, ...demais]).slice(0, vagas * 3 + 20);

  // quem pediu para parar não recebe nada, nem o que já estava na fila
  const fora = await dados.clientesFora(ordenada);
  const candidatos = [];
  let pulados = 0;
  for (const e of ordenada) {
    const t = carteiro.telDe(e.telefone);
    if ((e.cliente_id && fora.ids.has(e.cliente_id)) || (t && fora.tels.has(t))) {
      await dados.marcarEnvio(e.id, 'pulado', null, undefined, { motivo_pulado: 'cliente pediu para não receber mensagens' }).catch(() => {});
      pulados++; continue;
    }
    candidatos.push(e);
  }

  // o mesmo cliente: intervalo e teto por dia valem também ENTRE rodadas (o que já saiu hoje conta)
  const hist = await dados.contatosDoDia(Math.max(Number(cfg.intervalo_mesmo_cliente_min) || 0, 0));
  const sep = carteiro.separarMesmoCliente(candidatos, {
    minutos: cfg.intervalo_mesmo_cliente_min, agora: agora.getTime(), recentes: hist.ultimos, contagemHoje: hist.contagem,
    maxPorDia: carteiro.MAX_MENSAGENS_CLIENTE_DIA, proximoDia,
  });
  for (const a of sep.adiados) await dados.adiarEnvio(a.envio.id, a.enviar_em, a.motivo || 'outra mensagem para o mesmo cliente saiu há pouco: espera um pouco').catch(() => {});
  const fila = sep.agora;

  // lembretes: confere o horário de AGORA (cancelado/remarcado enquanto o servidor dormia)
  const agendas = await dados.agendamentosPorIds(fila.filter((e) => e.tipo === 'lembrete').map((e) => e.agendamento_id)).catch(() => null);
  // avisos do Pátio: confere a ordem de AGORA (carro já entregue não recebe "está pronto")
  const ordensPatio = await dados.ordensDoPatio(fila.map((e) => patio.osIdDaChave(e.chave_unica)).filter(Boolean)).catch(() => null);

  let enviados = 0, falhas = 0, semConfirmacao = 0, adiados = sep.adiados.length, reagendados = 0, parouPor = null, classeParou = null;
  const porClasse = {};
  for (const envio of fila) {
    if (enviados >= vagas) break;
    if (carteiro.envioVencido(envio, agora.getTime())) continue; // a faxina do começo pega na próxima
    // feriado nacional: régua de relacionamento espera o próximo dia útil
    if (nomeFeriado && dados.TIPOS_SEGURAM_NO_FERIADO.has(envio.tipo)) {
      await dados.adiarEnvio(envio.id, proximoDia(), `feriado (${nomeFeriado})`).catch(() => {});
      adiados++; continue;
    }
    if (envio.tipo === 'lembrete' && envio.agendamento_id && agendas) {
      const c = carteiro.conferirLembrete(envio, agendas.get(envio.agendamento_id), cfg, agora.getTime());
      if (c.acao === 'pular') { await dados.marcarEnvio(envio.id, 'pulado', null, undefined, { motivo_pulado: c.motivo }).catch(() => {}); pulados++; continue; }
      if (c.acao === 'atualizar') {
        await dados.atualizarEnvio(envio.id, { corpo: c.corpo, expira_em: c.expira_em, ...(c.enviar_em ? { enviar_em: c.enviar_em } : {}) }).catch(() => {});
        if (c.enviar_em) { reagendados++; continue; }
        envio.corpo = c.corpo;
      }
    }
    if (envio.tipo?.startsWith('patio_')) {
      const osId = patio.osIdDaChave(envio.chave_unica);
      const os = osId && ordensPatio ? (ordensPatio.get(osId) || null) : undefined;
      const c = patio.conferirPatio(envio, os, os?.extras || [], agora.getTime());
      if (c.acao === 'pular') { await dados.marcarEnvio(envio.id, 'pulado', null, undefined, { motivo_pulado: c.motivo }).catch(() => {}); pulados++; continue; }
    }
    // alguém está atendendo o cliente agora → espera 3 h
    let ocup = { ocupada: false, conversa: undefined };
    try { ocup = await dados.ocupacaoDaConversa(envio.telefone); } catch { /* sem leitura: segue */ }
    if (ocup.ocupada && dados.TIPOS_ESPERAM_ATENDIMENTO.has(envio.tipo)) {
      await dados.adiarEnvio(envio.id, new Date(agora.getTime() + 3 * 3600000).toISOString(), ocup.motivo).catch(() => {});
      adiados++; continue;
    }

    // reserva: só quem reservou manda (outro carteiro pode estar na mesma fila)
    const reservado = await dados.reservarEnvio(envio.id).catch(() => null);
    if (!reservado) continue;

    const r = await wa.enviar(envio.telefone, envio.corpo);
    const tentativas = (Number(envio.tentativas) || 0) + 1;
    if (r.ok) {
      /* Saiu: marcar como enviado com novas tentativas (o Supabase às vezes engasga).
         Se nem assim gravar, a reserva fica e vira "confira antes de reenviar" —
         nunca uma segunda mensagem para o cliente. */
      await carteiro.comTentativas(() => dados.marcarEnvio(envio.id, 'enviado', null, tentativas, { motivo_pulado: null, erro_classe: null }))
        .catch((e) => log.error(`Envio ${envio.id} saiu mas não consegui marcar:`, e?.message || e));
      enviados++;
      // aparece no histórico da conversa do Atendimento (só depois de sair de verdade)
      await dados.registrarNoHistorico(envio, ocup.conversa).catch((e) => log.error(`Histórico do envio ${envio.id}:`, e?.message || e));
    } else {
      log.error(`Envio ${envio.id} falhou [${r.classe}]: ${r.erro}`);
      porClasse[r.classe] = (porClasse[r.classe] || 0) + 1;
      if (r.classe === 'sem_confirmacao') {
        /* Pode ter saído: marca como falhou/sem_confirmacao (sai da fila, nada de nova tentativa) e
           para a rodada — o CodeWords está lento e o resto da fila espera a próxima sem risco. */
        await carteiro.comTentativas(() => dados.marcarEnvio(envio.id, 'falhou', r.erro, tentativas, { erro_classe: 'sem_confirmacao' }))
          .catch((e) => log.error(`Envio ${envio.id} sem confirmação e não consegui marcar:`, e?.message || e));
        semConfirmacao++; falhas++;
        parouPor = 'O CodeWords não confirmou um envio a tempo: a rodada parou para não arriscar mensagem duplicada. Confira em Mensagens › Sem confirmação.';
        classeParou = r.classe;
        break;
      }
      if (r.estrutural || r.classe === 'limite') {
        /* Sem aparelho/chave TODOS falhariam igual; 429 = o CodeWords pediu calma: a mensagem
           volta para a fila SEM gastar tentativa (antes cada 429 gastava uma das 4 e a rajada
           inteira falhava de vez) e a rodada para aqui, com o aviso claro. */
        await dados.marcarEnvio(envio.id, 'pendente', r.erro, Number(envio.tentativas) || 0,
          { erro_classe: r.classe, ...(r.classe === 'limite' ? { enviar_em: new Date(agora.getTime() + 10 * 60000).toISOString() } : {}) }).catch(() => {});
        falhas++;
        parouPor = r.erro; classeParou = r.classe;
        break;
      }
      // falha passageira: até 3 re-tentativas, com espera crescente (5, 15, 45 min); número inválido falha de vez
      const d = dados.decidirFalha(r.erro, tentativas, agora.getTime(), r.definitivo);
      if (d.status === 'pendente') {
        await dados.marcarEnvio(envio.id, 'pendente', r.erro, tentativas, { enviar_em: d.enviar_em, erro_classe: r.classe });
        reagendados++;
      } else {
        await dados.marcarEnvio(envio.id, 'falhou', r.erro, tentativas, { erro_classe: r.classe });
        falhas++;
      }
    }
    await dormir(pausaMs); // cadência: respeita o limite por minuto, com variação (sem rajada)
  }
  return { enviados, falhas, semConfirmacao, adiados, reagendados, pulados, porClasse, cadencia: { vagas, pausaMs, enviadasHoje },
    feriado: nomeFeriado || undefined, aviso: parouPor || undefined, classe: classeParou || undefined };
}
