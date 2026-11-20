const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor } = require('./servidor-falso.cjs');

for (const [id, campos] of [
  ['027', { titulo: 19 }],
  ['028', { descricao: { texto: 'Ligar' } }],
  ['029', { prioridade: true }],
  ['030', { vence_em: [new Date(Date.now() + 86400000).toISOString()] }],
]) {
  test(`R10-CRM-${id}: tarefa rejeita tipo inválido em ${Object.keys(campos)[0]}`, async (t) => {
    const app = await subirServidor();
    t.after(() => app.fechar());
    const resposta = await app.req('gestor', '/api/tarefas', {
      method: 'POST', body: { titulo: 'Ligar para o cliente', ...campos },
    });
    assert.equal(resposta.status, 400);
    assert.deepEqual(app.db.tarefas, []);
  });
}
