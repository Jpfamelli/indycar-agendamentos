/* ============================================================
   Coletor — orquestra Meta + Google e grava em ads_metricas_dia (rodada 8, frente T6).

   Regras:
   - janela de 7 dias a cada rodada: as plataformas corrigem números de dias passados
     (a Meta mexe por até 28 dias; a atribuição credita conversões a dias já fechados);
   - gravação idempotente pela chave única (plataforma, data, nivel, entidade_ext): rodar duas vezes atualiza;
   - nunca apaga dado real. A demonstração (fonte = 'demo') sai sozinha quando chega o primeiro dado real;
   - ultimo_sync_em e ultimo_sync_status sempre atualizados, com sucesso ou erro (sem segredo no texto);
   - uma coleta por vez: quem chama durante uma coleta espera e recebe o resultado dela;
   - funciona com o banco antes e depois da migração r8_trafego_v1: sem as colunas novas
     (objetivo, miniatura_url, conversas) grava sem elas; sem ads_termos_dia pula os termos com aviso;
   - cada coleta deixa rastro no log: quando, quantas linhas, quanto demorou, qual erro.
   Também fabrica dados de demonstração, para a tela poder ser usada antes de os acessos existirem.
   ============================================================ */
'use strict';

const db = require('./db');
const meta = require('./meta');
const google = require('./google');
const conexoes = require('./conexoes');
const Registro = require('./registro');

const NIVEIS = ['campanha', 'conjunto', 'anuncio'];
const CHAVE_METRICAS = 'plataforma,data,nivel,entidade_ext';
const CHAVE_TERMOS = 'plataforma,data,campanha_ext,conjunto_ext,palavra_chave,correspondencia,termo';
const COLUNAS_BASE = [
  'plataforma', 'data', 'nivel', 'conta_ext', 'conta_nome',
  'campanha_ext', 'campanha_nome', 'conjunto_ext', 'conjunto_nome', 'anuncio_ext', 'anuncio_nome',
  'impressoes', 'alcance', 'frequencia', 'cliques', 'gasto', 'conversoes', 'valor_conversao', 'fonte', 'atualizado_em',
];
/* Só entram no lote quando alguma linha sabe o valor: assim, se o catálogo da Meta falhar, a situação e a
   miniatura gravadas antes não são apagadas por um nulo. */
const COLUNAS_OPCIONAIS = ['status'];
const COLUNAS_NOVAS = ['objetivo', 'miniatura_url', 'conversas'];   // migração r8_trafego_v1

const DIA = 86400000;
const hojeBR = (agora = Date.now()) => new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const diaBR = v => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? hojeBR(t) : null; };

/* ---------------- gravação ---------------- */

const memoria = { semColunasNovas: false };
const faltaColunaNova = e => !!e && (e.code === 'PGRST204' || e.code === '42703' || /column/i.test(String(e.message || '')))
  && COLUNAS_NOVAS.some(c => String(e.message || '').includes(c));
const faltaTabela = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(String(e.message || '')));

const entidadeDe = l => l.anuncio_ext ?? l.conjunto_ext ?? l.campanha_ext ?? l.conta_ext ?? '';
/** Tira repetidas da mesma chave (a última vence): o upsert não aceita a mesma chave duas vezes no lote. */
function semRepetidas(linhas) {
  const m = new Map();
  for (const l of linhas) m.set(`${l.plataforma}|${l.data}|${l.nivel}|${entidadeDe(l)}`, l);
  return [...m.values()];
}

function colunasDoLote(linhas) {
  const extras = [...COLUNAS_OPCIONAIS, ...(memoria.semColunasNovas ? [] : COLUNAS_NOVAS)];
  return [...COLUNAS_BASE, ...extras.filter(c => linhas.some(l => l[c] !== undefined))];
}

