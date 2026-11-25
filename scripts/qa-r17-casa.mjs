// Casa R17: o dia de verdade (Orçador sem uso, 42 conversas esperando): antes e depois, medido no Chrome com o Supabase de mentira.
//   ANTES=1 serve os arquivos da Casa do último commit (HEAD) para medir o antes.
// Uso: node scripts/qa-r17-casa.mjs <pasta-das-fotos>
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const ANTES = process.env.ANTES === '1';
const BASE = 'http://localhost:3523';
const SAIDA = resolve(process.argv[2] || 'qa-out/r17/depois');
mkdirSync(SAIDA, { recursive: true });
const MOCK = readFileSync(join(RAIZ, 'tests/r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(RAIZ, 'tests/r10-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const { agendaDeHoje } = await import(pathToFileURL(join(RAIZ, 'tests/r9-casa-mock/agenda-hoje.mjs')).href);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
const problemas = [];
const conferir = (ok, msg, erros) => { console.log((ok ? 'ok      ' : 'FALHOU  ') + msg); if (!ok) erros.push(msg); };
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
/** O relógio fixado às 14h de hoje (em São Paulo): a lista da Agenda de mentira e a página usam o mesmo "agora". */
const AGORA_FALSO = Date.parse(hojeSP + 'T14:00:00-03:00');
const DESLOCA = AGORA_FALSO - Date.now();

/**
 * Abre a Casa com o cenário. `limpar`: apaga o armazenamento do aparelho (padrão); `semear`: texto gravado em
 * indycar_central_heroi antes da página abrir; `relogio`: fixa as 14h; `quando(page, erros)`: roteiro depois que a Casa abriu.
 * `foto`: nome do arquivo (ou null). `antesDaFoto`: roda antes da captura.
 */
async function abrir(nome, cenario, { largura = 1440, tema = 'escuro', limpar = true, semear = null, relogio = false, foto = nome, rolar = false, quando = null, aoCarregar = null } = {}) {
  const page = await browser.newPage(); const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.setViewport({ width: largura, height: largura < 600 ? 812 : 900 });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((c, t, lim, sem, desloca) => {
    window.__CENARIO = c; window.open = () => ({ focus() {} });
    try { navigator.serviceWorker.register = () => Promise.resolve({}); } catch {}
    try { if (lim) localStorage.clear(); localStorage.setItem('indycar_tema', t); if (sem) localStorage.setItem('indycar_central_heroi', sem); } catch {}
    if (desloca) { const D = Date; const agora = () => D.now() + desloca; window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(agora()); } static now() { return agora(); } }; }
  }, cenario, tema, limpar, semear, relogio ? DESLOCA : 0);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') return json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'x', versao: 'r15', apps: {}, orcadorNaCentral: true });
    if (u.pathname === '/api/central/saude-apps') return json({ verificado_em: Date.now(), apps: {}, internos: {} });
    if (u.pathname === '/api/central/faturamento') return json({ faturamento: { mes: 48250, sem_valor_semana: 2 } });
    if (u.pathname === '/agenda/api/agendamentos') return json(cenario.papel === 'agenda' ? agendaDeHoje(relogio ? AGORA_FALSO : Date.now()) : []);
    if (u.pathname === '/sw.js') return req.respond({ status: 200, contentType: TIPOS['.js'], body: '' });
    if (u.pathname === '/manifest.json') return req.respond({ status: 200, contentType: TIPOS['.json'], body: readFileSync(join(RAIZ, 'casa/manifest.json')) });
    const c = u.pathname === '/' ? '/casa/index.html' : u.pathname; const arq = join(RAIZ, c);
    if (!/^\/casa\/[\w.-]+$/.test(c) || !existsSync(arq)) return req.respond({ status: 404, body: '' });
    const bruto = ANTES ? execSync('git show HEAD:' + c.slice(1), { cwd: RAIZ }) : readFileSync(arq);
    const corpo = c.endsWith('/index.html') ? bruto.toString('utf8').replace(/ integrity="[^"]*"/g, '') : bruto;
    return req.respond({ status: 200, contentType: TIPOS[c.slice(c.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#casa:not([hidden])', { timeout: 8000 });
  if (aoCarregar) { try { await aoCarregar(page, erros); } catch (e) { erros.push('roteiro(aoCarregar): ' + e.message); } }
  else await espera(1200);
  if (quando) { try { await quando(page, erros); } catch (e) { erros.push('roteiro: ' + e.message); } }
  if (foto) await page.screenshot({ path: join(SAIDA, foto + '.png'), fullPage: !rolar });
  const medida = await page.evaluate(() => ({ largo: document.documentElement.scrollWidth > window.innerWidth + 1, pequenos: [...document.querySelectorAll('a[href], button, input')].filter((e) => { const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || e.offsetParent === null) return false; const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !e.closest('.pular'); }).map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)) }));
  const linha = `${nome}: ${medida.largo ? 'ROLAGEM LATERAL ' : ''}${largura < 600 && medida.pequenos.length ? 'toques pequenos: ' + medida.pequenos.join(', ') + ' ' : ''}${erros.length ? 'ERROS ' + erros.join(' | ') : 'ok'}`;
  console.log(linha);
  if (erros.length || medida.largo || (largura < 600 && medida.pequenos.length)) problemas.push(linha);
  await page.close();
}
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());

