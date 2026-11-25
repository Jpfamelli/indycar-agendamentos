// Rodada 15 · lista de Mensagens por dia, reenviar falhas em lote, aprovação com exemplo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = (f) => fs.readFileSync(path.join(aqui, '..', f), 'utf8');
const ctx = { window: {}, Intl, Date };
vm.createContext(ctx);
vm.runInContext(ler('public/rodada15.js'), ctx);
const R = ctx.window.R15;

test('rótulo do dia: hoje, amanhã, ontem e data com dia da semana', () => {
  const hoje = '2026-11-25';
  assert.equal(R.rotuloDiaLista('2026-11-25', hoje), 'Hoje');
  assert.equal(R.rotuloDiaLista('2026-11-26', hoje), 'Amanhã');
  assert.equal(R.rotuloDiaLista('2026-11-24', hoje), 'Ontem');
  assert.equal(R.rotuloDiaLista('2026-11-20', hoje), 'sex 20/11');
  assert.equal(R.rotuloDiaLista('2027-01-02', hoje), 'sáb 02/01/2027');
  assert.equal(R.rotuloDiaLista('', hoje), 'Sem data');
  assert.equal(R.rotuloDiaLista('2026-12-01', '2026-11-30'), 'Amanhã');   // vira o mês
});

test('o dia vem do fuso da oficina e a enviada conta pelo horário em que saiu', () => {
  assert.equal(R.diaDoEnvio({ status: 'pendente', enviar_em: '2026-11-26T02:30:00Z' }), '2026-11-25');   // 23:30 em São Paulo
  assert.equal(R.diaDoEnvio({ status: 'enviado', enviar_em: '2026-11-24T12:00:00Z', enviado_em: '2026-11-25T12:00:00Z' }), '2026-11-25');
  assert.equal(R.diaDoEnvio({ status: 'pendente' }), '');
});

test('blocos por dia: só muda de bloco quando o dia muda, e carregar mais não repete o título', () => {
  const e = (id, iso) => ({ id, status: 'pendente', enviar_em: iso });
  const l = [e(1, '2026-11-25T15:00:00Z'), e(2, '2026-11-25T16:00:00Z'), e(3, '2026-11-24T15:00:00Z'), e(4, '2026-11-25T15:00:00Z')];
  const b = R.blocosPorDia(l, '');
  assert.deepEqual(JSON.parse(JSON.stringify(b.map((x) => [x.dia, x.itens.length, x.continua]))), [['2026-11-25', 2, false], ['2026-11-24', 1, false], ['2026-11-25', 1, false]]);
  const mais = R.blocosPorDia([e(5, '2026-11-24T18:00:00Z'), e(6, '2026-11-23T18:00:00Z')], '2026-11-24');
  assert.deepEqual([...mais.map((x) => x.continua)], [true, false]);
  assert.equal(R.blocosPorDia([], '').length, 0);
});

test('reenviar em lote deixa de fora "sem confirmação" e quem pediu para parar', () => {
  const l = [
    { id: 1, status: 'falhou', erro_classe: 'chave_recusada' },
    { id: 2, status: 'falhou', erro_classe: 'sem_confirmacao' },
    { id: 3, status: 'falhou', motivo_pulado: 'Cliente pediu para não receber' },
    { id: 4, status: 'enviado' },
    { id: 5, status: 'falhou' },
  ];
  assert.deepEqual([...R.reenviaveis(l).map((e) => e.id)], [1, 5]);
  assert.equal(R.reenviaveis(null).length, 0);
});

test('exemplo da mensagem preenche nome e carro e não deixa chave sobrando', () => {
  const t = R.exemploDaMensagem('Oi {primeiro_nome}! Seu {carro} está pronto? {nada}', { nome: 'Maria Aparecida Souza', carro: 'HB20 2019' });
  assert.equal(t, 'Oi Maria! Seu HB20 2019 está pronto?');
  assert.doesNotMatch(R.exemploDaMensagem('Oi {primeiro_nome}', { nome: 'Ana' }), /[{}]/);
});

test('a tela usa o módulo: linha por dia, pílula Puladas, barra de falhas e aprovação com exemplo', () => {
  const a = ler('public/app.js');
  assert.match(a, /function htmlEnvios/);
  assert.match(a, /htmlEnvios\(lista, ''\)/);
  assert.match(a, /pilula\('pulado', 'Puladas'\)/);
  assert.match(a, /function pintarBarraFalhas/);
  assert.match(a, /R15\.exemploDaMensagem\(c\.corpo, EXEMPLO\)/);
  assert.match(a, /Aprovar para \$\{quantos/);
  assert.doesNotMatch(a, /confirm\('Cancelar esta mensagem/);   // o Desfazer faz o papel da pergunta
  const h = ler('public/index.html');
  assert.match(h, /<script src="rodada15\.js\?v=7.6.0"><\/script>/);
  assert.match(ler('public/sw.js'), /'rodada15\.js'/);
  assert.match(ler('public/styles.css'), /\.dia-cab\{/);
});
