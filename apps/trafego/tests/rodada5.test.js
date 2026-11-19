'use strict';
/* Rodada 5 (16/10/2026): endereços centralizados, leads do anúncio ao CRM, ranking × CRM,
   fila do Comunicar, vocabulário da casa, usuario_pode no porteiro, busca e atalhos, modo sem chaves. */
const test = require('node:test');
const assert = require('node:assert/strict');

const Eco = require('../public/ecossistema.js');
const Busca = require('../public/busca.js');
const Vocab = require('../vocabulario');
const L = require('../leads');
const A = require('../atribuicao');
const E = require('../equipe');
const auth = require('../auth');
const relatorio = require('../relatorio');
const radar = require('../radar');
const semanal = require('../semanal');
const seg = require('../seguranca');
const LD = require('../scripts/leads-demo.cjs');

/* ---------------- ecossistema ---------------- */
test('ecossistema: um lugar só para os endereços; links cruzados no formato que os apps entendem', () => {
  assert.equal(Eco.linkLead('abc'), 'https://indycar-agendamentos.onrender.com/crm/?lead=abc');
  assert.equal(Eco.linkConversaTel('(12) 97403-2299'), 'https://indycar-agendamentos.onrender.com/atendimento/?tel=5512974032299');
  assert.equal(Eco.linkAgendamento('x1'), 'https://indycar-agendamentos.onrender.com/agenda/?agendamento=x1');
  assert.equal(Eco.linkComunicarTel(''), null);
  assert.equal(Eco.telefone('+55 (12) 9 7403-2299'), '5512974032299');
  assert.ok(Eco.origens().includes('https://indycar-crm.onrender.com'));
  assert.ok(Eco.COM_LOGIN.includes('patio'));
  // equipe.js e seguranca.js leem daqui
  assert.equal(E.APPS_ECOSSISTEMA.crm[1], Eco.url('crm'));
  assert.ok(!E.APPS_ECOSSISTEMA.ads, 'o próprio Ads não aparece na lista de "outros apps"');
  assert.ok(seg.ORIGENS.has(Eco.url('patio')));
});

test('ecossistema: link de notificação relativo vira absoluto no app de origem; link estranho vai para a raiz', () => {
  assert.equal(Eco.linkDeNotificacao('/?lead=1', 'crm', 'ads'), 'https://indycar-agendamentos.onrender.com/crm/?lead=1');
  assert.equal(Eco.linkDeNotificacao('/?aba=radar', 'ads', 'ads'), '/?aba=radar');
  assert.equal(Eco.linkDeNotificacao('https://malicioso.com/x', 'crm', 'ads'), '/');
  assert.equal(Eco.linkDeNotificacao('//evil', 'crm', 'ads'), '/');
  assert.equal(Eco.linkDeNotificacao('https://indycar-agendamentos.onrender.com/crm/?lead=2', 'crm', 'ads'), 'https://indycar-agendamentos.onrender.com/crm/?lead=2');
});

/* ---------------- vocabulário ---------------- */
test('vocabulário: acha e troca as palavras proibidas, mantendo maiúscula', () => {
  assert.deepEqual(Vocab.conferir('Prezado cliente, favor comparecer com o veículo'), ['Prezado', 'comparecer', 'veículo']);
  assert.equal(Vocab.limpar('Prezado cliente, favor comparecer com o veículo para efetuar a revisão'), 'Olá cliente, favor vir com o carro para fazer a revisão');
  assert.equal(Vocab.limpar('Vieram à oficina'), 'Vieram à oficina');
  assert.deepEqual(Vocab.conferir('Quem conhece, Indyca! 🏎'), []);
});

