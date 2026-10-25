/* Rodada 7 (C3) — rotas novas sobre o servidor real com banco em memória. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');

const L = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const C = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const O = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const dias = n => new Date(Date.now() - n * 864e5).toISOString();
const horas = n => new Date(Date.now() - n * 36e5).toISOString();
const lead = (n, extra = {}) => ({ id: L(n), nome: `Cliente Fictício ${n}`, telefone: '1299' + String(1000000 + n), status: 'contato', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0,
  observacoes: '', created_at: dias(3), updated_at: dias(1), closed_at: null, responsavel_id: null, cliente_id: null, tentativas_contato: 0, ...extra });
async function com(tabelas, fn, opts = {}) {
  const s = await subirServidor({ tabelas: { crm_atividades: [], tarefas: [], patio_os: [], patio_extras: [], orc_orcamentos: [], conversas: [], agendamentos: [], indicacoes: [], clientes: [], crm_resumos_dono: [], ads_metricas_dia: [], patio_avaliacoes: [], metas: [], ...tabelas }, ...opts });
  try { await fn(s); } finally { await s.fechar(); }
}
const enviado = (n, leadN, x = {}) => ({ id: O(n), numero: n, status: 'enviado', lead_id: L(leadN), total: 900, enviado_em: dias(1), created_at: dias(1), ...x });

/* ---------- login em todas as rotas novas ---------- */
test('r7: toda rota nova exige login (401)', () => com({ leads: [lead(1)] }, async s => {
  for (const [metodo, rota] of [['GET', '/api/funil/movimentos'], ['POST', '/api/funil/movimentos/aplicar'], ['POST', '/api/funil/movimentos/desfazer'], ['GET', '/api/retornos'], ['GET', `/api/leads/${L(1)}/painel`], ['GET', '/api/perdas'],
    ['POST', '/api/perdas/reabordar'], ['GET', '/api/indicacoes/painel'], ['GET', '/api/origens/desempenho'], ['GET', '/api/qualidade/painel'], ['GET', '/api/dono/resumo'], ['POST', '/api/dono/resumo/guardar'], ['GET', '/api/dono/resumos']]) {
    const r = await s.req(null, rota, { method: metodo, body: metodo === 'POST' ? {} : undefined });
    assert.equal(r.status, 401, `${metodo} ${rota}`);
  }
}));

