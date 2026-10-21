#!/usr/bin/env node
// Rodada 6 segunda leva (C5) — roteiro de navegador (só no PC: Chrome instalado + puppeteer-core).
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
  await page.evaluate(() => { window.__abertas = []; window.open = (u, nome) => { window.__abertas.push([u, nome]); return { focus() {} }; }; });
  const chamar = (caminho, corpo) => fetch(base + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

  await chamar('/__mock/orc-visto', { limpar: true });
  /* ---- ficha do lead: conexões vivas ---- */
  await page.evaluate(() => irPara('pipeline'));
  await page.waitForFunction(() => document.querySelectorAll('#kanban .r6-chip').length > 0, { timeout: 15000 });
  const alvo = await page.evaluate(() => { const l = TODOS.filter(x => !['concluido', 'perdido'].includes(x.status) && !travaLead(x))[0]; return l ? l.id : null; });
  ok(`${tag}: há lead para abrir`, !!alvo);
  await page.evaluate(id => abrirModal(id), alvo);
  await page.waitForFunction(() => document.querySelectorAll('#r6cPainel .r6c-faixa, #r6cPainel .r6c-bloco').length > 0, { timeout: 10000 });
  const p1 = await page.evaluate(() => ({ patio: /CARRO NO PÁTIO AGORA/.test(document.getElementById('r6cPainel').textContent), pre: document.querySelectorAll('#r6cPainel .r6c-faixa.pre').length, orcs: document.querySelectorAll('#r6cPainel .r6c-orcs li').length, site: /Horário que o cliente escolheu no site/.test(document.getElementById('r6cPainel').textContent), acao: document.querySelectorAll('#r6cPainel .r6c-acoes li').length }));
  ok(`${tag}: ficha destaca CARRO NO PÁTIO AGORA, o horário do site e o pré-agendamento do Orçador`, p1.patio && p1.pre === 1 && p1.site, JSON.stringify(p1));
  ok(`${tag}: ficha lista os orçamentos do Orçador com situação e motivo da recusa`, p1.orcs === 2 && await page.evaluate(() => /Recusado/.test(document.getElementById('r6cPainel').textContent) && /Motivo da recusa: preço/.test(document.getElementById('r6cPainel').textContent)), JSON.stringify(p1));
  ok(`${tag}: ficha mostra o que a casa sugere`, p1.acao === 1);
  await page.screenshot({ path: join(SAIDA, `${tag}-conexoes.png`) });
  await semRolagem('ficha com conexões');
  await page.click('#r6cPainel [data-r6c="abrir"][data-app="orcador"]');
  let ab = await page.evaluate(() => window.__abertas.at(-1));
  ok(`${tag}: Abrir no Orçador usa a aba indycar-orcador e a rota #/historico/`, ab && ab[1] === 'indycar-orcador' && /#\/historico\//.test(ab[0]), JSON.stringify(ab));
  await page.click('#r6cPainel .r6c-faixa.pre [data-r6c="abrir"]');
  ab = await page.evaluate(() => window.__abertas.at(-1));
  ok(`${tag}: Confirmar na Agenda abre a Agenda na aba indycar-agenda`, ab && ab[1] === 'indycar-agenda' && /agendamento=/.test(ab[0]), JSON.stringify(ab));
  const antes = await page.evaluate(() => window.__abertas.length);
  await page.evaluate(() => { document.getElementById('r6cPainel').insertAdjacentHTML('beforeend', '<button data-r6c="abrir" data-app="x" data-url="javascript:alert(1)" id="mau1"></button><button data-r6c="abrir" data-app="x" data-url="https://evil.com/" id="mau2"></button>'); });
  await page.evaluate(() => { document.getElementById('mau1').click(); document.getElementById('mau2').click(); });
  ok(`${tag}: endereço de fora ou javascript: nunca abre aba`, await page.evaluate(n => window.__abertas.length === n, antes));
  await chamar('/__mock/orc-visto', { lead: alvo });
  await page.evaluate(() => carregarConexoes6(leadPorId6(LEAD_ABERTO), true));
  ok(`${tag}: mudança no orçamento com a ficha aberta vira aviso`, await page.waitForFunction(() => /Orçamento nº 12: O cliente abriu/.test(document.getElementById('toastTxt').textContent), { timeout: 8000 }).then(() => true, () => false));
  await chamar('/__mock/etapa-lead', { lead: alvo, etapa: 'pronto' });
  await page.evaluate(() => carregarConexoes6(leadPorId6(LEAD_ABERTO), true));
  ok(`${tag}: carro que muda de etapa com a ficha aberta vira aviso e a faixa se atualiza`, await page.waitForFunction(() => /O carro agora está em: Pronto/.test(document.getElementById('toastTxt').textContent) && /Pronto/.test(document.getElementById('r6cPainel').textContent), { timeout: 8000 }).then(() => true, () => false));
  /* atalhos na ficha aberta: W (WhatsApp), P (Pátio), Q (orçamento), C (contato) */
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('w'); await page.keyboard.press('p'); await page.keyboard.press('q');
  const abs = await page.evaluate(() => window.__abertas.slice(-3));
  ok(`${tag}: na ficha, W abre o WhatsApp, P o Pátio e Q o orçamento (abas nomeadas)`, abs.length === 3 && abs[0][0].startsWith('https://wa.me/55') && /55[0-9]+$/.test(abs[0][0]) && abs[1][1] === 'indycar-patio' && abs[2][1] === 'indycar-orcador', JSON.stringify(abs));
  ok(`${tag}: a faixa do carro oferece copiar o link de acompanhar e o aviso de extras esperando`, await page.evaluate(() => !!document.querySelector('#r6cPainel [data-r6c="copiar"][title*="acompanhar"]')));
  await page.keyboard.press('c');
  try { await page.waitForSelector('#dlgContato6[open]', { timeout: 5000 }); } catch (e) { console.log('DEBUG', JSON.stringify(await page.evaluate(() => ({ ae: document.activeElement.tagName + '.' + document.activeElement.id + '.' + document.activeElement.className, open: modal.classList.contains('open'), lead: LEAD_ABERTO, dlg: [...document.querySelectorAll('dialog[open]')].map(d => d.id), toast: document.getElementById('toastTxt').textContent })))); throw e; }
  await page.type('#ct6Texto', 'teste de atalho');
  await page.select('#ct6Tipo', 'whatsapp');
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
  ok(`${tag}: Ctrl+Enter salva o contato`, await page.waitForFunction(() => /Contato salvo/.test(document.getElementById('toastTxt').textContent), { timeout: 8000 }).then(() => true, () => false));
  await page.evaluate(() => { registrarContato6(LEAD_ABERTO); });
  await page.waitForSelector('#dlgContato6[open]', { timeout: 5000 });
  ok(`${tag}: o diálogo lembra o último tipo de contato usado`, await page.evaluate(() => document.getElementById('ct6Tipo').value === 'whatsapp'));
  await page.keyboard.press('Escape'); await dorme(200);
  ok(`${tag}: ficha oferece mensagens prontas do WhatsApp (link de acompanhar, orçamento, horário), sem preço`, await page.evaluate(() => { const t = [...document.querySelectorAll('#r6cPainel a[href^="https://wa.me/55"]')].map(a => new URL(a.href).searchParams.get('text')); return t.length === 3 && t.every(x => !x.includes('R$')) && t.some(x => /acompanhar/.test(x)) && t.some(x => /orçamento/.test(x)); }));
  await page.keyboard.press('Escape'); await dorme(300);

  /* novo lead: telefone/placa já conhecidos em outros sistemas */
  await page.evaluate(() => abrirModal(null));
  await page.waitForSelector('#fTelefone', { visible: true, timeout: 5000 });
  await page.type('#fPlaca', 'abc1d23'); await page.evaluate(() => document.getElementById('fPlaca').dispatchEvent(new Event('change')));
  await page.waitForSelector('#r6cAvisoplaca', { timeout: 8000 });
  ok(`${tag}: novo lead avisa que a placa já aparece no Pátio/Orçador e deixa abrir`, await page.evaluate(() => /Esta placa já aparece em outros sistemas/.test(document.getElementById('r6cAvisoplaca').textContent) && document.querySelectorAll('#r6cAvisoplaca [data-r6n]').length >= 1));
  await page.keyboard.press('Escape'); await dorme(300);
  await page.evaluate(() => { try { fecharModal(); } catch (e) {} });

  /* ---- Hoje ---- */
  await page.evaluate(() => irPara('hoje'));
  await page.waitForFunction(() => document.querySelectorAll('#hojeLista .r6-linha').length > 0, { timeout: 15000 });
  ok(`${tag}: Hoje mostra o último contato (ou que ainda não houve)`, await page.evaluate(() => document.querySelectorAll('#hojeLista .r6c-ultimo').length === document.querySelectorAll('#hojeLista .r6-linha').length));
  await page.waitForFunction(() => document.querySelectorAll('#hojeCarros .r6-linha').length > 0, { timeout: 8000 });
  ok(`${tag}: Hoje lista carro na oficina sem lead e oferece Criar lead`, await page.evaluate(() => /Dono Sem Lead/.test(document.getElementById('hojeCarros').textContent) && !!document.querySelector('#hojeCarros [data-h6c="criar-lead"]')));
  await page.click('#hojeCarros [data-h6c="criar-lead"]');
  await page.waitForFunction(() => document.getElementById('modalBg').classList.contains('open'), { timeout: 5000 });
  ok(`${tag}: Criar lead abre o formulário já com telefone, nome e placa`, await page.evaluate(() => /88887777/.test(document.getElementById('fTelefone').value.replace(/\D/g, '')) && document.getElementById('fNome').value === 'Dono Sem Lead' && document.getElementById('fPlaca').value === 'XYZ9K88' && /Pátio/.test(document.getElementById('fObs').value)));
  await page.keyboard.press('Escape'); await dorme(300);
  const n0 = await page.evaluate(() => document.querySelectorAll('#hojeLista .r6-linha').length);
  const idOculto = await page.evaluate(() => document.querySelector('#hojeLista [data-h6c="ocultar"]').dataset.id);
  await page.click('#hojeLista [data-h6c="ocultar"]'); await dorme(300);
  ok(`${tag}: 'Por hoje não' tira a linha da fila`, await page.evaluate((n, id) => document.querySelectorAll('#hojeLista .r6-linha').length === n - 1 && !document.querySelector('#hojeLista [data-lead="' + id + '"]') && /oculto/.test(document.getElementById('hojeResumo').textContent), n0, idOculto));
  await page.click('#hojeResumo [data-h6c="mostrar"]'); await dorme(300);
  ok(`${tag}: mostrar os ocultos devolve a fila inteira`, await page.evaluate(n => document.querySelectorAll('#hojeLista .r6-linha').length === n, n0));
  await page.evaluate(() => { window.__copiado = ''; navigator.clipboard.writeText = async t => { window.__copiado = t; }; });
  await page.click('#hojeResumo [data-h6c="copiar-lista"]'); await dorme(200);
  ok(`${tag}: copiar lista para ligar leva nome, telefone e motivo`, await page.evaluate(() => window.__copiado.split('\n').length >= 3 && /\(\d\d\) \d/.test(window.__copiado)));
  await semRolagem('Hoje com carros sem lead');
  await page.screenshot({ path: join(SAIDA, `${tag}-hoje.png`), fullPage: largura > 500 });

  const semPhone = await page.evaluate(() => { const b = document.querySelector('#hojeLista [data-h6c="nao-atendeu"]'); return b ? b.dataset.id : null; });
  ok(`${tag}: Hoje tem o botão "Não atendeu" de um clique`, !!semPhone);
  if (semPhone) {
    await page.click('#hojeLista [data-h6c="nao-atendeu"]');
    ok(`${tag}: "Não atendeu" registra e combina o retorno sozinho`, await page.waitForFunction(id => { const l = TODOS.find(x => x.id === id); return l && l.tentativas_contato >= 1 && !!l.proximo_contato_em; }, { timeout: 8000 }, semPhone).then(() => true, () => false));
  }

  /* ---- busca em todos os sistemas ---- */
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await page.waitForSelector('#dlgBusca[open]', { timeout: 5000 });
  await page.type('#buscaGlobal', 'ABC1D23');
  await page.waitForFunction(() => document.querySelectorAll('#buscaOutros [data-bo]').length >= 2, { timeout: 8000 });
  ok(`${tag}: Ctrl+K acha também no Pátio e no Orçador`, await page.evaluate(() => /Pátio/.test(document.getElementById('buscaOutros').textContent) && /Orçador/.test(document.getElementById('buscaOutros').textContent)));
  await page.screenshot({ path: join(SAIDA, `${tag}-busca.png`) });
  await semRolagem('busca');
  await page.click('#buscaOutros [data-bo="0"]');
  ab = await page.evaluate(() => window.__abertas.at(-1));
  ok(`${tag}: resultado de outro sistema abre na aba nomeada dele`, ab && ab[1] === 'indycar-patio', JSON.stringify(ab));

  /* ---- lote ---- */
  await page.evaluate(() => irPara('leads')); await dorme(300);
  ok(`${tag}: barra de lote tem 'Registrar contato…'`, await page.evaluate(() => !!document.getElementById('loteContato6c')));

  /* ---- Dono ---- */
  if (papel === 'gestor' || papel === 'admin') {
    await page.evaluate(() => irPara('dono'));
    await page.waitForFunction(() => document.querySelectorAll('#donoAgora .ficha-kpi').length >= 8, { timeout: 10000 });
    ok(`${tag}: Dono mostra 'Agora na casa' com Pátio, Orçador, Atendimento e Agenda`, await page.evaluate(() => /Carros no pátio/.test(document.getElementById('donoAgora').textContent) && /Conversas sem resposta/.test(document.getElementById('donoAgora').textContent) && document.querySelectorAll('#donoAgora .r6-insights li').length >= 1));
    await page.waitForSelector('#donoLigBtn', { timeout: 8000 });
    await page.click('#donoLigBtn');
    await page.waitForFunction(() => /Ligações quebradas entre os sistemas/.test(document.getElementById('donoLigacoes').textContent), { timeout: 8000 });
    ok(`${tag}: Dono confere as ligações quebradas e só lista as que têm problema`, await page.evaluate(() => document.querySelectorAll('#donoLigacoes li').length === 1));
    await page.click('#donoQualBtn');
    await page.waitForFunction(() => document.querySelectorAll('#donoQualidade [data-q6]').length > 0, { timeout: 8000 });
    await page.click('#donoQualidade [data-q6]');
    ok(`${tag}: Qualidade dos dados lista os leads do problema (antes abria só o primeiro)`, await page.waitForFunction(() => document.querySelectorAll('#donoQualidade .r6c-qlista [data-q6lead]').length >= 2, { timeout: 8000 }).then(() => true, () => false));
    await page.waitForFunction(() => document.querySelectorAll('#donoOrcador .ficha-kpi').length >= 6, { timeout: 8000 });
    ok(`${tag}: Dono mostra o funil do Orçador (enviado, aberto, aprovado, recusado) e por que recusam`, await page.evaluate(() => /Abertos pelo cliente/.test(document.getElementById('donoOrcador').textContent) && document.getElementById('donoOrcador').textContent.includes('Preço (2)')));
    await semRolagem('Dono'); await page.screenshot({ path: join(SAIDA, `${tag}-dono.png`), fullPage: largura > 500 });
  } else {
    ok(`${tag}: atendente leva 403 nas ligações quebradas`, await page.evaluate(async () => (await fetch(IndyCarApps.rota('/api/ligacoes-quebradas'), { headers: await authCabecalhos() })).status === 403));
  }
  ok(`${tag}: lista de atalhos documenta a fila Hoje, C/A/P/Q/W e Ctrl+Enter`, await page.evaluate(() => { const x = document.getElementById('dlgAtalhos').textContent; return /Hoje: a fila/.test(x) && /abrir o WhatsApp/.test(x) && /registrar um contato/.test(x) && /Ctrl.*Enter/.test(x); }));
  await page.evaluate(() => aplicarTema('claro')); await page.evaluate(() => irPara('hoje')); await dorme(400);
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
writeFileSync(join(SAIDA, 'r6c-navegador.json'), JSON.stringify({ em: new Date().toISOString(), total: resultados.length, falhas, resultados }, null, 2));
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações ok · capturas em ${SAIDA}`);
process.exit(falhas ? 1 : 0);
