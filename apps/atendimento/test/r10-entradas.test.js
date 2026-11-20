'use strict';
/* Rodada 10: entradas conferidas no servidor (webhook, endereços, retomada, limites, envio).
   Tudo contra o server.js de verdade com banco, login e rede de mentira. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { comServidorR10, tabelasBase, resposta, ID, CODEWORDS } = require('./apoio/r10-servidor.js');
const { criarEntregador } = require('../lib/entrega.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');

const webhook = (pedir, corpo, token = 'segredo-do-webhook') =>
  pedir('/api/webhook/codewords', { metodo: 'POST', corpo, cabecalhos: token ? { 'x-codewords-token': token } : {} });

test('R10-ATD-012: token errado no webhook tem limite por endereço e para de gravar evento', async () => {
  await comServidorR10({}, async ({ pedir, sb }) => {
    let ultimo;
    for (let i = 0; i < 14; i++) ultimo = await webhook(pedir, { telefone: '12988887777', mensagem: 'oi' }, 'chute-' + i);
    assert.equal(ultimo.status, 429);
    assert.equal(ultimo.corpo.codigo, 'muitas_tentativas');
    assert.ok(Number(ultimo.cab.get('retry-after')) > 0, 'diz quanto esperar');
    assert.equal(sb.db.codewords_eventos.length, 10, 'só as 10 primeiras tentativas viram linha no banco');
    assert.equal(sb.db.whatsapp_mensagens.length, 0);
    // quem manda o token certo continua entrando, mesmo do mesmo endereço
    const certo = await webhook(pedir, { telefone: '12988887777', mensagem: 'oi de verdade' });
    assert.equal(certo.status, 200);
    assert.equal(sb.db.whatsapp_mensagens.length, 1);
  });
});

test('R10-ATD-013: webhook só grava mensagem de telefone com 10 a 15 dígitos (texto solto e grupo ficam de fora)', async () => {
  await comServidorR10({}, async ({ pedir, sb }) => {
    for (const telefone of ['abc', '12345', '120363025246125486@g.us', '<script>']) {
      const r = await webhook(pedir, { telefone, mensagem: 'oi' });
      assert.equal(r.status, 400, telefone);
      assert.equal(r.corpo.codigo, 'telefone-invalido', telefone);
    }
    assert.equal(sb.db.whatsapp_mensagens.length, 0, 'nada virou conversa');
    for (const telefone of ['12988887777', '+55 (12) 98888-7777', '5512988887777@s.whatsapp.net']) {
      assert.equal((await webhook(pedir, { telefone, mensagem: 'oi' })).status, 200, telefone);
    }
    assert.equal(sb.db.whatsapp_mensagens.length, 3);
  });
});

test('R10-ATD-014: endereço de API com % torto responde 400, não erro do servidor', async () => {
  await comServidorR10({}, async ({ pedir, logs }) => {
    for (const caminho of ['/api/clientes/%E0%A4%A/ficha', '/api/r7/links/%zz', '/api/ia/contexto/%', '/api/equipe/%E0%A4%A/desativar', '/api/r6/cliente/%c3']) {
      const r = await pedir(caminho, { metodo: caminho.endsWith('desativar') ? 'POST' : 'GET', como: 'admin', corpo: caminho.endsWith('desativar') ? {} : undefined });
      assert.equal(r.status, 400, caminho);
      assert.equal(r.corpo.codigo, 'endereco_invalido', caminho);
    }
    assert.ok(!logs.some(l => /\[erro /.test(l)), 'nenhum erro interno no log');
  });
});

test('R10-ATD-015: retomada com corpo quebrado ou lista torta não vira "reenviar tudo"', async () => {
  const parada = { id: 'a0000000-0000-4000-8000-000000000001', conversa_id: ID.conversa, telefone: '12988887777', nome: 'Camila', corpo: 'Seu carro ficou pronto',
    direcao: 'saida', status: 'falhou', erro: 'O WhatsApp está parado', created_at: new Date(Date.now() - 3600e3).toISOString(), gerada_por_ia: false };
  const tabelas = tabelasBase({ whatsapp_mensagens: [parada] });
  tabelas.conversas[0].atribuida_a = ID.atendente;
  await comServidorR10({ tabelas, rede: u => (u.startsWith(CODEWORDS) ? resposta(200, '{"status":"success"}') : null) }, async ({ pedir, chamadas }) => {
    const quebrado = await pedir('/api/r7/retomada/iniciar', { metodo: 'POST', como: 'admin', corpo: '{"ids":["a0000000-0000-4000-8000-0000000000' });
    assert.equal(quebrado.status, 400);
    assert.equal(quebrado.corpo.codigo, 'json_invalido');
    const torta = await pedir('/api/r7/retomada/iniciar', { metodo: 'POST', como: 'admin', corpo: { ids: 'a0000000-0000-4000-8000-000000000009' } });
    assert.equal(torta.status, 400);
    assert.equal(torta.corpo.codigo, 'ids_invalidos');
    await new Promise(r => setTimeout(r, 60));
    assert.equal(chamadas.filter(c => /send\/message/.test(c.url)).length, 0, 'nenhuma mensagem saiu');
  });
});

test('R10-ATD-016: religar o WhatsApp e testar a conexão têm limite de tentativas', async () => {
  const conexoes = u => (u.endsWith('/connections') ? resposta(200, [{ phone_id: 'aparelho-1', phone_number: '+5512996830272', status: 'logged_in', service_path: 'fluxo_teste/webhook' }])
    : u.includes('/subscribe') ? resposta(200, '{}') : u.includes('/send/message') ? resposta(200, '{"status":"success"}') : null);
  await comServidorR10({ rede: conexoes }, async ({ pedir, chamadas }) => {
    let r;
    for (let i = 0; i < 8; i++) r = await pedir('/api/whatsapp/reinscrever', { metodo: 'POST', como: 'admin', corpo: {} });
    assert.equal(r.status, 429);
    assert.equal(chamadas.filter(c => c.url.includes('/subscribe')).length, 6, 'só 6 pedidos de religar chegam ao CodeWords em 5 minutos');
    for (let i = 0; i < 7; i++) r = await pedir('/api/codewords/testar', { metodo: 'POST', como: 'admin', corpo: {} });
    assert.equal(r.status, 429);
    assert.equal(chamadas.filter(c => c.url.includes('/send/message')).length, 5, 'só 5 mensagens de teste em 10 minutos');
  });
});

test('R10-ATD-017: enviar com o id de uma mensagem e o telefone de outro cliente é recusado', async () => {
  const sb = criarSbFalso({ whatsapp_mensagens: [{ id: 'a0000000-0000-4000-8000-000000000001', status: 'pendente', direcao: 'saida', conversa_id: ID.conversa, telefone: '12988887777', corpo: 'oi', erro: null }] });
  const enviadas = [];
  const E = criarEntregador({ banco: () => sb, enviar: async d => { enviadas.push(d); return { ok: true }; } });
  const outro = await E.entregar({ telefone: '11977776666', corpo: 'oi' }, 'a0000000-0000-4000-8000-000000000001', { conferirTelefone: true });
  assert.equal(outro.status, 400);
  assert.equal(outro.codigo, 'telefone_diferente');
  assert.equal(enviadas.length, 0);
  assert.equal(sb.db.whatsapp_mensagens[0].status, 'pendente', 'a linha não vira "enviado" por engano');
  // o mesmo número escrito de outro jeito (com 55, com máscara) passa
  const mesmo = await E.entregar({ telefone: '+55 (12) 98888-7777', corpo: 'oi' }, 'a0000000-0000-4000-8000-000000000001', { conferirTelefone: true });
  assert.equal(mesmo.ok, true);
  assert.equal(enviadas.length, 1);
});

test('R10-ATD-017 (rota): POST /api/enviar com o id de uma mensagem e outro telefone não fala com o aparelho', async () => {
  const linha = { id: 'a0000000-0000-4000-8000-000000000002', status: 'pendente', direcao: 'saida', conversa_id: ID.conversa, telefone: '12988887777', corpo: 'oi', erro: null };
  await comServidorR10({ tabelas: tabelasBase({ whatsapp_mensagens: [linha] }), rede: u => (u.startsWith(CODEWORDS) ? resposta(200, '{"status":"success"}') : null) }, async ({ pedir, chamadas, sb }) => {
    const r = await pedir('/api/enviar', { metodo: 'POST', como: 'atendente', corpo: { telefone: '11977776666', corpo: 'oi', mensagemId: linha.id } });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.codigo, 'telefone_diferente');
    assert.equal(chamadas.filter(c => /send\/message/.test(c.url)).length, 0);
    assert.equal(sb.db.whatsapp_mensagens[0].status, 'pendente');
    const ok = await pedir('/api/enviar', { metodo: 'POST', como: 'atendente', corpo: { telefone: '12988887777', corpo: 'oi', mensagemId: linha.id } });
    assert.equal(ok.status, 200);
    assert.equal(sb.db.whatsapp_mensagens[0].status, 'enviado');
  });
});
