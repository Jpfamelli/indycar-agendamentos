// Rodada 3 (13/10/2026): login, acesso por app, perfil, duas etapas, sessão e sino.
// Carrega depois de app.js e melhorias.js e usa o escopo global deles ($, api, sb, PERFIL…).
'use strict';
const LS_EMAIL = 'indycar_crm_email', LS_FALHAS = 'indycar_crm_login_falhas', LS_ACESSO = 'indycar_crm_ultimo_acesso', LS_ESQUECI = 'indycar_crm_esqueci';
const VEIO_DE_RECUPERACAO = /type=recovery/.test(location.hash);
const TELAS_ACESSO = ['formLogin', 'formPrimeiro', 'formEsqueci', 'formNovaSenha', 'formMfa', 'caixaSemAcesso'];
let SESSAO_ATIVA = false, MODO_SENHA = null, TRATANDO_ACESSO = 0;

/* ---------------- telas da capa de login ---------------- */
function telaAcesso(id, focar = true) {
  for (const t of TELAS_ACESSO) { const el = $('#' + t); if (el) el.hidden = t !== id; }
  if (focar) setTimeout(() => $('#' + id)?.querySelector('input:not([type=checkbox]):not([disabled]),.btn-entrar')?.focus(), 30);
}
function mostrarLogin(mensagem, {tipo = 'erro', tela = 'formLogin'} = {}) {
  encerrarSessaoTela();
  document.body.classList.add('deslogado');
  $('#telaLogin').hidden = false;
  telaAcesso(tela, !!mensagem || tela !== 'formLogin');
  const erro = $('#erroLogin'), ok = $('#okLogin');
  erro.hidden = true; ok.hidden = true;
  if (mensagem) { const el = tipo === 'ok' ? ok : erro; el.textContent = mensagem; el.hidden = false; }
}
function esconderLogin() {
  document.body.classList.remove('deslogado');
  $('#telaLogin').hidden = true;
  $('#erroLogin').hidden = true; $('#okLogin').hidden = true;
}
/* Fecha tudo que mostra dado de cliente e para o realtime/temporizadores. */
function encerrarSessaoTela() {
  if (!SESSAO_ATIVA && !CANAIS.length) return;
  SESSAO_ATIVA = false;
  for (const c of CANAIS.splice(0)) { try { sb?.removeChannel(c); } catch { /* ignora */ } }
  try { if (modal.classList.contains('open')) fecharModal(true); if (modalCli.classList.contains('open')) fecharFichaCliente(); } catch { /* ignora */ }
  $$('dialog[open]').forEach(d => d.close());
  fecharPops();
  PERFIL = null; STATS = null;
}
/* Ação vinda de um 401/403 do servidor (por código) ou do portão da tela. */
async function tratarAcesso(acao) {
  if (Date.now() - TRATANDO_ACESSO < 1500 && acao === 'login') return;   // vários pedidos falhando juntos: um aviso só
  TRATANDO_ACESSO = Date.now();
  if (acao === 'login') { if (document.body.classList.contains('deslogado') && !$('#formLogin').hidden) return; try { await sb?.auth.signOut({scope: 'local'}); } catch { /* ignora */ } mostrarLogin('Sua sessão expirou. Entre de novo.'); }
  else if (acao === 'desativado') { try { await sb?.auth.signOut({scope: 'local'}); } catch { /* ignora */ } mostrarLogin('Seu acesso foi desativado. Fale com o gestor da loja.'); }
  else if (acao === 'sem_acesso') { if (!window.R20Tela?.soConversas()) mostrarSemAcesso(PERFIL, 'sem_app'); }   // rodada 20: quem só tem as Conversas não é barrado por uma rota do CRM
  else if (acao === 'trocar_senha') mostrarNovaSenha('obrigatoria');
  else if (acao === 'mfa') mostrarMfa();
}

