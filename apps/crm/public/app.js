/* ============================================================
   IndyCar CRM — front-end (JS puro)
   ============================================================ */
'use strict';

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

/* Escapa texto que vai para innerHTML. Sem isto, um cliente chamado
   "<img src=x onerror=...>" executaria script em todo carregamento. */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/* Sessão do Supabase Auth — a mesma conta do app de Atendimento. */
let sb = null, CONFIG = null;

/* Cabeçalhos com o token do login. Todas as rotas do CRM exigem estar logado. */
async function authCabecalhos() {
  const cab = { 'Content-Type': 'application/json' };
  if (!sb) return cab;
  const { data } = await sb.auth.getSession();
  const t = data?.session?.access_token;
  if (!t) throw new Error('Sua sessão expirou. Entre de novo para continuar.');
  cab.Authorization = `Bearer ${t}`;
  return cab;
}

/* Lança em status HTTP de erro — antes, um 400 do servidor virava "salvo com sucesso".
   401/403 viram ação da tela pelo `codigo` do servidor (CrmUtils.acaoErroAcesso):
   sessão vencida tenta renovar o token UMA vez e repete o pedido; desativado/sem acesso/
   troca de senha/duas etapas levam à tela certa; o resto vira erro com status e código. */
function erroApi(msg, status, codigo) { const e = new Error(msg); e.status = status; e.codigo = codigo || null; return e; }

/* ---------------- servidor acordando (rodada 4) ----------------
   O Render gratuito dorme. Ao acordar, responde 502/503/504 por alguns minutos
   (ou a conexão cai). Em vez de erro cru: faixa "acordando", novas tentativas
   com espera crescente (~3 min) e aviso quando voltar. Escritas vão com chave de
   idempotência — repetir não faz a ação duas vezes. */
const R4 = CrmR4;
const Rede = { acordando: false, desde: 0, cutucar: null, timer: null };
function esperarAcordar(seg) {
  return new Promise(resolve => {
    const t = setTimeout(fim, seg * 1000);
    function fim() { clearTimeout(t); window.removeEventListener('online', fim); document.removeEventListener('indycar:cutucar', fim); resolve(); }
    window.addEventListener('online', fim); document.addEventListener('indycar:cutucar', fim);
  });
}
function mostrarAcordando(tentativa, total, seg) {
  const el = $('#acordando'); if (!el) return;
  if (!Rede.acordando) { Rede.acordando = true; Rede.desde = Date.now(); }
  el.hidden = false; document.body.classList.add('acordando');
  let falta = seg;
  const txt = () => { $('#acordandoTxt').textContent = navigator.onLine === false ? 'Sem internet. Assim que a conexão voltar, o CRM tenta de novo sozinho.' : R4.textoAcordando(tentativa, total, falta); };
  txt(); clearInterval(Rede.timer); Rede.timer = setInterval(() => { falta = Math.max(0, falta - 1); txt(); }, 1000);
}
function servidorRespondeu() {
  if (!Rede.acordando) return;
  Rede.acordando = false; clearInterval(Rede.timer);
  const el = $('#acordando'); if (el) el.hidden = true; document.body.classList.remove('acordando');
  const s = Math.round((Date.now() - Rede.desde) / 1000);
  toast(`✅ O sistema voltou${s > 5 ? ` (levou ${s} s)` : ''}. Pode continuar.`, 4500);
  document.dispatchEvent(new CustomEvent('indycar:voltou'));
}
const api = async (url, opts, renovou = false, cfg = {}) => {
  // rodada 5: caminho relativo à pasta do app (na Central o CRM mora em /crm/)
  url = IndyCarApps.rota(url);
  const metodo = String(opts?.method || 'GET').toUpperCase();
  const esperas = R4.esperasAcordar().slice(0, cfg.tentativas ?? 10);
  // a chave acompanha todas as tentativas desta mesma escrita
  const chave = metodo === 'GET' ? null : (opts?.headers?.['x-idempotencia'] || R4.novaChave());
  let r = null, corpo = null;
  for (let i = 0; ; i++) {
    let status = 0; corpo = null;
    try {
      r = await fetch(url, { signal: AbortSignal.timeout(metodo === 'GET' ? 25000 : 30000), ...opts, headers: { ...(await authCabecalhos()), ...(opts?.headers || {}), ...(chave ? { 'x-idempotencia': chave } : {}) } });
      status = r.status;
      try { corpo = await r.json(); } catch { /* resposta sem corpo JSON (ex.: página de erro do Render) */ }
    } catch (e) {
      if (/sessão expirou/i.test(e.message)) { tratarAcesso('login'); throw e; }
      // prazo de quem chamou (ex.: a IA, 90 s) acabou: não adianta repetir com o mesmo sinal
      if (opts?.signal?.aborted) throw erroApi('Demorou demais para responder. Tente de novo.', 0, 'tempo');
    }
    const acordando = R4.ehAcordando(status, corpo);
    if (acordando && R4.deveRepetir({ metodo, status, corpo, chave: !!chave }) && i < esperas.length) {
      mostrarAcordando(i + 1, esperas.length, esperas[i]); await esperarAcordar(esperas[i]); continue;
    }
    // 5xx do NOSSO servidor (banco lento): leitura tenta mais duas vezes, sem alarde
    if (!acordando && metodo === 'GET' && [502, 503, 504].includes(status) && i < 2) { await esperarAcordar(1.5 * (i + 1)); continue; }
    if (acordando) {
      throw erroApi(navigator.onLine === false ? 'Sem internet. Confira a conexão e tente de novo.'
        : 'O sistema ainda não acordou. Nada do que você fez se perdeu: tente de novo em instantes.', status, 'acordando');
    }
    servidorRespondeu();
    break;
  }
  const acao = CrmUtils.acaoErroAcesso(r.status, corpo);
  if (acao === 'login' && !renovou && sb) {
    // token vencido no meio do uso: renova sozinho e repete, sem derrubar a pessoa
    try { const { data, error } = await sb.auth.refreshSession(); if (!error && data?.session) return api(url, { ...opts, headers: { ...(opts?.headers || {}), ...(chave ? { 'x-idempotencia': chave } : {}) } }, true, cfg); } catch { /* cai no login */ }
  }
  const msg = (corpo && (corpo.erro || corpo.error)) || (r.status === 403 ? 'Você não tem permissão para isso.' : `Erro ${r.status} do servidor`);
  if (acao && acao !== 'proibido') { tratarAcesso(acao, corpo); throw erroApi(acao === 'login' ? 'Sessão expirada' : msg, r.status, acao); }
  if (!r.ok) throw erroApi(msg, r.status, corpo?.codigo);
  return corpo;
};
const brl = CrmUtils.moeda;
const dt  = s => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const LABEL_STATUS = { novo:'Novo', contato:'Em contato', orcamento:'Orçamento',
  agendado:'Agendado', em_servico:'Em serviço', concluido:'Concluído', perdido:'Perdido' };
