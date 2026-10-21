// Agenda (rodada 6 / C1c, lote 4): regras puras de public/rodada6d.js lidas de verdade num sandbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ globalThis: null, URL });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada6d.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R6dPuro;
const arr = (v) => JSON.parse(JSON.stringify(v));
const apps = (href) => (/indycar-patio\.netlify\.app/.test(href) ? 'patio' : /\/crm/.test(href) ? 'crm' : /orcador/.test(href) ? 'orcador' : null);

test('nomeDaAba: WhatsApp e apps do ecossistema têm aba nomeada; o resto não', () => {
  assert.equal(P.nomeDaAba('https://wa.me/5512991821234?text=oi', apps), 'indycar-whatsapp');
  assert.equal(P.nomeDaAba('https://api.whatsapp.com/send?phone=1', apps), 'indycar-whatsapp');
  assert.equal(P.nomeDaAba('https://indycar-patio.netlify.app/?os=1', apps), 'indycar-patio');
  assert.equal(P.nomeDaAba('https://x.com/crm?lead=1', apps), 'indycar-crm');
  assert.equal(P.nomeDaAba('https://calendar.google.com/x', apps), null);
  assert.equal(P.nomeDaAba('https://wa.me.falso.com/55', apps), null, 'host parecido não vale');
  assert.equal(P.nomeDaAba('https://falso.com/wa.me/55', apps), null);
});
test('nomeDaAba: esquemas perigosos e lixo viram null (nada de javascript:)', () => {
  for (const ruim of ['javascript:alert(1)', 'data:text/html,<b>', 'file:///c:/x', '', null, undefined, 'http://']) assert.equal(P.nomeDaAba(ruim, apps), null, String(ruim));
  assert.equal(P.nomeDaAba('https://wa.me/55', undefined), 'indycar-whatsapp', 'sem o catálogo de apps, WhatsApp ainda vale');
});
test('chaveDoCliente: telefone sem 55 vence; sem telefone usa a placa; sem nada é vazio', () => {
  assert.equal(P.chaveDoCliente({ telefone: '5512991821234' }), 't12991821234');
  assert.equal(P.chaveDoCliente({ telefone: '(12) 99182-1234' }), 't12991821234');
  assert.equal(P.chaveDoCliente({ telefone: '123', placa: 'abc-1d23' }), 'pABC1D23');
  assert.equal(P.chaveDoCliente({ telefone: '', placa: 'AB' }), '');
  assert.equal(P.chaveDoCliente(null), '');
});
test('mesmosDoCliente: acha os outros horários da pessoa, ignora cancelados e o próprio', () => {
  const lista = [
    { id: 'a', telefone: '12991821234', status: 'aguardando' }, { id: 'b', telefone: '5512991821234', status: 'confirmado' },
    { id: 'c', telefone: '12991821234', status: 'cancelado' }, { id: 'd', telefone: '12988887777', status: 'aguardando' }, { id: 'e', placa: 'ABC1D23', status: 'aguardando' }, { id: 'f', placa: 'abc-1d23', status: 'aguardando' },
  ];
  assert.deepEqual(arr(P.mesmosDoCliente(lista, 'a').slice().sort()), ['b']);
  assert.deepEqual(arr(P.mesmosDoCliente(lista, 'e')), ['f']);
  assert.deepEqual(arr(P.mesmosDoCliente(lista, 'd')), []);
  assert.deepEqual(arr(P.mesmosDoCliente(lista, 'nao-existe')), []);
  assert.deepEqual(arr(P.mesmosDoCliente(null, 'a')), []);
});
test('mensagemPronto: cita nome e carro, e não vaza undefined', () => {
  assert.equal(P.mensagemPronto({ cliente_nome: 'ANA souza', veiculo: 'Onix', placa: 'ABC1D23' }), 'Oi Ana! Seu Onix ABC1D23 está pronto aqui na IndyCar. Pode passar para retirar até as 17h30?');
  assert.match(P.mensagemPronto({}), /^Olá! Seu carro está pronto/);
  assert.doesNotMatch(P.mensagemPronto({ cliente_nome: '<script>' }), /[<>]/);
});
test('linkWhatsApp: só números válidos, texto codificado e cortado', () => {
  assert.equal(P.linkWhatsApp('12991821234', 'a b'), 'https://wa.me/5512991821234?text=a%20b');
  assert.equal(P.linkWhatsApp('5512991821234', ''), 'https://wa.me/5512991821234?text=');
  assert.equal(P.linkWhatsApp('991821234', 'x'), null);
  assert.ok(P.linkWhatsApp('12991821234', 'x'.repeat(5000)).length < 3000);
});
test('paraRepetir: leva o cliente, o carro e o serviço; não leva dia, hora, status nem observações', () => {
  const o = P.paraRepetir({ id: 'x', cliente_nome: 'Ana', telefone: '12991821234', veiculo: 'Onix', placa: 'ABC1D23', servico: 'Freios', data: '2026-10-22', hora: '09:00', status: 'concluido', observacoes: 'segredo', cliente_id: 'c1', consultor_id: 'k1', origem: 'Google' }, ['Google', 'Telefone']);
  assert.deepEqual(JSON.parse(JSON.stringify(o)), { cliente_nome: 'Ana', telefone: '12991821234', veiculo: 'Onix', placa: 'ABC1D23', servico: 'Freios', cliente_id: 'c1', consultor_id: 'k1', origem: 'Google' });
  assert.equal(P.paraRepetir({ origem: 'Inventada' }, ['Google']).origem, undefined, 'origem que não existe na lista é descartada');
  assert.deepEqual(JSON.parse(JSON.stringify(P.paraRepetir(null))), {});
});
