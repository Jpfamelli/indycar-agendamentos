/* ============================================================
   Relatório diário — número + diagnóstico, entregue no WhatsApp.
   O objetivo não é mandar tabela: é mandar a frase que faz o dono
   decidir o que mexer hoje.
   ============================================================ */
'use strict';

const db = require('./db');
const painel = require('./painel');
const M = require('./metricas');
const whatsapp = require('./whatsapp');
const Vocab = require('./vocabulario');
const leadsMod = require('./leads');
const Ciclo = require('./ciclo');
const Acoes = require('./acoes');

/* Roda todo dia, com prompt pequeno: usa o modelo RÁPIDO do ecossistema
   (ia_config.modelo_rapido). ADS_MODELO_IA, se preenchido, ainda manda. */
async function modeloIA() {
  if (process.env.ADS_MODELO_IA) return process.env.ADS_MODELO_IA;
  try { return (await db.lerIaConfig()).modelo_rapido; } catch { return db.IA_PADRAO.modelo_rapido; }
}

const iso = d => d.toISOString().slice(0, 10);
const ontem = () => iso(new Date(Date.now() - 86400000));

const dataBR = s => {
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
};

const seta = v => (v == null ? '' : v > 0.5 ? ' ↑' : v < -0.5 ? ' ↓' : ' →');
const pct = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`);

/* ------------------------------------------------------------
   Coleta dos números
   ------------------------------------------------------------ */

async function montarDados(referencia = ontem()) {
  const dia = await painel.resumo({ de: referencia, ate: referencia });
  const semana = await painel.resumo({
    de: iso(new Date(new Date(`${referencia}T00:00:00Z`).getTime() - 6 * 86400000)),
    ate: referencia,
  });
  const campanhas = await painel.ranking({ de: semana.periodo.de, ate: referencia, nivel: 'campanha', ordenar: 'gasto' });
  const criativos = await painel.ranking({ de: semana.periodo.de, ate: referencia, nivel: 'anuncio', ordenar: 'gasto', limite: 12 });
  const mes = await painel.ritmoDoMes();
  const alertas = await db.listarAlertas({ limite: 12 });
  const cfg = await db.lerConfig();
  // Rodada 5: quantos leads entraram no CRM na data, por canal (site, WhatsApp, anúncio) — fecha o ciclo no relatório.
  // Rodada 6: o que os leads de anúncio viraram no Orçador e no Pátio (7 dias). Orçador/Pátio fora = relatório sai sem o bloco.
  const ciclo = await require('./resultados').resumo({ de: semana.periodo.de, ate: referencia }).then(x => (x.ciclo && !x.ciclo.indisponivel ? x.ciclo : null)).catch(() => null);
  // Rodada 7: quem está esperando o consultor hoje (orçamento aberto e sem resposta, desconto pedido, carro pronto…). Fonte fora = sem o bloco.
  const acoes = await Ciclo.acoes({ dias: 30, limite: 5 }).then(x => (x.indisponivel ? null : x)).catch(() => null);
  const leadsDia = await leadsMod.listar({ de: referencia, ate: referencia, limite: 1 }).then(r => r.resumo_periodo).catch(() => null);

  // A mesma condição pode disparar em rodadas seguidas do radar. No histórico
  // isso é informação; no relatório é repetição — o dono lê a mesma frase três
  // vezes e para de ler o resto.
  const desde = new Date(Date.now() - 36 * 3600000).toISOString();
  const vistos = new Set();
  const alertas_recentes = alertas
    .filter(a => a.criado_em >= desde)
    .filter(a => !vistos.has(a.mensagem) && vistos.add(a.mensagem));

  return {
    referencia, dia, semana, mes, cfg, leadsDia, ciclo, acoes,
    demo: dia.total.gasto > 0 || semana.total.gasto > 0 ? await ehDemo(semana.periodo.de, referencia) : false,
    campanhas: campanhas.slice(0, 8),
    criativos,
    alertas_recentes,
  };
}

/* Todo o investimento do período é de demonstração? (o relatório avisa em cima) */
async function ehDemo(de, ate) {
  try { const ls = await db.lerMetricas({ de, ate, nivel: 'campanha' }); return ls.length > 0 && ls.every(l => l.fonte === 'demo'); }
  catch { return false; }
}

/* ------------------------------------------------------------
   Texto do WhatsApp
   ------------------------------------------------------------ */

function montarTexto(d, resumoIA) {
  const t = d.dia.total, c = d.dia.comparacao;
  const L = [];

  L.push(`📊 *IndyCar · Tráfego pago* — ${dataBR(d.referencia)}`);
  if (d.demo) L.push('_⚠️ Números de DEMONSTRAÇÃO (fabricados). Cole as chaves da Meta e do Google em Ajustes → Conexões para ver os reais._');
  L.push('');
  L.push('*Ontem*');
  L.push(`• Investido: ${M.brl(t.gasto)} (${pct(c.gasto.variacao)}${seta(c.gasto.variacao)} vs. dia anterior)`);
  L.push(`• Conversões: ${Math.round(t.conversoes)} (${pct(c.conversoes.variacao)}${seta(c.conversoes.variacao)})`);
  L.push(`• CPA: ${M.formatar('cpa', t.cpa)}${d.cfg.cpa_alvo ? ` · meta ${M.brl(d.cfg.cpa_alvo)}` : ''}`);
  L.push(`• ROAS: ${M.formatar('roas', t.roas)}${d.cfg.roas_alvo ? ` · meta ${d.cfg.roas_alvo}x` : ''}`);
  L.push(`• CTR: ${M.formatar('ctr', t.ctr)} · CPM: ${M.formatar('cpm', t.cpm)}`);

  if (d.dia.por_plataforma.length) {
    L.push('');
    L.push('*Por plataforma (ontem)*');
    for (const p of d.dia.por_plataforma) {
      const nome = p.plataforma === 'meta' ? 'Meta' : 'Google';
      L.push(`• ${nome}: ${M.brl(p.gasto)} → ${Math.round(p.conversoes)} conv · CPA ${M.formatar('cpa', p.cpa)}`);
    }
  }

  const st = d.semana.total;
  L.push('');
  L.push('*Últimos 7 dias*');
  L.push(`• ${M.brl(st.gasto)} investidos · ${Math.round(st.conversoes)} conversões · CPA ${M.formatar('cpa', st.cpa)} · ROAS ${M.formatar('roas', st.roas)}`);

  // Melhor e pior da semana, com um piso para não eleger campanha de R$ 20.
  const elegiveis = d.campanhas.filter(x => x.gasto >= 50 && x.conversoes > 0);
  if (elegiveis.length >= 2) {
    const melhor = [...elegiveis].sort((a, b) => a.cpa - b.cpa)[0];
    const pior = [...elegiveis].sort((a, b) => b.cpa - a.cpa)[0];
    L.push(`• 🟢 Melhor CPA: ${melhor.nome} — ${M.brl(melhor.cpa)}`);
    L.push(`• 🔴 Pior CPA: ${pior.nome} — ${M.brl(pior.cpa)}`);
  }
  const semConversao = d.campanhas.filter(x => x.gasto >= 80 && x.conversoes === 0);
  for (const x of semConversao) L.push(`• ⚠️ ${x.nome}: ${M.brl(x.gasto)} na semana sem nenhuma conversão`);

  if (d.mes.orcamento) {
    const status = d.mes.desvio > 0 ? '🔺 acima' : '🔻 abaixo';
    L.push('');
    L.push('*Mês*');
    L.push(`• ${M.brl(d.mes.gasto)} de ${M.brl(d.mes.orcamento)} · projeção ${M.brl(d.mes.projecao)} (${status} do orçamento)`);
  }

  // O que o CRM viu: conversão de plataforma x venda de verdade.
  const canais = Object.entries(d.semana.crm || {});
  if (canais.length) {
    L.push('');
    L.push('*No CRM (7 dias)*');
    for (const [canal, v] of canais) {
      const nome = canal === 'meta' ? 'Meta' : 'Google';
      // Venda sem valor_pago não é R$ 0 de receita: avisa em vez de mentir.
      const receita = v.fechados && v.sem_valor === v.fechados ? 'sem valor lançado'
        : `${M.brl(v.receita)}${v.sem_valor ? ` (${v.sem_valor} sem valor)` : ''}`;
      L.push(`• ${nome}: ${v.leads} leads · ${v.fechados} fechados · ${receita}`);
    }
  }

  const fraseOficina = Ciclo.frase(d.ciclo);
  if (fraseOficina) {
    L.push('');
    L.push('*Da campanha à oficina (7 dias)*');
    L.push(`• ${fraseOficina}`);
    for (const a of (d.ciclo.alertas || []).filter(x => x.tipo !== 'valor_sugerido').slice(0, 2)) L.push(`• ⚠️ ${a.texto}`);
  }

  if (d.acoes && d.acoes.total) {
    L.push('');
    L.push('*O que fazer hoje*');
    L.push(`• ${Acoes.frase(d.acoes)}`);
    for (const x of d.acoes.itens.slice(0, 5)) L.push(`• ${x.nome || 'Cliente'} — ${x.motivo}`);
  }

  if (d.leadsDia) {
    L.push('');
    L.push('*Leads de ontem no CRM*');
    L.push(`• ${leadsMod.fraseDoDia(d.leadsDia)}`);
  }

  if (d.alertas_recentes.length) {
    L.push('');
    L.push('*Alertas nas últimas 36h*');
    for (const a of d.alertas_recentes.slice(0, 6)) L.push(`• ${a.mensagem}`);
  }

  if (resumoIA) {
    L.push('');
    L.push('*Leitura do dia*');
    L.push(resumoIA);
  }

  L.push('');
  L.push(`_${Vocab.SLOGAN}_`);

  // Vocabulário da casa: nada de "prezado/efetuar/comparecer/veículo" sai daqui (nem vindo da IA).
  return Vocab.limpar(L.join('\n'));
}

/* ------------------------------------------------------------
   Diagnóstico com IA
   ------------------------------------------------------------ */

async function resumirComIA(d) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); }
  catch { return null; }   // sem a dependência instalada, o relatório sai só com números

  // Mandamos o essencial em JSON, não o texto já formatado: o modelo precisa
  // dos números crus para comparar, não da nossa prosa.
  const contexto = {
    data: d.referencia,
    ontem: enxugar(d.dia.total),
    variacao_vs_dia_anterior: Object.fromEntries(
      Object.entries(d.dia.comparacao).map(([k, v]) => [k, v.variacao == null ? null : +v.variacao.toFixed(1)])),
    sete_dias: enxugar(d.semana.total),
    metas: d.cfg ? { cpa_alvo: d.cfg.cpa_alvo, roas_alvo: d.cfg.roas_alvo, orcamento_mensal: d.cfg.orcamento_mensal } : {},
    mes: { gasto: r2(d.mes.gasto), projecao: r2(d.mes.projecao), orcamento: d.mes.orcamento },
    campanhas_7d: d.campanhas.map(c => ({
      nome: c.nome, plataforma: c.plataforma, gasto: r2(c.gasto),
      conversoes: Math.round(c.conversoes), cpa: r2(c.cpa), roas: r2(c.roas), ctr: r2(c.ctr),
    })),
    criativos_7d: d.criativos.slice(0, 8).map(c => ({
      nome: c.nome, gasto: r2(c.gasto), frequencia: r2(c.frequencia), ctr: r2(c.ctr), cpa: r2(c.cpa),
    })),
    crm_7d: d.semana.crm,
    oficina_7d: d.ciclo ? { orcamentos: d.ciclo.total.orcados, aprovados: d.ciclo.total.orcamentos_aprovados, carros_na_oficina: d.ciclo.total.na_oficina,
      entregues: d.ciclo.total.entregues, custo_por_carro: r2(d.ciclo.total.custo_carro_na_oficina), receita_paga: r2(d.ciclo.total.receita_entregues) } : null,
    quem_espera_o_consultor: d.acoes && d.acoes.total ? { total: d.acoes.total, valor_em_jogo: d.acoes.valor_em_jogo, por_tipo: d.acoes.por_tipo } : null,
    alertas: d.alertas_recentes.map(a => a.mensagem),
  };

  const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 });
  const msg = await cliente.messages.create({
    model: await modeloIA(),
    max_tokens: 700,
    thinking: { type: 'between_tools' },   // sem isso o teto vai todo em raciocínio e o texto volta vazio
    system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: [
      'Você é o gestor de tráfego da IndyCar Centro Automotivo, uma oficina em Taubaté (SP).',
      'Escreva em português do Brasil, direto, para o dono da oficina ler no WhatsApp.',
      'Máximo 5 linhas curtas. Nada de saudação, despedida ou markdown de título.',
      'Cada linha deve ser um fato + a causa provável + o que fazer. Cite números.',
      'Priorize o que custa dinheiro agora. Se estiver tudo estável, diga isso em uma linha e não invente problema.',
      'Não repita a tabela que o dono já vai ler acima: interprete.',
      'Venda do CRM sem valor não é receita zero: fale em custo por venda.',
      'Se houver oficina_7d, fale em custo por carro que entrou na oficina, não só em lead.',
    ].join(' ') }],
    messages: [{ role: 'user', content:
      `Dados de hoje:\n${JSON.stringify(contexto, null, 1)}\n\nEscreva a leitura do dia.` }],
  });

  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

const r2 = v => (v == null ? null : +Number(v).toFixed(2));
const enxugar = t => ({
  gasto: r2(t.gasto), cliques: t.cliques, impressoes: t.impressoes,
  conversoes: Math.round(t.conversoes), receita: r2(t.valor_conversao),
  cpa: r2(t.cpa), roas: r2(t.roas), ctr: r2(t.ctr), cpm: r2(t.cpm), frequencia: r2(t.frequencia),
});

/* ------------------------------------------------------------
   Orquestração
   ------------------------------------------------------------ */

/**
 * Gera o relatório do dia e, se pedido, manda no WhatsApp.
 * Sempre grava em ads_relatorios — inclusive quando o envio falha,
 * com o motivo no campo `erro`.
 */
async function gerarEEnviar({ referencia = ontem(), enviar = true, comIA = true } = {}) {
  const dados = await montarDados(referencia);

  let resumoIA = null, erroIA = null;
  if (comIA) {
    try { resumoIA = await resumirComIA(dados); }
    catch (e) { erroIA = e.message; }   // IA fora do ar não pode impedir o relatório
  }

  const texto = montarTexto(dados, resumoIA);
  const cfg = dados.cfg;
  const destinos = cfg.whatsapp_destinos || [];

  // Envio é opt-in explícito: relatorio_ativo precisa ser true E precisa
  // haver destino. Qualquer outra situação gera o relatório, grava, e NÃO
  // manda — com o motivo escrito para a tela mostrar.
  let envio = null, motivoSemEnvio = null, erro = erroIA ? `IA: ${erroIA}` : null;
  if (!enviar) motivoSemEnvio = 'prévia — nada foi enviado';
  else if (cfg.relatorio_ativo !== true) motivoSemEnvio = 'relatório diário desligado em Ajustes';
  else if (!destinos.length) motivoSemEnvio = 'nenhum número de WhatsApp cadastrado em Ajustes';
  else if (dados.demo && process.env.ADS_DEMO_ENVIA !== '1') motivoSemEnvio = 'números de demonstração não vão por WhatsApp (cole as chaves reais primeiro)';
  else {
    // Rodada 5: entra na fila do Comunicar (criado_por 'ads'); a chave impede o mesmo dia ir duas vezes para o mesmo número.
    envio = await whatsapp.enviarParaTodos(destinos, texto, { chave: `ads:relatorio:${referencia}` });
    const falhas = envio.filter(e => !e.ok);
    if (falhas.length) erro = [erro, falhas.map(f => `${f.destino}: ${f.erro}`).join('; ')].filter(Boolean).join(' · ');
    if (!envio.some(e => e.ok)) motivoSemEnvio = falhas[0]?.erro || 'envio falhou';
  }
  if (enviar && motivoSemEnvio && !envio) erro = [erro, motivoSemEnvio].filter(Boolean).join(' · ');

  const salvo = await db.salvarRelatorio({
    tipo: 'diario', referencia,
    payload: {
      dia: enxugar(dados.dia.total), semana: enxugar(dados.semana.total),
      por_plataforma: dados.dia.por_plataforma.map(p => ({ plataforma: p.plataforma, gasto: r2(p.gasto), conversoes: Math.round(p.conversoes), cpa: r2(p.cpa) })),
      campanhas: dados.campanhas.map(c => ({ nome: c.nome, gasto: r2(c.gasto), cpa: r2(c.cpa), roas: r2(c.roas) })),
      mes: { gasto: r2(dados.mes.gasto), projecao: r2(dados.mes.projecao), orcamento: dados.mes.orcamento },
      crm: dados.semana.crm,
      oficina: dados.ciclo ? { ...dados.ciclo.total } : null,
      acoes: dados.acoes ? { total: dados.acoes.total, valor_em_jogo: dados.acoes.valor_em_jogo, por_tipo: dados.acoes.por_tipo } : null,
    },
    resumo_ia: resumoIA, texto, destinos,
    enviado_em: envio?.some(e => e.ok) ? new Date().toISOString() : null,
    erro,
  });

  return { ...salvo, texto, resumo_ia: resumoIA, envio, erro, motivo_sem_envio: motivoSemEnvio };
}

module.exports = { gerarEEnviar, montarDados, montarTexto, resumirComIA, modeloIA, ehDemo };
