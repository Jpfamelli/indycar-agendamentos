// Rodada 6, segunda leva (C5, 21/10/2026): o lead mostra o que os outros sistemas sabem AGORA
// (orçamento no Orçador, carro no Pátio, pré-agendamento, observações do site), a fila "Hoje" ganha
// o último contato e os carros sem lead, a busca (Ctrl+K) acha em todos os sistemas, o gestor vê
// "Agora na casa" e as ligações quebradas, e o contato pode ser registrado em lote.
// Carrega depois de rodada6.js; usa o escopo global (api6, post6, abrirNomeada6, esc, brl, quando6 …).
'use strict';

const C6 = { con: null, lead: null, em: 0, ger: 0, assinatura: '', carros: null, agora: null };
const HOSTS_OK6 = (() => { const s = new Set(); try { for (const h of Object.values(A6.HOSTS || {})) s.add(new URL(h).hostname); } catch { /* segue */ } return s; })();
/** Só abre http(s) da própria origem ou de um app da casa. */
function urlSegura6(href) {
  let u; try { u = new URL(String(href || ''), location.href); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.origin !== location.origin && !HOSTS_OK6.has(u.hostname)) return null;
  return u.href;
}
const appDaUrl6 = href => { try { return appDoLink6(href); } catch { return null; } };
function abrirSeguro6(href, app) {
  const u = urlSegura6(href); if (!u) { toast('Esse endereço não é de um sistema da casa.'); return; }
  abrirNomeada6(u, app || appDaUrl6(u) || 'patio');
}
const hojeChave6 = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
function lerOcultos6() { try { const o = JSON.parse(localStorage.getItem('indycar_crm_hoje_ocultos') || '{}'); return o.dia === hojeChave6() ? new Set(o.ids || []) : new Set(); } catch { return new Set(); } }
function gravarOcultos6(set) { try { localStorage.setItem('indycar_crm_hoje_ocultos', JSON.stringify({ dia: hojeChave6(), ids: [...set].slice(0, 300) })); } catch { /* sem armazenamento: some só nesta tela */ } }
const dataCurta6 = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
const TOM_CLASSE6 = { alerta: 'alerta', atencao: 'atencao', ok: 'ok', neutro: '' };

