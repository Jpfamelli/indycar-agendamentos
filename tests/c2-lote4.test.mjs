// Agenda (rodada 7 / C2, lote 4): pré-agendamentos do Orçador e o PARAR do Comunicar nos botões de WhatsApp.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const PA = await import('../preagenda.js');
const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ctx = vm.createContext({ globalThis: null, URL });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada7.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R7Puro;
const arr = (v) => JSON.parse(JSON.stringify(v));

const PRE = { id: ID(1), cliente_nome: 'ana souza', telefone: '12991110011', servico: 'Revisão completa', data: '2026-10-26', hora: '08:00:00', valor: 1990, created_at: '2026-10-22T12:00:00Z', observacoes: 'PRÉ-AGENDAMENTO pedido pelo cliente pela página do orçamento — confirmar horário. Orçamento nº 0042 (Orçador)' };

/* ------------------------------ preagenda.js ------------------------------ */
test('ehPreAgendamento e numeroDoOrcamento: lê o texto que o banco escreve', () => {
  assert.ok(PA.ehPreAgendamento(PRE)); assert.ok(PA.ehPreAgendamento({ observacoes: 'PRE-AGENDAMENTO x' }));
  assert.ok(!PA.ehPreAgendamento({ observacoes: 'cliente pediu pré-agendamento' })); assert.ok(!PA.ehPreAgendamento(null));
  assert.equal(PA.numeroDoOrcamento(PRE.observacoes), '0042');
  assert.equal(PA.numeroDoOrcamento('Orçamento n° 17'), '17'); assert.equal(PA.numeroDoOrcamento('sem número'), null); assert.equal(PA.numeroDoOrcamento(null), null);
});
test('periodoPedido: hora padrão vira manhã/tarde; hora combinada não é provisória', () => {
  assert.equal(PA.periodoPedido({ hora: '08:00:00' }), 'manha'); assert.equal(PA.periodoPedido({ hora: '13:00' }), 'tarde');
  assert.equal(PA.periodoPedido({ hora: '09:30' }), null); assert.equal(PA.periodoPedido(null), null);
});
test('descreverPre: número, valor, idade, urgência e telefone', () => {
  const d = PA.descreverPre(PRE, '2026-10-25', Date.parse('2026-10-25T12:00:00Z'));
  assert.equal(d.orcamento_numero, '0042'); assert.equal(d.periodo, 'manha'); assert.ok(d.provisorio);
  assert.equal(d.dias_esperando, 3); assert.equal(d.faltam_dias, 1); assert.ok(d.urgente); assert.equal(d.valor, 1990); assert.ok(!d.sem_telefone);
  const e = PA.descreverPre({ ...PRE, telefone: '123', hora: '10:30', data: '2026-11-05', valor: 0 }, '2026-10-25');
  assert.ok(e.sem_telefone && !e.provisorio && !e.urgente && e.valor === null);
});
test('ordenarPre: o que acontece primeiro vem antes; no mesmo horário, o mais antigo', () => {
  const l = [{ data: '2026-10-27', hora: '08:00', dias_esperando: 1 }, { data: '2026-10-26', hora: '13:00', dias_esperando: 0 }, { data: '2026-10-26', hora: '08:00', dias_esperando: 1 }, { data: '2026-10-26', hora: '08:00', dias_esperando: 4 }];
  assert.deepEqual(arr(PA.ordenarPre(l).map((x) => `${x.data} ${x.hora} ${x.dias_esperando}`)), ['2026-10-26 08:00 4', '2026-10-26 08:00 1', '2026-10-26 13:00 0', '2026-10-27 08:00 1']);
  assert.deepEqual(arr(PA.ordenarPre(null)), []);
});
const LIVRES = [
  { hora: '08:30', consultores_livres: ['L'] }, { hora: '09:00', consultores_livres: ['G', 'L'] }, { hora: '11:30', consultores_livres: ['G'] },
  { hora: '13:30', consultores_livres: ['L'] }, { hora: '15:00', consultores_livres: [] },
];
test('sugerirHorarioParaPre: primeiro livre do período pedido, consultor do pré primeiro; navegador igual', () => {
  const manha = { periodo: 'manha', hora: '08:00', consultor_id: 'G' }, tarde = { periodo: 'tarde', hora: '13:00', consultor_id: null };
  for (const f of [PA.sugerirHorarioParaPre, P.sugerirHorarioParaPre]) {
    assert.deepEqual(arr(f(manha, LIVRES)), { hora: '09:00', consultor_id: 'G' }, 'prefere o consultor do pré');
    assert.deepEqual(arr(f({ ...manha, consultor_id: null }, LIVRES)), { hora: '08:30', consultor_id: 'L' });
    assert.deepEqual(arr(f(tarde, LIVRES)), { hora: '13:30', consultor_id: 'L' });
    assert.equal(f(manha, []), null); assert.equal(f(manha, [{ hora: '14:00', consultores_livres: ['G'] }]), null); assert.equal(f(null, LIVRES), null);
  }
  assert.deepEqual(arr(P.sugerirHorarioParaPre({ periodo: null, hora: '10:00' }, LIVRES)), { hora: '08:30', consultor_id: 'L' }, 'sem período usa o da hora');
});
test('textoDePropor: pedido, hora sugerida, nome limpo, igual no navegador', () => {
  const a = { nome: 'ana souza', servico: 'Revisão', data: '2026-10-26', hoje: '2026-10-25', periodo: 'manha', sugestao: { hora: '09:00', consultor_nome: 'Gabriel Lima' } };
  assert.match(PA.textoDePropor(a), /^Oi Ana! .*aprovação de Revisão e seu pedido para amanhã de manhã\. Posso deixar marcado às 09:00 com Gabriel\?/);
  assert.equal(PA.textoDePropor(a), P.textoDePropor(a));
  assert.match(PA.textoDePropor({ nome: '<b>', periodo: 'tarde', data: '2026-10-29', hoje: '2026-10-25' }), /^Oi! .*qui 29\/10 à tarde\. Qual hora fica melhor/);
  assert.ok(!/undefined|null/.test(PA.textoDePropor({})));
});
test('resumoDePre: total, urgentes, sem telefone e antigos', () => {
  assert.deepEqual(arr(P.resumoDePre([{ urgente: true }, { sem_telefone: true, dias_esperando: 3 }, {}])), { total: 3, urgentes: 1, semTelefone: 1, antigos: 1 });
  assert.deepEqual(arr(P.resumoDePre(null)), { total: 0, urgentes: 0, semTelefone: 0, antigos: 0 });
});

