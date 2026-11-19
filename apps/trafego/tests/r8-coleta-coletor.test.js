/* Rodada 8 (T6): coletor (janela, gravação idempotente, demonstração, sem colunas novas, uma por vez),
   click_view nos contatos, miniatura e as rotas de rotas/coleta.js. Banco de mentira, plataformas de mentira. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarBanco } = require('./apoio/banco-falso');
const coletor = require('../coletor');
const google = require('../google');
const seg = require('../seguranca');

let subir;
const esperar = async () => {};
const ENV = ['META_GRAPH_URL', 'GOOGLE_ADS_API_URL', 'GOOGLE_OAUTH_TOKEN_URL'];
const antes = {};
test.before(async () => {
  ({ subirPlataformasFalsas: subir } = await import('../scripts/mock-server.mjs'));
  for (const k of ENV) antes[k] = process.env[k];
});
test.after(() => { for (const k of ENV) if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; });
const apontar = P => { process.env.META_GRAPH_URL = P.meta; process.env.GOOGLE_ADS_API_URL = P.google; process.env.GOOGLE_OAUTH_TOKEN_URL = P.oauth; google.esquecerToken(); };
const silencio = { escrever: () => {} };

/** banco-falso (frente T2b) + upsert pela chave única, com os erros do PostgREST para tabela ou coluna que falta. */
function banco(tabelas, opcoes = {}) {
  const sb = criarBanco(tabelas, opcoes);
  const from = sb.from;
  sb.upserts = [];
  sb.from = t => {
    const c = from(t);
    c.upsert = (linhas, { onConflict }) => {
      const fazer = () => {
        sb.upserts.push({ tabela: t, colunas: Object.keys(linhas[0] || {}), n: linhas.length });
        if (!Array.isArray(tabelas[t])) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` } };
        const falta = Object.keys(linhas[0] || {}).find(k => ((opcoes.colunasAusentes || {})[t] || []).includes(k));
        if (falta) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${falta}' column of '${t}' in the schema cache` } };
        const chaves = onConflict.split(',');
        const chave = l => JSON.stringify(chaves.map(k => (k === 'entidade_ext' ? (l.anuncio_ext ?? l.conjunto_ext ?? l.campanha_ext ?? l.conta_ext) : (l[k] ?? null))));
        for (const n of linhas) {
          const i = tabelas[t].findIndex(l => chave(l) === chave(n));
          if (i >= 0) Object.assign(tabelas[t][i], n); else tabelas[t].push({ id: `u${tabelas[t].length + 1}`, ...n });
        }
        return { data: null, error: null };
      };
      return { then: (ok, falhou) => Promise.resolve().then(fazer).then(ok, falhou) };
    };
    return c;
  };
  return sb;
}

const integracoes = (tokenMeta = 'TOKEN-FALSO-60D') => [
  { id: 'm1', canal: 'meta', ativo: true, meta_ad_account_id: 'act_1234567890', meta_access_token: tokenMeta, meta_token_expira_em: null },
  { id: 'g1', canal: 'google', ativo: true, google_customer_id: '1234567890', google_client_id: 'c.apps.googleusercontent.com', google_client_secret: 'segredo-falso', google_refresh_token: 'refresh-falso', google_developer_token: 'ANTIGO' },
];
const linhaDemo = { plataforma: 'meta', data: '2026-10-01', nivel: 'campanha', campanha_ext: 'demo-m1', fonte: 'demo' };
const linhaRealAntiga = { plataforma: 'meta', data: '2026-01-05', nivel: 'campanha', campanha_ext: '999', fonte: 'api', gasto: 10 };

