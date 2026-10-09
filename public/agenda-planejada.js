/* ============================================================================
   SEMANA — a agenda em grade (dia · semana · mês), com ocupação por dia,
   remarcar arrastando (ou pelo botão, no celular e no teclado), aviso de
   horário disputado e o relatório do período (veio · faltou · fechou, por
   consultor e por origem), imprimível e em CSV.
   Carregado DEPOIS do app.js: usa api, view, state, esc, svg, I, route,
   rotuloDia, dataBR, STATUS_LABEL, statusClass, abrirRemarcar, remarcarPara,
   openAgendamentoModal e as regras puras de window.Planejamento.
   Só lê o período na tela (/api/agendamentos?de=&ate=), nada de baixar tudo.
   ============================================================================ */
/* O tamanho do período (dia/semana/mês) fica lembrado NESTE aparelho — conveniência
   de quem usa; se o navegador não deixar guardar, começa na semana. */
const MODO_KEY = 'indycar_semana_modo';
const modoSalvo = (() => { try { const m = localStorage.getItem(MODO_KEY); return ['dia', 'semana', 'mes'].includes(m) ? m : 'semana'; } catch { return 'semana'; } })();
const semanaUI = { modo: modoSalvo, data: '', filtros: {}, lista: [], tabela: null, dias: [] };
const MODOS_SEMANA = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']];
const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function rotuloPeriodo(u, dias) {
  if (u.modo === 'mes') { const [a, m] = u.data.split('-'); return `${cap(MES_NOME[+m - 1])} de ${a}`; }
  if (u.modo === 'dia') return `${rotuloDia(u.data, agoraSP().data)} · ${dataBR(u.data)}`;
  const ini = dias[0], fim = dias.at(-1);
  const hojeNa = dias.includes(agoraSP().data) ? ' · esta semana' : '';
  return `${dataBR(ini).slice(0, 5)} a ${dataBR(fim)}${hojeNa}`;
}

async function renderSemana(opts = {}) {
  const u = semanaUI, pl = Planejamento;
  u.data ||= agoraSP().data;
  const dias = pl.periodo(u.data, u.modo);
  const [lista, servicos] = await Promise.all([
    api('GET', `/agendamentos?de=${dias[0]}&ate=${dias.at(-1)}`),
    state.servicos ? Promise.resolve(state.servicos) : api('GET', '/servicos').catch(() => []),
  ]);
  if (opts.vez && opts.vez !== state._vez) return;
  state.servicos = servicos;
  Object.assign(u, { lista, dias, tabela: pl.tabelaDuracoes(servicos) });
  // atualização silenciosa (depois de remarcar/marcar): só o miolo, a busca fica como está
  if (opts.quieto && $('#semanaCorpo') && $('#sBusca')) return pintarSemana();

  const opcoes = (campo, nome) => [...new Map(lista.filter(a => a[campo]).map(a => [a[campo], a[nome] || a[campo]])).entries()]
    .sort((x, y) => String(x[1]).localeCompare(String(y[1]), 'pt-BR'));
  const consultores = new Map((state.consultores || []).map(c => [c.id, c.nome]));
  for (const [id, n] of opcoes('consultor_id', 'consultor_nome')) consultores.set(id, n);
  const sel = (id, rotulo, pares, valor) => `<label class="sem-campo">${esc(rotulo)}
      <select id="${id}"><option value="">Todos</option>${pares.map(([v, n]) =>
        `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  const f = u.filtros;
  view.innerHTML = `
    <div class="sem-barra so-tela">
      <div class="sem-modos" role="group" aria-label="Tamanho do período">
        ${MODOS_SEMANA.map(([k, n]) => `<button type="button" class="pilula ${u.modo === k ? 'ativa' : ''}" data-modo="${k}" aria-pressed="${u.modo === k}">${n}</button>`).join('')}
      </div>
      <div class="sem-nav">
        <button type="button" class="icon-btn" id="sAnt" aria-label="Período anterior">‹</button>
        <button type="button" class="btn mini" id="sHoje">Hoje</button>
        <button type="button" class="icon-btn" id="sProx" aria-label="Próximo período">›</button>
        <h2 class="sem-periodo" id="sPeriodo" aria-live="polite"></h2>
      </div>
      <div class="search sem-busca">${svg(I.search)}<input id="sBusca" type="search" value="${esc(f.q || '')}"
        placeholder="Nome, telefone, placa ou serviço" aria-label="Filtrar agendamentos do período"></div>
      <details class="sem-filtros" ${f.status || f.consultor || f.origem || f.semTelefone ? 'open' : ''}>
        <summary>Filtros</summary>
        <div class="sem-filtros-corpo">
          ${sel('sStatus', 'Situação', Object.entries(STATUS_LABEL), f.status)}
          ${sel('sConsultor', 'Consultor', [...consultores.entries()], f.consultor)}
          ${sel('sOrigem', 'Origem', ORIGENS.map(o => [o, o]), f.origem)}
          <label class="sem-check"><input type="checkbox" id="sSemTel" ${f.semTelefone ? 'checked' : ''}> Só sem telefone</label>
          <button type="button" class="btn mini" id="sLimpar">Limpar filtros</button>
        </div>
      </details>
    </div>
    <div id="semanaCorpo"></div>`;

  const ir = (novo) => { Object.assign(u, novo); route(); };
  $$('[data-modo]').forEach(b => b.addEventListener('click', () => {
    try { localStorage.setItem(MODO_KEY, b.dataset.modo); } catch { /* sem armazenamento: só não lembra */ }
    ir({ modo: b.dataset.modo });
  }));
  $('#sAnt').addEventListener('click', () => ir({ data: pl.andar(u.data, u.modo, -1) }));
  $('#sProx').addEventListener('click', () => ir({ data: pl.andar(u.data, u.modo, 1) }));
  $('#sHoje').addEventListener('click', () => ir({ data: agoraSP().data }));
  for (const [id, k] of [['sStatus', 'status'], ['sConsultor', 'consultor'], ['sOrigem', 'origem']])
    $('#' + id).addEventListener('change', e => { u.filtros[k] = e.target.value; pintarSemana(); });
  $('#sSemTel').addEventListener('change', e => { u.filtros.semTelefone = e.target.checked; pintarSemana(); });
  $('#sBusca').addEventListener('input', debounce(e => { u.filtros.q = e.target.value.trim(); pintarSemana(); }, 200));
  $('#sLimpar').addEventListener('click', () => { u.filtros = {}; route('semana'); });
  pintarSemana();
}

