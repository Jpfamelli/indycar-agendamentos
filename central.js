// IndyCar Central — UM servidor, UM endereço, UM login (rodada 5, 16/10/2026).
//
//   /              → Casa (login único, atalhos por papel, sino, minhas tarefas, o "agora" do dia)
//   /agenda/       → Agenda       (este repositório, server.js na raiz)
//   /crm/          → CRM          (apps/crm)
//   /comunicar/    → Comunicar    (apps/comunicar — o carteiro roda aqui)
//   /atendimento/  → Atendimento  (apps/atendimento — sincronia, automações e IA do funil)
//   /api/ping      → saúde da Central (versões de cada app, memória)
//
// Como monta cada app: tira o prefixo de req.url e põe req.prefixo ('/crm' etc.) —
// cada server.js já sabe montar links e caminhos com isso (onda B1).
//
// Endereços antigos da Agenda continuam valendo: /?agendamento=x (e qualquer / com
// consulta) → 308 /agenda/?…; /confirmar/, /api/* e os arquivos da Agenda na raiz
// continuam sendo servidos pela Agenda sem prefixo (links já enviados a clientes,
// feed ICS, webhook).
//
// Um app que falhe ao carregar NÃO derruba os outros: o prefixo dele responde 503.
import http from 'node:http';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import zlib from 'node:zlib';
import { criarLinksCliente } from './casa-servidor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try { process.loadEnvFile(join(__dirname, '.env')); } catch { /* produção: variáveis do Render */ }

export const VERSAO_CENTRAL = '2026-10-25-central-r7';
const PORT = Number(process.env.PORT) || 3000;
const NO_AR_DESDE = new Date().toISOString();
const EM_PRODUCAO = !!process.env.RENDER;
/* Endereços dos dois apps que moram fora da Central (Netlify). Só https; qualquer outra coisa volta ao padrão. */
const PATIO_PADRAO = 'https://indycar-patio.netlify.app';
const ORCADOR_PADRAO = 'https://indycar-orcador.netlify.app';
export function urlDeApp(valor, padrao) {
  try { const u = new URL(String(valor || '')); return u.protocol === 'https:' && !u.username && !u.password ? u.origin : padrao; } catch { return padrao; }
}

/* ---------------------------------------------------------------------------
   Saúde do Pátio e do Orçador (rodada 6, C1b): eles moram no Netlify, fora desta Central.
   A Casa precisa saber se estão respondendo para avisar a equipe ANTES de alguém clicar e
   dar de cara com a página de erro. Um sondador só, com cache de 40 s, não importa quantas
   pessoas estejam com a Casa aberta. Uma falha isolada não alarma: só "fora do ar" na 2ª seguida.
   --------------------------------------------------------------------------- */
