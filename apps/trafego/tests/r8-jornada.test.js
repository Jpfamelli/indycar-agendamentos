'use strict';
/* Rodada 8 (T2b) — a jornada de cada contato: etapas, desfecho, valor, pendências, totais e funil.
   Parte pura (montagem do item do contrato da API, §5.3) e parte com banco de mentira (consultas em lote, memória). */
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../jornada');
const O = require('../origem');
const { criarBanco } = require('./apoio/banco-falso');

const AGORA = Date.parse('2026-11-19T15:00:00-03:00');
const em = (dia, hora = '10:00') => `2026-11-${String(dia).padStart(2, '0')}T${hora}:00-03:00`;
const utc = iso => new Date(Date.parse(iso)).toISOString();   // como o banco devolve

const lead = (id, extra = {}) => ({
  id, cliente_id: `cli-${id}`, responsavel_id: null, nome: 'João da Silva', telefone: '12991230272', telefone_e164: '+5512991230272',
  origem: 'whatsapp', status: 'novo', valor_pago: null, valor_orcado: null, servico: 'Troca de óleo', carro_modelo: 'Onix 2019', placa: 'abc-1d23',
  utm_source: null, utm_medium: null, utm_campaign: null, created_at: utc(em(12, '09:41')), closed_at: null, updated_at: utc(em(12, '09:41')),
  ultimo_contato_em: null, ...extra,
});
const etapa = (item, id) => item.etapas.find(e => e.id === id) || null;
const ids = item => item.etapas.map(e => e.id);

/* ---------------- textos curtos ---------------- */

test('nome curto e final do telefone: a lista nunca leva o nome inteiro nem o número inteiro', () => {
  assert.equal(J.nomeCurto('João da Silva'), 'João S.');
  assert.equal(J.nomeCurto('  maria  '), 'maria');
  assert.equal(J.nomeCurto('Ana Paula de Souza Lima'), 'Ana L.');
  assert.equal(J.nomeCurto(''), null);
  assert.equal(J.nomeCurto(null), null);
  assert.equal(J.nomeCurto('Zé\n<script>'), 'Zé');
  assert.equal(J.telefoneFinal('+55 (12) 99123-0272'), '0272');
  assert.equal(J.telefoneFinal('12'), null);
  assert.equal(J.telefoneFinal(null), null);
});

test('datas saem em ISO com o fuso de Brasília', () => {
  assert.equal(J.isoBR('2026-11-12T12:41:00.123456+00:00'), '2026-11-12T09:41:00-03:00');
  assert.equal(J.isoBR('2026-11-13T01:10:00Z'), '2026-11-12T22:10:00-03:00');
  assert.equal(J.isoBR(null), null);
  assert.equal(J.isoBR('ontem'), null);
});

/* ---------------- o item ---------------- */

test('contato que fechou pelo caminho inteiro: sete etapas com data, valor pelo Pátio e nenhuma pendência', () => {
  const l = lead('l1', { status: 'concluido', origem: 'meta', origem_paga: true, origem_plataforma: 'meta', origem_como: 'ref',
    campanha_ext: '1202', campanha_nome: 'Troca de óleo R$ 169', closed_at: utc(em(14, '17:00')), valor_pago: 600 });
  const orc = { id: 'o1', numero: 31, lead_id: 'l1', status: 'aprovado', total: 890, total_aprovado: 850, enviado_em: utc(em(12, '10:05')), created_at: utc(em(12, '10:00')) };
  const item = J.montarItem(l, {
    agora: AGORA, responsavel: 'Carlos Pereira', clienteDesde: utc(em(12, '09:41')),
    pm: { lead_id: 'l1', primeira_entrada_em: utc(em(12, '09:41')), primeira_saida_em: utc(em(12, '09:53')), entradas: 4, saidas: 5 },
    lig: { orcamentos: [orc], os: [{ id: 'os1', numero: 12, lead_id: 'l1', orcamento_id: 'o1', etapa: 'entregue', created_at: utc(em(14, '08:10')), entregue_em: utc(em(14, '16:50')) }],
      extras: { aprovado: 100, pendente: 0, recusado: 0, qtd_aprovado: 1 } },
    ags: [{ id: 'a1', lead_id: 'l1', data: '2026-11-14', hora: '08:00:00', inicio_em: utc(em(14, '08:00')), status: 'concluido', valor: 700, created_at: utc(em(12, '10:30')) }],
  });
  assert.deepEqual(item, {
    lead_id: 'l1', nome: 'João S.', telefone_final: '0272', carro: 'Onix 2019', servico: 'Troca de óleo',
    chegou_em: em(12, '09:41'), cliente_novo: true, origem: O.origemDoContato(l),
    etapas: [
      { id: 'contato', em: em(12, '09:41') },
      { id: 'respondido', em: em(12, '09:53'), minutos: 12 },
      { id: 'orcamento', em: em(12, '10:05'), valor: 850, numero: 31 },
      { id: 'agendou', em: em(12, '10:30'), para: em(14, '08:00') },
      { id: 'veio', em: em(14, '08:00') },
      { id: 'oficina', em: em(14, '08:10'), os: 12 },
      { id: 'fechou', em: em(14, '17:00') },
    ],
    etapa_atual: 'fechou',
    desfecho: { tipo: 'fechou', valor: 950, valor_fonte: 'patio', motivo: null, motivo_rotulo: null, obs: null, em: em(14, '17:00'), parado_dias: null },
    responsavel: 'Carlos', pendencias: [], espera_min: null,
  });
  assert.equal(item.origem.paga, true);
});

