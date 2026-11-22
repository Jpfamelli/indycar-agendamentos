/* ============================================================
   Camada de banco — Supabase (o mesmo projeto do CRM/Agenda/Atendimento).
   Todo acesso passa pela service_role, que ignora o RLS. Nenhuma tabela
   ads_* tem política de leitura: gasto e ROAS não podem vazar pelo
   /rest/v1 nem para usuário logado.
   ============================================================ */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { num } = require('./metricas');
const google = require('./google');   // integração r8: regra única de "tem acesso" ao Google (sem developer token)

const URL = process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

if (!URL || !KEY) {
  console.warn('⚠️  Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env — o app sobe, mas sem dados.');
}

const sb = createClient(URL || 'http://localhost', KEY || 'sem-chave', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const erro = (ctx, e) => { throw new Error(`${ctx}: ${e.message || e}`); };

/* Colunas numéricas que voltam como string do Postgres. Converter aqui,
   na fronteira, evita `"12.50" + "3"` virar "12.503" lá na frente. */
const NUMERICAS = ['gasto', 'conversoes', 'valor_conversao', 'frequencia',
                   'impressoes', 'alcance', 'cliques'];

function normalizar(linha) {
  if (!linha) return linha;
  const o = { ...linha };
  for (const c of NUMERICAS) if (c in o) o[c] = num(o[c]);
  return o;
}

/* ---------------- configuração ---------------- */

/* Cache leve: painel, ritmo do mês, radar e relatório leem a config a cada
   chamada. 60 s evita quatro idas ao banco por clique; salvar invalida. */
let cacheCfg = { valor: null, em: 0 };
const TTL_CFG = 60_000;

async function lerConfig({ fresco = false } = {}) {
  if (!fresco && cacheCfg.valor && Date.now() - cacheCfg.em < TTL_CFG) {
    return { ...cacheCfg.valor, whatsapp_destinos: [...cacheCfg.valor.whatsapp_destinos] };
  }
  const { data, error } = await sb.from('ads_config').select('*').eq('id', true).maybeSingle();
  if (error) erro('lerConfig', error);
  const c = data || {};
  const cfg = {
    ...c,
    cpa_alvo: c.cpa_alvo == null ? null : num(c.cpa_alvo),
    roas_alvo: c.roas_alvo == null ? null : num(c.roas_alvo),
    orcamento_mensal: c.orcamento_mensal == null ? null : num(c.orcamento_mensal),
    ticket_medio: c.ticket_medio == null ? null : num(c.ticket_medio),
    margem_pct: c.margem_pct == null ? 100 : num(c.margem_pct),
    whatsapp_destinos: Array.isArray(c.whatsapp_destinos) ? c.whatsapp_destinos.filter(Boolean) : [],
    // Envio é opt-in: relatório só sai com relatorio_ativo = true gravado.
    // Linha ausente, null ou config que não carregou = NÃO enviar.
    relatorio_ativo: c.relatorio_ativo === true,
    relatorio_hora: c.relatorio_hora == null ? 8 : Number(c.relatorio_hora),
    alertas_ativos: c.alertas_ativos !== false,
    alertas_intervalo_min: c.alertas_intervalo_min == null ? 60 : Number(c.alertas_intervalo_min),
  };
  cacheCfg = { valor: cfg, em: Date.now() };
  return { ...cfg, whatsapp_destinos: [...cfg.whatsapp_destinos] };
}

function esquecerConfig() { cacheCfg = { valor: null, em: 0 }; }

async function salvarConfig(campos) {
  const permitidos = ['cpa_alvo', 'roas_alvo', 'orcamento_mensal', 'ticket_medio', 'margem_pct',
                      'whatsapp_destinos', 'relatorio_ativo', 'relatorio_hora',
                      'alertas_ativos', 'alertas_intervalo_min'];
  const patch = { id: true, updated_at: new Date().toISOString() };
  for (const k of permitidos) if (k in campos) patch[k] = campos[k];
  const { data, error } = await sb.from('ads_config').upsert(patch).select().single();
  if (error) erro('salvarConfig', error);
  esquecerConfig();
  return data;
}

/* ---------------- credenciais das plataformas ---------------- */

async function lerIntegracoes() {
  const { data, error } = await sb.from('integracoes_ads').select('*');
  if (error) erro('lerIntegracoes', error);
  return data || [];
}

/** Versão segura para mandar ao navegador: diz se existe, nunca o valor. */
function mascararIntegracao(i) {
  const tem = v => !!(v && String(v).trim());
  return {
    id: i.id, canal: i.canal, ativo: i.ativo, conta_nome: i.conta_nome,
    ultimo_sync_em: i.ultimo_sync_em, ultimo_sync_status: i.ultimo_sync_status,
    meta_ad_account_id: i.meta_ad_account_id, google_customer_id: i.google_customer_id,
    meta_token_expira_em: i.meta_token_expira_em,
    tem_meta_token: tem(i.meta_access_token),
    tem_google_token: google.temAcesso(i),
    // Rodada 4: o guia de conexão mostra passo a passo o que já foi colado — só sim/não, nunca o valor.
    tem_meta_conta: tem(i.meta_ad_account_id),
    tem_google_cliente: tem(i.google_customer_id),
    tem_google_developer_token: tem(i.google_developer_token),
    tem_google_oauth: tem(i.google_client_id) && tem(i.google_client_secret),
    tem_google_refresh: tem(i.google_refresh_token),
    tem_google_mcc: tem(i.google_login_customer_id),
  };
}

async function marcarSync(id, status) {
  const { error } = await sb.from('integracoes_ads')
    .update({ ultimo_sync_em: new Date().toISOString(), ultimo_sync_status: status })
    .eq('id', id);
  if (error) console.warn('marcarSync:', error.message);
}

/* ---------------- métricas ---------------- */

/**
 * Grava as linhas do coletor. O upsert usa a chave
 * (plataforma, data, nivel, entidade_ext): rodar o sync duas vezes no
 * mesmo dia atualiza, não duplica. Isso importa porque a janela de
 * atribuição do Meta muda números de dias já passados.
 */
/* Colunas gravadas, na ordem. O PostgREST exige que todos os objetos de um
   upsert tenham exatamente as mesmas chaves — o Meta não manda `status` e o
   Google não manda `alcance`, então padronizamos aqui. */
const COLUNAS_METRICA = [
  'plataforma', 'data', 'nivel', 'conta_ext', 'conta_nome',
  'campanha_ext', 'campanha_nome', 'conjunto_ext', 'conjunto_nome',
  'anuncio_ext', 'anuncio_nome', 'status',
  'impressoes', 'alcance', 'frequencia', 'cliques',
  'gasto', 'conversoes', 'valor_conversao', 'fonte', 'atualizado_em',
];

const padronizar = l => {
  const o = {};
  for (const c of COLUNAS_METRICA) o[c] = l[c] === undefined ? null : l[c];
  return o;
};

async function gravarMetricas(linhas) {
  if (!linhas.length) return 0;
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += 500) {   // lotes: payload do PostgREST tem limite
    const lote = linhas.slice(i, i + 500).map(padronizar);
    const { error } = await sb.from('ads_metricas_dia')
      .upsert(lote, { onConflict: 'plataforma,data,nivel,entidade_ext' });
    if (error) erro('gravarMetricas', error);
    gravadas += lote.length;
  }
  return gravadas;
}

