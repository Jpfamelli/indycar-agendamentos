/* Escolha do período (rodada 11): dois botões, "Este mês" e "Mês passado". */

import { h } from '../dom.js';

export const PERIODOS_DA_TELA = [{ id: 'mes', rotulo: 'Este mês' }, { id: 'mes_passado', rotulo: 'Mês passado' }];

export function periodos(ctx) {
  return h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Período' },
    PERIODOS_DA_TELA.map((p) => h('a', {
      class: 'segmento', href: ctx.hrefDaTela(ctx.rota.tela, { periodo: p.id === 'mes' ? null : p.id }),
      'aria-current': ctx.periodo === p.id ? 'true' : null,
    }, p.rotulo)));
}
