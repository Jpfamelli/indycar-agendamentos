/* Tema antes do CSS pintar: evita o piscar de preto para claro.
   Arquivo próprio (não embutido) porque a CSP só aceita script daqui. */
(function () {
  try {
    var t = localStorage.getItem('ads-tema');
    if (t === 'claro' || t === 'escuro') document.documentElement.setAttribute('data-tema', t);
    // Rodada 5: sem escolha guardada, segue o tema do aparelho (quem usa claro no celular abre claro).
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.setAttribute('data-tema', 'claro');
  } catch (e) {}
})();
