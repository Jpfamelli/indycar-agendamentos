/* ============================================================================
   Clientes (rodada 12): quem veio dos anúncios e onde está agora, em colunas
   (conversando → agendou → veio → fechou / não fechou). Cada cartão mostra a
   jornada em cinco passos: anúncio → conversa → agendou → veio → valor.
   Tocar abre a ficha com a linha do tempo e os atalhos para o CRM,
   o Atendimento e a Agenda. Embaixo: anúncio × oficina, por campanha.
   GET api/jornada (paga=1) e GET api/jornada/:id.
   ============================================================================ */

import { h, icone, trocar, menosMovimento } from '../dom.js';
import { dinheiro, inteiro, ehNumero, dataCurta, dataHora, haQuanto } from '../formato.js';
import { vazio } from '../pecas.js';
import { agruparClientes, jornadaDoCliente, filtrarClientes, semContaDe } from '../painel-logica.js';
import { linkSeguro, abaDoLink } from '../ecossistema.js';
import { voltarFecha } from '../voltar.js';
import * as Estados from './estados.js';
import { cabeca } from './cabeca.js';

const POR_COLUNA = 8;
const PENDENCIAS = {
  sem_valor: 'serviços fechados sem valor', sem_origem: 'contatos sem origem', sem_motivo: 'quem não fechou e está sem motivo', sem_resposta: 'contatos esperando resposta',
};

/* Rodada 19: sem conta de anúncios, a lista é de TODOS os contatos (quase ninguém chega marcado como anúncio e a tela
   ficava quase vazia). O estado vem das próprias respostas; antes da primeira, vale o que a Visão geral já leu. */
let semConta = null;
function sabeSemConta(ctx) {
  if (semConta != null) return semConta;
  const visto = ctx.leitor && typeof ctx.leitor.espiar === 'function' ? ctx.leitor.espiar('api/hoje?periodo=' + ctx.periodo) : null;
  const estado = visto && visto.dados && visto.dados.estado;
  return estado ? semContaDe(estado) : false;
}
/** A lista mostra todos os contatos (e não só os de anúncio)? Só sem conta ligada e sem filtro de fonte ou de campanha. */
const mostraTodos = (ctx) => sabeSemConta(ctx) && !ctx.fonte && !ctx.rota.params.campanha;

export function caminho(ctx) {
  const q = new URLSearchParams({ periodo: ctx.periodo, tamanho: '200' });
  const pend = PENDENCIAS[ctx.rota.params.pendencia] ? ctx.rota.params.pendencia : null;
  if (pend) q.set('pendencia', pend); else if (!mostraTodos(ctx)) q.set('paga', '1');
  if (ctx.fonte) q.set('canal', ctx.fonte);
  if (ctx.rota.params.campanha) q.set('campanha', ctx.rota.params.campanha.slice(0, 120));
  return 'api/jornada?' + q.toString();
}

let consulta = '';   // o que a pessoa digitou na busca; vale enquanto ela está nesta tela

export function mostrar(ctx) {
  consulta = '';
  Estados.buscar(ctx, caminho(ctx), { forma: 'lista', pintar: (d) => {
    // a resposta diz se há conta de anúncios; se isso muda a pergunta (todos × só de anúncio), pergunta de novo, uma vez
    const antes = caminho(ctx);
    semConta = semContaDe(d.estado || {});
    const agora = caminho(ctx);
    if (agora !== antes) Estados.buscar(ctx, agora, { forma: 'lista', pintar: (d2) => pintar(ctx, d2) });
    else pintar(ctx, d);
  } });
  return { sair() { const d = document.querySelector('dialog.dlg[open]'); if (d) d.close(); } };
}

function passos(item, { grande = false } = {}) {
  const j = jornadaDoCliente(item);
  return h('ol', { class: 'jornada' + (grande ? ' jornada-g' : ''), 'aria-label': 'Jornada: ' + j.map((p) => p.rotulo + (p.feito ? ' sim' : ' ainda não')).join(', ') },
    j.map((p) => h('li', { class: p.feito ? 'feito' : p.detalhe ? 'falta' : '' },
      h('i', { 'aria-hidden': 'true' }),
      h('span', null, p.id === 'valor' && ehNumero(p.valor) ? dinheiro(p.valor, { centavos: false }) : p.rotulo))));
}

