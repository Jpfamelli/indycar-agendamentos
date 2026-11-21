// Rodada 4 (14/10/2026): servidor acordando, fila e rascunho, valor pago e distribuição.
// Rodada 11: relatórios, "você hoje", tour e ajuda saíram (o Painel já mostra o período; ajuda saiu de todos os apps).
// Carrega depois de equipe.js e usa o escopo global (api, sb, PERFIL, TODOS, U, R4, Rede…).
'use strict';

/* ================= servidor acordando: botão "Tentar agora" ================= */
$('#acordandoJa').addEventListener('click', () => { document.dispatchEvent(new Event('indycar:cutucar')); $('#acordandoTxt').textContent = 'Tentando agora…'; });

/* ================= fila de alterações (PATCH de lead sem servidor) ================= */
const LS_FILA = 'indycar_crm_fila';
// sessionStorage: some quando a aba fecha e nunca vai para outro aparelho
const lerFila = () => { try { const f = JSON.parse(sessionStorage.getItem(LS_FILA) || '[]'); return Array.isArray(f) ? f : []; } catch { return []; } };
const gravarFila = f => { try { if (f.length) sessionStorage.setItem(LS_FILA, JSON.stringify(f)); else sessionStorage.removeItem(LS_FILA); } catch { /* sem espaço: segue só em memória */ } FILA_MEM = f; };
let FILA_MEM = lerFila(), TIMER_FILA = null, REENVIANDO = false;
function enfileirar(item) {
  gravarFila(R4.filaAdicionar(FILA_MEM, item));
  renderFila();
  toast('⏳ Sem servidor agora: a mudança ficou guardada e vai sozinha quando o sistema voltar.', 6000);
  agendarFila();
}
function renderFila() {
  const b = $('#filaChip'), n = FILA_MEM.length;
  b.hidden = !n; b.textContent = n ? '⏳ ' + R4.textoFila(n) : '';
  b.title = n ? 'Clique para tentar enviar agora: ' + FILA_MEM.map(x => x.nome).filter(Boolean).slice(0, 5).join(', ') : '';
}
function agendarFila() {
  clearInterval(TIMER_FILA);
  if (!FILA_MEM.length) return;
  TIMER_FILA = setInterval(async () => {
    try { const r = await fetch(IndyCarApps.rota('/api/ping'), {cache: 'no-store', signal: AbortSignal.timeout(15000)}); if (r.ok) reenviarFila(); } catch { /* ainda fora */ }
  }, 20000);
}
async function reenviarFila() {
  if (REENVIANDO || !FILA_MEM.length || document.body.classList.contains('deslogado')) return;
  REENVIANDO = true;
  let enviados = 0;
  try {
    while (FILA_MEM.length) {
      const it = FILA_MEM[0];
      try {
        const salvo = await api(it.url, {method: it.metodo, body: JSON.stringify(it.corpo), headers: {'x-idempotencia': it.chave}}, false, {tentativas: 1});
        substituirLocal(salvo); enviados++;
      } catch (e) {
        if (e.codigo === 'acordando') break;            // ainda dormindo: tenta depois
        toast(`⚠️ Não deu para gravar a mudança de ${it.nome || 'um contato'}: ${e.message}`, 7000);
      }
      gravarFila(FILA_MEM.slice(1));
    }
  } finally { REENVIANDO = false; renderFila(); agendarFila(); }
  if (enviados) { redesenhar(); toast(`✅ ${enviados} alteraç${enviados === 1 ? 'ão enviada' : 'ões enviadas'} da fila.`); }
}
$('#filaChip').addEventListener('click', () => { document.dispatchEvent(new Event('indycar:cutucar')); reenviarFila(); });
document.addEventListener('indycar:voltou', () => reenviarFila());
window.addEventListener('online', () => setTimeout(reenviarFila, 1500));
renderFila(); agendarFila();

