// R13C — a Central de verdade (handler), sem rede: a rota nova do faturamento e as CSPs endurecidas
// (Agenda, /confirmar/, Comunicar, Atendimento) no padrão da Casa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// projeto de mentira (a CSP precisa de um endereço https de projeto) e NENHUM pedido sai para o Supabase:
// a Central lê configuração ao subir, então todo fetch para *.supabase.co falha aqui, antes da rede
const PROJETO = 'projeto-de-teste-r13c.supabase.co';
const fetchDeVerdade = globalThis.fetch;
globalThis.fetch = (url, ...resto) => (/\.supabase\.co/.test(String(url && url.url ? url.url : url))
  ? Promise.reject(new TypeError('teste sem rede: Supabase bloqueado')) : fetchDeVerdade(url, ...resto));
Object.assign(process.env, {
  SUPABASE_URL: `https://${PROJETO}`, SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
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

const scriptSrc = (csp) => (csp || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src ')) || '';
const connectSrc = (csp) => (csp || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src ')) || '';

test('CSP endurecida nos endereços que estavam fracos: Agenda, /confirmar/, Comunicar e Atendimento', async () => {
  for (const rota of ['/agenda/', '/confirmar/?t=abc', '/comunicar/', '/atendimento/']) {
    const r = await pega(rota);
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp, rota + ' sem CSP');
    const s = scriptSrc(csp);
    assert.doesNotMatch(s, /'unsafe-inline'/, rota + ': script embutido liberado');
    assert.doesNotMatch(s + ' ', /https:\/\/cdn\.jsdelivr\.net\s/, rota + ': CDN inteiro liberado');
    assert.match(s, /https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[\d.]+\//, rota + ': só o caminho do supabase-js');
    const c = connectSrc(csp);
    assert.doesNotMatch(c, /\*\.supabase\.co/, rota + ': qualquer projeto do Supabase');
    assert.ok(c.includes(`https://${PROJETO}`), rota + ': só o projeto configurado');
  }
});

test('Agenda e /confirmar/: nenhum <script> com código dentro e nenhum onclick no HTML que as telas montam', async () => {
  const { readFileSync } = await import('node:fs');
  const ler = (f) => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
  for (const f of ['index.html', 'confirmar/index.html']) assert.doesNotMatch(ler(f), /<script(\s[^>]*)?>\s*[^<\s]/, f);
  for (const f of ['app.js', 'conta.js', 'agenda-planejada.js', 'planejamento.js', 'hoje.js', 'rodada6.js', 'rodada6b.js', 'rodada6c.js', 'rodada6d.js', 'rodada7.js']) {
    assert.doesNotMatch(ler(f), /\son(click|change|input|submit|keydown|keyup|load|error)="/, f);
  }
  assert.match(ler('app.js'), /acao === 'fechar-modal'\) \{ e\.preventDefault\(\); closeModal\(\); \}/);
  assert.match(await (await pega('/confirmar/confirmar.js')).text(), /api\/publico\/confirmacao/);
  assert.equal((await pega('/agenda/tema-inicial.js')).status, 200);
});
