'use strict';
/* Rodada 6 (21/10/2026): ciclo anúncio -> orçamento -> pátio, links nomeados, leads com etapa. Sem banco, sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');

const Ciclo = require('../ciclo');
const Eco = require('../public/ecossistema.js');
const Leads = require('../leads');
const A = require('../atribuicao');
const R = require('../resultados');
const S = require('../semanal');
const Rel = require('../relatorio');

const AGORA = Date.parse('2026-10-21T15:00:00Z');
const horas = n => new Date(AGORA - n * 3600000).toISOString();

const lead = (id, extra = {}) => ({ id, cliente_id: 'c-' + id, origem: 'meta', status: 'novo', utm_source: 'instagram', utm_campaign: 'Revisão', valor_pago: null, created_at: horas(5), ...extra });

test('ligar: a OS acha o lead pelo lead_id, pelo orçamento de origem e pelo agendamento — sem duplicar', () => {
  const m = Ciclo.ligar({
    leadIds: ['l1', 'l2', 'l3'],
    orcamentos: [{ id: 'o2', lead_id: 'l2', status: 'aprovado', total: 500 }, { id: 'o9', lead_id: 'l1', status: 'aberto', rascunho: true }],
    os: [{ id: 's1', lead_id: 'l1', etapa: 'recebido' }, { id: 's2', orcamento_id: 'o2', etapa: 'pronto' },
      { id: 's3', agendamento_id: 'a3', etapa: 'entregue' }, { id: 's3', agendamento_id: 'a3', etapa: 'entregue' }, { id: 's4', etapa: 'recebido' }],
    agendamentos: [{ id: 'a3', lead_id: 'l3' }],
  });
  assert.equal(m.get('l1').os.length, 1);
  assert.equal(m.get('l2').os[0].id, 's2');
  assert.equal(m.get('l3').os.length, 1, 'OS duplicada na lista conta uma vez');
  assert.equal(m.get('l1').orcamentos.length, 0, 'rascunho não é orçamento');
  assert.ok(![...m.values()].some(v => v.os.some(o => o.id === 's4')), 'OS sem lead não entra');
});

test('ligar: extras aprovados, pendentes e recusados são somados por lead', () => {
  const m = Ciclo.ligar({ leadIds: ['l1'], os: [{ id: 's1', lead_id: 'l1', etapa: 'em_execucao' }],
    extras: [{ os_id: 's1', valor: 120, status: 'aprovado' }, { os_id: 's1', valor: '80.5', status: 'aprovado' }, { os_id: 's1', valor: 40, status: 'pendente' }, { os_id: 's1', valor: 10, status: 'recusado' }, { os_id: 'x', valor: 999, status: 'aprovado' }] });
  const e = m.get('l1').extras;
  assert.equal(e.aprovado, 200.5); assert.equal(e.qtd_aprovado, 2); assert.equal(e.pendente, 40); assert.equal(e.recusado, 10);
});

test('melhorOrcamento: aprovado vence enviado vence recusado; empate pega o mais recente', () => {
  const o = [{ id: 'a', status: 'recusado', created_at: '2026-10-01' }, { id: 'b', status: 'enviado', created_at: '2026-10-02' }, { id: 'c', status: 'enviado', created_at: '2026-10-05' }];
  assert.equal(Ciclo.melhorOrcamento(o).id, 'c');
  assert.equal(Ciclo.melhorOrcamento([...o, { id: 'd', status: 'aprovado', created_at: '2026-09-01' }]).id, 'd');
  assert.equal(Ciclo.melhorOrcamento([]), null);
});

test('osPrincipal: a que está no pátio vence a entregue; cancelada só se não houver outra', () => {
  assert.equal(Ciclo.osPrincipal([{ id: '1', etapa: 'entregue', created_at: '2026-10-09' }, { id: '2', etapa: 'em_execucao', created_at: '2026-10-01' }]).id, '2');
  assert.equal(Ciclo.osPrincipal([{ id: '1', etapa: 'cancelado' }, { id: '2', etapa: 'entregue' }]).id, '2');
  assert.equal(Ciclo.osPrincipal([{ id: '1', etapa: 'cancelado' }]).id, '1');
});

test('resumoDoLead: links do orçamento e da OS, horas esperando e pronto parado', () => {
  const lig = { orcamentos: [{ id: 'o1', numero: 12, status: 'enviado', total: '780.00', enviado_em: horas(60) }],
    os: [{ id: 's1', numero: 7, etapa: 'pronto', etapa_em: horas(30) }], extras: { aprovado: 90, pendente: 0, recusado: 0 } };
  const r = Ciclo.resumoDoLead(lig, AGORA);
  assert.equal(r.orcamento.link, 'https://indycar-orcador.netlify.app/#/historico/o1');
  assert.equal(r.os.link, 'https://indycar-patio.netlify.app/?os=s1');
  assert.equal(r.orcamento.esperando_horas, 60); assert.equal(r.orcamento.total, 780);
  assert.equal(r.os.pronto_horas, 30); assert.equal(r.os.no_patio, true); assert.equal(r.extras_aprovados, 90);
  assert.equal(Ciclo.resumoDoLead(null), null);
  assert.equal(Ciclo.resumoDoLead({ orcamentos: [], os: [], extras: {} }), null);
});

function cenario() {
  const leads = [
    lead('l1', { status: 'concluido', valor_pago: 1000 }), lead('l2', { status: 'concluido' }), lead('l3', { status: 'agendado' }),
    lead('l4'), lead('l5', { origem: 'whatsapp', utm_source: null, utm_campaign: null }),
  ];
  const porLead = Ciclo.ligar({
    leadIds: leads.map(l => l.id),
    orcamentos: [
      { id: 'o1', lead_id: 'l1', status: 'aprovado', total: 900, decidido_em: horas(200) },
      { id: 'o2', lead_id: 'l2', status: 'aprovado', total: 600, decidido_em: horas(100) },
      { id: 'o3', lead_id: 'l3', status: 'aprovado', total: 400, decidido_em: horas(100) },
      { id: 'o4', lead_id: 'l4', status: 'enviado', total: 300, enviado_em: horas(72) },
      { id: 'o5', lead_id: 'l4', status: 'recusado', total: 250, motivo_cod: 'preco' },
    ],
    os: [{ id: 's1', lead_id: 'l1', etapa: 'entregue' }, { id: 's2', lead_id: 'l2', etapa: 'entregue' }, { id: 's3', orcamento_id: 'o3', etapa: 'pronto', etapa_em: horas(30) }],
    extras: [{ os_id: 's1', valor: 100, status: 'aprovado' }],
  });
  const resultado = A.consolidar({ leads, metricas: [{ plataforma: 'meta', campanha_nome: 'Revisão', gasto: 800 }, { plataforma: 'meta', campanha_nome: 'Sem retorno', gasto: 200 }] });
  return { leads, porLead, resultado };
}

test('consolidarCiclo: contagens, custo por carro e receita por campanha', () => {
  const { leads, porLead, resultado } = cenario();
  const c = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  const g = c.campanhas.find(x => x.campanha === 'Revisão');
  assert.equal(g.orcados, 4); assert.equal(g.orcamentos_aprovados, 3); assert.equal(g.orcamentos_enviados, 4, 'l1, l2 e l3 aprovados + l4 enviado');
  assert.equal(g.na_oficina, 3); assert.equal(g.no_patio_agora, 1); assert.equal(g.entregues, 2);
  // R13C: valor do serviço pela regra única (Pátio: orçamento aprovado + extras): l1 = 900 + 100, l2 = 600 (antes l2 contava 0)
  assert.equal(g.receita_entregues, 1600); assert.equal(g.entregues_sem_valor, 0);
  assert.equal(g.extras_aprovados, 100);
  assert.equal(g.gasto, 800); assert.equal(g.custo_carro_na_oficina, 800 / 3); assert.equal(g.custo_carro_entregue, 400);
  assert.equal(g.ticket_oficina, 800);
  assert.equal(g.receita_prevista, 900 + 600 + 400 + 100);
});

test('consolidarCiclo: campanha que gastou e não trouxe lead entra; o total de gasto bate com o Resultados', () => {
  const { leads, porLead, resultado } = cenario();
  const c = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  assert.ok(c.campanhas.find(x => x.campanha === 'Sem retorno' && x.gasto === 200 && x.custo_carro_na_oficina === null));
  assert.equal(c.total.gasto, 1000);
});

test('consolidarCiclo: lead de canal não pago (WhatsApp direto) fica fora', () => {
  const { leads, porLead, resultado } = cenario();
  const c = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  assert.equal(c.campanhas.reduce((s, g) => s + g.orcados, 0), 4);
});

test('consolidarCiclo: avisos de orçamento parado, pronto parado e valor sugerido; motivo de recusa', () => {
  const { leads, porLead, resultado } = cenario();
  const c = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  const tipos = c.alertas.map(a => a.tipo);
  assert.ok(tipos.includes('pronto_parado'));
  // R13C: l2 entregue com orçamento aprovado já TEM valor pela regra única (Pátio): não pede mais "lançar o valor sugerido"
  assert.ok(!tipos.includes('valor_sugerido'));
  assert.ok(tipos.includes('orcamento_parado'), 'l4: o melhor orçamento é o enviado há 72 h');
});

test('consolidarCiclo: orçamento enviado há mais de 48 h vira aviso com o valor', () => {
  const leads = [lead('x1')];
  const porLead = Ciclo.ligar({ leadIds: ['x1'], orcamentos: [{ id: 'o', lead_id: 'x1', status: 'enviado', total: 1500, enviado_em: horas(100) }] });
  const c = Ciclo.consolidarCiclo({ leads, porLead, agora: AGORA });
  const a = c.alertas.find(x => x.tipo === 'orcamento_parado');
  assert.equal(a.quantidade, 1); assert.equal(a.valor, 1500); assert.match(a.texto, /48 h/);
});

test('consolidarCiclo: orçamento aprovado há mais de 3 dias sem OS avisa; com OS cancelada também', () => {
  const leads = [lead('x1'), lead('x2')];
  const porLead = Ciclo.ligar({ leadIds: ['x1', 'x2'], orcamentos: [{ id: 'a', lead_id: 'x1', status: 'aprovado', total: 10, decidido_em: horas(90) }, { id: 'b', lead_id: 'x2', status: 'aprovado', total: 10, decidido_em: horas(90) }],
    os: [{ id: 's', lead_id: 'x2', etapa: 'cancelado' }] });
  const c = Ciclo.consolidarCiclo({ leads, porLead, agora: AGORA });
  assert.equal(c.alertas.find(x => x.tipo === 'aprovado_sem_os').quantidade, 2);
});

test('consolidarCiclo: motivos de recusa por extenso e ordenados', () => {
  const leads = [lead('a'), lead('b'), lead('c')];
  const porLead = Ciclo.ligar({ leadIds: ['a', 'b', 'c'], orcamentos: [
    { id: '1', lead_id: 'a', status: 'recusado', motivo_cod: 'preco' }, { id: '2', lead_id: 'b', status: 'recusado', motivo_cod: 'preco' }, { id: '3', lead_id: 'c', status: 'recusado', motivo_cod: 'outro_lugar' }] });
  const c = Ciclo.consolidarCiclo({ leads, porLead, agora: AGORA });
  assert.deepEqual(c.motivos.map(m => [m.motivo, m.qtd]), [['preço', 2], ['foi para outro lugar', 1]]);
});

test('consolidarCiclo: sem nada ligado, tudo zero e sem divisão por zero', () => {
  const c = Ciclo.consolidarCiclo({ leads: [lead('z')], porLead: new Map(), agora: AGORA });
  assert.equal(c.total.orcados, 0); assert.equal(c.total.custo_carro_na_oficina, null); assert.equal(c.total.conv_orcamento, null);
  assert.equal(Ciclo.frase(c), null);
});

test('funilCiclo: taxa só quando a etapa não passa da anterior', () => {
  const f = Ciclo.funilCiclo({ orcados: 10, orcamentos_aprovados: 4, na_oficina: 5, entregues: 2 });
  assert.equal(f[1].taxa, 40); assert.equal(f[2].taxa, null); assert.equal(f[3].taxa, 40);
});

test('frase: uma linha com orçamentos, carros, custo por carro e receita', () => {
  const { leads, porLead, resultado } = cenario();
  const f = Ciclo.frase(Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA }));
  assert.match(f, /4 orçamento\(s\) de anúncio, 3 aprovado\(s\)/);
  assert.match(f, /3 carro\(s\) na oficina \(1 no pátio agora\), 2 entregue\(s\)/);
  assert.match(f, /cada carro custou R\$\s?333,33 em anúncio/);
});

test('csv do ciclo: cabeçalho por extenso, linha TOTAL e nenhum dado de cliente', () => {
  const { leads, porLead, resultado } = cenario();
  const csv = Ciclo.csv(Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA }));
  assert.ok(csv.startsWith('﻿"Canal";"Campanha"'));
  assert.ok(csv.includes('"Custo por carro na oficina"') && csv.includes('"TOTAL"'));
  assert.ok(!/l1|c-l1|@/.test(csv.split('\r\n').slice(1).join('')), 'sem ids de lead nem e-mail');
});

test('ler: banco fora do ar devolve ok:false sem lançar; lista vazia não consulta nada', async () => {
  const quebrado = { from() { throw new Error('banco caiu'); } };
  const r = await Ciclo.ler(['a'], { sb: quebrado });
  assert.equal(r.ok, false); assert.match(r.erro, /banco caiu/);
  const vazio = await Ciclo.ler([], { sb: quebrado });
  assert.equal(vazio.ok, true); assert.equal(vazio.porLead.size, 0);
});

/* sb falso mínimo: .from(t).select().in(col, ids).neq()/then */
function sbFalso(tabelas) {
  return { from(t) {
    let linhas = tabelas[t] || [];
    const q = { select() { return q; }, or() { linhas = linhas.filter(l => l.rascunho !== true); return q; }, neq(c, v) { linhas = linhas.filter(l => l[c] !== v); return q; },
      in(c, ids) { linhas = linhas.filter(l => ids.includes(l[c])); return q; },
      then(ok) { return Promise.resolve({ data: linhas, error: null }).then(ok); } };
    return q;
  } };
}

