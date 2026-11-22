// R13C: o detector de segredos perdoa SÓ o valor de mentira do banco falso dos testes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PADROES, casa, ehFalsoConhecido } from './segredos.mjs';

const atribuicao = PADROES.find(([n]) => n === 'Atribuição de segredo')[1];
const nome = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');

test('o valor falso exato do banco-falso.mjs não é acusado', () => {
  const linha = `process.env.${nome} = '${'chave-falsa' + '-de-teste'}';`;
  assert.equal(ehFalsoConhecido(`${nome} = 'chave-falsa-de-teste`), true);
  assert.equal(casa(atribuicao, linha), false);
});

test('qualquer outro valor na mesma atribuição continua acusado', () => {
  const outro = 'abcdEFGH1234' + 'ijklMNOP5678';
  assert.equal(casa(atribuicao, `process.env.${nome} = '${outro}';`), true);
  assert.equal(casa(atribuicao, `process.env.${nome} = 'chave-falsa-de-teste-mas-outra';`), true);
});

test('importar o detector não roda a varredura (só via linha de comando)', () => {
  assert.equal(typeof casa, 'function');
});
