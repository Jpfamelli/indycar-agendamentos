// Rodada 7 (25/10/2026, C3): o funil que se mexe sozinho, a ficha do lead com tudo pronto, retornos, perdas,
// indicações, origens com o Ads, qualidade dos dados e o resumo do dono para copiar.
// Carrega depois de rodada6c.js; usa o escopo global (api, TODOS, PERFIL, SOU_GESTOR, toast, abrirDlg, ...).
'use strict';

const R7 = { ger: 0, painel: new Map(), mov: null, movEm: 0, movCarregando: false, ret: null, retAba: 'atrasados', retEscopo: '', hoje: { q: '', origem: '' }, resumoTipo: 'manha', dono: {} };
const api7 = (url, opts) => api(url, opts, false, { tentativas: 1 });
const post7 = (url, corpo) => api7(url, { method: 'POST', body: JSON.stringify(corpo || {}) });
const ETAPAS7 = { novo: 'Novo', contato: 'Em contato', orcamento: 'Orçamento', agendado: 'Agendado', em_servico: 'Em serviço', concluido: 'Concluído', perdido: 'Perdido' };
const PRESETS7 = [['2h', 'Daqui a 2 horas'], ['hoje', 'Hoje, fim da tarde'], ['amanha', 'Amanhã cedo'], ['3d', 'Em 3 dias úteis'], ['1sem', 'Em 1 semana'], ['2sem', 'Em 2 semanas']];
const quando7 = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const dia7 = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const lead7 = id => TODOS.find(x => String(x.id) === String(id));
const copiar7 = (txt, ok = 'Texto copiado') => navigator.clipboard.writeText(txt).then(() => toast(ok), () => toast('Não consegui copiar.'));
const n7 = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const erro7 = (el, e, ack) => { el.innerHTML = `<p class="vazio-curto">Não consegui carregar agora: ${esc(e.message || e)} ${ack ? `<button type="button" class="link-btn" data-r7="${esc(ack)}">Tentar de novo</button>` : ''}</p>`; };
const pct7 = v => v == null ? '—' : v + '%';