test('fonte do valor: Pátio (OS entregue) > orçamento aprovado > agendamento concluído > lançado à mão', () => {
  const base = { status: 'concluido', closed_at: utc(em(15)) };
  const orcAprovado = { id: 'o1', numero: 7, lead_id: 'l1', status: 'aprovado', total: 500, created_at: utc(em(12)) };
  const agConcluido = { id: 'a1', lead_id: 'l1', data: '2026-11-14', hora: '08:00', status: 'concluido', valor: 320, created_at: utc(em(12)) };
  const semOS = { orcamentos: [orcAprovado], os: [], extras: { aprovado: 0, pendente: 0, recusado: 0, qtd_aprovado: 0 } };
  const d = (l, ctx) => J.montarItem(l, { agora: AGORA, ...ctx }).desfecho;

  assert.deepEqual([d(lead('l1', { ...base, valor_pago: 600 }), { lig: semOS, ags: [agConcluido] }).valor, d(lead('l1', { ...base, valor_pago: 600 }), { lig: semOS, ags: [agConcluido] }).valor_fonte], [500, 'orcamento']);
  const soAgenda = d(lead('l1', { ...base, valor_pago: 600 }), { ags: [agConcluido] });
  assert.deepEqual([soAgenda.valor, soAgenda.valor_fonte], [320, 'agenda']);
  const soManual = d(lead('l1', { ...base, valor_pago: '600.50' }), { ags: [{ ...agConcluido, valor: null }] });
  assert.deepEqual([soManual.valor, soManual.valor_fonte], [600.5, 'manual']);
  // OS entregue sem orçamento aprovado: vale o total que o Pátio guardou, mais os extras aprovados.
  const patio = d(lead('l1', base), { lig: { orcamentos: [], os: [{ id: 'os1', numero: 3, etapa: 'entregue', orcamento_total: 410, created_at: utc(em(14)) }], extras: { aprovado: 90, pendente: 30, recusado: 0, qtd_aprovado: 1 } } });
  assert.deepEqual([patio.valor, patio.valor_fonte], [500, 'patio']);
  // OS que ainda não foi entregue não é fonte de valor.
  const naoEntregue = d(lead('l1', { ...base, valor_pago: 150 }), { lig: { orcamentos: [], os: [{ id: 'os1', numero: 3, etapa: 'pronto', orcamento_total: 410, created_at: utc(em(14)) }], extras: { aprovado: 0, pendente: 0, recusado: 0, qtd_aprovado: 0 } } });
  assert.deepEqual([naoEntregue.valor, naoEntregue.valor_fonte], [150, 'manual']);
});

test('fechou sem valor em fonte nenhuma: valor nulo (nunca zero) e pendência sem_valor', () => {
  const item = J.montarItem(lead('l1', { status: 'concluido', closed_at: utc(em(15)), valor_pago: 0 }), { agora: AGORA });
  assert.equal(item.desfecho.valor, null);
  assert.equal(item.desfecho.valor_fonte, null);
  assert.ok(item.pendencias.includes('sem_valor'));
  // CRM diz que fechou: o carro veio e esteve na oficina, mesmo sem agendamento nem OS (datas desconhecidas).
  assert.deepEqual(ids(item), ['contato', 'respondido', 'veio', 'oficina', 'fechou']);
  assert.deepEqual(etapa(item, 'veio'), { id: 'veio', em: null });
  assert.deepEqual(etapa(item, 'oficina'), { id: 'oficina', em: null, os: null });
  assert.deepEqual(etapa(item, 'respondido'), { id: 'respondido', em: null, minutos: null });
});

test('não fechou: com motivo vem o rótulo de tela; sem motivo vira pendência sem_motivo', () => {
  const com = J.montarItem(lead('l1', { status: 'perdido', closed_at: utc(em(16)), motivo_perda: 'caro', motivo_perda_obs: ' achou a mão de obra cara ' }), { agora: AGORA });
  assert.deepEqual(com.desfecho, { tipo: 'nao_fechou', valor: null, valor_fonte: null, motivo: 'caro', motivo_rotulo: 'Achou caro', obs: 'achou a mão de obra cara', em: em(16), parado_dias: null });
  assert.deepEqual(com.pendencias.filter(p => p === 'sem_motivo'), []);
  const sem = J.montarItem(lead('l2', { status: 'perdido', closed_at: utc(em(16)) }), { agora: AGORA });
  assert.equal(sem.desfecho.motivo, null);
  assert.ok(sem.pendencias.includes('sem_motivo'));
  // motivo que não está na lista do contrato não vira rótulo inventado
  const estranho = J.montarItem(lead('l3', { status: 'perdido', motivo_perda: 'xyz' }), { agora: AGORA });
  assert.equal(estranho.desfecho.motivo, null);
  assert.ok(estranho.pendencias.includes('sem_motivo'));
});

test('em aberto: parado_dias conta do último acontecimento; com horário marcado para a frente não está parado', () => {
  const parado = J.montarItem(lead('l1', { status: 'contato', created_at: utc(em(12, '09:41')) }), { agora: AGORA });
  assert.equal(parado.desfecho.tipo, 'aberto');
  assert.equal(parado.desfecho.parado_dias, 7);
  const comOrc = J.montarItem(lead('l2', { status: 'orcamento', created_at: utc(em(10)) }), { agora: AGORA,
    lig: { orcamentos: [{ id: 'o1', numero: 2, status: 'enviado', total: 300, enviado_em: utc(em(17, '15:00')), created_at: utc(em(17, '14:00')) }], os: [], extras: {} } });
  assert.equal(comOrc.desfecho.parado_dias, 2);
  const marcado = J.montarItem(lead('l3', { status: 'agendado', created_at: utc(em(10)) }), { agora: AGORA,
    ags: [{ id: 'a1', lead_id: 'l3', data: '2026-11-21', hora: '09:00', status: 'confirmado', valor: null, created_at: utc(em(10, '11:00')) }] });
  assert.equal(marcado.desfecho.parado_dias, 0);
  assert.deepEqual(etapa(marcado, 'agendou'), { id: 'agendou', em: em(10, '11:00'), para: '2026-11-21T09:00:00-03:00' });
  assert.equal(marcado.etapa_atual, 'agendou');
});

