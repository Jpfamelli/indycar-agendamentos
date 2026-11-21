// Rodada 11 (21/11/2026): o Orçador mora DENTRO da Central em /orcador/ (build pronto em apps/orcador/), com a mesma
// sessão da Casa e podendo abrir na moldura da aba Orçador do Atendimento (só do próprio site).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, {
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
let srv, base, C;
before(async () => {
  C = await import('../central.js');
  await C.iniciarCentral({ ouvir: false });
  srv = http.createServer(C.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));
const pega = (p, op = {}) => fetch(base + p, { redirect: 'manual', ...op });

test('o build do Orçador está no repositório (a Central publica sem passo de build)', () => {
  assert.ok(existsSync(join(raiz, 'apps', 'orcador', 'index.html')));
  assert.ok(existsSync(join(raiz, 'apps', 'orcador', 'assets')));
  assert.ok(!existsSync(join(raiz, 'apps', 'orcador', 'sw.js')), 'sem service worker dentro da Central');
  const html = readFileSync(join(raiz, 'apps', 'orcador', 'index.html'), 'utf8');
  assert.match(html, /src="\/orcador\/assets\/index-[\w-]+\.js"/, 'build com base /orcador/');
  assert.equal(C.orcadorLocal(), true);
});

test('/orcador/ serve o app com a CSP dele: banco da Central, moldura só do próprio site', async () => {
  const r = await pega('/orcador/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:9 ws:\/\/127\.0\.0\.1:9/, 'o mesmo banco que a Central usa');
  assert.match(r.headers.get('cache-control'), /no-cache/);
  assert.match(await r.text(), /Orçador IndyCar/);
});

test('arquivos com marca no nome ficam 1 ano; ETag responde 304; comprime', async () => {
  const html = await (await pega('/orcador/')).text();
  const js = html.match(/\/orcador\/assets\/index-[\w-]+\.js/)[0];
  const r = await pega(js, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.match(r.headers.get('content-type'), /javascript/);
  const r2 = await pega(js, { headers: { 'if-none-match': r.headers.get('etag') } });
  assert.equal(r2.status, 304);
});

test('fora da pasta, oculto, inexistente ou método errado: nada vaza', async () => {
  for (const p of ['/orcador/../central.js', '/orcador/%2e%2e/central.js', '/orcador/..%5ccentral.js', '/orcador/.env', '/orcador/nao-existe.js']) {
    const r = await pega(p);
    assert.ok([404, 400].includes(r.status) || r.status === 200 && !/IndyCar Central/.test(await r.text()), p + ' ' + r.status);
    assert.notEqual(r.headers.get('x-indycar-app'), 'agenda', p);
  }
  assert.equal(C.arquivoDoOrcador('/../central.js'), null);
  assert.equal(C.arquivoDoOrcador('/%2e%2e/central.js'), null);
  assert.equal(C.arquivoDoOrcador('/a\..\..\central.js'), null);
  assert.equal(C.arquivoDoOrcador('/.env'), null);
  const r = await pega('/orcador/', { method: 'POST' });
  assert.equal(r.status, 405);
});

test('/api/central/config continua dizendo o banco (é de lá que o Orçador da Central lê)', async () => {
  const c = await (await pega('/api/central/config')).json();
  assert.equal(c.supabaseUrl, 'http://127.0.0.1:9');
  assert.equal(c.supabaseAnonKey, 'anon-de-teste');
});
