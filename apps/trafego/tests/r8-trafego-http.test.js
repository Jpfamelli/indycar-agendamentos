'use strict';
/* Rodada 8 (frente T2a) — as rotas novas pelo servidor de verdade, com porteiro, banco de mentira e jornada dublê:
   quem entra, o formato do que volta (contrato da API §5.2, §5.4 e §5.5), erro de entrada (400) e banco fora (503). */
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');
const equipe = require('../equipe');
const db = require('../db');
const Fonte = require('../motor/fonte');
const T = require('../motor/texto');
const D = require('./apoio/trafego-dados');
const { servidor, ROTAS_COM_ERRO } = require('../server');

const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PAPEIS = {
  admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true, nome: 'Marina Costa' } },
  gestor_ads: { usuario: { id: ID(2), papel: 'gestor', apps: ['ads'], ativo: true, nome: 'Rafa Lima' } },
  gestor_sem_ads: { usuario: { id: ID(3), papel: 'gestor', apps: ['crm'], ativo: true } },
};

let base, sb;
const fonte = Fonte.padrao();
const orig = { identificar: auth.identificar, banco: equipe.banco, sb: db.sb, temDados: db.temDados, temDadosReais: db.temDadosReais, temChaves: db.temChaves };

/** Troca o banco da fonte do app (e esquece o que estava guardado). */
function usarBanco(tabelas = D.tabelasDeHoje(), opcoes = {}, itens = D.contatosDeHoje()) {
  sb = D.fonteDeTeste({ tabelas, opcoesBanco: opcoes }).sb;
  db.sb = sb;
  fonte.trocar({ sb, jornada: D.jornadaDuble(itens), agora: () => D.AGORA });
}

test.before(async () => {
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async () => true });
  db.temDados = async () => false; db.temDadosReais = async () => false; db.temChaves = async () => false;
  usarBanco();
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  auth.identificar = orig.identificar;
  equipe.banco = orig.banco;
  Object.assign(db, { sb: orig.sb, temDados: orig.temDados, temDadosReais: orig.temDadosReais, temChaves: orig.temChaves });
  fonte.trocar({ sb: null, jornada: undefined, agora: Date.now });
  servidor.closeAllConnections?.();
  await new Promise(r => servidor.close(r));
});

async function pedir(caminho, { papel = 'admin' } = {}) {
  const r = await fetch(base + caminho, { headers: papel ? { 'x-papel': papel } : {} });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: r.status, json, texto };
}
const limpo = r => { assert.deepEqual(T.naoFinitos(r), []); assert.deepEqual(T.textosRuins(r), []); };

test('os arquivos de rotas desta frente carregam sem erro', () => {
  for (const f of ['hoje.js', 'campanhas.js', 'relatorios.js', 'conexoes.js']) assert.equal(ROTAS_COM_ERRO.includes(f), false, f);
});

test('GET /api/hoje: exige login e o app de anúncios', async () => {
  assert.equal((await pedir('/api/hoje', { papel: null })).status, 401);
  assert.equal((await pedir('/api/hoje', { papel: 'gestor_sem_ads' })).status, 403);
  assert.equal((await pedir('/api/hoje', { papel: 'gestor_ads' })).status, 200);
});

test('GET /api/hoje: o formato do contrato (§5.2) na situação de hoje', async () => {
  usarBanco();
  const { status, json } = await D.calado(() => pedir('/api/hoje?fresco=1'));
  assert.equal(status, 200);
  limpo(json);
  for (const k of ['periodo', 'estado', 'frase', 'numeros', 'derivados', 'fazer', 'ritmo', 'funil', 'origens', 'hoje', 'agenda', 'conexoes']) assert.ok(k in json, k);
  assert.equal(json.estado.gasto, 'sem_conta');
  assert.equal(json.numeros.length, 4);
  assert.equal(json.numeros[0].valor, null);
  assert.equal(json.fazer[0].id, 'whatsapp_parado');
  assert.equal(json.conexoes.whatsapp.desde, '2026-09-30');
});

