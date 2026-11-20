// Casa, rodada 10: regras puras novas (sem DOM, sem rede). As provas de tela ficam em tests/r10-casa-browser.mjs.
// Cada teste aqui falha no código de antes da rodada 10 e passa no de agora.
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica4.js');
const N = globalThis.CasaLogica4;

test('r10-sessao-vencida (regra): só a recusa por login vencido conta; rede, permissão e banco fora não', () => {
  for (const e of [{ message: 'JWT expired', code: 'PGRST301' }, { code: 'PGRST303', message: 'JWT expired' }, { message: 'invalid JWT: unable to parse or verify signature, token is expired by 5m' }, new Error('jwt expired')]) {
    assert.equal(N.erroDeSessao(e), true, JSON.stringify(e.message));
  }
  for (const e of [null, undefined, {}, { message: 'Failed to fetch' }, { code: '42501', message: 'permission denied for table tarefas' }, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, { message: 'falha simulada' }]) {
    assert.equal(N.erroDeSessao(e), false, JSON.stringify(e));
  }
});

test('r10-codigo-rede (regra): erro de rede é reconhecido pelo texto, pelo nome e por estar sem internet', () => {
  assert.equal(N.erroDeRede({ message: 'Failed to fetch' }), true);
  assert.equal(N.erroDeRede({ name: 'AuthRetryableFetchError', message: '' }), true);
  assert.equal(N.erroDeRede(new Error('Load failed')), true);
  assert.equal(N.erroDeRede({ message: 'Invalid TOTP code entered' }, false), true, 'sem internet, qualquer erro é de rede');
  assert.equal(N.erroDeRede({ message: 'Invalid TOTP code entered' }), false);
  assert.equal(N.erroDeRede(new Error('sem fator')), false);
  assert.equal(N.erroDeRede(null), false);
});

test('r10-links-tempo (regra): pedido que estourou o tempo vira frase em português (não o texto técnico do navegador)', () => {
  const estouro = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  assert.equal(N.erroDosLinks(estouro), 'A Central demorou demais para responder. Tente de novo.');
  assert.equal(N.erroDosLinks(Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' })), 'A Central demorou demais para responder. Tente de novo.');
  assert.equal(N.erroDosLinks(estouro, false), 'Sem internet agora. Confira a conexão e tente de novo.', 'sem internet continua na frente');
  assert.equal(N.erroDosLinks(new Error('Entre de novo na Central.')), 'Entre de novo na Central.', 'o recado do servidor continua passando');
});
