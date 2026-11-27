/* ============================================================
   Rodada 20 (26/11/2026): o Atendimento dentro do app "CRM e Atendimento".
   Embutido numa moldura do CRM (apps.js decide: IndyCarApps.embutido / .painel), este arquivo é a conversa entre os
   dois: avisa o app de fora da conversa aberta, das não lidas e da sessão que caiu, e atende os pedidos dele
   (abrir a conversa de um telefone, ir para Ajustes, trocar o tema). Nada aqui envia mensagem a cliente.
   Usa do app.js: abrirPeloEndereco, abrirModalNova, aplicarTema, clienteSupabase, telefoneBonito.
   ============================================================ */
(function () {
  'use strict';
  const A = window.IndyCarApps || {};
  const $ = (s) => document.querySelector(s);
  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Painel do funil sem conversa para o telefone: diz isso e oferece começar. Devolve false fora do painel. */
  function semConversa(digitos, nome) {
    if (!A.painel) return false;
    const el = $('#r20SemConversa');
    if (!el) return false;
    const quem = String(nome || '').trim().slice(0, 60);
    $('#r20SemConversaTxt').textContent = `${quem || 'O número ' + telefoneBonito(digitos)} ainda não tem conversa no WhatsApp da oficina.`;
    if (typeof fecharConversa === 'function') fecharConversa();   // o painel estava em outra conversa: ela sai da tela
    el.hidden = false;
    el.dataset.tel = digitos;
    A.avisarPai('indycar:atd-conversa', { conversa: null, telefone: digitos, nome: quem || null, semConversa: true });
    return true;
  }
  window.R20 = { semConversa };
  $('#r20Comecar')?.addEventListener('click', () => {
    const tel = $('#r20SemConversa')?.dataset.tel || '';
    $('#novaTelefone').value = telefoneBonito(tel);
    abrirModalNova();   // a pessoa confere o número e escreve a primeira mensagem: nada sai sozinho
  });

  if (!A.embutido) return;

  /* ---------- 1) conversa aberta e não lidas vão para o app de fora ---------- */
  window.addEventListener('indycar:conversa', (e) => {
    const d = e.detail || {};
    if (d.conversaId) { const v = $('#r20SemConversa'); if (v) v.hidden = true; }
    A.avisarPai('indycar:atd-conversa', { conversa: d.conversaId || null, cliente: d.clienteId || null, telefone: d.telefone || null, nome: d.nome || null });
  });
  const badge = $('#badgeNaoLidas');
  const avisarNaoLidas = () => A.avisarPai('indycar:atd-nao-lidas', { n: badge && !badge.hidden ? Number(String(badge.textContent).replace(/\D/g, '')) || 0 : 0 });
  if (badge && typeof MutationObserver === 'function') new MutationObserver(avisarNaoLidas).observe(badge, { attributes: true, childList: true, characterData: true, subtree: true });

  /* ---------- 2) pedidos do app de fora ---------- */
  const irParaAba = (aba) => {
    const b = [...document.querySelectorAll('.nav-item')].find((x) => x.dataset.aba === aba && !x.hidden);
    if (b && !document.getElementById('aba-' + aba)?.classList.contains('ativa')) b.click();
    return !!b;
  };
  window.addEventListener('message', (ev) => {
    if (ev.source !== window.parent || ev.origin !== location.origin) return;
    const d = ev.data;
    if (!d || typeof d.tipo !== 'string') return;
    if (d.tipo === 'indycar:atd-abrir') {
      const p = new URLSearchParams();
      if (RE_UUID.test(String(d.conversa || ''))) p.set('conversa', d.conversa);
      const tel = String(d.tel || '').replace(/\D/g, '');
      if (tel.length >= 10 && tel.length <= 13) p.set('tel', tel);
      if (d.nome) p.set('nome', String(d.nome).slice(0, 60));
      if (!p.has('conversa') && !p.has('tel')) return;
      irParaAba('conversas');
      abrirPeloEndereco(p);
    } else if (d.tipo === 'indycar:atd-aba') {
      if (/^[a-z]{3,20}$/.test(String(d.aba || ''))) irParaAba(d.aba);
    } else if (d.tipo === 'indycar:tema') {
      if (d.tema === 'claro' || d.tema === 'escuro') aplicarTema(d.tema, { salvar: false });
    }
  });

  /* ---------- 3) sem sessão: quem mostra a tela de entrar é o app de fora ---------- */
  const raiz = document.documentElement;
  let conferida = false, avisou = false;
  function semSessao() {
    raiz.classList.add('r20-sem-sessao');
    if (!avisou) { avisou = true; A.avisarPai('indycar:atd-sem-sessao'); }
  }
  function conferir() {
    const login = $('#telaLogin'), form = $('#formLogin'), app = $('#telaApp');
    if (!login || !form || !app) return;
    if (!app.hidden) { conferida = true; avisou = false; raiz.classList.remove('r20-sem-sessao'); A.avisarPai('indycar:atd-pronto'); return; }
    if (conferida && !login.hidden && !form.hidden) semSessao();
  }
  if (typeof MutationObserver === 'function') {
    const obs = new MutationObserver(conferir);
    for (const id of ['telaApp', 'telaLogin', 'formLogin']) { const el = document.getElementById(id); if (el) obs.observe(el, { attributes: true, attributeFilter: ['hidden'] }); }
  }
  /* primeira conferência: espera o cliente do banco existir e pergunta se há sessão guardada */
  let voltas = 0;
  const espera = setInterval(async () => {
    const sb = typeof clienteSupabase === 'function' ? clienteSupabase() : null;
    if (!sb && ++voltas < 80) return;
    clearInterval(espera);
    let tem = false;
    try { tem = !!(await sb.auth.getSession())?.data?.session; } catch { /* sem sessão */ }
    conferida = true;
    if (!tem) conferir();
  }, 250);
  $('#r20Entrar')?.addEventListener('click', () => { avisou = false; semSessao(); A.avisarPai('indycar:atd-entrar'); });
})();
