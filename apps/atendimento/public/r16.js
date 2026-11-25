/* Rodada 16: botão "Detalhes" da conversa no celular. Aberto/fechado fica lembrado neste aparelho (localStorage, com try/catch). */
(function () {
  'use strict';
  var chat = document.getElementById('chat');
  var btn = document.getElementById('btnChatDetalhes');
  if (!chat || !btn) return;
  var CHAVE = 'indycar_chat_detalhes';
  function ler() { try { return localStorage.getItem(CHAVE) === '1'; } catch (e) { return false; } }
  function pintar(aberto) { chat.classList.toggle('det-aberto', aberto); btn.setAttribute('aria-expanded', aberto ? 'true' : 'false'); }
  function avisos() {
    var a = document.getElementById('chatAvisos');
    btn.classList.toggle('tem-aviso', !!(a && !a.hidden && a.children.length));
  }
  pintar(ler());
  btn.addEventListener('click', function () {
    var aberto = !chat.classList.contains('det-aberto');
    pintar(aberto);
    try { localStorage.setItem(CHAVE, aberto ? '1' : '0'); } catch (e) { /* sem armazenamento: vale só agora */ }
  });
  try {
    var a = document.getElementById('chatAvisos');
    if (a && window.MutationObserver) new MutationObserver(avisos).observe(a, { childList: true, attributes: true, attributeFilter: ['hidden'] });
    avisos();
  } catch (e) { /* enfeite: some sem estragar a conversa */ }
})();
