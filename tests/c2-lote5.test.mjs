// Agenda (rodada 7 / C2, lote 5): o carro ao vivo — previsão, tempo na etapa, filtros, extras e recados de WhatsApp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ globalThis: null, URL, Intl });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada7.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R7Puro;
const arr = (v) => JSON.parse(JSON.stringify(v));

// 25/10/2026 15:00 em São Paulo = 18:00 UTC
const AGORA = Date.parse('2026-10-25T18:00:00Z');
const MIN = (n) => new Date(AGORA - n * 60000).toISOString();

test('rotuloPrevisao: hoje/amanhã com hora, atrasada, data pura vale até o fim do dia', () => {
  assert.deepEqual(arr(P.rotuloPrevisao('2026-10-25T20:30:00Z', AGORA)), { texto: 'entrega hoje 17:30', atrasada: false, atrasoMin: 0 });
  assert.equal(P.rotuloPrevisao('2026-10-26T14:00:00Z', AGORA).texto, 'entrega amanhã 11:00');
  assert.equal(P.rotuloPrevisao('2026-10-29T14:00:00Z', AGORA).texto, 'entrega qui 29/10 11:00');
  const at = P.rotuloPrevisao('2026-10-25T16:00:00Z', AGORA);
  assert.ok(at.atrasada && at.atrasoMin === 120 && /atrasada há 2h/.test(at.texto), at.texto);
  assert.equal(P.rotuloPrevisao('2026-10-25', AGORA).atrasada, false, 'data pura de hoje ainda vale');
  assert.equal(P.rotuloPrevisao('2026-10-25', AGORA).texto, 'entrega hoje');
  assert.ok(P.rotuloPrevisao('2026-10-24', AGORA).atrasada);
  assert.match(P.rotuloPrevisao('2026-10-24', AGORA).texto, /desde ontem/);
  for (const lixo of [null, '', 'amanhã', '2026-13-45', {}, undefined]) assert.equal(P.rotuloPrevisao(lixo, AGORA), null, String(lixo));
});

test('situacaoDoPatio: tempo parado, cor, atraso de entrega, pronto esquecido e extras', () => {
  const s = P.situacaoDoPatio({ etapa: 'em_execucao', etapa_em: MIN(300), previsao_entrega: '2026-10-25T16:00:00Z', extras_pendentes: 2 }, AGORA);
  assert.equal(s.parado, 300); assert.equal(s.tom, 'aviso'); assert.ok(s.atrasada); assert.equal(s.extras, 2); assert.ok(!s.esquecido);
  const e = P.situacaoDoPatio({ etapa: 'pronto', etapa_em: MIN(1500), previsao_entrega: '2026-10-25T10:00:00Z' }, AGORA);
  assert.ok(e.esquecido && e.prontoHaMin === 1500 && e.tom === 'ruim');
  assert.equal(e.previsao, null, 'carro pronto não tem mais entrega atrasada');
  const ok = P.situacaoDoPatio({ etapa: 'diagnostico', etapa_em: MIN(10) }, AGORA);
  assert.equal(ok.tom, 'ok'); assert.equal(ok.previsao, null);
  assert.deepEqual(arr(P.situacaoDoPatio(null, AGORA)).extras, 0);
  assert.equal(P.situacaoDoPatio({ etapa: 'x', etapa_em: 'lixo', extras_pendentes: 'abc' }, AGORA).extras, 0);
});

const LISTA = [
  { id: 'a', etapa: 'pronto', etapa_em: MIN(40) },
  { id: 'b', etapa: 'pronto', etapa_em: MIN(2000), telefone: '12991110011', cliente_nome: 'ana', veiculo: 'Onix', placa: 'ABC1D23' },
  { id: 'c', etapa: 'aguardando_aprovacao', etapa_em: MIN(300), extras_pendentes: 1 },
  { id: 'd', etapa: 'em_execucao', etapa_em: MIN(20), previsao_entrega: '2026-10-25T15:00:00Z' },
  { id: 'e', etapa: 'diagnostico', etapa_em: MIN(10) },
];
test('filtrarPatio: prontos, parados, esperando o cliente, entrega atrasada; filtro torto devolve tudo', () => {
  const ids = (f) => arr(P.filtrarPatio(LISTA, f, AGORA).map((x) => x.id));
  assert.deepEqual(ids('todos'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ids('prontos'), ['a', 'b']);
  assert.deepEqual(ids('parados'), ['c'], 'pronto não conta como parado: tem filtro próprio');
  assert.deepEqual(ids('extras'), ['c']);
  assert.deepEqual(ids('atrasados'), ['d']);
  assert.deepEqual(ids('qualquer'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(arr(P.filtrarPatio(null, 'prontos', AGORA)), []);
});
test('resumoDoPatio: contagens do cabeçalho', () => {
  assert.deepEqual(arr(P.resumoDoPatio(LISTA, AGORA)), { total: 5, prontos: 2, parados: 1, extras: 1, atrasados: 1, esquecidos: 1 });
  assert.deepEqual(arr(P.resumoDoPatio(null, AGORA)), { total: 0, prontos: 0, parados: 0, extras: 0, atrasados: 0, esquecidos: 0 });
});
test('mensagemCobrarExtras: singular/plural, carro e só link https do Pátio', () => {
  assert.match(P.mensagemCobrarExtras({ cliente_nome: 'ana souza', veiculo: 'Onix', placa: 'ABC1D23', extras_pendentes: 1, link_cliente: 'https://indycar-patio.netlify.app/acompanhar?t=abc' }),
    /^Oi Ana! Seu Onix ABC1D23 está com a gente e surgiu 1 serviço extra que precisa da sua aprovação\. Dá uma olhada e aprove por aqui: https:\/\/indycar-patio\.netlify\.app\/acompanhar\?t=abc$/);
  assert.match(P.mensagemCobrarExtras({ cliente_nome: 'ana', extras_pendentes: 3, link_cliente: 'https://x.com/a' }), /surgiram 3 serviços extras que precisam da sua aprovação/);
  for (const ruim of ['javascript:alert(1)', 'http://inseguro.com', 'https://u:p@x.com/', null]) {
    const m = P.mensagemCobrarExtras({ cliente_nome: 'ana', extras_pendentes: 1, link_cliente: ruim });
    assert.ok(!/javascript|inseguro|u:p/.test(m), String(ruim)); assert.match(m, /me responda que eu explico/);
  }
  assert.ok(!/undefined|null/.test(P.mensagemCobrarExtras({})));
});
test('mensagemProntoEsquecido: diz desde quando e não inventa nome', () => {
  assert.match(P.mensagemProntoEsquecido({ cliente_nome: 'ana', veiculo: 'Onix', placa: 'ABC1D23', etapa_em: MIN(2000) }, AGORA), /^Oi Ana! Seu Onix ABC1D23 está pronto aqui na IndyCar desde ontem\./);
  assert.match(P.mensagemProntoEsquecido({ cliente_nome: '<b>', etapa_em: MIN(60) }, AGORA), /^Olá! Seu carro está pronto aqui na IndyCar desde hoje/);
  assert.match(P.mensagemProntoEsquecido({ etapa_em: 'lixo' }, AGORA), /^Olá! Seu carro está pronto aqui na IndyCar\. Quando/);
});
