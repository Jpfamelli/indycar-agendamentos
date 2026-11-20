import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Rode os dois scripts mock-server.mjs nas portas abaixo antes de abrir o Chrome.
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-networking'],
});

try {
  for (const [app, port] of [['atendimento', 3470], ['comunicar', 3471]]) {
    const origem = `http://localhost:${port}`;
    const dir = new URL(`../../${app}/qa-out/r9/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    for (const largura of [375, 1440]) {
      const page = await browser.newPage();
      try {
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', request => {
          const { origin, protocol } = new URL(request.url());
          const permitido = origin === origem || protocol === 'data:' || protocol === 'blob:';
          return permitido ? request.continue() : request.abort('blockedbyclient');
        });
        await page.setViewport({ width: largura, height: 900 });
        await page.goto(`${origem}/?papel=admin`, { waitUntil: 'networkidle0' });
        const seletor = app === 'atendimento' ? '#filtrosExtras' : '.inicio-detalhes';
        await page.waitForSelector(`${seletor} > summary`, { visible: true });
        assert.equal(await page.$eval(seletor, el => el.open), false);
        await page.screenshot({ path: fileURLToPath(new URL(`depois-${largura}.png`, dir)) });
        await page.focus(`${seletor} > summary`);
        await page.keyboard.press('Enter');
        await page.waitForSelector(`${seletor}[open]`);
        assert.equal(await page.$eval(seletor, el => el.open), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
          `${app} tem rolagem lateral em ${largura}px`);
        console.log(`${app} ${largura}px: painel abre e cabe na tela`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