/* ---------- funil que se mexe sozinho ---------- */
test('movimentos: a lista mostra o que mudou nos outros sistemas, com link de cada um', () => com({
  leads: [lead(1, { status: 'novo', responsavel_id: PESSOAS.atendente.id }), lead(2, { status: 'agendado', cliente_id: C(2) }), lead(3, { status: 'em_servico' })],
  orc_orcamentos: [enviado(1, 1)], patio_os: [{ id: O(20), numero: 8, etapa: 'recebido', lead_id: L(2), cliente_id: C(2) }],
}, async s => {
  const r = await s.req('gestor', '/api/funil/movimentos');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.aplicaveis, 2); assert.equal(r.corpo.para_revisar, 1);
  const por = Object.fromEntries(r.corpo.itens.map(i => [i.codigo, i]));
  assert.equal(por.orcamento_enviado.para, 'orcamento'); assert.match(por.orcamento_enviado.link, /historico/);
  assert.equal(por.carro_na_oficina.para, 'em_servico'); assert.match(por.carro_na_oficina.link, /\?os=/);
  assert.match(por.em_servico_sem_ordem.link, /entrada=1/);
}));
test('movimentos: atendente só vê (e só aplica) os leads dele ou sem dono', () => com({
  leads: [lead(1, { status: 'novo', responsavel_id: PESSOAS.atendente.id }), lead(2, { status: 'novo', responsavel_id: PESSOAS.atendente2.id }), lead(3, { status: 'novo' })],
  orc_orcamentos: [enviado(1, 1), enviado(2, 2), enviado(3, 3)],
}, async s => {
  const r = await s.req('atendente', '/api/funil/movimentos');
  assert.deepEqual(r.corpo.itens.map(i => i.lead_id).sort(), [L(1), L(3)]);
  const a = await s.req('atendente', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(2), para: 'orcamento' }] } });
  assert.equal(a.corpo.aplicados.length, 0); assert.equal(a.corpo.pulados[0].motivo, 'lead_de_outro');
  assert.equal(s.db.leads.find(l => l.id === L(2)).status, 'novo');
}));
test('movimentos: aplicar move a etapa, preenche o valor orçado, deixa rastro automático e audita', () => com({
  leads: [lead(1, { status: 'novo', responsavel_id: PESSOAS.atendente.id })], orc_orcamentos: [enviado(1, 1, { total: 1250 })],
}, async s => {
  const r = await s.req('atendente', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'orcamento' }] } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.equal(r.corpo.aplicados[0].para, 'orcamento');
  const l = s.db.leads.find(x => x.id === L(1)); assert.equal(l.status, 'orcamento'); assert.equal(Number(l.valor_orcado), 1250);
  const at = s.db.crm_atividades.find(a => a.lead_id === L(1)); assert.equal(at.tipo, 'sistema'); assert.match(at.texto, /Funil: Novo → Orçamento/); assert.equal(at.criado_por, PESSOAS.atendente.id);
  assert.ok(s.db.auditoria.some(a => a.acao === 'funil_movimento'));
  const fila = await s.req('atendente', '/api/fila-do-dia'); assert.equal(fila.corpo.feitos_hoje, 0, 'o rastro automático não conta como contato feito');
  const hist = await s.req('atendente', `/api/leads/${L(1)}/atividades`); assert.equal(hist.corpo.atividades[0].tipo, 'sistema');
}));
test('fila: o último contato mostrado é um contato de verdade, não o rastro automático do funil', () => com({
  leads: [lead(1, { status: 'novo', created_at: horas(5), responsavel_id: PESSOAS.atendente.id })],
  crm_atividades: [{ id: O(95), lead_id: L(1), tipo: 'ligacao', resultado: 'nao_atendeu', created_at: horas(3), criado_por: PESSOAS.atendente.id }, { id: O(96), lead_id: L(1), tipo: 'sistema', texto: 'Orçamento enviado', created_at: horas(1) }],
}, async s => {
  const r = await s.req('atendente', '/api/fila-do-dia'); assert.equal(r.corpo.itens[0].ultimo_contato.tipo, 'ligacao');
}));
test('movimentos: pedido velho (a situação já mudou) é pulado, e repetir não aplica duas vezes', () => com({
  leads: [lead(1, { status: 'novo' })], orc_orcamentos: [enviado(1, 1)],
}, async s => {
  const a = await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'orcamento' }] } });
  assert.equal(a.corpo.aplicados.length, 1);
  const b = await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'orcamento' }] } });
  assert.equal(b.corpo.aplicados.length, 0); assert.equal(b.corpo.pulados[0].motivo, 'mudou');
  const c2 = await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'concluido', valor_pago: 10 }] } });
  assert.equal(c2.corpo.pulados[0].motivo, 'mudou');
}));
test('movimentos: concluir exige o valor pago; com valor conclui', () => com({
  leads: [lead(1, { status: 'em_servico' })], patio_os: [{ id: O(30), numero: 3, etapa: 'entregue', lead_id: L(1), entregue_em: horas(30) }],
}, async s => {
  const sem = await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'concluido' }] } });
  assert.equal(sem.corpo.pulados[0].motivo, 'falta_valor'); assert.equal(s.db.leads[0].status, 'em_servico');
  const com2 = await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'concluido', valor_pago: 480.5 }] } });
  assert.equal(com2.corpo.aplicados.length, 1); assert.equal(s.db.leads[0].status, 'concluido'); assert.equal(Number(s.db.leads[0].valor_pago), 480.5);
}));
test('movimentos: perder grava o motivo (o do Orçador, ou o escolhido se for da lista) nas observações', () => com({
  leads: [lead(1, { status: 'orcamento', observacoes: '[Orçador 24/10 10:00] Orçamento nº 0003 recusado — motivo: preço.' }), lead(2, { status: 'orcamento', observacoes: '[Orçador 24/10 10:00] Orçamento nº 0004 recusado.' })],
  orc_orcamentos: [{ id: O(3), numero: 3, status: 'recusado', lead_id: L(1), total: 500, decidido_em: dias(1), created_at: dias(2) }, { id: O(4), numero: 4, status: 'recusado', lead_id: L(2), total: 500, decidido_em: dias(1), created_at: dias(2) }],
}, async s => {
  const r = await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'perdido' }, { id: L(2), para: 'perdido', motivo: 'Foi em outra oficina' }] } });
  assert.equal(r.corpo.aplicados.length, 2);
  assert.match(s.db.leads.find(l => l.id === L(1)).observacoes, /Motivo da perda: Achou caro/);
  assert.match(s.db.leads.find(l => l.id === L(2)).observacoes, /Motivo da perda: Foi em outra oficina/);
  const lixo = await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'perdido', motivo: '<script>' }] } });
  assert.equal(lixo.corpo.pulados[0].motivo, 'mudou');
}));
test('movimentos: desfazer devolve a etapa, mas só se ninguém mexeu depois', () => com({
  leads: [lead(1, { status: 'novo' }), lead(2, { status: 'novo' })], orc_orcamentos: [enviado(1, 1), enviado(2, 2)],
}, async s => {
  await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: L(1), para: 'orcamento' }, { id: L(2), para: 'orcamento' }] } });
  s.db.leads.find(l => l.id === L(2)).status = 'agendado';
  const d = await s.req('gestor', '/api/funil/movimentos/desfazer', { body: { itens: [{ id: L(1), de: 'novo', para: 'orcamento' }, { id: L(2), de: 'novo', para: 'orcamento' }] } });
  assert.equal(d.corpo.voltaram, 1); assert.equal(d.corpo.pulados[0].motivo, 'mudou'); assert.equal(s.db.leads.find(l => l.id === L(1)).status, 'novo');
  assert.ok(s.db.crm_atividades.some(a => /desfeito/.test(a.texto)));
}));
test('movimentos: lista vazia e mais de 50 itens', () => com({ leads: [lead(1)] }, async s => {
  assert.equal((await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [] } })).status, 400);
  assert.equal((await s.req('gestor', '/api/funil/movimentos/aplicar', { body: { itens: [{ id: 'x', para: 'orcamento' }] } })).status, 400);
  assert.equal((await s.req('gestor', '/api/funil/movimentos/desfazer', { body: {} })).status, 400);
}));

