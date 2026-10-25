// -----------------------------------------------------------------------------
// Rodada 7 (25/10/2026) — camada de dados das novidades do Comunicar:
//   campanha guardada pelo MODELO (Repetir) · reabordar recusados (Orçador) · fila do Pátio ·
//   anti-spam (teto, freio, números ruins) · prévia exata · retomada do WhatsApp · resultados avançados.
// Reexportado por dados.js (export *): a API usa tudo como `dados.<função>`. Nada aqui roda no import.
// -----------------------------------------------------------------------------
import { selecionar, selecionarUm, selecionarTudo, inserirUm, atualizar, atualizarUm, contar, rpc } from './supabase.js';
import * as D from './dados.js';
import * as r7 from './r7.js';
import * as conexoes from './conexoes.js';

const ENVIOS = 'posvenda_envios';
const LOTES = 'comunicar_lotes';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOuNulo7 = (v) => (typeof v === 'string' && UUID.test(v.trim()) ? v.trim() : null);
const aspas = (lista) => lista.map((t) => `"${String(t).replace(/"/g, '')}"`).join(',');
const em60 = (lista) => { const r = []; for (let i = 0; i < lista.length; i += 60) r.push(lista.slice(i, i + 60)); return r; };

// ============================================================================
// CAMPANHA GUARDADA PELO MODELO (Repetir)
// ============================================================================
export async function guardarLote(l) {
  if (!uuidOuNulo7(l?.lote) || !String(l?.modelo || '').trim()) return null;
  try {
    return await inserirUm(LOTES, {
      lote: l.lote, modelo: String(l.modelo).slice(0, 4000), detalhe: l.detalhe ? String(l.detalhe).slice(0, 200) : null,
      segmento: l.segmento && typeof l.segmento === 'object' ? l.segmento : null, origem: ['comunicar', 'recusados', 'repeticao'].includes(l.origem) ? l.origem : 'comunicar',
      evitar_dias: Math.min(Math.max(Number(l.evitar_dias) || 0, 0), 90), total: Number(l.total) || 0, enfileirados: Number(l.enfileirados) || 0, pulados: Number(l.pulados) || 0,
      criado_por_id: uuidOuNulo7(l.criado_por_id), criado_por_nome: l.criado_por_nome ? String(l.criado_por_nome).slice(0, 80) : null,
      repete_lote: uuidOuNulo7(l.repete_lote), variante: ['A', 'B'].includes(l.variante) ? l.variante : null, ab_grupo: uuidOuNulo7(l.ab_grupo),
    }, 'select=*');
  } catch (e) { console.error('guardarLote:', e?.message || e); return null; }
}
export async function listarLotes(limite = 60) {
  return selecionar(LOTES, `select=*&order=created_at.desc&limit=${Math.min(Math.max(Number(limite) || 60, 1), 200)}`);
}
export async function obterLote(id) {
  if (!uuidOuNulo7(id)) return null;
  return selecionarUm(LOTES, `select=*&lote=eq.${id}`);
}

// ============================================================================
// REABORDAR RECUSADOS (Orçador → Comunicar)
// ============================================================================
/** Os orçamentos recusados que ainda dá para recuperar (rpc do Orçador), já peneirados: PARAR, reclamação aberta, carro na oficina, celular ruim, já reabordados. */
export async function reabordarRecusados({ dias = 30, limite = 200 } = {}) {
  const d = Math.min(Math.max(Math.round(Number(dias)) || 30, 1), 180);
  const bruto = await rpc('orc_recusados_recuperaveis', { p_dias: d, p_limite: Math.min(Math.max(Number(limite) || 200, 1), 500) });
  const lista = Array.isArray(bruto) ? bruto : [];
  const cfg = await D.obterConfig();
  const chaves = lista.filter((o) => o && o.id).map((o) => r7.chaveReabordar(o.id));
  const ja = new Set();
  for (const parte of em60(chaves)) {
    for (const e of await selecionar(ENVIOS, `select=chave_unica&status=in.(enviado,pendente)&chave_unica=in.(${aspas(parte)})`).catch(() => [])) ja.add(String(e.chave_unica).replace('reabordar:orc:', ''));
  }
  const prep = r7.prepararRecusados(lista, { jaReabordados: ja });
  const fora = { ...prep.fora, nao_quer: 0, reclamacao: 0, na_oficina: 0, celular_ruim: 0 };
  const foraOptOut = await selecionarTudo('clientes', 'select=telefone_e164&aceita_mensagens=is.false').catch(() => []);
  const optTels = new Set(foraOptOut.map((c) => c.telefone_e164).filter(Boolean));
  const sit = await D.situacaoDosClientes(prep.candidatos.map((c) => c.telefone), { diasReclamacao: cfg.dias_reclamacao_aberta }).catch(() => new Map());
  const candidatos = [];
  for (const c of prep.candidatos) {
    const s = sit.get(c.telefone) || {};
    if (optTels.has(c.telefone)) { fora.nao_quer++; continue; }
    if (s.reclamacao && s.reclamacao.tarefaAberta !== false) { fora.reclamacao++; continue; }
    if (s.os) { fora.na_oficina++; continue; }
    if (cfg.validar_celular !== false && !r7.validarCelular(c.telefone).ok) { fora.celular_ruim++; continue; }
    candidatos.push(c);
  }
  const porMotivo = {};
  for (const c of candidatos) {
    const x = (porMotivo[c.motivo] ||= { n: 0, valor: 0 });
    x.n++; x.valor = Math.round((x.valor + c.valor) * 100) / 100;
  }
  return {
    dias: d, total: candidatos.length, valorTotal: Math.round(candidatos.reduce((s, c) => s + c.valor, 0) * 100) / 100,
    porMotivo, fora, candidatos: candidatos.slice(0, 500), motivos: r7.MOTIVOS_RECUSA, modelos: r7.MODELOS_REABORDAR,
    gerado_em: new Date().toISOString(),
  };
}