/* ---------------- leads ---------------- */
test('leads: canal pelo CRM/UTM, linha com links cruzados, telefone normalizado e venda sem valor marcada', () => {
  const l = { id: 'l1', cliente_id: 'c1', nome: 'Maria', telefone: '12 97403-2299', origem: 'organico', utm_source: 'site', status: 'concluido', valor_pago: null, created_at: '2026-10-16T12:00:00Z' };
  const x = L.montarLinha(l, { agendamento: { id: 'a1', data: '2026-10-17', hora: '09:00', status: 'confirmado' }, responsavel: { nome: 'Ana' } });
  assert.equal(x.canal, 'site');
  assert.equal(x.pago, false);
  assert.equal(x.telefone, '5512974032299');
  assert.equal(x.sem_valor, true);
  assert.equal(x.status_nome, 'Venda fechada');
  assert.equal(x.responsavel, 'Ana');
  assert.equal(x.links.crm, 'https://indycar-agendamentos.onrender.com/crm/?lead=l1');
  assert.equal(x.links.agenda, 'https://indycar-agendamentos.onrender.com/agenda/?agendamento=a1');
  assert.match(x.links.atendimento, /\?tel=5512974032299$/);
  assert.equal(L.canalDe({ origem: 'whatsapp' }), 'whatsapp');
  assert.equal(L.canalDe({ origem: 'organico', utm_source: 'instagram' }), 'meta');
  assert.equal(L.canalDe({ origem: 'organico', utm_source: 'google', utm_medium: 'cpc' }), 'google');
  assert.equal(L.canalDe({ origem: 'xyz' }), 'outro');
});

test('leads: filtro por canal, status, "só pagos" e busca por nome/telefone/campanha; resumo por canal', () => {
  const lista = LD.listar({ de: '2026-10-10', ate: '2026-10-16' }).leads;
  assert.ok(lista.length > 20);
  assert.ok(L.filtrar(lista, { canal: 'site' }).every(l => l.canal === 'site'));
  assert.ok(L.filtrar(lista, { soPagos: true }).every(l => l.pago));
  assert.ok(L.filtrar(lista, { status: 'concluido' }).every(l => l.status === 'concluido'));
  const um = lista[0];
  assert.ok(L.filtrar(lista, { q: um.nome.slice(0, 5).toUpperCase() }).some(l => l.id === um.id), 'busca por nome ignora caixa');
  assert.ok(L.filtrar(lista, { q: um.telefone.slice(-4) }).some(l => l.id === um.id), 'busca por 4 dígitos do telefone');
  assert.equal(L.filtrar(lista, { q: '12' }).filter(l => !/12/i.test(l.nome + l.campanha + l.servico + l.carro + (l.responsavel || ''))).length, 0, '2 dígitos não procuram telefone');
  const r = L.resumo(lista);
  assert.equal(r.total, lista.length);
  assert.equal(Object.values(r.por_canal).reduce((a, b) => a + b, 0), lista.length);
  assert.equal(r.fechados, r.sem_valor + lista.filter(l => l.status === 'concluido' && l.valor_pago > 0).length);
});

test('leads: listar() com banco falso pagina, junta agendamento e nome do responsável', async () => {
  const brutos = LD.brutos('2026-10-15', '2026-10-16');
  const sb = { from: tabela => ({
    select: () => ({
      gte: () => ({ lt: () => ({ order: () => ({ order: () => ({ range: async (a, b) => ({ data: brutos.slice(a, b + 1), error: null }) }) }) }) }),
      in: async (_col, ids) => ({ data: ids.slice(0, 2).map(id => ({ id: 'ag-' + id, lead_id: id, data: '2026-10-20', hora: '10:00', status: 'confirmado' })), error: null }),
    }),
  }) };
  const r = await L.listar({ de: '2026-10-15', ate: '2026-10-16', sb, nomes: async ids => new Map(ids.map(i => [i, { nome: 'Pessoa ' + i.slice(0, 1) }])) });
  assert.equal(r.total_periodo, brutos.length);
  assert.ok(r.leads.filter(l => l.agendamento).length >= 1);
  assert.ok(r.leads.some(l => l.responsavel && l.responsavel.startsWith('Pessoa')));
  assert.ok(r.resumo_periodo.por_canal.site >= 1);
  const csv = L.csv(r.leads);
  assert.ok(csv.startsWith('﻿"Criado em";"Nome";"Telefone";"Canal"'));
  assert.ok(csv.includes('https://indycar-agendamentos.onrender.com/crm/?lead='));
  assert.ok(!/observa/i.test(csv), 'observações não vão no CSV');
});

