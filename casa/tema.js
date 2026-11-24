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
/* R14 (abertura mais rápida): a configuração do login (/api/central/config) começa a ser pedida AGORA, junto com o download
   dos scripts, e não só depois que todos rodarem. casa.js usa esta resposta uma vez; sem ela (ou se falhar), pede de novo. */
(function () {
  try {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctl) setTimeout(function () { ctl.abort(); }, 10000);
    window.__cfgCedo = fetch('/api/central/config', { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  } catch (e) { window.__cfgCedo = null; }
})();
