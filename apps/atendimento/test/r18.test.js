'use strict';
/* Rodada 18: WhatsApp parado numa faixa só (desde quando e o que fazer) e encerrar em lote as conversas paradas
   na fila do consultor (contagem, confirmação, quem fez, desfazer). */
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

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const T = (iso) => Date.parse(iso);

/* ---------------- horas de expediente e texto ---------------- */
test('horas de expediente: seg-sex 8h-18h, sáb 8h-12h, domingo fechado, fuso de SP', () => {
  assert.equal(R18.horasComerciais(T('2026-11-24T11:24:00Z'), T('2026-11-24T15:24:00Z')), 4, 'terça 08:24 → 12:24');
  assert.equal(R18.horasComerciais(T('2026-11-20T21:00:00Z'), T('2026-11-23T11:00:00Z')), 4, 'sexta 18h → segunda 8h = só o sábado de manhã');
  assert.equal(R18.horasComerciais(T('2026-11-22T12:00:00Z'), T('2026-11-22T20:00:00Z')), 0, 'domingo não conta');
  assert.equal(R18.horasComerciais(T('2026-11-24T23:00:00Z'), T('2026-11-25T10:00:00Z')), 0, 'madrugada não conta');
  assert.equal(R18.horasComerciais(T('2026-11-25T10:00:00Z'), T('2026-11-24T10:00:00Z')), 0, 'ordem trocada não quebra');
});

test('quandoTexto fala como a recepção: "ter 24/11 às 08:24"', () => {
  assert.equal(R18.quandoTexto('2026-11-24T11:24:45Z'), 'ter 24/11 às 08:24');
  assert.equal(R18.quandoTexto(null), '');
});

/* ---------------- decidir: parado ou não ---------------- */
const AGORA_REAL = T('2026-11-25T13:00:00Z');   // quarta 10h em SP: o caso medido no banco em 25/11

test('caso real de 25/11: nenhum sinal de erro, só silêncio desde 24/11 08:24 → parado, com o que fazer', () => {
  const r = R18.decidirZap({ zap: { parado: false }, sincronia: { recusas: 0 }, saude: { problema: 'tarefas-acumuladas' },
    ultimaEntrada: '2026-11-24T11:24:45Z', ultimaSaida: '2026-11-24T20:23:32Z', agora: AGORA_REAL });
  assert.equal(r.parado, true);
  assert.equal(r.motivo, 'silencio');
  assert.equal(r.confirmado, false);
  assert.equal(r.envio, 'incerto', 'no silêncio o envio pode até sair: não vira "Salvar"');
  assert.equal(r.titulo, 'WhatsApp parado desde ter 24/11 às 08:24');
  assert.equal(r.acao, 'Peça ao João para colar a chave em Ajustes › WhatsApp e chaves.');
  assert.match(r.texto, /nenhuma mensagem de cliente chegou depois disso/);
  const adm = R18.decidirZap({ ultimaEntrada: '2026-11-24T11:24:45Z', agora: AGORA_REAL, ehAdmin: true });
  assert.match(adm.acao, /^Confira em Ajustes › WhatsApp e chaves/, 'quem resolve lê a ação direta');
});

test('silêncio normal não acende: noite (seg 15:03 → ter 08:30) e fim de semana (sáb 11h → seg 9h)', () => {
  assert.equal(R18.decidirZap({ ultimaEntrada: '2026-11-23T18:03:29Z', agora: T('2026-11-24T11:30:00Z') }).parado, false);
  assert.equal(R18.decidirZap({ ultimaEntrada: '2026-11-21T14:00:00Z', agora: T('2026-11-23T12:00:00Z') }).parado, false);
  assert.equal(R18.decidirZap({ ultimaEntrada: null, agora: AGORA_REAL }).parado, false, 'sem histórico não inventa');
});

test('confirmado: disjuntor do envio, vigia ou sincronia recusada → nada sai ("retido"), com o motivo certo', () => {
  const z = R18.decidirZap({ zap: { parado: true, codigo: 'codewords-401', desde: '2026-11-24T11:30:00Z' }, ultimaEntrada: '2026-11-25T12:59:00Z', agora: AGORA_REAL });
  assert.deepEqual([z.parado, z.motivo, z.confirmado, z.envio], [true, 'chave', true, 'retido']);
  assert.match(z.texto, /recusou a chave: nada sai e nada chega/);
  const v = R18.decidirZap({ saude: { problema: 'whatsapp-fora', desde: '2026-11-25T11:00:00Z' }, agora: AGORA_REAL });
  assert.equal(v.motivo, 'celular');
  assert.equal(v.acao, 'Peça ao João para reconectar o celular em Ajustes › WhatsApp e chaves.');
  const s = R18.decidirZap({ sincronia: { recusas: 2 }, ultimaEntrada: '2026-11-25T12:00:00Z', agora: AGORA_REAL });
  assert.deepEqual([s.motivo, s.envio], ['chave', 'retido']);
  const c = R18.decidirZap({ zap: { parado: true, codigo: 'cota', desde: '2026-11-25T11:00:00Z' }, agora: AGORA_REAL, ehAdmin: true });
  assert.match(c.acao, /Renove o plano/);
});