/* ================= rascunho do lead (não perder o que foi digitado) ================= */
const CAMPOS_FORM = ['fNome', 'fTelefone', 'fCarro', 'fPlaca', 'fServico', 'fOrigemForm', 'fOrcado', 'fPago', 'fStatusForm', 'fCampanha', 'fUtmSource', 'fUtmMedium', 'fObs'];
let TIMER_RASCUNHO = null;
const chaveAtual = () => R4.chaveRascunho(editId);
function guardarRascunho() {
  if (!modal.classList.contains('open')) return;
  try {
    if (!formSujo()) { sessionStorage.removeItem(chaveAtual()); return; }
    sessionStorage.setItem(chaveAtual(), JSON.stringify({em: Date.now(), base: FORM_INICIAL, assinatura: valoresForm(), valores: Object.fromEntries(CAMPOS_FORM.map(id => [id, $('#' + id).value]))}));
  } catch { /* sem espaço: segue */ }
}
$('#leadForm').addEventListener('input', () => { clearTimeout(TIMER_RASCUNHO); TIMER_RASCUNHO = setTimeout(guardarRascunho, 400); });
$('#leadForm').addEventListener('change', () => { clearTimeout(TIMER_RASCUNHO); TIMER_RASCUNHO = setTimeout(guardarRascunho, 400); });
function oferecerRascunho() {
  $('#avisoRascunho')?.remove();
  let r = null; try { r = JSON.parse(sessionStorage.getItem(chaveAtual()) || 'null'); } catch { r = null; }
  const lead = editId ? TODOS.find(x => String(x.id) === String(editId)) : null;
  if (!R4.rascunhoValido(r, lead)) { try { sessionStorage.removeItem(chaveAtual()); } catch { /* ignora */ } return; }
  const hora = new Date(r.em).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  $('#modalTitle').insertAdjacentHTML('afterend', `<div class="aviso-rascunho" id="avisoRascunho" role="status"><span>📝 Você tinha alterações não salvas das ${esc(hora)}.</span>
    <button type="button" class="btn btn-primary sm" id="rascunhoUsar">Recuperar</button><button type="button" class="btn btn-ghost sm" id="rascunhoDescartar">Descartar</button></div>`);
  $('#rascunhoUsar').onclick = () => {
    for (const [id, v] of Object.entries(r.valores)) if ($('#' + id) && CAMPOS_FORM.includes(id)) $('#' + id).value = v;
    $('#avisoRascunho')?.remove(); if (editId) mostrarAba('abaDados'); $('#fNome').focus(); toast('Rascunho recuperado. Confira e salve.');
  };
  $('#rascunhoDescartar').onclick = () => { try { sessionStorage.removeItem(chaveAtual()); } catch { /* ignora */ } $('#avisoRascunho')?.remove(); };
}
const _abrirModalR3 = abrirModal;
abrirModal = async function (id, pre) { await _abrirModalR3(id, pre); if (modal.classList.contains('open')) oferecerRascunho(); };
const _fecharModalR3 = fecharModal;
fecharModal = function (forcar) {
  const chave = chaveAtual(), aberto = modal.classList.contains('open');
  const ok = _fecharModalR3(forcar);
  // fechou de verdade (salvou ou a pessoa confirmou que descarta): o rascunho sai
  if (ok && aberto) { clearTimeout(TIMER_RASCUNHO); try { sessionStorage.removeItem(chave); } catch { /* ignora */ } }
  return ok;
};
// fechar a aba com algo por salvar ou na fila: o navegador pergunta antes
window.addEventListener('beforeunload', e => { if (formSujo() || FILA_MEM.length) { guardarRascunho(); e.preventDefault(); e.returnValue = ''; } });

/* sair: avisa se ainda há alterações na fila; limpa rascunhos e fila deste aparelho */
const _sairR3 = sair;
sair = async function (escopo) {
  if (FILA_MEM.length && !confirm(`Há ${R4.textoFila(FILA_MEM.length)}. Se sair agora, elas não serão gravadas. Sair mesmo assim?`)) return;
  return _sairR3(escopo);
};
const _encerrarR3 = encerrarSessaoTela;
encerrarSessaoTela = function () {
  try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k && (k.startsWith('indycar_crm_rascunho_') || k === LS_FILA)) sessionStorage.removeItem(k); } } catch { /* ignora */ }
  FILA_MEM = []; renderFila(); clearInterval(TIMER_FILA);
  return _encerrarR3();
};

/* ================= papel na tela ================= */
const _aplicarPapelR3 = aplicarPapelNaTela;
aplicarPapelNaTela = function () {
  _aplicarPapelR3();
  $('#loteNota').hidden = SOU_GESTOR;
};

