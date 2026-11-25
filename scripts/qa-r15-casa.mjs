// Casa R15: provas de uso no Chrome com o Supabase de mentira (nada de rede, nada de banco).
//   - "Pede atenção" traz as tarefas da própria pessoa que passaram do prazo (e só para a equipe);
//   - o último número do aparelho pinta o herói na hora (apagado) e a leitura de verdade o troca; sem rede ele fica e diz a hora;
//   - outra pessoa no mesmo aparelho NÃO vê o número de quem usou antes; sair apaga o guardado;
//   - o sino tem "Fechar" no pé no celular e não no computador;
//   - a recepção (com o relógio da página fixado às 14h, para valer a qualquer hora do dia) segue certa.
// Uso: node scripts/qa-r15-casa.mjs <pasta-das-fotos>
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const BASE = 'http://localhost:3523';
const SAIDA = resolve(process.argv[2] || 'qa-out/r15/depois');
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
    const corpo = c.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
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

/* ---------- 1. tarefas suas vencidas em "Pede atenção" ---------- */
for (const tema of ['escuro', 'claro']) {
  await abrir(`casa-dono-1440-${tema}`, { papel: 'admin', zap: 'ok' }, { tema, quando: tema === 'escuro' ? async (page, erros) => {
    const itens = await page.$$eval('#atencaoLista > li', (ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
    const t = itens.find((x) => x.includes('tarefas suas passaram do prazo'));
    conferir(!!t && t.includes('2 tarefas suas passaram do prazo') && t.includes('a mais antiga venceu há 5 dias'), 'dono: aviso "2 tarefas suas passaram do prazo" com a mais antiga ' + (t || '(não achei)'), erros);
    const href = await page.$$eval('#atencaoLista a', (as) => as.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]).find((x) => x[0].includes('tarefas suas'))[1]);
    conferir(/\/atendimento\/\?tarefas$/.test(href), 'dono: o toque abre as tarefas no Atendimento ' + href, erros);
    const lido = await page.evaluate(() => window.__LIDO.filter((n) => n === 'tarefas').length);
    conferir(lido === 1, 'dono: uma leitura de tarefas na abertura (' + lido + ')', erros);
    conferir(!itens.some((x) => /2 tarefas vencidas/.test(x)), 'dono: não repete o "tarefas vencidas" geral do banco', erros);
  } : null });
}
await abrir('casa-dono-375-escuro', { papel: 'admin', zap: 'ok' }, { largura: 375 });
await abrir('casa-dono-375-claro', { papel: 'admin', zap: 'ok' }, { largura: 375, tema: 'claro' });
await abrir('casa-atendente-375-escuro', { papel: 'atendente', zap: 'ok' }, { largura: 375, quando: async (page, erros) => {
  conferir((await texto(page, '#atencaoLista')).includes('tarefas suas passaram do prazo'), 'atendente: vê as tarefas suas vencidas', erros);
} });
await abrir('casa-mecanico-375-escuro', { papel: 'mecanico', zap: 'ok' }, { largura: 375, quando: async (page, erros) => {
  conferir(!(await page.evaluate(() => window.__LIDO.includes('tarefas'))), 'mecânico: nem lê as tarefas', erros);
} });
await abrir('casa-recepcao-375-escuro', { papel: 'agenda', zap: 'ok' }, { largura: 375, relogio: true, quando: async (page, erros) => {
  conferir(!(await page.evaluate(() => window.__LIDO.includes('tarefas'))), 'recepção: nem lê as tarefas', erros);
  conferir((await texto(page, '#heroiFrase')) === 'Hoje tem 5 horários na Agenda, 1 cliente já chegou e 4 carros no pátio.', 'recepção (relógio às 14h): a frase do dia ' + (await texto(page, '#heroiFrase')), erros);
  conferir((await texto(page, '#atencaoLista')).includes('passou da hora e ainda não chegou'), 'recepção (relógio às 14h): aviso de quem passou da hora', erros);
} });

