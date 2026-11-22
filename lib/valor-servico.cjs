/* ============================================================
   Valor do serviço fechado — UMA verdade para a Casa, o CRM e o Tráfego (R13C, 22/11/2026).

   Antes cada app tinha a sua: a Casa somava agendamentos.valor, o CRM somava leads.valor_pago e o Tráfego
   usava Pátio > orçamento > Agenda > lançado na tela nova, mas só valor_pago no ranking, no CSV e no relatório.
   Agora todos chamam este arquivo (no servidor da Central; nada muda no banco):

     serviço fechado = contato (leads) com status 'concluido'
     fechado em      = closed_at, senão updated_at, senão created_at
     valor           = 1º Pátio: OS entregue → orçamento aprovado (ou o total guardado na OS) + extras aprovados
                       2º orçamento aprovado no Orçador
                       3º agendamento "fechou" (concluido) com valor na Agenda (o maior, se houver mais de um)
                       4º valor lançado à mão no CRM/Tráfego (leads.valor_pago)
                       nenhum: null (não sabemos quanto entrou — não é R$ 0)

   CommonJS (o CRM e o Tráfego são CommonJS; a Central, ESM, importa igual). Sem dependência.
   ============================================================ */
'use strict';

const numero = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const arred = v => Math.round(Number(v) * 100) / 100;

/* ---------------- peças puras ---------------- */

/** Ordem de preferência dos orçamentos de um contato (aprovado vence; empate: o mais recente). */
const PESO_ORC = { aprovado: 5, enviado: 4, aberto: 3, recusado: 2, expirado: 1 };

/** O valor que o cliente aprovou: total aprovado (com desconto), senão o total. */
function valorAprovado(orc) { return numero(orc && orc.total_aprovado) > 0 ? numero(orc.total_aprovado) : numero(orc && orc.total); }

