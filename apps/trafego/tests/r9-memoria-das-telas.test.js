'use strict';
/* Rodada 9: quem grava faz as telas lerem de novo. A fonte das telas (Hoje, Campanhas, Conexões) guarda cada
   leitura por 30 s; antes, logo depois de guardar um acesso ou de buscar os números, a tela seguia com
   "não ligada" ou "Números buscados há 16 h". */
const test = require('node:test');
const assert = require('node:assert/strict');
const Fonte = require('../motor/fonte');
const C = require('../conexoes');
const seg = require('../seguranca');
const registrarColeta = require('../rotas/coleta');

class ErroHttp extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

/** Banco de mentira que aceita qualquer encadeamento (select, eq, order…) e conta as idas ao banco. */
function bancoContado() {
  const b = { idas: 0 };
  const consulta = () => {
    const q = { then: (ok, erro) => { b.idas++; return Promise.resolve({ data: [], error: null }).then(ok, erro); } };
    for (const k of ['select', 'eq', 'neq', 'order', 'limit', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'not', 'or', 'range', 'maybeSingle', 'single']) q[k] = () => q;
    return q;
  };
  b.from = () => consulta();
  b.rpc = () => consulta();
  return b;
}

/** A fonte do app com o banco de mentira; devolve ao estado de antes no fim. */
async function comFonteDoApp(sb, fn) {
  const f = Fonte.padrao();
  f.trocar({ sb });
  try { await fn(f); } finally { f.trocar({ sb: null }); }
}

test('esquecerLeituras: dentro dos 30 s a leitura vem da memória; depois de esquecer, vai ao banco', async () => {
  const sb = bancoContado();
  await comFonteDoApp(sb, async (f) => {
    await f.conexoes();
    const antes = sb.idas;
    await f.conexoes();
    assert.equal(sb.idas, antes, 'da memória');
    Fonte.esquecerLeituras();
    await f.conexoes();
    assert.ok(sb.idas > antes, 'lê de novo');
  });
});

test('guardar um acesso faz as telas lerem as conexões de novo (acesso recusado não mexe em nada)', async () => {
  const sb = bancoContado();
  await comFonteDoApp(sb, async (f) => {
    await f.conexoes();
    assert.ok(f.tamanho > 0);
    await assert.rejects(C.salvar('meta', {}, { gravar: async () => ({}) }));
    assert.ok(f.tamanho > 0, 'recusado: a memória fica');
    await C.salvar('meta', { meta_access_token: 'EAA' + 'z'.repeat(40), meta_ad_account_id: '123456' },
      { gravar: async (canal, cred) => ({ id: 'x', canal, ativo: true, ...cred }) });
    assert.equal(f.tamanho, 0, 'guardado: a memória some');
  });
});

test('POST /api/coleta/agora esquece a leitura das telas depois da busca (e não antes)', async () => {
  const original = registrarColeta.dependencias;
  const ordem = [];
  registrarColeta.dependencias = {
    coletor: { sincronizar: async () => { ordem.push('buscou'); return { plataformas: { meta: { ok: true, linhas: 3 } } }; } },
    fonte: { esquecerLeituras: () => ordem.push('esqueceu') },
  };
  try {
    const rotas = new Map();
    registrarColeta({ rota: (m, c, fn) => rotas.set(`${m} ${c}`, fn), rotaPublica: () => {}, exigirCron: () => {}, ErroHttp,
      limitador: seg.criarLimitador(), equipe: { banco: () => ({ auditar: async () => true }) } });
    const r = await rotas.get('POST /api/coleta/agora')({ usuario: { id: 'u' }, corpo: async () => ({}), res: { setHeader() {} } });
    assert.equal(r.plataformas.meta.linhas, 3);
    assert.deepEqual(ordem, ['buscou', 'esqueceu']);
  } finally { registrarColeta.dependencias = original; }
});

test('lançar valor, motivo ou origem (jornada.esquecer) faz o Hoje e as Campanhas lerem os contatos de novo', async () => {
  const Jornada = require('../jornada');
  let leituras = 0;
  const jornada = { listarBruto: async () => { leituras++; return []; } };
  const f = Fonte.padrao();
  f.trocar({ sb: bancoContado(), jornada });
  try {
    const periodo = { de: '2026-11-01', ate: '2026-11-19' };
    await f.contatos(periodo);
    await f.contatos(periodo);
    assert.equal(leituras, 1, 'dentro dos 30 s, da memória');
    Jornada.esquecer();
    await f.contatos(periodo);
    assert.equal(leituras, 2, 'depois de gravar, lê de novo');
  } finally { f.trocar({ sb: null, jornada: undefined }); }
});

test('reaplicar as origens (de verdade) faz a Jornada e o Hoje lerem os contatos de novo; simular não', async () => {
  const Jornada = require('../jornada');
  const Origem = require('../origem');
  const original = Jornada.esquecer;
  let esquecidas = 0;
  Jornada.esquecer = () => { esquecidas++; };
  const sb = { rpc: async (nome, a) => ({ data: { analisados: 10, com_mensagem: 8, com_sinal: 3, [a.p_simular ? 'mudariam' : 'mudaram']: 3, por_origem: [], por_frase: [] }, error: null }) };
  try {
    Origem.esquecerSimulacoes();
    const quem = { id: 'joao' };
    const agora = Date.parse('2026-11-19T12:00:00-03:00');
    await Origem.reaplicar({ simular: true, desde: '2026-11-01', quem, sb, agora });
    assert.equal(esquecidas, 0, 'simular não muda nada');
    const r = await Origem.reaplicar({ simular: false, desde: '2026-11-01', quem, sb, agora: agora + 1000 });
    assert.equal(r.mudaram, 3);
    assert.equal(esquecidas, 1);
  } finally { Jornada.esquecer = original; Origem.esquecerSimulacoes(); }
});
