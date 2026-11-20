'use strict';
/* Rodada 10 (segurança): política de conteúdo só com o endereço do banco da casa, arquivo de bastidor que não é
   servido, telefone do dono mascarado para quem não é administrador, limite nas gravações que não tinham e
   endereço torto que virava erro interno. */
process.env.SUPABASE_URL = 'https://projetodacasa.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'servico-de-teste';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const seg = require('../seguranca');
const Chaves = require('../ia/chaves');
const { subir } = require('./apoio/r10-http');

let app;
const orig = { lerConfig: db.lerConfig, salvarConfig: db.salvarConfig };
const CONFIG = { id: true, orcamento_mensal: 3000, ticket_medio: 480, margem_pct: 45, whatsapp_destinos: ['5512990001234', '5512981115678'] };

test.before(async () => {
  db.lerConfig = async () => ({ ...CONFIG, whatsapp_destinos: [...CONFIG.whatsapp_destinos] });
  db.salvarConfig = async v => v;
  app = await subir();
});
test.after(async () => { Object.assign(db, orig); await app.fechar(); });

test('política de conteúdo: a tela só conversa com o banco da casa (sem *.supabase.co, sem wss)', async () => {
  const r = await app.pedir('/api/ping', { papel: null });
  const csp = r.cabecalhos.get('content-security-policy');
  assert.match(csp, /connect-src 'self' https:\/\/projetodacasa\.supabase\.co(;|$)/);
  assert.doesNotMatch(csp, /\*\.supabase\.co/);
  assert.doesNotMatch(csp, /wss:/, 'a tela não usa canal em tempo real');
  assert.equal(seg.cspPara('http://localhost:54321'), seg.cspPara(''), 'endereço que não é https não entra: fica o padrão');
  assert.match(seg.cspPara(''), /connect-src 'self' https:\/\/\*\.supabase\.co(;|$)/, 'sem endereço configurado vale o padrão da casa');
});

test('arquivo de bastidor da tela (package.json) não é servido', async () => {
  for (const caminho of ['/js/package.json', '/js/PACKAGE.JSON', '/package-lock.json']) {
    const r = await app.pedir(caminho, { papel: null });
    assert.equal(r.status, 404, caminho);
  }
  assert.equal((await app.pedir('/js/app.js', { papel: null })).status, 200, 'os arquivos da tela seguem servidos');
  assert.equal((await app.pedir('/manifest.json', { papel: null })).status, 200, 'o manifest segue servido');
});

test('metas: o gestor não recebe os telefones que recebem os relatórios (só o final), o administrador recebe', async () => {
  const gestor = await app.pedir('/api/config', { papel: 'gestor' });
  assert.equal(gestor.status, 200);
  assert.deepEqual(gestor.json.whatsapp_destinos, ['•••1234', '•••5678']);
  assert.equal(gestor.json.orcamento_mensal, 3000, 'as metas seguem visíveis');
  const salvou = await app.pedir('/api/config', { papel: 'gestor', metodo: 'POST', corpo: { ticket_medio: 500 } });
  assert.equal(salvou.status, 200);
  assert.deepEqual(salvou.json.whatsapp_destinos, ['•••1234', '•••5678'], 'a resposta de salvar também vem mascarada');
  const admin = await app.pedir('/api/config', { papel: 'admin' });
  assert.deepEqual(admin.json.whatsapp_destinos, CONFIG.whatsapp_destinos);
});

test('salvar metas tem limite por pessoa (30 em 10 minutos)', async () => {
  app.limitador.limpar();
  let ultimo;
  for (let i = 0; i < 31; i++) ultimo = await app.pedir('/api/config', { papel: 'gestor', metodo: 'POST', corpo: { ticket_medio: 400 + i } });
  assert.equal(ultimo.status, 429);
  assert.ok(Number(ultimo.cabecalhos.get('retry-after')) > 0);
  assert.equal((await app.pedir('/api/config', { papel: 'admin', metodo: 'POST', corpo: { ticket_medio: 400 } })).status, 200, 'o limite é por pessoa');
});

test('criar chave da IA tem limite por pessoa (10 em 10 minutos)', async () => {
  app.limitador.limpar();
  const padrao = Chaves.padrao();
  const criar = padrao.criar;
  let criadas = 0;
  padrao.criar = async (c) => { criadas++; return { chave: 'ica_teste', registro: { id: 'k' + criadas, nome: c.nome, prefixo: 'ica_te', escopos: ['ler'], ver_pii: false } }; };
  try {
    let ultimo;
    for (let i = 0; i < 11; i++) ultimo = await app.pedir('/api/ia/chaves', { metodo: 'POST', corpo: { nome: 'Chave ' + i, escopos: ['ler'] } });
    assert.equal(ultimo.status, 429);
    assert.equal(criadas, 10, 'a décima primeira não chegou a ser criada');
  } finally { padrao.criar = criar; }
});

test('endereço com % torto na conversa do Gestor: 400 com frase, não erro interno', async () => {
  const r = await app.pedir('/api/gestor/conversas/%E0%A4%A');
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /Endereço/);
});

test('política de conteúdo: só a tela antiga religada ganha o canal em tempo real, e do mesmo endereço', () => {
  const csp = seg.cspPara('https://projetodacasa.supabase.co', { tempoReal: true });
  assert.ok(csp.includes("connect-src 'self' https://projetodacasa.supabase.co wss://projetodacasa.supabase.co;"), csp);
});
