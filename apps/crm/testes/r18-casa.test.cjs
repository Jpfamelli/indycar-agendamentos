/* Rodada 18: a casa em ordem. Contas puras (r18-casa.js) e o servidor real sobre banco em memória:
   tarefas atrasadas em lote (concluir, hoje, amanhã, reatribuir) com Desfazer e auditoria,
   e os contatos "Agendado" sem horário na Agenda. Nada é apagado. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { subirServidor, PESSOAS, U } = require('./servidor-falso.cjs');
const C = require('../public/r18-casa.js');

const T = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const L = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const iso = t => new Date(t).toISOString();
const ha = d => iso(Date.now() - d * 864e5);

test('R18: novo prazo de hoje (18h ou daqui a 1 h) e de amanhã (9h), no fuso de São Paulo', () => {
  const dia = Date.UTC(2026, 10, 25) + 3 * 3600e3;                // 25/11 00:00 em SP
  assert.equal(C.novoPrazo('hoje', dia + 10 * 3600e3), iso(dia + 18 * 3600e3));
  assert.equal(C.novoPrazo('hoje', dia + 17 * 3600e3), iso(dia + 18 * 3600e3), 'às 17h ainda dá 18h');
  assert.equal(C.novoPrazo('hoje', dia + 19 * 3600e3 + 5 * 60e3), iso(dia + 20 * 3600e3 + 15 * 60e3), 'depois das 17h: 1 h depois, no quarto de hora');
  assert.equal(C.novoPrazo('hoje', dia + 23 * 3600e3 + 50 * 60e3), iso(dia + 23 * 3600e3 + 45 * 60e3), 'nunca passa para amanhã');
  assert.equal(C.novoPrazo('amanha', dia + 23 * 3600e3), iso(dia + 864e5 + 9 * 3600e3));
  assert.equal(C.novoPrazo('concluir', dia), null);
  assert.equal(C.horaCurta(iso(dia + 18 * 3600e3)), '18h');
  assert.equal(C.horaCurta(iso(dia + 20 * 3600e3 + 15 * 60e3)), '20h15');
});

test('R18: atraso em dias, ordem, contagem por pessoa e permissão', () => {
  const agora = Date.UTC(2026, 10, 25, 15);
  assert.equal(C.diasAtraso(iso(agora - 3600e3), agora), 0);
  assert.equal(C.diasAtraso(iso(agora - 864e5), agora), 1);
  assert.equal(C.diasAtraso(iso(agora + 3600e3), agora), 0);
  const ts = [{ id: 'a', vence_em: iso(agora - 864e5), prioridade: 2, titulo: 'b', responsavel_id: 'x' }, { id: 'b', vence_em: iso(agora - 5 * 864e5), prioridade: 2, titulo: 'a', responsavel_id: null },
    { id: 'c', vence_em: iso(agora - 864e5), prioridade: 3, titulo: 'c', responsavel_id: 'x' }];
  assert.deepEqual(C.ordenarAtrasadas(ts).map(t => t.id), ['b', 'c', 'a'], 'mais antiga primeiro; no mesmo prazo, a urgente');
  assert.deepEqual(C.porPessoa(ts, new Map([['x', 'Xavier']])), [{ id: 'x', nome: 'Xavier', total: 2 }, { id: null, nome: 'Sem responsável', total: 1 }]);
  const eu = { id: 'eu' };
  assert.ok(C.podeMexerTarefa({ responsavel_id: 'eu' }, eu, false));
  assert.ok(C.podeMexerTarefa({ responsavel_id: null }, eu, false));
  assert.ok(C.podeMexerTarefa({ responsavel_id: 'x', criado_por: 'eu' }, eu, false));
  assert.ok(!C.podeMexerTarefa({ responsavel_id: 'x', criado_por: 'y' }, eu, false));
  assert.ok(C.podeMexerTarefa({ responsavel_id: 'x', criado_por: 'y' }, eu, true));
});

test('R18: o pedido do lote é conferido antes de tudo', () => {
  assert.match(C.validarLote({ acao: 'apagar', ids: [T(1)] }).erro, /Ação inválida/);
  assert.match(C.validarLote({ acao: 'concluir', ids: [] }).erro, /de 1 a 300/);
  assert.match(C.validarLote({ acao: 'concluir', ids: [T(1), T(1)] }).erro, /repetida/);
  assert.match(C.validarLote({ acao: 'concluir', ids: ['x'] }).erro, /inválida/);
  assert.match(C.validarLote({ acao: 'reatribuir', ids: [T(1)] }).erro, /para quem/);
  assert.deepEqual(C.validarLote({ acao: 'hoje', ids: [T(1)], responsavel_id: U(1) }), { acao: 'hoje', ids: [T(1)], responsavel_id: null });
  assert.equal(C.validarLote({ acao: 'concluir', ids: Array.from({ length: 301 }, (_, i) => T(i)) }).erro, 'Escolha de 1 a 300 tarefas por vez.');
});

test('R18: textos de confirmação contam os itens e lembram do Desfazer', () => {
  const agora = Date.UTC(2026, 10, 25, 13);                      // 10h em SP
  assert.match(C.textoConfirmar('concluir', 12, { agora }), /^Concluir 12 tarefas atrasadas\?[\s\S]*desfazer/);
  assert.match(C.textoConfirmar('hoje', 1, { agora }), /^Passar 1 tarefa atrasada para hoje, 18h\?/);
  assert.match(C.textoConfirmar('amanha', 2, { agora }), /para amanhã, 9h\?/);
  assert.match(C.textoConfirmar('reatribuir', 3, { nomePara: 'Bruno' }), /para Bruno\? Ela recebe um aviso de cada uma/);
  assert.ok(!/aviso/.test(C.textoConfirmar('reatribuir', 3, { nomePara: 'você' })));
  assert.equal(C.textoFeito('concluir', 1), '1 tarefa concluída');
  assert.equal(C.textoFeito('reatribuir', 2, { nomePara: 'Bruno' }), '2 tarefas passadas para Bruno');
});

test('R18: agendados sem horário (puro) e o link da Agenda já com o cliente', () => {
  const agora = Date.now();
  const leads = [
    { id: 'a', nome: 'A', status: 'agendado', updated_at: ha(10), telefone: '5512991234567', cliente_id: U(50) },
    { id: 'b', nome: 'B', status: 'agendado', updated_at: ha(3) },                        // tem horário
    { id: 'c', nome: 'C', status: 'agendado', updated_at: ha(20) },                       // carro na oficina
    { id: 'd', nome: 'D', status: 'contato', updated_at: ha(30) },
    { id: 'e', nome: 'E', status: 'agendado', updated_at: ha(2) },
  ];
  const sinais = { b: { agendamento: { id: 'x' } }, c: { patio: { id: 'y' } } };
  const r = C.agendadosSemHorario(leads, sinais, { agora });
  assert.deepEqual(r.map(i => i.id), ['a', 'e']); assert.equal(r[0].dias, 10);
  assert.equal(C.caminhoAgenda(r[0]), `/?tel=5512991234567&cliente=${U(50)}&novo=1&nome=A`);
  assert.equal(C.caminhoAgenda({ nome: 'Sem nada' }), null);
});

/* ---------------- servidor ---------------- */
const tarefa = (n, extra = {}) => ({ id: T(n), titulo: `Tarefa fictícia ${n}`, descricao: null, lead_id: null, cliente_id: null, conversa_id: null, agendamento_id: null, origem: 'crm',
  prioridade: 2, status: 'aberta', vence_em: ha(n), responsavel_id: PESSOAS.atendente.id, criado_por: PESSOAS.gestor.id, concluida_em: null, concluida_por: null, created_at: ha(40), updated_at: ha(40), ...extra });
