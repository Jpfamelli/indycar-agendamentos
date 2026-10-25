// Casa (rodada 7, C1): conferências estáticas — nada de a Casa virar o app, tudo no cache, ajuda de atalhos em dia, CSP sem inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
await import('../casa/logica.js');
const L = globalThis.CasaLogica;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CASA = join(RAIZ, 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const jsDaCasa = readdirSync(CASA).filter((f) => f.endsWith('.js'));
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('a Casa nunca vira o app: nenhum location.href/assign/replace para fora e todo window.open tem nome de aba', () => {
  for (const f of jsDaCasa) {
    if (f === 'sw.js') continue;
    const s = semComentarios(ler(f));
    assert.doesNotMatch(s, /location\.(assign|replace)\s*\(/, f + ': location.assign/replace');
    assert.doesNotMatch(s, /(window\.)?location\.href\s*=/, f + ': location.href =');
    for (const m of s.matchAll(/window\.open\(([^)]*)\)/g)) assert.match(m[1], /,/, f + ': window.open sem nome de aba → ' + m[0]);
  }
});
test('todo link de app gerado pela Casa leva target com o nome da aba do app', () => {
  // nos modelos de HTML: se o <a> aponta para href dinâmico de app, tem target= na mesma tag
  for (const f of jsDaCasa) {
    const s = ler(f);
    for (const m of s.matchAll(/<a\s[^>]*href="\$\{[^}]*\}"[^>]*>/g)) {
      const tag = m[0];
      if (/href="#/.test(tag) || /data-ir-tarefas/.test(tag)) continue;
      assert.match(tag, /target=|\$\{alvo\(/,`${f}: link sem target → ${tag.slice(0, 120)}`);
    }
  }
});
test('index.html: todo script/estilo existe, entra na checagem (npm run check) e no cache offline (sw.js)', () => {
  const html = ler('index.html');
  const sw = ler('sw.js');
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
  for (const m of html.matchAll(/(?:src|href)="\/casa\/([a-z0-9.-]+\.(?:js|css))(?:\?v=\d+)?"/g)) {
    const arq = m[1];
    assert.ok(existsSync(join(CASA, arq)), arq + ' existe');
    if (arq.endsWith('.js') && arq !== 'tema.js') assert.ok(pkg.scripts.check.includes('node --check casa/' + arq), arq + ' na checagem');
    assert.ok(sw.includes('/casa/' + arq), arq + ' no cache do service worker');
  }
  assert.ok(pkg.scripts.check.includes('node --check casa-servidor.js'));
});
test('index.html: sem style=, onclick= ou script inline (a CSP da Casa não deixa)', () => {
  const html = ler('index.html');
  assert.doesNotMatch(html, /\sstyle="/); assert.doesNotMatch(html, /\son[a-z]+="/);
  assert.equal((html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) || []).length, 0);
});
test('os arquivos novos de CSS tratam [hidden] com !important', () => {
  for (const f of readdirSync(CASA).filter((x) => x.endsWith('.css'))) assert.match(ler(f), /\[hidden\]\s*\{\s*display:\s*none\s*!important/, f);
});
test('ajuda de atalhos e teclado andam juntos: toda tecla do handler está na ajuda e vice-versa', () => {
  const ajuda = L.AJUDA_ATALHOS.map(([k]) => k).join(' ');
  const handler = semComentarios(ler('atalhos.js'));
  const teclas = new Set([...handler.matchAll(/k === '([a-zA-Z/?])'/g)].map((m) => m[1].toLowerCase()));
  assert.ok(teclas.size >= 10, 'achou as teclas do handler: ' + [...teclas].join(''));
  for (const t of teclas) {
    const aparece = t === '/' ? /Ctrl\+K\s+ou\s+\//.test(ajuda) : t === 'g' ? /g\s+depois/.test(ajuda) : new RegExp('(^|\\s)' + t.replace('?', '\\?') + '(\\s|$)', 'i').test(ajuda.replace(/\s{2,}/g, ' '));
    assert.ok(aparece, 'tecla ' + t + ' está na ajuda');
  }
  for (const [k] of L.AJUDA_ATALHOS) assert.ok(typeof k === 'string' && k.length < 24);
  assert.ok(L.AJUDA_ATALHOS.length >= 20);
});
test('atalhos não disparam com janela aberta (busca, ficha, ajuda)', () => {
  assert.match(ler('atalhos.js'), /classList\.contains\('modal-aberto'\)/);
  assert.match(ler('ficha.js'), /classList\.add\('modal-aberto'\)/);
});
test('service worker: versão do cache subiu e os arquivos novos estão no CORE', () => {
  const sw = ler('sw.js');
  const v = Number(/indycar-casa-v(\d+)/.exec(sw)[1]);
  assert.ok(v >= 10, 'cache v' + v);
  for (const a of ['logica4.js', 'parar.js', 'saude.js', 'ficha.js', 'r7.css']) assert.ok(sw.includes('/casa/' + a), a);
});
test('módulos que mexem na tela se registram e se desmontam (nada de ouvinte vazando ao sair)', () => {
  for (const f of ['parar.js', 'saude.js', 'ficha.js']) {
    const s = ler(f);
    assert.match(s, /CasaModulos/); assert.match(s, /MOD\.desmontar/);
  }
  const parar = ler('parar.js');
  assert.match(parar, /removeEventListener\('click', aoClicar, true\)/); assert.match(parar, /obs\.disconnect\(\)/);
});
test('o texto da Casa nova não usa as palavras que a oficina não usa (veículo, prezado, efetuar, comparecer)', () => {
  for (const f of ['logica4.js', 'parar.js', 'saude.js', 'ficha.js', 'tarefas.js', 'sino.js']) {
    const s = semComentarios(ler(f));
    const textos = [...s.matchAll(/'([^'\n]{12,})'|`([^`\n]{12,})`/g)].map((m) => m[1] || m[2]).join(' ');
    assert.doesNotMatch(textos, /\b(prezado|efetuar|comparecer)\b/i, f);
  }
});
