/* ============================================================================
   IndyCar Tráfego · casca do app (rodada 8)
   Liga a barra do ecossistema (troca de app, tema, conta), o período, o
   "atualizado há X", os avisos e a navegação entre as telas. O login é o da
   Central: sem sessão, a pessoa vai para lá e volta.
   Cada tela mora em js/telas/ e recebe um `ctx` com tudo de que precisa.
   ============================================================================ */

import { $, $$, h, icone, trocar } from './dom.js';
import { lerRota, montarRota, destinoDaApi, TELAS, TELAS_SOLTAS } from './rotas.js';
import { baseDaPagina, listaDeApps, linkSeguro, nomeDaAba, appDoEndereco, enderecoDeEntrada, raizDaCentral, CENTRAL_PUBLICA } from './ecossistema.js';
import { criarApi, criarLeitor } from './api.js';
import { abrirSessao, acabouDeIr, marcarIda, limparIda } from './sessao.js';
import { criarDesfazer } from './desfazer.js';
import { PERIODOS, PERIODO_PADRAO, periodoValido, haQuanto, iniciais } from './formato.js';
import { textoDaEspera } from './rede.js';
import * as Estados from './telas/estados.js';
import * as Hoje from './telas/hoje.js';
import * as Jornada from './telas/jornada.js';
import * as Campanhas from './telas/campanhas.js';
import * as Gestor from './telas/gestor.js';
import * as Ajustes from './telas/ajustes.js';
import * as Folha from './telas/folha.js';
import * as Apresentacao from './telas/apresentacao.js';

