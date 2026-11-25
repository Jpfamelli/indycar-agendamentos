// Rodada 16 · service worker LIGADO, duas visitas, zero erro; confere pílulas de Clientes, "sem telefone", texto do segmento, celular 375.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = process.env.ORIGEM || 'http://localhost:3516';
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
    ok(await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!(r?.active || r?.installing || r?.waiting); }), `visita ${visita}: service worker registrado`);
    ok(await page.evaluate(() => !!window.R16), `visita ${visita}: rodada16.js carregou`);
    ok(await page.evaluate(() => !/Não deu para abrir/.test(document.querySelector('#view').textContent)), `visita ${visita}: Réguas abriram`);
  }
  await page.$eval('.nav-item[data-route="clientes"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 });
  const total = await page.$$eval('#cliLista .cli', (e) => e.length);
  const pil = await page.$$eval('#cliPilulas .pilula', (e) => e.map((x) => x.textContent.trim() + '|' + Math.round(x.getBoundingClientRect().height)));
  console.log('   pílulas:', pil.join(' ; '), '· linhas', total);
  ok(pil.length === 4 && pil.every((p) => +p.split('|')[1] >= 44), 'pílulas de Clientes com toque de 44 px');
  await page.$eval('[data-cli-filtro="sem_telefone"]', (b) => b.click());
  ok((await page.$$('#cliLista .cli')).length === 1 && await page.evaluate(() => /sem telefone/i.test(document.querySelector('#cliLista').textContent)), 'filtro Sem telefone mostra 1 cliente com o selo');
  await page.$eval('[data-cli-filtro="fora"]', (b) => b.click());
  ok((await page.$$('#cliLista .cli')).length === 2, 'filtro Fora da lista mostra 2');
  await page.$eval('#qCli', (i) => { i.value = 'zzzz'; i.dispatchEvent(new Event('input')); });
  await new Promise((r) => setTimeout(r, 900));
  ok(await page.evaluate(() => !!document.querySelector('#cliLista .vazio') && !document.querySelector('#cliPilulas .pilula')), 'busca sem resultado: vazio e pílulas somem sem prender o filtro');
  await page.screenshot({ path: path.join(aqui, '..', 'qa-out', 'r16', 'depois-clientes-vazio-375.png') });
  await page.$eval('#qCli', (i) => { i.value = ''; i.dispatchEvent(new Event('input')); });
  await new Promise((r) => setTimeout(r, 900));
  ok((await page.$$('#cliLista .cli')).length === total, 'limpar a busca volta à lista inteira');
  await page.$eval('.nav-item[data-route="campanhas"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 });
  await new Promise((r) => setTimeout(r, 600));
  ok(await page.evaluate(() => !/de N meses|\bN dias\b/.test(document.querySelector('#view').textContent)), 'Campanhas sem "N" cru');
  ok(await page.evaluate(() => /mais de 6 meses/.test(document.querySelector('#view').textContent)), 'Campanhas mostram "mais de 6 meses"');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral no celular');
  ok(erros.length === 0, 'zero erro de console' + (erros.length ? ': ' + erros.join(' | ') : ''));
} finally { await browser.close(); }
if (falhas.length) process.exitCode = 1;
