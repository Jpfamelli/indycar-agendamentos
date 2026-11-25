// QA da Rodada 15 da Agenda (subir ao nível do Tráfego): capturas antes/depois no servidor de MENTIRA.
//   node scripts/qa-r15-agenda.mjs antes|depois
// Fotografa as telas do dia a dia em 1440 e 375 px, escuro e claro, e mede rolagem lateral, toques pequenos
// e erros de console. Nada toca o banco real.
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';

const FASE = process.argv[2] || 'depois';
const SAIDA = new URL('../qa-out/r16/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
const PORTA = Number(process.env.QA_PORTA || 3584);
const mock = iniciarMock(PORTA);
await dorme(1500);
const relato = [];

const medir = (page) => page.evaluate(() => {
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const larg = document.documentElement.clientWidth;
  const lateral = document.documentElement.scrollWidth > larg + 1;
  const pequenos = [...document.querySelectorAll('#view button, #view a[href], #view [role=button], .ic-topo button, .ic-topo a')]
    .filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((x) => x.h < 44 || x.w < 44);
  return { lateral, scrollW: document.documentElement.scrollWidth, larg, pequenos: pequenos.slice(0, 12), nPequenos: pequenos.length };
});

try {
  for (const tema of ['escuro', 'claro']) {
    for (const largura of [1440, 375]) {
      const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 812 : 900 });
      const erros = [];
      page.on('pageerror', (e) => erros.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
      page.on('dialog', (d) => d.accept());
      await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); localStorage.setItem('indycar_tour_visto_v1', '1'); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch { /* sem armazenamento */ } }, tema);
      await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' });
      await dorme(1800);
      const medidas = {};
      for (const rota of ['inicio', 'agenda', 'quadro', 'espera', 'clientes']) {
        await page.evaluate((r) => window.route && window.route(r), rota).catch(() => {});
        await dorme(1300);
        await page.evaluate(() => window.scrollTo(0, 0));
        medidas[rota] = await medir(page);
        await page.screenshot({ path: `${SAIDA}${FASE}-${rota}-${largura}-${tema}.png`, fullPage: rota === 'inicio' });
      }
      await page.evaluate((r) => window.route && window.route(r), 'inicio').catch(() => {});
      await dorme(900);
      await page.evaluate(() => document.querySelector('#btnNovo')?.click());
      await dorme(900);
      await page.screenshot({ path: `${SAIDA}${FASE}-novo-${largura}-${tema}.png` });
      await page.keyboard.press('Escape'); await dorme(300);
      await page.goto(mock.base + '/?papel=agenda&tour=0', { waitUntil: 'networkidle2' }); await dorme(1800);
      medidas.recepcao = await medir(page);
      await page.screenshot({ path: `${SAIDA}${FASE}-recepcao-${largura}-${tema}.png`, fullPage: true });
      relato.push({ tema, largura, medidas, erros: erros.slice(0, 6) });
      await browser.close();
    }
  }
} finally { mock.parar(); }
fs.writeFileSync(SAIDA + `relato-${FASE}.json`, JSON.stringify(relato, null, 1));
for (const r of relato) {
  console.log(`${r.tema} ${r.largura}: erros=${r.erros.length} ${r.erros.slice(0, 2).join(' | ')}`);
  for (const [k, m] of Object.entries(r.medidas)) console.log(`  ${k}: lateral=${m.lateral}(${m.scrollW}/${m.larg}) pequenos=${m.nPequenos} ${m.pequenos.slice(0, 4).map((p) => `${p.t}[${p.w}x${p.h}]`).join(', ')}`);
}
