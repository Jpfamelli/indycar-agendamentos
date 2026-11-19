/* ============================================================
   Fechamento do mês — relatório do dono (rodada 7, 25/10/2026).
   Responde, em um texto curto: quanto o anúncio custou, quantos carros
   entraram e foram entregues por causa dele, quanto o cliente pagou e
   quanto cada carro custou. Mês fechado (ou o mês até ontem), contra o
   mês anterior. A montagem do texto é pura e testada; os números vêm do
   resultados.resumo (CRM + Orçador + Pátio), que já tolera fonte fora do ar.
   ============================================================ */
'use strict';

const Vocab = require('./vocabulario');

const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const int = v => Math.round(Number(v) || 0).toLocaleString('pt-BR');
const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const iso = d => d.toISOString().slice(0, 10);

/** 'YYYY-MM' -> { de, ate, rotulo, dias, parcial }. `ate` é ontem quando o mês ainda não fechou. Mês inválido = null. */
function periodoDoMes(mes, hojeISO) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(mes || ''));
  if (!m) return null;
  const ano = Number(m[1]), n = Number(m[2]);
  const de = `${m[1]}-${m[2]}-01`;
  const ultimo = iso(new Date(Date.UTC(ano, n, 0)));
  const ontem = hojeISO ? iso(new Date(Date.parse(hojeISO + 'T12:00:00Z') - 86400000)) : ultimo;
  if (de > ontem) return null;                       // mês que ainda não começou
  const ate = ultimo <= ontem ? ultimo : ontem;
  const dias = Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400000) + 1;
  return { de, ate, rotulo: `${NOME_MES[n - 1]} de ${ano}`, dias, parcial: ate < ultimo, mes: `${m[1]}-${m[2]}` };
}
/** Mês anterior ('YYYY-MM'). */
function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
const variacao = (a, b) => (a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null);
const pct = v => (v == null ? '' : ` (${v > 0 ? '+' : ''}${Math.round(v)}% contra o mês anterior)`);

/**
 * Puro: junta o resultado do mês e o do mês anterior numa estrutura simples.
 * `r` e `ant` = saída de resultados.resumo. Orçador/Pátio fora = `oficina: null` (o resto segue).
 */
function consolidar(periodo, r, ant) {
  const t = r?.total || {}, ta = ant?.total || {};
  const c = r?.ciclo && !r.ciclo.indisponivel ? r.ciclo.total : null;
  const ca = ant?.ciclo && !ant.ciclo.indisponivel ? ant.ciclo.total : null;
  const gasto = t.gasto ?? 0;
  return {
    periodo, demo: !!r?.demo,
    anuncio: { gasto, gasto_anterior: ta.gasto ?? null, variacao_gasto: variacao(gasto, ta.gasto), leads: t.leads ?? 0, leads_anterior: ta.leads ?? null, custo_lead: t.cpl ?? null,
      agendamentos: t.agendamentos ?? 0, fechados: t.fechados ?? 0, receita_crm: t.receita ?? 0 },
    oficina: c ? {
      orcamentos: c.orcados, aprovados: c.orcamentos_aprovados, valor_aprovado: c.valor_aprovado, na_oficina: c.na_oficina, entregues: c.entregues,
      receita_paga: c.receita_entregues, entregues_sem_valor: c.entregues_sem_valor, extras_aprovados: c.extras_aprovados,
      custo_carro: c.custo_carro_na_oficina, custo_carro_anterior: ca?.custo_carro_na_oficina ?? null, custo_entregue: c.custo_carro_entregue,
      roas: c.roas_oficina, roas_previsto: c.roas_previsto, recusados: c.orcamentos_recusados, valor_recusado: c.valor_recusado,
      horas_decisao: c.horas_decisao, receita_anterior: ca?.receita_entregues ?? null, variacao_receita: variacao(c.receita_entregues, ca?.receita_entregues),
      variacao_carros: variacao(c.na_oficina, ca?.na_oficina),
    } : null,
    motivos: r?.ciclo && !r.ciclo.indisponivel ? r.ciclo.motivos.slice(0, 3) : [],
    campanhas: r?.ciclo && !r.ciclo.indisponivel ? r.ciclo.campanhas.filter(g => g.gasto > 0 || g.na_oficina).slice(0, 5) : [],
  };
}

