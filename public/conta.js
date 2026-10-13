/* ============================================================================
   CONTA — padrão comum de LOGIN / PERFIL / ACESSO do ecossistema IndyCar
   (rodada 3, 13/10/2026). Carregado DEPOIS do app.js: usa as peças dele
   (sb, api, state, toast, esc, openModal, closeModal, $, $$, aplicarTema…),
   todas globais do script clássico.

     1. Login: mostrar senha, Caps Lock, lembrar e-mail, mensagens claras e
        espera progressiva depois de 5 erros seguidos (neste aparelho).
     2. Esqueci a senha (e-mail do Supabase) e tela de nova senha na volta.
     3. Troca obrigatória (perfis.precisa_trocar_senha).
     4. Sem acesso a este app → tela com os apps que a pessoa pode usar.
     5. Menu do perfil: Meu perfil, trocar senha, duas etapas (TOTP), tema,
        notificações, sair, sair de todos os aparelhos.
     7. Sino de notificações (só as minhas) + tempo real.
     8. Minhas tarefas (concluir e criar, ligada ao agendamento aberto).
   O SERVIDOR confere tudo de novo — a tela só deixa o caminho claro.
   As funções puras (conta*) ficam no nível do arquivo para os testes.
   ============================================================================ */

const CONTA_LS_EMAIL = 'indycar_agenda_email';
const CONTA_LS_ERROS = 'indycar_agenda_erros_login';
const CONTA_APPS = {
  atendimento: { nome: 'Atendimento', desc: 'Conversas do WhatsApp', url: 'https://indycar-atendimento.onrender.com' },
  crm:         { nome: 'CRM', desc: 'Leads e funil de vendas', url: 'https://indycar-crm.onrender.com' },
  agenda:      { nome: 'Agenda', desc: 'Horários da oficina', url: 'https://indycar-agendamentos.onrender.com' },
  comunicar:   { nome: 'Comunicar', desc: 'Lembretes e pós-venda', url: 'https://indycar-posvenda.onrender.com' },
  orcador:     { nome: 'Orçador', desc: 'Orçamentos', url: 'https://indycar-orcador.netlify.app' },
  ads:         { nome: 'Tráfego pago', desc: 'Meta e Google', url: null },
};
const CONTA_CORES = ['#e50914', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#64748b'];

function contaLer(chave) { try { return localStorage.getItem(chave); } catch { return null; } }
function contaGravar(chave, valor) {
  try { if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ }
}

/* ---------------------------- regras puras ---------------------------- */

/** Espera depois de errar a senha: 5 erros seguidos → 15 s, depois dobra (até 5 min). */
function contaEsperaLogin(erros, ultimoErroEm, agora) {
  if (!erros || erros < 5 || !ultimoErroEm) return 0;
  const seg = Math.min(300, 15 * 2 ** (erros - 5));
  return Math.max(0, ultimoErroEm + seg * 1000 - agora);
}

/** Recado claro para cada recusa do login (o Supabase responde em inglês). */
function contaMensagemLogin(erro, online) {
  if (online === false) return 'Sem internet. Confira a conexão e tente de novo.';
  const m = String(erro?.message || erro || '');
  if (/invalid login|invalid credentials|invalid_grant/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Esse e-mail ainda não foi confirmado. Peça ao administrador para refazer o acesso.';
  if (/rate limit|too many|429/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/banned|user is banned/i.test(m)) return 'Seu acesso foi desativado. Fale com o administrador.';
  if (/failed to fetch|network|load failed/i.test(m)) return 'Não consegui falar com o servidor de login. Confira a internet.';
  return 'Não deu para entrar: ' + m;
}

/** Senha nova: mínimo 8, as duas iguais e diferente do e-mail. null = ok. */
function contaSenhaNovaErro(s1, s2, email) {
  if (!s1 || s1.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (s1 !== s2) return 'As duas senhas não são iguais. Confira e tente de novo.';
  const e = String(email || '').trim().toLowerCase();
  if (e && (s1.toLowerCase() === e || s1.toLowerCase() === e.split('@')[0])) return 'A senha não pode ser o seu e-mail.';
  return null;
}

/** Para onde leva uma notificação. Link relativo vale no app de origem; absoluto só do ecossistema. */
function contaLinkNotificacao(n, origemAtual) {
  const link = String(n?.link || '');
  if (!link) return null;
  if (/^https:\/\//i.test(link)) {
    try {
      const u = new URL(link);
      return Object.values(CONTA_APPS).some((a) => a.url && new URL(a.url).host === u.host) ? u.href : null;
    } catch { return null; }
  }
  if (!link.startsWith('/') || link.startsWith('//')) return null;
  const app = CONTA_APPS[n.app] || CONTA_APPS.agenda;
  const base = n.app === 'agenda' || !n.app ? (origemAtual || app.url) : app.url;
  return base ? base.replace(/\/+$/, '') + link : null;
}

/** "agora", "há 5 min", "há 2 h", "ontem", "12/10". */
function contaTempoRel(ts, agoraMs) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return '';
  const min = Math.round((agoraMs - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  if (h < 48) return 'ontem';
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Prazo de uma tarefa em palavras + se está atrasada. */
function contaPrazo(venceEm, agoraMs) {
  const t = Date.parse(venceEm);
  if (!venceEm || !Number.isFinite(t)) return { txt: '', atrasada: false };
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dia = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { txt: t < agoraMs ? `atrasada · ${dia} ${hm}` : `até ${dia} ${hm}`, atrasada: t < agoraMs };
}

/* ------------------------------ telas do login ------------------------------ */

const CONTA_FORMS = ['formLogin', 'formPrimeiro', 'formEsqueci', 'formNovaSenha', 'formMfa', 'caixaSemAcesso'];
function contaMostrarForm(id) {
  document.body.classList.add('deslogado');
  const capa = document.getElementById('telaLogin');
  if (capa) capa.hidden = false;
  for (const f of CONTA_FORMS) { const el = document.getElementById(f); if (el) el.hidden = f !== id; }
  const alvo = document.getElementById(id);
  setTimeout(() => alvo?.querySelector('input:not([type=hidden]):not([type=checkbox]),button.btn-entrar')?.focus(), 30);
}
function contaErro(id, texto, ok = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto || '';
  el.hidden = !texto;
  el.classList.toggle('ok', !!ok);
}

/* Mostrar senha + aviso de Caps Lock em todo campo de senha da capa. */
function contaLigarCamposDeSenha(raiz = document) {
  raiz.querySelectorAll('[data-ver-senha]').forEach((b) => {
    if (b.dataset.ligado) return;
    b.dataset.ligado = '1';
    b.addEventListener('click', () => {
      const inp = b.parentElement.querySelector('input');
      const mostrar = inp.type === 'password';
      inp.type = mostrar ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(mostrar));
      b.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
      b.textContent = mostrar ? 'Esconder' : 'Mostrar';
      inp.focus();
    });
  });
  raiz.querySelectorAll('input[type=password]').forEach((inp) => {
    if (inp.dataset.caps) return;
    inp.dataset.caps = '1';
    const aviso = () => {
      const caixa = inp.closest('form');
      const el = caixa?.querySelector('.login-caps');
      return el;
    };
    const conferir = (e) => {
      const el = aviso(); if (!el || typeof e.getModifierState !== 'function') return;
      el.hidden = !e.getModifierState('CapsLock');
    };
    inp.addEventListener('keydown', conferir);
    inp.addEventListener('keyup', conferir);
    inp.addEventListener('blur', () => { const el = aviso(); if (el) el.hidden = true; });
  });
}

function contaErrosLogin() {
  try { const j = JSON.parse(contaLer(CONTA_LS_ERROS) || '{}'); return { n: Number(j.n) || 0, em: Number(j.em) || 0 }; }
  catch { return { n: 0, em: 0 }; }
}
function contaRegistrarErroLogin() { const e = contaErrosLogin(); contaGravar(CONTA_LS_ERROS, JSON.stringify({ n: e.n + 1, em: Date.now() })); }
function contaZerarErrosLogin() { contaGravar(CONTA_LS_ERROS, null); }
/** ms que ainda falta esperar (0 = pode tentar). */
function contaEsperaAgora() { const e = contaErrosLogin(); return contaEsperaLogin(e.n, e.em, Date.now()); }

/** Depois de entrar: lembra (ou esquece) o e-mail neste aparelho. */
function contaLembrarEmail(email) {
  const marcar = document.getElementById('lembrarEmail')?.checked;
  contaGravar(CONTA_LS_EMAIL, marcar && email ? email : null);
}

function contaPrepararLogin() {
  contaLigarCamposDeSenha();
  const email = contaLer(CONTA_LS_EMAIL);
  const f = document.getElementById('formLogin');
  if (email && f?.loginEmail) { f.loginEmail.value = email; const c = document.getElementById('lembrarEmail'); if (c) c.checked = true; }

  document.getElementById('btnEsqueci')?.addEventListener('click', () => {
    const e = document.getElementById('es_email');
    if (e && f?.loginEmail?.value) e.value = f.loginEmail.value.trim();
    contaErro('erroEsqueci', '');
    contaMostrarForm('formEsqueci');
  });
  document.getElementById('btnVoltarDoEsqueci')?.addEventListener('click', () => contaMostrarForm('formLogin'));

  document.getElementById('formEsqueci')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = document.getElementById('es_email').value.trim().toLowerCase();
    const btn = document.getElementById('btnEsqueciEnviar');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return contaErro('erroEsqueci', 'Esse e-mail não parece válido.');
    if (!navigator.onLine) return contaErro('erroEsqueci', contaMensagemLogin(null, false));
    btn.disabled = true;
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
      if (error) throw error;
      contaErro('erroEsqueci', 'Pronto. Se o e-mail estiver cadastrado, o link chega em alguns minutos — olhe também o spam. '
        + 'Não chegou? Peça ao administrador uma senha temporária.', true);
    } catch (e) {
      contaErro('erroEsqueci', /rate|429|too many/i.test(String(e?.message))
        ? 'O envio de e-mail do plano gratuito é limitado (poucos por hora). Espere um pouco ou peça ao administrador uma senha temporária.'
        : contaMensagemLogin(e, navigator.onLine));
    } finally { btn.disabled = false; }
  });

  document.getElementById('btnSairSemAcesso')?.addEventListener('click', () => contaSair(false));
  document.getElementById('btnSairMfa')?.addEventListener('click', () => contaSair(false));
}

/* Tela de nova senha (recuperação ou troca obrigatória). Resolve quando grava. */
function contaTelaNovaSenha({ titulo, texto, email }) {
  return new Promise((resolve) => {
    const form = document.getElementById('formNovaSenha');
    document.getElementById('ns_titulo').textContent = titulo;
    document.getElementById('ns_texto').textContent = texto;
    document.getElementById('ns_s1').value = ''; document.getElementById('ns_s2').value = '';
    contaErro('erroNovaSenha', '');
    contaMostrarForm('formNovaSenha');
    const btn = document.getElementById('btnNovaSenha');
    const enviar = async (ev) => {
      ev.preventDefault();
      const s1 = document.getElementById('ns_s1').value, s2 = document.getElementById('ns_s2').value;
      const erro = contaSenhaNovaErro(s1, s2, email);
      if (erro) return contaErro('erroNovaSenha', erro);
      btn.disabled = true;
      try {
        const { error } = await sb.auth.updateUser({ password: s1 });
        if (error) throw error;
        form.removeEventListener('submit', enviar);
        document.getElementById('ns_s1').value = ''; document.getElementById('ns_s2').value = '';
        resolve(true);
      } catch (e) {
        contaErro('erroNovaSenha', /same|different from the old/i.test(String(e?.message))
          ? 'A senha nova precisa ser diferente da atual.' : 'Não consegui trocar: ' + (e?.message || e));
      } finally { btn.disabled = false; }
    };
    form.addEventListener('submit', enviar);
  });
}

/* Verificação em duas etapas: se a pessoa tem fator TOTP, pede o código depois da senha. */
async function contaExigirMfa() {
  if (!sb?.auth?.mfa) return true;
  let nivel;
  try { nivel = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data; } catch { return true; }
  if (!nivel || nivel.nextLevel !== 'aal2' || nivel.currentLevel === 'aal2') return true;
  const { data: fatores } = await sb.auth.mfa.listFactors();
  const fator = (fatores?.totp || []).find((f) => f.status === 'verified');
  if (!fator) return true;
  return new Promise((resolve) => {
    const form = document.getElementById('formMfa');
    document.getElementById('mfa_codigo').value = '';
    contaErro('erroMfa', '');
    contaMostrarForm('formMfa');
    const btn = document.getElementById('btnMfa');
    const enviar = async (ev) => {
      ev.preventDefault();
      const code = document.getElementById('mfa_codigo').value.replace(/\D/g, '');
      if (code.length !== 6) return contaErro('erroMfa', 'O código tem 6 números (veja no app autenticador).');
      btn.disabled = true;
      try {
        const ch = await sb.auth.mfa.challenge({ factorId: fator.id });
        if (ch.error) throw ch.error;
        const v = await sb.auth.mfa.verify({ factorId: fator.id, challengeId: ch.data.id, code });
        if (v.error) throw v.error;
        form.removeEventListener('submit', enviar);
        resolve(true);
      } catch (e) {
        contaErro('erroMfa', /invalid|expired/i.test(String(e?.message)) ? 'Código errado ou vencido. Use o que está na tela agora.' : contaMensagemLogin(e, navigator.onLine));
      } finally { btn.disabled = false; }
    };
    form.addEventListener('submit', enviar);
  });
}

/* Sem a Agenda nos apps da pessoa: mostra para onde ela pode ir. */
function contaTelaSemAcesso(perfil) {
  const lista = document.getElementById('semAcessoApps');
  const apps = (perfil?.apps || []).filter((a) => a !== 'agenda' && CONTA_APPS[a]?.url);
  lista.innerHTML = apps.length
    ? apps.map((a) => `<a class="eco-item" href="${esc(CONTA_APPS[a].url)}"><span class="eco-txt"><b>${esc(CONTA_APPS[a].nome)}</b>
        <small>${esc(CONTA_APPS[a].desc)}</small></span><span class="eco-seta" aria-hidden="true">↗</span></a>`).join('')
    : '<p class="login-sub">Nenhum app liberado ainda. Peça ao administrador.</p>';
  contaMostrarForm('caixaSemAcesso');
}

/** Portão depois de ler o perfil: sem acesso → para; troca obrigatória → pede antes. */
async function contaPortaoDoPerfil(perfil) {
  if (!perfil) return true;                       // perfil não carregou: o servidor decide
  if (perfil.pode_agenda === false) { contaTelaSemAcesso(perfil); return false; }
  if (perfil.precisa_trocar_senha) {
    await contaTelaNovaSenha({ titulo: 'Crie a sua senha',
      texto: 'Você entrou com uma senha provisória. Escolha a sua (mínimo 8 caracteres) — ela vale em todos os apps da IndyCar.',
      email: perfil.email });
    try { await api('POST', '/perfil/senha-trocada'); perfil.precisa_trocar_senha = false; } catch { /* tenta de novo no próximo login */ }
    if (typeof esconderLogin === 'function') esconderLogin();
    toast('Senha criada. Bem-vindo!');
  }
  return true;
}

/** Volta do e-mail de "esqueci a senha" (evento PASSWORD_RECOVERY do Supabase). */
async function contaRecuperacao() {
  await contaTelaNovaSenha({ titulo: 'Escolha a senha nova',
    texto: 'Você abriu o link de recuperação. A senha nova vale na Agenda, no CRM e no Atendimento.' });
  try { history.replaceState(null, '', location.pathname); } catch { /* ok */ }
  location.reload();
}

/** Sair (só aqui) ou de todos os aparelhos. */
async function contaSair(todos) {
  try { await sb?.auth?.signOut(todos ? { scope: 'global' } : undefined); } catch { /* sai mesmo assim */ }
  location.replace(location.pathname);
}

/* -------------------------- topo: sino, tarefas, perfil -------------------------- */

const contaEstado = { notif: [], naoLidas: 0, tarefas: [], timer: null, canal: null, ultimaVista: 0, ligado: false };
const contaPrefs = () => ({ notif_atraso: true, notif_tarefas: true, notif_som: false, ...(state.perfil?.preferencias || {}) });

function contaFecharPops(exceto) {
  for (const id of ['popSino', 'popTarefas', 'popPerfil']) {
    if (id === exceto) continue;
    const p = document.getElementById(id);
    if (p && !p.hidden) { p.hidden = true; p.classList.remove('aberto'); document.querySelector(`[aria-controls="${id}"]`)?.setAttribute('aria-expanded', 'false'); }
  }
}
function contaAbrirPop(id, botao) {
  const p = document.getElementById(id);
  if (!p) return;
  if (!p.hidden) { contaFecharPops(); botao?.focus(); return; }
  contaFecharPops(id);
  const r = botao.getBoundingClientRect();
  p.style.setProperty('--pop-x', `${Math.max(12, Math.min(window.innerWidth - 12 - 360, r.right - 360))}px`);
  p.style.setProperty('--pop-y', `${r.bottom + 8}px`);
  if (id === 'popPerfil') { p.style.setProperty('--pop-x', `${r.right + 10}px`); p.style.setProperty('--pop-y', `${Math.max(12, r.top - 260)}px`); }
  p.hidden = false; botao.setAttribute('aria-expanded', 'true');
  setTimeout(() => p.classList.add('aberto'), 10);
  setTimeout(() => p.querySelector('button,a,input')?.focus(), 30);
}

function contaBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    const c = new Ctx(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.05; o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.12);
  } catch { /* sem som */ }
}

