#!/usr/bin/env node
// Rodada 6 (C2) — roteiro de navegador (só no PC: Chrome instalado + puppeteer-core).
// Sobe o servidor FALSO (dados inventados) solto e montado em /crm/ e confere, em 1440 e 375 px,
// como gestor e atendente: sinais ao vivo no funil, filtro por sinal, registrar contato,
// histórico na ficha, aba Hoje (fila + script sem preço), aba Dono, retorno por campanha,
// 403 para atendente, tema claro, zero rolagem lateral e zero erro de console.
//   node testes/r6-navegador.mjs            → capturas em %TEMP%/r6-navegador (ou RELATORIO_DIR)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAIDA = process.env.RELATORIO_DIR || join(process.env.TEMP || RAIZ, 'r6-navegador');
mkdirSync(SAIDA, { recursive: true });
const requerer = createRequire(import.meta.url);
let puppeteer;
for (const base of [null, join(RAIZ, '..', '..', '..', 'indycar-ferramentas'), join(RAIZ, '..', 'indycar-ferramentas'), process.env.FERRAMENTAS].filter((x, i) => i === 0 || x)) {
  try { puppeteer = base === null ? requerer('puppeteer-core') : createRequire(join(base, 'package.json'))('puppeteer-core'); break; } catch { /* tenta o próximo */ }
}
if (!puppeteer) throw new Error('puppeteer-core não encontrado (rode npm i em indycar-ferramentas ou defina FERRAMENTAS).');