/* ================= conexões vivas no lead ================= */
function painelConexoes6() {
  let p = $('#r6cPainel');
  if (!p) { p = document.createElement('div'); p.id = 'r6cPainel'; p.className = 'r6c-painel'; p.setAttribute('aria-live', 'polite'); $('#painelTl').prepend(p); p.addEventListener('click', onClickConexoes6); }
  return p;
}
function onClickConexoes6(e) {
  const b = e.target.closest('[data-r6c]'); if (!b) return;
  const a = b.dataset.r6c;
  if (a === 'abrir') abrirSeguro6(b.dataset.url, b.dataset.app);
  if (a === 'copiar') navigator.clipboard.writeText(b.dataset.txt).then(() => toast('Copiado'), () => toast('Não consegui copiar.'));
  if (a === 'recarregar') carregarConexoes6(leadPorId6(LEAD_ABERTO), true);
}
function assinaturaConexoes6(c) {
  return JSON.stringify([(c.orcamentos?.itens || []).map(o => [o.id, o.status, o.visualizado_em, !!o.agendamento_id]), (c.patio?.carros || []).map(x => [x.os_id, x.etapa]), (c.pre_agendamentos || []).map(x => x.id)]);
}
function pintarConexoes6(c, l) {
  const p = painelConexoes6(); if (!c) { p.innerHTML = ''; return; }
  const trava = typeof travaLead === 'function' ? travaLead(l) : null;
  const partes = [];
  const carro = c.patio?.carros?.[0], site = c.site || {};
  if (carro) {
    partes.push(`<div class="r6c-faixa patio${carro.etapa === 'pronto' ? ' ok' : ''}" role="status"><b>🚗 CARRO NO PÁTIO AGORA</b> · ordem nº ${esc(carro.numero ?? '')} · <b>${esc(carro.etapa_rotulo)}</b>${carro.etapa_em ? ' desde ' + esc(quando6(carro.etapa_em)) : ''}${carro.previsao_entrega ? ' · previsão ' + esc(quando6(carro.previsao_entrega)) : ''}${carro.atrasado ? ` · <b class="r6c-atraso">⚠ acima do normal${carro.minutos_na_etapa ? ' (' + Math.round(carro.minutos_na_etapa / 60 * 10) / 10 + ' h nesta etapa)' : ''}</b>` : ''}${carro.orcamento_numero ? ' · orçamento nº ' + esc(carro.orcamento_numero) : ''}
      ${carro.link ? `<button type="button" class="acao" data-r6c="abrir" data-app="patio" data-url="${esc(carro.link)}">Abrir no Pátio</button>` : ''}${carro.link_cliente ? `<button type="button" class="acao" data-r6c="copiar" data-txt="${esc(carro.link_cliente)}" title="Link para o cliente acompanhar o carro">📋 Copiar link de acompanhar</button>` : ''}
      ${(carro.extras_pendentes || []).length ? `<div class="r6c-extras"><b>${carro.extras_pendentes.length} extra${carro.extras_pendentes.length === 1 ? '' : 's'} esperando o cliente decidir:</b> ${carro.extras_pendentes.map(x => esc(x.descricao || 'extra') + (x.valor != null ? ' (' + brl(x.valor) + ')' : '')).join(' · ')}</div>` : ''}</div>`);
  } else if (site.carro_no_patio) {
    partes.push(`<div class="r6c-faixa suave" role="status"><b>🚗 O site avisou: carro no pátio</b>${site.carro_no_patio.os_numero ? ' (ordem nº ' + esc(site.carro_no_patio.os_numero) + (site.carro_no_patio.etapa_rotulo ? ', ' + esc(site.carro_no_patio.etapa_rotulo) : '') + ')' : ''} quando o contato chegou. <span class="muted">Hoje o carro não está mais no Pátio.</span></div>`);
  }
  if (site.cliente_ja_cadastrado && !carro) partes.push('<div class="r6c-faixa suave">👤 O site reconheceu este telefone: <b>cliente já cadastrado na oficina</b>.</div>');
  if (site.horario_escolhido) partes.push(`<div class="r6c-faixa suave">🕘 Horário que o cliente escolheu no site: <b>${esc(site.horario_escolhido)}</b></div>`);
  for (const pa of c.pre_agendamentos || []) {
    partes.push(`<div class="r6c-faixa pre${pa.passou ? ' alerta' : ''}"><b>📅 Pré-agendamento do Orçador</b> · ${esc(dataCurta6(pa.quando))} às ${esc(pa.hora)}${pa.orcamento_numero ? ' · orçamento nº ' + esc(pa.orcamento_numero) : ''}${pa.servico ? ' · ' + esc(pa.servico) : ''} — <b>falta confirmar com o cliente</b>${pa.passou ? ' (a data já passou)' : ''}${pa.link ? ` <button type="button" class="acao acao-forte" data-r6c="abrir" data-app="agenda" data-url="${esc(pa.link)}">Confirmar na Agenda</button>` : ''}</div>`);
  }
  const orc = c.orcamentos || {};
  if ((orc.itens || []).length) {
    const r = orc.resumo || {};
    partes.push(`<div class="r6c-bloco"><h4>🧾 Orçamentos no Orçador <small>${r.esperando ? r.esperando + ' esperando resposta' + (r.valor_esperando ? ' · ' + brl(r.valor_esperando) : '') : 'ao vivo'}</small></h4><ul class="r6c-orcs">${orc.itens.map(o => {
      const s = o.situacao;
      return `<li class="${TOM_CLASSE6[s.tom] || ''}"><div><b>nº ${esc(o.numero ?? '')}</b> <span class="r6c-sel ${TOM_CLASSE6[s.tom] || ''}">${esc(s.rotulo)}</span>${o.valor != null ? ' · ' + brl(o.valor) : ''}${o.parcial ? ' (parcial)' : ''}${o.carro ? ' · ' + esc(o.carro) : ''}</div>
        ${o.servicos ? `<div class="cell-sub">${esc(o.servicos)}</div>` : ''}${o.motivo ? `<div class="cell-sub">Motivo da recusa: <b>${esc(o.motivo)}</b></div>` : ''}
        <div class="r6c-linha-acao">${s.acao ? `<small class="muted">👉 ${esc(s.acao)}</small>` : ''}<button type="button" class="acao" data-r6c="abrir" data-app="orcador" data-url="${esc(o.link_equipe)}">Abrir no Orçador</button>${o.link_cliente ? `<button type="button" class="acao" data-r6c="copiar" data-txt="${esc(o.link_cliente)}">📋 Copiar link do cliente</button>` : ''}</div></li>`;
    }).join('')}</ul></div>`);
  } else if (orc.consultou_orcador) {
    partes.push(`<div class="r6c-bloco vazio"><small class="muted">🧾 Nenhum orçamento deste cliente no Orçador ainda.</small>${c.links?.novo_orcamento && !trava ? ` <button type="button" class="acao" data-r6c="abrir" data-app="orcador" data-url="${esc(c.links.novo_orcamento)}">Criar orçamento com os dados do contato</button>` : ''}</div>`);
  }
  const acoes = (c.acoes_sugeridas || []).filter(a => a.link);
  if (acoes.length) partes.push(`<div class="r6c-bloco"><h4>👉 O que a casa sugere <small>pelo histórico do cliente</small></h4><ul class="r6c-acoes">${acoes.map(a => `<li><div><b>${esc(a.titulo)}</b>${a.motivo ? `<div class="cell-sub">${esc(a.motivo)}</div>` : ''}</div><button type="button" class="acao" data-r6c="abrir" data-app="${esc(a.app || '')}" data-url="${esc(a.link)}">Abrir${a.app ? ' no ' + esc(A6.NOMES[a.app] || a.app) : ''}</button></li>`).join('')}</ul></div>`);
  if ((c.avisos || []).length) partes.push(`<div class="r6c-aviso" role="status">⚠️ ${esc(c.avisos.join(' · '))} <button type="button" class="link-btn" data-r6c="recarregar">Tentar de novo</button></div>`);
  p.innerHTML = partes.join('');
}
async function carregarConexoes6(l, forcar) {
  if (!l || !l.id || !PERFIL?.id) return;
  if (!forcar && C6.lead === l.id && C6.con && Date.now() - C6.em < 15000) { pintarConexoes6(C6.con, l); return; }
  const ger = ++C6.ger;
  try {
    const c = await api6(`/api/leads/${encodeURIComponent(l.id)}/conexoes`);
    if (ger !== C6.ger || String(LEAD_ABERTO) !== String(l.id)) return;
    const antes = C6.lead === l.id ? C6.con : null;
    C6.con = c; C6.lead = l.id; C6.em = Date.now();
    if (antes) avisarMudancas6(antes, c);
    pintarConexoes6(c, leadPorId6(l.id) || l);
  } catch (e) {
    if (ger === C6.ger) painelConexoes6().innerHTML = `<div class="r6c-aviso" role="status">⚠️ Não consegui ver o que os outros sistemas sabem agora. <button type="button" class="link-btn" data-r6c="recarregar">Tentar de novo</button></div>`;
  }
}
/** Se algo mudou enquanto a ficha estava aberta, diz o que foi (sem recarregar a tela). */
function avisarMudancas6(antes, depois) {
  const mapa = new Map((antes.orcamentos?.itens || []).map(o => [o.id, o]));
  for (const o of depois.orcamentos?.itens || []) {
    const a = mapa.get(o.id);
    if (a && (a.situacao.cod !== o.situacao.cod)) toast(`🧾 Orçamento nº ${o.numero ?? ''}: ${o.situacao.rotulo}`, 8000);
    if (!a && mapa.size) toast(`🧾 Novo orçamento nº ${o.numero ?? ''} no Orçador`, 6000);
  }
  const ca = antes.patio?.carros?.[0], cd = depois.patio?.carros?.[0];
  if (cd && (!ca || ca.etapa !== cd.etapa)) toast(`🚗 O carro agora está em: ${cd.etapa_rotulo}`, 8000);
  if (ca && !cd) toast('🚗 O carro saiu do Pátio (entregue ou cancelado).', 8000);
}
const _renderFichaLeadR6c = renderFichaLead;
renderFichaLead = function (l) {
  _renderFichaLeadR6c(l);
  if (!l || !l.id) return;
  painelConexoes6();
  carregarConexoes6(l, C6.lead !== l.id);
};
setInterval(() => { if (document.visibilityState === 'visible' && PERFIL?.id && modal.classList.contains('open') && LEAD_ABERTO) carregarConexoes6(leadPorId6(LEAD_ABERTO), true); }, 30000);