/* Ordena por hora e separa quem ainda vale (ocupa horário) de quem já teve desfecho. */
const porHora = (l) => l.slice().sort((a, b) => String(a.hora).localeCompare(String(b.hora)));

function itemSemana(a, u) {
  const pl = Planejamento;
  const fim = pl.FINAIS.has(a.status);
  const conf = fim ? [] : pl.conflitos(u.lista, a, capacidadeRecepcao());
  const podeMover = !['concluido', 'nao_fechou'].includes(a.status);
  return `<li class="sem-item s-${esc(a.status)}${fim ? ' finalizado' : ''}" data-id="${esc(a.id)}" ${podeMover ? 'draggable="true"' : ''}>
    <button type="button" class="sem-abrir" data-abrir="${esc(a.id)}" aria-label="Abrir ${esc(a.cliente_nome)}, ${esc(a.hora)}">
      <span class="sem-hora">${esc(a.hora)}</span>
      <span class="sem-txt"><b>${esc(a.cliente_nome)}</b>
        <small>${esc(a.servico)} · ~${pl.duracao(a.servico, u.tabela)} min</small>
        <small>${esc(a.consultor_nome || 'sem consultor')}${!a.telefone ? ' · sem telefone' : ''}</small></span>
    </button>
    <span class="sem-selos">
      <span class="badge-pill ${statusClass(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
      ${conf.length ? `<span class="badge-pill bp-red" title="Disputa a recepção com: ${esc(conf.map(c => c.hora + ' ' + c.cliente_nome).join('; '))}">disputado</span>` : ''}
      ${podeMover ? `<button type="button" class="act ico mini" data-remarcar="${esc(a.id)}" aria-label="Remarcar ${esc(a.cliente_nome)}" title="Remarcar">${svg(I.calendar)}</button>` : ''}
    </span>
  </li>`;
}

