// Roteiro de navegador da RODADA 11 (21/11/2026): a aba Orçador dentro do Atendimento e o "Fazer orçamento".
// SÓ servidor de mentira: o Atendimento é o scripts/mock-server.mjs (Supabase dublê dentro da página, nada sai para
// o CodeWords nem para o WhatsApp); o Orçador é o build de verdade da Central (apps/orcador/) com o Supabase
// respondido pela interceptação do Chrome (host inventado supabase-falso.teste). Nada sai para a rede.
//
//   node scripts/roteiro-r11.mjs                 → provas (ok/FALHOU) e capturas em qa-out/r11/
//   node scripts/roteiro-r11.mjs --antes <pasta>  → também fotografa o Atendimento de <pasta> (git archive de antes)
//
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
const SAIDA = join(APP, 'qa-out', 'r11');
mkdirSync(SAIDA, { recursive: true });
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const ANTES = arg('--antes') ? resolve(arg('--antes')) : '';
const PORTA = 3290, PORTA_MOCK = 3291, PORTA_ANTES = 3292;
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
};

const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok     ' : 'FALHOU '} ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
const foraDaCasa = [];

async function abrir(largura, altura, base = BASE) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: largura, height: altura, deviceScaleFactor: 1, isMobile: largura < 700, hasTouch: largura < 700 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  // a mesma sessão da Central (chave padrão do Supabase = "sb-<host>-auth-token")
  await page.evaluateOnNewDocument((s) => { try { localStorage.setItem('sb-supabase-falso-auth-token', s); localStorage.setItem('indycar_tema', 'escuro'); } catch {} }, JSON.stringify(sessao));
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

