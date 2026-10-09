// Testa as regras PURAS do front (public/app.js) sem navegador: lê o arquivo de
// verdade, recorta cada função pelo nome e roda num sandbox (node:vm). Assim o
// teste cobre o código que vai ao ar, não uma cópia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

/** Recorta `function nome(...) {` até a chave que fecha no começo da linha. */
function funcao(nome) {
  const ini = fonte.indexOf(`function ${nome}(`);
  if (ini < 0) throw new Error(`função ${nome} não achada em app.js`);
  const fim = fonte.indexOf('\n}', ini);
  return fonte.slice(ini, fim + 2);
}
/** Recorta `const NOME = ...;` de uma linha só. */
function constante(nome) {
  const ini = fonte.indexOf(`const ${nome} =`);
  if (ini < 0) throw new Error(`constante ${nome} não achada em app.js`);
  const fim = fonte.indexOf(';\n', ini);
  return fonte.slice(ini, fim + 1);
}

const ctx = vm.createContext({});
vm.runInContext([
  constante('EXPEDIENTE'), funcao('foraDoExpediente'),
  funcao('grupoDoDia'), funcao('mascaraTelefone'), constante('telefoneOk'),
  funcao('mascaraAniversario'), funcao('diasParaAniversario'), funcao('quandoRel'), funcao('diasEntre'.replace('diasEntre', 'rotuloDia')),
  constante('diasEntre'), constante('DIA_CURTO'),
].join('\n'), ctx);
const f = (nome) => vm.runInContext(nome, ctx);
// objetos criados dentro do sandbox têm outro Object.prototype: deepStrictEqual
// recusaria mesmo com o conteúdo igual — por isso o resultado é "achatado" antes.
const plano = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));

// ---- grupoDoDia: as abas do Início (decisão do dono, não reabrir) -----------
test('grupoDoDia: status vivo manda antes do bit compareceu', () => {
  const g = f('grupoDoDia');
  assert.equal(g({ status: 'confirmado', compareceu: null }), 'agendados');
  assert.equal(g({ status: 'aguardando', compareceu: 0 }), 'agendados');      // "Não veio" corrigido para Aguardando volta
  assert.equal(g({ status: 'confirmado', compareceu: 1 }), 'oficina');
  assert.equal(g({ status: 'compareceu', compareceu: 1 }), 'oficina');
  assert.equal(g({ status: 'em_atendimento', compareceu: null }), 'oficina');
  assert.equal(g({ status: 'concluido', compareceu: 1 }), 'resolvidos');      // saiu do Início: foi para o CRM
  assert.equal(g({ status: 'nao_fechou', compareceu: 1 }), 'resolvidos');
  assert.equal(g({ status: 'nao_veio', compareceu: 0 }), 'faltaram');
  assert.equal(g({ status: 'cancelado', compareceu: 1 }), 'faltaram');        // cancelado nunca cai em "Na oficina"
  assert.equal(g({ status: 'desconhecido', compareceu: 0 }), 'faltaram');
  assert.equal(g({ status: 'desconhecido', compareceu: null }), 'agendados');
});

// ---- expediente seg–sáb 8h–17h30 --------------------------------------------
test('foraDoExpediente avisa domingo e hora fora, e deixa passar o normal', () => {
  const fe = f('foraDoExpediente');
  assert.equal(fe('2026-10-09', '09:00'), null);                 // sexta
  assert.equal(fe('2026-10-10', '17:30'), null);                 // sábado, última hora
  assert.match(fe('2026-10-11', '10:00'), /Domingo/);
  assert.match(fe('2026-10-09', '07:30'), /Fora do expediente/);
  assert.match(fe('2026-10-09', '18:00'), /Fora do expediente/);
  assert.equal(fe('', '10:00'), null);
  assert.equal(fe('2026-10-09', ''), null);
});

// ---- telefone ---------------------------------------------------------------
test('mascaraTelefone formata celular e fixo e tira o 55 da frente', () => {
  const mt = f('mascaraTelefone');
  assert.equal(mt('12991415355'), '(12) 99141-5355');
  assert.equal(mt('1236221234'), '(12) 3622-1234');
  assert.equal(mt('5512991415355'), '(12) 99141-5355');
  assert.equal(mt('12'), '12');
  assert.equal(mt('129914'), '(12) 9914');
  assert.equal(mt(''), '');
  assert.equal(mt(null), '');
});

