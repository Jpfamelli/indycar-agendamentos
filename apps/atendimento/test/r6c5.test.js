'use strict';
/* Rodada 6, segunda leva (C5): Orçador ao vivo (JWT de quem está logado), pré-agendamentos,
   carros sem conversa, ações do 360, links seguros e a fila com recusado/pré-agendamento. */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const R = require('../public/r6-regras.js');
const { criarC5, chaveTel, telefoneParaRpc, acoesDoR360 } = require('../lib/r6c5.js');
const { criarR6 } = require('../lib/r6-dados.js');
const { criarRotasR6 } = require('../lib/rotas-r6.js');
const { criarZap } = require('../lib/zap-estado.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');

const AGORA = new Date('2026-10-21T15:00:00Z');
const iso = (min) => new Date(AGORA.getTime() - min * 60000).toISOString();
const CLI = '0bf5de3c-669d-41db-a0f8-6f76343a490b';
const CONV = '33b965a4-65e0-4562-a1b0-952466991b2c';
const ORC1 = '11111111-1111-4111-8111-111111111111';
const ORC2 = '22222222-2222-4222-8222-222222222222';
const LEAD = '44444444-4444-4444-8444-444444444444';
const AG = '55555555-5555-4555-8555-555555555555';
const OS = '66666666-6666-4666-8666-666666666666';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.usuario-logado.assinatura';
const ANON = 'anon-publica';

/* ---------------- regras puras ---------------- */
test('linkSeguroCasa: só http(s) dos domínios da casa; rejeita javascript:, data:, usuário:senha e domínio parecido', () => {
  assert.strictEqual(R.linkSeguroCasa('https://indycar-orcador.netlify.app/#/historico/' + ORC1), 'https://indycar-orcador.netlify.app/#/historico/' + ORC1);
  assert.strictEqual(R.linkSeguroCasa('http://indycar-patio.netlify.app/?os=1'), 'http://indycar-patio.netlify.app/?os=1');
  for (const ruim of ['javascript:alert(1)', 'data:text/html,<b>', 'https://user:senha@indycar-orcador.netlify.app/', 'https://indycar-orcador.netlify.app.evil.com/',
    'https://evil.com/indycar-orcador.netlify.app', 'ftp://indycar-orcador.netlify.app/', '//indycar-orcador.netlify.app', '', null, undefined, 'não é url']) {
    assert.strictEqual(R.linkSeguroCasa(ruim), null, String(ruim));
  }
});

test('pré-agendamento: reconhece a observação do Orçador e lê o número do orçamento', () => {
  assert.ok(R.ehPreAgendamento('PRÉ-AGENDAMENTO pedido pelo cliente pela página do orçamento — confirmar horário. Orçamento nº 0087 (Orçador)'));
  assert.ok(R.ehPreAgendamento('  pre agendamento pedido'));
  assert.ok(!R.ehPreAgendamento('Cliente pediu pré-agendamento depois'));
  assert.ok(!R.ehPreAgendamento(null));
  assert.strictEqual(R.numeroDoPreAgendamento('… Orçamento nº 0087 (Orçador)'), 87);
  assert.strictEqual(R.numeroDoPreAgendamento('orcamento n 12'), 12);
  assert.strictEqual(R.numeroDoPreAgendamento('sem número'), null);
});

test('motivoDaRecusa: texto, JSON e objeto; tira marcas e limita a 120 letras', () => {
  assert.strictEqual(R.motivoDaRecusa('achei caro'), 'achei caro');
  assert.strictEqual(R.motivoDaRecusa('motivo: vou pensar'), 'vou pensar');
  assert.strictEqual(R.motivoDaRecusa('{"motivo":"fechei em outro lugar"}'), 'fechei em outro lugar');
  assert.strictEqual(R.motivoDaRecusa({ motivo_recusa: 'sem tempo' }), 'sem tempo');
  assert.strictEqual(R.motivoDaRecusa('<script>x</script>oi'), 'scriptx/scriptoi');
  assert.strictEqual(R.motivoDaRecusa('a'.repeat(300)).length, 120);
  assert.strictEqual(R.motivoDaRecusa(null), null);
  assert.strictEqual(R.motivoDaRecusa('   '), null);
});

test('rotuloVisto: "viu agora há pouco", "viu há 2 h", vazio sem data', () => {
  assert.strictEqual(R.rotuloVisto(iso(2), AGORA), 'viu agora há pouco');
  assert.strictEqual(R.rotuloVisto(iso(120), AGORA), 'viu há 2 h');
  assert.strictEqual(R.rotuloVisto(iso(3000), AGORA), 'viu há 2 dias');
  assert.strictEqual(R.rotuloVisto(null, AGORA), '');
});

