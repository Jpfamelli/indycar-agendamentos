/* Casa — tarefas (rodada 6 + C1b): prazo e urgência na hora de criar, filtros (todas · hoje · vencidas · urgentes · equipe),
   vencidas primeiro, "adiar" (+1 dia útil, 9h), editar o título no lugar, gestor passa tarefa para um colega,
   botão que abre o registro de origem (conversa, lead, horário ou cliente) na aba do app, "Desfazer" depois de concluir
   e atualização em tempo real. As regras de prazo/filtro são puras (casa/logica2.js, testadas). */
(function () {
  'use strict';
  const MOD = { nome: 'tarefas' };
  let C = null, L = null, M = null, tarefas = [], canal = null, desfazerTimer = null, filtro = 'todas', nomes = new Map(), editando = null;
  const $ = (s) => document.querySelector(s);

  /** vence_em (ISO) para "hoje 17h30", "amanhã 9h" ou "em 7 dias". Oficina em UTC-3 (sem horário de verão). */
  function prazoISO(opcao, agora = new Date()) {
    const p = M.prazoDaTarefa(opcao, agora);
    return p ? new Date(p).toISOString() : null;
  }
  function origem(t) {
    const l = C.links;
    if (t.conversa_id) return { app: 'atendimento', rotulo: 'conversa', url: l.conversa(t.conversa_id) };
    if (t.lead_id) return { app: 'crm', rotulo: 'lead', url: l.crmLead(t.lead_id) };
    if (t.agendamento_id) return { app: 'agenda', rotulo: 'horário', url: l.agenda(t.agendamento_id) };
    if (t.cliente_id) return { app: 'agenda', rotulo: 'cliente', url: l.agendaCliente({ cliente: t.cliente_id }) };
    return null;
  }

  const FILTROS = [['todas', 'Minhas'], ['hoje', 'Hoje'], ['vencidas', 'Vencidas'], ['urgentes', 'Urgentes']];
  function desenhar() {
    const agora = new Date();
    const cont = M.contagemDeTarefas(tarefas, C.perfil, agora);
    const num = $('#tarefasNum');
    num.textContent = cont.todas ? (cont.vencidas ? `${cont.todas} · ${cont.vencidas} vencida${cont.vencidas > 1 ? 's' : ''}` : String(cont.todas)) : '';
    num.hidden = !cont.todas;
    num.classList.toggle('selo-ruim', cont.vencidas > 0);
    const filtros = FILTROS.slice();
    if (C.visao().dono) filtros.push(['equipe', 'Da equipe']);
    if (!filtros.some(([k]) => k === filtro)) filtro = 'todas';
    $('#tFiltros').innerHTML = filtros.map(([k, r]) => `<button type="button" data-filtro-t="${k}" aria-pressed="${filtro === k}">${r}${cont[k === 'todas' ? 'todas' : k] ? ` <b>${cont[k === 'todas' ? 'todas' : k]}</b>` : ''}</button>`).join('');
    const lista = M.filtrarTarefas(tarefas, filtro, C.perfil, agora);
    $('#listaTarefas').innerHTML = lista.length ? lista.map((t) => {
      const sit = M.situacaoDaTarefa(t, agora);
      const o = origem(t);
      const de = t.responsavel_id && t.responsavel_id !== C.perfil.id ? nomes.get(t.responsavel_id) || 'colega' : '';
      const prazo = M.textoDoPrazo(t.vence_em, agora);
      return `<li class="tarefa${sit === 'vencida' ? ' vencida' : ''}${t.prioridade === 1 ? ' p1' : ''}" data-tid="${C.esc(t.id)}">
        <input type="checkbox" data-tarefa="${C.esc(t.id)}" aria-label="Concluir: ${C.esc(t.titulo)}" />
        <span class="t-tit">${t.prioridade === 1 ? '<span class="pil pil-ruim">urgente</span> ' : ''}${de ? `<span class="pil">${C.esc(de)}</span> ` : ''}${editando === t.id
          ? `<input class="t-edita" data-edita="${C.esc(t.id)}" maxlength="200" value="${C.esc(t.titulo)}" aria-label="Novo título da tarefa" />`
          : `<span class="t-texto" data-editar="${C.esc(t.id)}" title="Toque para editar">${C.esc(t.titulo)}</span>`}${t.descricao ? `<small class="t-desc">${C.esc(t.descricao)}</small>` : ''}</span>
        <span class="t-lado"><span class="t-quando">${sit === 'vencida' ? 'venceu ' : sit === 'sem-prazo' ? '' : 'até '}${C.esc(prazo || 'sem prazo')}</span>
          <span class="t-acoes">${o ? `<a class="t-abrir" href="${C.esc(o.url)}" target="${C.esc(L.nomeDaAba(o.app))}">abrir ${C.esc(o.rotulo)} ↗</a>` : ''}
          <button type="button" class="t-adiar" data-adiar="${C.esc(t.id)}" title="Adiar para o próximo dia útil, 9h" aria-label="Adiar: ${C.esc(t.titulo)}">adiar ›</button></span></span></li>`;
    }).join('') : `<li class="vazio vazio-ensina"><b>${filtro === 'todas' ? 'Nenhuma tarefa aberta com você. 🏁' : 'Nada neste filtro.'}</b>${filtro === 'todas' ? '<span>Escreva acima e aperte Enter: “ligar para o Marcos sobre o orçamento”, com prazo se tiver. Conversas e leads também geram tarefas aqui.</span>' : ''}</li>`;
    if (editando) { const i = document.querySelector('[data-edita]'); if (i) { i.focus(); i.select(); } }
  }

  async function carregar() {
    const { data, error } = await C.sb.from('tarefas').select('id,titulo,descricao,prioridade,vence_em,status,origem,responsavel_id,cliente_id,lead_id,conversa_id,agendamento_id')
      .eq('status', 'aberta').order('prioridade', { ascending: true }).order('vence_em', { ascending: true, nullsFirst: false }).limit(120);
    if (!error) { tarefas = data || []; desenhar(); C.painel && C.painel.redesenhar && C.painel.redesenhar(); }
  }

  function toastDesfazer(msg, aoDesfazer) {
    const t = $('#toast');
    t.innerHTML = `${C.esc(msg)} <button type="button" class="toast-btn">Desfazer</button>`;
    t.hidden = false;
    t.querySelector('button').onclick = () => { t.hidden = true; clearTimeout(desfazerTimer); aoDesfazer(); };
    clearTimeout(desfazerTimer);
    desfazerTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }
  async function concluir(id, caixa) {
    caixa.disabled = true;
    const { error } = await C.sb.from('tarefas').update({ status: 'feita' }).eq('id', id);
    if (error) { caixa.disabled = false; caixa.checked = false; return C.toast('Não consegui concluir agora.'); }
    const t = tarefas.find((x) => x.id === id);
    tarefas = tarefas.filter((x) => x.id !== id); desenhar();
    toastDesfazer('Tarefa concluída.', async () => {
      const r = await C.sb.from('tarefas').update({ status: 'aberta' }).eq('id', id);
      if (r.error) return C.toast('Não consegui desfazer.');
      if (t) { tarefas.push(t); } carregar();
    });
  }
  async function adiar(id) {
    const t = tarefas.find((x) => x.id === id); if (!t) return;
    const antes = t.vence_em;
    const novo = new Date(M.adiarTarefa(antes)).toISOString();
    t.vence_em = novo; desenhar();
    const { error } = await C.sb.from('tarefas').update({ vence_em: novo }).eq('id', id);
    if (error) { t.vence_em = antes; desenhar(); return C.toast('Não consegui adiar agora.'); }
    toastDesfazer('Tarefa adiada para ' + M.textoDoPrazo(novo) + '.', async () => {
      t.vence_em = antes; desenhar();
      const r = await C.sb.from('tarefas').update({ vence_em: antes }).eq('id', id);
      if (r.error) { C.toast('Não consegui desfazer.'); carregar(); }
    });
  }
  async function salvarTitulo(id, valor) {
    const t = tarefas.find((x) => x.id === id);
    editando = null;
    const novo = String(valor || '').trim().slice(0, 200);
    if (!t || !novo || novo === t.titulo) return desenhar();
    const antes = t.titulo; t.titulo = novo; desenhar();
    const { error } = await C.sb.from('tarefas').update({ titulo: novo }).eq('id', id);
    if (error) { t.titulo = antes; desenhar(); C.toast('Não consegui editar agora.'); }
  }
  async function criar(ev) {
    ev.preventDefault();
    const titulo = $('#tTitulo').value.trim();
    if (!titulo) return;
    const quem = $('#tQuem') && !$('#tQuem').hidden && $('#tQuem').value ? $('#tQuem').value : C.perfil.id;
    const linha = { titulo: titulo.slice(0, 200), responsavel_id: quem, origem: 'manual', prioridade: $('#tUrgente').checked ? 1 : 2, vence_em: prazoISO($('#tPrazo').value) };
    const { error } = await C.sb.from('tarefas').insert(linha);
    if (error) return C.toast('Não consegui criar a tarefa agora.');
    $('#tTitulo').value = ''; $('#tUrgente').checked = false; $('#tPrazo').value = '';
    if (quem !== C.perfil.id) C.toast('Tarefa passada para ' + (nomes.get(quem) || 'o colega') + '.');
    carregar();
  }
  async function carregarNomes() {
    try {
      const { data } = await C.sb.from('perfis').select('id,nome,papel,ativo').eq('ativo', true).in('papel', ['admin', 'gestor', 'atendente']).limit(40);
      nomes = new Map((data || []).map((p) => [p.id, (p.nome || '').split(/\s+/)[0] || 'colega']));
      const sel = $('#tQuem');
      if (sel && C.visao().dono && data && data.length > 1) {
        sel.innerHTML = '<option value="">para mim</option>' + data.filter((p) => p.id !== C.perfil.id).map((p) => `<option value="${C.esc(p.id)}">para ${C.esc((p.nome || 'colega').split(/\s+/)[0])}</option>`).join('');
        sel.hidden = false;
      }
      desenhar();
    } catch { /* nomes são um extra */ }
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; M = window.CasaLogica2; tarefas = []; filtro = 'todas'; editando = null; nomes = new Map();
    $('#fTarefa').onsubmit = criar;
    $('#listaTarefas').onchange = (e) => { const c = e.target.closest('[data-tarefa]'); if (c && c.checked) concluir(c.dataset.tarefa, c); };
    $('#listaTarefas').onclick = (e) => {
      const a = e.target.closest('[data-adiar]'); if (a) { adiar(a.dataset.adiar); return; }
      const ed = e.target.closest('[data-editar]'); if (ed) { editando = ed.dataset.editar; desenhar(); }
    };
    $('#listaTarefas').onkeydown = (e) => {
      const i = e.target.closest('[data-edita]'); if (!i) return;
      if (e.key === 'Enter') { e.preventDefault(); salvarTitulo(i.dataset.edita, i.value); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editando = null; desenhar(); }
    };
    $('#listaTarefas').onfocusout = (e) => { const i = e.target.closest && e.target.closest('[data-edita]'); if (i && editando === i.dataset.edita) salvarTitulo(i.dataset.edita, i.value); };
    $('#tFiltros').onclick = (e) => { const b = e.target.closest('[data-filtro-t]'); if (b) { filtro = b.dataset.filtroT; desenhar(); } };
    C.focarTarefa = () => { $('#tTitulo').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('#tTitulo').focus(); };
    C.tarefas = { carregar, prazoISO, lista: () => tarefas };
    carregar(); carregarNomes();
    try {
      canal = C.sb.channel('casa-tarefas-' + C.perfil.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, () => carregar())
        .subscribe();
    } catch { /* sem tempo real */ }
  };
  MOD.desmontar = function () {
    try { if (canal && C) C.sb.removeChannel(canal); } catch { /* segue */ }
    canal = null; clearTimeout(desfazerTimer); tarefas = [];
  };
  MOD.prazoISO = prazoISO;
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
