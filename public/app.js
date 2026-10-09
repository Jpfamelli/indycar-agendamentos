/* ============================ IndyCar Agendamentos — App ============================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---- ícones (SVG inline) ----------------------------------------------------
const I = {
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z"/>',
  car:'<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14a2 2 0 0 1 2 2v4h-2M5 11a2 2 0 0 0-2 2v4h2m0 0h14m-12 0a2 2 0 1 1-4 0m16 0a2 2 0 1 1-4 0"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  play:'<path d="M5 3l14 9-14 9V3z"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  wa:'<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
  send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  money:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  bot:'<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 17h6"/>',
  chave:'<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6"/>',
  cadeado:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  loja:'<path d="M3 9l1.6-5h14.8L21 9M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  relogio:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copiar:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  bolo:'<path d="M3 21h18M4 21v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6M6 13V9h12v4M12 9V6"/><path d="M12 3c-.8 1 .8 2 0 3"/>',
  imprimir:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  sino_off:'<path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17.9 17.9 0 0 1 18 8M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M1 1l22 22"/>',
  alerta:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
};
const svg = (p, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${p}</svg>`;

// ---- estado -----------------------------------------------------------------
/* Marca da versão (igual à de /api/versao no server.js): confere o deploy. */
const VERSAO_APP = '2026-10-09-r2';
const state = { route:'inicio', empresa:{}, consultores:[] };
/* LINK DE ENTRADA do ecossistema: o Atendimento, o CRM e o Comunicar abrem a
   Agenda com ?tel=<dígitos> (às vezes &cliente=<uuid>). Lido UMA vez aqui e
   tirado da barra de endereço na hora — o telefone não fica no histórico do
   navegador nem num print. Fica só na memória até o login terminar. */
state.entrada = window.Planejamento ? Planejamento.lerEntrada(location.search) : null;
if (window.Planejamento && /[?&](tel|telefone|cliente|agendamento)=/.test(location.search)) {
  try { history.replaceState(history.state, '', Planejamento.semEntrada(location.href)); } catch { /* navegador antigo */ }
}

// ---- API --------------------------------------------------------------------
/* Sessão do Supabase Auth — a mesma conta do CRM e do Atendimento. */
let sb = null, CONFIG = null;

/* Cabeçalhos com o token do login. Falha aqui, com aviso claro, em vez de
   mandar sem credencial e levar 401 do servidor. */
async function authCabecalhos() {
  const cab = { 'Content-Type':'application/json' };
  if (!sb) return cab;
  const { data } = await sb.auth.getSession();
  const t = data?.session?.access_token;
  if (!t) throw new Error('Sua sessão expirou. Entre de novo para continuar.');
  cab.Authorization = `Bearer ${t}`;
  return cab;
}

async function api(method, path, body) {
  const opt = { method, headers: await authCabecalhos() };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opt);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { mostrarLogin('Sua sessão expirou. Entre de novo.'); throw new Error('Sessão expirada'); }
  if (!r.ok) throw new Error(data.erro || 'Erro na requisição');
  return data;
}

// ---- utilidades -------------------------------------------------------------
/* Recado no pé da tela. opts.acao = { rotulo, fn } vira um botão (ex.: Desfazer):
   com ação o recado dura mais e aceita clique. Um recado novo SUBSTITUI o
   anterior — antes o timer do antigo apagava o novo no meio da leitura. */
let _toastTimer = null;
function toast(msg, type = 'ok', opts = {}) {
  const t = $('#toast');
  /* Fechado, o botão de ação é DESLIGADO. O recado some só no visual (opacidade):
     sem isto, um Tab + Enter desfazia um desfecho antigo sem ninguém ver. */
  const fechar = () => {
    clearTimeout(_toastTimer); t.classList.remove('show');
    const b = $('.toast-acao', t); if (b) b.disabled = true;
  };
  clearTimeout(_toastTimer);
  t.className = 'toast';
  t.textContent = '';
  const ico = document.createElement('span');
  ico.className = 'toast-ico'; ico.textContent = type === 'err' ? '✕' : '✓';
  const txt = document.createElement('span');
  txt.className = 'toast-msg'; txt.textContent = msg;        // textContent: nome de cliente nunca vira HTML
  t.append(ico, txt);
  if (opts.acao) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-acao'; b.textContent = opts.acao.rotulo;
    let usada = false;
    b.addEventListener('click', async () => {
      if (usada) return;                                       // clique duplo não desfaz duas vezes
      usada = true; fechar();
      try { await opts.acao.fn(); } catch (e) { toast(e.message, 'err'); }
    });
    t.append(b);
  }
  const dur = opts.duracao || (opts.acao ? 8000 : type === 'err' ? 4500 : 2800);
  const barra = document.createElement('i');
  barra.className = 'toast-barra'; barra.style.animationDuration = dur + 'ms';
  t.append(barra);
  void t.offsetWidth;                                         // reinicia a animação da barra
  t.className = `toast show ${type}${opts.acao ? ' com-acao' : ''}`;
  _toastTimer = setTimeout(fechar, dur);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Duas letras para o círculo do avatar (rodapé da lateral e lista da equipe). */
const iniciais = (nome) => String(nome || '').trim().split(/\s+/).filter(Boolean)
  .slice(0, 2).map(x => x[0].toUpperCase()).join('');
function dataExtenso(iso) {
  const d = new Date(iso + 'T12:00:00');
  return cap(d.toLocaleDateString('pt-BR',{weekday:'long'})) + ', ' +
         d.getDate() + ' De ' + cap(d.toLocaleDateString('pt-BR',{month:'long'})) + ' De ' + d.getFullYear();
}
const dataBR = (iso) => { if(!iso) return ''; const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; };
/* Data de hoje no fuso da OFICINA. toISOString é UTC: das 21h em diante ele já
   devolve amanhã, e o modal de novo agendamento nascia com o dia errado. */
const hojeSP = () => new Intl.DateTimeFormat('en-CA',
  { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
// O Postgres devolve timestamptz em UTC ('...T12:34:56+00:00'). Sem converter,
// a tela mostraria 3 horas adiantado e em formato ilegível.
const dataHoraBR = (ts) => { if(!ts) return '';
  const d = new Date(ts); if (isNaN(d)) return String(ts);
  return d.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', dateStyle:'short', timeStyle:'short' }); };
const STATUS_LABEL = { aguardando:'Aguardando', confirmado:'Confirmado', em_atendimento:'Em atendimento',
  compareceu:'Compareceu', nao_veio:'Não veio', concluido:'Concluído', nao_fechou:'Não fechou',
  cancelado:'Cancelado' };

/* ---------------------------------------------------------------------------
   ECOSSISTEMA INDYCAR — os apps da oficina. O seletor da barra lateral marca
   este (a Agenda) e abre os outros numa aba nova.
   --------------------------------------------------------------------------- */
const ECOSSISTEMA = [
  { chave:'agenda',      nome:'Agenda',      desc:'horários e presença',        url:'https://indycar-agendamentos.onrender.com', ico:I.calendar },
  { chave:'crm',         nome:'CRM',         desc:'leads e funil',              url:'https://indycar-crm.onrender.com',          ico:I.flag },
  { chave:'atendimento', nome:'Atendimento', desc:'conversas do WhatsApp',      url:'https://indycar-atendimento.onrender.com',  ico:I.wa },
  { chave:'comunicar',   nome:'Comunicar',   desc:'lembretes e réguas',         url:'https://indycar-posvenda.onrender.com',     ico:I.send },
  { chave:'orcador',     nome:'Orçador',     desc:'orçamentos com IA',          url:'https://indycar-orcador.netlify.app',       ico:I.money },
  { chave:'site',        nome:'Site',        desc:'indycar-taubate',            url:'https://indycar-taubate.netlify.app',       ico:I.loja },
];
const APP_ATUAL = 'agenda';

/* Horário real da oficina: seg–sáb, 8h às 17h30. Fora disso a tela AVISA ao
   marcar (sem bloquear — o dono pode abrir exceção). */
const EXPEDIENTE = { diasAbertos:[1, 2, 3, 4, 5, 6], abre:8 * 60, fecha:17 * 60 + 30 };
function foraDoExpediente(dataIso, hora) {
  if (!dataIso || !hora) return null;                 // campo vazio não é "fora do expediente"
  const d = new Date(`${dataIso}T12:00:00Z`);
  const [h, m] = String(hora).split(':').map(Number);
  if (Number.isNaN(d.getTime()) || Number.isNaN(h)) return null;
  if (!EXPEDIENTE.diasAbertos.includes(d.getUTCDay())) return 'Domingo a oficina não abre.';
  const min = h * 60 + (m || 0);
  if (min < EXPEDIENTE.abre || min > EXPEDIENTE.fecha) return 'Fora do expediente (seg–sáb, 8h às 17h30).';
  return null;
}

/** Máscara leve de telefone: só dígitos → "(12) 99999-9999". Não trava o que a pessoa digita. */
function mascaraTelefone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);  // 55 na frente: tira, o servidor repõe
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const telefoneOk = (v) => { const d = String(v || '').replace(/\D/g, ''); return !d || (d.length >= 10 && d.length <= 13); };
/** Liga a máscara num campo (e mantém o cursor no fim, onde a pessoa está digitando). */
function ligarMascaraTelefone(input) {
  if (!input) return;
  input.addEventListener('input', () => { input.value = mascaraTelefone(input.value); });
  if (input.value) input.value = mascaraTelefone(input.value);
}
/** Link tel: com DDI (o celular abre o discador). */
const linkTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d && d.length <= 11) d = '55' + d; return d ? `tel:+${d}` : ''; };
/** Máscara do aniversário: dígitos → DD/MM ou DD/MM/AAAA. */
function mascaraAniversario(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
/** Quantos dias faltam para o aniversário (0 = hoje; null sem data). Ignora o ano. */
function diasParaAniversario(nascIso, hojeIso) {
  const m = String(nascIso || '').match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ano = +hojeIso.slice(0, 4);
  let prox = Date.UTC(ano, +m[1] - 1, +m[2]);
  const hoje = Date.parse(hojeIso + 'T00:00:00Z');
  if (prox < hoje) prox = Date.UTC(ano + 1, +m[1] - 1, +m[2]);
  return Math.round((prox - hoje) / 86400000);
}

/* Selo do lembrete que o COMUNICAR mandou (posvenda_envios, tipo 'lembrete').
   O servidor anexa `lembrete` {status, resposta} só a quem ainda não tem desfecho. */
function seloLembrete(a) {
  const l = a?.lembrete;
  if (!l) return '';
  const r = l.resposta;
  // o que o cliente escreveu vai no title (esc: texto do cliente nunca vira HTML)
  const disse = l.texto ? ` — “${esc(l.texto)}”` : '';
  if (r === 'positiva') return `<span class="badge-pill bp-green" title="O cliente confirmou pelo WhatsApp${disse}">respondeu 👍</span>`;
  if (r === 'negativa') return `<span class="badge-pill bp-orange" title="O cliente disse que não vem${disse}">respondeu 👎</span>`;
  if (r === 'parar')    return `<span class="badge-pill bp-red" title="Pediu para não receber mensagens${disse}">pediu p/ parar 🔕</span>`;
  if (r === 'neutra')   return `<span class="badge-pill bp-blue" title="O cliente respondeu ao lembrete${disse}">respondeu</span>`;
  if (['enviado', 'entregue', 'lido', 'respondido'].includes(l.status)) return `<span class="badge-pill bp-blue" title="Lembrete enviado pelo Comunicar">lembrete enviado</span>`;
  if (['pendente', 'agendado', 'fila'].includes(l.status)) return `<span class="badge-pill bp-gray" title="Lembrete na fila do Comunicar">lembrete na fila</span>`;
  if (l.status === 'falhou') return `<span class="badge-pill bp-red" title="O Comunicar não conseguiu enviar">lembrete falhou</span>`;
  return '';
}

/* O que dizer depois de marcar "Não veio" — a VERDADE sobre o aviso automático.
   Antes o painel dizia "delegado à IA" com a mensagem falhando por trás. */
function recadoDeAusencia(r) {
  const av = r?.aviso_ausencia;
  if (!av) return 'Marcado como "Não veio" (sem telefone — nenhum aviso enviado)';
  if (av.repetido) return 'Já estava marcado — o aviso automático foi enviado antes, não reenviei';
  if (av.ok) return 'Não veio — aviso automático enviado no WhatsApp do cliente ✅';
  return 'Marquei "Não veio", mas o aviso NÃO saiu: ' + (av.erro || 'falha no envio') + '. Toque de novo para tentar outra vez.';
}
// Origens aceitas pelo banco compartilhado. Faltar uma aqui fazia o formulário
// reescrever a origem do cliente em silêncio ao salvar.
const ORIGENS = ['Google','Indicação','Instagram','Facebook','WhatsApp','Passagem','Telefone','Orgânico'];
// Papéis da tabela `perfis` (compartilhada com o CRM e o Atendimento).
// 'agenda' = só marca presença aqui na Agenda; não entra nos outros sistemas.
const PAPEL_LABEL = { admin:'Administrador', gestor:'Gestor', atendente:'Atendente',
  agenda:'Só presença (agenda)' };
// Como a janela de agendamento grava os dias — a tela mostra por extenso.
const DIAS_LABEL = { 'seg-sex':'Segunda a sexta', 'sabado':'Sábado', 'domingo':'Domingo',
  'seg-sab':'Segunda a sábado', 'todos':'Todos os dias' };

/* ---------------------------------------------------------------------------
   TEMPO — sempre no fuso da OFICINA (America/Sao_Paulo), nunca no do aparelho.
   --------------------------------------------------------------------------- */
let _agoraMemo = null, _agoraMemoEm = 0;
/** { data:'YYYY-MM-DD', hm:'HH:MM', min: minutos desde a meia-noite }. Guarda por 5s:
    uma lista de 40 cartões não precisa montar 40 formatadores de data. */
function agoraSP() {
  const t = Date.now();
  if (_agoraMemo && t - _agoraMemoEm < 5000) return _agoraMemo;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;             // alguns motores dão 24 à meia-noite
  _agoraMemoEm = t;
  return (_agoraMemo = { data:`${p.year}-${p.month}-${p.day}`, hm:`${hh}:${p.minute}`,
                         min:(+hh) * 60 + (+p.minute) });
}
/** Dias corridos entre duas datas ISO (ao meio-dia UTC: horário de verão não atrapalha). */
const diasEntre = (deIso, ateIso) =>
  Math.round((Date.parse(ateIso + 'T12:00:00Z') - Date.parse(deIso + 'T12:00:00Z')) / 86400000);
const DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** Hoje · Amanhã · Ontem · "sex 19/09" (com o ano só quando não for o atual). */
function rotuloDia(iso, hojeIso) {
  if (!iso) return '';
  const n = diasEntre(hojeIso, iso);
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  if (n === -1) return 'Ontem';
  const [a, m, d] = iso.split('-');
  const sem = DIA_CURTO[new Date(iso + 'T12:00:00Z').getUTCDay()];
  return `${sem} ${d}/${m}` + (a !== hojeIso.slice(0, 4) ? `/${a.slice(2)}` : '');
}
/** "em 2 h", "agora", "atrasado 40 min"… Só para quem ainda NÃO tem desfecho. */
function quandoRel(a, agora) {
  if (!['aguardando', 'confirmado'].includes(a.status) || a.compareceu === 1) return null;
  const n = diasEntre(agora.data, a.data);
  if (n > 1)  return { txt:`em ${n} dias`, tom:'' };
  if (n === 1) return { txt:'amanhã', tom:'breve' };
  if (n < 0)  return { txt: n === -1 ? 'era ontem' : `há ${-n} dias`, tom:'atrasado' };
  const [h, m] = String(a.hora || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const dif = h * 60 + (m || 0) - agora.min;
  if (dif > 90)   return { txt:`em ${Math.round(dif / 60)} h`, tom:'breve' };
  if (dif > 10)   return { txt:`em ${dif} min`, tom:'agora' };
  if (dif >= -10) return { txt:'agora', tom:'agora' };
  if (dif > -90)  return { txt:`atrasado ${-dif} min`, tom:'atrasado' };
  return { txt:`atrasado ${Math.round(-dif / 60)} h`, tom:'atrasado' };
}
/** Mesma ordem do servidor (dados.js › ordenarPorProximidade): o que está mais
    perto de acontecer primeiro; depois o que já passou, do mais novo ao mais velho. */
function porProximidade(lista, agora) {
  const chave = (a) => `${a.data} ${String(a.hora || '').slice(0, 5)}`;
  const corte = `${agora.data} ${agora.hm}`;
  const proximos = [], passados = [];
  for (const a of lista) (chave(a) >= corte ? proximos : passados).push(a);
  proximos.sort((x, y) => chave(x).localeCompare(chave(y)));
  passados.sort((x, y) => chave(y).localeCompare(chave(x)));
  return [...proximos.map(a => ({ ...a, secao:'proximos' })), ...passados.map(a => ({ ...a, secao:'passados' }))];
}

// ============================================================================
// CARD DE AGENDAMENTO
// ============================================================================
/* UM selo por cartão (antes eram dois empilhados: "Confirmado" + "Compareceu").
   Mesma precedência do grupoDoDia: o status vivo manda antes do bit compareceu. */
function seloDoCartao(a) {
  const vivo = ['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1;
  if (vivo) return (a.confirmado || a.status === 'confirmado')
    ? ['bp-green', 'Confirmado'] : ['bp-orange', 'Aguardando'];
  if (a.status === 'concluido')      return ['bp-purple', 'Concluído'];
  if (a.status === 'nao_fechou')     return ['bp-orange', 'Não fechou'];
  if (a.status === 'em_atendimento') return ['bp-blue', 'Em atendimento'];
  // status explícito ANTES do bit compareceu, que pode ter ficado velho
  if (a.status === 'cancelado')      return ['bp-gray', 'Cancelado'];
  if (a.status === 'nao_veio')       return ['bp-red', 'Não veio'];
  if (a.status === 'compareceu' || a.compareceu === 1) return ['bp-blue', 'Compareceu'];
  if (a.compareceu === 0)            return ['bp-red', 'Não veio'];
  return ['bp-gray', STATUS_LABEL[a.status] || 'Sem situação'];
}

/* Miolo comum aos dois cartões (o do painel e o do modo presença): canhoto com a
   hora, quem é, o selo e os dados. Só os botões mudam de um para o outro. */
function corpoDoCartao(a, agora, botoes) {
  const veic = a.veiculo ? `${esc(a.veiculo)}${a.placa ? ` (${esc(a.placa)})` : ''}` : (a.placa ? `(${esc(a.placa)})` : '');
  const rel = quandoRel(a, agora);
  const [seloCls, seloTxt] = seloDoCartao(a);
  return `
  <article class="appt s-${esc(a.status)}${rel && rel.tom === 'atrasado' ? ' is-atrasado' : ''}"
           data-id="${esc(a.id)}" data-status="${esc(a.status)}" data-nome="${esc(a.cliente_nome)}">
    <div class="appt-when">
      <span class="appt-hora">${esc(a.hora)}</span>
      <span class="appt-dia${a.data === agora.data ? ' hoje' : ''}">${esc(rotuloDia(a.data, agora.data))}</span>
    </div>
    <div class="appt-body">
      <div class="appt-head">
        <div class="appt-quem">
          <h3 class="appt-nome">${esc(a.cliente_nome)}</h3>
          <p class="appt-servico">${esc(a.servico)}</p>
        </div>
        <div class="appt-badges">
          ${rel ? `<span class="quando ${rel.tom}">${esc(rel.txt)}</span>` : ''}
          ${seloLembrete(a)}
          ${!a.telefone && !emPresenca() ? '<span class="badge-pill bp-gray sem-tel" title="Sem telefone não recebe lembrete nem pós-venda — edite e use “Achar pelo nome”">sem telefone</span>' : ''}
          <span class="badge-pill ${seloCls}">${esc(seloTxt)}</span>
        </div>
      </div>
      <div class="appt-meta">
        ${veic ? `<span>${svg(I.car)} ${veic}</span>` : ''}
        ${a.telefone ? `<span class="tel">${svg(I.phone)} <a href="${esc(linkTel(a.telefone))}" title="Ligar">${esc(mascaraTelefone(a.telefone) || a.telefone)}</a>
            <button type="button" class="copiar" data-copiar="${esc(a.telefone)}" title="Copiar telefone" aria-label="Copiar telefone de ${esc(a.cliente_nome)}">${svg(I.copiar)}</button></span>` : ''}
        ${a.origem ? `<span>${svg(I.pin)} ${esc(a.origem)}</span>` : ''}
        ${a.consultor_nome ? `<span>${svg(I.user)} ${esc(a.consultor_nome)}</span>` : ''}
      </div>
    </div>
    <div class="appt-actions">${botoes}</div>
  </article>`;
}

/* Atalho para a conversa do cliente no Atendimento (abre em outra aba). Só com
   telefone — sem ele o Atendimento não tem como achar a conversa. */
function linkConversa(a) {
  const l = window.Planejamento ? Planejamento.links(a) : {};
  return l.atendimento ? `<a class="act ico" href="${esc(l.atendimento)}" target="_blank" rel="noopener"
      title="Abrir a conversa no Atendimento" aria-label="Abrir a conversa de ${esc(a.cliente_nome)} no Atendimento">${svg(I.wa)}</a>` : '';
}

/* Os três desfechos de uma visita (pedido do dono), sempre na mesma ordem:
     Veio e fechou     → status 'concluido'  → CRM: lead Concluído (com o valor) e funil "Serviço concluído"
     Não veio          → status 'nao_veio'   → CRM: volta para Contato + aviso de ausência no WhatsApp
     Veio e não fechou → status 'nao_fechou' → CRM: Não fechou
   Quem recebe um desfecho de VISITA sai do Início — o lugar dele passa a ser o CRM.
   opts.comWhatsapp: só o Follow-up passa true — aquela tela existe para mandar
   mensagem. (O 2º argumento de .map é o índice, um número: por isso o teste de
   tipo abaixo, que deixa os .map(appointmentCard) funcionando.) */
function appointmentCard(a, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  return corpoDoCartao(a, o.agora || agoraSP(), `
        <button class="act green solido" data-act="concluido"
                title="Veio e fez o serviço: sai do Início e vai para o CRM como Concluído">${svg(I.check)} Veio e fechou</button>
        <button class="act red" data-act="nao_veio">${svg(I.x)} Não veio</button>
        <button class="act orange" data-act="nao_fechou"
                title="Veio, mas não fechou o serviço: vai para o CRM como Não fechou">${svg(I.flag)} Veio e não fechou</button>
        <span class="act-fim">
        ${o.comWhatsapp === true ? `<button class="act wa" data-act="whatsapp">${svg(I.wa)} WhatsApp</button>` : ''}
        ${linkConversa(a)}
        <button class="act ico" data-act="remarcar" title="Remarcar (outro dia ou hora)" aria-label="Remarcar ${esc(a.cliente_nome)}">${svg(I.calendar)}</button>
        <button class="act ico" data-act="editar" title="Editar" aria-label="Editar agendamento">${svg(I.edit)}</button>
        <button class="act red ico" data-act="excluir" title="Excluir" aria-label="Excluir agendamento">${svg(I.trash)}</button>
        </span>`);
}

/* O cartão some desta lista depois do desfecho? Depende de ONDE ele está:
   data-saida="tudo"      → agenda de hoje: qualquer desfecho tira o cartão da aba
   data-saida="desfecho"  → Últimos / lista da Agenda: sai quem veio; "Não veio" fica
   sem data-saida         → busca e Follow-up: nada sai, a tela só se atualiza. */
function cartaoVaiSair(card, act) {
  const box = card.closest('[data-saida]');
  if (!box) return false;
  if (act === 'nao_veio') return box.dataset.saida === 'tudo' && state.hojeTab !== 'faltaram';
  return true;
}
/** Desliza o cartão para fora e fecha o espaço. Resolve mesmo se a animação não
    rodar (aba oculta, movimento reduzido) — por isso o timer de segurança. */
function sairDoCartao(card) {
  return new Promise((ok) => {
    if (!card.isConnected) return ok();
    card.style.setProperty('--h', card.offsetHeight + 'px');
    card.classList.add('saindo');
    let feito = false;
    const fim = () => { if (feito) return; feito = true; card.remove(); ok(); };
    card.addEventListener('animationend', (e) => { if (e.target === card) fim(); });
    setTimeout(fim, 650);
  });
}

const RECADO_DESFECHO = {
  concluido:  (n) => `${n}: veio e fechou — foi para o CRM como Concluído`,
  nao_fechou: (n) => `${n}: veio e não fechou — registrado no CRM`,
};
async function marcarDesfecho(card, id, act) {
  const anterior = card.dataset.status;
  const nome = card.dataset.nome || 'Cliente';
  const botoes = $$('.act', card);
  botoes.forEach(b => { b.disabled = true; });
  card.classList.add('ocupado');
  let r;
  /* Sem internet (ou a rede caiu no meio): o desfecho vai para a fila do
     aparelho e sai sozinho quando a conexão voltar — nada de marcar de novo. */
  const semRede = (e) => navigator.onLine === false || e instanceof TypeError;
  try {
    if (navigator.onLine === false) throw new TypeError('offline');
    r = await api('PATCH', `/agendamentos/${id}/status`, { status: act });
  }
  catch (e) {
    if (semRede(e)) {
      enfileirar(id, act, nome);
      card.classList.remove('ocupado'); card.classList.add('na-fila');
      return toast(`Sem internet: guardei "${act === 'concluido' ? 'Veio e fechou' : act === 'nao_veio' ? 'Não veio' : 'Veio e não fechou'}" de ${nome}. Envio sozinho quando a conexão voltar.`);
    }
    botoes.forEach(b => { b.disabled = false; });
    card.classList.remove('ocupado');
    return toast(e.message, 'err');
  }
  // só sai DEPOIS de o servidor confirmar: nada de cartão que some e volta
  if (cartaoVaiSair(card, act)) await sairDoCartao(card);

  if (act === 'nao_veio') {
    toast(recadoDeAusencia(r), r.aviso_ausencia && !r.aviso_ausencia.ok ? 'err' : 'ok');
  } else {
    /* Desfazer devolve o horário ao status de antes; o gatilho do banco reabre o
       lead no CRM (só quando foi a própria Agenda que o fechou). */
    /* Sem Desfazer de volta para "Não veio": esse PATCH é o que dispara o aviso de
       ausência no WhatsApp, e um registro antigo sem carimbo mandaria mensagem ao
       cliente. Para voltar a "Não veio", o botão do cartão continua lá (na busca). */
    const podeDesfazer = anterior && anterior !== act && anterior !== 'nao_veio' && STATUS_LABEL[anterior];
    // sem lead_id (agendamento sem telefone → sem cliente → sem lead) nada foi para o CRM
    const recado = r.lead_id ? RECADO_DESFECHO[act](nome)
      : `${nome}: ${act === 'concluido' ? 'veio e fechou' : 'veio e não fechou'} — marcado aqui (sem ficha no CRM: agendamento sem telefone)`;
    toast(recado, 'ok', podeDesfazer ? { acao: { rotulo:'Desfazer', fn: async () => {
      await api('PATCH', `/agendamentos/${id}/status`, { status: anterior });
      toast(`Desfeito — ${nome} voltou para "${STATUS_LABEL[anterior]}"`);
      route();
    } } } : {});
  }
  route();                 // sem argumento = atualiza a mesma tela em silêncio
}

/* Copiar telefone (botão pequeno ao lado do número, em qualquer cartão/ficha).
   Um ouvinte só no documento: os cartões são repintados o tempo todo. */
async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copiar]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const ok = await copiarTexto(b.dataset.copiar);
  toast(ok ? `Telefone copiado: ${mascaraTelefone(b.dataset.copiar) || b.dataset.copiar}` : 'Não consegui copiar — selecione e copie à mão', ok ? 'ok' : 'err');
});

