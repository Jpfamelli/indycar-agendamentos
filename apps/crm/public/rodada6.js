// Rodada 6 (21/10/2026): o CRM enxerga o carro no Pátio, o orçamento e a conversa de cada lead.
// Sinais ao vivo no funil, registro de contato com retorno combinado, aba Hoje (fila do dia + carros
// entregues para concluir), aba Dono (resumo, meta, ROI por campanha) e links em aba nomeada.
// Carrega por último; usa o escopo global (api, TODOS, PERFIL, U, abrirModal, moverEtapa, …).
'use strict';

const R6 = { sinais: {}, contagem: {}, rotulos: {}, em: 0, filtro: '', carregando: false, selFollow: null, ficha: 0 };
const A6 = window.IndyCarApps;
const quando6 = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const ETAPA6 = { recebido: 'Recebido', diagnostico: 'Diagnóstico', aguardando_aprovacao: 'Aguardando aprovação', aguardando_peca: 'Aguardando peça', em_execucao: 'Em execução', teste: 'Teste', pronto: 'Pronto', entregue: 'Entregue' };
const PRESETS6 = [['2h', 'Daqui a 2 horas'], ['hoje', 'Hoje, no fim da tarde'], ['amanha', 'Amanhã cedo'], ['3d', 'Em 3 dias úteis'], ['1sem', 'Em 1 semana'], ['2sem', 'Em 2 semanas']];
const RESULTADOS6 = [['', 'Sem resultado definido'], ['atendeu', 'Atendeu'], ['respondeu', 'Respondeu'], ['nao_atendeu', 'Não atendeu'], ['caixa_postal', 'Caixa postal'], ['sem_resposta', 'Sem resposta'], ['pediu_prazo', 'Pediu um prazo'], ['agendou', 'Agendou'], ['recusou', 'Recusou'], ['outro', 'Outro']];
const TIPOS6 = [['ligacao', '📞 Ligação'], ['whatsapp', '🟢 WhatsApp'], ['visita', '🏁 Visita'], ['nota', '📝 Só uma anotação']];
const leadPorId6 = id => TODOS.find(x => String(x.id) === String(id));
const api6 = (url, opts, cfg) => api(url, opts, false, cfg || { tentativas: 1 });
const post6 = (url, corpo) => api(url, { method: 'POST', body: JSON.stringify(corpo || {}) });

/* ================= links para outros apps abrem sempre na mesma aba nomeada ================= */
function appDoLink6(href) {
  let u; try { u = new URL(href, location.href); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  for (const app of ['patio', 'orcador', 'atendimento', 'agenda', 'comunicar', 'site']) {
    const base = A6.urlApp(app, '/'); if (!base) continue;
    try { const b = new URL(base, location.href); if (b.origin === u.origin && u.pathname.startsWith(b.pathname === '/' ? '/' : b.pathname) && !(app === 'agenda' && A6.CENTRAL && !u.pathname.startsWith(b.pathname))) return app; } catch { /* segue */ }
  }
  return null;
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]'); if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (a.closest('#ecossistema')) return;
  const app = appDoLink6(a.getAttribute('href')); if (!app) return;
  if (A6.CENTRAL && ['agenda', 'atendimento', 'comunicar'].includes(app) && !a.target) return;
  e.preventDefault(); abrirNomeada6(a.href, app);
}, true);
function abrirNomeada6(u, app) { const w = window.open(u, 'indycar-' + app); if (w) { try { w.opener = null; w.focus(); } catch { /* outra origem */ } } return w; }
const abrirApp6 = (app, caminho) => { const u = A6.urlApp(app, caminho); if (u) abrirNomeada6(u, app); };

/* ================= sinais ao vivo ================= */
async function carregarSinais6(forcar) {
  if (R6.carregando || !PERFIL?.id) return;
  if (!forcar && Date.now() - R6.em < 25000) return;
  R6.carregando = true;
  try {
    const r = await api6('/api/pipeline/sinais' + (forcar ? '?agora=1' : ''));
    R6.sinais = r.leads || {}; R6.contagem = r.contagem || {}; R6.rotulos = r.rotulos || {}; R6.em = Date.now();
    renderFiltroSinal6(); renderKanban(); renderSeloHoje6();
    if (typeof LEAD_ABERTO !== 'undefined' && LEAD_ABERTO) r6FichaLeve(leadPorId6(LEAD_ABERTO));
  } catch (e) { console.warn("[r6] sinais:", e.message); }
  finally { R6.carregando = false; }
}
function chips6(l) {
  const s = R6.sinais[l.id]; if (!s) return '';
  const c = [];
  if (s.patio) c.push(`<span class="r6-chip patio${s.patio.etapa === 'pronto' ? ' ok' : ''}" title="Carro no Pátio${s.patio.numero ? ' · ordem ' + s.patio.numero : ''}">🔧 ${esc(ETAPA6[s.patio.etapa] || s.patio.etapa)}</span>`);
  if (s.entregue) c.push(`<span class="r6-chip alerta" title="O carro já saiu: falta concluir o lead">🏁 entregue${s.entregue.dias ? ' há ' + s.entregue.dias + ' d' : ''}: concluir</span>`);
  if (s.orcamento) c.push(`<span class="r6-chip${s.flagsOrc ? '' : ''}${(s.flags || []).includes('orcamento_parado') ? ' alerta' : s.orcamento.status === 'aprovado' ? ' ok' : ''}" title="Orçamento nº ${esc(s.orcamento.numero ?? '')} no Orçador">🧾 ${s.orcamento.status === 'aprovado' ? 'aprovado' : s.orcamento.visualizado ? 'visto' : 'enviado'}${s.orcamento.dias ? ' há ' + s.orcamento.dias + ' d' : ''}${s.orcamento.total ? ' · ' + brl(s.orcamento.total) : ''}</span>`);
  if (s.esperando) c.push(`<span class="r6-chip alerta" title="Conversa esperando consultor">⏳ ${s.esperando.horas ? s.esperando.horas + ' h' : 'esperando'}</span>`);
  if (s.agendamento) c.push(`<span class="r6-chip" title="Horário na Agenda">📅 ${esc(quando6(s.agendamento.quando))}</span>`);
  if (s.followup) c.push(`<span class="r6-chip${s.followup.vencido ? ' alerta' : ''}" title="Retorno combinado">⏰ ${s.followup.vencido ? 'vencido' : esc(quando6(s.followup.em))}</span>`);
  if (s.tarefa?.atrasada) c.push('<span class="r6-chip alerta" title="Tem tarefa atrasada">✅ atrasada</span>');
  if (s.tentativas >= 2) c.push(`<span class="r6-chip" title="Tentativas sem resposta">☎ ${s.tentativas}x sem resposta</span>`);
  return c.length ? `<div class="r6-chips">${c.join('')}</div>` : '';
}
const _cartaoKanbanR5 = cartaoKanban;
cartaoKanban = function (l, agora) {
  let h = _cartaoKanbanR5(l, agora);
  const extra = chips6(l) + (travaLead(l) ? '' : `<div class="r6-rapidas"><button type="button" class="r6-mini" data-r6="contato" data-id="${esc(l.id)}" title="Registrar um contato (tecla C)">📞 Contato</button><button type="button" class="r6-mini" data-r6="adiar" data-id="${esc(l.id)}" title="Combinar quando falar de novo (tecla A)">⏰ Retorno</button></div>`);
  const i = h.indexOf('<select class="kb-etapa"');
  const j = h.lastIndexOf('<span class="tag selo-dono"', i);
  const corte = j > -1 && j > h.lastIndexOf('</div>', i) ? j : i;
  return corte > -1 ? h.slice(0, corte) + extra + h.slice(corte) : h;
};
if (typeof U.ABERTAS !== 'undefined') void 0;
function renderFiltroSinal6() {
  const barra = $('.kb-barra'); if (!barra) return;
  let sel = $('#fSinal6');
  if (!sel) { sel = document.createElement('select'); sel.id = 'fSinal6'; sel.className = 'f-resp'; sel.setAttribute('aria-label', 'Filtrar o funil por sinal'); barra.insertBefore(sel, $('#kbResumo')); sel.addEventListener('change', () => { R6.filtro = sel.value; renderKanban(); }); }
  const ordem = ['esperando', 'primeiro_contato', 'followup_vencido', 'tarefa_atrasada', 'orcamento_parado', 'orcamento_aprovado', 'patio', 'pronto_retirar', 'entregue_fechar', 'extra_pendente'];
  const rf = $('#fRespFunil')?.value, eu = PERFIL?.id, cont = {};
  for (const l of TODOS) { if (!U.filtroResponsavel(l, rf, eu)) continue; for (const k of R6.sinais[l.id]?.flags || []) cont[k] = (cont[k] || 0) + 1; }
  sel.innerHTML = '<option value="">Todos os sinais</option>' + ordem.filter(k => cont[k]).map(k => `<option value="${k}"${R6.filtro === k ? ' selected' : ''}>${esc(R6.rotulos[k] || k)} (${cont[k]})</option>`).join('');
  if (R6.filtro && !cont[R6.filtro]) R6.filtro = '';
}
// o filtro por sinal atua sobre TODOS dentro do renderKanban existente: esconde o que não bate
const _renderKanbanR5 = renderKanban;
renderKanban = function () {
  _renderKanbanR5();
  if (!R6.filtro) return;
  let total = 0;
  $$('#kanban .kb-card').forEach(c => { const ok = (R6.sinais[c.dataset.id]?.flags || []).includes(R6.filtro); c.hidden = !ok; if (ok) total++; });
  $$('#kanban .kb-col').forEach(col => { const n = $$('.kb-card:not([hidden])', col).length; const ct = $('.kb-count', col); if (ct) ct.textContent = n; });
  $('#kbResumo').textContent = `${total} lead${total === 1 ? '' : 's'} com “${R6.rotulos[R6.filtro] || R6.filtro}”`;
};

