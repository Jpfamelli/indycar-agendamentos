// Roteiro de navegador da RODADA 13B (22/11/2026): as passagens do Atendimento e do Orçador para os outros apps,
// de ponta a ponta, no servidor de mentira (a mesma Central de mentira do roteiro-r13.mjs). window.open é de mentira:
// anota para onde cada botão mandaria. Nada sai para a rede, nenhuma mensagem é enviada.
//   node scripts/roteiro-r13b.mjs   → provas (ok/FALHOU) e capturas b-* em qa-out/r13/
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


/* ---------------- rodada B: as passagens entre apps, de ponta a ponta ---------------- */
async function entrar(endereco, { offlineMock = false } = {}) {
  const r = await abrir(1440, 900, 'escuro');
  r.page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|supabase-falso\.teste\/realtime/.test(m.text())) r.erros.push('console: ' + m.text().slice(0, 160)); });
  // window.open de mentira: anota para onde cada botão mandaria (nada abre de verdade)
  await r.page.evaluateOnNewDocument(() => { window.__abertos = []; window.open = (u, n) => { window.__abertos.push([String(u), String(n || '')]); return { focus() {}, closed: false }; }; });
  await r.page.goto(`${BASE}/atendimento/${endereco}`, { waitUntil: 'networkidle2' });
  await ate(() => r.page.evaluate(() => !document.getElementById('telaApp').hidden), 12000);
  await espera(1200);
  return r;
}
const naMoldura = async (page, fn, arg) => { const f = await moldura(page); return f ? f.evaluate(fn, arg) : null; };

