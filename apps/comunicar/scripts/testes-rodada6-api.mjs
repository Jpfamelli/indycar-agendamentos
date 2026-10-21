// Rodada 6 · parte 4 — as rotas novas da API (rotas.js de verdade) com os dados REAIS atrás de um banco de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { instalarBancoFalso } from './banco-falso.mjs';

const tabelas = {};
const banco = instalarBancoFalso(tabelas);
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

async function subir({ simular = null } = {}) {
  const api = criarApi({
    dados: real, versao: 'teste', runnerToken: 'tok', log: { error() {} }, prefixo: '',
    autenticar: async (req) => { const p = PERFIS[req.headers['x-teste-perfil']]; if (!p) return { status: 401, codigo: 'sem_login', erro: 'Faça login.' };
      const v = A.verificarAcesso(p); return v.ok ? { usuario: { ...p, email: 'x@t' } } : v; },
    whatsapp: { enviar: async () => ({ ok: true }), status: async () => ({ ok: true, conectado: true }), reconferir() {} },
    carteiro: { rodar: async () => ({ ok: true }), lerRespostas: async () => ({ lidas: 0 }), ultimaRodada: () => null, ...(simular ? { simular } : {}) },
  });
  const srv = http.createServer((req, res) => { const url = new URL(req.url, 'http://x'); api.api(req, res, url).catch((e) => api.erroInterno(res, e)); });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (perfil, metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(perfil ? { 'x-teste-perfil': perfil } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { chamar, fechar: () => new Promise((ok) => srv.close(ok)) };
}
test.after(() => banco.restaurar());

test('API: todas as rotas novas exigem login (401 sem perfil)', async () => {
  const s = await subir();
  try {
    for (const [m, c] of [['GET', '/api/agenda'], ['GET', '/api/conexoes'], ['GET', '/api/resultados'], ['POST', '/api/rodada/simular'], ['POST', '/api/campanhas/previa'], ['GET', `/api/envios/${ID(1)}/porque`], ['POST', `/api/envios/${ID(1)}/adiar`], ['GET', `/api/lotes/${ID(1)}/resultado`]]) {
      const r = await s.chamar(null, m, c, m === 'POST' ? {} : undefined);
      assert.equal(r.status, 401, `${m} ${c}`);
    }
  } finally { await s.fechar(); }
});

test('API: agenda de envios, conexões e resultados respondem para a equipe', async () => {
  const s = await subir();
  try {
    tabelas.posvenda_envios.push({ id: ID(1), status: 'pendente', tipo: 'posvenda', nome: 'A', telefone: '12999990001', corpo: 'x', enviar_em: new Date(Date.now() + 3600000).toISOString(), expira_em: new Date(Date.now() + 5 * 86400000).toISOString() });
    let r = await s.chamar('atendente', 'GET', '/api/agenda');
    assert.equal(r.status, 200); assert.ok(Array.isArray(r.json.dias));
    r = await s.chamar('atendente', 'GET', '/api/conexoes');
    assert.equal(r.status, 200); assert.ok(r.json.itens.length >= 6);
    r = await s.chamar('atendente', 'GET', '/api/resultados');
    assert.equal(r.status, 200); assert.equal(r.json.total.enviadas, 0);
    r = await s.chamar('atendente', 'GET', '/api/resultados?de=2026-10-10&ate=2026-10-01');
    assert.equal(r.status, 400);
    r = await s.chamar('atendente', 'GET', '/api/resultados?regua=inventada');
    assert.equal(r.status, 400);
  } finally { await s.fechar(); }
});

test('API: adiar — gestor adia, atendente só o que ele mesmo criou; além da validade é recusado; id inexistente 404', async () => {
  const s = await subir();
  try {
    const exp = new Date(Date.now() + 3 * 86400000).toISOString();
    tabelas.posvenda_envios.push({ id: ID(11), status: 'pendente', tipo: 'campanha', criado_por_id: ID(2), nome: 'A', telefone: '12999990011', corpo: 'a', enviar_em: new Date().toISOString(), expira_em: exp });
    tabelas.posvenda_envios.push({ id: ID(12), status: 'pendente', tipo: 'campanha', criado_por_id: ID(3), nome: 'B', telefone: '12999990012', corpo: 'b', enviar_em: new Date().toISOString(), expira_em: exp });
    const amanha = new Date(Date.now() + 86400000).toISOString();
    let r = await s.chamar('atendente', 'POST', `/api/envios/${ID(11)}/adiar`, { enviar_em: amanha });
    assert.equal(r.status, 403);
    r = await s.chamar('atendente', 'POST', `/api/envios/${ID(12)}/adiar`, { enviar_em: amanha });
    assert.equal(r.status, 200);
    r = await s.chamar('gestor', 'POST', `/api/envios/${ID(11)}/adiar`, { enviar_em: new Date(Date.now() + 9 * 86400000).toISOString() });
    assert.equal(r.status, 400);
    r = await s.chamar('gestor', 'POST', `/api/envios/${ID(99)}/adiar`, { enviar_em: amanha });
    assert.equal(r.status, 404);
    r = await s.chamar('gestor', 'POST', `/api/envios/${ID(11)}/adiar`, { enviar_em: 'ontem' });
    assert.equal(r.status, 400);
  } finally { await s.fechar(); }
});

test('API: "por que não saiu" devolve o veredito; inexistente é 404', async () => {
  const s = await subir();
  try {
    tabelas.posvenda_envios.push({ id: ID(21), status: 'pendente', tipo: 'posvenda', nome: 'A', telefone: '12999990021', corpo: 'x', enviar_em: new Date(Date.now() - 60000).toISOString(), expira_em: new Date(Date.now() + 86400000).toISOString() });
    let r = await s.chamar('atendente', 'GET', `/api/envios/${ID(21)}/porque`);
    assert.equal(r.status, 200); assert.equal(r.json.envio.id, ID(21));
    r = await s.chamar('atendente', 'GET', `/api/envios/${ID(98)}/porque`);
    assert.equal(r.status, 404);
  } finally { await s.fechar(); }
});

test('API: simular rodada — 503 sem o carteiro novo; com ele devolve o que sairia e audita', async () => {
  let s = await subir();
  try { assert.equal((await s.chamar('gestor', 'POST', '/api/rodada/simular', {})).status, 503); } finally { await s.fechar(); }
  s = await subir({ simular: async () => ({ simulado: true, enviaria: [{ id: ID(1) }], pularia: [], adiaria: [], reagendaria: [], atualizaria: [] }) });
  try {
    assert.equal((await s.chamar('atendente', 'POST', '/api/rodada/simular', {})).status, 403, 'só quem pode rodar o carteiro simula');
    const r = await s.chamar('gestor', 'POST', '/api/rodada/simular', {});
    assert.equal(r.status, 200); assert.equal(r.json.enviaria.length, 1);
  } finally { await s.fechar(); }
});

test('API: prévia exata da campanha mostra as linhas, não grava nada e avisa de link de fora da casa', async () => {
  const s = await subir();
  try {
    const antes = tabelas.posvenda_envios.length;
    const destinos = [{ id: ID(101), nome: 'Maria Silva', telefone: '12999990101', carro: 'HB20' }, { id: ID(102), nome: 'Carlos', telefone: '12999990102' }, { id: ID(103), nome: 'Dup', telefone: '12999990101' }];
    let r = await s.chamar('atendente', 'POST', '/api/campanhas/previa', { corpo: 'Oi {primeiro_nome}, olha isso: https://golpe.example.com/x', destinos });
    assert.equal(r.status, 200); assert.equal(r.json.simulado, true); assert.equal(r.json.total, 2);
    assert.equal(r.json.pulados, 1);
    assert.match(r.json.linhas[0].corpo, /^Oi Maria/);
    assert.ok(r.json.linksForaDaCasa.length >= 1);
    assert.equal(tabelas.posvenda_envios.length, antes, 'nada gravado');
    r = await s.chamar('atendente', 'POST', '/api/campanhas/previa', { corpo: '', destinos });
    assert.equal(r.status, 400);
  } finally { await s.fechar(); }
});

test('API: campanha com link de fora — atendente 403; gestor 409 até confirmar; link da casa passa', async () => {
  const s = await subir();
  try {
    const destinos = [{ id: ID(111), nome: 'Maria', telefone: '12999990111' }];
    const corpo = 'Veja https://promo-estranha.example.net/oferta';
    let r = await s.chamar('atendente', 'POST', '/api/envios', { corpo, destinos });
    assert.equal(r.status, 403); assert.equal(r.json.codigo, 'link_externo');
    r = await s.chamar('gestor', 'POST', '/api/envios', { corpo, destinos });
    assert.equal(r.status, 409); assert.equal(r.json.codigo, 'link_externo');
    const antes = tabelas.posvenda_envios.length;
    r = await s.chamar('gestor', 'POST', '/api/envios', { corpo, destinos, confirmar_links_externos: true });
    assert.equal(r.status, 200);
    assert.ok(tabelas.posvenda_envios.length > antes);
    r = await s.chamar('gestor', 'POST', '/api/envios', { corpo: 'Seu orçamento: https://indycar-orcador.netlify.app/#/o/abcdefabcdef12', destinos: [{ id: ID(112), nome: 'Ana', telefone: '12999990112' }] });
    assert.equal(r.status, 200);
  } finally { await s.fechar(); }
});

test('API: resultado do lote só com id válido; lote sem envios devolve zeros', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('atendente', 'GET', `/api/lotes/${ID(300)}/resultado`);
    assert.equal(r.status, 200); assert.equal(r.json.lote, ID(300));
    const ruim = await s.chamar('atendente', 'GET', '/api/lotes/nao-uuid/resultado');
    assert.ok([400, 404].includes(ruim.status));
  } finally { await s.fechar(); }
});

