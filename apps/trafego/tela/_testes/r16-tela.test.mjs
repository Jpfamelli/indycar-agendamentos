/* Rodada 16: o botão "voltar" do celular fecha a ficha; títulos da tela antiga em ordem. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');

/** Navegador de brinquedo: pilha de histórico com pushState/back e popstate assíncrono-síncrono. */
function montarMundo() {
  const pilha = [{ state: null }]; let i = 0; const ouvintes = [];
  globalThis.location = { href: 'http://x/#/clientes' };
  globalThis.history = {
    get state() { return pilha[i].state; },
    pushState(s) { pilha.splice(i + 1); pilha.push({ state: s }); i++; },
    back() { i--; ouvintes.forEach((f) => f()); },
  };
  globalThis.window = { addEventListener: (t, f) => { if (t === 'popstate') ouvintes.push(f); } };
  const abertos = new Set();
  globalThis.document = { querySelector: () => (abertos.size ? {} : null) };
  const dlg = () => { const o = { open: true, ouv: [], addEventListener(t, f) { this.ouv.push(f); }, close() { if (!this.open) return; this.open = false; abertos.delete(this); this.ouv.forEach((f) => f()); } }; abertos.add(o); return o; };
  return { dlg, pilha: () => i, tamanho: () => pilha.length };
}

test('voltar do celular fecha a ficha e não sai da tela', async () => {
  const m = montarMundo();
  const { voltarFecha, ligarVoltar } = await import('../js/voltar.js?a');
  ligarVoltar();
  const d = m.dlg(); voltarFecha(d);
  assert.equal(m.pilha(), 1, 'abrir guarda uma entrada');
  history.back();
  assert.equal(d.open, false, 'voltar fechou');
  assert.equal(m.pilha(), 0, 'e ficou na mesma tela');
});

test('fechar pelo X devolve a entrada; trocar de ficha reaproveita a mesma', async () => {
  const m = montarMundo();
  const { voltarFecha, ligarVoltar } = await import('../js/voltar.js?b');
  ligarVoltar();
  const a = m.dlg(); voltarFecha(a);
  const b = m.dlg(); a.close(); voltarFecha(b);
  assert.equal(m.pilha(), 1, 'só uma entrada para duas fichas');
  b.close();
  assert.equal(m.pilha(), 0, 'fechar pelo X volta ao ponto de antes');
});

test('a ficha de Clientes usa o voltar; a casca liga e guarda o arquivo no service worker', () => {
  assert.match(ler('js/telas/clientes.js'), /voltarFecha\(dlg\)/);
  assert.match(ler('js/app.js'), /ligarVoltar\(\)/);
  assert.match(ler('sw.js'), /js\/voltar\.js/);
  assert.match(ler('sw.js'), /indycar-trafego-r16-1/);
});

test('tela antiga: os quadros (conta, tarefas, regra, ajuda) abrem com h2 e não pulam nível', () => {
  const html = fs.readFileSync(path.join(TELA, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['titulo-conta', 'titulo-tarefas', 'titulo-regra', 'titulo-ajuda']) assert.match(html, new RegExp('<h2 class="t3" id="' + id + '"'));
  assert.doesNotMatch(html, /<h4/);
  const css = fs.readFileSync(path.join(TELA, '..', 'public', 'styles.css'), 'utf8');
  assert.doesNotMatch(css, /\.leitura-texto\{[^}]*border-left/);
});
