/* Rodada 7 (C3) — funções puras: links, funil que se mexe, retornos, saúde, perdas, indicações, origens, qualidade, resumos. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R6 = require('../lib/rodada6');
const R7 = require('../lib/rodada7');

const U = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const AGORA = Date.parse('2026-10-26T15:00:00Z');            // segunda 12h em São Paulo
const dias = (n, base = AGORA) => new Date(base - n * 864e5).toISOString();
const lead = (n, x = {}) => ({ id: U(n), nome: `Cliente Teste ${n}`, telefone: '1299' + String(1000000 + n), status: 'contato', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0, observacoes: '',
  created_at: dias(5), updated_at: dias(2), closed_at: null, responsavel_id: null, cliente_id: null, tentativas_contato: 0, ...x });
const sinaisDe = (leads, dados = {}) => R6.construirSinais(leads, { os: [], entregues: [], extras: [], orcs: [], conversas: [], tarefas: [], agendamentos: [], ...dados }, AGORA);
const movs = (leads, dados) => R7.sugerirMovimentos(leads, sinaisDe(leads, dados), { agora: AGORA });

/* ---------- links prontos ---------- */
test('entrada no Pátio: leva orçamento, horário, lead, cliente, telefone com 55, placa e serviço', () => {
  const href = R7.linkEntradaPatio({ orcamento_id: U(1), agendamento_id: U(2), lead_id: U(3), cliente_id: U(4), telefone: '(12) 99123-4567', nome: 'Ana Souza', placa: 'abc-1d23', veiculo: 'Corolla 2019', servico: 'Troca de pastilhas' });
  const q = new URL(href).searchParams;
  assert.equal(new URL(href).origin, 'https://indycar-patio.netlify.app');
  assert.equal(q.get('entrada'), '1'); assert.equal(q.get('orcamento'), U(1)); assert.equal(q.get('agendamento'), U(2)); assert.equal(q.get('lead'), U(3)); assert.equal(q.get('cliente'), U(4));
  assert.equal(q.get('tel'), '5512991234567'); assert.equal(q.get('placa'), 'ABC1D23'); assert.equal(q.get('carro'), 'Corolla 2019'); assert.equal(q.get('servico'), 'Troca de pastilhas'); assert.equal(q.get('origem'), 'crm');
});
test('entrada no Pátio: uuid torto, placa inválida e telefone curto saem do link', () => {
  const q = new URL(R7.linkEntradaPatio({ orcamento_id: 'abc', agendamento_id: '123', lead_id: U(3), telefone: '123', placa: 'XX11', nome: '<b>Oi</b>' })).searchParams;
  assert.equal(q.get('orcamento'), null); assert.equal(q.get('agendamento'), null); assert.equal(q.get('tel'), null); assert.equal(q.get('placa'), null);
  assert.equal(q.get('lead'), U(3)); assert.equal(q.get('nome'), 'bOi/b');
});
test('entrada no Pátio: texto enorme é cortado e dentro da Central o link é relativo', () => {
  const q = new URL(R7.linkEntradaPatio({ servico: 'x'.repeat(900), nome: 'y'.repeat(500) })).searchParams;
  assert.equal(q.get('servico').length, 200); assert.equal(q.get('nome').length, 80);
});
test('atalhos: orçamento aprovado + horário sem ordem aberta mostram "abrir entrada" já preenchida', () => {
  const l = lead(1, { status: 'agendado', placa: 'ABC1D23', carro_modelo: 'Gol', servico: 'Revisão' });
  const a = R7.atalhosDoLead(l, { orcAprovado: { id: U(10) }, agendamento: { id: U(11) } });
  assert.match(a.entrada_patio.href, /orcamento=aaaaaaaa/); assert.match(a.entrada_patio.href, /agendamento=aaaaaaaa/); assert.match(a.entrada_patio.motivo, /chegou/);
  assert.match(a.novo_orcamento.href, /agendamento=/); assert.match(a.novo_orcamento.href, /placa=ABC1D23/); assert.match(a.novo_orcamento.motivo, /aprovado/);
});
test('atalhos: carro já na oficina não oferece nova entrada e mostra a ordem aberta', () => {
  const a = R7.atalhosDoLead(lead(1, { status: 'em_servico' }), { orcAprovado: { id: U(10) }, os: { id: U(20), numero: 7, etapa: 'em_execucao' } });
  assert.equal(a.entrada_patio, null); assert.equal(a.ordem_aberta.numero, 7); assert.match(a.ordem_aberta.href, /\?os=/);
});
test('atalhos: lead perdido não oferece entrada nem orçamento; lead novo sem motivo não oferece entrada', () => {
  assert.equal(R7.atalhosDoLead(lead(1, { status: 'perdido' }), {}).novo_orcamento, null);
  assert.equal(R7.atalhosDoLead(lead(2, { status: 'novo' }), {}).entrada_patio, null);
});
test('atalhos: o novo orçamento leva a conversa do Atendimento e o horário', () => {
  const a = R7.atalhosDoLead(lead(1), { conversaId: U(30), agendamento: { id: U(31) } });
  assert.match(a.novo_orcamento.href, /conversa=aaaaaaaa-aaaa-4aaa-8aaa-000000000030/); assert.match(a.novo_orcamento.href, /agendamento=aaaaaaaa-aaaa-4aaa-8aaa-000000000031/);
});

