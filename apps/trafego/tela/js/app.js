/* ============================================================================
   IndyCar Tráfego · casca do app (rodada 12, no pique do Nexus Ads)
   O topo comum (.ic-topo do /casa/indycar.css), a navegação lateral no
   computador e a barra de baixo no celular: Visão geral, Campanhas,
   Clientes, Radar (com o número vermelho de avisos) e Relatórios. Ajustes
   fica no fim da lateral e no menu da pessoa, só para o administrador.
   O login é o da Central: sem sessão, a pessoa vai para lá e volta.
   ============================================================================ */

import { $, h, icone, trocar } from './dom.js';
import { lerRota, montarRota, abasDoPapel, ehAdmin, periodoDaTela, fonteDaTela, PERIODO_DA_TELA, PERIODOS_DA_TELA } from './rotas.js';
import { baseDaPagina, enderecoDeEntrada, raizDaCentral, CENTRAL_PUBLICA } from './ecossistema.js';
import { criarApi, criarLeitor } from './api.js';
import { abrirSessao, acabouDeIr, marcarIda, limparIda } from './sessao.js';
import { haQuanto, iniciais } from './formato.js';
import { radar as contarRadar } from './painel-logica.js';
import { textoDaEspera } from './rede.js';
import * as Estados from './telas/estados.js';
import * as Geral from './telas/geral.js';
import * as Campanhas from './telas/campanhas.js';
import * as Clientes from './telas/clientes.js';
import * as Radar from './telas/radar.js';
import * as Relatorios from './telas/relatorios.js';
import * as Ajustes from './telas/ajustes.js';

