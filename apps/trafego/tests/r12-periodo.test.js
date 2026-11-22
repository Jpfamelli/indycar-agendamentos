// Rodada 12: a tela nova do Tráfego tem o filtro 7 / 30 / 60 dias (como o Nexus Ads). O servidor aceita "60d".
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../motor/periodo');

const HOJE = '2026-11-19';
const q = (t) => new URLSearchParams(t);

test('periodo=60d: os últimos 60 dias até hoje, comparando com os 60 dias de antes', () => {
  const p = P.periodoDaConsulta(q('periodo=60d'), { hoje: HOJE });
  assert.deepEqual(p, { de: '2026-09-21', ate: HOJE, rotulo: 'Últimos 60 dias', anterior: { de: '2026-07-23', ate: '2026-09-20' }, chave: '60d' });
});

test('período desconhecido continua recusado, e a frase cita o 60d', () => {
  assert.throws(() => P.periodoDaConsulta(q('periodo=90d'), { hoje: HOJE }), /60d/);
});