test('classificarLive: visto, recusado, aprovado em parte; sem preço fica sem valor; link do cliente só da casa', () => {
  const visto = R.classificarLive({ id: ORC1, numero: 87, status: 'enviado', visualizado_em: iso(200), enviado_em: iso(600), total: 1180.5, link_cliente: 'https://indycar-orcador.netlify.app/#/o/tok12345' }, AGORA);
  assert.strictEqual(visto.cod, 'visualizado'); assert.strictEqual(visto.visto, 'viu há 3 h'); assert.strictEqual(visto.total, 1180.5);
  assert.strictEqual(visto.abrir, 'https://indycar-orcador.netlify.app/#/historico/' + ORC1);
  assert.strictEqual(visto.link_cliente, 'https://indycar-orcador.netlify.app/#/o/tok12345');
  const semPreco = R.classificarLive({ id: ORC1, numero: 87, status: 'enviado', total: null }, AGORA);
  assert.strictEqual(semPreco.total, null);
  const rec = R.classificarLive({ id: ORC1, numero: 88, status: 'recusado', decidido_em: iso(30), total: 300 }, AGORA);
  assert.strictEqual(rec.cod, 'recusado'); assert.strictEqual(rec.tom, 'ruim');
  const parcial = R.classificarLive({ id: ORC2, numero: 89, status: 'aprovado', aprovado_parcial: true, total: 900, total_aprovado: 400 }, AGORA);
  assert.strictEqual(parcial.rotulo, 'Aprovado em parte'); assert.strictEqual(parcial.total, 400);
  const malicioso = R.classificarLive({ id: 'nao-uuid', numero: 'abc', status: 'enviado', link_cliente: 'javascript:alert(1)', servicos: ['<b>Freio</b>', { nome: 'Óleo' }], carro: 'Onix<img>' }, AGORA);
  assert.strictEqual(malicioso.id, null); assert.strictEqual(malicioso.numero, null); assert.strictEqual(malicioso.link_cliente, null);
  assert.deepStrictEqual(malicioso.servicos, ['bFreio/b', 'Óleo']); assert.strictEqual(malicioso.carro, 'Oniximg');
  const token = R.classificarLive({ id: ORC1, status: 'enviado', token_publico: 'abcdefgh12345678' }, AGORA);
  assert.strictEqual(token.link_cliente, 'https://indycar-orcador.netlify.app/#/o/abcdefgh12345678');
});

test('mesclarOrcamentos: o Orçador manda no status, guarda o pedido do 360, junta os que só um lado conhece e ordena por urgência', () => {
  const painel = [
    { id: ORC1, numero: 87, status: 'enviado', cod: 'enviado', pedido: 'Revisão', created_at: iso(5000), validade: '2026-11-01', link_cliente: 'https://indycar-orcador.netlify.app/#/o/velho1234' },
    { id: ORC2, numero: 80, status: 'aprovado', cod: 'aprovado', created_at: iso(9000) },
  ];
  const live = [R.classificarLive({ id: ORC1, numero: 87, status: 'recusado', decidido_em: iso(10), total: 500 }, AGORA),
    R.classificarLive({ id: '77777777-7777-4777-8777-777777777777', numero: 90, status: 'enviado', visualizado_em: iso(300), enviado_em: iso(400) }, AGORA)];
  const m = R.mesclarOrcamentos(painel, live);
  assert.strictEqual(m.length, 3);
  const o87 = m.find((o) => o.id === ORC1);
  assert.strictEqual(o87.cod, 'recusado'); assert.strictEqual(o87.pedido, 'Revisão'); assert.strictEqual(o87.ao_vivo, true);
  assert.strictEqual(o87.link_cliente, 'https://indycar-orcador.netlify.app/#/o/velho1234');
  assert.strictEqual(m[0].numero, 90, 'o que o cliente abriu e não respondeu vem primeiro');
  assert.ok(!m.find((o) => o.id === ORC2).ao_vivo);
  assert.deepStrictEqual(R.mesclarOrcamentos([], []), []);
});

test('respostaDoOrcador: sem preço, sem palavras proibidas, no máximo uma pergunta, com o slogan só onde cabe', () => {
  const proibidas = /prezado|efetuar|comparecer|ve[ií]culo/i;
  for (const cod of ['recusado', 'visualizado', 'recente', 'parado', 'enviado', 'aprovado_sem_horario', 'vencido', 'pre_agendamento']) {
    for (const ficha of [{ nome: 'Camila Rodrigues', numero: 87 }, {}, { nome: 'Zé', numero: 5, horarios: ['quinta às 9h', 'sexta às 14h'], quando: 'quinta, 22/10' }]) {
      const t = R.respostaDoOrcador(cod, ficha);
      assert.ok(t.length > 10, cod);
      assert.ok(!R.textoTemPreco(t), `${cod}: ${t}`);
      assert.ok(!proibidas.test(t), `${cod}: ${t}`);
      assert.ok((t.match(/\?/g) || []).length <= 1, `${cod}: ${t}`);
    }
  }
  assert.strictEqual(R.respostaDoOrcador('xyz'), '');
  assert.ok(R.respostaDoOrcador('recusado', { nome: 'Camila Rodrigues', numero: 87 }).startsWith('Camila, '));
  assert.ok(R.respostaDoOrcador('aprovado_sem_horario', { horarios: ['quinta às 9h', 'sexta às 14h'] }).includes('quinta às 9h ou sexta às 14h'));
});

test('carrosSemConversa: tira quem já tem conversa (por cliente ou telefone), ignora entregue e põe o pronto primeiro', () => {
  const carros = [
    { os_id: 'a', etapa: 'em_execucao', etapa_em: iso(500), telefone: '12 98866-0661', cliente_id: 'c1' },
    { os_id: 'b', etapa: 'pronto', etapa_em: iso(100), telefone: '12991111111', cliente_id: 'c2' },
    { os_id: 'c', etapa: 'em_execucao', etapa_em: iso(900), telefone: '(12) 99222-2222', cliente_id: 'c3' },
    { os_id: 'd', etapa: 'entregue', etapa_em: iso(10), telefone: '12993333333', cliente_id: 'c4' },
    { os_id: 'e', etapa: 'aguardando_aprovacao', etapa_em: iso(50), telefone: '12994444444', cliente_id: null },
  ];
  const convs = [{ cliente_id: 'c1', telefone: '5512988660661' }, { cliente_id: null, telefone: '12 99222-2222' }];
  const r = R.carrosSemConversa(carros, convs, chaveTel);
  assert.deepStrictEqual(r.map((c) => c.os_id), ['b', 'e']);
  assert.deepStrictEqual(R.carrosSemConversa(null, null), []);
});