/* ================= chips novos no funil ================= */
const _chips6c = chips6;
chips6 = function (l) {
  const s = R6.sinais[l.id]; let h = _chips6c(l);
  if (!s) return h;
  const extra = [];
  if (s.flags?.includes('orcamento_visto')) extra.push(`<span class="r6-chip alerta" title="O cliente abriu o orçamento e não respondeu">👀 viu o orçamento há ${s.orcamento.visto_dias} d</span>`);
  if (s.orcamento_recusado) extra.push(`<span class="r6-chip alerta" title="Orçamento nº ${esc(s.orcamento_recusado.numero ?? '')} recusado">✖ recusou${s.orcamento_recusado.dias ? ' há ' + s.orcamento_recusado.dias + ' d' : ''}</span>`);
  if (s.pre_agendamento) extra.push(`<span class="r6-chip alerta" title="Pré-agendamento do Orçador esperando confirmação">📅 confirmar horário</span>`);
  if (!extra.length) return h;
  return h ? h.replace(/<\/div>$/, extra.join('') + '</div>') : `<div class="r6-chips">${extra.join('')}</div>`;
};
Object.assign(textoMotivo6, { orcamento_visto: 'Viu o orçamento', orcamento_recusado: 'Orçamento recusado', pre_agendamento: 'Confirmar horário' });
const _renderFiltroSinal6c = renderFiltroSinal6;
renderFiltroSinal6 = function () {
  _renderFiltroSinal6c();
  const sel = $('#fSinal6'); if (!sel) return;
  const rf = $('#fRespFunil')?.value, eu = PERFIL?.id, cont = {};
  for (const l of TODOS) { if (!U.filtroResponsavel(l, rf, eu)) continue; for (const k of R6.sinais[l.id]?.flags || []) cont[k] = (cont[k] || 0) + 1; }
  for (const k of ['orcamento_visto', 'orcamento_recusado', 'pre_agendamento']) if (cont[k] && !sel.querySelector(`option[value="${k}"]`)) sel.insertAdjacentHTML('beforeend', `<option value="${k}"${R6.filtro === k ? ' selected' : ''}>${esc(R6.rotulos[k] || k)} (${cont[k]})</option>`);
};

