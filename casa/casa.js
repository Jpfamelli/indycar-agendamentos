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
  /* ordem dos atalhos na grade */
  const ORDEM_APPS = ['agenda', 'atendimento', 'crm', 'comunicar', 'patio', 'orcador'];

  let sb = null, sessao = null, perfil = null, emRecuperacao = false;
  let cfg = null, bases = L.bases(), links = L.links(bases);
  let montada = false;
  window.CasaModulos = window.CasaModulos || [];

  /* ---------------- utilidades ---------------- */
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravar = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  function toast(msg, ms = 3200) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }
  function erro(el, msg) { const e = $(el); e.textContent = msg || ''; e.hidden = !msg; }
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
    requestAnimationFrame(() => requestAnimationFrame(() => r.removeAttribute('data-trocando-tema')));
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
    if (!email || !senha) return erro('#lErro', 'Preencha o e-mail e a senha.');
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
      if (/invalid login/i.test(String(e?.message))) { gravar(LS_ERROS, String((Number(ler(LS_ERROS)) || 0) + 1)); gravar(LS_ERROS + '_em', String(Date.now())); }
      erro('#lErro', mensagemDeErro(e));
    } finally { b.disabled = false; b.textContent = 'Entrar'; }
  }

  async function esqueci() {
    const email = $('#lEmail').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro('#lErro', 'Digite o seu e-mail acima e toque de novo em "Esqueci a senha".');
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
      if (error) throw error;
      erro('#lErro', '');
      toast('Se o e-mail estiver cadastrado, o link chega em instantes (o envio é limitado a poucos por hora). O administrador também pode gerar uma senha temporária.', 6000);
    } catch (e) { erro('#lErro', mensagemDeErro(e)); }
  }

  async function confirmarMfa(ev) {
    ev.preventDefault();
    erro('#mErro', '');
    const code = $('#mCodigo').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return erro('#mErro', 'O código tem 6 números.');
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
    if (a.length < 8) return erro('#sErro', 'Use pelo menos 8 caracteres.');
    if (a !== b) return erro('#sErro', 'As duas senhas não são iguais.');
    const email = sessao?.user?.email || '';
    if (email && a.toLowerCase() === email.toLowerCase()) return erro('#sErro', 'A senha não pode ser o seu e-mail.');
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
    perfil = null; sessao = null;
    $('#menuPerfil').hidden = true; $('#painelSino').hidden = true;
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
    $: (s) => document.querySelector(s),
  };

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
    $('#mpNome').textContent = nome || '—';
    $('#mpEmail').textContent = perfil.email || sessao.user.email || '';
    $('#mpPapel').textContent = [PAPEL[perfil.papel] || perfil.papel || '', perfil.cargo || ''].filter(Boolean).join(' · ');
    desenharApps();
    mostrar('casa');
    if (montada) desmontarModulos();
    montada = true;
    for (const m of window.CasaModulos) { try { m.montar && m.montar(Casa); } catch (e) { console.error('Casa: módulo', m.nome, e); } }
  }

  /* ---------------- ligações da tela ---------------- */
  function ligar() {
    $('#fLogin').addEventListener('submit', entrar);
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
      if (acao === 'trocar-senha') { $('#menuPerfil').hidden = true; return pedirSenha('troca'); }
      const sino = e.target.closest('#bSino'), av = e.target.closest('#bPerfil');
      if (sino) { Casa.alternarSino ? Casa.alternarSino() : null; $('#menuPerfil').hidden = true; return; }
      if (av) { const m = $('#menuPerfil'); m.hidden = !m.hidden; av.setAttribute('aria-expanded', String(!m.hidden)); $('#painelSino').hidden = true; $('#bSino').setAttribute('aria-expanded', 'false'); return; }
      if (!e.target.closest('#painelSino, #menuPerfil')) { $('#painelSino').hidden = true; $('#menuPerfil').hidden = true; $('#bSino').setAttribute('aria-expanded', 'false'); $('#bPerfil').setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { $('#painelSino').hidden = true; $('#menuPerfil').hidden = true; $('#bSino').setAttribute('aria-expanded', 'false'); }
    });
  }

  async function iniciar() {
    ligar();
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
        perfil = null; sessao = null; $('#menuPerfil').hidden = true; $('#painelSino').hidden = true;
        mostrar('fLogin');
      }
    });
    await depoisDoLogin();
  }
  window.Casa = Casa;
  window.IndyCarCentral = { podeUsar, linkDaNotificacao: (n) => L.linkDaNotificacao(n, bases, location.origin), esc };   // para os testes
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
