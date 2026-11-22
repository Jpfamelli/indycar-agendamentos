'use strict';
/* Rodada 7 (25/10/2026): ROI do anúncio ao carro com o lead_id do Orçador, fila "o que fazer agora", alertas que viram ação,
   do teste ao real, fechamento do mês, leitura parcial. Sem banco real e sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');

const Ciclo = require('../ciclo');
const Acoes = require('../acoes');
const Radar = require('../radar');
const Preparo = require('../preparo');
const Fech = require('../fechamento');
const Eco = require('../public/ecossistema.js');
const Leads = require('../leads');
const S = require('../semanal');
const Rel = require('../relatorio');
const Vocab = require('../vocabulario');
const Agenda = require('../agenda');
const A = require('../atribuicao');
const R = require('../resultados');

const AGORA = Date.parse('2026-10-25T15:00:00Z');
const horas = n => new Date(AGORA - n * 3600000).toISOString();
const lead = (id, extra = {}) => ({ id, cliente_id: 'c-' + id, nome: 'Cliente ' + id, telefone: '12991234567', origem: 'meta', status: 'orcamento', utm_source: 'instagram', utm_campaign: 'Revisão', valor_pago: null, created_at: horas(100), responsavel_id: 'r1', ...extra });
const orc = (id, leadId, extra = {}) => ({ id, lead_id: leadId, status: 'enviado', total: 800, enviado_em: horas(60), created_at: horas(61), ...extra });
const cons = (leads, orcamentos = [], os = [], extras = [], agendamentos = [], resultado = null) =>
  Ciclo.consolidarCiclo({ leads, porLead: Ciclo.ligar({ leadIds: leads.map(l => l.id), orcamentos, os, extras, agendamentos }), resultado, agora: AGORA });
const alerta = (c, tipo) => c.alertas.find(a => a.tipo === tipo);

/* ---------- ligação: lead_id do Orçador e caminho pelo agendamento ---------- */

test('ligar: orçamento sem lead_id entra pelo agendamento do lead e não duplica', () => {
  const m = Ciclo.ligar({ leadIds: ['l1'], agendamentos: [{ id: 'a1', lead_id: 'l1' }],
    orcamentos: [{ id: 'o1', agendamento_id: 'a1', status: 'enviado' }, { id: 'o1', agendamento_id: 'a1', status: 'enviado' }, { id: 'o2', lead_id: 'l1', agendamento_id: 'a1', status: 'aprovado' }] });
  assert.equal(m.get('l1').orcamentos.length, 2, 'o1 uma vez, o2 uma vez');
  assert.equal(m.get('l1').orcamentos.find(o => o.id === 'o1').ligado_por, 'agendamento');
  assert.equal(m.get('l1').orcamentos.find(o => o.id === 'o2').ligado_por, undefined);
});

test('ligar: OS de um orçamento que só tem agendamento acha o lead', () => {
  const m = Ciclo.ligar({ leadIds: ['l1'], agendamentos: [{ id: 'a1', lead_id: 'l1' }],
    orcamentos: [{ id: 'o1', agendamento_id: 'a1', status: 'aprovado' }], os: [{ id: 's1', orcamento_id: 'o1', etapa: 'recebido' }] });
  assert.equal(m.get('l1').os.length, 1);
});

test('unirOrcamentos: o mesmo id nunca entra duas vezes, o primeiro caminho vence', () => {
  const r = Ciclo.unirOrcamentos([{ id: 'a', x: 1 }, { id: 'b' }], [{ id: 'a', x: 2 }, { id: 'c' }, null, {}]);
  assert.deepEqual(r.map(o => o.id), ['a', 'b', 'c']);
  assert.equal(r[0].x, 1);
});

test('ler: banco falso com orçamento só com agendamento_id é achado pelos dois caminhos', async () => {
  const sb = { from(t) {
    let linhas = ({ orc_orcamentos: [{ id: 'o1', lead_id: 'l1', status: 'enviado', total: 10 }, { id: 'o2', agendamento_id: 'a2', status: 'aprovado', total: 20 }],
      agendamentos: [{ id: 'a2', lead_id: 'l2' }], patio_os: [], patio_extras: [] })[t] || [];
    const q = { select() { return q; }, or() { return q; }, in(c, ids) { linhas = linhas.filter(l => ids.includes(l[c])); return q; }, then(ok) { return Promise.resolve({ data: linhas, error: null }).then(ok); } };
    return q;
  } };
  const r = await Ciclo.ler(['l1', 'l2'], { sb });
  assert.equal(r.ok, true);
  assert.equal(r.porLead.get('l1').orcamentos[0].id, 'o1');
  assert.equal(r.porLead.get('l2').orcamentos[0].id, 'o2');
});

test('valorAprovado: usa total_aprovado (com desconto) e cai no total quando não há', () => {
  assert.equal(Ciclo.valorAprovado({ total: 1000, total_aprovado: 950 }), 950);
  assert.equal(Ciclo.valorAprovado({ total: 1000, total_aprovado: null }), 1000);
  assert.equal(Ciclo.valorAprovado({ total: '1000.50', total_aprovado: 0 }), 1000.5);
  const c = cons([lead('l1')], [orc('o1', 'l1', { status: 'aprovado', total: 1000, total_aprovado: 950, decidido_em: horas(5) })]);
  assert.equal(c.total.valor_aprovado, 950);
  assert.equal(c.total.valor_orcado, 1000);
});

/* ---------- novos avisos do ciclo ---------- */

test('orc_quente: abriu há 5 h e não respondeu entra; visto há 1 h ainda não; visto há 60 h vira parado, não quente', () => {
  const c = cons([lead('l1'), lead('l2'), lead('l3')], [
    orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5) }),
    orc('o2', 'l2', { enviado_em: horas(20), visualizado_em: horas(1) }),
    orc('o3', 'l3', { enviado_em: horas(100), visualizado_em: horas(60) })]);
  assert.equal(alerta(c, 'orc_quente').quantidade, 1);
  assert.equal(alerta(c, 'orc_quente').itens[0].orcamento_id, 'o1');
  assert.ok(alerta(c, 'orcamento_parado'), 'o de 100 h é parado');
});

test('orc_nao_aberto: enviado há mais de 24 h sem visualização', () => {
  const c = cons([lead('l1'), lead('l2')], [orc('o1', 'l1', { enviado_em: horas(30) }), orc('o2', 'l2', { enviado_em: horas(10) })]);
  assert.equal(alerta(c, 'orc_nao_aberto').quantidade, 1);
});

test('follow_vencido: retorno combinado no passado; no futuro não', () => {
  const c = cons([lead('l1'), lead('l2')], [orc('o1', 'l1', { follow_up_em: horas(3) }), orc('o2', 'l2', { follow_up_em: new Date(AGORA + 3600000).toISOString() })]);
  assert.equal(alerta(c, 'follow_vencido').quantidade, 1);
  assert.equal(alerta(c, 'follow_vencido').itens[0].horas, 3);
});

test('desconto_pedido: pedido e ainda não aprovado pelo gestor', () => {
  const c = cons([lead('l1'), lead('l2')], [orc('o1', 'l1', { desconto_pedido_em: horas(4) }), orc('o2', 'l2', { desconto_pedido_em: horas(4), desconto_aprovado_em: horas(1) })]);
  assert.equal(alerta(c, 'desconto_pedido').quantidade, 1);
});

