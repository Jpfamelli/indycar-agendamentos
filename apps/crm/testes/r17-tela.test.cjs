/* Rodada 17: fila da atendente no alto, fila que se atualiza sem pular, registrar com um toque e
   "pedem retorno" que diz quantos são sem responsável. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), js = pub('r17.js'), css = pub('r17.css'), sw = pub('sw.js'), r7 = pub('rodada7.js');

test('R17: a página carrega r17 depois do r16 e o service worker guarda os arquivos (v21)', () => {
  assert.ok(html.indexOf('href="r17.css"') > html.indexOf('href="r16.css"'));
  assert.ok(html.indexOf('src="r17.js"') > html.indexOf('src="r16.js"'));
  for (const f of ['r17.css', 'r17.js']) assert.ok(sw.includes(`'${f}'`), f);
  assert.match(sw, /indycar-crm-v21\b/);
});
test('R17: CSS novo com [hidden], só variáveis, toque de 44 px e sem borda grossa de um lado', () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css));
  assert.match(css, /\.r17-chip\{min-height:44px/);
  assert.ok(!/border-(left|right|top|bottom):\s*[3-9]px/.test(css));
});
test('R17: a fila só mostra o esqueleto na primeira vez (a recarga não troca a lista e a página não pula)', () => {
  assert.match(r7, /if \(!H6\.dados\) el\.innerHTML = '<div class="skeleton" aria-label="Montando a fila"><\/div>';/);
  assert.ok(!/\n\s*el\.innerHTML = '<div class="skeleton" aria-label="Montando a fila"><\/div>';\n\s*const qs/.test(r7), 'sobrou o esqueleto incondicional');
});
test('R17: a fila guarda a "Mensagem sugerida" aberta e sobe para a atendente (não para o gestor)', () => {
  assert.match(js, /details\[open\]/);
  assert.match(js, /function subirFila17\(\) \{\n\s*if \(SOU_GESTOR\) return;/);
  assert.match(js, /heroi\.after\(fila\)/);
});
test('R17: "O que aconteceu" vira botões de um toque e a lista antiga continua guardando o valor', () => {
  assert.match(js, /data-r17res=/);
  assert.match(js, /RESULTADOS6\.filter\(\(\[v\]\) => v\)/);
  assert.match(js, /rot\.hidden = true/);
  assert.match(js, /dlg\?\.id === 'dlgContato6'/);
});
test('R17: rótulo de "pedem retorno" diz quantos são sem responsável só para a atendente', () => {
  const { rotuloRetorno17 } = (() => {
    const ctx = { module: { exports: {} }, $: () => null, $$: () => [], H6: {}, CSS: { escape: s => s }, document: {}, renderHoje6() {}, renderHoje13() {}, abrirDlg() {} };
    require('node:vm').runInNewContext(js, ctx);
    return ctx.module.exports;
  })();
  assert.equal(rotuloRetorno17(340, 331, false), 'pedem retorno, 331 sem responsável');
  assert.equal(rotuloRetorno17(5, 5, false), 'pedem retorno, todos sem responsável');
  assert.equal(rotuloRetorno17(1, 0, false), 'pede retorno');
  assert.equal(rotuloRetorno17(340, 331, true), 'pedem retorno');
  assert.equal(rotuloRetorno17(NaN, 3, false), 'pedem retorno');
  assert.equal(rotuloRetorno17(4, null, false), 'pedem retorno');
});
test('R17: a fila do dia conta os sem responsável (servidor)', async () => {
  const horas = n => new Date(Date.now() - n * 36e5).toISOString();
  const L = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
  const lead = (n, extra = {}) => ({ id: L(n), nome: `Cliente Fictício ${n}`, telefone: '1299' + String(1000000 + n), status: 'novo', origem: 'whatsapp', valor_orcado: 0, valor_pago: 0,
    observacoes: '', created_at: horas(5), updated_at: horas(5), closed_at: null, responsavel_id: null, cliente_id: null, tentativas_contato: 0, ...extra });
  const s = await subirServidor({ tabelas: { crm_atividades: [], tarefas: [], patio_os: [], patio_extras: [], orc_orcamentos: [], conversas: [], agendamentos: [],
    leads: [lead(1, { responsavel_id: PESSOAS.atendente.id }), lead(2), lead(3), lead(4, { responsavel_id: PESSOAS.atendente2.id })] } });
  try {
    const a = await s.req('atendente', '/api/fila-do-dia');
    assert.equal(a.status, 200);
    assert.equal(a.corpo.total, 3);
    assert.equal(a.corpo.sem_responsavel, 2);
    const g = await s.req('gestor', '/api/fila-do-dia');
    assert.equal(g.corpo.sem_responsavel, 2);
    assert.equal(g.corpo.total, 4);
  } finally { await s.fechar(); }
});
