// R13C — valor do serviço fechado: UMA verdade no código (lib/valor-servico.cjs) e os três apps mostram o MESMO número
// com os mesmos dados: Casa (faturamento do mês, GET /api/central/faturamento), CRM (Painel / "faturou hoje", com o
// valor_servico que o servidor anota) e Tráfego (jornada, lista de contatos, ranking/CSV pela coorte e o ciclo).
// Sem rede: banco de mentira do Tráfego, relógio fixo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { criarFaturamento, trechosDoFaturamento, somarFaturamento } from '../casa-servidor.js';

const require = createRequire(import.meta.url);
const VS = require('../lib/valor-servico.cjs');
const { criarBanco } = require('../apps/trafego/tests/apoio/banco-falso.js');
const U = require('../apps/crm/public/crm-utils.js');
const R13 = require('../apps/crm/public/r13-resumo.js');
const R4 = require('../apps/crm/public/crm-r4.js');

const AGORA = Date.parse('2026-11-19T15:00:00-03:00');   // quinta-feira
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lead = (n, extra = {}) => ({
  id: id(n), cliente_id: null, responsavel_id: null, nome: `Cliente ${n}`, telefone: '12991230272', telefone_e164: '+5512991230272', origem: 'meta',
  status: 'concluido', valor_pago: null, valor_orcado: null, observacoes: null, servico: 'Revisão', carro_modelo: 'Onix', placa: 'ABC1D23',
  utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'Revisão', created_at: '2026-11-05T10:00:00-03:00',
  closed_at: '2026-11-18T16:00:00-03:00', updated_at: '2026-11-18T16:00:00-03:00', ultimo_contato_em: null, ...extra,
});

/* Cenário com as quatro fontes, um sem valor, uma cortesia, um fechado no mês passado e um em aberto */
function cenario() {
  const leads = [
    lead(1, { valor_pago: 700 }),                             // Pátio: OS entregue + orçamento aprovado 900 + extra 100 = 1000 (o lançado 700 perde)
    lead(2, { valor_pago: 300 }),                             // Agenda: concluído com 450 (o lançado 300 perde para a Agenda)
    lead(3, { valor_pago: 250 }),                             // lançado à mão: 250
    lead(4),                                                  // orçamento aprovado ligado só ao agendamento: 600
    lead(5),                                                  // fechou sem valor nenhum
    lead(6, { observacoes: 'Cortesia: sem cobrança' }),       // cortesia: não é "sem valor"
    lead(7, { valor_pago: 999, closed_at: '2026-10-30T10:00:00-03:00', updated_at: '2026-10-30T10:00:00-03:00', created_at: '2026-10-20T10:00:00-03:00' }), // mês passado
    lead(8, { status: 'agendado', closed_at: null }),          // em aberto: fora
  ];
  const tabelas = {
    leads,
    agendamentos: [
      { id: 'ag2', lead_id: id(2), data: '2026-11-18', hora: '08:00', inicio_em: null, status: 'concluido', valor: 450, created_at: '2026-11-06T10:00:00Z' },
      { id: 'ag4', lead_id: id(4), data: '2026-11-18', hora: '09:00', inicio_em: null, status: 'concluido', valor: null, created_at: '2026-11-06T10:00:00Z' },
    ],
    orc_orcamentos: [
      { id: 'o1', numero: 1, lead_id: id(1), agendamento_id: null, status: 'aprovado', total: 950, total_aprovado: 900, rascunho: false, created_at: '2026-11-06T10:00:00Z' },
      { id: 'o4', numero: 4, lead_id: null, agendamento_id: 'ag4', status: 'aprovado', total: 600, total_aprovado: null, rascunho: false, created_at: '2026-11-06T10:00:00Z' },
    ],
    patio_os: [{ id: 'os1', numero: 1, lead_id: id(1), orcamento_id: 'o1', agendamento_id: null, etapa: 'entregue', etapa_em: null, entregue_em: null, created_at: '2026-11-10T10:00:00Z', token_publico: null, orcamento_total: 950, orcamento_total_a_vista: null }],
    patio_extras: [{ os_id: 'os1', valor: 100, status: 'aprovado' }],
    clientes: [], perfis: [], conversas: [],
    whatsapp_mensagens: [{ id: 's1', direcao: 'saida', status: 'enviado', wamid: 'w1', created_at: '2026-11-19T12:00:00Z' }],
  };
  return { leads, sb: criarBanco(tabelas, { rpc: { trafego_primeiras_mensagens: () => [] } }) };
}
const ESPERADO = 1000 + 450 + 250 + 600;   // 2300
const anotar = (leads, v) => leads.map((l) => (v.has(l.id) ? { ...l, valor_servico: v.get(l.id).valor, valor_fonte: v.get(l.id).fonte } : { ...l }));

test('a regra: Pátio > orçamento aprovado > Agenda > lançado; sem nada = null (não é R$ 0)', async () => {
  const { leads, sb } = cenario();
  const v = await VS.valoresDosFechados(sb, leads);
  assert.deepEqual(v.get(id(1)), { valor: 1000, fonte: 'patio' });
  assert.deepEqual(v.get(id(2)), { valor: 450, fonte: 'agenda' });
  assert.deepEqual(v.get(id(3)), { valor: 250, fonte: 'manual' });
  assert.deepEqual(v.get(id(4)), { valor: 600, fonte: 'orcamento' });
  assert.deepEqual(v.get(id(5)), { valor: null, fonte: null });
  assert.equal(v.has(id(8)), false, 'em aberto não entra');
});

