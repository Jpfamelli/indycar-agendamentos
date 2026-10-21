/* ============================================================
   IndyCar — apps.js (rodada 5): o ÚNICO lugar com os endereços dos apps
   do ecossistema e com o prefixo em que ESTE app está montado.

   Carrega antes de tudo (até do rede.js). Expõe:
     IndyCarApps.base            → "/" hoje; "/atendimento/" dentro da Central
     IndyCarApps.caminho('api/eu') ou ('/api/eu') → caminho dentro do prefixo
     IndyCarApps.url('?conversa=x') → endereço absoluto deste app
     IndyCarApps.apps            → { atendimento, crm, agenda, comunicar, orcador, site, patio, ads }
     IndyCarApps.link(app, '/?lead=x') → endereço no outro app (links do sino, da ficha…)

   O prefixo vem do <base href> que o servidor injeta no index.html (a Central
   monta cada app num caminho e o servidor põe a base certa). Sem base, "/".
   Quando a Central (onda B2) entrar no ar, basta trocar os endereços aqui.
   ============================================================ */
(function (raiz) {
  'use strict';
  function baseDoDocumento() {
    try {
      const b = document.querySelector('base[href]');
      const u = new URL(b ? b.getAttribute('href') : '.', location.href);
      let p = u.pathname || '/';
      if (!p.endsWith('/')) p = p.slice(0, p.lastIndexOf('/') + 1) || '/';
      return p;
    } catch { return '/'; }
  }
  const base = typeof document !== 'undefined' ? baseDoDocumento() : '/';

  /* Endereços atuais (produção). A Central vai servir tudo sob um domínio só:
     aí estes valores viram "https://indycar-agendamentos.onrender.com/crm/" etc. */
  const apps = {
    atendimento: { nome: 'Atendimento',  ico: '💬', url: 'https://indycar-atendimento.onrender.com' },
    crm:         { nome: 'CRM',          ico: '📈', url: 'https://indycar-crm.onrender.com' },
    agenda:      { nome: 'Agenda',       ico: '📅', url: 'https://indycar-agendamentos.onrender.com' },
    comunicar:   { nome: 'Comunicar',    ico: '📣', url: 'https://indycar-posvenda.onrender.com' },
    orcador:     { nome: 'Orçador',      ico: '🧾', url: 'https://indycar-orcador.netlify.app' },
    patio:       { nome: 'Pátio',        ico: '🔧', url: 'https://indycar-patio.netlify.app' },
    site:        { nome: 'Site',         ico: '🌐', url: 'https://indycar-taubate.netlify.app' },
    ads:         { nome: 'Tráfego pago', ico: '🎯', url: null },   // ainda não publicado
  };
  /* Dentro da Central, o próprio Atendimento é "o lugar onde estou": o endereço dele
     passa a ser a origem atual + o prefixo (não o onrender antigo). */
  try {
    if (typeof location !== 'undefined' && base !== '/' && /^https?:/.test(location.origin)) {
      apps.atendimento.url = location.origin + base.replace(/\/$/, '');
      /* IndyCar Central (16/10): os irmãos montados no mesmo domínio (mesmo login). */
      if (/^\/(agenda|crm|atendimento|comunicar)\/$/.test(base)) {
        for (const k of ['agenda', 'crm', 'comunicar']) apps[k].url = location.origin + '/' + k;
      }
    }
  } catch { /* fora do navegador */ }

  /** Caminho dentro do prefixo: caminho('api/eu') e caminho('/api/eu') → "/atendimento/api/eu". */
  function caminho(p) {
    const s = String(p || '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return s;      // absoluto (outro domínio)
    return base + s.replace(/^\/+/, '');
  }
  /** Endereço absoluto deste app (para copiar/compartilhar). */
  function url(p = '') {
    try { return new URL(caminho(p), location.href).href; } catch { return caminho(p); }
  }
  /** Endereço em outro app do ecossistema; `rel` é "/?lead=x" ou "?tel=…". */
  function link(app, rel = '') {
    const a = apps[app];
    if (!a || !a.url) return null;
    const r = String(rel || '');
    if (!r) return a.url;
    return a.url.replace(/\/$/, '') + (r.startsWith('/') || r.startsWith('?') || r.startsWith('#') ? r : '/' + r);
  }
  /** Lista para seletores/menus: só os apps publicados, na ordem da casa. */
  function lista() {
    return ['agenda', 'crm', 'atendimento', 'comunicar', 'orcador', 'patio', 'site'].map(k => ({ chave: k, ...apps[k] })).filter(a => a.url);
  }

  /** Abre o outro app na ABA DELE (nome fixo: clicar de novo reaproveita a aba, não empilha janelas). */
  /** Só abre http(s) de um app da casa (ou desta própria página). javascript:, data: e domínio de fora não passam:
      o endereço pode vir de uma linha do banco (lead, orçamento, agendamento) e window.open('javascript:…') roda no contexto de quem abriu. */
  function enderecoSeguro(endereco) {
    if (endereco === null || endereco === undefined || String(endereco).trim() === '') return null;
    try {
      const u = new URL(String(endereco), location.href);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      if (u.username || u.password) return null;
      if (u.origin === location.origin) return u.href;
      for (const a of Object.values(apps)) { if (a && a.url && new URL(a.url).origin === u.origin) return u.href; }
    } catch (e) { /* endereço inválido */ }
    return null;
  }
  function abrir(app, endereco) {
    const alvo = endereco ? enderecoSeguro(endereco) : (apps[app] && apps[app].url);
    if (!alvo) return null;
    try {
      const w = window.open(alvo, 'indycar-' + app);
      if (w) { try { w.opener = null; } catch (e) { /* aba de outro domínio */ } if (w.focus) w.focus(); }
      return w;
    } catch (e) { return null; }
  }
  /** Qual app do ecossistema é este endereço? (para abrir na aba certa) */
  function appDoEndereco(endereco) {
    try {
      const u = new URL(endereco, location.href);
      const rota = /^\/(agenda|crm|comunicar|atendimento)(\/|$)/.exec(u.pathname);
      if (rota && u.origin === (apps.agenda.url ? new URL(apps.agenda.url).origin : '')) return rota[1];
      for (const [k, a] of Object.entries(apps)) { if (a.url && new URL(a.url).origin === u.origin && !(k === 'agenda' && rota)) return k; }
    } catch (e) { /* endereço inválido */ }
    return null;
  }
  raiz.IndyCarApps = { base, apps, caminho, url, link, lista, abrir, enderecoSeguro, appDoEndereco, atual: 'atendimento' };
  if (typeof module !== 'undefined') module.exports = raiz.IndyCarApps;
})(typeof window !== 'undefined' ? window : globalThis);
