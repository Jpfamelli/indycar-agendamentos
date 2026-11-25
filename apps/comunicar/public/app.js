/* ========================= IndyCar Comunicar — App =========================
   Central de comunicação da oficina: réguas automáticas (lembrete, pós-venda,
   avaliação, revisão, aniversário, orçamento parado, não fechou, reativação),
   campanhas por segmento, clientes (com opt-out) e satisfação — tudo pelo
   WhatsApp DA EMPRESA. O motor mora no servidor; aqui é só a tela.
   Regras da casa: esc() em TODO dado que vira HTML; [hidden] vence display;
   tema sem transition no body (ver styles.css).
   ============================================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---- ícones (SVG inline) ----------------------------------------------------
const I = {
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  wa:'<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
  send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  gift:'<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8s-1.5-4-4-4a2 2 0 0 0 0 4M12 8s1.5-4 4-4a2 2 0 0 1 0 4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  sad:'<circle cx="12" cy="12" r="9"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><path d="M9 9h.01M15 9h.01"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  play:'<path d="M5 3l14 9-14 9V3z"/>',
  megafone:'<path d="M3 11l18-7-7 18-2.5-7.5z"/>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  olho:'<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  alerta:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  money:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  loja:'<path d="M3 9l1.6-5h14.8L21 9M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  regua:'<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="3"/><path d="M18 14.5v1.5l1 1"/>',
  refresh:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  seta:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  voltar:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
  pausa:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z"/>',
  car:'<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14a2 2 0 0 1 2 2v4h-2M5 11a2 2 0 0 0-2 2v4h2m0 0h14m-12 0a2 2 0 1 1-4 0m16 0a2 2 0 1 1-4 0"/>',
  externo:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  estrela:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  lista:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
};
const svg = (p, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

/* ---------------------------------------------------------------------------
   TIPOS E RÉGUAS — os mesmos rótulos do servidor (dados.js › ROTULO_TIPO).
   `param` é o número que cada régua tem; `vars` são as variáveis específicas.
   --------------------------------------------------------------------------- */
const REGUAS = ['lembrete', 'posvenda', 'avaliacao', 'retorno', 'aniversario', 'orcamento', 'nao_fechou', 'reativacao'];
const TIPO = {
  lembrete:    { rotulo:'Lembrete de horário', emoji:'⏰', cor:'blue',   desc:'Avisa o cliente antes do horário marcado.',
                 param:{ campo:'horas_lembrete', antes:'Mandar', depois:'horas antes do horário', min:1, max:72 }, vars:['quando'] },
  posvenda:    { rotulo:'Pós-venda', emoji:'🔧', cor:'green', desc:'Depois do serviço, pergunta se ficou tudo certo.',
                 param:{ campo:'dias_posvenda', antes:'Mandar', depois:'dias depois do serviço', min:0, max:30 } },
  avaliacao:   { rotulo:'Avaliação no Google', emoji:'⭐', cor:'orange', desc:'Pede a avaliação a quem ficou satisfeito.', vars:['link_avaliacao'] },
  retorno:     { rotulo:'Revisão', emoji:'🔁', cor:'purple', desc:'Convida para voltar quando o prazo do serviço vence.',
                 param:{ campo:'meses_retorno', antes:'Padrão de', depois:'meses, quando nenhuma regra casa', min:1, max:24 }, vars:['meses'] },
  aniversario: { rotulo:'Aniversário', emoji:'🎂', cor:'red', desc:'Parabéns no dia, pelo WhatsApp da oficina.' },
  orcamento:   { rotulo:'Orçamento parado', emoji:'📋', cor:'cyan', desc:'Orçamento sem resposta no CRM há alguns dias.',
                 param:{ campo:'dias_orcamento', antes:'Depois de', depois:'dias parado', min:1, max:30 } },
  nao_fechou:  { rotulo:'Não fechou', emoji:'🤝', cor:'orange', desc:'Veio, não fechou: "ainda posso ajudar?".',
                 param:{ campo:'dias_nao_fechou', antes:'Depois de', depois:'dias', min:1, max:60 } },
  reativacao:  { rotulo:'Reativação', emoji:'🏁', cor:'wa', desc:'Cliente sumido há meses ganha um convite para voltar.',
                 param:{ campo:'meses_reativacao', antes:'Depois de', depois:'meses sem voltar', min:3, max:36 } },
  campanha:    { rotulo:'Campanha', emoji:'📣', cor:'purple' },
  avulsa:      { rotulo:'Avulsa', emoji:'✉️', cor:'gray' },
  remarcacao:  { rotulo:'Horário remarcado', emoji:'🔄', cor:'blue', desc:'A Agenda avisa o cliente quando o horário muda (sai com a prioridade do lembrete).' },
  // Pátio (16/10/2026): quem enfileira é o banco (app do Pátio); aqui só aparecem
  patio_entrada: { rotulo:'Pátio: carro recebido', emoji:'🚗', cor:'blue', desc:'O carro entrou na oficina: o cliente recebe o link para acompanhar.' },
  patio_extra:   { rotulo:'Pátio: extra para aprovar', emoji:'🛠️', cor:'orange', desc:'A equipe achou um item: o cliente vê a foto e aprova pelo link.' },
  patio_pronto:  { rotulo:'Pátio: carro pronto', emoji:'✅', cor:'green', desc:'O carro está pronto para retirar (o pós-venda continua saindo depois).' },
  area_cliente:  { rotulo:'Área do Cliente', emoji:'🔑', cor:'cyan', desc:'Convite com o link da Área do Cliente (um link por cliente).' },
};
const TIPOS_PATIO = ['patio_entrada', 'patio_extra', 'patio_pronto', 'area_cliente'];
const VARS_COMUNS = ['nome', 'primeiro_nome', 'carro', 'placa', 'servico'];
/* Rodada 5: variáveis de LINK nas réguas — {link_os} (acompanhar a ordem do Pátio do horário) para as
   réguas que nascem de um agendamento; {link_area} (Área do Cliente, um link por cliente) em todas. */
const VARS_LINK = { lembrete:['link_os'], posvenda:['link_os', 'link_area'], retorno:['link_area'], nao_fechou:['link_area'], aniversario:['link_area'], orcamento:['link_area'], reativacao:['link_area'], avaliacao:[] };
const STATUS_ENVIO = {
  pendente:['Na fila', 'bp-orange'], enviado:['Enviada', 'bp-green'], falhou:['Falhou', 'bp-red'],
  cancelado:['Cancelada', 'bp-gray'], pulado:['Pulada', 'bp-blue'],
};
const COR_PILL = { blue:'bp-blue', green:'bp-green', orange:'bp-orange', purple:'bp-purple', red:'bp-red', cyan:'bp-cyan', wa:'bp-wa', gray:'bp-gray' };
/* status de agendamento (mesmos nomes da Agenda) → rótulo e cor da pílula */
const STATUS_AG = { aguardando:['Aguardando', 'bp-orange'], confirmado:['Confirmado', 'bp-green'], em_atendimento:['Em atendimento', 'bp-blue'],
  compareceu:['Na oficina', 'bp-blue'], nao_veio:['Não veio', 'bp-red'], concluido:['Concluído', 'bp-purple'], nao_fechou:['Não fechou', 'bp-orange'],
  cancelado:['Cancelado', 'bp-gray'] };
const pillAg = (s) => { const [r, c] = STATUS_AG[s] || [s, 'bp-gray']; return `<span class="badge-pill ${c}">${esc(r)}</span>`; };
/* Rodada 5: os endereços vêm de apps.js (um lugar só); a API é relativa à página. */
const APPS_ECO = (window.IndyApps && window.IndyApps.APPS) || {};
const LINKS = (window.IndyApps && window.IndyApps.LINKS) || {};
const ATENDIMENTO_URL = APPS_ECO.atendimento?.url || 'https://indycar-atendimento.onrender.com';
const CRM_URL = APPS_ECO.crm?.url || 'https://indycar-crm.onrender.com';
const AGENDA_URL = APPS_ECO.agenda?.url || 'https://indycar-agendamentos.onrender.com';
const PATIO_URL = APPS_ECO.patio?.url || 'https://indycar-patio.netlify.app';
const API = 'api';

/* Cliente de exemplo das prévias — ninguém de verdade. */
const EXEMPLO = { nome:'Maria Aparecida Souza', carro:'HB20 2019', placa:'FHR6F16', servico:'troca de óleo', quando:'amanhã às 09:00' };

// ---- estado -----------------------------------------------------------------
const state = { route:'reguas', perfil:null, cfg:null, cfgEdit:{}, regras:null, modelos:null, segmentos:null,
  msg:{ status:'todas', tipo:'todos', q:'', de:'', ate:'', intencao:'todas', origem:'todas' }, cliQ:'', saude:null };

// ---- API --------------------------------------------------------------------
let sb = null, CONFIG = null;

async function authCabecalhos() {
  const cab = { 'Content-Type':'application/json' };
  if (!sb) return cab;
  const { data } = await sb.auth.getSession();
  const t = data?.session?.access_token;
  if (!t) throw new Error('Sua sessão expirou. Entre de novo para continuar.');
  cab.Authorization = `Bearer ${t}`;
  return cab;
}

/* Chamada à API do Comunicar. Recusa de sessão (401) e de acesso (403 sem_acesso /
   trocar_senha) vão para a conta.js, que renova o token uma vez e repete, ou leva à
   tela certa (login, código de duas etapas, sem acesso, senha nova). */
async function api(method, path, body, _repetiu = false) {
  const opt = { method, headers: await authCabecalhos() };
  if (body !== undefined) opt.body = JSON.stringify(body);
  let r;
  /* Rodada 4: o Acordar (acordar.js) espera o Render acordar e tenta de novo
     sozinho (até ~3 min) em vez de mostrar erro cru. */
  /* rodada 5: caminho RELATIVO — funciona em / e dentro da Central (/comunicar/) */
  try { r = await (window.Acordar ? window.Acordar.buscar(API + path, opt) : fetch(API + path, opt)); }
  catch (err) {
    const e = new Error(/não acordou/.test(err?.message || '') ? err.message : 'Sem internet — confira a conexão e tente de novo. O que você escreveu continua aqui.');
    e.status = 0; throw e;
  }
  if (window.Acordar?.ehAcordando(r.status, r.headers.get('content-type'))) {
    const e = new Error('O sistema está acordando. Tente de novo em instantes — o que você escreveu continua aqui.'); e.status = r.status; throw e;
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 || (r.status === 403 && ['sem_acesso', 'trocar_senha'].includes(data.codigo))) {
    const acao = window.Conta ? await window.Conta.tratarRecusa(r.status, data, _repetiu) : 'parar';
    if (acao === 'repetir' && !_repetiu) return api(method, path, body, true);
    if (!window.Conta) mostrarLogin(data.erro || 'Sua sessão expirou. Entre de novo.');
    const e = new Error(data.erro || 'Sessão expirada'); e.status = r.status; e.codigo = data.codigo; throw e;
  }
  if (!r.ok) { const e = new Error(data.erro || (r.status === 429 ? 'Muitas ações seguidas. Espere um pouco.' : 'Erro na requisição')); e.status = r.status; e.codigo = data.codigo; if (data.campo) e.campo = data.campo; throw e; }
  return data;
}

// ---- utilidades -------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const iniciais = (nome) => String(nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const dataCurta = (iso) => { if (!iso) return ''; const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
/* nascimento gravado com ano 1904 = planilha só trazia dia/mês */
const nascBR = (iso) => { if (!iso) return '—'; const [a, m, d] = String(iso).slice(0, 10).split('-'); return a === '1904' ? `${d}/${m}` : `${d}/${m}/${a}`; };
const dataHoraBR = (ts) => { if (!ts) return '';
  const d = new Date(ts); if (isNaN(d)) return String(ts);
  return d.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).replace(',', ' às'); };
