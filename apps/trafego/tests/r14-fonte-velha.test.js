'use strict';
/* R14 — resultado montado um pouco vencido: a tela recebe o pronto na hora e a releitura corre por trás (uma só).
   Sem o tempo extra ligado (como nos outros testes), nada muda: passou dos 30 s, lê de novo e espera. */
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../motor/fonte');

function relogio(inicio = 1_000_000) { let t = inicio; const f = () => t; f.andar = ms => { t += ms; }; return f; }
const esperar = () => new Promise(r => setImmediate(r));

test('com tempo extra: vencido responde o guardado na hora e relê por trás, uma vez só', async () => {
  const agora = relogio();
  const f = F.criarFonte({ sb: {}, agora, velho: 120_000 });
  let versao = 0;
  const montar = async () => ({ v: ++versao });
  assert.deepEqual(await f.guardar('x', montar), { v: 1 });
  agora.andar(31_000);
  const [a, b] = await Promise.all([f.guardar('x', montar), f.guardar('x', montar)]);
  assert.deepEqual([a, b], [{ v: 1 }, { v: 1 }], 'respondeu o que já tinha');
  await esperar(); await esperar();
  assert.equal(versao, 2, 'uma releitura só, mesmo com dois pedidos');
  assert.deepEqual(await f.guardar('x', montar), { v: 2 }, 'o próximo já vê o novo');
});

test('a releitura sabe que é releitura (pede dados frescos)', async () => {
  const agora = relogio();
  const f = F.criarFonte({ sb: {}, agora, velho: 120_000 });
  const vistos = [];
  const montar = async (r) => { vistos.push(!!(r && r.renovando)); return 1; };
  await f.guardar('y', montar);
  agora.andar(40_000);
  await f.guardar('y', montar);
  await esperar();
  assert.deepEqual(vistos, [false, true]);
});

test('passou do tempo extra: espera a leitura nova; fresco e esquecer() também', async () => {
  const agora = relogio();
  const f = F.criarFonte({ sb: {}, agora, velho: 120_000 });
  let versao = 0;
  const montar = async () => ({ v: ++versao });
  await f.guardar('z', montar);
  agora.andar(121_000);
  assert.deepEqual(await f.guardar('z', montar), { v: 2 });
  assert.deepEqual(await f.guardar('z', montar, { fresco: true }), { v: 3 });
  agora.andar(31_000);
  f.esquecer();
  assert.deepEqual(await f.guardar('z', montar), { v: 4 }, 'gravou algo: nada de resposta velha');
});

test('releitura que falha: segue com o guardado e só tenta de novo depois de 10 s', async () => {
  const agora = relogio();
  const f = F.criarFonte({ sb: {}, agora, velho: 120_000 });
  let chamadas = 0, quebra = false;
  const montar = async () => { chamadas++; if (quebra) throw new Error('banco fora'); return { ok: chamadas }; };
  await f.guardar('w', montar);
  agora.andar(31_000); quebra = true;
  assert.deepEqual(await f.guardar('w', montar), { ok: 1 });
  await esperar(); await esperar();
  assert.equal(chamadas, 2);
  await f.guardar('w', montar); await esperar();
  assert.equal(chamadas, 2, 'dentro dos 10 s não insiste');
  agora.andar(11_000); quebra = false;
  await f.guardar('w', montar); await esperar(); await esperar();
  assert.equal(chamadas, 3);
});

test('sem o tempo extra (padrão dos testes) nada muda: vencido lê de novo e espera', async () => {
  const agora = relogio();
  const f = F.criarFonte({ sb: {}, agora });
  let versao = 0;
  const montar = async () => ({ v: ++versao });
  await f.guardar('k', montar);
  agora.andar(31_000);
  assert.deepEqual(await f.guardar('k', montar), { v: 2 });
});

test('a fonte do app liga o tempo extra', () => { assert.equal(F.VELHO_MS, 120_000); });