// delegação de cliques nos cards
function bindApptActions(root) {
  $$('.appt', root).forEach(card => {
    // id é uuid (string) desde a migração para o Supabase — não converter com +
    const id = card.dataset.id;
    $$('.act', card).forEach(btn => btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      try {
        if (act === 'editar')   return openAgendamentoModal(id);
        if (act === 'remarcar') return abrirRemarcar(id);
        if (act === 'whatsapp') return openWhatsappModal(id);
        if (act === 'excluir') {
          if (!confirm('Excluir este agendamento?')) return;
          await api('DELETE', `/agendamentos/${id}`);
          await sairDoCartao(card);
          toast('Agendamento excluído');
          return route();
        }
        if (RECADO_DESFECHO[act] || act === 'nao_veio') return marcarDesfecho(card, id, act);
      } catch (e) { toast(e.message, 'err'); }
    }));
  });
}

// ============================================================================
// VIEWS
// ============================================================================
const view = $('#view');

/* Em qual balde do dia o agendamento entra (pedido do dono, 2026-09-17):
     'agendados'  = quem ainda vai chegar
     'oficina'    = chegou mas AINDA não tem desfecho (o modo presença marca
                    "Compareceu" na chegada; a venda quem fecha é o Início)
     'resolvidos' = veio e fechou / veio e não fechou → NÃO aparece no Início:
                    o cliente foi para o CRM. Não recrie aba para ele achando
                    que é bug — o dono pediu três vezes que ele saísse daqui.
     'faltaram'   = não vieram (e cancelados)
   PRECEDÊNCIA: o STATUS explícito manda antes do bit `compareceu`, que pode ter
   ficado velho — um "Não veio" reeditado para Confirmado volta para Agendados, e
   um Cancelado que um dia teve compareceu=true não pode cair em "Na oficina".
   ESPELHO NO SERVIDOR: os contadores de dados.js › estatisticas() usam a mesma
   regra (veio = oficina + resolvidos). Mudou aqui? Muda lá. */
function grupoDoDia(a) {
  if (['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1) return 'agendados';
  if (['concluido', 'nao_fechou'].includes(a.status)) return 'resolvidos';
  if (['nao_veio', 'cancelado'].includes(a.status)) return 'faltaram';
  if (a.compareceu === 1 || ['compareceu', 'em_atendimento'].includes(a.status)) return 'oficina';
  if (a.compareceu === 0) return 'faltaram';
  return 'agendados';
}
const vazio = (ico, titulo, texto) =>
  `<div class="vazio"><div class="vazio-ico">${svg(ico)}</div><b>${titulo}</b><p>${texto}</p></div>`;
const VAZIO_HOJE = {                       // Início (quem fecha a venda)
  agendados: [I.relogio, 'Ninguém esperando', 'Nenhum horário de hoje aguardando. Quem já teve desfecho está no CRM.'],
  oficina:   [I.chave, 'Ninguém na oficina', 'Quem chega e ainda não tem desfecho aparece aqui.'],
  faltaram:  [I.check, 'Nenhuma falta marcada hoje', 'Quem for marcado como "Não veio" fica aqui, para remarcar.'],
};
const VAZIO_DIA = {                        // modo presença (quem só marca a chegada)
  agendados: [I.relogio, 'Ninguém esperando', 'Quando o cliente chegar, toque em "Compareceu" no cartão dele.'],
  chegaram:  [I.check, 'Ninguém chegou ainda', 'Ao tocar em "Compareceu", o cliente vem para cá.'],
  faltaram:  [I.check, 'Nenhuma falta marcada hoje', 'Quem for marcado como "Não veio" fica aqui.'],
};

/* O traço vermelho das abas do dia desliza de uma para a outra. No celular as
   abas rolam de lado: a ativa é trazida para a vista (sem rolar a PÁGINA). */
function moverTinta(tabs, semAnimar = false) {
  if (!tabs) return;
  let ink = $('.tab-ink', tabs);
  if (!ink) {
    ink = document.createElement('i'); ink.className = 'tab-ink';
    tabs.append(ink); tabs.classList.add('com-tinta'); semAnimar = true;
  }
  const at = $('.tab.active', tabs);
  if (!at) return;
  if (semAnimar) ink.style.transition = 'none';
  ink.style.setProperty('--ink-x', (at.offsetLeft + 12) + 'px');
  ink.style.setProperty('--ink-y', (at.offsetTop + at.offsetHeight - 3) + 'px');
  ink.style.setProperty('--ink-w', Math.max(0, at.offsetWidth - 24) + 'px');
  if (semAnimar) { void ink.offsetWidth; ink.style.transition = ''; }
  if (tabs.scrollWidth > tabs.clientWidth + 1) {
    const fora = at.offsetLeft < tabs.scrollLeft
              || at.offsetLeft + at.offsetWidth > tabs.scrollLeft + tabs.clientWidth;
    if (fora) tabs.scrollTo({ left: Math.max(0, at.offsetLeft - 16), behavior: semAnimar ? 'auto' : 'smooth' });
  }
}
window.addEventListener('resize', debounce(() => moverTinta($('#tabsHoje'), true), 120));

/** Pinta uma lista com a entrada em cascata (só quando `animar`; numa
    atualização silenciosa os cartões simplesmente já estão lá). */
function pintarLista(box, html, animar) {
  box.innerHTML = html;
  if (!animar) return;
  box.classList.add('lista-anim');
  clearTimeout(box._animTimer);
  box._animTimer = setTimeout(() => box.classList.remove('lista-anim'), 900);
}

/** Conta de 0 até o número. Se o rAF não rodar (aba oculta), o timer garante o valor final. */
function animarNumeros(root) {
  if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('.num[data-num]', root).forEach(el => {
    const fim = +el.dataset.num;
    if (!(fim > 0)) return;
    const t0 = performance.now(), dur = 700;
    el.textContent = '0';
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(fim * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    setTimeout(() => { el.textContent = fim; }, dur + 400);
  });
}

/* RELÓGIO DA TELA — de minuto em minuto os avisos de tempo ("em 40 min"), o
   "Próximo cliente" e a divisão A seguir / Já passaram são recalculados com os
   dados que JÁ estão na tela (state._repintar, que cada tela registra).
   De propósito NÃO busca no servidor: cada /dashboard pode disparar a importação
   do CodeWords, e consultar de minuto em minuto com o painel aberto o dia todo
   estoura a cota — já aconteceu neste projeto. Agendamento novo continua
   aparecendo ao trocar de tela ou recarregar, como sempre foi. */
function repintarSePuder() {
  if (document.hidden || !state._pintou || typeof state._repintar !== 'function') return;
  if ($('#modalOverlay.open')) return;
  // não troca o cartão debaixo do dedo/mouse de ninguém
  if ($('.appt.ocupado, .appt.saindo, .appt:hover, .appt:focus-within')) return;
  _agoraMemo = null;
  try { state._repintar(); } catch { /* a próxima volta tenta de novo */ }
}
setInterval(repintarSePuder, 60000);
document.addEventListener('visibilitychange', repintarSePuder);

const CHAVES_CARDS = ['totalHoje', 'compareceram', 'naoVieram', 'naoFechou'];

async function renderInicio(opts = {}) {
  const d = await api('GET', '/dashboard');
  if (opts.vez && opts.vez !== state._vez) return;        // o usuário já foi para outra tela
  state._inicio = d;
  pintarInicio(d, opts);
  state._repintar = () => { if (state.route === 'inicio' && state._inicio) pintarInicio(state._inicio, { quieto: true }); };
}

function pintarInicio(d, opts = {}) {
  const c = d.cards, agora = agoraSP();
  const grupos = { agendados: [], oficina: [], faltaram: [] };
  for (const a of d.agendaHoje) { const g = grupoDoDia(a); if (grupos[g]) grupos[g].push(a); }
  /* "Na oficina" atravessa os dias: carro que chegou ontem e ainda não teve
     desfecho continua lá (o servidor manda os dos últimos 7 dias). Sem isto, quem
     o modo presença marcava e ninguém fechava no mesmo dia sumia de todas as
     listas e o lead ficava preso em "Em serviço" no CRM para sempre. */
  for (const a of (d.naOficina || [])) if (grupoDoDia(a) === 'oficina') grupos.oficina.push(a);
  grupos.oficina.sort((x, y) => `${y.data} ${y.hora}`.localeCompare(`${x.data} ${x.hora}`));

  // "Na oficina" só vira aba quando tem alguém lá — no dia a dia são duas abas.
  const abas = [['agendados', 'Agendados', I.relogio]];
  if (grupos.oficina.length) abas.push(['oficina', 'Na oficina', I.chave]);
  abas.push(['faltaram', 'Não vieram', I.x]);
  if (!abas.some(([k]) => k === state.hojeTab)) state.hojeTab = 'agendados';

  // abertura: quem é o próximo?
  const prox = grupos.agendados.find(a => String(a.hora) >= agora.hm);
  const semDesfecho = grupos.agendados.filter(a => String(a.hora) < agora.hm).length;
  const saud = agora.min < 12 * 60 ? 'Bom dia' : agora.min < 18 * 60 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = String(state.perfil?.nome || '').trim().split(/\s+/)[0];
  const frase = prox ? `Próximo cliente às ${esc(prox.hora)}.`
    : semDesfecho ? `${semDesfecho} ${semDesfecho === 1 ? 'cliente de hoje ainda sem desfecho' : 'clientes de hoje ainda sem desfecho'} — marque quem veio.`
    : !d.agendaHoje.length ? 'Nenhum agendamento para hoje.'
    : 'Agenda de hoje em dia. 🏁';
  const relProx = prox ? quandoRel(prox, agora) : null;

  // a divisão A seguir / Já passaram é recalculada AQUI: ela muda com o relógio
  const ultimos = porProximidade(d.ultimos, agora);
  const proximos = ultimos.filter(a => a.secao === 'proximos');
  const passados = ultimos.filter(a => a.secao !== 'proximos');
  const htmlUltimos = !ultimos.length
    ? vazio(I.calendar, 'Nada pendente', 'Quem já veio está no CRM. Os próximos horários marcados aparecem aqui.')
    : (proximos.length ? `<div class="lista-sep">A seguir <em>${proximos.length}</em></div>`
        + proximos.map(a => appointmentCard(a, { agora })).join('') : '')
    + (passados.length ? `<div class="lista-sep">Já passaram <em>${passados.length}</em></div>`
        + passados.map(a => appointmentCard(a, { agora })).join('') : '');

  view.innerHTML = `
    <div class="hero-dia">
      <div>
        <div class="hero-data">${esc(dataExtenso(d.data))}</div>
        <h2 class="hero-titulo">${saud}${primeiroNome ? ', ' + esc(primeiroNome) : ''}. <span>${frase}</span></h2>
        ${c.semTelefone30d > 0 ? `<button type="button" class="chip-aviso" id="chipSemTel"
            title="Sem telefone o cliente não recebe lembrete nem pós-venda. Toque para ver e corrigir.">
            ${svg(I.alerta)} ${c.semTelefone30d} ${c.semTelefone30d === 1 ? 'agendamento sem telefone' : 'agendamentos sem telefone'} nos últimos 30 dias</button>` : ''}
      </div>
      ${prox ? `<div class="hero-prox">
        <span class="h">${esc(prox.hora)}</span>
        <div><small>Próximo${relProx ? ' · ' + esc(relProx.txt) : ''}</small>
          <b>${esc(prox.cliente_nome)} — ${esc(prox.servico)}</b></div>
      </div>` : ''}
    </div>
    <!-- Pedido do dono (2026-09-16): só 4 números do DIA, numa linha. A classe
         row2 já é a grade de 4 colunas (com os mesmos pontos de quebra). -->
    <div class="stat-grid row2">
      ${statCard('red',    c.totalHoje,    'Agendamentos hoje',       I.calendar)}
      ${statCard('green',  c.compareceram, 'Compareceram hoje',       I.check)}
      ${statCard('orange', c.naoVieram,    'Não vieram hoje',         I.x)}
      ${statCard('purple', c.naoFechou,    'Compareceu e não fechou', I.flag)}
    </div>
    <div class="cols">
      <div class="panel">
        <div class="panel-head">
          <h2>${svg(I.calendar)} Agenda de hoje</h2>
          <span class="panel-sub">quem veio vai para o CRM</span>
          <button type="button" class="icon-btn so-tela" id="btnImprimir" title="Imprimir a folha do dia"
                  aria-label="Imprimir a folha do dia">${svg(I.imprimir)}</button>
        </div>
        <div class="tabs tabs-hoje" id="tabsHoje">
          ${abas.map(([chave, rotulo, ico]) =>
            `<button type="button" class="tab ${state.hojeTab === chave ? 'active' : ''}" data-hoje-tab="${chave}">
               ${svg(ico)} ${rotulo} <em class="tab-num">${grupos[chave].length}</em></button>`).join('')}
        </div>
        <div class="panel-body lista" id="agendaHoje" data-saida="tudo"></div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>${svg(I.calendar)} Últimos agendamentos</h2>
          <span class="panel-sub">o mais próximo primeiro</span>
        </div>
        <div class="panel-body lista" id="ultimos" data-saida="desfecho"></div>
      </div>
    </div>`;

  // Pinta só o corpo do painel ao trocar de aba — sem voltar ao servidor.
  const pintarHoje = (animar) => {
    $$('#tabsHoje .tab').forEach(b => b.classList.toggle('active', b.dataset.hojeTab === state.hojeTab));
    const lista = grupos[state.hojeTab] || [];
    const box = $('#agendaHoje');
    pintarLista(box, lista.length ? lista.map(a => appointmentCard(a, { agora })).join('')
      : vazio(...VAZIO_HOJE[state.hojeTab]), animar);
    bindApptActions(box);
  };
  $$('#tabsHoje .tab').forEach(b => b.addEventListener('click', () => {
    if (state.hojeTab === b.dataset.hojeTab) return;
    state.hojeTab = b.dataset.hojeTab;
    pintarHoje(true);
    moverTinta($('#tabsHoje'));
  }));
  pintarHoje(!opts.quieto);
  moverTinta($('#tabsHoje'), true);
  pintarLista($('#ultimos'), htmlUltimos, !opts.quieto);
  bindApptActions($('#ultimos'));
  // Folha do dia: a impressão (styles.css › @media print) mostra só a agenda de hoje,
  // em ordem de horário, com os três grupos — sem botões, sem menu, sem números.
  $('#btnImprimir')?.addEventListener('click', () => imprimirFolhaDoDia(d));
  // o chip leva para a Agenda já filtrada em "só sem telefone"
  $('#chipSemTel')?.addEventListener('click', () => { state.agendaQ = ''; state.agendaSemTel = true; route('agenda'); });

  // números: contam na abertura; numa atualização silenciosa, só o que mudou "pulsa"
  if (opts.quieto && state._cards) {
    $$('.stat .num', view).forEach((el, i) => {
      if (state._cards[CHAVES_CARDS[i]] !== c[CHAVES_CARDS[i]]) el.classList.add('pulsa');
    });
  } else if (!opts.quieto) animarNumeros(view);
  state._cards = c;
}
/* Folha do dia imprimível: monta uma lista limpa de TODOS os horários de hoje
   (agendados, na oficina, não vieram), em ordem, e chama a impressão. A folha
   fica numa <div class="folha"> escondida na tela e visível só no @media print. */
function imprimirFolhaDoDia(d) {
  // TODOS os horários de hoje, inclusive quem já teve desfecho — no papel, o dia inteiro conta
  const todos = (d.agendaHoje || []).slice().sort((x, y) => String(x.hora).localeCompare(String(y.hora)));
  let folha = $('#folhaDia');
  if (!folha) { folha = document.createElement('div'); folha.id = 'folhaDia'; folha.className = 'folha'; document.body.append(folha); }
  const sit = (a) => seloDoCartao(a)[1];
  folha.innerHTML = `
    <h1>${esc(state.empresa?.nome || 'IndyCar')} — Agenda do dia</h1>
    <p class="folha-sub">${esc(dataExtenso(d.data))} · ${todos.length} ${todos.length === 1 ? 'horário' : 'horários'} · impresso às ${esc(agoraSP().hm)}</p>
    ${todos.length ? `<table>
      <thead><tr><th>Hora</th><th>Cliente</th><th>Carro / placa</th><th>Serviço</th><th>Telefone</th><th>Situação</th><th>Veio?</th></tr></thead>
      <tbody>${todos.map(a => `<tr>
        <td class="h">${esc(a.hora)}</td><td><b>${esc(a.cliente_nome)}</b></td>
        <td>${esc([a.veiculo, a.placa].filter(Boolean).join(' · ') || '—')}</td>
        <td>${esc(a.servico)}</td><td>${esc(mascaraTelefone(a.telefone) || '—')}</td>
        <td>${esc(sit(a))}</td><td class="caixa">☐</td></tr>`).join('')}</tbody>
    </table>` : '<p>Nenhum horário marcado para hoje.</p>'}
    ${todos.length ? (() => { const r = P.resumo(todos); return `<p class="folha-resumo"><b>Resumo do dia:</b> ${r.total} marcados · ${r.veio} vieram · ${r.fechou} fecharam · ${r.naoFechou} não fecharam · ${r.faltou} faltaram · ${r.pendentes} ainda sem desfecho</p>`; })() : ''}
    <p class="folha-pe">Quem conhece, Indyca! 🏎</p>`;
  document.body.classList.add('imprimindo-folha');
  const limpar = () => { document.body.classList.remove('imprimindo-folha'); window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  window.print();
  setTimeout(limpar, 60000);   // navegador que não dispara afterprint
}

function statCard(cls, num, lbl, ico, mini = false) {
  return `<div class="stat ${cls}${mini ? ' mini' : ''}">
    <div class="stat-top"><span class="lbl">${lbl}</span><span class="ico">${svg(ico)}</span></div>
    <div class="num"${Number.isInteger(num) ? ` data-num="${num}"` : ''}>${num}</div>
  </div>`;
}

/* Tela Agenda: a fila inteira, na mesma ordem do Início — o que está mais perto
   de acontecer primeiro, agrupado por dia. Quem já VEIO não aparece aqui (está
   no CRM, ou na aba "Na oficina" do Início); a BUSCA acha qualquer um, inclusive
   concluídos, para reabrir ou reagendar. */
function htmlDaAgenda(lista, agora, buscando) {
  if (!lista.length) return buscando
    ? vazio(I.search, 'Nada encontrado', 'Tente pelo nome, pela placa ou pelo telefone.')
    : vazio(I.calendar, 'Agenda limpa', 'Nenhum horário pendente. Quem já veio está no CRM.');
  let html = '', secao = null, dia = null;
  for (const a of porProximidade(lista, agora)) {
    if (a.secao !== secao) {
      secao = a.secao; dia = null;
      html += `<div class="lista-sep forte">${secao === 'proximos' ? 'A seguir' : 'Já passaram'}</div>`;
    }
    if (a.data !== dia) { dia = a.data; html += `<div class="lista-sep">${esc(rotuloDia(a.data, agora.data))}</div>`; }
    html += appointmentCard(a, { agora });
  }
  return html;
}
async function renderAgenda(opts = {}) {
  const buscar = async (q) => {
    const todos = await api('GET', '/agendamentos' + (q ? '?q=' + encodeURIComponent(q) : ''));
    return q ? todos : todos.filter(a => !['oficina', 'resolvidos'].includes(grupoDoDia(a)));
  };
  // filtro "só sem telefone" (vem do chip do Início ou do botão da barra)
  const semTel = (l) => state.agendaSemTel ? l.filter(a => !a.telefone) : l;
  const pintar = (itens, q, animar) => {
    const box = $('#agendaList');
    if (!box) return;
    // na busca nada "sai": ela mostra todo mundo, inclusive quem já foi para o CRM
    if (q) box.removeAttribute('data-saida'); else box.dataset.saida = 'desfecho';
    const vis = semTel(itens);
    pintarLista(box, (state.agendaSemTel && !vis.length)
      ? vazio(I.check, 'Todo mundo com telefone', 'Nenhum agendamento pendente sem telefone. 🏁')
      : htmlDaAgenda(vis, agoraSP(), !!q), animar);
    bindApptActions(box);
    const n = itens.filter(a => !a.telefone).length;
    const b = $('#btnSemTel');
    if (b) { b.hidden = !n && !state.agendaSemTel; b.classList.toggle('ativo', !!state.agendaSemTel);
      b.innerHTML = `${svg(I.alerta)} Sem telefone <em class="tab-num">${n}</em>`; }
    state._repintar = () => { if (state.route === 'agenda') pintar(itens, q, false); };
  };

  const q0 = state.agendaQ || '';
  const lista = await buscar(q0);
  if (opts.vez && opts.vez !== state._vez) return;

  /* Atualização silenciosa (depois de marcar, editar, excluir): só a LISTA é
     repintada. Recriar a barra de busca apagaria o que a pessoa está digitando
     e tiraria o cursor do campo. */
  if (opts.quieto && $('#agendaList') && $('#qAgenda')) return pintar(lista, q0, false);

  view.innerHTML = `
    <div class="toolbar">
      <!-- sem botão "Novo agendamento" aqui: o do topo da página já faz isso -->
      <div class="search larga">${svg(I.search)}<input id="qAgenda" placeholder="Buscar por cliente, placa ou telefone — a busca acha também quem já foi para o CRM" value="${esc(q0)}" aria-label="Buscar agendamento"></div>
      <button type="button" class="btn" id="btnVerSemana" title="Ver a semana em grade, com ocupação por dia (tecla S)">${svg(I.calendar)} Semana</button>
      <button type="button" class="btn filtro-semtel" id="btnSemTel" hidden
              title="Mostrar só quem está sem telefone (não recebe lembrete nem pós-venda)"></button>
    </div>
    <div class="panel"><div class="panel-body lista" id="agendaList"></div></div>`;
  pintar(lista, q0, !opts.quieto);
  $('#btnSemTel').addEventListener('click', () => { state.agendaSemTel = !state.agendaSemTel; route(); });
  $('#btnVerSemana').addEventListener('click', () => route('semana'));
  $('#qAgenda').addEventListener('input', debounce(async e => {
    const q = e.target.value.trim();
    state.agendaQ = q;
    const r = await buscar(q);
    // resposta de uma busca antiga não pinta por cima da mais nova
    if (state.route === 'agenda' && (state.agendaQ || '') === q) pintar(r, q, false);
  }, 250));
}

async function renderClientes(opts = {}) {
  const q0 = state.clientesQ || '';
  const list = await api('GET', '/clientes' + (q0 ? '?q=' + encodeURIComponent(q0) : ''));
  if (opts.vez && opts.vez !== state._vez) return;
  // atualização silenciosa (depois de salvar/excluir): só a tabela, sem apagar a busca
  if (opts.quieto && $('#cliBody') && $('#qCli')) { $('#cliBody').innerHTML = clienteRows(list, q0); bindCliRows(); return; }
  view.innerHTML = `
    <div class="toolbar">
      <div class="left"><div class="search">${svg(I.search)}<input id="qCli" placeholder="Buscar por nome, telefone ou placa…" value="${esc(q0)}" aria-label="Buscar cliente"></div>
        <span class="badge-pill bp-gray" id="cliTotal">${list.length} ${list.length === 1 ? 'cliente' : 'clientes'}</span></div>
      <button class="btn primary" onclick="openClienteModal()">${svg(I.plus)} Novo cliente</button>
    </div>
    <div class="panel"><div class="tabela-rolagem"><table class="table"><thead><tr>
      <th>Nome</th><th>Telefone</th><th>Carro</th><th>Placa</th><th>Origem</th><th></th>
    </tr></thead><tbody id="cliBody">${clienteRows(list, q0)}</tbody></table></div></div>`;
  bindCliRows();
  $('#qCli').addEventListener('input', debounce(async e => {
    const q = e.target.value.trim();
    state.clientesQ = q;
    const r = await api('GET', '/clientes' + (q ? '?q=' + encodeURIComponent(q) : ''));
    if (state.route !== 'clientes' || (state.clientesQ || '') !== q) return;   // resposta velha não pinta
    $('#cliBody').innerHTML = clienteRows(r, q); bindCliRows();
    const t = $('#cliTotal'); if (t) t.textContent = `${r.length} ${r.length === 1 ? 'cliente' : 'clientes'}`;
  }, 250));
}
/* Marquinhas discretas na lista: 🎂 quando o aniversário está a até 7 dias
   (ou é hoje) e 🔕 quando a pessoa pediu para não receber mensagem automática. */
function marcasDoCliente(c) {
  const hoje = agoraSP().data;
  const dias = diasParaAniversario(c.nascimento, hoje);
  const m = [];
  if (dias !== null && dias <= 7) m.push(`<span class="marca" title="${dias === 0 ? 'Aniversário HOJE' : `Aniversário em ${dias} dia${dias === 1 ? '' : 's'} (${esc(c.nascimento_tela)})`}">🎂</span>`);
  if (c.aceita_mensagens === 0) m.push(`<span class="marca" title="Não recebe mensagens automáticas${c.aceita_mensagens_motivo ? ': ' + esc(c.aceita_mensagens_motivo) : ''}">🔕</span>`);
  return m.join('');
}
function clienteRows(list, q) {
  if (!list.length) return `<tr><td colspan="6">${q
    ? vazio(I.search, 'Nenhum cliente com esse termo', 'Tente só o primeiro nome, os números do telefone ou a placa.')
    : vazio(I.user, 'Nenhum cliente ainda', 'O primeiro agendamento com telefone cria a ficha sozinho — ou use "Novo cliente".')}</td></tr>`;
  return list.map(c => `<tr data-id="${c.id}">
    <td><b>${esc(c.nome)}</b> ${marcasDoCliente(c)}</td>
    <td>${c.telefone ? `<span class="tel"><a href="${esc(linkTel(c.telefone))}">${esc(mascaraTelefone(c.telefone) || c.telefone)}</a>
      <button type="button" class="copiar" data-copiar="${esc(c.telefone)}" title="Copiar telefone" aria-label="Copiar telefone de ${esc(c.nome)}">${svg(I.copiar)}</button></span>` : '—'}</td>
    <td>${esc(c.veiculo||'—')}</td><td>${esc(c.placa||'—')}</td>
    <td><span class="badge-pill bp-gray">${esc(c.origem||'—')}</span></td>
    <td><div class="actions">
      <button class="icon-btn wa" data-act="wa" title="WhatsApp" aria-label="Mandar WhatsApp para ${esc(c.nome)}">${svg(I.wa)}</button>
      <button class="icon-btn" data-act="edit" title="Abrir ficha" aria-label="Abrir ficha de ${esc(c.nome)}">${svg(I.edit)}</button>
      <button class="icon-btn red" data-act="del" title="Excluir" aria-label="Excluir ${esc(c.nome)}">${svg(I.trash)}</button>
    </div></td></tr>`).join('');
}
function bindCliRows() {
  $$('#cliBody tr[data-id]').forEach(tr => {
    const id = tr.dataset.id; // uuid (string)
    tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openClienteModal(id));
    tr.querySelector('[data-act="wa"]')?.addEventListener('click', () => openWhatsappModal(null, id));
    tr.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
      if (!confirm('Excluir cliente?')) return;
      // clientes agora é compartilhada: o banco pode recusar se houver agendamento ligado
      try { await api('DELETE', `/clientes/${id}`); toast('Cliente excluído'); route(); }
      catch (e) { toast(e.message, 'err'); }
    });
  });
}

async function renderEquipe() {
  const list = await api('GET', '/consultores');
  view.innerHTML = `
    <div class="toolbar"><div class="left"><h2 style="font-size:18px">Equipe / Consultores</h2></div>
      <button class="btn primary" onclick="openConsultorModal()">${svg(I.plus)} Novo consultor</button></div>
    <div class="panel"><table class="table"><thead><tr>
      <th>Consultor</th><th>Telefone</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.length ? list.map(c => `<tr data-id="${c.id}">
        <td><span style="display:inline-flex;align-items:center;gap:9px">
          <i style="width:12px;height:12px;border-radius:50%;background:${esc(c.cor)};display:inline-block"></i>
          <b>${esc(c.nome)}</b></span></td>
        <td>${esc(mascaraTelefone(c.telefone)||'—')}</td>
        <td><span class="badge-pill ${c.ativo?'bp-green':'bp-gray'}">${c.ativo?'Ativo':'Inativo'}</span></td>
        <td><div class="actions">
          <button class="icon-btn" data-act="edit" title="Editar" aria-label="Editar ${esc(c.nome)}">${svg(I.edit)}</button>
          <button class="icon-btn red" data-act="del" title="Excluir" aria-label="Excluir ${esc(c.nome)}">${svg(I.trash)}</button>
        </div></td></tr>`).join('')
        : `<tr><td colspan="4">${vazio(I.user, 'Nenhum consultor', 'Cadastre quem atende no balcão para ligar cada agendamento a uma pessoa.')}</td></tr>`}
      </tbody></table></div>`;
  $$('tr[data-id]', view).forEach(tr => {
    const id = tr.dataset.id; // uuid (string)
    tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openConsultorModal(id));
    tr.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
      if (!confirm('Excluir consultor?')) return;
      try { await api('DELETE', `/consultores/${id}`); toast('Consultor excluído'); renderEquipe(); }
      catch (e) { toast(e.message, 'err'); }
    });
  });
}