test('leads: fraseDoDia para o relatório, no vocabulário da casa', () => {
  assert.equal(L.fraseDoDia(null), 'Nenhum lead novo no CRM.');
  const f = L.fraseDoDia({ total: 6, sem_responsavel: 2, por_canal: { site: 2, whatsapp: 1, meta: 2, google: 1 } });
  assert.equal(f, '6 lead(s) novo(s) no CRM: 2 do site, 1 pelo WhatsApp, 3 de anúncio (Meta 2 · Google 1). 2 sem responsável.');
  assert.deepEqual(Vocab.conferir(f), []);
});

/* ---------------- ranking × CRM ---------------- */
test('juntarRankingComCRM: casa pela UTM normalizada, calcula custo real e explica quando não casa', () => {
  const ranking = [
    { plataforma: 'meta', nome: '[Meta] Revisão — Taubaté', gasto: 300 },
    { plataforma: 'google', nome: 'Campanha sem lead', gasto: 90 },
  ];
  const resultado = A.consolidar({
    leads: [
      { id: 1, origem: 'meta', utm_campaign: '[meta] revisao — taubate', status: 'concluido', valor_pago: 600 },
      { id: 2, origem: 'meta', utm_campaign: '[META] Revisão — Taubaté', status: 'contato' },
      { id: 3, origem: 'google', utm_campaign: null, status: 'novo' },
    ],
    metricas: [{ plataforma: 'meta', campanha_nome: '[Meta] Revisão — Taubaté', gasto: 300 }, { plataforma: 'google', campanha_nome: 'Campanha sem lead', gasto: 90 }],
    agendamentos: [{ lead_id: 1, status: 'concluido' }],
  });
  const [m, g] = A.juntarRankingComCRM(ranking, resultado);
  assert.equal(m.crm.leads, 2);
  assert.equal(m.crm.fechados, 1);
  assert.equal(m.crm.cpl, 150);
  assert.equal(m.crm.custo_venda, 300);
  assert.equal(m.crm.roas_real, 2);
  assert.equal(g.crm, null);
  assert.match(g.crm_motivo, /sem utm_campaign/);
  assert.deepEqual(A.juntarRankingComCRM(ranking, null).map(r => r.crm), [null, null]);
});

/* ---------------- porteiro: usuario_pode ---------------- */
test('acessoAds: o "não" do banco (usuario_pode) manda, mesmo para admin; null cai na regra local', () => {
  assert.equal(E.acessoAds({ papel: 'admin', pode_ads: false }).ok, false);
  assert.equal(E.acessoAds({ papel: 'gestor', apps: ['ads'], pode_ads: false }).motivo, 'sem_app');
  assert.equal(E.acessoAds({ papel: 'gestor', apps: ['ads'], pode_ads: true }).ok, true);
  assert.equal(E.acessoAds({ papel: 'gestor', apps: ['ads'], pode_ads: null }).ok, true);
  assert.equal(E.acessoAds({ papel: 'atendente', apps: ['ads'], pode_ads: true }).ok, false, 'atendente continua fora mesmo com o banco dizendo sim');
  assert.equal(E.perfilPublico({ id: 'x', papel: 'admin', pode_ads: true }).acesso_conferido_no_banco, true);
  assert.equal(E.perfilPublico({ id: 'x', papel: 'admin' }).acesso_conferido_no_banco, false);
});

test('podeNoBanco: chama a rpc com o token da pessoa; erro ou resposta estranha vira null', async () => {
  const chamadas = [];
  const fetchFalso = (valor, ok = true) => async (url, o) => { chamadas.push({ url, o }); return { ok, json: async () => valor }; };
  assert.equal(await auth.podeNoBanco('tok', 'ads', fetchFalso(true)), true);
  assert.equal(await auth.podeNoBanco('tok', 'ads', fetchFalso(false)), false);
  assert.equal(await auth.podeNoBanco('tok', 'ads', fetchFalso('sim')), null);
  assert.equal(await auth.podeNoBanco('tok', 'ads', fetchFalso(true, false)), null);
  assert.equal(await auth.podeNoBanco('tok', 'ads', async () => { throw new Error('rede'); }), null);
  assert.match(chamadas[0].url, /\/rest\/v1\/rpc\/usuario_pode$/);
  assert.equal(chamadas[0].o.headers.Authorization, 'Bearer tok');
  assert.equal(JSON.parse(chamadas[0].o.body).p_app, 'ads');
});