async function montar() {
  return subirServidor({ tabelas: {
    tarefas: [tarefa(1), tarefa(2, { lead_id: L(1) }), tarefa(3, { responsavel_id: PESSOAS.atendente2.id }), tarefa(4, { responsavel_id: null }),
      tarefa(5, { vence_em: iso(Date.now() + 864e5) }), tarefa(6, { status: 'feita' })],
    leads: [{ id: L(1), nome: 'Contato Fictício 1', telefone: '12991110001', status: 'agendado', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0, observacoes: '', created_at: ha(30), updated_at: ha(8), responsavel_id: PESSOAS.atendente.id, cliente_id: null },
      { id: L(2), nome: 'Contato Fictício 2', telefone: '12991110002', status: 'agendado', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0, observacoes: '', created_at: ha(30), updated_at: ha(8), responsavel_id: PESSOAS.atendente.id, cliente_id: null },
      { id: L(3), nome: 'Contato Fictício 3', telefone: '12991110003', status: 'agendado', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0, observacoes: '', created_at: ha(30), updated_at: ha(8), responsavel_id: PESSOAS.atendente2.id, cliente_id: null }],
    agendamentos: [{ id: U(8000), lead_id: L(2), telefone: '12991110002', data: iso(Date.now() + 2 * 864e5).slice(0, 10), hora: '10:00', status: 'confirmado' }],
  } });
}

