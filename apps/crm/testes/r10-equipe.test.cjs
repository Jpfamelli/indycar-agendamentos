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
  ['054', '', 'função de cadastro desconhecida', {
    nome: 'Pessoa Teste', email: 'nova-equipe@teste.invalid', senha: 'senha-teste', papel: 'gerente',
  }],
  ['055', '', 'e-mail que seria truncado antes de gravar', {
    nome: 'Pessoa Teste', email: 'a'.repeat(148) + '@teste.invalid', senha: 'senha-teste',
  }],
  ['056', 'apps', 'identificador enviado como lista ao mudar apps', { id: [PESSOAS.atendente.id], apps: ['crm'] }],
  ['056', 'recebe-leads', 'identificador enviado como lista ao mudar distribuição', { id: [PESSOAS.atendente.id], recebe_leads: false }],
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
