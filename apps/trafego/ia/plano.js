/* ============================================================
   Plano da semana do Gestor IA (rodada 8, frente T5b).

   O plano é uma conversa do Gestor com uma pergunta fixa (ia/instrucoes.js: perguntaDoPlano), guardada em
   trafego_ia_conversas como conversa da oficina: perfil_id nulo, título "Plano da semana (dd/mm)" e plano: true
   na primeira mensagem. As propostas que ele registrar vão para o diário como qualquer outra (status "proposta").
   Sem conta de anúncio ligada, a pergunta manda falar de origem, caminho do contato e pendências, sem inventar custo.
   ============================================================ */
'use strict';

const G = require('./gestor');
const I = require('./instrucoes');
const P = require('../motor/periodo');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUNAS = 'id, perfil_id, titulo, mensagens, criada_em, atualizada_em';

const tabelaAusente = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .* does not exist/i.test(String(e.message || '')));

/** "últimos 7 e 30 dias (21/10 a 19/11)" */
const rotuloDaBase = (de, ate) => `últimos 7 e 30 dias (${P.ddmm(de)} a ${P.ddmm(ate)})`;

/** A conversa de plano no formato da API (§2 de API-gestor.md). Sem resposta do Gestor ainda: null. */
function formatarPlano(conversa, { nomes = new Map() } = {}) {
  if (!G.ehPlano(conversa)) return null;
  const ms = conversa.mensagens;
  const pedido = ms.find(m => m && m.papel === 'pessoa') || {};
  const resposta = [...ms].reverse().find(m => m && m.papel === 'gestor');
  if (!resposta) return null;
  const base = resposta.baseado_em && resposta.baseado_em.de ? resposta.baseado_em : null;
  const quem = pedido.pedido_por ? nomes.get(String(pedido.pedido_por)) : null;
  return {
    id: conversa.id,
    feito_em: resposta.em || conversa.atualizada_em || null,
    texto: resposta.texto || '',
    propostas: Array.isArray(resposta.propostas) ? resposta.propostas : [],
    baseado_em: base ? { de: base.de, ate: base.ate, dias: [7, 30], rotulo: rotuloDaBase(base.de, base.ate) } : null,
    pedido_por: pedido.pedido_por ? (quem ? quem.nome : 'Pessoa da equipe') : null,
    parou: resposta.parou || null,
    erro: resposta.erro ? resposta.erro.erro || null : null,
  };
}

/**
 * Cria o plano. Opções (para teste): gestor (ia/gestor), sb, nomesDosPerfis(ids) → Map(id → { nome }).
 */
function criarPlano(opcoes = {}) {
  const cfg = { gestor: null, sb: null, nomesDosPerfis: null, ...opcoes };
  const gestor = () => cfg.gestor || G.padrao();
  const banco = () => cfg.sb || gestor().config.sb || require('../db').sb;
  let gerando = false;

  async function nomesDe(ids) {
    const unicos = [...new Set(ids.filter(x => UUID.test(String(x || ''))))];
    if (!unicos.length) return new Map();
    try {
      const fn = cfg.nomesDosPerfis || (lista => require('../equipe').banco().nomesDosPerfis(lista));
      const m = await fn(unicos);
      return m instanceof Map ? m : new Map();
    } catch { return new Map(); }
  }

  /** GET /api/gestor/plano: o plano mais recente que tem texto. */
  async function ultimo() {
    const { data, error } = await banco().from('trafego_ia_conversas').select(COLUNAS)
      .is('perfil_id', null).ilike('titulo', `${I.PREFIXO_DO_PLANO}%`).order('criada_em', { ascending: false }).limit(10);
    if (error) {
      if (tabelaAusente(error)) return { ligado: false, aviso: G.FALTA_MIGRACAO, plano: null };
      throw new G.ErroDoGestor(503, 'temporario', 'Não deu para ler o plano da semana agora. Tente de novo em instantes.');
    }
    const conversa = (data || []).find(c => {
      const p = formatarPlano(c);
      return p && p.texto.trim();
    });
    if (!conversa) return { ligado: true, aviso: null, plano: null };
    const pedido = conversa.mensagens.find(m => m && m.papel === 'pessoa') || {};
    return { ligado: true, aviso: null, plano: formatarPlano(conversa, { nomes: await nomesDe([pedido.pedido_por]) }) };
  }

  /**
   * POST /api/gestor/plano e a rotina da semana: faz um plano novo (até 90 s).
   * usuario = quem pediu na tela (null na rotina). Erro antes de começar: ErroDoGestor (JSON com status).
   * IA não terminou: ErroDoGestor 502 com `plano` (o que chegou até ali) no extra.
   */
  async function gerar({ usuario = null } = {}) {
    if (gerando) throw new G.ErroDoGestor(409, 'plano_em_andamento', 'Um plano da semana já está sendo feito agora. Espere um minuto e atualize a tela.');
    gerando = true;
    try {
      const g = gestor();
      const pedido = await g.preparar({ usuario, corpo: {}, plano: true });
      const out = await g.responder(pedido, { emitir: () => {} });
      const periodos = I.periodosDoPlano(Date.parse(out.em) || Date.now());
      const nomes = await nomesDe([pedido.perfilId]);
      const quem = pedido.perfilId ? nomes.get(String(pedido.perfilId)) : null;
      const plano = {
        id: out.conversa_id, feito_em: out.em, texto: out.texto, propostas: out.propostas,
        baseado_em: { de: periodos.p30.de, ate: periodos.p30.ate, dias: [7, 30], rotulo: rotuloDaBase(periodos.p30.de, periodos.p30.ate) },
        pedido_por: pedido.perfilId ? (quem ? quem.nome : 'Pessoa da equipe') : null,
        parou: out.erro ? null : out.parou, erro: out.erro ? out.erro.erro : null, uso: out.uso,
      };
      if (out.erro) throw new G.ErroDoGestor(502, out.erro.codigo, out.erro.erro, { extra: { plano } });
      return { ok: true, plano, ...(out.aviso ? { aviso: out.aviso } : {}) };
    } finally {
      gerando = false;
    }
  }

  /** POST /api/cron/plano: nunca lança; devolve { ok, plano } ou { ok: false, codigo, erro }. */
  async function rotina() {
    try {
      const r = await gerar({ usuario: null });
      return { ok: true, plano: { id: r.plano.id, feito_em: r.plano.feito_em, propostas: r.plano.propostas, parou: r.plano.parou } };
    } catch (e) {
      if (e && e.publico) return { ok: false, codigo: e.codigo || 'interno', erro: e.message };
      return { ok: false, codigo: 'interno', erro: 'O plano da semana não saiu desta vez.' };
    }
  }

  return { ultimo, gerar, rotina, trocar(novas = {}) { Object.assign(cfg, novas); } };
}

let _padrao = null;
const padrao = () => (_padrao || (_padrao = criarPlano()));

module.exports = { formatarPlano, rotuloDaBase, criarPlano, padrao };
