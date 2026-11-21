const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS, U } = require('./servidor-falso.cjs');

const lead = { id: U(460), nome: 'Lead Teste', status: 'novo', responsavel_id: null };
const vendedor = PESSOAS.atendente.id;

for (const [id, rota, campos] of [
  ['046', '/api/leads/' + lead.id + '/responsavel', { responsavel_id: vendedor, motivo: ['Motivo'] }],
  ['047', '/api/leads/responsavel-lote', { ids: [lead.id, 'inválido'], responsavel_id: vendedor }],
  ['048', '/api/rodizio', { horas: 'Infinity' }],
  ['049', '/api/rodizio', { limite: 1.5 }],
]) {
  test(`R10-CRM-${id}: ${rota} rejeita dados inválidos sem atribuir leads`, async (t) => {
    const app = await subirServidor({ tabelas: { leads: [{ ...lead }] } });
    t.after(() => app.fechar());
    assert.equal((await app.req('gestor', rota, { body: campos })).status, 400);
    assert.equal(app.db.leads[0].responsavel_id, null);
  });
}
