/* ============================================================
   Matemática de tráfego pago — um lugar só.
   O painel, o radar e o relatório precisam calcular CPA, ROAS,
   CTR e afins. Se cada um fizer a sua conta, o alerta e a tela
   passam a discordar; então todo mundo chama daqui.
   ============================================================ */
'use strict';

const num = v => {
  // Postgres devolve numeric como string. Sem isto, `a + b` vira concatenação.
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

/** Soma um conjunto de linhas de ads_metricas_dia em um único bloco. */
function somar(linhas) {
  const t = { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, conversoes: 0, valor_conversao: 0 };
  let freqPeso = 0, freqSoma = 0;
  for (const l of linhas || []) {
    t.gasto           += num(l.gasto);
    t.impressoes      += num(l.impressoes);
    t.alcance         += num(l.alcance);
    t.cliques         += num(l.cliques);
    t.conversoes      += num(l.conversoes);
    t.valor_conversao += num(l.valor_conversao);
    // Frequência não soma: é impressões/alcance. Média ponderada por
    // impressões é a aproximação honesta quando não temos o alcance
    // desduplicado do período inteiro.
    const f = num(l.frequencia);
    if (f > 0) { freqSoma += f * num(l.impressoes); freqPeso += num(l.impressoes); }
  }
  t.frequencia = freqPeso > 0 ? freqSoma / freqPeso : 0;
  return t;
}

/** Acrescenta as métricas derivadas. Divisão por zero vira null, nunca Infinity. */
function derivar(t) {
  const d = { ...t };
  d.ctr   = t.impressoes > 0 ? (t.cliques / t.impressoes) * 100 : null;
  d.cpc   = t.cliques    > 0 ?  t.gasto / t.cliques            : null;
  d.cpm   = t.impressoes > 0 ? (t.gasto / t.impressoes) * 1000 : null;
  d.cpa   = t.conversoes > 0 ?  t.gasto / t.conversoes         : null;
  d.roas  = t.gasto      > 0 ?  t.valor_conversao / t.gasto    : null;
  d.tx_conversao = t.cliques > 0 ? (t.conversoes / t.cliques) * 100 : null;
  return d;
}

/** Atalho: soma + deriva. */
const consolidar = linhas => derivar(somar(linhas));

/**
 * Lucro estimado. ROAS de plataforma mede faturamento sobre mídia;
 * quem paga a conta no fim do mês é a margem.
 */
function lucro(t, margemPct = 100) {
  return num(t.valor_conversao) * (num(margemPct) / 100) - num(t.gasto);
}

/** Variação percentual entre dois períodos. null quando não há base. */
function variacao(atual, anterior) {
  const a = num(atual), b = num(anterior);
  if (b === 0) return a === 0 ? 0 : null;
  return ((a - b) / b) * 100;
}

/* Para cada métrica: subir é bom ou ruim? O painel pinta de verde/vermelho
   a partir daqui, e o radar usa para escolher a severidade do texto. */
const SENTIDO = {
  gasto: 'neutro', impressoes: 'neutro', alcance: 'neutro', cliques: 'cima',
  conversoes: 'cima', valor_conversao: 'cima', roas: 'cima', ctr: 'cima',
  tx_conversao: 'cima', cpa: 'baixo', cpc: 'baixo', cpm: 'baixo', frequencia: 'baixo',
};

const ROTULO = {
  gasto: 'Investimento', impressoes: 'Impressões', alcance: 'Alcance', cliques: 'Cliques',
  conversoes: 'Conversões', valor_conversao: 'Receita', roas: 'ROAS', ctr: 'CTR',
  cpa: 'CPA', cpc: 'CPC', cpm: 'CPM', frequencia: 'Frequência', tx_conversao: 'Taxa de conversão',
};

const FORMATO = {
  gasto: 'brl', valor_conversao: 'brl', cpa: 'brl', cpc: 'brl', cpm: 'brl',
  ctr: 'pct', tx_conversao: 'pct', roas: 'x', frequencia: 'dec',
  impressoes: 'int', alcance: 'int', cliques: 'int', conversoes: 'int',
};

const brl = v => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Formata um valor conforme a métrica, para texto de WhatsApp e relatório. */
function formatar(metrica, valor) {
  if (valor == null) return '—';
  switch (FORMATO[metrica]) {
    case 'brl': return brl(valor);
    case 'pct': return `${valor.toFixed(2).replace('.', ',')}%`;
    case 'x':   return `${valor.toFixed(2).replace('.', ',')}x`;
    case 'dec': return valor.toFixed(2).replace('.', ',');
    case 'int': return Math.round(valor).toLocaleString('pt-BR');
    default:    return String(valor);
  }
}

module.exports = { num, somar, derivar, consolidar, lucro, variacao, formatar, brl, SENTIDO, ROTULO, FORMATO };
