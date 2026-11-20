'use strict';
/* Rodada 9: o arquivo do Google diz quantas vendas levou (cabeçalho X-Vendas), para a tela não baixar arquivo vazio. */
const test = require('node:test');
const assert = require('node:assert/strict');
const seg = require('../seguranca');
const devolucao = require('../devolucao');

class ErroHttp extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
function montar(dependencias) {
  const registrar = require('../rotas/coleta');
  const rotas = new Map();
  const ctx = {
    rota: (m, c, fn) => rotas.set(`${m} ${c}`, fn), rotaPublica: (m, c, fn) => rotas.set(`${m} ${c}`, fn), ErroHttp,
    exigirCron: () => {}, limitador: seg.criarLimitador(), equipe: { banco: () => ({ auditar: async () => {} }) },
  };
  const antigas = registrar.dependencias;
  registrar.dependencias = dependencias;
  registrar(ctx);
  return { rotas, voltar: () => { registrar.dependencias = antigas; } };
}
const resFalso = () => { const r = { cab: {}, setHeader: (k, v) => { r.cab[k] = v; }, writeHead: (s, h) => { r.status = s; Object.assign(r.cab, h); }, end: (c) => { r.corpo = c; } }; return r; };
const agora = Date.now();
const venda = (id, extra) => ({ lead_id: id, valor: 850, vendido_em: agora - 86400000, clique_em: agora - 3 * 86400000, gclid: null, gbraid: null, wbraid: null, ...extra });

async function baixar(vendas) {
  const { rotas, voltar } = montar({ devolucao: { ...devolucao, lerVendas: async () => ({ pronto: true, vendas }) } });
  try {
    const res = resFalso();
    await rotas.get('GET /api/devolucao/google.csv')({ q: new URLSearchParams(), res, usuario: { id: 'u' } });
    return res;
  } finally { voltar(); }
}

test('GET /api/devolucao/google.csv: X-Vendas conta só as vendas que foram no arquivo', async () => {
  const res = await baixar([venda('L1', { gclid: 'EAIaIQobChMI-teste-1' }), venda('L2', { wbraid: 'WBRAID-teste-2' }), venda('L3', {})]);
  assert.equal(res.status, 200);
  assert.equal(res.cab['X-Vendas'], '2', 'a venda sem clique do Google não entra');
  assert.equal(String(res.corpo).trim().split('\r\n').length, 3, 'cabeçalho + 2 vendas');
});

test('GET /api/devolucao/google.csv: sem venda de clique, X-Vendas é 0 (a tela avisa em vez de baixar)', async () => {
  const res = await baixar([venda('L3', {})]);
  assert.equal(res.cab['X-Vendas'], '0');
});
