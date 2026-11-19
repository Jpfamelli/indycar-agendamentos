/* ============================================================
   Coletor do Google Ads — API oficial (GAQL via searchStream).
   Autentica trocando o refresh_token por um access_token de curta
   duração; o refresh_token é obtido uma vez, no consentimento OAuth.
   ============================================================ */
'use strict';

const VERSAO = process.env.GOOGLE_ADS_API_VERSION || 'v18';
const BASE = `https://googleads.googleapis.com/${VERSAO}`;

const so = v => String(v || '').replace(/\D/g, '');   // customer id vai sem hífen

/* Cache do access_token: ele vale ~1h e cada sync faz 3 consultas.
   Sem cache, seriam 3 idas ao servidor de OAuth por rodada.
   O cache é por credencial: trocar o refresh_token na tela não pode
   continuar usando o token da credencial antiga. */
let tokenCache = { chave: null, valor: null, expira: 0 };
const chaveCred = c => `${c.google_client_id || ''}|${String(c.google_refresh_token || '').slice(-12)}`;
const TIMEOUT_MS = 20_000;

async function accessToken(cred) {
  if (tokenCache.valor && tokenCache.chave === chaveCred(cred) && Date.now() < tokenCache.expira) return tokenCache.valor;
  const faltando = ['google_client_id', 'google_client_secret', 'google_refresh_token']
    .filter(k => !cred[k]);
  if (faltando.length) throw new Error(`Google Ads: falta ${faltando.join(', ')}`);

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cred.google_client_id,
      client_secret: cred.google_client_secret,
      refresh_token: cred.google_refresh_token,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OAuth Google ${r.status}: ${corpo.error_description || corpo.error || 'falhou'}`);

  // 60s de folga para não usar um token que vence no meio da chamada.
  tokenCache = { chave: chaveCred(cred), valor: corpo.access_token, expira: Date.now() + (corpo.expires_in - 60) * 1000 };
  return tokenCache.valor;
}

/* Uma consulta por nível. O Google não tem "level=" como o Meta: o nível
   está na tabela do FROM e nos campos selecionados. */
const CONSULTAS = {
  campanha: `
    SELECT segments.date, campaign.id, campaign.name, campaign.status,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '{de}' AND '{ate}' AND metrics.impressions > 0`,
  conjunto: `
    SELECT segments.date, campaign.id, campaign.name,
           ad_group.id, ad_group.name, ad_group.status,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM ad_group
    WHERE segments.date BETWEEN '{de}' AND '{ate}' AND metrics.impressions > 0`,
  anuncio: `
    SELECT segments.date, campaign.id, campaign.name,
           ad_group.id, ad_group.name,
           ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date BETWEEN '{de}' AND '{ate}' AND metrics.impressions > 0`,
};

async function consultar(cred, gaql) {
  const token = await accessToken(cred);
  const cliente = so(cred.google_customer_id);
  if (!cliente) throw new Error('google_customer_id não configurado');
  if (!cred.google_developer_token) throw new Error('google_developer_token não configurado');

  const headers = {
    Authorization: `Bearer ${token}`,
    'developer-token': cred.google_developer_token,
    'Content-Type': 'application/json',
  };
  // Conta gerenciadora (MCC): sem este cabeçalho a API recusa acessar a
  // conta filha, mesmo com o refresh_token correto.
  const gerente = so(cred.google_login_customer_id);
  if (gerente) headers['login-customer-id'] = gerente;

  const r = await fetch(`${BASE}/customers/${cliente}/googleAds:searchStream`, {
    method: 'POST', headers, body: JSON.stringify({ query: gaql }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const det = Array.isArray(corpo) ? corpo[0] : corpo;
    const msg = det?.error?.message || det?.error?.details?.[0]?.errors?.[0]?.message || 'erro desconhecido';
    throw new Error(`Google Ads ${r.status}: ${msg}`);
  }
  // searchStream devolve um array de blocos, cada um com results.
  const blocos = Array.isArray(corpo) ? corpo : [corpo];
  return blocos.flatMap(b => b.results || []);
}

const numero = v => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param {string} nivel 'campanha' | 'conjunto' | 'anuncio'
 * @returns linhas prontas para ads_metricas_dia
 */
async function buscar(cred, nivel, de, ate) {
  const gaql = CONSULTAS[nivel].replace('{de}', de).replace('{ate}', ate);
  const resultados = await consultar(cred, gaql);
  const conta = so(cred.google_customer_id);

  return resultados.map(x => {
    const m = x.metrics || {};
    const anuncio = x.adGroupAd?.ad;
    return {
      plataforma: 'google',
      data: x.segments?.date,
      nivel,
      conta_ext: conta,
      conta_nome: cred.conta_nome || `Google ${conta}`,
      campanha_ext: x.campaign?.id ? String(x.campaign.id) : null,
      campanha_nome: x.campaign?.name || null,
      conjunto_ext: x.adGroup?.id ? String(x.adGroup.id) : null,
      conjunto_nome: x.adGroup?.name || null,
      anuncio_ext: anuncio?.id ? String(anuncio.id) : null,
      anuncio_nome: anuncio?.name || (anuncio?.id ? `Anúncio ${anuncio.id}` : null),
      status: x.adGroupAd?.status || x.adGroup?.status || x.campaign?.status || null,
      impressoes: Math.round(numero(m.impressions)),
      // O Google não expõe alcance/frequência na API padrão de busca.
      // Deixar zero é mais honesto do que inventar impressões/1.
      alcance: 0,
      frequencia: 0,
      cliques: Math.round(numero(m.clicks)),
      gasto: numero(m.costMicros) / 1e6,   // custo vem em micros
      conversoes: numero(m.conversions),
      valor_conversao: numero(m.conversionsValue),
      fonte: 'api',
      atualizado_em: new Date().toISOString(),
    };
  }).filter(l => l.data);
}

/** Consulta mínima só para validar credencial. */
async function testar(cred) {
  const r = await consultar(cred,
    'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1');
  const c = r[0]?.customer || {};
  return { nome: c.descriptiveName, moeda: c.currencyCode, id: c.id };
}

function esquecerToken() { tokenCache = { chave: null, valor: null, expira: 0 }; }

module.exports = { esquecerToken, buscar, testar };