test('Casa: GET /api/central/faturamento soma o mês pela regra única (e só gestor)', async () => {
  const { sb } = cenario();
  const gestor = criarFaturamento({ quemE: async () => ({ usuario: { id: 'g', papel: 'gestor' } }), sb, VS, agora: () => AGORA });
  const r = await gestor.tratar({ method: 'GET', headers: {} });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.faturamento.mes, ESPERADO);
  assert.equal(r.corpo.faturamento.fechados_mes, 6);
  assert.equal(r.corpo.faturamento.sem_valor_semana, 1, 'só o 5 (a cortesia não conta)');
  assert.deepEqual(r.corpo.faturamento.por_fonte, { patio: 1000, agenda: 450, manual: 250, orcamento: 600 });
  const atendente = criarFaturamento({ quemE: async () => ({ usuario: { id: 'a', papel: 'atendente' } }), sb, VS, agora: () => AGORA });
  assert.equal((await atendente.tratar({ method: 'GET', headers: {} })).status, 403);
  const semLogin = criarFaturamento({ quemE: async () => ({ erro: 'sem_login' }), sb, VS, agora: () => AGORA });
  assert.equal((await semLogin.tratar({ method: 'GET', headers: {} })).status, 401);
  assert.equal((await gestor.tratar({ method: 'POST', headers: {} })).status, 405);
});

test('CRM: Painel (métricas do mês) e "faturou hoje" dão o mesmo número com o valor_servico anotado pelo servidor', async () => {
  const { leads, sb } = cenario();
  const anotados = anotar(leads, await VS.valoresDosFechados(sb, leads));
  const tr = trechosDoFaturamento(AGORA);
  assert.equal(U.metricas(anotados, new Date(tr.inicioMes), new Date(tr.fim)).faturamento, ESPERADO);
  const diaDosFechamentos = Date.parse('2026-11-18T18:00:00-03:00');
  assert.equal(R13.resumoHoje(anotados, diaDosFechamentos).faturouHoje, ESPERADO);
  assert.deepEqual(R4.semValorPago(anotados).map((l) => l.id), [id(5)], 'sem valor: só quem não tem valor em lugar nenhum (e não é cortesia)');
  // sem a anotação (app solto), cai no lançado: o número antigo, que não batia
  assert.equal(U.metricas(leads, new Date(tr.inicioMes), new Date(tr.fim)).faturamento, 700 + 300 + 250);
});

test('Tráfego: jornada, lista de contatos, coorte (ranking/CSV/relatório) e ciclo usam o mesmo valor', async () => {
  const J = require('../apps/trafego/jornada.js');
  const Leads = require('../apps/trafego/leads.js');
  const Ciclo = require('../apps/trafego/ciclo.js');
  const A = require('../apps/trafego/atribuicao.js');
  const { leads, sb } = cenario();
  J.esquecer();
  const itens = await J.listarBruto({ de: '2026-11-01', ate: '2026-11-19', sb, agora: AGORA });
  const fecharam = itens.filter((i) => i.desfecho.tipo === 'fechou');
  assert.equal(fecharam.reduce((s, i) => s + (i.desfecho.valor || 0), 0), ESPERADO, 'jornada (tela Hoje, campanhas)');
  const lista = await Leads.listar({ de: '2026-11-01', ate: '2026-11-19', sb, nomes: async () => new Map(), agora: AGORA });
  assert.equal(lista.resumo_periodo.receita, ESPERADO, 'lista de contatos / contatos de hoje');
  const coorte = await VS.comValorDoServico(sb, leads.filter((l) => l.created_at >= '2026-11-01'));
  const ranking = A.consolidar({ leads: coorte, metricas: [{ plataforma: 'meta', campanha_nome: 'Revisão', gasto: 500 }] });
  assert.equal(ranking.campanhas.find((c) => c.campanha === 'Revisão').receita, ESPERADO, 'ranking / CSV / relatório (coorte)');
  const lido = await Ciclo.ler(leads.map((l) => l.id), { sb });
  const cons = Ciclo.consolidarCiclo({ leads, porLead: lido.porLead, agora: AGORA });
  assert.equal(cons.campanhas.reduce((s, g) => s + g.receita_entregues, 0), 1000, 'carro entregue (o 1) com o valor do Pátio');
});

test('os três, lado a lado: o mesmo número', async () => {
  const { leads, sb } = cenario();
  const casa = (await criarFaturamento({ quemE: async () => ({ usuario: { id: 'g', papel: 'admin' } }), sb, VS, agora: () => AGORA }).tratar({ method: 'GET', headers: {} })).corpo.faturamento.mes;
  const tr = trechosDoFaturamento(AGORA);
  const crm = U.metricas(anotar(leads, await VS.valoresDosFechados(sb, leads)), new Date(tr.inicioMes), new Date(tr.fim)).faturamento;
  const J = require('../apps/trafego/jornada.js');
  J.esquecer();
  const trafego = (await J.listarBruto({ de: '2026-11-01', ate: '2026-11-19', sb, agora: AGORA })).filter((i) => i.desfecho.tipo === 'fechou').reduce((s, i) => s + (i.desfecho.valor || 0), 0);
  assert.deepEqual({ casa, crm, trafego }, { casa: ESPERADO, crm: ESPERADO, trafego: ESPERADO });
});

test('trechos: mês e semana (segunda) no fuso da oficina', () => {
  const t = trechosDoFaturamento(AGORA);
  assert.equal(t.hoje, '2026-11-19');
  assert.equal(new Date(t.inicioMes).toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(new Date(t.inicioSemana).toISOString(), '2026-11-16T03:00:00.000Z');
  assert.equal(somarFaturamento(VS, [], new Map(), AGORA).mes, 0);
});
