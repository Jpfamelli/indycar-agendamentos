/* Rodada 15: arquivos estáticos do polimento (carros entregues curtos e faixa de etapas do Funil). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), css = pub('r15.css'), js = pub('r15.js'), sw = pub('sw.js');

test('R15: a página carrega r15 depois do r14 e o service worker guarda os arquivos (v19)', () => {
  assert.ok(html.indexOf('href="r15.css"') > html.indexOf('href="r14.css"'));
  assert.ok(html.indexOf('src="r15.js"') > html.indexOf('src="r14.js"'), 'r15.js envolve funções definidas antes');
  for (const f of ['r15.css', 'r15.js']) assert.ok(sw.includes(`'${f}'`), f);
  assert.match(sw, /indycar-crm-v(19|20)\b/);
});
test('R15: CSS com [hidden], sem borda grossa de um lado e só com variáveis', () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.ok(!/border-(left|right|top|bottom):\s*[3-9]px/.test(css));
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css));
  assert.match(css, /min-height:44px/);
});
test('R15: o texto da fila nunca mostra "undefined" quando o servidor não manda "mostrando"', () => {
  assert.match(pub('rodada6c.js'), /mostrando os \$\{d\.mostrando \|\| d\.itens\.length\} mais/);
});

/* contas do encurtador, rodadas num DOM mínimo */
function montar(qtd, todos = false) {
  const filhos = [];
  for (let i = 0; i < qtd; i++) filhos.push({ classList: { contains: c => c === 'r6-linha' }, hidden: false });
  const box = { children: filhos, html: '', querySelector: () => null, insertAdjacentHTML(_, h) { this.html += h; }, addEventListener() {} };
  const ctx = { $: s => (s === '#hojeEntregues' ? box : null), $$: () => [], esc: x => x, renderHoje6() {}, renderKanban() {}, document: { addEventListener() {} }, cancelAnimationFrame() {}, requestAnimationFrame() {}, matchMedia: () => ({ matches: false }) };
  vm.createContext(ctx);
  vm.runInContext(js.replace('let R15_ENT_TODOS = false;', `let R15_ENT_TODOS = ${todos};`) + '\nthis.__ok = encurtarEntregues15;', ctx);
  return { box, filhos, rodar: () => ctx.__ok() };
}
test('R15: 29 carros entregues mostram 5 e oferecem os outros 24', () => {
  const { box, filhos, rodar } = montar(29); rodar();
  assert.equal(filhos.filter(f => !f.hidden).length, 5);
  assert.match(box.html, /Mostrar os outros 24 carros entregues/);
});
test('R15: com 5 ou menos não há botão e nada fica escondido', () => {
  const { box, filhos, rodar } = montar(5); rodar();
  assert.equal(filhos.filter(f => f.hidden).length, 0); assert.equal(box.html, '');
});
test('R15: depois de "mostrar os outros" tudo aparece e o botão some', () => {
  const { box, filhos, rodar } = montar(29, true); rodar();
  assert.equal(filhos.filter(f => f.hidden).length, 0); assert.equal(box.html, '');
});
test('R15: a faixa de etapas existe só no celular e cada botão tem 44 px de altura', () => {
  assert.match(css, /\.r15-etapas\{display:none\}/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.r15-etapa\{[^}]*min-height:44px/);
  assert.match(js, /data-r15-etapa/);
});