/* ---------------- textos que saem ---------------- */
function dadosRelatorio(extra = {}) {
  const zero = { gasto: 0, conversoes: 0, cpa: null, roas: null, ctr: null, cpm: null, cliques: 0, impressoes: 0, valor_conversao: 0, frequencia: 0 };
  const comp = Object.fromEntries(['gasto', 'conversoes', 'cpa', 'roas', 'ctr', 'cpm', 'cliques', 'impressoes', 'valor_conversao', 'cpc'].map(k => [k, { variacao: null }]));
  return { referencia: '2026-10-15', cfg: {}, dia: { total: { ...zero, gasto: 120, conversoes: 3 }, comparacao: comp, por_plataforma: [] },
    semana: { total: zero, crm: { meta: { leads: 4, fechados: 1, receita: 0, sem_valor: 1 } }, periodo: { de: '2026-10-09' } },
    mes: { orcamento: null }, campanhas: [], criativos: [], alertas_recentes: [], leadsDia: { total: 2, sem_responsavel: 0, por_canal: { site: 1, whatsapp: 1 } }, ...extra };
}
test('relatório: traz os leads do dia por canal, fecha com o slogan, avisa demonstração e não deixa palavra proibida passar', () => {
  const t = relatorio.montarTexto(dadosRelatorio(), 'Prezado dono, o veículo converteu.');
  assert.match(t, /\*Leads de ontem no CRM\*\n• 2 lead\(s\) novo\(s\) no CRM: 1 do site, 1 pelo WhatsApp\./);
  assert.ok(t.trim().endsWith('_Quem conhece, Indyca! 🏎_'));
  assert.deepEqual(Vocab.conferir(t), []);
  assert.match(t, /Olá dono, o carro converteu/);
  assert.ok(!/DEMONSTRA/.test(t));
  assert.match(relatorio.montarTexto(dadosRelatorio({ demo: true }), null), /DEMONSTRAÇÃO/);
});

test('radar e resumo semanal: textos passam pelo vocabulário da casa', () => {
  const t = radar.textoDoAlerta([{ severidade: 'critico', mensagem: 'Campanha do veículo X: comparecimento baixo' }]);
  assert.deepEqual(Vocab.conferir(t), []);
  assert.match(t, /carro X: presença/);
  const s = semanal.montar({ de: '2026-10-05', ate: '2026-10-11', painel: { total: { gasto: 100 } }, crm: { total: { leads: 3, agendamentos: 1, fechados: 0 } }, ranking: [{ nome: 'Veículos usados', cpa: 10, gasto: 100, conversoes: 1 }] });
  assert.deepEqual(Vocab.conferir(s.titulo + s.corpo), []);
  assert.match(s.corpo, /Carros usados/);
});

/* ---------------- busca e atalhos (tela) ---------------- */
test('busca: filtra por começo, por conteúdo, por telefone e por palavras fora de ordem; melhores primeiro', () => {
  const itens = [
    { tipo: 'aba', titulo: 'Painel', detalhe: 'Visão geral' },
    { tipo: 'campanha', titulo: '[Meta] Suspensão e Alinhamento', detalhe: 'Meta · R$ 300' },
    { tipo: 'lead', titulo: 'Maria Souza', telefone: '5512974032299', detalhe: 'Site' },
    { tipo: 'regra', titulo: 'CPA acima do teto', detalhe: 'cpa > 120' },
  ];
  assert.deepEqual(Busca.filtrar(itens, 'suspensao').map(i => i.tipo), ['campanha']);
  assert.deepEqual(Busca.filtrar(itens, 'alinhamento suspensão').map(i => i.tipo), ['campanha']);
  assert.deepEqual(Busca.filtrar(itens, '2299').map(i => i.tipo), ['lead']);
  assert.deepEqual(Busca.filtrar(itens, 'cpa')[0].tipo, 'regra');
  assert.deepEqual(Busca.filtrar(itens, ''), []);
  assert.equal(Busca.filtrar(itens, 'x', 1).length, 0);
  assert.equal(Busca.valeBuscarNoCRM('ma'), false);
  assert.equal(Busca.valeBuscarNoCRM('mar'), true);
  assert.equal(Busca.valeBuscarNoCRM('9740'), true);
});

