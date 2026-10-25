'use strict';
/* Rodada 7 (C4), lote 2: a IA não manda a mesma frase duas vezes, não empilha cópias "falhou" enquanto o WhatsApp
   está parado e sai uma por vez. Banco de mentira, relógio de mentira: nada espera de verdade. */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/r7-envio.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');

const AGORA = new Date('2026-10-26T13:00:00Z');
const CONV = '11111111-1111-4111-8111-111111111111';
const linha = (id, corpo, status, minAtras, extra = {}) => ({ id, conversa_id: CONV, direcao: 'saida', corpo, status, created_at: new Date(AGORA - minAtras * 60000).toISOString(), ...extra });
const banco = (linhas) => criarSbFalso({ whatsapp_mensagens: linhas }, { relogio: () => AGORA });

test('R7 envio: normalizarCorpo ignora acento, caixa, emoji, espaço repetido e pontuação final', () => {
  assert.equal(E.normalizarCorpo('  Oi,  Ana!  Qual é o CARRO?? 🚗 '), 'oi, ana! qual e o carro');
  assert.equal(E.normalizarCorpo('Qual é o carro'), E.normalizarCorpo('qual e o carro?'));
  assert.equal(E.normalizarCorpo(null), '');
});

test('R7 envio: a mesma frase que acabou de sair é repetição (409) — e a de ontem não', async () => {
  const sb = banco([linha('a', 'Oi Ana! Qual é o carro?', 'enviado', 5), linha('b', 'Outra coisa', 'enviado', 3)]);
  const r = await E.acharIgual(sb, { conversaId: CONV, corpo: 'oi ana! qual e o carro', agora: AGORA });
  assert.equal(r.tipo, 'repetida');
  assert.equal(r.id, 'a');
  const velha = banco([linha('a', 'Oi Ana! Qual é o carro?', 'enviado', 60 * 24)]);
  assert.equal(await E.acharIgual(velha, { conversaId: CONV, corpo: 'Oi Ana! Qual é o carro?', agora: AGORA }), null, 'fora da janela de 30 min');
});

test('R7 envio: mensagem "falhou" igual já espera na fila de revisão — não cria segunda cópia', async () => {
  const sb = banco([linha('f1', 'Oi Ana! Qual é o carro?', 'falhou', 200, { erro: 'WhatsApp parado: a chave do CodeWords foi recusada (401).' })]);
  const r = await E.acharIgual(sb, { conversaId: CONV, corpo: 'Oi Ana! Qual é o carro?', agora: AGORA });
  assert.equal(r.tipo, 'ja_na_fila');
  assert.equal(r.id, 'f1');
});

test('R7 envio: falha antiga (mais de 12 h) ou "resolvida por telefone" não bloqueia uma frase nova igual', async () => {
  const velha = banco([linha('f1', 'Oi Ana!', 'falhou', 13 * 60, { erro: 'x' })]);
  assert.equal(await E.acharIgual(velha, { conversaId: CONV, corpo: 'Oi Ana!', agora: AGORA }), null);
  const resolvida = banco([linha('f2', 'Oi Ana!', 'falhou', 30, { erro: 'Resolvido fora do WhatsApp por Gabriel: liguei' })]);
  assert.equal(await E.acharIgual(resolvida, { conversaId: CONV, corpo: 'Oi Ana!', agora: AGORA }), null);
});

test('R7 envio: outra conversa com a mesma frase não conta', async () => {
  const sb = banco([linha('x', 'Oi Ana!', 'enviado', 2, { conversa_id: '99999999-9999-4999-8999-999999999999' })]);
  assert.equal(await E.acharIgual(sb, { conversaId: CONV, corpo: 'Oi Ana!', agora: AGORA }), null);
});

test('R7 envio: sem conversa ou sem texto não procura nada', async () => {
  const sb = banco([]);
  assert.equal(await E.acharIgual(sb, { conversaId: null, corpo: 'x', agora: AGORA }), null);
  assert.equal(await E.acharIgual(sb, { conversaId: CONV, corpo: '   ', agora: AGORA }), null);
});

test('R7 envio: ritmo — três envios seguidos esperam o intervalo entre si (um por vez, em ordem)', async () => {
  let relogio = 1000;
  const dormidos = [];
  const ritmo = E.criarRitmo({ intervaloMs: 2500, agora: () => relogio, dormir: async (ms) => { dormidos.push(ms); relogio += ms; } });
  const ordem = [];
  await Promise.all([1, 2, 3].map(n => ritmo.vez().then(() => ordem.push(n))));
  assert.deepEqual(ordem, [1, 2, 3]);
  assert.equal(dormidos.length, 2, 'o primeiro sai na hora');
  assert.ok(dormidos.every(ms => ms >= 2400 && ms <= 2500), JSON.stringify(dormidos));
  assert.equal(ritmo.esperando, 0);
});

test('R7 envio: ritmo — passado o intervalo, o próximo sai sem esperar', async () => {
  let relogio = 0;
  const dormidos = [];
  const ritmo = E.criarRitmo({ intervaloMs: 1000, agora: () => relogio, dormir: async (ms) => { dormidos.push(ms); relogio += ms; } });
  await ritmo.vez();
  relogio += 5000;
  await ritmo.vez();
  assert.deepEqual(dormidos, []);
});
