'use strict';
/* Rodada 10: envio de arquivo (POST /api/mensagens/enviar-arquivo) contra o server.js de verdade,
   com banco, login, aparelho e Storage de mentira (test/apoio/r10-servidor.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { comServidorR10, resposta, ID, SUPA, CODEWORDS } = require('./apoio/r10-servidor.js');

const B64 = Buffer.from('arquivo de teste').toString('base64');
const aparelhoOk = u => (u.startsWith(CODEWORDS) ? resposta(200, '{"status":"success"}') : u.startsWith(SUPA + '/storage/') ? resposta(200, '{}') : null);
const arquivo = extra => ({ telefone: '12988887777', nome_arquivo: 'laudo.pdf', mime: 'application/pdf', base64: B64, conversaId: ID.conversa, ...extra });
const mandar = (pedir, corpo) => pedir('/api/mensagens/enviar-arquivo', { metodo: 'POST', como: 'atendente', corpo });

test('R10-ATD-007: a conversa do arquivo precisa ser um id de verdade (nada de "../" no caminho da cópia)', async () => {
  await comServidorR10({ rede: aparelhoOk }, async ({ pedir, chamadas }) => {
    const r = await mandar(pedir, arquivo({ conversaId: '../outro-balde' }));
    assert.equal(r.status, 400);
    assert.equal(chamadas.length, 0, 'nada saiu para o aparelho nem para o Storage');
    const bom = await mandar(pedir, arquivo());
    assert.equal(bom.status, 200);
    const copia = chamadas.find(c => c.url.includes('/storage/v1/object/'));
    assert.ok(copia.url.startsWith(`${SUPA}/storage/v1/object/anexos/${ID.conversa}/`), copia.url);
  });
});

test('R10-ATD-008: telefone do arquivo é conferido antes de falar com o aparelho; tipo torto vira arquivo comum', async () => {
  await comServidorR10({ rede: aparelhoOk }, async ({ pedir, chamadas }) => {
    for (const telefone of ['abc', '123', '5512988887777999']) {
      const r = await mandar(pedir, arquivo({ telefone }));
      assert.equal(r.status, 400, telefone);
      assert.match(r.corpo.erro, /DDD/);
    }
    assert.equal(chamadas.length, 0);
    const r = await mandar(pedir, arquivo({ mime: 'texto solto\ncom quebra' }));
    assert.equal(r.status, 200);
    const copia = chamadas.find(c => c.url.includes('/storage/v1/object/'));
    assert.equal(copia.opts.headers['Content-Type'], 'application/octet-stream');
  });
});

test('R10-ATD-009: arquivo com # ou % no nome guarda a cópia com o nome inteiro', async () => {
  await comServidorR10({ rede: aparelhoOk }, async ({ pedir, chamadas, sb }) => {
    const r = await mandar(pedir, arquivo({ nome_arquivo: 'orçamento #12 100%.pdf' }));
    assert.equal(r.status, 200);
    const copia = chamadas.find(c => c.url.includes('/storage/v1/object/'));
    const u = new URL(copia.url);
    assert.equal(u.hash, '', 'o # não corta o endereço');
    assert.ok(decodeURIComponent(u.pathname).endsWith('-orçamento #12 100%.pdf'), u.pathname);
    assert.match(sb.db.whatsapp_mensagens[0].anexo, /orçamento #12 100%\.pdf$/);
  });
});

test('R10-ATD-010: corpo que não é objeto (null, lista, número) no envio de arquivo é 400, não erro do servidor', async () => {
  await comServidorR10({ rede: aparelhoOk }, async ({ pedir }) => {
    for (const corpo of ['null', '[1,2]', '7', '"texto"']) {
      const r = await mandar(pedir, corpo);
      assert.equal(r.status, 400, corpo);
      assert.equal(r.corpo.codigo, 'json_invalido', corpo);
    }
  });
});

test('R10-ATD-011: quando o aparelho recusa ou a rede cai, a resposta não traz o texto cru de fora', async () => {
  const recusa = u => (u.startsWith(CODEWORDS) ? resposta(500, 'Traceback: token=sk-interno-123 at /srv/gowa/send.go:88') : null);
  await comServidorR10({ rede: recusa }, async ({ pedir, sb, logs }) => {
    const r = await mandar(pedir, arquivo());
    assert.equal(r.status, 502);
    assert.doesNotMatch(r.texto, /Traceback|sk-interno|send\.go/);
    assert.match(r.corpo.erro, /aparelho/i);
    assert.equal(sb.db.whatsapp_mensagens[0].status, 'falhou', 'a tentativa fica registrada no chat');
    assert.ok(logs.some(l => /Traceback/.test(l)), 'o detalhe vai para o log do servidor');
  });
  await comServidorR10({ rede: () => null }, async ({ pedir }) => {
    const r = await mandar(pedir, arquivo());
    assert.equal(r.status, 502);
    assert.doesNotMatch(r.texto, /fetch failed|ECONNREFUSED/);
  });
});