const TELA = { geral: Geral, campanhas: Campanhas, clientes: Clientes, radar: Radar, relatorios: Relatorios, ajustes: Ajustes };
const NOME_DO_PAPEL = { admin: 'Administrador', dono: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', agenda: 'Agenda' };

const base = baseDaPagina(location.pathname);
const raizDoc = document.documentElement;
const hrefCentral = raizDaCentral(base) || CENTRAL_PUBLICA;
const miolo = $('#miolo');
const el = { faixas: $('#faixas'), avisos: $('#avisos'), navLado: $('#navLado'), navBaixo: $('#navBaixo'), ladoPe: $('#ladoPe'), bTema: $('#bTema'), bConta: $('#bConta'), menuConta: $('#menuConta'), iniciais: $('#contaIniciais'), marca: $('#linkCasa') };
const estado = { rota: null, controle: null, vez: 0, eu: null, sb: null, api: null, leitor: null, parado: false };

/* ------------------------------ avisos ------------------------------ */

let toast = null;
function fecharAviso() {
  if (!toast) return;
  clearTimeout(toast.relogio);
  toast.el.remove();
  toast = null;
}
function avisar(texto, { duracao = 5000 } = {}) {
  fecharAviso();
  const no = h('div', { class: 'toast' }, h('span', { class: 'toast-texto' }, texto));
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
const acordando = (ms) => faixa('acordando', { icone: 'relogio', texto: 'O sistema está acordando. Tento de novo ' + textoDaEspera(ms) + '.' });
const acordou = () => faixa('acordando', null);

/* ------------------------------ tema ------------------------------ */

const temaClaro = () => raizDoc.getAttribute('data-tema') === 'claro';
function pintarBotaoDoTema() {
  trocar(el.bTema, icone(temaClaro() ? 'lua' : 'sol'));
  el.bTema.setAttribute('aria-label', temaClaro() ? 'Mudar para o tema escuro' : 'Mudar para o tema claro');
}
function trocarTema() {
  const novo = temaClaro() ? 'escuro' : 'claro';
  if (novo === 'claro') raizDoc.setAttribute('data-tema', 'claro'); else raizDoc.removeAttribute('data-tema');
  try { localStorage.setItem('indycar_tema', novo); } catch { /* sem armazenamento: vale só nesta visita */ }
  pintarBotaoDoTema();
}

/* ------------------------------ menu da conta ------------------------------ */

function fecharMenu(devolverFoco = false) {
  if (el.menuConta.hidden) return;
  el.menuConta.hidden = true;
  el.bConta.setAttribute('aria-expanded', 'false');
  if (devolverFoco) el.bConta.focus();
}
function abrirMenu() {
  const eu = estado.eu || {};
  trocar(el.menuConta,
    h('div', { class: 'menu-quem' },
      h('strong', null, eu.nome || 'Sem nome cadastrado'),
      eu.email ? h('span', null, eu.email) : null,
      eu.papel ? h('span', null, NOME_DO_PAPEL[eu.papel] || eu.papel) : null),
    ehAdmin(eu.papel) ? h('a', { class: 'menu-item', href: hrefDaTela('ajustes'), on: { click: () => fecharMenu() } }, icone('ajustes'), 'Ajustes') : null,
    h('a', { class: 'menu-item', href: hrefCentral }, icone('voltar'), 'Ir para a Central'),
    h('button', { class: 'menu-item', type: 'button', on: { click: sair } }, icone('sair'), 'Sair'));
  el.menuConta.hidden = false;
  el.bConta.setAttribute('aria-expanded', 'true');
  const primeiro = el.menuConta.querySelector('a, button');
  if (primeiro) primeiro.focus();
}

async function sair() {
  estado.parado = true;
  try { if (estado.sb) await estado.sb.auth.signOut({ scope: 'local' }); } catch { /* a sessão já tinha ido */ }
  location.href = hrefCentral;
}

/* ------------------------------ navegação ------------------------------ */

const periodoAtual = () => (estado.rota ? periodoDaTela(estado.rota.params.periodo) : PERIODO_DA_TELA);
const fonteAtual = () => (estado.rota ? fonteDaTela(estado.rota.params.fonte) : '');

/** Endereço de uma tela daqui, levando o período e a fonte escolhidos junto (params com null tiram o filtro). */
function hrefDaTela(tela, params = {}) {
  const periodo = periodoAtual(), fonte = fonteAtual();
  return montarRota(tela, { ...(periodo !== PERIODO_DA_TELA ? { periodo } : {}), ...(fonte ? { fonte } : {}), ...params });
}

const seloDoRadar = { n: 0 };
function itemDaNav(t, rota, { curto = false } = {}) {
  const n = t.id === 'radar' ? seloDoRadar.n : 0;
  return h('a', { class: 'nav-item', href: hrefDaTela(t.id), 'aria-current': t.id === rota.tela ? 'page' : null, data: { tela: t.id } },
    icone(t.icone, 'nav-icone'),
    h('span', { class: 'nav-rotulo' }, curto && t.id === 'geral' ? 'Geral' : t.rotulo),
    n ? h('span', { class: 'nav-selo' }, String(n), h('span', { class: 'so-leitor' }, n === 1 ? ' aviso' : ' avisos')) : null);
}

const TELAS_TODAS = abasDoPapel(null);
function pintarNavegacao(rota) {
  const papel = estado.eu && estado.eu.papel;
  const telas = abasDoPapel(papel);
  const doAdmin = telas.filter((t) => t.so_admin);
  trocar(el.navLado,
    telas.filter((t) => !t.so_admin).map((t) => itemDaNav(t, rota)),
    doAdmin.length ? [h('span', { class: 'nav-divisa', 'aria-hidden': 'true' }), ...doAdmin.map((t) => itemDaNav(t, rota))] : null);
  trocar(el.navBaixo, telas.filter((t) => !t.so_admin).map((t) => itemDaNav(t, rota, { curto: true })));
  const periodo = PERIODOS_DA_TELA.find((p) => p.id === periodoAtual());
  const fonte = fonteAtual();
  trocar(el.ladoPe,
    h('p', { class: 'lado-rotulo' }, 'Olhando'),
    h('p', { class: 'lado-filtro' }, 'Últimos ' + (periodo ? periodo.rotulo : '30 dias'), h('span', null, fonte === 'meta' ? 'só a Meta' : fonte === 'google' ? 'só o Google' : 'Meta e Google')),
    h('p', { class: 'lado-assina' }, 'IndyCar · Taubaté'));
  const atual = TELAS_TODAS.find((t) => t.id === rota.tela);
  document.title = (atual ? atual.rotulo + ' · ' : '') + 'IndyCar Tráfego';
}

/** O número vermelho do Radar: avisos urgentes e de atenção do período (a mesma leitura que a tela do Radar usa). */
async function atualizarSeloDoRadar(vez) {
  try {
    const lido = await estado.leitor.ler('api/hoje?periodo=' + periodoAtual());
    if (vez !== estado.vez || estado.parado) return;
    const n = contarRadar(lido.dados && lido.dados.fazer).selo;
    if (n === seloDoRadar.n) return;
    seloDoRadar.n = n;
    pintarNavegacao(estado.rota);
  } catch { /* sem o número: o Radar continua abrindo normal */ }
}

function criarCtx(rota, vez, forcar) {
  return {
    base, rota, forcar, miolo,
    periodo: periodoDaTela(rota.params.periodo),
    fonte: fonteDaTela(rota.params.fonte),
    api: estado.api, leitor: estado.leitor, eu: estado.eu,
    vivo: () => vez === estado.vez,
    hrefDaTela, avisar, faixa,
    marcarAtualizado: () => {},
    recarregar: () => navegar({ forcar: true }),
    demo: (ligado) => faixa('demo', ligado ? { icone: 'info', texto: 'Números de demonstração: a conta de anúncios ainda não foi ligada.' } : null),
    idade: (em) => haQuanto(em),
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
  pintarNavegacao(rota);
  if (estado.controle && estado.controle.sair) { try { estado.controle.sair(); } catch (erro) { console.error(erro); } }
  estado.controle = null;
  faixa('falha', null);
  faixa('demo', null);
  if (mudouTela) window.scrollTo(0, 0);
  try {
    const controle = await TELA[rota.tela].mostrar(criarCtx(rota, vez, forcar));
    if (vez === estado.vez) estado.controle = controle || null;
    else if (controle && controle.sair) controle.sair();
  } catch (erro) {
    console.error(erro);
    if (vez === estado.vez) Estados.falha(miolo, { mensagem: Estados.fraseDoErro(erro), aoTentar: () => navegar({ forcar: true }) });
  }
  if (mudouTela && anterior && vez === estado.vez) miolo.focus({ preventScroll: true });
  if (vez === estado.vez) atualizarSeloDoRadar(vez);
}

/* ------------------------------ sessão ------------------------------ */

function pararEm(pintar) {
  estado.parado = true;
  estado.vez++;
  if (estado.controle && estado.controle.sair) { try { estado.controle.sair(); } catch { /* a tela já estava saindo */ } }
  estado.controle = null;
  trocar(el.navLado);
  trocar(el.navBaixo);
  trocar(el.ladoPe);
  pintar();
}

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
  el.bConta.setAttribute('aria-label', el.iniciais.textContent + ': minha conta' + (eu.nome ? ', ' + eu.nome : ''));
}

/* ------------------------------ partida ------------------------------ */

function prepararCasca() {
  el.marca.setAttribute('href', hrefCentral);
  pintarBotaoDoTema();
  el.bTema.addEventListener('click', trocarTema);
  trocar(el.iniciais, '?');
  el.bConta.addEventListener('click', () => (el.menuConta.hidden ? abrirMenu() : fecharMenu()));
  for (const alvo of [el.bConta, el.menuConta]) alvo.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(true); });
  document.addEventListener('click', (e) => { if (!el.menuConta.contains(e.target) && !el.bConta.contains(e.target)) fecharMenu(); });
  $('.pular').addEventListener('click', (e) => { e.preventDefault(); miolo.focus(); });
  const semRede = () => faixa('rede', { icone: 'alerta', texto: 'Sem internet. Quando a conexão voltar, eu atualizo.' });
  window.addEventListener('offline', semRede);
  window.addEventListener('online', () => { faixa('rede', null); if (!estado.parado && estado.leitor) navegar({ forcar: true }); });
  if (navigator.onLine === false) semRede();
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
  pintarConta();
  if (estado.eu && estado.eu.acesso === false) {
    pararEm(() => Estados.semAcesso(miolo, { mensagem: null, hrefCentral }));
    return;
  }
  limparIda();
  window.addEventListener('hashchange', () => navegar());
  await navegar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker a tela funciona igual */ });
}

partir();
