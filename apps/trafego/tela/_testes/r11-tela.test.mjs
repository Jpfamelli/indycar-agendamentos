/* Rodada 11 (o João achou o Tráfego confuso): metas, o topo comum e a ausência de tudo que saiu da tela
   (Hoje, Jornada, Gestor IA, ajuda, chaves). Na rodada 12 a tela voltou a ter cinco seções (no pique do Nexus Ads):
   a navegação, os filtros e o selo das campanhas agora são cobrados em r12-tela.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paraCampo, doCampo, CAMPOS } from '../js/telas/gavetas/metas.js';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');
const todoJs = () => fs.readdirSync(path.join(TELA, 'js'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => ler(path.join('js', f))).join('\n');

test('metas: o jeito brasileiro de digitar vira número; em branco é "não sei"; margem 100% aparece vazia', () => {
  assert.deepEqual(doCampo('1.500', 'dinheiro'), { valor: 1500 });
  assert.deepEqual(doCampo('R$ 45,90', 'dinheiro'), { valor: 45.9 });
  assert.deepEqual(doCampo('  ', 'dinheiro'), { valor: null });
  assert.match(doCampo('abc', 'dinheiro').erro, /reais/);
  assert.deepEqual(doCampo('12,5', 'porcento'), { valor: 12.5 });
  assert.match(doCampo('120', 'porcento').erro, /0 a 100/);
  assert.equal(paraCampo(1500, 'dinheiro'), '1.500');
  assert.equal(paraCampo(100, 'porcento'), '');
  assert.deepEqual(CAMPOS.map((c) => c.id), ['orcamento_mensal', 'cpa_alvo', 'ticket_medio', 'margem_pct']);
});

test('topo comum: .ic-topo com "IndyCar Tráfego", o indycar.css antes do CSS do app e o logo da Central', () => {
  const html = ler('index.html');
  assert.match(html, /<header class="ic-topo">/);
  assert.match(html, /<span class="ic-nome">IndyCar <b>Tráfego<\/b><\/span>/);
  assert.match(html, /src="\.\.\/casa\/logo\.png"/);
  const casa = html.indexOf('href="../casa/indycar.css"'), app = html.indexOf('href="ds/tokens.css"');
  assert.ok(casa > 0 && casa < app, 'o indycar.css vem antes do CSS do app');
});

test('fontes: só Archivo e Barlow Condensed, sem a itálica pesada', () => {
  const css = ['ds/tokens.css', 'ds/base.css', 'ds/componentes.css', 'css/trafego.css'].map(ler).join('\n');
  assert.doesNotMatch(css, /font-style:\s*italic/);
  assert.doesNotMatch(css, /\b(Inter|Roboto|Arial|Helvetica)\b|fonts\.googleapis/);
  assert.equal(fs.existsSync(path.join(TELA, 'fontes', 'barlow-condensed-800-italic.woff2')), false);
});

test('o que saiu da tela não volta: telas antigas, troca de app, ajuda e siglas', () => {
  for (const f of ['js/telas/hoje.js', 'js/telas/jornada.js', 'js/telas/gestor.js', 'js/telas/fila.js', 'js/telas/folha.js', 'js/telas/apresentacao.js',
    'js/telas/gavetas/chaves.js', 'js/telas/gavetas/origem.js', 'js/telas/gavetas/relatorios.js', 'js/telas/gavetas/devolucao.js', 'css/hoje.css', 'css/gestor.css',
    'js/telas/resumo.js', 'js/resumo-logica.js', 'js/telas/periodo.js']) {
    assert.equal(fs.existsSync(path.join(TELA, f)), false, f + ' saiu');
  }
  const html = ler('index.html');
  for (const velho of ['navbaixo', 'casca-troca', 'menuApps', 'sessaoPeriodo', 'Gestor IA', 'Jornada']) assert.ok(!html.includes(velho), velho);
  const js = todoJs();
  for (const re of [/\bROAS\b/, /\bCPA\b/, /\bCPL\b/, /\bCTR\b/, /Como usar|\bDicas\b|\btour\b/i,/'Ajuda'/]) assert.doesNotMatch(js, re);
});