/** Grava as linhas (upsert pela chave única). Sem as colunas novas no banco, grava sem elas. */
async function gravarMetricas(linhas, { sb = db.sb } = {}) {
  const todas = semRepetidas(linhas || []);
  let gravadas = 0;
  for (let i = 0; i < todas.length; i += 500) {
    const fatia = todas.slice(i, i + 500);
    for (let tentativa = 0; ; tentativa++) {
      const cols = colunasDoLote(fatia);
      const lote = fatia.map(l => Object.fromEntries(cols.map(c => [c, l[c] === undefined ? null : l[c]])));
      const { error } = await sb.from('ads_metricas_dia').upsert(lote, { onConflict: CHAVE_METRICAS });
      if (!error) break;
      if (tentativa === 0 && !memoria.semColunasNovas && faltaColunaNova(error)) { memoria.semColunasNovas = true; continue; }
      throw new Error(`gravarMetricas: ${error.message || error}`);
    }
    gravadas += fatia.length;
  }
  return { gravadas, sem_colunas_novas: memoria.semColunasNovas };
}

/** Grava palavras-chave e termos de busca. Sem a tabela (migração ainda não aplicada), não grava e avisa. */
async function gravarTermos(termos, { sb = db.sb } = {}) {
  if (!termos?.length) return { gravadas: 0, sem_tabela: false };
  let gravadas = 0;
  for (let i = 0; i < termos.length; i += 500) {
    const lote = termos.slice(i, i + 500);
    const { error } = await sb.from('ads_termos_dia').upsert(lote, { onConflict: CHAVE_TERMOS });
    if (error) {
      if (faltaTabela(error)) return { gravadas, sem_tabela: true };
      throw new Error(`gravarTermos: ${error.message || error}`);
    }
    gravadas += lote.length;
  }
  return { gravadas, sem_tabela: false };
}

/** Apaga só a demonstração (fonte = 'demo'). Devolve se havia alguma. */
async function apagarDemo({ sb = db.sb } = {}) {
  const { data, error } = await sb.from('ads_metricas_dia').select('id').eq('fonte', 'demo').limit(1);
  if (error) throw new Error(`apagarDemo: ${error.message || error}`);
  if (!data?.length) return false;
  const r = await sb.from('ads_metricas_dia').delete().eq('fonte', 'demo');
  if (r.error) throw new Error(`apagarDemo: ${r.error.message || r.error}`);
  const t = await sb.from('ads_termos_dia').delete().eq('fonte', 'demo');
  if (t.error && !faltaTabela(t.error)) console.warn('apagarDemo (termos):', t.error.message);
  return true;
}

async function marcar(id, patch, { sb = db.sb } = {}) {
  if (!id) return;
  const { error } = await sb.from('integracoes_ads').update(patch).eq('id', id);
  if (error) console.warn('coletor.marcar:', error.message);
}

/* ---------------- coleta ---------------- */

let emAndamento = null;
let ultima = null;
let ultimaPorOrigem = {};

/**
 * Puxa os últimos `dias` das plataformas ligadas e grava.
 * Opções (para teste): sb, lerIntegracoes, motores, agora, opcoesMotor (fetch, esperar, base…), origem.
 */
function sincronizar(opcoes = {}) {
  if (emAndamento) return emAndamento.then(r => ({ ...r, ja_estava_rodando: true }));
  emAndamento = rodar(opcoes).finally(() => { emAndamento = null; });
  return emAndamento;
}