/** Medida do caminho até a primeira ação: o herói, quantos números grandes, onde começa "Pede atenção" e o aviso das conversas. */
const medir = (page) => page.evaluate(() => {
  const at = document.querySelector('#atencao');
  const conv = [...document.querySelectorAll('#atencaoLista > li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()).find((t) => /conversas? esperando/.test(t)) || '';
  return {
    frase: document.querySelector('#heroiFrase').textContent.replace(/\s+/g, ' ').trim(),
    numeros: document.querySelectorAll('#heroiNums > li').length,
    alturaHeroi: Math.round(document.querySelector('#heroi').getBoundingClientRect().height),
    atencaoY: at && !at.hidden ? Math.round(at.getBoundingClientRect().top + window.scrollY) : null,
    primeiraAcaoY: (() => { const a = document.querySelector('#atencaoLista a'); return a ? Math.round(a.getBoundingClientRect().top + window.scrollY) : null; })(),
    conversas: conv,
    cartaoOrcador: (document.querySelector('[data-app-num="orcador"]') || {}).textContent || '',
    alturaPagina: document.documentElement.scrollHeight,
  };
});
const medidas = {};
for (const [nome, papel] of [['dono', 'admin'], ['atendente', 'atendente']]) {
  for (const tema of ['escuro', 'claro']) {
    for (const largura of [375, 1440]) {
      await abrir(`real-${nome}-${largura}-${tema}`, { papel, zap: 'ok', semOrcamento: true }, { largura, tema, quando: async (page, erros) => {
        const m = await medir(page);
        if (tema === 'escuro') medidas[`${nome}-${largura}`] = m;
        if (ANTES) return;
        conferir(!/orçamento/.test(m.frase), `${nome} ${largura}: Orçador sem orçamento fica fora da frase (${m.frase})`, erros);
        conferir(m.numeros === 3, `${nome} ${largura}: três números no herói (${m.numeros})`, erros);
        conferir(/conversas esperando resposta/.test(m.conversas) && !/consultor/.test(m.conversas), `${nome} ${largura}: "esperando resposta" (${m.conversas})`, erros);
        conferir(!m.cartaoOrcador.trim(), `${nome} ${largura}: o cartão do Orçador não mostra "0"`, erros);
      } });
    }
  }
}
/* com orçamento esperando (o mock de sempre), o número volta */
await abrir('com-orcamento-375-escuro', { papel: 'admin', zap: 'ok' }, { largura: 375, quando: async (page, erros) => {
  const m = await medir(page);
  if (!ANTES) conferir(/2 orçamentos esperando resposta/.test(m.frase) && m.numeros === 4, 'com orçamento esperando: volta para o herói (' + m.frase + ')', erros);
} });
console.log('\nMEDIDAS ' + (ANTES ? 'ANTES' : 'DEPOIS') + ' ' + JSON.stringify(medidas, null, 1));
await browser.close();
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.join('\n')); process.exit(1); }
console.log('\nsem erro de console, sem rolagem lateral, toques >= 44 px no celular');