test('fila: recusou o orçamento e pediu horário pela página sobem na pontuação, com motivo; sem isso a conversa fica no normal', () => {
  const c = { id: CONV, tipo: 'atendimento', nao_lidas: 0, ultima_mensagem_em: iso(5) };
  const base = R.pontuarConversa(c, {}, { agora: AGORA });
  const rec = R.pontuarConversa(c, { orc: { status: 'recusado', decidido_em: iso(20) } }, { agora: AGORA });
  const pre = R.pontuarConversa(c, { pre: { id: AG } }, { agora: AGORA });
  assert.ok(rec.motivos.some((m) => m.cod === 'orc_recusado'));
  assert.ok(pre.motivos.some((m) => m.cod === 'pre_agendamento'));
  assert.ok(pre.pontos > rec.pontos && rec.pontos > base.pontos);
  assert.ok(pre.pontos - base.pontos >= R.PONTOS.pre_agendamento);
});

test('linkNovoOrcamento: leva serviço, OS e agendamento quando existem e descarta o que não é UUID', () => {
  const l = R.linkNovoOrcamento({ conversaId: CONV, telefone: '12988660661', servico: 'Alinhamento 3D', osId: OS, agendamentoId: AG });
  const u = new URL(l.replace('#/cotacao?', 'cotacao?'));
  assert.strictEqual(u.searchParams.get('servico'), 'Alinhamento 3D'); assert.strictEqual(u.searchParams.get('os'), OS); assert.strictEqual(u.searchParams.get('agendamento'), AG);
  const ruim = R.linkNovoOrcamento({ conversaId: CONV, osId: 'x', agendamentoId: '../../etc' });
  assert.ok(!ruim.includes('os=') && !ruim.includes('agendamento='));
});

test('orcamentoQueImporta: recusado recente passa na frente do aprovado antigo; recusado de mais de 14 dias fica por último', () => {
  const aprovado = { id: ORC2, numero: 70, status: 'aprovado', agendamento_id: AG, created_at: iso(90000) };
  const recente = { id: ORC1, numero: 87, status: 'recusado', decidido_em: iso(60), created_at: iso(5000) };
  const velho = { id: 'v', numero: 60, status: 'recusado', decidido_em: iso(60 * 24 * 30), created_at: iso(60 * 24 * 40) };
  assert.strictEqual(R.orcamentoQueImporta([aprovado, recente], AGORA).numero, 87);
  assert.strictEqual(R.orcamentoQueImporta([velho, aprovado], AGORA).numero, 70);
  assert.strictEqual(R.orcamentoQueImporta([velho], AGORA).numero, 60, 'sozinho ele ainda é o que existe');
  const enviado = { id: 'e', numero: 88, status: 'enviado', enviado_em: iso(30), created_at: iso(30) };
  assert.strictEqual(R.orcamentoQueImporta([recente, enviado], AGORA).numero, 88, 'em andamento ganha do recusado');
});

/* ---------------- servidor: Orçador como o usuário ---------------- */
function fetchFalso(respostas = {}) {
  const chamadas = [];
  const f = async (url, opc = {}) => {
    chamadas.push({ url, opc, corpo: opc.body ? JSON.parse(opc.body) : null });
    const nome = String(url).split('/rpc/')[1];
    const r = respostas[nome];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r(opc);
    return { ok: true, status: 200, json: async () => r ?? [] };
  };
  f.chamadas = chamadas;
  return f;
}
const linhaOrc = (extra = {}) => ({ id: ORC1, numero: 87, status: 'enviado', total: 1180, enviado_em: iso(3000), visualizado_em: iso(200), criado_em: iso(3100), ...extra });

test('rpcComoUsuario: manda o token de quem está logado + a chave pública (nunca a de serviço) e trata 401, rede e falta de token', async () => {
  const f = fetchFalso({ orc_status_por_telefone: [linhaOrc()] });
  const c5 = criarC5({ sb: criarSbFalso({}), fetch: f, supabaseUrl: 'https://x.supabase.co/', anonKey: ANON, agora: () => AGORA, log: () => {} });
  const ok = await c5.rpcComoUsuario(TOKEN, 'orc_status_por_telefone', { p_telefone: '5512988660661' });
  assert.ok(ok.ok); assert.strictEqual(f.chamadas[0].url, 'https://x.supabase.co/rest/v1/rpc/orc_status_por_telefone');
  assert.strictEqual(f.chamadas[0].opc.headers.Authorization, `Bearer ${TOKEN}`); assert.strictEqual(f.chamadas[0].opc.headers.apikey, ANON);
  assert.strictEqual((await c5.rpcComoUsuario(null, 'x', {})).motivo, 'sem_token');
  const semCfg = criarC5({ sb: criarSbFalso({}), fetch: f, supabaseUrl: '', anonKey: '', log: () => {} });
  assert.strictEqual((await semCfg.rpcComoUsuario(TOKEN, 'x', {})).motivo, 'sem_config');
  const f401 = fetchFalso({ orc_status_por_telefone: () => ({ ok: false, status: 401, json: async () => ({}) }) });
  const c401 = criarC5({ sb: criarSbFalso({}), fetch: f401, supabaseUrl: 'https://x', anonKey: ANON, log: () => {} });
  assert.strictEqual((await c401.rpcComoUsuario(TOKEN, 'orc_status_por_telefone', {})).motivo, 'sem_permissao');
  const fRede = fetchFalso({ orc_status_por_telefone: new Error(`falhou com ${TOKEN}`) });
  const logs = [];
  const cRede = criarC5({ sb: criarSbFalso({}), fetch: fRede, supabaseUrl: 'https://x', anonKey: ANON, log: (...a) => logs.push(a.join(' ')) });
  const r = await cRede.rpcComoUsuario(TOKEN, 'orc_status_por_telefone', {});
  assert.deepStrictEqual(r, { ok: false, motivo: 'rede' });
  assert.ok(!JSON.stringify(r).includes(TOKEN));
});

