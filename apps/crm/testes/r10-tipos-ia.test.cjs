const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, U } = require('./servidor-falso.cjs');

const acao = { id: U(401), origem: 'crm', tipo: 'crm_triagem', status: 'proposta', saida: {} };

for (const [id, rota, campos] of [
  ['040', '/api/ia/triagem', { dias: [3] }],
  ['041', '/api/ia/triagem', { limite: 1.5 }],
  ['042', '/api/ia/triagem', { usarIA: 'false' }],
  ['043', '/api/ia/triagem/tarefas', { ids: [acao.id, 'inválido'] }],
  ['044', '/api/ia/acoes/executar-lote', { ids: [U(402), 'inválido'] }],
  ['045', '/api/ia/acoes/' + acao.id + '/recusar', { motivo: ['Motivo'] }],
]) {
  test(`R10-CRM-${id}: ${rota} rejeita ${Object.keys(campos)[0]} fora do contrato`, async (t) => {
    const app = await subirServidor({ tabelas: { ia_acoes: [{ ...acao }] } });
    t.after(() => app.fechar());
    const resposta = await app.req('gestor', rota, { body: campos });
    assert.equal(resposta.status, 400);
    assert.deepEqual(app.db.tarefas, []);
    assert.equal(app.db.ia_acoes[0].status, 'proposta');
  });
}
