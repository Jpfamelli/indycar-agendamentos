import assert from 'node:assert/strict';
import { test } from 'node:test';

test('confere os dois mocks antes de abrir o navegador', async () => {
  const { confereMock } = await import('./confere-mock-r10.mjs');
  const origem = 'http://localhost:3471';
  const chamar = async (url, opcoes) => {
    assert.equal(url, origem + '/__qa/mock');
    assert.equal(opcoes.redirect, 'error');
    return Response.json({ mock: 'comunicar' });
  };
  await confereMock(origem, 'comunicar', chamar);
  await assert.rejects(confereMock(origem, 'atendimento', chamar), /mock de atendimento/);
  await assert.rejects(confereMock(origem, 'comunicar', async () => new Response('indisponível', { status: 503 })), /mock de comunicar/);
});
