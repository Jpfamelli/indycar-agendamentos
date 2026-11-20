'use strict';
/* Rodada 10: os roteiros de navegador não dependem de configuração de verdade nem saem desta máquina. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ler = nome => fs.readFileSync(path.join(__dirname, '..', 'scripts', nome), 'utf8');

test('R10-ATD-029: o roteiro da casca sobe o servidor com configuração de mentira, sem a chave do banco, e bloqueia saída de rede', () => {
  const s = ler('roteiro-casca.cjs');
  assert.match(s, /SUPABASE_URL: 'https:\/\/casca-de-mentira\.supabase\.co'/, 'endereço público de mentira (antes dependia do .env de verdade e caía 11 de 13 sem ele)');
  assert.match(s, /SUPABASE_SERVICE_ROLE_KEY: ''/, 'sem a chave do banco: nada é lido nem gravado');
  assert.match(s, /ANTHROPIC_API_KEY: ''/);
  assert.match(s, /setRequestInterception\(true\)/);
  assert.match(s, /permiteRequisicao\(r\.url\(\), 'http:\/\/localhost:3230'\)/, 'só o servidor local responde à página');
});

const pub = nome => fs.readFileSync(path.join(__dirname, '..', 'public', nome), 'utf8');
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

test('R10-ATD-033: nenhuma pergunta de apagar usa a janela do navegador; a do app tem campo, foco em Cancelar e fica por cima', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'public')).filter(x => x.endsWith('.js'))) {
    assert.doesNotMatch(semComentario(pub(f)), /(^|[^.\w])(confirm|prompt|alert)\s*\(/, `${f} ainda chama confirm(), prompt() ou alert() do navegador`);
  }
  const html = pub('index.html'), acesso = pub('acesso.js'), css = pub('styles.css'), app = pub('app.js');
  assert.match(html, /id="confirmarCampo"/);
  assert.match(html, /id="btnConfirmarNao"/);
  assert.match(acesso, /perigo \? '#btnConfirmarNao' : '#btnConfirmarOk'/, 'ação que apaga abre com o foco em Cancelar');
  assert.match(acesso, /campo\.exigir && !igual\(entrada\.value, campo\.exigir\)/, 'o botão só libera quando o texto exigido confere');
  assert.match(css, /#modalConfirmarBg\{z-index:130\}/);
  assert.match(app, /querySelector\('#modalConfirmarBg\.aberto'\) \|\|/, 'Esc e Tab valem primeiro para a pergunta');
  assert.match(app, /e\.key === 'Escape' && !menuAberto && !document\.querySelector\('#modalConfirmarBg\.aberto'\)/, 'Esc com pergunta aberta não fecha a janela de baixo (atalho, etapa, agendar)');
  for (const titulo of ['Excluir a conversa de', 'Apagar o registro', 'Excluir o atalho', 'Excluir a etapa']) assert.ok(app.includes(titulo), titulo);
});

test('R10-ATD-033 (dia a dia): perguntas (reenviar, assumir, lidas, encaixe, retomada, resolvi) passam pela janela do app', () => {
  const usos = ['app.js', 'r6-tela.js', 'r6c5.js', 'r7c4.js'].map(f => (pub(f).match(/Acesso\.perguntar\(/g) || []).length);
  assert.deepEqual(usos, [8, 2, 1, 2]);
  const r7 = pub('r7c4.js');
  assert.match(r7, /f\.dataset\.encaixeOk = '1'; f\.requestSubmit\(\)/, 'o encaixe confirmado envia o formulário de novo');
  assert.match(pub('r6-tela.js'), /campo: \{ rotulo: 'Como você resolveu\?/);
});

test('R10-ATD-034: tema claro usa a logo de fundo transparente e ela está na casca guardada', () => {
  assert.match(pub('styles.css'), /:root\[data-tema="claro"\] \.logo-img\{content:url\("logo-claro\.png"\);mix-blend-mode:normal\}/);
  const png = fs.readFileSync(path.join(__dirname, '..', 'public', 'logo-claro.png'));
  assert.equal(png.readUInt32BE(16), 225);
  assert.equal(png[25], 6, 'PNG com transparência (RGBA)');
  const sw = pub('sw.js');
  assert.match(sw, /'logo-claro\.png'/);
  assert.match(sw, /indycar-atendimento-v22/);
});

test('R10-ATD-035: os roteiros antigos respondem à pergunta do app (não dependem mais da janela do navegador)', () => {
  for (const r of ['roteiro-r5c-dono-confirmacao.cjs', 'roteiro-r6c5.cjs', 'roteiro-r7c4.cjs', 'roteiro-rodada4.cjs', 'roteiro-rodada5.cjs', 'roteiro-rodada6.cjs', 'roteiro-tela.cjs']) {
    const s = ler(r);
    assert.match(s, /responderPerguntas\(p, /, r);
    assert.doesNotMatch(s, /on\('dialog'/, r);
  }
  assert.match(ler('roteiro-r10.cjs'), /p\.on\('dialog', d => \{ p\.nativos\.push/, 'o roteiro novo acusa se a janela do navegador voltar');
});