export function proximoEstadoApp(anterior, resultado, agora = Date.now()) {
  if (resultado?.ok) return { fora: false, suspeito: false, falhas: 0, desde: null, ms: resultado.ms ?? null, status: resultado.status ?? null, motivo: null, verificado_em: agora };
  const falhas = (anterior?.falhas || 0) + 1;
  return { fora: falhas >= 2, suspeito: falhas === 1, falhas, desde: anterior?.desde || agora, ms: resultado?.ms ?? null, status: resultado?.status ?? null, motivo: resultado?.motivo || 'sem_resposta', verificado_em: agora };
}
export async function sondarApp(base, fetchFn = globalThis.fetch, tempoMs = 4000) {
  const t0 = Date.now();
  try {
    const r = await fetchFn(base, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'IndyCar-Central-saude' }, signal: AbortSignal.timeout(tempoMs) });
    try { await r.body?.cancel(); } catch { /* corpo já foi */ }
    const ok = r.status < 500;
    return { ok, status: r.status, ms: Date.now() - t0, motivo: ok ? null : 'http_' + r.status };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - t0, motivo: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'tempo_esgotado' : 'sem_resposta' };
  }
}
const SAUDE = { patio: null, orcador: null };
/* rodada 7: os apps que moram DENTRO da Central (agenda, crm, comunicar, atendimento) — se algum não subiu, a Casa avisa sem esperar alguém clicar */
export function internosDaCentral(apps = APPS) {
  return Object.fromEntries(['agenda', 'crm', 'comunicar', 'atendimento'].map((n) => [n, apps[n]?.handler ? { ok: true } : { ok: false, motivo: apps[n]?.erro ? 'nao_subiu' : 'ausente' }]));
}
/* freio simples: cada endereço pode perguntar a saúde no máximo 40 vezes por minuto (a resposta já vem de um cache de 40 s) */
const PERGUNTAS = new Map();
export function dentroDoFreioDaSaude(ip, agora = Date.now(), limite = 40) {
  const lista = (PERGUNTAS.get(ip) || []).filter((t) => agora - t < 60_000);
  if (lista.length >= limite) { PERGUNTAS.set(ip, lista); return false; }
  lista.push(agora); PERGUNTAS.set(ip, lista);
  if (PERGUNTAS.size > 500) PERGUNTAS.clear();
  return true;
}
const LINKS_CLIENTE = criarLinksCliente();
let saudeEm = 0, saudeVoo = null, sondaFn = null;
export function definirSondaParaTeste(fn) { sondaFn = fn; saudeEm = 0; SAUDE.patio = null; SAUDE.orcador = null; }
export async function saudeDosApps(agora = Date.now(), validadeMs = 40_000) {
  if (agora - saudeEm < validadeMs && SAUDE.patio) return { verificado_em: saudeEm, apps: { ...SAUDE } };
  if (!saudeVoo) {
    saudeVoo = (async () => {
      const b = { patio: urlDeApp(process.env.PATIO_URL, PATIO_PADRAO), orcador: urlDeApp(process.env.ORCADOR_URL, ORCADOR_PADRAO) };
      const resultados = await Promise.all(Object.entries(b).map(async ([k, url]) => [k, await (sondaFn ? sondaFn(url, k) : sondarApp(url))]));
      for (const [k, r] of resultados) SAUDE[k] = proximoEstadoApp(SAUDE[k], r, Date.now());
      saudeEm = Date.now();
    })().finally(() => { saudeVoo = null; });
  }
  await saudeVoo;
  return { verificado_em: saudeEm, apps: { ...SAUDE } };
}

/* ---------------------------------------------------------------------------
   Carregar os quatro apps (cada um isolado num try)
   --------------------------------------------------------------------------- */
const APPS = {};       // nome -> { prefixo, handler, versao, erro }
const DESLIGAR = [];   // funções de parada (timers)

async function carregar(nome, prefixo, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    APPS[nome] = { prefixo, ...r };
    console.log(`  ✓ ${nome.padEnd(11)} em ${prefixo}/  (v${r.versao || '?'}, ${Date.now() - t0} ms)`);
  } catch (e) {
    APPS[nome] = { prefixo, handler: null, erro: String(e?.message || e).slice(0, 200) };
    console.error(`  ✗ ${nome} NÃO carregou:`, e?.stack || e);
  }
}

async function carregarTudo() {
  await carregar('agenda', '/agenda', async () => {
    const m = await import(pathToFileURL(join(__dirname, 'server.js')).href);
    await m.iniciar({ ouvir: false });         // config de IA, token ICS, importação CodeWords, automações
    return { handler: m.handler, versao: m.VERSAO };
  });
  await carregar('crm', '/crm', async () => {
    const m = require('./apps/crm/server.js');
    if (typeof m.ligarAutomacoes === 'function') m.ligarAutomacoes();
    return { handler: m.handler, versao: m.VERSAO };
  });
  await carregar('comunicar', '/comunicar', async () => {
    const m = await import(pathToFileURL(join(__dirname, 'apps/comunicar/server.js')).href);
    m.ligarCarteiro();                          // uma vez só (CARTEIRO_DESLIGADO=1 não liga)
    DESLIGAR.push(() => m.desligarCarteiro());
    return { handler: m.handler, versao: m.VERSAO };
  });
  await carregar('atendimento', '/atendimento', async () => {
    const m = require('./apps/atendimento/server.js');
    const ligado = m.iniciar({ log: (...a) => console.log(' ', ...a) });   // sincronia, automações, IA do funil
    return { handler: m.handler, versao: lerVersaoAtendimento(), ligado };
  });
}
function lerVersaoAtendimento() {
  try { return JSON.parse(readFileSync(join(__dirname, 'apps/atendimento/package.json'), 'utf8')).version; } catch { return null; }
}

