// Casa R18: a casa em ordem, no Chrome com o Supabase de mentira.
//  1) WhatsApp parado (como em 25/11: anotado "ok", nada chega há 30 h): uma linha no herói que leva ao Atendimento;
//  2) o sino com 131 não lidas: grupos por tipo, "marcar todas" pergunta com a contagem, marca, e "desfazer" volta só aquele lote.
//   ANTES=1 serve os arquivos da Casa do último commit (HEAD) para as fotos do antes.
// Uso: node scripts/qa-r18-casa.mjs <pasta-das-fotos>
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const ANTES = process.env.ANTES === '1';
const BASE = 'http://localhost:3524';
const SAIDA = resolve(process.argv[2] || 'qa-out/r18/depois');
mkdirSync(SAIDA, { recursive: true });
const MOCK = readFileSync(join(RAIZ, 'tests/r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(RAIZ, 'tests/r10-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
const problemas = [];
const conferir = (ok, msg, erros) => { console.log((ok ? 'ok      ' : 'FALHOU  ') + msg); if (!ok) erros.push(msg); };

async function abrir(nome, cenario, { largura = 1440, tema = 'escuro', foto = nome, quando = null } = {}) {
  const page = await browser.newPage(); const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.setViewport({ width: largura, height: largura < 600 ? 812 : 900 });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((c, t) => {
    window.__CENARIO = c; window.open = () => ({ focus() {} });
    try { navigator.serviceWorker.register = () => Promise.resolve({}); } catch {}
    try { localStorage.clear(); localStorage.setItem('indycar_tema', t); } catch {}
  }, cenario, tema);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') return json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'x', versao: 'r18', apps: {}, orcadorNaCentral: true });
    if (u.pathname === '/api/central/saude-apps') return json({ verificado_em: Date.now(), apps: {}, internos: {} });
    if (u.pathname === '/api/central/faturamento') return json({ faturamento: { mes: 48250, sem_valor_semana: 2 } });
    if (u.pathname === '/agenda/api/agendamentos') return json([]);
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
  await espera(1300);
  if (quando) { try { await quando(page, erros); } catch (e) { erros.push('roteiro: ' + e.message); } }
  if (foto) await page.screenshot({ path: join(SAIDA, foto + '.png'), fullPage: false });
  const medida = await page.evaluate(() => ({ largo: document.documentElement.scrollWidth > window.innerWidth + 1, pequenos: [...document.querySelectorAll('a[href], button, input, summary')].filter((e) => { const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || e.offsetParent === null) return false; const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !e.closest('.pular'); }).map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)) }));
  const linha = `${nome}: ${medida.largo ? 'ROLAGEM LATERAL ' : ''}${largura < 600 && medida.pequenos.length ? 'toques pequenos: ' + medida.pequenos.join(', ') + ' ' : ''}${erros.length ? 'ERROS ' + erros.join(' | ') : 'ok'}`;
  console.log(linha);
  if (erros.length || medida.largo || (largura < 600 && medida.pequenos.length)) problemas.push(linha);
  await page.close();
}
const zap = (page) => page.evaluate(() => { const a = document.querySelector('#heroiZap'); return a ? { visivel: !a.hidden && getComputedStyle(a).display !== 'none', texto: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') || '', y: Math.round(a.getBoundingClientRect().top) } : { visivel: false, texto: '', href: '', y: null }; });
const gravado = (page) => page.evaluate(() => (window.__GRAVADO || []).filter((g) => g.tabela === 'notificacoes').map((g) => ({ valor: g.valor, filtros: g.filtros.map((f) => [f[0], f[1], Array.isArray(f[2]) ? f[2].length : f[2]]) })));

/* 1) WhatsApp parado */
for (const tema of ['escuro', 'claro']) {
  for (const largura of [375, 1440]) {
    await abrir(`zap-atendente-${largura}-${tema}`, { papel: 'atendente', zap: 'ok', semOrcamento: true, silencio: 30 }, { largura, tema, quando: async (page, erros) => {
      const z = await zap(page);
      if (ANTES) return;
      conferir(z.visivel && /^⚠ Parado WhatsApp parado desde .+: nenhuma mensagem de cliente chega\./i.test(z.texto), `atendente ${largura} ${tema}: linha do WhatsApp parado no herói (${z.texto})`, erros);
      conferir(/Peça ao João para colar a chave em Ajustes › WhatsApp e chaves\. Abrir o Atendimento/.test(z.texto) && /\/atendimento\//.test(z.href), `atendente ${largura} ${tema}: diz o que fazer e leva ao Atendimento`, erros);
      conferir(z.y != null && z.y < (largura < 600 ? 400 : 300), `atendente ${largura} ${tema}: na primeira tela (y=${z.y})`, erros);
    } });
  }
}
await abrir('zap-dono-1440-escuro', { papel: 'admin', zap: 'ok', semOrcamento: true, silencio: 30 }, { quando: async (page, erros) => {
  const z = await zap(page);
  if (ANTES) return;
  conferir(/Cole a chave do CodeWords em Atendimento › Ajustes › WhatsApp e chaves/.test(z.texto) && /aba=integracoes/.test(z.href), 'dono: o passo é dele e o link abre as Integrações', erros);
  const saude = await page.$eval('#saudeTxt', (e) => e.textContent);
  conferir(!/em ordem/i.test(saude), 'a saúde dos sistemas não diz "em ordem" (' + saude + ')', erros);
} });
await abrir('zap-anotado-401-375-escuro', { papel: 'gestor', zap: 'ok', semOrcamento: true, zapAnotado: 'codewords-401' }, { largura: 375, quando: async (page, erros) => {
  const z = await zap(page);
  if (!ANTES) conferir(/chave do CodeWords foi recusada/.test(z.texto), 'servidor anotou 401: a linha diz o motivo (' + z.texto + ')', erros);
} });
await abrir('zap-ok-375-escuro', { papel: 'atendente', zap: 'ok', semOrcamento: true }, { largura: 375, quando: async (page, erros) => {
  const z = await zap(page);
  if (!ANTES) conferir(!z.visivel, 'WhatsApp funcionando (última mensagem há 6 min): nenhuma linha', erros);
} });
await abrir('zap-mecanico-375-escuro', { papel: 'mecanico', zap: 'ok', silencio: 30 }, { largura: 375, foto: null, quando: async (page, erros) => {
  const z = await zap(page);
  if (!ANTES) conferir(!z.visivel, 'mecânico (sem Atendimento): nenhuma linha', erros);
} });

/* 2) o sino com 131 não lidas */
const abrirSino = async (page) => { await page.click('#bSino'); await espera(700); };
for (const tema of ['escuro', 'claro']) {
  for (const largura of [375, 1440]) {
    await abrir(`sino-grupos-${largura}-${tema}`, { papel: 'admin', zap: 'ok', semOrcamento: true, muitosAvisos: true }, { largura, tema, quando: async (page, erros) => {
      await abrirSino(page);
      const g = await page.evaluate(() => ({ num: document.querySelector('#sinoNum').textContent, grupos: [...document.querySelectorAll('#listaNotif .notif-grupo summary')].map((s) => s.innerText.replace(/\s+/g, ' ').trim()) }));
      if (ANTES) { console.log('ANTES grupos: ' + g.grupos.length + ' → ' + g.grupos.slice(0, 4).join(' | ')); return; }
      conferir(g.num === '99+', `sino ${largura} ${tema}: 99+ no sino (${g.num})`, erros);
      conferir(/^📝 50 tarefas/.test(g.grupos[0] || '') && /^🔧 23 avisos do Pátio/.test(g.grupos[1] || ''), `sino ${largura} ${tema}: grupo maior primeiro (${g.grupos.slice(0, 3).join(' | ')})`, erros);
      conferir(g.grupos.every((t) => /o mais novo/.test(t)), `sino ${largura} ${tema}: cada grupo diz quando chegou o mais novo`, erros);
    } });
    await abrir(`sino-confirma-${largura}-${tema}`, { papel: 'admin', zap: 'ok', semOrcamento: true, muitosAvisos: true }, { largura, tema, quando: async (page, erros) => {
      await abrirSino(page);
      await page.click('#bLerTodas'); await espera(300);
      const antesDeConfirmar = await gravado(page);
      const p = await page.evaluate(() => { const l = document.querySelector('#listaNotif .sino-lote'); return l ? l.innerText.replace(/\s+/g, ' ').trim() : ''; });
      if (ANTES) return;
      conferir(/^Marcar 131 avisos como lidos\? Marcar 131 Cancelar$/.test(p), `confirma ${largura} ${tema}: pergunta com a contagem (${p})`, erros);
      conferir(antesDeConfirmar.filter((x) => x.valor && x.valor.lida_em !== null && x.filtros.some((f) => f[0] === 'in' && f[2] > 20)).length === 0, `confirma ${largura} ${tema}: nada gravado antes de confirmar`, erros);
    } });
    await abrir(`sino-desfazer-${largura}-${tema}`, { papel: 'admin', zap: 'ok', semOrcamento: true, muitosAvisos: true }, { largura, tema, quando: async (page, erros) => {
      await abrirSino(page);
      await page.click('#bLerTodas'); await espera(200);
      if (ANTES) return;
      await page.click('#listaNotif [data-lote-sim]'); await espera(400);
      const depois = await page.evaluate(() => ({ num: document.querySelector('#sinoNum').hidden ? '' : document.querySelector('#sinoNum').textContent, barra: (document.querySelector('#listaNotif .sino-desfazer') || {}).textContent || '', foco: document.activeElement && document.activeElement.hasAttribute('data-lote-desfazer') }));
      const g1 = await gravado(page);
      /* R19: o lote vai em pedaços de até 100 ids (o endereço de uma escrita com centenas de ids não cabe); todos com a mesma hora */
      const tam = (x) => (x.filtros.find((f) => f[0] === 'in') || [])[2] || 0;
      const marcas = g1.filter((x) => x.valor && x.valor.lida_em && tam(x) > 20);
      const lote = marcas[0];
      conferir(marcas.length === 2 && marcas.reduce((s, x) => s + tam(x), 0) === 131 && marcas.every((x) => tam(x) <= 100 && x.valor.lida_em === lote.valor.lida_em), `desfazer ${largura} ${tema}: marcou os 131 em pedaços de até 100, com a mesma hora (${marcas.map(tam).join('+')})`, erros);
      conferir(depois.num === '' && /131 avisos marcados como lidos\./.test(depois.barra) && depois.foco, `desfazer ${largura} ${tema}: sino zerado e "Desfazer" com o foco (${depois.num}|${depois.barra.trim()})`, erros);
      if (largura === 375 && tema === 'escuro') await page.screenshot({ path: join(SAIDA, `sino-desfazer-barra-${largura}-${tema}.png`) });
      await page.click('#listaNotif [data-lote-desfazer]'); await espera(500);
      const g2 = await gravado(page);
      const voltas = g2.filter((x) => x.valor && x.valor.lida_em === null);
      conferir(voltas.reduce((s, x) => s + tam(x), 0) === 131 && voltas.every((x) => x.filtros.some((f) => f[0] === 'eq' && f[1] === 'lida_em' && f[2] === lote.valor.lida_em)), `desfazer ${largura} ${tema}: volta só o que tem a hora deste lote`, erros);
      const num = await page.$eval('#sinoNum', (e) => e.textContent);
      conferir(num === '99+', `desfazer ${largura} ${tema}: o sino volta a contar (${num})`, erros);
    } });
  }
}
await abrir('sino-grupo-cancelar-1440-escuro', { papel: 'admin', zap: 'ok', semOrcamento: true, muitosAvisos: true }, { quando: async (page, erros) => {
  await abrirSino(page);
  if (ANTES) return;
  await page.click('#listaNotif .notif-grupo summary'); await espera(200);
  await page.click('#listaNotif .notif-grupo .g-ler'); await espera(200);
  const p = await page.$eval('#listaNotif .sino-lote p', (e) => e.textContent);
  conferir(p === 'Marcar os 50 avisos deste grupo como lidos?', 'grupo: pergunta com a contagem do grupo (' + p + ')', erros);
  const antes = (await gravado(page)).length;
  await page.click('#listaNotif [data-lote-nao]'); await espera(200);
  const depois = await page.evaluate(() => ({ lote: !!document.querySelector('#listaNotif .sino-lote'), num: document.querySelector('#sinoNum').textContent, foco: document.activeElement && document.activeElement.classList.contains('g-ler') }));
  conferir(!depois.lote && depois.num === '99+' && (await gravado(page)).length === antes && depois.foco, 'grupo: Cancelar não grava nada e devolve o foco ao botão do grupo', erros);
} });

await browser.close();
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.join('\n')); process.exit(1); }
console.log('\nsem erro de console, sem rolagem lateral, toques >= 44 px no celular');
