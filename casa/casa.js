/* ============================================================================
   IndyCar Central — Casa (/). Login ÚNICO: a sessão do Supabase fica no
   localStorage deste domínio (chave sb-nppfqhavqahapmugnyng-auth-token), a mesma
   que Agenda, Atendimento, CRM e Comunicar leem aqui dentro — logou uma vez, vale
   para todos. Tudo pelo navegador com o RLS do banco (cada um vê só o que pode).
   ============================================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS_EMAIL = 'indycar_central_email';
  const LS_ERROS = 'indycar_central_erros';
  const PATIO = 'https://indycar-patio.netlify.app';
  const ORCADOR = 'https://indycar-orcador.netlify.app';

  /* Os apps da casa. "fora" = mora em outro endereço (Netlify); o login de lá é outro domínio. */
  const APPS = [
    { k: 'agenda',      nome: 'Agenda',      desc: 'horários e presença',      ico: '📅', url: '/agenda/' },
    { k: 'atendimento', nome: 'Atendimento', desc: 'conversas do WhatsApp',    ico: '💬', url: '/atendimento/' },
    { k: 'crm',         nome: 'CRM',         desc: 'leads e funil',            ico: '📈', url: '/crm/' },
    { k: 'comunicar',   nome: 'Comunicar',   desc: 'lembretes e réguas',       ico: '📣', url: '/comunicar/' },
    { k: 'patio',       nome: 'Pátio',       desc: 'carro dentro da oficina',  ico: '🔧', url: PATIO + '/', fora: true },
    { k: 'orcador',     nome: 'Orçador',     desc: 'orçamentos com IA',        ico: '🧾', url: ORCADOR + '/', fora: true },
  ];
  const BASE_APP = { agenda: '/agenda/', atendimento: '/atendimento/', crm: '/crm/', comunicar: '/comunicar/', patio: PATIO + '/', orcador: ORCADOR + '/' };
  const PAPEL = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', agenda: 'Agenda (presença)', mecanico: 'Mecânico' };
  const EQUIPE = new Set(['admin', 'gestor', 'atendente']);
  const ETAPA = { recebido: 'Recebido', diagnostico: 'Diagnóstico', aguardando_aprovacao: 'Aguardando aprovação', aguardando_peca: 'Aguardando peça',
    em_execucao: 'Em execução', teste: 'Teste', pronto: 'Pronto' };
  const STATUS_AG = { aguardando: 'aguardando', confirmado: 'confirmado', em_atendimento: 'na oficina', compareceu: 'na oficina',
    nao_veio: 'não veio', concluido: 'fechou', nao_fechou: 'não fechou' };

  let sb = null, sessao = null, perfil = null, canal = null, timerAgora = null, emRecuperacao = false;

  /* ---------------- utilidades ---------------- */
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravar = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function erro(el, msg) { const e = $(el); e.textContent = msg || ''; e.hidden = !msg; }
  const fuso = { timeZone: 'America/Sao_Paulo' };
  function hojeSP() {   // AAAA-MM-DD no fuso da oficina
    const p = new Intl.DateTimeFormat('en-CA', { ...fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return p;
  }
  function quando(iso) {
    if (!iso) return '';
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const min = Math.round(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    return new Date(iso).toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit' });
  }
  function vencimento(iso) {
    if (!iso) return { txt: 'sem prazo', vencida: false };
    const d = new Date(iso);
    const vencida = d.getTime() < Date.now();
    const txt = d.toLocaleString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return { txt: (vencida ? 'venceu ' : 'até ') + txt, vencida };
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
  /** Quem pode abrir cada app — mesma regra dos apps (o servidor de cada um confere de novo). */
  function podeUsar(p, app) {
    if (!p || p.ativo === false) return false;
    if (p.papel === 'admin') return true;
    if (!Array.isArray(p.apps)) return EQUIPE.has(p.papel);     // perfil antigo sem lista: equipe libera
    if (p.papel === 'agenda' && !['agenda', 'patio'].includes(app)) return false;
    return p.apps.includes(app);
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
  function semAcesso(msg) { $('#saMotivo').textContent = msg; mostrar('semAcesso'); }

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
      toast('Se o e-mail estiver cadastrado, o link chega em instantes (o envio é limitado a poucos por hora). O administrador também pode gerar uma senha temporária.');
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

  let motivoSenha = 'troca';
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
    motivoSenha = motivo;
    $('#sMotivo').textContent = motivo === 'recuperar' ? 'Você veio pelo link do e-mail: escolha a senha nova.'
      : motivo === 'obrigatoria' ? 'O administrador pediu para você trocar a senha antes de continuar.'
      : 'Escolha uma senha nova.';
    mostrar('fSenha');
  }

  async function sair(global) {
    try { if (canal) await sb.removeChannel(canal); } catch { /* segue */ }
    canal = null; clearInterval(timerAgora);
    try { await sb.auth.signOut(global ? { scope: 'global' } : undefined); } catch { /* sessão já tinha ido */ }
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
      .select('id,nome,email,papel,apps,ativo,avatar_cor,precisa_trocar_senha').eq('id', sessao.user.id).maybeSingle();
    if (error) return semAcesso('Não consegui ler o seu perfil agora. Tente de novo em instantes.');
    if (!p) return semAcesso('Seu login existe, mas ainda não tem perfil na equipe. Peça ao administrador para liberar.');
    if (p.ativo === false) { await sb.auth.signOut(); return semAcesso('Seu acesso foi desativado. Fale com o administrador.'); }
    perfil = p;
    if (p.precisa_trocar_senha) return pedirSenha('obrigatoria');
    montarCasa();
  }

  function montarCasa() {
    const nome = (perfil.nome || perfil.email || '').trim();
    const curto = nome.split(/\s+/)[0] || 'equipe';
    const h = Number(new Intl.DateTimeFormat('pt-BR', { ...fuso, hour: 'numeric', hour12: false }).format(new Date()));
    $('#ola').textContent = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    $('#nomeCurto').textContent = curto;
    $('#hoje').textContent = new Date().toLocaleDateString('pt-BR', { ...fuso, weekday: 'long', day: 'numeric', month: 'long' });
    const av = $('#bPerfil');
    av.textContent = (curto[0] || '?').toUpperCase();
    if (/^#[0-9a-f]{3,8}$/i.test(perfil.avatar_cor || '')) av.style.background = perfil.avatar_cor;
    $('#mpNome').textContent = nome || '—';
    $('#mpEmail').textContent = perfil.email || sessao.user.email || '';
    $('#mpPapel').textContent = PAPEL[perfil.papel] || perfil.papel || '';

    const meus = APPS.filter((a) => podeUsar(perfil, a.k));
    $('#gradeApps').innerHTML = meus.length ? meus.map((a) => `
      <a class="app${a.fora ? ' app-fora' : ''}" href="${esc(a.url)}"${a.fora ? ' rel="noopener"' : ''}>
        <span class="app-ico" aria-hidden="true">${a.ico}</span>
        <span class="app-nome">${esc(a.nome)}</span>
        <span class="app-desc">${esc(a.desc)}${a.fora ? ' · outro endereço' : ''}</span>
      </a>`).join('') : '<p class="vazio">Nenhum app liberado para você ainda. Peça ao administrador.</p>';

    mostrar('casa');
    carregarAgora();
    carregarNotificacoes();
    carregarTarefas();
    ouvirMudancas();
    clearInterval(timerAgora);
    timerAgora = setInterval(() => { if (!document.hidden) carregarAgora(); }, 60_000);
  }

  /* ---------------- o "agora" do dia ---------------- */
  function cartao(id, { num, det, itens, href }) {
    const c = $(id);
    c.hidden = false;
    c.querySelector('[data-num]').textContent = num;
    c.querySelector('[data-det]').textContent = det;
    c.querySelector('[data-lista]').innerHTML = (itens || []).map((i) => `<li><span>${esc(i.a)}</span><span>${esc(i.b)}</span></li>`).join('');
    if (href) c.setAttribute('href', href);
  }
  async function carregarAgora() {
    const equipe = EQUIPE.has(perfil.papel);
    const tarefas = [];
    if (equipe && podeUsar(perfil, 'atendimento')) {
      tarefas.push((async () => {
        /* "Esperando" de verdade = pediu consultor nos últimos 7 dias; as mais antigas
           aparecem só como número (provavelmente esquecidas abertas no Atendimento). */
        const corte = new Date(Date.now() - 7 * 864e5).toISOString();
        const [esp, velhas, nl] = await Promise.all([
          sb.from('conversas').select('id,nome,telefone_e164,aguardando_desde', { count: 'exact' })
            .eq('aguardando_consultor', true).neq('status', 'resolvida').gte('aguardando_desde', corte).order('aguardando_desde', { ascending: true }).limit(3),
          sb.from('conversas').select('id', { count: 'exact', head: true }).eq('aguardando_consultor', true).neq('status', 'resolvida').lt('aguardando_desde', corte),
          sb.from('conversas').select('id', { count: 'exact', head: true }).gt('nao_lidas', 0).neq('status', 'resolvida'),
        ]);
        if (esp.error) throw esp.error;
        const n = esp.count || 0;
        const antigas = velhas.count ? ` · ${velhas.count} há mais de 7 dias` : '';
        cartao('#aConversas', {
          num: String(n),
          det: (n ? 'esperando consultor' : 'ninguém esperando agora') + antigas + ` · ${nl.count || 0} com mensagem não lida`,
          itens: (esp.data || []).map((c) => ({ a: c.nome || c.telefone_e164 || 'Cliente', b: quando(c.aguardando_desde) })),
          href: esp.data?.[0] ? '/atendimento/?conversa=' + encodeURIComponent(esp.data[0].id) : '/atendimento/',
        });
      })().catch(() => cartao('#aConversas', { num: '—', det: 'não deu para ler agora', itens: [] })));
    } else $('#aConversas').hidden = true;

    if (podeUsar(perfil, 'patio') && (equipe || perfil.papel === 'mecanico')) {
      tarefas.push((async () => {
        const r = await sb.from('patio_os').select('id,numero,cliente_nome,veiculo,placa,etapa,etapa_em', { count: 'exact' })
          .not('etapa', 'in', '(entregue,cancelado)').order('etapa_em', { ascending: true }).limit(4);
        if (r.error) throw r.error;
        const prontos = (r.data || []).filter((o) => o.etapa === 'pronto').length;
        cartao('#aPatio', {
          num: String(r.count || 0),
          det: r.count ? `dentro da oficina${prontos ? ` · ${prontos} pronto(s) para retirar` : ''}` : 'pátio vazio agora',
          itens: (r.data || []).map((o) => ({ a: `#${o.numero} ${o.veiculo || o.cliente_nome || ''}${o.placa ? ' · ' + o.placa : ''}`, b: ETAPA[o.etapa] || o.etapa })),
          href: PATIO + '/',
        });
      })().catch(() => cartao('#aPatio', { num: '—', det: 'não deu para ler agora', itens: [] })));
    } else $('#aPatio').hidden = true;

    if (equipe && podeUsar(perfil, 'agenda')) {
      tarefas.push((async () => {
        const r = await sb.from('agendamentos').select('id,hora,cliente_nome,veiculo,servico,status', { count: 'exact' })
          .eq('data', hojeSP()).neq('status', 'cancelado').order('hora', { ascending: true }).limit(40);
        if (r.error) throw r.error;
        const lista = r.data || [];
        const agoraHM = new Intl.DateTimeFormat('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
        const proximos = lista.filter((a) => String(a.hora || '').slice(0, 5) >= agoraHM && ['aguardando', 'confirmado'].includes(a.status));
        const chegaram = lista.filter((a) => ['compareceu', 'em_atendimento', 'concluido', 'nao_fechou'].includes(a.status)).length;
        cartao('#aHoje', {
          num: String(r.count || 0),
          det: r.count ? `${chegaram} já chegaram · ${proximos.length} ainda por vir` : 'nenhum horário marcado hoje',
          itens: (proximos.length ? proximos : lista).slice(0, 4).map((a) => ({ a: `${String(a.hora || '').slice(0, 5)} ${a.cliente_nome || ''}`, b: STATUS_AG[a.status] || a.status })),
          href: '/agenda/',
        });
      })().catch(() => cartao('#aHoje', { num: '—', det: 'não deu para ler agora', itens: [] })));
    } else if (perfil.papel === 'agenda') {
      cartao('#aHoje', { num: '📅', det: 'abra a Agenda para marcar a presença de hoje', itens: [], href: '/agenda/' });
    } else $('#aHoje').hidden = true;
    await Promise.allSettled(tarefas);
  }

  /* ---------------- sino ---------------- */
  let notifs = [];
  function linkDaNotificacao(n) {
    const base = BASE_APP[n.app] || '/';
    const l = String(n.link || '').trim();
    if (!l) return base;
    if (/^https?:\/\//i.test(l)) {        // absoluto: só se for do ecossistema
      try { const u = new URL(l); if (u.origin === location.origin || Object.values(BASE_APP).some((b) => b.startsWith(u.origin))) return u.href; } catch { /* lixo */ }
      return base;
    }
    return base + l.replace(/^\/+/, '');
  }
  function desenharNotificacoes() {
    const novas = notifs.filter((n) => !n.lida_em).length;
    const num = $('#sinoNum'); num.textContent = novas > 99 ? '99+' : String(novas); num.hidden = !novas;
    $('#bSino').setAttribute('aria-label', novas ? `Notificações: ${novas} sem ler` : 'Notificações');
    $('#listaNotif').innerHTML = notifs.length ? notifs.map((n) => `
      <li class="${n.lida_em ? '' : 'nova'}"><button type="button" data-notif="${esc(n.id)}">
        <span class="n-tit">${esc(n.titulo || 'Aviso')}</span>
        ${n.corpo ? `<span class="n-corpo">${esc(n.corpo)}</span>` : ''}
        <span class="n-quando">${esc(quando(n.created_at))}${n.app ? ' · ' + esc(n.app) : ''}</span>
      </button></li>`).join('') : '<li class="vazio">Nada por aqui. Quando passarem uma conversa, um lead ou uma tarefa para você, aparece aqui.</li>';
  }
  async function carregarNotificacoes() {
    const { data, error } = await sb.from('notificacoes').select('id,tipo,titulo,corpo,link,app,lida_em,created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (!error) { notifs = data || []; desenharNotificacoes(); }
  }
  async function abrirNotificacao(id) {
    const n = notifs.find((x) => x.id === id);
    if (!n) return;
    if (!n.lida_em) { n.lida_em = new Date().toISOString(); sb.from('notificacoes').update({ lida_em: n.lida_em }).eq('id', id).then(() => {}, () => {}); }
    location.href = linkDaNotificacao(n);
  }
  async function lerTodas() {
    const ids = notifs.filter((n) => !n.lida_em).map((n) => n.id);
    if (!ids.length) return;
    const agora = new Date().toISOString();
    const { error } = await sb.from('notificacoes').update({ lida_em: agora }).in('id', ids);
    if (!error) { notifs.forEach((n) => { if (!n.lida_em) n.lida_em = agora; }); desenharNotificacoes(); }
  }

  /* ---------------- minhas tarefas ---------------- */
  let tarefas = [];
  function desenharTarefas() {
    $('#tarefasNum').textContent = tarefas.length ? String(tarefas.length) : '';
    $('#tarefasNum').hidden = !tarefas.length;
    $('#listaTarefas').innerHTML = tarefas.length ? tarefas.map((t) => {
      const v = vencimento(t.vence_em);
      return `<li class="tarefa${v.vencida ? ' vencida' : ''}${t.prioridade === 1 ? ' p1' : ''}">
        <input type="checkbox" data-tarefa="${esc(t.id)}" aria-label="Concluir: ${esc(t.titulo)}" />
        <span class="t-tit">${esc(t.titulo)}</span>
        <span class="t-quando">${esc(v.txt)}</span></li>`;
    }).join('') : '<li class="vazio">Nenhuma tarefa aberta com você. 🏁</li>';
  }
  async function carregarTarefas() {
    const { data, error } = await sb.from('tarefas').select('id,titulo,prioridade,vence_em,status,origem')
      .eq('responsavel_id', perfil.id).eq('status', 'aberta')
      .order('vence_em', { ascending: true, nullsFirst: false }).limit(30);
    if (!error) { tarefas = data || []; desenharTarefas(); }
  }
  async function concluir(id, caixa) {
    caixa.disabled = true;
    const { error } = await sb.from('tarefas').update({ status: 'feita' }).eq('id', id);
    if (error) { caixa.disabled = false; caixa.checked = false; return toast('Não consegui concluir agora.'); }
    tarefas = tarefas.filter((t) => t.id !== id); desenharTarefas(); toast('Tarefa concluída.');
  }
  async function criarTarefa(ev) {
    ev.preventDefault();
    const titulo = $('#tTitulo').value.trim();
    if (!titulo) return;
    const { error } = await sb.from('tarefas').insert({ titulo: titulo.slice(0, 200), responsavel_id: perfil.id, origem: 'manual', prioridade: 2 });
    if (error) return toast('Não consegui criar a tarefa agora.');
    $('#tTitulo').value = ''; carregarTarefas();
  }

  /* ---------------- tempo real ---------------- */
  function ouvirMudancas() {
    try {
      if (canal) sb.removeChannel(canal);
      canal = sb.channel('central-' + perfil.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${perfil.id}` }, () => carregarNotificacoes())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: `responsavel_id=eq.${perfil.id}` }, () => carregarTarefas())
        .subscribe();
    } catch { /* sem tempo real: o recarregar de 1 min cobre */ }
  }

  /* ---------------- ligações da tela ---------------- */
  function ligar() {
    $('#fLogin').addEventListener('submit', entrar);
    $('#lEsqueci').addEventListener('click', esqueci);
    $('#fMfa').addEventListener('submit', confirmarMfa);
    $('#fSenha').addEventListener('submit', gravarSenha);
    $('#fTarefa').addEventListener('submit', criarTarefa);
    $('#bTema').addEventListener('click', trocarTema);
    $('#bLerTodas').addEventListener('click', lerTodas);
    const caps = (e) => { if (e.getModifierState) $('#lCaps').hidden = !e.getModifierState('CapsLock'); };
    $('#lSenha').addEventListener('keyup', caps); $('#lSenha').addEventListener('keydown', caps);
    document.addEventListener('click', (e) => {
      const olho = e.target.closest('[data-olho]');
      if (olho) { const i = document.getElementById(olho.dataset.olho); i.type = i.type === 'password' ? 'text' : 'password'; olho.setAttribute('aria-label', i.type === 'password' ? 'Mostrar senha' : 'Esconder senha'); return; }
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      if (acao === 'sair') return sair(false);
      if (acao === 'sair-todos') return sair(true);
      if (acao === 'trocar-senha') { $('#menuPerfil').hidden = true; return pedirSenha('troca'); }
      const nb = e.target.closest('[data-notif]');
      if (nb) return abrirNotificacao(nb.dataset.notif);
      const sino = e.target.closest('#bSino'), av = e.target.closest('#bPerfil');
      if (sino) { const p = $('#painelSino'); p.hidden = !p.hidden; sino.setAttribute('aria-expanded', String(!p.hidden)); $('#menuPerfil').hidden = true; return; }
      if (av) { const m = $('#menuPerfil'); m.hidden = !m.hidden; av.setAttribute('aria-expanded', String(!m.hidden)); $('#painelSino').hidden = true; return; }
      if (!e.target.closest('#painelSino, #menuPerfil')) { $('#painelSino').hidden = true; $('#menuPerfil').hidden = true; }
    });
    document.addEventListener('change', (e) => { const c = e.target.closest('[data-tarefa]'); if (c && c.checked) concluir(c.dataset.tarefa, c); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#painelSino').hidden = true; $('#menuPerfil').hidden = true; } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && perfil) { carregarAgora(); carregarNotificacoes(); } });
  }

  async function iniciar() {
    ligar();
    const email = ler(LS_EMAIL); if (email) $('#lEmail').value = email;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    let cfg;
    try {
      const r = await fetch('/api/central/config', { cache: 'no-store' });
      cfg = await r.json();
      $('#versao').textContent = cfg.versao || '';
    } catch { cfg = null; }
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase?.createClient) {
      mostrar('fLogin');
      return erro('#lErro', 'Não consegui falar com o servidor ou carregar o login. Confira a internet e recarregue a página.');
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    sb.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') { sessao = s; emRecuperacao = true; return pedirSenha('recuperar'); }
      if (evento === 'SIGNED_OUT' && perfil) { perfil = null; mostrar('fLogin'); }
    });
    await depoisDoLogin();
  }
  window.IndyCarCentral = { podeUsar, linkDaNotificacao, esc };   // para os testes
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
