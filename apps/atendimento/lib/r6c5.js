/* ============================================================
   IndyCar Atendimento — Rodada 6, segunda leva (C5): conexões ao vivo.

   · Orçador AO VIVO: as RPCs orc_status_por_telefone / orc_status_por_lead só respondem
     para quem é da equipe (checam auth.uid()). Com a chave de serviço elas voltam VAZIAS,
     então são chamadas com o JWT de QUEM está logado (cabeçalho Authorization da requisição),
     junto com a chave pública (anon). O token nunca vai para a resposta, para o log nem para a auditoria.
   · Pré-agendamentos que o cliente pediu na página do orçamento (observação "PRÉ-AGENDAMENTO…").
   · Carros no pátio (patio_carros_abertos) que ainda NÃO têm conversa — quem merece um aviso.
   · Ações sugeridas do r6_cliente_360, sem link fora dos domínios da casa e sem preço.

   Tudo vem de fora (fetch, sb, relógio) para testar com dublês.
   ============================================================ */
'use strict';

const R6 = require('../public/r6-regras.js');
const PAT = require('./patio.js');

const DIA = 86_400_000;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Telefone → chave que casa formatos diferentes: DDD + últimos 8 dígitos. */
function chaveTel(t) {
  let d = String(t ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}
/** Telefone no formato que as RPCs do Orçador aceitam (55 + DDD + número). */
function telefoneParaRpc(t) {
  let d = String(t ?? '').replace(/\D/g, '');
  if (/^\d{10,11}$/.test(d)) d = '55' + d;
  return /^55\d{10,11}$/.test(d) ? d : null;
}
/** Token do cabeçalho Authorization ("Bearer x", maiúsculas à vontade). */
function bearerDe(req) {
  const m = /^\s*bearer\s+([\w.\-~+/]+=*)\s*$/i.exec(req?.headers?.authorization || '');
  return m ? m[1] : null;
}

function criarC5({ sb, fetch: fetchFn = (typeof fetch === 'function' ? fetch : null), supabaseUrl = '', anonKey = '', agora = () => new Date(), log = console.error } = {}) {
  /** Chama uma RPC como o usuário logado. Devolve { ok, dados } ou { ok:false, motivo }. */
  async function rpcComoUsuario(token, nome, args) {
    if (!token) return { ok: false, motivo: 'sem_token' };
    if (!fetchFn || !supabaseUrl || !anonKey) return { ok: false, motivo: 'sem_config' };
    try {
      const r = await fetchFn(`${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/rpc/${nome}`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      });
      if (!r.ok) return { ok: false, motivo: r.status === 401 || r.status === 403 ? 'sem_permissao' : 'erro_' + r.status };
      return { ok: true, dados: await r.json() };
    } catch (e) { log('rpc', nome, e.message); return { ok: false, motivo: 'rede' }; }
  }

  /** Motivo da recusa de cada orçamento: o código + o texto que o cliente escreveu (orc_orcamentos); se não houver, o evento do Orçador. */
  async function motivosDeRecusa(ids) {
    const lim = (ids || []).filter((x) => RE_UUID.test(String(x))).slice(0, 12);
    const m = new Map();
    if (!lim.length) return m;
    try {
      const { data } = await sb.from('orc_orcamentos').select('id,motivo_cod,motivo_recusa').in('id', lim);
      for (const o of data || []) { const t = R6.motivoDaRecusa({ cod: o.motivo_cod, texto: o.motivo_recusa }); if (t) m.set(o.id, t); }
    } catch (e) { log('motivo recusa', e.message); }
    const faltam = lim.filter((id) => !m.has(id));
    if (faltam.length) {
      try {
        const { data } = await sb.from('orc_eventos').select('orcamento_id,tipo,detalhe,created_at').in('orcamento_id', faltam).eq('tipo', 'recusado').order('created_at', { ascending: false }).limit(24);
        for (const e of data || []) if (!m.has(e.orcamento_id)) { const t = R6.motivoDaRecusa(e.detalhe); if (t) m.set(e.orcamento_id, t); }
      } catch (e) { log('motivo recusa (eventos)', e.message); }
    }
    return m;
  }

  /**
   * Orçamentos do cliente ao vivo, pelo telefone (e pelo lead, se tiver) — como o usuário logado.
   * { ok, orcamentos:[…], motivo? } — falha vira aviso, nunca derruba o painel.
   */
  async function orcamentosAoVivo({ token, telefone, leadId = null }) {
    const tel = telefoneParaRpc(telefone);
    const chamadas = [];
    if (tel) chamadas.push(rpcComoUsuario(token, 'orc_status_por_telefone', { p_telefone: tel }));
    if (leadId && RE_UUID.test(String(leadId))) chamadas.push(rpcComoUsuario(token, 'orc_status_por_lead', { p_lead: leadId }));
    if (!chamadas.length) return { ok: true, orcamentos: [], motivo: 'sem_telefone' };
    const rs = await Promise.all(chamadas);
    if (rs.every((r) => !r.ok)) return { ok: false, orcamentos: [], motivo: rs[0].motivo };
    const t0 = agora();
    const vistos = new Map();
    for (const r of rs) {
      if (!r.ok || !Array.isArray(r.dados)) continue;
      for (const linha of r.dados.slice(0, 30)) { const c = R6.classificarLive(linha, t0); if (c.id && !vistos.has(c.id)) vistos.set(c.id, c); }
    }
    const lista = [...vistos.values()];
    const motivos = await motivosDeRecusa(lista.filter((o) => o.status === 'recusado').map((o) => o.id));
    for (const o of lista) {
      if (o.status !== 'recusado') continue;
      o.motivo_recusa = motivos.get(o.id) || null;
      if (o.motivo_recusa) o.acao = `Recusou: ${o.motivo_recusa}`;
    }
    return { ok: true, orcamentos: lista.slice(0, 8), motivo: null, parcial: rs.some((r) => !r.ok) };
  }

  /** Pré-agendamentos que o cliente pediu na página do orçamento e ainda esperam confirmação. */
  async function preAgendamentos({ clienteId = null, telefone = null }) {
    try {
      const desde = new Date(agora().getTime() - 3 * DIA).toISOString().slice(0, 10);
      const { data } = await sb.from('agendamentos')
        .select('id,cliente_id,telefone,telefone_e164,data,hora,servico,status,observacoes,created_at')
        .ilike('observacoes', '%agendamento pedido pelo cliente%').gte('data', desde).order('data', { ascending: true }).limit(60);
      const k = chaveTel(telefone);
      return (data || []).filter((a) => R6.ehPreAgendamento(a.observacoes) && a.status === 'aguardando'
        && ((clienteId && a.cliente_id === clienteId) || (k && chaveTel(a.telefone_e164 || a.telefone) === k)))
        .slice(0, 3).map((a) => ({ id: a.id, data: a.data, hora: a.hora ? String(a.hora).slice(0, 5) : null, servico: a.servico || null,
          numero_orcamento: R6.numeroDoPreAgendamento(a.observacoes), pedido_em: a.created_at, abrir: R6.relAgendamento(a.id) }));
    } catch (e) { log('pré-agendamentos', e.message); return []; }
  }

  /** Carros abertos no pátio (patio_carros_abertos) → lista com nome do cliente, sem os que já têm conversa aberta. */
  async function carrosSemConversa() {
    const t0 = agora();
    let carros = [];
    try {
      const { data, error } = await sb.rpc('patio_carros_abertos');
      if (error) return { ok: false, erro: 'Não consegui ler os carros do pátio agora.', carros: [] };
      carros = Array.isArray(data) ? data : [];
    } catch (e) { log('patio_carros_abertos', e.message); return { ok: false, erro: 'Não consegui ler os carros do pátio agora.', carros: [] }; }
    const { data: convs } = await sb.from('conversas').select('id,cliente_id,telefone,telefone_e164,desfecho,tipo').eq('tipo', 'atendimento').is('desfecho', null).limit(500);
    const ids = [...new Set(carros.map((c) => c.cliente_id).filter(Boolean))].slice(0, 200);
    const { data: clientes } = ids.length ? await sb.from('clientes').select('id,nome,carro_modelo').in('id', ids) : { data: [] };
    const nomePor = new Map((clientes || []).map((c) => [c.id, c]));
    const livres = R6.carrosSemConversa(carros, convs || [], chaveTel);
    return {
      ok: true, total_no_patio: carros.length,
      carros: livres.slice(0, 40).map((c) => ({
        os_id: c.os_id, numero: c.numero, etapa: c.etapa, etapa_rotulo: PAT.ETAPAS[c.etapa] || c.etapa,
        min_na_etapa: R6.minutosEntre(c.etapa_em, t0), placa: c.placa || null, cliente_id: c.cliente_id || null,
        nome: nomePor.get(c.cliente_id)?.nome || null, carro: nomePor.get(c.cliente_id)?.carro_modelo || null,
        telefone: telefoneParaRpc(c.telefone), previsao_entrega: c.previsao_entrega || null, abrir: R6.relPatioOs(c.os_id),
      })),
    };
  }

  /** Funil do Orçador (orc_funil) nos últimos N dias, chamado como o gestor logado. */
  async function funilOrcador({ token, dias = 30 }) {
    const d = Math.max(1, Math.min(90, Math.round(Number(dias)) || 30));
    const r = await rpcComoUsuario(token, 'orc_funil', { p_dias: d });
    if (!r.ok) return { ok: false, motivo: r.motivo };
    const funil = prepararFunilOrcador(r.dados);
    return { ok: true, ...funil, insights: insightsOrcador(funil) };
  }

  return { rpcComoUsuario, orcamentosAoVivo, preAgendamentos, carrosSemConversa, motivosDeRecusa, funilOrcador };
}