test('ler: lê orçamentos, OS por três caminhos e extras num banco falso', async () => {
  const sb = sbFalso({
    orc_orcamentos: [{ id: 'o1', lead_id: 'l1', status: 'aprovado', total: 100 }],
    agendamentos: [{ id: 'a1', lead_id: 'l2' }],
    patio_os: [{ id: 's1', orcamento_id: 'o1', etapa: 'recebido' }, { id: 's2', agendamento_id: 'a1', etapa: 'teste' }, { id: 's3', lead_id: 'l3', etapa: 'pronto' }],
    patio_extras: [{ os_id: 's1', valor: 50, status: 'aprovado' }],
  });
  const r = await Ciclo.ler(['l1', 'l2', 'l3'], { sb });
  assert.equal(r.ok, true);
  assert.equal(r.porLead.get('l1').os[0].id, 's1'); assert.equal(r.porLead.get('l1').extras.aprovado, 50);
  assert.equal(r.porLead.get('l2').os[0].id, 's2'); assert.equal(r.porLead.get('l3').os[0].id, 's3');
});

test('resultados.cicloDe: devolve o ciclo, ou "indisponível" com frase quando a leitura falha', async () => {
  const { leads, porLead, resultado } = cenario();
  const ok = await R.cicloDe({ leads }, resultado, { ler: async () => ({ ok: true, porLead }), agora: AGORA });
  assert.equal(ok.indisponivel, false); assert.equal(ok.total.entregues, 2);
  const ruim = await R.cicloDe({ leads }, resultado, { ler: async () => ({ ok: false, porLead: new Map() }) });
  assert.equal(ruim.indisponivel, true); assert.match(ruim.motivo, /Orçador e o Pátio/);
});