/** Enfileira a reabordagem: um texto por MOTIVO, uma mensagem por orçamento (chave única — nunca reabordar o mesmo duas vezes). */
export async function enfileirarReabordagem({ candidatos, textos, enviarEm, criador, lote, cfg }) {
  let enfileirados = 0, repetidos = 0;
  const linhas = [];
  for (const c of candidatos) {
    const modelo = textos[c.motivo] || textos.sem_motivo;
    const corpo = D.renderTemplate(modelo, { nome: c.nome, carro: c.carro, placa: c.placa, servico: c.servico });
    linhas.push({ c, corpo });
  }
  for (const { c, corpo } of linhas) {
    const criado = await D.enfileirar({
      cliente_id: c.cliente_id, telefone: c.telefone, nome: c.nome, tipo: 'campanha', corpo, enviar_em: enviarEm, chave_unica: c.chave_unica,
      criado_por: criador?.nome || null, criado_por_id: criador?.id || null, lote, orcamento_id: c.orcamento_id,
      expira_em: new Date(new Date(enviarEm).getTime() + 72 * 3600000).toISOString(),
    });
    if (criado) enfileirados++; else repetidos++;
  }
  return { enfileirados, repetidos };
}

/** Na hora de sair: o cliente já recebeu um orçamento novo (enviado ou aprovado) depois do recusado? Então a reabordagem sobra. */
export async function orcamentoNovoDepois(telefone, desdeIso) {
  const t = D.telefoneNacional(telefone);
  if (!t || t.length < 10) return null;
  const lista = await selecionar('orc_orcamentos', `select=id,numero,status,cliente_telefone,created_at&status=in.(enviado,aprovado)&created_at=gte.${encodeURIComponent(desdeIso)}&limit=300`).catch(() => []);
  return lista.find((o) => D.telefoneNacional(o.cliente_telefone) === t) || null;
}

// ============================================================================
// FILA DE VERDADE PARA O PÁTIO (e para quem mais precisar)
// ============================================================================
export async function filaPorOrdem(osIds = null, horas = 48) {
  const ids = Array.isArray(osIds) ? osIds.filter((i) => uuidOuNulo7(i)).slice(0, 300) : null;
  const r = await rpc('r7_c5_fila_do_patio', { p_os: ids && ids.length ? ids : null, p_horas: Math.min(Math.max(Number(horas) || 48, 1), 168) });
  return r && typeof r === 'object' ? r : { versao: 'r7', na_fila: 0, ordens: {} };
}

// ============================================================================
// ANTI-SPAM
// ============================================================================
/** Quantas campanhas cada telefone recebeu (ou tem na fila) nos últimos 30 dias: Map(telefone nacional → n). */
export async function campanhasRecebidas30d(telefones = []) {
  const tels = [...new Set(telefones.map(D.telefoneNacional).filter((t) => t && t.length >= 10))];
  const mapa = new Map();
  const desde = encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString());
  for (const parte of em60(tels)) {
    for (const e of await selecionar(ENVIOS, `select=telefone_e164&tipo=in.(campanha,area_cliente)&status=in.(enviado,pendente)&created_at=gte.${desde}&telefone_e164=in.(${aspas(parte)})`).catch(() => [])) {
      mapa.set(e.telefone_e164, (mapa.get(e.telefone_e164) || 0) + 1);
    }
  }
  return mapa;
}

