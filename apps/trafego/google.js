/* ============================================================
   Coletor do Google Ads — API oficial, GAQL por searchStream (rodada 8, frente T6).

   Conferido na documentação oficial em 19/11/2026:
   - versão em vigor: v26 (14/10/2026, v26.2 em 11/11/2026); v25 e v24 ainda no ar
     (https://developers.google.com/google-ads/api/docs/sunset-dates). Versão que o servidor não
     conhece responde 404/501: cai para a anterior sozinho.
   - developer token: encerrado em 09/09/2026. "You no longer need a developer token"; mandar o
     cabeçalho é opcional e ignorado, e o Google avisou que vai recusá-lo numa versão futura. Por isso
     este código NÃO manda mais `developer-token` (o que estiver salvo em integracoes_ads é ignorado).
     O nível de acesso agora é do projeto do Google Cloud; projeto só de teste chamando conta real dá
     CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION (v25 em diante).
     (https://developers.google.com/google-ads/api/docs/get-started/dev-token)
   - dois jeitos de entrar, os dois aceitos aqui:
       1. conta de serviço (recomendado pelo Google para conta própria): e-mail da conta de serviço em
          `google_client_id` e a chave privada em `google_client_secret` (a tela aceita o JSON inteiro);
       2. OAuth de usuário único: client id, client secret e refresh token (o que já estava salvo).
   - click_view: "must have a filter limiting the results to one day" e só até 90 dias atrás.
   O app só LÊ do Google: não existe função aqui que mude campanha, verba ou anúncio.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

const VERSOES_GOOGLE = ['v26', 'v25', 'v24'];
const BASE_PADRAO = 'https://googleads.googleapis.com';
const OAUTH_PADRAO = 'https://oauth2.googleapis.com/token';
const ESCOPO = 'https://www.googleapis.com/auth/adwords';
const ESPERAS_MS = [2_000, 8_000];
const TIMEOUT_MS = 20_000;
const DIAS_CLICK_VIEW = 90;
const STATUS_PASSAGEIROS = new Set(['UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED']);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const versoes = () => [...new Set([process.env.GOOGLE_ADS_API_VERSION, ...VERSOES_GOOGLE].filter(Boolean))];
const baseDe = o => String(o.base || process.env.GOOGLE_ADS_API_URL || BASE_PADRAO).replace(/\/+$/, '');
const oauthDe = o => String(o.oauth || process.env.GOOGLE_OAUTH_TOKEN_URL || OAUTH_PADRAO);
const esperaPadrao = ms => new Promise(r => setTimeout(r, ms));
const so = v => String(v || '').replace(/\D/g, '');   // id do cliente vai sem hífen
const numero = v => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : 0; };

/* ---------------- acesso ---------------- */

const ehContaDeServico = c => /\.iam\.gserviceaccount\.com$/i.test(String(c.google_client_id || '').trim())
  && /PRIVATE KEY-----/.test(String(c.google_client_secret || ''));

/** 'conta_servico' | 'oauth' | null (falta coisa). */
function modoDeAcesso(c = {}) {
  if (ehContaDeServico(c)) return 'conta_servico';
  if (c.google_client_id && c.google_client_secret && c.google_refresh_token) return 'oauth';
  return null;
}
/** A linha de integracoes_ads tem acesso completo ao Google (sem exigir o developer token, que acabou)? */
const temAcesso = i => !!(i && so(i.google_customer_id) && modoDeAcesso(i));

/* Token de acesso vale ~1 h; a coleta faz várias consultas. Memória por credencial (pelo resumo, nunca o segredo). */
let tokenCache = { chave: null, valor: null, expira: 0 };
const chaveCred = c => crypto.createHash('sha256').update(`${c.google_client_id || ''}|${c.google_client_secret || ''}|${c.google_refresh_token || ''}`).digest('hex');
function esquecerToken() { tokenCache = { chave: null, valor: null, expira: 0 }; }

const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT assinado (RS256) da conta de serviço, trocado por token de acesso no endereço do OAuth. */
function jwtDaContaDeServico(c, aud, agora = Date.now()) {
  const iat = Math.floor(agora / 1000);
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({ iss: String(c.google_client_id).trim(), scope: ESCOPO, aud, iat, exp: iat + 3600 }));
  const chave = String(c.google_client_secret).replace(/\\n/g, '\n');
  const assinatura = crypto.createSign('RSA-SHA256').update(`${cab}.${corpo}`).sign(chave);
  return `${cab}.${corpo}.${b64url(assinatura)}`;
}

function erroGoogle(prefixo, status, texto, extra = {}) {
  return Object.assign(new Error(`${prefixo} ${status}: ${String(texto || 'erro desconhecido').slice(0, 300)}`), { plataforma: 'google', status, ...extra });
}