/* ---------- funil que se mexe sozinho ---------- */
test('funil: ordem aberta no Pátio move o lead para Em serviço', () => {
  const l = lead(1, { status: 'agendado' });
  const [m] = movs([l], { os: [{ id: U(50), numero: 9, etapa: 'diagnostico', lead_id: l.id }] });
  assert.equal(m.para, 'em_servico'); assert.equal(m.codigo, 'carro_na_oficina'); assert.match(m.link, /\?os=/); assert.match(m.motivo, /nº 9/);
});
test('funil: carro entregue pede para concluir e avisa que falta o valor', () => {
  const l = lead(1, { status: 'em_servico' });
  const [m] = movs([l], { entregues: [{ id: U(51), numero: 4, lead_id: l.id, entregue_em: dias(1) }] });
  assert.equal(m.para, 'concluido'); assert.equal(m.precisa_valor, true);
});
test('funil: orçamento enviado move Novo e Em contato para Orçamento e traz o valor', () => {
  for (const st of ['novo', 'contato']) {
    const l = lead(1, { status: st });
    const [m] = movs([l], { orcs: [{ id: U(60), numero: 3, status: 'enviado', lead_id: l.id, total: 900, enviado_em: dias(1), created_at: dias(1) }] });
    assert.equal(m.para, 'orcamento'); assert.equal(m.valor_novo, 900);
  }
});
test('funil: lead que já está em Orçamento não recebe o mesmo movimento', () => {
  const l = lead(1, { status: 'orcamento' });
  assert.deepEqual(movs([l], { orcs: [{ id: U(60), numero: 3, status: 'enviado', lead_id: l.id, total: 900, enviado_em: dias(1), created_at: dias(1) }] }), []);
});
test('funil: horário na Agenda move para Agendado', () => {
  const l = lead(1, { status: 'orcamento' });
  const [m] = movs([l], { agendamentos: [{ id: U(70), lead_id: l.id, status: 'confirmado', data: '2026-10-28', hora: '09:00' }] });
  assert.equal(m.para, 'agendado'); assert.match(m.link, /agendamento=/);
});
test('funil: orçamento recusado sem outro em andamento sugere perder, com o motivo do Orçador', () => {
  const l = lead(1, { status: 'orcamento', observacoes: '[Orçador 24/10 10:00] Orçamento nº 0003 recusado — motivo: preço.' });
  const [m] = movs([l], { orcs: [{ id: U(61), numero: 3, status: 'recusado', lead_id: l.id, total: 900, decidido_em: dias(1), created_at: dias(2) }] });
  assert.equal(m.para, 'perdido'); assert.equal(m.motivo_perda, 'Achou caro');
});
test('funil: recusado COM outro orçamento vivo não sugere perder', () => {
  const l = lead(1, { status: 'orcamento' });
  const r = movs([l], { orcs: [{ id: U(61), numero: 3, status: 'recusado', lead_id: l.id, total: 900, decidido_em: dias(3), created_at: dias(4) }, { id: U(62), numero: 4, status: 'enviado', lead_id: l.id, total: 500, enviado_em: dias(1), created_at: dias(1) }] });
  assert.ok(!r.some(x => x.para === 'perdido'));
});
test('funil: Agendado sem horário (parado há mais de um dia) volta para Em contato', () => {
  const [m] = movs([lead(1, { status: 'agendado', updated_at: dias(3) })]);
  assert.equal(m.para, 'contato'); assert.equal(m.codigo, 'agendado_sem_horario');
});
test('funil: Agendado mexido hoje ainda não é cobrado', () => {
  assert.deepEqual(movs([lead(1, { status: 'agendado', updated_at: dias(0.1) })]), []);
});
test('funil: Em serviço sem ordem aberta vira "revisar" (sem movimento automático) com a entrada pronta', () => {
  const [m] = movs([lead(1, { status: 'em_servico', placa: 'ABC1D23' })]);
  assert.equal(m.aplicavel, false); assert.equal(m.para, null); assert.match(m.link, /entrada=1/); assert.match(m.link, /placa=ABC1D23/);
});
test('funil: lead concluído ou perdido nunca recebe movimento', () => {
  assert.deepEqual(movs([lead(1, { status: 'concluido' }), lead(2, { status: 'perdido' })], { os: [{ id: U(50), lead_id: U(1), etapa: 'recebido' }] }), []);
});
test('funil: os que podem ser aplicados vêm antes dos que só pedem revisão', () => {
  const r = movs([lead(1, { status: 'em_servico' }), lead(2, { status: 'novo' })], { orcs: [{ id: U(60), numero: 3, status: 'enviado', lead_id: U(2), total: 100, enviado_em: dias(1), created_at: dias(1) }] });
  assert.deepEqual(r.map(x => x.aplicavel), [true, false]);
});
test('funil: movimento só vale se ainda for o que o funil sugere agora', () => {
  const r = movs([lead(1, { status: 'novo' })], { orcs: [{ id: U(60), numero: 3, status: 'enviado', lead_id: U(1), total: 100, enviado_em: dias(1), created_at: dias(1) }] });
  assert.ok(R7.movimentoAindaVale(r, U(1), 'orcamento')); assert.equal(R7.movimentoAindaVale(r, U(1), 'concluido'), null); assert.equal(R7.movimentoAindaVale(r, U(9), 'orcamento'), null);
});
test('funil: o motivo da perda entra uma vez só nas observações', () => {
  assert.equal(R7.observacoesComMotivo('Oi', 'Achou caro'), 'Oi\nMotivo da perda: Achou caro');
  assert.equal(R7.observacoesComMotivo('Oi\nMotivo da perda: Outro', 'Achou caro'), 'Oi\nMotivo da perda: Outro');
  assert.equal(R7.observacoesComMotivo('', 'Outro'), 'Motivo da perda: Outro');
});

