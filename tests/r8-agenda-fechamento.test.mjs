import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFiltroFechamentoDoDia } from '../dados.js';

test('fechamento inclui horários de ontem e anteriores, com os mesmos filtros na lista e no contador', () => {
  const filtro = new URLSearchParams(lerFiltroFechamentoDoDia('2026-11-19'));
  assert.equal(filtro.get('data'), 'lt.2026-11-19');
  assert.equal(filtro.get('status'), 'in.(compareceu,em_atendimento,aguardando,confirmado)');
});

test('confirmar com valor vazio orienta a usar a opção explícita de pendência', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const dialogo = app.slice(app.indexOf('function pedirValorAoFechar'), app.indexOf('async function marcarDesfecho'));
  assert.ok(dialogo.includes('if (v === null || v === 0)'));
  assert.match(dialogo, /Digite o valor ou escolha “Não sei agora”/);
});
