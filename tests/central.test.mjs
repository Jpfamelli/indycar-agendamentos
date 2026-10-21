// IndyCar Central — roteamento, Casa, redirecionamentos antigos e montagem dos 4 apps.
// Sem banco: o Supabase aponta para uma porta morta e nada roda sozinho (timers desligados).
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

let srv, base, APPS;
before(async () => {
  const c = await import('../central.js');
  ({ APPS } = await c.iniciarCentral({ ouvir: false }));
  srv = http.createServer(c.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));

const pega = (p, op = {}) => fetch(base + p, { redirect: 'manual', ...op });

test('os quatro apps sobem e /api/ping diz a versão de cada um', async () => {
  for (const n of ['agenda', 'crm', 'comunicar', 'atendimento']) assert.ok(APPS[n]?.handler, `${n} carregou`);
  const r = await pega('/api/ping');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true); assert.equal(j.app, 'central');
  for (const n of ['agenda', 'crm', 'comunicar', 'atendimento']) assert.equal(j.apps[n].ok, true);
  assert.ok(j.memoria.rss_mb > 0);
  assert.doesNotMatch(JSON.stringify(j), /srv-de-teste|token-de-teste/);
});

test('Casa em / com CSP própria, sem inline; sw.js com escopo raiz; config só com o público', async () => {
  const r = await pega('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'none'/); assert.doesNotMatch(csp, /unsafe-inline/);
  assert.ok(r.headers.get('strict-transport-security'));
  const html = await r.text();
  assert.match(html, /casa\/casa\.js/);
  assert.doesNotMatch(html, /<script>(?!<\/script>)/, 'nenhum script embutido (a CSP não deixa)');
  const sw = await pega('/sw.js');
  assert.equal(sw.headers.get('service-worker-allowed'), '/');
  const cfg = await (await pega('/api/central/config')).json();
  assert.deepEqual(Object.keys(cfg).sort(), ['apps', 'supabaseAnonKey', 'supabaseUrl', 'versao']);
  assert.deepEqual(cfg.apps, { patio: 'https://indycar-patio.netlify.app', orcador: 'https://indycar-orcador.netlify.app' });
  assert.doesNotMatch(JSON.stringify(cfg), /srv-de-teste/);
  const etag = r.headers.get('etag');
  assert.equal((await pega('/', { headers: { 'If-None-Match': 'W/' + etag } })).status, 304);
});

test('links antigos da Agenda: /?agendamento=x → /agenda/?agendamento=x (308); /confirmar/ e /api/* da raiz seguem na Agenda', async () => {
  let r = await pega('/?agendamento=123&x=1');
  assert.equal(r.status, 308); assert.equal(r.headers.get('location'), '/agenda/?agendamento=123&x=1');
  r = await pega('/?r=agenda');
  assert.equal(r.headers.get('location'), '/agenda/?r=agenda');
  r = await pega('/confirmar/');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/);
  r = await pega('/api/versao');
  assert.equal(r.status, 200);
  r = await pega('/api/agendamentos');
  assert.equal(r.status, 401, 'API antiga da raiz continua exigindo login');
});

test('cada prefixo sem barra vira com barra (308) mantendo a consulta', async () => {
  for (const p of ['/agenda', '/crm', '/comunicar', '/atendimento']) {
    const r = await pega(p + '?lead=abc');
    assert.equal(r.status, 308, p); assert.equal(r.headers.get('location'), p + '/?lead=abc');
  }
});

test('cada app servido no prefixo: HTML, JS, CSS, SW e manifest', async () => {
  for (const app of ['agenda', 'crm', 'comunicar', 'atendimento']) {
    for (const [arq, tipo] of [['', /text\/html/], ['app.js', /javascript/], ['styles.css', /text\/css/], ['sw.js', /javascript/], ['manifest.json', /json/], ['apps.js', /javascript/]]) {
      const r = await pega(`/${app}/${arq}`);
      assert.equal(r.status, 200, `/${app}/${arq}`);
      assert.match(r.headers.get('content-type') || '', tipo, `/${app}/${arq}`);
    }
  }
  // o Atendimento recebe o <base href> do prefixo e a biblioteca do login vem do node_modules da raiz
  const at = await (await pega('/atendimento/')).text();
  assert.match(at, /<base href="\/atendimento\/"/);
  assert.equal((await pega('/atendimento/vendor/supabase.js')).status, 200);
});

test('API de cada app atende no prefixo e exige login onde deve', async () => {
  assert.equal((await pega('/agenda/api/config')).status, 200);
  assert.equal((await pega('/crm/api/ping')).status, 200);
  assert.equal((await pega('/comunicar/api/ping')).status, 200);
  assert.equal((await pega('/atendimento/api/config')).status, 200);
  assert.equal((await pega('/crm/api/leads')).status, 401);
  assert.equal((await pega('/agenda/api/agendamentos')).status, 401);
  // carteiro: sem o token não roda
  const r = await pega('/comunicar/api/rodar', { method: 'POST' });
  assert.ok([401, 403].includes(r.status), 'rodar sem token = ' + r.status);
});

test('service workers: cada app só apaga os caches DELE (5 no mesmo domínio)', () => {
  const ler = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  assert.match(ler('public/sw.js'), /k\.startsWith\('indycar-agenda-'\)/);
  assert.match(ler('apps/crm/public/sw.js'), /k\.startsWith\('indycar-crm-'\)/);
  assert.match(ler('apps/comunicar/public/sw.js'), /k\.startsWith\('comunicar-'\)/);
  assert.match(ler('apps/atendimento/public/sw.js'), /k\.startsWith\('indycar-atendimento-'\)/);
  const casa = ler('casa/sw.js');
  assert.match(casa, /indycar-casa-/); assert.match(casa, /if \(!ehDaCasa\(u\)\) return;/);
});

test('apps.js: na Central os irmãos usam a origem atual', () => {
  for (const f of ['public/apps.js', 'apps/comunicar/public/apps.js', 'apps/atendimento/public/apps.js']) {
    assert.match(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), /location\.origin \+ '\/' \+ k/, f);
  }
});
