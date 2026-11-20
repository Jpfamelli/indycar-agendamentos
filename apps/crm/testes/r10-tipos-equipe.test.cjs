const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor } = require('./servidor-falso.cjs');

for (const [id, campo, valor] of [
  ['032', 'nome', 123],
  ['033', 'cargo', { nome: 'Vendas' }],
]) {
  test(`R10-CRM-${id}: cadastro de equipe rejeita ${campo} fora do formato de texto`, async (t) => {
    const app = await subirServidor();
    t.after(() => app.fechar());
    const antes = app.db.perfis.length;
    const resposta = await app.req('admin', '/api/equipe', {
      body: { nome: 'Pessoa Teste', email: 'pessoa@teste.invalid', senha: 'ficticia123', [campo]: valor },
    });
    assert.equal(resposta.status, 400);
    assert.equal(app.db.perfis.length, antes);
    assert.ok(!app.db.auditoria.some(a => a.acao === 'equipe_criar'));
  });
}
