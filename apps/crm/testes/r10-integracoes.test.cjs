const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor } = require('./servidor-falso.cjs');

for (const [id, campos] of [
  ['022', { ativo: 'false' }],
  ['023', { meta_ad_account_id: ['act_1'] }],
  ['024', { meta_token_expira_em: '2026-02-30' }],
]) {
  test(`R10-CRM-${id}: rejeita alteração inválida em ${Object.keys(campos)[0]}`, async (t) => {
    const inicial = { canal: 'meta', ativo: false, meta_ad_account_id: 'act_2' };
    const app = await subirServidor({ tabelas: { integracoes_ads: [{ ...inicial }] } });
    t.after(() => app.fechar());
    const resposta = await app.req('admin', '/api/integracoes/meta', {
      method: 'PATCH', body: campos,
    });
    assert.equal(resposta.status, 400);
    assert.deepEqual(app.db.integracoes_ads, [inicial]);
    assert.equal(app.db.auditoria.length, 0);
  });
}
