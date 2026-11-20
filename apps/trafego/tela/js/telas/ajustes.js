/* ============================================================================
   Tela Ajustes: um botão, seis gavetas.
   À esquerda (no celular, sozinha) a lista das gavetas; à direita a gaveta
   aberta. O endereço guarda qual: #/ajustes?secao=conexoes. Esc fecha a
   gaveta e o foco volta para o item da lista que a abriu.
   Cada gaveta mora em js/telas/gavetas/ e se monta sozinha num alvo.
   ============================================================================ */

import { h, icone, trocar, focar } from '../dom.js';
import { selo } from '../pecas.js';
import { seloDasConexoes } from '../hoje-logica.js';
import * as Conexoes from './gavetas/conexoes.js';
import * as Origem from './gavetas/origem.js';
import * as Metas from './gavetas/metas.js';
import * as Chaves from './gavetas/chaves.js';
import * as Relatorios from './gavetas/relatorios.js';
import * as Devolucao from './gavetas/devolucao.js';

export const GAVETAS = [
  { id: 'conexoes', titulo: 'Conexões', sobre: 'Meta, Google, rastreio do site e WhatsApp: o que está ligado e o passo a passo do que falta.', modulo: Conexoes },
  { id: 'origem', titulo: 'De onde vêm os contatos', sobre: 'Frases que dizem a origem, mensagem pronta por anúncio e o rastreio do site.', modulo: Origem },
  { id: 'metas', titulo: 'Metas e verba', sobre: 'Verba do mês, custo por contato que vale a pena, valor do serviço e margem.', modulo: Metas },
  { id: 'ia', titulo: 'Acesso da IA de fora', sobre: 'Chaves para o Claude Code e o Codex lerem os números da oficina.', modulo: Chaves },
  { id: 'relatorios', titulo: 'Relatórios', sobre: 'Texto pronto para o WhatsApp, folha do mês para imprimir e modo apresentação.', modulo: Relatorios },
  { id: 'devolucao', titulo: 'Devolver as vendas às plataformas', sobre: 'O arquivo do Google e a lista da Meta com os serviços fechados.', modulo: Devolucao },
];
const gaveta = (id) => GAVETAS.find((g) => g.id === id) || null;
const largo = () => typeof matchMedia === 'function' && matchMedia('(min-width: 62em)').matches;

export function mostrar(ctxInicial) {
  let ctx = ctxInicial;
  let aberta = null;           // { id, sair? }
  let saiu = false;
  // O estado das conexões já no item da lista: "Faltam 2 passos", "Pede atenção" ou "Tudo ligado".
  const estadoDasConexoes = h('span', { class: 'ajustes-item-estado' });
  ctx.leitor.ler('api/conexoes').then((r) => {
    const s = !saiu && seloDasConexoes(r && r.dados);
    if (s) trocar(estadoDasConexoes, selo(s[0], s[1]));
  }, () => { /* sem o estado, o item fica só com o nome */ });
  const lista = h('nav', { class: 'ajustes-lista', 'aria-label': 'Partes dos Ajustes' },
    h('ul', null, GAVETAS.map((g) => h('li', null,
      h('a', { class: 'ajustes-item', href: ctx.hrefDaTela('ajustes', { secao: g.id }), data: { id: g.id } },
        h('span', { class: 'ajustes-item-titulo' }, g.titulo),
        g.id === 'conexoes' ? estadoDasConexoes : null,
        h('span', { class: 'ajustes-item-sobre' }, g.sobre),
        icone('chevron-direita', 'ajustes-item-seta'))))));
  const painel = h('div', { class: 'ajustes-painel', tabindex: '-1' });
  const raiz = h('div', { class: 'ajustes' },
    h('header', { class: 'ajustes-topo' },
      h('h1', { class: 'titulo-tela' }, 'Ajustes'),
      h('p', { class: 'ajustes-resumo' }, 'O que liga o Tráfego às contas de anúncio, ao site e ao WhatsApp, e o que ele precisa saber da oficina.')),
    h('div', { class: 'ajustes-corpo' }, lista, painel));
  trocar(ctx.miolo, raiz);

  let voltarPara = null;   // a gaveta que acabou de fechar: o foco volta para o item dela na lista
  function fechar() {
    voltarPara = aberta && aberta.id;
    ctx.ir('ajustes', {});
  }
  painel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !aberta) return;
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    e.preventDefault();
    fechar();
  });

  function abrir(c, { focarTitulo = true } = {}) {
    ctx = c;
    const pedida = gaveta(c.rota.params.secao);
    // No computador sem gaveta escolhida, a primeira já fica aberta ao lado da lista.
    const g = pedida || (largo() ? GAVETAS[0] : null);
    raiz.dataset.aberta = pedida ? '1' : '';
    for (const a of lista.querySelectorAll('.ajustes-item')) {
      a.setAttribute('href', c.hrefDaTela('ajustes', { secao: a.dataset.id }));
      if (g && a.dataset.id === g.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    const devolverFoco = () => {
      if (!voltarPara) return;
      const item = lista.querySelector('.ajustes-item[data-id="' + voltarPara + '"]');
      voltarPara = null;
      if (item) item.focus();
    };
    if (aberta && g && aberta.id === g.id) { if (aberta.parte) aberta.parte(c.rota.params.parte); devolverFoco(); return; }
    if (aberta && aberta.sair) aberta.sair();
    aberta = null;
    if (!g) { trocar(painel); devolverFoco(); return; }
    const titulo = h('h2', { class: 'titulo-bloco ajustes-gaveta-titulo', id: 'tGaveta' }, g.titulo);
    const alvo = h('div', { class: 'ajustes-gaveta-corpo' });
    trocar(painel,
      h('section', { class: 'ajustes-gaveta', 'aria-labelledby': 'tGaveta' },
        h('div', { class: 'ajustes-gaveta-cab' },
          h('a', { class: 'ligacao ajustes-voltar', href: c.hrefDaTela('ajustes', {}), on: { click: (e) => { e.preventDefault(); fechar(); } } }, icone('voltar', 'icone-p'), 'Todos os ajustes'),
          titulo,
          h('p', { class: 'apoio' }, g.sobre)),
        alvo));
    const controle = g.modulo.montar(c, alvo, { parte: c.rota.params.parte }) || {};
    aberta = { id: g.id, sair: controle.sair, parte: controle.parte };
    if (voltarPara) devolverFoco();
    else if (pedida && focarTitulo) focar(titulo);
  }

  abrir(ctx, { focarTitulo: Boolean(ctx.rota.params.secao) });
  return {
    atualizar(novo) { abrir(novo); return true; },
    sair() { saiu = true; if (aberta && aberta.sair) aberta.sair(); },
  };
}