test('GET /api/hoje: período ou plataforma inválidos dão 400 com frase; banco fora dá 503 com código "leitura"', async () => {
  const ruim = await pedir('/api/hoje?periodo=ano');
  assert.equal(ruim.status, 400);
  assert.match(ruim.json.erro, /Escolha um período/);
  const plat = await pedir('/api/hoje?plataforma=tiktok');
  assert.equal(plat.status, 400);
  assert.match(plat.json.erro, /meta ou google/);

  usarBanco(D.tabelasDeHoje(), { falhas: { ads_metricas_dia: 'connection refused para postgres://usuario:senha@host' } });
  const fora = await D.calado(() => pedir('/api/hoje?fresco=1'));
  assert.equal(fora.status, 503);
  assert.equal(fora.json.codigo, 'leitura');
  assert.match(fora.json.erro, /Não deu para ler as métricas dos anúncios agora/);
  assert.ok(fora.json.pedido, 'o número do pedido vem junto');
  assert.doesNotMatch(fora.texto, /senha|postgres/);
  usarBanco();
});

test('GET /api/conexoes: as quatro conexões, o passo a passo e nenhum segredo', async () => {
  usarBanco(D.tabelasDeHoje({ integracoes_ads: [{ canal: 'meta', ativo: true, meta_access_token: 'EAAG-segredo-de-teste', ultimo_sync_em: null }] }));
  const { status, json, texto } = await D.calado(() => pedir('/api/conexoes'));
  assert.equal(status, 200);
  limpo(json);
  assert.deepEqual(Object.keys(json).slice(0, 5), ['meta', 'google', 'site', 'whatsapp', 'passos']);
  assert.equal(json.whatsapp.situacao, 'chave_recusada');
  assert.equal(json.passos.length, 5);
  for (const p of json.passos) assert.ok(typeof p.feito === 'boolean' && p.titulo && p.como && p.acao && p.acao.ir);
  assert.equal(json.faltam, json.passos.filter(p => !p.feito).length);
  assert.doesNotMatch(texto, /EAAG|segredo|access_token|api_key/);
  assert.equal((await pedir('/api/conexoes', { papel: null })).status, 401);
  usarBanco();
});

test('GET /api/campanhas e o detalhe: formato do contrato (§5.4), 404 para campanha fora do período e 400 para endereço ruim', async () => {
  usarBanco();
  const lista = await D.calado(() => pedir('/api/campanhas?fresco=1'));
  assert.equal(lista.status, 200);
  limpo(lista.json);
  for (const k of ['periodo', 'estado', 'totais', 'campanhas', 'sem_campanha', 'horarios']) assert.ok(k in lista.json, k);
  assert.equal(lista.json.estado.gasto, 'sem_conta');
  const google = lista.json.campanhas.find(c => c.plataforma === 'google');
  const det = await D.calado(() => pedir(`/api/campanhas/google/${encodeURIComponent(google.chave)}`));
  assert.equal(det.status, 200);
  limpo(det.json);
  for (const k of ['campanha', 'conjuntos', 'palavras', 'termos', 'contatos']) assert.ok(k in det.json, k);
  assert.equal(det.json.campanha.nome, 'Freios Taubaté');

  const fora = await D.calado(() => pedir('/api/campanhas/meta/999999'));
  assert.equal(fora.status, 404);
  assert.equal(fora.json.codigo, 'sem_campanha');
  assert.equal((await pedir('/api/campanhas/tiktok/1')).status, 400);
  assert.equal((await pedir('/api/campanhas?plataforma=bing')).status, 400);
  assert.equal((await pedir('/api/campanhas', { papel: 'gestor_sem_ads' })).status, 403);
});

test('GET /api/relatorios/texto|folha|apresentacao: formato e 400 de entrada', async () => {
  usarBanco();
  const texto = await D.calado(() => pedir('/api/relatorios/texto?tipo=semanal'));
  assert.equal(texto.status, 200);
  limpo(texto.json);
  assert.deepEqual([typeof texto.json.titulo, typeof texto.json.texto, texto.json.motor], ['string', 'string', 'oficina']);
  assert.equal((await pedir('/api/relatorios/texto?tipo=anual')).status, 400);

  const folha = await D.calado(() => pedir('/api/relatorios/folha?mes=2026-11'));
  assert.equal(folha.status, 200);
  limpo(folha.json);
  assert.equal(folha.json.mes.mes, '2026-11');
  assert.equal((await pedir('/api/relatorios/folha?mes=2099-01')).status, 400);

  const ap = await D.calado(() => pedir('/api/relatorios/apresentacao'));
  assert.equal(ap.status, 200);
  limpo(ap.json);
  assert.equal(ap.json.telas[0].id, 'resumo');
  assert.equal((await pedir('/api/relatorios/apresentacao', { papel: null })).status, 401);
});
