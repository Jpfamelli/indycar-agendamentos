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
