'use strict';
/* Rodada 3: segurança (CORS, limites, erros), resultados por responsável,
   resumo semanal e alerta do radar virando notificação. */
const test = require('node:test');
const assert = require('node:assert/strict');
const seg = require('../seguranca');
const A = require('../atribuicao');
const semanal = require('../semanal');
const agenda = require('../agenda');
const radar = require('../radar');
const db = require('../db');

test('origemPermitida: mesma origem, ecossistema e localhost passam; o resto não', () => {
  assert.equal(seg.origemPermitida(undefined, 'x.com'), true);
  assert.equal(seg.origemPermitida('https://indycar-ads.onrender.com', 'indycar-ads.onrender.com'), true);
  assert.equal(seg.origemPermitida('https://indycar-crm.onrender.com', 'indycar-ads.onrender.com'), true);
  assert.equal(seg.origemPermitida('http://localhost:3411', 'outro'), true);
  assert.equal(seg.origemPermitida('https://site-malvado.com', 'indycar-ads.onrender.com'), false);
  assert.equal(seg.origemPermitida('https://indycar-crm.onrender.com.malvado.com', 'h'), false);
  assert.equal(seg.origemPermitida('lixo', 'h'), false);
});

test('limitador: conta por chave e libera quando a janela passa', () => {
  const l = seg.criarLimitador();
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(l.permitir('a', 3, 60_000, t).ok, true);
  const r = l.permitir('a', 3, 60_000, t + 1000);
  assert.equal(r.ok, false);
  assert.equal(r.esperar, 59);
  assert.equal(l.permitir('b', 3, 60_000, t).ok, true, 'outra chave não é afetada');
  assert.equal(l.permitir('a', 3, 60_000, t + 60_000).ok, true);
});

test('mensagemPublica: erro interno não vaza detalhe; frase pensada para a tela passa', () => {
  assert.equal(seg.mensagemPublica(new Error('lerConfig: relation "ads_config" does not exist')), 'Algo deu errado aqui. Tente de novo em instantes.');
  assert.equal(seg.mensagemPublica(new Error('Não foi possível ler a atribuição do CRM. Tente novamente.')), 'Não foi possível ler a atribuição do CRM. Tente novamente.');
  assert.equal(seg.mensagemPublica(Object.assign(new Error('campo x'), { status: 400 })), 'campo x');
  assert.equal(seg.mensagemPublica(Object.assign(new Error('IA fora'), { status: 503, publico: true })), 'IA fora');
});

test('ipDe: usa o primeiro IP do X-Forwarded-For (Render) e cai no socket', () => {
  assert.equal(seg.ipDe({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: {} }), '1.2.3.4');
  assert.equal(seg.ipDe({ headers: {}, socket: { remoteAddress: '::1' } }), '::1');
});

const R1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', R2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const leads = [
  { id: 'l1', origem: 'meta', status: 'concluido', valor_pago: 500, responsavel_id: R1 },
  { id: 'l2', origem: 'meta', status: 'agendado', responsavel_id: R1 },
  { id: 'l3', origem: 'google', status: 'perdido', responsavel_id: R2 },
  { id: 'l4', origem: 'google', status: 'concluido', valor_pago: null, responsavel_id: R2 },
  { id: 'l5', origem: 'meta', status: 'novo', responsavel_id: null },
  { id: 'l6', origem: 'site', status: 'concluido', valor_pago: 900, responsavel_id: R1 },   // não é pago: fora
  { id: 'l1', origem: 'meta', status: 'concluido', valor_pago: 500, responsavel_id: R1 },   // repetido: fora
];
const ags = [{ lead_id: 'l1', status: 'concluido' }, { lead_id: 'l2', status: 'confirmado' }, { lead_id: 'l4', status: 'cancelado' }];

