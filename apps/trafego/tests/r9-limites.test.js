'use strict';
/* Rodada 9: o diário de decisões e as conversas novas do Gestor têm limite por pessoa. */
const test = require('node:test');
const assert = require('node:assert/strict');
const seg = require('../seguranca');
const Decisoes = require('../ia/decisoes');

class ErroHttp extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

test('diário: 60 escritas em 10 min por pessoa; a 61ª volta 429 com Retry-After, e outra pessoa segue', async () => {
  const original = Decisoes.padrao;
  const acao = { id: 'a1', tipo: 'outro', status: 'feita', origem: 'pessoa' };
  Decisoes.padrao = () => ({ registrarPropria: async () => acao, decidir: async () => ({ ...acao, status: 'aceita' }), marcarFeita: async () => ({ acao, aviso: null }) });
  try {
    const rotas = new Map();
    require('../rotas/acoes-trafego')({
      rota: (m, c, fn) => rotas.set(`${m} ${typeof c === 'string' ? c : 'id'}`, fn), rotaPublica: () => {}, exigirCron: () => {},
      equipe: { banco: () => ({ auditar: async () => true }) }, limitador: seg.criarLimitador(), ErroHttp,
    });
    const registrar = rotas.get('POST /api/acoes-trafego');
    const res = () => { const r = { cab: {}, setHeader: (k, v) => { r.cab[k] = v; } }; return r; };
    const paulo = { id: 'paulo' };
    for (let i = 0; i < 60; i++) assert.equal((await registrar({ usuario: paulo, corpo: async () => ({}), res: res() })).ok, true);
    const r = res();
    await assert.rejects(registrar({ usuario: paulo, corpo: async () => ({}), res: r }), (e) => e.status === 429 && e.extra.codigo === 'limite' && /diário/.test(e.message));
    assert.ok(Number(r.cab['Retry-After']) > 0);
    // decidir e marcar como feita contam no mesmo limite
    await assert.rejects(rotas.get('POST id')({ usuario: paulo, corpo: async () => ({}), m: [null, 'x'], res: res() }), (e) => e.status === 429);
    assert.equal((await registrar({ usuario: { id: 'joao' }, corpo: async () => ({}), res: res() })).ok, true, 'o limite é de cada pessoa');
  } finally { Decisoes.padrao = original; }
});

test('conversa nova do Gestor entra nas rotas com limite por pessoa', () => {
  assert.equal(seg.LIMITES_CAROS['POST /api/gestor/conversas'], 30);
});