async function contaCarregarNotificacoes(avisar = false) {
  try {
    const r = await api('GET', '/notificacoes');
    const prefs = contaPrefs();
    const itens = (r.itens || []).filter((n) => prefs.notif_atraso || n.tipo !== 'atraso');
    const novas = itens.filter((n) => !n.lida_em && Date.parse(n.created_at) > contaEstado.ultimaVista);
    contaEstado.notif = itens;
    contaEstado.naoLidas = itens.filter((n) => !n.lida_em).length;
    if (avisar && novas.length && contaEstado.ultimaVista) {
      if (prefs.notif_som) contaBeep();
      toast(novas[0].titulo);
    }
    contaEstado.ultimaVista = Math.max(contaEstado.ultimaVista || 0, ...itens.map((n) => Date.parse(n.created_at) || 0), 1);
    contaDesenharSino();
  } catch { /* sem rede: o sino fica como estava */ }
}

function contaDesenharSino() {
  const b = document.getElementById('badgeSino');
  if (b) { b.textContent = contaEstado.naoLidas > 9 ? '9+' : String(contaEstado.naoLidas); b.hidden = !contaEstado.naoLidas; }
  document.getElementById('btnSino')?.setAttribute('aria-label',
    contaEstado.naoLidas ? `Notificações: ${contaEstado.naoLidas} não lidas` : 'Notificações');
  const lista = document.getElementById('sinoLista');
  if (!lista) return;
  const agora = Date.now();
  lista.innerHTML = contaEstado.notif.length ? contaEstado.notif.map((n) => `
    <button type="button" class="notif-item${n.lida_em ? '' : ' nova'}" data-notif="${esc(n.id)}">
      <span class="notif-ponto" aria-hidden="true"></span>
      <span class="notif-txt"><b>${esc(n.titulo)}</b>${n.corpo ? `<small>${esc(n.corpo)}</small>` : ''}
        <em>${esc(contaTempoRel(n.created_at, agora))}${n.app && n.app !== 'agenda' && CONTA_APPS[n.app] ? ' · ' + esc(CONTA_APPS[n.app].nome) : ''}</em></span>
    </button>`).join('')
    : '<div class="pop-vazio">Nada por aqui. Quando chegar tarefa, atraso ou conversa para você, aparece neste sino.</div>';
  lista.querySelectorAll('[data-notif]').forEach((el) => el.addEventListener('click', () => contaAbrirNotificacao(el.dataset.notif)));
}