test('semanal.montar: leva a frase da oficina; sem ciclo ou indisponível, não quebra', () => {
  const { leads, porLead, resultado } = cenario();
  const ciclo = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  const base = { de: '2026-10-12', ate: '2026-10-18', painel: { total: { gasto: 1000 }, comparacao: {} }, crm: { total: { leads: 5, agendamentos: 3, fechados: 2 }, ciclo } };
  assert.match(S.montar(base).corpo, /Oficina: 4 orçamento/);
  assert.doesNotMatch(S.montar({ ...base, crm: { ...base.crm, ciclo: { indisponivel: true } } }).corpo, /Oficina/);
  assert.doesNotMatch(S.montar({ ...base, crm: { total: base.crm.total } }).corpo, /Oficina/);
});

test('relatório diário: bloco "Da campanha à oficina" só aparece com ciclo', () => {
  const { leads, porLead, resultado } = cenario();
  const ciclo = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  const zero = { gasto: 0, conversoes: 0, cpa: null, roas: null, ctr: null, cpm: null };
  const d = { referencia: '2026-10-20', cfg: {}, demo: false, dia: { total: zero, comparacao: { gasto: {}, conversoes: {} }, por_plataforma: [] },
    semana: { total: zero, crm: {} }, campanhas: [], mes: {}, alertas_recentes: [], ciclo };
  assert.match(Rel.montarTexto(d, null), /Da campanha à oficina/);
  assert.doesNotMatch(Rel.montarTexto({ ...d, ciclo: null }, null), /Da campanha à oficina/);
});

