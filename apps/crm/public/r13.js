/* Rodada 13 (22/11/2026): a aba Hoje vira a tela de entrada, com o resumo do dia no estilo
   do herói do Tráfego, e o valor do serviço fechado fica fácil de lançar e de ver
   (Hoje, lista de Contatos, Funil e ficha). O Tráfego soma o retorno dos anúncios por esse valor.
   As contas ficam em r13-resumo.js (CrmR13). Nada aqui manda mensagem a ninguém. */
const R13 = CrmR13;
const R13_MAX_VALORES = 6;
const r13Dia = d => new Date(d).toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'}).replace('.', '');
const r13Frase = partes => partes.map(p => 'n' in p ? `<b>${esc(p.moeda ? brl(p.n) : p.n)}</b>` : esc(p.t)).join('');

/* ---------- lançar o valor de um serviço fechado ---------- */
async function lancarValor13(id, valor, cortesia) {
  const l = TODOS.find(x => String(x.id) === String(id)); if (!l) return false;
  const trava = travaLead(l); if (trava) { toast('🔒 ' + trava, 6000); return false; }
  if (!cortesia && !(Number(valor) > 0 && Number(valor) <= 10000000)) { toast('Informe quanto o cliente pagou (ou marque cortesia).'); return false; }
  const antes = {valor_pago: l.valor_pago ?? 0, observacoes: l.observacoes ?? ''};
  const corpo = cortesia ? {valor_pago: 0, observacoes: R4.comCortesia(l.observacoes)} : {valor_pago: Math.round(Number(valor) * 100) / 100};
  try {
    substituirLocal(await patchLead(l.id, corpo) || {...l, ...corpo});
    redesenhar();
    toastAcao(cortesia ? `${l.nome}: marcado como cortesia` : `${l.nome}: ${brl(corpo.valor_pago)} lançado`, 'Desfazer', async () => {
      substituirLocal(await patchLead(l.id, antes)); redesenhar(); toast('Valor desfeito');
    }, 9000);
    return true;
  } catch (e) { toast('⚠️ ' + e.message); redesenhar(); return false; }
}
/* Abre o diálogo "Quanto o cliente pagou?" (com as sugestões) e grava. */
async function pedirValor13(id) {
  const l = TODOS.find(x => String(x.id) === String(id)); if (!l) return false;
  const trava = travaLead(l); if (trava) { toast('🔒 ' + trava, 6000); return false; }
  const p = perguntarPagoDetalhe(l);
  $('#pagoPendente').hidden = true;                    // aqui "não sei agora" é só cancelar
  const r = await p; if (!r) return false;
  if (!r.cortesia && !(r.valor > 0)) return false;
  return lancarValor13(id, r.valor, r.cortesia);
}

