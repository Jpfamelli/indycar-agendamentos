// -----------------------------------------------------------------------------
// Rodada 7 (25/10/2026) — rotas novas do Comunicar, separadas de rotas.js para não crescer ainda mais.
// Cada rota aqui tem a sua regra em acesso.js › ROTAS (rota sem regra = 404).
//   Reabordar recusados · lotes/repetir · fila do Pátio · anti-spam · quando sai · agenda por hora ·
//   antecipar · retomada do WhatsApp · resultados avançados · respostas sem atender.
// -----------------------------------------------------------------------------
import * as r7 from './r7.js';

const LIMITE_RECUSADOS = 500;

export function registrarRotas7(c) {
  const { rota, ok, bad, send, naoAchou, idDe, U, auditar, dados, A, emCache, esquecerCache, relogio, conexoes } = c;

  // ---- lotes guardados (o MODELO da campanha, para o "Repetir") ----
  rota('GET', '/api/lotes', async ({ res }) => {
    const lista = await dados.listarLotes(60);
    return ok(res, { lista: lista.map((l) => ({ ...l, modelo: undefined, tem_modelo: !!l.modelo })) });
  });
  rota('GET', `/api/lotes/${U}/modelo`, async ({ res, url }) => {
    const l = await dados.obterLote(idDe(url.pathname));
    if (!l) return send(res, 404, { erro: 'Esse lote é de antes do "Repetir": não guardamos o texto-modelo dele. Escreva a campanha de novo.', codigo: 'sem_modelo' });
    return ok(res, {
      lote: l.lote, modelo: l.modelo, detalhe: l.detalhe, segmento: l.segmento, evitar_dias: l.evitar_dias, origem: l.origem,
      total: l.total, enfileirados: l.enfileirados, quando: l.created_at, variante: l.variante, freado: !!l.freado_em,
      aviso: 'É o texto com as variáveis ({primeiro_nome}, {carro}…). Cada cliente recebe o dele, nunca o do primeiro.',
    });
  });

  // ---- reabordar recusados (Orçador → Comunicar) ----
  rota('GET', '/api/reabordar', async ({ res, url }) => {
    const dias = Math.min(Math.max(Math.round(Number(url.searchParams.get('dias'))) || 30, 1), 180);
    return ok(res, await emCache(`reabordar:${dias}`, 60_000, () => dados.reabordarRecusados({ dias, limite: LIMITE_RECUSADOS })));
  });
  rota('POST', '/api/reabordar/enviar', async ({ res, usuario, body }) => {
    const dias = Math.min(Math.max(Math.round(Number(body.dias)) || 30, 1), 180);
    const textos = {};
    for (const m of Object.keys(r7.MODELOS_REABORDAR)) {
      const t = String(body.textos?.[m] ?? r7.MODELOS_REABORDAR[m]).trim();
      const erro = r7.validarTextoReabordar(t);
      if (erro) return bad(res, `${r7.MOTIVOS_RECUSA[m] ? `Texto "${r7.MOTIVOS_RECUSA[m]}"` : 'Texto'}: ${erro}`, { campo: m });
      const fora = conexoes.linksForaDaCasa(t);
      if (fora.length) return bad(res, `O texto "${m}" tem link de fora da IndyCar (${fora[0]}).`, { campo: m, codigo: 'link_externo' });
      textos[m] = t;
    }
    const enviarEm = body.enviar_em ? new Date(body.enviar_em) : new Date(relogio());
    if (Number.isNaN(enviarEm.getTime())) return bad(res, 'Data de envio inválida.');
    if (enviarEm.getTime() > relogio() + 30 * 86400000) return bad(res, 'No máximo 30 dias à frente.');
    // a lista é SEMPRE recalculada aqui (nunca confiamos na do navegador): quem pediu PARAR, tem reclamação ou carro na oficina já está fora
    const lista = await dados.reabordarRecusados({ dias, limite: LIMITE_RECUSADOS });
    const ids = Array.isArray(body.orcamentos) ? new Set(body.orcamentos.map(String).slice(0, LIMITE_RECUSADOS)) : null;
    const motivos = Array.isArray(body.motivos) && body.motivos.length ? new Set(body.motivos.map(String)) : null;
    const candidatos = lista.candidatos.filter((x) => (!ids || ids.has(x.orcamento_id)) && (!motivos || motivos.has(x.motivo)));
    if (!candidatos.length) return bad(res, 'Não sobrou ninguém para reabordar com essas escolhas.', { codigo: 'sem_candidatos' });
    const lote = (await import('node:crypto')).randomUUID();
    const cfg = await dados.obterConfig();
    const r = await dados.enfileirarReabordagem({ candidatos, textos, enviarEm: enviarEm.toISOString(), criador: usuario, lote, cfg });
    await Promise.resolve(dados.guardarLote?.({
      lote, modelo: Object.entries(textos).map(([m, t]) => `[${m}] ${t}`).join('\n---\n'), detalhe: `Reabordar recusados (${dias} dias)`, segmento: { filtro: 'orcamento_recuperavel', valor: dias },
      origem: 'recusados', total: candidatos.length, enfileirados: r.enfileirados, pulados: r.repetidos, criado_por_id: usuario.id, criado_por_nome: usuario.nome || usuario.email,
    })).catch(() => null);
    esquecerCache('resumo', 'fila', 'agenda', `reabordar:${dias}`);
    auditar(usuario, 'reabordar_recusados', 'posvenda_envios', lote, { enfileirados: r.enfileirados, ja_tinham: r.repetidos, dias, valor: candidatos.reduce((s, x) => s + x.valor, 0) });
    return ok(res, { ok: true, lote, ...r, valor: Math.round(candidatos.reduce((s, x) => s + x.valor, 0) * 100) / 100 });
  });

  // ---- fila de verdade para o Pátio ----
  rota('GET', '/api/patio/fila', async ({ res, url }) => {
    const os = (url.searchParams.get('os') || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (os.length > 300) return bad(res, 'No máximo 300 ordens por vez.');
    if (os.some((x) => !new RegExp(`^${U}$`).test(x))) return bad(res, 'Identificador de ordem inválido.');
    const horas = Math.min(Math.max(Number(url.searchParams.get('horas')) || 48, 1), 168);
    return ok(res, await emCache(`patio-fila:${os.join(',')}:${horas}`, 10_000, () => dados.filaPorOrdem(os.length ? os : null, horas)));
  });

  // ---- anti-spam ----
  rota('GET', '/api/antispam', async ({ res }) => ok(res, await emCache('antispam', 30_000, () => dados.antispam())));

  // ---- quando sai de verdade ----
  rota('GET', '/api/previa/exata', async ({ res, url }) => {
    const so = url.searchParams.get('regua') || null;
    if (so && !dados.REGUAS.includes(so) && !r7.R7_REGUAS.some((x) => x.id === so)) return bad(res, 'Régua desconhecida.');
    return ok(res, await dados.previaExata({ so, incluirFila: url.searchParams.get('fila') === '1' }));
  });
  rota('GET', `/api/envios/${U}/quando`, async ({ res, url }) => {
    const id = idDe(url.pathname);
    const r = await dados.quandoSai([id]);
    return ok(res, { ...r.saidas[id], cortada: r.cortada, aviso: r.aviso });
  });
  rota('GET', '/api/agenda/por-hora', async ({ res, url }) => {
    const dia = url.searchParams.get('dia');
    if (dia && !conexoes.diaValido(dia)) return bad(res, 'Dia inválido: use AAAA-MM-DD.');
    return ok(res, await emCache(`agenda-hora:${dia || ''}`, 10_000, () => dados.agendaPorHora(dia || null)));
  });
  rota('POST', `/api/envios/${U}/antecipar`, async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    if (!A.ehGestor(usuario)) {
      const e = await dados.obterEnvio(id);
      if (!e || e.criado_por_id !== usuario.id) return send(res, 403, { erro: A.motivo403('cancelar_qualquer'), codigo: 'sem_permissao' });
    }
    const r = await dados.anteciparEnvio(id);
    if (!r.ok) return send(res, r.status || 400, { erro: r.erro });
    esquecerCache('agenda', 'fila', 'resumo');
    auditar(usuario, 'envio_antecipado', 'posvenda_envios', id, { para: r.quando });
    return ok(res, r);
  });
  rota('GET', '/api/agenda.csv', async ({ res, usuario, ...resto }) => {
    const csv = await dados.agendaCsv();
    auditar(usuario, 'exportar_csv', 'posvenda_envios', null, { agenda: true });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comunicar-agenda-${dados.hoje()}.csv"`, 'Cache-Control': 'no-store', ...(res.__cors || {}) });
    return res.end(csv);
  });

  // ---- retomada do WhatsApp ----
  rota('GET', '/api/retomada', async ({ res }) => ok(res, await emCache('retomada', 10_000, () => dados.planoRetomadaDados())));
  rota('POST', '/api/retomada/triagem', async ({ res, usuario, body }) => {
    const tipos = Array.isArray(body.tipos) ? body.tipos.map(String).filter((t) => dados.TIPOS_ENVIO.includes(t)) : [];
    if (!tipos.length) return bad(res, 'Escolha pelo menos um tipo de mensagem.');
    const r = await dados.aplicarTriagem({ tipos, soPerderam: body.so_perderam !== false });
    esquecerCache('agenda', 'fila', 'resumo', 'retomada');
    auditar(usuario, 'triagem_fila', 'posvenda_envios', null, { tipos, cancelados: r.cancelados, so_perderam: body.so_perderam !== false });
    return ok(res, { ok: true, ...r });
  });
  rota('POST', '/api/retomada/encerrar', async ({ res, usuario }) => {
    const r = await dados.encerrarRetomada();
    esquecerCache('retomada', 'agenda', 'carteiro');
    auditar(usuario, 'retomada_encerrada', 'posvenda_config', null, null);
    return ok(res, r);
  });

  // ---- resultados avançados e respostas sem atender ----
  rota('GET', '/api/resultados/avancados', async ({ res, url }) => {
    const de = url.searchParams.get('de') || null, ate = url.searchParams.get('ate') || null;
    if (de && ate && de > ate) return bad(res, 'O "de" precisa vir antes do "até".');
    const tipo = url.searchParams.get('tipo') || null;
    if (tipo && tipo !== 'todas' && !dados.TIPOS_ENVIO.includes(tipo)) return bad(res, 'Tipo desconhecido.');
    return ok(res, await emCache(`res-av:${de}:${ate}:${tipo}`, 60_000, () => dados.resultadosAvancados({ de, ate, tipo })));
  });
  rota('GET', '/api/respostas/pendentes', async ({ res, url }) => {
    const horas = Math.min(Math.max(Number(url.searchParams.get('horas')) || 2, 1), 48);
    return ok(res, await emCache(`resp-pend:${horas}`, 20_000, () => dados.respostasPendentesDeAtendimento({ horas })));
  });
}
