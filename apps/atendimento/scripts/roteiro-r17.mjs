// Roteiro de navegador da RODADA 17 (25/11/2026): o dia real da recepção, ponta a ponta, no servidor de MENTIRA.
// Chega mensagem -> abre a conversa -> responde -> Agendar -> escolhe o horário -> confirma -> manda a confirmação.
// Conta toques e tempo de cada passo (para o relato antes/depois). Nada sai para a rede, nenhuma mensagem é enviada
// de verdade (o mock responde ao envio).
//
//   node scripts/roteiro-r17.mjs                 -> fluxo medido em 1440 e 375 (escuro), provas da R17 e capturas
//   node scripts/roteiro-r17.mjs --prefixo antes -> só mede e captura (sem as provas novas), para o "antes"
//   node scripts/roteiro-r17.mjs --sw            -> também confere o service worker REAL em 2 visitas
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
const SAIDA = join(APP, 'qa-out', 'r17');
mkdirSync(SAIDA, { recursive: true });
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const PFX = arg('--prefixo') || 'depois';
const PROVAS = PFX !== 'antes';
const PORTA = 3309;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const filho = spawn(process.execPath, [join(APP, 'scripts', 'mock-server.mjs')], { env: { ...process.env, PORT: String(PORTA), ...(process.argv.includes('--sw') ? { SW_REAL: '1' } : {}) }, stdio: 'ignore' });
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

