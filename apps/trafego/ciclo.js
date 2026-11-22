/* ============================================================
   Ciclo — do anúncio ao carro entregue (rodada 6, 21/10/2026).
   Liga o lead do CRM ao que aconteceu depois nos outros sistemas:
     anúncio -> lead (CRM) -> orçamento (Orçador, orc_orcamentos.lead_id)
             -> carro na oficina (Pátio, patio_os) -> extras aprovados
             -> valor pago (leads.valor_pago).
   Só números e ids: nenhum nome/telefone sai daqui, e quem lê já passou
   pelo porteiro do Ads. Tudo é puro e testável; as leituras do banco
   recebem `sb` por injeção e, se falharem, o resto do app segue sem o ciclo.
   ============================================================ */
'use strict';

const db = require('./db');
const A = require('./atribuicao');
const Eco = require('./public/ecossistema.js');

const numero = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const dividir = (a, b) => (b > 0 && a != null ? a / b : null);
const HORA = 3600000;
/* Limiares dos avisos (horas), ajustáveis por variável de ambiente sem mexer no código. */
const H_ORC = Number(process.env.ADS_ORC_ESPERA_H) > 0 ? Number(process.env.ADS_ORC_ESPERA_H) : 48;
const H_PRONTO = Number(process.env.ADS_PRONTO_PARADO_H) > 0 ? Number(process.env.ADS_PRONTO_PARADO_H) : 24;

