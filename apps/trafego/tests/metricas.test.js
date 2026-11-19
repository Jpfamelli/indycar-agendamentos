'use strict';
/* Matemática de tráfego — se isto quebrar, painel, radar e relatório
   passam a discordar entre si. Roda com `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../metricas');

test('num: string do Postgres vira número; lixo vira 0', () => {
  assert.equal(M.num('12.50'), 12.5);
  assert.equal(M.num(3), 3);
  assert.equal(M.num(null), 0);
  assert.equal(M.num(undefined), 0);
  assert.equal(M.num('abc'), 0);
  assert.equal(M.num(Infinity), 0);
});

test('somar: soma as colunas e pondera a frequência por impressões', () => {
  const t = M.somar([
    { gasto: '10', impressoes: 1000, cliques: 10, conversoes: 1, valor_conversao: '50', frequencia: 2 },
    { gasto: 20, impressoes: 3000, cliques: 30, conversoes: 1, valor_conversao: 100, frequencia: 4 },
    { gasto: 5, impressoes: 500, cliques: 5, conversoes: 0, valor_conversao: 0, frequencia: 0 },   // sem alcance: fora da média
  ]);
  assert.equal(t.gasto, 35);
  assert.equal(t.impressoes, 4500);
  assert.equal(t.cliques, 45);
  assert.equal(t.conversoes, 2);
  assert.equal(t.valor_conversao, 150);
  assert.equal(t.frequencia, (2 * 1000 + 4 * 3000) / 4000);   // 3,5
});

test('somar de lista vazia ou nula é tudo zero', () => {
  for (const l of [[], null, undefined]) {
    const t = M.somar(l);
    assert.equal(t.gasto, 0); assert.equal(t.impressoes, 0); assert.equal(t.frequencia, 0);
  }
});

test('derivar: divisão por zero vira null, nunca Infinity ou NaN', () => {
  const d = M.derivar({ gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, valor_conversao: 0 });
  for (const k of ['ctr', 'cpc', 'cpm', 'cpa', 'roas', 'tx_conversao']) assert.equal(d[k], null, k);
  // Gastou e não converteu: CPA sem base (null), ROAS zero (0 / gasto).
  const g = M.derivar({ gasto: 100, impressoes: 0, cliques: 0, conversoes: 0, valor_conversao: 0 });
  assert.equal(g.cpa, null);
  assert.equal(g.roas, 0);
});

test('derivar: CPA, ROAS, CTR, CPM, CPC e taxa de conversão com base', () => {
  const d = M.derivar({ gasto: 200, impressoes: 10000, cliques: 200, conversoes: 4, valor_conversao: 800 });
  assert.equal(d.cpa, 50);
  assert.equal(d.roas, 4);
  assert.equal(d.ctr, 2);
  assert.equal(d.cpm, 20);
  assert.equal(d.cpc, 1);
  assert.equal(d.tx_conversao, 2);
});

test('consolidar = somar + derivar, inclusive sobre lista vazia', () => {
  const d = M.consolidar([]);
  assert.equal(d.gasto, 0);
  assert.equal(d.cpa, null);
  const e = M.consolidar([{ gasto: '50', conversoes: '2', impressoes: 1000, cliques: 20, valor_conversao: 300 }]);
  assert.equal(e.cpa, 25);
  assert.equal(e.roas, 6);
});

test('lucro: receita × margem − mídia; margem padrão 100%', () => {
  assert.equal(M.lucro({ valor_conversao: 1000, gasto: 300 }, 40), 100);
  assert.equal(M.lucro({ valor_conversao: '1000', gasto: '300' }), 700);
  assert.equal(M.lucro({ valor_conversao: 0, gasto: 120 }), -120);
});

test('variacao: sem base devolve null; de 0 para 0 é 0', () => {
  assert.equal(M.variacao(10, 0), null);
  assert.equal(M.variacao(0, 0), 0);
  assert.equal(M.variacao(150, 100), 50);
  assert.equal(M.variacao(50, 100), -50);
  assert.equal(M.variacao('120', '100'), 20);
});

test('formatar: pt-BR por tipo de métrica e travessão para null', () => {
  assert.equal(M.formatar('ctr', 1.234), '1,23%');
  assert.equal(M.formatar('roas', 3), '3,00x');
  assert.equal(M.formatar('frequencia', 2.5), '2,50');
  assert.equal(M.formatar('impressoes', 1234.6), '1.235');
  assert.equal(M.formatar('cpa', null), '—');
  assert.ok(M.formatar('gasto', 1234.5).endsWith('1.234,50'));
  assert.ok(M.formatar('gasto', 1234.5).startsWith('R$'));
});

test('SENTIDO e ROTULO cobrem as mesmas métricas', () => {
  for (const k of Object.keys(M.ROTULO)) assert.ok(M.SENTIDO[k], `falta sentido de ${k}`);
});