/**
 * Lê o fato diário. `de` e `ate` são datas ISO (YYYY-MM-DD), inclusivas.
 */
async function lerMetricas({ de, ate, nivel = 'campanha', plataforma = null, entidade = null } = {}) {
  let q = sb.from('ads_metricas_dia').select('*').gte('data', de).lte('data', ate).eq('nivel', nivel);
  if (plataforma) q = q.eq('plataforma', plataforma);
  if (entidade)   q = q.eq('entidade_ext', entidade);
  const { data, error } = await q.order('data', { ascending: true }).limit(20000);
  if (error) erro('lerMetricas', error);
  return (data || []).map(normalizar);
}

async function apagarDemo() {
  const { error } = await sb.from('ads_metricas_dia').delete().eq('fonte', 'demo');
  if (error) erro('apagarDemo', error);
}

/**
 * Situação da chave de um canal (pura): 'ok' = tem token e o último sync não deu erro;
 * 'recusada' = tem token mas a plataforma recusou (ex.: token de exemplo); 'sem_token' = nada colado.
 */
function classificarChave(i) {
  if (!i || i.ativo === false) return 'sem_token';
  const tem = v => !!(v && String(v).trim());
  const temToken = i.canal === 'meta' ? tem(i.meta_access_token) : google.temAcesso(i);
  if (!temToken) return 'sem_token';
  return /^erro/i.test(String(i.ultimo_sync_status || '')) ? 'recusada' : 'ok';
}

