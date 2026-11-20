/* Lógica da tela Hoje (rodada 9). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { faltaLigar } from '../js/hoje-logica.js';

const tudoOk = { meta: { situacao: 'ok' }, google: { situacao: 'ok' }, site: { rastreio: true }, whatsapp: { situacao: 'ok' } };

test('faltaLigar: com tudo funcionando o link da Hoje vira "Ver as conexões"', () => {
  assert.equal(faltaLigar(tudoOk), false);
});

test('faltaLigar: qualquer conexão parada, sem conta, sem rastreio ou com WhatsApp parado pede ligar', () => {
  assert.equal(faltaLigar({ ...tudoOk, meta: { situacao: 'nunca_ligou' } }), true);
  assert.equal(faltaLigar({ ...tudoOk, google: { situacao: 'token_vencendo' } }), true);
  assert.equal(faltaLigar({ ...tudoOk, meta: { situacao: 'ok', parada: true } }), true, 'busca parada também pede ação');
  assert.equal(faltaLigar({ ...tudoOk, site: { rastreio: false } }), true);
  assert.equal(faltaLigar({ ...tudoOk, whatsapp: { situacao: 'chave_recusada' } }), true);
  assert.equal(faltaLigar({ ...tudoOk, google: undefined }), true);
  assert.equal(faltaLigar(null), true);
});

import { seloDoRitmo } from '../js/hoje-logica.js';
test('seloDoRitmo: "acima" diz se já passou ou se vai passar da verba; "abaixo" diz que vai sobrar', () => {
  assert.deepEqual(seloDoRitmo({ situacao: 'acima', gasto_ate_hoje: 2341, orcamento_mes: 3000 }), ['atencao', 'Vai passar da verba']);
  assert.deepEqual(seloDoRitmo({ situacao: 'acima', gasto_ate_hoje: 3010, orcamento_mes: 3000 }), ['atencao', 'Passou da verba']);
  assert.deepEqual(seloDoRitmo({ situacao: 'no_ritmo' }), ['bom', 'No ritmo da verba']);
  assert.deepEqual(seloDoRitmo({ situacao: 'abaixo' }), ['espera', 'Vai sobrar verba']);
  assert.equal(seloDoRitmo({ situacao: 'sem_meta' }), null);
  assert.equal(seloDoRitmo(null), null);
});

import { textoDaPassagem } from '../js/hoje-logica.js';
test('textoDaPassagem: diz por que não há porcentagem, em vez de "passagem sem dado" para tudo', () => {
  const pct = (v) => Math.round(v * 100) + '%';
  assert.equal(textoDaPassagem({ total: 2, passagem: 0.333 }, { total: 6 }, pct), '33% da etapa anterior');
  assert.equal(textoDaPassagem({ total: 0, passagem: null }, { total: 0 }, pct), 'ninguém na etapa anterior');
  assert.equal(textoDaPassagem({ total: 5, passagem: null }, { total: 3 }, pct), 'inclui quem pulou etapa');
  assert.equal(textoDaPassagem({ total: null, passagem: null }, { total: 4 }, pct), null, 'o total desta etapa já diz "sem dado"');
  assert.equal(textoDaPassagem({ total: 3, passagem: null }, { total: null }, pct), 'sem dado da etapa anterior');
  for (const t of ['ninguém na etapa anterior', 'inclui quem pulou etapa', 'sem dado da etapa anterior']) assert.doesNotMatch(t, /passagem/);
});

import { seloDasConexoes } from '../js/hoje-logica.js';
test('seloDasConexoes: o item "Conexões" dos Ajustes diz se falta passo, se algo pede atenção ou se está tudo ligado', () => {
  const ok = { meta: { situacao: 'ok' }, google: { situacao: 'ok' }, site: { rastreio: true }, whatsapp: { situacao: 'ok' } };
  assert.deepEqual(seloDasConexoes({ ...ok, faltam: 2 }), ['atencao', 'Faltam 2 passos']);
  assert.deepEqual(seloDasConexoes({ ...ok, faltam: 1 }), ['atencao', 'Falta 1 passo']);
  assert.deepEqual(seloDasConexoes({ ...ok, faltam: 0, google: { situacao: 'token_vencendo' } }), ['atencao', 'Pede atenção']);
  assert.deepEqual(seloDasConexoes({ ...ok, faltam: 0 }), ['bom', 'Tudo ligado']);
  assert.equal(seloDasConexoes(null), null);
  assert.equal(seloDasConexoes({ ...ok }), null, 'sem a contagem de passos não afirma "Tudo ligado"');
});