/* ---------------- perfil e portão de acesso ---------------- */
const COLUNAS_PERFIL = 'id,nome,email,papel,ativo,apps,cargo,telefone,avatar_cor,precisa_trocar_senha,preferencias,ultimo_acesso_em';
async function carregarPerfil() {
  let direto = null, usuario = null;
  try {
    usuario = (await sb.auth.getUser())?.data?.user || null;
    if (usuario?.id) { const {data, error} = await sb.from('perfis').select(COLUNAS_PERFIL).eq('id', usuario.id).maybeSingle(); if (!error && data) direto = data; }
  } catch { /* cai na rota do servidor */ }
  // sem leitura direta (RLS/rede): a rota do servidor confere o mesmo e devolve 401/403 com código
  const p = direto || await api('/api/perfil');
  if (!p || !p.id) throw erroApi('Não consegui carregar o seu perfil.', 0, 'rede');
  p.email = p.email || usuario?.email || '';
  p.avatar_cor = p.avatar_cor || p.preferencias?.avatar_cor || null;
  return p;
}
async function portaoDeAcesso(p) {
  if (!p) return true;                          // sem perfil (rede): o servidor decide em cada rota
  const a = CrmUtils.acessoApp(p, 'crm');
  if (a.motivo === 'desativado') { await tratarAcesso('desativado'); return false; }
  /* rodada 20: sem o CRM mas com o Atendimento, a pessoa entra e vê só as Conversas e o Orçador */
  if (!a.ok && !(a.motivo === 'sem_app' && window.R20Tela?.podeEntrarSemCrm(p))) { mostrarSemAcesso(p, a.motivo); return false; }
  if (p.precisa_trocar_senha) { mostrarNovaSenha('obrigatoria'); return false; }
  return true;
}
function mostrarSemAcesso(p, motivo) {
  mostrarLogin(null, {tela: 'caixaSemAcesso'});
  const apps = CrmUtils.appsPermitidos(p, 'crm');
  $('#saTexto').textContent = motivo === 'papel_agenda' ? 'Seu login é só para marcar presença na Agenda.'
    : apps.length ? 'Seu login não inclui o CRM nem o Atendimento. Use um destes apps ou peça ao administrador para liberar.' : 'Nenhum app foi liberado para o seu login ainda. Fale com o administrador.';
  $('#saApps').innerHTML = apps.map(a => `<li><a class="acao" href="${esc(a.url)}">${esc(a.nome)} <span aria-hidden="true">→</span></a></li>`).join('');
  setTimeout(() => ($('#saApps a') || $('#caixaSemAcesso [data-sair-login]'))?.focus(), 30);
}