test('orçamento: só conta com orçamento de verdade (Orçador) ou valor orçado; a coluna "Orçamento" do CRM sozinha não acende', () => {
  const soStatus = J.montarItem(lead('l1', { status: 'orcamento' }), { agora: AGORA });
  assert.equal(etapa(soStatus, 'orcamento'), null);
  const valorNoCrm = J.montarItem(lead('l2', { status: 'orcamento', valor_orcado: '480.00' }), { agora: AGORA });
  assert.deepEqual(etapa(valorNoCrm, 'orcamento'), { id: 'orcamento', em: null, valor: 480, numero: null });
  const enviado = J.montarItem(lead('l3', { status: 'contato' }), { agora: AGORA,
    lig: { orcamentos: [{ id: 'o1', numero: 9, status: 'enviado', total: 1234.5, enviado_em: utc(em(13)), created_at: utc(em(12, '18:00')) }], os: [], extras: {} } });
  assert.deepEqual(etapa(enviado, 'orcamento'), { id: 'orcamento', em: em(13), valor: 1234.5, numero: 9 });
});

test('veio e oficina: agendamento em que o cliente apareceu, OS do Pátio (cancelada não conta) ou o CRM dizendo que está em serviço', () => {
  const apareceu = J.montarItem(lead('l1', { status: 'agendado' }), { agora: AGORA,
    ags: [{ id: 'a1', lead_id: 'l1', data: '2026-11-13', hora: '14:00', status: 'nao_fechou', created_at: utc(em(12, '11:00')) }] });
  assert.deepEqual(etapa(apareceu, 'veio'), { id: 'veio', em: em(13, '14:00') });
  assert.equal(etapa(apareceu, 'oficina'), null, 'veio, ouviu o preço e foi embora: não é carro na oficina');
  const faltou = J.montarItem(lead('l2', { status: 'agendado' }), { agora: AGORA,
    ags: [{ id: 'a1', lead_id: 'l2', data: '2026-11-13', hora: '14:00', status: 'nao_veio', created_at: utc(em(12, '11:00')) }] });
  assert.equal(etapa(faltou, 'veio'), null);
  assert.equal(faltou.etapa_atual, 'agendou');
  const cancelado = J.montarItem(lead('l3', { status: 'contato' }), { agora: AGORA,
    ags: [{ id: 'a1', lead_id: 'l3', data: '2026-11-13', hora: '14:00', status: 'cancelado', created_at: utc(em(12, '11:00')) }] });
  assert.equal(etapa(cancelado, 'agendou'), null);
  const comOS = J.montarItem(lead('l4', { status: 'em_servico' }), { agora: AGORA,
    lig: { orcamentos: [], os: [{ id: 'x', numero: 1, etapa: 'cancelado', created_at: utc(em(12)) }, { id: 'y', numero: 2, etapa: 'em_execucao', created_at: utc(em(13, '08:30')) }], extras: {} } });
  assert.deepEqual(etapa(comOS, 'oficina'), { id: 'oficina', em: em(13, '08:30'), os: 2 });
  assert.deepEqual(etapa(comOS, 'veio'), { id: 'veio', em: em(13, '08:30') });
});

/* ---------------- resposta da oficina ---------------- */

test('cliente escreveu e ninguém respondeu: pendência sem_resposta só depois de 30 min e só com o contato aberto', () => {
  const pm = (min) => ({ primeira_entrada_em: new Date(AGORA - min * 60000).toISOString(), primeira_saida_em: null, entradas: 1, saidas: 0 });
  const esperando = J.montarItem(lead('l1'), { agora: AGORA, pm: pm(47) });
  assert.equal(etapa(esperando, 'respondido'), null);
  assert.ok(esperando.pendencias.includes('sem_resposta'));
  assert.equal(esperando.espera_min, 47);
  const recente = J.montarItem(lead('l2'), { agora: AGORA, pm: pm(12) });
  assert.deepEqual(recente.pendencias.filter(p => p === 'sem_resposta'), []);
  assert.equal(recente.espera_min, 12);
  const perdido = J.montarItem(lead('l3', { status: 'perdido', motivo_perda: 'sem_retorno' }), { agora: AGORA, pm: pm(500) });
  assert.deepEqual(perdido.pendencias, ['sem_origem']);
  assert.equal(perdido.espera_min, null);
  // quem nunca escreveu no WhatsApp (contato lançado à mão) não tem o que responder
  const semConversa = J.montarItem(lead('l4'), { agora: AGORA, pm: { primeira_entrada_em: null, primeira_saida_em: null, entradas: 0, saidas: 0 } });
  assert.equal(etapa(semConversa, 'respondido'), null);
  assert.deepEqual(semConversa.pendencias.filter(p => p === 'sem_resposta'), []);
});

test('período sem registro de respostas: a etapa fica desconhecida, sem pendência, e resposta dentro da janela não vale', () => {
  const janelas = [{ de: Date.parse(em(5, '18:00')), ate: null }];
  const pm = { primeira_entrada_em: utc(em(12, '09:41')), primeira_saida_em: null, entradas: 3, saidas: 0 };
  const item = J.montarItem(lead('l1'), { agora: AGORA, pm, janelas });
  assert.deepEqual(etapa(item, 'respondido'), { id: 'respondido', em: null, minutos: null, desconhecido: true });
  assert.deepEqual(item.pendencias.filter(p => p === 'sem_resposta'), []);
  assert.equal(item.espera_min, null);
  assert.equal(item.etapa_atual, 'contato', 'etapa desconhecida não vira a etapa atual');
  // saída gravada dentro da janela (tentativa que não saiu do aparelho) não conta como resposta
  const fantasma = J.montarItem(lead('l2'), { agora: AGORA, janelas, pm: { ...pm, primeira_saida_em: utc(em(12, '09:50')), saidas: 1 } });
  assert.equal(etapa(fantasma, 'respondido').desconhecido, true);
  // o contato andou (tem agendamento): foi atendido, só não se sabe em quanto tempo
  const andou = J.montarItem(lead('l3', { status: 'agendado' }), { agora: AGORA, janelas, pm,
    ags: [{ id: 'a1', lead_id: 'l3', data: '2026-11-21', hora: '09:00', status: 'aguardando', created_at: utc(em(12, '11:00')) }] });
  assert.deepEqual(etapa(andou, 'respondido'), { id: 'respondido', em: null, minutos: null });
  // quem escreveu um dia antes de o registro parar também fica desconhecido; bem antes disso, não
  const vespera = J.montarItem(lead('l4', { created_at: utc(em(5, '09:00')) }), { agora: AGORA, janelas, pm: { ...pm, primeira_entrada_em: utc(em(5, '09:00')) } });
  assert.equal(etapa(vespera, 'respondido').desconhecido, true);
  const antes = J.montarItem(lead('l5', { created_at: utc(em(2, '09:00')) }), { agora: AGORA, janelas, pm: { ...pm, primeira_entrada_em: utc(em(2, '09:00')) } });
  assert.equal(etapa(antes, 'respondido'), null);
  assert.ok(antes.pendencias.includes('sem_resposta'));
  // sem a função do banco (migração ainda não aplicada) tudo fica desconhecido
  const semFuncao = J.montarItem(lead('l6'), { agora: AGORA, pm: null, respostas: false });
  assert.equal(etapa(semFuncao, 'respondido').desconhecido, true);
});

