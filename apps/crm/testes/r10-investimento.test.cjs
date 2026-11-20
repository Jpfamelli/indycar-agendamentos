const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor } = require('./servidor-falso.cjs');

for (const [id, campo, valor] of [
  ['016', 'canal', ['meta']],
  ['017', 'competencia', '2026-13'],
  ['018', 'investimento', -150],
  ['019', 'cliques', 1.5],
  ['020', 'impressoes', true],
  ['021', 'conversoes', 2147483648],
]) {
  test(`R10-CRM-${id}: recusa ${campo} inválido sem registrar investimento`, async (t) => {
    const app = await subirServidor({ tabelas: { metricas_canal: [] } });
    t.after(() => app.fechar());
    const resposta = await app.req('admin', '/api/metricas', {
      method: 'POST',
      body: { canal: 'meta', competencia: '2026-11', investimento: '150', [campo]: valor },
    });
    assert.equal(resposta.status, 400);
    assert.deepEqual(app.db.metricas_canal, []);
    assert.equal(app.db.auditoria.length, 0);
  });
}
