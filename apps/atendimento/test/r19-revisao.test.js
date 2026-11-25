'use strict';
/* Rodada 19: revisão independente da R18 (tentar quebrar).
   - "WhatsApp parado" por silêncio: feriado não é expediente; com o banco fora do ar a resposta é "não sei".
   - Encerrar em lote: um lote por vez; o desfazer só devolve o que AQUELE lote mudou e que ninguém mexeu depois.
   - Enviar / Tentar de novo: a mesma mensagem não sai duas vezes quando a resposta do servidor se perde. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const R18 = require('../lib/r18.js');
const Regras = require('../public/r18-regras.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');
const { criarRotasR18 } = require('../lib/rotas-r18.js');
const { criarZap } = require('../lib/zap-estado.js');
const { criarEntregador } = require('../lib/entrega.js');

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const T = (iso) => Date.parse(iso);
const parede = (a, m, d) => Date.UTC(a, m - 1, d);   // meia-noite "de parede" em SP

/* ---------------- silêncio: feriado e banco fora do ar ---------------- */
test('feriado não é expediente: nacionais, SP, Taubaté e os que andam com a Páscoa', () => {
  for (const [a, m, d, nome] of [[2026, 11, 20, 'Consciência Negra'], [2026, 12, 25, 'Natal'], [2027, 1, 1, 'Ano novo'], [2026, 7, 9, 'SP'], [2026, 12, 5, 'Taubaté'],
    [2026, 4, 3, 'Sexta-feira Santa 2026'], [2026, 6, 4, 'Corpus Christi 2026'], [2026, 2, 16, 'segunda de Carnaval 2026'], [2026, 2, 17, 'terça de Carnaval 2026'],
    [2027, 3, 26, 'Sexta-feira Santa 2027'], [2027, 2, 9, 'terça de Carnaval 2027'], [2027, 5, 27, 'Corpus Christi 2027']]) {
    assert.equal(R18.ehFeriado(parede(a, m, d)), true, nome);
  }
  for (const [a, m, d] of [[2026, 11, 19], [2026, 11, 23], [2026, 11, 25], [2026, 4, 6], [2026, 2, 18]]) assert.equal(R18.ehFeriado(parede(a, m, d)), false, `${d}/${m}/${a} é dia útil`);
});

test('caso real de 20/11/2026 (feriado numa sexta): 5 h sem mensagem com o WhatsApp funcionando não acende a faixa', () => {
  // última mensagem 11:52, a seguinte só chegou 17:10 (medido no banco)
  assert.equal(R18.horasComerciais(T('2026-11-20T14:52:00Z'), T('2026-11-20T20:09:00Z')), 0);
  assert.equal(R18.decidirZap({ ultimaEntrada: '2026-11-20T14:52:00Z', agora: T('2026-11-20T20:09:00Z') }).parado, false);
  // mas o silêncio que atravessa o feriado e segue pelo dia útil acende no tempo certo: qui 19/11 16h → seg 23/11
  assert.equal(R18.horasComerciais(T('2026-11-19T19:00:00Z'), T('2026-11-23T11:00:00Z')), 6, '2 h da quinta + sábado de manhã; a sexta-feriado não conta');
  assert.equal(R18.decidirZap({ ultimaEntrada: '2026-11-19T19:00:00Z', agora: T('2026-11-23T11:00:00Z') }).parado, true);
});

test('fim de semana e madrugada continuam sem alarme falso (domingo à noite, segunda cedo)', () => {
  const sab11 = '2026-11-28T14:00:00Z';   // sábado 11h
  assert.equal(R18.decidirZap({ ultimaEntrada: sab11, agora: T('2026-11-30T01:00:00Z') }).parado, false, 'domingo 22h');
  assert.equal(R18.decidirZap({ ultimaEntrada: sab11, agora: T('2026-11-30T10:30:00Z') }).parado, false, 'segunda 7h30');
  assert.equal(R18.decidirZap({ ultimaEntrada: sab11, agora: T('2026-11-30T13:59:00Z') }).parado, false, 'segunda 10h59: 1 h do sábado + 2h59');
  assert.equal(R18.decidirZap({ ultimaEntrada: sab11, agora: T('2026-11-30T14:00:00Z') }).parado, true, 'segunda 11h: 4 h de expediente');
});

