// Rodada 3 (13/10/2026) — papéis, acesso por app, aprovação de campanha,
// auditoria, limites, segurança do servidor e automações da equipe.
// Sem banco e sem rede: a API (rotas.js) roda de verdade num servidor HTTP
// local com um `dados` falso em memória; as automações usam relógio injetável.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as A from '../acesso.js';
import * as auto from '../automacoes.js';
import { criarApi } from '../rotas.js';
import { renderTemplate, REGUAS, SEGMENTOS, TIPOS_ENVIO, ROTULO_TIPO } from '../dados.js';
import { definirClienteIA, lerRespostas } from '../ia.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PERFIS = {
  admin:     { id: ID(1), nome: 'João Admin', papel: 'admin', ativo: true, apps: [] },
  gestor:    { id: ID(2), nome: 'Gisele Gestora', papel: 'gestor', ativo: true, apps: ['comunicar', 'crm'] },
  atendente: { id: ID(3), nome: 'Leonardo', papel: 'atendente', ativo: true, apps: ['comunicar', 'atendimento'] },
  atendente2:{ id: ID(4), nome: 'Bia', papel: 'atendente', ativo: true, apps: ['comunicar'] },
  agenda:    { id: ID(5), nome: 'Franklin', papel: 'agenda', ativo: true, apps: ['agenda'] },
  sem_app:   { id: ID(6), nome: 'Carla', papel: 'atendente', ativo: true, apps: ['atendimento', 'crm'] },
  desativado:{ id: ID(7), nome: 'Ex', papel: 'atendente', ativo: false, apps: ['comunicar'] },
  trocar:    { id: ID(8), nome: 'Nova', papel: 'atendente', ativo: true, apps: ['comunicar'], precisa_trocar_senha: true },
};

// ============================================================================
// acesso.js — puro
// ============================================================================

