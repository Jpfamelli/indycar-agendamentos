// QA da Rodada 11 da Agenda (padronizar e limpar): capturas antes/depois no servidor de MENTIRA.
//   node scripts/qa-r11-agenda.mjs antes|depois
// Fotografa as telas do dia a dia em 1440 e 375 px (escuro) e lista as abas do topo. Nada toca o banco real.
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';

const FASE = process.argv[2] || 'depois';
const SAIDA = new URL('../qa-out/r11/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
const PORTA = Number(process.env.QA_PORTA || 3471);
const mock = iniciarMock(PORTA);
await dorme(1500);
const relato = [];
try {
  for (const largura of [1440, 375]) {
    const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 900 });
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    page.on('dialog', (d) => d.accept());
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('indycar_tour_visto_v1', '1'); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch { /* sem armazenamento */ } });
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' });
    await dorme(1500);
    const abas = await page.evaluate(() => [...document.querySelectorAll('.ic-abas a, .ic-abas button, .nav-item')].map((a) => a.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean));
    const rotas = await page.evaluate(() => [...document.querySelectorAll('[data-route]')].map((a) => a.dataset.route));
    for (const rota of [...new Set(['inicio', 'dia', 'agenda', ...rotas, 'semana', 'pendencias', 'configuracoes', 'equipe'])]) {
      await page.evaluate((r) => window.route && window.route(r), rota).catch(() => {});
      await dorme(1100);
      await page.screenshot({ path: `${SAIDA}${FASE}-${rota}-${largura}.png` });
    }
    // marcar: abre o modal de novo agendamento
    await page.evaluate(() => document.querySelector('#btnNovo')?.click());
    await dorme(900);
    await page.screenshot({ path: `${SAIDA}${FASE}-novo-${largura}.png` });
    // o menu da pessoa (Configurações fica aqui para o gestor)
    await page.keyboard.press('Escape'); await dorme(300);
    await page.evaluate(() => document.querySelector('#avatarPerfil')?.click()); await dorme(500);
    await page.screenshot({ path: `${SAIDA}${FASE}-menu-${largura}.png` });
    const menu = await page.evaluate(() => [...document.querySelectorAll('#popPerfil [data-menu] b')].map((b) => b.textContent));
    // recepção (papel só presença)
    await page.goto(mock.base + '/?papel=agenda&tour=0', { waitUntil: 'networkidle2' }); await dorme(1500);
    await page.screenshot({ path: `${SAIDA}${FASE}-recepcao-${largura}.png` });
    relato.push({ largura, abas, rotas, menu, erros: erros.slice(0, 5) });
    await browser.close();
  }
} finally { mock.parar(); }
fs.writeFileSync(SAIDA + `relato-${FASE}.json`, JSON.stringify(relato, null, 1));
console.log(JSON.stringify(relato, null, 1));