for (const [largura, altura] of [[1440, 900], [375, 812]]) {
  const w = largura;
  const { page, erros, ctx } = await abrir(largura, altura);
  await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => !document.getElementById('telaApp').hidden && document.querySelectorAll('#listaConversas .conversa').length > 0));

  const topo = await page.evaluate(() => {
    const t = document.querySelector('.ic-topo');
    const abas = [...document.querySelectorAll('.ic-abas .nav-item')].filter((b) => !b.hidden).map((b) => b.textContent.trim().replace(/\s+\d+$/, ''));
    return { nome: t?.querySelector('.ic-nome')?.textContent.trim(), fonte: getComputedStyle(t.querySelector('.ic-nome')).fontFamily, abas,
      lateral: !!document.querySelector('.sidebar'), sino: !!document.getElementById('btnSino'), ajuda: !!document.getElementById('modalAjudaBg') };
  });
  conferir(`[${w}] topo comum: "${topo.nome}" em Barlow Condensed`, topo.nome === 'IndyCar Atendimento' && /Barlow Condensed/.test(topo.fonte), topo.fonte);
  conferir(`[${w}] abas do topo: ${topo.abas.join(' · ')}`, JSON.stringify(topo.abas) === JSON.stringify(['Conversas', 'Orçador', 'Ajustes']));
  conferir(`[${w}] sem barra lateral, sino e Ajuda`, !topo.lateral && !topo.sino && !topo.ajuda);
  await page.screenshot({ path: join(SAIDA, `depois-atendimento-${w}.png`) });

  // Ajustes: a linha das telas de configurar aparece só ali, e "Ajustes" continua marcado nas telas dela
  await page.click('.ic-abas .nav-item[data-aba="config"]');
  await page.evaluate(() => document.querySelector('#ajustesAbas .nav-item[data-aba="integracoes"]').click());
  const ajustes = await page.evaluate(() => ({ linha: !document.getElementById('ajustesAbas').hidden, marcado: document.getElementById('navAjustes').classList.contains('ativo'),
    tela: document.getElementById('aba-integracoes').classList.contains('ativa') }));
  conferir(`[${w}] Ajustes: linha de telas e "Ajustes" marcado em WhatsApp e chaves`, ajustes.linha && ajustes.marcado && ajustes.tela, JSON.stringify(ajustes));
  await page.click('.ic-abas .nav-item[data-aba="conversas"]');
  conferir(`[${w}] fora de Ajustes a linha some`, await page.evaluate(() => document.getElementById('ajustesAbas').hidden));

  // 1) a aba Orçador mostra o Orçador inteiro, sem trocar de site, sem login e sem o topo dele
  await page.click('.ic-abas .nav-item[data-aba="orcador"]');
  const carregou = await ate(async () => { const f = await moldura(page); return f && f.evaluate(() => !!document.querySelector('.orc-subtopo .ic-abas a')); }, 15000);
  const dentro = carregou ? await (await moldura(page)).evaluate(() => ({
    url: location.pathname, abas: [...document.querySelectorAll('.ic-abas a')].map((a) => a.textContent.trim()),
    marca: !!document.querySelector('.ic-marca'), login: !!document.querySelector('input[type="password"]'), embutido: document.documentElement.hasAttribute('data-embutido'),
  })) : null;
  conferir(`[${w}] aba Orçador abre o Orçador da Central (/orcador/) na mesma página`, carregou && dentro.url === '/orcador/' && page.url().includes('/atendimento/'), dentro && JSON.stringify(dentro.abas));
  conferir(`[${w}] mesma sessão: nenhum login no Orçador`, carregou && !dentro.login);
  conferir(`[${w}] dentro da aba, sem topo duplicado (só as abas)`, carregou && dentro.embutido && !dentro.marca);
  await espera(600);
  await page.screenshot({ path: join(SAIDA, `depois-aba-orcador-${w}.png`) });

  // 2) numa conversa aberta, "Fazer orçamento" leva para a aba Orçador já com o cliente
  await page.click('.ic-abas .nav-item[data-aba="conversas"]');
  await page.evaluate(() => document.querySelector('#listaConversas .conversa').click());
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.getElementById('chatNome').textContent.trim()));
  const cliente = await page.evaluate(() => ({ nome: (typeof conversaAtual !== 'undefined' && conversaAtual?.nome) || '', tel: (typeof conversaAtual !== 'undefined' && (conversaAtual?.telefone_e164 || conversaAtual?.telefone)) || '' }));
  const visivel = await page.evaluate(() => { const b = document.getElementById('btnFazerOrcamento'); const r = b?.getBoundingClientRect(); return !!b && r.width > 0 && getComputedStyle(b).display !== 'none'; });
  conferir(`[${w}] botão "Fazer orçamento" na conversa aberta`, visivel);
  await page.evaluate(() => document.getElementById('btnFazerOrcamento').click());
  const naAba = await ate(() => page.evaluate(() => document.getElementById('aba-orcador').classList.contains('ativa')));
  const temCliente = await ate(async () => {
    const f = await moldura(page);
    // o nome aparece no bloco do cliente (texto ou campo preenchido)
    return f && f.evaluate((nome) => /^#\/cotacao/.test(location.hash)
      && (document.body.innerText + ' ' + [...document.querySelectorAll('input')].map((i) => i.value).join(' ')).includes(nome.split(' ')[0]), cliente.nome);
  }, 15000);
  const hash = await (await moldura(page))?.evaluate(() => decodeURIComponent(location.hash)).catch(() => '');
  const pedido = await page.evaluate(() => document.getElementById('orcadorMoldura').src);
  const doPedido = new URL(pedido);
  conferir(`[${w}] a moldura recebeu o nome, o telefone e a conversa`, doPedido.pathname === '/orcador/' && doPedido.searchParams.get('nome') === cliente.nome
    && doPedido.searchParams.get('tel') === String(cliente.tel).replace(/\D/g, '') && /^[0-9a-f-]{36}$/.test(doPedido.searchParams.get('conversa') || ''), doPedido.search.slice(0, 100));
  conferir(`[${w}] "Fazer orçamento" abre a aba Orçador`, naAba);
  conferir(`[${w}] a cotação nova já vem com o cliente (${cliente.nome})`, temCliente, hash.slice(0, 120));
  await espera(800);
  await page.screenshot({ path: join(SAIDA, `depois-fazer-orcamento-${w}.png`) });

  // 3) nada foi mandado para cliente nenhum
  const envios = await (await fetch(`http://127.0.0.1:${PORTA_MOCK}/atendimento/api/_envios`)).json().catch(() => ({ envios: ['?'] }));
  conferir(`[${w}] nenhuma mensagem saiu (WhatsApp/CodeWords do mock)`, Array.isArray(envios.envios) && envios.envios.length === 0, String(envios.envios?.length));
  conferir(`[${w}] sem erro de JavaScript na página`, erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{
  // ?aba=orcador (link da Casa e volta do login do Orçador) já abre na aba Orçador
  const { page, erros, ctx } = await abrir(1440, 900);
  await page.goto(`${BASE}/atendimento/?papel=admin&saude=ok&aba=orcador`, { waitUntil: 'networkidle2' });
  const abriu = await ate(() => page.evaluate(() => document.getElementById('aba-orcador').classList.contains('ativa') && /\/orcador\/$/.test(document.getElementById('orcadorMoldura').src)));
  conferir('[1440] /atendimento/?aba=orcador abre direto na aba Orçador', abriu && erros.length === 0, erros.join(' | '));
  await ctx.close();
}
{
  // o Orçador aberto sozinho na Central (/orcador/): o topo comum, com a marca que volta para a Central
  const { page, erros, ctx } = await abrir(1440, 900);
  await page.goto(`${BASE}/orcador/`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => !!document.querySelector('header.ic-topo .ic-nome')));
  const t = await page.evaluate(() => ({ nome: document.querySelector('header.ic-topo .ic-nome')?.textContent.trim(), volta: document.querySelector('header.ic-topo .ic-marca')?.getAttribute('href'),
    abas: [...document.querySelectorAll('header.ic-topo .ic-abas a')].map((a) => a.textContent.trim()), lateral: !!document.querySelector('.casca-lateral, aside') }));
  conferir('[1440] Orçador sozinho: topo "IndyCar Orçador" que volta para a Central, 3 abas', t.nome === 'IndyCar Orçador' && t.volta === '/' && t.abas.join('|') === 'Nova cotação|Orçamentos|Configurações' && !t.lateral, JSON.stringify(t));
  conferir('[1440] Orçador sozinho sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await espera(500);
  await page.screenshot({ path: join(SAIDA, 'depois-orcador-sozinho-1440.png') });
  await ctx.close();
}

if (ANTES) {
  for (const [largura, altura] of [[1440, 900], [375, 812]]) {
    const { page, ctx } = await abrir(largura, altura, `http://localhost:${PORTA + 3}`);
    await page.goto(`http://localhost:${PORTA + 3}/atendimento/?papel=admin&saude=ok`, { waitUntil: 'networkidle2' });
    await ate(() => page.evaluate(() => !document.getElementById('telaApp').hidden));
    await espera(800);
    await page.screenshot({ path: join(SAIDA, `antes-atendimento-${largura}.png`) });
    await ctx.close();
  }
}

conferir('nada saiu para a rede (só a Central de mentira e o banco falso)', foraDaCasa.length === 0, foraDaCasa.slice(0, 3).join(' '));
await browser.close();
const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} ok · capturas em ${SAIDA}`);
process.exit(falhas ? 1 : 0);
