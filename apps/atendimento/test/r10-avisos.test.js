'use strict';
/* Rodada 10: as notas que o robô grava como mensagem recebida ("Agendamento: …", "Lembrete 24h enviado",
   "3 no-shows hoje", "[Sistema] …") não são o cliente escrevendo. */
const test = require('node:test');
const assert = require('node:assert/strict');
const CTX = require('../lib/contexto.js');
const FUN = require('../lib/ia-funil.js');
const AUT = require('../lib/automacoes.js');
const { textosSemResposta, criarR6 } = require('../lib/r6-dados.js');
const PAT = require('../lib/patio.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');

const AGORA = new Date('2026-10-14T15:00:00Z');   // quarta, 12:00 em Taubaté (expediente)
const min = n => new Date(AGORA.getTime() - n * 60000).toISOString();
const C1 = 'c0000000-0000-4000-8000-000000000001';
const NOTAS = ['Agendamento: quinta 14h, Diagnóstico', 'Lembrete 24h enviado para o cliente', '3 no-shows hoje', '[Sistema] etiqueta trocada'];
const conversa = notas => [
  { conversa_id: C1, direcao: 'entrada', corpo: 'Oi, quero revisar o freio', created_at: min(120) },
  { conversa_id: C1, direcao: 'saida', corpo: 'Opa! Consigo quinta às 14h, pode ser?', created_at: min(110) },
  ...notas.map((corpo, i) => ({ conversa_id: C1, direcao: 'entrada', corpo, created_at: min(90 - i) })),
];

test('R10-ATD-030: nota do sistema não faz a conversa aparecer como "cliente sem resposta" na fila nem vira pedido', async () => {
  for (const nota of NOTAS) {
    assert.deepEqual(textosSemResposta(conversa([nota])), [], nota);
    assert.equal(CTX.situacaoDaConversa(conversa([nota]), AGORA).semResposta, false, nota);
  }
  // mensagem de cliente depois da nota continua contando
  const comCliente = [...conversa(['Lembrete 24h enviado']), { conversa_id: C1, direcao: 'entrada', corpo: 'Pode ser às 15h?', created_at: min(10) }];
  assert.deepEqual(textosSemResposta(comCliente), ['Pode ser às 15h?']);
  assert.equal(CTX.situacaoDaConversa(comCliente, AGORA).semResposta, true);
  // texto parecido escrito pelo cliente no meio da frase não é nota
  assert.deepEqual(textosSemResposta([{ direcao: 'entrada', corpo: 'Queria um agendamento: pode ser amanhã?', created_at: min(5) }]), ['Queria um agendamento: pode ser amanhã?']);

  const sb = criarSbFalso({
    conversas: [{ id: C1, tipo: 'atendimento', cliente_id: null, telefone: '12988887777', nao_lidas: 0, ultima_mensagem_em: min(90), atribuida_a: null }],
    whatsapp_mensagens: conversa(['Agendamento: quinta 14h, Diagnóstico']),
  });
  const fila = await criarR6({ sb, patio: PAT.criarPatio({ sb, agora: () => AGORA }), agora: () => AGORA, log: () => {} }).filaContexto();
  assert.equal(fila.conversas[C1], undefined, 'a conversa respondida não volta para a fila por causa da nota');
});

test('R10-ATD-031: alerta de cliente esperando não dispara por nota de agendamento, lembrete ou falta', async () => {
  const sb = criarSbFalso({
    conversas: [{ id: C1, nome: 'Camila', telefone: '12988887777', atribuida_a: null, status: 'aberta', tipo: 'atendimento', ultima_mensagem_em: min(88) }],
    whatsapp_mensagens: conversa(NOTAS.slice(0, 3)),
    perfis: [{ id: '11111111-1111-4111-8111-111111111111', papel: 'admin', ativo: true, apps: ['atendimento'], preferencias: {} }],
    notificacoes: [],
  }, { rpc: { notificar: async () => ({ data: 'x', error: null }) } });
  const aut = AUT.criarAutomacoes({ sb, agora: () => AGORA, log: () => {}, auditar: async () => ({}), rodizio: null });
  const r = await aut.alertarEspera();
  assert.equal(r.esperando, 0, JSON.stringify(r));
});

test('R10-ATD-032: IA do funil não conta nota do sistema como espera do cliente nem como rajada', () => {
  const ms = conversa(NOTAS);
  assert.equal(FUN.minutosEsperando(ms, AGORA), null, 'ninguém está esperando: a loja falou por último');
  assert.equal(FUN.emRajada(ms.map(m => ({ ...m, created_at: min(1) })), AGORA), false, 'quatro notas seguidas não são rajada de cliente');
  const real = [...ms, { conversa_id: C1, direcao: 'entrada', corpo: 'oi?', created_at: min(7) }];
  assert.equal(FUN.minutosEsperando(real, AGORA), 7);
});