test('horario_pedido: aprovou e pediu horário sem OS; com OS não avisa; horário vazio não conta', () => {
  const ap = (id, lid, h) => orc(id, lid, { status: 'aprovado', decidido_em: horas(2), horario_pedido: h });
  const c = cons([lead('l1'), lead('l2'), lead('l3')], [ap('o1', 'l1', { data: '2026-10-28', hora: '09:00' }), ap('o2', 'l2', { data: '2026-10-28' }), ap('o3', 'l3', {})],
    [{ id: 's2', lead_id: 'l2', etapa: 'recebido', created_at: horas(1) }]);
  assert.equal(alerta(c, 'horario_pedido').quantidade, 1);
  assert.equal(alerta(c, 'horario_pedido').itens[0].lead_id, 'l1');
});

test('validade_vencendo: vence em até 48 h entra; vencido ou distante não', () => {
  const dia = n => new Date(AGORA + n * 86400000).toISOString().slice(0, 10);
  const c = cons([lead('l1'), lead('l2'), lead('l3')], [orc('o1', 'l1', { validade: dia(1) }), orc('o2', 'l2', { validade: dia(-3) }), orc('o3', 'l3', { validade: dia(10) })]);
  assert.equal(alerta(c, 'validade_vencendo').quantidade, 1);
});

test('lead_parado e sem_orcamento: lead pago novo há mais de 24 h; agendado sem orçamento', () => {
  const c = cons([lead('l1', { status: 'novo', created_at: horas(30) }), lead('l2', { status: 'novo', created_at: horas(5) }), lead('l3', { status: 'agendado' }), lead('l4', { status: 'agendado' })],
    [orc('o4', 'l4')]);
  assert.equal(alerta(c, 'lead_parado').quantidade, 1);
  assert.equal(alerta(c, 'sem_orcamento').quantidade, 1);
  assert.equal(alerta(c, 'sem_orcamento').itens[0].lead_id, 'l3');
});

test('lead que não é de anúncio nunca entra nos avisos', () => {
  const c = cons([lead('l1', { origem: 'site', utm_source: 'site', utm_campaign: null, status: 'novo', created_at: horas(80) })]);
  assert.equal(c.alertas.length, 0);
});

test('os avisos antigos agora levam itens com nome e links (CRM, conversa, orçamento, OS)', () => {
  const c = cons([lead('l1', { carro_modelo: 'Corolla', placa: 'abc-1d23' })], [orc('o1', 'l1')]);
  const it = alerta(c, 'orcamento_parado').itens[0];
  assert.equal(it.nome, 'Cliente l1'); assert.equal(it.placa, 'ABC1D23'); assert.equal(it.canal, 'meta');
  assert.equal(it.links.crm, 'https://indycar-agendamentos.onrender.com/crm/?lead=l1');
  assert.equal(it.links.orcamento, 'https://indycar-orcador.netlify.app/#/historico/o1');
  assert.match(it.links.conversa, /atendimento\/\?tel=5512991234567$/);
  assert.match(it.links.orcar, /lead=l1/);
  assert.equal(it.sem_responsavel, false);
});

test('pronto_parado: o item leva o link da OS; entregue sem valor leva o valor sugerido com total_aprovado', () => {
  const c = cons([lead('l1', { status: 'concluido' }), lead('l2')],
    [orc('o1', 'l1', { status: 'aprovado', total: 1000, total_aprovado: 900 })],
    [{ id: 's1', lead_id: 'l1', etapa: 'entregue', created_at: horas(50) }, { id: 's2', lead_id: 'l2', etapa: 'pronto', etapa_em: horas(40), created_at: horas(50) }],
    [{ os_id: 's1', valor: 100, status: 'aprovado' }]);
  assert.equal(alerta(c, 'pronto_parado').itens[0].links.os, 'https://indycar-patio.netlify.app/?os=s2');
  // R13C: entregue com orçamento aprovado já tem valor pela regra única (900 + 100 do Pátio): nada a sugerir
  assert.equal(alerta(c, 'valor_sugerido'), undefined);
});

/* ---------- métricas novas por campanha ---------- */

test('comportamento depois do orçamento: visualização, decisão, envio, valor em aberto, recusado, extras recusados e ROAS previsto', () => {
  const resultado = { campanhas: [{ canal: 'meta', campanha: 'Revisão', gasto: 500, sem_utm: false }] };
  const c = cons([lead('l1', { created_at: horas(100) }), lead('l2'), lead('l3'), lead('l4')], [
    orc('o1', 'l1', { enviado_em: horas(90), visualizado_em: horas(80), status: 'aprovado', total: 600, decidido_em: horas(70) }),
    orc('o2', 'l2', { enviado_em: horas(30), status: 'enviado', total: 300 }),
    orc('o3', 'l3', { enviado_em: horas(50), visualizado_em: horas(48), status: 'recusado', total: 400, decidido_em: horas(30), motivo_cod: 'preco' }),
    orc('o4', 'l4', { status: 'aberto', enviado_em: null, total: 100 })],
    [{ id: 's1', lead_id: 'l3', etapa: 'recebido', created_at: horas(20) }], [{ os_id: 's1', valor: 70, status: 'recusado' }], [], resultado);
  const t = c.total;
  assert.equal(t.orcamentos_enviados, 3); assert.equal(t.visualizados, 2); assert.equal(t.nao_abertos, 1);
  assert.equal(Math.round(t.taxa_visualizacao), 67);
  assert.equal(t.valor_em_aberto, 300); assert.equal(t.valor_recusado, 400); assert.equal(t.extras_recusados, 70);
  assert.equal(t.horas_decisao, 20);           // mediana de 20 h (o1) e 20 h (o3)
  assert.equal(t.horas_ate_envio, 50);          // leads nascem 100 h atrás: 10 h, 70 h e 50 h até o envio -> mediana 50
  assert.equal(Math.round(t.roas_previsto * 100) / 100, 1.2);
});

test('mediana e somar: as listas de horas somam entre campanhas sem vazar para o JSON', () => {
  const c = cons([lead('l1', { utm_campaign: 'A' }), lead('l2', { utm_campaign: 'B' })], [
    orc('o1', 'l1', { enviado_em: horas(95), decidido_em: horas(90), status: 'aprovado' }), orc('o2', 'l2', { enviado_em: horas(95), decidido_em: horas(80), status: 'recusado' })]);
  assert.equal(c.total.horas_decisao, 10);       // 5 h e 15 h -> mediana 10
  assert.ok(!('_arrays' in JSON.parse(JSON.stringify(c.total))));
});

/* ---------- fila "o que fazer agora" ---------- */

