/* ============================================================
   Coletor da Meta (Facebook / Instagram) — Marketing API (rodada 8, frente T6).
   Lê "insights" com time_increment=1 (uma linha por dia) nos níveis campanha,
   conjunto e anúncio, mais o catálogo (situação, objetivo e miniatura).

   Conferido na documentação oficial em 19/11/2026:
   - versão em vigor da Marketing API: v27.0 (04/11/2026); v26.0 e v25.0 ainda no ar
     (https://developers.facebook.com/docs/marketing-api/overview/versioning).
     Se a conta recusar a versão (código 2635, "unknown/unsupported version"), cai para a anterior.
   - limites: cabeçalhos X-Ad-Account-Usage, X-Business-Use-Case-Usage, X-FB-Ads-Insights-Throttle;
     erros 4, 17, 32, 613, 80000-80014 pedem espera.
   - appsecret_proof = HMAC-SHA256(token, segredo do app) em hexadecimal, quando há segredo.
   - conversas iniciadas = action_type onsite_conversion.messaging_conversation_started_7d.
   Ideias trazidas do Nexus Ads (nexus-ads/supabase/functions/_compartilhado/meta.js, só leitura):
   token no cabeçalho (nunca na URL), paging.next só para o mesmo endereço, novas tentativas, troca de versão.
   O app só LÊ da Meta: não existe função aqui que mude campanha, verba ou anúncio.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

/** Da mais nova para a mais velha. A variável META_API_VERSION, se existir, vai na frente. */
const VERSOES_META = ['v27.0', 'v26.0', 'v25.0'];
const BASE_PADRAO = 'https://graph.facebook.com';
const TETO_PAGINAS = 60;
const ESPERAS_MS = [2_000, 8_000];
const TIMEOUT_MS = 20_000;
const CODIGOS_PASSAGEIROS = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);

const versoes = () => [...new Set([process.env.META_API_VERSION, ...VERSOES_META].filter(Boolean))];
const baseDe = o => String(o.base || process.env.META_GRAPH_URL || BASE_PADRAO).replace(/\/+$/, '');
const esperaPadrao = ms => new Promise(r => setTimeout(r, ms));

/* Conversas, leads e compras: a Meta devolve a mesma coisa em mais de um action_type
   (ex.: conversation_started_7d e total_messaging_connection). Dentro de cada grupo vale o MAIOR;
   os grupos se somam. Somar tudo inflava o número e derrubava o custo por contato pela metade. */
const ACAO_CONVERSA = 'onsite_conversion.messaging_conversation_started_7d';
const ACOES_CONVERSAO = new Set([
  'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead',
  ACAO_CONVERSA, 'onsite_conversion.total_messaging_connection',
  'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.purchase', 'omni_purchase',
]);

const CAMPOS = {
  campanha: ['campaign_id', 'campaign_name'],
  conjunto: ['campaign_id', 'campaign_name', 'adset_id', 'adset_name'],
  anuncio: ['campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name'],
};
const NIVEL_META = { campanha: 'campaign', conjunto: 'adset', anuncio: 'ad' };
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const numero = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

function porTipo(lista) {
  const m = new Map();
  for (const a of lista || []) m.set(a.action_type, (m.get(a.action_type) || 0) + numero(a.value));
  return t => m.get(t) || 0;
}
const comprasDe = v => Math.max(v('omni_purchase'), v('purchase'), v('offsite_conversion.fb_pixel_purchase') + v('onsite_conversion.purchase'));
function conversoesDe(acoes) {
  const v = porTipo(acoes);
  const conversas = Math.max(v(ACAO_CONVERSA), v('onsite_conversion.total_messaging_connection'));
  const leads = Math.max(v('lead'), v('onsite_conversion.lead_grouped') + v('offsite_conversion.fb_pixel_lead'));
  return conversas + leads + comprasDe(v);
}
/** Mantido para quem já usava: soma só os tipos aceitos (sem a regra dos grupos). */
function somarAcoes(lista, tiposAceitos) {
  let total = 0;
  for (const a of lista || []) if (tiposAceitos.has(a.action_type)) total += numero(a.value);
  return total;
}

/* ---------------- pedido HTTP ---------------- */

