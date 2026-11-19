'use strict';
/* Rodada 8 (frente T2a) — relatórios da tela nova (motor/relatorios.js): texto para WhatsApp pelo núcleo quando há gasto
   e pelo lado da oficina quando não há (a situação de hoje), folha do mês e modo apresentação. Banco de mentira, sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');

const R = require('../motor/relatorios');
const T = require('../motor/texto');
const D = require('./apoio/trafego-dados');

const q = (s = '') => new URLSearchParams(s);
const limpo = r => { assert.deepEqual(T.naoFinitos(r), []); assert.deepEqual(T.textosRuins(r), []); };

/** Gasto real de 01/10 a 18/11 (R$ 40 por dia) e uma linha de demonstração que não pode entrar. */
function metricas48() {
  const linhas = [];
  for (let d = 0; d < 49; d++) {
    const data = new Date(Date.parse('2026-10-01T12:00:00Z') + d * 86400000).toISOString().slice(0, 10);
    linhas.push(D.metrica(`m${d}`, { data, campanha_ext: '1202', gasto: 40, conversoes: 2 }));
  }
  linhas.push(D.metrica('demo', { data: '2026-10-05', fonte: 'demo', gasto: 7777 }));
  return linhas;
}

test('janelas: diário é ontem, semanal os 7 dias até ontem, mensal o mês passado (ou o pedido); tipo ruim é 400', () => {
  assert.deepEqual(R.janelaDoTexto(q('tipo=diario'), '2026-11-19'), { tipo: 'diario', de: '2026-11-18', ate: '2026-11-18', titulo: 'Relatório de ontem (qua, 18/11)' });
  const s = R.janelaDoTexto(q('tipo=semanal'), '2026-11-19');
  assert.deepEqual([s.de, s.ate, s.titulo], ['2026-11-12', '2026-11-18', 'Relatório da semana (12/11 a 18/11)']);
  const m = R.janelaDoTexto(q('tipo=mensal'), '2026-11-19');
  assert.deepEqual([m.de, m.ate, m.titulo], ['2026-10-01', '2026-10-31', 'Relatório de outubro de 2026']);
  const atual = R.janelaDoTexto(q('tipo=mensal&mes=2026-11'), '2026-11-19');
  assert.deepEqual([atual.ate, atual.titulo], ['2026-11-19', 'Relatório de novembro de 2026 (até agora)']);
  assert.throws(() => R.janelaDoTexto(q('tipo=anual'), '2026-11-19'), e => e.status === 400);
  assert.throws(() => R.janelaDoTexto(q('tipo=mensal&mes=2026-12'), '2026-11-19'), e => e.status === 400);
  assert.deepEqual(R.periodoDoMes({ mes: '2026-10', de: '2026-10-01', ate: '2026-10-31', rotulo: 'outubro de 2026', fechado: true }).anterior, { de: '2026-09-01', ate: '2026-09-30' });
});

test('sem conta (a situação de hoje): o texto é do lado da oficina, sem gasto inventado e com o aviso do WhatsApp', async () => {
  const { fonte } = D.fonteDeTeste();
  const r = await D.calado(() => R.responderTexto({ q: q('tipo=mensal&mes=2026-11'), fonte }));
  limpo(r);
  assert.equal(r.motor, 'oficina');
  assert.equal(r.estado.gasto, 'sem_conta');
  assert.equal(r.titulo, 'Relatório de novembro de 2026 (até agora)');
  assert.match(r.texto, /^\*IndyCar · Relatório de novembro de 2026 \(até agora\)\*/);
  assert.match(r.texto, /• 5 contatos novos, 3 de anúncio/, 'até ontem: o contato de hoje fica para amanhã');
  assert.match(r.texto, /• 2 serviços fechados, R\$ 420 faturados \(falta o valor de 1 serviço\)/);
  assert.match(r.texto, /o motivo que mais aparece: achou caro/);
  assert.match(r.texto, /A conta de anúncios não está ligada/);
  assert.match(r.texto, /não estão saindo desde 30\/09/);
  assert.doesNotMatch(r.texto, /Investido|R\$ 0\b/);
});

test('com gasto real: o texto é o do núcleo, sem demonstração e nas palavras da casa', async () => {
  const { fonte } = D.fonteDeTeste({ tabelas: D.tabelasDeHoje({ ads_metricas_dia: metricas48() }) });
  for (const tipo of ['diario', 'semanal', 'mensal']) {
    const r = await D.calado(() => R.responderTexto({ q: q(`tipo=${tipo}`), fonte }));
    limpo(r);
    assert.equal(r.motor, 'nucleo', tipo);
    assert.equal(r.estado.gasto, 'real');
    assert.doesNotMatch(r.texto, /—|7\.777|CPA|ROAS/, tipo);
    assert.match(r.texto, /IndyCar/);
  }
  const mensal = await D.calado(() => R.responderTexto({ q: q('tipo=mensal'), fonte }));
  assert.match(mensal.texto, /R\$ 1\.240/, 'outubro: 31 dias × R$ 40');
});

test('só demonstração: o texto avisa que os números são de demonstração', async () => {
  const demo = metricas48().map(l => ({ ...l, fonte: 'demo' }));
  const { fonte } = D.fonteDeTeste({ tabelas: D.tabelasDeHoje({ ads_metricas_dia: demo }) });
  const r = await D.calado(() => R.responderTexto({ q: q('tipo=semanal'), fonte }));
  limpo(r);
  assert.equal(r.estado.demo, true);
  assert.match(r.texto, /^Números de demonstração/);
});

test('folha do mês e modo apresentação: mesmas contas de /api/hoje e /api/campanhas', async () => {
  const { fonte, sb } = D.fonteDeTeste({ tabelas: D.tabelasDeHoje({ ads_metricas_dia: metricas48() }) });
  const folha = await D.calado(() => R.responderFolha({ q: q('mes=2026-10'), fonte }));
  limpo(folha);
  assert.deepEqual(folha.mes, { mes: '2026-10', de: '2026-10-01', ate: '2026-10-31', rotulo: 'outubro de 2026', fechado: true });
  assert.deepEqual(folha.periodo.anterior, { de: '2026-09-01', ate: '2026-09-30' });
  assert.equal(folha.numeros[0].valor, 1240);
  assert.equal(folha.numeros.length, 4);
  assert.ok(Array.isArray(folha.campanhas) && folha.campanhas.every(c => !('serie' in c)));
  assert.equal(typeof folha.texto, 'string');
  assert.ok(folha.horarios && 'pico' in folha.horarios);
  assert.throws(() => R.responderFolha({ q: q('mes=11-2026'), fonte }), e => e.status === 400);

  const antes = sb.idas();
  const ap = await D.calado(() => R.responderApresentacao({ q: q(), fonte }));
  limpo(ap);
  assert.deepEqual(ap.telas.map(t => t.id), ['resumo', 'numeros', 'funil', 'origens', 'campanhas', 'proximos']);
  assert.equal(ap.telas[2].etapas.length, 4);
  assert.ok(ap.telas.find(t => t.id === 'proximos').itens.length <= 6);
  assert.ok(sb.idas() - antes <= 14, 'a apresentação reaproveita as leituras de /api/hoje e /api/campanhas');
});