/* ------------------------------ PARAR: puro do navegador ------------------------------ */
test('telDoLinkWa: só wa.me com telefone brasileiro válido', () => {
  assert.equal(P.telDoLinkWa('https://wa.me/5512991110011?text=oi'), '12991110011');
  assert.equal(P.telDoLinkWa('https://wa.me/1234'), null);
  assert.equal(P.telDoLinkWa('https://evil.com/5512991110011'), null);
  assert.equal(P.telDoLinkWa('javascript:alert(1)'), null); assert.equal(P.telDoLinkWa(null), null);
  assert.match(P.textoBloqueado('optout'), /não receber/); assert.match(P.textoBloqueado('parar'), /PARAR/);
});

/* ------------------------------ PARAR: dados.pararDe com o banco de mentira ------------------------------ */
test('pararDe: opt-out do cadastro e PARAR de quem não tem cadastro; cadastrado que aceita não entra', async () => {
  const velho = globalThis.fetch; const urls = [];
  globalThis.fetch = async (url) => {
    const u = String(url); urls.push(u);
    const corpo = u.includes('aceita_mensagens=eq.false') ? [{ telefone_e164: '12991110011' }]
      : u.includes('resposta_tipo=eq.parar') ? [{ telefone_e164: '12991110022' }, { telefone_e164: '12991110033' }]
      : [{ telefone_e164: '12991110011' }, { telefone_e164: '12991110033' }];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await real.pararDe(['5512991110011', '(12) 99111-0022', '12991110033', '123', null]);
    assert.deepEqual(arr(r), { 12991110022: 'parar', 12991110011: 'optout' }, '0033 tem cadastro e aceita: não entra');
    assert.deepEqual(arr(await real.pararDe([])), {});
    assert.ok(urls.every((u) => !/\b123\b.*in\.\(/.test(u)));
  } finally { globalThis.fetch = velho; }
});

/* ------------------------------ rotas por HTTP ------------------------------ */
const PESSOAS = {
  gestor: { id: ID(902), email: 'g@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'f@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base; const consultas = [];
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  preAgendamentos: async () => [{ ...PRE, id: ID(2), data: '2026-10-29', hora: '13:00' }, PRE],
  pararDe: async (t) => { consultas.push(t); return { 12991110011: 'parar' }; },
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
test('GET /api/pre-agendamentos: ordenado, descrito e liberado também para a recepção', async () => {
  for (const quem of ['gestor', 'agenda']) {
    const r = await chamar(quem, 'GET', '/api/pre-agendamentos');
    assert.equal(r.status, 200, quem); assert.equal(r.j.total, 2);
    assert.deepEqual(arr(r.j.itens.map((x) => x.data)), ['2026-10-26', '2026-10-29']);
    assert.equal(r.j.itens[0].orcamento_numero, '0042');
  }
  assert.equal((await chamar(null, 'GET', '/api/pre-agendamentos')).status, 401);
});
test('POST /api/parar: devolve só os bloqueados, aceita lixo sem quebrar e corta em 80', async () => {
  consultas.length = 0;
  const r = await chamar('agenda', 'POST', '/api/parar', { telefones: ['12991110011', 5, null, { x: 1 }, 'a'.repeat(100)] });
  assert.equal(r.status, 200); assert.deepEqual(arr(r.j.bloqueados), { 12991110011: 'parar' });
  assert.ok(consultas[0].every((t) => typeof t === 'string' && t.length <= 24));
  await chamar('gestor', 'POST', '/api/parar', { telefones: Array.from({ length: 300 }, (_, i) => String(12991110000 + i)) });
  assert.equal(consultas.at(-1).length, 80);
  assert.equal((await chamar('gestor', 'POST', '/api/parar', {})).status, 200);
  assert.equal((await chamar(null, 'POST', '/api/parar', { telefones: [] })).status, 401);
});
