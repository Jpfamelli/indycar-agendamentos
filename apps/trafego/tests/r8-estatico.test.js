'use strict';
/* Rodada 8 (frente T2a) — arquivos da tela: a tela nova (tela/) na raiz do app, a antiga (public/)
   em /antiga/, e tudo funcionando com o app montado num prefixo (a Central entrega req.prefixo).
   Usa pastas de mentira para não depender do que as outras frentes estão escrevendo em tela/. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const Estatico = require('../estatico');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'trafego-estatico-'));
const TELA = path.join(raiz, 'tela'), ANTIGA = path.join(raiz, 'public'), VAZIA = path.join(raiz, 'sem-tela');
const escrever = (arquivo, texto) => { fs.mkdirSync(path.dirname(arquivo), { recursive: true }); fs.writeFileSync(arquivo, texto); };

escrever(path.join(TELA, 'index.html'), '<!doctype html><html><head><title>Tela nova</title><link rel="manifest" href="manifest.webmanifest"><link rel="stylesheet" href="ds/base.css"></head><body><a href="#conteudo">pular</a><script type="module" src="js/app.js"></script></body></html>');
escrever(path.join(TELA, 'js', 'app.js'), 'export const ola = "tela nova"; fetch("api/hoje");');
escrever(path.join(TELA, 'ds', 'base.css'), 'body{margin:0}');
escrever(path.join(TELA, 'manifest.webmanifest'), JSON.stringify({ name: 'IndyCar Tráfego', start_url: './', scope: './', icons: [{ src: 'icone.png' }] }));
escrever(path.join(TELA, 'sw.js'), 'const CACHE = "indycar-trafego-v1";');
escrever(path.join(TELA, '_mock', 'servidor.mjs'), 'export const segredo = "servidor de mentira";');
escrever(path.join(TELA, 'GUIA-VISUAL.md'), '# guia interno');
escrever(path.join(TELA, 'js', 'logica.test.js'), 'teste da tela');
escrever(path.join(TELA, '.env'), 'SEGREDO=1');
escrever(path.join(ANTIGA, 'index.html'), '<!doctype html><html><head><title>Central de Tráfego Pago</title><link rel="preload" href="/fontes/dm.woff2" as="font"><link rel="stylesheet" href="styles.css"></head><body><a href="#">x</a><script src="app.js"></script></body></html>');
escrever(path.join(ANTIGA, 'app.js'), "const a = api('/api/painel'); fetch(\"/api/config-publica\"); const t = `/api/leads?x=${1}`; navigator.serviceWorker.register('/sw.js');");
escrever(path.join(ANTIGA, 'styles.css'), "@font-face{font-family:X;src:url('/fontes/dm.woff2') format('woff2')}");
escrever(path.join(ANTIGA, 'fontes', 'dm.woff2'), 'fonte');
escrever(path.join(ANTIGA, 'sw.js'), "const VERSAO = 'ads-casca-v4';");
const VENDOR = { '/vendor/supabase.js': path.join(raiz, 'supabase.js') };
escrever(VENDOR['/vendor/supabase.js'], 'var supabase = {};');

/* Um servidor por cenário: com tela nova e sem tela nova. O cabeçalho x-prefixo imita a Central. */
function subir(estatico) {
  const s = http.createServer((req, res) => {
    if (req.headers['x-prefixo']) req.prefixo = req.headers['x-prefixo'];
    estatico.servir(req, res, new URL(req.url, 'http://x').pathname);
  });
  return new Promise(ok => s.listen(0, '127.0.0.1', () => ok(s)));
}
let comTela, semTela;
test.before(async () => {
  comTela = await subir(Estatico.criar({ dirTela: TELA, dirAntiga: ANTIGA, vendor: VENDOR }));
  semTela = await subir(Estatico.criar({ dirTela: VAZIA, dirAntiga: ANTIGA, vendor: VENDOR }));
});
test.after(async () => {
  for (const s of [comTela, semTela]) { s.closeAllConnections?.(); await new Promise(r => s.close(r)); }
  fs.rmSync(raiz, { recursive: true, force: true });
});
async function pedir(servidor, caminho, { prefixo, metodo = 'GET', aceita = 'text/html,*/*' } = {}) {
  const r = await fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`, {
    method: metodo, redirect: 'manual', headers: { accept: aceita, ...(prefixo ? { 'x-prefixo': prefixo } : {}) },
  });
  return { status: r.status, texto: metodo === 'HEAD' ? '' : await r.text(), headers: r.headers };
}

test('com tela/index.html, a raiz serve a tela nova (HTML sem cache) e os arquivos dela', async () => {
  const r = await pedir(comTela, '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.match(r.texto, /Tela nova/);
  const js = await pedir(comTela, '/js/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(js.texto, /tela nova/);
  assert.equal((await pedir(comTela, '/ds/base.css')).headers.get('cache-control'), 'public, max-age=300');
});

test('manifest e service worker da tela nova saem com o tipo certo e sem cache (versão nova chega na hora)', async () => {
  const m = await pedir(comTela, '/manifest.webmanifest');
  assert.equal(m.status, 200);
  assert.match(m.headers.get('content-type'), /manifest\+json/);
  assert.equal(m.headers.get('cache-control'), 'no-cache');
  assert.equal(JSON.parse(m.texto).start_url, './', 'o servidor não mexe no manifest: endereço relativo continua relativo');
  const sw = await pedir(comTela, '/sw.js');
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get('cache-control'), 'no-cache');
  assert.match(sw.texto, /indycar-trafego-/);
});

test('a tela antiga continua em /antiga/ (com e sem tela nova) e /antiga redireciona para a barra', async () => {
  for (const s of [comTela, semTela]) {
    const r = await pedir(s, '/antiga/');
    assert.equal(r.status, 200);
    assert.match(r.texto, /Central de Tráfego Pago/);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.equal((await pedir(s, '/antiga/styles.css')).status, 200);
    assert.equal((await pedir(s, '/antiga/fontes/dm.woff2')).headers.get('content-type'), 'font/woff2');
    const sw = await pedir(s, '/antiga/sw.js');
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.match(sw.texto, /ads-casca-/);
    const semBarra = await pedir(s, '/antiga?aba=radar');
    assert.equal(semBarra.status, 308);
    assert.equal(semBarra.headers.get('location'), '/antiga/?aba=radar');
  }
});

test('sem tela/index.html, a raiz continua servindo a tela antiga (nada quebra antes de a tela nova chegar)', async () => {
  const r = await pedir(semTela, '/');
  assert.equal(r.status, 200);
  assert.match(r.texto, /Central de Tráfego Pago/);
  assert.equal((await pedir(semTela, '/styles.css')).status, 200);
  assert.equal((await pedir(semTela, '/js/app.js')).status, 404);
});

test('/vendor/supabase.js continua servido daqui, na raiz e dentro de /antiga/', async () => {
  for (const caminho of ['/vendor/supabase.js', '/antiga/vendor/supabase.js']) {
    const v = await pedir(comTela, caminho);
    assert.equal(v.status, 200, caminho);
    assert.match(v.headers.get('content-type'), /javascript/);
    assert.equal(v.headers.get('cache-control'), 'public, max-age=86400');
  }
});

test('montado num prefixo: redirecionamento leva o prefixo e a tela antiga chama a API e as fontes dentro dele', async () => {
  const semBarra = await pedir(comTela, '/antiga', { prefixo: '/trafego' });
  assert.equal(semBarra.headers.get('location'), '/trafego/antiga/');
  const js = (await pedir(comTela, '/antiga/app.js', { prefixo: '/trafego' })).texto;
  assert.match(js, /api\('\/trafego\/api\/painel'\)/);
  assert.match(js, /fetch\("\/trafego\/api\/config-publica"\)/);
  assert.match(js, /`\/trafego\/api\/leads\?x=/);
  assert.doesNotMatch(js, /['"`]\/api\//, 'nenhuma chamada sobrou apontando para a raiz do domínio');
  const css = (await pedir(comTela, '/antiga/styles.css', { prefixo: '/trafego' })).texto;
  assert.match(css, /url\('\/trafego\/antiga\/fontes\/dm\.woff2'\)/);
  const html = (await pedir(comTela, '/antiga/', { prefixo: '/trafego' })).texto;
  assert.match(html, /href="\/trafego\/antiga\/fontes\/dm\.woff2"/);
});