async function renderCrm() {
  const d = await api('GET', '/crm');
  const maxOri = Math.max(1, ...d.porOrigem.map(o => o.total));
  view.innerHTML = `
    <div class="kpi-row">
      ${statCard('blue',   d.total,               'Total de agendamentos', I.calendar)}
      ${statCard('green',  d.taxaComparecimento+'%','Taxa de comparecimento', I.check)}
      ${statCard('purple', d.taxaConversao+'%',    'Taxa de conversão', I.flag)}
      ${statCard('orange', d.concluidos,          'Concluídos', I.flag)}
    </div>
    <div class="cols">
      <div class="panel"><div class="panel-head"><h2>${svg(I.pin)} Origem dos clientes</h2></div>
        <div class="panel-body">${d.porOrigem.length ? d.porOrigem.map(o => `
          <div class="origem-linha"><div class="origem-topo">
            <span>${esc(o.origem||'—')}</span><b>${o.total}</b></div>
            <div class="bar"><i style="width:${(o.total/maxOri*100).toFixed(0)}%"></i></div>
            ${o.faltas !== undefined ? `<small class="origem-taxas"><span class="${o.taxaFalta >= 30 ? 'alerta' : ''}" title="Dos que já tiveram desfecho, quantos não vieram">falta ${o.taxaFalta}%</span> · fecha ${o.taxaFechamento}% de quem veio</small>` : ''}
          </div>`).join('')
          : '<div class="empty">Sem dados.</div>'}</div></div>
      <div class="panel"><div class="panel-head"><h2>${svg(I.user)} Desempenho por consultor</h2></div>
        <div class="panel-body tabela-rola"><table class="table"><thead><tr><th scope="col">Consultor</th><th scope="col">Agend.</th><th scope="col">Vieram</th><th scope="col">Faltas</th><th scope="col">Fecharam</th><th scope="col">Fechamento</th></tr></thead>
        <tbody>${d.porConsultor.map(c => `<tr><th scope="row">${esc(c.nome)}${c.ativo === 0 ? ' <small class="muted">(inativo)</small>' : ''}</th><td>${c.total}</td><td>${c.vieram ?? '—'}</td><td>${c.faltas ?? '—'}</td><td>${c.concluidos||0}</td><td>${c.taxaFechamento ?? 0}%</td></tr>`).join('')}
        ${d.semConsultor ? `<tr class="muted"><th scope="row">Sem consultor</th><td>${d.semConsultor}</td><td colspan="4">escolha o consultor no agendamento para contar aqui</td></tr>` : ''}
        </tbody></table></div></div>
    </div>`;
}

async function renderFollowup() {
  const list = await api('GET', '/followup');
  view.innerHTML = `
    <div class="toolbar"><div class="left"><h2 style="font-size:18px">Follow-up — retornos pendentes</h2>
      ${list.length ? `<span class="badge-pill bp-orange">${list.length} para ligar</span>` : ''}</div></div>
    <div class="panel"><div class="panel-body lista">
      ${list.length ? list.map(a => appointmentCard(a, { comWhatsapp: true })).join('')
        : vazio(I.check, 'Tudo em dia! 🏁', 'Quem não veio ou não fechou aparece aqui para você chamar de volta.')}
    </div></div>`;
  bindApptActions(view);
}

async function renderHistorico() {
  const list = await api('GET', '/historico');
  view.innerHTML = `
    <div class="panel"><table class="table"><thead><tr>
      <th>Data</th><th>Hora</th><th>Cliente</th><th>Serviço</th><th>Consultor</th><th>Status</th>
    </tr></thead><tbody>
      ${list.length ? list.map(a => `<tr>
        <td>${dataBR(a.data)}</td><td>${esc(a.hora)}</td><td><b>${esc(a.cliente_nome)}</b></td>
        <td>${esc(a.servico)}</td><td>${esc(a.consultor_nome||'—')}</td>
        <td><span class="badge-pill ${statusClass(a.status)}">${esc(STATUS_LABEL[a.status]||a.status)}</span></td>
      </tr>`).join('') : `<tr><td colspan="6">${vazio(I.relogio, 'Sem histórico ainda', 'Cada agendamento marcado aparece aqui, do mais recente para o mais antigo.')}</td></tr>`}
    </tbody></table></div>`;
}
function statusClass(s){return {concluido:'bp-purple',compareceu:'bp-green',confirmado:'bp-green',
  nao_veio:'bp-red',nao_fechou:'bp-orange',em_atendimento:'bp-blue',aguardando:'bp-orange'}[s]||'bp-gray';}

// (Aba Arsenal removida a pedido — os serviços seguem alimentando o autocomplete
//  de agendamento e o contexto da IA, sem preços nem duração.)

// ============================================================================
// SERVIÇOS — catálogo compartilhado (catalogo_servicos), SOMENTE LEITURA.
// Quem cadastra e corrige é o CRM; aqui é consulta de balcão.
// ============================================================================
async function renderServicos() {
  const lista = await api('GET', '/catalogo');
  const fazemos = lista.filter(s => s.fazemos === 1).length;
  view.innerHTML = `
    <div class="toolbar">
      <div class="left">
        <h2>Catálogo de serviços</h2>
        <span class="badge-pill bp-gray">${lista.length} no total</span>
        <span class="badge-pill bp-green">${fazemos} a oficina faz</span>
      </div>
      <div class="search">${svg(I.search)}
        <input id="qServ" placeholder="Buscar serviço, categoria ou escopo…" autocomplete="off"></div>
    </div>
    <div class="aviso-leitura">${svg(I.cadeado)}
      <div><b>Só leitura nesta tela.</b> Este é o catálogo que a IA do WhatsApp consulta para
      dizer o que a oficina faz e o que não faz. Para <b>incluir, alterar ou remover</b> um
      serviço, use o <b>CRM</b> — os três sistemas leem a mesma lista.</div></div>
    <div class="cat-lista" id="servLista"></div>`;

  const pintar = (termo) => {
    const t = String(termo || '').trim().toLowerCase();
    const filtrada = !t ? lista : lista.filter(s =>
      [s.servico, s.categoria, s.escopo, s.tipo_veiculo, s.observacao]
        .some(c => String(c || '').toLowerCase().includes(t)));
    const box = $('#servLista');
    box.innerHTML = filtrada.length
      ? catalogoHtml(filtrada)
      : '<div class="panel"><div class="empty">Nenhum serviço encontrado com esse termo.</div></div>';
  };
  pintar('');
  $('#qServ').addEventListener('input', debounce(e => pintar(e.target.value), 160));
}

function catalogoHtml(lista) {
  const grupos = new Map();
  for (const s of lista) {
    if (!grupos.has(s.categoria)) grupos.set(s.categoria, []);
    grupos.get(s.categoria).push(s);
  }
  return [...grupos.entries()].map(([categoria, itens]) => `
    <div class="panel">
      <div class="panel-head cat-head">
        <h3>${esc(categoria)}</h3>
        <span class="badge-pill bp-gray">${itens.length} ${itens.length === 1 ? 'serviço' : 'serviços'}</span>
      </div>
      <div class="panel-body">
        <div class="serv-grid">${itens.map(servicoCard).join('')}</div>
      </div>
    </div>`).join('');
}

function servicoCard(s) {
  const faz = s.fazemos === 1;
  const meta = [];
  if (s.tipo_veiculo) meta.push(`Veículo: ${esc(s.tipo_veiculo)}`);
  if (s.observacao)   meta.push(esc(s.observacao));
  return `<div class="serv${faz ? '' : ' nao'}">
    <div class="serv-topo">
      <div class="serv-nome">${esc(s.servico)}</div>
      <span class="badge-pill ${faz ? 'bp-green' : 'bp-gray'}">${faz ? 'Fazemos' : 'Não fazemos'}</span>
    </div>
    ${s.escopo ? `<div class="serv-escopo">${esc(s.escopo)}</div>` : ''}
    ${meta.length ? `<div class="serv-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
  </div>`;
}

// ============================================================================
// CONFIGURAÇÕES — "Minha conta", "Oficina" e "Equipe e acessos"
// Cuidado com o nome: o item EQUIPE do menu lateral é outra coisa (consultores
// que atendem o cliente). Aqui é quem tem LOGIN — o mesmo dos três sistemas.
// ============================================================================
const CFG_SECOES = { conta: cfgConta, oficina: cfgOficina, equipe: cfgEquipe };

async function renderConfiguracoes() {
  const secao = CFG_SECOES[state.cfgSecao] ? state.cfgSecao : 'conta';
  const pilula = (chave, rotulo) =>
    `<button type="button" class="pilula ${secao === chave ? 'ativa' : ''}" data-secao="${chave}">${rotulo}</button>`;
  view.innerHTML = `
    <div class="toolbar"><div class="left"><h2>Configurações</h2></div></div>
    <div class="pilulas" id="cfgPilulas">
      ${pilula('conta', 'Minha conta')}
      ${pilula('oficina', 'Oficina')}
      ${pilula('equipe', 'Equipe e acessos')}
    </div>
    <div id="cfgConteudo">${esqueletoFormulario()}</div>`;
  $$('#cfgPilulas .pilula', view).forEach(b => b.addEventListener('click', () => {
    state.cfgSecao = b.dataset.secao;
    renderConfiguracoes().catch(e => toast(e.message, 'err'));
  }));
  await CFG_SECOES[secao]($('#cfgConteudo'));
}

/** Recado embaixo do formulário: verde quando deu certo, vermelho quando não. */
function recado(seletor, texto, ok) {
  const el = $(seletor);
  if (!el) return;
  el.textContent = texto;                       // textContent: nada de HTML aqui
  el.className = 'form-msg ' + (ok ? 'ok' : 'erro');
  el.hidden = false;
}

async function cfgConta(box) {
  const p = await api('GET', '/perfil');
  state.perfil = p;
  box.innerHTML = `
    <div class="cols">
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.user)} Meu perfil</h2></div>
        <div class="panel-body">
          <small class="muted">Seu nome aparece para a equipe. O e-mail e a função são do
            administrador — se estiverem errados, peça a ele.</small>
          <div class="field"><label>Nome</label>
            <input id="cf_nome" value="${esc(p.nome)}" placeholder="Seu nome" autocomplete="name"></div>
          <div class="field"><label>E-mail (só leitura)</label>
            <input id="cf_email" value="${esc(p.email)}" disabled></div>
          <div class="field"><label>Função (só leitura)</label>
            <input id="cf_papel" value="${esc(PAPEL_LABEL[p.papel] || p.papel || '—')}" disabled></div>
          <div><button class="btn primary" id="cf_salvar">${svg(I.check)} Salvar nome</button></div>
          <p class="form-msg" id="cf_msg" hidden></p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>${svg(I.cadeado)} Trocar minha senha</h2></div>
        <div class="panel-body">
          <small class="muted">É o mesmo login da Agenda, do CRM e do Atendimento: a senha nova
            vale nos três. Mínimo de 8 caracteres.</small>
          <div class="field"><label>Nova senha</label>
            <input id="cf_s1" type="password" minlength="8" autocomplete="new-password"
                   placeholder="pelo menos 8 caracteres"></div>
          <div class="field"><label>Repetir a nova senha</label>
            <input id="cf_s2" type="password" minlength="8" autocomplete="new-password"
                   placeholder="digite a mesma senha"></div>
          <div><button class="btn primary" id="cf_trocar">${svg(I.check)} Trocar senha</button></div>
          <p class="form-msg" id="cf_msg2" hidden></p>
        </div>
      </div>
    </div>`;

  $('#cf_salvar').addEventListener('click', async () => {
    const nome = $('#cf_nome').value.trim();
    if (!nome) return recado('#cf_msg', 'Escreva o seu nome antes de salvar.', false);
    const btn = $('#cf_salvar'); btn.disabled = true;
    try {
      state.perfil = await api('PUT', '/perfil', { nome });
      aplicarPerfilNaTela();
      recado('#cf_msg', 'Nome salvo.', true);
      toast('Nome atualizado');
    } catch (e) { recado('#cf_msg', 'Não consegui salvar: ' + e.message, false); }
    finally { btn.disabled = false; }
  });

  // A troca de senha fala direto com o Supabase Auth, igual ao Atendimento.
  $('#cf_trocar').addEventListener('click', async () => {
    const s1 = $('#cf_s1').value, s2 = $('#cf_s2').value;
    if (s1.length < 8) return recado('#cf_msg2', 'A senha precisa ter pelo menos 8 caracteres.', false);
    if (s1 !== s2)     return recado('#cf_msg2', 'As duas senhas não são iguais. Confira e tente de novo.', false);
    if (!sb)           return recado('#cf_msg2', 'Conexão com o Supabase não configurada.', false);
    const btn = $('#cf_trocar'); btn.disabled = true;
    try {
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) throw new Error(error.message);
      $('#cf_s1').value = ''; $('#cf_s2').value = '';
      recado('#cf_msg2', 'Senha trocada. Use a nova da próxima vez que entrar.', true);
      toast('Senha alterada');
    } catch (e) { recado('#cf_msg2', 'Não consegui trocar: ' + e.message, false); }
    finally { btn.disabled = false; }
  });
}

async function cfgOficina(box) {
  const [empresa, janelas] = await Promise.all([
    api('GET', '/empresa'), api('GET', '/janelas'),
  ]);
  box.innerHTML = `
    <div class="cols">
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.loja)} Dados da oficina</h2></div>
        <div class="panel-body">
          <small class="muted">É o que aparece no topo desta tela e no convite do Google Agenda.</small>
          <div class="field"><label>Nome *</label>
            <input id="of_nome" value="${esc(empresa.nome)}" placeholder="IndyCar Centro Automotivo"></div>
          <div class="field"><label>Endereço</label>
            <input id="of_end" value="${esc(empresa.endereco)}" placeholder="Av. Bandeirantes, 875 — Taubaté/SP"></div>
          <div class="field"><label>Slogan</label>
            <input id="of_slogan" value="${esc(empresa.slogan)}" placeholder="Quem conhece, indica!"></div>
          <div class="field"><label>Telefone</label>
            <input id="of_tel" value="${esc(empresa.telefone)}" placeholder="12 99999-9999"></div>
          <div><button class="btn primary" id="of_salvar">${svg(I.check)} Salvar dados</button></div>
          <p class="form-msg" id="of_msg" hidden></p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>${svg(I.relogio)} Janelas de agendamento</h2>
          <span class="badge-pill bp-gray">${janelas.length} janelas</span></div>
        <div class="panel-body">
          <div class="aviso-leitura">${svg(I.bot)}
            <div><b>É daqui que a IA tira o horário que oferece no WhatsApp.</b> Para cada tipo de
            serviço ela só propõe dia e hora dentro destas faixas. Fora delas, ela não agenda.
            Esta tabela é <b>só leitura</b> — a lista é a mesma para os três sistemas.</div></div>
          <div class="tabela-rolagem">
            <table class="table">
              <thead><tr><th>Tipo de serviço</th><th>Dias</th><th>Faixa de horário</th><th>Observação</th></tr></thead>
              <tbody>${janelas.length ? janelas.map(j => `<tr>
                <td><b>${esc(j.tipo_servico)}</b></td>
                <td><span class="badge-pill bp-gray">${esc(DIAS_LABEL[j.dias] || j.dias)}</span></td>
                <td>${esc(j.inicio)} — ${esc(j.fim)}</td>
                <td class="muted">${esc(j.observacao || '—')}</td>
              </tr>`).join('')
                : '<tr><td colspan="4" class="empty">Nenhuma janela cadastrada — a IA não tem horário para oferecer.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  $('#of_salvar').addEventListener('click', async () => {
    const nome = $('#of_nome').value.trim();
    if (!nome) return recado('#of_msg', 'A oficina precisa de um nome.', false);
    const btn = $('#of_salvar'); btn.disabled = true;
    try {
      await api('PUT', '/empresa', {
        nome,
        endereco: $('#of_end').value.trim(),
        slogan:   $('#of_slogan').value.trim(),
        telefone: $('#of_tel').value.trim(),
      });
      await loadEmpresa();                 // atualiza o cabeçalho na hora
      recado('#of_msg', 'Dados da oficina salvos.', true);
      toast('Dados da oficina salvos');
    } catch (e) { recado('#of_msg', 'Não consegui salvar: ' + e.message, false); }
    finally { btn.disabled = false; }
  });
}

