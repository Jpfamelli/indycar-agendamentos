/* ============================================================================
   Campanhas (rodada 12): cartões com gasto, conversas, clientes e custo por
   cliente, o selo Boa / Atenção / Ruim e a faísca dos dias. Tocar no cartão
   abre o detalhe (anúncios, funil e quem chegou). Ordem: maior gasto, mais
   clientes ou cliente mais barato.
   GET api/campanhas e GET api/campanhas/:plataforma/:chave.
   ============================================================================ */

import { h, icone, trocar } from '../dom.js';
import { dinheiro, inteiro, ehNumero, porcento } from '../formato.js';
import { selo, vazio } from '../pecas.js';
import { seloDaCampanha, ordenarCampanhas, ORDENS, somarDias, jornadaDoCliente, fracao } from '../painel-logica.js';
import { faisca, graficoDiario } from '../graficos.js';
import * as Estados from './estados.js';
import { cabeca } from './cabeca.js';

const PLATAFORMA = { meta: 'Meta', google: 'Google', anuncio: 'Anúncio' };
const r0 = (v) => dinheiro(v, { centavos: false });
const valor = (texto) => (texto ? h('dd', null, texto) : h('dd', { class: 'sem' }, 'sem dado'));

export function mostrar(ctx) {
  const caminho = 'api/campanhas?periodo=' + ctx.periodo + (ctx.fonte ? '&plataforma=' + ctx.fonte : '');
  let dialogo = null;
  Estados.buscar(ctx, caminho, { forma: 'lista', pintar: (d) => { dialogo = pintar(ctx, d) || dialogo; } });
  return { sair() { if (dialogo && dialogo.open) dialogo.close(); } };
}

function cartaoDaCampanha(ctx, c) {
  const s = seloDaCampanha(c);
  const href = ctx.hrefDaTela('campanhas', { ...ctx.rota.params, abrir: c.plataforma + ':' + c.chave });
  const gastos = Array.isArray(c.serie) ? c.serie.map((d) => d.gasto) : [];
  return h('li', { class: 'camp' },
    h('a', { class: 'camp-link', href, 'aria-label': 'Abrir ' + (c.nome || 'campanha') },
      h('div', { class: 'camp-cab' },
        h('span', { class: 'chip chip-' + (c.plataforma || 'anuncio') }, PLATAFORMA[c.plataforma] || 'Anúncio'),
        c.situacao === 'pausada' ? h('span', { class: 'chip chip-pausa' }, 'pausada') : null,
        s ? selo(s[0], s[1]) : null),
      h('h2', { class: 'camp-nome' }, c.nome || 'Campanha sem nome'),
      h('dl', { class: 'camp-numeros' },
        h('div', null, h('dt', null, 'Gasto'), valor(r0(c.gasto))),
        h('div', null, h('dt', null, 'Conversas'), valor(inteiro(c.contatos))),
        h('div', null, h('dt', null, 'Clientes'), valor(inteiro(c.fecharam))),
        h('div', { class: 'camp-forte' }, h('dt', null, 'Custo por cliente'), c.fecharam === 0 ? h('dd', { class: 'sem' }, 'nenhum cliente ainda') : valor(r0(c.custo_por_servico)))),
      gastos.some(ehNumero) ? faisca(gastos, { classe: 'camp-faisca' }) : null,
      c.leitura && c.leitura.texto ? h('p', { class: 'camp-leitura' }, c.leitura.texto) : null,
      h('span', { class: 'camp-abrir' }, 'Ver detalhes', icone('seta', 'icone-p'))));
}

