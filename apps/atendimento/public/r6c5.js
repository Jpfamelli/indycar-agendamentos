/* ============================================================
   IndyCar Atendimento — r6c5.js (Rodada 6, segunda leva, 21/10/2026)
   Conexões ao vivo e o dia a dia do atendente:
     · ORÇADOR AO VIVO na ficha: abriu e não respondeu, recusou (com o motivo), aprovou em parte,
       pré-agendamento pedido pela página do orçamento → "Confirmar na Agenda"
     · AÇÕES SUGERIDAS do r6_cliente_360 (só links da casa, sem preço)
     · CARROS NO PÁTIO SEM CONVERSA (patio_carros_abertos): quem merece um aviso
     · Avisos quando o orçamento muda com a conversa aberta, atalhos Alt+O / Alt+L / Alt+R / Alt+G,
       marcar visíveis como lidas, copiar telefone
   Usa as variáveis do app.js (mesmo escopo global), window.R6 (r6-regras.js) e window.R6Tela.
   Nada aqui envia mensagem sozinho: tudo cai no campo para o atendente revisar.
   ============================================================ */
(function () {
  'use strict';
  const R = window.R6;
  if (!R) return;

  const C = { conv: null, dados: null, em: 0, erro: null, carros: null, carrosEm: 0, timers: {}, pintando: false, agendado: 0, vez: 0 };
  const visivel = () => !document.hidden && navigator.onLine !== false;
  const api = async (caminho, opc = {}) => {
    const r = await fetch(caminho, { ...opc, headers: { ...(await authCabecalhos()), ...(opc.headers || {}) } });
    let j = {};
    try { j = await r.json(); } catch { /* corpo vazio */ }
    return { ok: r.ok && j.ok !== false, status: r.status, ...j };
  };
  const reais = (n) => (n == null ? '' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dataCurta = (iso) => { const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00-03:00' : iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
  const diaSemana = (iso) => { const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00-03:00' : iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''); };
  const conversaAberta = () => (typeof conversaAtual !== 'undefined' ? conversaAtual : null);
  const nomeDe = () => C.dados?.cliente?.nome || conversaAberta()?.nome || '';

  /** Abre outro sistema da casa em aba nomeada. Só endereço http(s) dos domínios da casa; o resto não abre. */
  function abrirSeguro(app, url) {
    // só caminho relativo de verdade (/…, ?…, #…): nada de //dominio nem /dominio, que o navegador trata como outro site
    const relativo = typeof url === 'string' && /^(\/(?![\/\\])|\?|#)/.test(url);
    const limpo = R.linkSeguroCasa(url) || (window.IndyCarApps && relativo ? window.IndyCarApps.link(app, url) : null);
    const ok = limpo && R.linkSeguroCasa(limpo);
    if (!ok) return toast('⚠️ Esse endereço não é de um sistema da casa — não abri.');
    const w = window.IndyCarApps ? window.IndyCarApps.abrir(app, ok) : null;
    if (!w && !window.IndyCarApps) window.open(ok, 'indycar-' + app, 'noopener');
  }
  const inserir = (t) => {
    if (R.textoTemPreco(t)) { toast('⚠️ Esse texto fala de valor — não coloquei no campo. Quem fala de valor é o consultor.'); return false; }
    return window.R6Tela ? window.R6Tela.inserir(t) : inserirNoCampo(t);
  };

  /* ======================= ORÇADOR AO VIVO NA FICHA ======================= */
  function mensagemDeErro(r) {
    if (!navigator.onLine) return 'Sem internet: mostrando o que já estava na tela.';
    if (r.status === 401) return 'Sua sessão expirou: entre de novo para ver o Orçador ao vivo.';
    if (r.status === 429) return 'Muitos pedidos seguidos. Espere um minuto e tente de novo.';
    if (r.status === 404) return 'Essa conversa não existe mais.';
    return 'Não consegui ler o Orçador agora. Mostrando o que já sabíamos.';
  }
  async function carregar(conv, { silencioso = false } = {}) {
    if (!conv) { C.conv = null; C.dados = null; C.erro = null; limpar(); return; }
    const trocou = C.conv !== conv.id;
    C.conv = conv.id;
    if (trocou) { C.dados = null; C.erro = null; C.eventosHtml = ''; }
    const vez = ++C.vez;
    const r = await api(`/api/r6/c5/conversa/${encodeURIComponent(conv.id)}`).catch(() => ({ ok: false, status: 0 }));
    if (vez !== C.vez || C.conv !== conv.id) return;           // já abriu outra conversa
    C.em = Date.now();
    if (!r.ok) { C.erro = mensagemDeErro(r); pintar(); return; }
    const antes = C.dados;
    C.dados = r; C.erro = r.aviso || null;
    if (antes && silencioso) avisarMudancas(antes, r);
    pintar();
  }
  /** O que mudou com a conversa aberta: o cliente abriu, aprovou, recusou, pediu horário. */
  function avisarMudancas(antes, depois) {
    const nome = R.primeiroNome(nomeDe()) || 'O cliente';
    for (const o of depois.orcamentos || []) {
      const a = (antes.orcamentos || []).find((x) => x.id === o.id);
      if (!a) continue;
      if (a.status !== o.status && o.status === 'recusado') toast(`🙅 ${nome} recusou o orçamento nº ${o.numero ?? ''}`);
      else if (a.status !== o.status && o.status === 'aprovado') toast(`✅ ${nome} aprovou o orçamento nº ${o.numero ?? ''}!`, 'ok');
      else if (!a.visualizado_em && o.visualizado_em) toast(`👀 ${nome} abriu o orçamento nº ${o.numero ?? ''}`);
    }
    if ((depois.pre_agendamentos || []).length > (antes.pre_agendamentos || []).length) toast(`📅 ${nome} pediu um horário pela página do orçamento`);
    atualizarFilaAgora();
  }
  const atualizarFilaAgora = () => { try { window.R6Tela?.atualizarFila({ forcar: true }); } catch { /* a fila se refaz sozinha */ } };

  const SELO_TOM = { ok: 'ok', ruim: 'ruim', atencao: 'atencao', neutro: 'neutro' };
  function principal() { return (C.dados?.orcamentos || []).find((o) => o.id === C.dados.orcamento_principal) || null; }

  function faixas() {
    const d = C.dados; const out = [];
    if (C.erro) out.push(`<div class="c5-faixa c5-aviso" role="status"><span>⚠️ ${esc(C.erro)}</span><button type="button" class="r6-link" data-c5="recarregar">Tentar de novo</button></div>`);
    if (!d) return out.join('');
    for (const p of d.pre_agendamentos || []) {
      const quando = `${diaSemana(p.data)} ${dataCurta(p.data)}${p.hora ? ' às ' + p.hora : ''}`;
      out.push(`<div class="c5-faixa c5-pre" role="status" data-pre="${esc(p.id)}"><span>📅 <b>Pediu horário pela página do orçamento: ${esc(quando)}</b>${p.servico ? ' · ' + esc(p.servico) : ''}${p.numero_orcamento ? ' · orçamento nº ' + esc(p.numero_orcamento) : ''}</span>
        <span class="c5-botoes"><button type="button" class="r6-btn" data-c5="pre-agenda" data-id="${esc(p.id)}">Confirmar na Agenda ↗</button>
        <button type="button" class="r6-btn r6-sec" data-c5="pre-responder" data-id="${esc(p.id)}">💬 Responder</button></span></div>`);
    }
    const p = principal();
    if (p && p.cod === 'recusado') {
      out.push(`<div class="c5-faixa c5-recusou" role="status"><span>🙅 <b>Recusou o orçamento nº ${esc(p.numero ?? '—')}</b>${p.motivo_recusa ? ` — “${esc(p.motivo_recusa)}”` : ' — sem motivo escrito'}</span>
        <button type="button" class="r6-btn r6-sec" data-c5="motivo" data-id="${esc(p.id)}">💬 Perguntar o motivo</button></div>`);
    } else if (p && ['visualizado', 'recente'].includes(p.cod)) {
      out.push(`<div class="c5-faixa c5-visto" role="status"><span>👀 <b>Abriu o orçamento nº ${esc(p.numero ?? '—')}</b> (${esc(p.visto || 'viu')}) e não respondeu</span>
        <button type="button" class="r6-btn r6-sec" data-c5="retorno" data-id="${esc(p.id)}">💬 Dar um retorno</button></div>`);
    }
    const nao = (d.acoes || []).find((a) => a.codigo === 'nao_mandar_mensagens');
    if (nao) out.push(`<div class="c5-faixa c5-aviso" role="status"><span>🚫 <b>${esc(nao.titulo)}</b>${nao.motivo ? ' — ' + esc(nao.motivo) : ''}</span></div>`);
    return out.join('');
  }

  function cartao(o) {
    const sub = [o.visto, o.enviado_em ? 'enviado ' + dataCurta(o.enviado_em) : (o.created_at ? 'criado ' + dataCurta(o.created_at) : ''), o.validade ? 'vale até ' + dataCurta(o.validade) : '',
      o.decidido_em && ['recusado', 'aprovado'].includes(o.status) ? (o.status === 'recusado' ? 'recusou ' : 'aprovou ') + dataCurta(o.decidido_em) : ''].filter(Boolean).join(' · ');
    const carro = [o.carro, o.placa].filter(Boolean).join(' · ');
    const botoes = [];
    botoes.push(`<button type="button" class="r6-btn r6-sec" data-c5="abrir-orc" data-id="${esc(o.id)}">Abrir no Orçador ↗</button>`);
    if (o.link_cliente && ['enviado', 'aprovado'].includes(o.status)) botoes.push(`<button type="button" class="r6-btn r6-sec" data-c5="link-orc" data-id="${esc(o.id)}">📋 Colar link do cliente</button>`);
    if (o.cod === 'recusado') botoes.push(`<button type="button" class="r6-btn" data-c5="motivo" data-id="${esc(o.id)}">💬 Perguntar o motivo</button>`);
    else if (['visualizado', 'recente', 'parado', 'enviado'].includes(o.cod)) botoes.push(`<button type="button" class="r6-btn" data-c5="retorno" data-id="${esc(o.id)}">💬 Dar um retorno</button>`);
    else if (o.cod === 'aprovado_sem_horario') botoes.push('<button type="button" class="r6-btn" data-r6="agendar">📅 Marcar horário</button>');
    else if (o.cod === 'vencido') botoes.push('<button type="button" class="r6-btn" data-c5="refazer">🧾 Refazer no Orçador ↗</button>');
    return `<article class="r6-card r6-orc-${esc(o.cod)}${o.id === C.dados.orcamento_principal ? ' principal' : ''}" data-orc="${esc(o.id)}">
      <div class="r6-card-topo"><b>Nº ${esc(o.numero ?? '—')}</b><span class="r6-selo r6-tom-${esc(SELO_TOM[o.tom] || 'neutro')}">${esc(o.rotulo)}</span>${o.total != null ? `<b class="r6-valor">${esc(reais(o.total))}</b>` : ''}</div>
      ${o.pedido || (o.servicos || []).length ? `<small>${esc(String(o.pedido || (o.servicos || []).join(', ')).slice(0, 90))}</small>` : ''}
      ${carro ? `<small>${esc(carro)}</small>` : ''}
      ${sub ? `<small>${esc(sub)}</small>` : ''}
      ${o.acao ? `<small class="r6-acao">${esc(o.acao)}</small>` : ''}
      <div class="r6-botoes">${botoes.join('')}</div></article>`;
  }
  function corpoOrcamentos() {
    const lista = C.dados?.orcamentos || [];
    if (!lista.length) return `<p class="r6-vazio">Nenhum orçamento deste cliente no Orçador.</p><div class="r6-botoes"><button type="button" class="r6-btn" data-r6="criar-orc">🧾 Criar orçamento</button></div>`;
    const ativos = lista.filter((o) => !['aprovado', 'vencido', 'expirado'].includes(o.cod) || o.id === C.dados.orcamento_principal);
    const antigos = lista.filter((o) => !ativos.includes(o));
    const mostrar = ativos.slice(0, 3);
    const resto = [...ativos.slice(3), ...antigos];
    const quando = C.em ? Math.max(0, Math.round((Date.now() - C.em) / 1000)) : 0;
    return `<small class="r6-sub c5-ao-vivo" data-c5-agora>${C.dados.ao_vivo ? `🟢 ao vivo · atualizado há ${quando < 5 ? 'instantes' : quando + ' s'}` : '⚪ sem resposta do Orçador agora'}</small>`
      + mostrar.map(cartao).join('') + (resto.length ? `<details class="r6-mais"><summary>Anteriores (${resto.length})</summary>${resto.map(cartao).join('')}</details>` : '');
  }
  function blocoAcoes() {
    const acoes = (C.dados?.acoes || []).filter((a) => a.codigo !== 'nao_mandar_mensagens');
    if (!acoes.length) return '';
    const itens = acoes.map((a, i) => `<li class="c5-acao"><div><b>${esc(a.titulo)}</b>${a.motivo ? `<small>${esc(a.motivo)}</small>` : ''}</div>
      <span class="c5-botoes">${a.link ? `<button type="button" class="r6-btn r6-sec" data-c5="acao-abrir" data-i="${i}">Abrir ↗</button>` : ''}${a.texto ? `<button type="button" class="r6-btn r6-sec" data-c5="acao-texto" data-i="${i}">📋 Colar texto</button>` : ''}</span></li>`).join('');
    return `<section class="r6-bloco c5-sug" data-c5-inj data-bloco="c5sug"><h4><span class="r6-bloco-titulo">💡 O sistema sugere</span><b class="r6-cont">${acoes.length}</b></h4><ul class="c5-lista">${itens}</ul></section>`;
  }
  C.acoesVisiveis = () => (C.dados?.acoes || []).filter((a) => a.codigo !== 'nao_mandar_mensagens');

  function limpar() {
    const el = document.getElementById('r6Painel');
    el?.querySelectorAll('[data-c5-inj]').forEach((x) => x.remove());
    const chat = document.getElementById('r6ChipsChat');
    chat?.querySelectorAll('[data-c5-inj]').forEach((x) => x.remove());
  }
  function pintar() {
    const el = document.getElementById('r6Painel');
    if (!el || el.hidden || !C.conv || el.querySelector('.r6-esqueleto')) return;
    if (conversaAberta()?.id !== C.conv) return;
    const pronto = el.querySelector('.r6-acoes') || el.querySelector('.r6-semcadastro');
    if (!pronto) return;
    C.pintando = true;
    try {
      el.querySelectorAll('[data-c5-inj]').forEach((x) => x.remove());
      const fx = faixas();
      if (fx) { const d = document.createElement('div'); d.className = 'c5-faixas'; d.setAttribute('data-c5-inj', ''); d.innerHTML = fx; el.insertBefore(d, el.firstChild); }
      if (C.dados) {
        let sec = el.querySelector('.r6-bloco[data-bloco="orcamentos"]');
        const conta = C.dados.orcamentos.length ? String(C.dados.orcamentos.length) : '';
        if (!sec) {
          sec = document.createElement('section');
          sec.className = 'r6-bloco'; sec.setAttribute('data-bloco', 'orcamentos');
          sec.innerHTML = `<h4><button type="button" class="r6-bloco-titulo" data-r6-bloco="orcamentos" aria-expanded="true"><span>🧾 Orçamentos</span><b class="r6-cont"></b><i aria-hidden="true">▾</i></button></h4><div class="r6-bloco-corpo"></div>`;
          const ancora = el.querySelector('.r6-acoes');
          (ancora?.parentNode || el).insertBefore(sec, ancora ? ancora.nextSibling : null);
        }
        const corpo = sec.querySelector('.r6-bloco-corpo');
        // a lista de eventos do Orçador (conectado, enviado…) é do painel de baixo: guarda e devolve
        const ev = corpo.querySelector('.r6-eventos');
        if (ev) C.eventosHtml = ev.outerHTML;
        corpo.innerHTML = corpoOrcamentos() + (C.eventosHtml || ''); corpo.setAttribute('data-c5-ok', '1');
        const cont = sec.querySelector('.r6-cont'); if (cont) cont.textContent = conta;
        el.querySelector('.c5-sug')?.remove();
        const sug = blocoAcoes();
        if (sug) sec.insertAdjacentHTML('afterend', sug);
      }
      pintarChipsDoChat();
    } finally { setTimeout(() => { C.pintando = false; }, 0); }
  }
  function pintarChipsDoChat() {
    const el = document.getElementById('r6ChipsChat'); if (!el || !C.dados) return;
    el.querySelectorAll('[data-c5-inj]').forEach((x) => x.remove());
    const p = principal();
    const orcChip = el.querySelector('.r6-orc');
    if (p && orcChip) {
      const ico = p.cod === 'recusado' ? '🙅' : ['visualizado', 'recente'].includes(p.cod) ? '👀' : '🧾';
      orcChip.textContent = `${ico} Nº ${p.numero ?? '—'} ${p.cod === 'recusado' ? 'recusou' : p.rotulo}${p.visto && ['visualizado', 'recente'].includes(p.cod) ? ' · ' + p.visto : ''}`;
      orcChip.title = p.acao || '';
    } else if (p) {
      el.insertAdjacentHTML('beforeend', `<button type="button" class="r6-chip r6-orc" data-r6-ir="orcamentos" data-c5-inj title="${esc(p.acao || '')}">🧾 Nº ${esc(p.numero ?? '—')} ${esc(p.rotulo)}</button>`);
    }
    if ((C.dados.pre_agendamentos || []).length) {
      const a = C.dados.pre_agendamentos[0];
      el.insertAdjacentHTML('beforeend', `<button type="button" class="r6-chip r6-pre" data-r6-ir="orcamentos" data-c5-inj title="Pediu horário pela página do orçamento">📅 pediu ${esc(dataCurta(a.data))}${a.hora ? ' ' + esc(a.hora) : ''}</button>`);
    }
    el.hidden = !el.children.length;
  }
  function agendarPintura() {
    if (C.pintando || C.agendado) return;
    C.agendado = requestAnimationFrame(() => { C.agendado = 0; pintar(); });
  }
  function observar() {
    const alvo = document.getElementById('r6Painel');
    if (alvo) new MutationObserver(agendarPintura).observe(alvo, { childList: true });
    const chat = document.getElementById('r6ChipsChat');
    if (chat) new MutationObserver(() => { if (!C.pintando) agendarPintura(); }).observe(chat, { childList: true });
  }

  /* ---- textos prontos (vão para o campo; nunca saem sozinhos) ---- */
  function fichaDeTexto(o) {
    return { nome: nomeDe(), numero: o?.numero, horarios: [] };
  }
  function textoPara(cod, o, extra = {}) { return R.respostaDoOrcador(cod, { ...fichaDeTexto(o), ...extra }); }

  /* ======================= CARROS SEM CONVERSA ======================= */
  async function carregarCarros({ forcar = false } = {}) {
    if (!forcar && Date.now() - C.carrosEm < 20_000) return C.carros;
    if (!visivel() || (typeof perfil !== 'undefined' && !perfil)) return C.carros;
    C.carrosEm = Date.now();
    const r = await api('/api/r6/c5/carros').catch(() => ({ ok: false }));
    C.carros = r.ok ? r : { ok: false, carros: C.carros?.carros || [], erro: r.erro || 'Não consegui ler os carros do pátio agora.' };
    pintarBarra();
    if (document.getElementById('c5Carros')?.classList.contains('aberto')) pintarCarros();
    return C.carros;
  }
  function pintarBarra() {
    const b = document.getElementById('c5Barra'); if (!b) return;
    const lista = C.carros?.carros || [];
    const prontos = lista.filter((c) => c.etapa === 'pronto').length;
    b.hidden = !lista.length;
    if (!lista.length) { b.innerHTML = ''; return; }
    b.innerHTML = `<button type="button" class="c5-carros-btn${prontos ? ' c5-pronto' : ''}" data-c5="carros" title="Carros que estão na oficina e ainda não têm conversa aberta (Alt+G)">🚗 ${lista.length} carro${lista.length > 1 ? 's' : ''} sem conversa${prontos ? ` · <b>${prontos} pronto${prontos > 1 ? 's' : ''}</b>` : ''}</button>`;
  }
  function abrirCarros() {
    let m = document.getElementById('c5Carros');
    if (!m) {
      m = document.createElement('div');
      m.id = 'c5Carros'; m.className = 'modal-bg';
      m.innerHTML = '<div class="modal r6-modal" role="dialog" aria-modal="true" aria-labelledby="c5CarrosTit"><div class="modal-topo"><h3 id="c5CarrosTit">Carros no pátio sem conversa</h3><button type="button" class="modal-x" data-c5="fechar-carros" aria-label="Fechar">×</button></div><div class="modal-corpo" id="c5CarrosCorpo"></div></div>';
      document.body.appendChild(m);
    }
    C.voltarFoco = document.activeElement;
    m.classList.add('aberto');
    document.getElementById('c5CarrosCorpo').innerHTML = '<p class="r6-vazio">Carregando…</p>';
    carregarCarros({ forcar: true }).then(pintarCarros);
  }
  function fecharCarros() {
    document.getElementById('c5Carros')?.classList.remove('aberto');
    try { C.voltarFoco?.focus?.(); } catch { /* sem foco para devolver */ }
  }
  function pintarCarros() {
    const corpo = document.getElementById('c5CarrosCorpo'); if (!corpo) return;
    const c = C.carros;
    if (!c || (!c.ok && !(c.carros || []).length)) { corpo.innerHTML = `<p class="r6-aviso">⚠️ ${esc(c?.erro || 'Não consegui ler os carros do pátio agora.')} <button type="button" class="r6-link" data-c5="carros-recarregar">Tentar de novo</button></p>`; return; }
    const lista = c.carros || [];
    if (!lista.length) { corpo.innerHTML = '<p class="r6-vazio">🎉 Todos os carros que estão na oficina já têm conversa aberta.</p>'; return; }
    corpo.innerHTML = '<small class="r6-sub">Cliente com o carro na oficina e nenhuma conversa aberta. O que está pronto vem primeiro. Nada é enviado daqui: você abre a conversa e escreve.</small>'
      + lista.map((x, i) => `<article class="r6-card c5-carro${x.etapa === 'pronto' ? ' c5-pronto' : ''}" data-i="${i}">
        <div class="r6-card-topo"><b>${esc(x.nome || 'Cliente sem nome')}</b><span class="r6-selo r6-tom-${x.etapa === 'pronto' ? 'ok' : 'neutro'}">${esc(x.etapa_rotulo)}</span></div>
        <small>${esc([x.carro, x.placa].filter(Boolean).join(' · ') || 'carro sem dados')} · OS nº ${esc(x.numero ?? '—')}${x.min_na_etapa != null ? ' · há ' + esc(R.rotuloMinutos(x.min_na_etapa)) + ' nesta etapa' : ''}</small>
        <div class="r6-botoes">
          <button type="button" class="r6-btn" data-c5="carro-conversa" data-i="${i}" ${x.telefone ? '' : 'disabled title="Sem telefone no cadastro"'}>💬 Abrir conversa</button>
          <button type="button" class="r6-btn r6-sec" data-c5="carro-patio" data-i="${i}">Abrir no Pátio ↗</button>
          ${x.telefone ? `<button type="button" class="r6-btn r6-sec" data-c5="carro-copiar" data-i="${i}">📋 Copiar telefone</button>` : ''}
        </div></article>`).join('');
    corpo.querySelector('button:not([disabled])')?.focus();
  }
  async function abrirConversaDoCarro(x) {
    const digitos = String(x.telefone || '').replace(/\D/g, '');
    if (digitos.length < 10) return toast('⚠️ Esse cliente está sem telefone válido no cadastro.');
    fecharCarros();
    let conversaId = null;
    try {
      const r = await fetch(`/api/conversa-por-telefone?t=${encodeURIComponent(digitos)}`, { headers: await authCabecalhos() });
      if (r.ok) conversaId = (await r.json())?.conversaId || null;
    } catch { /* tenta pelo formulário de nova conversa */ }
    if (conversaId) return abrirConversa(conversaId, { focarCampo: true });
    const tel = $('#novaTelefone'), nome = $('#novaNome');
    if (tel) tel.value = typeof telefoneBonito === 'function' ? telefoneBonito(digitos.replace(/^55/, '')) : digitos;
    if (nome) nome.value = x.nome || '';
    abrirModalNova();
    toast('Conferi: ainda não há conversa com esse número. Confira e abra uma nova.');
  }

  /* ======================= LISTA: marcar visíveis como lidas ======================= */
  async function marcarVisiveisComoLidas() {
    const lista = (typeof conversasFiltradas === 'function' ? conversasFiltradas() : []).filter((c) => c.nao_lidas > 0).slice(0, 100);
    if (!lista.length) return toast('Tudo lido por aqui. ✉');
    if (!confirm(`Marcar ${lista.length} conversa${lista.length > 1 ? 's' : ''} como lida${lista.length > 1 ? 's' : ''}? As mensagens continuam lá; só some o contador.`)) return;
    const ids = lista.map((c) => c.id);
    const { error } = await sb.from('conversas').update({ nao_lidas: 0 }).in('id', ids);
    if (error) return toast('⚠️ Não consegui marcar agora: ' + error.message);
    for (const c of lista) c.nao_lidas = 0;
    toast(`✔ ${ids.length} conversa${ids.length > 1 ? 's' : ''} marcada${ids.length > 1 ? 's' : ''} como lida${ids.length > 1 ? 's' : ''}`);
    if (typeof renderConversas === 'function') renderConversas();
    if (typeof atualizarBadge === 'function') atualizarBadge();
    atualizarFilaAgora();
  }

  /* ======================= RELATÓRIOS: funil do Orçador (gestor) ======================= */
  const diasDoPeriodo = () => {
    const de = document.getElementById('relDe')?.value, ate = document.getElementById('relAte')?.value;
    const a = Date.parse(de + 'T12:00:00'), b = Date.parse(ate + 'T12:00:00');
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 30;
    return Math.max(1, Math.min(90, Math.round((b - a) / 86400000) + 1));
  };
  const pct = (x) => (x == null ? '—' : String(x).replace('.', ',') + '%');
  const cabFunil = (sub) => `<div class="bloco-cab"><div><h2>🧾 Orçamentos no Orçador</h2><p class="bloco-sub">${esc(sub)}</p></div><button type="button" class="btn btn-ghost sm" data-c5="abrir-orcador">Abrir o Orçador ↗</button></div>`;
  const kpiFunil = (cor, titulo, valor, sub) => `<div class="kpi ${cor}"><span>${esc(titulo)}</span><b>${esc(valor)}</b><small>${esc(sub)}</small></div>`;
  async function pintarFunilRelatorio() {
    const corpo = document.getElementById('relCorpo');
    if (!corpo || !corpo.querySelector('.kpis') || corpo.querySelector('#c5RelOrc')) return;
    if (typeof perfil === 'undefined' || !perfil || !['admin', 'gestor'].includes(perfil.papel)) return;
    const dias = diasDoPeriodo();
    const sec = document.createElement('section');
    sec.className = 'bloco-rel c5-rel'; sec.id = 'c5RelOrc'; sec.setAttribute('data-c5-inj', '');
    sec.innerHTML = '<div class="bloco-cab"><div><h2>🧾 Orçamentos no Orçador</h2><p class="bloco-sub">Carregando…</p></div></div>';
    corpo.querySelector('.kpis').insertAdjacentElement('afterend', sec);
    const r = await api('/api/r6/c5/funil?dias=' + dias).catch(() => ({ ok: false, status: 0 }));
    if (!sec.isConnected) return;
    if (!r.ok) {
      const msg = !navigator.onLine ? 'Sem internet agora.' : r.status === 403 ? 'Só gestor ou administrador vê o desempenho do Orçador.' : (r.erro || 'Não consegui ver o Orçador agora.');
      sec.innerHTML = cabFunil('Últimos ' + dias + ' dias') + `<div class="grafico-vazio">⚠️ ${esc(msg)}<br><br><button type="button" class="btn btn-ghost sm" data-c5="funil-recarregar">Tentar de novo</button></div>`;
      return;
    }
    if (!r.enviados && !r.criados) { sec.innerHTML = cabFunil('Últimos ' + dias + ' dias') + '<div class="grafico-vazio">Nenhum orçamento foi montado nesse período.</div>'; return; }
    const motivos = r.por_motivo.map((m) => esc(m.rotulo) + ' (' + esc(m.quantidade) + ')').join(' · ');
    sec.innerHTML = cabFunil('Últimos ' + (r.periodo_dias || dias) + ' dias, contados de hoje. Vem direto do Orçador.')
      + '<div class="kpis">'
      + kpiFunil('roxa', 'Enviados', String(r.enviados), r.nunca_enviados ? r.nunca_enviados + ' montados e nunca enviados' : 'ao cliente')
      + kpiFunil('laranja', 'Abriram', String(r.vistos), pct(r.taxa_visto) + ' dos enviados' + (r.mediana_ver_h != null ? ' · em ' + String(r.mediana_ver_h).replace('.', ',') + ' h' : ''))
      + kpiFunil('verde', 'Aprovados', String(r.aprovados), pct(r.taxa_aprovacao) + ' dos enviados' + (r.valor_aprovado != null ? ' · ' + reais(r.valor_aprovado) : ''))
      + kpiFunil('vermelha', 'Recusados', String(r.recusados), r.valor_perdido != null ? reais(r.valor_perdido) + ' deixados na mesa' : 'no período')
      + '</div>'
      + (r.por_motivo.length ? `<p class="bloco-sub"><b>Por que recusam:</b> ${motivos}</p>` : '')
      + (r.insights.length ? `<ul class="c5-insights">${r.insights.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
  }
  function observarRelatorios() {
    const corpo = document.getElementById('relCorpo');
    if (corpo) new MutationObserver(() => { if (!corpo.querySelector('#c5RelOrc')) pintarFunilRelatorio(); }).observe(corpo, { childList: true });
  }

  /* ======================= CLIQUES ======================= */
  const porId = (id) => (C.dados?.orcamentos || []).find((o) => o.id === id);
  async function acao(nome, alvo) {
    const d = C.dados;
    switch (nome) {
      case 'recarregar': { carregar(conversaAberta()); return window.R6Tela?.carregarPainel(conversaAberta()); }
      case 'abrir-orc': { const o = porId(alvo.dataset.id); return abrirSeguro('orcador', o?.abrir); }
      case 'link-orc': {
        const o = porId(alvo.dataset.id); const n = R.primeiroNome(nomeDe());
        if (o?.link_cliente && inserir(`${n ? n + ', ' : ''}aqui está o seu orçamento nº ${o.numero ?? ''} para você ver com calma: ${o.link_cliente}`)) toast('📋 Link do orçamento no campo — revise e envie');
        return;
      }
      case 'motivo': { const o = porId(alvo.dataset.id); if (inserir(textoPara('recusado', o))) toast('💬 Pergunta no campo — revise e envie'); return; }
      case 'retorno': { const o = porId(alvo.dataset.id); if (inserir(textoPara(o?.cod || 'visualizado', o))) toast('💬 Retorno no campo — revise e envie'); return; }
      case 'refazer': return abrirSeguro('orcador', d?.link_novo_orcamento);
      case 'pre-agenda': { const p = (d?.pre_agendamentos || []).find((x) => x.id === alvo.dataset.id); return abrirSeguro('agenda', p?.abrir); }
      case 'pre-responder': {
        const p = (d?.pre_agendamentos || []).find((x) => x.id === alvo.dataset.id); if (!p) return;
        const quando = `${diaSemana(p.data)} ${dataCurta(p.data)}${p.hora ? ' às ' + p.hora : ''}`;
        if (inserir(textoPara('pre_agendamento', null, { quando }))) toast('💬 Resposta no campo — revise e envie');
        return;
      }
      case 'acao-abrir': { const a = C.acoesVisiveis()[Number(alvo.dataset.i)]; return abrirSeguro(a?.app || 'central', a?.link); }
      case 'acao-texto': { const a = C.acoesVisiveis()[Number(alvo.dataset.i)]; if (a?.texto && inserir(a.texto)) toast('📋 Texto no campo — revise e envie'); return; }
      case 'carros': return abrirCarros();
      case 'fechar-carros': return fecharCarros();
      case 'carros-recarregar': { carregarCarros({ forcar: true }).then(pintarCarros); return; }
      case 'carro-conversa': return abrirConversaDoCarro(C.carros.carros[Number(alvo.dataset.i)]);
      case 'carro-patio': { const x = C.carros.carros[Number(alvo.dataset.i)]; return abrirSeguro('patio', x?.abrir); }
      case 'carro-copiar': { const x = C.carros.carros[Number(alvo.dataset.i)]; return copiarTexto(x?.telefone ? '+' + x.telefone : '', '📋 Telefone copiado'); }
      case 'lidas': return marcarVisiveisComoLidas();
      case 'abrir-orcador': return abrirSeguro('orcador', window.R6.BASES.orcador + '/');
      case 'funil-recarregar': { document.getElementById('c5RelOrc')?.remove(); return pintarFunilRelatorio(); }
      case 'copiar-telefone': { const c = conversaAberta(); return copiarTexto(c?.telefone_e164 || c?.telefone || '', '📋 Telefone copiado'); }
      default:
    }
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-c5]');
    if (b) { ev.preventDefault(); acao(b.dataset.c5, b); }
  });

  /* ======================= TECLADO ======================= */
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && document.getElementById('c5Carros')?.classList.contains('aberto')) { ev.stopPropagation(); fecharCarros(); return; }
    if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.defaultPrevented) return;
    const c = ev.code;
    if (c === 'KeyG') { ev.preventDefault(); if (C.carros && !(C.carros.carros || []).length) return toast('🎉 Todos os carros na oficina já têm conversa aberta.'); return abrirCarros(); }
    if (!conversaAberta()) return;
    if (c === 'KeyO') {
      ev.preventDefault();
      const p = principal();
      if (p) return abrirSeguro('orcador', p.abrir);
      if (C.dados?.link_novo_orcamento) { toast('Sem orçamento deste cliente: abri um novo.'); return abrirSeguro('orcador', C.dados.link_novo_orcamento); }
      return toast('⚠️ Sem conversa nem telefone válido para abrir o Orçador.');
    }
    if (c === 'KeyL') {
      ev.preventDefault();
      const b = document.querySelector('#r6Painel [data-r6="link-patio"]');
      if (!b) return toast('Este cliente não tem carro no pátio para mandar o link.');
      return b.click();
    }
    if (c === 'KeyR') { ev.preventDefault(); toast('↻ Atualizando a ficha…'); return acao('recarregar'); }
  });

  /* ======================= LIGAÇÃO COM O APP ======================= */
  window.addEventListener('indycar:conversa', (ev) => {
    const d = ev.detail || {};
    const conv = conversaAberta();
    if (!d.conversaId || !conv) { carregar(null); return; }
    carregar(conv);
  });
  window.addEventListener('indycar:mensagem', (ev) => {
    const d = ev.detail || {}; const conv = conversaAberta();
    if (conv && d.conversaId === conv.id && d.direcao === 'entrada') setTimeout(() => carregar(conv, { silencioso: true }), 2500);
  });

  function iniciar() {
    if (C.iniciou) return;
    if (typeof perfil === 'undefined' || !perfil) return;
    C.iniciou = true;
    observar();
    observarRelatorios();
    const lista = document.querySelector('.lista-ferramentas');
    if (lista && !document.getElementById('c5Lidas')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'c5Lidas'; b.className = 'btn btn-ghost btn-icone c5-lidas'; b.dataset.c5 = 'lidas';
      b.title = 'Marcar como lidas as conversas que aparecem na lista agora (até 100)'; b.setAttribute('aria-label', 'Marcar as conversas visíveis como lidas'); b.textContent = '✓✓';
      lista.appendChild(b);
    }
    carregarCarros({ forcar: true });
    clearInterval(C.timers.carros); C.timers.carros = setInterval(() => { if (visivel()) carregarCarros({ forcar: true }); }, 60_000);
    clearInterval(C.timers.conv); C.timers.conv = setInterval(() => { const c = conversaAberta(); if (c && visivel()) carregar(c, { silencioso: true }); }, 30_000);
    clearInterval(C.timers.relogio); C.timers.relogio = setInterval(() => {
      const el = document.querySelector('[data-c5-agora]');
      if (el && C.dados?.ao_vivo && C.em) { const s = Math.round((Date.now() - C.em) / 1000); el.textContent = `🟢 ao vivo · atualizado há ${s < 5 ? 'instantes' : s + ' s'}`; }
    }, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { const c = conversaAberta(); if (c) carregar(c, { silencioso: true }); carregarCarros({ forcar: true }); } });
    const c = conversaAberta(); if (c) carregar(c);
  }
  window.addEventListener('indycar:pronto', iniciar);
  setTimeout(iniciar, 2800);

  window.R6C5 = { abrirSeguro, estado: C, carregar, pintar, abrirCarros, carregarCarros, acao, marcarVisiveisComoLidas };
})();
