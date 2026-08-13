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
};
const svg = (p, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${p}</svg>`;

// ---- estado -----------------------------------------------------------------
const state = { route:'inicio', empresa:{}, consultores:[] };

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
function toast(msg, type = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = `toast show ${type}`;
  setTimeout(() => (t.className = 'toast'), 2600);
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
// Origens aceitas pelo banco compartilhado. Faltar uma aqui fazia o formulário
// reescrever a origem do cliente em silêncio ao salvar.
const ORIGENS = ['Google','Indicação','Instagram','Facebook','WhatsApp','Passagem','Telefone','Orgânico'];
// Papéis da tabela `perfis` (compartilhada com o CRM e o Atendimento).
const PAPEL_LABEL = { admin:'Administrador', gestor:'Gestor', atendente:'Atendente' };
// Como a janela de agendamento grava os dias — a tela mostra por extenso.
const DIAS_LABEL = { 'seg-sex':'Segunda a sexta', 'sabado':'Sábado', 'domingo':'Domingo',
  'seg-sab':'Segunda a sábado', 'todos':'Todos os dias' };

// ============================================================================
// CARD DE AGENDAMENTO
// ============================================================================
function appointmentCard(a) {
  const badges = [];
  if (a.confirmado) badges.push('<span class="badge-pill bp-green">Confirmado</span>');
  else badges.push('<span class="badge-pill bp-orange">Aguardando</span>');
  if (a.compareceu === 0) badges.push('<span class="badge-pill bp-red">Não veio</span>');
  if (a.compareceu === 1 && a.status !== 'concluido') badges.push('<span class="badge-pill bp-green">Compareceu</span>');
  if (a.status === 'em_atendimento') badges.push('<span class="badge-pill bp-blue">Em atendimento</span>');
  if (a.status === 'concluido') badges.push('<span class="badge-pill bp-purple">Concluído</span>');
  if (a.status === 'nao_fechou') badges.push('<span class="badge-pill bp-orange">Não fechou</span>');

  const veic = a.veiculo ? `${esc(a.veiculo)}${a.placa ? ` (${esc(a.placa)})` : ''}` : (a.placa ? `(${esc(a.placa)})` : '');
  return `
  <div class="appt s-${a.status}" data-id="${a.id}">
    <div class="appt-top">
      <div class="appt-time">${esc(a.hora)}<span class="appt-date">${dataBR(a.data)}</span></div>
      <div class="appt-main">
        <div class="appt-title"><b>${esc(a.cliente_nome)}</b>${veic ? ` · ${veic}` : ''}</div>
        <div class="appt-service">${esc(a.servico)}${a.consultor_nome ? ` · ${esc(a.consultor_nome)}` : ''}</div>
      </div>
      <div class="appt-badges">${badges.join('')}</div>
    </div>
    <div class="appt-meta">
      <span>${svg(I.user)} ${esc(a.cliente_nome)}</span>
      ${a.telefone ? `<span>${svg(I.phone)} ${esc(a.telefone)}</span>` : ''}
      ${a.placa ? `<span>${svg(I.car)} ${esc(a.placa)}</span>` : ''}
      <span>${svg(I.pin)} ${esc(a.origem || 'Google')}</span>
    </div>
    <div class="appt-actions">
      <button class="act green" data-act="compareceu">${svg(I.check)} Compareceu</button>
      <button class="act red" data-act="nao_veio">${svg(I.x)} Não veio</button>
      <button class="act blue" data-act="em_atendimento">${svg(I.play)} Em atendimento</button>
      <button class="act purple" data-act="concluido">${svg(I.flag)} Concluído</button>
      <button class="act wa" data-act="whatsapp">${svg(I.wa)} WhatsApp</button>
      <button class="act blue" data-act="gcal" title="Adicionar ao Google Agenda">${svg(I.calendar)} Google</button>
      <button class="act" data-act="editar">${svg(I.edit)} Editar</button>
      <button class="act red" data-act="excluir">${svg(I.trash)}</button>
    </div>
  </div>`;
}

// delegação de cliques nos cards
function bindApptActions(root) {
  $$('.appt', root).forEach(card => {
    // id é uuid (string) desde a migração para o Supabase — não converter com +
    const id = card.dataset.id;
    $$('.act', card).forEach(btn => btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      try {
        if (act === 'editar')  return openAgendamentoModal(id);
        if (act === 'whatsapp')return openWhatsappModal(id);
        if (act === 'gcal') {
          const a = await api('GET', `/agendamentos/${id}`);
          const ini = a.data.replace(/-/g,'') + 'T' + a.hora.replace(':','') + '00';
          const fimD = new Date(`${a.data}T${a.hora}:00`); fimD.setMinutes(fimD.getMinutes()+60);
          const p = (n)=>String(n).padStart(2,'0');
          const fim = `${fimD.getFullYear()}${p(fimD.getMonth()+1)}${p(fimD.getDate())}T${p(fimD.getHours())}${p(fimD.getMinutes())}00`;
          const det = [`Serviço: ${a.servico}`, a.veiculo?`Veículo: ${a.veiculo}${a.placa?' ('+a.placa+')':''}`:'', a.telefone?`WhatsApp: ${a.telefone}`:''].filter(Boolean).join('\n');
          const u = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
            + '&text=' + encodeURIComponent('🔧 ' + a.cliente_nome + ' — ' + a.servico)
            + '&dates=' + ini + '/' + fim
            + '&details=' + encodeURIComponent(det)
            + '&location=' + encodeURIComponent(state.empresa.endereco || '');
          window.open(u, '_blank'); return;
        }
        if (act === 'excluir') {
          if (!confirm('Excluir este agendamento?')) return;
          await api('DELETE', `/agendamentos/${id}`); toast('Agendamento excluído'); return route();
        }
        await api('PATCH', `/agendamentos/${id}/status`, { status: act });
        // O gatilho do banco também move o lead no CRM (compareceu/em_atendimento
        // → "Em serviço"; concluído → "Concluído") — o recado conta isso. A aba
        // "Já vieram" só existe no Início; nas outras telas o recado não a cita.
        if (act === 'compareceu') toast(state.route === 'inicio'
          ? 'Cliente chegou ✅ — foi para "Já vieram" e o CRM registrou'
          : 'Cliente chegou ✅ — registrado no CRM');
        else if (act === 'concluido') toast('Concluído 🏁 — registrado no CRM');
        else toast(`Marcado como "${STATUS_LABEL[act]}"`);
        route();
      } catch (e) { toast(e.message, 'err'); }
    }));
  });
}

// ============================================================================
// VIEWS
// ============================================================================
const view = $('#view');

/* Em qual das três abas do dia o agendamento entra. "Não fechou" fica com quem
   veio: a pessoa ESTEVE na oficina, só não fechou o serviço.
   O status vivo (aguardando/confirmado) manda primeiro: um "Não veio" marcado
   por engano e depois editado de volta para Confirmado tem de voltar para a
   aba Agendados, mesmo com o bit compareceu antigo ainda gravado. */
function grupoDoDia(a) {
  if (['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1) return 'agendados';
  if (a.compareceu === 1 || ['compareceu', 'em_atendimento', 'concluido', 'nao_fechou'].includes(a.status)) return 'vieram';
  if (a.compareceu === 0 || ['nao_veio', 'cancelado'].includes(a.status)) return 'faltaram';
  return 'agendados';
}
const VAZIO_HOJE = {
  agendados: 'Ninguém esperando. Quando o cliente chegar, toque em "Compareceu" no card dele.',
  vieram: 'Ninguém chegou ainda. Ao tocar em "Compareceu", o cliente vem para cá — e o CRM registra sozinho.',
  faltaram: 'Ninguém faltou hoje. 👏',
};

async function renderInicio() {
  const d = await api('GET', '/dashboard');
  const c = d.cards;
  const grupos = { agendados: [], vieram: [], faltaram: [] };
  for (const a of d.agendaHoje) grupos[grupoDoDia(a)].push(a);
  if (!['agendados', 'vieram', 'faltaram'].includes(state.hojeTab)) state.hojeTab = 'agendados';

  const tabHoje = (chave, rotulo) =>
    `<button type="button" class="tab ${state.hojeTab === chave ? 'active' : ''}" data-hoje-tab="${chave}">
       ${rotulo} <em class="tab-num">${grupos[chave].length}</em></button>`;

  view.innerHTML = `
    <div class="stat-grid">
      ${statCard('red',    c.totalHoje,      'Agendamentos hoje', I.calendar)}
      ${statCard('green',  c.concluidosHoje, 'Concluídos hoje',   I.flag)}
      ${statCard('orange', c.compareceram,   'Compareceram',      I.check)}
      ${statCard('blue',   c.totalClientes,  'Clientes',          I.user)}
      ${statCard('purple', c.totalConsult,   'Consultores',       I.user)}
    </div>
    <div class="stat-grid row2">
      ${statCard('green',  c.compareceram, 'Compareceram', I.check, true)}
      ${statCard('red',    c.naoVieram,    'Não vieram',   I.x, true)}
      ${statCard('orange', c.naoFechou,    'Não fechou',   I.x, true)}
      ${statCard('cyan',   c.aguardando,   'Aguardando hoje', I.calendar, true)}
    </div>
    <div class="cols">
      <div class="panel">
        <div class="panel-head">
          <h2>${svg(I.calendar)} Agenda de hoje</h2>
          <span class="date">${dataExtenso(d.data)}</span>
        </div>
        <div class="tabs tabs-hoje" id="tabsHoje">
          ${tabHoje('agendados', '🕒 Agendados')}
          ${tabHoje('vieram', '✅ Já vieram')}
          ${tabHoje('faltaram', '❌ Não vieram')}
        </div>
        <div class="panel-body" id="agendaHoje"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.calendar)} Últimos agendamentos</h2></div>
        <div class="panel-body" id="ultimos">
          ${d.ultimos.length ? d.ultimos.map(appointmentCard).join('') : '<div class="empty">Nenhum agendamento ainda.</div>'}
        </div>
      </div>
    </div>`;

  // Pinta só o corpo do painel ao trocar de aba — sem voltar ao servidor.
  const pintarHoje = () => {
    $$('#tabsHoje .tab').forEach(b => b.classList.toggle('active', b.dataset.hojeTab === state.hojeTab));
    const lista = grupos[state.hojeTab];
    const box = $('#agendaHoje');
    box.innerHTML = lista.length ? lista.map(appointmentCard).join('')
      : `<div class="empty">${VAZIO_HOJE[state.hojeTab]}</div>`;
    bindApptActions(box);
  };
  $$('#tabsHoje .tab').forEach(b => b.addEventListener('click', () => {
    state.hojeTab = b.dataset.hojeTab;
    pintarHoje();
  }));
  pintarHoje();
  bindApptActions($('#ultimos'));
}
function statCard(cls, num, lbl, ico, mini = false) {
  return `<div class="stat ${cls}${mini?' mini':''}">
    <div class="ico">${svg(ico)}</div>
    <div class="num">${num}</div>
    <div class="lbl">${lbl}</div>
  </div>`;
}

async function renderAgenda() {
  const list = await api('GET', '/agendamentos');
  view.innerHTML = `
    <div class="toolbar">
      <div class="left">
        <div class="search">${svg(I.search)}<input id="qAgenda" placeholder="Buscar por cliente, placa, telefone..."></div>
      </div>
      <button class="btn primary" onclick="openAgendamentoModal()">${svg(I.plus)} Novo agendamento</button>
    </div>
    <div class="panel"><div class="panel-body" id="agendaList">
      ${list.length ? list.map(appointmentCard).join('') : '<div class="empty">Nenhum agendamento cadastrado.</div>'}
    </div></div>`;
  bindApptActions(view);
  $('#qAgenda').addEventListener('input', debounce(async e => {
    const r = await api('GET', '/agendamentos?q=' + encodeURIComponent(e.target.value));
    const box = $('#agendaList');
    box.innerHTML = r.length ? r.map(appointmentCard).join('') : '<div class="empty">Nada encontrado.</div>';
    bindApptActions(box);
  }, 250));
}

async function renderClientes() {
  const list = await api('GET', '/clientes');
  view.innerHTML = `
    <div class="toolbar">
      <div class="left"><div class="search">${svg(I.search)}<input id="qCli" placeholder="Buscar cliente..."></div></div>
      <button class="btn primary" onclick="openClienteModal()">${svg(I.plus)} Novo cliente</button>
    </div>
    <div class="panel"><table class="table"><thead><tr>
      <th>Nome</th><th>Telefone</th><th>Veículo</th><th>Placa</th><th>Origem</th><th></th>
    </tr></thead><tbody id="cliBody">${clienteRows(list)}</tbody></table></div>`;
  bindCliRows();
  $('#qCli').addEventListener('input', debounce(async e => {
    const r = await api('GET', '/clientes?q=' + encodeURIComponent(e.target.value));
    $('#cliBody').innerHTML = clienteRows(r); bindCliRows();
  }, 250));
}
function clienteRows(list) {
  if (!list.length) return '<tr><td colspan="6" class="empty">Nenhum cliente.</td></tr>';
  return list.map(c => `<tr data-id="${c.id}">
    <td><b>${esc(c.nome)}</b></td><td>${esc(c.telefone||'—')}</td>
    <td>${esc(c.veiculo||'—')}</td><td>${esc(c.placa||'—')}</td>
    <td><span class="badge-pill bp-gray">${esc(c.origem||'—')}</span></td>
    <td><div class="actions">
      <button class="icon-btn wa" data-act="wa" title="WhatsApp">${svg(I.wa)}</button>
      <button class="icon-btn" data-act="edit" title="Editar">${svg(I.edit)}</button>
      <button class="icon-btn red" data-act="del" title="Excluir">${svg(I.trash)}</button>
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
      try { await api('DELETE', `/clientes/${id}`); toast('Cliente excluído'); renderClientes(); }
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
      <tbody>${list.map(c => `<tr data-id="${c.id}">
        <td><span style="display:inline-flex;align-items:center;gap:9px">
          <i style="width:12px;height:12px;border-radius:50%;background:${esc(c.cor)};display:inline-block"></i>
          <b>${esc(c.nome)}</b></span></td>
        <td>${esc(c.telefone||'—')}</td>
        <td><span class="badge-pill ${c.ativo?'bp-green':'bp-gray'}">${c.ativo?'Ativo':'Inativo'}</span></td>
        <td><div class="actions">
          <button class="icon-btn" data-act="edit">${svg(I.edit)}</button>
          <button class="icon-btn red" data-act="del">${svg(I.trash)}</button>
        </div></td></tr>`).join('')}
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
          <div><div style="display:flex;justify-content:space-between;font-size:13px">
            <span>${esc(o.origem||'—')}</span><b>${o.total}</b></div>
            <div class="bar"><i style="width:${(o.total/maxOri*100).toFixed(0)}%"></i></div></div>`).join('')
          : '<div class="empty">Sem dados.</div>'}</div></div>
      <div class="panel"><div class="panel-head"><h2>${svg(I.user)} Desempenho por consultor</h2></div>
        <div class="panel-body"><table class="table"><thead><tr><th>Consultor</th><th>Agend.</th><th>Concluídos</th></tr></thead>
        <tbody>${d.porConsultor.map(c => `<tr><td>${esc(c.nome)}</td><td>${c.total}</td><td>${c.concluidos||0}</td></tr>`).join('')}
        </tbody></table></div></div>
    </div>`;
}