/* ---------------------------------------------------------------------------
   EQUIPE E ACESSOS — quem consegue entrar
   Um cadastro só: a mesma conta abre a Agenda, o CRM e o Atendimento. Tirar o
   acesso não apaga nada, só fecha a porta.
   Todas as travas de verdade estão no servidor (só admin mexe; ninguém rebaixa
   nem desliga o último administrador). A tela apenas evita mostrar botão que
   não iria funcionar.
   --------------------------------------------------------------------------- */

/* O seletor oferece só Atendente e Administrador, que é o que o servidor
   aceita. Se alguém tiver outra função herdada (ex.: gestor), ela aparece como
   opção própria — assim a lista não mostra a pessoa como se fosse atendente. */
function opcoesDePapel(papel) {
  const conhecido = papel === 'admin' || papel === 'atendente' || papel === 'agenda';
  const outra = conhecido ? ''
    : `<option value="${esc(papel)}" selected>${esc(PAPEL_LABEL[papel] || papel || '—')}</option>`;
  return `${outra}
    <option value="atendente"${papel === 'atendente' ? ' selected' : ''}>Atendente</option>
    <option value="agenda"${papel === 'agenda' ? ' selected' : ''}>Só presença (agenda)</option>
    <option value="admin"${papel === 'admin' ? ' selected' : ''}>Administrador</option>`;
}

function linhaEquipe(p, souAdmin, meuId) {
  const souEu = p.id === meuId;
  const funcao = souAdmin
    ? `<select class="equipe-papel" data-papel="${esc(p.id)}"
               title="O que esta pessoa pode fazer">${opcoesDePapel(p.papel)}</select>`
    : `<span class="equipe-papel-txt">${esc(PAPEL_LABEL[p.papel] || p.papel || '—')}</span>`;
  // Ninguém tira o próprio acesso — o servidor recusa, então nem oferecemos.
  const botao = souAdmin && !souEu
    ? `<button class="btn" data-membro="${esc(p.id)}" data-ativar="${p.ativo ? '0' : '1'}">
         ${p.ativo ? 'Tirar acesso' : 'Devolver acesso'}</button>`
    : '';
  return `
    <div class="equipe-item${p.ativo ? '' : ' inativo'}">
      <span class="equipe-avatar">${esc(iniciais(p.nome) || '?')}</span>
      <div class="equipe-txt">
        <strong>${esc(p.nome || 'Sem nome')}</strong>${souEu ? ' <em class="voce">(você)</em>' : ''}
        <small>${esc(p.email || '—')}${p.ativo ? '' : ' · sem acesso'}</small>
      </div>
      ${funcao}${botao}
    </div>`;
}

async function cfgEquipe(box) {
  const { equipe, souAdmin, meuId } = await api('GET', '/equipe');
  box.innerHTML = `
    <div class="cols">
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.user)} Quem tem acesso</h2>
          <span class="badge-pill bp-gray">${equipe.length} ${equipe.length === 1 ? 'pessoa' : 'pessoas'}</span>
        </div>
        <div class="panel-body">
          <small class="muted">${souAdmin
            ? 'Administrador mexe em tudo, inclusive nesta lista; atendente usa o dia a dia e não '
              + 'cadastra ninguém. Tirar o acesso não apaga nada — a pessoa só deixa de entrar, e '
              + 'você pode devolver depois.'
            : 'Só o administrador vê a equipe inteira e mexe nos acessos. Abaixo está o seu cadastro.'}
          </small>
          <div class="equipe">${equipe.length
            ? equipe.map(p => linhaEquipe(p, souAdmin, meuId)).join('')
            : '<div class="empty">Ninguém cadastrado ainda.</div>'}</div>
          <p class="form-msg" id="eq_msg" hidden></p>
        </div>
      </div>

      ${souAdmin ? `
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.chave)} Dar acesso a alguém</h2></div>
        <div class="panel-body">
          <small class="muted">Você escolhe a senha e entrega para a pessoa — ela entra na hora e
            troca depois em Minha conta. O e-mail não precisa existir de verdade, mas não pode
            repetir o de outra pessoa.</small>
          <div class="field"><label>Nome</label>
            <input id="eq_nome" maxlength="80" placeholder="Ex.: Maria Souza" autocomplete="off"></div>
          <div class="field"><label>E-mail</label>
            <input id="eq_email" type="email" placeholder="maria@indycartaubate.com" autocomplete="off"></div>
          <div class="field"><label>Senha provisória</label>
            <input id="eq_senha" type="password" minlength="8" autocomplete="new-password"
                   placeholder="pelo menos 8 caracteres"></div>
          <div class="field"><label>Função</label>
            <select id="eq_papel">
              <option value="atendente" selected>Atendente</option>
              <option value="agenda">Só presença (agenda)</option>
              <option value="admin">Administrador</option>
            </select></div>
          <div><button class="btn primary" id="eq_criar">${svg(I.plus)} Criar acesso</button></div>
          <p class="form-msg" id="eq_msg2" hidden></p>
        </div>
      </div>` : ''}
    </div>`;

  /* Troca de função. O servidor recusa (409) rebaixar o último administrador:
     sem essa trava dá para se trancar para fora do próprio sistema, porque a
     tela de primeiro acesso não reabre enquanto existirem cadastros. */
  $$('select[data-papel]', box).forEach(sel => {
    sel.dataset.antes = sel.value;                  // para desfazer se o servidor recusar
    sel.addEventListener('change', async () => {
      sel.disabled = true;
      try {
        await api('POST', '/equipe/papel', { id: sel.dataset.papel, papel: sel.value });
        toast(sel.value === 'admin' ? 'Agora é administrador' : 'Agora é atendente');
        // mudar a PRÓPRIA função muda o que você enxerga: recarrega tudo
        if (sel.dataset.papel === meuId) { location.reload(); return; }
        await cfgEquipe(box);
      } catch (e) {
        sel.value = sel.dataset.antes;
        sel.disabled = false;
        recado('#eq_msg', e.message, false);
      }
    });
  });

  // Tirar / devolver o acesso de alguém
  $$('button[data-membro]', box).forEach(btn => btn.addEventListener('click', async () => {
    const devolver = btn.dataset.ativar === '1';
    if (!devolver && !confirm('Tirar o acesso desta pessoa? Ela não vai mais entrar na Agenda, '
        + 'no CRM nem no Atendimento. Nada é apagado e você pode devolver depois.')) return;
    btn.disabled = true;
    try {
      await api('POST', '/equipe/ativo', { id: btn.dataset.membro, ativo: devolver });
      toast(devolver ? 'Acesso devolvido' : 'Acesso removido');
      await cfgEquipe(box);
    } catch (e) { btn.disabled = false; recado('#eq_msg', e.message, false); }
  }));

  $('#eq_criar', box)?.addEventListener('click', async () => {
    const nome  = $('#eq_nome', box).value.trim();
    const email = $('#eq_email', box).value.trim().toLowerCase();
    const senha = $('#eq_senha', box).value;
    if (!nome)  return recado('#eq_msg2', 'Escreva o nome da pessoa.', false);
    if (!email) return recado('#eq_msg2', 'Escreva o e-mail que ela vai usar para entrar.', false);
    if (senha.length < 8) return recado('#eq_msg2', 'A senha precisa ter pelo menos 8 caracteres.', false);
    const btn = $('#eq_criar', box); btn.disabled = true;
    try {
      const r = await api('POST', '/equipe', { nome, email, senha, papel: $('#eq_papel', box).value });
      toast('Acesso criado');
      // Redesenha ANTES do recado: o redesenho limpa o formulário e levaria a
      // mensagem junto. E é ela que diz o que o administrador tem de entregar.
      await cfgEquipe(box);
      recado('#eq_msg2', r.aviso
        || `Pronto. Entregue a ${nome} o e-mail ${email} e a senha que você acabou de escolher.`,
        !r.aviso);
    } catch (e) { recado('#eq_msg2', e.message, false); btn.disabled = false; }
  });
}

// ============================================================================
// CONECTORES (instalar app, Google Agenda, webhook, exportações)
// ============================================================================
async function renderConectores() {
  const it = await api('GET', '/integracoes');
  const icsUrl = location.origin + '/api/agenda.ics?t=' + encodeURIComponent(it.ics_token || '');
  view.innerHTML = `
    <div class="cols">
      <div class="panel"><div class="panel-head"><h2>📱 Instalar como aplicativo</h2></div>
        <div class="panel-body">
          <div class="tpl"><div class="tpl-body">Use o IndyCar como <b>app de verdade</b> no celular e no computador: ícone próprio, tela cheia e abertura rápida.</div></div>
          <button class="btn primary" id="cn_install">📲 Instalar aplicativo</button>
          <small class="muted">Se o botão não fizer nada: no <b>Chrome (PC)</b> use o ícone de instalação na barra de endereço; no <b>Android</b>: menu ⋮ → "Adicionar à tela inicial"; no <b>iPhone</b>: Compartilhar → "Adicionar à Tela de Início".</small>
        </div></div>
      <div class="panel"><div class="panel-head"><h2>📅 Google Agenda</h2></div>
        <div class="panel-body">
          <div class="field"><label>URL do calendário (assine no Google Agenda)</label>
            <input id="cn_ics" value="${esc(icsUrl)}" readonly onclick="this.select()"></div>
          <div style="display:flex;gap:8px">
            <button class="btn primary" id="cn_copy">📋 Copiar URL</button>
            <a class="btn" href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener">Abrir Google Agenda</a>
          </div>
          <div class="tpl"><div class="tpl-body"><b>Como conectar (1 vez):</b>
1. Copie a URL acima.
2. No Google Agenda → ⚙️ Configurações → <b>Adicionar agenda → Do URL</b>.
3. Cole e clique em <b>Adicionar agenda</b>. ✅
Todos os agendamentos aparecem na sua agenda Google e <b>se atualizam sozinhos</b> (o Google sincroniza periodicamente).</div></div>
        </div></div>
    </div>
    <div class="cols">
      <div class="panel"><div class="panel-head"><h2>🔗 Webhook de saída (Zapier · Make · n8n)</h2></div>
        <div class="panel-body">
          <div class="field"><label class="switch"><input type="checkbox" id="cn_whk_on" ${it.webhook_ativo?'checked':''}> <span>Enviar eventos para outro sistema</span></label>
            <small class="muted">Dispara um POST JSON quando um agendamento é <b>criado</b> ou muda de <b>status</b>. Ligue em Zapier/Make/n8n e conecte a milhares de apps (planilhas, e-mail, CRM…).</small></div>
          <div class="field"><label>URL do webhook</label><input id="cn_whk" value="${esc(it.webhook_url||'')}" placeholder="https://hooks.zapier.com/..."></div>
          <div style="display:flex;gap:8px">
            <button class="btn primary" id="cn_whk_save">${svg(I.check)} Salvar</button>
            <button class="btn" id="cn_whk_test">${svg(I.send)} Testar</button>
          </div>
          <div id="cn_whk_result"></div>
        </div></div>
      <div class="panel"><div class="panel-head"><h2>📤 Exportar dados</h2></div>
        <div class="panel-body">
          <div class="tpl"><div class="tpl-body">Baixe seus dados em <b>CSV</b> (abre direto no Excel/Planilhas Google).</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn primary" href="/api/export/agendamentos.csv" download>📥 Agendamentos (CSV)</a>
            <a class="btn" href="/api/export/clientes.csv" download>📥 Clientes (CSV)</a>
          </div>
          <small class="muted">Outros conectores já ativos: <b>WhatsApp + IA Carlos</b> (CodeWords) na aba WHATSAPP, e importação automática de agendamentos.</small>
        </div></div>
    </div>`;

  $('#cn_copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(icsUrl); toast('URL copiada ✅'); }
    catch { $('#cn_ics').select(); document.execCommand('copy'); toast('URL copiada ✅'); }
  });
  $('#cn_install').addEventListener('click', async () => {
    if (state.installPrompt) { state.installPrompt.prompt(); const r = await state.installPrompt.userChoice;
      if (r.outcome === 'accepted') { toast('Aplicativo instalado! 🏁'); state.installPrompt = null; } }
    else toast('Use o menu do navegador para instalar (veja a dica abaixo do botão)', 'err');
  });
  $('#cn_whk_save').addEventListener('click', async () => {
    try { await api('PUT','/integracoes',{ webhook_url: $('#cn_whk').value.trim(), webhook_ativo: $('#cn_whk_on').checked });
      toast('Webhook salvo ✅'); } catch(e){ toast(e.message,'err'); }
  });
  $('#cn_whk_test').addEventListener('click', async () => {
    const r = $('#cn_whk_result'); r.innerHTML = '<div class="muted" style="margin-top:8px">Testando…</div>';
    try { const res = await api('POST','/integracoes/testar-webhook',{ webhook_url: $('#cn_whk').value.trim() });
      r.innerHTML = res.ok
        ? `<div class="tpl" style="margin-top:8px;border-color:rgba(34,197,94,.4)"><div class="tpl-body">✅ Webhook respondeu (HTTP ${res.status}).</div></div>`
        : `<div class="tpl" style="margin-top:8px;border-color:rgba(230,25,46,.4)"><div class="tpl-body">❌ ${esc(res.erro || ('HTTP ' + res.status))}</div></div>`;
    } catch(e){ r.innerHTML = `<div class="tpl" style="margin-top:8px;border-color:rgba(230,25,46,.4)"><div class="tpl-body">❌ ${esc(e.message)}</div></div>`; }
  });
}

// ============================================================================
// WHATSAPP
// ============================================================================
async function renderWhatsapp() {
  if (state._cxTimer) { clearInterval(state._cxTimer); state._cxTimer = null; }
  const tab = state.waTab || 'config';
  const cfg = await api('GET', '/whatsapp/config');
  const badge = cfg.ativo
    ? '<span class="badge-pill bp-green">Cloud API ativa</span>'
    : '<span class="badge-pill bp-orange">Modo link (wa.me)</span>';
  view.innerHTML = `
    <div class="toolbar">
      <div class="left"><h2 style="font-size:18px;display:flex;align-items:center;gap:8px;color:#25d366">${svg(I.wa)} WhatsApp</h2>${badge}</div>
      <button class="btn green" onclick="openWhatsappModal()">${svg(I.send)} Enviar mensagem</button>
    </div>
    <div class="tabs">
      <button class="tab ${tab==='config'?'active':''}" data-tab="config">${svg(I.gear)} Configuração</button>
      <button class="tab ${tab==='conexao'?'active':''}" data-tab="conexao">${svg(I.phone)} Conexão</button>
      <button class="tab ${tab==='ia'?'active':''}" data-tab="ia">${svg(I.bot)} Integração</button>
      <button class="tab ${tab==='modelos'?'active':''}" data-tab="modelos">${svg(I.edit)} Modelos</button>
      <button class="tab ${tab==='mensagens'?'active':''}" data-tab="mensagens">${svg(I.wa)} Mensagens</button>
    </div>
    <div id="waContent">${esqueletoFormulario()}</div>`;
  $$('.tab', view).forEach(b => b.addEventListener('click', () => { state.waTab = b.dataset.tab; renderWhatsapp(); }));
  const box = $('#waContent');
  if (tab === 'config') await waConfig(box, cfg);
  else if (tab === 'conexao') await waConexao(box);
  else if (tab === 'ia') await waIA(box);
  else if (tab === 'modelos') await waModelos(box);
  else await waMensagens(box);
}

/* Tela de conexão — SÓ MOSTRA, não conecta.
   Antes daqui saía um QR e dava para cadastrar um Device ID próprio. Com o
   painel de atendimento fazendo o mesmo, dava para acabar com dois aparelhos
   diferentes e ninguém sabia qual valia. E o CodeWords aposentou o QR: agora
   é código de pareamento. Quem conecta é o atendimento; aqui é vitrine. */
async function waConexao(box) {
  box.innerHTML = `
    <div class="wa-grid">
      <div class="panel"><div class="panel-head"><h2>${svg(I.phone)} WhatsApp da empresa</h2>
        <span class="badge-pill bp-gray" id="cx_status">—</span></div>
        <div class="panel-body" style="align-items:center;text-align:center">
          <div id="cx_qr" style="padding:22px 14px;width:100%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700">
            <span style="color:#888">Verificando…</span>
          </div>
          <div id="cx_info" class="muted" style="font-size:12.5px;margin-top:4px;max-width:340px">
            É por este número que o lembrete e o aviso de falta saem.
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn" id="cx_refresh">Verificar agora</button>
          </div>
        </div></div>
      <div class="panel"><div class="panel-head"><h2>${svg(I.gear)} Onde se reconecta</h2></div>
        <div class="panel-body">
          <p style="margin:0 0 10px;font-size:13.5px;line-height:1.6">
            A conexão do WhatsApp é feita num lugar só: o <b>painel de atendimento</b>.
            Se ela fosse feita aqui também, daria para acabar com dois aparelhos
            conectados e mensagens saindo por linhas diferentes.
          </p>
          <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6">
            Lá em <b>Configurações › Equipe e sistema › Conexão do WhatsApp</b>,
            o botão <b>Reconectar WhatsApp</b> gera um código de 8 letras para
            digitar no celular da oficina.
          </p>
          <a class="btn primary" href="https://indycar-atendimento.onrender.com" target="_blank" rel="noopener">
            ${svg(I.wa)} Abrir o painel de atendimento
          </a>
          <div class="tpl" style="margin-top:14px"><div class="tpl-body"><b>Status:</b> <span id="cx_status2">—</span></div></div>
        </div></div>
    </div>`;

  const setStatus = (txt, cls) => {
    const a = $('#cx_status'); a.textContent = txt; a.className = 'badge-pill ' + cls;
    const b = $('#cx_status2'); if (b) b.textContent = txt;
  };
  const painel = (html) => { $('#cx_qr').innerHTML = html; };

  async function tick() {
    try {
      const s = await api('GET','/whatsapp/conexao');
      if (!s.configurado) {
        setStatus('não configurado','bp-orange');
        $('#cx_info').textContent = s.erro || 'Falta a chave do CodeWords (aba IA).';
        painel('<span style="color:#888">—</span>');
        return;
      }
      if (!s.ok) {
        setStatus('erro','bp-red');
        $('#cx_info').textContent = s.erro || 'Erro ao consultar.';
        painel('<span style="color:#888">—</span>');
        return;
      }
      if (s.conectado && s.recebendo) {
        setStatus('conectado ✅','bp-green');
        painel(`<span style="color:#16a34a">✅ ${esc(s.numero||'')} conectado</span>`);
        $('#cx_info').textContent = 'Lembretes e avisos de falta saem por este número.';
        return;
      }
      /* Pareado sem inscrição é o pior caso: parece ligado e não recebe nada.
         Merece cor de alerta, não de sucesso. */
      if (s.conectado) {
        setStatus('sem receber','bp-orange');
        painel('<span style="color:#d97706">⚠ Conectado, mas não está recebendo</span>');
        $('#cx_info').textContent = s.aviso || 'Religue no painel de atendimento.';
        return;
      }
      setStatus('desconectado','bp-red');
      painel('<span style="color:#dc2626">✖ WhatsApp desconectado</span>');
      $('#cx_info').textContent = s.onde_reconectar
        ? `Reconecte em: ${s.onde_reconectar}`
        : 'Reconecte pelo painel de atendimento.';
    } catch(e) { setStatus('erro','bp-red'); }
  }

  $('#cx_refresh').addEventListener('click', () => tick());

  tick();
  /* De 30 em 30s. Antes era de 4 em 4 porque estava esperando um QR ser lido;
     agora é só acompanhamento e não vale bater no CodeWords o tempo todo. */
  state._cxTimer = setInterval(tick, 30000);
}

