// IndyCar Central — UM servidor, UM endereço, UM login (rodada 5, 16/10/2026).
//
//   /              → Casa (login único, os apps com o número que importa, o sino e os avisos do sistema)
//   /agenda/       → Agenda       (este repositório, server.js na raiz)
//   /crm/          → CRM          (apps/crm)
//   /comunicar/    → Comunicar    (apps/comunicar — o carteiro roda aqui)
//   /atendimento/  → Atendimento  (apps/atendimento — sincronia, automações e IA do funil)
//                    rodada 20: a página dele só abre embutida no CRM ("CRM e Atendimento"); aberta direto, vai para /crm/
//   /trafego/      → Tráfego      (apps/trafego — anúncios e de onde vêm os clientes; rodada 8, 19/11/2026)
//   /orcador/      → Orçador      (apps/orcador — build pronto do repositório indycar-orcador; rodada 11, 21/11/2026)
//   /api/ping      → saúde da Central (versões de cada app, memória)
//
// Como monta cada app: tira o prefixo de req.url e põe req.prefixo ('/crm' etc.) —
// cada server.js já sabe montar links e caminhos com isso (onda B1). Daí em diante o pedido é do app:
// a Central não pede login, não responde OPTIONS, não põe CORS nem cabeçalho de segurança e não lê o corpo
// (o script de rastreio, a porta da IA, o MCP e o cron do Tráfego dependem disso). Só acrescenta o X-Request-Id.
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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import zlib from 'node:zlib';
import { criarLinksCliente, criarFaturamento, podar } from './casa-servidor.js';
import { destinoDoAtendimento } from './lib/crm-atendimento.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try { process.loadEnvFile(join(__dirname, '.env')); } catch { /* produção: variáveis do Render */ }

export const VERSAO_CENTRAL = '2026-11-19-central-r8';
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
/* Os apps que moram DENTRO da Central, na ordem em que sobem. É a lista única do roteador, do /api/ping e da saúde. */
const ORDEM = ['agenda', 'crm', 'comunicar', 'atendimento', 'trafego'];
/* rodada 7: se algum dos apps de dentro não subiu, a Casa avisa sem esperar alguém clicar */
export function internosDaCentral(apps = APPS) {
  return Object.fromEntries(ORDEM.map((n) => [n, apps[n]?.handler ? { ok: true } : { ok: false, motivo: apps[n]?.erro ? 'nao_subiu' : 'ausente' }]));
}
/* freio simples: cada endereço pode perguntar a saúde no máximo 40 vezes por minuto (a resposta já vem de um cache de 40 s) */
const PERGUNTAS = new Map();
export function dentroDoFreioDaSaude(ip, agora = Date.now(), limite = 40) {
  const lista = (PERGUNTAS.get(ip) || []).filter((t) => agora - t < 60_000);
  if (lista.length >= limite) { PERGUNTAS.set(ip, lista); return false; }
  lista.push(agora); PERGUNTAS.set(ip, lista);
  // rodada 10: passou de 500 endereços, saem os parados e os que menos perguntaram (antes zerava tudo e soltava quem estava freado)
  podar(PERGUNTAS, 500, (l) => l.some((t) => agora - t < 60_000), (l) => l.length);
  return true;
}
const LINKS_CLIENTE = criarLinksCliente();
/* R13C: faturamento do mês da Casa pela regra única do valor do serviço (lib/valor-servico.cjs), só gestor */
const FATURAMENTO = criarFaturamento({ quemE: LINKS_CLIENTE.quemE });
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
   Carregar os cinco apps (cada um isolado num try)
   --------------------------------------------------------------------------- */
const APPS = {};       // nome -> { prefixo, handler, versao, erro }
const DESLIGAR = [];   // funções de parada (timers)

/* Tráfego (rodada 8): as rotinas dele (coleta nas plataformas, radar de alertas, avisos e relatórios) ficam
   DESLIGADAS na Central e só ligam com TRAFEGO_AUTOMATICO=1, para nada ser coletado nem avisado sem o dono querer.
   O ADS_AUTOMATICO (nome que o app lê quando roda sozinho) não manda aqui: a Central sobe o app com
   iniciar({ ouvir: false, rotinas }) (sem porta própria e sem gravar a demonstração do ADS_DEMO), dizendo ela mesma
   se as rotinas ligam, e repassa a decisão em ADS_AUTOMATICO para a tela do app dizer a verdade sobre o piloto. */
