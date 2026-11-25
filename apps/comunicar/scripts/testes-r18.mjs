// Rodada 18 · com o WhatsApp parado, réguas e campanhas aparecem RETIDAS (nada sai), com quantas esperam na fila.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { instalarBancoFalso } from './banco-falso.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = (f) => fs.readFileSync(path.join(aqui, '..', f), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(ler('public/rodada18.js'), ctx);
const R = ctx.window.R18;

test('retida só com o WhatsApp parado ou o envio em pausa', () => {
  assert.equal(R.retida('parado'), true);
  assert.equal(R.retida('pausa'), true);
  for (const e of ['ok', 'atencao', 'desconhecido', null, undefined]) assert.equal(R.retida(e), false);
});

test('régua: ligada e parada diz "Retida · N na fila" e que sai sozinha; desligada ou no ar não muda nada', () => {
  assert.deepEqual({ ...R.textoRegua({ ativo: true, estado: 'parado', naFila: 3 }) },
    { selo: 'Retida · 3 na fila', texto: 'Saem sozinhas quando a chave do WhatsApp for colada.' });
  assert.deepEqual({ ...R.textoRegua({ ativo: true, estado: 'parado', naFila: 1 }) },
    { selo: 'Retida · 1 na fila', texto: 'Sai sozinha quando a chave do WhatsApp for colada.' });
  assert.deepEqual({ ...R.textoRegua({ ativo: true, estado: 'parado', naFila: 0 }) },
    { selo: 'Retida', texto: 'Nada sai até a chave do WhatsApp ser colada.' });
  assert.match(R.textoRegua({ ativo: true, estado: 'pausa', naFila: 2 }).texto, /pausa for tirada em Ajustes/);
  assert.equal(R.textoRegua({ ativo: false, estado: 'parado', naFila: 5 }), null);
  assert.equal(R.textoRegua({ ativo: true, estado: 'ok', naFila: 5 }), null);
  assert.equal(R.textoRegua({ ativo: true, estado: 'desconhecido', naFila: 5 }), null);
  assert.equal(R.textoRegua({ ativo: true, estado: 'parado', naFila: 'x' }).selo, 'Retida');   // número estranho vira zero
});

test('campanhas: "N na fila" vira "N retidas"; aviso único só quando parado', () => {
  assert.equal(R.rotuloFila(3, 'ok'), '3 na fila');
  assert.equal(R.rotuloFila(3, 'parado'), '3 retidas');
  assert.equal(R.rotuloFila(1, 'parado'), '1 retida');
  assert.equal(R.rotuloFila(0, 'parado'), '');
  assert.equal(R.avisoCampanhas(5, 'ok'), null);
  assert.equal(R.avisoCampanhas(5, 'parado'),
    'O WhatsApp da oficina está parado: 5 mensagens de campanha estão retidas na fila, nenhuma saiu. Voltam sozinhas quando a chave do WhatsApp for colada.');
  assert.match(R.avisoCampanhas(1, 'parado'), /1 mensagem de campanha está retida/);
  assert.match(R.avisoCampanhas(0, 'parado'), /fica retida\. Nada é enviado/);
  assert.match(R.avisoCampanhas(2, 'pausa'), /^O envio está em pausa: .*pausa for tirada em Ajustes/);
});

test('aprovar e pôr na fila: com o WhatsApp parado o aviso não finge que saiu', () => {
  assert.equal(R.textoAprovar(10, 'ok'), 'Aprovar para 10 clientes? As mensagens entram na fila agora (quem pediu para parar fica fora).');
  assert.match(R.textoAprovar(10, 'parado'), /^Aprovar para 10 clientes\? .*ficam RETIDAS: o WhatsApp da oficina está parado\. Nada sai agora/);
  assert.match(R.textoAprovar(1, 'parado'), /^Aprovar para 1 cliente\?/);
  assert.equal(R.textoNaFila(4, 'ok'), '4 mensagens na fila');
  assert.equal(R.textoNaFila(4, 'parado'), '4 mensagens na fila, retidas até o WhatsApp voltar (nada foi enviado)');
  assert.equal(R.pilulaPendente('parado'), 'Retida');
  assert.equal(R.pilulaPendente('ok'), 'Na fila');
});

test('a página carrega rodada18.js (index e service worker na versão nova) e a "Próxima saída" respeita a retida', () => {
  assert.match(ler('public/index.html'), /<script src="rodada18\.js\?v=7\.6\.0"><\/script>/);
  const sw = ler('public/sw.js');
  assert.match(sw, /VERSAO = '7\.6\.0'/);
  assert.match(sw, /'rodada18\.js'/);
  assert.match(ler('public/rodada4.js'), /el\.dataset\.retida\) continue/);
  assert.match(ler('public/hoje.js'), /R18\?\.pintarReguas\(alvo\.parentNode, h\.estado, resumo\?\.filaPorTipo\)/);
  assert.match(ler('public/styles.css'), /\[hidden\]\{display:none!important\}/);
});

test('servidor: o resumo conta a fila por tipo (só pendentes), sem gravar nada', async () => {
  const tabelas = {
    posvenda_config: [{ id: true, hora_envio: '09:30', ativo_lembrete: true }],
    posvenda_envios: [
      { id: 'a', tipo: 'lembrete', status: 'pendente', created_at: new Date().toISOString(), enviar_em: new Date().toISOString() },
      { id: 'b', tipo: 'lembrete', status: 'pendente', created_at: new Date().toISOString(), enviar_em: new Date().toISOString() },
      { id: 'c', tipo: 'campanha', status: 'pendente', created_at: new Date().toISOString(), enviar_em: new Date().toISOString() },
      { id: 'd', tipo: 'posvenda', status: 'enviado', created_at: new Date().toISOString(), enviado_em: new Date().toISOString() },
      { id: 'e', tipo: 'posvenda', status: 'falhou', created_at: new Date().toISOString() },
    ],
  };
  instalarBancoFalso(tabelas);
  const real = await import('../dados.js');
  assert.deepEqual(real.contarPorTipo([{ tipo: 'a' }, { tipo: 'a' }, { tipo: 'b' }, {}, null]), { a: 2, b: 1 });
  assert.deepEqual(real.contarPorTipo(), {});
  const antes = JSON.stringify(tabelas.posvenda_envios);
  const r = await real.resumo();
  assert.deepEqual(r.filaPorTipo, { lembrete: 2, campanha: 1 });
  assert.equal(r.pendentes, 3);
  assert.equal(JSON.stringify(tabelas.posvenda_envios), antes);
});