/** Telefones que já falharam por "número inválido / sem WhatsApp" (último ano): nunca mais tentar. */
export async function numerosRuins(telefones = []) {
  const tels = [...new Set(telefones.map(D.telefoneNacional).filter((t) => t && t.length >= 10))];
  const ruins = new Set();
  const desde = encodeURIComponent(new Date(Date.now() - 365 * 86400000).toISOString());
  for (const parte of em60(tels)) {
    for (const e of await selecionar(ENVIOS, `select=telefone_e164&status=eq.falhou&erro_classe=eq.numero_invalido&created_at=gte.${desde}&telefone_e164=in.(${aspas(parte)})`).catch(() => [])) ruins.add(e.telefone_e164);
  }
  return ruins;
}

/** Mensagens iguais enviadas/na fila para o mesmo número nos últimos minutos (duplo clique na avulsa). */
export async function envioIgualRecente(telefone, corpo, minutos = 10) {
  const t = D.telefoneNacional(telefone);
  if (!t || !(minutos > 0)) return null;
  const desde = encodeURIComponent(new Date(Date.now() - minutos * 60000).toISOString());
  const lista = await selecionar(ENVIOS, `select=telefone,corpo,created_at&telefone_e164=eq.${t}&status=in.(enviado,pendente)&created_at=gte.${desde}&limit=20`).catch(() => []);
  return r7.ehMensagemDuplicada({ telefone, corpo, recentes: lista.map((e) => ({ telefone: e.telefone, corpo: e.corpo, quando: Date.parse(e.created_at) })), minutos });
}

/**
 * Freio automático: campanha recente em que muita gente pediu PARAR → cancela o que falta, marca o lote e chama os gestores.
 * Roda no começo de cada rodada do carteiro. Devolve os lotes freados.
 */
export async function avaliarFreios(cfg) {
  const pct = Number(cfg?.freio_optout_pct);
  if (!(pct > 0)) return [];
  const desde = encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString());
  const lotes = await selecionar(LOTES, `select=lote,modelo,criado_por_id,criado_por_nome,created_at&freado_em=is.null&created_at=gte.${desde}&order=created_at.desc&limit=30`).catch(() => []);
  const freados = [];
  for (const l of lotes) {
    const [enviadas, pararam] = await Promise.all([
      contar(ENVIOS, `lote=eq.${l.lote}&status=eq.enviado`).catch(() => 0),
      contar(ENVIOS, `lote=eq.${l.lote}&resposta_tipo=eq.parar`).catch(() => 0),
    ]);
    const f = r7.freioDaCampanha({ enviadas, pararam, minEnvios: cfg.freio_min_envios, pct });
    if (!f.freiar) continue;
    const cancelados = await D.cancelarLote(l.lote).catch(() => 0);
    await atualizarUm(LOTES, `lote=eq.${l.lote}`, { freado_em: new Date().toISOString(), freio_motivo: f.motivo }).catch(() => null);
    freados.push({ lote: l.lote, ...f, cancelados, enviadas, pararam });
    const alvos = new Set([...(await D.gestores().catch(() => [])), ...(uuidOuNulo7(l.criado_por_id) ? [l.criado_por_id] : [])]);
    for (const perfil of alvos) {
      await D.notificar({
        perfil, tipo: 'campanha_freada', titulo: 'Campanha parada sozinha: muita gente pediu para parar',
        corpo: `${f.motivo}. ${cancelados} mensagens que faltavam foram canceladas. Texto: "${String(l.modelo).replace(/\s+/g, ' ').slice(0, 80)}…"`,
        link: '?tela=campanhas', chave: `freio:${l.lote}`,
      }).catch(() => null);
    }
    await D.auditar(null, 'campanha_freada', ENVIOS, l.lote, { enviadas, pararam, cancelados, taxa: f.taxa }).catch(() => null);
  }
  return freados;
}