function cartaoDoCliente(ctx, c) {
  const d = c.desfecho || {};
  return h('li', null, h('button', { class: 'cli', type: 'button', on: { click: () => abrirFicha(ctx, c) } },
    h('span', { class: 'cli-av', 'aria-hidden': 'true' }, (c.nome || '?').trim().slice(0, 1).toUpperCase()),
    h('span', { class: 'cli-corpo' },
      h('span', { class: 'cli-nome' }, c.nome || 'Contato', d.tipo === 'fechou' && ehNumero(d.valor) ? h('b', null, dinheiro(d.valor, { centavos: false })) : null),
      h('span', { class: 'cli-sub' }, [c.carro, c.servico].filter(Boolean).join(' · ') || 'Carro não informado'),
      h('span', { class: 'cli-de' }, icone('campanhas', 'icone-p'), h('span', null, (c.origem && c.origem.campanha && c.origem.campanha.nome) || (c.origem && c.origem.rotulo) || (mostraTodos(ctx) ? 'Origem não marcada' : 'Anúncio'))),
      passos(c))));
}

function coluna(ctx, grupo) {
  const lista = h('ul', { class: 'col-lista' });
  let mostrando = 0;
  const mais = h('button', { class: 'botao botao-quieto col-mais', type: 'button' });
  const encher = () => {
    const prox = grupo.itens.slice(mostrando, mostrando + POR_COLUNA);
    for (const c of prox) lista.appendChild(cartaoDoCliente(ctx, c));
    mostrando += prox.length;
    const resta = grupo.itens.length - mostrando;
    mais.hidden = resta <= 0;
    const n = Math.min(resta, POR_COLUNA);
    trocar(mais, resta > n ? 'Mostrar mais ' + n + ' (faltam ' + resta + ')' : 'Mostrar ' + (n === 1 ? 'mais 1' : 'os outros ' + n));
  };
  mais.addEventListener('click', encher);
  encher();
  return h('section', { class: 'col col-' + grupo.id, id: 'col-' + grupo.id, 'aria-label': grupo.rotulo },
    h('header', { class: 'col-cab' }, h('h2', null, grupo.rotulo), h('span', { class: 'col-n' }, inteiro(grupo.itens.length))),
    grupo.itens.length ? lista : h('p', { class: 'col-vazia' }, 'Ninguém aqui agora.'),
    mais);
}

function porCampanha(ctx, campanhas) {
  const lista = (Array.isArray(campanhas) ? campanhas : []).filter((c) => c && c.n);
  if (!lista.length) return null;
  return h('section', { class: 'cartao' },
    h('header', { class: 'cartao-cab' }, h('h2', null, 'Anúncio × oficina'), h('p', { class: 'sub' }, 'Quantas conversas cada campanha trouxe e quantas viraram cliente.')),
    h('div', { class: 'tabela-rola' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Campanha'), h('th', { scope: 'col' }, 'Conversas'), h('th', { scope: 'col' }, 'Clientes'), h('th', { scope: 'col' }, 'Viraram cliente'))),
      h('tbody', null, lista.map((c) => h('tr', null,
        h('th', { scope: 'row' }, h('a', { class: 'ligacao', href: ctx.hrefDaTela('clientes', { campanha: c.ext }) }, c.nome || 'Campanha'), h('span', { class: 'chip chip-' + (c.plataforma || 'anuncio') }, c.plataforma === 'google' ? 'Google' : c.plataforma === 'meta' ? 'Meta' : 'Anúncio')),
        h('td', null, inteiro(c.n)), h('td', null, ehNumero(c.fecharam) ? inteiro(c.fecharam) : 'sem dado'),
        h('td', null, ehNumero(c.fecharam) && c.n ? Math.round((c.fecharam / c.n) * 100) + '%' : 'sem dado')))))));
}