/* ================= painel: vendas sem valor ================= */
function renderSemValor() {
  const card = $('#cardSemValor'); if (!card || !PERFIL?.id) return;
  const todos = R4.semValorPago(TODOS), meus = todos.filter(l => String(l.responsavel_id || '') === String(PERFIL.id));
  const n = SOU_GESTOR ? todos.length : meus.length;
  card.hidden = !n;
  if (!n) return;
  $('#svTitulo').textContent = `${n} venda${n === 1 ? '' : 's'} concluída${n === 1 ? '' : 's'} sem valor pago`;
  $('#svSub').textContent = SOU_GESTOR ? 'Sem o valor, o faturamento fica vazio. Dá para preencher várias de uma vez.'
    : 'Abra cada uma e coloque quanto o cliente pagou (ou marque cortesia).';
  $('#svPreencher').hidden = !SOU_GESTOR;
}
$('#svVer').addEventListener('click', () => {
  $('#fStatus').value = ''; $('#soParados').checked = false; $('#soSemValor').checked = true;
  $('#fResp').value = SOU_GESTOR ? '' : 'meus'; salvarResp(); irPara('leads'); refiltrarTela();
});
$('#svPreencher').addEventListener('click', () => abrirValores());
const _renderPainelR3 = renderPainel;
renderPainel = function () { _renderPainelR3(); renderSemValor(); };