test('R18: lista de atrasadas — gestor vê a equipe; atendente só as dele; ninguém de fora', async () => {
  const s = await montar();
  try {
    const g = await s.req('gestor', '/api/tarefas/atrasadas');
    assert.equal(g.status, 200);
    assert.deepEqual(g.corpo.itens.map(i => i.id), [T(4), T(3), T(2), T(1)], 'só abertas e vencidas, mais antiga primeiro');
    assert.equal(g.corpo.escopo, 'todas');
    assert.equal(g.corpo.itens.find(i => i.id === T(2)).lead.nome, 'Contato Fictício 1');
    assert.equal(g.corpo.itens[0].dias, 4);
    assert.ok(g.corpo.itens.every(i => i.pode_mexer));
    assert.deepEqual(g.corpo.por_pessoa.map(x => [x.nome, x.total]), [['Ana Vendedora', 2], ['Bruno Vendedor', 1], ['Sem responsável', 1]]);
    const a = await s.req('atendente', '/api/tarefas/atrasadas?escopo=todas');
    assert.equal(a.corpo.escopo, 'minhas', 'atendente não pede a equipe');
    assert.deepEqual(a.corpo.itens.map(i => i.id), [T(2), T(1)]);
    assert.equal((await s.req(null, '/api/tarefas/atrasadas')).status, 401);
    assert.equal((await s.req('agenda', '/api/tarefas/atrasadas')).status, 403);
  } finally { await s.fechar(); }
});