test('coletor: grava Meta e Google com as colunas novas, termos, validade do token; tira a demonstração e não apaga o real', async () => {
  const P = await subir();
  apontar(P);
  try {
    const sb = banco({ integracoes_ads: integracoes(), ads_metricas_dia: [{ ...linhaDemo }, { ...linhaRealAntiga }], ads_termos_dia: [] });
    const r = await coletor.sincronizar({ sb, lerIntegracoes: async () => sb.tabelas.integracoes_ads, opcoesMotor: { esperar }, log: silencio });
    assert.equal(r.plataformas.meta.ok, true, JSON.stringify(r.plataformas.meta));
    assert.equal(r.plataformas.google.ok, true, JSON.stringify(r.plataformas.google));
    assert.equal(r.plataformas.meta.versao, 'v27.0');
    assert.equal(r.plataformas.google.versao, 'v26');
    assert.equal(Date.parse(`${r.ate}T00:00:00Z`) - Date.parse(`${r.de}T00:00:00Z`), 7 * 86400000, 'janela de 7 dias');
    assert.equal(r.demo_removida, true);
    const linhas = sb.tabelas.ads_metricas_dia;
    assert.ok(!linhas.some(l => l.fonte === 'demo'));
    assert.ok(linhas.some(l => l.campanha_ext === '999'), 'dado real antigo continua');
    assert.equal(linhas.filter(l => l.plataforma === 'meta').length, 8 * 8 + 1, '8 dias x (2 campanhas + 2 conjuntos + 4 anúncios) + a antiga');
    const colunas = sb.upserts.find(u => u.tabela === 'ads_metricas_dia').colunas;
    for (const c of ['objetivo', 'miniatura_url', 'conversas', 'status']) assert.ok(colunas.includes(c), c);
    assert.ok(sb.tabelas.ads_termos_dia.length > 0);
    const m1 = sb.tabelas.integracoes_ads.find(i => i.id === 'm1');
    assert.match(m1.ultimo_sync_status, /^ok — \d+ linhas/);
    assert.match(m1.meta_token_expira_em, /^\d{4}-\d{2}-\d{2}$/, 'a validade do acesso vem do debug_token');
    assert.ok(m1.ultimo_sync_em);
    assert.match(sb.tabelas.integracoes_ads.find(i => i.id === 'g1').ultimo_sync_status, /termos/);
    // de novo: idempotente (mesmo número de linhas)
    const n = linhas.length;
    await coletor.sincronizar({ sb, lerIntegracoes: async () => sb.tabelas.integracoes_ads, opcoesMotor: { esperar }, log: silencio });
    assert.equal(sb.tabelas.ads_metricas_dia.length, n);
  } finally { await P.fechar(); }
});

test('coletor: banco antes da migração (sem colunas novas e sem ads_termos_dia) grava assim mesmo, com aviso', async () => {
  const P = await subir();
  apontar(P);
  try {
    const sb = banco({ integracoes_ads: integracoes('TOKEN-FALSO'), ads_metricas_dia: [] }, { colunasAusentes: { ads_metricas_dia: ['objetivo', 'miniatura_url', 'conversas'] } });
    const r = await coletor.sincronizar({ sb, lerIntegracoes: async () => sb.tabelas.integracoes_ads, opcoesMotor: { esperar }, log: silencio });
    assert.equal(r.plataformas.meta.ok, true);
    assert.ok(r.plataformas.meta.avisos.some(a => /colunas novas/.test(a)));
    assert.ok(r.plataformas.google.avisos.some(a => /termos/.test(a)));
    assert.ok(sb.tabelas.ads_metricas_dia.length > 0);
    assert.ok(sb.tabelas.ads_metricas_dia.every(l => !('objetivo' in l)));
    assert.match(sb.tabelas.integracoes_ads[0].ultimo_sync_status, /aviso/);
  } finally { await P.fechar(); }
});

