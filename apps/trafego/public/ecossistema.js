/* ============================================================
   Ecossistema IndyCar — endereços dos apps num lugar só (rodada 5).
   Servidor (equipe.js, seguranca.js, relatorio.js) e tela (app.js,
   conta.js) leem daqui. Na onda B2 os apps passam a morar no domínio
   da Agenda (/crm/, /atendimento/, /comunicar/): troca-se SÓ este
   arquivo e todos os links cruzados acompanham.
   Funciona no navegador (window.Ecossistema) e no node (require).
   ============================================================ */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Ecossistema = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* chave → { nome, url (sem barra no fim), papelAgendaPode } — a ordem é a do seletor. */
  var APPS = {
    casa:        { nome: 'Casa',          url: 'https://indycar-agendamentos.onrender.com' },
    agenda:      { nome: 'Agenda',        url: 'https://indycar-agendamentos.onrender.com/agenda' },
    crm:         { nome: 'CRM',           url: 'https://indycar-agendamentos.onrender.com/crm' },
    atendimento: { nome: 'Atendimento',   url: 'https://indycar-agendamentos.onrender.com/atendimento' },
    comunicar:   { nome: 'Comunicar',     url: 'https://indycar-agendamentos.onrender.com/comunicar' },
    ads:         { nome: 'Tráfego pago',  url: 'https://indycar-ads.onrender.com', aqui: true },
    orcador:     { nome: 'Orçador',       url: 'https://indycar-agendamentos.onrender.com/orcador' },   // rodada 13C: mora na Central
    patio:       { nome: 'Pátio',         url: 'https://indycar-patio.netlify.app' },
    site:        { nome: 'Site',          url: 'https://indycar-taubate.netlify.app' },
  };
  var ORDEM = ['agenda', 'crm', 'atendimento', 'comunicar', 'ads', 'orcador', 'patio', 'site'];

  /* Apps com login (aparecem em perfis.apps e na tela "sem acesso"). */
  var COM_LOGIN = ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'ads', 'patio'];

  function url(app) { return APPS[app] ? APPS[app].url : null; }
  function nome(app) { return APPS[app] ? APPS[app].nome : app; }

  /* Endereços antigos (só redirecionam para a Central): continuam valendo no CORS e nos links de sino já gravados. */
  var LEGADOS = ['https://indycar-crm.onrender.com', 'https://indycar-atendimento.onrender.com', 'https://indycar-posvenda.onrender.com', 'https://indycar-orcador.netlify.app'];

  /** Só a origem (https://host) de uma URL — sem caminho. */
  function origemDe(u) {
    var m = /^(https?:[/][/][^/?#]+)/i.exec(String(u || ''));
    return m ? m[1] : null;
  }

  /** Origens permitidas no CORS: todos os apps publicados (sem caminho) + os endereços antigos. */
  function origens() {
    var saida = [];
    for (var k in APPS) { var o = origemDe(APPS[k].url); if (o && saida.indexOf(o) < 0) saida.push(o); }
    LEGADOS.forEach(function (o) { if (saida.indexOf(o) < 0) saida.push(o); });
    return saida;
  }

  /** Qual app do ecossistema é dono desta URL (o endereço mais específico vence: /crm antes da Casa). null = de fora. */
  function appDaUrl(href) {
    var h = String(href || ''), melhor = null, tam = 0;
    if (/^https:[/][/]indycar-orcador[.]netlify[.]app([/?#]|$)/.test(h)) return 'orcador';   // rodada 13C: endereço antigo do Orçador
    for (var k in APPS) {
      var u = APPS[k].url;
      if (APPS[k].aqui || k === 'casa') continue;
      if ((h === u || h.indexOf(u + '/') === 0 || h.indexOf(u + '?') === 0 || h.indexOf(u + '#') === 0) && u.length > tam) { melhor = k; tam = u.length; }
    }
    return melhor;
  }

  /** Nome da aba do navegador de cada app (window.open(url, alvo)): a pessoa não perde a tela onde está. */
  function alvo(app) { return 'indycar-' + app; }

  /** Telefone normalizado do ecossistema: 55 + DDD + número (só dígitos). */
  function telefone(v) {
    var n = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    if (!n) return '';
    if (n.length <= 11) n = '55' + n;
    return n;
  }

  /** Monta a URL de um app com os parâmetros (sem os vazios). */
  function link(app, params) {
    var base = url(app);
    if (!base) return null;
    var q = [];
    for (var k in params || {}) {
      var v = params[k];
      if (v == null || v === '') continue;
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    return base + '/' + (q.length ? '?' + q.join('&') : '');
  }

  /* Links cruzados que o resto do ecossistema entende (PASSAGEM, seção 4). */
  function linkLead(id)            { return id ? link('crm', { lead: id }) : null; }
  function linkClienteCRM(id)      { return id ? link('crm', { cliente: id }) : null; }
  function linkTelCRM(tel)         { var t = telefone(tel); return t ? link('crm', { tel: t }) : null; }
  function linkConversa(id)        { return id ? link('atendimento', { conversa: id }) : null; }
  function linkConversaTel(tel)    { var t = telefone(tel); return t ? link('atendimento', { tel: t }) : null; }
  function linkAgendaTel(tel)      { var t = telefone(tel); return t ? link('agenda', { tel: t }) : null; }
  function linkAgendamento(id)     { return id ? link('agenda', { agendamento: id }) : null; }
  function linkComunicarTel(tel)   { var t = telefone(tel); return t ? link('comunicar', { tel: t }) : null; }
  function linkOrcadorTel(tel, nomeCli, clienteId, leadId) { var t = telefone(tel); return t ? link('orcador', { tel: t, nome: nomeCli || '', cliente: clienteId || '', lead: leadId || '' }) : null; }
  /* Rodada 6: orçamento do Orçador (#/historico/<id>) e OS do Pátio (?os=<id>). */
  function linkOrcamento(id)       { return id ? url('orcador') + '/#/historico/' + encodeURIComponent(id) : null; }
  /* Link que o CLIENTE usa para acompanhar o carro (a mesma página que o Pátio manda por WhatsApp). */
  function linkAcompanhar(token) { return token ? url('patio') + '/acompanhar/?t=' + encodeURIComponent(token) : null; }
  function linkOS(id)              { return id ? link('patio', { os: id }) : null; }

  /**
   * Um link de notificação (`/?lead=x`) relativo ao app de origem vira absoluto;
   * link de fora do ecossistema volta para a raiz (nunca manda a pessoa para um site estranho).
   */
  function linkDeNotificacao(linkCru, appOrigem, appAtual) {
    var l = String(linkCru || '/');
    if (/^https:[/][/]/i.test(l)) {
      var ok = origens().some(function (o) { return l === o || l.indexOf(o + '/') === 0; });
      return ok ? l : '/';
    }
    if (l.charAt(0) !== '/' || l.indexOf('//') === 0) return '/';
    if (!appOrigem || appOrigem === (appAtual || 'ads') || !APPS[appOrigem]) return l;
    return APPS[appOrigem].url + l;
  }

  return { APPS: APPS, ORDEM: ORDEM, COM_LOGIN: COM_LOGIN, url: url, nome: nome, origens: origens, telefone: telefone, link: link,
    linkLead: linkLead, linkClienteCRM: linkClienteCRM, linkTelCRM: linkTelCRM, linkConversa: linkConversa, linkConversaTel: linkConversaTel,
    linkAgendaTel: linkAgendaTel, linkAgendamento: linkAgendamento, linkComunicarTel: linkComunicarTel, linkOrcadorTel: linkOrcadorTel, linkOrcamento: linkOrcamento, linkOS: linkOS, linkAcompanhar: linkAcompanhar, alvo: alvo, appDaUrl: appDaUrl, origemDe: origemDe,
    linkDeNotificacao: linkDeNotificacao };
});
