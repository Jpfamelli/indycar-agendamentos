/* ============================================================
   Somas das rotas novas (rodada 8, frente T2a): /api/hoje, /api/campanhas e os relatórios
   usam as MESMAS contas, feitas aqui, em cima de duas coisas:

     itens da jornada (contrato da API §5.3)   ->  o lado da oficina: contatos, etapas, serviços fechados, valor
     linhas de ads_metricas_dia (nível campanha) ->  o lado da plataforma: gasto, exibições, cliques

   Regras que valem para todas:
   - a conta é por dia de CHEGADA do contato (a mesma da tela Jornada: quem chegou no período e o que aconteceu com ele);
   - "contato de anúncio" é origem.paga === true;
   - valor conhecido é desfecho.valor maior que zero; serviço fechado sem valor não vira zero: fica de fora da soma
     e, se nenhum tem valor, o faturado é null (não se sabe);
   - divisão por zero ou por número desconhecido é null, nunca 0, NaN ou Infinity;
   - etapa marcada como desconhecida (resposta da oficina nos trechos sem registro) não conta como acontecida.

   O funil é o mesmo da jornada (jornada.funil): tests/r8-soma.test.js compara os dois.
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');
const Ad = require('./adaptador');

const ETAPAS = Object.freeze(['contato', 'respondido', 'orcamento', 'agendou', 'veio', 'oficina', 'fechou']);
const ROTULO_ETAPA = Object.freeze({ contato: 'Contatos', respondido: 'Respondidos', orcamento: 'Com orçamento', agendou: 'Agendaram', veio: 'Vieram', oficina: 'Carro na oficina', fechou: 'Fecharam' });
const MOTIVOS = Object.freeze(['caro', 'concorrente', 'sem_retorno', 'desistiu', 'nao_fazemos', 'prazo', 'sem_urgencia', 'sem_vaga', 'outro']);
const ROTULO_MOTIVO = Object.freeze({ caro: 'Achou caro', concorrente: 'Foi em outra oficina', sem_retorno: 'Parou de responder', desistiu: 'Desistiu do serviço',
  nao_fazemos: 'Não fazemos o serviço', prazo: 'Prazo não atendeu', sem_urgencia: 'Não era urgente', sem_vaga: 'Não tinha vaga', outro: 'Outro' });
const PLATAFORMAS = Object.freeze(['meta', 'google']);
/** Contato de anúncio de que não se sabe a plataforma (origem.paga verdadeiro e canal que não é meta nem google). */
const ANUNCIO = 'anuncio';

/* ---------- um contato ---------- */

const etapasDe = item => (item && Array.isArray(item.etapas) ? item.etapas : []);
/** A etapa `id` do contato, só quando aconteceu de verdade (desconhecida não conta). */
const etapaDe = (item, id) => etapasDe(item).find(e => e && e.id === id && !e.desconhecido) || null;
const tem = (item, id) => !!etapaDe(item, id);
const respostaDesconhecida = item => etapasDe(item).some(e => e && e.id === 'respondido' && e.desconhecido);
const deAnuncio = item => !!(item && item.origem && item.origem.paga === true);
const diaDe = item => P.diaBR(item && item.chegou_em);
const fechou = item => !!(item && item.desfecho && item.desfecho.tipo === 'fechou');
const naoFechou = item => !!(item && item.desfecho && item.desfecho.tipo === 'nao_fechou');
/** Valor do serviço fechado quando é conhecido (maior que zero); senão null. */
function valorDe(item) {
  if (!fechou(item)) return null;
  const v = T.numOuNulo(item.desfecho.valor);
  return v != null && v > 0 ? v : null;
}
/** 'meta' | 'google' | 'anuncio' (pago, plataforma desconhecida) | null (não veio de anúncio). */
function plataformaDe(item) {
  if (!deAnuncio(item)) return null;
  return PLATAFORMAS.includes(item.origem.canal) ? item.origem.canal : ANUNCIO;
}
const temPendencia = (item, id) => Array.isArray(item && item.pendencias) && item.pendencias.includes(id);

/** Chave da campanha de um contato: o identificador da plataforma; sem ele, o nome (a mesma regra do filtro da Jornada). */
function campanhaDe(item) {
  const c = item && item.origem && item.origem.campanha;
  if (!c) return null;
  const chave = (c.ext != null && String(c.ext).trim()) || (c.nome != null && String(c.nome).trim()) || null;
  return chave ? { chave: String(chave), ext: c.ext != null && String(c.ext).trim() ? String(c.ext) : null, nome: c.nome != null && String(c.nome).trim() ? String(c.nome) : null } : null;
}

/* ---------- conjuntos de contatos ---------- */

/** Contatos que chegaram entre `de` e `ate` (dias de Brasília, contando os dois). */
const noPeriodo = (itens, de, ate) => (itens || []).filter(i => { const d = diaDe(i); return d != null && d >= de && d <= ate; });

/** Com ?plataforma=meta|google ficam só os contatos de anúncio daquela plataforma. */
const daPlataforma = (itens, plataforma) => (plataforma ? (itens || []).filter(i => plataformaDe(i) === plataforma) : (itens || []));

