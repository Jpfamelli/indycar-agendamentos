// Casa (rodada 7, C1): servidor — links do cliente (login + papel + limite), saúde com apps internos e freio, tudo sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarLinksCliente } from '../casa-servidor.js';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-x', SUPABASE_SERVICE_ROLE_KEY: 'srv-secreta-x' };
const jwt = (extra = {}) => 'h.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, aal: 'aal1', ...extra })).toString('base64url') + '.s';
const req = (token, corpo, metodo = 'POST') => {
  const chunks = [Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo ?? {}))];
  return Object.assign((async function* () { yield* chunks; })(), { method: metodo, headers: token ? { authorization: 'Bearer ' + token } : {} });
};
/** fetch de mentira: usuário, perfil e a função do banco */
function fakeFetch({ user = { id: 'u1', factors: [] }, perfil = { ativo: true, papel: 'atendente' }, links = null, userStatus = 200 } = {}) {
  const chamadas = [];
  const f = async (url, op = {}) => {
    chamadas.push({ url: String(url), op });
    const resp = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo });
    if (/\/auth\/v1\/user/.test(url)) return resp(user, userStatus);
    if (/\/rest\/v1\/perfis/.test(url)) return resp(perfil ? [perfil] : []);
    if (/rpc\/r7_p3b_links_cliente/.test(url)) {
      if (links instanceof Error) throw links;
      return resp(links ?? { ok: true, nome: 'Ana', aceita_mensagens: true, minha: 'https://indycar-patio.netlify.app/minha/?c=tok', indique: 'https://indycar-patio.netlify.app/minha/indicado/?i=abc', acompanhar: null, os: { numero: 31, etapa_rotulo: 'Pronto' } });
    }
    throw new Error('url inesperada ' + url);
  };
  f.chamadas = chamadas; return f;
}
const novo = (ff, relogio = { t: 1_000_000 }) => ({ s: criarLinksCliente({ env: ENV, fetchFn: ff, agora: () => relogio.t }), relogio });

