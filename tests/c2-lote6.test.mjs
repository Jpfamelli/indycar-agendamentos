// Agenda (rodada 7 / C2, lote 6): relatórios do dono — ocupação, faltas, por consultor, origem.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const R = await import('../relatorios.js');
const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const G = ID(102), L = ID(101);
const CONS = [{ id: L, nome: 'Leonardo', ativo: true }, { id: G, nome: 'Gabriel', ativo: true }];
const SERV = [{ nome: 'Troca de óleo', duracao_min: 60 }, { nome: 'Freios', duracao_min: 90 }];
const arr = (v) => JSON.parse(JSON.stringify(v));
const ag = (o) => ({ servico: 'Troca de óleo', origem: 'Google', valor: 0, confirmado: false, ...o });
const LISTA = [
  ag({ data: '2026-10-26', hora: '08:00', consultor_id: G, status: 'concluido', valor: 200, confirmado: true }),
  ag({ data: '2026-10-26', hora: '09:00', consultor_id: L, status: 'concluido', valor: 400, servico: 'Freios' }),
  ag({ data: '2026-10-26', hora: '10:00', consultor_id: G, status: 'nao_veio', motivo_falta: 'esqueceu', origem: 'Instagram' }),
  ag({ data: '2026-10-27', hora: '08:00', consultor_id: G, status: 'nao_veio', origem: 'Instagram' }),
  ag({ data: '2026-10-27', hora: '09:00', consultor_id: L, status: 'compareceu', servico: 'Freios', confirmado: true }),
  ag({ data: '2026-10-27', hora: '17:00', consultor_id: L, status: 'aguardando' }),
  ag({ data: '2026-10-28', hora: '08:00', consultor_id: G, status: 'cancelado' }),
  ag({ data: '2026-10-28', hora: '10:00', consultor_id: L, status: 'confirmado', confirmado: true }),
  ag({ data: '2026-10-29', hora: '09:00', consultor_id: L, status: 'concluido', valor: 999 }),           // fora do período
];
const REL = R.relatorioDoDono({ lista: LISTA, consultores: CONS, servicos: SERV, inicio: '2026-10-26', fim: '2026-10-28' });

