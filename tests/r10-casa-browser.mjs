// Casa no Chrome, rodada 10: PROVAS de conexão, falha de rede, clique duplo e duas abas, com o Supabase de mentira
// (tests/r10-casa-mock/supabase-falso.js + os dados inventados de tests/r9-casa-mock/dados.js). Nada sai para a rede:
// todo pedido é respondido pela interceptação do Chrome, e nada é gravado em banco nenhum.
//
//   node tests/r10-casa-browser.mjs                  → roda todas as provas (ok/FALHOU) e sai com 1 se alguma falhar
//   node tests/r10-casa-browser.mjs --antes <pasta>  → as mesmas provas na Casa de <pasta>/casa (git archive de um commit)
//   node tests/r10-casa-browser.mjs --so <pedaço>    → só as provas cujo nome contém o pedaço
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const BASE = 'http://localhost:3522';
const arg = (nome) => { const i = process.argv.indexOf(nome); return i > 0 ? process.argv[i + 1] : ''; };
const FONTE = arg('--antes') ? resolve(arg('--antes')) : RAIZ;
const SO = arg('--so');
const MOCK = readFileSync(join(AQUI, 'r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(AQUI, 'r10-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: resolve(RAIZ, 'qa-out/r10/perfil-chrome'), args: ['--no-sandbox', '--disable-background-networking'] });
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok, detalhe }); console.log(`${ok ? 'ok     ' : 'FALHOU '} ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`); };

/**
 * Abre a Casa num cenário. Além do que o Supabase de mentira entende (papel, sessao, falhar, pendurar, erros, atraso, mfa,
 * semRenovar), o cenário aceita: configFalha (quantas vezes /api/central/config responde 500), saudeFalha (a saúde dos
 * apps responde 500), linksPendurado (os links do cliente nunca respondem), ls ({ chave: valor } no localStorage).
 */