test('atalhos: números trocam de aba, Ctrl+K sempre abre a busca, nada dispara dentro de campo ou com modal aberto', () => {
  const a = (key, extra = {}) => Busca.acaoDaTecla({ key, ...extra });
  assert.equal(a('2'), 'aba:leads');
  assert.equal(a('8'), 'aba:ajustes');
  assert.equal(a('k', { ctrlKey: true, emCampo: true, modalAberto: true }), 'busca');
  assert.equal(a('Escape', { emCampo: true }), 'fechar');
  assert.equal(a('/'), 'busca');
  assert.equal(a('?'), 'ajuda');
  assert.equal(a('t'), 'tema');
  assert.equal(a('e'), 'exportar');
  assert.equal(a('2', { emCampo: true }), null);
  assert.equal(a('2', { modalAberto: true }), null);
  assert.equal(a('2', { altKey: true }), null);
  assert.equal(a('z'), null);
  assert.ok(Busca.ATALHOS.length >= 14);
});

test('rodada 5b: filtro "só sem responsável" e resumo semanal com o funil inteiro (site, WhatsApp, anúncios)', () => {
  const lista = LD.listar({ de: '2026-10-10', ate: '2026-10-16' }).leads;
  const sem = L.filtrar(lista, { semResponsavel: true });
  assert.ok(sem.length > 0 && sem.every(l => l.sem_responsavel));
  const s = semanal.montar({ de: '2026-10-05', ate: '2026-10-11', painel: { total: { gasto: 100 } }, crm: { total: { leads: 3, agendamentos: 1, fechados: 0 } },
    leadsTodos: { total: 12, sem_responsavel: 2, por_canal: { site: 4, whatsapp: 5, meta: 2, google: 1 } } });
  assert.match(s.corpo, /No total 12 lead\(s\) novo\(s\) \(site 4, WhatsApp 5, anúncios 3\), 2 sem responsável\./);
  assert.ok(Busca.ATALHOS.some(a => a.acao === 'imprimir'));
  assert.equal(Busca.acaoDaTecla({ key: 'p' }), 'imprimir');
});

test('rodada 5c: classificarChave — token de exemplo recusado pela plataforma não conta como chave; situação do canal conhece os códigos do vigia', () => {
  const db = require('../db');
  assert.equal(db.classificarChave(null), 'sem_token');
  assert.equal(db.classificarChave({ canal: 'meta', meta_access_token: 'EAAexemplo', ultimo_sync_status: 'erro — Meta API 400: Malformed access token' }), 'recusada');
  assert.equal(db.classificarChave({ canal: 'meta', meta_access_token: 'EAAreal', ultimo_sync_status: 'ok — 120 linhas' }), 'ok');
  assert.equal(db.classificarChave({ canal: 'meta', meta_access_token: 'EAAreal', ultimo_sync_status: null }), 'ok');
  assert.equal(db.classificarChave({ canal: 'google', google_refresh_token: 'x', google_developer_token: '' }), 'sem_token');
  assert.equal(db.classificarChave({ canal: 'meta', meta_access_token: 'EAA', ativo: false }), 'sem_token');
  const wa = require('../whatsapp');
  for (const c of ['codewords-chave-recusada', 'codewords-fora', 'whatsapp-desconectado', 'comunicar-carteiro-parado', 'comunicar-fila-parada']) assert.ok(wa.PROBLEMAS_CANAL[c], c);
});

