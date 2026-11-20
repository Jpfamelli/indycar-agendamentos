/* ============================================================================
   Lista de contatos com mini-setores, para quem não é a Jornada (o detalhe de
   uma campanha). As mesmas colunas e a mesma linha da torre da Jornada; tocar
   no nome abre o contato lá, com o caminho inteiro.
   ============================================================================ */

import { h } from './dom.js';
import { situacao } from './setores.js';
import { dinheiro, dataCurta, ehNumero } from './formato.js';
import { selo, setores, origem as marcaDaOrigem } from './pecas.js';

/**
 * Dentro de uma campanha, repetir o nome dela em toda linha não diz nada: fica só o que vem depois
 * ("Taubaté 30 km › Vídeo 2"). Sem campanha conhecida, o detalhe vai como veio.
 */
export function detalheSemCampanha(detalhe, campanha) {
  const d = String(detalhe || '').trim();
  const c = String(campanha || '').trim();
  if (!d || !c) return d || null;
  if (d === c) return null;
  const prefixo = c + ' › ';
  return d.startsWith(prefixo) ? d.slice(prefixo.length).trim() || null : d;
}

/**
 * Na Jornada: a marca da origem e o detalhe. Dentro de uma campanha todo contato veio do mesmo anúncio
 * ("Anúncio da Meta" em toda linha não diz nada): fica só o conjunto e o anúncio, e a marca volta quando
 * o contato não diz de qual anúncio veio (para a célula nunca ficar vazia).
 */
export function celulaDaOrigem(item, campanha) {
  const detalhe = item.origem ? detalheSemCampanha(item.origem.detalhe, campanha) : null;
  if (campanha && detalhe) return [h('span', { class: 'apoio corta' }, detalhe)];
  return [marcaDaOrigem(item.origem), detalhe ? h('span', { class: 'apoio corta' }, detalhe) : null];
}

function linha(ctx, item, i, campanha) {
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
    h('div', { class: 'torre-celula jl-origem', role: 'cell' }, ...celulaDaOrigem(item, campanha)),
    h('div', { class: 'torre-celula jl-setores', role: 'cell' }, setores(item, { atraso: Math.min(i, 14) * 34 })),
    h('div', { class: 'torre-celula jl-situacao', role: 'cell' }, selo(s.tom, s.texto), detalhe),
    h('div', { class: 'torre-celula jl-valor torre-direita', role: 'cell' }, valor),
    h('div', { class: 'torre-celula jl-chegou torre-direita', role: 'cell' }, h('span', { class: 'so-leitor' }, 'chegou em '), dataCurta(item.chegou_em)));
}

/** Torre de contatos. `itens`: itens da jornada (contrato §5.3). */
export function torreDeContatos(ctx, itens, { rotulo = 'Contatos', acender = false, campanha = null } = {}) {
  return h('div', { class: 'torre torre-jornada' + (acender ? ' acender' : ''), role: 'table', 'aria-label': rotulo },
    h('div', { class: 'torre-cabeca', role: 'row' },
      h('span', { role: 'columnheader' }, 'Contato'), h('span', { role: 'columnheader', class: 'jl-origem' }, 'De onde veio'), h('span', { role: 'columnheader' }, 'Etapas'),
      h('span', { role: 'columnheader' }, 'Situação'), h('span', { role: 'columnheader', class: 'torre-direita' }, 'Valor'), h('span', { role: 'columnheader', class: 'torre-direita jl-chegou' }, 'Chegou')),
    itens.map((item, i) => linha(ctx, item, i, campanha)));
}