const horaBR = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit' }); };
const dinheiro = (n) => Number(n || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
const telBR = (t) => { const d = soDigitos(t).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '—'; };
function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
function diaSP(ts) {
  const d = new Date(ts); if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
}
function rotuloDia(iso) {
  const h = hojeSP();
  if (iso === h) return 'Hoje';
  const ontem = new Date(h + 'T12:00:00'); ontem.setDate(ontem.getDate() - 1);
  if (iso === ontem.toISOString().slice(0, 10)) return 'Ontem';
  return dataBR(iso);
}
/* "há 5 min" · "há 2 h" · "ontem 09:30" */
function relativo(ts) {
  const d = new Date(ts); if (isNaN(d)) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return dataHoraBR(ts);
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const ehGestor = () => ['admin', 'gestor'].includes(state.perfil?.papel);
/* O mapa de permissões vem do SERVIDOR (/api/perfil › pode) — a tela só esconde
   o botão; quem barra de verdade é o servidor (403). */
const pode = (p) => (state.perfil?.pode ? !!state.perfil.pode[p] : ehGestor());

/** Mesma troca de variáveis do servidor (dados.js › renderTemplate) — para a prévia. */
function renderTemplate(corpo, ctx = {}) {
  const primeiro = String(ctx.nome || '').trim().split(/\s+/)[0] || '';
  const mapa = { ...ctx, primeiro_nome: primeiro, carro: ctx.carro || 'seu carro' };
  return String(corpo ?? '').replace(/\{(\w+)\}/g, (_, k) => (mapa[k] ?? '')).replace(/[ \t]{2,}/g, ' ').trim();
}

/* Toast: recado no pé da tela. textContent — nome de cliente nunca vira HTML. */
let _toastTimer = null;
function toast(msg, type = 'ok', ms = 3400) {
  const t = $('#toast');
  clearTimeout(_toastTimer);
  t.className = 'toast'; t.textContent = '';
  const ico = document.createElement('span'); ico.className = 'toast-ico'; ico.textContent = type === 'err' ? '✕' : '✓';
  const txt = document.createElement('span'); txt.className = 'toast-msg'; txt.textContent = msg;
  const barra = document.createElement('i'); barra.className = 'toast-barra'; barra.style.animationDuration = `${ms}ms`;
  t.append(ico, txt, barra);
  requestAnimationFrame(() => t.classList.add('show', type));
  _toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* Números dos cartões sobem de 0 até o valor — lê-se o painel "acordando". */
function animarNumeros(root = document) {
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $$('.num[data-num]', root).forEach(el => {
    const alvo = Number(el.dataset.num); const sufixo = el.dataset.sufixo || '';
    if (!Number.isFinite(alvo) || reduz || alvo > 9999) { el.firstChild && (el.firstChild.textContent = alvo + sufixo); return; }
    const ini = performance.now(), dur = 620;
    const passo = (t) => {
      const p = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - p, 3);
      el.firstChild.textContent = Math.round(alvo * e) + sufixo;
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
}

function statCard(cls, num, lbl, ico, opts = {}) {
  const inteiro = Number.isInteger(num);
  const sufixo = opts.sufixo || '';
  return `<div class="stat ${cls}${opts.mini ? ' mini' : ''}">
    <div class="stat-top"><span class="lbl">${lbl}</span><span class="ico">${svg(ico)}</span></div>
    <div class="num"${inteiro ? ` data-num="${num}" data-sufixo="${esc(sufixo)}"` : ''}><span>${inteiro ? 0 + sufixo : esc(num)}</span>${opts.small ? `<small>${opts.small}</small>` : ''}</div>
    ${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}
  </div>`;
}
const vazio = (ico, titulo, texto) => `<div class="vazio"><div class="vazio-ico">${svg(ico)}</div><b>${titulo}</b><p>${texto}</p></div>`;
const pillTipo = (tipo) => { const t = TIPO[tipo] || { rotulo:tipo, emoji:'✉️', cor:'gray' };
  return `<span class="badge-pill ${COR_PILL[t.cor] || 'bp-gray'}">${t.emoji} ${esc(t.rotulo)}</span>`; };
const pillStatus = (s) => { const [r, c] = STATUS_ENVIO[s] || [s, 'bp-gray']; return `<span class="badge-pill ${c}">${esc(r)}</span>`; };

// ============================================================================
// ROTEAMENTO
// ============================================================================
const view = $('#view');
function esqueleto(rota) {
  const cartoes = (n) => Array.from({ length:n }, () => `<div class="skel-cartao"><div class="skel" style="width:46px;height:46px;border-radius:12px"></div>
    <div class="skel-linhas"><div class="skel" style="height:14px;width:45%"></div><div class="skel" style="height:12px;width:80%"></div><div class="skel" style="height:12px;width:60%"></div></div></div>`).join('');
  return `<div class="esqueleto"><div class="skel" style="height:40px;width:min(380px,90%)"></div>${cartoes(3)}</div>`;
}

async function route(r, opts = {}) {
  const quieto = opts.quieto === true;
  if (quieto && view.getAttribute('aria-busy') === 'true') return;
  if (r) state.route = r;
  const vez = state._vez = (state._vez || 0) + 1;
  $$('.nav-item').forEach(n => { if (n.dataset.route === state.route) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current'); });
  const mudouDeTela = !quieto && state._rotaAnunciada !== state.route;
  if (!quieto) { view.classList.add('entrando'); view.innerHTML = esqueleto(state.route); view.setAttribute('aria-busy', 'true'); }
  try {
    await (ROUTES[state.route] || renderReguas)({ quieto, vez });
    if (vez === state._vez && !quieto) {
      clearTimeout(state._entraTimer);
      state._entraTimer = setTimeout(() => view.classList.remove('entrando'), 1200);
    }
  } catch (e) {
    if (vez !== state._vez) return;
    if (quieto) {
      toast('Não deu para atualizar esta tela. Tente de novo em instantes.', 'err');
      return;
    }
    view.innerHTML = vazio(I.alerta, 'Não deu para abrir esta tela', esc(e.message) + (e.status === 0 || e.status >= 500 ? '<br><button type="button" class="btn btn-mini" data-tentar-tela>Tentar de novo</button>' : ''));
    $('[data-tentar-tela]', view)?.addEventListener('click', () => route(state.route), { once: true });
  } finally {
    if (vez === state._vez) view.removeAttribute('aria-busy');
  }
  if (vez !== state._vez) return;
  /* acessibilidade (rodada 4): título da aba, aviso para leitor de tela e foco no título da tela nova */
  const nomeTela = NOMES_TELA[state.route] || 'Réguas';
  document.title = `${nomeTela} · IndyCar Comunicar`;
  if (mudouDeTela) {
    state._rotaAnunciada = state.route;
    const an = $('#anuncioTela'); if (an) an.textContent = `Tela ${nomeTela}`;
    if (state._focarTela) { const h = $('h2', view); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll:true }); } }
    state._focarTela = true;
  }
}
const NOMES_TELA = { reguas:'Réguas', mensagens:'Mensagens', campanhas:'Campanhas', clientes:'Clientes', ajustes:'Ajustes' };

/* Prévia: o que as réguas enfileirariam agora, sem gravar nada. */
async function abrirPrevia(regua = null) {
  const titulo = regua ? `Quem receberia hoje · ${TIPO[regua]?.rotulo || regua}` : 'Prévia de hoje';
  openModal(`<div class="modal-head"><h3>${svg(I.olho)} ${esc(titulo)}</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
    <div class="modal-body"><div class="esqueleto"><div class="skel" style="height:60px"></div><div class="skel" style="height:60px"></div></div></div>`, { larga:true });
  const corpo = $('.modal-body', modal);
  corpo.setAttribute('aria-busy', 'true');
  let p;
  try { p = await api('GET', '/previa' + (regua ? `?regua=${encodeURIComponent(regua)}` : '')); }
  catch {
    if (!modalAberto() || !corpo.isConnected) return;
    corpo.innerHTML = '<p class="form-msg erro" role="alert">Não consegui carregar a prévia.</p><button type="button" class="btn">Tentar novamente</button>';
    $('button', corpo).addEventListener('click', () => abrirPrevia(regua));
    $('button', corpo).focus({ preventScroll:true });
    return;
  } finally {
    corpo.removeAttribute('aria-busy');
  }
  if (!modalAberto() || !corpo.isConnected) return;

  const lista = p.previa || [], pulados = p.puladosDetalhe || [], adiados = p.adiadosDetalhe || [];
  const resumo = Object.entries(p.porRegua || {}).filter(([t]) => !regua || t === regua).map(([t, v]) =>
    `<span class="badge-pill ${v.previa ? (COR_PILL[TIPO[t]?.cor] || 'bp-gray') : 'bp-gray'}" title="${v.ligada ? 'ligada' : 'desligada'}">${TIPO[t]?.emoji || ''} ${esc(TIPO[t]?.rotulo || t)} · <b>${v.previa}</b>${v.ligada ? '' : ' (desligada)'}</span>`).join('');
  const item = (x, extra = '') => `<div class="previa-item${extra ? ' pulado' : ''}">
      <div class="q"><span><b>${esc(x.nome || x.telefone)}</b> <small>· ${esc(telBR(x.telefone))}</small></span>${pillTipo(x.tipo)}</div>
      <div class="c">${esc(x.corpo)}</div>${extra ? `<div class="motivo">${esc(extra)}</div>` : ''}</div>`;

  corpo.innerHTML = `
    <div class="previa-resumo">${resumo || '<span class="dica">Nenhuma régua rodou.</span>'}</div>
    ${p.erros?.length ? `<p class="form-msg erro">${p.erros.map(e => `${esc(TIPO[e.tipo]?.rotulo || e.tipo)}: ${esc(e.erro)}`).join('<br>')}</p>` : ''}
    <div class="dica">Simulação: nada foi gravado. Com a régua ligada, isto entra na fila na próxima rodada do carteiro${regua ? '' : ' (réguas desligadas aparecem só para você ver)'}.</div>
    <div class="previa-lista">
      ${lista.length ? lista.map(x => item(x)).join('') : vazio(I.check, 'Ninguém receberia agora', 'Nenhum cliente bate com as regras neste momento.')}
      ${pulados.length ? `<div class="lista-sep">Pulados <em>${pulados.length}</em></div>${pulados.map(x => item(x, x.motivo)).join('')}` : ''}
      ${adiados.length ? `<div class="lista-sep">Adiados <em>${adiados.length}</em></div>${adiados.map(x => item(x, x.motivo)).join('')}` : ''}
    </div>`;
}

// ============================================================================
// RÉGUAS (ligar, ver a mensagem, próxima saída) e AJUSTES (envio, prazos, cuidado)
// As duas telas mexem na mesma configuração e salvam do mesmo jeito.
// ============================================================================
async function carregarConfig(vez, { comRegras = false } = {}) {
  /* r13B: os prazos por serviço só aparecem em Ajustes — as Réguas (tela de entrada) não pedem */
  const [cfg, regras] = await Promise.all([api('GET', '/comunicar/config'), comRegras ? api('GET', '/regras-retorno').catch(() => null) : Promise.resolve(state.regras ?? null)]);
  if (vez !== state._vez) return false;
  state.cfg = cfg; state.cfgEdit = {}; state.regras = regras;
  /* rodada 4: alterações que não foram salvas (aba fechada, servidor dormindo) voltam */
  const rascunho = ehGestor() ? window.R4?.lerRascunhoReguas(cfg) : null;
  if (rascunho && Object.keys(rascunho).length) { state.cfgEdit = rascunho; state._rascunhoRestaurado = Object.keys(rascunho).length; }
  return true;
}
const valorCfg = (campo) => (state.cfgEdit[campo] !== undefined ? state.cfgEdit[campo] : state.cfg[campo]);
const travado = () => (ehGestor() ? '' : 'disabled');
const topoConfig = (titulo) => `<div class="toolbar">
      <div class="left"><h2>${titulo}</h2>
        ${ehGestor() ? '' : '<span class="so-gestor">Só gestor altera.</span>'}</div>
      <div class="right"><button type="button" class="btn primary" id="btnSalvarTopo" disabled hidden>${svg(I.check)} Salvar</button></div>
    </div>`;
const barraSalvar = () => `<div class="barra-salvar" id="barraSalvar" hidden>
      <div class="b-txt" role="status"><span class="n" id="nAlteracoes">0</span><span id="txtAlteracoes">alterações sem salvar</span></div>
      <div class="b-acoes"><button type="button" class="btn" id="btnDescartar">Descartar</button><button type="button" class="btn primary" id="btnSalvar">${svg(I.check)} Salvar</button></div>
    </div>`;
function ligarSalvar(rota) {
  ligarCamposConfig();
  $('#btnSalvar').addEventListener('click', salvarConfig);
  $('#btnSalvarTopo').addEventListener('click', salvarConfig);
  $('#btnDescartar').addEventListener('click', () => { window.R4?.guardarRascunhoReguas({}); route(rota); });
  if (state._rascunhoRestaurado) {
    // a tela nasceu com os valores salvos: reaplica o rascunho nos campos e mostra a barra
    for (const [campo, valor] of Object.entries(state.cfgEdit)) {
      const el = $(`[data-cfg="${campo}"]`, view); if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!valor; else el.value = campo === 'telefone_teste' && telBR(valor) !== '—' ? telBR(valor) : valor;
      el.dispatchEvent(new Event(el.tagName === 'TEXTAREA' || ['text', 'url', 'tel', 'number'].includes(el.type) ? 'input' : 'change', { bubbles:true }));
    }
    toast(`Voltaram ${plural(state._rascunhoRestaurado, 'alteração', 'alterações')} que você não tinha salvado.`, 'ok', 5000);
    state._rascunhoRestaurado = 0;
  }
  atualizarBarra();
}

async function renderReguas({ vez = state._vez } = {}) {
  if (!(await carregarConfig(vez))) return;
  const v = valorCfg, trava = travado();
  const cartao = (tipo) => {
    const t = TIPO[tipo]; const ativo = !!v(`ativo_${tipo}`);
    const vars = [...VARS_COMUNS, ...(t.vars || []), ...(VARS_LINK[tipo] || [])];
    const p = t.param;
    return `<article class="regua${ativo ? '' : ' off'}" data-regua="${tipo}">
      <div class="regua-head">
        <div class="regua-titulo"><span class="regua-ico" aria-hidden="true">${t.emoji}</span>
          <div><h3>${esc(t.rotulo)}</h3><p>${esc(t.desc)}</p>
            <p class="regua-proxima" data-proxima="${tipo}">${ativo ? 'Próxima saída: calculando…' : 'Desligada: nada sai.'}</p></div></div>
        <label class="sw"><input type="checkbox" data-cfg="ativo_${tipo}" ${ativo ? 'checked' : ''} ${trava} aria-label="Ligar ${esc(t.rotulo)}"><span class="tr"></span><span class="sw-txt">${ativo ? 'Ligada' : 'Desligada'}</span></label>
      </div>
      <div class="regua-corpo">
        ${p ? `<div class="param"><span>${esc(p.antes)}</span>
          <input type="number" inputmode="numeric" min="${p.min}" max="${p.max}" step="1" value="${esc(v(p.campo))}" data-cfg="${p.campo}" aria-label="${esc(p.antes + ' ' + p.depois)}" ${trava}>
          <span>${esc(p.depois)}</span></div>` : ''}
        ${tipo === 'avaliacao' ? `<div class="field"><label for="cfg_link">Link da avaliação no Google (sem ele, não sai)</label>
          <input id="cfg_link" type="url" placeholder="https://g.page/r/…" value="${esc(v('link_avaliacao'))}" data-cfg="link_avaliacao" ${trava}></div>` : ''}
        <div class="previa">${celularWA(`<div class="bolha wa-rec" data-previa="${tipo}"></div>`, { mini:true })}</div>
        <details class="regua-editar"><summary>Editar mensagem</summary>
          <div class="field"><label for="msg_${tipo}">Mensagem</label>
          <textarea id="msg_${tipo}" data-cfg="msg_${tipo}" maxlength="1000" ${trava}>${esc(v(`msg_${tipo}`))}</textarea>
          <div class="var-chips" aria-label="Variáveis: clique para inserir">${vars.map(x => `<button type="button" class="var-chip" data-var="${x}" data-alvo="msg_${tipo}" ${trava}>{${x}}</button>`).join('')}</div></div>
        </details>
        <div class="regua-acoes">
          ${tipo !== 'avaliacao' ? `<button type="button" class="btn btn-mini" data-quem="${tipo}">Quem receberia hoje</button>` : ''}
          <button type="button" class="btn btn-mini" data-teste="${tipo}" ${trava}>Mandar teste para mim</button>
        </div>
      </div>
    </article>`;
  };

  view.innerHTML = `
    ${topoConfig('Réguas automáticas')}
    <section class="panel heroi" id="heroiHoje" aria-busy="true" aria-label="Resumo de hoje"><div class="heroi-in"><p class="mini">Hoje</p>
      <div class="skel" style="height:34px;width:min(560px,92%)"></div><div class="skel" style="height:34px;width:min(420px,70%)"></div></div></section>
    <h3 class="secao-tit">As 8 réguas</h3>
    <div class="reguas-grid">${REGUAS.map(cartao).join('')}</div>
    ${barraSalvar()}`;

  REGUAS.forEach(atualizarPrevia);
  window.R13?.pintarHoje($('#heroiHoje', view), { cfg: state.cfg, vez });
  $$('[data-quem]', view).forEach(b => b.addEventListener('click', () => abrirPrevia(b.dataset.quem)));
  $$('[data-teste]', view).forEach(b => b.addEventListener('click', () => mandarTeste(b)));
  window.R6?.pintarReguas('reguas');
  window.R7?.pintarReguas('reguas');
  ligarSalvar('reguas');
  window.R4?.pintarReguas();
}

async function renderAjustes({ vez = state._vez } = {}) {
  if (!(await carregarConfig(vez, { comRegras: true }))) return;
  const v = valorCfg, trava = travado();
  const regras = state.regras;
  const regrasHtml = regras ? htmlRegras(regras, ehGestor()) : '<p role="status">Não deu para carregar os prazos por serviço.</p><button type="button" class="btn" id="btnRecarregarRegras">Tentar de novo</button>';
  const horas = Array.from({ length:25 }, (_, i) => i);
  view.innerHTML = `
    ${topoConfig('Ajustes')}
    <section class="panel envio-cfg">
      <div class="panel-head"><h2>Envio</h2></div>
      <div class="panel-body">
        <div class="pausa${v('pausa_geral') ? ' ligada' : ''}" id="pausaBox">
          <div class="p-txt"><b>Pausa geral</b><small>Segura todos os envios automáticos até desligar.</small></div>
          <label class="sw vermelho"><input type="checkbox" aria-label="Pausa geral de envios" data-cfg="pausa_geral" ${v('pausa_geral') ? 'checked' : ''} ${trava}><span class="tr"></span><span class="sw-txt">${v('pausa_geral') ? 'Pausado' : 'Enviando'}</span></label>
        </div>
        <div class="campos-linha">
          <div class="field curto"><label for="cfg_hora">Hora de envio</label><input id="cfg_hora" type="time" value="${esc(v('hora_envio'))}" data-cfg="hora_envio" ${trava}></div>
          <div class="field"><label for="cfg_ji">Janela (nunca fora dela)</label>
            <div class="janela"><select id="cfg_ji" data-cfg="janela_inicio" ${trava} aria-label="Início da janela">${horas.slice(0, 24).map(h => `<option value="${h}" ${h === Number(v('janela_inicio')) ? 'selected' : ''}>${h}h</option>`).join('')}</select>
              <i>até</i><select data-cfg="janela_fim" ${trava} aria-label="Fim da janela">${horas.slice(1).map(h => `<option value="${h}" ${h === Number(v('janela_fim')) ? 'selected' : ''}>${h}h</option>`).join('')}</select></div></div>
          <div class="field curto"><span class="rot">Domingo</span>
            <label class="sw" style="padding:9px 0"><input type="checkbox" aria-label="Enviar aos domingos" data-cfg="envia_domingo" ${v('envia_domingo') ? 'checked' : ''} ${trava}><span class="tr"></span><span class="sw-txt">${v('envia_domingo') ? 'Envia' : 'Não envia'}</span></label></div>
          <div class="field curto"><label for="cfg_int">Dias entre duas mensagens</label>
            <input id="cfg_int" type="number" inputmode="numeric" min="0" max="60" value="${esc(v('intervalo_minimo_dias'))}" data-cfg="intervalo_minimo_dias" ${trava}></div>
          <div class="field"><label for="cfg_tel">Telefone de teste</label><input id="cfg_tel" type="tel" inputmode="tel" placeholder="(12) 99999-9999" value="${esc(telBR(v('telefone_teste')) === '—' ? '' : telBR(v('telefone_teste')))}" data-cfg="telefone_teste" ${trava}></div>
        </div>
      </div>
    </section>
    <section class="panel"><div class="panel-head"><h2>Prazo de revisão por serviço</h2></div>
      <div class="panel-body"><div class="regras" id="regrasBox">${regrasHtml}</div></div></section>
    <div class="reguas-grid" hidden></div>
    ${barraSalvar()}`;

  ligarRegras();
  $('#btnRecarregarRegras')?.addEventListener('click', async (btnEvent) => {
    const btn = btnEvent.currentTarget;
    btn.disabled = true;
    try {
      const lista = await api('GET', '/regras-retorno');
      if (!btn.isConnected) return;
      state.regras = lista;
      $('#regrasBox').innerHTML = htmlRegras(lista, ehGestor());
      ligarRegras();
      $('#regrasBox').querySelector('input:not(:disabled), button:not(:disabled)')?.focus();
    } catch {
      if (btn.isConnected) toast('Ainda não deu para carregar os prazos por serviço.', 'err');
    } finally { btn.disabled = false; }
  });
  window.R6?.pintarReguas('ajustes');
  window.R7?.pintarReguas('ajustes');
  ligarSalvar('ajustes');
}

/* Lê o valor de um campo de configuração do jeito que o servidor espera. */
function valorCampo(el) {
  const campo = el.dataset.cfg;
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number' || /^janela_/.test(campo)) return el.value === '' ? '' : Number(el.value);
  if (campo === 'telefone_teste') return soDigitos(el.value);
  return el.value;
}
function ligarCamposConfig() {
  $$('[data-cfg]', view).forEach(el => {
    const ev = el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'url' || el.type === 'tel' || el.type === 'number' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      const campo = el.dataset.cfg, novo = valorCampo(el);
      const original = campo === 'telefone_teste' ? soDigitos(state.cfg[campo]) : (state.cfg[campo] ?? el.defaultValue);
      if (el.type === 'number') {
        const n = Number(el.value), min = Number(el.min), max = Number(el.max);
        el.classList.toggle('invalido', el.value === '' || n < min || n > max || !Number.isInteger(n));
      }
      if (String(novo) === String(original ?? '')) delete state.cfgEdit[campo]; else state.cfgEdit[campo] = novo;
      // reflexos imediatos na tela
      const card = el.closest('.regua');
      if (campo.startsWith('ativo_')) { card.classList.toggle('off', !novo); $('.sw-txt', card).textContent = novo ? 'Ligada' : 'Desligada'; }
      if (campo === 'pausa_geral') { $('#pausaBox').classList.toggle('ligada', novo); $('#pausaBox .sw-txt').textContent = novo ? 'Pausado' : 'Enviando'; }
      if (campo === 'envia_domingo') el.closest('.sw').querySelector('.sw-txt').textContent = novo ? 'Envia' : 'Não envia';
      if (campo === 'hora_envio') REGUAS.forEach(atualizarPrevia);
      if (campo === 'telefone_teste' && ev === 'input') { const f = telBR(novo); if (f !== '—' && soDigitos(novo).length >= 10) el.value = f; }
      if (card) { card.classList.toggle('alterada', Object.keys(state.cfgEdit).some(k => k.endsWith('_' + card.dataset.regua) || k === TIPO[card.dataset.regua]?.param?.campo || (card.dataset.regua === 'avaliacao' && k === 'link_avaliacao'))); atualizarPrevia(card.dataset.regua); }
      atualizarBarra();
    });
  });
  // chips de variável: inserem {var} onde está o cursor
  $$('.var-chip[data-var][data-alvo]', view).forEach(ch => ch.addEventListener('click', () => {
    const ta = $('#' + ch.dataset.alvo); if (!ta || ta.disabled) return;
    const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini;
    const tok = `{${ch.dataset.var}}`;
    if (ta.maxLength >= 0 && ta.value.length - (fim - ini) + tok.length > ta.maxLength) {
      ta.focus();
      return toast(`A mensagem aceita até ${ta.maxLength} caracteres.`, 'err');
    }
    ta.setRangeText(tok, ini, fim, 'end');
    ta.focus(); ta.setSelectionRange(ini + tok.length, ini + tok.length);
    ta.dispatchEvent(new Event('input', { bubbles:true }));
  }));
}
function atualizarPrevia(tipo) {
  const el = $(`[data-previa="${tipo}"]`, view); if (!el) return;
  const corpo = $(`#msg_${tipo}`)?.value || '';
  const cfg = { ...state.cfg, ...state.cfgEdit };
  const ctx = { ...EXEMPLO, meses: cfg.meses_retorno, link_avaliacao: cfg.link_avaliacao || 'https://g.page/r/indycar', link_os: `${PATIO_URL}/acompanhar/?t=…`, link_area: `${PATIO_URL}/minha/?c=…` };
  pintarBolha(el, renderTemplate(corpo, ctx), state.cfgEdit.hora_envio || state.cfg.hora_envio || '09:30', 'Escreva a mensagem acima para ver a prévia.');
}
function atualizarBarra() {
  const n = Object.keys(state.cfgEdit).length;
  const barra = $('#barraSalvar'); if (!barra) return;
  barra.hidden = !n;
  $('#nAlteracoes').textContent = n;
  $('#txtAlteracoes').textContent = n === 1 ? 'alteração sem salvar' : 'alterações sem salvar';
  const topo = $('#btnSalvarTopo'); if (topo) { topo.disabled = !n; topo.hidden = !n; }
  window.R4?.guardarRascunhoReguas(state.cfgEdit);
}
async function salvarConfig() {
  if (state._salvandoReguas) return;
  const vez = state._vez;
  const dados = { ...state.cfgEdit };
  if (!Object.keys(dados).length) return;
  const textoRuim = $('.r6-texto textarea.invalido', view);
  if (textoRuim) { textoRuim.closest('details')?.setAttribute('open', ''); textoRuim.focus(); return toast('Confira o texto destacado: ' + ($('.r6-erro-texto:not([hidden])', view)?.textContent || 'tem um erro.'), 'err', 6000); }
  const invalido = $('.param input.invalido, .field input.invalido, .r6-param input.invalido', view);
  if (invalido) { invalido.closest('details')?.setAttribute('open', ''); invalido.focus(); return toast('Confira o número destacado: ele está fora da faixa.', 'err'); }
  if (dados.janela_inicio !== undefined || dados.janela_fim !== undefined) {
    const ini = dados.janela_inicio ?? state.cfg.janela_inicio, fim = dados.janela_fim ?? state.cfg.janela_fim;
    if (ini >= fim) {
      $('#cfg_ji')?.focus();
      return toast('A janela precisa começar antes de terminar.', 'err');
    }
  }
  if (dados.link_avaliacao !== undefined && dados.link_avaliacao && !/^https?:\/\/\S+$/i.test(dados.link_avaliacao)) {
    $('#cfg_link')?.focus();
    return toast('Use um endereço completo para a avaliação, com http:// ou https://.', 'err');
  }
  if (dados.telefone_teste !== undefined && dados.telefone_teste && dados.telefone_teste.length < 10) return toast('Telefone de teste incompleto.', 'err');
  const btns = [$('#btnSalvar'), $('#btnSalvarTopo')].filter(Boolean); btns.forEach(b => (b.disabled = true));
  const campos = $$('[data-cfg]:enabled, #btnDescartar', view);
  campos.forEach(el => { el.disabled = true; });
  state._salvandoReguas = true;
  try {
    const cfg = await api('PUT', '/comunicar/config', dados);
    if (vez !== state._vez) return;
    state.cfg = cfg; state.cfgEdit = {};
    window.R4?.guardarRascunhoReguas({});
    toast('Salvo. Vale a partir da próxima rodada.');
    await route(state.route, { quieto:true });
  } catch (e) {
    toast(e.status === 403 ? 'Só gestor altera as réguas. Use "Pedir ao gestor".' : `${e.message} Suas alterações continuam guardadas neste aparelho.`, 'err', 6000);
  } finally {
    state._salvandoReguas = false;
    campos.forEach(el => { el.disabled = false; });
    if (vez === state._vez) atualizarBarra();
  }
}
async function mandarTeste(btn) {
  const tipo = btn.dataset.teste;
  const cfg = { ...state.cfg, ...state.cfgEdit };
  if (!soDigitos(cfg.telefone_teste) || soDigitos(cfg.telefone_teste).length < 10) { $('#cfg_tel')?.focus(); return toast('Preencha o telefone de teste em Ajustes (e salve).', 'err'); }
  if (state.cfgEdit.telefone_teste !== undefined) return toast('Salve o telefone de teste antes de mandar o teste.', 'err');
  if (state.envioParado) return toast(state.envioParado === 'pausa' ? 'O envio está em pausa: o teste não sai agora.' : 'O WhatsApp da oficina está parado: o teste não sai agora.', 'err', 5000);
  const corpo = $(`#msg_${tipo}`)?.value?.trim();
  if (!corpo) return toast('Escreva a mensagem antes de testar.', 'err');
  btn.disabled = true; const antes = btn.innerHTML; btn.innerHTML = `${svg(I.refresh)} Mandando…`;
  try {
    const ctx = { ...EXEMPLO, nome: state.perfil?.nome || EXEMPLO.nome, meses: cfg.meses_retorno, link_avaliacao: cfg.link_avaliacao || '' };
    await api('POST', '/envios/teste', { corpo: renderTemplate(corpo, ctx) });
    toast(`Teste enviado para ${telBR(cfg.telefone_teste)} — olhe o WhatsApp.`);
  } catch (e) { toast(e.status === 403 ? 'Só gestor manda teste.' : `Não saiu: ${e.message}`, 'err', 6000); }
  finally { btn.disabled = false; btn.innerHTML = antes; }
}

/* ---- prazos de revisão por serviço (régua Revisão) ---- */
function htmlRegras(regras, gestor) {
  const linha = (r) => `<div class="regra${r.ativo ? '' : ' off'}" data-id="${esc(r.id)}">
      <input class="rot" value="${esc(r.rotulo)}" data-campo="rotulo" aria-label="Nome da regra" ${gestor ? '' : 'disabled'}>
      <input class="palavras" value="${esc((r.palavras || []).join(', '))}" data-campo="palavras" aria-label="Palavras do serviço" placeholder="palavras, separadas, por vírgula" ${gestor ? '' : 'disabled'}>
      <input class="meses" type="number" min="1" max="36" value="${esc(r.meses)}" data-campo="meses" aria-label="Meses" ${gestor ? '' : 'disabled'}>
      <label class="sw"><input type="checkbox" aria-label="Regra ativa" data-campo="ativo" ${r.ativo ? 'checked' : ''} ${gestor ? '' : 'disabled'}><span class="tr"></span></label>
      <div class="acoes"><button type="button" class="icon-btn" data-msg aria-expanded="false" aria-label="Mensagem própria desta regra" title="Mensagem própria (opcional)">${svg(I.edit)}</button>
        <button type="button" class="icon-btn red" data-apagar aria-label="Apagar regra" ${gestor ? '' : 'disabled'}>${svg(I.trash)}</button></div>
      <div class="regra-msg" hidden><input value="${esc(r.mensagem || '')}" data-campo="mensagem" placeholder="Mensagem só para esta regra (vazio = usa a da régua)" aria-label="Mensagem da regra" ${gestor ? '' : 'disabled'}><small>{meses} {servico}</small></div>
    </div>`;
  return `<div class="lista-sep">Prazo por serviço <em>${regras.length}</em></div>
    <div class="regras-head"><span>Serviço</span><span>Palavras que casam</span><span>Meses</span><span></span><span></span></div>
    ${regras.map(linha).join('')}
    ${gestor ? `<div class="regra nova" data-nova>
      <input class="rot" placeholder="Ex.: Pneus" data-campo="rotulo" aria-label="Nome da nova regra">
      <input class="palavras" placeholder="pneu, rodízio" data-campo="palavras" aria-label="Palavras da nova regra">
      <input class="meses" type="number" min="1" max="36" placeholder="12" data-campo="meses" aria-label="Meses da nova regra">
      <span></span>
      <div class="acoes"><button type="button" class="btn btn-mini primary" data-adicionar>${svg(I.plus)} Adicionar</button></div>
    </div>` : ''}`;
}
function ligarRegras() {
  const box = $('#regrasBox'); if (!box) return;
  const lerLinha = (linha) => ({
    rotulo: $('[data-campo="rotulo"]', linha).value.trim(),
    palavras: $('[data-campo="palavras"]', linha).value,
    meses: Number($('[data-campo="meses"]', linha).value),
    ativo: $('[data-campo="ativo"]', linha)?.checked ?? true,
    mensagem: $('[data-campo="mensagem"]', linha)?.value ?? '',
  });
  box.onchange = async (e) => {
    const linha = e.target.closest('.regra'); if (!linha || linha.hasAttribute('data-nova')) return;
    const campo = e.target.dataset.campo; if (!campo) return;
    const d = lerLinha(linha);
    if (campo === 'meses' && (!Number.isInteger(d.meses) || d.meses < 1 || d.meses > 36)) return toast('Meses entre 1 e 36.', 'err');
    try {
      const r = await api('PUT', `/regras-retorno/${linha.dataset.id}`, { [campo]: d[campo] });
      linha.classList.toggle('off', !r.ativo);
      if (campo === 'palavras') $('[data-campo="palavras"]', linha).value = (r.palavras || []).join(', ');
      toast('Regra salva.', 'ok', 1800);
    } catch (err) { toast(err.status === 403 ? 'Só gestor altera as regras.' : err.message, 'err'); }
  };
  box.onclick = async (e) => {
    const linha = e.target.closest('.regra'); if (!linha) return;
    const mensagem = e.target.closest('[data-msg]');
    if (mensagem) {
      const m = $('.regra-msg', linha);
      m.hidden = !m.hidden;
      mensagem.setAttribute('aria-expanded', String(!m.hidden));
      if (!m.hidden && !$('input', m).disabled) $('input', m).focus();
      return;
    }
    const apagar = e.target.closest('[data-apagar]');
    if (apagar) {
      if (!confirm(`Apagar a regra "${$('[data-campo="rotulo"]', linha).value}"? Os serviços dela passam a usar o prazo padrão.`)) return;
      apagar.disabled = true;
      try {
        const apagada = state.regras?.find(r => String(r.id) === linha.dataset.id);
        await api('DELETE', `/regras-retorno/${linha.dataset.id}`);
        if (!box.isConnected) return;
        state.regras = state.regras?.filter(r => String(r.id) !== linha.dataset.id) ?? [];
        linha.remove();
        $('.lista-sep em', box).textContent = state.regras.length;
        $('[data-nova] [data-campo="rotulo"]', box)?.focus();
        /* r13B: apagou sem querer? "Desfazer" cria a regra de novo com o mesmo nome, palavras, meses e mensagem */
        if (apagada) toastAcao('Regra apagada.', 'Desfazer', async () => {
          const { rotulo, palavras, meses, mensagem, ativo, ordem } = apagada;
          const volta = await api('POST', '/regras-retorno', { rotulo, palavras: (palavras || []).join(', '), meses, mensagem: mensagem || '', ativo, ordem });
          state.regras = [...(state.regras || []), volta].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
          if (box.isConnected) { box.innerHTML = htmlRegras(state.regras, ehGestor()); }
          toast('Regra de volta.');
        });
        else toast('Regra apagada.');
      } catch (err) { toast(err.message, 'err'); }
      finally { apagar.disabled = false; }
      return;
    }
    const adicionar = e.target.closest('[data-adicionar]');
    if (adicionar) {
      const d = lerLinha(linha);
      if (!d.rotulo || !d.palavras.trim()) return toast('Dê um nome e pelo menos uma palavra do serviço.', 'err');
      if (!Number.isInteger(d.meses) || d.meses < 1 || d.meses > 36) return toast('Meses entre 1 e 36.', 'err');
      adicionar.disabled = true;
      try {
        const regra = await api('POST', '/regras-retorno', d);
        if (!box.isConnected) return;
        state.regras = [...state.regras, regra];
        box.innerHTML = htmlRegras(state.regras, ehGestor());
        $('[data-nova] [data-campo="rotulo"]', box)?.focus();
        toast('Regra adicionada.');
      } catch (err) { toast(err.message, 'err'); }
      finally { adicionar.disabled = false; }
    }
  };
}

// ============================================================================
// MENSAGENS — fila e histórico
// ============================================================================
async function renderMensagens({ quieto, vez = state._vez } = {}) {
  const f = state.msg;
  const q = new URLSearchParams();
  if (f.status !== 'todas') q.set('status', f.status);
  if (f.tipo !== 'todos') q.set('tipo', f.tipo);
  if (f.q) q.set('q', f.q);
  if (f.de) q.set('de', f.de);
  if (f.ate) q.set('ate', f.ate);
  if (f.intencao !== 'todas') q.set('intencao', f.intencao);
  if (f.origem && f.origem !== 'todas') q.set('origem', f.origem);
  state._qMsg = new URLSearchParams(q);
  /* rodada 4: páginas de 100 (antes vinham 300 de uma vez) */
  const POR_PAGINA = 100;
  q.set('limite', String(POR_PAGINA));
  const lista = await api('GET', '/envios?' + q);
  if (vez !== state._vez) return;
  state._msgLista = lista; state._msgFim = lista.length < POR_PAGINA;
  const htmlLista = () => lista.length ? htmlEnvios(lista, '')
    : vazio(I.wa, f.q || f.de || f.ate || f.intencao !== 'todas' || f.origem !== 'todas' || f.status !== 'todas' || f.tipo !== 'todos' ? 'Nada com esse filtro' : 'Nenhuma mensagem ainda',
        f.q || f.de || f.ate || f.intencao !== 'todas' || f.origem !== 'todas' || f.status !== 'todas' || f.tipo !== 'todos' ? 'Tente outro status, tipo, período ou busca.' : 'As automáticas aparecem sozinhas quando você ligar as réguas; campanhas e avulsas também caem aqui.');

  /* Atualização quieta (filtro, busca, cancelar…): só a lista e os contadores
     mudam — o campo de busca continua com o foco e o cursor de quem digita. */
  if (quieto && $('#listaEnvios')) {
    $('#listaEnvios').innerHTML = htmlLista();
    $('#qtdMsg').textContent = plural(lista.length, 'na lista', 'na lista') + (state._msgFim ? '' : '+');
    $$('.pilula', view).forEach(b => { const a = b.dataset.filtro === f.status; b.classList.toggle('ativa', a); b.setAttribute('aria-selected', String(a)); });
    $('#maisMsg').hidden = state._msgFim;
    pintarBarraFalhas();
    return;
  }
  const pilula = (chave, rotulo) => `<button type="button" role="tab" aria-selected="${f.status === chave}" class="pilula ${f.status === chave ? 'ativa' : ''}" data-filtro="${chave}">${rotulo}</button>`;
  const tipos = ['todos', ...REGUAS, 'campanha', 'avulsa', 'remarcacao', ...TIPOS_PATIO];

  view.innerHTML = `
    <div class="toolbar">
      <div class="left"><h2>Mensagens</h2><span class="badge-pill bp-gray" id="qtdMsg" role="status">${plural(lista.length, 'na lista', 'na lista')}${state._msgFim ? '' : '+'}</span></div>
      <div class="right">
        <div class="search">${svg(I.search)}<input id="qMsg" placeholder="Buscar por nome, telefone ou texto…" value="${esc(f.q)}" aria-label="Buscar mensagens"></div>
        <select id="tipoMsg" class="inp" style="width:auto" aria-label="Filtrar por tipo">${tipos.map(t => `<option value="${t}" ${f.tipo === t ? 'selected' : ''}>${t === 'todos' ? 'Todos os tipos' : `${TIPO[t]?.emoji || ''} ${TIPO[t]?.rotulo || t}`}</option>`).join('')}</select>
      </div>
    </div>
    <div class="pilulas" role="tablist">
      ${pilula('todas', 'Todas')}${pilula('pendente', 'Na fila')}${pilula('enviado', 'Enviadas')}${pilula('falhou', 'Falharam')}${pilula('pulado', 'Puladas')}${pilula('cancelado', 'Canceladas')}
    </div>
    <div id="barraFalhas" class="barra-falhas" hidden></div>
    <div class="panel"><div class="panel-body lista lista-anim" id="listaEnvios">${htmlLista()}</div>
      <div class="mais-linha"><button type="button" class="btn" id="maisMsg" ${state._msgFim ? 'hidden' : ''}>Carregar mais 100</button></div></div>`;

  $('#maisMsg').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Carregando…';
    const consulta = state._vez;
    try {
      const q2 = new URLSearchParams(state._qMsg); q2.set('limite', '100'); q2.set('offset', String(state._msgLista.length));
      const mais = await api('GET', '/envios?' + q2);
      if (consulta !== state._vez || !b.isConnected) return;
      state._msgLista.push(...mais); state._msgFim = mais.length < 100;
      const ultimoDia = window.R15 ? window.R15.diaDoEnvio(state._msgLista[state._msgLista.length - mais.length - 1]) : '';
      $('#listaEnvios').insertAdjacentHTML('beforeend', htmlEnvios(mais, ultimoDia));
      $('#qtdMsg').textContent = plural(state._msgLista.length, 'na lista', 'na lista') + (state._msgFim ? '' : '+');
      b.hidden = state._msgFim;
    } catch (e) { if (consulta === state._vez && b.isConnected) toast(e.message, 'err'); }
    finally { b.disabled = false; b.textContent = 'Carregar mais 100'; }
  });
  $$('.pilula', view).forEach(b => b.addEventListener('click', () => { state.msg.status = b.dataset.filtro; route(null, { quieto:true }); }));
  $('#tipoMsg').addEventListener('change', e => { state.msg.tipo = e.target.value; route(null, { quieto:true }); });
  $('#qMsg').addEventListener('input', debounce(e => {
    if (!e.target.isConnected) return;
    state.msg.q = e.target.value.trim();
    route(null, { quieto:true });
  }, 300));
  ligarAcoesEnvio($('#listaEnvios'));
  pintarBarraFalhas();
}

