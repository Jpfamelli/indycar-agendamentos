'use strict';
/* Rodada 9: salvar as metas (verba, valor médio) faz o Hoje ler a configuração de novo, em vez de seguir 30 s
   com o ritmo calculado pelas metas antigas. */
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');
const equipe = require('../equipe');
const db = require('../db');
const Fonte = require('../motor/fonte');
const { servidor } = require('../server');

const ADMIN = { usuario: { id: '11111111-1111-4111-8111-111111111111', papel: 'admin', apps: [], ativo: true } };
let base;
const salvas = [];
const orig = { identificar: auth.identificar, banco: equipe.banco, lerConfig: db.lerConfig, salvarConfig: db.salvarConfig };

/** Banco de mentira que aceita qualquer encadeamento e conta as idas ao banco. */
function bancoContado() {
  const b = { idas: 0 };
  const consulta = () => {
    const q = { then: (ok, erro) => { b.idas++; return Promise.resolve({ data: null, error: null }).then(ok, erro); } };
    for (const k of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'in', 'is', 'maybeSingle', 'single']) q[k] = () => q;
    return q;
  };
  b.from = () => consulta();
  return b;
}

test.before(async () => {
  auth.identificar = async (req) => (req.headers['x-papel'] === 'admin' ? ADMIN : { motivo: 'sem_token' });
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async () => true });
  db.lerConfig = async () => ({ whatsapp_destinos: [], margem_pct: 45, orcamento_mensal: 3000 });
  db.salvarConfig = async (v) => { salvas.push(v); };
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  Object.assign(db, { lerConfig: orig.lerConfig, salvarConfig: orig.salvarConfig });
  auth.identificar = orig.identificar; equipe.banco = orig.banco;
  Fonte.padrao().trocar({ sb: null });
  servidor.closeAllConnections?.();
  await new Promise((r) => servidor.close(r));
});

test('POST /api/config esquece as metas guardadas: a próxima leitura do Hoje vai ao banco', async () => {
  const sb = bancoContado();
  const f = Fonte.padrao();
  f.trocar({ sb });
  await f.config();
  await f.config();
  assert.equal(sb.idas, 1, 'antes de salvar, a segunda leitura vem da memória');
  const r = await fetch(base + '/api/config', { method: 'POST', headers: { 'x-papel': 'admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ orcamento_mensal: 4500 }) });
  assert.equal(r.status, 200);
  assert.equal(salvas.length, 1);
  await f.config();
  assert.equal(sb.idas, 2, 'depois de salvar, lê as metas novas');
});
