import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');
const origem = 'http://localhost:3471';
const pasta = new URL('../qa-out/r9/', import.meta.url);
await mkdir(pasta, { recursive: true });
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
        const capturar = async (secao, seletor) => {
          await page.waitForSelector(seletor, { visible: true });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, secao);
          await page.screenshot({ path: fileURLToPath(new URL(`${secao}-${largura}-${tema}.png`, pasta)) });
        };
        await page.evaluate(() => route('reguas'));
        await capturar('reguas', '#btnSalvarTopo');
        assert.equal(await page.evaluate(async () => {
          const campo = document.querySelector('#cfg_lim');
          campo.value = String(Number(campo.value) + 1);
          campo.dispatchEvent(new Event('input'));
          document.querySelector('#btnDescartar').click();
          await new Promise(resolve => {
            const observar = new MutationObserver(() => {
              if (!document.querySelector('#btnSalvarTopo') || campo.isConnected) return;
              observar.disconnect();
              resolve();
            });
            observar.observe(document.querySelector('main'), { subtree: true, childList: true });
          });
          return document.querySelector('#barraSalvar').hidden;
        }), true);
        await page.evaluate(() => route('clientes'));
        await capturar('clientes', '#cliLista');
        await page.type('#qCli', '000XYZ000');
        await page.waitForFunction(() => document.querySelector('#cliContagem')?.textContent.includes('0 encontrados'));
        await page.evaluate(() => route('satisfacao'));
        await capturar('satisfacao', '#sat_salvar');
        await page.$eval('#sat_salvar', el => el.click());
        assert.equal(await page.evaluate(() => document.activeElement.id), 'sat_busca');
        await page.$eval('[data-sat="0"]', el => el.click());
        assert.equal(await page.$eval('[data-sat="0"]', el => el.getAttribute('aria-pressed')), 'true');
        console.log(`Réguas, Clientes e Satisfação: ${largura}px ${tema}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
