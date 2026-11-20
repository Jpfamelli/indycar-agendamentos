'use strict';
process.env.TRAFEGO_TELA_ANTIGA = '1'; // rodada 10: estas rotas são da tela antiga e ficam fechadas sem esta chave
/* Rodada 7: as rotas novas com porteiro e banco falsos (quem entra, o que volta, o que fica gravado na auditoria). */
process.env.ADS_CRON_TOKEN = 'chave-de-teste';
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');
const equipe = require('../equipe');
const db = require('../db');
const Ciclo = require('../ciclo');
const Resultados = require('../resultados');
const whatsapp = require('../whatsapp');
const Radar = require('../radar');
const Acoes = require('../acoes');
const { servidor } = require('../server');

const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PAPEIS = {
  admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true } },
  gestor_sem_ads: { usuario: { id: ID(3), papel: 'gestor', apps: ['crm'], ativo: true } },
};
const AGORA = Date.parse('2026-10-25T15:00:00Z');
const horas = n => new Date(AGORA - n * 3600000).toISOString();
const lead = (id, extra = {}) => ({ id, nome: 'Marcos Silva', telefone: '12991234567', origem: 'meta', status: 'orcamento', utm_source: 'instagram', utm_campaign: 'Revisão', responsavel_id: null, created_at: horas(100), ...extra });
const filaDemo = () => {
  const c = Ciclo.consolidarCiclo({ leads: [lead('l1')], porLead: Ciclo.ligar({ leadIds: ['l1'], orcamentos: [{ id: 'o1', lead_id: 'l1', status: 'enviado', total: 900, enviado_em: horas(20), visualizado_em: horas(5) }] }), agora: AGORA });
  return { indisponivel: false, ...Acoes.fila(c), alertas: c.alertas };
};

let base, chamadasAcoes = 0, fila = filaDemo(), enviados = [], resumos = [], cfg = { whatsapp_destinos: [], margem_pct: 100 };
const auditorias = [];
const orig = { identificar: auth.identificar, banco: equipe.banco, lerConfig: db.lerConfig, listarAlertas: db.listarAlertas, acoes: Ciclo.acoes, ligacao: Ciclo.ligacao,
  resumo: Resultados.resumo, enviar: whatsapp.enviarParaTodos, rodar: Radar.rodar, estadoChaves: db.estadoChaves, temDados: db.temDados, temDadosReais: db.temDadosReais, status: whatsapp.status };

test.before(async () => {
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async (u, acao, o) => { auditorias.push({ acao, o }); return true; } });
  db.lerConfig = async () => ({ ...cfg });
  db.listarAlertas = async () => [
    { id: 'a1', severidade: 'critico', nivel: 'campanha', plataforma: 'meta', entidade_ext: 'x1', entidade_nome: 'Suspensão', mensagem: 'CPA alto', criado_em: '2026-10-25T10:00:00Z', lido_em: null },
    { id: 'a2', severidade: 'alerta', nivel: 'conta', plataforma: 'meta', entidade_ext: 'ciclo:orc_quente', entidade_nome: 'Do anúncio à oficina', mensagem: 'cliente abriu', criado_em: '2026-10-25T11:00:00Z', lido_em: null },
    { id: 'a3', severidade: 'alerta', nivel: 'campanha', plataforma: 'google', entidade_ext: 'crm:Freios', entidade_nome: 'Freios', mensagem: 'sem lead', criado_em: '2026-10-25T09:00:00Z', lido_em: null },
  ];
  db.estadoChaves = async () => ({ meta: 'sem_token', google: 'sem_token' }); db.temDados = async () => true; db.temDadosReais = async () => false;
  whatsapp.status = async () => ({ pronto: true });
  Ciclo.acoes = async () => { chamadasAcoes++; return fila; };
  Ciclo.ligacao = async () => ({ indisponivel: false, saudavel: true, frase: 'Ligação em dia' });
  Resultados.resumo = async p => { resumos.push(p); return { demo: false, total: { gasto: 3000, leads: 40, cpl: 75, agendamentos: 20, fechados: 10, receita: 5000 }, ciclo: { indisponivel: true } }; };
  whatsapp.enviarParaTodos = async (d, t, o) => { enviados.push({ d, t, o }); return d.map(x => ({ destino: x, ok: true })); };
  Radar.rodar = async () => ({ avaliadas: 0, disparados: 1, suprimidos: 0, alertas: [{ severidade: 'alerta', entidade_ext: 'ciclo:orc_quente', nivel: 'conta', mensagem: 'x' }, { severidade: 'alerta', nivel: 'campanha', entidade_nome: 'Camp', mensagem: 'y' }], envio: null });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  Object.assign(auth, { identificar: orig.identificar });
  equipe.banco = orig.banco; db.lerConfig = orig.lerConfig; db.listarAlertas = orig.listarAlertas; Ciclo.acoes = orig.acoes; Ciclo.ligacao = orig.ligacao;
  Resultados.resumo = orig.resumo; whatsapp.enviarParaTodos = orig.enviar; Radar.rodar = orig.rodar;
  Object.assign(db, { estadoChaves: orig.estadoChaves, temDados: orig.temDados, temDadosReais: orig.temDadosReais }); whatsapp.status = orig.status;
  servidor.closeAllConnections?.();
  await new Promise(r => servidor.close(r));
});

