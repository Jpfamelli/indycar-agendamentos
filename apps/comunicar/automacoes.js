// -----------------------------------------------------------------------------
// Automações ligadas à EQUIPE (rodada 3). Nada aqui fala com o cliente: só cria
// tarefa e notificação para quem trabalha na oficina.
//   • resposta lida pela IA (quer agendar / quer orçamento / reclamou) → TAREFA
//     para o dono da conversa (ou o gestor) com o contexto; reclamação → aviso
//     imediato aos gestores
//   • régua com 3 falhas em 24 h → aviso aos gestores (uma vez por dia por régua)
//   • resumo semanal do Comunicar → notificação aos gestores (segunda de manhã)
//   • campanha proposta por atendente → aviso aos gestores; decisão → aviso a quem propôs
// Tudo recebe a `loja` (banco) e o `relogio` por parâmetro — os testes usam falsos.
// As chaves de notificação (`chave`) tornam tudo idempotente: rodar duas vezes
// não avisa duas vezes (o banco ignora a repetida).
// -----------------------------------------------------------------------------

const HORA = 3600_000;

/* O que cada intenção vira em tarefa. Prioridade: 1 = alta, 2 = normal. */
export const TAREFA_POR_INTENCAO = {
  quer_agendar:   { titulo: 'Quer agendar', prioridade: 1, prazoH: 2, acao: 'Ofereça um horário' },
  quer_orcamento: { titulo: 'Quer orçamento', prioridade: 2, prazoH: 4, acao: 'Monte o orçamento ou chame para o diagnóstico gratuito' },
  reclamacao:     { titulo: 'Reclamou', prioridade: 1, prazoH: 2, acao: 'Ligue ou responda hoje' },
};

const ROTULO_REGUA = {
  aniversario: 'Aniversário', posvenda: 'Pós-venda', retorno: 'Revisão', campanha: 'Campanha', avulsa: 'Avulsa',
  lembrete: 'Lembrete', remarcacao: 'Horário remarcado', orcamento: 'Orçamento parado', nao_fechou: 'Não fechou', reativacao: 'Reativação', avaliacao: 'Avaliação',
  patio_entrada: 'Pátio: carro recebido', patio_extra: 'Pátio: extra', patio_pronto: 'Pátio: carro pronto', area_cliente: 'Área do Cliente',
};

const nomeDo = (e) => String(e?.nome || '').trim() || e?.telefone || 'Cliente';
const corta = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** Dia no fuso da oficina (YYYY-MM-DD) e dia da semana (0 = domingo). */
export function diaSP(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), diaSemana: dias[p.weekday] };
}