test('acesso: admin entra sempre; equipe precisa de "comunicar" em perfis.apps', () => {
  assert.equal(A.verificarAcesso(PERFIS.admin).ok, true, 'admin sem apps entra');
  assert.equal(A.verificarAcesso(PERFIS.gestor).ok, true);
  assert.equal(A.verificarAcesso(PERFIS.atendente).ok, true);
  const s = A.verificarAcesso(PERFIS.sem_app);
  assert.equal(s.status, 403); assert.equal(s.codigo, 'sem_acesso');
  assert.deepEqual(s.apps.map((a) => a.app), ['atendimento', 'crm'], 'mostra os apps que ela pode usar');
  assert.ok(s.apps.every((a) => /^https:\/\//.test(a.url)));
});

test('acesso: papel agenda fora (link para a Agenda), desativado e sem perfil voltam ao login', () => {
  const ag = A.verificarAcesso(PERFIS.agenda);
  assert.equal(ag.status, 403); assert.equal(ag.apps[0].app, 'agenda');
  assert.equal(A.verificarAcesso({ ...PERFIS.agenda, apps: ['agenda', 'comunicar'] }).ok, false, 'agenda nunca entra, nem com o app marcado');
  assert.deepEqual([A.verificarAcesso(PERFIS.desativado).status, A.verificarAcesso(PERFIS.desativado).codigo], [401, 'desativado']);
  assert.equal(A.verificarAcesso(null).status, 401);
  assert.equal(A.verificarAcesso({ id: 'x', papel: 'visitante', ativo: true, apps: ['comunicar'] }).status, 403, 'papel desconhecido fecha');
});

test('permissões: matriz por papel (e permissão desconhecida fecha)', () => {
  const g = PERFIS.gestor, a = PERFIS.atendente, ad = PERFIS.admin;
  for (const p of ['ver', 'avulsa', 'campanha_propor', 'optout_desligar', 'ia', 'satisfacao_registrar', 'cliente_editar'])
    assert.ok(A.pode(a, p) && A.pode(g, p) && A.pode(ad, p), p);
  for (const p of ['reguas', 'teste', 'rodar', 'exportar', 'importar', 'campanha_aprovar', 'optout_religar', 'satisfacao_apagar', 'cancelar_qualquer']) {
    assert.equal(A.pode(a, p), false, `atendente não ${p}`);
    assert.ok(A.pode(g, p) && A.pode(ad, p), `gestor/admin ${p}`);
  }
  assert.equal(A.pode(PERFIS.agenda, 'ver'), false);
  assert.equal(A.pode(g, 'inventada'), false);
  assert.equal(A.pode(null, 'ver'), false);
});

test('rotas: toda rota tem regra e handler; desconhecida = 404, método errado = 405', () => {
  const { handlers } = criarApi({ dados: {}, autenticar: async () => ({}) });
  const chaves = new Set(A.ROTAS.map((r) => `${r.metodo} ${r.padrao}`));
  for (const k of chaves) assert.ok(handlers[k], `rota sem handler: ${k}`);
  for (const k of Object.keys(handlers)) assert.ok(chaves.has(k), `handler sem regra: ${k}`);
  for (const r of A.ROTAS) assert.ok(r.publica || A.PERMISSOES[r.perm], `${r.metodo} ${r.padrao} sem permissão válida`);
  assert.equal(A.regraDaRota('GET', '/api/nada'), null);
  assert.equal(A.regraDaRota('DELETE', '/api/resumo').metodoErrado, true);
  assert.equal(A.regraDaRota('PUT', `/api/clientes/${ID(9)}`).perm, 'cliente_editar');
  assert.equal(A.regraDaRota('PUT', '/api/clientes/1 or 1=1'), null, 'id que não é UUID não casa');
  assert.equal(A.ROTAS.filter((r) => r.publica).length, 3, 'só config, ping e rodar (token) sem login');
});

test('limitador por usuário/IP com relógio injetável', () => {
  let agora = 0;
  const l = A.criarLimitador({ janelaMs: 60_000, max: 3, relogio: () => agora });
  assert.deepEqual([1, 2, 3].map(() => l.tentar('u').ok), [true, true, true]);
  const quarto = l.tentar('u');
  assert.equal(quarto.ok, false); assert.equal(quarto.esperaS, 60);
  assert.equal(l.tentar('outro').ok, true, 'cada chave tem seu balde');
  agora = 60_000;
  assert.equal(l.tentar('u').ok, true, 'janela nova libera');
});

test('último acesso: grava no máximo a cada 5 min por pessoa', () => {
  let agora = 0;
  const marca = A.criarMarcadorDeAcesso({ relogio: () => agora });
  assert.equal(marca('p1'), true);
  agora = 4 * 60_000; assert.equal(marca('p1'), false);
  assert.equal(marca('p2'), true);
  agora = 5 * 60_000; assert.equal(marca('p1'), true);
});

test('segundo fator: só exige com fator verificado e token aal1', () => {
  assert.equal(A.exigeSegundoFator({ factors: [{ status: 'verified' }] }, 'aal1'), true);
  assert.equal(A.exigeSegundoFator({ factors: [{ status: 'verified' }] }, 'aal2'), false);
  assert.equal(A.exigeSegundoFator({ factors: [{ status: 'unverified' }] }, 'aal1'), false);
  assert.equal(A.exigeSegundoFator({}, undefined), false);
});

test('meu perfil: só nome/cargo/telefone/cor/preferências, validados', () => {
  assert.equal(A.camposDoMeuPerfil({ nome: 'x' }).erro, 'Nome precisa ter de 2 a 80 letras.');
  assert.ok(A.camposDoMeuPerfil({ telefone: '123' }).erro);
  assert.ok(A.camposDoMeuPerfil({ avatar_cor: 'red;}' }).erro);
  const { campos } = A.camposDoMeuPerfil({ nome: '  Ana   Paula ', papel: 'admin', apps: ['tudo'], ativo: true, telefone: '(12) 99683-0272',
    preferencias: { notificacoes: { reclamacao: false, inventada: true, resumo_semanal: 'sim' } } });
  assert.deepEqual(campos, { nome: 'Ana Paula', telefone: '12996830272', preferencias: { notificacoes: { reclamacao: false } } },
    'papel/apps/ativo ignorados; preferência desconhecida ou não-booleana some');
});

test('JSON, CORS e cabeçalhos', () => {
  assert.deepEqual(A.lerJson(''), {});
  assert.equal(A.lerJson('{x').__invalido, true);
  assert.equal(A.lerJson('[1,2]').__invalido, true, 'corpo precisa ser objeto');
  assert.ok(A.origemPermitida('https://indycar-atendimento.onrender.com'));
  assert.ok(A.origemPermitida('http://localhost:3511'));
  assert.equal(A.origemPermitida('https://indycar-posvenda.onrender.com.mal.com'), false);
  assert.equal(A.origemPermitida('https://evil.example'), false);
  const c = A.cabecalhosSeguros({ https: true });
  assert.match(c['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.ok(c['Strict-Transport-Security'] && c['X-Content-Type-Options'] === 'nosniff' && c['Referrer-Policy'] && c['Permissions-Policy']);
  assert.equal(A.cabecalhosSeguros({ https: false })['Strict-Transport-Security'], undefined, 'sem HSTS em http local');
});

// ============================================================================
// rotas.js de verdade, com `dados` falso
// ============================================================================

function dadosFalsos() {
  const d = {
    auditoria: [], notificacoes: [], envios: [], campanhas: [], tarefas: [], config: { ativo_posvenda: true, pausa_geral: false, telefone_teste: '12988887777', link_avaliacao: '' },
    clientes: [
      { id: ID(101), nome: 'Maria', telefone: '12999990001', carro: 'HB20', aceita_mensagens: true },
      { id: ID(102), nome: 'Carlos', telefone: '12999990002', carro: 'Corolla', aceita_mensagens: true },
      { id: ID(103), nome: 'Vanderlei', telefone: '12999990003', carro: 'City', aceita_mensagens: false },
    ],
    seq: 500,
  };
  const novo = () => ID(++d.seq);
  Object.assign(d, {
    SEGMENTOS, REGUAS, TIPOS_ENVIO, ROTULO_TIPO, renderTemplate,
    ehUuid: (v) => /^[0-9a-f-]{36}$/i.test(String(v || '')),
    soDigitos: (t) => String(t ?? '').replace(/\D/g, ''),
    hoje: () => '2026-10-13',
    auditar: async (perfil, acao, tabela, registro, detalhes) => { d.auditoria.push({ perfil, acao, tabela, registro, detalhes }); return 1; },
    notificar: async (n) => { const k = `${n.perfil}|${n.chave}`; if (d.notificacoes.some((x) => `${x.perfil}|${x.chave}` === k)) return null; d.notificacoes.push(n); return novo(); },
    gestores: async () => [PERFIS.admin.id, PERFIS.gestor.id],
    marcarAcesso: async (id) => { d.acessos = (d.acessos || 0) + 1; return id; },
    resumo: async () => ({ pendentes: 0 }),
    segmentar: async (f) => (f === 'todos' ? d.clientes.filter((c) => c.aceita_mensagens) : []),
    carregarPorteiro: async () => ({ podeReceber: ({ cliente_id }) => (d.clientes.find((c) => c.id === cliente_id)?.aceita_mensagens === false ? { ok: false, motivo: 'pediu para não receber' } : { ok: true }) }),
    enfileirar: async (e) => { const x = { id: novo(), status: 'pendente', ...e }; d.envios.push(x); return x; },
    enfileirarVarios: async (linhas) => { for (const l of linhas) d.envios.push({ id: novo(), status: 'pendente', ...l }); return linhas.length; },
    marcarEnvio: async () => null,
    obterEnvio: async (id) => d.envios.find((e) => e.id === id) || null,
    cancelarEnvio: async (id) => { const e = d.envios.find((x) => x.id === id && x.status === 'pendente'); if (e) e.status = 'cancelado'; return e || null; },
    reenfileirar: async (id) => d.envios.find((x) => x.id === id) || null,
    desfazerCancelamento: async (id) => d.envios.find((x) => x.id === id) || null,
    listarEnvios: async () => d.envios,
    paraCSV: (l) => `id\n${l.map((e) => e.id).join('\n')}`,
    COLUNAS_CSV_ENVIOS: [],
    obterConfig: async () => ({ ...d.config }),
    salvarConfig: async (b) => { Object.assign(d.config, b); return { ...d.config }; },
    obterCliente: async (id) => { const c = d.clientes.find((x) => x.id === id); return c ? { ...c } : null; },
    atualizarCliente: async (id, b) => { const c = d.clientes.find((x) => x.id === id); if (!c) return null; if (typeof b.aceita_mensagens === 'boolean') c.aceita_mensagens = b.aceita_mensagens; return { ...c }; },
    criarPropostaCampanha: async (c) => { const x = { id: novo(), status: 'aguardando', ...c }; d.campanhas.push(x); return { ...x }; },
    obterCampanha: async (id) => { const c = d.campanhas.find((x) => x.id === id); return c ? { ...c } : null; },
    listarCampanhas: async ({ criadoPor }) => d.campanhas.filter((c) => !criadoPor || c.criado_por === criadoPor),
    decidirCampanha: async (id, campos) => { const c = d.campanhas.find((x) => x.id === id && x.status === 'aguardando'); if (!c) return null; Object.assign(c, campos); return { ...c }; },
    completarCampanha: async (id, campos) => { const c = d.campanhas.find((x) => x.id === id); Object.assign(c, campos); return { ...c }; },
    criarTarefa: async (t) => { const x = { id: novo(), status: 'aberta', ...t }; d.tarefas.push(x); return x; },
    obterTarefa: async (id) => d.tarefas.find((t) => t.id === id) || null,
    concluirTarefa: async (id) => { const t = d.tarefas.find((x) => x.id === id && x.status === 'aberta'); if (t) t.status = 'feita'; return t || null; },
    minhasTarefas: async (pid) => d.tarefas.filter((t) => t.responsavel_id === pid && t.status === 'aberta'),
    minhasNotificacoes: async (pid) => ({ lista: d.notificacoes.filter((n) => n.perfil === pid), naoLidas: 0 }),
    marcarTodasLidas: async () => 0,
    marcarNotificacaoLida: async () => null,
    atualizarMeuPerfil: async (id, c) => ({ id, ...c }),
    senhaTrocada: async () => ({ ok: true }),
    removerResposta: async () => true,
    registrarResposta: async (r) => r,
  });
  return d;
}

/** Sobe a API num servidor local; o papel vem no cabeçalho x-teste-perfil. */
async function subir(extra = {}) {
  const d = dadosFalsos();
  const enviados = [];
  const api = criarApi({
    dados: d, versao: 'teste', runnerToken: 'tok', log: { error() {} },
    autenticar: async (req) => {
      const p = PERFIS[req.headers['x-teste-perfil']];
      if (!p) return { status: 401, codigo: 'sem_login', erro: 'Faça login.' };
      const v = A.verificarAcesso(p);
      if (!v.ok) return v;
      return { usuario: { ...p, email: `${p.nome}@teste` } };
    },
    whatsapp: { enviar: async (tel, corpo) => { enviados.push({ tel, corpo }); return { ok: true }; }, status: async () => ({ ok: true }) },
    carteiro: { rodar: async () => ({ ok: true, enviados: 0 }), lerRespostas: async () => ({ lidas: 0 }) },
    ...extra,
  });
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    api.api(req, res, url).catch((e) => api.erroInterno(res, e));
  });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (perfil, metodo, caminho, corpo, cab = {}) => {
    const r = await fetch(base + caminho, {
      method: metodo, headers: { 'Content-Type': 'application/json', ...(perfil ? { 'x-teste-perfil': perfil } : {}), ...cab },
      body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    });
    const texto = await r.text();
    let json = null; try { json = JSON.parse(texto); } catch { /* csv */ }
    return { status: r.status, json, texto, headers: r.headers };
  };
  return { d, enviados, chamar, fechar: () => new Promise((ok) => srv.close(ok)) };
}

test('API: sem login 401; agenda/sem app 403 com os links; desativado 401; cabeçalhos de segurança em tudo', async () => {
  const s = await subir();
  try {
    const sem = await s.chamar(null, 'GET', '/api/resumo');
    assert.equal(sem.status, 401);
    assert.match(sem.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(sem.headers.get('x-content-type-options'), 'nosniff');
    const ag = await s.chamar('agenda', 'GET', '/api/resumo');
    assert.equal(ag.status, 403); assert.equal(ag.json.codigo, 'sem_acesso'); assert.equal(ag.json.apps[0].app, 'agenda');
    assert.equal((await s.chamar('sem_app', 'GET', '/api/envios')).json.codigo, 'sem_acesso');
    assert.equal((await s.chamar('desativado', 'GET', '/api/resumo')).json.codigo, 'desativado');
    assert.equal((await s.chamar('atendente', 'GET', '/api/resumo')).status, 200);
    assert.equal((await s.chamar(null, 'GET', '/api/ping')).status, 200, 'ping é público');
    assert.equal((await s.chamar(null, 'POST', '/api/rodar', {})).status, 403, 'carteiro externo sem token');
    assert.equal((await s.chamar(null, 'POST', '/api/rodar', {}, { 'x-runner-token': 'tok' })).status, 200);
    assert.equal((await s.chamar('admin', 'GET', '/api/nada')).status, 404);
    assert.equal((await s.chamar('admin', 'DELETE', '/api/resumo')).status, 405);
  } finally { await s.fechar(); }
});

test('API: troca de senha obrigatória trava tudo menos a conta', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('trocar', 'GET', '/api/resumo');
    assert.equal(r.status, 403); assert.equal(r.json.codigo, 'trocar_senha');
    const p = await s.chamar('trocar', 'GET', '/api/perfil');
    assert.equal(p.status, 200); assert.equal(p.json.precisa_trocar_senha, true);
    assert.equal((await s.chamar('trocar', 'POST', '/api/perfil/senha-trocada', {})).status, 200);
    assert.equal(s.d.auditoria.at(-1).acao, 'senha_trocada');
  } finally { await s.fechar(); }
});

test('API: /api/perfil devolve o mapa de permissões do servidor (a tela não adivinha)', async () => {
  const s = await subir();
  try {
    const at = (await s.chamar('atendente', 'GET', '/api/perfil')).json;
    assert.equal(at.pode.avulsa, true); assert.equal(at.pode.reguas, false); assert.equal(at.pode.campanha_aprovar, false);
    const ge = (await s.chamar('gestor', 'GET', '/api/perfil')).json;
    assert.equal(ge.pode.reguas, true); assert.equal(ge.pode.exportar, true);
    const put = await s.chamar('atendente', 'PUT', '/api/perfil', { nome: 'Leonardo Silva', papel: 'admin' });
    assert.equal(put.status, 200); assert.equal(put.json.nome, 'Leonardo Silva');
    assert.equal((await s.chamar('atendente', 'PUT', '/api/perfil', { nome: 'L' })).status, 400);
  } finally { await s.fechar(); }
});

test('API: atendente manda avulsa para UM cliente (com quem mandou) mas não mexe em régua, teste, CSV, importar', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('atendente', 'POST', '/api/envios', { corpo: 'Oi {primeiro_nome}!', destinos: [{ cliente_id: ID(101), telefone: '12999990001', nome: 'Maria Souza' }] });
    assert.equal(r.status, 200); assert.equal(r.json.enfileirados, 1);
    const e = s.d.envios[0];
    assert.equal(e.tipo, 'avulsa'); assert.equal(e.corpo, 'Oi Maria!');
    assert.equal(e.criado_por_id, PERFIS.atendente.id, 'criado_por = perfil'); assert.equal(e.criado_por, 'Leonardo', 'e o nome para a tela');
    assert.equal(s.d.auditoria.at(-1).acao, 'mensagem_avulsa');
    for (const [m, c, b] of [['PUT', '/api/comunicar/config', { ativo_posvenda: false }], ['POST', '/api/envios/teste', {}],
      ['GET', '/api/envios.csv'], ['POST', '/api/clientes/importar', { linhas: [{}] }], ['POST', '/api/rodar-agora', {}],
      ['POST', '/api/regras-retorno', { rotulo: 'x' }], ['POST', '/api/ia/ler-respostas', {}], [ 'DELETE', `/api/satisfacao/${ID(1)}`]]) {
      const x = await s.chamar('atendente', m, c, b);
      assert.equal(x.status, 403, `${m} ${c}`); assert.equal(x.json.codigo, 'sem_permissao');
    }
    assert.equal(s.d.config.ativo_posvenda, true, 'nada mudou');
  } finally { await s.fechar(); }
});