test('janelas sem registro: silêncio de mais de 3 dias no fim do período, ou antes da primeira resposta dele', () => {
  const inicio = Date.parse(em(1, '00:00')), fim = AGORA;
  const j = (o) => J.janelasSemRegistro({ inicio, fim, agora: AGORA, ...o });
  assert.deepEqual(j({ antes: '2026-10-31T20:00:00Z', primeira: utc(em(2, '08:00')), ultima: utc(em(19, '11:00')) }), [], 'respostas chegando normalmente');
  assert.deepEqual(j({ antes: '2026-10-04T21:00:00Z', primeira: null, ultima: '2026-10-04T21:00:00Z' }), [{ de: Date.parse('2026-10-04T21:00:00Z'), ate: null }], 'parou antes do período e não voltou');
  assert.deepEqual(j({ antes: '2026-10-31T21:00:00Z', primeira: utc(em(2, '08:00')), ultima: utc(em(10, '11:00')) }), [{ de: Date.parse(utc(em(10, '11:00'))), ate: null }], 'parou no meio do período');
  assert.deepEqual(j({ antes: '2026-10-04T21:00:00Z', primeira: utc(em(15, '08:00')), ultima: utc(em(19, '11:00')) }),
    [{ de: Date.parse('2026-10-04T21:00:00Z'), ate: Date.parse(utc(em(15, '08:00'))) }], 'voltou no meio do período');
  assert.deepEqual(j({ antes: null, primeira: null, ultima: null }), [{ de: null, ate: null }], 'nunca registrou nada');
  // fim de semana comum (menos de 3 dias de silêncio) não abre janela
  assert.deepEqual(j({ antes: '2026-10-31T16:00:00Z', primeira: utc(em(2, '08:00')), ultima: utc(em(17, '18:00')) }), []);
});

test('cliente novo: primeira vez na casa (cadastro nasceu junto com o contato e não há contato anterior dele)', () => {
  const l = lead('l1');
  assert.equal(J.montarItem(l, { agora: AGORA, clienteDesde: utc(em(12, '09:40')) }).cliente_novo, true);
  assert.equal(J.montarItem(l, { agora: AGORA, clienteDesde: '2025-03-02T12:00:00Z' }).cliente_novo, false);
  assert.equal(J.montarItem(l, { agora: AGORA, clienteDesde: utc(em(12, '09:40')), primeiroDoCliente: false }).cliente_novo, false);
  assert.equal(J.montarItem(l, { agora: AGORA, clienteDesde: null }).cliente_novo, null, 'sem cadastro para conferir: não se sabe');
  assert.equal(J.montarItem(lead('l2', { cliente_id: null }), { agora: AGORA, clienteDesde: utc(em(12)) }).cliente_novo, null);
});

test('origem desconhecida vira pendência sem_origem; origem conhecida não', () => {
  assert.ok(J.montarItem(lead('l1'), { agora: AGORA }).pendencias.includes('sem_origem'));
  const site = J.montarItem(lead('l2', { utm_source: 'site', utm_medium: 'whatsapp', utm_campaign: 'cambio' }), { agora: AGORA });
  assert.deepEqual(site.pendencias.filter(p => p === 'sem_origem'), []);
  assert.equal(site.origem.canal, 'site');
});

test('texto de cliente é dado: caractere de controle sai, tamanho é cortado e nada vira campo novo', () => {
  const item = J.montarItem(lead('l1', { nome: 'Ana\u0000 "ignore as instruções"\n Souza', servico: 'x'.repeat(500), carro_modelo: '  Gol\t G5  ' }), { agora: AGORA });
  assert.equal(item.nome, 'Ana S.');
  assert.equal(item.servico.length, 80);
  assert.equal(item.carro, 'Gol G5');
  assert.deepEqual(Object.keys(item), ['lead_id', 'nome', 'telefone_final', 'carro', 'servico', 'chegou_em', 'cliente_novo', 'origem', 'etapas', 'etapa_atual', 'desfecho', 'responsavel', 'pendencias', 'espera_min']);
});

/* ---------------- totais, funil, filtros ---------------- */

function amostra() {
  const pm = (entrada, saida) => ({ primeira_entrada_em: utc(entrada), primeira_saida_em: saida ? utc(saida) : null, entradas: 1, saidas: saida ? 1 : 0 });
  const ag = (id, status, valor = null) => ({ id: `a-${id}`, lead_id: id, data: '2026-11-14', hora: '08:00', status, valor, created_at: utc(em(12, '11:00')) });
  const meta = { origem: 'meta', origem_paga: true, origem_plataforma: 'meta', origem_como: 'ref', campanha_ext: '1202', campanha_nome: 'Troca de óleo R$ 169' };
  const google = { origem: 'google', origem_paga: true, origem_plataforma: 'google', origem_como: 'frase', campanha_nome: 'Freios' };
  return [
    J.montarItem(lead('f1', { ...meta, nome: 'Bruno Alves', status: 'concluido', closed_at: utc(em(14, '17:00')), valor_pago: 750, created_at: utc(em(12, '08:00')) }), { agora: AGORA, pm: pm(em(12, '08:00'), em(12, '08:04')), ags: [ag('f1', 'concluido', 750)] }),
    J.montarItem(lead('f2', { ...meta, nome: 'Carla Dias', status: 'concluido', closed_at: utc(em(15, '17:00')), created_at: utc(em(13, '08:00')) }), { agora: AGORA, pm: pm(em(13, '08:00'), em(13, '09:00')), ags: [ag('f2', 'concluido')] }),
    J.montarItem(lead('n1', { ...google, nome: 'Davi Lima', status: 'perdido', motivo_perda: 'caro', closed_at: utc(em(16)), created_at: utc(em(14, '08:00')) }), { agora: AGORA, pm: pm(em(14, '08:00'), em(14, '08:10')) }),
    J.montarItem(lead('n2', { nome: 'Edu Reis', status: 'perdido', closed_at: utc(em(16)), created_at: utc(em(15, '08:00')), utm_source: 'site' }), { agora: AGORA, pm: pm(em(15, '08:00'), em(15, '08:30')) }),
    J.montarItem(lead('a1', { ...meta, nome: 'Fábio Souza', placa: 'XYZ9A88', status: 'agendado', created_at: utc(em(16, '08:00')) }), { agora: AGORA, pm: pm(em(16, '08:00'), em(16, '08:02')), ags: [{ ...ag('a1', 'confirmado'), data: '2026-11-21' }] }),
    J.montarItem(lead('a2', { nome: 'Gil Prado', telefone: '11988887777', status: 'novo', created_at: utc(em(19, '10:00')) }), { agora: AGORA, pm: pm(em(19, '10:00'), null) }),
  ];
}