test('orcamentosAoVivo: telefone vira 55+DDD, junta telefone e lead sem repetir, traz o motivo da recusa e some se ninguém respondeu', async () => {
  const f = fetchFalso({
    orc_status_por_telefone: [linhaOrc({ id: ORC1, status: 'recusado', visualizado_em: iso(100), decidido_em: iso(60) }), linhaOrc({ id: ORC2, numero: 88, status: 'enviado', visualizado_em: null })],
    orc_status_por_lead: [linhaOrc({ id: ORC2, numero: 88, status: 'enviado', visualizado_em: null })],
  });
  const sb = criarSbFalso({ orc_eventos: [
    { orcamento_id: ORC1, tipo: 'recusado', detalhe: '{"motivo":"achei caro"}', created_at: iso(60) },
    { orcamento_id: ORC1, tipo: 'recusado', detalhe: 'antigo', created_at: iso(5000) }] });
  const c5 = criarC5({ sb, fetch: f, supabaseUrl: 'https://x', anonKey: ANON, agora: () => AGORA, log: () => {} });
  const r = await c5.orcamentosAoVivo({ token: TOKEN, telefone: '(12) 98866-0661', leadId: LEAD });
  assert.ok(r.ok); assert.strictEqual(f.chamadas[0].corpo.p_telefone, '5512988660661'); assert.strictEqual(f.chamadas[1].corpo.p_lead_id, LEAD);
  assert.strictEqual(r.orcamentos.length, 2);
  const rec = r.orcamentos.find((o) => o.id === ORC1);
  assert.strictEqual(rec.motivo_recusa, 'achei caro'); assert.strictEqual(rec.acao, 'Recusou: achei caro');
  const sem = await c5.orcamentosAoVivo({ token: TOKEN, telefone: '123' });
  assert.deepStrictEqual([sem.ok, sem.orcamentos.length, sem.motivo], [true, 0, 'sem_telefone']);
  const f401 = fetchFalso({ orc_status_por_telefone: () => ({ ok: false, status: 403, json: async () => ({}) }) });
  const c401 = criarC5({ sb, fetch: f401, supabaseUrl: 'https://x', anonKey: ANON, log: () => {} });
  const neg = await c401.orcamentosAoVivo({ token: TOKEN, telefone: '12988660661' });
  assert.deepStrictEqual([neg.ok, neg.motivo], [false, 'sem_permissao']);
});

test('preAgendamentos: só os pedidos pela página do orçamento, ainda aguardando, deste cliente (id ou telefone), até 3 dias atrás', async () => {
  const obs = 'PRÉ-AGENDAMENTO pedido pelo cliente pela página do orçamento — confirmar horário. Orçamento nº 0087 (Orçador)';
  const sb = criarSbFalso({ agendamentos: [
    { id: AG, cliente_id: CLI, telefone: '12988660661', data: '2026-10-22', hora: '09:00:00', servico: 'Revisão', status: 'aguardando', observacoes: obs, created_at: iso(30) },
    { id: 'a2', cliente_id: null, telefone: '5512988660661', data: '2026-10-23', hora: '14:30', status: 'aguardando', observacoes: obs },
    { id: 'a3', cliente_id: CLI, data: '2026-10-22', status: 'confirmado', observacoes: obs },
    { id: 'a4', cliente_id: CLI, data: '2026-10-22', status: 'aguardando', observacoes: 'Cliente ligou' },
    { id: 'a5', cliente_id: 'outro', telefone: '12911112222', data: '2026-10-22', status: 'aguardando', observacoes: obs },
    { id: 'a6', cliente_id: CLI, data: '2026-09-01', status: 'aguardando', observacoes: obs },
  ] });
  const c5 = criarC5({ sb, agora: () => AGORA, log: () => {} });
  const r = await c5.preAgendamentos({ clienteId: CLI, telefone: '12 98866-0661' });
  assert.deepStrictEqual(r.map((x) => x.id), [AG, 'a2']);
  assert.strictEqual(r[0].hora, '09:00'); assert.strictEqual(r[0].numero_orcamento, 87); assert.strictEqual(r[0].abrir, `/?agendamento=${AG}`);
  assert.deepStrictEqual(await criarC5({ sb: criarSbFalso({}, { falhas: { agendamentos: { msg: 'x' } } }), log: () => {} }).preAgendamentos({ clienteId: CLI }), []);
});

