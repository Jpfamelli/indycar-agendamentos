'use strict';
/* Rodada 8 (frente T2a) — bloco `agenda` de /api/hoje: ocupação dos próximos 7 dias de trabalho,
   com a MESMA regra da Agenda (segunda a sábado, 8h às 17h30, um consultor = 570 minutos por dia). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const Ag = require('../motor/agenda-oficina');
const T = require('../motor/texto');

const HOJE = '2026-11-19';   // quinta-feira
const consultores = [{ id: 'c1', ativo: true }, { id: 'c2', ativo: false }];
const servicos = [{ nome: 'Troca de óleo', duracao_min: 45 }, { nome: 'Revisão completa', duracao_min: 240 }];
const marcado = (data, hora, servico, status = 'aguardando') => ({ data, hora, servico, status });

test('próximos 7 dias de trabalho: começa hoje, pula o domingo e traz o rótulo curto', () => {
  assert.deepEqual(Ag.proximosDiasDeTrabalho(HOJE), ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  assert.deepEqual(Ag.proximosDiasDeTrabalho('2026-11-22'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-30'], 'pedido num domingo começa na segunda');
  assert.deepEqual(Ag.proximosDiasDeTrabalho(HOJE, 2), ['2026-11-19', '2026-11-20']);
});

test('ocupação do dia: minutos marcados sobre a capacidade; cancelado e falta não ocupam', () => {
  const a = Ag.agendaDaOficina({
    hoje: HOJE, consultores, servicos,
    agendamentos: [
      marcado('2026-11-19', '08:00', 'Troca de óleo'),                 // 45
      marcado('2026-11-19', '09:00:00', 'Revisão completa'),           // 240
      marcado('2026-11-19', '17:00', 'Revisão completa'),              // só 30: fecha às 17h30
      marcado('2026-11-19', '10:00', 'Serviço que ninguém cadastrou'), // 60 (padrão)
      marcado('2026-11-19', '11:00', 'Troca de óleo', 'cancelado'),
      marcado('2026-11-19', '11:30', 'Troca de óleo', 'nao_veio'),
      marcado('2026-11-20', '08:00', 'Troca de óleo', 'confirmado'),
      marcado('2026-11-22', '08:00', 'Troca de óleo'),                 // domingo: fora da lista
    ],
  });
  assert.equal(a.dias.length, 7);
  const [qui, sex, sab] = a.dias;
  assert.deepEqual(qui, { data: '2026-11-19', rotulo: 'qui 19', ocupacao: 0.66, marcados: 4, vagas: 3 }, '375 de 570 minutos; sobram 195 = 3 vagas de 1 hora');
  assert.deepEqual(sex, { data: '2026-11-20', rotulo: 'sex 20', ocupacao: 0.08, marcados: 1, vagas: 8 });
  assert.deepEqual(sab, { data: '2026-11-21', rotulo: 'sáb 21', ocupacao: 0, marcados: 0, vagas: 9 });
  assert.deepEqual(T.naoFinitos(a), []);
  assert.deepEqual(T.textosRuins(a), []);
});

test('capacidade: um consultor ativo no mínimo, como na Agenda; dois consultores dobram a casa', () => {
  const um = Ag.agendaDaOficina({ hoje: HOJE, consultores: [], servicos, agendamentos: [marcado('2026-11-19', '08:00', 'Revisão completa')] });
  assert.equal(um.dias[0].ocupacao, 0.42, '240 de 570');
  const dois = Ag.agendaDaOficina({ hoje: HOJE, consultores: [{ id: 'a', ativo: true }, { id: 'b', ativo: true }], servicos, agendamentos: [marcado('2026-11-19', '08:00', 'Revisão completa')] });
  assert.equal(dois.dias[0].ocupacao, 0.21, '240 de 1.140');
  assert.equal(dois.dias[0].vagas, 15);
});

test('sem saber a capacidade (consultores não vieram do banco): ocupação e vagas ficam null e só os marcados contam', () => {
  const a = Ag.agendaDaOficina({ hoje: HOJE, consultores: null, servicos, agendamentos: [marcado('2026-11-19', '08:00', 'Troca de óleo'), marcado('2026-11-20', '08:00', 'Troca de óleo')] });
  assert.deepEqual(a.dias[0], { data: '2026-11-19', rotulo: 'qui 19', ocupacao: null, marcados: 1, vagas: null });
  assert.match(a.leitura, /2 carros marcados nos próximos 7 dias de trabalho/);
  assert.equal(a.situacao, 'sem_capacidade');
});

test('sem a agenda (falhou a leitura): dias com tudo null e a frase diz que não deu para ler', () => {
  const a = Ag.agendaDaOficina({ hoje: HOJE, consultores, servicos, agendamentos: null });
  assert.equal(a.dias.length, 7);
  assert.ok(a.dias.every(d => d.ocupacao === null && d.marcados === null && d.vagas === null));
  assert.equal(a.situacao, 'indisponivel');
  assert.match(a.leitura, /Não deu para ler a agenda/);
});

test('leitura: cheia segura a verba, vazia vale acelerar, no meio fica equilibrada', () => {
  const dia = (data, n) => Array.from({ length: n }, (_, i) => marcado(data, `${String(8 + i).padStart(2, '0')}:00`, 'Serviço de uma hora'));
  const dias = Ag.proximosDiasDeTrabalho(HOJE);
  const cheia = Ag.agendaDaOficina({ hoje: HOJE, consultores, servicos, agendamentos: dias.flatMap(d => dia(d, 9)) });
  assert.equal(cheia.situacao, 'cheia');
  assert.match(cheia.leitura, /cheia/);
  assert.match(cheia.leitura, /segur/i);
  const vazia = Ag.agendaDaOficina({ hoje: HOJE, consultores, servicos, agendamentos: dia(dias[0], 1) });
  assert.equal(vazia.situacao, 'vazia');
  assert.match(vazia.leitura, /acelerar/);
  const meio = Ag.agendaDaOficina({ hoje: HOJE, consultores, servicos, agendamentos: dias.flatMap(d => dia(d, 5)) });
  assert.equal(meio.situacao, 'equilibrada');
  assert.equal(meio.ocupacao_media, 0.53);
});

test('duração do serviço: cadastro primeiro (nome igual ou contido), depois palavra-chave, depois 60 minutos', () => {
  assert.equal(Ag.duracaoDoServico('Troca de óleo', servicos), 45);
  assert.equal(Ag.duracaoDoServico('troca de oleo + filtro', servicos), 45, 'nome do cadastro contido no serviço marcado');
  assert.equal(Ag.duracaoDoServico('Embreagem', servicos), 300);
  assert.equal(Ag.duracaoDoServico('Freio dianteiro', servicos), 90);
  assert.equal(Ag.duracaoDoServico('', servicos), 60);
  assert.equal(Ag.duracaoDoServico(null, null), 60);
});

test('a regra é a mesma da Agenda: expediente, duração e minutos ocupados batem com os arquivos dela', async t => {
  const raiz = path.join(__dirname, '..', '..', '..');
  const arquivoHorarios = path.join(raiz, 'horarios.js'), arquivoRelatorios = path.join(raiz, 'relatorios.js');
  if (!fs.existsSync(arquivoHorarios) || !fs.existsSync(arquivoRelatorios)) return t.skip('fora do monorrepo: os arquivos da Agenda não estão aqui');
  const H = await import(pathToFileURL(arquivoHorarios).href);
  const R = await import(pathToFileURL(arquivoRelatorios).href);
  assert.deepEqual({ ...Ag.EXPEDIENTE, dias: [...Ag.EXPEDIENTE.dias] }, { abre: H.EXPEDIENTE.abre, fecha: H.EXPEDIENTE.fecha, dias: [...H.EXPEDIENTE.dias] });
  assert.equal(Ag.MINUTOS_DO_EXPEDIENTE, R.MINUTOS_DO_EXPEDIENTE);
  const nomes = ['Troca de óleo', 'troca de oleo + filtro', 'Revisão completa', 'Embreagem', 'Correia dentada', 'Suspensão', 'Freio', 'Pneu', 'Alinhamento', 'Diagnóstico com scanner', 'Outra coisa', '', null];
  for (const n of nomes) assert.equal(Ag.duracaoDoServico(n, servicos), H.duracaoDoServico(n, servicos), `duração de "${n}"`);
  for (const [hora, servico] of [['08:00', 'Troca de óleo'], ['17:00', 'Revisão completa'], ['17:30', 'Freio'], ['hora ruim', 'Freio'], ['07:00', 'Embreagem']]) {
    assert.equal(Ag.minutosDoHorario({ hora, servico }, servicos), R.minutosDoHorario({ hora, servico }, servicos), `${hora} ${servico}`);
  }
  // e a conta do dia inteira: a mesma porcentagem do relatório do dono da Agenda
  const lista = [marcado(HOJE, '08:00', 'Troca de óleo'), marcado(HOJE, '09:00', 'Revisão completa'), marcado(HOJE, '17:00', 'Revisão completa'), marcado(HOJE, '11:30', 'Freio', 'nao_veio'), marcado(HOJE, '12:00', 'Freio', 'cancelado')];
  const daAgenda = R.relatorioDoDono({ lista, consultores, servicos, inicio: HOJE, fim: HOJE });
  const daqui = Ag.agendaDaOficina({ hoje: HOJE, consultores, servicos, agendamentos: lista });
  assert.equal(daqui.dias[0].ocupacao, Math.round(daAgenda.porDia[0].pct) / 100);
});