/* R15: na aba "Falharam", um botão devolve todas à fila de uma vez (quando o WhatsApp volta, não é um clique por mensagem).
   Ficam de fora as "sem confirmação" (podem ter chegado) e quem pediu para parar. Só entra na fila: quem manda é o carteiro, aos poucos. */
function pintarBarraFalhas() {
  const barra = $('#barraFalhas'); if (!barra) return;
  const lista = state.msg.status === 'falhou' && pode('cancelar_qualquer') && window.R15 ? window.R15.reenviaveis(state._msgLista || []) : [];
  barra.hidden = !lista.length;
  if (!lista.length) { barra.innerHTML = ''; return; }
  barra.innerHTML = `<p><b>${plural(lista.length, 'mensagem falhou', 'mensagens falharam')}</b> e pode${lista.length === 1 ? '' : 'm'} voltar para a fila.</p>
    <button type="button" class="btn primary" id="reenviarTodas">${svg(I.refresh)} Voltar ${lista.length === 1 ? 'a mensagem' : `as ${lista.length}`} para a fila</button>`;
  $('#reenviarTodas').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    if (!confirm(`Devolver ${plural(lista.length, 'mensagem', 'mensagens')} para a fila? Elas saem aos poucos, na próxima rodada. As que talvez já tenham chegado ficam de fora.`)) return;
    b.disabled = true; let feitas = 0, erro = null;
    for (const e of lista) {
      try { await api('POST', `/envios/${e.id}/reenviar`); feitas++; b.textContent = `Devolvendo… ${feitas} de ${lista.length}`; }
      catch (err) { erro = err; break; }
    }
    toast(erro ? `${plural(feitas, 'voltou', 'voltaram')} para a fila. Parei porque: ${erro.message || 'erro no servidor'}.` : `${plural(feitas, 'mensagem voltou', 'mensagens voltaram')} para a fila. Saem na próxima rodada.`, erro ? 'err' : 'ok', 5000);
    route(null, { quieto: true });
  });
}

