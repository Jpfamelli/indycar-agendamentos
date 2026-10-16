// Testes das funções puras da rodada 2 (carteiro, feriados, CSV, relatório) — `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feriado, FERIADOS, proximoDiaDeEnvio, decidirFalha, vagasNestaRodada, conversaOcupada,
  semanasDoRelatorio, montarRelatorio, paraCSV, COLUNAS_CSV_ENVIOS, montarAniversarios,
  TIPOS_SEGURAM_NO_FERIADO, TIPOS_ESPERAM_ATENDIMENTO, MAX_TENTATIVAS,
} from '../dados.js';

test('feriados nacionais 2026–2027 (inclui os móveis)', () => {
  assert.equal(feriado('2026-10-12'), 'Nossa Senhora Aparecida');
  assert.equal(feriado('2026-04-03'), 'Sexta-feira Santa');
  assert.equal(feriado('2026-06-04'), 'Corpus Christi');
  assert.equal(feriado('2027-03-26'), 'Sexta-feira Santa');
  assert.equal(feriado('2027-02-09'), 'Carnaval');
  assert.equal(feriado('2026-11-20'), 'Consciência Negra');
  assert.equal(feriado('2026-10-09'), null);
  assert.equal(Object.keys(FERIADOS).length, 26);
});

test('proximoDiaDeEnvio pula feriado e domingo', () => {
  // 12/10/2026 é segunda e feriado → terça 13/10 às 09:30 (SP)
  assert.equal(proximoDiaDeEnvio('2026-10-11', '09:30'), '2026-10-13T12:30:00.000Z');
  // sábado 10/10 → domingo não envia, segunda feriado → terça
  assert.equal(proximoDiaDeEnvio('2026-10-10', '09:30'), '2026-10-13T12:30:00.000Z');
  // com domingo liberado, cai no domingo
  assert.equal(proximoDiaDeEnvio('2026-10-10', '09:30', true), '2026-10-11T12:30:00.000Z');
});

test('réguas que seguram no feriado / esperam atendimento', () => {
  assert.ok(TIPOS_SEGURAM_NO_FERIADO.has('retorno') && !TIPOS_SEGURAM_NO_FERIADO.has('lembrete') && !TIPOS_SEGURAM_NO_FERIADO.has('aniversario'));
  assert.ok(TIPOS_ESPERAM_ATENDIMENTO.has('posvenda') && !TIPOS_ESPERAM_ATENDIMENTO.has('lembrete') && !TIPOS_ESPERAM_ATENDIMENTO.has('avaliacao'));
});

test('decidirFalha: transitória volta com espera até 3 tentativas', () => {
  const t0 = Date.parse('2026-10-09T12:00:00Z');
  assert.deepEqual(decidirFalha('timeout', 1, t0), { status: 'pendente', enviar_em: '2026-10-09T12:05:00.000Z', esperaMin: 5 });
  assert.equal(decidirFalha('O CodeWords respondeu 500', 2, t0).enviar_em, '2026-10-09T12:15:00.000Z');
  assert.equal(decidirFalha('O CodeWords respondeu 500', MAX_TENTATIVAS, t0).status, 'falhou');
  assert.equal(decidirFalha('número inválido', 1, t0).status, 'falhou', 'número inválido não adianta repetir');
  assert.equal(decidirFalha('phone not registered on WhatsApp', 1, t0).status, 'falhou');
});

test('vagasNestaRodada respeita o limite por hora e o lote', () => {
  assert.equal(vagasNestaRodada(60, 0), 25);
  assert.equal(vagasNestaRodada(60, 50), 10);
  assert.equal(vagasNestaRodada(60, 70), 0);
  assert.equal(vagasNestaRodada(5, 2), 3);
  assert.equal(vagasNestaRodada(undefined, 0), 25, 'sem config: padrão 60');
});