function pintar(ctx, d) {
  const estado = d.estado || {};
  ctx.demo(Boolean(estado.demo));
  const t = d.totais || {};
  const pend = PENDENCIAS[ctx.rota.params.pendencia] || null;
  const todos = !pend && mostraTodos(ctx);
  const campanha = ctx.rota.params.campanha ? ((d.filtros && d.filtros.campanhas) || []).find((c) => String(c.ext) === ctx.rota.params.campanha) : null;
  const filtro = pend || ctx.rota.params.campanha
    ? h('p', { class: 'filtro-ativo' }, 'Mostrando ', h('b', null, pend || ('a campanha ' + ((campanha && campanha.nome) || 'escolhida'))),
      h('a', { class: 'botao botao-quieto', href: ctx.hrefDaTela('clientes', { pendencia: null, campanha: null }) }, icone('fechar', 'icone-p'), 'Ver todos'))
    : null;
  const total = d.pagina && ehNumero(d.pagina.total) ? d.pagina.total : (d.itens || []).length;
  trocar(ctx.miolo,
    cabeca(ctx, { linha: 'Do WhatsApp ao carro na oficina', titulo: 'Clientes' }),
    filtro,
    h('section', { class: 'cartao faixa-tot', 'aria-label': 'Resumo dos contatos' }, h('dl', { class: 'tot' },
      h('div', null, h('dt', null, pend || todos ? 'Contatos' : 'Conversas de anúncio'), h('dd', null, inteiro(t.contatos) || '0')),
      h('div', null, h('dt', null, 'Agendaram'), h('dd', null, inteiro(t.agendaram) || '0')),
      h('div', null, h('dt', null, 'Vieram'), h('dd', null, inteiro(t.vieram) || '0')),
      h('div', null, h('dt', null, 'Fecharam'), h('dd', null, inteiro(t.fecharam) || '0')),
      h('div', null, h('dt', null, 'Em serviços'), ehNumero(t.faturado) ? h('dd', null, dinheiro(t.faturado, { centavos: false })) : h('dd', { class: 'sem' }, 'sem valor')))),
    total ? quadroComBusca(ctx, d.itens || []) : vazio(todos ? { titulo: 'Nenhum contato neste período', texto: 'Troque o período para ver os de antes.' } : { titulo: 'Nenhum contato de anúncio neste período', texto: 'Troque o período ou a fonte para ver outros contatos.' }),
    total > (d.itens || []).length ? h('p', { class: 'suave' }, 'Mostrando os ' + inteiro((d.itens || []).length) + ' mais recentes de ' + inteiro(total) + '.') : null,
    porCampanha(ctx, d.filtros && d.filtros.campanhas));
}

/**
 * Busca por nome, carro, serviço ou campanha e, no celular, os atalhos para cada etapa (o quadro vira uma coluna
 * comprida: sem eles, chegar em "Fechou serviço" era rolar a tela inteira). A busca olha a lista já carregada.
 */
