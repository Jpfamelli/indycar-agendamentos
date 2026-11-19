'use strict';
/* Rodada 8 (frente T2a) — peças puras do motor trazidas do Nexus Ads (rel-logica.js e anuncios.js):
   mapa de horários dos contatos e comparação entre o que a plataforma conta e o que a oficina recebeu. */
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('../motor/horarios');
const C = require('../motor/comparacao');
const T = require('../motor/texto');

const contato = (chegou, paga = null) => ({ lead_id: chegou, chegou_em: chegou, origem: { canal: paga ? 'meta' : 'desconhecida', paga } });
const varios = (n, chegou, paga = null) => Array.from({ length: n }, () => contato(chegou, paga));

test('matriz de horários: dia da semana × hora, pico com empate contado e faixas do dia', () => {
  const m = H.matrizCalor([{ dow: 2, hora: 8, qtd: 3 }, { dow: 2, hora: 8, qtd: 1 }, { dow: 5, hora: 19, qtd: 4 }, { dow: 9, hora: 8, qtd: 7 }, { dow: 1, hora: 30, qtd: 7 }]);
  assert.equal(m.length, 7);
  assert.equal(m[2][8], 4);
  assert.deepEqual(H.picoCalor(m), { dow: 2, hora: 8, qtd: 4, empates: 1 }, 'terça 8h e sexta 19h empatam: o pico diz que há empate');
  assert.equal(H.picoCalor(H.matrizCalor([])), null);
  const f = H.faixasCalor(m);
  assert.equal(f.total, 8);
  assert.deepEqual(f.faixas.map(x => [x.nome, x.total]), [['madrugada', 0], ['manhã', 4], ['tarde', 0], ['noite', 4]]);
});

test('horários dos contatos no formato do contrato: segunda primeiro, hora de Brasília e o pico pronto', () => {
  const h = H.horariosDosContatos([
    ...varios(3, '2026-11-17T08:15:00-03:00'),            // terça 8h
    contato('2026-11-18T14:00:00-03:00'),                 // quarta 14h
    contato('2026-11-18T02:30:00Z'),                      // terça 23h30 em Brasília
    contato('data ruim'), contato(null),
  ]);
  assert.deepEqual(h.dias, ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
  assert.deepEqual(h.horas, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], 'a grade cresce para caber o contato das 23h');
  assert.equal(h.celulas.length, 7);
  assert.ok(h.celulas.every(l => l.length === h.horas.length));
  assert.equal(h.celulas[1][h.horas.indexOf(8)], 3);
  assert.equal(h.celulas[2][h.horas.indexOf(14)], 1);
  assert.equal(h.celulas[1][h.horas.indexOf(23)], 1);
  assert.equal(h.pico, 'ter 08h');
  assert.equal(h.total, 5, 'contato sem data não entra');
  assert.equal(h.base, 'todos');
  assert.match(h.leitura, /poucos contatos/);
});

