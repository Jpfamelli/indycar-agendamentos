/* ===================== Ecossistema IndyCar — endereços dos apps =====================
   UM lugar só para os links entre os apps (rodada 5, preparo para a IndyCar Central).
   Vale para a TELA (window.IndyApps) e para o SERVIDOR (import './public/apps.js' →
   globalThis.IndyApps). Quando a Central nascer, basta trocar as URLs aqui: os
   endereços antigos continuam respondendo com redirecionamento (308).

   Como abrir um registro em cada app (contratos da rodada 5):
     Atendimento  /?conversa=<uuid>  /?tel=<DDDNÚMERO>   (Integrações: /?aba=integracoes)
     CRM          /?lead=<uuid>      /?cliente=<uuid>&tel=
     Agenda       /?agendamento=<uuid>  /?cliente=<uuid>&tel=
     Comunicar    /?cliente=<uuid>   /?tel=  /?tela=mensagens&status=&tipo=
     Pátio        /?os=<uuid>  (cliente: /acompanhar/?t=<token>  Área: /minha/?c=<token>)
     Orçador      /#/orcamento/<uuid>  /#/o/<token> (cliente)  /?cliente=&tel=&nome=&carro=&placa=&servico= (cotação nova)
   ======================================================================================= */
(function (raiz) {
  'use strict';
  const APPS = {
    agenda:      { nome: 'Agenda',      desc: 'horários e presença',    url: 'https://indycar-agendamentos.onrender.com' },
    crm:         { nome: 'CRM',         desc: 'leads e funil',          url: 'https://indycar-agendamentos.onrender.com/crm' },
    atendimento: { nome: 'Atendimento', desc: 'conversas do WhatsApp',  url: 'https://indycar-agendamentos.onrender.com/atendimento' },
    comunicar:   { nome: 'Comunicar',   desc: 'lembretes e réguas',     url: 'https://indycar-agendamentos.onrender.com/comunicar' },
    orcador:     { nome: 'Orçador',     desc: 'orçamentos com IA',      url: 'https://indycar-orcador.netlify.app' },
    patio:       { nome: 'Pátio',       desc: 'carro dentro da oficina', url: 'https://indycar-patio.netlify.app' },
    site:        { nome: 'Site',        desc: 'indycar-taubate',        url: 'https://indycar-taubate.netlify.app' },
    ads:         { nome: 'Ads',         desc: 'tráfego pago',           url: null },
  };
  /* IndyCar Central (16/10): a página está sob /comunicar/ — os quatro apps que moram
     juntos usam a origem ATUAL (mesmo domínio = mesmo login). No servidor, nada muda. */
  try {
    if (raiz.location && /^\/(agenda|crm|atendimento|comunicar)(\/|$)/.test(raiz.location.pathname) && /^https?:/.test(raiz.location.origin)) {
      for (const k of ['agenda', 'crm', 'atendimento', 'comunicar']) APPS[k].url = raiz.location.origin + '/' + k;
    }
  } catch { /* fora do navegador */ }
  const limpo = (v) => encodeURIComponent(String(v ?? '').trim());
  const semDDI = (tel) => String(tel ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  /** Links prontos para o lugar certo em cada app (todos devolvem null sem o dado). */
  const LINKS = {
    conversa:     (id)  => (id ? `${APPS.atendimento.url}/?conversa=${limpo(id)}` : null),
    conversaTel:  (tel) => (semDDI(tel) ? `${APPS.atendimento.url}/?tel=${limpo(semDDI(tel))}` : null),
    integracoes:  ()    => `${APPS.atendimento.url}/?aba=integracoes`,
    lead:         (id)  => (id ? `${APPS.crm.url}/?lead=${limpo(id)}` : null),
    clienteCrm:   (id, tel) => (id ? `${APPS.crm.url}/?cliente=${limpo(id)}${semDDI(tel) ? `&tel=${limpo(semDDI(tel))}` : ''}` : null),
    agendamento:  (id)  => (id ? `${APPS.agenda.url}/?agendamento=${limpo(id)}` : null),
    clienteAgenda:(id, tel) => (id ? `${APPS.agenda.url}/?cliente=${limpo(id)}${semDDI(tel) ? `&tel=${limpo(semDDI(tel))}` : ''}` : null),
    os:           (id)  => (id ? `${APPS.patio.url}/?os=${limpo(id)}` : null),
    orcamento:    (id)  => (id ? `${APPS.orcador.url}/#/orcamento/${limpo(id)}` : null),   // rota real do Orçador (Histórico, no orçamento)
    /** Página que o CLIENTE vê (sem login): #/o/<token_publico>. */
    orcamentoCliente: (token) => (/^[A-Za-z0-9_-]{12,128}$/.test(String(token || '')) ? `${APPS.orcador.url}/#/o/${token}` : null),
    /** "Criar orçamento": abre a cotação nova já com o cliente e o carro (o Orçador lê estes parâmetros). */
    novoOrcamento: (c = {}) => {
      const p = new URLSearchParams();
      if (c.cliente_id) p.set('cliente', String(c.cliente_id));
      const t = semDDI(c.telefone); if (t) p.set('tel', t);
      for (const k of ['nome', 'carro', 'placa', 'servico']) if (c[k]) p.set(k, String(c[k]).trim().slice(0, 80));
      const q = p.toString();
      return q ? `${APPS.orcador.url}/?${q}` : APPS.orcador.url;
    },
    patioHome:    ()    => APPS.patio.url,
    clienteComunicar: (id) => (id ? `${APPS.comunicar.url}/?cliente=${limpo(id)}` : null),
  };
  raiz.IndyApps = { APPS, LINKS, semDDI, atual: 'comunicar' };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
