'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const seguranca = require('../lib/seguranca');

test('R10-ATD-003: auditoria oculta campos sens?veis no limite de profundidade', () => {
  let registro = { token: 'valor-ficticio' };
  for (let i = 0; i < 7; i++) registro = { registro };
  assert.ok(!JSON.stringify(seguranca.semSegredos(registro)).includes('valor-ficticio'));
});

test('R10-ATD-004: inteiros de API recusam booleanos e listas', () => {
  for (const valor of [true, false, [], [4], ' ']) assert.equal(seguranca.inteiro(valor), null);
  assert.equal(seguranca.inteiro('4'), 4);
});

test('R10-ATD-005: instantes recusam dias inexistentes', () => {
  assert.equal(seguranca.instante('2026-02-30T12:00:00Z'), null);
  assert.equal(seguranca.instante('2024-02-29T12:00:00Z').toISOString(), '2024-02-29T12:00:00.000Z');
});

test('R10-ATD-006: Retry-After expira junto com a janela', () => {
  let agora = 0;
  const limitador = seguranca.criarLimitador({ agora: () => agora });
  limitador.permitir('rota', 1, 1000);
  assert.equal(limitador.espera('rota'), 1);
  agora = 1000;
  assert.equal(limitador.espera('rota'), 0);
});
