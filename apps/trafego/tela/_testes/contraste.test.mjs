/* Contraste dos pares de cor do sistema visual (ds/tokens.css), nos dois temas.
   Lê o próprio arquivo de tokens: se alguém trocar uma cor e o par cair abaixo
   do mínimo, o teste quebra. Texto: 4,5:1. Marca gráfica (setor, barra, borda
   de controle): 3:1. A tabela do GUIA-VISUAL.md sai daqui (node _testes/contraste.test.mjs --tabela). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ds', 'tokens.css'), 'utf8');

function bloco(seletor) {
  const i = CSS.indexOf(seletor + ' {');
  assert.ok(i >= 0, 'não achei ' + seletor);
  return CSS.slice(i, CSS.indexOf('\n}', i));
}
function variaveis(texto) {
  const mapa = {};
  for (const m of texto.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) mapa[m[1]] = m[2].trim();
  return mapa;
}
const ESCURO = variaveis(bloco(':root'));
const CLARO = { ...ESCURO, ...variaveis(bloco(":root[data-tema='claro']")) };

function resolver(mapa, nome, fundo) {
  let v = mapa[nome];
  for (let i = 0; i < 10 && v && v.startsWith('var('); i++) v = mapa[v.slice(4, -1).trim()];
  assert.ok(v, 'token sem valor: ' + nome);
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((k) => parseInt(hex[1].slice(k, k + 2), 16));
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([0-9.]+)\s*\)$/.exec(v);
  assert.ok(rgb, 'formato de cor desconhecido em ' + nome + ': ' + v);
  const a = Number(rgb[4]);
  return [1, 2, 3].map((k, j) => Math.round(Number(rgb[k]) * a + fundo[j] * (1 - a)));
}
function luz([r, g, b]) {
  const c = [r, g, b].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(mapa, frente, fundo) {
  const f = resolver(mapa, fundo, [0, 0, 0]);
  const a = luz(resolver(mapa, frente, f)), b = luz(f);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* [frente, fundo, mínimo, para que serve] */
export const PARES = [
  ['--cor-tinta', '--cor-fundo', 4.5, 'texto principal'],
  ['--cor-tinta', '--cor-superficie', 4.5, 'texto em painel'],
  ['--cor-tinta', '--cor-superficie-2', 4.5, 'texto em botão'],
  ['--cor-tinta-2', '--cor-fundo', 4.5, 'texto de apoio'],
  ['--cor-tinta-2', '--cor-superficie', 4.5, 'texto de apoio em painel'],
  ['--cor-tinta-3', '--cor-fundo', 4.5, 'texto apagado'],
  ['--cor-marca-texto', '--cor-fundo', 4.5, 'destaque vermelho em texto pequeno'],
  ['--cor-sobre-acao', '--cor-acao', 4.5, 'botão principal'],
  ['--cor-setor-recorde', '--cor-fundo', 4.5, 'selo "recorde"'],
  ['--cor-setor-bom', '--cor-fundo', 4.5, 'selo "melhorou" / "em dia"'],
  ['--cor-setor-atencao', '--cor-fundo', 4.5, 'selo "atenção"'],
  ['--cor-setor-espera', '--cor-fundo', 4.5, 'selo "esperando"'],
  ['--cor-grave', '--cor-fundo', 4.5, 'selo de problema grave'],
  ['--cor-setor-bom', '--cor-superficie', 4.5, 'selo em painel'],
  ['--cor-setor-atencao', '--cor-superficie', 4.5, 'selo em painel'],
  ['--cor-marca', '--cor-fundo', 3, 'paralelogramo e barra "de anúncio"'],
  ['--setor-feito', '--setor-vazio', 3, 'mini-setor cumprido contra o vazio'],
  ['--cor-dado', '--cor-dado-trilho', 3, 'barra de dado no trilho'],
  ['--cor-linha-forte', '--cor-fundo', 3, 'borda de botão e campo'],
  ['--cor-foco', '--cor-fundo', 3, 'anel de foco'],
  ['--cor-casca-tinta', '--cor-casca', 4.5, 'barra do ecossistema'],
  ['--cor-casca-tinta-2', '--cor-casca', 4.5, 'barra do ecossistema, apoio'],
];

for (const [nomeTema, mapa] of [['escuro', ESCURO], ['claro', CLARO]]) {
  test('contraste no tema ' + nomeTema, () => {
    for (const [frente, fundo, minimo, uso] of PARES) {
      const c = contraste(mapa, frente, fundo);
      assert.ok(c >= minimo, `${nomeTema}: ${frente} sobre ${fundo} (${uso}) tem ${c.toFixed(2)}:1, precisa ${minimo}:1`);
    }
  });
}

if (process.argv.includes('--tabela')) {
  console.log('| Par | Uso | Escuro | Claro | Mínimo |\n|---|---|---|---|---|');
  for (const [frente, fundo, minimo, uso] of PARES) {
    const f = (m) => contraste(m, frente, fundo).toFixed(1).replace('.', ',') + ':1';
    console.log(`| \`${frente}\` sobre \`${fundo}\` | ${uso} | ${f(ESCURO)} | ${f(CLARO)} | ${String(minimo).replace('.', ',')}:1 |`);
  }
}
