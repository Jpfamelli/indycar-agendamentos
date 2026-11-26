/* Rodada 15: polimento do dia a dia. Busca em Clientes, filtro lembrado, "Atualizar" que pede leitura fresca. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtrarClientes, semAcento } from '../js/painel-logica.js';
import { lerRota, aplicarFiltroLembrado, filtroParaLembrar } from '../js/rotas.js';
import { criarLeitor } from '../js/api.js';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');

const LISTA = [
  { nome: 'Aline C.', carro: 'Polo 2020', servico: 'Suspensão', origem: { rotulo: 'Meta', campanha: { nome: 'Troca de óleo R$ 169' } } },
  { nome: 'Márcio A.', carro: 'Compass 2021', servico: 'Bateria', origem: { rotulo: 'Google' } },
  { nome: 'Vanessa L.', carro: 'Corsa 2012', servico: 'Ar-condicionado', origem: { rotulo: 'Meta', campanha: { nome: 'Freios com garantia' } } },
  null,
];

test('busca em Clientes: sem acento, sem maiúscula, cada palavra em algum campo', () => {
  assert.equal(semAcento('  Troca  de ÓLEO '), 'troca de oleo');
  assert.deepEqual(filtrarClientes(LISTA, '').length, 4, 'vazio devolve tudo');
  assert.deepEqual(filtrarClientes(LISTA, 'marcio').map((c) => c.nome), ['Márcio A.']);
  assert.deepEqual(filtrarClientes(LISTA, 'polo suspensao').map((c) => c.nome), ['Aline C.'], 'carro e serviço juntos');
  assert.deepEqual(filtrarClientes(LISTA, 'OLEO').map((c) => c.nome), ['Aline C.'], 'acha pela campanha');
  assert.deepEqual(filtrarClientes(LISTA, 'google').map((c) => c.nome), ['Márcio A.'], 'acha pela origem');
  assert.deepEqual(filtrarClientes(LISTA, 'polo bateria'), [], 'todas as palavras precisam casar');
  assert.deepEqual(filtrarClientes(null, 'x'), []);
});

test('filtro lembrado: só vale quando o endereço não traz período nem fonte', () => {
  const vazia = lerRota('#/geral');
  assert.equal(aplicarFiltroLembrado(vazia, { periodo: '30d', fonte: '' }), vazia, 'o padrão não muda nada');
  assert.equal(aplicarFiltroLembrado(vazia, null), vazia);
  const nova = aplicarFiltroLembrado(vazia, { periodo: '7d', fonte: 'meta' });
  assert.deepEqual(nova.params, { periodo: '7d', fonte: 'meta' });
  assert.equal(nova.tela, 'geral');
  const comPeriodo = lerRota('#/clientes?periodo=60d');
  assert.equal(aplicarFiltroLembrado(comPeriodo, { periodo: '7d', fonte: 'meta' }), comPeriodo, 'o endereço manda');
  const comFiltroDeTela = lerRota('#/clientes?pendencia=sem_valor');
  assert.deepEqual(aplicarFiltroLembrado(comFiltroDeTela, { periodo: '7d' }).params, { pendencia: 'sem_valor', periodo: '7d' }, 'os outros filtros ficam');
  assert.equal(aplicarFiltroLembrado(vazia, { periodo: 'lixo', fonte: 'x' }), vazia, 'valor inventado vira o padrão');
  assert.deepEqual(filtroParaLembrar(lerRota('#/radar?periodo=7d&fonte=google')), { periodo: '7d', fonte: 'google' });
  assert.deepEqual(filtroParaLembrar(lerRota('#/radar')), { periodo: '30d', fonte: '' });
});

test('forçar a leitura pede ao servidor que releia (fresco=1), mas a memória guarda pelo endereço de sempre', async () => {
  const pedidos = [];
  const api = { ler: async (caminho) => { pedidos.push(caminho); return { n: pedidos.length }; } };
  const leitor = criarLeitor(api);
  await leitor.ler('api/hoje?periodo=7d');
  await leitor.ler('api/hoje?periodo=7d', { forcar: true });
  await leitor.ler('api/eu', { forcar: true });
  assert.deepEqual(pedidos, ['api/hoje?periodo=7d', 'api/hoje?periodo=7d&fresco=1', 'api/eu?fresco=1']);
  assert.deepEqual(leitor.espiar('api/hoje?periodo=7d').dados, { n: 2 }, 'a memória tem o dado novo, na chave sem fresco');
  assert.equal(leitor.espiar('api/hoje?periodo=7d&fresco=1'), null);
});

test('a casca lembra o filtro, mostra "atualizado há" e adianta Clientes; o service worker mudou de versão', () => {
  const app = ler('js/app.js');
  assert.match(app, /aplicarFiltroLembrado/);
  assert.match(app, /Clientes\.caminho/);
  assert.match(app, /saveData/, 'sem economia de dados a pré-carga fica desligada');
  assert.match(ler('js/telas/cabeca.js'), /cab-atualiza/);
  assert.match(ler('sw.js'), /indycar-trafego-r1[569]-[0-9]/);
});

test('Clientes: busca só aparece com 6 contatos ou mais e os atalhos de etapa só mostram etapa com gente', () => {
  const c = ler('js/telas/clientes.js');
  assert.match(c, /itens\.length >= 6/);
  assert.match(c, /grupos\.filter\(\(g\) => g\.itens\.length\)/);
});

test('Visão geral: volta pela memória sem esqueleto e não repinta quando o dado é o mesmo', () => {
  const g = ler('js/telas/geral.js');
  assert.match(g, /espiar/);
  assert.match(g, /igual/);
  assert.match(g, /animar: false/);
});