/** Os números do painel anti-spam (30 dias). */
export async function antispam() {
  const cfg = await D.obterConfig();
  const desde = encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString());
  const [enviadas30, pararam30, freios, voltaram30, pulados] = await Promise.all([
    contar(ENVIOS, `status=eq.enviado&enviado_em=gte.${desde}`).catch(() => 0),
    contar(ENVIOS, `resposta_tipo=eq.parar&respondido_em=gte.${desde}`).catch(() => 0),
    contar(LOTES, `freado_em=gte.${desde}`).catch(() => 0),
    contar('clientes', `aceita_mensagens=is.true&aceita_mensagens_motivo=like.${encodeURIComponent('voltou pelo WhatsApp*')}&aceita_mensagens_em=gte.${desde}`).catch(() => 0),
    selecionar(ENVIOS, `select=motivo_pulado&status=eq.pulado&created_at=gte.${desde}&limit=2000`).catch(() => []),
  ]);
  const barrados = { pediu_para_parar: 0, numero_ruim: 0, texto_repetido: 0, teto_campanhas: 0, passou_da_hora: 0, outros: 0 };
  for (const p of pulados) {
    const m = String(p.motivo_pulado || '').toLowerCase();
    if (/pediu para n|pediu para parar/.test(m)) barrados.pediu_para_parar++;
    else if (/n[uú]mero n[aã]o recebe|n[uú]mero (inv|ruim)|sem whatsapp/.test(m)) barrados.numero_ruim++;
    else if (/mesmo texto/.test(m)) barrados.texto_repetido++;
    else if (/campanha/.test(m) && /teto|[uú]ltimos 30/.test(m)) barrados.teto_campanhas++;
    else if (/passou da hora|perdeu o sentido|tempo demais/.test(m)) barrados.passou_da_hora++;
    else barrados.outros++;
  }
  return { ...r7.resumoAntispam({ enviadas30, pararam30, barrados, freios, voltaram30 }), config: {
    rodape_parar: cfg.rodape_parar, max_campanhas_30d: cfg.max_campanhas_30d, freio_optout_pct: cfg.freio_optout_pct, freio_min_envios: cfg.freio_min_envios,
    marketing_fim: cfg.marketing_fim, validar_celular: cfg.validar_celular, max_mensagens_cliente_dia: cfg.max_mensagens_cliente_dia,
  } };
}

// ============================================================================
// QUANDO CADA MENSAGEM SAI DE VERDADE (prévia exata, agenda por hora)
// ============================================================================
const CAMPOS_SIM = 'id,tipo,telefone,nome,corpo,enviar_em,expira_em,motivo_pulado';
async function filaPendente(limite = 3000) {
  const p = new URLSearchParams(`select=${CAMPOS_SIM}`);
  p.set('status', 'eq.pendente'); p.set('order', 'enviar_em.asc'); p.set('limit', String(limite + 1));
  const lida = await selecionar(ENVIOS, p);
  return { fila: lida.slice(0, limite), cortada: lida.length > limite };
}
async function contextoDaSimulacao(cfg) {
  const [enviadasHoje, enviadasUltimaHora] = await Promise.all([D.enviadasHoje().catch(() => 0), D.enviadasNaUltimaHora().catch(() => 0)]);
  return { agora: Date.now(), cfg, feriado: D.feriado, enviadasHoje, enviadasUltimaHora };
}
/** Retomada em curso? { desde, jaSairam } ou null. */
async function retomadaEmCurso(cfg) {
  if (cfg.retomada_gradual === false || cfg.whatsapp?.estado !== 'ok' || !cfg.whatsapp?.em || !conexoes.QUEDAS_SERIAS.includes(cfg.whatsapp?.anterior)) return null;
  const desde = Date.parse(cfg.whatsapp.em);
  if (!Number.isFinite(desde) || Date.now() - desde >= 120 * 60000) return null;
  return { desde, jaSairam: await D.enviadasDesde(cfg.whatsapp.em).catch(() => 0) };
}

/** Um ou mais envios da fila com a hora EXATA em que saem (e o texto final, com o rodapé PARAR). */
export async function quandoSai(ids = []) {
  const cfg = await D.obterConfig();
  const { fila, cortada } = await filaPendente();
  const ctx = await contextoDaSimulacao(cfg);
  const ret = await retomadaEmCurso(cfg);
  const sim = r7.simularSaidas(fila, { ...ctx, retomada: ret ? { desde: ret.desde, max30: cfg.retomada_max_30min, max120: cfg.retomada_max_2h, jaSairam: ret.jaSairam, soEssencial: cfg.retomada_so_essencial } : null });
  const h = D.hoje();
  const saida = {};
  for (const id of ids) {
    const s = sim.saidas.get(id);
    const e = fila.find((x) => x.id === id);
    saida[id] = s ? { sai_em: s.saiEm, rotulo: r7.rotuloDeSaida(s.saiEm, h), posicao: s.posicao, dia: s.dia }
      : { sai_em: null, rotulo: e ? (sim.sem.find((x) => x.id === id)?.motivo || 'fora da simulação') : 'não está mais na fila', posicao: null };
  }
  return { saidas: saida, cortada, simulado: true, aviso: 'Estimativa com as regras de hoje (limites, janela, feriado). Se algo mudar na fila ou no WhatsApp, a hora muda.' };
}

