#!/usr/bin/env node
// Rodada 7 (C3) — roteiro de navegador (só no PC: Chrome instalado + puppeteer-core).
// Sobe o servidor FALSO (dados inventados) solto e montado em /crm/ e confere, em 1440 e 375 px,
// como gestor e atendente: sinais ao vivo no funil, filtro por sinal, registrar contato,
// histórico na ficha, aba Hoje (fila + script sem preço), aba Dono, retorno por campanha,
// 403 para atendente, tema claro, zero rolagem lateral e zero erro de console.
//   node testes/r7-navegador.mjs            → capturas em %TEMP%/r7-navegador (ou RELATORIO_DIR)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAIDA = process.env.RELATORIO_DIR || join(process.env.TEMP || RAIZ, 'r7-navegador');
mkdirSync(SAIDA, { recursive: true });
const requerer = createRequire(import.meta.url);
let puppeteer;
for (const base of [null, join(RAIZ, '..', '..', '..', 'indycar-ferramentas'), join(RAIZ, '..', 'indycar-ferramentas'), process.env.FERRAMENTAS].filter((x, i) => i === 0 || x)) {
  try { puppeteer = base === null ? requerer('puppeteer-core') : createRequire(join(base, 'package.json'))('puppeteer-core'); break; } catch { /* tenta o próximo */ }
}
if (!puppeteer) throw new Error('puppeteer-core não encontrado (rode npm i em indycar-ferramentas ou defina FERRAMENTAS).');