// 1) links de fora (Casa, CRM, Agenda, Comunicar): ?conversa=, ?tel=, ?aba=orcador com cliente e com orçamento
{
  const { page, erros, ctx } = await entrar('?papel=atendente&saude=ok');
  const camila = await page.evaluate(() => { const c = CONVERSAS.find((x) => /Camila/.test(x.nome || '')); return c ? { id: c.id, tel: c.telefone_e164 || c.telefone } : null; });
  await ctx.close();
  conferir('mock: a conversa da Camila existe', !!camila);

  let r = await entrar(`?papel=atendente&saude=ok&conversa=${camila.id}`);
  conferir('?conversa=<id> abre a conversa certa', await ate(() => r.page.evaluate((id) => conversaAtual?.id === id, camila.id)));
  await r.ctx.close();

  r = await entrar(`?papel=atendente&saude=ok&tel=${String(camila.tel).replace(/\D/g, '')}`);
  conferir('?tel=<telefone> abre a conversa desse telefone', await ate(() => r.page.evaluate((id) => conversaAtual?.id === id, camila.id)));
  await r.ctx.close();

  r = await entrar('?papel=atendente&saude=ok&aba=orcador&tel=12996830111&nome=Camila%20Rodrigues');
  const cot = await ate(() => naMoldura(r.page, () => /^#\/cotacao/.test(location.hash) && [...document.querySelectorAll('input')].some((i) => /Camila/.test(i.value))), 15000);
  const semConversa = await r.page.evaluate(() => !conversaAtual && !document.getElementById('modalNovaBg').classList.contains('aberto'));
  conferir('?aba=orcador&tel=&nome= (Casa → novo orçamento) abre a cotação com o cliente, sem abrir conversa nem "Nova conversa"', cot && semConversa);
  conferir('o endereço fica limpo (o telefone não fica na barra)', await r.page.evaluate(() => !/tel=|aba=/.test(location.search)));
  await foto(r.page, 'b-casa-novo-orcamento-1440-escuro', 1440);
  await r.ctx.close();

  // Agenda → "Novo orçamento": vem com carro, placa e serviço; tudo chega à cotação nova
  r = await entrar('?papel=atendente&saude=ok&aba=orcador&tel=12996830111&nome=Camila%20Rodrigues&carro=Onix%202019&placa=ABC1D23&servico=Troca%20de%20%C3%B3leo');
  const srcAg = new URL(await r.page.evaluate(() => document.getElementById('orcadorMoldura').src));
  const veioTudo = ['tel', 'nome', 'carro', 'placa', 'servico'].every((k) => srcAg.searchParams.get(k)) && !srcAg.searchParams.get('papel');
  const naTela = await ate(() => naMoldura(r.page, () => /Onix/.test(document.body.innerText + [...document.querySelectorAll('input,textarea')].map((i) => i.value).join(' '))), 15000);
  conferir('Agenda → "Novo orçamento" com carro, placa e serviço: a cotação nova abre com o carro', veioTudo && naTela, srcAg.search.slice(0, 200));
  await r.ctx.close();

  r = await entrar('?papel=atendente&saude=ok&aba=orcador#/historico');
  const lista = await ate(() => naMoldura(r.page, () => /^#\/historico/.test(location.hash) && !!document.querySelector('.heroi-dia')), 15000);
  conferir('?aba=orcador#/historico (Casa → orçamentos) abre Orçamentos com o resumo de hoje', lista);
  await r.ctx.close();
}

// 2) de dentro da conversa para os outros apps
{
  const { page, erros, ctx } = await entrar('?papel=atendente&saude=ok');
  await page.evaluate(() => { const c = CONVERSAS.find((x) => /Camila/.test(x.nome || '')); abrirConversa(c.id); });
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.querySelector('#colFicha [data-r6="abrir-lead"]')), 10000);
  await espera(800);

  // Fazer orçamento leva nome, telefone, conversa, cliente, carro e placa
  await page.evaluate(() => document.getElementById('btnFazerOrcamento').click());
  await ate(() => page.evaluate(() => document.getElementById('aba-orcador').classList.contains('ativa')));
  const src = new URL(await page.evaluate(() => document.getElementById('orcadorMoldura').src));
  conferir('"Fazer orçamento" leva o carro e a placa da ficha', /Corolla/.test(src.searchParams.get('carro') || '') && src.searchParams.get('placa') === 'FHR6F16', src.search.slice(0, 160));
  const carroNaCotacao = await ate(() => naMoldura(page, () => /Corolla/.test(document.body.innerText + [...document.querySelectorAll('input')].map((i) => i.value).join(' '))), 15000);
  conferir('a cotação abre com o carro (Corolla)', carroNaCotacao);
  await page.evaluate(() => document.querySelector('.ic-abas .nav-item[data-aba="conversas"]').click());

  // CRM: abre /crm/ NESTE endereço (mesmo login), na aba nomeada do CRM
  await page.evaluate(() => { window.__abertos.length = 0; document.querySelector('#colFicha [data-r6="abrir-lead"]').click(); });
  await espera(400);
  const crm = await page.evaluate(() => window.__abertos[0] || null);
  conferir('ficha → CRM abre /crm/ no mesmo endereço da Central, na aba do CRM', !!crm && crm[0].startsWith(BASE + '/crm/') && crm[1] === 'indycar-crm', JSON.stringify(crm));

  // Agenda: o horário marcado abre na Agenda deste endereço, na aba da Agenda
  await page.evaluate(() => { window.__abertos.length = 0; document.querySelector('#colFicha [data-r6="abrir-ag"]')?.click(); });
  await espera(400);
  const agenda = await page.evaluate(() => window.__abertos[0] || null);
  conferir('ficha → "Abrir na Agenda" abre /agenda/?agendamento= no mesmo endereço, na aba da Agenda', !!agenda && agenda[0].startsWith(BASE + '/agenda/?agendamento=') && agenda[1] === 'indycar-agenda', JSON.stringify(agenda));

  // Criar orçamento (ficha) cai na aba Orçador com a conversa
  await page.evaluate(() => document.querySelector('#colFicha [data-r6="criar-orc"]')?.click());
  const criar = await ate(() => page.evaluate(() => document.getElementById('aba-orcador').classList.contains('ativa') && /conversa=/.test(decodeURIComponent(document.getElementById('orcadorMoldura').src))), 8000);
  conferir('ficha → "Criar orçamento" abre a aba Orçador (sem outra janela) com a conversa', criar);
  await page.evaluate(() => document.querySelector('.ic-abas .nav-item[data-aba="conversas"]').click());

  // Entrada no Pátio: o Pátio mora fora da Central, abre na aba do Pátio já com o cliente
  await page.evaluate(() => { window.__abertos.length = 0; document.querySelector('[data-r7="entrada"]')?.click(); });
  await ate(() => page.evaluate(() => window.__abertos.length > 0), 5000);
  const patio = await page.evaluate(() => window.__abertos[0] || null);
  conferir('"Entrada no Pátio" abre o Pátio na aba dele, já com o cliente', !!patio && /indycar-patio/.test(patio[1]) && /tel=|cliente=|placa=/.test(patio[0]), JSON.stringify(patio).slice(0, 160));

  // rodada 13C: links da ficha (Agenda, CRM, Comunicar) no endereço desta Central, com a barra ("/agenda/?tel="), na aba de cada app
  const fl = await page.evaluate(() => [...document.querySelectorAll('#colFicha .ficha-links a, #colFicha a.ficha-link[target="indycar-comunicar"]')].map((a) => [a.textContent.trim(), a.getAttribute('href'), a.target]));
  const daFicha = (re) => fl.find(([t]) => re.test(t));
  const ok13c = [[/Agenda/, '/agenda/?tel=', 'indycar-agenda'], [/CRM/, '/crm/?tel=', 'indycar-crm'], [/^📣 Comunicar/, '/comunicar/?tel=', 'indycar-comunicar']]
    .every(([re, caminho, aba]) => { const l = daFicha(re); return l && l[1].startsWith(BASE + caminho) && l[2] === aba; });
  conferir('ficha → Agenda / CRM / Comunicar: "/<app>/?tel=" nesta Central (nada do Render antigo), na aba de cada app', ok13c && !fl.some(([, h]) => /onrender\.com|netlify/.test(h)), JSON.stringify(fl).slice(0, 400));
  const abrirCom = daFicha(/Abrir no Comunicar/);
  if (abrirCom) conferir('"Abrir no Comunicar" (mensagens automáticas) usa o Comunicar desta Central', abrirCom[1].startsWith(BASE + '/comunicar/') && abrirCom[2] === 'indycar-comunicar', JSON.stringify(abrirCom));

  // Agendar: a janela já vem com o carro e a placa
  await page.evaluate(() => document.getElementById('btnAgendar').click());
  await ate(() => page.evaluate(() => document.getElementById('modalAgendarBg').classList.contains('aberto')));
  const ag = await page.evaluate(() => ({ carro: document.querySelector('#formAgendar [name="veiculo"]').value, placa: document.querySelector('#formAgendar [name="placa"]').value }));
  conferir('Agendar abre com o carro e a placa do cliente', /Corolla/.test(ag.carro) && /FHR/.test(ag.placa), JSON.stringify(ag));
  conferir('passagens sem erro de console', erros.length === 0, erros.slice(0, 2).join(' | '));
  const envios = await (await fetch(`http://127.0.0.1:${PORTA_MOCK}/atendimento/api/_envios`)).json().catch(() => ({ envios: ['?'] }));
  conferir('nenhuma mensagem saiu', Array.isArray(envios.envios) && envios.envios.length === 0);
  await ctx.close();
}

// 3) rede caindo: o resumo de hoje não vira "tudo em dia", diz de quando são os números
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { page, ctx } = await abrir(w, h, 'escuro');
  await page.goto(`${BASE}/atendimento/?papel=atendente&saude=ok`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => !!document.querySelector('.hoje-frase em')), 12000);
  const antes = await page.evaluate((larg) => document.querySelector(larg < 900 ? '#hojeMini .hoje-frase' : '#hojePainel .hoje-frase').textContent, w);
  await page.evaluate(() => { const orig = window.fetch; window.fetch = (u, o) => (String(u).includes('_mock') ? Promise.reject(new TypeError('Failed to fetch')) : orig(u, o)); });
  await page.evaluate(() => HojeTela.contar());
  await espera(600);
  const depois = await page.evaluate((larg) => { const el = document.getElementById(larg < 900 ? 'hojeMini' : 'hojePainel'); return { frase: el.querySelector('.hoje-frase').textContent, aviso: el.querySelector('.hoje-aviso')?.textContent || '' }; }, w);
  conferir(`[${w}] rede caindo: os números ficam e o aviso diz de quando são`, depois.frase === antes && /Sem resposta do banco/.test(depois.aviso) && !/tudo em dia/.test(depois.frase), depois.aviso);
  await foto(page, `b-sem-rede-${w}-escuro`, w);
  await ctx.close();
}

conferir('nada saiu para a rede (só a Central de mentira e o banco falso)', foraDaCasa.length === 0, foraDaCasa.slice(0, 3).join(' '));
await browser.close();
const { writeFileSync } = await import('node:fs');
writeFileSync(join(SAIDA, 'b-passagens.txt'), resultados.map((r) => `${r.ok ? 'ok' : 'FALHOU'} ${r.nome}`).join('\n') + '\n');
const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} ok · capturas em ${SAIDA}`);
process.exit(falhas ? 1 : 0);
