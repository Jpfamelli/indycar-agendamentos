// Rodada 15: polimento do dia a dia (SÓ com o servidor de mentira), service worker ligado e duas visitas.
//   PORT=3615 MOCK_LEADS=560 npm run mock   e depois   node testes/r15-navegador.mjs [base] [pasta-das-capturas]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3615';
const SAIDA = process.argv[3] || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok ' : 'FALHOU'} · ${nome}${detalhe ? ' · ' + detalhe : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
async function abrir(papel, w, tema = 'escuro') {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) return r.abort(); r.continue(); });
  await page.setViewport({ width: w, height: w < 768 ? 812 : 900, isMobile: w < 768, hasTouch: w < 768 });
  await page.evaluateOnNewDocument(t => { try { localStorage.setItem('indycar_tema', t); sessionStorage.removeItem('indycar_crm_aba'); } catch (e) { /* sem storage */ } }, tema);
  await page.goto(`${BASE}/?papel=${papel}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof TODOS !== 'undefined' && TODOS.length && document.querySelector('#r13Frase').textContent, { timeout: 20000 });
  await espera(1500);
  return { page, erros };
}
const lateral = (page, w) => page.evaluate(w => Math.max(document.documentElement.scrollWidth, innerWidth) > w + 1, w);
try {
  // ---- Hoje, celular, atendente
  const m = await abrir('atendente', 375);
  const ent = await m.page.evaluate(() => ({ total: document.querySelectorAll('#hojeEntregues .r6-linha').length, visiveis: [...document.querySelectorAll('#hojeEntregues .r6-linha')].filter(x => getComputedStyle(x).display !== 'none').length, btn: document.querySelector('.r15-ent-mais')?.textContent || '' }));
  conferir('Carros entregues: 5 à vista e botão para o resto', ent.total > 5 && ent.visiveis === 5 && new RegExp(`outros ${ent.total - 5} carros`).test(ent.btn), JSON.stringify(ent));
  conferir('a fila não diz "undefined"', await m.page.evaluate(() => !/undefined/.test(document.querySelector('#hojeResumo').textContent)), await txt(m.page, '#hojeResumo'));
  const alturaAntes = await m.page.evaluate(() => document.documentElement.scrollHeight);
  if (SAIDA) await m.page.screenshot({ path: `${SAIDA}/depois-hoje-375-escuro.png`, fullPage: true });
  await m.page.evaluate(() => document.querySelector('.r15-ent-mais').click()); await espera(300);
  conferir('"Mostrar os outros" abre todos e o botão some', await m.page.evaluate(n => [...document.querySelectorAll('#hojeEntregues .r6-linha')].every(x => getComputedStyle(x).display !== 'none') && !document.querySelector('.r15-ent-mais'), ent.total));
  conferir('Hoje no celular: sem rolagem lateral', !(await lateral(m.page, 375)));
  const acoes = await m.page.evaluate(() => { const a = document.querySelector('#hojeLista .r6-linha .r6-acoes'); if (!a) return null; const rs = [...a.children].map(c => c.getBoundingClientRect()); return { linhas: new Set(rs.map(r => Math.round(r.top))).size, menor: Math.min(...rs.map(r => r.height)), cortado: [...a.children].some(c => c.scrollWidth > c.clientWidth + 1) }; });
  conferir('Fila no celular: botões em 2 linhas (antes 4), 44 px, sem texto cortado', acoes && acoes.linhas <= 2 && acoes.menor >= 44 && !acoes.cortado, JSON.stringify(acoes));
  console.log('   altura da página Hoje (celular), com 5 entregues:', alturaAntes, 'px');

  // ---- Funil, celular
  await m.page.evaluate(() => irPara('pipeline')); await espera(1500);
  const f = await m.page.evaluate(() => ({ n: document.querySelectorAll('.r15-etapa').length, vis: !document.querySelector('#r15Etapas').hidden && getComputedStyle(document.querySelector('#r15Etapas')).display !== 'none', ativa: document.querySelector('.r15-etapa[aria-pressed=true]')?.dataset.r15Etapa, alvos: [...document.querySelectorAll('.r15-etapa')].every(b => b.getBoundingClientRect().height >= 44) }));
  conferir('Funil: uma etapa para cada coluna, visível e com 44 px', f.n === 7 && f.vis && f.alvos && f.ativa === 'novo', JSON.stringify(f));
  await m.page.evaluate(() => document.querySelector('[data-r15-etapa="agendado"]').click()); await espera(1200);
  const g = await m.page.evaluate(() => { const c = document.querySelector('.kb-col[data-etapa="agendado"]').getBoundingClientRect(); return { esq: Math.round(c.left), ativa: document.querySelector('.r15-etapa[aria-pressed=true]')?.dataset.r15Etapa }; });
  conferir('tocar em "Agendado" leva a coluna para a tela e marca a etapa', g.esq >= 0 && g.esq < 40 && g.ativa === 'agendado', JSON.stringify(g));
  conferir('o número da etapa bate com o da coluna', await m.page.evaluate(() => [...document.querySelectorAll('.r15-etapa')].every(b => b.querySelector('b').textContent === document.querySelector(`.kb-col[data-etapa="${b.dataset.r15Etapa}"] .kb-count`).textContent)));
  if (SAIDA) await m.page.screenshot({ path: `${SAIDA}/depois-funil-375-escuro.png` });
  conferir('Funil no celular: sem rolagem lateral da página', !(await lateral(m.page, 375)));
  conferir('zero erro de console (celular)', m.erros.length === 0, m.erros.slice(0, 3).join(' | '));
  await m.page.close();

  // ---- computador: faixa escondida
  const d = await abrir('gestor', 1440);
  await d.page.evaluate(() => irPara('pipeline')); await espera(1200);
  conferir('Computador: a faixa de etapas não aparece', await d.page.evaluate(() => getComputedStyle(document.querySelector('#r15Etapas')).display === 'none'));
  const dh = await d.page.evaluate(() => { irPara('hoje'); return 1; }); await espera(800);
  if (SAIDA) await d.page.screenshot({ path: `${SAIDA}/depois-hoje-1440-escuro.png`, fullPage: true });
  conferir('zero erro de console (computador)', d.erros.length === 0, d.erros.slice(0, 3).join(' | '));
  await d.page.close();

  // ---- tema claro, celular
  const c = await abrir('atendente', 375, 'claro');
  if (SAIDA) await c.page.screenshot({ path: `${SAIDA}/depois-hoje-375-claro.png`, fullPage: true });
  await c.page.evaluate(() => irPara('pipeline')); await espera(1200);
  if (SAIDA) await c.page.screenshot({ path: `${SAIDA}/depois-funil-375-claro.png` });
  conferir('tema claro sem erro de console', c.erros.length === 0, c.erros.slice(0, 3).join(' | '));
  await c.page.close();

  // ---- service worker ligado, duas visitas
  const s = await abrir('gestor', 1440);
  // o servidor de mentira desliga o registro da página; aqui registramos o sw.js de verdade, como no ar
  const reg = await s.page.evaluate(async () => { try { const r = await navigator.serviceWorker.register('sw.js'); await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sem ready')), 10000))]); return 'ok'; } catch (e) { return String(e.message || e); } });
  conferir('service worker registrado', reg === 'ok', reg); await espera(1500);
  await s.page.reload({ waitUntil: 'domcontentloaded' });
  await s.page.waitForFunction(() => typeof TODOS !== 'undefined' && TODOS.length, { timeout: 20000 }); await espera(1500);
  const sw = await s.page.evaluate(async () => ({ controlado: !!navigator.serviceWorker.controller, chaves: (await caches.keys()), r15: !!(await caches.match('r15.js')) && !!(await caches.match('r15.css')) }));
  conferir('2ª visita: service worker controla, v19 e r15 em cache', sw.controlado && sw.chaves.some(k => /crm-v(19|20)$/.test(k)) && sw.r15, JSON.stringify(sw));
  conferir('2ª visita: sem erro e Hoje abre', s.erros.length === 0 && await s.page.evaluate(() => !!document.querySelector('#r13Frase').textContent), s.erros.slice(0, 3).join(' | '));
  await s.page.close();
} finally { await browser.close(); }
async function txt(page, sel) { return page.evaluate(s => document.querySelector(s)?.textContent || '', sel); }
const falhas = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - falhas} de ${resultados.length}`);
process.exit(falhas ? 1 : 0);
