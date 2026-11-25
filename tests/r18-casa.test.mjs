// Casa, rodada 18: a casa em ordem.
//  - o WhatsApp parado é o problema nº 1 do dia: uma linha no herói que leva ao Atendimento. Conta o que o servidor anotou
//    E o silêncio (no banco de 25/11 o estado dizia "ok", mas nenhuma mensagem chegava desde 24/11 08:24);
//  - o sino com 131 não lidas: grupos por tipo (do maior para o menor), "marcar" em lote pergunta antes com a contagem e
//    deixa desfazer (só volta o que aquele lote marcou).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica4.js');
await import('../casa/logica5.js');
const L5 = globalThis.CasaLogica5, L4 = globalThis.CasaLogica4;
const CASA = join(dirname(fileURLToPath(import.meta.url)), '..', 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const AGORA = Date.parse('2026-11-25T14:00:00-03:00');
const h = (n) => new Date(AGORA - n * 36e5).toISOString();

test('WhatsApp: estado "ok" anotado mas nada chega há 30 h = parado (o caso de 25/11)', () => {
  const p = L5.whatsappParado({ zap: { parado: false, codigo: 'codewords-401', desde: h(24 * 30) }, rpcWa: { estado: 'ok' }, ultimaEntrada: '2026-11-24T08:24:45-03:00', agoraMs: AGORA });
  assert.equal(p.codigo, 'sem-receber');
  assert.equal(p.desdeMs, Date.parse('2026-11-24T08:24:45-03:00'));
  assert.match(p.motivo, /nenhuma mensagem de cliente chega/);
  const l = L5.linhaDoZap(p, { papel: 'atendente', agora: new Date(AGORA) });
  assert.match(l.titulo, /^WhatsApp parado desde ontem 08:24 \(/);
  assert.match(l.passo, /Peça ao João para colar a chave em Ajustes › WhatsApp e chaves\./);
  assert.equal(l.rotulo, 'Abrir o Atendimento');
  assert.equal(l.q, '', 'a atendente abre o Atendimento (Integrações é do gestor)');
});

test('WhatsApp: a noite (até 18 h sem mensagem) não é parada; 20 h é', () => {
  assert.equal(L5.whatsappParado({ ultimaEntrada: h(18), agoraMs: AGORA }), null);
  assert.equal(L5.whatsappParado({ ultimaEntrada: h(19.9), agoraMs: AGORA }), null);
  assert.equal(L5.whatsappParado({ ultimaEntrada: h(20), agoraMs: AGORA }).codigo, 'sem-receber');
});

test('WhatsApp: sem leitura nenhuma não acusa (nunca alarme falso)', () => {
  assert.equal(L5.whatsappParado({ agoraMs: AGORA }), null);
  assert.equal(L5.whatsappParado({ zap: null, rpcWa: null, ultimaEntrada: null, agoraMs: AGORA }), null);
  assert.equal(L5.whatsappParado({ ultimaEntrada: 'lixo', agoraMs: AGORA }), null);
  assert.equal(L5.linhaDoZap(null), null);
});

test('WhatsApp: o que o servidor anotou vale na hora (401, celular desconectado), com o passo certo para cada um', () => {
  const p = L5.whatsappParado({ zap: { parado: true, codigo: 'codewords-401', desde: h(2) }, ultimaEntrada: h(0.1), agoraMs: AGORA });
  assert.equal(p.codigo, 'codewords-401');
  assert.match(p.motivo, /chave do CodeWords foi recusada/);
  const dono = L5.linhaDoZap(p, { papel: 'admin', agora: new Date(AGORA) });
  assert.match(dono.passo, /^Cole a chave do CodeWords em Atendimento › Ajustes › WhatsApp e chaves\./);
  assert.equal(dono.q, '?aba=integracoes');
  const cel = L5.linhaDoZap(L5.whatsappParado({ rpcWa: { estado: 'desconectado', desde: h(1) }, agoraMs: AGORA }), { papel: 'gestor', agora: new Date(AGORA) });
  assert.match(cel.passo, /Peça ao João para reconectar o celular da oficina/);
  assert.match(cel.titulo, /celular da oficina está desconectado/);
});

test('WhatsApp: a saúde dos sistemas não diz "tudo certo" quando o herói diz parado', () => {
  const p = L5.whatsappParado({ ultimaEntrada: h(30), agoraMs: AGORA });
  const s = L4.saudeSistemas({ rpc: { whatsapp: { estado: 'ok' }, comunicar: {}, movere: {} }, zap: p, agoraMs: AGORA });
  const wa = s.itens.find((i) => i.k === 'whatsapp');
  assert.equal(wa.tom, 'ruim');
  assert.match(wa.resumo, /^WhatsApp parado há .+: nenhuma mensagem de cliente chega\.$/);
  const ok = L4.saudeSistemas({ rpc: { whatsapp: { estado: 'ok' }, comunicar: {}, movere: {} }, zap: null, agoraMs: AGORA });
  assert.equal(ok.itens.find((i) => i.k === 'whatsapp').tom, 'ok');
});

test('sino: grupos por tipo, do que tem mais não lidos para o que tem menos', () => {
  const n = (id, tipo, min, lida = false) => ({ id: String(id), tipo, created_at: new Date(AGORA - min * 60000).toISOString(), lida_em: lida ? h(1) : null });
  const lista = [n(1, 'espera', 5), n(2, 'patio', 50), n(3, 'patio', 40), n(4, 'patio', 30), n(5, 'tarefa', 10), n(6, 'tarefa', 20, true), n(7, 'tarefa', 15, true)];
  const g = L5.gruposDoSino(lista);
  assert.deepEqual(g.map((x) => x.tipo), ['patio', 'espera', 'tarefa']);
  assert.deepEqual(g[0].itens.map((x) => x.id), ['4', '3', '2'], 'mais novo primeiro dentro do grupo');
  assert.deepEqual(g[2].novos, ['5']);
  assert.equal(L5.rotuloDoGrupo('patio', 23), '23 avisos do Pátio');
  assert.equal(L5.rotuloDoGrupo('tarefa', 1), '1 tarefa');
  assert.equal(L5.rotuloDoGrupo('sugestao_perdido', 2), '2 contatos para dar como perdidos');
  assert.equal(L5.rotuloDoGrupo('tipo_novo', 3), '3 tipo_novo', 'tipo desconhecido não some');
});

test('sino: a pergunta do lote diz quantos', () => {
  assert.equal(L5.perguntaDoLote(131), 'Marcar 131 avisos como lidos?');
  assert.equal(L5.perguntaDoLote(23, true), 'Marcar os 23 avisos deste grupo como lidos?');
  assert.equal(L5.perguntaDoLote(1), 'Marcar 1 aviso como lido?');
});

test('sino: lote pergunta antes, desfaz só o que marcou e lê até 300 não lidas', () => {
  const s = ler('sino.js');
  assert.match(s, /function lerTodas\(\)[\s\S]*?pedirLote\(ids\);/, '"Marcar todas" passa pela pergunta');
  assert.match(s, /pedirLote\(ids, true, tipo\)/, 'o grupo também pergunta');
  assert.match(s, /update\(\{ lida_em: null \}\)\.in\('id', d\.ids\)\.eq\('lida_em', d\.em\)/, 'desfazer volta só o que tem a hora deste lote');
  assert.match(s, /limit\(so \? 300 : limite\)/);
  assert.match(s, /data-lote-desfazer/);
});

test('herói: a linha do WhatsApp mora no herói e leva ao Atendimento (sem repetir a faixa dele)', () => {
  const html = ler('index.html');
  assert.match(html, /<h1 class="heroi-ola">[\s\S]*?<\/h1>\s*<a id="heroiZap" class="heroi-zap" href="\/atendimento\/" hidden><\/a>\s*<p id="heroiFrase"/);
  const p = ler('painel.js');
  assert.match(p, /from\('whatsapp_mensagens'\)\.select\('created_at'\)\.eq\('direcao', 'entrada'\)\.order\('created_at', \{ ascending: false \}\)\.limit\(1\)/);
  assert.match(p, /ZAP_CADA_MS = 3 \* 60_000/);
  assert.match(p, /V\.conversas && C\.podeUsar\('atendimento'\) \? lerZap\(\)/, 'só quem pode usar o Atendimento lê e vê');
});

test('versões novas no index e no service worker', () => {
  const html = ler('index.html');
  for (const m of [/r13\.css\?v=7/, /logica4\.js\?v=8/, /logica5\.js\?v=6/, /sino\.js\?v=15/, /painel\.js\?v=21/, /saude\.js\?v=8/]) assert.match(html, m);
  assert.match(ler('sw.js'), /indycar-casa-v25/);
  assert.match(ler('r13.css'), /\[hidden\] \{ display: none !important; \}/);
});
