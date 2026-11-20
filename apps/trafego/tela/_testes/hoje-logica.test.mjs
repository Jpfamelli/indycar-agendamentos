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
