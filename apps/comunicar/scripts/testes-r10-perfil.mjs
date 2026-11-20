import test from 'node:test';
import assert from 'node:assert/strict';
import { camposDoMeuPerfil } from '../acesso.js';

test('R10-COM-004: recusa nome de tipo diferente de texto', () => {
  assert.ok(camposDoMeuPerfil({ nome: ['Ana', 'Silva'] }).erro);
  assert.equal(camposDoMeuPerfil({ nome: ' Ana Silva ' }).campos.nome, 'Ana Silva');
});

test('R10-COM-005: recusa cargo de tipo diferente de texto', () => {
  assert.ok(camposDoMeuPerfil({ cargo: { nome: 'Gerente' } }).erro);
  assert.equal(camposDoMeuPerfil({ cargo: null }).campos.cargo, null);
});

test('R10-COM-006: recusa telefone de tipo diferente de texto', () => {
  assert.ok(camposDoMeuPerfil({ telefone: ['12912345678'] }).erro);
  assert.equal(camposDoMeuPerfil({ telefone: '(12) 91234-5678' }).campos.telefone, '12912345678');
});

test('R10-COM-007: recusa cor de tipo diferente de texto', () => {
  assert.ok(camposDoMeuPerfil({ avatar_cor: ['#123456'] }).erro);
  assert.equal(camposDoMeuPerfil({ avatar_cor: '#123456' }).campos.avatar_cor, '#123456');
});

test('R10-COM-008: recusa preferências que não estejam em um objeto', () => {
  assert.ok(camposDoMeuPerfil({ preferencias: [] }).erro);
  assert.deepEqual(camposDoMeuPerfil({ preferencias: { notificacoes: { falhas: false } } }).campos.preferencias,
    { notificacoes: { falhas: false } });
});
