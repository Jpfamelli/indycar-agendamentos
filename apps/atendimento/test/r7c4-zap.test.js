'use strict';
/* Rodada 7 (C4): o WhatsApp para e volta — banco, sino só para gestor/admin e restauração depois do reinício. */
const test = require('node:test');
const assert = require('node:assert');
const { criarSbFalso } = require('./apoio/sb-falso.js');
const { criarZap } = require('../lib/zap-estado.js');
const { criarPersistenciaZap } = require('../lib/r7-zap.js');

const AGORA = new Date('2026-10-26T13:00:00Z');

function montar({ zapRow = { id: true, parado: false } } = {}) {
  const avisos = [];
  const sb = criarSbFalso({
    perfis: [{ id: 'g1', papel: 'gestor', ativo: true }, { id: 'a1', papel: 'admin', ativo: true }, { id: 't1', papel: 'atendente', ativo: true }, { id: 'g2', papel: 'gestor', ativo: false }],
    r7_c4_zap: [zapRow],
  }, { relogio: () => AGORA, rpc: { notificar: (args) => { avisos.push(args); return { data: 'n' + avisos.length, error: null }; } } });
  let t = AGORA.getTime();
  const persiste = { zap: null };
  const zap = criarZap({ agora: () => t, aoMudar: (ev) => { persiste.p.aoMudar(ev); } });
  persiste.p = criarPersistenciaZap({ sb: () => sb, zap, agora: () => new Date(t), log: () => {} });
  return { sb, zap, avisos, p: persiste.p, avancar: (min) => { t += min * 60000; } };
}
const espera = () => new Promise((r) => setTimeout(r, 20));

test('parou: o banco guarda e só gestor e administrador ativos recebem o aviso', async () => {
  const m = montar();
  m.zap.marcar('codewords-401');
  await espera();
  const { data } = await m.sb.from('r7_c4_zap').select('*').eq('id', true).maybeSingle();
  assert.strictEqual(data.parado, true);
  assert.strictEqual(data.codigo, 'codewords-401');
  assert.deepStrictEqual(m.avisos.map((a) => a.p_perfil).sort(), ['a1', 'g1']);
  assert.match(m.avisos[0].p_titulo, /parou/);
  assert.strictEqual(m.avisos[0].p_link, '/?retomada=1');
});

test('voltou: marca o fim, guarda quantos minutos ficou parado e avisa para reenviar com calma', async () => {
  const m = montar();
  m.zap.marcar('codewords-401');
  await espera();
  m.avancar(95);
  m.zap.limpar();
  await espera();
  const { data } = await m.sb.from('r7_c4_zap').select('*').eq('id', true).maybeSingle();
  assert.strictEqual(data.parado, false);
  assert.strictEqual(data.ultima_parada_min, 95);
  assert.ok(data.voltou_em);
  const voltou = m.avisos.filter((a) => /voltou/.test(a.p_titulo));
  assert.strictEqual(voltou.length, 2);
  assert.match(voltou[0].p_corpo, /95 min/);
});

test('a chave de cada aviso muda com a parada: duas paradas, dois avisos; a mesma parada não repete', async () => {
  const m = montar();
  m.zap.marcar('codewords-401');
  await espera();
  const chave1 = m.avisos[0].p_chave;
  m.zap.limpar();
  m.avancar(10);
  m.zap.marcar('codewords-401');
  await espera();
  const paradas = m.avisos.filter((a) => /parou/.test(a.p_titulo));
  assert.notStrictEqual(paradas[paradas.length - 1].p_chave, chave1);
  // marcar de novo o mesmo código não é uma nova parada
  const antes = m.avisos.length;
  m.zap.marcar('codewords-401');
  await espera();
  assert.strictEqual(m.avisos.length, antes);
});

test('restaurar: depois do reinício, o disjuntor volta parado (e sem avisar de novo)', async () => {
  const m = montar({ zapRow: { id: true, parado: true, codigo: 'codewords-401', desde: new Date(AGORA.getTime() - 30 * 60000).toISOString() } });
  assert.strictEqual(m.zap.estado().parado, false);
  assert.strictEqual(await m.p.restaurar(), true);
  const e = m.zap.estado();
  assert.strictEqual(e.parado, true);
  assert.strictEqual(e.codigo, 'codewords-401');
  assert.strictEqual(m.avisos.length, 0);
});

test('restaurar: banco dizendo "não parado", código estranho ou sem linha não muda nada', async () => {
  assert.strictEqual(await montar().p.restaurar(), false);
  const estranho = montar({ zapRow: { id: true, parado: true, codigo: 'qualquer-coisa', desde: AGORA.toISOString() } });
  assert.strictEqual(await estranho.p.restaurar(), false);
  assert.strictEqual(estranho.zap.estado().parado, false);
});

test('banco fora do ar: o disjuntor continua funcionando e nada estoura', async () => {
  const zap = criarZap({ aoMudar: (ev) => p.aoMudar(ev) });
  const ruim = { from() { throw new Error('banco caiu'); }, rpc() { throw new Error('banco caiu'); } };
  const p = criarPersistenciaZap({ sb: () => ruim, zap, log: () => {} });
  zap.marcar('whatsapp-desconectado');
  await espera();
  assert.strictEqual(zap.estado().parado, true);
  assert.strictEqual((await criarPersistenciaZap({ sb: () => null, zap, log: () => {} }).aoMudar({ tipo: 'parou' })).ok, false);
});

test('"restaurar" não sobrescreve um estado mais novo, e minutos_parado aparece no estado', () => {
  let t = AGORA.getTime();
  const zap = criarZap({ agora: () => t });
  zap.marcar('codewords-401');
  assert.strictEqual(zap.restaurar({ codigo: 'whatsapp-desconectado', desde: new Date(t - 5 * 60000).toISOString() }), false);
  t += 12 * 60000;
  assert.strictEqual(zap.estado().minutos_parado, 12);
  assert.strictEqual(zap.estado().codigo, 'codewords-401');
});
