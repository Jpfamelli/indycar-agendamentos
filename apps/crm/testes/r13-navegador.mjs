// Rodada 13: jornadas do dia na tela nova (SÓ com o servidor de mentira).
//   PORT=3613 npm run mock   e depois   node testes/r13-navegador.mjs [base]
// Abre em Hoje, lança valor pela tela Hoje, pela lista de Contatos e pela ficha, desfaz,
// marca cortesia, confere o atendente com contato de colega e o celular sem rolagem lateral.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3613';
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok ' : 'FALHOU'} · ${nome}${detalhe ? ' · ' + detalhe : ''}`); };

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
async function abrir(papel, w = 1440, h = 900) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) return r.abort(); r.continue(); });
  await page.setViewport({ width: w, height: h, isMobile: w < 768, hasTouch: w < 768 });
  await page.goto(`${BASE}/?papel=${papel}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof TODOS !== 'undefined' && TODOS.length && document.querySelector('#r13Frase').textContent, { timeout: 20000 });
  await espera(1200);
  return { page, erros };
}
try {
  const { page, erros } = await abrir('gestor');
  conferir('abre em Hoje', await page.evaluate(() => document.querySelector('.view.active')?.id === 'view-hoje'));
  conferir('frase do resumo com números', await page.evaluate(() => /^Hoje (entrou|entraram) \d+/.test(document.querySelector('#r13Frase').textContent) && document.querySelectorAll('#r13Frase b').length >= 3), await page.evaluate(() => document.querySelector('#r13Frase').textContent));
  conferir('gráfico de 14 dias', await page.evaluate(() => document.querySelectorAll('#r13Grafico .r13-dia').length === 14));
  conferir('fila do dia encurtada em 10', await page.evaluate(() => [...document.querySelectorAll('#hojeLista > .r6-linha')].filter(x => !x.hidden).length <= 10 && !!document.querySelector('[data-r13-fila]')));
  conferir('retornos combinados depois da fila', await page.evaluate(() => { const r = document.querySelector('#r7Retornos'); return !r || document.querySelector('#hojeLista').closest('.card').nextElementSibling === r; }));

  // 1) lançar pela tela Hoje
  const antes = await page.evaluate(() => document.querySelectorAll('#r13ValoresLista form.r13-v').length);
  const id1 = await page.evaluate(() => { const f = document.querySelector('#r13ValoresLista form.r13-v'); f.querySelector('input').value = '480'; f.querySelector('[type=submit]').click(); return f.dataset.id; });
  await espera(1200);
  conferir('Hoje: lançar grava o valor', await page.evaluate(id => Number(TODOS.find(x => String(x.id) === id).valor_pago) === 480, id1));
  conferir('Hoje: some da lista de sem valor', await page.evaluate(() => document.querySelectorAll('#r13ValoresLista form.r13-v').length) < antes || antes > 6);
  conferir('Hoje: toast com Desfazer', await page.evaluate(() => !document.querySelector('#toastAcao').hidden && /Desfazer/.test(document.querySelector('#toastAcao').textContent)));
  await page.evaluate(() => document.querySelector('#toastAcao').click()); await espera(1200);
  conferir('Desfazer volta o valor', await page.evaluate(id => !(Number(TODOS.find(x => String(x.id) === id).valor_pago) > 0), id1));

  // 2) valor em branco não grava
  await page.evaluate(() => { const f = document.querySelector('#r13ValoresLista form.r13-v'); f.querySelector('input').value = ''; f.querySelector('[type=submit]').click(); });
  await espera(400);
  conferir('valor vazio é recusado com aviso', await page.evaluate(() => document.querySelector('#r13ValoresLista form.r13-v input').getAttribute('aria-invalid') === 'true'));

  // 3) lista de Contatos: "Lançar valor" abre o diálogo e grava, sem abrir a ficha
  await page.evaluate(() => { irPara('leads'); document.querySelector('#soSemValor').checked = true; refiltrarTela(); }); await espera(600);
  const id2 = await page.evaluate(() => { const b = document.querySelector('#tblLeads [data-lancar]'); b.click(); return b.dataset.lancar; });
  await espera(500);
  conferir('lista: botão abre "Quanto o cliente pagou?" e não a ficha', await page.evaluate(() => document.querySelector('#dlgPago').open && !document.querySelector('#modalBg').classList.contains('open')));
  conferir('lista: "Não sei agora" escondido', await page.evaluate(() => document.querySelector('#pagoPendente').hidden));
  await page.evaluate(() => { document.querySelector('#pagoValor').value = '350'; document.querySelector('#formPago [type=submit]').click(); }); await espera(1200);
  conferir('lista: valor gravado', await page.evaluate(id => Number(TODOS.find(x => String(x.id) === id).valor_pago) === 350, id2));

  // 4) ficha: faixa "Falta o valor" e cortesia
  const id3 = await page.evaluate(() => { const l = TODOS.find(x => CrmR13.semValor(x) && !travaLead(x)); abrirModal(l.id); return String(l.id); });
  await espera(900);
  conferir('ficha: faixa "Falta o valor deste serviço"', await page.evaluate(() => { const b = document.querySelector('#r13FichaValor'); return b && !b.hidden && /Falta o valor/.test(b.textContent); }));
  await page.evaluate(() => document.querySelector('[data-r13-ficha]').click()); await espera(400);
  await page.evaluate(() => document.querySelector('#pagoCortesia').click()); await espera(1200);
  conferir('ficha: cortesia grava a marca e sai do sem valor', await page.evaluate(id => { const l = TODOS.find(x => String(x.id) === id); return /Cortesia: sem cobran/.test(l.observacoes || '') && !CrmR13.semValor(l); }, id3));
  conferir('ficha: faixa mostra "Cortesia"', await page.evaluate(() => /Cortesia/.test(document.querySelector('#r13FichaValor').textContent)));
  await page.evaluate(() => fecharModal(true));

  // 5) funil: cartão concluído sem valor tem o botão
  await page.evaluate(() => irPara('pipeline')); await espera(500);
  conferir('funil: "Lançar valor" no cartão concluído sem valor', await page.evaluate(() => { const n = TODOS.filter(x => CrmR13.semValor(x) && !travaLead(x)).length; return !n || !!document.querySelector('#kanban [data-lancar]'); }));

  // 6) painel: frase do período
  await page.evaluate(() => irPara('dashboard')); await espera(500);
  conferir('painel: frase do período', await page.evaluate(() => /^Nos últimos 7 dias, (entrou|entraram) \d+/.test(document.querySelector('#r13FrasePainel').textContent)));
  conferir('gestor: nenhum erro de página', !erros.length, erros.join(' | '));
  await page.close();

  // 7) atendente: o sem valor de colega não aparece no resumo dele
  const at = await abrir('atendente');
  conferir('atendente: só os sem valor dele', await at.page.evaluate(() => [...document.querySelectorAll('#r13ValoresLista form.r13-v')].every(f => { const l = TODOS.find(x => String(x.id) === f.dataset.id); return !l.responsavel_id || String(l.responsavel_id) === String(PERFIL.id); })));
  conferir('atendente: sem "Lançar vários de uma vez"', await at.page.evaluate(() => document.querySelector('#r13Lote').hidden));
  conferir('atendente: nenhum erro de página', !at.erros.length, at.erros.join(' | '));
  await at.page.close();

  // 8) celular: Hoje e Contatos sem rolagem lateral, barra de baixo com as 5 abas
  const cel = await abrir('gestor', 375, 812);
  for (const v of ['hoje', 'leads', 'pipeline', 'clientes', 'dashboard']) {
    await cel.page.evaluate(v => irPara(v), v); await espera(500);
    conferir(`celular ${v}: sem rolagem lateral`, await cel.page.evaluate(() => Math.max(document.documentElement.scrollWidth, innerWidth) <= 376));
  }
  conferir('celular: as 5 abas cabem na barra de baixo', await cel.page.evaluate(() => [...document.querySelectorAll('.ic-abas .nav-item')].every(b => { const r = b.getBoundingClientRect(); return r.right <= 376 && r.height >= 44 && r.bottom > innerHeight - 80; })));
  conferir('celular: nenhum erro de página', !cel.erros.length, cel.erros.join(' | '));
} finally { await browser.close(); }
const falhas = resultados.filter(x => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
