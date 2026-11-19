'use strict';
/* Piloto automático: a decisão de mandar o relatório diário. Desde
   15/09/2026 o padrão é NÃO enviar — só sai com relatorio_ativo = true
   gravado, destino cadastrado e hora chegada. */
const test = require('node:test');
const assert = require('node:assert/strict');
const agenda = require('../agenda');

const ligado = { relatorio_ativo: true, relatorio_hora: 8, whatsapp_destinos: ['5512999990000'] };

test('sem config carregada não envia', () => {
  const d = agenda.decidirRelatorio(null, 12);
  assert.equal(d.enviar, false);
  assert.ok(d.motivo.includes('não carregou'));
  assert.equal(agenda.decidirRelatorio(undefined, 12).enviar, false);
});

test('desligado em Ajustes não envia, mesmo com destino e hora', () => {
  const d = agenda.decidirRelatorio({ ...ligado, relatorio_ativo: false }, 12);
  assert.equal(d.enviar, false);
  assert.ok(d.motivo.includes('desligado'));
});

test('relatorio_ativo precisa ser true de verdade: null, undefined, "true" e 1 não valem', () => {
  for (const v of [null, undefined, 'true', 1, 'sim']) {
    assert.equal(agenda.decidirRelatorio({ ...ligado, relatorio_ativo: v }, 12).enviar, false, String(v));
  }
});

test('ligado sem destinos não envia e diz o porquê', () => {
  for (const destinos of [[], undefined, null]) {
    const d = agenda.decidirRelatorio({ ...ligado, whatsapp_destinos: destinos }, 12);
    assert.equal(d.enviar, false);
    assert.ok(d.motivo.includes('número'));
  }
});

test('ligado com destino antes da hora espera; na hora (ou depois) envia', () => {
  assert.equal(agenda.decidirRelatorio(ligado, 7).enviar, false);
  assert.ok(agenda.decidirRelatorio(ligado, 7).motivo.includes('8h'));
  assert.equal(agenda.decidirRelatorio(ligado, 8).enviar, true);
  assert.equal(agenda.decidirRelatorio(ligado, 8).motivo, null);
  assert.equal(agenda.decidirRelatorio(ligado, 23).enviar, true);
  assert.equal(agenda.decidirRelatorio({ ...ligado, relatorio_hora: undefined }, 8).enviar, true);   // padrão 8h
  assert.equal(agenda.decidirRelatorio({ ...ligado, relatorio_hora: 10 }, 9).enviar, false);
});

test('dataLocal devolve YYYY-MM-DD e horaLocal um inteiro de 0 a 23', () => {
  assert.match(agenda.dataLocal(), /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  assert.match(agenda.dataLocal(-1), /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  const h = agenda.horaLocal();
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 23);
});

test('estado começa com o piloto desligado e sem erros', () => {
  assert.equal(agenda.estado.ligado, false);
  assert.deepEqual(agenda.estado.erros, []);
});