/* Quem mandou: nome de quem clicou (criado_por guarda o nome; criado_por_id, o perfil) ou 'automática'. */
function quemMandou(e) {
  if (e.criado_por && !['gerador', 'gatilho'].includes(e.criado_por)) {
    const eu = e.criado_por_id && e.criado_por_id === state.perfil?.id;
    return ` · <span class="por-quem" title="Quem mandou">✍ ${eu ? 'você' : esc(e.criado_por)}</span>`;
  }
  return REGUAS.includes(e.tipo) ? ' · <span class="por-quem auto">automática</span>' : '';
}
/* R15: uma linha por dia na lista ("Hoje", "Amanhã", "ter 24/11"). Sem o módulo, a lista segue sem as linhas. */
function htmlEnvios(lista, ultimoDia) {
  const R = window.R15;
  if (!R) return lista.map(cartaoEnvio).join('');
  const hoje = hojeSP();
  return R.blocosPorDia(lista, ultimoDia).map(b => (b.continua ? '' : `<h3 class="dia-cab">${esc(R.rotuloDiaLista(b.dia, hoje))}</h3>`) + b.itens.map(cartaoEnvio).join('')).join('');
}
function cartaoEnvio(e) {
  const t = TIPO[e.tipo] || { rotulo:e.tipo, emoji:'✉️' };
  const quando = e.status === 'enviado' ? `enviada ${esc(dataHoraBR(e.enviado_em))}`
    : e.status === 'pendente' ? `sai ${esc(dataHoraBR(e.enviar_em))}` : `programada ${esc(dataHoraBR(e.enviar_em))}`;
  const resposta = e.resposta ? `<div class="resposta ${esc(e.resposta_tipo || 'neutra')}"><span class="r-ico">💬</span>
      <span class="r-txt">${esc(e.resposta)}</span>
      <span class="r-tag">${e.resposta_tipo === 'positiva' ? 'gostou' : e.resposta_tipo === 'negativa' ? 'reclamou' : e.resposta_tipo === 'parar' ? 'pediu para parar' : 'respondeu'}${e.respondido_em ? ` · ${esc(horaBR(e.respondido_em))}` : ''}</span></div>` : '';
  const meu = pode('cancelar_qualquer') || (e.criado_por_id && e.criado_por_id === state.perfil?.id);
  const podeCancelar = meu && e.status === 'pendente', podeReenviar = meu && ['falhou', 'cancelado', 'pulado'].includes(e.status)
    && !(e.status === 'pulado' && /não receber|parar/i.test(e.motivo_pulado || '')); // r13: quem saiu da lista não ganha "Reenviar" (o carteiro pularia de novo)
  // 16/10: timeout/conexão caída depois do pedido — pode ter chegado; nada sai de novo sozinho
  const duvida = e.status === 'falhou' && e.erro_classe === 'sem_confirmacao';
  return `<article class="envio s-${esc(e.status)}" data-id="${esc(e.id)}">
    <div class="envio-topo">
      <div class="envio-quem"><span class="linha" style="gap:8px"><span class="tipo-ico" aria-hidden="true">${t.emoji}</span>
        ${e.cliente_id ? `<button type="button" class="cli-nome" data-ficha="${esc(e.cliente_id)}"><b>${esc(e.nome || e.telefone)}</b></button>` : `<b>${esc(e.nome || e.telefone)}</b>`}</span>
        <small>${esc(telBR(e.telefone))}${quemMandou(e)}</small></div>
      <div class="envio-chips">${pillTipo(e.tipo)}${duvida ? `<span class="badge-pill bp-orange" title="Não sabemos se chegou">❓ Sem confirmação</span>` : pillStatus(e.status)}${e.intencao ? pillIntencao(e.intencao, e.intencao_resumo) : ''}${e.agendou_depois_id ? `<span class="selo-agendou">${svg(I.calendar)} agendou depois</span>` : ''}</div>
    </div>
    <div class="envio-corpo">${esc(e.corpo)}</div>
    ${resposta}
    <div class="envio-rodape">
      <div class="meta"><span>${svg(I.clock)} ${quando}</span>
        ${e.tentativas > 1 ? `<span>${e.tentativas} tentativas</span>` : ''}
        ${duvida ? `<span class="envio-duvida" role="note">❓ <b>Não sabemos se chegou</b> — confira no WhatsApp${e.erro ? ` <small>(${esc(String(e.erro).replace(/^Não sabemos se chegou:\s*/, '').replace(/\s*Confira no WhatsApp antes de reenviar\.?$/, ''))})</small>` : ''}</span>`
          : e.erro ? `<span class="envio-erro" title="${esc(e.erro)}">${svg(I.alerta)} ${esc(erroEmPortugues(e))}</span>` : ''}
        ${e.motivo_pulado ? `<span class="envio-pulado">⏭ ${esc(e.motivo_pulado)}</span>` : ''}</div>
      <div class="envio-acoes">
        ${podeCancelar ? `<button type="button" class="btn btn-mini" data-cancelar="${esc(e.id)}">${svg(I.x)} Cancelar</button>` : ''}
        ${duvida && meu ? `<button type="button" class="btn btn-mini primary" data-chegou="${esc(e.id)}">✓ Chegou</button>` : ''}
        ${podeReenviar ? `<button type="button" class="btn btn-mini" data-reenviar="${esc(e.id)}"${duvida ? ' data-duvida="1"' : ''}>${svg(I.refresh)} Reenviar</button>` : ''}
        ${e.intencao && CHAMA_CONSULTOR.has(e.intencao) ? (e.encaminhado_em ? '<span class="badge-pill bp-green">✓ no Atendimento</span>' : `<button type="button" class="btn btn-mini primary" data-encaminhar="${esc(e.id)}">${svg(I.wa)} Passar ao Atendimento</button>`) : ''}
        ${e.status === 'enviado' || e.resposta || duvida ? `<a class="btn btn-mini ghost" href="${esc(linkConversa(e.telefone))}">${svg(I.wa)} Abrir conversa</a>` : ''}
      </div>
    </div>
  </article>`;
}
function ligarAcoesEnvio(root) {
  if (!root) return;
  root.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cancelar]'), r = e.target.closest('[data-reenviar]'), f = e.target.closest('[data-ficha]');
    if (f) return abrirFicha(f.dataset.ficha);
    const enc = e.target.closest('[data-encaminhar]'); if (enc) return encaminhar(enc.dataset.encaminhar, enc);
    if (c) {
      c.disabled = true;   // R15: sem pergunta, o aviso abaixo tem Desfazer
      try {
        const id = c.dataset.cancelar;
        await api('POST', `/envios/${id}/cancelar`); route(null, { quieto:true });
        toastAcao('Mensagem cancelada.', 'Desfazer', async () => {
          await api('POST', `/envios/${id}/desfazer-cancelamento`); toast('Voltou para a fila.'); route(null, { quieto:true });
        });
      }
      catch (err) { toast(err.message, 'err'); c.disabled = false; }
    }
    const ch = e.target.closest('[data-chegou]');
    if (ch) {
      ch.disabled = true;
      try { await api('POST', `/envios/${ch.dataset.chegou}/chegou`); toast('Marcada como entregue.'); route(null, { quieto:true }); }
      catch (err) { toast(err.message, 'err'); ch.disabled = false; }
      return;
    }
    if (r) {
      if (r.dataset.duvida && !confirm('Reenviar? Se a primeira tiver chegado, o cliente recebe duas. Confira no WhatsApp antes.')) return;
      r.disabled = true;
      try { await api('POST', `/envios/${r.dataset.reenviar}/reenviar`); toast('De volta à fila — sai na próxima rodada.'); route(null, { quieto:true }); }
      catch (err) { toast(err.message, 'err'); r.disabled = false; }
    }
  });
}