async function contaAbrirNotificacao(id) {
  const n = contaEstado.notif.find((x) => x.id === id);
  if (!n) return;
  if (!n.lida_em) {
    n.lida_em = new Date().toISOString(); contaEstado.naoLidas = Math.max(0, contaEstado.naoLidas - 1); contaDesenharSino();
    api('POST', '/notificacoes/lidas', { ids: [id] }).catch(() => {});
  }
  // agendamento da própria Agenda: abre aqui mesmo, sem recarregar
  const ag = /^\/\?agendamento=([0-9a-f-]{36})$/i.exec(String(n.link || ''));
  if (ag && (!n.app || n.app === 'agenda')) {
    contaFecharPops();
    if (typeof emPresenca === 'function' && emPresenca()) return route('dia');
    return openAgendamentoModal(ag[1]);
  }
  const url = contaLinkNotificacao(n, location.origin);
  if (url) window.open(url, '_blank', 'noopener');
}

async function contaCarregarTarefas() {
  try {
    contaEstado.tarefas = await api('GET', '/tarefas');
    const b = document.getElementById('badgeTarefas');
    const n = contaEstado.tarefas.length;
    if (b) { b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }
    document.getElementById('btnTarefas')?.setAttribute('aria-label', n ? `Minhas tarefas: ${n} abertas` : 'Minhas tarefas');
    contaDesenharTarefas();
  } catch { /* segue */ }
}