const portaLivre = p => new Promise(ok => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(p, '127.0.0.1'); });
async function subirMock(env = {}) {
  let porta = 3341; while (!(await portaLivre(porta))) porta++;
  const filho = spawn(process.execPath, ['scripts/mock-server.mjs'], { cwd: RAIZ, env: { ...process.env, PORT: String(porta), MOCK_LEADS: '160', MOCK_PAPEL: 'gestor', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; filho.stdout.on('data', d => { log += d; }); filho.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${porta}${env.MOCK_PREFIXO || ''}`;
  for (let i = 0; i < 60; i++) {
    if (filho.exitCode !== null) throw new Error('mock saiu: ' + log.slice(-300));
    try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) }); if (r.ok) return { filho, base }; } catch { /* subindo */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('mock não subiu: ' + log.slice(-300));
}

const resultados = [];
let falhas = 0;
function ok(nome, cond, detalhe = '') { resultados.push({ nome, ok: !!cond, detalhe }); if (!cond) falhas++; console.log(`${cond ? '✔' : '✖'} ${nome}${detalhe ? ' — ' + detalhe : ''}`); }
const dorme = ms => new Promise(r => setTimeout(r, ms));

async function roteiro(browser, base, { largura, altura, movel, papel, prefixo }) {
  const tag = `${prefixo ? 'crm-' : ''}${papel}-${largura}`;
  const gestor = papel === 'gestor' || papel === 'admin';
  const page = await browser.newPage();
  await page.setViewport({ width: largura, height: altura, isMobile: !!movel, hasTouch: !!movel, deviceScaleFactor: 1 });
  const erros = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${base}/?papel=${papel}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#kpis .kpi', { timeout: 30000 });
  await dorme(800);
  const semRolagem = async rotulo => ok(`${tag}: sem rolagem lateral (${rotulo})`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.evaluate(() => { window.__abertas = []; window.open = (u, nome) => { window.__abertas.push([u, nome]); return { focus() {} }; }; window.__copiado = ''; try { navigator.clipboard.writeText = async t => { window.__copiado = t; }; } catch (e) {} });

  /* ---- funil: faixa e diálogo de movimentos ---- */
  await page.evaluate(() => irPara('pipeline'));
  await page.waitForFunction(() => document.querySelectorAll('#kanban .r6-chip').length > 0, { timeout: 15000 });
  await dorme(1500);
  const faixa = await page.evaluate(() => { const f = document.getElementById('r7Mov'); return f ? { hidden: f.hidden, txt: f.textContent.trim().slice(0, 120) } : null; });
  ok(`${tag}: faixa do funil existe e fala dos movimentos`, faixa && !faixa.hidden && /funil achou|revisar/i.test(faixa.txt), JSON.stringify(faixa));
  await semRolagem('funil com a faixa');
  await page.screenshot({ path: join(SAIDA, `${tag}-funil.png`) });
  if (faixa && !faixa.hidden) {
    await page.click('#r7Mov [data-r7="rever-mov"]');
    await page.waitForSelector('#dlgMov7[open]', { timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll('#tblMov7 tbody tr').length > 0, { timeout: 8000 });
    const linhas = await page.evaluate(() => document.querySelectorAll('#tblMov7 tbody tr').length);
    ok(`${tag}: diálogo lista os movimentos sugeridos`, linhas > 0, String(linhas));
    await semRolagem('diálogo de movimentos'); await page.screenshot({ path: join(SAIDA, `${tag}-movimentos.png`) });
    ok(`${tag}: diálogo cabe na tela`, await page.evaluate(() => { const r = document.getElementById('dlgMov7').getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; }));
    await page.keyboard.press('Escape'); await dorme(300);
  }

  /* ---- ficha do lead: painel ---- */
  const alvo = await page.evaluate(() => { const l = TODOS.filter(x => x.status === 'agendado' && !travaLead(x))[0]; return l ? l.id : null; });
  ok(`${tag}: há lead editável para abrir`, !!alvo);
  await page.evaluate(id => abrirModal(id), alvo);
  await page.waitForFunction(() => document.querySelectorAll('#r7Painel .r7-bloco, #r7Painel .r7-topo').length > 0, { timeout: 10000 });
  await dorme(500);
  const pn = await page.evaluate(() => { const t = document.getElementById('r7Painel').textContent; return { saude: !!document.querySelector('#r7Painel .r7-saude'), entrada: !!document.querySelector('#r7Painel [data-r7a="entrada"]'), orc: !!document.querySelector('#r7Painel [data-r7a="orcamento"]'), tempo: /funil|há/i.test(t) }; });
  ok(`${tag}: painel do lead traz saúde, tempo, entrada no Pátio e orçamento`, pn.saude && pn.entrada && pn.orc && pn.tempo, JSON.stringify(pn));
  await semRolagem('ficha com painel'); await page.screenshot({ path: join(SAIDA, `${tag}-ficha.png`) });
  await page.click('#r7Painel [data-r7a="entrada"]');
  const ab = await page.evaluate(() => window.__abertas.at(-1));
  ok(`${tag}: Abrir entrada abre o Pátio com entrada=1 e dados do lead`, ab && /indycar-patio/.test(ab[0]) && /entrada=1/.test(ab[0]) && /lead=/.test(ab[0]) && ab[1] === 'indycar-patio', JSON.stringify(ab));
  await page.click('#r7Painel [data-r7a="orcamento"]');
  const ab2 = await page.evaluate(() => window.__abertas.at(-1));
  ok(`${tag}: Criar orçamento abre o Orçador com o lead`, ab2 && /orcador/.test(ab2[0]) && /lead/.test(ab2[0]), JSON.stringify(ab2));
  await page.keyboard.press('Escape'); await dorme(300);
  await page.evaluate(() => { try { fecharModal(); } catch (e) {} });

  /* ---- Hoje ---- */
  await page.evaluate(() => irPara('hoje'));
  await page.waitForFunction(() => document.querySelectorAll('#hojeLista .r6-linha').length > 0, { timeout: 15000 });
  await dorme(800);
  ok(`${tag}: Hoje mostra a meta do dia`, await page.evaluate(() => /contatos hoje|Meta do dia/.test(document.getElementById('r7MetaTxt')?.textContent || '')));
  const n0 = await page.evaluate(() => document.querySelectorAll('#hojeLista .r6-linha').length);
  await page.type('#r7Q', 'a'); await dorme(1000);
  const n1 = await page.evaluate(() => document.querySelectorAll('#hojeLista .r6-linha').length);
  ok(`${tag}: busca na fila filtra`, n1 <= n0, `${n0} -> ${n1}`);
  await page.$eval('#r7Q', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); await dorme(1000);
  await page.waitForFunction(() => document.querySelectorAll('#r7Retornos .r7-aba').length > 0, { timeout: 10000 }).catch(() => {});
  ok(`${tag}: card de Retornos combinados com abas`, await page.evaluate(() => document.querySelectorAll('#r7Retornos .r7-aba').length >= 3));
  ok(`${tag}: botão Atender o próximo habilitado`, await page.evaluate(() => !document.getElementById('r7Proximo').disabled));
  await semRolagem('Hoje'); await page.screenshot({ path: join(SAIDA, `${tag}-hoje.png`), fullPage: largura > 500 });

  /* ---- Dono / Origem ---- */
  if (gestor) {
    await page.evaluate(() => irPara('dono'));
    await page.waitForFunction(() => { const t = document.getElementById('r7ResumoTxt'); return t && !/Montando/.test(t.textContent) && t.textContent.length > 40; }, { timeout: 12000 });
    ok(`${tag}: resumo do dono pronto para copiar`, await page.evaluate(() => !document.getElementById('r7ResCopiar').disabled && /\*/.test(document.getElementById('r7ResumoTxt').textContent)));
    await page.click('#r7ResCopiar'); await dorme(200);
    ok(`${tag}: Copiar resumo leva o texto`, await page.evaluate(() => window.__copiado.length > 40 && window.__copiado === document.getElementById('r7ResumoTxt').textContent));
    ok(`${tag}: link do WhatsApp com o texto`, await page.evaluate(() => /^https:\/\/wa\.me\/\?text=/.test(document.getElementById('r7ResWpp').getAttribute('href') || '')));
    await page.click('#r7ResGuardar'); await dorme(600);
    for (const s of ['qualidade', 'perdas', 'indicacoes']) {
      await page.evaluate(x => { const d = document.querySelector(`[data-r7sec="${x}"]`); d.scrollIntoView(); d.querySelector('summary').click(); }, s); await dorme(1200);
    }
    const sec = await page.evaluate(() => ({ q: document.getElementById('r7Qual').textContent.length, p: document.getElementById('r7Perdas')?.textContent.length || 0, i: document.getElementById('r7Ind').textContent.length, nota: !!document.querySelector('#r7Qual .r7-nota-q') }));
    ok(`${tag}: seções de qualidade, perdas e indicações carregam`, sec.q > 60 && sec.p > 40 && sec.i > 20 && sec.nota, JSON.stringify(sec));
    await semRolagem('Dono'); await page.screenshot({ path: join(SAIDA, `${tag}-dono.png`), fullPage: largura > 500 });
    await page.evaluate(() => irPara('origem')); await dorme(1500);
    ok(`${tag}: Origem mostra desempenho por origem`, await page.evaluate(() => /Desempenho por origem/.test(document.getElementById('view-origem').textContent)));
    await semRolagem('Origem');
  } else {
    ok(`${tag}: atendente leva 403 no resumo do dono`, await page.evaluate(async () => (await fetch(IndyCarApps.rota('/api/dono/resumo'), { headers: await authCabecalhos() })).status === 403));
    ok(`${tag}: atendente leva 403 na qualidade`, await page.evaluate(async () => (await fetch(IndyCarApps.rota('/api/qualidade/painel'), { headers: await authCabecalhos() })).status === 403));
  }
  await page.evaluate(() => aplicarTema('claro')); await page.evaluate(() => irPara('hoje')); await dorme(400);
  await semRolagem('Hoje claro');
  ok(`${tag}: hidden some de verdade`, await page.evaluate(() => { const e = document.createElement('div'); e.className = 'r7-faixa'; e.hidden = true; document.body.append(e); const v = getComputedStyle(e).display === 'none'; e.remove(); return v; }));
  const errosReais = erros.filter(e => !/favicon|net::ERR_ABORTED|Failed to load resource.*(404|401|403)/.test(e));
  ok(`${tag}: zero erro de console/página`, errosReais.length === 0, errosReais.slice(0, 3).join(' | '));
  await page.close();
}

const { filho: m1, base: b1 } = await subirMock();
const { filho: m2, base: b2 } = await subirMock({ MOCK_PREFIXO: '/crm' });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
try {
  await roteiro(browser, b1, { largura: 1440, altura: 900, papel: 'gestor', prefixo: '' });
  await roteiro(browser, b1, { largura: 375, altura: 812, movel: true, papel: 'atendente', prefixo: '' });
  await roteiro(browser, b2, { largura: 1440, altura: 900, papel: 'gestor', prefixo: '/crm' });
  await roteiro(browser, b2, { largura: 375, altura: 812, movel: true, papel: 'gestor', prefixo: '/crm' });
} catch (e) { ok('roteiro terminou', false, e.message); console.error(e); }
finally { await browser.close(); m1.kill(); m2.kill(); }
writeFileSync(join(SAIDA, 'r7-navegador.json'), JSON.stringify({ em: new Date().toISOString(), total: resultados.length, falhas, resultados }, null, 2));
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações ok · capturas em ${SAIDA}`);
process.exit(falhas ? 1 : 0);
