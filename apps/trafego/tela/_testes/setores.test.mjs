/* Lógica pura da tela: mini-setores e situação de um contato (js/setores.js). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { miniSetores, situacao, descricaoDosSetores, indiceAtual, ETAPAS, pendencia } from '../js/setores.js';

const em = '2026-11-12T09:41:00-03:00';
const estados = (item) => miniSetores(item).map((s) => s.estado);

test('sempre sete setores, na ordem do contrato', () => {
  assert.deepEqual(ETAPAS.map((e) => e.id), ['contato', 'respondido', 'orcamento', 'agendou', 'veio', 'oficina', 'fechou']);
  assert.equal(miniSetores({}).length, 7);
  assert.equal(miniSetores(null).length, 7);
});

test('contato em aberto: passou, está aqui e ainda não', () => {
  const item = { etapa_atual: 'agendou', etapas: [{ id: 'contato', em }, { id: 'respondido', em }, { id: 'orcamento', em }, { id: 'agendou', em }], desfecho: { tipo: 'aberto' } };
  assert.deepEqual(estados(item), ['feito', 'feito', 'feito', 'atual', 'vazio', 'vazio', 'vazio']);
  assert.equal(miniSetores(item)[3].tom, 'espera');
});

test('etapa sem registro antes da atual vira "pulou", não "feito"', () => {
  const item = { etapa_atual: 'veio', etapas: [{ id: 'contato', em }, { id: 'agendou', em }, { id: 'veio', em }], desfecho: { tipo: 'aberto' } };
  assert.deepEqual(estados(item), ['feito', 'pulou', 'pulou', 'feito', 'atual', 'vazio', 'vazio']);
  assert.match(descricaoDosSetores(item), /Sem registro de: Respondido, Orçamento\./);
});

test('fechou acende até o fim; não fechou para onde parou', () => {
  const fechou = { etapa_atual: 'fechou', etapas: ETAPAS.map((e) => ({ id: e.id, em })), desfecho: { tipo: 'fechou', valor: 750 } };
  assert.deepEqual(estados(fechou), ['feito', 'feito', 'feito', 'feito', 'feito', 'feito', 'fechou']);
  const parou = { etapa_atual: 'orcamento', etapas: [{ id: 'contato', em }, { id: 'respondido', em }, { id: 'orcamento', em }], desfecho: { tipo: 'nao_fechou', motivo: 'caro' } };
  assert.deepEqual(estados(parou), ['feito', 'feito', 'parou', 'vazio', 'vazio', 'vazio', 'vazio']);
  assert.equal(miniSetores(parou)[2].tom, 'fora');
});

test('esperando resposta pinta o setor atual em atenção', () => {
  const item = { etapa_atual: 'contato', etapas: [{ id: 'contato', em }], desfecho: { tipo: 'aberto' }, pendencias: ['sem_resposta'], espera_min: 95 };
  assert.equal(miniSetores(item)[0].tom, 'atencao');
  const s = situacao(item);
  assert.equal(s.texto, 'Esperando resposta');
  assert.equal(s.detalhe, 'há 1 h 35 min');
  assert.equal(s.pede, 'resposta');
});

test('etapa atual desconhecida: usa a mais avançada da lista', () => {
  assert.equal(indiceAtual({ etapas: [{ id: 'contato' }, { id: 'veio' }] }), 4);
  assert.equal(indiceAtual({ etapa_atual: 'xyz', etapas: [] }), 0);
});

test('situação em palavras', () => {
  assert.deepEqual(situacao({ desfecho: { tipo: 'fechou', valor: null } }), { tipo: 'fechou', texto: 'Fechou', detalhe: 'falta lançar o valor', tom: 'bom', pede: 'valor' });
  assert.equal(situacao({ desfecho: { tipo: 'fechou', valor: 750 } }).pede, null);
  assert.equal(situacao({ desfecho: { tipo: 'nao_fechou', motivo: 'caro' } }).detalhe, 'Achou caro');
  assert.equal(situacao({ desfecho: { tipo: 'nao_fechou', motivo: null } }).pede, 'motivo');
  assert.equal(situacao({ etapa_atual: 'orcamento', desfecho: { tipo: 'aberto', parado_dias: 3 } }).detalhe, 'parado há 3 dias');
  assert.equal(situacao({ etapa_atual: 'orcamento', desfecho: { tipo: 'aberto', parado_dias: 3 } }).texto, 'Orçamento');
});

test('descrição para leitor de tela', () => {
  const item = { etapa_atual: 'agendou', etapas: [{ id: 'contato', em }, { id: 'respondido', em }, { id: 'orcamento', em }, { id: 'agendou', em }], desfecho: { tipo: 'aberto', parado_dias: 2 } };
  assert.equal(descricaoDosSetores(item), 'Etapa 4 de 7: Agendou. Em aberto, parado há 2 dias.');
  assert.equal(descricaoDosSetores({ etapas: ETAPAS.map((e) => ({ id: e.id, em })), desfecho: { tipo: 'fechou', valor: 1 } }), 'Etapa 7 de 7: Fechou.');
});

test('pendências: as três do mutirão abrem em fila; "sem resposta" abre a lista', () => {
  assert.equal(pendencia('sem_valor').fila, true);
  assert.equal(pendencia('sem_motivo').fila, true);
  assert.equal(pendencia('sem_origem').fila, true);
  assert.equal(pendencia('sem_resposta').fila, false);
  assert.equal(pendencia('outra'), null);
});
