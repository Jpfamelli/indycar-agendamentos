/* Rodada 14 (24/11/2026): contatos sem responsável em duas ações, só do gestor.
   1. Limpar o que parou: marca "perdido (sem retorno do cliente)" em lote, com prévia, Desfazer e sem apagar nada.
   2. Dividir o que está vivo: o rodízio sugerido olha só o que não foi para a faxina.
   As contas ficam em r14-faxina.js (CrmR14); o servidor confere tudo de novo antes de gravar. */
const R14 = CrmR14;
const F14 = {dias: 30, escopo: 'sem-dono', dados: null, sel: new Set(), carregando: false, erro: '', gravando: false};
const F14_CHAVE = 'indycar_crm_faxina_ultima';
const F14_LIMITE_LISTA = 400;
const nome14 = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const ultima14 = () => { const u = lerLS(F14_CHAVE, null); return u && Array.isArray(u.itens) && u.itens.length && Date.now() - Date.parse(u.em) < 7 * 864e5 ? u : null; };

/* ---------- carregar ---------- */
async function carregarFaxina14() {
  if (!SOU_GESTOR || F14.carregando) return;
  F14.carregando = true; F14.erro = '';
  render14();
  try {
    const d = await api(`/api/leads/faxina?dias=${F14.dias}&escopo=${F14.escopo}`);
    F14.dados = d;
    F14.sel = new Set(d.itens.map(i => i.id));
    SD.dados = d.rodizio ? {sugestao: d.rodizio} : null;
  } catch (e) { F14.erro = e.message || 'Não consegui carregar agora.'; F14.dados = null; SD.dados = null; }
  finally { F14.carregando = false; }
  render14();
}

