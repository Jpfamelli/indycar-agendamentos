// Rodada 15: polimento do dia a dia (modo digitando no celular, "Próxima" na conversa, linha da lista, preconnect).
// A parte visual é provada no navegador por scripts/roteiro-r15.mjs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const PUB = join(__dirname, '..', 'public');
const ler = (f) => readFileSync(join(PUB, f), 'utf8');
const SEG = require('../lib/seguranca');

test('r15.css e r15.js estão na página e guardados pelo service worker (v27)', () => {
  const html = ler('index.html'), sw = ler('sw.js');
  assert.match(html, /<link rel="stylesheet" href="r15\.css" \/>/);
  assert.match(html, /<script src="r15\.js"><\/script>/);
  assert.match(sw, /'r15\.css'/);
  assert.match(sw, /'r15\.js'/);
  assert.match(sw, /indycar-atendimento-v2[789]/);
});

test('modo digitando: some o que fica entre o nome e as mensagens, só em tela pequena', () => {
  const css = ler('r15.css');
  const bloco = /@media \(max-width:900px\)\{\s*body\.digitando #chatAcoes,[\s\S]*?\}\s*\}/.exec(css);
  assert.ok(bloco, 'bloco do modo digitando');
  for (const id of ['#chatAcoes', '#r6ChipsChat', '#r6Zap', '#chatPropostas']) assert.ok(bloco[0].includes(id), id);
  // o campo de resposta e as respostas rápidas não somem
  assert.ok(!/body\.digitando #campoMensagem|body\.digitando \.chat-envio|body\.digitando #r6Sugestoes/.test(css));
});

test('r15.js: liga e desliga a classe pelo foco do campo e espera antes de desligar', () => {
  const js = ler('r15.js');
  assert.match(js, /addEventListener\('focus'/);
  assert.match(js, /classList\.add\('digitando'\)/);
  assert.match(js, /classList\.remove\('digitando'\)[\s\S]*250/);
  assert.match(js, /irParaProxima/);
  // simula: foco liga (celular), blur desliga depois do atraso
  const ouvintes = {}; const classes = new Set(); let timers = [];
  const caixa = {
    document: {
      getElementById: (id) => id === 'campoMensagem' ? { addEventListener: (n, f) => { ouvintes[n] = f; } } : id === 'btnProximaChat' ? { addEventListener: (n, f) => { ouvintes.proxima = f; } } : null,
      body: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } },
    },
    window: { matchMedia: () => ({ matches: true }), R6Tela: { irParaProxima: () => { caixa.foi = true; } } },
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: () => { timers = []; },
  };
  vm.createContext(caixa); vm.runInContext(js, caixa);
  ouvintes.focus(); assert.ok(classes.has('digitando'));
  ouvintes.blur(); assert.ok(classes.has('digitando'), 'ainda espera');
  timers.forEach((f) => f()); assert.ok(!classes.has('digitando'));
  ouvintes.proxima(); assert.equal(caixa.foi, true);
});

test('conversa aberta tem o botão "Próxima" com nome acessível', () => {
  assert.match(ler('index.html'), /id="btnProximaChat"[^>]*aria-label="Ir para a próxima conversa da fila"/);
});

/* limitarChips é função interna do r6-tela.js: tira o trecho do arquivo e roda isolado */
function limitar() {
  const src = ler('r6-tela.js');
  const ini = src.indexOf('const MAX_CHIPS_LINHA');
  const fim = src.indexOf('const FILTROS');
  const caixa = {}; vm.createContext(caixa);
  vm.runInContext(src.slice(ini, fim) + '\nthis.f = limitarChips;', caixa);
  return caixa.f;
}
const chip = (cls, t) => `<span class="r6-chip ${cls}" title="${t}">x</span>`;

test('lista: até 3 fichinhas passam inteiras', () => {
  const f = limitar();
  const p = [chip('a', 'A'), chip('b', 'B'), chip('c', 'C')];
  assert.deepEqual([...f(p)], p);
});

test('lista: com mais de 3, o nível de urgência e o "não saiu" ficam e o resto vira "+N" com o balão', () => {
  const f = limitar();
  const nivel = '<span class="r6-nivel r6-n-agora" title="Agora">!</span>';
  const falha = chip('r6-falha', 'Falhou 1');
  const p = [nivel, chip('r6-pre', 'Pediu horario'), chip('r6-orc', 'Orcamento 87'), chip('r6-patio', 'Carro no patio'), falha];
  const r = [...f(p)];
  assert.ok(r.includes(nivel) && r.includes(falha), 'fortes ficam');
  assert.equal(r.length, 3, 'nivel + falha + o "+N" (3 no total)');
  const mais = r[r.length - 1];
  assert.match(mais, /r6-mais/);
  assert.match(mais, />\+3</);
  assert.match(mais, /title="Pediu horario · Orcamento 87 · Carro no patio"/);
});

test('lista: a bolinha de não lidas vem primeiro na linha de fichinhas', () => {
  assert.match(ler('r15.css'), /\.conversa-tags \.nao-lidas\{order:-1\}/);
});

test('preconnect ao banco: só com endereço supabase.co guardado, e o script entra na política de segurança', () => {
  const html = ler('index.html');
  const m = /<script>\s*\(function \(\) \{\s*try \{\s*var c = JSON\.parse\(localStorage\.getItem\('indycar_cfg_publica'\)[\s\S]*?<\/script>/.exec(html);
  assert.ok(m, 'script do preconnect');
  assert.match(m[0], /supabase\\\.co/);
  const hashes = SEG.hashesDosScripts(html);
  const esperado = require('node:crypto').createHash('sha256').update(m[0].replace(/^<script>/, '').replace(/<\/script>$/, ''), 'utf8').digest('base64');
  assert.ok(hashes.includes(`'sha256-${esperado}'`), 'hash do script está na lista');
  // roda: com cópia guardada cria o link; sem cópia, nada
  const exec = (guardado) => {
    const links = [];
    const caixa = { localStorage: { getItem: () => guardado }, document: { createElement: () => ({}), head: { appendChild: (l) => links.push(l) } } };
    vm.createContext(caixa); vm.runInContext(m[0].replace(/^<script>/, '').replace(/<\/script>$/, ''), caixa);
    return links;
  };
  const ok = exec(JSON.stringify({ supabaseUrl: 'https://abc123.supabase.co' }));
  assert.equal(ok.length, 1); assert.equal(ok[0].rel, 'preconnect'); assert.equal(ok[0].href, 'https://abc123.supabase.co');
  assert.equal(exec(null).length, 0);
  assert.equal(exec(JSON.stringify({ supabaseUrl: 'https://evil.example.com' })).length, 0);
});

test('"Próxima" na conversa só no celular e no tablet (no computador o da lista está ao lado)', () => {
  const css = ler('r15.css');
  assert.match(css, /@media \(min-width:901px\)\{#btnProximaChat\{display:none\}\}/);
  assert.match(css, /@media \(max-width:900px\)\{\s*#btnProximaChat\{min-width:44px;min-height:44px\}/);
});