async function rodar({ dias = 7, plataformas = ['meta', 'google'], niveis = NIVEIS, sb = db.sb, lerIntegracoes = db.lerIntegracoes,
  motores = { meta, google }, agora = () => Date.now(), opcoesMotor = {}, origem = 'rotina', log = {} } = {}) {
  const inicio = agora();
  const n = Math.min(90, Math.max(1, parseInt(dias, 10) || 7));
  const ate = hojeBR(inicio);
  const de = somarDias(ate, -n);
  memoria.semColunasNovas = false;   // a migração pode ter entrado desde a última coleta
  const relato = { de, ate, origem, inicio: new Date(inicio).toISOString(), plataformas: {}, erros: [], demo_removida: false };
  let integracoes = [];
  try { integracoes = await lerIntegracoes(); }
  catch (e) { relato.erros.push(`banco: ${conexoes.semSegredo(e.message)}`); }

  let reais = 0;
  for (const cred of integracoes) {
    if (cred.ativo === false) continue;
    const canal = cred.canal;
    if (!plataformas.includes(canal)) continue;
    const motor = motores[canal];
    if (!motor) continue;
    const t0 = agora();
    const estado = {};
    const patch = {};
    try {
      const r = await motor.coletar(cred, { de, ate, niveis, estado, ...opcoesMotor });
      const g = await gravarMetricas(r.linhas, { sb });
      const t = await gravarTermos(r.termos, { sb });
      reais += g.gravadas;
      const avisos = (r.avisos || []).map(a => conexoes.semSegredo(a).slice(0, 200));
      if (g.sem_colunas_novas) avisos.push('banco sem as colunas novas (objetivo, miniatura, conversas): gravado sem elas');
      if (t.sem_tabela) avisos.push('banco sem a tabela de palavras e termos: termos não gravados');
      relato.plataformas[canal] = {
        ok: true, linhas: g.gravadas, termos: t.gravadas, ms: agora() - t0, versao: r.versao || estado.versao || null,
        chamadas: estado.chamadas || 0, tentativas: estado.tentativas || 0, uso_pct: estado.uso_pct ?? null, avisos,
      };
      if (r.token) {
        relato.plataformas[canal].acesso_expira_em = r.token.expira_em;
        if (r.token.valido && (cred.meta_token_expira_em || null) !== (r.token.expira_em || null)) patch.meta_token_expira_em = r.token.expira_em || null;
      }
      patch.ultimo_sync_status = `ok — ${g.gravadas} linhas${t.gravadas ? ` · ${t.gravadas} termos` : ''}${avisos.length ? ` · ${avisos.length} aviso${avisos.length > 1 ? 's' : ''}` : ''}`;
    } catch (e) {
      // Uma plataforma quebrada não derruba a outra.
      const tecnico = conexoes.semSegredo(e.message);
      relato.plataformas[canal] = { ok: false, erro: tecnico, ...conexoes.explicarErro(tecnico), ms: agora() - t0, versao: estado.versao || null };
      relato.erros.push(`${canal}: ${tecnico}`);
      patch.ultimo_sync_status = `erro — ${tecnico}`.slice(0, 300);
    }
    patch.ultimo_sync_em = new Date(agora()).toISOString();
    await marcar(cred.id, patch, { sb });
    const p = relato.plataformas[canal];
    Registro.evento(p.ok ? 'info' : 'warn', 'coleta_plataforma', {
      plataforma: canal, origem, ok: p.ok, linhas: p.linhas ?? 0, termos: p.termos ?? 0, ms: p.ms, versao: p.versao,
      chamadas: p.chamadas, tentativas: p.tentativas, erro: p.ok ? null : p.titulo,
    }, log);
  }

  if (reais > 0) {
    try { relato.demo_removida = await apagarDemo({ sb }); }
    catch (e) { relato.erros.push(`demonstração: ${e.message}`); }
  }
  if (!Object.keys(relato.plataformas).length && !relato.erros.length) {
    relato.erros.push('Nenhuma integração ativa configurada em integracoes_ads.');
  }
  relato.fim = new Date(agora()).toISOString();
  relato.ms = agora() - inicio;
  Registro.evento(relato.erros.length ? 'warn' : 'info', 'coleta', {
    origem, de, ate, ms: relato.ms, plataformas: Object.keys(relato.plataformas).length, linhas: reais,
    erros: relato.erros.length, demo_removida: relato.demo_removida || null,
  }, log);
  ultima = relato;
  ultimaPorOrigem[origem] = relato;
  return relato;
}