/* ---------- retornos ---------- */
test('retornos: separa atrasados, hoje por período, amanhã, semana e sem retorno', () => {
  const t = h => new Date(AGORA + h * 3600_000).toISOString();
  const leads = [lead(1, { proximo_contato_em: t(-5) }), lead(2, { proximo_contato_em: t(1) }), lead(3, { proximo_contato_em: t(4) }), lead(4, { proximo_contato_em: t(20) }), lead(5, { proximo_contato_em: t(24 * 4) }), lead(6, { proximo_contato_em: t(24 * 20) }), lead(7), lead(8, { status: 'perdido' })];
  const r = R7.agruparRetornos(leads, { agora: AGORA });
  assert.deepEqual(r.contagem, { atrasados: 1, hoje: 2, amanha: 1, semana: 1, depois: 1, sem_retorno: 1, abertos: 7 });
  assert.equal(r.atrasados[0].horas_atraso, 5); assert.equal(r.cobertura_pct, 86);
  assert.equal(r.hoje_periodos.tarde + r.hoje_periodos.fim + r.hoje_periodos.manha, 2);
});
test('retornos: "sem retorno" ordena pelo valor e corta com contagem do que sobrou', () => {
  const leads = Array.from({ length: 5 }, (_, i) => lead(i + 1, { valor_orcado: i * 100 }));
  const r = R7.agruparRetornos(leads, { agora: AGORA, limiteSem: 3 });
  assert.equal(r.sem_retorno.length, 3); assert.equal(r.sem_retorno_mais, 2); assert.equal(r.sem_retorno[0].valor_orcado, 400);
});
test('retornos: o gestor vê quantos atrasados e sem retorno cada pessoa tem', () => {
  const nomes = new Map([[U(901), 'Ana'], [U(902), 'Bruno']]);
  const r = R7.agruparRetornos([lead(1, { responsavel_id: U(901), proximo_contato_em: dias(1) }), lead(2, { responsavel_id: U(901) }), lead(3, { responsavel_id: U(902) }), lead(4)], { agora: AGORA, nomes });
  const ana = r.por_pessoa.find(p => p.nome === 'Ana');
  assert.equal(ana.atrasados, 1); assert.equal(ana.sem_retorno, 1); assert.equal(r.por_pessoa[0].nome, 'Ana'); assert.ok(r.por_pessoa.some(p => p.nome === 'Sem responsável'));
});
test('retornos: sem nenhum lead aberto a cobertura é 100%', () => assert.equal(R7.agruparRetornos([], { agora: AGORA }).cobertura_pct, 100));