function contaDesenharTarefas() {
  const lista = document.getElementById('tarefasLista');
  if (!lista) return;
  const agora = Date.now();
  lista.innerHTML = contaEstado.tarefas.length ? contaEstado.tarefas.map((t) => {
    const p = contaPrazo(t.vence_em, agora);
    return `<div class="tarefa-item${t.prioridade === 1 ? ' urgente' : ''}">
      <button type="button" class="tarefa-check" data-feita="${esc(t.id)}" aria-label="Concluir: ${esc(t.titulo)}" title="Concluir"></button>
      <div class="tarefa-txt"><b>${esc(t.titulo)}</b>${t.descricao ? `<small>${esc(t.descricao)}</small>` : ''}
        <em class="${p.atrasada ? 'atrasada' : ''}">${esc(p.txt)}${t.origem === 'automacao' ? (p.txt ? ' · ' : '') + 'automática' : ''}</em></div>
      ${t.agendamento_id && !(typeof emPresenca === 'function' && emPresenca()) ? `<button type="button" class="btn mini" data-abrir-ag="${esc(t.agendamento_id)}">Abrir</button>` : ''}
    </div>`;
  }).join('') : '<div class="pop-vazio">Nenhuma tarefa aberta para você. 🏁</div>';
  lista.querySelectorAll('[data-feita]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await api('PATCH', `/tarefas/${b.dataset.feita}`, { status: 'feita' });
      const id = b.dataset.feita;
      contaEstado.tarefas = contaEstado.tarefas.filter((t) => t.id !== id);
      contaCarregarTarefas();
      toast('Tarefa concluída', 'ok', { acao: { rotulo: 'Desfazer', fn: async () => { await api('PATCH', `/tarefas/${id}`, { status: 'aberta' }); contaCarregarTarefas(); } } });
    } catch (e) { b.disabled = false; toast(e.message, 'err'); }
  }));
  lista.querySelectorAll('[data-abrir-ag]').forEach((b) => b.addEventListener('click', () => { contaFecharPops(); openAgendamentoModal(b.dataset.abrirAg); }));
}