const LABEL_ORIGEM = { meta:'Meta / Instagram', google:'Google', indicacao:'Indicação',
  organico:'Orgânico', whatsapp:'WhatsApp', passagem:'Passagem / Fachada', telefone:'Telefone' };
const COR_ORIGEM = { meta:'#3b82f6', google:'#e50914', indicacao:'#22c55e',
  organico:'#a855f7', whatsapp:'#25d366', passagem:'#f59e0b', telefone:'#06b6d4' };
const ORIGENS_FIXAS = ['meta', 'google', 'indicacao', 'organico', 'whatsapp', 'passagem', 'telefone'];
/* Pátio + Área do Cliente (16/10/2026) */
const ETAPA_PATIO = { recebido:'Recebido', diagnostico:'Diagnóstico', aguardando_aprovacao:'Aguardando aprovação', aguardando_peca:'Aguardando peça',
  em_execucao:'Em execução', teste:'Em teste', pronto:'Pronto', entregue:'Entregue', cancelado:'Cancelado' };
const STATUS_INDICACAO = { nova:'nova', contatada:'contatada', agendou:'agendou', virou_cliente:'virou cliente', descartada:'descartada' };
const SERVICOS = ['Troca de Óleo de Motor','Troca de Óleo de Câmbio','Freios','Suspensão','Direção',
  'Correia Dentada','Pneus','Alinhamento 3D','Embreagem','Diagnóstico com Scanner',
  'Revisão de Motor','Revisão de Suspensão','Limpeza de Bicos','Outro'];

/* LEADS  = recorte filtrado (só a tabela da aba Leads usa)
   TODOS  = base completa (dashboard, funil e o modal usam) */
let STATUSES = [], ORIGENS = [], LEADS = [], TODOS = [], STATS = null;
/* Pátio + Área do Cliente (16/10): lead_id → { indicado_por_nome, status } das indicações */
let INDICADOS = new Map();

/* PERFIL   = quem está logado (nome, e-mail, papel, apps, cargo…)
   SOU_ADMIN / SOU_GESTOR são só para a apresentação: o servidor confere de novo em cada rota. */
let PERFIL = null, SOU_ADMIN = false, SOU_GESTOR = false;
let CATALOGO = [];              // os 138 serviços, como vieram do banco

/* ---------------- Navegação ---------------- */
/* Rodada 11: 5 abas no topo (Hoje, Contatos, Funil, Clientes, Painel). Equipe, Sem responsável e
   Serviços abrem pelo menu da pessoa. Origem, Relatórios, Dono, Integrações, IA e Configurações saíram:
   anúncios moram no Tráfego, a conta na Central e a equipe no Atendimento. */
const TITULOS = {
  hoje:       ['Hoje'],
  leads:      ['Contatos'],
  pipeline:   ['Funil'],
  clientes:   ['Clientes'],
  dashboard:  ['Painel'],
  equipe:     ['Equipe e metas'],
  distribuir: ['Contatos sem responsável'],
  servicos:   ['Serviços'],
};
// a busca do topo só filtra estas abas (Clientes e Serviços têm a própria busca, dentro da aba)
const ABAS_COM_BUSCA = new Set(['leads', 'pipeline']);
const ABAS_SEM_NOVO = new Set(['servicos', 'equipe', 'distribuir', 'hoje']);