/** Situação para a tela: se está rodando, a última coleta e cada conta (sem segredo nenhum). */
async function situacao({ lerIntegracoes = db.lerIntegracoes } = {}) {
  let contas = [];
  let erro = null;
  try {
    contas = (await lerIntegracoes()).filter(i => i.canal === 'meta' || i.canal === 'google').map(i => {
      const status = i.ultimo_sync_status ? conexoes.semSegredo(i.ultimo_sync_status).slice(0, 300) : null;
      return {
        canal: i.canal, ativo: i.ativo !== false,
        tem_acesso: i.canal === 'meta' ? !!(i.meta_access_token && i.meta_ad_account_id) : google.temAcesso(i),
        acesso: i.canal === 'google' ? google.modoDeAcesso(i) : (i.meta_access_token ? 'token' : null),
        ultimo_sync_em: i.ultimo_sync_em || null, ultimo_sync_status: status,
        ok: status ? !/^erro/i.test(status) : null,
        aviso: status && /^erro/i.test(status) ? conexoes.explicarErro(status) : null,
        token_expira_em: i.canal === 'meta' ? (i.meta_token_expira_em || null) : null,
      };
    });
  } catch (e) { erro = 'Não foi possível ler as conexões agora.'; }
  return { rodando: !!emAndamento, ultima, contas, erro };
}

/**
 * Valida as credenciais gravadas sem gravar nada. Canal sem linha em integracoes_ads também aparece.
 */
async function testarConexoes({ lerIntegracoes = db.lerIntegracoes, testar = conexoes.testar } = {}) {
  const integracoes = await lerIntegracoes();
  const saida = [];
  for (const canal of ['meta', 'google']) {
    if (!integracoes.some(i => i.canal === canal)) {
      saida.push({ canal, ok: false, titulo: `${canal === 'meta' ? 'Meta' : 'Google'} ainda não conectado`,
        fazer: 'Cole os acessos em Ajustes › Conexões e clique em Testar.' });
      continue;
    }
    saida.push(await testar(canal, {}, { lerIntegracoes: async () => integracoes }));
  }
  return saida;
}

/* ---------------- click_view: campanha e palavra de quem chegou com gclid ---------------- */

const GCLID = /^[A-Za-z0-9_-]{10,200}$/;
const semColuna = e => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(String(e.message || '')));

/**
 * Para cada contato dos últimos 90 dias com gclid e sem campanha, pergunta ao Google (click_view, um dia por
 * consulta) de qual campanha, grupo, anúncio e palavra veio aquele clique. Só PREENCHE o que está vazio:
 * nunca troca origem marcada (contato marcado como de outra plataforma fica como está).
 */
