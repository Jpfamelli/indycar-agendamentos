/* Rodada 14: contas da faxina dos contatos parados. Funções puras, sem DOM:
   rodam no navegador (window.CrmR14), no servidor (lib/rodada14.js) e nos testes.
   A faxina só marca "perdido (sem retorno do cliente)"; nada é apagado. */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CrmR14 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DIA = 864e5;
  const ABERTAS = ['novo', 'contato', 'orcamento', 'agendado', 'em_servico'];
  /* Só o que ninguém está atendendo de fato: agendado e em serviço pedem decisão de gente, não faxina. */
  const ETAPAS_FAXINA = ['novo', 'contato', 'orcamento'];
  const ETAPAS_DECISAO = ['agendado', 'em_servico'];
  const DIAS_OPCOES = [14, 30, 60, 90];
  const MOTIVO_FAXINA = 'Sem retorno do cliente';

  const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; };
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const motivoDe = obs => { const m = /^Motivo da perda: (.+)$/m.exec(String(obs ?? '')); return m ? m[1].trim() : null; };

  /** Última vez que alguém mexeu no contato (o mais recente entre atualização, último contato e criação). */
  function ultimaMexida(l) {
    const ts = [l && l.updated_at, l && l.ultimo_contato_em, l && l.created_at].map(ms).filter(Number.isFinite);
    return ts.length ? Math.max(...ts) : NaN;
  }
  function diasParado(l, agora = Date.now()) {
    const t = ultimaMexida(l);
    return Number.isFinite(t) ? Math.max(0, Math.floor((agora - t) / DIA)) : 0;
  }
  const escopoValido = e => (e === 'todos' ? 'todos' : 'sem-dono');
  const diasValidos = d => { const n = Math.round(Number(d)); return Number.isFinite(n) ? Math.max(7, Math.min(365, n)) : 30; };

  /**
   * Quem entra na faxina. `ultimaConversa` = Map(lead.id -> ms da última mensagem do cliente no WhatsApp).
   * Devolve os itens (mais parados primeiro) e quantos ficaram de fora e por quê.
   */
  function selecionarFaxina(leads, { dias = 30, escopo = 'sem-dono', agora = Date.now(), ultimaConversa = new Map() } = {}) {
    dias = diasValidos(dias); escopo = escopoValido(escopo);
    const itens = []; let foraConversa = 0, foraRetorno = 0;
    for (const l of leads || []) {
      if (!l || !ETAPAS_FAXINA.includes(l.status)) continue;
      if (escopo === 'sem-dono' && l.responsavel_id) continue;
      const d = diasParado(l, agora);
      if (d < dias) continue;
      if (ms(l.proximo_contato_em) > agora) { foraRetorno++; continue; }
      const c = ultimaConversa.get(l.id);
      if (Number.isFinite(c) && agora - c < dias * DIA) { foraConversa++; continue; }
      itens.push({ id: l.id, nome: l.nome || '', status: l.status, origem: l.origem || 'organico', dias: d, valor_orcado: r2(l.valor_orcado), responsavel_id: l.responsavel_id || null });
    }
    itens.sort((a, b) => b.dias - a.dias || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return { dias, escopo, itens, foraConversa, foraRetorno };
  }

  /** Resumo para o painel da faxina: total, etapas, valor orçado e quantos cada prazo pegaria. */
  function resumoFaxina(leads, { escopo = 'sem-dono', agora = Date.now(), ultimaConversa = new Map(), dias = 30 } = {}) {
    const sel = selecionarFaxina(leads, { dias, escopo, agora, ultimaConversa });
    const contagens = {};
    for (const d of DIAS_OPCOES) contagens[d] = selecionarFaxina(leads, { dias: d, escopo, agora, ultimaConversa }).itens.length;
    const porEtapa = {};
    for (const i of sel.itens) porEtapa[i.status] = (porEtapa[i.status] || 0) + 1;
    const abertosSem = (leads || []).filter(l => l && !l.responsavel_id && ABERTAS.includes(l.status));
    const decisao = {}, noLixo = new Set(sel.itens.map(i => i.id));
    for (const l of abertosSem) if (ETAPAS_DECISAO.includes(l.status) && diasParado(l, agora) >= sel.dias) decisao[l.status] = (decisao[l.status] || 0) + 1;
    return { dias: sel.dias, escopo: sel.escopo, total: sel.itens.length, porEtapa, valorOrcado: r2(sel.itens.reduce((s, i) => s + i.valor_orcado, 0)),
      contagens, foraConversa: sel.foraConversa, foraRetorno: sel.foraRetorno, decisao,
      abertosSemResponsavel: abertosSem.length, vivos: abertosSem.filter(l => !noLixo.has(l.id)).length,
      itens: sel.itens };
  }

  /** Observações do contato com o motivo da perda padronizado (e uma linha dizendo que foi a faxina). */
  function observacoesDaFaxina(obs, dias) {
    const base = String(obs ?? '').trimEnd();
    const motivo = motivoDe(base) ? '' : `Motivo da perda: ${MOTIVO_FAXINA}`;
    const nota = `Faxina: parado há ${dias} dia${dias === 1 ? '' : 's'}, marcado como perdido em lote`;
    return [base, motivo, nota].filter(Boolean).join('\n').slice(0, 4000);
  }

  return { selecionarFaxina, resumoFaxina, observacoesDaFaxina, diasParado, ultimaMexida, diasValidos, escopoValido, ETAPAS_FAXINA, ETAPAS_DECISAO, DIAS_OPCOES, MOTIVO_FAXINA, ABERTAS };
});
