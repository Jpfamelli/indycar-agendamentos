// Casa, rodada 11: fotos antes/depois com o Supabase de mentira (tests/r9-casa-mock + tests/r10-casa-mock). Nada sai
// para a rede: todo pedido é respondido pela interceptação do Chrome.
//
//   node tests/r11-casa-fotos.mjs <pasta-de-saida> [--antes <pasta com casa/ de um commit antigo>]
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const BASE = 'http://localhost:3522';
const arg = (nome) => { const i = process.argv.indexOf(nome); return i > 0 ? process.argv[i + 1] : ''; };
const SAIDA = resolve(process.argv[2] || join(RAIZ, 'qa-out/r11/depois'));
const FONTE = arg('--antes') ? resolve(arg('--antes')) : RAIZ;
mkdirSync(SAIDA, { recursive: true });
const MOCK = readFileSync(join(AQUI, 'r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(AQUI, 'r10-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: resolve(RAIZ, 'qa-out/r11/perfil-chrome'), args: ['--no-sandbox', '--disable-background-networking'] });
let falhou = false;
async function foto(nome, cenario, viewport) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await page.setViewport(viewport);
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((c) => {
    window.__CENARIO = c;
    window.open = () => ({ focus() {} });
    try { localStorage.clear(); localStorage.setItem('indycar_tema', 'escuro'); localStorage.setItem('indycar_central_visao', 'operacao'); } catch { /* segue */ }
  }, cenario);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') return json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'chave-de-mentira', versao: 'r11', apps: {} });
    if (u.pathname === '/api/central/saude-apps') return json({ verificado_em: Date.now(), apps: {}, internos: {} });
    if (u.pathname.startsWith('/agenda/api/')) return json([]);
    const caminho = u.pathname === '/' ? '/casa/index.html' : u.pathname;
    const arq = join(FONTE, caminho);
    if (!/^\/casa\/[\w.-]+$/.test(caminho) || !existsSync(arq)) return req.respond({ status: 404, body: '' });
    const corpo = caminho.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
    return req.respond({ status: 200, contentType: TIPOS[caminho.slice(caminho.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#casa:not([hidden])', { timeout: 8000 });
  await espera(1500);
  const medida = await page.evaluate(() => ({ altura: document.documentElement.scrollHeight, largura: document.documentElement.scrollWidth, tela: innerWidth,
    nums: [...document.querySelectorAll('[data-app-num]:not([hidden])')].map((e) => e.dataset.appNum + '=' + e.textContent) }));
  await page.screenshot({ path: join(SAIDA, nome + '.png'), fullPage: true });
  const rolaDeLado = medida.largura > medida.tela;
  if (erros.length || rolaDeLado) falhou = true;
  console.log(`${nome}: altura ${medida.altura}px${rolaDeLado ? ' ROLA DE LADO' : ''}${medida.nums.length ? ' · números ' + medida.nums.join(' ') : ''}${erros.length ? ' · ERROS ' + erros.join(' | ') : ''}`);
  await page.close();
}
await foto('casa-dono-computador', { papel: 'admin' }, { width: 1440, height: 900 });
await foto('casa-dono-celular', { papel: 'admin' }, { width: 390, height: 844, isMobile: true, hasTouch: true });
await foto('casa-mecanico-celular', { papel: 'mecanico' }, { width: 390, height: 844, isMobile: true, hasTouch: true });
await browser.close();
process.exit(falhou ? 1 : 0);
