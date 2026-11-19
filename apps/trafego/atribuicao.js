/* ============================================================
   Atribuição — liga o dinheiro das plataformas ao que o CRM viu.
   Coorte de aquisição: leads CRIADOS no período, com o status de hoje.
   Funil: lead → conversa no WhatsApp → agendamento → compareceu → venda.
   Nenhuma identidade de cliente sai deste módulo (só contagens e somas).
   ============================================================ */
'use strict';

const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const numero = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const dividir = (a, b) => (b > 0 && a != null ? a / b : null);

/* Agendamento cancelado não conta como agendamento; "compareceu" é quem
   pisou na oficina (inclusive quem não fechou). */
const AG_VALIDO = new Set(['aguardando', 'confirmado', 'em_atendimento', 'compareceu', 'nao_veio', 'concluido', 'nao_fechou']);
const AG_VEIO = new Set(['em_atendimento', 'compareceu', 'concluido', 'nao_fechou']);

/** Canal pago do lead: a origem do CRM manda; a UTM só completa. */
function canal(l) {
  const origem = normalizar(l.origem), fonte = normalizar(l.utm_source);
  if (origem === 'meta' || origem === 'google') return origem;
  if (['facebook', 'instagram', 'fb', 'ig', 'meta'].includes(fonte)) return 'meta';
  if (['google', 'googleads', 'google_ads', 'adwords'].includes(fonte)
    && ['cpc', 'ppc', 'paid', 'paid_search', 'pmax'].includes(normalizar(l.utm_medium))) return 'google';
  return null;
}
const campanha = l => normalizar(l.utm_campaign);

const ZERO = () => ({ gasto: 0, leads: 0, conversas: 0, agendamentos: 0, compareceram: 0, fechados: 0,
  receita: 0, perdidos: 0, abertos: 0, sem_valor: 0, valor_agendado_sem_pago: 0 });
const SOMAVEIS = Object.keys(ZERO());

/**
 * Derivadas de um grupo. Venda sem valor_pago NÃO vira R$ 0 de receita:
 * se nenhuma venda tem valor, receita/ROAS/ticket/ROI ficam null e o grupo
 * vem marcado `receita_desconhecida`; se só parte tem, `receita_parcial`.
 */
function calcular(g, margem) {
  // Sem investimento no grupo (ex.: leads sem UTM), custo é “—”, não R$ 0.
  const gasto = g.gasto > 0 ? g.gasto : null;
  const comValor = g.fechados - g.sem_valor;
  const desconhecida = g.fechados > 0 && comValor === 0;
  const receita = desconhecida ? null : g.receita;
  return {
    ...g,
    receita,
    receita_desconhecida: desconhecida,
    receita_parcial: g.sem_valor > 0 && comValor > 0,
    cpl: dividir(gasto, g.leads),
    custo_agendamento: dividir(gasto, g.agendamentos),
    custo_venda: dividir(gasto, g.fechados),
    roas_real: receita == null ? null : dividir(receita, g.gasto),
    roi: receita == null || !(g.gasto > 0) ? null : ((receita * numero(margem)) / 100 - g.gasto) / g.gasto * 100,
    conversao: dividir(g.fechados * 100, g.leads),
    tx_agendamento: dividir(g.agendamentos * 100, g.leads),
    tx_comparecimento: dividir(g.compareceram * 100, g.agendamentos),
    ticket: receita == null ? null : dividir(receita, comValor),
  };
}

function somar(lista, margem) {
  const t = ZERO();
  for (const g of lista) for (const k of SOMAVEIS) t[k] += g[k] || 0;
  return calcular(t, margem);
}

/**
 * @param leads          linhas de `leads` (id, cliente_id, origem, status, valor_pago, utm_*)
 * @param metricas       linhas de ads_metricas_dia no nível campanha
 * @param agendamentos   linhas de `agendamentos` (lead_id, status, valor) dos leads da coorte
 * @param clientesComConversa  Set de cliente_id que têm conversa no Atendimento
 */
