'use strict';
/* Atribuição: canal pela origem/UTM, funil lead → conversa → agendamento →
   venda, venda sem valor_pago NÃO vira R$ 0, avisos e CSV seguro. */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../atribuicao');

const CRLF = String.fromCharCode(13, 10);
const met = (plataforma, campanha_nome, gasto) => ({ plataforma, campanha_nome, gasto });
const lead = (id, o = {}) => ({ id, cliente_id: `c${id}`, origem: 'meta', status: 'novo', valor_pago: null,
  utm_source: null, utm_medium: null, utm_campaign: null, ...o });

test('canal: origem do CRM manda; UTM completa; orgânico fica de fora', () => {
  assert.equal(A.canal({ origem: 'google' }), 'google');
  assert.equal(A.canal({ origem: 'whatsapp', utm_source: 'Instagram' }), 'meta');
  assert.equal(A.canal({ origem: 'site', utm_source: 'google', utm_medium: 'cpc' }), 'google');
  assert.equal(A.canal({ origem: 'site', utm_source: 'google', utm_medium: 'organic' }), null);
  assert.equal(A.canal({ origem: 'indicacao' }), null);
});

test('normalizar casa campanha com UTM ignorando acento, caixa e espaço duplo', () => {
  assert.equal(A.normalizar('  Revisão  ÓLEO '), 'revisao oleo');
});

test('funil completo por campanha: conversa, agendamento (cancelado não conta), compareceu e venda', () => {
  const leads = [
    lead('1', { utm_campaign: 'Revisão', status: 'concluido', valor_pago: 500 }),
    lead('2', { utm_campaign: 'revisao', status: 'agendado' }),
    lead('3', { utm_campaign: 'revisao', status: 'perdido' }),
  ];
  const agendamentos = [
    { lead_id: '1', status: 'concluido', valor: 500 },
    { lead_id: '2', status: 'confirmado', valor: null },
    { lead_id: '3', status: 'cancelado', valor: null },
  ];
  const r = A.consolidar({ leads, agendamentos, clientesComConversa: new Set(['c1', 'c2']),
    metricas: [met('meta', 'REVISÃO', 300)], margem: 50 });
  const g = r.campanhas.find(x => x.campanha === 'REVISÃO');
  assert.equal(g.gasto, 300);
  assert.equal(g.leads, 3);
  assert.equal(g.conversas, 2);
  assert.equal(g.agendamentos, 2);
  assert.equal(g.compareceram, 1);
  assert.equal(g.fechados, 1);
  assert.equal(g.perdidos, 1);
  assert.equal(g.cpl, 100);
  assert.equal(g.custo_agendamento, 150);
  assert.equal(g.custo_venda, 300);
  assert.equal(g.receita, 500);
  assert.ok(Math.abs(g.roas_real - 500 / 300) < 1e-9);
  assert.ok(Math.abs(g.roi - ((250 - 300) / 300) * 100) < 1e-9);
  const f = A.funil(r.total);
  assert.deepEqual(f.map(e => e.valor), [3, 2, 1, 1]);
  assert.ok(f.every(e => e.taxa == null || e.taxa <= 100), "nenhuma etapa passa de 100% da anterior");
  assert.equal(f[0].taxa, null);
  assert.equal(Math.round(f[1].do_topo), 67);
});

test('venda sem valor_pago: receita null (não R$ 0), ROAS/ticket null e aviso', () => {
  const r = A.consolidar({ leads: [lead('1', { status: 'concluido' }), lead('2', { status: 'concluido' })],
    metricas: [met('meta', 'x', 100)] });
  assert.equal(r.total.fechados, 2);
  assert.equal(r.total.sem_valor, 2);
  assert.equal(r.total.receita, null);
  assert.equal(r.total.receita_desconhecida, true);
  assert.equal(r.total.roas_real, null);
  assert.equal(r.total.ticket, null);
  assert.equal(r.total.roi, null);
  assert.equal(r.total.custo_venda, 50);
  assert.ok(r.alertas.some(a => a.tipo === 'sem_valor' && a.texto.includes('não pode ser calculada')));
});

test('receita parcial: ticket só sobre as vendas com valor', () => {
  const r = A.consolidar({ leads: [lead('1', { status: 'concluido', valor_pago: 400 }), lead('2', { status: 'concluido' })] });
  assert.equal(r.total.receita, 400);
  assert.equal(r.total.receita_parcial, true);
  assert.equal(r.total.ticket, 400);
  assert.ok(r.alertas.some(a => a.tipo === 'sem_valor' && a.texto.includes('parcial')));
});

