'use strict';
/* Rodada 8 (frente T2a) — período das rotas novas (contrato da API, regras gerais):
   ?periodo=hoje|7d|30d|mes|mes_passado (padrão: mes) ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD,
   sempre no dia de Brasília, com o rótulo pronto e o período anterior para comparar. */
const test = require('node:test');
const assert = require('node:assert/strict');

const P = require('../motor/periodo');

const q = texto => new URLSearchParams(texto);
const HOJE = '2026-11-19';

test('hojeBR e diaBR: o dia é o de Brasília, não o do servidor', () => {
  // 02h30 de 19/11 em UTC ainda é 23h30 de 18/11 em Brasília
  assert.equal(P.hojeBR(Date.parse('2026-11-19T02:30:00Z')), '2026-11-18');
  assert.equal(P.diaBR('2026-11-19T02:30:00Z'), '2026-11-18');
  assert.equal(P.diaBR('2026-11-19T09:41:00-03:00'), '2026-11-19');
  assert.equal(P.diaBR('2026-11-19'), '2026-11-19', 'data pura fica como está');
  assert.equal(P.diaBR(null), null);
  assert.equal(P.diaBR('lixo'), null);
  assert.equal(P.horaBR('2026-11-19T12:41:00Z'), '09:41');
  assert.equal(P.horaBR('lixo'), null);
});

test('padrão é "Este mês": do dia 1 até hoje, comparado com os mesmos dias do mês anterior', () => {
  const p = P.periodoDaConsulta(q(''), { hoje: HOJE });
  assert.deepEqual(p, { de: '2026-11-01', ate: '2026-11-19', rotulo: 'Este mês', anterior: { de: '2026-10-01', ate: '2026-10-19' }, chave: 'mes' });
  assert.deepEqual(P.periodoDaConsulta(q('periodo=mes'), { hoje: HOJE }), p);
});

test('"Este mês" no dia 31 compara com o mês anterior inteiro quando ele é mais curto', () => {
  const p = P.periodoDaConsulta(q('periodo=mes'), { hoje: '2026-03-31' });
  assert.deepEqual(p.anterior, { de: '2026-02-01', ate: '2026-02-28' });
  const jan = P.periodoDaConsulta(q('periodo=mes'), { hoje: '2027-01-05' });
  assert.deepEqual([jan.de, jan.ate, jan.anterior.de, jan.anterior.ate], ['2027-01-01', '2027-01-05', '2026-12-01', '2026-12-05']);
});

test('hoje, 7 dias e 30 dias incluem o dia de hoje; o anterior é o trecho de mesmo tamanho logo antes', () => {
  assert.deepEqual(P.periodoDaConsulta(q('periodo=hoje'), { hoje: HOJE }), { de: HOJE, ate: HOJE, rotulo: 'Hoje', anterior: { de: '2026-11-18', ate: '2026-11-18' }, chave: 'hoje' });
  const s = P.periodoDaConsulta(q('periodo=7d'), { hoje: HOJE });
  assert.deepEqual([s.de, s.ate, s.rotulo, s.anterior.de, s.anterior.ate], ['2026-11-13', '2026-11-19', 'Últimos 7 dias', '2026-11-06', '2026-11-12']);
  const t = P.periodoDaConsulta(q('periodo=30d'), { hoje: HOJE });
  assert.deepEqual([t.de, t.ate, t.rotulo, t.anterior.de, t.anterior.ate], ['2026-10-21', '2026-11-19', 'Últimos 30 dias', '2026-09-21', '2026-10-20']);
});

test('mês passado: o mês inteiro, comparado com o mês antes dele', () => {
  const p = P.periodoDaConsulta(q('periodo=mes_passado'), { hoje: HOJE });
  assert.deepEqual(p, { de: '2026-10-01', ate: '2026-10-31', rotulo: 'Mês passado', anterior: { de: '2026-09-01', ate: '2026-09-30' }, chave: 'mes_passado' });
  const virada = P.periodoDaConsulta(q('periodo=mes_passado'), { hoje: '2027-01-10' });
  assert.deepEqual([virada.de, virada.ate], ['2026-12-01', '2026-12-31']);
});

test('datas à mão: rótulo com as datas e anterior de mesmo tamanho; de/ate vencem o parâmetro periodo', () => {
  const p = P.periodoDaConsulta(q('de=2026-11-03&ate=2026-11-09&periodo=30d'), { hoje: HOJE });
  assert.deepEqual(p, { de: '2026-11-03', ate: '2026-11-09', rotulo: '03/11 a 09/11', anterior: { de: '2026-10-27', ate: '2026-11-02' }, chave: 'datas' });
  assert.equal(P.periodoDaConsulta(q('de=2026-11-09&ate=2026-11-09'), { hoje: HOJE }).rotulo, '09/11');
  assert.equal(P.periodoDaConsulta(q('de=2025-12-20&ate=2026-01-05'), { hoje: HOJE }).rotulo, '20/12/2025 a 05/01/2026', 'anos diferentes aparecem');
});

test('entrada ruim é recusada com 400 e frase de gente (nada de adivinhar o período)', () => {
  const ruins = ['periodo=ano', 'periodo=7D', 'de=2026-11-01', 'ate=2026-11-01', 'de=2026-13-01&ate=2026-13-02', 'de=2026-02-30&ate=2026-03-01',
    'de=2026-11-10&ate=2026-11-01', 'de=01/11/2026&ate=19/11/2026', 'de=2025-01-01&ate=2026-11-19'];
  for (const r of ruins) {
    assert.throws(() => P.periodoDaConsulta(q(r), { hoje: HOJE }), e => e.status === 400 && e.publico === true && /^(Informe|Escolha)/.test(e.message), r);
  }
  assert.equal(P.periodoDaConsulta(q('periodo='), { hoje: HOJE }).chave, 'mes', 'parâmetro vazio é o mesmo que não mandar');
});

test('dias do período, soma de dias e mês da consulta', () => {
  assert.deepEqual(P.diasEntre('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(P.contarDias('2026-11-01', '2026-11-19'), 19);
  assert.equal(P.somarDias('2026-02-28', 1), '2026-03-01');
  assert.equal(P.somarDias('2028-02-28', 1), '2028-02-29');
  assert.equal(P.somarDias('2026-01-01', -1), '2025-12-31');
  assert.deepEqual(P.mesDaConsulta(q('mes=2026-10'), { hoje: HOJE }), { mes: '2026-10', de: '2026-10-01', ate: '2026-10-31', rotulo: 'outubro de 2026', fechado: true });
  assert.deepEqual(P.mesDaConsulta(q(''), { hoje: HOJE }), { mes: '2026-11', de: '2026-11-01', ate: '2026-11-19', rotulo: 'novembro de 2026', fechado: false });
  assert.throws(() => P.mesDaConsulta(q('mes=2026-13'), { hoje: HOJE }), e => e.status === 400);
  assert.throws(() => P.mesDaConsulta(q('mes=2027-01'), { hoje: HOJE }), e => e.status === 400, 'mês que ainda não começou');
});

test('rótulo curto do dia para a agenda: "sex 20"', () => {
  assert.equal(P.rotuloDoDia('2026-11-20'), 'sex 20');
  assert.equal(P.rotuloDoDia('2026-11-21'), 'sáb 21');
  assert.equal(P.diaDaSemana('2026-11-22'), 0, 'domingo');
});