/** Nova tarefa (do painel ou do modal de agendamento, já ligada a ele). */
function contaNovaTarefa(pre = {}) {
  if (typeof emPresenca === 'function' && emPresenca()) return;
  contaFecharPops();
  openModal(`
    <div class="modal-head"><h3>${svg(I.check)} Nova tarefa</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <div class="field"><label for="tf_titulo">O que precisa ser feito *</label>
        <input id="tf_titulo" maxlength="200" value="${esc(pre.titulo || '')}" placeholder="Ex.: Ligar para confirmar o horário"></div>
      ${pre.rotulo ? `<p class="info-campo">${svg(I.calendar)} Ligada a: ${esc(pre.rotulo)}</p>` : ''}
      <div class="grid2">
        <div class="field"><label for="tf_vence">Prazo</label><input id="tf_vence" type="datetime-local"></div>
        <div class="field"><label for="tf_prio">Prioridade</label><select id="tf_prio">
          <option value="1">Alta</option><option value="2" selected>Normal</option><option value="3">Baixa</option></select></div>
      </div>
      <div class="field"><label for="tf_desc">Detalhes</label><textarea id="tf_desc" maxlength="1000"></textarea></div>
      <p class="form-msg" id="tf_msg" hidden></p>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="tf_salvar">${svg(I.check)} Criar tarefa</button></div>`);
  document.getElementById('tf_salvar').addEventListener('click', async () => {
    const titulo = document.getElementById('tf_titulo').value.trim();
    if (!titulo) return recado('#tf_msg', 'Escreva o que precisa ser feito.', false);
    const v = document.getElementById('tf_vence').value;
    const btn = document.getElementById('tf_salvar'); btn.disabled = true;
    try {
      await api('POST', '/tarefas', { titulo, descricao: document.getElementById('tf_desc').value.trim() || null,
        prioridade: Number(document.getElementById('tf_prio').value), vence_em: v ? new Date(v).toISOString() : null,
        agendamento_id: pre.agendamento_id || null, cliente_id: pre.cliente_id || null });
      closeModal(); toast('Tarefa criada'); contaCarregarTarefas();
    } catch (e) { recado('#tf_msg', e.message, false); btn.disabled = false; }
  });
}

