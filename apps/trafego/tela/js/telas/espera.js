/* provisório: as telas de espera entram no próximo passo */
import { h, trocar } from '../dom.js';

export function mostrar(ctx) {
  trocar(ctx.miolo, h('h1', { class: 'titulo-tela' }, ctx.rota.tela));
  return null;
}
