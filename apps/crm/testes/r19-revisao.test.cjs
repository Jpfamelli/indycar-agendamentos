/* Rodada 19 (revisão da R18): o Desfazer das tarefas em lote não confia mais no que a tela manda.
   Volta só o que a própria pessoa mudou em lote (está na auditoria), para o "antes" que o servidor guardou,
   por 7 dias, e um lote de mais de 200 tarefas continua inteiro. Tudo no servidor real sobre banco em memória. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');
const C = require('../public/r18-casa.js');

const T = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const iso = t => new Date(t).toISOString();
const ha = d => iso(Date.now() - d * 864e5);
const tarefa = (n, extra = {}) => ({ id: T(n), titulo: `Tarefa fictícia ${n}`, descricao: null, lead_id: null, cliente_id: null, conversa_id: null, agendamento_id: null, origem: 'crm',
  prioridade: 2, status: 'aberta', vence_em: ha(n), responsavel_id: PESSOAS.atendente.id, criado_por: PESSOAS.gestor.id, concluida_em: null, concluida_por: null, created_at: ha(40), updated_at: ha(40), ...extra });
const achar = (s, n) => s.db.tarefas.find(t => t.id === T(n));
const foto = t => ({ status: t.status, vence_em: t.vence_em, responsavel_id: t.responsavel_id });

test('R19: pedido de Desfazer montado à mão não mexe em tarefa de colega (nem aberta, nem concluída)', async () => {
  const s = await subirServidor({ tabelas: { tarefas: [
    tarefa(1, { responsavel_id: PESSOAS.atendente2.id }),                                   // do Bruno, aberta
    tarefa(2, { responsavel_id: PESSOAS.atendente2.id, status: 'feita', concluida_por: PESSOAS.atendente2.id }),   // do Bruno, concluída por ele
  ] } });
  try {
    const eu = PESSOAS.atendente.id;
    const antes1 = foto(achar(s, 1)), antes2 = foto(achar(s, 2));
    // "antes" inventado (a tarefa era minha / sem dono) e "depois" igual ao estado de agora: passava na conferência antiga
    const r = await s.req('atendente', '/api/tarefas/lote/desfazer', { body: { itens: [
      { id: T(1), antes: { status: 'aberta', vence_em: iso(Date.now() + 30 * 864e5), responsavel_id: eu }, depois: antes1 },
      { id: T(2), antes: { status: 'aberta', vence_em: antes2.vence_em, responsavel_id: null }, depois: antes2 },
    ] } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.voltaram, 0, 'nada volta: essas tarefas nunca estiveram num lote dela');
    assert.deepEqual(r.corpo.pulados.sort(), [T(1), T(2)].sort());
    assert.deepEqual(foto(achar(s, 1)), antes1, 'a aberta do colega segue como estava (dono e prazo)');
    assert.deepEqual(foto(achar(s, 2)), antes2, 'a concluída do colega não reabre');
  } finally { await s.fechar(); }
});

test('R19: o Desfazer usa o "antes" guardado no servidor, não o que a tela mandou', async () => {
  const s = await subirServidor({ tabelas: { tarefas: [tarefa(1), tarefa(2)] } });
  try {
    const prazo1 = achar(s, 1).vence_em;
    const r = await s.req('atendente', '/api/tarefas/lote', { body: { acao: 'concluir', ids: [T(1), T(2)] } });
    assert.equal(r.corpo.atualizadas, 2);
    assert.match(String(r.corpo.lote), /^\d+$/, 'o lote tem número (a linha da auditoria)');
    const aud = s.db.auditoria.find(a => a.acao === 'tarefas_lote');
    assert.equal(C.desempacotarFotos(aud.detalhes.fotos).size, 2, 'o antes de cada tarefa está na auditoria');
    // a tela (ou alguém no console) manda um "antes" trocado: outro dono e outro prazo
    const itens = r.corpo.feitos.map(f => ({ id: f.id, depois: f.depois, antes: { status: 'aberta', vence_em: iso(Date.now() + 90 * 864e5), responsavel_id: PESSOAS.atendente2.id } }));
    const d = await s.req('atendente', '/api/tarefas/lote/desfazer', { body: { itens } });
    assert.equal(d.corpo.voltaram, 2);
    assert.equal(achar(s, 1).status, 'aberta');
    assert.equal(Date.parse(achar(s, 1).vence_em), Date.parse(prazo1), 'volta o prazo de verdade');
    assert.equal(achar(s, 1).responsavel_id, PESSOAS.atendente.id, 'e o dono de verdade');
    const des = s.db.auditoria.find(a => a.acao === 'tarefas_lote_desfeito');
    assert.equal(des.registro_id, String(aud.id), 'o desfazer aponta o lote que desfez');
    // desfazer de novo: nada a fazer, nada muda
    const d2 = await s.req('atendente', '/api/tarefas/lote/desfazer', { body: { itens } });
    assert.equal(d2.corpo.voltaram, 0);
    assert.equal(achar(s, 1).status, 'aberta');
  } finally { await s.fechar(); }
});

test('R19: só quem fez o lote desfaz; depois de 7 dias não desfaz; item mexido depois fica como está', async () => {
  const s = await subirServidor({ tabelas: { tarefas: [tarefa(1), tarefa(2), tarefa(3)] } });
  try {
    const r = await s.req('atendente', '/api/tarefas/lote', { body: { acao: 'amanha', ids: [T(1), T(2), T(3)] } });
    assert.equal(r.corpo.atualizadas, 3);
    const itens = r.corpo.feitos;
    // outra atendente e até a gestora mandam o mesmo pedido: o lote não é delas
    assert.equal((await s.req('atendente2', '/api/tarefas/lote/desfazer', { body: { itens } })).corpo.voltaram, 0);
    assert.equal((await s.req('gestor', '/api/tarefas/lote/desfazer', { body: { itens } })).corpo.voltaram, 0);
    assert.equal(Date.parse(achar(s, 1).vence_em), Date.parse(C.novoPrazo('amanha', Date.now())), 'segue para amanhã');
    // a gestora conclui a 2 depois do lote: o desfazer não passa por cima
    achar(s, 2).status = 'feita';
    const d = await s.req('atendente', '/api/tarefas/lote/desfazer', { body: { itens } });
    assert.equal(d.corpo.voltaram, 2); assert.deepEqual(d.corpo.pulados, [T(2)]);
    assert.equal(achar(s, 2).status, 'feita');
    // um lote de 8 dias atrás não se desfaz mais
    const r2 = await s.req('atendente', '/api/tarefas/lote', { body: { acao: 'concluir', ids: [T(1)] } });
    s.db.auditoria.filter(a => a.acao === 'tarefas_lote').forEach(a => { a.created_at = ha(8); });
    const d2 = await s.req('atendente', '/api/tarefas/lote/desfazer', { body: { itens: r2.corpo.feitos } });
    assert.equal(d2.corpo.voltaram, 0);
    assert.equal(achar(s, 1).status, 'feita');
  } finally { await s.fechar(); }
});

test('R19: lote de 250 tarefas se desfaz inteiro (a auditoria corta listas em 200 e textos em 500 letras)', async () => {
  const N = 250;
  const s = await subirServidor({ tabelas: { tarefas: Array.from({ length: N }, (_, i) => tarefa(i + 1, { responsavel_id: i % 3 ? PESSOAS.atendente.id : null })) } });
  try {
    const prazos = new Map(s.db.tarefas.map(t => [t.id, Date.parse(t.vence_em)]));
    const r = await s.req('gestor', '/api/tarefas/lote', { body: { acao: 'reatribuir', ids: s.db.tarefas.map(t => t.id), responsavel_id: PESSOAS.atendente2.id } });
    assert.equal(r.corpo.atualizadas, N);
    const aud = s.db.auditoria.find(a => a.acao === 'tarefas_lote');
    assert.ok(aud.detalhes.fotos.every(t => typeof t === 'string' && t.length <= 500), 'cada pedaço cabe no corte de 500 letras');
    assert.ok(aud.detalhes.fotos.length <= 200, 'e a lista de pedaços cabe no corte de 200');
    assert.equal(C.desempacotarFotos(aud.detalhes.fotos).size, N, 'nenhuma tarefa se perde no registro');
    const d = await s.req('gestor', '/api/tarefas/lote/desfazer', { body: { itens: r.corpo.feitos.map(f => ({ id: f.id })) } });
    assert.equal(d.corpo.voltaram, N);
    assert.ok(s.db.tarefas.every((t, i) => t.responsavel_id === (i % 3 ? PESSOAS.atendente.id : null)), 'cada uma volta para quem era (ou para ninguém)');
    assert.ok(s.db.tarefas.every(t => Date.parse(t.vence_em) === prazos.get(t.id)), 'com o prazo que tinha');
  } finally { await s.fechar(); }
});

test('R19: lote antigo (gravado sem as fotos) ainda se desfaz, mas só as tarefas que estão nele', async () => {
  const s = await subirServidor({ tabelas: { tarefas: [tarefa(1, { status: 'feita' }), tarefa(2, { responsavel_id: PESSOAS.atendente2.id, status: 'feita' })] } });
  try {
    // como a R18 gravava: só os ids
    s.db.auditoria.push({ id: 1, perfil_id: PESSOAS.atendente.id, app: 'crm', acao: 'tarefas_lote', tabela: 'tarefas', registro_id: null, detalhes: { acao: 'concluir', quantidade: 1, ids: [T(1)] }, created_at: ha(1) });
    const item = n => ({ id: T(n), antes: { status: 'aberta', vence_em: achar(s, n).vence_em, responsavel_id: PESSOAS.atendente.id }, depois: foto(achar(s, n)) });
    const d = await s.req('atendente', '/api/tarefas/lote/desfazer', { body: { itens: [item(1), item(2)] } });
    assert.equal(d.corpo.voltaram, 1);
    assert.equal(achar(s, 1).status, 'aberta');
    assert.equal(achar(s, 2).status, 'feita', 'a do colega não estava no lote: fica');
    assert.equal(achar(s, 2).responsavel_id, PESSOAS.atendente2.id);
  } finally { await s.fechar(); }
});

test('R19: contas puras do registro do lote', () => {
  const feitos = [{ id: T(1), antes: { status: 'aberta', vence_em: '2026-11-20T12:00:00.000Z', responsavel_id: PESSOAS.atendente.id } }, { id: T(2), antes: { status: 'aberta', vence_em: null, responsavel_id: null } }];
  const m = C.desempacotarFotos(C.empacotarFotos(feitos));
  assert.deepEqual(m.get(T(1)), feitos[0].antes);
  assert.deepEqual(m.get(T(2)), feitos[1].antes);
  assert.equal(C.desempacotarFotos(['lixo', null, 'x,y,z']).size, 0);
  assert.deepEqual(C.depoisDoLote({ acao: 'concluir' }, feitos[0].antes), { ...feitos[0].antes, status: 'feita' });
  assert.equal(C.depoisDoLote({ acao: 'hoje' }, feitos[0].antes), null, 'sem o prazo novo registrado não dá para saber o depois');
  assert.equal(C.depoisDoLote({ acao: 'reatribuir', para: 'x' }, feitos[0].antes), null);
  // tarefa em dois lotes: vale o mais novo
  const lotes = [{ id: 9, detalhes: { acao: 'concluir', fotos: C.empacotarFotos([{ id: T(1), antes: { vence_em: '2026-11-26T12:00:00.000Z', responsavel_id: null } }]) } },
    { id: 8, detalhes: { acao: 'amanha', vence_em: '2026-11-26T12:00:00.000Z', fotos: C.empacotarFotos(feitos) } }];
  const p = C.planosDeDesfazer([T(1), T(2), T(3)], lotes);
  assert.equal(p.get(T(1)).lote, 9); assert.equal(p.get(T(2)).lote, 8); assert.equal(p.has(T(3)), false);
});
