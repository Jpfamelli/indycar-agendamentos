/* Rodada 6 (C2) — funções puras de lib/rodada6.js: tempo útil, contato, cadência, sinais, fila, ROI, qualidade, dono. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/rodada6');

const qua12 = R.deBrt(2026, 10, 21, 12, 0);           // quarta-feira 12h
const sab17 = R.deBrt(2026, 10, 24, 17, 0);           // sábado 17h
const dom10 = R.deBrt(2026, 10, 25, 10, 0);           // domingo
const H = 3600_000, D = 864e5;
const L = (n, extra = {}) => ({ id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`, nome: `Cliente ${n}`, telefone: '129991000' + String(10 + n), status: 'novo', origem: 'whatsapp', valor_orcado: 0, created_at: new Date(qua12 - 5 * H).toISOString(), updated_at: new Date(qua12 - 5 * H).toISOString(), ...extra });

test('tempo: dia útil pula domingo, expediente respeita 8h-17h30', () => {
  assert.equal(R.brt(R.diaUtil(qua12, 1, 9)).dow, 4);                       // quinta
  assert.equal(R.brt(R.diaUtil(sab17, 1, 9)).dow, 1);                       // sábado -> segunda
  assert.equal(R.brt(R.diaUtil(qua12, 6, 9)).dow, 3);                       // 6 dias úteis = quarta seguinte
  assert.equal(R.brt(R.diaUtil(qua12, 0, 9)).d, 22);                        // 9h de hoje já passou -> amanhã
  assert.equal(R.ehDiaUtil(dom10), false);
  assert.equal(R.brt(R.emHorasUteis(R.deBrt(2026, 10, 21, 17, 0), 2)).d, 22); // 19h -> amanhã
  assert.equal(R.brt(R.emHorasUteis(dom10, 2)).dow, 1);
  assert.equal(R.brt(R.emHorasUteis(R.deBrt(2026, 10, 21, 5, 0), 1)).h, 9);  // madrugada -> abre 9h
  assert.equal(R.emHorasUteis(qua12, 2), qua12 + 2 * H);
});

test('próximo contato: presets, data, nulo e limites', () => {
  assert.equal(R.resolverProximo('', qua12), null);
  assert.equal(R.resolverProximo('nenhum', qua12), null);
  assert.equal(R.resolverProximo('2h', qua12), qua12 + 2 * H);
  assert.equal(R.brt(R.resolverProximo('hoje', qua12)).h, 17);
  assert.equal(R.brt(R.resolverProximo('hoje', R.deBrt(2026, 10, 21, 18, 0))).d, 22);
  assert.equal(R.brt(R.resolverProximo('amanha', qua12)).h, 9);
  assert.equal(R.brt(R.resolverProximo('3d', qua12)).d, 24);
  assert.equal(R.brt(R.resolverProximo('2sem', qua12)).dow, 3);
  assert.equal(R.resolverProximo(new Date(qua12 + D).toISOString(), qua12), qua12 + D);
  assert.throws(() => R.resolverProximo('lixo', qua12), { status: 400 });
  assert.throws(() => R.resolverProximo(new Date(qua12 - 5 * H).toISOString(), qua12), /já passou/);
  assert.throws(() => R.resolverProximo(new Date(qua12 + 500 * D).toISOString(), qua12), /longe demais/);
});

test('próximo sugerido pelo resultado do contato', () => {
  assert.equal(R.proximoSugerido('nao_atendeu', qua12).preset, '2h');
  assert.equal(R.proximoSugerido('caixa_postal', qua12).preset, 'amanha');
  assert.equal(R.proximoSugerido('pediu_prazo', qua12).preset, '3d');
  assert.equal(R.proximoSugerido('recusou', qua12), null);
  assert.equal(R.proximoSugerido('agendou', qua12), null);
});

test('validar contato: tipo, resultado, texto, sugestão e tarefa', () => {
  assert.throws(() => R.validarContato(null), { status: 400 });
  assert.throws(() => R.validarContato([]), { status: 400 });
  assert.throws(() => R.validarContato({ tipo: 'ligacao' }), /o que aconteceu/);
  assert.throws(() => R.validarContato({ resultado: 'xpto' }), /inválido/);
  assert.throws(() => R.validarContato({ tipo: 'nota', texto: 'x'.repeat(1001) }), /longa/);
  assert.equal(R.validarContato({ tipo: 'nota', texto: '  oi   tudo  ' }).texto, 'oi tudo');
  assert.equal(R.validarContato({ tipo: 'nota' }).texto, null);
  assert.equal(R.validarContato({ tipo: 'qualquer', resultado: 'atendeu' }, qua12).tipo, 'ligacao');
  const sug = R.validarContato({ resultado: 'nao_atendeu' }, qua12);
  assert.equal(sug.proximo, qua12 + 2 * H);
  assert.equal(R.validarContato({ resultado: 'nao_atendeu', sugerir: false }, qua12).proximo, undefined);
  assert.equal(R.validarContato({ resultado: 'atendeu', proximo: null }, qua12).proximo, null);
  assert.equal(R.validarContato({ resultado: 'atendeu', criar_tarefa: true }, qua12).tarefa, true);
});

test('efeito do contato: tentativas, etapa e sugestões', () => {
  assert.equal(R.efeitoDoContato({ status: 'novo', tentativas_contato: 0 }, { resultado: 'nao_atendeu' }).tentativas, 1);
  assert.equal(R.efeitoDoContato({ status: 'contato', tentativas_contato: 3 }, { resultado: 'atendeu' }).tentativas, 0);
  assert.equal(R.efeitoDoContato({ status: 'contato', tentativas_contato: 2 }, { resultado: 'outro' }).tentativas, 2);
  assert.equal(R.efeitoDoContato({ status: 'novo' }, { resultado: 'respondeu' }).status, 'contato');
  assert.equal(R.efeitoDoContato({ status: 'novo' }, { resultado: 'nao_atendeu' }).status, null);
  assert.equal(R.efeitoDoContato({ status: 'novo' }, { resultado: 'recusou' }).status, null);
  assert.equal(R.efeitoDoContato({ status: 'orcamento' }, { resultado: 'atendeu' }).status, null);
  const q4 = R.efeitoDoContato({ status: 'contato', tentativas_contato: 3 }, { resultado: 'caixa_postal' });
  assert.equal(q4.sugestao.codigo, 'perder'); assert.match(q4.sugestao.motivo, /Sem retorno/);
  assert.equal(R.efeitoDoContato({ status: 'contato' }, { resultado: 'recusou' }).sugestao.motivo, 'Desistiu do serviço');
  assert.equal(R.efeitoDoContato({ status: 'contato' }, { resultado: 'agendou' }).sugestao.codigo, 'agendar');
});

test('cadências: 3 planos em dias úteis, às 9h, e tipo desconhecido recusa', () => {
  const o = R.planoCadencia('orcamento', qua12);
  assert.equal(o.length, 3); assert.ok(o.every(p => R.brt(Date.parse(p.vence_em)).h === 9 && R.brt(Date.parse(p.vence_em)).dow !== 0));
  assert.equal(R.planoCadencia('posvenda', qua12).length, 2);
  assert.equal(R.planoCadencia('reativacao', qua12).length, 2);
  assert.throws(() => R.planoCadencia('x'), { status: 400 });
  assert.ok(o.every(p => p.titulo.startsWith('Orçamento:')));
});

test('sinais: cada flag nasce do dado certo', () => {
  const l1 = L(1, { status: 'agendado', cliente_id: 'c1' }), l2 = L(2, { status: 'orcamento' }), l3 = L(3, { status: 'em_servico' }), l4 = L(4, { status: 'contato', proximo_contato_em: new Date(qua12 - H).toISOString() }), l5 = L(5);
  const dados = {
    os: [{ id: 'o1', etapa: 'pronto', lead_id: l1.id, numero: 4 }, { id: 'o9', etapa: 'recebido', lead_id: l1.id }],
    entregues: [{ id: 'o3', etapa: 'entregue', lead_id: l3.id, entregue_em: new Date(qua12 - 3 * D).toISOString() }],
    extras: [{ os_id: 'o1' }],
    orcs: [{ id: 'q1', status: 'enviado', lead_id: l2.id, total: 500, enviado_em: new Date(qua12 - 3 * D).toISOString(), created_at: new Date(qua12 - 3 * D).toISOString() },
      { id: 'q2', status: 'aprovado', cliente_telefone: l4.telefone, total: 700, total_aprovado: 650, created_at: new Date(qua12 - D).toISOString() }],
    conversas: [{ id: 'cv', telefone_e164: R.e164 ? R.e164(l5.telefone) : l5.telefone.replace(/^55/, ''), aguardando_desde: new Date(qua12 - 4 * H).toISOString() }],
    tarefas: [{ id: 't1', lead_id: l2.id, status: 'aberta', titulo: 'Ligar', vence_em: new Date(qua12 - H).toISOString() }],
    agendamentos: [{ id: 'a1', lead_id: l1.id, status: 'confirmado', data: '2026-10-22', hora: '10:00:00' }],
  };
  const s = R.construirSinais([l1, l2, l3, l4, l5, L(6, { status: 'concluido' })], dados, qua12);
  assert.ok(s[l1.id].flags.includes('pronto_retirar')); assert.equal(s[l1.id].patio.etapa, 'pronto'); assert.equal(s[l1.id].patio.extras_pendentes, 1); assert.ok(s[l1.id].flags.includes('extra_pendente'));
  assert.equal(s[l1.id].agendamento.id, 'a1');
  assert.ok(s[l2.id].flags.includes('orcamento_parado')); assert.equal(s[l2.id].orcamento.dias, 3); assert.ok(s[l2.id].flags.includes('tarefa_atrasada'));
  assert.ok(s[l3.id].flags.includes('entregue_fechar')); assert.equal(s[l3.id].entregue.dias, 3);
  assert.ok(s[l4.id].flags.includes('followup_vencido')); assert.ok(s[l4.id].flags.includes('orcamento_aprovado')); assert.equal(s[l4.id].orcamento.total, 650);
  assert.ok(s[l5.id].flags.includes('primeiro_contato')); assert.ok(s[l5.id].flags.includes('sem_tarefa'));
  assert.equal(s['22222222-2222-4222-8222-000000000006'], undefined, 'lead concluído não entra');
  const c = R.contarSinais(s); assert.equal(c.entregue_fechar, 1); assert.ok(c.followup_vencido >= 1);
});

test('sinais: orçamento de outro status e carro com OS aberta não viram "entregue"', () => {
  const l = L(1, { status: 'em_servico', cliente_id: 'c1' });
  const s = R.construirSinais([l], { os: [{ id: 'o', etapa: 'teste', lead_id: l.id }], entregues: [{ id: 'old', etapa: 'entregue', lead_id: l.id, entregue_em: new Date(qua12 - D).toISOString() }], orcs: [{ id: 'q', status: 'recusado', lead_id: l.id }] }, qua12);
  assert.ok(!s[l.id].flags.includes('entregue_fechar')); assert.ok(!s[l.id].orcamento); assert.ok(s[l.id].flags.includes('patio'));
});

test('fila: ordem de urgência, motivo principal e lead parado sem sinal', () => {
  const esp = R.prioridadeFila(L(1), { flags: ['esperando', 'tarefa_atrasada'], esperando: { horas: 5 }, tarefa: { titulo: 'x' } }, qua12);
  assert.equal(esp.principal.codigo, 'esperando'); assert.ok(esp.score >= 105);
  const ent = R.prioridadeFila(L(2), { flags: ['entregue_fechar'], entregue: { dias: 2 } }, qua12);
  assert.ok(ent.score < esp.score && ent.score >= 90);
  const parado = R.prioridadeFila(L(3, { status: 'orcamento', updated_at: new Date(qua12 - 9 * D).toISOString() }), { flags: [] }, qua12);
  assert.equal(parado.principal.codigo, 'parado');
  assert.equal(R.prioridadeFila(L(4), { flags: [] }, qua12).score, 0);
  assert.equal(R.prioridadeFila(L(5, { status: 'contato', proximo_contato_em: new Date(qua12 - 2 * D).toISOString() }), { flags: ['followup_vencido'] }, qua12).principal.texto.match(/2 d/) !== null, true);
});

test('script sugerido: sem preço, sem palavra proibida, com o nome e o horário da casa', () => {
  for (const cod of ['esperando', 'primeiro_contato', 'followup_vencido', 'orcamento_parado', 'orcamento_aprovado', 'pronto_retirar', 'entregue_fechar', 'extra_pendente', 'tarefa_atrasada', 'parado', 'outro']) {
    const t = R.scriptSugerido(cod, { nome: 'Carlos Silva', carro_modelo: 'Gol' });
    assert.ok(!/R\$|prezad|efetuar|comparecer|ve[ií]culo/i.test(t), cod);
    assert.match(t, /^Oi, Carlos!/);
  }
  assert.match(R.scriptSugerido('orcamento_aprovado', {}), /8h às 17h30/);
  assert.match(R.scriptSugerido('entregue_fechar', {}), /Quem conhece, Indyca! 🏎/);
  assert.match(R.scriptSugerido('esperando', { nome: 'Família Souza' }), /^Oi! /);
});

test('valor sugerido ao concluir: orçamento aprovado + extras vêm antes do orçado', () => {
  const s = R.sugestaoValorEntregue({ lead: { valor_orcado: 600 }, orcamento: { total: 800, total_aprovado: 750 }, extrasAprovados: 120 });
  assert.deepEqual(s.map(x => x.valor), [870, 750, 720, 600]);
  assert.deepEqual(R.sugestaoValorEntregue({ lead: { valor_orcado: 0 } }), []);
  assert.deepEqual(R.sugestaoValorEntregue({ lead: { valor_orcado: 750 }, orcamento: { total: 750 } }).map(x => x.valor), [750]);
  assert.equal(R.sugestaoValorEntregue({ lead: {}, agendamento: { valor: 300 } })[0].rotulo, 'Valor na Agenda');
});

test('campanha do lead casa com a do Ads (acento, colchetes, contido)', () => {
  assert.equal(R.slug('Freios Taubaté [Meta] 2026'), 'freios-taubate-2026');
  assert.ok(R.mesmaCampanha('freios-taubate', 'Freios Taubaté'));
  assert.ok(R.mesmaCampanha('freios', 'Campanha Freios Taubaté Out'));
  assert.ok(!R.mesmaCampanha('abc', 'abcdef'));
  assert.ok(!R.mesmaCampanha('', 'x')); assert.ok(!R.mesmaCampanha('troca-oleo', 'Freios'));
});

test('ROI por campanha: gasto × leads × vendas, veredito e leads sem campanha', () => {
  const met = [{ plataforma: 'meta', data: '2026-10-01', campanha_nome: 'Freios Taubaté', gasto: 100, cliques: 40, impressoes: 900, conversoes: 2 }, { plataforma: 'meta', data: '2026-10-02', campanha_nome: 'Freios Taubaté', gasto: 100, cliques: 10, impressoes: 100, conversoes: 0 },
    { plataforma: 'google', data: '2026-10-01', campanha_nome: 'Oficina', gasto: 300, cliques: 5, impressoes: 50 }, { plataforma: 'google', data: '2026-10-01', campanha_nome: 'Parada', gasto: 0 }];
  const leads = [L(1, { origem: 'meta', utm_campaign: 'freios-taubate', status: 'concluido', valor_pago: 900 }), L(2, { origem: 'meta', utm_campaign: 'freios-taubate', status: 'perdido' }), L(3, { origem: 'meta', utm_campaign: 'freios-taubate', valor_orcado: 300 }),
    L(4, { origem: 'google', utm_campaign: 'oficina', status: 'concluido', valor_pago: 100 }), L(5, { origem: 'meta' }), L(6, { origem: 'whatsapp', utm_campaign: 'outra-coisa' })];
  const r = R.roiCampanhas(met, leads);
  const fr = r.campanhas.find(c => c.campanha === 'Freios Taubaté'), of = r.campanhas.find(c => c.campanha === 'Oficina');
  assert.equal(fr.gasto, 200); assert.equal(fr.dias, 2); assert.equal(fr.leads, 3); assert.equal(fr.ganhos, 1); assert.equal(fr.perdidos, 1); assert.equal(fr.faturamento, 900);
  assert.equal(fr.cpl, 66.67); assert.equal(fr.cac, 200); assert.equal(fr.roas, 4.5); assert.equal(fr.veredito, 'lucra'); assert.equal(fr.orcaram, 2);
  assert.equal(of.veredito, 'prejuizo'); assert.equal(of.roas, 0.33);
  assert.equal(r.campanhas.find(c => c.campanha === 'Parada').veredito, 'sem_gasto');
  assert.equal(r.leads_do_ads_sem_campanha, 1); assert.equal(r.sem_campanha_no_ads[0].campanha, 'outra-coisa');
  assert.equal(r.totais.gasto, 500); assert.equal(r.totais.ganhos, 2);
  assert.deepEqual(r.canais.map(c => c.plataforma).sort(), ['google', 'meta']);
  assert.equal(R.roiCampanhas([{ plataforma: 'meta', campanha_nome: 'X', gasto: 50, data: 'd' }], []).campanhas[0].veredito, 'sem_lead');
  assert.equal(R.roiCampanhas([{ plataforma: 'meta', campanha_nome: 'X', gasto: 50, data: 'd' }], [L(1, { origem: 'meta', utm_campaign: 'x' })]).campanhas[0].veredito, 'sem_venda');
});

test('qualidade dos dados: duplicados, sem telefone, Ads sem campanha, sem valor, sem dono, velhos', () => {
  const velho = new Date(qua12 - 100 * D).toISOString();
  const ls = [L(1, { telefone: '12999100011' }), L(2, { telefone: '(12) 99910-0011' }), L(3, { telefone: '123' }), L(4, { origem: 'google' }), L(5, { status: 'orcamento', carro_modelo: 'Gol', responsavel_id: 'x' }),
    L(6, { created_at: velho, updated_at: velho }), L(7, { status: 'concluido', valor_pago: 0 }), L(8, { status: 'concluido', valor_pago: 0, observacoes: 'Cortesia: sem cobrança' })];
  const q = R.qualidadeDados(ls, qua12);
  assert.equal(q.duplicados.total, 1); assert.equal(q.duplicados.grupos[0].leads.length, 2);
  assert.equal(q.sem_telefone_valido.total, 1); assert.equal(q.ads_sem_campanha.total, 1); assert.equal(q.orcamento_sem_valor.total, 1);
  assert.ok(q.sem_responsavel.total >= 5); assert.equal(q.velhos.total, 1); assert.equal(q.concluidos_sem_valor.total, 1);
  assert.ok(q.sem_carro.total >= 5);
});

test('segmento do cliente: na oficina, VIP, recorrente, sumido, risco, primeira compra, novo', () => {
  const seg = (resumo, patio = []) => R.segmentoCliente({ resumo, cliente: {}, patio }, qua12);
  assert.equal(seg({}, [{ etapa: 'em_execucao' }]).codigo, 'na_oficina');
  assert.equal(seg({ faltas: 2 }).codigo, 'risco');
  assert.equal(seg({ total_gasto: 3500, servicos_feitos: 2, ultima_visita: new Date(qua12 - 20 * D).toISOString() }).codigo, 'vip');
  assert.equal(seg({ total_gasto: 400, servicos_feitos: 2, ultima_visita: new Date(qua12 - 40 * D).toISOString() }).codigo, 'recorrente');
  assert.equal(seg({ total_gasto: 400, servicos_feitos: 1, ultima_visita: new Date(qua12 - 300 * D).toISOString() }).codigo, 'sumido');
  assert.equal(seg({ total_gasto: 400, servicos_feitos: 1, ultima_visita: new Date(qua12 - 30 * D).toISOString() }).codigo, 'primeira_compra');
  assert.equal(seg({}).codigo, 'novo');
  const v = seg({ total_gasto: 400, servicos_feitos: 1, ultima_visita: new Date(qua12 - 200 * D).toISOString() });
  assert.equal(v.revisao_vencida, true); assert.equal(v.ticket, 400);
  assert.equal(R.segmentoCliente({ resumo: {}, cliente: { nascimento: '1990-03-15' } }, qua12).aniversario, '03-15');
});

test('nota média e detratores; linha do tempo do cliente em ordem e limitada', () => {
  assert.equal(R.notaMedia([]), null);
  assert.deepEqual(R.notaMedia([{ nota: 5 }, { nota: 3 }, { nota: 9 }, { nota: 'x' }]), { media: 4, total: 2, detratores: 1 });
  const f = { leads: [{ created_at: new Date(qua12 - 5 * D).toISOString(), servico: 'Freios', status: 'novo' }], agendamentos: [{ data: '2026-10-20', hora: '09:00:00', servico: 'Revisão', status: 'concluido' }],
    patio: [{ created_at: new Date(qua12 - 2 * D).toISOString(), numero: 8, entregue_em: new Date(qua12 - D).toISOString(), placa: 'ABC1D23' }], orcamentos: [{ numero: 3, status: 'aprovado', enviado_em: new Date(qua12 - 3 * D).toISOString(), total: 900 }],
    avaliacoes: [{ nota: 5, created_at: new Date(qua12 - H).toISOString(), comentario: 'Top' }], mensagens: [], comunicar: [], indicacoes: { fez: [] } };
  const t = R.linhaDoTempoCliente(f);
  assert.equal(t[0].tipo, 'avaliacao'); assert.ok(t.length >= 5);
  assert.ok(t.every((x, i) => i === 0 || Date.parse(t[i - 1].quando) >= Date.parse(x.quando)));
  assert.equal(R.linhaDoTempoCliente({}).length, 0);
});

test('meta do mês: ritmo, projeção, risco e meta batida', () => {
  const r = R.ritmoMeta({ realizado: 10000, meta: 40000, agora: R.deBrt(2026, 10, 14, 12, 0) });
  assert.equal(r.pct, 25); assert.equal(r.risco, true); assert.equal(r.bateu, false); assert.ok(r.projecao > 10000 && r.projecao < 40000); assert.ok(r.por_dia_util > 0);
  const b = R.ritmoMeta({ realizado: 45000, meta: 40000, agora: qua12 }); assert.equal(b.bateu, true); assert.equal(b.falta, 0); assert.equal(b.risco, false);
  assert.equal(R.ritmoMeta({ realizado: 100, meta: 0, agora: qua12 }).pct, null);
  assert.equal(R.diasUteisEntre(R.deBrt(2026, 10, 19), R.deBrt(2026, 10, 26)), 6);
});

test('janela de leads: entraram, vendas, perdidos, faturamento e conversão', () => {
  const ls = [L(1, { created_at: new Date(qua12 - D).toISOString(), status: 'concluido', valor_pago: 500, closed_at: new Date(qua12 - H).toISOString() }), L(2, { created_at: new Date(qua12 - 20 * D).toISOString(), status: 'perdido', closed_at: new Date(qua12 - 2 * H).toISOString() }), L(3, { created_at: new Date(qua12 - 30 * D).toISOString() })];
  const j = R.janela(ls, qua12 - 7 * D, qua12 + 1);
  assert.deepEqual([j.leads, j.vendas, j.perdidos, j.faturamento, j.ticket, j.conversao], [1, 1, 1, 500, 500, 50]);
});

test('insights do dono e texto do WhatsApp', () => {
  const ins = R.insightsDono({ semana: { faturamento: 1000, leads: 3, vendas: 3, perdidos: 3, conversao: 10 }, anterior: { faturamento: 3000, leads: 10, conversao: 40 }, mes: { ritmo: { risco: true, projecao: 20000, meta: 40000, por_dia_util: 1500 } },
    conversas: { esperando: 2, maior_espera_h: 7 }, orcamentos: { parados: 1, valor_parado: 900 }, patio: { prontos: 1, entregues_sem_fechar: 2 }, avaliacoes: { detratores: 1 }, ads: { pior: { campanha: 'X', gasto: 80, ganhos: 0 }, alertas: 1 }, qualidade: { sem_dono: 4 } });
  const t = ins.map(i => i.texto).join('\n');
  assert.match(t, /Faturamento da semana caiu 67%/); assert.match(t, /Entraram 3 leads/); assert.match(t, /Conversão caiu/); assert.match(t, /No ritmo atual/); assert.match(t, /2 clientes esperando resposta \(o mais antigo há 7 h\)/);
  assert.match(t, /1 orçamento sem resposta/); assert.match(t, /1 carro pronto esperando/); assert.match(t, /2 carros entregues/); assert.match(t, /avaliação com nota 3/); assert.match(t, /campanha "X"/); assert.match(t, /4 leads abertos sem responsável/);
  assert.deepEqual(R.insightsDono({}), []);
  const txt = R.textoWhatsAppDono({ mes: { ritmo: { meta: 40000, realizado: 10000, pct: 25, projecao: 22000 } }, semana: { leads: 3, vendas: 1, faturamento: 1000, conversao: 10 }, patio: { no_patio: 4, prontos: 1, entregues_hoje: 0 }, orcamentos: { enviados: 2, valor_enviado: 1800 }, avaliacoes: { media: 4.5, total: 4 }, insights: ins }, new Date('2026-10-21T15:00:00Z'));
  assert.match(txt, /^🏎 \*IndyCar · resumo 21\/10\*/); assert.match(txt, /\*Atenção:\*/); assert.ok(txt.split('\n').filter(l => l.startsWith('• ')).length <= 4); assert.ok(!/prezad|veículo/i.test(txt));
  assert.match(R.textoWhatsAppDono({ mes: { faturamento: 500, vendas: 1 } }), /1 serviço\./);
});
