/* ===================== IndyCar Comunicar — conta.js (rodada 3) =====================
   O padrão comum de LOGIN / PERFIL / ACESSO do ecossistema IndyCar:
     • login: mostrar senha, Caps Lock, lembrar e-mail, mensagens claras,
       espera progressiva depois de 5 erros seguidos
     • esqueci a senha (link por e-mail) e tela de senha nova na volta
     • troca obrigatória (perfis.precisa_trocar_senha)
     • verificação em duas etapas (TOTP) opcional, exigida depois da senha
     • "Você não tem acesso a este app" com os apps que a pessoa pode usar
     • menu do perfil (avatar): meu perfil, trocar senha, duas etapas, tema,
       notificações, sair e sair de todos os aparelhos
     • sino de notificações (realtime + reserva de 60 s) e minhas tarefas
   Carregado ANTES do app.js; usa as utilidades dele ($, esc, api, toast,
   openModal…) só na hora da chamada. Regras da casa: esc() em todo dado.
   ================================================================================== */
(function () {
  'use strict';
  const q = (s, r = document) => r.querySelector(s);
  const qq = (s, r = document) => [...r.querySelectorAll(s)];
  const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Rodada 5: os endereços dos apps vêm de apps.js (um lugar só para o ecossistema). */
  const APPS_URL = Object.fromEntries(Object.entries((window.IndyApps && window.IndyApps.APPS) || {}).map(([k, v]) => [k, v.url]).filter(([, u]) => u));
  const RAIZ_APP = () => new URL('./', location.href).href; // '/' sozinho, '/comunicar/' na Central
  const CHAVE_EMAIL = 'indycar_email_lembrado';
  const CHAVE_ERROS = 'indycar_comunicar_erros_login';
  const PAPEL = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente' };
  const CORES = ['#e6192e', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#64748b'];
  const TIPOS_AVISO = [
    ['reclamacao', 'Cliente reclamou', 'na hora, com o texto do cliente'],
    ['aprovacao', 'Campanha esperando aprovação', 'quando um atendente propõe'],
    ['falhas', 'Régua com falhas', '3 mensagens falharam em 24 h'],
    ['resumo_semanal', 'Resumo da semana', 'toda segunda de manhã'],
  ];
  const ICONE_AVISO = { reclamacao: '😞', aprovacao: '📣', campanha: '✅', falhas: '⚠️', resumo_semanal: '📊', tarefa: '☑️', aguardando: '⏳', conversa: '💬' };

  const local = {
    ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
    gravar(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem localStorage */ } },
  };

  // ============================================================================
  // PUROS (também usados pelos testes de navegador)
  // ============================================================================
  /** Segundos de espera depois de N erros seguidos: 0 até 4; 30 s no 5º, dobrando, até 10 min. */
  function esperaDepoisDeErros(n) { return n < 5 ? 0 : Math.min(600, 30 * 2 ** (n - 5)); }

  function validarSenha(s1, s2, email) {
    const s = String(s1 || '');
    if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (s !== String(s2 || '')) return 'As duas senhas não são iguais.';
    const e = String(email || '').trim().toLowerCase();
    if (e && (s.toLowerCase() === e || s.toLowerCase() === e.split('@')[0])) return 'A senha não pode ser igual ao seu e-mail.';
    return null;
  }
  function forcaDaSenha(s) {
    s = String(s || ''); let f = 0;
    if (s.length >= 8) f++;
    if (s.length >= 12) f++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) f++;
    if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) f++;
    return f;
  }
  function mensagemDoErro(err) {
    const m = String(err?.message || err || '');
    if (navigator.onLine === false || /failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'Sem internet — confira a conexão e tente de novo.';
    if (/invalid login|invalid credentials|invalid_grant/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado. Fale com o administrador.';
    if (/banned/i.test(m)) return 'Seu acesso foi desativado. Fale com o administrador.';
    if (/rate limit|too many|429/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
    if (/same.*password|different from the old/i.test(m)) return 'A senha nova precisa ser diferente da atual.';
    if (/weak|pwned|leaked/i.test(m)) return 'Essa senha é fraca ou já vazou na internet. Escolha outra.';
    if (/reauthenticat/i.test(m)) return 'Por segurança, saia e entre de novo antes de trocar a senha.';
    return m || 'Não deu certo agora. Tente de novo.';
  }

  // ============================================================================
  // PAINÉIS DO LOGIN
  // ============================================================================
  function capa(mostrar) {
    document.body.classList.toggle('deslogado', mostrar);
    q('#telaLogin').hidden = !mostrar;
  }
  function painel(id) {
    capa(true);
    qq('#telaLogin [data-painel]').forEach((p) => { p.hidden = p.id !== id; });
    const alvo = q('#' + id);
    setTimeout(() => alvo?.querySelector('input:not([type=checkbox]):not([disabled]), button.btn-entrar')?.focus({ preventScroll: true }), 30);
  }
  function aviso(id, msg) { const el = q('#' + id); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; }

  // mostrar/esconder senha
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-olho]'); if (!b) return;
    const inp = q('#' + b.dataset.olho); if (!inp) return;
    const mostra = inp.type === 'password';
    inp.type = mostra ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(mostra));
    b.setAttribute('aria-label', mostra ? 'Esconder senha' : 'Mostrar senha');
    b.textContent = mostra ? '🙈' : '👁';
    inp.focus();
  });
  // Caps Lock
  function ligarCaps(ids, avisoId) {
    const el = q('#' + avisoId);
    for (const id of ids) {
      const inp = q('#' + id); if (!inp || !el) continue;
      const ver = (e) => { if (typeof e.getModifierState === 'function') el.hidden = !e.getModifierState('CapsLock'); };
      inp.addEventListener('keydown', ver); inp.addEventListener('keyup', ver);
      inp.addEventListener('blur', () => { el.hidden = true; });
    }
  }
  ligarCaps(['loginSenha'], 'capsLogin');
  ligarCaps(['novaSenha', 'novaSenha2'], 'capsNova');

  // lembrar e-mail
  (function () {
    const salvo = local.ler(CHAVE_EMAIL);
    const inp = q('#loginEmail'), chk = q('#lembrarEmail');
    if (salvo && inp) { inp.value = salvo; if (chk) chk.checked = true; }
  })();

  // ---- espera progressiva -------------------------------------------------------
  function lerErros() { try { return JSON.parse(local.ler(CHAVE_ERROS)) || { n: 0, ate: 0 }; } catch { return { n: 0, ate: 0 }; } }
  let _timerEspera = null;
  function pintarEspera() {
    const btn = q('#btnEntrar'); if (!btn) return false;
    clearInterval(_timerEspera);
    const tick = () => {
      const falta = Math.ceil((lerErros().ate - Date.now()) / 1000);
      if (falta > 0) { btn.disabled = true; btn.textContent = `AGUARDE ${falta} s`; return true; }
      clearInterval(_timerEspera); btn.disabled = false; btn.textContent = 'ENTRAR'; return false;
    };
    const bloqueado = tick();
    if (bloqueado) _timerEspera = setInterval(tick, 1000);
    return bloqueado;
  }
  function registrarErro() {
    const e = lerErros(); e.n = (e.n || 0) + 1;
    const espera = esperaDepoisDeErros(e.n);
    e.ate = espera ? Date.now() + espera * 1000 : 0;
    local.gravar(CHAVE_ERROS, JSON.stringify(e));
    return { n: e.n, espera };
  }
  pintarEspera();

  // ---- entrar -----------------------------------------------------------------
  q('#formLogin')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (pintarEspera()) return;
    const email = q('#loginEmail').value.trim(), senha = q('#loginSenha').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return aviso('erroLogin', 'Digite o seu e-mail completo.');
    if (!senha) return aviso('erroLogin', 'Digite a sua senha.');
    const btn = q('#btnEntrar');
    btn.disabled = true; btn.textContent = 'ENTRANDO…'; aviso('erroLogin', '');
    try {
      if (!sb) throw new Error('Conexão com o Supabase não configurada.');
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      local.gravar(CHAVE_ERROS, null);
      local.gravar(CHAVE_EMAIL, q('#lembrarEmail')?.checked ? email : null);
      q('#loginSenha').value = '';
      btn.disabled = false; btn.textContent = 'ENTRAR';
      await depoisDoLogin();
    } catch (err) {
      const msg = mensagemDoErro(err);
      let extra = '';
      if (/incorretos/.test(msg)) {
        const r = registrarErro();
        if (r.espera) extra = ` Muitas tentativas: espere ${r.espera >= 60 ? `${Math.round(r.espera / 60)} min` : `${r.espera} s`}.`;
        else if (r.n >= 3) extra = ` (${r.n}ª tentativa — na 5ª o login espera um pouco.)`;
      }
      aviso('erroLogin', msg + extra);
      btn.disabled = false; btn.textContent = 'ENTRAR';
      pintarEspera();
    }
  });

  /** Depois da senha: segundo fator (se a pessoa ligou) e então o app. */
  async function depoisDoLogin() {
    if (await precisaSegundoFator()) return painel('formMfa');
    await abrirApp();
  }

  // ---- esqueci a senha ------------------------------------------------------------
  q('#linkEsqueci')?.addEventListener('click', () => {
    q('#esqueciEmail').value = q('#loginEmail').value.trim();
    aviso('okEsqueci', ''); aviso('erroEsqueci', '');
    painel('formEsqueci');
  });
  qq('[data-voltar-login]').forEach((b) => b.addEventListener('click', () => painel('formLogin')));
  q('#formEsqueci')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = q('#esqueciEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return aviso('erroEsqueci', 'Digite o seu e-mail completo.');
    const btn = q('#btnEsqueci'); btn.disabled = true; aviso('erroEsqueci', '');
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RAIZ_APP() });
      if (error) throw error;
      aviso('okEsqueci', 'Pronto: se esse e-mail estiver cadastrado, o link chega em alguns minutos. Olhe também o spam.');
    } catch (err) { aviso('erroEsqueci', mensagemDoErro(err)); }
    finally { btn.disabled = false; }
  });

  // ---- senha nova (volta do e-mail, troca obrigatória ou voluntária) -------------------
  let _depoisDaSenha = null;
  function abrirSenhaNova(modo) {
    const t = q('#novaSenhaTitulo'), s = q('#novaSenhaSub');
    if (modo === 'obrigatoria') { t.textContent = 'Troque a sua senha'; s.textContent = 'O administrador pediu uma senha nova no primeiro acesso. Mínimo de 8 caracteres e diferente do seu e-mail.'; }
    else { t.textContent = 'Escolha uma senha nova'; s.textContent = 'Mínimo de 8 caracteres e diferente do seu e-mail.'; }
    q('#novaSenha').value = ''; q('#novaSenha2').value = ''; aviso('erroNovaSenha', ''); pintarForca('');
    painel('formNovaSenha');
    return new Promise((ok) => { _depoisDaSenha = ok; });
  }
  function pintarForca(v) {
    const f = forcaDaSenha(v);
    qq('#forcaSenha i').forEach((i, k) => { i.className = k < f ? `f${f}` : ''; });
  }
  q('#novaSenha')?.addEventListener('input', (e) => pintarForca(e.target.value));
  q('#formNovaSenha')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const s1 = q('#novaSenha').value, s2 = q('#novaSenha2').value;
    const { data } = await sb.auth.getSession().catch(() => ({ data: null }));
    const email = data?.session?.user?.email || state.perfil?.email || '';
    const erro = validarSenha(s1, s2, email);
    if (erro) return aviso('erroNovaSenha', erro);
    const btn = q('#btnNovaSenha'); btn.disabled = true; aviso('erroNovaSenha', '');
    try {
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) throw error;
      await api('POST', '/perfil/senha-trocada', {}).catch(() => null);
      if (state.perfil) state.perfil.precisa_trocar_senha = false;
      q('#novaSenha').value = ''; q('#novaSenha2').value = '';
      toast('Senha nova salva. 🔒');
      const fim = _depoisDaSenha; _depoisDaSenha = null;
      if (fim) fim(true); else { await abrirApp(); }
    } catch (err) { aviso('erroNovaSenha', mensagemDoErro(err)); }
    finally { btn.disabled = false; }
  });

  // ---- segundo fator --------------------------------------------------------------
  async function precisaSegundoFator() {
    try {
      if (!sb?.auth?.mfa?.getAuthenticatorAssuranceLevel) return false;
      const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      return data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2';
    } catch { return false; }
  }
  q('#mfaCodigo')?.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6) q('#formMfa').requestSubmit?.(); });
  q('#formMfa')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const codigo = q('#mfaCodigo').value.trim();
    if (!/^\d{6}$/.test(codigo)) return aviso('erroMfa', 'O código tem 6 números.');
    const btn = q('#btnMfa'); btn.disabled = true; aviso('erroMfa', '');
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) throw error;
      const f = (data?.totp || []).find((x) => x.status === 'verified');
      if (!f) throw new Error('Nenhum app autenticador ligado a esta conta.');
      const r = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: codigo });
      if (r.error) throw r.error;
      q('#mfaCodigo').value = '';
      await abrirApp();
    } catch (err) { aviso('erroMfa', /invalid|expired|code/i.test(String(err?.message)) ? 'Código errado ou vencido. Confira no app e tente de novo.' : mensagemDoErro(err)); }
    finally { btn.disabled = false; }
  });

  // ---- sem acesso ----------------------------------------------------------------
  function mostrarSemAcesso(info = {}) {
    const apps = Array.isArray(info.apps) ? info.apps : [];
    q('#semAcessoTxt').textContent = apps.length
      ? 'O Comunicar não está liberado no seu perfil. Estes são os apps que você pode usar:'
      : 'O Comunicar não está liberado no seu perfil. Peça ao administrador para liberar.';
    q('#semAcessoApps').innerHTML = apps.map((a) => `<a class="btn" href="${escH(a.url)}">${escH(a.nome || a.app)} →</a>`).join('');
    painel('painelSemAcesso');
  }

  // ---- sair ----------------------------------------------------------------------
  async function sair(todos = false) {
    pararSino();
    try { await sb?.auth?.signOut(todos ? { scope: 'global' } : undefined); } catch { /* segue */ }
    state.perfil = null;
    location.replace(RAIZ_APP());
  }
  qq('[data-sair]').forEach((b) => b.addEventListener('click', () => sair(false)));

  /**
   * O que fazer quando o servidor recusa (o api() do app.js chama isto):
   *   401 sessão expirada → renova o token uma vez e repete; senão volta ao login
   *   401 desativado/sem perfil → login com o aviso; 401 mfa_pendente → código
   *   403 sem_acesso → tela sem acesso; 403 trocar_senha → senha nova
   */
  async function tratarRecusa(status, data = {}, jaTentou = false) {
    const cod = data.codigo;
    if (status === 401 && cod === 'mfa_pendente') { painel('formMfa'); return 'parar'; }
    if (status === 401 && ['desativado', 'sem_perfil'].includes(cod)) {
      try { await sb?.auth?.signOut({ scope: 'local' }); } catch { /* segue */ }
      painel('formLogin'); aviso('erroLogin', data.erro || 'Seu acesso foi desativado.'); return 'parar';
    }
    if (status === 401) {
      if (!jaTentou && sb?.auth?.refreshSession) {
        const { data: d } = await sb.auth.refreshSession().catch(() => ({ data: null }));
        if (d?.session) return 'repetir';
      }
      painel('formLogin'); aviso('erroLogin', 'Sua sessão expirou. Entre de novo.'); return 'parar';
    }
    if (status === 403 && cod === 'sem_acesso') { mostrarSemAcesso(data); return 'parar'; }
    if (status === 403 && cod === 'trocar_senha') { abrirSenhaNova('obrigatoria').then(() => abrirApp()); return 'parar'; }
    return 'erro';
  }

  // ============================================================================
  // MENU DA CONTA (avatar)
  // ============================================================================
  const pop = () => q('#contaPop'), btnAvatar = () => q('#avatarPerfil');
  function pintarAvatar(p) {
    const el = btnAvatar(); if (!el || !p) return;
    el.textContent = iniciais(p.nome) || 'IC';
    el.title = `${p.nome || 'Sua conta'} · ${PAPEL[p.papel] || p.papel}`;
    el.style.background = p.avatar_cor || '';
    el.style.color = p.avatar_cor ? '#fff' : '';
    el.style.borderColor = p.avatar_cor || '';
  }
  function abrirMenu() {
    const p = state.perfil; if (!p) return;
    const el = pop(), b = btnAvatar();
    el.innerHTML = `
      <div class="conta-topo"><span class="av" style="${p.avatar_cor ? `background:${escH(p.avatar_cor)};color:#fff` : ''}">${escH(iniciais(p.nome) || 'IC')}</span>
        <div><b>${escH(p.nome || 'Sem nome')}</b><small>${escH(PAPEL[p.papel] || p.papel)}${p.cargo ? ` · ${escH(p.cargo)}` : ''}</small><small>${escH(p.email || '')}</small></div></div>
      <button type="button" class="eco-item" role="menuitem" data-conta="perfil">👤 <span><b>Meu perfil</b><small>nome, cargo, telefone, cor, avisos</small></span></button>
      <button type="button" class="eco-item" role="menuitem" data-conta="senha">🔑 <span><b>Trocar senha</b><small>mínimo de 8 caracteres</small></span></button>
      <button type="button" class="eco-item" role="menuitem" data-conta="mfa">🛡️ <span><b>Verificação em duas etapas</b><small>código do celular depois da senha</small></span></button>
      <button type="button" class="eco-item" role="menuitem" data-conta="tema">${temaAtual() === 'claro' ? '🌙' : '☀️'} <span><b>Tema ${temaAtual() === 'claro' ? 'escuro' : 'claro'}</b><small>vale para este aparelho</small></span></button>
      <hr>
      <button type="button" class="eco-item" role="menuitem" data-conta="sair">↩ <span><b>Sair</b></span></button>
      <button type="button" class="eco-item perigo" role="menuitem" data-conta="sair-todos">⏻ <span><b>Sair de todos os aparelhos</b><small>celulares e computadores</small></span></button>`;
    const r = b.getBoundingClientRect();
    el.style.setProperty('--eco-x', `${r.right + 10}px`);
    el.style.setProperty('--eco-y', `${Math.max(12, r.bottom)}px`);
    el.hidden = false; b.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => el.classList.add('aberto'));
    q('.eco-item', el)?.focus();
  }
  function fecharMenu(devolverFoco = true) {
    const el = pop(); if (!el || el.hidden) return false;
    el.classList.remove('aberto'); el.hidden = true; btnAvatar()?.setAttribute('aria-expanded', 'false');
    if (devolverFoco) btnAvatar()?.focus();
    return true;
  }
  btnAvatar()?.addEventListener('click', () => (pop().hidden ? abrirMenu() : fecharMenu()));
  pop()?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-conta]'); if (!b) return;
    const a = b.dataset.conta; fecharMenu(false);
    if (a === 'perfil') abrirMeuPerfil();
    else if (a === 'senha') abrirTrocarSenha();
    else if (a === 'mfa') abrirDuasEtapas();
    else if (a === 'tema') aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro');
    else if (a === 'sair') sair(false);
    else if (a === 'sair-todos' && confirm('Sair de todos os aparelhos? Você vai precisar entrar de novo em cada um.')) sair(true);
  });
  pop()?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const itens = qq('.eco-item', pop()); const i = itens.indexOf(document.activeElement);
    e.preventDefault(); itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus();
  });

  function abrirMeuPerfil() {
    const p = state.perfil; if (!p) return;
    const gestor = ['admin', 'gestor'].includes(p.papel);
    const tipos = TIPOS_AVISO.filter(([k]) => gestor || k === 'reclamacao' || k === 'aprovacao');
    openModal(`<div class="modal-head"><h3>👤 Meu perfil</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <div class="campos-linha">
          <div class="field"><label for="pf_nome">Nome</label><input id="pf_nome" maxlength="80" value="${escH(p.nome)}" autocomplete="name"></div>
          <div class="field"><label for="pf_cargo">Cargo</label><input id="pf_cargo" maxlength="60" value="${escH(p.cargo || '')}" placeholder="Ex.: consultor"></div>
        </div>
        <div class="campos-linha">
          <div class="field"><label for="pf_tel">Telefone</label><input id="pf_tel" type="tel" inputmode="tel" value="${escH(p.telefone ? telBR(p.telefone) : '')}" placeholder="(12) 99999-9999"></div>
          <div class="field"><label for="pf_email">E-mail</label><input id="pf_email" value="${escH(p.email || '')}" readonly aria-readonly="true" title="O e-mail é o seu login: só o administrador muda"></div>
        </div>
        <div class="field"><span class="rot">Cor do avatar</span>
          <div class="cores" role="radiogroup" aria-label="Cor do avatar">${CORES.map((c) => `<button type="button" class="cor${p.avatar_cor === c ? ' ativa' : ''}" role="radio" aria-checked="${p.avatar_cor === c}" aria-label="Cor ${c}" data-cor="${c}" style="background:${c}"></button>`).join('')}
            <button type="button" class="cor sem${!p.avatar_cor ? ' ativa' : ''}" role="radio" aria-checked="${!p.avatar_cor}" aria-label="Sem cor" data-cor="">∅</button></div></div>
        <div class="field"><span class="rot">Avisos do Comunicar no sino</span>
          <div class="avisos-lista">${tipos.map(([k, rot, sub]) => `<label class="sw"><input type="checkbox" data-aviso="${k}" ${p.notificacoes?.[k] === false ? '' : 'checked'}><span class="tr"></span><span class="sw-txt">${escH(rot)} <small class="muted">· ${escH(sub)}</small></span></label>`).join('')}</div>
          <small>Tarefas que passam para você e clientes esperando consultor sempre avisam.</small></div>
        <p class="dica">Papel: <b>${escH(PAPEL[p.papel] || p.papel)}</b>. Papel e apps liberados só o administrador muda.</p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="pf_salvar">${svg(I.check)} Salvar</button></div>`);
    let cor = p.avatar_cor || '';
    qq('.cor', modal).forEach((b) => b.addEventListener('click', () => {
      cor = b.dataset.cor; qq('.cor', modal).forEach((x) => { x.classList.toggle('ativa', x === b); x.setAttribute('aria-checked', String(x === b)); });
    }));
    q('#pf_salvar').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const notificacoes = Object.fromEntries(qq('[data-aviso]', modal).map((x) => [x.dataset.aviso, x.checked]));
      try {
        const r = await api('PUT', '/perfil', { nome: q('#pf_nome').value, cargo: q('#pf_cargo').value, telefone: soDigitos(q('#pf_tel').value), avatar_cor: cor || null, preferencias: { notificacoes } });
        Object.assign(state.perfil, { nome: r.nome, cargo: r.cargo, telefone: r.telefone, avatar_cor: r.avatar_cor, notificacoes: r.notificacoes });
        pintarAvatar(state.perfil); closeModal(); toast('Perfil salvo.');
      } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
    });
  }

  function abrirTrocarSenha() {
    openModal(`<div class="modal-head"><h3>🔑 Trocar senha</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <div class="field"><label for="ts_1">Senha nova</label><span class="senha-campo"><input id="ts_1" type="password" minlength="8" autocomplete="new-password"><button type="button" class="olho" data-olho="ts_1" aria-label="Mostrar senha" aria-pressed="false">👁</button></span></div>
        <div class="field"><label for="ts_2">Repita a senha</label><input id="ts_2" type="password" minlength="8" autocomplete="new-password"></div>
        <div class="forca" id="ts_forca" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <p class="form-msg erro" id="ts_erro" hidden></p>
        <small class="dica">Mínimo de 8 caracteres, diferente do seu e-mail. Os outros aparelhos continuam conectados — use "Sair de todos os aparelhos" se quiser derrubar.</small>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="ts_ok">${svg(I.check)} Salvar senha</button></div>`);
    q('#ts_1').addEventListener('input', (e) => { const f = forcaDaSenha(e.target.value); qq('#ts_forca i').forEach((i, k) => { i.className = k < f ? `f${f}` : ''; }); });
    q('#ts_ok').addEventListener('click', async (e) => {
      const erro = validarSenha(q('#ts_1').value, q('#ts_2').value, state.perfil?.email);
      if (erro) return aviso('ts_erro', erro);
      const btn = e.currentTarget; btn.disabled = true; aviso('ts_erro', '');
      try {
        const { error } = await sb.auth.updateUser({ password: q('#ts_1').value });
        if (error) throw error;
        await api('POST', '/perfil/senha-trocada', {}).catch(() => null);
        closeModal(); toast('Senha trocada. 🔒');
      } catch (err) { aviso('ts_erro', mensagemDoErro(err)); btn.disabled = false; }
    });
  }

  async function abrirDuasEtapas() {
    openModal(`<div class="modal-head"><h3>🛡️ Verificação em duas etapas</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body" id="mfaCorpo"><div class="skel" style="height:80px"></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-fechar>Fechar</button></div>`);
    const corpo = q('#mfaCorpo');
    if (!sb?.auth?.mfa) { corpo.innerHTML = '<p class="dica">A verificação em duas etapas não está disponível neste navegador.</p>'; return; }
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) throw error;
      const ok = (data?.totp || []).find((f) => f.status === 'verified');
      if (ok) {
        corpo.innerHTML = `<div class="mfa-status on">✅ <div><b>Ligada</b><small>desde ${escH(dataBR(ok.created_at))} · ${escH(ok.friendly_name || 'app autenticador')}</small></div></div>
          <p class="dica">Depois da senha, o Comunicar (e os outros apps) pedem o código de 6 números do seu app.</p>
          <button type="button" class="btn" id="mfaDesligar">Desligar</button>`;
        q('#mfaDesligar').addEventListener('click', async () => {
          if (!confirm('Desligar a verificação em duas etapas? Sua conta fica protegida só pela senha.')) return;
          const r = await sb.auth.mfa.unenroll({ factorId: ok.id });
          if (r.error) return toast(mensagemDoErro(r.error), 'err');
          toast('Verificação em duas etapas desligada.'); closeModal();
        });
        return;
      }
      corpo.innerHTML = `<div class="mfa-status">🔓 <div><b>Desligada</b><small>sua conta está protegida só pela senha</small></div></div>
        <p class="dica">Com ela ligada, além da senha você digita um código que muda a cada 30 s no celular (Google Authenticator, Microsoft Authenticator, Authy…).</p>
        <button type="button" class="btn primary" id="mfaLigar">${svg(I.check)} Ligar</button>`;
      q('#mfaLigar').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        for (const f of (data?.all || data?.totp || []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => null);
        const r = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Comunicar ${new Date().toLocaleDateString('pt-BR')}` });
        if (r.error) { toast(mensagemDoErro(r.error), 'err'); e.currentTarget.disabled = false; return; }
        const { id, totp } = r.data;
        corpo.innerHTML = `<ol class="mfa-passos"><li>Abra o app autenticador e leia o QR:</li></ol>
          <div class="mfa-qr"><img alt="QR para o app autenticador" src="${escH(totp.qr_code)}" width="180" height="180"></div>
          <p class="dica">Não consegue ler? Digite a chave: <code class="mfa-chave">${escH(totp.secret)}</code></p>
          <div class="field"><label for="mfaNovo">Código de 6 números que aparece no app</label><input id="mfaNovo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" class="codigo"></div>
          <p class="form-msg erro" id="mfaErro" hidden></p>
          <button type="button" class="btn primary" id="mfaConfirmar">${svg(I.check)} Confirmar e ligar</button>`;
        q('#mfaNovo').addEventListener('input', (x) => { x.target.value = x.target.value.replace(/\D/g, '').slice(0, 6); });
        q('#mfaConfirmar').addEventListener('click', async () => {
          const code = q('#mfaNovo').value;
          if (!/^\d{6}$/.test(code)) return aviso('mfaErro', 'O código tem 6 números.');
          const v = await sb.auth.mfa.challengeAndVerify({ factorId: id, code });
          if (v.error) return aviso('mfaErro', 'Código errado ou vencido. Confira no app e tente de novo.');
          toast('Verificação em duas etapas ligada. 🛡️'); closeModal();
        });
        setTimeout(() => q('#mfaNovo')?.focus(), 30);
      });
    } catch (err) { corpo.innerHTML = `<p class="form-msg erro">${escH(mensagemDoErro(err))}</p>`; }
  }

  // ============================================================================
  // SINO DE NOTIFICAÇÕES
  // ============================================================================
  let _sino = { lista: [], naoLidas: 0 }, _timerSino = null, _canal = null;
  const btnSino = () => q('#btnSino'), popSino = () => q('#sinoPop');

  async function carregarSino() {
    try {
      _sino = await api('GET', '/notificacoes?limite=30');
      const c = q('#contSino'); const n = _sino.naoLidas || 0;
      c.textContent = n > 99 ? '99+' : String(n); c.hidden = !n;
      btnSino()?.setAttribute('aria-label', n ? `Notificações: ${n} não lida${n === 1 ? '' : 's'}` : 'Notificações');
      if (!popSino().hidden) pintarSino();
    } catch { /* sem sino agora */ }
  }
  function pintarSino() {
    const el = popSino(); const l = _sino.lista || [];
    el.innerHTML = `<div class="sino-head"><b>Notificações</b>${_sino.naoLidas ? `<button type="button" class="btn btn-mini ghost" data-sino="todas">Marcar todas como lidas</button>` : ''}
        <button type="button" class="modal-close" data-sino="fechar" aria-label="Fechar notificações">×</button></div>
      <div class="sino-lista">${l.length ? l.map((n) => `<button type="button" class="sino-item${n.lida_em ? '' : ' nova'}" data-notif="${escH(n.id)}">
          <span class="s-ico" aria-hidden="true">${ICONE_AVISO[n.tipo] || '🔔'}</span>
          <span class="s-txt"><b>${escH(n.titulo)}</b>${n.corpo ? `<small>${escH(n.corpo)}</small>` : ''}<i>${escH(relativo(n.created_at))}${n.app && n.app !== 'comunicar' ? ` · ${escH(n.app)}` : ''}</i></span>
          ${n.lida_em ? '' : '<span class="s-ponto" aria-label="não lida"></span>'}</button>`).join('')
        : '<div class="vazio"><b>Nada por aqui</b><p>Reclamações, campanhas para aprovar e tarefas novas aparecem aqui.</p></div>'}</div>`;
  }
  function abrirSino() {
    fecharMenu(false);
    pintarSino();
    popSino().hidden = false; btnSino().setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => popSino().classList.add('aberto'));
    (q('.sino-item', popSino()) || q('.modal-close', popSino()))?.focus();
    carregarSino();
  }
  function fecharSino(devolver = true) {
    const el = popSino(); if (!el || el.hidden) return false;
    el.classList.remove('aberto'); el.hidden = true; btnSino()?.setAttribute('aria-expanded', 'false');
    if (devolver) btnSino()?.focus();
    return true;
  }
  btnSino()?.addEventListener('click', () => (popSino().hidden ? abrirSino() : fecharSino()));
  popSino()?.addEventListener('click', async (e) => {
    const acao = e.target.closest('[data-sino]')?.dataset.sino;
    if (acao === 'fechar') return fecharSino();
    if (acao === 'todas') { await api('POST', '/notificacoes/lidas', {}).catch(() => null); return carregarSino(); }
    const it = e.target.closest('[data-notif]'); if (!it) return;
    const n = (_sino.lista || []).find((x) => x.id === it.dataset.notif); if (!n) return;
    if (!n.lida_em) api('POST', `/notificacoes/${n.id}/lida`, {}).then(carregarSino).catch(() => null);
    fecharSino(false);
    abrirLinkDaNotificacao(n);
  });
  document.addEventListener('click', (e) => {
    if (popSino() && !popSino().hidden && !popSino().contains(e.target) && !e.target.closest('#btnSino')) fecharSino(false);
    if (pop() && !pop().hidden && !pop().contains(e.target) && !e.target.closest('#avatarPerfil')) fecharMenu(false);
  });

  /** Link da notificação: relativo ao app de origem (comunicar abre aqui dentro). */
  function abrirLinkDaNotificacao(n) {
    if (!n.link) return;
    const app = n.app || 'comunicar';
    if (app === 'comunicar') {
      const qs = new URLSearchParams(String(n.link).split('?')[1] || '');
      return window.abrirLinkInterno?.(qs);
    }
    const base = APPS_URL[app]; if (!base) return;
    window.open(base + (String(n.link).startsWith('/') ? n.link : `/${n.link}`), '_blank', 'noopener');
  }

  function iniciarSino(perfil) {
    btnSino().hidden = false;
    carregarSino();
    clearInterval(_timerSino);
    _timerSino = setInterval(() => { if (document.visibilityState === 'visible') carregarSino(); }, 60_000);
    if (!iniciarSino.ligado) {
      iniciarSino.ligado = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { carregarSino(); carregarTarefas(); } });
    }
    // tempo real: a notificação nova chega sem esperar o minuto (RLS: só as minhas)
    try {
      if (sb?.channel && perfil?.id && !_canal) {
        _canal = sb.channel(`notif-comunicar-${perfil.id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${perfil.id}` }, (m) => {
            carregarSino();
            if (m?.new?.titulo) toast(`🔔 ${m.new.titulo}`, 'ok', 5000);
            if (m?.new?.tipo === 'tarefa') carregarTarefas();
          })
          .subscribe();
      }
    } catch { /* sem tempo real: fica a reserva de 60 s */ }
  }
  function pararSino() {
    clearInterval(_timerSino);
    try { if (_canal) sb?.removeChannel?.(_canal); } catch { /* ignora */ }
    _canal = null;
  }

  // ============================================================================
  // MINHAS TAREFAS
  // ============================================================================
  let _tarefas = [];
  async function carregarTarefas() {
    try {
      _tarefas = await api('GET', '/tarefas');
      const c = q('#contTarefas'); const n = _tarefas.length;
      const vencidas = _tarefas.filter((t) => t.vence_em && new Date(t.vence_em) < new Date()).length;
      c.textContent = n > 99 ? '99+' : String(n); c.hidden = !n; c.classList.toggle('vencida', vencidas > 0);
      q('#btnTarefas')?.setAttribute('aria-label', n ? `Minhas tarefas: ${n} aberta${n === 1 ? '' : 's'}${vencidas ? `, ${vencidas} vencida${vencidas === 1 ? '' : 's'}` : ''}` : 'Minhas tarefas');
      if (q('#listaTarefas')) pintarTarefas();
    } catch { /* sem tarefas agora */ }
  }
  function htmlTarefa(t) {
    const vencida = t.vence_em && new Date(t.vence_em) < new Date();
    return `<div class="tarefa${vencida ? ' vencida' : ''}${t.prioridade === 1 ? ' alta' : ''}" data-tarefa="${escH(t.id)}">
      <button type="button" class="t-ok" data-concluir="${escH(t.id)}" aria-label="Concluir: ${escH(t.titulo)}" title="Concluir">${svg(I.check)}</button>
      <div class="t-txt"><b>${escH(t.titulo)}</b>
        ${t.descricao ? `<small class="t-desc">${escH(t.descricao)}</small>` : ''}
        <span class="t-meta">${t.prioridade === 1 ? '<span class="badge-pill bp-red">alta</span>' : ''}
          ${t.vence_em ? `<span class="${vencida ? 't-venc' : ''}">${svg(I.clock)} ${vencida ? 'venceu' : 'até'} ${escH(dataHoraBR(t.vence_em))}</span>` : ''}
          ${t.cliente_id ? `<button type="button" class="cli-nome" data-tficha="${escH(t.cliente_id)}">${svg(I.user)} ${escH(t.cliente_nome || 'cliente')}</button>` : ''}
          <span class="muted">${escH(t.origem === 'comunicar' ? 'Comunicar' : t.origem || '')}</span></span></div></div>`;
  }
  function pintarTarefas() {
    const box = q('#listaTarefas'); if (!box) return;
    box.innerHTML = _tarefas.length ? _tarefas.map(htmlTarefa).join('')
      : '<div class="vazio"><b>Nenhuma tarefa aberta</b><p>Quando um cliente pedir horário, reclamar ou quiser orçamento, a tarefa aparece aqui.</p></div>';
  }
  function abrirTarefas(pre = null) {
    openModal(`<div class="modal-head"><h3>☑️ Minhas tarefas</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <form class="nova-tarefa" id="formTarefa">
          <div class="campos-linha">
            <div class="field"><label for="tf_titulo">Nova tarefa</label><input id="tf_titulo" maxlength="200" placeholder="Ex.: ligar para o cliente sobre o freio" value="${escH(pre?.titulo || '')}"></div>
            <div class="field curto"><label for="tf_prazo">Prazo</label><input id="tf_prazo" type="datetime-local"></div>
          </div>
          ${pre?.cliente_id ? `<small class="dica">${svg(I.user)} ligada ao cliente desta ficha</small>` : ''}
          <button type="submit" class="btn primary btn-mini">${svg(I.plus)} Criar</button>
        </form>
        <div class="lista-tarefas" id="listaTarefas"><div class="skel" style="height:60px"></div></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-fechar>Fechar</button></div>`, { larga: true });
    pintarTarefas(); carregarTarefas();
    q('#formTarefa').addEventListener('submit', async (e) => {
      e.preventDefault();
      const titulo = q('#tf_titulo').value.trim();
      if (titulo.length < 2) return toast('Escreva o que precisa ser feito.', 'err');
      const prazo = q('#tf_prazo').value;
      try {
        await api('POST', '/tarefas', { titulo, vence_em: prazo ? new Date(prazo).toISOString() : null, cliente_id: pre?.cliente_id || null });
        q('#tf_titulo').value = ''; q('#tf_prazo').value = ''; pre = null;
        toast('Tarefa criada.'); carregarTarefas();
      } catch (err) { toast(err.message, 'err'); }
    });
    q('#listaTarefas').addEventListener('click', async (e) => {
      const f = e.target.closest('[data-tficha]'); if (f) { closeModal(); return abrirFicha(f.dataset.tficha); }
      const b = e.target.closest('[data-concluir]'); if (!b) return;
      b.disabled = true;
      try {
        await api('POST', `/tarefas/${b.dataset.concluir}/concluir`, {});
        b.closest('.tarefa')?.classList.add('feita');
        toast('Tarefa concluída. ✅');
        setTimeout(carregarTarefas, 350);
      } catch (err) { toast(err.message, 'err'); b.disabled = false; }
    });
  }
  q('#btnTarefas')?.addEventListener('click', () => abrirTarefas());

  // ============================================================================
  // INÍCIO DA SESSÃO
  // ============================================================================
  /** Chamado pelo app.js depois do /api/perfil. Devolve false se a sessão não pode seguir. */
  async function depoisDoPerfil(p) {
    pintarAvatar(p);
    if (p.precisa_trocar_senha) await abrirSenhaNova('obrigatoria');
    capa(false);
    q('#btnTarefas').hidden = false;
    iniciarSino(p);
    carregarTarefas();
    return true;
  }

  /** Liga os eventos do Supabase (volta do e-mail de senha). */
  function ligar(cliente) {
    try {
      cliente?.auth?.onAuthStateChange?.((evento) => {
        if (evento === 'PASSWORD_RECOVERY') abrirSenhaNova('recuperacao');
        if (evento === 'SIGNED_OUT') pararSino();
      });
    } catch { /* sem eventos */ }
  }

  window.Conta = {
    painel, aviso, tratarRecusa, depoisDoPerfil, depoisDoLogin, precisaSegundoFator, ligar, sair,
    fecharPops: () => fecharSino() || fecharMenu(), novaTarefa: abrirTarefas, abrirTarefas, carregarSino, carregarTarefas,
    abrirSenhaNova, mostrarSemAcesso,
    // puros (testes)
    esperaDepoisDeErros, validarSenha, forcaDaSenha, mensagemDoErro,
  };
})();
