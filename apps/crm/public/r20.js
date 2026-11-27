/* ============================================================
   Rodada 20 (26/11/2026): CRM + Atendimento + Orçador = UM app ("CRM e Atendimento", em /crm/).

   · aba Conversas  = a caixa de entrada do Atendimento, embutida numa moldura (/atendimento/?embutido=1),
                      com a etapa do funil da conversa aberta logo acima (um toque muda)
   · aba Orçador    = o Orçador (/orcador/), com a mesma sessão
   · "Ver conversa" = em cada cartão do Funil: a conversa daquele telefone abre num painel ao lado (no celular,
                      tela cheia com voltar), sem sair do CRM. No topo do painel, a etapa do cartão.
   · mudar a etapa  = moverEtapa(), a mesma função (e a mesma rota) do arrastar do funil
   · horário marcado na conversa = o Atendimento avisa e o funil recarrega: o cartão já está em "Agendado"
   · WhatsApp parado = a faixa do Atendimento, aqui em todas as abas
   · quem tem só o Atendimento entra e vê Conversas e Orçador; quem tem só o CRM não vê as Conversas

   O envio de mensagens NÃO mora aqui: tudo que fala com o WhatsApp continua dentro do Atendimento (a moldura).
   As molduras só existem na Central (mesmo endereço, mesmo login); com o CRM solto, nada disto aparece.
   Usa do app: $, $$, esc, PERFIL, TODOS, STATUSES, LABEL_STATUS, irPara, moverEtapa, travaLead, abrirModal,
   fecharModal, fecharFichaCliente, abrirPorLink, carregarLeads, toast, tratarAcesso, authCabecalhos, sb.
   ============================================================ */
