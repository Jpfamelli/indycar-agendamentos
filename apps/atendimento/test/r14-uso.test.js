// Rodada 14: consertos de uso (Ajustes no celular, Etapas, Equipe, IA, chaves, lista no celular).
// A parte visual é provada no navegador por scripts/roteiro-r14.mjs; aqui ficam as regras que não podem voltar.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const PUB = join(__dirname, '..', 'public');
const ler = (f) => readFileSync(join(PUB, f), 'utf8');

test('r14.css está ligado na página e guardado pelo service worker', () => {
  assert.match(ler('index.html'), /<link rel="stylesheet" href="r14\.css" \/>/);
  assert.match(ler('sw.js'), /'r14\.css'/);
});

test('Ajustes: as abas não encolhem (não se atropelam) e têm 44 px no celular', () => {
  const css = ler('r14.css');
  assert.match(css, /\.ajustes-abas \.nav-item\{flex:none\}/);
  assert.match(css, /max-width:700px\)\{[^}]*\.ajustes-abas \.nav-item\{min-height:44px\}/s);
});

test('IA: sem o cartão "Como funciona" (ajuda dentro da tela); o teste continua', () => {
  const html = ler('index.html');
  assert.ok(!html.includes('Como funciona'));
  assert.ok(!html.includes('class="passos"'));
  assert.ok(html.includes('id="iaTeste"') && html.includes('id="btnTestarIA"'));
});

test('Etapas: sem barrinha colorida de lado, sem "ordem N", sem texto de lacuna repetido em toda linha', () => {
  const js = ler('app.js');
  assert.ok(!js.includes('<span class="etapa-barra"></span>'));
  assert.ok(!js.includes('Sem descrição: a IA fica sem essa pista.'));
  assert.ok(!js.includes('sem gatilhos cadastrados'));
  assert.ok(!/selo">ordem /.test(js));
  assert.match(js, /e\.descricao \? `<p class="etapa-desc">/);
  assert.match(ler('r14.css'), /\.etapa-barra\{display:none\}/);
});

test('Equipe: o cartão "você" não tem barra grossa de um lado', () => {
  assert.match(ler('r14.css'), /\.pessoa-cartao\.eu::before\{content:none\}/);
});

test('Chaves: as caixinhas de "entregar" e "responder sozinho" ficam em linha com o texto', () => {
  assert.match(ler('r14.css'), /\.form-vertical \.switch\{flex-direction:row/);
});

test('Celular: o cartão de hoje da lista não repete a frase dos números', () => {
  assert.match(ler('r14.css'), /max-width:700px\)\{[\s\S]*?\.hoje-mini \.hoje-frase\{display:none\}/);
  // o resumo continua montando a frase (o computador usa); só a tela do celular a esconde
  assert.ok(ler('hoje.js').includes('hoje-frase'));
});