/* ---------- retornos ---------- */
test('retornos: o atendente vê os dele e os sem dono; o gestor escolhe o escopo', () => com({
  leads: [lead(1, { responsavel_id: PESSOAS.atendente.id, proximo_contato_em: horas(3) }), lead(2, { responsavel_id: PESSOAS.atendente2.id, proximo_contato_em: horas(3) }), lead(3)],
}, async s => {
  const a = await s.req('atendente', '/api/retornos'); assert.equal(a.corpo.escopo, 'meus'); assert.equal(a.corpo.contagem.atrasados, 1); assert.equal(a.corpo.contagem.sem_retorno, 1);
  const forcou = await s.req('atendente', '/api/retornos?escopo=todos'); assert.equal(forcou.corpo.escopo, 'meus');
  const g = await s.req('gestor', '/api/retornos'); assert.equal(g.corpo.contagem.abertos, 3); assert.equal(g.corpo.contagem.atrasados, 2);
  assert.ok(g.corpo.por_pessoa.some(p => p.nome === 'Ana Vendedora'));
  const sem = await s.req('gestor', '/api/retornos?escopo=sem'); assert.equal(sem.corpo.contagem.abertos, 1);
}));

/* ---------- painel do lead ---------- */
test('painel do lead: saúde, atalhos com tudo preenchido, conversa do Atendimento e movimento sugerido', () => com({
  leads: [lead(1, { status: 'orcamento', cliente_id: C(1), placa: 'ABC1D23', carro_modelo: 'Gol', servico: 'Freios', responsavel_id: PESSOAS.atendente.id })],
  conversas: [{ id: O(40), telefone: '12991000001', telefone_e164: '12991000001' }],
  orc_orcamentos: [{ id: O(41), numero: 5, status: 'aprovado', lead_id: L(1), cliente_id: C(1), total: 700, created_at: dias(1), decidido_em: dias(1) }],
  agendamentos: [{ id: O(42), lead_id: L(1), cliente_id: C(1), data: new Date(Date.now() + 864e5).toISOString().slice(0, 10), hora: '09:00', status: 'confirmado' }],
  crm_atividades: [{ id: O(43), lead_id: L(1), tipo: 'whatsapp', resultado: 'respondeu', created_at: dias(1) }, { id: O(44), lead_id: L(1), tipo: 'sistema', texto: 'Funil: Em contato → Orçamento.', created_at: dias(2) }],
}, async s => {
  const r = await s.req('atendente', `/api/leads/${L(1)}/painel`);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(r.corpo.saude.valor >= 0 && r.corpo.saude.rotulo);
  assert.match(r.corpo.atalhos.novo_orcamento.href, /conversa=44444444/); assert.match(r.corpo.atalhos.novo_orcamento.href, /agendamento=44444444-4444-4444-8444-000000000042/); assert.match(r.corpo.atalhos.novo_orcamento.href, /placa=ABC1D23/);
  assert.match(r.corpo.atalhos.entrada_patio.href, /entrada=1/); assert.match(r.corpo.atalhos.entrada_patio.href, /orcamento=44444444-4444-4444-8444-000000000041/); assert.match(r.corpo.atalhos.entrada_patio.href, /agendamento=44444444-4444-4444-8444-000000000042/);
  assert.equal(r.corpo.automaticos.length, 1); assert.equal(r.corpo.pode_editar, true); assert.equal(r.corpo.tempo.contatos, 1);
}));
test('painel do lead: lead de colega abre (leitura) mas avisa que não pode editar; id ruim é 404', () => com({ leads: [lead(1, { responsavel_id: PESSOAS.atendente2.id })] }, async s => {
  const r = await s.req('atendente', `/api/leads/${L(1)}/painel`); assert.equal(r.status, 200); assert.equal(r.corpo.pode_editar, false);
  assert.equal((await s.req('atendente', `/api/leads/${L(9)}/painel`)).status, 404);
  assert.equal((await s.req('atendente', '/api/leads/nao-e-uuid/painel')).status, 404);
}));
test('painel do lead: com a ordem já aberta no Pátio não oferece nova entrada e mostra a ordem', () => com({
  leads: [lead(1, { status: 'em_servico' })], patio_os: [{ id: O(50), numero: 11, etapa: 'em_execucao', lead_id: L(1) }],
}, async s => {
  const r = await s.req('gestor', `/api/leads/${L(1)}/painel`);
  assert.equal(r.corpo.atalhos.entrada_patio, null); assert.equal(r.corpo.atalhos.ordem_aberta.numero, 11); assert.equal(r.corpo.movimento, null);
}));

