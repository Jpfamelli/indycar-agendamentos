// R14: fluxo da recepção e do Início no servidor de MENTIRA: Não veio pergunta antes, Voltar não muda nada,
// chips levam à aba, aba de destino pisca. node scripts/qa-r14-fluxo.mjs
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
const mock = iniciarMock(Number(process.env.QA_PORTA || 3475)); await dorme(1500);
let falhas = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALHOU ') + m); if (!c) falhas++; };
try {
  const { browser, page } = await abrirNavegador({ largura: 1440, altura: 900 });
  const erros = []; page.on('pageerror', (e) => erros.push(String(e)));
  const patchs = []; page.on('request', (r) => { if (r.method() === 'PATCH' && /status/.test(r.url())) patchs.push(r.postData()); });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('indycar_tour_visto_v1', '1'); } catch {} });
  // Início (gestor)
  await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await dorme(1500);
  await page.evaluate(() => document.querySelector('#agendaHoje .appt [data-act="nao_veio"]').click()); await dorme(300);
  ok(await page.evaluate(() => !!document.querySelector('#agendaHoje .appt.confirmando .pergunta-falta')), 'Início: Não veio pergunta no cartão');
  ok(patchs.length === 0, 'Início: nada foi enviado antes da confirmação');
  await page.evaluate(() => document.querySelector('.appt.confirmando [data-volta]').click()); await dorme(300);
  ok(await page.evaluate(() => !document.querySelector('.appt.confirmando') && !!document.querySelector('#agendaHoje .appt [data-act="nao_veio"]')), 'Início: Voltar devolve os botões');
  await page.evaluate(() => document.querySelector('#agendaHoje .appt [data-act="nao_veio"]').click()); await dorme(300);
  await page.evaluate(() => document.querySelector('.appt.confirmando [data-sim]').click()); await dorme(1200);
  ok(patchs.length === 1 && /nao_veio/.test(patchs[0]), 'Início: Sim, não veio envia uma vez');
  // Recepção
  patchs.length = 0;
  await page.goto(mock.base + '/?papel=agenda&tour=0', { waitUntil: 'networkidle2' }); await dorme(1500);
  ok(await page.evaluate(() => !!document.querySelector('.chip-rec[data-vai="chegaram"]')), 'Recepção: chip "na casa" é botão');
  await page.evaluate(() => document.querySelector('.chip-rec[data-vai="chegaram"]').click()); await dorme(500);
  ok(await page.evaluate(() => document.querySelector('[data-hoje-tab="chegaram"]').classList.contains('active')), 'Recepção: chip leva à aba Já chegaram');
  await page.evaluate(() => document.querySelector('.chip-rec[data-vai="agendados"]').click()); await dorme(500);
  const antes = await page.evaluate(() => +document.querySelector('[data-hoje-tab="chegaram"] .tab-num').textContent);
  await page.evaluate(() => document.querySelector('.rec-cartao [data-marca="compareceu"]').click()); await dorme(1400);
  ok(await page.evaluate(() => !!document.querySelector('[data-hoje-tab="chegaram"] .tab-num.pulsa')) || (await page.evaluate(() => +document.querySelector('[data-hoje-tab="chegaram"] .tab-num').textContent)) === antes + 1, 'Recepção: Chegou conta na aba Já chegaram');
  ok(patchs.length === 1 && /compareceu/.test(patchs[0]), 'Recepção: Chegou enviado uma vez');
  ok(erros.length === 0, 'sem erro de página ' + erros.join('|'));
  await browser.close();
} finally { mock.parar(); }
console.log(falhas ? falhas + ' falharam' : 'tudo ok'); process.exit(falhas ? 1 : 0);