async function pedir(caminho, papel = 'admin', { metodo = 'GET', corpo } = {}) {
  const r = await fetch(base + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { 'x-papel': papel, 'Content-Type': 'application/json' } });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* CSV */ }
  return { status: r.status, json, texto, headers: r.headers };
}

test('quem não tem o app Ads recebe 403 nas rotas novas', async () => {
  for (const c of ['/api/acoes', '/api/acoes.csv', '/api/ligacao', '/api/preparo', '/api/fechamento?mes=2026-09']) assert.equal((await pedir(c, 'gestor_sem_ads')).status, 403, c);
});

test('/api/acoes: devolve a fila com frase e alertas de campanha sem leitura; segunda chamada vem do cache; ?fresco=1 lê de novo', async () => {
  chamadasAcoes = 0;
  const a = await pedir('/api/acoes?dias=7');
  assert.equal(a.status, 200); assert.equal(a.json.total, 1); assert.match(a.json.frase, /1 cliente\(s\) esperando você/);
  assert.equal(a.json.alertas, undefined, 'os alertas internos do ciclo não vazam para a tela');
  assert.deepEqual(a.json.radar.map(x => x.id), ['a1', 'a3'], 'só campanha, crítico primeiro; o do ciclo fica de fora');
  await pedir('/api/acoes?dias=7');
  assert.equal(chamadasAcoes, 1, 'cache de 60 s');
  await pedir('/api/acoes?dias=7&fresco=1');
  assert.equal(chamadasAcoes, 2);
});

test('/api/acoes: fonte fora com leitura boa recente mostra a última marcada como desatualizada; sem cache devolve "indisponível"', async () => {
  const antes = fila;
  await pedir('/api/acoes?dias=11&fresco=1');              // aquece o cache dessa chave
  fila = { indisponivel: true, motivo: 'Orçador e Pátio não responderam agora.', itens: [], total: 0 };
  const r = await pedir('/api/acoes?dias=11&fresco=1');
  assert.equal(r.json.desatualizado, true); assert.equal(r.json.total, 1);
  const semCache = await pedir('/api/acoes?dias=13&fresco=1');
  assert.equal(semCache.json.indisponivel, true); assert.equal(semCache.json.total, 0);
  fila = antes;
});

test('/api/acoes.csv: cabeçalho, links, auditoria; 503 com frase quando a fonte está fora', async () => {
  const r = await pedir('/api/acoes.csv');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /o-que-fazer-agora-\d{4}-\d{2}-\d{2}\.csv/);
  assert.match(r.texto, /Prioridade/); assert.match(r.texto, /Marcos Silva/); assert.match(r.texto, /#\/historico\/o1/);
  assert.ok(auditorias.some(a => a.acao === 'ads_exportou_csv' && a.o.detalhes.arquivo === 'acoes'));
  const antes = fila; fila = { indisponivel: true, motivo: 'Orçador e Pátio não responderam agora.', itens: [], total: 0 };
  const ruim = await pedir('/api/acoes.csv');
  assert.equal(ruim.status, 503); assert.match(ruim.json.erro, /não responderam/);
  fila = antes;
});

test('/api/alertas: cada alerta leva a ação certa (campanha, ciclo, CRM)', async () => {
  const r = await pedir('/api/alertas');
  const por = Object.fromEntries(r.json.map(a => [a.id, a.acao]));
  assert.equal(por.a1.aba, 'campanhas'); assert.equal(por.a1.q, 'Suspensão');
  assert.equal(por.a2.aba, 'painel'); assert.equal(por.a2.ancora, 'cartao-acoes');
  assert.equal(por.a3.aba, 'leads'); assert.equal(por.a3.canal, 'google');
});

test('/api/radar (testar agora): a simulação também mostra para onde cada alerta leva', async () => {
  const r = await pedir('/api/radar', 'admin', { metodo: 'POST', corpo: {} });
  assert.equal(r.json.alertas[0].acao.aba, 'painel'); assert.equal(r.json.alertas[1].acao.aba, 'campanhas');
});

test('/api/ligacao e /api/preparo respondem para quem tem acesso', async () => {
  assert.equal((await pedir('/api/ligacao')).json.saudavel, true);
  const p = await pedir('/api/preparo');
  assert.equal(p.status, 200); assert.ok(Array.isArray(p.json.passos)); assert.equal(p.json.modo, 'demonstracao', 'sem chaves e com dados = demonstração');
});