/* ---- menu do perfil ---- */
function contaDesenharMenuPerfil() {
  const p = state.perfil || {};
  const pop = document.getElementById('popPerfil');
  if (!pop) return;
  pop.innerHTML = `
    <div class="perfil-topo"><span class="perfil-avatar" style="background:${esc(p.avatar_cor || '#e50914')}">${esc(iniciais(p.nome) || 'IC')}</span>
      <span><b>${esc(p.nome || 'Sua conta')}</b><small>${esc([PAPEL_LABEL[p.papel] || p.papel, p.cargo].filter(Boolean).join(' · '))}</small>
      <small>${esc(p.email || '')}</small></span></div>
    <button type="button" class="eco-item" role="menuitem" data-menu="perfil"><span class="eco-txt"><b>Meu perfil</b><small>nome, cargo, telefone e cor</small></span></button>
    <button type="button" class="eco-item" role="menuitem" data-menu="senha"><span class="eco-txt"><b>Trocar senha</b><small>vale em todos os apps</small></span></button>
    <button type="button" class="eco-item" role="menuitem" data-menu="mfa"><span class="eco-txt"><b>Verificação em duas etapas</b><small>código do celular depois da senha</small></span></button>
    <button type="button" class="eco-item" role="menuitem" data-menu="notif"><span class="eco-txt"><b>Notificações</b><small>atrasos, tarefas e som</small></span></button>
    <button type="button" class="eco-item" role="menuitem" data-menu="tema"><span class="eco-txt"><b>Tema ${temaAtual() === 'claro' ? 'escuro' : 'claro'}</b><small>trocar as cores da tela</small></span></button>
    <div class="perfil-sep"></div>
    <button type="button" class="eco-item" role="menuitem" data-menu="sair"><span class="eco-txt"><b>Sair</b><small>só neste aparelho</small></span></button>
    <button type="button" class="eco-item perigo" role="menuitem" data-menu="sair-todos"><span class="eco-txt"><b>Sair de todos os aparelhos</b><small>celular, computador, tudo</small></span></button>`;
  pop.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => {
    const acao = b.dataset.menu;
    contaFecharPops();
    if (acao === 'perfil') return contaModalPerfil();
    if (acao === 'senha') return contaModalSenha();
    if (acao === 'mfa') return contaModalMfa();
    if (acao === 'notif') return contaModalNotif();
    if (acao === 'tema') return aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro');
    if (acao === 'sair') return contaSair(false);
    if (acao === 'sair-todos' && confirm('Sair de TODOS os aparelhos? Você e quem estiver logado com a sua conta precisarão entrar de novo.')) return contaSair(true);
  }));
}

function contaModalPerfil() {
  const p = state.perfil || {};
  openModal(`
    <div class="modal-head"><h3>${svg(I.user)} Meu perfil</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label for="mp_nome">Nome *</label><input id="mp_nome" maxlength="80" value="${esc(p.nome || '')}" autocomplete="name"></div>
        <div class="field"><label for="mp_cargo">Cargo</label><input id="mp_cargo" maxlength="60" value="${esc(p.cargo || '')}" placeholder="Ex.: Consultor"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="mp_tel">Telefone</label><input id="mp_tel" type="tel" value="${esc(mascaraTelefone(p.telefone || ''))}" placeholder="(12) 99999-9999"></div>
        <div class="field"><label for="mp_email">E-mail (só leitura)</label><input id="mp_email" value="${esc(p.email || '')}" disabled></div>
      </div>
      <div class="field"><span class="rotulo-campo">Cor do avatar</span><div class="cores" role="radiogroup" aria-label="Cor do avatar">
        ${CONTA_CORES.map((c) => `<button type="button" class="cor${c === p.avatar_cor ? ' ativa' : ''}" role="radio" aria-checked="${c === p.avatar_cor}"
          aria-label="Cor ${c}" data-cor="${c}" style="background:${c}"></button>`).join('')}</div></div>
      <p class="info-campo">Função: <b>${esc(PAPEL_LABEL[p.papel] || p.papel || '—')}</b>${p.consultor_nome ? ` · consultor na agenda: <b>${esc(p.consultor_nome)}</b>` : ''} — quem muda é o administrador.</p>
      <p class="form-msg" id="mp_msg" hidden></p>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="mp_salvar">${svg(I.check)} Salvar</button></div>`);
  ligarMascaraTelefone(document.getElementById('mp_tel'));
  let cor = p.avatar_cor || '#e50914';
  document.querySelectorAll('#modal .cor').forEach((b) => b.addEventListener('click', () => {
    cor = b.dataset.cor;
    document.querySelectorAll('#modal .cor').forEach((x) => { x.classList.toggle('ativa', x === b); x.setAttribute('aria-checked', String(x === b)); });
  }));
  document.getElementById('mp_salvar').addEventListener('click', async () => {
    const nome = document.getElementById('mp_nome').value.trim();
    if (!nome) return recado('#mp_msg', 'Escreva o seu nome.', false);
    const tel = document.getElementById('mp_tel').value.trim();
    if (!telefoneOk(tel)) return recado('#mp_msg', 'Telefone incompleto: use DDD + número.', false);
    const btn = document.getElementById('mp_salvar'); btn.disabled = true;
    try {
      state.perfil = { ...state.perfil, ...(await api('PUT', '/perfil', { nome, cargo: document.getElementById('mp_cargo').value.trim(), telefone: tel, avatar_cor: cor })) };
      aplicarPerfilNaTela(); closeModal(); toast('Perfil salvo');
    } catch (e) { recado('#mp_msg', e.message, false); btn.disabled = false; }
  });
}

