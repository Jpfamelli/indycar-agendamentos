/* ============================================================
   Vocabulário da casa (rodada 5). Todo texto que sai do app por WhatsApp
   ou sino passa por aqui: palavras proibidas pelo dono viram as da casa e
   o teste confere que nenhum relatório/alerta escapa.
   Funciona no navegador e no node.
   ============================================================ */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Vocabulario = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLOGAN = 'Quem conhece, Indyca! 🏎';
  var HORARIO = 'seg–sáb, 8h às 17h30';

  /* [regex, troca] — a ordem importa. */
  var TROCAS = [
    [/\bprezad[oa]s?\b/gi, 'olá'],
    [/\befetuar\b/gi, 'fazer'],
    [/\befetuado\b/gi, 'feito'],
    [/\befetuada\b/gi, 'feita'],
    [/\bcomparecer\b/gi, 'vir'],
    [/\bcompareceu\b/gi, 'veio'],
    [/\bcompareceram\b/gi, 'vieram'],
    [/\bcomparecimento\b/gi, 'presença'],
    [/\bve[ií]culos\b/gi, 'carros'],
    [/\bve[ií]culo\b/gi, 'carro'],
  ];
  var PROIBIDAS = /\b(prezad[oa]s?|efetuar|efetuad[oa]|comparecer|compareceu|compareceram|ve[ií]culos?)\b/i;

  /** Devolve as palavras proibidas encontradas (lista vazia = texto limpo). */
  function conferir(texto) {
    var achadas = [], re = new RegExp(PROIBIDAS.source, 'gi'), m;
    while ((m = re.exec(String(texto || '')))) achadas.push(m[0]);
    return achadas;
  }

  /** Troca as palavras proibidas pelas da casa, mantendo maiúscula inicial. */
  function limpar(texto) {
    var t = String(texto == null ? '' : texto);
    for (var i = 0; i < TROCAS.length; i++) {
      t = t.replace(TROCAS[i][0], function (m) {
        var s = TROCAS[i][1];
        return m.charAt(0) === m.charAt(0).toUpperCase() && m.charAt(0) !== m.charAt(0).toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s;
      });
    }
    return t;
  }

  return { SLOGAN: SLOGAN, HORARIO: HORARIO, PROIBIDAS: PROIBIDAS, conferir: conferir, limpar: limpar };
});
