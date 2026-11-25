/* Rodada 18 (25/11/2026): a casa em ordem, na tela Hoje.
   O banco real tinha 59 tarefas atrasadas e 6 contatos "Agendado" sem horário: o time não dava conta pela tela.
   1. Tarefas atrasadas em lote: marcar várias e concluir, passar para hoje/amanhã ou para outra pessoa.
      Conta antes, pede confirmação, dá Desfazer (no aviso e depois, por 7 dias) e o servidor registra quem fez.
   2. Agendados sem horário: cada um com "Marcar na Agenda" (já com o cliente) e "Voltar para Em contato".
   Gestor: os dois cartões logo depois do resumo. Atendente: depois da fila e dos retornos (a R17 subiu a fila).
   As contas ficam em r18-casa.js (CrmR18); o servidor confere tudo de novo antes de gravar.
   Usa: $, $$, esc, api, toast, toastAcao, lerLS, gravarLS, PERFIL, SOU_GESTOR, EQUIPE, chipResponsavel,
   opcoesPessoas, LABEL_STATUS, TODOS, abrirModal, moverEtapa, A6, carregarHoje6, redesenhar. */
const C18 = CrmR18;
const T18 = {dados: null, carregando: false, erro: '', sel: new Set(), filtro: '', todas: false, gravando: false, em: 0};
const AG18 = {dados: null, erro: '', em: 0};
const T18_CHAVE = 'indycar_crm_tarefas_lote_ultimo';
const T18_LIMITE = 8;
const n18 = (q, um, varios) => `${q} ${q === 1 ? um : varios}`;
const ultimo18 = () => { const u = lerLS(T18_CHAVE, null); return u && Array.isArray(u.itens) && u.itens.length && u.perfil === String(PERFIL?.id || '') && Date.now() - Date.parse(u.em) < 7 * 864e5 ? u : null; };
const dias18 = d => d <= 0 ? 'venceu hoje' : d === 1 ? 'venceu ontem' : `venceu há ${d} dias`;

/* ---------- onde os cartões moram ---------- */
function garantir18() {
  const heroi = $('#r13Heroi'); if (!heroi) return null;
  let t = $('#r18Tarefas'), a = $('#r18Agendados');
  if (!t) {
    t = document.createElement('section'); t.id = 'r18Tarefas'; t.className = 'card r18-card'; t.hidden = true; t.setAttribute('aria-labelledby', 'r18TarefasT');
    a = document.createElement('section'); a.id = 'r18Agendados'; a.className = 'card r18-card'; a.hidden = true; a.setAttribute('aria-labelledby', 'r18AgendadosT');
    t.addEventListener('click', cliqueTarefas18); t.addEventListener('change', mudouTarefas18); a.addEventListener('click', cliqueAgendados18);
  }
  // gestor: logo depois do resumo (e do aviso dos sem responsável); atendente: depois da fila e dos retornos
  const fila = $('#hojeLista')?.closest('.card');
  const ancora = SOU_GESTOR ? ($('#r14Hoje') || heroi) : ($('#r7Retornos') || fila || heroi);
  if (ancora.nextElementSibling !== t) ancora.after(t);
  if (t.nextElementSibling !== a) t.after(a);
  return {t, a};
}

/* ---------- carregar ---------- */
async function carregar18(forcar = false) {
  if (!PERFIL?.id || T18.carregando) return;
  if (!forcar && Date.now() - T18.em < 20000) { render18(); return; }
  T18.carregando = true;
  try {
    const [t, a] = await Promise.allSettled([api('/api/tarefas/atrasadas' + (SOU_GESTOR ? '' : '?escopo=minhas')), api('/api/agendados-sem-horario')]);
    if (t.status === 'fulfilled') { T18.dados = t.value; T18.erro = ''; const ok = new Set(t.value.itens.filter(i => i.pode_mexer).map(i => i.id)); for (const id of [...T18.sel]) if (!ok.has(id)) T18.sel.delete(id); }
    else T18.erro = t.reason?.message || 'Não consegui carregar.';
    if (a.status === 'fulfilled') { AG18.dados = a.value; AG18.erro = ''; } else AG18.erro = a.reason?.message || 'Não consegui carregar.';
    T18.em = Date.now();
  } finally { T18.carregando = false; }
  render18();
}

