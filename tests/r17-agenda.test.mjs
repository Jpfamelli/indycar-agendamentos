// Rodada 17 da Agenda: o fluxo "mensagem no Atendimento → Novo agendamento → salvo" com menos toques e menos espera.
// O roteiro de navegador (service worker ligado, duas visitas, 1440 e 375) está em scripts/qa-r17-fluxo.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../public/planejamento.js';
const P = globalThis.Planejamento;
const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = ler('public/app.js'), r6c = ler('public/rodada6c.js'), css = ler('public/rodada13.css');

test('novo agendamento nasce na próxima meia hora, não às 09:00 que já passou', () => {
  const qua = '2026-11-25';                                      // quarta-feira
  assert.deepEqual(P.inicioDoNovo({ data: qua, min: 2 * 60 }), { data: qua, hora: '09:00' });           // madrugada
  assert.deepEqual(P.inicioDoNovo({ data: qua, min: 8 * 60 + 40 }), { data: qua, hora: '09:00' });      // antes das 8h45
  assert.deepEqual(P.inicioDoNovo({ data: qua, min: 14 * 60 + 3 }), { data: qua, hora: '14:30' });      // à tarde
  assert.deepEqual(P.inicioDoNovo({ data: qua, min: 14 * 60 + 20 }), { data: qua, hora: '15:00' });     // 15 min de folga
  assert.deepEqual(P.inicioDoNovo({ data: qua, min: 17 * 60 + 10 }), { data: qua, hora: '17:30' });     // último horário
  assert.deepEqual(P.inicioDoNovo({ data: qua, min: 17 * 60 + 20 }), { data: '2026-11-26', hora: '09:00' }); // fechou: amanhã
  assert.deepEqual(P.inicioDoNovo({ data: '2026-11-28', min: 18 * 60 }), { data: '2026-11-30', hora: '09:00' }); // sábado à noite: segunda
  assert.deepEqual(P.inicioDoNovo({ data: '2026-11-29', min: 10 * 60 }), { data: '2026-11-30', hora: '09:00' }); // domingo: segunda
  assert.equal(P.inicioDoNovo(null).hora, '09:00');
});

test('horário que já passou é reconhecido (só hoje, com folga de 10 min)', () => {
  const agora = { data: '2026-11-25', min: 14 * 60 };
  assert.equal(P.horarioJaPassou('2026-11-25', '09:00', agora), true);
  assert.equal(P.horarioJaPassou('2026-11-25', '13:55', agora), false);   // acabou de chegar: não avisa
  assert.equal(P.horarioJaPassou('2026-11-24', '16:00', agora), true);
  assert.equal(P.horarioJaPassou('2026-11-26', '08:00', agora), false);
  assert.equal(P.horarioJaPassou('', '08:00', agora), false);
});

test('o formulário usa a hora padrão nova e avisa horário passado (sem bloquear, e na edição só se mexer)', () => {
  assert.match(app, /const inicio = P\.inicioDoNovo\(agoraSP\(\)\);/);
  assert.match(app, /data:\(diaDoQuadro \|\| inicio\.data\)/);
  assert.match(app, /const mexeu = !id \|\| d !== a\.data/);
  assert.match(app, /P\.horarioJaPassou\(d, h, agoraSP\(\)\)/);
  assert.match(app, /'Esse horário de hoje já passou\.'/);
});

test('veio com o cliente: sem "Marcar rápido" e o foco vai para o Serviço', () => {
  assert.match(r6c, /const comCliente = !!\(pre && \(pre\.telefone \|\| pre\.cliente_nome \|\| pre\.cliente_id\)\);/);
  assert.match(r6c, /if \(box && !id && !comCliente\)/);
  assert.match(app, /if \(!id && a\.cliente_nome && !a\.servico\) setTimeout\(\(\) => \{ if \(modalAberto\(\)\) \$\('#f_serv'\)\?\.focus\(\); \}, 60\)/);
});

test('link do Atendimento: ficha e serviços pedidos junto com a tela, formulário sem esperar o Início', () => {
  const m = app.match(/async function abrirApp\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(m, /const pAbrir = entrada && !entrada\.agendamento \? pedirAbrir\(entrada\) : null;/);
  assert.match(m, /servicosDoCadastro\(\);/);
  assert.ok(m.indexOf('await abrirEntrada(entrada, pAbrir)') < m.lastIndexOf('await pRota'), 'o formulário abre antes de esperar o Início');
  assert.match(app, /async function abrirEntrada\(e, pronto = null\)/);
  assert.match(app, /const r = await \(pronto \|\| pedirAbrir\(e\)\);/);
  assert.match(app, /const servicos = await servicosDoCadastro\(\);/);
  assert.match(app, /ate: Date\.now\(\) \+ 60_000/);
});

test('rodapé das janelas preso embaixo e recado acima dele', () => {
  assert.match(css, /\.modal-foot\{position:sticky;bottom:-40px;z-index:2;background:var\(--modal-2\)/);
  assert.match(css, /body:has\(\.modal-overlay\.open\) \.toast\{bottom:96px\}/);
  assert.match(ler('public/styles.css'), /\.modal-overlay\{[^}]*padding:40px 16px/);   // o -40px depende deste respiro
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});

test('o recado do Salvar diz quem e quando', () => {
  assert.match(app, /`Agendamento salvo: \$\{payload\.cliente_nome\}, \$\{rotuloDia\(payload\.data, agoraSP\(\)\.data\)\.toLowerCase\(\)\} às \$\{payload\.hora\}`/);
});

test('cache do service worker subiu para v45 ou mais', () => {
  assert.match(ler('public/sw.js'), /indycar-agenda-v(4[5-9]|[5-9]\d)/);
});
