/* ============================================================
   Rede e servidor acordando (rodada 4, 14/10/2026).
   O Render gratuito dorme: a primeira chamada pode voltar 502/503/504
   ("hibernate-wake-error") ou cair a conexão por alguns minutos.
   Aqui ficam as regras puras de "tentar de novo com espera crescente";
   a tela (app.js/conta.js) só mostra a faixa e a contagem.
   Funciona no navegador (window.Rede) e no node:test (require).
   ============================================================ */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Rede = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 2 s, 5 s, 10 s, 20 s, 40 s, 1 min, 1 min ≈ 3 min no total. */
  const ESPERAS = [2000, 5000, 10000, 20000, 40000, 60000, 60000];

  /** Status que querem dizer "servidor dormindo/acordando ou caminho caiu". 0 = sem resposta (rede). */
  function passageiro(status) {
    return status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504
      || status === 520 || status === 521 || status === 522 || status === 523 || status === 524;
  }

  /** Só GET (e HEAD) repete sozinho: gravar duas vezes (POST) nunca. */
  function podeRepetir(metodo) {
    const m = String(metodo || 'GET').toUpperCase();
    return m === 'GET' || m === 'HEAD';
  }

  function espera(n, esperas) {
    const lista = esperas || ESPERAS;
    return n >= 0 && n < lista.length ? lista[n] : null;
  }

  function textoEspera(ms) {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return 'em ' + s + ' s';
    const m = Math.floor(s / 60), r = s % 60;
    return r ? 'em ' + m + ' min ' + r + ' s' : 'em ' + m + ' min';
  }

  /** Frase para a pessoa (nunca "Erro 503" cru). */
  function mensagem(status, online) {
    if (online === false) return 'Sem internet. O que está na tela continua aqui; assim que a conexão voltar eu tento de novo.';
    if (status === 0) return 'Não consegui falar com o servidor. O que está na tela continua aqui; tente de novo em instantes.';
    if (status === 429) return 'Muitos pedidos seguidos. Espere um pouco e tente de novo.';
    if (passageiro(status)) return 'O sistema está acordando (o servidor gratuito dorme quando ninguém usa). O que está na tela continua aqui; tente de novo em instantes.';
    return null;
  }

  /**
   * Roda `tarefa(tentativa)` e repete enquanto ela lançar erro com `status` passageiro.
   * `aoEsperar(ms, tentativa)` avisa a tela; `dormir(ms)` é trocável no teste; `cancelado()` interrompe.
   */
  async function comNovasTentativas(tarefa, op) {
    const o = op || {};
    const dormir = o.dormir || (ms => new Promise(r => setTimeout(r, ms)));
    for (let n = 0; ; n++) {
      try {
        return await tarefa(n);
      } catch (e) {
        const ms = espera(n, o.esperas);
        const status = e && typeof e.status === 'number' ? e.status : null;
        if (ms === null || status === null || !passageiro(status) || (o.cancelado && o.cancelado())) throw e;
        if (o.aoEsperar) o.aoEsperar(ms, n + 1, e);
        await dormir(ms);
        if (o.cancelado && o.cancelado()) throw e;
      }
    }
  }

  return { ESPERAS, passageiro, podeRepetir, espera, textoEspera, mensagem, comNovasTentativas };
});
