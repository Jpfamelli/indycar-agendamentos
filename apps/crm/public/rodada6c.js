// Rodada 6, segunda leva (C5, 21/10/2026): o lead mostra o que os outros sistemas sabem AGORA
// (orçamento no Orçador, carro no Pátio, pré-agendamento, observações do site), a fila "Hoje" ganha
// o último contato e os carros sem lead, a busca (Ctrl+K) acha em todos os sistemas, o gestor vê
// "Agora na casa" e as ligações quebradas, e o contato pode ser registrado em lote.
// Carrega depois de rodada6.js; usa o escopo global (api6, post6, abrirNomeada6, esc, brl, quando6 …).
'use strict';

const C6 = { con: null, lead: null, em: 0, ger: 0, assinatura: '', carros: null, agora: null };
const HOSTS_OK6 = (() => { const s = new Set(['wa.me']); try { for (const h of Object.values(A6.HOSTS || {})) s.add(new URL(h).hostname); } catch { /* segue */ } return s; })();
/** Só abre http(s) da própria origem, de um app da casa ou do WhatsApp. */
function urlSegura6(href) {
  let u; try { u = new URL(String(href || ''), location.href); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.origin !== location.origin && !HOSTS_OK6.has(u.hostname)) return null;
  return u.href;
}
const appDaUrl6 = href => { try { return appDoLink6(href); } catch { return null; } };
function abrirSeguro6(href, app) {
  const u = urlSegura6(href); if (!u) { toast('Esse endereço não é de um sistema da casa.'); return; }
  if (u.startsWith('https://wa.me/')) { window.open(u, '_blank', 'noopener'); return; }
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
  if (a === 'copiar') navigator.clipboard.writeText(b.dataset.txt).then(() => toast('Link copiado'), () => toast('Não consegui copiar.'));
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
    partes.push(`<div class="r6c-faixa patio${carro.etapa === 'pronto' ? ' ok' : ''}" role="status"><b>🚗 CARRO NO PÁTIO AGORA</b> · ordem nº ${esc(carro.numero ?? '')} · <b>${esc(carro.etapa_rotulo)}</b>${carro.etapa_em ? ' desde ' + esc(quando6(carro.etapa_em)) : ''}${carro.previsao_entrega ? ' · previsão ' + esc(quando6(carro.previsao_entrega)) : ''}${carro.link ? ` <button type="button" class="acao" data-r6c="abrir" data-app="patio" data-url="${esc(carro.link)}">Abrir no Pátio</button>` : ''}</div>`);
  } else if (site.carro_no_patio) {
    partes.push(`<div class="r6c-faixa suave" role="status"><b>🚗 O site avisou: carro no pátio</b>${site.carro_no_patio.os_numero ? ' (ordem nº ' + esc(site.carro_no_patio.os_numero) + (site.carro_no_patio.etapa_rotulo ? ', ' + esc(site.carro_no_patio.etapa_rotulo) : '') + ')' : ''} quando o lead chegou. <span class="muted">Hoje o carro não está mais no Pátio.</span></div>`);
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
    partes.push(`<div class="r6c-bloco vazio"><small class="muted">🧾 Nenhum orçamento deste cliente no Orçador ainda.</small>${c.links?.novo_orcamento && !trava ? ` <button type="button" class="acao" data-r6c="abrir" data-app="orcador" data-url="${esc(c.links.novo_orcamento)}">Criar orçamento com os dados do lead</button>` : ''}</div>`);
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
  if (resumo) resumo.insertAdjacentHTML('beforeend', `${d.total > (d.mostrando || d.itens.length) ? ` <span class="muted">· mostrando os ${d.mostrando} mais urgentes de ${d.total}</span>` : ''}${escondidos ? ` <button type="button" class="r6-chip-btn" data-h6c="mostrar">🙈 ${escondidos} oculto${escondidos === 1 ? '' : 's'} por hoje · mostrar</button>` : ''} <button type="button" class="r6-chip-btn" data-h6c="copiar-lista" title="Copia nome, telefone e motivo para colar onde você anota as ligações">📋 Copiar lista para ligar</button>`);
  if (!d.itens.length && todos.length) $('#hojeLista').innerHTML = '<p class="vazio-curto"><strong>Você escondeu a fila toda por hoje.</strong><br>Clique em “mostrar” acima para ver de novo.</p>';
  else if (!todos.length && d.escopo === 'sem') $('#hojeLista').innerHTML = '<p class="vazio-curto"><strong>Nenhum lead sem responsável pedindo ação. 🏁</strong><br>Quem chega sem dono aparece aqui.</p>';
  else if (!todos.length && d.escopo === 'meus') $('#hojeLista').innerHTML = '<p class="vazio-curto"><strong>Seus leads estão em dia. 🏁</strong><br>Troque para “Sem responsável” para pegar leads parados de ninguém.</p>';
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
  alvo.innerHTML = c.sem_lead_total ? `<h4>🚗 Carros na oficina sem lead no CRM (${c.sem_lead_total})</h4><p class="muted mini-nota">O cliente está com o carro aí dentro e ninguém acompanha como venda. Crie o lead para o resto do funil enxergar.</p>` + c.sem_lead.map(x => `<div class="r6-linha"><div><strong>${esc(x.nome || 'Cliente sem nome')}</strong> <span class="muted">${esc(x.placa || '')}</span><div class="cell-sub">Ordem nº ${esc(x.numero ?? '')} · ${esc(x.etapa_rotulo)}${x.telefone ? ' · ' + esc(U.formatarTelefone(x.telefone)) : ''}</div></div>
    <div class="r6-acoes">${x.link ? `<button type="button" class="acao" data-r6c="abrir" data-app="patio" data-url="${esc(x.link)}">🔧 Pátio</button>` : ''}<button type="button" class="acao acao-forte" data-h6c="criar-lead" data-tel="${esc(x.telefone || '')}" data-nome="${esc(x.nome || '')}" data-placa="${esc(x.placa || '')}" data-os="${esc(x.numero ?? '')}">Criar lead</button></div></div>`).join('') : '';
}
document.addEventListener('click', e => { const b = e.target.closest('#hojeCarros [data-r6c]'); if (b && b.dataset.r6c === 'abrir') abrirSeguro6(b.dataset.url, b.dataset.app); });
(function montarHoje6c() {
  const lista = $('#hojeLista'); if (lista && !$('#hojeCarros')) lista.insertAdjacentHTML('afterend', '<div id="hojeCarros" class="r6c-carros"></div>');
})();
document.addEventListener('indycar:aba', e => { if (e.detail.aba === 'hoje') carregarCarrosSemLead6(); if (e.detail.aba === 'dono') carregarAgora6(); });