test('fila: ordenada por peso, valor e tempo; um lead aparece só pelo motivo mais forte', () => {
  const c = cons([lead('l1', { status: 'novo', created_at: horas(40) }), lead('l2'), lead('l3')], [
    orc('o1', 'l1', { desconto_pedido_em: horas(2), total: 500 }),                // l1: desconto (90) e lead parado (55) -> fica desconto
    orc('o2', 'l2', { enviado_em: horas(20), visualizado_em: horas(5), total: 1000 }), // quente
    orc('o3', 'l3', { enviado_em: horas(30), total: 100 })]);                      // nunca abriu
  const f = Acoes.fila(c);
  assert.deepEqual(f.itens.map(x => x.lead_id), ['l1', 'l2', 'l3']);
  assert.equal(f.itens.filter(x => x.lead_id === 'l1').length, 1);
  assert.equal(f.itens[0].tipo, 'desconto_pedido');
  assert.ok(f.itens[0].pontos > f.itens[2].pontos);
  assert.equal(f.total, 3);
  assert.equal(f.valor_em_jogo, 1600);
  assert.equal(f.por_tipo.desconto_pedido, 1);
});

test('fila: botões em aba nomeada de cada app e só os que têm link', () => {
  const c = cons([lead('l1')], [orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5) })]);
  const x = Acoes.fila(c).itens[0];
  assert.deepEqual(x.botoes.map(b => b.alvo), ['indycar-atendimento', 'indycar-orcador']);
  assert.ok(x.botoes.every(b => b.link.startsWith('https://') && Eco.appDaUrl(b.link) === b.app));
  const semTel = Acoes.fila(cons([lead('l2', { telefone: null })], [orc('o2', 'l2', { enviado_em: horas(20), visualizado_em: horas(5) })])).itens[0];
  assert.deepEqual(semTel.botoes.map(b => b.chave), ['orcamento'], 'sem telefone não há botão da conversa');
});

test('fila: recado pronto usa o primeiro nome, o valor do orçamento e o vocabulário da casa', () => {
  const x = Acoes.fila(cons([lead('l1', { nome: 'Marcos Silva', carro_modelo: 'veículo Gol' })], [orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5), total: 640 })])).itens[0];
  assert.match(x.recado, /^Olá, Marcos!/);
  assert.match(x.recado, /R\$\s640,00/);
  assert.deepEqual(Vocab.conferir(x.recado), [], 'sem palavras proibidas');
  assert.equal(Acoes.recadoDo('desconto_pedido', { nome: 'A' }), null, 'desconto é decisão do gestor: sem recado automático');
});

test('fila: motivo em frase com tempo e valor; dias quando passa de 48 h', () => {
  assert.match(Acoes.motivoDo('orc_quente', { horas: 5, valor: 900 }), /^abriu há 5 h e não respondeu · R\$\s900,00$/);
  assert.match(Acoes.motivoDo('orcamento_parado', { horas: 72, valor: 0 }), /3 dias/);
  assert.match(Acoes.motivoDo('sem_orcamento', { status_nome: 'Agendado' }), /Agendado/);
});

test('fila: pontuação soma peso, valor (teto 15) e tempo (teto 10)', () => {
  assert.equal(Acoes.pontuar('desconto_pedido', { valor: 0, horas: 0 }), 90);
  assert.equal(Acoes.pontuar('desconto_pedido', { valor: 1e6, horas: 1e6 }), 115);
  assert.equal(Acoes.pontuar('tipo_que_nao_existe', {}), 20);
});

test('fila: limite, alerta antigo sem itens e ciclo vazio', () => {
  assert.equal(Acoes.fila(null).total, 0);
  assert.equal(Acoes.fila({ alertas: [{ tipo: 'orc_quente', quantidade: 2, valor: 100, texto: 'dois clientes' }] }).itens[0].nome, null);
  const muitos = cons(Array.from({ length: 12 }, (_, i) => lead('m' + i)), Array.from({ length: 12 }, (_, i) => orc('om' + i, 'm' + i, { enviado_em: horas(30) })));
  assert.equal(Acoes.fila(muitos, { limite: 5 }).itens.length, 5);
  assert.ok(Acoes.fila(muitos).total >= 8, 'o total conta tudo, mesmo cortando a lista');
});

test('fila: frase-resumo cita os 3 tipos mais pesados', () => {
  const c = cons([lead('l1'), lead('l2')], [orc('o1', 'l1', { desconto_pedido_em: horas(1) }), orc('o2', 'l2', { enviado_em: horas(30) })]);
  const f = Acoes.frase(Acoes.fila(c));
  assert.match(f, /^2 cliente\(s\) esperando você/);
  assert.match(f, /cliente pediu desconto/);
  assert.equal(Acoes.frase({ total: 0 }), null);
});

test('Ciclo.acoes: lê leads e ciclo injetados, só leads de anúncio; fonte fora vira "indisponível"', async () => {
  const leads = [lead('l1'), lead('l2', { origem: 'site', utm_source: 'site', utm_campaign: null })];
  const ok = await Ciclo.acoes({ lerLeads: async () => leads, ler: async ids => { assert.deepEqual(ids, ['l1']); return { ok: true, porLead: Ciclo.ligar({ leadIds: ids, orcamentos: [orc('o1', 'l1', { enviado_em: horas(30) })] }) }; }, agoraMs: AGORA });
  assert.equal(ok.indisponivel, false); assert.equal(ok.total, 1); assert.ok(Array.isArray(ok.alertas));
  const fora = await Ciclo.acoes({ lerLeads: async () => leads, ler: async () => ({ ok: false }), agoraMs: AGORA });
  assert.equal(fora.indisponivel, true); assert.equal(fora.total, 0);
});

test('Ciclo.acoes: pátio fora mas orçamentos lidos devolve a fila marcada como parcial', async () => {
  const r = await Ciclo.acoes({ lerLeads: async () => [lead('l1')], ler: async ids => ({ ok: true, parcial: 'patio', porLead: Ciclo.ligar({ leadIds: ids, orcamentos: [orc('o1', 'l1', { enviado_em: horas(30) })] }) }), agoraMs: AGORA });
  assert.equal(r.parcial, 'patio'); assert.equal(r.total, 1);
});

test('ler: só o Pátio falha -> orçamentos continuam (ok com parcial); orçamento falhando derruba tudo', async () => {
  const mk = falha => ({ from(t) {
    let linhas = ({ orc_orcamentos: [{ id: 'o1', lead_id: 'l1', status: 'enviado', total: 5 }], agendamentos: [] })[t] || [];
    const q = { select() { return q; }, or() { return q; }, in(c, ids) { linhas = linhas.filter(l => ids.includes(l[c])); return q; },
      then(ok) { return Promise.resolve(t === falha ? { data: null, error: { message: 'caiu' } } : { data: linhas, error: null }).then(ok); } };
    return q;
  } });
  const parcial = await Ciclo.ler(['l1'], { sb: mk('patio_os') });
  assert.equal(parcial.ok, true); assert.equal(parcial.parcial, 'patio'); assert.equal(parcial.porLead.get('l1').orcamentos.length, 1);
  const tudo = await Ciclo.ler(['l1'], { sb: mk('orc_orcamentos'), esperaRetryMs: 1 });
  assert.equal(tudo.ok, false);
});

