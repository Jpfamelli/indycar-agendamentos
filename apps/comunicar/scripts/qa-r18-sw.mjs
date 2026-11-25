// Rodada 18 · roteiro de navegador com o service worker LIGADO, duas visitas, celular 375.
// WhatsApp parado (padrão do mock): réguas ligadas "Retida", campanhas "retidas" + aviso único, Mensagens "Retida",
// aprovar avisa que fica retida. Depois ?saude=ok: nada de "Retida" e a "Próxima saída" volta.
// Uso: PORT=3518 node scripts/mock-server.mjs  e  ORIGEM=http://localhost:3518 node scripts/qa-r18-sw.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = process.env.ORIGEM || 'http://localhost:3518';
const require = createRequire(import.meta.url);
const puppeteer = require(path.join(aqui, '../../../../indycar-ferramentas/node_modules/puppeteer-core'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-background-networking'] });
const falhas = [];
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALHOU', m); if (!c) falhas.push(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  const erros = [], dialogos = [];
  page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss(); });   // NÃO aprova: só lê o aviso
  await page.setRequestInterception(true);
  page.on('request', (r) => (new URL(r.url()).origin !== origem ? r.abort('blockedbyclient') : r.continue()));
  await page.setViewport({ width: 375, height: 812 });
  for (const visita of [1, 2]) {
    await page.goto(origem + '/?papel=admin&semente=1&saude=parado', { waitUntil: 'networkidle0' });
    await espera(1800);
    ok(await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!(r?.active || r?.installing || r?.waiting); }), `visita ${visita}: service worker registrado`);
    ok(await page.evaluate(() => !!window.R18), `visita ${visita}: rodada18.js carregou`);
  }
  const reguas = await page.evaluate(() => [...document.querySelectorAll('[data-proxima]')].map((el) => ({
    tipo: el.dataset.proxima, ligada: !!document.querySelector(`[data-cfg="ativo_${el.dataset.proxima}"]`)?.checked,
    selo: el.previousElementSibling?.classList.contains('r18-retida') ? el.previousElementSibling.textContent : null, texto: el.textContent })));
  const ligadas = reguas.filter((r) => r.ligada), desligadas = reguas.filter((r) => !r.ligada);
  console.log('   ', ligadas.map((r) => `${r.tipo}: ${r.selo} | ${r.texto}`).join('\n    '));
  ok(ligadas.length > 0 && ligadas.every((r) => /^Retida/.test(r.selo || '') && !/Próxima saída/.test(r.texto)), 'réguas ligadas: selo Retida, sem "Próxima saída"');
  ok(ligadas.some((r) => /na fila/.test(r.selo)) && ligadas.some((r) => /sozinha/.test(r.texto)), 'régua com fila mostra quantas e que sai sozinha');
  ok(desligadas.every((r) => !r.selo && /Desligada/.test(r.texto)), 'réguas desligadas seguem "Desligada: nada sai."');

  await page.$eval('.nav-item[data-route="mensagens"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 }); await espera(500);
  ok(await page.evaluate(() => /Retida/.test(document.querySelector('#listaEnvios')?.textContent || '') && /retida: era para/.test(document.querySelector('#listaEnvios').textContent)), 'Mensagens: pendente aparece "Retida" (não "sai")');

  await page.$eval('.nav-item[data-route="campanhas"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 }); await espera(700);
  const aviso = await page.evaluate(() => document.querySelector('.r18-aviso')?.textContent || '');
  ok(/retidas na fila, nenhuma saiu/.test(aviso), 'Campanhas: aviso único das retidas');
  ok(await page.evaluate(() => /\d+ retidas?/.test(document.querySelector('.camp')?.textContent || '')), 'Histórico: "N retidas" no lugar de "N na fila"');
  ok(await page.evaluate(() => { const a = document.querySelector('.r18-aviso'), b = document.querySelector('#aprovacoes'); return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'aviso fica no alto, antes das aprovações');
  const aprovar = await page.$('[data-aprovar]');
  if (aprovar) { await aprovar.click(); await espera(300); ok(/ficam RETIDAS/.test(dialogos.at(-1) || ''), 'Aprovar avisa que fica retida (cancelado no diálogo, nada aprovado)'); }
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral no celular');
  const toque = await page.$$eval('.camp button, .aprov button', (bs) => bs.filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).length);
  ok(toque === 0, 'botões das campanhas com 44 px');

  // WhatsApp de volta: nada de "Retida"
  await page.goto(origem + '/?papel=admin&saude=ok', { waitUntil: 'networkidle0' });
  await espera(2000);
  ok(await page.evaluate(() => !document.querySelector('.r18-retida') && [...document.querySelectorAll('[data-proxima]')].some((e) => /Próxima saída/.test(e.textContent))), 'WhatsApp no ar: réguas sem "Retida", "Próxima saída" normal');
  await page.$eval('.nav-item[data-route="campanhas"]', (b) => b.click());
  await page.waitForNetworkIdle({ idleTime: 400 }); await espera(700);
  ok(await page.evaluate(() => !document.querySelector('.r18-aviso') && !/retida/i.test(document.querySelector('#view').textContent)), 'WhatsApp no ar: Campanhas sem aviso de retida');
  ok(erros.length === 0, 'zero erro de console' + (erros.length ? ': ' + erros.join(' | ') : ''));
} finally {
  await browser.close();
}
if (falhas.length) process.exitCode = 1;