test('rodada 5d: ordem dos leads, "agendaram" no resumo, canal por extenso no CSV, último acesso no perfil, ordem inválida vira recentes', () => {
  const lista = LD.listar({ de: '2026-10-10', ate: '2026-10-16' }).leads;
  const antigos = L.ordenar(lista, 'antigos');
  assert.ok(antigos[0].criado_em <= antigos[antigos.length - 1].criado_em);
  const valor = L.ordenar(lista, 'valor');
  const v = x => (x.valor_pago > 0 ? x.valor_pago : x.valor_orcado > 0 ? x.valor_orcado : 0);
  assert.ok(v(valor[0]) >= v(valor[1]));
  const nome = L.ordenar(lista, 'nome');
  assert.ok(nome[0].nome.localeCompare(nome[nome.length - 1].nome, 'pt-BR') <= 0);
  assert.equal(L.ordenar(lista, 'xyz')[0].criado_em, L.ordenar(lista, 'recentes')[0].criado_em);
  assert.ok(L.ORDENS.includes('valor'));
  const r = L.resumo(lista);
  assert.equal(r.agendados, lista.filter(l => l.agendamento).length);
  const csv = L.csv(lista.slice(0, 5));
  assert.ok(/"(Meta|Google|Site|WhatsApp|Indicação|Orgânico)"/.test(csv), 'canal por extenso no CSV');
  const p = E.perfilPublico({ id: 'x', papel: 'admin', ultimo_acesso_em: '2026-10-16T01:00:00Z', ultimo_app: 'crm' });
  assert.equal(p.ultimo_app, 'crm');
  assert.equal(p.ultimo_acesso_em, '2026-10-16T01:00:00Z');
});

test('rodada 5e: leads.hoje tem cache de 30 s por dia e expõe o último lead; demo não entra com dado real (regra do servidor)', async () => {
  let chamadas = 0;
  const brutos = LD.brutos(L.hojeBR(), L.hojeBR());
  const sb = { from: () => ({ select: () => ({
    gte: () => ({ lt: () => ({ order: () => ({ order: () => ({ range: async (a, b) => { chamadas++; return { data: brutos.slice(a, b + 1), error: null }; } }) }) }) }),
    in: async () => ({ data: [], error: null }),
  }) }) };
  L.esquecerHoje();
  const h = await L.hoje({ sb, nomes: async () => new Map() });
  assert.equal(h.dia, L.hojeBR());
  assert.equal(h.ultimo_em, h.ultimos[0]?.criado_em || null);
  assert.ok(h.total >= 4);
  // sb injetado não usa o cache (é o banco falso); o padrão (db.sb) usa.
  await L.hoje({ sb, nomes: async () => new Map() });
  assert.equal(chamadas, 2);
});

test('rodada 5f: CSV de campanhas leva as colunas do CRM e a busca de leads limpa caracteres de controle', () => {
  const ranking = [{ plataforma: 'meta', nome: 'Revisão', gasto: 100, impressoes: 1, cliques: 1, conversoes: 1 }];
  const resultado = A.consolidar({ leads: [{ id: 1, origem: 'meta', utm_campaign: 'revisao', status: 'concluido', valor_pago: 300 }],
    metricas: [{ plataforma: 'meta', campanha_nome: 'Revisão', gasto: 100 }], agendamentos: [{ lead_id: 1, status: 'concluido' }] });
  const linhas = A.juntarRankingComCRM(ranking, resultado).map(r => ({ ...r, crm_leads: r.crm?.leads ?? null, crm_vendas: r.crm?.fechados ?? null, crm_custo_venda: r.crm?.custo_venda ?? null }));
  const csv = A.montarCSV([['nome', 'Nome'], ['crm_leads', 'Leads no CRM'], ['crm_vendas', 'Vendas (CRM)'], ['crm_custo_venda', 'Custo por venda (CRM)']], linhas);
  assert.ok(csv.includes('"Revisão";"1";"1";"100"'), csv);
  const { periodoDaQuery } = require('../server');
  assert.ok(periodoDaQuery(new URLSearchParams('dias=7')).de);
});
