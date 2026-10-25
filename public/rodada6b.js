/* ============================================================================
   Agenda — Rodada 6 / C1b (21/10/2026): a Agenda para quem marca 30 horários por dia.
     · LEMBRETE do horário na ficha (situação real do Comunicar + "mandar agora"/"mandar de novo");
     · faixa do Início: "Amanhã: N horários, quantos já foram lembrados" + "Lembrar todos";
     · ESPERA com horários livres de verdade (chips) → abre o Novo agendamento já preenchido;
     · QUADRO por consultor: grade do dia (30 min × consultor), arrastar (ou "Mover") para remarcar só em
       célula livre, Chegou / Não veio / Lembrar no próprio cartão, selos de lembrete, orçamento e etapa
       ao vivo do Pátio, linha do "agora" e atualização sozinha.
   Usa o que o app.js já expõe (api, esc, $, $$, toast, state, route, ROUTES, openAgendamentoModal…).
   ============================================================================ */
(function () {
  'use strict';
  const semAcesso = () => (typeof emPresenca === 'function' && emPresenca()) || state?.perfil?.papel === 'agenda';
  const dow = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const rotuloCurto = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${dow[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`; };
  const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || 'o cliente';
  const emMin = (hm) => { const [h, m] = String(hm || '').slice(0, 5).split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const quando = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
  };

  /* ======================= LEMBRETE na ficha do horário ======================= */
  const TOM = { bom: 'bp-green', aviso: 'bp-orange', ruim: 'bp-red', neutro: 'bp-gray' };
  async function blocoLembreteNaFicha(box, a) {
    if (!box || semAcesso()) return;
    if (!a?.id || !['aguardando', 'confirmado'].includes(a.status || 'aguardando')) { box.innerHTML = ''; box.hidden = true; return; }
    const r = await api('GET', `/agendamentos/${a.id}/lembrete`, null, { repetir: false }).catch(() => null);
    if (!box.isConnected) return;
    if (!r?.situacao) { box.innerHTML = ''; box.hidden = true; return; }
    const s = r.situacao;
    if (['encerrado', 'passou'].includes(s.codigo)) { box.innerHTML = ''; box.hidden = true; return; }
    const comunicar = window.IndyCarApps ? IndyCarApps.url('comunicar') : null;
    const sai = s.codigo === 'agendado' && s.saiEm ? ` · sai ${quando(s.saiEm)}` : '';
    const resposta = r.envio?.resposta ? `<small class="muted">Cliente respondeu: “${esc(r.envio.resposta)}”</small>` : '';
    const desligado = r.cfg && r.cfg.ativo_lembrete === false && s.codigo !== 'automatico_desligado'
      ? '<small class="muted">O lembrete automático está desligado no Comunicar.</small>' : '';
    box.hidden = false;
    box.innerHTML = `<div class="patio-ficha r6b-lembrete" data-lembrete="${esc(s.codigo)}">
      <div class="patio-ficha-topo"><b>Lembrete</b> <span class="badge-pill ${TOM[s.tom] || 'bp-gray'}">${esc(s.rotulo)}${esc(sai)}</span></div>
      ${s.motivo && !['agendado'].includes(s.codigo) ? `<small class="muted">${esc(s.motivo)}</small>` : ''}${resposta}${desligado}
      <div class="eco-links">
        ${s.podeMandar ? `<button type="button" class="btn mini primary" data-r6b-mandar>📨 Mandar lembrete agora</button>` : ''}
        ${s.codigo === 'enviado' ? `<button type="button" class="btn mini" data-r6b-mandar="reenviar">↻ Mandar de novo</button>` : ''}
        ${comunicar ? `<a class="btn mini" href="${esc(comunicar)}">Abrir o Comunicar ↗</a>` : ''}
      </div></div>`;
    $$('[data-r6b-mandar]', box).forEach((b) => b.addEventListener('click', async () => {
      const reenviar = b.dataset.r6bMandar === 'reenviar';
      if (reenviar && !confirm(`O lembrete já foi enviado para ${primeiro(a.cliente_nome)}. Mandar de novo?`)) return;
      b.disabled = true;
      try {
        const x = await api('POST', `/agendamentos/${a.id}/lembrete`, reenviar ? { reenviar: true } : {}, { repetir: false });
        toast(x.ok ? (x.repetido ? 'Esse lembrete já estava na fila do Comunicar' : `Lembrete de ${primeiro(a.cliente_nome)} na fila do Comunicar ✅`) : (x.motivo || 'Não deu para mandar agora'), x.ok ? 'ok' : 'err');
      } catch (e) { toast(e.message, 'err'); }
      blocoLembreteNaFicha(box, a);
    }));
  }

  /* ======================= Início: lembretes de amanhã ======================= */
  let _inicioEm = 0;
  async function inicio() {
    if (semAcesso() || typeof view === 'undefined') return;
    const cols = $('.cols', view);
    if (!cols) return;
    const host = document.createElement('div');
    host.className = 'r6b-faixa-lembretes'; host.hidden = true;
    cols.parentNode.insertBefore(host, cols);
    if (Date.now() - _inicioEm < 15_000 && host._ultimo) return;
    const r = await api('GET', '/lembretes', null, { repetir: false }).catch(() => null);
    _inicioEm = Date.now();
    if (!r || !host.isConnected) return;
    pintarFaixa(host, r);
  }
  function pintarFaixa(host, r) {
    const rs = r.resumo || {};
    if (!rs.total) { host.hidden = true; return; }
    const faltam = rs.podeMandar || 0;
    const partes = [`${rs.total} horário${rs.total > 1 ? 's' : ''}`];
    if (rs.enviados) partes.push(`${rs.enviados} lembrado${rs.enviados > 1 ? 's' : ''}`);
    if (rs.respondeu) partes.push(`${rs.respondeu} respondeu`);
    if (rs.na_fila) partes.push(`${rs.na_fila} na fila`);
    if (faltam) partes.push(`${faltam} sem lembrete ainda`);
    if (rs.sem_telefone) partes.push(`${rs.sem_telefone} sem telefone`);
    if (rs.falhou) partes.push(`${rs.falhou} falhou`);
    host.hidden = false;
    host._ultimo = r;
    host.innerHTML = `<section class="r6-faixa r6b-lembretes" aria-label="Lembretes de ${esc(rotuloCurto(r.data))}">
      <header><h3>📨 Lembretes de ${esc(rotuloCurto(r.data))}</h3>
        <span class="muted">${esc(partes.join(' · '))}</span></header>
      ${r.cfg?.ativo_lembrete === false ? '<p class="aviso-campo">O lembrete automático está desligado no Comunicar — mande daqui, um a um ou todos de uma vez.</p>' : ''}
      ${r.cfg?.pausa_geral ? '<p class="aviso-campo">O Comunicar está em pausa geral: nada sai até o gestor reativar.</p>' : ''}
      <div class="eco-links">
        ${faltam ? `<button type="button" class="btn primary mini" data-r6b-lote>📨 Lembrar ${faltam === 1 ? 'o que falta' : `os ${faltam} que faltam`}</button>` : '<span class="muted">Todo mundo que pode receber já foi lembrado. 🏁</span>'}
        <button type="button" class="btn mini" data-r6b-quadro="${esc(r.data)}">Ver no Quadro</button>
      </div></section>`;
    $('[data-r6b-lote]', host)?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      if (!confirm(`Mandar o lembrete para ${faltam === 1 ? '1 cliente' : faltam + ' clientes'} de ${rotuloCurto(r.data)}? As mensagens saem pela fila do Comunicar.`)) return;
      b.disabled = true;
      try {
        const x = await api('POST', '/lembretes/lote', { data: r.data }, { repetir: false });
        toast(`${x.na_fila} lembrete${x.na_fila === 1 ? '' : 's'} na fila do Comunicar ✅${x.falhas ? ` · ${x.falhas} não deu` : ''}`, x.falhas ? 'err' : 'ok');
      } catch (e) { toast(e.message, 'err'); }
      const novo = await api('GET', `/lembretes?data=${r.data}`, null, { repetir: false }).catch(() => null);
      if (novo && host.isConnected) pintarFaixa(host, novo);
    });
    $('[data-r6b-quadro]', host)?.addEventListener('click', () => { _q.data = r.data; route('quadro'); });
  }

  /* ======================= Pré-agendamento (criado pelo Orçador quando o cliente aprova) ======================= */
  const ehPre = (a) => /^\s*PR[ÉE]-?\s*AGENDAMENTO/i.test(String(a?.observacoes || ''));
  const SELO_PRE = '<span class="badge-pill bp-orange selo-pre" title="Pré-agendamento criado pelo Orçador quando o cliente aprovou: falta confirmar o horário com ele">Pré-agendamento</span>';
  async function confirmarPre(id, nome) {
    try {
      await api('PATCH', `/agendamentos/${id}/status`, { status: 'confirmado' });
      toast(`${nome}: horário confirmado ✅`);
      esquecerDias(); route();
    } catch (e) { toast(e.message, 'err'); }
  }
  function decorarPre(root) {
    if (!root || semAcesso()) return;
    for (const card of $$('.appt[data-pre="1"]', root)) {
      if ($('.selo-pre', card) || !['aguardando'].includes(card.dataset.status)) continue;
      $('.appt-badges', card)?.insertAdjacentHTML('afterbegin', SELO_PRE);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'act'; b.textContent = 'Confirmar horário'; b.title = 'O cliente confirmou o horário do pré-agendamento';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); confirmarPre(card.dataset.id, primeiro(card.dataset.nome)); });
      $('.appt-actions', card)?.prepend(b);
    }
  }

  /* ======================= Espera: horários livres de verdade ======================= */
  function espera(box) {
    if (!box || semAcesso()) return;
    $$('.espera-item.aberta', box).forEach((item) => {
      const acoes = $('.acoes', item);
      if (!acoes || $('[data-r6b-slots]', item)) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn mini'; b.dataset.r6bSlots = item.dataset.id;
      b.textContent = '🕒 Horários livres';
      b.title = 'Os melhores horários livres para essa pessoa (serviço, datas e preferência dela)';
      acoes.insertBefore(b, acoes.firstChild);
      b.addEventListener('click', () => abrirSlots(item, b));
    });
  }
  async function abrirSlots(item, btn) {
    let area = $('.r6b-slots', item);
    if (area) { area.remove(); return; }
    area = document.createElement('div'); area.className = 'r6b-slots'; area.setAttribute('aria-live', 'polite');
    area.innerHTML = '<span class="muted">Procurando horários livres…</span>';
    item.appendChild(area);
    btn.disabled = true;
    try {
      const id = item.dataset.id;
      const r = await api('GET', `/espera/${id}/horarios`, null, { repetir: false });
      if (!area.isConnected) return;
      if (!r.itens?.length) { area.innerHTML = `<span class="muted">${esc(r.motivo || 'Nenhum horário livre agora.')}</span>`; return; }
      const hoje = agoraSP().data;
      area.innerHTML = r.itens.map((s, i) => `<button type="button" class="chip-sugestao r6b-slot" data-i="${i}" title="Encaixar neste horário">
        ${esc(rotuloDia(s.data, hoje))} ${esc(s.hora)}${s.consultor_nome ? ` · ${esc(s.consultor_nome)}` : ''}</button>`).join('')
        + `<small class="muted">${r.duracao_min ? `serviço de ~${r.duracao_min} min` : ''}</small>`;
      if (window.R7) R7.ofertasNosHorarios(area, item, r.itens);
      $$('.r6b-slot', area).forEach((c) => c.addEventListener('click', async () => {
        const s = r.itens[Number(c.dataset.i)];
        const lista = await api('GET', '/espera?status=aberta').catch(() => []);
        const e = lista.find((x) => x.id === id);
        if (!e) return toast('Essa espera já saiu da lista', 'err');
        openAgendamentoModal(null, { cliente_nome: e.cliente_nome, telefone: e.telefone || '', veiculo: e.veiculo || '', placa: e.placa || '', servico: e.servico,
          cliente_id: e.cliente_id || '', data: s.data, hora: s.hora, consultor_id: s.consultor_id || '', espera_id: e.id, origem: 'WhatsApp' });
      }));
    } catch (e) { if (area.isConnected) area.innerHTML = `<span class="muted">${esc(e.message || 'Não consegui buscar agora.')}</span>`; }
    finally { btn.disabled = false; }
  }

  /* ======================= QUADRO por consultor ======================= */
  const ABRE = 8 * 60, FECHA = 17 * 60 + 30, PASSO = 30;
  const SLOTS = []; for (let t = ABRE; t <= FECHA - PASSO + 0; t += PASSO) SLOTS.push(t);
  const _q = { data: null, ocultaCancelados: true, foco: null, movendo: null, livres: null, dados: null, carregando: 0, busca: '', soFalta: false };
  const VIVO = new Set(['aguardando', 'confirmado']);
  const estreito = () => window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
  const slotDe = (hora) => { const m = emMin(hora); if (!Number.isFinite(m)) return ABRE; return Math.min(FECHA - PASSO, Math.max(ABRE, Math.floor(m / PASSO) * PASSO)); };

  async function carregarQuadro() {
    const data = _q.data;
    const eu = ++_q.carregando;
    const r = await api('GET', '/quadro?data=' + encodeURIComponent(data), null, { repetir: false });
    const lista = r.lista || [], livres = r.livres || null, lemb = r.lembretes || null;
    if (state.consultores?.length === 0 || !state.consultores) state.consultores = await api('GET', '/consultores').catch(() => []);
    if (eu !== _q.carregando) return null;
    return { data, lista, livres, lemb, duracoes: r.duracoes || {} };
  }
  const consultoresAtivos = () => (state.consultores || []).filter((c) => c.ativo !== 0 && c.ativo !== false);

  function colunas(d) {
    const ativos = consultoresAtivos().map((c) => ({ id: c.id, nome: c.nome, cor: c.cor || null }));
    const ids = new Set(ativos.map((c) => c.id));
    const extras = new Map();
    for (const a of d.lista) if (a.consultor_id && !ids.has(a.consultor_id) && !extras.has(a.consultor_id)) extras.set(a.consultor_id, { id: a.consultor_id, nome: a.consultor_nome || 'Outro', cor: null, inativo: true });
    const cols = [...ativos, ...extras.values()];
    if (d.lista.some((a) => !a.consultor_id) || !cols.length) cols.push({ id: null, nome: 'Sem consultor', cor: null });
    return cols;
  }

  function chaveCel(slot, consultorId) { return `${slot}|${consultorId || ''}`; }

  function cartao(a, lembDe, orc, os, agora) {
    const [selCls, selTxt] = seloDoCartao(a);
    const vivo = VIVO.has(a.status) && a.compareceu !== 1;
    const dia = a.data;
    const passou = vivo && dia === agora.data && emMin(a.hora) < agora.min - 10;
    const atraso = passou ? agora.min - emMin(a.hora) : 0;
    const lm = lembDe?.get(a.id);
    const lemb = a.lembrete ? seloLembrete(a) : '';
    const podeLembrar = vivo && lm && lm.podeMandar && !a.lembrete;
    return `<article class="qd-card s-${esc(a.status)}${passou ? ' atrasado' : ''}${_q.movendo === a.id ? ' movendo' : ''}" draggable="${vivo ? 'true' : 'false'}"
        data-id="${esc(a.id)}" data-status="${esc(a.status)}" data-nome="${esc(a.cliente_nome)}" tabindex="0" aria-label="${esc(a.hora)} ${esc(a.cliente_nome)}, ${esc(a.servico || '')}, ${esc(selTxt)}">
      <div class="qd-topo"><b class="qd-hora">${esc(String(a.hora).slice(0, 5))}</b><span class="badge-pill ${selCls}">${esc(selTxt)}</span></div>
      <div class="qd-nome" title="${esc(a.cliente_nome)}">${esc(a.cliente_nome)}</div>
      <div class="qd-serv">${esc(a.servico || '')}${a.veiculo || a.placa ? ` · ${esc([a.veiculo, a.placa].filter(Boolean).join(' '))}` : ''}</div>
      ${window.R6c ? window.R6c.duracaoHtml(a, _q.dados?.duracoes) : ''}
      <div class="qd-selos">${passou ? `<span class="badge-pill bp-orange" title="Já passou do horário e o cliente não chegou">atrasado ${atraso} min</span>` : ''}${typeof seloConfirmacao === 'function' ? seloConfirmacao(a) : ''}${ehPre(a) && a.status === 'aguardando' ? SELO_PRE : ''}${lemb}${!a.telefone ? '<span class="badge-pill bp-gray">sem telefone</span>' : ''}${orc ? window.R6.seloOrc(orc) : ''}${os ? seloPatioHtml(os) : ''}</div>
      ${a.status === 'nao_veio' && window.R7 ? R7.faltaHtml(a, R7.linkDeReagendar(a)) : ''}
      <div class="qd-acoes">
        ${vivo ? `${ehPre(a) && a.status === 'aguardando' ? '<button type="button" class="btn mini primary" data-qd="confirmarpre" title="Confirmar o horário do pré-agendamento">Confirmar</button>' : ''}<button type="button" class="btn mini primary" data-qd="chegou" title="O cliente chegou — abre a OS no Pátio">Chegou</button>
          <button type="button" class="btn mini" data-qd="mover" title="Mover para outro horário ou consultor">⇄ Mover</button>
          ${podeLembrar ? '<button type="button" class="btn mini" data-qd="lembrar" title="Mandar o lembrete agora pelo Comunicar">📨</button>' : ''}
          <button type="button" class="btn mini" data-qd="faltou" title="Não veio (manda o aviso de falta)">Faltou</button>` : ''}
        <button type="button" class="btn mini" data-qd="abrir" title="Abrir / editar">✎</button>
      </div></article>`;
  }

  function desenhar(d) {
    const host = $('#qdCorpo'); if (!host) return;
    _q.dados = d;
    const agora = agoraSP();
    const hojeFlag = d.data === agora.data;
    let cols = colunas(d);
    const mobile = estreito();
    if (mobile) {
      if (!_q.foco || !cols.some((c) => (c.id || '') === _q.foco)) _q.foco = (cols.find((c) => d.lista.some((a) => a.consultor_id === c.id)) || cols[0])?.id || '';
      cols = cols.filter((c) => (c.id || '') === _q.foco);
    }
    const lembDe = new Map((d.lemb?.itens || []).map((i) => [i.id, i.situacao]));
    let vis = d.lista.filter((a) => !(_q.ocultaCancelados && a.status === 'cancelado'));
    if (window.R6c) vis = window.R6c.filtrar(vis);
    const porCel = new Map();
    for (const a of vis) {
      const k = chaveCel(slotDe(a.hora), cols.some((c) => c.id === (a.consultor_id || null)) ? a.consultor_id : (mobile ? null : null));
      if (!porCel.has(k)) porCel.set(k, []);
      porCel.get(k).push(a);
    }
    const aberto = d.livres ? d.livres.aberto !== false : true;
    const livreDe = new Map();      // slot|consultor -> true (para o "+")
    for (const h of d.livres?.horarios || []) for (const cid of h.consultores_livres || []) livreDe.set(chaveCel(emMin(h.hora), cid), true);
    const caudaDe = new Map();      // linhas seguintes ao início do serviço (a duração aparece no tamanho do cartão)
    if (window.R6c) {
      const colDe = (a) => (cols.some((c) => c.id === (a.consultor_id || null)) ? (a.consultor_id || null) : null);
      for (const c of cols) {
        const cards = vis.filter((a) => colDe(a) === c.id);
        const inicios = cards.map((a) => slotDe(a.hora));
        for (const a of cards) {
          const ini = slotDe(a.hora), n = window.R6c.PURO.caudaDoCartao(ini, Number(d.duracoes?.[a.id]) || 0, inicios);
          for (let k = 1; k <= n; k++) caudaDe.set(chaveCel(ini + k * PASSO, c.id), { nome: primeiro(a.cliente_nome), primeiro: k === 1, status: a.status });
        }
      }
    }
    const totalPorCol = (c) => vis.filter((a) => (a.consultor_id || null) === c.id && VIVO.has(a.status)).length;
    const proxLivre = (c) => (c.id && aberto ? (d.livres?.horarios || []).find((h) => (h.consultores_livres || []).includes(c.id))?.hora : null);
    const cabeca = cols.map((c) => `<div class="qd-th" role="columnheader"><b>${esc(c.nome)}</b> <em class="tab-num">${totalPorCol(c)}</em>${window.R6c && d.duracoes ? ` <small class="muted qd-carga" title="Tempo de serviço marcado para ${esc(c.nome)}">${esc(window.R6c.PURO.duracaoLabel(window.R6c.PURO.cargaEmMin(d.lista, d.duracoes, c.id)))}</small>` : ''}${c.inativo ? ' <small class="muted">inativo</small>' : ''}${proxLivre(c) ? ` <small class="muted qd-prox" title="Próximo horário livre de ${esc(c.nome)}">livre ${esc(proxLivre(c))}</small>` : ''}</div>`).join('');
    let linhas = '';
    for (const t of SLOTS) {
      const agoraLinha = hojeFlag && agora.min >= t && agora.min < t + PASSO;
      linhas += `<div class="qd-hh${agoraLinha ? ' agora' : ''}" role="rowheader">${hm(t)}</div>`;
      for (const c of cols) {
        const k = chaveCel(t, c.id);
        const cards = (porCel.get(k) || []).sort((x, y) => String(x.hora).localeCompare(String(y.hora)));
        const livre = livreDe.get(k) && aberto;
        const cauda = !cards.length ? caudaDe.get(k) : null;
        linhas += `<div class="qd-cel${agoraLinha ? ' agora' : ''}${cards.length ? ' cheia' : ''}${cauda ? ' cauda s-' + esc(cauda.status) : ''}" role="gridcell" data-slot="${t}" data-cons="${esc(c.id || '')}">
          ${cauda ? `<span class="qd-cauda-txt" title="O serviço de ${esc(cauda.nome)} continua nesta linha">${cauda.primeiro ? '↳ ' + esc(cauda.nome) : ''}</span>` : ''}
          ${cards.map((a) => cartao(a, lembDe, (d._orc || {})[a.id], (d._patio || {})[a.id], agora)).join('')}
          ${livre && !cards.length ? `<button type="button" class="qd-mais" data-qd-novo aria-label="Novo agendamento ${hm(t)} com ${esc(c.nome)}" title="Marcar ${hm(t)} com ${esc(c.nome)}">+</button>` : ''}
        </div>`;
      }
    }
    const nCols = cols.length;
    const vivos = vis.filter((a) => VIVO.has(a.status)).length;
    const chegaram = vis.filter((a) => ['compareceu', 'em_atendimento', 'concluido', 'nao_fechou'].includes(a.status) || a.compareceu === 1).length;
    const semLemb = (d.lemb?.resumo?.podeMandar) || 0;
    const livresTot = (d.livres?.horarios || []).reduce((s, h) => s + (h.consultores_livres?.length || 0), 0);
    $('#qdResumo').innerHTML = aberto
      ? `${vis.length} horário${vis.length === 1 ? '' : 's'} · ${vivos} esperando · ${chegaram} ${chegaram === 1 ? 'chegou' : 'chegaram'}${semLemb ? ` · ${semLemb} sem lembrete` : ''}${livresTot ? ` · ${livresTot} vaga${livresTot === 1 ? '' : 's'} livre${livresTot === 1 ? '' : 's'}` : ''}`
      : `A oficina não abre neste dia${d.livres?.motivo ? ' (' + d.livres.motivo.replace('_', ' ') + ')' : ''}.`;
    const nEsp = Number(state.contagens?.espera) || 0;
    const be = $('#qdEspera'); if (be) { be.hidden = !nEsp; be.textContent = `${nEsp} na espera`; }
    const chips = estreito() ? `<div class="qd-chips" role="group" aria-label="Consultor">${colunas(d).map((c) => `<button type="button" class="pilula ${(c.id || '') === _q.foco ? 'ativa' : ''}" data-qd-foco="${esc(c.id || '')}" aria-pressed="${(c.id || '') === _q.foco}">${esc(c.nome)}</button>`).join('')}</div>` : '';
    const caixaChips = $('#qdChips'); if (caixaChips) { caixaChips.innerHTML = chips; $$('[data-qd-foco]', caixaChips).forEach((b) => b.addEventListener('click', () => { _q.foco = b.dataset.qdFoco; desenhar(_q.dados); })); }
    host.innerHTML = `<div class="qd-grade${_q.movendo ? ' modo-mover' : ''}" style="--qd-cols:${nCols}" role="grid" aria-label="Quadro por consultor">
      <div class="qd-th qd-canto" role="columnheader">hora</div>${cabeca}${linhas}</div>`;
    ligar(host);
    if (_q.movendo) marcarAlvos();
    decorarExtras(d);
    if (window.R6c) window.R6c.aposDesenhar(d);
    if (hojeFlag && !_q._rolou && !estreito()) { _q._rolou = true; $('.qd-cel.agora', host)?.scrollIntoView({ block: 'center' }); }
  }

  async function decorarExtras(d) {
    const ids = d.lista.filter((a) => !['cancelado', 'nao_veio'].includes(a.status)).map((a) => a.id);
    if (!ids.length) return;
    const [orc, os] = await Promise.all([
      window.R6.orcDe(ids).catch(() => ({})),
      patioDe(d.lista.filter((a) => ['compareceu', 'em_atendimento', 'concluido', 'nao_fechou'].includes(a.status)).map((a) => a.id)).catch(() => ({})),
    ]);
    d._orc = orc; d._patio = os;
    if (_q.dados !== d || !$('#qdCorpo')) return;
    for (const card of $$('#qdCorpo .qd-card')) {          // só acrescenta os selos: nada é redesenhado debaixo do clique de quem está usando
      const alvo = $('.qd-selos', card); if (!alvo) continue;
      const id = card.dataset.id;
      if (orc[id] && !$('.selo-orc', alvo)) alvo.insertAdjacentHTML('beforeend', window.R6.seloOrc(orc[id]));
      if (os[id] && !$('.selo-patio', alvo)) alvo.insertAdjacentHTML('beforeend', seloPatioHtml(os[id]));
    }
    if (window.R7 && R7.aposExtras) { try { R7.aposExtras(d); } catch (e) { /* o tempo na etapa é enfeite: nunca derruba o Quadro */ } }
  }

  /* ---- mover: arrastar (mouse) ou "Mover" (toque/teclado) — só em célula livre ---- */
  async function carregarLivresDe(a) {
    const qs = new URLSearchParams({ data: _q.data, ignorar: a.id });
    if (a.servico) qs.set('servico', a.servico);
    const r = await api('GET', '/horarios-livres/dia?' + qs, null, { repetir: false }).catch(() => null);
    const ok = new Set();
    for (const h of r?.horarios || []) {
      for (const cid of h.consultores_livres || []) ok.add(chaveCel(emMin(h.hora), cid));
      if ((h.livres || 0) > 0) ok.add(chaveCel(emMin(h.hora), ''));
    }
    return { ok, aberto: r ? r.aberto !== false : true };
  }
  function marcarAlvos() {
    const L = _q.livres; if (!L) return;
    $$('#qdCorpo .qd-cel').forEach((c) => {
      const k = chaveCel(Number(c.dataset.slot), c.dataset.cons);
      c.classList.toggle('alvo-ok', L.ok.has(k));
      c.classList.toggle('alvo-nao', !L.ok.has(k));
    });
  }
  function limparAlvos() { $$('#qdCorpo .qd-cel').forEach((c) => c.classList.remove('alvo-ok', 'alvo-nao', 'sobre')); }
  async function iniciarMover(a) {
    _q.movendo = a.id; _q.livres = null;
    $('#qdAviso').hidden = false; $('#qdAviso').querySelector('span').textContent = `Mover ${primeiro(a.cliente_nome)} (${String(a.hora).slice(0, 5)}): escolha uma célula livre — as verdes cabem.`;
    $$('#qdCorpo .qd-card').forEach((c) => c.classList.toggle('movendo', c.dataset.id === a.id));
    $('#qdCorpo .qd-grade')?.classList.add('modo-mover');
    _q.livres = await carregarLivresDe(a);
    marcarAlvos();
    if (window.R7) window.R7.abrirPainelMover(a);          // rodada 7: horários livres em botões
  }
  function pararMover() {
    _q.movendo = null; _q.livres = null;
    if (window.R7) window.R7.fecharPainelMover();
    const av = $('#qdAviso'); if (av) av.hidden = true;
    $$('#qdCorpo .qd-card.movendo').forEach((c) => c.classList.remove('movendo'));
    $('#qdCorpo .qd-grade')?.classList.remove('modo-mover');
    limparAlvos();
  }
  async function moverPara(a, slot, consultorId, dataAlvo) {
    const dataFinal = dataAlvo || _q.data, outroDia = dataFinal !== _q.data;
    const L = _q.livres || await carregarLivresDe(a);
    const hora = hm(slot);
    if (!outroDia && !L.ok.has(chaveCel(slot, consultorId))) { toast(`${hora} não cabe ${consultorId ? 'para esse consultor' : 'aí'}: já tem horário ou fora do expediente`, 'err'); return; }
    const antes = { data: a.data, hora: String(a.hora).slice(0, 5), consultor_id: a.consultor_id || null };
    if (!outroDia && antes.hora === hora && antes.consultor_id === (consultorId || null)) { pararMover(); return; }
    const corpo = { data: dataFinal, hora, consultor_id: consultorId || null };
    try {
      await api('POST', `/agendamentos/${a.id}/mover`, corpo, { repetir: false });
    } catch (e) {
      toast(e.message || 'Não consegui mover agora', 'err');
      if (e && e.status === 409 && window.R7) { window.R7.aoConflitoDeMover(a); return atualizar(true); }   // a vaga acabou de ser ocupada: os botões se atualizam
      pararMover(); return atualizar(true);
    }
    esquecerDias();
    pararMover();
    const nomeCons = (state.consultores || []).find((c) => c.id === consultorId)?.nome;
    const avisar = a.telefone && antes.hora !== hora ? { rotulo: 'Avisar o cliente', fn: async () => {
      try {
        const r = await api('POST', `/agendamentos/${a.id}/avisar-remarcacao`, {});
        if (r.enfileirado) return toast(`Aviso na fila do Comunicar para ${primeiro(a.cliente_nome)} ✅`);
        if (r.whatsapp) { window.open(r.whatsapp, '_blank', 'noopener'); return toast(r.motivo || 'Abri o WhatsApp com o texto pronto'); }
        toast(r.motivo || 'Não deu para avisar por aqui', 'err');
      } catch (e) { toast(e.message, 'err'); }
    } } : null;
    toast(`${primeiro(a.cliente_nome)}: ${outroDia ? rotuloCurto(dataFinal) + ' ' : ''}${hora}${nomeCons ? ' com ' + nomeCons : ''} ✅`, 'ok', { duracao: 10000, acoes: [avisar, { rotulo: 'Desfazer', fn: async () => {
      await api('POST', `/agendamentos/${a.id}/mover`, antes).catch((e) => toast(e.message, 'err'));
      esquecerDias(); toast(`Desfeito — ${primeiro(a.cliente_nome)} voltou para ${antes.data !== _q.data ? rotuloCurto(antes.data) + ' ' : ''}${antes.hora}`); atualizar(true);
    } }] });
    await atualizar(true);
    if (window.R7 && !outroDia) window.R7.destacarCelula(slot, consultorId);
  }

  /* ---- ações do cartão ---- */
  async function acaoCartao(card, acao) {
    const a = _q.dados?.lista.find((x) => x.id === card.dataset.id); if (!a) return;
    // cliques seguidos (tecla Enter repetida, dedo nervoso): enquanto a ação anterior não terminou, o cartão não aceita outra
    if (acao !== 'abrir' && acao !== 'mover') { if (card._r6Ocupado) return; card._r6Ocupado = true; setTimeout(() => { card._r6Ocupado = false; }, 1200); }
    const nome = primeiro(a.cliente_nome);
    try {
      if (acao === 'abrir') return openAgendamentoModal(a.id);
      if (acao === 'motivo') return R7.pedirMotivo(a.id, nome);
      if (acao === 'confirmarpre') { await confirmarPre(a.id, nome); return atualizar(true); }
      if (acao === 'mover') { if (_q.movendo === a.id) return pararMover(); return iniciarMover(a); }
      if (acao === 'lembrar') {
        const x = await api('POST', `/agendamentos/${a.id}/lembrete`, {}, { repetir: false });
        toast(x.ok ? (x.repetido ? 'Já estava na fila do Comunicar' : `Lembrete de ${nome} na fila do Comunicar ✅`) : (x.motivo || 'Não deu para mandar'), x.ok ? 'ok' : 'err');
        return atualizar(true);
      }
      if (acao === 'chegou') {
        card.classList.add('ocupado');
        const antes = a.status;
        const r = await api('PATCH', `/agendamentos/${a.id}/status`, { status: 'compareceu' });
        const os = recadoDaOs(nome, r);
        toast(os.msg, 'ok', { duracao: 9000, acoes: [os.entrada, os.acao, (window.R6 && R6.linkNovoOrcamento(a) && (!window.R7 || R7.PURO.deveOferecerOrcar(r.entrada))) ? { rotulo: 'Orçar', fn: () => IndyCarApps.abrir(R6.linkNovoOrcamento(a)) } : null, { rotulo: 'Desfazer', fn: async () => {
          const des = await api('PATCH', `/agendamentos/${a.id}/status`, { status: ['aguardando', 'confirmado'].includes(antes) ? antes : 'aguardando' });
          toast(`Desfeito — ${nome} voltou para "Agendados"${des?.patio_aberta ? `. A OS nº ${des.patio_aberta.numero ?? '?'} continua aberta no Pátio: se foi engano, cancele lá` : ''}`, 'ok');
          atualizar(true);
        } }] });
        return atualizar(true);
      }
      if (acao === 'faltou') {
        if (!confirm(`Marcar que ${nome} não veio? O sistema avisa o cliente pelo WhatsApp.`)) return;
        card.classList.add('ocupado');
        const r = await api('PATCH', `/agendamentos/${a.id}/status`, { status: 'nao_veio' });
        const acoes = [{ rotulo: 'Remarcar', fn: () => abrirRemarcar(a.id) }];
        if (r.espera?.length) acoes.push({ rotulo: `${r.espera.length} na espera`, fn: () => { state.esperaFoco = r.espera[0]?.id; route('espera'); } });
        toast(recadoDeAusencia(r), r.aviso_ausencia && !r.aviso_ausencia.ok ? 'err' : 'ok', { acoes, duracao: 9000 });
        if (window.R7) R7.pedirMotivo(a.id, nome);
        return atualizar(true);
      }
    } catch (e) { card.classList.remove('ocupado'); toast(e.message, 'err'); }
  }

  function ligar(host) {
    $$('[data-qd]', host).forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); acaoCartao(b.closest('.qd-card'), b.dataset.qd); }));
    $$('[data-qd-novo]', host).forEach((b) => b.addEventListener('click', () => {
      const cel = b.closest('.qd-cel');
      const pre = { data: _q.data, hora: hm(Number(cel.dataset.slot)), consultor_id: cel.dataset.cons || '' };
      if (window.R7 && window.R7.encaixarAqui) return window.R7.encaixarAqui(pre);     // rodada 7: quem da espera cabe aqui?
      openAgendamentoModal(null, pre);
    }));
    $$('.qd-card', host).forEach((c) => {
      c.addEventListener('dblclick', () => openAgendamentoModal(c.dataset.id));
      c.addEventListener('keydown', (ev) => { if (ev.target === c && (ev.key === 'Enter')) openAgendamentoModal(c.dataset.id); });
      c.addEventListener('dragstart', async (ev) => {
        const a = _q.dados?.lista.find((x) => x.id === c.dataset.id); if (!a) return ev.preventDefault();
        ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', a.id);
        c.classList.add('arrastando'); _q.movendo = a.id; _q.livres = null;
        _q.livres = await carregarLivresDe(a); marcarAlvos();
      });
      c.addEventListener('dragend', () => { c.classList.remove('arrastando'); pararMover(); });
    });
    $$('.qd-cel', host).forEach((cel) => {
      const k = () => chaveCel(Number(cel.dataset.slot), cel.dataset.cons);
      cel.addEventListener('dragover', (ev) => { if (_q.movendo && (!_q.livres || _q.livres.ok.has(k()))) { ev.preventDefault(); cel.classList.add('sobre'); } });
      cel.addEventListener('dragleave', () => cel.classList.remove('sobre'));
      cel.addEventListener('drop', async (ev) => {
        ev.preventDefault(); cel.classList.remove('sobre');
        const a = _q.dados?.lista.find((x) => x.id === (ev.dataTransfer.getData('text/plain') || _q.movendo)); if (!a) return;
        moverPara(a, Number(cel.dataset.slot), cel.dataset.cons || null);
      });
      cel.addEventListener('click', (ev) => {
        if (!_q.movendo || ev.target.closest('[data-qd]')) return;
        const a = _q.dados?.lista.find((x) => x.id === _q.movendo); if (!a) return;
        moverPara(a, Number(cel.dataset.slot), cel.dataset.cons || null);
      });
    });
  }

  async function atualizar(forcar = false) {
    if (state.route !== 'quadro') return;
    if (_q.movendo && !forcar) return;          // não pisa em quem está arrastando
    if (document.querySelector('.modal-backdrop:not([hidden]), #modal:not([hidden])') && !forcar) return;
    const d = await carregarQuadro().catch((e) => { toast(e.message || 'Não consegui carregar o quadro', 'err'); return null; });
    if (!d || state.route !== 'quadro') return;
    desenhar(d);
  }

  async function renderQuadro(opts = {}) {
    if (semAcesso()) return route('dia');
    if (!_q.data) _q.data = agoraSP().data;
    const hoje = agoraSP().data;
    if (!(opts.quieto && $('#qdCorpo'))) {
      view.innerHTML = `<div class="toolbar qd-bar"><div class="left"><h2>Quadro</h2>
          <div class="qd-nav" role="group" aria-label="Dia">
            <button type="button" class="btn mini" id="qdAnt" aria-label="Dia anterior">◀</button>
            <input type="date" id="qdData" value="${esc(_q.data)}" aria-label="Escolher o dia">
            <button type="button" class="btn mini" id="qdProx" aria-label="Próximo dia">▶</button>
            <button type="button" class="btn mini" id="qdHoje">Hoje</button></div>
          <span class="muted" id="qdResumo" aria-live="polite"></span></div>
        <div class="right"><label class="qd-opt"><input type="checkbox" id="qdCanc" ${_q.ocultaCancelados ? '' : 'checked'}> cancelados</label>
          <button type="button" class="btn" id="qdEspera" hidden title="Quem quer um horário e ainda não achou"></button>
          <button type="button" class="btn" id="qdNovo">${svg(I.plus)} Novo</button></div></div>
        <p class="aviso-campo" id="qdAviso" hidden role="status">${svg(I.alerta)} <span></span> <button type="button" class="btn mini" id="qdSoltar">Cancelar (Esc)</button></p>
        <div id="qdMoverPainel" class="qd-mover-painel" hidden></div>
        <div id="qdEncaixe" class="qd-mover-painel qd-encaixe" hidden></div>
        <div id="qdChips" class="qd-chips-wrap"></div>
        <div id="qdCorpo" class="qd-corpo"><div class="skel" style="height:260px"></div></div>
        <small class="muted">Arraste o cartão (ou toque em ⇄ Mover) para uma célula livre. Teclas: ← → muda o dia · T hoje · N novo · Esc cancela.</small>`;
      const ir = (iso) => { if (!iso) return; _q.data = iso; _q._rolou = false; _q.dados = null; $('#qdData').value = iso; atualizar(true); };
      $('#qdAnt').addEventListener('click', () => ir(maisDias(_q.data, -1)));
      $('#qdProx').addEventListener('click', () => ir(maisDias(_q.data, 1)));
      $('#qdHoje').addEventListener('click', () => ir(agoraSP().data));
      $('#qdData').addEventListener('change', (e) => ir(e.target.value));
      $('#qdCanc').addEventListener('change', (e) => { _q.ocultaCancelados = !e.target.checked; if (_q.dados) desenhar(_q.dados); });
      $('#qdNovo').addEventListener('click', () => openAgendamentoModal(null, { data: _q.data }));
      $('#qdEspera').addEventListener('click', () => route('espera'));
      $('#qdSoltar').addEventListener('click', pararMover);
      state._cxTimer = setInterval(() => { if (!document.hidden) atualizar(); }, 30_000);
    }
    const d = await carregarQuadro();
    if (!d || (opts.vez && opts.vez !== state._vez)) return;
    desenhar(d);
    if (!_q.fechou) {
      _q.fechou = true;
      document.addEventListener('keydown', (ev) => {
        if (state.route !== 'quadro' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const t = ev.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t?.isContentEditable) return;
        if (typeof modalAberto === 'function' && modalAberto()) return;
        if (ev.key === 'Escape' && _q.movendo) { pararMover(); return; }
        const ir = (iso) => { _q.data = iso; _q._rolou = false; $('#qdData') && ($('#qdData').value = iso); atualizar(true); };
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); ir(maisDias(_q.data, -1)); }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); ir(maisDias(_q.data, 1)); }
        else if (ev.key.toLowerCase() === 't') ir(agoraSP().data);
      });
      window.addEventListener('resize', () => { const m = estreito(); if (state.route === 'quadro' && _q.dados && _q._m !== m) { _q._m = m; desenhar(_q.dados); } });
      _q._m = estreito();
    }
  }

  if (typeof ROUTES !== 'undefined') {
    ROUTES.quadro = renderQuadro;
    if (typeof TAGS !== 'undefined') TAGS.quadro = 'QUADRO';
    if (typeof TITULOS !== 'undefined') TITULOS.quadro = 'Quadro';
    if (typeof ATALHOS_TELA !== 'undefined') ATALHOS_TELA.q = 'quadro';
  }

  window.R6b = { decorarPre, ehPre, blocoLembreteNaFicha, inicio, espera, renderQuadro, estado: _q, mover: (a, hora, consultorId, data) => moverPara(a, emMin(hora), consultorId || null, data), redesenhar: () => { if (_q.dados) desenhar(_q.dados); } };
})();