async function ligarCliques({ sb = db.sb, lerIntegracoes = db.lerIntegracoes, motor = google, agora = () => Date.now(),
  maxDias = 30, opcoesMotor = {}, log = {} } = {}) {
  const t0 = agora();
  const hoje = hojeBR(t0);
  const limite = somarDias(hoje, -(google.DIAS_CLICK_VIEW - 1));
  const saida = { ok: true, procurados: 0, dias_consultados: 0, ligados: 0, sem_clique: 0, erros: [] };
  const cred = (await lerIntegracoes()).find(i => i.canal === 'google' && i.ativo !== false);
  if (!cred || !google.temAcesso(cred)) return { ...saida, ok: false, motivo: 'O Google Ads ainda não está ligado.' };

  const { data: leads, error } = await sb.from('leads')
    .select('id, gclid, created_at, origem_em, origem, origem_paga, origem_plataforma, campanha_ext, campanha_nome, conjunto_ext, conjunto_nome, anuncio_ext, palavra_chave, rastreio')
    .not('gclid', 'is', null).is('campanha_ext', null).gte('created_at', `${limite}T03:00:00Z`).order('created_at', { ascending: false }).limit(500);
  if (error) {
    if (semColuna(error)) return { ...saida, pulado: true, motivo: 'O banco ainda não guarda o gclid do contato (falta aplicar a atualização do banco).' };
    throw new Error(`ligarCliques: ${error.message}`);
  }
  const alvos = (leads || []).filter(l => GCLID.test(String(l.gclid || '')) && (!l.origem_plataforma || l.origem_plataforma === 'google'));
  saida.procurados = alvos.length;
  if (!alvos.length) return { ...saida, ms: agora() - t0 };

  // Dia do clique: o registro do site (trafego_rastreio) é o melhor; senão o dia em que o contato chegou.
  const cliquesDoSite = new Map();
  const r = await sb.from('trafego_rastreio').select('lead_id, gclid, criado_em').in('lead_id', alvos.map(l => l.id)).not('gclid', 'is', null);
  if (!r.error) for (const x of r.data || []) cliquesDoSite.set(x.lead_id, x.criado_em);
  const porDia = new Map();
  for (const l of alvos) {
    for (const d of new Set([diaBR(cliquesDoSite.get(l.id)), diaBR(l.created_at)].filter(Boolean))) {
      if (d < limite || d > hoje) continue;
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(l);
    }
  }
  const ligados = new Set();
  for (const dia of [...porDia.keys()].sort().reverse().slice(0, maxDias)) {
    const pendentes = porDia.get(dia).filter(l => !ligados.has(l.id));
    if (!pendentes.length) continue;
    let lista;
    try { lista = await motor.cliques(cred, dia, { ...opcoesMotor, agora: t0 }); }
    catch (e) { saida.erros.push(`${dia}: ${conexoes.semSegredo(e.message).slice(0, 200)}`); continue; }
    saida.dias_consultados++;
    const mapa = new Map(lista.map(c => [c.gclid, c]));
    for (const l of pendentes) {
      const c = mapa.get(String(l.gclid));
      if (!c) continue;
      const patch = {};
      for (const k of ['campanha_ext', 'campanha_nome', 'conjunto_ext', 'conjunto_nome', 'anuncio_ext', 'palavra_chave']) if (l[k] == null && c[k] != null) patch[k] = c[k];
      if (l.origem_paga == null) patch.origem_paga = true;
      if (!l.origem_plataforma) patch.origem_plataforma = 'google';
      if (l.origem === 'whatsapp' || l.origem === 'organico' || l.origem == null) patch.origem = 'google';
      if (!l.origem_em) patch.origem_em = new Date(agora()).toISOString();
      const rastreio = l.rastreio && typeof l.rastreio === 'object' ? l.rastreio : {};
      patch.rastreio = { ...rastreio, click_view: { dia, correspondencia: c.correspondencia || null, em: new Date(agora()).toISOString() } };
      const u = await sb.from('leads').update(patch).eq('id', l.id).is('campanha_ext', null);
      if (u.error) { saida.erros.push(`contato ${String(l.id).slice(0, 8)}: ${u.error.message}`); continue; }
      ligados.add(l.id);
    }
  }
  saida.ligados = ligados.size;
  saida.sem_clique = alvos.length - ligados.size;
  saida.ms = agora() - t0;
  Registro.evento(saida.erros.length ? 'warn' : 'info', 'coleta_cliques', {
    procurados: saida.procurados, dias: saida.dias_consultados, ligados: saida.ligados, erros: saida.erros.length, ms: saida.ms,
  }, log);
  return saida;
}

/* ---------------- miniaturas: a tela busca pelo próprio app ---------------- */

/* Decisão (rodada 8): a imagem do anúncio passa pelo servidor do app. A tela continua com img-src 'self'
   (nenhum domínio da Meta ou do Google na política de segurança), o navegador do dono não conversa com a
   Meta, e só sai imagem de endereço da lista abaixo, gravado pela própria coleta. */
const HOSTS_MINIATURA = [/(^|\.)fbcdn\.net$/i, /(^|\.)facebook\.com$/i, /(^|\.)cdninstagram\.com$/i,
  /(^|\.)googleusercontent\.com$/i, /(^|\.)ytimg\.com$/i, /(^|\.)gstatic\.com$/i];
