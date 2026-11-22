/* ============================================================
   Endereços do ecossistema IndyCar que o SERVIDOR precisa conhecer
   (rodada 8, frente T2a).

   Antes o servidor lia public/ecossistema.js, um arquivo da pasta de
   tela. A pasta de tela muda de dono e vai ser enxugada; a lista de
   quem pode chamar a API e o endereço que vai em link de WhatsApp
   moram aqui, no servidor.

   O Tráfego mora dentro da Central, em /trafego/. Nada aqui supõe
   que o app está na raiz de um domínio.
   ============================================================ */
'use strict';

const CENTRAL = 'https://indycar-agendamentos.onrender.com';

/* chave -> { nome, url (sem barra no fim), caminho dentro da Central ou null } */
const APPS = Object.freeze({
  casa:        { nome: 'Casa',        url: CENTRAL,                    caminho: '/' },
  agenda:      { nome: 'Agenda',      url: `${CENTRAL}/agenda`,        caminho: '/agenda/' },
  crm:         { nome: 'CRM',         url: `${CENTRAL}/crm`,           caminho: '/crm/' },
  atendimento: { nome: 'Atendimento', url: `${CENTRAL}/atendimento`,   caminho: '/atendimento/' },
  comunicar:   { nome: 'Comunicar',   url: `${CENTRAL}/comunicar`,     caminho: '/comunicar/' },
  trafego:     { nome: 'Tráfego',     url: `${CENTRAL}/trafego`,       caminho: '/trafego/' },
  orcador:     { nome: 'Orçador',     url: `${CENTRAL}/orcador`,       caminho: '/orcador/' },   // rodada 13C: mora na Central (o Netlify só redireciona)
  patio:       { nome: 'Pátio',       url: 'https://indycar-patio.netlify.app',   caminho: null },
  site:        { nome: 'Site',        url: 'https://indycar-taubate.netlify.app', caminho: null },
});

/* Endereços antigos: hoje só redirecionam para a Central, mas continuam
   valendo no CORS (abas abertas e links já enviados). */
const ANTIGOS = Object.freeze([
  'https://indycar-orcador.netlify.app',   // rodada 13C: o Orçador saiu do Netlify (lá só redireciona para /orcador/)
  'https://indycar-ads.onrender.com',
  'https://indycar-crm.onrender.com',
  'https://indycar-atendimento.onrender.com',
  'https://indycar-posvenda.onrender.com',
]);

/** Só a origem (https://host) de um endereço, sem caminho. */
function origemDe(u) {
  const m = /^(https?:[/][/][^/?#]+)/i.exec(String(u || ''));
  return m ? m[1] : null;
}

/** Origens que podem chamar a API de outro site: os apps da casa e os endereços antigos. */
function origens() {
  const saida = [];
  for (const u of [...Object.values(APPS).map(a => a.url), ...ANTIGOS]) {
    const o = origemDe(u);
    if (o && !saida.includes(o)) saida.push(o);
  }
  return saida;
}

function consultaDe(params) {
  const q = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    q.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return q.length ? `?${q.join('&')}` : '';
}

/**
 * Caminho de outro app DENTRO da Central ("/atendimento/?aba=integracoes"), para as ações
 * que levam a pessoa a outro app. Começa com barra: é relativo à raiz da Central, não ao Tráfego.
 * App que mora em outro domínio (Pátio, Site) ou desconhecido devolve null.
 */
function caminhoNaCentral(app, params) {
  const a = Object.prototype.hasOwnProperty.call(APPS, app) ? APPS[app] : null;
  if (!a || !a.caminho) return null;
  return a.caminho + consultaDe(params);
}

/**
 * Endereço absoluto do Tráfego, para o que sai do app (link em WhatsApp, e-mail, notificação).
 * Vem de TRAFEGO_URL quando o ambiente define (desenvolvimento, outro domínio); senão, a Central + /trafego/.
 */
function urlDoTrafego(caminho = '') {
  const doAmbiente = String(process.env.TRAFEGO_URL || '').trim();
  const base = /^https?:[/][/][^\s/?#]+/i.test(doAmbiente) ? doAmbiente.replace(/[/]+$/, '') : APPS.trafego.url;
  return `${base}/${String(caminho || '').replace(/^[/]+/, '')}`;
}

module.exports = { CENTRAL, APPS, ANTIGOS, origemDe, origens, caminhoNaCentral, urlDoTrafego };