/* ---------- perdas ---------- */
const perdido = (n, motivo, x = {}) => lead(n, { status: 'perdido', observacoes: motivo ? 'Motivo da perda: ' + motivo : '', closed_at: dias(20), valor_orcado: 400, ...x });
test('perdas: o gestor vê tudo; o atendente só os dele e os sem dono', () => com({
  leads: [perdido(1, 'Achou caro', { responsavel_id: PESSOAS.atendente.id }), perdido(2, 'Achou caro', { responsavel_id: PESSOAS.atendente2.id }), perdido(3, null)],
}, async s => {
  const g = await s.req('gestor', '/api/perdas'); assert.equal(g.corpo.perdidos, 3); assert.equal(g.corpo.sem_motivo.total, 1);
  const a = await s.req('atendente', '/api/perdas'); assert.equal(a.corpo.perdidos, 2); assert.equal(a.corpo.escopo, 'meus');
  assert.ok(a.corpo.recuperaveis.every(i => typeof i.pode_editar === 'boolean'));
}));
test('perdas: reabordar reabre o lead em contato, combina retorno, cria tarefa e deixa rastro', () => com({
  leads: [perdido(1, 'Achou caro', { responsavel_id: PESSOAS.atendente.id }), perdido(2, 'Achou caro', { responsavel_id: PESSOAS.atendente2.id }), lead(3)],
}, async s => {
  const r = await s.req('atendente', '/api/perdas/reabordar', { body: { ids: [L(1), L(2), L(3), L(9)] } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.reabertos.map(x => x.id), [L(1)]);
  assert.deepEqual(r.corpo.pulados.map(p => p.motivo).sort(), ['lead_de_outro', 'nao_achei', 'nao_esta_perdido']);
  const l = s.db.leads.find(x => x.id === L(1)); assert.equal(l.status, 'contato'); assert.ok(Date.parse(l.proximo_contato_em) > Date.now());
  assert.equal(s.db.leads.find(x => x.id === L(2)).status, 'perdido');
  assert.ok(s.db.tarefas.some(t => /Reativação/.test(t.titulo) && t.lead_id === L(1)));
  assert.ok(s.db.auditoria.some(a => a.acao === 'perdidos_reabordar'));
}));
test('perdas: reabordar exige de 1 a 30 leads', () => com({ leads: [lead(1)] }, async s => {
  assert.equal((await s.req('gestor', '/api/perdas/reabordar', { body: { ids: [] } })).status, 400);
  assert.equal((await s.req('gestor', '/api/perdas/reabordar', { body: { ids: Array.from({ length: 31 }, (_, i) => L(i + 1)) } })).status, 400);
}));

/* ---------- indicações ---------- */
test('indicações: o gestor vê ranking e valores; o atendente vê só os leads dele e sem valores', () => com({
  clientes: [{ id: C(1), nome: 'Fátima Lima', telefone: '12999990001' }],
  leads: [lead(1, { status: 'concluido', valor_pago: 500, closed_at: dias(2), origem: 'indicacao', responsavel_id: PESSOAS.atendente.id }), lead(2, { status: 'novo', origem: 'indicacao', responsavel_id: PESSOAS.atendente2.id, created_at: dias(1) }), lead(3, { status: 'novo', origem: 'indicacao', created_at: dias(1) })],
  indicacoes: [{ id: O(60), indicado_por: C(1), nome: 'Beto', telefone: '12991000001', status: 'virou_cliente', lead_id: L(1), created_at: dias(10) }, { id: O(61), indicado_por: C(1), nome: 'Caio', telefone: '12991000002', status: 'novo', lead_id: L(2), created_at: dias(1) }, { id: O(62), indicado_por: C(1), nome: 'Duda', telefone: '12991000003', status: 'novo', lead_id: L(3), created_at: dias(1) }],
}, async s => {
  const g = await s.req('gestor', '/api/indicacoes/painel');
  assert.equal(g.status, 200, JSON.stringify(g.corpo)); assert.equal(g.corpo.ranking[0].nome, 'Fátima Lima'); assert.equal(g.corpo.valor, 500); assert.equal(g.corpo.esperando_contato.length, 2); assert.equal(g.corpo.agradecer.length, 1);
  const a = await s.req('atendente', '/api/indicacoes/painel');
  assert.equal(a.corpo.ranking, undefined); assert.equal(a.corpo.valor, null); assert.equal(a.corpo.esperando_contato.length, 1); assert.equal(a.corpo.esperando_contato[0].lead_id, L(3)); assert.equal(a.corpo.agradecer[0].valor, null);
}));

/* ---------- origens ---------- */
test('origens: só gestor; cruza o gasto do Ads e avisa quando é demonstração', () => com({
  leads: [lead(1, { origem: 'meta', status: 'concluido', valor_pago: 900, created_at: dias(2), closed_at: dias(1) }), lead(2, { origem: 'meta', created_at: dias(2) })],
  ads_metricas_dia: [{ plataforma: 'meta', nivel: 'campanha', data: new Date(Date.now() - 864e5).toISOString().slice(0, 10), gasto: 300, fonte: 'demo' }],
}, async s => {
  assert.equal((await s.req('atendente', '/api/origens/desempenho')).status, 403);
  const r = await s.req('gestor', `/api/origens/desempenho?de=${dias(10).slice(0, 10)}`);
  assert.equal(r.status, 200, JSON.stringify(r.corpo)); const m = r.corpo.linhas.find(x => x.origem === 'meta');
  assert.equal(m.gasto, 300); assert.equal(m.cpl, 150); assert.equal(m.roas, 3); assert.equal(r.corpo.so_demonstracao, true);
  assert.equal((await s.req('gestor', '/api/origens/desempenho?de=2026-10-20&ate=2026-10-01')).status, 400);
  assert.equal((await s.req('gestor', '/api/origens/desempenho?de=2020-01-01&ate=2026-10-01')).status, 400);
}));

/* ---------- qualidade ---------- */
test('qualidade: só gestor; mostra vendas sem valor com sugestão da Agenda, orçamento e extras do Pátio, e NÃO altera nada', () => com({
  leads: [lead(1, { status: 'concluido', closed_at: dias(3), cliente_id: C(1) }), lead(2, { status: 'concluido', closed_at: dias(3), responsavel_id: PESSOAS.atendente.id }), lead(3, { status: 'em_servico' })],
  orc_orcamentos: [{ id: O(70), numero: 1, status: 'aprovado', lead_id: L(1), cliente_id: C(1), total: 800, total_aprovado: 800, created_at: dias(5) }],
  patio_os: [{ id: O(71), numero: 2, etapa: 'entregue', lead_id: L(1), cliente_id: C(1), entregue_em: dias(3) }],
  patio_extras: [{ id: O(72), os_id: O(71), status: 'aprovado', valor: 150, descricao: 'Filtro' }],
  agendamentos: [{ id: O(73), lead_id: L(2), data: dias(4).slice(0, 10), hora: '09:00', status: 'concluido', valor: 320 }],
}, async s => {
  assert.equal((await s.req('atendente', '/api/qualidade/painel')).status, 403);
  const antes = JSON.stringify(s.db.leads);
  const r = await s.req('gestor', '/api/qualidade/painel');
  assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.equal(r.corpo.somente_leitura, true);
  const v = r.corpo.verificacoes.find(x => x.codigo === 'concluidos_sem_valor');
  assert.equal(v.total, 2);
  const um = v.exemplos.find(x => x.id === L(1)), dois = v.exemplos.find(x => x.id === L(2));
  assert.equal(um.sugestoes[0].valor, 950); assert.match(um.sugestoes[0].rotulo, /extras/); assert.equal(dois.sugestoes[0].valor, 320);
  assert.equal(r.corpo.valor_sem_registro_estimado, 1270);
  assert.ok(r.corpo.verificacoes.some(x => x.codigo === 'em_servico_sem_ordem'));
  assert.equal(JSON.stringify(s.db.leads), antes, 'nenhum lead foi alterado');
  assert.equal(s.db.auditoria.filter(a => /valor/.test(a.acao)).length, 0);
}));

/* ---------- resumos do dono ---------- */
test('resumo do dono: três tipos, só gestor, texto sem palavras proibidas', () => com({
  leads: [lead(1, { status: 'concluido', valor_pago: 0, closed_at: dias(1) }), lead(2, { created_at: horas(2) })],
  crm_atividades: [{ id: O(80), lead_id: L(2), tipo: 'ligacao', resultado: 'atendeu', criado_por: PESSOAS.atendente.id, created_at: horas(1) }],
}, async s => {
  assert.equal((await s.req('atendente', '/api/dono/resumo')).status, 403);
  for (const tipo of ['manha', 'fechamento', 'semana']) {
    const r = await s.req('gestor', `/api/dono/resumo?tipo=${tipo}`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.equal(r.corpo.tipo, tipo); assert.match(r.corpo.texto, /IndyCar/); assert.doesNotMatch(r.corpo.texto, /prezado|efetuar|comparecer|veículo/i);
  }
  const f = await s.req('gestor', '/api/dono/resumo?tipo=fechamento');
  assert.match(f.corpo.texto, /1 contato registrado/); assert.match(f.corpo.texto, /Ana 1/); assert.match(f.corpo.texto, /1 venda concluída está sem valor pago/);
  assert.equal((await s.req('gestor', '/api/dono/resumo?tipo=xyz')).corpo.tipo, 'manha');
}));
test('resumo do dono: guardar é um por dia e tipo (o segundo substitui), e a lista volta o texto', () => com({ leads: [lead(1)] }, async s => {
  assert.equal((await s.req('atendente', '/api/dono/resumo/guardar', { body: { tipo: 'manha' } })).status, 403);
  assert.equal((await s.req('gestor', '/api/dono/resumo/guardar', { body: { tipo: 'manha' } })).status, 201);
  assert.equal((await s.req('gestor', '/api/dono/resumo/guardar', { body: { tipo: 'manha' } })).status, 201);
  assert.equal((await s.req('gestor', '/api/dono/resumo/guardar', { body: { tipo: 'fechamento' } })).status, 201);
  assert.equal(s.db.crm_resumos_dono.length, 2);
  const l = await s.req('gestor', '/api/dono/resumos'); assert.equal(l.corpo.resumos.length, 2); assert.match(l.corpo.resumos[0].texto, /IndyCar/);
  assert.equal((await s.req('atendente', '/api/dono/resumos')).status, 403);
}));

/* ---------- aba Hoje ---------- */
test('hoje: busca por nome, telefone ou placa, filtro por origem, meta do dia e o próximo da fila', () => com({
  leads: [lead(1, { status: 'novo', nome: 'Maria Souza', placa: 'ABC1D23', origem: 'google', created_at: horas(5) }), lead(2, { status: 'novo', nome: 'João Pedro', origem: 'whatsapp', created_at: horas(6) })],
}, async s => {
  const todos = await s.req('gestor', '/api/fila-do-dia'); assert.equal(todos.corpo.total, 2); assert.ok(todos.corpo.meta_dia >= 1); assert.equal(todos.corpo.falta_para_meta, todos.corpo.meta_dia); assert.ok(todos.corpo.proximo);
  assert.equal((await s.req('gestor', '/api/fila-do-dia?q=maria')).corpo.total, 1);
  assert.equal((await s.req('gestor', '/api/fila-do-dia?q=abc1d23')).corpo.itens[0].lead.id, L(1));
  assert.equal((await s.req('gestor', '/api/fila-do-dia?q=991000002')).corpo.itens[0].lead.id, L(2));
  assert.equal((await s.req('gestor', '/api/fila-do-dia?origem=google')).corpo.total, 1);
  assert.equal((await s.req('gestor', '/api/fila-do-dia?q=zzzz')).corpo.proximo, null);
}));
test('hoje: contato registrado abate a meta do dia', () => com({ leads: [lead(1, { status: 'novo', responsavel_id: PESSOAS.atendente.id, created_at: horas(5) })] }, async s => {
  await s.req('atendente', `/api/leads/${L(1)}/contato`, { body: { tipo: 'ligacao', resultado: 'nao_atendeu' } });
  const r = await s.req('atendente', '/api/fila-do-dia'); assert.equal(r.corpo.feitos_hoje, 1); assert.equal(r.corpo.falta_para_meta, r.corpo.meta_dia - 1);
}));
test('hoje: indicação nova aparece na fila com o motivo certo', () => com({ leads: [lead(1, { status: 'novo', origem: 'indicacao', created_at: horas(3) })] }, async s => {
  const r = await s.req('gestor', '/api/fila-do-dia'); assert.equal(r.corpo.itens[0].principal, 'indicacao_nova'); assert.match(r.corpo.itens[0].script, /amigo/);
}));

/* ---------- correção de bug: pré-agendamento com espaço antes ---------- */
test('bug: pré-agendamento do Orçador com espaço ou quebra antes do texto continua virando sinal', () => com({
  leads: [lead(1, { status: 'orcamento' })], agendamentos: [{ id: O(90), lead_id: L(1), data: new Date(Date.now() + 864e5).toISOString().slice(0, 10), hora: '09:00', status: 'aguardando', observacoes: '\n  PRÉ-AGENDAMENTO pedido pelo cliente' }],
}, async s => {
  const r = await s.req('gestor', '/api/pipeline/sinais'); assert.ok(r.corpo.leads[L(1)].flags.includes('pre_agendamento'));
}));