const TELA = { hoje: Hoje, jornada: Jornada, campanhas: Campanhas, gestor: Gestor, ajustes: Ajustes, folha: Folha, apresentacao: Apresentacao };
const COM_PERIODO = new Set(['hoje', 'jornada', 'campanhas']);
const NOME_DO_PAPEL = { admin: 'Administrador', dono: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', agenda: 'Agenda' };

const base = baseDaPagina(location.pathname);
const raizDoc = document.documentElement;
const hrefCentral = raizDaCentral(base) || CENTRAL_PUBLICA;
const miolo = $('#miolo');
const el = {
  faixas: $('#faixas'), avisos: $('#avisos'), sessao: $('#sessao'), periodo: $('#sessaoPeriodo'),
  atualizado: $('#atualizadoTexto'), bAtualizar: $('#bAtualizar'), bTema: $('#bTema'),
  bApps: $('#bApps'), menuApps: $('#menuApps'), bConta: $('#bConta'), menuConta: $('#menuConta'),
  iniciais: $('#contaIniciais'), linkCasa: $('#linkCasa'),
};
const estado = { rota: null, controle: null, vez: 0, eu: null, sb: null, api: null, leitor: null, atualizadoEm: null, estreias: new Set(), parado: false };
const ouvintesDoDesfazer = new Set();
const desfazer = criarDesfazer({ aoMudar: (pendentes) => { for (const fn of ouvintesDoDesfazer) fn(pendentes); } });

/* ------------------------------ avisos ------------------------------ */

let toast = null;
function fecharAviso() {
  if (!toast) return;
  clearTimeout(toast.relogio);
  toast.el.remove();
  toast = null;
}
/** Aviso curto no pé da tela. Com `acao`, vira o "desfazer" (botão e a contagem do tempo). */
function avisar(texto, { acao = null, duracao = 5000 } = {}) {
  fecharAviso();
  const no = h('div', { class: 'toast', style: { '--toast-duracao': duracao + 'ms' } },
    h('span', { class: 'toast-texto' }, texto),
    acao ? h('button', { class: 'botao', type: 'button', on: { click: () => { fecharAviso(); acao.fazer(); } } }, icone(acao.icone || 'desfazer'), acao.rotulo) : null,
    acao ? h('span', { class: 'toast-tempo', 'aria-hidden': 'true' }) : null);
  el.avisos.appendChild(no);
  toast = { el: no, relogio: setTimeout(fecharAviso, duracao) };
}

const faixasVivas = new Map();
/** Aviso na largura da página (demonstração, servidor acordando, sem internet, falha ao atualizar). null tira. */
function faixa(id, conteudo) {
  const velha = faixasVivas.get(id);
  if (velha) { velha.remove(); faixasVivas.delete(id); }
  if (!conteudo) return;
  const no = h('div', { class: 'faixa', role: 'status', data: { faixa: id } },
    icone(conteudo.icone || 'info'), h('p', { class: 'faixa-texto' }, conteudo.texto), conteudo.acao || null);
  el.faixas.appendChild(no);
  faixasVivas.set(id, no);
}
const acordando = (ms) => faixa('acordando', { icone: 'relogio', texto: 'O sistema está acordando: o servidor dorme quando ninguém usa. Tento de novo ' + textoDaEspera(ms) + '.' });
const acordou = () => faixa('acordando', null);

/* ------------------------------ tema ------------------------------ */

const temaClaro = () => raizDoc.getAttribute('data-tema') === 'claro';
function pintarBotaoDoTema() {
  trocar(el.bTema, icone(temaClaro() ? 'lua' : 'sol'));
  el.bTema.setAttribute('aria-label', temaClaro() ? 'Mudar para o tema escuro' : 'Mudar para o tema claro');
}
function trocarTema() {
  const novo = temaClaro() ? 'escuro' : 'claro';
  raizDoc.setAttribute('data-trocando-tema', '');
  if (novo === 'claro') raizDoc.setAttribute('data-tema', 'claro'); else raizDoc.removeAttribute('data-tema');
  try { localStorage.setItem('indycar_tema', novo); } catch { /* sem armazenamento: vale só nesta visita */ }
  pintarBotaoDoTema();
  requestAnimationFrame(() => requestAnimationFrame(() => raizDoc.removeAttribute('data-trocando-tema')));
}

/* ------------------------------ menus (troca de app e conta) ------------------------------ */

const menus = [];
function ligarMenu(botao, menu, montar) {
  const fechar = (devolverFoco = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    if (devolverFoco) botao.focus();
  };
  const abrir = () => {
    for (const m of menus) m.fechar();
    trocar(menu, montar(fechar));
    menu.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    const primeiro = menu.querySelector('a, button');
    if (primeiro) primeiro.focus();
  };
  botao.addEventListener('click', () => (menu.hidden ? abrir() : fechar()));
  for (const alvo of [botao, menu]) alvo.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); fechar(true); } });
  menus.push({ botao, menu, fechar });
}
function fecharMenusDeFora(alvo) {
  for (const m of menus) if (!m.menu.hidden && !m.menu.contains(alvo) && !m.botao.contains(alvo)) m.fechar();
}

/** Como abrir um endereço de outro app: na aba de nome fixo dele (mesmo domínio) ou em aba nova (outro site). */
function alvoDoApp(href) {
  let mesmaOrigem = false;
  try { mesmaOrigem = new URL(href, location.href).origin === location.origin; } catch { mesmaOrigem = false; }
  if (!mesmaOrigem) return { target: '_blank', rel: 'noopener' };
  return { target: nomeDaAba(appDoEndereco(href, { base }) || 'casa'), rel: null };
}

function menuDeApps() {
  return listaDeApps({ base }).map((app) => {
    if (app.aqui) return h('a', { class: 'menu-item', href: hrefDaTela('hoje'), 'aria-current': 'page' }, app.nome, h('small', null, 'você está aqui'));
    const alvo = alvoDoApp(app.url);
    return h('a', { class: 'menu-item', href: app.url, target: alvo.target, rel: alvo.rel }, app.nome, h('small', null, app.descricao));
  });
}

function menuDaConta() {
  const eu = estado.eu || {};
  return [
    h('div', { class: 'menu-quem' },
      h('strong', null, eu.nome || 'Sem nome cadastrado'),
      eu.email ? h('span', null, eu.email) : null,
      eu.papel ? h('span', null, NOME_DO_PAPEL[eu.papel] || eu.papel) : null),
    h('button', { class: 'menu-item menu-so-estreito', type: 'button', on: { click: () => { trocarTema(); menus.forEach((m) => m.fechar(true)); } } },
      icone(temaClaro() ? 'lua' : 'sol'), temaClaro() ? 'Usar o tema escuro' : 'Usar o tema claro'),
    h('a', { class: 'menu-item', href: hrefCentral }, icone('voltar'), 'Ir para a Central'),
    h('button', { class: 'menu-item', type: 'button', on: { click: sair } }, icone('sair'), 'Sair'),
  ];
}

