'use strict';
/* Rodada 8 (T5a) — chaves da IA de fora: formato, só o hash no banco, conferência em tempo constante, revogação
   (na hora no mesmo processo, em até 30 s nos outros), escopos, chave na URL, limites por minuto e por dia, uso gravado
   sem travar, banco sem a migração; e as rotas logadas GET/POST/DELETE /api/ia/chaves (só administrador, auditadas). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Chaves = require('../ia/chaves');
const { criarBanco } = require('./apoio/banco-falso');
const { TD, ouvirNaFaixa } = require('./apoio/ia-porta');

const banco = () => criarBanco({ trafego_ia_chaves: [] }, { unicos: { trafego_ia_chaves: ['hash'] } });

test('gerarChave: ica_ + 40 caracteres base 62, sem repetir', () => {
  const vistas = new Set();
  for (let n = 0; n < 300; n++) {
    const c = Chaves.gerarChave();
    assert.match(c, /^ica_[A-Za-z0-9]{40}$/);
    vistas.add(c);
  }
  assert.equal(vistas.size, 300);
  const letras = new Set([...Array.from({ length: 50 }, () => Chaves.gerarChave().slice(4)).join('')]);
  assert.ok(letras.size > 55, 'usa o alfabeto inteiro');
});

test('criar: devolve a chave em claro uma vez; no banco só o hash sha256 e o prefixo de 8', async () => {
  const sb = banco(), ch = Chaves.criarChaves({ sb });
  const r = await ch.criar({ nome: '  Claude   Code ', escopos: ['propor'], ver_pii: false }, { criada_por: 'perfil-1' });
  assert.match(r.chave, /^ica_/);
  const linha = sb.tabelas.trafego_ia_chaves[0];
  assert.equal(linha.hash, crypto.createHash('sha256').update(r.chave).digest('hex'));
  assert.equal(linha.prefixo, r.chave.slice(0, 8));
  assert.deepEqual(linha.escopos, ['ler', 'propor'], 'quem propõe também lê');
  assert.equal(linha.nome, 'Claude Code');
  assert.ok(!JSON.stringify(sb.tabelas).includes(r.chave), 'a chave em claro não está em lugar nenhum do banco');
  assert.ok(!('hash' in r.registro) && !JSON.stringify(r.registro).includes(r.chave));
  const lista = await ch.listar();
  assert.equal(lista.chaves.length, 1);
  assert.ok(!JSON.stringify(lista).includes(linha.hash), 'a lista não mostra o hash');
});

test('validarNova: nome, escopos e ver_pii', () => {
  assert.throws(() => Chaves.validarNova({ nome: 'x' }), e => e.status === 422 && e.codigo === 'nome');
  assert.throws(() => Chaves.validarNova({ nome: 'Codex', escopos: ['aplicar'] }), e => e.codigo === 'escopos');
  assert.throws(() => Chaves.validarNova({ nome: 'Codex', escopos: [] }), e => e.codigo === 'escopos');
  assert.throws(() => Chaves.validarNova({ nome: 'Codex', ver_pii: 'sim' }), e => e.codigo === 'ver_pii');
  assert.deepEqual(Chaves.validarNova({ nome: 'Codex' }), { nome: 'Codex', escopos: ['ler'], ver_pii: false });
  assert.deepEqual(Chaves.validarNova({ nome: 'Codex', escopos: 'ler,propor', ver_pii: true }), { nome: 'Codex', escopos: ['ler', 'propor'], ver_pii: true });
});

test('conferir: chave certa passa; errada, de outro formato ou revogada não; a comparação usa timingSafeEqual', async () => {
  const sb = banco(), ch = Chaves.criarChaves({ sb });
  const { chave } = await ch.criar({ nome: 'Codex', escopos: ['ler'], ver_pii: true });
  const orig = crypto.timingSafeEqual; let usos = 0;
  crypto.timingSafeEqual = (a, b) => { usos++; return orig(a, b); };
  try {
    const ok = await ch.conferir(chave);
    assert.equal(ok.ok, true); assert.deepEqual(ok.chave.escopos, ['ler']); assert.equal(ok.chave.ver_pii, true);
    assert.ok(usos >= 1, 'comparação em tempo constante');
  } finally { crypto.timingSafeEqual = orig; }
  const outra = `ica_${'A'.repeat(40)}`;
  assert.deepEqual(await ch.conferir(outra), { ok: false, motivo: 'nao_existe' });
  const idas = sb.idas();
  assert.deepEqual(await ch.conferir('ica_curta'), { ok: false, motivo: 'formato' });
  assert.deepEqual(await ch.conferir(`${chave} `), { ok: false, motivo: 'formato' });
  assert.equal(sb.idas(), idas, 'formato errado nem chega ao banco');
  assert.equal(Chaves.mesmoHash('a'.repeat(64), 'a'.repeat(64)), true);
  assert.equal(Chaves.mesmoHash('a'.repeat(64), 'b'.repeat(64)), false);
  assert.equal(Chaves.mesmoHash('a'.repeat(63), 'a'.repeat(63)), false);
});

test('revogar: vale na hora neste processo; outro processo (memória de 30 s) para de aceitar em até 30 s', async () => {
  const sb = banco(), relogio = TD.relogio();
  const aqui = Chaves.criarChaves({ sb, agora: relogio }), outro = Chaves.criarChaves({ sb, agora: relogio });
  const { chave, registro } = await aqui.criar({ nome: 'Codex' });
  assert.equal((await aqui.conferir(chave)).ok, true);
  assert.equal((await outro.conferir(chave)).ok, true);
  const r = await aqui.revogar(registro.id);
  assert.equal(r.ja_estava, false); assert.ok(r.registro.revogada_em); assert.equal(r.registro.ativa, false);
  assert.deepEqual(await aqui.conferir(chave), { ok: false, motivo: 'revogada' });
  assert.equal((await outro.conferir(chave)).ok, true, 'o outro processo ainda está na memória');
  relogio.andar(30_000);
  assert.deepEqual(await outro.conferir(chave), { ok: false, motivo: 'revogada' });
  const de_novo = await aqui.revogar(registro.id);
  assert.equal(de_novo.ja_estava, true); assert.equal(de_novo.registro.revogada_em, r.registro.revogada_em, 'revogar de novo não muda a data');
  assert.equal(await aqui.revogar('00000000-0000-4000-8000-000000000000'), null);
});

test('limites: 120 por minuto e 5.000 por dia, com o tempo de espera', () => {
  const relogio = TD.relogio(Date.parse('2026-11-19T13:00:10Z'));
  const ch = Chaves.criarChaves({ sb: banco(), agora: relogio });
  for (let n = 0; n < 120; n++) assert.equal(ch.limitar('k').ok, true);
  const parado = ch.limitar('k');
  assert.deepEqual(parado, { ok: false, motivo: 'minuto', esperar: 50 });
  assert.equal(ch.limitar('outra').ok, true, 'cada chave tem o seu limite');
  relogio.andar(60_000);
  assert.equal(ch.limitar('k').ok, true);
  const dia = Chaves.criarChaves({ sb: banco(), agora: relogio, porDia: 3, porMinuto: 100 });
  for (let n = 0; n < 3; n++) dia.limitar('k');
  const fim = dia.limitar('k');
  assert.equal(fim.motivo, 'dia');
  assert.equal(fim.esperar, Math.ceil((Date.parse('2026-11-20T03:00:00Z') - relogio()) / 1000), 'volta à meia-noite de Brasília');
});

test('uso: ultimo_uso_em e usos gravados depois, em lote; falha ao gravar só vai para o log', async () => {
  const sb = banco(), relogio = TD.relogio();
  const ch = Chaves.criarChaves({ sb, agora: relogio, usoACadaMs: 60_000 });
  const { registro } = await ch.criar({ nome: 'Codex' });
  ch.registrarUso(registro.id); ch.registrarUso(registro.id); ch.registrarUso(registro.id);
  assert.equal(sb.tabelas.trafego_ia_chaves[0].usos, undefined, 'não grava na hora');
  await ch.descarregar();
  assert.equal(sb.tabelas.trafego_ia_chaves[0].usos, 3);
  assert.equal(sb.tabelas.trafego_ia_chaves[0].ultimo_uso_em, new Date(relogio()).toISOString());
  const quebrado = Chaves.criarChaves({ sb: criarBanco({}), agora: relogio });
  quebrado.registrarUso('x');
  const linhas = []; const w = console.warn, l = console.log;
  console.warn = console.log = (...a) => linhas.push(a.join(' '));
  try { await quebrado.descarregar(); } finally { console.warn = w; console.log = l; }
  assert.ok(linhas.some(x => /ia_chave_uso_nao_gravado/.test(x)));
});

test('sem a migração: conferir diz indisponível, listar responde desligado, criar dá 503 com frase clara', async () => {
  const ch = Chaves.criarChaves({ sb: criarBanco({}) });
  const r = await ch.conferir(`ica_${'B'.repeat(40)}`);
  assert.equal(r.motivo, 'indisponivel'); assert.equal(r.sem_tabela, true); assert.match(r.aviso, /r8_trafego_v1/);
  assert.deepEqual((await ch.listar()).chaves, []);
  await assert.rejects(ch.criar({ nome: 'Codex' }), e => e.status === 503 && e.codigo === 'sem_migracao');
});

test('cabeçalho e URL: só Bearer ica_…; chave na URL é reconhecida', () => {
  const c = `ica_${'C'.repeat(40)}`;
  assert.deepEqual(Chaves.chaveDoCabecalho({ headers: { authorization: `Bearer ${c}` } }), { chave: c });
  assert.deepEqual(Chaves.chaveDoCabecalho({ headers: { authorization: `bearer ${c}` } }), { chave: c });
  assert.deepEqual(Chaves.chaveDoCabecalho({ headers: {} }), { erro: 'sem_chave' });
  assert.deepEqual(Chaves.chaveDoCabecalho({ headers: { authorization: c } }), { erro: 'formato' });
  assert.deepEqual(Chaves.chaveDoCabecalho({ headers: { authorization: 'Basic abc' } }), { erro: 'formato' });
  assert.equal(Chaves.chaveNaUrl(new URLSearchParams({ chave: 'x' })), true);
  assert.equal(Chaves.chaveNaUrl(new URLSearchParams({ token: 'x' })), true);
  assert.equal(Chaves.chaveNaUrl(new URLSearchParams({ q: c })), true);
  assert.equal(Chaves.chaveNaUrl(new URLSearchParams({ periodo: '7d', limite: '10' })), false);
});

test('autenticar: 400 chave na URL, 401 sem chave (WWW-Authenticate), 401 inválida, 503 sem tabela, 429 limite, ok conta o uso', async () => {
  const sb = banco(), ch = Chaves.criarChaves({ sb, porMinuto: 2 });
  const { chave } = await ch.criar({ nome: 'Codex' });
  const req = h => ({ headers: h ? { authorization: h } : {} });
  const vazio = new URLSearchParams();
  let r = await Chaves.autenticar(req(`Bearer ${chave}`), new URLSearchParams({ chave }), ch);
  assert.equal(r.status, 400); assert.equal(r.codigo, 'chave_na_url'); assert.match(r.mensagem, /Authorization: Bearer/);
  assert.ok(!r.mensagem.includes(chave));
  r = await Chaves.autenticar(req(null), vazio, ch);
  assert.equal(r.status, 401); assert.match(r.cabecalhos['WWW-Authenticate'], /^Bearer/);
  r = await Chaves.autenticar(req(`Bearer ica_${'Z'.repeat(40)}`), vazio, ch);
  assert.equal(r.status, 401); assert.match(r.cabecalhos['WWW-Authenticate'], /invalid_token/);
  assert.equal((await Chaves.autenticar(req(`Bearer ${chave}`), vazio, ch)).ok, true);
  assert.equal((await Chaves.autenticar(req(`Bearer ${chave}`), vazio, ch)).ok, true);
  r = await Chaves.autenticar(req(`Bearer ${chave}`), vazio, ch);
  assert.equal(r.status, 429); assert.ok(Number(r.cabecalhos['Retry-After']) > 0);
  r = await Chaves.autenticar(req(`Bearer ${chave}`), vazio, Chaves.criarChaves({ sb: criarBanco({}) }));
  assert.equal(r.status, 503); assert.equal(r.codigo, 'sem_migracao');
});

/* ---------- rotas logadas ---------- */

