/* ============================================================
   Jornada — o que a jornada pede ao banco (rodada 8, frente T2b).

   Tudo que fala com tabela ou função nova da migração r8_trafego_v1 mora aqui, para o nome ou a
   assinatura mudarem num lugar só. Regras:
   - sempre em lote (uma ida ao banco para muitos contatos; nunca uma ida por contato);
   - `sb` vem por injeção (nos testes é um banco de mentira);
   - leitura de apoio que falha não derruba a jornada: devolve vazio e diz que falhou;
   - banco ainda sem a migração (tabela, coluna ou função inexistente) é uma situação prevista, não um erro;
   - nada daqui lê identificador de clique (gclid, fbclid, ctwa_clid) nem escreve em log.
   ============================================================ */
'use strict';

const db = require('./db');

const LOTE = 150;        // ids por consulta com `in` (a lista vai na URL)
const LOTE_FUNCAO = 500; // ids por chamada de função (vão no corpo)

/** Divide em lotes e busca todos ao mesmo tempo (cada lote é uma ida ao banco). */
async function emLotes(ids, fn, tamanho = LOTE) {
  const unicos = [...new Set((ids || []).filter(v => v != null && v !== ''))], partes = [];
  for (let i = 0; i < unicos.length; i += tamanho) partes.push(unicos.slice(i, i + tamanho));
  return (await Promise.all(partes.map(fn))).flat();
}

const CODIGOS_DE_AUSENCIA = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);
/** O banco ainda não tem a tabela, a coluna ou a função pedida (migração da rodada 8 não aplicada)? */
const ausente = e => !!e && (CODIGOS_DE_AUSENCIA.has(e.code)
  || /does not exist|could not find the (function|table|column)|in the schema cache/i.test(String(e.message || '')));

/* ---------------- leituras da lista ---------------- */

/**
 * Primeira mensagem do cliente e primeira resposta da oficina de cada contato (função do banco).
 * Devolve { ok, ausente, mapa: Map(lead_id -> { primeira_entrada_em, primeira_entrada_texto, primeira_saida_em, entradas, saidas }) }.
 */
async function primeirasMensagens(leadIds, { sb = db.sb } = {}) {
  const mapa = new Map();
  try {
    const linhas = await emLotes(leadIds, async lote => {
      const { data, error } = await sb.rpc('trafego_primeiras_mensagens', { p_leads: lote });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }, LOTE_FUNCAO);
    for (const l of linhas) if (l && l.lead_id) mapa.set(l.lead_id, l);
    return { ok: true, ausente: false, mapa };
  } catch (e) {
    return { ok: false, ausente: ausente(e), mapa };
  }
}

/** Quando cada cliente foi cadastrado: Map(cliente_id -> created_at). Falha vira mapa vazio. */
async function clientes(clienteIds, { sb = db.sb } = {}) {
  try {
    const linhas = await emLotes(clienteIds, async lote => {
      const { data, error } = await sb.from('clientes').select('id, created_at').in('id', lote);
      if (error) throw error;
      return data || [];
    });
    return new Map(linhas.map(c => [c.id, c.created_at]));
  } catch { return new Map(); }
}

/** Nome de quem atende cada contato: Map(perfil_id -> nome). Só id e nome. */
async function nomes(perfilIds, { sb = db.sb } = {}) {
  try {
    const linhas = await emLotes(perfilIds, async lote => {
      const { data, error } = await sb.from('perfis').select('id, nome').in('id', lote);
      if (error) throw error;
      return data || [];
    });
    return new Map(linhas.map(p => [p.id, p.nome || null]));
  } catch { return new Map(); }
}

/**
 * As respostas da oficina que o aparelho confirmou (saída, com identificador do WhatsApp, que não falhou):
 * a última antes do período, a primeira dentro dele e a última até o fim. Três linhas, três consultas curtas.
 * Serve para saber em que trecho o sistema NÃO registrou resposta de ninguém (achado 02).
 */