const TIPOS_IMAGEM = /^image\/(jpeg|png|webp|gif)$/i;
const MAX_MINIATURA = 1024 * 1024;
const TTL_MINIATURA = 6 * 3600000;
/* Revisão de regressão (19/11): o guardado tinha teto só em quantidade (300 x 1 MB = 300 MB no pior caso, num
   serviço de 512 MB que roda a Central inteira). Agora o teto é o total em bytes. */
const MAX_TOTAL_MINIATURAS = 20 * 1024 * 1024;
const cacheMiniaturas = new Map();
let bytesMiniaturas = 0;
function guardarMiniatura(chave, item) {
  const velho = cacheMiniaturas.get(chave);
  if (velho) { bytesMiniaturas -= velho.corpo.length; cacheMiniaturas.delete(chave); }
  while (cacheMiniaturas.size && (cacheMiniaturas.size >= 300 || bytesMiniaturas + item.corpo.length > MAX_TOTAL_MINIATURAS)) {
    const k = cacheMiniaturas.keys().next().value;
    bytesMiniaturas -= cacheMiniaturas.get(k).corpo.length;
    cacheMiniaturas.delete(k);
  }
  cacheMiniaturas.set(chave, item);
  bytesMiniaturas += item.corpo.length;
}
const situacaoMiniaturas = () => ({ itens: cacheMiniaturas.size, bytes: bytesMiniaturas });
const ID_ANUNCIO = /^[0-9A-Za-z_-]{1,40}$/;

/** Endereço relativo que a tela usa no <img>. */
const enderecoMiniatura = (plataforma, anuncioExt) => `api/coleta/miniatura/${plataforma}/${encodeURIComponent(String(anuncioExt))}`;

function urlPermitida(url, hosts = HOSTS_MINIATURA) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.some(re => re.test(u.hostname));
  } catch { return false; }
}

const TTL_SEM_MINIATURA = 10 * 60_000;
const semMiniatura = new Map();   // "plataforma|anúncio" -> até quando vale o "não tem"

/** { ok, tipo, corpo } ou { ok: false, status }. */
async function miniatura({ plataforma, anuncio, sb = db.sb, fetch: f = globalThis.fetch, hosts = HOSTS_MINIATURA, agora = Date.now() } = {}) {
  if (!['meta', 'google'].includes(plataforma) || !ID_ANUNCIO.test(String(anuncio || ''))) return { ok: false, status: 404 };
  const chave = `${plataforma}|${anuncio}`;
  const cache = cacheMiniaturas.get(chave);
  if (cache && cache.ate > agora) return { ok: true, tipo: cache.tipo, corpo: cache.corpo };
  /* Rodada 10: a rota é pública (o <img> não manda login) e cada pedido de um anúncio sem imagem ia ao banco, e
     cada imagem que a Meta já tirou do ar era pedida de novo a cada abertura das Campanhas. O "não tem" fica
     lembrado por 10 minutos (a próxima coleta pode trazer a imagem). Banco fora não conta: aí não se sabe. */
  const semImagemAte = semMiniatura.get(chave);
  if (semImagemAte && semImagemAte > agora) return { ok: false, status: 404 };
  const naoTem = () => {
    if (semMiniatura.size >= 2000) semMiniatura.delete(semMiniatura.keys().next().value);
    semMiniatura.delete(chave); semMiniatura.set(chave, agora + TTL_SEM_MINIATURA);
    return { ok: false, status: 404 };
  };
  const { data, error } = await sb.from('ads_metricas_dia').select('miniatura_url, data')
    .eq('plataforma', plataforma).eq('nivel', 'anuncio').eq('anuncio_ext', String(anuncio))
    .not('miniatura_url', 'is', null).order('data', { ascending: false }).limit(1);
  if (error) return { ok: false, status: 404 };
  const url = data?.[0]?.miniatura_url;
  if (!url || !urlPermitida(url, hosts)) return naoTem();
  let r;
  try { r = await f(url, { redirect: 'error', headers: { Accept: 'image/*' }, signal: AbortSignal.timeout(8_000) }); }
  catch { return naoTem(); }
  const tipo = String(r.headers.get('content-type') || '').split(';')[0].trim();
  if (!r.ok || !TIPOS_IMAGEM.test(tipo) || Number(r.headers.get('content-length') || 0) > MAX_MINIATURA) return naoTem();
  const corpo = Buffer.from(await r.arrayBuffer());
  if (corpo.length > MAX_MINIATURA) return naoTem();
  semMiniatura.delete(chave);
  guardarMiniatura(chave, { tipo, corpo, ate: agora + TTL_MINIATURA });
  return { ok: true, tipo, corpo };
}

