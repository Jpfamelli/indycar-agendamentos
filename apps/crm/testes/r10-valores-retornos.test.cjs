const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, U } = require('./servidor-falso.cjs');

const fechado = { id: U(630), nome: 'Fechado', status: 'concluido', valor_pago: 0, observacoes: 'Nota inicial' };
const aberto = { id: U(631), nome: 'Aberto', status: 'contato', proximo_contato_em: null };

for (const [id, rota, body] of [
  ['063', 'valores-lote', { itens: [{ id: fechado.id, valor_pago: true }] }],
  ['064', 'valores-lote', { itens: [{ id: fechado.id, cortesia: 'true', valor_pago: 30 }] }],
  ['065', 'valores-lote', { itens: [{ id: fechado.id, valor_pago: 0.001 }] }],
  ['067', 'followup-lote', { ids: [aberto.id, 'inválido'], proximo: 'amanha' }],
  ['068', 'followup-lote', { ids: [aberto.id], limpar: 'true', proximo: 'amanha' }],
]) {
  test(`R10-CRM-${id}: ${rota} recusa um lote inválido sem gravar`, async (t) => {
    const app = await subirServidor({ tabelas: { leads: [{ ...fechado }, { ...aberto }] } });
    t.after(() => app.fechar());
    assert.equal((await app.req('gestor', '/api/leads/' + rota, { body })).status, 400);
    assert.deepEqual(app.db.leads, [fechado, aberto]);
    assert.deepEqual(app.db.auditoria, []);
  });
}

test('R10-CRM-066: desfazer valores preserva observações adicionadas depois do lote', async (t) => {
  const atual = { ...fechado, valor_pago: 30, observacoes: 'Nota acrescentada depois' };
  const app = await subirServidor({ tabelas: { leads: [{ ...atual }] } });
  t.after(() => app.fechar());
  const resposta = await app.req('gestor', '/api/leads/valores-lote/desfazer', { body: { itens: [{
    id: atual.id,
    antes: { valor_pago: 0, observacoes: fechado.observacoes },
    depois: { valor_pago: 30, observacoes: fechado.observacoes },
  }] } });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.voltaram, 0);
  assert.deepEqual(app.db.leads, [atual]);
});