/* ---------- tarefas atrasadas ---------- */
function filtradas18() {
  const itens = T18.dados?.itens || [], f = T18.filtro, eu = String(PERFIL?.id || '');
  if (!f) return itens;
  if (f === 'minhas') return itens.filter(i => i.responsavel_id === eu);
  if (f === 'sem') return itens.filter(i => !i.responsavel_id);
  return itens.filter(i => i.responsavel_id === f);
}
/* só troca o HTML quando algo mudou: a recarga (a cada 45 s e depois de cada ação) não engole um toque nem tira o foco */
function pintar18(box, html) {
  if (box._html18 === html) return;
  const para = box.querySelector('#r18Para')?.value || '';
  box.innerHTML = html; box._html18 = html;
  const sel = box.querySelector('#r18Para'); if (sel && para) sel.value = para;
}
function render18() {
  const g = garantir18(); if (!g) return;
  renderTarefas18(g.t); renderAgendados18(g.a);
}
function renderTarefas18(box) {
  const d = T18.dados, u = ultimo18();
  if (!d && !T18.erro) { box.hidden = true; return; }
  if (!d) { box.hidden = !u; if (u) pintar18(box, cabTarefas18(0) + desfazerHtml18(u)); return; }
  if (!d.total && !u) { box.hidden = true; return; }
  box.hidden = false;
  if (!d.total) { pintar18(box, cabTarefas18(0) + '<div class="r13-vazio"><i class="r13-ok" aria-hidden="true"></i><div><strong>Nenhuma tarefa atrasada.</strong></div></div>' + desfazerHtml18(u)); return; }
  const lista = filtradas18(), mostrar = T18.todas ? lista : lista.slice(0, T18_LIMITE), resto = lista.length - mostrar.length;
  const marcaveis = lista.filter(i => i.pode_mexer), todasMarcadas = marcaveis.length > 0 && marcaveis.every(i => T18.sel.has(i.id));
  const eu = String(PERFIL?.id || '');
  const pill = (v, rot, q) => `<button type="button" class="filtro-pill${T18.filtro === v ? ' ativo' : ''}" data-r18-filtro="${esc(v)}" aria-pressed="${T18.filtro === v}">${esc(rot)} <small>${q}</small></button>`;
  const pills = SOU_GESTOR ? `<div class="r18-pills" role="group" aria-label="De quem">${pill('', 'Todas', d.total)}${d.minhas ? pill('minhas', 'Minhas', d.minhas) : ''}${(d.por_pessoa || []).filter(x => x.id !== eu).map(x => pill(x.id || 'sem', x.id ? primeiroNome(x.nome) : 'Sem responsável', x.total)).join('')}</div>` : '';
  const item = i => `<li class="r18-item${i.prioridade === 3 ? ' urgente' : ''}"><label class="r18-marca"><input type="checkbox" value="${esc(i.id)}" ${T18.sel.has(i.id) ? 'checked' : ''} ${i.pode_mexer ? '' : 'disabled'} aria-label="Marcar: ${esc(i.titulo)}">
      <span class="r18-i-t">${i.prioridade === 3 ? '<b class="r18-urg">Urgente</b> ' : ''}${esc(i.titulo)}</span>
      <span class="r18-i-m"><b class="r18-atraso">${esc(dias18(i.dias))}</b>${SOU_GESTOR ? ` · ${esc(i.responsavel_id === eu ? 'Você' : i.responsavel_nome ? primeiroNome(i.responsavel_nome) : 'Sem responsável')}` : ''}${i.pode_mexer ? '' : ' · de colega'}</span></label>
      ${i.lead ? `<button type="button" class="link-btn r18-lead" data-r18-lead="${esc(i.lead.id)}">${esc(i.lead.nome || 'Abrir contato')}</button>` : ''}</li>`;
  const n = T18.sel.size, prazos = d.prazos || {};
  pintar18(box, cabTarefas18(d.total) + pills
    + `<label class="r18-todas"><input type="checkbox" id="r18Todas" ${todasMarcadas ? 'checked' : ''} ${marcaveis.length ? '' : 'disabled'}><span>Marcar ${marcaveis.length === lista.length ? 'todas' : 'as ' + marcaveis.length + ' que você pode mexer'} (${lista.length})</span></label>`
    + `<ul class="r18-lista">${mostrar.map(item).join('')}</ul>`
    + (resto > 0 ? `<button type="button" class="link-btn r18-mais" data-r18="mais">Mostrar as outras ${resto}</button>` : '')
    + `<div class="r18-barra" id="r18Barra" ${n ? '' : 'hidden'} role="group" aria-label="O que fazer com as marcadas">
        <span class="r18-contagem" aria-live="polite">${n18(n, 'marcada', 'marcadas')}</span>
        <button type="button" class="btn btn-primary" data-r18-acao="concluir"${T18.gravando ? ' disabled' : ''}>Concluir</button>
        <button type="button" class="btn btn-ghost" data-r18-acao="hoje"${T18.gravando ? ' disabled' : ''}>Para hoje, ${esc(C18.horaCurta(prazos.hoje))}</button>
        <button type="button" class="btn btn-ghost" data-r18-acao="amanha"${T18.gravando ? ' disabled' : ''}>Para amanhã, ${esc(C18.horaCurta(prazos.amanha))}</button>
        <span class="r18-passar"><select id="r18Para" aria-label="Passar as marcadas para">${'<option value="">Passar para…</option>' + opcoesPessoas(null)}</select><button type="button" class="btn btn-ghost" data-r18-acao="reatribuir"${T18.gravando ? ' disabled' : ''}>Passar</button></span>
      </div>` + desfazerHtml18(u));
}
function cabTarefas18(total) {
  const d = T18.dados, velha = d?.itens?.length ? d.itens[0].dias : 0;
  const sub = !d ? 'Não consegui carregar agora.' : !total ? '' : `${SOU_GESTOR && d.escopo === 'todas' ? 'Da equipe toda' : 'Suas'}${velha > 0 ? ` · a mais antiga venceu há ${n18(velha, 'dia', 'dias')}` : ''}. Marque e resolva várias de uma vez.`;
  return `<div class="r18-cab"><h2 class="r18-tit" id="r18TarefasT">Tarefas atrasadas${total ? ` <span class="r18-qtd">${total}</span>` : ''}</h2>${sub ? `<p class="r18-sub">${esc(sub)}</p>` : ''}</div>`;
}
function desfazerHtml18(u) {
  if (!u) return '';
  const h = new Date(u.em).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
  return `<p class="r18-ultimo">Último lote: ${esc(u.texto)} (${esc(u.quem || 'você')}, ${esc(h)}). <button type="button" class="link-btn" data-r18="desfazer">Desfazer</button></p>`;
}
function atualizarBarra18() {
  const b = $('#r18Barra'); if (!b) return;
  const n = T18.sel.size; b.hidden = !n; $('.r18-contagem', b).textContent = n18(n, 'marcada', 'marcadas');
  const lista = filtradas18().filter(i => i.pode_mexer), t = $('#r18Todas'); if (t) t.checked = lista.length > 0 && lista.every(i => T18.sel.has(i.id));
}
function mudouTarefas18(e) {
  if (e.target.id === 'r18Todas') { const lista = filtradas18().filter(i => i.pode_mexer); T18.sel = e.target.checked ? new Set(lista.map(i => i.id)) : new Set(); $$('#r18Tarefas .r18-lista input[type=checkbox]:not(:disabled)').forEach(c => { c.checked = T18.sel.has(c.value); }); atualizarBarra18(); return; }
  const c = e.target.closest('.r18-marca input[type=checkbox]'); if (!c) return;
  if (c.checked) T18.sel.add(c.value); else T18.sel.delete(c.value);
  atualizarBarra18();
}
function cliqueTarefas18(e) {
  const f = e.target.closest('[data-r18-filtro]'); if (f) { T18.filtro = f.dataset.r18Filtro; T18.sel = new Set(); T18.todas = false; render18(); return; }
  const l = e.target.closest('[data-r18-lead]'); if (l) { abrirModal(l.dataset.r18Lead); return; }
  const b = e.target.closest('[data-r18]');
  if (b?.dataset.r18 === 'mais') { T18.todas = true; render18(); return; }
  if (b?.dataset.r18 === 'desfazer') { desfazerUltimo18(b); return; }
  const a = e.target.closest('[data-r18-acao]'); if (a) aplicar18(a.dataset.r18Acao);
}