test('rotas /api/ia/chaves: só administrador; a chave em claro sai uma vez (no-store); lista sem segredo; revogar; tudo auditado', async t => {
  const auth = require('../auth'), equipe = require('../equipe'), db = require('../db');
  const orig = { identificar: auth.identificar, banco: equipe.banco, sb: db.sb };
  const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
  const PAPEIS = { admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true } }, gestor: { usuario: { id: ID(2), papel: 'gestor', apps: ['ads'], ativo: true } } };
  const auditorias = [];
  const sb = banco();
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async (u, acao, o) => { auditorias.push({ quem: u.id, acao, ...o }); return true; } });
  db.sb = sb;
  Chaves.padrao().trocar({ sb });
  const { servidor } = require('../server');
  const porta = await ouvirNaFaixa(servidor);
  t.after(() => { servidor.close(); Object.assign(auth, { identificar: orig.identificar }); equipe.banco = orig.banco; db.sb = orig.sb; Chaves.padrao().trocar({ sb: null }); });
  const pedir = async (metodo, caminho, papel, corpo) => {
    const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { 'x-papel': papel || '', 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, cab: r.headers, corpo: await r.json() };
  };

  assert.equal((await pedir('GET', '/api/ia/chaves')).status, 401);
  const negado = await pedir('POST', '/api/ia/chaves', 'gestor', { nome: 'Codex' });
  assert.equal(negado.status, 403); assert.equal(negado.corpo.codigo, 'so_admin');

  const criada = await pedir('POST', '/api/ia/chaves', 'admin', { nome: 'Codex do João', escopos: ['ler', 'propor'], ver_pii: false });
  assert.equal(criada.status, 200);
  assert.match(criada.corpo.chave, /^ica_[A-Za-z0-9]{40}$/);
  assert.match(criada.corpo.aviso, /não aparece de novo/);
  assert.equal(criada.cab.get('cache-control'), 'no-store');
  assert.equal(criada.corpo.registro.criada_por, ID(1));
  const ruim = await pedir('POST', '/api/ia/chaves', 'admin', { nome: 'x' });
  assert.equal(ruim.status, 422); assert.equal(ruim.corpo.codigo, 'nome');

  const lista = await pedir('GET', '/api/ia/chaves', 'admin');
  assert.equal(lista.status, 200);
  assert.equal(lista.corpo.chaves.length, 1);
  assert.ok(!JSON.stringify(lista.corpo).includes(criada.corpo.chave));
  assert.ok(!('hash' in lista.corpo.chaves[0]));

  // a chave funciona na porta da IA e para de funcionar na hora em que é revogada
  const usar = () => fetch(`http://127.0.0.1:${porta}/api/ia/v1`, { headers: { authorization: `Bearer ${criada.corpo.chave}` } });
  assert.equal((await usar()).status, 200);
  const rev = await pedir('DELETE', `/api/ia/chaves/${criada.corpo.registro.id}`, 'admin');
  assert.equal(rev.status, 200); assert.equal(rev.corpo.registro.ativa, false);
  assert.equal((await usar()).status, 401);
  assert.equal((await pedir('DELETE', '/api/ia/chaves/00000000-0000-4000-8000-000000000000', 'admin')).status, 404);

  assert.deepEqual(auditorias.map(a => a.acao), ['trafego_ia_chave_criada', 'trafego_ia_chaves_vistas', 'trafego_ia_chave_revogada']);
  assert.ok(!JSON.stringify(auditorias).includes(criada.corpo.chave), 'a auditoria nunca leva a chave');
  assert.equal(auditorias[0].detalhes.prefixo, criada.corpo.chave.slice(0, 8));
});
