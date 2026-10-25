// Ferramentas do QA da Agenda na Rodada 7 (C2): sobe o servidor de MENTIRA (scripts/mock-server.mjs) numa porta própria,
// encerra pelo PID guardado, abre navegador headless e dá os atalhos comuns. Nada toca o banco real.
import { spawn } from 'node:child_process';
import { abrirNavegador } from './qa-r6-lib.mjs';
import { conf, fim, dorme, SAIDA } from './qa-r6c-lib.mjs';
export { conf, fim, dorme, SAIDA, abrirNavegador };

export const GAB = '20000000-0000-4000-8000-000000000102', LEO = '20000000-0000-4000-8000-000000000101';
const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Sobe o mock na porta e devolve { base, parar }. */
export function iniciarMock(porta) {
  const srv = spawn(process.execPath, ['scripts/mock-server.mjs'], { cwd: RAIZ, env: { ...process.env, PORT: String(porta) }, stdio: 'ignore' });
  const pid = srv.pid;
  return { base: `http://localhost:${porta}`, parar: () => { try { process.kill(pid); } catch { /* já saiu */ } } };
}

const sp = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
export const hojeIso = () => { const p = sp(); return `${p.year}-${p.month}-${p.day}`; };
export function diaUtil(depoisDe = 1) {
  const d = new Date(hojeIso() + 'T12:00:00Z'); let n = 0;
  while (n < depoisDe) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) n++; }
  return d.toISOString().slice(0, 10);
}
export const horaAgora = (deslocMin = 0) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(Date.now() + deslocMin * 60000));
  return f.replace('24:', '00:');
};

export const api = (page, metodo, rota, corpo) => page.evaluate(async (m, r, c) => {
  const x = await fetch(r, { method: m, headers: { 'Content-Type': 'application/json' }, body: c ? JSON.stringify(c) : undefined });
  return { status: x.status, j: await x.json().catch(() => null) };
}, metodo, rota, corpo);

/** Abre um cenário com a Agenda de mentira. fn(page, extras) */
export async function cenario(base, nome, largura, fn, url = '/?tour=0') {
  const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 950 });
  const erros = [], dialogos = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  try {
    await page.goto(base + url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.nav-item', { timeout: 20000 }); await dorme(700);
    await page.evaluate(() => { try { localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch { /* sem armazenamento */ } window.__abertos = []; window.open = (u, n) => { window.__abertos.push([u, n]); return { focus() {} }; }; });
    await fn(page, { dialogos, erros });
  } catch (e) { conf(false, `${nome}: exceção — ${e.message}`); }
  conf(erros.length === 0, `${nome}: sem erro no console${erros.length ? ' — ' + erros.slice(0, 2).join(' | ') : ''}`);
  await browser.close();
}

export const irQuadro = async (page, dia) => {
  await page.evaluate(() => route('quadro'));
  await page.waitForSelector('#qdCorpo .qd-grade', { timeout: 15000 });
  await page.$eval('#qdData', (e, d) => { e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, dia);
  await page.waitForSelector('.qd-card', { timeout: 15000 });
  await dorme(500);
};
export const card = (nome) => `.qd-card[data-nome="${nome}"]`;
export const abertos = (page) => page.evaluate(() => window.__abertos);
export const textoToast = (page) => page.$eval('#toast', (e) => e.innerText).catch(() => '');
export const acoesToast = (page) => page.$$eval('#toast .toast-acao', (bs) => bs.map((b) => b.textContent.trim())).catch(() => []);
export const clicarToast = (page, rotulo) => page.evaluate((r) => { const b = [...document.querySelectorAll('#toast .toast-acao')].find((x) => x.textContent.trim() === r); if (b) { b.click(); return true; } return false; }, rotulo);