/* ================= Hoje: último contato, ocultar por hoje, copiar lista, carros sem lead ================= */
const OCULTOS6 = lerOcultos6();
const _renderHoje6c = renderHoje6;
renderHoje6 = function () {
  const d = H6.dados; if (!d) return;
  const todos = d.itens;
  d.itens = todos.filter(i => !OCULTOS6.has(i.lead.id));
  const escondidos = todos.length - d.itens.length;
  try { _renderHoje6c(); } finally { d.itens = todos; }
  $$('#hojeLista .r6-linha').forEach(el => {
    const it = todos.find(i => i.lead.id === el.dataset.lead); if (!it) return;
    const corpo = $('.r6-corpo', el);
    if (corpo && !$('.r6c-ultimo', corpo)) {
      const u = it.ultimo_contato;
      $('.cell-sub', corpo)?.insertAdjacentHTML('afterend', u ? `<div class="r6c-ultimo">Último contato: ${esc(({ ligacao: 'ligação', whatsapp: 'WhatsApp', visita: 'visita', nota: 'anotação', followup: 'retorno' })[u.tipo] || u.tipo)}${u.resultado_rotulo ? ' · ' + esc(u.resultado_rotulo) : ''} · ${esc(quando6(u.quando))}${u.autor ? ' · ' + esc(primeiroNome(u.autor)) : ''}${u.texto ? `<br><q>${esc(u.texto)}</q>` : ''}</div>` : '<div class="r6c-ultimo nunca">Nenhum contato registrado ainda.</div>');
    }
    $('.r6-acoes', el)?.insertAdjacentHTML('beforeend', `<button type="button" class="acao" data-h6c="ocultar" data-id="${esc(el.dataset.lead)}" title="Tirar da fila só por hoje">🙈 Por hoje não</button>`);
  });
  const resumo = $('#hojeResumo');
  if (resumo) resumo.insertAdjacentHTML('beforeend', `${d.total > (d.mostrando || d.itens.length) ? ` <span class="muted">· mostrando os ${d.mostrando || d.itens.length} mais urgentes de ${d.total}</span>` : ''}${escondidos ? ` <button type="button" class="r6-chip-btn" data-h6c="mostrar">🙈 ${escondidos} oculto${escondidos === 1 ? '' : 's'} por hoje · mostrar</button>` : ''} <button type="button" class="r6-chip-btn" data-h6c="copiar-lista" title="Copia nome, telefone e motivo para colar onde você anota as ligações">📋 Copiar lista para ligar</button>`);
  if (!d.itens.length && todos.length) $('#hojeLista').innerHTML = '<p class="vazio-curto"><strong>Você escondeu a fila toda por hoje.</strong><br>Clique em “mostrar” acima para ver de novo.</p>';
  else if (!todos.length && d.escopo === 'sem') $('#hojeLista').innerHTML = '<p class="vazio-curto"><strong>Nenhum contato sem responsável pedindo ação. 🏁</strong><br>Quem chega sem dono aparece aqui.</p>';
  else if (!todos.length && d.escopo === 'meus') $('#hojeLista').innerHTML = '<p class="vazio-curto"><strong>Seus contatos estão em dia. 🏁</strong><br>Troque para “Sem responsável” para pegar contatos parados de ninguém.</p>';
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-h6c]'); if (!b) return;
  const a = b.dataset.h6c;
  if (a === 'ocultar') { OCULTOS6.add(b.dataset.id); gravarOcultos6(OCULTOS6); renderHoje6(); toastAcao('🙈 Escondido só por hoje', 'Desfazer', () => { OCULTOS6.delete(b.dataset.id); gravarOcultos6(OCULTOS6); renderHoje6(); }, 6000); }
  if (a === 'mostrar') { OCULTOS6.clear(); gravarOcultos6(OCULTOS6); renderHoje6(); }
  if (a === 'copiar-lista') {
    const linhas = (H6.dados?.itens || []).filter(i => !OCULTOS6.has(i.lead.id)).map(i => `${i.lead.nome} · ${U.formatarTelefone(i.lead.telefone)} · ${i.texto}`);
    if (!linhas.length) { toast('A fila está vazia.'); return; }
    navigator.clipboard.writeText(linhas.join('\n')).then(() => toast(`📋 ${linhas.length} nome${linhas.length === 1 ? '' : 's'} copiado${linhas.length === 1 ? '' : 's'}`), () => toast('Não consegui copiar.'));
  }
  if (a === 'criar-lead') { abrirModal(null, { telefone: b.dataset.tel || '', nome: b.dataset.nome || '', placa: b.dataset.placa || '', observacoes: b.dataset.os ? `Carro já está no Pátio (ordem nº ${b.dataset.os}).` : '', origem: 'organico' }); }
}, true);
async function carregarCarrosSemLead6() {
  const alvo = $('#hojeCarros'); if (!alvo) return;
  try { C6.carros = await api6('/api/patio/carros'); } catch { alvo.innerHTML = ''; return; }
  const c = C6.carros;
  alvo.innerHTML = c.sem_lead_total ? `<h4>🚗 Carros na oficina sem contato no CRM (${c.sem_lead_total})</h4><p class="muted mini-nota">O cliente está com o carro aí dentro e ninguém acompanha como venda. Crie o contato para o resto do funil enxergar.</p>` + c.sem_lead.map(x => `<div class="r6-linha"><div><strong>${esc(x.nome || 'Cliente sem nome')}</strong> <span class="muted">${esc(x.placa || '')}</span><div class="cell-sub">Ordem nº ${esc(x.numero ?? '')} · ${esc(x.etapa_rotulo)}${x.telefone ? ' · ' + esc(U.formatarTelefone(x.telefone)) : ''}</div></div>
    <div class="r6-acoes">${x.link ? `<button type="button" class="acao" data-r6c="abrir" data-app="patio" data-url="${esc(x.link)}">🔧 Pátio</button>` : ''}<button type="button" class="acao acao-forte" data-h6c="criar-lead" data-tel="${esc(x.telefone || '')}" data-nome="${esc(x.nome || '')}" data-placa="${esc(x.placa || '')}" data-os="${esc(x.numero ?? '')}">Criar contato</button></div></div>`).join('') : '';
}
document.addEventListener('click', e => { const b = e.target.closest('#hojeCarros [data-r6c]'); if (b && b.dataset.r6c === 'abrir') abrirSeguro6(b.dataset.url, b.dataset.app); });
(function montarHoje6c() {
  const lista = $('#hojeLista'); if (lista && !$('#hojeCarros')) lista.insertAdjacentHTML('afterend', '<div id="hojeCarros" class="r6c-carros"></div>');
})();
document.addEventListener('indycar:aba', e => { if (e.detail.aba === 'hoje') carregarCarrosSemLead6(); });