function contaModalSenha() {
  openModal(`
    <div class="modal-head"><h3>${svg(I.cadeado)} Trocar senha</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <p class="info-campo">É o mesmo login da Agenda, do CRM e do Atendimento: a senha nova vale em todos. Mínimo de 8 caracteres.</p>
      <div class="field"><label for="ms_s1">Nova senha</label><span class="campo-senha"><input id="ms_s1" type="password" minlength="8" autocomplete="new-password">
        <button type="button" class="ver-senha" data-ver-senha aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></div>
      <div class="field"><label for="ms_s2">Repetir a nova senha</label><input id="ms_s2" type="password" minlength="8" autocomplete="new-password"></div>
      <p class="login-caps" hidden>Caps Lock ligado</p>
      <p class="form-msg" id="ms_msg" hidden></p>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="ms_salvar">${svg(I.check)} Trocar senha</button></div>`);
  contaLigarCamposDeSenha(document.getElementById('modal'));
  document.getElementById('ms_salvar').addEventListener('click', async () => {
    const s1 = document.getElementById('ms_s1').value, s2 = document.getElementById('ms_s2').value;
    const erro = contaSenhaNovaErro(s1, s2, state.perfil?.email);
    if (erro) return recado('#ms_msg', erro, false);
    const btn = document.getElementById('ms_salvar'); btn.disabled = true;
    try {
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) throw error;
      closeModal(); toast('Senha trocada. Use a nova da próxima vez que entrar.');
    } catch (e) { recado('#ms_msg', 'Não consegui trocar: ' + (e?.message || e), false); btn.disabled = false; }
  });
}