async function waConfig(box, cfg) {
  const webhook = location.origin + '/api/whatsapp/webhook';
  box.innerHTML = `
    <div class="cols">
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.gear)} Credenciais da Cloud API (Meta)</h2></div>
        <div class="panel-body">
          <div class="field"><label class="switch"><input type="checkbox" id="cfg_ativo" ${cfg.ativo?'checked':''}> <span>Enviar mensagens automaticamente pela Cloud API</span></label>
            <small class="muted">Desligado: o sistema registra a mensagem e abre o WhatsApp pelo link <b>wa.me</b>.</small></div>
          <div class="field"><label>Phone Number ID *</label><input id="cfg_pnid" value="${esc(cfg.phone_number_id||'')}" placeholder="Ex.: 123456789012345"></div>
          <div class="field"><label>Access Token ${cfg.tem_token?`<span class="chip">salvo: ${esc(cfg.token_mask)}</span>`:''} *</label>
            <input id="cfg_token" type="password" autocomplete="off" placeholder="${cfg.tem_token?'•••• deixe em branco para manter o atual':'Cole o token permanente'}"></div>
          <div class="grid2">
            <div class="field"><label>Business Account ID (WABA)</label><input id="cfg_waba" value="${esc(cfg.business_account_id||'')}"></div>
            <div class="field"><label>Versão da API</label><input id="cfg_ver" value="${esc(cfg.api_version||'v21.0')}"></div>
          </div>
          <div class="field"><label>Número exibido</label><input id="cfg_num" value="${esc(cfg.numero_exibicao||'')}" placeholder="+55 12 99999-0000"></div>
          <div style="display:flex;gap:10px;margin-top:4px">
            <button class="btn primary" id="cfg_save">${svg(I.check)} Salvar</button>
            <button class="btn green" id="cfg_test">${svg(I.send)} Testar conexão</button>
          </div>
          <div id="cfg_result"></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.wa)} Webhook & ajuda</h2></div>
        <div class="panel-body">
          <div class="field"><label>URL do Webhook (cole na Meta)</label>
            <input id="cfg_webhook" value="${esc(webhook)}" readonly onclick="this.select()"></div>
          <div class="field"><label>Token de verificação</label><input id="cfg_verify" value="${esc(cfg.verify_token||'indycar')}"></div>
          <!-- Lembretes de agendamento saíram daqui (09/10): quem manda é o Comunicar,
               com a régua dele e o "aceita mensagens" de cada cliente. -->
          <div class="aviso-leitura" style="margin-top:4px">${svg(I.send)}
            <div><b>Lembretes de agendamento são do Comunicar.</b> A régua (quando avisar, o
            texto, quem pediu para não receber) fica lá — aqui o cartão só mostra
            "lembrete enviado" e "respondeu 👍".
            <a href="https://indycar-posvenda.onrender.com" target="_blank" rel="noopener">Abrir o Comunicar</a></div></div>
          <div class="tpl"><div class="tpl-body"><b>Como conectar em 5 passos:</b>
1. Crie um app no <b>Meta for Developers</b> e ative o produto <b>WhatsApp</b>.
2. Copie o <b>Phone Number ID</b> e gere um <b>Access Token</b> permanente.
3. Cole ao lado, marque "Enviar pela Cloud API" e clique em <b>Salvar</b>.
4. Em <i>WhatsApp › Configuração › Webhooks</i>, use a URL e o token acima.
5. Assine o campo <b>messages</b>. Teste a conexão. ✅</div></div>
          <small class="muted">O webhook exige que o app esteja acessível pela internet (deploy ou túnel, ex.: ngrok).</small>
        </div>
      </div>
    </div>`;
  $('#cfg_save').addEventListener('click', async () => {
    const p = { ativo:$('#cfg_ativo').checked, phone_number_id:$('#cfg_pnid').value.trim(),
      access_token:$('#cfg_token').value.trim(), business_account_id:$('#cfg_waba').value.trim(),
      api_version:$('#cfg_ver').value.trim()||'v21.0', verify_token:$('#cfg_verify').value.trim()||'indycar',
      numero_exibicao:$('#cfg_num').value.trim() };
    if (p.ativo && (!p.phone_number_id || (!p.access_token && !cfg.tem_token)))
      return toast('Para ativar a Cloud API, informe Phone Number ID e Access Token','err');
    try { await api('PUT','/whatsapp/config',p); toast('Configuração salva ✅'); renderWhatsapp(); }
    catch(e){ toast(e.message,'err'); }
  });
  $('#cfg_test').addEventListener('click', async () => {
    const r = $('#cfg_result'); r.innerHTML = '<div class="muted" style="margin-top:12px">Testando conexão…</div>';
    try {
      const res = await api('POST','/whatsapp/testar',{ phone_number_id:$('#cfg_pnid').value.trim(),
        access_token:$('#cfg_token').value.trim(), api_version:$('#cfg_ver').value.trim()||'v21.0' });
      r.innerHTML = res.ok
        ? `<div class="tpl" style="margin-top:12px;border-color:rgba(34,197,94,.45)"><div class="tpl-body">✅ <b>Conectado!</b> Número: ${esc(res.numero||'—')}${res.nome?` · ${esc(res.nome)}`:''}${res.qualidade?` · qualidade ${esc(res.qualidade)}`:''}</div></div>`
        : `<div class="tpl" style="margin-top:12px;border-color:rgba(230,25,46,.45)"><div class="tpl-body">❌ <b>Falhou:</b> ${esc(res.erro)}</div></div>`;
    } catch(e){ r.innerHTML = `<div class="tpl" style="margin-top:12px;border-color:rgba(230,25,46,.45)"><div class="tpl-body">❌ ${esc(e.message)}</div></div>`; }
  });
}

async function waModelos(box) {
  const templates = await api('GET','/whatsapp/templates');
  box.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Modelos de mensagem</h2>
      <button class="btn" onclick="openTemplateModal()">${svg(I.plus)} Novo modelo</button></div>
      <div class="panel-body">
        ${templates.map(t => `<div class="tpl" data-id="${t.id}">
          <div class="tpl-head"><strong>${esc(t.nome)}</strong><span class="chip">${esc(t.gatilho)}</span></div>
          <div class="tpl-body">${esc(t.corpo)}</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn" data-act="usar">${svg(I.send)} Usar</button>
            <button class="icon-btn" data-act="edit" title="Editar" aria-label="Editar modelo ${esc(t.nome)}">${svg(I.edit)}</button>
            <button class="icon-btn red" data-act="del" title="Excluir" aria-label="Excluir modelo ${esc(t.nome)}">${svg(I.trash)}</button>
          </div></div>`).join('')}
      </div></div>`;
  $$('.tpl[data-id]', box).forEach(el => {
    const id = el.dataset.id; // uuid (string)
    el.querySelector('[data-act="usar"]')?.addEventListener('click', () => openWhatsappModal(null, null, id));
    el.querySelector('[data-act="edit"]')?.addEventListener('click', () => openTemplateModal(id));
    el.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
      if (!confirm('Excluir modelo?')) return;
      try { await api('DELETE', `/whatsapp/templates/${id}`); toast('Modelo excluído'); waModelos(box); }
      catch (e) { toast(e.message, 'err'); }
    });
  });
}

async function waMensagens(box) {
  const msgs = await api('GET','/whatsapp/mensagens');
  box.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Histórico de mensagens</h2><span class="date">${msgs.length} registros</span></div>
      <div class="panel-body" style="gap:0">
        ${msgs.length ? msgs.map(m => `
          <div class="msg ${m.direcao}">
            <div class="dir">${m.direcao==='saida'?'↗':'↙'}</div>
            <div class="c"><div class="who">${esc(m.nome||m.telefone)} <span class="muted">· ${m.direcao==='saida'?'saída':'entrada'}</span></div>
              <div class="txt">${esc(m.corpo)}</div>
              <div class="meta">${esc(dataHoraBR(m.created_at))} · ${statusMsg(m.status)}${m.erro?` · ${esc(m.erro)}`:''}</div></div>
          </div>`).join('') : '<div class="empty">Nenhuma mensagem ainda.</div>'}
      </div></div>`;
}
function statusMsg(s){ return {enviado:'enviado ✅',entregue:'entregue ✅✅',lido:'lido 👁️',recebido:'recebido',falhou:'falhou ❌',pendente:'pendente'}[s]||s; }
async function waIA(box) {
  const cfg = await api('GET','/whatsapp/ia/config');
  box.innerHTML = `
    <div class="wa-grid">
      <div class="panel"><div class="panel-head"><h2>${svg(I.bot)} Integração WhatsApp (CodeWords)</h2>
        <span class="badge-pill ${cfg.tem_cw_chave?'bp-green':'bp-orange'}">${cfg.tem_cw_chave?'Configurada':'Falta a chave'}</span></div>
        <div class="panel-body">
          <div class="tpl" style="border-color:rgba(37,211,102,.35)"><div class="tpl-body">🟢 <b>Como funciona:</b> a IA já cadastrada no seu WhatsApp atende os clientes. A Agenda faz 3 coisas:
1. <b>Puxa os agendamentos</b> que a IA fecha e coloca na agenda (sozinha).
2. No <b>"Não veio"</b>, manda o <b>aviso de falta</b> na hora, pelo WhatsApp da empresa.
3. Mostra a <b>conexão do número</b> (aba Conexão).
Lembrete, aniversário e revisão são do <b>Comunicar</b>.</div></div>
          <div class="field"><label>Chave do CodeWords ${cfg.tem_cw_chave?`<span class="chip">salva: ${esc(cfg.cw_chave_mask)}</span>`:''}</label>
            <input id="cw_key" type="password" autocomplete="off" placeholder="${cfg.tem_cw_chave?'•••• deixe em branco para manter':'cwk-...'}"></div>
          <div class="field"><label>Workflow do atendente (vincula o número)</label><input id="cw_sid" value="${esc(cfg.cw_service_id||'')}" placeholder="indycar_carlos_whatsapp_..."></div>
          <div class="field"><label>Workflow do banco de agendamentos (importação)</label><input id="cw_db" value="${esc(cfg.cw_db_service_id||'')}" placeholder="indycar_agendamentos_db_..."></div>
          <div class="field"><label>Workflow de follow-up de ausência (IA)</label><input id="cw_noshow" value="${esc(cfg.cw_noshow_service_id||'')}" placeholder="indycar_noshow_notifier_..."></div>
          <div class="field"><label>Base URL</label><input id="cw_base" value="${esc(cfg.cw_base_url||'https://runtime.codewords.ai')}"></div>
          <button class="btn primary" id="ia_save">${svg(I.check)} Salvar</button>
        </div></div>
      <div class="panel"><div class="panel-head"><h2>${svg(I.calendar)} Agendamentos da IA</h2></div>
        <div class="panel-body">
          <div class="tpl"><div class="tpl-body">Os agendamentos que a IA fecha no WhatsApp entram <b>sozinhos</b> na agenda (a cada poucos minutos e sempre que o painel abre). Se quiser forçar agora:</div></div>
          <button class="btn green" id="cw_sync">${svg(I.calendar)} Sincronizar agendamentos agora</button>
          <div id="cw_sync_result"></div>
          <small class="muted" style="display:block;margin-top:10px">O aviso de falta aparece na aba <b>Mensagens</b> sempre que você marcar <b>Não veio</b> — com "enviado" ou o motivo da falha.</small>
        </div></div>
    </div>`;

  $('#ia_save').addEventListener('click', async () => {
    const p = { motor:'codewords', ativo:false,
      cw_api_key:$('#cw_key').value.trim(), cw_service_id:$('#cw_sid').value.trim(),
      cw_db_service_id:$('#cw_db').value.trim(), cw_noshow_service_id:$('#cw_noshow').value.trim(),
      cw_base_url:$('#cw_base').value.trim()||'https://runtime.codewords.ai' };
    try { await api('PUT','/whatsapp/ia/config',p); toast('Integração salva ✅'); renderWhatsapp(); }
    catch(e){ toast(e.message,'err'); }
  });
  $('#cw_sync').addEventListener('click', async () => {
    const r = $('#cw_sync_result'); r.innerHTML = '<div class="muted" style="margin-top:8px">Sincronizando…</div>';
    try {
      const res = await api('POST','/codewords/importar', {});
      r.innerHTML = res.ok
        ? `<div class="tpl" style="margin-top:8px;border-color:rgba(34,197,94,.4)"><div class="tpl-body">✅ ${res.importados} novo(s) de ${res.encontrados} encontrado(s).</div></div>`
        : `<div class="tpl" style="margin-top:8px;border-color:rgba(230,25,46,.4)"><div class="tpl-body">❌ ${esc(res.erro)}</div></div>`;
      if (res.ok && res.importados) toast(`${res.importados} agendamento(s) importado(s)`);
    } catch(e){ r.innerHTML = `<div class="tpl" style="margin-top:8px;border-color:rgba(230,25,46,.4)"><div class="tpl-body">❌ ${esc(e.message)}</div></div>`; }
  });
}

// ============================================================================
// MODAIS
// ============================================================================
const overlay = $('#modalOverlay'), modal = $('#modal');
const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let _focoAntes = null;
/* Abre o modal, leva o foco para o primeiro campo e devolve o foco a quem o
   abriu quando fechar. O Tab fica PRESO dentro do modal (ver tecla abaixo). */
function openModal(html){
  _focoAntes = document.activeElement;
  modal.innerHTML = html;
  overlay.classList.add('open');
  const titulo = $('.modal-head h3', modal);
  if (titulo) { titulo.id = 'modalTitulo'; modal.setAttribute('aria-labelledby', 'modalTitulo'); }
  $$('.modal-close', modal).forEach(b => { if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'Fechar'); });
  // o prefixo vale para CADA seletor da lista (senão só o primeiro ganhava o ".modal-body")
  const noCorpo = FOCAVEIS.split(',').map(s => '.modal-body ' + s).join(',');
  const primeiro = $$(noCorpo, modal).find(el => el.offsetParent !== null) || $('.modal-close', modal);
  setTimeout(() => primeiro?.focus({ preventScroll: true }), 30);
}
function closeModal(){
  if (!overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  if (_focoAntes && _focoAntes.isConnected && typeof _focoAntes.focus === 'function') _focoAntes.focus({ preventScroll: true });
  _focoAntes = null;
}
const modalAberto = () => overlay.classList.contains('open');
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
// Tab dentro do modal: do último campo volta ao primeiro (e vice-versa com Shift)
overlay.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !modalAberto()) return;
  const itens = $$(FOCAVEIS, modal).filter(el => el.offsetParent !== null);
  if (!itens.length) return;
  const i = itens.indexOf(document.activeElement);
  if (e.shiftKey && (i <= 0)) { e.preventDefault(); itens[itens.length - 1].focus(); }
  else if (!e.shiftKey && (i === -1 || i === itens.length - 1)) { e.preventDefault(); itens[0].focus(); }
});

/* Mini-ficha do cliente dentro do modal de agendamento: última visita, próxima
   revisão prevista e aniversário — o que ajuda quem está marcando o horário. */
function fichaMiniHtml(f) {
  if (!f) return '';
  const hoje = agoraSP().data;
  const pedacos = [];
  if (f.ultima_visita) pedacos.push(`<span>${svg(I.check)} Última visita <b>${esc(dataBR(f.ultima_visita.data))}</b> · ${esc(f.ultima_visita.servico)}</span>`);
  else pedacos.push(`<span>${svg(I.user)} <b>Primeira visita</b> — ainda não tem serviço concluído aqui</span>`);
  if (f.proxima_revisao) {
    const atrasada = f.proxima_revisao.data < hoje;
    pedacos.push(`<span class="${atrasada ? 'alerta' : ''}">${svg(I.relogio)} ${esc(f.proxima_revisao.rotulo)} prevista <b>${esc(dataBR(f.proxima_revisao.data))}</b>${atrasada ? ' (já passou)' : ''}</span>`);
  }
  if (f.nascimento) {
    const dias = diasParaAniversario(f.nascimento, hoje);
    pedacos.push(`<span>${svg(I.bolo)} Aniversário <b>${esc(f.nascimento_tela)}</b>${dias === 0 ? ' — é HOJE 🎉' : dias !== null && dias <= 7 ? ` — em ${dias} dia${dias === 1 ? '' : 's'}` : ''}</span>`);
  }
  if (f.aceita_mensagens === 0) pedacos.push(`<span class="alerta">${svg(I.sino_off)} Não recebe mensagem automática</span>`);
  return `<div class="ficha-mini">${pedacos.join('')}
    <button type="button" class="btn mini" data-ficha="${esc(f.id)}">${svg(I.user)} Abrir ficha</button></div>`;
}

function fieldsConsultorOptions(sel){
  return state.consultores.map(c => `<option value="${c.id}" ${c.id==sel?'selected':''}>${esc(c.nome)}</option>`).join('');
}

/* ============================================================================
   RODADA 2 — planejamento no modal, contexto do cliente, remarcar, busca global
   (as regras puras moram em planejamento.js › window.Planejamento)
   ============================================================================ */
const P = window.Planejamento;
/** Quantos carros a recepção atende na mesma meia hora: consultores ativos (mínimo 1). */
const capacidadeRecepcao = () => Math.max(1, (state.consultores || []).filter(c => c.ativo !== 0 && c.ativo !== false).length);
/** Agendamentos de um dia, guardados por 30 s (o modal pergunta a cada troca de data). */
const _doDia = new Map();
async function agendamentosDoDia(data) {
  const m = _doDia.get(data);
  if (m && m.ate > Date.now()) return m.lista;
  const lista = await api('GET', '/agendamentos?data=' + encodeURIComponent(data));
  _doDia.set(data, { lista, ate: Date.now() + 30_000 });
  return lista;
}
const esquecerDias = () => _doDia.clear();

/* Rótulo curto de uma sugestão: "Hoje 14:00", "Amanhã 08:00", "sex 10/10 09:30". */
const rotuloSugestao = (s) => `${rotuloDia(s.data, agoraSP().data)} ${s.hora}`;