/** Uma frase de veredito, sem enfeite: o anúncio se pagou ou não (puro). */
function veredito(f) {
  const o = f.oficina, g = f.anuncio.gasto;
  if (!(g > 0)) return 'Não houve investimento registrado no período.';
  if (!o) return 'Não consegui ler o Orçador e o Pátio agora: os números de oficina ficaram de fora.';
  if (o.receita_paga > 0) {
    const sobra = o.receita_paga - g;
    return sobra >= 0 ? `Cada R$ 1 em anúncio voltou como ${(o.receita_paga / g).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} reais já pagos${o.entregues_sem_valor ? ` (faltam ${o.entregues_sem_valor} valor(es) a lançar)` : ''}.`
      : `O que já foi pago (${brl(o.receita_paga)}) ainda não cobre o anúncio (${brl(g)})${o.valor_aprovado > 0 ? `, mas há ${brl(o.valor_aprovado)} aprovados` : ''}.`;
  }
  if (o.na_oficina) return `${int(o.na_oficina)} carro(s) entraram, mas nenhum valor pago foi lançado no CRM: lance para o retorno aparecer.`;
  return 'Nenhum lead de anúncio virou carro na oficina neste período.';
}

/** Texto do WhatsApp/tela (puro). */
function texto(f) {
  const L = [];
  const p = f.periodo, a = f.anuncio, o = f.oficina;
  L.push(`📈 *IndyCar · Fechamento de ${p.rotulo}*${p.parcial ? ` (até ${p.ate.split('-').reverse().join('/')})` : ''}`);
  if (f.demo) L.push('_⚠️ Investimento de DEMONSTRAÇÃO (fabricado). Os leads e carros são do sistema de verdade._');
  L.push('');
  L.push('*Anúncio*');
  L.push(`• Investido: ${brl(a.gasto)}${pct(a.variacao_gasto)}`);
  L.push(`• Leads: ${int(a.leads)}${a.custo_lead != null ? ` · ${brl(a.custo_lead)} cada` : ''} · ${int(a.agendamentos)} agendamento(s) · ${int(a.fechados)} venda(s) fechada(s)`);
  if (o) {
    L.push('');
    L.push('*Na oficina*');
    L.push(`• ${int(o.orcamentos)} orçamento(s), ${int(o.aprovados)} aprovado(s) (${brl(o.valor_aprovado)})`);
    L.push(`• ${int(o.na_oficina)} carro(s) entraram${o.variacao_carros != null ? ` (${o.variacao_carros > 0 ? '+' : ''}${Math.round(o.variacao_carros)}%)` : ''} · ${int(o.entregues)} entregue(s)`);
    if (o.custo_carro != null) L.push(`• Cada carro custou ${brl(o.custo_carro)} em anúncio${o.custo_entregue != null ? ` (${brl(o.custo_entregue)} por entregue)` : ''}`);
    L.push(`• Já pago: ${o.receita_paga > 0 ? brl(o.receita_paga) : 'nada lançado'}${o.extras_aprovados > 0 ? ` · + ${brl(o.extras_aprovados)} em extras aprovados` : ''}`);
    if (o.recusados) L.push(`• ${int(o.recusados)} recusado(s) (${brl(o.valor_recusado)})${f.motivos.length ? `: ${f.motivos.map(m => `${m.motivo} (${m.qtd})`).join(', ')}` : ''}`);
  }
  if (f.campanhas.length) {
    L.push('');
    L.push('*Campanhas*');
    for (const g of f.campanhas.slice(0, 3)) L.push(`• ${g.campanha}: ${brl(g.gasto)} → ${int(g.na_oficina)} carro(s)${g.custo_carro_na_oficina != null ? ` · ${brl(g.custo_carro_na_oficina)} cada` : ''}`);
  }
  L.push('');
  L.push(`*Em resumo:* ${veredito(f)}`);
  L.push('');
  L.push(`_${Vocab.SLOGAN}_`);
  return Vocab.limpar(L.join('\n'));
}

