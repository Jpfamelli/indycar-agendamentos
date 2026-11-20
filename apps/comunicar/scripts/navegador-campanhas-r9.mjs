import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');
const origem = 'http://localhost:3471';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-networking'],
});

try {
  for (const largura of [375, 1440]) {
    for (const tema of ['claro', 'escuro']) {
      const page = await browser.newPage();
      try {
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', request => {
          const url = new URL(request.url());
          const leitura = ['GET', 'HEAD'].includes(request.method());
          return url.origin === origem && leitura ? request.continue() : request.abort('blockedbyclient');
        });
        await page.setViewport({ width: largura, height: 900 });
        await page.evaluateOnNewDocument(tema => localStorage.setItem('indycar_tema', tema), tema);
        await page.goto(origem + '/?papel=admin', { waitUntil: 'networkidle0' });
        await page.waitForSelector('.inicio-detalhes');
        await page.evaluate(async () => {
          await route('campanhas');
          await window.openCampanhaModal();
        });
        await page.waitForSelector('#segSalvar');
        assert.equal(await page.$eval('.passo[aria-current]', el => el.dataset.passo), '1');
        const resultados = await page.evaluate(async () => {
          const campo = document.querySelector('#campValor');
          const previa = document.querySelector('#segPrevia');
          campo.value = '2';
          campo.dispatchEvent(new Event('input'));
          document.querySelector('#campAvancar').click();
          const aguardou = previa.getAttribute('aria-busy') === 'true' && !document.querySelector('#campCorpo');
          const semRolagem = document.documentElement.scrollWidth <= innerWidth;
          return { aguardou, semRolagem };
        });
        assert.deepEqual(resultados, { aguardou: true, semRolagem: true });
        const etapa = await page.$eval('.passo[aria-current]', el => el.dataset.passo);
        assert.equal(etapa, '1');
        console.log(`Campanhas: ${largura}px ${tema}, prévia invalidada e avanço bloqueado.`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