/**
 * Prévia EXATA: roda as réguas em modo simulação (nada é gravado), junta com o que já está na fila e diz, para CADA mensagem,
 * o texto final (com o rodapé) e quando ela sai de verdade.
 */
export async function previaExata({ so = null, incluirFila = false } = {}) {
  const cfg = await D.obterConfig();
  const gerado = await D.gerarTudo({ cfg, simular: true, so });
  const novas = (gerado.previa || []).map((p, i) => ({ id: `previa-${i}`, tipo: p.tipo, telefone: p.telefone, nome: p.nome, corpo: p.corpo, enviar_em: p.enviar_em || new Date().toISOString(), expira_em: p.expira_em || null, nova: true }));
  const { fila: existentes } = incluirFila ? await filaPendente(1500) : { fila: [] };
  const junto = [...existentes.map((e) => ({ ...e, nova: false })), ...novas];
  const ctx = await contextoDaSimulacao(cfg);
  const ret = await retomadaEmCurso(cfg);
  const sim = r7.simularSaidas(junto, { ...ctx, retomada: ret ? { desde: ret.desde, max30: cfg.retomada_max_30min, max120: cfg.retomada_max_2h, jaSairam: ret.jaSairam, soEssencial: cfg.retomada_so_essencial } : null });
  const h = D.hoje();
  const linhas = novas.map((n) => {
    const s = sim.saidas.get(n.id);
    const final = r7.aplicarRodape(n.corpo, n.tipo, cfg).corpo;
    return {
      tipo: n.tipo, rotulo: D.ROTULO_TIPO[n.tipo] || n.tipo, nome: n.nome, telefone: n.telefone, corpo: final, rodape: final !== n.corpo,
      sai_em: s?.saiEm || null, rotulo_saida: s ? r7.rotuloDeSaida(s.saiEm, h) : (sim.sem.find((x) => x.id === n.id)?.motivo || 'não cabe nos próximos dias'), dia: s?.dia || null,
    };
  }).sort((a, b) => String(a.sai_em || '9').localeCompare(String(b.sai_em || '9')));
  const porDia = {};
  for (const l of linhas) if (l.dia) porDia[l.dia] = (porDia[l.dia] || 0) + 1;
  return {
    simulado: true, total: linhas.length, porDia, linhas: linhas.slice(0, 200), cortada: linhas.length > 200,
    puladas: (gerado.puladosDetalhe || []).slice(0, 100), adiadas: (gerado.adiadosDetalhe || []).slice(0, 100), erros: gerado.erros || [], porRegua: gerado.porRegua,
    naFilaJunto: existentes.length, aviso: 'Nada foi gravado nem enviado. A hora é a das regras de hoje: janela, limites, feriado, teto por cliente e rodapé PARAR.',
  };
}

/** A agenda de HOJE (ou de um dia) por hora cheia: quantas saem e de que tipo, no ritmo real do carteiro. */
export async function agendaPorHora(dia = null) {
  const cfg = await D.obterConfig();
  const { fila, cortada } = await filaPendente();
  const ctx = await contextoDaSimulacao(cfg);
  const ret = await retomadaEmCurso(cfg);
  const sim = r7.simularSaidas(fila, { ...ctx, retomada: ret ? { desde: ret.desde, max30: cfg.retomada_max_30min, max120: cfg.retomada_max_2h, jaSairam: ret.jaSairam, soEssencial: cfg.retomada_so_essencial } : null });
  const alvo = conexoes.diaValido(dia) || D.hoje();
  const dias = {};
  for (const s of sim.saidas.values()) dias[s.dia] = (dias[s.dia] || 0) + 1;
  return { dia: alvo, horas: r7.saidasPorHora(fila, sim.saidas, alvo), total: dias[alvo] || 0, dias, naoCabem: sim.sem.length, cortada, na_fila: fila.length };
}

