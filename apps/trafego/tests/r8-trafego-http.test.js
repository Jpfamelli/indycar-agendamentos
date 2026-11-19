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