test('API: campanha do atendente fica aguardando aprovação; gestor aprova e a fila nasce com quem propôs', async () => {
  const s = await subir();
  try {
    const p = await s.chamar('atendente', 'POST', '/api/envios', { corpo: 'Oi {primeiro_nome}, promoção!', segmento: { filtro: 'todos' } });
    assert.equal(p.status, 200); assert.equal(p.json.aguardando, true); assert.equal(p.json.enfileirados, 0);
    assert.equal(s.d.envios.length, 0, 'nada na fila antes da aprovação');
    const camp = s.d.campanhas[0];
    assert.equal(camp.status, 'aguardando'); assert.equal(camp.total_previsto, 2); assert.deepEqual(camp.segmento, { filtro: 'todos', valor: null });
    const avisos = s.d.notificacoes.filter((n) => n.tipo === 'aprovacao');
    assert.deepEqual(avisos.map((n) => n.perfil).sort(), [PERFIS.admin.id, PERFIS.gestor.id], 'os gestores recebem o aviso');
    assert.equal(avisos[0].link, `/?campanha=${camp.id}`); assert.equal(avisos[0].app, 'comunicar');
    assert.equal(s.d.auditoria.at(-1).acao, 'campanha_proposta');

    // atendente vê só as dele e não aprova
    assert.equal((await s.chamar('atendente', 'GET', '/api/campanhas/aprovacao')).json.lista.length, 1);
    assert.equal((await s.chamar('atendente2', 'GET', '/api/campanhas/aprovacao')).json.lista.length, 0);
    assert.equal((await s.chamar('atendente', 'POST', `/api/campanhas/${camp.id}/aprovar`, {})).status, 403);

    // um cliente saiu da lista entre a proposta e a aprovação: o segmento é resolvido de novo
    s.d.clientes[1].aceita_mensagens = false;
    const ap = await s.chamar('gestor', 'POST', `/api/campanhas/${camp.id}/aprovar`, {});
    assert.equal(ap.status, 200); assert.equal(ap.json.enfileirados, 1);
    assert.equal(s.d.envios[0].campanha_id, camp.id);
    assert.equal(s.d.envios[0].criado_por_id, PERFIS.atendente.id, 'a mensagem conta como de quem propôs');
    assert.equal(s.d.envios[0].tipo, 'campanha'); assert.ok(s.d.envios[0].lote);
    assert.equal(s.d.campanhas[0].decidido_por, PERFIS.gestor.id);
    const dec = s.d.notificacoes.find((n) => n.tipo === 'campanha');
    assert.equal(dec.perfil, PERFIS.atendente.id); assert.match(dec.titulo, /aprovada por Gisele/);
    assert.equal(s.d.auditoria.at(-1).acao, 'campanha_aprovada');
    assert.equal((await s.chamar('admin', 'POST', `/api/campanhas/${camp.id}/aprovar`, {})).status, 409, 'não aprova duas vezes');
  } finally { await s.fechar(); }
});