/* ================= contato em lote ================= */
(function montarLote6c() {
  const barra = $('#barraLote'); if (!barra || $('#loteContato6c')) return;
  const sel = document.createElement('select'); sel.id = 'loteContato6c'; sel.setAttribute('aria-label', 'Registrar o mesmo contato nos selecionados');
  sel.innerHTML = '<option value="">📞 Registrar contato…</option><option value="whatsapp|respondeu">Avisei por WhatsApp (respondeu)</option><option value="whatsapp|sem_resposta">Mandei WhatsApp (sem resposta)</option><option value="ligacao|atendeu">Liguei (atendeu)</option><option value="ligacao|nao_atendeu">Liguei (não atendeu)</option>';
  barra.insertBefore(sel, $('#loteRetorno6') || $('#loteCampanha') || $('#loteLimpar'));
  sel.addEventListener('change', async () => {
    const v = sel.value; sel.value = ''; if (!v || !SEL.size) return;
    const [tipo, resultado] = v.split('|'), ids = [...SEL];
    try {
      const r = await post6('/api/leads/contato-lote', { ids, tipo, resultado });
      SEL.clear(); redesenhar(); carregarSinais6(true);
      for (const id of r.ids) substituirLocal({ id, ultimo_contato_em: new Date().toISOString() });
      toast(`📞 Contato registrado em ${r.registrados} contato${r.registrados === 1 ? '' : 's'}` + (r.de_colegas ? ` · ${r.de_colegas} de colega ficou de fora` : '') + (r.fechados ? ` · ${r.fechados} já fechado` : ''), 7000);
    } catch (e) { toast('⚠️ ' + e.message, 6000); }
  });
})();

