// Roteiro de navegador da RODADA 15 (25/11/2026): a recepção no dia (tela "Hoje", conversa, "Fazer orçamento",
// aba Orçador) em 1440 e 375, escuro e claro. SÓ servidor de mentira, como o roteiro-r11.mjs (de onde veio a Central
// de mentira): o Atendimento é o scripts/mock-server.mjs e o Orçador é o build da Central (apps/orcador/) com o
// Supabase respondido pela interceptação do Chrome. Nada sai para a rede, nenhuma mensagem é enviada.
//
//   node scripts/roteiro-r14.mjs                      → provas (ok/FALHOU) e capturas depois-* em qa-out/r13/
//   node scripts/roteiro-r14.mjs --prefixo antes      → só as capturas antes-* (sem as provas da tela nova)
//   node scripts/roteiro-r14.mjs --papel admin        → outro perfil (padrão: atendente, a recepção)
// Monta uma "Central de mentira" na porta 3290: /atendimento/ (proxy para o mock na 3291), /orcador/ (apps/orcador),
// /casa/ (casa/) e /api/central/config apontando para o banco falso.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = resolve(AQUI, '..');
const MONO = resolve(APP, '..', '..');
const puppeteer = require(resolve(MONO, '../indycar-ferramentas/node_modules/puppeteer-core'));
const SAIDA = join(APP, 'qa-out', 'r15');
mkdirSync(SAIDA, { recursive: true });
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const ANTES = arg('--antes') ? resolve(arg('--antes')) : '';
const PORTA = 3296, PORTA_MOCK = 3297, PORTA_ANTES = 3298;
const SUPA = 'https://supabase-falso.teste';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- mocks do Atendimento (o de agora e, se pedido, o de antes) ---------------- */
const filhos = [];
function subirMock(pasta, porta) {
  const f = spawn(process.execPath, [join(pasta, 'scripts', 'mock-server.mjs')], { env: { ...process.env, PORT: String(porta), PREFIXO: '/atendimento/', ...(process.argv.includes('--r15') ? { SW_REAL: '1' } : {}) }, stdio: 'ignore' });
  filhos.push(f);
}
subirMock(APP, PORTA_MOCK);
if (ANTES) subirMock(ANTES, PORTA_ANTES);
process.on('exit', () => filhos.forEach((f) => { try { f.kill(); } catch { /* já foi */ } }));

/* ---------------- a Central de mentira ---------------- */
function estatico(res, dir, resto) {
  const alvo = normalize(join(dir, resto === '/' || !resto ? 'index.html' : decodeURIComponent(resto)));
  if (!alvo.startsWith(dir) || !existsSync(alvo) || statSync(alvo).isDirectory()) { res.writeHead(404); return res.end('nao achei'); }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  return res.end(readFileSync(alvo));
}
function central(portaMock) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/central/config') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ supabaseUrl: SUPA, supabaseAnonKey: 'anon-falsa' })); }
    if (u.pathname.startsWith('/orcador/')) return estatico(res, join(MONO, 'apps', 'orcador'), u.pathname.slice('/orcador'.length));
    if (u.pathname.startsWith('/casa/')) return estatico(res, join(MONO, 'casa'), u.pathname.slice('/casa'.length));
    if (u.pathname.startsWith('/atendimento/')) {
      const p = http.request({ host: '127.0.0.1', port: portaMock, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      p.on('error', () => { res.writeHead(502); res.end('mock fora'); });
      return req.pipe(p);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>Casa de mentira</title><p>Casa</p>');
  });
}
await new Promise((ok) => central(PORTA_MOCK).listen(PORTA, '127.0.0.1', ok));
const outra = ANTES ? central(PORTA_ANTES) : null;
if (outra) await new Promise((ok) => outra.listen(PORTA + 3, '127.0.0.1', ok));
const BASE = `http://localhost:${PORTA}`;
for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORTA_MOCK}/__qa/mock`); if (r.ok) break; } catch { /* subindo */ } await espera(250); }
if (ANTES) for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORTA_ANTES}/__qa/mock`); if (r.ok) break; } catch { /* subindo */ } await espera(250); }