function irPara(v) {
  if (!TITULOS[v]) return;
  if ($(`[data-view="${v}"]`)?.hidden) v = 'dashboard';   // aba escondida para o papel: não abre por atalho nem link
  $$('.nav-item').forEach(x => { x.classList.toggle('active', x.dataset.view === v); if (x.dataset.view === v) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  $$('.view').forEach(x => x.classList.remove('active'));
  $(`#view-${v}`)?.classList.add('active');
  $('#viewTitle').textContent = TITULOS[v][0];
  $('.search').style.display = ABAS_COM_BUSCA.has(v) ? '' : 'none';
  $('#btnNovo').style.display = ABAS_SEM_NOVO.has(v) ? 'none' : '';
  if (v === 'clientes')      carregarClientes();
  if (v === 'servicos')      carregarCatalogo();
  if (v === 'equipe')        carregarEquipeMetas();
  document.dispatchEvent(new CustomEvent('indycar:aba', { detail: { aba: v } }));   // rodada4.js monta Distribuir e Relatórios
  try { sessionStorage.setItem('indycar_crm_aba', v); } catch { /* ignora */ }
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => irPara(b.dataset.view)));

/* ---------------- Tema claro / escuro ----------------
   O <html data-tema> já foi definido pelo script inline do <head> (para não
   piscar). Aqui só sincronizamos o botão, o meta e a persistência. */
const TEMA_KEY = 'indycar_tema';
const temaAtual = () =>
  document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';

function aplicarTema(tema) {
  const claro = tema === 'claro';
  const raiz = document.documentElement;

  /* Desliga as transições durante a troca. Sem isto, o Chrome congela a cor
     antiga de tudo que tem transition e a variável mudou — medido aqui: a
     barra lateral ficava em rgb(13,13,15) com --sidebar já valendo #ffffff. */
  raiz.classList.add('trocando-tema'); raiz.setAttribute('data-trocando-tema','');
  raiz.setAttribute('data-tema', claro ? 'claro' : 'escuro');
  void document.body.offsetHeight;              // força o recálculo já, sem transição
  const soltar = () => { raiz.classList.remove('trocando-tema'); raiz.removeAttribute('data-trocando-tema'); };
  requestAnimationFrame(() => requestAnimationFrame(soltar));
  // rede de segurança: requestAnimationFrame não roda em aba oculta, e sem
  // isso as transições ficariam desligadas até a aba voltar para a frente
  setTimeout(soltar, 150);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', claro ? '#eaecf0' : '#0a0a0b');

  try { localStorage.setItem(TEMA_KEY, claro ? 'claro' : 'escuro'); } catch { /* ignora */ }
}

// deixa o botão e o meta coerentes com o que o script do <head> já aplicou
aplicarTema(temaAtual());

/* ---------------- Toast ---------------- */
let toastT;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  $('#toastTxt').textContent = msg;
  $('#toastAcao').hidden = true;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------------- Carregar dados ---------------- */
async function carregar() {
  // quem sou eu: define o que a tela mostra (o servidor confere de novo, sempre)
  const primeiraVez = !STATS;
  if (primeiraVez || !PERFIL) {
    try { PERFIL = await carregarPerfil(); }
    catch (e) { if (e.codigo && e.codigo !== 'rede') return; PERFIL = null; }
    /* Portão da tela (acesso.js): desativado, troca obrigatória de senha e app
       fora dos liberados param aqui — o servidor também devolve 401/403. */
    if (!(await portaoDeAcesso(PERFIL))) return;
  }
  SOU_ADMIN = PERFIL?.papel === 'admin';
  SOU_GESTOR = CrmUtils.ehGestor(PERFIL?.papel);
  aplicarPapelNaTela();
  iniciarSessao();

  try {
    const primeira = !STATS;
    if (primeira) {
      $('#kpis').innerHTML = '<div class="skeleton" aria-label="Carregando indicadores"></div>'.repeat(6);
      $('#kanban').innerHTML = '<div class="kb-col"><div class="skeleton alto" aria-label="Carregando funil"></div></div>'.repeat(4);
      $('#tblLeads').innerHTML = '<tbody><tr><td><div class="skeleton" aria-label="Carregando contatos"></div></td></tr></tbody>';
    }
    /* Rodada 4: as etapas e origens são fixas (enums do banco) — não precisa mais
       pedir /api/stats (que lia a base inteira) só para saber delas. O painel e a
       aba Origem calculam tudo com os leads que já vieram. */
    STATUSES = CrmUtils.ETAPAS.slice();
    ORIGENS  = ORIGENS_FIXAS.slice();
    if (!STATS) STATS = { dominios: { STATUSES, ORIGENS } };
    preencherSelects();
    await carregarLeads();
    renderPainel();
    if (primeira) {
      let aba = null; try { aba = sessionStorage.getItem('indycar_crm_aba'); } catch { /* ignora */ }
      const atalho = Object.hasOwn(TITULOS, aba) && [...document.querySelectorAll('[data-view]')].find(item => item.dataset.view === aba);
      irPara(atalho && !atalho.hidden ? aba : 'hoje');   // rodada 13: a primeira visita abre Hoje (o resumo do dia)
      abrirPorLink();
    }
  } catch (err) {
    if (err.codigo && err.codigo !== 'rede' && err.status && [401, 403].includes(err.status) && document.body.classList.contains('deslogado')) return;
    // antes, uma falha aqui deixava a tela em branco sem explicação
    toast('⚠️ ' + err.message);
    const alvo = $('#kpis');
    if (alvo && !alvo.children.length) {
      alvo.innerHTML = `<div class="alert" style="grid-column:1/-1">
        Não foi possível carregar os dados: ${esc(err.message)}</div>`;
    }
  }
}

async function carregarLeads() {
  const geracao = ++geracaoLeads;
  // base completa: o funil e o dashboard nunca podem herdar o filtro da aba Leads
  const [todos, ind] = await Promise.all([api('/api/leads'), api('/api/indicacoes').catch(() => null)]);
  if (geracao !== geracaoLeads) return;
  TODOS = Array.isArray(todos) ? todos : [];
  if (ind && Array.isArray(ind.indicacoes)) INDICADOS = new Map(ind.indicacoes.filter(i => i.lead_id).map(i => [String(i.lead_id), i]));
  refiltrar(); salvarFiltros();
  $('#leadCount').textContent = `${LEADS.length} contato${LEADS.length === 1 ? '' : 's'}`;   // antes ficava "0 registros" até mexer num filtro
  renderTabelaLeads();
  renderKanban();               // sempre sobre TODOS
}

function preencherSelects() {
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;

  // preserva o que o usuário escolheu — antes, salvar um lead zerava o filtro
  const stAtual = $('#fStatus').value, ogAtual = $('#fOrigem').value;

  $('#fStatus').innerHTML = '<option value="">Todas as etapas</option>' +
    STATUSES.map(s => opt(s, LABEL_STATUS[s] ?? s)).join('');
  $('#fOrigem').innerHTML = '<option value="">Todas as origens</option>' +
    ORIGENS.map(o => opt(o, o === 'indicacao' ? 'Indicação (inclui as da Área do Cliente)' : LABEL_ORIGEM[o] ?? o)).join('') +
    opt('area_cliente', 'Área do Cliente (link do cliente)') +
    opt('pago_meta', 'Anúncio da Meta') + opt('pago_google', 'Anúncio do Google') +
    opt('pago_sem_plataforma', 'Anúncio sem plataforma') + opt('nao_pago', 'Contato não pago') +
    opt('origem_incerta', 'Não sei de onde veio');

  if (stAtual && STATUSES.includes(stAtual)) $('#fStatus').value = stAtual;
  if (Array.from($('#fOrigem').options).some(o => o.value === ogAtual)) $('#fOrigem').value = ogAtual;

  $('#fStatusForm').innerHTML = STATUSES.map(s => opt(s, LABEL_STATUS[s] ?? s)).join('');
  $('#fOrigemForm').innerHTML = ORIGENS.map(o => opt(o, LABEL_ORIGEM[o] ?? o)).join('');
  $('#fServico').innerHTML = '<option value="">—</option>' + SERVICOS.map(s => opt(s, s)).join('');
  $('#loteStatus').innerHTML = '<option value="">Mudar etapa…</option>' + STATUSES.map(s => opt(s, LABEL_STATUS[s] ?? s)).join('');
  $('#loteOrigem').innerHTML = '<option value="">Atribuir origem…</option>' + ORIGENS.map(o => opt(o, LABEL_ORIGEM[o] ?? o)).join('');
}

/* Dashboard, tabelas e funil: renderPainel, renderTabela e renderKanban em melhorias.js */

/* ---------------- Modal ---------------- */
const modal = $('#modalBg');
let editId = null;

async function abrirModal(id, pre = {}) {
  // Resolve o lead ANTES de mexer no estado. Antes, um id que não estivesse no
  // recorte filtrado abria o modal em branco com editId setado — e salvar
  // sobrescrevia o cliente com campos vazios.
  if (modal.classList.contains('open') && !fecharModal()) return;
  let l = null;
  if (id) {
    // compara como texto: uuid (Supabase) e número (SQLite) convivem
    const mesmo = x => String(x.id) === String(id);
    l = TODOS.find(mesmo) || LEADS.find(mesmo) || null;
    if (!l) {
      try { const r = await api('/api/leads/' + encodeURIComponent(id)); l = r && r.id ? r : null; } catch { l = null; }
    }
    if (!l) { toast('Contato não encontrado — atualize a página.'); return; }
  }
  editId = l ? l.id : null;
  LEAD_ABERTO = l ? l.id : null;
  $('#modalTitle').textContent = l ? 'Contato' : 'Novo contato';
  $('#modalTitle').classList.toggle('sr', !!l);
  $('#btnExcluir').style.display = l && SOU_GESTOR ? 'inline-flex' : 'none';   // só gestor/admin apaga (o banco também barra)
  $('#leadFicha').hidden = !l;
  $('#painelDados').setAttribute('role', l ? 'tabpanel' : 'region');
  preencherForm(l, pre);
  if (l) { renderFichaLead(l); mostrarAba('abaTl'); renderTarefas(); carregarLinhaTempo(l); }
  else $('#painelDados').hidden = false;
  modal.classList.add('open'); ativarDialogo(modal, l ? null : '#modalTitle');
  if (l) modal.firstElementChild.setAttribute('aria-label', 'Contato ' + l.nome); else modal.firstElementChild.removeAttribute('aria-label');
  if (!l) $('#fNome').focus();
  document.body.style.overflow = 'hidden';
  emitirLead(l);
}
/* Fecha a gaveta. Com alterações não salvas, pergunta antes (forcar ignora). */
function fecharModal(forcar) {
  if (!modal.classList.contains('open')) return true;
  if (forcar !== true && formSujo() && !confirm('Descartar as alterações que não foram salvas?')) return false;
  modal.classList.remove('open'); restaurarFoco(modal);
  document.body.style.overflow = '';
  const tinha = LEAD_ABERTO; editId = null; LEAD_ABERTO = null; LT_GERACAO++;
  if (tinha) emitirLead(null);
  return true;
}
$('#btnNovo').addEventListener('click', () => abrirModal(null));
$('#modalX').addEventListener('click', fecharModal);
$('#btnCancelar').addEventListener('click', fecharModal);
modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || $('dialog[open]')) return;
  if (modalCli.classList.contains('open')) fecharFichaCliente(); else fecharModal();
});

