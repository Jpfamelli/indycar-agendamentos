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