test('carrosSemConversa (servidor): patio_carros_abertos + nome do cliente, sem quem já está numa conversa; erro vira aviso', async () => {
  const sb = criarSbFalso({
    conversas: [{ id: CONV, cliente_id: CLI, telefone: '5512988660661', tipo: 'atendimento', desfecho: null }],
    clientes: [{ id: 'c2', nome: 'José Lima', carro_modelo: 'Gol 2015' }],
  }, { rpc: { patio_carros_abertos: () => ({ data: [
    { os_id: OS, numero: 412, etapa: 'em_execucao', etapa_em: iso(90), placa: 'ABC1D23', cliente_id: CLI, telefone: '12988660661' },
    { os_id: 'os2', numero: 413, etapa: 'pronto', etapa_em: iso(20), placa: 'XYZ9K88', cliente_id: 'c2', telefone: '12991234567', previsao_entrega: iso(-60) }], error: null }) } });
  const c5 = criarC5({ sb, agora: () => AGORA, log: () => {} });
  const r = await c5.carrosSemConversa();
  assert.ok(r.ok); assert.strictEqual(r.total_no_patio, 2); assert.strictEqual(r.carros.length, 1);
  assert.deepStrictEqual([r.carros[0].nome, r.carros[0].carro, r.carros[0].telefone, r.carros[0].etapa_rotulo, r.carros[0].min_na_etapa], ['José Lima', 'Gol 2015', '5512991234567', 'Pronto para retirar', 20]);
  const ruim = await criarC5({ sb: criarSbFalso({}, { rpc: { patio_carros_abertos: () => ({ data: null, error: { message: 'boom' } }) } }), log: () => {} }).carrosSemConversa();
  assert.deepStrictEqual([ruim.ok, ruim.carros.length], [false, 0]);
  assert.ok(!/boom/.test(ruim.erro), 'erro técnico não vai para a tela');
});

test('acoesDoR360: link só da casa, texto com preço some, título sem marcas, no máximo 6 e mantém o aviso de não mandar mensagem', () => {
  const lista = [
    { codigo: 'cobrar_orcamento', app: 'orcador', titulo: 'Cobrar <b>orçamento</b>', motivo: 'Visto há 2 dias', link: 'https://indycar-orcador.netlify.app/#/historico/' + ORC1, texto: 'Oi, viu o orçamento?' },
    { codigo: 'enviar_link_acompanhar', app: 'patio', titulo: 'Mandar link', link: 'javascript:alert(1)', texto: 'Seu orçamento fica R$ 350,00' },
    { codigo: 'nao_mandar_mensagens', app: 'comunicar', titulo: 'Pediu para parar as mensagens', motivo: 'PARAR' },
    { titulo: '' }, ...Array.from({ length: 9 }, (_, i) => ({ codigo: 'x' + i, titulo: 't' + i })),
  ];
  const r = acoesDoR360(lista);
  assert.strictEqual(r.length, 5, '6 primeiras, menos a sem título');
  assert.strictEqual(r[0].titulo, 'Cobrar orçamento'); assert.ok(r[0].link.startsWith('https://indycar-orcador'));
  assert.strictEqual(r[1].link, null); assert.strictEqual(r[1].texto, null);
  assert.ok(r.some((a) => a.codigo === 'nao_mandar_mensagens'));
  assert.strictEqual(r[0].app, 'orcador');
  const estranho = acoesDoR360([{ codigo: 'x', titulo: 't', app: '__proto__' }, { codigo: 'y', titulo: 't', app: 'javascript:alert(1)' }, { codigo: 'z', titulo: 't', app: 'crm' }]);
  assert.deepStrictEqual(estranho.map((a) => a.app), ['', '', 'crm'], 'o nome da aba só pode ser de um app da casa');
  assert.deepStrictEqual(acoesDoR360(null), []);
});

test('telefones: chave casa com/sem 55 e com/sem formatação; a RPC só recebe 55+DDD+número', () => {
  assert.strictEqual(chaveTel('+55 (12) 98866-0661'), chaveTel('12988660661'));
  assert.strictEqual(chaveTel('123'), null);
  assert.strictEqual(telefoneParaRpc('12988660661'), '5512988660661');
  assert.strictEqual(telefoneParaRpc('5512988660661'), '5512988660661');
  assert.strictEqual(telefoneParaRpc('0988'), null);
});

