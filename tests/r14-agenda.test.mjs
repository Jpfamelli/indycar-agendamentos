// Rodada 14 da Agenda: recepção do dia sem erro. O fluxo no navegador está em scripts/qa-r14-fluxo.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = ler('public/app.js'), css = ler('public/rodada13.css');

test('Não veio no Início pergunta no cartão antes de mandar o WhatsApp', () => {
  const m = app.match(/async function marcarDesfecho[\s\S]{0,600}/)[0];
  assert.match(m, /act === 'nao_veio' && !\(await perguntarNaoVeio\(card\)\)/);
  assert.match(app, /function perguntarNaoVeio/);
  assert.match(app, /Sim, não veio/);
});
test('o gatilho do banco não mudou: Chegou continua PATCH status compareceu', () => {
  assert.match(app, /api\('PATCH', `\/agendamentos\/\$\{id\}\/status`, \{ status: marca \}\)/);
});
test('chips da recepção são botões que levam à aba, e há chip de atrasados', () => {
  assert.match(app, /class="chip-rec casa" data-vai="chegaram"/);
  assert.match(app, /class="chip-rec atrasado" data-vai="agendados"/);
  assert.match(css, /\.rec-resumo \.chip-rec\{[^}]*min-height:44px/);
});
test('a aba de destino pisca depois de Chegou / Não veio, com movimento reduzido tratado', () => {
  assert.match(app, /classList\.add\('pulsa'\)/);
  assert.match(css, /prefers-reduced-motion[^}]*\.tab-num\.pulsa/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});
