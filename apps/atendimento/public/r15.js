/* Rodada 15: dois atalhos pequenos da conversa aberta.
   1) Modo "digitando" (celular): a classe `digitando` no body liga enquanto o campo de resposta tem o foco; o r15.css
      esconde o que fica entre o nome e as mensagens. Ao sair do campo espera 250 ms para a tela não pular debaixo do dedo
      no toque do botão Enviar.
   2) Botão "Próxima" no topo da conversa: vai direto para o próximo cliente da fila (o mesmo do Alt+P), sem voltar à lista. */
(function () {
  'use strict';
  var campo = document.getElementById('campoMensagem');
  var tela = function () { try { return window.matchMedia('(max-width: 900px)').matches; } catch (e) { return false; } };
  var t;
  if (campo) {
    campo.addEventListener('focus', function () { clearTimeout(t); if (tela()) document.body.classList.add('digitando'); });
    campo.addEventListener('blur', function () { clearTimeout(t); t = setTimeout(function () { document.body.classList.remove('digitando'); }, 250); });
  }
  var prox = document.getElementById('btnProximaChat');
  if (prox) prox.addEventListener('click', function () {
    if (window.R6Tela && typeof window.R6Tela.irParaProxima === 'function') window.R6Tela.irParaProxima();
  });
})();
