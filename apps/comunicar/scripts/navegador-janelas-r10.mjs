import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { confereMock } from './confere-mock-r10.mjs';

const origem = 'http://localhost:3471';
await confereMock(origem, 'comunicar');
const versaoAnterior = process.env.APP_JS_ANTERIOR
  ? await readFile(process.env.APP_JS_ANTERIOR, 'utf8') : null;
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-networking'],
});

try {
  for (const largura of [375, 1440]) {
    for (const tema of ['claro', 'escuro']) {
      const page = await browser.newPage();
      try {
        const falhar = new Map();
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.origin !== origem || !['GET', 'HEAD'].includes(request.method())) {
            return request.abort('blockedbyclient');
          }
          if (versaoAnterior && url.pathname === '/app.js') {
            return request.respond({ contentType: 'application/javascript', body: versaoAnterior });
          }
          const responder = falhar.get(url.pathname);
          if (responder) {
            falhar.delete(url.pathname);
            return responder(request);
          }
          return request.continue();
        });
        await page.setViewport({ width: largura, height: 900 });
        await page.evaluateOnNewDocument(valor => localStorage.setItem('indycar_tema', valor), tema);
        await page.goto(origem + '/?papel=admin', { waitUntil: 'networkidle0' });
        await page.waitForSelector('.inicio-detalhes');

        for (const [funcao, rota, corpo] of [
          ['abrirPrevia', '/api/previa', '#modal .modal-body'],
          ['abrirAniversariosBase', '/api/aniversarios', '#anivCorpo'],
        ]) {
          let interceptar;
          const interceptada = new Promise(resolve => { interceptar = resolve; });
          falhar.set(rota, request => interceptar(request));
          await page.evaluate(nome => { void window[nome](); }, funcao);
          const request = await interceptada;
          assert.equal(await page.$eval(corpo, el => el.getAttribute('aria-busy')), 'true', rota);
          await request.respond({ status: 503, contentType: 'application/json', body: '{"erro":"Falha simulada"}' });
          const repetir = corpo + ' button';
          await page.waitForFunction(seletor => document.querySelector(seletor)?.textContent === 'Tentar novamente', {}, repetir);
          await page.$eval(repetir, el => el.click());
          await page.waitForSelector(corpo + (funcao === 'abrirPrevia' ? ' .previa-resumo' : ' .rel-nums'));
          assert.equal(await page.$eval(corpo, el => el.hasAttribute('aria-busy')), false, rota);
          await page.evaluate(() => closeModal());
        }

        assert.deepEqual(await page.evaluate(() => {
          const origem = document.createElement('button');
          document.body.append(origem);
          origem.focus();
          openModal('<div class="modal-body"><button hidden>Oculto</button><input id="qaPrimeiro"></div>');
          const entrou = document.activeElement.id;
          openModal('<div class="modal-body"><button id="qaSegundo">Segundo</button></div>');
          const substituiu = document.activeElement.id;
          closeModal();
          return [entrou, substituiu, document.activeElement === origem];
        }), ['qaPrimeiro', 'qaSegundo', true]);
        console.log(`Janelas: ${largura}px ${tema}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