test('coletor: erro numa plataforma não derruba a outra e fica registrado sem o token', async () => {
  const P = await subir();
  apontar(P);
  try {
    const sb = banco({ integracoes_ads: integracoes('TOKEN-FALSO-VENCIDO'), ads_metricas_dia: [{ ...linhaDemo }], ads_termos_dia: [] });
    const linhasLog = [];
    const r = await coletor.sincronizar({ sb, lerIntegracoes: async () => sb.tabelas.integracoes_ads, opcoesMotor: { esperar }, log: { escrever: l => linhasLog.push(JSON.parse(l)) } });
    assert.equal(r.plataformas.meta.ok, false);
    assert.match(r.plataformas.meta.titulo, /inválido ou vencido/);
    assert.equal(r.plataformas.google.ok, true);
    const m1 = sb.tabelas.integracoes_ads.find(i => i.id === 'm1');
    assert.match(m1.ultimo_sync_status, /^erro — Meta API 400: .*código 190/);
    assert.ok(!m1.ultimo_sync_status.includes('TOKEN-FALSO'));
    assert.ok(m1.ultimo_sync_em, 'a data da tentativa é gravada mesmo com erro');
    const evento = linhasLog.find(l => l.evento === 'coleta_plataforma' && l.plataforma === 'meta');
    assert.equal(evento.ok, false);
    assert.ok(typeof evento.ms === 'number');
    assert.ok(linhasLog.some(l => l.evento === 'coleta' && l.linhas > 0));
    assert.ok(!JSON.stringify(linhasLog).includes('TOKEN-FALSO'));
    assert.equal(r.demo_removida, true, 'o Google trouxe dado real');
  } finally { await P.fechar(); }
});

test('coletor: uma coleta por vez (quem chama no meio espera a mesma)', async () => {
  let rodadas = 0;
  const motores = { meta: { coletar: async () => { rodadas++; await new Promise(r => setTimeout(r, 30)); return { linhas: [], termos: [], avisos: [] }; } } };
  const sb = banco({ integracoes_ads: [{ id: 'm1', canal: 'meta', ativo: true }], ads_metricas_dia: [] });
  const op = { sb, lerIntegracoes: async () => sb.tabelas.integracoes_ads, motores, log: silencio };
  const [a, b] = await Promise.all([coletor.sincronizar(op), coletor.sincronizar(op)]);
  assert.equal(rodadas, 1);
  assert.equal(b.ja_estava_rodando, true);
  assert.equal(a.plataformas.meta.ok, true);
  const s = await coletor.situacao({ lerIntegracoes: async () => [{ canal: 'meta', ativo: true, meta_access_token: 'x', meta_ad_account_id: 'act_1', ultimo_sync_status: 'erro — Meta API 400: x (código 190) access_token=SEGREDO' }] });
  assert.equal(s.rodando, false);
  assert.equal(s.contas[0].ok, false);
  assert.match(s.contas[0].aviso.titulo, /vencido/);
  assert.ok(!JSON.stringify(s).includes('SEGREDO'));
});

test('click_view: liga o contato com gclid à campanha e à palavra, só preenchendo o que está vazio', async () => {
  const P = await subir({ hoje: '2026-11-19', cliques: { '2026-11-15': [{ gclid: 'Cj0KCQiA-falso-1', palavra: 'troca de oleo' }] } });
  apontar(P);
  try {
    const lead = (id, gclid, extra = {}) => ({ id, gclid, created_at: '2026-11-15T13:00:00Z', origem_em: null, origem: 'whatsapp', origem_paga: null, origem_plataforma: null,
      campanha_ext: null, campanha_nome: null, conjunto_ext: null, conjunto_nome: null, anuncio_ext: null, palavra_chave: null, rastreio: null, ...extra });
    const sb = banco({
      leads: [lead('L1', 'Cj0KCQiA-falso-1'), lead('L2', 'Cj0KCQiA-sem-clique'), lead('L3', 'Cj0KCQiA-falso-1', { origem_plataforma: 'meta', origem: 'meta' })],
      trafego_rastreio: [{ lead_id: 'L1', gclid: 'Cj0KCQiA-falso-1', criado_em: '2026-11-15T12:58:00Z' }],
      integracoes_ads: integracoes(),
    });
    const r = await coletor.ligarCliques({ sb, lerIntegracoes: async () => sb.tabelas.integracoes_ads, agora: () => Date.parse('2026-11-19T15:00:00Z'), opcoesMotor: { esperar }, log: silencio });
    assert.deepEqual([r.procurados, r.dias_consultados, r.ligados, r.sem_clique], [2, 1, 1, 1]);
    const [l1, l2, l3] = sb.tabelas.leads;
    assert.deepEqual([l1.campanha_ext, l1.conjunto_ext, l1.anuncio_ext, l1.palavra_chave, l1.origem, l1.origem_paga, l1.origem_plataforma],
      ['2000001', '3000001', '4000001', 'troca de oleo', 'google', true, 'google']);
    assert.equal(l1.rastreio.click_view.dia, '2026-11-15');
    assert.equal(l2.campanha_ext, null);
    assert.equal(l3.campanha_ext, null, 'contato marcado como Meta não é mexido');
    const semColunas = banco({ leads: [], integracoes_ads: integracoes() }, { colunasAusentes: { leads: ['gclid'] } });
    const p = await coletor.ligarCliques({ sb: semColunas, lerIntegracoes: async () => semColunas.tabelas.integracoes_ads, log: silencio });
    assert.equal(p.pulado, true);
    const semGoogle = await coletor.ligarCliques({ sb, lerIntegracoes: async () => [integracoes()[0]], log: silencio });
    assert.equal(semGoogle.ok, false);
  } finally { await P.fechar(); }
});

