// Regras puras da tela de conta (public/conta.js) rodando o CÓDIGO REAL num
// sandbox (node:vm), igual ao front.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../public/conta.js', import.meta.url), 'utf8');
function funcao(nome) {
  const ini = fonte.indexOf(`function ${nome}(`);
  if (ini < 0) throw new Error(`função ${nome} não achada em conta.js`);
  return fonte.slice(ini, fonte.indexOf('\n}', ini) + 2);
}
function constante(nome) {
  const ini = fonte.indexOf(`const ${nome} =`);
  if (ini < 0) throw new Error(`constante ${nome} não achada`);
  // rodada 5: CONTA_APPS virou uma função imediata (lê apps.js quando existe) — termina em "})();"
  const fimIife = fonte.indexOf('})();\n', ini), fimObj = fonte.indexOf('};\n', ini);
  const fim = fimIife >= 0 && fimIife < fonte.indexOf('\nconst ', ini + 10) ? fimIife + 5 : fimObj + 2;
  return fonte.slice(ini, fim);
}
const ctx = vm.createContext({ URL });
vm.runInContext([constante('CONTA_APPS'), ...['contaEsperaLogin', 'contaMensagemLogin', 'contaSenhaNovaErro',
  'contaLinkNotificacao', 'contaTempoRel', 'contaPrazo'].map(funcao)].join('\n'), ctx);
const f = (n) => vm.runInContext(n, ctx);

test('espera progressiva: livre até 4 erros; 5 → 15 s; dobra até 5 min', () => {
  const espera = f('contaEsperaLogin'), t = 1_000_000;
  assert.equal(espera(4, t, t), 0);
  assert.equal(espera(5, t, t), 15_000);
  assert.equal(espera(6, t, t + 10_000), 20_000);
  assert.equal(espera(20, t, t), 300_000);
  assert.equal(espera(5, t, t + 16_000), 0, 'passou o tempo: pode tentar');
});

test('mensagens claras do login', () => {
  const msg = f('contaMensagemLogin');
  assert.equal(msg({ message: 'Invalid login credentials' }, true), 'E-mail ou senha incorretos.');
  assert.match(msg({ message: 'x' }, false), /Sem internet/);
  assert.match(msg({ message: 'Failed to fetch' }, true), /internet/);
  assert.match(msg({ message: 'Request rate limit reached' }, true), /Muitas tentativas/);
  assert.match(msg({ message: 'User is banned' }, true), /desativado/);
});

test('senha nova: 8+, iguais e diferente do e-mail', () => {
  const erro = f('contaSenhaNovaErro');
  assert.match(erro('1234567', '1234567'), /8 caracteres/);
  assert.match(erro('12345678', '12345679'), /não são iguais/);
  assert.match(erro('joao@indy.com', 'joao@indy.com', 'joao@indy.com'), /e-mail/);
  assert.match(erro('joaopedro', 'joaopedro', 'joaopedro@indy.com'), /e-mail/);
  assert.equal(erro('Indy2026!x', 'Indy2026!x', 'joao@indy.com'), null);
});

test('link da notificação: relativo vai para o app de origem; absoluto só do ecossistema', () => {
  const link = f('contaLinkNotificacao');
  assert.equal(link({ link: '/?conversa=abc', app: 'atendimento' }), 'https://indycar-atendimento.onrender.com/?conversa=abc');
  assert.equal(link({ link: '/?lead=1', app: 'crm' }), 'https://indycar-crm.onrender.com/?lead=1');
  assert.equal(link({ link: '/?agendamento=x', app: 'agenda' }, 'http://localhost:3011'), 'http://localhost:3011/?agendamento=x');
  assert.equal(link({ link: 'https://site-malicioso.example/x', app: 'agenda' }), null);
  assert.equal(link({ link: 'javascript:alert(1)', app: 'agenda' }), null);
  assert.equal(link({ link: '//evil.example/x', app: 'agenda' }), null);
  assert.equal(link({ link: '', app: 'agenda' }), null);
});

test('tempo relativo e prazo da tarefa', () => {
  const rel = f('contaTempoRel'), prazo = f('contaPrazo');
  const agora = Date.parse('2026-10-13T15:00:00Z');
  assert.equal(rel('2026-10-13T14:59:40Z', agora), 'agora');
  assert.equal(rel('2026-10-13T14:30:00Z', agora), 'há 30 min');
  assert.equal(rel('2026-10-13T12:00:00Z', agora), 'há 3 h');
  assert.equal(rel('2026-10-12T12:00:00Z', agora), 'ontem');
  assert.equal(rel('lixo', agora), '');
  assert.equal(prazo('2026-10-13T14:00:00Z', agora).atrasada, true);
  assert.match(prazo('2026-10-13T14:00:00Z', agora).txt, /^atrasada/);
  assert.match(prazo('2026-10-14T14:00:00Z', agora).txt, /^até/);
  assert.equal(prazo(null, agora).txt, '');
});
