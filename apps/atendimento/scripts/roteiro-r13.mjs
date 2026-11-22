// Roteiro de navegador da RODADA 13 (22/11/2026): a recepção no dia (tela "Hoje", conversa, "Fazer orçamento",
// aba Orçador) em 1440 e 375, escuro e claro. SÓ servidor de mentira, como o roteiro-r11.mjs (de onde veio a Central
// de mentira): o Atendimento é o scripts/mock-server.mjs e o Orçador é o build da Central (apps/orcador/) com o
// Supabase respondido pela interceptação do Chrome. Nada sai para a rede, nenhuma mensagem é enviada.
//
//   node scripts/roteiro-r13.mjs                      → provas (ok/FALHOU) e capturas depois-* em qa-out/r13/
//   node scripts/roteiro-r13.mjs --prefixo antes      → só as capturas antes-* (sem as provas da tela nova)
//   node scripts/roteiro-r13.mjs --papel admin        → outro perfil (padrão: atendente, a recepção)
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
const SAIDA = join(APP, 'qa-out', 'r13');
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
  const f = spawn(process.execPath, [join(pasta, 'scripts', 'mock-server.mjs')], { env: { ...process.env, PORT: String(porta), PREFIXO: '/atendimento/' }, stdio: 'ignore' });
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
const DEPOIS = PREFIXO !== 'antes';
const PAPEL = arg('--papel') || 'atendente';

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
async function foto(page, nome, w) {
  await espera(500);
  await page.screenshot({ path: join(SAIDA, `${PREFIXO}-${nome}.png`) });
  if (w < 700) await page.screenshot({ path: join(SAIDA, `${PREFIXO}-${nome}-inteira.png`), fullPage: true }).catch(() => {});
}
const linhaMedida = (tag, onde, m) => `${tag} ${onde}: lateral ${m.lateral}px; toques < 44px: ${m.pequenos.length}${m.pequenos.length ? ' (' + m.pequenos.slice(0, 14).join(', ') + ')' : ''}`;