test('porResponsavel: leads de anúncio por vendedor, com agendamento, venda, receita e conversão', () => {
  const r = A.porResponsavel({ leads, agendamentos: ags });
  assert.deepEqual(r.map(x => x.responsavel_id), [R1, R2, null], 'sem responsável sempre por último');
  const [a, b, sem] = r;
  assert.deepEqual([a.leads, a.agendamentos, a.compareceram, a.fechados, a.receita, a.meta], [2, 2, 1, 1, 500, 2]);
  assert.equal(a.conversao, 50);
  assert.deepEqual([b.leads, b.agendamentos, b.fechados, b.perdidos, b.google], [2, 0, 1, 1, 2]);
  assert.equal(b.receita, null, 'venda sem valor não é R$ 0');
  assert.equal(sem.leads, 1);
  assert.equal(A.porResponsavel({ leads, agendamentos: ags, plataforma: 'google' }).length, 1);
});

test('equipeDe: troca id por nome e marca sem responsável e pessoa desativada', async () => {
  const { equipeDe } = require('../resultados');
  const nomes = async () => new Map([[R1, { nome: 'Ana', ativo: true }], [R2, { nome: 'Beto', ativo: false }]]);
  const r = await equipeDe({ leads, agendamentos: ags }, null, nomes);
  assert.deepEqual(r.map(x => x.nome), ['Ana', 'Beto', 'Sem responsável']);
  assert.equal(r[1].inativo, true);
  assert.equal(r[2].sem_responsavel, true);
  assert.ok(r.every(x => !('responsavel_id' in x)), 'id do perfil não sai para a tela');
});

test('semanaFechada: segunda a domingo anteriores', () => {
  assert.deepEqual(semanal.semanaFechada('2026-10-13'), { de: '2026-10-05', ate: '2026-10-11' });   // terça
  assert.deepEqual(semanal.semanaFechada('2026-10-12'), { de: '2026-10-05', ate: '2026-10-11' });   // segunda
  assert.deepEqual(semanal.semanaFechada('2026-10-11'), { de: '2026-09-28', ate: '2026-10-04' });   // domingo
});

test('montar: título e corpo curtos, com CRM, melhor CPA e campanha que gastou sem converter', () => {
  const m = semanal.montar({
    de: '2026-10-05', ate: '2026-10-11',
    painel: { total: { gasto: 1234.5 }, comparacao: { gasto: { variacao: 12.3 } } },
    crm: { total: { leads: 20, agendamentos: 8, fechados: 3, custo_agendamento: 154.31 } },
    ranking: [{ nome: 'Revisão', gasto: 600, cpa: 40, conversoes: 15 }, { nome: 'Freio', gasto: 200, cpa: null, conversoes: 0 }],
    alertas: 2,
  });
  assert.match(m.titulo, /^Semana 05\/10–11\/10: R\$\s?1\.234,50 em anúncios, 20 lead\(s\)$/);
  assert.match(m.corpo, /\+12% contra a semana anterior/);
  assert.match(m.corpo, /8 agendamento\(s\), 3 venda\(s\)/);
  assert.match(m.corpo, /Melhor CPA: Revisão/);
  assert.match(m.corpo, /Atenção: Freio gastou/);
  assert.match(m.corpo, /2 alerta\(s\)/);
  assert.ok(m.titulo.length <= 140 && m.corpo.length <= 400);
  assert.match(semanal.montar({ de: '2026-10-05', ate: '2026-10-11', painel: { total: { gasto: 0 } }, crm: null }).titulo, /sem investimento/);
});

test('gerarENotificar: automático vai para os gestores com chave da semana; manual só para quem pediu', async () => {
  const chamadas = [];
  const deps = {
    painel: { resumo: async () => ({ total: { gasto: 10 } }), ranking: async () => [] },
    resultados: { resumo: async () => ({ total: { leads: 1, agendamentos: 0, fechados: 0 } }) },
    db: { listarAlertas: async () => [] },
    equipe: {
      notificarGestores: async o => { chamadas.push(['todos', o]); return { destinatarios: 2, enviadas: 2 }; },
      notificarUm: async (id, o) => { chamadas.push([id, o]); return true; },
    },
  };
  const a = await semanal.gerarENotificar({ hojeISO: '2026-10-12', deps });
  assert.equal(a.enviadas, 2);
  assert.equal(chamadas[0][1].chave, 'ads-semana-2026-10-05');
  assert.equal(chamadas[0][1].preferencia, 'ads_semana');
  assert.equal(chamadas[0][1].tipo, 'ads_semana');
  const b = await semanal.gerarENotificar({ hojeISO: '2026-10-12', manualPara: 'eu', deps });
  assert.equal(b.enviadas, 1);
  assert.equal(chamadas[1][0], 'eu');
});