test('API: salvar as réguas com os campos da rodada 6 — gestor salva; atendente 403; texto sem link ou com variável inventada vira 400 e número fora da faixa é ignorado', async () => {
  const s = await subir();
  try {
    let r = await s.chamar('atendente', 'PUT', '/api/comunicar/config', { usa_orcador: false });
    assert.equal(r.status, 403);
    r = await s.chamar('gestor', 'PUT', '/api/comunicar/config', { usa_orcador: false, bloquear_com_reclamacao: false, horas_extra_lembrete: 5, evitar_texto_repetido_h: 0, msg_orcador_visto: 'Oi {primeiro_nome}, ficou alguma dúvida? {link_orcamento}' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.usa_orcador, false); assert.equal(r.json.horas_extra_lembrete, 5); assert.equal(r.json.evitar_texto_repetido_h, 0);
    const linha = tabelas.posvenda_config[0];
    assert.equal(linha.usa_orcador, false); assert.equal(linha.horas_extra_lembrete, 5);
    r = await s.chamar('gestor', 'PUT', '/api/comunicar/config', { msg_orcador_visto: 'Oi, ficou alguma dúvida do orçamento? Estou aqui.' });
    assert.equal(r.status, 400); assert.match(r.json.erro, /link_orcamento/);
    r = await s.chamar('gestor', 'PUT', '/api/comunicar/config', { msg_extra_lembrete: 'Oi {primeiro_nome}, {coisa_estranha} {link_os}' });
    assert.equal(r.status, 400);
    r = await s.chamar('gestor', 'PUT', '/api/comunicar/config', { horas_extra_lembrete: 99 });
    assert.equal(r.status, 200); assert.equal(r.json.horas_extra_lembrete, 5, 'número fora da faixa é ignorado, o valor anterior fica');
  } finally { await s.fechar(); }
});