function pintar(ctx, d) {
  const estado = d.estado || {};
  ctx.demo(Boolean(estado.demo));
  const ordem = ORDENS.some((o) => o.id === ctx.rota.params.ordem) ? ctx.rota.params.ordem : 'gasto';
  const lista = ordenarCampanhas(d.campanhas, ordem);
  const t = d.totais || {};
  const ordens = h('div', { class: 'seg seg-p', role: 'group', 'aria-label': 'Ordem' },
    ORDENS.map((o) => h('a', { class: 'seg-op', href: ctx.hrefDaTela('campanhas', { ...ctx.rota.params, abrir: null, ordem: o.id === 'gasto' ? null : o.id }), 'aria-current': o.id === ordem ? 'true' : null }, o.rotulo)));
  const ativas = lista.filter((c) => c.situacao !== 'pausada').length;
  trocar(ctx.miolo,
    cabeca(ctx, { linha: 'Onde o dinheiro dos anúncios está indo', titulo: 'Campanhas' }),
    h('section', { class: 'cartao faixa-tot', 'aria-label': 'Total das campanhas' }, h('dl', { class: 'tot' },
      h('div', null, h('dt', null, 'Campanhas'), h('dd', null, inteiro(lista.length), h('small', null, ativas === lista.length ? ' ativas' : ' · ' + inteiro(ativas) + ' ativas'))),
      h('div', null, h('dt', null, 'Investido'), valor(r0(t.gasto))),
      h('div', null, h('dt', null, 'Conversas'), valor(inteiro(t.contatos))),
      h('div', null, h('dt', null, 'Clientes'), valor(inteiro(t.fecharam))),
      h('div', null, h('dt', null, 'Custo por cliente'), valor(r0(t.custo_por_servico))),
      h('div', null, h('dt', null, 'Cada R$ 1 virou'), valor(ehNumero(t.retorno) ? dinheiro(t.retorno, { centavos: true }) : null)))),
    lista.length ? h('div', { class: 'barra-lista' }, h('p', { class: 'mini' }, inteiro(lista.length) + (lista.length === 1 ? ' campanha' : ' campanhas')), ordens) : null,
    lista.length
      ? h('ul', { class: 'camps' }, lista.map((c) => cartaoDaCampanha(ctx, c)))
      : vazio({ titulo: 'Nenhuma campanha neste período', texto: estado.gasto === 'sem_conta' ? 'Ligue a conta de anúncios em Ajustes para as campanhas aparecerem aqui.' : 'Troque o período ou a fonte para ver outras campanhas.' }),
    d.sem_campanha && d.sem_campanha.contatos ? h('p', { class: 'aviso-linha' }, icone('info', 'icone-p'), inteiro(d.sem_campanha.contatos) + ' conversas de anúncio não disseram de qual campanha vieram.') : null);

  const abrir = ctx.rota.params.abrir;
  if (!abrir) return null;
  const corte = abrir.indexOf(':');
  const alvo = corte > 0 ? lista.find((c) => c.plataforma === abrir.slice(0, corte) && String(c.chave) === abrir.slice(corte + 1)) : null;
  if (!alvo) return null;
  return abrirDetalhe(ctx, alvo);
}

/* ------------------------------ detalhe ------------------------------ */

function abrirDetalhe(ctx, resumo) {
  const aberto = document.querySelector('dialog.dlg[open]');
  if (aberto) return aberto;   // a lista pintou de novo (memória e depois o dado novo): a janela já está aberta
  const corpo = h('div', { class: 'dlg-corpo' });
  const fechar = () => { if (dlg.open) dlg.close(); };
  const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'tDlg', on: {
    close: () => { dlg.remove(); if (ctx.vivo() && ctx.rota.params.abrir) location.hash = ctx.hrefDaTela('campanhas', { ...ctx.rota.params, abrir: null }); },
    click: (e) => { if (e.target === dlg) fechar(); },
  } },
  h('div', { class: 'dlg-cab' },
    h('div', null,
      h('p', { class: 'mini' }, (PLATAFORMA[resumo.plataforma] || 'Anúncio') + (resumo.objetivo ? ' · ' + resumo.objetivo : '')),
      h('h2', { id: 'tDlg' }, resumo.nome || 'Campanha sem nome')),
    h('button', { class: 'botao-topo', type: 'button', 'aria-label': 'Fechar', on: { click: fechar } }, icone('fechar'))),
  corpo);
  document.body.appendChild(dlg);
  dlg.showModal();
  pintarDetalhe(ctx, corpo, resumo, null);
  const caminho = 'api/campanhas/' + encodeURIComponent(resumo.plataforma) + '/' + encodeURIComponent(resumo.chave) + '?periodo=' + ctx.periodo;
  ctx.leitor.ler(caminho).then((r) => { if (dlg.isConnected) pintarDetalhe(ctx, corpo, (r.dados && r.dados.campanha) || resumo, r.dados); },
    () => { /* sem o detalhe: o resumo da lista continua na janela */ });
  return dlg;
}