/* ================= preencher valores em lote (gestor) ================= */
let VALORES = [];
async function abrirValores() {
  const dlg = $('#dlgValores');
  $('#dvErro').textContent = ''; $('#tblValores').innerHTML = '<tbody><tr><td><div class="skeleton" aria-label="Carregando concluídos sem valor"></div></td></tr></tbody>';
  if (!dlg.open) abrirDlg(dlg);
  try {
    const r = await api('/api/leads/sem-valor');
    VALORES = r.leads || [];
    renderValores();
  } catch (e) { $('#tblValores').innerHTML = `<tbody><tr><td class="vazio-celula">Não consegui carregar agora: ${esc(e.message)}</td></tr></tbody>`; }
}
function sugestoesDe(l) { return R4.sugestoesValor(l, l.sugestoes || {}); }
function renderValores() {
  $('#dvConta').textContent = `${VALORES.length} sem valor`;
  $('#dvSalvar').disabled = !VALORES.length;
  if (!VALORES.length) { $('#tblValores').innerHTML = '<tbody><tr><td class="vazio-celula"><strong>Tudo preenchido. 🏁</strong></td></tr></tbody>'; return; }
  const comSug = VALORES.filter(l => sugestoesDe(l).length).length;
  $('#dvSugestoes').hidden = !comSug; $('#dvSugestoes').textContent = `Usar as sugestões nos vazios (${comSug})`;
  $('#tblValores').innerHTML = `<thead><tr><th>Cliente</th><th>Concluído</th><th>Responsável</th><th class="num">Valor pago (R$)</th><th>Cortesia</th></tr></thead>
    <tbody>${VALORES.map(l => { const s = sugestoesDe(l); return `<tr class="sem-clique" data-dv="${esc(l.id)}">
      <td><div class="cell-main">${esc(l.nome)}</div><div class="cell-sub">${esc(l.servico || l.carro_modelo || '—')}</div>
        ${s.length ? `<div class="dv-sug">${s.map(x => `<button type="button" class="mini-sug" data-sug="${esc(x.valor)}" title="${esc(x.rotulo)}">${esc(brl(x.valor))}</button>`).join('')}</div>` : ''}</td>
      <td class="cell-sub">${esc(dtAno(l.closed_at))}</td>
      <td>${l.responsavel_id ? chipResponsavel(l.responsavel_id) : '<span class="muted">—</span>'}</td>
      <td class="num"><input type="number" class="dv-valor" min="0.01" max="10000000" step="0.01" inputmode="decimal" placeholder="${s[0] ? esc(s[0].valor) : '0,00'}" aria-label="Valor pago por ${esc(l.nome)}"></td>
      <td><label class="chk dv-cort"><input type="checkbox" class="dv-cortesia" aria-label="${esc(l.nome)} foi cortesia"> sem cobrança</label></td></tr>`; }).join('')}</tbody>`;
}
$('#tblValores').addEventListener('click', e => {
  const b = e.target.closest('[data-sug]'); if (!b) return;
  const tr = b.closest('tr'); tr.querySelector('.dv-valor').value = b.dataset.sug; tr.querySelector('.dv-cortesia').checked = false;
});
$('#tblValores').addEventListener('change', e => { if (e.target.classList.contains('dv-cortesia') && e.target.checked) e.target.closest('tr').querySelector('.dv-valor').value = ''; });
$('#dvSugestoes').addEventListener('click', () => {
  let n = 0;
  for (const tr of $$('#tblValores tr[data-dv]')) { const l = VALORES.find(x => x.id === tr.dataset.dv), s = l && sugestoesDe(l)[0], i = tr.querySelector('.dv-valor'); if (s && !i.value && !tr.querySelector('.dv-cortesia').checked) { i.value = s.valor; n++; } }
  toast(n ? `${n} valor${n === 1 ? '' : 'es'} preenchido${n === 1 ? '' : 's'} com a sugestão. Confira antes de salvar.` : 'Nenhum vazio com sugestão.');
});
$('#formValores').addEventListener('submit', async e => {
  e.preventDefault();
  const itens = [];
  for (const tr of $$('#tblValores tr[data-dv]')) {
    const v = tr.querySelector('.dv-valor').value, c = tr.querySelector('.dv-cortesia').checked;
    if (c) itens.push({id: tr.dataset.dv, cortesia: true}); else if (v !== '') itens.push({id: tr.dataset.dv, valor_pago: Number(String(v).replace(',', '.'))});
  }
  let limpos; try { limpos = R4.validarValores(itens); } catch (err) { $('#dvErro').textContent = err.message; return; }
  const btn = $('#dvSalvar'); btn.disabled = true; btn.textContent = 'Salvando…'; $('#dvErro').textContent = '';
  try {
    const r = await api('/api/leads/valores-lote', {method: 'POST', body: JSON.stringify({itens: limpos})});
    for (const f of r.feitos || []) substituirLocal({id: f.id, valor_pago: f.depois.valor_pago, observacoes: f.depois.observacoes});
    redesenhar();
    VALORES = VALORES.filter(l => !(r.feitos || []).some(f => f.id === l.id)); renderValores();
    const msg = `💰 ${r.atualizados} valor${r.atualizados === 1 ? '' : 'es'} salvo${r.atualizados === 1 ? '' : 's'}` + (r.pulados?.length ? ` · ${r.pulados.length} pulado${r.pulados.length === 1 ? '' : 's'} (${r.pulados[0].motivo})` : '');
    toastAcao(msg, 'Desfazer', async () => {
      const d = await api('/api/leads/valores-lote/desfazer', {method: 'POST', body: JSON.stringify({itens: r.feitos})});
      await carregarLeads(); renderPainel(); toast(`Desfeito: ${d.voltaram} valor${d.voltaram === 1 ? '' : 'es'} voltaram${d.pulados?.length ? ` (${d.pulados.length} já tinham mudado)` : ''}.`);
    }, 9000);
    api('/api/auditoria/exportacao', {method: 'POST', body: JSON.stringify({tipo: 'valores', quantidade: r.atualizados})}).catch(() => {});
  } catch (err) { $('#dvErro').textContent = err.message; }
  finally { btn.disabled = !VALORES.length; btn.textContent = 'Salvar valores'; }
});

