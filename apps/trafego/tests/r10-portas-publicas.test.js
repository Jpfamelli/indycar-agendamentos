'use strict';
/* Rodada 10: as portas que não pedem login (IA de fora, imagem do anúncio, script do site).
   Chave errada tem limite por endereço; anúncio sem imagem não vira consulta a cada pedido; o script do site
   responde "não mudou" a quem já tem. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Chaves = require('../ia/chaves');
const coletor = require('../coletor');
const { criarBanco } = require('./apoio/banco-falso');
const { subir } = require('./apoio/r10-http');

const pedidoDe = (ip, chave) => ({ headers: { 'cf-connecting-ip': ip, authorization: 'Bearer ' + chave }, socket: {} });
const CHAVE = n => 'ica_' + String(n).padStart(40, 'A');

test('porta da IA: depois de 20 chaves erradas do mesmo endereço, nem pergunta mais ao banco (429 por 10 minutos)', async () => {
  Chaves.tentativas.limpar();
  let consultas = 0;
  const falsas = {
    conferir: async (c) => { consultas++; return c === CHAVE(999) ? { ok: true, chave: { id: 'k1', nome: 'boa', prefixo: 'ica_AA', escopos: ['ler'], ver_pii: false } } : { ok: false, motivo: 'nao_existe' }; },
    limitar: () => ({ ok: true }), registrarUso: () => {},
  };
  const q = new URLSearchParams();
  for (let i = 0; i < 20; i++) {
    const r = await Chaves.autenticar(pedidoDe('198.51.100.7', CHAVE(i)), q, falsas);
    assert.equal(r.status, 401, 'tentativa ' + i);
  }
  assert.equal(consultas, 20);
  const bloqueada = await Chaves.autenticar(pedidoDe('198.51.100.7', CHAVE(21)), q, falsas);
  assert.equal(bloqueada.status, 429);
  assert.equal(bloqueada.codigo, 'limite');
  assert.ok(Number(bloqueada.cabecalhos['Retry-After']) > 0);
  assert.equal(consultas, 20, 'a vigésima primeira não foi ao banco');
  const certaDoMesmoIp = await Chaves.autenticar(pedidoDe('198.51.100.7', CHAVE(999)), q, falsas);
  assert.equal(certaDoMesmoIp.status, 429, 'durante o bloqueio nem a chave certa passa (senão dava para continuar adivinhando)');
  const outro = await Chaves.autenticar(pedidoDe('198.51.100.8', CHAVE(999)), q, falsas);
  assert.equal(outro.ok, true, 'outro endereço com chave boa segue normal');
  Chaves.tentativas.limpar();
});

test('porta da IA: chave certa não conta como tentativa (quem usa direito nunca é bloqueado)', async () => {
  Chaves.tentativas.limpar();
  const falsas = { conferir: async () => ({ ok: true, chave: { id: 'k1', nome: 'boa', prefixo: 'ica_AA', escopos: ['ler'], ver_pii: false } }), limitar: () => ({ ok: true }), registrarUso: () => {} };
  for (let i = 0; i < 60; i++) assert.equal((await Chaves.autenticar(pedidoDe('198.51.100.9', CHAVE(999)), new URLSearchParams(), falsas)).ok, true);
});

test('imagem do anúncio: anúncio sem imagem (ou com a imagem fora do ar) é lembrado por 10 minutos', async () => {
  const sb = criarBanco({ ads_metricas_dia: [
    { plataforma: 'meta', nivel: 'anuncio', anuncio_ext: 'quebrada1', data: '2026-11-10', miniatura_url: 'https://scontent.xx.fbcdn.net/v/venceu.jpg' },
  ] });
  let pedidosDeFora = 0;
  const fetch = async () => { pedidosDeFora++; return new Response('gone', { status: 403, headers: { 'content-type': 'text/plain' } }); };
  const agora = Date.parse('2026-11-20T12:00:00Z');
  for (let i = 0; i < 5; i++) assert.equal((await coletor.miniatura({ plataforma: 'meta', anuncio: 'naoexiste1', sb, fetch, agora: agora + i * 1000 })).status, 404);
  assert.equal(sb.idas(), 1, 'cinco pedidos do mesmo anúncio sem imagem: uma consulta ao banco, não cinco (foram ' + sb.idas() + ')');
  sb.zerar();
  for (let i = 0; i < 5; i++) assert.equal((await coletor.miniatura({ plataforma: 'meta', anuncio: 'quebrada1', sb, fetch, agora: agora + i * 1000 })).status, 404);
  assert.equal(pedidosDeFora, 1, 'a imagem que a Meta recusou é pedida uma vez, não cinco');
  assert.equal(sb.idas(), 1);
  sb.zerar();
  await coletor.miniatura({ plataforma: 'meta', anuncio: 'naoexiste1', sb, fetch, agora: agora + 11 * 60_000 });
  assert.equal(sb.idas(), 1, 'passados os 10 minutos, confere de novo (a coleta pode ter trazido a imagem)');
});

test('script do site (rastreio.js): quem já tem a mesma versão recebe 304 sem corpo', async () => {
  const app = await subir();
  try {
    const r = await app.pedir('/rastreio.js', { papel: null });
    assert.equal(r.status, 200);
    const etag = r.cabecalhos.get('etag');
    assert.match(etag || '', /^W\/"[A-Za-z0-9_-]{10,}"$/);
    assert.ok(r.texto.length > 1000);
    const de = await app.pedir('/rastreio.js', { papel: null, cabecalhos: { 'if-none-match': etag } });
    assert.equal(de.status, 304);
    assert.equal(de.texto.length, 0, `nada trafega de novo (antes: ${r.texto.length} bytes a cada hora, por visitante)`);
    assert.equal(de.cabecalhos.get('cache-control'), 'public, max-age=3600');
    assert.equal(de.cabecalhos.get('access-control-allow-origin'), '*');
    assert.equal((await app.pedir('/rastreio.js', { papel: null, cabecalhos: { 'if-none-match': '"outra"' } })).status, 200);
  } finally { await app.fechar(); }
});

test('script do site (rastreio.js): vai comprimido para o navegador que aceita gzip', async () => {
  const app = await subir();
  try {
    const http = require('node:http');
    const cru = (cab) => new Promise((ok, falha) => http.get(app.base + '/rastreio.js', { headers: cab }, (res) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => ok({ res, corpo: Buffer.concat(p) })); }).on('error', falha));
    const sem = await cru({});
    const com = await cru({ 'accept-encoding': 'gzip' });
    assert.equal(com.res.headers['content-encoding'], 'gzip');
    assert.ok(com.corpo.length < sem.corpo.length * 0.6, `com gzip ${com.corpo.length} bytes, sem ${sem.corpo.length}`);
    assert.equal(require('node:zlib').gunzipSync(com.corpo).toString('utf8'), sem.corpo.toString('utf8'), 'é o mesmo script');
  } finally { await app.fechar(); }
});
