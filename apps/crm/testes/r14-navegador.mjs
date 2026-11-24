// Rodada 14: faxina dos contatos parados e rodízio dos vivos (SÓ com o servidor de mentira).
//   PORT=3614 MOCK_LEADS=560 npm run mock   e depois   node testes/r14-navegador.mjs [base]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3614';
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
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('indycar_crm_faxina_ultima'); } catch (e) { /* sem storage */ } });
  await page.goto(`${BASE}/?papel=${papel}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof TODOS !== 'undefined' && TODOS.length && document.querySelector('#r13Frase').textContent, { timeout: 20000 });
  await espera(1200);
  return { page, erros };
}
const txt = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent || '', sel);
try {
  const { page, erros } = await abrir('gestor');
  conferir('Hoje: aviso de contatos sem responsável para o gestor', await page.evaluate(() => { const b = document.querySelector('#r14Hoje'); return b && !b.hidden && /sem responsável/.test(b.textContent); }));
  await page.evaluate(() => document.querySelector('[data-r14-hoje]').click()); await espera(1800);
  conferir('o botão do aviso abre a faxina', await page.evaluate(() => document.querySelector('#view-distribuir').classList.contains('active')));
  const frase = await txt(page, '#r14Frase');
  conferir('herói com os números', /^\d+ contatos? abertos? sem responsável\./.test(frase) && await page.evaluate(() => document.querySelectorAll('#r14Nums .r13-num').length === 3), frase);
  const n0 = await page.evaluate(() => F14.dados.total);
  conferir('a faxina tem contatos parados e o botão fala quantos', n0 > 0 && /Marcar \d+ contatos? como perdidos?/.test(await txt(page, '#r14Gravar')), await txt(page, '#r14Gravar'));
  conferir('o rodízio não inclui quem vai para a faxina', await page.evaluate(() => { const lixo = new Set(F14.dados.itens.map(i => i.id)); return F14.dados.rodizio.plano.length > 0 && F14.dados.rodizio.plano.every(p => !lixo.has(p.id)); }));
  conferir('o rodízio mostra as pessoas', await page.evaluate(() => document.querySelectorAll('#sdRodizio tbody tr').length >= 2));

  await page.evaluate(() => document.querySelector('[data-r14-dias="60"]').click()); await espera(1200);
  const n60 = await page.evaluate(() => F14.dados.total);
  conferir('prazo de 60 dias pega menos que 30', n60 < n0, `${n0} → ${n60}`);
  await page.evaluate(() => document.querySelector('[data-r14-dias="30"]').click()); await espera(1200);

  await page.evaluate(() => { document.querySelector('#r14Detalhe').open = true; });
  await page.evaluate(() => document.querySelector('.r14-itens .r14-item input').click());
  const marcados = await page.evaluate(() => F14.sel.size);
  conferir('desmarcar um contato muda o botão', marcados === n0 - 1 && new RegExp(`Marcar ${n0 - 1} `).test(await txt(page, '#r14Gravar')));
  const idFora = await page.evaluate(() => F14.dados.itens.find(i => !F14.sel.has(i.id)).id);
  await page.evaluate(() => document.querySelector('#r14Gravar').click()); await espera(2200);
  conferir('gravar marca como perdidos só os marcados', await page.evaluate(([id, n]) => TODOS.filter(l => l.status === 'perdido' && /Faxina: parado há/.test(l.observacoes || '')).length === n && TODOS.find(l => l.id === id).status !== 'perdido', [idFora, marcados]));
  conferir('o motivo da perda é o padrão', await page.evaluate(() => TODOS.filter(l => /Faxina: parado há/.test(l.observacoes || '')).every(l => /Motivo da perda: Sem retorno do cliente/.test(l.observacoes))));
  conferir('a faxina recalcula (sobra só o que desmarcamos)', await page.evaluate(() => F14.dados.total === 1));
  conferir('toast com Desfazer', await page.evaluate(() => !document.querySelector('#toastAcao').hidden && /Desfazer/.test(document.querySelector('#toastAcao').textContent)));
  await page.evaluate(() => document.querySelector('#toastAcao').click()); await espera(2200);
  conferir('Desfazer volta os contatos para a etapa de antes', await page.evaluate(() => !TODOS.some(l => /Faxina: parado há/.test(l.observacoes || ''))));
  conferir('o botão "Desfazer a última faxina" some depois de desfeita', await page.evaluate(() => document.querySelector('#r14Desfazer').hidden));
  conferir('quem foi desfeito conta como mexido hoje (a data do contato muda ao gravar), então sai da faxina', await page.evaluate(n => F14.dados.total <= 1 && F14.dados.vivos > 100, n0), await page.evaluate(() => `total ${F14.dados.total}, vivos ${F14.dados.vivos}`));

  await page.evaluate(() => document.querySelector('#r14Gravar').click()); await espera(2200);
  conferir('o botão do cartão oferece desfazer a última faxina', await page.evaluate(() => !document.querySelector('#r14Desfazer').hidden));
  await page.evaluate(() => document.querySelector('#r14Desfazer').click()); await espera(2200);
  conferir('desfazer pelo botão do cartão', await page.evaluate(() => !TODOS.some(l => /Faxina: parado há/.test(l.observacoes || '')) && document.querySelector('#r14Desfazer').hidden));

  const vivos = await page.evaluate(() => F14.dados.vivos);
  await page.evaluate(() => document.querySelector('#sdAplicar').click()); await espera(2200);
  conferir('aplicar o rodízio dá dono aos vivos', await page.evaluate(() => F14.dados.vivos === 0), `vivos antes ${vivos}`);

  await page.evaluate(() => { document.querySelector('#r14Manual').open = true; });
  conferir('"Escolher na mão" abre a distribuição antiga', await page.evaluate(() => !!document.querySelector('#r14Manual #dsPrevia') && document.querySelector('#r14Manual').open));
  conferir('gestor: nenhum erro de página', !erros.length, erros.join(' | '));
  await page.close();

  const at = await abrir('atendente');
  conferir('atendente: sem aviso na tela Hoje', await at.page.evaluate(() => { const b = document.querySelector('#r14Hoje'); return !b || b.hidden; }));
  conferir('atendente: aba escondida e API recusa', await at.page.evaluate(async () => document.querySelector('[data-view="distribuir"]').hidden && await api('/api/leads/faxina').then(() => false, e => /gestor/.test(e.message))));
  conferir('atendente: nenhum erro de página', !at.erros.filter(e => !/40[13]/.test(e)).length, at.erros.join(' | '));
  await at.page.close();

  const cel = await abrir('gestor', 375, 812);
  await cel.page.evaluate(() => irPara('distribuir')); await espera(1800);
  conferir('celular: sem rolagem lateral', await cel.page.evaluate(() => Math.max(document.documentElement.scrollWidth, innerWidth) <= 376));
  conferir('celular: botões e filtros com 44 px', await cel.page.evaluate(() => [...document.querySelectorAll('#r14Faxina .filtro-pill, #r14Gravar, #sdAplicar, #r14Detalhe summary, .r14-manual summary')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 43.5)));
  conferir('celular: nenhum erro de página', !cel.erros.length, cel.erros.join(' | '));
} finally { await browser.close(); }
const falhas = resultados.filter(x => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
