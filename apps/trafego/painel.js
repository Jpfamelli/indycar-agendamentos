/* ============================================================
   Painel — transforma o fato diário nas visões que a tela e o
   relatório consomem. Nenhuma conta acontece no navegador.
   ============================================================ */
'use strict';

const db = require('./db');
const M = require('./metricas');

const iso = d => d.toISOString().slice(0, 10);
const dias = n => new Date(Date.now() - n * 86400000);

/** Período anterior de mesmo tamanho, colado no início do atual. */
function periodoAnterior(de, ate) {
  const d1 = new Date(`${de}T00:00:00Z`), d2 = new Date(`${ate}T00:00:00Z`);
  const tamanho = Math.round((d2 - d1) / 86400000) + 1;
  const fim = new Date(d1.getTime() - 86400000);
  const inicio = new Date(fim.getTime() - (tamanho - 1) * 86400000);
  return { de: iso(inicio), ate: iso(fim), tamanho };
}

function agrupar(linhas, chave) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = chave(l);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  }
  return mapa;
}

/**
 * Visão principal: totais do período, comparação com o período anterior,
 * quebra por plataforma e a série diária para o gráfico.
 */
async function resumo({ de, ate, plataforma = null } = {}) {
  const atual = await db.lerMetricas({ de, ate, nivel: 'campanha', plataforma });
  const ant = periodoAnterior(de, ate);
  const anterior = await db.lerMetricas({ de: ant.de, ate: ant.ate, nivel: 'campanha', plataforma });
  const cfg = await db.lerConfig();

  const total = M.consolidar(atual);
  const totalAnt = M.consolidar(anterior);

  const comparacao = {};
  for (const k of ['gasto', 'cliques', 'impressoes', 'conversoes', 'valor_conversao',
                   'cpa', 'roas', 'ctr', 'cpc', 'cpm']) {
    comparacao[k] = { atual: total[k], anterior: totalAnt[k], variacao: M.variacao(total[k], totalAnt[k]) };
  }

  const porPlataforma = [...agrupar(atual, l => l.plataforma)]
    .map(([p, linhas]) => ({ plataforma: p, ...M.consolidar(linhas) }))
    .sort((a, b) => b.gasto - a.gasto);

  const serie = [...agrupar(atual, l => l.data)]
    .map(([data, linhas]) => {
      const t = M.consolidar(linhas);
      const porPlat = {};
      for (const [p, ls] of agrupar(linhas, l => l.plataforma)) porPlat[p] = M.somar(ls).gasto;
      return { data, gasto: t.gasto, conversoes: t.conversoes, receita: t.valor_conversao,
               cpa: t.cpa, roas: t.roas, meta: porPlat.meta || 0, google: porPlat.google || 0 };
    })
    .sort((a, b) => a.data.localeCompare(b.data));

  // Cruzamento com o CRM: a plataforma conta "conversão", o CRM conta
  // venda fechada. A diferença entre os dois é o que vale olhar.
  const crm = await db.leadsPorCanal(de, ate);

  return {
    periodo: { de, ate }, periodo_anterior: ant,
    total, total_anterior: totalAnt, comparacao,
    lucro: M.lucro(total, cfg.margem_pct),
    metas: {
      cpa_alvo: cfg.cpa_alvo, roas_alvo: cfg.roas_alvo,
      orcamento_mensal: cfg.orcamento_mensal, margem_pct: cfg.margem_pct,
    },
    por_plataforma: porPlataforma,
    serie, crm,
  };
}

/**
 * Ranking de campanhas / conjuntos / criativos no período.
 * `ordenar` aceita qualquer métrica derivada.
 */
async function ranking({ de, ate, nivel = 'campanha', plataforma = null, ordenar = 'gasto', limite = 50 } = {}) {
  const linhas = await db.lerMetricas({ de, ate, nivel, plataforma });
  const itens = [...agrupar(linhas, l => `${l.plataforma}|${l.entidade_ext}`)]
    .map(([chave, ls]) => {
      const [plat, ext] = chave.split('|');
      return {
        plataforma: plat, entidade_ext: ext,
        nome: ls[ls.length - 1].entidade_nome || ext,
        campanha_nome: ls[ls.length - 1].campanha_nome || null,
        dias_ativos: new Set(ls.map(l => l.data)).size,
        ...M.consolidar(ls),
      };
    });

  // null (métrica sem base, ex.: CPA sem conversão) sempre por último —
  // caso contrário uma campanha sem conversão apareceria como "melhor CPA".
  itens.sort((a, b) => {
    const x = a[ordenar], y = b[ordenar];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  });
  return itens.slice(0, limite);
}

/** Série de uma entidade específica, para o gráfico de detalhe. */
async function historico({ entidade, nivel = 'campanha', de, ate }) {
  const linhas = await db.lerMetricas({ de, ate, nivel, entidade });
  return [...agrupar(linhas, l => l.data)]
    .map(([data, ls]) => ({ data, ...M.consolidar(ls) }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Ritmo de gasto do mês corrente contra o orçamento. */
async function ritmoDoMes() {
  const agora = new Date();
  const de = iso(new Date(agora.getFullYear(), agora.getMonth(), 1));
  const ate = iso(agora);
  const linhas = await db.lerMetricas({ de, ate, nivel: 'campanha' });
  const cfg = await db.lerConfig();
  const t = M.consolidar(linhas);

  const diasCorridos = agora.getDate();
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const projecao = diasCorridos > 0 ? (t.gasto / diasCorridos) * diasNoMes : 0;

  return {
    de, ate, gasto: t.gasto, receita: t.valor_conversao, conversoes: t.conversoes,
    orcamento: cfg.orcamento_mensal, projecao,
    dias_corridos: diasCorridos, dias_no_mes: diasNoMes,
    lucro: M.lucro(t, cfg.margem_pct),
    // Positivo = vai estourar; negativo = vai sobrar.
    desvio: cfg.orcamento_mensal ? projecao - cfg.orcamento_mensal : null,
  };
}

module.exports = { resumo, ranking, historico, ritmoDoMes, periodoAnterior, iso, dias };