async function sair() {
  await desfazer.confirmarTudo();
  estado.parado = true;
  try { if (estado.sb) await estado.sb.auth.signOut({ scope: 'local' }); } catch { /* a sessão já tinha ido */ }
  location.href = hrefCentral;
}

/* ------------------------------ período e "atualizado há X" ------------------------------ */

function montarPeriodo() {
  const escolher = (id) => {
    const rota = estado.rota;
    if (!rota) return;
    const params = { ...rota.params };
    delete params.pagina;
    if (id === PERIODO_PADRAO) delete params.periodo; else params.periodo = id;
    ir(rota.tela, params);
  };
  const select = h('select', { 'aria-label': 'Período', on: { change: (e) => escolher(e.target.value) } },
    PERIODOS.map((p) => h('option', { value: p.id }, p.rotulo)));
  const grupo = h('div', { class: 'segmentos', role: 'radiogroup', 'aria-label': 'Período' },
    PERIODOS.map((p) => h('button', { class: 'segmento', type: 'button', role: 'radio', 'aria-checked': 'false', tabindex: '-1', data: { periodo: p.id }, on: { click: () => escolher(p.id) } }, p.rotulo)));
  grupo.addEventListener('keydown', (e) => {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const botoes = $$('.segmento', grupo);
    const atual = botoes.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const proximo = botoes[(atual + passo + botoes.length) % botoes.length];
    proximo.focus();
    escolher(proximo.dataset.periodo);
  });
  trocar(el.periodo, select, grupo);
}

function pintarAtualizado() {
  const quando = estado.atualizadoEm ? haQuanto(estado.atualizadoEm) : null;
  el.atualizado.textContent = quando ? (quando === 'agora' ? 'Atualizado agora' : 'Atualizado ' + quando) : '';
}
function marcarAtualizado(em) {
  estado.atualizadoEm = em || Date.now();
  pintarAtualizado();
}

/* ------------------------------ navegação ------------------------------ */

const periodoAtual = () => (estado.rota ? periodoValido(estado.rota.params.periodo) : PERIODO_PADRAO);

/** Endereço de uma tela daqui, levando o período escolhido junto. */
function hrefDaTela(tela, params = {}) {
  const periodo = periodoAtual();
  return montarRota(tela, { ...(periodo !== PERIODO_PADRAO ? { periodo } : {}), ...params });
}

function ir(tela, params = {}, { substituir = false } = {}) {
  const alvo = montarRota(tela, params);
  if (alvo === location.hash) return navegar();
  if (substituir) { history.replaceState(null, '', alvo); return navegar(); }
  location.hash = alvo;
  return undefined;
}

/** O campo `ir` de uma ação da API → { href, target, rel }, ou null quando não há para onde ir com segurança. */
function destino(irPara) {
  const d = destinoDaApi(irPara);
  if (!d) return null;
  if (d.tipo === 'tela') return { href: hrefDaTela(d.tela, d.params), target: null, rel: null };
  const href = linkSeguro(d.caminho, { base });
  return href ? { href, ...alvoDoApp(href) } : null;
}
/** Link para outro app do ecossistema a partir de um caminho da Central ("/crm/?contato=1"). */
function linkDoApp(caminho) {
  const href = linkSeguro(caminho, { base });
  return href ? { href, ...alvoDoApp(href) } : null;
}

