// Agenda (rodada 7 / C2, lote 7): idade da lista de espera e vaga que abre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ globalThis: null, URL, Intl });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada7.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R7Puro;
const arr = (v) => JSON.parse(JSON.stringify(v));

test('idadeDaEspera: 3 dias avisa, 7 dias é urgente, lixo não alarma', () => {
  assert.deepEqual([0, 1, 2, 3, 6, 7, 30].map(P.idadeDaEspera), ['ok', 'ok', 'ok', 'aviso', 'aviso', 'ruim', 'ruim']);
  for (const lixo of [null, undefined, 'abc', NaN, {}]) assert.equal(P.idadeDaEspera(lixo), 'ok', String(lixo));
});
test('resumoDaEspera: avisos, urgentes, muito antigas e a mais antiga', () => {
  assert.deepEqual(arr(P.resumoDaEspera([{ dias: 0 }, { dias: 4 }, { dias: 8 }, { dias: 15 }, { dias: 'x' }, null])), { total: 4, avisos: 1, urgentes: 2, muitoAntigas: 1, maisAntiga: 15 });
  assert.deepEqual(arr(P.resumoDaEspera(null)), { total: 0, avisos: 0, urgentes: 0, muitoAntigas: 0, maisAntiga: 0 });
});
test('ordenarEsperaPorIdade: mais antigas primeiro, empate fica na ordem de antes, sem mexer na lista original', () => {
  const l = [{ id: 'a', dias: 1 }, { id: 'b', dias: 9 }, { id: 'c', dias: 1 }, { id: 'd', dias: 5 }];
  assert.deepEqual(arr(P.ordenarEsperaPorIdade(l).map((x) => x.id)), ['b', 'd', 'a', 'c']);
  assert.equal(l[0].id, 'a'); assert.deepEqual(arr(P.ordenarEsperaPorIdade(null)), []);
});
test('rotuloDaVaga: "amanhã às 09:00", "hoje", dia da semana e hora com segundos', () => {
  assert.equal(P.rotuloDaVaga('2026-10-26', '09:00:00', '2026-10-25'), 'amanhã às 09:00');
  assert.equal(P.rotuloDaVaga('2026-10-25', '14:30', '2026-10-25'), 'hoje às 14:30');
  assert.equal(P.rotuloDaVaga('2026-10-29', '08:00', '2026-10-25'), 'qui 29/10 às 08:00');
});
test('textoDeOferta: a vaga que abriu vira recado com nome limpo, serviço, dia e consultor', () => {
  const t = P.textoDeOferta({ cliente_nome: 'joana ribeiro', servico: 'Troca de óleo' }, '2026-10-26', '10:30', 'Gabriel Lima');
  assert.match(t, /^Oi Joana! .*Abriu um horário para Troca de óleo: seg 26\/10 às 10:30 com Gabriel\. Posso reservar para você\?$/);
  assert.ok(!/undefined|null/.test(P.textoDeOferta({}, '2026-10-26', '10:30', '')));
});