/* título da aba mostra quantos pedem ação (ajuda a quem deixa o CRM aberto em outra aba) */
const _renderSeloHoje6c = renderSeloHoje6;
renderSeloHoje6 = function () {
  _renderSeloHoje6c();
  const c = R6.contagem, n = (c.esperando || 0) + (c.followup_vencido || 0) + (c.primeiro_contato || 0) + (c.entregue_fechar || 0) + (c.pre_agendamento || 0);
  const base = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = n ? `(${n}) ${base}` : base;
};

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
      toast(`📞 Contato registrado em ${r.registrados} lead${r.registrados === 1 ? '' : 's'}` + (r.de_colegas ? ` · ${r.de_colegas} de colega ficou de fora` : '') + (r.fechados ? ` · ${r.fechados} já fechado` : ''), 7000);
    } catch (e) { toast('⚠️ ' + e.message, 6000); }
  });
})();

/* ================= busca (Ctrl+K) também nos outros sistemas ================= */
const ROTULO_GRUPO6 = { clientes: 'Clientes', conversas: 'Conversas (Atendimento)', leads: 'Leads', agendamentos: 'Agenda', patio: 'Pátio', orcamentos: 'Orçador' };
const ICONE_GRUPO6 = { clientes: '🪪', conversas: '💬', leads: '🎯', agendamentos: '📅', patio: '🔧', orcamentos: '🧾' };
let busca6c = { ger: 0, itens: [] };
function montarBusca6c() {
  if ($('#buscaOutros')) return;
  $('#buscaResultados').insertAdjacentHTML('afterend', '<div id="buscaOutros" class="bg-resultados r6c-busca" aria-label="Resultados em outros sistemas"></div>');
  $('#buscaOutros').addEventListener('click', e => { const b = e.target.closest('[data-bo]'); if (!b) return; const it = busca6c.itens[Number(b.dataset.bo)]; if (it) { $('#dlgBusca').close(); abrirSeguro6(it.link, it.app); } });
}
async function buscarOutros6() {
  montarBusca6c();
  const alvo = $('#buscaOutros'), q = $('#buscaGlobal').value.trim(), ger = ++busca6c.ger;
  if (q.replace(/\s/g, '').length < 2) { alvo.innerHTML = ''; return; }
  alvo.innerHTML = '<p class="bg-nota">Procurando no Pátio, Orçador, Agenda e Atendimento…</p>';
  try {
    const r = await api6('/api/busca-tudo?q=' + encodeURIComponent(q) + '&limite=4');
    if (ger !== busca6c.ger) return;
    const itens = [];
    let html = '';
    for (const g of ['patio', 'orcamentos', 'agendamentos', 'conversas']) {
      const lista = (r.grupos[g] || []).filter(i => i.link);
      if (!lista.length) continue;
      html += `<h4 class="bg-grupo">${ICONE_GRUPO6[g]} ${ROTULO_GRUPO6[g]}</h4>` + lista.map(i => { itens.push(i); return `<button type="button" class="bg-item" role="option" data-bo="${itens.length - 1}"><span class="bg-ico" aria-hidden="true">${ICONE_GRUPO6[g]}</span><span class="bg-txt2"><strong>${esc(i.titulo || i.nome)}</strong><small>${esc(i.detalhe || '')}</small></span><span class="bg-meta">${i.status ? `<span class="tag">${esc(i.status)}</span>` : ''}<small>abre no ${esc(A6.NOMES[i.app] || i.app)} ↗</small></span></button>`; }).join('');
    }
    busca6c.itens = itens;
    alvo.innerHTML = html || '<p class="bg-nota">Nada nos outros sistemas.</p>';
  } catch (err) { if (ger === busca6c.ger) alvo.innerHTML = `<p class="bg-nota">Não consegui procurar nos outros sistemas agora (${esc(err.message)}).</p>`; }
}
$('#buscaGlobal').addEventListener('input', () => { clearTimeout(busca6c.t); busca6c.t = setTimeout(buscarOutros6, 350); });
$('#btnBuscaGlobal').addEventListener('click', () => { montarBusca6c(); $('#buscaOutros').innerHTML = ''; });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { montarBusca6c(); $('#buscaOutros').innerHTML = ''; } }, true);

