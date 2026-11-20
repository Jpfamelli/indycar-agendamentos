'use strict';
/* Rodada 10 (desempenho e rede ruim no servidor): a memória dos arquivos da tela cabe a casca inteira; o porteiro
   não confunde "o Supabase caiu" com "sessão inválida" e confere uma sessão uma vez só quando chegam vários pedidos juntos. */
process.env.SUPABASE_URL = 'https://projetodacasa.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'servico-de-teste';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const http = require('node:http');
const Estatico = require('../estatico');
const auth = require('../auth');

const TELA = path.join(__dirname, '..', 'tela');

/** Os arquivos que o service worker pede a cada abertura (a lista CASCA de tela/sw.js). */
function casca() {
  const sw = fs.readFileSync(path.join(TELA, 'sw.js'), 'utf8');
  const lista = /const CASCA = \[([\s\S]*?)\];/.exec(sw)[1];
  return [...lista.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
}

test('arquivos da tela: abrir o app pela segunda vez não comprime nenhum arquivo de novo', async () => {
  const arquivos = casca();
  assert.ok(arquivos.length > 55, 'a casca tem ' + arquivos.length + ' arquivos');
  // a biblioteca pode estar no node_modules do app ou no da Central (raiz), como o servidor procura
  const doSupabase = ['..', path.join('..', '..', '..')].map(d => path.join(__dirname, d, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js')).find(p => fs.existsSync(p));
  assert.ok(doSupabase, 'biblioteca do Supabase instalada');
  const vendor = { '/vendor/supabase.js': doSupabase };
  const e = Estatico.criar({ dirTela: TELA, dirAntiga: path.join(__dirname, '..', 'public'), vendor });
  const servidor = http.createServer((req, res) => e.servir(req, res, new URL(req.url, 'http://x').pathname));
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}/`;
  const abrir = async () => { for (const f of arquivos) { const r = await fetch(base + f, { headers: { 'accept-encoding': 'gzip' } }); assert.equal(r.status, 200, f); await r.arrayBuffer(); } };
  const original = zlib.gzipSync;
  let compressoes = 0;
  zlib.gzipSync = (...a) => { compressoes++; return original(...a); };
  try {
    await abrir();
    const primeira = compressoes;
    assert.ok(primeira >= 40, 'na primeira abertura os arquivos de texto são comprimidos (' + primeira + ')');
    compressoes = 0;
    const t = process.hrtime.bigint();
    await abrir();
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    assert.equal(compressoes, 0, `na segunda abertura nada é comprimido de novo (foram ${compressoes} de ${primeira}, em ${ms.toFixed(0)} ms)`);
  } finally {
    zlib.gzipSync = original;
    servidor.closeAllConnections?.();
    await new Promise(r => servidor.close(r));
  }
});

/* ---------- porteiro ---------- */
const token = (n, exp = Math.floor(Date.now() / 1000) + 3600) => `a.${Buffer.from(JSON.stringify({ exp, aal: 'aal1', n })).toString('base64url')}.c`;
const pedido = t => ({ headers: { authorization: 'Bearer ' + t } });
const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });

test('porteiro: Supabase fora do ar (5xx ou 429) é "indisponível", não "sessão inválida", e não fica guardado', async () => {
  const fetchOriginal = globalThis.fetch;
  auth.esquecer();
  let fase = 503;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return fase === 200 ? resposta(200, { id: 'u1', email: 'a@b.c', factors: [] }) : resposta(fase, { msg: 'fora' });
    if (u.includes('/rest/v1/perfis')) return resposta(200, [{ ativo: true, papel: 'admin', nome: 'Marina', apps: [] }]);
    return resposta(200, true);
  };
  try {
    const t = token(1);
    assert.deepEqual(await auth.identificar(pedido(t)), { motivo: 'indisponivel' });
    fase = 429;
    assert.deepEqual(await auth.identificar(pedido(t)), { motivo: 'indisponivel' });
    fase = 200;
    const depois = await auth.identificar(pedido(t));
    assert.equal(depois.usuario && depois.usuario.id, 'u1', 'quando o Supabase volta, a mesma sessão entra na hora (nada ficou guardado como inválido)');
    fase = 401;
    auth.esquecer();
    assert.deepEqual(await auth.identificar(pedido(token(2))), { motivo: 'invalido' }, '401 do Supabase continua sendo sessão inválida');
  } finally { globalThis.fetch = fetchOriginal; auth.esquecer(); }
});

test('porteiro: seis pedidos juntos da mesma sessão conferem o login uma vez só (3 idas ao Supabase, não 18)', async () => {
  const fetchOriginal = globalThis.fetch;
  auth.esquecer();
  let idas = 0;
  globalThis.fetch = async (url) => {
    idas++;
    await new Promise(r => setTimeout(r, 20));
    const u = String(url);
    if (u.includes('/auth/v1/user')) return resposta(200, { id: 'u1', email: 'a@b.c', factors: [] });
    if (u.includes('/rest/v1/perfis')) return resposta(200, [{ ativo: true, papel: 'admin', nome: 'Marina', apps: [] }]);
    return resposta(200, true);
  };
  try {
    const t = token(3);
    const todos = await Promise.all(Array.from({ length: 6 }, () => auth.identificar(pedido(t))));
    assert.ok(todos.every(r => r.usuario && r.usuario.id === 'u1'));
    assert.equal(idas, 3, 'uma conferência (sessão, perfil, permissão) para os seis pedidos; foram ' + idas);
    // outra sessão ao mesmo tempo não pega carona na conferência de ninguém
    idas = 0;
    const [a, b] = await Promise.all([auth.identificar(pedido(token(4))), auth.identificar(pedido(token(5)))]);
    assert.ok(a.usuario && b.usuario);
    assert.equal(idas, 6);
  } finally { globalThis.fetch = fetchOriginal; auth.esquecer(); }
});

test('fontes da tela ficam 30 dias no navegador (antes: 1 hora, e 4 idas ao servidor a cada abertura depois disso)', async () => {
  const e = Estatico.criar({ dirTela: TELA, dirAntiga: path.join(__dirname, '..', 'public') });
  const servidor = http.createServer((req, res) => e.servir(req, res, new URL(req.url, 'http://x').pathname));
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  try {
    const base = `http://127.0.0.1:${servidor.address().port}/`;
    const fontes = casca().filter(f => f.endsWith('.woff2'));
    assert.equal(fontes.length, 4);
    for (const f of fontes) {
      const r = await fetch(base + f); await r.arrayBuffer();
      const idade = Number((/max-age=(\d+)/.exec(r.headers.get('cache-control') || '') || [])[1]);
      assert.ok(idade >= 30 * 86400, f + ': ' + r.headers.get('cache-control'));
      assert.ok(r.headers.get('etag'), 'a etiqueta continua: depois dos 30 dias a resposta é 304');
    }
    const html = await fetch(base); await html.arrayBuffer();
    assert.equal(html.headers.get('cache-control'), 'no-cache', 'a página segue sempre conferida');
    const js = await fetch(base + 'js/app.js'); await js.arrayBuffer();
    assert.equal(js.headers.get('cache-control'), 'public, max-age=300', 'o código segue com 5 minutos (publicação nova chega logo)');
  } finally {
    servidor.closeAllConnections?.();
    await new Promise(r => servidor.close(r));
  }
});
