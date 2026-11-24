/* Rodada 14: faxina dos contatos parados (servidor real sobre banco em memória).
   Marca perdido em lote com prévia, travas de conversa recente e retorno combinado,
   Desfazer, auditoria, só gestor. Nada é apagado. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS, U } = require('./servidor-falso.cjs');
const R14 = require('../lib/rodada14');

const L = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const ha = n => new Date(Date.now() - n * 864e5).toISOString();
const lead = (n, extra = {}) => ({ id: L(n), nome: `Contato Fictício ${n}`, telefone: '1299' + String(2000000 + n), status: 'contato', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0,
  observacoes: '', created_at: ha(120), updated_at: ha(45), closed_at: null, responsavel_id: null, cliente_id: null, proximo_contato_em: null, ultimo_contato_em: null, ...extra });

test('R14: quem entra na faxina (puro)', () => {
  const agora = Date.now();
  const leads = [
    lead(1, { updated_at: ha(45) }),                                  // entra
    lead(2, { updated_at: ha(10) }),                                  // mexido há pouco
    lead(3, { updated_at: ha(80), responsavel_id: U(903) }),          // tem dono: só no escopo "todos"
    lead(4, { status: 'agendado', updated_at: ha(80) }),              // pede decisão, não faxina
    lead(5, { status: 'concluido', updated_at: ha(80) }),
    lead(6, { updated_at: ha(80), ultimo_contato_em: ha(3) }),        // falou com o cliente há 3 dias
    lead(7, { updated_at: ha(80), proximo_contato_em: new Date(agora + 3 * 864e5).toISOString() }), // retorno combinado
    lead(8, { status: 'novo', updated_at: ha(200), valor_orcado: 500 }),
  ];
  const a = R14.selecionarFaxina(leads, { dias: 30, agora });
  assert.deepEqual(a.itens.map(i => i.id), [L(8), L(1)], 'mais parado primeiro');
  assert.equal(a.foraRetorno, 1);
  assert.equal(R14.selecionarFaxina(leads, { dias: 30, escopo: 'todos', agora }).itens.length, 3, 'com "todos" entra o contato 3, que tem dono');
  assert.equal(R14.selecionarFaxina(leads, { dias: 60, agora }).itens.length, 1, 'com 60 dias só o contato 8');
  const conv = new Map([[L(1), agora - 5 * 864e5]]);
  const b = R14.selecionarFaxina(leads, { dias: 30, agora, ultimaConversa: conv });
  assert.deepEqual(b.itens.map(i => i.id), [L(8)]);
  assert.equal(b.foraConversa, 1, 'conversa recente no WhatsApp segura o contato');
  const r = R14.resumoFaxina(leads, { dias: 30, agora });
  assert.equal(r.total, 2); assert.equal(r.valorOrcado, 500); assert.deepEqual(r.contagens, { 14: 2, 30: 2, 60: 1, 90: 1 });
  assert.equal(r.decisao.agendado, 1);
  assert.equal(r.abertosSemResponsavel, 6 - 0);                       // 1,2,4,6,7,8 sem dono e em aberto
  assert.equal(r.vivos, 4);
});

test('R14: observações ganham o motivo padrão e a linha da faxina, sem repetir motivo que já existe', () => {
  assert.equal(R14.observacoesDaFaxina('Cliente pediu orçamento', 45), 'Cliente pediu orçamento\nMotivo da perda: Sem retorno do cliente\nFaxina: parado há 45 dias, marcado como perdido em lote');
  assert.equal(R14.observacoesDaFaxina('Motivo da perda: Achou caro', 1), 'Motivo da perda: Achou caro\nFaxina: parado há 1 dia, marcado como perdido em lote');
});

async function montar(extra = {}) {
  return subirServidor({ tabelas: { leads: [lead(1), lead(2, { status: 'orcamento', updated_at: ha(70), valor_orcado: 900, observacoes: 'Pediu desconto' }), lead(3, { updated_at: ha(5) }),
    lead(4, { updated_at: ha(60), cliente_id: U(4000) }), lead(5, { responsavel_id: PESSOAS.atendente.id, updated_at: ha(90) })],
    conversas: [{ id: U(7000), cliente_id: U(4000) }], whatsapp_mensagens: [{ id: U(7001), conversa_id: U(7000), created_at: ha(2), direcao: 'entrada' }], ...extra } });
}

test('R14: só gestor vê e grava; atendente leva 403', async () => {
  const s = await montar();
  try {
    for (const quem of ['atendente', 'agenda']) {
      assert.equal((await s.req(quem, '/api/leads/faxina')).status, 403);
      assert.equal((await s.req(quem, '/api/leads/faxina/arquivar', { body: { ids: [L(1)] } })).status, 403);
      assert.equal((await s.req(quem, '/api/leads/faxina/desfazer', { body: { itens: [{}] } })).status, 403);
    }
    assert.equal((await s.req(null, '/api/leads/faxina')).status, 401);
    assert.ok(s.db.leads.every(l => l.status !== 'perdido'));
  } finally { await s.fechar(); }
});

test('R14: prévia traz o resumo, deixa de fora quem tem conversa recente e sugere rodízio só dos vivos', async () => {
  const s = await montar();
  try {
    const r = await s.req('gestor', '/api/leads/faxina?dias=30');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.itens.map(i => i.id).sort(), [L(1), L(2)].sort());
    assert.equal(r.corpo.foraConversa, 1, 'o contato 4 falou no WhatsApp há 2 dias');
    assert.equal(r.corpo.total, 2); assert.equal(r.corpo.valorOrcado, 900);
    assert.deepEqual(r.corpo.porEtapa, { contato: 1, orcamento: 1 });
    assert.equal(r.corpo.abertosSemResponsavel, 4);
    assert.equal(r.corpo.vivos, 2, 'contatos 3 e 4');
    const plano = r.corpo.rodizio.plano.map(x => x.id).sort();
    assert.deepEqual(plano, [L(3), L(4)].sort(), 'o rodízio não inclui o que vai para a faxina');
    const todos = await s.req('gestor', '/api/leads/faxina?dias=30&escopo=todos');
    assert.equal(todos.corpo.total, 3, 'com "todos" entra o do atendente');
    assert.equal(s.db.leads.filter(l => l.status === 'perdido').length, 0, 'prévia não grava nada');
    assert.equal((await s.req('gestor', '/api/leads/faxina?dias=1')).corpo.dias, 7, 'prazo mínimo de 7 dias');
  } finally { await s.fechar(); }
});

test('R14: arquivar marca perdido com motivo, audita, pula quem mudou e Desfazer volta tudo', async () => {
  const s = await montar();
  try {
    const gravar = await s.req('gestor', '/api/leads/faxina/arquivar', { body: { dias: 30, escopo: 'sem-dono', ids: [L(1), L(2), L(3), L(4), L(99)] } });
    assert.equal(gravar.status, 200);
    assert.equal(gravar.corpo.atualizados, 2);
    assert.deepEqual(gravar.corpo.feitos.map(f => f.id).sort(), [L(1), L(2)].sort());
    assert.equal(gravar.corpo.pulados.length, 3, 'o 3 foi mexido há pouco, o 4 tem conversa, o 99 não existe');
    const um = s.db.leads.find(l => l.id === L(1)), dois = s.db.leads.find(l => l.id === L(2));
    assert.equal(um.status, 'perdido'); assert.equal(dois.status, 'perdido');
    assert.match(um.observacoes, /Motivo da perda: Sem retorno do cliente/);
    assert.match(dois.observacoes, /^Pediu desconto\nMotivo da perda/);
    assert.equal(s.db.leads.length, 5, 'nada foi apagado');
    assert.equal(s.db.leads.find(l => l.id === L(3)).status, 'contato');
    const aud = s.db.auditoria.find(a => a.acao === 'faxina_lote');
    assert.ok(aud); assert.equal(aud.detalhes.quantidade, 2); assert.deepEqual(aud.detalhes.porEtapa, { contato: 1, orcamento: 1 });

    const volta = await s.req('gestor', '/api/leads/faxina/desfazer', { body: { itens: gravar.corpo.feitos } });
    assert.equal(volta.status, 200); assert.equal(volta.corpo.voltaram, 2);
    assert.equal(s.db.leads.find(l => l.id === L(1)).status, 'contato');
    assert.equal(s.db.leads.find(l => l.id === L(2)).status, 'orcamento');
    assert.equal(s.db.leads.find(l => l.id === L(2)).observacoes, 'Pediu desconto', 'as observações voltam como eram');
    assert.ok(s.db.auditoria.some(a => a.acao === 'faxina_desfeita'));
    const de_novo = await s.req('gestor', '/api/leads/faxina/desfazer', { body: { itens: gravar.corpo.feitos } });
    assert.equal(de_novo.corpo.voltaram, 0, 'desfazer duas vezes não faz nada');
  } finally { await s.fechar(); }
});

test('R14: Desfazer não mexe em contato que já foi reaberto e trabalhado por outra pessoa', async () => {
  const s = await montar();
  try {
    const g = await s.req('gestor', '/api/leads/faxina/arquivar', { body: { dias: 30, ids: [L(1)] } });
    const l = s.db.leads.find(x => x.id === L(1)); l.status = 'agendado'; l.observacoes += '\nCliente ligou de volta';
    const v = await s.req('gestor', '/api/leads/faxina/desfazer', { body: { itens: g.corpo.feitos } });
    assert.equal(v.corpo.voltaram, 0); assert.equal(l.status, 'agendado');
  } finally { await s.fechar(); }
});

test('R14: entradas inválidas são recusadas sem gravar', async () => {
  const s = await montar();
  try {
    for (const body of [{ ids: [] }, { ids: ['abc'] }, { ids: [L(1), L(1)] }, { ids: 'x' }, { ids: Array.from({ length: 501 }, (_, i) => L(i + 1000)) }]) {
      assert.equal((await s.req('gestor', '/api/leads/faxina/arquivar', { body })).status, 400, JSON.stringify(body).slice(0, 40));
    }
    assert.equal((await s.req('gestor', '/api/leads/faxina/desfazer', { body: { itens: [] } })).status, 400);
    assert.ok(s.db.leads.every(l => l.status !== 'perdido'));
    assert.equal(s.db.auditoria.filter(a => /faxina/.test(a.acao)).length, 0);
  } finally { await s.fechar(); }
});

test('R14: contato com retorno combinado para o futuro nunca é arquivado, mesmo que o pedido o inclua', async () => {
  const futuro = new Date(Date.now() + 2 * 864e5).toISOString();
  const s = await subirServidor({ tabelas: { leads: [lead(1, { proximo_contato_em: futuro })] } });
  try {
    const r = await s.req('gestor', '/api/leads/faxina/arquivar', { body: { dias: 30, ids: [L(1)] } });
    assert.equal(r.corpo.atualizados, 0); assert.equal(s.db.leads[0].status, 'contato');
  } finally { await s.fechar(); }
});