function quadroComBusca(ctx, itens) {
  const caixa = h('div', { class: 'quadro-caixa' });
  const contagem = h('p', { class: 'busca-conta suave', role: 'status' });
  const campo = h('input', { class: 'entrada busca-campo', type: 'search', id: 'buscaClientes', placeholder: 'Buscar por nome, carro ou serviço', autocomplete: 'off', value: consulta, 'aria-label': 'Buscar nos contatos', on: { input: (e) => { consulta = e.target.value; pintarQuadro(); } } });
  const pintarQuadro = () => {
    const achados = filtrarClientes(itens, consulta);
    const grupos = agruparClientes(achados);
    contagem.textContent = consulta.trim() ? (achados.length === 1 ? '1 contato encontrado' : inteiro(achados.length) + ' contatos encontrados') + ' de ' + inteiro(itens.length) : '';
    const irPara = (id) => { const alvo = document.getElementById('col-' + id); if (alvo) alvo.scrollIntoView({ behavior: menosMovimento() ? 'auto' : 'smooth', block: 'start' }); };
    trocar(caixa, achados.length
      ? [h('nav', { class: 'salto', 'aria-label': 'Ir para a etapa' }, grupos.filter((g) => g.itens.length).map((g) =>
        h('button', { class: 'salto-op', type: 'button', on: { click: () => irPara(g.id) } }, g.rotulo, h('b', null, inteiro(g.itens.length))))),
      h('div', { class: 'quadro', 'aria-label': 'Contatos por etapa' }, grupos.map((g) => coluna(ctx, g)))]
      : vazio({ titulo: 'Ninguém com esse nome, carro ou serviço', texto: 'Confira a escrita ou apague a busca.',
        acao: h('button', { class: 'botao', type: 'button', on: { click: () => { consulta = ''; campo.value = ''; pintarQuadro(); campo.focus(); } } }, 'Limpar a busca') }));
  };
  pintarQuadro();
  return h('div', { class: 'quadro-vaso' },
    itens.length >= 6 ? h('div', { class: 'busca' }, icone('busca', 'icone-p busca-icone'), campo, contagem) : null,
    caixa);
}

/* ------------------------------ ficha ------------------------------ */

function abrirFicha(ctx, c) {
  const velho = document.querySelector('dialog.dlg[open]');
  if (velho) velho.close();
  const corpo = h('div', { class: 'dlg-corpo' });
  const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'tFicha', on: { close: () => dlg.remove(), click: (e) => { if (e.target === dlg) dlg.close(); } } },
    h('div', { class: 'dlg-cab' },
      h('div', null, h('p', { class: 'mini' }, (c.origem && c.origem.rotulo) || 'Contato'), h('h2', { id: 'tFicha' }, c.nome || 'Contato')),
      h('button', { class: 'botao-topo', type: 'button', 'aria-label': 'Fechar', on: { click: () => dlg.close() } }, icone('fechar'))),
    corpo);
  document.body.appendChild(dlg);
  dlg.showModal();
  voltarFecha(dlg);
  pintarFicha(ctx, corpo, c);
  ctx.leitor.ler('api/jornada/' + encodeURIComponent(c.lead_id)).then((r) => { if (dlg.isConnected) pintarFicha(ctx, corpo, { ...c, ...(r.dados || {}) }); }, () => {});
}

function pintarFicha(ctx, alvo, c) {
  const links = c.links || {};
  /* rodada 13C: cada app abre na aba nomeada dele (o ícone de "abre fora" agora diz a verdade) */
  const atalho = (href, rotulo) => { const seguro = linkSeguro(href, { base: ctx.base }); return seguro ? h('a', { class: 'botao', href: seguro, target: abaDoLink(seguro, { base: ctx.base }) }, rotulo, icone('abre-fora', 'icone-p')) : null; };
  trocar(alvo,
    h('p', { class: 'ficha-sub' }, [c.carro, c.servico, c.chegou_em ? 'chegou ' + (dataCurta(c.chegou_em) || '') : null].filter(Boolean).join(' · ')),
    passos(c, { grande: true }),
    c.origem && c.origem.detalhe ? h('p', { class: 'ficha-origem' }, icone('campanhas', 'icone-p'), c.origem.detalhe) : null,
    c.primeira_mensagem ? h('blockquote', { class: 'ficha-msg' }, c.primeira_mensagem) : null,
    Array.isArray(c.linha_do_tempo) && c.linha_do_tempo.length ? h('ol', { class: 'tempo' }, c.linha_do_tempo.map((e) => h('li', null,
      h('span', { class: 'tempo-quando' }, dataHora(e.em) || haQuanto(e.em) || ''),
      h('b', null, e.titulo || ''), e.detalhe ? h('span', null, e.detalhe) : null))) : null,
    h('div', { class: 'ficha-atalhos' }, atalho(links.crm, 'Abrir no CRM'), atalho(links.atendimento, 'Abrir a conversa'), atalho(links.agenda, 'Ver na Agenda')));
}