/* ================= distribuir leads (gestor) ================= */
const DS = {status: new Set(['novo', 'contato', 'orcamento', 'agendado', 'em_servico']), origem: new Set(), gente: null, vendedores: [], plano: null};
async function carregarDistribuir() {
  if (!SOU_GESTOR) { irPara('dashboard'); return; }
  renderFiltrosDs();
  $('#dsPrevia').disabled = true;
  $('#dsGente').setAttribute('aria-busy', 'true');
  $('#dsGente').textContent = 'Carregando equipe…';
  try {
    const r = await api('/api/vendedores');
    DS.vendedores = (r.vendedores || []).filter(v => v.papel !== 'agenda');
    if (!DS.gente) DS.gente = new Set(DS.vendedores.filter(v => v.recebe_leads !== false && v.papel !== 'admin').map(v => v.id));
    if (!DS.gente.size) DS.gente = new Set(DS.vendedores.map(v => v.id));
    renderGenteDs();
  } catch (e) {
    DS.vendedores = [];
    DS.plano = null;
    $('#dsResultado').hidden = true;
    $('#dsGenteQtd').textContent = '';
    $('#dsGente').innerHTML = `<p class="vazio-curto" role="alert">Não consegui carregar a equipe: ${esc(e.message)}</p><button type="button" class="btn btn-ghost" id="dsTentarEquipe">Tentar novamente</button>`;
    $('#dsTentarEquipe').addEventListener('click', carregarDistribuir);
  } finally {
    $('#dsGente').setAttribute('aria-busy', 'false');
    atualizarPreviaDs();
  }
  carregarHistoricoDs();
}
function candidatosDs() {
  return R4.filtrarDistribuir(TODOS, {status: [...DS.status], origem: [...DS.origem], idade: $('#dsIdade').value});
}
function renderFiltrosDs() {
  const semDono = TODOS.filter(l => !l.responsavel_id);
  const pill = (grupo, v, rot, n) => `<button type="button" class="filtro-pill${DS[grupo].has(v) ? ' ativo' : ''}" data-ds="${grupo}" data-v="${esc(v)}" aria-pressed="${DS[grupo].has(v)}">${esc(rot)} <small>${n}</small></button>`;
  $('#dsStatus').innerHTML = STATUSES.map(s => pill('status', s, LABEL_STATUS[s] ?? s, semDono.filter(l => l.status === s).length)).join('');
  $('#dsOrigem').innerHTML = ORIGENS.filter(o => semDono.some(l => (l.origem || 'organico') === o)).map(o => pill('origem', o, LABEL_ORIGEM[o] ?? o, semDono.filter(l => (l.origem || 'organico') === o).length)).join('') || '<span class="muted">—</span>';
  const n = candidatosDs().length;
  $('#dsQtd').textContent = `${n} contato${n === 1 ? '' : 's'} sem responsável neste filtro`;
  atualizarPreviaDs(n);
}
function atualizarPreviaDs(total = candidatosDs().length) {
  $('#dsPrevia').disabled = !total || $('#dsGente').getAttribute('aria-busy') === 'true' || !DS.vendedores.some(v => DS.gente?.has(v.id));
}
for (const sel of ['#dsStatus', '#dsOrigem']) $(sel).addEventListener('click', e => {
  const b = e.target.closest('[data-ds]'); if (!b) return;
  const botoes = [...e.currentTarget.querySelectorAll('[data-ds]')];
  const indice = botoes.indexOf(b);
  const manterFoco = b === document.activeElement;
  const g = DS[b.dataset.ds]; if (g.has(b.dataset.v)) g.delete(b.dataset.v); else g.add(b.dataset.v);
  DS.plano = null; $('#dsResultado').hidden = true; renderFiltrosDs();
  if (manterFoco) e.currentTarget.querySelectorAll('[data-ds]')[indice]?.focus();
});
$('#dsIdade').addEventListener('change', () => { DS.plano = null; $('#dsResultado').hidden = true; renderFiltrosDs(); });
function renderGenteDs() {
  $('#dsGente').innerHTML = DS.vendedores.length ? DS.vendedores.map(v => `<label class="ds-pessoa"><input type="checkbox" value="${esc(v.id)}" ${DS.gente.has(v.id) ? 'checked' : ''}>
      ${chipResponsavel(v.id)}<small>${esc(v.abertos ?? 0)} aberto${v.abertos === 1 ? '' : 's'}${v.recebe_leads === false ? ' · não recebe no rodízio' : ''}</small></label>`).join('')
    : '<p class="vazio-curto">Ninguém da equipe pode receber contatos do CRM ainda. Libere o app CRM para os vendedores em Configurações › Equipe.</p>';
  atualizarGenteDs();
}
function atualizarGenteDs() {
  const total = DS.vendedores.filter(v => DS.gente?.has(v.id)).length;
  $('#dsGenteQtd').textContent = total === 1 ? '1 pessoa escolhida' : `${total} pessoas escolhidas`;
  atualizarPreviaDs();
}
$('#dsGente').addEventListener('change', e => { const i = e.target.closest('input[type=checkbox]'); if (!i) return; if (i.checked) DS.gente.add(i.value); else DS.gente.delete(i.value); DS.plano = null; $('#dsResultado').hidden = true; atualizarGenteDs(); });
$$('input[name=dsModo]').forEach(r => r.addEventListener('change', () => { DS.plano = null; $('#dsResultado').hidden = true; }));
function montarPrevia() {
  const leads = candidatosDs(), gente = DS.vendedores.filter(v => DS.gente.has(v.id));
  if (!gente.length) { toast('Escolha ao menos uma pessoa para receber.'); return; }
  if (!leads.length) { toast('Nenhum contato sem responsável neste filtro.'); return; }
  const corte = leads.slice(0, 1000);
  DS.plano = R4.planoDistribuicao(corte, gente, {modo: $('input[name=dsModo]:checked').value});
  $('#dsResultado').hidden = false;
  $('#dsPreviaTxt').textContent = `${DS.plano.total} contato${DS.plano.total === 1 ? '' : 's'} para ${gente.length} pessoa${gente.length === 1 ? '' : 's'}` + (leads.length > 1000 ? ` (os primeiros 1.000 de ${leads.length}; grave e repita para o resto)` : '');
  $('#tblDsResumo').innerHTML = `<thead><tr><th>Pessoa</th><th class="num">Recebe</th><th>Por etapa</th><th class="num">Abertos depois</th></tr></thead>
    <tbody>${DS.plano.resumo.map(x => `<tr class="sem-clique"><td>${chipResponsavel(x.id)}</td><td class="num"><b>${x.recebe}</b></td>
      <td class="cell-sub">${Object.entries(x.porEtapa).map(([s, n]) => `${esc(LABEL_STATUS[s] ?? s)} ${n}`).join(' · ') || '—'}</td>
      <td class="num">${esc((DS.vendedores.find(v => v.id === x.id)?.abertos || 0) + x.recebe)}</td></tr>`).join('')}</tbody>`;
  const agora = Date.now();
  $('#tblDsLeads').innerHTML = `<thead><tr><th>Contato</th><th>Etapa</th><th>Origem</th><th>Entrou</th><th>Vai para</th></tr></thead>
    <tbody>${DS.plano.plano.slice(0, 300).map(p => { const l = TODOS.find(x => String(x.id) === p.id) || {}; return `<tr class="sem-clique"><td>${esc(l.nome || p.nome)}</td><td>${esc(LABEL_STATUS[p.status] ?? p.status)}</td>
      <td>${esc(LABEL_ORIGEM[l.origem] ?? l.origem ?? '')}</td><td class="cell-sub">${esc(R4.idadeDias(l, agora))} dias</td><td>${chipResponsavel(p.para)}</td></tr>`; }).join('')}
      ${DS.plano.plano.length > 300 ? `<tr class="sem-clique"><td colspan="5" class="muted">…e mais ${DS.plano.plano.length - 300}.</td></tr>` : ''}</tbody>`;
  $('#dsGravar').disabled = false;
  $('#dsResultado').scrollIntoView({block: 'start', behavior: 'smooth'});
}
$('#dsPrevia').addEventListener('click', montarPrevia);
$('#dsRefazer').addEventListener('click', () => { DS.plano = null; $('#dsResultado').hidden = true; $('#dsPrevia').focus(); });
$('#dsGravar').addEventListener('click', async () => {
  if (!DS.plano?.total) return;
  if (!confirm(`Passar ${DS.plano.total} contato${DS.plano.total === 1 ? '' : 's'} para ${DS.plano.resumo.length} pessoa${DS.plano.resumo.length === 1 ? '' : 's'}? Cada uma recebe um aviso só. Dá para desfazer depois.`)) return;
  const btn = $('#dsGravar'); btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    const r = await api('/api/leads/distribuir', {method: 'POST', body: JSON.stringify({grupos: R4.gruposDoPlano(DS.plano.plano), modo: $('input[name=dsModo]:checked').value,
      filtros: {status: [...DS.status], origem: [...DS.origem], idade: $('#dsIdade').value}})});
    for (const it of r.itens || []) substituirLocal({id: it.id, responsavel_id: it.para});
    DS.plano = null; $('#dsResultado').hidden = true; redesenhar(); renderFiltrosDs();
    const quem = (r.porPessoa || []).map(p => `${primeiroNome(p.nome)} ${p.recebeu}`).join(', ');
    const msg = `✅ ${r.atualizados} contato${r.atualizados === 1 ? '' : 's'} distribuído${r.atualizados === 1 ? '' : 's'} (${quem})` + (r.pulados ? ` · ${r.pulados} já tinham dono` : '');
    if (r.lote) toastAcao(msg, 'Desfazer', () => desfazerDistribuicao(r.lote), 12000); else toast(msg, 7000);
    carregarHistoricoDs(); carregarDistribuirGente();
  } catch (e) { toast('⚠️ ' + e.message, 7000); }
  finally { btn.textContent = 'Gravar distribuição'; btn.disabled = false; }
});
async function carregarDistribuirGente() { try { const r = await api('/api/vendedores'); DS.vendedores = (r.vendedores || []).filter(v => v.papel !== 'agenda'); renderGenteDs(); } catch { /* fica a lista de antes */ } }
async function desfazerDistribuicao(lote) {
  if (!confirm('Desfazer esta distribuição? Os contatos voltam a ficar sem responsável (menos os que já foram passados para outra pessoa).')) return;
  const r = await api(`/api/leads/distribuicoes/${encodeURIComponent(lote)}/desfazer`, {method: 'POST', body: '{}'});
  await carregarLeads(); renderPainel(); if ($('#view-distribuir').classList.contains('active')) { renderFiltrosDs(); carregarHistoricoDs(); carregarDistribuirGente(); }
  toast(`Distribuição desfeita: ${r.voltaram} voltaram${r.ficaram ? `, ${r.ficaram} ficaram com quem pegou depois` : ''}.`, 6000);
}
async function carregarHistoricoDs() {
  const el = $('#dsHistorico');
  try {
    const r = await api('/api/leads/distribuicoes');
    if (r.indisponivel) { el.innerHTML = '<p class="vazio-curto">O histórico aparece aqui quando a tabela de distribuições estiver no banco.</p>'; return; }
    const lista = r.distribuicoes || [];
    el.innerHTML = lista.length ? `<ul class="ds-hist">${lista.map(d => `<li><div><strong>${esc(d.total)} contatos</strong> · ${esc(new Date(d.em).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}))} · por ${esc(d.por)}
        <small>${d.pessoas.map(p => `${esc(primeiroNome(p.nome))} ${p.recebeu}`).join(' · ')}</small></div>
        ${d.desfeita_em ? `<span class="tag">desfeita${d.desfeita_por ? ' por ' + esc(primeiroNome(d.desfeita_por)) : ''}</span>` : `<button type="button" class="btn btn-ghost sm" data-desfazer="${esc(d.id)}">Desfazer</button>`}</li>`).join('')}</ul>`
      : '<p class="vazio-curto">Nenhuma distribuição ainda. Escolha os contatos e as pessoas acima.</p>';
  } catch (e) { el.innerHTML = `<p class="vazio-curto">Não consegui ler o histórico: ${esc(e.message)}</p>`; }
}
$('#dsHistorico').addEventListener('click', async e => { const b = e.target.closest('[data-desfazer]'); if (!b) return; b.disabled = true; try { await desfazerDistribuicao(b.dataset.desfazer); } catch (err) { toast('⚠️ ' + err.message); } finally { b.disabled = false; } });


document.addEventListener('indycar:aba', e => {
  if (e.detail.aba === 'distribuir') carregarDistribuir();
});

/* ================= estados vazios com atalho ================= */
$('#tblLeads').addEventListener('click', e => {
  const b = e.target.closest('[data-vazio]'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.vazio === 'sem') { $('#fResp').value = 'sem'; salvarResp(); refiltrarTela(); }
  if (b.dataset.vazio === 'distribuir') irPara('distribuir');
}, true);

/* link do aviso de distribuição: /?meus=1 abre "Meus contatos" */
const _abrirPorLinkR3 = abrirPorLink;
abrirPorLink = async function () {
  const p = new URLSearchParams(location.search);
  if (p.get('meus') === '1') { history.replaceState(null, '', location.pathname); $('#fResp').value = 'meus'; salvarResp(); irPara('leads'); refiltrarTela(); return; }
  return _abrirPorLinkR3();
};


