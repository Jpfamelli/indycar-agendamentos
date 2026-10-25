// Rodada 7 (25/10/2026, C3): o funil que se mexe sozinho, a ficha do lead com tudo pronto, retornos, perdas,
// indicações, origens com o Ads, qualidade dos dados e o resumo do dono para copiar.
// Carrega depois de rodada6c.js; usa o escopo global (api, TODOS, PERFIL, SOU_GESTOR, toast, abrirDlg, ...).
'use strict';

const R7 = { ger: 0, painel: new Map(), mov: null, movEm: 0, movCarregando: false, ret: null, retAba: 'atrasados', retEscopo: '', hoje: { q: '', origem: '' }, resumoTipo: 'manha', dono: {} };
const api7 = (url, opts) => api(url, opts, false, { tentativas: 1 });
const post7 = (url, corpo) => api7(url, { method: 'POST', body: JSON.stringify(corpo || {}) });
const ETAPAS7 = { novo: 'Novo', contato: 'Em contato', orcamento: 'Orçamento', agendado: 'Agendado', em_servico: 'Em serviço', concluido: 'Concluído', perdido: 'Perdido' };
const MOTIVOS7 = ['Achou caro', 'Foi em outra oficina', 'Sem retorno do cliente', 'Desistiu do serviço', 'Não fazemos o serviço', 'Prazo não atendeu', 'Outro'];
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
  toast(r.voltaram ? `Desfeito: ${n7(r.voltaram, 'lead voltou', 'leads voltaram')}.` : 'Nada para desfazer: a situação já mudou.');
}
function saudeHtml7(s) {
  if (!s) return '';
  return `<span class="r7-saude r7-${esc(s.nivel)}" tabindex="0" role="note" aria-label="Lead ${esc(s.rotulo)}, nota ${s.valor} de 100">🌡 ${esc(s.rotulo)} <b>${s.valor}</b><span class="r7-dica" role="tooltip">${(s.motivos || []).map(m => `<span>${m.pontos > 0 ? '＋' : '−'}${Math.abs(m.pontos)} ${esc(m.texto)}</span>`).join('') || 'Sem sinais ainda'}</span></span>`;
}
function r7Pintar(l, d, falha) {
  const p = r7Garantir();
  if (!d) { p.innerHTML = falha ? `<div class="r7-bloco muted">Não consegui montar o painel do lead agora. <button type="button" class="link-btn" data-r7p="recarregar">Tentar de novo</button></div>` : '<div class="r7-bloco muted" aria-busy="true">Montando o painel do lead…</div>'; return; }
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
    if (!alvo) { toast(k === 'e' ? 'Sem motivo para abrir a entrada: falta horário ou orçamento aprovado.' : 'Esse lead não aceita novo orçamento.'); return; }
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
    <h3 id="dlgMov7T">O que o funil sugere mover</h3>
    <p class="muted">Só vale o que ainda é verdade na hora de aplicar. Dá para desfazer logo depois.</p>
    <div class="table-wrap r7-lista"><table class="table" id="tblMov7"></table></div>
    <p class="form-erro" id="mov7Erro" role="alert"></p>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Fechar</button><div class="spacer"></div><button type="submit" class="btn btn-primary" id="mov7Ok">Aplicar os marcados</button></div></form></dialog>`);
  $('#dlgMov7').addEventListener('click', e => { if (e.target === $('#dlgMov7')) $('#dlgMov7').close(); });
  $('#formMov7').addEventListener('submit', async e => {
    e.preventDefault();
    const itens = [];
    for (const tr of $$('#tblMov7 tr[data-mv]')) {
      if (!tr.querySelector('.mv-ck')?.checked) continue;
      const it = { id: tr.dataset.mv, para: tr.dataset.para };
      if (tr.dataset.para === 'concluido') { const v = Number(String(tr.querySelector('.mv-valor').value).replace(',', '.')); if (!(v > 0)) { $('#mov7Erro').textContent = 'Informe o valor pago de cada carro entregue marcado.'; return; } it.valor_pago = v; }
      if (tr.dataset.para === 'perdido') it.motivo = tr.querySelector('.mv-motivo').value;
      itens.push(it);
    }
    if (!itens.length) { $('#mov7Erro').textContent = 'Marque pelo menos um.'; return; }
    const b = $('#mov7Ok'); b.disabled = true; b.textContent = 'Aplicando…'; $('#mov7Erro').textContent = '';
    try {
      const r = await post7('/api/funil/movimentos/aplicar', { itens });
      for (const a of r.aplicados) substituirLocal({ id: a.id, status: a.para });
      redesenhar(); carregarSinais6(true); await r7CarregarMov(true);
      const pul = r.pulados.length ? ` · ${r.pulados.length} pulado${r.pulados.length === 1 ? '' : 's'} (a situação mudou ou é de colega)` : '';
      if (r.aplicados.length) toastAcao(`🤖 ${n7(r.aplicados.length, 'lead movido', 'leads movidos')}${pul}`, 'Desfazer', () => desfazer7(r.aplicados), 10000); else toast('Nada foi movido' + pul, 6000);
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
    const extra = i.para === 'concluido' ? `<input type="number" class="mv-valor" min="0.01" step="0.01" inputmode="decimal" placeholder="Valor pago (R$)" aria-label="Valor pago por ${esc(i.nome)}">`
      : i.para === 'perdido' ? `<select class="mv-motivo" aria-label="Motivo da perda de ${esc(i.nome)}">${MOTIVOS7.map(x => `<option${x === i.motivo_perda ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>` : '';
    return `<tr data-mv="${esc(i.lead_id)}" data-para="${esc(i.para || '')}"><td>${pode ? `<input type="checkbox" class="mv-ck" aria-label="Aplicar em ${esc(i.nome)}"${i.para === 'concluido' ? '' : ' checked'}>` : ''}</td>
      <td><div class="cell-main"><a href="#" data-mv-abrir="${esc(i.lead_id)}">${esc(i.nome)}</a></div><div class="cell-sub">${esc(i.titulo)}. ${esc(i.motivo)}</div>${extra ? `<div class="mv-extra">${extra}</div>` : ''}</td>
      <td class="mv-etapas">${i.para ? `<span class="badge b-${esc(i.de)}">${esc(ETAPAS7[i.de])}</span> → <span class="badge b-${esc(i.para)}">${esc(ETAPAS7[i.para])}</span>` : `<span class="badge b-${esc(i.de)}">${esc(ETAPAS7[i.de])}</span>`}</td>
      <td>${i.link ? `<a class="acao" href="${esc(i.link)}">${i.codigo === 'em_servico_sem_ordem' ? '🚗 Entrada' : 'Ver lá'}</a>` : ''}${!i.pode_editar ? ' <span class="tag">🔒 colega</span>' : ''}</td></tr>`;
  };
  $('#tblMov7').innerHTML = itens.length ? `<thead><tr><th></th><th>Lead</th><th>Etapa</th><th></th></tr></thead><tbody>${ap.map(linha).join('')}${rev.length ? `<tr class="r7-sep"><td colspan="4"><b>Para revisar</b> (o funil não decide sozinho)</td></tr>${rev.map(linha).join('')}` : ''}</tbody>`
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
async function carregarHoje7() {
  const el = $('#hojeLista'); if (!el) return;
  el.innerHTML = '<div class="skeleton" aria-label="Montando a fila"></div>';
  const qs = new URLSearchParams(); if (H6.escopo) qs.set('escopo', H6.escopo); if (R7.hoje.q) qs.set('q', R7.hoje.q); if (R7.hoje.origem) qs.set('origem', R7.hoje.origem);
  try {
    const [d, e] = await Promise.all([api6('/api/fila-do-dia' + (qs.toString() ? '?' + qs : '')), api6('/api/entregues-sem-fechar')]);
    H6.dados = d; H6.entregues = e; renderHoje6(); r7BarraHoje(d);
  } catch (err) { el.innerHTML = `<p class="vazio-curto">Não consegui montar a fila agora: ${esc(err.message)} <button type="button" class="link-btn" data-h6c="recarregar">Tentar de novo</button></p>`; }
}
carregarHoje6 = carregarHoje7;
textoMotivo6.indicacao_nova = 'Indicação nova';
function r7BarraHoje(d) {
  let b = $('#r7HojeBarra');
  if (!b) {
    b = document.createElement('div'); b.id = 'r7HojeBarra'; b.className = 'r7-hoje-barra';
    $('#hojeResumo').insertAdjacentElement('afterend', b);
    b.innerHTML = `<div class="r7-meta" id="r7MetaDia" role="progressbar" aria-label="Contatos de hoje"><div class="r7-meta-barra"><div id="r7MetaFill"></div></div><span id="r7MetaTxt"></span></div>
      <div class="r7-filtros"><label class="sr" for="r7Q">Buscar na fila</label><input type="search" id="r7Q" placeholder="Buscar nome, telefone ou placa" maxlength="60" autocomplete="off">
      <label class="sr" for="r7Origem">Origem</label><select id="r7Origem"><option value="">Todas as origens</option>${['whatsapp', 'google', 'meta', 'indicacao', 'organico', 'telefone'].map(o => `<option value="${o}">${esc(ROTULO_ORIGEM7[o])}</option>`).join('')}</select>
      <button type="button" class="btn btn-primary sm" id="r7Proximo">▶ Atender o próximo</button></div>`;
    let t = null;
    $('#r7Q').addEventListener('input', ev => { clearTimeout(t); t = setTimeout(() => { R7.hoje.q = ev.target.value.trim(); carregarHoje7(); }, 350); });
    $('#r7Origem').addEventListener('change', ev => { R7.hoje.origem = ev.target.value; carregarHoje7(); });
    $('#r7Proximo').addEventListener('click', async () => { const id = H6.dados?.proximo; if (!id) { toast('A fila está zerada. 🏁'); return; } await registrarContato6(id); carregarHoje7(); r7CarregarRetornos(true); });
  }
  const feitos = d.feitos_hoje, meta = d.meta_dia || 12, pct = Math.min(100, Math.round(feitos / meta * 100));
  $('#r7MetaFill').style.width = pct + '%'; $('#r7MetaDia').setAttribute('aria-valuenow', String(feitos)); $('#r7MetaDia').setAttribute('aria-valuemax', String(meta));
  $('#r7MetaTxt').textContent = feitos >= meta ? `Meta do dia batida: ${feitos} contatos. 🏁` : `${feitos} de ${meta} contatos hoje · faltam ${d.falta_para_meta}`;
  $('#r7MetaDia').classList.toggle('feita', feitos >= meta);
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
  if (!R7.ret || forcar) card.innerHTML = '<h3>Retornos combinados</h3><div class="skeleton" aria-label="Carregando retornos"></div>';
  try { R7.ret = await api7('/api/retornos' + (R7.retEscopo ? '?escopo=' + R7.retEscopo : '')); r7PintarRetornos(); } catch (e) { erro7(card, e, 'retornos'); }
}
function r7PintarRetornos() {
  const r = R7.ret, card = $('#r7Retornos'); if (!r) return;
  const c = r.contagem, aba = R7.retAba, itens = r[aba] || [];
  const abas = ABAS_RET7.map(([k, rot]) => `<button type="button" role="tab" class="r7-aba${k === aba ? ' on' : ''}" aria-selected="${k === aba}" data-r7ret="${k}">${rot} <b>${c[k] || 0}</b></button>`).join('');
  const cob = c.abertos ? `${r.cobertura_pct}% dos leads abertos têm retorno combinado` : 'Nenhum lead aberto';
  const linhas = itens.map(i => `<article class="r6-linha r7-ret" data-lead="${esc(i.id)}"><div class="r6-corpo"><div class="r6-topo"><strong>${esc(i.nome)}</strong> <span class="badge b-${esc(i.status)}">${esc(i.status_rotulo)}</span>${i.responsavel_nome && SOU_GESTOR ? ` <span class="tag">${esc(i.responsavel_nome.split(' ')[0])}</span>` : ''}${i.valor_orcado ? ` <span class="tag">${esc(brl(i.valor_orcado))}</span>` : ''}</div>
      <div class="cell-sub">${i.quando ? (i.horas_atraso ? `<b class="parado-txt">Venceu há ${i.horas_atraso >= 48 ? Math.floor(i.horas_atraso / 24) + ' d' : i.horas_atraso + ' h'}</b> (${esc(quando7(i.quando))})` : `Combinado para ${esc(quando7(i.quando))}`) : 'Sem retorno combinado'}${i.tentativas >= 2 ? ` · ${i.tentativas} tentativas sem resposta` : ''}</div></div>
      <div class="r6-acoes"><button type="button" class="acao" data-r7ret-a="contato" data-id="${esc(i.id)}">📞 Registrar</button>
      <label class="sr" for="rm-${esc(i.id)}">Remarcar</label><select class="r7-remarcar" id="rm-${esc(i.id)}" data-id="${esc(i.id)}" aria-label="Remarcar retorno de ${esc(i.nome)}"><option value="">⏰ Remarcar…</option>${PRESETS7.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
      <button type="button" class="acao" data-r7ret-a="abrir" data-id="${esc(i.id)}">Abrir</button></div></article>`).join('');
  const vazio = { atrasados: 'Nenhum retorno atrasado. 🏁', hoje: 'Nada combinado para hoje.', amanha: 'Nada combinado para amanhã.', semana: 'Nada combinado para os próximos dias.', sem_retorno: 'Todo lead aberto tem retorno combinado. 🏁' }[aba];
  const mais = aba === 'sem_retorno' && r.sem_retorno_mais ? `<p class="muted mini-nota">E mais ${r.sem_retorno_mais} sem retorno (mostrando os de maior valor).</p>` : '';
  const periodos = aba === 'hoje' && itens.length ? `<p class="muted mini-nota">Manhã ${r.hoje_periodos.manha} · tarde ${r.hoje_periodos.tarde} · fim do dia ${r.hoje_periodos.fim}</p>` : '';
  const pessoas = SOU_GESTOR && r.por_pessoa?.length > 1 ? `<details class="r7-sec"><summary>Retornos por pessoa</summary><div class="table-wrap"><table class="table"><thead><tr><th>Pessoa</th><th class="num">Abertos</th><th class="num">Atrasados</th><th class="num">Hoje</th><th class="num">Sem retorno</th></tr></thead><tbody>${r.por_pessoa.map(p => `<tr><td>${esc(p.nome)}</td><td class="num">${p.abertos}</td><td class="num${p.atrasados ? ' parado-txt' : ''}">${p.atrasados}</td><td class="num">${p.hoje}</td><td class="num">${p.sem_retorno}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  card.innerHTML = `<div class="r6-cab"><h3>Retornos combinados</h3>${SOU_GESTOR ? `<label class="r6-esc">Mostrar<select id="r7RetEscopo" aria-label="Escopo dos retornos"><option value="">Todos</option><option value="meus">Meus leads</option><option value="sem">Sem responsável</option></select></label>` : ''}<span class="muted">${esc(cob)}</span></div>
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
    if (!r.atualizados) { toast(r.de_colegas ? '🔒 Esse lead é de um colega.' : 'Esse lead já está fechado.', 5000); return; }
    substituirLocal({ id, proximo_contato_em: r.proximo_contato_em });
    const ant = r.anteriores?.[id] || null;
    toastAcao(`⏰ Retorno remarcado para ${quando7(r.proximo_contato_em)}`, 'Desfazer', async () => { await post7('/api/leads/followup-lote', ant ? { ids: [id], proximo: ant } : { ids: [id], limpar: true }); substituirLocal({ id, proximo_contato_em: ant }); r7CarregarRetornos(true); }, 8000);
    r7CarregarRetornos(true); carregarSinais6(true);
  } catch (er) { toast('⚠️ ' + er.message, 6000); }
}

/* ================= aba Dono: resumo para copiar, qualidade, perdas, indicações ================= */
const _renderDono6R7 = renderDono6;
renderDono6 = function () { _renderDono6R7(); r7DonoExtras(); };
function r7DonoExtras() {
  const corpo = $('#donoCorpo'); if (!corpo) return;
  const antigo = $('#donoTexto')?.closest('.ficha-bloco');
  const resumo = document.createElement('div'); resumo.className = 'ficha-bloco'; resumo.id = 'r7Resumo';
  if (antigo) antigo.replaceWith(resumo); else corpo.append(resumo);
  const q = $('#donoQualidade')?.closest('.ficha-bloco'); if (q) q.remove();
  corpo.insertAdjacentHTML('beforeend', `
    <details class="ficha-bloco r7-sec" id="r7SecQual" data-r7sec="qualidade"><summary><h4>Qualidade dos dados</h4></summary><div class="r7-sec-corpo" id="r7Qual"><p class="muted">Abra para conferir.</p></div></details>
    <details class="ficha-bloco r7-sec" id="r7SecPerdas" data-r7sec="perdas"><summary><h4>Por que perdemos e o que dá para recuperar</h4></summary><div class="r7-sec-corpo" id="r7Perdas"></div></details>
    <details class="ficha-bloco r7-sec" id="r7SecInd" data-r7sec="indicacoes"><summary><h4>Indicações</h4></summary><div class="r7-sec-corpo" id="r7Ind"></div></details>`);
  corpo.querySelectorAll('[data-r7sec]').forEach(d => d.addEventListener('toggle', () => { if (d.open) r7CarregarSecao(d.dataset.r7sec); }));
  r7ResumoMontar();
}
function r7CarregarSecao(k) {
  if (k === 'qualidade') return r7Qualidade();
  if (k === 'perdas') return r7Perdas();
  if (k === 'indicacoes') return r7Indicacoes();
}
/* --- resumo do dono: três jeitos, copiar, WhatsApp, guardar --- */
function r7ResumoMontar() {
  const el = $('#r7Resumo'); if (!el) return;
  el.innerHTML = `<h4>Resumo para o WhatsApp do dono</h4><p class="muted mini-nota">Enquanto o envio automático está parado: copie e cole no WhatsApp.</p>
    <div class="r7-abas" role="tablist" aria-label="Tipo de resumo">${[['manha', 'Bom dia'], ['fechamento', 'Fechamento do dia'], ['semana', 'Semana']].map(([k, t]) => `<button type="button" role="tab" class="r7-aba${k === R7.resumoTipo ? ' on' : ''}" aria-selected="${k === R7.resumoTipo}" data-r7res="${k}">${t}</button>`).join('')}</div>
    <pre class="r6-pre" id="r7ResumoTxt" aria-live="polite">Montando…</pre>
    <div class="r6-links"><button type="button" class="btn btn-primary sm" id="r7ResCopiar" disabled>Copiar resumo</button><a class="btn btn-ghost sm" id="r7ResWpp" target="_blank" rel="noopener" href="#" aria-disabled="true">Abrir no WhatsApp</a><button type="button" class="btn btn-ghost sm" id="r7ResGuardar" disabled>Guardar este resumo</button></div>
    <details class="r7-sec" id="r7ResLista"><summary>Resumos guardados</summary><div id="r7ResGuardados" class="r7-sec-corpo"></div></details>`;
  el.onclick = ev => { const b = ev.target.closest('[data-r7res]'); if (b) { R7.resumoTipo = b.dataset.r7res; r7ResumoMontar(); } };
  $('#r7ResLista').addEventListener('toggle', ev => { if (ev.target.open) r7ResGuardados(); });
  api7('/api/dono/resumo?tipo=' + R7.resumoTipo).then(r => {
    if (!$('#r7ResumoTxt')) return;
    R7.resumoTexto = r.texto; $('#r7ResumoTxt').textContent = r.texto;
    $('#r7ResCopiar').disabled = false; $('#r7ResGuardar').disabled = false;
    $('#r7ResCopiar').onclick = () => copiar7(r.texto, 'Resumo copiado');
    const w = $('#r7ResWpp'); w.href = 'https://wa.me/?text=' + encodeURIComponent(r.texto); w.removeAttribute('aria-disabled');
    $('#r7ResGuardar').onclick = async () => { try { await post7('/api/dono/resumo/guardar', { tipo: R7.resumoTipo }); toast('Resumo guardado'); if ($('#r7ResLista').open) r7ResGuardados(); } catch (e) { toast('⚠️ ' + e.message, 5000); } };
  }).catch(e => { if ($('#r7ResumoTxt')) $('#r7ResumoTxt').textContent = 'Não consegui montar o resumo agora: ' + e.message; });
}
async function r7ResGuardados() {
  const el = $('#r7ResGuardados'); if (!el) return;
  try {
    const r = await api7('/api/dono/resumos');
    const nome = { manha: 'Bom dia', fechamento: 'Fechamento', semana: 'Semana' };
    el.innerHTML = r.resumos.length ? r.resumos.map(x => `<details class="r7-guardado"><summary>${esc(dia7(x.dia))} · ${esc(nome[x.tipo] || x.tipo)}</summary><pre class="r6-pre">${esc(x.texto)}</pre><button type="button" class="link-btn" data-r7cp="${esc(x.id)}">Copiar</button></details>`).join('') : '<p class="muted">Nenhum resumo guardado ainda.</p>';
    el.onclick = ev => { const b = ev.target.closest('[data-r7cp]'); if (b) copiar7(r.resumos.find(x => x.id === b.dataset.r7cp)?.texto || '', 'Resumo copiado'); };
  } catch (e) { erro7(el, e); }
}
/* --- qualidade dos dados: o gestor vê e corrige, a tela não muda nada sozinha --- */
async function r7Qualidade() {
  const el = $('#r7Qual'); if (!el) return;
  el.innerHTML = '<div class="skeleton" aria-label="Conferindo os dados"></div>';
  try {
    const q = await api7('/api/qualidade/painel'); R7.dono.qual = q;
    const cor = { boa: 'ok', regular: 'atencao', ruim: 'alerta' }[q.nivel];
    const acao = v => ({ valores: `<button type="button" class="btn btn-primary sm" data-r7q="valores">Preencher valores (${v.total})</button>`, movimentos: '<button type="button" class="btn btn-ghost sm" data-r7q="movimentos">Ver no funil</button>', perdas: '<button type="button" class="btn btn-ghost sm" data-r7q="perdas">Ver as perdas</button>', distribuir: '<button type="button" class="btn btn-ghost sm" data-r7q="distribuir">Distribuir</button>' })[v.acao] || '';
    el.innerHTML = `<div class="r7-nota-q ${cor}" role="status"><b>${q.nota}</b><span>/100 · dados ${esc(q.nivel)} · ${n7(q.a_corrigir, 'ponto a corrigir', 'pontos a corrigir')}</span></div>
      <p class="muted mini-nota">Aqui só se mostra. Nada foi alterado: a correção é feita por você, nas telas indicadas.${q.valor_sem_registro_estimado ? ` Só as vendas sem valor somam cerca de <b>${esc(brl(q.valor_sem_registro_estimado))}</b> que o painel ainda não conta.` : ''}</p>
      <ul class="r7-verif">${q.verificacoes.map((v, i) => `<li class="r7-v r7-g-${esc(v.gravidade)}"><details${i === 0 ? ' open' : ''}><summary><b>${v.total}</b> ${esc(v.titulo)} <span class="tag">${esc(v.gravidade)}</span></summary><p class="cell-sub">${esc(v.como_corrigir)}</p>${acao(v)}
        <ul class="f360-lista">${v.exemplos.slice(0, 6).map(x => `<li><button type="button" class="link-btn" data-r7lead="${esc(x.id)}">${esc(x.nome)}</button>${x.detalhe ? ` <span class="muted">${esc(x.detalhe)}</span>` : ''}</li>`).join('')}${v.total > 6 ? `<li class="muted">e mais ${v.total - 6}</li>` : ''}</ul></details></li>`).join('') || '<li class="muted">Nada para corrigir. 🏁</li>'}</ul>`;
    el.onclick = ev => {
      const b = ev.target.closest('[data-r7q]'), l = ev.target.closest('[data-r7lead]');
      if (l) abrirModal(l.dataset.r7lead);
      if (!b) return;
      if (b.dataset.r7q === 'valores') abrirValores();
      if (b.dataset.r7q === 'movimentos') { irPara('pipeline'); setTimeout(abrirMov7, 200); }
      if (b.dataset.r7q === 'perdas') { const d = $('#r7SecPerdas'); d.open = true; d.scrollIntoView({ block: 'start' }); }
      if (b.dataset.r7q === 'distribuir') irPara('distribuir');
    };
  } catch (e) { erro7(el, e, 'qualidade'); }
}
/* --- perdas --- */
async function r7Perdas(dias) {
  const el = $('#r7Perdas'); if (!el) return;
  el.innerHTML = '<div class="skeleton" aria-label="Carregando as perdas"></div>';
  try {
    const p = await api7('/api/perdas?dias=' + (dias || R7.dono.diasPerdas || 90)); R7.dono.perdas = p;
    const max = Math.max(1, ...p.motivos.map(m => m.quantidade));
    el.innerHTML = `<div class="r7-bar-topo"><label class="r6-esc">Período<select id="r7PerdasDias" aria-label="Período das perdas">${[30, 90, 180, 365].map(d => `<option value="${d}"${d === p.dias ? ' selected' : ''}>${d} dias</option>`).join('')}</select></label></div>
      <div class="ficha-kpis"><div class="ficha-kpi"><span>Perdidos</span><b>${p.perdidos}</b><small>${p.taxa_perda}% dos que fecharam</small></div><div class="ficha-kpi"><span>Orçado que ficou na mesa</span><b>${esc(brl(p.valor_perdido))}</b></div><div class="ficha-kpi${p.sem_motivo.total ? ' alerta' : ''}"><span>Sem motivo</span><b>${p.sem_motivo.total}</b></div><div class="ficha-kpi"><span>Dão para reabordar</span><b>${p.recuperaveis.length}</b><small>${esc(brl(p.recuperaveis_valor))}</small></div></div>
      ${p.insights.length ? `<ul class="r6-insights">${p.insights.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <div class="r7-motivos">${p.motivos.map(m => `<div class="r7-motivo"><span>${esc(m.motivo)}${m.recuperavel ? ' <span class="tag" title="Dá para tentar de novo">recuperável</span>' : ''}</span><div class="r7-m-barra"><div style="width:${Math.round(m.quantidade / max * 100)}%"></div></div><b>${m.quantidade}</b></div>`).join('') || '<p class="muted">Nenhuma perda no período.</p>'}</div>
      ${p.origens.length ? `<details class="r7-sec"><summary>Perdas por origem</summary><div class="table-wrap"><table class="table"><thead><tr><th>Origem</th><th class="num">Perdidos</th><th class="num">Vendas</th><th class="num">% perdido</th></tr></thead><tbody>${p.origens.map(o => `<tr><td>${esc(o.rotulo)}</td><td class="num">${o.perdidos}</td><td class="num">${o.ganhos}</td><td class="num">${o.taxa_perda}%</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      ${p.recuperaveis.length ? `<h5>Dá para reabordar</h5><div class="r7-rec-lista">${p.recuperaveis.map(i => `<article class="r6-linha"><label class="r7-rec-ck"><input type="checkbox" class="r7-rec" value="${esc(i.id)}"${i.pode_editar ? '' : ' disabled'} aria-label="Escolher ${esc(i.nome)}"></label><div class="r6-corpo"><div class="r6-topo"><strong>${esc(i.nome)}</strong> <span class="tag">${esc(i.motivo)}</span>${i.valor_orcado ? ` <span class="tag">${esc(brl(i.valor_orcado))}</span>` : ''} <span class="muted">perdido há ${i.perdido_ha_dias} d</span>${i.pode_editar ? '' : ' <span class="tag">🔒 colega</span>'}</div>
        <details class="r6-script"><summary>Mensagem sugerida</summary><p>${esc(i.script)}</p><button type="button" class="link-btn" data-r7cp-t="${esc(i.script)}">Copiar texto</button>${U.telE164(i.telefone) ? ` · <a class="link-btn" target="_blank" rel="noopener" href="https://wa.me/55${esc(U.telE164(i.telefone))}?text=${encodeURIComponent(i.script)}">Abrir no WhatsApp</a>` : ''}</details></div></article>`).join('')}</div>
        <div class="r6-links"><button type="button" class="btn btn-primary sm" id="r7Reabordar">Reabrir e reabordar os marcados</button><span class="muted mini-nota">O lead volta para "Em contato", com retorno para amanhã e uma tarefa de reativação.</span></div>` : ''}
      ${p.sem_motivo.total ? `<p class="muted mini-nota">Perdidos sem motivo: ${p.sem_motivo.exemplos.slice(0, 5).map(x => `<button type="button" class="link-btn" data-r7lead="${esc(x.id)}">${esc(x.nome)}</button>`).join(', ')}${p.sem_motivo.total > 5 ? ` e mais ${p.sem_motivo.total - 5}` : ''}. Abra e registre o motivo.</p>` : ''}`;
    el.onchange = ev => { if (ev.target.id === 'r7PerdasDias') { R7.dono.diasPerdas = Number(ev.target.value); r7Perdas(); } };
    el.onclick = async ev => {
      const l = ev.target.closest('[data-r7lead]'); if (l) { abrirModal(l.dataset.r7lead); return; }
      const c = ev.target.closest('[data-r7cp-t]'); if (c) { copiar7(c.dataset.r7cpT); return; }
      if (ev.target.id !== 'r7Reabordar') { if (ev.target.closest('[data-r7="perdas"]')) r7Perdas(); return; }
      const ids = $$('.r7-rec:checked', el).map(x => x.value); if (!ids.length) { toast('Marque pelo menos um lead.'); return; }
      try { const r = await post7('/api/perdas/reabordar', { ids }); await carregarLeads(); redesenhar(); carregarSinais6(true); toast(`🔄 ${n7(r.reabertos.length, 'lead reaberto', 'leads reabertos')} para reabordar${r.pulados.length ? ` · ${r.pulados.length} pulado${r.pulados.length === 1 ? '' : 's'}` : ''}`, 6000); r7Perdas(); }
      catch (er) { toast('⚠️ ' + er.message, 6000); }
    };
  } catch (e) { erro7(el, e, 'perdas'); }
}
/* --- indicações --- */
async function r7Indicacoes() {
  const el = $('#r7Ind'); if (!el) return;
  el.innerHTML = '<div class="skeleton" aria-label="Carregando as indicações"></div>';
  try {
    const d = await api7('/api/indicacoes/painel');
    el.innerHTML = `<div class="ficha-kpis"><div class="ficha-kpi"><span>Indicações</span><b>${d.total}</b></div><div class="ficha-kpi"><span>Viraram cliente</span><b>${d.viraram}</b><small>${d.taxa}% dos que têm lead</small></div>${d.valor != null ? `<div class="ficha-kpi"><span>Faturado por indicação</span><b>${esc(brl(d.valor))}</b><small>ticket ${esc(brl(d.valor_medio))}</small></div>` : ''}<div class="ficha-kpi${d.esperando_contato.length ? ' alerta' : ''}"><span>Esperando contato</span><b>${d.esperando_contato.length}</b></div></div>
      ${d.esperando_contato.length ? `<h5>Indicados esperando o primeiro contato</h5><ul class="f360-lista">${d.esperando_contato.map(x => `<li><button type="button" class="link-btn" data-r7lead="${esc(x.lead_id)}">${esc(x.nome)}</button> · indicado por ${esc(x.indicado_por || 'um cliente')} · há ${x.horas >= 48 ? Math.floor(x.horas / 24) + ' d' : x.horas + ' h'}</li>`).join('')}</ul>` : ''}
      ${d.ranking ? `<h5>Quem mais indica</h5>${d.ranking.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th class="num">Indicou</th><th class="num">Viraram</th><th class="num">Faturado</th></tr></thead><tbody>${d.ranking.map(x => `<tr><td>${esc(x.nome)}</td><td class="num">${x.indicacoes}</td><td class="num">${x.viraram}</td><td class="num">${esc(brl(x.valor))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Ainda ninguém indicou.</p>'}` : ''}
      ${d.agradecer.length ? `<h5>Vale agradecer (amigo atendido nos últimos 30 dias)</h5><ul class="f360-lista">${d.agradecer.map(x => `<li><b>${esc(x.indicador || 'Cliente')}</b> indicou ${esc(x.indicado)} <details class="r6-script"><summary>Mensagem de agradecimento</summary><p>${esc(x.script)}</p><button type="button" class="link-btn" data-r7cp-t="${esc(x.script)}">Copiar texto</button>${U.telE164(x.telefone_indicador) ? ` · <a class="link-btn" target="_blank" rel="noopener" href="https://wa.me/55${esc(U.telE164(x.telefone_indicador))}?text=${encodeURIComponent(x.script)}">Abrir no WhatsApp</a>` : ''}</details></li>`).join('')}</ul>` : ''}`;
    el.onclick = ev => { const l = ev.target.closest('[data-r7lead]'); if (l) abrirModal(l.dataset.r7lead); const c = ev.target.closest('[data-r7cp-t]'); if (c) copiar7(c.dataset.r7cpT); };
  } catch (e) { erro7(el, e, 'indicacoes'); }
}

/* ================= aba Origem: desempenho por origem, cruzando o Ads ================= */
async function r7Origens(dias) {
  if (!SOU_GESTOR) return;
  let card = $('#r7Origens');
  if (!card) { card = document.createElement('div'); card.id = 'r7Origens'; card.className = 'card'; $('#view-origem').prepend(card); }
  card.innerHTML = '<h3>Desempenho por origem</h3><div class="skeleton" aria-label="Carregando"></div>';
  try {
    const hoje = new Date(), de = dias ? new Date(hoje.getTime() - dias * 864e5).toISOString().slice(0, 10) : null;
    const r = await api7('/api/origens/desempenho' + (de ? '?de=' + de : '')); R7.dono.origens = r;
    const venc = (v) => v == null ? '' : `<span class="${v >= 0 ? 'r6-up' : 'r6-down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v)}%</span>`;
    card.innerHTML = `<div class="r6-cab"><h3>Desempenho por origem</h3><label class="r6-esc">Período<select id="r7OrigemDias" aria-label="Período"><option value="">Este mês</option>${[7, 30, 90].map(d => `<option value="${d}"${dias === d ? ' selected' : ''}>Últimos ${d} dias</option>`).join('')}</select></label></div>
      <p class="card-sub">Leads que chegaram no período, o que virou venda e quanto custou (Meta e Google, pelo gasto do Ads). ${r.so_demonstracao ? '<b class="parado-txt">Os números do Ads ainda são de demonstração.</b>' : ''}</p>
      <div class="ficha-kpis"><div class="ficha-kpi"><span>Leads</span><b>${r.total.leads}</b><small>${r.anterior.leads} no período anterior</small></div><div class="ficha-kpi"><span>Faturado</span><b>${esc(brl(r.total.faturamento))}</b></div><div class="ficha-kpi"><span>Pago (Meta + Google)</span><b>${r.pago.leads} leads</b><small>gasto ${esc(brl(r.pago.gasto))}</small></div><div class="ficha-kpi"><span>Orgânico e indicação</span><b>${r.organico.leads} leads</b><small>${esc(brl(r.organico.faturamento))}</small></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Origem</th><th class="num">Leads</th><th class="num">Orçaram</th><th class="num">Vendas</th><th class="num">Conversão</th><th class="num">Faturado</th><th class="num">Ticket</th><th class="num">Dias p/ fechar</th><th class="num">Gasto</th><th class="num">Custo/lead</th><th class="num">Retorno</th></tr></thead><tbody>${r.linhas.map(x => `<tr><td>${esc(x.rotulo)}${x.paga ? ' <span class="tag">anúncio</span>' : ''}</td><td class="num">${x.leads} ${venc(x.variacao_leads)}</td><td class="num">${x.orcaram}</td><td class="num">${x.ganhos}</td><td class="num">${pct7(x.conversao)}</td><td class="num">${esc(brl(x.faturamento))}</td><td class="num">${x.ticket ? esc(brl(x.ticket)) : '—'}</td><td class="num">${x.dias_ate_fechar ?? '—'}</td><td class="num">${x.gasto != null ? esc(brl(x.gasto)) : '—'}</td><td class="num">${x.cpl != null ? esc(brl(x.cpl)) : '—'}</td><td class="num">${x.roas != null ? x.roas + 'x' : '—'}</td></tr>`).join('')}</tbody></table></div>
      ${r.insights.length ? `<ul class="r6-insights">${r.insights.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
    $('#r7OrigemDias').onchange = ev => r7Origens(ev.target.value ? Number(ev.target.value) : 0);
  } catch (e) { card.innerHTML = '<h3>Desempenho por origem</h3>'; erro7(card, e, 'origens'); }
}

/* ================= cliques de "Tentar de novo" e ciclo ================= */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-r7]'); if (!b) return;
  const k = b.dataset.r7;
  if (k === 'retornos') r7CarregarRetornos(true);
  if (k === 'qualidade') r7Qualidade();
  if (k === 'perdas') r7Perdas();
  if (k === 'indicacoes') r7Indicacoes();
  if (k === 'origens') r7Origens();
});
document.addEventListener('indycar:aba', e => {
  const a = e.detail.aba;
  if (a === 'hoje') { r7CarregarRetornos(); }
  if (a === 'pipeline') r7CarregarMov();
  if (a === 'origem') r7Origens(0);
});
setInterval(() => { if (document.visibilityState === 'visible' && PERFIL?.id) { if ($('#view-pipeline')?.classList.contains('active')) r7CarregarMov(); if ($('#view-hoje')?.classList.contains('active') && !$('dialog[open]')) r7CarregarRetornos(); } }, 60000);
