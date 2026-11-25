// Rodada 17: o fluxo real "conversa -> Agendar -> confirmação". O visual é provado por scripts/roteiro-r17.mjs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const R17 = require('../public/r17-regras.js');
const PUB = join(__dirname, '..', 'public');
const ler = (f) => readFileSync(join(PUB, f), 'utf8');

test('horarioTexto: dia da semana certo, data e "às" na hora', () => {
  assert.equal(R17.horarioTexto('2026-11-26', '09:00'), 'quinta-feira, 26/11, às 09:00');
  assert.equal(R17.horarioTexto('2026-11-28', '8:30'), 'sábado, 28/11, às 08:30');
  assert.equal(R17.horarioTexto('2026-11-29', '10:00:00'), 'domingo, 29/11, às 10:00');
  assert.equal(R17.horarioTexto('2026-12-01', ''), 'terça-feira, 01/12');
  assert.equal(R17.horarioTexto('', '09:00'), '');
  assert.equal(R17.horarioTexto('26/11/2026', '09:00'), '');
});

test('horarioTexto: o dia da semana não depende do fuso de quem abre', () => {
  const antes = process.env.TZ;
  try { process.env.TZ = 'Pacific/Kiritimati'; assert.match(R17.horarioTexto('2026-11-26', '23:30'), /^quinta-feira/); }
  finally { if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes; }
});

test('variaveisCruas: acha só as variáveis do app, sem repetir', () => {
  assert.deepEqual(R17.variaveisCruas('Te esperamos com o Gol ({placa}) {placa} {horario}'), ['placa', 'horario']);
  assert.deepEqual(R17.variaveisCruas('Olá, Camila! Promoção {imperdível} {abc}'), []);
  assert.deepEqual(R17.variaveisCruas(''), []);
  assert.deepEqual(R17.variaveisCruas(null), []);
});

test('avisoAgendado: diz quando ficou e o próximo passo, sem "lead"', () => {
  const t = R17.avisoAgendado('2026-11-26', '09:00');
  assert.equal(t, '📅 Agendado para qui 26/11 às 09:00. A confirmação está no campo: revise e envie.');
  assert.ok(!/lead/i.test(t));
  assert.match(R17.avisoAgendado('2026-11-26', '09:00', { temConfirmacao: false }), /Já está na Agenda/);
  assert.equal(R17.avisoAgendado('', ''), '📅 Agendado. A confirmação está no campo: revise e envie.');
});

test('página e service worker carregam r17 (cache v29), regras antes do app.js', () => {
  const html = ler('index.html'), sw = ler('sw.js');
  assert.match(html, /href="r17\.css"/);
  assert.ok(html.indexOf('src="r17-regras.js"') > 0 && html.indexOf('src="r17-regras.js"') < html.indexOf('src="app.js"'));
  assert.match(sw, /'r17\.css'/); assert.match(sw, /'r17-regras\.js'/); assert.match(sw, /indycar-atendimento-v29/);
});

test('Agendar: reaproveita o lead quando o horário falhou (não duplica no CRM) e diz o que fazer', () => {
  const js = ler('app.js');
  const bloco = js.slice(js.indexOf("$('#formAgendar').addEventListener('submit'"), js.indexOf('/* ====', js.indexOf("$('#formAgendar').addEventListener('submit'")));
  assert.match(bloco, /agendarLeadPendente\?\.conv === conversaAtual\.id/);
  assert.match(bloco, /pend \? \{ data: pend, error: null \} : await sb\.from\('leads'\)\.insert/);
  assert.ok(bloco.indexOf('agendarLeadPendente = null') > bloco.indexOf("from('agendamentos')"), 'só esquece o lead depois do horário gravar');
  assert.match(bloco, /Toque em Confirmar de novo/);
  assert.match(bloco, /carro: carroEsc, placa: placaEsc/, 'a confirmação usa o carro e a placa digitados');
  assert.match(bloco, /R17\.horarioTexto\(dataEsc, horaEsc\)/);
  assert.ok(!/Lead criado/.test(bloco));
});

test('Enviar: {variável} sem trocar avisa uma vez e o segundo toque manda', () => {
  const js = ler('app.js');
  const f = js.slice(js.indexOf('async function enviarMensagem()'), js.indexOf('await entregarMensagem(conv, texto);'));
  assert.match(f, /R17\.variaveisCruas\(texto\)/);
  assert.match(f, /enviarCruaOk !== texto/);
  assert.ok(f.indexOf('variaveisCruas') < f.indexOf("campo.value = ''"), 'o texto fica no campo quando avisa');
});

test('r17.css: botão Confirmar preso no pé, sem borda grossa de um lado', () => {
  const css = ler('r17.css');
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(css, /#formAgendar button\[type="submit"\]\{position:sticky;bottom:/);
  assert.ok(!/border-left:\s*[3-9]px/.test(css));
});
