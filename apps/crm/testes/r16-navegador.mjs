// Rodada 16: títulos em ordem, atalhos da lista de Contatos (SÓ com o servidor de mentira), service worker ligado e duas visitas.
//   PORT=3616 MOCK_LEADS=560 npm run mock   e depois   node testes/r16-navegador.mjs [base] [pasta-das-capturas]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3616';
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
const marcado = page => page.evaluate(() => document.querySelector('.r16-atalho[aria-pressed=true]')?.dataset.r16 || '');
const contagem = page => page.evaluate(() => document.querySelector('#leadCount').textContent);
try {
  for (const [papel, w, tema] of [['atendente', 375, 'escuro'], ['gestor', 1440, 'escuro'], ['gestor', 375, 'claro']]) {
    const m = await abrir(papel, w, tema);
    const { page } = m;
    for (const v of ['hoje', 'leads', 'pipeline', 'clientes', 'dashboard']) {
      await page.evaluate(v => irPara(v), v); await espera(900);
      const pulos = await page.evaluate(() => {
        const vis = [...document.querySelectorAll('main h1,main h2,main h3,main h4')].filter(h => h.offsetParent !== null);
        let ant = 0; const ruins = [];
        for (const h of vis) { const n = +h.tagName[1]; if (ant && n > ant + 1) ruins.push(h.textContent.trim().slice(0, 30)); ant = n; }
        return ruins;
      });
      conferir(`${papel} ${w}: títulos sem pulo na aba ${v}`, pulos.length === 0, pulos.join(' | '));
    }
    await page.evaluate(() => irPara('leads')); await espera(900);
    const alvos = await page.evaluate(() => [...document.querySelectorAll('.r16-atalho')].map(b => Math.round(b.getBoundingClientRect().height)));
    conferir(`${papel} ${w}: 4 atalhos, todos com 44 px`, alvos.length === 4 && alvos.every(h => h >= 44), alvos.join(','));
    const inicial = await marcado(page);
    const esperado = papel === 'atendente' ? 'meus' : 'todos';
    conferir(`${papel} ${w}: atalho marcado acompanha o padrão (${esperado})`, inicial === esperado, inicial);
    await page.click('[data-r16="todos"]'); await espera(300);
    const todos = parseInt(await contagem(page));
    await page.click('[data-r16="sem"]'); await espera(300);
    const sem = parseInt(await contagem(page));
    const respSem = await page.evaluate(() => document.querySelector('#fResp').value);
    conferir(`${papel} ${w}: "Sem responsável" filtra a lista e o filtro da gaveta concorda`, respSem === 'sem' && sem < todos && (await marcado(page)) === 'sem', `todos ${todos}, sem ${sem}`);
    if (papel === 'gestor' && w === 1440 && SAIDA) await page.screenshot({ path: `${SAIDA}/depois-contatos-1440-escuro.png` });
    await page.click('[data-r16="parados"]'); await espera(300);
    const parados = parseInt(await contagem(page));
    const estado = await page.evaluate(() => document.querySelector('#soParados').checked && document.querySelector('#fResp').value === '');
    conferir(`${papel} ${w}: "Parados" liga a caixa "Só parados" e tira o responsável`, estado && parados <= todos, `parados ${parados}`);
    await page.click('[data-r16="meus"]'); await espera(300);
    const meus = await page.evaluate(() => !document.querySelector('#soParados').checked && document.querySelector('#fResp').value === 'meus');
    conferir(`${papel} ${w}: "Meus" desliga os parados`, meus && (await marcado(page)) === 'meus');
    await page.evaluate(() => {
      const s = document.querySelector('#fResp');
      const o = [...s.options].find(x => x.parentElement.tagName === 'OPTGROUP');
      s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await espera(300);
    conferir(`${papel} ${w}: pessoa escolhida na gaveta desmarca os atalhos`, (await marcado(page)) === '');
    await page.click('#limparFiltros'); await espera(300);
    if (SAIDA) await page.screenshot({ path: `${SAIDA}/depois-contatos-${w}-${tema}-${papel}.png` });
    conferir(`${papel} ${w}: sem rolagem lateral`, !(await lateral(page, w)));
    conferir(`${papel} ${w}: zero erro de console`, m.erros.length === 0, m.erros.slice(0, 3).join(' | '));
    await page.close();
  }
  const s = await abrir('gestor', 1440);
  // o servidor de mentira desliga o registro da página; aqui registramos o sw.js de verdade, como no ar
  const reg = await s.page.evaluate(async () => { try { await navigator.serviceWorker.register('sw.js'); await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sem ready')), 10000))]); return 'ok'; } catch (e) { return String(e.message || e); } });
  conferir('service worker registrado', reg === 'ok', reg); await espera(1500);
  await s.page.reload({ waitUntil: 'domcontentloaded' });
  await s.page.waitForFunction(() => typeof TODOS !== 'undefined' && TODOS.length, { timeout: 20000 }); await espera(1500);
  const sw = await s.page.evaluate(async () => ({ ctrl: !!navigator.serviceWorker.controller, chaves: await caches.keys(), r16: !!(await caches.match('r16.js')) || !!(await caches.match('/r16.js')), atalhos: document.querySelectorAll('.r16-atalho').length }));
  conferir('service worker: 2ª visita controlada, v20 e r16 em cache', sw.ctrl && sw.chaves.some(c => /v20$/.test(c)) && sw.r16 && sw.atalhos === 4, JSON.stringify(sw));
  conferir('service worker: zero erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.page.close();
} finally { await browser.close(); }
const falhas = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - falhas} de ${resultados.length}`);
process.exit(falhas ? 1 : 0);
