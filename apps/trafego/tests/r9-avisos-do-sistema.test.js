'use strict';
/*
 * Rodada 9 (achado D1, item 6): avisos do próprio sistema gravados como mensagem RECEBIDA ("[Sistema] …",
 * "Agendamento: …", "Lembrete 24h enviado …", "3 no-shows hoje") não são o cliente escrevendo.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../origem');
const J = require('../jornada');

test('ehAvisoDoSistema: os quatro padrões da consulta C03, e nada de mensagem de cliente', () => {
  for (const t of ['[Sistema] Lead criado pelo site', '[SISTEMA] x', 'Agendamento: sexta 21/11 às 9h', 'Lembrete 24h enviado para o cliente', '3 no-shows hoje', '  Agendamento: x']) {
    assert.equal(O.ehAvisoDoSistema(t), true, t);
  }
  for (const t of ['Olá! Tenho interesse e queria mais informações', 'Agendamento pra sexta, tem vaga?', 'Bom dia, recebi o lembrete 24h enviado', 'sistema caiu?', '', null, undefined, 42]) {
    assert.equal(O.ehAvisoDoSistema(t), false, String(t));
  }
});

test('primeira mensagem que é aviso do sistema: não vira "esperando resposta" nem tempo de resposta', () => {
  const pm = { primeira_entrada_em: '2026-11-18T12:00:00Z', primeira_entrada_texto: 'Agendamento: terça 25/11 às 8h', primeira_saida_em: null };
  assert.deepEqual(J.classificarResposta(pm), { tipo: 'desconhecida', entrada: null });
  const doCliente = { ...pm, primeira_entrada_texto: 'Quanto fica a troca de óleo?' };
  assert.equal(J.classificarResposta(doCliente).tipo, 'sem_resposta', 'mensagem de cliente sem resposta continua esperando');
});

test('linha do tempo do contato: aviso do sistema aparece como "Aviso do sistema", não como "Cliente escreveu"', () => {
  const l = { created_at: '2026-11-18T11:00:00Z' };
  const item = { servico: 'Freios', origem: { rotulo: 'Ainda não sabemos' }, desfecho: { tipo: 'aberto' } };
  const mensagens = [
    { direcao: 'entrada', corpo: 'Lembrete 24h enviado', created_at: '2026-11-18T11:30:00Z' },
    { direcao: 'entrada', corpo: 'Oi, quero marcar a revisão', created_at: '2026-11-18T12:00:00Z' },
  ];
  const linhas = J.linhaDoTempo({ l, item, lig: null, ags: [], mensagens, atividades: [] });
  const titulos = linhas.filter((x) => x.tipo !== 'mudanca').map((x) => [x.titulo, x.tipo]);
  assert.deepEqual(titulos, [['Aviso do sistema', 'mensagem_oficina'], ['Cliente escreveu', 'mensagem_cliente']]);
});

test('mensagens que se repetem: aviso do sistema nunca vira frase candidata', async () => {
  const sb = { rpc: async () => ({ data: [
    { frase: 'lembrete 24h enviado', n: 48, exemplo: 'Lembrete 24h enviado', ultima_em: '2026-09-30T13:49:00Z' },
    { frase: '[sistema] lead criado', n: 9, exemplo: '[Sistema] Lead criado', ultima_em: '2026-09-30T13:49:00Z' },
    { frase: 'vi o anuncio no instagram e quero orcamento', n: 5, exemplo: 'Vi o anúncio no Instagram e quero orçamento', ultima_em: '2026-11-18T13:00:00Z' },
  ], error: null }) };
  const r = await O.candidatas({ sb });
  assert.deepEqual(r.candidatas.map((c) => c.n), [5]);
});
