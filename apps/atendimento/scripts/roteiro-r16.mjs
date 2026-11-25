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
const SAIDA = join(APP, 'qa-out', 'r16');
mkdirSync(SAIDA, { recursive: true });
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const ANTES = arg('--antes') ? resolve(arg('--antes')) : '';
const PORTA = 3306, PORTA_MOCK = 3307, PORTA_ANTES = 3308;
const SUPA = 'https://supabase-falso.teste';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- mocks do Atendimento (o de agora e, se pedido, o de antes) ---------------- */
const filhos = [];
function subirMock(pasta, porta) {
  const f = spawn(process.execPath, [join(pasta, 'scripts', 'mock-server.mjs')], { env: { ...process.env, PORT: String(porta), PREFIXO: '/atendimento/', ...(process.argv.includes('--sw') ? { SW_REAL: '1' } : {}) }, stdio: 'ignore' });
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

/* ---------------- provas da rodada 16 (--r16) ---------------- */
if (process.argv.includes('--r16')) {
  for (const tema of ['escuro', 'claro']) for (const [w, h] of [[1440, 900], [375, 812]]) {
    const tag = `${w}-${tema}`;
    const { page, erros, ctx } = await abrir(w, h, tema);
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
    await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
    await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
    await espera(1500);
    await page.evaluate(() => document.querySelector('#listaConversas .conversa').click());
    await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.getElementById('chatNome').textContent.trim()));
    await espera(1200);
    const est = () => page.evaluate(() => ({ msgs: Math.round(document.getElementById('mensagens').getBoundingClientRect().height),
      tags: getComputedStyle(document.querySelector('.chat-linha-tags')).display, chips: getComputedStyle(document.getElementById('r6ChipsChat')).display,
      btn: (() => { const r = document.getElementById('btnChatDetalhes').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
      prop: getComputedStyle(document.getElementById('chatPropostas')).display, exp: document.getElementById('btnChatDetalhes').getAttribute('aria-expanded') }));
    const a = await est();
    await page.screenshot({ path: join(SAIDA, `depois-conversa-${tag}.png`) });
    if (w < 700) {
      conferir(`[${tag}] conversa abre compacta: etiquetas e resumo escondidos, botão Detalhes com 44 px, mensagens com ${a.msgs}px`, a.tags === 'none' && a.chips === 'none' && a.btn.h >= 44 && a.msgs >= 300, JSON.stringify(a));
      await page.click('#btnChatDetalhes'); await espera(300);
      const b = await est();
      conferir(`[${tag}] Detalhes abre: etiquetas aparecem (${b.msgs}px de mensagens)`, b.tags !== 'none' && b.exp === 'true', JSON.stringify(b));
      await page.screenshot({ path: join(SAIDA, `depois-conversa-detalhes-${tag}.png`) });
      await page.reload({ waitUntil: 'networkidle2' });
      await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
      await page.evaluate(() => document.querySelector('#listaConversas .conversa').click());
      await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.getElementById('chatNome').textContent.trim()));
      await espera(800);
      conferir(`[${tag}] o aparelho lembra Detalhes aberto depois de recarregar`, (await est()).exp === 'true');
      await page.click('#btnChatDetalhes');
      const m = await medir(page);
      conferir(`[${tag}] conversa: sem rolagem lateral e todo toque com 44 px`, m.lateral <= 0 && m.pequenos.length === 0, `${m.lateral} ${m.pequenos.slice(0, 5).join(', ')}`);
      conferir(`[${tag}] propostas da IA continuam à vista na conversa compacta`, a.prop !== 'none');
    } else conferir(`[${tag}] computador: botão Detalhes não aparece e as etiquetas continuam`, a.btn.w === 0 && a.tags !== 'none', JSON.stringify(a));
    conferir(`[${tag}] zero erro de console`, erros.length === 0, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }
  /* service worker ligado, duas visitas */
  const { page, erros, ctx } = await abrir(375, 812, 'escuro');
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
  for (const visita of [1, 2]) {
    await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
    const sw = await page.evaluate(async () => { try { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((_, x) => setTimeout(() => x('sem sw'), 6000))]); await new Promise((ok) => setTimeout(ok, 1500)); return { ativo: !!r.active, cache: (await caches.keys()).join(',') }; } catch (e) { return { ativo: false, erro: String(e) }; } });
    const css = await page.evaluate(() => ({ r16: [...document.styleSheets].some((s) => /r16.css/.test(s.href || '')), botao: !!document.getElementById('btnChatDetalhes') }));
    conferir(`[sw] visita ${visita}: service worker ativo (${sw.cache || sw.erro})`, sw.ativo && /v28/.test(sw.cache || ''));
    conferir(`[sw] visita ${visita}: r16.css carregado e botão Detalhes presente`, css.r16 && css.botao, JSON.stringify(css));
    await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
  }
  conferir('[sw] zero erro de console nas 2 visitas', erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} ok · capturas em ${SAIDA}`);
await browser.close(); process.exit(falhas ? 1 : 0);
