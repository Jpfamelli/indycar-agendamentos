// Rodada 5 — horários livres como serviço (horarios.js, puro) + as funções puras
// novas de dados.js (espera que cabe, aniversariantes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPEDIENTE, duracaoDoServico, janelasDoServico, diasDaJanela, livresDoDia, proximosDias, resumoDoDia, lerParametros, normalizar,
} from '../horarios.js';
import { esperaQueCabe, aniversariantes } from '../dados.js';

const C1 = '20000000-0000-4000-8000-000000000101', C2 = '20000000-0000-4000-8000-000000000102';
const SERVICOS = [{ nome: 'Troca de óleo', duracao_min: 40 }, { nome: 'Troca de Óleo de Câmbio', duracao_min: 120 }, { nome: 'Revisão de Motor', duracao_min: 360 }, { nome: 'Freios', duracao_min: 90 }];
const JANELAS = [
  { tipo_servico: 'Troca de óleo do motor e filtros', dias: 'seg-sex', inicio: '08:00:00', fim: '11:00:00' },
  { tipo_servico: 'Troca de óleo do motor e filtros', dias: 'seg-sex', inicio: '14:00:00', fim: '17:00:00' },
  { tipo_servico: 'Troca de óleo do motor e filtros', dias: 'sabado', inicio: '08:00:00', fim: '11:00:00' },
  { tipo_servico: 'Pneus, alinhamento e balanceamento', dias: 'seg-sex', inicio: '08:00:00', fim: '10:00:00' },
  { tipo_servico: 'Suspensão (barulhos e manutenção)', dias: 'sabado', inicio: '08:00:00', fim: '08:00:00' },   // faixa vazia: ignorada
];
const SEX = '2026-10-16', SAB = '2026-10-17', DOM = '2026-10-18', SEG = '2026-10-19';
const cons = [{ id: C1, nome: 'Leonardo', ativo: 1 }, { id: C2, nome: 'Gabriel', ativo: 1 }];

test('duração: cadastro (igual ou contido, o mais específico ganha), palavras-chave, 60 por padrão', () => {
  assert.equal(duracaoDoServico('troca de oleo', SERVICOS), 40);
  assert.equal(duracaoDoServico('Troca de óleo de câmbio (diálise)', SERVICOS), 120);
  assert.equal(duracaoDoServico('revisão de motor completa', SERVICOS), 360);
  assert.equal(duracaoDoServico('pastilha de freio', []), 90);
  assert.equal(duracaoDoServico('correia dentada', []), 240);
  assert.equal(duracaoDoServico('qualquer coisa', []), 60);
  assert.equal(duracaoDoServico('', SERVICOS), 60);
});

test('janelas: casam pelo tipo (sem acento, palavra em comum) e pelo dia; faixa vazia some; sem janela = []', () => {
  assert.deepEqual(janelasDoServico('Troca de óleo', JANELAS, 5), [{ inicio: '08:00', fim: '11:00' }, { inicio: '14:00', fim: '17:00' }]);
  assert.deepEqual(janelasDoServico('troca de oleo', JANELAS, 6), [{ inicio: '08:00', fim: '11:00' }]);
  assert.deepEqual(janelasDoServico('Alinhamento 3D', JANELAS, 2), [{ inicio: '08:00', fim: '10:00' }]);
  assert.deepEqual(janelasDoServico('Alinhamento 3D', JANELAS, 6), []);          // sábado não tem janela de pneus
  assert.deepEqual(janelasDoServico('Suspensão', JANELAS, 6), []);               // faixa 08:00–08:00 é vazia
  assert.deepEqual(janelasDoServico('Embreagem', JANELAS, 1), []);
  assert.deepEqual(diasDaJanela('seg-sab'), [1, 2, 3, 4, 5, 6]); assert.deepEqual(diasDaJanela('todos'), [0, 1, 2, 3, 4, 5, 6]); assert.deepEqual(diasDaJanela('domingo'), [0]);
  assert.equal(normalizar('Óleo, Câmbio!'), 'oleo cambio');
});

test('livresDoDia: domingo fecha, dia passado não vale, consultor inativo recusa', () => {
  assert.equal(livresDoDia({ data: DOM, consultores: cons }).motivo, 'domingo');
  assert.equal(livresDoDia({ data: SEX, agora: { data: SAB, min: 600 }, consultores: cons }).motivo, 'passou');
  assert.equal(livresDoDia({ data: SAB, consultores: cons, consultor_id: '20000000-0000-4000-8000-000000000999' }).motivo, 'consultor_inativo');
  assert.equal(livresDoDia({ data: 'lixo' }).motivo, 'data_invalida');
});

