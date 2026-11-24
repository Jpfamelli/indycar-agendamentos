// Casa R14 — a abertura da Central de verdade (handler real, porto local, Supabase bloqueado) com o SERVICE WORKER LIGADO e
// DUAS visitas, como pede o roteiro da rodada para mudança em service worker/CSP/login:
//   - nenhuma violação de CSP e nenhum erro de console nas duas visitas;
//   - o service worker assume na 2ª visita e o supabase-js carrega;
//   - a configuração do login (/api/central/config) é pedida UMA vez por visita e começa ANTES de o casa.js terminar de baixar
//     (é o ganho da rodada: o pedido sai do <head>, em paralelo com os scripts);
//   - a tela de entrar aparece.
// Uso: node scripts/qa-r14-abertura.mjs [pasta-das-fotos]
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const SAIDA = resolve(process.argv[2] || resolve(RAIZ, 'qa-out/r14'));
mkdirSync(SAIDA, { recursive: true });

const PROJETO = 'nppfqhavqahapmugnyng.supabase.co';
Object.assign(process.env, {
  SUPABASE_URL: `https://${PROJETO}`, SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;
// o servidor também não fala com o Supabase de verdade
const fetchDeVerdade = globalThis.fetch;
globalThis.fetch = (url, ...resto) => (String(url && url.url ? url.url : url).includes(PROJETO)
  ? Promise.reject(new TypeError('QA sem rede: Supabase bloqueado')) : fetchDeVerdade(url, ...resto));
const central = await import(resolve(RAIZ, 'central.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
await central.iniciarCentral({ ouvir: false });
let configs = 0;
const srv = http.createServer((req, res) => { if (req.url.startsWith('/api/central/config')) configs++; return central.handler(req, res); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const BASE = `http://localhost:${srv.address().port}`;

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--no-sandbox', '--disable-background-networking', `--host-resolver-rules=MAP ${PROJETO} 127.0.0.1:9`],
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push('pageerror: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED|net::ERR/.test(m.text())) erros.push('console: ' + m.text().slice(0, 240)); });
await page.evaluateOnNewDocument(() => {
  window.__violacoes = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__violacoes.push(`${e.violatedDirective} ${e.blockedURI || ''}`.trim()));
});
await page.setViewport({ width: 1280, height: 860 });
let ok = true;
const dizer = (cond, msg) => { console.log((cond ? 'ok      ' : 'FALHOU  ') + msg); if (!cond) ok = false; };
for (let v = 1; v <= 2; v++) {
  configs = 0;
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });
  if (v === 1) {
    await page.evaluate(() => (navigator.serviceWorker ? Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 8000))]) : null));
    await espera(800);
  }
  await page.waitForSelector('#fLogin:not([hidden]), #lTentar:not([hidden])', { timeout: 8000 }).catch(() => {});
  const info = await page.evaluate(() => {
    const rec = performance.getEntriesByType('resource');
    const cfg = rec.find((r) => r.name.includes('/api/central/config'));
    const casa = rec.find((r) => /\/casa\/casa\.js/.test(r.name));
    return {
      controlado: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      supabase: !!(window.supabase && window.supabase.createClient),
      violacoes: window.__violacoes.slice(),
      entrar: !document.querySelector('#fLogin').hidden,
      cfgInicio: cfg ? Math.round(cfg.startTime) : null, casaFim: casa ? Math.round(casa.responseEnd) : null,
    };
  });
  console.log(`visita ${v}:`, JSON.stringify(info));
  dizer(info.violacoes.length === 0, `visita ${v}: nenhuma violação de CSP`);
  dizer(info.supabase, `visita ${v}: supabase-js carregou`);
  dizer(info.entrar, `visita ${v}: a tela de entrar aparece`);
  dizer(configs === 1, `visita ${v}: a configuração do login foi pedida ${configs} vez(es) ao servidor`);
  if (v === 2) dizer(info.controlado, 'visita 2: o service worker está no controle');
  await page.screenshot({ path: resolve(SAIDA, `abertura-visita${v}.png`) });
}
dizer(erros.length === 0, 'nenhum erro de console' + (erros.length ? ': ' + erros.join(' || ') : ''));
await browser.close();
srv.close();
setTimeout(() => process.exit(ok ? 0 : 1), 100).unref();
