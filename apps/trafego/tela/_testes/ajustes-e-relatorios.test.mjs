/* Lógica pura dos Ajustes e dos relatórios: metas digitadas, chaves da IA,
   meses, teclas do modo apresentação e o "por que está em branco". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { paraCampo, doCampo, contaDeCabeca, CAMPOS } from '../js/telas/gavetas/metas.js';
import { enderecoDoMcp, podeFazer, linhaDoClaudeCode, blocoDoCodex } from '../js/telas/gavetas/chaves.js';
import { rotuloDoMes, mesesParaEscolher, mesPassado, passoDaTecla, proximaSozinha, tempoDaTela, motivoDoVazio } from '../js/relatorios-logica.js';
import { GAVETAS } from '../js/telas/ajustes.js';

const PROIBIDO = [/—/, /\blead/i, /\bROAS\b/, /\bCPA\b/, /\bCTR\b/, /undefined/, /NaN/, /ve[ií]culo/i, /efetuar/i, /prezad/i];

test('metas: o jeito brasileiro de digitar vira número; em branco é "não sei"', () => {
  assert.deepEqual(doCampo('1.500', 'dinheiro'), { valor: 1500 });
  assert.deepEqual(doCampo('R$ 45,90', 'dinheiro'), { valor: 45.9 });
  assert.deepEqual(doCampo('  ', 'dinheiro'), { valor: null });
  assert.match(doCampo('abc', 'dinheiro').erro, /reais/);
  assert.deepEqual(doCampo('35%', 'porcento'), { valor: 35 });
  assert.deepEqual(doCampo('12,5', 'porcento'), { valor: 12.5 });
  assert.match(doCampo('120', 'porcento').erro, /0 a 100/);
  assert.equal(paraCampo(1500, 'dinheiro'), '1.500');
  assert.equal(paraCampo(45.9, 'dinheiro'), '45,90');
  assert.equal(paraCampo(null, 'dinheiro'), '');
  assert.equal(paraCampo(40, 'porcento'), '40');
});

test('metas: a conta de cabeça só aparece com o valor do serviço', () => {
  assert.equal(contaDeCabeca({ ticket_medio: null, margem_pct: 40 }), null);
  assert.match(contaDeCabeca({ ticket_medio: 800, margem_pct: 40 }), /deixa R\$\s320/);
  assert.match(contaDeCabeca({ ticket_medio: 800 }), /100% de margem/);
  for (const c of CAMPOS) for (const re of PROIBIDO) assert.doesNotMatch(c.rotulo + c.para, re, c.id);
});

test('chaves: endereço do MCP na mesma base do app, poderes em palavras e linhas sem a chave', () => {
  assert.equal(enderecoDoMcp({ origin: 'https://indycar-agendamentos.onrender.com', pathname: '/trafego/' }), 'https://indycar-agendamentos.onrender.com/trafego/mcp');
  assert.equal(enderecoDoMcp({ origin: 'http://localhost:3430', pathname: '/index.html' }), 'http://localhost:3430/mcp');
  assert.equal(podeFazer({ escopos: ['ler'], ver_pii: false }), 'Só lê os números.');
  assert.match(podeFazer({ escopos: ['ler', 'propor'], ver_pii: true }), /sugestões.*nome e conversa/);
  const linha = linhaDoClaudeCode('https://x/trafego/mcp');
  assert.match(linha, /^claude mcp add --transport http indycar-trafego https:\/\/x\/trafego\/mcp --header "Authorization: Bearer SUA_CHAVE"$/);
  const bloco = blocoDoCodex('https://x/trafego/mcp');
  assert.match(bloco, /\[mcp_servers\.indycar_trafego\]/);
  assert.match(bloco, /bearer_token_env_var = "INDYCAR_TRAFEGO_CHAVE"/);
  assert.doesNotMatch(linha + bloco, /ica_[A-Za-z0-9]{8,}/);
});

test('ajustes: seis gavetas, na ordem do recado, com textos do dono', () => {
  assert.deepEqual(GAVETAS.map((g) => g.id), ['conexoes', 'origem', 'metas', 'ia', 'relatorios', 'devolucao']);
  for (const g of GAVETAS) {
    assert.equal(typeof g.modulo.montar, 'function', g.id);
    for (const re of PROIBIDO) assert.doesNotMatch(g.titulo + g.sobre, re, g.id);
  }
});

test('relatórios: meses do atual para trás, mês passado e rótulos', () => {
  const hoje = new Date(2026, 10, 19);
  const meses = mesesParaEscolher(hoje, 3);
  assert.deepEqual(meses.map((m) => m.id), ['2026-11', '2026-10', '2026-09']);
  assert.equal(meses[0].rotulo, 'novembro de 2026 (até hoje)');
  assert.equal(meses[1].rotulo, 'outubro de 2026');
  assert.equal(mesPassado(new Date(2026, 0, 5)), '2025-12');
  assert.equal(rotuloDoMes('2026-03'), 'março de 2026');
  assert.equal(rotuloDoMes('2026-13'), '');
});

test('apresentação: teclas andam sem passar do fim; sozinha volta ao começo', () => {
  assert.equal(passoDaTecla('ArrowRight', 0, 6), 1);
  assert.equal(passoDaTecla(' ', 5, 6), 5);
  assert.equal(passoDaTecla('ArrowLeft', 0, 6), 0);
  assert.equal(passoDaTecla('End', 1, 6), 5);
  assert.equal(passoDaTecla('Home', 4, 6), 0);
  assert.equal(passoDaTecla('a', 2, 6), null);
  assert.equal(passoDaTecla('ArrowRight', 0, 0), null);
  assert.equal(proximaSozinha(5, 6), 0);
  assert.ok(tempoDaTela({ numeros: [1, 2, 3, 4] }) > tempoDaTela({ frase: {} }));
  assert.ok(tempoDaTela({ itens: new Array(50) }) <= 20000);
});

test('folha e apresentação: número em branco diz o porquê, nunca "R$ 0"', () => {
  assert.equal(motivoDoVazio({ valor: 10 }, {}), null);
  assert.equal(motivoDoVazio({ valor: null, apoio: 'Conta de anúncios não ligada' }, {}), 'Conta de anúncios não ligada');
  assert.equal(motivoDoVazio({ valor: null, formato: 'dinheiro' }, { gasto: 'sem_conta' }), 'Conta de anúncios não ligada');
  assert.equal(motivoDoVazio({ valor: null, formato: 'inteiro' }, {}), 'sem dado');
});
