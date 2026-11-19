'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarPausaSincronia, ehRecusa, PRIMEIRA_MS, MAXIMA_MS } = require('../lib/pausa-sincronia.js');

test('pausa da sincronia: recusa da chave pausa e dobra a espera até 1 h; uma linha de registro por pausa', () => {
  let t = 1_000_000;
  const linhas = [];
  const p = criarPausaSincronia({ agora: () => t, log: (m) => linhas.push(m) });
  assert.equal(p.emPausa(), false);
  p.recusada(401);
  assert.equal(p.emPausa(), true);
  assert.equal(p.estado().proximaEm, t + PRIMEIRA_MS);
  t += PRIMEIRA_MS;
  assert.equal(p.emPausa(), false, 'depois da espera tenta de novo');
  p.recusada(401);
  assert.equal(p.estado().proximaEm, t + 2 * PRIMEIRA_MS);
  for (let i = 0; i < 10; i++) p.recusada(403);
  assert.equal(p.estado().proximaEm, t + MAXIMA_MS, 'nunca passa de 1 h');
  assert.equal(linhas.length, 12);
  assert.match(linhas[0], /recusou a chave \(401\) 1x seguida\(s\); próxima tentativa em 5 min/);
});

test('pausa da sincronia: chave aceita de novo zera a pausa e avisa uma vez', () => {
  const linhas = [];
  const p = criarPausaSincronia({ agora: () => 0, log: (m) => linhas.push(m) });
  p.aceita();
  assert.equal(linhas.length, 0, 'sem recusa antes, nada no registro');
  p.recusada(401);
  p.aceita();
  assert.equal(p.emPausa(), false);
  assert.deepEqual(p.estado(), { recusas: 0, proximaEm: 0 });
  assert.match(linhas.at(-1), /voltou a aceitar a chave depois de 1 recusa/);
});

test('pausa da sincronia: só 401 e 403 contam como chave recusada', () => {
  assert.equal(ehRecusa(401), true);
  assert.equal(ehRecusa(403), true);
  for (const s of [400, 404, 429, 500, 502]) assert.equal(ehRecusa(s), false, String(s));
});