/* ---------------- regras da tela ---------------- */
test('fila do consultor: mais antigo primeiro (pela data em que passou, senão pela última mensagem)', () => {
  const l = Regras.ordenarEspera([
    { id: 'novo', aguardando_desde: '2026-11-24T10:00:00Z' },
    { id: 'maio', aguardando_desde: '2026-05-12T10:00:00Z' },
    { id: 'semdata', aguardando_desde: null, ultima_mensagem_em: '2026-08-01T10:00:00Z' },
    { id: 'nada' },
  ]);
  assert.deepEqual(l.map(x => x.id), ['maio', 'semdata', 'novo', 'nada']);
});

test('textos do lote: quantas, desde quando, o que acontece e o que NÃO acontece', () => {
  assert.equal(Regras.textoContagem({ total: 97, dias: 30, mais_antiga: '2026-05-12T13:00:00Z' }), '97 conversas esperam o consultor há mais de 30 dias (a mais antiga desde 12/05).');
  assert.equal(Regras.textoContagem({ total: 1, dias: 90 }), '1 conversa espera o consultor há mais de 90 dias.');
  assert.equal(Regras.textoContagem({ total: 0, dias: 7 }), 'Nenhuma conversa espera o consultor há mais de 7 dias.');
  assert.match(Regras.textoContagem({ total: 500, dias: 7, acima_do_teto: true, teto: 500 }), /^Mais de 500 .* Encerra 500 por vez\.$/);
  const c = Regras.textoConfirmar(97, 30);
  assert.match(c, /Nenhuma mensagem é apagada/);
  assert.match(c, /reabre sozinha/);
  assert.match(c, /desfazer por 24 horas/);
  assert.equal(Regras.textoFeito(97, '2026-11-25T17:02:00Z'), '✓ 97 conversas encerradas por você às 14:02.');
  assert.equal(Regras.podeEncerrar('agenda'), false);
  assert.equal(Regras.podeEncerrar('atendente'), true);
});

