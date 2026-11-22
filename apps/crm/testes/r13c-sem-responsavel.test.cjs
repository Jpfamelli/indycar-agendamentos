'use strict';
/* R13C — "contatos sem responsável" com a mesma regra da Casa: etapa em aberto e ninguém cuidando, de qualquer data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../public/crm-utils.js');

test('semResponsavelAberto: só em aberto e sem dono', () => {
  assert.equal(U.semResponsavelAberto({ status: 'novo', responsavel_id: null }), true);
  assert.equal(U.semResponsavelAberto({ status: 'em_servico' }), true);
  assert.equal(U.semResponsavelAberto({ status: 'concluido', responsavel_id: null }), false);
  assert.equal(U.semResponsavelAberto({ status: 'perdido', responsavel_id: null }), false);
  assert.equal(U.semResponsavelAberto({ status: 'novo', responsavel_id: 'x' }), false);
  assert.equal(U.semResponsavelAberto(null), false);
});

test('filtroEtapa: "abertos" é o grupo; vazio é tudo; o resto é a etapa', () => {
  const st = U.ETAPAS.map(status => ({ status }));
  assert.deepEqual(st.filter(l => U.filtroEtapa(l, 'abertos')).map(l => l.status), U.ABERTAS);
  assert.equal(st.filter(l => U.filtroEtapa(l, '')).length, U.ETAPAS.length);
  assert.deepEqual(st.filter(l => U.filtroEtapa(l, 'perdido')).map(l => l.status), ['perdido']);
});
