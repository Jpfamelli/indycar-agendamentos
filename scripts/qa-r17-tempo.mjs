// R17 (exploração): quanto tempo do link do Atendimento (?novo=1&tel=) até o formulário pronto, com atraso de rede simulado.
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
const mock = iniciarMock(3597); await dorme(1500);
const { browser, page } = await abrirNavegador({ largura: 375, altura: 812 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('indycar_tour_visto_v1', '1'); } catch {} });
const ATRASO = Number(process.argv[2] || 300);
await page.setRequestInterception(true);
const log = [];
page.on('request', async (r) => { if (/\/api\//.test(r.url())) { log.push([Date.now(), r.url().replace(/.*\/api/, '')]); await new Promise((ok) => setTimeout(ok, ATRASO)); } r.continue(); });
for (const url of ['/?novo=1&tel=12991110004', '/?novo=1&tel=12991110004']) {
  log.length = 0;
  const t0 = Date.now();
  await page.goto(mock.base + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#f_save', { timeout: 30000 });
  const t = Date.now() - t0;
  console.log('formulário pronto em', t, 'ms (atraso por pedido', ATRASO, 'ms)');
  console.log(log.map(([q, u]) => `${q - t0}ms ${u}`).slice(0, 25).join('\n'));
  await dorme(1500);
}
await browser.close(); mock.parar();