test('totais do período: contagens, faturado e pendências', () => {
  const t = J.totais(amostra());
  assert.deepEqual({ contatos: t.contatos, de_anuncio: t.de_anuncio, respondidos: t.respondidos, com_orcamento: t.com_orcamento, agendaram: t.agendaram, vieram: t.vieram,
    fecharam: t.fecharam, nao_fecharam: t.nao_fecharam, abertos: t.abertos, faturado: t.faturado, sem_origem: t.sem_origem, sem_valor: t.sem_valor, sem_motivo: t.sem_motivo, sem_resposta: t.sem_resposta },
  { contatos: 6, de_anuncio: 4, respondidos: 5, com_orcamento: 0, agendaram: 3, vieram: 2, fecharam: 2, nao_fecharam: 2, abertos: 2, faturado: 750, sem_origem: 1, sem_valor: 1, sem_motivo: 1, sem_resposta: 1 });
  assert.equal(J.totais([]).faturado, 0);
  // fechou e nenhum valor conhecido: faturado é "não sei", não zero
  const semValor = [J.montarItem(lead('x', { status: 'concluido' }), { agora: AGORA })];
  assert.equal(J.totais(semValor).faturado, null);
});

test('com resposta desconhecida no período, "respondidos" não vira número: vem nulo, com o que se sabe ao lado', () => {
  const janelas = [{ de: Date.parse(em(1)), ate: null }];
  const itens = [
    J.montarItem(lead('d1'), { agora: AGORA, janelas, pm: { primeira_entrada_em: utc(em(12)), primeira_saida_em: null } }),
    J.montarItem(lead('d2', { status: 'concluido' }), { agora: AGORA, janelas, pm: { primeira_entrada_em: utc(em(12)), primeira_saida_em: null } }),
  ];
  const t = J.totais(itens);
  assert.equal(t.respondidos, null);
  assert.equal(t.respondidos_confirmados, 1);
  assert.equal(t.resposta_desconhecida, 1);
  const f = J.funil(itens).etapas.find(e => e.id === 'respondido');
  assert.deepEqual(f, { id: 'respondido', rotulo: 'Respondidos', total: null, anuncio: 0, passagem: null, confirmados: 1, desconhecidos: 1 });
  // quando a dúvida está num contato de anúncio, o recorte de anúncio também fica sem número
  const pago = J.montarItem(lead('d3', { origem: 'meta', origem_paga: true, origem_plataforma: 'meta', origem_como: 'ref' }), { agora: AGORA, janelas, pm: { primeira_entrada_em: utc(em(12)), primeira_saida_em: null } });
  assert.equal(J.funil([...itens, pago]).etapas.find(e => e.id === 'respondido').anuncio, null);
  assert.equal(J.funil([...itens, pago]).etapas.find(e => e.id === 'orcamento').passagem, null, 'sem o total da etapa anterior não há passagem');
});

test('funil: sete etapas na ordem do contrato, com o recorte de anúncio e a passagem honesta', () => {
  const f = J.funil(amostra());
  assert.deepEqual(f.etapas.map(e => e.id), ['contato', 'respondido', 'orcamento', 'agendou', 'veio', 'oficina', 'fechou']);
  assert.deepEqual(f.etapas.map(e => e.rotulo), ['Contatos', 'Respondidos', 'Com orçamento', 'Agendaram', 'Vieram', 'Carro na oficina', 'Fecharam']);
  assert.deepEqual(f.etapas[0], { id: 'contato', rotulo: 'Contatos', total: 6, anuncio: 4, passagem: null });
  assert.deepEqual(f.etapas[1], { id: 'respondido', rotulo: 'Respondidos', total: 5, anuncio: 4, passagem: 0.8333, confirmados: 5, desconhecidos: 0 });
  assert.deepEqual(f.etapas[2], { id: 'orcamento', rotulo: 'Com orçamento', total: 0, anuncio: 0, passagem: 0 });
  assert.equal(f.etapas[3].passagem, null, 'agendou mais gente do que teve orçamento: não há taxa honesta');
  assert.deepEqual(f.etapas[6], { id: 'fechou', rotulo: 'Fecharam', total: 2, anuncio: 2, passagem: 1 });
  assert.deepEqual(f.nao_fecharam, { total: 2, motivos: [{ id: 'caro', rotulo: 'Achou caro', n: 1 }], sem_motivo: 1 });
});

