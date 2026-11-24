// Casa R14: fotos extras (recepção, sino) com o Supabase de mentira. node scripts/qa-r14-fotos.mjs <pasta>
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const BASE = 'http://localhost:3522';
const SAIDA = resolve(process.argv[2] || 'qa-out/r14/depois');
mkdirSync(SAIDA, { recursive: true });
const MOCK = readFileSync(join(RAIZ, 'tests/r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(RAIZ, 'tests/r10-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const { agendaDeHoje } = await import(pathToFileURL(join(RAIZ, 'tests/r9-casa-mock/agenda-hoje.mjs')).href);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
const problemas = [];
const conferir = (ok, msg, erros) => { console.log((ok ? 'ok      ' : 'FALHOU  ') + msg); if (!ok) erros.push(msg); };
async function foto(nome, cenario, { largura, tema, abrirSino = false, depois = null }) {
  const page = await browser.newPage(); const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.setViewport({ width: largura, height: largura < 600 ? 812 : 900 });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((c, t) => { window.__CENARIO = c; window.open = () => ({ focus() {} }); try { navigator.serviceWorker.register = () => Promise.resolve({}); } catch {} try { localStorage.clear(); localStorage.setItem('indycar_tema', t); } catch {} }, cenario, tema);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') return json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'x', versao: 'r14', apps: {}, orcadorNaCentral: true });
    if (u.pathname === '/api/central/saude-apps') return json({ verificado_em: Date.now(), apps: {}, internos: {} });
    if (u.pathname === '/api/central/faturamento') return json({ faturamento: { mes: 48250, sem_valor_semana: 2 } });
    if (u.pathname === '/agenda/api/agendamentos') return json(cenario.papel === 'agenda' ? agendaDeHoje() : []);
    if (u.pathname === '/sw.js') return req.respond({ status: 200, contentType: TIPOS['.js'], body: '' });
    if (u.pathname === '/manifest.json') return req.respond({ status: 200, contentType: TIPOS['.json'], body: readFileSync(join(RAIZ, 'casa/manifest.json')) });
    const c = u.pathname === '/' ? '/casa/index.html' : u.pathname; const arq = join(RAIZ, c);
    if (!/^\/casa\/[\w.-]+$/.test(c) || !existsSync(arq)) return req.respond({ status: 404, body: '' });
    const corpo = c.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
    return req.respond({ status: 200, contentType: TIPOS[c.slice(c.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#casa:not([hidden])', { timeout: 8000 });
  await espera(1200);
  if (abrirSino) { await page.click('#bSino'); await espera(400); }
  await page.screenshot({ path: join(SAIDA, nome + '.png'), fullPage: !abrirSino });
  if (depois) { try { await depois(page, erros); } catch (e) { erros.push('roteiro: ' + e.message); } }
  const medida = await page.evaluate(() => ({ largo: document.documentElement.scrollWidth > window.innerWidth + 1, pequenos: [...document.querySelectorAll('a[href], button, input')].filter((e) => { const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || e.offsetParent === null) return false; const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !e.closest('.pular'); }).map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)) }));
  const linha = `${nome}: ${medida.largo ? 'ROLAGEM LATERAL ' : ''}${largura < 600 && medida.pequenos.length ? 'toques pequenos: ' + medida.pequenos.join(', ') + ' ' : ''}${erros.length ? 'ERROS ' + erros.join(' | ') : 'ok'}`;
  console.log(linha);
  if (erros.length || medida.largo || (largura < 600 && medida.pequenos.length)) problemas.push(linha);
  await page.close();
}
await foto('casa-mecanico-375-escuro', { papel: 'mecanico', zap: 'ok' }, { largura: 375, tema: 'escuro', depois: async (page, erros) => {
  conferir((await page.$$eval('#meusCarrosLista > li', (l) => l.length)) === 3, 'mecânico: três carros em "Seus carros"', erros);
  conferir(await page.$eval('#atencao', (e) => e.hidden), 'mecânico: a lista de atenção não repete os carros', erros);
  conferir(await page.$eval('#bBusca', (e) => e.hidden), 'mecânico: sem botão de busca', erros);
  const href = await page.$eval('#meusCarrosLista a', (a) => a.getAttribute('href'));
  conferir(/indycar-patio\.netlify\.app\/\?os=00000061/.test(href), 'mecânico: o carro abre a ordem dele no Pátio ' + href, erros);
} });
await foto('casa-mecanico-1440-escuro', { papel: 'mecanico', zap: 'ok' }, { largura: 1440, tema: 'escuro' });
await foto('casa-recepcao-375-escuro', { papel: 'agenda', zap: 'ok' }, { largura: 375, tema: 'escuro', depois: async (page, erros) => {
  const frase = await page.$eval('#heroiFrase', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  conferir(frase === 'Hoje tem 5 horários na Agenda, 1 cliente já chegou e 4 carros no pátio.', 'recepção: a frase do dia ' + frase, erros);
  const hrefs = await page.$$eval('#heroiNums a', (as) => as.map((a) => a.getAttribute('href')));
  conferir(hrefs.slice(0, 2).every((h) => h === '/agenda/'), 'recepção: horários e chegadas abrem a Agenda', erros);
  conferir((await page.$eval('#atencaoLista', (e) => e.textContent)).includes('passou da hora e ainda não chegou'), 'recepção: aviso de quem passou da hora', erros);
  conferir(await page.$eval('#bBusca', (e) => e.hidden), 'recepção: sem botão de busca', erros);
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control'); await espera(200);
  conferir(await page.$eval('#busca', (e) => e.hidden), 'recepção: Ctrl+K não abre a busca', erros);
} });
await foto('casa-recepcao-1440-escuro', { papel: 'agenda', zap: 'ok' }, { largura: 1440, tema: 'escuro' });
await foto('uso-sino-1440-escuro', { papel: 'admin', zap: 'ok' }, { largura: 1440, tema: 'escuro', depois: async (page, erros) => {
  await page.click('#bSino'); await espera(300);
  const itens = () => page.$$eval('#listaNotif [data-notif]', (b) => b.map((x) => x.textContent.replace(/\s+/g, ' ')));
  conferir((await page.$eval('#sinoModoNovas', (b) => b.getAttribute('aria-pressed'))) === 'true', 'sino: abre nas não lidas', erros);
  conferir(!(await itens()).some((t) => t.includes('Igor')), 'sino: o aviso já lido não aparece nas não lidas', erros);
  await page.click('#sinoModoTodas'); await espera(300);
  conferir((await itens()).some((t) => t.includes('Igor')), 'sino: em Todas aparece o já lido', erros);
  conferir((await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'sinoModoTodas', 'sino: o foco fica no botão do modo', erros);
  await page.click('#sinoModoNovas'); await espera(200);
  await page.click('#bLerTodas'); await espera(300);
  const txt = await page.$eval('#listaNotif', (e) => e.textContent.replace(/\s+/g, ' '));
  conferir(txt.includes('Tudo lido. Nenhum aviso novo.') && txt.includes('Ver também os já lidos'), 'sino: marcou tudo, aparece "Tudo lido" com a saída para os já lidos', erros);
  conferir(await page.$eval('#sinoNum', (e) => e.hidden), 'sino: a bolinha some', erros);
  conferir(await page.$eval('#bLerTodas', (e) => e.hidden), 'sino: "Marcar todas" some sem nada a marcar', erros);
  await page.screenshot({ path: join(SAIDA, 'uso-sino-tudo-lido-1440.png') });
} });
for (const l of [1440, 375]) await foto(`sino-dono-${l}-escuro`, { papel: 'admin', zap: 'ok' }, { largura: l, tema: 'escuro', abrirSino: true });
await foto('sino-dono-375-claro', { papel: 'admin', zap: 'ok' }, { largura: 375, tema: 'claro', abrirSino: true });
await browser.close();
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.join('\n')); process.exit(1); }
console.log('\nsem erro de console, sem rolagem lateral, toques >= 44 px no celular');