// ============================================================================
// RETOMADA DO WHATSAPP
// ============================================================================
export async function planoRetomadaDados() {
  const cfg = await D.obterConfig();
  const { fila, cortada } = await filaPendente();
  const agora = Date.now();
  const ret = await retomadaEmCurso(cfg);
  const emQueda = conexoes.QUEDAS_SERIAS.includes(cfg.whatsapp?.estado);
  const ctx = await contextoDaSimulacao(cfg);
  const plano = r7.planoDeRetomada(fila, { cfg, agora, desde: ret?.desde ?? agora, jaSairam: ret?.jaSairam ?? 0, feriado: D.feriado, enviadasHoje: ctx.enviadasHoje, enviadasUltimaHora: ctx.enviadasUltimaHora });
  const sem = r7.planoDeRetomada(fila, { cfg: { ...cfg, retomada_gradual: false }, agora, desde: agora, feriado: D.feriado, enviadasHoje: ctx.enviadasHoje, enviadasUltimaHora: ctx.enviadasUltimaHora });
  return {
    estado: cfg.whatsapp, emQueda, retomadaAtiva: !!ret, desde: ret ? new Date(ret.desde).toISOString() : null, jaSairam: ret?.jaSairam ?? 0,
    limites: { max30: cfg.retomada_max_30min, max120: cfg.retomada_max_2h, soEssencial: cfg.retomada_so_essencial, ligada: cfg.retomada_gradual },
    plano, semRetomada: { primeiraMeiaHora: sem.primeiraMeiaHora, ultimaSaida: sem.ultimaSaida, dias: sem.dias },
    triagem: r7.triarFila(fila, agora).map(({ ids_perderam, ...g }) => g), fila: fila.length, cortada,
  };
}

/** Cancela, por tipo, o que perdeu o sentido na fila acumulada (ou tudo daquele tipo). Devolve quantas. */
export async function aplicarTriagem({ tipos = [], soPerderam = true } = {}) {
  const { fila } = await filaPendente();
  const grupos = r7.triarFila(fila);
  const escolhidos = new Set(tipos.filter((t) => D.TIPOS_ENVIO.includes(t)));
  const ids = [];
  for (const g of grupos) {
    if (!escolhidos.has(g.tipo)) continue;
    if (soPerderam) ids.push(...g.ids_perderam);
    else ids.push(...fila.filter((e) => e.tipo === g.tipo).map((e) => e.id));
  }
  let cancelados = 0;
  for (const parte of em60(ids)) {
    const r = await atualizar(ENVIOS, `status=eq.pendente&enviando_em=is.null&id=in.(${parte.join(',')})&select=id`, { status: 'cancelado', motivo_pulado: 'triagem da fila depois da queda do WhatsApp' });
    cancelados += r.length;
  }
  return { cancelados, tipos: [...escolhidos] };
}

/** Solta tudo: encerra a retomada gradual de agora (o João decide que o WhatsApp está firme). */
export async function encerrarRetomada() {
  await atualizarUm('posvenda_config', 'id=is.true', { whatsapp_estado_anterior: null });
  return { ok: true };
}

/** Avisa os gestores uma vez por queda e uma vez por volta, com o tamanho da fila e o plano. */
export async function avisarWhatsapp(cfg) {
  const w = cfg?.whatsapp || {};
  if (!w.em || !w.estado) return null;
  const pendentes = await D.contarPendentes().catch(() => 0);
  let tipo, titulo, corpo;
  if (conexoes.QUEDAS_SERIAS.includes(w.estado)) {
    if (!pendentes) return null;
    tipo = 'whatsapp_caiu'; titulo = 'WhatsApp parou: as mensagens estão esperando';
    corpo = `${pendentes} mensagem(ns) na fila. ${String(w.motivo || 'Confira a chave e o aparelho no Atendimento').slice(0, 140)}. Nada se perde: o que perder o sentido é descartado sozinho.`;
  } else if (w.estado === 'ok' && conexoes.QUEDAS_SERIAS.includes(w.anterior)) {
    tipo = 'whatsapp_voltou'; titulo = 'O WhatsApp voltou: a fila sai devagar de propósito';
    corpo = `${pendentes} mensagem(ns) esperando. Nos primeiros 30 min saem no máximo ${cfg.retomada_max_30min} e, até 2 h, ${cfg.retomada_max_2h}${cfg.retomada_so_essencial ? ' (campanhas esperam)' : ''}. Veja o plano em Mensagens › Retomada.`;
  } else return null;
  const gs = await D.gestores().catch(() => []);
  let n = 0;
  for (const perfil of gs) {
    const id = await D.notificar({ perfil, tipo, titulo, corpo, link: '?tela=mensagens&retomada=1', chave: `${tipo}:${w.em}` }).catch(() => null);
    if (id) n++;
  }
  return { tipo, avisados: n };
}

