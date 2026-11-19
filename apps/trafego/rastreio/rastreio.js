/* ============================================================
   IndyCar Tráfego: rastreio para sites de fora (rodada 8, frente T2b). Contrato de rastreio §6.
   Servido em GET /rastreio.js sem os comentários e sem o recuo (rotas/rastreio.js): tem de caber em 4 KB,
   por isso o código é compacto e os nomes são curtos. Sem dependência, roda em navegador antigo, nunca trava a página.

   Uso no site:  <script src="https://indycar-agendamentos.onrender.com/trafego/rastreio.js" async></script>
   Opcional:     data-registro="https://…/api/rastreio" no <script> (padrão: ao lado do script)
                 data-servico="cambio" no link do WhatsApp (vai junto no registro do clique)

   O que faz: guarda de onde a pessoa chegou (utm, identificador de clique, domínio de quem mandou) por 30 dias
   em localStorage['indycar_rastreio'] = { dados, codigo, quando }; na primeira interação (ou depois de 4 s com a
   página visível) registra a visita e recebe um código de 5 letras; acrescenta " [ref CODIGO]" ao texto de todo
   link de WhatsApp da página; no clique, registra o clique (keepalive, sem esperar resposta).
   Chegada com anúncio substitui o que estava guardado; chegada sem pista nenhuma não apaga o que estava guardado.
   Nada de nome, telefone ou e-mail. Tudo em try/catch: sem armazenamento ou sem rede, a página segue igual.

   Nomes: E = estado guardado, D = dados da chegada, T = tipo da chegada (referencia_tipo), R = domínio de quem
   mandou, U = endereço do registro, F = já registrou, WA = link de WhatsApp, C = formato do código.
   ============================================================ */
