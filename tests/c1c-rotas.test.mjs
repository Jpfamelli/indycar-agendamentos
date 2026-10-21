// Agenda (rodada 6, C1c): rotas novas por HTTP com banco falso — papel, login, entrada maliciosa e limite.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOAS = {
  gestor: { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'at@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'franklin@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base; const pedidos = [];
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  listarAgendamentos: async () => [{ id: ID(1), data: '2026-10-22', hora: '09:00', servico: 'Revisão completa', status: 'aguardando' }],
  horariosLivresDoDia: async () => ({ aberto: true, horarios: [] }),
  lembretesDoDia: async () => ({ itens: [], cfg: {} }),
  duracoesDosAgendamentos: async (l) => Object.fromEntries(l.map((a) => [a.id, 90])),
  semanaDoQuadroDados: async (d, n) => { pedidos.push(['semana', d, n]); return Array.from({ length: n }, (_, i) => ({ data: d, total: i })); },
  contextoDoClienteParaMarcar: async (p) => { pedidos.push(['ctx', p]); return { futuros: [], patio: [], orcamentos: [], avisos: [] }; },
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

test('GET /api/quadro devolve as durações dos cartões', async () => {
  const r = await chamar('atendente', '/api/quadro?data=2026-10-22');
  assert.equal(r.status, 200); assert.equal(r.j.duracoes[ID(1)], 90);
});
test('rotas novas: sem login 401, recepção 403, gestor e atendente passam', async () => {
  for (const rota of ['/api/quadro/semana', '/api/contexto-cliente?tel=12991821234']) {
    assert.equal((await chamar(null, rota)).status, 401, rota);
    assert.equal((await chamar('agenda', rota)).status, 403, rota);
    assert.equal((await chamar('atendente', rota)).status, 200, rota);
    assert.equal((await chamar('gestor', rota)).status, 200, rota);
  }
});
test('semana: dias limitado a 1..14 e data inválida cai em hoje', async () => {
  pedidos.length = 0;
  await chamar('atendente', '/api/quadro/semana?dias=999');
  await chamar('atendente', '/api/quadro/semana?dias=-5');
  await chamar('atendente', '/api/quadro/semana?dias=abc');
  await chamar('atendente', "/api/quadro/semana?data=2026-10-22';drop table x;--");
  assert.deepEqual(pedidos.map((p) => p[2]), [14, 1, 7, 7]);
  assert.match(pedidos[3][1], /^\d{4}-\d{2}-\d{2}$/, 'data maliciosa vira a data de hoje');
});
test('contexto: ignorar só vale como UUID, textos são cortados, injeção não passa crua', async () => {
  pedidos.length = 0;
  await chamar('atendente', `/api/contexto-cliente?ignorar=${encodeURIComponent("x' or 1=1")}&tel=${'9'.repeat(200)}&placa=${'A'.repeat(200)}`);
  const p = pedidos[0][1];
  assert.equal(p.ignorar, null); assert.ok(p.tel.length <= 24); assert.ok(p.placa.length <= 16);
  pedidos.length = 0;
  await chamar('atendente', `/api/contexto-cliente?ignorar=${ID(7)}`);
  assert.equal(pedidos[0][1].ignorar, ID(7));
});
test('contexto: limite de 120 pedidos por minuto por pessoa (429), e o outro usuário não é afetado', async () => {
  let ultimo = 0;
  for (let i = 0; i < 125; i++) ultimo = (await chamar('gestor', '/api/contexto-cliente?tel=1')).status;
  assert.equal(ultimo, 429);
  assert.equal((await chamar('atendente', '/api/contexto-cliente?tel=1')).status, 200);
});