/* CSV do fechamento: indicadores (uma linha cada) e depois as campanhas. */
const num = v => (v == null || Number.isNaN(Number(v)) ? '' : Number(v));
function linhasCSV(f) {
  const a = f.anuncio, o = f.oficina;
  const ind = [['Período', `${f.periodo.de} a ${f.periodo.ate}${f.periodo.parcial ? ' (parcial)' : ''}`], ['Investimento de demonstração', f.demo ? 'sim' : 'não'], ['Investido', num(a.gasto)], ['Investido no mês anterior', num(a.gasto_anterior)],
    ['Leads', num(a.leads)], ['Custo por lead', num(a.custo_lead)], ['Agendamentos', num(a.agendamentos)], ['Vendas fechadas', num(a.fechados)], ['Receita lançada no CRM', num(a.receita_crm)]];
  if (o) ind.push(['Orçamentos', num(o.orcamentos)], ['Orçamentos aprovados', num(o.aprovados)], ['Valor aprovado', num(o.valor_aprovado)], ['Carros na oficina', num(o.na_oficina)], ['Carros entregues', num(o.entregues)],
    ['Valor pago', num(o.receita_paga)], ['Entregues sem valor lançado', num(o.entregues_sem_valor)], ['Extras aprovados', num(o.extras_aprovados)], ['Custo por carro', num(o.custo_carro)], ['Custo por carro entregue', num(o.custo_entregue)],
    ['ROAS da oficina', num(o.roas)], ['ROAS previsto', num(o.roas_previsto)], ['Orçamentos recusados', num(o.recusados)], ['Valor recusado', num(o.valor_recusado)]);
  const linhas = ind.map(([indicador, valor]) => ({ secao: 'Resumo', indicador, valor }));
  for (const g of f.campanhas || []) linhas.push({ secao: 'Campanha', indicador: g.campanha, valor: num(g.gasto), carros: num(g.na_oficina), custo_carro: num(g.custo_carro_na_oficina) });
  return linhas;
}
const CAMPOS_CSV = [['secao', 'Seção'], ['indicador', 'Indicador'], ['valor', 'Valor'], ['carros', 'Carros na oficina'], ['custo_carro', 'Custo por carro']];

/** Gera o fechamento. `ler` = resultados.resumo (injetável nos testes). */
async function gerar({ mes, hojeISO, ler = (x => require('./resultados').resumo(x)) } = {}) {
  const periodo = periodoDoMes(mes, hojeISO);
  if (!periodo) return { ok: false, erro: 'Escolha um mês que já começou (formato AAAA-MM).' };
  const anteriorMes = mesAnterior(periodo.mes);
  const antPeriodo = periodoDoMes(anteriorMes, hojeISO);
  const [r, ant] = await Promise.all([ler({ de: periodo.de, ate: periodo.ate }), antPeriodo ? ler({ de: antPeriodo.de, ate: antPeriodo.ate }).catch(() => null) : null]);
  const f = consolidar(periodo, r, ant);
  return { ok: true, ...f, texto: texto(f), veredito: veredito(f) };
}

/**
 * Pura: o fechamento do mês anterior sai no dia 1, depois da hora do relatório, uma vez por mês,
 * e só com o relatório ligado e número cadastrado (o mesmo opt-in do relatório diário).
 */
function decidirEnvioMensal(cfg, hojeISO, hora, ultimoMes = null) {
  if (!cfg) return { enviar: false, motivo: 'configuração não carregou — nada é enviado' };
  if (String(hojeISO).slice(8, 10) !== '01') return { enviar: false, motivo: 'só no dia 1' };
  if (cfg.relatorio_ativo !== true) return { enviar: false, motivo: 'relatório desligado em Ajustes' };
  if (!cfg.whatsapp_destinos?.length) return { enviar: false, motivo: 'nenhum número de WhatsApp cadastrado em Ajustes' };
  const alvo = cfg.relatorio_hora ?? 8;
  if (hora < alvo) return { enviar: false, motivo: `aguardando as ${alvo}h` };
  const mes = mesAnterior(String(hojeISO).slice(0, 7));
  if (ultimoMes === mes) return { enviar: false, motivo: 'já enviado neste mês' };
  return { enviar: true, mes };
}

/** Gera o mês anterior e manda pela fila do Comunicar. Investimento de demonstração nunca vai por WhatsApp. */
async function enviarMesAnterior({ hojeISO, cfg, deps = {} } = {}) {
  const mes = mesAnterior(String(hojeISO).slice(0, 7));
  const r = await (deps.gerar || gerar)({ mes, hojeISO });
  if (!r.ok) return { enviado: false, mes, motivo: r.erro };
  if (r.demo && process.env.ADS_DEMO_ENVIA !== '1') return { enviado: false, mes, motivo: 'investimento de demonstração não vai por WhatsApp' };
  const envio = await (deps.enviar || ((d, t, o) => require('./whatsapp').enviarParaTodos(d, t, o)))(cfg.whatsapp_destinos, r.texto, { chave: `ads:fechamento:${r.periodo.mes}:${r.periodo.ate}` });
  return { enviado: envio.some(e => e.ok), mes, envio, motivo: envio.some(e => e.ok) ? null : (envio.find(e => e.erro)?.erro || 'envio falhou') };
}

module.exports = { linhasCSV, CAMPOS_CSV, decidirEnvioMensal, enviarMesAnterior, periodoDoMes, mesAnterior, consolidar, veredito, texto, gerar };
