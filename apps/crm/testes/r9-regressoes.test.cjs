const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../public/crm-utils');

test('a busca com texto não encontra contatos só pelo sufixo do telefone', () => {
  const contato = { nome: 'Maria', telefone: '12987654321' };
  assert.equal(U.buscar(contato, 'Orçamento 87654321'), false);
  assert.equal(U.buscar(contato, '+55 (11) 98765-4321'), true);
});

test('a paginação mantém o intervalo legível quando o tamanho salvo é inválido', () => {
  const contatos = Array.from({length: 51}, (_, index) => index);
  for (const tamanho of [0, -2, 1.5, Infinity, NaN]) {
    assert.deepEqual(U.paginar(contatos, 2, tamanho), {
      itens: [50], pagina: 2, paginas: 2, total: 51, de: 51, ate: 51,
    });
  }
});
