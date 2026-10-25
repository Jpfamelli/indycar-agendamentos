/* Casa — tarefas (rodada 6 + C1b + rodada 7): prazo e urgência na hora de criar, filtros (todas · hoje · vencidas · urgentes · do Orçador · equipe),
   vencidas primeiro, "adiar" (+1 dia útil, 9h; ou 3 dias úteis), editar o título no lugar, gestor passa tarefa para um colega,
   botão que abre o registro de origem (conversa, lead, horário, cliente ou ORÇAMENTO) na aba do app, ícone da origem de cada tarefa,
   tarefas do Orçador com o tipo (reabordar, acompanhar, agendar…) e botão de WhatsApp com o recado pronto (respeitando o PARAR),
   "Desfazer" depois de concluir e atualização em tempo real. As regras de prazo/filtro são puras (casa/logica2.js e logica4.js, testadas). */
(function () {
  'use strict';
  const MOD = { nome: 'tarefas' };
  let C = null, L = null, M = null, N = null, W = null, tarefas = [], canal = null, desfazerTimer = null, filtro = 'todas', nomes = new Map(), editando = null;
  /* rodada 7: o que liga a tarefa ao Orçador (orc_tarefas), o número do orçamento e o telefone do cliente */
  let ligas = {}, orcs = {}, fones = {}, carregandoLigas = null;
  const $ = (s) => document.querySelector(s);

  /** vence_em (ISO) para "hoje 17h30", "amanhã 9h" ou "em 7 dias". Oficina em UTC-3 (sem horário de verão). */
  function prazoISO(opcao, agora = new Date()) {
    const p = M.prazoDaTarefa(opcao, agora);
    return p ? new Date(p).toISOString() : null;
  }
  function origem(t) {
    const l = C.links;
    const liga = ligas[t.id];
    if (liga && liga.orcamento_id && C.podeUsar('orcador')) return { app: 'orcador', rotulo: 'orçamento', url: l.orcamento(liga.orcamento_id) };
    if (t.conversa_id) return { app: 'atendimento', rotulo: 'conversa', url: l.conversa(t.conversa_id) };
    if (t.lead_id) return { app: 'crm', rotulo: 'lead', url: l.crmLead(t.lead_id) };
    if (t.agendamento_id) return { app: 'agenda', rotulo: 'horário', url: l.agenda(t.agendamento_id) };
    if (t.cliente_id) return { app: 'agenda', rotulo: 'cliente', url: l.agendaCliente({ cliente: t.cliente_id }) };
    // sem ligação nenhuma: se a descrição traz o endereço de um app da casa (as tarefas do Orçador trazem), usa
    const d = N.linkDaDescricao(t.descricao, C.bases, location.origin);
    if (d) { const k = L.appDoLink(d, location.origin, C.bases); return { app: k, rotulo: L.APPS[k] ? L.APPS[k].nome : 'registro', url: d }; }
    return null;
  }

  const FILTROS = [['todas', 'Minhas'], ['hoje', 'Hoje'], ['vencidas', 'Vencidas'], ['urgentes', 'Urgentes']];
  const VAZIO_DO_FILTRO = {
    hoje: 'Nada para hoje. 🏁', vencidas: 'Nenhuma tarefa vencida. Em dia!', urgentes: 'Nenhuma tarefa urgente.', equipe: 'A equipe não tem outras tarefas abertas.',
    orcador: 'Nenhuma tarefa do Orçador. Quando um orçamento ficar parado ou for recusado, a tarefa nasce aqui.',
  };
  /** As tarefas do Orçador abertas que são da pessoa (ou sem dono); o gestor vê todas. Mesma ordem das outras listas. */
  function listaDoOrcador(agora) {
    const peso = { vencida: 0, hoje: 1, proxima: 2, 'sem-prazo': 3 };
    return tarefas.filter(N.ehDoOrcador).filter((t) => C.visao().dono || !t.responsavel_id || t.responsavel_id === C.perfil.id)
      .sort((a, b) => peso[M.situacaoDaTarefa(a, agora)] - peso[M.situacaoDaTarefa(b, agora)] || (a.prioridade || 2) - (b.prioridade || 2) || String(a.vence_em || '9').localeCompare(String(b.vence_em || '9')));
  }
  /** Botão de WhatsApp da tarefa do Orçador (recado pronto pelo tipo). Quem pediu para parar vira aviso na hora (parar.js). */
  function botaoWa(t) {
    const liga = ligas[t.id];
    if (!liga) return '';
    const info = N.infoDaTarefa(t, liga);
    if (!info.querWa) return '';
    const cli = fones[t.cliente_id];
    const q = orcs[liga.orcamento_id];
    if (!cli || !cli.telefone) return '';
    const a = W.acaoDaLinha(info.tipo.wa, { nome: cli.nome, telefone: cli.telefone, numero: q && q.numero }, L.hojeSP());
    if (!a) return '';
    return `<a class="wa-mini wa-tarefa" href="${C.esc(a.url)}" target="${C.esc(L.nomeDaAba('whatsapp'))}" rel="noopener noreferrer" data-wa-tarefa="${C.esc(t.id)}" aria-label="${C.esc(a.rotulo)} ${C.esc(cli.nome || 'cliente')} pelo WhatsApp">💬 ${C.esc(a.rotulo)}</a>`;
  }

  function desenhar() {
    const agora = new Date();
    const cont = M.contagemDeTarefas(tarefas, C.perfil, agora);
    const num = $('#tarefasNum');
    num.textContent = cont.todas ? (cont.vencidas ? `${cont.todas} · ${cont.vencidas} vencida${cont.vencidas > 1 ? 's' : ''}` : String(cont.todas)) : '';
    num.hidden = !cont.todas;
    num.classList.toggle('selo-ruim', cont.vencidas > 0);
    const filtros = FILTROS.slice();
    cont.orcador = listaDoOrcador(agora).length;
    if (cont.orcador || filtro === 'orcador') filtros.push(['orcador', '🧾 Do Orçador']);
    if (C.visao().dono) filtros.push(['equipe', 'Da equipe']);
    if (!filtros.some(([k]) => k === filtro)) filtro = 'todas';
    $('#tFiltros').innerHTML = filtros.map(([k, r]) => `<button type="button" data-filtro-t="${k}" aria-pressed="${filtro === k}">${r}${cont[k === 'todas' ? 'todas' : k] ? ` <b>${cont[k === 'todas' ? 'todas' : k]}</b>` : ''}</button>`).join('');
    const lista = filtro === 'orcador' ? listaDoOrcador(agora) : M.filtrarTarefas(tarefas, filtro, C.perfil, agora);
    $('#listaTarefas').innerHTML = lista.length ? lista.map((t) => {
      const sit = M.situacaoDaTarefa(t, agora);
      const liga = ligas[t.id] || null;
      const info = N.infoDaTarefa(t, liga);
      const o = origem(t);
      const de = t.responsavel_id && t.responsavel_id !== C.perfil.id ? nomes.get(t.responsavel_id) || 'colega' : '';
      const prazo = M.textoDoPrazo(t.vence_em, agora);
      const desc = N.descricaoLimpa(t.descricao);
      return `<li class="tarefa${sit === 'vencida' ? ' vencida' : ''}${t.prioridade === 1 ? ' p1' : ''}${info.tipo ? ' t-orc t-orc-' + C.esc(info.tipo.k) : ''}" data-tid="${C.esc(t.id)}" data-origem="${C.esc(t.origem || 'manual')}">
        <input type="checkbox" data-tarefa="${C.esc(t.id)}" aria-label="Concluir: ${C.esc(t.titulo)}" />
        <span class="t-tit"><span class="t-ico" role="img" aria-label="${C.esc('Origem: ' + info.origem)}" title="${C.esc('Origem: ' + info.origem)}">${info.ico}</span>${t.prioridade === 1 ? '<span class="pil pil-ruim">urgente</span> ' : ''}${info.tipo ? `<span class="pil pil-orc" title="${C.esc(info.tipo.dica)}">${C.esc(info.tipo.rotulo)}</span> ` : ''}${de ? `<span class="pil">${C.esc(de)}</span> ` : ''}${editando === t.id
          ? `<input class="t-edita" data-edita="${C.esc(t.id)}" maxlength="200" value="${C.esc(t.titulo)}" aria-label="Novo título da tarefa" />`
          : `<span class="t-texto" data-editar="${C.esc(t.id)}" title="Toque para editar">${C.esc(t.titulo)}</span>`}${desc ? `<small class="t-desc">${C.esc(desc)}</small>` : ''}</span>
        <span class="t-lado"><span class="t-quando">${sit === 'vencida' ? 'venceu ' : sit === 'sem-prazo' ? '' : 'até '}${C.esc(prazo || 'sem prazo')}</span>
          <span class="t-acoes">${botaoWa(t)}${o ? `<a class="t-abrir" href="${C.esc(o.url)}" target="${C.esc(L.nomeDaAba(o.app))}">abrir ${C.esc(o.rotulo)} ↗</a>` : ''}
          <button type="button" class="t-adiar" data-adiar="${C.esc(t.id)}" title="Adiar para o próximo dia útil, 9h" aria-label="Adiar: ${C.esc(t.titulo)}">adiar ›</button>
          <button type="button" class="t-adiar t-adiar-mais" data-adiar-mais="${C.esc(t.id)}" title="Adiar por 3 dias úteis" aria-label="Adiar por 3 dias: ${C.esc(t.titulo)}">+3 dias</button></span></span></li>`;
    }).join('') : `<li class="vazio vazio-ensina"><b>${filtro === 'todas' ? 'Nenhuma tarefa aberta com você. 🏁' : (VAZIO_DO_FILTRO[filtro] || 'Nada neste filtro.')}</b>${filtro === 'todas' ? '<span>Escreva acima e aperte Enter: “ligar para o Marcos sobre o orçamento”, com prazo se tiver. Conversas, leads e orçamentos também geram tarefas aqui.</span>' : ''}</li>`;
    if (editando) { const i = document.querySelector('[data-edita]'); if (i) { i.focus(); i.select(); } }
  }

  /** orc_tarefas (tipo e orçamento de cada tarefa do Orçador), os números dos orçamentos e os telefones dos clientes — só para as tarefas que precisam. */
  async function carregarLigas() {
    if (carregandoLigas) return carregandoLigas;
    carregandoLigas = (async () => {
      const ids = tarefas.filter((t) => t.origem === 'orcador').map((t) => t.id);
      if (!ids.length || !C.podeUsar('orcador')) { ligas = {}; return; }
      try {
        const r = await C.sb.from('orc_tarefas').select('tarefa_id,orcamento_id,tipo').in('tarefa_id', ids.slice(0, 120));
        if (r.error) throw r.error;
        ligas = Object.fromEntries((r.data || []).map((x) => [x.tarefa_id, { orcamento_id: x.orcamento_id, tipo: x.tipo }]));
        const oids = [...new Set(Object.values(ligas).map((x) => x.orcamento_id))].slice(0, 120);
        const cids = [...new Set(tarefas.filter((t) => ligas[t.id] && t.cliente_id).map((t) => t.cliente_id))].slice(0, 120);
        const [q, c] = await Promise.all([
          oids.length ? C.sb.from('orc_orcamentos').select('id,numero').in('id', oids) : { data: [] },
          cids.length ? C.sb.from('clientes').select('id,nome,telefone').in('id', cids) : { data: [] },
        ]);
        orcs = Object.fromEntries((q.data || []).map((x) => [x.id, x]));
        fones = Object.fromEntries((c.data || []).map((x) => [x.id, x]));
      } catch { /* sem as ligações a tarefa continua igual, só sem o selo e o recado */ }
    })().finally(() => { carregandoLigas = null; });
    return carregandoLigas;
  }

  async function carregar() {
    const { data, error } = await C.sb.from('tarefas').select('id,titulo,descricao,prioridade,vence_em,status,origem,responsavel_id,cliente_id,lead_id,conversa_id,agendamento_id')
      .eq('status', 'aberta').order('prioridade', { ascending: true }).order('vence_em', { ascending: true, nullsFirst: false }).limit(120);
    if (!error) {
      tarefas = data || []; desenhar(); C.painel && C.painel.redesenhar && C.painel.redesenhar();
      if (tarefas.some((t) => t.origem === 'orcador')) carregarLigas().then(() => { desenhar(); C.painel && C.painel.redesenhar && C.painel.redesenhar(); });
    }
  }

  function toastDesfazer(msg, aoDesfazer, rotulo = 'Desfazer', ms = 6000) {
    const t = $('#toast');
    t.innerHTML = `${C.esc(msg)} <button type="button" class="toast-btn">${C.esc(rotulo)}</button>`;
    t.hidden = false;
    t.querySelector('button').onclick = () => { t.hidden = true; clearTimeout(desfazerTimer); aoDesfazer(); };
    clearTimeout(desfazerTimer);
    desfazerTimer = setTimeout(() => { t.hidden = true; }, ms);
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
  async function adiar(id, dias = 1) {
    const t = tarefas.find((x) => x.id === id); if (!t) return;
    const antes = t.vence_em;
    const novo = new Date(M.adiarTarefa(antes, new Date(), dias)).toISOString();
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
    C = casa; L = casa.L; M = window.CasaLogica2; N = window.CasaLogica4; W = window.CasaLogica3; tarefas = []; filtro = 'todas'; editando = null; nomes = new Map(); ligas = {}; orcs = {}; fones = {};
    $('#fTarefa').onsubmit = criar;
    $('#listaTarefas').onchange = (e) => { const c = e.target.closest('[data-tarefa]'); if (c && c.checked) concluir(c.dataset.tarefa, c); };
    $('#listaTarefas').onclick = (e) => {
      const a = e.target.closest('[data-adiar]'); if (a) { adiar(a.dataset.adiar); return; }
      const m = e.target.closest('[data-adiar-mais]'); if (m) { adiar(m.dataset.adiarMais, 3); return; }
      const ed = e.target.closest('[data-editar]'); if (ed) { editando = ed.dataset.editar; desenhar(); }
    };
    /* o WhatsApp só "abriu de verdade" depois da guarda do PARAR (parar.js avisa): aí oferece concluir a tarefa */
    $('#listaTarefas').addEventListener('casa-wa-aberto', (e) => {
      const li = e.target.closest && e.target.closest('[data-tid]');
      if (!li) return;
      const id = li.dataset.tid;
      toastDesfazer('Mensagem aberta no WhatsApp.', () => { const caixa = document.querySelector(`[data-tarefa="${id}"]`); if (caixa) { caixa.checked = true; concluir(id, caixa); } }, 'Concluir a tarefa', 9000);
    });
    $('#listaTarefas').onkeydown = (e) => {
      const i = e.target.closest('[data-edita]'); if (!i) return;
      if (e.key === 'Enter') { e.preventDefault(); salvarTitulo(i.dataset.edita, i.value); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editando = null; desenhar(); }
    };
    $('#listaTarefas').onfocusout = (e) => { const i = e.target.closest && e.target.closest('[data-edita]'); if (i && editando === i.dataset.edita) salvarTitulo(i.dataset.edita, i.value); };
    $('#tFiltros').onclick = (e) => { const b = e.target.closest('[data-filtro-t]'); if (b) { filtro = b.dataset.filtroT; desenhar(); } };
    C.focarTarefa = () => { $('#tTitulo').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('#tTitulo').focus(); };
    C.tarefas = { carregar, prazoISO, lista: () => tarefas, ligas: () => ligas, filtrar: (f) => { filtro = f; desenhar(); } };
    carregar(); carregarNomes();
    try {
      canal = C.sb.channel('casa-tarefas-' + C.perfil.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, () => carregar())
        .subscribe();
    } catch { /* sem tempo real */ }
  };
  MOD.desmontar = function () {
    try { if (canal && C) C.sb.removeChannel(canal); } catch { /* segue */ }
    canal = null; clearTimeout(desfazerTimer); tarefas = []; ligas = {}; orcs = {}; fones = {};
  };
  MOD.prazoISO = prazoISO;
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