/** appsecret_proof (hex). Só com o segredo do app DONO do token: segredo de outro app faz a Meta recusar tudo. */
function provaDoSegredo(token, segredo) {
  if (!token || !segredo) return null;
  return crypto.createHmac('sha256', String(segredo)).update(String(token)).digest('hex');
}
const segredoDe = (cred = {}) => cred.meta_app_secret || process.env.META_APP_SECRET || '';

/** Erro da plataforma com código. A mensagem segue o formato antigo ("Meta API 400: … (código 190)"),
    que a tela e o motor já sabem traduzir. Nunca leva o token. */
function erroMeta(status, e = {}) {
  const msg = String(e.message || 'erro desconhecido').replace(/access_token=[^&\s]+/gi, 'access_token=***');
  return Object.assign(new Error(`Meta API ${status}: ${msg}${e.code != null ? ` (código ${e.code})` : ''}`),
    { plataforma: 'meta', status, codigo: e.code ?? null, subcodigo: e.error_subcode ?? null });
}

const pedidoGrandeDemais = e => e?.subcodigo === 1487534 || /reduce the amount of data/i.test(String(e?.message || ''));
const passageiro = e => !pedidoGrandeDemais(e) && (e?.status >= 500 || e?.status === 429 || CODIGOS_PASSAGEIROS.has(Number(e?.codigo))
  || e?.rede === true);

/** A Meta desligou (2635) ou não conhece (2500, "unknown version") esta versão? */
function versaoIndisponivel(e) {
  const m = String(e?.message || '');
  return e?.codigo === 2635 || /deprecated version/i.test(m)
    || (e?.codigo === 2500 && /version|path/i.test(m)) || /unknown version|unsupported version/i.test(m);
}

/** Lê os cabeçalhos de uso e devolve a maior porcentagem e quantos minutos a Meta pede para esperar. */
function lerUso(cabecalhos) {
  const pegar = nome => { try { return JSON.parse(cabecalhos.get(nome) || 'null'); } catch { return null; } };
  const pcts = [];
  let minutos = 0;
  const conta = pegar('x-ad-account-usage');
  if (conta) pcts.push(numero(conta.acc_id_util_pct));
  const insights = pegar('x-fb-ads-insights-throttle');
  if (insights) pcts.push(numero(insights.app_id_util_pct), numero(insights.acc_id_util_pct));
  const app = pegar('x-app-usage');
  if (app) pcts.push(numero(app.call_count), numero(app.total_time), numero(app.total_cputime));
  const negocio = pegar('x-business-use-case-usage');
  if (negocio && typeof negocio === 'object') {
    for (const lista of Object.values(negocio)) for (const u of Array.isArray(lista) ? lista : []) {
      pcts.push(numero(u.call_count), numero(u.total_time), numero(u.total_cputime));
      minutos = Math.max(minutos, numero(u.estimated_time_to_regain_access));
    }
  }
  if (!pcts.length && !minutos) return null;
  return { pct: Math.max(0, ...pcts), minutos };
}
/** Quanto esperar antes da próxima chamada, pelo uso que a Meta informou. */
function pausaPeloUso(uso) {
  if (!uso) return 0;
  if (uso.pct >= 95) return 60_000;
  if (uso.pct >= 75) return 5_000;
  return 0;
}

function semToken(url) {
  try { const u = new URL(url); u.searchParams.delete('access_token'); u.searchParams.delete('appsecret_proof'); return u.toString(); } catch { return url; }
}

