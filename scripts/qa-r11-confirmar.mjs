// QA da Rodada 11: a página do cliente (/confirmar/) com o padrão visual IndyCar, no servidor de MENTIRA.
//   node scripts/qa-r11-confirmar.mjs antes|depois
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';

const FASE = process.argv[2] || 'depois';
const SAIDA = new URL('../qa-out/r11/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
const mock = iniciarMock(Number(process.env.QA_PORTA || 3472));
await dorme(1500);
try {
  const { browser, page } = await abrirNavegador({ largura: 375, altura: 800 });
  await page.goto(mock.base + '/confirmar/?t=qualquer', { waitUntil: 'networkidle2' });
  await dorme(800);
  const fonte = await page.evaluate(() => [getComputedStyle(document.body).fontFamily, getComputedStyle(document.querySelector('.logo b')).fontFamily, document.fonts.check('16px Archivo')]);
  console.log(JSON.stringify({ fonte }));
  await page.screenshot({ path: `${SAIDA}${FASE}-confirmar-375.png` });
  await browser.close();
} finally { mock.parar(); }
