// Casa R16: o sino marca o aviso não lido com um pontinho e nenhum cartão usa borda grossa de um lado só.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (f) => readFileSync(join(RAIZ, 'casa', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('nenhum CSS da Casa tem borda de 2 px ou mais em um lado só (fora a marca do topo)', () => {
  for (const f of readdirSync(join(RAIZ, 'casa')).filter((n) => n.endsWith('.css'))) {
    const css = ler(f).replace(/\.topo-nome \{[^}]*\}/g, '');
    assert.doesNotMatch(css, /border-(left|right)(-width)?:\s*[2-9]px/, f);
  }
});

test('o aviso não lido do sino tem um pontinho redondo antes da palavra, em r13.css', () => {
  const css = ler('r13.css');
  assert.match(css, /\.n-nova::before \{[^}]*width: 8px; height: 8px;[^}]*border-radius: 50%;/);
  assert.match(readFileSync(join(RAIZ, 'casa/sino.js'), 'utf8'), /<span class="n-nova">não lido<\/span>/);
});

test('versões: r13.css v5 e service worker v23', () => {
  assert.match(readFileSync(join(RAIZ, 'casa/index.html'), 'utf8'), /r13\.css\?v=[5-9]/);
  assert.match(readFileSync(join(RAIZ, 'casa/sw.js'), 'utf8'), /indycar-casa-v2[3-9]/);
});
