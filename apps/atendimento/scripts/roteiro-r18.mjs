// Roteiro de navegador da RODADA 18 (25/11/2026), no servidor de MENTIRA (nada sai para a rede, nenhum WhatsApp).
//  1) WhatsApp parado (o estado real de 25/11: silêncio desde 24/11 08:24, nenhum erro gravado; e a chave recusada):
//     uma faixa só, desde quando e o que fazer; Enviar não finge que mandou.
//  2) Fila "Aguardando consultor": mais antigo primeiro; encerrar as paradas há mais de N dias com contagem,
//     confirmação e desfazer.
//
//   node scripts/roteiro-r18.mjs                      -> provas + capturas em qa-out/r18 (1440 e 375, escuro e claro)
//   node scripts/roteiro-r18.mjs --raiz <pasta> --prefixo antes   -> só capturas, com o app de outra pasta (o "antes")
//   node scripts/roteiro-r18.mjs --sw                 -> também o service worker REAL em 2 visitas
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = resolve(AQUI, '..');
const MONO = resolve(APP, '..', '..');
const puppeteer = require(resolve(MONO, '../indycar-ferramentas/node_modules/puppeteer-core'));
const SAIDA = join(APP, 'qa-out', 'r18');
mkdirSync(SAIDA, { recursive: true });
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const PFX = arg('--prefixo') || 'depois';
const RAIZ = arg('--raiz') ? resolve(arg('--raiz')) : APP;
const PROVAS = PFX !== 'antes';
const PORTA = 3318;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const filho = spawn(process.execPath, [join(RAIZ, 'scripts', 'mock-server.mjs')], { env: { ...process.env, PORT: String(PORTA), MOCK_PARADAS: '40', ...(process.argv.includes('--sw') ? { SW_REAL: '1' } : {}) }, stdio: 'ignore' });
process.on('exit', () => { try { filho.kill(); } catch { /* já foi */ } });
for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORTA}/__qa/mock`); if (r.ok) break; } catch { /* subindo */ } await espera(250); }
const BASE = `http://localhost:${PORTA}`;

const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok     ' : 'FALHOU '} ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
async function ate(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* ainda não */ } await espera(120); } return false; }