/* ---------------- ecossistema ---------------- */

test('ecossistema: CRM, Atendimento, Comunicar e Agenda usam os caminhos da Central', () => {
  assert.equal(Eco.url('crm'), 'https://indycar-agendamentos.onrender.com/crm');
  assert.equal(Eco.linkLead('x'), 'https://indycar-agendamentos.onrender.com/crm/?lead=x');
  assert.equal(Eco.linkConversaTel('12974032299'), 'https://indycar-agendamentos.onrender.com/atendimento/?tel=5512974032299');
  assert.equal(Eco.linkComunicarTel('12974032299'), 'https://indycar-agendamentos.onrender.com/comunicar/?tel=5512974032299');
  assert.equal(Eco.linkAgendamento('a1'), 'https://indycar-agendamentos.onrender.com/agenda/?agendamento=a1');
});

test('ecossistema: origens (CORS) são só https://host — sem caminho — e mantêm os endereços antigos', () => {
  const o = Eco.origens();
  assert.ok(o.every(x => /^https:\/\/[^/]+$/.test(x)), 'nenhuma origem com caminho');
  assert.ok(o.includes('https://indycar-agendamentos.onrender.com') && o.includes('https://indycar-crm.onrender.com'));
  assert.equal(new Set(o).size, o.length);
});

test('ecossistema: appDaUrl acha o app pelo endereço mais específico e ignora o que é de fora', () => {
  assert.equal(Eco.appDaUrl('https://indycar-agendamentos.onrender.com/crm/?lead=1'), 'crm');
  assert.equal(Eco.appDaUrl('https://indycar-agendamentos.onrender.com/atendimento/'), 'atendimento');
  assert.equal(Eco.appDaUrl('https://indycar-orcador.netlify.app/#/historico/x'), 'orcador');
  assert.equal(Eco.appDaUrl('https://indycar-patio.netlify.app/?os=1'), 'patio');
  assert.equal(Eco.appDaUrl('https://indycar-agendamentos.onrender.com/'), null, 'a Casa não tem aba própria aqui');
  assert.equal(Eco.appDaUrl('https://indycar-crm.onrender.com.malvado.com/'), null);
  assert.equal(Eco.appDaUrl('https://ads.google.com/'), null);
  assert.equal(Eco.appDaUrl(''), null);
});