test('R18: concluir em lote grava quem concluiu, audita, pula a de colega e Desfazer reabre', async () => {
  const s = await montar();
  try {
    const r = await s.req('atendente', '/api/tarefas/lote', { body: { acao: 'concluir', ids: [T(1), T(2), T(3), T(6)] } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.atualizadas, 2);
    assert.deepEqual(r.corpo.pulados.map(p => [p.id, p.motivo]), [[T(3), 'é de colega'], [T(6), 'já foi fechada']]);
    const um = s.db.tarefas.find(t => t.id === T(1));
    assert.equal(um.status, 'feita'); assert.equal(um.concluida_por, PESSOAS.atendente.id);
    assert.equal(s.db.tarefas.length, 6, 'nada foi apagado');
    const aud = s.db.auditoria.find(a => a.acao === 'tarefas_lote');
    assert.ok(aud, 'o lote vai para a auditoria');
    assert.equal(aud.perfil_id, PESSOAS.atendente.id, 'registra quem fez: ' + JSON.stringify(Object.keys(aud)));
    assert.equal((aud.detalhes || {}).quantidade, 2);
    // alguém mexe na 2 depois: o Desfazer não passa por cima
    s.db.tarefas.find(t => t.id === T(2)).vence_em = iso(Date.now() + 864e5);
    const d = await s.req('atendente', '/api/tarefas/lote/desfazer', { body: { itens: r.corpo.feitos } });
    assert.equal(d.status, 200);
    assert.equal(d.corpo.voltaram, 1); assert.deepEqual(d.corpo.pulados, [T(2)]);
    assert.equal(s.db.tarefas.find(t => t.id === T(1)).status, 'aberta');
    assert.ok(s.db.auditoria.some(a => a.acao === 'tarefas_lote_desfeito'));
  } finally { await s.fechar(); }
});

test('R18: passar para hoje/amanhã muda só o prazo; reatribuir confere a pessoa; Desfazer volta', async () => {
  const s = await montar();
  try {
    const antes = s.db.tarefas.find(t => t.id === T(1)).vence_em;
    const a = await s.req('gestor', '/api/tarefas/lote', { body: { acao: 'amanha', ids: [T(1), T(4)] } });
    assert.equal(a.corpo.atualizadas, 2);
    const t1 = s.db.tarefas.find(t => t.id === T(1));
    assert.equal(t1.vence_em, C.novoPrazo('amanha', Date.now())); assert.equal(t1.status, 'aberta'); assert.equal(t1.responsavel_id, PESSOAS.atendente.id);
    const lista = await s.req('gestor', '/api/tarefas/atrasadas');
    assert.ok(!lista.corpo.itens.some(i => i.id === T(1)), 'saiu das atrasadas');
    await s.req('gestor', '/api/tarefas/lote/desfazer', { body: { itens: a.corpo.feitos } });
    assert.equal(s.db.tarefas.find(t => t.id === T(1)).vence_em, antes);

    assert.equal((await s.req('gestor', '/api/tarefas/lote', { body: { acao: 'reatribuir', ids: [T(1)], responsavel_id: PESSOAS.agenda.id } })).status, 400, 'quem é só da Agenda não recebe');
    assert.equal((await s.req('gestor', '/api/tarefas/lote', { body: { acao: 'reatribuir', ids: [T(1)], responsavel_id: PESSOAS.desativado.id } })).status, 400);
    const r = await s.req('gestor', '/api/tarefas/lote', { body: { acao: 'reatribuir', ids: [T(1), T(3)], responsavel_id: PESSOAS.atendente2.id } });
    assert.equal(r.corpo.atualizadas, 1); assert.equal(r.corpo.pulados[0].motivo, 'já é dessa pessoa');
    assert.equal(r.corpo.para.nome, 'Bruno Vendedor');
    assert.equal(s.db.tarefas.find(t => t.id === T(1)).responsavel_id, PESSOAS.atendente2.id);
    const d = await s.req('gestor', '/api/tarefas/lote/desfazer', { body: { itens: r.corpo.feitos } });
    assert.equal(d.corpo.voltaram, 1);
    assert.equal(s.db.tarefas.find(t => t.id === T(1)).responsavel_id, PESSOAS.atendente.id);
    // a rota de sempre continua: /api/tarefas/lote não virou "tarefa lote"
    assert.equal((await s.req('gestor', '/api/tarefas/lote', { method: 'GET' })).status, 405);
    assert.equal((await s.req('gestor', '/api/tarefas/lote/desfazer', { body: { itens: [{ id: 'x' }] } })).corpo.voltaram, 0);
  } finally { await s.fechar(); }
});

test('R18: agendados sem horário — quem tem horário fica de fora; atendente vê só os dele', async () => {
  const s = await montar();
  try {
    const g = await s.req('gestor', '/api/agendados-sem-horario');
    assert.equal(g.status, 200);
    assert.deepEqual(g.corpo.itens.map(i => i.id).sort(), [L(1), L(3)].sort(), 'o 2 tem horário na Agenda');
    const a = await s.req('atendente', '/api/agendados-sem-horario');
    assert.deepEqual(a.corpo.itens.map(i => i.id), [L(1)]);
  } finally { await s.fechar(); }
});

test('R18: a tela carrega as contas antes, guarda no service worker e o CSS segue as regras', () => {
  const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
  const html = pub('index.html'), sw = pub('sw.js'), css = pub('r18.css'), js = pub('r18.js');
  assert.ok(html.indexOf('src="r18-casa.js"') < html.indexOf('src="r18.js"'));
  assert.ok(html.indexOf('src="r18.js"') > html.indexOf('src="r17.js"'));
  assert.ok(html.indexOf('href="r18.css"') > html.indexOf('href="r17.css"'));
  for (const f of ['r18.css', 'r18-casa.js', 'r18.js']) assert.ok(sw.includes(`'${f}'`), f);
  assert.match(sw, /indycar-crm-v2[2-9]\b/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css), 'cores só por variável');
  assert.ok(!/border-(left|right|top|bottom):\s*[3-9]px/.test(css));
  assert.match(js, /confirm\(C18\.textoConfirmar/);
  assert.match(js, /'Desfazer', \(\) => desfazer18\(feitos\)/);
  assert.ok(!/DELETE/.test(js), 'nada é apagado');
});
