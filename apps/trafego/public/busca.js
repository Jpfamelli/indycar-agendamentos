/* ============================================================
   Busca global e atalhos (rodada 5) — a parte PURA, testável no node.
   A tela (operacao.js) só junta os itens e desenha.
   ============================================================ */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Busca = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizar(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* Atalhos de teclado: tecla → ação. Só valem fora de campo de texto e sem modal aberto
     (exceto Ctrl+K e Esc, que valem sempre). */
  var ATALHOS = [
    { tecla: '1', acao: 'aba:painel',     rotulo: 'Painel' },
    { tecla: '2', acao: 'aba:leads',      rotulo: 'Leads' },
    { tecla: '3', acao: 'aba:resultados', rotulo: 'Resultados CRM' },
    { tecla: '4', acao: 'aba:campanhas',  rotulo: 'Campanhas' },
    { tecla: '5', acao: 'aba:criativos',  rotulo: 'Criativos' },
    { tecla: '6', acao: 'aba:radar',      rotulo: 'Radar' },
    { tecla: '7', acao: 'aba:relatorios', rotulo: 'Relatórios' },
    { tecla: '8', acao: 'aba:ajustes',    rotulo: 'Ajustes' },
    { tecla: 'Ctrl+K', acao: 'busca',     rotulo: 'Buscar em tudo (campanha, regra, lead, aba)' },
    { tecla: '/', acao: 'busca',          rotulo: 'Buscar (igual ao Ctrl+K)' },
    { tecla: 'r', acao: 'atualizar',      rotulo: 'Atualizar os dados da aba' },
    { tecla: 't', acao: 'tema',           rotulo: 'Trocar tema claro/escuro' },
    { tecla: 'n', acao: 'nova-regra',     rotulo: 'Nova regra (no Radar)' },
    { tecla: 'e', acao: 'exportar',       rotulo: 'Exportar CSV da aba' },
    { tecla: 'p', acao: 'imprimir',       rotulo: 'Imprimir a aba (sem menus)' },
    { tecla: '?', acao: 'ajuda',          rotulo: 'Esta ajuda' },
    { tecla: 'Esc', acao: 'fechar',       rotulo: 'Fechar menu, busca ou janela' },
  ];

  /**
   * Decide a ação de um evento de teclado (puro): recebe { key, ctrlKey, metaKey, altKey, emCampo, modalAberto }.
   * Devolve a ação ('aba:leads', 'busca', …) ou null.
   */
  function acaoDaTecla(ev) {
    var k = ev.key || '';
    var ctrl = !!(ev.ctrlKey || ev.metaKey);
    if (ctrl && (k === 'k' || k === 'K')) return 'busca';
    if (k === 'Escape') return 'fechar';
    if (ctrl || ev.altKey) return null;
    if (ev.emCampo || ev.modalAberto) return null;
    if (k === '/') return 'busca';
    if (k === '?') return 'ajuda';
    for (var i = 0; i < ATALHOS.length; i++) {
      var a = ATALHOS[i];
      if (a.tecla.length === 1 && a.tecla !== '/' && a.tecla !== '?' && a.tecla.toLowerCase() === k.toLowerCase()) return a.acao;
    }
    return null;
  }

  /**
   * Filtra itens { tipo, titulo, detalhe, telefone? } pelo termo. Pontua: começa com > contém.
   * Telefone casa pelos dígitos (4+). Devolve até `limite`, melhores primeiro.
   */
  function filtrar(itens, termo, limite) {
    var q = normalizar(termo), d = digitos(termo);
    if (!q) return [];
    var saida = [];
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i];
      var alvo = normalizar((it.titulo || '') + ' ' + (it.detalhe || '') + ' ' + (it.tipo || ''));
      var pontos = 0;
      if (normalizar(it.titulo).indexOf(q) === 0) pontos = 3;
      else if (alvo.indexOf(q) >= 0) pontos = 2;
      else if (d.length >= 4 && digitos(it.telefone).indexOf(d) >= 0) pontos = 2;
      else {
        // todas as palavras do termo aparecem (em qualquer ordem)
        var palavras = q.split(' '), todas = palavras.length > 1;
        for (var j = 0; j < palavras.length && todas; j++) if (alvo.indexOf(palavras[j]) < 0) todas = false;
        if (todas) pontos = 1;
      }
      if (pontos) saida.push({ item: it, pontos: pontos, ordem: i });
    }
    saida.sort(function (a, b) { return b.pontos - a.pontos || a.ordem - b.ordem; });
    return saida.slice(0, limite || 12).map(function (x) { return x.item; });
  }

  /** Vale procurar no servidor (leads)? Nome com 3+ letras ou telefone com 4+ dígitos. */
  function valeBuscarNoCRM(termo) {
    var q = normalizar(termo), d = digitos(termo);
    return d.length >= 4 || q.replace(/[^a-z]/g, '').length >= 3;
  }

  return { ATALHOS: ATALHOS, acaoDaTecla: acaoDaTecla, filtrar: filtrar, normalizar: normalizar, digitos: digitos, valeBuscarNoCRM: valeBuscarNoCRM };
});