const APPS_DA_CASA = ['crm', 'atendimento', 'agenda', 'comunicar', 'orcador', 'patio', 'ads', 'site', 'central'];
const limpo = (t, max) => String(t ?? '').replace(/<[^>]*>/g, ' ').replace(/[\p{C}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** acoes_sugeridas do r6_cliente_360 → só o que é seguro mostrar (link da casa, sem preço no texto). */
function acoesDoR360(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 6).map((a) => {
    const texto = typeof a?.texto === 'string' && !R6.textoTemPreco(a.texto) ? String(a.texto).replace(/[\p{C}]/gu, ' ').trim().slice(0, 500) : null;
    return {
      codigo: String(a?.codigo || '').slice(0, 40), app: APPS_DA_CASA.includes(a?.app) ? a.app : '',
      titulo: limpo(a?.titulo, 90),
      motivo: limpo(a?.motivo, 140),
      link: R6.linkSeguroCasa(a?.link), texto,
    };
  }).filter((a) => a.titulo);
}

/* ---------------- funil do Orçador ---------------- */
const MOTIVOS_ORC = { preco: 'Preço', prazo: 'Prazo', desistiu: 'Desistiu do serviço', outro_lugar: 'Vai fazer em outro lugar', sem_urgencia: 'Sem urgência', sem_motivo: 'Não disse o motivo', outro: 'Outro motivo' };
const r2 = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 100) / 100);
function prepararFunilOrcador(r) {
  const n = (k) => Number(r?.[k]) || 0;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const horas = (s) => (s != null && Number.isFinite(Number(s)) ? Math.round(Number(s) / 360) / 10 : null);
  const enviados = n('enviados');
  return {
    periodo_dias: n('periodo_dias'), criados: n('criados'), enviados, vistos: n('vistos'), decididos: n('decididos'), aprovados: n('aprovados'),
    recusados: n('recusados'), expirados: n('expirados'), em_espera: n('em_espera'), nunca_enviados: n('nunca_enviados'),
    taxa_visto: pct(n('vistos'), enviados), taxa_aprovacao: pct(n('aprovados'), enviados),
    valor_enviado: r2(r?.valor_enviado), valor_aprovado: r2(r?.valor_aprovado), valor_perdido: r2(r?.valor_perdido), valor_em_espera: r2(r?.valor_em_espera),
    mediana_ver_h: horas(r?.mediana_ver_seg), mediana_decidir_h: horas(r?.mediana_decidir_seg),
    seguimento: { hoje: Number(r?.seguimento?.hoje) || 0, atrasados: Number(r?.seguimento?.atrasados) || 0 },
    por_motivo: (Array.isArray(r?.por_motivo) ? r.por_motivo : []).slice(0, 8).map((x) => ({
      codigo: limpo(x?.codigo, 20), rotulo: MOTIVOS_ORC[x?.codigo] || limpo(x?.codigo, 40) || 'Sem motivo', quantidade: Number(x?.quantidade) || 0, valor: r2(x?.valor) })),
  };
}
function insightsOrcador(f) {
  const out = [];
  if (!f || !f.enviados) return out;
  if (f.nunca_enviados >= 3) out.push(`${f.nunca_enviados} orçamentos foram montados e nunca enviados ao cliente.`);
  if (f.taxa_visto != null && f.taxa_visto < 60 && f.enviados >= 5) out.push(`Só ${f.taxa_visto}% dos orçamentos enviados foram abertos: vale conferir se o link está chegando.`);
  const top = f.por_motivo[0];
  if (top && top.quantidade >= 2) out.push(`O motivo de recusa mais comum é "${top.rotulo.toLowerCase()}" (${top.quantidade}).`);
  if (f.seguimento.atrasados) out.push(`${f.seguimento.atrasados} retorno${f.seguimento.atrasados === 1 ? '' : 's'} de orçamento atrasado${f.seguimento.atrasados === 1 ? '' : 's'} no Orçador.`);
  return out;
}

module.exports = { criarC5, chaveTel, telefoneParaRpc, bearerDe, acoesDoR360, prepararFunilOrcador, insightsOrcador };
