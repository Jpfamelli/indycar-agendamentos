'use strict';
/* Alertas do CRM no radar: viram linhas válidas de ads_alertas (plataforma
   e nível do enum), respeitam 24 h de cooldown e ignoram avisos sem canal. */
const test = require('node:test');
const assert = require('node:assert/strict');
const radar = require('../radar');

const resultado = { alertas: [
  { tipo: 'sem_lead', canal: 'meta', campanha: 'revisao', gasto: 300, texto: 'Gastou R$ 300,00 e nenhum lead apareceu no CRM.' },
  { tipo: 'custo_agendamento', canal: 'google', campanha: 'oleo', valor: 180, texto: 'Custo por agendamento em R$ 180,00.' },
  { tipo: 'sem_valor', canal: 'todos', campanha: '(todas)', texto: 'vendas sem valor' },
  { tipo: 'sem_utm', canal: 'meta', campanha: '(todas)', texto: 'sem utm' },
] };

test('alertasDoCRM: só sem_lead e custo_agendamento viram alerta, com formato de ads_alertas', () => {
  const { novos } = radar.alertasDoCRM(resultado, { cpaAlvo: 90 });
  assert.equal(novos.length, 2);
  const [a, b] = novos;
  assert.equal(a.plataforma, 'meta');
  assert.equal(a.nivel, 'campanha');
  assert.equal(a.regra_id, null);
  assert.equal(a.chave, 'crm|sem_lead|meta|revisao');
  assert.match(a.mensagem, /^Campanha sem lead no CRM: revisao \(Meta\)/);
  assert.equal(b.metrica, 'custo_agendamento');
  assert.equal(b.valor_medido, 180);
  assert.equal(b.valor_limite, 90);
});

test('alertasDoCRM: cooldown de 24 h segura o repetido e a mesma rodada não duplica', () => {
  const agora = Date.parse('2026-10-09T12:00:00Z');
  const disparos = new Map([['crm|sem_lead|meta|revisao', new Date(agora - 3 * 3600000).toISOString()]]);
  const r1 = radar.alertasDoCRM(resultado, { disparos, agora });
  assert.equal(r1.novos.length, 1);
  assert.equal(r1.suprimidos.length, 1);
  const r2 = radar.alertasDoCRM(resultado, { disparos, agora });
  assert.equal(r2.novos.length, 0, 'o disparo da rodada anterior entra no mapa');
  const depois = radar.alertasDoCRM(resultado, { disparos: new Map([['crm|sem_lead|meta|revisao', new Date(agora - 25 * 3600000).toISOString()]]), agora });
  assert.equal(depois.novos.length, 2);
});

test('alertasDoCRM: resultado vazio ou nulo não quebra', () => {
  assert.deepEqual(radar.alertasDoCRM(null).novos, []);
  assert.deepEqual(radar.alertasDoCRM({}).novos, []);
});
