'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('R10-ATD-001: cartões de tarefa e do funil mantêm a borda lateral fina', () => {
  const css = readFileSync(join(__dirname, '../public/styles.css'), 'utf8');
  const tarefa = /\.tarefa\s*\{([^}]+)\}/.exec(css)?.[1];
  assert.ok(tarefa, 'estilo base da tarefa');
  assert.doesNotMatch(tarefa, /border-left\s*:\s*[2-9]\d*px/);
  assert.doesNotMatch(css, /\.funil-cartao\.atrasado\s*\{[^}]*border-left\s*:\s*[2-9]\d*px/);
});
