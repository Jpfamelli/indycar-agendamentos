/* Rodada 5, verificação C6 (CRM): campanha repetida, lead com id solto, preferências do cliente auditadas,
   atribuição em lote com o dono anterior na auditoria, preferências do perfil somadas no servidor. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');

const L = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const C = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const dias = n => new Date(Date.now() - n * 864e5).toISOString();
const lead = (n, extra = {}) => ({ id: L(n), nome: `Cliente Fictício ${n}`, telefone: '1299' + String(1000000 + n), status: 'novo', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0, observacoes: '', created_at: dias(3), ...extra });

test('campanha mandada duas vezes (duplo clique, duas abas) devolve a mesma proposta', async () => {
  const s = await subirServidor({ tabelas: { leads: [lead(1), lead(2)], comunicar_campanhas: [] } });
  try {
    const body = { ids: [L(1), L(2)], corpo: 'Oi {nome}! Tudo bem com o carro? Posso ajudar?' };
    const a = await s.req('atendente', '/api/leads/campanha', { body });
    const b = await s.req('atendente', '/api/leads/campanha', { body });
    assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.corpo.repetida, true);
    assert.equal(b.corpo.campanha.id, a.corpo.campanha.id);
    assert.equal(s.db.comunicar_campanhas.length, 1);
    // outra mensagem é outra campanha
    const c = await s.req('atendente', '/api/leads/campanha', { body: { ...body, corpo: 'Oi {nome}! Seu carro já fez a revisão?' } });
    assert.equal(c.status, 201); assert.equal(s.db.comunicar_campanhas.length, 2);
  } finally { await s.fechar(); }
});

test('lead com id que não é uuid é "não encontrado", não erro 500', async () => {
  const s = await subirServidor({ tabelas: { leads: [lead(1)] } });
  try {
    for (const m of ['GET', 'PATCH', 'DELETE']) {
      const r = await s.req('gestor', '/api/leads/abc', { method: m, body: m === 'PATCH' ? { nome: 'X' } : undefined });
      assert.equal(r.status, 404, m);
    }
    assert.equal((await s.req('gestor', '/api/leads/' + L(1))).status, 200);
  } finally { await s.fechar(); }
});

test('religar mensagens de um cliente fica na auditoria', async () => {
  const s = await subirServidor({ tabelas: { leads: [], clientes: [{ id: C(1), nome: 'Cliente 1', telefone: '12991000001', aceita_mensagens: false, created_at: dias(40) }] } });
  try {
    const r = await s.req('atendente', '/api/clientes/' + C(1), { method: 'PATCH', body: { aceita_mensagens: true } });
    assert.equal(r.status, 200);
    const a = s.db.auditoria.find(x => x.acao === 'cliente_preferencias');
    assert.ok(a, 'sem auditoria'); assert.equal(a.detalhes.aceita_mensagens, true);
  } finally { await s.fechar(); }
});

test('atribuição em lote guarda o dono anterior na auditoria', async () => {
  const s = await subirServidor({ tabelas: { leads: [lead(1, { responsavel_id: PESSOAS.gestor.id }), lead(2)] } });
  try {
    const r = await s.req('gestor', '/api/leads/responsavel-lote', { body: { ids: [L(1), L(2)], responsavel_id: PESSOAS.atendente.id } });
    assert.equal(r.status, 200);
    const a = s.db.auditoria.find(x => x.acao === 'atribuir_lote');
    assert.equal(a.detalhes.antes[L(1)], PESSOAS.gestor.id); assert.equal(a.detalhes.antes[L(2)], null);
  } finally { await s.fechar(); }
});

test('PATCH /api/perfil soma as preferências de agora (não apaga o que outro app gravou)', async () => {
  const s = await subirServidor();
  try {
    s.db.perfis.find(p => p.id === PESSOAS.atendente.id).preferencias = { tema: 'claro', atendimento_tour: { visto: 'x' } };
    const r = await s.req('atendente', '/api/perfil', { method: 'PATCH', body: { preferencias: { crm_tour: { visto: 'y' } } } });
    assert.equal(r.status, 200);
    const p = s.db.perfis.find(x => x.id === PESSOAS.atendente.id).preferencias;
    assert.equal(p.tema, 'claro'); assert.equal(p.atendimento_tour.visto, 'x'); assert.equal(p.crm_tour.visto, 'y');
    assert.equal(r.corpo.preferencias.tema, 'claro');
  } finally { await s.fechar(); }
});