/* ---------------------------------------------------------------------------
   Casa (/): arquivos em casa/, guardados na memória com ETag e compressão
   --------------------------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const CASA_DIR = join(__dirname, 'casa');
const CASA = new Map();   // caminho público -> { tipo, buf, br, gz, etag }
function prepararCasa() {
  for (const f of readdirSync(CASA_DIR)) {
    const tipo = MIME[extname(f)];
    if (!tipo) continue;
    const buf = readFileSync(join(CASA_DIR, f));
    const texto = !tipo.startsWith('image/');
    const item = {
      tipo, buf, etag: '"' + createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"',
      br: texto ? zlib.brotliCompressSync(buf) : null, gz: texto ? zlib.gzipSync(buf) : null,
    };
    // index.html na raiz; sw.js e manifest.json na raiz (escopo "/"); o resto em /casa/
    if (f === 'index.html') { CASA.set('/', item); CASA.set('/index.html', item); }
    else if (f === 'sw.js' || f === 'manifest.json') CASA.set('/' + f, item);
    CASA.set('/casa/' + f, item);
  }
}

const CSP_CASA = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net",
  "manifest-src 'self'", "worker-src 'self'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');
function cabecalhos(res, extra = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Content-Security-Policy', CSP_CASA);
  res.setHeader('X-IndyCar-App', 'central');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
}
function servirCasa(req, res, item, caminho) {
  cabecalhos(res);
  res.setHeader('ETag', item.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  // o HTML e o service worker sempre conferem com o servidor (304 barato); ícones podem ficar 1 dia
  res.setHeader('Cache-Control', item.tipo.startsWith('image/') ? 'public, max-age=86400' : 'no-cache');
  if (caminho === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
  const inm = String(req.headers['if-none-match'] || '').replace(/^W\//, '');
  if (inm && inm === item.etag) { res.writeHead(304); return res.end(); }
  const ae = String(req.headers['accept-encoding'] || '');
  let corpo = item.buf;
  if (item.br && /\bbr\b/.test(ae)) { corpo = item.br; res.setHeader('Content-Encoding', 'br'); }
  else if (item.gz && /\bgzip\b/.test(ae)) { corpo = item.gz; res.setHeader('Content-Encoding', 'gzip'); }
  res.writeHead(200, { 'Content-Type': item.tipo, 'Content-Length': corpo.length });
  res.end(req.method === 'HEAD' ? undefined : corpo);
}
function json(res, status, obj) {
  cabecalhos(res, { 'Cache-Control': 'no-store' });
  const corpo = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo) });
  res.end(corpo);
}
function redirecionar(res, para) {
  cabecalhos(res, { 'Cache-Control': 'no-store' });
  res.writeHead(308, { Location: para, 'Content-Length': 0 });
  res.end();
}

/* ---------------------------------------------------------------------------
   Roteador
   --------------------------------------------------------------------------- */
const ORDEM = ['agenda', 'crm', 'comunicar', 'atendimento'];
const mb = (n) => Math.round(n / 1048576);

function montar(nome, req, res, resto, busca) {
  const app = APPS[nome];
  if (!app || !app.handler) {
    res.setHeader('Retry-After', '60');
    return json(res, 503, { erro: `O ${nome} não subiu nesta Central. Avise o suporte (o resto continua no ar).`, app: nome });
  }
  req.url = (resto || '/') + busca;
  req.prefixo = app.prefixo;
  return app.handler(req, res);
}