test('API: gestor recusa (com motivo) e quem propôs é avisado; atendente cancela só a dele', async () => {
  const s = await subir();
  try {
    await s.chamar('atendente', 'POST', '/api/envios', { corpo: 'Promo', segmento: { filtro: 'todos' } });
    await s.chamar('atendente2', 'POST', '/api/envios', { corpo: 'Outra', destinos: [{ cliente_id: ID(101), telefone: '1', nome: 'a' }, { cliente_id: ID(102), telefone: '2', nome: 'b' }] });
    const [c1, c2] = s.d.campanhas;
    assert.equal(c2.destinos.length, 2, 'lista guardada quando não é segmento');
    const rec = await s.chamar('gestor', 'POST', `/api/campanhas/${c1.id}/recusar`, { motivo: 'Esta semana não' });
    assert.equal(rec.status, 200); assert.equal(s.d.campanhas[0].status, 'recusada');
    assert.match(s.d.notificacoes.find((n) => n.tipo === 'campanha').corpo, /Esta semana não/);
    assert.equal((await s.chamar('atendente', 'POST', `/api/campanhas/${c2.id}/cancelar`, {})).status, 403, 'não cancela a da colega');
    assert.equal((await s.chamar('atendente2', 'POST', `/api/campanhas/${c2.id}/cancelar`, {})).status, 200);
    assert.equal(s.d.envios.length, 0);
  } finally { await s.fechar(); }
});

