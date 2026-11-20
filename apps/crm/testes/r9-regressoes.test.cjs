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

test('o vencimento da tarefa não normaliza hora ou minuto inválido', () => {
  assert.throws(() => U.vencimentoDe('2026-11-20', '24:00'), /Hora inválida/);
  assert.throws(() => U.vencimentoDe('2026-11-20', '09:60'), /Hora inválida/);
});

test('o vencimento da tarefa valida mês, dia e ano do calendário', () => {
  assert.throws(() => U.vencimentoDe('2026-13-20'), /Data inválida/);
  assert.throws(() => U.vencimentoDe('0000-01-01'), /Data inválida/);
  assert.equal(new Date(U.vencimentoDe('0099-11-20')).getFullYear(), 99);
});

test('prioridade vazia usa Normal e valores fora das opções são rejeitados', () => {
  assert.equal(U.validarTarefa({titulo: 'Ligar'}).prioridade, 2);
  assert.equal(U.validarTarefa({titulo: 'Ligar', prioridade: '3'}).prioridade, 3);
  for (const prioridade of [0, 1.5, 'urgente']) {
    assert.throws(() => U.validarTarefa({titulo: 'Ligar', prioridade}), /Prioridade de 1 a 3/);
  }
});