test('horários: sem contato nenhum a grade padrão vem zerada e a frase diz que não há o que mostrar', () => {
  const h = H.horariosDosContatos([]);
  assert.deepEqual(h.horas, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(h.pico, null);
  assert.equal(h.total, 0);
  assert.ok(h.celulas.flat().every(v => v === 0));
  assert.match(h.leitura, /Ainda não há contatos/);
});

test('horários: havendo contato de anúncio, o mapa é só deles; a leitura aponta a janela forte', () => {
  const h = H.horariosDosContatos([
    ...varios(14, '2026-11-17T09:10:00-03:00', true), ...varios(6, '2026-11-19T10:40:00-03:00', true),
    ...varios(4, '2026-11-18T16:00:00-03:00', true), ...varios(9, '2026-11-18T20:00:00-03:00', false),
  ]);
  assert.equal(h.base, 'anuncio');
  assert.equal(h.total, 24, 'os 9 contatos que não são de anúncio ficam fora do mapa');
  assert.equal(h.pico, 'ter 09h');
  assert.match(h.leitura, /^Das 9h às 13h chegam 83% dos contatos de anúncio/);
  assert.deepEqual(T.textosRuins(h), []);
});

test('sugestão de horário: janela de 4 horas, atravessa a meia-noite e cala quando nada se destaca', () => {
  const m = H.matrizCalor([{ dow: 1, hora: 22, qtd: 10 }, { dow: 1, hora: 23, qtd: 8 }, { dow: 2, hora: 0, qtd: 6 }, { dow: 3, hora: 14, qtd: 6 }]);
  assert.match(H.sugestaoHorarios(m), /^Das 22h às 2h chegam 80% dos contatos/);
  assert.match(H.sugestaoHorarios(H.matrizCalor([{ dow: 1, hora: 20, qtd: 30 }, { dow: 1, hora: 23, qtd: 5 }])), /^Das 20h à meia-noite chegam 100%/);
  assert.equal(H.sugestaoHorarios(H.matrizCalor([{ dow: 1, hora: 9, qtd: 19 }])), '', 'menos de 20 contatos: cedo para sugerir');
  const espalhado = H.matrizCalor(Array.from({ length: 24 }, (_, hh) => ({ dow: 1, hora: hh, qtd: 2 })));
  assert.equal(H.sugestaoHorarios(espalhado), '', 'contatos espalhados pelo dia inteiro: nenhuma janela se destaca');
});

test('nível do custo por contato contra a meta: sem meta ou com pouco gasto não há cor', () => {
  assert.equal(C.nivelCusto(50, null), 'neutro', 'sem meta definida');
  assert.equal(C.nivelCusto(50, 0), 'neutro');
  assert.equal(C.nivelCusto(500, 90, 12), 'neutro', 'gastou menos que o mínimo: cedo para julgar');
  assert.equal(C.nivelCusto(80, 90, 300), 'bom');
  assert.equal(C.nivelCusto(90, 90, 300), 'bom');
  assert.equal(C.nivelCusto(120, 90, 300), 'atencao', 'até 35% acima da meta');
  assert.equal(C.nivelCusto(130, 90, 300), 'ruim');
  assert.equal(C.nivelCusto(null, 90, 300), 'ruim', 'gastou de verdade e não trouxe contato');
  assert.equal(C.nivelCusto(null, 90), 'neutro', 'sem saber o gasto, sem contato é neutro');
  assert.equal(C.gastoMinimoParaJulgar(0), 20);
  assert.equal(C.gastoMinimoParaJulgar(63.4), 63);
  assert.equal(C.gastoMinimoParaJulgar(2), 5);
  assert.equal(C.gastoMinimoParaJulgar(9000), 500);
});

test('situação da campanha: o que a plataforma diz vence; sem isso, 3 dias sem gasto é pausa', () => {
  const hoje = '2026-11-19';
  assert.equal(C.situacaoDaCampanha({ status: 'ACTIVE', ultimoGasto: '2026-11-01', hoje }), 'ativa');
  assert.equal(C.situacaoDaCampanha({ status: 'enabled', ultimoGasto: null, hoje }), 'ativa');
  assert.equal(C.situacaoDaCampanha({ status: 'PAUSED', ultimoGasto: '2026-11-18', hoje }), 'pausada');
  assert.equal(C.situacaoDaCampanha({ status: 'CAMPAIGN_PAUSED', hoje }), 'pausada');
  assert.equal(C.situacaoDaCampanha({ status: 'ARCHIVED', hoje }), 'encerrada');
  assert.equal(C.situacaoDaCampanha({ status: 'REMOVED', hoje }), 'encerrada');
  assert.equal(C.situacaoDaCampanha({ status: 'DELETED', hoje }), 'encerrada');
  assert.equal(C.situacaoDaCampanha({ status: null, ultimoGasto: '2026-11-18', hoje }), 'ativa');
  assert.equal(C.situacaoDaCampanha({ status: '', ultimoGasto: '2026-11-15', hoje }), 'pausada');
  assert.equal(C.situacaoDaCampanha({ status: null, ultimoGasto: null, hoje }), 'desconhecida');
  assert.equal(C.situacaoDaCampanha({}), 'desconhecida');
});

test('comparação entre plataformas pela régua da oficina: custo por contato e por serviço fechado; destaque só com amostra', () => {
  const c = C.comparacaoPlataformas([
    { plataforma: 'meta', gasto: 1500, contatos: 40, fecharam: 8 },
    { plataforma: 'google', gasto: 900, contatos: 12, fecharam: 6 },
    { plataforma: 'tiktok', gasto: 0, contatos: 3, fecharam: 0 },
  ]);
  assert.deepEqual(c.linhas.map(l => [l.plataforma, l.custo_por_contato, l.custo_por_servico]), [['meta', 37.5, 187.5], ['google', 75, 150]]);
  assert.equal(c.linhas[0].texto, 'Meta: R$ 37,50 por contato · R$ 188 por serviço fechado');
  assert.equal(c.destaque, 'Pelos contatos da oficina, o Google trouxe serviço fechado mais barato no período.');

  const pouco = C.comparacaoPlataformas([
    { plataforma: 'meta', gasto: 1500, contatos: 40, fecharam: 8 },
    { plataforma: 'google', gasto: 900, contatos: 0, fecharam: 0 },
  ]);
  assert.equal(pouco.linhas[1].texto, 'Google: nenhum contato · nenhum serviço fechado');
  assert.equal(pouco.linhas[1].custo_por_contato, null);
  assert.equal(pouco.destaque, '', 'sem 3 serviços fechados nas duas, ninguém leva o destaque');
  assert.deepEqual(C.comparacaoPlataformas([]), { linhas: [], destaque: '' });
  assert.deepEqual(T.textosRuins(c), []);
  assert.deepEqual(T.naoFinitos(c), []);
});

test('por que a plataforma e a oficina contam diferente: frases da casa, sem sigla', () => {
  const frases = C.porQueDifere('plataforma', 'desistiu', 'google', 'aparelho', 'origem', 'nao_existe');
  assert.equal(frases.length, 5);
  assert.deepEqual(T.textosRuins({ frases }), []);
  assert.ok(frases.every(f => f.length <= 190), 'frase curta');
});
