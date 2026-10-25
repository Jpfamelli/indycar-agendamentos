/* ============================================================================
   Agenda — Rodada 7 / C2, lote 6: RELATÓRIOS DO DONO (ocupação, faltas, por consultor, origem).
   Tela só do gestor. Os números vêm prontos de GET /api/relatorios/dono (relatorios.js); aqui só se desenha.
   ============================================================================ */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const escH = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lerLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  const LS = 'indycar_r7_rel_periodo';
  const reais = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));
  const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const hojeSP = () => (typeof agoraSP === 'function' ? agoraSP().data : new Date().toISOString().slice(0, 10));

  const PERIODOS = [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['mespassado', 'Mês passado']];
  /** { inicio, fim } de cada atalho de período, em relação a "hoje". */
  function intervaloDe(id, hoje) {
    if (id === '7') return { inicio: maisDias(hoje, -6), fim: hoje };
    if (id === 'mes') return { inicio: hoje.slice(0, 8) + '01', fim: hoje };
    if (id === 'mespassado') {
      const primeiro = hoje.slice(0, 8) + '01', fimMes = maisDias(primeiro, -1);
      return { inicio: fimMes.slice(0, 8) + '01', fim: fimMes };
    }
    return { inicio: maisDias(hoje, -29), fim: hoje };
  }

  const seta = (v, bomSeSobe, unidade = '') => {
    if (v === null || v === undefined || v === 0) return '<small class="muted r7r-delta">igual ao período anterior</small>';
    const sobe = v > 0, bom = bomSeSobe ? sobe : !sobe;
    return `<small class="r7r-delta ${bom ? 'bom' : 'ruim'}">${sobe ? '▲' : '▼'} ${num(Math.abs(v))}${unidade} que antes</small>`;
  };
  const barra = (pct, max, tom) => `<span class="r7r-trilho" aria-hidden="true"><span class="r7r-barra ${tom || ''}" style="width:${Math.max(0, Math.min(100, max ? (pct / max) * 100 : 0))}%"></span></span>`;
  const tomOcupacao = (p) => (p === null ? '' : p >= 85 ? 'cheio' : p >= 40 ? 'bom' : 'vazio');

  function cartaoKpi(rot, valor, sub, extra) {
    return `<div class="r7r-kpi"><span class="r7r-kpi-rot">${escH(rot)}</span><b class="r7r-kpi-val">${valor}</b>${sub ? `<small class="muted">${sub}</small>` : ''}${extra || ''}</div>`;
  }

  function html(r) {
    const t = r.totais, c = r.comparacao || {};
    const kpis = [
      cartaoKpi('Horários marcados', escH(t.marcados), `${escH(r.periodo.dias_abertos)} dias de oficina aberta`, seta(c.marcados, true)),
      cartaoKpi('Vieram', t.taxa_comparecimento === null ? '—' : escH(num(t.taxa_comparecimento)) + '%', `${escH(t.vieram)} de ${escH(t.vieram + t.faltas)} que já tiveram desfecho`),
      cartaoKpi('Faltaram', t.taxa_falta === null ? '—' : escH(num(t.taxa_falta)) + '%', `${escH(t.faltas)} falta${t.faltas === 1 ? '' : 's'}`, seta(c.taxa_falta, false, ' p.p.')),
      cartaoKpi('Ocupação da agenda', t.ocupacao_pct === null ? '—' : escH(num(t.ocupacao_pct)) + '%', `${escH(t.horas_perdidas_por_faltas)} h paradas por faltas`, seta(c.ocupacao_pct, true, ' p.p.')),
      cartaoKpi('Confirmados', t.pct_confirmados === null ? '—' : escH(num(t.pct_confirmados)) + '%', `${escH(t.confirmados)} de ${escH(t.marcados)} confirmaram`),
      cartaoKpi('Fechado', escH(reais(t.faturado)), t.ticket_medio ? `ticket médio ${escH(reais(t.ticket_medio))}${t.concluidos_sem_valor ? ' · ' + t.concluidos_sem_valor + ' sem valor' : ''}` : `${escH(t.concluidos)} serviços`, seta(c.faturado === null || c.faturado === undefined ? null : c.faturado, true)),
    ].join('');
    const dest = (r.destaques || []).map((d) => `<li>${escH(d)}</li>`).join('');
    const maxDia = Math.max(100, ...r.porDia.map((d) => d.pct_com_faltas || 0));
    const dias = r.porDia.length ? `<ol class="r7r-dias" aria-label="Ocupação por dia">${r.porDia.map((d) => `<li title="${escH(d.dow)} ${escH(dm(d.data))}: ${escH(d.marcados)} horários, ${escH(num(d.pct))}% ocupado, ${escH(d.faltas)} falta(s)">
        <span class="r7r-dia-rot"><b>${escH(d.dow)}</b> ${escH(dm(d.data))}</span>${barra(d.pct || 0, maxDia, tomOcupacao(d.pct))}<span class="r7r-dia-val">${escH(num(d.pct))}%</span><small class="muted">${escH(d.marcados)}${d.faltas ? ` · <span class="r7r-ruim">${escH(d.faltas)} falta${d.faltas > 1 ? 's' : ''}</span>` : ''}</small></li>`).join('')}</ol>` : '<p class="muted">Nenhum dia de oficina aberta neste período.</p>';
    const semana = `<ul class="r7r-lista">${r.porDiaSemana.filter((d) => d.dias > 0).map((d) => `<li><span class="r7r-rot">${escH(d.dia)}</span>${barra(d.pct || 0, 100, tomOcupacao(d.pct))}<span class="r7r-val">${escH(num(d.pct))}%</span></li>`).join('')}</ul>`;
    const cons = r.porConsultor.length ? `<table class="r7r-tab"><thead><tr><th>Consultor</th><th>Horários</th><th>Ocupação</th><th>Faltas</th><th>Fechado</th></tr></thead><tbody>${r.porConsultor.map((k) => `<tr>
        <td><b>${escH(k.consultor)}</b></td><td>${escH(k.marcados)}</td><td>${k.pct === null ? '—' : barra(k.pct, 100, tomOcupacao(k.pct)) + ' ' + escH(num(k.pct)) + '%'}</td>
        <td>${escH(k.faltas)}${k.taxa_falta !== null ? ` <small class="muted">(${escH(num(k.taxa_falta))}%)</small>` : ''}</td><td>${k.faturado ? escH(reais(k.faturado)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sem horários por consultor.</p>';
    const f = r.faltas, maxMot = Math.max(1, ...f.porMotivo.map((m) => m.n), f.semMotivo);
    const motivos = f.total ? `<ul class="r7r-lista">${f.porMotivo.filter((m) => m.n > 0).map((m) => `<li><span class="r7r-rot">${escH(m.rotulo)}</span>${barra(m.n, maxMot, 'ruim')}<span class="r7r-val">${escH(m.n)}</span></li>`).join('')}
        ${f.semMotivo ? `<li><span class="r7r-rot muted">Sem motivo anotado</span>${barra(f.semMotivo, maxMot, '')}<span class="r7r-val">${escH(f.semMotivo)}</span></li>` : ''}</ul>` : '<p class="muted">Nenhuma falta neste período. 🎉</p>';
    const conf = f.taxa_confirmados !== null && f.taxa_sem_confirmar !== null ? `<p class="r7r-conf">Quem <b>confirmou</b> faltou <b>${escH(num(f.taxa_confirmados))}%</b> · quem <b>não confirmou</b> faltou <b>${escH(num(f.taxa_sem_confirmar))}%</b>.</p>` : '';
    const maxH = Math.max(1, ...r.porHora.map((h) => h.marcados));
    const horas = `<ul class="r7r-lista r7r-horas">${r.porHora.map((h) => `<li><span class="r7r-rot">${escH(h.hora)}</span>${barra(h.marcados, maxH, '')}<span class="r7r-val">${escH(h.marcados)}</span></li>`).join('')}</ul>`;
    const origem = r.porOrigem.length ? `<table class="r7r-tab"><thead><tr><th>Origem</th><th>Horários</th><th>Faltas</th></tr></thead><tbody>${r.porOrigem.slice(0, 8).map((o) => `<tr><td>${escH(o.origem)}</td><td>${escH(o.marcados)}</td><td>${escH(o.faltas)}${o.taxa_falta !== null ? ` <small class="muted">(${escH(num(o.taxa_falta))}%)</small>` : ''}</td></tr>`).join('')}</tbody></table>` : '';
    const serv = r.porServico.length ? `<table class="r7r-tab"><thead><tr><th>Serviço</th><th>Horários</th><th>Faltas</th></tr></thead><tbody>${r.porServico.slice(0, 8).map((o) => `<tr><td>${escH(o.servico)}</td><td>${escH(o.marcados)}</td><td>${escH(o.faltas)}</td></tr>`).join('')}</tbody></table>` : '';
    return `<div class="r7r-kpis">${kpis}</div>
      <section class="panel r7r-sec"><div class="panel-head"><h3>Em poucas palavras</h3>
          <span class="r7r-acoes"><button type="button" class="btn mini primary" data-r7r-copiar>Copiar resumo</button> <button type="button" class="btn mini" data-r7r-csv>Baixar planilha</button> <button type="button" class="btn mini" data-r7r-imprimir>Imprimir</button></span></div>
        <div class="panel-body"><ul class="r7r-dest">${dest}</ul></div></section>
      <div class="r7r-grade">
        <section class="panel r7r-sec"><div class="panel-head"><h3>Ocupação por dia</h3><small class="muted">minutos de serviço ÷ expediente de todos os consultores</small></div><div class="panel-body">${dias}</div></section>
        <section class="panel r7r-sec"><div class="panel-head"><h3>Por dia da semana</h3></div><div class="panel-body">${semana}</div></section>
        <section class="panel r7r-sec r7r-larga"><div class="panel-head"><h3>Por consultor</h3></div><div class="panel-body">${cons}</div></section>
        <section class="panel r7r-sec"><div class="panel-head"><h3>Por que faltaram</h3></div><div class="panel-body">${motivos}${conf}</div></section>
        <section class="panel r7r-sec"><div class="panel-head"><h3>Horários que enchem</h3><small class="muted">onde a agenda tem cliente</small></div><div class="panel-body">${horas}</div></section>
        <section class="panel r7r-sec"><div class="panel-head"><h3>De onde vêm</h3></div><div class="panel-body">${origem || '<p class="muted">—</p>'}</div></section>
        <section class="panel r7r-sec"><div class="panel-head"><h3>Serviços mais marcados</h3></div><div class="panel-body">${serv || '<p class="muted">—</p>'}</div></section>
      </div>`;
  }

  let _ultimo = null;
  async function renderRelatorio(opts = {}) {
    if (!document.body.classList.contains('gestor')) {
      view.innerHTML = vazio(I.cadeado, 'Só para o gestor', 'Os relatórios do dono são do gestor ou do administrador. Se precisar, peça para alguém com esse acesso.');
      return;
    }
    const hoje = hojeSP();
    let esc = lerLS(LS) || '30', custom = null;
    try { const j = JSON.parse(esc); if (j && j.inicio && j.fim) custom = j; } catch { /* atalho simples */ }
    const iv = custom || intervaloDe(PERIODOS.some(([id]) => id === esc) ? esc : '30', hoje);
    const r = await api('GET', `/relatorios/dono?inicio=${encodeURIComponent(iv.inicio)}&fim=${encodeURIComponent(iv.fim)}`, null, { repetir: false });
    if (opts.vez && opts.vez !== state._vez) return;
    _ultimo = r;
    const ativo = custom ? 'custom' : (PERIODOS.some(([id]) => id === esc) ? esc : '30');
    view.innerHTML = `<div class="r7r">
      <div class="r7r-filtros" role="group" aria-label="Período">${PERIODOS.map(([id, rot]) => `<button type="button" class="pilula ${id === ativo ? 'ativa' : ''}" data-r7r-p="${id}" aria-pressed="${id === ativo}">${escH(rot)}</button>`).join('')}
        <span class="r7r-livre"><label>De <input type="date" id="r7rDe" value="${escH(r.periodo.inicio)}" max="${escH(hoje)}"></label> <label>até <input type="date" id="r7rAte" value="${escH(r.periodo.fim)}" max="${escH(hoje)}"></label>
        <button type="button" class="btn mini" data-r7r-aplicar>Ver</button></span></div>
      <p class="muted r7r-sub">${escH(dm(r.periodo.inicio))} a ${escH(dm(r.periodo.fim))} · comparado com ${escH(dm(r.anterior.inicio))} a ${escH(dm(r.anterior.fim))}</p>
      ${html(r)}</div>`;
    $$('[data-r7r-p]', view).forEach((b) => b.addEventListener('click', () => { gravarLS(LS, b.dataset.r7rP); route('dono'); }));
    $('[data-r7r-aplicar]', view).addEventListener('click', () => {
      const de = $('#r7rDe').value, ate = $('#r7rAte').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return toast('Escolha as duas datas', 'err');
      gravarLS(LS, JSON.stringify({ inicio: de, fim: ate })); route('dono');
    });
    $('[data-r7r-copiar]', view).addEventListener('click', async () => { toast((await copiarTexto(_ultimo.texto)) ? 'Resumo copiado — cole no WhatsApp' : 'Não consegui copiar', 'ok'); });
    $('[data-r7r-csv]', view).addEventListener('click', () => {
      const blob = new Blob([String.fromCharCode(0xFEFF) + (_ultimo.csv || '')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relatorio-agenda-${_ultimo.periodo.inicio}-a-${_ultimo.periodo.fim}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('[data-r7r-imprimir]', view).addEventListener('click', () => window.print());
  }

  /** Liga a tela à Agenda: rota, título e o item do menu (só aparece para o gestor, como Pendências). */
  function registrar() {
    if (typeof ROUTES === 'undefined') return;
    ROUTES.dono = renderRelatorio;
    if (typeof TAGS !== 'undefined') TAGS.dono = 'RELATÓRIOS';
    if (typeof TITULOS !== 'undefined') TITULOS.dono = 'Relatórios';
  }
  registrar();
  root.R7r = { intervaloDe, html, renderRelatorio, PERIODOS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