test('API: gestor manda campanha direto (sem aprovação), com lote e auditoria', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('gestor', 'POST', '/api/envios', { corpo: 'Oi {primeiro_nome}', segmento: { filtro: 'todos' } });
    assert.equal(r.json.enfileirados, 2); assert.equal(r.json.aguardando, undefined);
    assert.ok(s.d.envios.every((e) => e.criado_por_id === PERFIS.gestor.id && e.lote === r.json.lote));
    assert.equal(s.d.auditoria.at(-1).acao, 'campanha_enviada');
    assert.equal((await s.chamar('gestor', 'POST', '/api/envios', { corpo: 'x', segmento: { filtro: 'inventado' } })).status, 400, 'segmento desconhecido = 400, não 500');
  } finally { await s.fechar(); }
});

test('API: atendente cancela só o que ele mandou; gestor cancela qualquer um', async () => {
  const s = await subir();
  try {
    await s.chamar('atendente', 'POST', '/api/envios', { corpo: 'a', destinos: [{ cliente_id: ID(101), telefone: '12999990001' }] });
    await s.chamar('atendente2', 'POST', '/api/envios', { corpo: 'b', destinos: [{ cliente_id: ID(102), telefone: '12999990002' }] });
    const [meu, dela] = s.d.envios;
    assert.equal((await s.chamar('atendente', 'POST', `/api/envios/${dela.id}/cancelar`, {})).status, 403);
    assert.equal((await s.chamar('atendente', 'POST', `/api/envios/${meu.id}/cancelar`, {})).status, 200);
    assert.equal((await s.chamar('gestor', 'POST', `/api/envios/${dela.id}/cancelar`, {})).status, 200);
    assert.deepEqual(s.d.auditoria.filter((a) => a.acao === 'envio_cancelado').map((a) => a.perfil), [PERFIS.atendente.id, PERFIS.gestor.id]);
  } finally { await s.fechar(); }
});

