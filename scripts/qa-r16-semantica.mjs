// R16: sonda de semântica e bordas no servidor de MENTIRA: ordem dos títulos (h1..h6) em cada tela e
// elementos com borda grossa de um lado só. node scripts/qa-r16-semantica.mjs
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
const mock = iniciarMock(Number(process.env.QA_PORTA || 3586)); await dorme(1500);
let falhas = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALHOU ') + m); if (!c) falhas++; };
try {
  const { browser, page } = await abrirNavegador({ largura: 1440, altura: 900 });
  const erros = []; page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('indycar_tour_visto_v1', '1'); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch {} });
  await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await dorme(2000);
  const sonda = () => page.evaluate(() => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => ({ n: +h.tagName[1], t: h.textContent.trim().slice(0, 30) }));
    const pulos = []; let ant = 0; for (const h of hs) { if (ant && h.n > ant + 1) pulos.push(`${ant}->${h.n} ${h.t}`); ant = h.n; }
    const bordas = [...document.querySelectorAll('body *')].filter(vis).filter((e) => { const s = getComputedStyle(e); const l = ['Left', 'Right', 'Top', 'Bottom'].map((x) => parseFloat(s['border' + x + 'Width']) * (s['border' + x + 'Style'] !== 'none' ? 1 : 0)); const mx = Math.max(...l); return mx >= 3 && l.filter((v) => v >= 3).length === 1; }).map((e) => e.className || e.tagName).slice(0, 8);
    const h1s = hs.filter((h) => h.n === 1).length;
    return { hs: hs.map((h) => h.n + ':' + h.t), pulos, bordas, h1s };
  });
  for (const r of ['inicio', 'agenda', 'quadro', 'espera', 'clientes']) {
    await page.evaluate((x) => window.route(x), r); await dorme(1600);
    const s = await sonda(); console.log(r, JSON.stringify(s));
    ok(s.pulos.length === 0, `${r}: títulos sem pular nível`); ok(s.h1s === 1, `${r}: um h1 só`); ok(s.bordas.length === 0, `${r}: sem borda grossa de um lado só`);
  }
  await page.evaluate(() => document.getElementById('btnNovo').click()); await dorme(1000);
  const m = await sonda(); console.log('modal', JSON.stringify(m)); ok(m.pulos.length === 0, 'modal: títulos sem pular nível');
  // recepção (papel agenda): tela 'dia'
  await page.goto(mock.base + '/?tour=0&papel=agenda', { waitUntil: 'networkidle2' }); await dorme(2500);
  const d = await sonda(); console.log('dia', JSON.stringify(d)); ok(d.pulos.length === 0 && d.h1s === 1 && d.bordas.length === 0, 'recepção: um h1, sem pular nível, sem borda grossa');
  ok(erros.length === 0, 'sem erro de console ' + erros.slice(0, 2).join('|'));
  await browser.close();
} finally { mock.parar(); }
console.log(falhas ? falhas + ' falharam' : 'tudo ok'); process.exit(falhas ? 1 : 0);
