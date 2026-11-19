/* ============================================================================
   Lista de contatos com mini-setores, para quem não é a Jornada (o detalhe de
   uma campanha). As mesmas colunas e a mesma linha da torre da Jornada; tocar
   no nome abre o contato lá, com o caminho inteiro.
   ============================================================================ */

import { h } from './dom.js';
import { situacao } from './setores.js';
import { dinheiro, dataCurta, ehNumero } from './formato.js';
import { selo, setores, origem as marcaDaOrigem } from './pecas.js';

function linha(ctx, item, i) {
  const s = situacao(item);
  const d = item.desfecho || {};
  const valor = d.tipo === 'fechou'
    ? (ehNumero(d.valor) ? h('span', { class: 'numero' }, dinheiro(d.valor)) : selo('atencao', 'sem valor'))
    : null;
  const detalhe = s.tipo === 'fechou' ? null
    : s.pede === 'motivo' ? selo('atencao', s.detalhe)
      : s.detalhe ? h('span', { class: 'apoio' }, s.detalhe) : null;
  return h('div', { class: 'torre-linha', role: 'row', data: { id: item.lead_id } },
    h('div', { class: 'torre-celula jl-contato', role: 'cell' },
      h('a', { class: 'torre-abre corta', href: ctx.hrefDaTela('jornada', { contato: item.lead_id }) }, item.nome || 'Sem nome'),
      h('span', { class: 'apoio corta' }, [item.carro, item.servico].filter(Boolean).join(' · ') || 'Carro e serviço não informados')),
    h('div', { class: 'torre-celula jl-origem', role: 'cell' }, marcaDaOrigem(item.origem),
      item.origem && item.origem.detalhe ? h('span', { class: 'apoio corta' }, item.origem.detalhe) : null),
    h('div', { class: 'torre-celula jl-setores', role: 'cell' }, setores(item, { atraso: Math.min(i, 14) * 34 })),
    h('div', { class: 'torre-celula jl-situacao', role: 'cell' }, selo(s.tom, s.texto), detalhe),
    h('div', { class: 'torre-celula jl-valor torre-direita', role: 'cell' }, valor),
    h('div', { class: 'torre-celula jl-chegou torre-direita', role: 'cell' }, h('span', { class: 'so-leitor' }, 'chegou em '), dataCurta(item.chegou_em)));
}

/** Torre de contatos. `itens`: itens da jornada (contrato §5.3). */
export function torreDeContatos(ctx, itens, { rotulo = 'Contatos', acender = false } = {}) {
  return h('div', { class: 'torre torre-jornada' + (acender ? ' acender' : ''), role: 'table', 'aria-label': rotulo },
    h('div', { class: 'torre-cabeca', role: 'row' },
      h('span', { role: 'columnheader' }, 'Contato'), h('span', { role: 'columnheader', class: 'jl-origem' }, 'De onde veio'), h('span', { role: 'columnheader' }, 'Etapas'),
      h('span', { role: 'columnheader' }, 'Situação'), h('span', { role: 'columnheader', class: 'torre-direita' }, 'Valor'), h('span', { role: 'columnheader', class: 'torre-direita jl-chegou' }, 'Chegou')),
    itens.map((item, i) => linha(ctx, item, i)));
}