test('/api/fechamento: mês inválido ou futuro = 400 com frase; mês certo traz texto e números; fonte de oficina fora vira frase', async () => {
  assert.equal((await pedir('/api/fechamento?mes=abc')).status, 400);
  const futuro = await pedir('/api/fechamento?mes=2999-01');
  assert.equal(futuro.status, 400); assert.match(futuro.json.erro, /mês que já começou/);
  const ok = await pedir('/api/fechamento?mes=2026-09');
  assert.equal(ok.status, 200); assert.match(ok.json.texto, /Fechamento de setembro de 2026/); assert.equal(ok.json.oficina, null);
  assert.match(ok.json.veredito, /Não consegui ler o Orçador e o Pátio/);
  assert.deepEqual(resumos.slice(-2).map(p => p.de).sort(), ['2026-08-01', '2026-09-01']);
});

test('POST /api/fechamento/enviar: sem número = 400; demonstração = 400; com número entra na fila com chave do mês e fica na auditoria', async () => {
  cfg = { whatsapp_destinos: [], margem_pct: 100 };
  const sem = await pedir('/api/fechamento/enviar', 'admin', { metodo: 'POST', corpo: { mes: '2026-09' } });
  assert.equal(sem.status, 400); assert.match(sem.json.erro, /cadastre ao menos um número/);
  cfg = { whatsapp_destinos: ['5512999999999'], margem_pct: 100 };
  const antes = Resultados.resumo;
  Resultados.resumo = async () => ({ demo: true, total: { gasto: 100, leads: 1 }, ciclo: { indisponivel: true } });
  const demo = await pedir('/api/fechamento/enviar', 'admin', { metodo: 'POST', corpo: { mes: '2026-09' } });
  assert.equal(demo.status, 400); assert.match(demo.json.erro, /demonstração/);
  assert.equal(enviados.length, 0);
  Resultados.resumo = antes;
  const ok = await pedir('/api/fechamento/enviar', 'admin', { metodo: 'POST', corpo: { mes: '2026-09' } });
  assert.equal(ok.status, 200); assert.equal(ok.json.ok, true);
  assert.equal(enviados.length, 1); assert.equal(enviados[0].o.chave, 'ads:fechamento:2026-09:2026-09-30'); assert.match(enviados[0].t, /Fechamento de setembro/);
  assert.ok(auditorias.some(a => a.acao === 'ads_fechamento_enviado' && a.o.detalhes.mes === '2026-09'));
  const mesRuim = await pedir('/api/fechamento/enviar', 'admin', { metodo: 'POST', corpo: { mes: '2999-01' } });
  assert.equal(mesRuim.status, 400);
});

test('/api/cron/fechamento: chave errada = 401; fora do dia 1 não envia e diz o motivo; relatório desligado respeita o opt-in', async () => {
  const errada = await fetch(base + '/api/cron/fechamento', { headers: { 'X-Cron-Chave': 'outra' } });
  assert.equal(errada.status, 401);
  cfg = { whatsapp_destinos: ['5512999999999'], relatorio_ativo: true, relatorio_hora: 0, margem_pct: 100 };
  enviados.length = 0;
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const r = await (await fetch(base + '/api/cron/fechamento', { headers: { 'X-Cron-Chave': 'chave-de-teste' } })).json();
  if (hoje.slice(8, 10) !== '01') { assert.equal(r.enviado, false); assert.match(r.motivo, /dia 1/); assert.equal(enviados.length, 0); }
  cfg = { whatsapp_destinos: ['5512999999999'], relatorio_ativo: false, relatorio_hora: 0, margem_pct: 100 };
  const desligado = await (await fetch(base + '/api/cron/fechamento?forcar=1', { headers: { 'X-Cron-Chave': 'chave-de-teste' } })).json();
  // a chave no endereço não vale mais (fica em log de acesso)
  assert.equal((await fetch(base + '/api/cron/fechamento?chave=chave-de-teste')).status, 401);
  assert.equal(desligado.enviado, false); assert.match(desligado.motivo, /desligado/);
  assert.equal(enviados.length, 0);
});

test('/api/fechamento.csv: arquivo do mês com cabeçalho, auditoria e 400 com frase para mês inválido', async () => {
  const r = await pedir('/api/fechamento.csv?mes=2026-09');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /fechamento-2026-09\.csv/);
  assert.match(r.texto, /Seção/); assert.match(r.texto, /Investido/);
  assert.ok(auditorias.some(a => a.acao === 'ads_exportou_csv' && a.o.detalhes.arquivo === 'fechamento'));
  const ruim = await pedir('/api/fechamento.csv?mes=2999-01');
  assert.equal(ruim.status, 400); assert.match(ruim.json.erro, /mês que já começou/);
  assert.equal((await pedir('/api/fechamento.csv?mes=2026-09', 'gestor_sem_ads')).status, 403);
});