/** Busca as sugestões de horário livre e desenha os botões; clicar preenche data e hora. */
async function desenharSugestoes(box, { data, consultor_id, ignorar, aoEscolher }) {
  box.innerHTML = '<span class="muted">Procurando horários livres…</span>';
  try {
    const qs = new URLSearchParams();
    if (data) qs.set('data', data);
    if (consultor_id) qs.set('consultor_id', consultor_id);
    if (ignorar) qs.set('ignorar', ignorar);
    const r = await api('GET', '/horarios-livres?' + qs);
    if (!box.isConnected) return;
    if (!r.sugestoes?.length) { box.innerHTML = '<span class="muted">Nenhum horário livre nos próximos 14 dias. Escolha à mão.</span>'; return; }
    box.innerHTML = r.sugestoes.map((s, i) => `<button type="button" class="chip-sugestao" data-i="${i}"
        aria-label="Usar ${esc(dataBR(s.data))} às ${esc(s.hora)}">${esc(rotuloSugestao(s))}</button>`).join('')
      + `<small class="muted">seg–sáb, 8h–17h · ${r.capacidade} ${r.capacidade === 1 ? 'carro' : 'carros'} por meia hora</small>`;
    $$('.chip-sugestao', box).forEach(b => b.addEventListener('click', () => {
      $$('.chip-sugestao', box).forEach(x => x.classList.toggle('ativo', x === b));
      aoEscolher(r.sugestoes[+b.dataset.i]);
    }));
  } catch (e) { if (box.isConnected) box.innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
}

/* No modal de agendamento: duração estimada, aviso de conflito e "✨ Sugerir horário". */
function ligarPlanejamentoNoModal(id, servicos) {
  const tabela = P.tabelaDuracoes(servicos);
  let vez = 0;
  const conferir = async () => {
    const dur = $('#f_duracao'), conf = $('#f_conflito');
    if (!dur || !conf) return;
    const serv = $('#f_serv').value.trim();
    dur.hidden = !serv;
    if (serv) dur.textContent = `⏱ Duração estimada: ~${P.duracao(serv, tabela)} min (só para organizar a oficina)`;
    const atual = { id, data: $('#f_data').value, hora: $('#f_hora').value, consultor_id: $('#f_cons').value, status: $('#f_status').value };
    if (!atual.data || !atual.hora) { conf.hidden = true; return; }
    const minha = ++vez;
    let lista = [];
    try { lista = await agendamentosDoDia(atual.data); } catch { return; }
    if (minha !== vez || !conf.isConnected) return;
    const c = P.conflitos(lista, atual, capacidadeRecepcao());
    conf.hidden = !c.length;
    if (c.length) $('span', conf).textContent = `Horário disputado: ${c.map(x => `${x.hora} ${x.cliente_nome}${x.consultor_nome ? ' (' + x.consultor_nome + ')' : ''}`).join('; ')}. Pode salvar mesmo assim.`;
  };
  const deb = debounce(conferir, 200);
  ['f_data', 'f_hora', 'f_cons', 'f_status'].forEach(k => $('#' + k).addEventListener('change', deb));
  $('#f_hora').addEventListener('input', deb);
  $('#f_serv').addEventListener('input', deb);
  conferir();
  $('#f_sugerir').addEventListener('click', () => desenharSugestoes($('#f_sugestoes'), {
    data: $('#f_data').value, consultor_id: $('#f_cons').value, ignorar: id,
    aoEscolher: (s) => {
      $('#f_data').value = s.data; $('#f_hora').value = s.hora;
      $('#f_data').dispatchEvent(new Event('change')); $('#f_hora').dispatchEvent(new Event('input'));
      toast(`Horário escolhido: ${dataBR(s.data)} às ${s.hora}`);
    },
  }));
}

/* Rótulo e cor do que aconteceu com uma mensagem do Comunicar. */
function seloEnvio(e) {
  if (e.resposta_tipo === 'positiva') return ['bp-green', 'respondeu 👍'];
  if (e.resposta_tipo === 'negativa') return ['bp-orange', 'respondeu 👎'];
  if (e.resposta_tipo === 'parar') return ['bp-red', 'pediu p/ parar'];
  if (e.resposta) return ['bp-blue', 'respondeu'];
  if (e.status === 'falhou') return ['bp-red', 'falhou'];
  if (['pendente', 'agendado', 'fila'].includes(e.status)) return ['bp-gray', 'na fila'];
  if (e.status === 'pulado') return ['bp-gray', 'pulado'];
  return ['bp-blue', e.status || 'enviado'];
}

/**
 * Bloco "contexto do cliente" (modal de agendamento e ficha): histórico na
 * Agenda, mensagens automáticas do Comunicar com as respostas e os links para
 * Atendimento / CRM / Comunicar. Nada aqui segura o modal: carrega depois.
 *   o.excluir = id do agendamento aberto (não se repete no histórico)
 *   o.comAgendar = mostra "Agendar de novo" (na ficha)
 */
async function contextoDoCliente(box, o = {}) {
  if (!box) return;
  const tel = P.telefone(o.telefone);
  const cid = P.ehUuid(o.cliente_id || '') ? o.cliente_id : '';
  const links = P.links({ telefone: tel, cliente_id: cid });
  const htmlLinks = Object.keys(links).length ? `<div class="eco-links" aria-label="Abrir em outro app">
      ${links.atendimento ? `<a class="btn mini" href="${esc(links.atendimento)}" target="_blank" rel="noopener">${svg(I.wa)} Abrir conversa</a>` : ''}
      ${links.crm ? `<a class="btn mini" href="${esc(links.crm)}" target="_blank" rel="noopener">${svg(I.flag)} CRM</a>` : ''}
      ${links.comunicar ? `<a class="btn mini" href="${esc(links.comunicar)}" target="_blank" rel="noopener">${svg(I.send)} Comunicar</a>` : ''}
    </div>` : '';
  if (!cid && tel.length < 10) { box.innerHTML = ''; return; }
  const chave = `${cid}|${tel}`;
  box.dataset.chave = chave;
  box.innerHTML = htmlLinks + '<div class="ctx-carregando"><span class="skel" style="height:12px;width:55%"></span></div>';
  const qs = new URLSearchParams(); if (cid) qs.set('cliente_id', cid); if (tel) qs.set('tel', tel);
  const [hist, msgs] = await Promise.all([
    api('GET', '/clientes/historico?' + qs).catch(() => []),
    api('GET', '/clientes/mensagens?' + qs).catch(() => ({ envios: [], respostas: [] })),
  ]);
  if (!box.isConnected || box.dataset.chave !== chave) return;   // trocou de cliente no meio
  const lista = hist.filter(a => a.id !== o.excluir);
  const r = P.resumo(lista);
  const htmlHist = `<details class="ctx-bloco" ${lista.length ? 'open' : ''}>
      <summary>${svg(I.relogio)} Histórico na Agenda <em class="tab-num">${lista.length}</em>
        ${lista.length ? `<span class="muted">· veio ${r.veio} · faltou ${r.faltou} · fechou ${r.fechou}</span>` : ''}</summary>
      ${lista.length ? `<ul class="ctx-lista">${lista.slice(0, 8).map(a => `<li>
          <button type="button" class="ctx-item" data-ag="${esc(a.id)}" title="Abrir este agendamento">
            <b>${esc(dataBR(a.data))} ${esc(a.hora)}</b> <span>${esc(a.servico)}</span></button>
          <span class="badge-pill ${statusClass(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span></li>`).join('')}</ul>`
        : '<p class="muted">Primeira vez na Agenda.</p>'}
      ${o.comAgendar ? `<button type="button" class="btn mini" id="ctxAgendar">${svg(I.plus)} Agendar de novo</button>` : ''}
    </details>`;
  const envios = msgs.envios || [], notas = msgs.respostas || [];
  const htmlMsgs = `<details class="ctx-bloco" ${envios.length ? 'open' : ''}>
      <summary>${svg(I.send)} Mensagens do Comunicar <em class="tab-num">${envios.length}</em></summary>
      ${envios.length ? `<ul class="ctx-lista">${envios.slice(0, 6).map(e => { const [cls, txt] = seloEnvio(e); return `<li class="ctx-msg">
          <div><b>${esc(e.rotulo)}</b> <small class="muted">${esc(dataHoraBR(e.quando))}</small>
            <span class="badge-pill ${cls}">${esc(txt)}</span></div>
          ${e.resposta ? `<blockquote title="O que o cliente respondeu">“${esc(e.resposta)}”</blockquote>` : ''}</li>`; }).join('')}</ul>`
        : '<p class="muted">Nenhuma mensagem automática para este cliente ainda.</p>'}
      ${notas.length ? `<p class="ctx-notas">${notas.map(n => `<span class="badge-pill ${n.satisfeito === false ? 'bp-red' : 'bp-green'}"
          title="${esc(n.comentario || '')}">${n.nota !== null && n.nota !== undefined ? 'nota ' + esc(n.nota) : (n.satisfeito === false ? 'insatisfeito' : 'satisfeito')} · ${esc(dataCurtaBR(n.quando))}</span>`).join(' ')}</p>` : ''}
    </details>`;
  box.innerHTML = htmlLinks + htmlHist + htmlMsgs;
  $$('[data-ag]', box).forEach(b => b.addEventListener('click', () => openAgendamentoModal(b.dataset.ag)));
  $('#ctxAgendar', box)?.addEventListener('click', () => {
    const ult = hist[0] || {};
    openAgendamentoModal(null, { cliente_nome: o.nome || ult.cliente_nome, telefone: tel, cliente_id: cid,
      veiculo: o.veiculo || ult.veiculo, placa: o.placa || ult.placa, origem: ult.origem });
  });
}

/* ---- REMARCAR: outro dia/hora com sugestões, e Desfazer -------------------- */
async function remarcarPara(a, data, hora) {
  const antes = { data: a.data, hora: a.hora, status: a.status, compareceu: a.compareceu, no_show_notificado_em: a.no_show_notificado_em || null };
  const corpo = { data, hora };
  // remarcar quem faltou ou cancelou = o horário volta a valer
  if (['nao_veio', 'cancelado'].includes(a.status)) {
    corpo.status = 'aguardando';
    // horário NOVO: se ele faltar de novo, o aviso de ausência tem de sair outra vez
    if (a.status === 'nao_veio') corpo.no_show_notificado_em = null;
  }
  await api('PUT', `/agendamentos/${a.id}`, corpo);
  esquecerDias();
  toast(`${a.cliente_nome}: remarcado para ${rotuloDia(data, agoraSP().data)} às ${hora}`, 'ok', { acao: { rotulo: 'Desfazer', fn: async () => {
    /* Volta tudo como era — inclusive "Não veio". Pelo PUT (edição) isso NÃO
       manda o aviso de ausência de novo: o aviso só sai pelo botão do cartão. */
    await api('PUT', `/agendamentos/${a.id}`, corpo.status
      ? { data: antes.data, hora: antes.hora, status: antes.status, compareceu: antes.compareceu ?? null,
          // o gatilho agendamentos_no_show do banco manda WhatsApp quando o status VIRA
          // nao_veio sem carimbo: o carimbo vai junto para o desfazer não avisar de novo
          ...(antes.status === 'nao_veio' ? { no_show_notificado_em: antes.no_show_notificado_em || new Date().toISOString() } : {}) }
      : { data: antes.data, hora: antes.hora });
    esquecerDias();
    toast(`Desfeito — ${a.cliente_nome} voltou para ${dataBR(antes.data)} às ${antes.hora}`);
    route();
  } } });
  route();
}
window.abrirRemarcar = async function(id) {
  if (emPresenca()) return;
  let a;
  try { a = await api('GET', `/agendamentos/${id}`); } catch (e) { return toast(e.message, 'err'); }
  openModal(`
    <div class="modal-head"><h3>${svg(I.calendar)} Remarcar</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <p class="remarcar-quem"><b>${esc(a.cliente_nome)}</b> · ${esc(a.servico)}<br>
        <small class="muted">Hoje marcado para ${esc(rotuloDia(a.data, agoraSP().data))} às ${esc(a.hora)}${['nao_veio', 'cancelado'].includes(a.status) ? ' — volta para Aguardando' : ''}</small></p>
      <div class="grid2">
        <div class="field"><label for="r_data">Nova data</label><input id="r_data" type="date" value="${esc(a.data)}"></div>
        <div class="field"><label for="r_hora">Nova hora</label><input id="r_hora" type="time" value="${esc(a.hora)}" min="08:00" max="17:30" step="900"></div>
      </div>
      <p class="aviso-campo" id="r_aviso" hidden>${svg(I.alerta)} <span></span></p>
      <div class="sugerir"><span class="muted">✨ Horários livres:</span><div class="sugestoes" id="r_sugestoes" aria-live="polite"></div></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="r_salvar">${svg(I.check)} Remarcar</button></div>`);
  const aviso = async () => {
    const d = $('#r_data').value, h = $('#r_hora').value, av = $('#r_aviso'); if (!av) return;
    let msg = foraDoExpediente(d, h) || '';
    if (d && h) {
      try {
        const c = P.conflitos(await agendamentosDoDia(d), { ...a, data: d, hora: h, status: 'aguardando' }, capacidadeRecepcao());
        if (c.length) msg += (msg ? ' ' : '') + `Horário disputado com ${c.map(x => x.hora + ' ' + x.cliente_nome).join('; ')}.`;
      } catch { /* sem a lista, sem o aviso */ }
    }
    if (!av.isConnected) return;
    av.hidden = !msg; if (msg) $('span', av).textContent = msg + ' Pode remarcar mesmo assim.';
  };
  $('#r_data').addEventListener('change', () => { aviso(); desenharSugestoes($('#r_sugestoes'), sug()); });
  $('#r_hora').addEventListener('input', debounce(aviso, 200));
  const sug = () => ({ data: $('#r_data').value > agoraSP().data ? $('#r_data').value : agoraSP().data,
    consultor_id: a.consultor_id, ignorar: a.id,
    aoEscolher: (s) => { $('#r_data').value = s.data; $('#r_hora').value = s.hora; aviso(); } });
  desenharSugestoes($('#r_sugestoes'), sug());
  aviso();
  $('#r_salvar').addEventListener('click', async () => {
    const d = $('#r_data').value, h = $('#r_hora').value;
    if (!d || !h) return toast('Escolha a nova data e hora', 'err');
    if (d === a.data && h === a.hora) return toast('É o mesmo horário de agora — escolha outro', 'err');
    const b = $('#r_salvar'); b.disabled = true;
    try { closeModal(); await remarcarPara(a, d, h); }
    catch (e) { toast(e.message, 'err'); }
    finally { b.disabled = false; }
  });
};

/* ---- LINK DE ENTRADA (?tel= / &cliente=) ------------------------------------
   Achou UM horário pendente → abre ele. Achou a ficha → abre a ficha (com o
   histórico e o "Agendar de novo"). Vários pendentes sem ficha → Agenda
   filtrada pelo telefone. Nada → "Novo agendamento" já com o telefone. */
async function abrirEntrada(e) {
  if (!e || emPresenca()) return;
  try {
    if (e.agendamento) return openAgendamentoModal(e.agendamento);
    const qs = new URLSearchParams(); if (e.tel) qs.set('tel', e.tel); if (e.cliente) qs.set('cliente', e.cliente);
    const r = await api('GET', '/abrir?' + qs);
    const nome = r.cliente?.nome || r.agendamentos?.[0]?.cliente_nome || '';
    if (r.pendentes?.length === 1) {
      toast(`Agendamento de ${nome || 'cliente'}: ${rotuloDia(r.pendentes[0].data, agoraSP().data)} às ${r.pendentes[0].hora}`);
      return openAgendamentoModal(r.pendentes[0].id);
    }
    if (r.cliente) {
      if (r.pendentes?.length > 1) toast(`${nome} tem ${r.pendentes.length} horários marcados — veja no histórico da ficha`);
      return openClienteModal(r.cliente.id);
    }
    if (r.pendentes?.length > 1) {
      state.agendaQ = r.telefone || e.tel; state.agendaSemTel = false;
      toast(`${r.pendentes.length} horários com esse telefone`);
      return route('agenda');
    }
    const ult = r.agendamentos?.[0] || {};
    toast(r.agendamentos?.length ? `${nome} não tem horário marcado agora — novo agendamento` : 'Telefone sem agendamento na Agenda — novo agendamento');
    return openAgendamentoModal(null, { telefone: r.telefone || e.tel, cliente_nome: nome, veiculo: ult.veiculo, placa: ult.placa, origem: ult.origem || 'WhatsApp' });
  } catch (err) {
    toast('Não consegui abrir o cliente do link: ' + err.message, 'err');
    if (e.tel) openAgendamentoModal(null, { telefone: e.tel, origem: 'WhatsApp' });
  }
}

/* ---- BUSCA GLOBAL (Ctrl+K ou o botão da lupa no topo) ----------------------- */
window.abrirBuscaGlobal = function() {
  if (emPresenca()) return;
  openModal(`
    <div class="modal-head"><h3>${svg(I.search)} Buscar em tudo</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <div class="search larga">${svg(I.search)}<input id="bgQ" type="search" placeholder="Nome, telefone, placa, carro ou serviço" aria-label="Buscar agendamentos e clientes" autocomplete="off"></div>
      <div id="bgRes" class="busca-res" aria-live="polite"><p class="muted">Digite pelo menos 2 letras. Atalho: Ctrl+K.</p></div>
    </div>`);
  let vez = 0;
  // Enter abre o primeiro resultado (agendamento antes de cliente)
  $('#bgQ').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const primeiro = $('#bgRes .busca-item');
    if (primeiro) { ev.preventDefault(); primeiro.click(); }
  });
  $('#bgQ').addEventListener('input', debounce(async (ev) => {
    const q = ev.target.value.trim(), box = $('#bgRes'); if (!box) return;
    if (q.length < 2) { box.innerHTML = '<p class="muted">Digite pelo menos 2 letras.</p>'; return; }
    const minha = ++vez;
    box.innerHTML = '<p class="muted">Procurando…</p>';
    try {
      const r = await api('GET', '/busca?q=' + encodeURIComponent(q));
      if (minha !== vez || !box.isConnected) return;
      const ag = r.agendamentos || [], cl = r.clientes || [];
      if (!ag.length && !cl.length) { box.innerHTML = `<p class="muted">Nada com "${esc(q)}".</p>`; return; }
      box.innerHTML = (ag.length ? `<h4>Agendamentos <em class="tab-num">${ag.length}</em></h4>` + ag.map(a => `
          <button type="button" class="busca-item" data-ag="${esc(a.id)}"><b>${esc(a.cliente_nome)}</b>
            <span>${esc(dataBR(a.data))} ${esc(a.hora)} · ${esc(a.servico)}${a.placa ? ' · ' + esc(a.placa) : ''}</span>
            <span class="badge-pill ${statusClass(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span></button>`).join('') : '')
        + (cl.length ? `<h4>Clientes <em class="tab-num">${cl.length}</em></h4>` + cl.map(c => `
          <button type="button" class="busca-item" data-cli="${esc(c.id)}"><b>${esc(c.nome)}</b>
            <span>${esc(mascaraTelefone(c.telefone) || 'sem telefone')}${c.veiculo ? ' · ' + esc(c.veiculo) : ''}${c.placa ? ' · ' + esc(c.placa) : ''}</span></button>`).join('') : '');
      $$('[data-ag]', box).forEach(b => b.addEventListener('click', () => openAgendamentoModal(b.dataset.ag)));
      $$('[data-cli]', box).forEach(b => b.addEventListener('click', () => openClienteModal(b.dataset.cli)));
    } catch (e) { if (minha === vez && box.isConnected) box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  }, 250));
};

/* ---- FILA SEM INTERNET ---------------------------------------------------------
   Desfecho marcado sem conexão não se perde: vai para uma fila no aparelho
   (só id + status, nada do cliente) e é enviado sozinho quando a internet volta. */
const FILA_KEY = 'indycar_fila_desfechos';
function lerFila() { try { return JSON.parse(localStorage.getItem(FILA_KEY) || '[]').filter(x => x && x.id && x.status); } catch { return []; } }
function gravarFila(f) { try { localStorage.setItem(FILA_KEY, JSON.stringify(f)); } catch { /* sem armazenamento: segue sem fila */ } desenharFila(); }
function enfileirar(id, status, nome) {
  const f = lerFila().filter(x => x.id !== id);      // o último clique vale
  f.push({ id, status, nome: String(nome || '').slice(0, 40), em: Date.now() });
  gravarFila(f);
}
function desenharFila() {
  const f = lerFila(), el = $('#faixaFila'); if (!el) return;
  el.hidden = !f.length;
  if (f.length) el.textContent = `${f.length} ${f.length === 1 ? 'marcação esperando' : 'marcações esperando'} a internet voltar para ser ${f.length === 1 ? 'enviada' : 'enviadas'}.`;
}
let _enviandoFila = false;
async function enviarFila() {
  if (_enviandoFila || navigator.onLine === false) return;
  let f = lerFila(); if (!f.length) return;
  _enviandoFila = true;
  let ok = 0, falhas = 0;
  try {
    for (const item of f) {
      try { await api('PATCH', `/agendamentos/${item.id}/status`, { status: item.status }); ok++; f = f.filter(x => x !== item); }
      catch (e) { if (e instanceof TypeError) break; falhas++; f = f.filter(x => x !== item); console.warn('Fila: recusado', item.status, e.message); }
    }
  } finally { gravarFila(f); _enviandoFila = false; }
  if (ok) toast(`${ok} ${ok === 1 ? 'marcação feita sem internet foi enviada' : 'marcações feitas sem internet foram enviadas'} ✅`);
  if (falhas) toast(`${falhas} ${falhas === 1 ? 'marcação da fila foi recusada' : 'marcações da fila foram recusadas'} — confira na Agenda`, 'err');
  if (ok || falhas) route();
}

/* pre = campos já preenchidos num agendamento NOVO (link de entrada com ?tel=,
   "Agendar de novo" na ficha, "+ Agendar" num dia da Semana). */