async function saidasConfirmadas({ inicio, fim, sb = db.sb }) {
  const base = () => sb.from('whatsapp_mensagens').select('created_at').eq('direcao', 'saida').neq('status', 'falhou').not('wamid', 'is', null);
  try {
    const [antes, primeira, ultima] = await Promise.all([
      base().lt('created_at', inicio).order('created_at', { ascending: false }).limit(1),
      base().gte('created_at', inicio).lt('created_at', fim).order('created_at', { ascending: true }).limit(1),
      base().lt('created_at', fim).order('created_at', { ascending: false }).limit(1),
    ]);
    if (antes.error || primeira.error || ultima.error) return { ok: false };
    const de = r => (r.data && r.data[0] ? r.data[0].created_at : null);
    return { ok: true, antes: de(antes), primeira: de(primeira), ultima: de(ultima) };
  } catch { return { ok: false }; }
}

/* ---------------- conversas novas (achado 01) ---------------- */

/** Conversas que começaram no período (uma por telefone): [{ id, telefone_e164, aberta_em }]. */
async function conversasNovas({ inicio, fim, sb = db.sb }) {
  const linhas = [];
  try {
    for (let de = 0; de < 5000; de += 1000) {
      const { data, error } = await sb.from('conversas').select('id, telefone_e164, aberta_em')
        .gte('aberta_em', inicio).lt('aberta_em', fim).order('aberta_em', { ascending: true }).order('id').range(de, de + 999);
      if (error) return { ok: false, conversas: [] };
      linhas.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
    return { ok: true, conversas: linhas };
  } catch { return { ok: false, conversas: [] }; }
}

/**
 * A primeira mensagem de cada conversa nova. `conversas.aberta_em` é o instante exato da primeira mensagem
 * recebida (conferido no banco em 19/11/2026: 216 de 216), então basta pedir as mensagens desses instantes.
 * Devolve Map(conversa_id -> texto).
 */
async function primeirasDasConversas(conversas, { sb = db.sb } = {}) {
  const instantes = conversas.map(c => c.aberta_em).filter(Boolean);
  const mapa = new Map();
  try {
    const linhas = await emLotes(instantes, async lote => {
      const { data, error } = await sb.from('whatsapp_mensagens').select('conversa_id, corpo, created_at').eq('direcao', 'entrada').in('created_at', lote);
      if (error) throw error;
      return data || [];
    }, 100);
    const daConversa = new Set(conversas.map(c => c.id));
    for (const m of linhas) if (daConversa.has(m.conversa_id) && !mapa.has(m.conversa_id)) mapa.set(m.conversa_id, m.corpo == null ? '' : String(m.corpo));
    return { ok: true, mapa };
  } catch { return { ok: false, mapa }; }
}

/** Frases ligadas (primeira mensagem -> origem). Sem a tabela: { ok: false, ausente: true }. */
async function frasesAtivas({ sb = db.sb } = {}) {
  try {
    const { data, error } = await sb.from('trafego_frases').select('id, frase, tipo, como, paga, plataforma').eq('ativa', true).limit(1000);
    if (error) return { ok: false, ausente: ausente(error), frases: [] };
    return { ok: true, ausente: false, frases: data || [] };
  } catch { return { ok: false, ausente: false, frases: [] }; }
}

/** Linhas de rastreio pelos códigos achados nas mensagens (só o que diz se é anúncio): Map(CODIGO -> linha). */
async function rastreiosPorCodigo(codigos, { sb = db.sb } = {}) {
  try {
    const linhas = await emLotes(codigos, async lote => {
      const { data, error } = await sb.from('trafego_rastreio').select('codigo, paga, plataforma, referencia_tipo, permanente').in('codigo', lote);
      if (error) throw error;
      return data || [];
    });
    return new Map(linhas.map(r => [String(r.codigo).toUpperCase(), r]));
  } catch { return new Map(); }
}

/* ---------------- leituras do detalhe de um contato ---------------- */

/** Mensagens do contato, da mais antiga para a mais nova. Primeiro pela ligação com o contato; sem nenhuma, pelo telefone. */
async function mensagensDoContato(lead, { sb = db.sb, limite = 400 } = {}) {
  const colunas = 'direcao, corpo, created_at, status, gerada_por_ia';
  try {
    const porLead = await sb.from('whatsapp_mensagens').select(colunas).eq('lead_id', lead.id).order('created_at', { ascending: true }).limit(limite);
    if (!porLead.error && (porLead.data || []).length) return porLead.data;
    if (!lead.telefone_e164 || !lead.created_at) return [];
    const desde = new Date(Date.parse(lead.created_at) - 86400000).toISOString();
    const porTelefone = await sb.from('whatsapp_mensagens').select(colunas).eq('telefone_e164', lead.telefone_e164)
      .gte('created_at', desde).order('created_at', { ascending: true }).limit(limite);
    return porTelefone.error ? [] : (porTelefone.data || []);
  } catch { return []; }
}

/** O que a equipe registrou no CRM para o contato (ligações, mudanças de etapa, anotações). */
async function atividadesDoContato(leadId, { sb = db.sb } = {}) {
  try {
    const { data, error } = await sb.from('crm_atividades').select('tipo, resultado, texto, created_at').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(100);
    return error ? [] : (data || []);
  } catch { return []; }
}

/** Agendamentos do cliente (todos os contatos dele), para o histórico "já veio antes?". null se não deu para ler. */
async function agendamentosDoCliente(clienteId, { sb = db.sb } = {}) {
  if (!clienteId) return [];
  try {
    const { data, error } = await sb.from('agendamentos').select('id, lead_id, data, hora, inicio_em, status, valor, created_at').eq('cliente_id', clienteId).order('data', { ascending: true }).limit(300);
    return error ? null : (data || []);
  } catch { return null; }
}

/* ---------------- escritas (cada uma muda UM contato; quem audita é a rota) ---------------- */

/** Situação atual do contato, para validar a escrita e guardar o "antes" na auditoria. null se não existe. */
async function situacaoDoContato(leadId, { sb = db.sb } = {}) {
  const { data, error } = await sb.from('leads').select('id, status, valor_pago').eq('id', leadId).maybeSingle();
  if (error) throw new Error('Não foi possível ler o contato no CRM. Tente novamente.');
  return data || null;
}

/** Valor do serviço. A condição de estado vai junto na gravação: se o contato deixou de estar fechado, nada muda. */
async function gravarValor(leadId, valor, { sb = db.sb } = {}) {
  const { data, error } = await sb.from('leads').update({ valor_pago: valor }).eq('id', leadId).eq('status', 'concluido').select('id, status, valor_pago');
  if (error) throw new Error('Não foi possível gravar o valor. Tente novamente.');
  return (data || [])[0] || null;
}

/** Motivo de não ter fechado. Mesma ideia: só grava se o contato segue como "não fechou". */
async function gravarMotivo(leadId, { motivo, obs }, { sb = db.sb } = {}) {
  const { data, error } = await sb.from('leads').update({ motivo_perda: motivo, motivo_perda_obs: obs }).eq('id', leadId).eq('status', 'perdido').select('id, status, motivo_perda, motivo_perda_obs');
  if (error) {
    if (ausente(error)) return { ausente: true };
    throw new Error('Não foi possível gravar o motivo. Tente novamente.');
  }
  return (data || [])[0] || null;
}

/**
 * Origem marcada por uma pessoa: quem decide a gravação é o banco (trafego_aplicar_origem, regra única da força da evidência).
 * Devolve { ok, aplicou, ausente }.
 */
async function aplicarOrigem(leadId, dados, { sb = db.sb, como = 'manual' } = {}) {
  const { data, error } = await sb.rpc('trafego_aplicar_origem', { p_lead: leadId, p: dados, p_como: como });
  if (error) return { ok: false, aplicou: false, ausente: ausente(error) };
  return { ok: true, aplicou: data !== false, ausente: false };
}

module.exports = {
  LOTE, emLotes, ausente,
  primeirasMensagens, clientes, nomes, saidasConfirmadas,
  conversasNovas, primeirasDasConversas, frasesAtivas, rastreiosPorCodigo,
  mensagensDoContato, atividadesDoContato, agendamentosDoCliente,
  situacaoDoContato, gravarValor, gravarMotivo, aplicarOrigem,
};
