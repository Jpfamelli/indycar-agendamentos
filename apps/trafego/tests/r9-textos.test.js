'use strict';
/* Rodada 9: o que o servidor manda a tela dizer aponta para menus que existem e segue as regras de texto. */
const test = require('node:test');
const assert = require('node:assert/strict');
const whatsapp = require('../whatsapp');
const C = require('../motor/conexoes-estado');

test('frases do canal de WhatsApp: "Atendimento › Integrações" (o menu de verdade) e sem travessão', () => {
  const frases = Object.values(whatsapp.PROBLEMAS_CANAL);
  assert.ok(frases.length >= 5);
  for (const f of frases) {
    assert.doesNotMatch(f, /Configurações/, f);
    assert.doesNotMatch(f, /—/, f);
  }
  assert.match(whatsapp.PROBLEMAS_CANAL['codewords-chave-recusada'], /Atendimento › Integrações/);
});

test('passo a passo das conexões: diz o que se faz de verdade na tela (colar token, arquivo JSON, Metas)', () => {
  const passos = C.passosDeConexao({}, { orcamento: 0 });
  const como = Object.fromEntries(passos.map((p) => [p.titulo, p.como]));
  assert.match(como['WhatsApp da oficina ligado'], /Integrações \(no grupo Sistema\)/);
  assert.doesNotMatch(como['WhatsApp da oficina ligado'], /Configurações/);
  assert.match(como['Conta de anúncios da Meta ligada'], /token/);
  assert.doesNotMatch(como['Conta de anúncios da Meta ligada'], /entre com a conta/, 'não há "entrar com a conta da Meta": cola-se o token');
  assert.match(como['Conta do Google Ads ligada'], /arquivo JSON da conta de serviço/);
  // Rodada 11: a seção dos Ajustes se chama "Metas"; a ajuda "Como pegar o token" saiu da tela.
  assert.match(como['Orçamento do mês definido'], /Ajustes › Metas/);
  for (const p of passos) assert.doesNotMatch(p.como, /Metas e verba|Como pegar/);
  for (const p of passos) assert.doesNotMatch(p.como, /—/);
});