/** Segunda-feira da semana (no fuso de SP) — identifica a semana do resumo. */
export function segundaDaSemana(ms) {
  const { data, diaSemana } = diaSP(ms);
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((diaSemana + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** A tarefa (pura) que uma intenção gera para um envio respondido. */
export function tarefaDaIntencao(envio, intencao, resumoIA, agoraMs) {
  const t = TAREFA_POR_INTENCAO[intencao];
  if (!t) return null;
  const nome = nomeDo(envio);
  const linhas = [
    `Respondeu à mensagem de ${ROTULO_REGUA[envio.tipo] || envio.tipo || 'Comunicar'}: "${corta(envio.resposta, 280)}"`,
    resumoIA ? `Leitura da IA: ${corta(resumoIA, 200)}` : null,
    `${t.acao}.`,
  ].filter(Boolean);
  return {
    titulo: corta(`${t.titulo}: ${nome}`, 200),
    descricao: linhas.join('\n'),
    prioridade: t.prioridade,
    vence_em: new Date(agoraMs + t.prazoH * HORA).toISOString(),
    origem: 'comunicar',
    cliente_id: envio.cliente_id || null,
    lead_id: envio.lead_id || null,
    agendamento_id: envio.agendamento_id || null,
  };
}

/**
 * Depois que a IA leu uma resposta: cria a tarefa (uma por envio) e, se for
 * reclamação, avisa os gestores na hora. Nunca lança erro para o carteiro.
 */
export async function aposLeituraDaIA({ envio, intencao, resumo = null, loja, relogio = () => Date.now() }) {
  if (!TAREFA_POR_INTENCAO[intencao]) return { tarefa: null, avisados: 0, pulou: 'intenção sem tarefa' };
  const saida = { tarefa: null, avisados: 0, responsavel: null };
  const agora = relogio();
  if (!envio.tarefa_id) {
    const { conversaId, dono } = await loja.donoDaConversa(envio);
    const gestores = await loja.gestores(null);
    const responsavel = dono || gestores[0] || null;
    const t = tarefaDaIntencao(envio, intencao, resumo, agora);
    const criada = await loja.criarTarefa({ ...t, responsavel_id: responsavel, conversa_id: conversaId || envio.conversa_id || null });
    if (criada?.id) {
      await loja.ligarTarefa(envio.id, criada.id);
      saida.tarefa = criada.id;
      saida.responsavel = responsavel;
      saida.paraDono = !!dono;
    }
  } else saida.tarefa = envio.tarefa_id;

  if (intencao === 'reclamacao') {
    for (const g of await loja.gestores('reclamacao')) {
      const id = await loja.notificar({
        perfil: g, tipo: 'reclamacao', titulo: corta(`${nomeDo(envio)} reclamou`, 140),
        corpo: corta(resumo || envio.resposta, 300),
        link: envio.cliente_id ? `/?cliente=${envio.cliente_id}` : null, app: 'comunicar', chave: `reclamacao:${envio.id}`,
      });
      if (id) saida.avisados++;
    }
  }
  return saida;
}

/** Régua com N+ falhas nas últimas 24 h → avisa os gestores (uma vez por dia por régua). */
export async function vigiarFalhas({ loja, relogio = () => Date.now(), minimo = 3 }) {
  const agora = relogio();
  const porTipo = await loja.falhasPorTipo(new Date(agora - 24 * HORA).toISOString());
  const { data } = diaSP(agora);
  const avisos = [];
  for (const [tipo, info] of Object.entries(porTipo)) {
    if ((info?.total || 0) < minimo) continue;
    let n = 0;
    for (const g of await loja.gestores('falhas')) {
      const id = await loja.notificar({
        perfil: g, tipo: 'falhas', titulo: corta(`Régua ${ROTULO_REGUA[tipo] || tipo}: ${info.total} mensagens falharam`, 140),
        corpo: corta(info.ultimoErro ? `Último erro: ${info.ultimoErro}` : 'Veja em Mensagens › Falharam.', 300),
        link: `/?tela=mensagens&status=falhou&tipo=${tipo}`, app: 'comunicar', chave: `falhas:${tipo}:${data}`,
      });
      if (id) n++;
    }
    avisos.push({ tipo, total: info.total, avisados: n });
  }
  return avisos;
}

/** Já é hora do resumo semanal? Segunda (ou depois, se a segunda passou sem rodar) a partir das 8h, uma vez por semana. */
export function horaDoResumoSemanal(ultimoEmIso, agoraMs) {
  const { hora, diaSemana } = diaSP(agoraMs);
  if (diaSemana === 0) return false;                   // domingo não
  if (diaSemana === 1 && hora < 8) return false;       // segunda só depois das 8h
  const semana = segundaDaSemana(agoraMs);
  if (!ultimoEmIso) return true;
  return segundaDaSemana(new Date(ultimoEmIso).getTime()) < semana;
}

/** Texto do resumo semanal para a equipe (puro; sem nome de cliente). */
export function textoResumoSemanal(n) {
  const s = n?.semana || {};
  const enviadas = Number(s.enviadas) || 0, resp = Number(s.respondidas) || 0, ag = Number(s.agendaram) || 0;
  const taxa = enviadas ? Math.round((resp / enviadas) * 100) : 0;
  const int = n?.intencoes_7d || {};
  const partes = [
    `${enviadas} mensage${enviadas === 1 ? 'm saiu' : 'ns saíram'}, ${resp} responderam (${taxa}%)`,
    ag ? `${ag} agendaram pela mensagem` : null,
    int.reclamacao ? `${int.reclamacao} reclamaç${int.reclamacao === 1 ? 'ão' : 'ões'}` : null,
    int.quer_agendar ? `${int.quer_agendar} pediram horário` : null,
    n?.falhas_30d ? `${n.falhas_30d} falhas em 30 dias` : null,
    n?.na_fila ? `${n.na_fila} na fila` : null,
    n?.whatsapp_parado ? 'WhatsApp parado: confira a chave do CodeWords' : null,
  ].filter(Boolean);
  return { titulo: 'Resumo da semana do Comunicar', corpo: corta(partes.join(' · ') + '.', 380) };
}

/** Manda o resumo semanal aos gestores, se for a hora. */
export async function resumoSemanalEquipe({ loja, relogio = () => Date.now(), forcar = false }) {
  const agora = relogio();
  const ultimo = await loja.ultimoResumoEquipe();
  if (!forcar && !horaDoResumoSemanal(ultimo, agora)) return { mandou: false };
  const numeros = await loja.numerosDaSemana();
  const { titulo, corpo } = textoResumoSemanal(numeros);
  const semana = segundaDaSemana(agora);
  let avisados = 0;
  for (const g of await loja.gestores('resumo_semanal')) {
    const id = await loja.notificar({ perfil: g, tipo: 'resumo_semanal', titulo, corpo, link: '/', app: 'comunicar', chave: `resumo-comunicar:${semana}` });
    if (id) avisados++;
  }
  await loja.marcarResumoEquipe(new Date(agora).toISOString());
  return { mandou: true, avisados, semana };
}

/** Campanha proposta por atendente → gestores avisados. */
export async function avisarPropostaDeCampanha({ campanha, loja }) {
  let n = 0;
  for (const g of await loja.gestores('aprovacao')) {
    if (g === campanha.criado_por) continue;
    const id = await loja.notificar({
      perfil: g, tipo: 'aprovacao', titulo: corta(`${campanha.criado_por_nome || 'Atendente'} quer mandar uma campanha`, 140),
      corpo: corta(`${campanha.total_previsto ?? '?'} clientes · "${campanha.corpo}"`, 300),
      link: `/?campanha=${campanha.id}`, app: 'comunicar', chave: `aprovacao:${campanha.id}`,
    });
    if (id) n++;
  }
  return n;
}

/** Decisão do gestor → quem propôs fica sabendo. */
export async function avisarDecisaoDeCampanha({ campanha, loja }) {
  if (!campanha.criado_por || campanha.criado_por === campanha.decidido_por) return null;
  const aprovada = campanha.status === 'aprovada';
  return loja.notificar({
    perfil: campanha.criado_por, tipo: 'campanha',
    titulo: aprovada ? `Campanha aprovada por ${campanha.decidido_por_nome || 'gestor'}` : `Campanha recusada por ${campanha.decidido_por_nome || 'gestor'}`,
    corpo: aprovada ? `${campanha.enfileirados ?? 0} mensagens na fila.` : corta(campanha.motivo_recusa || 'Sem motivo informado.', 300),
    link: '/?tela=campanhas', app: 'comunicar', chave: `campanha-decidida:${campanha.id}`,
  });
}

/**
 * Como uma campanha nasce, pelo papel de quem pede e o tamanho:
 *   1 cliente → 'avulsa' (qualquer um da equipe) · gestor → 'campanha' (sai direto)
 *   atendente com 2+ clientes → 'proposta' (espera o gestor aprovar)
 */
export function destinoDoPedido(usuario, totalDestinos) {
  if (totalDestinos <= 1) return 'avulsa';
  return usuario?.papel === 'admin' || usuario?.papel === 'gestor' ? 'campanha' : 'proposta';
}
