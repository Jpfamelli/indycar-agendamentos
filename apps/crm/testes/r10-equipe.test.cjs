const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');

for (const [id, rota, descricao, corpo] of [
  ['012', 'papel', 'papel desconhecido', { papel: 'gerente' }],
  ['013', 'ativo', 'estado de acesso enviado como texto', { ativo: 'true' }],
  ['013', 'ativo', 'estado de acesso omitido', {}],
  ['014', '', 'senha temporaria acima do limite', {
    nome: 'Pessoa Teste', email: 'nova-equipe@teste.invalid', senha: 'a'.repeat(201),
  }],
  ['015', '', 'troca de senha enviada como texto', {
    nome: 'Pessoa Teste', email: 'nova-equipe@teste.invalid', senha: 'senha-teste', trocar_senha: 'false',
  }],
]) {
  test(`R10-CRM-${id}: equipe recusa ${descricao} sem alterar perfis`, async (t) => {
    const app = await subirServidor();
    t.after(() => app.fechar());
    const perfis = () => app.db.perfis.filter(p => p.id !== PESSOAS.admin.id);
    const antes = structuredClone(perfis());
    const resposta = await app.req('admin', '/api/equipe' + (rota ? '/' + rota : ''), {
      method: 'POST',
      body: { id: PESSOAS.atendente.id, ...corpo },
    });
    assert.equal(resposta.status, 400);
    assert.deepEqual(perfis(), antes);
    assert.equal(app.db.auditoria.length, 0);
  });
}