/* ================= ficha do lead: saúde, atalhos com tudo preenchido, o que aconteceu sozinho ================= */
function r7Garantir() {
  let p = $('#r7Painel');
  if (!p) { p = document.createElement('div'); p.id = 'r7Painel'; p.className = 'r7-painel'; $('#painelTl').prepend(p); p.addEventListener('click', onClickPainel7); }
  return p;
}
function onClickPainel7(e) {
  const al = e.target.closest('a[href]');
  if (al && /^https?:/i.test(al.getAttribute('href') || '') && !al.target) { e.preventDefault(); abrirSeguro6(al.href); return; }
  const b = e.target.closest('[data-r7p]'); if (!b) return;
  const l = lead7(LEAD_ABERTO); if (!l) return;
  const a = b.dataset.r7p;
  if (a === 'mov') aplicarUm7(l, b.dataset.para);
  if (a === 'mov-etapa') moverEtapa(l.id, b.dataset.para).then(() => { R7.painel.delete(l.id); r7Carregar(l, true); carregarSinais6(true); });
  if (a === 'recarregar') r7Carregar(l, true);
}
async function aplicarUm7(l, para) {
  try {
    const r = await post7('/api/funil/movimentos/aplicar', { itens: [{ id: l.id, para }] });
    if (!r.aplicados.length) { toast('⚠️ ' + (r.pulados[0]?.motivo === 'mudou' ? 'A situação já mudou. Atualizei.' : 'Não consegui mover agora.'), 5000); }
    else { substituirLocal({ id: l.id, status: para }); redesenhar(); toastAcao(`🤖 ${l.nome}: ${ETAPAS7[r.aplicados[0].de]} → ${ETAPAS7[para]}`, 'Desfazer', () => desfazer7(r.aplicados), 9000); }
  } catch (e) { toast('⚠️ ' + e.message, 6000); }
  R7.painel.delete(l.id); r7Carregar(l, true); carregarSinais6(true); r7CarregarMov(true);
}
async function desfazer7(aplicados) {
  const r = await post7('/api/funil/movimentos/desfazer', { itens: aplicados.map(a => ({ id: a.id, de: a.de, para: a.para })) });
  for (const id of r.ids) { const a = aplicados.find(x => x.id === id); if (a) substituirLocal({ id, status: a.de }); }
  redesenhar(); carregarSinais6(true); r7CarregarMov(true);
  toast(r.voltaram ? `Desfeito: ${n7(r.voltaram, 'contato voltou', 'contatos voltaram')}.` : 'Nada para desfazer: a situação já mudou.');
}
function saudeHtml7(s) {
  if (!s) return '';
  return `<span class="r7-saude r7-${esc(s.nivel)}" tabindex="0" role="note" aria-label="Contato ${esc(s.rotulo)}, nota ${s.valor} de 100">🌡 ${esc(s.rotulo)} <b>${s.valor}</b><span class="r7-dica" role="tooltip">${(s.motivos || []).map(m => `<span>${m.pontos > 0 ? '＋' : '−'}${Math.abs(m.pontos)} ${esc(m.texto)}</span>`).join('') || 'Sem sinais ainda'}</span></span>`;
}
function r7Pintar(l, d, falha) {
  const p = r7Garantir();
  if (!d) { p.innerHTML = falha ? `<div class="r7-bloco muted">Não consegui montar o painel do contato agora. <button type="button" class="link-btn" data-r7p="recarregar">Tentar de novo</button></div>` : '<div class="r7-bloco muted" aria-busy="true">Montando o painel do contato…</div>'; return; }
  const t = d.tempo || {}, linhas = [];
  linhas.push(`<div class="r7-topo">${saudeHtml7(d.saude)}<span class="r7-tempo">No funil há ${t.dias ?? '—'} dia${t.dias === 1 ? '' : 's'} · ${n7(t.contatos || 0, 'contato', 'contatos')}${t.primeiro_contato_h != null ? ` · 1º contato em ${t.primeiro_contato_h} h` : ''}</span></div>`);
  const dicas = [];
  if (d.melhor_horario) dicas.push(`🕑 Costuma atender ${esc(d.melhor_horario.rotulo)} (${d.melhor_horario.vezes} de ${d.melhor_horario.de})`);
  if (d.canal) dicas.push(`💬 ${esc(d.canal.rotulo)}`);
  if (dicas.length) linhas.push(`<div class="r7-dicas-linha">${dicas.join(' · ')}</div>`);
  const mv = d.movimento;
  if (mv) {
    const aplicavel = mv.aplicavel && mv.pode_editar;
    const botao = !aplicavel ? '' : (['concluido', 'perdido'].includes(mv.para) ? `<button type="button" class="btn btn-primary sm" data-r7p="mov-etapa" data-para="${esc(mv.para)}">${mv.para === 'concluido' ? 'Concluir…' : 'Marcar como perdido…'}</button>` : `<button type="button" class="btn btn-primary sm" data-r7p="mov" data-para="${esc(mv.para)}">Mover para ${esc(ETAPAS7[mv.para])}</button>`);
    linhas.push(`<div class="r7-mov"><b>🤖 ${esc(mv.titulo)}.</b> ${esc(mv.motivo)} ${botao}${mv.link ? ` <a class="acao" href="${esc(mv.link)}">${mv.codigo === 'em_servico_sem_ordem' ? '🚗 Abrir entrada' : 'Ver lá'}</a>` : ''}</div>`);
  }
  const A = d.atalhos || {}, bt = [];
  if (A.novo_orcamento) bt.push(`<a class="acao acao-forte" data-r7a="orcamento" href="${esc(A.novo_orcamento.href)}" title="${esc(A.novo_orcamento.motivo)}">🧾 Criar orçamento (tudo preenchido)</a>`);
  if (A.entrada_patio) bt.push(`<a class="acao acao-forte" data-r7a="entrada" href="${esc(A.entrada_patio.href)}" title="${esc(A.entrada_patio.motivo)}">🚗 Abrir entrada no Pátio</a>`);
  if (A.ordem_aberta?.href) bt.push(`<a class="acao" href="${esc(A.ordem_aberta.href)}">🔧 Ordem nº ${esc(A.ordem_aberta.numero ?? '')} no Pátio</a>`);
  if (bt.length) linhas.push(`<div class="r6-links">${bt.join('')}</div>${A.entrada_patio ? `<p class="r7-nota">${esc(A.entrada_patio.motivo)}</p>` : ''}`);
  if ((d.automaticos || []).length) linhas.push(`<details class="r7-auto"><summary>⚙ O que aconteceu sozinho (${d.automaticos.length})</summary><ol>${d.automaticos.map(a => `<li><time datetime="${esc(a.quando)}">${esc(quando7(a.quando))}</time> ${esc(a.texto)}</li>`).join('')}</ol></details>`);
  p.innerHTML = linhas.map(x => `<div class="r7-bloco">${x}</div>`).join('');
}
async function r7Carregar(l, forcar) {
  const ger = ++R7.ger, c = R7.painel.get(l.id);
  if (c && !forcar && Date.now() - c.em < 20000) { r7Pintar(l, c.dados); return; }
  r7Pintar(l, c?.dados || null);
  try {
    const d = await api7(`/api/leads/${encodeURIComponent(l.id)}/painel`);
    R7.painel.set(l.id, { dados: d, em: Date.now() });
    if (ger === R7.ger && String(LEAD_ABERTO) === String(l.id)) r7Pintar(lead7(l.id) || l, d);
  } catch (e) { if (ger === R7.ger && String(LEAD_ABERTO) === String(l.id)) r7Pintar(l, null, e.message); }
}
const _renderFichaLeadR7 = renderFichaLead;
renderFichaLead = function (l) {
  _renderFichaLeadR7(l);
  if (!l || !l.id) return;
  r7Garantir(); r7Carregar(l);
};
/* o histórico mostra o rastro dos outros sistemas como "automático" */
const _r6DesenharHistR7 = r6DesenharHist;
r6DesenharHist = function (itens) {
  _r6DesenharHistR7(itens);
  $$('#r6Hist li').forEach((li, i) => { if (itens[i]?.tipo === 'sistema') { li.classList.add('r7-sis'); const t = $('.tag', li); if (t) t.textContent = 'automático'; } });
};

