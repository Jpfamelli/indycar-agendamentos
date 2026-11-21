const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, U } = require('./servidor-falso.cjs');

const lead = { id: U(570), nome: 'Lead Teste', telefone: '12900000001', status: 'perdido' };
const campanha = { ids: [lead.id], corpo: 'Temos horários disponíveis.' };

for (const [id, rota, body] of [
  ['057', '/api/leads/campanha', { ...campanha, ids: [lead.id, 'inválido'] }],
  ['058', '/api/leads/campanha', { ...campanha, detalhe: ['Campanha de teste'] }],
  ['059', '/api/leads/campanha', { ...campanha, corpo: 'a'.repeat(2001) }],
  ['060', '/api/perdas/reabordar', { ids: [lead.id, 'inválido'] }],
  ['061', '/api/funil/movimentos/desfazer', { itens: [{ id: lead.id, de: 'contato', para: 'perdido' }, {}] }],
  ['061', '/api/funil/movimentos/aplicar', { itens: [{ id: lead.id, para: 'contato' }, {}] }],
  ['062', '/api/dono/resumo/guardar', { tipo: 'ano' }],
]) {
  test(`R10-CRM-${id}: ${rota} rejeita dados inválidos sem gravar`, async (t) => {
    const app = await subirServidor({ tabelas: {
      leads: [{ ...lead }], comunicar_campanhas: [], crm_resumos_dono: [], crm_atividades: [],
    } });
    t.after(() => app.fechar());
    assert.equal((await app.req('gestor', rota, { body })).status, 400);
    assert.deepEqual(app.db.leads, [lead]);
    for (const tabela of ['comunicar_campanhas', 'crm_resumos_dono', 'crm_atividades', 'auditoria', 'tarefas']) {
      assert.deepEqual(app.db[tabela], []);
    }
  });
}
