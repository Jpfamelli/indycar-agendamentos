// Rodada 16 · texto do segmento sem "N" cru e pílulas de limpeza na tela Clientes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = (f) => fs.readFileSync(path.join(aqui, '..', f), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(ler('public/rodada16.js'), ctx);
const R = ctx.window.R16;

test('segmento: o valor entra no lugar do N; sem N vai entre parênteses; sem valor fica como está', () => {
  assert.equal(R.textoSegmento('Sem voltar há mais de N meses', 6), 'Sem voltar há mais de 6 meses');
  assert.equal(R.textoSegmento('Leads em "orçamento" no CRM há mais de N dias', '7'), 'Leads em "orçamento" no CRM há mais de 7 dias');
  assert.equal(R.textoSegmento('Todos os clientes com telefone', null), 'Todos os clientes com telefone');
  assert.equal(R.textoSegmento('Aniversariantes do mês', 3), 'Aniversariantes do mês (3)');
  assert.equal(R.textoSegmento('Nome Novo', ''), 'Nome Novo');
  assert.equal(R.textoSegmento(undefined, undefined), '');
  assert.equal(R.textoSegmento('Banco de dados', 5), 'Banco de dados (5)');   // "N" só vale como palavra solta
});

const base = [
  { id: 1, nome: 'A', telefone: '(12) 99999-0001', nascimento: '1990-01-01', aceita_mensagens: true },
  { id: 2, nome: 'B', telefone: '', nascimento: null },
  { id: 3, nome: 'C', telefone: '12999990003', aceita_mensagens: false, nascimento: '1904-05-05' },
  { id: 4, nome: 'D', telefone: '—', nascimento: null, aceita_mensagens: false },
];

test('pílulas de Clientes: fora da lista, sem telefone, sem aniversário e contagem', () => {
  assert.deepEqual(Array.from(R.filtrarClientes(base, 'fora'), (c) => c.id), [3, 4]);
  assert.deepEqual(Array.from(R.filtrarClientes(base, 'sem_telefone'), (c) => c.id), [2, 4]);
  assert.deepEqual(Array.from(R.filtrarClientes(base, 'sem_aniversario'), (c) => c.id), [2, 4]);
  assert.equal(R.filtrarClientes(base, 'todos').length, 4);
  assert.equal(R.filtrarClientes(base, 'qualquer').length, 4);
  assert.deepEqual({ ...R.contarClientes(base) }, { todos: 4, fora: 2, sem_telefone: 2, sem_aniversario: 2 });
  assert.equal(R.filtrarClientes(null, 'fora').length, 0);
});

test('a tela usa o módulo, a versão sobe e o service worker guarda o arquivo novo', () => {
  const a = ler('public/app.js');
  assert.match(a, /window\.R16\.contarClientes\(clientes\)/);
  assert.match(a, /data-cli-filtro/);
  assert.match(a, /R16\.semTelefone\(c\)/);
  assert.equal((a.match(/R16\.textoSegmento/g) || []).length, 4);
  assert.doesNotMatch(a, /\? ` \(\$\{c\.valor\}\)` : ''/);
  assert.match(ler('public/index.html'), /<script src="rodada16\.js\?v=7\.5\.0"><\/script>/);
  assert.match(ler('public/sw.js'), /VERSAO = '7\.5\.0'/);
  assert.match(ler('public/sw.js'), /'rodada16\.js'/);
  assert.match(ler('public/styles.css'), /#cliPilulas/);
});