async function medir(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement;
    const pequenos = [];
    for (const el of document.querySelectorAll('.modal-bg.aberto button, .modal-bg.aberto input, .modal-bg.aberto select, .modal-bg.aberto textarea')) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden]')) continue;
      if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) continue;
      if (r.height < 43.5 || r.width < 43.5) pequenos.push(`${el.id || el.name || String(el.className).split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { lateral: doc.scrollWidth - doc.clientWidth, pequenos };
  });
}

/* O fluxo: cada "toque" é um clique de gente (o que o funcionário faz com o dedo). */
async function fluxo(page, tag, conversa = 'Camila') {
  const t0 = Date.now(); let toques = 0;
  const tocar = async (sel) => { toques++; await page.click(sel); };
  await page.goto(`${BASE}/?papel=atendente&saude=ok&envio=ok`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
  const tLista = Date.now() - t0;
  // 1) abre a conversa da cliente (a que chegou)
  const idx = await page.evaluate((n) => [...document.querySelectorAll('#listaConversas .conversa')].findIndex((c) => c.textContent.includes(n)), conversa);
  toques++; await page.evaluate((i) => document.querySelectorAll('#listaConversas .conversa')[i].click(), idx);
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && !!document.getElementById('chatNome').textContent.trim()));
  await espera(700);
  // 2) Agendar
  await tocar('#btnAgendar');
  await ate(() => page.evaluate(() => document.getElementById('modalAgendarBg').classList.contains('aberto')));
  await ate(() => page.evaluate(() => document.querySelectorAll('#agendarHorariosLista [data-data]').length > 0), 5000);
  await espera(400);
  const form = await page.evaluate(() => {
    const f = document.getElementById('formAgendar');
    return { servico: f.servico_id.value ? f.servico_id.selectedOptions[0].textContent : '', consultor: f.consultor_id.value, valor: f.valor.value, carro: f.veiculo.value, placa: f.placa.value,
      origem: f.origem.value, horarios: document.querySelectorAll('#agendarHorariosLista [data-data]').length, data: f.data.value, hora: f.hora.value };
  });
  await page.screenshot({ path: join(SAIDA, `${PFX}-agendar-${tag}.png`) });
  const m = await medir(page);
  // 3) o serviço: se não veio escolhido, a pessoa escolhe (1 toque para abrir + 1 para escolher)
  if (!form.servico) { toques += 2; await page.select('#agendarServico', 's1'); await espera(600); }
  // 4) o horário: um toque no primeiro horário livre
  await tocar('#agendarHorariosLista [data-data]');
  await espera(200);
  const rolar = await page.evaluate(() => { const b = document.querySelector('#formAgendar button[type=submit]').getBoundingClientRect(); const m = document.querySelector('#modalAgendarBg .modal').getBoundingClientRect(); return Math.max(0, Math.round(b.bottom - Math.min(m.bottom, innerHeight))); });
  // 5) confirmar (no celular o botão fica lá embaixo: rolar não conta como toque)
  await page.evaluate(() => document.querySelector('#formAgendar button[type=submit]').scrollIntoView());
  await tocar('#formAgendar button[type=submit]');
  // encaixe? (só se o horário não estiver livre)
  await espera(500);
  if (await page.evaluate(() => /encaixe/i.test(document.body.innerText) && !!document.querySelector('.acesso-perguntar button, [data-acesso-ok]'))) toques++;
  await ate(() => page.evaluate(() => !document.getElementById('modalAgendarBg').classList.contains('aberto')), 6000);
  await espera(600);
  const depois = await page.evaluate(() => ({ campo: document.getElementById('campoMensagem').value, toast: document.getElementById('toast').textContent }));
  // 6) mandar a confirmação pronta
  if (depois.campo) await tocar('#btnEnviar');
  await espera(800);
  const tempo = Date.now() - t0;
  await page.screenshot({ path: join(SAIDA, `${PFX}-agendado-${tag}.png`) });
  const banco = await (await fetch(`${BASE}/__qa/mock`)).json().catch(() => ({}));
  return { tLista, toques, tempo, form, depois, m, banco, rolar };
}

for (const [w, h] of [[1440, 900], [375, 812]]) for (const tema of ['escuro', 'claro']) {
  const tag = `${w}-${tema}`;
  // um mock novo a cada rodada seria o ideal; o fluxo usa a mesma Camila, então os leads se acumulam: só medimos o 1º
  const { page, erros, ctx } = await abrir(w, h, tema);
  const r = await fluxo(page, tag);
  console.log(tag, JSON.stringify({ lista_ms: r.tLista, toques: r.toques, tempo_ms: r.tempo, rolar_px: r.rolar, form: r.form, campo: r.depois.campo.slice(0, 90), toast: r.depois.toast }));
  if (PROVAS) {
    conferir(`[${tag}] o serviço que a cliente pediu já vem escolhido`, !!r.form.servico, r.form.servico);
    conferir(`[${tag}] depois de escolher o horário, Confirmar está à vista sem rolar (${r.rolar}px)`, r.rolar === 0);
    conferir(`[${tag}] aviso diz quando ficou e o próximo passo, sem 'lead'`, /Agendado para .+ às \d\d:\d\d\. A confirmação está no campo/.test(r.depois.toast) && !/lead/i.test(r.depois.toast), r.depois.toast);
    conferir(`[${tag}] confirmação com o dia por extenso e 'às' na hora`, /(-feira|sábado), \d\d\/\d\d, às \d\d:\d\d/.test(r.depois.campo), r.depois.campo.slice(0, 80));
    conferir(`[${tag}] a confirmação não sai com variável crua ({placa}, {carro})`, !/\{[a-z_]+\}/.test(r.depois.campo), r.depois.campo.slice(0, 120));
    if (w < 700) conferir(`[${tag}] Agendar no celular: sem rolagem lateral e todo toque com 44 px`, r.m.lateral <= 0 && r.m.pequenos.length === 0, r.m.pequenos.slice(0, 6).join(', '));
    conferir(`[${tag}] zero erro de console`, erros.length === 0, erros.slice(0, 2).join(' | '));
  }
  await ctx.close();
}

/* Erros de verdade: a Agenda falha depois do lead gravar; {variável} sem trocar no campo. */
if (PROVAS) {
  const { page, erros, ctx } = await abrir(375, 812, 'escuro');
  await page.goto(`${BASE}/?papel=atendente&saude=ok&envio=ok`, { waitUntil: 'networkidle2' });
  await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0), 12000);
  await page.evaluate(() => [...document.querySelectorAll('#listaConversas .conversa')].find((c) => c.textContent.includes('Renata')).click());
  await ate(() => page.evaluate(() => !document.getElementById('chat').hidden && /Renata/.test(document.getElementById('chatNome').textContent)));
  await espera(700);
  // o dublê do banco: conta os leads gravados e faz a 1ª gravação na Agenda falhar
  await page.evaluate(() => {
    window.__r17 = { leads: 0, falhou: false };
    const orig = sb.from.bind(sb);
    sb.from = (t) => { const q = orig(t);
      if (t === 'leads') { const ins = q.insert.bind(q); q.insert = (c) => { window.__r17.leads++; return ins(c); }; }
      if (t === 'agendamentos' && !window.__r17.falhou) { q.insert = () => { window.__r17.falhou = true; return Promise.resolve({ error: { message: 'timeout' } }); }; }
      return q; };
  });
  await page.click('#btnAgendar');
  await ate(() => page.evaluate(() => document.getElementById('modalAgendarBg').classList.contains('aberto')));
  await ate(() => page.evaluate(() => document.querySelectorAll('#agendarHorariosLista [data-data]').length > 0), 5000);
  await espera(400);
  await page.evaluate(() => { const s = document.getElementById('agendarServico'); if (!s.value) { s.value = 's2'; s.dispatchEvent(new Event('change')); } });
  await page.click('#agendarHorariosLista [data-data]');
  await page.click('#formAgendar button[type=submit]');
  await ate(() => page.evaluate(() => window.__r17.falhou), 5000); await espera(600);
  const t1 = await page.evaluate(() => ({ toast: document.getElementById('toast').textContent, aberto: document.getElementById('modalAgendarBg').classList.contains('aberto') }));
  await page.screenshot({ path: join(SAIDA, 'depois-agenda-falhou-375.png') });
  conferir('[erro] Agenda falhou: diz o que fazer e a janela continua aberta', /Toque em Confirmar de novo/.test(t1.toast) && t1.aberto, t1.toast);
  await page.click('#formAgendar button[type=submit]');
  await ate(() => page.evaluate(() => !document.getElementById('modalAgendarBg').classList.contains('aberto')), 6000); await espera(500);
  const t2 = await page.evaluate(() => ({ leads: window.__r17.leads, toast: document.getElementById('toast').textContent, campo: document.getElementById('campoMensagem').value }));
  conferir(`[erro] 2º toque agenda sem duplicar o cliente no CRM (${t2.leads} lead gravado)`, t2.leads === 1 && /Agendado para/.test(t2.toast), JSON.stringify(t2).slice(0, 160));
  // {variável} sem trocar: avisa e não manda; o 2º toque manda assim mesmo
  await page.evaluate(() => { const c = document.getElementById('campoMensagem'); c.value = 'Oi Renata, seu {servico} fica pronto hoje'; c.dispatchEvent(new Event('input')); });
  const antesEnvio = await page.evaluate(() => document.querySelectorAll('#mensagens .msg, #mensagens [data-id]').length);
  await page.click('#btnEnviar'); await espera(500);
  const g1 = await page.evaluate(() => ({ campo: document.getElementById('campoMensagem').value, toast: document.getElementById('toast').textContent }));
  await page.screenshot({ path: join(SAIDA, 'depois-variavel-crua-375.png') });
  conferir('[envio] {servico} sem trocar: avisa e o texto fica no campo', /\{servico\} sem preencher/.test(g1.toast) && /\{servico\}/.test(g1.campo), g1.toast);
  await page.click('#btnEnviar'); await espera(800);
  const g2 = await page.evaluate(() => ({ campo: document.getElementById('campoMensagem').value, n: document.querySelectorAll('#mensagens .msg, #mensagens [data-id]').length }));
  conferir('[envio] 2º toque em Enviar manda assim mesmo (sem beco sem saída)', g2.campo === '' && g2.n > antesEnvio, JSON.stringify(g2));
  conferir('[erro] zero erro de console', erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

if (process.argv.includes('--sw')) {
  const { page, erros, ctx } = await abrir(375, 812, 'escuro');
  for (const visita of [1, 2]) {
    await page.goto(`${BASE}/?papel=atendente&saude=ok`, { waitUntil: 'networkidle2' });
    const sw = await page.evaluate(async () => { try { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((_, x) => setTimeout(() => x('sem sw'), 6000))]); await new Promise((ok) => setTimeout(ok, 1500)); return { ativo: !!r.active, cache: (await caches.keys()).join(',') }; } catch (e) { return { ativo: false, erro: String(e) }; } });
    conferir(`[sw] visita ${visita}: service worker ativo (${sw.cache || sw.erro})`, sw.ativo && /v(29|[3-9][0-9])/.test(sw.cache || ''));
    const ok = await ate(() => page.evaluate(() => document.querySelectorAll('#listaConversas .conversa').length > 0 && [...document.styleSheets].some((s) => /r17\.css/.test(s.href || ''))), 12000);
    conferir(`[sw] visita ${visita}: lista carregada e r17.css presente`, ok);
  }
  conferir('[sw] zero erro de console nas 2 visitas', erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} ok · capturas em ${SAIDA}`);
await browser.close(); process.exit(falhas ? 1 : 0);
