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

test('R7 API: "por que não saiu" explica celular ruim, campanha depois das 18h, teto de campanhas e rodapé', async () => {
  const s = await subir({ livre: true });
  try {
    const e1 = { id: ID(701), status: 'pendente', tipo: 'campanha', nome: 'Fixo', telefone: '1236211234', corpo: 'Oi, promoção de revisão', enviar_em: new Date().toISOString(), expira_em: new Date(Date.now() + 86400000).toISOString() };
    const e2 = { id: ID(702), status: 'pendente', tipo: 'campanha', nome: 'Bom', telefone: '12991234567', telefone_e164: '12991234567', corpo: 'Oi, revisão', enviar_em: new Date().toISOString(), expira_em: new Date(Date.now() + 86400000).toISOString() };
    tabelas.posvenda_envios.push(e1, e2);
    let r = await s.chamar('atendente', 'GET', `/api/envios/${ID(701)}/porque`);
    assert.equal(r.status, 200);
    assert.ok(r.json.passos.some((p) => /fixo/i.test(p.texto) && p.nivel === 'bloqueio'), JSON.stringify(r.json.passos));
    r = await s.chamar('atendente', 'GET', `/api/envios/${ID(702)}/porque`);
    assert.ok(r.json.passos.some((p) => p.nivel === 'info' && /PARAR/.test(p.texto)), JSON.stringify(r.json.passos));
  } finally { await s.fechar(); }
});

const futuro = (min) => new Date(Date.now() + min * 60000).toISOString();
const pend = (n, extra = {}) => ({ id: ID(n), status: 'pendente', tipo: 'campanha', nome: `P${n}`, telefone: `12991${String(100000 + n).slice(-6)}`, telefone_e164: `12991${String(100000 + n).slice(-6)}`, corpo: `texto ${n}`, enviar_em: futuro(120), expira_em: futuro(60 * 24 * 3), criado_por_id: ID(2), ...extra });

test('R7 API: antecipar traz a mensagem para agora; recusa a que já foi pega, a vencida e o atendente em mensagem alheia', async () => {
  const s = await subir({ livre: true });
  try {
    tabelas.posvenda_envios.push(pend(801), pend(802, { enviando_em: new Date().toISOString() }), pend(803, { expira_em: futuro(-30) }), pend(804, { criado_por_id: ID(3) }));
    let r = await s.chamar('gestor', 'POST', `/api/envios/${ID(801)}/antecipar`, {});
    assert.equal(r.status, 200);
    assert.ok(Date.parse(tabelas.posvenda_envios.find((e) => e.id === ID(801)).enviar_em) <= Date.now() + 1000);
    assert.equal((await s.chamar('gestor', 'POST', `/api/envios/${ID(802)}/antecipar`, {})).status, 409);
    assert.equal((await s.chamar('gestor', 'POST', `/api/envios/${ID(803)}/antecipar`, {})).status, 409);
    assert.equal((await s.chamar('gestor', 'POST', `/api/envios/${ID(899)}/antecipar`, {})).status, 404);
    tabelas.posvenda_envios.push(pend(805, { criado_por_id: ID(2) }));
    assert.equal((await s.chamar('atendente', 'POST', `/api/envios/${ID(805)}/antecipar`, {})).status, 403);
    assert.equal((await s.chamar('atendente', 'POST', `/api/envios/${ID(804)}/antecipar`, {})).status, 200);
  } finally { await s.fechar(); }
});

test('R7 API: quando sai, agenda por hora e planilha da fila usam a mesma simulação do carteiro', async () => {
  const s = await subir({ livre: true });
  try {
    tabelas.posvenda_envios.push(pend(811, { enviar_em: futuro(-5) }), pend(812, { enviar_em: futuro(-5), tipo: 'lembrete' }));
    let r = await s.chamar('atendente', 'GET', `/api/envios/${ID(811)}/quando`);
    assert.equal(r.status, 200); assert.ok('rotulo' in r.json, JSON.stringify(r.json));
    r = await s.chamar('atendente', 'GET', '/api/agenda/por-hora');
    assert.equal(r.status, 200); assert.ok(Array.isArray(r.json.horas)); assert.ok(r.json.na_fila >= 2);
    r = await s.chamar('gestor', 'GET', '/api/agenda.csv');
    assert.equal(r.status, 200);
  } finally { await s.fechar(); }
});