async function accessToken(cred, o = {}) {
  const chave = chaveCred(cred);
  if (tokenCache.valor && tokenCache.chave === chave && Date.now() < tokenCache.expira) return tokenCache.valor;
  const modo = modoDeAcesso(cred);
  if (!modo) {
    const falta = ['google_client_id', 'google_client_secret', 'google_refresh_token'].filter(k => !cred[k]);
    throw new Error(`Google Ads: falta ${falta.join(', ') || 'o acesso'}`);
  }
  const url = oauthDe(o);
  const corpo = modo === 'conta_servico'
    ? new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwtDaContaDeServico(cred, url) })
    : new URLSearchParams({ grant_type: 'refresh_token', client_id: cred.google_client_id, client_secret: cred.google_client_secret, refresh_token: cred.google_refresh_token });
  const f = o.fetch || globalThis.fetch;
  const esperar = o.esperar || esperaPadrao;
  let r, j;
  for (let i = 0; ; i++) {
    try {
      r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (i < 1) { await esperar(1_000); continue; }
      throw Object.assign(new Error(`OAuth Google: sem resposta (${e?.name === 'TimeoutError' ? 'timeout' : 'fetch failed'})`), { plataforma: 'google', rede: true });
    }
    if ((r.status >= 500 || r.status === 429) && i < 1) { await esperar(1_000); continue; }
    break;
  }
  j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw erroGoogle('OAuth Google', r.status, j.error_description ? `${j.error}: ${j.error_description}` : j.error || 'falhou', { codigo: j.error || null });
  tokenCache = { chave, valor: j.access_token, expira: Date.now() + (numero(j.expires_in || 3600) - 60) * 1000 };
  return tokenCache.valor;
}

/* ---------------- consulta ---------------- */

/** Tira do erro do Google o código (ex.: CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION) e a mensagem. */
function lerErro(corpo) {
  const det = Array.isArray(corpo) ? corpo[0] : corpo;
  const err = det?.error || {};
  const codigos = [];
  let msgDetalhe = null;
  for (const d of err.details || []) for (const x of d.errors || []) {
    for (const v of Object.values(x.errorCode || {})) codigos.push(String(v));
    if (!msgDetalhe && x.message) msgDetalhe = x.message;
  }
  return { status: err.status || null, codigos, mensagem: msgDetalhe || err.message || null };
}

const versaoNaoExiste = (status, info) => status === 404 || status === 501 || info?.status === 'UNIMPLEMENTED';