/** { meta, google } com 'ok' | 'recusada' | 'sem_token'. */
async function estadoChaves() {
  const saida = { meta: 'sem_token', google: 'sem_token' };
  try {
    for (const i of await lerIntegracoes()) if (i.canal in saida) saida[i.canal] = classificarChave(i);
  } catch {}
  return saida;
}

/** Há chave funcionando em alguma plataforma? Sem isso o app está em "modo sem chaves". */
async function temChaves() {
  const e = await estadoChaves();
  return Object.values(e).includes('ok');
}

/** Quantas linhas reais (fonte ≠ demo) existem. */
async function temDadosReais() {
  const { count, error } = await sb.from('ads_metricas_dia').select('id', { count: 'exact', head: true }).neq('fonte', 'demo');
  if (error) return false;
  return (count || 0) > 0;
}

async function temDados() {
  const { count, error } = await sb.from('ads_metricas_dia')
    .select('id', { count: 'exact', head: true });
  if (error) return false;
  return (count || 0) > 0;
}

/* ---------------- regras e alertas ---------------- */

async function listarRegras({ somenteAtivas = false } = {}) {
  let q = sb.from('ads_regras').select('*');
  if (somenteAtivas) q = q.eq('ativa', true);
  const { data, error } = await q.order('severidade').order('nome');
  if (error) erro('listarRegras', error);
  return (data || []).map(r => ({
    ...r,
    valor: num(r.valor), min_gasto: num(r.min_gasto),
    min_conversoes: num(r.min_conversoes), min_impressoes: num(r.min_impressoes),
  }));
}

async function salvarRegra(regra) {
  const campos = ['nome', 'ativa', 'plataforma', 'nivel', 'metrica', 'operador', 'valor',
                  'janela_dias', 'min_gasto', 'min_conversoes', 'min_impressoes',
                  'severidade', 'cooldown_horas', 'mensagem'];
  const patch = { updated_at: new Date().toISOString() };
  for (const k of campos) if (k in regra) patch[k] = regra[k];
  if (regra.id) patch.id = regra.id;
  const { data, error } = await sb.from('ads_regras').upsert(patch).select().single();
  if (error) erro('salvarRegra', error);
  return data;
}

async function apagarRegra(id) {
  const { error } = await sb.from('ads_regras').delete().eq('id', id);
  if (error) erro('apagarRegra', error);
}

/** Último disparo de cada chave, para o cooldown não repetir o mesmo aviso. */
async function ultimosDisparos(desde) {
  const { data, error } = await sb.from('ads_alertas')
    .select('chave, criado_em').gte('criado_em', desde).order('criado_em', { ascending: false });
  if (error) erro('ultimosDisparos', error);
  const mapa = new Map();
  for (const a of data || []) if (!mapa.has(a.chave)) mapa.set(a.chave, a.criado_em);
  return mapa;
}

async function gravarAlertas(alertas) {
  if (!alertas.length) return [];
  const { data, error } = await sb.from('ads_alertas').insert(alertas).select();
  if (error) erro('gravarAlertas', error);
  return data || [];
}

async function listarAlertas({ limite = 50, naoLidos = false } = {}) {
  let q = sb.from('ads_alertas').select('*');
  if (naoLidos) q = q.is('lido_em', null);
  const { data, error } = await q.order('criado_em', { ascending: false }).limit(limite);
  if (error) erro('listarAlertas', error);
  return (data || []).map(a => ({ ...a, valor_medido: num(a.valor_medido), valor_limite: num(a.valor_limite) }));
}

