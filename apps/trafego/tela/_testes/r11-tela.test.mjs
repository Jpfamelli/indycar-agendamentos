/* Rodada 11 (o João achou o Tráfego confuso): três abas, gráfico por semana, selo das campanhas, metas,
   o topo comum e a ausência de tudo que saiu da tela (Hoje, Jornada, Gestor IA, ajuda, chaves, relatórios). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TELAS, lerRota, montarRota, abasDoPapel } from '../js/rotas.js';
import { porSemana, seloDaCampanha, ordenarCampanhas } from '../js/resumo-logica.js';
import { paraCampo, doCampo, CAMPOS } from '../js/telas/gavetas/metas.js';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');
const todoJs = () => fs.readdirSync(path.join(TELA, 'js'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => ler(path.join('js', f))).join('\n');

test('três abas: Resumo, Campanhas e Ajustes; Ajustes só para o administrador', () => {
  assert.deepEqual(TELAS.map((t) => t.rotulo), ['Resumo', 'Campanhas', 'Ajustes']);
  assert.deepEqual(abasDoPapel('admin').map((t) => t.id), ['resumo', 'campanhas', 'ajustes']);
  assert.deepEqual(abasDoPapel('dono').map((t) => t.id), ['resumo', 'campanhas', 'ajustes']);
  assert.deepEqual(abasDoPapel('gestor').map((t) => t.id), ['resumo', 'campanhas']);
});

test('endereço antigo (Hoje, Jornada, Gestor IA, folha, apresentação) abre o Resumo, sem levar filtro velho', () => {
  for (const velho of ['#/hoje', '#/jornada?pendencia=sem_valor', '#/gestor', '#/folha?mes=2026-10', '#/apresentacao', '', '#/admin']) {
    assert.deepEqual(lerRota(velho), { tela: 'resumo', params: {} }, velho);
  }
  assert.deepEqual(lerRota('#/campanhas?periodo=mes_passado&X-Y=1'), { tela: 'campanhas', params: { periodo: 'mes_passado' } });
  assert.equal(montarRota('campanhas', { periodo: 'mes_passado', vazio: '' }), '#/campanhas?periodo=mes_passado');
  assert.equal(montarRota('gestor'), '#/resumo');
});

test('gráfico por semana: soma contatos dos anúncios e gasto de 7 em 7 dias, com rótulo em português', () => {
  const dias = Array.from({ length: 19 }, (_, i) => ({ data: '2026-11-' + String(i + 1).padStart(2, '0'), gasto: 10, contatos_anuncio: i < 7 ? 1 : 2 }));
  const s = porSemana(dias);
  assert.deepEqual(s.map((x) => x.rotulo), ['1 a 7 nov', '8 a 14 nov', '15 a 19 nov']);
  assert.deepEqual(s.map((x) => x.contatos), [7, 14, 10]);
  assert.deepEqual(s.map((x) => x.gasto), [70, 70, 50]);
  // sem conta de anúncios: o gasto vem null e fica null (a tela não escreve "R$ 0")
  assert.equal(porSemana([{ data: '2026-11-01', gasto: null, contatos_anuncio: 3 }])[0].gasto, null);
  assert.equal(porSemana([{ data: '2026-10-29', gasto: 1, contatos_anuncio: 0 }, { data: '2026-11-02', gasto: 1, contatos_anuncio: 0 }])[0].rotulo, '29 out a 2 nov');
  assert.deepEqual(porSemana(null), []);
});

test('campanhas: selo Boa, Atenção ou Ruim pelo tom da API; quem gastou mais vem primeiro', () => {
  assert.deepEqual(seloDaCampanha({ leitura: { tom: 'bom' } }), ['bom', 'Boa']);
  assert.deepEqual(seloDaCampanha({ leitura: { tom: 'atencao' } }), ['atencao', 'Atenção']);
  assert.deepEqual(seloDaCampanha({ leitura: { tom: 'ruim' } }), ['grave', 'Ruim']);
  assert.equal(seloDaCampanha({ leitura: { tom: 'neutro' } }), null);
  assert.equal(seloDaCampanha({}), null);
  const ordem = ordenarCampanhas([{ nome: 'B', gasto: 10 }, { nome: 'A', gasto: null, contatos: 5 }, { nome: 'C', gasto: 300 }]);
  assert.deepEqual(ordem.map((c) => c.nome), ['C', 'B', 'A']);
});

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

test('o que saiu da tela não volta: telas antigas, navegação de baixo, troca de app, ajuda e siglas', () => {
  for (const f of ['js/telas/hoje.js', 'js/telas/jornada.js', 'js/telas/gestor.js', 'js/telas/fila.js', 'js/telas/folha.js', 'js/telas/apresentacao.js',
    'js/telas/gavetas/chaves.js', 'js/telas/gavetas/origem.js', 'js/telas/gavetas/relatorios.js', 'js/telas/gavetas/devolucao.js', 'css/hoje.css', 'css/gestor.css']) {
    assert.equal(fs.existsSync(path.join(TELA, f)), false, f + ' saiu');
  }
  const html = ler('index.html');
  for (const velho of ['navbaixo', 'casca-troca', 'menuApps', 'sessaoPeriodo', 'Gestor IA', 'Jornada']) assert.ok(!html.includes(velho), velho);
  const js = todoJs();
  for (const re of [/\bROAS\b/, /\bCPA\b/, /\bCPL\b/, /\bCTR\b/, /Como usar|\bDicas\b|\btour\b/i,/'Ajuda'/]) assert.doesNotMatch(js, re);
});
