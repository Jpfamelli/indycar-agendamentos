// Rodada 7 — as rotas novas da API (rotas.js de verdade) com os dados REAIS atrás de um banco de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { instalarBancoFalso } from './banco-falso.mjs';

const tabelas = {};
const banco = instalarBancoFalso(tabelas, { rpcs: { orc_recusados_recuperaveis: () => [], r7_c5_fila_do_patio: () => ({ versao: 'r7', na_fila: 0, ordens: {} }) } });
const real = await import('../dados.js');
const A = await import('../acesso.js');
const { criarApi } = await import('../rotas.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const H = real.hoje();
const PERFIS = {
  gestor: { id: ID(2), nome: 'Gisele', papel: 'gestor', ativo: true, apps: ['comunicar'] },
  atendente: { id: ID(3), nome: 'Leonardo', papel: 'atendente', ativo: true, apps: ['comunicar'] },
};
tabelas.posvenda_config = [{ id: true, hora_envio: '09:30' }];
tabelas.posvenda_envios = [];

async function subir({ simular = null, livre = false } = {}) {
  const deps = {
    ...(livre ? { limiteCaro: { tentar: () => ({ ok: true }) } } : {}),
    dados: real, versao: 'teste', runnerToken: 'tok', log: { error() {} }, prefixo: '',
    autenticar: async (req) => { const p = PERFIS[req.headers['x-teste-perfil']]; if (!p) return { status: 401, codigo: 'sem_login', erro: 'Faça login.' };
      const v = A.verificarAcesso(p); return v.ok ? { usuario: { ...p, email: 'x@t' } } : v; },
    whatsapp: { enviar: async () => ({ ok: true }), status: async () => ({ ok: true, conectado: true }), reconferir() {} },
    carteiro: { rodar: async () => ({ ok: true }), lerRespostas: async () => ({ lidas: 0 }), ultimaRodada: () => null, ...(simular ? { simular } : {}) },
  };
  const api = criarApi(deps);
  const srv = http.createServer((req, res) => { const url = new URL(req.url, 'http://x'); api.api(req, res, url).catch((e) => api.erroInterno(res, e)); });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (perfil, metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(perfil ? { 'x-teste-perfil': perfil } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { base, api, deps, chamar, fechar: () => new Promise((ok) => srv.close(ok)) };
}
test.after(() => banco.restaurar());
tabelas.comunicar_lotes = [];
tabelas.clientes = [];
const gestorCorpo = (extra = {}) => ({ corpo: 'Oi {primeiro_nome}, seu {carro} já pode passar aqui.', ...extra });
const destinos40 = Array.from({ length: 40 }, (_, i) => ({ id: ID(500 + i), nome: `Cliente ${i}`, telefone: `1299${String(9100000 + i)}`, carro: 'Gol' }));

test('R7 API: rotas novas exigem login e respeitam o papel', async () => {
  const s = await subir({ livre: true });
  try {
    for (const [m, c] of [['GET', '/api/lotes'], ['GET', '/api/reabordar'], ['POST', '/api/reabordar/enviar'], ['GET', '/api/antispam'], ['GET', '/api/retomada'], ['GET', '/api/agenda/por-hora'], ['GET', '/api/respostas/pendentes'], ['GET', '/api/resultados/avancados']]) {
      assert.equal((await s.chamar(null, m, c, m === 'POST' ? {} : undefined)).status, 401, c);
    }
    assert.equal((await s.chamar('atendente', 'POST', '/api/reabordar/enviar', {})).status, 403);
    assert.equal((await s.chamar('atendente', 'POST', '/api/retomada/triagem', { tipos: ['campanha'] })).status, 403);
    assert.equal((await s.chamar('atendente', 'GET', '/api/agenda.csv')).status, 403);
  } finally { await s.fechar(); }
});

test('R7 API: campanha guarda o MODELO (com variáveis) e o lote pode ser lido para repetir', async () => {
  const s = await subir({ livre: true });
  try {
    const r = await s.chamar('gestor', 'POST', '/api/envios', gestorCorpo({ destinos: destinos40.slice(0, 3), detalhe: 'sábado' }));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const m = await s.chamar('atendente', 'GET', `/api/lotes/${r.json.lote}/modelo`);
    assert.equal(m.status, 200);
    assert.equal(m.json.modelo, 'Oi {primeiro_nome}, seu {carro} já pode passar aqui.');
    assert.ok(!/Cliente 0/.test(m.json.modelo));
    assert.equal((await s.chamar('atendente', 'GET', `/api/lotes/${ID(999)}/modelo`)).status, 404);
  } finally { await s.fechar(); }
});

test('R7 API: celular ruim fica de fora da campanha e a prévia mostra o texto final', async () => {
  const s = await subir({ livre: true });
  try {
    const dest = [{ id: ID(601), nome: 'Bom', telefone: '12991234567' }, { id: ID(602), nome: 'Fixo', telefone: '1236211234' }, { id: ID(603), nome: 'DDD', telefone: '00991234567' }];
    const r = await s.chamar('gestor', 'POST', '/api/campanhas/previa', { corpo: 'Oi {primeiro_nome}, tudo bem?', destinos: dest });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.total, 1);
    assert.equal(r.json.puladosDetalhe.celular, 2);
  } finally { await s.fechar(); }
});

test('R7 API: A/B exige 40 clientes e divide em dois lotes ligados', async () => {
  const s = await subir({ livre: true });
  try {
    let r = await s.chamar('gestor', 'POST', '/api/envios', gestorCorpo({ corpo_b: 'Olá {primeiro_nome}, passa aqui?', destinos: destinos40.slice(0, 10) }));
    assert.equal(r.status, 400);
    r = await s.chamar('gestor', 'POST', '/api/envios', gestorCorpo({ corpo_b: 'Olá {primeiro_nome}, passa aqui?', destinos: destinos40 }));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.loteB && r.json.ab);
    assert.equal(r.json.ladoA + r.json.ladoB, r.json.enfileirados);
    const a = tabelas.comunicar_lotes.find((l) => l.lote === r.json.lote), b = tabelas.comunicar_lotes.find((l) => l.lote === r.json.loteB);
    assert.equal(a.ab_grupo, b.ab_grupo); assert.deepEqual([a.variante, b.variante], ['A', 'B']);
  } finally { await s.fechar(); }
});

test('R7 API: reabordar valida o texto (preço/variável inventada) e responde vazio sem recusados', async () => {
  const s = await subir({ livre: true });
  try {
    let r = await s.chamar('gestor', 'GET', '/api/reabordar?dias=30');
    assert.equal(r.status, 200); assert.equal(r.json.total, 0);
    r = await s.chamar('gestor', 'POST', '/api/reabordar/enviar', { textos: { preco: 'Oi {primeiro_nome}, fazemos por R$ 99 com desconto no seu carro!' } });
    assert.equal(r.status, 400); assert.equal(r.json.campo, 'preco');
    r = await s.chamar('gestor', 'POST', '/api/reabordar/enviar', { textos: { prazo: 'Oi {primeiro_nome}, {coisa_inventada} para o seu carro, vamos ver um horário?' } });
    assert.equal(r.status, 400);
    r = await s.chamar('gestor', 'POST', '/api/reabordar/enviar', {});
    assert.equal(r.status, 400); assert.equal(r.json.codigo, 'sem_candidatos');
  } finally { await s.fechar(); }
});

test('R7 API: config recusa texto de régua com variável inventada e rodapé sem PARAR', async () => {
  const s = await subir({ livre: true });
  try {
    let r = await s.chamar('gestor', 'PUT', '/api/comunicar/config', { msg_aprovou: 'Oi {nome}, {inventada} aqui.' });
    assert.equal(r.status, 400); assert.equal(r.json.campo, 'msg_aprovou');
    r = await s.chamar('gestor', 'PUT', '/api/comunicar/config', { texto_rodape_parar: 'Obrigado pela preferência sempre.' });
    assert.equal(r.status, 400); assert.equal(r.json.campo, 'texto_rodape_parar');
  } finally { await s.fechar(); }
});

test('R7 API: filtros inválidos viram 400, não 500', async () => {
  const s = await subir({ livre: true });
  try {
    for (const c of ['/api/agenda/por-hora?dia=31-02-2026', '/api/previa/exata?regua=inventada', '/api/resultados/avancados?tipo=xx', '/api/resultados/avancados?de=2026-10-10&ate=2026-10-01', '/api/patio/fila?os=nao-e-uuid']) {
      assert.equal((await s.chamar('gestor', 'GET', c)).status, 400, c);
    }
    assert.equal((await s.chamar('gestor', 'POST', '/api/retomada/triagem', { tipos: ['xyz'] })).status, 400);
  } finally { await s.fechar(); }
});
