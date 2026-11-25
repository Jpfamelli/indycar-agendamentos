// Rodada 16: títulos sem pular nível, "Detalhes" da conversa no celular. O visual é provado por scripts/roteiro-r16.mjs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const PUB = join(__dirname, '..', 'public');
const ler = (f) => readFileSync(join(PUB, f), 'utf8');

test('index.html: nenhum título pula nível (h1 -> h3)', () => {
  const html = ler('index.html'); let prev = 0; const pulos = [];
  for (const m of html.matchAll(/<h([1-6])\b/g)) { const n = +m[1]; if (prev && n > prev + 1) pulos.push(`h${prev}->h${n}@${m.index}`); prev = n; }
  assert.deepEqual(pulos, []);
});

test('r16.css/r16.js estão na página e no service worker (v28)', () => {
  const html = ler('index.html'), sw = ler('sw.js');
  assert.match(html, /href="r16\.css"/); assert.match(html, /src="r16\.js"/);
  assert.match(sw, /'r16\.css'/); assert.match(sw, /'r16\.js'/); assert.match(sw, /indycar-atendimento-v28/);
});

test('Detalhes: só em tela pequena, esconde etiquetas, avisos e resumo até abrir', () => {
  const css = ler('r16.css');
  assert.match(css, /\.chat-detalhes\{display:none\}/);
  const bloco = /@media \(max-width:900px\)\{[\s\S]*\}\s*$/.exec(css)[0];
  for (const q of ['.chat-linha-tags', '#chatAvisos', '#r6ChipsChat']) assert.ok(bloco.includes('#chat:not(.det-aberto) ' + q), q);
  assert.match(bloco, /min-height:44px/);
  assert.ok(!/#chatPropostas|#r6Zap/.test(bloco), 'propostas da IA e aviso do WhatsApp nunca somem');
});

function montar(guardado) {
  const cls = new Set(); const attrs = {}; let clique;
  const chat = { classList: { toggle: (c, v) => (v ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) } };
  const btn = { setAttribute: (k, v) => { attrs[k] = v; }, addEventListener: (_, f) => { clique = f; }, classList: { toggle() {} } };
  const mem = { ...guardado };
  const ctx = { document: { getElementById: (id) => (id === 'chat' ? chat : id === 'btnChatDetalhes' ? btn : null) },
    localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } };
  vm.runInNewContext(ler('r16.js'), ctx);
  return { cls, attrs, clique: () => clique(), mem };
}

test('r16.js: começa fechado, abre e fecha, e lembra no aparelho', () => {
  const a = montar({});
  assert.equal(a.cls.has('det-aberto'), false); assert.equal(a.attrs['aria-expanded'], 'false');
  a.clique(); assert.equal(a.cls.has('det-aberto'), true); assert.equal(a.attrs['aria-expanded'], 'true'); assert.equal(a.mem.indycar_chat_detalhes, '1');
  a.clique(); assert.equal(a.cls.has('det-aberto'), false); assert.equal(a.mem.indycar_chat_detalhes, '0');
  assert.equal(montar({ indycar_chat_detalhes: '1' }).cls.has('det-aberto'), true);
});

test('r16.js: sem localStorage a conversa continua funcionando', () => {
  const cls = new Set(); const btn = { setAttribute() {}, addEventListener: (_, f) => { btn.f = f; }, classList: { toggle() {} } };
  const chat = { classList: { toggle: (c, v) => (v ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) } };
  const ctx = { document: { getElementById: (id) => (id === 'chat' ? chat : id === 'btnChatDetalhes' ? btn : null) }, localStorage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } } };
  vm.runInNewContext(ler('r16.js'), ctx);
  btn.f(); assert.equal(cls.has('det-aberto'), true);
});