// ============================================================================
// RESULTADOS AVANÇADOS
// ============================================================================
/** Melhor horário, tempo de resposta, comparação com o período anterior e A/B — sobre as mensagens enviadas no período. */
export async function resultadosAvancados({ de = null, ate = null, tipo = null } = {}) {
  const h = D.hoje();
  const dIni = D.dataBanco(de) || D.somarDias(h, -30), dFim = D.dataBanco(ate) || h;
  const dias = Math.max(1, Math.round((Date.parse(`${dFim}T12:00:00Z`) - Date.parse(`${dIni}T12:00:00Z`)) / 86400000) + 1);
  const ant = { de: D.somarDias(dIni, -dias), ate: D.somarDias(dIni, -1) };
  const colunas = 'id,tipo,enviado_em,respondido_em,agendou_depois_id,resposta_tipo,lote,criado_por';
  const busca = async (a, b) => {
    const p = new URLSearchParams(`select=${colunas}`);
    p.set('status', 'eq.enviado');
    p.append('enviado_em', `gte.${D.instanteSP(a, '00:00').toISOString()}`);
    p.append('enviado_em', `lt.${D.instanteSP(D.somarDias(b, 1), '00:00').toISOString()}`);
    if (tipo && tipo !== 'todas') p.set('tipo', `eq.${tipo}`);
    return (await selecionarTudo(ENVIOS, p)).filter((e) => e.criado_por !== 'teste');
  };
  const [atual, anterior, lotes] = await Promise.all([busca(dIni, dFim), busca(ant.de, ant.ate), listarLotes(200).catch(() => [])]);
  const resumo = (l) => ({ enviadas: l.length, responderam: l.filter((e) => e.respondido_em).length, agendaram: l.filter((e) => e.agendou_depois_id).length, pararam: l.filter((e) => e.resposta_tipo === 'parar').length });
  const a = resumo(atual), b = resumo(anterior);
  const porLote = new Map();
  for (const e of atual) if (e.lote) { const x = porLote.get(e.lote) || []; x.push(e); porLote.set(e.lote, x); }
  const info = new Map(lotes.map((l) => [l.lote, l]));
  const ab = new Map();
  for (const [lote, l] of info) if (l.ab_grupo && porLote.has(lote)) { const g = ab.get(l.ab_grupo) || {}; g[l.variante || '?'] = { lote, modelo: l.modelo, ...resumo(porLote.get(lote)) }; ab.set(l.ab_grupo, g); }
  return {
    periodo: { de: dIni, ate: dFim }, anterior: ant,
    comparacao: {
      enviadas: r7.compararPeriodos(a.enviadas, b.enviadas), responderam: r7.compararPeriodos(a.responderam, b.responderam),
      agendaram: r7.compararPeriodos(a.agendaram, b.agendaram), pararam: r7.compararPeriodos(a.pararam, b.pararam),
    },
    atual: a, anteriorTotais: b,
    tempoMedianoRespostaMin: r7.tempoMedianoDeResposta(atual),
    melhorHorario: r7.melhorHorario(atual),
    ab: [...ab.entries()].map(([grupo, v]) => ({ grupo, ...v, decisao: v.A && v.B ? r7.compararAB(v.A, v.B) : null })),
    ranking: [...porLote.entries()].map(([lote, l]) => ({ lote, ...resumo(l), taxaResposta: l.length ? Math.round((resumo(l).responderam / l.length) * 1000) / 10 : 0, modelo: info.get(lote)?.modelo?.slice(0, 90) || null, quando: l[0]?.enviado_em }))
      .filter((x) => x.enviadas >= 5).sort((x, y) => y.taxaResposta - x.taxaResposta).slice(0, 8),
  };
}

