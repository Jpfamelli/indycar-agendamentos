// Rodada 15 da Agenda: polimento do dia. O fluxo no navegador está em scripts/qa-r15-fluxo.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = ler('public/app.js'), css = ler('public/rodada13.css');

test('o cartão "Próximo" do Início tem o botão Chegou, ligado ao Chegou da lista', () => {
  assert.match(app, /class="r13-prox-chegou" data-prox-chegou="\$\{esc\(prox\.id\)\}"/);
  assert.match(app, /\$\('\[data-act="compareceu"\]', cartao\)\?\.click\(\)/);
  assert.match(css, /\.r13-prox-chegou\{[^}]*min-height:48px/);
});
test('sem próximo mas com gente atrasada, o cartão leva à lista em vez de ficar sem saída', () => {
  assert.match(app, /data-ver-lista>Ver quem falta/);
  assert.match(app, /\$\('\[data-ver-lista\]', view\)\?\.addEventListener/);
});
test('a tela Agenda mostra Chegou nos horários de hoje que ainda não chegaram', () => {
  assert.match(app, /appointmentCard\(a, \{ agora, comChegada: a\.data === agora\.data && \['aguardando', 'confirmado'\]\.includes\(a\.status\) && a\.compareceu !== 1 \}\)/);
});
test('atualização silenciosa que falha mantém a lista e avisa com botão Atualizar', () => {
  const m = app.match(/async function route\(r, opts = \{\}\)\{[\s\S]*?refreshBadge\(quieto\);\n\}/)[0];
  assert.match(m, /if \(quieto && view\.querySelector\('\.appt/);
  assert.match(m, /Não consegui atualizar agora/);
  assert.match(m, /rotulo: 'Atualizar'/);
  // a tela cheia de erro continua valendo para a primeira abertura (sem nada pintado)
  assert.match(m, /Não consegui carregar esta tela/);
});
test('cache do service worker subiu para v43', () => {
  assert.match(ler('public/sw.js'), /indycar-agenda-v43/);
});
