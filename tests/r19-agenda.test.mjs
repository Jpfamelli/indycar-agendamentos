// Rodada 19 da Agenda: encaixe de última hora (próximas vagas no Início), o dia de amanhã listado, o Remarcar que diz
// para onde vai e o Quadro no celular (o dia inteiro numa coluna, horas vazias que já passaram recolhidas).
// O roteiro de navegador (relógio parado às 13h20, service worker ligado, 375 e 1440) está em scripts/qa-r19-fluxo.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../public/planejamento.js';
const P = globalThis.Planejamento;
const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = ler('public/app.js'), r6b = ler('public/rodada6b.js'), css = ler('public/rodada13.css');
const SLOTS = []; for (let t = 480; t <= 1020; t += 30) SLOTS.push(t);          // 08:00 a 17:00, como no Quadro

test('Quadro no celular: horas vazias que já passaram viram uma faixa só', () => {
  const plano = P.recolherPassado(SLOTS, () => false, 13 * 60 + 20);
  assert.deepEqual(plano[0], { tipo: 'faixa', de: 480, ate: 780, n: 10 });      // 08:00 às 13:00
  assert.deepEqual(plano[1], { tipo: 'linha', t: 780 });                        // 13:00 é a linha de agora: fica
  assert.equal(plano.length, 1 + 9);
  assert.equal(plano.filter((x) => x.tipo === 'linha').length, 9);
});

test('Quadro no celular: linha com cartão ou serviço em andamento nunca é recolhida', () => {
  const ocupadas = new Set([540, 570, 660]);                                     // 09:00, 09:30 e 11:00
  const plano = P.recolherPassado(SLOTS, (t) => ocupadas.has(t), 13 * 60 + 20);
  assert.deepEqual(plano.slice(0, 7), [
    { tipo: 'faixa', de: 480, ate: 540, n: 2 }, { tipo: 'linha', t: 540 }, { tipo: 'linha', t: 570 },
    { tipo: 'faixa', de: 600, ate: 660, n: 2 }, { tipo: 'linha', t: 660 },
    { tipo: 'faixa', de: 690, ate: 780, n: 3 }, { tipo: 'linha', t: 780 },
  ]);
  // toda meia hora aparece uma vez só: como linha ou dentro de uma faixa
  const cobertas = plano.reduce((s, x) => s + (x.tipo === 'faixa' ? x.n : 1), 0);
  assert.equal(cobertas, SLOTS.length);
});

test('Quadro no celular: uma linha vazia sozinha não vira faixa, e nada some antes de abrir nem em relógio inválido', () => {
  const plano = P.recolherPassado(SLOTS, (t) => t !== 510, 13 * 60);            // só 08:30 vazia
  assert.ok(plano.every((x) => x.tipo === 'linha'));
  assert.ok(P.recolherPassado(SLOTS, () => false, 7 * 60).every((x) => x.tipo === 'linha'));      // antes de abrir
  assert.ok(P.recolherPassado(SLOTS, () => false, 8 * 60 + 29).every((x) => x.tipo === 'linha')); // 08:00 ainda é agora
  assert.ok(P.recolherPassado(SLOTS, () => false, NaN).every((x) => x.tipo === 'linha'));
  assert.ok(P.recolherPassado(SLOTS, () => false, undefined).every((x) => x.tipo === 'linha'));
  assert.deepEqual(P.recolherPassado([], () => false, 600), []);
  // depois de fechar, o dia vazio inteiro é uma faixa
  assert.deepEqual(P.recolherPassado(SLOTS, () => false, 19 * 60), [{ tipo: 'faixa', de: 480, ate: 1050, n: 19 }]);
});

test('Remarcar: o destino só existe com dia e hora válidos e diferentes do horário atual', () => {
  const atual = { data: '2026-11-25', hora: '14:00:00' };
  assert.deepEqual(P.destinoDoRemarcar(atual, { data: '2026-11-26', hora: '09:00' }), { data: '2026-11-26', hora: '09:00' });
  assert.deepEqual(P.destinoDoRemarcar(atual, { data: '2026-11-25', hora: '15:30' }), { data: '2026-11-25', hora: '15:30' });
  assert.equal(P.destinoDoRemarcar(atual, { data: '2026-11-25', hora: '14:00' }), null);      // o mesmo de agora
  assert.equal(P.destinoDoRemarcar(atual, { data: '', hora: '09:00' }), null);
  assert.equal(P.destinoDoRemarcar(atual, { data: '2026-11-26', hora: '' }), null);
  assert.equal(P.destinoDoRemarcar(atual, { data: '26/11/2026', hora: '09:00' }), null);
  assert.equal(P.destinoDoRemarcar(atual, null), null);
  assert.deepEqual(P.destinoDoRemarcar(null, { data: '2026-11-26', hora: '09:00:00' }), { data: '2026-11-26', hora: '09:00' });
});