/** Respostas de clientes a campanhas e réguas que a equipe ainda não atendeu (conversa sem saída depois da resposta). */
export async function respostasPendentesDeAtendimento({ horas = 2 } = {}) {
  const desde = encodeURIComponent(new Date(Date.now() - 72 * 3600000).toISOString());
  const envios = await selecionar(ENVIOS, `select=id,nome,telefone,telefone_e164,tipo,resposta,resposta_tipo,respondido_em,intencao,conversa_id&respondido_em=gte.${desde}&resposta_tipo=neq.parar&order=respondido_em.desc&limit=200`).catch(() => []);
  const tels = [...new Set(envios.map((e) => D.telefoneNacional(e.telefone)).filter(Boolean))];
  const conversas = new Map();
  for (const parte of em60(tels)) {
    const mensagens = await selecionar('whatsapp_mensagens', `select=telefone_e164,direcao,created_at,conversa_id&telefone_e164=in.(${aspas(parte)})&direcao=eq.saida&created_at=gte.${desde}&order=created_at.desc&limit=500`).catch(() => []);
    for (const m of mensagens) if (!conversas.has(m.telefone_e164)) conversas.set(m.telefone_e164, { id: m.conversa_id, ultimaSaidaEm: m.created_at });
  }
  return r7.respostasSemAtender(envios, conversas, { horas });
}

/** O cliente marcou um horário (que não foi cancelado nem falta) DEPOIS de `desdeIso`? — pelo cadastro ou pelo telefone. */
export async function agendamentoDepois(telefone, clienteId, desdeIso) {
  const t = D.telefoneNacional(telefone);
  const d = encodeURIComponent(desdeIso || new Date(Date.now() - 86400000).toISOString());
  const ou = [];
  if (uuidOuNulo7(clienteId)) ou.push(`cliente_id.eq.${clienteId}`);
  if (t && t.length >= 10) ou.push(`telefone_e164.eq.${t}`);
  if (!ou.length) return false;
  const lista = await selecionar('agendamentos', `select=id,status&created_at=gt.${d}&status=not.in.(cancelado,nao_veio)&or=(${ou.join(',')})&limit=1`);
  return lista.length > 0;
}

// ============================================================================
// ANTECIPAR E EXPORTAR A AGENDA
// ============================================================================
/** Traz uma mensagem da fila para a próxima rodada (só pendente, que ainda não foi pega pelo carteiro e não venceu). */
export async function anteciparEnvio(id) {
  if (!uuidOuNulo7(id)) return { ok: false, erro: 'Mensagem inválida.' };
  const e = await selecionarUm(ENVIOS, `select=id,status,enviando_em,expira_em,tipo,enviar_em&id=eq.${id}`);
  if (!e) return { ok: false, erro: 'Mensagem não encontrada.', status: 404 };
  if (e.status !== 'pendente' || e.enviando_em) return { ok: false, erro: 'Só dá para antecipar mensagem que ainda está esperando na fila.', status: 409 };
  if (e.expira_em && Date.parse(e.expira_em) < Date.now()) return { ok: false, erro: 'Essa mensagem já passou da validade.', status: 409 };
  const agora = new Date().toISOString();
  if (Date.parse(e.enviar_em) <= Date.now()) return { ok: true, quando: e.enviar_em, ja: true };
  await atualizarUm(ENVIOS, `id=eq.${id}&status=eq.pendente&enviando_em=is.null`, { enviar_em: agora, motivo_pulado: null });
  return { ok: true, quando: agora };
}

/** A agenda da fila inteira em planilha: cada mensagem, o texto final e a hora em que sai (estimada). */
export async function agendaCsv() {
  const cfg = await D.obterConfig();
  const { fila } = await filaPendente(3000);
  const ctx = await contextoDaSimulacao(cfg);
  const ret = await retomadaEmCurso(cfg);
  const sim = r7.simularSaidas(fila, { ...ctx, retomada: ret ? { desde: ret.desde, max30: cfg.retomada_max_30min, max120: cfg.retomada_max_2h, jaSairam: ret.jaSairam, soEssencial: cfg.retomada_so_essencial } : null });
  const linhas = fila.map((e) => ({ ...e, sai: sim.saidas.get(e.id)?.saiEm || null, motivo: sim.sem.find((x) => x.id === e.id)?.motivo || '' }))
    .sort((a, b) => String(a.sai || '9').localeCompare(String(b.sai || '9')));
  return D.paraCSV(linhas, [
    { rotulo: 'Sai em (estimado)', valor: (e) => (e.sai ? new Date(e.sai).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '') },
    { rotulo: 'Tipo', valor: (e) => D.ROTULO_TIPO[e.tipo] || e.tipo },
    { rotulo: 'Cliente', campo: 'nome' }, { rotulo: 'Telefone', campo: 'telefone' },
    { rotulo: 'Mensagem (com rodapé)', valor: (e) => r7.aplicarRodape(e.corpo, e.tipo, cfg).corpo },
    { rotulo: 'Não cabe porque', campo: 'motivo' },
  ]);
}