test('miniatura: só sai imagem de domínio da Meta/Google gravado pela coleta, pelo próprio app', async () => {
  const sb = banco({ ads_metricas_dia: [
    { plataforma: 'meta', nivel: 'anuncio', anuncio_ext: '111', data: '2026-11-10', miniatura_url: 'https://scontent.xx.fbcdn.net/v/a.jpg?oe=1' },
    { plataforma: 'meta', nivel: 'anuncio', anuncio_ext: '222', data: '2026-11-10', miniatura_url: 'https://evil.example.com/a.png' },
  ] });
  let pedidos = 0;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const fetch = async () => { pedidos++; return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }); };
  const ok = await coletor.miniatura({ plataforma: 'meta', anuncio: '111', sb, fetch });
  assert.equal(ok.ok, true);
  assert.equal(ok.tipo, 'image/png');
  await coletor.miniatura({ plataforma: 'meta', anuncio: '111', sb, fetch });
  assert.equal(pedidos, 1, 'guardada na memória');
  assert.equal((await coletor.miniatura({ plataforma: 'meta', anuncio: '222', sb, fetch })).status, 404);
  assert.equal(pedidos, 1, 'domínio fora da lista nem é pedido');
  assert.equal((await coletor.miniatura({ plataforma: 'meta', anuncio: '../x', sb, fetch })).status, 404);
  const html = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
  const sb2 = banco({ ads_metricas_dia: [{ plataforma: 'google', nivel: 'anuncio', anuncio_ext: '9', data: '2026-11-10', miniatura_url: 'https://i.ytimg.com/vi/x/default.jpg' }] });
  assert.equal((await coletor.miniatura({ plataforma: 'google', anuncio: '9', sb: sb2, fetch: html })).status, 404, 'só imagem');
  assert.equal(coletor.urlPermitida('http://scontent.xx.fbcdn.net/a.jpg'), false);
  assert.equal(coletor.urlPermitida('https://fbcdn.net.evil.com/a.jpg'), false);
  assert.equal(coletor.enderecoMiniatura('meta', '111'), 'api/coleta/miniatura/meta/111');
});

/* ---------------- rotas/coleta.js ---------------- */

class ErroHttp extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
function montar(dependencias) {
  const registrar = require('../rotas/coleta');
  const rotas = new Map();
  const ctx = {
    rota: (m, c, fn) => rotas.set(`${m} ${c}`, fn), rotaPublica: (m, c, fn) => rotas.set(`${m} ${c}`, fn), ErroHttp,
    exigirCron: q => { if (q.get('chave') !== 'chave-certa') throw new ErroHttp(401, 'chave inválida'); },
    limitador: seg.criarLimitador(), equipe: { banco: () => ({ auditar: async () => {} }) },
  };
  const antigas = registrar.dependencias;
  registrar.dependencias = dependencias;
  registrar(ctx);
  return { rotas, voltar: () => { registrar.dependencias = antigas; } };
}
const resFalso = () => { const r = { cab: {}, setHeader: (k, v) => { r.cab[k] = v; }, writeHead: (s, h) => { r.status = s; Object.assign(r.cab, h); }, end: c => { r.corpo = c; } }; return r; };