/* ---------------- formulário de entrar ---------------- */
function lerFalhas() { const f = lerLS(LS_FALHAS, {n: 0, ate: 0}); return {n: Number(f.n) || 0, ate: Number(f.ate) || 0}; }
let TIMER_ESPERA = null;
function travarEspera() {
  const btn = $('#btnEntrar'), f = lerFalhas(); clearInterval(TIMER_ESPERA);
  const passo = () => {
    const falta = Math.ceil((f.ate - Date.now()) / 1000);
    if (falta <= 0) { clearInterval(TIMER_ESPERA); btn.disabled = false; btn.textContent = 'ENTRAR'; return; }
    btn.disabled = true; btn.textContent = `AGUARDE ${falta} s`;
  };
  passo(); if (f.ate > Date.now()) TIMER_ESPERA = setInterval(passo, 1000);
}
function registrarFalha() {
  const f = lerFalhas(); f.n++; const s = CrmUtils.esperaLogin(f.n); f.ate = s ? Date.now() + s * 1000 : 0;
  gravarLS(LS_FALHAS, f); return s;
}
(function prepararLogin() {
  const email = lerLS(LS_EMAIL, '');
  if (email) { $('#loginEmail').value = email; $('#lembrarEmail').checked = true; }
  if (lerFalhas().ate > Date.now()) travarEspera();
})();
// mostrar/esconder senha (todos os campos de senha das telas)
document.addEventListener('click', e => {
  const b = e.target.closest('.ver-senha'); if (!b) return;
  const i = b.parentElement.querySelector('input'); const ver = i.type === 'password';
  i.type = ver ? 'text' : 'password'; b.setAttribute('aria-pressed', String(ver)); b.setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha'); b.textContent = ver ? '🙈' : '👁'; i.focus();
});
// aviso de Caps Lock nos campos de senha
for (const [campo, aviso] of [['#loginSenha', '#capsLogin'], ['#nsSenha', '#capsNs'], ['#nsSenha2', '#capsNs']]) {
  const el = $(campo);
  const ver = e => { if (e.getModifierState) $(aviso).hidden = !e.getModifierState('CapsLock'); };
  el.addEventListener('keydown', ver); el.addEventListener('keyup', ver); el.addEventListener('blur', () => { $(aviso).hidden = true; });
}
$('#formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#btnEntrar'), email = $('#loginEmail').value.trim().toLowerCase(), senha = $('#loginSenha').value;
  if (lerFalhas().ate > Date.now()) return travarEspera();
  if (!email || !senha) return mostrarLogin('Digite o e-mail e a senha.');
  if (navigator.onLine === false) return mostrarLogin('Sem internet. Confira a conexão e tente de novo.');
  if ($('#lembrarEmail').checked) gravarLS(LS_EMAIL, email); else { try { localStorage.removeItem(LS_EMAIL); } catch { /* ignora */ } }
  btn.disabled = true; btn.textContent = 'ENTRANDO…';
  let travou = false;
  try {
    if (!sb) throw new Error('Conexão com o Supabase não configurada.');
    const {error} = await sb.auth.signInWithPassword({email, password: senha});
    if (error) {
      const msg = CrmUtils.mensagemLogin(error);
      if (msg === 'E-mail ou senha incorretos.') { const s = registrarFalha(); if (s) { travou = true; mostrarLogin(`${msg} Muitas tentativas seguidas: espere ${s >= 60 ? Math.round(s / 60) + ' min' : s + ' s'} para tentar de novo.`); travarEspera(); return; } }
      throw new Error(msg);
    }
    gravarLS(LS_FALHAS, {n: 0, ate: 0});
    $('#loginSenha').value = '';
    await entrarDepoisDoLogin();
  } catch (err) {
    mostrarLogin(err.message === 'Failed to fetch' ? CrmUtils.mensagemLogin(err) : err.message);
  } finally {
    if (!travou) { btn.disabled = false; btn.textContent = 'ENTRAR'; }
  }
});
/* Depois da senha: confere a segunda etapa (TOTP) e só então abre o CRM. */
async function entrarDepoisDoLogin() {
  if (!(await segundaEtapaOk())) return;
  esconderLogin();
  await carregar();
}
async function segundaEtapaOk() {
  try {
    const {data, error} = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!error && data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') { mostrarMfa(); return false; }
  } catch { /* sem suporte a MFA: segue só com a senha */ }
  return true;
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-voltar-login]')) { telaAcesso('formLogin'); return; }
  if (e.target.closest('[data-sair-login]')) { try { await sb?.auth.signOut({scope: 'local'}); } catch { /* ignora */ } MODO_SENHA = null; mostrarLogin(); }
});

/* ---------------- esqueci a senha ---------------- */
$('#btnEsqueci').addEventListener('click', () => { $('#esqEmail').value = $('#loginEmail').value.trim(); $('#esqErro').hidden = true; $('#esqOk').hidden = true; telaAcesso('formEsqueci'); });
$('#formEsqueci').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#esqEmail').value.trim().toLowerCase(), erro = $('#esqErro'), ok = $('#esqOk'), btn = $('#btnEsqEnviar');
  erro.hidden = true; ok.hidden = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erro.textContent = 'Digite um e-mail válido.'; erro.hidden = false; $('#esqEmail').focus(); return; }
  const ultimo = Number(lerLS(LS_ESQUECI, 0)) || 0;
  if (Date.now() - ultimo < 60000) { erro.textContent = 'Acabamos de enviar um link. Espere um minuto antes de pedir outro.'; erro.hidden = false; return; }
  btn.disabled = true; btn.textContent = 'ENVIANDO…';
  try {
    const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: IndyCarApps.absoluto('/')});
    if (error) throw error;
    gravarLS(LS_ESQUECI, Date.now());
    // não diz se o e-mail existe: só que, se existir, o link chega
    ok.textContent = 'Pronto. Se este e-mail tiver acesso, o link chega em alguns minutos. Abra-o neste aparelho.'; ok.hidden = false;
  } catch (err) { erro.textContent = CrmUtils.mensagemLogin(err); erro.hidden = false; }
  finally { btn.disabled = false; btn.textContent = 'ENVIAR LINK'; }
});

