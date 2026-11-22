/* Tema (claro/escuro) aplicado ANTES de pintar a tela, para não piscar. Padrão: escuro; a escolha fica no localStorage.
   R13C: saiu de dentro do index.html para a CSP recusar script embutido ('unsafe-inline'). Carrega no <head>, sem defer. */
(function () {
  try {
    var t = localStorage.getItem('indycar_tema');
    if (t === 'claro') {
      document.documentElement.setAttribute('data-tema', 'claro');
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', '#eef0f4');
    }
  } catch (e) { /* sem localStorage: segue no escuro */ }
})();
