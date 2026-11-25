// Rodada 16 · confere niveis de titulo (sem pulo) e bordas grossas de um lado so em cada aba (mock, porta ORIGEM).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = process.env.ORIGEM || 'http://localhost:3516';
const require = createRequire(import.meta.url);
const puppeteer = require(path.join(aqui, '../../../../indycar-ferramentas/node_modules/puppeteer-core'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-background-networking'] });
let ruim = 0;
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => (new URL(r.url()).origin !== origem ? r.abort('blockedbyclient') : r.continue()));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(origem + '/?papel=admin', { waitUntil: 'networkidle0' });
  for (const aba of ['reguas', 'mensagens', 'campanhas', 'clientes', 'ajustes']) {
    await page.$eval(`.nav-item[data-route="${aba}"]`, (b) => b.click());
    await page.waitForNetworkIdle({ idleTime: 400 });
    await new Promise((r) => setTimeout(r, 600));
    const r = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => h.offsetParent);
      const pulos = []; let ant = 0;
      for (const h of hs) { const n = +h.tagName[1]; if (ant && n > ant + 1) pulos.push(`${h.tagName} depois de H${ant}: ${h.textContent.trim().slice(0, 30)}`); ant = n; }
      const grossas = [];
      for (const el of document.querySelectorAll('#view *')) {
        if (!el.offsetParent) continue; const c = getComputedStyle(el);
        const l = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(c['border' + s + 'Width']) * (c['border' + s + 'Style'] !== 'none'));
        const mx = Math.max(...l); const n = l.filter((x) => x > 0).length;
        if (mx >= 3 && n === 1) grossas.push(el.className || el.tagName);
      }
      return { niveis: hs.map((h) => h.tagName[1]).join(''), pulos, grossas: [...new Set(grossas)] };
    });
    console.log(aba, JSON.stringify(r)); ruim += r.pulos.length + r.grossas.length;
  }
} finally { await browser.close(); }
if (ruim) process.exitCode = 1;
