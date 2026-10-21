/* Casa — minhas tarefas (rodada 6): prazo e urgência na hora de criar, vencidas primeiro,
   botão que abre o registro de origem (conversa, lead, horário ou cliente) na aba do app,
   "Desfazer" depois de concluir e atualização em tempo real. */
(function () {
  'use strict';
  const MOD = { nome: 'tarefas' };
  let C = null, L = null, tarefas = [], canal = null, desfazerTimer = null;
  const $ = (s) => document.querySelector(s);

  /** vence_em (ISO) para "hoje 17h30", "amanhã 9h" ou "em 7 dias". Oficina em UTC-3 (sem horário de verão). */
  function prazoISO(opcao, agora = new Date()) {
    if (!opcao) return null;
    const hoje = L.hojeSP(agora);
    const soma = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    if (opcao === 'hoje') {
      const t = new Date(`${hoje}T17:30:00-03:00`);
      // depois das 17h30 "hoje" já passou: vira amanhã cedo para não nascer vencida
      return (t.getTime() > agora.getTime() ? t : new Date(`${soma(hoje, 1)}T09:00:00-03:00`)).toISOString();
    }
    if (opcao === 'amanha') return new Date(`${soma(hoje, 1)}T09:00:00-03:00`).toISOString();
    if (opcao === 'semana') return new Date(`${soma(hoje, 7)}T09:00:00-03:00`).toISOString();
    return null;
  }
  function vencimento(iso) {
    if (!iso) return { txt: 'sem prazo', vencida: false };
    const d = new Date(iso);
    const vencida = d.getTime() < Date.now();
    const txt = d.toLocaleString('pt-BR', { timeZone: L.FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return { txt: (vencida ? 'venceu ' : 'até ') + txt, vencida };
  }
  function origem(t) {
    const l = C.links;
    if (t.conversa_id) return { app: 'atendimento', rotulo: 'conversa', url: l.conversa(t.conversa_id) };
    if (t.lead_id) return { app: 'crm', rotulo: 'lead', url: l.crmLead(t.lead_id) };
    if (t.agendamento_id) return { app: 'agenda', rotulo: 'horário', url: l.agenda(t.agendamento_id) };
    if (t.cliente_id) return { app: 'agenda', rotulo: 'cliente', url: l.agendaCliente({ cliente: t.cliente_id }) };
    return null;
  }

  function desenhar() {
    const venc = tarefas.filter((t) => t.vence_em && Date.parse(t.vence_em) < Date.now()).length;
    const num = $('#tarefasNum');
    num.textContent = tarefas.length ? (venc ? `${tarefas.length} · ${venc} vencida${venc > 1 ? 's' : ''}` : String(tarefas.length)) : '';
    num.hidden = !tarefas.length;
    num.classList.toggle('selo-ruim', venc > 0);
    $('#listaTarefas').innerHTML = tarefas.length ? tarefas.map((t) => {
      const v = vencimento(t.vence_em);
      const o = origem(t);
      return `<li class="tarefa${v.vencida ? ' vencida' : ''}${t.prioridade === 1 ? ' p1' : ''}">
        <input type="checkbox" data-tarefa="${C.esc(t.id)}" aria-label="Concluir: ${C.esc(t.titulo)}" />
        <span class="t-tit">${t.prioridade === 1 ? '<span class="pil pil-ruim">urgente</span> ' : ''}${C.esc(t.titulo)}${t.descricao ? `<small class="t-desc">${C.esc(t.descricao)}</small>` : ''}</span>
        <span class="t-lado"><span class="t-quando">${C.esc(v.txt)}</span>${o ? `<a class="t-abrir" href="${C.esc(o.url)}" target="${C.esc(L.nomeDaAba(o.app))}">abrir ${C.esc(o.rotulo)} ↗</a>` : ''}</span></li>`;
    }).join('') : '<li class="vazio">Nenhuma tarefa aberta com você. 🏁</li>';
  }

  async function carregar() {
    const { data, error } = await C.sb.from('tarefas').select('id,titulo,descricao,prioridade,vence_em,status,origem,cliente_id,lead_id,conversa_id,agendamento_id')
      .eq('responsavel_id', C.perfil.id).eq('status', 'aberta')
      // urgentes e vencidas primeiro; sem prazo por último
      .order('prioridade', { ascending: true }).order('vence_em', { ascending: true, nullsFirst: false }).limit(40);
    if (!error) { tarefas = data || []; desenhar(); }
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
  async function criar(ev) {
    ev.preventDefault();
    const titulo = $('#tTitulo').value.trim();
    if (!titulo) return;
    const linha = { titulo: titulo.slice(0, 200), responsavel_id: C.perfil.id, origem: 'manual', prioridade: $('#tUrgente').checked ? 1 : 2, vence_em: prazoISO($('#tPrazo').value) };
    const { error } = await C.sb.from('tarefas').insert(linha);
    if (error) return C.toast('Não consegui criar a tarefa agora.');
    $('#tTitulo').value = ''; $('#tUrgente').checked = false; $('#tPrazo').value = '';
    carregar();
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; tarefas = [];
    $('#fTarefa').onsubmit = criar;
    $('#listaTarefas').onchange = (e) => { const c = e.target.closest('[data-tarefa]'); if (c && c.checked) concluir(c.dataset.tarefa, c); };
    C.focarTarefa = () => { $('#tTitulo').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('#tTitulo').focus(); };
    C.tarefas = { carregar, prazoISO };
    carregar();
    try {
      canal = C.sb.channel('casa-tarefas-' + C.perfil.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: `responsavel_id=eq.${C.perfil.id}` }, () => carregar())
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
