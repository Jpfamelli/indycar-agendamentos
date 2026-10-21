/* Rodada 6, segunda leva (C5) — rotas novas do CRM sobre o servidor real com banco em memória. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');

const L = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const C = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const O = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const dias = n => new Date(Date.now() - n * 864e5).toISOString();
const lead = (n, extra = {}) => ({ id: L(n), nome: `Cliente Fictício ${n}`, telefone: '1299' + String(1000000 + n), status: 'orcamento', origem: 'site', valor_orcado: 0, valor_pago: 0,
  observacoes: '', created_at: dias(3), updated_at: dias(1), closed_at: null, responsavel_id: null, cliente_id: null, tentativas_contato: 0, ...extra });
async function com(tabelas, fn, opts = {}) {
  const s = await subirServidor({ tabelas: { crm_atividades: [], tarefas: [], patio_os: [], patio_extras: [], orc_orcamentos: [], conversas: [], agendamentos: [], ...tabelas }, ...opts });
  try { await fn(s); } finally { await s.fechar(); }
}

test('conexões: orçamento ao vivo vem da rpc do Orçador chamada COM O LOGIN da pessoa, não com a chave de serviço', () => com({
  leads: [lead(1, { responsavel_id: PESSOAS.atendente.id, observacoes: 'CARRO NO PÁTIO AGORA: OS nº 7 (pronto).\n[Orçador 20/10 09:00] Orçamento nº 0003 recusado — motivo: preço.', placa: 'ABC1D23' })],
  orc_orcamentos: [
    { id: O(1), numero: 3, status: 'recusado', lead_id: L(1), total: 900, decidido_em: dias(1), created_at: dias(4) },
    { id: O(2), numero: 4, status: 'enviado', lead_id: L(1), total: 400, enviado_em: dias(3), visualizado_em: dias(2), created_at: dias(3) }],
  patio_os: [{ id: O(5), numero: 7, etapa: 'pronto', etapa_em: dias(0), lead_id: L(1) }],
  agendamentos: [{ id: O(6), lead_id: L(1), data: '2026-10-30', hora: '08:00', status: 'aguardando', observacoes: 'PRÉ-AGENDAMENTO pedido… Orçamento nº 0004 (Orçador)' }],
}, async s => {
  const r = await s.req('atendente', `/api/leads/${L(1)}/conexoes`);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.orcamentos.itens.map(i => i.situacao.cod), ['visto', 'recusado']);
  assert.equal(r.corpo.orcamentos.itens[1].motivo, 'preço');
  assert.equal(r.corpo.orcamentos.resumo.esperando, 1);
  assert.equal(r.corpo.site.carro_no_patio.os_numero, 7);
  assert.equal(r.corpo.patio.carros[0].etapa_rotulo, 'Pronto');
  assert.equal(r.corpo.pre_agendamentos[0].orcamento_numero, 4);
  assert.match(r.corpo.links.novo_orcamento, /lead=22222222/); assert.match(r.corpo.links.novo_orcamento, /placa=ABC1D23/);
  const chamada = s.auth.rpcs.find(x => x.nome === 'orc_status_por_lead');
  assert.ok(chamada, 'chamou a rpc do Orçador'); assert.match(chamada.token, /^tok-/); assert.notEqual(chamada.apikey, 'servico-ficticia');
  assert.ok(!JSON.stringify(r.corpo).includes('tok-'), 'o token não volta na resposta');
}));

test('conexões: sem login de equipe ativa a rpc do Orçador volta vazia e a tela é avisada (não vira erro 500)', () => com({ leads: [lead(1)], orc_orcamentos: [{ id: O(1), numero: 1, status: 'enviado', lead_id: L(1), total: 10, created_at: dias(1) }] }, async s => {
  const r = await s.req('atendente', `/api/leads/${L(1)}/conexoes`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.orcamentos.itens.length, 1);
  s.db.perfis.find(p => p.id === PESSOAS.atendente.id).ativo = true;
  s.sb.falhar(['rpc:orc_status_por_lead']);
  const r2 = await s.req('atendente', `/api/leads/${L(1)}/conexoes`);
  assert.equal(r2.status, 200); assert.equal(r2.corpo.orcamentos.consultou_orcador, false);
  assert.ok(r2.corpo.avisos.some(a => /Orçamentos/.test(a)));
}));

test('conexões: lead inexistente 404, id inválido 404, sem login 401', () => com({ leads: [lead(1)] }, async s => {
  assert.equal((await s.req('gestor', `/api/leads/${L(9)}/conexoes`)).status, 404);
  assert.equal((await s.req('gestor', `/api/leads/nao-e-uuid/conexoes`)).status, 404);
  assert.equal((await s.req(null, `/api/leads/${L(1)}/conexoes`)).status, 401);
}));

test('conexões: as ações sugeridas e a linha do tempo vêm do r6_cliente_360 e links de fora são cortados', () => com({ leads: [lead(1)] }, async s => {
  s.sb.rpcs.r6_cliente_360 = () => ({ telefone_55: '5512991000001', cliente: { id: C(1) }, leads: [], patio: [], orcamentos: [], agendamentos: [], comunicar: [], tarefas: [], mensagens: [],
    acoes_sugeridas: [{ codigo: 'cobrar_orcamento', app: 'orcador', titulo: 'Cobrar', motivo: 'parado', link: 'https://indycar-orcador.netlify.app/#/historico/1' }, { codigo: 'responder', app: 'atendimento', titulo: 'Responder', link: 'https://evil.com/' }],
    linha_do_tempo: [{ quando: dias(1), tipo: 'orcamento', app: 'orcador', titulo: 'Orçamento enviado', link: 'javascript:1' }] });
  const r = await s.req('gestor', `/api/leads/${L(1)}/conexoes`);
  assert.equal(r.corpo.acoes_sugeridas.length, 2); assert.equal(r.corpo.acoes_sugeridas[1].link, null);
  assert.equal(r.corpo.linha_do_tempo[0].link, null);
}));

test('ecossistema e ficha 360 usam r6_cliente_360 e caem no cliente_360 se a função não existir', () => com({ leads: [lead(1)] }, async s => {
  const a = await s.req('gestor', `/api/leads/${L(1)}/ecossistema`);
  assert.equal(a.status, 200);
  assert.ok(s.sb.chamadas.some(c => c.rpc === 'r6_cliente_360') && s.sb.chamadas.some(c => c.rpc === 'cliente_360'), 'tentou a nova e caiu na antiga');
  s.sb.rpcs.r6_cliente_360 = (x) => ({ ...s.sb.rpcs.cliente_360(x), versao: 'r6' });
  const b = await s.req('gestor', `/api/clientes/360?tel=12991000001`);
  assert.equal(b.corpo.versao, 'r6');
}));

test('carros do Pátio: lista os que nenhum lead aberto enxerga, com link do Pátio', () => com({
  leads: [lead(1, { telefone: '12991000001' })], clientes: [{ id: C(2), nome: 'Dono do Carro', telefone: '12999990002' }],
  patio_os: [{ id: O(1), numero: 1, etapa: 'recebido', telefone: '12991000001' }, { id: O(2), numero: 2, etapa: 'teste', cliente_id: C(2), telefone: '12999990002', placa: 'XYZ9K88' }, { id: O(3), numero: 3, etapa: 'entregue' }],
}, async s => {
  const r = await s.req('atendente', '/api/patio/carros');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.total, 2); assert.equal(r.corpo.sem_lead_total, 1);
  assert.equal(r.corpo.sem_lead[0].nome, 'Dono do Carro'); assert.match(r.corpo.sem_lead[0].link, /indycar-patio\.netlify\.app\/\?os=/);
}));

test('busca entre sistemas: usa o login da pessoa, devolve só links da casa e recusa busca curta', () => com({}, async s => {
  s.sb.rpcs.r6_busca_global = (a, ctx) => ({ termo: a.p_termo, total: 1, grupos: { patio: [{ tipo: 'os', id: O(1), titulo: 'OS 5', app: 'patio', link: 'https://indycar-patio.netlify.app/?os=1' }, { tipo: 'os', id: O(2), titulo: 'OS 6', app: 'patio', link: 'https://evil.com' }] }, uid: ctx.uid });
  const r = await s.req('atendente', '/api/busca-tudo?q=ABC1D23');
  assert.equal(r.status, 200); assert.equal(r.corpo.grupos.patio.length, 2);
  assert.equal(r.corpo.grupos.patio[0].aba, 'indycar-patio'); assert.equal(r.corpo.grupos.patio[1].link, null);
  assert.ok(s.auth.rpcs.some(x => x.nome === 'r6_busca_global'));
  const curto = await s.req('atendente', '/api/busca-tudo?q=a');
  assert.equal(curto.status, 200); assert.ok(curto.corpo.aviso);
  assert.equal(s.auth.rpcs.filter(x => x.nome === 'r6_busca_global').length, 1, 'busca curta nem chega ao banco');
  assert.equal((await s.req(null, '/api/busca-tudo?q=abc')).status, 401);
}));

test('busca entre sistemas: banco fora do ar vira 503 em português', () => com({}, async s => {
  s.sb.rpcs.r6_busca_global = () => { throw new Error('boom'); };
  const r = await s.req('atendente', '/api/busca-tudo?q=abcd');
  assert.equal(r.status, 503); assert.match(r.corpo.erro, /busca/i);
}));

test('Agora na casa: atendente vê os números; só gestor recebe as frases de atenção', () => com({}, async s => {
  s.sb.rpcs.r6_agora = () => ({ kpis: { carros_no_patio: 3, carros_atrasados: 1, conversas_sem_resposta: 2 }, orcamentos: { valor_esperando: 800 }, patio: { por_etapa: [] } });
  const a = await s.req('atendente', '/api/agora');
  assert.equal(a.status, 200); assert.equal(a.corpo.kpis.carros_no_patio, 3); assert.deepEqual(a.corpo.atencao, []);
  const g = await s.req('gestor', '/api/agora');
  assert.equal(g.corpo.atencao.length, 2);
}));

test('ligações quebradas: só gestor', () => com({}, async s => {
  s.sb.rpcs.r6_ligacoes_quebradas = () => ({ total_problemas: 2, verificacoes: [{ codigo: 'os_sem_orcamento', app: 'patio', descricao: 'x', quantidade: 2, amostra: ['a'] }] });
  assert.equal((await s.req('atendente', '/api/ligacoes-quebradas')).status, 403);
  const g = await s.req('gestor', '/api/ligacoes-quebradas');
  assert.equal(g.status, 200); assert.equal(g.corpo.total_problemas, 2);
}));

test('sinais pelo servidor: orçamento visto, recusado e pré-agendamento chegam ao funil e à fila do dia', () => com({
  leads: [lead(1, { responsavel_id: PESSOAS.atendente.id, status: 'orcamento' }), lead(2, { responsavel_id: PESSOAS.atendente.id, status: 'orcamento' }), lead(3, { responsavel_id: PESSOAS.atendente.id, status: 'contato' })],
  orc_orcamentos: [{ id: O(1), numero: 1, status: 'enviado', lead_id: L(1), total: 100, enviado_em: dias(1), visualizado_em: dias(1), created_at: dias(1) }, { id: O(2), numero: 2, status: 'recusado', lead_id: L(2), total: 100, decidido_em: dias(1), created_at: dias(2) }],
  agendamentos: [{ id: O(3), lead_id: L(3), data: '2999-01-01', hora: '08:00', status: 'aguardando', observacoes: 'PRÉ-AGENDAMENTO x' }],
}, async s => {
  const r = await s.req('atendente', '/api/pipeline/sinais');
  assert.ok(r.corpo.leads[L(1)].flags.includes('orcamento_visto'));
  assert.ok(r.corpo.leads[L(2)].flags.includes('orcamento_recusado'));
  assert.ok(r.corpo.leads[L(3)].flags.includes('pre_agendamento'));
  assert.ok(r.corpo.rotulos.pre_agendamento);
  const f = await s.req('atendente', '/api/fila-do-dia');
  assert.equal(f.corpo.itens[0].principal, 'pre_agendamento');
}));

test('contato em lote: registra o mesmo contato em vários leads, pula os de colega e os fechados, audita uma vez', () => com({
  leads: [lead(1, { responsavel_id: PESSOAS.atendente.id, status: 'novo' }), lead(2, { responsavel_id: null, status: 'contato', tentativas_contato: 1 }), lead(3, { responsavel_id: PESSOAS.atendente2.id }), lead(4, { status: 'concluido', responsavel_id: PESSOAS.atendente.id })],
}, async s => {
  const r = await s.req('atendente', '/api/leads/contato-lote', { body: { ids: [L(1), L(2), L(3), L(4), L(9)], tipo: 'whatsapp', resultado: 'respondeu', texto: 'Avisei da promoção de revisão' } });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(r.corpo.registrados, 2); assert.equal(r.corpo.de_colegas, 1); assert.equal(r.corpo.fechados, 1); assert.equal(r.corpo.inexistentes, 1);
  assert.equal(s.db.crm_atividades.length, 2);
  assert.equal(s.db.leads.find(l => l.id === L(1)).status, 'contato', 'novo que respondeu vira Em contato');
  assert.equal(s.db.leads.find(l => l.id === L(2)).tentativas_contato, 0, 'contato de verdade zera as tentativas');
  assert.equal(s.db.leads.find(l => l.id === L(3)).ultimo_contato_em ?? null, null, 'lead de colega intacto');
  assert.equal(s.db.auditoria.filter(a => a.acao === 'lead_contato_lote').length, 1);
}));

test('contato em lote: validações (lista vazia, mais de 100, só nota, resultado inválido, sem login)', () => com({ leads: [lead(1)] }, async s => {
  const post = body => s.req('gestor', '/api/leads/contato-lote', { body });
  assert.equal((await post({ ids: [], tipo: 'whatsapp', resultado: 'respondeu' })).status, 400);
  assert.equal((await post({ ids: Array.from({ length: 101 }, (_, i) => L(i + 1)), tipo: 'whatsapp', resultado: 'respondeu' })).status, 400);
  assert.equal((await post({ ids: [L(1)], tipo: 'nota', texto: 'oi' })).status, 400);
  assert.equal((await post({ ids: [L(1)], tipo: 'ligacao', resultado: 'voou' })).status, 400);
  assert.equal((await s.req(null, '/api/leads/contato-lote', { body: { ids: [L(1)] } })).status, 401);
  assert.equal(s.db.crm_atividades.length, 0);
}));

test('fila do dia: cada item traz o último contato registrado (quem, quando, resultado) e quantos aparecem', () => com({
  leads: [lead(1, { responsavel_id: PESSOAS.atendente.id, status: 'contato', proximo_contato_em: dias(1) })],
  crm_atividades: [{ id: 'a1', lead_id: L(1), tipo: 'ligacao', resultado: 'nao_atendeu', texto: 'Caixa postal', criado_por: PESSOAS.atendente.id, created_at: dias(2) }, { id: 'a2', lead_id: L(1), tipo: 'whatsapp', resultado: 'respondeu', texto: 'Pediu para falar sexta', criado_por: PESSOAS.atendente.id, created_at: dias(1) }],
}, async s => {
  const r = await s.req('atendente', '/api/fila-do-dia');
  assert.equal(r.corpo.mostrando, 1);
  assert.equal(r.corpo.itens[0].ultimo_contato.resultado_rotulo, 'Respondeu'); assert.equal(r.corpo.itens[0].ultimo_contato.autor, 'Ana Vendedora');
}));

test('dono: tempo até o primeiro contato por pessoa (mediana em horas) e quantos ainda não receberam contato', () => com({
  leads: [
    lead(1, { responsavel_id: PESSOAS.atendente.id, created_at: dias(3), ultimo_contato_em: new Date(Date.now() - 3 * 864e5 + 2 * 36e5).toISOString() }),
    lead(2, { responsavel_id: PESSOAS.atendente.id, created_at: dias(2), ultimo_contato_em: new Date(Date.now() - 2 * 864e5 + 4 * 36e5).toISOString() }),
    lead(3, { responsavel_id: PESSOAS.atendente2.id, created_at: dias(2) })],
}, async s => {
  const r = await s.req('gestor', '/api/dono');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const pc = r.corpo.primeiro_contato;
  assert.equal(pc.com_contato, 2); assert.equal(pc.sem_contato, 1); assert.equal(pc.mediana_h, 3);
  assert.equal(pc.por_pessoa[0].nome, 'Ana Vendedora');
}));

test('tela: rodada6c está na página e no service worker v12, [hidden] protegido, sem fetch na raiz nem endereço de fora', () => {
  const fs = require('node:fs'), path = require('node:path');
  const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
  const html = pub('index.html'), sw = pub('sw.js'), css = pub('rodada6c.css'), js = pub('rodada6c.js');
  assert.match(html, /<script src="rodada6c\.js">/); assert.match(html, /href="rodada6c\.css"/);
  assert.match(sw, /indycar-crm-v12/); assert.match(sw, /'rodada6c\.js'/); assert.match(sw, /'rodada6c\.css'/);
  assert.ok(css.includes('[hidden]{display:none!important}'));
  assert.ok(!/\bfetch\(\s*['"`]\//.test(js));
  assert.ok(html.indexOf('rodada6c.js') > html.indexOf('rodada6.js'), 'carrega depois da rodada6.js');
  assert.ok(!/(onclick|onerror)=/.test(js), 'sem handler em atributo');
  // todo texto do banco que vira HTML passa por esc()
  assert.ok(!/\$\{(o|a|pa|carro|x|i)\.(titulo|motivo|servicos|nome|detalhe)\}/.test(js), 'campos de texto sem esc()');
});

test('funil do Orçador (Dono): só gestor, com o login dele; sem acesso ao Orçador vira aviso claro', () => com({}, async s => {
  s.sb.rpcs.orc_funil = (a, ctx) => ({ periodo_dias: a.p_dias, enviados: 10, vistos: 4, aprovados: 3, recusados: 2, decididos: 5, valor_perdido: 800, por_motivo: [{ codigo: 'preco', quantidade: 2, valor: 800 }], seguimento: {}, uid: ctx.uid });
  assert.equal((await s.req('atendente', '/api/orcador/funil')).status, 403);
  const g = await s.req('gestor', '/api/orcador/funil?dias=7');
  assert.equal(g.status, 200); assert.equal(g.corpo.periodo_dias, 7); assert.equal(g.corpo.taxa_visto, 40); assert.ok(g.corpo.insights.length >= 1);
  assert.equal((await s.req('gestor', '/api/orcador/funil?dias=9999')).corpo.periodo_dias, 90, 'teto de 90 dias');
  assert.ok(s.auth.rpcs.some(x => x.nome === 'orc_funil' && /^tok-/.test(x.token)));
  s.sb.rpcs.orc_funil = () => { const e = new Error('acesso negado'); e.code = '42501'; throw e; };
  const sem = await s.req('gestor', '/api/orcador/funil');
  assert.equal(sem.status, 503); assert.match(sem.corpo.erro, /acesso ao Orçador/);
}));

test('conexões: o carro traz link do cliente acompanhar e extras esperando (r6_cliente_360)', () => com({
  leads: [lead(1)], patio_os: [{ id: O(5), numero: 7, etapa: 'aguardando_aprovacao', etapa_em: dias(0), lead_id: L(1) }],
}, async s => {
  s.sb.rpcs.r6_cliente_360 = () => ({ telefone_55: '5512991000001', cliente: null, leads: [], orcamentos: [], agendamentos: [], comunicar: [], tarefas: [], mensagens: [],
    patio: [{ id: O(5), link_cliente: 'https://indycar-patio.netlify.app/acompanhar/?t=zzz', extras: [{ descricao: 'Trocar correia', valor: 350 }], atrasado: true, minutos_na_etapa: 130 }] });
  const r = await s.req('atendente', `/api/leads/${L(1)}/conexoes`);
  const c = r.corpo.patio.carros[0];
  assert.match(c.link_cliente, /acompanhar/); assert.equal(c.extras_pendentes[0].valor, 350); assert.equal(c.atrasado, true); assert.equal(c.etapa_rotulo, 'Aguardando aprovação');
}));
