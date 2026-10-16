/* ===================== IndyCar Comunicar — Rodada 5 (16/10/2026) =====================
   • Saúde do WhatsApp: estado, motivo em português e o botão para o lugar certo
   • Réguas: prévia REAL (um cliente de verdade, com {link_os}/{link_area})
   • Relatório por régua com período (enviadas, responderam, agendaram, pediram para parar)
   • Campanhas: segmentos salvos, prévia com os pulados e o motivo, teste no meu celular
   • Conectar: ligações de um envio (conversa, lead, horário, ordem do Pátio) e a ficha 360
   • Atalho do manifest (?abrir=campanha) e caminhos relativos (Central)
   Usa as funções do app.js (api, openModal, toast, esc, svg, I, state, route…).
   Regra da casa: esc() em TODO dado que vira HTML.
   ======================================================================================= */
(function () {
  'use strict';
  const R5 = {};
  const LINKS = (window.IndyApps && window.IndyApps.LINKS) || {};
  const COR = { verde: 'ok', laranja: 'aviso', vermelho: 'falta', cinza: 'neutro' };
  const ROT = (t) => TIPO[t]?.rotulo || t;
  const EMOJI = (t) => TIPO[t]?.emoji || '✉️';
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } };

  // ======================================================================
  // SAÚDE DO WHATSAPP — no Início, logo abaixo do checklist
  // ======================================================================
  function htmlSaude(s) {
    const cls = COR[s.cor] || 'neutro';
    const acao = s.acao ? (s.acao.tipo === 'link'
      ? `<a class="btn btn-mini primary" href="${esc(s.acao.alvo)}" target="_blank" rel="noopener">${esc(s.acao.rotulo)} ↗</a>`
      : `<button type="button" class="btn btn-mini" data-sw-rota="${esc(s.acao.alvo)}">${esc(s.acao.rotulo)}</button>`) : '';
    const classes = (s.classes || []).length ? `<div class="sw-classes">${s.classes.map(c => `<span class="badge-pill ${c.classe === 'numero_invalido' ? 'bp-gray' : c.classe === 'chave_recusada' ? 'bp-red' : 'bp-orange'}" title="${esc(c.ultimoErro || '')}">${esc(c.rotulo)} · <b>${c.total}</b></span>`).join('')}</div>` : '';
    const cad = s.cadencia ? `<small class="sw-cad">cadência: até <b>${s.cadencia.porMinuto}/min</b>, <b>${s.cadencia.porHora}/h</b>, <b>${s.cadencia.porDia}/dia</b> · ${s.cadencia.mesmoCliente} min entre avisos ao mesmo cliente · ${s.cadencia.janela?.inicio}h–${s.cadencia.janela?.fim}h${s.cadencia.soHorarioComercial ? ' · só horário da loja' : ''}</small>` : '';
    return `<div class="sw-topo"><span class="sw-dot ${cls}" aria-hidden="true"></span>
        <div class="sw-txt"><b>${esc(s.titulo)}</b><p>${esc(s.motivo)}</p>${s.fazer ? `<p class="sw-fazer">${esc(s.fazer)}</p>` : ''}</div>
        <div class="sw-acoes">${acao}${pode('rodar') ? `<button type="button" class="btn btn-mini" id="swReconferir" title="Esquece a chave em cache e pergunta de novo ao CodeWords">${svg(I.refresh)} Conferir agora</button>` : ''}</div></div>
      ${(s.detalhes || []).length ? `<div class="sw-det">${s.detalhes.map(d => `<span>${esc(d)}</span>`).join('')}</div>` : ''}${classes}${cad}`;
  }
  R5.pintarSaude = async function () {
    const alvo = $('#painelPronto'); if (!alvo || $('#painelSaudeWA')) return;
    const box = document.createElement('section');
    box.className = 'panel saude-wa'; box.id = 'painelSaudeWA'; box.setAttribute('aria-label', 'Saúde do WhatsApp');
    box.innerHTML = `<div class="panel-head"><h2>${svg(I.wa)} Saúde do WhatsApp</h2><span class="panel-sub">chave, aparelho e cadência</span></div><div class="panel-body" id="swCorpo"><div class="skel" style="height:56px"></div></div>`;
    alvo.insertAdjacentElement('afterend', box);
    await R5.atualizarSaude();
  };
  R5.atualizarSaude = async function (forcar = false) {
    const corpo = $('#swCorpo'); if (!corpo) return;
    let s;
    try { s = forcar ? await api('POST', '/whatsapp/reconferir') : await api('GET', '/whatsapp/saude'); }
    catch (e) { corpo.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
    if (!$('#swCorpo')) return;
    state.saudeWA = s;
    corpo.innerHTML = htmlSaude(s);
    $('#painelSaudeWA').dataset.estado = s.estado;
    $('#painelSaudeWA').classList.toggle('alerta', s.cor === 'vermelho');
    $('#swReconferir')?.addEventListener('click', async (e) => { e.currentTarget.disabled = true; await R5.atualizarSaude(true); toast('WhatsApp conferido de novo.'); });
    $$('[data-sw-rota]', corpo).forEach(b => b.addEventListener('click', () => { if (b.dataset.swRota === 'mensagens') state.msg.status = 'falhou'; route(b.dataset.swRota); }));
  };

  // ======================================================================
  // RÉGUAS — prévia REAL com um cliente de verdade
  // ======================================================================
  R5.previaReal = function (regua) {
    const ta = $(`#msg_${regua}`);
    const corpo = () => ta?.value || '';
    openModal(`<div class="modal-head"><h3>${svg(I.olho)} Ver como um cliente de verdade · ${esc(ROT(regua))}</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <p class="dica">A mensagem como ELE recebe: nome, carro, placa e o último horário dele. Se o texto usa <b>{link_os}</b> ou <b>{link_area}</b>, o link é o dele (nada é enviado nem gravado).</p>
        <div class="field"><label for="prBusca">Cliente</label><div class="search" style="max-width:none">${svg(I.search)}<input id="prBusca" placeholder="Nome, telefone ou placa…" autocomplete="off"></div><div class="sugestoes" id="prSug" hidden></div></div>
        <div id="prSaida"></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    const inp = $('#prBusca'), sug = $('#prSug');
    const ultimo = ler('comunicar_previa_cliente');
    const mostrar = async (c) => {
      guardar('comunicar_previa_cliente', { id: c.id, nome: c.nome });
      const saida = $('#prSaida'); saida.innerHTML = '<div class="skel" style="height:120px"></div>';
      try {
        const q = new URLSearchParams({ regua, cliente_id: c.id, corpo: corpo() });
        const r = await api('GET', `/previa/mensagem?${q}`);
        saida.innerHTML = `<div class="cli-escolhido"><span><b>${esc(r.cliente.nome)}</b><small>${esc(telBR(r.cliente.telefone))}${r.cliente.carro ? ` · ${esc(r.cliente.carro)}` : ''}${r.cliente.placa ? ` · ${esc(r.cliente.placa)}` : ''}</small></span>
            ${r.agendamento ? `<small class="muted">último horário: ${esc(dataCurta(r.agendamento.data))} · ${esc(r.agendamento.servico || '')}</small>` : '<small class="muted">sem horário na Agenda</small>'}</div>
          ${r.falta ? `<p class="form-msg erro">Para este cliente a mensagem NÃO sairia: ${esc(r.falta)}.</p>` : ''}
          <div class="previa"><small>Como ${esc(String(r.cliente.nome).split(' ')[0])} vê no celular</small>${celularWA('<div class="bolha wa-rec" id="prBolha"></div>')}</div>`;
        pintarBolha($('#prBolha'), r.texto, state.cfg?.hora_envio || '09:30');
      } catch (e) { saida.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; }
    };
    inp.addEventListener('input', debounce(async () => {
      const q = inp.value.trim(); if (q.length < 2) { sug.hidden = true; return; }
      const r = await api('GET', `/clientes?q=${encodeURIComponent(q)}`).catch(() => []);
      const l = r.filter(x => x.telefone).slice(0, 8);
      sug.innerHTML = l.length ? l.map(x => `<button type="button" class="sugestao" data-id="${esc(x.id)}"><b>${esc(x.nome)}</b><small>${esc(telBR(x.telefone))}${x.carro ? ` · ${esc(x.carro)}` : ''}</small></button>`).join('') : '<div class="dica" style="padding:8px">Ninguém com esse nome (e telefone).</div>';
      sug.hidden = false;
      $$('.sugestao', sug).forEach(b => b.addEventListener('click', () => { const x = l.find(y => y.id === b.dataset.id); sug.hidden = true; inp.value = x.nome; mostrar(x); }));
    }, 250));
    if (ultimo?.id) { inp.value = ultimo.nome || ''; mostrar(ultimo); }
    setTimeout(() => inp.focus(), 30);
  };
  R5.pintarReguas = function () {
    $$('[data-previa-real]', view).forEach(b => b.addEventListener('click', () => R5.previaReal(b.dataset.previaReal)));
  };

  // ======================================================================
  // RELATÓRIO com período + uma linha por régua
  // ======================================================================
  const PERIODOS = [['8sem', 'Últimas 8 semanas'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['mes', 'Este mês'], ['custom', 'Escolher datas…']];
  function periodoDatas(chave, de, ate) {
    const h = hojeSP();
    const dias = (n) => { const d = new Date(h + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    if (chave === '30') return { de: dias(30), ate: h };
    if (chave === '90') return { de: dias(90), ate: h };
    if (chave === 'mes') return { de: h.slice(0, 8) + '01', ate: h };
    if (chave === 'custom') return { de: de || null, ate: ate || null };
    return { de: null, ate: null };
  }
  R5.abrirRelatorio = async function (regua = 'todas') {
    const titulo = regua === 'todas' ? 'Relatório · todas as mensagens' : `Relatório · ${ROT(regua)}`;
    const salvo = ler('comunicar_rel_periodo') || { chave: '8sem' };
    openModal(`<div class="modal-head"><h3>📊 ${esc(titulo)}</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <div class="campos-linha rel-filtros">
          <div class="field"><label for="relRegua">Régua</label><select id="relRegua"><option value="todas">Todas</option>${[...REGUAS, 'campanha', 'avulsa', 'remarcacao', ...TIPOS_PATIO].map(t => `<option value="${t}" ${t === regua ? 'selected' : ''}>${EMOJI(t)} ${esc(ROT(t))}</option>`).join('')}</select></div>
          <div class="field"><label for="relPeriodo">Período</label><select id="relPeriodo">${PERIODOS.map(([k, r]) => `<option value="${k}" ${salvo.chave === k ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="field curto" id="relDeBox" ${salvo.chave === 'custom' ? '' : 'hidden'}><label for="relDe">De</label><input type="date" id="relDe" class="inp" value="${esc(salvo.de || '')}"></div>
          <div class="field curto" id="relAteBox" ${salvo.chave === 'custom' ? '' : 'hidden'}><label for="relAte">Até</label><input type="date" id="relAte" class="inp" value="${esc(salvo.ate || '')}"></div>
        </div>
        <div id="relCorpo"><div class="skel" style="height:220px"></div></div>
        <div id="relReguas"></div></div>`, { larga: true });
    const pintar = async () => {
      const r = $('#relRegua').value, chave = $('#relPeriodo').value;
      const p = periodoDatas(chave, $('#relDe').value, $('#relAte').value);
      guardar('comunicar_rel_periodo', { chave, de: $('#relDe').value, ate: $('#relAte').value });
      if (chave === 'custom' && p.de && p.ate && p.de > p.ate) return toast('O "de" precisa vir antes do "até".', 'err');
      const box = $('#relCorpo'); if (!box) return;
      box.innerHTML = '<div class="skel" style="height:220px"></div>';
      const qs = new URLSearchParams({ regua: r }); if (p.de) qs.set('de', p.de); if (p.ate) qs.set('ate', p.ate);
      let d; try { d = await api('GET', `/relatorio?${qs}`); } catch (e) { box.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
      const max = Math.max(1, ...d.semanas.map(s => s.enviadas));
      const pct = (n) => Math.round((n / max) * 100);
      const t = d.total;
      box.innerHTML = `
        <div class="rel-nums rel-5">
          <div><b>${t.enviadas}</b><small>enviadas</small></div>
          <div class="b"><b>${d.taxaResposta ?? '—'}${d.taxaResposta !== null ? '%' : ''}</b><small>responderam${t.respondidas ? ` · ${t.respondidas}` : ''}</small></div>
          <div class="g"><b>${t.agendaram}</b><small>agendaram depois${d.taxaAgendamento ? ` · ${d.taxaAgendamento}%` : ''}</small></div>
          <div class="${t.optout ? 'p' : ''}"><b>${t.optout}</b><small>pediram para parar${d.taxaOptout ? ` · ${d.taxaOptout}%` : ''}</small></div>
          <div class="${t.falharam ? 'p' : ''}"><b>${t.falharam}</b><small>falharam</small></div>
        </div>
        ${chave === '8sem' ? `<div class="grafico" role="img" aria-label="${esc(d.semanas.map(s => `semana de ${dataCurta(s.inicio)}: ${s.enviadas} enviadas, ${s.respondidas} responderam, ${s.agendaram} agendaram`).join('; '))}">
          ${d.semanas.map(s => `<div class="g-sem" title="semana de ${esc(dataCurta(s.inicio))}: ${s.enviadas} enviadas · ${s.respondidas} responderam · ${s.agendaram} agendaram">
            <div class="g-barras"><i class="b-env" style="height:${pct(s.enviadas)}%"></i><i class="b-resp" style="height:${pct(s.respondidas)}%"></i><i class="b-ag" style="height:${pct(s.agendaram)}%"></i></div>
            <span class="g-rot">${esc(dataCurta(s.inicio))}</span></div>`).join('')}
        </div>
        <div class="g-legenda"><span><i class="b-env"></i>enviadas</span><span><i class="b-resp"></i>responderam</span><span><i class="b-ag"></i>agendaram</span></div>` : `<p class="dica">Período: ${esc(p.de ? dataBR(p.de) : '—')} a ${esc(p.ate ? dataBR(p.ate) : 'hoje')}.</p>`}
        ${Object.keys(d.intencoes || {}).length ? `<div class="lista-sep">O que a IA leu nas respostas</div><div class="chips-linha">${Object.entries(d.intencoes).map(([k, n]) => `<span class="badge-pill ${INTENCAO[k]?.[2] || 'bp-gray'}">${INTENCAO[k]?.[0] || ''} ${esc(INTENCAO[k]?.[1] || k)} · <b>${n}</b></span>`).join('')}</div>` : ''}
        ${t.enviadas ? '' : '<p class="dica">Nada enviado neste período — o relatório enche quando a régua estiver ligada e o WhatsApp saindo.</p>'}`;
      // uma linha por régua no mesmo período
      const rb = $('#relReguas'); if (!rb) return;
      const qs2 = new URLSearchParams(); if (p.de) qs2.set('de', p.de); if (p.ate) qs2.set('ate', p.ate);
      let pr; try { pr = await api('GET', `/relatorio/reguas?${qs2}`); } catch { rb.innerHTML = ''; return; }
      if (!$('#relReguas')) return;
      rb.innerHTML = `<div class="lista-sep">Por régua <em>${esc(dataBR(pr.periodo.de))} a ${esc(dataBR(pr.periodo.ate))}</em></div>
        <div class="rel-tab" role="table" aria-label="Resultado por régua no período">
          <div class="rel-l rel-h" role="row"><span role="columnheader">Régua</span><span role="columnheader">Env.</span><span role="columnheader">Resp.</span><span role="columnheader">Agend.</span><span role="columnheader" title="pediram para parar">Parar</span><span role="columnheader">Falhas</span></div>
          ${pr.linhas.map(l => `<div class="rel-l${l.enviadas ? '' : ' off'}" role="row"><span role="cell">${EMOJI(l.tipo)} ${esc(l.rotulo)}</span><span role="cell"><b>${l.enviadas}</b></span><span role="cell">${l.respondidas}${l.taxaResposta !== null ? `<small>${l.taxaResposta}%</small>` : ''}</span><span role="cell">${l.agendaram}</span><span role="cell" class="${l.optout ? 'p' : ''}">${l.optout}</span><span role="cell" class="${l.falharam ? 'p' : ''}">${l.falharam}</span></div>`).join('')}
        </div>`;
    };
    $('#relRegua').addEventListener('change', pintar);
    $('#relPeriodo').addEventListener('change', () => { const c = $('#relPeriodo').value === 'custom'; $('#relDeBox').hidden = !c; $('#relAteBox').hidden = !c; if (!c || ($('#relDe').value && $('#relAte').value)) pintar(); });
    $('#relDe').addEventListener('change', pintar); $('#relAte').addEventListener('change', pintar);
    pintar();
  };

  // ======================================================================
  // CAMPANHAS — segmentos salvos, prévia com pulados, teste no meu celular
  // ======================================================================
  R5.htmlPulados = function (p) {
    if (!p || !p.pulados) return '';
    const pu = p.pulados; const total = (pu.nao_quer || 0) + (pu.sem_telefone || 0) + (pu.repetido || 0);
    const rec = p.recentes ? `<div class="seg-pul aviso" title="Campanha é decisão sua: eles recebem mesmo assim, mas vale saber">⏳ ${plural(p.recentes, 'já recebeu', 'já receberam')} outra mensagem da oficina há menos de ${p.intervalo_dias} dias (recebem mesmo assim).</div>` : '';
    if (!total) return `<div class="seg-pul ok">${svg(I.check)} Ninguém fica de fora: todos os ${p.bruto ?? p.total} têm telefone e aceitam mensagens.</div>` + rec;
    const partes = [pu.nao_quer && `<span title="responderam PARAR ou foram desligados no painel">🚫 ${plural(pu.nao_quer, 'pediu para parar', 'pediram para parar')}</span>`,
      pu.sem_telefone && `<span>📵 ${plural(pu.sem_telefone, 'sem telefone', 'sem telefone')}</span>`,
      pu.repetido && `<span>👥 ${plural(pu.repetido, 'repetido', 'repetidos')}</span>`].filter(Boolean);
    return `<div class="seg-pul"><b>${plural(total, 'fica de fora', 'ficam de fora')} de ${p.bruto ?? (p.total + total)}:</b> ${partes.join(' · ')}</div>` + rec;
  };
  R5.segmentosSalvos = async function (forcar = false) {
    if (!forcar && state._segSalvos && Date.now() - state._segSalvos.em < 60000) return state._segSalvos.v;
    const v = await api('GET', '/segmentos/salvos').catch(() => []);
    state._segSalvos = { v, em: Date.now() };
    return v;
  };
  R5.htmlSegmentosSalvos = function (lista, filtroAtual, valorAtual) {
    if (!lista?.length) return '';
    const ativo = (s) => s.filtro === filtroAtual && String(s.valor ?? '') === String(valorAtual ?? '');
    return `<div class="seg-salvos" aria-label="Segmentos salvos"><small>Meus segmentos</small>${lista.map(s => `<button type="button" class="chip-seg${ativo(s) ? ' on' : ''}" data-seg-usar="${esc(s.id)}" title="${esc(SEG_ROT(s.filtro))}${s.valor ? ` (${esc(s.valor)})` : ''}${s.usos ? ` · usado ${s.usos}×` : ''}">${esc(s.nome)}<i data-seg-apagar="${esc(s.id)}" role="button" aria-label="Apagar segmento ${esc(s.nome)}" title="Apagar">×</i></button>`).join('')}</div>`;
  };
  const SEG_ROT = (f) => (state.segmentos || []).find(s => s.id === f)?.rotulo || f;
  R5.salvarSegmento = async function (filtro, valor, nomeSugerido) {
    const nome = prompt('Nome para este segmento (ex.: "Sumidos há 6 meses"):', nomeSugerido || '');
    if (nome === null) return null;
    try {
      const s = await api('POST', '/segmentos/salvos', { nome, filtro, valor });
      state._segSalvos = null; toast(`Segmento "${s.nome}" salvo.`); return s;
    } catch (e) { toast(e.message, 'err'); return null; }
  };
  R5.apagarSegmento = async function (id) {
    if (!confirm('Apagar este segmento salvo? As campanhas já enviadas não mudam.')) return false;
    try { await api('DELETE', `/segmentos/salvos/${id}`); state._segSalvos = null; toast('Segmento apagado.'); return true; }
    catch (e) { toast(e.message, 'err'); return false; }
  };
  /** "Mandar para o meu celular": o texto chega no telefone do perfil de quem escreve. */
  R5.testeMeu = async function (corpo, btn) {
    if (!String(corpo || '').trim()) return toast('Escreva a mensagem antes de testar.', 'err');
    if (btn) { btn.disabled = true; }
    try {
      const r = await api('POST', '/envios/teste-meu', { corpo });
      toast(`Teste enviado para o seu celular (${r.telefone}). Olhe o WhatsApp.`, 'ok', 5000);
    } catch (e) {
      if (e.codigo === 'sem_telefone') { toast('Cadastre seu celular em "Meu perfil" para receber o teste.', 'err', 6000); setTimeout(() => $('#avatarPerfil')?.click(), 400); }
      else toast(`Não saiu: ${e.message}`, 'err', 6000);
    } finally { if (btn) btn.disabled = false; }
  };

  // ======================================================================
  // CONECTAR — ligações de um envio e a ficha 360
  // ======================================================================
  const ETAPA_OS = { recebido: 'Recebido', diagnostico: 'Em diagnóstico', aguardando_aprovacao: 'Esperando aprovação', aguardando_peca: 'Esperando peça', em_execucao: 'Em execução', teste: 'Em teste', pronto: 'Pronto para retirar', entregue: 'Entregue', cancelado: 'Cancelado' };
  const STATUS_LEAD = { novo: 'Novo', contato: 'Em contato', orcamento: 'Orçamento', agendado: 'Agendado', em_servico: 'Em serviço', concluido: 'Concluído', perdido: 'Perdido' };
  const linkBtn = (href, ico, rotulo, sub) => (href ? `<a class="lig-item" href="${esc(href)}" target="_blank" rel="noopener">${svg(ico)}<span><b>${esc(rotulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><em aria-hidden="true">↗</em></a>` : '');

  /** Bloco "Nos outros apps" da ficha do cliente (vem de /clientes/:id/ficha › ligacoes = rpc cliente_360). */
  R5.htmlLigacoes = function (lig, c) {
    if (!lig) return `<div class="g-sec"><h4>Nos outros apps</h4><div class="lig-grid">${linkBtn(LINKS.conversaTel?.(c?.telefone), I.wa, 'Conversa no Atendimento', 'pelo telefone')}${linkBtn(LINKS.clienteCrm?.(c?.id, c?.telefone), I.flag, 'Ficha no CRM')}${linkBtn(LINKS.clienteAgenda?.(c?.id, c?.telefone), I.calendar, 'Horários na Agenda')}</div></div>`;
    const conv = lig.conversa, os = lig.carroNaOficina;
    const itens = [
      conv ? linkBtn(conv.link, I.wa, 'Conversa no Atendimento', [conv.etapa, conv.atribuida_a ? `com ${conv.atribuida_a}` : null, conv.aguardando_consultor ? 'esperando consultor' : null].filter(Boolean).join(' · ') || 'abrir a conversa') : linkBtn(LINKS.conversaTel?.(c?.telefone), I.wa, 'Conversa no Atendimento', 'ainda sem conversa — abre pelo telefone'),
      os ? linkBtn(os.link, I.car, `Carro na oficina${os.numero ? ` · OS ${os.numero}` : ''}`, ETAPA_OS[os.etapa] || os.etapa) : '',
      ...(lig.leads || []).slice(0, 2).map(l => linkBtn(l.link, I.flag, `Lead no CRM · ${STATUS_LEAD[l.status] || l.status}`, [l.servico, l.responsavel ? `com ${l.responsavel}` : null].filter(Boolean).join(' · '))),
      ...(lig.agendamentos || []).slice(0, 1).map(a => linkBtn(a.link, I.calendar, `Horário na Agenda · ${dataCurta(a.data)}${a.hora ? ` ${String(a.hora).slice(0, 5)}` : ''}`, [a.servico, pillAgTexto(a.status), a.consultor].filter(Boolean).join(' · '))),
      ...(lig.orcamentos || []).slice(0, 1).map(o => linkBtn(o.link, I.money, `Orçamento${o.status ? ` · ${o.status}` : ''}`, o.total ? dinheiro(o.total) : '')),
      ...(lig.patio || []).filter(o => !os || o.id !== os.id).slice(0, 1).map(o => linkBtn(o.link, I.car, `Passagem pelo Pátio${o.numero ? ` · OS ${o.numero}` : ''}`, ETAPA_OS[o.etapa] || o.etapa)),
      linkBtn(LINKS.clienteCrm?.(c?.id, c?.telefone), I.user, 'Ficha completa no CRM'),
    ].filter(Boolean);
    const tarefas = (lig.tarefas || []).length ? `<div class="lig-tarefas"><small>${plural(lig.tarefas.length, 'tarefa aberta', 'tarefas abertas')}:</small> ${lig.tarefas.slice(0, 3).map(t => `<span class="badge-pill bp-orange" title="${esc(t.responsavel ? `com ${t.responsavel}` : '')}">☑ ${esc(t.titulo)}</span>`).join(' ')}</div>` : '';
    const ind = lig.indicacoes?.fez || lig.indicacoes?.foiIndicadoPor ? `<small class="muted">${lig.indicacoes.fez ? `Indicou ${plural(lig.indicacoes.fez, 'amigo', 'amigos')}` : ''}${lig.indicacoes.fez && lig.indicacoes.foiIndicadoPor ? ' · ' : ''}${lig.indicacoes.foiIndicadoPor ? `Veio por indicação de ${esc(lig.indicacoes.foiIndicadoPor)}` : ''}</small>` : '';
    const r = lig.resumo || {};
    const resumo = r && Object.keys(r).length ? `<div class="lig-resumo">${[r.mensagens_total != null && `${r.mensagens_total} mensagens trocadas`, r.leads_abertos != null && `${r.leads_abertos} lead(s) aberto(s)`, r.total_gasto ? `${dinheiro(r.total_gasto)} em serviços` : null, r.ultima_visita && `última visita ${dataBR(r.ultima_visita)}`].filter(Boolean).map(esc).join(' · ')}</div>` : '';
    return `<div class="g-sec lig"><h4>Nos outros apps <small>ficha 360 pelo telefone</small></h4>${resumo}<div class="lig-grid">${itens.join('')}</div>${tarefas}${ind}</div>`;
  };
  const pillAgTexto = (s) => (STATUS_AG[s] || [s])[0];

  /** Ficha do envio: onde ele toca nos outros apps. */
  R5.abrirLigacoes = async function (id) {
    openModal(`<div class="modal-head"><h3>${svg(I.externo)} Onde esta mensagem toca</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body" id="ligCorpo"><div class="skel" style="height:120px"></div></div>
      <div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`);
    let r; try { r = await api('GET', `/envios/${id}/ligacoes`); } catch (e) { $('#ligCorpo').innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
    const e = r.envio, L = r.links || {}, lig = r.ligacoes || {};
    $('#ligCorpo').innerHTML = `<div class="cli-escolhido"><span><b>${esc(e.nome || e.telefone)}</b><small>${esc(telBR(e.telefone))} · ${EMOJI(e.tipo)} ${esc(ROT(e.tipo))} · ${esc(STATUS_ENVIO[e.status]?.[0] || e.status)}</small></span></div>
      <div class="lig-grid">
        ${linkBtn(L.conversa, I.wa, 'Conversa no Atendimento', lig.conversa ? [lig.conversa.etapa, lig.conversa.atribuida_a ? `com ${lig.conversa.atribuida_a}` : null].filter(Boolean).join(' · ') : 'abre pelo telefone')}
        ${linkBtn(L.lead, I.flag, 'Lead no CRM', lig.leads?.[0] ? (STATUS_LEAD[lig.leads[0].status] || lig.leads[0].status) : '')}
        ${linkBtn(L.agendamento, I.calendar, 'Horário na Agenda', '')}
        ${linkBtn(L.os, I.car, 'Ordem no Pátio', lig.carroNaOficina ? (ETAPA_OS[lig.carroNaOficina.etapa] || lig.carroNaOficina.etapa) : '')}
        ${linkBtn(L.cliente_crm, I.user, 'Ficha completa no CRM', '')}
      </div>
      ${!L.lead && !L.agendamento && !L.os ? '<p class="dica">Esta mensagem não está ligada a lead, horário nem ordem do Pátio — só à conversa do cliente.</p>' : ''}`;
  };
  R5.botaoLigacoes = (id) => `<button type="button" class="btn btn-mini ghost" data-ligacoes="${esc(id)}" title="Conversa, lead, horário e ordem do Pátio desta mensagem">${svg(I.externo)} Onde toca</button>`;
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-ligacoes]'); if (b) R5.abrirLigacoes(b.dataset.ligacoes); });

  // ======================================================================
  // CLIENTES — busca pelo telefone exato abre a ficha 360
  // ======================================================================
  R5.abrir360 = async function (tel) {
    openModal(`<div class="modal-head"><h3>${svg(I.user)} Ficha 360 · ${esc(telBR(tel))}</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body" id="c360"><div class="skel" style="height:140px"></div></div><div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    let r; try { r = await api('GET', `/clientes/360?tel=${encodeURIComponent(soDigitos(tel))}`); } catch (e) { $('#c360').innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
    const c = r.cliente;
    $('#c360').innerHTML = (c ? `<div class="cli-escolhido"><span><b>${esc(c.nome)}</b><small>${esc(telBR(c.telefone || tel))}${c.carro_modelo ? ` · ${esc(c.carro_modelo)}` : ''}${c.placa ? ` ${esc(c.placa)}` : ''}</small></span>${c.id ? `<button type="button" class="btn btn-mini" data-ficha-360="${esc(c.id)}">Abrir ficha</button>` : ''}</div>` : '<p class="dica">Esse telefone ainda não tem cadastro de cliente — mas pode ter conversa ou lead.</p>') + R5.htmlLigacoes(r.ligacoes, { id: c?.id, telefone: tel });
    $('[data-ficha-360]')?.addEventListener('click', (e) => { closeModal(); abrirFicha(e.currentTarget.dataset.ficha360); });
  };

  // ======================================================================
  // ATALHO do manifest (?abrir=campanha) — os outros links vivem no app.js
  // ======================================================================
  R5.abrirAtalho = function () {
    const p = new URLSearchParams(location.search);
    const abrir = p.get('abrir'); if (!abrir) return false;
    history.replaceState(null, '', location.pathname);
    if (abrir === 'campanha') setTimeout(() => openCampanhaModal(), 400);
    return true;
  };

  window.R5 = R5;
})();