const ICONE_GRUPO6 = { clientes: '🪪', conversas: '💬', leads: '🎯', agendamentos: '📅', patio: '🔧', orcamentos: '🧾' };

/* ================= lote 2: novo contato sabe do resto da casa, "não atendeu" num clique, atalhos na ficha ================= */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-h6c]'); if (!b) return;
  const a = b.dataset.h6c;
  if (a === 'recarregar') carregarHoje6();
  if (a === 'nao-atendeu') {
    const l = leadPorId6(b.dataset.id); if (!l) return;
    const trava = travaLead(l); if (trava) { toast('🔒 ' + trava, 6000); return; }
    b.disabled = true;
    post6(`/api/leads/${encodeURIComponent(l.id)}/contato`, { tipo: 'ligacao', resultado: 'nao_atendeu' }).then(r => { aplicarContato6(l, r); carregarHoje6(); },
      err => { b.disabled = false; toast('⚠️ ' + err.message, 6000); });
  }
}, true);
const _renderHoje6c2 = renderHoje6;
renderHoje6 = function () {
  _renderHoje6c2();
  $$('#hojeLista .r6-linha').forEach(el => {
    const l = leadPorId6(el.dataset.lead); if (!l || travaLead(l) || $('[data-h6c="nao-atendeu"]', el)) return;
    $('[data-h6="contato"]', el)?.insertAdjacentHTML('afterend', `<button type="button" class="acao" data-h6c="nao-atendeu" data-id="${esc(l.id)}" title="Registra “não atendeu” e combina o retorno sozinho">📵 Não atendeu</button>`);
  });
};


