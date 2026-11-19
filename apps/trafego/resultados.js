/* ============================================================
   Resultados CRM — o ROI de verdade: quanto custou cada lead,
   cada agendamento e cada venda, por canal e por campanha.
   ============================================================ */
'use strict';

const db = require('./db');
const A = require('./atribuicao');
const { periodoAnterior } = require('./painel');
const Ciclo = require('./ciclo');

/* Lê a coorte e o que a cerca (agendamentos e conversas) de um período. */
async function coorte(de, ate, plataforma) {
  const [leads, metricas] = await Promise.all([
    db.lerCoorteAds(de, ate),
    db.lerMetricas({ de, ate, nivel: 'campanha', plataforma }),
  ]);
  const pagos = leads.filter(l => A.canal(l));
  const [agendamentos, clientesComConversa] = await Promise.all([
    db.lerAgendamentosDosLeads(pagos.map(l => l.id)),
    db.lerClientesComConversa(pagos.map(l => l.cliente_id)),
  ]);
  return { leads, metricas, agendamentos, clientesComConversa };
}

async function resumo({ de, ate, plataforma = null }) {
  const anterior = periodoAnterior(de, ate);
  const [atualBruto, antBruto, cfg] = await Promise.all([
    coorte(de, ate, plataforma), coorte(anterior.de, anterior.ate, plataforma), db.lerConfig(),
  ]);
  const opcoes = { plataforma, margem: cfg.margem_pct, cpaAlvo: cfg.cpa_alvo };
  const atual = A.consolidar({ ...atualBruto, ...opcoes });
  const ant = A.consolidar({ ...antBruto, ...opcoes });
  const demo = atualBruto.metricas.length > 0 && atualBruto.metricas.every(m => m.fonte === 'demo');
  const saida = montar(atual, ant, { de, ate, anterior, margem: cfg.margem_pct, demo });
  saida.equipe = await equipeDe(atualBruto, plataforma).catch(() => null);
  saida.ciclo = await cicloDe(atualBruto, atual).catch(() => null);
  if (saida.ciclo && !saida.ciclo.indisponivel) {
    saida.ciclo.demo = !!demo;   // rodada 7: a tela avisa que o custo por carro usa investimento fabricado
    const antCiclo = await cicloDe(antBruto, ant).catch(() => null);
    saida.ciclo.comparacao = antCiclo && !antCiclo.indisponivel ? Ciclo.compararCiclo(saida.ciclo.total, antCiclo.total) : null;
  }
  return saida;
}

/**
 * Rodada 6: do anúncio ao carro entregue. Lê orçamentos (Orçador) e OS (Pátio) dos leads pagos da coorte.
 * Se o Orçador/Pátio não responderem, devolve { indisponivel } e o Resultados CRM segue normal.
 */
async function cicloDe({ leads }, resultado, { ler = Ciclo.ler, agora = Date.now() } = {}) {
  const pagos = leads.filter(l => A.canal(l));
  const lido = await ler(pagos.map(l => l.id));
  if (!lido.ok) return { indisponivel: true, motivo: 'Não consegui ler o Orçador e o Pátio agora; o resto do resultado está certo.' };
  return { indisponivel: false, parcial: lido.parcial || null, ...Ciclo.consolidarCiclo({ leads: pagos, porLead: lido.porLead, resultado, agora }) };
}

/** Leads de anúncio por responsável, com o nome (só o nome) de cada um. */
async function equipeDe({ leads, agendamentos }, plataforma, nomes = ids => require('./equipe').banco().nomesDosPerfis(ids)) {
  const linhas = A.porResponsavel({ leads, agendamentos, plataforma });
  const mapa = await nomes(linhas.map(l => l.responsavel_id).filter(Boolean));
  return linhas.map(({ responsavel_id, ...l }) => ({
    ...l,
    nome: responsavel_id ? (mapa.get(responsavel_id)?.nome || 'Pessoa removida') : 'Sem responsável',
    sem_responsavel: !responsavel_id,
    inativo: responsavel_id ? mapa.get(responsavel_id)?.ativo === false : false,
  }));
}

/** Junta o resultado com o texto de critério (separado para o mock usar igual). */
function montar(atual, ant, { de, ate, anterior, margem, demo = false, criterio = null }) {
  return {
    ...atual,
    funil: A.funil(atual.total),
    periodo: { de, ate },
    periodo_anterior: { de: anterior.de, ate: anterior.ate },
    comparacao: A.comparar(atual.total, ant.total),
    margem, demo,
    atualizado_em: new Date().toISOString(),
    criterio: criterio || 'Leads criados no período (horário de Brasília), com o status de hoje. Agendamento = agendamento não cancelado do lead; conversa = o cliente tem conversa no Atendimento. UTM casa com o nome da campanha, ignorando maiúsculas e acentos.',
    aviso_demo: demo ? 'O investimento é de demonstração; leads e vendas são do CRM de verdade — os dois não se casam por campanha.' : null,
  };
}

module.exports = { cicloDe, resumo, montar, coorte, equipeDe };
