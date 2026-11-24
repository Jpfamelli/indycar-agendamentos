// Rodada 14 · textos dos 4 avisos de outros apps e revisão do WhatsApp sozinha.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R7 from '../r7.js';
import { renderTemplate } from '../dados.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = (f) => fs.readFileSync(path.join(aqui, '..', f), 'utf8');

test('os 4 avisos têm texto de partida válido pelas regras da casa', () => {
  for (const campo of Object.keys(R7.TEXTOS_R7)) {
    const t = R7.TEXTOS_PADRAO_R7[campo];
    assert.ok(t, `falta o texto de ${campo}`);
    assert.equal(R7.validarTextoR7(campo, t), null, campo);
    assert.doesNotMatch(t, /R\$|desconto|gr[aá]tis|prezad/i);
  }
});

test('os textos vêm preenchidos sem sobrar chave nem variável vazia', () => {
  const ctx = { nome: 'Maria Souza', carro: 'HB20 2019', servico: 'troca de óleo', validade: '26/11', link_orcamento: 'https://x/o/1', link_os: 'https://x/a/1' };
  for (const t of Object.values(R7.TEXTOS_PADRAO_R7)) {
    const r = renderTemplate(t, ctx);
    assert.doesNotMatch(r, /[{}]/);
    assert.match(r, /^Oi Maria[!,]/);
  }
});

test('o servidor usa o texto de partida quando o banco não tem texto, e os avisos seguem desligados', () => {
  const d = ler('dados.js');
  assert.match(d, /r7\.TEXTOS_PADRAO_R7\[k\]/);
  assert.match(d, /k\.startsWith\('ativo_'\) \? !!c\[k\]/);   // ativo_* sem valor no banco = desligado
});

test('a tela olha o WhatsApp de novo a cada minuto enquanto ele está parado', () => {
  const h = ler('public/hoje.js');
  assert.match(h, /revisarDepois\(alvo, h\.estado, cfg\)/);
  assert.match(h, /setTimeout\([\s\S]{0,400}60000\)/);
  assert.match(h, /O WhatsApp voltou/);
});

test('erro técnico do WhatsApp parado vira frase simples na lista de mensagens', () => {
  const a = ler('public/app.js');
  assert.match(a, /function erroEmPortugues/);
  assert.match(a, /esc\(erroEmPortugues\(e\)\)/);
});

test('avisos de outros apps mostram a prévia da mensagem', () => {
  const r = ler('public/rodada7.js');
  assert.match(r, /data-r7previa=/);
  assert.match(r, /prever\(campo\)/);
});
