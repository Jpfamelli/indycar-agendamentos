// Agenda (rodada 7 / C2, lote 3): motivo da falta, painel de confirmação, recado de reagendar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const F = await import('../faltas.js');
const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ctx = vm.createContext({ globalThis: null, URL });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada7.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R7Puro;
const arr = (v) => JSON.parse(JSON.stringify(v));

/* ------------------------------ faltas.js ------------------------------ */
test('motivoDeFaltaValido: só a lista fechada (e vazio para limpar)', () => {
  for (const m of F.MOTIVOS_FALTA) assert.ok(F.motivoDeFaltaValido(m.id), m.id);
  assert.ok(F.motivoDeFaltaValido('')); assert.ok(F.motivoDeFaltaValido(null));
  for (const ruim of ['hack', "esqueceu'; drop table agendamentos;--", 'ESQUECEU', 5, {}, [], undefined]) assert.ok(!F.motivoDeFaltaValido(ruim), String(ruim));
});
test('aceitaMotivo: só quem faltou ou cancelou', () => {
  assert.ok(F.aceitaMotivo({ status: 'nao_veio' })); assert.ok(F.aceitaMotivo({ status: 'cancelado' }));
  assert.ok(!F.aceitaMotivo({ status: 'aguardando' })); assert.ok(!F.aceitaMotivo({ status: 'concluido' })); assert.ok(!F.aceitaMotivo(null));
});
test('o navegador e o servidor falam dos mesmos motivos (sem divergir)', () => {
  assert.deepEqual(arr(P.MOTIVOS), arr(F.MOTIVOS_FALTA));
  for (const m of F.MOTIVOS_FALTA) assert.equal(P.rotuloDoMotivo(m.id), F.rotuloDoMotivo(m.id));
});
test('semConfirmacaoDoDia: vivo, sem confirmar, em ordem de hora; confirmou e quem já chegou saem', () => {
  const l = [
    { id: 'a', data: '2026-10-26', hora: '11:00', status: 'aguardando' },
    { id: 'b', data: '2026-10-26', hora: '08:00', status: 'aguardando', confirmado: false },
    { id: 'c', data: '2026-10-26', hora: '09:00', status: 'confirmado', confirmado: true },
    { id: 'd', data: '2026-10-26', hora: '10:00', status: 'aguardando', confirmacao: { resposta: 'confirmou' } },
    { id: 'e', data: '2026-10-26', hora: '10:30', status: 'compareceu', compareceu: 1 },
    { id: 'f', data: '2026-10-27', hora: '08:00', status: 'aguardando' },
    { id: 'g', data: '2026-10-26', hora: '12:00', status: 'cancelado' },
  ];
  const ids = (x) => arr(x.map((a) => a.id));
  assert.deepEqual(ids(F.semConfirmacaoDoDia(l, '2026-10-26')), ['b', 'a']);
  assert.deepEqual(ids(P.semConfirmacaoDoDia(l, '2026-10-26')), ['b', 'a'], 'o navegador calcula igual');
  assert.deepEqual(arr(F.semConfirmacaoDoDia(null, '2026-10-26')), []);
});
test('placarDeConfirmacao: confirmados, pendentes, quem pediu remarcar e quem avisou que não vem', () => {
  const l = [
    { data: '2026-10-26', status: 'confirmado', confirmado: true },
    { data: '2026-10-26', status: 'aguardando', confirmacao: { resposta: 'confirmou' } },
    { data: '2026-10-26', status: 'aguardando', confirmacao: { resposta: 'remarcar' } },
    { data: '2026-10-26', status: 'aguardando', confirmacao: { resposta: 'nao_vem' } },
    { data: '2026-10-26', status: 'aguardando' },
    { data: '2026-10-26', status: 'cancelado' },
  ];
  const esperado = { total: 5, confirmados: 2, pendentes: 3, pediramRemarcar: 1, naoVao: 1 };
  assert.deepEqual(arr(F.placarDeConfirmacao(l, '2026-10-26')), esperado);
  assert.deepEqual(arr(P.placarDeConfirmacao(l, '2026-10-26')), esperado);
});
test('textoDeReagendar: primeiro nome limpo, serviço e, quando há, o horário sugerido', () => {
  for (const f of [F.textoDeReagendar, P.textoDeReagendar]) {
    assert.match(f({ nome: 'ana souza', servico: 'Revisão' }), /^Oi Ana! .*falta no horário de Revisão\. Quer que a gente remarque/);
    assert.match(f({ nome: 'ana', servico: 'Revisão', sugestao: { rotulo: 'ter 27/10', hora: '09:30' } }), /remarcar para ter 27\/10 às 09:30\?/);
    assert.match(f({ nome: '<b>' }), /^Oi! /);
    assert.ok(!/undefined|null/.test(f({})));
  }
  assert.equal(F.textoDeReagendar({ nome: 'ana', servico: 'x', sugestao: { rotulo: 'ter', hora: '09:00' } }), P.textoDeReagendar({ nome: 'ana', servico: 'x', sugestao: { rotulo: 'ter', hora: '09:00' } }));
});
test('textoDeConfirmar: diz "hoje" e "amanhã" quando é o caso e pede SIM', () => {
  assert.match(P.textoDeConfirmar({ nome: 'Joao', servico: 'Alinhamento', data: '2026-10-26', hora: '09:00:00', hoje: '2026-10-25' }), /^Oi Joao! .*Alinhamento está marcado para amanhã às 09:00\..*SIM/);
  assert.match(P.textoDeConfirmar({ nome: 'Joao', data: '2026-10-25', hora: '09:00', hoje: '2026-10-25' }), /marcado para hoje às 09:00/);
  assert.match(P.textoDeConfirmar({ nome: 'Joao', data: '2026-10-29', hora: '09:00', hoje: '2026-10-25' }), /para qui 29\/10 às 09:00/);
});
test('resumoDeFaltas: taxa, motivos, dia da semana, hora, serviço, consultor e confirmado x não confirmado', () => {
  const l = [
    { data: '2026-10-26', hora: '09:00', status: 'nao_veio', motivo_falta: 'esqueceu', servico: 'Óleo', consultor_nome: 'Gabriel', confirmado: false },
    { data: '2026-10-26', hora: '09:30', status: 'nao_veio', servico: 'Óleo', consultor_nome: 'Gabriel', confirmado: false },
    { data: '2026-10-26', hora: '10:00', status: 'concluido', servico: 'Revisão', consultor_nome: 'Gabriel', confirmado: true },
    { data: '2026-10-27', hora: '09:00', status: 'concluido', servico: 'Revisão', consultor_nome: 'Leonardo', confirmacao: { resposta: 'confirmou' } },
    { data: '2026-10-27', hora: '10:00', status: 'cancelado', servico: 'Revisão', consultor_nome: 'Leonardo' },
    { data: '2026-11-30', hora: '10:00', status: 'nao_veio', servico: 'Revisão' },
  ];
  const r = F.resumoDeFaltas(l, { inicio: '2026-10-26', fim: '2026-10-31' });
  assert.equal(r.marcados, 4, 'cancelado não conta como marcado'); assert.equal(r.faltas, 2); assert.equal(r.taxa, 50);
  assert.equal(r.porMotivo.find((m) => m.id === 'esqueceu').n, 1); assert.equal(r.semMotivo, 1);
  assert.equal(r.porDiaSemana.find((d) => d.dia === 'seg').faltas, 2);
  assert.deepEqual(arr(r.porHora), [{ hora: '09h', n: 2 }]);
  assert.deepEqual(arr(r.porConsultor.find((c) => c.consultor === 'Gabriel')), { consultor: 'Gabriel', marcados: 3, faltas: 2, taxa: 66.7 });
  assert.equal(r.faltaConfirmados, 0); assert.equal(r.faltaSemConfirmar, 100);
  assert.deepEqual(arr(F.resumoDeFaltas(null).porHora), []);
});