/* ---------- saúde, melhor hora, canal ---------- */
test('saúde: lead com carro na oficina e contato de ontem é quente', () => {
  const l = lead(1, { status: 'em_servico', ultimo_contato_em: dias(1), valor_orcado: 500 });
  const s = R6.construirSinais([l], { os: [{ id: U(50), etapa: 'recebido', lead_id: l.id }], tarefas: [], agendamentos: [], orcs: [], conversas: [], extras: [], entregues: [] }, AGORA)[l.id];
  const h = R7.saudeDoLead(l, s, AGORA);
  assert.equal(h.nivel, 'quente'); assert.ok(h.valor >= 70 && h.valor <= 100); assert.ok(h.motivos.length >= 2);
});
test('saúde: lead nunca contatado, com 3 tentativas e retorno vencido é frio', () => {
  const l = lead(1, { created_at: dias(10), tentativas_contato: 3, proximo_contato_em: dias(2) });
  const h = R7.saudeDoLead(l, sinaisDe([l])[l.id], AGORA);
  assert.equal(h.nivel, 'frio'); assert.ok(h.motivos.some(m => /tentativas/.test(m.texto)));
});
test('saúde: nota sempre fica entre 0 e 100', () => {
  const ruim = lead(1, { created_at: dias(40), tentativas_contato: 9, proximo_contato_em: dias(9) });
  const h = R7.saudeDoLead(ruim, { flags: ['followup_vencido', 'orcamento_recusado', 'orcamento_parado'] }, AGORA);
  assert.ok(h.valor >= 0 && h.valor <= 100);
});
test('melhor horário: precisa de 2 contatos que deram certo e acha o período', () => {
  assert.equal(R7.melhorHorario([{ resultado: 'atendeu', created_at: '2026-10-20T13:00:00Z' }]), null);
  const r = R7.melhorHorario([{ resultado: 'atendeu', created_at: '2026-10-20T13:00:00Z' }, { resultado: 'respondeu', created_at: '2026-10-21T14:30:00Z' }, { resultado: 'nao_atendeu', created_at: '2026-10-22T21:00:00Z' }]);
  assert.equal(r.periodo, 'manha'); assert.equal(r.vezes, 2); assert.equal(r.de, 2);
});
test('melhor horário: fim da tarde (depois das 15h em São Paulo)', () => {
  const r = R7.melhorHorario([{ resultado: 'atendeu', created_at: '2026-10-20T19:00:00Z' }, { resultado: 'atendeu', created_at: '2026-10-21T20:00:00Z' }]);
  assert.equal(r.periodo, 'fim');
});
test('canal: com menos de 3 tentativas não opina; depois escolhe o que mais funciona', () => {
  assert.equal(R7.canalQueFunciona([{ tipo: 'ligacao', resultado: 'nao_atendeu' }]), null);
  const r = R7.canalQueFunciona([{ tipo: 'ligacao', resultado: 'nao_atendeu' }, { tipo: 'ligacao', resultado: 'caixa_postal' }, { tipo: 'whatsapp', resultado: 'respondeu' }, { tipo: 'whatsapp', resultado: 'respondeu' }]);
  assert.equal(r.melhor, 'whatsapp'); assert.match(r.rotulo, /WhatsApp/); assert.equal(r.canais[0].taxa, 100);
});
test('canal: se nada deu certo, diz isso em vez de apontar um canal', () => {
  const r = R7.canalQueFunciona([1, 2, 3].map(() => ({ tipo: 'ligacao', resultado: 'nao_atendeu' })));
  assert.equal(r.melhor, null); assert.match(r.rotulo, /Nenhum/);
});
test('tempo como lead: dias, contatos (sem notas e sem eventos do sistema) e demora do 1º contato', () => {
  const l = lead(1, { created_at: dias(4) });
  const r = R7.tempoComoLead(l, [{ tipo: 'ligacao', created_at: new Date(Date.parse(l.created_at) + 3 * 3600_000).toISOString() }, { tipo: 'nota', created_at: dias(1) }, { tipo: 'sistema', created_at: dias(1) }], AGORA);
  assert.equal(r.dias, 4); assert.equal(r.contatos, 1); assert.equal(r.primeiro_contato_h, 3);
});

/* ---------- perdas ---------- */
const perdido = (n, motivo, x = {}) => lead(n, { status: 'perdido', observacoes: motivo ? 'Motivo da perda: ' + motivo : '', closed_at: dias(20), valor_orcado: 300, ...x });
test('perdas: conta por motivo padronizado, com valor e percentual', () => {
  const r = R7.analisarPerdas([perdido(1, 'Achou caro'), perdido(2, 'achei caro demais'), perdido(3, 'Desistiu do serviço'), perdido(4, null)], { agora: AGORA });
  assert.equal(r.perdidos, 4); assert.equal(r.motivos[0].motivo, 'Achou caro'); assert.equal(r.motivos[0].quantidade, 2); assert.equal(r.motivos[0].pct, 50); assert.equal(r.valor_perdido, 1200);
  assert.ok(r.motivos.some(m => m.motivo === 'Sem motivo'));
});
test('perdas: recuperáveis são só preço, prazo e sem retorno, perdidos há 7 dias ou mais, com mensagem sem preço', () => {
  const r = R7.analisarPerdas([perdido(1, 'Achou caro'), perdido(2, 'Desistiu do serviço'), perdido(3, 'Prazo não atendeu', { closed_at: dias(2) }), perdido(4, 'Sem retorno do cliente', { valor_orcado: 900 })], { agora: AGORA });
  assert.deepEqual(r.recuperaveis.map(x => x.id), [U(4), U(1)]);
  for (const i of r.recuperaveis) { assert.match(i.script, /IndyCar/); assert.doesNotMatch(i.script, /R\$|prezado|efetuar|comparecer|veículo/i); }
  assert.equal(r.recuperaveis_valor, 1200);
});
test('perdas: mensagem de preço diz que pode rever, nunca promete número', () => {
  assert.match(R7.scriptReabordar('Achou caro', { nome: 'Ana Souza', carro_modelo: 'Gol' }), /Oi, Ana! .*seu Gol.*rever o orçamento/);
  assert.match(R7.scriptReabordar('Prazo não atendeu', {}), /segunda a sábado, das 8h às 17h30/);
  assert.match(R7.scriptReabordar('Sem retorno do cliente', {}), /Quem conhece, Indyca! 🏎/);
});
test('perdas: lead já com retorno combinado no futuro não entra nos recuperáveis', () => {
  const r = R7.analisarPerdas([perdido(1, 'Achou caro', { proximo_contato_em: new Date(AGORA + 864e5).toISOString() })], { agora: AGORA });
  assert.equal(r.recuperaveis.length, 0);
});
test('perdas: fora da janela de dias não conta; taxa de perda por origem', () => {
  const r = R7.analisarPerdas([perdido(1, 'Outro', { closed_at: dias(200) }), perdido(2, 'Outro', { origem: 'google' }), perdido(3, 'Outro', { origem: 'google' }), lead(4, { status: 'concluido', origem: 'google', closed_at: dias(3), valor_pago: 100 })], { agora: AGORA, dias: 90 });
  assert.equal(r.perdidos, 2); const g = r.origens.find(o => o.origem === 'google'); assert.equal(g.taxa_perda, 67);
});
test('perdas: frases avisam leads sem motivo e quantos dão para reabordar', () => {
  const r = R7.analisarPerdas([perdido(1, null), perdido(2, null), perdido(3, null), perdido(4, 'Achou caro'), perdido(5, 'Achou caro'), perdido(6, 'Achou caro'), perdido(7, 'Achou caro')], { agora: AGORA });
  assert.ok(r.insights.some(t => /sem motivo/.test(t))); assert.ok(r.insights.some(t => /reabordar/.test(t))); assert.ok(r.insights.some(t => /achou caro/.test(t)));
});
test('perdas: tempo médio até perder e perdas por vendedor', () => {
  const r = R7.analisarPerdas([perdido(1, 'Outro', { created_at: dias(30), closed_at: dias(20), responsavel_id: U(901) }), perdido(2, 'Outro', { created_at: dias(24), closed_at: dias(20), responsavel_id: U(901) })], { agora: AGORA, nomes: new Map([[U(901), 'Ana']]) });
  assert.equal(r.tempo_medio_ate_perder_dias, 7); assert.equal(r.vendedores[0].nome, 'Ana'); assert.equal(r.vendedores[0].perdidos, 2);
});