async function consultar(cred, gaql, o = {}) {
  const cliente = so(cred.google_customer_id);
  if (!cliente) throw new Error('google_customer_id não configurado');
  const token = await accessToken(cred, o);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Conta gerenciadora (MCC): sem este cabeçalho a API recusa a conta filha.
  const gerente = so(cred.google_login_customer_id);
  if (gerente) headers['login-customer-id'] = gerente;
  const f = o.fetch || globalThis.fetch;
  const esperar = o.esperar || esperaPadrao;
  const estado = o.estado || {};
  const base = baseDe(o);
  const ordem = [...new Set([estado.versao, o.versao, ...versoes()].filter(Boolean))];
  let ultimo = null;
  for (const v of ordem) {
    for (let i = 0; ; i++) {
      let r;
      try {
        r = await f(`${base}/${v}/customers/${cliente}/googleAds:searchStream`, { method: 'POST', headers, body: JSON.stringify({ query: gaql }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        if (i < ESPERAS_MS.length) { estado.tentativas = (estado.tentativas || 0) + 1; await esperar(ESPERAS_MS[i]); continue; }
        throw Object.assign(new Error(`Google Ads: sem resposta (${e?.name === 'TimeoutError' ? 'timeout' : 'fetch failed'})`), { plataforma: 'google', rede: true });
      }
      estado.chamadas = (estado.chamadas || 0) + 1;
      const corpo = await r.json().catch(() => null);
      if (r.ok && corpo) {
        estado.versao = v;
        const blocos = Array.isArray(corpo) ? corpo : [corpo];
        return blocos.flatMap(b => b.results || []);
      }
      const info = lerErro(corpo);
      if (versaoNaoExiste(r.status, info)) { ultimo = erroGoogle('Google Ads', r.status, `versão ${v} indisponível`); estado.versoes_recusadas = [...(estado.versoes_recusadas || []), v]; break; }
      const passageiro = (r.status >= 500 && r.status !== 501) || r.status === 429 || STATUS_PASSAGEIROS.has(info.status);
      if (passageiro && i < ESPERAS_MS.length) { estado.tentativas = (estado.tentativas || 0) + 1; await esperar(ESPERAS_MS[i]); continue; }
      const cod = info.codigos.length ? ` [${info.codigos.join(', ')}]` : (info.status ? ` [${info.status}]` : '');
      throw erroGoogle('Google Ads', r.status, `${info.mensagem || 'erro desconhecido'}${cod}`, { codigos: info.codigos, statusApi: info.status });
    }
  }
  throw ultimo || new Error('Google Ads: nenhuma versão respondeu');
}

/* ---------------- consultas ---------------- */

const periodo = (de, ate) => {
  if (!DATA.test(de) || !DATA.test(ate)) throw new Error('período inválido');
  return `segments.date BETWEEN '${de}' AND '${ate}'`;
};

/* Uma consulta por nível. O nível está na tabela do FROM. */
const CONSULTAS = {
  campanha: w => `SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign WHERE ${w} AND metrics.impressions > 0`,
  conjunto: w => `SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name, ad_group.status,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM ad_group WHERE ${w} AND metrics.impressions > 0`,
  anuncio: w => `SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name,
    ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM ad_group_ad WHERE ${w} AND metrics.impressions > 0`,
};

/** Linhas de ads_metricas_dia de um nível. */
async function buscar(cred, nivel, de, ate, o = {}) {
  if (!CONSULTAS[nivel]) throw new Error(`nível desconhecido: ${nivel}`);
  const resultados = await consultar(cred, CONSULTAS[nivel](periodo(de, ate)), o);
  const conta = so(cred.google_customer_id);
  const agora = new Date().toISOString();
  return resultados.map(x => {
    const m = x.metrics || {};
    const anuncio = x.adGroupAd?.ad;
    const status = nivel === 'anuncio' ? x.adGroupAd?.status : nivel === 'conjunto' ? x.adGroup?.status : x.campaign?.status;
    return {
      plataforma: 'google', data: x.segments?.date, nivel,
      conta_ext: conta, conta_nome: cred.conta_nome || `Google ${conta}`,
      campanha_ext: x.campaign?.id ? String(x.campaign.id) : null, campanha_nome: x.campaign?.name || null,
      conjunto_ext: x.adGroup?.id ? String(x.adGroup.id) : null, conjunto_nome: x.adGroup?.name || null,
      anuncio_ext: anuncio?.id ? String(anuncio.id) : null,
      anuncio_nome: anuncio?.name || (anuncio?.id ? `Anúncio ${anuncio.id}` : null),
      status: status || null,
      objetivo: x.campaign?.advertisingChannelType || null,
      impressoes: Math.round(numero(m.impressions)),
      // O Google não dá alcance/frequência nesta consulta: zero é mais honesto que inventar.
      alcance: 0, frequencia: 0,
      cliques: Math.round(numero(m.clicks)),
      gasto: numero(m.costMicros) / 1e6,     // custo vem em micros
      conversoes: numero(m.conversions),
      valor_conversao: numero(m.conversionsValue),
      fonte: 'api', atualizado_em: agora,
    };
  }).filter(l => l.data);
}

/** Palavras-chave (termo nulo) e termos de busca do período, prontos para ads_termos_dia (já somados pela chave única). */
async function termos(cred, de, ate, o = {}) {
  const w = periodo(de, ate);
  const palavras = await consultar(cred, `SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,
    ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM keyword_view WHERE ${w}`, o);
  const buscas = await consultar(cred, `SELECT segments.date, search_term_view.search_term, campaign.id, campaign.name, ad_group.id, ad_group.name,
    segments.keyword.info.text, segments.keyword.info.match_type,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM search_term_view WHERE ${w}`, o);
  const agora = new Date().toISOString();
  const linha = (x, palavra, corresp, termo) => ({
    plataforma: 'google', data: x.segments?.date,
    campanha_ext: x.campaign?.id ? String(x.campaign.id) : null, campanha_nome: x.campaign?.name || null,
    conjunto_ext: x.adGroup?.id ? String(x.adGroup.id) : null, conjunto_nome: x.adGroup?.name || null,
    palavra_chave: palavra || null, correspondencia: corresp || null, termo: termo == null ? null : String(termo).slice(0, 300),
    impressoes: Math.round(numero(x.metrics?.impressions)), cliques: Math.round(numero(x.metrics?.clicks)),
    gasto: numero(x.metrics?.costMicros) / 1e6, conversoes: numero(x.metrics?.conversions),
    fonte: 'api', atualizado_em: agora,
  });
  const todas = [
    ...palavras.map(x => linha(x, x.adGroupCriterion?.keyword?.text, x.adGroupCriterion?.keyword?.matchType, null)),
    ...buscas.map(x => linha(x, x.segments?.keyword?.info?.text, x.segments?.keyword?.info?.matchType, x.searchTermView?.searchTerm ?? '')),
  ].filter(l => l.data);
  return juntarTermos(todas);
}

/** Soma as linhas que caem na mesma chave única de ads_termos_dia (o upsert não aceita a mesma chave duas vezes no lote). */
function juntarTermos(linhas) {
  const m = new Map();
  for (const l of linhas) {
    const k = JSON.stringify([l.plataforma, l.data, l.campanha_ext, l.conjunto_ext, l.palavra_chave, l.correspondencia, l.termo]);
    const a = m.get(k);
    if (!a) { m.set(k, { ...l }); continue; }
    a.impressoes += l.impressoes; a.cliques += l.cliques; a.gasto += l.gasto; a.conversoes += l.conversoes;
  }
  return [...m.values()];
}

const diaDeHojeBR = (agora = Date.now()) => new Date(agora - 3 * 3600000).toISOString().slice(0, 10);

/**
 * Todos os cliques de UM dia (click_view): gclid → campanha, grupo, anúncio e palavra-chave.
 * Só até 90 dias atrás (regra do Google); um dia por consulta.
 */
async function cliques(cred, dia, o = {}) {
  if (!DATA.test(String(dia))) throw new Error('dia inválido');
  const hoje = diaDeHojeBR(o.agora);
  const dif = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / 86400000);
  if (dif < 0 || dif >= DIAS_CLICK_VIEW) throw Object.assign(new Error(`click_view só alcança os últimos ${DIAS_CLICK_VIEW} dias`), { fora_da_janela: true });
  const r = await consultar(cred, `SELECT click_view.gclid, click_view.keyword_info.text, click_view.keyword_info.match_type, click_view.ad_group_ad,
    campaign.id, campaign.name, ad_group.id, ad_group.name, segments.date
    FROM click_view WHERE segments.date = '${dia}'`, o);
  return r.filter(x => x.clickView?.gclid).map(x => {
    const adRec = String(x.clickView.adGroupAd || '');
    const ad = adRec.includes('~') ? adRec.split('~').pop() : null;
    return {
      gclid: String(x.clickView.gclid), data: x.segments?.date || dia,
      campanha_ext: x.campaign?.id ? String(x.campaign.id) : null, campanha_nome: x.campaign?.name || null,
      conjunto_ext: x.adGroup?.id ? String(x.adGroup.id) : null, conjunto_nome: x.adGroup?.name || null,
      anuncio_ext: ad && /^\d+$/.test(ad) ? ad : null,
      palavra_chave: x.clickView.keywordInfo?.text || null, correspondencia: x.clickView.keywordInfo?.matchType || null,
    };
  });
}

/** Coleta completa de uma conta: os níveis pedidos + palavras e termos (estes são extra: se falharem, entra aviso). */
async function coletar(cred, { de, ate, niveis = ['campanha', 'conjunto', 'anuncio'], ...o } = {}) {
  const estado = o.estado || {};
  const oo = { ...o, estado };
  const linhas = [];
  for (const nivel of niveis) linhas.push(...await buscar(cred, nivel, de, ate, oo));
  const avisos = [];
  let lista = [];
  try { lista = await termos(cred, de, ate, oo); } catch (e) { avisos.push(`palavras e termos: ${e.message}`); }
  return { linhas, termos: lista, avisos, token: null, versao: estado.versao || null };
}

/** Consulta mínima só para validar o acesso. */
async function testar(cred, o = {}) {
  const estado = o.estado || {};
  const r = await consultar(cred, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1', { ...o, estado });
  const c = r[0]?.customer || {};
  return { nome: c.descriptiveName || null, moeda: c.currencyCode || null, id: c.id ? String(c.id) : null, fuso: c.timeZone || null,
    versao: estado.versao || null, acesso: modoDeAcesso(cred) };
}

/* Rótulos para a tela (o banco guarda o código do Google). */
const OBJETIVOS = Object.freeze({
  SEARCH: 'Pesquisa', PERFORMANCE_MAX: 'Máximo desempenho', DISPLAY: 'Display', VIDEO: 'Vídeo', DEMAND_GEN: 'Geração de demanda',
  LOCAL: 'Local', SHOPPING: 'Shopping', SMART: 'Inteligente', MULTI_CHANNEL: 'Vários canais',
});
const SITUACOES = Object.freeze({ ENABLED: 'ativa', PAUSED: 'pausada', REMOVED: 'removida' });

module.exports = {
  VERSOES_GOOGLE, ESCOPO, ESPERAS_MS, DIAS_CLICK_VIEW, OBJETIVOS, SITUACOES,
  esquecerToken, modoDeAcesso, temAcesso, jwtDaContaDeServico, lerErro,
  consultar, buscar, termos, juntarTermos, cliques, coletar, testar,
};
