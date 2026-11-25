/* Rodada 14: a tela funciona COM e SEM conta de anúncios ligada. Sem conta: nada de "sem dado" em
   gasto/custo/retorno, um cartão só com o passo para ligar, e a frase repetida "Ligue a conta..." some das campanhas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semContaDe, semPedidoDeConta } from '../js/painel-logica.js';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');

test('sem conta: o servidor diz em estado.gasto (sem_conta ou sem_dados); com conta ou demonstração, não', () => {
  assert.equal(semContaDe({ gasto: 'sem_conta' }), true);
  assert.equal(semContaDe({ gasto: 'sem_dados' }), true);
  assert.equal(semContaDe({ gasto: 'real' }), false);
  assert.equal(semContaDe({ gasto: 'demo' }), false);
  assert.equal(semContaDe(null), false);
  assert.equal(semContaDe(undefined), false);
});

test('a frase "Ligue a conta de anúncios para ver o custo." sai da leitura da campanha e o resto fica', () => {
  assert.equal(semPedidoDeConta('11 contatos chegaram por esta campanha. Ligue a conta de anúncios para ver o custo.'), '11 contatos chegaram por esta campanha.');
  assert.equal(semPedidoDeConta('6 contatos chegaram. Ligue a conta de anúncios para ver o custo. Falta o valor de 2 serviços.'), '6 contatos chegaram. Falta o valor de 2 serviços.');
  assert.equal(semPedidoDeConta('Ligue a conta de anúncios para ver o custo.'), '');
  assert.equal(semPedidoDeConta(null), '');
  assert.equal(semPedidoDeConta('Gastou R$ 40 e trouxe 3 conversas.'), 'Gastou R$ 40 e trouxe 3 conversas.');
});

test('as telas usam a regra: Visão geral, Campanhas e Relatórios escondem o que depende de gasto; o cartão de ligar existe', () => {
  const geral = ler('js/telas/geral.js'), camp = ler('js/telas/campanhas.js'), rel = ler('js/telas/relatorios.js'), pecas = ler('js/pecas.js');
  for (const [nome, fonte] of [['geral', geral], ['campanhas', camp], ['relatorios', rel]]) assert.match(fonte, /semContaDe/, nome);
  assert.match(geral, /ligarConta\(ctx\)/);
  assert.match(camp, /ligarConta\(ctx, \{ compacto: true \}\)/);
  assert.match(pecas, /export function ligarConta/);
  assert.match(pecas, /Ligar a conta de anúncios/);
  assert.match(pecas, /href: ctx\.hrefDaTela\('ajustes'\)/);
  // quem não é administrador não recebe botão para Ajustes
  assert.match(pecas, /const botao = admin \?/);
});

test('sem nenhuma conversa de anúncio a tela explica o que conferir em vez de uma pilha de zeros', () => {
  const geral = ler('js/telas/geral.js');
  assert.match(geral, /Nenhuma conversa de anúncio neste período/);
  assert.match(geral, /hrefDaTela\('radar'\)/);
});

test('css do cartão de ligar existe e o service worker mudou de versão', () => {
  assert.match(ler('css/painel.css'), /\.ligar-passos/);
  assert.match(ler('sw.js'), /indycar-trafego-r1[56]-1/);
});