test('filtros da lista: canal, paga, campanha, desfecho, etapa, pendência e busca', () => {
  const itens = amostra(), internos = new Map([
    ['f1', { nome: 'Bruno Alves', telefone: '5512991230272', placa: 'ABC1D23' }], ['a1', { nome: 'Fábio Souza', telefone: '5512991230272', placa: 'XYZ9A88' }],
    ['a2', { nome: 'Gil Prado', telefone: '5511988887777', placa: null }],
  ]);
  const f = filtros => J.filtrar(itens, filtros, internos).map(i => i.lead_id);
  assert.deepEqual(f({ canal: 'meta' }), ['f1', 'f2', 'a1']);
  assert.deepEqual(f({ paga: true }), ['f1', 'f2', 'n1', 'a1']);
  assert.deepEqual(f({ paga: false }), ['n2']);
  assert.deepEqual(f({ campanha: '1202' }), ['f1', 'f2', 'a1']);
  assert.deepEqual(f({ campanha: 'Freios' }), ['n1'], 'campanha sem id na plataforma é achada pelo nome');
  assert.deepEqual(f({ desfecho: 'nao_fechou' }), ['n1', 'n2']);
  assert.deepEqual(f({ etapa: 'agendou' }), ['f1', 'f2', 'a1']);
  assert.deepEqual(f({ pendencia: 'sem_valor' }), ['f2']);
  assert.deepEqual(f({ pendencia: 'sem_resposta' }), ['a2']);
  assert.deepEqual(f({ q: 'fabio' }), ['a1'], 'busca sem acento');
  assert.deepEqual(f({ q: 'xyz-9a88' }), ['a1'], 'placa');
  assert.deepEqual(f({ q: '8888-7777' }), ['a2'], 'telefone');
  assert.deepEqual(f({ q: 'onix' }).length, 6, 'carro');
  assert.deepEqual(f({ canal: 'meta', desfecho: 'fechou', pendencia: 'sem_valor' }), ['f2']);
});

test('ordem da lista: recentes, valor e parados', () => {
  const itens = amostra();
  assert.deepEqual(J.ordenar(itens, 'recentes').map(i => i.lead_id), ['a2', 'a1', 'n2', 'n1', 'f2', 'f1']);
  assert.equal(J.ordenar(itens, 'valor')[0].lead_id, 'f1');
  const parados = J.ordenar(itens, 'parados').map(i => i.lead_id);
  assert.deepEqual(parados.slice(0, 2), ['a2', 'a1'], 'abertos primeiro, o que está parado há mais tempo no topo');
  assert.equal(itens[0].lead_id, 'f1', 'ordenar não mexe na lista recebida');
});

test('facetas dos filtros: contam o que sobra com os OUTROS filtros aplicados', () => {
  const itens = amostra();
  const fac = J.facetas(itens, { canal: 'meta' });
  assert.deepEqual(fac.canais, [{ id: 'meta', rotulo: 'Anúncio da Meta', n: 3 }, { id: 'google', rotulo: 'Anúncio do Google', n: 1 }, { id: 'site', rotulo: 'Site', n: 1 }, { id: 'desconhecida', rotulo: 'Ainda não sabemos', n: 1 }]);
  assert.deepEqual(fac.campanhas, [{ ext: '1202', nome: 'Troca de óleo R$ 169', plataforma: 'meta', n: 3 }]);
  assert.deepEqual(fac.desfechos, [{ id: 'fechou', rotulo: 'Fechou', n: 2 }, { id: 'nao_fechou', rotulo: 'Não fechou', n: 0 }, { id: 'aberto', rotulo: 'Em aberto', n: 1 }]);
  assert.deepEqual(J.facetas(itens, {}).motivos, [{ id: 'caro', rotulo: 'Achou caro', n: 1 }]);
  assert.deepEqual(J.facetas(itens, {}).pendencias.map(p => [p.id, p.n]), [['sem_origem', 1], ['sem_valor', 1], ['sem_motivo', 1], ['sem_resposta', 1]]);
});

/* ---------------- com o banco (de mentira) ---------------- */

function bancoCheio(qtd = 6, extra = {}) {
  const leads = [], agendamentos = [], clientes = [], pms = [];
  for (let i = 0; i < qtd; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const criado = AGORA - (i + 1) * (qtd > 140 ? 1 : 3) * 3600000;   // todos dentro do período (01/11 a 19/11)
    const status = ['novo', 'contato', 'agendado', 'concluido', 'perdido', 'orcamento'][i % 6];
    leads.push(lead(id, { cliente_id: `cli-${i}`, nome: `Cliente ${i} Sobrenome`, telefone: `1299100${String(i).padStart(4, '0')}`, telefone_e164: `+551299100${String(i).padStart(4, '0')}`,
      status, created_at: new Date(criado).toISOString(), closed_at: ['concluido', 'perdido'].includes(status) ? new Date(criado + 3600000).toISOString() : null,
      responsavel_id: i % 2 ? '11111111-1111-4111-8111-111111111111' : null, valor_pago: status === 'concluido' && i % 12 === 3 ? 500 : null }));
    clientes.push({ id: `cli-${i}`, created_at: new Date(criado - 60000).toISOString() });
    if (status === 'agendado' || status === 'concluido') agendamentos.push({ id: `ag-${i}`, lead_id: id, data: '2026-11-18', hora: '08:00', inicio_em: null, status: status === 'concluido' ? 'concluido' : 'confirmado', valor: null, created_at: new Date(criado + 600000).toISOString() });
    pms.push({ lead_id: id, primeira_entrada_em: new Date(criado).toISOString(), primeira_entrada_texto: 'Olá! Tenho interesse e queria mais informações, por favor.', primeira_saida_em: new Date(criado + 5 * 60000).toISOString(), entradas: 2, saidas: 2 });
  }
  return criarBanco({
    leads, agendamentos, clientes, orc_orcamentos: [], patio_os: [], patio_extras: [],
    perfis: [{ id: '11111111-1111-4111-8111-111111111111', nome: 'Carlos Pereira', ativo: true }],
    // a oficina respondendo todo dia (saída confirmada pelo aparelho), de 25/10 a 19/11
    whatsapp_mensagens: Array.from({ length: 26 }, (_, d) => ({ id: `s${d}`, direcao: 'saida', status: 'enviado', wamid: `w${d}`, created_at: new Date(Date.parse('2026-10-25T12:00:00Z') + d * 86400000).toISOString() })),
    conversas: [], ...extra.tabelas,
  }, { rpc: { trafego_primeiras_mensagens: ({ p_leads }) => pms.filter(p => p_leads.includes(p.lead_id)), ...extra.rpc }, ...extra.opcoes });
}
const PERIODO = { de: '2026-11-01', ate: '2026-11-19' };

