/* ============================================================
   Adaptador do motor (rodada 8, frente T2a).

   O núcleo (motor/nucleo.mjs) é a cópia fiel do motor de relatórios do
   Nexus Ads. Ele não conhece a IndyCar: recebe linhas de métrica e fichas
   de contato num formato próprio e devolve as contas e os textos.
   Este arquivo é a única ponte:

     ads_metricas_dia  ->  metricasParaNucleo()  ->  { n, d, p, c, cn, a, an, g, imp, alc, cli, conv, freq, st, obj }
     jornada (contato) ->  contatoParaNucleo()   ->  { id, data_conversa, plataforma, origem, etapa, ... }
     ads_config        ->  clienteDaCasa()       ->  vertical "oficina", assinatura "IndyCar Tráfego"

   Decisões que valem para o app inteiro:
   - o radar de alertas é o radar.js (regras em ads_regras): TODAS as regras do núcleo ficam desligadas aqui;
   - receita só com valor lançado: nada de ticket médio virando faturamento estimado;
   - nome e telefone do contato não entram no motor (ele não precisa deles);
   - linha de demonstração (fonte = 'demo') nunca se mistura com dado real: separarDemo().
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');
const enderecos = require('../enderecos');

/** Todas as regras de alerta do núcleo, desligadas (o radar da casa é o radar.js). */
const REGRAS_DO_NUCLEO = Object.freeze(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'ritmo']);
/** A oficina não abre aos domingos (0 = domingo): o núcleo não trata o domingo parado como queda. */
const DIAS_FECHADOS = Object.freeze([0]);
const NIVEIS = new Set(['campanha', 'anuncio']);
const PLATAFORMAS = new Set(['meta', 'google']);

let _nucleo = null;
/**
 * O núcleo é módulo ES; o app é CommonJS. Carrega uma vez só, por import() (funciona em qualquer Node da casa).
 * Devolve o módulo inteiro (datasetDeLinhas, montar e as funções de formato).
 */
function carregarNucleo() {
  if (!_nucleo) _nucleo = import('./nucleo.mjs').catch(e => { _nucleo = null; throw e; });
  return _nucleo;
}

/* ---------- demonstração ---------- */

/**
 * Separa demonstração de dado real.
 *   havendo linha real na lista           -> { tipo: 'real', linhas: só as reais }
 *   só demonstração e nada real na tabela -> { tipo: 'demo', linhas: as de demonstração }
 *   só demonstração, mas existe dado real em outro período (haRealNaTabela) -> { tipo: 'vazio' }
 *   nada                                  -> { tipo: 'vazio' }
 * `descartadas` conta as linhas de demonstração deixadas de fora.
 */
function separarDemo(linhas, { haRealNaTabela = false } = {}) {
  const todas = (Array.isArray(linhas) ? linhas : []).filter(Boolean);
  if (!todas.length) return { tipo: 'vazio', linhas: [], descartadas: 0 };
  const reais = todas.filter(l => l.fonte !== 'demo');
  if (reais.length) return { tipo: 'real', linhas: reais, descartadas: todas.length - reais.length };
  if (haRealNaTabela) return { tipo: 'vazio', linhas: [], descartadas: todas.length };
  return { tipo: 'demo', linhas: todas, descartadas: 0 };
}

/* ---------- métricas ---------- */

const zero = v => T.numOuNulo(v) || 0;
const textoOuNulo = v => (v == null || String(v).trim() === '' ? null : String(v));

/**
 * Contatos que a plataforma contou numa linha: na Meta, as conversas iniciadas (coluna `conversas`, quando existe);
 * no Google, as conversões registradas.
 */
function contatosDaPlataforma(l) {
  const conversas = T.numOuNulo(l.conversas);
  return l.plataforma === 'meta' && conversas != null ? conversas : zero(l.conversoes);
}

/** Linhas de ads_metricas_dia -> linhas do núcleo. Só os níveis que o núcleo usa (campanha e anúncio). */
function metricasParaNucleo(linhas) {
  const saida = [];
  for (const l of linhas || []) {
    if (!l || !NIVEIS.has(l.nivel)) continue;
    const anuncio = l.nivel === 'anuncio';
    saida.push({
      n: l.nivel, d: String(l.data ?? '').slice(0, 10), p: l.plataforma,
      c: textoOuNulo(l.campanha_ext), cn: textoOuNulo(l.campanha_nome),
      a: anuncio ? textoOuNulo(l.anuncio_ext) : null, an: anuncio ? textoOuNulo(l.anuncio_nome) : null,
      g: zero(l.gasto), imp: zero(l.impressoes), alc: zero(l.alcance), cli: zero(l.cliques),
      conv: contatosDaPlataforma(l), freq: T.numOuNulo(l.frequencia),
      st: textoOuNulo(l.status), obj: textoOuNulo(l.objetivo),
    });
  }
  return saida;
}

/* ---------- contatos ---------- */

/* Canal do contrato -> origem do núcleo, para quem NÃO veio de anúncio (fica fora do funil dos anúncios). */
const ORIGEM_DO_CANAL = Object.freeze({
  site: 'site', indicacao: 'indicacao', instagram: 'organico', whatsapp: 'whatsapp',
  passagem: 'manual', telefone: 'manual', desconhecida: 'whatsapp', meta: 'organico', google: 'organico',
});

const etapaDe = (item, id) => (Array.isArray(item.etapas) ? item.etapas.find(e => e && e.id === id) : null) || null;

/**
 * Etapa do núcleo a partir da jornada:
 *   fechou -> 'fechou' · não fechou -> 'nao_fechou' (o carro veio) ou 'perdida' (nem veio)
 *   em aberto -> 'orcamento' (o carro veio), 'faltou' (tinha horário, o dia passou e não veio; só com `hoje`),
 *                'agendada' (tem horário) ou 'nova'.
 */
