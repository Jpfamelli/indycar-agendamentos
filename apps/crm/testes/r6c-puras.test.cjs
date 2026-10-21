/* Rodada 6, segunda leva (C5) — funções puras do CRM: observações do site/Orçador, orçamento ao vivo,
   pré-agendamento, pátio, link do Orçador, ações sugeridas, busca entre sistemas. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/rodada6c');
const R6 = require('../lib/rodada6');

const U = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const AGORA = Date.parse('2026-10-21T15:00:00Z');
const dias = n => new Date(AGORA - n * 864e5).toISOString();

test('linkSeguro: só http(s) de domínio da casa ou caminho do próprio app', () => {
  assert.equal(C.linkSeguro('https://indycar-orcador.netlify.app/#/historico/x'), 'https://indycar-orcador.netlify.app/#/historico/x');
  assert.equal(C.linkSeguro('/crm/?lead=1'), '/crm/?lead=1');
  for (const ruim of ['javascript:alert(1)', 'data:text/html,x', 'https://evil.com/', 'https://indycar-orcador.netlify.app.evil.com/', '//evil.com', 'https://u:p@indycar-patio.netlify.app/', 'https://indycar-patio.netlify.app/a b', '', null, 'ftp://indycar-patio.netlify.app/'])
    assert.equal(C.linkSeguro(ruim), null, String(ruim));
});

test('observações: lê "CARRO NO PÁTIO AGORA", cliente cadastrado e horário escolhido do site', () => {
  const o = C.lerObservacoes('Pedido do site.\nHorário escolhido: sexta 24/10, de manhã.\nCARRO NO PÁTIO AGORA: OS nº 42 (em execucao).');
  assert.deepEqual(o.carro_no_patio, { os_numero: 42, etapa: 'em_execucao', etapa_rotulo: 'Em execução' });
  assert.equal(o.horario_escolhido, 'sexta 24/10, de manhã');
  assert.equal(C.lerObservacoes('Cliente já cadastrado na oficina.').cliente_ja_cadastrado, true);
  assert.equal(C.lerObservacoes('nada').carro_no_patio, null);
  assert.equal(C.lerObservacoes(null).horario_escolhido, null);
});

test('observações: "CARRO NO PATIO AGORA" sem acento ou sem OS também é reconhecido', () => {
  assert.ok(C.lerObservacoes('carro no patio agora').carro_no_patio);
  assert.equal(C.lerObservacoes('CARRO NO PÁTIO AGORA').carro_no_patio.os_numero, null);
});

test('observações: notas do Orçador e motivo da recusa por número do orçamento', () => {
  const t = '[Orçador 21/10 10:05] Orçamento nº 0012 recusado — motivo: preço · pediu desconto.\n[Orçador 21/10 11:00] Orçamento nº 0013 recusado.';
  const o = C.lerObservacoes(t);
  assert.equal(o.orcador.length, 2);
  assert.equal(o.recusas[12], 'preço · pediu desconto');
  assert.equal(o.recusas[13], null);
});

test('observações: texto enorme e caracteres de controle não quebram nem vazam', () => {
  const o = C.lerObservacoes('Horário escolhido: ' + 'x'.repeat(5000) + '\u0007');
  assert.ok(o.horario_escolhido.length <= 120);
  assert.ok(!/[\u0000-\u001f]/.test(o.horario_escolhido));
});

test('orçamento: cada situação tem rótulo, tom e o que fazer', () => {
  const c = o => C.classificarOrcamento(o, AGORA);
  assert.equal(c({ status: 'enviado', enviado_em: dias(0) }).cod, 'enviado');
  assert.equal(c({ status: 'enviado', enviado_em: dias(3) }).cod, 'parado');
  const visto = c({ status: 'enviado', enviado_em: dias(3), visualizado_em: dias(2) });
  assert.equal(visto.cod, 'visto'); assert.equal(visto.tom, 'alerta'); assert.match(visto.rotulo, /abriu há 2 d/);
  assert.equal(c({ status: 'aprovado' }).cod, 'aprovado_sem_horario');
  assert.equal(c({ status: 'aprovado', agendamento_id: U(1) }).cod, 'aprovado');
  assert.equal(c({ status: 'aprovado', agendamento_id: U(1), aprovado_parcial: true }).rotulo, 'Aprovado em parte');
  assert.equal(c({ status: 'recusado', decidido_em: dias(1) }).cod, 'recusado');
  assert.equal(c({ status: 'expirado' }).cod, 'expirado');
  assert.equal(c({ status: 'aberto' }).cod, 'montagem');
  assert.equal(c({ status: 'sei-la' }).cod, 'outro');
});

test('orçamento: valor aprovado vale mais que o total; papel sem permissão (null) não vira zero', () => {
  assert.equal(C.valorDoOrcamento({ total: 1000, total_aprovado: 700 }), 700);
  assert.equal(C.valorDoOrcamento({ total: 1000, total_aprovado: null }), 1000);
  assert.equal(C.valorDoOrcamento({ total: null, total_aprovado: null }), null);
  assert.equal(C.valorDoOrcamento({}), null);
});

test('orçamentos: ordem por urgência, link canônico #/historico, motivo da recusa e link do cliente só de domínio da casa', () => {
  const linhas = [
    { id: U(1), numero: 10, status: 'enviado', enviado_em: dias(0), total: 500, criado_em: dias(0) },
    { id: U(2), numero: 12, status: 'recusado', decidido_em: dias(1), total: 900, criado_em: dias(5), link_cliente: 'https://evil.com/x' },
    { id: U(3), numero: 11, status: 'enviado', enviado_em: dias(4), visualizado_em: dias(3), total: 300, criado_em: dias(4), link_cliente: 'https://indycar-orcador.netlify.app/#/o/abc' },
    { id: 'nao-uuid', numero: 1, status: 'enviado' },
  ];
  const r = C.prepararOrcamentos(linhas, { observacoes: '[Orçador 20/10 10:00] Orçamento nº 0012 recusado — motivo: preço.', agora: AGORA });
  assert.equal(r.length, 3);
  assert.deepEqual(r.map(x => x.situacao.cod), ['visto', 'recusado', 'enviado']);
  assert.equal(r[1].motivo, 'preço');
  assert.equal(r[1].link_cliente, null);
  assert.match(r[0].link_equipe, /#\/historico\//);
  assert.equal(r[0].link_cliente, 'https://indycar-orcador.netlify.app/#/o/abc');
  assert.equal(C.prepararOrcamentos(null).length, 0);
});

test('resumo dos orçamentos: valor esperando, aprovado, quantos pedem ação', () => {
  const itens = C.prepararOrcamentos([
    { id: U(1), numero: 1, status: 'enviado', enviado_em: dias(0), total: 500, criado_em: dias(0) },
    { id: U(2), numero: 2, status: 'enviado', enviado_em: dias(4), visualizado_em: dias(2), total: 300, criado_em: dias(4) },
    { id: U(3), numero: 3, status: 'aprovado', total: 900, total_aprovado: 800, criado_em: dias(8) },
  ], { agora: AGORA });
  const r = C.resumirOrcamentos(itens);
  assert.equal(r.total, 3); assert.equal(r.esperando, 2); assert.equal(r.valor_esperando, 800); assert.equal(r.valor_aprovado, 800);
  assert.equal(r.pede_acao, 2); assert.equal(r.principal_id, itens[0].id);
  assert.deepEqual(C.resumirOrcamentos([]).total, 0);
});

test('pré-agendamento do Orçador: só os que esperam confirmação, com o número do orçamento', () => {
  const ags = [
    { id: U(1), data: '2026-10-22', hora: '08:00:00', status: 'aguardando', observacoes: 'PRÉ-AGENDAMENTO pedido pelo cliente pela página do orçamento — confirmar horário. Orçamento nº 0012 (Orçador)', servico: 'Freios' },
    { id: U(2), data: '2026-10-22', hora: '09:00', status: 'confirmado', observacoes: 'PRÉ-AGENDAMENTO x' },
    { id: U(3), data: '2026-10-22', hora: '10:00', status: 'aguardando', observacoes: 'Cliente ligou' },
    { id: U(4), data: '2026-10-20', hora: '13:00', status: 'aguardando', observacoes: 'PRE-AGENDAMENTO sem acento' },
  ];
  const r = C.prepararPreAgendamentos(ags, { agora: AGORA });
  assert.equal(r.length, 2);
  assert.equal(r[0].id, U(4)); assert.equal(r[0].passou, true);
  assert.equal(r[1].orcamento_numero, 12); assert.equal(r[1].hora, '08:00'); assert.equal(r[1].passou, false);
  assert.match(r[1].link, /agendamento=/);
});

test('pátio: carros do lead (por lead, cliente ou telefone) e carros que nenhum lead aberto enxerga', () => {
  const carros = [
    { os_id: U(1), numero: 1, etapa: 'pronto', lead_id: U(10), cliente_id: null, telefone: null },
    { os_id: U(2), numero: 2, etapa: 'em_execucao', lead_id: null, cliente_id: U(20), telefone: null },
    { os_id: U(3), numero: 3, etapa: 'recebido', lead_id: null, cliente_id: null, telefone: '5512991000003' },
    { os_id: U(4), numero: 4, etapa: 'teste', lead_id: null, cliente_id: U(99), telefone: '12999990000' },
  ];
  const leads = [{ id: U(10), status: 'agendado', telefone: '12991000010' }, { id: U(11), status: 'contato', cliente_id: U(20), telefone: '12991000020' }, { id: U(12), status: 'novo', telefone: '(12) 99100-0003' }, { id: U(13), status: 'concluido', cliente_id: U(99), telefone: '12999990000' }];
  assert.deepEqual(C.carrosDoLead(carros, leads[2]).map(c => c.numero), [3]);
  assert.equal(C.carrosDoLead(carros, leads[0])[0].etapa_rotulo, 'Pronto');
  assert.deepEqual(C.carrosSemLead(carros, leads).map(c => c.numero), [4], 'lead concluído não conta: o carro 4 está sem lead aberto');
});

test('Novo orçamento: contrato do Orçador (tel com 55, lead, placa válida, veículo, serviço) e nada inválido', () => {
  const u = new URL(C.linkNovoOrcamento({ cliente_id: U(1), telefone: '(12) 99123-4567', nome: 'Ana <b>', lead_id: U(2), placa: 'abc-1d23', veiculo: 'Corolla 2019', servico: 'Freios', agendamento_id: 'x', os_id: U(3) }));
  assert.equal(u.origin, 'https://indycar-orcador.netlify.app');
  assert.equal(u.searchParams.get('tel'), '5512991234567'); assert.equal(u.searchParams.get('lead'), U(2));
  assert.equal(u.searchParams.get('placa'), 'ABC1D23'); assert.equal(u.searchParams.get('nome'), 'Ana b');
  assert.equal(u.searchParams.get('agendamento'), null, 'id inválido é omitido');
  assert.equal(u.searchParams.get('os'), U(3));
  assert.equal(new URL(C.linkNovoOrcamento({ placa: 'ZZZ' })).searchParams.get('placa'), null);
  assert.equal(C.linkNovoOrcamento({}), 'https://indycar-orcador.netlify.app/');
  assert.equal(R6.linkOrcamento(U(1)), 'https://indycar-orcador.netlify.app/#/historico/' + U(1));
});

test('ações sugeridas: só códigos conhecidos, texto limpo e link seguro', () => {
  const r = C.acoesSugeridas([
    { codigo: 'cobrar_orcamento', app: 'orcador', titulo: 'Cobrar', motivo: 'Parado', link: 'https://indycar-orcador.netlify.app/#/historico/1' },
    { codigo: 'hackear', titulo: 'x' },
    { codigo: 'responder', app: 'evil', titulo: 'Responder', link: 'javascript:alert(1)' },
  ]);
  assert.equal(r.length, 2); assert.equal(r[1].app, null); assert.equal(r[1].link, null);
  assert.deepEqual(C.acoesSugeridas(null), []);
});

test('linha do tempo do banco: descarta data inválida e link de fora', () => {
  const r = C.linhaDoTempoR6([{ quando: 'ontem', titulo: 'x' }, { quando: dias(1), tipo: 'patio', titulo: 'Carro entregue', link: 'https://evil.com' }]);
  assert.equal(r.length, 1); assert.equal(r[0].link, null);
});

test('busca entre sistemas: grupos conhecidos, aba nomeada e link seguro', () => {
  const r = C.prepararBuscaGlobal({ termo: 'abc', total: 2, grupos: {
    patio: [{ tipo: 'os', id: U(1), titulo: 'OS 5', detalhe: 'ABC1D23', app: 'patio', link: 'https://indycar-patio.netlify.app/?os=1' }],
    orcamentos: [{ tipo: 'orcamento', id: U(2), titulo: 'Orç 9', app: 'orcador', link: 'https://evil.com/' }], estranho: [{ titulo: 'x' }] } });
  assert.equal(r.grupos.patio[0].aba, 'indycar-patio');
  assert.equal(r.grupos.orcamentos[0].link, null);
  assert.equal(r.grupos.estranho, undefined);
  assert.deepEqual(r.grupos.leads, []);
});

test('Agora na casa: números inteiros e frases só do que pede atenção', () => {
  const a = C.prepararAgora({ kpis: { carros_atrasados: 2, extras_pendentes: 1, conversas_sem_resposta: 0, faltam_chegar: 3, carros_no_patio: 'abc' }, orcamentos: { valor_esperando: 1234.5 }, patio: { por_etapa: [{ etapa: 'recebido', rotulo: 'Recebido', quantidade: 2 }, { rotulo: 'sem etapa' }] } });
  assert.equal(a.kpis.carros_no_patio, 0); assert.equal(a.etapas.length, 1); assert.equal(a.valor_orcamentos_esperando, 1234.5);
  const f = C.atencaoDaCasa(a);
  assert.equal(f.length, 3); assert.match(f[0].texto, /2 carros estão/); assert.match(f[1].texto, /1 extra espera/);
});

test('ligações quebradas: ordena pelo maior problema e limita a amostra', () => {
  const r = C.prepararLigacoes({ total_problemas: 7, verificacoes: [{ codigo: 'a', quantidade: 1, amostra: ['x'] }, { codigo: 'b', quantidade: 6, amostra: ['1', '2', '3', '4', '5', '6', 7] }] });
  assert.equal(r.verificacoes[0].codigo, 'b'); assert.equal(r.verificacoes[0].amostra.length, 5);
});

test('sinais novos: orçamento visto, recusado e pré-agendamento aparecem e pontuam', () => {
  const lead = { id: U(1), status: 'orcamento', telefone: '12991000001', cliente_id: null, created_at: dias(9), updated_at: dias(1) };
  const dados = {
    orcs: [{ id: U(5), numero: 5, status: 'enviado', lead_id: U(1), total: 500, enviado_em: dias(1), visualizado_em: dias(1), created_at: dias(1) }],
    agendamentos: [{ id: U(6), lead_id: U(1), status: 'aguardando', data: '2026-10-23', hora: '08:00', observacoes: 'PRÉ-AGENDAMENTO pedido pelo cliente' }],
  };
  const s = R6.construirSinais([lead], dados, AGORA)[U(1)];
  assert.ok(s.flags.includes('orcamento_visto')); assert.ok(s.flags.includes('pre_agendamento'));
  const p = R6.prioridadeFila(lead, s, AGORA);
  assert.equal(p.principal.codigo, 'pre_agendamento');
  assert.ok(p.motivos.some(m => m.codigo === 'orcamento_visto'));
  const rec = R6.construirSinais([lead], { orcs: [{ id: U(7), numero: 7, status: 'recusado', lead_id: U(1), total: 400, decidido_em: dias(2), created_at: dias(3) }] }, AGORA)[U(1)];
  assert.ok(rec.flags.includes('orcamento_recusado')); assert.equal(rec.orcamento_recusado.dias, 2);
  const antigo = R6.construirSinais([lead], { orcs: [{ id: U(7), status: 'recusado', lead_id: U(1), decidido_em: dias(30), created_at: dias(31) }] }, AGORA)[U(1)];
  assert.ok(!antigo.flags.includes('orcamento_recusado'), 'recusa de um mês atrás não é mais urgência');
  const novo = R6.construirSinais([lead], { orcs: [{ id: U(7), status: 'recusado', lead_id: U(1), decidido_em: dias(2), created_at: dias(5) }, { id: U(8), status: 'enviado', lead_id: U(1), enviado_em: dias(0), created_at: dias(1) }] }, AGORA)[U(1)];
  assert.ok(!novo.flags.includes('orcamento_recusado'), 'já existe orçamento novo em andamento');
});

test('textos sugeridos dos sinais novos: sem preço e sem palavras proibidas', () => {
  for (const cod of ['orcamento_visto', 'orcamento_recusado', 'pre_agendamento']) {
    const t = R6.scriptSugerido(cod, { nome: 'Ana Souza', carro_modelo: 'Corolla' });
    assert.match(t, /^Oi, Ana!/); assert.ok(!/R\$|prezado|efetuar|comparecer|veículo/i.test(t), cod);
  }
});