/* ================= Dono: Agora na casa, tempo até o primeiro contato, ligações quebradas ================= */
async function carregarAgora6() {
  if (!SOU_GESTOR) return;
  let blo = $('#donoAgora'); const corpo = $('#donoCorpo'); if (!corpo) return;
  if (!blo) { blo = document.createElement('div'); blo.id = 'donoAgora'; blo.className = 'ficha-bloco'; corpo.before(blo); }
  blo.innerHTML = '<h4>Agora na casa</h4><div class="skeleton"></div>';
  try {
    const a = C6.agora = await api6('/api/agora'), k = a.kpis;
    const kpi = (t, v, alerta) => `<div class="ficha-kpi${alerta && v ? ' alerta' : ''}"><span>${t}</span><b>${v}</b></div>`;
    blo.innerHTML = `<h4>Agora na casa <small class="muted">Pátio · Orçador · Atendimento · Agenda, ao vivo</small></h4>
      <div class="ficha-kpis">${kpi('Carros no pátio', k.carros_no_patio)}${kpi('Atrasados na etapa', k.carros_atrasados, true)}${kpi('Extras esperando o cliente', k.extras_pendentes, true)}${kpi('Prontos para retirar', k.prontos_esperando_retirada)}
        ${kpi('Orçamentos esperando', k.orcamentos_esperando)}${kpi('Aprovados sem horário', k.orcamentos_aprovados_sem_horario, true)}${kpi('Conversas sem resposta', k.conversas_sem_resposta, true)}${kpi('Horários hoje', k.agendamentos_hoje)}</div>
      ${a.valor_orcamentos_esperando ? `<p class="muted mini-nota">Orçamentos esperando resposta somam ${brl(a.valor_orcamentos_esperando)}.</p>` : ''}
      ${a.atencao.length ? `<ul class="r6-insights">${a.atencao.map(i => `<li class="${esc(i.nivel)}">${esc(i.texto)}</li>`).join('')}</ul>` : '<p class="muted mini-nota">Nada fora do normal agora. 🏁</p>'}`;
  } catch (e) { blo.innerHTML = `<h4>Agora na casa</h4><p class="vazio-curto">Não consegui ver a casa agora: ${esc(e.message)}</p>`; }
}
const _renderDono6c = renderDono6;
renderDono6 = function () {
  _renderDono6c();
  carregarAgora6();
  const d = D6.dados, pc = d?.primeiro_contato, alvo = $('#donoQualidade')?.closest('.ficha-bloco');
  if (alvo && pc && !$('#donoPrimeiro')) alvo.insertAdjacentHTML('beforebegin', `<div class="ficha-bloco" id="donoPrimeiro"><h4>Quanto demoramos para falar com o lead novo <small class="muted">últimos 14 dias</small></h4>
    <p>${pc.mediana_h != null ? `Metade dos leads recebe o primeiro contato em até <b>${pc.mediana_h} h</b>` : 'Ainda sem contato registrado nos leads recentes'} · <b>${pc.sem_contato}</b> de ${pc.leads} ainda sem contato.</p>
    ${pc.por_pessoa.length ? `<ul class="f360-lista">${pc.por_pessoa.map(x => `<li>${esc(x.nome)} · ${x.mediana_h != null ? x.mediana_h + ' h' : '—'} (${x.leads} lead${x.leads === 1 ? '' : 's'})</li>`).join('')}</ul>` : ''}</div>`);
  if (alvo && !$('#donoLigacoes')) alvo.insertAdjacentHTML('beforeend', '<div id="donoLigacoes"><button type="button" class="link-btn" id="donoLigBtn">Conferir ligações quebradas entre os sistemas</button></div>');
  $('#donoLigBtn')?.addEventListener('click', carregarLigacoes6);
};
async function carregarLigacoes6() {
  const el = $('#donoLigacoes'); el.innerHTML = '<div class="skeleton"></div>';
  try {
    const r = await api6('/api/ligacoes-quebradas');
    const ruins = r.verificacoes.filter(v => v.quantidade);
    el.innerHTML = ruins.length ? `<h4>Ligações quebradas entre os sistemas (${r.total_problemas})</h4><ul class="f360-lista">${ruins.map(v => `<li><b>${v.quantidade}</b> · ${esc(v.descricao)} <span class="tag">${esc(v.app)}</span></li>`).join('')}</ul>` : '<p>Todas as ligações entre Agenda, Pátio, Orçador e CRM estão em ordem. 🏁</p>';
  } catch (e) { el.innerHTML = `<p class="vazio-curto">${esc(e.message)}</p>`; }
}
