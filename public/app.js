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
};
const svg = (p, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${p}</svg>`;

// ---- estado -----------------------------------------------------------------
const state = { route:'inicio', empresa:{}, consultores:[] };

// ---- API --------------------------------------------------------------------
async function api(method, path, body) {
  const opt = { method, headers:{ 'Content-Type':'application/json' } };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opt);
  const data = await r.json().catch(() => ({}));
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
function dataExtenso(iso) {
  const d = new Date(iso + 'T12:00:00');
  return cap(d.toLocaleDateString('pt-BR',{weekday:'long'})) + ', ' +
         d.getDate() + ' De ' + cap(d.toLocaleDateString('pt-BR',{month:'long'})) + ' De ' + d.getFullYear();
}
const dataBR = (iso) => { if(!iso) return ''; const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; };
const STATUS_LABEL = { aguardando:'Aguardando', confirmado:'Confirmado', em_atendimento:'Em atendimento',
  compareceu:'Compareceu', nao_veio:'Não veio', concluido:'Concluído', nao_fechou:'Não fechou' };

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
      <div class="appt-time">${esc(a.hora)}</div>
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
    const id = +card.dataset.id;
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
        toast(`Marcado como "${STATUS_LABEL[act]}"`); route();
      } catch (e) { toast(e.message, 'err'); }
    }));
  });
}

// ============================================================================
// VIEWS
// ============================================================================
const view = $('#view');

async function renderInicio() {
  const d = await api('GET', '/dashboard');
  const c = d.cards;
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
        <div class="panel-body" id="agendaHoje">
          ${d.agendaHoje.length ? d.agendaHoje.map(appointmentCard).join('') : '<div class="empty">Nenhum agendamento para hoje.</div>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.calendar)} Últimos agendamentos</h2></div>
        <div class="panel-body" id="ultimos">
          ${d.ultimos.length ? d.ultimos.map(a => appointmentCard({...a, _ultimo:true})).join('') : '<div class="empty">Nenhum agendamento ainda.</div>'}
        </div>
      </div>
    </div>`;
  bindApptActions(view);
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
    const id = +tr.dataset.id;
    tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openClienteModal(id));
    tr.querySelector('[data-act="wa"]')?.addEventListener('click', () => openWhatsappModal(null, id));
    tr.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
      if (!confirm('Excluir cliente?')) return;
      await api('DELETE', `/clientes/${id}`); toast('Cliente excluído'); renderClientes();
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
    const id = +tr.dataset.id;
    tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openConsultorModal(id));
    tr.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
      if (!confirm('Excluir consultor?')) return;
      await api('DELETE', `/consultores/${id}`); toast('Consultor excluído'); renderEquipe();
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

