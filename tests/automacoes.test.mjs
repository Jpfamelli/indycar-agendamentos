// Automações (automacoes.js) com RELÓGIO INJETÁVEL — nenhuma espera de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planejar, rodarAutomacoes, relogioSP, proximoDiaUtil, TITULO_CONFIRMAR, TITULO_REAGENDAR } from '../automacoes.js';

// 13/10/2026 é uma terça. Horário de São Paulo = UTC-3.
const SP = (iso) => new Date(`${iso}-03:00`);
const C1 = 'c1', PERFIL_C1 = 'p-consultor', GESTOR = 'p-gestor', ATENDEU = 'p-atendente';
const consultores = [{ id: C1, perfil_id: PERFIL_C1, nome: 'Gabriel' }, { id: 'c2', perfil_id: null, nome: 'Sem login' }];
const gestores = [{ id: GESTOR }];
const ag = (o) => ({ cliente_nome: 'Maria', servico: 'Troca de óleo', telefone: '12991110001', confirmado: false, compareceu: null, ...o });

test('relogioSP e próximo dia útil (sábado → segunda)', () => {
  assert.deepEqual(relogioSP(SP('2026-10-13T16:05:00')), { data: '2026-10-13', min: 16 * 60 + 5, diaSemana: 2 });
  assert.equal(proximoDiaUtil('2026-10-13'), '2026-10-14');
  assert.equal(proximoDiaUtil('2026-10-17'), '2026-10-19');
});

test('confirmar: só a partir das 16h, só amanhã, só sem confirmação; vai para o consultor ou o gestor', () => {
  const ags = [
    ag({ id: 'a1', data: '2026-10-14', hora: '09:00', status: 'aguardando', consultor_id: C1 }),
    ag({ id: 'a2', data: '2026-10-14', hora: '10:00', status: 'aguardando', consultor_id: null }),
    ag({ id: 'a3', data: '2026-10-14', hora: '11:00', status: 'confirmado', confirmado: true }),
    ag({ id: 'a4', data: '2026-10-15', hora: '09:00', status: 'aguardando' }),
  ];
  assert.equal(planejar({ agora: SP('2026-10-13T15:59:00'), agendamentos: ags, consultores, gestores }).tarefas.length, 0);
  const p = planejar({ agora: SP('2026-10-13T16:00:00'), agendamentos: ags, consultores, gestores });
  const conf = p.tarefas.filter((t) => t.titulo === TITULO_CONFIRMAR);
  assert.deepEqual(conf.map((t) => [t.agendamento_id, t.responsavel_id]), [['a1', PERFIL_C1], ['a2', GESTOR]]);
  assert.ok(conf.every((t) => t.origem === 'automacao' && /Comunicar/.test(t.descricao)));
  assert.equal(p.notificacoes.length, 0, 'nada de WhatsApp nem notificação aqui');
});

test('confirmar: não repete se a tarefa já existe; sábado 16h olha a segunda', () => {
  const ags = [ag({ id: 'a1', data: '2026-10-14', hora: '09:00', status: 'aguardando' })];
  const tarefas = [{ agendamento_id: 'a1', titulo: TITULO_CONFIRMAR }];
  assert.equal(planejar({ agora: SP('2026-10-13T17:00:00'), agendamentos: ags, tarefas, consultores, gestores }).tarefas.length, 0);
  const seg = [ag({ id: 'b1', data: '2026-10-19', hora: '08:00', status: 'aguardando' })];
  assert.equal(planejar({ agora: SP('2026-10-17T16:30:00'), agendamentos: seg, consultores, gestores }).tarefas.length, 1);
});

test('reagendar: quem faltou vai para quem atendeu a conversa (senão consultor, senão gestor)', () => {
  const ags = [
    ag({ id: 'f1', data: '2026-10-13', hora: '09:00', status: 'nao_veio', cliente_id: 'cli1', consultor_id: C1 }),
    ag({ id: 'f2', data: '2026-10-12', hora: '09:00', status: 'nao_veio', telefone: '5512991110002', consultor_id: C1 }),
    ag({ id: 'f3', data: '2026-10-12', hora: '10:00', status: 'nao_veio', telefone: null }),
    ag({ id: 'f4', data: '2026-10-01', hora: '10:00', status: 'nao_veio' }),       // velho demais
  ];
  const conversas = [{ cliente_id: 'cli1', telefone_e164: '12991110001', atribuida_a: ATENDEU }];
  const p = planejar({ agora: SP('2026-10-13T10:00:00'), agendamentos: ags, consultores, gestores, conversas });
  const re = p.tarefas.filter((t) => t.titulo === TITULO_REAGENDAR);
  assert.deepEqual(re.map((t) => [t.agendamento_id, t.responsavel_id]), [['f1', ATENDEU], ['f2', PERFIL_C1], ['f3', GESTOR]]);
  assert.ok(re.every((t) => t.prioridade === 1));
});

test('atraso: 30 min sem desfecho → notificação com chave (o banco não repete); antes disso nada', () => {
  const ags = [
    ag({ id: 'x1', data: '2026-10-13', hora: '09:00', status: 'confirmado', consultor_id: C1 }),
    ag({ id: 'x2', data: '2026-10-13', hora: '09:00', status: 'aguardando', consultor_id: null }),
    ag({ id: 'x3', data: '2026-10-13', hora: '09:00', status: 'confirmado', compareceu: true }),
    ag({ id: 'x4', data: '2026-10-13', hora: '09:00', status: 'concluido' }),
  ];
  assert.equal(planejar({ agora: SP('2026-10-13T09:29:00'), agendamentos: ags, consultores, gestores }).notificacoes.length, 0);
  const n = planejar({ agora: SP('2026-10-13T09:45:00'), agendamentos: ags, consultores, gestores }).notificacoes;
  assert.deepEqual(n.map((x) => [x.perfil_id, x.chave]), [[PERFIL_C1, 'atraso:x1'], [GESTOR, 'atraso:x2']]);
  assert.match(n[0].titulo, /45 min atrasado/);
  assert.equal(n[0].link, '/?agendamento=x1');
  // domingo não tem oficina
  assert.equal(planejar({ agora: SP('2026-10-18T10:00:00'), agendamentos: [ag({ id: 'd', data: '2026-10-18', hora: '08:00', status: 'aguardando' })], gestores }).notificacoes.length, 0);
});

test('rodarAutomacoes grava pelo "banco" injetado e sobrevive a erro de uma gravação', async () => {
  const criadas = [], notas = [];
  const dados = {
    agendamentosParaAutomacao: async () => [ag({ id: 'a1', data: '2026-10-14', hora: '09:00', status: 'aguardando' }),
      ag({ id: 'f1', data: '2026-10-13', hora: '08:00', status: 'nao_veio', cliente_id: 'cli' })],
    tarefasDosAgendamentos: async () => [],
    listarConsultores: async () => consultores,
    donosDasConversas: async () => [],
    gestoresAtivos: async () => gestores,
    criarTarefa: async (t) => { if (t.agendamento_id === 'f1') throw new Error('falhou de propósito'); criadas.push(t); },
    notificar: async (n) => { notas.push(n); return 'id'; },
  };
  const log = { log() {}, error() {} };
  const r = await rodarAutomacoes({ dados, agora: SP('2026-10-13T16:10:00'), log });
  assert.deepEqual(r, { tarefas: 1, notificacoes: 0 });
  assert.equal(criadas[0].titulo, TITULO_CONFIRMAR);
});
