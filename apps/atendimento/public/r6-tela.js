/* ============================================================
   IndyCar Atendimento — r6-tela.js (Rodada 6, 21/10/2026)
   A tela do atendente com 50 conversas abertas:
     · FILA PRIORIZADA: quem atender primeiro e por quê (pontuação em r6-regras.js)
     · PAINEL CONECTADO na ficha: carro no pátio ao vivo, orçamentos do Orçador,
       horário da Agenda, lead do CRM, "Criar orçamento", "mandar link de acompanhar"
     · RESPOSTAS RÁPIDAS pelo que o cliente acabou de pedir (sem IA, sem preço)
     · WHATSAPP PARADO: faixa, "mensagens que não saíram" e "resolvi por telefone"
     · IA: o que ela está fazendo nesta conversa e por que passou para gente
   Usa as variáveis do app.js (mesmo escopo global) e window.R6 (r6-regras.js).
   ============================================================ */
(function () {
  'use strict';
  const R = window.R6;
  if (!R) return;

  const S = {
    ctx: {}, ctxEm: 0, marcado: new Map(), fixadas: new Set(), adiadas: new Map(),
    painel: null, painelConv: null, patioEtapa: null, zap: { parado: false }, ia: null,
    sugestoes: [], sugConv: null, timers: {},
  };
  const meuId = () => (typeof perfil !== 'undefined' && perfil ? perfil.id : null);
  const visivel = () => !document.hidden && navigator.onLine !== false;
  const api = async (caminho, opc = {}) => {
    const r = await fetch(caminho, { ...opc, headers: { ...(await authCabecalhos()), ...(opc.headers || {}) } });
    let j = {};
    try { j = await r.json(); } catch { /* corpo vazio */ }
    return { ok: r.ok && j.ok !== false, status: r.status, ...j };
  };
  const abrirApp = (app, url) => {
    if (!url) return toast('⚠️ Não consegui montar o link.');
    if (window.IndyCarApps) window.IndyCarApps.abrir(app, url); else window.open(url, R.NOME_ABA[app] || '_blank');
  };
  const appUrl = (app, rel) => (window.IndyCarApps ? window.IndyCarApps.link(app, rel) : null);

  /* ======================= FILA PRIORIZADA ======================= */
  const CURTO = {
    urgencia: 'Urgência', reclamacao: 'Reclamação', pessoa: 'Quer uma pessoa', ligacao: 'Quer ligação', preco: 'Pediu valor',
    so_midia: 'Áudio/foto', cancelar: 'Quer cancelar', estado_carro: 'Perguntou do carro', orc_status: 'Perguntou do orçamento',
    aprovou: 'Aprovou?', carro_pronto: 'Carro pronto', extra_pendente: 'Extra esperando', extra_pendente_antigo: 'Extra esperando',
    orc_aprovado_sem_horario: 'Aprovado sem horário', orc_visualizado: 'Viu o orçamento', orc_parado: 'Orçamento parado',
    aguardando_consultor: 'Esperando consultor', remarcar: 'Quer remarcar', nota_fiscal: 'Nota fiscal', espera: 'Esperando',
    agradecimento: 'Só agradeceu', fixada: 'Fixada',
  };

  function opcoes() {
    const adi = new Map();
    for (const [id, a] of S.adiadas) {
      const c = (typeof CONVERSAS !== 'undefined' ? CONVERSAS : []).find(x => x.id === id);
      // cliente escreveu depois de eu adiar: a conversa volta sozinha
      if (c && c.nao_lidas > 0 && a.desde && String(c.ultima_mensagem_em) > String(a.desde)) continue;
      adi.set(id, a.ate);
    }
    return {
      meuId: meuId(),
      ehAgendada: (c) => (typeof estaAgendada === 'function' ? estaAgendada(c) : false),
      iaRespondendo: (id) => (typeof IaFunil !== 'undefined' ? IaFunil.respondendo(id) : false),
      fixadas: S.fixadas, adiadas: adi,
    };
  }
  function recalcular() {
    const lista = typeof CONVERSAS !== 'undefined' ? CONVERSAS : [];
    const m = R.ordenarPorPrioridade(lista, S.ctx, opcoes());
    S.marcado = new Map(m.map(x => [x.c.id, x.p]));
    S.ultima = m;
    return m;
  }
  function ordenar(lista) {
    const m = R.ordenarPorPrioridade(lista, S.ctx, opcoes());
    for (const x of m) S.marcado.set(x.c.id, x.p);
    S.ultima = m;
    return m.map(x => x.c);
  }
  function pontosDe(c) {
    let p = S.marcado.get(c.id);
    if (!p) { p = R.pontuarConversa(c, S.ctx[c.id] || {}, { ...opcoes(), fixada: S.fixadas.has(c.id) }); S.marcado.set(c.id, p); }
    return p;
  }

  function chipsDaLinha(c) {
    const x = S.ctx[c.id] || {};
    const p = pontosDe(c);
    const partes = [];
    const modoPrioridade = typeof ordemLista !== 'undefined' && ordemLista === 'prioridade';
    if (!p.fora && p.motivos.length && (p.nivel === 'agora' || p.nivel === 'logo' || (modoPrioridade && p.nivel === 'hoje'))) {
      const topo = p.motivos.find(m => CURTO[m.cod]) || p.motivos[0];
      const todos = p.motivos.map(m => `${m.icone} ${m.texto}`).join(' · ');
      partes.push(`<span class="r6-nivel r6-n-${p.nivel}" title="${esc(R.NIVEIS[p.nivel].rotulo + ': ' + todos)}">${R.NIVEIS[p.nivel].icone} ${esc(CURTO[topo.cod] || topo.texto)}</span>`);
    }
    if (S.fixadas.has(c.id)) partes.push('<span class="r6-chip r6-fixada" title="Você fixou esta conversa no topo">📌</span>');
    if (S.adiadas.has(c.id)) partes.push('<span class="r6-chip" title="Você adiou esta conversa — volta quando o cliente escrever">💤</span>');
    if (x.patio) {
      const alerta = x.patio.extras_pendentes > 0;
      partes.push(`<span class="r6-chip r6-patio r6-tom-${esc(x.patio.tom)}" title="Carro no pátio: ${esc(x.patio.etapa_rotulo)}${alerta ? ' — extra esperando o cliente' : ''}">🚗 ${esc(x.patio.etapa_rotulo.replace(/ do cliente$/, ''))}${alerta ? ' ⚠️' : ''}</span>`);
    }
    if (x.orc) partes.push(`<span class="r6-chip r6-orc r6-orc-${esc(x.orc.cod || x.orc.status)}" title="Orçamento nº ${esc(x.orc.numero ?? '—')}: ${esc(x.orc.rotulo)}">📄 ${esc(x.orc.rotulo)}</span>`);
    if (x.falhas && (x.falhas.nao_saiu + x.falhas.sem_confirmacao) > 0) {
      const n = x.falhas.nao_saiu + x.falhas.sem_confirmacao;
      partes.push(`<span class="r6-chip r6-falha" title="${n} mensagem(ns) desta conversa não saíram no WhatsApp">⚠ ${n} não saiu</span>`);
    }
    return partes.length ? `<div class="r6-chips">${partes.join('')}</div>` : '';
  }

  const FILTROS = {
    r6_urgentes: (c) => { const p = pontosDe(c); return !p.fora && (p.nivel === 'agora' || p.nivel === 'logo'); },
    r6_patio: (c) => !!S.ctx[c.id]?.patio,
    r6_orcamento: (c) => { const o = S.ctx[c.id]?.orc; return !!o && ['enviado', 'parado', 'visualizado', 'recente', 'aprovado_sem_horario'].includes(o.cod); },
    r6_falhas: (c) => !!S.ctx[c.id]?.falhas,
  };
  function filtrar(codigo, base) { const f = FILTROS[codigo]; return f ? base.filter(f) : base; }

  function pintarResumo() {
    const el = $('#r6Resumo'); if (!el) return;
    const m = recalcular();
    const r = R.resumoDaFila(m);
    const prox = R.proximaDaFila(m, { meuId: meuId(), ignorar: typeof conversaAtual !== 'undefined' && conversaAtual ? conversaAtual.id : null });
    const falhas = Object.values(S.ctx).reduce((s, x) => s + (x.falhas ? x.falhas.nao_saiu + x.falhas.sem_confirmacao : 0), 0);
    el.hidden = !(r.agora || r.logo || r.hoje || falhas);
    el.classList.toggle('r6-urgente', r.agora > 0);
    el.innerHTML = `<span class="r6-resumo-txt" role="status">${r.agora ? '🔴' : r.logo ? '🟠' : '🟡'} ${esc(r.texto || 'Nada urgente')}${falhas ? ` · <button type="button" class="r6-link" data-r6="nao-sairam">⚠ ${falhas} não saiu</button>` : ''}</span>
      <button type="button" class="r6-proxima" data-r6="proxima" ${prox ? '' : 'disabled'} title="Abre a próxima conversa da fila (Alt+P)"${prox ? ` aria-label="Próxima da fila: ${esc(tituloDaConversa(prox.c))}"` : ''}>🎯 Próxima</button>`;
    const urg = r.agora;
    try {
      const base = typeof TITULO_BASE !== 'undefined' ? TITULO_BASE : null;
      if (base && !(document.title.startsWith('('))) document.title = (urg ? `🔴${urg} ` : '') + base;
    } catch { /* título é só enfeite */ }
  }
  async function atualizarFila({ forcar = false } = {}) {
    if (!forcar && Date.now() - S.ctxEm < 8000) return;
    S.ctxEm = Date.now();
    try {
      const r = await api('/api/r6/fila');
      if (r.ok) { S.ctx = r.conversas || {}; }
    } catch { /* sem o servidor a fila segue com o que a tela já sabe */ }
    pintarResumo();
    if (typeof renderConversas === 'function') renderConversas();
  }
  function irParaProxima() {
    const m = S.ultima || recalcular();
    const prox = R.proximaDaFila(m, { meuId: meuId(), ignorar: typeof conversaAtual !== 'undefined' && conversaAtual ? conversaAtual.id : null });
    if (!prox) return toast('🎉 Fila limpa: ninguém esperando por você agora.');
    abrirConversa(prox.c.id, { focarCampo: true });
  }

  /* ---- fixar e adiar (por pessoa, no banco) ---- */
  async function carregarMarcas() {
    if (!meuId()) return;
    try {
      const { data } = await sb.from('r6_c3_marcas').select('tipo,conversa_id,ate,created_at').eq('perfil_id', meuId()).in('tipo', ['fixar', 'adiar']);
      S.fixadas = new Set(); S.adiadas = new Map();
      const agora = Date.now();
      for (const m of data || []) {
        if (m.tipo === 'fixar') S.fixadas.add(m.conversa_id);
        else if (m.ate && Date.parse(m.ate) > agora) S.adiadas.set(m.conversa_id, { ate: m.ate, desde: m.created_at });
      }
    } catch { /* tabela ainda não existe: sem fixar/adiar */ }
  }
  async function alternarFixar(conv) {
    if (!conv || !meuId()) return;
    const fixa = S.fixadas.has(conv.id);
    try {
      if (fixa) { const { error } = await sb.from('r6_c3_marcas').delete().eq('perfil_id', meuId()).eq('tipo', 'fixar').eq('conversa_id', conv.id); if (error) throw error; S.fixadas.delete(conv.id); }
      else { const { error } = await sb.from('r6_c3_marcas').insert({ perfil_id: meuId(), tipo: 'fixar', conversa_id: conv.id }); if (error) throw error; S.fixadas.add(conv.id); }
      toast(fixa ? '📌 Conversa solta' : '📌 Fixada no topo da sua fila');
      pintarBotoesMarca(); pintarResumo(); renderConversas();
    } catch (e) { toast('⚠️ ' + (e.message || 'Não consegui fixar.')); }
  }
  function ateDoAdiar(op) {
    const agora = new Date();
    if (op === '1h') return new Date(agora.getTime() + 3600_000);
    if (op === '3h') return new Date(agora.getTime() + 3 * 3600_000);
    // amanhã às 8h (Brasília = UTC-3)
    const d = new Date(agora.getTime() - 3 * 3600_000); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(8 + 3, 0, 0, 0);
    return d;
  }
  async function adiar(conv, op) {
    if (!conv || !meuId()) return;
    try {
      await sb.from('r6_c3_marcas').delete().eq('perfil_id', meuId()).eq('tipo', 'adiar').eq('conversa_id', conv.id);
      if (op === 'tirar') { S.adiadas.delete(conv.id); toast('Conversa de volta na fila'); }
      else {
        const ate = ateDoAdiar(op);
        const { error } = await sb.from('r6_c3_marcas').insert({ perfil_id: meuId(), tipo: 'adiar', conversa_id: conv.id, ate: ate.toISOString() });
        if (error) throw error;
        S.adiadas.set(conv.id, { ate: ate.toISOString(), desde: new Date().toISOString() });
        toast('💤 Adiada — volta sozinha se o cliente escrever');
      }
      fecharMenuAdiar(); pintarBotoesMarca(); pintarResumo(); renderConversas();
    } catch (e) { toast('⚠️ ' + (e.message || 'Não consegui adiar.')); }
  }
  function pintarBotoesMarca() {
    const c = typeof conversaAtual !== 'undefined' ? conversaAtual : null;
    const f = $('#btnFixarConversa'); if (f) f.textContent = c && S.fixadas.has(c.id) ? '📌 Soltar da fila' : '📌 Fixar no topo da fila';
    const a = $('#btnAdiarConversa'); if (a) a.textContent = c && S.adiadas.has(c.id) ? '💤 Tirar do adiamento' : '💤 Adiar…';
  }
  function fecharMenuAdiar() { $('#r6AdiarMenu')?.remove(); }
  function abrirMenuAdiar(ancora) {
    fecharMenuAdiar();
    const m = document.createElement('div');
    m.id = 'r6AdiarMenu'; m.className = 'r6-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = ['1h|Daqui 1 hora', '3h|Daqui 3 horas', 'amanha|Amanhã às 8h'].map(x => { const [v, t] = x.split('|'); return `<button type="button" role="menuitem" data-adiar="${v}">${t}</button>`; }).join('');
    document.body.appendChild(m);
    const r = ancora.getBoundingClientRect();
    m.style.top = Math.min(window.innerHeight - 140, r.bottom + 4) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - 190, r.left)) + 'px';
    m.querySelector('button').focus();
  }

  /* ======================= PAINEL CONECTADO ======================= */
  const REC_KEY = 'indycar_r6_blocos';
  const recolhidos = () => { try { return JSON.parse(localStorage.getItem(REC_KEY) || '{}'); } catch { return {}; } };
  const salvaRec = (o) => { try { localStorage.setItem(REC_KEY, JSON.stringify(o)); } catch { /* ignora */ } };
  const dataCurta = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
  const horaDe = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const reais = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

  function bloco(id, titulo, corpo, { extra = '', aberto = true, contagem = '' } = {}) {
    const rec = recolhidos();
    const fechado = rec[id] === true || (rec[id] === undefined && !aberto);
    return `<section class="r6-bloco${fechado ? ' recolhido' : ''}" data-bloco="${esc(id)}">
      <h4><button type="button" class="r6-bloco-titulo" data-r6-bloco="${esc(id)}" aria-expanded="${fechado ? 'false' : 'true'}">
        <span>${esc(titulo)}</span>${contagem ? `<b class="r6-cont">${esc(contagem)}</b>` : ''}<i aria-hidden="true">▾</i></button>${extra}</h4>
      <div class="r6-bloco-corpo"${fechado ? ' hidden' : ''}>${corpo}</div></section>`;
  }

  function trilhaDoPatio(p) {
    return `<ol class="r6-trilha" aria-label="Etapas do carro">${p.passos.map(s => `<li class="${s.estado}" ${s.estado === 'atual' ? 'aria-current="step"' : ''}><i></i><span>${esc(s.rotulo)}</span></li>`).join('')}</ol>`;
  }
  function htmlPatio(p) {
    if (!p) return '<p class="r6-vazio">Nenhum carro deste cliente no pátio agora.</p>';
    const entregue = p.etapa === 'entregue';
    const prev = p.previsao_entrega ? new Date(p.previsao_entrega) : null;
    const prevTxt = prev && !Number.isNaN(prev.getTime()) ? prev.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="r6-patio-topo r6-tom-${p.etapa === 'pronto' ? 'ok' : p.extras?.length ? 'atencao' : 'andamento'}">
        <b data-r6-etapa>${esc(p.etapa_rotulo)}</b>
        <small>${!entregue && p.minutos_na_etapa != null ? 'há ' + esc(R.rotuloMinutos(p.minutos_na_etapa)) + ' · ' : ''}OS nº ${esc(p.numero ?? '—')}${p.placa ? ' · ' + esc(p.placa) : ''}${p.atrasado ? ' · <span class="r6-atraso">acima do normal</span>' : ''}</small>
      </div>${trilhaDoPatio(p)}
      ${!entregue && p.etapa !== 'pronto' ? `<div class="r6-linha"><span>Previsão</span><b>${prevTxt ? esc(prevTxt) : '<em>sem previsão — não prometa prazo</em>'}</b></div>` : ''}
      ${p.orcamento_numero ? `<div class="r6-linha"><span>Veio do orçamento</span><b>nº ${esc(p.orcamento_numero)}</b></div>` : ''}
      ${p.extras?.length ? `<div class="r6-extras">${p.extras.map(e => `<div class="r6-linha"><span>⏳ ${esc(e.descricao)}</span><b>${e.valor ? reais(e.valor) : '—'}</b></div>`).join('')}<small>esperando o cliente aprovar no link</small></div>` : ''}
      <div class="r6-botoes">
        ${p.link_cliente && !entregue ? `<button type="button" class="r6-btn" data-r6="link-patio">🔗 Mandar link de acompanhar</button>` : ''}
        ${p.etapa === 'pronto' ? `<button type="button" class="r6-btn" data-r6="avisar-pronto">🏁 Avisar que está pronto</button>` : ''}
        <button type="button" class="r6-btn r6-sec" data-r6="abrir-os">Abrir no Pátio ↗</button>
      </div>
      ${p.link_cliente && !entregue ? `<small class="r6-sub">${p.link_visto_em ? '✓ O cliente já abriu o link.' : 'O cliente ainda não abriu o link.'}</small>` : ''}`;
  }
  function htmlOrcamentos(lista, principalId) {
    if (!lista.length) return '<p class="r6-vazio">Nenhum orçamento deste cliente no Orçador.</p>';
    return lista.map(o => `<article class="r6-card r6-orc-${esc(o.cod)}${o.id === principalId ? ' principal' : ''}" data-orc="${esc(o.id)}">
        <div class="r6-card-topo"><b>Nº ${esc(o.numero ?? '—')}</b><span class="r6-selo r6-tom-${esc(o.tom)}">${esc(o.rotulo)}</span><b class="r6-valor">${reais(o.total)}</b></div>
        <small>${o.pedido ? esc(String(o.pedido).slice(0, 80)) + ' · ' : ''}${o.enviado_em ? 'enviado ' + esc(dataCurta(o.enviado_em)) : 'criado ' + esc(dataCurta(o.created_at))}${o.validade ? ' · vale até ' + esc(dataCurta(o.validade)) : ''}</small>
        ${o.acao ? `<small class="r6-acao">${esc(o.acao)}</small>` : ''}
        <div class="r6-botoes">
          <button type="button" class="r6-btn r6-sec" data-r6="abrir-orc" data-id="${esc(o.id)}">Abrir no Orçador ↗</button>
          ${o.link_cliente ? `<button type="button" class="r6-btn r6-sec" data-r6="link-orc" data-id="${esc(o.id)}">📋 Colar link do cliente</button>` : ''}
          ${o.cod === 'aprovado_sem_horario' ? '<button type="button" class="r6-btn" data-r6="agendar">📅 Marcar horário</button>' : ''}
          ${['parado', 'visualizado'].includes(o.cod) ? `<button type="button" class="r6-btn" data-r6="cobrar-orc" data-id="${esc(o.id)}">💬 Dar um retorno</button>` : ''}
        </div></article>`).join('');
  }
  function htmlAgenda(ag) {
    const um = (a, rotulo) => `<article class="r6-card"><div class="r6-card-topo"><b>${esc(rotulo || dataCurta(a.data))}${a.hora ? ' às ' + esc(a.hora) : ''}</b><span class="r6-selo">${esc(a.status)}</span></div>
      <small>${esc(a.servico || 'serviço')}${a.consultor ? ' · ' + esc(a.consultor) : ''}${a.os_etapa_rotulo ? ' · carro: ' + esc(a.os_etapa_rotulo) : ''}</small>
      ${a.abrir ? `<div class="r6-botoes"><button type="button" class="r6-btn r6-sec" data-r6="abrir-ag" data-id="${esc(a.id)}">Abrir na Agenda ↗</button></div>` : ''}</article>`;
    const prox = ag.proximo ? um(ag.proximo, 'Próximo: ' + dataCurta(ag.proximo.data)) : '<p class="r6-vazio">Sem horário marcado.</p>';
    const rec = ag.recentes.slice(0, 2).map(a => um(a)).join('');
    return prox + (rec ? `<details class="r6-mais"><summary>Anteriores</summary>${rec}</details>` : '')
      + '<div class="r6-botoes"><button type="button" class="r6-btn" data-r6="agendar">📅 Agendar</button></div>';
  }
  function htmlLead(l) {
    if (!l) return '<p class="r6-vazio">Nenhum lead aberto no CRM.</p>';
    return `<article class="r6-card"><div class="r6-card-topo"><b>${esc(l.servico || 'sem serviço')}</b><span class="r6-selo">${esc(l.rotulo)}</span></div>
      <small>${l.responsavel_nome ? 'Responsável: ' + esc(l.responsavel_nome) : 'Sem responsável'}${l.valor_orcado ? ' · orçado ' + reais(l.valor_orcado) : ''}${l.origem ? ' · ' + esc(l.origem) : ''}</small>
      <div class="r6-botoes"><button type="button" class="r6-btn r6-sec" data-r6="abrir-lead">Abrir no CRM ↗</button></div></article>`;
  }

  function renderPainel(p) {
    const el = $('#r6Painel'); if (!el) return;
    const orcPrincipal = p.orcamentos.find(o => o.id === p.orcamento_principal);
    el.hidden = false;
    el.innerHTML = `
      ${p.situacao.length ? `<div class="r6-situacao" role="status">${p.situacao.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
      <div class="r6-acoes" role="toolbar" aria-label="Ações rápidas deste cliente">
        <button type="button" data-r6="agendar" title="Agendar este cliente">📅 Agendar</button>
        <button type="button" data-r6="criar-orc" title="Abre o Orçador já com o cliente e o carro">🧾 Criar orçamento</button>
        ${p.patio?.link_cliente && p.patio.etapa !== 'entregue' ? '<button type="button" data-r6="link-patio" title="Cola no chat o link para o cliente acompanhar o carro">🔗 Link do carro</button>' : ''}
        ${p.links.crm_lead || p.links.crm_cliente ? '<button type="button" data-r6="abrir-lead" title="Abrir no CRM">📈 CRM</button>' : ''}
      </div>
      ${p.proximos.length ? `<ul class="r6-proximos" aria-label="O que fazer agora">${p.proximos.map(x => `<li>${x.icone} ${esc(x.texto)}</li>`).join('')}</ul>` : ''}
      ${bloco('patio', p.patio && p.patio.etapa !== 'entregue' ? '🚗 No pátio agora' : p.patio ? '🚗 Saiu do pátio' : '🚗 Pátio', `<div id="r6PatioCorpo">${htmlPatio(p.patio)}</div>`, { contagem: p.patio && p.patio.etapa !== 'entregue' ? 'ao vivo' : '' })}
      ${bloco('orcamentos', '🧾 Orçamentos', htmlOrcamentos(p.orcamentos, p.orcamento_principal), { contagem: p.orcamentos.length ? String(p.orcamentos.length) : '' })}
      ${bloco('agenda', '📅 Agenda', htmlAgenda(p.agendamentos))}
      ${bloco('lead', '📈 Lead no CRM', htmlLead(p.lead))}
      ${bloco('ia', '✨ IA nesta conversa', '<div id="r6IaCorpo"><p class="r6-vazio">Carregando…</p></div>')}
      ${p.timeline.length ? bloco('linha', '🕘 Linha do tempo', `<ol class="r6-tempo">${p.timeline.map(e => `<li><small>${esc(dataCurta(e.quando))} ${esc(horaDe(e.quando))}</small> <span>${esc(e.titulo)}</span>${e.detalhe ? `<small class="r6-det">${esc(String(e.detalhe).slice(0, 70))}</small>` : ''}</li>`).join('')}</ol>`, { aberto: false }) : ''}
      ${p.aviso ? `<small class="r6-aviso">⚠️ ${esc(p.aviso)}</small>` : ''}`;
    S.patioEtapa = p.patio ? p.patio.etapa : null;
    pintarCabecalhoDoChat(p);
    carregarIA();
  }

  function pintarCabecalhoDoChat(p) {
    const el = $('#r6ChipsChat'); if (!el) return;
    const itens = [];
    if (p?.patio && p.patio.etapa !== 'entregue') itens.push(`<button type="button" class="r6-chip r6-patio r6-tom-${p.patio.etapa === 'pronto' ? 'ok' : 'andamento'}" data-r6-ir="patio" title="Ver o carro no painel">🚗 ${esc(p.patio.etapa_rotulo)}</button>`);
    const o = p?.orcamentos?.find(x => x.id === p.orcamento_principal);
    if (o) itens.push(`<button type="button" class="r6-chip r6-orc r6-orc-${esc(o.cod)}" data-r6-ir="orcamentos" title="${esc(o.acao || '')}">🧾 Nº ${esc(o.numero ?? '—')} ${esc(o.rotulo)}</button>`);
    if (p?.agendamentos?.proximo) itens.push(`<button type="button" class="r6-chip" data-r6-ir="agenda" title="Próximo horário">📅 ${esc(dataCurta(p.agendamentos.proximo.data))}${p.agendamentos.proximo.hora ? ' ' + esc(p.agendamentos.proximo.hora) : ''}</button>`);
    if (p?.lead) itens.push(`<button type="button" class="r6-chip" data-r6-ir="lead" title="Lead no CRM">📈 ${esc(p.lead.rotulo)}</button>`);
    el.innerHTML = itens.join('');
    el.hidden = !itens.length;
  }

  async function carregarPainel(conv) {
    const el = $('#r6Painel'); if (!el) return;
    S.painel = null; S.painelConv = conv ? conv.id : null; S.patioEtapa = null;
    pintarCabecalhoDoChat(null);
    if (!conv) { el.hidden = true; el.innerHTML = ''; return; }
    if (!conv.cliente_id) {
      el.hidden = false;
      el.innerHTML = `<div class="r6-semcadastro"><b>Cliente sem cadastro</b><p>Cadastre para ver pátio, orçamentos e horários aqui, e para o Orçador abrir já com o cliente.</p>
        <button type="button" class="r6-btn" data-r6="cadastrar">➕ Cadastrar este cliente</button></div>
        <div class="r6-acoes"><button type="button" data-r6="agendar">📅 Agendar</button><button type="button" data-r6="criar-orc">🧾 Criar orçamento</button></div>
        <div id="r6IaCorpo"></div>`;
      carregarIA();
      return;
    }
    el.hidden = false;
    el.innerHTML = '<div class="r6-esqueleto" aria-hidden="true"><i></i><i></i><i></i></div>';
    const r = await api(`/api/r6/cliente/${encodeURIComponent(conv.cliente_id)}`);
    if (S.painelConv !== conv.id) return;                         // já abriu outra conversa
    if (!r.ok) { el.innerHTML = `<p class="r6-aviso">⚠️ ${esc(r.erro || 'Não consegui carregar o painel conectado.')} <button type="button" class="r6-link" data-r6="recarregar">Tentar de novo</button></p>`; return; }
    S.painel = r;
    renderPainel(r);
  }

  /* carro ao vivo: pergunta a etapa a cada 20 s e só mexe no que mudou */
  async function pulsoDoPatio() {
    const conv = typeof conversaAtual !== 'undefined' ? conversaAtual : null;
    if (!conv || !conv.cliente_id || !S.painel || !visivel()) return;
    if (!S.painel.patio && !S.painel.proximos.length && S.painel.patio !== null) return;
    const r = await api(`/api/r6/patio/${encodeURIComponent(conv.cliente_id)}`);
    if (!r.ok || S.painelConv !== conv.id) return;
    const novo = r.patio ? r.patio.etapa : null;
    if (novo === S.patioEtapa && (!r.patio || !S.painel.patio || r.patio.extras_pendentes === (S.painel.patio.extras?.length || 0))) return;
    const mudou = novo !== S.patioEtapa;
    if (mudou) {
      toast(novo ? `🚗 O carro mudou para: ${r.patio.etapa_rotulo}` : '🚗 O carro saiu do pátio', novo === 'pronto' ? 'ok' : '');
      S.patioEtapa = novo;
    }
    carregarPainel(conv);                                        // refaz o painel inteiro (barato: cache de 4 s no servidor)
    atualizarFila({ forcar: true });
  }

  /* ---- IA nesta conversa ---- */
  async function carregarIA() {
    const conv = typeof conversaAtual !== 'undefined' ? conversaAtual : null;
    const el = $('#r6IaCorpo'); if (!conv || !el) return;
    const r = await api(`/api/r6/conversas/${encodeURIComponent(conv.id)}/ia`);
    const alvo = $('#r6IaCorpo'); if (!alvo || S.painelConv !== conv.id) return;
    if (!r.ok) { alvo.innerHTML = '<p class="r6-vazio">Não consegui ler o estado da IA agora.</p>'; return; }
    S.ia = r;
    const ROT = { ligada: ['✨', 'IA ligada: conduz até onde o dono deixou'], respondendo: ['⏳', 'IA lendo e respondendo agora'], humano_assumiu: ['🙋', 'Uma pessoa assumiu: a IA só sugere'],
      desligada: ['⏸', 'IA desligada nas configurações'], so_copiloto: ['💡', 'Só copiloto: a IA não responde sozinha'] };
    const [ico, txt] = ROT[r.situacao] || ['✨', 'IA'];
    const prog = S.painel ? null : null;
    alvo.innerHTML = `<div class="r6-ia r6-ia-${esc(r.situacao)}"><b>${ico} ${esc(txt)}</b></div>
      ${r.humano ? `<div class="r6-humano">${R.MOTIVO_HUMANO[r.humano.cod]?.icone || '🙋'} Passou para gente: <b>${esc(r.humano.rotulo)}</b><small>${esc(r.humano.texto)}</small></div>` : ''}
      <div class="r6-linha"><span>Feito sozinha hoje</span><b>${esc(r.sozinhas)}</b></div>
      <div class="r6-linha"><span>Esperando seu clique</span><b>${esc(r.esperando_clique)}</b></div>
      ${r.ultima_rodada?.proxima_acao ? `<small class="r6-sub">Próximo passo: ${esc(r.ultima_rodada.proxima_acao)}</small>` : ''}
      <div class="r6-funil" id="r6Funil"></div>
      <div class="r6-botoes"><button type="button" class="r6-btn r6-sec" data-r6="passar-consultor" data-motivo="${esc(r.humano?.cod === 'pediu_pessoa' ? 'pessoa' : r.humano?.cod || 'preco')}">👤 Passar para o consultor</button></div>`;
  }

  /* ======================= RESPOSTAS RÁPIDAS ======================= */
  async function carregarSugestoes(conv) {
    const barra = $('#r6Sugestoes'); if (!barra) return;
    S.sugConv = conv ? conv.id : null; S.sugestoes = [];
    if (!conv) { barra.hidden = true; barra.innerHTML = ''; return; }
    const r = await api(`/api/r6/sugestoes/${encodeURIComponent(conv.id)}`);
    if (S.sugConv !== conv.id || !r.ok) return;
    const aguardando = conv.nao_lidas > 0 || (r.pedidos || []).length;
    S.sugestoes = (r.respostas || []).slice(0, 4);
    S.pedidos = r.pedidos || [];
    if (!aguardando || !S.sugestoes.length || !(r.pedidos || []).length) { barra.hidden = true; barra.innerHTML = ''; return; }
    barra.hidden = false;
    barra.innerHTML = `<span class="r6-sug-rotulo" title="Respostas prontas para o que o cliente acabou de pedir (sem IA, sem preço)">⚡ Para agora</span>`
      + S.sugestoes.map((s, i) => `<button type="button" class="r6-sug" data-r6-sug="${i}" title="${esc(s.texto)}"><kbd>${i + 1}</kbd> ${esc(s.rotulo)}</button>`).join('')
      + (S.sugestoes.some(s => s.acao === 'passar-consultor') ? '<button type="button" class="r6-sug r6-sug-gente" data-r6="passar-consultor-sug" title="Marca como aguardando consultor e cria a tarefa">👤 Passar ao consultor</button>' : '');
  }
  function usarSugestao(i) {
    const s = S.sugestoes[i]; if (!s) return;
    if (inserirNoCampo(s.texto)) {
      if (s.acao === 'colar-link-patio' && S.painel?.patio?.link_cliente) toast('Dica: use “🔗 Link do carro” para colar o link depois desta frase.');
      if (s.acao === 'criar-orcamento') toast('Dica: use “🧾 Criar orçamento” no painel.');
    }
  }

  /* ======================= WHATSAPP PARADO ======================= */
  async function verZap() {
    if (!visivel()) return;
    const r = await api('/api/r6/zap');
    if (!r.ok) return;
    const antes = S.zap.parado;
    S.zap = r;
    pintarZap();
    if (antes && !r.parado) { toast(`✅ O WhatsApp voltou${r.nao_saiu + r.sem_confirmacao ? `. ${r.nao_saiu + r.sem_confirmacao} mensagem(ns) não saíram — revise e reenvie` : ''}`, 'ok'); }
  }
  function pintarZap() {
    const z = S.zap;
    const el = $('#r6Zap');
    const total = (z.nao_saiu || 0) + (z.sem_confirmacao || 0);
    const btn = $('#btnEnviar');
    if (btn) { btn.textContent = z.parado ? 'Salvar' : 'Enviar'; btn.title = z.parado ? 'WhatsApp parado: a mensagem fica salva aqui e NÃO sai para o cliente' : 'Enviar (Enter ou Ctrl+Enter)'; btn.classList.toggle('r6-parado', !!z.parado); }
    if (!el) return;
    if (!z.parado && !total) { el.hidden = true; el.innerHTML = ''; document.documentElement.style.removeProperty('--r6-zap-h'); return; }
    el.hidden = false;
    el.className = 'r6-zap ' + (z.parado ? 'parado' : 'aviso');
    el.innerHTML = z.parado
      ? `<span>⛔ <b>WhatsApp parado.</b> ${esc(z.texto || R.textoWhatsappParado(z.codigo))} As mensagens ficam salvas e <u>nada é reenviado sozinho</u>.</span>${total ? ` <button type="button" data-r6="nao-sairam">Ver ${total} que não saíram</button>` : ''}`
      : `<span>⚠ <b>${total} mensagem(ns) não saíram</b> no WhatsApp. Decida uma a uma: reenviar ou marcar como resolvida por outro meio.</span> <button type="button" data-r6="nao-sairam">Revisar</button>`;
  }

  async function abrirNaoSairam() {
    let m = $('#r6NaoSairam');
    if (!m) {
      m = document.createElement('div');
      m.id = 'r6NaoSairam'; m.className = 'modal-bg';
      m.innerHTML = `<div class="modal r6-modal" role="dialog" aria-modal="true" aria-labelledby="r6NsTit"><div class="modal-topo"><h3 id="r6NsTit">Mensagens que não saíram</h3><button type="button" class="modal-x" data-r6="fechar-ns" aria-label="Fechar">×</button></div><div class="modal-corpo" id="r6NsCorpo"></div></div>`;
      document.body.appendChild(m);
    }
    m.classList.add('aberto');
    const corpo = $('#r6NsCorpo');
    corpo.innerHTML = '<p class="r6-vazio">Carregando…</p>';
    const r = await api('/api/r6/nao-sairam?dias=7');
    if (!r.ok) { corpo.innerHTML = `<p class="r6-aviso">⚠️ ${esc(r.erro || 'Não consegui ler agora.')}</p>`; return; }
    S.zap = { ...S.zap, ...(r.zap || {}) };
    const linha = (x, duvida) => `<article class="r6-card" data-msg="${esc(x.id)}" data-conv="${esc(x.conversa_id)}">
        <div class="r6-card-topo"><b>${esc(x.nome || x.telefone || 'Cliente')}</b><span class="r6-selo r6-tom-${duvida ? 'atencao' : 'ruim'}">${duvida ? 'não sabemos se chegou' : 'não saiu'}</span></div>
        <p class="r6-ns-texto">${esc(x.corpo)}</p><small>${x.ia ? '✨ da IA · ' : ''}há ${esc(R.rotuloMinutos(x.ha_min))}</small>
        <div class="r6-botoes">
          <button type="button" class="r6-btn r6-sec" data-r6="ns-abrir">Abrir a conversa</button>
          <button type="button" class="r6-btn" data-r6="ns-reenviar" ${S.zap.parado ? 'disabled title="O WhatsApp ainda está parado"' : ''}>${duvida ? 'Conferi: reenviar' : 'Reenviar'}</button>
          <button type="button" class="r6-btn r6-sec" data-r6="ns-resolvi" title="Já falei com o cliente por telefone ou pessoalmente">Resolvi por outro meio</button>
        </div></article>`;
    const todas = [...r.nao_saiu.map(x => linha(x, false)), ...r.sem_confirmacao.map(x => linha(x, true))];
    corpo.innerHTML = (S.zap.parado ? `<p class="r6-aviso">⛔ ${esc(S.zap.texto || R.textoWhatsappParado(S.zap.codigo))} Reenviar só funciona depois que o administrador resolver.</p>` : '')
      + (todas.length ? todas.join('') : '<p class="r6-vazio">🎉 Nenhuma mensagem pendente.</p>')
      + '<small class="r6-sub">Nada daqui é reenviado sozinho. Cada reenvio é um clique seu.</small>';
  }

  async function agirNaoSairam(acao, card) {
    const msgId = card?.dataset.msg, convId = card?.dataset.conv;
    if (acao === 'ns-abrir') { $('#r6NaoSairam')?.classList.remove('aberto'); return abrirConversa(convId); }
    if (acao === 'ns-resolvi') {
      const nota = prompt('Como você resolveu? (ex.: liguei para o cliente)', 'liguei para o cliente');
      if (nota === null) return;
      const r = await api('/api/r6/nao-sairam/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagemId: msgId, nota }) });
      if (!r.ok) return toast('⚠️ ' + (r.erro || 'Não consegui marcar.'));
      toast('✔ Marcada como resolvida fora do WhatsApp');
      card.remove(); atualizarFila({ forcar: true }); verZap();
      if (typeof conversaAtual !== 'undefined' && conversaAtual?.id === convId) IndyCar.recarregarConversa();
    }
    if (acao === 'ns-reenviar') {
      if (!confirm('Reenviar esta mensagem agora? Se o cliente já recebeu, ele receberá duas vezes.')) return;
      $('#r6NaoSairam')?.classList.remove('aberto');
      await abrirConversa(convId);
      await tentarDeNovo(msgId, { reenviar: true });
      verZap(); atualizarFila({ forcar: true });
    }
  }

  /* ======================= CLIQUES ======================= */
  async function acao(nome, alvo) {
    const conv = typeof conversaAtual !== 'undefined' ? conversaAtual : null;
    const p = S.painel;
    switch (nome) {
      case 'proxima': return irParaProxima();
      case 'nao-sairam': return abrirNaoSairam();
      case 'fechar-ns': return $('#r6NaoSairam')?.classList.remove('aberto');
      case 'agendar': return $('#btnAgendar')?.click();
      case 'recarregar': return carregarPainel(conv);
      case 'criar-orc': {
        const l = p?.links?.novo_orcamento || R.linkNovoOrcamento({ clienteId: conv?.cliente_id, telefone: conv?.telefone_e164 || conv?.telefone, nome: conv?.nome });
        if (!l) return toast('⚠️ Sem cliente cadastrado nem telefone válido para abrir o Orçador.');
        return abrirApp('orcador', l);
      }
      case 'link-patio': if (p?.patio?.texto_link && inserirNoCampo(p.patio.texto_link)) toast('🔗 Link de acompanhamento no campo — revise e envie'); return;
      case 'avisar-pronto': {
        const n = R.primeiroNome(p?.cliente?.nome); const c = p?.cliente?.carro ? `o ${p.cliente.carro}` : 'o carro';
        if (inserirNoCampo(`${n ? n + ', ' : ''}${c} já está pronto! Pode retirar de segunda a sábado, das 8h às 17h30. Que horário você vem?`)) toast('🏁 Aviso no campo — revise e envie');
        return;
      }
      case 'abrir-os': return abrirApp('patio', p?.patio?.abrir);
      case 'abrir-orc': { const o = p?.orcamentos.find(x => x.id === alvo.dataset.id); return abrirApp('orcador', o?.abrir); }
      case 'link-orc': { const o = p?.orcamentos.find(x => x.id === alvo.dataset.id); if (o?.link_cliente && inserirNoCampo(`${R.primeiroNome(p.cliente.nome) ? R.primeiroNome(p.cliente.nome) + ', ' : ''}aqui está o seu orçamento nº ${o.numero ?? ''} para você ver com calma: ${o.link_cliente}`)) toast('📋 Link do orçamento no campo — revise e envie'); return; }
      case 'cobrar-orc': { const o = p?.orcamentos.find(x => x.id === alvo.dataset.id); const n = R.primeiroNome(p?.cliente?.nome); if (o && inserirNoCampo(`${n ? n + ', ' : ''}conseguiu ver o orçamento nº ${o.numero ?? ''}? Se ficou alguma dúvida, eu te explico.`)) toast('💬 Retorno no campo — revise e envie'); return; }
      case 'abrir-ag': { const a = [p?.agendamentos.proximo, ...(p?.agendamentos.futuros || []), ...(p?.agendamentos.recentes || [])].find(x => x && x.id === alvo.dataset.id); return abrirApp('agenda', a?.abrir); }
      case 'abrir-lead': return abrirApp('crm', p?.links?.crm_lead || p?.links?.crm_cliente || appUrl('crm', conv ? `/?tel=${R.soDigitos(conv.telefone_e164 || conv.telefone)}` : ''));
      case 'cadastrar': {
        if (!conv) return;
        alvo.disabled = true;
        try {
          const { data, error } = await sb.rpc('obter_ou_criar_cliente', { p_nome: conv.nome || conv.telefone, p_telefone: conv.telefone, p_carro: null, p_placa: null, p_origem: 'whatsapp' });
          if (error || !data) throw new Error(error?.message || 'sem id');
          await sb.from('conversas').update({ cliente_id: data }).eq('id', conv.id);
          conv.cliente_id = data; toast('✅ Cliente cadastrado');
          await IndyCar.recarregarConversa(); IndyCar.recarregarFicha(); carregarPainel(conv);
        } catch (e) { toast('⚠️ Não consegui cadastrar: ' + e.message); alvo.disabled = false; }
        return;
      }
      case 'passar-consultor': case 'passar-consultor-sug': {
        if (!conv) return;
        const motivo = nome === 'passar-consultor' ? (alvo.dataset.motivo || 'preco') : (S.pedidos || []).map(x => (x === 'ligacao' ? 'ligacao' : x)).find(x => R.MOTIVO_HUMANO[x]) || 'preco';
        alvo.disabled = true;
        const r = await api(`/api/r6/conversas/${encodeURIComponent(conv.id)}/passar-consultor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
        alvo.disabled = false;
        if (!r.ok) return toast('⚠️ ' + (r.erro || 'Não consegui passar agora.'));
        conv.aguardando_consultor = true;
        toast(r.ja_estava ? 'Já estava aguardando consultor' : `👤 Passada para o consultor${r.tarefa_id ? ' (tarefa criada)' : ''}`);
        carregarIA(); atualizarFila({ forcar: true }); if (typeof carregarConversas === 'function') carregarConversas();
        return;
      }
      default:
    }
  }

  document.addEventListener('click', (ev) => {
    const adi = ev.target.closest('[data-adiar]');
    if (adi) { adiar(typeof conversaAtual !== 'undefined' ? conversaAtual : null, adi.dataset.adiar); return; }
    if (!ev.target.closest('#r6AdiarMenu, #btnAdiarConversa')) fecharMenuAdiar();
    const b = ev.target.closest('[data-r6]');
    if (b) {
      const nome = b.dataset.r6;
      if (nome.startsWith('ns-')) { agirNaoSairam(nome, b.closest('[data-msg]')); return; }
      acao(nome, b); return;
    }
    const sug = ev.target.closest('[data-r6-sug]');
    if (sug) { usarSugestao(Number(sug.dataset.r6Sug)); return; }
    const tit = ev.target.closest('[data-r6-bloco]');
    if (tit) {
      const id = tit.dataset.r6Bloco, sec = tit.closest('.r6-bloco');
      const fechar = !sec.classList.contains('recolhido');
      sec.classList.toggle('recolhido', fechar);
      sec.querySelector('.r6-bloco-corpo').hidden = fechar;
      tit.setAttribute('aria-expanded', fechar ? 'false' : 'true');
      const rec = recolhidos(); rec[id] = fechar; salvaRec(rec);
      return;
    }
    const ir = ev.target.closest('[data-r6-ir]');
    if (ir) {
      const colFicha = $('#colFicha');
      if (window.matchMedia('(max-width:1180px)').matches) colFicha.classList.add('aberta'); else $('.conversas-layout')?.classList.remove('ficha-fechada');
      const sec = $(`#r6Painel [data-bloco="${ir.dataset.r6Ir}"]`);
      if (sec) {
        sec.classList.remove('recolhido'); sec.querySelector('.r6-bloco-corpo').hidden = false;
        sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
        sec.classList.add('r6-pisca'); setTimeout(() => sec.classList.remove('r6-pisca'), 1400);
      }
    }
  });
  $('#btnFixarConversa')?.addEventListener('click', () => { alternarFixar(typeof conversaAtual !== 'undefined' ? conversaAtual : null); $('#menuMaisAcoes') && ($('#menuMaisAcoes').hidden = true); });
  $('#btnAdiarConversa')?.addEventListener('click', (ev) => {
    const c = typeof conversaAtual !== 'undefined' ? conversaAtual : null;
    if (c && S.adiadas.has(c.id)) { adiar(c, 'tirar'); return; }
    abrirMenuAdiar(ev.currentTarget);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { fecharMenuAdiar(); $('#r6NaoSairam')?.classList.remove('aberto'); }
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey && (ev.key === 'p' || ev.key === 'P' || ev.code === 'KeyP')) { ev.preventDefault(); irParaProxima(); return; }
    if (ev.ctrlKey && ev.altKey && /^[1-4]$/.test(ev.key)) { ev.preventDefault(); usarSugestao(Number(ev.key) - 1); }
  });

  /* ======================= LIGAÇÃO COM O APP ======================= */
  window.addEventListener('indycar:conversa', (ev) => {
    const d = ev.detail || {};
    const conv = typeof conversaAtual !== 'undefined' ? conversaAtual : null;
    if (!d.conversaId || !conv) { carregarPainel(null); carregarSugestoes(null); pintarBotoesMarca(); return; }
    carregarPainel(conv); carregarSugestoes(conv); pintarBotoesMarca();
  });
  let tMsg = null;
  window.addEventListener('indycar:mensagem', (ev) => {
    const d = ev.detail || {};
    clearTimeout(tMsg);
    tMsg = setTimeout(() => {
      atualizarFila({ forcar: true });
      const conv = typeof conversaAtual !== 'undefined' ? conversaAtual : null;
      if (conv && d.conversaId === conv.id) { carregarSugestoes(d.direcao === 'entrada' ? conv : null); if (d.direcao === 'saida') verZap(); }
    }, 1500);
  });
  window.addEventListener('indycar:ia-acao', () => { carregarIA(); });
  window.addEventListener('indycar:ia-fila', () => { carregarIA(); });

  let iniciou = false;
  async function iniciar() {
    if (iniciou || typeof perfil === 'undefined' || !perfil) return;
    iniciou = true;
    await carregarMarcas();
    atualizarFila({ forcar: true });
    verZap();
    clearInterval(S.timers.fila); S.timers.fila = setInterval(() => { if (visivel()) atualizarFila({ forcar: true }); }, 30_000);
    clearInterval(S.timers.zap); S.timers.zap = setInterval(verZap, 60_000);
    clearInterval(S.timers.patio); S.timers.patio = setInterval(pulsoDoPatio, 20_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { atualizarFila({ forcar: true }); verZap(); pulsoDoPatio(); } });
    window.addEventListener('online', () => { atualizarFila({ forcar: true }); verZap(); });
  }
  window.addEventListener('indycar:pronto', iniciar);
  setTimeout(iniciar, 2500);

  window.R6Tela = { ordenar, chipsDaLinha, filtrar, atualizarFila, irParaProxima, estado: S, carregarPainel, carregarSugestoes, verZap, iniciar, pontosDe };
})();
