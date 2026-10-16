/* Tema (claro/escuro) ANTES de pintar — a mesma chave de todos os apps no mesmo domínio. */
(function () {
  try {
    if (localStorage.getItem('indycar_tema') === 'claro') {
      document.documentElement.setAttribute('data-tema', 'claro');
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', '#eef0f4');
    }
  } catch (e) { /* sem localStorage: escuro */ }
})();