function pintarSemana() {
  const u = semanaUI, pl = Planejamento, corpo = $('#semanaCorpo');
  if (!corpo) return;
  const hoje = agoraSP().data, vagasPorJanela = capacidadeRecepcao();
  const lista = pl.filtrar(u.lista, u.filtros);
  const r = pl.resumo(lista);
  const per = $('#sPeriodo'); if (per) per.textContent = rotuloPeriodo(u, u.dias);
  const filtrado = Object.values(u.filtros).some(Boolean);

  let grade;
  if (u.modo === 'mes') {
    // calendário: começa na segunda; células vazias antes do dia 1
    const vazios = (new Date(u.dias[0] + 'T12:00:00Z').getUTCDay() + 6) % 7;
    grade = `<div class="sem-mes" role="grid" aria-label="Mês">
      ${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => `<span class="sem-mes-cab" role="columnheader">${d}</span>`).join('')}
      ${'<span class="sem-mes-vazio"></span>'.repeat(vazios)}
      ${u.dias.map(d => {
        const oc = pl.ocupacao(lista, d, vagasPorJanela, u.tabela), n = lista.filter(a => a.data === d).length;
        const dom = new Date(d + 'T12:00:00Z').getUTCDay() === 0;
        return `<button type="button" class="sem-mes-dia${d === hoje ? ' hoje' : ''}${dom ? ' fechado' : ''}" data-ir-dia="${d}" data-dia="${d}"
            aria-label="${esc(dataBR(d))}: ${n} agendamentos">
          <b>${+d.slice(8)}</b>${n ? `<span class="sem-mes-n">${oc.ativos}${n > oc.ativos ? `<small>/${n}</small>` : ''}</span>` : ''}
          <i class="ocup" style="--pct:${oc.pct}%"></i></button>`;
      }).join('')}
    </div>`;
  } else {
    // na semana, dia que já passou sem nada e domingo vazio não ocupam a tela (no celular, viravam rolagem à toa)
    const dias = u.dias.filter(d => u.modo === 'dia' || lista.some(a => a.data === d)
      || (d >= hoje && new Date(d + 'T12:00:00Z').getUTCDay() !== 0));
    grade = `<div class="sem-grade ${u.modo === 'dia' ? 'um-dia' : ''}">${dias.map(d => {
      const itens = porHora(lista.filter(a => a.data === d));
      const oc = pl.ocupacao(lista, d, vagasPorJanela, u.tabela);
      const passado = d < hoje;
      return `<section class="sem-dia${d === hoje ? ' hoje' : ''}${passado ? ' passado' : ''}" data-dia="${d}" aria-label="${esc(rotuloDia(d, hoje))}">
        <header class="sem-dia-cab">
          <h3>${esc(cap(rotuloDia(d, hoje)))}${Math.abs(diasEntre(hoje, d)) <= 1 ? `<small>${esc(dataBR(d).slice(0, 5))}</small>` : ''}</h3>
          ${passado ? '' : `<button type="button" class="icon-btn" data-novo-dia="${d}" aria-label="Novo agendamento em ${esc(dataBR(d))}" title="Novo agendamento neste dia">${svg(I.plus)}</button>`}
        </header>
        <div class="ocup-linha" title="${oc.ativos} de ${oc.vagas} vagas de recepção (meia hora × ${vagasPorJanela})">
          <i class="ocup ${oc.pct >= 80 ? 'cheio' : oc.pct >= 50 ? 'medio' : ''}" style="--pct:${oc.pct}%"></i>
          <small>${oc.ativos} ${oc.ativos === 1 ? 'horário' : 'horários'} · ${oc.pct}% ocupado${oc.cargaMin ? ` · ~${Math.round(oc.cargaMin / 6) / 10} h de serviço` : ''}</small>
        </div>
        ${itens.length ? `<ul class="sem-lista">${itens.map(a => itemSemana(a, u)).join('')}</ul>`
          : `<p class="sem-vazio">${filtrado ? 'Nada com esses filtros' : passado ? 'Sem horários' : 'Livre — arraste um horário para cá'}</p>`}
      </section>`;
    }).join('')}</div>`;
  }

  const grupos = (campo, titulo) => {
    const g = pl.grupos(lista, campo);
    return `<div class="sem-tabela"><table class="table"><caption>${esc(titulo)}</caption>
      <thead><tr><th scope="col">${esc(titulo)}</th><th scope="col">Total</th><th scope="col">Vieram</th><th scope="col">Fecharam</th><th scope="col">Faltaram</th><th scope="col">Falta</th></tr></thead>
      <tbody>${g.map(x => `<tr><th scope="row">${esc(x.nome)}</th><td>${x.total}</td><td>${x.veio}</td><td>${x.fechou}</td><td>${x.faltou}</td>
        <td class="${x.taxaFalta >= 30 ? 'alerta' : ''}">${x.taxaFalta}%</td></tr>`).join('') || '<tr><td colspan="6">Sem dados neste período</td></tr>'}</tbody></table></div>`;
  };

  corpo.innerHTML = `
    <p class="sem-resumo" role="status">${r.total} ${r.total === 1 ? 'agendamento' : 'agendamentos'}${filtrado ? ' (filtrado)' : ''}
      · <b>${r.pendentes}</b> a acontecer · <b>${r.veio}</b> vieram · <b>${r.fechou}</b> fecharam · <b>${r.faltou}</b> faltaram</p>
    ${grade}
    <section class="panel sem-relatorio">
      <div class="panel-head"><h2>${svg(I.flag)} Relatório do período</h2>
        <span class="panel-sub">falta ${r.taxaFalta}% · fechamento ${r.conversao}% de quem veio</span>
        <span class="sem-acoes so-tela">
          <button type="button" class="btn mini" id="sImprimir">${svg(I.imprimir)} Imprimir</button>
          <button type="button" class="btn mini" id="sCsv">Baixar CSV</button></span></div>
      <div class="panel-body">
        <div class="sem-kpis">
          <div><small>Marcados</small><b>${r.total}</b></div><div><small>Vieram</small><b>${r.veio}</b></div>
          <div><small>Fecharam</small><b>${r.fechou}</b></div><div><small>Não fecharam</small><b>${r.naoFechou}</b></div>
          <div><small>Faltaram</small><b>${r.faltou}</b></div><div><small>Taxa de falta</small><b>${r.taxaFalta}%</b></div>
        </div>
        ${grupos('consultor_nome', 'Consultor')}${grupos('origem', 'Origem')}
        <p class="muted sem-nota">Duração estimada pelo cadastro de serviços, só para organizar a oficina. Taxa de falta = faltaram ÷ (vieram e já tiveram desfecho + faltaram).</p>
      </div>
    </section>`;

  // abrir, remarcar, novo no dia, ir para o dia (mês)
  $$('[data-abrir]', corpo).forEach(b => b.addEventListener('click', () => openAgendamentoModal(b.dataset.abrir)));
  $$('[data-remarcar]', corpo).forEach(b => b.addEventListener('click', () => abrirRemarcar(b.dataset.remarcar)));
  $$('[data-novo-dia]', corpo).forEach(b => b.addEventListener('click', () => openAgendamentoModal(null, { data: b.dataset.novoDia })));
  $$('[data-ir-dia]', corpo).forEach(b => b.addEventListener('click', () => { Object.assign(u, { modo: 'dia', data: b.dataset.irDia }); route(); }));
  $('#sImprimir').addEventListener('click', () => {
    document.body.classList.add('imprimindo-semana');
    const limpar = () => { document.body.classList.remove('imprimindo-semana'); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    window.print();
    setTimeout(limpar, 60000);
  });
  $('#sCsv').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([pl.csv(lista, STATUS_LABEL)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `agenda-${u.dias[0]}-a-${u.dias.at(-1)}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ARRASTAR para outro dia = remarcar para lá, na mesma hora (com Desfazer)
  $$('.sem-item[draggable="true"]', corpo).forEach(li => li.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', li.dataset.id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('arrastando');
  }));
  $$('.sem-item', corpo).forEach(li => li.addEventListener('dragend', () => li.classList.remove('arrastando')));
  $$('[data-dia]', corpo).forEach(alvo => {
    alvo.addEventListener('dragover', e => { e.preventDefault(); alvo.classList.add('alvo'); });
    alvo.addEventListener('dragleave', () => alvo.classList.remove('alvo'));
    alvo.addEventListener('drop', async e => {
      e.preventDefault(); alvo.classList.remove('alvo');
      const a = u.lista.find(x => x.id === e.dataTransfer.getData('text/plain'));
      const dia = alvo.dataset.dia;
      if (!a || a.data === dia) return;
      if (dia < agoraSP().data) return toast('Não dá para remarcar para um dia que já passou', 'err');
      if (new Date(dia + 'T12:00:00Z').getUTCDay() === 0) return toast('Domingo a oficina não abre — escolha outro dia', 'err');
      const conf = pl.conflitos(u.lista, { ...a, data: dia, status: 'aguardando' }, capacidadeRecepcao());
      if (conf.length && !confirm(`${dataBR(dia)} às ${a.hora} já tem ${conf.map(c => c.cliente_nome).join(', ')}. Remarcar mesmo assim?`)) return;
      try { await remarcarPara(a, dia, a.hora); } catch (err) { toast(err.message, 'err'); }
    });
  });
}