// ============================================================================
// CAMPANHAS — nova campanha em passos + histórico
// ============================================================================
async function renderCampanhas({ vez = state._vez } = {}) {
  const envios = await api('GET', '/envios?tipo=campanha&limite=1000');
  if (vez !== state._vez) return;
  /* agrupa por (mensagem + dia): como o servidor grava o corpo JÁ com o nome e
     o carro de cada cliente, a chave usa o começo do texto sem o nome. */
  const grupos = new Map();
  for (const e of envios) {
    const chave = assinaturaCampanha(e);
    const g = grupos.get(chave) || { lote: e.lote || null, dia: diaSP(e.enviar_em), corpo: e.corpo, total:0, enviadas:0, pendentes:0, respondidas:0, agendaram:0, falhas:0, por: e.criado_por };
    g.total++;
    if (e.status === 'enviado') g.enviadas++;
    if (e.status === 'pendente') g.pendentes++;
    if (e.status === 'falhou') g.falhas++;
    if (e.respondido_em) g.respondidas++;
    if (e.agendou_depois_id) g.agendaram++;
    grupos.set(chave, g);
  }
  const lista = [...grupos.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1));

  view.innerHTML = `
    <div class="toolbar">
      <div class="left"><h2>Campanhas</h2><span class="badge-pill bp-gray">${plural(lista.length, 'campanha', 'campanhas')}</span></div>
      <div class="right"><button type="button" class="btn primary" id="btnNovaCamp">${svg(I.megafone)} Nova campanha</button></div>
    </div>
    <div id="aprovacoes"></div>
    <div class="panel"><div class="panel-head"><h2>${svg(I.megafone)} Histórico</h2><span class="panel-sub">agrupado por mensagem e dia</span></div>
      <div class="panel-body lista lista-anim">
        ${lista.length ? lista.map(g => `<article class="camp"${g.lote ? ` data-lote="${esc(g.lote)}"` : ''}>
            <div class="camp-txt"><span class="d">${esc(rotuloDia(g.dia))}${g.pendentes ? ` · <span style="color:var(--orange-txt)">${g.pendentes} na fila</span>` : ''}${g.falhas ? ` · <span style="color:var(--red-txt)">${g.falhas} falharam</span>` : ''}${g.por ? ` · por ${esc(g.por)}` : ''}</span>
              <span class="c">${esc(g.corpo)}</span>${g.pendentes && g.lote && pode('cancelar_qualquer') ? `<button type="button" class="btn btn-mini" data-cancelar-lote="${esc(g.lote)}" data-n="${g.pendentes}">Cancelar o que falta (${g.pendentes})</button>` : ''}</div>
            <div class="camp-nums">
              <div><b>${g.enviadas}</b><small>enviadas</small></div>
              <div class="g"><b>${g.respondidas}</b><small>responderam</small></div>
              <div class="p"><b>${g.agendaram}</b><small>agendaram</small></div>
            </div></article>`).join('')
          : vazio(I.megafone, 'Nenhuma campanha ainda', 'Escolha um segmento (ou um cliente), escreva a mensagem e coloque na fila. Quem pediu para parar fica fora sozinho.')}
      </div></div>`;
  $('#btnNovaCamp').addEventListener('click', () => openCampanhaModal());
  $$('[data-cancelar-lote]', view).forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Cancelar as ${b.dataset.n} mensagens dessa campanha que ainda não saíram? As que já saíram não mudam.`)) return;
    b.disabled = true;
    try { const r = await api('POST', `/lotes/${b.dataset.cancelarLote}/cancelar`, {}); toast(`${plural(r.cancelados, 'mensagem cancelada', 'mensagens canceladas')}.`); if (vez === state._vez) await route(null, { quieto: true }); }
    catch (e) { toast(e.message || 'Não consegui cancelar agora.', 'err'); b.disabled = false; }
  }));
  pintarAprovacoes();
  window.R7?.pintarCampanhas();
}

function assinaturaCampanha(e) {
  if (e.lote) return `lote:${e.lote}`;                 // quando o servidor marca o lote, é exato
  let t = String(e.corpo || '').toLowerCase();
  const nome = String(e.nome || '').toLowerCase().trim();
  if (nome) { t = t.split(nome).join(' '); const pn = nome.split(/\s+/)[0]; if (pn && pn.length > 2) t = t.split(pn).join(' '); }
  t = t.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');
  return `${diaSP(e.enviar_em)}|${e.criado_por || ''}|${t.slice(0, 40)}`;
}
async function carregarSegmentos() { if (!state.segmentos) state.segmentos = await api('GET', '/segmentos'); return state.segmentos; }
async function carregarModelos() { if (!state.modelos) state.modelos = await api('GET', '/modelos').catch(() => []); return state.modelos; }

/* Modal "Nova campanha" em 3 passos: para quem → mensagem → quando. */
let aberturaCampanha = 0;
window.openCampanhaModal = async function (pre = {}) {
  const abertura = ++aberturaCampanha;
  const vez = state._vez;
  const janelaAnterior = modal.firstElementChild;
  const estavaAberta = modalAberto();
  const c = { passo:1, alvo: pre.cliente ? 'cliente' : 'segmento', filtro:'todos', valor:'', cliente: pre.cliente || null,
    previa:null, corpo: window.R4?.lerRascunho('campanha') || '', quando:'agora', enviar_em:'', sugestao:null, segSalvoId:null };
  window.R7?.aplicarRepetir(c, pre);
  const rascunho = c.corpo;
  // rodada 5: segmentos salvos chegam junto (em paralelo) com segmentos e modelos
  const aberturaAtual = () => abertura === aberturaCampanha && vez === state._vez &&
    janelaAnterior === modal.firstElementChild && estavaAberta === modalAberto();
  let segmentos, modelos, salvos;
  try {
    [segmentos, modelos, salvos] = await Promise.all([carregarSegmentos(), carregarModelos(), window.R5 ? window.R5.segmentosSalvos().catch(() => []) : Promise.resolve([])]);
  } catch (e) {
    if (aberturaAtual()) toast(e.message || 'Não consegui abrir a campanha. Tente novamente.', 'err');
    return;
  }
  if (!aberturaAtual()) return;
  if (rascunho) toast('Recuperei a mensagem que você estava escrevendo.');

  openModal(`<div class="modal-head"><h3>${svg(I.megafone)} Nova campanha</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
    <div class="passos" aria-label="Passos">
      <span class="passo" data-passo="1"><span class="pn">1</span><span class="pt">Para quem</span></span><span class="passo-sep"></span>
      <span class="passo" data-passo="2"><span class="pn">2</span><span class="pt">Mensagem</span></span><span class="passo-sep"></span>
      <span class="passo" data-passo="3"><span class="pn">3</span><span class="pt">Quando</span></span>
    </div>
    <div class="modal-body" id="campBody"></div>
    <div class="modal-foot"><button type="button" class="btn ghost esq" id="campVoltar">${svg(I.voltar)} Voltar</button>
      <button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="campAvancar">Avançar ${svg(I.seta)}</button></div>`, { larga:true, classe:'com-passos' });

  const body = $('#campBody');
  const campanhaAberta = () => body.isConnected && modalAberto();
  let consultaSegmento = 0;
  const alvoResumo = () => c.alvo === 'cliente' ? (c.cliente ? c.cliente.nome : 'nenhum cliente escolhido')
    : `${c.previa?.total ?? '…'} cliente(s) · ${window.R16.textoSegmento(segmentos.find(s => s.id === c.filtro)?.rotulo || c.filtro, c.valor)}`;
  const clienteDaPrevia = () => c.alvo === 'cliente' ? c.cliente : (c.previa?.amostra?.[0] || null);
  /* atendente: campanha para um grupo vai para o gestor aprovar; avulsa sai direto */
  const precisaAprovar = () => c.alvo === 'segmento' && !pode('campanha_aprovar');

  const buscarSegPrevia = debounce(async (box, consulta) => {
    const atual = () => campanhaAberta() && box.isConnected && consulta === consultaSegmento;
    if (!atual()) return;
    try {
      const seg = segmentos.find(s => s.id === c.filtro);
      const p = await api('GET', `/segmentos/previa?filtro=${encodeURIComponent(c.filtro)}&valor=${encodeURIComponent(seg?.valor !== undefined ? (c.valor || seg.valor) : '')}`);
      if (!atual()) return;
      c.previa = p;
      box.innerHTML = `<div class="top"><span class="n">${p.total}</span><span class="t">${p.total === 1 ? 'cliente recebe' : 'clientes recebem'}</span>
          <button type="button" class="btn btn-mini" id="segSalvar" title="Guardar este segmento com um nome para usar de novo">${svg(I.plus)} Salvar segmento</button></div>
        ${window.R5 ? window.R5.htmlPulados(p) : ''}
        ${p.amostra?.length ? `<div class="amostra">${p.amostra.slice(0, 8).map(a => `<span title="${esc(a.telefone || '')}">${esc(a.nome)}${a.carro ? ` · ${esc(a.carro)}` : ''}</span>`).join('')}${p.total > 8 ? `<span>+${p.total - 8}</span>` : ''}</div>` : ''}`;
      $('#segSalvar')?.addEventListener('click', async () => {
        const seg = segmentos.find(s => s.id === c.filtro);
        const s = await window.R5?.salvarSegmento(c.filtro, seg?.valor !== undefined ? (c.valor || seg.valor) : null, window.R16.textoSegmento(seg?.rotulo || c.filtro, c.valor));
        if (s && atual()) { c.segSalvoId = s.id; salvos.unshift(s); passo1(); }
      });
    } catch (e) {
      if (!atual()) return;
      box.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p><button type="button" class="btn" data-repetir> Tentar novamente</button>`;
      $('[data-repetir]', box).addEventListener('click', atualizarSegPrevia);
    } finally {
      if (atual()) box.removeAttribute('aria-busy');
    }
  }, 350);
  const atualizarSegPrevia = () => {
    c.previa = null;
    const box = $('#segPrevia', body);
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = '<div class="skel" style="height:54px"></div>';
    buscarSegPrevia(box, ++consultaSegmento);
  };

  const passo1 = () => {
    const seg = segmentos.find(s => s.id === c.filtro);
    body.innerHTML = `
      <div class="alvo-opcoes">
        <button type="button" class="alvo-op ${c.alvo === 'segmento' ? 'ativo' : ''}" data-alvo="segmento"><b>${svg(I.user)} Um grupo de clientes</b><small>por segmento, com prévia ao vivo</small></button>
        <button type="button" class="alvo-op ${c.alvo === 'cliente' ? 'ativo' : ''}" data-alvo="cliente"><b>${svg(I.send)} Um cliente específico</b><small>mensagem avulsa</small></button>
      </div>
      <div id="alvoSeg" ${c.alvo === 'segmento' ? '' : 'hidden'}>
        <div class="ia-sugere"><button type="button" class="btn ia" id="campIA">✨ IA, quem devo chamar?</button><small class="muted">olha os números e sugere segmento + mensagem; você confirma</small></div>
        <div id="campIASug">${c.sugestao ? htmlSugestao(c.sugestao) : ''}</div>
        ${window.R5 ? window.R5.htmlSegmentosSalvos(salvos, c.filtro, c.valor || segmentos.find(s => s.id === c.filtro)?.valor) : ''}
        <div class="campos-linha">
          <div class="field"><label for="campSeg">Segmento</label><select id="campSeg">${segmentos.map(s => `<option value="${esc(s.id)}" ${s.id === c.filtro ? 'selected' : ''}>${esc(s.rotulo)}</option>`).join('')}</select></div>
          <div class="field curto" id="campValorBox" ${seg?.valor !== undefined ? '' : 'hidden'}><label for="campValor">${esc(seg?.unidade === 'texto' ? 'Palavra' : seg?.unidade || 'Valor')}</label>
            <input id="campValor" ${seg?.unidade === 'texto' ? 'type="text"' : 'type="number" inputmode="numeric" min="1"'} value="${esc(c.valor || seg?.valor || '')}"></div>
        </div>
        <div class="seg-previa" id="segPrevia" aria-live="polite" style="margin-top:12px"></div>
      </div>
      <div id="alvoCli" ${c.alvo === 'cliente' ? '' : 'hidden'}>
        ${c.cliente ? `<div class="cli-escolhido"><span><b>${esc(c.cliente.nome)}</b><small>${esc(telBR(c.cliente.telefone))}${c.cliente.carro ? ` · ${esc(c.cliente.carro)}` : ''}</small></span><button type="button" class="btn btn-mini" id="trocarCli">Trocar</button></div>`
        : `<div class="field"><label for="campBusca">Cliente</label><div class="search" style="max-width:none">${svg(I.search)}<input id="campBusca" placeholder="Nome, telefone ou placa…" autocomplete="off"></div></div>
           <div class="sugestoes" id="campSug" hidden></div>`}
      </div>`;
    $$('.alvo-op', body).forEach(b => b.addEventListener('click', () => { c.alvo = b.dataset.alvo; passo1(); }));
    if (c.alvo === 'segmento') {
      $('#campIA').addEventListener('click', async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        $('#campIASug').innerHTML = '<div class="ia-pensando"><span class="ia-pontos"><i></i><i></i><i></i></span> olhando os números da oficina…</div>';
        const box = $('#campIASug');
        const atual = () => campanhaAberta() && box.isConnected;
        try {
          const sugestao = await api('POST', '/ia/publico');
          if (!atual()) return;
          c.sugestao = sugestao;
          box.innerHTML = htmlSugestao(sugestao);
          ligarSugestao();
        } catch (err) {
          if (atual()) box.innerHTML = `<p class="form-msg erro">${esc(err.message)}</p>`;
        }
        finally { b.disabled = false; }
      });
      const ligarSugestao = () => {
        if (c.sugestao) pintarBolha($('#campIASug [data-sug-bolha]'), renderTemplate(c.sugestao.mensagem, { nome: c.sugestao.previa?.amostra?.[0]?.nome || EXEMPLO.nome, carro: c.sugestao.previa?.amostra?.[0]?.carro || EXEMPLO.carro }));
        $('#usarSug')?.addEventListener('click', () => {
          c.filtro = c.sugestao.segmento; c.segSalvoId = null; c.valor = c.sugestao.valor ?? ''; c.corpo = c.sugestao.mensagem || c.corpo; c.sugestao.usada = true;
          toast('Sugestão aplicada: segmento escolhido e mensagem pronta no passo 2.'); passo1();
        });
      };
      ligarSugestao();
      $('#campSeg').addEventListener('change', e => { c.filtro = e.target.value; c.valor = ''; c.segSalvoId = null; passo1(); });
      $$('[data-seg-usar]', body).forEach(b => b.addEventListener('click', async (ev) => {
        const ap = ev.target.closest('[data-seg-apagar]');
        if (ap) { ev.stopPropagation(); if (await window.R5.apagarSegmento(ap.dataset.segApagar)) { const i = salvos.findIndex(x => x.id === ap.dataset.segApagar); if (i >= 0) salvos.splice(i, 1); passo1(); } return; }
        const s = salvos.find(x => x.id === b.dataset.segUsar); if (!s) return;
        c.filtro = s.filtro; c.valor = s.valor ?? ''; c.segSalvoId = s.id; passo1();
      }));
      $('#campValor')?.addEventListener('input', e => { c.valor = e.target.value; c.segSalvoId = null; atualizarSegPrevia(); });
      atualizarSegPrevia();
    } else {
      $('#trocarCli')?.addEventListener('click', () => { c.cliente = null; passo1(); });
      const inp = $('#campBusca');
      const sug = $('#campSug', body);
      let consultaCliente = 0;
      const buscar = debounce(async (q, consulta) => {
        const atual = () => campanhaAberta() && inp.isConnected && consulta === consultaCliente;
        if (!atual()) return;
        let r;
        try {
          r = await api('GET', `/clientes?q=${encodeURIComponent(q)}`);
        } catch {
          if (atual()) {
            sug.textContent = 'Não consegui buscar clientes. Altere a busca para tentar novamente.';
            sug.hidden = false;
          }
          return;
        }
        if (!atual()) return;
        const comTel = r.filter(x => x.telefone).slice(0, 8);
        sug.innerHTML = comTel.length ? comTel.map(x => `<button type="button" class="sugestao" data-id="${esc(x.id)}"><b>${esc(x.nome)}${x.aceita_mensagens === false ? ' 🚫' : ''}</b><small>${esc(telBR(x.telefone))}${x.carro ? ` · ${esc(x.carro)}` : ''}</small></button>`).join('')
          : '<div class="dica" style="padding:8px">Ninguém com esse nome (e telefone).</div>';
        sug.hidden = false;
        $$('.sugestao', sug).forEach(b => b.addEventListener('click', () => {
          const x = comTel.find(y => y.id === b.dataset.id);
          if (x?.aceita_mensagens === false) return toast('Esse cliente pediu para não receber mensagens.', 'err');
          c.cliente = x; passo1();
        }));
      }, 250);
      inp?.addEventListener('input', () => {
        sug.hidden = true;
        const consulta = ++consultaCliente;
        const q = inp.value.trim();
        if (q.length >= 2) buscar(q, consulta);
      });
      inp?.focus();
    }
  };

  const passo2 = () => {
    const cats = [...new Set(modelos.map(m => m.categoria || 'geral'))];
    body.innerHTML = `
      <div class="field"><label for="campModelo">Começar de um modelo (opcional)</label>
        <select id="campModelo"><option value="">— escrever do zero —</option>
          ${cats.map(cat => `<optgroup label="${esc(cat)}">${modelos.filter(m => (m.categoria || 'geral') === cat).map(m => `<option value="${esc(m.id)}">${esc(m.titulo)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label for="campCorpo">Mensagem</label>
        <textarea id="campCorpo" maxlength="2000" style="min-height:120px" placeholder="Oi {primeiro_nome}! …">${esc(c.corpo)}</textarea>
        <div class="var-chips">${['nome', 'primeiro_nome', 'carro', 'placa', 'detalhe', 'link_area'].map(v => `<button type="button" class="var-chip" data-var="${v}"${v === 'link_area' ? ' title="Link da Área do Cliente — cada cliente recebe um só dele"' : ''}>{${v}}</button>`).join('')}
          <button type="button" class="var-chip ia-chip" id="campIAEscrever">✨ Escrever com IA</button>
          <button type="button" class="var-chip teste-chip" id="campTesteMeu" title="Recebe este texto no SEU celular (o do seu perfil), fora da fila">📲 Mandar para o meu celular</button></div>
        <div class="ia-box" id="campIABox" hidden></div>
        <div class="contador" id="campCont">0 / 2000</div>
        <div class="dica" id="campAreaDica" hidden>🔑 Com <b>{link_area}</b> cada cliente recebe um link só dele para a Área do Cliente (até 300 por vez; quem não tem cadastro fica de fora).</div></div>
      <div class="previa"><small>Prévia · como ${esc(clienteDaPrevia()?.nome?.split(' ')[0] || EXEMPLO.nome.split(' ')[0])} vê no celular</small>${celularWA('<div class="bolha wa-rec" id="campBolha"></div>')}</div>`;
    const ta = $('#campCorpo'), bolha = $('#campBolha'), cont = $('#campCont');
    const pintar = () => {
      c.corpo = ta.value;
      window.R4?.guardarRascunho('campanha', c.corpo);
      const cli = clienteDaPrevia() || EXEMPLO;
      const txt = renderTemplate(c.corpo, { nome: cli.nome, carro: cli.carro, placa: cli.placa, detalhe:'…', link_area:`${PATIO_URL}/minha/?c=…`, link_os:`${PATIO_URL}/acompanhar/?t=…` });
      const dicaArea = $('#campAreaDica'); if (dicaArea) dicaArea.hidden = !c.corpo.includes('{link_area}');
      pintarBolha(bolha, txt, horaBR(new Date()), 'Escreva para ver a prévia.');
      cont.textContent = `${c.corpo.length} / 2000`; cont.classList.toggle('alto', c.corpo.length > 700);
    };
    ta.addEventListener('input', pintar); pintar();
    $('#campIAEscrever').addEventListener('click', () => painelEscreverIA($('#campIABox'), { regua:'campanha', lerTexto: () => ta.value,
      aplicar: (t) => { ta.value = t; pintar(); ta.focus(); },
      exemplo: () => { const x = clienteDaPrevia(); return x ? { nome: x.nome, carro: x.carro, placa: x.placa } : null; } }));
    $('#campModelo').addEventListener('change', e => { const m = modelos.find(x => x.id === e.target.value); if (m) { ta.value = m.corpo; pintar(); ta.focus(); } });
    $('#campTesteMeu').addEventListener('click', (e) => window.R5?.testeMeu(ta.value, e.currentTarget));
    $$('[data-var]', body).forEach(ch => ch.addEventListener('click', () => {
      const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini, tok = `{${ch.dataset.var}}`;
      if (ta.value.length - (fim - ini) + tok.length > ta.maxLength) {
        toast('A mensagem chegou ao limite de 2.000 caracteres.', 'err');
        return;
      }
      ta.setRangeText(tok, ini, fim, 'end');
      ta.focus();
      pintar();
    }));
    ta.focus();
  };

  const passo3 = () => {
    const quantos = c.alvo === 'cliente' ? 1 : (c.previa?.total ?? 0);
    body.innerHTML = `
      <div class="quando-op">
        <button type="button" class="alvo-op ${c.quando === 'agora' ? 'ativo' : ''}" data-quando="agora"><b>${svg(I.send)} Agora</b><small>entra na fila e sai dentro da janela de envio</small></button>
        <button type="button" class="alvo-op ${c.quando === 'data' ? 'ativo' : ''}" data-quando="data"><b>${svg(I.calendar)} Em uma data</b><small>escolher dia e hora</small></button>
      </div>
      <div class="field" id="campQuandoBox" ${c.quando === 'data' ? '' : 'hidden'}><label for="campData">Dia e hora</label><input id="campData" type="datetime-local" value="${esc(c.enviar_em)}"></div>
      <div class="resumo-env">
        <div><span>Para quem</span><b>${esc(alvoResumo())}</b></div>
        <div><span>Mensagem</span><b>${c.corpo.length} caracteres</b></div>
        <div><span>Quando</span><b id="campQuandoTxt">${c.quando === 'agora' ? 'agora, dentro da janela' : (c.enviar_em ? esc(dataHoraBR(c.enviar_em)) : 'escolha a data')}</b></div>
        ${quantos > 1 ? `<div class="dica">${quantos} mensagens de relacionamento: quem já recebeu outra há poucos dias pode ser pulado pelo intervalo mínimo.${state.saudeWA?.cadencia?.porDia && quantos > state.saudeWA.cadencia.porDia ? ` Passa do limite de <b>${state.saudeWA.cadencia.porDia} por dia</b>: o que não cabe hoje sai nos dias seguintes, na hora de envio.` : ''}</div>` : ''}
        ${precisaAprovar() ? `<div class="dica aprovacao">${svg(I.check)}<span>Campanha para um grupo passa pelo gestor: ela fica <b>aguardando aprovação</b> e só entra na fila quando ele aprovar. O gestor recebe o aviso no sino.</span></div>` : ''}
      </div>`;
    window.R6?.pintarPasso3(c, { segmentos, corpoEl: body });
    window.R7?.pintarPasso3(c, { corpoEl: body });
    $$('[data-quando]', body).forEach(b => b.addEventListener('click', () => { c.quando = b.dataset.quando; passo3(); }));
    $('#campData').addEventListener('change', e => { c.enviar_em = e.target.value; $('#campQuandoTxt').textContent = c.enviar_em ? dataHoraBR(c.enviar_em) : 'escolha a data'; });
  };

  const ir = (n) => {
    c.passo = n;
    $$('.passo', modal).forEach(p => {
      const k = Number(p.dataset.passo);
      p.classList.toggle('ativo', k === n);
      p.classList.toggle('feito', k < n);
      if (k === n) p.setAttribute('aria-current', 'step');
      else p.removeAttribute('aria-current');
    });
    $('#campVoltar').hidden = n === 1;
    $('#campAvancar').innerHTML = n === 3 ? (precisaAprovar() ? `${svg(I.check)} Pedir aprovação` : `${svg(I.send)} Colocar na fila`) : `Avançar ${svg(I.seta)}`;
    [passo1, passo2, passo3][n - 1]();
  };
  $('#campVoltar').addEventListener('click', () => ir(c.passo - 1));
  $('#campAvancar').addEventListener('click', async () => {
    if (c.passo === 1) {
      if (c.alvo === 'cliente' && !c.cliente) return toast('Escolha o cliente.', 'err');
      if (c.alvo === 'segmento' && !c.previa) return toast('Espere a prévia do segmento carregar.', 'err');
      if (c.alvo === 'segmento' && c.previa.total === 0) return toast('Ninguém nesse segmento — mude o filtro.', 'err');
      return ir(2);
    }
    if (c.passo === 2) {
      if (!c.corpo.trim()) return toast('Escreva a mensagem.', 'err');
      return ir(3);
    }
    let enviar_em = null;
    if (c.quando === 'data') {
      if (!c.enviar_em) return toast('Escolha o dia e a hora.', 'err');
      const horario = new Date(c.enviar_em);
      if (!Number.isFinite(horario.getTime()) || horario <= new Date()) return toast('Escolha uma data e hora futuras.', 'err');
      enviar_em = horario.toISOString();
    }
    const bloqueio = window.R6?.bloqueioDeEnvio(c); if (bloqueio) return toast(bloqueio, 'err', 6500);
    const quantos = c.alvo === 'cliente' ? 1 : c.previa.total;
    if (quantos > 1 && !confirm(precisaAprovar() ? `Mandar esta campanha (${quantos} clientes) para o gestor aprovar?` : `Colocar ${quantos} mensagens na fila?`)) return;
    const btn = $('#campAvancar'); btn.disabled = true;
    try {
      const corpo = c.corpo.trim();
      const payload = c.alvo === 'cliente'
        ? { tipo:'avulsa', corpo, enviar_em, destinos:[{ cliente_id:c.cliente.id, telefone:c.cliente.telefone, nome:c.cliente.nome, carro:c.cliente.carro, placa:c.cliente.placa }] }
        : { corpo, enviar_em, segmento:{ filtro:c.filtro, valor: c.valor || segmentos.find(s => s.id === c.filtro)?.valor }, segmento_salvo_id: c.segSalvoId || undefined };
      const r = await api('POST', '/envios', window.R7 ? window.R7.completarPedido(c, window.R6 ? window.R6.completarPedido(c, payload) : payload) : (window.R6 ? window.R6.completarPedido(c, payload) : payload));
      if (campanhaAberta()) window.R4?.guardarRascunho('campanha', '');
      if (r.aguardando) {
        toast('Campanha mandada para aprovação — o gestor foi avisado no sino.', 'ok', 5500);
        if (campanhaAberta()) { closeModal(); state.route === 'campanhas' ? route(null, { quieto:true }) : route('campanhas'); }
        return;
      }
      toast(`${plural(r.enfileirados, 'mensagem', 'mensagens')} na fila${r.pulados ? ` · ${r.pulados} pulada(s) (pediu para parar ou recebeu outra há pouco)` : ''}${r.dias > 1 ? ` · escalonadas em ${r.dias} dias (limite de ${r.limitePorDia}/dia)` : ''}.`, 'ok', 6000);
      if (campanhaAberta()) closeModal();
     
      if (state.route === 'campanhas' || state.route === 'mensagens') route(null, { quieto:true });
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  });
  ir(1);
};

// ============================================================================
// CLIENTES — busca, aniversário, opt-out, ficha e importação
// ============================================================================
async function renderClientes({ vez = state._vez } = {}) {
  const lista = await api('GET', '/clientes' + (state.cliQ ? `?q=${encodeURIComponent(state.cliQ)}` : ''));
  if (vez !== state._vez) return;
  if (!state.cliFiltro) state.cliFiltro = 'todos';
  const contagem = (clientes) => `<span class="badge-pill bp-gray">${clientes.length}${state.cliQ ? ' encontrados' : ''}</span>`;
  /* R16: pílulas para limpar a base; filtram a lista já carregada (a busca continua no servidor) */
  const pilulasCli = (clientes) => {
    const n = window.R16.contarClientes(clientes);
    if (!n.fora && !n.sem_telefone && !n.sem_aniversario) { state.cliFiltro = 'todos'; return ''; }
    return window.R16.FILTROS_CLIENTES.map(f => `<button type="button" class="pilula${state.cliFiltro === f.id ? ' ativa' : ''}" data-cli-filtro="${f.id}" aria-pressed="${state.cliFiltro === f.id}">${f.rotulo}${f.id === 'todos' ? '' : ` · ${n[f.id]}`}</button>`).join('');
  };
  const mostrados = (clientes) => window.R16.filtrarClientes(clientes, state.cliFiltro);
  view.innerHTML = `
    <div class="toolbar">
      <div class="left"><h2>Clientes</h2>
        <span id="cliContagem" role="status">${contagem(lista)}</span></div>
      <div class="right">
        <div class="search">${svg(I.search)}<input id="qCli" placeholder="Nome, telefone ou placa…" value="${esc(state.cliQ)}" aria-label="Buscar clientes"></div>
        <button type="button" class="btn" id="btnAniv">${svg(I.gift)} Aniversários</button>
        ${pode('importar') ? `<button type="button" class="btn" id="btnImportar">${svg(I.upload)} Importar planilha</button>` : ''}
      </div>
    </div>
    <div class="pilulas" id="cliPilulas" role="group" aria-label="Filtrar clientes">${pilulasCli(lista)}</div>
    <div class="panel"><div class="panel-body lista lista-anim" id="cliLista">${linhasClientes(mostrados(lista), state.cliFiltro)}</div></div>`;
  let atualLista = lista;
  const pintarCli = () => {
    $('#cliPilulas').innerHTML = pilulasCli(atualLista);
    const m = mostrados(atualLista);
    $('#cliLista').innerHTML = linhasClientes(m, state.cliFiltro);
    ligarClientes($('#cliLista'), m);
  };
  $('#cliPilulas').onclick = (e) => { const b = e.target.closest('[data-cli-filtro]'); if (!b) return; state.cliFiltro = b.dataset.cliFiltro; pintarCli(); };
  ligarClientes($('#cliLista'), mostrados(lista));
  const inp = $('#qCli');
  let busca = 0;
  inp.addEventListener('input', debounce(async () => {
    if (!inp.isConnected) return;
    state.cliQ = inp.value.trim();
    const termo = state.cliQ;
    const pesquisa = ++busca;
    const atual = () => inp.isConnected && pesquisa === busca && inp.value.trim() === termo;
    const resultados = $('#cliLista');
    resultados.setAttribute('aria-busy', 'true');
    try {
      const r = await api('GET', '/clientes' + (termo ? `?q=${encodeURIComponent(termo)}` : ''));
      if (!atual()) return;
      atualLista = r;
      $('#cliContagem').innerHTML = contagem(r);
      pintarCli();
    } catch {
      if (atual()) {
        $('#cliContagem').textContent = '';
        resultados.innerHTML = '<p class="form-msg erro" role="alert">Não deu para buscar os clientes.</p><button class="btn" type="button">Tentar de novo</button>';
        $('button', resultados).onclick = () => { inp.focus(); inp.dispatchEvent(new Event('input')); };
      }
    } finally {
      if (pesquisa === busca) resultados.removeAttribute('aria-busy');
    }
  }, 250));
  $('#btnImportar')?.addEventListener('click', () => openImportarModal());
  $('#btnAniv').addEventListener('click', () => window.R4?.abrirAniversarios());
  if (state.cliQ) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
/* Quem saiu da lista só volta pela mão do gestor (o servidor também barra). */
const travaReligar = (c) => (c.aceita_mensagens === false && !pode('optout_religar') ? 'disabled title="Só gestor volta a mandar para quem saiu da lista"' : '');
function linhasClientes(lista, filtro = 'todos') {
  if (!lista.length && filtro !== 'todos') return vazio(I.user, 'Ninguém neste filtro', 'Toque em Todos para ver a lista inteira.');
  if (!lista.length) return vazio(I.user, state.cliQ ? 'Nenhum cliente encontrado' : 'Nenhum cliente', state.cliQ ? 'Confira o nome, telefone ou placa e tente de novo.' : 'A base é a mesma do CRM, da Agenda e do Atendimento.');
  return lista.map(c => `<div class="cli${c.aceita_mensagens === false ? ' fora' : ''}" data-id="${esc(c.id)}">
    <button type="button" class="cli-nome" data-ficha="${esc(c.id)}" title="Abrir ficha"><span class="av">${esc(iniciais(c.nome) || 'IC')}</span><b>${esc(c.nome)}</b>${c.aceita_mensagens === false ? '<span class="selo" title="Pediu para não receber mensagens">fora da lista</span>' : ''}</button>
    <span class="cli-meta"><span class="col tel">${svg(I.phone)} ${window.R16.semTelefone(c) ? '<span class="selo" title="Sem telefone não dá para mandar mensagem">sem telefone</span>' : esc(telBR(c.telefone))}</span>
    <span class="col carro">${svg(I.car)} ${esc(c.carro || '—')}${c.placa ? ` <b>${esc(c.placa)}</b>` : ''}</span>
    <span class="nasc"><span class="nasc-txt">${c.nascimento ? `🎂 <b>${esc(nascBR(c.nascimento))}</b>` : '<span class="muted">sem aniversário</span>'}</span>
      <button type="button" class="icon-btn" data-nasc="${esc(c.id)}" aria-label="Editar aniversário de ${esc(c.nome)}" title="Editar aniversário">${svg(I.edit)}</button></span></span>
    <span class="acoes"><label class="sw" title="Recebe mensagens automáticas e campanhas"><input type="checkbox" data-aceita="${esc(c.id)}" ${c.aceita_mensagens === false ? '' : 'checked'} ${travaReligar(c)} aria-label="Aceita mensagens: ${esc(c.nome)}"><span class="tr"></span><span class="sw-txt">Mensagens</span></label></span>
  </div>`).join('');
}
function ligarClientes(root, lista) {
  if (!root) return;
  root.onclick = (e) => {
    const f = e.target.closest('[data-ficha]'); if (f) return abrirFicha(f.dataset.ficha);
    const n = e.target.closest('[data-nasc]'); if (n) return openNascimentoModal(lista.find(c => c.id === n.dataset.nasc));
  };
  root.onchange = (e) => {
    const sw = e.target.closest('[data-aceita]'); if (!sw) return;
    const c = lista.find(x => x.id === sw.dataset.aceita); if (!c) return;
    mudarAceite(c, sw.checked, sw);
  };
}
async function mudarAceite(c, aceita, sw) {
  if (aceita) {
    if (sw) sw.disabled = true;
    try { const r = await api('PUT', `/clientes/${c.id}`, { aceita_mensagens:true }); Object.assign(c, r); toast(`${c.nome} volta a receber mensagens.`); sw?.closest('.cli')?.classList.remove('fora'); sw?.closest('.cli')?.querySelector('.selo')?.remove(); }
    catch (e) { toast(e.message, 'err'); if (sw) sw.checked = false; }
    finally { if (sw) sw.disabled = false; }
    abrirFicha(c.id, true);
    return;
  }
  openModal(`<div class="modal-head"><h3>${svg(I.x)} Parar de mandar para ${esc(c.nome)}</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
    <div class="modal-body"><p class="dica">Ele sai de todas as réguas e campanhas até você ligar de novo. O que já estiver na fila continua — cancele em Mensagens se precisar.</p>
      <div class="field"><label for="opt_motivo">Motivo (opcional)</label><input id="opt_motivo" maxlength="120" placeholder="Ex.: pediu no balcão"></div></div>
    <div class="modal-foot"><button type="button" class="btn" data-fechar>Voltar</button><button type="button" class="btn primary" id="opt_ok">Confirmar</button></div>`);
  let feito = false;
  $('#opt_ok').addEventListener('click', async ({ currentTarget: btn }) => {
    btn.disabled = true;
    try {
      const r = await api('PUT', `/clientes/${c.id}`, { aceita_mensagens:false, motivo: $('#opt_motivo').value.trim() || undefined });
      Object.assign(c, r); feito = true;
      if (btn.isConnected) closeModal();
      abrirFicha(c.id, true);
      toast(`${c.nome} não recebe mais mensagens.`);
      if (state.route === 'clientes') route(null, { quieto:true });
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; if (feito && sw) sw.checked = false; }
  });
  const volta = () => { if (!feito && sw) sw.checked = true; overlay.removeEventListener('fechou', volta); };
  overlay.addEventListener('fechou', volta);
}

window.openNascimentoModal = function (c) {
  if (!c) return;
  openModal(`<div class="modal-head"><h3>${svg(I.gift)} Aniversário de ${esc(c.nome)}</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
    <div class="modal-body"><div class="field"><label for="n_data">Data de nascimento</label>
      <input id="n_data" inputmode="numeric" placeholder="DD/MM/AAAA (ou só DD/MM)" value="${c.nascimento ? esc(nascBR(c.nascimento)) : ''}">
      <small>Pode ser só dia e mês — para os parabéns o ano não importa.</small></div></div>
    <div class="modal-foot"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="n_salvar">${svg(I.check)} Salvar</button></div>`);
  $('#n_salvar').addEventListener('click', async ({ currentTarget: btn }) => {
    const campo = $('#n_data');
    const v = campo.value.trim();
    if (v && !/^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(v)) {
      campo.focus();
      return toast('Use DD/MM/AAAA ou DD/MM.', 'err');
    }
    btn.disabled = true;
    try {
      const r = await api('PUT', `/clientes/${c.id}`, { nascimento: v });
      Object.assign(c, r); toast(v ? 'Aniversário salvo 🎂' : 'Aniversário removido.');
      if (btn.isConnected) closeModal();
      if (state.route === 'clientes') route(null, { quieto:true });
      if (!$('#gavetaOverlay').hidden) abrirFicha(c.id, true);
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; }
  });
};

/* ---- FICHA do cliente (gaveta lateral) ---- */
let consultaFicha = 0;
let clienteDaFicha = null;

async function abrirFicha(id, quieto = false) {
  const ov = $('#gavetaOverlay'), g = $('#gaveta');
  if (quieto && (ov.hidden || id !== clienteDaFicha)) return;
  const consulta = ++consultaFicha;
  clienteDaFicha = id;
  if (!quieto) {
    if (ov.hidden) state._focoGaveta = document.activeElement;
    g.innerHTML = `<div class="gaveta-head"><div class="quem"><span class="av skel" style="border:none"></span><div><h3 id="gavetaTitulo">Carregando…</h3></div></div>
      <button type="button" class="modal-close" data-fechar-gaveta aria-label="Fechar ficha">×</button></div>
      <div class="gaveta-body"><div class="skel" style="height:80px"></div><div class="skel" style="height:120px"></div><div class="skel" style="height:160px"></div></div>`;
    ov.hidden = false; document.body.style.overflow = 'hidden';
    $('[data-fechar-gaveta]', g).focus({ preventScroll:true });
  }
  let f;
  try { f = await api('GET', `/clientes/${id}/ficha`); }
  catch {
    if (consulta !== consultaFicha) return;
    if (quieto) {
      toast('Não consegui atualizar a ficha. Abra novamente para tentar.', 'err');
    } else {
      $('.gaveta-body', g).innerHTML = '<p class="form-msg erro" role="alert">Não consegui abrir a ficha.</p><button type="button" class="btn" data-repetir-ficha>Tentar novamente</button>';
      $('[data-repetir-ficha]', g).addEventListener('click', () => abrirFicha(id));
    }
    return;
  }
  if (consulta !== consultaFicha) return;
  const focoAtual = g.contains(document.activeElement) ? document.activeElement : null;
  const c = f.cliente, r = f.resumo || {};
  const hoje = hojeSP();
  const rev = f.proximaRevisao;
  const atrasada = rev && rev.data < hoje;

  g.innerHTML = `
    <div class="gaveta-head">
      <div class="quem"><span class="av">${esc(iniciais(c.nome) || 'IC')}</span>
        <div><h3 id="gavetaTitulo">${esc(c.nome)}</h3>
          <p><span>${esc(telBR(c.telefone))}</span>${c.carro ? `<span>· ${esc(c.carro)}${c.placa ? ` ${esc(c.placa)}` : ''}</span>` : ''}
             ${c.nascimento ? `<span>· 🎂 ${esc(nascBR(c.nascimento))}</span>` : ''}</p>
          <div class="eco-links">${c.telefone ? `<a href="${esc(linkConversa(c.telefone))}">${svg(I.wa)} Conversa</a>` : ''}
            <a href="${esc(linkCliente('crm', c))}">${svg(I.flag)} CRM</a>
            <a href="${esc(linkCliente('agenda', c))}">${svg(I.calendar)} Agenda</a></div></div></div>
      <button type="button" class="modal-close" data-fechar-gaveta aria-label="Fechar ficha">×</button>
    </div>
    <div class="gaveta-body">
      ${c.aceita_mensagens === false ? `<p class="form-msg erro">🚫 Não quer mensagens${c.aceita_mensagens_motivo ? ` — ${esc(c.aceita_mensagens_motivo)}` : ''}${c.aceita_mensagens_em ? ` (${esc(dataBR(c.aceita_mensagens_em))})` : ''}.</p>` : ''}
      ${rev ? `<div class="revisao${atrasada ? ' atrasada' : ''}"><span class="data">${esc(dataCurta(rev.data))}</span>
          <div class="t"><small>${atrasada ? 'revisão vencida' : 'próxima revisão'}</small><b>${esc(rev.servico || 'serviço')} · ${rev.meses} meses</b><span>regra: ${esc(rev.regra)} · feito em ${esc(dataBR(f.ultimoServico?.data))}</span></div></div>`
        : `<div class="revisao" style="border-color:var(--border)"><span class="data" style="color:var(--muted-2)">—</span><div class="t"><small>próxima revisão</small><b>Sem serviço concluído ainda</b><span>a revisão é calculada a partir do último serviço</span></div></div>`}
      ${window.R6 ? window.R6.htmlProgramadas(f.programadas) : ''}
      <div class="g-sec"><h4>Mensagens <small>${plural(f.envios?.length || 0, 'recente', 'recentes')}</small></h4>
        ${f.envios?.length ? f.envios.map(e => `<div class="mini-envio"><div class="m-top"><span>${TIPO[e.tipo]?.emoji || '✉️'} ${esc(TIPO[e.tipo]?.rotulo || e.tipo)} · ${esc(dataHoraBR(e.enviado_em || e.enviar_em))}</span>${pillStatus(e.status)}${e.agendou_depois_id ? `<span class="selo-agendou">${svg(I.calendar)} agendou depois</span>` : ''}</div>
            <div class="m-corpo">${esc(e.corpo)}</div>
            ${e.resposta ? `<div class="resposta ${esc(e.resposta_tipo || 'neutra')}"><span class="r-ico">💬</span><span class="r-txt">${esc(e.resposta)}</span></div>` : ''}</div>`).join('')
          : '<div class="dica">Nenhuma mensagem para este cliente ainda.</div>'}
      </div>
    </div>
    <div class="gaveta-foot">
      <label class="sw" style="margin-right:auto"><input type="checkbox" id="gAceita" ${c.aceita_mensagens === false ? '' : 'checked'} ${travaReligar(c)}><span class="tr"></span><span class="sw-txt">Aceita mensagens</span></label>
      <button type="button" class="btn" id="gNasc">${svg(I.gift)} Aniversário</button>
      <button type="button" class="btn primary" id="gMandar" ${c.aceita_mensagens === false || !c.telefone ? 'disabled' : ''}>${svg(I.send)} Mandar mensagem</button>
    </div>`;
  $('#gAceita').addEventListener('change', e => mudarAceite(c, e.target.checked, e.target));
  $('#gNasc').addEventListener('click', () => openNascimentoModal(c));
  $('#gMandar').addEventListener('click', () => { fecharGaveta(); openCampanhaModal({ cliente:c }); });
  const novoFoco = focoAtual?.id && document.getElementById(focoAtual.id);
  if (focoAtual) (novoFoco && !novoFoco.disabled ? novoFoco : $('[data-fechar-gaveta]', g))?.focus({ preventScroll:true });
}
function fecharGaveta() {
  const ov = $('#gavetaOverlay'); if (ov.hidden) return;
  consultaFicha++;
  clienteDaFicha = null;
  ov.hidden = true; document.body.style.overflow = '';
  if (state._focoGaveta?.isConnected) state._focoGaveta.focus({ preventScroll:true });
  state._focoGaveta = null;
}
$('#gavetaOverlay').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-fechar-gaveta]')) fecharGaveta(); });
const gavetaAberta = () => !$('#gavetaOverlay').hidden;

/* ---- importar planilha (CSV ou colar do Excel) ---- */
window.openImportarModal = function () {
  openModal(`<div class="modal-head"><h3>${svg(I.upload)} Importar clientes de planilha</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <p class="dica">Colunas: <b>nome · telefone · nascimento</b> (e, se quiser, carro · placa · e-mail). Copie as linhas do Excel e cole aqui, ou escolha um CSV. Quem já existe (mesmo telefone) só ganha o que estava em branco.</p>
      <div class="field"><label for="imp_arquivo">Arquivo CSV (opcional)</label><input id="imp_arquivo" type="file" accept=".csv,text/csv,text/plain"></div>
      <div class="field"><label for="imp_texto">Ou cole as linhas aqui</label>
        <textarea id="imp_texto" style="min-height:120px" placeholder="nome	telefone	nascimento
Maria Souza	12 99999-0001	14/05/1988
João Lima	12 99999-0002	02/11"></textarea></div>
      <div id="imp_previa"></div>
    </div>
    <div class="modal-foot"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="imp_importar" disabled>${svg(I.check)} Importar</button></div>`);
  let linhas = [];
  const atualizar = () => {
    linhas = lerPlanilha($('#imp_texto').value);
    const box = $('#imp_previa');
    if (!linhas.length) { box.innerHTML = ''; $('#imp_importar').disabled = true; return; }
    box.innerHTML = `<div class="form-msg ok">Entendi <b>${linhas.length}</b> linha(s). Prévia:</div>
      <div class="tabela-rolagem"><table class="table"><thead><tr><th>Nome</th><th>Telefone</th><th>Nascimento</th><th>Carro</th></tr></thead>
      <tbody>${linhas.slice(0, 5).map(l => `<tr><td>${esc(l.nome)}</td><td>${esc(l.telefone)}</td><td>${esc(l.nascimento || '—')}</td><td>${esc(l.veiculo || '—')}</td></tr>`).join('')}</tbody></table></div>
      ${linhas.length > 5 ? `<small class="dica">…e mais ${linhas.length - 5}.</small>` : ''}`;
    $('#imp_importar').disabled = false;
  };
  $('#imp_texto').addEventListener('input', debounce(atualizar, 300));
  $('#imp_arquivo').addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (!f) return; $('#imp_texto').value = await f.text(); atualizar(); });
  $('#imp_importar').addEventListener('click', async () => {
    if (!linhas.length) return;
    const btn = $('#imp_importar'); btn.disabled = true; btn.textContent = 'Importando…';
    try {
      const r = await api('POST', '/clientes/importar', { linhas });
      const partes = [`${r.criados} novo(s)`, `${r.atualizados} atualizado(s)`]; if (r.ignorados) partes.push(`${r.ignorados} pulado(s)`);
      toast(`Importação: ${partes.join(', ')}`);
      if (r.avisos?.length) {
        $('#imp_previa').innerHTML = `<div class="form-msg erro">Avisos:<br>${r.avisos.slice(0, 8).map(esc).join('<br>')}</div>`;
        btn.textContent = 'Importar'; btn.disabled = false;
      } else closeModal();
      if (state.route === 'clientes') route(null, { quieto:true });
    } catch (e) { toast(e.message, 'err'); btn.textContent = 'Importar'; btn.disabled = false; }
  });
};