const portaLivre = p => new Promise(ok => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(p, '127.0.0.1'); });
async function subirMock(env = {}) {
  let porta = 3241; while (!(await portaLivre(porta))) porta++;
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

  /* funil com sinais ao vivo */
  await page.evaluate(() => irPara('pipeline'));
  try { await page.waitForFunction(() => document.querySelectorAll('#kanban .r6-chip').length > 0, { timeout: 15000 }); } catch (e) { console.log('ERROS PAGINA:', erros.slice(0, 5), await page.evaluate(() => JSON.stringify({ sinais: Object.keys(R6.sinais).length, em: R6.em, perfil: !!PERFIL }))); throw e; }
  const f = await page.evaluate(() => ({ chips: document.querySelectorAll('#kanban .r6-chip').length, rapidas: document.querySelectorAll('#kanban .r6-mini').length, filtro: document.getElementById('fSinal6')?.options.length }));
  ok(`${tag}: funil mostra chips de Pátio/orçamento/espera e ações rápidas`, f.chips > 3 && f.rapidas > 3 && f.filtro > 1, JSON.stringify(f));
  await semRolagem('funil');
  await page.screenshot({ path: join(SAIDA, `${tag}-funil.png`) });
  const alvoFiltro = await page.evaluate(() => [...document.getElementById('fSinal6').options].find(x => x.value)?.value);
  await page.select('#fSinal6', alvoFiltro);
  const filtrado = await page.evaluate(() => ({ vis: document.querySelectorAll('#kanban .kb-card:not([hidden])').length, todos: document.querySelectorAll('#kanban .kb-card').length }));
  ok(`${tag}: filtro por sinal esconde o resto`, filtrado.vis > 0 && filtrado.vis < filtrado.todos, JSON.stringify(filtrado));
  await page.select('#fSinal6', '');

  /* teclado no funil: tecla 2 move o cartão para Em contato; faixa no painel */
  const cartaoNovo = await page.evaluate(() => { const c = [...document.querySelectorAll('#kanban .kb-col[data-etapa="novo"] .kb-card:not([data-travado])')][0]; return c?.dataset.id; });
  if (cartaoNovo) {
    await page.evaluate(id => document.querySelector('.kb-card[data-id="' + id + '"]').focus(), cartaoNovo);
    await page.keyboard.press('2');
    let moveu = true; try { await page.waitForFunction(id => TODOS.find(x => x.id === id)?.status === 'contato', { timeout: 8000 }, cartaoNovo); } catch { moveu = false; }
    ok(`${tag}: tecla 2 no cartão move para Em contato`, moveu, moveu ? '' : await page.evaluate(id => JSON.stringify({ toast: document.getElementById('toastTxt')?.textContent, lead: TODOS.find(x => x.id === id), foco: document.activeElement?.className }), cartaoNovo));
  }
  await page.evaluate(() => irPara('dashboard')); await dorme(300);
  ok(`${tag}: faixa "Agora" no painel com atalhos`, await page.evaluate(() => !document.getElementById('r6Faixa').hidden && document.querySelectorAll('#r6Faixa [data-faixa]').length >= 2));
  await semRolagem('painel com faixa');
  await page.evaluate(() => irPara('pipeline')); await dorme(200);

  /* teclas C, P e Q no cartão; links abrem na aba nomeada */
  await page.evaluate(() => { window.__abertas = []; window.open = (u, nome) => { window.__abertas.push([u, nome]); return { focus() {} }; }; });
  const comPatio = await page.evaluate(() => TODOS.find(l => R6.sinais[l.id]?.patio && !travaLead(l))?.id);
  if (comPatio) {
    await page.evaluate(id => document.querySelector('.kb-card[data-id="' + id + '"]').focus(), comPatio);
    await page.keyboard.press('p');
    const ab = await page.evaluate(() => window.__abertas.at(-1));
    ok(`${tag}: tecla P abre o Pátio na aba nomeada indycar-patio`, ab && ab[1] === 'indycar-patio' && /os=/.test(ab[0]), JSON.stringify(ab));
  }
  const comOrc = await page.evaluate(() => TODOS.find(l => R6.sinais[l.id]?.orcamento && !travaLead(l))?.id);
  if (comOrc) {
    await page.evaluate(id => document.querySelector('.kb-card[data-id="' + id + '"]').focus(), comOrc);
    await page.keyboard.press('q');
    const ab = await page.evaluate(() => window.__abertas.at(-1));
    ok(`${tag}: tecla Q abre o orçamento no Orçador (aba indycar-orcador, rota #/orcamento/)`, ab && ab[1] === 'indycar-orcador' && /#\/orcamento\//.test(ab[0]), JSON.stringify(ab));
    await page.evaluate(id => document.querySelector('.kb-card[data-id="' + id + '"]').focus(), comOrc);
    await page.keyboard.press('c');
    await page.waitForSelector('#dlgContato6[open]', { timeout: 5000 });
    ok(`${tag}: tecla C no cartão abre o registro de contato`, true);
    await page.keyboard.press('Escape'); await dorme(200);
  }

  /* registrar contato pelo cartão */
  const idLead = await page.evaluate(() => document.querySelector('#kanban .kb-card:not([data-travado]) .r6-mini[data-r6="contato"]')?.dataset.id);
  ok(`${tag}: há cartão com botão Contato`, !!idLead);
  if (idLead) {
    await page.click(`#kanban .r6-mini[data-r6="contato"][data-id="${idLead}"]`);
    await page.waitForSelector('#dlgContato6[open]', { timeout: 5000 });
    await page.select('#ct6Res', 'nao_atendeu'); await page.type('#ct6Texto', 'Liguei duas vezes');
    await page.click('#ct6Ok');
    await page.waitForFunction(() => /Contato salvo/.test(document.getElementById('toastTxt').textContent), { timeout: 10000 });
    const lead = await page.evaluate(id => { const l = TODOS.find(x => x.id === id); return { t: l.tentativas_contato, p: l.proximo_contato_em }; }, idLead);
    ok(`${tag}: contato salvo atualiza tentativas e combina retorno sozinho`, lead.t >= 1 && !!lead.p, JSON.stringify(lead));
    await page.evaluate(id => abrirModal(id), idLead);
    await page.waitForFunction(() => document.querySelectorAll('#r6Hist li').length > 0 && !/Carregando/.test(document.getElementById('r6Hist').textContent), { timeout: 10000 });
    ok(`${tag}: ficha do lead lista o contato registrado`, await page.evaluate(() => /Não atendeu/.test(document.getElementById('r6Hist').textContent)));
    ok(`${tag}: lead tem painel do ecossistema e select de cadência`, await page.evaluate(() => !!document.getElementById('r6Painel') && !!document.getElementById('r6Cad')));
    await page.screenshot({ path: join(SAIDA, `${tag}-ficha.png`) });
    await semRolagem('ficha do lead');
    await page.keyboard.press('Escape');
    await dorme(300);
  }

  /* aba Hoje */
  await page.evaluate(() => irPara('hoje'));
  await page.waitForFunction(() => document.querySelectorAll('#hojeLista .r6-linha').length > 0 || /Fila zerada/.test(document.getElementById('hojeLista').textContent), { timeout: 15000 });
  const h = await page.evaluate(() => ({ n: document.querySelectorAll('#hojeLista .r6-linha').length, resumo: document.getElementById('hojeResumo').textContent, titulo: document.getElementById('viewTitle').textContent, script: document.querySelectorAll('#hojeLista .r6-script').length }));
  ok(`${tag}: aba Hoje lista a fila com motivo e mensagem sugerida`, h.n > 0 && h.script === h.n && h.titulo === 'Hoje', `${h.n} itens · ${h.resumo.slice(0, 60)}`);
  await semRolagem('Hoje');
  await page.evaluate(() => document.activeElement?.blur?.()); await dorme(300); await page.keyboard.press('j'); await dorme(200);
  ok(`${tag}: tecla J na aba Hoje foca a primeira linha`, await page.evaluate(() => document.activeElement?.classList.contains('r6-linha')), await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className));
  const chipMotivo = await page.evaluate(() => document.querySelector('#hojeResumo [data-h6="motivo"]')?.dataset.k);
  if (chipMotivo) { await page.click('#hojeResumo [data-h6="motivo"]'); ok(`${tag}: chip de motivo filtra a fila`, await page.evaluate(() => document.querySelectorAll('#hojeLista .r6-linha').length > 0)); await page.click('#hojeResumo [data-h6="motivo"][data-k=""]'); }
  await page.screenshot({ path: join(SAIDA, `${tag}-hoje.png`), fullPage: largura > 500 });
  ok(`${tag}: WhatsApp da fila já leva o texto sugerido`, await page.evaluate(() => [...document.querySelectorAll('#hojeLista a[href^="https://wa.me/55"]')].some(a => /text=Oi/.test(a.href))));
  ok(`${tag}: linhas da fila trazem links para Pátio/Orçamento quando há`, await page.evaluate(() => [...document.querySelectorAll('#hojeLista a.acao')].some(a => /Pátio|Orçamento|Conversa|Agendar/.test(a.textContent))));
  await page.keyboard.press('j'); await dorme(150);
  await page.keyboard.press('c');
  await page.waitForSelector('#dlgContato6[open]', { timeout: 5000 });
  ok(`${tag}: tecla C na fila abre o registro de contato do lead em foco`, true);
  await page.keyboard.press('Escape'); await dorme(200);
  ok(`${tag}: mensagem sugerida não traz preço nem palavra proibida`, await page.evaluate(() => ![...document.querySelectorAll('#hojeLista .r6-script p')].some(p => /R\$|prezad|efetuar|comparecer|ve[ií]culo/i.test(p.textContent))));

  /* aba Dono (só gestor) */
  if (papel === 'gestor' || papel === 'admin') {
    await page.evaluate(() => irPara('dono'));
    await page.waitForFunction(() => document.querySelectorAll('#donoCorpo .ficha-kpi').length > 5, { timeout: 15000 });
    ok(`${tag}: Hoje mostra o bloco de carros entregues para concluir`, await (async () => { await page.evaluate(() => irPara('hoje')); await dorme(800); return page.evaluate(() => document.querySelectorAll('#hojeEntregues [data-h6="concluir"]').length > 0); })());
    await page.evaluate(() => irPara('dono'));
    await page.waitForFunction(() => document.querySelectorAll('#donoCorpo .ficha-kpi').length > 5, { timeout: 15000 });
    await page.click('#donoQualBtn');
    await page.waitForFunction(() => document.querySelectorAll('#donoQualidade li').length > 0, { timeout: 10000 });
    ok(`${tag}: Dono lista a qualidade dos dados`, await page.evaluate(() => /sem responsável|telefone/.test(document.getElementById('donoQualidade').textContent)));
    ok(`${tag}: aba Dono mostra KPIs, meta e texto do WhatsApp`, await page.evaluate(() => !!document.getElementById('donoTexto') && document.querySelector('.r6-meta-barra') !== null));
    await semRolagem('Dono'); await page.screenshot({ path: join(SAIDA, `${tag}-dono.png`), fullPage: largura > 500 });
    await page.evaluate(() => irPara('origem'));
    await page.waitForFunction(() => document.querySelectorAll('#r6Roi tbody tr').length > 0, { timeout: 15000 });
    ok(`${tag}: Origem traz o retorno por campanha`, await page.evaluate(() => /Freios/.test(document.getElementById('r6Roi').textContent)));
  } else {
    ok(`${tag}: atendente não vê a aba Dono`, await page.evaluate(() => document.querySelector('.nav-item[data-view="dono"]').hidden));
    ok(`${tag}: atendente leva 403 no resumo do dono`, await page.evaluate(async () => (await fetch(IndyCarApps.rota('/api/dono'), { headers: await authCabecalhos() })).status === 403));
  }

  /* tema claro */
  await page.evaluate(() => aplicarTema('claro')); await page.evaluate(() => irPara('hoje')); await dorme(400);
  await page.screenshot({ path: join(SAIDA, `${tag}-hoje-claro.png`) });
  await semRolagem('Hoje claro');
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
writeFileSync(join(SAIDA, 'r6-navegador.json'), JSON.stringify({ em: new Date().toISOString(), total: resultados.length, falhas, resultados }, null, 2));
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações ok · capturas em ${SAIDA}`);
process.exit(falhas ? 1 : 0);