/**
 * O resumo de um conjunto de contatos:
 * { contatos, respondidos, resposta_desconhecida, com_orcamento, agendaram, vieram, oficina, fecharam, com_valor, sem_valor,
 *   faturado, nao_fecharam, abertos }.
 * `faturado` é null quando há serviço fechado e nenhum tem valor; 0 quando ninguém fechou.
 */
function resumo(itens) {
  const r = { contatos: 0, respondidos: 0, resposta_desconhecida: 0, com_orcamento: 0, agendaram: 0, vieram: 0, oficina: 0,
    fecharam: 0, com_valor: 0, sem_valor: 0, faturado: 0, nao_fecharam: 0, abertos: 0 };
  let soma = 0;
  for (const i of itens || []) {
    if (!i) continue;
    r.contatos++;
    if (tem(i, 'respondido')) r.respondidos++;
    if (respostaDesconhecida(i)) r.resposta_desconhecida++;
    if (tem(i, 'orcamento')) r.com_orcamento++;
    if (tem(i, 'agendou')) r.agendaram++;
    if (tem(i, 'veio')) r.vieram++;
    if (tem(i, 'oficina')) r.oficina++;
    if (fechou(i)) {
      r.fecharam++;
      const v = valorDe(i);
      if (v != null) { r.com_valor++; soma += v; }
    } else if (naoFechou(i)) r.nao_fecharam++;
    else r.abertos++;
  }
  r.sem_valor = r.fecharam - r.com_valor;
  r.faturado = r.fecharam > 0 && r.com_valor === 0 ? null : T.arredondar(soma);
  return r;
}

/** Separa os contatos por uma chave: Map(chave -> contatos). Chave null fica de fora. */
function agrupar(itens, chaveDe) {
  const grupos = new Map();
  for (const i of itens || []) {
    const k = chaveDe(i);
    if (k == null) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(i);
  }
  return grupos;
}

/** Contatos por dia de chegada: Map(dia -> { total, anuncio, fecharam, faturado }). */
function porDia(itens) {
  const dias = new Map();
  for (const i of itens || []) {
    const d = diaDe(i);
    if (!d) continue;
    if (!dias.has(d)) dias.set(d, { total: 0, anuncio: 0, fecharam: 0, faturado: 0 });
    const x = dias.get(d);
    x.total++;
    if (deAnuncio(i)) x.anuncio++;
    if (fechou(i)) { x.fecharam++; x.faturado += valorDe(i) || 0; }
  }
  return dias;
}

/* ---------- funil (o mesmo da Jornada) ---------- */

const fracao = (a, b) => Math.round((a / b) * 10000) / 10000;

/**
 * Funil do contrato (§5.2): as sete etapas com total, só de anúncio e a passagem da etapa anterior.
 * "Respondidos" fica com total null enquanto houver contato com resposta desconhecida (não há taxa honesta);
 * os campos a mais `confirmados` e `desconhecidos` dizem o que se sabe.
 */
function funil(itens) {
  const todos = (itens || []).filter(Boolean), pagos = todos.filter(deAnuncio);
  const etapas = [];
  for (const id of ETAPAS) {
    const total = todos.filter(i => tem(i, id)).length, anuncio = pagos.filter(i => tem(i, id)).length;
    const linha = { id, rotulo: ROTULO_ETAPA[id], total, anuncio, passagem: null };
    if (id === 'respondido') {
      const desconhecidos = todos.filter(respostaDesconhecida).length;
      linha.confirmados = total; linha.desconhecidos = desconhecidos;
      if (desconhecidos) { linha.total = null; linha.anuncio = pagos.some(respostaDesconhecida) ? null : anuncio; }
    }
    const anterior = etapas[etapas.length - 1];
    if (anterior && linha.total != null && anterior.total != null && anterior.total > 0 && linha.total <= anterior.total) linha.passagem = fracao(linha.total, anterior.total);
    etapas.push(linha);
  }
  const perdidos = todos.filter(naoFechou);
  const n = new Map();
  for (const i of perdidos) { const m = i.desfecho.motivo; if (m && MOTIVOS.includes(m)) n.set(m, (n.get(m) || 0) + 1); }
  const motivos = MOTIVOS.filter(m => n.has(m)).map(m => ({ id: m, rotulo: ROTULO_MOTIVO[m], n: n.get(m) })).sort((a, b) => b.n - a.n);
  return { etapas, nao_fecharam: { total: perdidos.length, motivos, sem_motivo: perdidos.filter(i => !(i.desfecho.motivo && MOTIVOS.includes(i.desfecho.motivo))).length } };
}

/* ---------- contas derivadas do lado da oficina ---------- */

/** Mediana dos minutos até a primeira resposta, só de quem tem a resposta registrada; null sem nenhuma. */
function tempoDeResposta(itens) {
  const minutos = [];
  for (const i of itens || []) {
    const e = etapaDe(i, 'respondido');
    const m = e ? T.numOuNulo(e.minutos) : null;
    if (m != null && m >= 0) minutos.push(m);
  }
  if (!minutos.length) return null;
  minutos.sort((a, b) => a - b);
  const meio = Math.floor(minutos.length / 2);
  return Math.round(minutos.length % 2 ? minutos[meio] : (minutos[meio - 1] + minutos[meio]) / 2);
}