function etapaDoNucleo(item, { hoje = null } = {}) {
  const tipo = item.desfecho && item.desfecho.tipo;
  const veio = !!(etapaDe(item, 'veio') || etapaDe(item, 'oficina'));
  if (tipo === 'fechou') return 'fechou';
  if (tipo === 'nao_fechou') return veio ? 'nao_fechou' : 'perdida';
  if (veio) return 'orcamento';
  const agendou = etapaDe(item, 'agendou');
  if (agendou) {
    const para = P.diaBR(agendou.para);
    return hoje && para && para < hoje ? 'faltou' : 'agendada';
  }
  return 'nova';
}

/**
 * Um contato da jornada (contrato da API, §5.3) -> a ficha que o núcleo entende.
 * Contato sem data de chegada devolve null. Nome e telefone ficam de fora de propósito.
 */
function contatoParaNucleo(item, { hoje = null } = {}) {
  if (!item) return null;
  const chegou = P.diaBR(item.chegou_em);
  if (!chegou) return null;
  const o = item.origem || {};
  const deAnuncio = o.paga === true;
  const plataforma = deAnuncio && PLATAFORMAS.has(o.canal) ? o.canal : null;
  const agendou = etapaDe(item, 'agendou');
  const veio = etapaDe(item, 'veio') || etapaDe(item, 'oficina');
  const d = item.desfecho || {};
  const etapa = etapaDoNucleo(item, { hoje });
  return {
    id: item.lead_id,
    data_conversa: chegou,
    plataforma,
    origem: deAnuncio ? 'anuncio' : (ORIGEM_DO_CANAL[o.canal] || 'whatsapp'),
    campanha_ext: plataforma && o.campanha ? textoOuNulo(o.campanha.ext) : null,
    anuncio_ext: plataforma && o.anuncio ? textoOuNulo(o.anuncio.ext) : null,
    etapa,
    data_agenda: agendou ? (P.diaBR(agendou.para) || P.diaBR(agendou.em)) : null,
    data_consulta: veio ? P.diaBR(veio.em) : (etapa === 'fechou' ? P.diaBR(d.em) : null),
    atualizado_em: P.diaBR(d.em),
    valor: etapa === 'fechou' ? T.numOuNulo(d.valor) : null,
    servico: textoOuNulo(item.servico),
    nome: '',
    telefone: '',
    obs: '',
  };
}

/* ---------- o cliente (a casa) ---------- */

const positivo = v => { const n = T.numOuNulo(v); return n != null && n > 0 ? n : null; };

/** O "cliente" que o núcleo espera, com as metas do ads_config. Sem meta ou orçamento configurado, fica null (não inventa). */
function clienteDaCasa(config = {}) {
  const cfg = config || {};
  return {
    nome: 'IndyCar',
    vertical: 'oficina',
    cfg: {
      nomeCurto: 'IndyCar',
      assinatura: 'IndyCar Tráfego',
      cpaAlvo: positivo(cfg.cpa_alvo),
      cpaAlvoGoogle: positivo(cfg.cpa_alvo_google),
      orcamento: positivo(cfg.orcamento_mensal),
      fee: 0,
      ticket: {},
      regrasOff: REGRAS_DO_NUCLEO.slice(),
      diasFechados: DIAS_FECHADOS.slice(),
      painelUrl: enderecos.urlDoTrafego(),
    },
  };
}

/**
 * Monta o motor: { M, ds, N }.
 *   M  = o motor do núcleo (relDiario, relSemanal, relMensal, ritmoMes, funilCampanha, ...)
 *   ds = o conjunto de dados (LINHAS, LEADS, CAMP, CRI, AVISOS)
 *   N  = o módulo do núcleo (formatos e constantes)
 * `metricas` são linhas de ads_metricas_dia JÁ separadas da demonstração; `contatos` são itens da jornada.
 * `hoje` é o dia de Brasília (AAAA-MM-DD): o núcleo trabalha com dias fechados, até ontem.
 */
async function montarMotor({ metricas = [], contatos = [], config = {}, hoje = P.hojeBR(), dias = 130 } = {}) {
  const N = await carregarNucleo();
  const leads = [];
  for (const c of contatos || []) {
    const ficha = contatoParaNucleo(c, { hoje });
    if (ficha) leads.push(ficha);
  }
  const ds = N.datasetDeLinhas({ metricas: metricasParaNucleo(metricas), leads, cliente: clienteDaCasa(config), hoje, dias });
  return { M: N.montar(ds), ds, N };
}

/** Índice do núcleo (0 … R, R = ontem) de um dia AAAA-MM-DD; pode sair fora da janela (negativo ou maior que R). */
function indiceDoDia(M, iso) {
  const r = M.REF, dois = n => String(n).padStart(2, '0');
  // REF é o meio-dia de ontem no relógio do servidor (é assim que o núcleo guarda): lê pelas partes locais, não pelo fuso
  const ontem = `${r.getFullYear()}-${dois(r.getMonth() + 1)}-${dois(r.getDate())}`;
  return M.R - (P.contarDias(iso, ontem) - 1);
}

/** Identificador da campanha dentro do núcleo. */
const idDaCampanha = (plataforma, ext) => `${plataforma}:${ext}`;

module.exports = {
  REGRAS_DO_NUCLEO, DIAS_FECHADOS,
  carregarNucleo, separarDemo, metricasParaNucleo, contatosDaPlataforma, contatoParaNucleo, etapaDoNucleo,
  clienteDaCasa, montarMotor, indiceDoDia, idDaCampanha,
};
