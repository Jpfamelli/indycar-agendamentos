/* ============================================================
   Dados de mentira das rotas da frente T2a (rodada 8): /api/hoje, /api/campanhas, /api/relatorios e /api/conexoes.
   Itens da jornada no formato do contrato (§5.3), linhas de ads_metricas_dia, o banco da situação de hoje
   (sem conta de anúncio, WhatsApp parado desde 30/09) e uma jornada dublê com a assinatura de listarBruto.
   Não é arquivo de teste (o nome não termina em .test.js).
   ============================================================ */
'use strict';

const { criarBanco } = require('./banco-falso');
const F = require('../../motor/fonte');

/** Quinta-feira 19/11/2026, 10h em Brasília (oficina aberta). */
const AGORA = Date.parse('2026-11-19T13:00:00Z');
const dois = n => String(n).padStart(2, '0');
const isoBR = (dia, hora = '10:00') => `${dia}T${hora}:00-03:00`;

function relogio(inicio = AGORA) { let t = inicio; const f = () => t; f.andar = ms => { t += ms; }; return f; }

const ROTULO = { meta: 'Anúncio da Meta', google: 'Anúncio do Google', site: 'Site', indicacao: 'Indicação', passagem: 'Passou na porta', whatsapp: 'WhatsApp direto', desconhecida: 'Ainda não sabemos' };

/**
 * Um item da jornada. Opções: dia, hora, canal, paga, campanha ({ ext, nome }), etapas (ids), desfecho, valor, motivo,
 * minutos (tempo da primeira resposta), espera_min, respostaDesconhecida.
 */
function item(n, o = {}) {
  const dia = o.dia || '2026-11-10', hora = o.hora || '10:00';
  const canal = o.canal || 'whatsapp';
  const paga = o.paga != null ? o.paga : (canal === 'meta' || canal === 'google' ? true : canal === 'desconhecida' ? null : false);
  const ids = o.etapas || ['contato'];
  const etapas = ids.map(id => (id === 'respondido'
    ? { id, em: o.minutos != null ? isoBR(dia, hora) : null, minutos: o.minutos != null ? o.minutos : null }
    : { id, em: isoBR(dia, hora) }));
  if (o.respostaDesconhecida) etapas.splice(1, 0, { id: 'respondido', em: null, minutos: null, desconhecido: true });
  if (o.agendadoPara) { const e = etapas.find(x => x.id === 'agendou'); if (e) e.para = o.agendadoPara; }
  const tipo = o.desfecho || 'aberto';
  const pendencias = [];
  if (canal === 'desconhecida') pendencias.push('sem_origem');
  if (tipo === 'fechou' && o.valor == null) pendencias.push('sem_valor');
  if (tipo === 'nao_fechou' && !o.motivo) pendencias.push('sem_motivo');
  if (o.espera_min != null && o.espera_min > 30) pendencias.push('sem_resposta');
  return {
    lead_id: `lead-${dois(n)}`, nome: `Cliente ${n}`, telefone_final: '7766', chegou_em: isoBR(dia, hora),
    origem: { canal, paga, rotulo: ROTULO[canal] || canal, detalhe: o.campanha ? o.campanha.nome : null, campanha: o.campanha || null,
      conjunto: o.conjunto || null, anuncio: o.anuncio || null, palavra_chave: o.palavra || null,
      como: canal === 'desconhecida' ? null : 'ref', como_rotulo: canal === 'desconhecida' ? null : 'pelo código do site',
      certeza: canal === 'desconhecida' ? 'nenhuma' : 'certa' },
    etapas, etapa_atual: ids[ids.length - 1],
    desfecho: { tipo, valor: tipo === 'fechou' ? (o.valor ?? null) : null, valor_fonte: o.valor != null ? 'manual' : null,
      motivo: o.motivo || null, motivo_rotulo: null, obs: null, em: tipo === 'aberto' ? null : isoBR(dia, '17:00'), parado_dias: null },
    pendencias, espera_min: o.espera_min ?? null,
  };
}

/** Uma linha de ads_metricas_dia (nível campanha). */
const metrica = (id, o = {}) => ({ id, plataforma: 'meta', data: '2026-11-10', nivel: 'campanha', campanha_ext: 'c1', campanha_nome: 'Troca de óleo R$ 169',
  conjunto_ext: null, conjunto_nome: null, anuncio_ext: null, anuncio_nome: null,
  gasto: 50, impressoes: 2000, alcance: 1500, cliques: 40, conversoes: 3, valor_conversao: 0, frequencia: 1.3, status: 'ACTIVE', objetivo: 'OUTCOME_ENGAGEMENT', fonte: 'api', ...o });

