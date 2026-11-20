'use strict';
/* Rodada 9: os arquivos da tela saem com ETag; quem já tem a mesma versão ouve 304 (sem corpo) em vez de baixar
   tudo de novo. O index.html é no-cache e o service worker pede a casca pela rede a cada abertura. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Estatico = require('../estatico');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'trafego-etag-'));
const TELA = path.join(raiz, 'tela'), ANTIGA = path.join(raiz, 'public');
const escrever = (arquivo, texto) => { fs.mkdirSync(path.dirname(arquivo), { recursive: true }); fs.writeFileSync(arquivo, texto); };
escrever(path.join(TELA, 'index.html'), '<!doctype html><title>Tela</title>');
escrever(path.join(TELA, 'js', 'app.js'), 'export const versao = 1;' + ' '.repeat(2000));
escrever(path.join(ANTIGA, 'index.html'), '<!doctype html><title>Antiga</title>');

let servidor;
test.before(async () => {
  const e = Estatico.criar({ dirTela: TELA, dirAntiga: ANTIGA });
  servidor = http.createServer((req, res) => e.servir(req, res, new URL(req.url, 'http://x').pathname));
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
});
test.after(async () => {
  servidor.closeAllConnections?.();
  await new Promise((r) => servidor.close(r));
  fs.rmSync(raiz, { recursive: true, force: true });
});
const pedir = (caminho, cabecalhos = {}) => fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`, { headers: cabecalhos });

test('arquivo da tela sai com ETag; a mesma ETag de volta recebe 304 sem corpo, com o mesmo cache', async () => {
  for (const caminho of ['/', '/js/app.js']) {
    const r = await pedir(caminho, { 'accept-encoding': 'gzip' });
    assert.equal(r.status, 200);
    const etag = r.headers.get('etag');
    assert.match(etag, /^W\/"[A-Za-z0-9_-]{20}"$/, caminho);
    await r.arrayBuffer();
    const de = await pedir(caminho, { 'if-none-match': etag, 'accept-encoding': 'gzip' });
    assert.equal(de.status, 304, caminho);
    assert.equal((await de.arrayBuffer()).byteLength, 0);
    assert.equal(de.headers.get('etag'), etag);
    assert.equal(de.headers.get('cache-control'), r.headers.get('cache-control'));
    // sem gzip é o mesmo conteúdo: a etiqueta vale também (e a lista com outras etiquetas)
    assert.equal((await pedir(caminho, { 'if-none-match': '"outra", ' + etag })).status, 304);
  }
});

test('arquivo mudou: etiqueta nova e 200 com o conteúdo novo; etiqueta errada nunca dá 304', async () => {
  const antes = (await pedir('/js/app.js')).headers.get('etag');
  assert.equal((await pedir('/js/app.js', { 'if-none-match': 'W/"nao-e-esta"' })).status, 200);
  escrever(path.join(TELA, 'js', 'app.js'), 'export const versao = 2;' + ' '.repeat(2000));
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(TELA, 'js', 'app.js'), t, t);
  const r = await pedir('/js/app.js', { 'if-none-match': antes });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /versao = 2/);
  assert.notEqual(r.headers.get('etag'), antes);
});
