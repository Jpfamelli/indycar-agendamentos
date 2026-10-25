/* Rodada 6 (C2) — rotas novas sobre banco em memória: sinais ao vivo, contato/follow-up, cadência,
   lote, fila do dia, entregues sem fechar, ROI por campanha, qualidade e resumo do dono. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');

const L = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const C = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const O = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const dias = n => new Date(Date.now() - n * 864e5).toISOString();
const horas = n => new Date(Date.now() - n * 36e5).toISOString();
const lead = (n, extra = {}) => ({ id: L(n), nome: `Cliente Fictício ${n}`, telefone: '1299' + String(1000000 + n), status: 'novo', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0,
  observacoes: '', created_at: dias(3), updated_at: dias(1), closed_at: null, responsavel_id: null, cliente_id: null, tentativas_contato: 0, ...extra });

async function com(tabelas, fn, opts = {}) {
  const s = await subirServidor({ tabelas: { crm_atividades: [], tarefas: [], patio_os: [], patio_extras: [], orc_orcamentos: [], conversas: [], agendamentos: [], ...tabelas }, ...opts });
  try { await fn(s); } finally { await s.fechar(); }
}

test('sinais: carro no pátio, orçamento parado, entregue e conversa esperando aparecem no lead certo', () => com({
  leads: [lead(1, { status: 'agendado', responsavel_id: PESSOAS.atendente.id, cliente_id: C(1) }), lead(2, { status: 'orcamento', cliente_id: C(2) }), lead(3, { status: 'em_servico', cliente_id: C(3) })],
  patio_os: [{ id: O(1), numero: 7, etapa: 'pronto', etapa_em: horas(2), lead_id: L(1), cliente_id: C(1) }, { id: O(3), numero: 9, etapa: 'entregue', entregue_em: horas(30), lead_id: L(3), cliente_id: C(3) }],
  orc_orcamentos: [{ id: O(2), numero: 12, status: 'enviado', cliente_id: C(2), lead_id: L(2), total: 900, enviado_em: dias(4) }],
}, async s => {
  const r = await s.req('gestor', '/api/pipeline/sinais');
  assert.equal(r.status, 200);
  assert.ok(r.corpo.leads[L(1)].flags.includes('pronto_retirar'));
  assert.ok(r.corpo.leads[L(2)].flags.includes('orcamento_parado'));
  assert.ok(r.corpo.leads[L(3)].flags.includes('entregue_fechar'));
  assert.ok(r.corpo.contagem && r.corpo.rotulos);
}));

test('contato: registra, atualiza o lead, move novo para contato e cria tarefa de retorno', () => com({ leads: [lead(1, { responsavel_id: PESSOAS.atendente.id })] }, async s => {
  const r = await s.req('atendente', `/api/leads/${L(1)}/contato`, { body: { tipo: 'ligacao', resultado: 'atendeu', texto: 'Quer orçar freio', proximo: '3d', criar_tarefa: true } });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(r.corpo.lead.status, 'contato');
  assert.ok(r.corpo.lead.proximo_contato_em);
  assert.ok(r.corpo.tarefa);
  assert.equal(s.db.crm_atividades.length, 1);
  assert.equal(s.db.leads.find(l => l.id === L(1)).tentativas_contato, 0);
  assert.ok((s.db.auditoria || []).some(a => a.acao === 'lead_contato' && a.registro_id === L(1)), 'contato auditado');
  const h = await s.req('atendente', `/api/leads/${L(1)}/atividades`);
  assert.equal(h.corpo.atividades.length, 1);
  assert.equal(h.corpo.atividades[0].resultado_rotulo, 'Atendeu');
}));

test('contato: 4 tentativas sem resposta sugerem marcar como perdido', () => com({ leads: [lead(1, { status: 'contato', tentativas_contato: 3, responsavel_id: PESSOAS.atendente.id })] }, async s => {
  const r = await s.req('atendente', `/api/leads/${L(1)}/contato`, { body: { tipo: 'ligacao', resultado: 'nao_atendeu' } });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.lead.tentativas_contato, 4);
  assert.ok(r.corpo.sugestao);
}));

test('contato: atendente não mexe no lead do colega; gestor mexe; entrada inválida volta 400', () => com({ leads: [lead(1, { responsavel_id: PESSOAS.atendente2.id })] }, async s => {
  const nega = await s.req('atendente', `/api/leads/${L(1)}/contato`, { body: { tipo: 'nota', texto: 'oi' } });
  assert.equal(nega.status, 403); assert.equal(nega.corpo.codigo, 'lead_de_outro');
  assert.equal(s.db.crm_atividades.length, 0);
  const ok = await s.req('gestor', `/api/leads/${L(1)}/contato`, { body: { tipo: 'nota', texto: 'conversei' } });
  assert.equal(ok.status, 201);
  const ruim = await s.req('gestor', `/api/leads/${L(1)}/contato`, { body: { tipo: 'pombo-correio' } });
  assert.equal(ruim.status, 400);
  assert.equal((await s.req('gestor', `/api/leads/nao-e-uuid/contato`, { body: { tipo: 'nota' } })).status, 404);
}));

test('cadência: cria as tarefas uma vez só e respeita o lead do colega', () => com({ leads: [lead(1, { responsavel_id: PESSOAS.atendente.id }), lead(2, { responsavel_id: PESSOAS.atendente2.id })] }, async s => {
  const a = await s.req('atendente', `/api/leads/${L(1)}/cadencia`, { body: { tipo: 'orcamento' } });
  assert.equal(a.status, 201, JSON.stringify(a.corpo));
  assert.ok(a.corpo.criadas.length >= 2);
  const b = await s.req('atendente', `/api/leads/${L(1)}/cadencia`, { body: { tipo: 'orcamento' } });
  assert.equal(b.corpo.criadas.length, 0);
  assert.equal(s.db.leads.find(l => l.id === L(1)).proximo_contato_em, a.corpo.criadas[0].vence_em);
  assert.equal((await s.req('atendente', `/api/leads/${L(2)}/cadencia`, { body: { tipo: 'orcamento' } })).status, 403);
}));

test('lote: adia só os leads que a pessoa pode editar e ignora fechados', () => com({
  leads: [lead(1, { responsavel_id: PESSOAS.atendente.id }), lead(2, { responsavel_id: PESSOAS.atendente2.id }), lead(3, { status: 'perdido' }), lead(4)],
}, async s => {
  const r = await s.req('atendente', '/api/leads/followup-lote', { body: { ids: [L(1), L(2), L(3), L(4)], proximo: 'amanha' } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.ids.sort(), [L(1), L(4)].sort());
  assert.equal(r.corpo.de_colegas, 1); assert.equal(r.corpo.fechados, 1);
  assert.ok(L(1) in r.corpo.anteriores && L(4) in r.corpo.anteriores, 'anteriores para desfazer');
  assert.equal((await s.req('atendente', '/api/leads/followup-lote', { body: { ids: [], proximo: 'amanha' } })).status, 400);
  const limpa = await s.req('atendente', '/api/leads/followup-lote', { body: { ids: [L(1)], limpar: true } });
  assert.equal(limpa.status, 200); assert.equal(limpa.corpo.proximo_contato_em, null);
}));

test('fila do dia: atendente vê só a dele (e sem dono); gestor vê tudo; ordem por urgência', () => com({
  leads: [lead(1, { responsavel_id: PESSOAS.atendente.id, created_at: horas(5) }), lead(2, { responsavel_id: PESSOAS.atendente2.id, created_at: horas(5) }),
    lead(3, { status: 'contato', responsavel_id: PESSOAS.atendente.id, proximo_contato_em: horas(3), created_at: dias(5) }), lead(4, { status: 'concluido' })],
}, async s => {
  const a = await s.req('atendente', '/api/fila-do-dia');
  assert.equal(a.status, 200);
  const ids = a.corpo.itens.map(i => i.lead.id);
  assert.ok(ids.includes(L(1)) && ids.includes(L(3)) && !ids.includes(L(2)) && !ids.includes(L(4)));
  assert.ok(a.corpo.itens.every(i => i.script && i.texto));
  const g = await s.req('gestor', '/api/fila-do-dia');
  assert.ok(g.corpo.itens.map(i => i.lead.id).includes(L(2)));
  assert.ok(g.corpo.itens[0].score >= g.corpo.itens[g.corpo.itens.length - 1].score);
  const sem = await s.req('gestor', '/api/fila-do-dia?escopo=sem');
  assert.ok(sem.corpo.itens.length === 0 || sem.corpo.itens.every(i => !i.lead.responsavel_id));
  assert.equal((await s.req('atendente', '/api/fila-do-dia?escopo=todos')).corpo.escopo, 'meus');
}));

test('entregues sem fechar: traz sugestão de valor pelo orçamento aprovado + extras', () => com({
  leads: [lead(1, { status: 'em_servico', cliente_id: C(1), responsavel_id: PESSOAS.atendente.id })],
  patio_os: [{ id: O(1), numero: 3, etapa: 'entregue', entregue_em: horas(50), lead_id: L(1), cliente_id: C(1) }],
  patio_extras: [{ id: O(5), os_id: O(1), valor: 120, status: 'aprovado' }],
  orc_orcamentos: [{ id: O(2), numero: 21, status: 'aprovado', cliente_id: C(1), lead_id: L(1), total: 800, total_aprovado: 750 }],
}, async s => {
  const r = await s.req('atendente', '/api/entregues-sem-fechar');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.total, 1);
  const it = r.corpo.itens[0];
  assert.equal(it.extras_aprovados, 120); assert.equal(it.orcamento.total, 750); assert.equal(it.pode_editar, true);
  assert.ok(it.sugestoes.length >= 1);
}));

test('ROI por campanha, qualidade e dono: só gestor; atendente leva 403; números dos outros sistemas', () => com({
  leads: [lead(1, { status: 'concluido', valor_pago: 1000, utm_campaign: 'freios-taubate', origem: 'meta', closed_at: horas(2), responsavel_id: PESSOAS.atendente.id }), lead(2, { utm_campaign: 'freios-taubate', origem: 'meta' }), lead(3, { telefone: '' }), lead(4, { status: 'perdido', closed_at: horas(3), observacoes: 'Motivo da perda: Achou caro' })],
  ads_metricas_dia: [{ id: 1, plataforma: 'meta', data: new Date().toISOString().slice(0, 10), nivel: 'campanha', campanha_nome: 'Freios Taubaté', gasto: 200, cliques: 50, impressoes: 900, conversoes: 2, valor_conversao: 0, fonte: 'demo' }],
  ads_alertas: [{ id: 1, severidade: 'alta', mensagem: 'CPL subiu', entidade_nome: 'Freios', criado_em: horas(1), lido_em: null }],
  metas: [{ perfil_id: null, mes: new Date().toISOString().slice(0, 7) + '-01', leads: 50, agendamentos: 30, vendas: 20, faturamento: 40000 }],
  patio_os: [{ id: O(1), numero: 1, etapa: 'pronto', etapa_em: horas(2), lead_id: L(2) }, { id: O(2), numero: 2, etapa: 'em_execucao', etapa_em: horas(5) }],
  orc_orcamentos: [{ id: O(3), numero: 1, status: 'enviado', total: 900, enviado_em: dias(3), created_at: dias(3), lead_id: L(2) }, { id: O(4), numero: 2, status: 'aprovado', total: 500, created_at: dias(1) }],
  conversas: [{ id: O(5), telefone_e164: '12991000002', aguardando_consultor: true, aguardando_desde: horas(7) }],
  patio_avaliacoes: [{ os_id: O(1), nota: 2, comentario: 'Demorou', created_at: dias(2) }, { os_id: O(2), nota: 5, created_at: dias(1) }],
  agendamentos: [{ id: O(6), status: 'nao_veio', data: new Date().toISOString().slice(0, 10) }, { id: O(7), status: 'concluido', data: new Date().toISOString().slice(0, 10) }],
}, async s => {
  for (const rota of ['/api/roi/campanhas', '/api/qualidade', '/api/dono']) assert.equal((await s.req('atendente', rota)).status, 403, rota);
  const roi = await s.req('gestor', '/api/roi/campanhas');
  assert.equal(roi.status, 200, JSON.stringify(roi.corpo));
  assert.equal(roi.corpo.campanhas[0].leads, 2); assert.equal(roi.corpo.campanhas[0].roas, 5);
  assert.equal(roi.corpo.alertas.length, 1); assert.equal(roi.corpo.so_demonstracao, true);
  assert.equal((await s.req('gestor', '/api/roi/campanhas?de=2026-10-10&ate=2026-10-01')).status, 400);
  assert.equal((await s.req('gestor', '/api/roi/campanhas?de=2024-01-01&ate=2026-10-01')).status, 400);
  const q = await s.req('gestor', '/api/qualidade');
  assert.equal(q.status, 200); assert.equal(q.corpo.sem_telefone_valido.total, 1);
  const d = await s.req('gestor', '/api/dono');
  assert.equal(d.status, 200, JSON.stringify(d.corpo));
  assert.match(d.corpo.texto_whatsapp, /IndyCar · resumo/);
  assert.equal(d.corpo.patio.no_patio, 2); assert.equal(d.corpo.patio.prontos, 1);
  assert.equal(d.corpo.orcamentos.enviados, 1); assert.equal(d.corpo.orcamentos.parados, 1); assert.equal(d.corpo.orcamentos.aprovados_sem_horario, 1);
  assert.equal(d.corpo.conversas.esperando, 1); assert.ok(d.corpo.conversas.maior_espera_h >= 6);
  assert.equal(d.corpo.avaliacoes.detratores, 1); assert.equal(d.corpo.avaliacoes.total, 2);
  assert.equal(d.corpo.agenda.no_show_pct, 50);
  assert.equal(d.corpo.ads.alertas, 1); assert.equal(d.corpo.ads.gasto_mes, 200);
  assert.equal(d.corpo.perdas[0].motivo, 'Achou caro');
  assert.equal(d.corpo.mes.meta_loja.faturamento, 40000); assert.ok(d.corpo.mes.ritmo.pct >= 0);
  assert.ok(d.corpo.insights.some(i => /esperando resposta/.test(i.texto)));
}));

test('ecossistema: devolve a ficha enriquecida e o link do Orçador abre a rota certa', () => com({ leads: [lead(1, { cliente_id: C(1), responsavel_id: PESSOAS.atendente.id })], patio_avaliacoes: [{ os_id: O(5), nota: 5, comentario: 'Top', created_at: dias(1) }], patio_extras: [{ id: O(8), os_id: O(5), valor: 100, status: 'aprovado' }, { id: O(9), os_id: O(5), valor: 40, status: 'pendente' }] }, async s => {
  s.sb.rpcs.cliente_360 = () => ({ cliente: { id: C(1), nome: 'Cliente Fictício 1' }, telefone_55: '5512991000001', patio: [{ id: O(5), numero: 4, etapa: 'entregue' }], orcamentos: [{ id: O(9), numero: 5, status: 'enviado' }], agendamentos: [], leads: [], tarefas: [] });
  const r = await s.req('atendente', `/api/leads/${L(1)}/ecossistema`);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(r.corpo.ficha.segmento !== undefined && Array.isArray(r.corpo.ficha.linha_do_tempo));
  assert.ok(r.corpo.proxima_acao && r.corpo.proxima_acao.script && !/R\$ ?\d/.test(r.corpo.proxima_acao.script));
  assert.equal(r.corpo.ficha.nota.media, 5); assert.equal(r.corpo.ficha.patio[0].extras_aprovados_valor, 100); assert.equal(r.corpo.ficha.patio[0].extras_total, 2);
  assert.match(r.corpo.links.orcamentos[O(9)], /#\/historico\//);
  assert.match(r.corpo.links.novoOrcamento, /tel=5512991000001|tel=12991000001/);
}, { prefixo: '/crm' }));

test('tela: scripts e estilos novos estão na página, no service worker v11 e com [hidden] protegido', () => {
  const fs = require('node:fs'), path = require('node:path');
  const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
  const html = pub('index.html'), sw = pub('sw.js'), css = pub('rodada6.css');
  assert.match(html, /<script src="rodada6\.js">/); assert.match(html, /href="rodada6\.css"/);
  assert.match(sw, /indycar-crm-v1[123]/); assert.match(sw, /'rodada6\.js'/); assert.match(sw, /'rodada6\.css'/);
  assert.ok(css.includes('[hidden]{display:none!important}'));
  assert.ok(!/\bfetch\(\s*['"`]\//.test(pub('rodada6.js')) && !/(href|src)="\/[a-z]/.test(html));
});