async function contaModalMfa() {
  if (!sb?.auth?.mfa) return toast('A verificação em duas etapas não está disponível agora.', 'err');
  const { data } = await sb.auth.mfa.listFactors().catch(() => ({ data: null }));
  const ativo = (data?.totp || []).find((f) => f.status === 'verified');
  openModal(`
    <div class="modal-head"><h3>${svg(I.cadeado)} Verificação em duas etapas</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body" id="mfaCorpo">
      ${ativo ? `<p class="form-msg ok">Ligada. Depois da senha, a Agenda pede o código de 6 números do seu app autenticador.</p>
        <p class="info-campo">Trocou de celular? Desligue aqui e ligue de novo no aparelho novo.</p>`
      : `<p class="info-campo">Opcional e recomendado para quem é administrador. Use um app autenticador
        (Google Authenticator, Microsoft Authenticator…): depois da senha, a Agenda pede o código de 6 números.</p>`}
      <p class="form-msg" id="mfa_msg" hidden></p>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Fechar</button>
      ${ativo ? `<button class="btn" id="mfa_desligar">Desligar</button>` : `<button class="btn primary" id="mfa_ligar">${svg(I.cadeado)} Ligar</button>`}</div>`);
  document.getElementById('mfa_desligar')?.addEventListener('click', async () => {
    if (!confirm('Desligar a verificação em duas etapas? Sua conta volta a pedir só a senha.')) return;
    const r = await sb.auth.mfa.unenroll({ factorId: ativo.id });
    if (r.error) return recado('#mfa_msg', 'Não consegui desligar: ' + r.error.message, false);
    closeModal(); toast('Verificação em duas etapas desligada');
  });
  document.getElementById('mfa_ligar')?.addEventListener('click', async () => {
    // fator começado e não terminado atrapalha um novo: limpa antes
    for (const f of (data?.all || data?.totp || []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    const r = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Agenda IndyCar ' + new Date().toISOString().slice(0, 10) });
    if (r.error) return recado('#mfa_msg', 'Não consegui começar: ' + r.error.message, false);
    const corpo = document.getElementById('mfaCorpo');
    const qr = String(r.data?.totp?.qr_code || '');
    corpo.innerHTML = `
      <p class="info-campo">1. No app autenticador, leia o QR abaixo (ou digite a chave). 2. Digite o código de 6 números que aparecer.</p>
      ${/^data:image\//.test(qr) ? `<img class="mfa-qr" src="${esc(qr)}" alt="QR para o app autenticador" width="180" height="180">` : ''}
      <p class="mfa-chave">Chave: <code>${esc(r.data?.totp?.secret || '')}</code></p>
      <div class="field"><label for="mfa_novo">Código de 6 números</label><input id="mfa_novo" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
      <p class="form-msg" id="mfa_msg" hidden></p>`;
    const foot = document.querySelector('#modal .modal-foot');
    foot.innerHTML = `<button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" id="mfa_confirmar">${svg(I.check)} Confirmar</button>`;
    document.getElementById('mfa_novo').focus();
    document.getElementById('mfa_confirmar').addEventListener('click', async () => {
      const code = document.getElementById('mfa_novo').value.replace(/\D/g, '');
      if (code.length !== 6) return recado('#mfa_msg', 'O código tem 6 números.', false);
      const ch = await sb.auth.mfa.challenge({ factorId: r.data.id });
      if (ch.error) return recado('#mfa_msg', ch.error.message, false);
      const v = await sb.auth.mfa.verify({ factorId: r.data.id, challengeId: ch.data.id, code });
      if (v.error) return recado('#mfa_msg', 'Código errado ou vencido. Tente o que está na tela agora.', false);
      closeModal(); toast('Verificação em duas etapas ligada 🔒');
    });
  });
}

function contaModalNotif() {
  const p = contaPrefs();
  const linha = (k, t, d) => `<label class="pref"><input type="checkbox" data-pref="${k}" ${p[k] ? 'checked' : ''}>
    <span><b>${t}</b><small>${d}</small></span></label>`;
  openModal(`
    <div class="modal-head"><h3>🔔 Notificações</h3><button class="modal-close" onclick="closeModal()" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      ${linha('notif_atraso', 'Atrasos', 'Cliente 30 min atrasado e sem desfecho')}
      ${linha('notif_tarefas', 'Tarefas novas', 'Mostra um recado quando chega tarefa para você')}
      ${linha('notif_som', 'Som', 'Um bipe curto quando chega notificação')}
      <p class="form-msg" id="pn_msg" hidden></p>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="pn_salvar">${svg(I.check)} Salvar</button></div>`);
  document.getElementById('pn_salvar').addEventListener('click', async () => {
    const preferencias = {};
    document.querySelectorAll('#modal [data-pref]').forEach((c) => { preferencias[c.dataset.pref] = c.checked; });
    try {
      state.perfil = { ...state.perfil, ...(await api('PUT', '/perfil', { preferencias })) };
      closeModal(); toast('Preferências salvas'); contaCarregarNotificacoes();
    } catch (e) { recado('#pn_msg', e.message, false); }
  });
}

/** Liga sino, tarefas e menu do perfil depois que o app abriu. */
function contaIniciarTopo() {
  if (contaEstado.ligado) { contaCarregarNotificacoes(); contaCarregarTarefas(); return; }
  contaEstado.ligado = true;
  const sino = document.getElementById('btnSino'), tar = document.getElementById('btnTarefas'), av = document.getElementById('avatarPerfil');
  sino?.addEventListener('click', () => contaAbrirPop('popSino', sino));
  tar?.addEventListener('click', () => contaAbrirPop('popTarefas', tar));
  av?.addEventListener('click', () => { contaDesenharMenuPerfil(); contaAbrirPop('popPerfil', av); });
  document.getElementById('btnLerTodas')?.addEventListener('click', async () => {
    try { await api('POST', '/notificacoes/lidas', { todas: true }); contaEstado.notif.forEach((n) => { n.lida_em = n.lida_em || new Date().toISOString(); }); contaEstado.naoLidas = 0; contaDesenharSino(); }
    catch (e) { toast(e.message, 'err'); }
  });
  document.getElementById('btnNovaTarefa')?.addEventListener('click', () => contaNovaTarefa());
  document.addEventListener('click', (e) => {
    if (e.target.closest('.pop-conta') || e.target.closest('#btnSino,#btnTarefas,#avatarPerfil')) return;
    contaFecharPops();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') contaFecharPops(); });
  contaCarregarNotificacoes(); contaCarregarTarefas();
  // a cada minuto (e ao voltar para a aba); o tempo real abaixo adianta quando der
  contaEstado.timer = setInterval(() => { if (!document.hidden) { contaCarregarNotificacoes(true); contaCarregarTarefas(); } }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) contaCarregarNotificacoes(true); });
  try {
    const eu = state.perfil?.id;
    if (eu && sb?.channel) {
      contaEstado.canal = sb.channel('notif-' + eu)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${eu}` },
          () => { contaCarregarNotificacoes(true); if (contaPrefs().notif_tarefas) contaCarregarTarefas(); })
        .subscribe();
    }
  } catch { /* sem tempo real: fica a consulta de 1 em 1 minuto */ }
}

if (typeof document !== 'undefined' && document.getElementById('formLogin')) contaPrepararLogin();
