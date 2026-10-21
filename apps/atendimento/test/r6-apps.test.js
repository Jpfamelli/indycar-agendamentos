'use strict';
/* Rodada 6 (C3): só abre aba para http(s) de um app da casa — o endereço pode vir de uma linha do banco. */
const test = require('node:test');
const assert = require('node:assert');

globalThis.location = new URL('https://indycar-atendimento.onrender.com/');
const A = require('../public/apps.js');

test('enderecoSeguro: aceita os apps da casa e a própria página', () => {
  assert.ok(A.enderecoSeguro('https://indycar-orcador.netlify.app/#/historico/abc'));
  assert.ok(A.enderecoSeguro('https://indycar-patio.netlify.app/?os=1'));
  assert.ok(A.enderecoSeguro('/?conversa=x'), 'relativo = esta página');
});

test('enderecoSeguro: recusa javascript:, data:, domínio de fora, usuário:senha@ e lixo', () => {
  for (const x of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x',
    'https://evil.example.com/?x', 'https://indycar-orcador.netlify.app.evil.com/', 'https://user:pw@indycar-orcador.netlify.app/', 'http://[::', null, undefined, '']) {
    assert.strictEqual(A.enderecoSeguro(x), null, String(x));
  }
});

test('abrir: endereço perigoso não chama window.open; endereço bom abre na aba nomeada sem noopener', () => {
  const chamadas = [];
  globalThis.window = { open: (u, n) => { chamadas.push([u, n]); return { focus() {} }; } };
  assert.strictEqual(A.abrir('orcador', 'javascript:alert(1)'), null);
  assert.strictEqual(chamadas.length, 0);
  A.abrir('orcador', 'https://indycar-orcador.netlify.app/?cliente=1');
  assert.deepStrictEqual(chamadas[0], ['https://indycar-orcador.netlify.app/?cliente=1', 'indycar-orcador']);
  delete globalThis.window;
});