/* ---------- gravar e desfazer ---------- */
async function aplicar18(acao) {
  const ids = [...T18.sel]; if (!ids.length || T18.gravando) return;
  let para = null, nomePara = '';
  if (acao === 'reatribuir') {
    para = $('#r18Para')?.value || '';
    if (!para) { toast('Escolha para quem passar as tarefas.'); $('#r18Para')?.focus(); return; }
    nomePara = para === String(PERFIL?.id) ? 'você' : (pessoa(para)?.nome || 'outra pessoa');
  }
  if (!confirm(C18.textoConfirmar(acao, ids.length, {nomePara}))) return;
  T18.gravando = true; render18();
  const feitos = []; let pulados = [];
  try {
    for (let i = 0; i < ids.length; i += C18.MAX_LOTE) {
      const r = await api('/api/tarefas/lote', {method: 'POST', body: JSON.stringify({acao, ids: ids.slice(i, i + C18.MAX_LOTE), responsavel_id: para || undefined})});
      feitos.push(...(r.feitos || [])); pulados = pulados.concat(r.pulados || []);
    }
  } catch (e) { toast('⚠️ ' + e.message, 7000); }
  T18.gravando = false;
  if (feitos.length) {
    const texto = C18.textoFeito(acao, feitos.length, {nomePara});
    gravarLS(T18_CHAVE, {em: new Date().toISOString(), perfil: String(PERFIL?.id || ''), quem: PERFIL?.nome || 'você', acao, texto, itens: feitos.map(f => ({id: f.id, antes: f.antes, depois: f.depois}))});
    for (const f of feitos) T18.sel.delete(f.id);
    toastAcao(`✅ ${texto}${pulados.length ? ` · ${n18(pulados.length, 'ficou de fora', 'ficaram de fora')} (${pulados[0].motivo})` : ''}`, 'Desfazer', () => desfazer18(feitos), 15000);
  } else if (pulados.length) toast(`Nenhuma mudou: ${pulados[0].motivo}. A lista foi atualizada.`, 7000);
  await carregar18(true);
  if (typeof carregarHoje6 === 'function' && $('#view-hoje')?.classList.contains('active')) carregarHoje6();
}
async function desfazer18(itens) {
  const r = await api('/api/tarefas/lote/desfazer', {method: 'POST', body: JSON.stringify({itens: itens.slice(0, C18.MAX_LOTE).map(f => ({id: f.id, antes: f.antes, depois: f.depois}))})});
  gravarLS(T18_CHAVE, null);
  toast(`Desfeito: ${n18(r.voltaram, 'tarefa voltou como estava', 'tarefas voltaram como estavam')}${r.pulados?.length ? ` · ${n18(r.pulados.length, 'ficou como está (já foi mexida)', 'ficaram como estão (já foram mexidas)')}` : ''}.`, 7000);
  await carregar18(true);
}
async function desfazerUltimo18(b) {
  const u = ultimo18(); if (!u) return;
  if (!confirm(`Desfazer o último lote (${u.texto})? Só volta o que ninguém mexeu depois.`)) return;
  b.disabled = true;
  try { await desfazer18(u.itens); } catch (e) { toast('⚠️ ' + e.message, 7000); b.disabled = false; }
}

