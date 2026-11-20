/* ============================================================================
   IndyCar Central — Casa (/). Login ÚNICO: a sessão do Supabase fica no
   localStorage deste domínio (chave sb-nppfqhavqahapmugnyng-auth-token), a mesma
   que Agenda, Atendimento, CRM e Comunicar leem aqui dentro — logou uma vez, vale
   para todos. Tudo pelo navegador com o RLS do banco (cada um vê só o que pode).

   Rodada 6 (21/10/2026): a Casa virou painel de comando. Este arquivo cuida do
   login e da casca; o resto mora em módulos que se registram em
   window.CasaModulos (sino.js, painel.js, tarefas.js, busca.js, atalhos.js) e
   recebem o objeto `Casa` quando a pessoa entra. As regras puras estão em
   logica.js (testadas em tests/casa-r6.test.mjs).
   ============================================================================ */
(function () {
  'use strict';
  const L = window.CasaLogica;
  const $ = (s) => document.querySelector(s);
  const esc = L.esc;
  const LS_EMAIL = 'indycar_central_email';
  const LS_ERROS = 'indycar_central_erros';

  const PAPEL = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', agenda: 'Agenda (presença)', mecanico: 'Mecânico' };
  /* ordem dos atalhos na grade (o Tráfego, chave "ads", entra por último: as teclas 1 a 6 continuam nos mesmos apps) */
  const ORDEM_APPS = ['agenda', 'atendimento', 'crm', 'comunicar', 'patio', 'orcador', 'ads'];

  let sb = null, sessao = null, perfil = null, emRecuperacao = false;
  let cfg = null, bases = L.bases(), links = L.links(bases);
  let montada = false;
  window.CasaModulos = window.CasaModulos || [];

  /* ---------------- utilidades ---------------- */
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravar = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  /* rodada 9: o que é de quem usou sai do aparelho junto com a pessoa. As buscas recentes guardam nome e telefone
     de cliente, e os avisos adiados escondiam do próximo (o dono, por exemplo) o que o anterior adiou. O e-mail
     lembrado e o tema ficam: são escolha do aparelho, marcadas na tela de entrada. */
  const LS_DA_PESSOA = ['indycar_central_buscas', 'indycar_central_sino_adiados'];
  const esquecerPessoa = () => { for (const k of LS_DA_PESSOA) gravar(k, null); };
  /**
   * Aviso curto no pé da tela. `opcao`: o tempo em ms, ou 'ok' / 'err' (o erro fica 6 s, com a cor de problema).
   * `acao` ({ rotulo, fazer }) vira um botão no aviso, como o "Desfazer". Um relógio só para todos os avisos:
   * um aviso novo nunca some antes do tempo dele por causa do relógio de um aviso anterior.
   */
  function toast(msg, opcao, acao) {
    const t = $('#toast');
    const ms = L.tempoDoAviso(opcao, !!acao);
    t.textContent = msg;
    t.dataset.tom = opcao === 'err' ? 'erro' : opcao === 'ok' ? 'ok' : '';
    if (acao && acao.rotulo && typeof acao.fazer === 'function') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-btn'; b.textContent = acao.rotulo;
      b.onclick = () => { t.hidden = true; clearTimeout(toast._t); acao.fazer(); };
      t.append(' ', b);
    }
    t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }
  function erro(el, msg) { const e = $(el); e.textContent = msg || ''; e.hidden = !msg; }
  /* rodada 9: erro nos formulários de entrada aponta o campo: aria-invalid (borda de erro) no campo certo e o foco vai
     para ele, com o texto selecionado; antes o erro aparecia embaixo e o foco ficava no botão. */
  function apontar(form, sel) {
    for (const i of $(form).querySelectorAll('input[aria-invalid]')) i.removeAttribute('aria-invalid');
    if (!sel) return;
    const i = $(sel); i.setAttribute('aria-invalid', 'true'); i.focus(); if (i.select) i.select();
  }
  function mensagemDeErro(e) {
    const m = String(e?.message || e || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha não conferem.';
    if (/email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado. Fale com o administrador.';
    if (/failed to fetch|network|load failed/i.test(m) || !navigator.onLine) return 'Sem internet agora. Confira a conexão e tente de novo.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    if (/same.*password|should be different/i.test(m)) return 'A senha nova precisa ser diferente da atual.';
    if (/weak|at least/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres.';
    return 'Não deu certo agora. Tente de novo em instantes.';
  }
  const podeUsar = (p, app) => L.podeUsar(p, app);

  /** Abre o endereço na aba NOMEADA do app ('indycar-<app>'): a Casa fica onde está e clicar de novo volta para a aba do app. */
  function abrirNaAba(url) {
    const k = L.appDoLink(url, location.origin, bases);
    if (!k) { toast('Esse endereço não é de um app da IndyCar.'); return false; }
    const w = window.open(url, L.nomeDaAba(k));
    if (!w) { toast('O navegador bloqueou a nova aba. Libere pop-ups para esta página e tente de novo.', 5000); return false; }
    try { w.focus(); } catch { /* outra origem */ }
    return true;
  }

  /* ---------------- tema ---------------- */
  function trocarTema() {
    const r = document.documentElement;
    const claro = r.getAttribute('data-tema') !== 'claro';
    r.setAttribute('data-trocando-tema', '');
    r.setAttribute('data-tema', claro ? 'claro' : 'escuro');
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', claro ? '#eef0f4' : '#070a14');
    gravar('indycar_tema', claro ? 'claro' : 'escuro');
    rotularTema();
    requestAnimationFrame(() => requestAnimationFrame(() => r.removeAttribute('data-trocando-tema')));
  }
  /** O botão do tema diz qual está valendo e para qual vai (o leitor de tela não via o estado). */
  function rotularTema() {
    const b = $('#bTema'); if (!b) return;
    const claro = document.documentElement.getAttribute('data-tema') === 'claro';
    b.setAttribute('aria-pressed', String(claro));
    b.setAttribute('aria-label', claro ? 'Tema claro ligado. Trocar para o escuro' : 'Tema escuro ligado. Trocar para o claro');
    b.title = claro ? 'Trocar para o tema escuro' : 'Trocar para o tema claro';
  }
  /** Fecha o sino e o menu do perfil e zera o "aberto" dos dois botões. `foco`: devolve o foco ao botão que estava aberto. */
  function fecharMenus(foco = false) {
    const sino = $('#painelSino'), menu = $('#menuPerfil');
    const volta = foco ? (!menu.hidden ? $('#bPerfil') : !sino.hidden ? $('#bSino') : null) : null;
    sino.hidden = true; menu.hidden = true;
    $('#bSino').setAttribute('aria-expanded', 'false'); $('#bPerfil').setAttribute('aria-expanded', 'false');
    if (volta) volta.focus();
  }

  /* ---------------- telas da entrada ---------------- */
  function mostrar(qual) {
    $('#carregando').hidden = true;
    const naCasa = qual === 'casa';
    $('#casa').hidden = !naCasa;
    $('#entrada').hidden = naCasa;
    for (const id of ['fLogin', 'fMfa', 'fSenha', 'semAcesso']) $('#' + id).hidden = id !== qual;
    if (qual === 'fLogin') setTimeout(() => ($('#lEmail').value ? $('#lSenha') : $('#lEmail')).focus(), 30);
    if (qual === 'fMfa') setTimeout(() => $('#mCodigo').focus(), 30);
    if (qual === 'fSenha') setTimeout(() => $('#sNova').focus(), 30);
  }
  function semAcesso(msg, podeTentar = false) { $('#saMotivo').textContent = msg; $('#saTentar').hidden = !podeTentar; mostrar('semAcesso'); }

  function esperaPorErros() {
    const n = Number(ler(LS_ERROS)) || 0;
    return n >= 5 ? Math.min(60, (n - 4) * 10) : 0;   // 10 s, 20 s… até 1 min
  }

  async function entrar(ev) {
    ev.preventDefault();
    erro('#lErro', '');
    const email = $('#lEmail').value.trim().toLowerCase();
    const senha = $('#lSenha').value;
    apontar('#fLogin', null);
    if (!email || !senha) { apontar('#fLogin', !email ? '#lEmail' : '#lSenha'); return erro('#lErro', !email ? 'Preencha o e-mail.' : 'Preencha a senha.'); }
    const espera = esperaPorErros();
    const ultimo = Number(ler(LS_ERROS + '_em')) || 0;
    if (espera && Date.now() - ultimo < espera * 1000) {
      return erro('#lErro', `Muitas tentativas seguidas. Espere ${Math.ceil((espera * 1000 - (Date.now() - ultimo)) / 1000)} s.`);
    }
    const b = $('#lEntrar'); b.disabled = true; b.textContent = 'Entrando…';
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      gravar(LS_ERROS, null);
      gravar(LS_EMAIL, $('#lLembrar').checked ? email : null);
      $('#lSenha').value = '';
      await depoisDoLogin();
    } catch (e) {
      if (/invalid login/i.test(String(e?.message))) { gravar(LS_ERROS, String((Number(ler(LS_ERROS)) || 0) + 1)); gravar(LS_ERROS + '_em', String(Date.now())); apontar('#fLogin', '#lSenha'); }
      erro('#lErro', mensagemDeErro(e));
    } finally { b.disabled = false; b.textContent = 'Entrar'; }
  }

  /* rodada 9: o envio do link é limitado a poucos por hora. Dois toques seguidos gastavam dois envios e o segundo
     voltava "Muitas tentativas" por cima do aviso de sucesso. Agora o botão espera a resposta e, depois de pedir,
     o mesmo e-mail só pede de novo depois de 1 minuto (com aviso de onde procurar). */
  let resetPedido = { email: '', em: 0 };
  async function esqueci() {
    const b = $('#lEsqueci');
    if (b.disabled) return;
    const email = $('#lEmail').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro('#lErro', 'Digite o seu e-mail acima e toque de novo em "Esqueci a senha".');
    if (resetPedido.email === email && Date.now() - resetPedido.em < 60_000) return toast('O link já foi pedido agora há pouco. Confira a caixa de entrada e o spam antes de pedir outro.', 6000);
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
      if (error) throw error;
      resetPedido = { email, em: Date.now() };
      erro('#lErro', '');
      toast('Se o e-mail estiver cadastrado, o link chega em instantes (o envio é limitado a poucos por hora). O administrador também pode gerar uma senha temporária.', 6000);
    } catch (e) { erro('#lErro', mensagemDeErro(e)); }
    finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  }

  async function confirmarMfa(ev) {
    ev.preventDefault();
    erro('#mErro', '');
    const code = $('#mCodigo').value.replace(/\s/g, '');
    apontar('#fMfa', null);
    if (!/^\d{6}$/.test(code)) { apontar('#fMfa', '#mCodigo'); return erro('#mErro', 'O código tem 6 números.'); }
    try {
      const { data } = await sb.auth.mfa.listFactors();
      const f = (data?.totp || []).find((x) => x.status === 'verified');
      if (!f) throw new Error('sem fator');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code });
      if (error) throw error;
      $('#mCodigo').value = '';
      await depoisDoLogin();
    } catch { erro('#mErro', 'Código não confere. Confira o horário do celular e tente de novo.'); }
  }

  async function gravarSenha(ev) {
    ev.preventDefault();
    erro('#sErro', '');
    const a = $('#sNova').value, b = $('#sRepete').value;
    apontar('#fSenha', null);
    if (a.length < 8) { apontar('#fSenha', '#sNova'); return erro('#sErro', 'Use pelo menos 8 caracteres.'); }
    if (a !== b) { apontar('#fSenha', '#sRepete'); return erro('#sErro', 'As duas senhas não são iguais.'); }
    const email = sessao?.user?.email || '';
    if (email && a.toLowerCase() === email.toLowerCase()) { apontar('#fSenha', '#sNova'); return erro('#sErro', 'A senha não pode ser o seu e-mail.'); }
    try {
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) throw error;
      if (perfil?.precisa_trocar_senha) await sb.from('perfis').update({ precisa_trocar_senha: false }).eq('id', perfil.id);
      $('#sNova').value = ''; $('#sRepete').value = '';
      emRecuperacao = false;
      toast('Senha gravada.');
      await depoisDoLogin();
    } catch (e) { erro('#sErro', mensagemDeErro(e)); }
  }
  function pedirSenha(motivo) {
    $('#sMotivo').textContent = motivo === 'recuperar' ? 'Você veio pelo link do e-mail: escolha a senha nova.'
      : motivo === 'obrigatoria' ? 'O administrador pediu para você trocar a senha antes de continuar.'
      : 'Escolha uma senha nova.';
    mostrar('fSenha');
  }

  function desmontarModulos() {
    for (const m of window.CasaModulos) { try { m.desmontar && m.desmontar(); } catch (e) { console.error('Casa: módulo', m.nome, e); } }
    montada = false;
    document.title = 'IndyCar Central';
  }
  async function sair(global) {
    desmontarModulos();
    // sem "scope" o supabase-js sai de TODOS os aparelhos (inclusive o celular do mecânico)
    try { await sb.auth.signOut({ scope: global ? 'global' : 'local' }); } catch { /* sessão já tinha ido */ }
    esquecerPessoa();
    perfil = null; sessao = null;
    fecharMenus();
    mostrar('fLogin');
    if (global) toast('Você saiu de todos os aparelhos.');
  }

  /* ---------------- depois do login ---------------- */
  async function depoisDoLogin() {
    if (emRecuperacao) return;            // veio do link do e-mail: primeiro a senha nova
    const { data: { session } } = await sb.auth.getSession();
    sessao = session;
    if (!sessao) return mostrar('fLogin');
    // MFA: quem tem fator verificado precisa do código depois da senha
    try {
      const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') return mostrar('fMfa');
    } catch { /* sem MFA */ }
    const { data: p, error } = await sb.from('perfis')
      .select('id,nome,email,papel,apps,ativo,avatar_cor,precisa_trocar_senha,cargo').eq('id', sessao.user.id).maybeSingle();
    if (error) return semAcesso('Não consegui ler o seu perfil agora (internet ou servidor). Tente de novo.', true);
    if (!p) return semAcesso('Seu login existe, mas ainda não tem perfil na equipe. Peça ao administrador para liberar.');
    if (p.ativo === false) { await sb.auth.signOut(); return semAcesso('Seu acesso foi desativado. Fale com o administrador.'); }
    perfil = p;
    if (p.precisa_trocar_senha) return pedirSenha('obrigatoria');
    montarCasa();
  }

  /** O que os módulos enxergam. */
  const Casa = {
    get sb() { return sb; },
    get perfil() { return perfil; },
    get sessao() { return sessao; },
    get bases() { return bases; },
    get links() { return links; },
    get cfg() { return cfg; },
    L, esc, toast, abrirNaAba, podeUsar: (app) => podeUsar(perfil, app), visao: () => L.visao(perfil),
    $: (s) => document.querySelector(s), irPara,
  };
  /**
   * rodada 9: "ir para" (tecla t, comandos da busca, aviso do sino) rolava a página, mas o foco ficava lá em cima: quem
   * usa teclado ou leitor de tela continuava no topo. Agora o foco vai junto (o título vira alvo de foco) e a rolagem só
   * é animada para quem não pediu menos movimento no aparelho.
   */
  function irPara(alvo, { bloco = 'start' } = {}) {
    const el = typeof alvo === 'string' ? $(alvo) : alvo;
    if (!el) return;
    let calmo = false;
    try { calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* sem matchMedia */ }
    el.scrollIntoView({ block: bloco, behavior: calmo ? 'auto' : 'smooth' });
    if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  }

  function desenharApps() {
    const meus = ORDEM_APPS.map((k) => L.APPS[k]).filter((a) => podeUsar(perfil, a.k));
    $('#gradeApps').innerHTML = meus.length ? meus.map((a) => {
      const url = bases[a.k];
      return `
      <a class="app${a.fora ? ' app-fora' : ''}" href="${esc(url)}" target="${esc(L.nomeDaAba(a.k))}" data-app="${esc(a.k)}">
        <span class="app-ico" aria-hidden="true">${a.ico}</span>
        <span class="app-nome">${esc(a.nome)}<span class="app-selo" data-app-selo="${esc(a.k)}" hidden></span></span>
        <span class="app-desc">${esc(a.desc)}${a.fora ? ' · outro endereço' : ''}</span>
      </a>`;
    }).join('') : '<p class="vazio">Nenhum app liberado para você ainda. Peça ao administrador.</p>';
  }

  function montarCasa() {
    const nome = (perfil.nome || perfil.email || '').trim();
    const curto = nome.split(/\s+/)[0] || 'equipe';
    $('#ola').textContent = L.saudacao();
    $('#nomeCurto').textContent = curto;
    $('#hoje').textContent = new Date().toLocaleDateString('pt-BR', { timeZone: L.FUSO, weekday: 'long', day: 'numeric', month: 'long' });
    const av = $('#bPerfil');
    av.textContent = (curto[0] || '?').toUpperCase();
    if (/^#[0-9a-f]{3,8}$/i.test(perfil.avatar_cor || '')) av.style.background = perfil.avatar_cor;
    $('#mpNome').textContent = nome || 'Sem nome cadastrado';
    $('#mpEmail').textContent = perfil.email || sessao.user.email || '';
    $('#mpPapel').textContent = [PAPEL[perfil.papel] || perfil.papel || '', perfil.cargo || ''].filter(Boolean).join(' · ');
    desenharApps();
    mostrar('casa');
    /* rodada 8: veio de um app sem sessão (/?voltar=): abre o app na aba com o nome dele. Se esta aba já é a do app
       (o Tráfego mandou para cá), a própria aba volta para ele; se não, abre a aba do app e a Casa fica. */
    if (voltarPedido) { const v = voltarPedido; voltarPedido = ''; abrirNaAba(v); }
    if (montada) desmontarModulos();
    montada = true;
    for (const m of window.CasaModulos) { try { m.montar && m.montar(Casa); } catch (e) { console.error('Casa: módulo', m.nome, e); } }
    if (buscaPedida) { const t = buscaPedida; buscaPedida = ''; setTimeout(() => Casa.busca && Casa.busca.abrir(t), 120); }
  }

  /* ---------------- ligações da tela ---------------- */
  function ligar() {
    $('#fLogin').addEventListener('submit', entrar);
    for (const f of ['#fLogin', '#fMfa', '#fSenha']) $(f).addEventListener('input', (e) => { if (e.target.matches('input')) e.target.removeAttribute('aria-invalid'); });
    $('#lEsqueci').addEventListener('click', esqueci);
    $('#fMfa').addEventListener('submit', confirmarMfa);
    $('#fSenha').addEventListener('submit', gravarSenha);
    $('#bTema').addEventListener('click', trocarTema);
    const caps = (e) => { if (e.getModifierState) $('#lCaps').hidden = !e.getModifierState('CapsLock'); };
    $('#lSenha').addEventListener('keyup', caps); $('#lSenha').addEventListener('keydown', caps);
    document.addEventListener('click', (e) => {
      const olho = e.target.closest('[data-olho]');
      if (olho) { const i = document.getElementById(olho.dataset.olho); i.type = i.type === 'password' ? 'text' : 'password'; olho.setAttribute('aria-label', i.type === 'password' ? 'Mostrar senha' : 'Esconder senha'); return; }
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      if (acao === 'sair') return sair(false);
      if (acao === 'sair-todos') return sair(true);
      if (acao === 'tentar') { $('#carregando').hidden = false; return depoisDoLogin().catch(() => semAcesso('Ainda sem conexão. Tente de novo em instantes.', true)); }
      if (acao === 'trocar-senha') { fecharMenus(); return pedirSenha('troca'); }
      const sino = e.target.closest('#bSino'), av = e.target.closest('#bPerfil');
      if (sino) { Casa.alternarSino ? Casa.alternarSino() : null; $('#menuPerfil').hidden = true; return; }
      if (av) {
        const m = $('#menuPerfil'); m.hidden = !m.hidden; av.setAttribute('aria-expanded', String(!m.hidden)); $('#painelSino').hidden = true; $('#bSino').setAttribute('aria-expanded', 'false');
        // rodada 9: menu de verdade: ao abrir, o foco vai para a primeira opção (setas andam; ver keydown abaixo)
        if (!m.hidden) { const primeiro = m.querySelector('[role="menuitem"]'); if (primeiro) primeiro.focus(); }
        return;
      }
      if (!e.target.closest('#painelSino, #menuPerfil')) fecharMenus();
    });
    document.addEventListener('keydown', (e) => {
      // Esc fecha o sino ou o menu e devolve o foco ao botão que abriu (antes o foco ficava num painel escondido)
      if (e.key === 'Escape' && (!$('#painelSino').hidden || !$('#menuPerfil').hidden)) fecharMenus(true);
    });
    // menu do perfil: setas, Home e End andam entre as opções; Tab sai e fecha (padrão de menu do leitor de tela)
    $('#menuPerfil').addEventListener('keydown', (e) => {
      const itens = [...$('#menuPerfil').querySelectorAll('[role="menuitem"]')];
      const i = itens.indexOf(document.activeElement);
      if (e.key === 'Tab') { fecharMenus(); return; }
      const j = e.key === 'ArrowDown' ? (i + 1) % itens.length : e.key === 'ArrowUp' ? (i - 1 + itens.length) % itens.length : e.key === 'Home' ? 0 : e.key === 'End' ? itens.length - 1 : -1;
      if (j < 0 || !itens.length) return;
      e.preventDefault(); itens[j].focus();
    });
  }

  let buscaPedida = '';
  let voltarPedido = '';   // rodada 8: /?voltar=/trafego/... volta para o app depois do login (só caminho interno; ver L.voltarSeguro)
  async function iniciar() {
    ligar();
    rotularTema();
    /* /?busca=<termo>: outros apps abrem a Casa já com a busca global preenchida (o termo sai da barra de endereço) */
    try {
      const p = new URLSearchParams(location.search);
      buscaPedida = String(p.get('busca') || '').slice(0, 80);
      voltarPedido = L.voltarSeguro(p.get('voltar') || '');
      if (p.has('busca') || p.has('voltar')) history.replaceState(history.state, '', location.pathname + location.hash);
    } catch { buscaPedida = ''; voltarPedido = ''; }
    const email = ler(LS_EMAIL); if (email) $('#lEmail').value = email;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    try {
      const r = await fetch('/api/central/config', { cache: 'no-store' });
      cfg = await r.json();
      $('#versao').textContent = cfg.versao || '';
      bases = L.bases(cfg.apps); links = L.links(bases);
    } catch { cfg = null; }
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase?.createClient) {
      mostrar('fLogin');
      return erro('#lErro', 'Não consegui falar com o servidor ou carregar o login. Confira a internet e recarregue a página.');
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    sb.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') { sessao = s; emRecuperacao = true; return pedirSenha('recuperar'); }
      if (evento === 'SIGNED_OUT' && perfil) {      // saiu em outro app/aba (a sessão é uma só neste domínio)
        desmontarModulos();
        esquecerPessoa();
        perfil = null; sessao = null; fecharMenus();
        mostrar('fLogin');
      }
    });
    await depoisDoLogin();
  }
  window.Casa = Casa;
  window.IndyCarCentral = { podeUsar, linkDaNotificacao: (n) => L.linkDaNotificacao(n, bases, location.origin), esc };   // para os testes
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