async function pedirUmaVez(url, token, o) {
  const f = o.fetch || globalThis.fetch;
  const prova = provaDoSegredo(token, o.segredo);
  const u = new URL(semToken(url));
  if (prova) u.searchParams.set('appsecret_proof', prova);
  let r;
  try {
    r = await f(u.toString(), { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw Object.assign(new Error(`Meta API: sem resposta (${e?.name === 'TimeoutError' ? 'timeout' : 'fetch failed'})`), { plataforma: 'meta', rede: true });
  }
  if (o.estado) o.estado.chamadas = (o.estado.chamadas || 0) + 1;
  const aviso = r.headers.get('x-ad-api-version-warning');
  if (aviso && o.estado) o.estado.aviso_versao = String(aviso).slice(0, 200);
  const uso = lerUso(r.headers);
  if (uso && o.estado) o.estado.uso_pct = Math.max(o.estado.uso_pct || 0, uso.pct);
  const corpo = await r.json().catch(() => null);
  if (!r.ok || !corpo || corpo.error) {
    if (!corpo && r.ok) throw Object.assign(erroMeta(r.status, { message: 'resposta ilegível' }), { rede: true });
    throw Object.assign(erroMeta(r.status, corpo?.error || {}), { uso });
  }
  return { corpo, uso };
}

/** Um pedido com novas tentativas (espera crescente) e respeito ao uso informado pela Meta. */
async function pedir(url, token, o) {
  const esperar = o.esperar || esperaPadrao;
  for (let i = 0; ; i++) {
    try {
      const { corpo, uso } = await pedirUmaVez(url, token, o);
      const pausa = pausaPeloUso(uso);
      if (pausa) { if (o.estado) o.estado.esperas = (o.estado.esperas || 0) + 1; await esperar(pausa); }
      return corpo;
    } catch (e) {
      // A Meta disse quantos minutos esperar: não adianta insistir agora; a próxima rodada tenta.
      if (e.uso?.minutos > 0) e.message += ` · espere ${Math.ceil(e.uso.minutos)} min`;
      if (i >= ESPERAS_MS.length || !passageiro(e) || e.uso?.minutos > 1) throw e;
      if (o.estado) o.estado.tentativas = (o.estado.tentativas || 0) + 1;
      await esperar(ESPERAS_MS[i]);
    }
  }
}

/** Roda `fn(versao)` na versão lembrada e, se a Meta recusar a versão, nas anteriores. */
async function comVersao(o, fn) {
  const ordem = [...new Set([o.versao, ...versoes()].filter(Boolean))];
  let ultimo;
  for (const v of ordem) {
    try {
      const r = await fn(v);
      if (o.estado) o.estado.versao = v;
      return r;
    } catch (e) {
      if (!versaoIndisponivel(e)) throw e;
      ultimo = e;
      if (o.estado) o.estado.versoes_recusadas = [...(o.estado.versoes_recusadas || []), v];
    }
  }
  throw ultimo;
}

/** Só segue paging.next que fica no mesmo endereço da Graph (o token vai junto). */
function proximaPagina(next, base) {
  if (!next) return null;
  try {
    const u = new URL(String(next));
    if (u.origin !== new URL(base).origin) return null;
    return semToken(u.toString());
  } catch { return null; }
}

async function paginas(urlInicial, token, o, base) {
  const itens = [];
  let url = urlInicial, n = 0;
  while (url && n < (o.tetoPaginas || TETO_PAGINAS)) {
    const corpo = await pedir(url, token, o);
    for (const d of corpo.data || []) itens.push(d);
    url = proximaPagina(corpo.paging?.next, base);
    n++;
  }
  if (url && o.estado) o.estado.parcial = true;
  return itens;
}

/* ---------------- leitura ---------------- */

function credDe(cred = {}) {
  const conta = String(cred.meta_ad_account_id || '').trim().replace(/^act_/i, '');
  if (!conta) throw new Error('meta_ad_account_id não configurado');
  if (!cred.meta_access_token) throw new Error('meta_access_token não configurado');
  return { conta, token: String(cred.meta_access_token).trim() };
}
const opcoes = (cred, o = {}) => ({ ...o, segredo: o.segredo ?? segredoDe(cred) });

/**
 * Insights de um nível no período, já no formato de ads_metricas_dia (sem situação e miniatura: vêm do catálogo).
 * @param {object} cred  linha de integracoes_ads
 * @param {'campanha'|'conjunto'|'anuncio'} nivel
 * @param {string} de, ate  AAAA-MM-DD
 * @param {object} [o]  { fetch, esperar, base, versao, estado }
 */
async function buscar(cred, nivel, de, ate, o = {}) {
  const { conta, token } = credDe(cred);
  if (!CAMPOS[nivel]) throw new Error(`nível desconhecido: ${nivel}`);
  if (!DATA.test(de) || !DATA.test(ate)) throw new Error('período inválido');
  const oo = opcoes(cred, o);
  const base = baseDe(oo);
  const campos = [...CAMPOS[nivel], 'objective', 'impressions', 'reach', 'frequency', 'clicks', 'spend', 'actions', 'action_values', 'date_start'];
  const params = new URLSearchParams({
    level: NIVEL_META[nivel], fields: campos.join(','),
    time_range: JSON.stringify({ since: de, until: ate }), time_increment: '1', limit: '500',
  });
  const brutas = await comVersao(oo, v => paginas(`${base}/${v}/act_${conta}/insights?${params}`, token, oo, base));
  const agora = new Date().toISOString();
  return brutas.filter(d => d.date_start).map(d => {
    const v = porTipo(d.actions);
    return {
      plataforma: 'meta', data: d.date_start, nivel,
      conta_ext: `act_${conta}`, conta_nome: cred.conta_nome || `Meta ${conta}`,
      campanha_ext: d.campaign_id || null, campanha_nome: d.campaign_name || null,
      conjunto_ext: d.adset_id || null, conjunto_nome: d.adset_name || null,
      anuncio_ext: d.ad_id || null, anuncio_nome: d.ad_name || null,
      objetivo: d.objective || null,
      impressoes: Math.round(numero(d.impressions)), alcance: Math.round(numero(d.reach)),
      frequencia: numero(d.frequency), cliques: Math.round(numero(d.clicks)), gasto: numero(d.spend),
      conversoes: conversoesDe(d.actions),
      conversas: v(ACAO_CONVERSA),
      valor_conversao: comprasDe(porTipo(d.action_values)),
      fonte: 'api', atualizado_em: agora,
    };
  });
}

/**
 * Catálogo: situação de campanha, conjunto e anúncio, objetivo da campanha e miniatura do criativo.
 * Devolve { campanhas: Map(id → {status, objetivo}), conjuntos: Map(id → {status}), anuncios: Map(id → {status, miniatura}) }.
 */
async function catalogo(cred, o = {}) {
  const { conta, token } = credDe(cred);
  const oo = opcoes(cred, o);
  const base = baseDe(oo);
  const ler = (aresta, campos, extra = {}) => comVersao(oo, v =>
    paginas(`${base}/${v}/act_${conta}/${aresta}?${new URLSearchParams({ fields: campos, limit: '200', ...extra })}`, token, { ...oo, tetoPaginas: 10 }, base));
  const [camps, conjs, ads] = [
    await ler('campaigns', 'id,name,objective,effective_status'),
    await ler('adsets', 'id,name,effective_status'),
    await ler('ads', 'id,name,effective_status,creative{id,thumbnail_url,image_url}', { thumbnail_width: '320', thumbnail_height: '320' }),
  ];
  const https = u => (typeof u === 'string' && /^https:\/\//i.test(u) ? u.slice(0, 1000) : null);
  return {
    campanhas: new Map(camps.map(c => [String(c.id), { status: c.effective_status || null, objetivo: c.objective || null }])),
    conjuntos: new Map(conjs.map(c => [String(c.id), { status: c.effective_status || null }])),
    anuncios: new Map(ads.map(a => [String(a.id), { status: a.effective_status || null, miniatura: https(a.creative?.thumbnail_url) || https(a.creative?.image_url) }])),
  };
}

/** Põe situação, objetivo e miniatura do catálogo nas linhas (não mexe no que o catálogo não sabe). */
function aplicarCatalogo(linhas, cat) {
  for (const l of linhas) {
    const camp = cat.campanhas.get(String(l.campanha_ext));
    if (camp?.objetivo && !l.objetivo) l.objetivo = camp.objetivo;
    if (l.nivel === 'campanha') l.status = camp?.status ?? null;
    else if (l.nivel === 'conjunto') l.status = cat.conjuntos.get(String(l.conjunto_ext))?.status ?? null;
    else {
      const ad = cat.anuncios.get(String(l.anuncio_ext));
      l.status = ad?.status ?? null;
      l.miniatura_url = ad?.miniatura ?? null;
    }
  }
  return linhas;
}

/** O que o token pode e até quando vale (debug_token). expira_em: 'AAAA-MM-DD' ou null (não vence). */
async function sobreOToken(cred, o = {}) {
  const { token } = credDe({ meta_ad_account_id: 'x', ...cred });
  const oo = opcoes(cred, o);
  const base = baseDe(oo);
  const corpo = await comVersao(oo, v => pedir(`${base}/${v}/debug_token?${new URLSearchParams({ input_token: token })}`, token, oo));
  const d = corpo?.data || {};
  const quando = s => (numero(s) > 0 ? new Date(numero(s) * 1000).toISOString().slice(0, 10) : null);
  const escopos = Array.isArray(d.scopes) ? d.scopes.map(String) : [];
  return {
    valido: d.is_valid !== false,
    tipo: d.type || null,
    expira_em: quando(d.expires_at),
    dados_expiram_em: quando(d.data_access_expires_at),
    escopos,
    pode_ler_anuncios: escopos.includes('ads_read') || escopos.includes('ads_management'),
  };
}

/**
 * Coleta completa de uma conta: catálogo + insights dos níveis pedidos + validade do token.
 * Catálogo e validade são extras: se falharem, os números entram mesmo assim (com aviso).
 */
async function coletar(cred, { de, ate, niveis = ['campanha', 'conjunto', 'anuncio'], ...o } = {}) {
  const estado = o.estado || {};
  const oo = { ...o, estado };
  const avisos = [];
  let cat = null;
  try { cat = await catalogo(cred, oo); } catch (e) { avisos.push(`catálogo: ${e.message}`); }
  const linhas = [];
  for (const nivel of niveis) linhas.push(...await buscar(cred, nivel, de, ate, { ...oo, versao: estado.versao || oo.versao }));
  if (cat) aplicarCatalogo(linhas, cat);
  let token = null;
  try { token = await sobreOToken(cred, { ...oo, versao: estado.versao }); } catch (e) { avisos.push(`validade do acesso: ${e.message}`); }
  return { linhas, termos: [], avisos, token, versao: estado.versao || null };
}

/** Confere se o acesso responde, sem puxar dados. Usado pelo botão "Testar". */
async function testar(cred, o = {}) {
  const { conta, token } = credDe(cred);
  const oo = opcoes(cred, { ...o, estado: o.estado || {} });
  const base = baseDe(oo);
  const r = await comVersao(oo, v => pedir(`${base}/${v}/act_${conta}?${new URLSearchParams({ fields: 'name,account_status,currency,timezone_name' })}`, token, oo));
  let sobre = null;
  try { sobre = await sobreOToken(cred, { ...oo, versao: oo.estado.versao }); } catch { /* opcional */ }
  return {
    nome: r.name || null, moeda: r.currency || null, status: r.account_status ?? null, fuso: r.timezone_name || null,
    versao: oo.estado.versao || null,
    expira_em: sobre?.expira_em || null,
    escopos: sobre?.escopos || null,
    falta_permissao: sobre ? !sobre.pode_ler_anuncios : null,
  };
}

/* Rótulos para a tela (o banco guarda o código da Meta). */
const OBJETIVOS = Object.freeze({
  OUTCOME_ENGAGEMENT: 'Engajamento', OUTCOME_LEADS: 'Contatos', OUTCOME_SALES: 'Vendas', OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_AWARENESS: 'Reconhecimento', OUTCOME_APP_PROMOTION: 'Aplicativo', MESSAGES: 'Mensagens', LEAD_GENERATION: 'Contatos',
  CONVERSIONS: 'Conversões', LINK_CLICKS: 'Cliques', REACH: 'Alcance', BRAND_AWARENESS: 'Reconhecimento', POST_ENGAGEMENT: 'Engajamento',
});
const SITUACOES = Object.freeze({
  ACTIVE: 'ativa', PAUSED: 'pausada', CAMPAIGN_PAUSED: 'pausada', ADSET_PAUSED: 'pausada', DELETED: 'apagada', ARCHIVED: 'arquivada',
  IN_PROCESS: 'em análise', PENDING_REVIEW: 'em análise', WITH_ISSUES: 'com problema', DISAPPROVED: 'reprovada', PENDING_BILLING_INFO: 'falta pagamento',
});

module.exports = {
  VERSOES_META, ACAO_CONVERSA, ACOES_CONVERSAO, OBJETIVOS, SITUACOES, ESPERAS_MS,
  buscar, catalogo, aplicarCatalogo, sobreOToken, coletar, testar,
  conversoesDe, somarAcoes, provaDoSegredo, lerUso, pausaPeloUso, versaoIndisponivel, proximaPagina, erroMeta,
};
