/* ============================================================
   IndyCar Atendimento — r7c4.js (Rodada 7 · C4, 25/10/2026)
   O dia em que o WhatsApp volta e o atendente com 50 conversas:
     · RETOMADA CALMA: aviso "WhatsApp voltou", plano (sai / revisar / fica de fora) e reenvio uma por vez
     · LINKS PRONTOS: Abrir entrada no Pátio, Criar orçamento com tudo preenchido (e "com IA"), Minha IndyCar, Indique
     · AGENDAR com horários REAIS da Agenda (serviço e consultor já escolhidos)
     · BUSCA GLOBAL (cliente, placa, telefone, OS, orçamento) e FAIXA "agora" com o resumo do dia
   Usa window.R7 (r7-regras.js) e as variáveis do app.js. Nada aqui envia mensagem sozinho para o cliente
   sem um clique de uma pessoa; textos vão para o campo para revisão.
   ============================================================ */
(function () {
  'use strict';
  const R7 = window.R7;
  if (!R7) return;
  const E = (t) => (typeof esc === 'function' ? esc(t) : String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const Q = (s, r = document) => r.querySelector(s);
  const visivel = () => !document.hidden && navigator.onLine !== false;
  const api = async (caminho, opc = {}) => {
    try {
      const r = await fetch(caminho, { ...opc, headers: { ...(await authCabecalhos()), ...(opc.headers || {}) } });
      let j = {};
      try { j = await r.json(); } catch { /* vazio */ }
      return { ok: r.ok && j.ok !== false, status: r.status, ...j };
    } catch (e) { return { ok: false, status: 0, erro: 'Sem conexão com o servidor.' }; }
  };
  const conv = () => (typeof conversaAtual !== 'undefined' ? conversaAtual : null);
  const ALLOW = /^https:\/\/(indycar-patio|indycar-orcador|indycar-agenda|indycar-crm)\.netlify\.app\//;

  /** Só abre os sistemas da casa (https e domínio conhecido). */
  function abrir(url, rotulo) {
    if (!url || !ALLOW.test(url)) { if (typeof toast === 'function') toast('⚠️ Link indisponível agora.'); return false; }
    window.open(url, rotulo || '_blank', 'noopener');
    return true;
  }
  /** Coloca texto no fim do campo (nunca envia). */
  function noCampo(texto) {
    const campoMsg = document.getElementById('campoMensagem') || document.querySelector('#chatForm textarea');
    if (!campoMsg || !conv()) { toast('Abra uma conversa primeiro.'); return false; }
    const t = String(texto || '');
    campoMsg.value = campoMsg.value.trim() ? campoMsg.value.replace(/\s+$/, '') + '\n\n' + t : t;
    campoMsg.dispatchEvent(new Event('input'));
    campoMsg.focus();
    return true;
  }
  const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';

  /* ======================= LINKS PRONTOS NA FICHA ======================= */
  const L = { conv: null, dados: null, links: null, em: 0 };
  async function carregarLinks(c) {
    if (!c) return null;
    if (L.conv === c.id && L.dados && Date.now() - L.em < 25_000) return L.dados;
    const r = await api(`/api/r7/links/${encodeURIComponent(c.id)}`);
    if (!r.ok) return null;
    L.conv = c.id; L.dados = r; L.em = Date.now();
    return r;
  }
  function pintarAcoesExtras() {
    const barra = Q('#r6Painel .r6-acoes');
    if (!barra || barra.dataset.r7) return;
    barra.dataset.r7 = '1';
    barra.insertAdjacentHTML('beforeend', `
      <button type="button" data-r7="entrada" title="Abre a entrada do Pátio já com o cliente, o carro e o que ele pediu">🚪 Entrada no Pátio</button>
      <button type="button" data-r7="orc-ia" title="Abre o Orçador com o pedido preenchido e a IA já montando os itens" hidden>🤖 Orçar com IA</button>
      <button type="button" data-r7="minha" title="Cola no chat o link da Minha IndyCar do cliente">💌 Minha IndyCar</button>
      <button type="button" data-r7="indique" title="Cola no chat o link de indicação (cliente satisfeito)">🤝 Indique</button>
      <div class="r7-citados" id="r7Citados" hidden></div>`);
    const c = conv();
    carregarLinks(c).then((d) => {
      if (!d || conv()?.id !== c?.id) return;
      const ia = Q('[data-r7="orc-ia"]', barra); if (ia) ia.hidden = !d.nova_cotacao_ia;
      const el = Q('#r7Citados', barra);
      if (el && d.citados?.length) { el.hidden = false; el.innerHTML = `Pediu: ${d.citados.map((s) => `<span class="r7-ped">${E(s)}</span>`).join(' ')}`; }
      if (d.os_marcada && el) { el.hidden = false; el.insertAdjacentHTML('afterbegin', `<span class="r7-ped" title="Veio pela página Acompanhar">🚗 OS ${Number(d.os_marcada.numero)}${d.os_marcada.veiculo ? ' · ' + E(d.os_marcada.veiculo) : ''}</span> `); }
      if (d.manipulacao && el) { el.hidden = false; el.insertAdjacentHTML('beforeend', ' <span class="r7-manip" title="A IA não leu a última mensagem: ela tentava dar ordens ao sistema">🛡 mensagem suspeita</span>'); }
    });
  }
  new MutationObserver(() => pintarAcoesExtras()).observe(document.body, { childList: true, subtree: true });

  async function acaoLinks(nome) {
    const c = conv();
    if (!c) return toast('Abra uma conversa primeiro.');
    if (nome === 'entrada' || nome === 'orc-ia' || nome === 'criar-orc') {
      const d = await carregarLinks(c);
      if (!d) return toast('⚠️ Não consegui montar o link agora.');
      const url = nome === 'entrada' ? d.entrada_patio : nome === 'orc-ia' ? d.nova_cotacao_ia : d.nova_cotacao;
      if (!url) return toast(nome === 'entrada' ? '⚠️ Falta telefone, placa ou cadastro para abrir a entrada.' : '⚠️ Sem dados para abrir o Orçador.');
      return abrir(url, nome === 'entrada' ? 'indycar-patio' : 'indycar-orcador');
    }
    if (nome === 'minha' || nome === 'indique') {
      const tel = c.telefone_e164 || c.telefone;
      const r = await api(`/api/r7/cliente-links?tel=${encodeURIComponent(tel)}`);
      if (!r.ok) return toast('⚠️ ' + (r.erro || 'Não consegui gerar o link.'));
      if (r.aceita_mensagens === false) return toast('⚠️ Este cliente pediu para não receber mensagens.');
      const n = primeiroNome(r.nome || c.nome);
      const link = nome === 'minha' ? r.minha : r.indique;
      if (!link) return toast('⚠️ O link não está disponível para este cliente.');
      const txt = nome === 'minha'
        ? `${n ? n + ', ' : ''}aqui você acompanha seus orçamentos, o carro e o histórico na IndyCar: ${link}`
        : `${n ? n + ', ' : ''}se você gostou do atendimento, pode indicar um amigo por aqui e vocês dois ganham: ${link}`;
      if (noCampo(txt)) toast('Link no campo — revise e envie');
    }
  }

  /* ======================= AGENDAR COM HORÁRIOS REAIS ======================= */
  let agendarVez = 0;
  let diasAgenda = [];      // a última resposta da Agenda: serve para conferir o horário antes de gravar
  async function horariosReais() {
    const caixa = Q('#agendarHorarios'), lista = Q('#agendarHorariosLista'), sel = Q('#agendarServico');
    if (!caixa || !lista || !sel) return;
    const vez = ++agendarVez;
    const c = conv();
    const d = await carregarLinks(c);
    // serviço: o que o cliente pediu (catálogo da casa), sem sobrescrever uma escolha já feita
    if (d?.citados?.length && !sel.value) {
      const itens = [...sel.options].filter((o) => o.value).map((o) => ({ nome: o.textContent, value: o.value }));
      const m = R7.melhorServico(d.citados[0], itens);
      if (m) { sel.value = m.value; sel.dispatchEvent(new Event('change')); }
    }
    const cons = Q('#agendarConsultor');
    if (cons && !cons.value && d?.consultor_id && [...cons.options].some((o) => o.value === d.consultor_id)) cons.value = d.consultor_id;
    const nomeServ = sel.value ? sel.selectedOptions[0]?.textContent : '';
    const r = await api(`/api/r7/horarios?dias=5&servico=${encodeURIComponent(nomeServ || '')}${cons?.value ? '&consultor=' + encodeURIComponent(cons.value) : ''}`);
    if (vez !== agendarVez || !r.ok) return;   // sem a Agenda, o formulário e a sugestão antiga continuam como estavam
    diasAgenda = r.dias;
    const dias = r.dias.filter((x) => x.total > 0 || !x.aberto);
    const sug = new Set((r.sugestoes || []).map((s) => s.data + ' ' + s.hora));
    lista.innerHTML = `<div class="r7-hor" aria-label="Horários livres da Agenda">${dias.map((x) => !x.aberto
      ? `<div class="r7-dia"><b>${E(x.rotulo)}</b><small>${x.motivo === 'domingo' ? 'fechado' : E(x.motivo || 'fechado')}</small></div>`
      : `<div class="r7-dia"><b>${E(x.rotulo)}</b><div class="r7-horas">${[...x.manha, ...x.tarde].map((h) =>
        `<button type="button" class="chip horario${sug.has(x.data + ' ' + h.hora) ? ' sugerido' : ''}" data-data="${E(x.data)}" data-hora="${E(h.hora)}" title="${h.livres} vaga(s) livre(s)">${sug.has(x.data + ' ' + h.hora) ? '⭐ ' : ''}${E(h.hora)}</button>`).join('')}</div></div>`).join('') || '<small>Sem vagas nos próximos dias úteis. Digite o horário.</small>'}</div>
      ${r.sugestoes?.length ? `<small class="r7-sug">Sugestão para oferecer: ${r.sugestoes.map((s) => E(s.texto)).join(' ou ')}</small>` : ''}`;
    caixa.hidden = false;
  }
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#btnAgendar')) setTimeout(horariosReais, 450);
  });
  /* Antes de gravar: o horário digitado ainda tem vaga? Se a Agenda já mostrava o dia e o horário não está livre, pergunta (encaixe é decisão de gente). */
  document.addEventListener('submit', (ev) => {
    const f = ev.target;
    if (!f || f.id !== 'formAgendar' || !diasAgenda.length) return;
    const dia = diasAgenda.find((d) => d.data === f.data.value);
    if (!dia) return;
    const c = R7.conferirEscolha(dia, f.hora.value);
    if (c.livre) return;
    const motivo = c.motivo === 'domingo' ? 'A oficina não abre aos domingos.' : c.motivo === 'fechado' ? 'A oficina está fechada neste dia.' : `Este horário não aparece livre na Agenda${c.alternativas?.length ? ' (livres: ' + c.alternativas.join(', ') + ')' : ''}.`;
    if (!confirm(motivo + ' Agendar mesmo assim, como encaixe?')) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('change', (ev) => { if (ev.target.id === 'agendarServico' || ev.target.id === 'agendarConsultor') horariosReais(); });

  /* ======================= RETOMADA DO WHATSAPP ======================= */
  const Z = { parado: false, plano: null, trabalho: null, ultimoResumo: '', timer: null, volteiEm: null };
  function barra() {
    let el = Q('#r7Retomada');
    if (!el) {
      const ref = Q('#r6Zap');
      if (!ref) return null;
      el = document.createElement('div');
      el.id = 'r7Retomada'; el.className = 'r7-retomada'; el.hidden = true; el.setAttribute('role', 'status');
      ref.insertAdjacentElement('afterend', el);
    }
    return el;
  }
  async function verRetomada() {
    if (!visivel()) return;
    const est = await api('/api/r7/retomada/estado');
    if (!est.ok) return;
    const parado = !!est.whatsapp?.parado;
    const antes = Z.parado;
    Z.parado = parado; Z.trabalho = est.trabalho || null;
    const el = barra(); if (!el) return;
    if (parado) {
      el.hidden = false; el.className = 'r7-retomada r7-parado';
      el.innerHTML = `<span>⛔ WhatsApp parado ${E(R7.textoDuracaoParado(est.whatsapp.minutos_parado))}. As mensagens ficam guardadas: nada se perde e nada sai sozinho quando voltar.</span>`;
      return;
    }
    if (est.rodando && est.trabalho && !est.trabalho.concluido) {
      el.hidden = false; el.className = 'r7-retomada r7-andando';
      el.innerHTML = `<span>📤 Reenviando com calma: ${est.trabalho.enviadas} de ${est.trabalho.total}${est.trabalho.atual ? ' · ' + E(est.trabalho.atual) : ''}</span> <button type="button" data-r7="ret-abrir">Acompanhar</button> <button type="button" data-r7="ret-parar">Parar</button>`;
      if (!Z.timer) Z.timer = setInterval(verRetomada, 3000);
      return;
    }
    if (Z.timer) { clearInterval(Z.timer); Z.timer = null; }
    const plano = await api('/api/r7/retomada/plano');
    if (!plano.ok) { el.hidden = true; return; }
    Z.plano = plano;
    const n = (plano.enviar?.length || 0), rev = (plano.revisar?.length || 0);
    if (!n && !rev) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false; el.className = 'r7-retomada r7-voltou';
    el.innerHTML = `<span>${antes ? '✅ O WhatsApp voltou. ' : ''}${E(R7.textoResumoRetomada(plano))}.</span> <button type="button" data-r7="ret-abrir">Ver e reenviar com calma</button>`;
    if (antes && typeof toast === 'function') toast('✅ O WhatsApp voltou. Veja o que ficou esperando.', 'ok');
  }
  const motivoTxt = {
    sem_confirmacao: 'Não sabemos se chegou: confirme antes', reservada: 'Já está sendo reenviada', conversa_seguiu: 'A conversa já seguiu depois dela', cliente_escreveu: 'O cliente escreveu depois: responda ao que ele disse',
    velha: 'Tem mais de um dia: o assunto pode ter mudado', horario_no_texto: 'Cita horário que pode já ter passado', promessa: 'Promete prazo ou condição: confira', duplicada: 'Mensagem repetida: já saiu uma igual',
    preco: 'Menciona preço: revise antes', disparo: 'É de campanha: a régua cuida', bloqueado: 'Cliente bloqueado ou pediu para parar', resolvida: 'Já resolvida por outro meio', de_outro: 'É de outro atendente',
  };
  async function abrirRetomada() {
    let m = Q('#r7Modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'r7Modal'; m.className = 'modal-bg';
      m.innerHTML = '<div class="modal r6-modal r7-modal" role="dialog" aria-modal="true" aria-labelledby="r7Tit"><div class="modal-topo"><h3 id="r7Tit">O que ficou esperando o WhatsApp</h3><button type="button" class="modal-x" data-r7="ret-fechar" aria-label="Fechar">×</button></div><div class="modal-corpo" id="r7Corpo"></div></div>';
      document.body.appendChild(m);
    }
    m.classList.add('aberto');
    await pintarRetomada();
  }
  async function pintarRetomada() {
    const corpo = Q('#r7Corpo'); if (!corpo) return;
    const p = await api('/api/r7/retomada/plano');
    const est = await api('/api/r7/retomada/estado');
    if (!p.ok) { corpo.innerHTML = `<p class="r6-aviso">⚠️ ${E(p.erro || 'Não consegui ler agora.')}</p>`; return; }
    Z.plano = p;
    const linha = (x, tipo) => `<article class="r6-card r7-item r7-${tipo}" data-conv="${E(x.conversa_id)}"><div class="r6-card-topo"><b>${E(x.nome || x.telefone || 'Cliente')}</b><span class="r6-selo r6-tom-${tipo === 'enviar' ? 'ok' : tipo === 'revisar' ? 'atencao' : 'neutro'}">há ${E(R7.textoDuracaoParado(x.idade_min).replace('há ', ''))}</span></div>
      <p class="r6-ns-texto">${E(x.corpo)}</p>${tipo !== 'enviar' ? `<small class="r7-motivo">${E(motivoTxt[x.motivo] || x.motivo)}</small>` : ''}
      <div class="r6-botoes"><button type="button" class="r6-btn r6-sec" data-r7="ret-conversa">Abrir a conversa</button></div></article>`;
    const grupo = (titulo, lista, tipo, aberto) => lista?.length ? `<details class="r7-grupo" ${aberto ? 'open' : ''}><summary>${titulo} <b>${lista.length}</b></summary>${lista.map((x) => linha(x, tipo)).join('')}</details>` : '';
    const rodando = est.rodando && est.trabalho && !est.trabalho.concluido;
    const t = est.trabalho;
    corpo.innerHTML = `
      ${p.whatsapp_parado ? '<p class="r6-aviso">⛔ O WhatsApp ainda está parado. Nada pode ser reenviado agora.</p>' : ''}
      <p class="r7-resumo">${E(R7.textoResumoRetomada(p))}</p>
      ${t ? `<div class="r7-prog" role="status"><b>${t.concluido ? 'Último reenvio' : 'Reenviando'}:</b> ${t.enviadas} de ${t.total} enviadas${t.falhas ? ` · ${t.falhas} falharam` : ''}${t.sem_confirmacao ? ` · ${t.sem_confirmacao} sem confirmação` : ''}${t.parou_por ? ` · parou: ${E(t.motivo_texto || t.parou_por)}` : ''}</div>` : ''}
      <div class="r6-botoes r7-topo">
        <button type="button" class="r6-btn" data-r7="ret-iniciar" ${p.whatsapp_parado || rodando || !(p.enviar?.length) ? 'disabled' : ''}>Reenviar ${p.enviar?.length || 0} com calma</button>
        ${rodando ? '<button type="button" class="r6-btn r6-sec" data-r7="ret-parar">Parar</button>' : ''}
      </div>
      <small class="r6-sub">Uma por vez, com pausa entre elas. Se o WhatsApp cair de novo, para sozinho. Quem escreveu depois, mensagem velha, preço, prazo ou repetida nunca sai daqui.</small>
      ${grupo('✅ Podem sair agora', p.enviar, 'enviar', true)}${grupo('👀 Precisam do seu olho', p.revisar, 'revisar', true)}${grupo('⏭ Ficam de fora', p.pular, 'pular', false)}
      ${!(p.enviar?.length || p.revisar?.length || p.pular?.length) ? '<p class="r6-vazio">🎉 Nada esperando.</p>' : ''}`;
    if (rodando && !Z.timer) Z.timer = setInterval(() => { verRetomada(); if (Q('#r7Modal.aberto')) pintarRetomada(); }, 3000);
  }
  async function iniciarRetomada(btn) {
    if (!confirm('Reenviar agora as mensagens da lista “Podem sair agora”, uma por vez?')) return;
    btn.disabled = true;
    const r = await api('/api/r7/retomada/iniciar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) { toast('⚠️ ' + (r.erro || 'Não consegui iniciar.')); btn.disabled = false; return; }
    toast('📤 Reenvio começou, uma por vez');
    verRetomada(); pintarRetomada();
  }
  async function pararRetomada() {
    const r = await api('/api/r7/retomada/parar', { method: 'POST' });
    toast(r.ok ? 'Vou parar depois da mensagem atual.' : '⚠️ ' + (r.erro || 'Nada para parar.'));
    verRetomada();
  }

  /* ======================= BUSCA GLOBAL ======================= */
  let buscaTimer = null;
  function pintarBusca(r, q) {
    let box = Q('#r7Busca');
    if (!box) {
      const ref = Q('#buscaConversa')?.closest('.busca');
      if (!ref) return;
      box = document.createElement('div'); box.id = 'r7Busca'; box.className = 'r7-busca'; box.hidden = true; box.setAttribute('role', 'listbox');
      ref.insertAdjacentElement('afterend', box);
    }
    if (!r || !r.ok || !(r.pessoas || []).length) { box.hidden = !(r && r.aviso && q.length >= 2); box.innerHTML = r?.aviso ? `<small>${E(r.aviso)}</small>` : ''; if (r?.ok && !(r.pessoas || []).length && q.length >= 2) { box.hidden = false; box.innerHTML = '<small>Nada encontrado nos outros sistemas.</small>'; } return; }
    box.hidden = false;
    box.innerHTML = `<small class="r7-busca-tit">Também achei em toda a IndyCar</small>${r.pessoas.slice(0, 6).map((p) => `<button type="button" class="r7-res" data-r7="busca-ir" data-tel="${E(p.telefone || '')}" data-q="${E(p.telefone || p.nome || '')}"><b>${E(p.nome || 'Cliente')}</b><small>${E([p.telefone, p.placa, p.carro].filter(Boolean).join(' · '))}</small></button>`).join('')}`;
  }
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'buscaConversa') return;
    clearTimeout(buscaTimer);
    const q = ev.target.value.trim();
    if (q.length < 3) { pintarBusca(null, q); return; }
    buscaTimer = setTimeout(async () => pintarBusca(await api(`/api/r7/busca?q=${encodeURIComponent(q)}`), q), 450);
  });

  /* ======================= FAIXA "AGORA" ======================= */
  async function faixaAgora() {
    if (!visivel()) return;
    const r = await api('/api/r7/agora');
    const resumo = Q('#r6Resumo');
    if (!resumo) return;
    let el = Q('#r7Agora');
    if (!r.ok || !r.kpis) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.id = 'r7Agora'; el.className = 'r7-agora'; resumo.insertAdjacentElement('afterend', el); }
    const k = r.kpis;
    const itens = [['🚗', k.total, 'no pátio'], ['⏳', k.atrasados, 'atrasados'], ['🧾', k.extras_pendentes, 'extras esperando'], ['🏁', k.prontos_esperando_retirada, 'prontos']].filter((i) => Number(i[1]) > 0);
    el.hidden = !itens.length;
    el.innerHTML = itens.map((i) => `<span title="${E(i[2])}">${i[0]} <b>${Number(i[1])}</b> ${E(i[2])}</span>`).join('');
  }

  /* ======================= CLIQUES ======================= */
  document.addEventListener('click', (ev) => {
    const cap = ev.target.closest('[data-r6="criar-orc"]');
    if (cap) { ev.stopImmediatePropagation(); ev.preventDefault(); acaoLinks('criar-orc'); return; }
    const b = ev.target.closest('[data-r7]');
    if (!b) { if (!ev.target.closest('#r7Busca, #buscaConversa')) { const x = Q('#r7Busca'); if (x) x.hidden = true; } return; }
    const n = b.dataset.r7;
    if (['entrada', 'orc-ia', 'minha', 'indique'].includes(n)) return acaoLinks(n);
    if (n === 'ret-abrir') return abrirRetomada();
    if (n === 'ret-fechar') return Q('#r7Modal')?.classList.remove('aberto');
    if (n === 'ret-iniciar') return iniciarRetomada(b);
    if (n === 'ret-parar') return pararRetomada();
    if (n === 'ret-conversa') { Q('#r7Modal')?.classList.remove('aberto'); const id = b.closest('[data-conv]')?.dataset.conv; if (id) abrirConversa(id); return; }
    if (n === 'busca-ir') {
      const campoBusca = Q('#buscaConversa'); const q = b.dataset.q;
      if (campoBusca && q) { campoBusca.value = q; campoBusca.dispatchEvent(new Event('input', { bubbles: true })); }
      const x = Q('#r7Busca'); if (x) x.hidden = true;
    }
  }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { Q('#r7Modal')?.classList.remove('aberto'); const x = Q('#r7Busca'); if (x) x.hidden = true; } });

  /* ======================= ARRANQUE ======================= */
  function iniciar() {
    verRetomada(); faixaAgora();
    setInterval(verRetomada, 30_000);
    setInterval(faixaAgora, 60_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { verRetomada(); faixaAgora(); } });
    if (/[?&]retomada=1/.test(location.search)) {
      setTimeout(abrirRetomada, 1200);
      try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])retomada=1&?/, '$1').replace(/[?&]$/, '') + location.hash); } catch { /* sem history */ }
    }
  }
  const esperar = setInterval(() => { if (typeof perfil !== 'undefined' && perfil && Q('#r6Zap')) { clearInterval(esperar); iniciar(); } }, 600);
  setTimeout(() => clearInterval(esperar), 120_000);
  window.R7Tela = { abrirRetomada, verRetomada, horariosReais, carregarLinks };
})();