test('livresDoDia: 8h às 17h30 em passos de 30 min, o serviço tem de caber, hoje só daqui a 30 min', () => {
  const d = livresDoDia({ data: SAB, consultores: cons, duracao: 60 });
  assert.equal(d.aberto, true);
  assert.equal(d.horarios[0].hora, '08:00'); assert.equal(d.horarios.at(-1).hora, '16:30');   // 16:30 + 60 = 17:30 cabe; 17:00 não
  assert.equal(d.horarios.length, 18); assert.equal(d.capacidade, 2);
  const curto = livresDoDia({ data: SAB, consultores: cons, duracao: 30 });
  assert.equal(curto.horarios.at(-1).hora, '17:00');
  const longo = livresDoDia({ data: SAB, consultores: cons, duracao: 360 });
  assert.equal(longo.horarios.at(-1).hora, '11:30');
  // hoje 9:50 → só a partir de 10:30 (9:50 + 30 = 10:20 → próxima casa)
  const hoje = livresDoDia({ data: SAB, agora: { data: SAB, min: 9 * 60 + 50 }, consultores: cons, duracao: 30 });
  assert.equal(hoje.horarios[0].hora, '10:30');
  // tarde demais: encerrado
  assert.equal(livresDoDia({ data: SAB, agora: { data: SAB, min: 17 * 60 + 15 }, consultores: cons, duracao: 30 }).motivo, 'encerrado');
});

test('livresDoDia: ocupação por consultor e capacidade da recepção; quem não ocupa (cancelado, ignorado) não conta', () => {
  const ags = [
    { id: 'a', data: SAB, hora: '08:00', status: 'confirmado', consultor_id: C1 },
    { id: 'b', data: SAB, hora: '08:10', status: 'aguardando', consultor_id: C2 },     // mesma meia hora: recepção lotada (2/2)
    { id: 'c', data: SAB, hora: '09:00', status: 'cancelado', consultor_id: C1 },      // não ocupa
    { id: 'd', data: SAB, hora: '10:00', status: 'compareceu', consultor_id: null },   // ocupa a recepção, sem consultor
    { id: 'e', data: SAB, hora: '11:00', status: 'confirmado', consultor_id: C1 },
    { id: 'x', data: SEG, hora: '08:00', status: 'confirmado', consultor_id: C1 },     // outro dia: ignorado
  ];
  const d = livresDoDia({ data: SAB, consultores: cons, duracao: 30, agendamentos: ags });
  const h = Object.fromEntries(d.horarios.map((x) => [x.hora, x]));
  assert.equal(h['08:00'], undefined, '08:00 lotado');
  assert.deepEqual(h['09:00'].consultores_livres, [C1, C2]);
  assert.equal(h['10:00'].livres, 1); assert.deepEqual(h['10:00'].consultores_livres, [C1, C2]);
  assert.deepEqual(h['11:00'].consultores_livres, [C2]); assert.equal(h['11:00'].livres, 1);
  // só o Leonardo: 08:00 e 11:00 somem
  const so = livresDoDia({ data: SAB, consultores: cons, duracao: 30, agendamentos: ags, consultor_id: C1 });
  const horas = so.horarios.map((x) => x.hora);
  assert.ok(!horas.includes('08:00') && !horas.includes('11:00') && horas.includes('09:00'));
  assert.deepEqual(so.horarios[0].consultores_livres, [C1]);
  // ignorar o próprio (remarcar): 11:00 volta para o Leonardo
  const ign = livresDoDia({ data: SAB, consultores: cons, duracao: 30, agendamentos: ags, consultor_id: C1, ignorar: 'e' });
  assert.ok(ign.horarios.some((x) => x.hora === '11:00'));
  // sem consultor cadastrado: capacidade 1
  const semCons = livresDoDia({ data: SAB, consultores: [], duracao: 30, agendamentos: [{ id: 'z', data: SAB, hora: '08:00', status: 'confirmado' }] });
  assert.equal(semCons.capacidade, 1); assert.equal(semCons.horarios[0].hora, '08:30');
});