/* Prioridade do estado de um orçamento (o melhor da lista é o que conta para o lead). */
const PESO_ORC = { aprovado: 5, enviado: 4, aberto: 3, recusado: 2, expirado: 1 };
const NOME_ORC = { aprovado: 'Aprovado', enviado: 'Enviado', aberto: 'Aberto', recusado: 'Recusado', expirado: 'Expirado' };
/* Etapas do Pátio (mesmos ids de patio_os.etapa). */
const NOME_ETAPA = { recebido: 'Recebido', diagnostico: 'Diagnóstico', aguardando_aprovacao: 'Aguardando aprovação', aguardando_peca: 'Aguardando peça',
  em_execucao: 'Em execução', teste: 'Teste', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
const MOTIVO_NOME = { preco: 'preço', prazo: 'prazo', desistiu: 'desistiu', outro_lugar: 'foi para outro lugar', sem_urgencia: 'sem urgência', outro: 'outro motivo' };

const emPatio = os => !['entregue', 'cancelado'].includes(os.etapa);

/* ---------------- leitura ---------------- */

/* Rodada 8: os lotes andam ao mesmo tempo (a jornada lê centenas de contatos de uma vez; um lote por vez somava segundos). */
async function emLotes(ids, fn, tamanho = 150) {
  const unicos = [...new Set((ids || []).filter(Boolean))], partes = [];
  for (let i = 0; i < unicos.length; i += tamanho) partes.push(unicos.slice(i, i + tamanho));
  return (await Promise.all(partes.map(fn))).flat();
}

const COLS_ORC ='id, numero, lead_id, agendamento_id, status, total, total_a_vista, total_aprovado, rascunho, enviado_em, visualizado_em, decidido_em, motivo_cod, validade, follow_up_em, follow_ups, ultimo_follow_up_em, desconto_pedido_em, desconto_aprovado_em, horario_pedido, created_at';
/* Rodada 8: orcamento_total (o total que o Pátio guardou na OS) entra como fonte do valor do serviço na jornada. */
const COLS_OS = 'id, numero, lead_id, orcamento_id, agendamento_id, etapa, etapa_em, entregue_em, created_at, token_publico, orcamento_total, orcamento_total_a_vista';

/** Orçamentos ligados aos leads (orc_orcamentos.lead_id). Rascunho não conta. */
async function lerOrcamentos(leadIds, { sb = db.sb } = {}) {
  return emLotes(leadIds, async lote => {
    const { data, error } = await sb.from('orc_orcamentos').select(COLS_ORC).in('lead_id', lote).or('rascunho.is.null,rascunho.eq.false');
    if (error) throw new Error('orcamentos: ' + error.message);
    return data || [];
  });
}

/** Rodada 7: orçamentos que o Orçador ligou só ao AGENDAMENTO do lead (sem lead_id). Rascunho não conta. */
async function lerOrcamentosPorAgendamento(agIds, { sb = db.sb } = {}) {
  return emLotes(agIds, async lote => {
    const { data, error } = await sb.from('orc_orcamentos').select(COLS_ORC).in('agendamento_id', lote).or('rascunho.is.null,rascunho.eq.false');
    if (error) throw new Error('orcamentos (agendamento): ' + error.message);
    return data || [];
  });
}

/** OS do Pátio dos leads: pelo lead_id, pelos orçamentos de origem e pelos agendamentos. */
async function lerOS({ leadIds = [], orcIds = [], agIds = [] }, { sb = db.sb } = {}) {
  const buscas = [
    [leadIds, 'lead_id'], [orcIds, 'orcamento_id'], [agIds, 'agendamento_id'],
  ];
  const mapa = new Map();
  // Rodada 8: os três caminhos ao mesmo tempo; a ordem do resultado continua a mesma (lead, orçamento, agendamento).
  const achadas = await Promise.all(buscas.map(([ids, coluna]) => emLotes(ids, async lote => {
    const { data, error } = await sb.from('patio_os').select(COLS_OS).in(coluna, lote);
    if (error) throw new Error('patio_os: ' + error.message);
    return data || [];
  })));
  for (const linhas of achadas) for (const o of linhas) mapa.set(o.id, o);
  return [...mapa.values()];
}

/** OS de uma coluna só (lead_id, orcamento_id ou agendamento_id), em lotes ao mesmo tempo. */
function lerOSPor(coluna, ids, { sb = db.sb } = {}) {
  return emLotes(ids, async lote => {
    const { data, error } = await sb.from('patio_os').select(COLS_OS).in(coluna, lote);
    if (error) throw new Error('patio_os: ' + error.message);
    return data || [];
  });
}
/** Junta as OS achadas por caminhos diferentes, na ordem dos caminhos; a mesma OS fica com a última leitura (como lerOS). */
function unirOS(...listas) {
  const mapa = new Map();
  for (const l of listas) for (const o of l || []) mapa.set(o.id, o);
  return [...mapa.values()];
}

/** Extras do pátio (só valor e estado) das OS. */
async function lerExtras(osIds, { sb = db.sb } = {}) {
  return emLotes(osIds, async lote => {
    const { data, error } = await sb.from('patio_extras').select('os_id, valor, status').in('os_id', lote);
    if (error) throw new Error('patio_extras: ' + error.message);
    return data || [];
  });
}

/** Agendamentos dos leads — para achar o lead de uma OS que só tem agendamento_id e, na rodada 8, para as etapas
 *  "agendou" e "veio" da jornada (data, hora, estado e valor; sem nome nem telefone). */
async function lerAgendamentosLeve(leadIds, { sb = db.sb } = {}) {
  return emLotes(leadIds, async lote => {
    const { data, error } = await sb.from('agendamentos').select('id, lead_id, data, hora, inicio_em, status, valor, created_at').in('lead_id', lote);
    if (error) throw new Error('agendamentos: ' + error.message);
    return data || [];
  });
}

/**
 * Tudo do ciclo de uma lista de leads: orçamentos, OS e extras já ligados a cada lead.
 * Devolve { porLead: Map, ok, erro } — falha de leitura não derruba quem chamou.
 */
/* Falhas que costumam passar sozinhas (rede, gateway): a leitura tenta de novo uma vez. */
const TRANSITORIO = /fetch failed|network|timeout|timed out|econn|enotfound|socket|50[234]|bad gateway|unavailable/i;

async function ler(leadIds, { sb = db.sb, limiteMs = 9000, esperaRetryMs = 400 } = {}) {
  let t;
  const comRetry = async () => {
    const r = await lerTudo(leadIds, { sb });
    if (r.ok || !TRANSITORIO.test(r.erro || '')) return r;
    await new Promise(x => setTimeout(x, esperaRetryMs));
    return { ...(await lerTudo(leadIds, { sb })), tentativas: 2 };
  };
  try {
    return await Promise.race([comRetry(), new Promise((_, rej) => { t = setTimeout(() => rej(new Error('o Orçador/Pátio demoraram mais de ' + Math.round(limiteMs / 1000) + ' s')), limiteMs); })]);
  } catch (e) {
    return { porLead: new Map(), orcamentos: [], os: [], extras: [], agendamentos: [], ok: false, erro: String(e.message || e) };
  } finally { clearTimeout(t); }
}

async function lerTudo(leadIds, { sb = db.sb } = {}) {
  try {
    const ids = [...new Set((leadIds || []).filter(Boolean))];
    if (!ids.length) return { porLead: new Map(), orcamentos: [], os: [], extras: [], agendamentos: [], ok: true, erro: null };
    /* R13C (Tráfego lento): as leituras que não dependem umas das outras saem juntas. Antes eram 4 idas em fila
       (orçamentos+agendamentos → orçamentos do agendamento → OS → extras); agora 3 (4 só quando um orçamento ligado
       apenas ao agendamento tem OS). O resultado é o mesmo: as mesmas OS (lead, orçamento, agendamento) e os mesmos extras. */
    const patio = { erro: null };
    const doPatio = p => p.catch(e => { if (!patio.erro) patio.erro = e; return []; });
    const osPor = (coluna, lista) => doPatio(lerOSPor(coluna, lista, { sb }));
    const extrasDe = lista => doPatio(lerExtras(lista.map(o => o.id), { sb }));
    const [porLeadId, ags, osLead] = await Promise.all([lerOrcamentos(ids, { sb }), lerAgendamentosLeve(ids, { sb }), osPor('lead_id', ids)]);
    const agIds = ags.map(a => a.id);
    // Rodada 7: o Orçador grava lead_id, mas o orçamento feito a partir da Agenda só tem agendamento_id: os dois caminhos contam, sem duplicar.
    const [porAg, osAg, osOrcLead, extrasLead] = await Promise.all([
      lerOrcamentosPorAgendamento(agIds, { sb }).catch(() => []),
      osPor('agendamento_id', agIds),
      osPor('orcamento_id', porLeadId.map(o => o.id)),
      extrasDe(osLead),
    ]);
    const orcamentos = unirOrcamentos(porLeadId, porAg);
    const doLead = new Set(porLeadId.map(o => o.id));
    const lidas = new Set(osLead.map(o => o.id));
    const novas = unirOS(osOrcLead, osAg).filter(o => !lidas.has(o.id));
    novas.forEach(o => lidas.add(o.id));
    const [osOrcAg, extrasNovas] = await Promise.all([osPor('orcamento_id', porAg.filter(o => !doLead.has(o.id)).map(o => o.id)), extrasDe(novas)]);
    // Rodada 7: se só o Pátio falhar, os orçamentos continuam valendo (ok: true) e a tela avisa que os carros ficaram de fora.
    let os = [], extras = [], parcial = null;
    try {
      const ultimas = osOrcAg.filter(o => !lidas.has(o.id));
      const extrasUltimas = await extrasDe(ultimas);
      if (patio.erro) throw patio.erro;
      os = unirOS(osLead, osOrcLead, osOrcAg, osAg);
      extras = [...extrasLead, ...extrasNovas, ...extrasUltimas];
    } catch (e) { os = []; extras = []; parcial = { fonte: 'patio', erro: String(e.message || e) }; }
    return { porLead: ligar({ leadIds: ids, orcamentos, os, extras, agendamentos: ags }), orcamentos, os, extras, agendamentos: ags, ok: true, erro: null, parcial: parcial ? parcial.fonte : null, erro_parcial: parcial ? parcial.erro : null };
  } catch (e) {
    return { porLead: new Map(), orcamentos: [], os: [], extras: [], agendamentos: [], ok: false, erro: String(e.message || e) };
  }
}

/* ---------------- ligação (pura) ---------------- */

/** Junta orçamentos achados por caminhos diferentes; o mesmo id nunca entra duas vezes (o do lead_id vem primeiro). */
function unirOrcamentos(...listas) {
  const mapa = new Map();
  for (const l of listas) for (const o of l || []) if (o?.id && !mapa.has(o.id)) mapa.set(o.id, o);
  return [...mapa.values()];
}

/**
 * Cada orçamento/OS/extras vai para o lead certo.
 * OS: lead_id da OS, senão o lead do orçamento de origem, senão o lead do agendamento.
 * Devolve Map(leadId -> { orcamentos:[...], os:[...], extras:{aprovado,pendente,recusado} }).
 */
function ligar({ leadIds = [], orcamentos = [], os = [], extras = [], agendamentos = [] } = {}) {
  const lista = new Set(leadIds);
  const porLead = new Map();
  const de = id => {
    if (!porLead.has(id)) porLead.set(id, { orcamentos: [], os: [], extras: { aprovado: 0, pendente: 0, recusado: 0, qtd_aprovado: 0 } });
    return porLead.get(id);
  };
  const orcPorId = new Map(orcamentos.map(o => [o.id, o]));
  const agPorId = new Map(agendamentos.map(a => [a.id, a]));

  const leadDoOrc = o => (o.lead_id && lista.has(o.lead_id) ? o.lead_id : (agPorId.get(o.agendamento_id)?.lead_id || null));
  for (const o of orcamentos) {
    if (!o?.id || o.rascunho === true) continue;
    // lead_id do Orçador; sem ele, o lead do agendamento (rodada 7). O mesmo orçamento não entra duas vezes.
    const alvoLead = leadDoOrc(o);
    if (!alvoLead || !lista.has(alvoLead)) continue;
    const dest = de(alvoLead);
    if (dest.orcamentos.some(x => x.id === o.id)) continue;
    dest.orcamentos.push(o.lead_id === alvoLead ? o : { ...o, ligado_por: 'agendamento' });
  }
  const vistas = new Set();
  const extrasPorOS = new Map();
  for (const x of extras) { if (!extrasPorOS.has(x.os_id)) extrasPorOS.set(x.os_id, []); extrasPorOS.get(x.os_id).push(x); }
  for (const o of os) {
    if (!o?.id || vistas.has(o.id)) continue;
    const orcOrigem = orcPorId.get(o.orcamento_id);
    const lead = o.lead_id || (orcOrigem && leadDoOrc(orcOrigem)) || agPorId.get(o.agendamento_id)?.lead_id || null;
    if (!lead || !lista.has(lead)) continue;
    vistas.add(o.id);
    const alvo = de(lead);
    alvo.os.push(o);
    for (const x of extrasPorOS.get(o.id) || []) {
      const v = numero(x.valor);
      if (x.status === 'aprovado') { alvo.extras.aprovado += v; alvo.extras.qtd_aprovado++; }
      else if (x.status === 'pendente') alvo.extras.pendente += v;
      else if (x.status === 'recusado') alvo.extras.recusado += v;
    }
  }
  return porLead;
}

/** O melhor orçamento do lead (aprovado > enviado > aberto > recusado > expirado; empate: o mais recente). */
function melhorOrcamento(orcs = []) {
  return [...orcs].sort((a, b) => (PESO_ORC[b.status] || 0) - (PESO_ORC[a.status] || 0)
    || String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
}
/** A OS mais relevante: a que ainda está no pátio, senão a mais recente. */
function osPrincipal(lista = []) {
  const validas = lista.filter(o => o.etapa !== 'cancelado');
  const base = validas.length ? validas : lista;
  return [...base].sort((a, b) => (emPatio(b) - emPatio(a)) || String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
}

/** Resumo de UM lead para a linha da aba Leads (só o que a tela precisa, com links). */
function resumoDoLead(lig, agora = Date.now()) {
  if (!lig) return null;
  const orc = melhorOrcamento(lig.orcamentos), os = osPrincipal(lig.os);
  if (!orc && !os) return null;
  const parado = orc && orc.status === 'enviado' && orc.enviado_em ? Math.floor((agora - Date.parse(orc.enviado_em)) / HORA) : null;
  return {
    orcamento: orc ? {
      id: orc.id, numero: orc.numero ?? null, status: orc.status, status_nome: NOME_ORC[orc.status] || orc.status,
      total: orc.total == null ? null : numero(orc.total), qtd: lig.orcamentos.length,
      esperando_horas: parado != null && parado >= 0 ? parado : null,
      visto: !!orc.visualizado_em, link: Eco.linkOrcamento(orc.id),
      // Rodada 7: o que o consultor precisa saber antes de ligar.
      quente: orc.status === 'enviado' && !!orc.visualizado_em,
      visto_horas: orc.visualizado_em ? Math.max(0, Math.floor((agora - Date.parse(orc.visualizado_em)) / HORA)) : null,
      desconto_pedido: ['enviado', 'aberto'].includes(orc.status) && !!orc.desconto_pedido_em && !orc.desconto_aprovado_em,
      follow_vencido: orc.status === 'enviado' && !!orc.follow_up_em && Date.parse(orc.follow_up_em) < agora,
      pediu_horario: orc.status === 'aprovado' && temValor(orc.horario_pedido) && !lig.os.some(o => o.etapa !== 'cancelado'),
      valor_aprovado: orc.status === 'aprovado' ? valorAprovado(orc) : null,
    } : null,
    os: os ? {
      id: os.id, numero: os.numero ?? null, etapa: os.etapa, etapa_nome: NOME_ETAPA[os.etapa] || os.etapa,
      no_patio: emPatio(os), entregue: os.etapa === 'entregue', link: Eco.linkOS(os.id),
      link_cliente: os.token_publico ? Eco.linkAcompanhar(os.token_publico) : null,
      pronto_horas: os.etapa === 'pronto' && os.etapa_em ? Math.max(0, Math.floor((agora - Date.parse(os.etapa_em)) / HORA)) : null,
    } : null,
    extras_aprovados: lig.extras.aprovado || 0,
    extras_pendentes: lig.extras.pendente || 0,
  };
}

/* ---------------- rodada 7: itens com links e classificação de orçamentos ---------------- */

const H_NAO_ABERTO = Number(process.env.ADS_ORC_NAO_ABERTO_H) > 0 ? Number(process.env.ADS_ORC_NAO_ABERTO_H) : 24;
const H_QUENTE = Number(process.env.ADS_ORC_QUENTE_H) > 0 ? Number(process.env.ADS_ORC_QUENTE_H) : 2;
const H_LEAD_PARADO = Number(process.env.ADS_LEAD_PARADO_H) > 0 ? Number(process.env.ADS_LEAD_PARADO_H) : 24;

const STATUS_LEAD_NOME = { novo: 'Novo', contato: 'Em contato', orcamento: 'Em orçamento', agendado: 'Agendado', em_servico: 'Em serviço', concluido: 'Venda fechada', perdido: 'Perdido' };
const horasEntre = (de, ate) => {
  const a = Date.parse(de), b = Date.parse(ate);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / HORA : null;
};
/** Valor que o cliente de fato aprovou (com o desconto à vista, quando o Orçador gravou); senão o total do orçamento. */
function valorAprovado(orc) { return numero(orc?.total_aprovado) > 0 ? numero(orc.total_aprovado) : numero(orc?.total); }
const temValor = v => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

/**
 * Um item de ação: quem é, quanto vale e para onde ir (CRM, conversa, Agenda, orçamento, OS).
 * Telefone sai no formato 55DDD; a tela é de gestor.
 */
function itemDoLead(l, extra = {}) {
  const tel = Eco.telefone(l.telefone) || null;
  const item = {
    lead_id: l.id, nome: l.nome || '(sem nome)', telefone: tel, canal: A.canal(l), campanha: l.utm_campaign ? String(l.utm_campaign).slice(0, 80) : null,
    status_nome: STATUS_LEAD_NOME[l.status] || l.status || null, sem_responsavel: !l.responsavel_id,
    carro: l.carro_modelo || null, placa: l.placa ? String(l.placa).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : null, ...extra,
  };
  item.links = {
    crm: Eco.linkLead(l.id),
    conversa: Eco.linkConversaTel(tel),
    agenda: Eco.linkAgendaTel(tel),
    orcamento: item.orcamento_id ? Eco.linkOrcamento(item.orcamento_id) : null,
    os: item.os_id ? Eco.linkOS(item.os_id) : null,
    orcar: Eco.linkOrcadorTel(tel, l.nome, l.cliente_id, l.id),
  };
  return item;
}

/** Lead de anúncio parado e lead agendado sem orçamento. */
function semOrcamentoDoLead(l, orc, R7, agora, item) {
  const idade = horasEntre(l.created_at, new Date(agora).toISOString());
  if (l.status === 'novo' && idade != null && idade > H_LEAD_PARADO) R7.lead_parado.push(item(l, { horas: Math.floor(idade), valor: numero(l.valor_orcado) }));
  if (!orc && ['agendado', 'em_servico', 'orcamento'].includes(l.status)) R7.sem_orcamento.push(item(l, { horas: idade != null ? Math.floor(idade) : null, valor: numero(l.valor_orcado) }));
}

/** Estados do orçamento que pedem uma ação do consultor (puro, ligado ao relógio recebido). */
function classificarOrcamento(l, orc, lig, R7, agora, item) {
  const aberto = orc.status === 'enviado';
  const base = { orcamento_id: orc.id, valor: numero(orc.total) };
  const sinceEnvio = orc.enviado_em ? (agora - Date.parse(orc.enviado_em)) / HORA : null;
  if (aberto && !orc.visualizado_em && sinceEnvio != null && sinceEnvio > H_NAO_ABERTO) R7.nao_aberto.push(item(l, { ...base, horas: Math.floor(sinceEnvio) }));
  if (aberto && orc.visualizado_em) {
    const visto = (agora - Date.parse(orc.visualizado_em)) / HORA;
    // visto há pouco e ainda dentro do prazo de espera: é o melhor momento de ligar; depois disso vira "parado".
    if (visto >= H_QUENTE && visto <= H_ORC) R7.quente.push(item(l, { ...base, horas: Math.floor(visto) }));
  }
  if (aberto && orc.follow_up_em && Date.parse(orc.follow_up_em) < agora) R7.follow_vencido.push(item(l, { ...base, horas: Math.floor((agora - Date.parse(orc.follow_up_em)) / HORA) }));
  if (['enviado', 'aberto'].includes(orc.status) && orc.desconto_pedido_em && !orc.desconto_aprovado_em) R7.desconto.push(item(l, { ...base, horas: Math.floor((agora - Date.parse(orc.desconto_pedido_em)) / HORA) }));
  if (orc.status === 'aprovado' && temValor(orc.horario_pedido) && !lig.os.some(o => o.etapa !== 'cancelado')) R7.horario.push(item(l, { ...base, valor: valorAprovado(orc) }));
  if (aberto && orc.validade) {
    const fim = Date.parse(String(orc.validade).slice(0, 10) + 'T23:59:59-03:00');
    if (Number.isFinite(fim) && fim >= agora && fim - agora <= 48 * HORA) R7.validade.push(item(l, { ...base, horas: Math.floor((fim - agora) / HORA) }));
  }
}

/* ---------------- consolidação por campanha (pura) ---------------- */

const ARRAYS = ['dias_ate_oficina', 'horas_decisao', 'horas_ate_envio'];
const ZERO = () => ({ dias_ate_oficina: [], horas_decisao: [], horas_ate_envio: [], visualizados: 0, nao_abertos: 0, valor_recusado: 0, valor_em_aberto: 0, extras_recusados: 0, orcados: 0, orcamentos_enviados: 0, orcamentos_aprovados: 0, orcamentos_recusados: 0, valor_orcado: 0, valor_aprovado: 0,
  na_oficina: 0, no_patio_agora: 0, entregues: 0, extras_aprovados: 0, extras_pendentes: 0, receita_entregues: 0, entregues_sem_valor: 0 });
const SOMAVEIS = Object.keys(ZERO()).filter(k => !ARRAYS.includes(k));

/** Mediana de uma lista de números (null se vazia). */
function mediana(v) {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Soma o ciclo por campanha. `resultado` = A.consolidar(...) (gasto/leads/receita por campanha).
 * Devolve { campanhas: [{canal, campanha, ...ciclo, custos}], total, motivos, funil, alertas }.
 */
function consolidarCiclo({ leads = [], porLead = new Map(), resultado = null, agora = Date.now() } = {}) {
  const grupos = new Map(), motivos = {};
  const grupo = (l) => {
    const c = A.canal(l), nome = A.normalizar(l.utm_campaign);
    const chave = `${c}|${nome}`;
    if (!grupos.has(chave)) grupos.set(chave, { canal: c, campanha: nome ? String(l.utm_campaign).trim().slice(0, 120) : '(sem UTM)', sem_utm: !nome, ...ZERO() });
    return grupos.get(chave);
  };
  // Campanha que gastou e não trouxe lead também entra: o total de investimento tem de bater com o Resultados CRM.
  for (const c of resultado?.campanhas || []) {
    const chave = `${c.canal}|${A.normalizar(c.sem_utm ? '' : c.campanha)}`;
    if (!grupos.has(chave)) grupos.set(chave, { canal: c.canal, campanha: c.campanha, sem_utm: !!c.sem_utm, ...ZERO() });
  }
  const vistos = new Set();
  const esperando = [], prontosParados = [], aprovadoSemOS = [], semValorComOrc = [];
  const R7 = { nao_aberto: [], quente: [], follow_vencido: [], desconto: [], horario: [], validade: [], lead_parado: [], sem_orcamento: [] };
  const item = (l, extra = {}) => itemDoLead(l, extra);
  for (const l of leads) {
    if (l.id && vistos.has(l.id)) continue;
    if (l.id) vistos.add(l.id);
    if (!A.canal(l)) continue;
    const lig = porLead.get(l.id);
    if (!lig) {
      grupo(l);
      semOrcamentoDoLead(l, null, R7, agora, item);
      continue;
    }
    const g = grupo(l);
    const orc = melhorOrcamento(lig.orcamentos);
    semOrcamentoDoLead(l, orc, R7, agora, item);
    if (orc) {
      g.orcados++;
      const total = numero(orc.total);
      g.valor_orcado += total;
      if (['enviado', 'aprovado', 'recusado'].includes(orc.status)) g.orcamentos_enviados++;
      if (orc.visualizado_em && ['enviado', 'aprovado', 'recusado'].includes(orc.status)) g.visualizados++;
      if (orc.status === 'enviado' && !orc.visualizado_em) g.nao_abertos++;
      if (orc.status === 'enviado') g.valor_em_aberto += total;
      const hEnvio = horasEntre(l.created_at, orc.enviado_em);
      if (hEnvio != null) g.horas_ate_envio.push(hEnvio);
      const hDecisao = horasEntre(orc.enviado_em, orc.decidido_em);
      if (hDecisao != null && ['aprovado', 'recusado'].includes(orc.status)) g.horas_decisao.push(hDecisao);
      classificarOrcamento(l, orc, lig, R7, agora, item);
      if (orc.status === 'aprovado') { g.orcamentos_aprovados++; g.valor_aprovado += valorAprovado(orc); }
      if (orc.status === 'recusado') {
        g.valor_recusado += total;
        g.orcamentos_recusados++;
        const m = orc.motivo_cod || 'outro';
        motivos[m] = (motivos[m] || 0) + 1;
      }
      const horas = orc.status === 'enviado' && orc.enviado_em ? (agora - Date.parse(orc.enviado_em)) / HORA : null;
      if (horas != null && horas > H_ORC) esperando.push(item(l, { orcamento_id: orc.id, horas: Math.floor(horas), total, valor: total }));
      if (orc.status === 'aprovado' && !lig.os.some(o => o.etapa !== 'cancelado')
        && orc.decidido_em && (agora - Date.parse(orc.decidido_em)) / HORA > 72) aprovadoSemOS.push(item(l, { orcamento_id: orc.id, total, valor: total, horas: Math.floor((agora - Date.parse(orc.decidido_em)) / HORA) }));
    }
    const validas = lig.os.filter(o => o.etapa !== 'cancelado');
    if (validas.length) {
      g.na_oficina++;
      const primeira = Math.min(...validas.map(o => Date.parse(o.created_at)).filter(Number.isFinite));
      const criado = Date.parse(l.created_at);
      if (Number.isFinite(primeira) && Number.isFinite(criado) && primeira >= criado) g.dias_ate_oficina.push((primeira - criado) / 86400000);
      if (validas.some(emPatio)) g.no_patio_agora++;
      const entregue = validas.some(o => o.etapa === 'entregue');
      if (entregue) {
        g.entregues++;
        const pago = numero(l.valor_pago);
        g.receita_entregues += pago;
        if (!pago) { g.entregues_sem_valor++; if (orc && orc.status === 'aprovado') semValorComOrc.push(item(l, { orcamento_id: orc.id, os_id: validas.find(o => o.etapa === 'entregue')?.id, valor_sugerido: valorAprovado(orc) + (lig.extras.aprovado || 0), valor: valorAprovado(orc) + (lig.extras.aprovado || 0) })); }
      }
      for (const o of validas) if (o.etapa === 'pronto' && o.etapa_em && (agora - Date.parse(o.etapa_em)) / HORA > H_PRONTO) prontosParados.push(item(l, { os_id: o.id, horas: Math.floor((agora - Date.parse(o.etapa_em)) / HORA) }));
    }
    g.extras_aprovados += lig.extras.aprovado || 0;
    g.extras_pendentes += lig.extras.pendente || 0;
    g.extras_recusados += lig.extras.recusado || 0;
  }

  const gastoPor = new Map();
  for (const c of resultado?.campanhas || []) gastoPor.set(`${c.canal}|${A.normalizar(c.sem_utm ? '' : c.campanha)}`, c.gasto || 0);
  const campanhas = [...grupos.values()].map(g => derivar(g, gastoPor.get(`${g.canal}|${g.sem_utm ? '' : A.normalizar(g.campanha)}`) || 0))
    .sort((a, b) => b.gasto - a.gasto || b.na_oficina - a.na_oficina || a.campanha.localeCompare(b.campanha));
  const total = derivar(somar(campanhas), campanhas.reduce((s, g) => s + g.gasto, 0));

  const alertas = [];
  if (esperando.length) {
    const v = esperando.reduce((s, x) => s + x.total, 0);
    alertas.push({ tipo: 'orcamento_parado', quantidade: esperando.length, valor: v, itens: esperando.slice(0, 8),
      texto: `${esperando.length} orçamento(s) de anúncio esperando resposta há mais de ${H_ORC} h (${brl(v)} no total). Vale um toque no WhatsApp.` });
  }
  if (aprovadoSemOS.length) {
    alertas.push({ tipo: 'aprovado_sem_os', quantidade: aprovadoSemOS.length, valor: aprovadoSemOS.reduce((s, x) => s + x.total, 0), itens: aprovadoSemOS.slice(0, 8),
      texto: `${aprovadoSemOS.length} orçamento(s) aprovado(s) há mais de 3 dias e o carro ainda não entrou no Pátio.` });
  }
  if (prontosParados.length) {
    alertas.push({ tipo: 'pronto_parado', quantidade: prontosParados.length, itens: prontosParados.slice(0, 8),
      texto: `${prontosParados.length} carro(s) de anúncio pronto(s) há mais de ${H_PRONTO} h sem retirar.` });
  }
  if (semValorComOrc.length) {
    const v = semValorComOrc.reduce((s, x) => s + x.valor_sugerido, 0);
    alertas.push({ tipo: 'valor_sugerido', quantidade: semValorComOrc.length, valor: v, itens: semValorComOrc.slice(0, 8),
      texto: `${semValorComOrc.length} carro(s) entregue(s) sem valor pago no CRM; o orçamento aprovado (mais extras) soma ${brl(v)} — use como conferência ao lançar o valor.` });
  }
  alertasR7(alertas, R7);
  const canais = ['meta', 'google'].map(c => ({ canal: c, ...derivar(somar(campanhas.filter(g => g.canal === c)), campanhas.filter(g => g.canal === c).reduce((s, g) => s + g.gasto, 0)) }))
    .filter(c => c.orcados || c.na_oficina || c.gasto);
  return { campanhas, canais, total, motivos: motivosOrdenados(motivos), funil: funilCiclo(total), alertas,
    detalhe: { esperando, aprovado_sem_os: aprovadoSemOS, prontos_parados: prontosParados, valor_sugerido: semValorComOrc, ...R7 } };
}

const SOMA = (l, k = 'valor') => l.reduce((s, x) => s + numero(x[k]), 0);
/** Cada alerta leva os itens (até 8) com links: o consultor abre o lead, a conversa, o orçamento ou a OS direto. */
function alertasR7(alertas, R7) {
  const mais = (tipo, lista, texto) => { if (lista.length) alertas.push({ tipo, quantidade: lista.length, valor: SOMA(lista), texto, itens: lista.slice(0, 8) }); };
  mais('orc_nao_aberto', R7.nao_aberto, `${R7.nao_aberto.length} orçamento(s) enviado(s) há mais de ${H_NAO_ABERTO} h que o cliente nem abriu (${brl(SOMA(R7.nao_aberto))}). Confira se o link chegou.`);
  mais('orc_quente', R7.quente, `${R7.quente.length} cliente(s) abriram o orçamento e não responderam (${brl(SOMA(R7.quente))}). É a hora de ligar.`);
  mais('follow_vencido', R7.follow_vencido, `${R7.follow_vencido.length} retorno(s) combinado(s) com o cliente já venceu(ram) (${brl(SOMA(R7.follow_vencido))}).`);
  mais('desconto_pedido', R7.desconto, `${R7.desconto.length} cliente(s) pediram desconto e esperam o gestor (${brl(SOMA(R7.desconto))}).`);
  mais('horario_pedido', R7.horario, `${R7.horario.length} cliente(s) aprovaram e pediram horário, mas o carro ainda não tem OS (${brl(SOMA(R7.horario))}).`);
  mais('validade_vencendo', R7.validade, `${R7.validade.length} orçamento(s) vencem em até 48 h (${brl(SOMA(R7.validade))}).`);
  mais('lead_parado', R7.lead_parado, `${R7.lead_parado.length} lead(s) de anúncio continuam como "Novo" há mais de ${H_LEAD_PARADO} h sem primeiro toque.`);
  mais('sem_orcamento', R7.sem_orcamento, `${R7.sem_orcamento.length} lead(s) de anúncio já agendados ou em serviço, sem orçamento no Orçador.`);
}

function somar(lista) {
  const t = ZERO();
  for (const g of lista) { for (const k of SOMAVEIS) t[k] += g[k] || 0; for (const a of ARRAYS) t[a].push(...((g._arrays && g._arrays[a]) || [])); }
  return t;
}
function derivar(g, gasto) {
  const g0 = gasto > 0 ? gasto : null;
  const saida = {
    ...g, gasto,
    custo_orcamento: dividir(g0, g.orcados),
    custo_carro_na_oficina: dividir(g0, g.na_oficina),
    custo_carro_entregue: dividir(g0, g.entregues),
    conv_orcamento: dividir(g.orcamentos_aprovados * 100, g.orcamentos_enviados),
    ticket_oficina: dividir(g.receita_entregues, g.entregues - g.entregues_sem_valor),
    roas_oficina: g.receita_entregues > 0 && gasto > 0 ? g.receita_entregues / gasto : null,
    receita_prevista: g.valor_aprovado + g.extras_aprovados,
    ticket_orcamento: dividir(g.valor_aprovado, g.orcamentos_aprovados),
    dias_ate_oficina: mediana(g.dias_ate_oficina),
    // Rodada 7: tempo típico entre o envio e a decisão do cliente, e do lead até o orçamento enviado.
    horas_decisao: mediana(g.horas_decisao),
    horas_ate_envio: mediana(g.horas_ate_envio),
    taxa_visualizacao: dividir(g.visualizados * 100, g.orcamentos_enviados),
    roas_previsto: gasto > 0 && g.valor_aprovado + g.extras_aprovados > 0 ? (g.valor_aprovado + g.extras_aprovados) / gasto : null,
  };
  Object.defineProperty(saida, '_arrays', { value: Object.fromEntries(ARRAYS.map(a => [a, g[a]])), enumerable: false });
  return saida;
}
function motivosOrdenados(m) {
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([cod, qtd]) => ({ codigo: cod, motivo: MOTIVO_NOME[cod] || cod, qtd }));
}

/** Atual contra o período anterior (puro): variação % só quando o anterior é maior que zero. */
function compararCiclo(atual, anterior) {
  const saida = {};
  for (const k of ['orcados', 'orcamentos_aprovados', 'na_oficina', 'entregues', 'receita_entregues', 'custo_carro_na_oficina', 'custo_carro_entregue']) {
    const a = atual?.[k], b = anterior?.[k];
    saida[k] = { atual: a ?? null, anterior: b ?? null, variacao: a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null };
  }
  return saida;
}

/** Escada do ciclo: o que o CRM não enxerga sozinho (lead -> orçou -> aprovou -> carro -> entregue). */
function funilCiclo(t) {
  const etapas = [
    ['orcados', 'Orçamento feito', t.orcados],
    ['orcamentos_aprovados', 'Orçamento aprovado', t.orcamentos_aprovados],
    ['na_oficina', 'Carro na oficina', t.na_oficina],
    ['entregues', 'Carro entregue', t.entregues],
  ];
  return etapas.map(([chave, rotulo, valor], i) => ({
    chave, rotulo, valor,
    taxa: i === 0 || valor > etapas[i - 1][2] ? null : dividir(valor * 100, etapas[i - 1][2]),
  }));
}

function brl(v) { return v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

/** Frase de uma linha para o relatório diário / resumo semanal (pura). null quando não há o que dizer. */
function frase(c) {
  if (!c || !c.total || !(c.total.orcados || c.total.na_oficina)) return null;
  const t = c.total, p = [];
  p.push(`${t.orcados} orçamento(s) de anúncio${t.orcamentos_aprovados ? `, ${t.orcamentos_aprovados} aprovado(s)` : ''}`);
  if (t.na_oficina) p.push(`${t.na_oficina} carro(s) na oficina${t.no_patio_agora ? ` (${t.no_patio_agora} no pátio agora)` : ''}, ${t.entregues} entregue(s)`);
  if (t.custo_carro_na_oficina != null) p.push(`cada carro custou ${brl(t.custo_carro_na_oficina)} em anúncio`);
  if (t.receita_entregues > 0) p.push(`${brl(t.receita_entregues)} pagos`);
  return p.join(', ') + '.';
}

/* ---------------- "Oficina agora" (cartão do Painel) ---------------- */

const diaBR = (agora) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(agora));

/**
 * Os leads de anúncio dos últimos 30 dias que estão na oficina ou esperando resposta de orçamento, agora.
 * Mostra nome e atalhos (a tela é de gestor); injeta leitura e relógio nos testes.
 */
async function agora({ dias = 30, lerLeads = null, ler = ler_, agoraMs = Date.now() } = {}) {
  const ate = diaBR(agoraMs), de = diaBR(agoraMs - (dias - 1) * 86400000);
  const brutos = await (lerLeads || (() => require('./leads').lerLeads(de, ate)))();
  const pagos = brutos.filter(l => A.canal(l));
  const lido = await ler(pagos.map(l => l.id));
  if (!lido.ok) return { indisponivel: true, motivo: 'Orçador e Pátio não responderam agora.' };
  const noPatio = [], esperando = [];
  let prontosParados = 0, entregues = 0, receita = 0;
  for (const l of pagos) {
    const r = resumoDoLead(lido.porLead.get(l.id), agoraMs);
    if (!r) continue;
    if (r.os?.entregue) { entregues++; receita += numero(l.valor_pago); }
    const base = { lead_id: l.id, nome: l.nome || '(sem nome)', carro: l.carro_modelo || null, campanha: l.utm_campaign || null, link_crm: Eco.linkLead(l.id) };
    if (r.os?.no_patio) {
      noPatio.push({ ...base, etapa: r.os.etapa, etapa_nome: r.os.etapa_nome, link_os: r.os.link, pronto_horas: r.os.pronto_horas });
      if (r.os.pronto_horas != null && r.os.pronto_horas >= H_PRONTO) prontosParados++;
    }
    if (r.orcamento?.status === 'enviado') esperando.push({ ...base, total: r.orcamento.total, esperando_horas: r.orcamento.esperando_horas, link_orcamento: r.orcamento.link });
  }
  noPatio.sort((a, b) => (b.pronto_horas || 0) - (a.pronto_horas || 0));
  esperando.sort((a, b) => (b.esperando_horas || 0) - (a.esperando_horas || 0));
  return {
    indisponivel: false, dias,
    no_patio: noPatio.length, prontos_parados: prontosParados, entregues, receita_entregues: receita, orc_esperando: esperando.length,
    valor_esperando: esperando.reduce((s, x) => s + (x.total || 0), 0),
    carros: noPatio.slice(0, 6), orcamentos: esperando.slice(0, 6),
  };
}
const ler_ = ler;

/**
 * Aviso no sino dos gestores (uma vez por dia): orçamento de anúncio esperando há mais de 48 h e carro pronto sem retirar.
 * Só avisa quando há o que fazer. A chave do dia impede repetir. Dependências injetáveis nos testes.
 */
async function avisarGestores({ hojeISO, deps = {} } = {}) {
  const r = await (deps.agora || agora)();
  if (r.indisponivel) return { enviado: false, motivo: r.motivo };
  const velhos = r.orcamentos.filter(o => (o.esperando_horas || 0) >= H_ORC);
  const totalVelhos = r.orc_esperando && velhos.length ? velhos.length : 0;
  // Rodada 7: além dos dois avisos antigos, a fila inteira (cliente que abriu e não respondeu, desconto pedido, horário pedido…).
  let fila = null;
  if (!deps.agora || deps.acoes) {
    try { const a = await (deps.acoes || (() => acoes({ limite: 5 })))(); if (!a.indisponivel && a.total) fila = a; } catch { /* sem a fila, os dois avisos antigos seguem */ }
  }
  if (!totalVelhos && !r.prontos_parados && !fila) return { enviado: false, motivo: 'nada pedindo atenção' };
  const partes = [];
  if (totalVelhos) partes.push(`${totalVelhos} orçamento(s) de anúncio sem resposta há mais de ${H_ORC} h`);
  if (r.prontos_parados) partes.push(`${r.prontos_parados} carro(s) pronto(s) há mais de ${H_PRONTO} h sem retirar`);
  const titulo = fila ? `Anúncio → oficina: ${fila.total} cliente(s) esperando você` : 'Anúncio → oficina: tem gente esperando';
  const corpo = (partes.length ? partes.join(' · ') + '.' : '') + (fila ? ` ${require('./acoes').frase(fila)}` : '');
  const banco = deps.equipe || require('./equipe').banco();
  const res = await banco.notificarGestores({ tipo: 'ads_ciclo', titulo, corpo, link: fila ? '/?aba=painel&ancora=cartao-acoes' : '/?aba=leads&etapa=orc_esperando', chave: `ads-ciclo-${hojeISO}`, preferencia: 'ads_semana' });
  return { enviado: res.enviadas > 0, titulo, corpo, ...res };
}

/**
 * Rodada 7: a fila "o que fazer agora" dos leads de anúncio dos últimos `dias` dias.
 * Lê o Orçador e o Pátio uma vez só; se não responderem, devolve { indisponivel } (nada quebra).
 */
async function acoes({ dias = 30, lerLeads = null, ler = ler_, agoraMs = Date.now(), limite = 40 } = {}) {
  const ate = diaBR(agoraMs), de = diaBR(agoraMs - (dias - 1) * 86400000);
  const brutos = await (lerLeads || (() => require('./leads').lerLeads(de, ate)))();
  const pagos = brutos.filter(l => A.canal(l));
  const lido = await ler(pagos.map(l => l.id));
  if (!lido.ok) return { indisponivel: true, motivo: 'Orçador e Pátio não responderam agora.', itens: [], total: 0 };
  const cons = consolidarCiclo({ leads: pagos, porLead: lido.porLead, agora: agoraMs });
  const f = require('./acoes').fila(cons, { limite });
  return { indisponivel: false, parcial: lido.parcial || null, dias, leads_lidos: pagos.length, gerado_em: new Date(agoraMs).toISOString(), ...f, alertas: cons.alertas };
}

/* ---------------- qualidade da ligação (rodada 7) ---------------- */

const pc = (a, b) => (b > 0 ? Math.round((a * 100) / b) : null);

/** Pura: quantos orçamentos e OS recentes estão ligados a um lead (sem isso o ROI da oficina fica cego). */
function qualidadeLigacao({ orcamentos = [], os = [] } = {}) {
  const orc = orcamentos.filter(o => o && o.rascunho !== true && ['enviado', 'aprovado', 'recusado', 'expirado'].includes(o.status));
  const comLead = orc.filter(o => o.lead_id).length;
  const soAgendamento = orc.filter(o => !o.lead_id && o.agendamento_id).length;
  const semLigacao = orc.length - comLead - soAgendamento;
  const osValidas = os.filter(o => o && o.etapa !== 'cancelado');
  const osLigadas = osValidas.filter(o => o.lead_id || o.orcamento_id || o.agendamento_id).length;
  const pOrc = pc(comLead + soAgendamento, orc.length), pOs = pc(osLigadas, osValidas.length);
  const problemas = [];
  if (orc.length && pOrc < 70) problemas.push(`só ${pOrc}% dos orçamentos enviados estão ligados a um lead: abra o orçamento pelo botão "Orçar" do CRM ou da aba Leads para o custo por carro contar`);
  if (osValidas.length && pOs < 70) problemas.push(`só ${pOs}% das OS do Pátio vêm de um orçamento, lead ou agendamento`);
  return {
    orcamentos: { total: orc.length, com_lead: comLead, so_agendamento: soAgendamento, sem_ligacao: semLigacao, pct_ligado: pOrc },
    os: { total: osValidas.length, ligadas: osLigadas, sem_ligacao: osValidas.length - osLigadas, pct_ligado: pOs },
    saudavel: problemas.length === 0, problemas,
    frase: !orc.length && !osValidas.length ? 'Ainda não há orçamento enviado nem carro no Pátio nos últimos dias.'
      : problemas.length ? problemas.join('; ') + '.' : `Ligação em dia: ${pOrc ?? 100}% dos orçamentos e ${pOs ?? 100}% das OS contam no custo por carro.`,
  };
}

/** Lê orçamentos e OS dos últimos `dias` dias (só colunas de ligação, sem nome nem telefone). Falha vira { indisponivel }. */
async function ligacao({ dias = 30, sb = db.sb, agoraMs = Date.now() } = {}) {
  try {
    const desde = new Date(agoraMs - dias * 86400000).toISOString();
    const [o, p] = await Promise.all([
      sb.from('orc_orcamentos').select('id, status, rascunho, lead_id, agendamento_id').gte('created_at', desde).limit(2000),
      sb.from('patio_os').select('id, etapa, lead_id, orcamento_id, agendamento_id').gte('created_at', desde).limit(2000),
    ]);
    if (o.error) throw new Error('orcamentos: ' + o.error.message);
    if (p.error) throw new Error('patio_os: ' + p.error.message);
    return { indisponivel: false, dias, ...qualidadeLigacao({ orcamentos: o.data || [], os: p.data || [] }) };
  } catch (e) { return { indisponivel: true, motivo: 'Não consegui conferir a ligação agora: ' + String(e.message || e) }; }
}

/* ---------------- CSV ---------------- */

const CAMPOS_CSV = [['canal', 'Canal'], ['campanha', 'Campanha'], ['gasto', 'Investido'], ['orcados', 'Orçamentos'],
  ['orcamentos_enviados', 'Orçamentos enviados'], ['orcamentos_aprovados', 'Orçamentos aprovados'], ['orcamentos_recusados', 'Recusados'],
  ['valor_orcado', 'Valor orçado'], ['valor_aprovado', 'Valor aprovado'], ['na_oficina', 'Carros na oficina'], ['no_patio_agora', 'No pátio agora'],
  ['entregues', 'Entregues'], ['extras_aprovados', 'Extras aprovados'], ['receita_entregues', 'Receita paga (entregues)'],
  ['custo_orcamento', 'Custo por orçamento'], ['custo_carro_na_oficina', 'Custo por carro na oficina'], ['custo_carro_entregue', 'Custo por carro entregue'],
  ['conv_orcamento', 'Aprovação (%)'], ['ticket_orcamento', 'Ticket do orçamento aprovado'], ['dias_ate_oficina', 'Dias do lead até a oficina (mediana)'], ['roas_oficina', 'ROAS da oficina']];
function csv(ciclo) {
  const linhas = [...ciclo.campanhas, { ...ciclo.total, canal: '', campanha: 'TOTAL' }];
  return A.montarCSV(CAMPOS_CSV, linhas);
}

module.exports = { qualidadeLigacao, ligacao, acoes, unirOrcamentos, valorAprovado, itemDoLead, horasEntre, compararCiclo, agora, avisarGestores, ler, ligar, resumoDoLead, consolidarCiclo, melhorOrcamento, osPrincipal, funilCiclo, frase, csv,
  lerOrcamentos, lerOS, lerExtras, emPatio, NOME_ORC, NOME_ETAPA, MOTIVO_NOME, CAMPOS_CSV };