/** Lê o texto colado do Excel (tab), CSV com ; ou , — e detecta cabeçalho. */
function lerPlanilha(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return [];
  const sep = linhas[0].includes('\t') ? '\t' : (linhas[0].includes(';') ? ';' : ',');
  const dividir = (l) => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim());
  const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const primeira = dividir(linhas[0]).map(semAcento);
  const APELIDOS = {
    nome:['nome', 'cliente', 'name'], telefone:['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'phone', 'numero'],
    nascimento:['nascimento', 'aniversario', 'data de nascimento', 'nasc', 'birthday'], veiculo:['veiculo', 'carro', 'modelo', 'vehicle'],
    placa:['placa', 'plate'], email:['email', 'e-mail', 'mail'],
  };
  const colunaDe = (rotulo) => { for (const [campo, nomes] of Object.entries(APELIDOS)) if (nomes.includes(rotulo)) return campo; return null; };
  const mapa = primeira.map(colunaDe);
  const temCabecalho = mapa.filter(Boolean).length >= 2;
  const ordemPadrao = ['nome', 'telefone', 'nascimento', 'veiculo', 'placa', 'email'];
  const dados = [];
  for (const linha of (temCabecalho ? linhas.slice(1) : linhas)) {
    const obj = {};
    dividir(linha).forEach((c, i) => { const campo = temCabecalho ? mapa[i] : ordemPadrao[i]; if (campo && c) obj[campo] = c; });
    if (obj.nome || obj.telefone) dados.push(obj);
  }
  return dados;
}