/** Jornada dublê: devolve os itens que chegaram no período, com o estado em `itens.estado` (como a de verdade). */
function jornadaDuble(itens, { estado = { respostas: 'ok', respostas_texto: null }, chamadas = [] } = {}) {
  return {
    async listarBruto({ de, ate }) {
      chamadas.push({ de, ate });
      const lista = structuredClone(itens.filter(i => { const d = i.chegou_em.slice(0, 10); return d >= de && d <= ate; }));
      Object.defineProperty(lista, 'estado', { value: { ...estado }, enumerable: false });
      return lista;
    },
    chamadas,
  };
}

/** As tabelas da situação de hoje: só demonstração de agosto, nenhuma conta ligada, WhatsApp com a chave recusada. */
function tabelasDeHoje(extra = {}) {
  return {
    ads_metricas_dia: [metrica('d1', { data: '2026-08-10', fonte: 'demo', gasto: 80 }), metrica('d2', { data: '2026-08-11', fonte: 'demo', gasto: 90 })],
    ads_config: [{ id: true, cpa_alvo: null, orcamento_mensal: null, ticket_medio: null, extras: {} }],
    ads_alertas: [1, 2, 3, 4, 5].map(n => ({ id: `al${n}`, regra_nome: 'Custo por contato alto', plataforma: 'meta', nivel: 'campanha', severidade: 'alerta',
      mensagem: 'Demonstração', chave: `x|${n}`, metrica: 'cpa', lido_em: null, criado_em: '2026-08-13T12:00:00Z' })),
    integracoes_ads: [],
    codewords_config: [{ id: true, ativo: true, device_id: 'aparelho-1', ultimo_evento_em: '2026-09-30T20:00:00Z',
      sincronia_erro: 'HTTP 401 Unauthorized', sincronia_erro_em: '2026-11-19T12:55:00Z', sincronia_falhas: 900 }],
    whatsapp_mensagens: [
      { id: 'w1', direcao: 'saida', status: 'enviado', gerada_por_ia: false, created_at: '2026-09-30T19:00:00Z' },
      { id: 'w2', direcao: 'saida', status: 'enviado', gerada_por_ia: true, created_at: '2026-10-02T19:00:00Z' },
    ],
    agendamentos: [
      { data: '2026-11-20', hora: '08:00', servico: 'Revisão', status: 'confirmado' },
      { data: '2026-11-20', hora: '10:00', servico: 'Troca de óleo', status: 'aguardando' },
      { data: '2026-11-23', hora: '09:00', servico: 'Freios', status: 'cancelado' },
    ],
    consultores: [{ id: 'k1', ativo: true }, { id: 'k2', ativo: true }],
    servicos: [{ nome: 'Revisão', duracao_min: 120 }, { nome: 'Troca de óleo', duracao_min: 60 }],
    ...extra,
  };
}

/** Os contatos de novembro da situação de hoje: nenhum gasto ligado, mas há contato de anúncio (pelo código do site). */
function contatosDeHoje() {
  return [
    item(1, { dia: '2026-11-03', canal: 'meta', campanha: { ext: '1202', nome: 'Troca de óleo R$ 169' }, etapas: ['contato', 'respondido', 'agendou', 'veio', 'fechou'], desfecho: 'fechou', valor: 420 }),
    item(2, { dia: '2026-11-04', canal: 'meta', campanha: { ext: '1202', nome: 'Troca de óleo R$ 169' }, etapas: ['contato', 'respondido', 'fechou'], desfecho: 'fechou' }),
    item(3, { dia: '2026-11-05', canal: 'google', campanha: { ext: null, nome: 'Freios Taubaté' }, etapas: ['contato', 'respondido'], desfecho: 'nao_fechou', motivo: 'caro' }),
    item(4, { dia: '2026-11-06', canal: 'indicacao', etapas: ['contato', 'respondido', 'orcamento'], desfecho: 'nao_fechou' }),
    item(5, { dia: '2026-11-10', canal: 'desconhecida', respostaDesconhecida: true }),
    item(6, { dia: '2026-11-19', hora: '08:20', canal: 'meta', campanha: { ext: '1202', nome: 'Troca de óleo R$ 169' }, espera_min: 100 }),
    item(7, { dia: '2026-10-15', canal: 'whatsapp', etapas: ['contato', 'respondido', 'fechou'], desfecho: 'fechou', valor: 300 }),
  ];
}

/** Uma fonte de teste: banco de mentira + jornada dublê + relógio parado. */
function fonteDeTeste({ tabelas = tabelasDeHoje(), itens = contatosDeHoje(), estado, opcoesBanco = {}, agora = relogio(), jornada } = {}) {
  const sb = criarBanco(tabelas, opcoesBanco);
  const j = jornada !== undefined ? jornada : jornadaDuble(itens, { estado });
  const fonte = F.criarFonte({ sb, agora, jornada: j });
  return { sb, fonte, jornada: j, agora };
}

/** console.warn calado (as leituras tolerantes escrevem aviso no log). */
const calado = async fn => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

module.exports = { AGORA, relogio, isoBR, item, metrica, jornadaDuble, tabelasDeHoje, contatosDeHoje, fonteDeTeste, calado };