export function rotinasDoTrafegoLigadas(env = process.env) { return env.TRAFEGO_AUTOMATICO === '1'; }

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
    /* rodada 13C: com o Orçador servido aqui, os links que a Agenda monta no servidor vão para /orcador/ (não o Netlify) */
    if (orcadorLocal()) (await import(pathToFileURL(join(__dirname, 'orcador.js')).href)).usarOrcadorDaCentral(true);
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
  await carregar('trafego', '/trafego', async () => {
    const automatico = rotinasDoTrafegoLigadas();
    process.env.ADS_AUTOMATICO = automatico ? '1' : '0';
    const m = require('./apps/trafego/server.js');
    const r = m.iniciar({ ouvir: false, rotinas: automatico });   // sem porta; quem decide as rotinas é a Central, não o ADS_AUTOMATICO
    if (r?.ouvindo !== false) throw new Error('o Tráfego não confirmou que ficou sem porta própria');
    if (r.rotinas) DESLIGAR.push(() => m.desligarRotinas());
    console.log(`    rotinas do Tráfego ${r.rotinas ? 'LIGADAS (TRAFEGO_AUTOMATICO=1)' : 'desligadas (só ligam com TRAFEGO_AUTOMATICO=1)'}`);
    return { handler: m.handler, versao: m.VERSAO, ligado: { automatico: !!r.rotinas } };
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
  '.woff2': 'font/woff2',   // rodada 9: as fontes da Casa moram aqui (saíram do Google)
};
const CASA_DIR = join(__dirname, 'casa');
const CASA = new Map();   // caminho público -> { tipo, buf, br, gz, etag }
/* rodada 10 (desempenho): cada CSS e JS da Casa era conferido com o servidor em toda abertura (19 pedidos que voltavam
   "304, não mudou"). Agora o endereço leva a marca do conteúdo (/casa/casa.js?v=<marca>) e, pedido com a marca certa,
   o arquivo pode ficar guardado 1 ano no navegador: mudou o arquivo, muda a marca e o index (que nunca fica guardado)
   aponta para o endereço novo. Pedido sem marca, ou com marca velha, continua conferindo como antes. */
const marcaDe = (buf) => createHash('sha1').update(buf).digest('base64url').slice(0, 12);
function prepararCasa() {
  CASA.clear();
  const nomes = readdirSync(CASA_DIR).filter((f) => MIME[extname(f)]);
  const marcas = Object.fromEntries(nomes.map((f) => [f, marcaDe(readFileSync(join(CASA_DIR, f)))]));
  for (const f of nomes) {
    const tipo = MIME[extname(f)];
    let buf = readFileSync(join(CASA_DIR, f));
    const texto = !tipo.startsWith('image/') && !tipo.startsWith('font/');   // woff2 já vem comprimido
    // rodada 10: o index sai com a marca do conteúdo de cada arquivo no "?v=" (ver marcaDe); o que foi escrito à mão é trocado
    if (f === 'index.html') buf = Buffer.from(buf.toString('utf8').replace(/(\/casa\/([\w.-]+\.(?:css|js)))\?v=[\w-]+/g, (tudo, caminho, nome) => (marcas[nome] ? caminho + '?v=' + marcas[nome] : tudo)));
    // o service worker recebe as mesmas marcas, para pedir os endereços que a página já baixou (ver casa/sw.js)
    if (f === 'sw.js') buf = Buffer.from(buf.toString('utf8').replace('const MARCAS = {};', () => 'const MARCAS = ' + JSON.stringify(Object.fromEntries(nomes.filter((n) => /\.(css|js)$/.test(n) && n !== 'sw.js').map((n) => ['/casa/' + n, marcas[n]]))) + ';'));
    const item = {
      tipo, buf, marca: marcas[f], etag: '"' + createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"',
      br: texto ? zlib.brotliCompressSync(buf) : null, gz: texto ? zlib.gzipSync(buf) : null,
    };
    // index.html na raiz; sw.js e manifest.json na raiz (escopo "/"); o resto em /casa/
    if (f === 'index.html') { CASA.set('/', item); CASA.set('/index.html', item); }
    else if (f === 'sw.js' || f === 'manifest.json') CASA.set('/' + f, item);
    CASA.set('/casa/' + f, item);
  }
}

/* rodada 9: o CDN entra só no caminho da biblioteca do Supabase (versão fixa, com integrity no index). Antes valia
   o cdn.jsdelivr.net inteiro, que serve qualquer pacote do npm e qualquer arquivo do GitHub: um script injetado podia
   puxar código de lá e passar pela CSP. */
const LIB_SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/';
/* rodada 10: a Casa só fala com o projeto do Supabase da oficina (antes qualquer *.supabase.co passava: um script
   injetado podia mandar dado para o projeto de outra pessoa). Sem SUPABASE_URL válida, fica o curinga de antes.
   E as imagens são só as da própria Casa: nenhuma tela usa imagem "data:", que saiu da lista. */
export function cspDaCasa(env = process.env) {
  let banco = 'https://*.supabase.co wss://*.supabase.co';
  try {
    const u = new URL(String(env.SUPABASE_URL || ''));
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    if ((u.protocol === 'https:' || (u.protocol === 'http:' && local)) && !u.username && !u.password) banco = u.origin + ' ' + u.origin.replace(/^http/, 'ws');
  } catch { /* fica o curinga */ }
  return [
    "default-src 'self'",
    `script-src 'self' ${LIB_SUPABASE}`,
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src 'self' ${banco} ${LIB_SUPABASE}`,
    "manifest-src 'self'", "worker-src 'self'",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; ');
}
let cspGuardada = { de: null, texto: '' };
function cspAtual() {
  const de = String(process.env.SUPABASE_URL || '');
  if (cspGuardada.de !== de) cspGuardada = { de, texto: cspDaCasa() };
  return cspGuardada.texto;
}
function cabecalhos(res, extra = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Content-Security-Policy', cspAtual());
  res.setHeader('X-IndyCar-App', 'central');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
}
function servirCasa(req, res, item, caminho, marcaPedida = '') {
  cabecalhos(res);
  res.setHeader('ETag', item.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  // o HTML e o service worker sempre conferem com o servidor (304 barato); ícones podem ficar 1 dia
  // fontes não mudam: 30 dias (o service worker também guarda)
  const fixo = !!marcaPedida && marcaPedida === item.marca && /^text\/(css|javascript)/.test(item.tipo);
  res.setHeader('Cache-Control', fixo ? 'public, max-age=31536000, immutable' : item.tipo.startsWith('font/') ? 'public, max-age=2592000' : item.tipo.startsWith('image/') ? 'public, max-age=86400' : 'no-cache');
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
function json(res, status, obj, extra = {}) {
  cabecalhos(res, { 'Cache-Control': 'no-store', ...extra });
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
   Orçador (/orcador/, rodada 11): o build pronto mora em apps/orcador/ (a Central publica sem passo de build).
   Refazer: no repositório indycar-orcador, "npm run build:central -- <pasta deste monorrepo>".
   Ele usa a MESMA sessão da Casa (mesmo endereço, mesmo Supabase) e abre numa moldura do próprio site (a aba
   Orçador do Atendimento): por isso frame-ancestors 'self' e X-Frame-Options SAMEORIGIN, só aqui.
   --------------------------------------------------------------------------- */
const ORCADOR_DIR = join(__dirname, 'apps', 'orcador');
const MIME_ORCADOR = { ...MIME, '.webmanifest': 'application/manifest+json; charset=utf-8', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const ORCADOR_CACHE = new Map();   // arquivo -> { tipo, buf, br, gz, etag }
let orcadorTem = null;
export function orcadorLocal() {
  if (orcadorTem === null) orcadorTem = existsSync(join(ORCADOR_DIR, 'index.html'));
  return orcadorTem;
}
export function cspDoOrcador(env = process.env) {
  const banco = (cspDaCasa(env).match(/connect-src 'self' (\S+ \S+)/) || [])[1] || 'https://*.supabase.co wss://*.supabase.co';
  return [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob:",
    `connect-src 'self' ${banco}`, "worker-src 'self'", "manifest-src 'self'", "media-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  ].join('; ');
}
/** '/assets/x.js' -> arquivo dentro de apps/orcador, ou null (fora da pasta, oculto ou inexistente). */
export function arquivoDoOrcador(resto, dir = ORCADOR_DIR) {
  let r = String(resto || '/');
  try { r = decodeURIComponent(r); } catch { return null; }
  if (r === '/' || r === '') r = '/index.html';
  if (/[\\\0]/.test(r) || r.split('/').some((p) => p === '..' || (p.startsWith('.') && p.length > 1))) return null;
  const alvo = normalize(join(dir, r));
  if (!alvo.startsWith(dir + sep)) return null;
  try { return statSync(alvo).isFile() ? alvo : null; } catch { return null; }
}
function servirOrcador(req, res, resto) {
  const cab = (extra = {}) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Content-Security-Policy', cspDoOrcador());
    res.setHeader('X-IndyCar-App', 'orcador');
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  };
  const erro = (status, texto, extra = {}) => {
    cab({ 'Cache-Control': 'no-store', ...extra });
    const corpo = JSON.stringify({ erro: texto });
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo) });
    return res.end(corpo);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return erro(405, 'Use GET.', SO_LEITURA);
  const arquivo = arquivoDoOrcador(resto);
  if (!arquivo) return erro(404, 'Arquivo do Orçador não encontrado.');
  let item = ORCADOR_CACHE.get(arquivo);
  if (!item) {
    const tipo = MIME_ORCADOR[extname(arquivo)] || 'application/octet-stream';
    const buf = readFileSync(arquivo);
    const texto = /^(text\/|application\/(manifest\+)?json)/.test(tipo) || tipo === 'image/svg+xml';
    item = { tipo, buf, etag: '"' + createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"', br: texto ? zlib.brotliCompressSync(buf) : null, gz: texto ? zlib.gzipSync(buf) : null };
    if (ORCADOR_CACHE.size < 400) ORCADOR_CACHE.set(arquivo, item);
  }
  // os arquivos de assets/ têm a marca do conteúdo no nome: ficam guardados 1 ano; o index sempre confere
  const fixo = arquivo.includes(sep + 'assets' + sep);
  cab({ ETag: item.etag, Vary: 'Accept-Encoding', 'Cache-Control': fixo ? 'public, max-age=31536000, immutable' : arquivo.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400' });
  const inm = String(req.headers['if-none-match'] || '').replace(/^W\//, '');
  if (inm && inm === item.etag) { res.writeHead(304); return res.end(); }
  const ae = String(req.headers['accept-encoding'] || '');
  let corpo = item.buf;
  if (item.br && /\bbr\b/.test(ae)) { corpo = item.br; res.setHeader('Content-Encoding', 'br'); }
  else if (item.gz && /\bgzip\b/.test(ae)) { corpo = item.gz; res.setHeader('Content-Encoding', 'gzip'); }
  res.writeHead(200, { 'Content-Type': item.tipo, 'Content-Length': corpo.length });
  return res.end(req.method === 'HEAD' ? undefined : corpo);
}

/* ---------------------------------------------------------------------------
   Roteador
   --------------------------------------------------------------------------- */
const mb = (n) => Math.round(n / 1048576);
const NOME_NA_FRASE = { trafego: 'Tráfego' };   // o nome técnico não tem acento; a frase é para gente
const NOME_NA_PAGINA = { agenda: 'A Agenda', crm: 'O CRM', comunicar: 'O Comunicar', atendimento: 'O Atendimento', trafego: 'O Tráfego' };
const SO_LEITURA = { Allow: 'GET, HEAD' };

/** rodada 10: no log de pedido lento, pedaço comprido do endereço (token do link do cliente, do feed da agenda) sai cortado. */
export function caminhoParaLog(caminho) {
  return String(caminho || '').split('/').map((p) => (/^[A-Za-z0-9_~-]{16,}$/.test(p) ? p.slice(0, 4) + '…' : p)).join('/').slice(0, 160);
}

/* rodada 10: quem abre um app que não subiu pelo navegador via um JSON cru na tela. Agora vê uma página que explica
   e deixa tentar de novo ou voltar para a Casa. Chamadas de API continuam recebendo o JSON com o erro. */
function paginaForaDoAr(res, nome, prefixo) {
  const quem = NOME_NA_PAGINA[nome] || 'Este app';
  const corpo = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${quem} não abriu · IndyCar Central</title><script src="/casa/tema.js"></script><link rel="stylesheet" href="/casa/casa.css" /></head><body><main class="entrada"><div class="cartao entrada-cartao"><h1 class="entrada-titulo">${quem} não abriu agora</h1><p class="entrada-sub">O resto da Central continua funcionando. Espere um minuto e tente de novo. Se continuar assim, avise o suporte.</p><a class="btn btn-forte" href="${prefixo}/">Tentar de novo</a> <a class="btn-link" href="/">Voltar para a Casa</a></div></main></body></html>`;
  cabecalhos(res, { 'Cache-Control': 'no-store', 'Retry-After': '60' });
  res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo) });
  res.end(corpo);
}