test('sem prefixo, a tela antiga em /antiga/ acha as fontes dela e a API da raiz', async () => {
  const css = (await pedir(comTela, '/antiga/styles.css')).texto;
  assert.match(css, /url\('\/antiga\/fontes\/dm\.woff2'\)/);
  const js = (await pedir(comTela, '/antiga/app.js')).texto;
  assert.match(js, /api\('\/api\/painel'\)/, 'sozinho na porta 3400 a API está na raiz');
});

test('sem tela nova e montado num prefixo, a tela antiga na raiz do app também fala dentro do prefixo', async () => {
  const js = (await pedir(semTela, '/app.js', { prefixo: '/trafego' })).texto;
  assert.match(js, /api\('\/trafego\/api\/painel'\)/);
  const css = (await pedir(semTela, '/styles.css', { prefixo: '/trafego' })).texto;
  assert.match(css, /url\('\/trafego\/fontes\/dm\.woff2'\)/);
  assert.match((await pedir(semTela, '/app.js')).texto, /api\('\/api\/painel'\)/, 'sem prefixo nada é reescrito');
});

test('a tela nova não é reescrita pelo servidor: ela já nasce com endereços relativos', async () => {
  const js = (await pedir(comTela, '/js/app.js', { prefixo: '/trafego' })).texto;
  assert.match(js, /fetch\("api\/hoje"\)/);
  const html = (await pedir(comTela, '/', { prefixo: '/trafego' })).texto;
  assert.doesNotMatch(html, /<base\s/i, 'sem <base>: com ele, link de âncora recarregaria a página');
});

