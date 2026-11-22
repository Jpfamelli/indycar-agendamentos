// R13C — a Central de verdade (handler), sem rede: a rota nova do faturamento e as CSPs endurecidas
// (Agenda, /confirmar/, Comunicar, Atendimento) no padrão da Casa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

Object.assign(process.env, {
  SUPABASE_URL: 'https://nppfqhavqahapmugnyng.supabase.co', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;

let srv, base, central;
before(async () => {
  central = await import('../central.js');
  await central.iniciarCentral({ ouvir: false });
  srv = http.createServer(central.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));
const pega = (p, op = {}) => fetch(base + p, { redirect: 'manual', ...op });

test('faturamento: sem login 401, método errado 405, e nunca fica em cache', async () => {
  const r = await pega('/api/central/faturamento');
  assert.equal(r.status, 401);
  assert.match(r.headers.get('cache-control') || '', /no-store/);
  assert.equal((await pega('/api/central/faturamento', { headers: { Authorization: 'Bearer lixo' } })).status, 401);
  assert.equal((await pega('/api/central/faturamento', { method: 'POST' })).status, 405);
});
