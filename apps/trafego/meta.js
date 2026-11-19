/* ============================================================
   Coletor do Meta Ads (Facebook / Instagram) — Marketing API.
   Lê "insights" com time_increment=1, ou seja, uma linha por dia,
   nos três níveis: campanha, conjunto e anúncio.
   ============================================================ */
'use strict';

const VERSAO = process.env.META_API_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${VERSAO}`;

/* Ações que contam como conversão para uma oficina. O Meta devolve dezenas
   de tipos (view_content, page_engagement...); somar tudo infla o número e
   estraga o CPA. Aqui ficam só as que representam alguém querendo atendimento. */
const ACOES_CONVERSAO = new Set([
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_conversion.purchase',
]);

/* Valor monetário: só compra. Conversa iniciada não tem valor associado. */
const ACOES_VALOR = new Set([
  'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.purchase',
  'omni_purchase',
]);

const CAMPOS = {
  campanha: ['campaign_id', 'campaign_name'],
  conjunto: ['campaign_id', 'campaign_name', 'adset_id', 'adset_name'],
  anuncio:  ['campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name'],
};

const NIVEL_META = { campanha: 'campaign', conjunto: 'adset', anuncio: 'ad' };

const numero = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Soma as ações do tipo desejado dentro do array que o Meta devolve. */
function somarAcoes(lista, tiposAceitos) {
  let total = 0;
  for (const a of lista || []) if (tiposAceitos.has(a.action_type)) total += numero(a.value);
  return total;
}

async function pedir(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = corpo?.error || {};
    // O erro do Meta traz o motivo em error.message; sem isso o operador
    // só vê "400" e não sabe se é token vencido ou conta sem permissão.
    throw new Error(`Meta API ${r.status}: ${e.message || 'erro desconhecido'}${e.code ? ` (código ${e.code})` : ''}`);
  }
  return corpo;
}

/**
 * Busca os insights de um nível e devolve linhas prontas para ads_metricas_dia.
 * @param {object} cred  linha de integracoes_ads
 * @param {string} nivel 'campanha' | 'conjunto' | 'anuncio'
 * @param {string} de/ate  datas YYYY-MM-DD
 */
async function buscar(cred, nivel, de, ate) {
  const conta = String(cred.meta_ad_account_id || '').replace(/^act_/, '');
  if (!conta) throw new Error('meta_ad_account_id não configurado');
  if (!cred.meta_access_token) throw new Error('meta_access_token não configurado');

  const campos = [
    ...CAMPOS[nivel],
    'impressions', 'reach', 'frequency', 'clicks', 'spend',
    'actions', 'action_values', 'date_start',
  ];

  const params = new URLSearchParams({
    level: NIVEL_META[nivel],
    fields: campos.join(','),
    time_range: JSON.stringify({ since: de, until: ate }),
    time_increment: '1',
    limit: '500',
    access_token: cred.meta_access_token,
  });

  const linhas = [];
  let url = `${BASE}/act_${conta}/insights?${params}`;
  let paginas = 0;

  // A API pagina por cursor. O teto de páginas é um freio de segurança:
  // um período grande em nível de anúncio pode render dezenas de milhares
  // de linhas e travar o sync.
  while (url && paginas < 60) {
    const resposta = await pedir(url);
    for (const d of resposta.data || []) {
      linhas.push({
        plataforma: 'meta',
        data: d.date_start,
        nivel,
        conta_ext: `act_${conta}`,
        conta_nome: cred.conta_nome || `Meta ${conta}`,
        campanha_ext: d.campaign_id || null,
        campanha_nome: d.campaign_name || null,
        conjunto_ext: d.adset_id || null,
        conjunto_nome: d.adset_name || null,
        anuncio_ext: d.ad_id || null,
        anuncio_nome: d.ad_name || null,
        impressoes: Math.round(numero(d.impressions)),
        alcance: Math.round(numero(d.reach)),
        frequencia: numero(d.frequency),
        cliques: Math.round(numero(d.clicks)),
        gasto: numero(d.spend),
        conversoes: somarAcoes(d.actions, ACOES_CONVERSAO),
        valor_conversao: somarAcoes(d.action_values, ACOES_VALOR),
        fonte: 'api',
        atualizado_em: new Date().toISOString(),
      });
    }
    url = resposta.paging?.next || null;
    paginas++;
  }
  return linhas;
}

/** Confere se o token responde, sem puxar dados. Usado pelo botão "Testar". */
async function testar(cred) {
  const conta = String(cred.meta_ad_account_id || '').replace(/^act_/, '');
  const params = new URLSearchParams({
    fields: 'name,account_status,currency',
    access_token: cred.meta_access_token || '',
  });
  const r = await pedir(`${BASE}/act_${conta}?${params}`);
  return { nome: r.name, moeda: r.currency, status: r.account_status };
}

module.exports = { buscar, testar, ACOES_CONVERSAO };