// ============================================================================
// MODAL — foco preso, Esc fecha, devolve o foco a quem abriu
// ============================================================================
const overlay = $('#modalOverlay'), modal = $('#modal');
const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let _focoAntes = null;
function openModal(html, opts = {}) {
  if (!modalAberto()) _focoAntes = document.activeElement;
  modal.className = 'modal' + (opts.larga ? ' larga' : '') + (opts.classe ? ` ${opts.classe}` : '');
  modal.innerHTML = html;
  overlay.classList.add('open');
  const titulo = $('.modal-head h3', modal);
  if (titulo) { titulo.id = 'modalTitulo'; modal.setAttribute('aria-labelledby', 'modalTitulo'); }
  else modal.removeAttribute('aria-labelledby');
  const primeiro = $$(FOCAVEIS, $('.modal-body', modal) || modal).find(el => el.offsetParent !== null) || $('.modal-close', modal);
  primeiro?.focus({ preventScroll:true });
}
function closeModal() {
  if (!overlay.classList.contains('open')) return;
  const focoAntes = _focoAntes;
  _focoAntes = null;
  overlay.classList.remove('open');
  overlay.dispatchEvent(new Event('fechou'));
  if (!modalAberto() && focoAntes?.isConnected) focoAntes.focus({ preventScroll:true });
}
const modalAberto = () => overlay.classList.contains('open');
overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.modal-close,[data-fechar]')) closeModal(); });
// Tab preso dentro do que estiver aberto (modal ou gaveta)
function prenderTab(e, raiz) {
  const itens = $$(FOCAVEIS, raiz).filter(el => el.offsetParent !== null);
  if (!itens.length) return;
  const i = itens.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); itens[itens.length - 1].focus(); }
  else if (!e.shiftKey && (i === -1 || i === itens.length - 1)) { e.preventDefault(); itens[0].focus(); }
}
overlay.addEventListener('keydown', e => { if (e.key === 'Tab' && modalAberto()) prenderTab(e, modal); });
$('#gavetaOverlay').addEventListener('keydown', e => { if (e.key === 'Tab' && gavetaAberta()) prenderTab(e, $('#gaveta')); });

// ============================================================================
// ROTAS + TECLADO + PWA
// ============================================================================
const ROUTES = { reguas:renderReguas, mensagens:renderMensagens, campanhas:renderCampanhas, clientes:renderClientes, ajustes:renderAjustes };

$('#nav').addEventListener('click', e => { const item = e.target.closest('.nav-item'); if (item) route(item.dataset.route); });
$('#nav').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const item = e.target.closest('.nav-item'); if (!item) return;
  e.preventDefault(); route(item.dataset.route);
});

const digitando = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (window.Conta?.fecharPops()) return;
    if (modalAberto()) return closeModal();
    if (gavetaAberta()) return fecharGaveta();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || modalAberto() || gavetaAberta() || document.body.classList.contains('deslogado')) return;
  if (digitando(e.target)) return;
  if (e.key === '/') { const busca = $('.view .search input'); if (busca) { e.preventDefault(); busca.focus(); busca.select(); } }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

/* sem internet: faixa enquanto estiver offline */
function marcarRede() { const f = $('#faixaOffline'); if (f) f.hidden = navigator.onLine !== false; }
window.addEventListener('offline', marcarRede);
window.addEventListener('online', () => { marcarRede(); toast('Conexão de volta.'); });
marcarRede();

/* ============================ LOGIN ============================
   As telas de entrar, senha nova, duas etapas e "sem acesso" moram em conta.js. */
function mostrarLogin(mensagem) {
  if (window.Conta) { window.Conta.painel('formLogin'); window.Conta.aviso('erroLogin', mensagem || ''); return; }
  document.body.classList.add('deslogado');
  $('#telaLogin').hidden = false;
  const erro = $('#erroLogin');
  if (mensagem) { erro.textContent = mensagem; erro.hidden = false; } else erro.hidden = true;
}
function esconderLogin() { document.body.classList.remove('deslogado'); $('#telaLogin').hidden = true; $('#erroLogin').hidden = true; }

let _appAberto = false;
async function abrirApp() {
  state._focarTela = false; // na abertura o foco fica onde o navegador pôs (não rouba o foco)
  let p;
  try { p = await api('GET', '/perfil'); }
  catch (e) {
    // 401/403 já levaram à tela certa (login, código, sem acesso, senha nova)
    if (![401, 403].includes(e.status)) mostrarLogin(e.message || 'Não consegui abrir sua conta agora.');
    return;
  }
  state.perfil = p;
  if (window.Conta) await window.Conta.depoisDoPerfil(p); else esconderLogin();
  if (_appAberto) return route(null, { quieto:true });
  _appAberto = true;
  const comLink = [...new URLSearchParams(location.search).keys()].some(k => ['cliente', 'tel', 'campanha', 'tela'].includes(k));
  if (!comLink) await route('reguas');
  await abrirPorLink();
  if (!state._vez) await route('reguas'); // link sem destino (cliente não achado): cai nas Réguas
  window.R5?.abrirAtalho();
}

/* Link vindo de outro app (Atendimento, CRM, Agenda) ou do sino:
   ?cliente=<uuid> ou ?tel=<telefone> abre a ficha · ?campanha=<uuid> abre a
   aprovação · ?tela=mensagens&status=falhou&tipo=posvenda abre a lista filtrada.
   O telefone sai da barra de endereço logo depois. */
async function abrirPorLink() {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].some(k => ['cliente', 'tel', 'campanha', 'tela'].includes(k))) return;
  history.replaceState(null, '', location.pathname);
  await abrirLinkInterno(p);
}
window.abrirLinkInterno = abrirLinkInterno;
async function abrirLinkInterno(p) {
  const id = p.get('cliente'), tel = (p.get('tel') || '').replace(/[^0-9]/g, '');
  const camp = p.get('campanha'), tela = p.get('tela');
  try {
    if (camp && /^[0-9a-f-]{36}$/i.test(camp)) { state.campanhaEmFoco = camp; return route('campanhas'); }
    if (tela && ROUTES[tela]) {
      if (tela === 'mensagens') {
        const st = p.get('status'), tp = p.get('tipo');
        if (st && STATUS_ENVIO[st]) state.msg.status = st;
        if (tp && TIPO[tp]) state.msg.tipo = tp;
      }
      return route(tela);
    }
    if (!id && tel.length < 8) return;
    let alvo = /^[0-9a-f-]{36}$/i.test(id || '') ? id : null;
    if (!alvo && tel) {
      const lista = await api('GET', '/clientes?q=' + encodeURIComponent(tel.replace(/^55(?=[0-9]{10,11}$)/, '')));
      alvo = lista?.[0]?.id || null;
    }
    if (!alvo) return toast('Cliente desse link não encontrado no cadastro.', 'err');
    if (state.route !== 'clientes') await route('clientes');
    await abrirFicha(alvo);
  } catch (e) { toast(e.message || 'Não consegui abrir o link.', 'err'); }
}