/* ---------- indicações ---------- */
test('indicações: ranking de quem indica com quantos viraram cliente e o valor', () => {
  const leads = [lead(1, { status: 'concluido', valor_pago: 500, closed_at: dias(2), origem: 'indicacao' }), lead(2, { status: 'concluido', valor_pago: 300, closed_at: dias(40), origem: 'indicacao' }), lead(3, { status: 'novo', origem: 'indicacao' }), lead(4, { status: 'perdido', origem: 'indicacao' })];
  const ind = [{ id: 'i1', indicado_por: 'c1', nome: 'Beto', lead_id: U(1), created_at: dias(10) }, { id: 'i2', indicado_por: 'c1', nome: 'Caio', lead_id: U(2), created_at: dias(50) }, { id: 'i3', indicado_por: 'c2', nome: 'Duda', lead_id: U(3), created_at: dias(1) }, { id: 'i4', indicado_por: 'c2', nome: 'Edu', lead_id: U(4), created_at: dias(9) }];
  const r = R7.painelIndicacoes(ind, leads, new Map([['c1', { nome: 'Fátima Lima', telefone: '12999990001' }], ['c2', { nome: 'Gil' }]]), { agora: AGORA });
  assert.equal(r.total, 4); assert.equal(r.viraram, 2); assert.equal(r.taxa, 50); assert.equal(r.valor, 800); assert.equal(r.valor_medio, 400);
  assert.equal(r.ranking[0].nome, 'Fátima Lima'); assert.equal(r.ranking[0].viraram, 2); assert.equal(r.ranking[0].valor, 800);
});
test('indicações: indicado novo sem contato aparece esperando, com as horas', () => {
  const r = R7.painelIndicacoes([{ id: 'i3', indicado_por: 'c2', nome: 'Duda', telefone: '12999990009', lead_id: U(3), created_at: dias(1) }], [lead(3, { status: 'novo', origem: 'indicacao' })], new Map([['c2', { nome: 'Gil' }]]), { agora: AGORA });
  assert.equal(r.esperando_contato.length, 1); assert.equal(r.esperando_contato[0].horas, 24); assert.equal(r.esperando_contato[0].indicado_por, 'Gil');
});
test('indicações: agradecer só quem teve o amigo atendido nos últimos 30 dias, com texto da casa', () => {
  const leads = [lead(1, { status: 'concluido', valor_pago: 500, closed_at: dias(2) }), lead(2, { status: 'concluido', valor_pago: 300, closed_at: dias(40) })];
  const ind = [{ id: 'i1', indicado_por: 'c1', nome: 'Beto Silva', lead_id: U(1), created_at: dias(10) }, { id: 'i2', indicado_por: 'c1', nome: 'Caio', lead_id: U(2), created_at: dias(50) }];
  const r = R7.painelIndicacoes(ind, leads, new Map([['c1', { nome: 'Fátima Lima', telefone: '12999990001' }]]), { agora: AGORA });
  assert.equal(r.agradecer.length, 1); assert.match(r.agradecer[0].script, /Oi, Fátima! .*amigo Beto/); assert.match(r.agradecer[0].script, /Quem conhece, Indyca! 🏎/); assert.doesNotMatch(r.agradecer[0].script, /R\$/);
});
test('indicações: sem lead ligado a indicação não conta como conversão', () => {
  const r = R7.painelIndicacoes([{ id: 'i1', indicado_por: 'c1', nome: 'X', lead_id: null, created_at: dias(1) }], [], new Map(), { agora: AGORA });
  assert.equal(r.total, 1); assert.equal(r.com_lead, 0); assert.equal(r.taxa, 0);
});
test('indicação nova entra na fila acima do primeiro contato comum', () => {
  const l = lead(1, { status: 'novo', origem: 'indicacao', created_at: dias(0.2) });
  const s = sinaisDe([l])[l.id];
  assert.ok(s.flags.includes('indicacao_nova')); const pr = R6.prioridadeFila(l, s, AGORA);
  assert.equal(pr.principal.codigo, 'indicacao_nova'); assert.equal(pr.score, 88); assert.match(R6.scriptSugerido('indicacao_nova', l), /Um amigo seu/);
  const outro = lead(2, { status: 'novo', origem: 'whatsapp', created_at: dias(0.2) });
  assert.ok(!sinaisDe([outro])[outro.id].flags.includes('indicacao_nova'));
});
test('indicação com mais de 7 dias sem contato deixa de ser sinal novo', () => {
  const l = lead(1, { status: 'novo', origem: 'indicacao', created_at: dias(9) });
  assert.ok(!sinaisDe([l])[l.id].flags.includes('indicacao_nova'));
});

