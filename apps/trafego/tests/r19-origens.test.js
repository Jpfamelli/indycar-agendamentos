'use strict';
/* Rodada 19: /api/hoje diz, por origem, quantos marcaram horário, vieram, não fecharam e seguem abertos
   (a tela sem conta de anúncios mostra onde cada origem se perde). Campos a mais; os de antes não mudam. Sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');

const Hoje = require('../motor/hoje');
const D = require('./apoio/trafego-dados');

const q = (s = '') => new URLSearchParams(s);

test('origens: cada linha traz agendaram, vieram, nao_fecharam e abertos, e a soma fecha com o funil do período', async () => {
  const { fonte } = D.fonteDeTeste();
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  assert.equal(r.estado.gasto, 'sem_conta');
  assert.ok(r.origens.length >= 2);
  for (const o of r.origens) {
    for (const k of ['contatos', 'agendaram', 'vieram', 'fecharam', 'nao_fecharam', 'abertos']) assert.ok(Number.isInteger(o[k]) && o[k] >= 0, `${o.id}.${k}`);
    assert.equal(o.fecharam + o.nao_fecharam + o.abertos, o.contatos, `${o.id}: todo contato fechou, não fechou ou segue aberto`);
    assert.ok(o.agendaram <= o.contatos && o.vieram <= o.contatos);
    for (const k of ['id', 'rotulo', 'paga', 'faturado', 'gasto', 'custo_por_contato', 'retorno']) assert.ok(k in o, `${o.id}: ${k} continua na linha`);
  }
  const soma = k => r.origens.reduce((s, o) => s + o[k], 0);
  const etapa = id => r.funil.etapas.find(e => e.id === id).total;
  assert.equal(soma('contatos'), etapa('contato'));
  assert.equal(soma('agendaram'), etapa('agendou'));
  assert.equal(soma('vieram'), etapa('veio'));
  assert.equal(soma('fecharam'), etapa('fechou'));
  assert.equal(soma('nao_fecharam'), r.funil.nao_fecharam.total);
});