/* ---------------- o Supabase falso do Orçador (respondido pelo Chrome) ---------------- */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const perfil = { id: ADMIN, nome: 'Ana Admin', email: 'admin@teste.indycar', papel: 'admin', ativo: true, apps: ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador'],
  cargo: null, telefone: null, avatar_cor: '#3b82f6', precisa_trocar_senha: false, preferencias: {}, ultimo_acesso_em: new Date().toISOString() };
const usuario = { id: ADMIN, email: perfil.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', factors: [] };
const sessao = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN, aal: 'aal1', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 })}.falsa`,
  refresh_token: 'renovar-falso', token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user: usuario };
const tabelas = {
  perfis: [perfil],
  orc_regras_preco: [{ id: true, desconto_sem_aprovacao_pct: '5', desconto_a_vista_pct: '10', margem_padrao_pct: '40', modo_margem: 'sobre_custo', max_parcelas: 10, parcelas_sem_juros: 10, juros_mensal_pct: '0', parcela_minima: '100', validade_dias: 7 }],
  orc_categorias: [{ id: 'oleo', nome: 'Óleo', margem_pct: null, ordem: 1 }],
  // rodada 13: alguns orçamentos de hoje e de antes, para o resumo do dia em Orçamentos ter o que contar
  orc_orcamentos: (() => {
    const ha = (min) => new Date(Date.now() - min * 60_000).toISOString();
    const linha = (n, status, total, criado, extra = {}) => ({ id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, numero: 80 + n, status, total,
      total_pecas: total * 0.6, total_mao_de_obra: total * 0.4, cliente_nome: ['Camila Rodrigues', 'José Antônio Ferreira', 'Marcos Lima', 'Ana Paula', 'Rafael Souza'][n % 5],
      cliente_telefone: '1299683011' + n, veiculo: { modelo: ['Corolla 2020', 'Onix 2018', 'HB20 2017', 'Gol 2015', 'Civic 2019'][n % 5] }, itens: [], pendencias: [],
      validade: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10), created_at: criado, updated_at: criado, follow_ups: 0, ...extra });
    return [
      linha(1, 'enviado', 1240, ha(90), { enviado_em: ha(85), visualizado_em: ha(30) }),
      linha(2, 'aberto', 480, ha(40)),
      linha(3, 'aprovado', 2150, ha(60 * 26), { enviado_em: ha(60 * 26), decidido_em: ha(120), total_aprovado: 1890 }),
      linha(4, 'enviado', 760, ha(60 * 50), { enviado_em: ha(60 * 50) }),
      linha(5, 'recusado', 990, ha(60 * 75), { decidido_em: ha(60 * 30), motivo_cod: 'preco' }),
    ];
  })(),
};

if (arg('--vazio')) tabelas.orc_orcamentos = [];
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok     ' : 'FALHOU '} ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
const foraDaCasa = [];

async function abrir(largura, altura, tema = 'escuro') {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: largura, height: altura, deviceScaleFactor: 1, isMobile: largura < 700, hasTouch: largura < 700 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  // a mesma sessão da Central (chave padrão do Supabase = "sb-<host>-auth-token")
  await page.evaluateOnNewDocument((s, t) => { try { localStorage.setItem('sb-supabase-falso-auth-token', s); localStorage.setItem('indycar_tema', t); } catch {} }, JSON.stringify(sessao), tema);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('http://localhost:') || url.startsWith('data:') || url.startsWith('blob:')) return req.continue();
    if (!url.startsWith(SUPA)) { foraDaCasa.push(url.slice(0, 80)); return req.respond({ status: 204, body: '' }); }
    const u = new URL(url);
    const json = (corpo, status = 200, extra = {}) => req.respond({ status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', ...extra }, body: JSON.stringify(corpo) });
    if (req.method() === 'OPTIONS') return json({}, 200, { 'access-control-allow-methods': 'GET,POST,PATCH,DELETE' });
    if (u.pathname === '/auth/v1/user') return json(usuario);
    if (u.pathname.startsWith('/auth/v1/factors')) return json({});
    if (u.pathname.startsWith('/auth/v1/')) return json({});
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    if (u.pathname.startsWith('/rest/v1/')) {
      const linhas = tabelas[u.pathname.split('/').pop()] ?? [];
      if ((req.headers().accept ?? '').includes('vnd.pgrst.object')) return linhas.length ? json(linhas[0]) : json({ code: 'PGRST116', message: '0 rows' }, 406);
      return json(linhas, 200, { 'content-range': `0-${Math.max(0, linhas.length - 1)}/${linhas.length}` });
    }
    if (u.pathname.startsWith('/functions/v1/')) return json({ ok: true });
    return json({});
  });
  return { page, erros, ctx };
}
const moldura = async (page) => { const h = await page.$('#orcadorMoldura'); return h ? h.contentFrame() : null; };
async function ate(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* ainda não */ } await espera(150); } return false; }

const PREFIXO = arg('--prefixo') || 'depois';
/* Mede a tela como o celular sente: rolagem para o lado e alvos de toque pequenos (só o que está visível). */
async function medir(alvo) {
  return alvo.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement;
    const lateral = doc.scrollWidth - doc.clientWidth;
    const pequenos = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, summary, textarea, [role="button"]')) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden]')) continue;
      if (r.bottom < 0 || r.top > innerHeight * 3) continue;
      if (el.closest('.modal-bg:not(.aberto)')) continue;
      if (el.closest('.pular') || el.classList.contains('pular')) continue;
      // caixinha dentro de um rótulo: o toque vale para a linha inteira do rótulo
      if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) { const l = el.closest('label').getBoundingClientRect(); if (l.height >= 43.5 && l.width >= 43.5) continue; }
      if (r.height < 43.5 || r.width < 43.5) pequenos.push(`${el.id || String(el.className || el.tagName).split(' ')[0]}`.slice(0, 32) + `${el.id ? '' : '@' + (el.parentElement?.closest('[id]')?.id || '')}` + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { lateral, pequenos };
  });
}
const PFX = arg('--prefixo') || 'e';
const PAPEL = arg('--papel') || 'admin';
const TEMAS = (arg('--temas') || 'escuro').split(',');
const TELAS = (arg('--telas') || 'abas,conversa,orcador').split(',');
const abas = (arg('--abas') || 'conversas,config,integracoes,ia,atalhos,etapas,equipe,auditoria').split(',');
for (const tema of TEMAS) for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { page, erros } = await abrir(w, h, tema);
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`${BASE}/atendimento/?papel=${PAPEL}&saude=ok`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
  await espera(1500);
  const sufixo = `${w}-${tema}`;
  if (TELAS.includes('abas')) for (const a of abas) {
    await page.evaluate((a) => document.querySelector(`[data-aba="${a}"]`)?.click(), a);
    await espera(900);
    await page.screenshot({ path: join(SAIDA, `${PFX}-${a}-${sufixo}.png`) });
  }
  if (TELAS.includes('conversa')) {
    await page.evaluate(() => document.querySelector('.ic-abas [data-aba="conversas"]').click());
    await page.evaluate(() => document.querySelector('#listaConversas .conversa').click());
    await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.getElementById('chatNome').textContent.trim()));
    await espera(1500);
    await page.screenshot({ path: join(SAIDA, `${PFX}-conversa-${sufixo}.png`) });
    console.log(sufixo, 'alturas', JSON.stringify(await page.evaluate(() => Object.fromEntries(['.chat-topo', '.chat-quem', '#chatAcoes', '#r6ChipsChat', '#r6Zap', '#chatPropostas', '.chat-envio', '.chat-msgs', '#chatMsgs', '#mensagens'].map((q) => [q, Math.round(document.querySelector(q)?.getBoundingClientRect().height ?? -1)])))));
  }
  if (TELAS.includes('orcador')) {
    await page.evaluate(() => { try { fecharConversa(); } catch {} document.querySelector('.ic-abas [data-aba="orcador"]').click(); });
    await espera(3500);
    const f = await moldura(page);
    if (f) for (const rota of (arg('--rotas') || '#/,#/historico,#/configuracoes').split(',')) {
      await f.evaluate((r) => { location.hash = r; }, rota);
      await espera(2000);
      if (rota.includes('configuracoes')) { const t = await f.evaluate(() => document.body.innerText); conferir(`[${sufixo}] Orçador Configurações: sem o aviso repetido do passo a passo, e o passo a passo continua`, !/Próximo passo:s*Siga o passo a passo/.test(t) && /Conectar o Movere passo a passo/.test(t)); }
      await page.screenshot({ path: join(SAIDA, `${PFX}-orc-${rota.replace(/[^a-z]/g, '') || 'inicio'}-${sufixo}.png`) });
    }
  }
  console.log(sufixo, 'erros:', erros.join(' | ') || 'nenhum');
}

/* ---------------- service worker ligado, duas visitas (--sw) ---------------- */
if (process.argv.includes('--sw-r14')) {
  const { page, erros, ctx } = await abrir(375, 812, 'escuro');
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
  for (const visita of [1, 2]) {
    await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
    const sw = await page.evaluate(async () => { try { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((_, x) => setTimeout(() => x('sem sw'), 6000))]); await new Promise((ok) => setTimeout(ok, 1500)); return { ativo: !!r.active, cache: (await caches.keys()).join(',') }; } catch (e) { return { ativo: false, erro: String(e) }; } });
    const css = await page.evaluate(() => ({ frase: getComputedStyle(document.querySelector('.hoje-mini .hoje-frase') || document.body).display, r14: [...document.styleSheets].some((s) => /r14.css/.test(s.href || '')) }));
    conferir(`[sw] visita ${visita}: service worker ativo (${sw.cache || sw.erro})`, sw.ativo);
    conferir(`[sw] visita ${visita}: r14.css carregado`, css.r14, JSON.stringify(css));
    await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
  }
  conferir('[sw] zero erro de console nas 2 visitas', erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---------------- provas da rodada 14 (--provas): claro e escuro, 1440 e 375 ---------------- */
if (process.argv.includes('--provas')) {
  const bordaGrossa = () => [...document.querySelectorAll('#telaApp *')].filter((el) => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el); const l = parseFloat(cs.borderLeftWidth), d = parseFloat(cs.borderRightWidth);
    if (cs.borderLeftStyle !== 'none' && l >= 3 && l > d && r.height > 30) return true;
    const pe = getComputedStyle(el, '::before'); return pe.content !== 'none' && pe.position === 'absolute' && parseFloat(pe.width) <= 4 && parseFloat(pe.height) > 30 && el.matches('.pessoa-cartao, .etapa-linha');
  }).map((el) => el.id || String(el.className).split(' ')[0]).slice(0, 5);
  for (const tema of ['escuro', 'claro']) for (const [w, h] of [[1440, 900], [375, 812]]) {
    const tag = `${w}-${tema}`;
    const { page, erros, ctx } = await abrir(w, h, tema);
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
    await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
    await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
    await espera(1500);
    const m0 = await medir(page);
    conferir(`[${tag}] lista sem rolagem lateral`, m0.lateral <= 0, String(m0.lateral));
    if (w < 700) {
      const topoLista = await page.evaluate(() => Math.round(document.querySelector('#listaConversas .conversa').getBoundingClientRect().top));
      conferir(`[${tag}] a primeira conversa aparece na tela (topo em ${topoLista}px de 812)`, topoLista < 640);
    }
    await page.screenshot({ path: join(SAIDA, `depois-conversas-${tag}.png`) });
    for (const a of ['config', 'integracoes', 'ia', 'atalhos', 'etapas', 'equipe']) {
      await page.evaluate((a) => document.querySelector(`.ajustes-abas [data-aba="${a}"], .ic-abas [data-aba="${a}"]`)?.click(), a);
      await espera(700);
      if (a === 'config') {
        const o = await page.evaluate(() => { const it = [...document.querySelectorAll('#ajustesAbas .nav-item')].filter((b) => b.offsetWidth).map((b) => b.getBoundingClientRect());
          let cruza = 0; for (let i = 1; i < it.length; i++) if (it[i].left < it[i - 1].right - 0.5) cruza++;
          return { n: it.length, cruza, menor: Math.round(Math.min(...it.map((r) => r.height))) }; });
        conferir(`[${tag}] abas de Ajustes sem se atropelar (${o.n} abas)`, o.cruza === 0, JSON.stringify(o));
        if (w < 700) conferir(`[${tag}] abas de Ajustes com 44 px`, o.menor >= 44, String(o.menor));
      }
      const m = await medir(page);
      conferir(`[${tag}] ${a}: sem rolagem lateral`, m.lateral <= 0, String(m.lateral));
      if (w < 700) conferir(`[${tag}] ${a}: todo toque com 44 px ou mais`, m.pequenos.length === 0, m.pequenos.slice(0, 6).join(', '));
      const bg = await page.evaluate(bordaGrossa);
      conferir(`[${tag}] ${a}: nenhum cartão com borda grossa de um lado só`, bg.length === 0, bg.join(', '));
      if (a === 'ia') {
        const t = await page.evaluate(() => ({ como: document.body.innerText.includes('Como funciona'), alt: Math.round(document.getElementById('iaTeste').getBoundingClientRect().height), bg: getComputedStyle(document.getElementById('iaTeste')).borderTopWidth }));
        conferir(`[${tag}] IA sem o cartão "Como funciona" e com o campo de teste estilizado`, !t.como && t.alt >= 90 && t.bg !== '0px', JSON.stringify(t));
      }
      if (a === 'etapas') {
        const t = await page.evaluate(() => document.querySelector('#aba-etapas').innerText);
        conferir(`[${tag}] Etapas sem texto de lacuna repetido`, !/Sem descrição|sem gatilhos|ORDEM d/i.test(t));
      }
      if (a === 'integracoes') {
        const t = await page.evaluate(() => { const l = document.querySelector('label.switch input[name="ativo"]')?.closest('label'); const i = l.querySelector('input').getBoundingClientRect(), s = l.querySelector('span').getBoundingClientRect(); return { mesmaLinha: Math.abs((i.top + i.height / 2) - (s.top + s.height / 2)) < 8, alinhado: getComputedStyle(l).textAlign !== 'center' }; });
        conferir(`[${tag}] chaves: caixinha e texto na mesma linha`, t.mesmaLinha && t.alinhado, JSON.stringify(t));
      }
      await page.screenshot({ path: join(SAIDA, `depois-${a}-${tag}.png`) });
    }
    conferir(`[${tag}] zero erro de console`, erros.length === 0, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }
}
/* ---------------- provas da rodada 15 (--r15) ---------------- */
if (process.argv.includes('--r15')) {
  for (const tema of ['escuro', 'claro']) for (const [w, h] of [[1440, 900], [375, 812]]) {
    const tag = `${w}-${tema}`;
    const { page, erros, ctx } = await abrir(w, h, tema);
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
    await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
    await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
    await espera(1500);
    const lista = await page.evaluate(() => [...document.querySelectorAll('#listaConversas .conversa')].map((c) => ({
      chips: c.querySelectorAll('.r6-chips > *').length,
      bolinha: (() => { const b = c.querySelector('.conversa-tags .nao-lidas'); if (!b) return null; const topos = [...c.querySelectorAll('.conversa-tags > *')].filter((x) => x.offsetWidth).map((x) => x.getBoundingClientRect().top); return b.getBoundingClientRect().top <= Math.min(...topos) + 20; })(),
    })));
    conferir(`[${tag}] cada linha da lista tem no máximo 3 fichinhas do resumo`, lista.every((l) => l.chips <= 3), JSON.stringify(lista.map((l) => l.chips)));
    conferir(`[${tag}] bolinha de não lidas na mesma linha da primeira fichinha`, lista.every((l) => l.bolinha !== false), JSON.stringify(lista.map((l) => l.bolinha)));
    await page.screenshot({ path: join(SAIDA, `depois-lista-${tag}.png`) });
    await page.evaluate(() => document.querySelector('#listaConversas .conversa').click());
    await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.getElementById('chatNome').textContent.trim()));
    await espera(1200);
    const nome1 = await page.evaluate(() => document.getElementById('chatNome').textContent.trim());
    const alt0 = await page.evaluate(() => Math.round(document.getElementById('mensagens').getBoundingClientRect().height));
    const bt = await page.evaluate(() => { const b = document.getElementById('btnProximaChat'); const r = b.getBoundingClientRect(); return { visivel: !!r.width, w: Math.round(r.width), h: Math.round(r.height) }; });
    conferir(`[${tag}] botão Próxima ${w < 700 ? 'aparece' : 'não aparece (o PRÓXIMA da lista está ao lado)'} na conversa`, w < 700 ? bt.visivel : !bt.visivel, JSON.stringify(bt));
    if (w < 700) conferir(`[${tag}] botão Próxima com 44 px`, bt.w >= 44 && bt.h >= 44, JSON.stringify(bt));
    await page.screenshot({ path: join(SAIDA, `depois-conversa-${tag}.png`) });
    if (w < 700) {
      await page.focus('#campoMensagem');
      await espera(500);
      const d = await page.evaluate(() => ({ cls: document.body.classList.contains('digitando'), alt: Math.round(document.getElementById('mensagens').getBoundingClientRect().height),
        acoes: getComputedStyle(document.getElementById('chatAcoes')).display, campo: Math.round(document.getElementById('campoMensagem').getBoundingClientRect().bottom) }));
      conferir(`[${tag}] digitando: some o miolo e as mensagens crescem (${alt0}px -> ${d.alt}px)`, d.cls && d.acoes === 'none' && d.alt > alt0 + 60, JSON.stringify(d));
      await page.screenshot({ path: join(SAIDA, `depois-digitando-${tag}.png`) });
      await page.evaluate(() => document.getElementById('campoMensagem').blur());
      await espera(500);
      const v = await page.evaluate(() => ({ cls: document.body.classList.contains('digitando'), acoes: getComputedStyle(document.getElementById('chatAcoes')).display }));
      conferir(`[${tag}] saiu do campo: tudo volta`, !v.cls && v.acoes !== 'none', JSON.stringify(v));
      const m = await medir(page);
      conferir(`[${tag}] conversa: sem rolagem lateral e todo toque com 44 px`, m.lateral <= 0 && m.pequenos.length === 0, `${m.lateral} ${m.pequenos.slice(0, 5).join(', ')}`);
    }
    if (w < 700) await page.click('#btnProximaChat'); else await page.evaluate(() => window.R6Tela.irParaProxima());
    await espera(1500);
    const nome2 = await page.evaluate(() => document.getElementById('chatNome').textContent.trim());
    conferir(`[${tag}] Próxima troca de conversa (${nome1} -> ${nome2})`, nome2 && nome2 !== nome1);
    conferir(`[${tag}] zero erro de console`, erros.length === 0, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }
  /* service worker ligado, duas visitas */
  const { page, erros, ctx } = await abrir(375, 812, 'escuro');
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
  for (const visita of [1, 2]) {
    await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
    const sw = await page.evaluate(async () => { try { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((_, x) => setTimeout(() => x('sem sw'), 6000))]); await new Promise((ok) => setTimeout(ok, 1500)); return { ativo: !!r.active, cache: (await caches.keys()).join(',') }; } catch (e) { return { ativo: false, erro: String(e) }; } });
    const css = await page.evaluate(() => ({ r15: [...document.styleSheets].some((s) => /r15.css/.test(s.href || '')), js: typeof window.R6Tela, botao: !!document.getElementById('btnProximaChat'),
      pre: !!document.querySelector('link[rel="preconnect"][href*="supabase"]') }));
    conferir(`[sw] visita ${visita}: service worker ativo (${sw.cache || sw.erro})`, sw.ativo && /v27/.test(sw.cache || ''));
    conferir(`[sw] visita ${visita}: r15.css carregado e botão Próxima presente`, css.r15 && css.botao, JSON.stringify(css));
    await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
  }
  conferir('[sw] zero erro de console nas 2 visitas', erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`
${resultados.length - falhas}/${resultados.length} ok · capturas em ${SAIDA}`);
await browser.close(); process.exit(falhas ? 1 : 0);
