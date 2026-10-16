'use strict';
/* 16/10 (decisão do João): timeout ou conexão caída DEPOIS de mandar o pedido ao CodeWords
   não pode virar mensagem duplicada. Erros do fetch de verdade (undici) contra um CodeWords
   falso local: timeout, conexão derrubada no meio, porta fechada (recusa antes de enviar). */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { criarEntregador, semConfirmacaoDoErro, ehSemConfirmacao, PREFIXO_SEM_CONFIRMACAO } = require('../lib/entrega.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');

async function codewordsFalso(modo) {
  const srv = http.createServer(async (req, res) => {
    for await (const _ of req) { /* lê o pedido inteiro: a mensagem "chegou" ao CodeWords */ }
    if (modo === 'lento') return setTimeout(() => { try { res.end('{"success":true}'); } catch { /* fechou */ } }, 800);
    if (modo === 'cai') return req.socket.destroy();
    if (modo === '500') { res.writeHead(500); return res.end('{"detail":"internal"}'); }
    if (modo === '401') { res.writeHead(401); return res.end('{"detail":"Unauthorized"}'); }
    res.end('{"success":true}');
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${srv.address().port}/send`, fechar: () => new Promise(ok => { srv.closeAllConnections?.(); srv.close(ok); }) };
}
async function erroDoFetch(url, ms = 200) {
  try { const r = await fetch(url, { method: 'POST', body: 'phone=1&message=oi', signal: AbortSignal.timeout(ms) }); await r.text(); return { status: r.status }; }
  catch (e) { return { erro: e }; }
}

test('timeout depois do pedido = sem confirmação', async () => {
  const cw = await codewordsFalso('lento');
  try { const r = await erroDoFetch(cw.url); assert.ok(r.erro); assert.equal(semConfirmacaoDoErro(r.erro), true); }
  finally { await cw.fechar(); }
});

test('conexão derrubada no meio (o CodeWords recebeu o pedido) = sem confirmação', async () => {
  const cw = await codewordsFalso('cai');
  try { const r = await erroDoFetch(cw.url, 3000); assert.ok(r.erro, 'deveria falhar'); assert.equal(semConfirmacaoDoErro(r.erro), true, String(r.erro?.cause?.code || r.erro)); }
  finally { await cw.fechar(); }
});

test('porta fechada (recusa antes de enviar) NÃO é sem confirmação: segue como falha comum', async () => {
  const livre = await new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const r = await erroDoFetch(`http://127.0.0.1:${livre}/send`, 3000);
  assert.ok(r.erro); assert.equal(semConfirmacaoDoErro(r.erro), false);
  assert.equal(semConfirmacaoDoErro(null), false);
  assert.equal(semConfirmacaoDoErro(new Error('qualquer coisa')), false);
});

test('500 e 401 respondem (não são exceção): o fluxo de erro de sempre continua', async () => {
  for (const modo of ['500', '401']) {
    const cw = await codewordsFalso(modo);
    try { const r = await erroDoFetch(cw.url, 3000); assert.equal(r.status, Number(modo)); }
    finally { await cw.fechar(); }
  }
});

const ID = 'aaaaaaaa-2222-4222-8222-222222222222';
test('entrega: sem confirmação grava a dúvida e NÃO reenvia numa repetição; só com "Reenviar" (clique)', async () => {
  const sb = criarSbFalso({ whatsapp_mensagens: [{ id: ID, status: 'pendente', direcao: 'saida', conversa_id: 'c1' }] });
  let n = 0, resposta = { ok: false, semConfirmacao: true, codigo: 'sem_confirmacao', erro: PREFIXO_SEM_CONFIRMACAO + ': o CodeWords não respondeu em 60 s.' };
  const E = criarEntregador({ banco: () => sb, enviar: async () => { n++; return resposta; } });
  const r1 = await E.entregar({ telefone: '12999998888', corpo: 'oi' }, ID);
  assert.equal(r1.semConfirmacao, true); assert.equal(n, 1);
  let { data } = await sb.from('whatsapp_mensagens').select('*').eq('id', ID).maybeSingle();
  assert.equal(data.status, 'falhou'); assert.ok(ehSemConfirmacao(data.erro));
  // retomada automática / repetição do navegador: 409, nada sai
  const r2 = await E.entregar({ telefone: '12999998888', corpo: 'oi' }, ID);
  assert.equal(r2.status, 409); assert.equal(r2.codigo, 'sem_confirmacao'); assert.equal(n, 1);
  assert.ok(ehSemConfirmacao(r2.erro), 'o texto mantém o prefixo (a tela regrava o erro)');
  // a pessoa conferiu e clicou em Reenviar
  resposta = { ok: true };
  const r3 = await E.entregar({ telefone: '12999998888', corpo: 'oi', reenviar: true }, ID);
  assert.equal(r3.ok, true); assert.equal(n, 2);
  ({ data } = await sb.from('whatsapp_mensagens').select('*').eq('id', ID).maybeSingle());
  assert.equal(data.status, 'enviado');
});

test('entrega: falha comum (500) continua podendo "Tentar de novo" sem confirmação extra', async () => {
  const sb = criarSbFalso({ whatsapp_mensagens: [{ id: ID, status: 'pendente', direcao: 'saida', conversa_id: 'c1' }] });
  let n = 0;
  const E = criarEntregador({ banco: () => sb, enviar: async () => { n++; return n === 1 ? { ok: false, erro: 'HTTP 500' } : { ok: true }; } });
  await E.entregar({ telefone: '1', corpo: 'oi' }, ID);
  const r = await E.entregar({ telefone: '1', corpo: 'oi' }, ID);
  assert.equal(r.ok, true); assert.equal(n, 2);
});