/* atalhos no cartão do funil: E abre a entrada no Pátio, B cria o orçamento */
$('#kanban').addEventListener('keydown', async e => {
  const c = e.target.closest('.kb-card'); if (!c || e.target !== c || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const k = e.key.toLowerCase(); if (k !== 'e' && k !== 'b') return;
  e.preventDefault(); e.stopPropagation();
  try {
    const d = (R7.painel.get(c.dataset.id)?.dados) || await api7(`/api/leads/${encodeURIComponent(c.dataset.id)}/painel`);
    R7.painel.set(c.dataset.id, { dados: d, em: Date.now() });
    const alvo = k === 'e' ? d.atalhos.entrada_patio : d.atalhos.novo_orcamento;
    if (!alvo) { toast(k === 'e' ? 'Sem motivo para abrir a entrada: falta horário ou orçamento aprovado.' : 'Esse contato não aceita novo orçamento.'); return; }
    abrirNomeada6(alvo.href, k === 'e' ? 'patio' : 'orcador');
  } catch (er) { toast('⚠️ ' + er.message); }
});

/* ================= funil que se mexe: revisão dos movimentos sugeridos ================= */
async function r7CarregarMov(forcar) {
  if (R7.movCarregando || !PERFIL?.id) return;
  if (!forcar && Date.now() - R7.movEm < 30000) return;
  R7.movCarregando = true;
  try { R7.mov = await api7('/api/funil/movimentos' + (forcar ? '?agora=1' : '')); R7.movEm = Date.now(); r7PintarFaixaMov(); } catch (e) { console.warn('[r7] movimentos:', e.message); }
  finally { R7.movCarregando = false; }
}
function r7PintarFaixaMov() {
  const alvo = $('#view-pipeline'); if (!alvo) return;
  let f = $('#r7Mov');
  if (!f) { f = document.createElement('div'); f.id = 'r7Mov'; f.className = 'r7-faixa'; const k = $('#kanban'); k.parentNode.insertBefore(f, k); f.addEventListener('click', e => { if (e.target.closest('[data-r7="rever-mov"]')) abrirMov7(); }); }
  const m = R7.mov; const n = m ? m.aplicaveis : 0, r = m ? m.para_revisar : 0;
  f.hidden = !(n || r);
  f.innerHTML = (n || r) ? `<span>🤖 <b>O funil achou ${n7(n, 'movimento', 'movimentos')}</b> pelo que aconteceu no Pátio, no Orçador e na Agenda${r ? ` · ${r} para revisar` : ''}.</span><button type="button" class="btn btn-primary sm" data-r7="rever-mov">Revisar</button>` : '';
}
function montarDlgMov7() {
  if ($('#dlgMov7')) return;
  document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg dlg-largo" id="dlgMov7" aria-labelledby="dlgMov7T"><form method="dialog" id="formMov7">
    <h2 id="dlgMov7T">O que o funil sugere mover</h2>
    <p class="muted">Só vale o que ainda é verdade na hora de aplicar. Dá para desfazer logo depois.</p>
    <div class="table-wrap r7-lista"><table class="table" id="tblMov7"></table></div>
    <p class="form-erro" id="mov7Erro" role="alert"></p>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Fechar</button><div class="spacer"></div><button type="submit" class="btn btn-primary" id="mov7Ok">Aplicar os marcados</button></div></form></dialog>`);
  $('#dlgMov7').addEventListener('click', e => { if (e.target === $('#dlgMov7')) $('#dlgMov7').close(); });
  $('#tblMov7').addEventListener('change', e => {
    const tr = e.target.closest('tr[data-mv]');
    if (e.target.matches('.mv-motivo')) tr.querySelector('.mv-outro').hidden = e.target.value !== 'outro';
    if (e.target.matches('.mv-pendente')) tr.querySelector('.mv-valor').disabled = e.target.checked;
  });
  $('#formMov7').addEventListener('submit', async e => {
    e.preventDefault();
    const itens = [];
    for (const tr of $$('#tblMov7 tr[data-mv]')) {
      if (!tr.querySelector('.mv-ck')?.checked) continue;
      const it = { id: tr.dataset.mv, para: tr.dataset.para };
      if (tr.dataset.para === 'concluido') {
        const v = Number(tr.querySelector('.mv-valor').value);
        it.valor_pendente = tr.querySelector('.mv-pendente').checked;
        if (!it.valor_pendente && !(v > 0)) { $('#mov7Erro').textContent = 'Informe o valor pago ou marque “Não sei agora”.'; return; }
        if (!it.valor_pendente) it.valor_pago = v;
      }
      if (tr.dataset.para === 'perdido') {
        it.motivo_perda = tr.querySelector('.mv-motivo').value;
        it.motivo_perda_obs = tr.querySelector('.mv-outro').value.trim();
        if (!U.camposPerda('', it.motivo_perda, it.motivo_perda_obs)) { $('#mov7Erro').textContent = 'Escreva o motivo de cada contato marcado como “Outro”.'; return; }
      }
      itens.push(it);
    }
    if (!itens.length) { $('#mov7Erro').textContent = 'Marque pelo menos um.'; return; }
    const b = $('#mov7Ok'); b.disabled = true; b.textContent = 'Aplicando…'; $('#mov7Erro').textContent = '';
    try {
      const r = await post7('/api/funil/movimentos/aplicar', { itens });
      for (const a of r.aplicados) substituirLocal({ id: a.id, status: a.para });
      redesenhar(); carregarSinais6(true); await r7CarregarMov(true);
      const pul = r.pulados.length ? ` · ${r.pulados.length} pulado${r.pulados.length === 1 ? '' : 's'} (a situação mudou ou é de colega)` : '';
      if (r.aplicados.length) toastAcao(`🤖 ${n7(r.aplicados.length, 'contato movido', 'contatos movidos')}${pul}`, 'Desfazer', () => desfazer7(r.aplicados), 10000); else toast('Nada foi movido' + pul, 6000);
      renderMov7();
    } catch (er) { $('#mov7Erro').textContent = er.message; }
    finally { b.disabled = false; b.textContent = 'Aplicar os marcados'; }
  });
}
function renderMov7() {
  const m = R7.mov, itens = m?.itens || [];
  const ap = itens.filter(i => i.aplicavel && i.pode_editar), rev = itens.filter(i => !i.aplicavel);
  $('#mov7Ok').disabled = !ap.length;
  const linha = i => {
    const pode = i.aplicavel && i.pode_editar;
    const motivoSugerido = Object.values(U.MOTIVOS_R8).includes(i.motivo_perda) ? i.motivo_perda : 'Outro';
    const extra = i.para === 'concluido' ? `<input type="number" class="mv-valor" min="0.01" step="0.01" inputmode="decimal" placeholder="Valor pago (R$)" aria-label="Valor pago por ${esc(i.nome)}"><label><input type="checkbox" class="mv-pendente"> Não sei agora</label>`
      : i.para === 'perdido' ? `<select class="mv-motivo" aria-label="Motivo da perda de ${esc(i.nome)}">${Object.entries(U.MOTIVOS_R8).map(([codigo, rotulo]) => `<option value="${codigo}"${rotulo === motivoSugerido ? ' selected' : ''}>${esc(rotulo)}</option>`).join('')}</select><input type="text" class="mv-outro" maxlength="140" aria-label="Outro motivo de ${esc(i.nome)}"${motivoSugerido === 'Outro' ? '' : ' hidden'}>` : '';
    return `<tr data-mv="${esc(i.lead_id)}" data-para="${esc(i.para || '')}"><td>${pode ? `<input type="checkbox" class="mv-ck" aria-label="Aplicar em ${esc(i.nome)}"${i.para === 'concluido' ? '' : ' checked'}>` : ''}</td>
      <td><div class="cell-main"><a href="#" data-mv-abrir="${esc(i.lead_id)}">${esc(i.nome)}</a></div><div class="cell-sub">${esc(i.titulo)}. ${esc(i.motivo)}</div>${extra ? `<div class="mv-extra">${extra}</div>` : ''}</td>
      <td class="mv-etapas">${i.para ? `<span class="badge b-${esc(i.de)}">${esc(ETAPAS7[i.de])}</span> → <span class="badge b-${esc(i.para)}">${esc(ETAPAS7[i.para])}</span>` : `<span class="badge b-${esc(i.de)}">${esc(ETAPAS7[i.de])}</span>`}</td>
      <td>${i.link ? `<a class="acao" href="${esc(i.link)}">${i.codigo === 'em_servico_sem_ordem' ? '🚗 Entrada' : 'Ver lá'}</a>` : ''}${!i.pode_editar ? ' <span class="tag">🔒 colega</span>' : ''}</td></tr>`;
  };
  $('#tblMov7').innerHTML = itens.length ? `<thead><tr><th></th><th>Contato</th><th>Etapa</th><th></th></tr></thead><tbody>${ap.map(linha).join('')}${rev.length ? `<tr class="r7-sep"><td colspan="4"><b>Para revisar</b> (o funil não decide sozinho)</td></tr>${rev.map(linha).join('')}` : ''}</tbody>`
    : '<tbody><tr><td class="vazio-celula"><strong>Funil em dia. 🏁</strong><br>Nada para mover agora.</td></tr></tbody>';
}
async function abrirMov7() {
  montarDlgMov7(); const dlg = $('#dlgMov7');
  $('#mov7Erro').textContent = ''; $('#tblMov7').innerHTML = '<tbody><tr><td><div class="skeleton" aria-label="Carregando"></div></td></tr></tbody>';
  if (!dlg.open) abrirDlg(dlg);
  await r7CarregarMov(true); renderMov7();
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-mv-abrir]'); if (a) { e.preventDefault(); $('#dlgMov7').close(); abrirModal(a.dataset.mvAbrir); }
  const b = e.target.closest('[data-r7="rever-mov"]'); if (b && !b.closest('#r7Mov')) abrirMov7();
});

/* ================= aba Hoje: meta do dia, busca, próximo da fila e retornos ================= */
let pedidoHoje = 0;
async function carregarHoje7() {
  const el = $('#hojeLista'); if (!el) return;
  const pedido = ++pedidoHoje;
  el.setAttribute('aria-busy', 'true');
  if ($('#r7Proximo')) $('#r7Proximo').disabled = true;
  // R17: com a fila já na tela (recarga dos 45 s ou depois de registrar), não troca a lista pelo esqueleto: a página não pula
  if (!H6.dados) el.innerHTML = '<div class="skeleton" aria-label="Montando a fila"></div>';
  const qs = new URLSearchParams(); if (H6.escopo) qs.set('escopo', H6.escopo); if (R7.hoje.q) qs.set('q', R7.hoje.q); if (R7.hoje.origem) qs.set('origem', R7.hoje.origem);
  try {
    const [d, e] = await Promise.all([api6('/api/fila-do-dia' + (qs.toString() ? '?' + qs : '')), api6('/api/entregues-sem-fechar')]);
    if (pedido !== pedidoHoje) return;
    H6.dados = d; H6.entregues = e; renderHoje6(); r7BarraHoje(d);
  } catch (err) {
    if (pedido !== pedidoHoje) return;
    H6.dados = null;
    H6.entregues = null;
    $('#hojeResumo').replaceChildren();
    $('#hojeEntregues').replaceChildren();
    if ($('#r7MetaDia')) $('#r7MetaDia').hidden = true;
    el.innerHTML = `<p class="vazio-curto"><span role="alert">Não consegui montar a fila agora: ${esc(err.message)}</span> <button type="button" class="link-btn" data-h6c="recarregar">Tentar de novo</button></p>`;
  } finally {
    if (pedido === pedidoHoje) el.setAttribute('aria-busy', 'false');
  }
}
carregarHoje6 = carregarHoje7;
textoMotivo6.indicacao_nova = 'Indicação nova';
function r7BarraHoje(d) {
  let b = $('#r7HojeBarra');
  if (!b) {
    b = document.createElement('div'); b.id = 'r7HojeBarra'; b.className = 'r7-hoje-barra';
    $('#hojeResumo').insertAdjacentElement('afterend', b);
    b.innerHTML = `<div class="r7-meta" id="r7MetaDia" role="progressbar" aria-label="Contatos de hoje"><div class="r7-meta-barra"><div id="r7MetaFill"></div></div><span id="r7MetaTxt"></span></div>
      <div class="r7-filtros"><label class="sr" for="r7Q">Buscar na fila</label><input type="search" id="r7Q" placeholder="Buscar nome, telefone ou placa" maxlength="60" autocomplete="off" enterkeyhint="search">
      <label class="sr" for="r7Origem">Origem</label><select id="r7Origem"><option value="">Todas as origens</option>${['whatsapp', 'google', 'meta', 'indicacao', 'organico', 'telefone'].map(o => `<option value="${o}">${esc(ROTULO_ORIGEM7[o])}</option>`).join('')}</select>
      <button type="button" class="btn btn-primary sm" id="r7Proximo">▶ Atender o próximo</button></div>`;
    let t = null;
    $('#r7Q').addEventListener('input', ev => { clearTimeout(t); t = setTimeout(() => { R7.hoje.q = ev.target.value.trim(); carregarHoje7(); }, 350); });
    $('#r7Origem').addEventListener('change', ev => { R7.hoje.origem = ev.target.value; carregarHoje7(); });
    $('#r7Proximo').addEventListener('click', async () => { const id = H6.dados?.proximo; if (!id) { toast('A fila está zerada. 🏁'); return; } await registrarContato6(id); carregarHoje7(); r7CarregarRetornos(true); });
  }
  const feitos = d.feitos_hoje, meta = d.meta_dia || 12, pct = Math.min(100, Math.round(feitos / meta * 100));
  const progresso = $('#r7MetaDia');
  progresso.hidden = false;
  $('#r7MetaFill').style.width = pct + '%';
  progresso.setAttribute('aria-valuenow', String(Math.min(feitos, meta)));
  progresso.setAttribute('aria-valuemax', String(meta));
  progresso.setAttribute('aria-valuetext', `${feitos} de ${meta} contatos na meta de hoje`);
  $('#r7MetaTxt').textContent = feitos >= meta ? `Meta do dia batida: ${feitos} contatos. 🏁` : `${feitos} de ${meta} contatos hoje · faltam ${d.falta_para_meta}`;
  progresso.classList.toggle('feita', feitos >= meta);
  $('#r7Proximo').disabled = !d.proximo;
}
const ROTULO_ORIGEM7 = { whatsapp: 'WhatsApp', google: 'Google', meta: 'Meta (Instagram e Facebook)', organico: 'Orgânico', telefone: 'Telefone', indicacao: 'Indicação', site: 'Site', sem: 'Sem origem' };

/* retornos combinados */
const ABAS_RET7 = [['atrasados', 'Atrasados'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['sem_retorno', 'Sem retorno']];
async function r7CarregarRetornos(forcar) {
  if (!PERFIL?.id) return;
  let card = $('#r7Retornos');
  if (!card) {
    card = document.createElement('div'); card.id = 'r7Retornos'; card.className = 'card';
    $('#view-hoje').prepend(card); card.addEventListener('click', onClickRetornos7);
    card.addEventListener('change', onChangeRetornos7);
  }
  if (!R7.ret || forcar) card.innerHTML = '<h2>Retornos combinados</h2><div class="skeleton" aria-label="Carregando retornos"></div>';
  try { R7.ret = await api7('/api/retornos' + (R7.retEscopo ? '?escopo=' + R7.retEscopo : '')); r7PintarRetornos(); } catch (e) { erro7(card, e, 'retornos'); }
}
function r7PintarRetornos() {
  const r = R7.ret, card = $('#r7Retornos'); if (!r) return;
  const c = r.contagem, aba = R7.retAba, itens = r[aba] || [];
  const abas = ABAS_RET7.map(([k, rot]) => `<button type="button" role="tab" class="r7-aba${k === aba ? ' on' : ''}" aria-selected="${k === aba}" data-r7ret="${k}">${rot} <b>${c[k] || 0}</b></button>`).join('');
  const cob = c.abertos ? `${r.cobertura_pct}% dos contatos abertos têm retorno combinado` : 'Nenhum contato aberto';
  const linhas = itens.map(i => `<article class="r6-linha r7-ret" data-lead="${esc(i.id)}"><div class="r6-corpo"><div class="r6-topo"><strong>${esc(i.nome)}</strong> <span class="badge b-${esc(i.status)}">${esc(i.status_rotulo)}</span>${i.responsavel_nome && SOU_GESTOR ? ` <span class="tag">${esc(i.responsavel_nome.split(' ')[0])}</span>` : ''}${i.valor_orcado ? ` <span class="tag">${esc(brl(i.valor_orcado))}</span>` : ''}</div>
      <div class="cell-sub">${i.quando ? (i.horas_atraso ? `<b class="parado-txt">Venceu há ${i.horas_atraso >= 48 ? Math.floor(i.horas_atraso / 24) + ' d' : i.horas_atraso + ' h'}</b> (${esc(quando7(i.quando))})` : `Combinado para ${esc(quando7(i.quando))}`) : 'Sem retorno combinado'}${i.tentativas >= 2 ? ` · ${i.tentativas} tentativas sem resposta` : ''}</div></div>
      <div class="r6-acoes"><button type="button" class="acao" data-r7ret-a="contato" data-id="${esc(i.id)}">📞 Registrar</button>
      <label class="sr" for="rm-${esc(i.id)}">Remarcar</label><select class="r7-remarcar" id="rm-${esc(i.id)}" data-id="${esc(i.id)}" aria-label="Remarcar retorno de ${esc(i.nome)}"><option value="">⏰ Remarcar…</option>${PRESETS7.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
      <button type="button" class="acao" data-r7ret-a="abrir" data-id="${esc(i.id)}">Abrir</button></div></article>`).join('');
  const vazio = { atrasados: 'Nenhum retorno atrasado. 🏁', hoje: 'Nada combinado para hoje.', amanha: 'Nada combinado para amanhã.', semana: 'Nada combinado para os próximos dias.', sem_retorno: 'Todo contato aberto tem retorno combinado. 🏁' }[aba];
  const mais = aba === 'sem_retorno' && r.sem_retorno_mais ? `<p class="muted mini-nota">E mais ${r.sem_retorno_mais} sem retorno (mostrando os de maior valor).</p>` : '';
  const periodos = aba === 'hoje' && itens.length ? `<p class="muted mini-nota">Manhã ${r.hoje_periodos.manha} · tarde ${r.hoje_periodos.tarde} · fim do dia ${r.hoje_periodos.fim}</p>` : '';
  const pessoas = SOU_GESTOR && r.por_pessoa?.length > 1 ? `<details class="r7-sec"><summary>Retornos por pessoa</summary><div class="table-wrap"><table class="table"><thead><tr><th>Pessoa</th><th class="num">Abertos</th><th class="num">Atrasados</th><th class="num">Hoje</th><th class="num">Sem retorno</th></tr></thead><tbody>${r.por_pessoa.map(p => `<tr><td>${esc(p.nome)}</td><td class="num">${p.abertos}</td><td class="num${p.atrasados ? ' parado-txt' : ''}">${p.atrasados}</td><td class="num">${p.hoje}</td><td class="num">${p.sem_retorno}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  card.innerHTML = `<div class="r6-cab"><h2>Retornos combinados</h2>${SOU_GESTOR ? `<label class="r6-esc">Mostrar<select id="r7RetEscopo" aria-label="Escopo dos retornos"><option value="">Todos</option><option value="meus">Meus contatos</option><option value="sem">Sem responsável</option></select></label>` : ''}<span class="muted">${esc(cob)}</span></div>
    <div class="r7-abas" role="tablist" aria-label="Retornos">${abas}</div>${periodos}<div class="r7-ret-lista">${linhas || `<p class="vazio-curto">${vazio}</p>`}</div>${mais}${pessoas}`;
  const sel = $('#r7RetEscopo'); if (sel) sel.value = R7.retEscopo;
}
async function onClickRetornos7(e) {
  const t = e.target.closest('[data-r7ret]'); if (t) { R7.retAba = t.dataset.r7ret; r7PintarRetornos(); return; }
  const b = e.target.closest('[data-r7ret-a]'); if (!b) return;
  if (b.dataset.r7retA === 'abrir') abrirModal(b.dataset.id);
  if (b.dataset.r7retA === 'contato') { await registrarContato6(b.dataset.id); r7CarregarRetornos(true); carregarHoje7(); }
}
async function onChangeRetornos7(e) {
  if (e.target.id === 'r7RetEscopo') { R7.retEscopo = e.target.value; r7CarregarRetornos(true); return; }
  const s = e.target.closest('.r7-remarcar'); if (!s || !s.value) return;
  const id = s.dataset.id, v = s.value; s.value = '';
  const l = lead7(id); if (l && travaLead(l)) { toast('🔒 ' + travaLead(l), 6000); return; }
  try {
    const r = await post7('/api/leads/followup-lote', { ids: [id], proximo: v });
    if (!r.atualizados) { toast(r.de_colegas ? '🔒 Esse contato é de um colega.' : 'Esse contato já está fechado.', 5000); return; }
    substituirLocal({ id, proximo_contato_em: r.proximo_contato_em });
    const ant = r.anteriores?.[id] || null;
    toastAcao(`⏰ Retorno remarcado para ${quando7(r.proximo_contato_em)}`, 'Desfazer', async () => { await post7('/api/leads/followup-lote', ant ? { ids: [id], proximo: ant } : { ids: [id], limpar: true }); substituirLocal({ id, proximo_contato_em: ant }); r7CarregarRetornos(true); }, 8000);
    r7CarregarRetornos(true); carregarSinais6(true);
  } catch (er) { toast('⚠️ ' + er.message, 6000); }
}

/* ================= cliques de "Tentar de novo" e ciclo ================= */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-r7]'); if (!b) return;
  const k = b.dataset.r7;
  if (k === 'retornos') r7CarregarRetornos(true);
});
document.addEventListener('indycar:aba', e => {
  const a = e.detail.aba;
  if (a === 'hoje') { r7CarregarRetornos(); }
  if (a === 'pipeline') r7CarregarMov();
});
setInterval(() => { if (document.visibilityState === 'visible' && PERFIL?.id) { if ($('#view-pipeline')?.classList.contains('active')) r7CarregarMov(); if ($('#view-hoje')?.classList.contains('active') && !$('dialog[open]')) r7CarregarRetornos(); } }, 60000);
