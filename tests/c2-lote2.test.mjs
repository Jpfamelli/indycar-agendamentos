// Agenda (rodada 7 / C2, lote 2): Mover com horários livres em botões, atalhos do Remarcar e "quem cabe aqui" (encaixe).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const { esperaQueServePara, livresDoDia } = await import('../horarios.js');
const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ctx = vm.createContext({ globalThis: null, URL });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada7.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R7Puro;
const arr = (v) => JSON.parse(JSON.stringify(v));

/* ------------------------------ botões de horário livre ------------------------------ */
const GAB = ID(102), LEO = ID(101);
const CONS = [{ id: LEO, nome: 'Leonardo' }, { id: GAB, nome: 'Gabriel' }];
const HORARIOS = [
  { hora: '08:00', livres: 2, consultores_livres: [LEO, GAB] }, { hora: '08:30', livres: 1, consultores_livres: [GAB] },
  { hora: '09:00', livres: 1, consultores_livres: [LEO] }, { hora: '10:30', livres: 2, consultores_livres: [LEO, GAB] }, { hora: '15:00', livres: 1, consultores_livres: [GAB] },
];
test('botoesDeHorario: uma dupla hora+consultor por botão, em ordem de relógio, com o mais perto marcado', () => {
  const r = P.botoesDeHorario(HORARIOS, { original: { hora: '10:00', consultor_id: GAB }, consultores: CONS });
  assert.equal(r.total, 7);
  assert.deepEqual(arr(r.botoes.map((b) => `${b.hora}/${b.consultor_nome}`)), ['08:00/Gabriel', '08:00/Leonardo', '08:30/Gabriel', '09:00/Leonardo', '10:30/Gabriel', '10:30/Leonardo', '15:00/Gabriel']);
  const perto = r.botoes.filter((b) => b.perto);
  assert.equal(perto.length, 1);
  assert.equal(`${perto[0].hora}/${perto[0].consultor_nome}`, '10:30/Gabriel', 'o mais perto das 10:00 e do mesmo consultor');
  const horas = r.botoes.map((b) => b.hora);
  assert.deepEqual(arr(horas), [...horas].sort());
});
test('botoesDeHorario: "só o mesmo consultor" filtra; o horário em que o cartão já está não vira botão', () => {
  const so = P.botoesDeHorario(HORARIOS, { original: { hora: '08:00', consultor_id: GAB }, consultores: CONS, soMesmo: true });
  assert.ok(so.botoes.every((b) => b.consultor_id === GAB));
  assert.ok(!so.botoes.some((b) => b.hora === '08:00' && b.consultor_id === GAB), 'a própria célula não aparece');
  assert.ok(so.botoes.some((b) => b.hora === '08:00') === false);
  const outroDia = P.botoesDeHorario(HORARIOS, { original: { hora: '08:00', consultor_id: GAB }, consultores: CONS, soMesmo: true, excluirOriginal: false });
  assert.ok(outroDia.botoes.some((b) => b.hora === '08:00' && b.consultor_id === GAB), 'em outro dia a mesma hora é um destino válido');
});
test('botoesDeHorario: limite de botões mantém o mais perto; vazio e lixo não quebram', () => {
  const muitos = Array.from({ length: 20 }, (_, i) => ({ hora: `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, livres: 1, consultores_livres: [GAB] }));
  const r = P.botoesDeHorario(muitos, { original: { hora: '17:00', consultor_id: GAB }, consultores: CONS, max: 5 });
  assert.equal(r.botoes.length, 5); assert.equal(r.total, 19, 'a hora do próprio cartão (17:00) não conta');
  assert.ok(r.botoes.some((b) => b.perto));
  assert.deepEqual(arr(P.botoesDeHorario([], {})), { botoes: [], total: 0 });
  assert.deepEqual(arr(P.botoesDeHorario(null, null)), { botoes: [], total: 0 });
});
test('botoesDeHorario: vaga sem consultor nomeado vira um botão só com a hora', () => {
  const r = P.botoesDeHorario([{ hora: '11:00', livres: 1, consultores_livres: [] }], { original: { hora: '09:00' }, consultores: CONS });
  assert.equal(r.botoes.length, 1); assert.equal(r.botoes[0].consultor_id, null);
  assert.equal(P.rotuloDoBotao(r.botoes[0]), '11:00');
  assert.equal(P.rotuloDoBotao({ hora: '10:30', consultor_nome: 'gabriel souza' }), '10:30 · Gabriel');
});
test('botoesDeDias: só dias com vaga, sem o dia atual, com rótulo curto', () => {
  const dias = [{ data: '2026-10-26', total: 3 }, { data: '2026-10-27', total: 0 }, { data: '2026-10-28', total: 5 }, { data: 'lixo', total: 9 }, null];
  assert.deepEqual(arr(P.botoesDeDias(dias, '2026-10-26')), [{ data: '2026-10-28', rotulo: 'qua 28/10', total: 5 }]);
  assert.deepEqual(arr(P.botoesDeDias(null, '2026-10-26')), []);
});

/* ------------------------------ atalhos do Remarcar ------------------------------ */
test('proximoDiaAberto pula domingo; atalhosDeRemarcar nunca devolve domingo nem o passado', () => {
  assert.equal(P.proximoDiaAberto('2026-10-24'), '2026-10-26', 'sábado -> segunda (domingo fechado)');
  assert.equal(P.proximoDiaAberto('2026-10-23', 2), '2026-10-26');
  assert.equal(P.proximoDiaAberto('lixo'), null);
  const a = arr(P.atalhosDeRemarcar('2026-10-22', '2026-10-22'));
  assert.deepEqual(a.map((x) => x.data), ['2026-10-23', '2026-10-24', '2026-10-29']);
  assert.deepEqual(a.map((x) => x.rotulo), ['Amanhã', 'Depois de amanhã', 'Semana que vem']);
  for (const x of arr(P.atalhosDeRemarcar('2026-10-23', '2026-10-22'))) assert.notEqual(new Date(x.data + 'T12:00:00Z').getUTCDay(), 0);
  assert.deepEqual(arr(P.atalhosDeRemarcar('x', 'y')), []);
});
test('atalhosDeRemarcar: horário de um dia passado usa hoje como base; a semana que vem sai de domingo para segunda', () => {
  const a = arr(P.atalhosDeRemarcar('2026-10-01', '2026-10-22'));
  assert.equal(a.find((x) => x.rotulo === 'Semana que vem').data, '2026-10-29');
  const b = arr(P.atalhosDeRemarcar('2026-10-25', '2026-10-24'));
  assert.ok(b.every((x) => new Date(x.data + 'T12:00:00Z').getUTCDay() !== 0));
});
test('textoDeOferta: oferece o horário com nome, serviço, dia, hora e consultor', () => {
  const t = P.textoDeOferta({ cliente_nome: 'joana ribeiro', servico: 'Troca de óleo' }, '2026-10-27', '10:30', 'Gabriel Souza');
  assert.match(t, /^Oi Joana! Aqui é da IndyCar/);
  assert.match(t, /Troca de óleo: ter 27\/10 às 10:30 com Gabriel\./);
  assert.match(P.textoDeOferta({ cliente_nome: '' }, '2026-10-27', '10:30', ''), /^Olá! .* o seu serviço: ter 27\/10 às 10:30\. Posso/);
});

/* ------------------------------ esperaQueServePara (horarios.js) ------------------------------ */
const BASE_DIA = (extra = {}) => (servico) => livresDoDia({ data: '2026-10-27', agora: { data: '2026-10-25', min: 600 }, agendamentos: [], consultores: [{ id: LEO, ativo: true }, { id: GAB, ativo: true }],
  duracao: /revis/i.test(servico || '') ? 300 : 45, janelas: [], ...extra });
const E = (o) => ({ status: 'aberta', created_at: '2026-10-20T10:00:00Z', preferencia: 'Qualquer horário', de: null, ate: null, servico: 'Troca de óleo', cliente_nome: 'X', ...o });
test('esperaQueServePara: respeita preferência, janela de datas e serviço que cabe; quem espera há mais tempo vem primeiro', () => {
  const lista = [E({ id: 'a', preferencia: 'Tarde', created_at: '2026-10-21T10:00:00Z' }), E({ id: 'b', preferencia: 'Manhã', created_at: '2026-10-22T10:00:00Z' }),
    E({ id: 'c', preferencia: 'Qualquer horário', created_at: '2026-10-19T10:00:00Z' }), E({ id: 'd', de: '2026-10-30' }), E({ id: 'e', ate: '2026-10-26' }),
    E({ id: 'f', status: 'agendada' }), E({ id: 'g', servico: 'Revisão de motor completa' })];
  const r = esperaQueServePara({ lista, data: '2026-10-27', hora: '10:30', diaDoServico: BASE_DIA(), hojeIso: '2026-10-25' });
  assert.deepEqual(r.map((x) => x.id), ['c', 'g', 'b']);
  assert.equal(r[0].dias_na_espera, 6);
  const tarde = esperaQueServePara({ lista, data: '2026-10-27', hora: '15:00', diaDoServico: BASE_DIA(), hojeIso: '2026-10-25' });
  assert.deepEqual(tarde.map((x) => x.id), ['c', 'a']);
  const cedo = esperaQueServePara({ lista, data: '2026-10-27', hora: '08:00', diaDoServico: BASE_DIA(), hojeIso: '2026-10-25' });
  assert.ok(cedo.some((x) => x.id === 'g'), 'a revisão de 5 h cabe às 8h');
  const noFim = esperaQueServePara({ lista, data: '2026-10-27', hora: '15:00', diaDoServico: BASE_DIA(), hojeIso: '2026-10-25' });
  assert.ok(!noFim.some((x) => x.id === 'g'), 'a revisão de 5 h não cabe às 15h (passa das 17h30)');
});
test('esperaQueServePara: consultor ocupado, domingo, hora torta e função ausente não devolvem ninguém', () => {
  const lista = [E({ id: 'a' })];
  const ocupado = (servico) => livresDoDia({ data: '2026-10-27', agora: { data: '2026-10-25', min: 600 }, agendamentos: [{ id: 'x', data: '2026-10-27', hora: '10:30', status: 'aguardando', consultor_id: GAB }],
    consultores: [{ id: LEO, ativo: true }, { id: GAB, ativo: true }], duracao: 45, janelas: [] });
  assert.equal(esperaQueServePara({ lista, data: '2026-10-27', hora: '10:30', consultor_id: GAB, diaDoServico: ocupado }).length, 0);
  assert.equal(esperaQueServePara({ lista, data: '2026-10-27', hora: '10:30', consultor_id: LEO, diaDoServico: ocupado }).length, 1);
  assert.equal(esperaQueServePara({ lista, data: '2026-10-25', hora: '10:30', diaDoServico: (s) => livresDoDia({ data: '2026-10-25', agora: { data: '2026-10-25', min: 0 }, consultores: [{ id: LEO, ativo: true }], duracao: 45 }) }).length, 0, 'domingo fechado');
  assert.deepEqual(esperaQueServePara({ lista, data: '2026-10-27', hora: '25:99', diaDoServico: BASE_DIA() }), []);
  assert.deepEqual(esperaQueServePara({ lista, data: 'lixo', hora: '10:30', diaDoServico: BASE_DIA() }), []);
  assert.deepEqual(esperaQueServePara({ lista, data: '2026-10-27', hora: '10:30' }), []);
  assert.deepEqual(esperaQueServePara({ lista: null, data: '2026-10-27', hora: '10:30', diaDoServico: BASE_DIA() }), []);
});
test('esperaQueServePara: calcula o dia de cada serviço uma vez só', () => {
  let chamadas = 0;
  const lista = [E({ id: 'a' }), E({ id: 'b' }), E({ id: 'c', servico: 'Freios' })];
  esperaQueServePara({ lista, data: '2026-10-27', hora: '10:30', diaDoServico: (s) => { chamadas++; return BASE_DIA()(s); } });
  assert.equal(chamadas, 2);
});

/* ------------------------------ rota por HTTP ------------------------------ */
const PESSOAS = {
  atendente: { id: ID(903), email: 'a@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
  gestor: { id: ID(902), email: 'g@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'f@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base; const pedidos = [];
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  esperaParaOHorario: async (p) => { pedidos.push(p); return { itens: [{ id: ID(5), cliente_nome: 'Joana', servico: 'Troca de óleo', dias_na_espera: 2 }] }; },
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
test('GET /api/espera/cabe: sem login 401, recepção 403, atendente e gestor 200', async () => {
  const rota = '/api/espera/cabe?data=2026-10-27&hora=10:30';
  assert.equal((await chamar(null, rota)).status, 401);
  assert.equal((await chamar('agenda', rota)).status, 403);
  for (const q of ['atendente', 'gestor']) { const r = await chamar(q, rota); assert.equal(r.status, 200, q); assert.equal(r.j.itens[0].cliente_nome, 'Joana'); }
});
test('GET /api/espera/cabe: data e hora obrigatórias e limpas; consultor só como uuid', async () => {
  pedidos.length = 0;
  for (const ruim of ['', '?data=2026-10-27', '?hora=10:30', '?data=lixo&hora=10:30', '?data=2026-10-27&hora=25:00', '?data=2026-10-27&hora=10:30:00', `?data=2026-10-27&hora=${encodeURIComponent("10:30' or 1=1")}`])
    assert.equal((await chamar('atendente', '/api/espera/cabe' + ruim)).status, 400, ruim);
  assert.equal(pedidos.length, 0, 'nada chega ao banco com entrada ruim');
  await chamar('atendente', `/api/espera/cabe?data=2026-10-27&hora=10:30&consultor_id=${encodeURIComponent("x' or 1=1")}`);
  await chamar('atendente', `/api/espera/cabe?data=2026-10-27&hora=10:30&consultor_id=${GAB}`);
  assert.equal(pedidos[0].consultor_id, null);
  assert.equal(pedidos[1].consultor_id, GAB);
});
test('GET /api/espera/cabe não confunde com /api/espera/:id e tem freio por pessoa', async () => {
  const r = await chamar('atendente', '/api/espera/cabe?data=2026-10-27&hora=10:30');
  assert.equal(r.status, 200); assert.ok(Array.isArray(r.j.itens));
  let ultimo = 200;
  for (let i = 0; i < 100 && ultimo === 200; i++) ultimo = (await chamar('gestor', '/api/espera/cabe?data=2026-10-27&hora=10:30')).status;
  assert.equal(ultimo, 429, 'passou de 90 por minuto');
  assert.equal((await chamar('atendente', '/api/espera/cabe?data=2026-10-27&hora=10:30')).status, 200, 'o freio é por pessoa');
});