window.openAgendamentoModal = async function(id, pre = {}){
  if (emPresenca()) return;
  const servicos = await api('GET','/servicos').catch(()=>[]);
  state.servicos = servicos;
  let a = { cliente_nome:'',telefone:'',veiculo:'',placa:'',servico:'',data:hojeSP(),
            hora:'09:00',consultor_id:'',origem:'Google',observacoes:'',status:'aguardando',confirmado:0 };
  if (id) a = await api('GET',`/agendamentos/${id}`).catch(()=>null) || a;
  else if (pre && typeof pre === 'object') {
    for (const k of ['cliente_nome','telefone','veiculo','placa','servico','data','hora','consultor_id','origem','cliente_id'])
      if (pre[k]) a[k] = pre[k];
    if (a.telefone) a.telefone = mascaraTelefone(a.telefone);
  }
  openModal(`
    <div class="modal-head"><h3>${svg(I.calendar)} ${id?'Editar':'Novo'} agendamento</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label for="f_nome">Cliente *</label><input id="f_nome" value="${esc(a.cliente_nome)}" autocomplete="off"></div>
        <!-- Telefone em DESTAQUE: sem ele o cliente não recebe lembrete nem pós-venda e
             o CRM não liga a ficha (92 dos 159 agendamentos nasceram assim). -->
        <div class="field destaque"><label for="f_tel">Telefone (WhatsApp)</label>
          <div class="campo-com-botao">
            <input id="f_tel" type="tel" inputmode="tel" value="${esc(a.telefone)}" placeholder="(12) 99999-9999" autocomplete="off">
            <button type="button" class="btn" id="f_achar" aria-label="Achar o telefone pelo nome"
                    title="Achar o telefone pelo nome, nas conversas do WhatsApp e nos clientes (ou Enter no nome)">${svg(I.search)} <span>Achar</span></button>
          </div>
          <div class="achar-lista" id="f_achar_lista" hidden></div>
          <input type="hidden" id="f_cli" value="${esc(a.cliente_id || '')}">
        </div>
      </div>
      <p class="aviso-campo" id="f_semtel" hidden>${svg(I.alerta)} <span>Sem telefone este cliente não recebe lembrete nem pós-venda, e não entra no CRM.</span></p>
      <div id="f_ficha">${a.cliente_id ? '<div class="ficha-mini carregando"><span class="skel" style="height:12px;width:60%"></span></div>' : ''}</div>
      <div class="grid2">
        <div class="field"><label for="f_veic">Carro</label><input id="f_veic" value="${esc(a.veiculo)}" placeholder="Ônix"></div>
        <div class="field"><label for="f_placa">Placa</label><input id="f_placa" value="${esc(a.placa)}" placeholder="AURA6742" style="text-transform:uppercase"></div>
      </div>
      <div class="field"><label for="f_serv">Serviço *</label>
        <input id="f_serv" list="servListAg" value="${esc(a.servico)}" placeholder="Selecione ou digite o serviço">
        <datalist id="servListAg">${servicos.map(s=>`<option value="${esc(s.nome)}"></option>`).join('')}</datalist></div>
      <div class="grid3">
        <div class="field"><label for="f_data">Data *</label><input id="f_data" type="date" value="${esc(a.data)}"></div>
        <div class="field"><label for="f_hora">Hora *</label><input id="f_hora" type="time" value="${esc(a.hora)}" min="08:00" max="17:30" step="900"></div>
        <div class="field"><label for="f_cons">Consultor</label><select id="f_cons"><option value="">—</option>${fieldsConsultorOptions(a.consultor_id)}</select></div>
      </div>
      <p class="aviso-campo" id="f_expediente" hidden>${svg(I.alerta)} <span></span> Pode salvar mesmo assim.</p>
      <!-- Duração estimada (do cadastro de serviços), conflito de horário e as
           sugestões de horário livre. Tudo aviso: nada bloqueia o salvar. -->
      <p class="info-campo" id="f_duracao" aria-live="polite" hidden></p>
      <p class="aviso-campo" id="f_conflito" role="status" hidden>${svg(I.alerta)} <span></span></p>
      <div class="sugerir">
        <button type="button" class="btn mini" id="f_sugerir" title="Mostra 3 horários livres a partir da data escolhida">✨ Sugerir horário</button>
        <div class="sugestoes" id="f_sugestoes" aria-live="polite"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="f_ori">Origem</label><select id="f_ori">
          ${ORIGENS.map(o=>`<option ${o==a.origem?'selected':''}>${o}</option>`).join('')}
        </select></div>
        <div class="field"><label for="f_status">Situação</label><select id="f_status">
          ${Object.entries(STATUS_LABEL).map(([k,v])=>`<option value="${k}" ${k==a.status?'selected':''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="field"><label for="f_obs">Observações</label><textarea id="f_obs">${esc(a.observacoes)}</textarea></div>
      <div id="f_contexto" class="contexto-cliente"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="f_save">${svg(I.check)} Salvar</button>
    </div>`);
  ligarMascaraTelefone($('#f_tel'));
  /* "Achar pelo nome": procura nas conversas do WhatsApp e nos clientes e
     preenche telefone (+ ficha) com um clique. Enter no campo do nome também busca. */
  const mostrarFicha = (cid) => {
    const box = $('#f_ficha'); if (!box) return;
    if (!cid) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="ficha-mini carregando"><span class="skel" style="height:12px;width:60%"></span></div>';
    api('GET', `/clientes/${cid}/ficha`).then(f => {
      if (!modalAberto() || $('#f_cli')?.value !== cid) return;
      box.innerHTML = fichaMiniHtml(f);
      $('[data-ficha]', box)?.addEventListener('click', () => openClienteModal(f.id, { voltarPara: id }));
    }).catch(() => { box.innerHTML = ''; });
  };
  const acharPeloNome = async () => {
    const q = $('#f_nome').value.trim(), lista = $('#f_achar_lista'), btn = $('#f_achar');
    if (q.length < 2) { $('#f_nome').focus(); return toast('Digite pelo menos 2 letras do nome para procurar', 'err'); }
    btn.disabled = true; lista.hidden = false;
    lista.innerHTML = '<div class="achar-item muted">Procurando…</div>';
    try {
      const r = await api('GET', '/clientes/achar?q=' + encodeURIComponent(q));
      if (!r.length) { lista.innerHTML = `<div class="achar-item muted">Ninguém com "${esc(q)}" nas conversas nem nos clientes. Digite o telefone à mão.</div>`; return; }
      lista.innerHTML = r.map((c, i) => `<button type="button" class="achar-item" data-i="${i}">
          <span class="achar-ico">${svg(c.origem === 'conversa' ? I.wa : I.user)}</span>
          <span class="achar-txt"><b>${esc(c.nome || 'Sem nome')}</b>
            <small>${esc(mascaraTelefone(c.telefone))}${c.veiculo ? ' · ' + esc(c.veiculo) : ''}${c.placa ? ' · ' + esc(c.placa) : ''}${c.quando ? ' · ' + esc(dataCurtaBR(c.quando)) : ''}</small></span>
          <span class="achar-de">${c.origem === 'conversa' ? 'WhatsApp' : 'cliente'}</span></button>`).join('');
      $$('.achar-item[data-i]', lista).forEach(b => b.addEventListener('click', () => {
        const c = r[+b.dataset.i];
        $('#f_tel').value = mascaraTelefone(c.telefone);
        $('#f_cli').value = c.cliente_id || '';
        if (!$('#f_veic').value && c.veiculo) $('#f_veic').value = c.veiculo;
        if (!$('#f_placa').value && c.placa) $('#f_placa').value = c.placa;
        lista.hidden = true; lista.innerHTML = '';
        $('#f_semtel').hidden = true; $('#f_save').textContent = ''; $('#f_save').innerHTML = `${svg(I.check)} Salvar`;
        mostrarFicha(c.cliente_id);
        contextoDoCliente($('#f_contexto'), { cliente_id: c.cliente_id, telefone: c.telefone, excluir: id, nome: c.nome });
        toast(`Telefone de ${c.nome || 'contato'} preenchido`);
      }));
    } catch (e) { lista.innerHTML = `<div class="achar-item muted">${esc(e.message)}</div>`; }
    finally { btn.disabled = false; }
  };
  $('#f_achar').addEventListener('click', acharPeloNome);
  $('#f_nome').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); acharPeloNome(); } });
  // digitou um telefone diferente: a ficha antiga não vale mais
  $('#f_tel').addEventListener('input', () => {
    const d = $('#f_tel').value.replace(/\D/g, '');
    if (d.length >= 10) { $('#f_semtel').hidden = true; const s = $('#f_save'); if (/assim mesmo/.test(s.textContent)) s.innerHTML = `${svg(I.check)} Salvar`; }
    if (a.telefone && d !== String(a.telefone).replace(/\D/g, '')) { $('#f_cli').value = ''; $('#f_ficha').innerHTML = ''; }
  });
  // aviso (sem bloquear) quando o horário cai fora de seg–sáb 8h–17h30
  const conferirExpediente = () => {
    const av = $('#f_expediente'); if (!av) return;
    const msg = foraDoExpediente($('#f_data').value, $('#f_hora').value);
    av.hidden = !msg; if (msg) $('span', av).textContent = msg;
  };
  $('#f_data').addEventListener('change', conferirExpediente);
  $('#f_hora').addEventListener('input', conferirExpediente);
  conferirExpediente();
  ligarPlanejamentoNoModal(id, servicos);
  // histórico do cliente + mensagens do Comunicar + links para os outros apps
  const contexto = () => contextoDoCliente($('#f_contexto'), {
    cliente_id: $('#f_cli').value, telefone: $('#f_tel').value, excluir: id, nome: $('#f_nome').value });
  contexto();
  $('#f_tel').addEventListener('change', contexto);
  // mini-ficha de quem já é cliente (última visita, próxima revisão, aniversário)
  if (a.cliente_id) mostrarFicha(a.cliente_id);
  let confirmouSemTelefone = false;
  $('#f_save').addEventListener('click', async () => {
    const payload = {
      cliente_nome:$('#f_nome').value.trim(), telefone:$('#f_tel').value.trim(),
      veiculo:$('#f_veic').value.trim(), placa:$('#f_placa').value.trim().toUpperCase(),
      servico:$('#f_serv').value.trim(), data:$('#f_data').value, hora:$('#f_hora').value,
      consultor_id:$('#f_cons').value || null, origem:$('#f_ori').value,
      status:$('#f_status').value, confirmado:$('#f_status').value==='confirmado'?1:(a.confirmado||0),
      observacoes:$('#f_obs').value.trim(),
    };
    const cid = $('#f_cli').value.trim();
    if (cid) payload.cliente_id = cid;              // veio do "achar pelo nome": liga à ficha certa
    if(!payload.cliente_nome||!payload.servico||!payload.data||!payload.hora) return toast('Preencha os campos obrigatórios','err');
    if(!telefoneOk(payload.telefone)) { $('#f_tel').focus(); return toast('Telefone incompleto: use DDD + número, ex.: (12) 99999-9999','err'); }
    /* Sem telefone: avisa UMA vez e pede um segundo clique ("Salvar assim mesmo").
       Não bloqueia — o dono pode marcar quem passou no balcão sem WhatsApp. */
    if (!payload.telefone && !confirmouSemTelefone) {
      confirmouSemTelefone = true;
      $('#f_semtel').hidden = false;
      $('#f_save').innerHTML = `${svg(I.alerta)} Salvar assim mesmo`;
      $('#f_tel').focus();
      return;
    }
    const btn = $('#f_save'); btn.disabled = true;
    try {
      if (id) await api('PUT', `/agendamentos/${id}`, payload);
      else await api('POST', '/agendamentos', payload);
      toast('Agendamento salvo'); closeModal(); route();
    } catch(e){ toast(e.message,'err'); }
    finally { btn.disabled = false; }
  });
};

/* FICHA DO CLIENTE. Além do cadastro: aniversário (DD/MM ou DD/MM/AAAA — sem o
   ano, o Comunicar só sabe o dia), a chave "aceita mensagens automáticas" (é
   ela que o Comunicar lê antes de mandar qualquer coisa), a última visita e a
   próxima revisão prevista pela regra do serviço. opts.voltarPara = id de um
   agendamento para reabrir ao fechar (quando veio da mini-ficha). */
window.openClienteModal = async function(id, opts = {}){
  let c = {nome:'',telefone:'',veiculo:'',placa:'',modelo:'',origem:'Google',observacoes:'',
           nascimento:null,nascimento_tela:'',aceita_mensagens:1,aceita_mensagens_em:null,aceita_mensagens_motivo:null,
           ultima_visita:null,proxima_revisao:null,total_agendamentos:0};
  if (id) c = await api('GET',`/clientes/${id}/ficha`).catch(()=>null) || c;
  const hoje = agoraSP().data;
  const diasAniv = diasParaAniversario(c.nascimento, hoje);
  const revAtrasada = c.proxima_revisao && c.proxima_revisao.data < hoje;
  openModal(`
    <div class="modal-head"><h3>${svg(I.user)} ${id?'Ficha do cliente':'Novo cliente'}</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      ${id ? `<div class="ficha-resumo">
        <div class="ficha-item"><small>Última visita</small>
          <b>${c.ultima_visita ? esc(dataBR(c.ultima_visita.data)) : '—'}</b>
          <span>${c.ultima_visita ? esc(c.ultima_visita.servico) : 'nenhum serviço concluído ainda'}</span></div>
        <div class="ficha-item${revAtrasada ? ' atrasada' : ''}"><small>Próxima revisão prevista</small>
          <b>${c.proxima_revisao ? esc(dataBR(c.proxima_revisao.data)) : '—'}</b>
          <span>${c.proxima_revisao ? `${esc(c.proxima_revisao.rotulo)} · ${c.proxima_revisao.meses} meses${revAtrasada ? ' · já passou' : ''}` : 'aparece depois da primeira visita'}</span></div>
        <div class="ficha-item"><small>Visitas marcadas</small><b>${Number(c.total_agendamentos) || 0}</b><span>no total</span></div>
      </div>` : ''}
      <div class="grid2">
        <div class="field"><label for="c_nome">Nome *</label><input id="c_nome" value="${esc(c.nome)}" autocomplete="off"></div>
        <div class="field"><label for="c_tel">Telefone</label><input id="c_tel" type="tel" inputmode="tel" value="${esc(c.telefone)}" placeholder="(12) 99999-9999" autocomplete="off"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="c_veic">Carro</label><input id="c_veic" value="${esc(c.veiculo)}" placeholder="Ônix"></div>
        <div class="field"><label for="c_placa">Placa</label><input id="c_placa" value="${esc(c.placa)}" style="text-transform:uppercase"></div>
      </div>
      <div class="grid3">
        <div class="field"><label for="c_mod">Ano do carro</label><input id="c_mod" inputmode="numeric" maxlength="4" placeholder="2020" value="${esc(c.modelo)}"></div>
        <div class="field"><label for="c_ori">Origem</label><select id="c_ori">${ORIGENS.map(o=>`<option ${o==c.origem?'selected':''}>${o}</option>`).join('')}</select></div>
        <div class="field"><label for="c_nasc">Aniversário</label>
          <input id="c_nasc" inputmode="numeric" maxlength="10" placeholder="DD/MM ou DD/MM/AAAA" value="${esc(c.nascimento_tela)}" autocomplete="off">
          ${diasAniv !== null && diasAniv <= 7 ? `<small class="muted">🎂 ${diasAniv === 0 ? 'É hoje!' : `Em ${diasAniv} dia${diasAniv === 1 ? '' : 's'}`}</small>` : ''}</div>
      </div>
      <div class="field opt-mensagens">
        <label class="switch"><input type="checkbox" id="c_aceita" ${c.aceita_mensagens ? 'checked' : ''}>
          <span>Aceita mensagens automáticas (lembrete, aniversário, revisão)</span></label>
        <div id="c_motivo_box" ${c.aceita_mensagens ? 'hidden' : ''}>
          <input id="c_motivo" maxlength="200" placeholder="Por quê? Ex.: pediu no balcão" value="${esc(c.aceita_mensagens_motivo || '')}">
          <small class="muted">${c.aceita_mensagens === 0 && c.aceita_mensagens_em
            ? `Desligado em ${esc(dataHoraBR(c.aceita_mensagens_em))}${c.aceita_mensagens_motivo ? ' — ' + esc(c.aceita_mensagens_motivo) : ''}. O Comunicar não manda nada para este cliente.`
            : 'Desligado, o Comunicar não manda nenhuma mensagem automática para este cliente.'}</small>
        </div>
      </div>
      <div class="field"><label for="c_obs">Observações</label><textarea id="c_obs">${esc(c.observacoes)}</textarea></div>
      ${id ? '<div id="c_contexto" class="contexto-cliente"></div>' : ''}
    </div>
    <div class="modal-foot">
      ${id && c.telefone ? `<button class="btn" id="c_wa" style="margin-right:auto">${svg(I.wa)} WhatsApp</button>` : ''}
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="c_save">${svg(I.check)} Salvar</button></div>`);
  ligarMascaraTelefone($('#c_tel'));
  $('#c_nasc').addEventListener('input', e => { e.target.value = mascaraAniversario(e.target.value); });
  $('#c_aceita').addEventListener('change', e => { $('#c_motivo_box').hidden = e.target.checked; if (!e.target.checked) $('#c_motivo').focus(); });
  $('#c_wa')?.addEventListener('click', () => openWhatsappModal(null, id));
  if (id) contextoDoCliente($('#c_contexto'), { cliente_id: id, telefone: c.telefone, nome: c.nome,
    veiculo: c.veiculo, placa: c.placa, comAgendar: true });
  $('#c_save').addEventListener('click', async () => {
    const nasc = $('#c_nasc').value.trim();
    if (nasc && !/^\d{2}\/\d{2}(\/\d{4})?$/.test(nasc)) { $('#c_nasc').focus(); return toast('Aniversário: use DD/MM ou DD/MM/AAAA','err'); }
    const aceita = $('#c_aceita').checked;
    const p = {nome:$('#c_nome').value.trim(),telefone:$('#c_tel').value.trim(),veiculo:$('#c_veic').value.trim(),
      placa:$('#c_placa').value.trim().toUpperCase(),modelo:$('#c_mod').value.trim(),origem:$('#c_ori').value,observacoes:$('#c_obs').value.trim(),
      nascimento: nasc || null};
    // só manda a chave quando ela MUDOU: assim não recarimba a data de quem já estava desligado
    if (aceita !== !!c.aceita_mensagens) { p.aceita_mensagens = aceita; if (!aceita) p.aceita_mensagens_motivo = $('#c_motivo').value.trim(); }
    if(!p.nome) return toast('Informe o nome','err');
    if(!telefoneOk(p.telefone)) { $('#c_tel').focus(); return toast('Telefone incompleto: use DDD + número, ex.: (12) 99999-9999','err'); }
    const btn = $('#c_save'); btn.disabled = true;
    try{ if(id) await api('PUT',`/clientes/${id}`,p); else await api('POST','/clientes',p);
      toast(id ? 'Ficha salva' : 'Cliente criado'); closeModal();
      if (opts.voltarPara) openAgendamentoModal(opts.voltarPara); else route();
    }catch(e){toast(e.message,'err');}
    finally { btn.disabled = false; }
  });
};

window.openConsultorModal = async function(id){
  let c = {nome:'',telefone:'',cor:'#e6192e',ativo:1};
  if (id) c = state.consultores.find(x=>x.id===id) || await api('GET','/consultores').then(l=>l.find(x=>x.id===id)) || c;
  openModal(`
    <div class="modal-head"><h3>${svg(I.user)} ${id?'Editar':'Novo'} consultor</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>Nome *</label><input id="k_nome" value="${esc(c.nome)}"></div>
      <div class="grid2">
        <div class="field"><label>Telefone</label><input id="k_tel" value="${esc(c.telefone)}"></div>
        <div class="field"><label>Cor</label><input id="k_cor" type="color" value="${c.cor||'#e6192e'}" style="height:44px;padding:4px"></div>
      </div>
      <div class="field"><label><input id="k_ativo" type="checkbox" ${c.ativo?'checked':''}> Ativo</label></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="k_save">${svg(I.check)} Salvar</button></div>`);
  $('#k_save').addEventListener('click', async () => {
    const p={nome:$('#k_nome').value.trim(),telefone:$('#k_tel').value.trim(),cor:$('#k_cor').value,ativo:$('#k_ativo').checked?1:0};
    if(!p.nome) return toast('Informe o nome','err');
    try{ if(id) await api('PUT',`/consultores/${id}`,p); else await api('POST','/consultores',p);
      await loadConsultores(); toast('Consultor salvo'); closeModal(); renderEquipe(); }catch(e){toast(e.message,'err');}
  });
};

window.openTemplateModal = async function(id){
  let t = {nome:'',gatilho:'manual',corpo:''};
  if (id) t = await api('GET','/whatsapp/templates').then(l=>l.find(x=>x.id===id)) || t;
  openModal(`
    <div class="modal-head"><h3>${svg(I.wa)} ${id?'Editar':'Novo'} modelo</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label>Nome *</label><input id="t_nome" value="${esc(t.nome)}"></div>
        <div class="field"><label>Gatilho</label><select id="t_gat">${['manual','confirmacao','lembrete','followup','pos_servico'].map(g=>`<option ${g==t.gatilho?'selected':''}>${g}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Mensagem *</label><textarea id="t_corpo" style="min-height:120px">${esc(t.corpo)}</textarea>
        <small class="muted">Variáveis: {nome} {servico} {data} {hora} {veiculo} {placa}</small></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="t_save">${svg(I.check)} Salvar</button></div>`);
  $('#t_save').addEventListener('click', async () => {
    const p={nome:$('#t_nome').value.trim(),gatilho:$('#t_gat').value,corpo:$('#t_corpo').value.trim()};
    if(!p.nome||!p.corpo) return toast('Preencha nome e mensagem','err');
    try{ if(id) await api('PUT',`/whatsapp/templates/${id}`,p); else await api('POST','/whatsapp/templates',p);
      toast('Modelo salvo'); closeModal(); renderWhatsapp(); }catch(e){toast(e.message,'err');}
  });
};

// Modal de envio de WhatsApp (a partir de agendamento, cliente ou template)
window.openWhatsappModal = async function(agendamentoId, clienteId, templateId){
  const [templates, cfg] = await Promise.all([ api('GET','/whatsapp/templates'), api('GET','/whatsapp/config') ]);
  const enviaCloud = !!(cfg.ativo && cfg.phone_number_id && cfg.tem_token);
  let nome='', telefone='', agId=agendamentoId||'';
  if (agendamentoId){ const a=await api('GET','/agendamentos').then(l=>l.find(x=>x.id===agendamentoId)); if(a){nome=a.cliente_nome;telefone=a.telefone;} }
  else if (clienteId){ const c=await api('GET','/clientes').then(l=>l.find(x=>x.id===clienteId)); if(c){nome=c.nome;telefone=c.telefone;} }
  openModal(`
    <div class="modal-head"><h3 style="color:#25d366">${svg(I.wa)} Enviar WhatsApp</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label for="w_nome">Nome</label><input id="w_nome" value="${esc(nome)}"></div>
        <div class="field"><label for="w_tel">Telefone *</label><input id="w_tel" type="tel" inputmode="tel" value="${esc(telefone)}" placeholder="(12) 99999-9999"></div>
      </div>
      <div class="field"><label>Usar modelo</label><select id="w_tpl"><option value="">— Mensagem livre —</option>
        ${templates.map(t=>`<option value="${t.id}" ${t.id==templateId?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Mensagem *</label><textarea id="w_corpo" style="min-height:120px"></textarea></div>
      <input type="hidden" id="w_ag" value="${agId}">
      <small class="muted">${enviaCloud
        ? '⚡ A Cloud API está ativa: a mensagem será <b>enviada automaticamente</b>.'
        : '🔗 Modo link: a mensagem será registrada e o <b>WhatsApp abrirá</b> com o texto pronto.'}</small>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn green" id="w_send">${svg(I.send)} ${enviaCloud?'Enviar pela Cloud API':'Registrar e abrir WhatsApp'}</button></div>`);

  ligarMascaraTelefone($('#w_tel'));
  async function carregaTemplate(){
    const tid = $('#w_tpl').value;
    if (!tid){ return; }
    // template_id é uuid: nada de +tid (viraria NaN e depois null no JSON)
    const r = await api('POST','/whatsapp/preparar',{ template_id:tid, agendamento_id:agId||null, nome:$('#w_nome').value, telefone:$('#w_tel').value });
    $('#w_corpo').value = r.corpo;
  }
  const carregaTemplateSeguro = () => carregaTemplate().catch(e => toast(e.message,'err'));
  if (templateId) carregaTemplateSeguro();
  $('#w_tpl').addEventListener('change', carregaTemplateSeguro);
  $('#w_send').addEventListener('click', async () => {
    const tel=$('#w_tel').value.trim(), corpo=$('#w_corpo').value.trim();
    if(!tel||!corpo) return toast('Informe telefone e mensagem','err');
    if(!telefoneOk(tel)) { $('#w_tel').focus(); return toast('Telefone incompleto: use DDD + número, ex.: (12) 99999-9999','err'); }
    try{
      const r = await api('POST','/whatsapp/enviar',{ telefone:tel, nome:$('#w_nome').value.trim(),
        corpo, agendamento_id:agId||null, template_id:$('#w_tpl').value||null });
      if (r.modo === 'cloud') {
        if (r.status === 'enviado') toast('Mensagem enviada pela Cloud API ✅');
        else toast('Falha no envio: ' + (r.erro||'erro'), 'err');
      } else {
        toast('Mensagem registrada — abrindo WhatsApp');
        window.open(r.link, '_blank');
      }
      closeModal(); if (state.route==='whatsapp') { state.waTab='mensagens'; renderWhatsapp(); }
    }catch(e){toast(e.message,'err');}
  });
};

// ============================================================================
// MODO PRESENÇA — o que o papel 'agenda' (ex.: Franklin) enxerga: a agenda de
// HOJE e dois botões. O servidor já recusa todo o resto; aqui a tela só não
// oferece o que não funcionaria.
// ============================================================================
const emPresenca = () => state.perfil?.papel === 'agenda';

/* Cartão do modo presença: o mesmo desenho do painel, só com presença. Fechar
   ou não a venda é desfecho comercial — fica com quem usa o Início.
   Só aparece o botão que MUDA alguma coisa, e quem já tem desfecho não tem botão
   nenhum: o papel 'agenda' não pode desfazer um "Veio e fechou" do atendimento
   (o servidor recusa também — aqui a tela só não oferece o que não funcionaria). */
function cartaoPresenca(a, agora) {
  const g = grupoDoDia(a);
  const bt = (marca, cls, ico, txt) => `<button class="act ${cls}" data-marca="${marca}">${svg(ico)} ${txt}</button>`;
  const botoes = g === 'resolvidos'
    ? `<span class="act-nota">${svg(I.cadeado)} Desfecho já registrado pelo atendimento</span>`
    : (g !== 'oficina' ? bt('compareceu', 'green solido', I.check, 'Compareceu') : '')
    + (g !== 'faltaram' ? bt('nao_veio', 'red', I.x, 'Não veio') : '');
  return corpoDoCartao(a, agora || agoraSP(), botoes);
}

async function renderDia(opts = {}) {
  const list = await api('GET', '/agendamentos');   // o servidor já limita a hoje
  if (opts.vez && opts.vez !== state._vez) return;
  // para quem marca presença, "chegou" é chegou — tenha a venda fechado ou não
  const grupos = { agendados: [], chegaram: [], faltaram: [] };
  for (const a of list) {
    const g = grupoDoDia(a);
    grupos[g === 'oficina' || g === 'resolvidos' ? 'chegaram' : g].push(a);
  }
  for (const k of Object.keys(grupos)) grupos[k].sort((x, y) => String(x.hora).localeCompare(String(y.hora)));
  const abas = [['agendados', 'Agendados', I.relogio], ['chegaram', 'Já chegaram', I.check], ['faltaram', 'Não vieram', I.x]];
  if (!abas.some(([k]) => k === state.hojeTab)) state.hojeTab = 'agendados';

  view.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>${svg(I.calendar)} Agenda de hoje</h2>
        <span class="date">${dataExtenso(agoraSP().data)}</span>
      </div>
      <div class="tabs tabs-hoje" id="tabsHoje">
        ${abas.map(([chave, rotulo, ico]) =>
          `<button type="button" class="tab ${state.hojeTab === chave ? 'active' : ''}" data-hoje-tab="${chave}">
             ${svg(ico)} ${rotulo} <em class="tab-num">${grupos[chave].length}</em></button>`).join('')}
      </div>
      <div class="panel-body lista" id="agendaHoje"></div>
    </div>`;

  const pintar = (animar) => {
    const agora = agoraSP();                         // dentro: o relógio da tela repinta com a hora certa
    $$('#tabsHoje .tab').forEach(b => b.classList.toggle('active', b.dataset.hojeTab === state.hojeTab));
    const lista = grupos[state.hojeTab];
    const box = $('#agendaHoje');
    if (!box) return;
    pintarLista(box, lista.length ? lista.map(a => cartaoPresenca(a, agora)).join('')
      : vazio(...VAZIO_DIA[state.hojeTab]), animar);
    $$('[data-marca]', box).forEach(btn => btn.addEventListener('click', async () => {
      const card = btn.closest('.appt'), id = card.dataset.id, marca = btn.dataset.marca;
      const botoes = $$('.act', card);
      botoes.forEach(b => { b.disabled = true; });
      card.classList.add('ocupado');
      try {
        const r = await api('PATCH', `/agendamentos/${id}/status`, { status: marca });
        await sairDoCartao(card);                    // o botão só existe quando o cartão muda de aba
        toast(marca === 'compareceu' ? 'Cliente chegou ✅ — foi para "Já chegaram"'
          : recadoDeAusencia(r), marca === 'nao_veio' && r.aviso_ausencia && !r.aviso_ausencia.ok ? 'err' : 'ok');
        route();
      } catch (e) {
        botoes.forEach(b => { b.disabled = false; });
        card.classList.remove('ocupado');
        toast(e.message, 'err');
      }
    }));
  };
  $$('#tabsHoje .tab').forEach(b => b.addEventListener('click', () => {
    if (state.hojeTab === b.dataset.hojeTab) return;
    state.hojeTab = b.dataset.hojeTab;
    pintar(true);
    moverTinta($('#tabsHoje'));
  }));
  pintar(!opts.quieto);
  moverTinta($('#tabsHoje'), true);
  state._repintar = () => { if (state.route === 'dia') pintar(false); };
}

// ============================================================================
// ROTEAMENTO
// ============================================================================
const ROUTES = { inicio:renderInicio, agenda:renderAgenda, crm:renderCrm, clientes:renderClientes,
  servicos:renderServicos, whatsapp:renderWhatsapp, followup:renderFollowup, equipe:renderEquipe,
  historico:renderHistorico, conectores:renderConectores, configuracoes:renderConfiguracoes,
  dia:renderDia, semana:(o) => renderSemana(o) };
const TAGS = { inicio:'DASHBOARD', agenda:'AGENDA', crm:'CRM', clientes:'CLIENTES',
  servicos:'SERVIÇOS', whatsapp:'WHATSAPP', followup:'FOLLOW-UP', equipe:'EQUIPE',
  historico:'HISTÓRICO', conectores:'CONECTORES', configuracoes:'CONFIGURAÇÕES',
  dia:'AGENDA DO DIA', semana:'SEMANA' };

/* Enquanto os dados não chegam, a tela mostra o próprio FORMATO (esqueleto) em
   vez de um "Carregando…" solto: nada pula de lugar quando o conteúdo entra.
   Fica dentro de .esqueleto para NÃO herdar a animação de entrada — senão a
   tela faria dois fades seguidos (o do esqueleto e o do conteúdo). */
function esqueleto(rota) {
  const cartao = `<div class="skel-cartao"><div class="skel" style="width:66px;height:44px"></div>
    <div class="skel-linhas"><div class="skel" style="height:15px;width:52%"></div>
    <div class="skel" style="height:11px;width:78%"></div><div class="skel" style="height:32px"></div></div></div>`;
  const painel = (n) => `<div class="panel"><div class="panel-head"><div class="skel" style="height:18px;width:180px"></div></div>
    <div class="panel-body lista">${cartao.repeat(n)}</div></div>`;
  const miolo = rota === 'inicio' ? `
    <div class="hero-dia"><div><div class="skel" style="height:12px;width:210px"></div>
      <div class="skel" style="height:32px;width:min(460px,80vw);margin-top:10px"></div></div></div>
    <div class="stat-grid row2">${'<div class="skel skel-stat"></div>'.repeat(4)}</div>
    <div class="cols">${painel(2)}${painel(3)}</div>`
    : (rota === 'agenda' || rota === 'dia' || rota === 'followup' || rota === 'semana') ? painel(4)
    : `<div class="panel"><div class="panel-body">
    <div class="skel" style="height:16px;width:38%"></div><div class="skel" style="height:12px;width:72%"></div>
    <div class="skel" style="height:12px;width:64%"></div><div class="skel" style="height:12px;width:48%"></div></div></div>`;
  return `<div class="esqueleto" aria-busy="true" aria-label="Carregando">${miolo}</div>`;
}
/* Esqueleto de formulário em duas colunas — para as telas que pintam em etapas
   (Configurações, WhatsApp) e antes mostravam um "Carregando…" solto. */
function esqueletoFormulario() {
  const campo = '<div class="skel" style="height:11px;width:30%"></div><div class="skel" style="height:40px"></div>';
  const painel = `<div class="panel"><div class="panel-head"><div class="skel" style="height:18px;width:160px"></div></div>
    <div class="panel-body">${campo}${campo}${campo}<div class="skel" style="height:38px;width:140px"></div></div></div>`;
  return `<div class="esqueleto" aria-busy="true" aria-label="Carregando"><div class="cols">${painel}${painel}</div></div>`;
}

/* route('tela')  → troca de tela: esqueleto + entrada animada.
   route()        → ATUALIZA a tela atual em silêncio (depois de salvar, marcar,
                    excluir…): sem esqueleto e sem reanimar — nada pisca.
   `vez` protege contra resposta atrasada: se o usuário já foi para outra tela,
   a resposta velha não pinta por cima da nova.
   A classe 'entrando' entra ANTES de a tela pintar: várias telas (Configurações,
   WhatsApp) pintam em mais de uma etapa, e pôr a classe só no fim fazia o que já
   estava visível sumir e reaparecer. */
async function route(r, opts = {}){
  if (state._cxTimer) { clearInterval(state._cxTimer); state._cxTimer = null; }
  const quieto = !r && opts.quieto !== false && state._pintou === true;
  if (r) state.route = r;
  if (emPresenca()) state.route = 'dia';     // papel 'agenda' só tem uma tela
  const vez = state._vez = (state._vez || 0) + 1;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === state.route));
  $('#pageTag').textContent = TAGS[state.route] || 'DASHBOARD';
  if (!quieto) {
    state._repintar = null;                  // o relógio da tela não repinta uma tela que está saindo
    view.classList.add('entrando');
    view.innerHTML = esqueleto(state.route);
  }
  try {
    await (ROUTES[state.route] || renderInicio)({ quieto, vez });
    if (vez === state._vez) {
      state._pintou = true;
      if (!quieto) {
        clearTimeout(state._entraTimer);
        state._entraTimer = setTimeout(() => view.classList.remove('entrando'), 1200);
      }
    }
  } catch(e){
    if (vez === state._vez) {
      state._pintou = false; state._repintar = null;
      view.innerHTML = `<div class="empty">Erro ao carregar: ${esc(e.message)}</div>`;
    }
  }
  refreshBadge();
}

async function refreshBadge(){
  if (emPresenca()) return;                  // follow-up não existe para esse papel
  try{ const f = await api('GET','/followup'); $('#badgeFollowup').textContent = f.length;
    $('#badgeFollowup').style.display = f.length ? 'flex':'none'; }catch{}
}

function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}

async function loadConsultores(){ state.consultores = await api('GET','/consultores'); }
async function loadEmpresa(){
  state.empresa = await api('GET','/empresa');
  $('#empresaNome').textContent = state.empresa.nome;
  $('#empresaEndereco').textContent = state.empresa.endereco;
  $('#empresaSlogan').textContent = state.empresa.slogan;
}
/* Perfil de quem entrou — só para as iniciais do rodapé e a aba Configurações.
   Falhar aqui não pode impedir o app de abrir: por isso o catch silencioso. */
async function loadPerfil(){
  try { state.perfil = await api('GET','/perfil'); aplicarPerfilNaTela(); }
  catch { /* segue com as iniciais padrão */ }
}
function aplicarPerfilNaTela(){
  const el = $('#avatarPerfil'), p = state.perfil;
  if (!el || !p) return;
  el.textContent = iniciais(p.nome) || 'IC';               // textContent: sem HTML
  el.title = p.nome ? `${p.nome} · ${PAPEL_LABEL[p.papel] || p.papel || ''}`.replace(/ · $/, '')
                    : 'Sua conta';
}

// ---- init -------------------------------------------------------------------
$('#nav').addEventListener('click', e => {
  const item = e.target.closest('.nav-item'); if (!item) return;
  route(item.dataset.route);
});
// Os itens do menu são <a> sem href: pelo teclado, Enter e espaço fazem o papel do clique.
$('#nav').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const item = e.target.closest('.nav-item'); if (!item) return;
  e.preventDefault();
  route(item.dataset.route);
});
$('#btnNovo').addEventListener('click', () => openAgendamentoModal());
$('#btnBusca')?.addEventListener('click', () => abrirBuscaGlobal());

/* ATALHOS DE TECLADO (fora de campo de texto):
     N  → novo agendamento        /  → foca a busca da tela
     Esc → fecha o modal (ou o popover dos apps) */
const digitando = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('#ecoPop') && !$('#ecoPop').hidden) return fecharEco();
    return closeModal();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && !emPresenca()
      && !document.body.classList.contains('deslogado')) { e.preventDefault(); return abrirBuscaGlobal(); }
  if (e.ctrlKey || e.metaKey || e.altKey || modalAberto() || document.body.classList.contains('deslogado')) return;
  if (digitando(e.target)) return;
  if ((e.key === 'n' || e.key === 'N') && !emPresenca()) { e.preventDefault(); openAgendamentoModal(); }
  else if ((e.key === 's' || e.key === 'S') && !emPresenca()) { e.preventDefault(); route('semana'); }
  else if (e.key === '/') {
    const busca = $('.view .search input');
    if (busca) { e.preventDefault(); busca.focus(); busca.select(); }
  }
});

// PWA: service worker + prompt de instalação
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });

/* ============================================================
   FAIXA DE SAÚDE — o vigia carimba em vigia_estado o problema atual do
   sistema; aqui vira uma faixa discreta no topo. Hoje: 'codewords-fora'
   (chave do CodeWords recusada → nenhum WhatsApp automático sai).
   ============================================================ */
const TEXTO_PROBLEMA = {
  'codewords-fora': 'WhatsApp automático parado: a chave do CodeWords foi recusada. '
    + 'Nenhum lembrete ou aviso sai até o gestor trocar a chave em Atendimento › Integrações.',
};
function dataCurtaBR(ts) {
  const d = new Date(ts); if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit' });
}
async function carregarSaude() {
  const faixa = $('#faixaSaude'); if (!faixa) return;
  let s;
  try { s = await api('GET', '/saude'); } catch { return; }          // sem leitura = sem alarme
  state.saude = s;
  if (!s || !s.problema) { faixa.hidden = true; return; }
  const texto = TEXTO_PROBLEMA[s.problema] || s.resumo || `Problema no sistema: ${s.problema}.`;
  faixa.textContent = '';
  const ico = document.createElement('span'); ico.className = 'faixa-ico'; ico.innerHTML = svg(I.alerta);
  const txt = document.createElement('span'); txt.className = 'faixa-txt';
  txt.textContent = texto + (s.desde ? ` (desde ${dataCurtaBR(s.desde)})` : '');
  faixa.append(ico, txt);
  if (s.problema === 'codewords-fora') {
    const a = document.createElement('a'); a.href = 'https://indycar-atendimento.onrender.com'; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'faixa-link'; a.textContent = 'Abrir Atendimento';
    faixa.append(a);
  }
  faixa.hidden = false;
}
setInterval(() => { if (!document.hidden && !document.body.classList.contains('deslogado')) carregarSaude(); }, 5 * 60 * 1000);

/* ============================================================
   SEM INTERNET — faixa enquanto estiver offline; recado quando voltar.
   ============================================================ */
function marcarRede() {
  const f = $('#faixaOffline'); if (!f) return;
  f.hidden = navigator.onLine !== false;
}
window.addEventListener('offline', marcarRede);
window.addEventListener('online', () => {
  marcarRede(); carregarSaude();
  if (lerFila().length && !document.body.classList.contains('deslogado')) enviarFila();
  else toast('Conexão de volta — tudo normal de novo');
});
marcarRede();

/* ============================================================
   ECOSSISTEMA INDYCAR — popover ao lado da barra lateral com os outros apps
   da oficina; este (Agenda) vem marcado "você está aqui".
   ============================================================ */
function desenharEco() {
  const pop = $('#ecoPop'); if (!pop) return;
  pop.innerHTML = `<p class="eco-titulo">Ecossistema IndyCar</p>` + ECOSSISTEMA.map(app => {
    const atual = app.chave === APP_ATUAL;
    return `<a class="eco-item${atual ? ' atual' : ''}" role="menuitem" href="${esc(app.url)}"
      ${atual ? 'aria-current="page"' : 'target="_blank" rel="noopener"'}>
      <span class="eco-ico">${svg(app.ico)}</span>
      <span class="eco-txt"><b>${esc(app.nome)}</b><small>${atual ? 'você está aqui' : esc(app.desc)}</small></span>
      ${atual ? '' : '<span class="eco-seta" aria-hidden="true">↗</span>'}</a>`;
  }).join('');
}
function abrirEco() {
  const pop = $('#ecoPop'), btn = $('#btnEco'); if (!pop || !btn) return;
  if (!pop.innerHTML) desenharEco();
  const r = btn.getBoundingClientRect();
  // ancora ao lado do botão; em tela estreita (≤640) vira folha no pé da tela (CSS)
  pop.style.setProperty('--eco-x', `${r.right + 10}px`);
  pop.style.setProperty('--eco-y', `${Math.max(12, r.bottom - 8)}px`);
  pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
  // setTimeout, não rAF: em aba oculta o rAF não roda e o popover ficaria invisível (opacity 0)
  setTimeout(() => pop.classList.add('aberto'), 10);
  ($('.eco-item:not(.atual)', pop) || pop).focus?.();
}
function fecharEco() {
  const pop = $('#ecoPop'), btn = $('#btnEco'); if (!pop || pop.hidden) return;
  pop.classList.remove('aberto'); pop.hidden = true; btn?.setAttribute('aria-expanded', 'false'); btn?.focus();
}
$('#btnEco')?.addEventListener('click', () => ($('#ecoPop').hidden ? abrirEco() : fecharEco()));
document.addEventListener('click', e => {
  const pop = $('#ecoPop');
  if (!pop || pop.hidden) return;
  if (!pop.contains(e.target) && !e.target.closest('#btnEco')) fecharEco();
});
window.addEventListener('resize', debounce(() => { if ($('#ecoPop') && !$('#ecoPop').hidden) abrirEco(); }, 120));

/* ============================================================
   LOGIN — nada da Agenda aparece antes de entrar
   ============================================================ */
function mostrarLogin(mensagem){
  document.body.classList.add('deslogado');
  $('#telaLogin').hidden = false;
  // Um recado (sessão expirada, servidor fora do ar) é sobre o LOGIN. Se a tela
  // de primeiro acesso estivesse aberta, o aviso ficaria escondido atrás dela.
  if (mensagem) mostrarFormPrimeiro(false);
  const erro = $('#erroLogin');
  if (mensagem) { erro.textContent = mensagem; erro.hidden = false; } else { erro.hidden = true; }
}
function esconderLogin(){
  document.body.classList.remove('deslogado');
  $('#telaLogin').hidden = true;
  $('#erroLogin').hidden = true;
}

/* ---------------------------------------------------------------------------
   PRIMEIRO ACESSO
   Enquanto o sistema não tiver NINGUÉM, a capa de login vira "Vamos começar!" e
   deixa criar a conta do dono, que nasce administrador. Depois disso a rota se
   fecha sozinha e quem cadastra os outros é ele, em Configurações › Equipe.

   Quem cria a conta é o servidor, não o navegador: o cadastro público do
   Supabase exige confirmação por e-mail e recusa domínio que não seja de e-mail
   de verdade — o @indycartaubate.com voltava como "Email address is invalid".
   --------------------------------------------------------------------------- */
let primeiroAberto = false;      // o sistema ainda não tem NINGUÉM cadastrado

function mostrarFormPrimeiro(mostrar){
  $('#formLogin').hidden    = mostrar;
  $('#formPrimeiro').hidden = !mostrar;
  // o convite para criar conta some assim que existir alguém — não é um
  // cadastro aberto, é só o arranque do sistema
  $('#btnCriarConta').hidden = mostrar || !primeiroAberto;
  $('#erroLogin').hidden    = true;
  $('#erroPrimeiro').hidden = true;
}

async function verPrimeiroAcesso(){
  try {
    const r = await fetch('/api/primeiro-acesso');
    const j = await r.json();
    primeiroAberto = j.aberto === true;
    if (primeiroAberto) mostrarFormPrimeiro(true);
  } catch { /* servidor fora do ar: a tela de login normal já avisa */ }
}

$('#btnCriarConta').addEventListener('click', () => mostrarFormPrimeiro(true));
$('#btnVoltarLogin').addEventListener('click', () => mostrarFormPrimeiro(false));

$('#formPrimeiro').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#btnPrimeiro'), erro = $('#erroPrimeiro');
  const falha = (m) => { erro.textContent = m; erro.hidden = false; };
  erro.hidden = true;

  const nome  = $('#pa_nome').value.trim();
  const email = $('#pa_email').value.trim().toLowerCase();
  const senha = $('#pa_s1').value;
  if (!nome)  return falha('Escreva o seu nome.');
  if (!email) return falha('Escreva o e-mail que você vai usar para entrar.');
  if (senha.length < 8) return falha('A senha precisa ter pelo menos 8 caracteres.');
  if (senha !== $('#pa_s2').value) return falha('As duas senhas não são iguais. Confira e tente de novo.');

  btn.disabled = true; btn.textContent = 'CRIANDO…';
  try {
    const r = await fetch('/api/primeiro-acesso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui criar a conta. Tente de novo.');
    primeiroAberto = false;          // agora existe gente: a porta se fecha

    // Já entra, sem obrigar a pessoa a digitar tudo outra vez.
    const { error } = sb ? await sb.auth.signInWithPassword({ email, password: senha })
                         : { error: new Error('sem conexão com o Supabase') };
    if (error) return mostrarLogin('Conta criada! Agora entre com o seu e-mail e a senha que você escolheu.');

    $('#pa_s1').value = ''; $('#pa_s2').value = '';
    mostrarFormPrimeiro(false);
    esconderLogin();
    await abrirApp();
    if (j.aviso) toast(j.aviso, 'err');
  } catch (err) { falha(err.message); }
  finally { btn.disabled = false; btn.textContent = 'CRIAR MINHA CONTA'; }
});

async function abrirApp(){
  // o perfil vem PRIMEIRO: é ele que diz o que esta pessoa pode ver
  await loadPerfil();
  carregarSaude();                           // faixa no topo, sem segurar a abertura
  if (emPresenca()) {
    // papel 'agenda' (só presença): menu e botão de novo agendamento somem;
    // o servidor recusaria tudo isso de qualquer jeito.
    document.body.classList.add('portaria');
    state.entrada = null;                    // link de cliente não vale para quem só marca presença
    await loadEmpresa().catch(() => { /* segue com o nome padrão */ });
    await route('dia');
    return;
  }
  await Promise.all([ loadEmpresa(), loadConsultores() ]);
  const qs = new URLSearchParams(location.search);
  const r0 = qs.get('r');
  await route(r0 && ROUTES[r0] ? r0 : 'inicio');
  desenharFila(); enviarFila();               // marcações feitas sem internet numa visita anterior
  if (state.entrada) { const e = state.entrada; state.entrada = null; await abrirEntrada(e); }
  else if (qs.get('novo') === '1') openAgendamentoModal();
}

$('#formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = $('#btnEntrar');
  btn.disabled = true; btn.textContent = 'ENTRANDO…';
  try {
    if (!sb) throw new Error('Conexão com o Supabase não configurada.');
    const { error } = await sb.auth.signInWithPassword({
      email: f.loginEmail.value.trim(), password: f.loginSenha.value,
    });
    if (error) throw new Error(/invalid login/i.test(error.message)
      ? 'E-mail ou senha incorretos.' : error.message);
    f.loginSenha.value = '';
    esconderLogin();
    await abrirApp();
  } catch (err) { mostrarLogin(err.message); }
  finally { btn.disabled = false; btn.textContent = 'ENTRAR'; }
});

/* ============================================================
   TEMA CLARO / ESCURO
   O <html data-tema> já foi definido pelo script inline do <head>
   (para não piscar na abertura). Aqui só mantemos o botão, a cor da
   barra do navegador e o localStorage em dia.
   Atenção: o fundo do body NÃO tem transição — ver o comentário em
   styles.css. Com transição, o Chrome congela a cor antiga quando quem
   muda é uma variável CSS, e a página fica escura com a lateral clara.
   ============================================================ */
const TEMA_KEY = 'indycar_tema';
const temaAtual = () =>
  document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';

function aplicarTema(tema){
  const claro = tema === 'claro';
  const raiz = document.documentElement;

  /* Desliga TODA transição enquanto as variáveis mudam. Sem isto, o Chrome
     congela a cor antiga em quem tem transição na propriedade afetada — foi
     medido: a barra lateral continuava com o cinza do tema escuro 2s depois
     de trocar para o claro. Ver o comentário em styles.css. */
  raiz.setAttribute('data-trocando-tema', '');
  raiz.setAttribute('data-tema', claro ? 'claro' : 'escuro');
  void (document.body || raiz).offsetHeight;       // força o recálculo agora
  // setTimeout, não requestAnimationFrame: em aba oculta o rAF não roda e a
  // marca ficaria grudada, deixando o app inteiro sem transição nenhuma.
  clearTimeout(state._temaTimer);
  state._temaTimer = setTimeout(() => raiz.removeAttribute('data-trocando-tema'), 60);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', claro ? '#eef0f4' : '#070a14');

  const ico = $('#temaIco'), txt = $('#temaTxt'), btn = $('#btnTema');
  if (ico) ico.textContent = claro ? '☀️' : '🌙';
  if (txt) txt.textContent = claro ? 'Claro' : 'Escuro';
  if (btn) btn.title = claro ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';

  try { localStorage.setItem(TEMA_KEY, claro ? 'claro' : 'escuro'); } catch { /* ignora */ }
}

$('#btnTema')?.addEventListener('click', () =>
  aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro'));

// Deixa o botão e o meta coerentes com o que o script do <head> já aplicou.
aplicarTema(temaAtual());

(async function init(){
  mostrarLogin();                        // capa primeiro: nada vaza antes da senha
  try { CONFIG = await (await fetch('/api/config')).json(); }
  catch { return mostrarLogin('Não consegui falar com o servidor. Ele está rodando?'); }

  if (!CONFIG.configurado) {
    return mostrarLogin('Falta configurar o Supabase no servidor (SUPABASE_URL, '
      + 'SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY).');
  }
  if (!window.supabase?.createClient) {
    return mostrarLogin('A biblioteca do Supabase não carregou. Verifique sua conexão.');
  }
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

  const { data } = await sb.auth.getSession();
  if (data?.session) {
    esconderLogin();
    try { await abrirApp(); } catch (err) { mostrarLogin(err.message); }
  } else {
    // Sem sessão: pode ser que ninguém tenha sido cadastrado ainda neste sistema.
    await verPrimeiroAcesso();
  }
})();