async function waConexao(box) {
  const cfg = await api('GET','/whatsapp/ia/config');
  box.innerHTML = `
    <div class="wa-grid">
      <div class="panel"><div class="panel-head"><h2>${svg(I.phone)} Conectar número por QR Code</h2>
        <span class="badge-pill bp-gray" id="cx_status">—</span></div>
        <div class="panel-body" style="align-items:center;text-align:center">
          <div id="cx_qr" style="background:#fff;padding:14px;border-radius:14px;width:248px;height:248px;margin:6px auto;display:flex;align-items:center;justify-content:center"><span style="color:#888">Carregando QR…</span></div>
          <div id="cx_info" class="muted" style="font-size:12.5px;margin-top:8px;max-width:320px">No celular: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> → aponte para o QR. (Renova sozinho a cada ~25s.)</div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn primary" id="cx_refresh">${svg(I.wa)} Atualizar QR</button>
            <button class="btn" id="cx_reconnect">Reconectar</button>
          </div>
        </div></div>
      <div class="panel"><div class="panel-head"><h2>${svg(I.gear)} Dispositivo (CodeWords)</h2></div>
        <div class="panel-body">
          <div class="field"><label>Gerenciador de dispositivos</label>
            <input id="cx_sid" value="${esc(cfg.cw_connect_service_id||'whatsapp_device_manager')}" placeholder="whatsapp_device_manager"></div>
          <div class="field"><label>Device ID</label>
            <input id="cx_dev" value="${esc(cfg.cw_device_id||'')}" placeholder="uuid do dispositivo"></div>
          <div style="display:flex;gap:8px">
            <button class="btn primary" id="cx_save">${svg(I.check)} Salvar</button>
            <button class="btn" id="cx_criar">${svg(I.plus)} Criar dispositivo</button>
          </div>
          <div class="tpl" style="margin-top:12px"><div class="tpl-body"><b>Status:</b> <span id="cx_status2">—</span></div></div>
          <small class="muted" style="display:block;margin-top:10px">O dispositivo fica vinculado ao atendente <b>Carlos</b>. Conectado o número, ele responde no WhatsApp e os agendamentos entram aqui sozinhos (importação a cada 3 min).</small>
        </div></div>
    </div>`;

  const setStatus = (txt, cls) => {
    const a = $('#cx_status'); a.textContent = txt; a.className = 'badge-pill ' + cls;
    const b = $('#cx_status2'); if (b) b.textContent = txt;
  };
  function renderQR(qr) {
    const el = $('#cx_qr'); el.innerHTML = '';
    if (!qr) { el.innerHTML = '<span style="color:#888">Sem QR no momento</span>'; return; }
    if (/^data:image\//.test(qr) || /^https?:\/\//.test(qr)) {
      const img = document.createElement('img'); img.src = qr; img.style.cssText = 'width:220px;height:220px;object-fit:contain'; el.appendChild(img); return;
    }
    if (/^[A-Za-z0-9+/=]+$/.test(qr) && qr.length > 400) { // base64 sem prefixo → PNG
      const img = document.createElement('img'); img.src = 'data:image/png;base64,' + qr; img.style.cssText = 'width:220px;height:220px;object-fit:contain'; el.appendChild(img); return;
    }
    try { new QRCode(el, { text: qr, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.L }); }
    catch(e) { el.innerHTML = '<span style="color:#888;font-size:11px;word-break:break-all">' + esc(qr.slice(0,60)) + '…</span>'; }
  }
  let ultimoQr = 0;
  async function atualizarQR() {
    try { const r = await api('GET','/whatsapp/conexao'); if (r.qr) { renderQR(r.qr); ultimoQr = Date.now(); } return r; }
    catch(e){ return {}; }
  }
  async function tick() {
    try {
      const s = await api('GET','/whatsapp/conexao?only=status');
      if (!s.configurado) { setStatus('não configurado','bp-orange'); $('#cx_info').textContent = s.erro || 'Informe/crie o dispositivo ao lado e salve.'; $('#cx_qr').innerHTML = '<span style="color:#888">—</span>'; return; }
      if (!s.ok) { setStatus('erro','bp-red'); $('#cx_info').textContent = s.erro || 'Erro ao consultar.'; return; }
      if (s.conectado) {
        setStatus('conectado ✅','bp-green');
        $('#cx_qr').innerHTML = '<div style="color:#16a34a;font-weight:800;font-size:15px">✅ Número conectado!</div>';
        if (state._cxTimer) { clearInterval(state._cxTimer); state._cxTimer = null; }
        return;
      }
      setStatus('aguardando leitura','bp-orange');
      if (Date.now() - ultimoQr > 22000) await atualizarQR();
    } catch(e) { setStatus('erro','bp-red'); }
  }
  $('#cx_save').addEventListener('click', async () => {
    try { await api('PUT','/whatsapp/ia/config',{ cw_connect_service_id: $('#cx_sid').value.trim() || 'whatsapp_device_manager', cw_device_id: $('#cx_dev').value.trim() }); toast('Dispositivo salvo ✅'); renderWhatsapp(); }
    catch(e){ toast(e.message,'err'); }
  });
  $('#cx_criar').addEventListener('click', async () => {
    if (!confirm('Criar um novo dispositivo no CodeWords (vinculado ao Carlos)?')) return;
    try { const r = await api('POST','/whatsapp/conexao/criar',{}); if (r.ok) { toast('Dispositivo criado ✅'); renderWhatsapp(); } else toast(r.erro || 'Falhou','err'); }
    catch(e){ toast(e.message,'err'); }
  });
  $('#cx_refresh').addEventListener('click', () => atualizarQR());
  $('#cx_reconnect').addEventListener('click', async () => {
    try { await api('GET','/whatsapp/conexao?acao=reconnect'); toast('Reconexão solicitada'); setTimeout(tick, 800); }
    catch(e){ toast(e.message,'err'); }
  });

  await atualizarQR(); tick();
  state._cxTimer = setInterval(tick, 4000);
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
    const id = +el.dataset.id;
    el.querySelector('[data-act="usar"]')?.addEventListener('click', () => openWhatsappModal(null, null, id));
    el.querySelector('[data-act="edit"]')?.addEventListener('click', () => openTemplateModal(id));
    el.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
      if (!confirm('Excluir modelo?')) return;
      await api('DELETE', `/whatsapp/templates/${id}`); toast('Modelo excluído'); waModelos(box);
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
              <div class="meta">${esc(m.created_at)} · ${statusMsg(m.status)}${m.erro?` · ${esc(m.erro)}`:''}</div></div>
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
  let a = { cliente_nome:'',telefone:'',veiculo:'',placa:'',servico:'',data:new Date().toISOString().slice(0,10),
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
          ${['Google','Indicação','Instagram','Facebook','WhatsApp','Passagem'].map(o=>`<option ${o==a.origem?'selected':''}>${o}</option>`).join('')}
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
        <div class="field"><label>Modelo</label><input id="c_mod" value="${esc(c.modelo)}"></div>
        <div class="field"><label>Origem</label><select id="c_ori">${['Google','Indicação','Instagram','Facebook','WhatsApp','Passagem'].map(o=>`<option ${o==c.origem?'selected':''}>${o}</option>`).join('')}</select></div>
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
    const r = await api('POST','/whatsapp/preparar',{ template_id:+tid, agendamento_id:agId||null, nome:$('#w_nome').value, telefone:$('#w_tel').value });
    $('#w_corpo').value = r.corpo;
  }
  if (templateId) carregaTemplate();
  $('#w_tpl').addEventListener('change', carregaTemplate);
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
  whatsapp:renderWhatsapp, followup:renderFollowup, equipe:renderEquipe, historico:renderHistorico,
  conectores:renderConectores };
const TAGS = { inicio:'DASHBOARD', agenda:'AGENDA', crm:'CRM', clientes:'CLIENTES',
  whatsapp:'WHATSAPP', followup:'FOLLOW-UP', equipe:'EQUIPE', historico:'HISTÓRICO', conectores:'CONECTORES' };

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

// ---- init -------------------------------------------------------------------
$('#nav').addEventListener('click', e => {
  const item = e.target.closest('.nav-item'); if (!item) return;
  route(item.dataset.route);
});
$('#btnNovo').addEventListener('click', () => openAgendamentoModal());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// PWA: service worker + prompt de instalação
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });

(async function init(){
  await Promise.all([ loadEmpresa(), loadConsultores() ]);
  // atalhos do app instalado (?r=agenda, ?novo=1)
  const qs = new URLSearchParams(location.search);
  const r0 = qs.get('r');
  await route(r0 && ROUTES[r0] ? r0 : 'inicio');
  if (qs.get('novo') === '1') openAgendamentoModal();
})();