/* ---------- tela Hoje: o resumo do dia ---------- */
function renderHoje13() {
  if (!$('#r13Heroi') || !PERFIL?.id || typeof TODOS === 'undefined') return;
  const agora = Date.now(), r = R13.resumoHoje(TODOS, agora, {euId: PERFIL.id, gestor: SOU_GESTOR});
  const ret = R13_RET;
  $('#r13Data').textContent = `Hoje · ${new Date(agora).toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: '2-digit'})} · ${SOU_GESTOR ? 'a loja toda' : 'os seus contatos'}`;
  $('#r13Frase').innerHTML = r13Frase(R13.fraseHoje(r, ret));
  const num = (n, rot, ir, alerta) => `<button type="button" class="r13-num${alerta ? ' alerta' : ''}" data-r13-ir="${ir}"><b>${esc(n)}</b><span>${esc(rot)}</span></button>`;
  $('#r13Nums').innerHTML = num(r.novos, r.novos === 1 ? 'contato novo' : 'contatos novos', 'novos') +
    num(ret ?? '—', ret === 1 ? 'pede retorno' : 'pedem retorno', 'retorno') +
    num(r.faltaValor.length, 'sem valor lançado', 'valor', r.faltaValor.length > 0);
  $('#r13Caixa').innerHTML = `<div class="r13-cx"><span>Fechado hoje</span><b>${esc(brl(r.faturouHoje))}</b><small>${r.fechados} serviço${r.fechados === 1 ? '' : 's'} concluído${r.fechados === 1 ? '' : 's'}</small></div>
    <div class="r13-cx"><span>Em aberto no funil</span><b>${esc(brl(r.emAberto))}</b><small>${r.abertos} contato${r.abertos === 1 ? '' : 's'} em andamento</small></div>`;
  renderValores13(r.faltaValor);
  renderGrafico13(agora);
  renderEtapas13(r);
}
function renderValores13(lista) {
  const n = lista.length;
  $('#r13Valores').classList.toggle('em-dia', !n);
  $('#r13Lote').hidden = !(SOU_GESTOR && n > 1);
  $('#r13ValoresSub').textContent = n
    ? `${n} serviço${n === 1 ? ' fechado está' : 's fechados estão'} sem valor. Sem ele, o Tráfego não sabe quanto os anúncios trouxeram.`
    : '';
  if (!n) { $('#r13ValoresLista').innerHTML = '<div class="r13-vazio"><span class="r13-ok" aria-hidden="true"></span><div><strong>Todo serviço fechado tem valor.</strong><p>O faturamento e o retorno dos anúncios estão completos.</p></div></div>'; return; }
  $('#r13ValoresLista').innerHTML = lista.slice(0, R13_MAX_VALORES).map(l => {
    const sug = R4.sugestoesValor(l, l._sugestoes || {})[0], trava = travaLead(l);
    const quando = l.closed_at ? 'fechado em ' + new Date(l.closed_at).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) : 'concluído';
    return `<form class="r13-v" data-id="${esc(l.id)}">
      <button type="button" class="r13-v-quem" data-r13-abrir="${esc(l.id)}"><strong>${esc(l.nome)}</strong><small>${esc([l.servico, l.carro_modelo, quando].filter(Boolean).join(' · '))}</small></button>
      ${trava ? `<span class="tag selo-dono" title="${esc(trava)}">🔒 de colega</span>` : `<div class="r13-v-campos">
        <label class="r13-v-valor"><span aria-hidden="true">R$</span><input type="number" min="0.01" max="10000000" step="0.01" inputmode="decimal" placeholder="${sug ? esc(String(sug.valor).replace('.', ',')) : '0,00'}" aria-label="Valor pago por ${esc(l.nome)}"></label>
        <button type="submit" class="btn btn-primary">Lançar</button>
        <button type="button" class="btn btn-ghost" data-r13-cortesia>Cortesia</button>
        ${sug ? `<button type="button" class="r13-sug" data-r13-sug="${esc(sug.valor)}" title="${esc(sug.rotulo)}">usar ${esc(brl(sug.valor))}</button>` : ''}
      </div>`}</form>`;
  }).join('') + (n > R13_MAX_VALORES ? `<button type="button" class="link-btn r13-mais" data-r13-ir="lista-sem-valor">Ver os outros ${n - R13_MAX_VALORES} na lista</button>` : '');
}
function renderGrafico13(agora) {
  const dias = R13.entradasPorDia(TODOS, agora, 14), max = Math.max(1, ...dias.map(d => Math.max(d.entraram, d.fecharam)));
  const W = 560, H = 170, base = 140, larg = W / dias.length, bw = Math.min(14, larg / 3);
  const alt = v => Math.round((v / max) * 116);
  $('#r13Grafico').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="r13-svg" role="img" aria-label="Contatos que entraram e serviços fechados por dia, nos últimos 14 dias">
    <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="r13-eixo"/>
    ${dias.map((d, i) => { const x = i * larg + larg / 2; return `<g class="r13-dia${d.hoje ? ' hoje' : ''}" data-i="${i}" tabindex="0" aria-label="${esc(r13Dia(d.ini))}: ${d.entraram} entraram, ${d.fecharam} fecharam serviço">
      <rect class="r13-alvo" x="${i * larg}" y="0" width="${larg}" height="${H}"/>
      <rect class="r13-b-ent" x="${x - bw - 1}" y="${base - alt(d.entraram)}" width="${bw}" height="${alt(d.entraram)}" rx="3"/>
      <rect class="r13-b-fec" x="${x + 1}" y="${base - alt(d.fecharam)}" width="${bw}" height="${alt(d.fecharam)}" rx="3"/>
      ${i % 2 === dias.length % 2 || d.hoje ? `<text x="${x}" y="${H - 8}" text-anchor="middle">${d.hoje ? 'hoje' : esc(new Date(d.ini).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}))}</text>` : ''}</g>`; }).join('')}
  </svg>`;
  const ler = i => { const d = dias[i]; if (d) $('#r13Leitura').innerHTML = `<b>${esc(d.hoje ? 'Hoje' : r13Dia(d.ini))}</b> · ${d.entraram} entraram · ${d.fecharam} fecharam serviço`; };
  ler(dias.length - 1);
  const svg = $('#r13Grafico svg');
  const pegar = e => { const g = e.target.closest?.('.r13-dia'); if (g) { $$('.r13-dia.lendo', svg).forEach(x => x.classList.remove('lendo')); g.classList.add('lendo'); ler(Number(g.dataset.i)); } };
  svg.addEventListener('pointerover', pegar); svg.addEventListener('focusin', pegar); svg.addEventListener('click', pegar);
}
function renderEtapas13(r) {
  $('#r13FunilTxt').textContent = `${r.abertos} em andamento · ${brl(r.emAberto)} orçado`;
  const max = Math.max(1, ...r.porEtapa.map(e => e.qtd));
  $('#r13Etapas').innerHTML = r.porEtapa.map(e => `<button type="button" class="r13-etapa" data-r13-ir="funil" aria-label="${esc(LABEL_STATUS[e.etapa])}: ${e.qtd} contatos, ${esc(brl(e.valor))}">
    <span class="r13-e-nome">${esc(LABEL_STATUS[e.etapa] ?? e.etapa)}</span><b>${e.qtd}</b><small>${esc(brl(e.valor))}</small>
    <i class="r13-e-barra"><i style="width:${Math.round(e.qtd / max * 100)}%"></i></i></button>`).join('');
}

/* ---------- cliques da tela Hoje ---------- */
$('#view-hoje').addEventListener('click', async e => {
  const abrir = e.target.closest('[data-r13-abrir]'); if (abrir) { abrirModal(abrir.dataset.r13Abrir); return; }
  const sug = e.target.closest('[data-r13-sug]'); if (sug) { const i = sug.closest('form').querySelector('input'); i.value = sug.dataset.r13Sug; i.focus(); return; }
  const cort = e.target.closest('[data-r13-cortesia]');
  if (cort) { const f = cort.closest('form'); if (confirm('Marcar este serviço como cortesia (sem cobrança)?')) { cort.disabled = true; await lancarValor13(f.dataset.id, 0, true); cort.disabled = false; } return; }
  const ir = e.target.closest('[data-r13-ir]'); if (!ir) return;
  const alvo = ir.dataset.r13Ir;
  if (alvo === 'novos') { $('#ordemLeads').value = 'recente'; irPara('leads'); if (typeof refiltrarTela === 'function') refiltrarTela(); else redesenhar(); }
  if (alvo === 'retorno') $('#hojeLista').closest('.card').scrollIntoView({behavior: 'smooth', block: 'start'});
  if (alvo === 'valor') $('#r13Valores').scrollIntoView({behavior: 'smooth', block: 'start'});
  if (alvo === 'funil') irPara('pipeline');
  if (alvo === 'lista-sem-valor') $('#svVer').click();
});
$('#view-hoje').addEventListener('submit', async e => {
  const f = e.target.closest('form.r13-v'); if (!f) return;
  e.preventDefault();
  const i = f.querySelector('input'), v = Number(String(i.value).replace(',', '.'));
  if (i.value === '' || !(v > 0) || v > 10000000) { i.setAttribute('aria-invalid', 'true'); i.focus(); toast('Digite quanto o cliente pagou. Se não cobrou nada, use Cortesia.'); return; }
  const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Lançando…';
  if (!await lancarValor13(f.dataset.id, v, false)) { b.disabled = false; b.textContent = 'Lançar'; }
});
$('#r13Lote').addEventListener('click', () => abrirValores());

/* ---------- Painel: a frase do período ---------- */
function renderFrasePainel13() {
  const el = $('#r13FrasePainel'); if (!el || typeof PERIODO === 'undefined') return;
  let P; try { P = U.periodo(PERIODO.chave, new Date(), PERIODO.ini, PERIODO.fim); } catch { el.textContent = ''; return; }
  const m = U.metricas(TODOS, P.ini, P.fim);
  el.innerHTML = r13Frase(R13.frasePeriodo(m, R13.rotuloPeriodo(PERIODO.chave)));   // o "sem valor" já tem o cartão logo abaixo
}

/* ---------- valor visível na lista, no funil e na ficha ---------- */
const _celula13 = celula;
celula = function (c, l, agora) {
  if (c === 'valor' && R13.semValor(l)) return `<td class="num"><button type="button" class="r13-lancar" data-lancar="${esc(l.id)}">Lançar valor</button></td>`;
  return _celula13(c, l, agora);
};
const _cartao13 = cartaoKanban;
cartaoKanban = function (l, agora) {
  const html = _cartao13(l, agora);
  if (!R13.semValor(l) || travaLead(l)) return html;
  return html.replace('<select class="kb-etapa"', `<button type="button" class="r13-lancar kb-lancar" data-lancar="${esc(l.id)}">Lançar valor</button><select class="kb-etapa"`);
};
for (const sel of ['#tblLeads', '#kanban']) {
  $(sel).addEventListener('click', e => {
    const b = e.target.closest('[data-lancar]'); if (!b) return;
    e.stopPropagation(); e.preventDefault(); pedirValor13(b.dataset.lancar);
  }, true);
}
const _fichaLead13 = renderFichaLead;
renderFichaLead = function (l) {
  _fichaLead13(l);
  let box = $('#r13FichaValor');
  if (!box) { box = document.createElement('div'); box.id = 'r13FichaValor'; box.className = 'r13-ficha-valor'; $('#lfTopo').after(box); }
  if (l.status !== 'concluido') { box.hidden = true; return; }
  box.hidden = false;
  const falta = R13.semValor(l), cort = R4.ehCortesia(l.observacoes), trava = travaLead(l);
  box.classList.toggle('falta', falta);
  box.innerHTML = falta
    ? `<div><b>Falta o valor deste serviço</b><small>Sem ele, o Tráfego não sabe quanto os anúncios trouxeram.</small></div>${trava ? '' : '<button type="button" class="btn btn-primary" data-r13-ficha>Lançar valor</button>'}`
    : `<div><span>Valor do serviço</span><b>${cort ? 'Cortesia' : esc(brl(l.valor_pago))}</b>${cort ? '<small>sem cobrança</small>' : ''}</div>${trava ? '' : '<button type="button" class="btn btn-ghost" data-r13-ficha>Corrigir</button>'}`;
  if (falta) { const v = $('#lfTopo .lf-valor'); if (v) { v.querySelector('span').textContent = 'Valor'; v.querySelector('b').textContent = 'falta lançar'; v.classList.add('r13-falta'); } }
};
document.addEventListener('click', e => { if (e.target.closest('[data-r13-ficha]') && LEAD_ABERTO) pedirValor13(LEAD_ABERTO); });

/* ---------- ganchos: redesenhar, painel e a fila do dia ---------- */
const _redesenhar13 = redesenhar;
redesenhar = function () { _redesenhar13(); renderHoje13(); };
const _painel13 = renderPainel;
renderPainel = function () { _painel13(); renderFrasePainel13(); renderHoje13(); };
/* A fila do dia mostra os 10 primeiros; o resto abre num toque (antes a página ficava enorme).
   O número "pedem retorno" do resumo só muda com a fila sem busca nem filtro. */
let R13_RET = null, R13_FILA_TODA = false;
const R13_FILA_VISIVEIS = 10;
function encurtarFila13() {
  const lista = $('#hojeLista'); if (!lista) return;
  const linhas = [...lista.children].filter(x => x.classList.contains('r6-linha'));
  linhas.forEach((x, i) => { x.hidden = !R13_FILA_TODA && i >= R13_FILA_VISIVEIS; });
  if (linhas.length > R13_FILA_VISIVEIS && !R13_FILA_TODA) lista.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-ghost r13-fila-mais" data-r13-fila>Mostrar os outros ${linhas.length - R13_FILA_VISIVEIS} da fila</button>`);
}
const _hoje6_13 = renderHoje6;
renderHoje6 = function () {
  _hoje6_13();
  const d = H6.dados, filtrado = H6.motivo || (typeof R7 !== 'undefined' && (R7.hoje.q || R7.hoje.origem));
  if (d && !filtrado && Number.isFinite(d.total)) R13_RET = d.total;
  encurtarFila13();
  // os retornos combinados (rodada 7) entram depois da fila, não em cima do resumo
  const ret = $('#r7Retornos'), fila = $('#hojeLista')?.closest('.card');
  if (ret && fila && fila.nextElementSibling !== ret) fila.after(ret);
  renderHoje13();
};
$('#hojeLista').addEventListener('click', e => { if (e.target.closest('[data-r13-fila]')) { R13_FILA_TODA = true; renderHoje6(); } });
document.addEventListener('indycar:aba', e => { if (e.detail.aba === 'hoje') renderHoje13(); });