function pintarDetalhe(ctx, alvo, c, dados) {
  const s = seloDaCampanha(c);
  const dias = somarDias([c]);
  const anuncios = dados && Array.isArray(dados.conjuntos) ? dados.conjuntos.flatMap((cj) => (cj.anuncios || []).map((a) => ({ ...a, conjunto: cj.nome }))) : [];
  const contatos = dados && Array.isArray(dados.contatos) ? dados.contatos.slice(0, 6) : [];
  const passo = (rotulo, n, de) => h('li', null, h('b', null, ehNumero(n) ? inteiro(n) : 'sem dado'), h('span', null, rotulo), ehNumero(fracao(n, de)) ? h('small', null, porcento(fracao(n, de))) : null);
  trocar(alvo,
    h('div', { class: 'dlg-topo' }, s ? selo(s[0], s[1]) : null, c.leitura && c.leitura.texto ? h('p', null, c.leitura.texto) : null),
    h('ol', { class: 'mini-funil' },
      passo('conversas', c.contatos), passo('agendaram', c.agendaram, c.contatos), passo('vieram', c.vieram, c.agendaram), passo('clientes', c.fecharam, c.vieram)),
    h('dl', { class: 'tot tot-dlg' },
      h('div', null, h('dt', null, 'Gasto'), valor(r0(c.gasto))),
      h('div', null, h('dt', null, 'Custo por conversa'), valor(dinheiro(c.custo_por_contato))),
      h('div', null, h('dt', null, 'Custo por cliente'), valor(r0(c.custo_por_servico))),
      h('div', null, h('dt', null, 'Em serviços'), valor(r0(c.faturado)))),
    dias.length > 1 ? graficoDiario(dias, {}) : null,
    anuncios.length ? h('section', { class: 'dlg-parte' }, h('h3', null, 'Anúncios'),
      h('ul', { class: 'anuncios' }, anuncios.map((a) => h('li', null,
        h('div', null, h('b', null, a.nome || 'Anúncio'), a.conjunto ? h('span', null, a.conjunto) : null),
        h('p', null, [r0(a.gasto), inteiro(a.contatos) != null ? inteiro(a.contatos) + ' conversas' : null, inteiro(a.fecharam) != null ? inteiro(a.fecharam) + ' clientes' : null, ehNumero(a.custo_por_servico) ? r0(a.custo_por_servico) + ' por cliente' : null].filter(Boolean).join(' · ')))))) : null,
    contatos.length ? h('section', { class: 'dlg-parte' }, h('h3', null, 'Quem chegou por esta campanha'),
      h('ul', { class: 'quem' }, contatos.map((p) => h('li', null,
        h('b', null, p.nome || 'Contato'), h('span', null, [p.carro, p.servico].filter(Boolean).join(' · ')),
        h('span', { class: 'quem-passos', 'aria-label': jornadaDoCliente(p).filter((x) => x.feito).map((x) => x.rotulo).join(', ') },
          jornadaDoCliente(p).map((x) => h('i', { class: x.feito ? 'feito' : '' })))))),
      h('a', { class: 'ligacao', href: ctx.hrefDaTela('clientes', { campanha: c.ext || null }) }, 'Ver todos em Clientes')) : null);
}