test('conversaOcupada: esperando consultor ou cliente sem resposta há menos de 2 h', () => {
  const agora = Date.parse('2026-10-09T15:00:00Z');
  assert.equal(conversaOcupada(null, null, agora).ocupada, false);
  assert.equal(conversaOcupada({ aguardando_consultor: true }, null, agora).ocupada, true);
  assert.equal(conversaOcupada({}, { direcao: 'entrada', created_at: '2026-10-09T14:00:00Z' }, agora).ocupada, true);
  assert.equal(conversaOcupada({}, { direcao: 'entrada', created_at: '2026-10-09T12:30:00Z' }, agora).ocupada, false, '2h30 atrás: livre');
  assert.equal(conversaOcupada({}, { direcao: 'saida', created_at: '2026-10-09T14:59:00Z' }, agora).ocupada, false, 'já respondido');
});

test('semanasDoRelatorio agrupa de segunda a domingo no fuso de SP', () => {
  const envios = [
    { status: 'enviado', enviado_em: '2026-10-05T13:00:00Z', respondido_em: 'x', resposta_tipo: 'positiva' }, // seg 05/10
    { status: 'enviado', enviado_em: '2026-10-09T13:00:00Z', agendou_depois_id: 'a' },                       // sex 09/10
    { status: 'enviado', enviado_em: '2026-10-05T02:00:00Z' },  // dom 04/10 23h em SP → semana anterior
    { status: 'falhou', enviado_em: '2026-10-06T13:00:00Z' },   // não conta
  ];
  const s = semanasDoRelatorio(envios, 3, '2026-10-09');
  assert.deepEqual(s.map((x) => x.inicio), ['2026-09-21', '2026-09-28', '2026-10-05']);
  assert.equal(s[2].enviadas, 2);
  assert.equal(s[2].respondidas, 1);
  assert.equal(s[2].agendaram, 1);
  assert.equal(s[1].enviadas, 1);
  const r = montarRelatorio([...envios, { status: 'enviado', enviado_em: '2026-10-08T13:00:00Z', intencao: 'quer_agendar' }], 'campanha', 3, '2026-10-09');
  assert.equal(r.total.enviadas, 4);
  assert.equal(r.taxaResposta, 25);
  assert.deepEqual(r.intencoes, { quer_agendar: 1 });
});

test('paraCSV: ; e BOM, aspas, quebra de linha e fórmula neutralizada', () => {
  const csv = paraCSV([{ nome: 'Maria; "Cida"', corpo: 'linha 1\nlinha 2', resposta: '=HYPERLINK("x")', tipo: 'posvenda', status: 'enviado', enviar_em: '2026-10-09T12:30:00Z' }], COLUNAS_CSV_ENVIOS);
  assert.ok(csv.startsWith('﻿Programada para;Enviada em;Tipo'));
  const linha = csv.split('\r\n')[1];
  assert.ok(linha.startsWith('09/10/2026 09:30;;Pós-venda;enviado;"Maria; ""Cida"""'));
  assert.ok(linha.includes('"linha 1\nlinha 2"'));
  assert.ok(linha.includes(`"'=HYPERLINK(""x"")"`));
});

test('montarAniversarios: próximos 30 dias e atendidos sem data', async () => {
  const r = await montarAniversarios(
    [{ id: 'a', nome: 'Ana', nascimento: '1990-10-12' }, { id: 'b', nome: 'Beto', nascimento: '1904-10-09' }, { id: 'c', nome: 'Caio', nascimento: '1980-01-01' }],
    100, [{ cliente_id: 'a' }, { cliente_id: 'x' }, { cliente_id: 'x' }, { cliente_id: 'y' }], '2026-10-09',
    async (ids) => ids.map((id) => ({ id, nome: id.toUpperCase() })),
  );
  assert.deepEqual(r.proximos.map((p) => [p.nome, p.em_dias]), [['Beto', 0], ['Ana', 3]]);
  assert.deepEqual(r.semDataRecentes.map((c) => c.id), ['x', 'y']);
  assert.equal(r.comData, 3);
});