test('decidirSemanal: só segunda, a partir das 8h, uma vez por semana', () => {
  assert.equal(agenda.decidirSemanal('2026-10-13', 9, null).enviar, false);   // terça
  assert.equal(agenda.decidirSemanal('2026-10-12', 7, null).enviar, false);
  assert.deepEqual(agenda.decidirSemanal('2026-10-12', 8, null), { enviar: true, semana: '2026-10-05' });
  assert.equal(agenda.decidirSemanal('2026-10-12', 10, '2026-10-05').enviar, false);
});

test('notificacaoDosAlertas: crítico primeiro, corpo curto, link para o Radar e chave estável', () => {
  const n = radar.notificacaoDosAlertas([
    { id: 'b2', severidade: 'alerta', mensagem: 'CTR baixo em X\nlinha 2' },
    { id: 'a1', severidade: 'critico', mensagem: 'CPA estourado em Y' },
    { id: 'c3', severidade: 'info', mensagem: 'm3' }, { id: 'd4', severidade: 'info', mensagem: 'm4' },
  ]);
  assert.equal(n.titulo, 'Radar: 1 alerta(s) crítico(s) e mais 3');
  assert.ok(n.corpo.startsWith('CPA estourado em Y · CTR baixo em X · m3'));
  assert.ok(n.corpo.endsWith('+1'));
  assert.equal(n.link, '/?aba=radar');
  assert.equal(n.chave, 'ads-alerta-a1');
  assert.equal(n.tipo, 'ads_alerta');
});

test('radar.rodar: alerta gravado vira notificação; simulação não notifica', async () => {
  const orig = { lerConfig: db.lerConfig, listarRegras: db.listarRegras, ultimosDisparos: db.ultimosDisparos, lerMetricas: db.lerMetricas, gravarAlertas: db.gravarAlertas };
  const notif = [];
  db.lerConfig = async () => ({ alertas_ativos: true, whatsapp_destinos: [], cpa_alvo: null });
  db.listarRegras = async () => [{ id: 'r1', nome: 'Gasto', nivel: 'campanha', metrica: 'gasto', operador: '>', valor: 10, janela_dias: 7, cooldown_horas: 24, severidade: 'critico', min_gasto: 0, min_impressoes: 0, min_conversoes: 0, ativa: true }];
  db.ultimosDisparos = async () => new Map();
  db.lerMetricas = async () => [{ plataforma: 'meta', nivel: 'campanha', entidade_ext: 'c1', entidade_nome: 'Camp', campanha_nome: 'Camp', data: '2026-10-10', gasto: 100, impressoes: 1000, cliques: 10, conversoes: 1, valor_conversao: 0 }];
  db.gravarAlertas = async l => l.map((a, i) => ({ ...a, id: `id${i}` }));
  const original = radar.rodar.notificador;
  radar.rodar.notificador = { notificarGestores: async o => { notif.push(o); return { destinatarios: 1, enviadas: 1 }; } };
  try {
    const r = await radar.rodar({ enviar: true, crm: false });
    assert.ok(r.disparados >= 1);
    assert.equal(notif.length, 1);
    assert.equal(notif[0].preferencia, 'ads_alertas');
    assert.deepEqual(r.notificacao, { destinatarios: 1, enviadas: 1 });
    await radar.rodar({ enviar: false, crm: false, ignorarCooldown: true });
    assert.equal(notif.length, 1, 'testar agora (simulação) não notifica ninguém');
  } finally {
    Object.assign(db, orig);
    radar.rodar.notificador = original;
  }
});
