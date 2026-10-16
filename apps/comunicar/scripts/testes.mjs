// Testes das funções puras do Comunicar — `npm test` (node:test, sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  telefoneNacional, dataBanco, somarDias, quandoRelativo, prazoDeRetorno,
  renderTemplate, classificarResposta, semAcento, agoraSP, REGUAS, TIPOS_ENVIO,
} from '../dados.js';

test('telefoneNacional tira o 55 e ignora máscara', () => {
  assert.equal(telefoneNacional('+55 (12) 99683-0272'), '12996830272');
  assert.equal(telefoneNacional('12996830272'), '12996830272');
  assert.equal(telefoneNacional(''), null);
});

test('dataBanco aceita ISO, DD/MM/AAAA e DD/MM (1904 marca "sem ano")', () => {
  assert.equal(dataBanco('2026-10-09T12:00:00Z'), '2026-10-09');
  assert.equal(dataBanco('14/05/1988'), '1988-05-14');
  assert.equal(dataBanco('2/11'), '1904-11-02');
  assert.equal(dataBanco('31/13'), null);
  assert.equal(dataBanco('ontem'), null);
});

test('somarDias atravessa mês e ano', () => {
  assert.equal(somarDias('2026-12-30', 3), '2027-01-02');
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
});

test('quandoRelativo fala como gente', () => {
  const h = '2026-10-09'; // sexta
  assert.equal(quandoRelativo(h, '14:30:00', h), 'hoje às 14:30');
  assert.equal(quandoRelativo('2026-10-10', '09:00', h), 'amanhã às 09:00');
  assert.equal(quandoRelativo('2026-10-12', '09:00', h), 'segunda-feira (12/10) às 09:00');
  assert.equal(quandoRelativo('2026-10-12', null, h), 'segunda-feira (12/10)');
});

const REGRAS = [
  { rotulo: 'Óleo', palavras: ['óleo', 'oleo'], meses: 6, ativo: true, ordem: 10 },
  { rotulo: 'Freios', palavras: ['freio', 'pastilha'], meses: 12, ativo: true, ordem: 20 },
  { rotulo: 'Correia', palavras: ['correia'], meses: 24, ativo: false, ordem: 30 },
];

test('prazoDeRetorno casa sem acento, respeita ordem e regra desligada', () => {
  assert.equal(prazoDeRetorno('Troca de OLEO de motor', REGRAS, 6).regra.rotulo, 'Óleo');
  assert.equal(prazoDeRetorno('Troca pastilha de freio dianteira', REGRAS, 6).meses, 12);
  assert.equal(prazoDeRetorno('Correia dentada', REGRAS, 6).meses, 6, 'regra desligada cai no padrão');
  assert.equal(prazoDeRetorno('Carro desligando sozinho', REGRAS, 8).meses, 8);
  assert.equal(prazoDeRetorno(null, REGRAS, 6).regra, null);
});

test('renderTemplate troca variáveis, usa primeiro nome e tolera ausência', () => {
  const t = renderTemplate('Oi {primeiro_nome}! Seu {carro} ({placa}) está {quando}. {inexistente}', {
    nome: 'Rachel Avellar', carro: 'Yaris', placa: 'ABC1D23', quando: 'hoje às 9h',
  });
  assert.equal(t, 'Oi Rachel! Seu Yaris (ABC1D23) está hoje às 9h.');
  assert.equal(renderTemplate('{carro}', {}), 'seu carro');
});

test('classificarResposta espelha o gatilho do banco', () => {
  assert.equal(classificarResposta('Sim, ficou ótimo! Obrigado'), 'positiva');
  assert.equal(classificarResposta('👍'), 'positiva');
  assert.equal(classificarResposta('Não ficou bom, voltou o barulho'), 'negativa');
  assert.equal(classificarResposta('PARAR'), 'parar');
  assert.equal(classificarResposta('não quero mais receber mensagens'), 'parar');
  assert.equal(classificarResposta('Que horas abre amanhã?'), 'neutra');
  assert.equal(classificarResposta(''), 'neutra');
});

test('semAcento normaliza', () => {
  assert.equal(semAcento('Óleo de Câmbio'), 'oleo de cambio');
});

test('agoraSP devolve data ISO e hora 0-23', () => {
  const a = agoraSP(new Date('2026-10-09T02:30:00Z')); // 23:30 do dia 8 em SP
  assert.equal(a.data, '2026-10-08');
  assert.equal(a.hora, 23);
  assert.equal(a.diaSemana, 4); // quinta
});

test('listas de réguas e tipos são coerentes', () => {
  for (const r of REGUAS) assert.ok(TIPOS_ENVIO.includes(r), `${r} precisa ser um tipo de envio`);
  assert.ok(TIPOS_ENVIO.includes('campanha') && TIPOS_ENVIO.includes('avulsa'));
});
