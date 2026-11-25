// Rodada 15 · service worker LIGADO, duas visitas, zero erro; confere linha por dia, Puladas, barra de falhas, celular 375.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = process.env.ORIGEM || 'http://localhost:3511';
const require = createRequire(import.meta.url);
const puppeteer = require(path.join(aqui, '../../../../indycar-ferramentas/node_modules/puppeteer-core'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-background-networking'] });
const falhas = [];
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALHOU', m); if (!c) falhas.push(m); };
try {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.setRequestInterception(true);
  page.on('request', (r) => (new URL(r.url()).origin !== origem ? r.abort('blockedbyclient') : r.continue()));
  await page.setViewport({ width: 375, height: 812 });
  for (const visita of [1, 2]) {
    await page.goto(origem + '/?papel=admin', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1500));
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return { ativo: !!r?.active || !!r?.installing || !!r?.waiting }; });
    ok(sw.ativo, `visita ${visita}: service worker registrado`);
    ok(await page.evaluate(() => !!window.R15), `visita ${visita}: rodada15.js carregou`);
    ok(await page.evaluate(() => !/Não deu para abrir/.test(document.querySelector('#view').textContent)), `visita ${visita}: Réguas abriram`);
  }
  await page.$eval('.nav-item[data-route="mensagens"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 });
  ok((await page.$$('#listaEnvios .dia-cab')).length >= 3, 'Mensagens: linhas de dia aparecem');
  const rot = await page.$$eval('#listaEnvios .dia-cab', (e) => e.map((x) => x.textContent));
  console.log('   dias:', rot.join(' | '));
  await page.$eval('.pilula[data-filtro="pulado"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 });
  ok(await page.evaluate(() => document.querySelector('.pilula.ativa')?.dataset.filtro === 'pulado'), 'pílula Puladas fica ativa');
  await page.$eval('.pilula[data-filtro="falhou"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 });
  const barra = await page.evaluate(() => { const b = document.querySelector('#barraFalhas'); const bt = b?.querySelector('button'); return { visivel: !!b && !b.hidden && getComputedStyle(b).display !== 'none', txt: b?.textContent.trim().replace(/\s+/g, ' '), alt: bt ? Math.round(bt.getBoundingClientRect().height) : 0 }; });
  console.log('   barra:', JSON.stringify(barra));
  ok(barra.visivel && barra.alt >= 44, 'Falharam: barra "voltar para a fila" visível e com toque de 44 px');
  await page.screenshot({ path: path.join(aqui, '..', 'qa-out', 'r15', 'depois-falharam-375.png'), fullPage: false });
  await page.$eval('#reenviarTodas', (b) => b.click());
  await new Promise((r) => setTimeout(r, 1200));
  ok(await page.evaluate(() => /voltou|voltaram/.test(document.querySelector('#toast').textContent)), 'reenviar em lote avisa o resultado');
  await page.$eval('.nav-item[data-route="campanhas"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 });
  ok(await page.evaluate(() => !/\{primeiro_nome\}|\{carro\}/.test(document.querySelector('.aprov-panel')?.textContent || '')), 'Aprovação sem variáveis cruas');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral no celular');
  ok(erros.length === 0, 'zero erro de console' + (erros.length ? ': ' + erros.join(' | ') : ''));
} finally { await browser.close(); }
if (falhas.length) process.exitCode = 1;
