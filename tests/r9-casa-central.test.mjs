// Casa, rodada 9: a Central serve as fontes da Casa (sem Google) e a CSP fecha a porta para fora. Sem banco, sem rede.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

Object.assign(process.env, {
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;

let srv, base;
before(async () => {
  const c = await import('../central.js');
  await c.iniciarCentral({ ouvir: false });
  srv = http.createServer(c.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));
const pega = (p, op = {}) => fetch(base + p, { redirect: 'manual', ...op });

test('fontes da Casa: font/woff2, guardadas 30 dias, sem recomprimir (woff2 já é comprimido), byte a byte iguais', async () => {
  for (const f of ['archivo-variavel', 'barlow-condensed-600', 'barlow-condensed-700', 'barlow-condensed-800-italic']) {
    const r = await pega(`/casa/${f}.woff2`, { headers: { 'Accept-Encoding': 'br, gzip' } });
    assert.equal(r.status, 200, f);
    assert.equal(r.headers.get('content-type'), 'font/woff2');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=2592000');
    assert.equal(r.headers.get('content-encoding'), null, 'sem br/gzip em cima do woff2');
    const buf = Buffer.from(await r.arrayBuffer());
    assert.ok(buf.equals(readFileSync(new URL(`../casa/${f}.woff2`, import.meta.url))), f + ' igual ao arquivo');
    assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2');
  }
});

test('CSP da Casa sem Google Fonts; o HTML não pede nada de fora além do supabase-js', async () => {
  const r = await pega('/');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /font-src 'self';/);
  assert.doesNotMatch(csp, /googleapis|gstatic/);
  const html = await r.text();
  assert.doesNotMatch(html, /googleapis|gstatic/);
  assert.match(html, /<link rel="stylesheet" href="\/casa\/r9\.css\?v=\d+" \/>/);
  assert.match(html, /<link rel="preload" href="\/casa\/archivo-variavel\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  const css = await pega('/casa/r9.css', { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(css.status, 200);
  assert.equal(css.headers.get('content-encoding'), 'br', 'CSS continua comprimido');
  assert.equal(css.headers.get('cache-control'), 'no-cache');
});

test('arquivo de fonte que não existe: 404 da Casa (não cai na Agenda)', async () => {
  const r = await pega('/casa/nao-existe.woff2');
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /json/);
});

test('CSP: o CDN vale só no caminho da biblioteca do Supabase (o cdn.jsdelivr.net inteiro serve qualquer pacote e arquivo do GitHub)', async () => {
  const csp = (await pega('/')).headers.get('content-security-policy');
  const lib = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/';
  assert.match(csp, new RegExp(`script-src 'self' ${lib.replace(/[.*+?^${}()|[\]\/]/g, '\$&')};`));
  assert.ok(csp.includes(`wss://*.supabase.co ${lib};`), 'connect-src: o cache offline baixa a biblioteca');
  assert.doesNotMatch(csp, /https:\/\/cdn\.jsdelivr\.net[;\s]/, 'nada do CDN inteiro');
  const html = await (await pega('/')).text();
  for (const m of html.matchAll(/<script src="(https:[^"]+)"/g)) assert.ok(m[1].startsWith(lib), 'script de fora dentro do caminho liberado: ' + m[1]);
  assert.ok(readFileSync(new URL('../casa/sw.js', import.meta.url), 'utf8').includes(`'${lib}dist/umd/supabase.min.js'`), 'o service worker busca dentro do caminho liberado');
});