/* ---------------- encerrar / desfazer no banco de mentira ---------------- */
const AGORA = T('2026-11-25T13:00:00Z');
const dia = (n) => new Date(AGORA - n * 86400_000).toISOString();
const uuid = (i) => `c2000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ANA = { id: 'p-ana', nome: 'Ana', papel: 'atendente' };
const ADM = { id: 'p-joao', nome: 'João', papel: 'admin' };

function montar() {
  const conversas = [
    { id: uuid(1), tipo: 'atendimento', desfecho: null, status: 'aberta', aguardando_consultor: true, aguardando_desde: dia(197), ultima_mensagem_em: dia(197) },
    { id: uuid(2), tipo: 'atendimento', desfecho: null, status: 'pendente', aguardando_consultor: true, aguardando_desde: dia(45), ultima_mensagem_em: dia(44) },
    { id: uuid(3), tipo: 'atendimento', desfecho: null, status: 'aberta', aguardando_consultor: true, aguardando_desde: null, ultima_mensagem_em: dia(60) },
    { id: uuid(4), tipo: 'atendimento', desfecho: null, status: 'aberta', aguardando_consultor: true, aguardando_desde: dia(3), ultima_mensagem_em: dia(3) },
    { id: uuid(5), tipo: 'atendimento', desfecho: 'nao_fechou', status: 'aberta', aguardando_consultor: true, aguardando_desde: dia(100), ultima_mensagem_em: dia(100) },
    { id: uuid(6), tipo: 'disparo', desfecho: null, status: 'aberta', aguardando_consultor: true, aguardando_desde: dia(100), ultima_mensagem_em: dia(100) },
    { id: uuid(7), tipo: 'atendimento', desfecho: null, status: 'aberta', aguardando_consultor: false, aguardando_desde: null, ultima_mensagem_em: dia(100) },
  ];
  const sb = criarSbFalso({ conversas, auditoria: [], notificacoes: [], whatsapp_mensagens: [] }, { relogio: () => new Date(AGORA) });
  let seq = 0;
  const auditar = async ({ perfil, acao, tabela, registro, detalhes }) => {
    const id = ++seq;
    sb.db.auditoria.push({ id, perfil_id: perfil, acao, tabela, registro_id: registro, detalhes, created_at: new Date(AGORA).toISOString() });
    return { ok: true, id };
  };
  return { sb, auditar, paradas: R18.criarParadas({ sb, auditar, agora: () => AGORA, log: () => {} }) };
}
const conv = (sb, i) => sb.db.conversas.find(c => c.id === uuid(i));

test('contar: só a fila de atendimento, sem desfecho, esperando o consultor há mais de N dias', async () => {
  const { paradas } = montar();
  const r = await paradas.contar({ dias: 30 });
  assert.equal(r.ok, true);
  assert.equal(r.total, 3, 'a de 197 dias, a de 45 e a sem data com última mensagem há 60 dias');
  assert.equal(r.mais_antiga, dia(197));
  assert.equal((await paradas.contar({ dias: 90 })).total, 1);
  assert.equal((await paradas.contar({ dias: 13 })).status, 400, 'só 7/15/30/60/90');
});

test('encerrar: registra quem fez e o estado de antes, muda só o estado da conversa, nada de mensagem ou desfecho', async () => {
  const { sb, paradas } = montar();
  const r = await paradas.encerrar({ dias: 30, perfil: ANA, esperado: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.encerradas, 3);
  const reg = sb.db.auditoria.find(a => a.acao === R18.ACAO_ENCERRAR);
  assert.equal(reg.perfil_id, ANA.id, 'quem fez');
  assert.equal(reg.detalhes.total, 3);
  assert.equal(R18.desempacotar(reg.detalhes.itens).length, 3);
  assert.equal(r.lote, String(reg.id));
  for (const i of [1, 2, 3]) {
    const c = conv(sb, i);
    assert.deepEqual([c.status, c.aguardando_consultor, c.aguardando_desde, c.desfecho], ['resolvida', false, null, null]);
  }
  assert.equal(conv(sb, 4).aguardando_consultor, true, 'a de 3 dias fica');
  assert.equal(conv(sb, 5).aguardando_consultor, true, 'conversa com desfecho não é da fila: fica');
  assert.equal(conv(sb, 6).aguardando_consultor, true, 'disparo fica');
  assert.ok(!sb.log.some(l => l.tabela === 'whatsapp_mensagens' && l.op !== 'select'), 'nenhuma mensagem tocada');
});

test('encerrar: papel sem permissão, contagem que mudou muito e auditoria fora do ar não mexem em nada', async () => {
  const a = montar();
  assert.equal((await a.paradas.encerrar({ dias: 30, perfil: { id: 'x', papel: 'agenda' } })).status, 403);
  const m = await a.paradas.encerrar({ dias: 7, perfil: ANA, esperado: 0 });
  assert.equal(m.status, 409);
  assert.equal(m.codigo, 'contagem_mudou');
  assert.equal(conv(a.sb, 1).aguardando_consultor, true);
  const sem = R18.criarParadas({ sb: a.sb, auditar: async () => ({ ok: false }), agora: () => AGORA, log: () => {} });
  const r = await sem.encerrar({ dias: 30, perfil: ANA });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Nada foi mudado/);
  assert.equal(conv(a.sb, 1).status, 'aberta');
});

test('desfazer: volta cada uma com a data em que passou para o consultor; quem já reabriu fica; aviso do sino nasce lido', async () => {
  const { sb, paradas } = montar();
  const r = await paradas.encerrar({ dias: 30, perfil: ANA });
  // o cliente da conversa 2 escreveu de novo depois (gatilho reabre): não pode ser mexida pelo desfazer
  conv(sb, 2).status = 'aberta';
  // o gatilho notificar_conversa cria um aviso quando a conversa volta a esperar consultor
  sb.db.notificacoes.push({ id: 'n1', tipo: 'aguardando', link: '/?conversa=' + uuid(1), lida_em: null, created_at: new Date(AGORA).toISOString() });
  sb.db.notificacoes.push({ id: 'n2', tipo: 'aguardando', link: '/?conversa=' + uuid(9), lida_em: null, created_at: new Date(AGORA).toISOString() });
  assert.equal((await paradas.desfazer({ lote: r.lote, perfil: { id: 'p-outro', papel: 'atendente' } })).status, 403, 'só quem fez ou o admin');
  const d = await paradas.desfazer({ lote: r.lote, perfil: ANA });
  assert.deepEqual([d.ok, d.voltaram, d.ficaram], [true, 2, 1]);
  assert.deepEqual([conv(sb, 1).status, conv(sb, 1).aguardando_consultor, conv(sb, 1).aguardando_desde], ['aberta', true, dia(197)]);
  assert.deepEqual([conv(sb, 3).aguardando_consultor, conv(sb, 3).aguardando_desde], [true, null]);
  assert.equal(conv(sb, 2).aguardando_consultor, false, 'reaberta pelo cliente: fica como está');
  assert.ok(sb.db.notificacoes.find(n => n.id === 'n1').lida_em, 'aviso do desfazer já nasce lido');
  assert.equal(sb.db.notificacoes.find(n => n.id === 'n2').lida_em, null, 'aviso de outra conversa não é tocado');
  assert.ok(sb.db.auditoria.some(a => a.acao === R18.ACAO_DESFAZER && a.registro_id === r.lote && a.perfil_id === ANA.id));
  assert.equal((await paradas.desfazer({ lote: r.lote, perfil: ADM })).status, 409, 'não desfaz duas vezes');
});

test('desfazer: lote inválido, inexistente ou com mais de 24 h', async () => {
  const { sb, paradas, auditar } = montar();
  assert.equal((await paradas.desfazer({ lote: 'abc', perfil: ANA })).status, 400);
  assert.equal((await paradas.desfazer({ lote: '999', perfil: ANA })).status, 404);
  const r = await paradas.encerrar({ dias: 30, perfil: ANA });
  sb.db.auditoria.find(a => String(a.id) === r.lote).created_at = new Date(AGORA - 25 * 3600_000).toISOString();
  assert.equal((await paradas.desfazer({ lote: r.lote, perfil: ADM })).status, 409);
  void auditar;
});

/* ---------------- rotas ---------------- */
async function subir(quem) {
  const { sb, auditar } = montar();
  sb.db.whatsapp_mensagens.push({ id: 'm1', direcao: 'entrada', created_at: '2026-11-24T11:24:45Z' });
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
  return { sb, srv, pedir };
}

test('rotas /api/r18: login obrigatório, zap com o silêncio real, contar, encerrar e desfazer', async () => {
  const { sb, srv, pedir } = await subir(ANA);
  try {
    assert.equal((await pedir('/api/r18/zap', { login: false })).status, 401);
    const z = await pedir('/api/r18/zap');
    assert.equal(z.status, 200);
    assert.equal(z.j.parado, true);
    assert.equal(z.j.titulo, 'WhatsApp parado desde ter 24/11 às 08:24');
    assert.equal((await pedir('/api/r18/paradas?dias=12')).status, 400);
    const c = await pedir('/api/r18/paradas?dias=30');
    assert.equal(c.j.total, 3);
    const e = await pedir('/api/r18/paradas/encerrar', { metodo: 'POST', corpo: { dias: 30, esperado: 3 } });
    assert.equal(e.j.encerradas, 3);
    assert.equal((await pedir('/api/r18/paradas?dias=30')).j.total, 0);
    const d = await pedir('/api/r18/paradas/desfazer', { metodo: 'POST', corpo: { lote: e.j.lote } });
    assert.equal(d.j.voltaram, 3);
    assert.equal(sb.db.conversas.filter(x => x.aguardando_consultor).length, 6);
  } finally { srv.close(); }
});

/* ---------------- tela ---------------- */
test('tela: r18 carregado (regras antes do app.js), service worker guarda, faixa única e Enviar honesto', () => {
  const html = pub('index.html'), sw = pub('sw.js'), app = pub('app.js'), r6 = pub('r6-tela.js'), css = pub('r18.css'), js = pub('r18.js');
  assert.ok(html.indexOf('r18-regras.js') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="r18.js"') > html.indexOf('src="app.js"'));
  assert.match(html, /<link rel="stylesheet" href="r18.css" \/>/);
  assert.match(html, /id="r18Lote" hidden/);
  for (const f of ['r18.css', 'r18.js', 'r18-regras.js']) assert.match(sw, new RegExp(`'${f.replace('.', '\\.')}'`));
  assert.match(sw, /indycar-atendimento-v30/);
  assert.match(app, /if \(filtroStatus === 'aguardando' && window\.R18Regras\) return window\.R18Regras\.ordenarEspera\(lista\)/);
  assert.match(app, /window\.R18\?\.aoRenderLista\(\)/);
  assert.match(app, /window\.R18\?\.depoisDeEnviar\(ok\)/);
  assert.match(app, /const zap = window\.R18\?\.zap;/);
  assert.match(r6, /window\.R18\?\.zap\?\.envio === 'retido'/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(css, /html\.r18-zap-parado #tarjaConexao/);
  assert.match(js, /Acesso\.confirmar\(/, 'confirmação na janela do app');
  assert.doesNotMatch(app + js, /Configurações › Integrações › Chave/);
});