test('lead repetido conta uma vez; filtro de plataforma; não atribuídos contados', () => {
  const r = A.consolidar({ leads: [lead('1'), lead('1'), lead('2', { origem: 'google' }), lead('3', { origem: 'organico' })], plataforma: 'meta' });
  assert.equal(r.total.leads, 1);
  assert.equal(r.nao_atribuidos, 1);
  assert.deepEqual(r.canais.map(c => c.canal), ['meta']);
});

test('aviso sem_utm quando o canal não usa UTM — e aí NÃO acusa "sem lead" em cada campanha', () => {
  const r = A.consolidar({ leads: [lead('1'), lead('2')], metricas: [met('meta', 'A', 400), met('meta', 'B', 300)] });
  assert.ok(r.alertas.some(a => a.tipo === 'sem_utm' && a.canal === 'meta'));
  assert.equal(r.alertas.filter(a => a.tipo === 'sem_lead').length, 0);
});

test('campanha sem lead no CRM quando o canal usa UTM; custo por agendamento acima do alvo', () => {
  const leads = [lead('1', { utm_campaign: 'A' }), lead('2', { utm_campaign: 'A' })];
  const agendamentos = [{ lead_id: '1', status: 'confirmado' }, { lead_id: '2', status: 'aguardando' }];
  const r = A.consolidar({ leads, agendamentos, metricas: [met('meta', 'A', 400), met('meta', 'B', 200)], cpaAlvo: 100 });
  const semLead = r.alertas.filter(a => a.tipo === 'sem_lead');
  assert.deepEqual(semLead.map(a => a.campanha), ['B']);
  const caro = r.alertas.find(a => a.tipo === 'custo_agendamento');
  assert.equal(caro.campanha, 'A');
  assert.equal(caro.valor, 200);
});

test('campanha gastando pouco (< R$ 150) não acende "sem lead"', () => {
  const r = A.consolidar({ leads: [lead('1', { utm_campaign: 'A' })], metricas: [met('meta', 'B', 149)] });
  assert.equal(r.alertas.filter(a => a.tipo === 'sem_lead').length, 0);
});

test('comparar: variação só com base > 0', () => {
  const c = A.comparar({ leads: 10, fechados: 2, receita: null }, { leads: 5, fechados: 0, receita: 100 });
  assert.equal(c.leads.variacao, 100);
  assert.equal(c.fechados.variacao, null);
  assert.equal(c.receita.variacao, null);
});

test('CSV: BOM, ponto e vírgula, vírgula decimal, fórmula neutralizada e "sem valor lançado"', () => {
  const r = A.consolidar({ leads: [lead('1', { utm_campaign: '=HYPERLINK("x")', status: 'concluido' })], metricas: [met('meta', '=HYPERLINK("x")', 12.5)] });
  const texto = A.csv(r);
  assert.equal(texto.charCodeAt(0), 0xFEFF);
  const linhas = texto.trim().split(CRLF);
  assert.ok(linhas[0].startsWith('"Canal";"Campanha";"Investido"'));
  assert.ok(texto.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(texto.includes('"12,5"'));
  assert.ok(texto.includes('"sem valor lançado"'));
  assert.ok(texto.includes('TOTAL DO CANAL'));
  assert.ok(!texto.includes('cliente_id') && !texto.includes('"c1"'), 'nenhuma identidade de cliente no CSV');
});

test('montarCSV: genérico, nulo vira célula vazia e "+" é neutralizado', () => {
  const t = A.montarCSV([['a', 'A'], ['b', 'B']], [{ a: null, b: '+1' }]);
  assert.equal(t.slice(1), `"A";"B"${CRLF}"";"'+1"${CRLF}`);
});

test('grupo sem investimento (leads sem UTM): custos ficam null, não R$ 0', () => {
  const r = A.consolidar({ leads: [lead('1')], metricas: [met('meta', 'A', 100)] });
  const semUtm = r.campanhas.find(g => g.sem_utm);
  assert.equal(semUtm.cpl, null);
  assert.equal(semUtm.custo_agendamento, null);
  assert.equal(r.canais[0].cpl, 100, 'no total do canal o gasto entra');
});