test('ler: erro de rede tenta de novo uma vez e se recupera; erro de regra não repete', async () => {
  let chamadas = 0;
  const sb = { from(t) {
    const q = { select() { return q; }, or() { return q; }, in() { return q; },
      then(ok) { if (t === 'orc_orcamentos') { chamadas++; if (chamadas === 1) return Promise.resolve({ data: null, error: { message: 'fetch failed' } }).then(ok); } return Promise.resolve({ data: [], error: null }).then(ok); } };
    return q;
  } };
  const r = await Ciclo.ler(['l1'], { sb, esperaRetryMs: 1 });
  assert.equal(r.ok, true); assert.equal(r.tentativas, 2);
  let n = 0;
  const sb2 = { from() { const q = { select() { return q; }, or() { return q; }, in() { return q; }, then(ok) { n++; return Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(ok); } }; return q; } };
  const r2 = await Ciclo.ler(['l1'], { sb: sb2, esperaRetryMs: 1 });
  assert.equal(r2.ok, false); assert.ok(n <= 3, 'permissão negada não é repetida');
});

/* ---------- radar: alertas do ciclo ---------- */

test('alertasDoCiclo: um alerta por tipo, nível conta, plataforma do canal dominante, 3 nomes na mensagem e cooldown', () => {
  const c = cons([lead('l1', { nome: 'Ana Souza' }), lead('l2', { nome: 'Beto Lima', origem: 'google', utm_source: 'google' }), lead('l3', { nome: 'Caio Nunes', origem: 'google', utm_source: 'google' })],
    [orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5) }), orc('o2', 'l2', { enviado_em: horas(20), visualizado_em: horas(5) }), orc('o3', 'l3', { enviado_em: horas(20), visualizado_em: horas(5) })]);
  const disparos = new Map();
  const r = Radar.alertasDoCiclo({ indisponivel: false, alertas: c.alertas }, { disparos, agora: AGORA });
  const q = r.novos.find(a => a.entidade_ext === 'ciclo:orc_quente');
  assert.equal(q.nivel, 'conta'); assert.equal(q.plataforma, 'google'); assert.equal(q.valor_medido, 3); assert.equal(q.severidade, 'alerta');
  assert.match(q.mensagem, /Quem: .*Ana \(R\$.*800,00\)/);
  const de_novo = Radar.alertasDoCiclo({ indisponivel: false, alertas: c.alertas }, { disparos, agora: AGORA + 3600000 });
  assert.equal(de_novo.novos.length, 0); assert.ok(de_novo.suprimidos.length >= 1);
  const depois = Radar.alertasDoCiclo({ indisponivel: false, alertas: c.alertas }, { disparos, agora: AGORA + 25 * 3600000 });
  assert.ok(depois.novos.length >= 1, 'passadas 24 h avisa de novo');
});

test('alertasDoCiclo: fonte indisponível, tipo desconhecido e quantidade zero não geram nada', () => {
  assert.equal(Radar.alertasDoCiclo({ indisponivel: true, alertas: [{ tipo: 'orc_quente', quantidade: 3 }] }).novos.length, 0);
  assert.equal(Radar.alertasDoCiclo(null).novos.length, 0);
  assert.equal(Radar.alertasDoCiclo({ alertas: [{ tipo: 'inventado', quantidade: 2 }, { tipo: 'orc_quente', quantidade: 0 }] }).novos.length, 0);
});

test('radar.rodar: alertas do ciclo entram na rodada; a leitura do ciclo falhando não derruba o radar', async () => {
  const db = require('../db');
  const salvos = [];
  const orig = { lerConfig: db.lerConfig, listarRegras: db.listarRegras, ultimosDisparos: db.ultimosDisparos, gravarAlertas: db.gravarAlertas };
  db.lerConfig = async () => ({ alertas_ativos: false, whatsapp_destinos: [], cpa_alvo: null });
  db.listarRegras = async () => [];
  db.ultimosDisparos = async () => new Map();
  db.gravarAlertas = async l => { salvos.push(...l); return l.map((a, i) => ({ ...a, id: 'id' + i })); };
  const antes = { cl: Radar.rodar.leitorCiclo, nt: Radar.rodar.notificador };
  Radar.rodar.notificador = { notificarGestores: async () => ({ enviadas: 1 }) };
  try {
    const c = cons([lead('l1')], [orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5) })]);
    Radar.rodar.leitorCiclo = async () => ({ indisponivel: false, alertas: c.alertas });
    const ok = await Radar.rodar({ enviar: false, gravar: true, crm: false });
    assert.equal(ok.disparados, 1); assert.equal(salvos[0].entidade_ext, 'ciclo:orc_quente'); assert.equal(ok.erro_ciclo, null);
    Radar.rodar.leitorCiclo = async () => { throw new Error('Pátio fora'); };
    const ruim = await Radar.rodar({ enviar: false, gravar: false, crm: false });
    assert.equal(ruim.disparados, 0); assert.equal(ruim.erro_ciclo, 'Pátio fora');
    const sem = await Radar.rodar({ enviar: false, gravar: false, crm: false, ciclo: false });
    assert.equal(sem.erro_ciclo, null);
  } finally { Object.assign(db, orig); Radar.rodar.leitorCiclo = antes.cl; Radar.rodar.notificador = antes.nt; }
});

test('acaoDoAlerta: ciclo -> painel; CRM -> Leads da campanha; criativo -> Criativos; campanha -> Campanhas; conta -> painel', () => {
  assert.deepEqual(Acoes.acaoDoAlerta({ entidade_ext: 'ciclo:orc_quente' }), { rotulo: 'Ver quem está esperando', aba: 'painel', ancora: 'cartao-acoes', tipo: 'orc_quente' });
  const crm = Acoes.acaoDoAlerta({ entidade_ext: 'crm:Revisão', entidade_nome: 'Revisão', plataforma: 'meta' });
  assert.equal(crm.aba, 'leads'); assert.equal(crm.q, 'Revisão'); assert.equal(crm.canal, 'meta');
  assert.equal(Acoes.acaoDoAlerta({ nivel: 'anuncio', entidade_nome: 'Vídeo 1' }).aba, 'criativos');
  assert.equal(Acoes.acaoDoAlerta({ nivel: 'campanha', entidade_nome: 'Camp' }).q, 'Camp');
  assert.equal(Acoes.acaoDoAlerta({ nivel: 'conjunto', campanha_nome: 'Mãe', entidade_nome: 'Filho' }).q, 'Mãe');
  assert.equal(Acoes.acaoDoAlerta({ nivel: 'conta' }).aba, 'painel');
  assert.equal(Acoes.acaoDoAlerta(null).aba, 'campanhas');
});

test('acoesDoRadar: só crítico/alerta sem leitura de campanha, crítico primeiro, sem os do ciclo', () => {
  const l = Acoes.acoesDoRadar([
    { id: '1', severidade: 'info', entidade_ext: 'x', criado_em: '2026-10-25' }, { id: '2', severidade: 'alerta', nivel: 'campanha', entidade_nome: 'A', criado_em: '2026-10-24', mensagem: 'm' },
    { id: '3', severidade: 'critico', nivel: 'campanha', entidade_nome: 'B', criado_em: '2026-10-23', mensagem: 'm' }, { id: '4', severidade: 'critico', entidade_ext: 'ciclo:orc_quente', criado_em: '2026-10-25' },
    { id: '5', severidade: 'critico', lido_em: 'x', entidade_nome: 'C' }]);
  assert.deepEqual(l.map(a => a.id), ['3', '2']);
});