/* ---------- origens ---------- */
const MES0 = Date.parse('2026-10-01T03:00:00Z'), FIM = Date.parse('2026-10-26T03:00:00Z');
test('origens: leads, vendas, faturamento, ticket e conversão por origem', () => {
  const ls = [lead(1, { origem: 'google', status: 'concluido', valor_pago: 600, created_at: '2026-10-05T12:00:00Z', closed_at: '2026-10-09T12:00:00Z' }), lead(2, { origem: 'google', status: 'perdido', created_at: '2026-10-06T12:00:00Z' }),
    lead(3, { origem: 'whatsapp', status: 'concluido', valor_pago: 200, created_at: '2026-10-07T12:00:00Z', closed_at: '2026-10-07T18:00:00Z' }), lead(4, { origem: 'whatsapp', status: 'novo', created_at: '2026-10-08T12:00:00Z' })];
  const r = R7.desempenhoPorOrigem(ls, [], { ini: MES0, fim: FIM });
  const g = r.linhas.find(x => x.origem === 'google');
  assert.equal(g.leads, 2); assert.equal(g.ganhos, 1); assert.equal(g.faturamento, 600); assert.equal(g.ticket, 600); assert.equal(g.conversao, 50); assert.equal(g.dias_ate_fechar, 4);
  assert.equal(r.linhas[0].origem, 'google'); assert.equal(r.total.faturamento, 800); assert.equal(r.total.leads, 4);
});
test('origens: Meta e Google ganham custo por lead, por venda e retorno; as outras não têm gasto', () => {
  const ls = [lead(1, { origem: 'meta', status: 'concluido', valor_pago: 900, created_at: '2026-10-05T12:00:00Z', closed_at: '2026-10-06T12:00:00Z' }), lead(2, { origem: 'meta', created_at: '2026-10-05T13:00:00Z' }), lead(3, { origem: 'indicacao', created_at: '2026-10-05T13:00:00Z' })];
  const r = R7.desempenhoPorOrigem(ls, [{ plataforma: 'meta', gasto: 300 }, { plataforma: 'meta', gasto: 100 }], { ini: MES0, fim: FIM });
  const m = r.linhas.find(x => x.origem === 'meta');
  assert.equal(m.gasto, 400); assert.equal(m.cpl, 200); assert.equal(m.cac, 400); assert.equal(m.roas, 2.25); assert.equal(r.linhas.find(x => x.origem === 'indicacao').gasto, null);
  assert.equal(r.pago.gasto, 400); assert.equal(r.organico.leads, 1);
});
test('origens: compara com o período anterior do mesmo tamanho', () => {
  const ls = [lead(1, { origem: 'google', created_at: '2026-10-05T12:00:00Z' }), lead(2, { origem: 'google', created_at: '2026-10-06T12:00:00Z' }), lead(3, { origem: 'google', created_at: '2026-09-10T12:00:00Z' })];
  const r = R7.desempenhoPorOrigem(ls, [], { ini: MES0, fim: FIM });
  const g = r.linhas.find(x => x.origem === 'google'); assert.equal(g.leads_anterior, 1); assert.equal(g.variacao_leads, 100); assert.equal(r.anterior.leads, 1);
});
test('origens: frases dizem quem trouxe mais faturamento, quem gastou sem vender e vendas sem valor', () => {
  const ls = [lead(1, { origem: 'google', status: 'concluido', valor_pago: 1000, created_at: '2026-10-05T12:00:00Z', closed_at: '2026-10-06T12:00:00Z' }), lead(2, { origem: 'whatsapp', status: 'concluido', valor_pago: 0, created_at: '2026-10-05T12:00:00Z', closed_at: '2026-10-06T12:00:00Z' }), lead(3, { origem: 'meta', created_at: '2026-10-05T12:00:00Z' })];
  const r = R7.desempenhoPorOrigem(ls, [{ plataforma: 'meta', gasto: 250 }], { ini: MES0, fim: FIM });
  assert.ok(r.insights.some(t => /Google trouxe a maior parte/.test(t))); assert.ok(r.insights.some(t => /Meta.*gastou R\$ 250.*não trouxe venda/.test(t))); assert.ok(r.insights.some(t => /sem valor pago/.test(t)));
});
test('origens: origem vazia aparece como "Sem origem"', () => {
  const r = R7.desempenhoPorOrigem([lead(1, { origem: null, created_at: '2026-10-05T12:00:00Z' })], [], { ini: MES0, fim: FIM });
  assert.equal(r.linhas[0].rotulo, 'Sem origem');
});