test('ecossistema: nome da aba de cada app e links do orçamento e da OS', () => {
  assert.equal(Eco.alvo('crm'), 'indycar-crm'); assert.equal(Eco.alvo('orcador'), 'indycar-orcador');
  assert.equal(Eco.linkOrcamento('abc 1'), 'https://indycar-orcador.netlify.app/#/historico/abc%201');
  assert.equal(Eco.linkOS('u-1'), 'https://indycar-patio.netlify.app/?os=u-1');
  assert.equal(Eco.linkOrcamento(''), null); assert.equal(Eco.linkOS(null), null);
});

test('ecossistema: "Orçar" leva o cliente (id) e o telefone ao Orçador', () => {
  const u = Eco.linkOrcadorTel('(12) 97403-2299', 'João da Silva', 'cli-1');
  assert.match(u, /^https:\/\/indycar-orcador\.netlify\.app\/\?/);
  assert.match(u, /tel=5512974032299/); assert.match(u, /cliente=cli-1/); assert.match(u, /nome=Jo%C3%A3o%20da%20Silva/);
  assert.doesNotMatch(Eco.linkOrcadorTel('12974032299', 'A'), /cliente=/);
});

test('ecossistema: link de sino de um app da Central vira o caminho novo; o antigo continua aceito', () => {
  assert.equal(Eco.linkDeNotificacao('/?conversa=9', 'atendimento', 'ads'), 'https://indycar-agendamentos.onrender.com/atendimento/?conversa=9');
  assert.equal(Eco.linkDeNotificacao('https://indycar-crm.onrender.com/?lead=2', 'crm', 'ads'), 'https://indycar-crm.onrender.com/?lead=2');
});

/* ---------------- leads ---------------- */

const cru = (id, extra = {}) => ({ id, cliente_id: 'c-' + id, nome: 'Cliente ' + id, telefone: '12974032299', origem: 'meta', status: 'novo', utm_source: 'instagram', utm_campaign: 'Revisão', placa: 'abc-1d23', created_at: horas(30), ...extra });

test('leads.montarLinha: placa normalizada, idade, lead novo parado e links do ciclo', () => {
  const resumo = Ciclo.resumoDoLead({ orcamentos: [{ id: 'o1', status: 'aprovado', total: 10 }], os: [{ id: 's1', etapa: 'recebido' }], extras: {} }, AGORA);
  const l = Leads.montarLinha(cru('1'), { ciclo: resumo, agora: AGORA });
  assert.equal(l.placa, 'ABC1D23'); assert.equal(l.idade_horas, 30); assert.equal(l.parado, true);
  assert.equal(l.links.orcamento, 'https://indycar-orcador.netlify.app/#/historico/o1');
  assert.equal(l.links.os, 'https://indycar-patio.netlify.app/?os=s1');
  assert.match(l.links.orcador, /cliente=c-1/);
  const fresco = Leads.montarLinha(cru('2', { created_at: horas(2) }), { agora: AGORA });
  assert.equal(fresco.parado, false);
  assert.equal(Leads.montarLinha(cru('3', { status: 'contato' }), { agora: AGORA }).parado, false);
  assert.equal(Leads.montarLinha(cru('4', { placa: null }), { agora: AGORA }).placa, null);
});

test('leads.filtrar: busca pela placa e filtra pela etapa depois do CRM', () => {
  const c = (o, p) => Ciclo.resumoDoLead({ orcamentos: o, os: p, extras: {} }, AGORA);
  const lista = [
    Leads.montarLinha(cru('1'), { agora: AGORA, ciclo: c([{ id: 'a', status: 'enviado' }], []) }),
    Leads.montarLinha(cru('2', { placa: 'XYZ9K88' }), { agora: AGORA, ciclo: c([{ id: 'b', status: 'aprovado' }], [{ id: 's', etapa: 'em_execucao' }]) }),
    Leads.montarLinha(cru('3', { status: 'agendado' }), { agora: AGORA, ciclo: null }),
    Leads.montarLinha(cru('4'), { agora: AGORA, ciclo: c([{ id: 'd', status: 'aprovado' }], [{ id: 't', etapa: 'entregue' }]) }),
  ];
  assert.deepEqual(Leads.filtrar(lista, { q: 'xyz9k' }).map(l => l.id), ['2']);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'patio' }).map(l => l.id), ['2']);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'orc_esperando' }).map(l => l.id), ['1']);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'orc_aprovado' }).map(l => l.id), ['2', '4']);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'entregue' }).map(l => l.id), ['4']);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'sem_orcamento' }).map(l => l.id), ['3']);
});

test('leads.resumo: conta carros no pátio, orçamentos esperando e leads parados', () => {
  const c = (o, p) => Ciclo.resumoDoLead({ orcamentos: o, os: p, extras: {} }, AGORA);
  const lista = [
    Leads.montarLinha(cru('1'), { agora: AGORA, ciclo: c([{ id: 'a', status: 'enviado', total: 300 }], []) }),
    Leads.montarLinha(cru('2', { status: 'contato' }), { agora: AGORA, ciclo: c([], [{ id: 's', etapa: 'teste' }]) }),
    Leads.montarLinha(cru('3', { status: 'contato' }), { agora: AGORA, ciclo: c([], [{ id: 't', etapa: 'entregue' }]) }),
  ];
  const r = Leads.resumo(lista);
  assert.equal(r.no_patio, 1); assert.equal(r.orc_esperando, 1); assert.equal(r.valor_orcado_aberto, 300);
  assert.equal(r.entregues_oficina, 1); assert.equal(r.parados, 1);
});

