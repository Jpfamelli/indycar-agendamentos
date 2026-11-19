/* ============================================================
   Fila do Comunicar (rodada 5, 16/10/2026).

   Nenhuma mensagem de WhatsApp sai daqui direto: relatório diário, alertas
   do radar e teste de canal entram em `posvenda_envios` com criado_por 'ads'
   e o carteiro do Comunicar (acordado pelo pg_cron a cada 15 min, 8h–21h)
   entrega pelo aparelho do CodeWords. Vantagens: uma única fila com
   histórico, tentativas, opt-out (PARAR) e horário respeitados; o Ads não
   precisa conhecer chave nenhuma do CodeWords.

   `chave_unica` evita duplicar: o mesmo relatório para o mesmo número só
   entra uma vez (409 → já estava na fila).
   ============================================================ */
'use strict';

const Eco = require('./public/ecossistema.js');

const TIPO = 'avulsa';          // tipo aceito pela CHECK de posvenda_envios
const CRIADO_POR = 'ads';
const LIMITE_CORPO = 3900;      // abaixo do teto do CodeWords (4096)

/* Injetável nos testes: { sb } com from().insert().select().single(). */
function criar(sb) {
  /**
   * Põe UMA mensagem na fila. Devolve { ok, id, duplicada } — nunca lança por duplicata.
   * @param {object} m  telefone, corpo, chave (chave_unica), lead_id, cliente_id, agendamento_id, enviar_em, nome
   */
  async function enfileirar(m) {
    const telefone = Eco.telefone(m.telefone);
    const corpo = String(m.corpo || '').trim().slice(0, LIMITE_CORPO);
    if (!telefone || telefone.length < 12 || telefone.length > 15) throw new Error('Número de destino inválido.');
    if (!corpo) throw new Error('Mensagem vazia.');
    const linha = {
      telefone, corpo, tipo: TIPO, criado_por: CRIADO_POR, status: 'pendente',
      nome: m.nome ? String(m.nome).slice(0, 120) : null,
      enviar_em: m.enviar_em || new Date().toISOString(),
      chave_unica: m.chave ? String(m.chave).slice(0, 200) : null,
      lead_id: m.lead_id || null, cliente_id: m.cliente_id || null, agendamento_id: m.agendamento_id || null,
      criado_por_id: m.perfil_id || null,
    };
    const { data, error } = await sb.from('posvenda_envios').insert(linha).select('id, status, enviar_em').single();
    if (error) {
      // 23505 = chave_unica repetida: a mensagem já estava na fila — não é erro.
      if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) return { ok: true, duplicada: true, id: null, via: 'fila' };
      throw new Error(`Fila do Comunicar não aceitou a mensagem: ${error.message || error}`);
    }
    return { ok: true, duplicada: false, id: data?.id || null, enviar_em: data?.enviar_em || linha.enviar_em, via: 'fila' };
  }

  /** Vários destinos; um número ruim não impede os outros. `chave` ganha o sufixo do telefone. */
  async function enfileirarParaTodos(destinos, corpo, { chave = null, perfil_id = null } = {}) {
    const saida = [];
    for (const d of destinos || []) {
      const tel = Eco.telefone(d);
      try {
        const r = await enfileirar({ telefone: tel, corpo, chave: chave ? `${chave}:${tel}` : null, perfil_id });
        saida.push({ destino: tel, ok: true, via: 'fila', id: r.id, duplicada: r.duplicada });
      } catch (e) { saida.push({ destino: tel, ok: false, erro: e.message }); }
    }
    return saida;
  }

  /** Situação da fila do Ads: últimos envios criados por 'ads' e contagens por status. */
  async function situacao({ limite = 20 } = {}) {
    const { data, error } = await sb.from('posvenda_envios')
      .select('id, telefone, tipo, status, erro, enviar_em, enviado_em, created_at, tentativas, chave_unica')
      .eq('criado_por', CRIADO_POR).order('created_at', { ascending: false }).limit(limite);
    if (error) throw new Error('Não foi possível ler a fila do Comunicar agora.');
    const lista = data || [];
    const por = { pendente: 0, enviado: 0, falhou: 0, cancelado: 0, pulado: 0 };
    for (const e of lista) if (e.status in por) por[e.status]++;
    const ultimoEnviado = lista.find(e => e.status === 'enviado') || null;
    const ultimaFalha = lista.find(e => e.status === 'falhou') || null;
    return {
      por_status: por,
      ultimo_enviado_em: ultimoEnviado?.enviado_em || null,
      ultima_falha: ultimaFalha ? { quando: ultimaFalha.created_at, erro: String(ultimaFalha.erro || '').slice(0, 160) } : null,
      recentes: lista.map(e => ({ id: e.id, telefone: e.telefone, status: e.status, erro: e.erro ? String(e.erro).slice(0, 160) : null,
        enviar_em: e.enviar_em, enviado_em: e.enviado_em, created_at: e.created_at, tentativas: e.tentativas, chave: e.chave_unica })),
    };
  }

  return { enfileirar, enfileirarParaTodos, situacao };
}

let padrao = null;
function fila() {
  if (!padrao) padrao = criar(require('./db').sb);
  return padrao;
}

module.exports = { criar, fila, TIPO, CRIADO_POR, LIMITE_CORPO };