test('o que não é arquivo é 404: a tela nova navega por âncora (#/jornada), não por endereço no servidor', async () => {
  assert.equal((await pedir(comTela, '/jornada?pendencia=sem_valor')).status, 404);
  assert.equal((await pedir(comTela, '/js/nao-existe.js')).status, 404);
  assert.equal((await pedir(comTela, '/js/')).status, 404, 'pasta não é arquivo');
  assert.equal((await pedir(semTela, '/jornada')).status, 404);
});

test('o que é de bastidor não é servido: servidor de mentira, guia, testes, arquivo escondido e fuga de pasta', async () => {
  for (const caminho of ['/_mock/servidor.mjs', '/GUIA-VISUAL.md', '/js/logica.test.js', '/.env', '/%2e%2e/public/app.js', '/..%2fpublic%2fapp.js', '/js/%00app.js']) {
    const r = await pedir(comTela, caminho);
    assert.notEqual(r.status, 200, caminho);
    assert.doesNotMatch(r.texto, /servidor de mentira|guia interno|teste da tela|SEGREDO|api\(/, caminho);
  }
  assert.equal((await pedir(comTela, '/%E0%A4%A')).status, 400, 'endereço mal formado é 400');
});

test('só GET e HEAD: outros métodos em arquivo são 405 com Allow', async () => {
  const r = await pedir(comTela, '/js/app.js', { metodo: 'POST' });
  assert.equal(r.status, 405);
  assert.match(r.headers.get('allow'), /GET/);
  assert.equal((await pedir(comTela, '/js/app.js', { metodo: 'HEAD' })).status, 200);
});

test('prefixo estranho vindo de fora é ignorado (nada de cabeçalho Location com lixo)', async () => {
  for (const ruim of ['//evil.com', '/a b', 'javascript:x', '/trafego/../x']) {
    const r = await pedir(comTela, '/antiga', { prefixo: ruim });
    assert.equal(r.headers.get('location'), '/antiga/', ruim);
  }
});

test('normalizarPrefixo: aceita só caminho simples e tira a barra do fim', () => {
  assert.equal(Estatico.normalizarPrefixo('/trafego'), '/trafego');
  assert.equal(Estatico.normalizarPrefixo('/trafego/'), '/trafego');
  assert.equal(Estatico.normalizarPrefixo(''), '');
  assert.equal(Estatico.normalizarPrefixo(undefined), '');
  assert.equal(Estatico.normalizarPrefixo('/'), '');
  assert.equal(Estatico.normalizarPrefixo('//evil.com'), '');
  assert.equal(Estatico.normalizarPrefixo('/a/b-c_1'), '/a/b-c_1');
});
