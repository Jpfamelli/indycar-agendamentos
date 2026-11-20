/* Ajustes, rodada 9: gaveta "De onde vêm os contatos". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nomeDaPagina } from '../js/telas/gavetas/origem.js';

test('rastreio do site: "/" aparece como Página inicial, o resto como o endereço', () => {
  assert.equal(nomeDaPagina('/'), 'Página inicial');
  assert.equal(nomeDaPagina(''), 'Página inicial');
  assert.equal(nomeDaPagina('/servicos/troca-de-oleo'), '/servicos/troca-de-oleo');
});

import { linhaDosAcertos } from '../js/telas/gavetas/origem.js';
test('frases: a linha de acertos nunca começa com vírgula nem diz "null"', () => {
  const ontem = new Date(Date.now() - 26 * 3600e3).toISOString();
  assert.match(linhaDosAcertos({ acertos: 23, ultimo_acerto_em: ontem }), /^23 contatos reconhecidos, o último .+\.$/);
  assert.equal(linhaDosAcertos({ acertos: 0 }), '0 contatos reconhecidos.');
  assert.match(linhaDosAcertos({ acertos: null, ultimo_acerto_em: ontem }), /^Último contato reconhecido .+\.$/);
  assert.equal(linhaDosAcertos({ acertos: null, ultimo_acerto_em: 'não é data' }), null);
  assert.equal(linhaDosAcertos({}), null);
});

import { maisCampanhas } from '../js/telas/folha.js';
test('folha do mês: diz quantas campanhas ficaram de fora das 8 (singular e plural)', () => {
  assert.equal(maisCampanhas(8, 8), null);
  assert.equal(maisCampanhas(5, 5), null);
  assert.equal(maisCampanhas(9, 8), 'Mais 1 campanha na tela Campanhas (aqui vão as 8 de maior gasto).');
  assert.equal(maisCampanhas(12, 8), 'Mais 4 campanhas na tela Campanhas (aqui vão as 8 de maior gasto).');
  assert.equal(maisCampanhas(undefined, 3), null);
});