test('leads.listar: junta orçamento e pátio aos leads; a etapa filtra; falha do Orçador não derruba a lista', async () => {
  const brutos = [cru('1'), cru('2', { status: 'contato' })];
  const sb = { from(t) {
    const q = { select() { return q; }, gte() { return q; }, lt() { return q; }, order() { return q; }, range() { return Promise.resolve({ data: brutos, error: null }); },
      in() { return Promise.resolve({ data: [], error: null }); } };
    return q;
  } };
  const porLead = Ciclo.ligar({ leadIds: ['1', '2'], os: [{ id: 's9', lead_id: '2', etapa: 'em_execucao' }] });
  const base = { de: '2026-10-21', ate: '2026-10-21', sb, nomes: async () => new Map(), agora: AGORA };
  const r = await Leads.listar({ ...base, ler: async () => ({ ok: true, porLead }) });
  assert.equal(r.ciclo_ok, true); assert.equal(r.leads.find(l => l.id === '2').links.os, 'https://indycar-patio.netlify.app/?os=s9');
  const so = await Leads.listar({ ...base, etapa: 'patio', ler: async () => ({ ok: true, porLead }) });
  assert.deepEqual(so.leads.map(l => l.id), ['2']); assert.equal(so.total_periodo, 2);
  const falha = await Leads.listar({ ...base, ler: async () => ({ ok: false, porLead: new Map(), erro: 'x' }) });
  assert.equal(falha.ciclo_ok, false); assert.match(falha.ciclo_erro, /Orçador e Pátio/); assert.equal(falha.leads.length, 2);
});

test('leads.csv: colunas de placa, orçamento, pátio e os três links', () => {
  const ciclo = Ciclo.resumoDoLead({ orcamentos: [{ id: 'o1', status: 'aprovado', total: 450.5 }], os: [{ id: 's1', etapa: 'pronto' }], extras: {} }, AGORA);
  const csv = Leads.csv([Leads.montarLinha(cru('1'), { ciclo, agora: AGORA })]);
  const [cab, linha] = csv.replace('﻿', '').split('\r\n');
  for (const c of ['Placa', 'Orçamento', 'Pátio', 'Link do orçamento', 'Link da OS']) assert.ok(cab.includes(`"${c}"`), c);
  assert.ok(linha.includes('Aprovado R$ 450,5') && linha.includes('Pronto') && linha.includes('#/historico/o1') && linha.includes('?os=s1'));
});

/* ---------------- oficina agora e aviso ---------------- */

test('ciclo.agora: carros no pátio e orçamentos esperando dos leads de anúncio, com links', async () => {
  const brutos = [{ ...cru('1'), nome: 'Ana' }, { ...cru('2'), nome: 'Beto' }, { ...cru('3', { origem: 'whatsapp', utm_source: null }), nome: 'Zé' }];
  const porLead = Ciclo.ligar({ leadIds: ['1', '2', '3'],
    os: [{ id: 's1', lead_id: '1', etapa: 'pronto', etapa_em: horas(50) }, { id: 's3', lead_id: '3', etapa: 'teste' }],
    orcamentos: [{ id: 'o2', lead_id: '2', status: 'enviado', total: 700, enviado_em: horas(60) }] });
  const r = await Ciclo.agora({ lerLeads: async () => brutos, ler: async () => ({ ok: true, porLead }), agoraMs: AGORA });
  assert.equal(r.no_patio, 1, 'lead de WhatsApp direto não conta'); assert.equal(r.prontos_parados, 1);
  assert.equal(r.orc_esperando, 1); assert.equal(r.valor_esperando, 700);
  assert.equal(r.carros[0].link_os, 'https://indycar-patio.netlify.app/?os=s1');
  assert.equal(r.orcamentos[0].link_orcamento, 'https://indycar-orcador.netlify.app/#/historico/o2');
  const fora = await Ciclo.agora({ lerLeads: async () => brutos, ler: async () => ({ ok: false, porLead: new Map() }), agoraMs: AGORA });
  assert.equal(fora.indisponivel, true);
});

