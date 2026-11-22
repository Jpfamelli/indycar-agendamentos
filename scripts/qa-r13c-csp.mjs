// R13C — QA das CSPs endurecidas com o SERVICE WORKER LIGADO e DUAS visitas (o defeito do Comunicar em produção só
// aparecia da 2ª visita em diante). Sobe a Central de verdade (handler) num porto local, com o endereço do projeto
// da oficina só para a CSP sair igual à de produção — o navegador NÃO alcança o Supabase (host-resolver-rules manda
// o nome para uma porta fechada). O supabase-js vem do jsDelivr de verdade (público), como em produção.
// Uso: node scripts/qa-r13c-csp.mjs [pasta-das-fotos]
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const SAIDA = resolve(process.argv[2] || resolve(RAIZ, 'qa-out/r13c'));
mkdirSync(SAIDA, { recursive: true });

const PROJETO = 'nppfqhavqahapmugnyng.supabase.co';
Object.assign(process.env, {
  SUPABASE_URL: `https://${PROJETO}`, SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;
// o servidor também não fala com o Supabase de verdade: qualquer pedido ao projeto falha aqui, antes da rede
const fetchDeVerdade = globalThis.fetch;
globalThis.fetch = (url, ...resto) => (String(url && url.url ? url.url : url).includes(PROJETO)
  ? Promise.reject(new TypeError('QA sem rede: Supabase bloqueado')) : fetchDeVerdade(url, ...resto));
const central = await import(resolve(RAIZ, 'central.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
await central.iniciarCentral({ ouvir: false });
const srv = http.createServer(central.handler);
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const BASE = `http://localhost:${srv.address().port}`;

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--no-sandbox', '--disable-background-networking', `--host-resolver-rules=MAP ${PROJETO} 127.0.0.1:9`],
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const resultado = [];

async function conferir(nome, caminho, { lib = true, sw = true, depois = null } = {}) {
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
  const linha = { app: nome, visitas: [] };
  for (let v = 1; v <= 2; v++) {
    if (v === 2) await page.evaluate(() => { try { localStorage.setItem('indycar_tema', 'claro'); } catch { /* segue */ } });
    await page.goto(BASE + caminho, { waitUntil: 'networkidle2', timeout: 30000 });
    if (v === 1) {
      // espera o service worker instalar e assumir (é ele que mudou a 2ª visita do Comunicar)
      await page.evaluate(() => (navigator.serviceWorker ? Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 8000))]) : null));
      await espera(800);
    }
    const info = await page.evaluate(() => ({
      controlado: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      supabase: typeof window.supabase !== 'undefined' && !!window.supabase && typeof window.supabase.createClient === 'function',
      tema: document.documentElement.getAttribute('data-tema'),
      violacoes: window.__violacoes.slice(),
      titulo: document.title,
    }));
    if (depois) Object.assign(info, await depois(page));
    await page.screenshot({ path: resolve(SAIDA, `${nome}-visita${v}.png`) });
    linha.visitas.push(info);
  }
  linha.erros = erros;
  const ok = linha.visitas.every((i) => i.violacoes.length === 0 && (!lib || i.supabase)) && (!sw || linha.visitas[1].controlado) && erros.length === 0;
  linha.ok = ok;
  resultado.push(linha);
  await ctx.close();
}

await conferir('agenda', '/agenda/', {
  depois: async (page) => ({
    // o botão "fechar" das janelas da Agenda (antes onclick="closeModal()") funciona pelo data-acao
    modalFecha: await page.evaluate(() => {
      if (typeof openModal !== 'function') return 'sem openModal';
      openModal('<div class="modal-head"><h3>Teste</h3><button class="modal-close" data-acao="fechar-modal">×</button></div><div class="modal-body"></div>');
      const aberto = document.querySelector('#modalOverlay').classList.contains('open');
      document.querySelector('#modal [data-acao="fechar-modal"]').click();
      return aberto && !document.querySelector('#modalOverlay').classList.contains('open');
    }),
  }),
});
await conferir('confirmar', '/confirmar/?t=abc', { lib: false, sw: false /* a página do cliente é sempre rede, de propósito */, depois: async (page) => ({ cartao: await page.evaluate(() => (document.getElementById('card') || {}).innerText?.slice(0, 120) || '') }) });
await conferir('comunicar', '/comunicar/');
await conferir('atendimento', '/atendimento/');

await browser.close();
srv.close();
for (const l of resultado) {
  console.log(`${l.ok ? '✔' : '✖'} ${l.app}`);
  l.visitas.forEach((i, n) => console.log(`   visita ${n + 1}: sw=${i.controlado} supabase-js=${i.supabase} tema=${i.tema} violações=${i.violacoes.length ? i.violacoes.join(' | ') : 0}${i.modalFecha !== undefined ? ' fechar-modal=' + i.modalFecha : ''}${i.cartao !== undefined ? ' cartão="' + i.cartao.replace(/\s+/g, ' ') + '"' : ''}`));
  if (l.erros.length) console.log('   erros: ' + l.erros.join(' || '));
}
console.log(`fotos em ${SAIDA}`);
setTimeout(() => process.exit(resultado.every((l) => l.ok) ? 0 : 1), 100).unref();