function pintarCasca(rota) {
  for (const link of $$('[data-tela]')) {
    link.setAttribute('href', hrefDaTela(link.dataset.tela));
    if (link.dataset.tela === rota.tela) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const nome = [...TELAS, ...TELAS_SOLTAS].find((t) => t.id === rota.tela);
  document.title = (nome ? nome.rotulo + ' · ' : '') + 'IndyCar Tráfego';
  const periodo = periodoAtual();
  el.sessao.hidden = false;
  el.periodo.hidden = !COM_PERIODO.has(rota.tela);
  const select = $('select', el.periodo);
  if (select) select.value = periodo;
  for (const b of $$('.segmento', el.periodo)) {
    const ligado = b.dataset.periodo === periodo;
    b.setAttribute('aria-checked', ligado ? 'true' : 'false');
    b.setAttribute('tabindex', ligado ? '0' : '-1');
  }
}

function criarCtx(rota, vez, forcar) {
  return {
    base, rota, forcar, miolo,
    periodo: periodoValido(rota.params.periodo),
    api: estado.api, leitor: estado.leitor, eu: estado.eu, desfazer,
    vivo: () => vez === estado.vez,
    ir, destino, linkDoApp, hrefDaTela, avisar, fecharAviso, faixa, marcarAtualizado,
    recarregar: () => navegar({ forcar: true }),
    /** Liga ou tira o aviso "números de demonstração" (a tela diz o que a API mandou em estado.demo). */
    demo: (ligado) => faixa('demo', ligado ? { icone: 'info', texto: 'Você está vendo números de demonstração. Eles saem de cena quando a conta de anúncios for ligada.' } : null),
    /** Avisa quando muda a lista de gravações esperando o "desfazer". Devolve a função que cancela o aviso. */
    aoMudarDesfazer(fn) {
      ouvintesDoDesfazer.add(fn);
      return () => ouvintesDoDesfazer.delete(fn);
    },
    idade: (em) => haQuanto(em),
    /** true só na primeira vez que a tela aparece nesta visita (para a entrada e o acender dos setores). */
    estreia(chave) {
      if (estado.estreias.has(chave)) return false;
      estado.estreias.add(chave);
      return true;
    },
  };
}

async function navegar({ forcar = false } = {}) {
  if (estado.parado) return;
  const rota = lerRota(location.hash);
  const canonica = montarRota(rota.tela, rota.params);
  if (location.hash !== canonica) history.replaceState(null, '', canonica);
  const anterior = estado.rota;
  const mudouTela = !anterior || anterior.tela !== rota.tela;
  estado.rota = rota;
  const vez = ++estado.vez;
  pintarCasca(rota);
  const ctx = criarCtx(rota, vez, forcar);

  // Mesma tela, só mudou filtro, página ou contato aberto: a tela decide o que repintar.
  if (!mudouTela && !forcar && estado.controle && estado.controle.atualizar) {
    let resolveu = false;
    try { resolveu = await estado.controle.atualizar(ctx); } catch (erro) { console.error(erro); }
    if (resolveu || vez !== estado.vez) return;
  }
  if (estado.controle && estado.controle.sair) { try { estado.controle.sair(); } catch (erro) { console.error(erro); } }
  estado.controle = null;
  faixa('falha', null);
  if (mudouTela) {
    faixa('demo', null);
    faixa('incompleto', null);
    estado.atualizadoEm = null;
    pintarAtualizado();
    window.scrollTo(0, 0);
  }
  try {
    const controle = await TELA[rota.tela].mostrar(ctx);
    if (vez === estado.vez) estado.controle = controle || null;
    else if (controle && controle.sair) controle.sair();
  } catch (erro) {
    console.error(erro);
    if (vez === estado.vez) Estados.falha(miolo, { mensagem: Estados.fraseDoErro(erro), aoTentar: () => navegar({ forcar: true }) });
  }
  if (mudouTela && anterior && vez === estado.vez) miolo.focus({ preventScroll: true });
}

async function atualizarAgora() {
  if (!estado.leitor || estado.parado) return;
  el.bAtualizar.disabled = true;
  await desfazer.confirmarTudo();
  estado.leitor.esquecer();
  await navegar({ forcar: true });
  el.bAtualizar.disabled = false;
}

/* ------------------------------ sessão ------------------------------ */

function pararEm(pintar) {
  estado.parado = true;
  estado.vez++;
  if (estado.controle && estado.controle.sair) { try { estado.controle.sair(); } catch { /* a tela já estava saindo */ } }
  estado.controle = null;
  el.sessao.hidden = true;
  pintar();
}

/** Ninguém logado: vai para a Central e volta. Se acabou de ir e voltou sem sessão, para e mostra o caminho. */
function semSessao() {
  const href = enderecoDeEntrada({ base, hash: location.hash });
  if (acabouDeIr()) return pararEm(() => Estados.semSessao(miolo, { href }));
  marcarIda();
  pararEm(() => Estados.recado(miolo, 'Indo para a Central para você entrar'));
  location.replace(href);
  return undefined;
}

function aoRecusar(status, codigo, corpo) {
  if (estado.parado) return;
  if (status === 401 || codigo === 'trocar_senha' || codigo === 'mfa') return semSessao();
  return pararEm(() => Estados.semAcesso(miolo, { mensagem: corpo && typeof corpo.erro === 'string' ? corpo.erro : null, hrefCentral }));
}

function pintarConta() {
  const eu = estado.eu || {};
  el.iniciais.textContent = iniciais(eu.nome || eu.email || '');
  // O nome acessível começa pelo que aparece no botão (as iniciais), como pede a regra de rótulo visível.
  el.bConta.setAttribute('aria-label', el.iniciais.textContent + ': minha conta' + (eu.nome ? ', ' + eu.nome : ''));
}

/* ------------------------------ partida ------------------------------ */

function prepararCasca() {
  for (const marca of $$('[data-icone]')) marca.replaceWith(icone(marca.dataset.icone));
  el.linkCasa.setAttribute('href', hrefCentral);
  pintarBotaoDoTema();
  el.bTema.addEventListener('click', trocarTema);
  ligarMenu(el.bApps, el.menuApps, menuDeApps);
  ligarMenu(el.bConta, el.menuConta, menuDaConta);
  document.addEventListener('click', (e) => fecharMenusDeFora(e.target));
  document.addEventListener('focusin', (e) => fecharMenusDeFora(e.target));
  montarPeriodo();
  el.bAtualizar.addEventListener('click', atualizarAgora);
  $('.pular').addEventListener('click', (e) => { e.preventDefault(); miolo.focus(); });
  setInterval(pintarAtualizado, 20000);

  const semRede = () => faixa('rede', { icone: 'alerta', texto: 'Sem internet. O que está na tela continua aqui; quando a conexão voltar eu atualizo.' });
  window.addEventListener('offline', semRede);
  window.addEventListener('online', () => { faixa('rede', null); if (!estado.parado && estado.leitor) navegar({ forcar: true }); });
  if (navigator.onLine === false) semRede();

  // Gravação esperando o "desfazer" não pode se perder quando a aba some.
  window.addEventListener('pagehide', () => { desfazer.confirmarTudo(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') desfazer.confirmarTudo(); });
}

async function partir() {
  prepararCasca();
  let aberta;
  try {
    aberta = await abrirSessao({ base, aoEsperar: acordando, aoSair: () => { if (!estado.parado) semSessao(); } });
  } catch (erro) {
    acordou();
    Estados.falha(miolo, { titulo: 'Não deu para abrir o Tráfego', mensagem: Estados.fraseDoErro(erro), aoTentar: () => location.reload() });
    return;
  }
  acordou();
  if (!aberta.sessao) { semSessao(); return; }
  estado.sb = aberta.sb;
  estado.api = criarApi({ base, token: aberta.token, aoRecusar, aoEsperar: acordando, aoVoltar: acordou });
  estado.leitor = criarLeitor(estado.api);
  try {
    estado.eu = await estado.api.ler('api/eu');
  } catch (erro) {
    if (!estado.parado) Estados.falha(miolo, { titulo: 'Não deu para abrir o Tráfego', mensagem: Estados.fraseDoErro(erro), aoTentar: () => location.reload() });
    return;
  }
  if (estado.parado) return;
  if (estado.eu && estado.eu.acesso === false) {
    pararEm(() => Estados.semAcesso(miolo, { mensagem: null, hrefCentral }));
    return;
  }
  limparIda();
  pintarConta();
  window.addEventListener('hashchange', () => navegar());
  await navegar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker a tela funciona igual */ });
}

partir();