$('#leadForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!validarForm()) return;
  const payload = {
    nome: $('#fNome').value.trim(), telefone: U.telE164($('#fTelefone').value) || $('#fTelefone').value.trim(),
    carro_modelo: $('#fCarro').value.trim(), placa: $('#fPlaca').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
    servico: $('#fServico').value, origem: $('#fOrigemForm').value,
    valor_orcado: $('#fOrcado').value || 0, valor_pago: $('#fPago').value || 0,
    status: $('#fStatusForm').value, utm_campaign: $('#fCampanha').value.trim(),
    utm_source: $('#fUtmSource').value.trim(), utm_medium: $('#fUtmMedium').value.trim(),
    observacoes: $('#fObs').value.trim(),
  };
  const btnSalvar = $('#leadForm button[type="submit"]');
  btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando…';
  try {
    const editando = editId, antes = editando ? TODOS.find(x => String(x.id) === String(editando)) : null;
    if (payload.status === 'perdido' && antes?.status !== 'perdido') {
      const m = await perguntarPerda(payload.nome); if (!m) return;
      Object.assign(payload, U.camposPerda(payload.observacoes, m.codigo, m.texto));
    }
    if (payload.status === 'concluido' && antes?.status !== 'concluido' && !(Number(payload.valor_pago) > 0)) {
      const v = await perguntarPagoDetalhe({...antes, ...payload, valor_pago: 0}); if (!v) return;
      payload.valor_pago = v.valor;
      if (v.cortesia) payload.observacoes = CrmR4.comCortesia(payload.observacoes);
    }
    const falha = CrmUtils.validarLead(payload); if (falha) { toast('⚠️ ' + falha); return; }
    const salvo = editando ? await api(`/api/leads/${encodeURIComponent(editando)}`, { method: 'PATCH', body: JSON.stringify(payload) })
                           : await api('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
    fecharModal(true);
    substituirLocal(salvo); redesenhar();
    if (editando) toast('✅ Contato atualizado');
    else toastAcao('✅ Contato cadastrado', 'Abrir', () => abrirModal(salvo.id));
    carregar().catch(() => {});   // números do servidor (estatísticas) em segundo plano
  } catch (err) {
    // erro do servidor não pode mais virar "sucesso"; a gaveta fica aberta com tudo o que foi digitado
    toast('⚠️ ' + err.message + (err.codigo === 'acordando' ? ' A ficha continua aberta: clique em Salvar de novo.' : ''), 7000);
  } finally {
    btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar';
  }
});

