/* A cópia do aparelho (sw.js) e a página (index.html) conhecem todos os arquivos da tela:
   arquivo novo fora da lista não abriria com o servidor dormindo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');
const arquivos = (dir, ext) => fs.readdirSync(path.join(TELA, dir), { recursive: true })
  .map((f) => (dir + '/' + f).split(path.sep).join('/'))
  .filter((f) => f.endsWith(ext));

function casca() {
  const sw = ler('sw.js');
  const ini = sw.indexOf('const CASCA = [');
  const fim = sw.indexOf('];', ini);
  return [...sw.slice(ini, fim).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('sw.js: todo CSS, JS e fonte da tela está na casca, e nada da casca falta no disco', () => {
  const lista = casca();
  for (const f of [...arquivos('js', '.js'), ...arquivos('css', '.css'), ...arquivos('ds', '.css'), ...arquivos('fontes', '.woff2')]) {
    assert.ok(lista.includes(f), f + ' fora da casca do sw.js');
  }
  for (const f of lista) {
    if (f === './' || f.startsWith('vendor/')) continue;   // a página e o cliente do Supabase vêm do servidor
    assert.ok(fs.existsSync(path.join(TELA, f)), f + ' está na casca mas não existe');
  }
});

test('index.html: cada folha de estilo da tela está ligada uma vez', () => {
  const html = ler('index.html');
  for (const f of [...arquivos('ds', '.css'), ...arquivos('css', '.css')]) {
    const vezes = html.split('href="' + f + '"').length - 1;
    assert.equal(vezes, 1, f + ' aparece ' + vezes + ' vezes no index.html');
  }
});