/* ---------- aviso do sino, relatório e semanal ---------- */

test('avisarGestores: a fila inteira vira o corpo do aviso, o link leva ao cartão e a chave é do dia', async () => {
  const c = cons([lead('l1')], [orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5) })]);
  const fila = Acoes.fila(c);
  let enviado = null;
  const r = await Ciclo.avisarGestores({ hojeISO: '2026-10-25', deps: {
    agora: async () => ({ indisponivel: false, orcamentos: [], prontos_parados: 0, orc_esperando: 0 }),
    acoes: async () => ({ indisponivel: false, ...fila }),
    equipe: { notificarGestores: async n => { enviado = n; return { enviadas: 1 }; } } } });
  assert.equal(r.enviado, true);
  assert.match(enviado.titulo, /1 cliente\(s\) esperando você/);
  assert.match(enviado.corpo, /abriu o orçamento e não respondeu/);
  assert.equal(enviado.link, '/?aba=painel&ancora=cartao-acoes');
  assert.equal(enviado.chave, 'ads-ciclo-2026-10-25');
});

test('avisarGestores: sem nada e sem fila não avisa; fila fora do ar não derruba os dois avisos antigos', async () => {
  const vazio = await Ciclo.avisarGestores({ hojeISO: '2026-10-25', deps: { agora: async () => ({ indisponivel: false, orcamentos: [], prontos_parados: 0, orc_esperando: 0 }), acoes: async () => ({ indisponivel: false, total: 0, itens: [] }) } });
  assert.equal(vazio.enviado, false);
  let n = null;
  const r = await Ciclo.avisarGestores({ hojeISO: '2026-10-25', deps: { agora: async () => ({ indisponivel: false, orcamentos: [{ esperando_horas: 60 }], orc_esperando: 1, prontos_parados: 2 }),
    acoes: async () => { throw new Error('fora'); }, equipe: { notificarGestores: async x => { n = x; return { enviadas: 1 }; } } } });
  assert.equal(r.enviado, true); assert.match(n.corpo, /1 orçamento\(s\) de anúncio sem resposta/); assert.equal(n.link, '/?aba=leads&etapa=orc_esperando');
});

test('relatório diário: bloco "O que fazer hoje" com os 5 primeiros e a frase; sem fila, sem bloco', () => {
  const c = cons([lead('l1', { nome: 'Ana Souza' })], [orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5), total: 900 })]);
  const acoes = Acoes.fila(c);
  const base = { referencia: '2026-10-24', demo: false, cfg: {}, dia: { total: { gasto: 0 }, comparacao: { gasto: {}, conversoes: {} }, por_plataforma: [] }, semana: { total: {}, crm: {} }, mes: {}, campanhas: [], criativos: [], alertas_recentes: [], ciclo: null, leadsDia: null };
  const com = Rel.montarTexto({ ...base, acoes }, null);
  assert.match(com, /\*O que fazer hoje\*/); assert.match(com, /Ana Souza — abriu há 5 h e não respondeu/);
  assert.doesNotMatch(Rel.montarTexto({ ...base, acoes: null }, null), /O que fazer hoje/);
  assert.deepEqual(Vocab.conferir(com), []);
});

test('semanal.montar: leva a frase de quem está esperando; sem fila não quebra', () => {
  const c = cons([lead('l1')], [orc('o1', 'l1', { enviado_em: horas(30) })]);
  const base = { de: '2026-10-12', ate: '2026-10-18', painel: { total: { gasto: 1000 }, comparacao: {} }, crm: { total: { leads: 5, agendamentos: 3, fechados: 2 } } };
  assert.match(S.montar({ ...base, acoes: Acoes.fila(c) }).corpo, /cliente\(s\) esperando você/);
  assert.doesNotMatch(S.montar(base).corpo, /esperando você/);
});

test('semanal.gerarENotificar: com deps de teste não lê a fila; com deps.acoes lê', async () => {
  const mk = acoes => ({ painel: { resumo: async () => ({ total: { gasto: 10 }, comparacao: {} }), ranking: async () => [] }, resultados: { resumo: async () => ({ total: { leads: 1 } }) },
    db: { listarAlertas: async () => [] }, leads: { listar: async () => ({ resumo_periodo: null }) }, equipe: { notificarGestores: async () => ({ enviadas: 1 }) }, ...(acoes ? { acoes } : {}) });
  const sem = await S.gerarENotificar({ hojeISO: '2026-10-26', deps: mk(null) });
  assert.doesNotMatch(sem.corpo, /esperando você/);
  const c = cons([lead('l1')], [orc('o1', 'l1', { enviado_em: horas(30) })]);
  const com = await S.gerarENotificar({ hojeISO: '2026-10-26', deps: mk(async () => ({ indisponivel: false, ...Acoes.fila(c) })) });
  assert.match(com.corpo, /esperando você/);
});

/* ---------- leads: sinais do orçamento ---------- */

test('resumoDoLead: quente, desconto pedido, retorno vencido, pediu horário e valor aprovado', () => {
  const lig = { orcamentos: [orc('o1', 'l1', { visualizado_em: horas(7), desconto_pedido_em: horas(3), follow_up_em: horas(1) })], os: [], extras: { aprovado: 0, pendente: 0, recusado: 0 } };
  const o = Ciclo.resumoDoLead(lig, AGORA).orcamento;
  assert.equal(o.quente, true); assert.equal(o.visto_horas, 7); assert.equal(o.desconto_pedido, true); assert.equal(o.follow_vencido, true); assert.equal(o.pediu_horario, false);
  const ap = Ciclo.resumoDoLead({ orcamentos: [orc('o2', 'l1', { status: 'aprovado', total: 1000, total_aprovado: 900, horario_pedido: { data: '2026-10-28' } })], os: [], extras: { aprovado: 0 } }, AGORA).orcamento;
  assert.equal(ap.pediu_horario, true); assert.equal(ap.valor_aprovado, 900); assert.equal(ap.quente, false);
});

test('leads: filtros orc_quente, desconto e follow_vencido; KPIs e sinal no CSV', () => {
  const montar = (id, o) => ({ ...Leads.montarLinha(lead(id), { agora: AGORA }), ciclo: Ciclo.resumoDoLead({ orcamentos: [o], os: [], extras: {} }, AGORA) });
  const lista = [montar('a', orc('oa', 'a', { visualizado_em: horas(5) })), montar('b', orc('ob', 'b', { desconto_pedido_em: horas(2) })), montar('c', orc('oc', 'c', { follow_up_em: horas(2) }))];
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'orc_quente' }).map(l => l.id), ['a']);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'desconto' }).map(l => l.id), ['b']);
  assert.deepEqual(Leads.filtrar(lista, { etapa: 'follow_vencido' }).map(l => l.id), ['c']);
  const r = Leads.resumo(lista);
  assert.equal(r.orc_quentes, 1); assert.equal(r.descontos, 1);
  assert.ok(Leads.ETAPAS_CICLO.includes('orc_quente'));
  assert.match(Leads.csv(lista), /abriu há 5 h e não respondeu/);
  assert.equal(Leads.sinalDoOrcamento(null), '');
  assert.equal(Leads.sinalDoOrcamento({ status: 'enviado' }), 'ainda não abriu');
});

