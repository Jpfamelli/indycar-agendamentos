// Sonda da Rodada 9: abre UMA tela da Agenda no servidor de mentira e roda um trecho de JS nela (ou tira uma foto).
//   node scripts/qa-r9-sonda.mjs <rota> <largura> <tema> "<js que devolve valor>" [foto.png] [altura]
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
const [rota = 'inicio', largura = '375', tema = 'escuro', js = 'null', foto = '', altura = ''] = process.argv.slice(2);
const mock = iniciarMock(Number(process.env.QA_PORTA || 3462)); await dorme(1500);
const { browser, page } = await abrirNavegador({ largura: Number(largura), altura: Number(altura) || (Number(largura) < 500 ? 800 : 950) });
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('ERRO DE PÁGINA', String(e)));
try {
  await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch { /* sem armazenamento */ } }, tema);
  await page.goto(mock.base + '/?tour=0' + (process.env.QA_PAPEL ? '&papel=' + process.env.QA_PAPEL : ''), { waitUntil: 'networkidle2' });
  await page.waitForSelector('.nav-item', { timeout: 20000 }); await dorme(600);
  await page.evaluate((r) => window.route(r), rota).catch(() => {}); await dorme(900);
  const r = await page.evaluate(`(async () => { ${js.includes('return') ? js : 'return ' + js} })()`);
  await dorme(500);
  console.log(JSON.stringify(r, null, 1));
  if (foto) await page.screenshot({ path: foto, fullPage: foto.includes('inteira') });
} finally { await browser.close(); mock.parar(); }