export async function handler(req, res) {
  let url;
  try { url = new URL(req.url, 'http://central.local'); }
  catch { res.writeHead(400); return res.end(); }
  const caminho = url.pathname;
  const busca = url.search || '';
  /* rodada 6: cada pedido tem um número (X-Request-Id) para achar a linha certa no log do Render; aceita o que o proxy já mandou se for curto e simples */
  const recebido = String(req.headers['x-request-id'] || '');
  const idPedido = /^[A-Za-z0-9._-]{6,64}$/.test(recebido) ? recebido : randomUUID();
  res.setHeader('X-Request-Id', idPedido);
  const inicio = Date.now();
  res.on('finish', () => { const ms = Date.now() - inicio; if (ms > 3000) console.warn(`Central: pedido lento ${req.method} ${caminho} ${res.statusCode} ${ms} ms [${idPedido}]`); });
  // "%" solto / UTF-8 inválido no caminho: 400 aqui, igual para todos (a Agenda respondia 500 por decodeURIComponent)
  try { decodeURIComponent(caminho); } catch { return json(res, 400, { erro: 'Endereço inválido.' }); }

  // 1) saúde e configuração da Central
  if (caminho === '/api/ping') {
    const m = process.memoryUsage();
    return json(res, 200, {
      ok: ORDEM.every((n) => APPS[n]?.handler), app: 'central', configurado: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY), versao: VERSAO_CENTRAL, noArDesde: NO_AR_DESDE,
      apps: Object.fromEntries(ORDEM.map((n) => [n, APPS[n]?.handler ? { ok: true, versao: APPS[n].versao || null, prefixo: APPS[n].prefixo + '/' } : { ok: false }])),
      memoria: { rss_mb: mb(m.rss), heap_mb: mb(m.heapUsed) },
    });
  }
  if (caminho === '/api/central/config') {
    // só o que é público por definição (a chave anon do Supabase vai para todo navegador)
    return json(res, 200, {
      supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '', versao: VERSAO_CENTRAL,
      apps: { patio: urlDeApp(process.env.PATIO_URL, PATIO_PADRAO), orcador: urlDeApp(process.env.ORCADOR_URL, ORCADOR_PADRAO) },
    });
  }

  if (caminho === '/api/central/saude-apps' && (req.method === 'GET' || req.method === 'HEAD')) {
    // só "está respondendo?" de dois sites públicos — nada sensível; o cache de 40 s protege os sites de enxurrada
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim().slice(0, 64);
    if (!dentroDoFreioDaSaude(ip)) { res.setHeader('Retry-After', '30'); return json(res, 429, { erro: 'Muitas perguntas seguidas. Espere meio minuto.' }); }
    return json(res, 200, { ...(await saudeDosApps()), internos: internosDaCentral(), central: { versao: VERSAO_CENTRAL, no_ar_desde: NO_AR_DESDE } });
  }

  // 1a) rodada 7: links do cliente (Minha IndyCar, indique, acompanhar) para a ficha da Casa — só equipe logada
  if (caminho === '/api/central/links-cliente') {
    const r = await LINKS_CLIENTE.tratar(req);
    return json(res, r.status, r.corpo);
  }

  // 1b) rodada 6: /patio e /orcador moram em outro domínio (Netlify) — quem digita o atalho na Central cai no lugar certo
  for (const [nome, base] of [['patio', urlDeApp(process.env.PATIO_URL, PATIO_PADRAO)], ['orcador', urlDeApp(process.env.ORCADOR_URL, ORCADOR_PADRAO)]]) {
    const p = '/' + nome;
    if (base && (caminho === p || caminho.startsWith(p + '/'))) {
      const resto = caminho.slice(p.length);
      cabecalhos(res, { 'Cache-Control': 'no-store' });
      res.writeHead(302, { Location: base.replace(/\/+$/, '') + resto + busca, 'Content-Length': 0 });
      return res.end();
    }
  }

  // 2) os quatro apps por prefixo
  for (const nome of ORDEM) {
    const p = APPS[nome]?.prefixo || '/' + nome;
    if (caminho === p) return redirecionar(res, p + '/' + busca);
    if (caminho.startsWith(p + '/')) return montar(nome, req, res, caminho.slice(p.length), busca);
  }

  // 3) raiz: Casa — mas links antigos da Agenda ("/?agendamento=x", "/?r=agenda"…) vão para /agenda/
  /* rodada 6: /?busca=<termo> é da Casa (outros apps linkam assim para abrir a busca global); qualquer outra consulta continua indo para a Agenda */
  if ((caminho === '/' || caminho === '/index.html') && busca && !url.searchParams.has('busca')) return redirecionar(res, '/agenda/' + busca);
  if (req.method === 'GET' || req.method === 'HEAD') {
    const item = CASA.get(caminho);
    if (item) return servirCasa(req, res, item, caminho);
  }
  // /casa/<arquivo que não existe>: 404 da Casa (antes caía na Agenda e devolvia a página dela no lugar do arquivo)
  if (caminho === '/casa' || caminho.startsWith('/casa/')) return json(res, 404, { erro: 'Arquivo da Casa não encontrado.' });

  // 4) o resto da raiz continua sendo a Agenda sem prefixo (/confirmar/, /api/*, feed ICS, webhook…)
  const ag = APPS.agenda;
  if (!ag?.handler) return json(res, 503, { erro: 'A Agenda não subiu nesta Central.' });
  req.url = caminho + busca;           // normalizado ('//x' e '/a/../b' não chegam crus à Agenda)
  req.prefixo = '';
  return ag.handler(req, res);
}

