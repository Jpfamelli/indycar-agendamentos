'use strict';
/* Rodada 8 (frente T2a) — as somas das rotas novas (motor/soma.js) batem com as da tela Jornada (jornada.js, frente T2b),
   e o ritmo do mês (motor/ritmo.js) não inventa gasto nem situação. Puro, sem banco. */
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../motor/soma');
const Ritmo = require('../motor/ritmo');
const Jornada = require('../jornada');
const D = require('./apoio/trafego-dados');

function variados() {
  const canais = ['meta', 'google', 'site', 'indicacao', 'desconhecida'];
  const etapas = [['contato'], ['contato', 'respondido'], ['contato', 'respondido', 'orcamento'], ['contato', 'respondido', 'agendou', 'veio'], ['contato', 'respondido', 'agendou', 'veio', 'oficina', 'fechou']];
  const lista = [];
  for (let n = 0; n < 60; n++) {
    const e = etapas[n % etapas.length], fechou = e.includes('fechou');
    lista.push(D.item(n, { canal: canais[n % canais.length], etapas: e, desfecho: fechou ? 'fechou' : (n % 4 === 0 ? 'nao_fechou' : 'aberto'),
      valor: fechou && n % 2 ? 200 + n : null, motivo: n % 8 === 0 ? 'caro' : (n % 12 === 0 ? 'prazo' : null), respostaDesconhecida: n % 17 === 0 && e.length === 1 }));
  }
  return lista;
}

test('funil e totais iguais aos da Jornada (mesma regra de etapa, de desconhecido e de valor)', () => {
  for (const itens of [variados(), D.contatosDeHoje(), [], variados().filter(i => !i.etapas.some(e => e.desconhecido))]) {
    assert.deepEqual(S.funil(itens), Jornada.funil(itens));
    const r = S.resumo(itens), t = Jornada.totais(itens);
    assert.deepEqual([r.contatos, r.com_orcamento, r.agendaram, r.vieram, r.fecharam, r.nao_fecharam, r.abertos, r.faturado, r.sem_valor],
      [t.contatos, t.com_orcamento, t.agendaram, t.vieram, t.fecharam, t.nao_fecharam, t.abertos, t.faturado, t.sem_valor]);
  }
});

test('resumo: faturado null quando fechou e nenhum tem valor; 0 quando ninguém fechou', () => {
  assert.equal(S.resumo([D.item(1, { desfecho: 'fechou', etapas: ['contato', 'fechou'] })]).faturado, null);
  assert.equal(S.resumo([D.item(1)]).faturado, 0);
  assert.equal(S.resumo([D.item(1, { desfecho: 'fechou', valor: 100.555, etapas: ['contato', 'fechou'] })]).faturado, 100.56);
});

test('tempo de resposta e taxa de falta: null quando não há base', () => {
  assert.equal(S.tempoDeResposta([D.item(1, { etapas: ['contato', 'respondido'] })]), null, 'respondido sem minutos não conta');
  assert.equal(S.tempoDeResposta([10, 20, 40].map((m, n) => D.item(n, { etapas: ['contato', 'respondido'], minutos: m }))), 20);
  assert.equal(S.taxaDeFalta([D.item(1)], D.AGORA), null);
  const faltou = D.item(2, { etapas: ['contato', 'agendou'], agendadoPara: '2026-11-18T09:00:00-03:00' });
  const veio = D.item(3, { etapas: ['contato', 'agendou', 'veio'], agendadoPara: '2026-11-18T10:00:00-03:00' });
  const futuro = D.item(4, { etapas: ['contato', 'agendou'], agendadoPara: '2026-11-25T10:00:00-03:00' });
  assert.equal(S.taxaDeFalta([faltou, veio, futuro], D.AGORA), 0.5);
});

test('estado do gasto: real, demo, sem_dados (conta ligada ou já houve número) e sem_conta', () => {
  assert.equal(S.estadoDoGasto('real'), 'real');
  assert.equal(S.estadoDoGasto('demo'), 'demo');
  assert.equal(S.estadoDoGasto('vazio', { haReal: true }), 'sem_dados');
  assert.equal(S.estadoDoGasto('vazio', { conexoes: { meta: { ligado: true } } }), 'sem_dados');
  assert.equal(S.estadoDoGasto('vazio', { conexoes: { meta: { ligado: false }, google: { ligado: false } } }), 'sem_conta');
  assert.equal(S.variar(10, 0), null);
  assert.equal(S.variar(0, 0), 0);
  assert.equal(S.variar(null, 3), null);
});

test('ritmo: sem conta não há gasto nem situação; com orçamento a situação segue o gasto', () => {
  const sem = Ritmo.ritmoDoMes({ hoje: '2026-11-19' });
  assert.deepEqual([sem.gasto_ate_hoje, sem.projecao, sem.situacao, sem.orcamento_mes], [null, null, 'sem_meta', null]);
  assert.match(sem.leitura, /conta de anúncios/);
  assert.equal(sem.dias.length, 19);

  const gasto = new Map(Array.from({ length: 18 }, (_, d) => [`2026-11-${String(d + 1).padStart(2, '0')}`, 100]));
  const acima = Ritmo.ritmoDoMes({ hoje: '2026-11-19', orcamento: 1500, gastoPorDia: gasto, ultimoDiaColetado: '2026-11-18' });
  assert.equal(acima.gasto_ate_hoje, 1800);
  assert.equal(acima.situacao, 'acima', 'já passou do orçamento');
  assert.equal(acima.dias[18].gasto, null, 'hoje ainda não foi coletado: null, não zero');
  const folga = Ritmo.ritmoDoMes({ hoje: '2026-11-19', orcamento: 9000, gastoPorDia: gasto, ultimoDiaColetado: '2026-11-18',
    nucleo: { gasto: 1800, pass: 18, restam: 12, proj: 3000, cedo: false, desde: 1, diasAbertosRestantes: 10 } });
  assert.deepEqual([folga.situacao, folga.projecao], ['abaixo', 3000]);
  assert.match(folga.leitura, /Dentro do orçamento/);
  assert.equal(Ritmo.diarioSugerido(1000, 1200, 5), 0);
  assert.equal(Ritmo.diarioSugerido(1000, 500, 0), null);
});