/* ------------------------------------------------------------
   Dados de demonstração
   ------------------------------------------------------------ */

/* Números calibrados para parecerem uma oficina de verdade: custo por contato entre R$ 60 e R$ 200 e
   retorno de 2x a 5x. A `cvr` aqui é conversão sobre CLIQUE (1% a 3% em serviço automotivo local). */
const CAMPANHAS = [
  { plat: 'meta',   id: 'demo-m1', nome: '[Meta] Revisão + Troca de Óleo — Taubaté', base: 85,  cvr: 0.018, ticket: 320, obj: 'OUTCOME_ENGAGEMENT' },
  { plat: 'meta',   id: 'demo-m2', nome: '[Meta] Remarketing — Clientes 90 dias',    base: 35,  cvr: 0.038, ticket: 480, obj: 'OUTCOME_ENGAGEMENT' },
  { plat: 'meta',   id: 'demo-m3', nome: '[Meta] Suspensão e Alinhamento',           base: 60,  cvr: 0.009, ticket: 640, obj: 'OUTCOME_LEADS' },
  { plat: 'google', id: 'demo-g1', nome: '[Search] oficina mecânica perto de mim',   base: 95,  cvr: 0.028, ticket: 410, obj: 'SEARCH' },
  { plat: 'google', id: 'demo-g2', nome: '[Search] troca de óleo taubaté',           base: 45,  cvr: 0.040, ticket: 290, obj: 'SEARCH' },
  { plat: 'google', id: 'demo-g3', nome: '[PMax] Serviços gerais',                   base: 70,  cvr: 0.011, ticket: 520, obj: 'PERFORMANCE_MAX' },
];

const CRIATIVOS = ['Vídeo — Depoimento cliente', 'Estático — Antes e depois', 'Carrossel — Tabela de preços'];