$('#btnExcluir').addEventListener('click', async () => {
  const l = TODOS.find(x => String(x.id) === String(editId));
  if (!editId || !confirm(`Excluir o contato ${l?.nome || ''}? Essa ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/leads/${encodeURIComponent(editId)}`, { method: 'DELETE' });
    fecharModal(true);
    toast('🗑️ Contato excluído');
    await carregar();
  } catch (err) {
    toast('⚠️ ' + err.message);
  }
});

/* ---------------- Filtros ---------------- */
let buscaT;
// a busca filtra o que já está na tela: sem ir ao servidor a cada letra
$('#search').addEventListener('input', () => { clearTimeout(buscaT); buscaT = setTimeout(() => { PAG_LEADS = 1; refiltrar(); renderTabelaLeads(); renderKanban(); $('#leadCount').textContent = `${LEADS.length} contato${LEADS.length === 1 ? '' : 's'}`; }, 200); });
// rodada 4: filtros só refazem a lista na tela (antes cada troca baixava todos os leads de novo)
const refiltrarTela = () => { PAG_LEADS = 1; refiltrar(); salvarFiltros(); renderTabelaLeads(); $('#leadCount').textContent = `${LEADS.length} contato${LEADS.length === 1 ? '' : 's'}`; };
$('#fStatus').addEventListener('change', refiltrarTela);
$('#fOrigem').addEventListener('change', refiltrarTela);


/* ============================================================
   CLIENTES — a base compartilhada com a Agenda e o Atendimento
   ============================================================ */
const LABEL_AGENDAMENTO = {
  agendado:'Agendado', confirmado:'Confirmado', em_atendimento:'Em atendimento',
  concluido:'Concluído', compareceu:'Compareceu', nao_veio:'Não veio', cancelado:'Cancelado',
};
/* Data com ano — na ficha do cliente o histórico atravessa meses e
   "12/03" sozinho não diz de qual ano é. */
