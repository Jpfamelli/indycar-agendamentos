'use strict';
/* Rodada 8 (T5b): as rotas do Gestor e do diário pelo servidor de verdade (porta 3460 a 3469), com login de mentira,
   dublê do modelo e banco de mentira. Fluxo text/event-stream, erros antes do fluxo em JSON (com Retry-After no 429),
   dado pessoal só para administrador (auditado), pessoa que fecha a conexão, falta de chave sem derrubar o resto,
   plano da semana (tela e rotina), diário (decidir, feita, registrar, rotina de medir) e as chaves do cron. Sem rede. */
process.env.ADS_CRON_TOKEN = process.env.ADS_CRON_TOKEN || 'chave-de-teste-t5b';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../ia/gestor');
const Plano = require('../ia/plano');
const Decisoes = require('../ia/decisoes');
const Campanhas = require('../motor/campanhas');
const { usar, texto, montar, PESSOA, ADMIN, ouvirNaFaixa, lerEventos, TD } = require('./apoio/gestor-apoio');

const CRON = process.env.ADS_CRON_TOKEN;
const PROPOSTA = { tipo: 'reduzir_verba', alvo: { plataforma: 'meta', nivel: 'campanha', ext: '1201', nome: 'Revisão' }, titulo: 'Baixar a verba da campanha Revisão',
  porque: 'Custo por contato acima da meta em 30 dias.', evidencias: [{ fonte: 'campanhas', dado: 'custo por contato acima da meta', valor: 61 }], verba: { atual: 50, nova: 40, por: 'dia' }, medir_em: '2026-11-28' };

