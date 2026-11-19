/* ============================================================
   Conta — padrão comum de LOGIN / PERFIL / ACESSO do ecossistema:
   login (mostrar senha, Caps Lock, lembrar e-mail, espera depois de
   5 erros), esqueci a senha, troca obrigatória, verificação em duas
   etapas (TOTP), "sem acesso", menu do perfil, sino de notificações
   e minhas tarefas. Usa as utilidades de app.js ($, esc, api, aviso).
   ============================================================ */
'use strict';

let eu = null;                 // /api/eu
let canalSino = null;
let modoNovaSenha = null;      // 'recuperacao' | 'obrigatoria' | null

/* Rodada 5: endereços vêm de public/ecossistema.js. */
const ORIGENS_APPS = Object.fromEntries(Ecossistema.COM_LOGIN.filter(a => a !== 'ads').map(a => [a, Ecossistema.url(a)]));
const NOME_PAPEL = { admin: 'Administrador', dono: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', agenda: 'Agenda' };
const CORES_AVATAR = ['#e50914', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#64748b'];

/* ---------------- token ---------------- */
async function renovarToken() {
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    if (data?.session?.access_token) token = data.session.access_token;
  } catch {}
}

/* ---------------- passos da tela de login ---------------- */
function mostrarPasso(nome) {
  $('#app').hidden = true;
  $('#tela-login').hidden = false;
  $$('.passo-login').forEach(p => { p.hidden = p.dataset.passo !== nome; });
  const foco = { entrar: '#login-email', esqueci: '#esqueci-email', nova: '#nova-senha', mfa: '#mfa-codigo' }[nome];
  if (foco) setTimeout(() => {
    const el = $(foco);
    if (nome === 'entrar' && el.value) $('#login-senha').focus(); else el.focus();
  }, 30);
}
function recado(msg, ok = false) {
  const r = $('#login-recado'), o = $('#login-ok');
  r.hidden = true; o.hidden = true;
  if (!msg) return;
  const alvo = ok ? o : r;
  alvo.textContent = msg; alvo.hidden = false;
}

/* Frases claras para cada erro do login. */
function fraseDoErro(error) {
  const m = String(error?.message || '');
  if (navigator.onLine === false || /fetch|network|Failed to fetch/i.test(m)) return 'Sem internet. Confira a conexão e tente de novo.';
  if (/invalid login|invalid_credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado. Fale com o administrador.';
  if (/banned|disabled/i.test(m)) return 'Seu usuário foi desativado. Fale com o administrador.';
  if (/rate limit|too many/i.test(m) || error?.status === 429) return 'Muitas tentativas agora. Espere alguns minutos.';
  if (/same.*password|should be different/i.test(m)) return 'A senha nova precisa ser diferente da atual.';
  if (/weak|at least/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres.';
  return 'Não foi possível entrar agora. Tente de novo.';
}

/* Espera progressiva depois de 5 erros seguidos (neste navegador). */
const CHAVE_FALHAS = 'ads-login-falhas';
function lerFalhas() { try { return JSON.parse(localStorage.getItem(CHAVE_FALHAS)) || { n: 0, ate: 0 }; } catch { return { n: 0, ate: 0 }; } }
function gravarFalhas(f) { try { localStorage.setItem(CHAVE_FALHAS, JSON.stringify(f)); } catch {} }
function esperaPara(n) { return n < 5 ? 0 : Math.min(300, 15 * 2 ** (n - 5)); }
let timerEspera = null;
function travarSeftiver() {
  const f = lerFalhas(), btn = $('#btn-entrar');
  clearInterval(timerEspera);
  const tick = () => {
    const falta = Math.ceil((f.ate - Date.now()) / 1000);
    if (falta > 0) { btn.disabled = true; btn.textContent = `Espere ${falta} s`; }
    else { btn.disabled = false; btn.textContent = 'Entrar'; clearInterval(timerEspera); }
  };
  tick();
  if (f.ate > Date.now()) timerEspera = setInterval(tick, 1000);
}

async function entrar(e) {
  e.preventDefault();
  recado(null);
  if (lerFalhas().ate > Date.now()) return travarSeftiver();
  const email = $('#login-email').value.trim();
  try {
    if ($('#login-lembrar').checked) localStorage.setItem('ads-lembrar-email', email);
    else localStorage.removeItem('ads-lembrar-email');
  } catch {}
  await ocupado($('#btn-entrar'), async () => {
    let resposta;
    try { resposta = await sb.auth.signInWithPassword({ email, password: $('#login-senha').value }); }
    catch (erro) { resposta = { error: erro }; }
    const { data, error } = resposta;
    if (error) {
      if (/invalid login|invalid_credentials/i.test(error.message || '')) {
        const f = lerFalhas(); f.n++; const s = esperaPara(f.n); f.ate = s ? Date.now() + s * 1000 : 0; gravarFalhas(f);
        recado(fraseDoErro(error) + (s ? ` Muitas tentativas: espere ${s} s.` : f.n >= 3 ? ` (${f.n} tentativas)` : ''));
      } else recado(fraseDoErro(error));
      return;
    }
    gravarFalhas({ n: 0, ate: 0 });
    $('#login-senha').value = '';
    await posLogin(data.session);
  });
  travarSeftiver();
}

/** Depois da senha: código (se tiver duas etapas), troca obrigatória, acesso ao app. */
async function posLogin(sessao) {
  if (!sessao) return mostrarPasso('entrar');
  token = sessao.access_token;
  try {
    const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel && nivel.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') return mostrarPasso('mfa');
  } catch {}
  try { eu = await api('/api/eu'); }
  catch (erro) { if (!$('#tela-login').hidden) recado(erro.message); return; }
  if (eu.precisa_trocar_senha) { modoNovaSenha = 'obrigatoria'; $('#nova-senha-sub').textContent = 'Primeiro acesso ou senha temporária: crie uma senha sua para continuar.'; return mostrarPasso('nova'); }
  if (!eu.acesso) return mostrarSemAcesso(eu.apps_disponiveis);
  recado(null);
  await abrirApp(sessao, eu);
}

function mostrarSemAcesso(apps = []) {
  $('#sem-acesso-quem').textContent = eu ? `Entrou como ${eu.nome || eu.email || ''} (${NOME_PAPEL[eu.papel] || eu.papel}).` : '';
  $('#sem-acesso-apps').innerHTML = (apps || []).length
    ? apps.map(a => `<li><a class="btn btn-fantasma" href="${esc(a.url)}">${esc(a.nome)}</a></li>`).join('')
    : '<li class="mini">Nenhum app liberado para você ainda. Fale com o administrador.</li>';
  mostrarPasso('sem-acesso');
}

/** Chamado por api() quando o servidor devolve 401/403 com código. */
function tratarCodigo(status, corpo = {}) {
  const c = corpo.codigo;
  if (status === 401) return sair({ aviso: c === 'sessao_vencida' ? 'Sua sessão venceu. Entre de novo.' : 'Entre de novo para continuar.' });
  if (c === 'desativado') return sair({ aviso: corpo.erro || 'Seu usuário foi desativado.' });
  if (c === 'sem_perfil') return sair({ aviso: corpo.erro });
  if (c === 'sem_acesso') return mostrarSemAcesso(corpo.apps);
  if (c === 'trocar_senha') { modoNovaSenha = 'obrigatoria'; return mostrarPasso('nova'); }
  if (c === 'mfa') return mostrarPasso('mfa');
}

async function sair({ aviso: msg = null, global = false } = {}) {
  try { if (canalSino) { sb.removeChannel(canalSino); canalSino = null; } } catch {}
  try { await sb?.auth.signOut(global ? { scope: 'global' } : undefined); } catch {}
  token = null; eu = null; modoNovaSenha = null;
  fecharMenus();
  $$('dialog[open]').forEach(d => d.close());
  mostrarPasso('entrar');
  recado(msg);
}

/* ---------------- esqueci / nova senha / código ---------------- */
async function enviarEsqueci(e) {
  e.preventDefault();
  const email = $('#esqueci-email').value.trim();
  await ocupado($('#btn-esqueci-enviar'), async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    // Resposta neutra: não conta para ninguém se o e-mail existe.
    if (error && /rate limit|too many/i.test(error.message || '')) return recado('Limite de e-mails por hora atingido. Tente mais tarde ou peça ao administrador uma senha temporária.');
    if (error && navigator.onLine === false) return recado(fraseDoErro(error));
    recado('Se o e-mail estiver cadastrado, o link chega em alguns minutos. Confira também o spam.', true);
  });
}

function validarSenhaNova(s1, s2, email) {
  if (s1.length < 8) return 'Use pelo menos 8 caracteres.';
  if (email && s1.trim().toLowerCase() === String(email).trim().toLowerCase()) return 'A senha não pode ser igual ao e-mail.';
  if (s1 !== s2) return 'As duas senhas não são iguais.';
  return null;
}

async function salvarSenhaNova(s1, s2) {
  const { data: u } = await sb.auth.getUser();
  const problema = validarSenhaNova(s1, s2, u?.user?.email);
  if (problema) throw new Error(problema);
  const { error } = await sb.auth.updateUser({ password: s1 });
  if (error) throw new Error(fraseDoErro(error));
  try { await api('/api/eu/senha-trocada', { method: 'POST' }); } catch {}
}

async function enviarNovaSenha(e) {
  e.preventDefault();
  await ocupado($('#btn-nova-senha'), async () => {
    try {
      await salvarSenhaNova($('#nova-senha').value, $('#nova-senha-2').value);
      $('#nova-senha').value = ''; $('#nova-senha-2').value = '';
      modoNovaSenha = null;
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      recado('Senha salva.', true);
      const { data } = await sb.auth.getSession();
      await posLogin(data.session);
    } catch (erro) { recado(erro.message); }
  });
}

async function verificarCodigo(e) {
  e.preventDefault();
  const code = $('#mfa-codigo').value.trim();
  if (!/^[0-9]{6}$/.test(code)) return recado('O código tem 6 números.');
  await ocupado($('#btn-mfa'), async () => {
    const { data: fatores, error } = await sb.auth.mfa.listFactors();
    const totp = !error && (fatores?.totp || []).find(f => f.status === 'verified');
    if (!totp) return recado('Não encontrei a verificação em duas etapas desta conta.');
    const r = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
    if (r.error) { $('#mfa-codigo').select(); return recado('Código errado ou vencido. Tente o próximo que aparecer no aplicativo.'); }
    $('#mfa-codigo').value = '';
    const { data } = await sb.auth.getSession();
    await posLogin(data.session);
  });
}

/* ---------------- menu da conta ---------------- */
const iniciais = s => String(s || '?').trim().split(/ +/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
function pintarAvatar(el, pessoa) {
  el.textContent = iniciais(pessoa?.nome || pessoa?.email);
  // Rodada 4: fundo da cor escolhida misturado com preto (iniciais brancas com contraste AA, antes 3,7:1).
  el.style.background = `color-mix(in srgb, ${pessoa?.avatar_cor || '#e50914'} 72%, #000)`;
}
function desenharConta(pessoa, sessao) {
  eu = pessoa || eu;
  $('#quem-nome').textContent = eu?.nome || 'Sem nome';
  $('#quem-sou').textContent = `${NOME_PAPEL[eu?.papel] || ''}${eu?.cargo ? ' · ' + eu.cargo : ''}` || sessao?.user?.email || '';
  $('#btn-conta').setAttribute('aria-label', `Minha conta: ${eu?.nome || eu?.email || ''}`);
  pintarAvatar($('#avatar-letra'), eu);
}

function fecharMenus() {
  $('#menu-conta').hidden = true; $('#btn-conta').setAttribute('aria-expanded', 'false');
  $('#painel-sino').hidden = true; $('#btn-sino').setAttribute('aria-expanded', 'false');
}
function alternarMenu(botao, painel) {
  const abrir = painel.hidden;
  fecharMenus();
  painel.hidden = !abrir;
  botao.setAttribute('aria-expanded', String(abrir));
  if (abrir) painel.querySelector('button, a')?.focus();
}

function abrirConta(secao = 'perfil') {
  fecharMenus();
  const m = $('#modal-conta');
  $('#conta-recado').hidden = true;
  $('#perfil-nome').value = eu?.nome || '';
  $('#perfil-cargo').value = eu?.cargo || '';
  $('#perfil-telefone').value = eu?.telefone || '';
  $('#perfil-email').textContent = eu?.email || '';
  $('#perfil-papel').textContent = NOME_PAPEL[eu?.papel] || eu?.papel || '';
  // Rodada 5: último acesso registrado no ecossistema (qual app, quando) e se o acesso foi conferido no banco.
  $('#perfil-acesso').textContent = eu?.ultimo_acesso_em
    ? `Último acesso: ${dataHora(eu.ultimo_acesso_em)}${eu.ultimo_app ? ` (${Ecossistema.nome(eu.ultimo_app)})` : ''}${eu.acesso_conferido_no_banco ? ' · acesso conferido no banco' : ''}`
    : '';
  pintarAvatar($('#perfil-avatar'), eu);
  $('#perfil-cores').innerHTML = CORES_AVATAR.map(c => `<button type="button" class="cor${(eu?.avatar_cor || '#e50914').toLowerCase() === c ? ' ativa' : ''}" data-cor="${c}" style="background:${c}" aria-label="Cor ${c}" aria-pressed="${(eu?.avatar_cor || '#e50914').toLowerCase() === c}"></button>`).join('');
  $('#notif-alertas').checked = eu?.preferencias?.notificacoes?.ads_alertas !== false;
  $('#notif-semana').checked = eu?.preferencias?.notificacoes?.ads_semana !== false;
  trocarSecao(secao);
  if (!m.open) m.showModal();
}
function trocarSecao(secao) {
  $$('.abas-conta [role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.secao === secao)));
  $$('.secao-conta').forEach(s => { s.hidden = s.dataset.secao !== secao; });
  if (secao === 'mfa') desenharMfa();
}
function recadoConta(msg, ok = false) {
  const r = $('#conta-recado');
  r.textContent = msg || ''; r.hidden = !msg; r.classList.toggle('ok', ok);
}

async function salvarPerfil(e) {
  e.preventDefault();
  const cor = $('#perfil-cores .cor.ativa')?.dataset.cor || null;
  const corpo = { nome: $('#perfil-nome').value, cargo: $('#perfil-cargo').value, telefone: $('#perfil-telefone').value, avatar_cor: cor };
  await ocupado(e.submitter || $('#form-perfil [type="submit"]'), async () => {
    try {
      await api('/api/eu', { method: 'POST', body: JSON.stringify(corpo) });
      eu = await api('/api/eu'); desenharConta(eu); pintarAvatar($('#perfil-avatar'), eu);
      recadoConta('Perfil salvo.', true);
    } catch (erro) { recadoConta(erro.message); }
  });
}
async function salvarNotif(e) {
  e.preventDefault();
  try {
    await api('/api/eu', { method: 'POST', body: JSON.stringify({ notificacoes: { ads_alertas: $('#notif-alertas').checked, ads_semana: $('#notif-semana').checked } }) });
    eu = await api('/api/eu');
    recadoConta('Preferências salvas.', true);
  } catch (erro) { recadoConta(erro.message); }
}
async function trocarSenhaPeloMenu(e) {
  e.preventDefault();
  try {
    await salvarSenhaNova($('#troca-senha').value, $('#troca-senha-2').value);
    $('#troca-senha').value = ''; $('#troca-senha-2').value = '';
    recadoConta('Senha trocada.', true);
  } catch (erro) { recadoConta(erro.message); }
}

/* ---------------- verificação em duas etapas (TOTP) ---------------- */
let fatorNovo = null;
async function desenharMfa() {
  const alvo = $('#mfa-estado');
  $('#mfa-cadastro').hidden = true;
  alvo.innerHTML = '<p class="mini">Conferindo…</p>';
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) { alvo.innerHTML = `<p class="recado">${esc(fraseDoErro(error))}</p>`; return; }
  const ativo = (data?.totp || []).find(f => f.status === 'verified');
  if (ativo) {
    alvo.innerHTML = `<div class="estado-linha"><span class="pilula on">ligada</span><span>Verificação em duas etapas ativa desde ${esc(dataHora(ativo.created_at))}.</span></div>
      <div class="linha-botoes"><button type="button" class="btn btn-fantasma btn-mini" id="mfa-desligar">Desligar</button></div>`;
    $('#mfa-desligar').addEventListener('click', async () => {
      if (!confirm('Desligar a verificação em duas etapas? Fica só a senha.')) return;
      const r = await sb.auth.mfa.unenroll({ factorId: ativo.id });
      if (r.error) return recadoConta('Para desligar, entre de novo com o código e tente outra vez.');
      recadoConta('Verificação em duas etapas desligada.', true); desenharMfa();
    });
    return;
  }
  alvo.innerHTML = `<div class="estado-linha"><span class="pilula off">desligada</span><span>Hoje só a senha protege sua conta.</span></div>
    <div class="linha-botoes"><button type="button" class="btn btn-primario btn-mini" id="mfa-ligar">Ligar</button></div>`;
  $('#mfa-ligar').addEventListener('click', ligarMfa);
}
async function ligarMfa() {
  // Restos de tentativa anterior (não verificados) atrapalham o cadastro novo.
  const { data } = await sb.auth.mfa.listFactors();
  for (const f of (data?.all || []).filter(x => x.status !== 'verified')) { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch {} }
  const r = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Tráfego pago ${new Date().toISOString().slice(0, 16)}` });
  if (r.error) return recadoConta(fraseDoErro(r.error));
  fatorNovo = r.data.id;
  $('#mfa-qr').src = r.data.totp.qr_code;
  $('#mfa-segredo').textContent = r.data.totp.secret;
  $('#mfa-cadastro').hidden = false;
  $('#mfa-ativar-codigo').focus();
}
async function ativarMfa(e) {
  e.preventDefault();
  const code = $('#mfa-ativar-codigo').value.trim();
  if (!fatorNovo || !/^[0-9]{6}$/.test(code)) return recadoConta('Digite os 6 números do aplicativo.');
  const r = await sb.auth.mfa.challengeAndVerify({ factorId: fatorNovo, code });
  if (r.error) return recadoConta('Código não confere. Espere o próximo e tente de novo.');
  fatorNovo = null; $('#mfa-ativar-codigo').value = '';
  await renovarToken();
  recadoConta('Pronto: a partir de agora o login pede o código.', true);
  desenharMfa();
}

/* ---------------- sino de notificações ---------------- */
let notificacoes = [];
const linkDaNotificacao = n => Ecossistema.linkDeNotificacao(n.link, n.app, 'ads');
function desenharSino() {
  const naoLidas = notificacoes.filter(n => !n.lida_em).length;
  const pino = $('#pino-sino');
  pino.hidden = !naoLidas; pino.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
  $('#btn-sino').setAttribute('aria-label', naoLidas ? `Notificações: ${naoLidas} não lida(s)` : 'Notificações');
  $('#sino-lista').innerHTML = notificacoes.length
    ? notificacoes.map(n => `<li class="${n.lida_em ? '' : 'nova'}">
        <a href="${esc(linkDaNotificacao(n))}" data-notif="${esc(n.id)}">
          <strong>${esc(n.titulo)}</strong>${n.corpo ? `<span class="mini">${esc(n.corpo)}</span>` : ''}
          <span class="mini quando">${esc(dataHora(n.created_at))}${n.app && n.app !== 'ads' ? ' · ' + esc(n.app) : ''}</span></a>
        ${n.lida_em ? '' : `<button type="button" class="link" data-ler="${esc(n.id)}" aria-label="Marcar como lida">Lida</button>`}</li>`).join('')
    : '<li class="mini vazio-sino">Nada por aqui. Alertas do radar e o resumo da semana aparecem neste sino.</li>';
}
async function carregarNotificacoes() {
  const { data, error } = await sb.from('notificacoes').select('id, tipo, titulo, corpo, link, app, lida_em, created_at')
    .order('created_at', { ascending: false }).limit(30);
  if (!error) { notificacoes = data || []; desenharSino(); }
}
async function marcarLida(id) {
  const agora = new Date().toISOString();
  notificacoes = notificacoes.map(n => (n.id === id ? { ...n, lida_em: agora } : n)); desenharSino();
  await sb.from('notificacoes').update({ lida_em: agora }).eq('id', id);
}
async function marcarTodas() {
  const agora = new Date().toISOString();
  notificacoes = notificacoes.map(n => ({ ...n, lida_em: n.lida_em || agora })); desenharSino();
  await sb.from('notificacoes').update({ lida_em: agora }).is('lida_em', null);
}
function ligarSino(pessoa) {
  carregarNotificacoes().catch(() => {});
  try {
    if (canalSino) sb.removeChannel(canalSino);
    canalSino = sb.channel(`sino-ads-${pessoa.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${pessoa.id}` }, carregarNotificacoes)
      .subscribe();
  } catch {}
}

/* ---------------- minhas tarefas ---------------- */
async function contarTarefas(pessoa = eu) {
  const { count } = await sb.from('tarefas').select('id', { count: 'exact', head: true })
    .eq('responsavel_id', pessoa.id).eq('status', 'aberta');
  const p = $('#pino-tarefas'); p.hidden = !count; p.textContent = String(count || 0);
}
async function carregarTarefas() {
  const lista = $('#lista-tarefas');
  lista.innerHTML = '<li class="mini">Lendo…</li>';
  const { data, error } = await sb.from('tarefas').select('id, titulo, descricao, vence_em, prioridade, origem, created_at, lead_id')
    .eq('responsavel_id', eu.id).eq('status', 'aberta').order('vence_em', { ascending: true, nullsFirst: false }).limit(100);
  if (error) { lista.innerHTML = '<li class="recado">Não foi possível ler suas tarefas agora.</li>'; return; }
  const hoje = new Date().toISOString().slice(0, 10);
  lista.innerHTML = (data || []).length ? data.map(t => {
    const vence = t.vence_em ? t.vence_em.slice(0, 10) : null;
    return `<li class="${vence && vence < hoje ? 'atrasada' : ''}">
      <button type="button" class="check" data-concluir="${esc(t.id)}" aria-label="Concluir: ${esc(t.titulo)}"></button>
      <div><strong>${esc(t.titulo)}</strong>${t.descricao ? `<p class="mini">${esc(t.descricao)}</p>` : ''}
        <p class="mini">${vence ? `vence ${esc(dataBR(vence))}${vence < hoje ? ' · atrasada' : ''}` : 'sem prazo'} · ${esc(t.origem)}${t.lead_id ? ` · <a href="${esc(Ecossistema.linkLead(t.lead_id))}" target="_blank" rel="noopener noreferrer">abrir o lead no CRM</a>` : ''}</p></div></li>`;
  }).join('') : '<li class="mini">Nenhuma tarefa aberta com você. 🏁</li>';
  contarTarefas().catch(() => {});
}
async function criarTarefa(e) {
  e.preventDefault();
  const titulo = $('#tarefa-titulo').value.trim();
  if (!titulo) return;
  const vence = $('#tarefa-vence').value;
  // Rodada 5: tarefa criada a partir de um lead (aba Leads) vai ligada ao lead/cliente, com origem 'ads'.
  const leadId = $('#tarefa-titulo').dataset.leadId || null, clienteId = $('#tarefa-titulo').dataset.clienteId || null;
  const { error } = await sb.from('tarefas').insert({
    titulo: titulo.slice(0, 140), responsavel_id: eu.id, origem: leadId ? 'ads' : 'manual',
    vence_em: vence ? `${vence}T17:30:00-03:00` : null,
    ...(leadId ? { lead_id: leadId } : {}), ...(clienteId ? { cliente_id: clienteId } : {}),
  });
  if (error) return aviso('Não foi possível criar a tarefa.', true);
  $('#tarefa-titulo').value = ''; $('#tarefa-vence').value = ''; delete $('#tarefa-titulo').dataset.leadId; delete $('#tarefa-titulo').dataset.clienteId;
  aviso(leadId ? 'Tarefa criada e ligada ao lead.' : 'Tarefa criada.');
  carregarTarefas();
}
async function concluirTarefa(id) {
  const { error } = await sb.from('tarefas').update({ status: 'feita' }).eq('id', id);
  if (error) return aviso('Não foi possível concluir a tarefa.', true);
  aviso('Tarefa concluída.');
  carregarTarefas();
}

/* ---------------- ligações ---------------- */
function ligarConta() {
  $('#form-login').addEventListener('submit', entrar);
  $('#form-esqueci').addEventListener('submit', enviarEsqueci);
  $('#form-nova-senha').addEventListener('submit', enviarNovaSenha);
  $('#form-mfa').addEventListener('submit', verificarCodigo);
  $('#btn-esqueci').addEventListener('click', () => { $('#esqueci-email').value = $('#login-email').value; recado(null); mostrarPasso('esqueci'); });
  $$('[data-voltar-login]').forEach(b => b.addEventListener('click', () => { recado(null); mostrarPasso('entrar'); }));
  $$('[data-sair]').forEach(b => b.addEventListener('click', () => sair()));

  // Mostrar/ocultar senha
  $$('[data-olho]').forEach(b => b.addEventListener('click', () => {
    const campo = document.getElementById(b.dataset.olho), ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    b.textContent = ver ? 'Ocultar' : 'Mostrar';
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
    campo.focus();
  }));
  // Caps Lock
  const caps = e => { if (e.getModifierState) $('#login-caps').hidden = !e.getModifierState('CapsLock'); };
  $('#login-senha').addEventListener('keydown', caps);
  $('#login-senha').addEventListener('keyup', caps);
  $('#login-senha').addEventListener('blur', () => { $('#login-caps').hidden = true; });
  // Lembrar e-mail
  try {
    const salvo = localStorage.getItem('ads-lembrar-email');
    if (salvo) { $('#login-email').value = salvo; $('#login-lembrar').checked = true; }
  } catch {}

  // Menu da conta e sino
  $('#btn-conta').addEventListener('click', () => alternarMenu($('#btn-conta'), $('#menu-conta')));
  $('#btn-sino').addEventListener('click', () => { alternarMenu($('#btn-sino'), $('#painel-sino')); });
  // composedPath: o item clicado pode ter sido redesenhado (marcar lida) e já não estar no DOM.
  document.addEventListener('click', e => {
    if (!e.composedPath().some(n => n.classList && (n.classList.contains('conta') || n.classList.contains('sino-caixa')))) fecharMenus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (!$('#menu-conta').hidden || !$('#painel-sino').hidden)) { fecharMenus(); } });
  $$('#menu-conta [data-menu]').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.menu;
    if (m === 'tarefas') { fecharMenus(); $('#modal-tarefas').showModal(); carregarTarefas(); }
    else abrirConta(m);
  }));
  $('#btn-sair').addEventListener('click', () => sair());
  $('#btn-sair-todos').addEventListener('click', () => { if (confirm('Sair de todos os aparelhos? Vai precisar entrar de novo em cada um.')) sair({ global: true, aviso: 'Você saiu de todos os aparelhos.' }); });
  $('#sino-lista').addEventListener('click', e => {
    const ler = e.target.closest('[data-ler]');
    if (ler) { e.preventDefault(); marcarLida(ler.dataset.ler); return; }
    const a = e.target.closest('[data-notif]');
    if (a) marcarLida(a.dataset.notif);
  });
  $('#sino-todas').addEventListener('click', marcarTodas);

  // Minha conta
  $$('.abas-conta [role="tab"]').forEach(b => b.addEventListener('click', () => trocarSecao(b.dataset.secao)));
  $('#perfil-cores').addEventListener('click', e => {
    const c = e.target.closest('[data-cor]'); if (!c) return;
    $$('#perfil-cores .cor').forEach(x => { x.classList.toggle('ativa', x === c); x.setAttribute('aria-pressed', String(x === c)); });
    pintarAvatar($('#perfil-avatar'), { ...eu, nome: $('#perfil-nome').value, avatar_cor: c.dataset.cor });
  });
  $('#form-perfil').addEventListener('submit', salvarPerfil);
  $('#form-notif').addEventListener('submit', salvarNotif);
  $('#form-trocar-senha').addEventListener('submit', trocarSenhaPeloMenu);
  $('#form-mfa-ativar').addEventListener('submit', ativarMfa);
  $$('dialog [data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  // Tarefas
  $('#form-tarefa').addEventListener('submit', criarTarefa);
  $('#lista-tarefas').addEventListener('click', e => { const b = e.target.closest('[data-concluir]'); if (b) concluirTarefa(b.dataset.concluir); });
}

/* ---------------- partida ---------------- */
async function iniciarSupabase() {
  let cfg;
  // Rodada 4: com o servidor dormindo, a tela de entrar mostra "o sistema está acordando" e tenta de novo sozinha.
  const lerConfig = async () => {
    let r;
    try { r = await fetch('/api/config-publica'); }
    catch { throw Object.assign(new Error(Rede.mensagem(0, navigator.onLine)), { status: 0 }); }
    if (!r.ok) throw Object.assign(new Error(Rede.mensagem(r.status, navigator.onLine) || 'Servidor fora. Tente de novo em instantes.'), { status: r.status });
    return r.json();
  };
  try {
    cfg = await Rede.comNovasTentativas(lerConfig, { aoEsperar: mostrarAcordando, dormir: dormirAcordando });
    esconderAcordando();
  } catch (e) { recado(e.message || 'Sem internet ou servidor fora. Tente de novo em instantes.'); return null; }
  if (!cfg.supabase_url || !cfg.supabase_anon_key) { recado('Servidor sem configuração do Supabase. Preencha o .env e reinicie.'); return null; }
  sb = window.supabase.createClient(cfg.supabase_url, cfg.supabase_anon_key);
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (sessao?.access_token) token = sessao.access_token;
    if (evento === 'PASSWORD_RECOVERY') {
      modoNovaSenha = 'recuperacao';
      $('#nova-senha-sub').textContent = 'Crie sua senha nova.';
      mostrarPasso('nova');
    }
    if (evento === 'SIGNED_OUT' && !$('#app').hidden) sair({ aviso: 'Sua sessão terminou. Entre de novo.' });
  });
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

/* Rodada 4: a casca do app fica no aparelho (sw.js) — com o servidor dormindo, a tela abre e mostra "acordando". */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

(async function inicio() {
  aplicarTema(temaAtual());
  ligarEventos();
  ligarConta();
  travarSeftiver();
  const recuperando = /type=recovery/.test(location.hash);
  const sessao = await iniciarSupabase();
  if (recuperando || modoNovaSenha === 'recuperacao') { modoNovaSenha = 'recuperacao'; mostrarPasso('nova'); return; }
  if (sessao) await posLogin(sessao); else mostrarPasso('entrar');
})();