test('links do cliente: sem login 401, método errado 405, telefone ruim 422', async () => {
  const { s } = novo(fakeFetch());
  assert.equal((await s.tratar(req(null, { telefone: '12991821234' }))).status, 401);
  assert.equal((await s.tratar(req(jwt(), {}, 'GET'))).status, 405);
  assert.equal((await s.tratar(req(jwt(), { telefone: '123' }))).status, 422);
  assert.equal((await s.tratar(req(jwt(), { telefone: 'abc' }))).status, 422);
  assert.equal((await s.tratar(req(jwt(), {}))).status, 422);
});
test('links do cliente: token vencido, desativado, papel de fora da equipe e verificação pendente são barrados', async () => {
  const vencido = 'h.' + Buffer.from(JSON.stringify({ exp: 10 })).toString('base64url') + '.s';
  assert.equal((await novo(fakeFetch()).s.tratar(req(vencido, { telefone: '12991821234' }))).status, 401);
  assert.equal((await novo(fakeFetch({ perfil: { ativo: false, papel: 'atendente' } })).s.tratar(req(jwt(), { telefone: '12991821234' }))).status, 403);
  for (const papel of ['mecanico', 'agenda']) assert.equal((await novo(fakeFetch({ perfil: { ativo: true, papel } })).s.tratar(req(jwt(), { telefone: '12991821234' }))).status, 403, papel);
  const mfa = fakeFetch({ user: { id: 'u1', factors: [{ status: 'verified' }] } });
  assert.equal((await novo(mfa).s.tratar(req(jwt({ aal: 'aal1' }), { telefone: '12991821234' }))).status, 401, 'tem fator e o token ainda é aal1');
  assert.equal((await novo(fakeFetch({ user: { id: 'u1', factors: [{ status: 'verified' }] } })).s.tratar(req(jwt({ aal: 'aal2' }), { telefone: '12991821234' }))).status, 200);
  assert.equal((await novo(fakeFetch({ userStatus: 401 })).s.tratar(req(jwt(), { telefone: '12991821234' }))).status, 401);
  assert.equal((await novo(fakeFetch({ perfil: null })).s.tratar(req(jwt(), { telefone: '12991821234' }))).status, 401, 'sem perfil');
});
test('links do cliente: gestor e atendente recebem só links https, sem segredo nenhum na resposta', async () => {
  for (const papel of ['admin', 'gestor', 'atendente']) {
    const ff = fakeFetch({ perfil: { ativo: true, papel } });
    const r = await novo(ff).s.tratar(req(jwt(), { telefone: '(12) 99182-1234' }));
    assert.equal(r.status, 200, papel); assert.equal(r.corpo.ok, true);
    assert.match(r.corpo.minha, /^https:\/\//); assert.equal(r.corpo.acompanhar, null); assert.equal(r.corpo.os.numero, 31);
    assert.doesNotMatch(JSON.stringify(r.corpo), /srv-secreta|anon-x/);
    const rpc = ff.chamadas.find((c) => /rpc\/r7_p3b/.test(c.url));
    assert.equal(JSON.parse(rpc.op.body).p_telefone, '12991821234', 'só dígitos vão ao banco');
  }
});
test('links do cliente: link que não é https (ou tem senha embutida) é descartado', async () => {
  const ff = fakeFetch({ links: { ok: true, nome: 'A', minha: 'javascript:alert(1)', indique: 'http://x.com', acompanhar: 'https://u:p@evil.com/x' } });
  const r = await novo(ff).s.tratar(req(jwt(), { telefone: '12991821234' }));
  assert.equal(r.corpo.minha, null); assert.equal(r.corpo.indique, null); assert.equal(r.corpo.acompanhar, null);
});
test('links do cliente: cliente não encontrado e falha do banco viram resposta clara', async () => {
  const r1 = await novo(fakeFetch({ links: { ok: false, erro: 'cliente_nao_encontrado' } })).s.tratar(req(jwt(), { telefone: '12991821234' }));
  assert.deepEqual(r1.corpo, { ok: false, motivo: 'cliente_nao_encontrado' });
  const r2 = await novo(fakeFetch({ links: new Error('rede') })).s.tratar(req(jwt(), { telefone: '12991821234' }));
  assert.equal(r2.status, 502); assert.equal(r2.corpo.codigo, 'banco');
});
test('links do cliente: 20 pedidos por minuto por pessoa; passado um minuto libera', async () => {
  const rel = { t: 5_000_000 };
  const a = novo(fakeFetch(), rel).s;
  const t = jwt({ exp: Math.floor(Date.now() / 1000) + 7200 });
  for (let i = 0; i < 20; i++) assert.equal((await a.tratar(req(t, { telefone: '12991821234' }))).status, 200, 'pedido ' + i);
  const bloqueado = await a.tratar(req(t, { telefone: '12991821234' }));
  assert.equal(bloqueado.status, 429); assert.equal(bloqueado.corpo.codigo, 'limite');
  rel.t += 61_000;
  assert.equal((await a.tratar(req(t, { telefone: '12991821234' }))).status, 200, 'um minuto depois libera');
});
test('links do cliente: corpo grande 413 e JSON quebrado 400', async () => {
  const { s } = novo(fakeFetch());
  assert.equal((await s.tratar(req(jwt(), 'x'.repeat(5000)))).status, 413);
  assert.equal((await s.tratar(req(jwt(), '{quebrado'))).status, 400);
});
test('links do cliente: sem configuração do Supabase nunca deixa passar', async () => {
  const s = criarLinksCliente({ env: {}, fetchFn: fakeFetch() });
  assert.equal((await s.tratar(req(jwt(), { telefone: '12991821234' }))).status, 401);
});
test('links do cliente: o login lembrado por 60 s evita perguntar ao Supabase a cada clique', async () => {
  const ff = fakeFetch(); const { s } = novo(ff);
  const t = jwt();
  await s.tratar(req(t, { telefone: '12991821234' })); await s.tratar(req(t, { telefone: '12991821234' }));
  assert.equal(ff.chamadas.filter((c) => /auth\/v1\/user/.test(c.url)).length, 1);
});

test('Central: freio da saúde (40 por minuto por endereço) e apps internos', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' });
  const c = await import('../central.js');
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) assert.equal(c.dentroDoFreioDaSaude('1.2.3.4', t0 + i), true);
  assert.equal(c.dentroDoFreioDaSaude('1.2.3.4', t0 + 100), false);
  assert.equal(c.dentroDoFreioDaSaude('9.9.9.9', t0 + 100), true, 'outro endereço não é afetado');
  assert.equal(c.dentroDoFreioDaSaude('1.2.3.4', t0 + 61_000), true, 'depois de um minuto libera');
  const i = c.internosDaCentral({ agenda: { handler: () => {} }, crm: { handler: null, erro: 'x' }, comunicar: {}, atendimento: { handler: () => {} } });
  assert.deepEqual(i.agenda, { ok: true }); assert.deepEqual(i.crm, { ok: false, motivo: 'nao_subiu' }); assert.deepEqual(i.comunicar, { ok: false, motivo: 'ausente' });
});