test('R7 API: prévia exata aceita as réguas novas e recusa régua inventada; /api/previa também', async () => {
  const s = await subir({ livre: true });
  try {
    for (const reg of ['aprovou', 'faltou', 'vencendo', 'pronto_lembrete', 'posvenda']) {
      let r = await s.chamar('atendente', 'GET', `/api/previa/exata?regua=${reg}`);
      assert.equal(r.status, 200, `${reg}: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.simulado, true);
      r = await s.chamar('atendente', 'GET', `/api/previa?regua=${reg}`);
      assert.equal(r.status, 200, `/previa ${reg}: ${JSON.stringify(r.json)}`);
    }
    assert.equal((await s.chamar('atendente', 'GET', '/api/previa?regua=inventada')).status, 400);
  } finally { await s.fechar(); }
});

test('R7 API: anti-spam, retomada, resultados avançados e respostas sem atender respondem para a equipe', async () => {
  const s = await subir({ livre: true });
  try {
    let r = await s.chamar('atendente', 'GET', '/api/antispam');
    assert.equal(r.status, 200); assert.ok(['ok', 'atencao', 'alto'].includes(r.json.nivel));
    r = await s.chamar('atendente', 'GET', '/api/retomada');
    assert.equal(r.status, 200); assert.ok(r.json.limites && Array.isArray(r.json.triagem));
    r = await s.chamar('atendente', 'GET', '/api/resultados/avancados?de=2026-10-01&ate=2026-10-25');
    assert.equal(r.status, 200); assert.ok(r.json.comparacao && r.json.melhorHorario);
    r = await s.chamar('atendente', 'GET', '/api/respostas/pendentes?horas=2');
    assert.equal(r.status, 200); assert.ok(Array.isArray(r.json));
    r = await s.chamar('atendente', 'GET', '/api/lotes');
    assert.equal(r.status, 200); assert.ok(Array.isArray(r.json.lista));
    r = await s.chamar('atendente', 'GET', '/api/patio/fila');
    assert.equal(r.status, 200); assert.equal(r.json.versao, 'r7');
    r = await s.chamar('atendente', 'GET', '/api/reabordar?dias=9999');
    assert.equal(r.status, 200); assert.equal(r.json.dias, 180);
  } finally { await s.fechar(); }
});

test('R7 API: triagem cancela só o que perdeu o sentido; encerrar a retomada é de quem roda o carteiro', async () => {
  const s = await subir({ livre: true });
  try {
    tabelas.posvenda_envios.push(pend(821, { tipo: 'lembrete', enviar_em: futuro(-60 * 30), expira_em: futuro(60 * 24) }), pend(822, { tipo: 'campanha', enviar_em: futuro(10) }));
    const r = await s.chamar('gestor', 'POST', '/api/retomada/triagem', { tipos: ['lembrete'], so_perderam: true });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(tabelas.posvenda_envios.find((e) => e.id === ID(821)).status, 'cancelado');
    assert.equal(tabelas.posvenda_envios.find((e) => e.id === ID(822)).status, 'pendente');
    assert.equal((await s.chamar('atendente', 'POST', '/api/retomada/encerrar', {})).status, 403);
    assert.equal((await s.chamar('gestor', 'POST', '/api/retomada/encerrar', {})).status, 200);
  } finally { await s.fechar(); }
});

test('R7 API: adiar o dia só das campanhas deixa os outros tipos onde estão', async () => {
  const s = await subir({ livre: true });
  try {
    const dia = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const amanhaCedo = new Date(`${dia}T12:00:00Z`).toISOString();
    tabelas.posvenda_envios.push(pend(831, { tipo: 'campanha', enviar_em: amanhaCedo }), pend(832, { tipo: 'posvenda', enviar_em: amanhaCedo }));
    const depois = new Date(Date.now() + 3 * 86400000).toISOString();
    const r = await s.chamar('gestor', 'POST', '/api/agenda/adiar-dia', { dia, enviar_em: depois, tipo: 'campanha' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(tabelas.posvenda_envios.find((e) => e.id === ID(832)).enviar_em, amanhaCedo);
    assert.notEqual(tabelas.posvenda_envios.find((e) => e.id === ID(831)).enviar_em, amanhaCedo);
  } finally { await s.fechar(); }
});

test('R7 API: rotas caras têm limite por minuto (429) sem afetar outra pessoa', async () => {
  const s = await subir();
  try {
    let ultimo;
    for (let i = 0; i < 22; i++) ultimo = await s.chamar('gestor', 'GET', '/api/antispam?x=' + i) && await s.chamar('gestor', 'GET', '/api/previa/exata');
    assert.equal(ultimo.status, 429);
    assert.equal((await s.chamar('atendente', 'GET', '/api/previa/exata')).status, 200);
  } finally { await s.fechar(); }
});