test('listarBruto: uma linha por contato no formato do contrato, com o estado do período', async () => {
  J.esquecer();
  const sb = bancoCheio(6);
  const itens = await J.listarBruto({ ...PERIODO, sb, agora: AGORA });
  assert.equal(itens.length, 6);
  assert.deepEqual(Object.keys(itens[0]), ['lead_id', 'nome', 'telefone_final', 'carro', 'servico', 'chegou_em', 'cliente_novo', 'origem', 'etapas', 'etapa_atual', 'desfecho', 'responsavel', 'pendencias', 'espera_min']);
  assert.equal(itens[0].nome, 'Cliente S.');
  assert.equal(itens[1].responsavel, 'Carlos');
  assert.equal(itens[0].cliente_novo, true);
  assert.equal(itens[0].etapas[1].minutos, 5);
  assert.equal(itens.estado.respostas, 'ok');
  assert.equal(JSON.stringify(itens).includes('Sobrenome'), false, 'nome completo não sai na lista');
  assert.equal(JSON.stringify(itens).includes('1299100'), false, 'telefone completo não sai na lista');
});

test('consultas em lote: o número de idas ao banco não cresce com o número de contatos, e a segunda leitura vem da memória', async () => {
  J.esquecer();
  const pequeno = bancoCheio(30), grande = bancoCheio(140);
  await J.listarBruto({ ...PERIODO, sb: pequeno, agora: AGORA });
  await J.listarBruto({ ...PERIODO, sb: grande, agora: AGORA });
  assert.equal(grande.idas(), pequeno.idas(), `30 contatos: ${pequeno.idas()} idas; 140 contatos: ${grande.idas()} idas`);
  assert.ok(pequeno.idas() <= 14, `no máximo 14 idas ao banco para montar a jornada (foram ${pequeno.idas()})`);
  const antes = grande.idas();
  const de_novo = await J.listarBruto({ ...PERIODO, sb: grande, agora: AGORA });
  assert.equal(grande.idas(), antes, 'memória curta por período');
  assert.equal(de_novo.length, 140);
  // outro período lê de novo; esquecer() limpa
  await J.listarBruto({ de: '2026-11-10', ate: '2026-11-19', sb: grande, agora: AGORA });
  assert.ok(grande.idas() > antes);
  const meio = grande.idas();
  J.esquecer();
  await J.listarBruto({ ...PERIODO, sb: grande, agora: AGORA });
  assert.ok(grande.idas() > meio);
});

test('muitos contatos: os lotes de 150 andam em paralelo e a conta de idas continua pequena', async () => {
  J.esquecer();
  const sb = bancoCheio(400);
  const itens = await J.listarBruto({ ...PERIODO, sb, agora: AGORA });
  assert.equal(itens.length, 400);
  assert.ok(sb.idas() <= 30, `400 contatos em no máximo 30 idas (foram ${sb.idas()})`);
});

test('banco ainda sem a migração da rodada 8: a jornada funciona com o que existe e avisa o que falta', async () => {
  J.esquecer();
  require('../leads').esquecerColunasR8();
  const sb = bancoCheio(6, { rpc: { trafego_primeiras_mensagens: undefined },
    opcoes: { colunasAusentes: { leads: ['origem_paga', 'origem_plataforma', 'campanha_ext', 'origem_como', 'motivo_perda', 'rastreio'] } } });
  const itens = await J.listarBruto({ ...PERIODO, sb, agora: AGORA });
  require('../leads').esquecerColunasR8();
  assert.equal(itens.length, 6);
  assert.equal(itens.estado.respostas, 'indisponivel');
  assert.equal(itens[0].etapas.find(e => e.id === 'respondido').desconhecido, true);
  assert.deepEqual(itens.flatMap(i => i.pendencias).filter(p => p === 'sem_resposta'), []);
});

test('sem nenhuma resposta registrada há dias: estado.respostas = sem_registro, com a data desde quando e o texto pronto', async () => {
  J.esquecer();
  const sb = bancoCheio(6, { tabelas: { whatsapp_mensagens: [
    { id: 'm0', direcao: 'saida', status: 'enviado', wamid: 'w0', created_at: '2026-10-04T21:00:00Z' },
    { id: 'm1', direcao: 'saida', status: 'falhou', wamid: null, created_at: new Date(AGORA - 3600000).toISOString() },
    { id: 'm2', direcao: 'saida', status: 'enviado', wamid: null, created_at: new Date(AGORA - 7200000).toISOString() },
    { id: 'm3', direcao: 'entrada', status: 'recebido', wamid: 'w3', created_at: new Date(AGORA - 600000).toISOString() },
  ] } });
  const itens = await J.listarBruto({ ...PERIODO, sb, agora: AGORA });
  assert.equal(itens.estado.respostas, 'sem_registro');
  assert.equal(itens.estado.respostas_desde, '2026-10-04T18:00:00-03:00');
  assert.equal(itens.estado.respostas_ate, null);
  assert.match(itens.estado.respostas_texto, /^Desde 04\/10 o sistema não registra/);
  assert.equal(itens.every(i => !i.pendencias.includes('sem_resposta')), true);
  assert.equal(J.totais(itens).respondidos, null);
});

test('Orçador e Pátio fora do ar: a jornada sai só com o CRM e diz que o ciclo ficou de fora', async () => {
  J.esquecer();
  const sb = bancoCheio(6, { opcoes: { falhas: { orc_orcamentos: 'fetch failed' } } });
  const itens = await J.listarBruto({ ...PERIODO, sb, agora: AGORA, esperaRetryMs: 1 });
  assert.equal(itens.length, 6);
  assert.equal(itens.estado.ciclo, 'indisponivel');
});