/* ---------- 2. o último número aparece na hora ---------- */
let guardado = null;
await abrir('heroi-1a-visita', { papel: 'admin', zap: 'ok' }, { largura: 375, foto: null, quando: async (page, erros) => {
  guardado = await page.evaluate(() => localStorage.getItem('indycar_central_heroi'));
  const s = JSON.parse(guardado || 'null');
  conferir(!!s && s.d.conversas.esperando === 3 && s.d.agenda.total === 4 && s.d.patio.total === 4 && s.d.orcamentos.esperando === 2, 'a leitura boa guardou só as contagens ' + guardado, erros);
  conferir(!/Gabi|Hugo|Caio|Elisa|AAA|R\$|telefone/i.test(guardado || ''), 'o guardado não tem nome, placa, telefone nem valor', erros);
} });
// 2a visita, banco lento (2,5 s): o número de antes já está no herói, apagado, e depois vira o de verdade
await abrir('heroi-velho-375-escuro', { papel: 'admin', zap: 'ok', atraso: 2500 }, { largura: 375, limpar: false, semear: guardado, aoCarregar: async (page, erros) => {
  await espera(500);
  const f = await texto(page, '#heroiFrase');
  conferir(f === 'Hoje tem 3 conversas esperando, 4 horários na Agenda, 4 carros no pátio e 2 orçamentos esperando resposta.', 'banco lento: o herói já mostra o último número (' + f + ')', erros);
  conferir(await page.$eval('#heroiFrase', (e) => e.classList.contains('heroi-velho')), 'banco lento: o número de antes aparece apagado', erros);
  { const op = Number(await page.$eval('#heroiFrase', (e) => getComputedStyle(e).opacity)); conferir(op > 0 && op < 0.9, 'banco lento: o número de antes está de fato mais apagado (opacidade ' + op + ')', erros); }
  conferir(!!(await page.$eval('#heroiFrase', (e) => e.title)), 'banco lento: o apagado diz de que hora ele é (title)', erros);
  await page.screenshot({ path: join(SAIDA, 'heroi-velho-375-escuro.png') });
  await espera(3800);
  conferir(!(await page.$eval('#heroiFrase', (e) => e.classList.contains('heroi-velho'))), 'a leitura de verdade tira o apagado', erros);
}, foto: null });
// sem rede para ler: o número fica e o aviso diz de que hora ele é
await abrir('heroi-falha-375-escuro', { papel: 'admin', zap: 'ok', falhar: ['r6_agora'] }, { largura: 375, limpar: false, semear: guardado, quando: async (page, erros) => {
  const f = await texto(page, '#heroiFrase');
  conferir(/3 conversas esperando/.test(f), 'leitura falhou: o herói mantém o último número (' + f + ')', erros);
  const av = await texto(page, '#avisoRede');
  conferir(/Não consegui atualizar\. Os números são de \d{2}:\d{2}\. tentar de novo/.test(av), 'leitura falhou: o aviso diz a hora do número (' + av + ')', erros);
  conferir(!(await page.$eval('#avisoRede', (e) => e.hidden)), 'leitura falhou: o aviso aparece', erros);
} });
// sem número guardado e sem rede: continua o aviso de antes
await abrir('heroi-falha-sem-guardado', { papel: 'admin', zap: 'ok', falhar: ['r6_agora'] }, { largura: 375, foto: null, quando: async (page, erros) => {
  conferir((await texto(page, '#heroiFrase')) === 'Os números de hoje não carregaram.', 'sem guardado e sem leitura: "Os números de hoje não carregaram."', erros);
  conferir((await texto(page, '#avisoRede')).startsWith('Não consegui ler os números agora.'), 'sem guardado e sem leitura: o aviso de sempre', erros);
} });
// outra pessoa no mesmo aparelho: o número de quem usou antes NÃO aparece
const deOutro = JSON.stringify({ ...JSON.parse(guardado), perfil: '11111111-1111-4111-8111-111111111111' });
await abrir('heroi-outra-pessoa', { papel: 'admin', zap: 'ok', atraso: 2000 }, { largura: 375, limpar: false, semear: deOutro, foto: null, aoCarregar: async (page, erros) => {
  await espera(500);
  conferir((await texto(page, '#heroiFrase')) === 'Lendo o dia da oficina…', 'outra pessoa no aparelho: o herói diz "Lendo…" (não mostra o número dos outros)', erros);
  await espera(2800);
} });
// de ontem: não vale
const deOntem = JSON.stringify({ ...JSON.parse(guardado), dia: '2020-01-01', em: Date.now() - 1000 });
await abrir('heroi-de-ontem', { papel: 'admin', zap: 'ok', atraso: 2000 }, { largura: 375, limpar: false, semear: deOntem, foto: null, aoCarregar: async (page, erros) => {
  await espera(500);
  conferir((await texto(page, '#heroiFrase')) === 'Lendo o dia da oficina…', 'número de outro dia não aparece', erros);
  await espera(2800);
} });
// sair apaga o guardado
await abrir('heroi-sair', { papel: 'admin', zap: 'ok' }, { largura: 1440, foto: null, quando: async (page, erros) => {
  conferir(!!(await page.evaluate(() => localStorage.getItem('indycar_central_heroi'))), 'antes de sair há número guardado', erros);
  await page.click('#bPerfil'); await espera(150);
  await page.click('#menuPerfil [data-acao="sair"]'); await espera(400);
  conferir((await page.evaluate(() => localStorage.getItem('indycar_central_heroi'))) === null, 'sair apaga o número guardado do aparelho', erros);
} });

/* ---------- 3. sino: Fechar no celular ---------- */
await abrir('sino-fechar-375-escuro', { papel: 'admin', zap: 'ok' }, { largura: 375, foto: null, quando: async (page, erros) => {
  await page.click('#bSino'); await espera(400);
  const b = await page.$('#sinoRodape .sino-fechar');
  conferir(!!b, 'sino 375: tem o botão Fechar no pé', erros);
  const r = await page.$eval('#sinoRodape .sino-fechar', (e) => { const x = e.getBoundingClientRect(); return [Math.round(x.width), Math.round(x.height)]; });
  conferir(r[1] >= 44 && r[0] >= 44, 'sino 375: o Fechar tem toque de 44 px ou mais ' + r.join('x'), erros);
  await page.screenshot({ path: join(SAIDA, 'sino-dono-375-escuro.png') });
  await b.click(); await espera(250);
  conferir(await page.$eval('#painelSino', (e) => e.hidden), 'sino 375: Fechar fecha o painel', erros);
  conferir((await page.$eval('#bSino', (e) => e.getAttribute('aria-expanded'))) === 'false', 'sino 375: o botão do topo volta a "fechado"', erros);
  conferir(await page.evaluate(() => document.activeElement && document.activeElement.id === 'bSino'), 'sino 375: o foco volta para o sino', erros);
} });
await abrir('sino-fechar-1440-escuro', { papel: 'admin', zap: 'ok' }, { largura: 1440, foto: null, quando: async (page, erros) => {
  await page.click('#bSino'); await espera(400);
  conferir(await page.$eval('#sinoRodape .sino-fechar', (e) => getComputedStyle(e).display === 'none'), 'sino 1440: o Fechar não aparece no computador', erros);
} });

await browser.close();
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.join('\n')); process.exit(1); }
console.log('\nsem erro de console, sem rolagem lateral, toques >= 44 px no celular');