/* ---------- qualidade da ligação ---------- */

test('qualidadeLigacao: orçamentos com lead, só agendamento e sem ligação; rascunho e cancelada fora; frases', () => {
  const r = Ciclo.qualidadeLigacao({
    orcamentos: [{ status: 'enviado', lead_id: 'a' }, { status: 'aprovado', lead_id: 'b' }, { status: 'recusado', agendamento_id: 'x' }, { status: 'enviado' }, { status: 'enviado', rascunho: true }, { status: 'aberto' }],
    os: [{ etapa: 'recebido', lead_id: 'a' }, { etapa: 'cancelado' }, { etapa: 'pronto' }] });
  assert.equal(r.orcamentos.total, 4); assert.equal(r.orcamentos.com_lead, 2); assert.equal(r.orcamentos.so_agendamento, 1); assert.equal(r.orcamentos.sem_ligacao, 1);
  assert.equal(r.orcamentos.pct_ligado, 75);
  assert.equal(r.os.total, 2); assert.equal(r.os.ligadas, 1); assert.equal(r.os.pct_ligado, 50);
  assert.equal(r.saudavel, false); assert.match(r.frase, /só 50% das OS/);
  const ok = Ciclo.qualidadeLigacao({ orcamentos: [{ status: 'enviado', lead_id: 'a' }], os: [{ etapa: 'recebido', lead_id: 'a' }] });
  assert.equal(ok.saudavel, true); assert.match(ok.frase, /Ligação em dia/);
  assert.match(Ciclo.qualidadeLigacao({}).frase, /Ainda não há/);
  const ruim = Ciclo.qualidadeLigacao({ orcamentos: [{ status: 'enviado' }, { status: 'enviado' }, { status: 'enviado', lead_id: 'a' }] });
  assert.match(ruim.problemas[0], /botão "Orçar"/);
});

test('ligacao: lê só as colunas de ligação e devolve "indisponível" com frase quando o banco falha', async () => {
  const colunas = [];
  const mk = erro => ({ from(t) { const q = { select(c) { colunas.push(c); return q; }, gte() { return q; }, limit() { return Promise.resolve(erro ? { data: null, error: { message: 'caiu' } } : { data: [], error: null }); } }; return q; } });
  const ok = await Ciclo.ligacao({ sb: mk(false), agoraMs: AGORA });
  assert.equal(ok.indisponivel, false); assert.ok(colunas.every(c => !/nome|telefone|cliente_telefone|observ/.test(c)), 'nenhum dado pessoal');
  const ruim = await Ciclo.ligacao({ sb: mk(true), agoraMs: AGORA });
  assert.equal(ruim.indisponivel, true); assert.match(ruim.motivo, /Não consegui conferir/);
});

/* ---------- do teste ao real ---------- */

test('preparo: sem chaves e com dados = demonstração, e o próximo passo é a Meta', () => {
  const p = Preparo.montar({ chaves: { meta: 'sem_token', google: 'sem_token' }, config: {}, temDados: true, temDadosReais: false, dadosDemo: true });
  assert.equal(p.modo, 'demonstracao'); assert.equal(p.proximo, 'chave_meta'); assert.match(p.frase, /DEMONSTRAÇÃO/);
  assert.equal(p.passos.find(x => x.id === 'ia').estado, 'opcional');
  assert.ok(p.total < p.passos.length, 'o opcional não conta no total');
});

test('preparo: chave recusada vira "atenção" com instrução; tudo certo = real e sem próximo passo', () => {
  const r = Preparo.montar({ chaves: { meta: 'recusada', google: 'ok' }, config: {}, temDados: true, temDadosReais: true });
  assert.equal(r.passos.find(x => x.id === 'chave_meta').estado, 'atencao');
  assert.match(r.passos.find(x => x.id === 'chave_meta').como, /Testar sem salvar/);
  assert.equal(r.modo, 'real');
  const tudo = Preparo.montar({ chaves: { meta: 'ok', google: 'ok' }, config: { cpa_alvo: 50, whatsapp_destinos: ['5512999999999'], relatorio_ativo: true, relatorio_hora: 9 }, temDados: true, temDadosReais: true,
    canalWhatsApp: true, ia: true, ligacao: { saudavel: true, frase: 'ok' } });
  assert.equal(tudo.proximo, null); assert.equal(tudo.feitos, tudo.total); assert.match(tudo.frase, /tudo configurado/);
});

test('preparo: sem dados nenhum = "vazio"; sem destino diz o porquê; canal do WhatsApp fora vira atenção', () => {
  assert.equal(Preparo.montar({}).modo, 'vazio');
  const p = Preparo.montar({ chaves: { meta: 'ok' }, temDados: true, temDadosReais: true, canalWhatsApp: false });
  assert.match(p.passos.find(x => x.id === 'whatsapp_destino').como, /nada é enviado/);
  assert.equal(p.passos.find(x => x.id === 'whatsapp_canal').estado, 'atencao');
});

test('preparo.ler: cada leitura que falha vira "não sei", nunca erro', async () => {
  const quebra = async () => { throw new Error('banco fora'); };
  const p = await Preparo.ler({ deps: { chaves: quebra, config: quebra, temDados: quebra, temDadosReais: quebra, ligacao: quebra, canal: quebra, ia: () => false } });
  assert.equal(p.modo, 'vazio'); assert.ok(p.passos.length >= 8);
  assert.equal(p.passos.find(x => x.id === 'ligacao').estado, 'atencao');
});

/* ---------- fechamento do mês ---------- */

test('periodoDoMes: mês fechado, mês em andamento (até ontem), mês futuro e formato errado', () => {
  const fechado = Fech.periodoDoMes('2026-09', '2026-10-25');
  assert.deepEqual([fechado.de, fechado.ate, fechado.parcial, fechado.dias], ['2026-09-01', '2026-09-30', false, 30]);
  const andamento = Fech.periodoDoMes('2026-10', '2026-10-25');
  assert.deepEqual([andamento.ate, andamento.parcial, andamento.dias], ['2026-10-24', true, 24]);
  assert.equal(Fech.periodoDoMes('2026-11', '2026-10-25'), null);
  assert.equal(Fech.periodoDoMes('2026-10', '2026-10-01'), null, 'dia 1: o mês ainda não tem dia fechado');
  assert.equal(Fech.periodoDoMes('10/2026', '2026-10-25'), null);
  assert.equal(Fech.periodoDoMes('2026-13', '2026-10-25'), null);
  assert.equal(Fech.periodoDoMes('2024-02', '2026-10-25').ate, '2024-02-29', 'bissexto');
  assert.equal(Fech.mesAnterior('2026-01'), '2025-12'); assert.equal(Fech.mesAnterior('2026-10'), '2026-09');
});

const resultadoMes = (g, extra = {}) => ({ demo: false, total: { gasto: g, leads: 40, cpl: g / 40, agendamentos: 20, fechados: 10, receita: 5000 },
  ciclo: { indisponivel: false, total: { orcados: 12, orcamentos_aprovados: 8, valor_aprovado: 9000, na_oficina: 6, entregues: 5, receita_entregues: 7000, entregues_sem_valor: 1, extras_aprovados: 300,
    custo_carro_na_oficina: g / 6, custo_carro_entregue: g / 5, roas_oficina: 7000 / g, roas_previsto: 9300 / g, orcamentos_recusados: 2, valor_recusado: 800, horas_decisao: 20, ...extra },
  motivos: [{ motivo: 'preço', qtd: 2 }], campanhas: [{ campanha: 'Revisão', gasto: g, na_oficina: 6, custo_carro_na_oficina: g / 6 }] } });

