/* Rodada 14: a tela da faxina (arquivos estáticos) e as contas compartilhadas com o navegador. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), css = pub('r14.css'), js = pub('r14.js'), sw = pub('sw.js');

test('R14: a página carrega as contas antes da tela e o CSS depois do r13', () => {
  assert.ok(html.indexOf('href="r14.css"') > html.indexOf('href="r13.css"'));
  assert.ok(html.indexOf('src="r14-faxina.js"') < html.indexOf('src="r14.js"'));
  assert.ok(html.indexOf('src="r14.js"') > html.indexOf('src="rodada5.js"'), 'r14.js usa SD e api do rodada5/app');
});
test('R14: o service worker guarda os arquivos novos e subiu a versão', () => {
  for (const f of ['r14.css', 'r14-faxina.js', 'r14.js']) assert.ok(sw.includes(`'${f}'`), f);
  assert.match(sw, /indycar-crm-v(18|19|20)\b/);
});
test('R14: a tela de contatos sem responsável tem herói, faxina, rodízio e a escolha na mão', () => {
  for (const id of ['r14Heroi', 'r14Frase', 'r14Nums', 'r14Faxina', 'r14Dias', 'r14Escopo', 'r14Gravar', 'r14Desfazer', 'cardSemDono', 'sdRodizio', 'sdAplicar', 'sdRecarregar', 'r14Manual', 'dsPrevia', 'dsHistorico']) assert.ok(html.includes(`id="${id}"`), id);
});
test('R14: CSS com [hidden], sem borda grossa de um lado e só com as cores da Casa', () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.ok(!/border-(left|right|top|bottom):\s*[3-9]px/.test(css));
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css), 'cores só por variável');
});
test('R14: o gestor confirma antes de marcar, fala que nada é apagado e oferece Desfazer', () => {
  assert.match(js, /confirm\(`Marcar/);
  assert.match(js, /Nada é apagado e dá para desfazer/);
  assert.match(js, /toastAcao\(msg, 'Desfazer'/);
  assert.ok(!/DELETE/.test(js), 'a faxina nunca apaga');
});
test('R14: o herói e o aviso de Hoje só aparecem para o gestor', () => {
  assert.match(js, /if \(!SOU_GESTOR \|\| typeof TODOS === 'undefined'/);
  assert.match(js, /async function carregarFaxina14\(\) \{\s*if \(!SOU_GESTOR/);
});