/* ------------------------------ rota por HTTP ------------------------------ */
const PESSOAS = {
  gestor: { id: ID(902), email: 'g@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'f@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base; const auditoria = []; const gravados = [];
const AGS = {
  [ID(11)]: { id: ID(11), cliente_nome: 'Ana', status: 'nao_veio', data: '2026-10-25', hora: '09:00' },
  [ID(12)]: { id: ID(12), cliente_nome: 'Bia', status: 'aguardando', data: '2026-10-25', hora: '10:00' },
  [ID(13)]: { id: ID(13), cliente_nome: 'Caio', status: 'cancelado', data: '2026-10-25', hora: '11:00' },
};
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  obterAgendamento: async (id) => (AGS[id] ? { ...AGS[id] } : null),
  atualizarAgendamento: async (id, c) => { gravados.push([id, c]); return { ...AGS[id], ...c }; },
  auditar: async (...a) => { auditoria.push(a); },
};
before(async () => {
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
async function chamar(quem, metodo, rota, corpo) {
  const r = await fetch(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* html */ }
  return { status: r.status, j };
}

test('PATCH motivo-falta: grava, devolve o rótulo e deixa na auditoria', async () => {
  gravados.length = 0; auditoria.length = 0;
  const r = await chamar('gestor', 'PATCH', `/api/agendamentos/${ID(11)}/motivo-falta`, { motivo: 'esqueceu' });
  assert.equal(r.status, 200); assert.equal(r.j.motivo_falta, 'esqueceu'); assert.equal(r.j.rotulo, 'Esqueceu');
  assert.deepEqual(arr(gravados), [[ID(11), { motivo_falta: 'esqueceu' }]]);
  assert.equal(auditoria[0][1], 'motivo_falta');
});
test('PATCH motivo-falta: vazio limpa o motivo', async () => {
  gravados.length = 0;
  const r = await chamar('gestor', 'PATCH', `/api/agendamentos/${ID(11)}/motivo-falta`, { motivo: '' });
  assert.equal(r.status, 200); assert.deepEqual(arr(gravados), [[ID(11), { motivo_falta: null }]]);
});
test('PATCH motivo-falta: motivo fora da lista, texto hostil e quem não faltou são recusados', async () => {
  gravados.length = 0;
  assert.equal((await chamar('gestor', 'PATCH', `/api/agendamentos/${ID(11)}/motivo-falta`, { motivo: 'hack' })).status, 400);
  assert.equal((await chamar('gestor', 'PATCH', `/api/agendamentos/${ID(11)}/motivo-falta`, { motivo: "x'); drop table agendamentos;--" })).status, 400);
  assert.equal((await chamar('gestor', 'PATCH', `/api/agendamentos/${ID(12)}/motivo-falta`, { motivo: 'esqueceu' })).status, 409);
  assert.equal((await chamar('gestor', 'PATCH', `/api/agendamentos/${ID(13)}/motivo-falta`, { motivo: 'imprevisto' })).status, 200, 'cancelado também aceita');
  assert.equal((await chamar('gestor', 'PATCH', `/api/agendamentos/${ID(99)}/motivo-falta`, { motivo: 'esqueceu' })).status, 404);
  assert.equal(gravados.length, 1, 'só o cancelado gravou');
});
test('PATCH motivo-falta: sem login não passa; a recepção (papel agenda) pode anotar', async () => {
  assert.equal((await chamar(null, 'PATCH', `/api/agendamentos/${ID(11)}/motivo-falta`, { motivo: 'esqueceu' })).status, 401);
  assert.equal((await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(11)}/motivo-falta`, { motivo: 'sem_resposta' })).status, 200);
});
