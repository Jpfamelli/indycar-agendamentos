/* Rodada 13: contas da tela de entrada (Hoje) e da frase do Painel. Funções puras, sem DOM:
   rodam no navegador (window.CrmR13) e nos testes (require). */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CrmR13 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DIA = 86400000;
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; };
  const ABERTAS = ['novo', 'contato', 'orcamento', 'agendado', 'em_servico'];
  const ehCortesia = obs => /Cortesia: sem cobran/i.test(String(obs || ''));
  /* R13C: valor do serviço pela regra única (o servidor manda valor_servico); sem ele, o lançado */
  const valorFechado = l => (l && l.valor_servico !== undefined ? num(l.valor_servico) : num(l && l.valor_pago));
  const semValor = l => !!l && l.status === 'concluido' && !(valorFechado(l) > 0) && !ehCortesia(l.observacoes);
  const inicioDoDia = agora => { const d = new Date(agora); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const fechouEm = l => ms(l.closed_at || l.updated_at || l.created_at);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  /* Resumo do dia. Atendente vê o que é dele (e os sem responsável nos "novos");
     gestor vê a loja inteira. */
  function resumoHoje(leads, agora = Date.now(), {euId = null, gestor = true} = {}) {
    const hoje = inicioDoDia(agora), amanha = hoje + DIA;
    const meu = l => gestor || !euId || String(l.responsavel_id || '') === String(euId);
    const todos = (leads || []).filter(Boolean);
    const novos = todos.filter(l => { const t = ms(l.created_at); return t >= hoje && t < amanha && (meu(l) || !l.responsavel_id); });
    const fechados = todos.filter(l => l.status === 'concluido' && meu(l) && fechouEm(l) >= hoje && fechouEm(l) < amanha);
    const faltaValor = todos.filter(l => semValor(l) && meu(l))
      .sort((a, b) => (fechouEm(b) || 0) - (fechouEm(a) || 0));
    const abertos = todos.filter(l => ABERTAS.includes(l.status) && meu(l));
    return {
      novos: novos.length,
      fechados: fechados.length,
      faturouHoje: Math.round(fechados.reduce((s, l) => s + valorFechado(l), 0) * 100) / 100,
      faltaValor,
      abertos: abertos.length,
      emAberto: Math.round(abertos.reduce((s, l) => s + (num(l.valor_orcado) || 0), 0) * 100) / 100,
      porEtapa: ABERTAS.map(e => { const ls = abertos.filter(l => l.status === e); return {etapa: e, qtd: ls.length, valor: Math.round(ls.reduce((s, l) => s + num(l.valor_orcado), 0) * 100) / 100}; }),
    };
  }

  /* A frase grande, em pedaços: {t: texto} ou {n: número em destaque}. */
  function fraseHoje(r, paraRetornar) {
    const p = [{t: 'Hoje '}];
    p.push({t: r.novos === 1 ? 'entrou ' : 'entraram '}, {n: r.novos}, {t: r.novos === 1 ? ' contato novo, ' : ' contatos novos, '});
    const ret = Number.isFinite(paraRetornar) ? paraRetornar : null;
    if (ret !== null) p.push({n: ret}, {t: ret === 1 ? ' pede retorno' : ' pedem retorno'});
    else p.push({n: r.abertos}, {t: r.abertos === 1 ? ' está em aberto' : ' estão em aberto'});
    const f = r.faltaValor.length;
    if (f) p.push({t: ' e '}, {n: f}, {t: f === 1 ? ' serviço fechado está sem valor.' : ' serviços fechados estão sem valor.'});
    else p.push({t: ' e todo serviço fechado já tem valor.'});
    return p;
  }

  /* Contatos que entraram por dia (do mais antigo ao de hoje). */
  function entradasPorDia(leads, agora = Date.now(), dias = 14) {
    const hoje = inicioDoDia(agora), saida = [];
    for (let i = dias - 1; i >= 0; i--) {
      const ini = hoje - i * DIA, fim = ini + DIA;
      const doDia = (leads || []).filter(l => { const t = ms(l?.created_at); return t >= ini && t < fim; });
      const fech = (leads || []).filter(l => l?.status === 'concluido' && fechouEm(l) >= ini && fechouEm(l) < fim);
      saida.push({dia: new Date(ini).toISOString().slice(0, 10), ini, entraram: doDia.length, fecharam: fech.length, hoje: i === 0});
    }
    return saida;
  }

  /* Frase do Painel para o período escolhido (métricas de CrmUtils.metricas). */
  function frasePeriodo(m, rotulo, faltaValor = 0) {
    const p = [{t: rotulo + ', '}];
    p.push({t: m.entradas === 1 ? 'entrou ' : 'entraram '}, {n: m.entradas}, {t: m.entradas === 1 ? ' contato, ' : ' contatos, '});
    p.push({n: m.ganhos}, {t: m.ganhos === 1 ? ' fechou serviço' : ' fecharam serviço'});
    p.push({t: ' e o caixa registrou '}, {n: m.faturamento, moeda: true}, {t: '.'});
    if (faltaValor) p.push({t: ` (${plural(faltaValor, 'serviço ainda sem valor', 'serviços ainda sem valor')})`});
    return p;
  }

  /* Rótulo do período do Painel ("Nos últimos 7 dias", "Hoje"…). */
  function rotuloPeriodo(chave) {
    return {hoje: 'Hoje', '7': 'Nos últimos 7 dias', '30': 'Nos últimos 30 dias', mes: 'Neste mês', personalizado: 'No período escolhido'}[chave] || 'No período';
  }

  return {resumoHoje, fraseHoje, entradasPorDia, frasePeriodo, rotuloPeriodo, semValor, ABERTAS};
});