/* ---------------------------------------------------------------------------
   Subida e parada
   --------------------------------------------------------------------------- */
let server = null;
export async function iniciarCentral({ porta = PORT, ouvir = true } = {}) {
  console.log(`\n  🏁 IndyCar Central ${VERSAO_CENTRAL} — carregando os apps…`);
  prepararCasa();
  await carregarTudo();
  if (!ouvir) return { handler, APPS };
  server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((e) => {
      console.error('Central:', e?.stack || e);
      if (!res.headersSent) { try { json(res, 500, { erro: 'Erro interno.' }); } catch { /* conexão foi */ } }
      else { try { res.end(); } catch { /* idem */ } }
    });
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 66_000;
  server.keepAliveTimeout = 65_000;   // maior que o do proxy do Render (evita 502 em conexão reaproveitada)
  await new Promise((ok) => server.listen(porta, ok));
  const m = process.memoryUsage();
  console.log(`  No ar em http://localhost:${porta}/  ·  memória ${mb(m.rss)} MB\n`);
  return { handler, APPS, server };
}

/** Janela deslizante de 1 minuto: true enquanto o número de exceções soltas ainda é tolerável. */
const EXCECOES = [];
export function registrarExcecao(agora = Date.now(), limite = 25) {
  EXCECOES.push(agora);
  while (EXCECOES.length && agora - EXCECOES[0] > 60_000) EXCECOES.shift();
  return EXCECOES.length < limite;
}

let desligando = false;
function desligar(sinal) {
  if (desligando) return;
  desligando = true;
  console.log(`\n  ${sinal}: encerrando a Central com cuidado…`);
  for (const f of DESLIGAR) { try { f(); } catch { /* segue */ } }
  if (server) server.close(() => process.exit(0)); else process.exit(0);
  setTimeout(() => process.exit(0), 10_000).unref();
}

/** Guardas do processo: SIGTERM/SIGINT com cuidado, rejeição solta só registra, exceção solta de UM app
 *  (timer, evento) não derruba os outros três; enxurrada (>= 25 em 1 minuto) reinicia pelo Render. */
export function instalarGuardas(proc = process) {
  proc.on('SIGTERM', () => desligar('SIGTERM'));
  proc.on('SIGINT', () => desligar('SIGINT'));
  proc.on('unhandledRejection', (e) => console.error('Promessa sem tratamento:', e?.message || e));
  proc.on('uncaughtException', (e) => {
    if (registrarExcecao()) console.error('Exceção sem tratamento (a Central segue no ar):', e?.stack || e);
    else { console.error('Exceções demais em 1 minuto — reiniciando:', e?.stack || e); proc.exit(1); }
  });
}

const EH_PRINCIPAL = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (EH_PRINCIPAL) {
  instalarGuardas();
  iniciarCentral();
}