test('banco fora do ar: sem ler as mensagens a resposta é "não sei", nunca "parado" nem "voltou"', () => {
  const r = R18.decidirZap({ ultimaEntrada: '2026-11-24T11:24:45Z', agora: T('2026-11-25T13:00:00Z'), semLeitura: true });
  assert.equal(r.ok, false);
  assert.equal(r.sem_leitura, true);
  assert.equal(r.parado, undefined, 'não afirma nem que parou nem que está funcionando');
  // o que o servidor sabe sem o banco (o disjuntor do envio) continua valendo
  const c = R18.decidirZap({ zap: { parado: true, codigo: 'codewords-401', desde: '2026-11-25T11:00:00Z' }, semLeitura: true, agora: T('2026-11-25T13:00:00Z') });
  assert.deepEqual([c.ok, c.parado, c.motivo], [true, true, 'chave']);
});

async function subirRotas({ sb, quem, auditar = async () => ({ ok: true, id: 1 }) }) {
  const rotas = criarRotasR18({
    getSb: () => sb, usuarioLogado: async (req) => (req.headers.authorization ? quem : null), dentroDoLimite: () => true,
    readBody: (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => ok(JSON.parse(b || '{}'))); }),
    zap: criarZap({ agora: () => AGORA }), sincronia: { estado: () => ({ recusas: 0 }) }, lerSaude: async () => ({ problema: null }), auditar, agora: () => AGORA, log: () => {},
  });
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!(await rotas(req, res, u.pathname, u.searchParams))) { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const pedir = async (p, { metodo = 'GET', corpo, login = true } = {}) => {
    const r = await fetch(base + p, { method: metodo, headers: login ? { authorization: 'Bearer t' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, j: await r.json() };
  };
  return { srv, pedir };
}

test('rota /api/r18/zap com o banco fora do ar: 503 "não sei" (a tela mantém o que mostra)', async () => {
  const sb = criarSbFalso({ whatsapp_mensagens: [{ id: 'm1', direcao: 'entrada', created_at: '2026-11-24T11:24:45Z' }] }, { falhas: { whatsapp_mensagens: { op: 'select', msg: 'fora do ar' } } });
  const { srv, pedir } = await subirRotas({ sb, quem: ANA });
  try {
    const z = await pedir('/api/r18/zap');
    assert.equal(z.status, 503);
    assert.equal(z.j.ok, false);
    assert.equal(z.j.sem_leitura, true);
    assert.equal((await pedir('/api/r18/zap', { login: false })).status, 401);
    // sem login nem as rotas que gravam respondem
    assert.equal((await pedir('/api/r18/paradas/encerrar', { metodo: 'POST', corpo: { dias: 30 }, login: false })).status, 401);
    assert.equal((await pedir('/api/r18/paradas/desfazer', { metodo: 'POST', corpo: { lote: '1' }, login: false })).status, 401);
  } finally { srv.close(); }
  const tela = pub('r18.js');
  assert.match(tela, /if \(!r\.ok \|\| r\.acordando\) return;/, 'sem resposta boa a tela não apaga a faixa nem avisa "voltou"');
});

/* ---------------- encerrar em lote e desfazer ---------------- */
const AGORA = T('2026-11-25T13:00:00Z');
const dia = (n) => new Date(AGORA - n * 86400_000).toISOString();
const uuid = (i) => `c2000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ANA = { id: 'p-ana', nome: 'Ana', papel: 'atendente' };
const BIA = { id: 'p-bia', nome: 'Bia', papel: 'atendente' };

function montar({ aoRegistrar = null } = {}) {
  const conversas = [1, 2, 3].map(i => ({ id: uuid(i), tipo: 'atendimento', desfecho: null, status: 'aberta', aguardando_consultor: true, aguardando_desde: dia(40 + i), ultima_mensagem_em: dia(40 + i) }));
  const sb = criarSbFalso({ conversas, auditoria: [], notificacoes: [] }, { relogio: () => new Date(AGORA) });
  let seq = 0;
  const auditar = async ({ perfil, acao, tabela, registro, detalhes }) => {
    const id = ++seq;
    sb.db.auditoria.push({ id, perfil_id: perfil, acao, tabela, registro_id: registro, detalhes, created_at: new Date(AGORA).toISOString() });
    if (aoRegistrar) await aoRegistrar(acao, sb);
    return { ok: true, id };
  };
  return { sb, paradas: R18.criarParadas({ sb, auditar, agora: () => AGORA, log: () => {} }) };
}
const conv = (sb, i) => sb.db.conversas.find(c => c.id === uuid(i));
const naFila = (sb) => sb.db.conversas.filter(c => c.aguardando_consultor).map(c => c.id);

test('duas pessoas confirmam o lote ao mesmo tempo: só um lote grava, e o desfazer de uma não desfaz o da outra', async () => {
  const { sb, paradas } = montar();
  const [a, b] = await Promise.all([paradas.encerrar({ dias: 30, perfil: ANA, esperado: 3 }), paradas.encerrar({ dias: 30, perfil: BIA, esperado: 3 })]);
  const feito = [a, b].filter(r => r.ok), recusado = [a, b].filter(r => !r.ok);
  assert.equal(feito.length, 1);
  assert.equal(feito[0].encerradas, 3);
  assert.equal(recusado[0].status, 409);
  assert.equal(recusado[0].codigo, 'em_curso');
  assert.equal(sb.db.auditoria.filter(x => x.acao === R18.ACAO_ENCERRAR).length, 1, 'um registro só');
  // quem chegou depois tenta de novo: não há mais nada, e não ganha um "lote" para desfazer
  const depois = await paradas.encerrar({ dias: 30, perfil: BIA, esperado: 3 });
  assert.deepEqual([depois.ok, depois.encerradas, depois.lote], [true, 0, null]);
  assert.deepEqual(naFila(sb), []);
});

test('conversa resolvida por alguém no meio do lote: conta certo e o desfazer não a devolve à fila', async () => {
  // entre o servidor ler as candidatas (e registrar) e gravar, a atendente resolve a conversa 2 pela tela
  const { sb, paradas } = montar({ aoRegistrar: (acao, banco) => { if (acao === R18.ACAO_ENCERRAR) Object.assign(conv(banco, 2), { status: 'resolvida', aguardando_consultor: false, aguardando_desde: null }); } });
  const r = await paradas.encerrar({ dias: 30, perfil: ANA, esperado: 3 });
  assert.equal(r.encerradas, 2, 'a contagem é o que o lote mudou de verdade');
  const fora = sb.db.auditoria.find(x => x.acao === R18.ACAO_FORA);
  assert.equal(fora.registro_id, r.lote);
  assert.equal(fora.detalhes.fora, uuid(2));
  const d = await paradas.desfazer({ lote: r.lote, perfil: ANA });
  assert.deepEqual([d.ok, d.voltaram, d.ficaram], [true, 2, 1]);
  assert.deepEqual(naFila(sb).sort(), [uuid(1), uuid(3)]);
  assert.equal(conv(sb, 2).status, 'resolvida', 'a que a atendente resolveu fica resolvida');
});

test('se o lote não mudou nenhuma conversa, não existe lote para desfazer', async () => {
  const { sb, paradas } = montar({ aoRegistrar: (acao, banco) => { if (acao === R18.ACAO_ENCERRAR) banco.db.conversas.forEach(c => Object.assign(c, { status: 'resolvida', aguardando_consultor: false })); } });
  const r = await paradas.encerrar({ dias: 30, perfil: ANA });
  assert.deepEqual([r.ok, r.encerradas, r.lote], [true, 0, null]);
  // mesmo pedindo o desfazer pelo número do registro, nada volta
  const reg = sb.db.auditoria.find(x => x.acao === R18.ACAO_ENCERRAR);
  const d = await paradas.desfazer({ lote: String(reg.id), perfil: ANA });
  assert.deepEqual([d.voltaram, d.ficaram], [0, 3]);
  assert.deepEqual(naFila(sb), []);
});

test('conversa que voltou a ser atendida depois do lote (cliente escreveu, atendente resolveu de novo) não volta para a fila', async () => {
  const { sb, paradas } = montar();
  const r = await paradas.encerrar({ dias: 30, perfil: ANA });
  assert.equal(r.encerradas, 3);
  // cliente da 1 escreve (o gatilho reabre e atualiza a última mensagem); a atendente responde e resolve de novo
  Object.assign(conv(sb, 1), { status: 'resolvida', aguardando_consultor: false, ultima_mensagem_em: new Date(AGORA + 3600_000).toISOString() });
  const d = await paradas.desfazer({ lote: r.lote, perfil: ANA });
  assert.deepEqual([d.voltaram, d.ficaram], [2, 1]);
  assert.equal(conv(sb, 1).aguardando_consultor, false, 'já foi atendida de novo: fica resolvida');
  assert.deepEqual([conv(sb, 2).status, conv(sb, 2).aguardando_consultor, conv(sb, 2).aguardando_desde], ['aberta', true, dia(42)]);
  // desfazer duas vezes, mesmo em paralelo (duplo clique): 409 e nada muda
  const [x, y] = await Promise.all([paradas.desfazer({ lote: r.lote, perfil: ANA }), paradas.desfazer({ lote: r.lote, perfil: ANA })]);
  assert.deepEqual([x.status, y.status], [409, 409]);
  assert.equal(sb.db.auditoria.filter(a => a.acao === R18.ACAO_DESFAZER).length, 1);
});

test('duplo clique no Desfazer: os dois pedidos juntos não viram dois desfazeres', async () => {
  const { sb, paradas } = montar();
  const r = await paradas.encerrar({ dias: 30, perfil: ANA });
  const [x, y] = await Promise.all([paradas.desfazer({ lote: r.lote, perfil: ANA }), paradas.desfazer({ lote: r.lote, perfil: ANA })]);
  assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
  assert.equal([x, y].find(k => k.ok).voltaram, 3);
  assert.equal([x, y].find(k => !k.ok).status, 409);
  assert.equal(sb.db.auditoria.filter(a => a.acao === R18.ACAO_DESFAZER).length, 1);
});

test('registro do lote: guarda a última mensagem de cada conversa; lote antigo (3 campos) ainda se desfaz', async () => {
  const itens = [{ id: uuid(1), status: 'aberta', desde: dia(41), ultima: dia(41) }, { id: uuid(2), status: 'pendente', desde: null, ultima: null }];
  assert.deepEqual(R18.desempacotar(R18.empacotar(itens)), itens);
  assert.deepEqual(R18.desempacotar(`${uuid(1)},aberta,${dia(41)}`), [{ id: uuid(1), status: 'aberta', desde: dia(41) }], 'formato da R18: sem o 4º campo');
  const { sb, paradas } = montar();
  sb.db.conversas.forEach(c => Object.assign(c, { status: 'resolvida', aguardando_consultor: false, aguardando_desde: null, ultima_mensagem_em: dia(1) }));
  sb.db.auditoria.push({ id: 77, perfil_id: ANA.id, acao: R18.ACAO_ENCERRAR, tabela: 'conversas', registro_id: null,
    detalhes: { dias: 30, total: 3, itens: [1, 2, 3].map(i => `${uuid(i)},aberta,${dia(40 + i)}`).join(';') }, created_at: new Date(AGORA - 3600_000).toISOString() });
  const d = await paradas.desfazer({ lote: '77', perfil: ANA });
  assert.deepEqual([d.voltaram, d.ficaram], [3, 0]);
});

/* ---------------- enviar / tentar de novo sem duplicar ---------------- */
const MSG = 'a0000000-0000-4000-8000-000000000001';

test('a tela não grava "falhou" por cima de mensagem que o servidor já marcou como enviada', async () => {
  const sb = criarSbFalso({ whatsapp_mensagens: [
    { id: MSG, direcao: 'saida', status: 'enviado', erro: null },                                     // o servidor entregou e gravou; a resposta se perdeu
    { id: 'a0000000-0000-4000-8000-000000000002', direcao: 'saida', status: 'pendente', erro: null },  // esta não saiu mesmo
  ] });
  await Regras.gravarSituacao(sb, MSG, false, 'Failed to fetch');
  await Regras.gravarSituacao(sb, 'a0000000-0000-4000-8000-000000000002', false, 'o WhatsApp não confirmou');
  assert.deepEqual([sb.db.whatsapp_mensagens[0].status, sb.db.whatsapp_mensagens[0].erro], ['enviado', null]);
  assert.deepEqual([sb.db.whatsapp_mensagens[1].status, sb.db.whatsapp_mensagens[1].erro], ['falhou', 'o WhatsApp não confirmou']);
  await Regras.gravarSituacao(sb, 'a0000000-0000-4000-8000-000000000002', true, '');
  assert.deepEqual([sb.db.whatsapp_mensagens[1].status, sb.db.whatsapp_mensagens[1].erro], ['enviado', null]);
  const app = pub('app.js');
  assert.match(app, /R18Regras\.gravarSituacao\(sb, linha\.id, ok, erro\)/);
  assert.ok(!/update\(\{ status, erro: ok \? null/.test(app), 'a gravação direta, sem a trava, saiu');
});

test('"Tentar de novo" de mensagem que já saiu não manda outra vez, mesmo com a linha dizendo "falhou"', async () => {
  // o servidor entregou, mas não conseguiu gravar 'enviado' na linha (ou a tela antiga gravou 'falhou' por cima)
  const sb = criarSbFalso({ whatsapp_mensagens: [{ id: MSG, direcao: 'saida', status: 'pendente', telefone: '12988887777', erro: null }] },
    { falhas: { whatsapp_mensagens: { op: 'update', msg: 'fora do ar' } } });
  const enviadas = [];
  const E = criarEntregador({ banco: () => sb, enviar: async d => { enviadas.push(d); return { ok: true }; } });
  const dados = { telefone: '12988887777', corpo: 'Seu carro está pronto' };
  assert.equal((await E.entregar(dados, MSG, { conferirTelefone: true })).ok, true);
  assert.equal(sb.db.whatsapp_mensagens[0].status, 'pendente', 'a linha não foi atualizada');
  sb.db.whatsapp_mensagens[0].status = 'falhou'; sb.db.whatsapp_mensagens[0].erro = 'Failed to fetch';
  const de_novo = await E.entregar(dados, MSG, { conferirTelefone: true });
  assert.deepEqual([de_novo.ok, de_novo.jaEnviada], [true, true]);
  assert.equal(enviadas.length, 1, 'o cliente recebeu uma vez só');
  // "Reenviar" (clique consciente, depois de conferir no celular) continua mandando
  await E.entregar({ ...dados, reenviar: true }, MSG, { conferirTelefone: true });
  assert.equal(enviadas.length, 2);
  // e o que falhou de verdade continua podendo tentar de novo
  let vez = 0;
  const F = criarEntregador({ banco: () => criarSbFalso({ whatsapp_mensagens: [{ id: MSG, direcao: 'saida', status: 'falhou', telefone: '12988887777', erro: 'HTTP 500' }] }), enviar: async () => ({ ok: ++vez > 1, erro: 'HTTP 500' }) });
  assert.equal((await F.entregar(dados, MSG)).ok, false);
  assert.equal((await F.entregar(dados, MSG)).ok, true);
  assert.equal(vez, 2);
});

test('tela: service worker troca de versão para a correção chegar a quem já tem o app aberto', () => {
  assert.match(pub('sw.js'), /indycar-atendimento-v31/);
  assert.match(pub('sw.js'), /'r18-regras\.js'/);
});