test('rotas da coleta: coletar agora (1 a cada 2 min), situação, testar, cron dos cliques e miniatura', async () => {
  let coletas = 0;
  const { rotas, voltar } = montar({
    coletor: {
      sincronizar: async o => { coletas++; return { de: '2026-11-12', ate: '2026-11-19', origem: o.origem, plataformas: { meta: { ok: false, titulo: 'T', fazer: 'F', erro: 'Meta API 400: x' } }, erros: ['meta: x'] }; },
      situacao: async () => ({ rodando: false, ultima: null, contas: [] }),
      testarConexoes: async () => [{ canal: 'meta', ok: true }, { canal: 'google', ok: false }],
      ligarCliques: async () => ({ ok: true, ligados: 2 }),
      miniatura: async ({ anuncio }) => (anuncio === '1' ? { ok: true, tipo: 'image/png', corpo: Buffer.from('x') } : { ok: false, status: 404 }),
    },
    conexoes: { testar: async canal => ({ canal, ok: true }) },
    devolucao: {
      lerVendas: async () => ({ pronto: false, motivo: 'O banco ainda não guarda os identificadores de clique.' }),
      csvGoogle: () => ({ csv: '', linhas: 0 }), listaMeta: () => [],
    },
  });
  try {
    const corpo = async () => ({ dias: 7 });
    const r1 = await rotas.get('POST /api/coleta/agora')({ usuario: { id: 'u' }, corpo, res: resFalso() });
    assert.equal(r1.origem, 'pessoa');
    assert.equal(r1.plataformas.meta.ok, false);
    assert.equal(r1.plataformas.meta.titulo, 'T');
    const res = resFalso();
    await assert.rejects(rotas.get('POST /api/coleta/agora')({ usuario: { id: 'u2' }, corpo, res }), e => e.status === 429 && /Espere/.test(e.message));
    assert.ok(Number(res.cab['Retry-After']) > 0);
    assert.equal(coletas, 1);
    assert.deepEqual(await rotas.get('GET /api/coleta/situacao')({}), { rodando: false, ultima: null, contas: [] });
    assert.equal((await rotas.get('POST /api/coleta/testar')({ usuario: { id: 'u' }, corpo: async () => ({}), res: resFalso() })).resultados.length, 2);
    assert.equal((await rotas.get('POST /api/coleta/testar')({ usuario: { id: 'u' }, corpo: async () => ({ canal: 'google' }), res: resFalso() })).resultados[0].canal, 'google');
    await assert.rejects(rotas.get('POST /api/coleta/testar')({ usuario: { id: 'u' }, corpo: async () => ({ canal: 'tiktok' }), res: resFalso() }), e => e.status === 400);
    await assert.rejects(rotas.get('POST /api/cron/cliques')({ q: new URLSearchParams('chave=errada') }), e => e.status === 401);
    assert.equal((await rotas.get('GET /api/cron/cliques')({ q: new URLSearchParams('chave=chave-certa') })).ligados, 2);
    const chaveMini = [...rotas.keys()].find(k => k.startsWith('GET /^'));
    const re = new RegExp(chaveMini.slice(5, chaveMini.lastIndexOf('/')));
    const mres = resFalso();
    await rotas.get(chaveMini)({ res: mres, m: re.exec('/api/coleta/miniatura/meta/1') });
    assert.equal(mres.status, 200);
    assert.equal(mres.cab['Content-Type'], 'image/png');
    await assert.rejects(rotas.get(chaveMini)({ res: resFalso(), m: re.exec('/api/coleta/miniatura/meta/2') }), e => e.status === 404);
    assert.equal(re.exec('/api/coleta/miniatura/meta/..%2F'), null);
    await assert.rejects(rotas.get('GET /api/devolucao/google.csv')({ q: new URLSearchParams(), res: resFalso(), usuario: { id: 'u' } }), e => e.status === 409);
    const meta = await rotas.get('GET /api/devolucao/meta')({});
    assert.equal(meta.pronto, false);
  } finally { voltar(); }
});