test('fechamento: consolida contra o mês anterior e o texto traz anúncio, oficina, campanha e veredito', () => {
  const per = Fech.periodoDoMes('2026-09', '2026-10-25');
  const f = Fech.consolidar(per, resultadoMes(3000), resultadoMes(2000, { na_oficina: 4, receita_entregues: 5000 }));
  assert.equal(Math.round(f.anuncio.variacao_gasto), 50);
  assert.equal(Math.round(f.oficina.variacao_carros), 50);
  const t = Fech.texto(f);
  assert.match(t, /Fechamento de setembro de 2026/); assert.match(t, /\+50% contra o mês anterior/);
  assert.match(t, /6 carro\(s\) entraram \(\+50%\)/); assert.match(t, /Cada carro custou R\$\s500,00/);
  assert.match(t, /recusado\(s\).*preço \(2\)/); assert.match(t, /\*Campanhas\*/);
  assert.match(t, /Cada R\$ 1 em anúncio voltou como 2,3 reais/); assert.match(t, /faltam 1 valor/);
  assert.deepEqual(Vocab.conferir(t), []);
});

test('fechamento: veredito em cada situação (sem gasto, fonte fora, sem pagamento, não cobre)', () => {
  const per = Fech.periodoDoMes('2026-09', '2026-10-25');
  assert.match(Fech.veredito(Fech.consolidar(per, { total: { gasto: 0 } }, null)), /Não houve investimento/);
  assert.match(Fech.veredito(Fech.consolidar(per, { total: { gasto: 100 }, ciclo: { indisponivel: true } }, null)), /Não consegui ler o Orçador e o Pátio/);
  assert.match(Fech.veredito(Fech.consolidar(per, resultadoMes(3000, { receita_entregues: 0 }), null)), /nenhum valor pago foi lançado/);
  assert.match(Fech.veredito(Fech.consolidar(per, resultadoMes(9000), null)), /ainda não cobre o anúncio/);
  assert.match(Fech.veredito(Fech.consolidar(per, resultadoMes(3000, { na_oficina: 0, receita_entregues: 0 }), null)), /Nenhum lead de anúncio virou carro/);
});

test('fechamento: investimento de demonstração aparece marcado no texto; fonte fora = texto sem o bloco "Na oficina"', () => {
  const per = Fech.periodoDoMes('2026-09', '2026-10-25');
  assert.match(Fech.texto(Fech.consolidar(per, { ...resultadoMes(1000), demo: true }, null)), /DEMONSTRAÇÃO/);
  const t = Fech.texto(Fech.consolidar(per, { total: { gasto: 100, leads: 1 }, ciclo: { indisponivel: true } }, null));
  assert.doesNotMatch(t, /\*Na oficina\*/); assert.match(t, /\*Anúncio\*/);
});

test('fechamento.gerar: lê o mês e o anterior; mês inválido volta { ok: false } sem ler nada', async () => {
  const lidos = [];
  const r = await Fech.gerar({ mes: '2026-09', hojeISO: '2026-10-25', ler: async p => { lidos.push(p); return resultadoMes(3000); } });
  assert.equal(r.ok, true); assert.deepEqual(lidos.map(p => p.de), ['2026-09-01', '2026-08-01']);
  const ruim = await Fech.gerar({ mes: 'x', hojeISO: '2026-10-25', ler: async () => { throw new Error('não devia ler'); } });
  assert.equal(ruim.ok, false); assert.match(ruim.erro, /AAAA-MM/);
  const semAnt = await Fech.gerar({ mes: '2026-09', hojeISO: '2026-10-25', ler: async p => { if (p.de === '2026-08-01') throw new Error('fora'); return resultadoMes(3000); } });
  assert.equal(semAnt.ok, true, 'o mês anterior falhando não derruba o fechamento');
});

test('decidirEnvioMensal: só no dia 1, depois da hora, ligado, com número e uma vez por mês', () => {
  const cfg = { relatorio_ativo: true, whatsapp_destinos: ['5512999999999'], relatorio_hora: 8 };
  assert.equal(Fech.decidirEnvioMensal(null, '2026-11-01', 9).enviar, false);
  assert.match(Fech.decidirEnvioMensal(cfg, '2026-11-02', 9).motivo, /dia 1/);
  assert.match(Fech.decidirEnvioMensal({ ...cfg, relatorio_ativo: false }, '2026-11-01', 9).motivo, /desligado/);
  assert.match(Fech.decidirEnvioMensal({ ...cfg, whatsapp_destinos: [] }, '2026-11-01', 9).motivo, /nenhum número/);
  assert.match(Fech.decidirEnvioMensal(cfg, '2026-11-01', 7).motivo, /8h/);
  assert.match(Fech.decidirEnvioMensal(cfg, '2026-11-01', 9, '2026-10').motivo, /já enviado/);
  const sim = Fech.decidirEnvioMensal(cfg, '2026-11-01', 9, '2026-09');
  assert.deepEqual([sim.enviar, sim.mes], [true, '2026-10']);
  assert.equal(Fech.decidirEnvioMensal(cfg, '2027-01-01', 9).mes, '2026-12');
});

test('enviarMesAnterior: manda pela fila com chave do mês; demonstração e erro não saem; falha de envio vira motivo', async () => {
  const enviados = [];
  const cfg = { whatsapp_destinos: ['5512999999999'] };
  const gerar = async () => ({ ok: true, demo: false, texto: 'texto', periodo: { mes: '2026-10', ate: '2026-10-31' } });
  const ok = await Fech.enviarMesAnterior({ hojeISO: '2026-11-01', cfg, deps: { gerar, enviar: async (d, t, o) => { enviados.push([d, t, o]); return [{ ok: true }]; } } });
  assert.equal(ok.enviado, true); assert.equal(enviados[0][2].chave, 'ads:fechamento:2026-10:2026-10-31');
  const demo = await Fech.enviarMesAnterior({ hojeISO: '2026-11-01', cfg, deps: { gerar: async () => ({ ok: true, demo: true }), enviar: async () => { throw new Error('não devia enviar'); } } });
  assert.equal(demo.enviado, false); assert.match(demo.motivo, /demonstração/);
  const falha = await Fech.enviarMesAnterior({ hojeISO: '2026-11-01', cfg, deps: { gerar, enviar: async () => [{ ok: false, erro: 'chave recusada' }] } });
  assert.equal(falha.enviado, false); assert.equal(falha.motivo, 'chave recusada');
  const invalido = await Fech.enviarMesAnterior({ hojeISO: '2026-11-01', cfg, deps: { gerar: async () => ({ ok: false, erro: 'mês inválido' }) } });
  assert.equal(invalido.motivo, 'mês inválido');
});