/* ---------------- fila: recusado e pré-agendamento ---------------- */
test('filaContexto: recusado de até 14 dias aparece, mais velho não; pré-agendamento vira "pre"; enviado novo vence recusado velho', async () => {
  const obs = 'PRÉ-AGENDAMENTO pedido pelo cliente pela página do orçamento — confirmar horário. Orçamento nº 0087 (Orçador)';
  const sb = criarSbFalso({
    conversas: [
      { id: CONV, cliente_id: CLI, telefone: '5512988660661', tipo: 'atendimento', desfecho: null, nao_lidas: 0, ultima_mensagem_em: iso(10) },
      { id: 'c-velho', cliente_id: 'cv', telefone: '5512977770000', tipo: 'atendimento', desfecho: null, nao_lidas: 0, ultima_mensagem_em: iso(10) },
      { id: 'c-misto', cliente_id: 'cm', telefone: '5512966660000', tipo: 'atendimento', desfecho: null, nao_lidas: 0, ultima_mensagem_em: iso(10) }],
    orc_orcamentos: [
      { id: ORC1, numero: 87, status: 'recusado', cliente_id: CLI, decidido_em: iso(60), created_at: iso(5000) },
      { id: ORC2, numero: 70, status: 'recusado', cliente_id: 'cv', decidido_em: iso(60 * 24 * 20), created_at: iso(60 * 24 * 25) },
      { id: 'o3', numero: 71, status: 'recusado', cliente_id: 'cm', decidido_em: iso(60 * 24 * 3), created_at: iso(60 * 24 * 5) },
      { id: 'o4', numero: 72, status: 'enviado', cliente_id: 'cm', enviado_em: iso(60), created_at: iso(60) }],
    agendamentos: [{ id: AG, cliente_id: CLI, data: '2026-10-22', hora: '09:00', status: 'aguardando', observacoes: obs }],
    whatsapp_mensagens: [], patio_os: [], patio_extras: [],
  }, { relogio: () => AGORA });
  const d = criarR6({ sb, agora: () => AGORA, log: () => {} });
  const f = await d.filaContexto({ forcar: true });
  assert.strictEqual(f.conversas[CONV].orc.cod, 'recusado');
  assert.deepStrictEqual([f.conversas[CONV].pre.id, f.conversas[CONV].pre.hora], [AG, '09:00']);
  assert.ok(!f.conversas['c-velho'], 'recusado de 20 dias não entra na fila');
  assert.strictEqual(f.conversas['c-misto'].orc.numero, 72, 'o orçamento em andamento ganha do recusado');
});

/* ---------------- rotas ---------------- */
async function subirRotas({ semBanco = false, limite = null, fetchResp = {}, rpc = {}, tabelas = {}, papel = 'atendente' } = {}) {
  const sb = criarSbFalso({
    conversas: [
      { id: CONV, cliente_id: CLI, nome: 'Camila', telefone: '5512988660661', telefone_e164: '5512988660661', tipo: 'atendimento', desfecho: null },
      { id: '88888888-8888-4888-8888-888888888888', cliente_id: null, nome: 'Sem cadastro', telefone: '12955554444', telefone_e164: '5512955554444', tipo: 'atendimento', desfecho: null }],
    clientes: [{ id: CLI, nome: 'Camila Rodrigues', telefone: '12988660661', telefone_e164: '5512988660661', carro_modelo: 'Onix', carro_ano: 2020, placa: 'ABC1D23' }],
    orc_eventos: [], agendamentos: [], whatsapp_mensagens: [], patio_os: [], patio_extras: [], orc_orcamentos: [],
    ...tabelas,
  }, { relogio: () => AGORA, rpc: { r6_cliente_360: () => ({ data: { orcamentos: [], patio: [], agendamentos: [], leads: [{ id: LEAD, status: 'orcamento', servico: 'Revisão', origem: 'whatsapp' }], linha_do_tempo: [], links: {}, resumo: {},
    acoes_sugeridas: [{ codigo: 'cobrar_orcamento', app: 'orcador', titulo: 'Cobrar orçamento', motivo: 'Visto', link: 'https://indycar-orcador.netlify.app/#/historico/' + ORC1 }] }, error: null }), ...rpc } });
  const f = fetchFalso(fetchResp);
  const c5 = criarC5({ sb, fetch: f, supabaseUrl: 'https://x.supabase.co', anonKey: ANON, agora: () => AGORA, log: () => {} });
  const dados = criarR6({ sb, agora: () => AGORA, log: () => {} });
  const chamadas = {};
  const rotas = criarRotasR6({
    getSb: () => (semBanco ? null : sb), usuarioLogado: async (req) => (req.headers.authorization ? { id: 'p1', nome: 'Ana', papel } : null),
    dentroDoLimite: (k) => { chamadas[k] = (chamadas[k] || 0) + 1; return limite ? chamadas[k] <= limite : true; },
    readBody: async () => ({}), dados, zap: criarZap({ agora: () => AGORA.getTime() }), c5,
    tokenDe: (req) => (/^Bearer (\S+)$/.exec(req.headers.authorization || '') || [])[1] || null, auditar: async () => ({ ok: true }),
  });
  const srv = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); if (!(await rotas(req, res, u.pathname))) { res.writeHead(404); res.end('{}'); } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (caminho, { logado = true } = {}) => {
    const r = await fetch(base + caminho, { headers: logado ? { Authorization: `Bearer ${TOKEN}` } : {} });
    const texto = await r.text();
    return { status: r.status, texto, j: JSON.parse(texto), cab: r.headers };
  };
  return { chamar, f, sb, fechar: () => { srv.closeAllConnections?.(); srv.close(); } };
}

test('rota c5/conversa: exige login, valida id, 404, e o token de quem chamou vai para o Orçador e NUNCA volta na resposta', async () => {
  const s = await subirRotas({ fetchResp: {
    orc_status_por_telefone: [linhaOrc({ id: ORC1, status: 'enviado', visualizado_em: iso(120) })], orc_status_por_lead: [] } });
  try {
    assert.strictEqual((await s.chamar(`/api/r6/c5/conversa/${CONV}`, { logado: false })).status, 401);
    assert.strictEqual((await s.chamar('/api/r6/c5/conversa/nao-e-uuid')).status, 400);
    assert.strictEqual((await s.chamar('/api/r6/c5/conversa/99999999-9999-4999-8999-999999999999')).status, 404);
    const r = await s.chamar(`/api/r6/c5/conversa/${CONV}`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.cab.get('cache-control'), 'no-store');
    assert.ok(r.j.ao_vivo); assert.strictEqual(r.j.aviso, null);
    assert.strictEqual(r.j.orcamentos[0].cod, 'visualizado'); assert.strictEqual(r.j.orcamento_principal, ORC1);
    assert.strictEqual(r.j.acoes.length, 1);
    assert.ok(r.j.link_novo_orcamento.includes('tel=5512988660661'));
    assert.ok(!r.texto.includes(TOKEN) && !r.texto.includes(ANON), 'nem o token nem a chave pública voltam');
    for (const c of s.f.chamadas) { assert.strictEqual(c.opc.headers.Authorization, `Bearer ${TOKEN}`); assert.strictEqual(c.opc.headers.apikey, ANON); }
    assert.deepStrictEqual(s.f.chamadas.map((c) => c.url.split('/rpc/')[1]).sort(), ['orc_status_por_lead', 'orc_status_por_telefone']);
  } finally { s.fechar(); }
});

