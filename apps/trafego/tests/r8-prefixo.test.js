'use strict';
/* Rodada 8 (frente T2a) — o app mora dentro da Central, em /trafego/.
   A Central tira o prefixo da URL, põe req.prefixo = '/trafego' e chama handler(req, res) direto.
   Este teste faz exatamente isso (uma "Central" de dez linhas) e confere que nada no app supõe a
   raiz do domínio: redirecionamento, Location, endereços da página, manifest, API. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { handler, iniciar, servidor, estatico } = require('../server');

const PREFIXO = '/trafego';
const central = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://central.local');
  res.setHeader('X-Request-Id', 'central-abc123');            // a Central escolhe o identificador antes de entregar
  if (u.pathname === PREFIXO) { res.writeHead(308, { Location: `${PREFIXO}/${u.search}` }); return res.end(); }
  if (!u.pathname.startsWith(`${PREFIXO}/`)) { res.writeHead(404); return res.end('fora do app'); }
  req.url = u.pathname.slice(PREFIXO.length) + u.search;       // já sem o prefixo
  req.prefixo = PREFIXO;
  handler(req, res);                                           // chamada direta, como a Central faz
});

let base;
test.before(async () => {
  await new Promise(r => central.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${central.address().port}`;
});
test.after(async () => {
  central.closeAllConnections?.();
  await new Promise(r => central.close(r));
});
async function pedir(caminho, { metodo = 'GET', cabecalhos = {} } = {}) {
  const r = await fetch(base + caminho, { method: metodo, redirect: 'manual', headers: { accept: 'text/html,*/*', ...cabecalhos } });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch {}
  return { status: r.status, texto, json, headers: r.headers };
}
/* Endereços de raiz ("/x", não "//host") em atributos href/src/action da página. */
const enderecosDeRaiz = html => [...String(html).matchAll(/\b(?:href|src|action)\s*=\s*["']([/](?![/])[^"']*)["']/gi)].map(m => m[1]);

test('a API responde dentro do prefixo e o pedido leva o identificador que a Central escolheu', async () => {
  const r = await pedir('/trafego/api/ping');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(r.headers.get('x-request-id'), 'central-abc123');
});

test('rota com login, sem sessão: 401 em JSON, sem redirecionar para lugar nenhum', async () => {
  for (const caminho of ['/trafego/api/hoje', '/trafego/api/campanhas', '/trafego/api/conexoes', '/trafego/api/relatorios/texto?tipo=diario', '/trafego/api/painel']) {
    const r = await pedir(caminho);
    assert.equal(r.status, 401, caminho);
    assert.equal(typeof r.json.erro, 'string', caminho);
    assert.equal(r.headers.get('location'), null, caminho);
  }
});

test('a página do app abre em /trafego/ e nenhum endereço dela aponta para a raiz do domínio', async () => {
  const r = await pedir('/trafego/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html/);
  const deRaiz = enderecosDeRaiz(r.texto).filter(e => !e.startsWith(`${PREFIXO}/`));
  assert.deepEqual(deRaiz, [], `endereço que só funciona na raiz do domínio (tela ${estatico.temTelaNova() ? 'nova, pasta tela/' : 'antiga'})`);
});

test('/trafego/antiga redireciona para dentro do prefixo e a tela antiga fala com a API dentro dele', async () => {
  const semBarra = await pedir('/trafego/antiga?aba=radar');
  assert.equal(semBarra.status, 308);
  assert.equal(semBarra.headers.get('location'), '/trafego/antiga/?aba=radar');

  const pagina = await pedir('/trafego/antiga/');
  assert.equal(pagina.status, 200);
  assert.match(pagina.texto, /Central de/);
  assert.deepEqual(enderecosDeRaiz(pagina.texto).filter(e => !e.startsWith(`${PREFIXO}/`)), []);

  for (const arquivo of ['app.js', 'conta.js', 'acoes.js', 'operacao.js']) {
    const js = await pedir(`/trafego/antiga/${arquivo}`);
    assert.equal(js.status, 200, arquivo);
    assert.doesNotMatch(js.texto, /['"`]\/api\//, `${arquivo}: chamada de API apontando para a raiz do domínio`);
  }
  assert.match((await pedir('/trafego/antiga/app.js')).texto, /'\/trafego\/api\//);
  const css = await pedir('/trafego/antiga/styles.css');
  assert.doesNotMatch(css.texto, /url\(['"]?\/fontes\//, 'fonte apontando para a raiz do domínio');
  assert.equal((await pedir('/trafego/antiga/fontes/dm-sans-variavel.woff2')).status, 200);
  assert.equal((await pedir('/trafego/antiga/vendor/supabase.js')).status, 200);
});

test('manifest da tela nova (quando existir): início, escopo e ícones relativos ao app, nunca à raiz do domínio', async t => {
  if (!estatico.temTelaNova()) return t.skip('a pasta tela/ ainda não tem index.html');
  let achou = false;
  for (const nome of ['manifest.webmanifest', 'manifest.json']) {
    const r = await pedir(`/trafego/${nome}`);
    if (r.status !== 200) continue;
    achou = true;
    const m = r.json;
    assert.ok(m && typeof m === 'object', `${nome} precisa ser JSON`);
    const enderecos = [m.start_url, m.scope, m.id, ...(m.icons || []).map(i => i.src), ...(m.shortcuts || []).map(s => s.url)].filter(v => typeof v === 'string');
    for (const e of enderecos) assert.ok(!/^[/](?![/])/.test(e) || e.startsWith(`${PREFIXO}/`), `${nome}: "${e}" aponta para a raiz do domínio`);
  }
  if (!achou) t.skip('a tela nova não tem manifest');
});

test('service worker da tela nova (quando existir) sai de dentro do prefixo, como JavaScript e sem cache', async t => {
  if (!estatico.temTelaNova()) return t.skip('a pasta tela/ ainda não tem index.html');
  const r = await pedir('/trafego/sw.js');
  if (r.status !== 200) return t.skip('a tela nova não tem service worker');
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.equal(r.headers.get('service-worker-allowed'), null, 'o escopo é o do próprio prefixo; nada de pedir a raiz');
});

test('iniciar({ ouvir: false }) não abre porta: é a Central quem escuta e chama o handler', () => {
  const r = iniciar({ ouvir: false, rotinas: false });
  assert.deepEqual({ ouvindo: r.ouvindo, rotinas: r.rotinas }, { ouvindo: false, rotinas: false });
  assert.equal(servidor.listening, false);
});

test('o handler nunca rejeita: endereço impossível vira resposta, não erro solto na Central', async () => {
  const cabecalhos = {};
  let status = 0, corpo = '';
  const res = {
    headersSent: false, writableEnded: false,
    setHeader: (k, v) => { cabecalhos[k.toLowerCase()] = v; }, getHeader: k => cabecalhos[k.toLowerCase()],
    writeHead(s, c = {}) { status = s; this.headersSent = true; for (const [k, v] of Object.entries(c)) cabecalhos[k.toLowerCase()] = v; },
    end(c) { corpo = c ? String(c) : ''; this.writableEnded = true; }, on() {},
  };
  const req = { url: 'http://[', method: 'GET', headers: {}, prefixo: PREFIXO, socket: {} };
  res.req = req;
  await assert.doesNotReject(handler(req, res));
  assert.equal(status, 400);
  assert.match(corpo, /Endereço inválido/);
});