function consolidar({ leads = [], metricas = [], agendamentos = [], clientesComConversa = new Set(),
  margem = 100, plataforma = null, cpaAlvo = null } = {}) {
  const grupos = new Map(), vistos = new Set();
  // Chave normalizada (casa UTM com campanha); nome exibido = o primeiro original visto.
  const grupo = (c, nome, original) => {
    const chave = JSON.stringify([c, nome]);
    if (!grupos.has(chave)) grupos.set(chave, { canal: c, campanha: nome ? String(original || nome).trim().slice(0, 120) : '(sem UTM)', sem_utm: !nome, ...ZERO() });
    return grupos.get(chave);
  };
  for (const m of metricas) {
    if (!['meta', 'google'].includes(m.plataforma) || (plataforma && plataforma !== m.plataforma)) continue;
    grupo(m.plataforma, normalizar(m.campanha_nome || m.entidade_nome), m.campanha_nome || m.entidade_nome).gasto += numero(m.gasto);
  }

  // Agendamentos por lead: o melhor estado vence (veio > agendou).
  const agPorLead = new Map();
  for (const a of agendamentos) {
    if (!a?.lead_id || !AG_VALIDO.has(a.status)) continue;
    const atual = agPorLead.get(a.lead_id) || { veio: false, valor: 0 };
    atual.veio = atual.veio || AG_VEIO.has(a.status);
    if (a.status === 'concluido') atual.valor = Math.max(atual.valor, numero(a.valor));
    agPorLead.set(a.lead_id, atual);
  }

  let naoAtribuidos = 0;
  const canaisComUtm = new Set();
  for (const l of leads) {
    if (l.id && vistos.has(l.id)) continue;
    if (l.id) vistos.add(l.id);
    const c = canal(l);
    if (!c) { naoAtribuidos++; continue; }
    if (plataforma && c !== plataforma) continue;
    if (campanha(l)) canaisComUtm.add(c);
    const g = grupo(c, campanha(l), l.utm_campaign);
    g.leads++;
    if (l.cliente_id && clientesComConversa.has(l.cliente_id)) g.conversas++;
    const ag = agPorLead.get(l.id);
    if (ag) { g.agendamentos++; if (ag.veio) g.compareceram++; }
    if (l.status === 'concluido') {
      g.fechados++;
      const pago = numero(l.valor_pago);
      g.receita += pago;
      if (!pago) { g.sem_valor++; g.valor_agendado_sem_pago += ag?.valor || 0; }
    } else if (l.status === 'perdido') g.perdidos++;
    else g.abertos++;
  }

  const campanhas = [...grupos.values()].map(g => calcular(g, margem))
    .sort((a, b) => b.gasto - a.gasto || b.leads - a.leads || a.campanha.localeCompare(b.campanha));
  const canais = ['meta', 'google'].filter(c => !plataforma || c === plataforma)
    .map(c => ({ canal: c, campanha: 'todas', ...somar(campanhas.filter(g => g.canal === c), margem) }));
  const total = somar(campanhas, margem);

  const alertas = [];
  for (const c of canais) {
    const semUtm = campanhas.find(g => g.canal === c.canal && g.sem_utm);
    if (semUtm?.leads && !canaisComUtm.has(c.canal)) {
      alertas.push({ tipo: 'sem_utm', canal: c.canal, campanha: '(todas)',
        texto: `${semUtm.leads} lead(s) chegaram sem utm_campaign: dá para ver o canal, não a campanha. Coloque a UTM nos anúncios.` });
    }
  }
  for (const g of campanhas) {
    if (g.sem_utm) continue;
    // Só acusa "sem lead" quando o canal já usa UTM; se nenhum lead do canal
    // tem UTM, o aviso certo é o de cima (senão toda campanha acenderia).
    if (g.gasto >= 150 && !g.leads && (canaisComUtm.has(g.canal) || !campanhas.some(x => x.canal === g.canal && x.leads))) {
      alertas.push({ tipo: 'sem_lead', canal: g.canal, campanha: g.campanha, gasto: g.gasto,
        texto: `Gastou ${brl(g.gasto)} e nenhum lead apareceu no CRM. Confira a UTM e o formulário antes de mexer na campanha.` });
    }
    if (numero(cpaAlvo) && g.custo_agendamento != null && g.agendamentos >= 2 && g.custo_agendamento > numero(cpaAlvo)) {
      alertas.push({ tipo: 'custo_agendamento', canal: g.canal, campanha: g.campanha, valor: g.custo_agendamento,
        texto: `Custo por agendamento em ${brl(g.custo_agendamento)}, acima do CPA alvo de ${brl(numero(cpaAlvo))}.` });
    }
    if (numero(cpaAlvo) && g.custo_venda != null && g.fechados >= 3 && g.custo_venda > numero(cpaAlvo) * 2) {
      alertas.push({ tipo: 'custo_venda', canal: g.canal, campanha: g.campanha, valor: g.custo_venda,
        texto: `Custo por venda em ${brl(g.custo_venda)}, mais que o dobro do CPA alvo.` });
    }
  }
  if (total.sem_valor) {
    alertas.push({ tipo: 'sem_valor', canal: 'todos', campanha: '(todas)',
      texto: `${total.sem_valor} de ${total.fechados} venda(s) concluída(s) estão sem valor pago no CRM. A receita ${total.receita_desconhecida ? 'não pode ser calculada' : 'mostrada é parcial'}: lance o valor ao concluir.` });
  }

  return { campanhas, canais, total, nao_atribuidos: naoAtribuidos,
    sem_utm: campanhas.filter(g => g.sem_utm).reduce((n, g) => n + g.leads, 0), alertas };
}

