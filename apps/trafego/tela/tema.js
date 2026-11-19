/* Tema antes de a página pintar (arquivo próprio: a política de conteúdo só aceita script daqui).
   Mesma chave da Casa e dos outros apps do domínio: indycar_tema. Escuro é o padrão do Tráfego. */
(function () {
  try {
    if (localStorage.getItem('indycar_tema') === 'claro') document.documentElement.setAttribute('data-tema', 'claro');
  } catch (e) {
    /* sem armazenamento: fica no escuro */
  }
})();