async function abrir(w, h, tema) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|realtime/.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
  await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); } catch {} }, tema);
  return { page, erros, ctx };
}
async function entrar(page, q) {
  await page.goto(`${BASE}/?${q}`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
}
/* o que está À VISTA no topo (estilo calculado, não a propriedade hidden) */
const topo = (page) => page.evaluate(() => {
  const vis = (id) => { const el = document.getElementById(id); if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0; };
  const faixa = document.getElementById('faixaSaude');
  const pequenos = [];
  for (const el of document.querySelectorAll('#faixaSaude button, #r18Lote button, #r18Lote select')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.display === 'none' || el.closest('[hidden]')) continue;
    if (r.height < 43.5 || r.width < 43.5) pequenos.push(`${el.id || el.textContent.trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const doc = document.scrollingElement || document.documentElement;
  return { faixa: vis('faixaSaude'), tarja: vis('tarjaConexao'), r6zap: vis('r6Zap'), fechar: vis('faixaFechar'), btn: vis('faixaBtn'),
    texto: faixa?.innerText.replace(/\s+/g, ' ').trim() || '', enviar: document.getElementById('btnEnviar')?.textContent.trim(),
    lateral: doc.scrollWidth - doc.clientWidth, pequenos, alturaFaixa: Math.round(faixa?.getBoundingClientRect().height || 0) };
});

for (const [w, h] of [[1440, 900], [375, 812]]) for (const tema of ['escuro', 'claro']) {
  const tag = `${w}-${tema}`;
  const cel = w < 700;
  const { page, erros, ctx } = await abrir(w, h, tema);

  /* ---- 1a) o estado real de 25/11: nenhum erro gravado, só silêncio ---- */
  await entrar(page, 'papel=atendente&saude=ok&zap=silencio');
  await ate(() => page.evaluate(() => !document.getElementById('faixaSaude').hidden), PROVAS ? 6000 : 3500);
  await espera(400);
  let t = await topo(page);
  await page.screenshot({ path: join(SAIDA, `${PFX}-zap-silencio-${tag}.png`) });
  if (PROVAS) {
    conferir(`[${tag}] silêncio: a faixa diz desde quando`, t.faixa && /WhatsApp parado desde \w{3} \d\d\/\d\d às \d\d:\d\d/.test(t.texto), t.texto.slice(0, 90));
    conferir(`[${tag}] silêncio: diz o que fazer (peça ao João, Ajustes › WhatsApp e chaves)`, /Peça ao João para colar a chave em Ajustes › WhatsApp e chaves/.test(t.texto));
    conferir(`[${tag}] silêncio: uma faixa só, sem fechar`, t.faixa && !t.tarja && !t.r6zap && !t.fechar, JSON.stringify({ tarja: t.tarja, r6zap: t.r6zap, fechar: t.fechar }));
    if (cel) conferir(`[${tag}] celular: faixa curta (${t.alturaFaixa}px), sem rolagem lateral`, t.alturaFaixa <= 90 && t.lateral <= 0);
  }
  // abre uma conversa: no silêncio o botão continua "Enviar" (pode sair), e a faixa continua (no celular também, com o chat aberto)
  await page.evaluate(() => [...document.querySelectorAll('#listaConversas .conversa')].find((c) => c.textContent.includes('Camila'))?.click());
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden));
  await espera(900);
  t = await topo(page);
  await page.screenshot({ path: join(SAIDA, `${PFX}-zap-silencio-chat-${tag}.png`) });
  if (PROVAS) conferir(`[${tag}] silêncio com o chat aberto: faixa à vista, só ela`, t.faixa && !t.r6zap && !t.tarja);

  /* ---- 1b) chave recusada (confirmado): nada sai, o botão diz "Salvar" e a mensagem fica como não saiu ---- */
  await entrar(page, 'papel=atendente&zap=chave');
  await ate(() => page.evaluate(() => /recusou a chave/.test(document.getElementById('faixaSaude').innerText)), 6000);
  await page.evaluate(() => [...document.querySelectorAll('#listaConversas .conversa')].find((c) => c.textContent.includes('Renata'))?.click());
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden));
  await espera(1200);
  t = await topo(page);
  if (PROVAS) {
    // no celular a faixa fica curta (desde quando + o que fazer); o "nada sai" é o próprio botão Salvar
    conferir(`[${tag}] chave recusada: faixa diz ${cel ? 'desde quando' : '"nada sai e nada chega"'} e quem resolve`, (cel ? /WhatsApp parado desde/ : /nada sai e nada chega/).test(t.texto) && /Peça ao João/.test(t.texto), t.texto.slice(0, 120));
    conferir(`[${tag}] chave recusada: o botão é "Salvar", não "Enviar"`, t.enviar === 'Salvar', t.enviar);
    conferir(`[${tag}] chave recusada: uma faixa só`, t.faixa && !t.tarja && !t.r6zap);
    await page.evaluate(() => { const c = document.getElementById('campoMensagem'); c.value = 'Oi Renata, já te respondo'; c.dispatchEvent(new Event('input')); });
    await page.click('#btnEnviar');
    await espera(1200);
    const env = await page.evaluate(() => ({ toast: document.getElementById('toast').textContent, ultima: [...document.querySelectorAll('#mensagens .msg')].pop()?.innerText || '' }));
    conferir(`[${tag}] Salvar não finge que mandou: aviso "não saiu" e a mensagem marcada`, /não saiu/i.test(env.toast) && /não saiu|tentar de novo/i.test(env.ultima), `${env.toast.slice(0, 80)} | ${env.ultima.replace(/\s+/g, ' ').slice(-60)}`);
  }
  await page.screenshot({ path: join(SAIDA, `${PFX}-zap-chave-${tag}.png`) });

  /* ---- 1c) administrador: botão direto para a chave ---- */
  if (PROVAS) {
    await entrar(page, 'papel=admin&zap=chave');
    await ate(() => page.evaluate(() => !document.getElementById('faixaBtn').hidden), 6000);
    t = await topo(page);
    conferir(`[${tag}] admin: ação direta e botão "Abrir WhatsApp e chaves"`, /Cole a chave nova do CodeWords em Ajustes › WhatsApp e chaves/.test(t.texto) && t.btn, t.texto.slice(-80));
    await page.click('#faixaBtn'); await espera(700);
    const foi = await page.evaluate(() => document.getElementById('aba-integracoes').classList.contains('ativa') && !!document.getElementById('chaveBox')?.getBoundingClientRect().height);
    conferir(`[${tag}] admin: o botão abre WhatsApp e chaves com a caixa da chave`, foi);
    await page.screenshot({ path: join(SAIDA, `${PFX}-zap-admin-chave-${tag}.png`) });
    // WhatsApp funcionando: nenhuma faixa
    await entrar(page, 'papel=atendente&saude=ok&zap=ok');
    await espera(2500);
    t = await topo(page);
    conferir(`[${tag}] WhatsApp funcionando: nenhuma faixa`, !t.faixa && !t.tarja, t.texto.slice(0, 60));
  }

  /* ---- 2) fila do consultor: mais antigo primeiro e encerrar as paradas ---- */
  await entrar(page, 'papel=atendente&saude=ok&zap=ok');
  if (cel) await page.evaluate(() => document.querySelector('.filtros-status')?.scrollIntoView());
  await page.click('[data-status="aguardando"]');
  await ate(() => page.evaluate(() => /Parado/.test(document.querySelector('#listaConversas .conversa')?.textContent || '')), 6000);
  await ate(() => page.evaluate(() => /esperam o consultor/.test(document.getElementById('r18LoteTexto')?.textContent || '')), 6000);
  await espera(300);
  await page.evaluate(() => document.getElementById('r18Lote')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: join(SAIDA, `${PFX}-fila-consultor-${tag}.png`) });
  if (PROVAS) {
    const fila = await page.evaluate(() => ({ nomes: [...document.querySelectorAll('#listaConversas .conversa .conversa-nome')].map((n) => n.textContent.trim()),
      txt: document.getElementById('r18LoteTexto').textContent, btn: document.getElementById('r18Encerrar').textContent }));
    conferir(`[${tag}] fila: quem espera há mais tempo vem primeiro`, /Parado 40/.test(fila.nomes[0]) && /Parado 39/.test(fila.nomes[1]), fila.nomes.slice(0, 3).join(', '));
    conferir(`[${tag}] lote: conta antes ("N conversas esperam... há mais de 30 dias (a mais antiga desde ...)")`, /^\d+ conversas esperam o consultor há mais de 30 dias \(a mais antiga desde \d\d\/\d\d\)\.$/.test(fila.txt), fila.txt);
    const n30 = Number((fila.txt.match(/^\d+/) || [0])[0]);
    conferir(`[${tag}] lote: o botão mostra o número`, fila.btn === `Encerrar ${n30}`, fila.btn);
    // muda para 90 dias: conta de novo
    await page.select('#r18Dias', '90');
    await ate(() => page.evaluate(() => /há mais de 90 dias/.test(document.getElementById('r18LoteTexto').textContent)));
    const n90 = await page.evaluate(() => Number((document.getElementById('r18LoteTexto').textContent.match(/^\d+/) || [0])[0]));
    conferir(`[${tag}] lote: 90 dias conta menos que 30 (${n90} < ${n30})`, n90 > 0 && n90 < n30);
    // confirmar
    await page.click('#r18Encerrar');
    await ate(() => page.evaluate(() => document.getElementById('modalConfirmar')?.classList.contains('aberto') || !!document.querySelector('.modal-bg.aberto #btnConfirmarOk')), 4000);
    const modal = await page.evaluate(() => ({ titulo: document.getElementById('confirmarTitulo').textContent, texto: document.getElementById('confirmarTexto').textContent, ok: document.getElementById('btnConfirmarOk').textContent }));
    await espera(450);   // a janela entra com animação
    await page.screenshot({ path: join(SAIDA, `${PFX}-lote-confirmar-${tag}.png`) });
    conferir(`[${tag}] confirmar: mostra quantas e que nada é apagado`, modal.titulo.includes(String(n90)) && /Nenhuma mensagem é apagada/.test(modal.texto) && modal.ok === `Encerrar ${n90}`, modal.titulo);
    const antes = await page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length);
    await page.click('#btnConfirmarOk');
    await ate(() => page.evaluate(() => !document.getElementById('r18Feito').hidden), 6000);
    await espera(600);
    const feito = await page.evaluate(() => ({ feito: document.getElementById('r18Feito').innerText.replace(/\s+/g, ' '), n: document.querySelectorAll('#listaConversas .conversa').length, txt: document.getElementById('r18LoteTexto').textContent }));
    await page.evaluate(() => document.getElementById('r18Lote')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: join(SAIDA, `${PFX}-lote-feito-${tag}.png`) });
    conferir(`[${tag}] encerrou: saem da fila e aparece "por você" com Desfazer`, feito.n === antes - n90 && new RegExp(`✓ ${n90} conversas encerradas por você às \\d\\d:\\d\\d`).test(feito.feito) && /desfazer/i.test(feito.feito), `${antes}→${feito.n} | ${feito.feito}`);
    conferir(`[${tag}] depois de encerrar a contagem zera`, /^Nenhuma conversa espera/.test(feito.txt), feito.txt);
    const aud = await (await fetch(`${BASE}/__qa/mock`)).json().catch(() => ({}));
    void aud;
    // desfazer
    await page.click('[data-r18="desfazer"]');
    await ate(() => page.evaluate(() => document.getElementById('r18Feito').hidden), 6000);
    await espera(600);
    const volta = await page.evaluate(() => ({ n: document.querySelectorAll('#listaConversas .conversa').length, toast: document.getElementById('toast').textContent }));
    conferir(`[${tag}] desfazer: todas voltam para a fila`, volta.n === antes && new RegExp(`${n90} conversas voltaram`).test(volta.toast), `${volta.n} | ${volta.toast}`);
    await page.select('#r18Dias', '30');
    if (cel) {
      t = await topo(page);
      conferir(`[${tag}] celular: barra do lote sem rolagem lateral e todo toque com 44 px`, t.lateral <= 0 && t.pequenos.length === 0, t.pequenos.join(', '));
    }
  }
  if (PROVAS) conferir(`[${tag}] zero erro de console`, erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

/* quem não pode encerrar em lote (a Agenda não abre o Atendimento; o gestor pode) */
if (PROVAS) {
  const { page, ctx } = await abrir(1440, 900, 'escuro');
  await entrar(page, 'papel=gestor&saude=ok&zap=ok');
  await page.click('[data-status="aguardando"]');
  const vis = await ate(() => page.evaluate(() => !document.getElementById('r18Lote').hidden), 5000);
  conferir('[gestor] vê o encerrar em lote', vis);
  await page.click('[data-status=""]'); await espera(500);
  conferir('[gestor] fora da fila do consultor a barra some', await page.evaluate(() => document.getElementById('r18Lote').hidden));
  await ctx.close();
}

if (process.argv.includes('--sw')) {
  const { page, erros, ctx } = await abrir(375, 812, 'escuro');
  for (const visita of [1, 2]) {
    await page.goto(`${BASE}/?papel=atendente&saude=ok&zap=silencio`, { waitUntil: 'networkidle2' });
    const sw = await page.evaluate(async () => { try { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((_, x) => setTimeout(() => x('sem sw'), 6000))]); await new Promise((ok) => setTimeout(ok, 1500)); return { ativo: !!r.active, cache: (await caches.keys()).join(',') }; } catch (e) { return { ativo: false, erro: String(e) }; } });
    conferir(`[sw] visita ${visita}: service worker ativo (${sw.cache || sw.erro})`, sw.ativo && /v31/.test(sw.cache || ''));
    const ok = await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0 && [...document.styleSheets].some((s) => /r18\.css/.test(s.href || '')) && !document.getElementById('faixaSaude').hidden), 12000);
    conferir(`[sw] visita ${visita}: lista, r18.css e a faixa do WhatsApp parado`, ok);
  }
  conferir('[sw] zero erro de console nas 2 visitas', erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} ok · capturas em ${SAIDA}`);
await browser.close(); process.exit(falhas ? 1 : 0);