/* ---------- desenhar ---------- */
function render14() {
  renderHeroi14(); renderFaxina14(); renderRodizio14(); renderHoje14();
}
function renderHeroi14() {
  const frase = $('#r14Frase'), nums = $('#r14Nums'); if (!frase) return;
  const d = F14.dados;
  if (!d) {
    nums.innerHTML = '';
    frase.innerHTML = F14.erro ? `Não consegui contar agora. <button type="button" class="btn btn-ghost sm" data-r14="tentar">Tentar de novo</button>` : 'Contando os contatos…';
    return;
  }
  const sem = d.abertosSemResponsavel, parados = d.itens.filter(i => !i.responsavel_id).length, vivos = d.vivos;
  const decidir = (d.decisao.agendado || 0) + (d.decisao.em_servico || 0);
  if (!sem) { frase.textContent = 'Todo contato aberto tem responsável.'; nums.innerHTML = ''; return; }
  frase.innerHTML = r13Frase([{n: sem}, {t: ` contato${sem === 1 ? '' : 's'} aberto${sem === 1 ? '' : 's'} sem responsável. `}, {n: parados},
    {t: ` ${parados === 1 ? 'parou' : 'pararam'} há mais de ${d.dias} dias e `}, {n: vivos}, {t: ` ${vivos === 1 ? 'ainda está vivo' : 'ainda estão vivos'}.`}]);
  const num = (n, rot, ir, alerta) => `<button type="button" class="r13-num${alerta ? ' alerta' : ''}" data-r14-ir="${ir}"><b>${esc(n)}</b><span>${esc(rot)}</span></button>`;
  nums.innerHTML = num(parados, 'para a faxina', 'faxina', parados > 0) + num(vivos, 'para dividir', 'rodizio', false) + num(decidir, 'pedem decisão', 'lista', decidir > 0);
}
function renderFaxina14() {
  const card = $('#r14Faxina'); if (!card) return;
  const d = F14.dados;
  const pill = (attr, v, rot, n, ativo) => `<button type="button" class="filtro-pill${ativo ? ' ativo' : ''}" data-r14-${attr}="${esc(v)}" aria-pressed="${ativo}">${esc(rot)}${n == null ? '' : ` <small>${n}</small>`}</button>`;
  $('#r14Dias').innerHTML = R14.DIAS_OPCOES.map(x => pill('dias', x, `${x} dias`, d ? d.contagens[x] : null, F14.dias === x)).join('');
  $('#r14Escopo').innerHTML = pill('escopo', 'sem-dono', 'Sem responsável', null, F14.escopo === 'sem-dono') + pill('escopo', 'todos', 'Todos os abertos', null, F14.escopo === 'todos');
  const corpo = $('#r14FaxinaCorpo'), gravar = $('#r14Gravar'), det = $('#r14Detalhe'), u = ultima14();
  $('#r14Desfazer').hidden = !u;
  if (u) $('#r14Desfazer').textContent = `Desfazer a última faxina (${nome14(u.itens.length, 'contato', 'contatos')})`;
  card.setAttribute('aria-busy', F14.carregando ? 'true' : 'false');
  if (!d) {
    det.hidden = true; gravar.disabled = true; gravar.textContent = 'Marcar como perdidos'; $('#r14FaxinaTxt').textContent = '';
    corpo.innerHTML = F14.erro ? `<p class="vazio-curto" role="alert">Não consegui calcular a faxina: ${esc(F14.erro)} <button type="button" class="link-btn" data-r14="tentar">Tentar de novo</button></p>` : '<p class="vazio-curto">Calculando…</p>';
    return;
  }
  const fora = [d.foraConversa ? `${nome14(d.foraConversa, 'tem conversa recente', 'têm conversa recente')}` : '', d.foraRetorno ? `${nome14(d.foraRetorno, 'tem retorno combinado', 'têm retorno combinado')}` : ''].filter(Boolean);
  const foraTxt = fora.length ? `<p class="r14-fora">Ficam de fora: ${esc(fora.join(' e '))}.</p>` : '';
  if (!d.total) {
    det.hidden = true; gravar.disabled = true; gravar.textContent = 'Marcar como perdidos'; $('#r14FaxinaTxt').textContent = '';
    corpo.innerHTML = `<div class="r13-vazio"><i class="r13-ok" aria-hidden="true"></i><div><strong>Nada parado há mais de ${d.dias} dias.</strong><p>${F14.escopo === 'sem-dono' ? 'Todo contato sem responsável foi mexido há pouco.' : 'Todo contato aberto foi mexido há pouco.'}</p>${foraTxt}</div></div>`;
    return;
  }
  const etapas = ['novo', 'contato', 'orcamento'].filter(k => d.porEtapa[k]).map(k => `<span class="sd-chip"><b>${d.porEtapa[k]}</b> ${esc(LABEL_STATUS[k])}</span>`).join('');
  corpo.innerHTML = `<p class="r14-resumo"><b>${d.total}</b> ${d.total === 1 ? 'contato' : 'contatos'} sem mexer há mais de ${d.dias} dias${d.valorOrcado ? `, ${esc(brl(d.valorOrcado))} orçados` : ''}.
    Viram <b>perdido</b> com o motivo “${esc(R14.MOTIVO_FAXINA)}”. Nada é apagado e dá para desfazer.</p><div class="sd-resumo">${etapas}</div>${foraTxt}`;
  det.hidden = false;
  $('#r14DetalheT').textContent = `Ver quem entra (${d.total})`;
  const todos = d.itens.length > 0 && d.itens.every(i => F14.sel.has(i.id));
  const lista = d.itens.slice(0, F14_LIMITE_LISTA).map(i => `<label class="r14-item"><input type="checkbox" value="${esc(i.id)}" ${F14.sel.has(i.id) ? 'checked' : ''} aria-label="${esc(i.nome)}">
      <span class="r14-i-nome">${esc(i.nome || 'Sem nome')}</span>
      <span class="r14-i-meta">${esc(LABEL_STATUS[i.status] ?? i.status)} · ${esc(LABEL_ORIGEM[i.origem] ?? i.origem)} · parado há ${esc(i.dias)} dias${i.responsavel_id ? ' · tem responsável' : ''}</span>
      <b class="r14-i-valor">${i.valor_orcado ? esc(brl(i.valor_orcado)) : ''}</b></label>`).join('');
  const resto = d.itens.length - F14_LIMITE_LISTA;
  $('#r14Detalhe .r14-lista-corpo').innerHTML = `<label class="r14-item r14-todos"><input type="checkbox" id="r14Todos" ${todos ? 'checked' : ''}><span class="r14-i-nome">Marcar todos</span><span class="r14-i-meta">${nome14(F14.sel.size, 'marcado', 'marcados')}</span></label>
    <div class="r14-itens">${lista}</div>${resto > 0 ? `<p class="muted mini-nota">…e mais ${resto}, que seguem marcados.</p>` : ''}`;
  atualizarGravar14();
}
function atualizarGravar14() {
  const n = F14.sel.size, b = $('#r14Gravar'); if (!b) return;
  b.disabled = !n || F14.gravando || F14.carregando;
  b.textContent = F14.gravando ? 'Marcando…' : n ? `Marcar ${nome14(n, 'contato', 'contatos')} como ${n === 1 ? 'perdido' : 'perdidos'}` : 'Marcar como perdidos';
  $('#r14FaxinaTxt').textContent = F14.dados?.total ? `${n} de ${F14.dados.total} marcados` : '';
}
function renderRodizio14() {
  const el = $('#sdRodizio'), btn = $('#sdAplicar'); if (!el) return;
  const d = F14.dados, s = d?.rodizio;
  el.setAttribute('aria-busy', F14.carregando ? 'true' : 'false');
  $('#cardSemDono').dataset.estado = '';
  if (!d) { $('#sdTxt').textContent = ''; btn.disabled = true; el.innerHTML = F14.erro ? `<p class="vazio-curto" role="alert">Não consegui calcular o rodízio: ${esc(F14.erro)}</p>` : '<p class="vazio-curto">Calculando o rodízio…</p>'; return; }
  if (!d.vivos) { $('#sdTxt').textContent = ''; btn.disabled = true; btn.textContent = 'Aplicar o rodízio sugerido'; el.innerHTML = '<div class="r13-vazio"><i class="r13-ok" aria-hidden="true"></i><div><strong>Nenhum contato vivo sem responsável.</strong></div></div>'; return; }
  if (!s || s.semGente) { $('#sdTxt').textContent = ''; btn.disabled = true; btn.textContent = 'Aplicar o rodízio sugerido'; el.innerHTML = '<p class="vazio-curto">Ninguém está marcado para receber contatos. Em Configurações › Equipe, ligue “recebe contatos” para os vendedores.</p>'; return; }
  const pessoas = s.resumo.filter(x => x.recebe).length;
  $('#sdTxt').textContent = `${nome14(s.total, 'contato', 'contatos')} para ${nome14(pessoas, 'pessoa', 'pessoas')}`;
  el.innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="Resumo do rodízio sugerido"><table class="table"><thead><tr><th>Pessoa</th><th class="num">Abertos hoje</th><th class="num">Recebe</th><th>Por etapa</th><th class="num">Fica com</th></tr></thead>
    <tbody>${s.resumo.map(x => `<tr class="sem-clique"><td>${chipResponsavel(x.id)}</td><td class="num">${esc(x.antes)}</td><td class="num"><b>+${esc(x.recebe)}</b></td>
      <td class="cell-sub">${Object.entries(x.porEtapa).map(([k, n]) => `${esc(LABEL_STATUS[k] || k)} ${n}`).join(' · ') || '—'}</td><td class="num">${esc(x.depois)}</td></tr>`).join('')}</tbody></table></div>
    <p class="r14-nota">Quem tem menos contatos abertos recebe mais; orçamentos e agendados saem primeiro. <button type="button" class="link-btn" id="sdVerLista">Ver os sem responsável na lista</button></p>`;
  $('#sdVerLista').onclick = () => { $('#fResp').value = 'sem'; salvarResp(); $('#fStatus').value = 'abertos'; irPara('leads'); refiltrarTela(); };
  btn.disabled = !s.total; btn.textContent = `Aplicar o rodízio (${s.total})`;
}

/* ---------- Hoje: aviso para o gestor ---------- */
function renderHoje14() {
  const host = $('#view-hoje'); if (!host) return;
  let box = $('#r14Hoje');
  if (!box) {
    if (!$('#r13Heroi')) return;
    box = document.createElement('section'); box.id = 'r14Hoje'; box.className = 'card r14-hoje'; box.hidden = true;
    $('#r13Heroi').after(box);
  }
  if (!SOU_GESTOR || typeof TODOS === 'undefined' || !TODOS.length) { box.hidden = true; return; }
  const r = R14.resumoFaxina(TODOS, {dias: 30});
  if (!r.abertosSemResponsavel) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="r14-hoje-txt"><strong>${nome14(r.abertosSemResponsavel, 'contato aberto sem responsável', 'contatos abertos sem responsável')}</strong>
    <span>${r.total ? `${r.total} ${r.total === 1 ? 'parou' : 'pararam'} há mais de 30 dias.` : 'Nenhum parado há mais de 30 dias.'} ${nome14(r.vivos, 'está vivo', 'estão vivos')} esperando alguém.</span></div>
    <button type="button" class="btn btn-primary" data-r14-hoje>${r.total ? 'Limpar e dividir' : 'Dividir'}</button>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-r14-hoje]')) irPara('distribuir'); });
const _redesenhar14 = redesenhar;
redesenhar = function () { _redesenhar14(); renderHoje14(); };
const _painel14 = renderPainel;
renderPainel = function () { _painel14(); renderHoje14(); };

/* ---------- cliques da faxina ---------- */
$('#view-distribuir').addEventListener('click', e => {
  if (e.target.closest('[data-r14="tentar"]')) { carregarFaxina14(); return; }
  const dias = e.target.closest('[data-r14-dias]'); if (dias) { F14.dias = Number(dias.dataset.r14Dias); carregarFaxina14(); return; }
  const esc14 = e.target.closest('[data-r14-escopo]'); if (esc14) { F14.escopo = esc14.dataset.r14Escopo; carregarFaxina14(); return; }
  const ir = e.target.closest('[data-r14-ir]'); if (!ir) return;
  const alvo = ir.dataset.r14Ir;
  if (alvo === 'faxina') $('#r14Faxina').scrollIntoView({behavior: 'smooth', block: 'start'});
  if (alvo === 'rodizio') $('#cardSemDono').scrollIntoView({behavior: 'smooth', block: 'start'});
  if (alvo === 'lista') { $('#fResp').value = 'sem'; salvarResp(); $('#fStatus').value = 'abertos'; irPara('leads'); refiltrarTela(); }
});
$('#r14Faxina').addEventListener('change', e => {
  if (e.target.id === 'r14Todos') { F14.sel = e.target.checked ? new Set(F14.dados.itens.map(i => i.id)) : new Set(); renderFaxina14(); return; }
  const c = e.target.closest('.r14-item input[type=checkbox]'); if (!c) return;
  if (c.checked) F14.sel.add(c.value); else F14.sel.delete(c.value);
  const todos = $('#r14Todos'); if (todos) todos.checked = F14.dados.itens.every(i => F14.sel.has(i.id));
  const meta = $('#r14Detalhe .r14-todos .r14-i-meta'); if (meta) meta.textContent = nome14(F14.sel.size, 'marcado', 'marcados');
  atualizarGravar14();
});

/* ---------- gravar e desfazer ---------- */
async function marcarPerdidos14() {
  const d = F14.dados, ids = [...F14.sel]; if (!d || !ids.length || F14.gravando) return;
  if (!confirm(`Marcar ${nome14(ids.length, 'contato', 'contatos')} como perdido${ids.length === 1 ? '' : 's'} (${R14.MOTIVO_FAXINA})?\n\nNada é apagado e dá para desfazer. As tarefas abertas desses contatos fecham junto.`)) return;
  F14.gravando = true; atualizarGravar14();
  const feitos = []; let pulados = 0;
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const r = await api('/api/leads/faxina/arquivar', {method: 'POST', body: JSON.stringify({dias: d.dias, escopo: d.escopo, ids: ids.slice(i, i + 500)})});
      feitos.push(...(r.feitos || [])); pulados += (r.pulados || []).length;
    }
  } catch (e) { toast('⚠️ ' + e.message, 7000); }
  F14.gravando = false;
  if (feitos.length) {
    gravarLS(F14_CHAVE, {em: new Date().toISOString(), itens: feitos});
    try { await carregarLeads(); } catch { /* a lista se acerta na próxima carga */ }
    redesenhar();
    const msg = `${nome14(feitos.length, 'contato marcado como perdido', 'contatos marcados como perdidos')}${pulados ? ` · ${nome14(pulados, 'ficou de fora (mexeram nele)', 'ficaram de fora (mexeram neles)')}` : ''}`;
    toastAcao(msg, 'Desfazer', () => desfazer14(feitos), 15000);
  } else if (pulados) toast('Nenhum foi marcado: mexeram nesses contatos depois da prévia. A lista foi atualizada.', 7000);
  await carregarFaxina14();
}
async function desfazer14(itens) {
  const r = await api('/api/leads/faxina/desfazer', {method: 'POST', body: JSON.stringify({itens: itens.slice(0, 500)})});
  gravarLS(F14_CHAVE, null);
  try { await carregarLeads(); } catch { /* idem */ }
  redesenhar();
  toast(`${nome14(r.voltaram, 'contato voltou', 'contatos voltaram')} para a etapa de antes${r.pulados?.length ? ` · ${nome14(r.pulados.length, 'ficou como está (já foi mexido)', 'ficaram como estão (já foram mexidos)')}` : ''}.`, 7000);
  if ($('#view-distribuir').classList.contains('active')) carregarFaxina14();
}
$('#r14Gravar').addEventListener('click', marcarPerdidos14);
$('#r14Desfazer').addEventListener('click', async () => {
  const u = ultima14(); if (!u) return;
  if (!confirm(`Desfazer a última faxina? ${nome14(u.itens.length, 'contato volta', 'contatos voltam')} para a etapa de antes (só os que ninguém mexeu depois).`)) return;
  const b = $('#r14Desfazer'); b.disabled = true;
  try { await desfazer14(u.itens); } catch (e) { toast('⚠️ ' + e.message, 7000); } finally { b.disabled = false; }
});
$('#view-hoje') && renderHoje14();
