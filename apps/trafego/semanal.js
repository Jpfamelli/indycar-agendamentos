/* ============================================================
   Resumo semanal de campanhas — vira NOTIFICAÇÃO (sino) para os
   gestores do Tráfego pago. Não sai pelo WhatsApp: o relatório
   diário continua desligado por pedido do dono (15/09/2026).
   ============================================================ */
'use strict';

const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const int = v => (v == null ? '—' : Math.round(Number(v)).toLocaleString('pt-BR'));
const dm = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');

/** Semana fechada (segunda a domingo) anterior à data local `hojeISO`. */
function semanaFechada(hojeISO) {
  const hoje = new Date(`${hojeISO}T12:00:00Z`);
  const dow = (hoje.getUTCDay() + 6) % 7;          // 0 = segunda
  const fim = new Date(hoje.getTime() - (dow + 1) * 86400000);   // domingo passado
  const inicio = new Date(fim.getTime() - 6 * 86400000);
  const iso = d => d.toISOString().slice(0, 10);
  return { de: iso(inicio), ate: iso(fim) };
}

/**
 * Monta título e corpo (puro, testado). `painel` = painel.resumo; `crm` = resultados.resumo;
 * `ranking` = campanhas por gasto.
 */
function montar({ de, ate, painel, crm, ranking = [], alertas = 0, leadsTodos = null, acoes = null }) {
  const t = painel?.total || {};
  const gasto = Number(t.gasto) || 0;
  const leads = crm?.total?.leads ?? 0, ag = crm?.total?.agendamentos ?? 0, vendas = crm?.total?.fechados ?? 0;
  const variacao = painel?.comparacao?.gasto?.variacao;
  const comCPA = ranking.filter(c => c.cpa != null && c.gasto > 0);
  const melhor = comCPA.length ? [...comCPA].sort((a, b) => a.cpa - b.cpa)[0] : null;
  const semConv = ranking.filter(c => c.gasto >= 50 && !(c.conversoes > 0)).sort((a, b) => b.gasto - a.gasto)[0] || null;

  const titulo = gasto > 0
    ? `Semana ${dm(de)}–${dm(ate)}: ${brl(gasto)} em anúncios, ${int(leads)} lead(s)`
    : `Semana ${dm(de)}–${dm(ate)}: sem investimento registrado`;
  const partes = [];
  if (gasto > 0) {
    partes.push(`Investido ${brl(gasto)}${variacao != null ? ` (${variacao >= 0 ? '+' : ''}${Math.round(variacao)}% contra a semana anterior)` : ''}.`);
    partes.push(`CRM: ${int(leads)} lead(s), ${int(ag)} agendamento(s), ${int(vendas)} venda(s).`);
    if (crm?.total?.custo_agendamento != null) partes.push(`Custo por agendamento ${brl(crm.total.custo_agendamento)}.`);
    if (melhor) partes.push(`Melhor CPA: ${String(melhor.nome).slice(0, 40)} (${brl(melhor.cpa)}).`);
    if (semConv) partes.push(`Atenção: ${String(semConv.nome).slice(0, 40)} gastou ${brl(semConv.gasto)} sem conversão.`);
  } else {
    partes.push(`Nenhum gasto de Meta ou Google na semana. CRM: ${int(leads)} lead(s) pago(s).`);
  }
  // Rodada 5: o funil inteiro — site e WhatsApp também contam.
  if (leadsTodos && leadsTodos.total) {
    const pc = leadsTodos.por_canal || {};
    partes.push(`No total ${int(leadsTodos.total)} lead(s) novo(s) (site ${int(pc.site || 0)}, WhatsApp ${int(pc.whatsapp || 0)}, anúncios ${int((pc.meta || 0) + (pc.google || 0))})${leadsTodos.sem_responsavel ? `, ${int(leadsTodos.sem_responsavel)} sem responsável` : ''}.`);
  }
  // Rodada 6: da campanha à oficina (orçamento aprovado, carro entregue, custo por carro).
  const oficina = require('./ciclo').frase(crm?.ciclo && !crm.ciclo.indisponivel ? crm.ciclo : null);
  if (oficina) partes.push(`Oficina: ${oficina}`);
  // Rodada 7: quem está esperando o consultor agora.
  const espera = require('./acoes').frase(acoes);
  if (espera) partes.push(espera);
  if (alertas) partes.push(`${int(alertas)} alerta(s) do radar na semana.`);
  if (crm?.demo) partes.push('(investimento de demonstração)');
  const Vocab = require('./vocabulario');
  return { titulo: Vocab.limpar(titulo).slice(0, 140), corpo: Vocab.limpar(partes.join(' ')).slice(0, 400) };
}

/** Gera e notifica. `manualPara` = só para essa pessoa (botão da tela), sem trava de repetição. */
async function gerarENotificar({ hojeISO, manualPara = null, deps } = {}) {
  const d = deps || {
    painel: require('./painel'), resultados: require('./resultados'), db: require('./db'), equipe: require('./equipe').banco(),
  };
  const { de, ate } = semanaFechada(hojeISO);
  const [p, crm, ranking, alertas, leadsTodos, acoes] = await Promise.all([
    d.painel.resumo({ de, ate }),
    d.resultados.resumo({ de, ate }).catch(() => null),
    d.painel.ranking({ de, ate, nivel: 'campanha', ordenar: 'gasto', limite: 50 }),
    d.db.listarAlertas({ limite: 200 }).then(l => l.filter(a => String(a.criado_em || a.created_at || '').slice(0, 10) >= de).length).catch(() => 0),
    (d.leads || require('./leads')).listar({ de, ate, limite: 1 }).then(r => r.resumo_periodo).catch(() => null),
    // Rodada 7: só lê a fila quando é a execução real (ou quando o teste entrega a leitura).
    (!deps || deps.acoes) ? (deps?.acoes || (() => require('./ciclo').acoes({ limite: 5 })))().then(x => (x.indisponivel ? null : x)).catch(() => null) : null,
  ]);
  const { titulo, corpo } = montar({ de, ate, painel: p, crm, ranking, alertas, leadsTodos, acoes });
  const link = `/?aba=painel&de=${de}&ate=${ate}`;
  if (manualPara) {
    const ok = await d.equipe.notificarUm(manualPara, { tipo: 'ads_semana', titulo, corpo, link });
    return { de, ate, titulo, corpo, enviadas: ok ? 1 : 0, destinatarios: 1 };
  }
  const r = await d.equipe.notificarGestores({ tipo: 'ads_semana', titulo, corpo, link, chave: `ads-semana-${de}`, preferencia: 'ads_semana' });
  return { de, ate, titulo, corpo, ...r };
}

module.exports = { semanaFechada, montar, gerarENotificar };