test('ciclo.avisarGestores: avisa uma vez por dia (chave) só quando há orçamento velho ou carro parado', async () => {
  const chamadas = [];
  const equipe = { notificarGestores: async o => { chamadas.push(o); return { destinatarios: 2, enviadas: 2 }; } };
  const com = { indisponivel: false, orc_esperando: 2, prontos_parados: 1, orcamentos: [{ esperando_horas: 60 }, { esperando_horas: 5 }] };
  const r = await Ciclo.avisarGestores({ hojeISO: '2026-10-21', deps: { agora: async () => com, equipe } });
  assert.equal(r.enviado, true); assert.equal(chamadas[0].chave, 'ads-ciclo-2026-10-21');
  assert.match(chamadas[0].corpo, /1 orçamento\(s\).*48 h.*1 carro\(s\) pronto/);
  assert.match(chamadas[0].link, /etapa=orc_esperando/);
  const nada = await Ciclo.avisarGestores({ hojeISO: '2026-10-21', deps: { agora: async () => ({ indisponivel: false, orc_esperando: 1, prontos_parados: 0, orcamentos: [{ esperando_horas: 3 }] }), equipe } });
  assert.equal(nada.enviado, false); assert.equal(chamadas.length, 1);
  const fora = await Ciclo.avisarGestores({ hojeISO: '2026-10-21', deps: { agora: async () => ({ indisponivel: true, motivo: 'x' }), equipe } });
  assert.equal(fora.enviado, false);
});

test('leads: filtro "oficina" ignora OS cancelada', () => {
  const c = (os) => Ciclo.resumoDoLead({ orcamentos: [], os, extras: {} }, AGORA);
  const l1 = Leads.montarLinha(cru('1'), { agora: AGORA, ciclo: c([{ id: 's', etapa: 'cancelado' }]) });
  const l2 = Leads.montarLinha(cru('2'), { agora: AGORA, ciclo: c([{ id: 't', etapa: 'entregue' }]) });
  assert.deepEqual(Leads.filtrar([l1, l2], { etapa: 'oficina' }).map(l => l.id), ['2']);
});

test('ciclo: mediana de dias do lead até a OS e ticket do orçamento aprovado (campanha e total)', () => {
  const dia = n => new Date(AGORA - n * 86400000).toISOString();
  const leads = [lead('a', { created_at: dia(10) }), lead('b', { created_at: dia(10) }), lead('c', { created_at: dia(10) })];
  const porLead = Ciclo.ligar({ leadIds: ['a', 'b', 'c'],
    orcamentos: [{ id: '1', lead_id: 'a', status: 'aprovado', total: 400 }, { id: '2', lead_id: 'b', status: 'aprovado', total: 600 }],
    os: [{ id: 's1', lead_id: 'a', etapa: 'recebido', created_at: dia(8) }, { id: 's2', lead_id: 'b', etapa: 'recebido', created_at: dia(4) }, { id: 's3', lead_id: 'c', etapa: 'recebido', created_at: dia(9) }] });
  const c = Ciclo.consolidarCiclo({ leads, porLead, agora: AGORA });
  assert.equal(c.total.dias_ate_oficina, 2); // 1, 2 e 6 dias -> mediana 2
  assert.equal(c.total.ticket_orcamento, 500);
  assert.equal(c.campanhas[0].dias_ate_oficina, 2);
  assert.ok(!JSON.stringify(c).includes('_dias'), 'a lista bruta não vai para o JSON');
  assert.ok(Ciclo.csv(c).includes('"Dias do lead até a oficina (mediana)"'));
});

test('leads.ordenar "parados": lead novo mais antigo primeiro, depois os demais do mais recente ao mais antigo', () => {
  const m = (id, status, h) => Leads.montarLinha(cru(id, { status, created_at: horas(h) }), { agora: AGORA });
  const lista = [m('a', 'contato', 1), m('b', 'novo', 5), m('c', 'novo', 40), m('d', 'agendado', 9)];
  assert.deepEqual(Leads.ordenar(lista, 'parados').map(l => l.id), ['c', 'b', 'a', 'd']);
  assert.ok(Leads.ORDENS.includes('parados'));
  assert.ok(Leads.csv([m('a', 'novo', 30)]).includes('"Idade (h)"'));
});

test('"Orçar" leva também o id do lead (o Orçador pode gravar orc_orcamentos.lead_id e o ciclo fecha sozinho)', () => {
  assert.match(Eco.linkOrcadorTel('12974032299', 'A', 'c1', 'lead-9'), /lead=lead-9/);
  assert.doesNotMatch(Eco.linkOrcadorTel('12974032299', 'A', 'c1'), /lead=/);
  assert.match(Leads.montarLinha(cru('7'), { agora: AGORA }).links.orcador, /lead=7/);
});

test('CSV do ciclo e dos leads protegem nome de campanha que começa com fórmula', () => {
  const c = Ciclo.consolidarCiclo({ leads: [lead('x', { utm_campaign: '=HYPERLINK("http://x")' })], porLead: new Map(), agora: AGORA });
  const csv = Ciclo.csv(c);
  assert.ok(csv.includes(`"'=HYPERLINK`) && !csv.includes(';"=HYPERLINK'));
});

test('ler: orçamento com rascunho NULL no banco é lido (neq descartaria o NULL); rascunho true fica de fora', async () => {
  const sb = sbFalso({ orc_orcamentos: [{ id: 'a', lead_id: 'l1', status: 'enviado', rascunho: null }, { id: 'b', lead_id: 'l1', status: 'aberto', rascunho: false }, { id: 'c', lead_id: 'l1', status: 'aberto', rascunho: true }] });
  const r = await Ciclo.ler(['l1'], { sb });
  assert.deepEqual(r.porLead.get('l1').orcamentos.map(o => o.id).sort(), ['a', 'b']);
});