test('API: opt-out — qualquer um desliga (auditado), só gestor religa', async () => {
  const s = await subir();
  try {
    const off = await s.chamar('atendente', 'PUT', `/api/clientes/${ID(101)}`, { aceita_mensagens: false, motivo: 'pediu no balcão' });
    assert.equal(off.status, 200); assert.equal(off.json.aceita_mensagens, false);
    assert.deepEqual(s.d.auditoria.at(-1), { perfil: PERFIS.atendente.id, acao: 'cliente_optout', tabela: 'clientes', registro: ID(101), detalhes: { aceita_mensagens: false, motivo: 'pediu no balcão' } });
    assert.equal((await s.chamar('atendente', 'PUT', `/api/clientes/${ID(101)}`, { aceita_mensagens: true })).status, 403);
    assert.equal((await s.chamar('gestor', 'PUT', `/api/clientes/${ID(101)}`, { aceita_mensagens: true })).status, 200);
    assert.equal(s.d.auditoria.at(-1).acao, 'cliente_optin');
  } finally { await s.fechar(); }
});

test('API: auditoria de régua, pausa, teste e CSV (telefone mascarado)', async () => {
  const s = await subir();
  try {
    await s.chamar('gestor', 'PUT', '/api/comunicar/config', { ativo_posvenda: false, pausa_geral: true });
    const acoes = s.d.auditoria.map((a) => a.acao);
    assert.ok(acoes.includes('regua_desligada') && acoes.includes('pausa_geral_ligada'));
    assert.equal(s.d.auditoria.find((a) => a.acao === 'regua_desligada').registro, 'posvenda');
    const t = await s.chamar('gestor', 'POST', '/api/envios/teste', {});
    assert.equal(t.status, 200); assert.equal(s.enviados[0].tel, '12988887777');
    assert.deepEqual(s.d.auditoria.at(-1).detalhes, { telefone: '…7777', ok: true });
    const csv = await s.chamar('admin', 'GET', '/api/envios.csv?status=enviado');
    assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
    const au = s.d.auditoria.at(-1);
    assert.equal(au.acao, 'exportar_csv'); assert.equal(au.detalhes.filtros.status, 'enviado');
  } finally { await s.fechar(); }
});

test('API: JSON inválido 400, corpo grande 413, CORS só do ecossistema, erro interno sem detalhe', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('gestor', 'POST', '/api/envios', '{"corpo":')).status, 400);
    assert.equal((await s.chamar('gestor', 'POST', '/api/envios', JSON.stringify({ corpo: 'x'.repeat(2_100_000) }))).status, 413);
    const mal = await s.chamar('gestor', 'GET', '/api/resumo', undefined, { Origin: 'https://evil.example' });
    assert.equal(mal.status, 403);
    const bom = await s.chamar('gestor', 'GET', '/api/resumo', undefined, { Origin: 'https://indycar-atendimento.onrender.com' });
    assert.equal(bom.headers.get('access-control-allow-origin'), 'https://indycar-atendimento.onrender.com');
    // (o /api/resumo agora tem cache de 15 s — o erro interno é conferido noutra rota)
    s.d.listarClientes = async () => { throw new Error('senha do banco: xyz123 (detalhe interno)'); };
    const boom = await s.chamar('gestor', 'GET', '/api/clientes');
    assert.equal(boom.status, 500); assert.doesNotMatch(boom.texto, /xyz123|detalhe interno/); assert.match(boom.json.erro, /ref\./);
  } finally { await s.fechar(); }
});

test('API: limite por usuário nas rotas caras (429) e avulsa do atendente limitada por hora', async () => {
  let agora = 0;
  const s = await subir({ relogio: () => agora, limiteCaro: A.criarLimitador({ max: 2, relogio: () => agora }), limiteAvulsa: A.criarLimitador({ janelaMs: 3_600_000, max: 2, relogio: () => agora }) });
  try {
    const um = { corpo: 'a', destinos: [{ cliente_id: ID(101), telefone: '12999990001' }] };
    assert.equal((await s.chamar('atendente', 'POST', '/api/envios', um)).status, 200);
    assert.equal((await s.chamar('atendente', 'POST', '/api/envios', um)).status, 200);
    const r3 = await s.chamar('atendente', 'POST', '/api/envios', um);
    assert.equal(r3.status, 429); assert.ok(r3.headers.get('retry-after'));
    assert.equal((await s.chamar('gestor', 'POST', '/api/envios', um)).status, 200, 'o limite é por pessoa');
  } finally { await s.fechar(); }
});

test('API: tarefas — nasce para mim; colega não conclui a minha; gestor conclui', async () => {
  const s = await subir();
  try {
    const t = await s.chamar('atendente', 'POST', '/api/tarefas', { titulo: 'Ligar para a Maria', cliente_id: ID(101) });
    assert.equal(t.status, 200); assert.equal(t.json.responsavel_id, PERFIS.atendente.id); assert.equal(t.json.criado_por, PERFIS.atendente.id);
    assert.equal(t.json.origem, 'comunicar');
    assert.equal((await s.chamar('atendente', 'POST', '/api/tarefas', { titulo: 'x', cliente_id: 'abc' })).status, 400);
    assert.equal((await s.chamar('atendente', 'GET', '/api/tarefas')).json.length, 1);
    assert.equal((await s.chamar('atendente2', 'POST', `/api/tarefas/${t.json.id}/concluir`, {})).status, 403);
    assert.equal((await s.chamar('gestor', 'POST', `/api/tarefas/${t.json.id}/concluir`, {})).status, 200);
    assert.equal((await s.chamar('atendente', 'POST', `/api/tarefas/${t.json.id}/concluir`, {})).status, 400, 'já concluída');
  } finally { await s.fechar(); }
});

