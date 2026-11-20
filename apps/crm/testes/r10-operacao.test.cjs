const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor } = require('./servidor-falso.cjs');

for (const [id, rota, campos] of [
  ['034', '/api/metas', { mes: '2026-11', faturamento: true }],
  ['035', '/api/metas', { mes: '2026-11', vendas: 1.5 }],
  ['036', '/api/automacoes/rodar', { regras: 'sem_contato' }],
  ['037', '/api/rodizio', { simular: 'true' }],
  ['038', '/api/rodizio', { todos: 'false' }],
  ['039', '/api/auditoria/exportacao', { tipo: 'clientes', quantidade: true }],
]) {
  test(`R10-CRM-${id}: ${rota} rejeita ${Object.keys(campos).at(-1)} fora do contrato`, async (t) => {
    const app = await subirServidor();
    t.after(() => app.fechar());
    const resposta = await app.req('gestor', rota, { body: campos });
    assert.equal(resposta.status, 400);
    assert.deepEqual(app.db.metas, []);
    assert.deepEqual(app.db.tarefas, []);
    assert.ok(!app.db.auditoria.some(a => ['exportar_csv', 'automacoes_ciclo', 'meta_gravar'].includes(a.acao)));
  });
}