function montar(nome, req, res, resto, busca) {
  const app = APPS[nome];
  if (!app || !app.handler) {
    if (req.method === 'GET' && /\btext\/html\b/.test(String(req.headers.accept || '')) && !/^\/api\//.test(String(resto || ''))) return paginaForaDoAr(res, nome, app?.prefixo || '/' + nome);
    res.setHeader('Retry-After', '60');
    return json(res, 503, { erro: `O ${NOME_NA_FRASE[nome] || nome} não subiu nesta Central. Avise o suporte (o resto continua no ar).`, app: nome });
  }
  // uma barra só no começo: "/trafego//site.example/x" chegaria ao app como "//site.example/x", que new URL() lê como outro site
  req.url = '/' + String(resto || '').replace(/^\/+/, '') + busca;
  req.prefixo = app.prefixo;
  return app.handler(req, res);
}

export async function handler(req, res) {
  let url;
  try { url = new URL(req.url, 'http://central.local'); }
  catch { return json(res, 400, { erro: 'Endereço inválido.' }); }   // rodada 10: com os cabeçalhos de segurança, como toda resposta da Central
  const caminho = url.pathname;
  const busca = url.search || '';
  /* rodada 6: cada pedido tem um número (X-Request-Id) para achar a linha certa no log do Render; aceita o que o proxy já mandou se for curto e simples */
  const recebido = String(req.headers['x-request-id'] || '');
  const idPedido = /^[A-Za-z0-9._-]{6,64}$/.test(recebido) ? recebido : randomUUID();
  res.setHeader('X-Request-Id', idPedido);
  const inicio = Date.now();
  res.on('finish', () => { const ms = Date.now() - inicio; if (ms > 3000) console.warn(`Central: pedido lento ${req.method} ${caminhoParaLog(caminho)} ${res.statusCode} ${ms} ms [${idPedido}]`); });
  // "%" solto / UTF-8 inválido no caminho: 400 aqui, igual para todos (a Agenda respondia 500 por decodeURIComponent)
  try { decodeURIComponent(caminho); } catch { return json(res, 400, { erro: 'Endereço inválido.' }); }

  // 1) saúde e configuração da Central
  const leitura = req.method === 'GET' || req.method === 'HEAD';
  /* rodada 10: as rotas da própria Central só aceitam o método delas. Antes POST ou DELETE em /api/ping e /api/central/config
     respondiam como se fosse leitura, e POST em /api/central/saude-apps ou numa rota /api/central/ que não existe caía na Agenda. */
  if ((caminho === '/api/ping' || caminho === '/api/central/config' || caminho === '/api/central/saude-apps') && !leitura) return json(res, 405, { erro: 'Use GET.' }, SO_LEITURA);
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
      /* rodada 13B: o Orçador está servido aqui em /orcador/ (mesmo endereço, mesmo login): a Casa leva para lá, não para o Netlify */
      orcadorNaCentral: orcadorLocal(),
    });
  }

  if (caminho === '/api/central/saude-apps') {
    // só "está respondendo?" de dois sites públicos — nada sensível; o cache de 40 s protege os sites de enxurrada
    const cf = String(req.headers['cf-connecting-ip'] || '').trim(); // Cloudflare troca este cabeçalho: não dá para forjar
    const ip = /^[0-9a-f.:]{3,45}$/i.test(cf) ? cf : String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim().slice(0, 64);
    if (!dentroDoFreioDaSaude(ip)) { res.setHeader('Retry-After', '30'); return json(res, 429, { erro: 'Muitas perguntas seguidas. Espere meio minuto.' }); }
    return json(res, 200, { ...(await saudeDosApps()), internos: internosDaCentral(), central: { versao: VERSAO_CENTRAL, no_ar_desde: NO_AR_DESDE } });
  }

  // 1a) rodada 7: links do cliente (Minha IndyCar, indique, acompanhar) para a ficha da Casa — só equipe logada
  if (caminho === '/api/central/links-cliente') {
    const r = await LINKS_CLIENTE.tratar(req);
    return json(res, r.status, r.corpo, r.cabecalhos);
  }
  if (caminho === '/api/central/faturamento') {
    const r = await FATURAMENTO.tratar(req);
    return json(res, r.status, r.corpo, { 'Cache-Control': 'no-store', ...(r.cabecalhos || {}) });
  }
  if (caminho === '/api/central' || caminho.startsWith('/api/central/')) return json(res, 404, { erro: 'Essa rota da Central não existe.' });

  // 1a') rodada 11: o Orçador mora aqui dentro (apps/orcador/, aberto também na aba Orçador do Atendimento)
  if ((caminho === '/orcador' || caminho.startsWith('/orcador/')) && orcadorLocal()) {
    if (caminho === '/orcador') return redirecionar(res, '/orcador/' + busca);
    return servirOrcador(req, res, caminho.slice('/orcador'.length));
  }

  // 1b) rodada 6: /patio (e /orcador, se o build não estiver aqui) moram em outro domínio (Netlify) — quem digita o atalho na Central cai no lugar certo
  for (const [nome, base] of [['patio', urlDeApp(process.env.PATIO_URL, PATIO_PADRAO)], ['orcador', urlDeApp(process.env.ORCADOR_URL, ORCADOR_PADRAO)]]) {
    const p = '/' + nome;
    if (base && (caminho === p || caminho.startsWith(p + '/'))) {
      const resto = caminho.slice(p.length);
      cabecalhos(res, { 'Cache-Control': 'no-store' });
      res.writeHead(302, { Location: base.replace(/\/+$/, '') + resto + busca, 'Content-Length': 0 });
      return res.end();
    }
  }

  /* 1c) rodada 20: CRM, Atendimento e Orçador são um app só, em /crm/. A página do Atendimento aberta direto (links antigos
     da Casa, Agenda, Pátio e Tráfego, atalho instalado) vai para lá com o endereço antigo junto; a API, os arquivos e a
     moldura ("?embutido=1") continuam com o Atendimento. 302 e sem cache: um redirecionamento permanente ficaria preso
     no navegador de cada pessoa. Sem o CRM no ar, a página do Atendimento abre como antes. */
  const unificado = APPS.crm?.handler && APPS.atendimento?.handler ? destinoDoAtendimento(caminho, busca, req.method) : null;
  if (unificado) {
    cabecalhos(res, { 'Cache-Control': 'no-store' });
    res.writeHead(302, { Location: unificado, 'Content-Length': 0 });
    return res.end();
  }

  // 2) os apps por prefixo (agenda, crm, comunicar, atendimento, trafego)
  for (const nome of ORDEM) {
    const p = APPS[nome]?.prefixo || '/' + nome;
    if (caminho === p) return redirecionar(res, p + '/' + busca);
    if (caminho.startsWith(p + '/')) return montar(nome, req, res, caminho.slice(p.length), busca);
  }

  // 3) raiz: Casa — mas links antigos da Agenda ("/?agendamento=x", "/?r=agenda"…) vão para /agenda/
  /* rodada 6: /?busca=<termo> é da Casa (outros apps linkam assim para abrir a busca global); qualquer outra consulta continua indo para a Agenda */
  /* rodada 8: /?voltar=<caminho> também é da Casa (o Tráfego manda quem está sem sessão entrar e voltar) */
  if ((caminho === '/' || caminho === '/index.html') && busca && !url.searchParams.has('busca') && !url.searchParams.has('voltar')) return redirecionar(res, '/agenda/' + busca);
  if (req.method === 'GET' || req.method === 'HEAD') {
    const item = CASA.get(caminho);
    if (item) return servirCasa(req, res, item, caminho, url.searchParams.get('v') || '');
  }
  // rodada 10: arquivo da Casa só se lê (POST ou DELETE em /casa/… respondia "não encontrado", como se o arquivo não existisse)
  else if (caminho.startsWith('/casa/') && CASA.has(caminho)) return json(res, 405, { erro: 'Use GET.' }, SO_LEITURA);
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
 *  (timer, evento) não derruba os outros; enxurrada (>= 25 em 1 minuto) reinicia pelo Render. */
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