async function marcarAlertasLidos(ids) {
  if (!ids?.length) return;
  const { error } = await sb.from('ads_alertas')
    .update({ lido_em: new Date().toISOString() }).in('id', ids);
  if (error) erro('marcarAlertasLidos', error);
}

async function marcarAlertasEnviados(ids) {
  if (!ids?.length) return;
  const { error } = await sb.from('ads_alertas')
    .update({ enviado_em: new Date().toISOString() }).in('id', ids);
  if (error) console.warn('marcarAlertasEnviados:', error.message);
}

/* ---------------- relatórios ---------------- */

async function salvarRelatorio(rel) {
  const { data, error } = await sb.from('ads_relatorios')
    .upsert(rel, { onConflict: 'tipo,referencia' }).select().single();
  if (error) erro('salvarRelatorio', error);
  return data;
}

async function listarRelatorios(limite = 30) {
  const { data, error } = await sb.from('ads_relatorios')
    .select('id, tipo, referencia, resumo_ia, texto, enviado_em, erro, created_at')
    .order('referencia', { ascending: false }).limit(limite);
  if (error) erro('listarRelatorios', error);
  return data || [];
}

async function relatorioDe(tipo, referencia) {
  const { data, error } = await sb.from('ads_relatorios')
    .select('*').eq('tipo', tipo).eq('referencia', referencia).maybeSingle();
  if (error) erro('relatorioDe', error);
  return data;
}

/* ---------------- ponte com o CRM ---------------- */

/**
 * Leads que o tráfego pago gerou no período, direto da tabela do CRM.
 * É o número que fecha o ciclo: a plataforma diz "conversão", o CRM diz
 * "virou cliente e pagou X".
 */
async function leadsPorCanal(de, ate) {
  // A coluna do CRM chama-se `origem` (enum canal_origem), não `canal`.
  const { data, error } = await sb.from('leads')
    .select('id, origem, status, valor_pago, observacoes, utm_campaign, created_at')
    .gte('created_at', inicioBR(de)).lt('created_at', inicioBR(diaSeguinte(ate)))
    .in('origem', ['meta', 'google']).limit(10000);
  if (error) { console.warn('leadsPorCanal:', error.message); return {}; }
  // R13C: receita pelo valor do serviço (Pátio > orçamento > Agenda > lançado), a mesma regra da Casa e do CRM
  const linhas = await require('../../lib/valor-servico.cjs').comValorDoServico(sb, data || []);
  const por = {};
  for (const l of linhas) {
    const c = (por[l.origem] ||= { leads: 0, fechados: 0, receita: 0 });
    c.leads++;
    if (l.status === 'concluido') { c.fechados++; c.receita += num(l.valor_pago); if (!num(l.valor_pago)) c.sem_valor = (c.sem_valor || 0) + 1; }
  }
  return por;
}

/**
 * Config do aparelho do CodeWords — a MESMA fonte da Agenda, do Comunicar
 * e do vigia: chave em agenda_ia_config.cw_api_key, aparelho em
 * codewords_config.device_id. Nunca devolvida ao navegador.
 */
async function lerCodewordsConfig() {
  const [ia, central] = await Promise.all([
    sb.from('agenda_ia_config').select('cw_api_key, cw_connect_service_id, cw_base_url').eq('id', true).maybeSingle(),
    sb.from('codewords_config').select('device_id, servico_conexao, base_url, api_key').eq('id', true).maybeSingle(),
  ]);
  if (ia.error) console.warn('lerCodewordsConfig (agenda_ia_config):', ia.error.message);
  if (central.error) console.warn('lerCodewordsConfig (codewords_config):', central.error.message);
  const a = ia.data || {}, c = central.data || {};
  return {
    api_key: a.cw_api_key || c.api_key || null,
    servico: a.cw_connect_service_id || c.servico_conexao || 'whatsapp_device_manager',
    base: String(a.cw_base_url || c.base_url || 'https://runtime.codewords.ai').replace(/[/]+$/, ''),
    device_id: c.device_id || null,
  };
}

/* O vigia (GitHub Actions) grava aqui o que está fora do ar. 30 s de cache:
   a faixa de saúde da tela não precisa bater no banco a cada aba. */