(function () {
  'use strict';
  const R = window.R20Regras, Apps = window.IndyCarApps || {}, U = window.CrmUtils;
  const NA_CENTRAL = !!(Apps.CENTRAL && Apps.IRMAOS && Apps.IRMAOS.atendimento);
  const BASE_ATD = NA_CENTRAL ? Apps.urlApp('atendimento', '') : null;
  const BASE_ORC = NA_CENTRAL ? Apps.urlApp('orcador', '') : null;
  const el = (id) => document.getElementById(id);
  const fConv = el('r20MolduraConversas'), fOrc = el('r20MolduraOrcador'), fPainel = el('r20MolduraPainel');
  const VIEWS_DO_CRM = ['hoje', 'pipeline', 'clientes', 'dashboard', 'leads', 'servicos', 'equipe', 'distribuir'];
  const NADA = { crm: true, conversas: false, orcador: false, entra: true, inicio: 'hoje' };
  const st = {
    carregouConversas: false, carregouOrcador: false, proximaMoldura: null, proximoOrcador: null,
    conversa: null,          // conversa aberta na aba Conversas: { telefone, nome, conversa }
    painel: null,            // painel do funil: { leadId, telefone, nome, deOnde }
    painelPronto: false, zap: null, zapTimer: null, recarregar: false, entradaLida: false,
  };

  const modoDe = (p) => (p ? R.modoDaPessoa((app) => U.acessoApp(p, app).ok, NA_CENTRAL) : NADA);
  const modo = () => modoDe(typeof PERFIL !== 'undefined' ? PERFIL : null);
  const soConversas = () => { const m = modo(); return m.conversas && !m.crm; };
  const podeEntrarSemCrm = (p) => modoDe(p).conversas;
  const abaDeReserva = () => (soConversas() ? 'conversas' : 'dashboard');
  const falar = (moldura, recado) => { try { moldura.contentWindow?.postMessage(recado, location.origin); } catch { /* moldura ainda vazia */ } };
  const temaAgora = () => (document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro');
  const abaAtiva = () => document.querySelector('.view.active')?.id.replace('view-', '') || '';

  /* ---------------- o que cada login vê ---------------- */
  function aplicarModo() {
    const m = modo();
    el('navConversas').hidden = !m.conversas;
    el('navOrcador').hidden = !m.orcador;
    el('mpAjustes').hidden = !m.conversas;
    if (!m.crm) for (const v of VIEWS_DO_CRM) for (const b of document.querySelectorAll(`[data-view="${v}"]`)) b.hidden = true;
    else for (const v of ['hoje', 'pipeline', 'clientes', 'dashboard', 'leads', 'servicos']) for (const b of document.querySelectorAll(`[data-view="${v}"]`)) b.hidden = false;
    document.body.classList.toggle('r20-so-conversas', m.conversas && !m.crm);
    if (m.conversas) vigiarZap(); else pararZap();
    medir();
  }

  /* ---------------- alturas: as molduras ocupam o que sobra abaixo do topo (e acima das abas, no celular) ---------------- */
  function medir() {
    const topo = document.querySelector('.ic-topo'), abas = document.querySelector('.ic-abas'), zap = el('r20Zap');
    if (!topo) return;
    const embaixo = abas && getComputedStyle(abas).position === 'fixed';
    const raiz = document.documentElement.style;
    raiz.setProperty('--r20-topo', (topo.offsetHeight + (zap && !zap.hidden ? zap.offsetHeight : 0)) + 'px');
    raiz.setProperty('--r20-pe', (embaixo ? abas.offsetHeight : 0) + 'px');
  }
  window.addEventListener('resize', medir);
  if (typeof ResizeObserver === 'function') { const o = new ResizeObserver(medir); for (const s of ['.ic-topo', '#r20Zap']) { const x = document.querySelector(s); if (x) o.observe(x); } }

  /* ---------------- abas Conversas e Orçador ---------------- */
  function carregarConversas() {
    if (!modo().conversas) return;
    if (!st.carregouConversas || st.proximaMoldura !== null) {
      fConv.src = R.enderecoDaMoldura(BASE_ATD, st.proximaMoldura || '');
      st.carregouConversas = true; st.proximaMoldura = null; st.conversa = null;
      pintarEtapaDasConversas();
    } else falar(fConv, { tipo: 'indycar:atd-aba', aba: 'conversas' });
  }
  function carregarOrcador() {
    if (!modo().orcador) return;
    if (!st.carregouOrcador || st.proximoOrcador !== null) {
      fOrc.src = BASE_ORC + (st.proximoOrcador || '');
      st.carregouOrcador = true; st.proximoOrcador = null;
    }
  }
  /** Ajustes do Atendimento (WhatsApp e chaves, IA, respostas prontas, etapas, equipe) dentro da aba Conversas. */
  function abrirAjustes(aba = 'config') {
    if (!modo().conversas) return;
    if (!R.AJUSTES_ATD.includes(aba)) aba = 'config';
    if (!st.carregouConversas) { st.proximaMoldura = 'aba=' + aba; irPara('conversas'); return; }
    irPara('conversas');
    falar(fConv, { tipo: 'indycar:atd-aba', aba });
  }
  el('r20Ajustes').addEventListener('click', () => abrirAjustes('config'));
  el('r20ZapBtn').addEventListener('click', () => abrirAjustes('integracoes'));

  document.addEventListener('indycar:aba', (e) => {
    const aba = e.detail?.aba;
    document.body.classList.toggle('r20-cheia-on', aba === 'conversas' || aba === 'orcador');
    if (st.entradaLida) {   // antes disso quem decide o que carrega é o endereço de entrada (aoAbrir)
      if (aba === 'conversas') carregarConversas();
      if (aba === 'orcador') carregarOrcador();
    }
    if (aba !== 'pipeline' && st.painel) fecharPainel({ focar: false });
    /* o endereço acompanha a aba (dá para favoritar /crm/#conversas); o "#…" do link de senha nova não é tocado */
    if (st.entradaLida && !/access_token|type=/.test(location.hash)) {
      const nome = R.ENDERECO_DA_ABA[aba];
      try { history.replaceState(null, '', location.pathname + location.search + (nome ? '#' + nome : '')); } catch { /* sem history */ }
    }
    medir();
  });

  /** Depois da primeira carga: lê o endereço de entrada (#conversas, links antigos do Atendimento) e abre a tela pedida. */
  function aoAbrir() {
    if (st.entradaLida) return;
    const e = R.lerEntrada(location.search, location.hash);
    const m = modo();
    if (e.limpar) { try { history.replaceState(null, '', location.pathname); } catch { /* sem history */ } }
    st.entradaLida = true;
    let aba = e.aba || (soConversas() ? 'conversas' : null);
    if (aba === 'conversas' && !m.conversas) aba = null;
    if (aba === 'orcador' && !m.orcador) aba = null;
    if (!aba) {
      /* sem pedido no endereço: fica a aba da última visita; se for Conversas ou Orçador, a moldura carrega agora */
      const atual = (document.querySelector('.view.active')?.id || '').replace('view-', '');
      if ((atual === 'conversas' && m.conversas) || (atual === 'orcador' && m.orcador)) irPara(atual);
      if (atual !== 'conversas' && m.conversas) setTimeout(preCarregar, 3500);
      return;
    }
    if (aba === 'conversas' && e.moldura) st.proximaMoldura = e.moldura;
    if (aba === 'orcador' && e.orcador !== null) st.proximoOrcador = e.orcador;
    irPara(aba);
    if (aba !== 'conversas' && m.conversas) setTimeout(preCarregar, 3500);
  }
  /** As conversas carregam por trás para a aba abrir na hora e o número de não lidas aparecer no topo. */
  function preCarregar() {
    if (st.carregouConversas || !modo().conversas || document.body.classList.contains('deslogado')) return;
    fConv.src = R.enderecoDaMoldura(BASE_ATD, '');
    st.carregouConversas = true;
  }

  /* ---------------- etapa do funil na conversa ---------------- */
  const cartaoDe = (ctx) => {
    if (!ctx || typeof TODOS === 'undefined') return null;
    if (ctx.leadId) { const l = TODOS.find((x) => String(x.id) === String(ctx.leadId)); if (l) return l; }
    return R.cartaoDoTelefone(TODOS, ctx.telefone);
  };
  function pintarEtapa(alvo, ctx, { comNome = false } = {}) {
    if (!alvo) return;
    if (!ctx || !modo().crm) { alvo.hidden = true; alvo.innerHTML = ''; return; }
    const l = cartaoDe(ctx);
    alvo.hidden = false;
    if (!l) {
      alvo.innerHTML = `<span class="r20-etapa-rot">Funil</span><span class="r20-etapa-nota">Este cliente ainda não tem cartão no funil.</span>
        <button type="button" class="btn btn-ghost sm" data-r20-criar>Criar contato</button>`;
      return;
    }
    const trava = travaLead(l);
    alvo.dataset.lead = l.id;
    alvo.innerHTML = `<span class="r20-etapa-rot">Etapa</span>${comNome ? `<span class="r20-etapa-quem">${esc(l.nome)}</span>` : ''}
      <div class="r20-etapas" role="group" aria-label="Mudar a etapa de ${esc(l.nome)} no funil"${trava ? ` title="${esc(trava)}"` : ''}>
        ${STATUSES.map((s) => `<button type="button" class="r20-et${s === l.status ? ' atual' : ''}" data-etapa="${esc(s)}" aria-pressed="${s === l.status}"${trava && s !== l.status ? ' disabled' : ''}>${esc(LABEL_STATUS[s] ?? s)}</button>`).join('')}
      </div>`;
    alvo.querySelector('.r20-et.atual')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  const pintarEtapaDasConversas = () => {
    pintarEtapa(el('r20EtapaConversas'), st.conversa, { comNome: true });
    el('r20DicaConversas').hidden = !el('r20EtapaConversas').hidden;
  };
  const pintarEtapaDoPainel = () => { if (st.painel) pintarEtapa(el('r20EtapaPainel'), st.painel); };
  function aoDesenharFunil() { pintarEtapaDasConversas(); pintarEtapaDoPainel(); }

  async function cliqueNaEtapa(e, ctx) {
    const criar = e.target.closest('[data-r20-criar]');
    if (criar && ctx) { abrirModal(null, { nome: ctx.nome || '', telefone: ctx.telefone || '' }); return; }
    const b = e.target.closest('.r20-et');
    if (!b || b.disabled || b.classList.contains('atual')) return;
    const l = cartaoDe(ctx);
    if (!l) return;
    const todos = [...b.parentElement.querySelectorAll('.r20-et')];
    todos.forEach((x) => { x.disabled = true; });
    try { await moverEtapa(l.id, b.dataset.etapa); }   // a mesma mudança do arrastar: pergunta o motivo da perda e o valor pago, e deixa desfazer
    finally { aoDesenharFunil(); }
  }
  el('r20EtapaConversas').addEventListener('click', (e) => cliqueNaEtapa(e, st.conversa));
  el('r20EtapaPainel').addEventListener('click', (e) => cliqueNaEtapa(e, st.painel));

  /* ---------------- "Ver conversa": o painel do funil ---------------- */
  function botaoDoCartao(l) {
    if (!modo().conversas || !R.tel(l?.telefone)) return '';
    return `<button type="button" class="kb-conversa" data-lead="${esc(l.id)}" aria-label="Ver conversa com ${esc(l.nome)}">Ver conversa</button>`;
  }
  function verConversa(leadId) {
    const l = TODOS.find((x) => String(x.id) === String(leadId));
    if (!l) return;
    abrirPainel({ leadId: l.id, telefone: R.tel(l.telefone), nome: l.nome || '' });
  }
  function verConversaDoTelefone(telefone, nome) {
    const t = R.tel(telefone);
    if (!t || !modo().conversas) return false;
    const l = modo().crm ? R.cartaoDoTelefone(TODOS, t) : null;
    abrirPainel({ leadId: l?.id || null, telefone: t, nome: nome || l?.nome || '' });
    return true;
  }
  function abrirPainel(ctx) {
    if (!modo().conversas || !ctx.telefone) return;
    const painel = el('r20Painel');
    st.painel = { ...ctx, deOnde: document.activeElement };
    el('r20PainelNome').textContent = ctx.nome || 'Conversa';
    el('r20PainelSub').textContent = U.formatarTelefone(ctx.telefone);
    el('r20PainelFicha').hidden = !ctx.leadId || !modo().crm;
    painel.hidden = false;
    document.body.classList.add('r20-com-painel');
    pintarEtapaDoPainel();
    /* a moldura já aberta troca de conversa por recado (rápido); a primeira vez carrega a página só com a conversa */
    if (st.painelPronto) falar(fPainel, { tipo: 'indycar:atd-abrir', tel: ctx.telefone, nome: ctx.nome || '' });
    else fPainel.src = R.enderecoDaMoldura(BASE_ATD, new URLSearchParams({ tel: ctx.telefone, nome: (ctx.nome || '').slice(0, 60) }).toString(), { painel: true });
    medir();
    el('r20PainelFechar').focus();
  }
  function fecharPainel({ focar = true } = {}) {
    const painel = el('r20Painel');
    if (painel.hidden) return;
    const volta = st.painel?.deOnde;
    painel.hidden = true; st.painel = null;
    document.body.classList.remove('r20-com-painel');
    if (focar && volta && document.contains(volta)) { try { volta.focus(); } catch { /* elemento redesenhado */ } }
  }
  el('r20PainelFechar').addEventListener('click', () => fecharPainel());
  el('r20PainelFicha').addEventListener('click', () => { const id = st.painel?.leadId; if (id) abrirModal(id); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || el('r20Painel').hidden || e.defaultPrevented) return;
    if (document.querySelector('dialog[open], .modal-bg.open') || !el('menuPerfil').hidden) return;
    fecharPainel();
  });

  /* Todo link para o Atendimento ou para o Orçador (ficha do contato, ficha do cliente, lista de clientes, "Cliente
     esperando", "Novo orçamento", atalho W) abre DENTRO do app: antes abria outra aba, que agora só voltaria para cá.
     Quem chama é o desvio de links da rodada 6 (rodada6.js). Devolve true quando abriu aqui. */
  function abrirDentro(href) {
    if (!NA_CENTRAL) return false;
    let u, a, o;
    try { u = new URL(String(href), location.href); a = new URL(BASE_ATD, location.href); o = new URL(BASE_ORC, location.href); } catch { return false; }
    if (u.origin !== location.origin) return false;
    const noAtd = u.pathname === a.pathname || u.pathname === a.pathname + 'index.html';
    const noOrc = u.pathname === o.pathname || u.pathname === o.pathname + 'index.html';
    const m = modo();
    if (!(noAtd && m.conversas) && !(noOrc && m.orcador)) return false;
    if (typeof modal !== 'undefined' && modal.classList.contains('open') && !fecharModal()) return true;   // ficha com mudança não salva: a pessoa decidiu ficar
    if (typeof modalCli !== 'undefined' && modalCli.classList.contains('open')) fecharFichaCliente();
    if (noOrc) {
      st.proximoOrcador = R.enderecoDoOrcador(u.search + u.hash) || '';
      fecharPainel({ focar: false });
      irPara('orcador');
      return true;
    }
    const t = R.telDoLink(u.href, BASE_ATD, location.origin);
    if (t) return verConversaDoTelefone(t, '');
    const e = R.lerEntrada('?aba=conversas&atd=' + encodeURIComponent(u.search.slice(1)), u.hash);
    if (e.aba === 'orcador' && m.orcador) { st.proximoOrcador = e.orcador || ''; fecharPainel({ focar: false }); irPara('orcador'); return true; }
    if (e.moldura) st.proximaMoldura = e.moldura;
    fecharPainel({ focar: false });
    irPara('conversas');
    return true;
  }

  /* ---------------- recados das molduras ---------------- */
  window.addEventListener('message', async (ev) => {
    if (ev.origin !== location.origin) return;
    const de = ev.source === fConv.contentWindow ? 'conversas' : ev.source === fPainel.contentWindow ? 'painel' : ev.source === fOrc.contentWindow ? 'orcador' : null;
    const d = ev.data;
    if (!de || !d || typeof d.tipo !== 'string') return;
    switch (d.tipo) {
      case 'indycar:atd-pronto':
        if (de === 'painel') st.painelPronto = true;
        falar(de === 'painel' ? fPainel : fConv, { tipo: 'indycar:tema', tema: temaAgora() });
        break;
      case 'indycar:atd-conversa':
        if (de === 'conversas') {
          const t = R.tel(d.telefone);
          st.conversa = t ? { telefone: t, nome: String(d.nome || '').slice(0, 80), conversa: d.conversa || null } : null;
          pintarEtapaDasConversas();
        } else if (de === 'painel' && st.painel && !st.painel.nome && d.nome && R.tel(d.telefone) === st.painel.telefone) {
          st.painel.nome = String(d.nome).slice(0, 80); el('r20PainelNome').textContent = st.painel.nome;
        }
        break;
      case 'indycar:atd-nao-lidas': {
        if (de !== 'conversas') break;
        const n = Math.max(0, Math.floor(Number(d.n) || 0));
        el('navConversas').dataset.badge = n ? (n > 99 ? '99+' : String(n)) : '';
        el('navConversas').setAttribute('aria-label', n ? `Conversas, ${n} não lida${n === 1 ? '' : 's'}` : 'Conversas');
        break;
      }
      case 'indycar:atd-agendou':
        if (de === 'orcador' || !modo().crm) break;
        try { await carregarLeads(); toast('📅 Horário marcado: o cartão está em Agendado no funil.', 4500); } catch { /* o funil recarrega na próxima volta */ }
        break;
      case 'indycar:abrir-orcador': {
        if (de === 'orcador' || !modo().orcador) break;
        const fim = R.enderecoDoOrcador(d.endereco);
        if (fim === null) break;
        st.proximoOrcador = fim;
        fecharPainel({ focar: false });
        irPara('orcador');
        break;
      }
      case 'indycar:abrir-conversa':
        if (de !== 'orcador' || !modo().conversas || !U.ehUuid(String(d.conversa || ''))) break;
        if (st.carregouConversas) { irPara('conversas'); falar(fConv, { tipo: 'indycar:atd-abrir', conversa: d.conversa }); }
        else { st.proximaMoldura = 'conversa=' + d.conversa; irPara('conversas'); }
        break;
      case 'indycar:abrir-crm': {
        if (de === 'orcador' || !modo().crm) break;
        const p = R.pedidoDoCrm(d.endereco, location.origin);
        if (p) abrirPorLink(p);
        break;
      }
      case 'indycar:atd-sem-sessao':
      case 'indycar:atd-entrar': {
        if (de === 'orcador') break;
        st.recarregar = true;
        let tem = false;
        try { tem = !!(await sb.auth.getSession())?.data?.session; } catch { /* sem sessão */ }
        if (!tem || d.tipo === 'indycar:atd-entrar') tratarAcesso('login');
        break;
      }
    }
  });

  /* entrou de novo: as molduras recomeçam com a sessão nova */
  if (typeof MutationObserver === 'function') {
    let estava = document.body.classList.contains('deslogado');
    new MutationObserver(() => {
      const agora = document.body.classList.contains('deslogado');
      if (estava && !agora && st.recarregar) {
        st.recarregar = false; st.painelPronto = false;
        if (st.carregouConversas) fConv.src = R.enderecoDaMoldura(BASE_ATD, '');
        if (st.painel) fPainel.src = R.enderecoDaMoldura(BASE_ATD, new URLSearchParams({ tel: st.painel.telefone }).toString(), { painel: true });
      }
      if (!estava && agora) { fecharPainel({ focar: false }); st.recarregar = st.recarregar || st.carregouConversas; }
      estava = agora;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    /* o tema escolhido aqui vale para as conversas embutidas */
    new MutationObserver(() => { for (const f of [fConv, fPainel]) falar(f, { tipo: 'indycar:tema', tema: temaAgora() }); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  }

  /* ---------------- WhatsApp parado (a mesma resposta do Atendimento) ---------------- */
  async function verZap() {
    if (!modo().conversas || document.visibilityState !== 'visible' || document.body.classList.contains('deslogado')) return;
    let r = null;
    try {
      const resp = await fetch(BASE_ATD + 'api/r18/zap', { headers: await authCabecalhos(), signal: AbortSignal.timeout(15000) });
      if (!resp.ok) return;          // sem resposta boa: não inventa nem apaga o que está na tela
      r = await resp.json();
    } catch { return; }
    const antes = st.zap;
    st.zap = r && r.parado ? r : null;
    const t = R.textoZap(st.zap), faixa = el('r20Zap');
    faixa.hidden = !t;
    if (t) {
      el('r20ZapTitulo').textContent = t.titulo + '.';
      el('r20ZapSituacao').textContent = t.situacao;
      el('r20ZapAcao').textContent = t.acao;
      el('r20ZapBtn').hidden = PERFIL?.papel !== 'admin';
    } else if (antes) toast('✅ O WhatsApp voltou.', 4500);
    medir();
  }
  function vigiarZap() {
    if (st.zapTimer) return;
    verZap();
    st.zapTimer = setInterval(verZap, 120000);
  }
  function pararZap() { clearInterval(st.zapTimer); st.zapTimer = null; el('r20Zap').hidden = true; }
  document.addEventListener('visibilitychange', () => { if (st.zapTimer) verZap(); });

  window.R20Tela = { aplicarModo, aoAbrir, soConversas, podeEntrarSemCrm, abaDeReserva, botaoDoCartao, verConversa, verConversaDoTelefone, abrirDentro, abrirAjustes, aoDesenharFunil, fecharPainel, verZap, medir, get estado() { return st; } };
})();