test('livresDoDia: janelas limitam o horário de chegada; fora de todas = fora_da_janela', () => {
  const jan = janelasDoServico('Troca de óleo', JANELAS, 6);     // sábado 08–11
  const d = livresDoDia({ data: SAB, consultores: cons, duracao: 40, janelas: jan });
  assert.equal(d.horarios[0].hora, '08:00'); assert.equal(d.horarios.at(-1).hora, '11:00');
  assert.ok(d.horarios.every((x) => x.hora <= '11:00'));
  const tarde = livresDoDia({ data: SAB, agora: { data: SAB, min: 12 * 60 }, consultores: cons, duracao: 40, janelas: jan });
  assert.equal(tarde.horarios.length, 0); assert.equal(tarde.motivo, 'fora_da_janela');
});

test('proximosDias: pula domingo, para ao achar N dias com vaga, respeita janela por dia da semana', () => {
  const dias = proximosDias({ desde: SEX, agora: { data: SEX, min: 8 * 60 }, dias: 10, quantosDias: 3, consultores: cons, duracao: 40,
    janelasPorDia: (dow) => janelasDoServico('Troca de óleo', JANELAS, dow), porDia: () => [] });
  assert.deepEqual(dias.map((d) => d.data), [SEX, SAB, SEG]);
  assert.equal(dias[1].janelas.length, 1); assert.equal(dias[0].janelas.length, 2);
  assert.ok(proximosDias({ desde: 'x' }).length === 0);
});

test('resumoDoDia e lerParametros', () => {
  const d = livresDoDia({ data: SAB, consultores: cons, duracao: 30 });
  assert.match(resumoDoDia(d, 3), /^sáb 17\/10: 08:00, 08:30, 09:00 \(\+\d+\)$/);
  assert.equal(resumoDoDia(livresDoDia({ data: DOM })), 'dom 18/10: a oficina não abre');
  const q = lerParametros(new URLSearchParams('data=2026-10-17&servico=Troca%20de%20%C3%B3leo&consultor_id=' + C1 + '&dias=99'));
  assert.deepEqual(q, { data: SAB, servico: 'Troca de óleo', consultor_id: C1, ignorar: null, dias: 30, dataInvalida: false });
  assert.equal(lerParametros(new URLSearchParams('data=2026-13-40')).dataInvalida, true);
  assert.equal(lerParametros(new URLSearchParams('consultor_id=lixo')).consultor_id, null);
});

test('esperaQueCabe: abertas no período do dia, serviço igual primeiro, depois a mais antiga', () => {
  const l = [
    { id: 1, status: 'aberta', servico: 'Freios', de: null, ate: null, created_at: '2026-10-10' },
    { id: 2, status: 'aberta', servico: 'Troca de óleo', de: '2026-10-15', ate: '2026-10-20', created_at: '2026-10-12' },
    { id: 3, status: 'aberta', servico: 'Troca de óleo', de: '2026-10-19', ate: null, created_at: '2026-10-01' },
    { id: 4, status: 'agendada', servico: 'Troca de óleo', de: null, ate: null, created_at: '2026-10-01' },
  ];
  assert.deepEqual(esperaQueCabe(l, SAB, 'troca de óleo').map((e) => e.id), [2, 1]);
  assert.deepEqual(esperaQueCabe(l, SEG, 'Troca de Óleo').map((e) => e.id), [3, 2, 1]);
  assert.deepEqual(esperaQueCabe(l, SAB).map((e) => e.id), [1, 2]);
});

test('aniversariantes: hoje = 0, ignora o ano 1904 na idade, ordena pelos mais próximos', () => {
  const cl = [
    { id: 'a', nome: 'Ana', nascimento: '1904-10-18' }, { id: 'b', nome: 'Bia', nascimento: '1990-10-16' },
    { id: 'c', nome: 'Caio', nascimento: '1985-10-30' }, { id: 'd', nome: 'Duda', nascimento: '2000-01-05' }, { id: 'e', nome: 'Sem', nascimento: null },
  ];
  const r = aniversariantes(cl, SEX, 7);
  assert.deepEqual(r.map((x) => [x.id, x.em, x.idade]), [['b', 0, 36], ['a', 2, null]]);
  assert.equal(r[0].nascimento_tela, '16/10/1990'); assert.equal(r[1].nascimento_tela, '18/10');
  // virada de ano: 05/01 está a 81 dias de 16/10 → fora de 7; dentro de 90
  assert.ok(aniversariantes(cl, SEX, 90).some((x) => x.id === 'd'));
});

test('EXPEDIENTE é o da oficina', () => {
  assert.deepEqual(EXPEDIENTE, { abre: 480, fecha: 1050, passo: 30, dias: [1, 2, 3, 4, 5, 6] });
});