/* ---------- qualidade ---------- */
test('qualidade: vendas concluídas sem valor trazem a sugestão e NÃO alteram o lead', () => {
  const l = lead(1, { status: 'concluido', valor_pago: 0, closed_at: dias(3) });
  const copia = JSON.stringify(l);
  const r = R7.qualidadePainel([l], { sugestoes: new Map([[l.id, [{ rotulo: 'Orçamento aprovado + extras do Pátio', valor: 850 }]]]) }, AGORA);
  const v = r.verificacoes.find(x => x.codigo === 'concluidos_sem_valor');
  assert.equal(v.total, 1); assert.match(v.exemplos[0].detalhe, /R\$ 850/); assert.equal(v.acao, 'valores'); assert.equal(r.valor_sem_registro_estimado, 850); assert.equal(JSON.stringify(l), copia);
});
test('qualidade: cortesia declarada não é "sem valor"', () => {
  const l = lead(1, { status: 'concluido', observacoes: 'Cortesia: sem cobrança', closed_at: dias(3), responsavel_id: U(9) });
  assert.ok(!R7.qualidadePainel([l], {}, AGORA).verificacoes.some(x => x.codigo === 'concluidos_sem_valor'));
});
test('qualidade: vendas sem vendedor e concluídos sem data de fechamento', () => {
  const r = R7.qualidadePainel([lead(1, { status: 'concluido', valor_pago: 100, closed_at: null })], {}, AGORA);
  assert.ok(r.verificacoes.some(x => x.codigo === 'concluidos_sem_responsavel')); assert.ok(r.verificacoes.some(x => x.codigo === 'concluidos_sem_data'));
});
test('qualidade: Em serviço sem ordem aberta e Agendado sem horário', () => {
  const r = R7.qualidadePainel([lead(1, { status: 'em_servico' }), lead(2, { status: 'agendado' }), lead(3, { status: 'em_servico' })], { os: [{ lead_id: U(3), etapa: 'recebido' }] }, AGORA);
  assert.equal(r.verificacoes.find(x => x.codigo === 'em_servico_sem_ordem').total, 1); assert.equal(r.verificacoes.find(x => x.codigo === 'agendado_sem_horario').total, 1);
});
test('qualidade: ordem ENTREGUE não conta como carro na oficina', () => {
  const r = R7.qualidadePainel([lead(1, { status: 'em_servico' })], { os: [{ lead_id: U(1), etapa: 'entregue' }] }, AGORA);
  assert.equal(r.verificacoes.find(x => x.codigo === 'em_servico_sem_ordem').total, 1);
});
test('qualidade: valor pago estranho (zero a mais ou a menos) e perdidos sem motivo', () => {
  const r = R7.qualidadePainel([lead(1, { status: 'concluido', valor_pago: 5000, valor_orcado: 500, responsavel_id: U(9), closed_at: dias(1) }), lead(2, { status: 'perdido' }), lead(3, { status: 'perdido', observacoes: 'Motivo da perda: Outro' })], {}, AGORA);
  assert.equal(r.verificacoes.find(x => x.codigo === 'valor_estranho').total, 1); assert.equal(r.verificacoes.find(x => x.codigo === 'perdidos_sem_motivo').total, 1);
});
test('qualidade: nome ruim, placa inválida, telefone repetido e sem telefone', () => {
  const r = R7.qualidadePainel([lead(1, { nome: 'Cliente' }), lead(2, { nome: 'Maria', placa: 'XX11' }), lead(3, { telefone: '12991111111' }), lead(4, { telefone: '(12) 99111-1111' }), lead(5, { telefone: '12' })], {}, AGORA);
  const t = c => r.verificacoes.find(x => x.codigo === c)?.total;
  assert.equal(t('nome_ruim'), 1); assert.equal(t('placa_invalida'), 1); assert.equal(t('duplicados'), 2); assert.equal(t('sem_telefone'), 1);
});
test('qualidade: utm de anúncio com origem que não é Meta nem Google', () => {
  const r = R7.qualidadePainel([lead(1, { utm_source: 'facebook', origem: 'whatsapp' }), lead(2, { utm_source: 'facebook', origem: 'meta' })], {}, AGORA);
  assert.equal(r.verificacoes.find(x => x.codigo === 'origem_incerta').total, 1);
});
test('qualidade: nota 0 a 100 cai quando há problemas graves e fica 100 com dados limpos', () => {
  const limpo = R7.qualidadePainel([lead(1, { responsavel_id: U(9), nome: 'Maria Souza', telefone: '12991234567', placa: 'ABC1D23' })], {}, AGORA);
  assert.equal(limpo.nota, 100); assert.equal(limpo.nivel, 'boa');
  const sujo = R7.qualidadePainel(Array.from({ length: 30 }, (_, i) => lead(i + 1, { status: 'concluido', valor_pago: 0, closed_at: dias(2) })), {}, AGORA);
  assert.ok(sujo.nota < 85); assert.ok(sujo.a_corrigir >= 60);
});
test('qualidade: gravidade alta vem primeiro', () => {
  const r = R7.qualidadePainel([lead(1, { status: 'concluido', valor_pago: 0, closed_at: dias(2) }), lead(2, { nome: 'Cliente' })], {}, AGORA);
  assert.equal(r.verificacoes[0].gravidade, 'alta');
});