/* Novo lead: o telefone e a placa já aparecem em outro sistema? (Pátio, Orçador, Atendimento, Agenda) */
async function avisarOutrosSistemas6(campo) {
  if (typeof editId !== 'undefined' && editId) return;
  const input = $(campo === 'tel' ? '#fTelefone' : '#fPlaca'); if (!input) return;
  const bruto = input.value.trim();
  const q = campo === 'tel' ? (U.telE164(bruto) || '') : bruto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const id = 'r6cAviso' + campo;
  $('#' + id)?.remove();
  if (campo === 'tel' ? q.length < 10 : !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(q)) return;
  try {
    const r = await api6('/api/busca-tudo?q=' + encodeURIComponent(q) + '&limite=3');
    if (input.value.trim() !== bruto) return;
    const itens = ['patio', 'orcamentos', 'conversas', 'agendamentos'].flatMap(g => (r.grupos[g] || []).filter(i => i.link).map(i => ({ ...i, g })));
    if (!itens.length) return;
    $('#' + id)?.remove();
    const el = document.createElement('div'); el.id = id; el.className = 'r6c-novo-aviso'; el.setAttribute('role', 'status');
    el.innerHTML = `<b>${campo === 'tel' ? 'Este telefone' : 'Esta placa'} já aparece em outros sistemas:</b> ` + itens.slice(0, 5).map((i, n) => `<button type="button" class="link-btn" data-r6n="${n}">${ICONE_GRUPO6[i.g]} ${esc(i.titulo || i.nome)}</button>`).join(' · ');
    el.addEventListener('click', ev => { const b = ev.target.closest('[data-r6n]'); if (b) { const i = itens[Number(b.dataset.r6n)]; abrirSeguro6(i.link, i.app); } });
    (input.closest('label') || input).insertAdjacentElement('afterend', el);
  } catch { /* o aviso é um extra: sem ele o cadastro segue */ }
}
$('#fTelefone')?.addEventListener('change', () => avisarOutrosSistemas6('tel'));
$('#fPlaca')?.addEventListener('change', () => avisarOutrosSistemas6('placa'));
const _abrirModalR6c = abrirModal;
abrirModal = async function (id, pre) { $('#r6cAvisotel')?.remove(); $('#r6cAvisoplaca')?.remove(); const r = await _abrirModalR6c(id, pre); if (!id && pre?.telefone) setTimeout(() => avisarOutrosSistemas6('tel'), 50); return r; };