test('telefoneOk aceita vazio e 10–13 dígitos, recusa incompleto', () => {
  const ok = f('telefoneOk');
  assert.equal(ok(''), true);
  assert.equal(ok('(12) 99141-5355'), true);
  assert.equal(ok('12 3622-1234'), true);
  assert.equal(ok('+55 12 99141-5355'), true);
  assert.equal(ok('99141'), false);
  assert.equal(ok('123456789'), false);
});

// ---- aniversário ------------------------------------------------------------
test('mascaraAniversario monta DD/MM e DD/MM/AAAA conforme digita', () => {
  const ma = f('mascaraAniversario');
  assert.equal(ma('1'), '1');
  assert.equal(ma('1503'), '15/03');
  assert.equal(ma('15031980'), '15/03/1980');
  assert.equal(ma('15/03/19801'), '15/03/1980');     // corta o excesso
});

test('diasParaAniversario conta até o próximo, ignorando o ano', () => {
  const d = f('diasParaAniversario');
  assert.equal(d('1904-10-09', '2026-10-09'), 0);
  assert.equal(d('1980-10-12', '2026-10-09'), 3);
  assert.equal(d('1980-10-01', '2026-10-09'), 357);   // já passou este ano: conta até o ano que vem
  assert.equal(d(null, '2026-10-09'), null);
});

// ---- "em 40 min", "atrasado" -------------------------------------------------
test('quandoRel só fala de quem ainda não tem desfecho', () => {
  const qr = f('quandoRel');
  const q = (...a) => plano(qr(...a));
  const agora = { data: '2026-10-09', hm: '10:00', min: 600 };
  assert.deepEqual(q({ status: 'confirmado', data: '2026-10-09', hora: '10:40' }, agora), { txt: 'em 40 min', tom: 'agora' });
  assert.deepEqual(q({ status: 'confirmado', data: '2026-10-09', hora: '10:05' }, agora), { txt: 'agora', tom: 'agora' });
  assert.deepEqual(q({ status: 'aguardando', data: '2026-10-09', hora: '09:20' }, agora), { txt: 'atrasado 40 min', tom: 'atrasado' });
  assert.deepEqual(q({ status: 'aguardando', data: '2026-10-09', hora: '14:00' }, agora), { txt: 'em 4 h', tom: 'breve' });
  assert.deepEqual(q({ status: 'confirmado', data: '2026-10-10', hora: '09:00' }, agora), { txt: 'amanhã', tom: 'breve' });
  assert.deepEqual(q({ status: 'confirmado', data: '2026-10-08', hora: '09:00' }, agora), { txt: 'era ontem', tom: 'atrasado' });
  assert.equal(q({ status: 'concluido', data: '2026-10-09', hora: '10:40' }, agora), null);
  assert.equal(q({ status: 'confirmado', compareceu: 1, data: '2026-10-09', hora: '10:40' }, agora), null);
});

test('rotuloDia: Hoje, Amanhã, Ontem e dia da semana', () => {
  const r = f('rotuloDia');
  assert.equal(r('2026-10-09', '2026-10-09'), 'Hoje');
  assert.equal(r('2026-10-10', '2026-10-09'), 'Amanhã');
  assert.equal(r('2026-10-08', '2026-10-09'), 'Ontem');
  assert.equal(r('2026-10-13', '2026-10-09'), 'ter 13/10');
  assert.equal(r('2027-01-05', '2026-10-09'), 'ter 05/01/27');
});

// ---- rodada 2: selo do lembrete com a resposta do cliente (sem virar HTML) ----
test('seloLembrete: mostra a resposta no title, escapada', () => {
  const c2 = vm.createContext({});
  vm.runInContext([constante('esc'), funcao('seloLembrete')].join('\n'), c2);
  const selo = vm.runInContext('seloLembrete', c2);
  const html = selo({ lembrete: { status: 'respondido', resposta: 'positiva', texto: '"><img src=x onerror=alert(1)>' } });
  assert.match(html, /respondeu 👍/);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!/title="[^"]*"[^>]*"&gt;/.test(html) || html.includes('&quot;'));
  assert.equal(selo({}), '');
  assert.match(selo({ lembrete: { status: 'falhou' } }), /lembrete falhou/);
});