/* ==================== TEMA CLARO / ESCURO ==================== */
const TEMA_KEY = 'indycar_tema';
const temaAtual = () => document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';
function aplicarTema(tema) {
  const claro = tema === 'claro';
  const raiz = document.documentElement;
  raiz.setAttribute('data-trocando-tema', '');
  raiz.setAttribute('data-tema', claro ? 'claro' : 'escuro');
  void (document.body || raiz).offsetHeight;
  clearTimeout(state._temaTimer);
  state._temaTimer = setTimeout(() => raiz.removeAttribute('data-trocando-tema'), 60);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', claro ? '#eef0f4' : '#070a14');
  const ico = $('#temaIco'), txt = $('#temaTxt');
  if (ico) ico.textContent = claro ? '☀️' : '🌙';
  if (txt) txt.textContent = claro ? 'Claro' : 'Escuro';
  try { localStorage.setItem(TEMA_KEY, claro ? 'claro' : 'escuro'); } catch { /* ignora */ }
}
$('#btnTema')?.addEventListener('click', () => aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro'));
aplicarTema(temaAtual());


/* ============================================================================
   RODADA 2 — IA no Comunicar, conectividade e o resto
   ============================================================================ */

/* ---- prévia de celular fiel ao WhatsApp (como o CLIENTE vê) ---- */
/** Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, link) sobre texto JÁ escapado. */
function formatarWA(txt) {
  let h = esc(txt);
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<span class="wa-link">$1</span>');
  h = h.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<b>$2</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,!?]|$)/g, '$1<s>$2</s>');
  return h;
}
/** Moldura de celular: topo com a conta da oficina, fundo do WhatsApp e o balão recebido. */
function celularWA(bolhaHtml, { mini = false } = {}) {
  return `<div class="celular${mini ? ' mini' : ''}">
    <div class="cel-topo" aria-hidden="true"><span class="cel-voltar">‹</span><span class="cel-av">IC</span>
      <span class="cel-quem"><b>IndyCar Centro Automotivo</b><small>conta comercial</small></span></div>
    <div class="cel-fundo"><span class="cel-dia" aria-hidden="true">HOJE</span>${bolhaHtml}</div>
  </div>`;
}
/** Pinta um balão com o texto final (variáveis já trocadas). */
/** R14: o erro técnico do WhatsApp parado vira uma frase simples (o texto original fica no title do selo). */
function erroEmPortugues(e) {
  const t = String(e.erro || '');
  if (['chave_recusada', 'sem_chave'].includes(e.erro_classe) || /chave.*(recusad|cadastrad)|\b401\b/i.test(t)) return 'O WhatsApp da oficina está parado. Esta mensagem sai quando ele voltar.';
  return t;
}
function pintarBolha(el, txt, hora = '09:30', vazio = 'Escreva a mensagem para ver a prévia.') {
  if (!el) return;
  el.classList.toggle('vazia', !txt);
  el.innerHTML = txt ? formatarWA(txt) : esc(vazio);
  if (txt) { const h = document.createElement('span'); h.className = 'hora'; h.textContent = String(hora).slice(0, 5); el.append(h); }
}

/* ---- toast com ação (ex.: Desfazer) ---- */
function toastAcao(msg, rotulo, fn, ms = 7000) {
  toast(msg, 'ok', ms);
  const t = $('#toast');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-acao'; b.textContent = rotulo;
  b.addEventListener('click', async () => { b.disabled = true; t.classList.remove('show'); try { await fn(); } catch (e) { toast(e.message, 'err'); } });
  t.insertBefore(b, $('.toast-barra', t));
}

/* ---- intenção da resposta (lida pela IA) ---- */
const INTENCAO = {
  quer_agendar:['📅', 'quer agendar', 'bp-green'], quer_orcamento:['💰', 'quer orçamento', 'bp-orange'],
  reclamacao:['⚠️', 'reclamou', 'bp-red'], duvida:['❓', 'tem dúvida', 'bp-blue'],
  agradecimento:['🙏', 'agradeceu', 'bp-purple'], outro:['💬', 'outro assunto', 'bp-gray'],
};
const CHAMA_CONSULTOR = new Set(['quer_agendar', 'quer_orcamento', 'reclamacao']);
const pillIntencao = (i, resumo) => { const x = INTENCAO[i]; if (!x) return '';
  return `<span class="badge-pill ${x[2]} intencao" title="${esc(resumo ? `IA: ${resumo}` : 'lido pela IA')}">✨ ${x[0]} ${esc(x[1])}</span>`; };
/* Passagens para os outros apps (rodada 13B): os endereços vêm de apps.js (na Central, a mesma origem = sem login de
   novo); o telefone vai sem o 55, como o Atendimento, o CRM e a Agenda esperam. Rodada 13C: cada app abre na aba
   nomeada dele ("indycar-crm", "indycar-agenda"…), pelo ouvinte de cliques de apps.js. */
function linkCliente(app, c) {
  const pronto = app === 'crm' ? LINKS.clienteCrm?.(c.id, c.telefone) : LINKS.clienteAgenda?.(c.id, c.telefone);
  if (pronto) return pronto;
  const tel = soDigitos(c.telefone).replace(/^55(?=\d{10,11}$)/, '');
  return `${app === 'crm' ? CRM_URL : AGENDA_URL}/?cliente=${encodeURIComponent(c.id)}${tel ? `&tel=${encodeURIComponent(tel)}` : ''}`;
}
function linkConversa(tel) { return LINKS.conversaTel?.(tel) || `${ATENDIMENTO_URL}/?tel=${encodeURIComponent(soDigitos(tel).replace(/^55(?=\d{10,11}$)/, ''))}`; }

async function encaminhar(id, btn) {
  if (btn) btn.disabled = true;
  try {
    await api('POST', `/envios/${id}/encaminhar`);
    toast('Pronto: a conversa está na fila do consultor no Atendimento.');
    if (btn) { btn.outerHTML = '<span class="badge-pill bp-green">✓ no Atendimento</span>'; }
  } catch (e) { toast(e.message, 'err', 5000); if (btn) btn.disabled = false; }
}

/* ---- ESCREVER COM IA (painel embutido: réguas e campanha) ----
   Gera 3 variações no tom da casa; o servidor valida cada uma por código
   (variável desconhecida, palavra proibida, preço/prazo, tamanho) e manda a
   prévia com as variáveis trocadas para o cliente de exemplo. */
function painelEscreverIA(box, { regua, lerTexto, aplicar, exemplo }) {
  if (!box) return;
  if (!box.hidden && box.dataset.aberto) { box.hidden = true; box.dataset.aberto = ''; return; }
  box.hidden = false; box.dataset.aberto = '1';
  box.innerHTML = `<div class="ia-painel">
    <div class="ia-topo"><span class="ia-selo">✨ IA</span><b>Escrever com IA</b><small>3 opções no tom da casa — você escolhe</small></div>
    <div class="ia-linha"><input class="inp" data-ia-pedido maxlength="300" placeholder="O que a mensagem deve dizer? (opcional) — ex.: mais curta, lembrar do diagnóstico grátis" aria-label="Pedido para a IA">
      <button type="button" class="btn ia" data-ia-gerar>${svg(I.refresh)} Gerar 3 opções</button>
      <button type="button" class="btn" data-ia-reescrever title="Melhora o texto que já está escrito">Reescrever a atual</button></div>
    <div class="ia-saida" data-ia-saida aria-live="polite"></div></div>`;
  const saida = $('[data-ia-saida]', box);
  const gerar = async (reescrever) => {
    const pedido = $('[data-ia-pedido]', box).value.trim();
    const texto = reescrever ? (lerTexto() || '') : '';
    if (reescrever && !texto.trim()) return toast('Não há texto para reescrever.', 'err');
    $$('button', box).forEach(b => (b.disabled = true));
    saida.innerHTML = `<div class="ia-pensando"><span class="ia-pontos"><i></i><i></i><i></i></span> escrevendo as opções…</div>`;
    try {
      const r = await api('POST', '/ia/escrever', { regua, pedido, texto, exemplo: exemplo?.() || undefined });
      if (!r.variacoes?.length) { saida.innerHTML = '<p class="form-msg erro">A IA não trouxe opção agora. Tente de novo.</p>'; return; }
      saida.innerHTML = `<div class="ia-opcoes">${r.variacoes.map((v, i) => `<div class="ia-opcao${v.ok ? '' : ' com-problema'}">
          <div class="ia-op-topo"><b>Opção ${i + 1}</b>${v.ok ? '<span class="badge-pill bp-green">✓ nas regras</span>' : `<span class="badge-pill bp-orange" title="${esc(v.problemas.join(' · '))}">⚠ ${esc(v.problemas[0] || 'revisar')}</span>`}${v.corrigido ? '<span class="badge-pill bp-gray" title="troquei palavra proibida sozinho">corrigida</span>' : ''}</div>
          ${celularWA(`<div class="bolha wa-rec" data-op="${i}"></div>`, { mini:true })}
          <button type="button" class="btn ${v.ok ? 'primary' : ''} btn-mini" data-usar="${i}">${svg(I.check)} Usar esta</button></div>`).join('')}</div>
        <small class="dica">O texto vai para a caixa com as variáveis (ex.: {primeiro_nome}); a prévia já mostra como o cliente lê.</small>`;
      r.variacoes.forEach((v, i) => pintarBolha($(`[data-op="${i}"]`, saida), v.previa || v.texto));
      $$('[data-usar]', saida).forEach(b => b.addEventListener('click', () => {
        const v = r.variacoes[Number(b.dataset.usar)];
        aplicar(v.texto);
        toast(v.ok ? 'Texto da IA aplicado — revise e salve.' : 'Aplicado. Atenção: ' + v.problemas.join(', '), v.ok ? 'ok' : 'err', 4200);
        box.hidden = true; box.dataset.aberto = '';
      }));
    } catch (e) { saida.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; }
    finally { $$('button', box).forEach(b => (b.disabled = false)); }
  };
  $('[data-ia-gerar]', box).addEventListener('click', () => gerar(false));
  $('[data-ia-reescrever]', box).addEventListener('click', () => gerar(true));
  $('[data-ia-pedido]', box).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); gerar(false); } });
  setTimeout(() => $('[data-ia-pedido]', box)?.focus(), 30);
}

/** Cartão da sugestão de público (campanha › passo 1). */
function htmlSugestao(sg) {
  return `<div class="ia-sugestao">
    <div class="ia-sug-topo"><span class="ia-selo">✨ IA sugere</span><b>${esc(window.R16.textoSegmento(sg.rotulo, sg.valor))}</b><span class="badge-pill bp-gray">${sg.previa?.total ?? '?'} clientes</span></div>
    <p class="ia-motivo">${esc(sg.motivo)}</p>
    ${celularWA('<div class="bolha wa-rec" data-sug-bolha></div>', { mini:true })}
    ${sg.ok === false ? `<p class="form-msg erro">A mensagem sugerida tem: ${esc(sg.problemas.join(', '))} — ajuste no passo 2.</p>` : ''}
    <button type="button" class="btn primary btn-mini" id="usarSug">${svg(I.check)} ${sg.usada ? 'Usada — usar de novo' : 'Usar sugestão'}</button></div>`;
}

(async function init() {
  mostrarLogin();
  /* rodada 4: a configuração pública (URL e chave anônima do Supabase) fica guardada
     no aparelho — com o servidor dormindo a tela abre na hora e o Acordar espera ele. */
  let guardada = null;
  try { guardada = JSON.parse(localStorage.getItem('comunicar_config') || 'null'); } catch { /* sem localStorage */ }
  try {
    const pedido = (window.Acordar ? window.Acordar.buscar(API + '/config') : fetch(API + '/config')).then(r => r.json());
    CONFIG = guardada?.configurado ? guardada : await pedido;
    pedido.then(c => { try { if (c?.configurado) localStorage.setItem('comunicar_config', JSON.stringify(c)); } catch { /* cheio */ } }).catch(() => {});
  }
  catch { return mostrarLogin('Não consegui falar com o servidor. Confira a internet e tente de novo em instantes.'); }
  if (!CONFIG.configurado) return mostrarLogin('Falta configurar o Supabase no servidor (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY).');
  if (!window.supabase?.createClient) return mostrarLogin('A biblioteca do Supabase não carregou. Verifique sua conexão.');
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  window.Conta?.ligar(sb);
  // volta do e-mail de senha: o evento PASSWORD_RECOVERY abre a tela de senha nova
  if (/type=recovery/.test(location.hash)) return;
  const { data } = await sb.auth.getSession();
  if (data?.session) {
    try { if (window.Conta) await window.Conta.depoisDoLogin(); else { esconderLogin(); await abrirApp(); } }
    catch (err) { mostrarLogin(err.message); }
  }
})();

/* ============================================================================
   RODADA 3 — equipe: faixa "para você" no Início e aprovação de campanhas
   ============================================================================ */

const STATUS_CAMP = { aguardando:['Aguardando aprovação', 'bp-orange'], aprovada:['Aprovada', 'bp-green'], recusada:['Recusada', 'bp-red'], cancelada:['Cancelada', 'bp-gray'] };

/* Campanhas: propostas de atendentes. Gestor aprova/recusa; atendente vê as dele e pode cancelar. */
async function pintarAprovacoes() {
  const box = $('#aprovacoes'); if (!box) return;
  let r;
  try { [r] = await Promise.all([api('GET', '/campanhas/aprovacao'), carregarSegmentos().catch(() => null)]); } catch { return; }
  if (!$('#aprovacoes')) return;
  const lista = (r.lista || []).filter(c => c.status === 'aguardando' || (Date.now() - new Date(c.decidido_em || c.created_at).getTime()) < 14 * 86400000);
  if (!lista.length) { box.innerHTML = ''; return; }
  const gestor = r.gestor;
  box.innerHTML = `<div class="panel aprov-panel"><div class="panel-head"><h2>${svg(I.check)} ${gestor ? 'Para aprovar' : 'Suas campanhas'}</h2>
      <span class="panel-sub">${r.aguardando ? plural(r.aguardando, 'aguardando', 'aguardando') : 'nenhuma aguardando'}</span></div>
    <div class="panel-body lista">${lista.map(c => {
      const [rot, cor] = STATUS_CAMP[c.status] || [c.status, 'bp-gray'];
      const alvo = c.segmento?.filtro ? window.R16.textoSegmento((state.segmentos || []).find(s => s.id === c.segmento.filtro)?.rotulo || c.segmento.filtro, c.segmento.valor) : `lista de ${Array.isArray(c.destinos) ? c.destinos.length : (c.total_previsto ?? '?')} clientes`;
      // rodada 5: o CRM também propõe campanhas (origem 'crm'); sem a coluna, lista de destinos sem segmento é do CRM
      const doCrm = c.origem === 'crm' || (!c.origem && !c.segmento && Array.isArray(c.destinos));
      return `<article class="aprov${c.id === state.campanhaEmFoco ? ' foco' : ''}" data-camp="${esc(c.id)}">
        <div class="aprov-topo"><span class="badge-pill ${cor}">${esc(rot)}</span>${doCrm ? '<span class="badge-pill bp-purple" title="Proposta criada no funil do CRM">🚩 veio do CRM</span>' : ''}
          <small>${esc(c.criado_por_nome || 'atendente')} · ${esc(relativo(c.created_at))} · ${c.total_previsto ?? '?'} clientes · ${esc(alvo)}${c.enviar_em ? ` · para ${esc(dataHoraBR(c.enviar_em))}` : ''}</small></div>
        <div class="envio-corpo" title="Como chega para um cliente de exemplo. Texto-modelo: ${esc(c.corpo)}">${esc(window.R15 ? window.R15.exemploDaMensagem(c.corpo, EXEMPLO) : c.corpo)}</div>
        ${c.status === 'aguardando' ? '<small class="muted">Exemplo com a Maria: cada cliente recebe com o próprio nome e carro.</small>' : ''}
        ${c.status === 'recusada' && c.motivo_recusa ? `<p class="form-msg erro">Motivo: ${esc(c.motivo_recusa)}</p>` : ''}
        ${c.status === 'aprovada' ? `<small class="muted">Aprovada por ${esc(c.decidido_por_nome || 'gestor')} · ${c.enfileirados ?? 0} na fila${c.pulados ? ` · ${c.pulados} pulados` : ''}</small>` : ''}
        ${c.status === 'aguardando' ? `<div class="envio-acoes">
          ${gestor ? `<button type="button" class="btn btn-mini" data-recusar="${esc(c.id)}">${svg(I.x)} Recusar</button>
            <button type="button" class="btn btn-mini primary" data-aprovar="${esc(c.id)}">${svg(I.check)} Aprovar e colocar na fila</button>`
          : `<button type="button" class="btn btn-mini" data-cancelar-camp="${esc(c.id)}">${svg(I.x)} Cancelar pedido</button>`}</div>` : ''}
      </article>`; }).join('')}</div></div>`;
  if (state.campanhaEmFoco) { $('.aprov.foco', box)?.scrollIntoView({ block:'center', behavior:'smooth' }); state.campanhaEmFoco = null; }
  box.onclick = async (e) => {
    const ap = e.target.closest('[data-aprovar]'), rc = e.target.closest('[data-recusar]'), cc = e.target.closest('[data-cancelar-camp]');
    if (ap) {
      const quantos = lista.find(x => x.id === ap.dataset.aprovar)?.total_previsto;
      if (!confirm(`Aprovar para ${quantos ? plural(quantos, 'cliente', 'clientes') : 'estes clientes'}? As mensagens entram na fila agora (quem pediu para parar fica fora).`)) return;
      ap.disabled = true;
      try { const x = await api('POST', `/campanhas/${ap.dataset.aprovar}/aprovar`, {}); toast(`Aprovada: ${plural(x.enfileirados, 'mensagem', 'mensagens')} na fila${x.pulados ? ` · ${x.pulados} pulada(s)` : ''}.`, 'ok', 5000); route(null, { quieto:true }); }
      catch (err) { toast(err.message, 'err'); ap.disabled = false; }
    }
    if (rc) {
      const motivo = prompt('Motivo da recusa (o atendente vê):', '');
      if (motivo === null) return;
      rc.disabled = true;
      try { await api('POST', `/campanhas/${rc.dataset.recusar}/recusar`, { motivo }); toast('Campanha recusada — o atendente foi avisado.'); route(null, { quieto:true }); }
      catch (err) { toast(err.message, 'err'); rc.disabled = false; }
    }
    if (cc) {
      if (!confirm('Cancelar este pedido de campanha?')) return;
      cc.disabled = true;
      try { await api('POST', `/campanhas/${cc.dataset.cancelarCamp}/cancelar`, {}); toast('Pedido cancelado.'); route(null, { quieto:true }); }
      catch (err) { toast(err.message, 'err'); cc.disabled = false; }
    }
  };
}
