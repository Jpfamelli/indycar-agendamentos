import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarProntidao } from '../prontidao.js';

const agora = Date.parse('2026-11-20T12:00:00Z');
const futuro = new Date(agora + 1000).toISOString();
const passado = new Date(agora - 1000).toISOString();
const estado = (id, fatos) => montarProntidao({ agora, ...fatos }).itens.find(item => item.id === id).estado;

test('R10-COM-002: teste de envio com data futura fica em aviso', () => {
  assert.equal(estado('teste', { teste: { ultimoOkEm: futuro } }), 'aviso');
  assert.equal(estado('teste', { teste: { ultimoOkEm: passado } }), 'ok');
});

test('R10-COM-003: rodada futura do carteiro fica em aviso', () => {
  const cfg = { carteiro_configurado: true };
  assert.equal(estado('carteiro', { cfg, carteiro: { ultimaEm: futuro } }), 'aviso');
  assert.equal(estado('carteiro', { cfg, carteiro: { ultimaEm: passado } }), 'ok');
});