/* ---------------- senha nova (link do e-mail ou troca obrigatória) ---------------- */
function mostrarNovaSenha(modo) {
  MODO_SENHA = modo;
  mostrarLogin(null, {tela: 'formNovaSenha'});
  $('#nsTitulo').textContent = modo === 'obrigatoria' ? 'Troque a senha provisória' : 'Crie uma senha nova';
  $('#nsSub').textContent = modo === 'obrigatoria' ? 'Por segurança, escolha a sua própria senha antes de começar. Pelo menos 8 caracteres, diferente do e-mail.' : 'Pelo menos 8 caracteres, diferente do seu e-mail.';
  $('#nsSenha').value = ''; $('#nsSenha2').value = ''; $('#nsErro').hidden = true;
}
$('#formNovaSenha').addEventListener('submit', async e => {
  e.preventDefault();
  const erro = $('#nsErro'), btn = $('#btnNsSalvar');
  erro.hidden = true;
  let email = PERFIL?.email || '';
  try { email = email || (await sb.auth.getUser())?.data?.user?.email || ''; } catch { /* ignora */ }
  const falha = CrmUtils.validarNovaSenha($('#nsSenha').value, $('#nsSenha2').value, email);
  if (falha) { erro.textContent = falha; erro.hidden = false; $('#nsSenha').focus(); return; }
  btn.disabled = true; btn.textContent = 'SALVANDO…';
  try {
    const {error} = await sb.auth.updateUser({password: $('#nsSenha').value});
    if (error) throw error;
    if (MODO_SENHA === 'obrigatoria' || PERFIL?.precisa_trocar_senha) {
      const id = PERFIL?.id || (await sb.auth.getUser())?.data?.user?.id;
      // o gatilho do banco deixa a própria pessoa desligar este aviso
      const {error: e2} = await sb.from('perfis').update({precisa_trocar_senha: false}).eq('id', id);
      if (e2) throw new Error('A senha foi trocada, mas não consegui tirar o aviso de senha provisória. Avise o administrador.');
      if (PERFIL) PERFIL.precisa_trocar_senha = false;
    }
    $('#nsSenha').value = ''; $('#nsSenha2').value = '';
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    MODO_SENHA = null; PERFIL = null;
    toast('✅ Senha nova salva');
    await entrarDepoisDoLogin();
  } catch (err) { erro.textContent = CrmUtils.mensagemLogin(err).replace(/^Não deu certo: /, ''); erro.hidden = false; }
  finally { btn.disabled = false; btn.textContent = 'SALVAR SENHA'; }
});

/* ---------------- duas etapas no login ---------------- */
function mostrarMfa() { mostrarLogin(null, {tela: 'formMfa'}); $('#mfaCodigo').value = ''; $('#mfaErro').hidden = true; }
$('#mfaCodigo').addEventListener('input', e => { const d = e.target.value.replace(/\D/g, '').slice(0, 6); e.target.value = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d; if (d.length === 6) $('#formMfa').requestSubmit(); });
$('#formMfa').addEventListener('submit', async e => {
  e.preventDefault();
  const erro = $('#mfaErro'), btn = $('#btnMfaEntrar'), codigo = $('#mfaCodigo').value.replace(/\s/g, '');
  erro.hidden = true;
  if (!CrmUtils.codigoMfaValido(codigo)) { erro.textContent = 'O código tem 6 números.'; erro.hidden = false; return; }
  if (btn.disabled) return;
  btn.disabled = true; btn.textContent = 'CONFERINDO…';
  try {
    const {data: f, error: e1} = await sb.auth.mfa.listFactors(); if (e1) throw e1;
    const fator = (f?.totp || []).find(x => x.status === 'verified'); if (!fator) throw new Error('Nenhum autenticador ativo nesta conta.');
    const {data: ch, error: e2} = await sb.auth.mfa.challenge({factorId: fator.id}); if (e2) throw e2;
    const {error: e3} = await sb.auth.mfa.verify({factorId: fator.id, challengeId: ch.id, code: codigo}); if (e3) throw e3;
    await entrarDepoisDoLogin();
  } catch (err) { erro.textContent = CrmUtils.mensagemLogin(err).replace(/^Não deu certo: /, ''); erro.hidden = false; $('#mfaCodigo').select(); }
  finally { btn.disabled = false; btn.textContent = 'CONFIRMAR'; }
});