async function renderFollowup() {
  const list = await api('GET', '/followup');
  view.innerHTML = `
    <div class="toolbar"><div class="left"><h2 style="font-size:18px">Follow-up — retornos pendentes</h2></div></div>
    <div class="panel"><div class="panel-body">
      ${list.length ? list.map(appointmentCard).join('') : '<div class="empty">Tudo em dia! Nenhum retorno pendente. 🏁</div>'}
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
        <td><span class="badge-pill ${statusClass(a.status)}">${STATUS_LABEL[a.status]||a.status}</span></td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty">Sem histórico.</td></tr>'}
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
    <div id="cfgConteudo"><div class="empty">Carregando…</div></div>`;
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
  const conhecido = papel === 'admin' || papel === 'atendente';
  const outra = conhecido ? ''
    : `<option value="${esc(papel)}" selected>${esc(PAPEL_LABEL[papel] || papel || '—')}</option>`;
  return `${outra}
    <option value="atendente"${papel === 'atendente' ? ' selected' : ''}>Atendente</option>
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
Todos os agendamentos aparecem na sua agenda Google e <b>se atualizam sozinhos</b> (o Google sincroniza periodicamente). Cada agendamento também tem o botão 📅 para adicionar na hora.</div></div>
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
    <div id="waContent"><div class="empty">Carregando…</div></div>`;
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
          <div style="border-top:1px solid var(--border);margin:8px 0 4px;padding-top:14px">
            <div class="field"><label class="switch"><input type="checkbox" id="cfg_lemb" ${cfg.lembrete_ativo?'checked':''}> <span>⏰ Lembretes automáticos</span></label>
              <small class="muted">Envia um lembrete automaticamente (pela Cloud API) antes do horário do agendamento.</small></div>
            <div class="field"><label>Enviar quantas horas antes</label><input id="cfg_lembh" type="number" min="1" max="168" value="${cfg.lembrete_horas||24}"></div>
          </div>
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
      numero_exibicao:$('#cfg_num').value.trim(),
      lembrete_ativo:$('#cfg_lemb').checked, lembrete_horas:parseInt($('#cfg_lembh').value)||24 };
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
            <button class="icon-btn" data-act="edit">${svg(I.edit)}</button>
            <button class="icon-btn red" data-act="del">${svg(I.trash)}</button>
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
          <div class="tpl" style="border-color:rgba(37,211,102,.35)"><div class="tpl-body">🟢 <b>Como funciona:</b> a IA já cadastrada no seu WhatsApp atende os clientes. O app só faz 3 coisas:
1. <b>Puxa os agendamentos</b> que a IA fecha e coloca na agenda (sozinho).
2. No <b>"Não veio"</b>, aciona a IA para ela fazer o <b>follow-up</b> com o cliente.
3. Mantém a <b>conexão do número</b> (aba Conexão).
O app <b>não envia nenhuma mensagem automática</b> por conta própria.</div></div>
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
          <small class="muted" style="display:block;margin-top:10px">O follow-up de ausência aparece na aba <b>Mensagens</b> como "delegado à IA" sempre que você marcar <b>Não veio</b>.</small>
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
function openModal(html){ modal.innerHTML = html; overlay.classList.add('open'); }
function closeModal(){ overlay.classList.remove('open'); }
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

function fieldsConsultorOptions(sel){
  return state.consultores.map(c => `<option value="${c.id}" ${c.id==sel?'selected':''}>${esc(c.nome)}</option>`).join('');
}

window.openAgendamentoModal = async function(id){
  const servicos = await api('GET','/servicos').catch(()=>[]);
  let a = { cliente_nome:'',telefone:'',veiculo:'',placa:'',servico:'',data:hojeSP(),
            hora:'09:00',consultor_id:'',origem:'Google',observacoes:'',status:'aguardando',confirmado:0 };
  if (id) a = await api('GET',`/agendamentos/${id}`).catch(()=>null) || a;
  openModal(`
    <div class="modal-head"><h3>${svg(I.calendar)} ${id?'Editar':'Novo'} agendamento</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label>Cliente *</label><input id="f_nome" value="${esc(a.cliente_nome)}"></div>
        <div class="field"><label>Telefone (WhatsApp)</label><input id="f_tel" value="${esc(a.telefone)}" placeholder="12 99999-9999"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Veículo</label><input id="f_veic" value="${esc(a.veiculo)}" placeholder="Ônix"></div>
        <div class="field"><label>Placa</label><input id="f_placa" value="${esc(a.placa)}" placeholder="AURA6742"></div>
      </div>
      <div class="field"><label>Serviço *</label>
        <input id="f_serv" list="servListAg" value="${esc(a.servico)}" placeholder="Selecione ou digite o serviço">
        <datalist id="servListAg">${servicos.map(s=>`<option value="${esc(s.nome)}"></option>`).join('')}</datalist></div>
      <div class="grid3">
        <div class="field"><label>Data *</label><input id="f_data" type="date" value="${a.data}"></div>
        <div class="field"><label>Hora *</label><input id="f_hora" type="time" value="${a.hora}"></div>
        <div class="field"><label>Consultor</label><select id="f_cons"><option value="">—</option>${fieldsConsultorOptions(a.consultor_id)}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Origem</label><select id="f_ori">
          ${ORIGENS.map(o=>`<option ${o==a.origem?'selected':''}>${o}</option>`).join('')}
        </select></div>
        <div class="field"><label>Status</label><select id="f_status">
          ${Object.entries(STATUS_LABEL).map(([k,v])=>`<option value="${k}" ${k==a.status?'selected':''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="field"><label>Observações</label><textarea id="f_obs">${esc(a.observacoes)}</textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="f_save">${svg(I.check)} Salvar</button>
    </div>`);
  $('#f_save').addEventListener('click', async () => {
    const payload = {
      cliente_nome:$('#f_nome').value.trim(), telefone:$('#f_tel').value.trim(),
      veiculo:$('#f_veic').value.trim(), placa:$('#f_placa').value.trim().toUpperCase(),
      servico:$('#f_serv').value.trim(), data:$('#f_data').value, hora:$('#f_hora').value,
      consultor_id:$('#f_cons').value || null, origem:$('#f_ori').value,
      status:$('#f_status').value, confirmado:$('#f_status').value==='confirmado'?1:(a.confirmado||0),
      observacoes:$('#f_obs').value.trim(),
    };
    if(!payload.cliente_nome||!payload.servico||!payload.data||!payload.hora) return toast('Preencha os campos obrigatórios','err');
    try {
      if (id) await api('PUT', `/agendamentos/${id}`, payload);
      else await api('POST', '/agendamentos', payload);
      toast('Agendamento salvo'); closeModal(); route();
    } catch(e){ toast(e.message,'err'); }
  });
};

window.openClienteModal = async function(id){
  let c = {nome:'',telefone:'',veiculo:'',placa:'',modelo:'',origem:'Google',observacoes:''};
  if (id) c = await api('GET','/clientes').then(l=>l.find(x=>x.id===id)) || c;
  openModal(`
    <div class="modal-head"><h3>${svg(I.user)} ${id?'Editar':'Novo'} cliente</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label>Nome *</label><input id="c_nome" value="${esc(c.nome)}"></div>
        <div class="field"><label>Telefone</label><input id="c_tel" value="${esc(c.telefone)}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Veículo</label><input id="c_veic" value="${esc(c.veiculo)}"></div>
        <div class="field"><label>Placa</label><input id="c_placa" value="${esc(c.placa)}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Ano do veículo</label><input id="c_mod" inputmode="numeric" maxlength="4" placeholder="2020" value="${esc(c.modelo)}"></div>
        <div class="field"><label>Origem</label><select id="c_ori">${ORIGENS.map(o=>`<option ${o==c.origem?'selected':''}>${o}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Observações</label><textarea id="c_obs">${esc(c.observacoes)}</textarea></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="c_save">${svg(I.check)} Salvar</button></div>`);
  $('#c_save').addEventListener('click', async () => {
    const p = {nome:$('#c_nome').value.trim(),telefone:$('#c_tel').value.trim(),veiculo:$('#c_veic').value.trim(),
      placa:$('#c_placa').value.trim().toUpperCase(),modelo:$('#c_mod').value.trim(),origem:$('#c_ori').value,observacoes:$('#c_obs').value.trim()};
    if(!p.nome) return toast('Informe o nome','err');
    try{ if(id) await api('PUT',`/clientes/${id}`,p); else await api('POST','/clientes',p);
      toast('Cliente salvo'); closeModal(); renderClientes(); }catch(e){toast(e.message,'err');}
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
        <div class="field"><label>Nome</label><input id="w_nome" value="${esc(nome)}"></div>
        <div class="field"><label>Telefone *</label><input id="w_tel" value="${esc(telefone)}" placeholder="12 99999-9999"></div>
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
// ROTEAMENTO
// ============================================================================
const ROUTES = { inicio:renderInicio, agenda:renderAgenda, crm:renderCrm, clientes:renderClientes,
  servicos:renderServicos, whatsapp:renderWhatsapp, followup:renderFollowup, equipe:renderEquipe,
  historico:renderHistorico, conectores:renderConectores, configuracoes:renderConfiguracoes };
const TAGS = { inicio:'DASHBOARD', agenda:'AGENDA', crm:'CRM', clientes:'CLIENTES',
  servicos:'SERVIÇOS', whatsapp:'WHATSAPP', followup:'FOLLOW-UP', equipe:'EQUIPE',
  historico:'HISTÓRICO', conectores:'CONECTORES', configuracoes:'CONFIGURAÇÕES' };

async function route(r){
  if (state._cxTimer) { clearInterval(state._cxTimer); state._cxTimer = null; }
  if (r) state.route = r;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === state.route));
  $('#pageTag').textContent = TAGS[state.route] || 'DASHBOARD';
  view.innerHTML = '<div class="empty">Carregando…</div>';
  try { await (ROUTES[state.route] || renderInicio)(); }
  catch(e){ view.innerHTML = `<div class="empty">Erro ao carregar: ${esc(e.message)}</div>`; }
  refreshBadge();
}

async function refreshBadge(){
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// PWA: service worker + prompt de instalação
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });

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
  await Promise.all([ loadEmpresa(), loadConsultores(), loadPerfil() ]);
  const qs = new URLSearchParams(location.search);
  const r0 = qs.get('r');
  await route(r0 && ROUTES[r0] ? r0 : 'inicio');
  if (qs.get('novo') === '1') openAgendamentoModal();
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
