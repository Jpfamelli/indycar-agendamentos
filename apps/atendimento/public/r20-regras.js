/* ============================================================
   IndyCar Atendimento · r20-regras.js (Rodada 20, 26/11/2026)
   Regras do Atendimento dentro do app "CRM e Atendimento" (sem DOM).
   Carregado no navegador (window.R20Regras) e no Node. Testado em test/r20-unificado.test.js.
     · escolherCartao: qual cartão aberto do funil o horário marcado pela conversa leva para "Agendado"
     · moverCartaoParaAgendado: grava essa mudança (ou devolve null para nascer um cartão novo, como antes)
     · telefonesIguais: as formas do mesmo telefone (com e sem 55) para achar o cartão de quem não tem cadastro
   ============================================================ */
(function (raiz) {
  'use strict';

  /* Só o que ainda não tem horário: um cartão que já está em "Agendado" é de outro horário (outro serviço) e não é
     reaproveitado; "Em serviço", "Concluído" e "Perdido" também não. */
  const ANTES_DE_AGENDAR = ['novo', 'contato', 'orcamento'];
  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const digitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  /** As formas em que o mesmo telefone aparece gravado: só DDD+número e com o 55 na frente. */
  function telefonesIguais(v) {
    let d = digitos(v);
    if (d.length === 12 || d.length === 13) d = d.replace(/^55/, '');
    if (d.length !== 10 && d.length !== 11) return [];
    return [d, '55' + d, '+55' + d];
  }

  /** Dos cartões do cliente, o que o horário novo leva para "Agendado": o aberto mexido por último. */
  function escolherCartao(leads) {
    const abertos = (leads || []).filter((l) => l && l.id && ANTES_DE_AGENDAR.includes(l.status));
    if (!abertos.length) return null;
    const quando = (l) => String(l.updated_at || l.created_at || '');
    return abertos.sort((a, b) => (quando(a) < quando(b) ? 1 : quando(a) > quando(b) ? -1 : 0))[0];
  }

  /** O que muda no cartão: a etapa sempre; serviço, valor, carro e placa só quando o horário trouxe (não apaga o que havia).
   *  A origem do cartão NÃO muda: é ela que diz de onde o cliente veio. */
  function camposDoAgendado(cartao, campos) {
    const c = campos || {};
    const m = { status: 'agendado' };
    if (c.servico) m.servico = c.servico;
    if (c.servico_id) m.servico_id = c.servico_id;
    if (Number(c.valor_orcado) > 0 || !(Number(cartao && cartao.valor_orcado) > 0)) m.valor_orcado = Number(c.valor_orcado) || 0;
    if (c.carro_modelo) m.carro_modelo = c.carro_modelo;
    if (c.placa) m.placa = c.placa;
    return m;
  }

  /**
   * Procura o cartão aberto do cliente da conversa e leva para "Agendado". Devolve o cartão gravado, ou null quando
   * não há cartão aberto, quando o banco não deixou (cartão de colega) ou quando a leitura falhou: aí quem chamou
   * cria o cartão novo, como sempre fez. Nunca lança: marcar o horário não pode parar por causa disto.
   */
  async function moverCartaoParaAgendado(sb, conv, campos) {
    try {
      if (!sb || !conv) return null;
      let q = sb.from('leads').select('id,status,responsavel_id,cliente_id,telefone,nome,servico,valor_orcado,carro_modelo,placa,created_at,updated_at').in('status', ANTES_DE_AGENDAR);
      if (RE_UUID.test(String(conv.cliente_id || ''))) q = q.eq('cliente_id', conv.cliente_id);
      else {
        const tels = telefonesIguais(conv.telefone_e164 || conv.telefone);
        if (!tels.length) return null;
        q = q.in('telefone', tels);
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(20);
      if (error) return null;
      const cartao = escolherCartao(data);
      if (!cartao) return null;
      const r = await sb.from('leads').update(camposDoAgendado(cartao, campos)).eq('id', cartao.id).in('status', ANTES_DE_AGENDAR).select();
      if (r.error || !Array.isArray(r.data) || !r.data.length) return null;   // 0 linhas = a regra do banco barrou (cartão de colega)
      return r.data[0];
    } catch (e) { return null; }
  }

  const api = { ANTES_DE_AGENDAR, telefonesIguais, escolherCartao, camposDoAgendado, moverCartaoParaAgendado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.R20Regras = api;
})(typeof window !== 'undefined' ? window : globalThis);
