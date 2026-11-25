/* Rodada 16: títulos em ordem, sem borda grossa de um lado e atalhos da lista de Contatos. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), js = pub('r16.js'), css = pub('r16.css'), sw = pub('sw.js');

test('R16: a página carrega r16 depois do r15 e o service worker guarda os arquivos (v20 ou depois)', () => {
  assert.ok(html.indexOf('href="r16.css"') > html.indexOf('href="r15.css"'));
  assert.ok(html.indexOf('src="r16.js"') > html.indexOf('src="r15.js"'));
  for (const f of ['r16.css', 'r16.js']) assert.ok(sw.includes(`'${f}'`), f);
  assert.match(sw, /indycar-crm-v2[0-9]\b/);
});
test('R16: o index.html não pula de h1 para h3 (cartões usam h2)', () => {
  assert.ok(!/<h3\b/.test(html), 'sobrou h3');
  const niveis = [...html.matchAll(/<h([1-6])\b/g)].map(m => +m[1]);
  let ant = 0; for (const n of niveis) { assert.ok(n <= ant + 1 || n === 1, `pulo de h${ant} para h${n}`); ant = n; }
  for (const f of ['app.js', 'crm-ia.js', 'rodada5.js', 'rodada6.js', 'rodada7.js']) assert.ok(!/<h3\b(?![^>]*r16-sub)/.test(pub(f)), f + ': h3 só como subtítulo dentro de h2');
});
test('R16: os títulos de cartão mantêm a aparência (CSS vale para h2 e h3)', () => {
  assert.match(pub('styles.css'), /\.card :is\(h2,h3,#sdTitulo\):not\(\.meta-quem,\.r16-sub\)\{font-family/);
  assert.match(pub('styles.css'), /dialog\.dlg :is\(h2,h3\)\{/);
});
test('R16: nenhum CSS do CRM usa borda grossa de um lado só', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'public')).filter(x => x.endsWith('.css'))) {
    assert.ok(!/border-(left|right|top|bottom):\s*[3-9]px/.test(pub(f)), f);
  }
});
test('R16: CSS novo com [hidden], variáveis e toque de 44 px', () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css));
  assert.match(css, /min-height:44px/);
});
test('R16: o atalho marcado acompanha os filtros de responsável e de parados', () => {
  const ctx = { $: () => null, $$: () => [], document: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(js + '\nthis.f = atalhoAtual16;', ctx);
  assert.equal(ctx.f('', false), 'todos');
  assert.equal(ctx.f('meus', false), 'meus');
  assert.equal(ctx.f('sem', false), 'sem');
  assert.equal(ctx.f('', true), 'parados');
  assert.equal(ctx.f('abc-123', false), '', 'pessoa escolhida na gaveta: nenhum atalho marcado');
});
