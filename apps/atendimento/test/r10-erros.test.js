'use strict';
/* Rodada 10: erro que não vaza detalhe interno. O texto cru do banco (tabela, coluna, regra) e do
   provedor de IA fica no log do servidor; a tela recebe uma frase simples. */
const test = require('node:test');
const assert = require('node:assert/strict');
const IA = require('../lib/ia-copiloto.js');
const FUN = require('../lib/ia-funil.js');
const CTX = require('../lib/contexto.js');
const RD = require('../lib/resumo-dia.js');
const { criarR6 } = require('../lib/r6-dados.js');
const PAT = require('../lib/patio.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');
const { ID, AGORA, tabelas, criarIAFalsa } = require('./apoio/dados.js');
const { comServidorR10, ID: IDS } = require('./apoio/r10-servidor.js');

const CRU = 'duplicate key value violates unique constraint "ia_acoes_pkey" on relation public.ia_acoes (column perfil_id)';
const RE_CRU = /duplicate key|constraint|relation|public\.|pkey|column|does not exist/i;
const PERFIL = { id: ID.admin, papel: 'admin' };

function montar(falhas) {
  const sb = criarSbFalso(tabelas(), { relogio: () => AGORA, falhas });
  const contexto = CTX.criarContexto({ sb, agora: () => AGORA });
  const logs = [];
  const antes = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  const cop = IA.criarCopiloto({ sb, contexto, criarIA: async () => criarIAFalsa(() => ({ stop_reason: 'end_turn', content: [] })), persona: 'P', agora: () => AGORA });
  return { sb, contexto, cop, logs, fim: () => { console.error = antes; } };
}

test('R10-ATD-020: copiloto, fila da IA e resumo do dia não devolvem o erro cru do banco', async () => {
  let m = montar({ ia_acoes: { op: 'select', msg: CRU } });
  try {
    const lista = await m.cop.listarAcoes(ID.conversa);
    assert.equal(lista.ok, false);
    assert.doesNotMatch(lista.erro, RE_CRU);
    assert.match(lista.erro, /Tente de novo/);
    const exec = await m.cop.executarAcao('12121212-1212-4121-8121-121212121212', PERFIL);
    assert.doesNotMatch(exec.erro, RE_CRU);
    const funil = FUN.criarFunil({ sb: m.sb, copiloto: m.cop, contexto: m.contexto, zapParado: () => ({ parado: false }), enviarMensagem: async () => ({ ok: true }), log: () => {} });
    const hoje = await funil.hoje();
    assert.equal(hoje.ok, false);
    assert.doesNotMatch(hoje.erro, RE_CRU);
    assert.ok(m.logs.some(l => RE_CRU.test(l)), 'o detalhe fica no log do servidor');
  } finally { m.fim(); }

  m = montar({ ia_config: { op: 'upsert', msg: CRU } });
  try {
    const cfg = await m.cop.salvarConfig({ limite_chamadas_dia: 50 }, PERFIL);
    assert.equal(cfg.ok, false);
    assert.doesNotMatch(cfg.erro, RE_CRU);
  } finally { m.fim(); }

  m = montar({ conversas: { op: 'select', msg: CRU } });
  try {
    const ficha = await m.contexto.montarContexto(ID.conversa);
    assert.equal(ficha.ok, false);
    assert.doesNotMatch(ficha.erro, RE_CRU);
    const resumo = await RD.criarResumoDoDia({ sb: m.sb, criarIA: async () => criarIAFalsa(() => ({})), copiloto: m.cop, agora: () => AGORA })({ perfil: PERFIL });
    assert.equal(resumo.ok, false);
    assert.doesNotMatch(resumo.erro, RE_CRU);
  } finally { m.fim(); }
});

test('R10-ATD-021: avisos da ficha, do pátio e da fila dizem o que não carregou, sem o erro cru do banco', async () => {
  const logs = [];
  const antes = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const sb = criarSbFalso(tabelas(), { relogio: () => AGORA, falhas: { agendamentos: { op: 'select', msg: CRU }, patio_os: { op: 'select', msg: CRU } } });
    const contexto = CTX.criarContexto({ sb, agora: () => AGORA });
    const r = await contexto.montarContexto(ID.conversa);
    assert.equal(r.ok, true);
    assert.ok(r.ficha.avisos.length > 0, 'a ficha diz que faltou parte');
    for (const a of r.ficha.avisos) { assert.doesNotMatch(a, RE_CRU, a); assert.match(a, /^Não consegui ler/); }
    const p = await PAT.criarPatio({ sb, agora: () => AGORA }).lerPatio({ clienteId: ID.cliente, avisos: [] });
    assert.equal(p.ordem, null);
    const r6 = criarR6({ sb, patio: PAT.criarPatio({ sb, agora: () => AGORA }), agora: () => AGORA });
    const fila = await r6.filaContexto();
    for (const a of fila.avisos) assert.doesNotMatch(a, RE_CRU, a);
    assert.ok(fila.avisos.length > 0);
    assert.ok(logs.some(l => RE_CRU.test(l)), 'o detalhe fica no log do servidor');
  } finally { console.error = antes; }
});

test('R10-ATD-022: quando a IA do Sugerir falha, a tela não recebe a resposta crua do provedor', async () => {
  await comServidorR10({ env: { ANTHROPIC_API_KEY: 'chave-de-mentira-da-ia' } }, async ({ pedir, app, logs }) => {
    const sdk = require.resolve('@anthropic-ai/sdk', { paths: [require('node:path').join(__dirname, '..')] });
    const antes = require.cache[sdk];
    require.cache[sdk] = { id: sdk, filename: sdk, loaded: true, exports: class { constructor() { this.messages = { create: async () => {
      throw Object.assign(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011CXyz"}'), { status: 401 });
    } }; } } };
    try {
      const r = await pedir('/api/ia/sugerir', { metodo: 'POST', como: 'atendente', corpo: { mensagens: [{ direcao: 'entrada', corpo: 'oi' }] } });
      assert.equal(r.corpo.ok, false);
      assert.doesNotMatch(r.texto, /authentication_error|x-api-key|request_id|req_011/);
      assert.match(r.corpo.erro, /IA/);
      assert.ok(logs.some(l => /authentication_error/.test(l)), 'o detalhe fica no log');
    } finally { if (antes) require.cache[sdk] = antes; else delete require.cache[sdk]; }
    assert.ok(app);
  });
  assert.ok(IDS.admin);
});

test('R10-ATD-023: relatório recusa dia que não existe (31/02) em vez de contar outro período', async () => {
  await comServidorR10({}, async ({ pedir }) => {
    for (const q of ['de=2026-02-31&ate=2026-03-05', 'de=2026-02-01&ate=2026-04-31', 'de=2026-13-01&ate=2026-12-01']) {
      const r = await pedir('/api/relatorios?' + q, { como: 'admin' });
      assert.equal(r.status, 400, q);
      assert.match(r.corpo.erro, /Datas inválidas/);
    }
  });
});