/* ---------------- sessão: papel na tela, último acesso, avatar ---------------- */
function aplicarPapelNaTela() {
  for (const v of ['equipe', 'distribuir']) { const nav = $(`[data-view="${v}"]`); if (nav) nav.hidden = !SOU_GESTOR; }
  window.R20Tela?.aplicarModo();   // rodada 20: Conversas e Orçador para quem pode; telas do CRM só para quem tem o CRM
  $('#btnMetas').hidden = !SOU_GESTOR;
  if (modal.classList.contains('open') && editId) $('#btnExcluir').style.display = SOU_GESTOR ? 'inline-flex' : 'none';
  renderAvatar();
}
function renderAvatar() {
  const p = PERFIL || {}, cor = CrmUtils.corAvatar(p), ini = iniciais(p.nome || p.email || '?');
  const el = $('#perfilAvatar'); el.textContent = ini; el.style.setProperty('--cor-avatar', cor);
  $('#mpNome').textContent = p.nome || 'Sem nome';
  $('#mpPapel').textContent = [LABEL_PAPEL[p.papel] || p.papel, p.cargo].filter(Boolean).join(' · ');
  $('#btnPerfil').setAttribute('aria-label', 'Menu de ' + (p.nome || 'você'));
}
function iniciarSessao() {
  if (SESSAO_ATIVA || !PERFIL?.id) return;
  SESSAO_ATIVA = true;
  gravarUltimoAcesso();
  iniciarEquipeETarefas();
}
async function gravarUltimoAcesso() {
  const chave = LS_ACESSO + '_' + PERFIL?.id;
  if (!PERFIL?.id || !CrmUtils.deveGravarAcesso(lerLS(chave, null))) return;
  gravarLS(chave, Date.now());
  try { await sb.from('perfis').update({ultimo_acesso_em: new Date().toISOString(), ultimo_app: 'crm'}).eq('id', PERFIL.id); } catch { /* não atrapalha o uso */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SESSAO_ATIVA) { gravarUltimoAcesso(); recarregarTarefas(); } });

/* ---------------- menu da pessoa (rodada 11) ----------------
   O sino e os avisos moram na Central; senha na Central; conta, equipe e duas etapas no Atendimento.
   Aqui ficam só o que o CRM usa: Equipe e metas e Sem responsável (gestor), Serviços, tema e sair. */
const CANAIS = [];
function fecharPops() {
  if (!$('#menuPerfil').hidden) { $('#menuPerfil').hidden = true; $('#btnPerfil').setAttribute('aria-expanded', 'false'); }
}
$('#btnPerfil').addEventListener('click', () => {
  const abrir = $('#menuPerfil').hidden;
  $('#menuPerfil').hidden = !abrir; $('#btnPerfil').setAttribute('aria-expanded', String(abrir));
  if (abrir) setTimeout(() => $('#menuPerfil [role=menuitem]:not([hidden])')?.focus(), 20);
});
document.addEventListener('click', e => { if (!e.target.closest('.ic-pessoa')) fecharPops(); });
document.addEventListener('keydown', e => {
  if ($('#menuPerfil').hidden) return;
  if (e.key === 'Escape') { e.stopImmediatePropagation(); fecharPops(); $('#btnPerfil').focus(); return; }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
    const itens = $$('#menuPerfil [role=menuitem]:not([hidden])'), i = itens.indexOf(document.activeElement); e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? itens.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
    itens[n].focus();
  }
}, true);
$('#menuPerfil').addEventListener('click', e => {
  const b = e.target.closest('[role=menuitem]'); if (!b) return;
  fecharPops();
  const acao = b.dataset.mp;
  if (b.dataset.view) irPara(b.dataset.view);
  if (b.dataset.r20 === 'ajustes') window.R20Tela?.abrirAjustes();
  if (acao === 'tema') aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro');
  if (acao === 'sair') sair('local');
});
async function sair(escopo) {
  try { const {error} = await sb.auth.signOut({scope: escopo}); if (error) throw error; } catch { /* sai da tela de qualquer jeito */ }
  mostrarLogin('Você saiu da conta.', {tipo: 'ok'});
}