test('Remarcar: o botão diz para onde vai e acompanha data, hora, atalho e grade', () => {
  assert.match(app, /P\.destinoDoRemarcar\(a, \{ data: \$\('#r_data'\)\.value, hora: \$\('#r_hora'\)\.value \}\)/);
  assert.match(app, /Remarcar para \$\{esc\(rotuloDia\(para\.data, agoraSP\(\)\.data\)/);
  assert.match(app, /const escolher = \(s\) => \{[^\n]*rotular\(\); \};/);
  assert.match(app, /\$\('#r_data'\)\.addEventListener\('change', \(\) => \{[^\n]*rotular\(\); \}\);/);
  assert.match(app, /\$\('#r_hora'\)\.addEventListener\('input', rotular\)/);
  // quem salva continua barrando o mesmo horário
  assert.match(app, /É o mesmo horário de agora, escolha outro/);
});

test('Início: próximas vagas limpas (sem repetir, sem lixo, no máximo 3)', () => {
  const s = [{ data: '2026-11-25', hora: '15:00', livres: 1 }, { data: '2026-11-25', hora: '15:00:00' }, { data: 'x', hora: '09:00' }, null,
    { data: '2026-11-25', hora: '16:30' }, { data: '2026-11-26', hora: '08:00' }, { data: '2026-11-26', hora: '09:30' }];
  assert.deepEqual(P.vagasDoEncaixe(s), [{ data: '2026-11-25', hora: '15:00' }, { data: '2026-11-25', hora: '16:30' }, { data: '2026-11-26', hora: '08:00' }]);
  assert.deepEqual(P.vagasDoEncaixe(s, 1), [{ data: '2026-11-25', hora: '15:00' }]);
  assert.deepEqual(P.vagasDoEncaixe(null), []);
  assert.deepEqual(P.vagasDoEncaixe(undefined), []);
});

test('Início: as vagas vêm do mesmo serviço do formulário, abrem o Novo agendamento e não travam a tela', () => {
  assert.match(app, /<div class="r19-vagas" id="r19Vagas" hidden><\/div>/);
  assert.match(app, /api\('GET', '\/horarios-livres\?data=' \+ encodeURIComponent\(agoraSP\(\)\.data\), null, \{ repetir: false \}\)/);
  assert.match(app, /openAgendamentoModal\(null, \{ data: b\.dataset\.data, hora: b\.dataset\.hora \}\)/);
  assert.match(app, /if \(!box \|\| emPresenca\(\)\) return;/);                 // a recepção (modo presença) não marca
  assert.match(app, /const esquecerDias = \(\) => \{ _doDia\.clear\(\); _vagas = null; \};/);   // quem grava esquece as vagas
  assert.match(app, /Sem vaga nos próximos 14 dias/);                           // sem dado, diz que não tem
  assert.match(app, /window\.R6\?\.inicio\(d\);[^\n]*\n\s*pintarVagas\(\);/);
});

test('Início: a faixa de amanhã lista os horários do dia e abre o horário ao tocar', () => {
  assert.match(r6b, /class="r19-amanha"/);
  assert.match(r6b, /data-r19-ag="\$\{esc\(i\.id\)\}"/);
  assert.match(r6b, /openAgendamentoModal\(b\.dataset\.r19Ag\)/);
  assert.match(r6b, /const MAX = 8;/);
  assert.match(r6b, /e mais \$\{doDia\.length - MAX\}, veja no Quadro\./);
  // servidor de verdade e de mentira mandam o serviço e a situação de cada horário
  assert.match(ler('dados.js'), /cliente_nome: a\.cliente_nome, servico: a\.servico \|\| '', status: a\.status,\s*\n\s*situacao: situacaoDoLembrete/);
  assert.equal((ler('scripts/mock-server.mjs').match(/servico: a\.servico \|\| "", status: a\.status, situacao: lembSit\(a\)/g) || []).length, 2);
  // o lote de lembretes segue com a confirmação e com a contagem de antes
  assert.match(r6b, /Mandar o lembrete para \$\{faltam === 1 \? '1 cliente' : faltam \+ ' clientes'\}/);
});

test('Quadro no celular: abre em "Todos", conta os horários de cada pílula e mover mantém o consultor', () => {
  assert.match(r6b, /const TODOS = '\*';/);
  assert.match(r6b, /_q\.foco = cols\.length > 1 \? TODOS : \(cols\[0\]\?\.id \|\| ''\)/);
  assert.match(r6b, /const todos = mobile && _q\.foco === TODOS;/);
  assert.match(r6b, /const consDoAlvo = \(cel, a\) => \(emTodos\(\) \? \(\(a && a\.consultor_id\) \|\| ''\) : cel\.dataset\.cons\);/);
  assert.equal((r6b.match(/moverPara\(a, Number\(cel\.dataset\.slot\), consDoAlvo\(cel, a\) \|\| null\)/g) || []).length, 2);
  assert.doesNotMatch(r6b, /moverPara\(a, Number\(cel\.dataset\.slot\), cel\.dataset\.cons \|\| null\)/);
  assert.match(r6b, /pilula\(TODOS, 'Todos', vis\.length\)/);
  // recolher: só no celular, só hoje, nunca enquanto se move um cartão; tocar mostra as horas
  assert.match(r6b, /const recolher = mobile && hojeFlag && !_q\.movendo && _q\.passadoAberto !== d\.data;/);
  assert.match(r6b, /P\.recolherPassado\(SLOTS, ocupada, agora\.min, \{ passo: PASSO \}\)/);
  assert.match(r6b, /\$\$\('\[data-qd-rec\]', host\)/);
  assert.match(r6b, /if \(\$\('#qdCorpo \[data-qd-rec\]'\) && _q\.dados\) desenhar\(_q\.dados\);/);
});

test('CSS da rodada: toques de 44 px, sem borda grossa de um lado só e [hidden] por último', () => {
  assert.match(css, /\.r19-vaga\{[^}]*min-height:48px/);
  assert.match(css, /\.r19-ag\{[^}]*min-height:54px/);
  assert.match(css, /\.qd-rec-b\{[^}]*min-height:44px/);
  assert.match(css, /\.modal-body \.grid2:has\(#r_data\)\{grid-template-columns:minmax\(0,1\.15fr\) minmax\(0,\.85fr\)/);
  assert.doesNotMatch(css, /border-left:\s*[3-9]px/);
  assert.ok(css.trimEnd().endsWith('[hidden]{display:none!important}'));
});

test('cache do service worker subiu para v46 ou mais', () => {
  assert.match(ler('public/sw.js'), /indycar-agenda-v(4[6-9]|[5-9]\d)/);
});