(function (w, d) {
  try {
    var K = 'indycar_rastreio', C = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/,
      WA = /^(https?:\/\/(wa\.me\/|(api|web)\.whatsapp\.com\/send)|whatsapp:\/\/send)/i,
      P = 'utm_source utm_medium utm_campaign utm_content utm_term gclid gbraid wbraid fbclid ttclid msclkid'.split(' '),
      s = d.currentScript || d.querySelector('script[src*="rastreio.js"]'), L = w.location || {},
      U = s && s.getAttribute('data-registro') || '', D = {}, R = '', E, F, T, i, m, k, v, g;
    if (!/^https?:\/\//i.test(U)) U = s && s.src ? String(s.src).replace(/rastreio\.js([?#].*)?$/, 'api/rastreio') : '';
    if (!/^https?:\/\//i.test(U) || /\.js([?#]|$)/i.test(U)) return;
    function cut(x, n) { return x == null ? '' : String(x).slice(0, n); }
    function now() { return new Date().getTime(); }

    // 1. de onde chegou (§6.1)
    m = String(L.search || '').replace(/^\?/, '').split('&');
    for (i = 0; i < m.length; i++) try {
      v = m[i].split('=');
      k = decodeURIComponent(v.shift());
      v = v.join('=');
      if (P.indexOf(k) >= 0 && v) D[k] = cut(decodeURIComponent(v.replace(/\+/g, ' ')), k.indexOf('utm_') ? 500 : 150);
    } catch (e) {}
    m = String(d.referrer || '').match(/^https?:\/\/([^\/?#:]+)/i);
    if (m && m[1].toLowerCase() != String(L.hostname).toLowerCase()) R = cut(m[1].toLowerCase(), 80);
    v = String(D.utm_source || '').toLowerCase();
    T = D.gclid || D.gbraid || D.wbraid || D.fbclid || D.ttclid || D.msclkid
        || /^(cpc|ppc|cpm|cpv|paid|pago|ads?|anuncio|display|paid.?social)$/i.test(D.utm_medium) ? 'anuncio'
      : /(^|\.)(google|bing|yahoo|duckduckgo|ecosia)\./.test(R) ? 'busca'
      : /instagram/.test(R) || v == 'instagram' ? 'instagram'
      : /(^|\.)(facebook|fb)\.(com|me)$/.test(R) || v == 'facebook' ? 'facebook'
      : /whatsapp|^wa\.me$/.test(R) || v == 'whatsapp' ? 'whatsapp'
      : R ? 'outro_site' : 'direto';
    D.pagina = cut(L.pathname, 120) || '/';
    if (R) D.referencia = R;
    D.referencia_tipo = T;

    // 2. o que estava guardado (30 dias) e a regra de substituição
    function save() { try { w.localStorage.setItem(K, JSON.stringify(E)); } catch (e) {} }
    try {
      g = JSON.parse(w.localStorage.getItem(K));
      if (g && g.dados && now() - g.quando < 2592e6
        && (JSON.stringify(g.dados) == JSON.stringify(D) || T != 'anuncio' && (T == 'direto' || g.dados.referencia_tipo == 'anuncio'))) E = g;
    } catch (e) {}
    if (!E) { E = { dados: D, codigo: null, quando: now() }; save(); }
    if (!C.test(E.codigo)) E.codigo = null;

    // 3. registro (§6.2) e links de WhatsApp (§6.3)
    function send(o, ka) {
      try { return w.fetch(U, { method: 'POST', body: JSON.stringify(o), keepalive: !!ka }); } catch (e) {}
    }
    function mark(a) {
      var h = a.getAttribute('href') || '', j = h.indexOf('#'), f = j < 0 ? '' : h.slice(j), b = j < 0 ? h : h.slice(0, j), t = '', x;
      if (!E.codigo || !WA.test(h)) return;
      x = b.match(/([?&])text=([^&]*)/);
      if (x) try { t = decodeURIComponent(x[2].replace(/\+/g, ' ')); } catch (e) { t = x[2]; }
      if (/\[ref [A-Za-z0-9]{5}\]/.test(t)) return;
      t = 'text=' + encodeURIComponent((t.replace(/\s+$/, '') || 'Olá!') + ' [ref ' + E.codigo + ']');
      a.setAttribute('href', (x ? b.replace(x[0], x[1] + t) : b + (b.indexOf('?') < 0 ? '?' : '&') + t) + f);
    }
    function markAll() {
      try { for (var l = d.querySelectorAll('a[href]'), q = 0; q < l.length; q++) mark(l[q]); } catch (e) {}
    }
    function reg() {
      if (F) return;
      F = 1;
      var o = JSON.parse(JSON.stringify(E.dados)), r;
      o.evento = 'visita';
      r = send(o);
      if (r && r.then) r.then(function (x) { return x.json(); }).then(function (j) {
        if (j && C.test(j.codigo)) { E.codigo = j.codigo; save(); markAll(); }
      }, function () {});
    }

    d.addEventListener('click', function (e) {
      try {
        for (var a = e.target, n = 0; a && n < 8 && String(a.tagName).toUpperCase() != 'A'; n++) a = a.parentNode;
        if (!a || !a.getAttribute || !WA.test(a.getAttribute('href') || '')) return;
        mark(a);
        if (E.codigo) send({ codigo: E.codigo, evento: 'clique', servico: cut(a.getAttribute('data-servico'), 40) || undefined }, 1);
      } catch (x) {}
    }, true);

    if (E.codigo) {
      F = 1;
      if (d.readyState == 'loading') d.addEventListener('DOMContentLoaded', markAll); else markAll();
    } else {
      m = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
      g = function () { for (var q = 0; q < m.length; q++) w.removeEventListener(m[q], g, true); reg(); };
      for (i = 0; i < m.length; i++) w.addEventListener(m[i], g, { capture: true, passive: true });
      w.setTimeout(function () { if (d.visibilityState != 'hidden') reg(); }, 4000);
    }
  } catch (e) {}
})(window, document);