/* Ruído determinístico: o mesmo dia gera sempre o mesmo número. */
function ruido(semente) {
  const x = Math.sin(semente * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Preenche os últimos N dias com números plausíveis de uma oficina.
 * Marca fonte='demo' — o botão "limpar demonstração" e a primeira coleta real apagam só isso.
 */
async function popularDemo(dias = 45, { sb = db.sb } = {}) {
  const linhas = [];
  const fim = new Date();
  const menos = (d, n) => new Date(d.getTime() - n * DIA);
  const iso = d => d.toISOString().slice(0, 10);

  for (let d = dias; d >= 1; d--) {
    const dia = menos(fim, d);
    const data = iso(dia);
    const semanaDia = dia.getDay();
    const sazonal = semanaDia === 0 ? 0.55 : semanaDia === 6 ? 0.75 : semanaDia === 5 ? 1.2 : 1;

    CAMPANHAS.forEach((c, ci) => {
      if (c.id === 'demo-g3' && d >= 16 && d <= 20) return;   // PMax pausada 5 dias no meio do período
      const tendencia = 1 + ((dias - d) / 7) * 0.01;
      const s = ruido(d * 7 + ci * 31);
      const gasto = +(c.base * sazonal * tendencia * (0.75 + s * 0.5)).toFixed(2);
      const cpm = 22 + ruido(d + ci) * 26;
      const impressoes = Math.round((gasto / cpm) * 1000);
      const ctr = 0.9 + ruido(d * 3 + ci) * 2.2;
      const cliques = Math.max(1, Math.round(impressoes * (ctr / 100)));
      const penal = (c.id === 'demo-m3' && d <= 10) ? 0.25 : 1;   // m3 piora nos últimos 10 dias
      const conversoes = Math.round(cliques * c.cvr * penal * (0.7 + ruido(d * 11 + ci) * 0.6));
      const receita = +(conversoes * c.ticket * (0.85 + ruido(d * 5 + ci) * 0.3)).toFixed(2);
      const temAlcance = c.plat === 'meta';
      const alcance = temAlcance ? Math.round(impressoes / (1.4 + ruido(d + ci * 3) * 1.6)) : 0;
      const freq = alcance ? +(impressoes / alcance).toFixed(2) : 0;

      const comum = {
        plataforma: c.plat, data,
        conta_ext: c.plat === 'meta' ? 'act_demo' : 'demo',
        conta_nome: c.plat === 'meta' ? 'IndyCar (demo)' : 'IndyCar Google (demo)',
        campanha_ext: c.id, campanha_nome: c.nome, objetivo: c.obj, status: c.id === 'demo-g3' && d >= 16 && d <= 20 ? 'PAUSED' : (c.plat === 'meta' ? 'ACTIVE' : 'ENABLED'),
        fonte: 'demo', atualizado_em: new Date().toISOString(),
      };
      const conversas = v => (c.plat === 'meta' ? v : null);

      linhas.push({ ...comum, nivel: 'campanha', impressoes, alcance, frequencia: freq, cliques, gasto, conversoes, conversas: conversas(conversoes), valor_conversao: receita });

      const conjId = `${c.id}-cj1`;
      linhas.push({ ...comum, nivel: 'conjunto', conjunto_ext: conjId, conjunto_nome: 'Público principal — 25-55 · 15km',
        impressoes, alcance, frequencia: freq, cliques, gasto, conversoes, conversas: conversas(conversoes), valor_conversao: receita });

      CRIATIVOS.forEach((nome, ai) => {
        const fatia = [0.5, 0.3, 0.2][ai];
        const impA = Math.round(impressoes * fatia);
        const alcA = temAlcance ? Math.round(impA / (ai === 0 ? 2.4 + (45 - d) / 22 : 1.5 + ruido(d + ai) * 0.8)) : 0;
        const convA = Math.round(conversoes * fatia);
        linhas.push({ ...comum, nivel: 'anuncio', conjunto_ext: conjId, conjunto_nome: 'Público principal — 25-55 · 15km',
          anuncio_ext: `${c.id}-ad${ai}`, anuncio_nome: nome, miniatura_url: null,
          impressoes: impA, alcance: alcA, frequencia: alcA ? +(impA / alcA).toFixed(2) : 0,
          cliques: Math.round(cliques * fatia), gasto: +(gasto * fatia).toFixed(2),
          conversoes: convA, conversas: conversas(convA), valor_conversao: +(receita * fatia).toFixed(2) });
      });
    });
  }

  // Recriar do zero: dias pausados não podem herdar números de uma demonstração antiga.
  const { error } = await sb.from('ads_metricas_dia').delete().eq('fonte', 'demo');
  if (error) throw new Error(`apagarDemo: ${error.message}`);
  await gravarMetricas(linhas, { sb });
  return { dias, linhas: linhas.length };
}

module.exports = {
  sincronizar, situacao, testarConexoes, ligarCliques, popularDemo, miniatura, enderecoMiniatura, urlPermitida, situacaoMiniaturas,
  gravarMetricas, gravarTermos, apagarDemo, semRepetidas, hojeBR, somarDias,
  NIVEIS, COLUNAS_NOVAS, HOSTS_MINIATURA,
  get ultima() { return ultima; },
};