test('ler: Orçador/Pátio lentos não travam — passou do limite, volta ok:false com frase', async () => {
  const lento = { from() { const q = { select() { return q; }, or() { return q; }, in() { return q; }, then() { /* nunca resolve */ } }; return q; } };
  const r = await Ciclo.ler(['l1'], { sb: lento, limiteMs: 30 });
  assert.equal(r.ok, false); assert.match(r.erro, /demoraram/);
});

test('compararCiclo: variação só quando o período anterior tem número maior que zero', () => {
  const c = Ciclo.compararCiclo({ orcados: 6, entregues: 3, custo_carro_na_oficina: 200, na_oficina: 0, receita_entregues: 0 }, { orcados: 4, entregues: 0, custo_carro_na_oficina: 400, na_oficina: 2, receita_entregues: 0 });
  assert.equal(c.orcados.variacao, 50); assert.equal(c.entregues.variacao, null); assert.equal(c.custo_carro_na_oficina.variacao, -50); assert.equal(c.na_oficina.variacao, -100);
  assert.equal(c.receita_entregues.variacao, null);
});

test('consolidarCiclo: totais por canal (Meta × Google) e custo por carro de cada um', () => {
  const leads = [lead('m1'), lead('g1', { origem: 'google', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Busca' })];
  const porLead = Ciclo.ligar({ leadIds: ['m1', 'g1'], os: [{ id: 's1', lead_id: 'm1', etapa: 'recebido' }, { id: 's2', lead_id: 'g1', etapa: 'recebido' }] });
  const resultado = A.consolidar({ leads, metricas: [{ plataforma: 'meta', campanha_nome: 'Revisão', gasto: 300 }, { plataforma: 'google', campanha_nome: 'Busca', gasto: 100 }] });
  const c = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  assert.equal(c.canais.find(x => x.canal === 'meta').custo_carro_na_oficina, 300);
  assert.equal(c.canais.find(x => x.canal === 'google').custo_carro_na_oficina, 100);
  assert.equal(c.total.custo_carro_na_oficina, 200);
});

test('ranking de campanhas ganha carros e custo por carro da oficina (casando pelo nome da campanha)', () => {
  const { leads, porLead, resultado } = cenario();
  const ciclo = Ciclo.consolidarCiclo({ leads, porLead, resultado, agora: AGORA });
  const r = A.juntarRankingComCRM([{ plataforma: 'meta', nome: 'revisao', gasto: 800 }, { plataforma: 'meta', nome: 'Sem retorno', gasto: 200 }], { ...resultado, ciclo });
  assert.equal(r[0].oficina.na_oficina, 3); assert.equal(r[0].oficina.custo_carro, 800 / 3);
  assert.equal(r[1].oficina, null);
});

test('sem orçamento: lead agendado ou em serviço sem orçamento entra no KPI e no filtro', () => {
  const o = Ciclo.resumoDoLead({ orcamentos: [{ id: 'a', status: 'enviado' }], os: [], extras: {} }, AGORA);
  const lista = [Leads.montarLinha(cru('1', { status: 'agendado' }), { agora: AGORA }), Leads.montarLinha(cru('2', { status: 'agendado' }), { agora: AGORA, ciclo: o }), Leads.montarLinha(cru('3', { status: 'novo' }), { agora: AGORA })];
  assert.equal(Leads.resumo(lista).sem_orcamento, 1);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'sem_orcamento' }).map(l => l.id), ['1']);
});

test('ecossistema: link do cliente acompanhar o carro e token vindo da OS', () => {
  assert.equal(Eco.linkAcompanhar('tok 1'), 'https://indycar-patio.netlify.app/acompanhar/?t=tok%201');
  assert.equal(Eco.linkAcompanhar(''), null);
  const r = Ciclo.resumoDoLead({ orcamentos: [], os: [{ id: 's', etapa: 'recebido', token_publico: 'abc' }], extras: {} }, AGORA);
  assert.equal(r.os.link_cliente, 'https://indycar-patio.netlify.app/acompanhar/?t=abc');
});

test('ciclo.agora: conta entregues e receita paga dos últimos 30 dias', async () => {
  const brutos = [{ ...cru('1'), valor_pago: 800 }, { ...cru('2'), valor_pago: 200 }];
  const porLead = Ciclo.ligar({ leadIds: ['1', '2'], os: [{ id: 's1', lead_id: '1', etapa: 'entregue' }, { id: 's2', lead_id: '2', etapa: 'recebido' }] });
  const r = await Ciclo.agora({ lerLeads: async () => brutos, ler: async () => ({ ok: true, porLead }), agoraMs: AGORA });
  assert.equal(r.entregues, 1); assert.equal(r.receita_entregues, 800); assert.equal(r.no_patio, 1);
});
