/* ============================================================================
   APPS DO ECOSSISTEMA INDYCAR — UM lugar só com os endereços dos outros apps
   (rodada 5, preparação da IndyCar Central). Carregado ANTES de tudo.

   Quando a Central servir a Agenda sob /agenda/ junto com /crm/, /atendimento/
   e /comunicar/, ela define `window.INDYCAR_APPS` (ex.: { crm: { url: '/crm/' } })
   num <script> antes deste arquivo — e todo link cruzado passa a apontar para o
   caminho novo sem mexer em mais nada. Rodando sozinha, valem os endereços de
   produção abaixo. `IndyCarApps.raiz()` é a raiz DESTE app ("/" ou "/agenda/"),
   para os fetch e os links internos serem relativos.
   ============================================================================ */
(function (root) {
  'use strict';
  const PADRAO = {
    agenda:      { nome: 'Agenda',       desc: 'horários e presença',      url: 'https://indycar-agendamentos.onrender.com' },
    crm:         { nome: 'CRM',          desc: 'leads e funil',            url: 'https://indycar-crm.onrender.com' },
    atendimento: { nome: 'Atendimento',  desc: 'conversas do WhatsApp',    url: 'https://indycar-atendimento.onrender.com' },
    comunicar:   { nome: 'Comunicar',    desc: 'lembretes e réguas',       url: 'https://indycar-posvenda.onrender.com' },
    orcador:     { nome: 'Orçador',      desc: 'orçamentos com IA',        url: 'https://indycar-orcador.netlify.app' },
    patio:       { nome: 'Pátio',        desc: 'carro dentro da oficina',  url: 'https://indycar-patio.netlify.app' },
    site:        { nome: 'Site',         desc: 'indycar-taubate',          url: 'https://indycar-taubate.netlify.app' },
    ads:         { nome: 'Tráfego pago', desc: 'Meta e Google',            url: null },
  };
  const extra = (root.INDYCAR_APPS && typeof root.INDYCAR_APPS === 'object') ? root.INDYCAR_APPS : {};
  const apps = {};
  for (const k of Object.keys(PADRAO)) apps[k] = Object.assign({}, PADRAO[k], extra[k] || {});
  for (const k of Object.keys(extra)) if (!apps[k]) apps[k] = Object.assign({ nome: k, desc: '' }, extra[k]);

  /** Raiz deste app na barra de endereço: "/" sozinho, "/agenda/" na Central. Sempre termina com "/". */
  function raiz() {
    try { return new URL('./', root.location.href).pathname; } catch { return '/'; }
  }
  /** Endereço absoluto da raiz deste app (para links que saem daqui: e-mail de senha, link do cliente). */
  function raizAbsoluta() {
    try { return new URL('./', root.location.href).href.replace(/\/+$/, '') + '/'; } catch { return '/'; }
  }
  /**
   * URL de um app com um caminho/consulta opcional: url('crm', '?lead=123').
   * Caminhos relativos ("/crm/") viram absolutos a partir da raiz do site.
   */
  function url(app, caminho) {
    const base = apps[app] && apps[app].url;
    if (!base) return null;
    let b = String(base);
    if (!/^https?:\/\//i.test(b)) { try { b = new URL(b, root.location.origin).href; } catch { /* fica como está */ } }
    b = b.replace(/\/+$/, '');
    const c = String(caminho || '');
    if (!c) return b;
    return b + (c.startsWith('?') || c.startsWith('#') ? '/' + c : (c.startsWith('/') ? '' : '/') + c);
  }
  /** O host (ou prefixo) de um app bate com este link? (para só abrir links do ecossistema). */
  function ehDoEcossistema(href) {
    try {
      const u = new URL(href, root.location.href);
      return Object.keys(apps).some((k) => {
        const b = url(k); if (!b) return false;
        const ub = new URL(b);
        return ub.host === u.host && u.pathname.startsWith(ub.pathname.replace(/\/+$/, ''));
      });
    } catch { return false; }
  }
  root.IndyCarApps = Object.freeze({ apps, url, raiz, raizAbsoluta, ehDoEcossistema, aqui: 'agenda' });
})(typeof globalThis !== 'undefined' ? globalThis : window);