/* ---------------- configuração com espera (rodada 4) ---------------- */
const LS_CONFIG = 'indycar_crm_config';
async function buscarConfig() {
  const esperas = CrmR4.esperasAcordar();
  for (let i = 0; ; i++) {
    let status = 0, corpo = null;
    try { const r = await fetch(IndyCarApps.rota('/api/config'), {cache: 'no-store', signal: AbortSignal.timeout(25000)}); status = r.status; try { corpo = await r.json(); } catch { /* sem JSON */ } } catch { /* rede */ }
    if (status === 200 && corpo && 'configurado' in corpo) { servidorRespondeu(); return corpo; }
    if (i >= esperas.length) return null;
    mostrarAcordando(i + 1, esperas.length, esperas[i]); await esperarAcordar(esperas[i]);
  }
}
async function carregarConfig() {
  const salvo = lerLS(LS_CONFIG, null);
  const valido = c => c && c.configurado && /^https?:\/\//.test(c.supabaseUrl || '') && typeof c.supabaseAnonKey === 'string';
  const atualizar = buscarConfig().then(c => { if (valido(c)) gravarLS(LS_CONFIG, {configurado: true, supabaseUrl: c.supabaseUrl, supabaseAnonKey: c.supabaseAnonKey, iaConfigurada: !!c.iaConfigurada}); return c; });
  if (valido(salvo)) { atualizar.catch(() => {}); return salvo; }
  return atualizar;
}

/* ---------------- boot ---------------- */
(async function iniciar() {
  mostrarLogin();                       // capa primeiro: nada vaza antes da senha
  /* Rodada 4: com a configuração guardada o boot não espera a rede — então espera
     os outros scripts (equipe.js, rodada4.js) terminarem de carregar antes de entrar. */
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, {once: true}));
  /* Rodada 4: a configuração (endereço e chave PÚBLICA do Supabase) fica guardada
     no aparelho. Com o Render dormindo, o login abre na hora (fala direto com o
     Supabase) e o servidor acorda enquanto a pessoa digita a senha. */
  fetch(IndyCarApps.rota('/api/ping'), {cache: 'no-store'}).catch(() => {});   // já cutuca o servidor
  CONFIG = await carregarConfig();
  if (!CONFIG) return mostrarLogin('Não consegui falar com o servidor depois de 3 minutos. Confira a internet e recarregue a página.');
  if (!CONFIG.configurado) {
    return mostrarLogin('Falta configurar o Supabase no servidor (SUPABASE_URL, '
      + 'SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY).');
  }
  if (!window.supabase?.createClient) {
    return mostrarLogin('A biblioteca do Supabase não carregou. Verifique sua conexão.');
  }
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  sb.auth.onAuthStateChange(ev => {
    if (ev === 'PASSWORD_RECOVERY') { mostrarNovaSenha('recuperacao'); return; }
    // saiu por outro caminho (outra aba, "sair de todos" em outro aparelho, token revogado)
    if (ev === 'SIGNED_OUT' && !document.body.classList.contains('deslogado')) mostrarLogin('Sua sessão foi encerrada. Entre de novo.');
  });
  if (VEIO_DE_RECUPERACAO) { await sb.auth.getSession(); mostrarNovaSenha('recuperacao'); return; }

  // já estava logado? entra direto (com a segunda etapa, se a conta tiver)
  const {data} = await sb.auth.getSession();
  if (data?.session) {
    try { await entrarDepoisDoLogin(); }
    catch (err) { mostrarLogin(err.message); }
  } else {
    // ninguém logado: pode ser a primeira vez que o sistema abre
    await verPrimeiroAcesso();
  }
})();