/* ================= registrar contato ================= */
function montarDlgContato6() {
  if ($('#dlgContato6')) return;
  document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg" id="dlgContato6" aria-labelledby="dlgContato6T"><form method="dialog" id="formContato6">
    <h3 id="dlgContato6T">Registrar contato</h3><p class="muted" id="ct6Nome"></p>
    <label>Como foi<select id="ct6Tipo">${TIPOS6.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label>
    <label>O que aconteceu<select id="ct6Res">${RESULTADOS6.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label>
    <label>Anotação (sem dados de cartão ou senha)<textarea id="ct6Texto" rows="3" maxlength="1000" placeholder="Ex.: quer trocar as pastilhas, volta a falar sexta"></textarea></label>
    <label>Falar de novo<select id="ct6Prox"><option value="">Sugerir pelo resultado</option><option value="__nao">Não combinar retorno</option>${PRESETS6.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label>
    <label class="r6-check"><input type="checkbox" id="ct6Tarefa" /> Criar também uma tarefa de retorno</label>
    <p class="form-erro" id="ct6Erro" role="alert"></p>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><div class="spacer"></div><button type="submit" class="btn btn-primary" id="ct6Ok">Salvar contato</button></div></form></dialog>`);
  const dlg = $('#dlgContato6');
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('#ct6Texto').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#formContato6').requestSubmit(); } });
  $('#formContato6').addEventListener('submit', async e => {
    e.preventDefault();
    const id = dlg.dataset.lead, tipo = $('#ct6Tipo').value, res = $('#ct6Res').value, texto = $('#ct6Texto').value.trim(), prox = $('#ct6Prox').value;
    if (tipo !== 'nota' && !res && !texto) { $('#ct6Erro').textContent = 'Diga o que aconteceu: escolha um resultado ou escreva uma anotação.'; return; }
    const corpo = { tipo, resultado: res || null, texto };
    if (prox === '__nao') corpo.proximo = null; else if (prox) corpo.proximo = prox;
    if ($('#ct6Tarefa').checked) corpo.criar_tarefa = true;
    const b = $('#ct6Ok'); b.disabled = true; b.textContent = 'Salvando…'; $('#ct6Erro').textContent = '';
    try {
      const r = await post6(`/api/leads/${encodeURIComponent(id)}/contato`, corpo);
      try { localStorage.setItem('indycar_crm_ultimo_tipo', tipo); } catch { /* sem armazenamento */ }
      dlg._ok(r);
    } catch (err) { $('#ct6Erro').textContent = err.message; }
    finally { b.disabled = false; b.textContent = 'Salvar contato'; }
  });
}
async function registrarContato6(id, pre = {}) {
  const l = leadPorId6(id); if (!l) return;
  const trava = travaLead(l); if (trava) { toast('🔒 ' + trava, 6000); return; }
  montarDlgContato6();
  const dlg = $('#dlgContato6'); dlg.dataset.lead = l.id;
  $('#ct6Nome').textContent = `${l.nome} · ${U.formatarTelefone(l.telefone)}`;
  $('#ct6Tipo').value = pre.tipo || (() => { try { const v = localStorage.getItem('indycar_crm_ultimo_tipo'); return TIPOS6.some(x => x[0] === v) ? v : 'ligacao'; } catch { return 'ligacao'; } })(); $('#ct6Res').value = pre.resultado || ''; $('#ct6Texto').value = ''; $('#ct6Prox').value = pre.proximo || ''; $('#ct6Tarefa').checked = false; $('#ct6Erro').textContent = '';
  const r = await abrirDlg(dlg); if (!r) return;
  aplicarContato6(l, r);
}
function aplicarContato6(l, r) {
  if (r.lead) substituirLocal({ id: l.id, status: r.lead.status, ultimo_contato_em: r.lead.ultimo_contato_em, proximo_contato_em: r.lead.proximo_contato_em, tentativas_contato: r.lead.tentativas_contato, updated_at: new Date().toISOString() });
  redesenhar(); carregarSinais6(true);
  const s = r.sugestao;
  if (s?.codigo === 'perder') toastAcao('📞 Contato salvo. ' + s.texto, 'Marcar como perdido', async () => { await moverEtapa(l.id, 'perdido'); }, 14000);
  else if (s?.codigo === 'agendar') toastAcao('📞 Contato salvo. ' + s.texto, 'Abrir a Agenda', () => abrirApp6('agenda', `/?tel=${U.telE164(l.telefone) || ''}`), 14000);
  else toast('📞 Contato salvo' + (r.lead?.proximo_contato_em ? ' · retorno ' + quando6(r.lead.proximo_contato_em) : '') + (r.tarefa ? ' · tarefa criada' : ''), 5000);
  if (typeof LEAD_ABERTO !== 'undefined' && String(LEAD_ABERTO) === String(l.id)) r6CarregarAtividades(l.id);
}
async function adiar6(id) {
  const l = leadPorId6(id); if (!l) return;
  const trava = travaLead(l); if (trava) { toast('🔒 ' + trava, 6000); return; }
  await registrarContato6(id, { tipo: 'followup', resultado: 'pediu_prazo', proximo: '1sem' });
}

/* ================= atalhos e cartões do funil ================= */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-r6]'); if (!b) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const id = b.dataset.id;
  if (b.dataset.r6 === 'contato') registrarContato6(id); else if (b.dataset.r6 === 'adiar') adiar6(id);
}, true);
$('#kanban').addEventListener('keydown', e => {
  const c = e.target.closest('.kb-card'); if (!c || e.target !== c || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'c') { e.preventDefault(); e.stopPropagation(); registrarContato6(c.dataset.id); }
  if (k === 'a') { e.preventDefault(); e.stopPropagation(); adiar6(c.dataset.id); }
});
$('#kanban').addEventListener('keydown', async e => {
  const c = e.target.closest('.kb-card'); if (!c || e.target !== c || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const l = leadPorId6(c.dataset.id); if (!l) return;
  const k = e.key.toLowerCase(), s = R6.sinais[l.id] || {};
  if (/^[1-7]$/.test(k)) { e.preventDefault(); e.stopPropagation(); const novo = STATUSES[Number(k) - 1]; if (novo && await moverEtapa(l.id, novo, { anunciar: true })) $('.kb-card[data-id="' + CSS.escape(String(l.id)) + '"]')?.focus(); return; }
  if (k === 'o') { e.preventDefault(); e.stopPropagation(); abrirFichaCliente(l.cliente_id || { tel: U.telE164(l.telefone) }); }
  if (k === 'p') { e.preventDefault(); e.stopPropagation(); if (s.patio) abrirApp6('patio', '/?os=' + s.patio.id); else toast('Esse lead não tem carro no Pátio agora.'); }
  if (k === 'q') { e.preventDefault(); e.stopPropagation(); if (s.orcamento) abrirApp6('orcador', '/#/historico/' + s.orcamento.id); else toast('Esse lead não tem orçamento enviado.'); }
});
if (U.ATALHOS_ABA) { U.ATALHOS_ABA.h = 'hoje'; U.ATALHOS_ABA.k = 'dono'; }

/* ================= ficha do lead: ecossistema + histórico de contatos ================= */
function r6Garantir() {
  let p = $('#r6Painel');
  if (!p) { p = document.createElement('div'); p.id = 'r6Painel'; p.className = 'r6-painel'; $('#painelTl').prepend(p); p.addEventListener('click', onClickPainel6); }
  return p;
}
function onClickPainel6(e) {
  const b = e.target.closest('[data-r6p]'); if (!b) return;
  const l = leadPorId6(LEAD_ABERTO); if (!l) return;
  const a = b.dataset.r6p;
  if (a === 'contato') registrarContato6(l.id);
  if (a === 'adiar') adiar6(l.id);
  if (a === 'copiar') { navigator.clipboard.writeText(b.dataset.txt).then(() => toast('Link copiado'), () => toast('Não consegui copiar.')); }
  if (a === 'cadencia') cadencia6(l.id, b.dataset.tipo);
  if (a === 'concluir') moverEtapa(l.id, 'concluido').then(() => { carregarSinais6(true); });
}
function r6FichaLeve(l) { if (l && $('#r6Painel')) r6Pintar(l); }
function r6Pintar(l) {
  const p = r6Garantir(), s = R6.sinais[l.id] || { flags: [] }, eco = R6.ficha && R6.eco && R6.eco.lead_id === l.id ? R6.eco : null;
  const L = eco?.links || {}, f = eco?.ficha || {};
  const trava = travaLead(l);
  const linha = [];
  if (s.patio) { const o = (f.patio || []).find(x => x.id === s.patio.id); const href = L.patio?.[s.patio.id] || A6.urlApp('patio', `/?os=${s.patio.id}`); linha.push(`<div class="r6-eco"><b>🔧 Carro no Pátio</b> · ${esc(ETAPA6[s.patio.etapa] || s.patio.etapa)} desde ${esc(quando6(s.patio.etapa_em))}${s.patio.previsao_entrega ? ' · previsão ' + esc(quando6(s.patio.previsao_entrega)) : ''}${s.patio.extras_pendentes ? ` · <b class="parado-txt">${s.patio.extras_pendentes} extra(s) esperando o cliente</b>` : ''}
    <span class="r6-links"><a class="acao" href="${esc(href)}">Abrir no Pátio</a>${o?.link_cliente ? `<button type="button" class="acao" data-r6p="copiar" data-txt="${esc(o.link_cliente)}">🔗 Copiar link do cliente</button>` : ''}</span></div>`); }
  if (s.entregue) linha.push(`<div class="r6-eco alerta"><b>🏁 Carro entregue${s.entregue.dias ? ' há ' + s.entregue.dias + ' d' : ' hoje'}</b> · falta concluir o lead com o valor pago. ${trava ? '' : '<button type="button" class="acao acao-forte" data-r6p="concluir">Concluir agora</button>'}</div>`);
  if (s.orcamento) { const href = L.orcamentos?.[s.orcamento.id] || A6.urlApp('orcador', `/#/historico/${s.orcamento.id}`); linha.push(`<div class="r6-eco"><b>🧾 Orçamento nº ${esc(s.orcamento.numero ?? '')}</b> · ${esc(s.orcamento.status)} · ${brl(s.orcamento.total)}${s.orcamento.visualizado ? ' · o cliente já abriu' : ''}${s.orcamento.dias ? ' · enviado há ' + s.orcamento.dias + ' d' : ''}<span class="r6-links"><a class="acao" href="${esc(href)}">Abrir no Orçador</a></span></div>`); }
  if (s.esperando) linha.push(`<div class="r6-eco alerta"><b>⏳ Cliente esperando</b> há ${s.esperando.horas || 0} h<span class="r6-links"><a class="acao" href="${esc(L.conversa || A6.urlApp('atendimento', `/?tel=${U.telE164(l.telefone) || ''}`))}">Abrir conversa</a></span></div>`);
  if (s.agendamento) linha.push(`<div class="r6-eco"><b>📅 Horário</b> · ${esc(quando6(s.agendamento.quando))} (${esc(s.agendamento.status)})<span class="r6-links"><a class="acao" href="${esc(L.agendamentos?.[s.agendamento.id] || A6.urlApp('agenda', `/?agendamento=${s.agendamento.id}`))}">Abrir na Agenda</a></span></div>`);
  if (f.segmento && f.segmento.codigo !== 'novo') linha.push(`<div class="r6-eco"><b>🪪 ${esc(f.segmento.rotulo)}</b>${f.segmento.ltv ? ' · já gastou ' + brl(f.segmento.ltv) : ''}${f.segmento.revisao_vencida ? ' · <b class="parado-txt">revisão vencida</b>' : ''}${f.nota ? ` · nota média ${f.nota.media} (${f.nota.total})` : ''}</div>`);
  const pa = eco?.proxima_acao;
  if (pa) linha.unshift('<div class="r6-eco acao-sug"><b>👉 Próxima ação:</b> ' + esc(pa.texto) + '<details class="r6-script"><summary>Mensagem sugerida</summary><p>' + esc(pa.script) + '</p><span class="r6-links"><button type="button" class="acao" data-r6p="copiar" data-txt="' + esc(pa.script) + '">Copiar texto</button>' + (U.telE164(l.telefone) ? '<a class="acao" href="https://wa.me/55' + esc(U.telE164(l.telefone)) + '?text=' + encodeURIComponent(pa.script) + '" target="_blank" rel="noopener">🟢 Abrir no WhatsApp</a>' : '') + '</span></details></div>');
  const prox = l.proximo_contato_em ? `<span class="r6-prox${Date.parse(l.proximo_contato_em) <= Date.now() ? ' alerta' : ''}">⏰ Falar de novo: ${esc(quando6(l.proximo_contato_em))}</span>` : '<span class="muted">Sem retorno combinado</span>';
  const novoOrc = L.novoOrcamento ? `<a class="acao" href="${esc(L.novoOrcamento)}">🧾 Novo orçamento</a>` : '';
  p.innerHTML = `${linha.join('')}
    <div class="r6-barra">${prox}${trava ? '' : `<button type="button" class="btn btn-primary sm" data-r6p="contato">📞 Registrar contato</button><button type="button" class="btn btn-ghost sm" data-r6p="adiar">⏰ Combinar retorno</button>
      <span class="r6-cad"><label class="sr" for="r6Cad">Cadência de tarefas</label><select id="r6Cad" aria-label="Criar cadência de tarefas"><option value="">＋ Cadência de tarefas…</option><option value="orcamento">Orçamento (1, 3 e 7 dias)</option><option value="posvenda">Pós-venda (2 e 30 dias)</option><option value="reativacao">Reativação</option></select></span>`}${novoOrc}</div>
    <ol class="r6-hist" id="r6Hist" aria-label="Contatos registrados"><li class="muted">Carregando contatos…</li></ol>`;
  $('#r6Cad')?.addEventListener('change', ev => { const t = ev.target.value; ev.target.value = ''; if (t) cadencia6(l.id, t); });
  if (R6.atividades && R6.atividades.lead === l.id) r6DesenharHist(R6.atividades.itens);
}
async function cadencia6(id, tipo) {
  try { const r = await post6(`/api/leads/${encodeURIComponent(id)}/cadencia`, { tipo }); toast(r.criadas.length ? `✅ ${r.rotulo}: ${r.criadas.length} tarefa(s) criada(s)${r.puladas ? ` (${r.puladas} já existiam)` : ''}` : `${r.rotulo}: as tarefas já existem`, 6000); if (typeof carregarTarefasLead === 'function') carregarTarefasLead(); carregarSinais6(true); } catch (e) { toast('⚠️ ' + e.message, 6000); }
}
function r6DesenharHist(itens) {
  const ol = $('#r6Hist'); if (!ol) return;
  ol.innerHTML = itens.length ? itens.map(a => `<li><span class="tag mini">${esc(({ ligacao: 'ligação', whatsapp: 'WhatsApp', visita: 'visita', nota: 'nota', followup: 'retorno', sistema: 'sistema' })[a.tipo] || a.tipo)}</span> <b>${esc(a.resultado_rotulo || '')}</b>${a.texto ? ' ' + esc(a.texto) : ''}${a.proximo_contato_em ? ` <small>→ retorno ${esc(quando6(a.proximo_contato_em))}</small>` : ''}<small class="muted"> · ${esc(a.autor ? primeiroNome(a.autor) : '')} ${esc(quando6(a.created_at))}</small></li>`).join('') : '<li class="muted">Nenhum contato registrado ainda.</li>';
}
async function r6CarregarAtividades(id) {
  try { const r = await api6(`/api/leads/${encodeURIComponent(id)}/atividades`); R6.atividades = { lead: id, itens: r.atividades || [] }; if (String(LEAD_ABERTO) === String(id)) r6DesenharHist(R6.atividades.itens); }
  catch { if ($('#r6Hist')) $('#r6Hist').innerHTML = '<li class="muted">Não consegui carregar os contatos agora.</li>'; }
}
async function r6CarregarEco(l) {
  const ger = ++R6.ficha;
  try { const r = await api6(`/api/leads/${encodeURIComponent(l.id)}/ecossistema`); if (ger !== R6.ficha) return; R6.eco = r; if (R6.sinais[l.id] === undefined && r.sinais) R6.sinais[l.id] = r.sinais; if (String(LEAD_ABERTO) === String(l.id)) r6Pintar(leadPorId6(l.id) || l); }
  catch { /* a ficha segue sem o ecossistema */ }
}
const _renderFichaLeadR6 = renderFichaLead;
renderFichaLead = function (l) {
  _renderFichaLeadR6(l);
  if (!l || !l.id) return;
  r6Pintar(l);
  if (!R6.atividades || R6.atividades.lead !== l.id || !R6.ultimo || R6.ultimo !== l.id) { R6.ultimo = l.id; r6CarregarAtividades(l.id); r6CarregarEco(l); }
};
const _fecharModalR6 = typeof fecharModal === 'function' ? fecharModal : null;

/* ================= lote: adiar o retorno dos selecionados ================= */
(function montarLote6() {
  const barra = $('#barraLote'); if (!barra || $('#loteRetorno6')) return;
  const sel = document.createElement('select'); sel.id = 'loteRetorno6'; sel.setAttribute('aria-label', 'Combinar retorno dos selecionados');
  sel.innerHTML = '<option value="">⏰ Combinar retorno…</option>' + PRESETS6.map(([v, r]) => `<option value="${v}">${r}</option>`).join('') + '<option value="__limpar">Tirar o retorno</option>';
  const ref = $('#loteCampanha') || $('#loteLimpar'); barra.insertBefore(sel, ref);
  sel.addEventListener('change', async () => {
    const v = sel.value; sel.value = ''; if (!v || !SEL.size) return;
    const ids = [...SEL];
    try {
      const r = await post6('/api/leads/followup-lote', v === '__limpar' ? { ids, limpar: true } : { ids, proximo: v });
      for (const id of r.ids) substituirLocal({ id, proximo_contato_em: r.proximo_contato_em });
      const ant = r.anteriores || {};
      SEL.clear(); redesenhar(); carregarSinais6(true);
      const extra = (r.de_colegas ? ` · ${r.de_colegas} de colega ficou de fora` : '') + (r.fechados ? ` · ${r.fechados} já fechado` : '');
      toastAcao(`⏰ Retorno combinado para ${r.atualizados} lead${r.atualizados === 1 ? '' : 's'}${extra}`, 'Desfazer', async () => {
        for (const id of r.ids) { try { await post6('/api/leads/followup-lote', ant[id] ? { ids: [id], proximo: ant[id] } : { ids: [id], limpar: true }); substituirLocal({ id, proximo_contato_em: ant[id] || null }); } catch { /* segue */ } }
        redesenhar(); carregarSinais6(true); toast('Retorno desfeito');
      }, 10000);
    } catch (e) { toast('⚠️ ' + e.message, 6000); }
  });
})();

/* ================= aba Hoje ================= */
TITULOS.hoje = ['Hoje', 'Quem contatar agora, e por quê, na ordem de urgência'];
TITULOS.dono = ['Dono', 'Meta do mês, pátio, orçamentos, anúncios e o que pede atenção'];
const H6 = { escopo: '', dados: null, entregues: null, motivo: '' };
function renderFaixa6() {
  const alvo = $('#view-dashboard'); if (!alvo) return;
  let f = $('#r6Faixa');
  if (!f) { f = document.createElement('div'); f.id = 'r6Faixa'; f.className = 'r6-faixa'; alvo.prepend(f); f.addEventListener('click', e => { const b = e.target.closest('[data-faixa]'); if (!b) return; if (b.dataset.faixa === 'hoje') irPara('hoje'); else { R6.filtro = b.dataset.faixa; irPara('pipeline'); renderFiltroSinal6(); renderKanban(); } }); }
  const c = R6.contagem, it = [['hoje', '⏳', (c.esperando || 0), 'esperando resposta'], ['followup_vencido', '⏰', (c.followup_vencido || 0), 'retornos vencidos'], ['entregue_fechar', '🏁', (c.entregue_fechar || 0), 'entregues para concluir'], ['orcamento_parado', '🧾', (c.orcamento_parado || 0), 'orçamentos parados'], ['pronto_retirar', '🔧', (c.pronto_retirar || 0), 'carros prontos']].filter(x => x[2]);
  f.hidden = !it.length;
  f.innerHTML = it.length ? '<b>Agora:</b> ' + it.map(([k, i, n, t]) => '<button type="button" class="r6-chip-btn" data-faixa="' + (k === 'hoje' ? 'hoje' : k) + '">' + i + ' ' + n + ' ' + t + '</button>').join('') : '';
}
function renderSeloHoje6() {
  renderFaixa6();
  const nav = $('.nav-item[data-view="hoje"]'); if (!nav) return;
  const c = R6.contagem; const n = (c.esperando || 0) + (c.followup_vencido || 0) + (c.primeiro_contato || 0) + (c.entregue_fechar || 0);
  nav.dataset.badge = n || '';
}
const textoMotivo6 = { esperando: 'Esperando resposta', entregue_fechar: 'Concluir', primeiro_contato: 'Primeiro contato', orcamento_aprovado: 'Marcar horário', followup_vencido: 'Retorno vencido', tarefa_atrasada: 'Tarefa atrasada', pronto_retirar: 'Avisar retirada', orcamento_parado: 'Orçamento parado', extra_pendente: 'Extra no Pátio', parado: 'Parado' };
async function carregarHoje6() {
  const el = $('#hojeLista'); if (!el) return;
  el.innerHTML = '<div class="skeleton" aria-label="Montando a fila"></div>';
  try {
    const [d, e] = await Promise.all([api6('/api/fila-do-dia' + (H6.escopo ? '?escopo=' + H6.escopo : '')), api6('/api/entregues-sem-fechar')]);
    H6.dados = d; H6.entregues = e; renderHoje6();
  } catch (err) { el.innerHTML = `<p class="vazio-curto">Não consegui montar a fila agora: ${esc(err.message)} <button type="button" class="link-btn" data-h6c="recarregar">Tentar de novo</button></p>`; }
}
function renderHoje6() {
  const d = H6.dados, e = H6.entregues; if (!d) return;
  $('#hojeResumo').innerHTML = `<b>${d.total}</b> para contatar · <b>${d.feitos_hoje}</b> contato${d.feitos_hoje === 1 ? '' : 's'} registrado${d.feitos_hoje === 1 ? '' : 's'} hoje` + (H6.motivo ? ` <button type="button" class="r6-chip-btn" data-h6="motivo" data-k="">limpar filtro</button>` : '') + Object.entries(d.por_motivo).map(([k, n]) => ` <button type="button" class="r6-chip-btn${H6.motivo === k ? ' on' : ''}" data-h6="motivo" data-k="${esc(k)}" aria-pressed="${H6.motivo === k}">${esc(textoMotivo6[k] || k)} ${n}</button>`).join('');
  const sel = $('#hojeEscopo'); if (sel && !sel.dataset.pronto) { sel.dataset.pronto = '1'; sel.innerHTML = (SOU_GESTOR ? '<option value="todos">Todos</option>' : '') + '<option value="meus">Meus leads</option><option value="sem">Sem responsável</option>'; sel.value = d.escopo; sel.onchange = () => { H6.escopo = sel.value; carregarHoje6(); }; }
  const ent = (e?.itens || []).filter(x => x.pode_editar);
  $('#hojeEntregues').innerHTML = ent.length ? `<h4>🏁 Carros entregues: falta concluir o lead (${ent.length})</h4>` + ent.map(x => `<div class="r6-linha" data-lead="${esc(x.lead.id)}"><div><strong>${esc(x.lead.nome)}</strong> <span class="muted">${esc(x.lead.carro_modelo || '')}</span><div class="cell-sub">Ordem nº ${esc(x.os.numero ?? '')} entregue há ${x.os.dias} d${x.orcamento ? ' · orçamento ' + brl(x.orcamento.total) : ''}${x.extras_aprovados ? ' + extras ' + brl(x.extras_aprovados) : ''}</div></div>
      <div class="r6-acoes">${x.sugestoes[0] ? `<span class="tag">sugerido ${brl(x.sugestoes[0].valor)}</span>` : ''}<button type="button" class="btn btn-primary sm" data-h6="concluir" data-id="${esc(x.lead.id)}">Concluir</button></div></div>`).join('') : '';
  const itensH = d.itens.filter(i => !H6.motivo || i.principal === H6.motivo);
  $('#hojeLista').innerHTML = itensH.length ? itensH.map(it => {
    const l = it.lead, tel = U.telE164(l.telefone);
    return `<article class="r6-linha" data-lead="${esc(l.id)}"><div class="r6-corpo"><div class="r6-topo"><strong>${esc(l.nome)}</strong> <span class="badge b-${esc(l.status)}">${esc(LABEL_STATUS[l.status] ?? l.status)}</span> ${l.responsavel_id ? chipResponsavel(l.responsavel_id, true) : '<span class="tag">sem dono</span>'}</div>
      <div class="cell-sub">${esc(it.texto)}${it.motivos.length > 1 ? ' · ' + esc(it.motivos.slice(1).map(m => m.texto).join(' · ')) : ''}</div>
      <details class="r6-script"><summary>Mensagem sugerida</summary><p>${esc(it.script)}</p><button type="button" class="link-btn" data-h6="copiar" data-txt="${esc(it.script)}">Copiar texto</button></details></div>
      <div class="r6-acoes">${tel ? `<a class="acao" href="https://wa.me/55${esc(tel)}?text=${encodeURIComponent(it.script)}" target="_blank" rel="noopener">🟢 WhatsApp</a>` : ''}<button type="button" class="acao" data-h6="contato" data-id="${esc(l.id)}">📞 Registrar</button><button type="button" class="acao" data-h6="adiar" data-id="${esc(l.id)}">⏰ Adiar</button><button type="button" class="acao" data-h6="abrir" data-id="${esc(l.id)}">Abrir</button>${linksHoje6(it)}</div></article>`;
  }).join('') : '<p class="vazio-curto"><strong>Fila zerada. 🏁</strong><br>Nada urgente agora. Os retornos combinados aparecem aqui quando vencerem.</p>';
}
function linksHoje6(it) {
  const s = it.sinais || {}, l = it.lead, tel = U.telE164(l.telefone) || '', out = [];
  if (s.patio) out.push('<a class="acao" href="' + esc(A6.urlApp('patio', '/?os=' + s.patio.id) || '#') + '">🔧 Pátio</a>');
  if (s.orcamento) out.push('<a class="acao" href="' + esc(A6.urlApp('orcador', '/#/historico/' + s.orcamento.id) || '#') + '">🧾 Orçamento</a>');
  if (it.principal === 'esperando' && tel) out.push('<a class="acao" href="' + esc(A6.urlApp('atendimento', '/?tel=' + tel) || '#') + '">💬 Conversa</a>');
  if (it.principal === 'orcamento_aprovado' && tel) out.push('<a class="acao" href="' + esc(A6.urlApp('agenda', '/?tel=' + tel) || '#') + '">📅 Agendar</a>');
  return out.join('');
}
document.addEventListener('keydown', e => {
  if (!$('#view-hoje')?.classList.contains('active') || $('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase(); if (!['j', 'k', 'c', 'a'].includes(k) && e.key !== 'Enter') return;
  const linhas = $$('#hojeLista .r6-linha'); if (!linhas.length) return;
  let i = linhas.findIndex(x => x === document.activeElement || x.contains(document.activeElement));
  if (k === 'j' || k === 'k') { e.preventDefault(); i = Math.max(0, Math.min(linhas.length - 1, i + (k === 'j' ? 1 : -1))); linhas[i].tabIndex = 0; linhas[i].focus(); linhas[i].scrollIntoView({ block: 'nearest' }); return; }
  if (i < 0) return;
  const id = linhas[i].dataset.lead;
  if (e.key === 'Enter' && e.target === linhas[i]) { e.preventDefault(); abrirModal(id); }
  if (k === 'c') { e.preventDefault(); registrarContato6(id).then(carregarHoje6); }
  if (k === 'a') { e.preventDefault(); adiar6(id).then(carregarHoje6); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-h6]'); if (!b) return;
  if (b.dataset.h6 === 'motivo') { H6.motivo = b.dataset.k || ''; renderHoje6(); return; }
  const id = b.dataset.id, a = b.dataset.h6;
  if (a === 'abrir') abrirModal(id);
  if (a === 'contato') { await registrarContato6(id); carregarHoje6(); }
  if (a === 'adiar') { await adiar6(id); carregarHoje6(); }
  if (a === 'copiar') { navigator.clipboard.writeText(b.dataset.txt).then(() => toast('Texto copiado'), () => toast('Não consegui copiar.')); }
  if (a === 'concluir') {
    const x = (H6.entregues?.itens || []).find(i => i.lead.id === id), l = leadPorId6(id); if (!l) return;
    l._sugestoes = { orcamento: x?.orcamento?.total || 0, agendamento: 0 };
    if (x?.sugestoes?.length) l.valor_orcado = Number(l.valor_orcado) > 0 ? l.valor_orcado : x.sugestoes[0].valor;
    await moverEtapa(id, 'concluido'); carregarHoje6(); carregarSinais6(true);
  }
});
$('#fRespFunil')?.addEventListener('change', () => setTimeout(renderFiltroSinal6, 0));
document.addEventListener('indycar:aba', e => {
  if (e.detail.aba === 'hoje') carregarHoje6();
  if (e.detail.aba === 'dono') carregarDono6();
  if (e.detail.aba === 'pipeline') carregarSinais6();
  if (e.detail.aba === 'origem') carregarRoiOrigem6();
});

/* ================= aba Dono ================= */
const D6 = { dados: null };
async function carregarDono6() {
  if (!SOU_GESTOR) return;
  const el = $('#donoCorpo'); el.innerHTML = '<div class="skeleton" aria-label="Montando o resumo"></div>';
  try { D6.dados = await api6('/api/dono'); renderDono6(); } catch (e) { el.innerHTML = `<p class="vazio-curto">Não consegui montar o resumo agora: ${esc(e.message)} <button type="button" class="link-btn" data-h6c="recarregar-dono">Tentar de novo</button></p>`; }
}
const delta6 = (a, b) => { if (!b) return a ? '<span class="r6-up">novo</span>' : ''; const p = Math.round((a - b) / b * 100); return p === 0 ? '' : `<span class="${p > 0 ? 'r6-up' : 'r6-down'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`; };
function renderDono6() {
  const d = D6.dados, m = d.mes, r = m.ritmo || {};
  const kpi = (t, v, sub, alerta) => `<div class="ficha-kpi${alerta ? ' alerta' : ''}"><span>${t}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const meta = m.meta_loja?.faturamento ? `<div class="r6-meta"><div class="r6-meta-barra"><div style="width:${Math.min(100, r.pct || 0)}%"></div></div><p>${brl(r.realizado)} de ${brl(r.meta)} (${r.pct ?? 0}%) · projeção do mês ${brl(r.projecao)} · faltam ${brl(r.falta)} em ${r.dias_uteis_restantes} dias úteis</p></div>` : '<p class="muted">Sem meta de faturamento da loja neste mês. Defina em Equipe e metas.</p>';
  $('#donoCorpo').innerHTML = `${meta}
    <div class="ficha-kpis">${kpi('Leads (7 dias)', `${d.semana.leads} ${delta6(d.semana.leads, d.anterior.leads)}`)}${kpi('Vendas (7 dias)', `${d.semana.vendas} ${delta6(d.semana.vendas, d.anterior.vendas)}`)}${kpi('Faturado (7 dias)', `${brl(d.semana.faturamento)} ${delta6(d.semana.faturamento, d.anterior.faturamento)}`)}${kpi('Conversão', d.semana.conversao + '%')}
      ${kpi('Em aberto', brl(d.abertos.valor), d.abertos.total + ' leads')}${kpi('Carros no pátio', d.patio.no_patio, `${d.patio.prontos} pronto${d.patio.prontos === 1 ? '' : 's'}`)}${kpi('Entregues sem concluir', d.patio.entregues_sem_fechar, '', d.patio.entregues_sem_fechar > 0)}${kpi('Esperando resposta', d.conversas.esperando, d.conversas.maior_espera_h ? 'maior espera ' + d.conversas.maior_espera_h + ' h' : '', d.conversas.esperando > 0)}
      ${kpi('Orçamentos parados', d.orcamentos.parados, brl(d.orcamentos.valor_parado), d.orcamentos.parados > 0)}${kpi('Aprovados sem horário', d.orcamentos.aprovados_sem_horario, '', d.orcamentos.aprovados_sem_horario > 0)}${kpi('Faltas na agenda (30 d)', d.agenda.no_show_pct + '%')}${kpi('Nota média (30 d)', d.avaliacoes ? d.avaliacoes.media + ' ⭐' : '—', d.avaliacoes ? d.avaliacoes.total + ' avaliações' : '')}</div>
    ${d.insights.length ? `<div class="ficha-bloco"><h4>O que pede atenção</h4><ul class="r6-insights">${d.insights.map(i => `<li class="${esc(i.nivel || '')}">${esc(i.texto)}</li>`).join('')}</ul></div>` : ''}
    <div class="ficha-bloco"><h4>Anúncios no mês</h4><p>Gasto ${brl(d.ads.gasto_mes)} · ${d.ads.leads} leads · ${d.ads.ganhos} vendas · faturado ${brl(d.ads.faturamento)}${d.ads.roas != null ? ` · retorno ${d.ads.roas}x` : ''}${d.ads.alertas ? ` · <b class="parado-txt">${d.ads.alertas} alerta(s) do Ads</b>` : ''}</p></div>
    ${d.vendedores.length ? `<div class="ficha-bloco"><h4>Quem vendeu no mês</h4><ul class="f360-lista">${d.vendedores.map(v => `<li>${esc(v.nome)} · ${v.vendas} venda${v.vendas === 1 ? '' : 's'} · ${brl(v.faturamento)}</li>`).join('')}</ul></div>` : ''}
    ${d.perdas.length ? `<div class="ficha-bloco"><h4>Por que perdemos (30 dias)</h4><ul class="f360-lista">${d.perdas.map(p => `<li>${esc(p.motivo)} · ${p.qtd}</li>`).join('')}</ul></div>` : ''}
    <div class="ficha-bloco"><h4>Resumo para o WhatsApp do dono</h4><pre class="r6-pre" id="donoTexto">${esc(d.texto_whatsapp)}</pre><button type="button" class="btn btn-ghost sm" id="donoCopiar">Copiar resumo</button></div>
    <div class="ficha-bloco"><h4>Qualidade dos dados</h4><div id="donoQualidade"><button type="button" class="link-btn" id="donoQualBtn">Ver o que está faltando nos leads</button></div></div>`;
  $('#donoCopiar').onclick = () => navigator.clipboard.writeText(d.texto_whatsapp).then(() => toast('Resumo copiado'), () => toast('Não consegui copiar.'));
  $('#donoQualBtn').onclick = carregarQualidade6;
}
async function carregarQualidade6() {
  const el = $('#donoQualidade'); el.innerHTML = '<div class="skeleton"></div>';
  try {
    const q = await api6('/api/qualidade');
    const linha = (t, o, filtro) => o.total ? `<li><b>${o.total}</b> ${t}${o.exemplos?.length ? ` <button type="button" class="link-btn" data-q6="${filtro}">ver</button>` : ''}</li>` : '';
    el.innerHTML = `<ul class="f360-lista">${[linha('telefones repetidos em leads abertos', { total: q.duplicados.total, exemplos: q.duplicados.grupos }, 'duplicados'), linha('sem telefone válido', q.sem_telefone_valido, 'sem_telefone_valido'), linha('do Ads sem campanha (utm)', q.ads_sem_campanha, 'ads_sem_campanha'), linha('orçamento/agendado sem valor', q.orcamento_sem_valor, 'orcamento_sem_valor'), linha('sem carro nem placa', q.sem_carro, 'sem_carro'), linha('sem responsável', q.sem_responsavel, 'sem_responsavel'), linha('parados há mais de 60 dias', q.velhos, 'velhos'), linha('concluídos sem valor pago', q.concluidos_sem_valor, 'concluidos_sem_valor')].join('') || '<li>Tudo em ordem. 🏁</li>'}</ul>`;
    el.onclick = ev => { const b = ev.target.closest('[data-q6]'); if (!b) return; const k = b.dataset.q6; const lista = k === 'duplicados' ? q.duplicados.grupos.flatMap(g => g.leads) : q[k].exemplos; const x = lista[0]; if (x) abrirModal(x.id); };
  } catch (e) { el.innerHTML = `<p class="vazio-curto">${esc(e.message)}</p>`; }
}

/* ================= ROI por campanha (aba Origem, gestor) ================= */
async function carregarRoiOrigem6() {
  if (!SOU_GESTOR) return;
  let card = $('#r6Roi');
  if (!card) { card = document.createElement('div'); card.className = 'card'; card.id = 'r6Roi'; $('#view-origem').prepend(card); }
  card.innerHTML = '<h3>Retorno por campanha (mês)</h3><div class="skeleton"></div>';
  try {
    const r = await api6('/api/roi/campanhas');
    const ver = { lucra: '<span class="r6-up">dá lucro</span>', prejuizo: '<span class="r6-down">gasta mais do que traz</span>', sem_venda: '<span class="r6-down">sem venda</span>', sem_lead: '<span class="muted">sem lead</span>', sem_gasto: '<span class="muted">sem gasto</span>' };
    card.innerHTML = `<h3>Retorno por campanha (${esc(r.de)} a ${esc(r.ate)})</h3><p class="card-sub">Gasto do Ads cruzado com os leads que chegaram por cada campanha (utm). ${r.so_demonstracao ? '<b class="parado-txt">Os números do Ads ainda são de demonstração.</b>' : ''}</p>
      ${r.campanhas.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Campanha</th><th class="num">Gasto</th><th class="num">Leads</th><th class="num">Custo/lead</th><th class="num">Vendas</th><th class="num">Faturado</th><th class="num">Retorno</th><th></th></tr></thead><tbody>${r.campanhas.map(c => `<tr class="sem-clique"><td><div class="cell-main">${esc(c.campanha)}</div><div class="cell-sub">${esc(c.plataforma)}</div></td><td class="num">${brl(c.gasto)}</td><td class="num">${c.leads}</td><td class="num">${c.cpl != null ? brl(c.cpl) : '—'}</td><td class="num">${c.ganhos}</td><td class="num">${brl(c.faturamento)}</td><td class="num">${c.roas != null ? c.roas + 'x' : '—'}</td><td>${ver[c.veredito] || ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio-curto">Sem gasto do Ads neste período.</p>'}
      ${r.leads_do_ads_sem_campanha ? `<p class="muted mini-nota">${r.leads_do_ads_sem_campanha} lead(s) do Meta/Google chegaram sem campanha (utm): não dá para ligar ao gasto.</p>` : ''}
      ${r.sem_campanha_no_ads.length ? `<p class="muted mini-nota">Campanhas dos leads que não aparecem no Ads: ${esc(r.sem_campanha_no_ads.slice(0, 5).map(x => `${x.campanha} (${x.leads})`).join(', '))}.</p>` : ''}
      ${r.alertas.length ? `<ul class="f360-lista">${r.alertas.map(a => `<li>⚠️ ${esc(a.mensagem)}</li>`).join('')}</ul>` : ''}`;
  } catch (e) { card.innerHTML = `<h3>Retorno por campanha</h3><p class="vazio-curto">Não consegui carregar: ${esc(e.message)}</p>`; }
}

/* ================= ficha 360 do cliente: segmento, nota, linha do tempo ================= */
const _renderFicha360R6 = renderFicha360;
renderFicha360 = function (f, opcoes = {}) {
  _renderFicha360R6(f, opcoes);
  const alvo = $('#fichaCliente'); if (!alvo || !f.segmento) return;
  const s = f.segmento, topo = $('.ficha-topo .lf-tags', alvo);
  if (topo) topo.insertAdjacentHTML('beforeend', `<span class="tag r6-seg r6-seg-${esc(s.codigo)}" title="Calculado pelo histórico: gasto, serviços e última visita">${esc(s.rotulo)}</span>${f.nota ? `<span class="tag" title="Média das avaliações do Pátio">⭐ ${f.nota.media} (${f.nota.total})</span>` : ''}${s.revisao_vencida ? '<span class="tag parado-txt">revisão vencida</span>' : ''}`);
  const L = f.links || {};
  const acoes = $('.lf-acoes', alvo);
  if (acoes && L.novoOrcamento === undefined && f.cliente) {
    const p = new URLSearchParams(); if (f.cliente.id) p.set('cliente', f.cliente.id); const t = U.telE164(f.cliente.telefone); if (t) p.set('tel', t); p.set('nome', f.cliente.nome || '');
    acoes.insertAdjacentHTML('beforeend', `<a class="acao" href="${esc(A6.urlApp('orcador', '/?' + p.toString()))}"><span aria-hidden="true">🧾</span>Novo orçamento</a>`);
  }
  if ((f.linha_do_tempo || []).length) {
    const ico = { lead: '🎯', agenda: '📅', patio: '🔧', orcamento: '🧾', comunicar: '✉️', mensagem: '💬', indicacao: '🤝', avaliacao: '⭐' };
    const bloco = document.createElement('div'); bloco.className = 'ficha-bloco';
    bloco.innerHTML = `<h4>Linha do tempo do cliente</h4><ol class="linha-tempo r6-tl">${f.linha_do_tempo.slice(0, 25).map(i => `<li class="tl-${esc(i.tipo)}"><span class="tl-ico" aria-hidden="true">${ico[i.tipo] || '•'}</span><div><div class="tl-topo"><strong>${esc(i.titulo)}</strong><time datetime="${esc(i.quando)}">${esc(quando6(i.quando))}</time></div>${i.detalhe ? `<p>${esc(i.detalhe)}</p>` : ''}</div></li>`).join('')}</ol>`;
  const ref = $('#preferenciasCliente', alvo); if (ref) alvo.insertBefore(bloco, ref); else alvo.append(bloco); }
  // avaliações do Pátio com comentário
  if ((f.avaliacoes || []).some(a => a.comentario)) alvo.querySelector('.r6-tl')?.closest('.ficha-bloco')?.insertAdjacentHTML('beforebegin', `<div class="ficha-bloco"><h4>O que o cliente disse</h4><ul class="f360-lista">${f.avaliacoes.filter(a => a.comentario).slice(0, 3).map(a => `<li>${'⭐'.repeat(Math.max(1, Math.min(5, a.nota)))} ${esc(a.comentario)}</li>`).join('')}</ul></div>`);
};

/* ================= ciclo: carrega e atualiza sozinho ================= */
setInterval(() => { if (document.visibilityState === 'visible' && PERFIL?.id && ($('#view-pipeline')?.classList.contains('active') || $('#view-hoje')?.classList.contains('active'))) { carregarSinais6(); if ($('#view-hoje')?.classList.contains('active') && !$('dialog[open]')) carregarHoje6(); } }, 45000);
(function esperarPerfil6() {
  let t = 0; const iv = setInterval(() => {
    if (PERFIL?.id) {
      clearInterval(iv); const dono = $('.nav-item[data-view="dono"]'); if (dono) dono.hidden = !SOU_GESTOR; carregarSinais6();
    } else if (++t > 120) clearInterval(iv);
  }, 500);
})();
$('#hojeAtualizar')?.addEventListener('click', carregarHoje6);
$('#donoAtualizar')?.addEventListener('click', carregarDono6);
