// Rodada 16 da Agenda: títulos em ordem (sem pular nível) e sem borda grossa de um lado só.
// O roteiro de navegador está em scripts/qa-r16-semantica.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = ler('public/app.js'), r6 = ler('public/rodada6.js'), r6b = ler('public/rodada6b.js'), conta = ler('public/conta.js');

test('toda tela ganha um h1 (visível ou só para leitor de tela)', () => {
  assert.match(app, /function garantirTitulo\(\)/);
  assert.match(app, /h\.className = 'so-leitor'/);
  assert.match(app, /garantirTitulo\(\);\s*\n\s*state\._pintou = true/);
  for (const t of ['Pendências', 'Configurações', 'Lista de espera']) assert.match(app, new RegExp(`<h1>${t}</h1>`));
  assert.match(r6b, /<h1>Quadro<\/h1>/);
});

test('Agenda e Recepção têm um h2 antes dos cartões (h1 e h3 não ficam sem meio)', () => {
  assert.match(app, /<h2 class="so-leitor">Horários marcados<\/h2><div class="panel-body lista" id="agendaList">/);
  assert.match(app, /<h2 class="so-leitor">Horários de hoje<\/h2>\s*\n\s*<div class="lista rec-lista"/);
});

test('faixas do Início e títulos de janela usam h2, e o CSS cobre h2 e h3', () => {
  assert.match(r6b, /<header><h2>[^<]*svg\(I\.calendar\)[^<]*esc\(titulo\)\}<\/h2>/);   // R19: a faixa virou "Amanhã, qui 26/11" com a lista do dia
  assert.match(r6, /<header><h2>🧾 Aprovados/);
  assert.doesNotMatch(app + conta + ler('public/agenda-planejada.js'), /modal-head"><h3/);
  assert.match(ler('public/styles.css'), /\.modal-head h2,\.modal-head h3\{/);
  assert.match(ler('public/rodada13.css'), /\.r6-faixa h2,\.r6-faixa h3\{/);
  assert.match(ler('public/rodada13.css'), /\.toolbar h1,\.toolbar h2\{/);
});

test('o título da janela ainda é achado para o aria-labelledby', () => {
  assert.match(app, /\$\('\.modal-head h2, \.modal-head h3', modal\)/);
});

test('nenhum CSS declara borda grossa (3px ou mais) de um lado só nos cartões', () => {
  for (const f of ['rodada6b.css', 'rodada7.css', 'rodada9.css', 'rodada13.css', 'styles.css']) {
    assert.doesNotMatch(ler('public/' + f), /border-left:\s*[4-9]px/, f);
  }
});

test('cache do service worker subiu para v44 ou mais', () => {
  assert.match(ler('public/sw.js'), /indycar-agenda-v(4[4-9]|[5-9]\d)/);
});
