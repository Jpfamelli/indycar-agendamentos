/* Lógica pura da tela: formatação (js/formato.js). Sem rede, sem navegador. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/formato.js';

const R = 'R$' + F.ESPACO_FIXO;

test('dinheiro: mil para cima e redondo sem centavos; quebrado abaixo de mil com centavos', () => {
  assert.equal(F.dinheiro(2340.5), R + '2.341');
  assert.equal(F.dinheiro(750), R + '750');
  assert.equal(F.dinheiro(38.4), R + '38,40');
  assert.equal(F.dinheiro(1234567), R + '1.234.567');
  assert.equal(F.dinheiro(0), R + '0');
  assert.equal(F.dinheiro(-12.5), '-' + R + '12,50');
  assert.equal(F.dinheiro(-0.001), R + '0');
  assert.equal(F.dinheiro(19.999), R + '20');
  assert.equal(F.dinheiro(38.4, { centavos: false }), R + '38');
});

test('dinheiro, número e porcento: "não sei" (null) nunca vira zero', () => {
  for (const nada of [null, undefined, NaN, Infinity, '12', {}]) {
    assert.equal(F.dinheiro(nada), null);
    assert.equal(F.inteiro(nada), null);
    assert.equal(F.porcento(nada), null);
    assert.equal(F.contagem(nada, 'contato', 'contatos'), null);
  }
});

test('porcento: fração de 0 a 1 vira por cento; perto de zero diz "menos de 1%"', () => {
  assert.equal(F.porcento(0.2), '20%');
  assert.equal(F.porcento(0.114), '11%');
  assert.equal(F.porcento(0.004), 'menos de 1%');
  assert.equal(F.porcento(0), '0%');
  assert.equal(F.porcento(0.1234, { casas: 1 }), '12,3%');
});

test('número agrupa milhar com ponto e decimal com vírgula', () => {
  assert.equal(F.numero(1234.5, 2), '1.234,50');
  assert.equal(F.inteiro(81200), '81.200');
  assert.equal(F.numero(-0.4, 0), '0');
  assert.equal(F.contagem(1, 'contato', 'contatos'), '1 contato');
  assert.equal(F.contagem(3, 'contato', 'contatos'), '3 contatos');
});

test('variação por extenso', () => {
  assert.deepEqual(F.variacaoPorExtenso(0.114), { texto: 'subiu 11%', direcao: 'sobe' });
  assert.deepEqual(F.variacaoPorExtenso(-0.04), { texto: 'caiu 4%', direcao: 'desce' });
  assert.deepEqual(F.variacaoPorExtenso(0.001), { texto: 'ficou igual', direcao: 'igual' });
  assert.deepEqual(F.variacaoPorExtenso(1), { texto: 'dobrou', direcao: 'sobe' });
  assert.deepEqual(F.variacaoPorExtenso(2.5), { texto: 'subiu 250%', direcao: 'sobe' });
  assert.deepEqual(F.variacaoPorExtenso(-1), { texto: 'zerou', direcao: 'desce' });
  assert.equal(F.variacaoPorExtenso(null), null);
});

test('comparação: o tom vem do "sentido" da API, a tela não decide se subir é bom', () => {
  assert.deepEqual(F.comparacao({ valor: 100, antes: 86, variacao: 0.163, sentido: 'bom', formato: 'inteiro' }), { texto: 'subiu 16%', detalhe: 'antes 86', tom: 'bom', direcao: 'sobe' });
  assert.equal(F.comparacao({ valor: 14, antes: 18, variacao: -0.22, sentido: 'ruim', formato: 'inteiro' }).tom, 'atencao');
  assert.equal(F.comparacao({ valor: 2340, antes: 2100, variacao: 0.114, sentido: 'neutro', formato: 'dinheiro' }).detalhe, 'antes ' + R + '2.100');
  assert.equal(F.comparacao({ valor: 5, antes: 0, variacao: null }).texto, 'antes era zero');
  assert.equal(F.comparacao({ valor: null, antes: null, variacao: null }).texto, 'sem período anterior para comparar');
  assert.equal(F.comparacao({ valor: 10, antes: 10, variacao: 0, sentido: 'bom' }).tom, 'neutro');
});

test('datas sempre no horário de Brasília, mesmo com hora UTC', () => {
  assert.equal(F.dataCurta('2026-11-19T01:30:00Z'), '18/11');
  assert.equal(F.hora('2026-11-19T12:41:00Z'), '09:41');
  assert.equal(F.dataHora('2026-11-12T09:41:00-03:00'), '12/11 às 09:41');
  assert.equal(F.dataCurta('2026-11-19'), '19/11');
  assert.equal(F.diaDaSemana('2026-11-20'), 'sex 20');
  assert.equal(F.dataLonga('2026-03-05'), '5 de março');
  assert.equal(F.chaveDoDia('2026-11-19T02:00:00Z'), '2026-11-18');
  assert.equal(F.dataCurta('não é data'), null);
});

test('"há quanto" e "parado há"', () => {
  const agora = Date.parse('2026-11-19T10:30:00-03:00');
  assert.equal(F.haQuanto(agora - 20000, agora), 'agora');
  assert.equal(F.haQuanto(agora - 3 * 60000, agora), 'há 3 min');
  assert.equal(F.haQuanto(agora - 2 * 3600000, agora), 'há 2 h');
  assert.equal(F.haQuanto(agora - 30 * 3600000, agora), 'ontem');
  assert.equal(F.haQuanto(agora - 5 * 86400000, agora), 'há 5 dias');
  assert.equal(F.paradoHa(0), 'nesta etapa desde hoje', 'quem andou hoje não está "parado"');
  assert.equal(F.paradoHa(1), 'parado há 1 dia');
  assert.equal(F.paradoHa(3.4), 'parado há 3 dias');
  assert.equal(F.paradoHa(null), null);
  assert.equal(F.duracao(12), '12 min');
  assert.equal(F.duracao(80), '1 h 20 min');
  assert.equal(F.duracao(120), '2 h');
  assert.equal(F.duracao(2880), '2 dias');
});

test('telefone, iniciais e leitura de dinheiro digitado', () => {
  assert.equal(F.telefone('5512990000101'), '(12) 99000-0101');
  assert.equal(F.telefone('1236250000'), '(12) 3625-0000');
  assert.equal(F.telefone(''), null);
  assert.equal(F.iniciais('Paulo Mendes da Silva'), 'PS');
  assert.equal(F.iniciais('  carlos '), 'C');
  assert.equal(F.iniciais(''), '?');
  assert.equal(F.lerDinheiro('1.250,50'), 1250.5);
  assert.equal(F.lerDinheiro('R$ 890'), 890);
  assert.equal(F.lerDinheiro('1250.5'), 1250.5);
  assert.equal(F.lerDinheiro('1.250'), 1250);
  assert.equal(F.lerDinheiro('abc'), null);
});

test('período: só os cinco do contrato; o resto volta para "este mês"', () => {
  assert.deepEqual(F.PERIODOS.map((p) => p.id), ['hoje', '7d', '30d', '60d', 'mes', 'mes_passado']);
  assert.equal(F.periodoValido('7d'), '7d');
  assert.equal(F.periodoValido('ano'), 'mes');
  assert.equal(F.periodoValido(undefined), 'mes');
});