// ============================================================================
// automacoes.js — relógio injetável
// ============================================================================

function lojaFalsa({ dono = null, gestores = [PERFIS.admin.id, PERFIS.gestor.id], falhas = {}, ultimoResumo = null } = {}) {
  const l = {
    tarefas: [], notificacoes: [], ligadas: {}, resumoEm: ultimoResumo,
    donoDaConversa: async () => ({ conversaId: ID(900), dono }),
    gestores: async () => gestores,
    criarTarefa: async (t) => { const x = { id: ID(800 + l.tarefas.length), ...t }; l.tarefas.push(x); return x; },
    ligarTarefa: async (e, t) => { l.ligadas[e] = t; },
    notificar: async (n) => { if (l.notificacoes.some((x) => x.perfil === n.perfil && x.chave === n.chave)) return null; l.notificacoes.push(n); return 'ok'; },
    falhasPorTipo: async () => falhas,
    ultimoResumoEquipe: async () => l.resumoEm,
    marcarResumoEquipe: async (iso) => { l.resumoEm = iso; },
    numerosDaSemana: async () => ({ semana: { enviadas: 10, respondidas: 4, agendaram: 2 }, intencoes_7d: { reclamacao: 1, quer_agendar: 2 }, na_fila: 3, falhas_30d: 0 }),
  };
  return l;
}
const AGORA = Date.parse('2026-10-13T12:00:00-03:00'); // terça, meio-dia em SP
const ENVIO = { id: ID(700), tipo: 'posvenda', nome: 'Donizetti Ferreira', telefone: '12999990003', cliente_id: ID(103), resposta: 'Voltou o barulho na roda', conversa_id: ID(900) };

test('automação: quer agendar vira tarefa para o DONO da conversa, prazo 2 h, com o contexto', async () => {
  const l = lojaFalsa({ dono: PERFIS.atendente.id });
  const r = await auto.aposLeituraDaIA({ envio: { ...ENVIO, tipo: 'campanha', resposta: 'Quero sim, sábado?' }, intencao: 'quer_agendar', resumo: 'quer sábado de manhã', loja: l, relogio: () => AGORA });
  assert.equal(r.paraDono, true);
  const t = l.tarefas[0];
  assert.equal(t.responsavel_id, PERFIS.atendente.id); assert.equal(t.titulo, 'Quer agendar: Donizetti Ferreira');
  assert.equal(t.prioridade, 1); assert.equal(t.vence_em, new Date(AGORA + 2 * 3600_000).toISOString());
  assert.match(t.descricao, /Campanha: "Quero sim, sábado\?"/); assert.match(t.descricao, /Leitura da IA: quer sábado de manhã/);
  assert.equal(t.cliente_id, ENVIO.cliente_id); assert.equal(t.conversa_id, ID(900)); assert.equal(t.origem, 'comunicar');
  assert.equal(l.ligadas[ENVIO.id], t.id, 'o envio guarda a tarefa (não duplica)');
  assert.equal(l.notificacoes.length, 0, 'quer agendar não acorda os gestores (a tarefa já avisa o dono)');
});

test('automação: sem dono a tarefa vai para o gestor; reclamação avisa TODOS os gestores na hora (uma vez)', async () => {
  const l = lojaFalsa({ dono: null });
  await auto.aposLeituraDaIA({ envio: ENVIO, intencao: 'reclamacao', resumo: 'barulho voltou', loja: l, relogio: () => AGORA });
  assert.equal(l.tarefas[0].responsavel_id, PERFIS.admin.id);
  assert.match(l.tarefas[0].titulo, /^Reclamou: Donizetti/);
  assert.equal(l.notificacoes.length, 2);
  assert.ok(l.notificacoes.every((n) => n.tipo === 'reclamacao' && n.chave === `reclamacao:${ENVIO.id}` && n.link === `/?cliente=${ENVIO.cliente_id}` && n.app === 'comunicar'));
  // de novo (ex.: o gatilho do banco já tinha criado a tarefa): nada duplica
  const r2 = await auto.aposLeituraDaIA({ envio: { ...ENVIO, tarefa_id: l.tarefas[0].id }, intencao: 'reclamacao', loja: l, relogio: () => AGORA });
  assert.equal(l.tarefas.length, 1); assert.equal(l.notificacoes.length, 2); assert.equal(r2.avisados, 0);
});

test('automação: dúvida/agradecimento não criam tarefa; quer orçamento tem prazo de 4 h', async () => {
  const l = lojaFalsa({ dono: PERFIS.atendente.id });
  for (const i of ['duvida', 'agradecimento', 'outro']) assert.equal((await auto.aposLeituraDaIA({ envio: ENVIO, intencao: i, loja: l })).tarefa, null);
  assert.equal(l.tarefas.length, 0);
  await auto.aposLeituraDaIA({ envio: ENVIO, intencao: 'quer_orcamento', loja: l, relogio: () => AGORA });
  assert.equal(l.tarefas[0].prioridade, 2); assert.equal(l.tarefas[0].vence_em, new Date(AGORA + 4 * 3600_000).toISOString());
});

