// Casa, rodada 17: só o que tem uso real.
//  - "conversas esperando" conta toda conversa em que o cliente escreveu por último (inclusive as que a IA cuida):
//    a Casa diz "esperando resposta" (no Atendimento, "consultor" é outra conta) e "a mais antiga" é mesmo a mais antiga;
//  - o Orçador não tem uso (0 orçamentos na semana): zero esperando sai do herói e do cartão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica5.js');
const L = globalThis.CasaLogica, L2 = globalThis.CasaLogica2, L5 = globalThis.CasaLogica5;
const CASA = join(dirname(fileURLToPath(import.meta.url)), '..', 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const perfil = (papel, apps) => ({ papel, apps, ativo: true });
const dono = L.visao(perfil('admin', ['agenda', 'atendimento', 'crm', 'patio', 'orcador']));
const ID1 = '00000000-0000-4000-8000-000000000001', ID2 = '00000000-0000-4000-8000-000000000002';

test('conversas: o aviso diz "esperando resposta" (não "o consultor") e abre a primeira da fila', () => {
  const agora = Date.parse('2026-11-25T14:00:00-03:00');
  const a = { conversas: { esperando: 42, lista: [{ id: ID1, aguardando_desde: '2026-11-25T13:00:00-03:00' }] } };
  const it = L.atencao(a, dono, L.links(), agora).find((x) => x.k === 'conversas');
  assert.equal(it.texto, '42 conversas esperando resposta');
  assert.ok(!/consultor/.test(it.texto));
  assert.ok(it.url.includes('conversa=' + ID1));
  const um = L.atencao({ conversas: { esperando: 1, lista: [] } }, dono, L.links(), agora).find((x) => x.k === 'conversas');
  assert.equal(um.texto, '1 conversa esperando resposta');
});

test('conversas: "a mais antiga" é a de menor espera da lista, não só a primeira (a lista vem com quem pediu o consultor antes)', () => {
  const agora = Date.parse('2026-11-25T14:00:00-03:00');
  const lista = [
    { id: ID1, aguardando_desde: '2026-11-25T13:30:00-03:00' },   // pediu o consultor: vem primeiro
    { id: ID2, aguardando_desde: '2026-11-22T14:00:00-03:00' },   // a IA cuida, mas espera há 3 dias
  ];
  const it = L.atencao({ conversas: { esperando: 2, lista } }, dono, L.links(), agora).find((x) => x.k === 'conversas');
  assert.equal(it.extra, 'a mais antiga há ' + L.duracao(3 * 864e5));
  assert.equal(it.grav, 3, 'mais de 2 horas: urgente');
  assert.ok(it.url.includes('conversa=' + ID1), 'o toque segue abrindo a primeira da fila');
  const ruim = L.atencao({ conversas: { esperando: 1, lista: [{ id: ID1, aguardando_desde: null }] } }, dono, L.links(), agora).find((x) => x.k === 'conversas');
  assert.equal(ruim.extra, '', 'data ruim não vira "há NaN"');
});

test('Orçador sem uso: zero esperando sai do herói; com orçamento esperando ele volta', () => {
  const base = { conversas: { esperando: 42 }, agenda: { total: 5 }, patio: { total: 1 } };
  const sem = L5.numerosDoDia({ ...base, orcamentos: { esperando: 0 } }, dono);
  assert.deepEqual(sem.map((i) => i.app), ['atendimento', 'agenda', 'patio']);
  assert.equal(L5.fraseEmTexto(L5.fraseDoDia(sem)), 'Hoje tem 42 conversas esperando, 5 horários na Agenda e 1 carro no pátio.');
  const com = L5.numerosDoDia({ ...base, orcamentos: { esperando: 1 } }, dono);
  assert.deepEqual(com.map((i) => [i.app, i.n]).at(-1), ['orcador', 1]);
  const tudoZero = L5.numerosDoDia({ conversas: { esperando: 0 }, agenda: { total: 0 }, patio: { total: 0 }, orcamentos: { esperando: 0 } }, dono);
  assert.equal(L5.fraseEmTexto(L5.fraseDoDia(tudoZero)), 'Dia calmo até agora: nada esperando por você.');
});

test('Orçador sem uso: o cartão do app também não mostra "0"', () => {
  assert.match(ler('painel.js'), /V\.orcamentos && d\.orcamentos && Number\(d\.orcamentos\.esperando\) > 0\) out\.orcador =/);
});

test('celular: três números do herói numa linha só (antes o terceiro ficava sozinho embaixo)', () => {
  const css = ler('r13.css');
  const cel = css.slice(css.indexOf('@media (max-width: 600px)'));
  assert.match(cel, /\.heroi-nums:has\(> li:nth-child\(3\):last-child\) \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
});

test('o resumo do dono e o estado vazio falam a mesma língua', () => {
  assert.ok(L2, 'logica2 carregou');
  const s = ler('logica2.js');
  assert.match(s, /Conversas esperando resposta: /);
  assert.doesNotMatch(s, /esperando o consultor/);
  assert.doesNotMatch(ler('logica.js'), /esperando' : 'conversas esperando'\} o consultor/);
});

test('versões novas no index e no service worker', () => {
  const html = ler('index.html');
  for (const m of [/r13\.css\?v=6/, /logica\.js\?v=14/, /logica2\.js\?v=10/, /logica5\.js\?v=5/, /painel\.js\?v=20/]) assert.match(html, m);
  assert.match(ler('sw.js'), /indycar-casa-v24/);
});
