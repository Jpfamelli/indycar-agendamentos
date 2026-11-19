import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFiltroFechamentoDoDia } from '../dados.js';

test('fechamento inclui horários de ontem e anteriores, com os mesmos filtros na lista e no contador', () => {
  const filtro = new URLSearchParams(lerFiltroFechamentoDoDia('2026-11-19'));
  assert.equal(filtro.get('data'), 'lt.2026-11-19');
  assert.equal(filtro.get('status'), 'in.(compareceu,em_atendimento,aguardando,confirmado)');
});
