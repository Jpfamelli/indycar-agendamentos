const { test } = require('node:test');
const assert = require('node:assert/strict');

test('roteiro do Atendimento só libera requisições para a origem do mock', () => {
  const { permiteRequisicao } = require('../scripts/barreira-navegador.cjs');
  const origem = 'http://localhost:3473';
  assert.equal(permiteRequisicao(origem + '/api/_mock', origem), true);
  assert.equal(permiteRequisicao('http://localhost:9999/api', origem), false);
  assert.equal(permiteRequisicao('http://127.0.0.1:3473/api', origem), false);
  assert.equal(permiteRequisicao('https://supabase.co/rest/v1/clientes', origem), false);
  assert.equal(permiteRequisicao('https://codewords.ai/whatsapp', origem), false);
  assert.equal(permiteRequisicao('data:image/png;base64,AA', origem), true);
});