test('rota c5/conversa: cliente sem cadastro também enxerga o Orçador pelo telefone da conversa', async () => {
  const s = await subirRotas({ fetchResp: { orc_status_por_telefone: [linhaOrc({ status: 'recusado', decidido_em: iso(30) })] } });
  try {
    const r = await s.chamar('/api/r6/c5/conversa/88888888-8888-4888-8888-888888888888');
    assert.strictEqual(r.status, 200); assert.strictEqual(s.f.chamadas.length, 1);
    assert.strictEqual(s.f.chamadas[0].corpo.p_telefone, '5512955554444');
    assert.strictEqual(r.j.orcamentos[0].cod, 'recusado');
    assert.deepStrictEqual(r.j.acoes, []);
  } finally { s.fechar(); }
});

test('rota c5/conversa: Orçador negou/caiu → painel continua com o que já sabia e um aviso em português claro', async () => {
  const negou = () => ({ ok: false, status: 403, json: async () => ({}) });
  const neg = await subirRotas({ fetchResp: { orc_status_por_telefone: negou, orc_status_por_lead: negou } });
  try {
    const r = await neg.chamar(`/api/r6/c5/conversa/${CONV}`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.ao_vivo, false);
    assert.match(r.j.aviso, /Seu acesso não enxerga o Orçador/);
  } finally { neg.fechar(); }
  const caiu = await subirRotas({ fetchResp: { orc_status_por_telefone: new Error('ECONNRESET'), orc_status_por_lead: new Error('ECONNRESET') } });
  try {
    const r = await caiu.chamar(`/api/r6/c5/conversa/${CONV}`);
    assert.strictEqual(r.status, 200); assert.match(r.j.aviso, /não respondeu agora/);
    assert.ok(!/ECONNRESET/.test(r.texto));
  } finally { caiu.fechar(); }
});

test('rota c5/conversa: se só uma das consultas ao Orçador falhar, mostra o que veio e avisa que pode faltar algum', async () => {
  const s = await subirRotas({ fetchResp: { orc_status_por_telefone: new Error('x'), orc_status_por_lead: [linhaOrc({ id: ORC2, numero: 9 })] } });
  try {
    const r = await s.chamar(`/api/r6/c5/conversa/${CONV}`);
    assert.ok(r.j.ao_vivo); assert.strictEqual(r.j.orcamentos.length, 1); assert.match(r.j.aviso, /só em parte/);
  } finally { s.fechar(); }
});

test('rota c5/conversa: pré-agendamento do cliente vem junto; limite de pedidos devolve 429; sem banco 503', async () => {
  const obs = 'PRÉ-AGENDAMENTO pedido pelo cliente pela página do orçamento — confirmar horário. Orçamento nº 0087 (Orçador)';
  const s = await subirRotas({ limite: 2, tabelas: { agendamentos: [{ id: AG, cliente_id: CLI, data: '2026-10-22', hora: '09:00', status: 'aguardando', observacoes: obs }] } });
  try {
    const a = await s.chamar(`/api/r6/c5/conversa/${CONV}`);
    assert.strictEqual(a.j.pre_agendamentos[0].id, AG);
    await s.chamar(`/api/r6/c5/conversa/${CONV}`);
    const c = await s.chamar(`/api/r6/c5/conversa/${CONV}`);
    assert.strictEqual(c.status, 429); assert.match(c.j.erro, /Muitos pedidos/);
  } finally { s.fechar(); }
  const sem = await subirRotas({ semBanco: true });
  try { assert.strictEqual((await sem.chamar(`/api/r6/c5/conversa/${CONV}`)).status, 503); assert.strictEqual((await sem.chamar('/api/r6/c5/carros')).status, 503); } finally { sem.fechar(); }
});

test('rota c5/carros: lista os carros sem conversa, exige login e esconde erro técnico', async () => {
  const s = await subirRotas({ rpc: { patio_carros_abertos: () => ({ data: [{ os_id: OS, numero: 413, etapa: 'pronto', etapa_em: iso(20), placa: 'XYZ9K88', cliente_id: null, telefone: '12991234567' }], error: null }) } });
  try {
    assert.strictEqual((await s.chamar('/api/r6/c5/carros', { logado: false })).status, 401);
    const r = await s.chamar('/api/r6/c5/carros');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.carros.length, 1); assert.strictEqual(r.j.carros[0].abrir, `/?os=${OS}`);
  } finally { s.fechar(); }
  const ruim = await subirRotas({ rpc: { patio_carros_abertos: () => ({ data: null, error: { message: 'relation "x" does not exist' } }) } });
  try { const r = await ruim.chamar('/api/r6/c5/carros'); assert.strictEqual(r.status, 503); assert.ok(!/relation/.test(r.texto)); } finally { ruim.fechar(); }
});