let cacheVigia = { valor: null, em: 0 };
async function lerVigia({ fresco = false } = {}) {
  if (!fresco && cacheVigia.em && Date.now() - cacheVigia.em < 30_000) return cacheVigia.valor;
  const { data, error } = await sb.from('vigia_estado')
    .select('problema, problemas, desde, checado_em, ultimo_resumo').eq('id', true).maybeSingle();
  if (error) { console.warn('lerVigia:', error.message); return cacheVigia.valor; }
  cacheVigia = { valor: data || null, em: Date.now() };
  return cacheVigia.valor;
}

/** Config da WhatsApp Cloud API — reaproveitada do app de Atendimento (reserva). */
async function lerWhatsappConfig() {
  const { data, error } = await sb.from('whatsapp_config').select('*').eq('id', true).maybeSingle();
  if (error) { console.warn('lerWhatsappConfig:', error.message); return null; }
  if (data?.access_token) return data;
  // Fallback: a Agenda tem a própria cópia da credencial.
  const { data: ag } = await sb.from('agenda_whatsapp_config').select('*').eq('id', true).maybeSingle();
  return ag?.access_token ? ag : data;
}

/* ---------------- coorte do CRM (Resultados) ---------------- */

/* Limites do dia em Brasília: lead criado às 23h do dia 7 é do dia 7. */
const diaSeguinte = d => new Date(new Date(`${d}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
const inicioBR = d => `${d}T00:00:00-03:00`;

/* Paginação explícita: o limite padrão do PostgREST (1000) é menor que uma
   coorte de 90 dias. Teto de 50 mil para nunca virar laço infinito. */
async function lerCoorteAds(de, ate) {
  const linhas = [];
  for (let inicio = 0; inicio < 50000; inicio += 1000) {
    const { data, error } = await sb.from('leads')
      .select('id, cliente_id, responsavel_id, origem, status, valor_pago, utm_source, utm_medium, utm_campaign, created_at, closed_at')
      .gte('created_at', inicioBR(de)).lt('created_at', inicioBR(diaSeguinte(ate)))
      .order('created_at').order('id').range(inicio, inicio + 999);
    if (error) throw new Error('Não foi possível ler a atribuição do CRM. Tente novamente.');
    linhas.push(...(data || []));
    // R13C: ranking, CSV e relatório passam a ver o valor do serviço pela regra única (não só o lançado à mão)
    if ((data || []).length < 1000) return require('../../lib/valor-servico.cjs').comValorDoServico(sb, linhas);
  }
  throw new Error('Coorte acima de 50 mil leads. Escolha um período menor.');
}

/* `in` com lista enorme estoura o tamanho da URL: lotes de 150 ids. */
async function emLotes(ids, fn, tamanho = 150) {
  const unicos = [...new Set(ids.filter(Boolean))], saida = [];
  for (let i = 0; i < unicos.length; i += tamanho) saida.push(...(await fn(unicos.slice(i, i + tamanho))));
  return saida;
}

/** Agendamentos dos leads da coorte (só o que o funil precisa — sem nome nem telefone). */
async function lerAgendamentosDosLeads(leadIds) {
  return emLotes(leadIds, async lote => {
    const { data, error } = await sb.from('agendamentos').select('lead_id, status, valor').in('lead_id', lote);
    if (error) throw new Error('Não foi possível ler os agendamentos do CRM. Tente novamente.');
    return data || [];
  });
}

/** Quais clientes da coorte têm conversa no Atendimento. */
async function lerClientesComConversa(clienteIds) {
  const linhas = await emLotes(clienteIds, async lote => {
    const { data, error } = await sb.from('conversas').select('cliente_id').in('cliente_id', lote);
    if (error) throw new Error('Não foi possível ler as conversas do Atendimento. Tente novamente.');
    return data || [];
  });
  return new Set(linhas.map(l => l.cliente_id));
}

/* ---------------- IA do ecossistema (ia_config / ia_acoes) ---------------- */

const IA_PADRAO = { ativo: true, modelo_rapido: 'claude-sonnet-5-5', modelo_forte: 'claude-opus-5-5',
  autonomia: 'confirmar', limite_chamadas_dia: 2000, instrucoes_extras: null };
let cacheIA = { valor: null, em: 0 };

/** Config da IA (linha única), com 60 s de cache e reserva se a tabela falhar. */
async function lerIaConfig({ fresco = false } = {}) {
  if (!fresco && cacheIA.valor && Date.now() - cacheIA.em < 60_000) return { ...cacheIA.valor };
  const { data, error } = await sb.from('ia_config')
    .select('ativo, modelo_rapido, modelo_forte, autonomia, limite_chamadas_dia, instrucoes_extras').eq('id', true).maybeSingle();
  if (error) { console.warn('lerIaConfig:', error.message); return { ...IA_PADRAO }; }
  const v = { ...IA_PADRAO };
  for (const k of Object.keys(IA_PADRAO)) if (data?.[k] != null && data[k] !== '') v[k] = data[k];
  cacheIA = { valor: v, em: Date.now() };
  return { ...v };
}

/** Toda ação da IA vai para ia_acoes (log do ecossistema). Nunca derruba quem chamou. */
async function registrarAcaoIA(acao) {
  const { data, error } = await sb.from('ia_acoes').insert({ origem: 'sistema', ...acao }).select('id, created_at').single();
  if (error) { console.warn('registrarAcaoIA:', error.message); return null; }
  return data;
}

async function contarAcoesIAHoje() {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const { count, error } = await sb.from('ia_acoes').select('id', { count: 'exact', head: true }).gte('created_at', inicioBR(hoje));
  if (error) { console.warn('contarAcoesIAHoje:', error.message); return 0; }
  return count || 0;
}

async function listarAcoesIA(tipo, limite = 5) {
  const { data, error } = await sb.from('ia_acoes')
    .select('id, status, resumo, saida, erro, modelo, created_at').eq('origem', 'sistema').eq('tipo', tipo)
    .order('created_at', { ascending: false }).limit(limite);
  if (error) erro('listarAcoesIA', error);
  return data || [];
}

/* ---------------- credenciais coladas pela tela ---------------- */

const CAMPOS_CRED = {
  meta: ['meta_access_token', 'meta_ad_account_id', 'meta_token_expira_em'],
  google: ['google_developer_token', 'google_customer_id', 'google_login_customer_id',
           'google_client_id', 'google_client_secret', 'google_refresh_token'],
};

/**
 * Grava a credencial de UM canal em integracoes_ads (a mesma do CRM). Campo
 * vazio NÃO apaga o que já existe — o dono cola só o que mudou.
 */
async function salvarIntegracao(canal, campos, contaNome) {
  const patch = { updated_at: new Date().toISOString(), ativo: true };
  for (const k of CAMPOS_CRED[canal] || []) if (campos[k] != null && String(campos[k]).trim() !== '') patch[k] = String(campos[k]).trim();
  if (contaNome) patch.conta_nome = contaNome;
  const { data: atual, error: e1 } = await sb.from('integracoes_ads').select('id').eq('canal', canal).order('created_at').limit(1).maybeSingle();
  if (e1) erro('salvarIntegracao', e1);
  const q = atual ? sb.from('integracoes_ads').update(patch).eq('id', atual.id) : sb.from('integracoes_ads').insert({ canal, ...patch });
  const { data, error } = await q.select().single();
  if (error) erro('salvarIntegracao', error);
  return data;
}

module.exports = {
  lerCoorteAds, lerAgendamentosDosLeads, lerClientesComConversa,
  lerIaConfig, registrarAcaoIA, contarAcoesIAHoje, listarAcoesIA, IA_PADRAO,
  salvarIntegracao, CAMPOS_CRED, inicioBR, diaSeguinte,
  sb, normalizar,
  lerConfig, salvarConfig, esquecerConfig,
  lerIntegracoes, mascararIntegracao, marcarSync,
  gravarMetricas, lerMetricas, apagarDemo, temDados, temChaves, temDadosReais, estadoChaves, classificarChave,
  listarRegras, salvarRegra, apagarRegra,
  ultimosDisparos, gravarAlertas, listarAlertas, marcarAlertasLidos, marcarAlertasEnviados,
  salvarRelatorio, listarRelatorios, relatorioDe,
  leadsPorCanal, lerWhatsappConfig, lerCodewordsConfig, lerVigia,
};