test('rotas do Gestor e do diário pelo servidor', async t => {
  const auth = require('../auth'), equipe = require('../equipe'), db = require('../db');
  const orig = { identificar: auth.identificar, banco: equipe.banco, sb: db.sb };
  const fila = [];
  const m = montar({ roteiro: [() => fila.shift() || { content: [texto('Resposta padrão.')] }] });
  const auditorias = [];
  const PAPEIS = { gestor: { usuario: PESSOA }, admin: { usuario: ADMIN } };
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({
    tocarAcesso: async () => true,
    auditar: async (u, acao, o) => { auditorias.push({ quem: u && u.id, acao, ...o }); return true; },
    nomesDosPerfis: async ids => new Map(ids.map(id => [id, { nome: id === PESSOA.id ? 'Paulo' : 'João', ativo: true }])),
  });
  db.sb = m.sb;
  G.padrao().trocar({ ...m.gestor.config });
  Decisoes.padrao().trocar({ sb: m.sb, fonte: m.fonte, campanhas: Campanhas, agora: m.agora, nomesDosPerfis: null });
  const { servidor } = require('../server');
  const porta = await ouvirNaFaixa(servidor);
  t.after(() => { servidor.close(); auth.identificar = orig.identificar; equipe.banco = orig.banco; db.sb = orig.sb; });

  const url = caminho => `http://127.0.0.1:${porta}${caminho}`;
  const pedir = async (metodo, caminho, papel, corpo) => {
    // a chave das rotinas vai no cabeçalho X-Cron-Chave (o servidor não aceita mais ?chave=)
    const u = new URL(url(caminho)); const chaveCron = u.searchParams.get('chave'); u.searchParams.delete('chave');
    const r = await fetch(u, { method: metodo, headers: { 'x-papel': papel || '', 'content-type': 'application/json', ...(chaveCron != null ? { 'x-cron-chave': chaveCron } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    const bruto = await r.text();
    let json = null; try { json = JSON.parse(bruto); } catch { /* fluxo */ }
    return { status: r.status, cab: r.headers, corpo: json, bruto };
  };
  const conversas = () => m.sb.tabelas.trafego_ia_conversas;

  await t.test('perguntar: fluxo text/event-stream com ferramenta, proposta, texto e um fim', async () => {
    fila.push({ content: [texto('Olhando.'), usar('saude')] }, { content: [usar('proposta_criar', PROPOSTA)] }, { content: [texto('A campanha Revisão está cara.\n\n- **1 sugestão** na tela.')] });
    const r = await pedir('POST', '/api/gestor/perguntar', 'gestor', { pergunta: 'O que eu faço com a Revisão?' });
    assert.equal(r.status, 200);
    assert.equal(r.cab.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.equal(r.cab.get('cache-control'), 'no-store');
    const { eventos, comentarios } = lerEventos(r.bruto);
    assert.ok(comentarios >= 1, 'abre com um comentário (a tela ignora)');
    assert.deepEqual([...new Set(eventos.map(e => e.evento))], ['texto', 'ferramenta', 'proposta', 'fim']);
    assert.equal(eventos.filter(e => e.evento === 'fim').length, 1);
    assert.equal(eventos.at(-1).evento, 'fim');
    assert.equal(eventos.map(e => e.dados.texto || '').join(''), 'Olhando.\n\nA campanha Revisão está cara.\n\n- **1 sugestão** na tela.');
    const p = eventos.find(e => e.evento === 'proposta').dados.proposta;
    assert.equal(p.status, 'proposta'); assert.equal(p.titulo, PROPOSTA.titulo); assert.equal(p.medir_em, '2026-11-28');
    const fim = eventos.at(-1).dados;
    assert.ok(fim.conversa_id); assert.equal(fim.parou, 'fim'); assert.equal(fim.uso.chamadas, 3);

    const lista = await pedir('GET', '/api/gestor/conversas', 'gestor');
    assert.equal(lista.status, 200); assert.equal(lista.corpo.conversas[0].id, fim.conversa_id); assert.equal(lista.corpo.conversas[0].mensagens, 2);
    const aberta = await pedir('GET', `/api/gestor/conversas/${fim.conversa_id}`, 'gestor');
    assert.equal(aberta.status, 200); assert.deepEqual(aberta.corpo.mensagens.map(x => x.papel), ['pessoa', 'gestor']);
    assert.equal((await pedir('GET', `/api/gestor/conversas/${fim.conversa_id}`, 'admin')).status, 404, 'conversa é de quem perguntou');
    assert.equal((await pedir('GET', '/api/gestor/conversas/nada', 'gestor')).status, 404);
    const nova = await pedir('POST', '/api/gestor/conversas', 'gestor', { titulo: 'Sobre o Google' });
    assert.equal(nova.status, 200); assert.equal(nova.corpo.conversa.titulo, 'Sobre o Google');
  });

  await t.test('erros antes do fluxo vêm em JSON: login, pergunta vazia, dado pessoal sem ser admin, 30 por hora com Retry-After', async () => {
    assert.equal((await pedir('POST', '/api/gestor/perguntar', null, { pergunta: 'oi' })).status, 401);
    const vazia = await pedir('POST', '/api/gestor/perguntar', 'gestor', { pergunta: '' });
    assert.equal(vazia.status, 422); assert.equal(vazia.corpo.codigo, 'pergunta'); assert.equal(vazia.corpo.erro, 'Escreva a sua pergunta.');
    const pii = await pedir('POST', '/api/gestor/perguntar', 'gestor', { pergunta: 'Abre a conversa', dado_pessoal: true });
    assert.equal(pii.status, 403); assert.equal(pii.corpo.codigo, 'so_admin');
    const lim = m.gestor.config.limitador;
    for (let i = 0; i < 40; i++) lim.permitir(`gestor|${PESSOA.id}`, 30, 3_600_000, m.agora());
    const muitas = await pedir('POST', '/api/gestor/perguntar', 'gestor', { pergunta: 'mais uma' });
    assert.equal(muitas.status, 429); assert.equal(muitas.corpo.codigo, 'limite_hora');
    assert.ok(Number(muitas.cab.get('retry-after')) > 0);
    lim.limpar();
  });

  await t.test('administrador com dado pessoal: responde e fica na auditoria', async () => {
    fila.push({ content: [texto('Li.')] });
    const r = await pedir('POST', '/api/gestor/perguntar', 'admin', { pergunta: 'O que o contato pediu?', dado_pessoal: true });
    assert.equal(r.status, 200);
    assert.equal(lerEventos(r.bruto).eventos.at(-1).evento, 'fim');
    const a = auditorias.find(x => x.acao === 'trafego_gestor_dado_pessoal');
    assert.ok(a); assert.equal(a.quem, ADMIN.id); assert.equal(a.tabela, 'trafego_ia_conversas');
  });

  await t.test('erro do modelo no meio: o fluxo termina com UM evento erro (sem fim) e o pedaço que chegou', async () => {
    fila.push({ content: [usar('saude')] }, { parcial: 'Até aqui', erro: Object.assign(new Error('boom interno'), { status: 500 }) });
    const r = await pedir('POST', '/api/gestor/perguntar', 'gestor', { pergunta: 'Como está?' });
    const ev = lerEventos(r.bruto).eventos;
    assert.deepEqual(ev.map(e => e.evento), ['ferramenta', 'texto', 'erro']);
    assert.equal(ev[2].dados.codigo, 'modelo'); assert.ok(!r.bruto.includes('boom interno'));
  });

  await t.test('a pessoa fecha a conexão no meio: o modelo é abortado e a conversa guarda que parou', async () => {
    fila.push({ esperar: true });
    const ctrl = new AbortController();
    const r = await fetch(url('/api/gestor/perguntar'), { method: 'POST', headers: { 'x-papel': 'gestor', 'content-type': 'application/json' }, body: JSON.stringify({ pergunta: 'Pergunta que vou largar' }), signal: ctrl.signal });
    assert.equal(r.status, 200);
    ctrl.abort();
    let msg = null;
    for (let i = 0; i < 100 && !msg; i++) {
      await new Promise(ok => setTimeout(ok, 10));
      const c = conversas().find(x => x.titulo === 'Pergunta que vou largar');
      msg = c && c.mensagens[1];
    }
    assert.ok(msg, 'a resposta foi guardada'); assert.equal(msg.erro.codigo, 'parado');
  });

  await t.test('sem a chave da IA: 503 sem_chave no Gestor e o resto (diário) segue funcionando', async () => {
    const cliente = G.padrao().config.cliente;
    G.padrao().trocar({ cliente: null });
    try {
      const r = await pedir('POST', '/api/gestor/perguntar', 'gestor', { pergunta: 'oi' });
      assert.equal(r.status, 503); assert.equal(r.corpo.codigo, 'sem_chave'); assert.match(r.corpo.erro, /resto do app segue funcionando/);
      const p = await pedir('POST', '/api/gestor/plano', 'gestor', {});
      assert.equal(p.status, 503); assert.equal(p.corpo.codigo, 'sem_chave');
      assert.equal((await pedir('GET', '/api/acoes-trafego', 'gestor')).status, 200);
      assert.equal((await pedir('GET', '/api/gestor/conversas', 'gestor')).status, 200);
    } finally { G.padrao().trocar({ cliente }); }
  });

  await t.test('plano da semana: tela (POST/GET), rotina com a chave do cron e erro da IA com o que chegou (502)', async () => {
    assert.equal((await pedir('GET', '/api/gestor/plano', 'gestor')).corpo.plano, null);
    fila.push({ content: [usar('saude'), usar('resumo_do_periodo', { periodo: '7d' })] }, { content: [texto('Semana de ligar a conta de anúncio.\n\n- 7 contatos em 30 dias.')] });
    const p = await pedir('POST', '/api/gestor/plano', 'gestor', {});
    assert.equal(p.status, 200); assert.equal(p.corpo.ok, true);
    assert.equal(p.corpo.plano.texto, 'Semana de ligar a conta de anúncio.\n\n- 7 contatos em 30 dias.');
    assert.deepEqual(p.corpo.plano.baseado_em, { de: '2026-10-21', ate: '2026-11-19', dias: [7, 30], rotulo: 'últimos 7 e 30 dias (21/10 a 19/11)' });
    assert.equal(p.corpo.plano.pedido_por, 'Paulo'); assert.equal(p.corpo.plano.parou, 'fim'); assert.ok(p.corpo.plano.uso);
    const linha = conversas().find(c => c.id === p.corpo.plano.id);
    assert.equal(linha.perfil_id, null, 'o plano é da oficina'); assert.equal(linha.titulo, 'Plano da semana (19/11)');
    assert.equal(linha.mensagens[0].plano, true); assert.match(linha.mensagens[0].texto, /últimos 7 dias \(13\/11 a 19\/11\)/);
    assert.ok(!(await pedir('GET', '/api/gestor/conversas', 'gestor')).corpo.conversas.some(c => c.id === p.corpo.plano.id), 'plano não entra nas conversas da pessoa');
    const visto = await pedir('GET', '/api/gestor/plano', 'admin');
    assert.equal(visto.corpo.plano.id, p.corpo.plano.id); assert.equal(visto.corpo.plano.pedido_por, 'Paulo');
    assert.equal((await pedir('GET', `/api/gestor/conversas/${p.corpo.plano.id}`, 'admin')).corpo.plano, true, 'qualquer um da equipe abre o plano');

    assert.equal((await pedir('POST', '/api/cron/plano')).status, 401);
    assert.equal((await pedir('POST', '/api/cron/plano?chave=errada')).status, 401);
    m.agora.andar(60_000);
    fila.push({ content: [texto('Plano da rotina.')] });
    const rot = await pedir('GET', `/api/cron/plano?chave=${CRON}`);
    assert.equal(rot.status, 200); assert.equal(rot.corpo.ok, true); assert.equal(rot.corpo.plano.parou, 'fim');
    const agora = await pedir('GET', '/api/gestor/plano', 'gestor');
    assert.equal(agora.corpo.plano.texto, 'Plano da rotina.'); assert.equal(agora.corpo.plano.pedido_por, null);

    fila.push({ parcial: 'Semana de', erro: Object.assign(new Error('x'), { status: 529 }) });
    const ruim = await pedir('POST', '/api/gestor/plano', 'gestor', {});
    assert.equal(ruim.status, 502); assert.equal(ruim.corpo.codigo, 'modelo_ocupado'); assert.equal(ruim.corpo.plano.texto, 'Semana de');
    assert.equal((await pedir('GET', '/api/gestor/plano', 'gestor')).corpo.plano.texto, 'Plano da rotina.', 'o plano que valia continua');
    fila.push(Object.assign(new Error('x'), { status: 500 }));
    const rotRuim = await pedir('POST', `/api/cron/plano?chave=${CRON}`);
    assert.equal(rotRuim.status, 200); assert.deepEqual(Object.keys(rotRuim.corpo).sort(), ['codigo', 'erro', 'ok']); assert.equal(rotRuim.corpo.ok, false);
  });

  await t.test('diário: listar, aceitar (auditado), 409 de novo, já fiz, registrar, validação e a rotina de medir com a chave', async () => {
    assert.equal((await pedir('GET', '/api/acoes-trafego')).status, 401);
    const l = await pedir('GET', '/api/acoes-trafego?status=proposta', 'gestor');
    assert.equal(l.status, 200); assert.equal(l.corpo.ligado, true);
    const p = l.corpo.acoes.find(a => a.titulo === PROPOSTA.titulo);
    assert.ok(p);
    assert.equal((await pedir('GET', '/api/acoes-trafego?status=sumida', 'gestor')).corpo.codigo, 'status');

    assert.equal((await pedir('POST', `/api/acoes-trafego/${p.id}/decidir`, null, { decisao: 'aceitar' })).status, 401, 'só pessoa logada decide');
    const ac = await pedir('POST', `/api/acoes-trafego/${p.id}/decidir`, 'gestor', { decisao: 'aceitar' });
    assert.equal(ac.status, 200); assert.equal(ac.corpo.ok, true); assert.equal(ac.corpo.acao.status, 'aceita'); assert.equal(ac.corpo.acao.decidida_por, 'Paulo');
    assert.ok(ac.corpo.acao.antes && ac.corpo.acao.antes.periodo === '12/11 a 18/11');
    assert.ok(auditorias.some(a => a.acao === 'trafego_acao_aceita' && a.registro === p.id && a.tabela === 'trafego_acoes'));
    const de = await pedir('POST', `/api/acoes-trafego/${p.id}/decidir`, 'gestor', { decisao: 'recusar' });
    assert.equal(de.status, 409); assert.equal(de.corpo.codigo, 'ja_decidida');
    assert.equal((await pedir('POST', `/api/acoes-trafego/${p.id}/decidir`, 'gestor', { decisao: 'sim' })).corpo.codigo, 'decisao');
    const feita = await pedir('POST', `/api/acoes-trafego/${p.id}/feita`, 'gestor', {});
    assert.equal(feita.status, 200); assert.equal(feita.corpo.acao.status, 'feita'); assert.equal(feita.corpo.aviso, null);
    assert.ok(auditorias.some(a => a.acao === 'trafego_acao_feita'));
    assert.equal((await pedir('POST', '/api/acoes-trafego/aaaaaaaa-1111-4222-8333-444444444444/feita', 'gestor', {})).status, 404);

    const reg = await pedir('POST', '/api/acoes-trafego', 'gestor', { tipo: 'negativar_termo', titulo: 'Bloqueei o termo "curso de mecânica"', alvo: { plataforma: 'google', nivel: 'termo', nome: 'curso de mecânica' }, ja_fiz: true });
    assert.equal(reg.status, 200); assert.equal(reg.corpo.acao.origem, 'pessoa'); assert.equal(reg.corpo.acao.status, 'feita');
    assert.ok(auditorias.some(a => a.acao === 'trafego_acao_registrada'));
    const ruim = await pedir('POST', '/api/acoes-trafego', 'gestor', { tipo: 'negativar_termo', titulo: 'x' });
    assert.equal(ruim.status, 422); assert.equal(ruim.corpo.codigo, 'titulo');

    assert.equal((await pedir('POST', '/api/cron/medir')).status, 401);
    const rot = await TD.calado(() => pedir('POST', `/api/cron/medir?chave=${CRON}`));
    assert.equal(rot.status, 200); assert.equal(rot.corpo.ok, true); assert.equal(rot.corpo.erros, 0);
    assert.equal((await pedir('GET', `/api/cron/medir?chave=${CRON}`)).status, 200);
  });
});
