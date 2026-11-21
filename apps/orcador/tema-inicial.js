// Roda ANTES de pintar (carregado sem defer no <head>): fica num arquivo porque a política de segurança (CSP) do
// Netlify não deixa script embutido na página.
// Aplica o tema salvo ANTES de pintar (claro | escuro | auto). Mesma chave dos apps IndyCar.
// O padrão é escuro; "auto" segue o sistema. Mantém a cor da barra do navegador (theme-color) em dia.
(function () {
  var preferencia = 'escuro';
  try {
    preferencia = localStorage.getItem('indycar_tema') || 'escuro';
  } catch (e) {}
  // A página do cliente (#/o/<token>) é sempre clara, desde o primeiro quadro.
  var paginaDoCliente = location.hash.indexOf('#/o/') === 0;
  var claro =
    paginaDoCliente ||
    preferencia === 'claro' ||
    (preferencia === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.tema = claro ? 'claro' : 'escuro';
  // Marca a página do cliente já no primeiro quadro: ela usa as fontes enxutas (estilo.css, html[data-cliente]).
  if (paginaDoCliente) document.documentElement.setAttribute('data-cliente', '');
  var meta = document.querySelector('meta[name="theme-color"]');
  // Na página do cliente a barra fica preta, combinando com a faixa da marca no topo dela.
  if (meta) meta.setAttribute('content', paginaDoCliente ? '#0a0a0b' : claro ? '#eaecf0' : '#0a0a0b');

  // Fontes que já começam a baixar (rodada 7): o app da equipe pede as completas; a página do cliente pede as enxutas
  // (131 KB caíram para 61 KB) e NÃO baixa as completas. Fica aqui, e não no HTML, para cada rota pedir só as suas.
  var fontes = paginaDoCliente
    ? ['cli/dm-sans-cli.woff2', 'cli/barlow-cli-800-italic.woff2']
    : ['barlow-condensed-700.woff2'];
  // Na Central o app mora em /orcador/ (rodada 11): as fontes ficam ao lado deste arquivo.
  var eu = document.currentScript && document.currentScript.src;
  var base = eu ? eu.replace(/tema-inicial\.js[^/]*$/, '') : '/';
  for (var i = 0; i < fontes.length; i++) {
    var l = document.createElement('link');
    l.rel = 'preload';
    l.as = 'font';
    l.type = 'font/woff2';
    l.crossOrigin = 'anonymous';
    l.href = base + 'fontes/' + fontes[i];
    document.head.appendChild(l);
  }
})();
