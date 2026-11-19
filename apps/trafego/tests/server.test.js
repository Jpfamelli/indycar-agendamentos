'use strict';
/* Contrato HTTP: /api/ping público, tudo mais exige login, erros sempre em
   JSON com o status certo, corpo grande recusado antes do login, estáticos
   com cabeçalhos de segurança. Sobe o servidor numa porta livre. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { servidor, validarConfig, periodoDaQuery, ErroHttp } = require('../server');

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

test('/api/ping é público e responde só { ok: true }', async () => {
  const r = await pedir('/api/ping');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('/api/ping só aceita GET (405 em JSON)', async () => {
  const r = await pedir('/api/ping', { metodo: 'POST' });
  assert.equal(r.status, 405);
  assert.equal(typeof r.json.erro, 'string');
});

test('rotas protegidas sem token devolvem 401 em JSON — inclusive /api/saude', async () => {
  for (const c of ['/api/saude', '/api/painel', '/api/config', '/api/whatsapp/status', '/api/rota-que-nao-existe']) {
    const r = await pedir(c);
    assert.equal(r.status, 401, c);
    assert.equal(r.json.erro, 'faça login');
  }
});

test('token inválido também é 401 sem bater no Supabase (JWT vencido)', async () => {
  // JWT com exp no passado: o porteiro nem pergunta ao Supabase.
  const carga = Buffer.from(JSON.stringify({ exp: 1000 })).toString('base64url');
  const r = await pedir('/api/painel', { cabecalhos: { Authorization: `Bearer a.${carga}.c` } });
  assert.equal(r.status, 401);
});

test('cron sem chave certa é 401', async () => {
  const r = await pedir('/api/cron/sync', { metodo: 'POST', cabecalhos: { 'X-Cron-Chave': 'errada' } });
  assert.equal(r.status, 401);
  assert.equal(r.json.erro, 'chave inválida');
});

test('corpo acima de 1 MB é recusado com 413 antes do login', async () => {
  const r = await pedir('/api/painel', { metodo: 'POST', corpo: 'x'.repeat(1_100_000), cabecalhos: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 413);
  assert.ok(r.json.erro.includes('1 MB'));
});

test('/api/config-publica entrega só o que a tela de login precisa', async () => {
  const r = await pedir('/api/config-publica');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['supabase_anon_key', 'supabase_url']);
});

test('estático: index com no-cache e cabeçalhos de segurança; path traversal barrado', async () => {
  // Rodada 8: a raiz serve a tela nova (tela/) quando ela existe; a antiga fica sempre em /antiga/.
  const r = await pedir('/');
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('content-type').startsWith('text/html'));
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');

  const antiga = await pedir('/antiga/');
  assert.equal(antiga.status, 200);
  assert.equal(antiga.headers.get('cache-control'), 'no-cache');
  assert.equal(antiga.headers.get('x-frame-options'), 'DENY');
  assert.ok(antiga.texto.includes('Central de'));

  const css = await pedir('/antiga/styles.css');
  assert.equal(css.status, 200);
  assert.equal(css.headers.get('cache-control'), 'public, max-age=300');

  for (const caminho of ['/%2e%2e/server.js', '/..%2fserver.js', '/antiga/..%2f..%2fserver.js', '/antiga/%2e%2e/server.js']) {
    const fora = await pedir(caminho);
    assert.notEqual(fora.status, 200, caminho);
    assert.ok(!fora.texto.includes('createServer'), caminho);
  }
  const nada = await pedir('/nao-existe.txt');
  assert.equal(nada.status, 404);
});

test('validarConfig normaliza destinos, booleanos e limites', () => {
  const v = validarConfig({
    cpa_alvo: '90', roas_alvo: null, margem_pct: '',
    whatsapp_destinos: ['12 97403-2299', '5512974032299', '123', '(12) 98888-7777'],
    relatorio_ativo: 'sim', alertas_ativos: undefined, relatorio_hora: '8', alertas_intervalo_min: 60,
  });
  assert.equal(v.cpa_alvo, 90);
  assert.equal(v.roas_alvo, null);
  assert.equal(v.margem_pct, 100);
  assert.deepEqual(v.whatsapp_destinos, ['5512974032299', '5512988887777']);   // sem duplicata, sem número curto
  assert.equal(v.relatorio_ativo, false);     // só true de verdade liga
  assert.equal(v.alertas_ativos, true);       // só false explícito desliga o radar
  assert.equal(v.relatorio_hora, 8);
  assert.equal(v.alertas_intervalo_min, 60);
  assert.equal('orcamento_mensal' in v, false);   // campo ausente não é tocado
});

test('validarConfig recusa hora, intervalo e margem fora da faixa com 400', () => {
  const erro400 = fn => assert.throws(fn, e => e instanceof ErroHttp && e.status === 400);
  erro400(() => validarConfig({ relatorio_hora: 24 }));
  erro400(() => validarConfig({ relatorio_hora: 'oito' }));
  erro400(() => validarConfig({ alertas_intervalo_min: 5 }));
  erro400(() => validarConfig({ margem_pct: 150 }));
  erro400(() => validarConfig({ cpa_alvo: -1 }));
  erro400(() => validarConfig({ whatsapp_destinos: 'texto' }));
});

test('periodoDaQuery: datas válidas passam; datas ruins viram 400; sem datas, N dias terminando ontem', () => {
  const q = new URLSearchParams({ de: '2026-10-01', ate: '2026-10-07' });
  assert.deepEqual(periodoDaQuery(q), { de: '2026-10-01', ate: '2026-10-07' });
  const erro400 = fn => assert.throws(fn, e => e instanceof ErroHttp && e.status === 400);
  erro400(() => periodoDaQuery(new URLSearchParams({ de: '2026-10-07', ate: '2026-10-01' })));   // invertido
  erro400(() => periodoDaQuery(new URLSearchParams({ de: '2026-02-30', ate: '2026-03-01' })));   // dia que não existe
  erro400(() => periodoDaQuery(new URLSearchParams({ de: '2026-10-01' })));                      // só um lado
  erro400(() => periodoDaQuery(new URLSearchParams({ de: '2024-01-01', ate: '2026-01-01' })));   // mais de 365 dias
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const p = periodoDaQuery(new URLSearchParams({ dias: '7' }));
  assert.equal(p.ate, ontem);
  assert.equal(Math.round((new Date(p.ate) - new Date(p.de)) / 86400000) + 1, 7);
  assert.equal(periodoDaQuery(new URLSearchParams({ dias: '9999' })).de <= p.de, true);
});

test('rotas novas (resultados, CSV, IA, credenciais) exigem login', async () => {
  for (const [metodo, rota] of [['GET', '/api/resultados'], ['GET', '/api/resultados.csv'], ['GET', '/api/ranking.csv'],
    ['POST', '/api/ia/leitura'], ['GET', '/api/ia/leituras'], ['POST', '/api/integracoes/testar'], ['POST', '/api/integracoes']]) {
    const r = await pedir(rota, { metodo });
    assert.equal(r.status, 401, `${metodo} ${rota}`);
    assert.equal(typeof r.json.erro, 'string');
  }
});
