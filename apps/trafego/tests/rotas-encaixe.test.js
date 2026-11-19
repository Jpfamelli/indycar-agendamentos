'use strict';
/* Rodada 8 — encaixe de rotas em arquivos (rotas/*.js).
   Confere o contrato que as frentes usam: rota pública por caminho exato e por RegExp,
   rota pública fora de /api/, 405 com Allow, CORS livre só quando pedido, rota logada com
   parâmetro no caminho continua exigindo login. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { servidor, ctxRotas, handler, tratar, VERSAO, ROTAS_COM_ERRO } = require('../server');

ctxRotas.rotaPublica('GET', '/api/_teste/publica', ({ q, ip }) => ({ ok: true, eco: q.get('x'), temIp: typeof ip === 'string' }));
ctxRotas.rotaPublica('POST', '/api/_teste/publica', async ({ corpo }) => ({ recebido: await corpo() }));
ctxRotas.rotaPublica('GET', /^\/api\/_teste\/item\/([a-z0-9]+)$/, ({ m }) => ({ id: m[1] }));
ctxRotas.rotaPublica('GET', '/_teste-publico.js', ({ res }) => {
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
  res.end('/* oi */');
}, { corsLivre: true });
ctxRotas.rotaPublica('POST', '/api/_teste/livre', () => ({ ok: true }), { corsLivre: true });
ctxRotas.rotaPublica('GET', '/api/_teste/erro', () => { throw new ctxRotas.ErroHttp(422, 'faltou o campo'); });
ctxRotas.rotaPublica('GET', '/api/cron/_teste', ({ q }) => { ctxRotas.exigirCron(q); return { ok: true }; });
ctxRotas.rota('GET', /^\/api\/_teste\/logada\/(\d+)$/, ({ m }) => ({ n: Number(m[1]) }));

let base;
test.before(async () => {
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  servidor.closeAllConnections?.();
  await new Promise(r => servidor.close(r));
});
async function pedir(caminho, { metodo = 'GET', corpo, cabecalhos = {} } = {}) {
  const r = await fetch(base + caminho, { method: metodo, body: corpo, headers: cabecalhos });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch {}
  return { status: r.status, json, texto, headers: r.headers };
}

test('o servidor exporta o que a Central precisa: handler e VERSAO', () => {
  assert.equal(typeof handler, 'function');
  assert.equal(handler, tratar);
  assert.match(VERSAO, /^\d+\.\d+\.\d+/);
  assert.deepEqual(ROTAS_COM_ERRO, [], 'nenhum arquivo de rotas/ pode falhar ao carregar');
});

test('rota pública por caminho exato responde sem login', async () => {
  const r = await pedir('/api/_teste/publica?x=abc');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, eco: 'abc', temIp: true });
});

test('rota pública recebe o corpo em JSON', async () => {
  const r = await pedir('/api/_teste/publica', { metodo: 'POST', corpo: JSON.stringify({ a: 1 }), cabecalhos: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { recebido: { a: 1 } });
});

test('rota pública por RegExp entrega o parâmetro em m', async () => {
  const r = await pedir('/api/_teste/item/a1b2');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { id: 'a1b2' });
  const fora = await pedir('/api/_teste/item/A-B');
  assert.equal(fora.status, 401, 'caminho que não casa cai no fluxo normal (login)');
});

test('método errado em rota pública é 405 com Allow', async () => {
  const r = await pedir('/api/_teste/publica', { metodo: 'DELETE' });
  assert.equal(r.status, 405);
  assert.match(r.headers.get('allow') || '', /GET/);
  assert.equal(typeof r.json.erro, 'string');
});

test('rota pública fora de /api/ ganha do arquivo estático e pode responder outro tipo', async () => {
  const r = await pedir('/_teste-publico.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/javascript/);
  assert.equal(r.texto, '/* oi */');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('CORS livre só na rota que pediu; pré-voo responde 204', async () => {
  const origem = { Origin: 'https://qualquer-site.com.br' };
  const pre = await pedir('/api/_teste/livre', { metodo: 'OPTIONS', cabecalhos: { ...origem, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  const ok = await pedir('/api/_teste/livre', { metodo: 'POST', corpo: '{}', cabecalhos: { ...origem, 'Content-Type': 'application/json' } });
  assert.equal(ok.status, 200);
  const fechada = await pedir('/api/_teste/publica', { cabecalhos: origem });
  assert.equal(fechada.status, 403, 'rota pública sem corsLivre continua só para o ecossistema');
});

test('erro lançado na rota pública sai em JSON com o status certo', async () => {
  const r = await pedir('/api/_teste/erro');
  assert.equal(r.status, 422);
  assert.equal(r.json.erro, 'faltou o campo');
});

test('rota pública de rotina confere a chave com exigirCron', async () => {
  const r = await pedir('/api/cron/_teste?chave=errada');
  assert.equal(r.status, 401);
  assert.equal(r.json.erro, 'chave inválida');
});

test('rota com parâmetro registrada com rota() continua exigindo login', async () => {
  const r = await pedir('/api/_teste/logada/42');
  assert.equal(r.status, 401);
  assert.equal(r.json.erro, 'faça login');
});