/* ---------- resumos do dono ---------- */
const RESUMO = { mes: { faturamento: 12000, vendas: 14, ritmo: { meta: 30000, realizado: 12000, pct: 40, projecao: 22000, risco: true, por_dia_util: 900 } }, semana: { leads: 20, vendas: 6, faturamento: 4000, conversao: 38 }, anterior: { faturamento: 5000 },
  patio: { no_patio: 4, prontos: 1, entregues_hoje: 2 }, orcamentos: { enviados: 5, valor_enviado: 4500 }, avaliacoes: { media: 4.6, total: 9 }, ads: { gasto_mes: 800, ganhos: 3, roas: 2.1 },
  insights: [{ nivel: 'alerta', texto: '2 clientes esperando resposta.' }, { nivel: 'ok', texto: 'Meta batida.' }], perdas: [{ motivo: 'Achou caro', qtd: 4 }] };
const X = { ontem: { leads: 5, vendas: 2, faturamento: 1500 }, hoje: { leads: 3, contatos: 17, vendas: 1, faturamento: 700, orcamentos_enviados: 4 }, agenda_hoje: 6, agenda_amanha: 5, retornos: { hoje: 8, atrasados: 3 },
  contatos_por_pessoa: [{ nome: 'Ana Souza', contatos: 11 }, { nome: 'Bruno Dias', contatos: 6 }], prioridades: [{ nome: 'Carla', texto: 'Cliente esperando resposta há 3 h' }], perdas: [{ motivo: 'Achou caro', qtd: 4 }], qualidade: { vendas_sem_valor: 99 } };
const PROIBIDAS = /prezado|efetuar|comparecer|veículo/i;
test('resumo do dono (manhã): ontem, meta, agenda, oficina, retornos e para começar', () => {
  const t = R7.montarResumoDono('manha', RESUMO, X, new Date(AGORA));
  assert.match(t, /Bom dia/); assert.match(t, /Ontem: 5 leads novos, 2 vendas/); assert.match(t, /Hoje na Agenda: 6 clientes \(amanhã 5\)/); assert.match(t, /Retornos combinados: 8 para hoje, 3 atrasados/); assert.match(t, /\*Para começar:\*\n• Carla/);
  assert.match(t, /faltam R\$ 900 por dia útil/); assert.doesNotMatch(t, PROIBIDAS);
});
test('resumo do dono (fechamento): contatos do dia, vendas, entregues e quem ligou mais', () => {
  const t = R7.montarResumoDono('fechamento', RESUMO, X, new Date(AGORA));
  assert.match(t, /Fechamento do dia/); assert.match(t, /17 contatos registrados/); assert.match(t, /Orçamentos enviados hoje: 4/); assert.match(t, /Entregues hoje: 2/); assert.match(t, /Ana 11 · Bruno 6/);
});
test('resumo do dono (semana): variação, anúncios e por que perdemos', () => {
  const t = R7.montarResumoDono('semana', RESUMO, X, new Date(AGORA));
  assert.match(t, /Resumo da semana/); assert.match(t, /Faturamento caiu 20%/); assert.match(t, /retorno 2.1x/); assert.match(t, /achou caro \(4\)/);
});
test('resumo do dono: avisa que as vendas sem valor fazem o faturamento real ser maior', () => {
  assert.match(R7.montarResumoDono('manha', RESUMO, X, new Date(AGORA)), /99 vendas concluídas estão sem valor pago/);
});
test('resumo do dono: tipo desconhecido vira "manhã", pontos "ok" não entram na atenção, texto tem teto', () => {
  const t = R7.montarResumoDono('xyz', RESUMO, X, new Date(AGORA));
  assert.match(t, /Bom dia/); assert.doesNotMatch(t, /Meta batida/); assert.ok(t.length < 3500);
});
test('resumo do dono: sem nenhum dado extra ainda monta o texto', () => {
  const t = R7.montarResumoDono('fechamento', { mes: { faturamento: 0, vendas: 0 }, insights: [] }, {}, new Date(AGORA));
  assert.match(t, /Hoje: 0 leads novos, 0 contatos registrados, 0 vendas/);
});