/* ---------- agendados sem horário ---------- */
function agendadosVivos18() {
  // some da lista quem já saiu de "Agendado" aqui na tela (Voltar para Em contato); volta se desfizer
  return (AG18.dados?.itens || []).filter(i => { const l = typeof TODOS !== 'undefined' ? TODOS.find(x => String(x.id) === String(i.id)) : null; return !l || l.status === 'agendado'; });
}
function renderAgendados18(box) {
  const itens = agendadosVivos18();
  if (!itens.length) { box.hidden = true; pintar18(box, ''); return; }
  box.hidden = false;
  const linha = i => {
    const cam = C18.caminhoAgenda(i), href = cam ? (A6.urlApp('agenda', cam) || '') : '';
    const desc = [i.carro_modelo, i.servico].filter(Boolean).join(' · ');
    return `<li class="r18-ag" data-lead="${esc(i.id)}"><div class="r18-ag-txt"><button type="button" class="link-btn r18-ag-nome" data-r18-abrir="${esc(i.id)}">${esc(i.nome || 'Sem nome')}</button>
        <span class="r18-i-m">${desc ? esc(desc) + ' · ' : ''}${i.dias ? `sem mexer há ${n18(i.dias, 'dia', 'dias')}` : 'mexido hoje'}${i.valor_orcado ? ' · ' + esc(brl(i.valor_orcado)) : ''}</span>
        ${SOU_GESTOR ? `<span class="r18-ag-resp">${chipResponsavel(i.responsavel_id)}</span>` : ''}</div>
      <div class="r18-ag-acoes">${href ? `<a class="btn btn-primary" href="${esc(href)}">Marcar na Agenda</a>` : ''}<button type="button" class="btn btn-ghost" data-r18-voltar="${esc(i.id)}">Voltar para Em contato</button></div></li>`;
  };
  pintar18(box, `<div class="r18-cab"><h2 class="r18-tit" id="r18AgendadosT">Agendados sem horário <span class="r18-qtd">${itens.length}</span></h2>
    <p class="r18-sub">Estão como Agendado, mas não há horário na Agenda nem carro na oficina. Marque o horário ou volte a etapa.</p></div>
    <ul class="r18-lista">${itens.map(linha).join('')}</ul>`);
}
async function cliqueAgendados18(e) {
  const ab = e.target.closest('[data-r18-abrir]'); if (ab) { abrirModal(ab.dataset.r18Abrir); return; }
  const v = e.target.closest('[data-r18-voltar]'); if (!v) return;
  const id = v.dataset.r18Voltar;
  if (!TODOS.some(x => String(x.id) === String(id))) { toast('Esse contato não está na sua lista agora. Abra pela busca.'); return; }
  v.disabled = true;
  try { await moverEtapa(id, 'contato'); } catch (er) { toast('⚠️ ' + er.message, 6000); }
  v.disabled = false;
  render18();
}

/* ---------- ganchos: carrega junto com a fila do dia; redesenha quando a lista muda ---------- */
const _carregarHoje6_18 = carregarHoje6;
carregarHoje6 = async function (...a) { const r = _carregarHoje6_18.apply(this, a); carregar18(); return r; };
const _redesenhar18 = redesenhar;
redesenhar = function () { _redesenhar18(); if (T18.dados || AG18.dados) render18(); };
const _hoje6_18 = renderHoje6;
renderHoje6 = function () { _hoje6_18(); if (T18.dados || AG18.dados) garantir18(); };
if ($('#view-hoje')?.classList.contains('active') && PERFIL?.id) carregar18(true);