test('piloto automático: o fechamento mensal tem decisão e gancho no ciclo (um envio por mês)', async () => {
  assert.equal(typeof Agenda.fechamento_.decidir, 'function');
  assert.equal(Agenda.estado.ultimoFechamento, null);
  assert.equal(Agenda.fechamento_.decidir({ relatorio_ativo: true, whatsapp_destinos: ['x'], relatorio_hora: 8 }, '2026-11-01', 9, '2026-10').enviar, false);
});

/* ---------- CSV da fila, ecossistema e segurança ---------- */

test('CSV da fila: links, recado e marca de "sem responsável"; fórmula em nome não executa', () => {
  const c = cons([lead('l1', { nome: '=HYPERLINK("x")', responsavel_id: null })], [orc('o1', 'l1', { enviado_em: horas(20), visualizado_em: horas(5) })]);
  const f = Acoes.fila(c);
  const linhas = Acoes.linhasCSV(f);
  assert.equal(linhas[0].dono, 'sem responsável'); assert.match(linhas[0].link_orcamento, /#\/historico\/o1$/);
  const csv = A.montarCSV(Acoes.CAMPOS_CSV, linhas);
  assert.match(csv.split('\n')[0], /Prioridade.*Cliente.*Telefone.*O que fazer/);
  assert.ok(!/(^|;|,)"?=HYPERLINK/.test(csv.split('\n')[1]), 'célula começando com = é neutralizada');
});

test('segurança: rotas novas têm limite por pessoa e o envio do fechamento é o mais apertado', () => {
  const seg = require('../seguranca');
  for (const k of ['GET /api/acoes', 'GET /api/acoes.csv', 'GET /api/ligacao', 'GET /api/fechamento', 'POST /api/fechamento/enviar']) assert.ok(seg.LIMITES_CAROS[k] > 0, k);
  assert.ok(seg.LIMITES_CAROS['POST /api/fechamento/enviar'] <= 5);
});

test('resultados.cicloDe: leva demo e parcial para a tela', async () => {
  const leads = [lead('l1')];
  const c = await R.cicloDe({ leads }, null, { ler: async () => ({ ok: true, parcial: 'patio', porLead: Ciclo.ligar({ leadIds: ['l1'], orcamentos: [orc('o1', 'l1')] }) }), agora: AGORA });
  assert.equal(c.parcial, 'patio'); assert.equal(c.indisponivel, false);
});

test('limiares novos: ficam em variáveis de ambiente e têm padrão (24 h, 2 h, 24 h)', () => {
  const fonte = require('node:fs').readFileSync(require.resolve('../ciclo'), 'utf8');
  for (const v of ['ADS_ORC_NAO_ABERTO_H', 'ADS_ORC_QUENTE_H', 'ADS_LEAD_PARADO_H']) assert.match(fonte, new RegExp(v));
});

test('front: acoes.js é entregue pelo HTML e pelo service worker v4; só links https dos apps da casa viram botão', () => {
  const fs = require('node:fs');
  assert.match(fs.readFileSync(require.resolve('../public/index.html'), 'utf8'), /<script src="acoes\.js"><\/script>/);
  const sw = fs.readFileSync(require.resolve('../public/sw.js'), 'utf8');
  assert.match(sw, /ads-casca-v4/); assert.match(sw, /'\/acoes\.js'/);
  const front = fs.readFileSync(require.resolve('../public/acoes.js'), 'utf8');
  assert.match(front, /Ecossistema\.appDaUrl\(u\)/, 'o botão só abre endereço reconhecido do ecossistema');
});

/* ---------- HTTP: rotas novas só com login ---------- */
test('HTTP: rotas novas exigem login e o cron do fechamento exige a chave', async () => {
  const { servidor } = require('../server');
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    for (const [m, c] of [['GET', '/api/acoes'], ['GET', '/api/acoes.csv'], ['GET', '/api/ligacao'], ['GET', '/api/preparo'], ['GET', '/api/fechamento?mes=2026-09'], ['POST', '/api/fechamento/enviar'], ['GET', '/api/cron/fechamento']]) {
      const r = await fetch(base + c, { method: m });
      assert.equal(r.status, 401, `${m} ${c}`);
    }
  } finally {
    servidor.closeAllConnections?.();
    await new Promise(r => servidor.close(r));
  }
});

/* ---------- severidade por tempo e CSV do fechamento ---------- */
test('severidadeDoCiclo: desconto +24 h, pronto +72 h e aprovado sem OS +7 dias sobem para crítico; o resto fica como está', () => {
  const com = (tipo, horas) => ({ tipo, quantidade: 1, itens: [{ horas }] });
  assert.equal(Radar.severidadeDoCiclo(com('desconto_pedido', 23)), 'alerta');
  assert.equal(Radar.severidadeDoCiclo(com('desconto_pedido', 24)), 'critico');
  assert.equal(Radar.severidadeDoCiclo(com('pronto_parado', 71)), 'alerta');
  assert.equal(Radar.severidadeDoCiclo(com('pronto_parado', 72)), 'critico');
  assert.equal(Radar.severidadeDoCiclo(com('aprovado_sem_os', 168)), 'critico');
  assert.equal(Radar.severidadeDoCiclo(com('orc_nao_aberto', 999)), 'info');
  assert.equal(Radar.severidadeDoCiclo(com('inventado', 999)), null);
  assert.equal(Radar.severidadeDoCiclo({ tipo: 'desconto_pedido', quantidade: 1 }), 'alerta', 'sem itens não quebra');
  const r = Radar.alertasDoCiclo({ alertas: [com('pronto_parado', 100)] }, { agora: AGORA });
  assert.equal(r.novos[0].severidade, 'critico');
});

test('fechamento: o custo por lead aparece no texto (o campo do CRM é cpl)', () => {
  const per = Fech.periodoDoMes('2026-09', '2026-10-25');
  const f = Fech.consolidar(per, { total: { gasto: 3000, leads: 40, cpl: 75, agendamentos: 1, fechados: 1 }, ciclo: { indisponivel: true } }, null);
  assert.equal(f.anuncio.custo_lead, 75);
  assert.match(Fech.texto(f), /Leads: 40 · R\$\s75,00 cada/);
});

test('fechamento: CSV com resumo e campanhas; sem oficina sai só o anúncio; fórmula em nome de campanha é neutralizada', () => {
  const per = Fech.periodoDoMes('2026-09', '2026-10-25');
  const f = Fech.consolidar(per, resultadoMes(3000), null);
  f.campanhas[0].campanha = '=SOMA(A1)';
  const linhas = Fech.linhasCSV(f);
  assert.ok(linhas.some(l => l.indicador === 'Custo por carro' && l.valor === 500));
  assert.ok(linhas.some(l => l.secao === 'Campanha'));
  const csv = A.montarCSV(Fech.CAMPOS_CSV, linhas);
  assert.match(csv.split('\n')[0], /Seção.*Indicador.*Valor/);
  assert.ok(!/(^|;|,)"?=SOMA/.test(csv.split('\n').find(l => l.includes('SOMA'))), 'fórmula neutralizada');
  const sem = Fech.linhasCSV(Fech.consolidar(per, { total: { gasto: 10 }, ciclo: { indisponivel: true } }, null));
  assert.ok(!sem.some(l => l.indicador === 'Carros na oficina'));
});