/** O melhor orçamento do contato (aprovado > enviado > aberto > recusado > expirado; empate: o mais recente). */
function melhorOrcamento(orcs = []) {
  return [...(orcs || [])].sort((a, b) => (PESO_ORC[b.status] || 0) - (PESO_ORC[a.status] || 0)
    || String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
}

/**
 * Cada orçamento/OS/extras vai para o contato certo.
 * Orçamento: lead_id; sem ele, o contato do agendamento. OS: lead_id, senão o contato do orçamento de origem,
 * senão o do agendamento. Devolve Map(leadId -> { orcamentos, os, extras: { aprovado, pendente, recusado, qtd_aprovado } }).
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
  const leadDoOrc = o => (o.lead_id && lista.has(o.lead_id) ? o.lead_id : ((agPorId.get(o.agendamento_id) || {}).lead_id || null));
  for (const o of orcamentos) {
    if (!o || !o.id || o.rascunho === true) continue;
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
    if (!o || !o.id || vistas.has(o.id)) continue;
    const orcOrigem = orcPorId.get(o.orcamento_id);
    const lead = o.lead_id || (orcOrigem && leadDoOrc(orcOrigem)) || (agPorId.get(o.agendamento_id) || {}).lead_id || null;
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

/**
 * Valor do serviço fechado e de onde ele veio ('patio' | 'orcamento' | 'agenda' | 'manual' | null).
 * l = o contato (usa valor_pago); lig = orçamentos/OS/extras dele (ligar); orc = o melhor orçamento; ags = agendamentos dele.
 */
function valorDoServico(l, { lig = null, orc = null, ags = [] } = {}) {
  const entregue = lig ? (lig.os || []).find(o => o.etapa === 'entregue') : null;
  const aprovado = orc && orc.status === 'aprovado' ? valorAprovado(orc) : 0;
  if (entregue) {
    const total = (aprovado > 0 ? aprovado : numero(entregue.orcamento_total)) + numero(lig.extras && lig.extras.aprovado);
    if (total > 0) return { valor: arred(total), fonte: 'patio' };
  }
  if (aprovado > 0) return { valor: arred(aprovado), fonte: 'orcamento' };
  const daAgenda = Math.max(0, ...(ags || []).filter(a => a && a.status === 'concluido').map(a => numero(a.valor)));
  if (daAgenda > 0) return { valor: arred(daAgenda), fonte: 'agenda' };
  if (numero(l && l.valor_pago) > 0) return { valor: arred(numero(l.valor_pago)), fonte: 'manual' };
  return { valor: null, fonte: null };
}

/** Atalho: o valor de um contato a partir do que foi lido (lig do contato + agendamentos dele). */
function valorDoContato(l, lig = null, ags = []) {
  return valorDoServico(l, { lig, orc: lig ? melhorOrcamento(lig.orcamentos || []) : null, ags });
}

/** Quando o serviço fechou (instante em ms; NaN se não dá para saber). */
function fechadoEm(l) { const t = Date.parse((l && (l.closed_at || l.updated_at || l.created_at)) || ''); return Number.isFinite(t) ? t : NaN; }
const fechou = l => !!l && l.status === 'concluido';
/** "Cortesia: sem cobrança" (o CRM marca nas observações): fechou de graça de propósito, não falta valor. */
const ehCortesia = obs => /Cortesia: sem cobran/i.test(String(obs || ''));

/* ---------------- leitura (supabase-js; só leitura) ---------------- */

const LOTE = 150;
async function emLotes(ids, fn, tamanho = LOTE) {
  const unicos = [...new Set((ids || []).filter(Boolean))], partes = [];
  for (let i = 0; i < unicos.length; i += tamanho) partes.push(unicos.slice(i, i + tamanho));
  return (await Promise.all(partes.map(fn))).flat();
}
const COLS_ORC = 'id, lead_id, agendamento_id, status, total, total_aprovado, rascunho, created_at';
const COLS_OS = 'id, lead_id, orcamento_id, agendamento_id, etapa, orcamento_total, created_at';
const COLS_AG = 'id, lead_id, status, valor';

/**
 * Lê, só para os contatos pedidos, o que decide o valor: agendamentos, orçamentos (pelo contato e pelo agendamento),
 * OS do Pátio (pelo contato, pelo orçamento e pelo agendamento) e extras. Leituras independentes saem juntas.
 * Devolve { porLead: Map, agsPorLead: Map, ok, parcial } — Orçador ou Pátio fora não derrubam: vira 'parcial'
 * e o valor cai para a Agenda/lançado.
 */
async function lerLigacoes(sb, leadIds) {
  const ids = [...new Set((leadIds || []).filter(Boolean))];
  const vazio = { porLead: new Map(), agsPorLead: new Map(), ok: true, parcial: null };
  if (!ids.length) return vazio;
  const de = (tabela, cols, coluna, lista, extra) => emLotes(lista, async lote => {
    let q = sb.from(tabela).select(cols).in(coluna, lote);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(tabela + ': ' + error.message);
    return data || [];
  });
  const semRascunho = q => q.or('rascunho.is.null,rascunho.eq.false');
  const falhas = new Set();
  const tolera = (nome, p) => p.catch(() => { falhas.add(nome); return []; });
  const [ags, orcLead, osLead] = await Promise.all([
    de('agendamentos', COLS_AG, 'lead_id', ids),
    tolera('orcador', de('orc_orcamentos', COLS_ORC, 'lead_id', ids, semRascunho)),
    tolera('patio', de('patio_os', COLS_OS, 'lead_id', ids)),
  ]);
  const agIds = ags.map(a => a.id);
  const [orcAg, osAg, osOrcLead] = await Promise.all([
    tolera('orcador', de('orc_orcamentos', COLS_ORC, 'agendamento_id', agIds, semRascunho)),
    tolera('patio', de('patio_os', COLS_OS, 'agendamento_id', agIds)),
    tolera('patio', de('patio_os', COLS_OS, 'orcamento_id', orcLead.map(o => o.id))),
  ]);
  const orcPorId = new Map();
  for (const o of [...orcLead, ...orcAg]) if (o && o.id && !orcPorId.has(o.id)) orcPorId.set(o.id, o);
  const orcamentos = [...orcPorId.values()];
  const doLead = new Set(orcLead.map(o => o.id));
  const osOrcAg = await tolera('patio', de('patio_os', COLS_OS, 'orcamento_id', orcAg.filter(o => !doLead.has(o.id)).map(o => o.id)));
  const osPorId = new Map();
  for (const o of [...osLead, ...osOrcLead, ...osOrcAg, ...osAg]) if (o && o.id) osPorId.set(o.id, o);
  const os = [...osPorId.values()];
  // só os extras das OS entregues mudam o valor
  const extras = await tolera('patio', de('patio_extras', 'os_id, valor, status', 'os_id', os.filter(o => o.etapa === 'entregue').map(o => o.id)));
  const agsPorLead = new Map();
  for (const a of ags) { if (!agsPorLead.has(a.lead_id)) agsPorLead.set(a.lead_id, []); agsPorLead.get(a.lead_id).push(a); }
  return { porLead: ligar({ leadIds: ids, orcamentos, os, extras, agendamentos: ags }), agsPorLead, ok: true, parcial: falhas.size ? [...falhas].join(',') : null };
}

/**
 * Valor de cada contato FECHADO da lista: Map(id -> { valor, fonte }). Os que não fecharam ficam de fora.
 * `ler` injetável (testes); padrão = lerLigacoes(sb, ids).
 */
async function valoresDosFechados(sb, leads, { ler = lerLigacoes } = {}) {
  const fechados = (leads || []).filter(fechou);
  const mapa = new Map();
  if (!fechados.length) return mapa;
  const lido = await ler(sb, fechados.map(l => l.id));
  for (const l of fechados) mapa.set(l.id, valorDoContato(l, lido.porLead.get(l.id) || null, lido.agsPorLead.get(l.id) || []));
  return mapa;
}

/**
 * Para as contas antigas que só sabem ler `valor_pago` (ranking, CSV, relatório do Tráfego): devolve cópias dos contatos
 * com `valor_pago` trocado pelo valor do serviço (nos fechados) e o original guardado em `valor_lancado`.
 * Os que não fecharam saem iguais. Falha de leitura: devolve os contatos como vieram (a conta antiga, sem cair).
 */
async function comValorDoServico(sb, leads, opcoes = {}) {
  const lista = leads || [];
  let mapa;
  try { mapa = await valoresDosFechados(sb, lista, opcoes); } catch { return lista; }
  return lista.map(l => {
    const v = mapa.get(l.id);
    return v ? { ...l, valor_lancado: l.valor_pago ?? null, valor_pago: v.valor, valor_fonte: v.fonte } : l;
  });
}

/**
 * Faturamento de um trecho: soma do valor dos serviços FECHADOS entre `de` e `ate` (instantes, fim exclusivo).
 * Devolve { total, fechados, com_valor, sem_valor } — sem_valor não conta cortesia.
 */
function faturamento(leads, valores, { de = -Infinity, ate = Infinity } = {}) {
  let total = 0, fechados = 0, comValor = 0, semValor = 0;
  for (const l of leads || []) {
    if (!fechou(l)) continue;
    const t = fechadoEm(l);
    if (!(t >= de && t < ate)) continue;
    fechados++;
    const v = valores.get(l.id);
    if (v && v.valor != null) { total += v.valor; comValor++; } else if (!ehCortesia(l.observacoes)) semValor++;
  }
  return { total: arred(total), fechados, com_valor: comValor, sem_valor: semValor };
}

module.exports = {
  PESO_ORC, numero, arred, valorAprovado, melhorOrcamento, ligar, valorDoServico, valorDoContato, fechadoEm, fechou, ehCortesia,
  lerLigacoes, valoresDosFechados, comValorDoServico, faturamento,
};