function brl(v) {
  return v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* CSV com ponto e vírgula (Excel pt-BR), BOM e proteção contra fórmula. */
const CAMPOS_CSV = [
  ['canal', 'Canal'], ['campanha', 'Campanha'], ['gasto', 'Investido'], ['leads', 'Leads'],
  ['conversas', 'Conversas'], ['agendamentos', 'Agendamentos'], ['compareceram', 'Compareceram'],
  ['fechados', 'Vendas'], ['sem_valor', 'Vendas sem valor'], ['receita', 'Receita paga'],
  ['cpl', 'Custo por lead'], ['custo_agendamento', 'Custo por agendamento'], ['custo_venda', 'Custo por venda'],
  ['roas_real', 'ROAS real'], ['roi', 'ROI com margem (%)'], ['conversao', 'Conversão (%)'], ['ticket', 'Ticket'],
];
function celula(v) {
  let s;
  if (v == null) s = '';
  else if (typeof v === 'number') s = (Math.round(v * 100) / 100).toString().replace('.', ',');
  else s = String(v).replace(/^[=+@\-\t\r]/, "'$&");
  return '"' + s.replace(/"/g, '""') + '"';
}
/** CSV genérico: campos = [[chave, título]], linhas = objetos. */
function montarCSV(campos, linhas) {
  const tabela = [campos.map(([, t]) => t), ...linhas.map(x => campos.map(([k]) => x[k]))];
  return '\uFEFF' + tabela.map(l => l.map(celula).join(';')).join('\r\n') + '\r\n';
}
function csv(resultado) {
  const linhas = [...resultado.campanhas, ...resultado.canais.map(c => ({ ...c, campanha: 'TOTAL DO CANAL' }))]
    .map(g => (g.receita_desconhecida ? { ...g, receita: 'sem valor lançado' } : g));
  return montarCSV(CAMPOS_CSV, linhas);
}

function comparar(atual, anterior) {
  const saida = {};
  for (const k of ['gasto', 'leads', 'agendamentos', 'fechados', 'receita', 'cpl', 'custo_agendamento', 'custo_venda', 'roas_real', 'roi']) {
    const a = atual[k], b = anterior[k];
    saida[k] = { atual: a, anterior: b, variacao: a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null };
  }
  return saida;
}

/** Funil em etapas para a tela (com a taxa de passagem de uma etapa à outra).
    Conversa no WhatsApp fica FORA da escada: no CRM real muito lead agenda
    por telefone sem conversa registrada, e “3900% da etapa anterior” mente. */
function funil(t) {
  const etapas = [
    ['leads', 'Leads no CRM', t.leads],
    ['agendamentos', 'Agendaram', t.agendamentos],
    ['compareceram', 'Vieram à oficina', t.compareceram],
    ['fechados', 'Venda fechada', t.fechados],
  ];
  return etapas.map(([chave, rotulo, valor], i) => ({
    chave, rotulo, valor,
    // Venda sem agendamento registrado pode passar da etapa anterior: aí não há taxa honesta.
    taxa: i === 0 || valor > etapas[i - 1][2] ? null : dividir(valor * 100, etapas[i - 1][2]),
    do_topo: dividir(valor * 100, t.leads),
  }));
}

/**
 * Resultado dos leads de anúncio por responsável (leads.responsavel_id):
 * quanto cada vendedor agenda e fecha do que o tráfego trouxe.
 * Só contagens: nenhum dado de cliente sai daqui.
 */
function porResponsavel({ leads = [], agendamentos = [], plataforma = null } = {}) {
  const agPorLead = new Map();
  for (const a of agendamentos) {
    if (!a?.lead_id || !AG_VALIDO.has(a.status)) continue;
    const atual = agPorLead.get(a.lead_id) || { veio: false };
    atual.veio = atual.veio || AG_VEIO.has(a.status);
    agPorLead.set(a.lead_id, atual);
  }
  const grupos = new Map(), vistos = new Set();
  for (const l of leads) {
    if (l.id && vistos.has(l.id)) continue;
    if (l.id) vistos.add(l.id);
    const c = canal(l);
    if (!c || (plataforma && c !== plataforma)) continue;
    const chave = l.responsavel_id || null;
    if (!grupos.has(chave)) grupos.set(chave, { responsavel_id: chave, leads: 0, agendamentos: 0, compareceram: 0, fechados: 0, perdidos: 0, abertos: 0, receita: 0, sem_valor: 0, meta: 0, google: 0 });
    const g = grupos.get(chave);
    g.leads++; g[c]++;
    const ag = agPorLead.get(l.id);
    if (ag) { g.agendamentos++; if (ag.veio) g.compareceram++; }
    if (l.status === 'concluido') {
      g.fechados++;
      const pago = numero(l.valor_pago);
      g.receita += pago; if (!pago) g.sem_valor++;
    } else if (l.status === 'perdido') g.perdidos++;
    else g.abertos++;
  }
  return [...grupos.values()].map(g => ({
    ...g,
    receita: g.fechados > 0 && g.sem_valor === g.fechados ? null : g.receita,
    tx_agendamento: dividir(g.agendamentos * 100, g.leads),
    conversao: dividir(g.fechados * 100, g.leads),
    tx_perda: dividir(g.perdidos * 100, g.leads),
  })).sort((a, b) => (a.responsavel_id === null) - (b.responsavel_id === null) || b.fechados - a.fechados || b.leads - a.leads);
}

/**
 * Rodada 5 — fecha o ciclo na aba Campanhas: cada campanha do ranking (plataforma)
 * ganha o que o CRM viu dela (leads, agendamentos, vendas, receita e custos reais),
 * casando pelo nome normalizado da campanha = utm_campaign.
 * Pura: recebe o ranking e o resultado de consolidar(); devolve o ranking enriquecido.
 */
function oficinaDe(resultado, r) {
  const g = (resultado?.ciclo?.campanhas || []).find(c => c.canal === r.plataforma && !c.sem_utm && normalizar(c.campanha) === normalizar(r.nome));
  return g && (g.orcados || g.na_oficina) ? { orcados: g.orcados, na_oficina: g.na_oficina, entregues: g.entregues, custo_carro: g.custo_carro_na_oficina } : null;
}

function juntarRankingComCRM(ranking = [], resultado = null) {
  const mapa = new Map();
  for (const g of resultado?.campanhas || []) if (!g.sem_utm) mapa.set(`${g.canal}|${normalizar(g.campanha)}`, g);
  const semUtm = {};
  for (const g of resultado?.campanhas || []) if (g.sem_utm) semUtm[g.canal] = g.leads;
  return ranking.map(r => {
    const achado = mapa.get(`${r.plataforma}|${normalizar(r.nome)}`);
    // Grupo só com gasto (nenhum lead casou) não é "resultado do CRM": a tela explica em vez de mostrar zeros.
    const g = achado && achado.leads > 0 ? achado : null;
    return {
      ...r,
      crm: g ? {
        leads: g.leads, agendamentos: g.agendamentos, compareceram: g.compareceram, fechados: g.fechados,
        receita: g.receita, receita_desconhecida: g.receita_desconhecida, receita_parcial: g.receita_parcial,
        cpl: dividir(r.gasto > 0 ? r.gasto : null, g.leads), custo_agendamento: dividir(r.gasto > 0 ? r.gasto : null, g.agendamentos),
        custo_venda: dividir(r.gasto > 0 ? r.gasto : null, g.fechados), roas_real: g.receita == null ? null : dividir(g.receita, r.gasto),
      } : null,
      // Rodada 6: carros que chegaram à oficina vindos desta campanha (ciclo.js), para a aba Campanhas.
      oficina: oficinaDe(resultado, r),
      // Sem UTM casando, a tela explica em vez de mostrar zero.
      crm_motivo: g ? null : semUtm[r.plataforma] ? `${semUtm[r.plataforma]} lead(s) do canal sem utm_campaign` : 'nenhum lead com esta UTM no período',
    };
  });
}

module.exports = { juntarRankingComCRM, porResponsavel, normalizar, canal, consolidar, comparar, csv, montarCSV, celula, funil, calcular, AG_VALIDO, AG_VEIO };