test('listar: resposta do contrato (totais, funil, filtros, itens paginados) e conversas novas do período', async () => {
  J.esquecer();
  const conversas = [
    { id: 'c1', telefone_e164: '+5512991000000', tipo: 'cliente', aberta_em: new Date(AGORA - 3 * 3600000).toISOString() },
    { id: 'c2', telefone_e164: '+5512977776666', tipo: 'cliente', aberta_em: new Date(AGORA - 5 * 3600000).toISOString() },
    { id: 'c3', telefone_e164: '+5512955554444', tipo: 'cliente', aberta_em: '2026-10-02T12:00:00Z' },
  ];
  const sb = bancoCheio(120, { tabelas: { conversas } });
  const r = await J.listar({ periodo: { ...PERIODO, rotulo: 'Este mês', anterior: { de: '2026-10-01', ate: '2026-10-19' } }, filtros: { tamanho: 50, pagina: 2 }, sb, agora: AGORA });
  assert.deepEqual(Object.keys(r), ['periodo', 'estado', 'totais', 'funil', 'filtros', 'itens', 'pagina']);
  assert.deepEqual(r.periodo, { ...PERIODO, rotulo: 'Este mês', anterior: { de: '2026-10-01', ate: '2026-10-19' } });
  assert.deepEqual(r.pagina, { atual: 2, tamanho: 50, total: 120 });
  assert.equal(r.itens.length, 50);
  assert.equal(r.totais.contatos, 120);
  assert.equal(r.totais.conversas_novas, 2);
  assert.equal(r.totais.conversas_novas_viraram_contato, 1);
  assert.equal(r.totais.conversas_novas_anuncio, null, 'sem a tabela de frases não dá para dizer quantas vieram de anúncio');
  assert.equal(r.funil.etapas.length, 7);
  assert.deepEqual(Object.keys(r.filtros), ['canais', 'campanhas', 'desfechos', 'motivos', 'pendencias', 'etapas']);
  assert.deepEqual(Object.keys(r.estado).slice(0, 4), ['gasto', 'valores', 'origem', 'demo']);
  assert.equal(r.estado.valores, 'faltam');
  assert.equal(r.estado.origem, 'nenhuma');
  // filtro aplicado: totais e funil acompanham; a página volta para o que existe
  const f = await J.listar({ periodo: PERIODO, filtros: { desfecho: 'fechou', tamanho: 500, pagina: 9 }, sb, agora: AGORA });
  assert.equal(f.totais.contatos, 20);
  assert.equal(f.pagina.tamanho, 200, 'tamanho máximo');
  assert.equal(f.pagina.atual, 1);
  assert.equal(f.itens.every(i => i.desfecho.tipo === 'fechou'), true);
});

test('conversas novas que vieram de anúncio: primeira mensagem de cada telefone casada com as frases cadastradas e com os códigos', async () => {
  J.esquecer();
  const h = n => new Date(AGORA - n * 3600000).toISOString();
  const conversas = [1, 2, 3, 4, 5].map(n => ({ id: `c${n}`, telefone_e164: `+55129800000${n}`, tipo: 'cliente', aberta_em: h(n) }));
  const msg = (n, corpo) => ({ id: `e${n}`, conversa_id: `c${n}`, direcao: 'entrada', status: 'recebido', wamid: `we${n}`, corpo, created_at: h(n), telefone_e164: `+55129800000${n}` });
  const sb = bancoCheio(6, { tabelas: {
    conversas,
    whatsapp_mensagens: [
      { id: 's1', direcao: 'saida', status: 'enviado', wamid: 'w1', created_at: h(1) },
      msg(1, 'Olá! Tenho interesse e queria mais informações, por favor. 😀'),
      msg(2, 'Oi, vi o anúncio no Google e gostaria de um orçamento'),
      msg(3, 'Bom dia, quanto custa a troca de óleo?'),
      msg(4, 'Olá! Quero saber da revisão. [ref K7M2P]'),
      msg(5, 'vim pelo site (site/cambio--direto--r-abcde)'),
      { id: 'e1b', conversa_id: 'c1', direcao: 'entrada', status: 'recebido', wamid: 'we1b', corpo: 'vi o anúncio no google', created_at: h(0.5) },
    ],
    trafego_frases: [
      { id: 'f1', frase: 'ola! tenho interesse e queria mais informacoes, por favor', tipo: 'exata', como: 'frase_padrao', paga: true, plataforma: 'meta', ativa: true },
      { id: 'f2', frase: 'vi o anuncio no google', tipo: 'contem', como: 'frase', paga: true, plataforma: 'google', ativa: true },
      { id: 'f3', frase: 'vim pelo site', tipo: 'comeca', como: 'frase', paga: false, plataforma: null, ativa: true },
      { id: 'f4', frase: 'quanto custa', tipo: 'contem', como: 'frase', paga: true, plataforma: 'meta', ativa: false },
    ],
    trafego_rastreio: [
      { id: 'r1', codigo: 'K7M2P', permanente: true, paga: true, plataforma: 'meta', referencia_tipo: null },
      { id: 'r2', codigo: 'ABCDE', permanente: false, paga: null, plataforma: null, referencia_tipo: 'direto' },
    ],
  } });
  const r = await J.listar({ periodo: PERIODO, filtros: {}, sb, agora: AGORA });
  assert.equal(r.totais.conversas_novas, 5);
  assert.equal(r.totais.conversas_novas_anuncio, 3, 'frase padrão da Meta, "vi o anúncio no Google" e código de mensagem pronta de anúncio');
});

test('pendências: quatro filas com até 30 itens; a de origem leva a primeira mensagem para a pessoa decidir', async () => {
  J.esquecer();
  const sb = bancoCheio(240);
  const p = await J.pendencias({ ...PERIODO, sb, agora: AGORA });
  assert.deepEqual(Object.keys(p), ['periodo', 'estado', 'sem_valor', 'sem_motivo', 'sem_origem', 'sem_resposta']);
  assert.equal(p.sem_origem.n, 240);
  assert.equal(p.sem_origem.itens.length, 30);
  assert.equal(p.sem_origem.itens[0].primeira_mensagem, 'Olá! Tenho interesse e queria mais informações, por favor.');
  assert.equal(p.sem_valor.n, 20);
  assert.equal(p.sem_valor.itens.length, 20);
  assert.equal(p.sem_valor.itens[0].primeira_mensagem, undefined);
  assert.equal(p.sem_motivo.n, 40);
  assert.equal(p.sem_resposta.n, 0);
});
