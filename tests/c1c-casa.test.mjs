// Casa (rodada 6, C1c): regras puras de casa/logica3.js (WhatsApp pronto, "Bom dia") e o que adaptarAgora passa a trazer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../casa/logica.js');
await import('../casa/logica3.js');
const L = globalThis.CasaLogica, W = globalThis.CasaLogica3;

test('linkWhatsApp: aceita 55DDDNÚMERO, DDDNÚMERO e máscara; recusa lixo; codifica o texto', () => {
  assert.equal(W.linkWhatsApp('5512991821234'), 'https://wa.me/5512991821234');
  assert.equal(W.linkWhatsApp('(12) 99182-1234'), 'https://wa.me/5512991821234');
  assert.equal(W.linkWhatsApp('1232211234', 'Oi & tchau'), 'https://wa.me/551232211234?text=Oi%20%26%20tchau');
  for (const ruim of [null, '', '123', '99182-1234', '0012991821234', 'abc']) assert.equal(W.linkWhatsApp(ruim), null, String(ruim));
  assert.ok(W.linkWhatsApp('5512991821234', 'x'.repeat(5000)).length < 3000, 'texto longo é cortado');
});
test('linkWhatsApp: nada de injeção no número (só dígitos entram na URL)', () => {
  const u = W.linkWhatsApp('5512991821234"><script>', 'a');
  assert.ok(u.startsWith('https://wa.me/55') && /^[0-9]+$/.test(u.slice('https://wa.me/'.length, u.indexOf('?'))), 'só dígitos entram no caminho da URL');
  assert.equal(u.includes('<'), false);
  assert.equal(W.linkWhatsApp('javascript:alert(1)'), null);
});
test('quando: hoje, amanhã e dia da semana com data', () => {
  assert.equal(W.quando('2026-10-21', '14:00:00', '2026-10-21'), 'hoje às 14:00');
  assert.equal(W.quando('2026-10-22', '09:30', '2026-10-21'), 'amanhã às 09:30');
  assert.equal(W.quando('2026-10-24', '08:00', '2026-10-21'), 'sábado (24/10) às 08:00');
  assert.equal(W.quando('2026-10-24', '', '2026-10-21'), 'sábado (24/10)');
});
test('mensagens: começam pelo nome, citam o carro/horário e não vazam "undefined"', () => {
  const t = W.mensagemWa('lembrar', { nome: 'ANA souza', data: '2026-10-22', hora: '14:00', servico: 'Revisão' }, { hoje: '2026-10-21' });
  assert.equal(t, 'Oi Ana! Passando para lembrar do seu horário amanhã às 14:00 na IndyCar (Revisão). Posso confirmar a sua presença?');
  assert.match(W.mensagemWa('pronto', { nome: 'Pedro', veiculo: 'HB20', placa: 'ABC1D23' }), /^Oi Pedro! Seu HB20 ABC1D23 está pronto/);
  assert.match(W.mensagemWa('pronto', {}), /^Olá! Seu carro está pronto/);
  assert.match(W.mensagemWa('orcamento', { nome: 'Lia', numero: 12 }), /orçamento #0012/);
  assert.match(W.mensagemWa('aprovado', { nome: 'Lia' }), /marcar o melhor horário/);
  assert.match(W.mensagemWa('remarcar', { nome: 'Lia' }), /remarcar/);
  for (const tipo of ['pronto', 'orcamento', 'aprovado', 'lembrar', 'remarcar']) assert.doesNotMatch(W.mensagemWa(tipo, {}, { hoje: '2026-10-21' }), /undefined|null|NaN/);
});
test('acaoDaLinha: sem telefone não há botão; com telefone o rótulo muda por tipo', () => {
  assert.equal(W.acaoDaLinha('lembrar', { cliente: 'Ana', telefone_55: null }, '2026-10-21', '2026-10-22'), null);
  const a = W.acaoDaLinha('pronto', { nome: 'Ana', telefone: '5512991821234', veiculo: 'Onix' }, '2026-10-21');
  assert.equal(a.rotulo, 'Avisar'); assert.match(a.url, /^https:\/\/wa\.me\/5512991821234\?text=/);
  assert.equal(W.acaoDaLinha('orcamento', { telefone: '5512991821234' }, 'h').rotulo, 'Cobrar');
  assert.equal(W.acaoDaLinha('aprovado', { telefone: '5512991821234' }, 'h').rotulo, 'Chamar');
});
test('resumoManha: ontem, amanhã e pendências em ordem de gravidade; valor só para o gestor', () => {
  const m = { ontem: { total: 8, vieram: 6, faltaram: 1, fechados: 4, valor: 5400, sem_baixa: 1 }, amanha: { total: 10, primeiro: '08:00', sem_confirmar: 3, sem_telefone: 1 }, patio: { prontos_desde_ontem: 2, parados_2d: 1 } };
  const g = W.resumoManha(m, { gestor: true });
  assert.match(g.ontem, /6 de 8 vieram/); assert.match(g.ontem, /4 fecharam \(R\$/); assert.match(g.ontem, /1 não veio/);
  assert.equal(W.resumoManha(m, { gestor: false }).ontem.includes('R$'), false);
  assert.match(g.amanha, /10 horários, o primeiro às 08:00 · 3 sem confirmar/);
  assert.deepEqual(g.pendencias.map((p) => p.k), ['sem_baixa', 'prontos', 'parados', 'sem_telefone', 'sem_confirmar']);
  assert.equal(g.vazio, false);
});
test('resumoManha: dia sem nada some (vazio) e singular/plural certos', () => {
  assert.equal(W.resumoManha({ ontem: { total: 0 }, amanha: { total: 0 }, patio: {} }).vazio, true);
  assert.equal(W.resumoManha(null).vazio, true);
  const r = W.resumoManha({ ontem: { total: 1, vieram: 1, fechados: 1 }, amanha: { total: 1, primeiro: '09:00', sem_confirmar: 0 }, patio: { prontos_desde_ontem: 1 } });
  assert.match(r.ontem, /1 fechou/); assert.match(r.amanha, /1 horário, o primeiro às 09:00 · todos confirmados/);
  assert.equal(r.pendencias[0].texto, '1 carro pronto esperando retirada desde ontem');
  assert.equal(W.resumoManha({ ontem: { total: -5, vieram: 'x' }, amanha: {}, patio: {} }).ontem, 'Ontem não teve horário marcado.');
});
test('adaptarAgora passa o telefone do cliente (patio, orçamentos, agenda) e os aprovados sem horário', () => {
  const d = L.adaptarAgora({
    patio: { total: 1, por_etapa: [{ etapa: 'pronto', quantidade: 1, carros: [{ id: 'o1', numero: 5, cliente: 'Ana', telefone_55: '5512991821234', veiculo: 'Onix', desde: '2026-10-21T10:00:00Z' }] }] },
    orcamentos: { esperando_total: 1, esperando: [{ id: 'q1', numero: 3, cliente: 'Bia', telefone_55: '5512988887777', veiculo: 'Gol', total: 100 }], aprovados_sem_horario_total: 1, aprovados_sem_horario: [{ id: 'q2', numero: 4, cliente: 'Caio', telefone_55: '5512977776666', total: 900, decidido_em: '2026-10-20T10:00:00Z' }] },
    agendamentos_hoje: { total: 1, itens: [{ id: 'a1', hora: '09:00', cliente: 'Duda', telefone_55: '5512966665555', status: 'aguardando' }] },
  }, {});
  assert.equal(d.patio.lista[0].telefone, '5512991821234');
  assert.equal(d.orcamentos.lista[0].telefone, '5512988887777'); assert.equal(d.orcamentos.lista[0].veiculo, 'Gol');
  assert.equal(d.orcamentos.aprovados[0].telefone, '5512977776666'); assert.equal(d.orcamentos.aprovados.length, 1);
  assert.equal(d.agenda.lista[0].telefone, '5512966665555');
  assert.deepEqual(L.adaptarAgora({}, {}).orcamentos.aprovados, []);
});
test('primeiroNome: só letras, apóstrofo e hífen; nome com HTML ou número não vira recado estranho', () => {
  assert.equal(W.primeiroNome('  JOÃO  pedro '), 'João');
  assert.equal(W.primeiroNome("d'Ávila Neto"), "D'ávila");
  assert.equal(W.primeiroNome('Ana-Clara Souza'), 'Ana-clara');
  assert.equal(W.primeiroNome('<img src=x onerror=1>'), 'Img');
  assert.equal(W.primeiroNome('12345'), '');
  assert.equal(W.primeiroNome(null), '');
  assert.match(W.mensagemWa('pronto', { nome: '12345', veiculo: 'Gol' }), /^Olá! /);
});