async function abrir(cenario = {}, { esperar = null } = {}) {
  const page = await browser.newPage();
  const erros = [];
  const rede = { config: 0, saude: 0, links: 0, configFalha: Number(cenario.configFalha) || 0, saudeFalha: !!cenario.saudeFalha };
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((c) => {
    window.__CENARIO = c; window.__ABAS = [];
    window.open = (url, nome) => { window.__ABAS.push([String(url), String(nome)]); return { focus() {} }; };
    try { if (!sessionStorage.getItem('__aba_limpa')) { localStorage.clear(); sessionStorage.setItem('__aba_limpa', '1'); for (const [k, v] of Object.entries(c.ls || {})) localStorage.setItem(k, v); } } catch { /* segue */ }
    try { localStorage.setItem('indycar_tema', 'escuro'); if (!localStorage.getItem('indycar_central_visao')) localStorage.setItem('indycar_central_visao', 'operacao'); } catch { /* segue */ }
  }, cenario);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') { rede.config++; return rede.config <= rede.configFalha ? json({ erro: 'fora' }, 500) : json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'chave-de-mentira', versao: 'r10', apps: {} }); }
    if (u.pathname === '/api/central/saude-apps') { rede.saude++; return rede.saudeFalha ? json({ erro: 'fora' }, 500) : json({ verificado_em: Date.now(), apps: {}, internos: {} }); }
    if (u.pathname === '/api/central/links-cliente') { rede.links++; if (cenario.linksPendurado) return; return json({ ok: true, nome: 'Gabi Inventada', aceita_mensagens: true, minha: 'https://indycar-patio.netlify.app/minha/?c=tok', indique: null, acompanhar: null, os: null }); }
    if (u.pathname.startsWith('/agenda/api/')) return json([]);
    if (u.pathname === '/sw.js') return req.respond({ status: 404, body: '' });
    const caminho = u.pathname === '/' ? '/casa/index.html' : u.pathname;
    const arq = join(FONTE, caminho);
    if (!/^\/casa\/[\w.-]+$/.test(caminho) || !existsSync(arq)) return req.respond({ status: 404, body: '' });
    const corpo = caminho.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
    return req.respond({ status: 200, contentType: TIPOS[caminho.slice(caminho.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(esperar || (cenario.sessao === false ? '#fLogin:not([hidden])' : cenario.mfa ? '#fMfa:not([hidden])' : '#casa:not([hidden])'), { timeout: 8000 });
  await espera(700);
  return { page, erros, rede };
}
const lidas = (page, nome) => page.evaluate((n) => window.__LIDO.filter((x) => x === n).length, nome);
const gravadas = (page, tabela, acao) => page.evaluate((t, a) => window.__GRAVADO.filter((x) => x.tabela === t && (!a || x.acao === a)).length, tabela, acao || '');
const visivel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);
const texto = (page, sel) => page.evaluate((s) => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim(), sel);
/** a aba "voltou a ficar visível" (o Chrome sem tela não troca de aba de verdade) */
const voltarParaAAba = (page) => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
/** adianta o relógio da página (Date.now) sem esperar de verdade */
const adiantar = (page, ms) => page.evaluate((d) => { const real = Date.now.bind(Date); const base = (window.__ADIANTADO || 0) + d; window.__ADIANTADO = base; const orig = window.__AGORA_REAL || (window.__AGORA_REAL = real); Date.now = () => orig() + base; }, ms);

const PROVAS = [];
const prova = (nome, fn) => PROVAS.push([nome, fn]);

/* ---------- lote 2: tarefas e sino (clique duplo, tempo real em rajada, rede e aba que voltam) ---------- */
prova('r10-adiar-duplo', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', atraso: 250 });
  const antes = await gravadas(page, 'tarefas', 'update');
  // dois toques seguidos em "adiar 1 dia" da mesma tarefa, sem esperar o banco responder
  const id = await page.evaluate(() => {
    const b = document.querySelector('#listaTarefas [data-adiar]'); const id = b.dataset.adiar;
    b.click(); document.querySelector('#listaTarefas [data-adiar="' + id + '"]').click();
    return id;
  });
  await espera(900);
  const escritas = await page.evaluate((i) => window.__GRAVADO.filter((x) => x.tabela === 'tarefas' && x.acao === 'update' && x.valor && x.valor.vence_em && x.filtros.some((f) => f[2] === i)).map((x) => x.valor.vence_em), id);
  conferir('r10-adiar-duplo: dois toques em "adiar 1 dia" gravam uma vez só', escritas.length === 1 && (await gravadas(page, 'tarefas', 'update')) - antes === 1, escritas.length + ' gravações');
  // depois que o banco respondeu, adiar de novo volta a valer
  await page.evaluate((i) => document.querySelector('#listaTarefas [data-adiar="' + i + '"]').click(), id);
  await espera(600);
  conferir('r10-adiar-duplo: passado o primeiro, um novo toque adia de novo', (await gravadas(page, 'tarefas', 'update')) - antes === 2);
});

prova('r10-rajada', async (abrir) => {
  const { page } = await abrir({ papel: 'admin' });
  const t0 = await lidas(page, 'tarefas'), n0 = await lidas(page, 'notificacoes');
  await page.evaluate(() => { window.__EMITIR('tarefas', 8); window.__EMITIR('notificacoes', 8); });
  await espera(1200);
  const t = (await lidas(page, 'tarefas')) - t0, n = (await lidas(page, 'notificacoes')) - n0;
  conferir('r10-rajada: 8 mudanças juntas nas tarefas viram 1 leitura', t === 1, t + ' leituras');
  conferir('r10-rajada: 8 avisos juntos no sino viram 1 leitura', n === 1, n + ' leituras');
});

prova('r10-rede-voltou', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', falhar: ['tarefas', 'notificacoes'] });
  conferir('r10-rede-voltou: com a leitura falhando, as tarefas dizem que não leram', /Não consegui ler as tarefas/.test(await texto(page, '#listaTarefas')));
  await page.evaluate(() => { window.__R10.falhar.clear(); window.dispatchEvent(new Event('online')); });
  await espera(700);
  conferir('r10-rede-voltou: a internet voltou e as tarefas aparecem sozinhas', (await page.$$('#listaTarefas li[data-tid]')).length > 0, await texto(page, '#listaTarefas').then((x) => x.slice(0, 60)));
  const n = await page.evaluate(() => window.Casa.sino.lista().length);
  conferir('r10-rede-voltou: o sino também relê na hora', n > 0, n + ' avisos');
});

prova('r10-tarefas-aba', async (abrir) => {
  const { page } = await abrir({ papel: 'admin' });
  const t0 = await lidas(page, 'tarefas');
  await voltarParaAAba(page);
  await espera(400);
  conferir('r10-tarefas-aba: voltar à aba logo depois de ler não relê', (await lidas(page, 'tarefas')) - t0 === 0);
  await adiantar(page, 61_000);
  await voltarParaAAba(page);
  await espera(500);
  conferir('r10-tarefas-aba: voltar à aba depois de mais de 1 minuto relê as tarefas', (await lidas(page, 'tarefas')) - t0 === 1, ((await lidas(page, 'tarefas')) - t0) + ' leituras');
});

// === FIM DAS PROVAS ===
try {
  for (const [nome, fn] of PROVAS) {
    if (SO && !nome.includes(SO)) continue;
    let aberta = null;
    try { await fn((...a) => abrir(...a).then((x) => (aberta = x))); }
    catch (e) { conferir(nome, false, 'quebrou: ' + String(e.message).slice(0, 110)); }
    try { if (aberta) await aberta.page.close(); } catch { /* já fechou */ }
  }
} finally { await browser.close(); }
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} conferências ok` + (falhas.length ? ` · FALHARAM: ${falhas.map((f) => f.nome).join(' | ')}` : ''));
process.exit(falhas.length ? 1 : 0);