const dtAno = s => s ? (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(2,4)}` : new Date(s).toLocaleDateString('pt-BR',
  { day:'2-digit', month:'2-digit', year:'2-digit' })) : '—';
/* Data pura do banco ("2026-07-16") — new Date() nela assume UTC e o
   fuso do Brasil jogaria o dia para trás. Por isso montamos na mão. */
const dtSimples = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '—';
};
const iniciais = nome => String(nome ?? '?').trim().split(/\s+/)
  .slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';

const modalCli = $('#modalCliBg');

let CLIENTES = [], PAG_CLI = 1;
let pedidoClientes = 0;
async function carregarClientes() {
  const alvo = $('#tblClientes');
  const q = $('#buscaCliente').value.trim();
  const pedido = ++pedidoClientes;
  const atual = () => pedido === pedidoClientes && q === $('#buscaCliente').value.trim();
  alvo.setAttribute('aria-busy', 'true');
  if (!CLIENTES.length) alvo.innerHTML = '<tbody><tr><td><div class="skeleton" aria-hidden="true"></div><span class="sr">Carregando clientes</span></td></tr></tbody>';
  try {
    const r = await api('/api/clientes' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    if (!atual()) return;
    CLIENTES = r.clientes || []; PAG_CLI = 1;

    renderClientes();
  } catch (err) {
    if (!atual()) return;
    $('#pagClientes').replaceChildren();
    $('#cliCount').textContent = '';
    alvo.innerHTML = `<tbody><tr><td style="padding:26px" class="muted">
      <div class="alert" role="alert">Não consegui carregar os clientes: ${esc(err.message)}</div>
      <button type="button" class="btn btn-ghost" id="clientesTentar">Tentar novamente</button></td></tr></tbody>`;
    $('#clientesTentar').addEventListener('click', carregarClientes);
  } finally {
    if (atual()) alvo.setAttribute('aria-busy', 'false');
  }
}
function renderClientes() {
  const alvo = $('#tblClientes'), q = $('#buscaCliente').value.trim(), ord = $('#ordemClientes').value;
  const lista = [...CLIENTES].sort((a, b) => ord === 'nome' ? String(a.nome).localeCompare(String(b.nome), 'pt-BR')
    : ord === 'recente' ? String(b.ultimoContato).localeCompare(String(a.ultimoContato))
    : ord === 'sumido' ? String(a.ultimoContato || '9').localeCompare(String(b.ultimoContato || '9'))
    : b.gasto - a.gasto || String(b.ultimoContato).localeCompare(String(a.ultimoContato)));
  $('#cliCount').textContent = lista.length.toLocaleString('pt-BR') +
    (lista.length === 1 ? (q ? ' cliente encontrado' : ' cliente') : (q ? ' clientes encontrados' : ' clientes'));
  if (!lista.length) {
    alvo.innerHTML = `<tbody><tr><td class="vazio-celula">${q ? 'Nenhum cliente com esse termo. Tente só o final do telefone ou a placa.' : 'A base de clientes ainda está vazia.'}</td></tr></tbody>`;
    $('#pagClientes').innerHTML = ''; return;
  }
  const p = U.paginar(lista, PAG_CLI, 50); PAG_CLI = p.pagina;
  alvo.innerHTML = `<thead><tr><th>Cliente</th><th>Carro</th><th>Origem</th>
      <th class="num">Serviços</th><th class="num">Em aberto</th><th class="num">Já gastou</th><th>Último contato</th><th><span class="sr">Ações</span></th></tr></thead>
    <tbody>${p.itens.map(c => `<tr data-id="${esc(c.id)}" tabindex="0" aria-label="Abrir ficha de ${esc(c.nome)}">
      <td><div class="cell-main">${esc(c.nome)}</div><div class="cell-sub">${esc(U.formatarTelefone(c.telefone))}</div></td>
      <td><div class="cell-main">${esc(c.carro_modelo) || '—'}</div><div class="cell-sub">${esc(c.placa)}</div></td>
      <td><span class="tag">${esc(LABEL_ORIGEM[c.origem] ?? c.origem ?? '—')}</span></td>
      <td class="num">${c.servicos}</td>
      <td class="num">${c.emAberto ? brl(c.emAberto) : '—'}</td>
      <td class="num">${brl(c.gasto)}</td>
      <td class="cell-sub">${dtAno(c.ultimoContato)}</td>
      <td class="col-acao">${U.linkWhatsApp(c.telefone) ? `<a class="mini-acao" href="${esc(U.linkWhatsApp(c.telefone))}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp de ${esc(c.nome)}" title="WhatsApp">🟢</a>` : ''}</td>
    </tr>`).join('')}</tbody>`;
  renderPaginacao($('#pagClientes'), p, n => { PAG_CLI = n; renderClientes(); $('#tblClientes').scrollIntoView({block: 'start', behavior: 'smooth'}); });
}
$('#ordemClientes').addEventListener('change', () => { PAG_CLI = 1; renderClientes(); });
$('#tblClientes').addEventListener('click', e => { if (e.target.closest('a')) return; const tr = e.target.closest('tbody tr[data-id]'); if (tr) abrirFichaCliente(tr.dataset.id); });
$('#tblClientes').addEventListener('keydown', e => { if (e.target.matches('tr[data-id]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirFichaCliente(e.target.dataset.id); } });

let buscaCliT;
$('#buscaCliente').addEventListener('input', () => {
  clearTimeout(buscaCliT);
  buscaCliT = setTimeout(carregarClientes, 280);
});

function fecharFichaCliente() {
  if (!modalCli.classList.contains('open')) return;
  modalCli.classList.remove('open'); restaurarFoco(modalCli);
  document.body.style.overflow = '';
}
$('#modalCliX').addEventListener('click', fecharFichaCliente);
modalCli.addEventListener('click', e => { if (e.target === modalCli) fecharFichaCliente(); });

async function abrirFichaCliente(id, opcoes = {}) {
  const alvo = $('#fichaCliente');
  alvo.innerHTML = '<div class="skeleton" aria-label="Carregando ficha"></div>';
  if (modal.classList.contains('open') && !fecharModal()) return;
  modalCli.classList.add('open'); ativarDialogo(modalCli);
  document.body.style.overflow = 'hidden';

  try {
    const f = await api('/api/clientes/' + encodeURIComponent(id));
    const c = f.cliente, r = f.resumo;

    const linhasLeads = f.leads.length ? f.leads.map(l => `<tr data-lead="${esc(l.id)}" tabindex="0" class="clicavel" aria-label="Abrir contato ${esc(l.servico || '')}">
        <td><div class="cell-main">${esc(l.servico) || 'Serviço não informado'}</div>
            <div class="cell-sub">${esc(LABEL_ORIGEM[l.origem] ?? l.origem ?? '')} · ${dtAno(l.created_at)}</div></td>
        <td><span class="badge b-${esc(l.status)}">${esc(LABEL_STATUS[l.status] ?? l.status)}</span></td>
        <td class="num">${brl(l.status === 'concluido' ? l.valor_pago : l.valor_orcado)}</td>
      </tr>`).join('') : '';

    const linhasAg = f.agendamentos.length ? f.agendamentos.map(a => `<tr>
        <td><div class="cell-main">${esc(a.servico) || 'Serviço não informado'}</div>
            <div class="cell-sub">${dtSimples(a.data)} às ${esc(String(a.hora ?? '').slice(0, 5))} · ${esc(a.veiculo) || '—'}</div></td>
        <td><span class="badge b-${esc(a.status)}">${esc(LABEL_AGENDAMENTO[a.status] ?? a.status)}</span></td>
        <td class="num">${a.valor ? brl(a.valor) : '—'}</td>
      </tr>`).join('') : '';

    alvo.innerHTML = `
      <h3 class="sr" id="fichaCliTitulo">Ficha de ${esc(c.nome)}</h3>
      <div class="ficha-topo">
        <span class="avatar">${esc(iniciais(c.nome))}</span>
        <div>
          <div class="ficha-nome">${esc(c.nome)}</div>
          <div class="ficha-sub">${esc(U.formatarTelefone(c.telefone))}${c.email ? ' · ' + esc(c.email) : ''}</div>
          <div class="ficha-sub">${esc(c.carro_modelo) || 'Carro não informado'}${c.placa ? ' · ' + esc(c.placa) : ''}
            · cliente desde ${dtAno(c.created_at)}</div>
        </div>
      </div>

      <div class="ficha-kpis">
        <div class="ficha-kpi"><span>Já gastou</span><b>${brl(r.gasto)}</b></div>
        <div class="ficha-kpi"><span>Serviços feitos</span><b>${r.servicosFeitos}</b></div>
        <div class="ficha-kpi"><span>Ticket médio</span><b>${brl(r.ticket)}</b></div>
        <div class="ficha-kpi"><span>Em aberto</span><b>${brl(r.emAberto)}</b></div>
        <div class="ficha-kpi"><span>Contatos</span><b>${r.leads}</b></div>
        <div class="ficha-kpi"><span>Agendamentos</span><b>${r.agendamentos}</b></div>
        <div class="ficha-kpi"><span>Faltas</span><b>${esc(r.faltas ?? 0)}</b></div>
        <div class="ficha-kpi"><span>Último serviço</span><b>${esc(dtAno(r.ultimoServico))}</b></div>
      </div>
      <div class="lf-acoes">${botaoAcao(U.linkConversa(c.telefone), 'Abrir conversa', '💬') + botaoAcao(U.linkLigar(c.telefone), 'Ligar', '📞') + botaoAcao(U.linkAgenda(c.telefone), 'Agendar', '📅') + botaoAcao(U.linkComunicar(c.telefone), 'Mandar mensagem', '✉️')}
        <button type="button" class="acao acao-forte" id="novoLeadCliente"><span aria-hidden="true">＋</span>Criar contato</button></div>

      <div class="ficha-bloco">
        <h4>Serviços já feitos</h4>
        ${f.servicos.length
          ? `<div class="chips">${f.servicos.map(s =>
              `<span class="chip-servico">${esc(s.nome)}<b>${s.vezes}×</b></span>`).join('')}</div>`
          : '<p class="muted" style="font-size:.88rem">Nenhum serviço concluído até agora.</p>'}
      </div>

      <div class="ficha-bloco">
        <h4>Últimos contatos</h4>
        ${linhasLeads ? `<table class="mini-tabela"><tbody>${linhasLeads}</tbody></table>`
                      : '<p class="muted" style="font-size:.88rem">Sem contatos registrados.</p>'}
      </div>

      <div class="ficha-bloco">
        <h4>Últimos agendamentos</h4>
        ${linhasAg ? `<table class="mini-tabela"><tbody>${linhasAg}</tbody></table>`
                   : '<p class="muted" style="font-size:.88rem">Sem horários marcados.</p>'}
      </div>

      ${(f.patio || []).length ? `<div class="ficha-bloco">
        <h4>Passagens pelo pátio</h4>
        <table class="mini-tabela"><tbody>${f.patio.map(o => `<tr>
          <td><div class="cell-main">Ordem nº ${esc(o.numero ?? '—')} · ${esc(ETAPA_PATIO[o.etapa] || o.etapa)}</div>
              <div class="cell-sub">${dtAno(o.created_at)}${o.entregue_em ? ' → entregue ' + dtAno(o.entregue_em) : ''}${o.aprovados || o.recusados ? ` · extras: ${o.aprovados} aprovado(s), ${o.recusados} recusado(s)` : ''}</div></td>
          <td class="num">${o.valor_aprovado ? brl(o.valor_aprovado) : '—'}</td>
          <td><a class="acao" href="${esc(o.abrir)}" target="_blank" rel="noopener" aria-label="Abrir a ordem ${esc(o.numero ?? '')} no Pátio">🔧 Pátio</a></td></tr>`).join('')}</tbody></table>
      </div>` : ''}

      ${(f.indicacoes?.feitas || []).length || (f.indicacoes?.recebidas || []).length ? `<div class="ficha-bloco">
        <h4>Indicações</h4>
        ${(f.indicacoes.recebidas || []).map(i => `<p class="ficha-sub">🤝 Veio por indicação${i.indicado_por_nome ? ' de <b>' + esc(i.indicado_por_nome) + '</b>' : ''} · ${esc(STATUS_INDICACAO[i.status] || i.status)}</p>`).join('')}
        ${(f.indicacoes.feitas || []).length ? `<table class="mini-tabela"><tbody>${f.indicacoes.feitas.map(i => `<tr${i.lead_id ? ` data-lead="${esc(i.lead_id)}" tabindex="0" class="clicavel" aria-label="Abrir o contato de ${esc(i.nome)}"` : ''}>
          <td><div class="cell-main">🤝 ${esc(i.nome)}</div><div class="cell-sub">indicou em ${dtAno(i.created_at)}</div></td>
          <td><span class="badge b-ind-${esc(i.status)}">${esc(STATUS_INDICACAO[i.status] || i.status)}</span></td></tr>`).join('')}</tbody></table>` : ''}
      </div>` : ''}

      ${c.observacoes ? `<div class="ficha-bloco"><h4>Observações</h4>
        <p class="muted" style="font-size:.9rem;line-height:1.6">${esc(c.observacoes)}</p></div>` : ''}

      <p class="muted" style="font-size:.78rem;margin-top:18px">
        "Já gastou" soma os leads concluídos mais os agendamentos concluídos que não vieram de
        um lead — assim o mesmo serviço não entra na conta duas vezes.</p>
      <div id="preferenciasCliente"></div>`;
    montarPreferencias(c);
    modalCli.firstElementChild.setAttribute('aria-labelledby', 'fichaCliTitulo');
    if (opcoes.criarLead) $('#novoLeadCliente').focus();
    $('#novoLeadCliente').onclick = () => { fecharFichaCliente(); abrirModal(null, {nome: c.nome, telefone: c.telefone, carro_modelo: c.carro_modelo, placa: c.placa}); };
    $$('tr[data-lead]', alvo).forEach(tr => { const ir = () => { fecharFichaCliente(); abrirModal(tr.dataset.lead); }; tr.onclick = ir; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } }; });
  } catch (err) {
    alvo.innerHTML = `<div class="alert">Não consegui abrir a ficha: ${esc(err.message)}</div>`;
  }
}

/* ============================================================
   SERVIÇOS — o catálogo que alimenta a IA do WhatsApp
   ============================================================ */
const LABEL_ESCOPO = { LEVES:'Carros leves', TODOS:'Todos os carros', ESPECIFICO:'Caso a caso' };
let filtroFaz = '';   // '' = todos | '1' = fazemos | '0' = não fazemos

async function carregarCatalogo() {
  const alvo = $('#listaServicos');
  if (!CATALOGO.length) {
    alvo.innerHTML = '<p class="muted"><span class="spinner"></span>Carregando o catálogo…</p>';
  }
  try {
    const r = await api('/api/catalogo');
    CATALOGO = r.servicos || [];
    SOU_ADMIN = !!r.souAdmin;
    $('#srvAviso').hidden = SOU_ADMIN;
    renderCatalogo();
  } catch (err) {
    alvo.innerHTML = `<div class="alert" role="alert">Não consegui carregar o catálogo: ${esc(err.message)}</div>
      <button type="button" class="btn btn-ghost" id="catalogoTentar">Tentar novamente</button>`;
    $('#catalogoTentar').addEventListener('click', carregarCatalogo);
  }
}

function renderCatalogo() {
  const alvo = $('#listaServicos');
  const termo = $('#buscaServico').value.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const semAcento = s => String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const lista = CATALOGO.filter(s => {
    if (filtroFaz === '1' && !s.fazemos) return false;
    if (filtroFaz === '0' && s.fazemos)  return false;
    if (!termo) return true;
    return semAcento(`${s.servico} ${s.categoria} ${s.tipo_veiculo}`).includes(termo);
  });

  const fazemos = CATALOGO.filter(s => s.fazemos).length;
  $('#srvCount').textContent =
    `${lista.length} de ${CATALOGO.length} · ${fazemos} que fazemos, ${CATALOGO.length - fazemos} que não`;

  if (!lista.length) {
    alvo.innerHTML = CATALOGO.length
      ? '<div class="vazio">Nenhum serviço com esse filtro. Limpe a busca ou escolha Todos.</div>'
      : '<div class="vazio">O catálogo ainda está vazio.</div>';
    return;
  }

  // agrupa por categoria mantendo a ordem que veio do banco
  const porCategoria = new Map();
  for (const s of lista) {
    if (!porCategoria.has(s.categoria)) porCategoria.set(s.categoria, []);
    porCategoria.get(s.categoria).push(s);
  }

  alvo.innerHTML = [...porCategoria.entries()].map(([categoria, itens]) => `
    <div class="cat-bloco">
      <div class="cat-head">
        <h4>${esc(categoria)}</h4>
        <span class="cat-conta">${itens.length}</span>
      </div>
      <div class="srv-lista">
        ${itens.map(s => `
          <div class="srv-item${s.fazemos ? '' : ' nao'}">
            <div class="srv-txt">
              <div class="srv-nome">${esc(s.servico)}
                <span class="chip-escopo">${esc(LABEL_ESCOPO[s.escopo] ?? s.escopo ?? '')}</span></div>
              ${s.tipo_veiculo ? `<div class="srv-veiculo">${esc(s.tipo_veiculo)}</div>` : ''}
              ${s.observacao ? `<div class="srv-veiculo">${esc(s.observacao)}</div>` : ''}
            </div>
            <button type="button" class="srv-toggle ${s.fazemos ? 'faz' : 'naofaz'}"
                    data-id="${esc(s.id)}" data-fazemos="${s.fazemos ? '1' : '0'}"
                    ${SOU_ADMIN ? '' : 'disabled'}
                    title="${SOU_ADMIN ? 'Clique para alternar' : 'Só o administrador altera'}">
              ${s.fazemos ? 'Fazemos' : 'Não fazemos'}
            </button>
          </div>`).join('')}
      </div>
    </div>`).join('');

  if (!SOU_ADMIN) return;
  $$('#listaServicos .srv-toggle').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.id, novo = b.dataset.fazemos !== '1';
    b.disabled = true;
    try {
      const r = await api('/api/catalogo/' + encodeURIComponent(id),
        { method: 'PATCH', body: JSON.stringify({ fazemos: novo }) });
      const i = CATALOGO.findIndex(s => s.id === id);
      if (i >= 0) CATALOGO[i] = r.servico;
      toast(novo ? `✅ A IA passa a oferecer "${r.servico.servico}"`
                 : `🚫 A IA para de oferecer "${r.servico.servico}"`);
      renderCatalogo();
    } catch (err) {
      toast('⚠️ ' + err.message);
      b.disabled = false;
    }
  }));
}

let buscaSrvT;
$('#buscaServico').addEventListener('input', () => {
  clearTimeout(buscaSrvT);
  buscaSrvT = setTimeout(renderCatalogo, 200);
});
$$('#filtrosServico .filtro-pill').forEach(b => b.addEventListener('click', () => {
  filtroFaz = b.dataset.faz;
  $$('#filtrosServico .filtro-pill').forEach(x => {
    x.classList.toggle('ativo', x === b);
    x.setAttribute('aria-pressed', String(x === b));
  });
  renderCatalogo();
}));

/* Rodada 11: a conta (perfil, senha, duas etapas) e a equipe saíram do CRM.
   Senha fica na Central; equipe e duas etapas, no Atendimento. */
const LABEL_PAPEL = CrmUtils.ROTULO_PAPEL;

/* ============================================================
   LOGIN, sessão, perfil, sino e tarefas ficam em acesso.js (rodada 3):
   mostrarLogin, esconderLogin, telaAcesso, o formulário de entrar e o boot.
   ============================================================ */

/* ============================================================
   PRIMEIRO ACESSO — a conta do dono, antes de existir alguém
   O botão só aparece enquanto o sistema não tem NINGUÉM cadastrado;
   quem criar a primeira conta vira administrador. Depois disso a
   rota do servidor responde 403 e a tela some.
   Não usa sb.auth.signUp: ele exige confirmação por e-mail e recusa
   endereço de domínio próprio ("Email address is invalid"). Quem cria
   é o servidor, com a chave de serviço, e a conta já entra valendo.
   ============================================================ */
function mostrarFormPrimeiro(mostrar) { telaAcesso(mostrar ? 'formPrimeiro' : 'formLogin'); }

async function verPrimeiroAcesso() {
  try {
    const j = await (await fetch(IndyCarApps.rota('/api/primeiro-acesso'))).json();
    $('#btnCriarConta').hidden = !j.aberto;
    if (j.aberto) mostrarFormPrimeiro(true);
  } catch { /* servidor fora do ar: a tela de login normal já avisa */ }
}

$('#btnCriarConta').addEventListener('click', () => mostrarFormPrimeiro(true));
$('#btnVoltarLogin').addEventListener('click', () => mostrarFormPrimeiro(false));

$('#formPrimeiro').addEventListener('submit', async e => {
  e.preventDefault();
  const erro = $('#pnErro'), btn = $('#btnPrimeiro');
  const falha = m => { erro.textContent = m; erro.hidden = false; };
  erro.hidden = true;

  const nome  = $('#pnNome').value.trim();
  const email = $('#pnEmail').value.trim().toLowerCase();
  const senha = $('#pnSenha').value;
  if (!nome)            return falha('Escreva o seu nome.');
  if (senha.length < 8) return falha('A senha precisa ter pelo menos 8 caracteres.');
  if (senha !== $('#pnSenha2').value) {
    return falha('As duas senhas não são iguais. Confira e digite de novo.');
  }

  btn.disabled = true; btn.textContent = 'CRIANDO…';
  try {
    // sem token ainda: esta é a única rota do CRM que roda sem login
    const r = await fetch(IndyCarApps.rota('/api/primeiro-acesso'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui criar a conta.');

    // já entra, sem obrigar a digitar tudo de novo
    if (!sb) throw new Error('Conexão com o Supabase não configurada.');
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      mostrarFormPrimeiro(false);
      toast('✅ Conta criada! Entre com o seu e-mail e a senha.');
      return;
    }
    $('#pnSenha').value = ''; $('#pnSenha2').value = '';
    await entrarDepoisDoLogin();
  } catch (err) {
    falha(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'CRIAR MINHA CONTA';
  }
});