/* Ficha aberta: C registra contato, W abre a conversa, P o Pátio, Q o orçamento que pede ação */
document.addEventListener('keydown', e => {
  if (!modal.classList.contains('open') || !LEAD_ABERTO || $('dialog[open]') || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const l = leadPorId6(LEAD_ABERTO); if (!l) return;
  const k = e.key.toLowerCase(), c = C6.lead === l.id ? C6.con : null;
  if (k === 'c') { e.preventDefault(); registrarContato6(l.id); }
  if (k === 'w') { const t = U.telE164(l.telefone); if (t) { e.preventDefault(); abrirApp6('atendimento', '/?tel=' + t); } }
  if (k === 'p') { e.preventDefault(); const car = c?.patio?.carros?.[0]; if (car?.link) abrirSeguro6(car.link, 'patio'); else toast('Esse contato não tem carro no Pátio agora.'); }
  if (k === 'q') { e.preventDefault(); const o = c?.orcamentos?.itens?.[0]; if (o) abrirSeguro6(o.link_equipe, 'orcador'); else toast('Esse contato não tem orçamento no Orçador.'); }
}, true);

/* ================= lote 3: mensagens prontas com os links da casa ================= */
const primeiroNome6c = n => { const p = String(n || '').trim().split(/\s+/)[0]; return p && !/família|familia|cliente/i.test(p) ? p : ''; };
const conversaLink6 = l => { const t = U.telE164(l.telefone); return t ? A6.urlApp('atendimento', '/?tel=' + t) : null; };
/** Textos sem preço e no vocabulário da casa; quem manda é a pessoa (copia o texto e cola na conversa do Atendimento). */
function textosProntos6(l, c) {
  const oi = primeiroNome6c(l.nome) ? `Oi, ${primeiroNome6c(l.nome)}!` : 'Oi!';
  const out = [];
  const car = c?.patio?.carros?.[0];
  if (car?.link_cliente) out.push({ k: 'acompanhar', rotulo: '🟢 Mandar o link para acompanhar o carro', texto: `${oi} Aqui é da IndyCar. Você pode acompanhar o seu carro direto por aqui, a hora que quiser: ${car.link_cliente}` });
  const o = (c?.orcamentos?.itens || []).find(x => x.link_cliente && ['enviado', 'parado', 'visto'].includes(x.situacao.cod));
  if (o) out.push({ k: 'orcamento', rotulo: '🟢 Mandar o link do orçamento', texto: `${oi} Aqui é da IndyCar. Segue o link do seu orçamento, você vê os itens e responde por lá mesmo: ${o.link_cliente}. Qualquer dúvida é só falar. Quem conhece, Indyca! 🏎` });
  const pa = (c?.pre_agendamentos || []).find(x => !x.passou);
  if (pa) out.push({ k: 'horario', rotulo: '🟢 Confirmar o horário pedido', texto: `${oi} Aqui é da IndyCar. Recebi o seu pedido de horário para ${dataCurta6(pa.quando)} às ${pa.hora}. Posso confirmar? A gente atende de segunda a sábado, das 8h às 17h30.` });
  return out.filter(x => !/R\$|prezad|efetuar|comparecer|ve[ií]culo/i.test(x.texto));
}
const _pintarConexoes6c3 = pintarConexoes6;
pintarConexoes6 = function (c, l) {
  _pintarConexoes6c3(c, l);
  if (!c || !l) return;
  const conv = conversaLink6(l);
  const msgs = textosProntos6(l, c);
  if (!msgs.length || !conv) return;
  $('#r6cPainel').insertAdjacentHTML('beforeend', `<div class="r6c-bloco"><h4>💬 Mensagens prontas <small>copie o texto e cole na conversa do Atendimento; você revisa e envia</small></h4><div class="r6c-linha-acao">${msgs.map(x => `<button type="button" class="acao" data-r6c="copiar" data-txt="${esc(x.texto)}" title="Copiar mensagem">${esc(x.rotulo.replace(/^\S+\s*/, '📋 Copiar: '))}</button>`).join('')}<a class="acao acao-forte" href="${esc(conv)}">💬 Abrir conversa</a></div></div>`);
};
if (C6.con && C6.lead) pintarConexoes6(C6.con, leadPorId6(C6.lead));
