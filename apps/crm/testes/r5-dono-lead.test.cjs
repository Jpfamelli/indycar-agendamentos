/* 16/10 (decisão do João): atendente VÊ todos os leads, mas só EDITA os dele ou sem
   responsável. Gestor/admin editam tudo. Editar lead sem dono NÃO muda o dono.
   Servidor real sobre banco em memória (servidor-falso.cjs). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');
const CU = require('../public/crm-utils');

const L = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const A = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const agora = new Date().toISOString();
const lead = (n, extra = {}) => ({ id: L(n), nome: `Cliente Fictício ${n}`, telefone: '1299' + String(1000000 + n), status: 'novo', origem: 'whatsapp',
  valor_orcado: 0, valor_pago: 0, observacoes: '', created_at: agora, updated_at: agora, closed_at: null, responsavel_id: null, cliente_id: null, ...extra });
const tabelas = () => ({ leads: [
  lead(1, { responsavel_id: PESSOAS.atendente.id }),   // da Ana (a atendente que testa)
  lead(2, { responsavel_id: PESSOAS.atendente2.id }),  // do Bruno (colega)
  lead(3),                                             // sem dono
] });

test('regra pura (tela e servidor usam a mesma)', () => {
  const ana = PESSOAS.atendente, gestor = PESSOAS.gestor;
  assert.equal(CU.podeEditarLead({ responsavel_id: ana.id }, ana), true);
  assert.equal(CU.podeEditarLead({ responsavel_id: PESSOAS.atendente2.id }, ana), false);
  assert.equal(CU.podeEditarLead({ responsavel_id: null }, ana), true);
  assert.equal(CU.podeEditarLead({}, ana), true);
  assert.equal(CU.podeEditarLead({ responsavel_id: PESSOAS.atendente2.id }, gestor), true);
  assert.equal(CU.podeEditarLead({ responsavel_id: PESSOAS.atendente2.id }, PESSOAS.admin), true);
  assert.equal(CU.podeEditarLead({ responsavel_id: null }, null), false);
  assert.equal(CU.avisoLeadDeOutro('Bruno Vendedor'), 'Este lead é do Bruno. Peça para ele ou para o gestor.');
  assert.equal(CU.avisoLeadDeOutro(''), 'Este lead é de um colega. Peça para ele ou para o gestor.');
});

test('atendente vê todos, edita o dele e o sem dono; lead do colega dá 403 com o nome', async () => {
  const s = await subirServidor({ tabelas: tabelas() });
  try {
    const lista = await s.req('atendente', '/api/leads');
    assert.equal(lista.status, 200); assert.equal(lista.corpo.length, 3, 'continua vendo todos');
    assert.equal((await s.req('atendente', '/api/leads/' + L(2))).status, 200, 'abre a ficha do colega');

    const meu = await s.req('atendente', '/api/leads/' + L(1), { method: 'PATCH', body: { status: 'contato', valor_orcado: 500 } });
    assert.equal(meu.status, 200); assert.equal(meu.corpo.status, 'contato');

    const semDono = await s.req('atendente', '/api/leads/' + L(3), { method: 'PATCH', body: { status: 'orcamento', observacoes: 'Ligou de novo' } });
    assert.equal(semDono.status, 200); assert.equal(semDono.corpo.status, 'orcamento');
    assert.equal(s.db.leads.find(l => l.id === L(3)).responsavel_id, null, 'editar não vira dono: distribuir é do gestor');

    for (const corpo of [{ status: 'perdido', observacoes: 'Motivo da perda: preço' }, { valor_pago: 900 }, { nome: 'Outro Nome' }, { observacoes: 'nota' }]) {
      const r = await s.req('atendente', '/api/leads/' + L(2), { method: 'PATCH', body: corpo });
      assert.equal(r.status, 403, JSON.stringify(corpo));
      assert.equal(r.corpo.erro, 'Este lead é do Bruno. Peça para ele ou para o gestor.');
      assert.equal(r.corpo.codigo, 'lead_de_outro'); assert.equal(r.corpo.responsavel_nome, 'Bruno Vendedor');
    }
    const l2 = s.db.leads.find(l => l.id === L(2));
    assert.equal(l2.status, 'novo'); assert.equal(Number(l2.valor_pago), 0); assert.equal(l2.nome, 'Cliente Fictício 2');
    assert.equal(s.db.auditoria.filter(a => a.registro === L(2)).length, 0, 'nada foi gravado nem auditado');
  } finally { await s.fechar(); }
});

test('gestor e admin editam lead de qualquer um', async () => {
  const s = await subirServidor({ tabelas: tabelas() });
  try {
    const g = await s.req('gestor', '/api/leads/' + L(2), { method: 'PATCH', body: { status: 'contato' } });
    assert.equal(g.status, 200); assert.equal(g.corpo.status, 'contato');
    const a = await s.req('admin', '/api/leads/' + L(1), { method: 'PATCH', body: { valor_orcado: 300 } });
    assert.equal(a.status, 200); assert.equal(Number(a.corpo.valor_orcado), 300);
    assert.equal(s.db.leads.find(l => l.id === L(2)).responsavel_id, PESSOAS.atendente2.id, 'gestor editar não troca o dono');
  } finally { await s.fechar(); }
});

test('IA do CRM: atendente não executa nem desfaz mudança em lead de colega (ação continua proposta)', async () => {
  const plano = n => ({ plano: { muda: { lead: { antes: { status: 'novo' }, depois: { status: 'contato' } } }, faturamento: false }, n });
  const s = await subirServidor({ tabelas: { ...tabelas(), ia_acoes: [
    { id: A(1), origem: 'crm', tipo: 'proxima_acao', status: 'proposta', lead_id: L(2), saida: plano(1), created_at: agora },
    { id: A(2), origem: 'crm', tipo: 'proxima_acao', status: 'proposta', lead_id: L(1), saida: plano(2), created_at: agora },
    { id: A(3), origem: 'crm', tipo: 'proxima_acao', status: 'proposta', lead_id: L(2), saida: plano(3), created_at: agora },
  ] } });
  try {
    const r = await s.req('atendente', `/api/ia/acoes/${A(1)}/executar`, { body: {} });
    assert.equal(r.status, 403); assert.equal(r.corpo.codigo, 'lead_de_outro'); assert.match(r.corpo.erro, /Este lead é do Bruno/);
    assert.equal(s.db.ia_acoes.find(x => x.id === A(1)).status, 'proposta', 'não tranca a ação à toa');
    assert.equal(s.db.leads.find(l => l.id === L(2)).status, 'novo');
    const lote = await s.req('atendente', '/api/ia/acoes/executar-lote', { body: { ids: [A(1), A(2)] } });
    assert.equal(lote.status, 200); assert.equal(lote.corpo.ok, 1); assert.equal(lote.corpo.falhas, 1);
    assert.equal(lote.corpo.resultados.find(x => x.id === A(1)).status, 403);
    assert.equal(s.db.leads.find(l => l.id === L(1)).status, 'contato', 'o lead dela mudou');
    // gestor executa no lead do Bruno; depois a Ana não consegue desfazer (lead de colega)
    assert.equal((await s.req('gestor', `/api/ia/acoes/${A(3)}/executar`, { body: {} })).status, 200);
    assert.equal(s.db.leads.find(l => l.id === L(2)).status, 'contato');
    s.db.ia_acoes.find(x => x.id === A(3)).perfil_id = PESSOAS.atendente.id;  // mesmo que conste como dela
    const d = await s.req('atendente', `/api/ia/acoes/${A(3)}/desfazer`, { body: {} });
    assert.equal(d.status, 403); assert.equal(s.db.leads.find(l => l.id === L(2)).status, 'contato');
  } finally { await s.fechar(); }
});