test('motivo da recusa: vem do próprio orçamento (código + texto do cliente) e cai nos eventos só se faltar', async () => {
  const f = fetchFalso({ orc_status_por_telefone: [linhaOrc({ id: ORC1, status: 'recusado', decidido_em: iso(60) }), linhaOrc({ id: ORC2, numero: 88, status: 'recusado', decidido_em: iso(50) })] });
  const sb = criarSbFalso({
    orc_orcamentos: [{ id: ORC1, motivo_cod: 'preco', motivo_recusa: 'achei caro' }, { id: ORC2, motivo_cod: null, motivo_recusa: null }],
    orc_eventos: [{ orcamento_id: ORC2, tipo: 'recusado', detalhe: 'fechei com outro', created_at: iso(50) }] });
  const c5 = criarC5({ sb, fetch: f, supabaseUrl: 'https://x', anonKey: ANON, agora: () => AGORA, log: () => {} });
  const r = await c5.orcamentosAoVivo({ token: TOKEN, telefone: '12988660661' });
  assert.strictEqual(r.orcamentos.find((o) => o.id === ORC1).motivo_recusa, 'preço · achei caro');
  assert.strictEqual(r.orcamentos.find((o) => o.id === ORC2).motivo_recusa, 'fechei com outro');
  assert.strictEqual(R.motivoDaRecusa({ cod: 'outro_lugar', texto: '' }), 'vai fazer em outro lugar');
  assert.strictEqual(R.motivoDaRecusa({ cod: 'xyz', texto: '' }), null);
});

test('funil do Orçador: só gestor/admin, chamado com o JWT do gestor, dias entre 1 e 90, taxas calculadas e sem token na resposta', async () => {
  const funil = { periodo_dias: 30, criados: 14, enviados: 10, vistos: 4, decididos: 5, aprovados: 3, recusados: 2, nunca_enviados: 4, valor_aprovado: 3500.456, mediana_ver_seg: 9000,
    por_motivo: [{ codigo: 'preco', quantidade: 3, valor: 1500 }, { codigo: '<b>x</b>', quantidade: 1 }], seguimento: { hoje: 1, atrasados: 2 } };
  const ate = await subirRotas({ papel: 'atendente', fetchResp: { orc_funil: funil } });
  try { const r = await ate.chamar('/api/r6/c5/funil'); assert.strictEqual(r.status, 403); assert.strictEqual(ate.f.chamadas.length, 0, 'atendente nem chega a perguntar ao Orçador'); } finally { ate.fechar(); }
  const g = await subirRotas({ papel: 'gestor', fetchResp: { orc_funil: funil } });
  try {
    assert.strictEqual((await g.chamar('/api/r6/c5/funil', { logado: false })).status, 401);
    const r = await g.chamar('/api/r6/c5/funil?dias=500');
    assert.strictEqual(r.status, 200); assert.strictEqual(g.f.chamadas[0].corpo.p_dias, 90);
    assert.strictEqual(g.f.chamadas[0].opc.headers.Authorization, 'Bearer ' + TOKEN);
    assert.deepStrictEqual([r.j.enviados, r.j.taxa_visto, r.j.taxa_aprovacao, r.j.valor_aprovado, r.j.mediana_ver_h], [10, 40, 30, 3500.46, 2.5]);
    assert.strictEqual(r.j.por_motivo[0].rotulo, 'Preço'); assert.strictEqual(r.j.por_motivo[1].rotulo, 'x');
    assert.ok(r.j.insights.some((t) => /nunca enviados/.test(t)) && r.j.insights.some((t) => /motivo de recusa mais comum/.test(t)));
    assert.ok(!r.texto.includes(TOKEN));
    await g.chamar('/api/r6/c5/funil?dias=0'); assert.strictEqual(g.f.chamadas[1].corpo.p_dias, 30, 'dias 0 volta ao padrão');
  } finally { g.fechar(); }
  const neg = await subirRotas({ papel: 'admin', fetchResp: { orc_funil: () => ({ ok: false, status: 403, json: async () => ({}) }) } });
  try { const r = await neg.chamar('/api/r6/c5/funil'); assert.strictEqual(r.status, 503); assert.match(r.j.erro, /não tem acesso ao Orçador/); } finally { neg.fechar(); }
  const caiu = await subirRotas({ papel: 'admin', fetchResp: { orc_funil: new Error('ECONNRESET') } });
  try { const r = await caiu.chamar('/api/r6/c5/funil'); assert.strictEqual(r.status, 503); assert.ok(!/ECONNRESET/.test(r.texto)); } finally { caiu.fechar(); }
});

test('insightsOrcador: sem envio não inventa frase; poucas amostras não alarmam', () => {
  const { prepararFunilOrcador, insightsOrcador } = require('../lib/r6c5.js');
  assert.deepStrictEqual(insightsOrcador(prepararFunilOrcador({})), []);
  assert.deepStrictEqual(insightsOrcador(prepararFunilOrcador({ enviados: 3, vistos: 0, por_motivo: [{ codigo: 'preco', quantidade: 1 }] })), []);
  const f = prepararFunilOrcador({ enviados: 10, vistos: 2, seguimento: { atrasados: 1 } });
  assert.ok(insightsOrcador(f).some((x) => /Só 20% /.test(x)) && insightsOrcador(f).some((x) => /1 retorno de orçamento atrasado /.test(x)));
});