test('diasDoPeriodo e periodoPedido: inclusivo, troca datas invertidas, limita a 180 dias, lixo vira o padrão', () => {
  assert.deepEqual(arr(R.diasDoPeriodo('2026-10-26', '2026-10-28')), ['2026-10-26', '2026-10-27', '2026-10-28']);
  assert.deepEqual(arr(R.diasDoPeriodo('2026-10-28', '2026-10-26')), []);
  assert.deepEqual(arr(R.diasDoPeriodo('x', 'y')), []);
  assert.deepEqual(arr(R.periodoPedido({}, '2026-10-25')), { inicio: '2026-09-26', fim: '2026-10-25', dias: 30 });
  assert.deepEqual(arr(R.periodoPedido({ inicio: '2026-10-28', fim: '2026-10-26' }, '2026-10-30')), { inicio: '2026-10-26', fim: '2026-10-28', dias: 3 });
  const longo = R.periodoPedido({ inicio: '2020-01-01', fim: '2026-10-25' }, '2026-10-25');
  assert.equal(longo.dias, 180); assert.equal(longo.fim, '2026-10-25');
  assert.equal(R.periodoPedido({ inicio: "2026-10-01'; drop", fim: '<script>' }, '2026-10-25').fim, '2026-10-25');
});
test('minutosDoHorario: usa a duração do serviço e corta no fechamento das 17h30', () => {
  assert.equal(R.minutosDoHorario({ hora: '08:00', servico: 'Freios' }, SERV), 90);
  assert.equal(R.minutosDoHorario({ hora: '17:00', servico: 'Troca de óleo' }, SERV), 30);
  assert.equal(R.minutosDoHorario({ hora: '18:30', servico: 'Freios' }, SERV), 0);
  assert.equal(R.minutosDoHorario({ hora: 'lixo' }, SERV), 0); assert.equal(R.minutosDoHorario(null, SERV), 0);
});
test('totais: marcados sem cancelados, taxa de falta sobre quem já teve desfecho, fechado e ticket', () => {
  const t = REL.totais;
  assert.equal(t.marcados, 7); assert.equal(t.cancelados, 1); assert.equal(t.vieram, 3); assert.equal(t.faltas, 2);
  assert.equal(t.taxa_falta, 40); assert.equal(t.taxa_comparecimento, 60);
  assert.equal(t.concluidos, 2); assert.equal(t.faturado, 600); assert.equal(t.ticket_medio, 300);
  assert.equal(t.confirmados, 3); assert.equal(t.pct_confirmados, 42.9);
  assert.equal(t.dias_abertos, 3); assert.equal(t.consultores_ativos, 2);
});
test('ocupação: minutos ocupados sobre minutos de expediente × consultores; faltas à parte', () => {
  const t = REL.totais;
  assert.equal(t.ocupacao_pct, 9.6); assert.equal(t.horas_perdidas_por_faltas, 2); assert.equal(t.perdido_por_faltas_pct, 3.5);
  const seg = REL.porDia.find((d) => d.data === '2026-10-26');
  assert.deepEqual(arr({ o: seg.ocupado_min, f: seg.faltas_min, c: seg.capacidade_min, p: seg.pct, m: seg.marcados }), { o: 150, f: 60, c: 1140, p: 13.2, m: 3 });
  assert.equal(REL.porDia.find((d) => d.data === '2026-10-27').ocupado_min, 120, '17:00 de 60 min cortado em 30');
  assert.equal(REL.melhorDia.data, '2026-10-26'); assert.equal(REL.piorDia.data, '2026-10-28');
});
test('por consultor: marcados, faltas, taxa, ocupação e fechado', () => {
  const g = REL.porConsultor.find((c) => c.consultor === 'Gabriel'), l = REL.porConsultor.find((c) => c.consultor === 'Leonardo');
  assert.deepEqual(arr({ m: g.marcados, v: g.vieram, f: g.faltas, t: g.taxa_falta, p: g.pct }), { m: 3, v: 1, f: 2, t: 66.7, p: 3.5 });
  assert.deepEqual(arr({ m: l.marcados, v: l.vieram, f: l.faltas, t: l.taxa_falta, p: l.pct, fat: l.faturado }), { m: 4, v: 2, f: 0, t: 0, p: 15.8, fat: 400 });
  assert.equal(REL.porConsultor[0].consultor, 'Leonardo', 'o que mais marcou vem primeiro');
});
test('faltas: motivo, sem motivo, confirmado × não confirmado, hora e dia da semana', () => {
  const f = REL.faltas;
  assert.equal(f.total, 2); assert.equal(f.porMotivo.find((m) => m.id === 'esqueceu').n, 1); assert.equal(f.semMotivo, 1);
  assert.equal(f.taxa_confirmados, 0); assert.equal(f.taxa_sem_confirmar, 66.7);
  assert.deepEqual(arr(f.porHora), [{ hora: '08h', n: 1 }, { hora: '10h', n: 1 }]);
  assert.equal(f.porDiaSemana.find((d) => d.dia === 'seg').faltas, 1);
});
test('hora do dia e origem: só quem segurou a casa; origem com taxa de falta', () => {
  const h = (x) => REL.porHora.find((p) => p.hora === x).marcados;
  assert.deepEqual([h('08h'), h('09h'), h('10h'), h('17h')], [1, 2, 1, 1]);
  const ig = REL.porOrigem.find((o) => o.origem === 'Instagram'), go = REL.porOrigem.find((o) => o.origem === 'Google');
  assert.deepEqual(arr({ m: ig.marcados, f: ig.faltas, t: ig.taxa_falta }), { m: 2, f: 2, t: 100 });
  assert.deepEqual(arr({ m: go.marcados, t: go.taxa_falta }), { m: 5, t: 0 });
});
test('destaques: só frases que os números sustentam', () => {
  const d = REL.destaques.join(' | ');
  assert.match(d, /agenda ficou 9\.6% ocupada/); assert.match(d, /Faltaram 2 \(40% de quem já teve desfecho\)/); assert.match(d, /Quem confirmou faltou 0%; quem não confirmou, 66\.7%/);
  assert.match(d, /Fechou R\$\s?600,00 em 2 serviços/);
  assert.deepEqual(arr(R.relatorioDoDono({ lista: [], consultores: CONS, inicio: '2026-10-26', fim: '2026-10-28' }).destaques), ['Nenhum horário marcado neste período.']);
});
test('comparar períodos e texto do resumo para o WhatsApp do dono', () => {
  const ant = R.relatorioDoDono({ lista: LISTA.slice(0, 3), consultores: CONS, servicos: SERV, inicio: '2026-10-26', fim: '2026-10-28' }).totais;
  const c = R.compararPeriodos(REL.totais, ant);
  assert.equal(c.marcados, 4); assert.equal(c.faltas, 1); assert.equal(R.compararPeriodos({ marcados: 1 }, {}).taxa_falta, null);
  const txt = R.textoDoResumo(REL);
  assert.match(txt, /^\*IndyCar · agenda de 26\/10 a 28\/10\*/); assert.match(txt, /faltaram 2 \(40%\)/); assert.match(txt, /• Gabriel: 3 horários/); assert.match(txt, /→ /);
  assert.ok(txt.length < 1200);
});
test('entrada hostil: lista com lixo, hora torta, sem consultor e consultor desconhecido não quebram', () => {
  const lixo = [null, undefined, 5, { data: '2026-10-26' }, { data: '2026-10-26', hora: 'xx', status: 'nao_veio', servico: null }, ag({ data: '2026-10-26', hora: '09:00', status: 'concluido', valor: '<b>', consultor_id: ID(555), consultor_nome: 'Fulano' }), ag({ data: '2026-10-26', hora: '09:30', status: 'concluido', valor: -50 })];
  const r = R.relatorioDoDono({ lista: lixo, consultores: [...CONS, null, { id: null }], servicos: null, inicio: '2026-10-26', fim: '2026-10-26' });
  assert.ok(r.totais.marcados >= 3); assert.equal(r.totais.faturado, 0);
  assert.ok(r.porConsultor.some((c) => c.consultor === 'Fulano')); assert.ok(r.porConsultor.some((c) => c.consultor === 'Sem consultor'));
  assert.doesNotThrow(() => R.textoDoResumo(r));
  assert.equal(R.relatorioDoDono({ lista: LISTA, consultores: CONS, inicio: 'x', fim: 'y' }).totais.marcados, 0);
  const domingo = R.relatorioDoDono({ lista: [ag({ data: '2026-10-25', hora: '09:00', status: 'concluido' })], consultores: CONS, inicio: '2026-10-25', fim: '2026-10-25' });
  assert.equal(domingo.totais.dias_abertos, 0); assert.equal(domingo.totais.ocupacao_pct, null);
});