/**
 * Taxa de falta: de quem tinha horário marcado para um momento que já passou, quantos não vieram.
 * null quando ninguém tinha horário passado.
 */
function taxaDeFalta(itens, agora = Date.now()) {
  let comHorario = 0, faltaram = 0;
  for (const i of itens || []) {
    const e = etapaDe(i, 'agendou');
    const para = e ? Date.parse(String(e.para ?? '')) : NaN;
    if (!Number.isFinite(para) || para >= agora) continue;
    comHorario++;
    if (!tem(i, 'veio') && !tem(i, 'oficina') && !fechou(i)) faltaram++;
  }
  return comHorario ? fracao(faltaram, comHorario) : null;
}

/* ---------- métricas (linhas de nível campanha) ---------- */

/** Soma de um conjunto de linhas: { gasto, impressoes, cliques, contatos_plataforma }. */
function somaDasLinhas(linhas) {
  let gasto = 0, impressoes = 0, cliques = 0, contatos = 0;
  for (const l of linhas || []) {
    gasto += T.numOuNulo(l.gasto) || 0;
    impressoes += T.numOuNulo(l.impressoes) || 0;
    cliques += T.numOuNulo(l.cliques) || 0;
    contatos += Ad.contatosDaPlataforma(l);
  }
  return { gasto: T.arredondar(gasto), impressoes: Math.round(impressoes), cliques: Math.round(cliques), contatos_plataforma: T.arredondar(contatos, 1) };
}

/** Gasto por dia: Map(dia -> reais). */
function gastoPorDia(linhas) {
  const dias = new Map();
  for (const l of linhas || []) dias.set(l.data, (dias.get(l.data) || 0) + (T.numOuNulo(l.gasto) || 0));
  return dias;
}

const linhasEntre = (linhas, de, ate) => (linhas || []).filter(l => l.data >= de && l.data <= ate);
const linhasDaPlataforma = (linhas, plataforma) => (plataforma ? (linhas || []).filter(l => l.plataforma === plataforma) : (linhas || []));
const ultimoDia = linhas => (linhas || []).reduce((m, l) => (m == null || l.data > m ? l.data : m), null);

/**
 * O gasto de um trecho, já separado da demonstração:
 *   { tipo: 'real' | 'demo' | 'vazio', linhas, conhecido }
 * `haReal` diz se existe linha real em QUALQUER lugar da tabela: havendo, demonstração não entra em soma nenhuma.
 */
function gastoDoTrecho(linhas, { haReal = false } = {}) {
  const s = Ad.separarDemo(linhas, { haRealNaTabela: haReal });
  return { tipo: s.tipo, linhas: s.linhas, conhecido: s.tipo !== 'vazio' };
}

/** estado.gasto do contrato: 'real' | 'demo' | 'sem_dados' (há conta ou já houve número, mas não neste período) | 'sem_conta'. */
function estadoDoGasto(tipo, { haReal = false, conexoes = null } = {}) {
  if (tipo === 'real' || tipo === 'demo') return tipo;
  const ligada = !!(conexoes && ((conexoes.meta && conexoes.meta.ligado) || (conexoes.google && conexoes.google.ligado)));
  return ligada || haReal ? 'sem_dados' : 'sem_conta';
}

/** estado.valores e estado.origem do contrato, a partir dos contatos do período. */
function estadoDosContatos(itens) {
  const lista = (itens || []).filter(Boolean);
  const fechados = lista.filter(fechou), semValor = fechados.filter(i => valorDe(i) == null).length;
  const semOrigem = lista.filter(i => !i.origem || i.origem.certeza === 'nenhuma' || (i.origem.certeza == null && i.origem.canal === 'desconhecida' && i.origem.paga !== true)).length;
  return {
    valores: !semValor ? 'ok' : (semValor === fechados.length ? 'nenhum' : 'faltam'),
    origem: !semOrigem ? 'ok' : (semOrigem === lista.length ? 'nenhuma' : 'parcial'),
  };
}

/** Variação em fração (0,114 = +11,4%); null quando falta um dos lados ou a base é zero. */
function variar(agora, antes) {
  if (agora == null || antes == null || !T.finito(agora) || !T.finito(antes)) return null;
  if (antes === 0) return agora === 0 ? 0 : null;
  return T.arredondar((agora - antes) / antes, 4);
}

module.exports = {
  ETAPAS, ROTULO_ETAPA, MOTIVOS, ROTULO_MOTIVO, PLATAFORMAS, ANUNCIO,
  etapaDe, tem, respostaDesconhecida, deAnuncio, diaDe, fechou, naoFechou, valorDe, plataformaDe, temPendencia, campanhaDe,
  noPeriodo, daPlataforma, resumo, agrupar, porDia, funil, tempoDeResposta, taxaDeFalta,
  somaDasLinhas, gastoPorDia, linhasEntre, linhasDaPlataforma, ultimoDia, gastoDoTrecho, estadoDoGasto, estadoDosContatos, variar,
};
