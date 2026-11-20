const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');

for (const [id, descricao, body] of [
  ['008', 'nome enviado como numero', { nome: 123 }],
  ['009', 'cargo enviado como objeto', { cargo: { nome: 'Consultora' } }],
  ['010', 'telefone com letras', { telefone: 'ramal (12) 99999-0000' }],
  ['011', 'cor de avatar enviada como lista', { avatar_cor: ['#112233'] }],
]) {
  test(`R10-CRM-${id}: perfil recusa ${descricao} sem alterar os dados`, async (t) => {
    const app = await subirServidor();
    t.after(() => app.fechar());
    const campo = Object.keys(body)[0];
    const valorDoPerfil = () => app.db.perfis.find((p) => p.id === PESSOAS.atendente.id)[campo];
    const antes = structuredClone(valorDoPerfil());
    const resposta = await app.req('atendente', '/api/perfil', { method: 'PATCH', body });
    assert.equal(resposta.status, 400);
    assert.deepEqual(valorDoPerfil(), antes);
  });
}
