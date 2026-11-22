// Casa, rodada 13: fotos da Central no Chrome com o Supabase de MENTIRA (tests/r9-casa-mock/dados.js +
// tests/r10-casa-mock/supabase-falso.js). Nada sai para a rede: todo pedido é respondido pela interceptação do Chrome.
//
//   node scripts/qa-r13-casa.mjs <pasta>      → fotos em <pasta> (ex.: qa-out/r13/depois) e confere erros de console
//
// Para cada papel (dono = admin, atendente, mecânico) tira 1440 e 375, escuro e claro, a página inteira. Também a tela de
// entrar. Sai com 1 se a página jogar erro, se houver rolagem lateral no celular ou se algum toque tiver menos de 44 px.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const BASE = 'http://localhost:3522';
const SAIDA = resolve(process.argv[2] || 'qa-out/r13/depois');
const SO_USO = process.argv.includes('--so-uso');   // só os roteiros de uso, sem as fotos de todos os papéis
mkdirSync(SAIDA, { recursive: true });
const MOCK = readFileSync(join(RAIZ, 'tests/r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(RAIZ, 'tests/r10-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
const problemas = [];

async function foto(nome, cenario, { largura, tema, depois = null }) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.setViewport({ width: largura, height: largura < 600 ? 812 : 900, deviceScaleFactor: 1 });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((c, t) => {
    window.__CENARIO = c;
    window.open = () => ({ focus() {} });
    // o service worker de verdade não passa pela interceptação do Chrome: nas fotos ele não é instalado
    try { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({}); } catch { /* segue */ }
    try { localStorage.clear(); localStorage.setItem('indycar_tema', t); } catch { /* segue */ }
  }, cenario, tema);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') return json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'chave-de-mentira', versao: 'r13', apps: {} });
    if (u.pathname === '/api/central/saude-apps') return json({ verificado_em: Date.now(), apps: {}, internos: {} });
    if (u.pathname.startsWith('/agenda/api/')) return json([]);
    if (u.pathname === '/sw.js') return req.respond({ status: 200, contentType: TIPOS['.js'], body: '/* service worker vazio nas fotos */' });
    if (u.pathname === '/manifest.json') return req.respond({ status: 200, contentType: TIPOS['.json'], body: readFileSync(join(RAIZ, 'casa/manifest.json')) });
    const caminho = u.pathname === '/' ? '/casa/index.html' : u.pathname;
    const arq = join(RAIZ, caminho);
    if (!/^\/casa\/[\w.-]+$/.test(caminho) || !existsSync(arq)) return req.respond({ status: 404, body: '' });
    const corpo = caminho.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
    return req.respond({ status: 200, contentType: TIPOS[caminho.slice(caminho.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(cenario.sessao === false ? '#fLogin:not([hidden])' : '#casa:not([hidden])', { timeout: 8000 });
  await espera(1200);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const medida = await page.evaluate(() => {
    const largo = document.documentElement.scrollWidth > window.innerWidth + 1;
    const pequenos = [...document.querySelectorAll('a[href], button, input, [role="menuitem"]')]
      .filter((e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || e.offsetParent === null) return false; const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !e.closest('.sr-only, .pular, .marcar, #menuPerfil, #painelSino, .modal-fundo'); })
      .map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
    return { largo, pequenos, altura: document.documentElement.scrollHeight };
  });
  await page.screenshot({ path: join(SAIDA, nome + '.png'), fullPage: true });
  if (depois) { try { await depois(page, erros); } catch (e) { erros.push('roteiro: ' + e.message); } }
  const linha = `${nome}: altura ${medida.altura}px${medida.largo ? ' · ROLAGEM LATERAL' : ''}${medida.pequenos.length ? ' · toques pequenos: ' + medida.pequenos.join(', ') : ''}${erros.length ? ' · ERROS: ' + erros.join(' | ') : ''}`;
  console.log(linha);
  if (depois && erros.length) problemas.push(nome + ': ' + erros.join(' | '));
  else if (erros.length || medida.largo || (largura < 600 && medida.pequenos.length)) problemas.push(linha);
  await page.close();
}

const papeis = [['dono', { papel: 'admin', zap: 'ok' }], ['atendente', { papel: 'atendente', zap: 'ok' }], ['mecanico', { papel: 'mecanico', zap: 'ok' }]];
for (const [nome, cen] of SO_USO ? [] : papeis) {
  for (const largura of [1440, 375]) for (const tema of ['escuro', 'claro']) await foto(`casa-${nome}-${largura}-${tema}`, cen, { largura, tema });
}
/* o uso do dia: os números do herói levam ao app, a meta muda no próprio bloco, o sino e a busca abrem */
const conferir = (ok, msg, erros) => { console.log((ok ? 'ok      ' : 'FALHOU  ') + msg); if (!ok) erros.push(msg); };
await foto('uso-dono-375-escuro', { papel: 'admin', zap: 'ok' }, { largura: 375, tema: 'escuro', depois: async (page, erros) => {
  const hrefs = await page.$$eval('#heroiNums a', (as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('target')]));
  conferir(JSON.stringify(hrefs) === JSON.stringify([['/atendimento/', 'indycar-atendimento'], ['/agenda/', 'indycar-agenda'], ['https://indycar-patio.netlify.app/', 'indycar-patio'], ['https://indycar-orcador.netlify.app/', 'indycar-orcador']]), 'herói: cada número abre o app na aba dele ' + JSON.stringify(hrefs), erros);
  const cartoes = await page.$$eval('[data-app-num]:not([hidden])', (els) => els.map((e) => e.dataset.appNum));
  conferir(JSON.stringify(cartoes) === '["crm"]', 'cartões: só o CRM repete número (o resto já está no herói) ' + JSON.stringify(cartoes), erros);
  await page.click('[data-mes-meta]');
  await page.waitForSelector('#mesMetaValor');
  await page.$eval('#mesMetaValor', (i) => { i.value = ''; });
  await page.type('#mesMetaValor', 'oitenta');
  await page.keyboard.press('Enter');
  await espera(200);
  conferir(!!(await page.$('#mesMetaErro')), 'meta: valor que não entende mostra o erro no campo', erros);
  await page.$eval('#mesMetaValor', (i) => { i.value = ''; });
  await page.type('#mesMetaValor', '80 mil');
  await page.screenshot({ path: join(SAIDA, 'uso-dono-375-escuro-meta.png') });
  await page.keyboard.press('Enter');
  await espera(300);
  const g = await page.evaluate(() => window.__GRAVADO.filter((x) => x.tabela === 'casa_metas'));
  conferir(g.length === 1 && g[0].acao === 'upsert' && g[0].valor.valor === 80000 && /^\d{4}-\d{2}$/.test(g[0].valor.mes), 'meta: "80 mil" grava 80000 no mês (só na memória da página)', erros);
  conferir((await page.$eval('#mesCorpo', (e) => e.textContent.replace(/\s+/g, ' '))).includes('R$ 80.000'), 'meta: o bloco mostra a meta nova', erros);
  await page.click('#bSino'); await espera(200);
  conferir(await page.$eval('#painelSino', (e) => !e.hidden), 'sino abre', erros);
  await page.keyboard.press('Escape'); await espera(100);
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control'); await espera(200);
  conferir(await page.$eval('#busca', (e) => !e.hidden), 'Ctrl+K abre a busca', erros);
  await page.keyboard.press('Escape'); await espera(200);
  conferir(await page.$eval('#busca', (e) => e.hidden), 'Esc fecha a busca', erros);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#bPerfil'); await espera(100);
  await page.click('#menuPerfil [data-acao="sair"]'); await espera(300);
  const sobra = await page.evaluate(() => document.body.innerText.includes('31.450') || document.querySelector('#heroiFrase').textContent.includes('conversas'));
  conferir(!sobra, 'sair: faturamento e números do dia saem da página', erros);
} });
await foto('uso-atendente-1440-escuro', { papel: 'atendente', zap: 'ok' }, { largura: 1440, tema: 'escuro', depois: async (page, erros) => {
  conferir(await page.$eval('#mesOficina', (e) => e.hidden), 'atendente não vê o mês da oficina', erros);
  conferir((await page.evaluate(() => window.__LIDO.filter((x) => x === 'r6_c1_painel_dono' || x === 'casa_metas').length)) === 0, 'atendente nem pede o faturamento ao banco', erros);
} });
if (!SO_USO) {
await foto('casa-dono-vazio-1440-escuro', { papel: 'admin', zap: 'ok', vazio: true }, { largura: 1440, tema: 'escuro' });
await foto('casa-dono-vazio-375-claro', { papel: 'admin', zap: 'ok', vazio: true }, { largura: 375, tema: 'claro' });
await foto('casa-zap-recusado-375-escuro', { papel: 'admin', zap: 'recusado' }, { largura: 375, tema: 'escuro' });
for (const largura of [1440, 375]) for (const tema of ['escuro', 'claro']) await foto(`entrar-${largura}-${tema}`, { sessao: false }, { largura, tema });
}
await browser.close();
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.join('\n')); process.exit(1); }
console.log('\nsem erro de console, sem rolagem lateral, toques >= 44 px no celular');