const relatorio = [];
for (const tema of ['escuro', 'claro']) {
  for (const [largura, altura] of [[1440, 900], [375, 812]]) {
    const w = largura, tag = `${w}-${tema}`;
    const { page, erros, ctx } = await abrir(largura, altura, tema);
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|supabase-falso\.teste\/realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
    await page.goto(`${BASE}/atendimento/?papel=${PAPEL}&saude=ok`, { waitUntil: 'networkidle2' });
    await ate(() => page.evaluate(() => !document.getElementById('telaApp').hidden && document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
    await espera(1800);

    // 1) a entrada: o resumo de HOJE
    if (DEPOIS) {
      const hoje = await page.evaluate((larg) => {
        const el = document.getElementById(larg < 900 ? 'hojeMini' : 'hojePainel');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const frase = el.querySelector('.hoje-frase')?.textContent.replace(/\s+/g, ' ').trim() || '';
        const nums = [...el.querySelectorAll('.hoje-num b, .hoje-frase em')].map((b) => getComputedStyle(b).fontFamily);
        return { visivel: r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none', frase, barlow: nums.length > 0 && nums.every((f) => /Barlow Condensed/.test(f)) };
      }, w);
      conferir(`[${tag}] a tela abre com o resumo de hoje`, hoje && hoje.visivel && /hoje/i.test(hoje.frase), hoje && hoje.frase.slice(0, 120));
      conferir(`[${tag}] números do resumo em Barlow Condensed`, hoje && hoje.barlow);
    }
    if (DEPOIS) {
      const bordas = await page.evaluate(() => [...document.querySelectorAll('#telaApp *')].filter((el) => {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
        const cs = getComputedStyle(el); const l = parseFloat(cs.borderLeftWidth), d = parseFloat(cs.borderRightWidth);
        return cs.borderLeftStyle !== 'none' && l >= 3 && l > d && r.height > 30;
      }).map((el) => el.id || String(el.className).split(' ')[0]).slice(0, 5));
      conferir(`[${tag}] nenhum cartão com borda grossa de um lado só`, bordas.length === 0, bordas.join(', '));
    }
    const m1 = await medir(page);
    relatorio.push(linhaMedida(tag, 'entrada', m1));
    if (DEPOIS) conferir(`[${tag}] entrada sem rolagem para o lado`, m1.lateral <= 0, String(m1.lateral));
    if (DEPOIS && w < 700) conferir(`[${tag}] entrada: todo toque com 44 px ou mais`, m1.pequenos.length === 0, m1.pequenos.slice(0, 8).join(', '));
    await foto(page, `entrada-${tag}`, w);

    // 2) a conversa aberta (a do topo da lista)
    await page.evaluate(() => document.querySelector('#listaConversas .conversa').click());
    await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.getElementById('chatNome').textContent.trim()));
    await espera(1500);
    const m2 = await medir(page);
    relatorio.push(linhaMedida(tag, 'conversa', m2));
    if (DEPOIS) conferir(`[${tag}] conversa sem rolagem para o lado`, m2.lateral <= 0, String(m2.lateral));
    if (DEPOIS && w < 700) conferir(`[${tag}] conversa: todo toque com 44 px ou mais`, m2.pequenos.length === 0, m2.pequenos.slice(0, 8).join(', '));
    await foto(page, `conversa-${tag}`, w);

    // 3) "Fazer orçamento": vai para a aba Orçador já com o cliente
    const nome = await page.evaluate(() => (typeof conversaAtual !== 'undefined' && conversaAtual?.nome) || '');
    await page.evaluate(() => document.getElementById('btnFazerOrcamento').click());
    const naAba = await ate(() => page.evaluate(() => document.getElementById('aba-orcador').classList.contains('ativa')));
    const comCliente = await ate(async () => {
      const f = await moldura(page);
      return f && f.evaluate((n) => (document.body.innerText + ' ' + [...document.querySelectorAll('input')].map((i) => i.value).join(' ')).includes(n.split(' ')[0]), nome);
    }, 15000);
    if (DEPOIS) conferir(`[${tag}] "Fazer orçamento" abre a cotação com ${nome}`, naAba && comCliente);
    await espera(1500);
    const f = await moldura(page);
    if (f) {
      const m3 = await medir(f);
      relatorio.push(linhaMedida(tag, 'cotação (aba Orçador)', m3));
      if (DEPOIS) conferir(`[${tag}] cotação sem rolagem para o lado`, m3.lateral <= 0, String(m3.lateral));
      if (DEPOIS && w < 700) conferir(`[${tag}] cotação: todo toque com 44 px ou mais`, m3.pequenos.length === 0, m3.pequenos.slice(0, 8).join(', '));
    }
    await foto(page, `fazer-orcamento-${tag}`, w);

    // 4) a lista de orçamentos dentro da aba
    if (f) {
      await f.evaluate(() => { location.hash = '#/historico'; });
      await espera(2000);
      const m4 = await medir(f);
      relatorio.push(linhaMedida(tag, 'orçamentos (aba Orçador)', m4));
      if (DEPOIS) conferir(`[${tag}] orçamentos sem rolagem para o lado`, m4.lateral <= 0, String(m4.lateral));
      await foto(page, `orcamentos-${tag}`, w);
    }

    const envios = await (await fetch(`http://127.0.0.1:${PORTA_MOCK}/atendimento/api/_envios`)).json().catch(() => ({ envios: ['?'] }));
    conferir(`[${tag}] nenhuma mensagem saiu`, Array.isArray(envios.envios) && envios.envios.length === 0, String(envios.envios?.length));
    conferir(`[${tag}] zero erro de console`, erros.length === 0, erros.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

if (DEPOIS) {
  // "Voltar para a conversa" dentro da cotação: o Atendimento volta para a aba Conversas com a mesma conversa aberta
  const { page, erros, ctx } = await abrir(1440, 900, 'escuro');
  await page.goto(`${BASE}/atendimento/?papel=${PAPEL}&saude=ok`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
  await page.evaluate(() => document.querySelectorAll('#listaConversas .conversa')[1].click());
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden));
  const id = await page.evaluate(() => conversaAtual.id);
  await page.evaluate(() => fecharConversa());
  await page.evaluate(() => document.querySelector('.ic-abas .nav-item[data-aba="conversas"]').click());
  // abre a cotação pela conversa e volta
  await page.evaluate((i) => abrirConversa(i), id);
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden));
  await page.evaluate(() => document.getElementById('btnFazerOrcamento').click());
  const achou = await ate(async () => { const f = await moldura(page); return f && f.evaluate(() => [...document.querySelectorAll('button')].some((b) => /Voltar para a conversa/.test(b.textContent))); }, 15000);
  conferir('[1440] a cotação que veio da conversa mostra "Voltar para a conversa"', achou);
  await page.evaluate(() => fecharConversa());
  const f = await moldura(page);
  await f.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Voltar para a conversa/.test(b.textContent)).click());
  const voltou = await ate(() => page.evaluate((i) => document.getElementById('aba-conversas').classList.contains('ativa') && conversaAtual?.id === i, id));
  conferir('[1440] "Voltar para a conversa" reabre a conversa no Atendimento (sem outra aba do navegador)', voltou && (await browser.pages()).length <= 2);
  await foto(page, 'voltou-para-conversa-1440-escuro', 1440);
  conferir('[1440] volta sem erro de console', erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

conferir('nada saiu para a rede (só a Central de mentira e o banco falso)', foraDaCasa.length === 0, foraDaCasa.slice(0, 3).join(' '));
await browser.close();
const { writeFileSync } = await import('node:fs');
writeFileSync(join(SAIDA, `${PREFIXO}-medidas.txt`), relatorio.join('\n') + '\n\n' + resultados.map((r) => `${r.ok ? 'ok' : 'FALHOU'} ${r.nome}`).join('\n') + '\n');
console.log('\n' + relatorio.join('\n'));
const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} ok · capturas em ${SAIDA}`);
process.exit(falhas ? 1 : 0);
