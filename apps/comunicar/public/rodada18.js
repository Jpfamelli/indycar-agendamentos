/* ===================== IndyCar Comunicar — Rodada 18 (25/11/2026) =====================
   Com o WhatsApp da oficina PARADO (chave do CodeWords recusada) ou o envio em pausa,
   nada sai. A tela não pode dar a entender que saiu ou que vai sair hoje:
   • cada régua ligada diz "Retida", quantas esperam na fila e que voltam sozinhas;
   • o histórico de campanhas troca "N na fila" por "N retidas" e mostra UMA linha
     dizendo quantas mensagens de campanha esperam a chave;
   • em Mensagens a pílula "Na fila" vira "Retida";
   • aprovar campanha avisa que ela entra na fila mas fica retida.
   Nada é enviado nem gravado a mais por esta camada: só texto.
   Funções PURAS testadas em scripts/testes-r18.mjs. Quem chama escapa (esc) o texto.
   ====================================================================================== */
(function () {
  'use strict';

  function n(x) { var v = Number(x); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }
  function msgs(q) { return q === 1 ? 'mensagem' : 'mensagens'; }

  /** parado | pausa ⇒ retida. Qualquer outro estado (ok, atencao, desconhecido) segue normal. */
  function retida(estado) { return estado === 'parado' || estado === 'pausa'; }

  /** De onde voltam: a chave nova (parado) ou tirar a pausa (pausa). */
  function quandoVolta(estado) {
    return estado === 'pausa' ? 'Voltam sozinhas quando a pausa for tirada em Ajustes.' : 'Voltam sozinhas quando a chave do WhatsApp for colada.';
  }

  /**
   * Texto da linha de cada régua (onde mora a "Próxima saída").
   * Devolve null quando não está retida (a "Próxima saída" normal continua valendo).
   */
  function textoRegua(opcoes) {
    var o = opcoes || {};
    if (!o.ativo || !retida(o.estado)) return null;
    var q = n(o.naFila);
    var chave = o.estado === 'pausa' ? 'a pausa for tirada em Ajustes' : 'a chave do WhatsApp for colada';
    if (!q) return { selo: 'Retida', texto: 'Nada sai até ' + (o.estado === 'pausa' ? 'a pausa ser tirada em Ajustes.' : 'a chave do WhatsApp ser colada.') };
    return { selo: 'Retida · ' + q + ' na fila', texto: (q === 1 ? 'Sai sozinha' : 'Saem sozinhas') + ' quando ' + chave + '.' };
  }

  /** "3 na fila" (normal) ou "3 retidas" (parado/pausa). */
  function rotuloFila(q, estado) {
    var x = n(q);
    if (!x) return '';
    if (!retida(estado)) return x + ' na fila';
    return x + (x === 1 ? ' retida' : ' retidas');
  }

  /** A linha única no alto do histórico de campanhas. null quando não há o que dizer. */
  function avisoCampanhas(totalNaFila, estado) {
    if (!retida(estado)) return null;
    var q = n(totalNaFila);
    var porque = estado === 'pausa' ? 'O envio está em pausa' : 'O WhatsApp da oficina está parado';
    if (!q) return porque + ': campanha aprovada agora entra na fila e fica retida. Nada é enviado até ele voltar.';
    return porque + ': ' + q + ' ' + msgs(q) + ' de campanha ' + (q === 1 ? 'está retida' : 'estão retidas') + ' na fila, nenhuma saiu. ' + quandoVolta(estado);
  }

  /** O "tem certeza?" de aprovar uma campanha. */
  function textoAprovar(quantos, estado) {
    var q = n(quantos);
    var quem = q ? (q + (q === 1 ? ' cliente' : ' clientes')) : 'estes clientes';
    if (!retida(estado)) return 'Aprovar para ' + quem + '? As mensagens entram na fila agora (quem pediu para parar fica fora).';
    return 'Aprovar para ' + quem + '? As mensagens entram na fila, mas ficam RETIDAS: ' +
      (estado === 'pausa' ? 'o envio está em pausa' : 'o WhatsApp da oficina está parado') + '. Nada sai agora; ' + quandoVolta(estado).toLowerCase();
  }

  /** Aviso (toast) depois de pôr na fila. */
  function textoNaFila(q, estado) {
    var x = n(q);
    var base = x + ' ' + msgs(x) + ' na fila';
    return retida(estado) ? base + ', retidas até o WhatsApp voltar (nada foi enviado)' : base;
  }

  /** Pílula do status de um envio pendente. */
  function pilulaPendente(estado) { return retida(estado) ? 'Retida' : 'Na fila'; }

  // ---------------------------------------------------------------- navegador
  var _cache = null, _noAr = null;
  /** Estado do envio, com cache de 60 s; 4 s no máximo (não trava a tela). */
  function estado(forcar) {
    if (typeof window.api !== 'function' && typeof api !== 'function') return Promise.resolve('desconhecido');
    if (!forcar && _cache && Date.now() - _cache.em < 60000) return Promise.resolve(_cache.v);
    if (!forcar && _noAr) return _noAr;
    var chamar = typeof api === 'function' ? api : window.api;
    var cfg = (typeof state === 'object' && state && state.cfg) || {};
    var tempo = new Promise(function (r) { setTimeout(function () { r(null); }, 4000); });
    _noAr = Promise.race([chamar('GET', '/whatsapp/status').catch(function () { return null; }), tempo])
      .then(function (st) {
        var e = window.R13 && window.R13.estadoEnvio ? window.R13.estadoEnvio(st, cfg) : 'desconhecido';
        definir(e);
        return e;
      })
      .finally(function () { _noAr = null; });
    return _noAr;
  }
  /** O resumo de hoje já sabe o estado: guarda para as outras telas não perguntarem de novo. */
  function definir(e) {
    _cache = { v: e, em: Date.now() };
    if (typeof state === 'object' && state) state.envioParado = retida(e) ? e : null;
  }

  /** Réguas: troca a "Próxima saída" de cada régua ligada por "Retida · N na fila". */
  function pintarReguas(alvo, est, filaPorTipo) {
    if (!alvo) return;
    var linhas = alvo.querySelectorAll('[data-proxima]'), soltou = false;
    for (var i = 0; i < linhas.length; i++) {
      var el = linhas[i], tipo = el.getAttribute('data-proxima');
      var chave = alvo.querySelector('[data-cfg="ativo_' + tipo + '"]');
      var t = textoRegua({ ativo: !!(chave && chave.checked), estado: est, naFila: (filaPorTipo || {})[tipo] });
      var selo = el.previousElementSibling && el.previousElementSibling.classList.contains('r18-retida') ? el.previousElementSibling : null;
      if (!t) {
        if (el.dataset.retida) { delete el.dataset.retida; el.classList.remove('r18-linha'); el.textContent = 'Próxima saída: calculando…'; soltou = true; }
        if (selo) selo.remove();
        continue;
      }
      el.dataset.retida = '1';
      el.classList.add('r18-linha');
      el.textContent = t.texto;
      if (!selo) {
        selo = document.createElement('span');
        selo.className = 'selo selo-ruim r18-retida';
        el.parentNode.insertBefore(selo, el);
      }
      selo.textContent = t.selo;
    }
    /* o WhatsApp voltou com a tela aberta: a "Próxima saída" normal volta a valer */
    if (soltou && window.R4 && window.R4.pintarReguas) window.R4.pintarReguas();
  }

  window.R18 = {
    retida: retida, textoRegua: textoRegua, rotuloFila: rotuloFila, avisoCampanhas: avisoCampanhas,
    textoAprovar: textoAprovar, textoNaFila: textoNaFila, pilulaPendente: pilulaPendente,
    estado: estado, definir: definir, pintarReguas: pintarReguas,
  };
})();