test('automação: ia.lerRespostas chama a equipe depois de ler (tarefas contadas no resultado)', async () => {
  definirClienteIA({ async criar(args) { return { conteudo: [{ type: 'tool_use', name: 'classificar', input: { intencao: 'reclamacao', resumo: 'barulho' } }], uso: {}, modelo: args.modelo, ms: 1 }; } });
  try {
    const l = lojaFalsa({ dono: PERFIS.atendente.id });
    const loja = {
      pendentes: async () => [{ ...ENVIO, resposta_tipo: 'negativa' }], gravarIntencao: async () => {}, chamarConsultor: async () => true, registrar: async () => {},
      depoisDaLeitura: (e, r) => auto.aposLeituraDaIA({ envio: e, intencao: r.intencao, resumo: r.resumo, loja: l, relogio: () => AGORA }),
    };
    const r = await lerRespostas({ loja, ctx: { chave: 'x', modelos: { barato: 'h', rapido: 's', forte: 'o' } }, autonomia: 'confirmar' });
    assert.equal(r.lidas, 1); assert.equal(r.tarefas, 1); assert.equal(r.avisados, 2);
    assert.equal(l.tarefas[0].responsavel_id, PERFIS.atendente.id);
  } finally { definirClienteIA(null); }
});

test('automação: régua com 3 falhas em 24 h avisa os gestores uma vez por dia', async () => {
  const l = lojaFalsa({ falhas: { posvenda: { total: 3, ultimoErro: 'timeout' }, lembrete: { total: 2 } } });
  const r = await auto.vigiarFalhas({ loja: l, relogio: () => AGORA });
  assert.deepEqual(r.map((x) => x.tipo), ['posvenda'], '2 falhas não avisam');
  assert.equal(l.notificacoes.length, 2);
  assert.equal(l.notificacoes[0].chave, 'falhas:posvenda:2026-10-13');
  assert.match(l.notificacoes[0].titulo, /Pós-venda: 3 mensagens falharam/); assert.match(l.notificacoes[0].corpo, /timeout/);
  await auto.vigiarFalhas({ loja: l, relogio: () => AGORA + 3600_000 });
  assert.equal(l.notificacoes.length, 2, 'mesmo dia: não repete');
  await auto.vigiarFalhas({ loja: l, relogio: () => AGORA + 24 * 3600_000 });
  assert.equal(l.notificacoes.length, 4, 'dia seguinte: avisa de novo se continuar falhando');
});

test('automação: resumo semanal — segunda depois das 8h, uma vez por semana, recupera a semana perdida', () => {
  const seg7 = Date.parse('2026-10-12T07:30:00-03:00'), seg9 = Date.parse('2026-10-12T09:00:00-03:00');
  const dom = Date.parse('2026-10-18T10:00:00-03:00'), ter = Date.parse('2026-10-13T10:00:00-03:00');
  assert.equal(auto.segundaDaSemana(ter), '2026-10-12'); assert.equal(auto.segundaDaSemana(dom), '2026-10-12');
  assert.equal(auto.horaDoResumoSemanal(null, seg7), false, 'segunda antes das 8h não');
  assert.equal(auto.horaDoResumoSemanal(null, seg9), true);
  assert.equal(auto.horaDoResumoSemanal(new Date(seg9).toISOString(), ter), false, 'já mandou nesta semana');
  assert.equal(auto.horaDoResumoSemanal('2026-10-05T12:00:00Z', ter), true, 'servidor dormiu na segunda: manda na terça');
  assert.equal(auto.horaDoResumoSemanal('2026-10-05T12:00:00Z', dom), false, 'domingo não');
});

test('automação: resumo semanal vai como notificação aos gestores, sem nome de cliente, e não repete', async () => {
  const l = lojaFalsa({ ultimoResumo: '2026-10-05T12:00:00Z' });
  const r = await auto.resumoSemanalEquipe({ loja: l, relogio: () => AGORA });
  assert.equal(r.mandou, true); assert.equal(r.avisados, 2); assert.equal(r.semana, '2026-10-12');
  const n = l.notificacoes[0];
  assert.equal(n.tipo, 'resumo_semanal'); assert.equal(n.chave, 'resumo-comunicar:2026-10-12');
  assert.equal(n.corpo, '10 mensagens saíram, 4 responderam (40%) · 2 agendaram pela mensagem · 1 reclamação · 2 pediram horário · 3 na fila.');
  assert.equal((await auto.resumoSemanalEquipe({ loja: l, relogio: () => AGORA + 3600_000 })).mandou, false);
  assert.equal(l.notificacoes.length, 2);
});

test('automação: como o pedido nasce (avulsa × campanha direta × proposta)', () => {
  assert.equal(auto.destinoDoPedido(PERFIS.atendente, 1), 'avulsa');
  assert.equal(auto.destinoDoPedido(PERFIS.atendente, 2), 'proposta');
  assert.equal(auto.destinoDoPedido(PERFIS.gestor, 500), 'campanha');
  assert.equal(auto.destinoDoPedido(PERFIS.admin, 2), 'campanha');
});

test('automação: proposta não avisa quem propôs; decisão avisa só quem propôs', async () => {
  const l = lojaFalsa({ gestores: [PERFIS.admin.id, PERFIS.gestor.id] });
  await auto.avisarPropostaDeCampanha({ campanha: { id: ID(1), criado_por: PERFIS.gestor.id, criado_por_nome: 'Gisele', total_previsto: 9, corpo: 'Promo' }, loja: l });
  assert.deepEqual(l.notificacoes.map((n) => n.perfil), [PERFIS.admin.id]);
  assert.equal(await auto.avisarDecisaoDeCampanha({ campanha: { id: ID(2), criado_por: PERFIS.gestor.id, decidido_por: PERFIS.gestor.id }, loja: l }), null);
});
