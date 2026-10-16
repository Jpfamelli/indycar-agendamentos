// IndyCar Central — verificação C4 (rodada 5, 16/10/2026): isolamento entre apps, normalização de caminho,
// 308 sem perder corpo/consulta, HEAD/OPTIONS, login único (sair só neste aparelho).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENV_TESTE = {
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
};
Object.assign(process.env, ENV_TESTE);
delete process.env.RENDER;

let srv, porta, APPS, central;
before(async () => {
  central = await import('../central.js');
  ({ APPS } = await central.iniciarCentral({ ouvir: false }));
  srv = http.createServer(central.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  porta = srv.address().port;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));

const pega = (p, op = {}) => fetch(`http://127.0.0.1:${porta}${p}`, { redirect: 'manual', ...op });
/** Pedido cru (o fetch normaliza o caminho antes de enviar): devolve a linha de status e os cabeçalhos. */
function cru(alvo, metodo = 'GET') {
  return new Promise((ok) => {
    const s = net.connect(porta, '127.0.0.1');
    let out = '';
    s.setTimeout(4000, () => s.destroy());
    s.on('data', (d) => { out += d; });
    s.on('close', () => ok(out));
    s.on('error', () => ok(out));
    s.write(`${metodo} ${alvo} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
  });
}

test('/api/ping avisa se a configuração essencial do Supabase está presente', async () => {
  const j = await (await pega('/api/ping')).json();
  assert.equal(j.configurado, true);
});

test('caminho cru "//x" e "/a/../b" chegam NORMALIZADOS à Agenda (nunca como host)', async () => {
  const antes = APPS.agenda.handler;
  const vistos = [];
  APPS.agenda.handler = (req, res) => { vistos.push(req.url); res.writeHead(200); res.end('ok'); };
  try {
    await cru('//evil.example/confirmar/?x=1');
    await cru('/confirmar/../api/versao?a=b');
    await cru('/%2e%2e/api/versao');
  } finally { APPS.agenda.handler = antes; }
  assert.deepEqual(vistos, ['/confirmar/?x=1', '/api/versao?a=b', '/api/versao']);
});

test('".." e "%2e%2e" não atravessam o prefixo para ler arquivo de outro app', async () => {
  for (const alvo of ['/crm/%2e%2e/%2e%2e/central.js', '/comunicar/../server.js', '/atendimento/%2e%2e%2f%2e%2e%2fcentral.js',
    '/crm/..%5c..%5ccentral.js', '/agenda/%2e%2e/%2e%2e/package.json', '/casa/../central.js']) {
    const r = await cru(alvo);
    assert.doesNotMatch(r, /VERSAO_CENTRAL|"name": "indycar-agendamentos"|import http from/, alvo);
  }
});

test('308 de prefixo sem barra preserva o método (POST) e a consulta; HEAD e OPTIONS não quebram', async () => {
  const r = await pega('/crm?lead=1&x=%C3%A1', { method: 'POST', body: '{"a":1}', headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 308);
  assert.equal(r.headers.get('location'), '/crm/?lead=1&x=%C3%A1');
  for (const m of ['HEAD', 'OPTIONS']) {
    for (const p of ['/', '/crm/', '/agenda/', '/comunicar/', '/atendimento/', '/api/ping', '/confirmar/']) {
      const x = await pega(p, { method: m });
      assert.ok(x.status < 500, `${m} ${p} = ${x.status}`);
    }
  }
  const h = await pega('/', { method: 'HEAD' });
  assert.equal(h.status, 200);
  assert.equal((await h.text()), '');
});

test('todo app e a Casa mandam os cabeçalhos básicos de segurança', async () => {
  for (const p of ['/', '/agenda/', '/crm/', '/comunicar/', '/atendimento/', '/api/ping', '/crm/api/ping', '/comunicar/api/ping']) {
    const r = await pega(p);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', p);
    assert.ok(r.headers.get('referrer-policy'), p);
    assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors 'none'/, p);
  }
});

test('um app que lança exceção em timer/evento NÃO derruba os outros (guardas do processo)', () => {
  const codigo = `
    const c = await import('${new URL('../central.js', import.meta.url).href}');
    c.instalarGuardas();
    const { APPS } = await c.iniciarCentral({ ouvir: false });
    APPS.crm.handler = (req, res) => { setTimeout(() => { throw new Error('boom no timer do CRM'); }, 5); req.on('data', () => { throw new Error('boom no evento'); }); res.end('crm'); };
    const http = await import('node:http');
    const srv = http.createServer(c.handler);
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    const b = 'http://127.0.0.1:' + srv.address().port;
    const a = await fetch(b + '/crm/x', { method: 'POST', body: 'abc', headers: { connection: 'close' } });
    await new Promise((ok) => setTimeout(ok, 300));
    const ping = await fetch(b + '/api/ping');
    const ag = await fetch(b + '/agenda/api/config');
    console.log('RESULTADO crm=' + a.status + ' ping=' + ping.status + ' agenda=' + ag.status);
    process.exit(0);
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { env: { ...process.env, ...ENV_TESTE }, encoding: 'utf8', timeout: 60_000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
  assert.match(r.stdout, /RESULTADO crm=200 ping=200 agenda=200/, r.stdout + r.stderr);
  assert.match(r.stderr, /a Central segue no ar/);
});

test('enxurrada de exceções (>= 25 em 1 minuto) deixa de ser tolerada; a janela escoa', () => {
  const t0 = 1_000_000;
  let ok = true;
  for (let i = 0; i < 24; i++) ok = central.registrarExcecao(t0 + i, 25);
  assert.equal(ok, true, 'até 24 passa');
  assert.equal(central.registrarExcecao(t0 + 30, 25), false, 'a 25ª em 1 min reinicia');
  assert.equal(central.registrarExcecao(t0 + 120_000, 25), true, 'passado 1 minuto, volta ao normal');
});

test('login único: "Sair" nunca derruba os OUTROS aparelhos (escopo local explícito em todo app com botão Sair)', () => {
  const ler = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  for (const f of ['casa/casa.js', 'public/conta.js', 'apps/comunicar/public/conta.js']) {
    const t = ler(f);
    assert.match(t, /scope: (global|todos) \? 'global' : 'local'/, f);
    assert.doesNotMatch(t, /signOut\((global|todos) \? \{ scope: 'global' \} : undefined\)/, f + ' (sem scope = global)');
  }
});

test('caminho com "%" solto ou UTF-8 inválido responde 400 (nunca 500) em qualquer parte da Central', async () => {
  for (const alvo of ['/%', '/%E0%A4%A', '/agenda/%', '/confirmar/%', '/confirmar/%E0%A4%A', '/crm/%', '/comunicar/%', '/atendimento/%', '/api/%']) {
    const r = await cru(alvo);
    assert.match(r.split('\r\n')[0], /HTTP\/1\.1 400/, alvo + ' → ' + r.split('\r\n')[0]);
  }
});