/* ------------------------------ rota por HTTP ------------------------------ */
const PESSOAS = {
  gestor: { id: ID(902), email: 'g@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'a@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'f@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base; const pedidos = [];
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  listarAgendamentos: async (f) => { pedidos.push(f); return LISTA.filter((a) => a.data >= f.de && a.data <= f.ate); },
  listarConsultores: async () => CONS, listarServicos: async () => SERV,
};
before(async () => {
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
async function chamar(quem, rota) {
  const r = await fetch(base + rota, { headers: quem ? { Authorization: `Bearer ${quem}` } : {} });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* html */ }
  return { status: r.status, j };
}
test('GET /api/relatorios/dono: gestor recebe o relatório com o período anterior e o texto; atendente e recepção não', async () => {
  pedidos.length = 0;
  const r = await chamar('gestor', '/api/relatorios/dono?inicio=2026-10-26&fim=2026-10-28');
  assert.equal(r.status, 200); assert.equal(r.j.totais.marcados, 7); assert.equal(r.j.periodo.dias, 3);
  assert.deepEqual(arr(r.j.anterior), { inicio: '2026-10-23', fim: '2026-10-25', totais: r.j.anterior.totais });
  assert.equal(r.j.comparacao.marcados, 7); assert.match(r.j.texto, /agenda de 26\/10 a 28\/10/);
  assert.equal(pedidos.length, 2);
  assert.equal((await chamar('atendente', '/api/relatorios/dono')).status, 403);
  assert.equal((await chamar('agenda', '/api/relatorios/dono')).status, 403);
  assert.equal((await chamar(null, '/api/relatorios/dono')).status, 401);
});
test('GET /api/relatorios/dono: período torto cai no padrão sem quebrar e nunca passa de 180 dias', async () => {
  pedidos.length = 0;
  const r = await chamar('gestor', "/api/relatorios/dono?inicio='%3Bdrop&fim=2020-02-30");
  assert.equal(r.status, 200); assert.equal(r.j.periodo.dias, 30);
  const g = await chamar('gestor', '/api/relatorios/dono?inicio=2000-01-01&fim=2026-10-25');
  assert.equal(g.j.periodo.dias, 180);
});
