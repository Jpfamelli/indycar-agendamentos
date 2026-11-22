/* ============================================================================
   Ajustes (rodada 12): Conexões e Metas, só para o administrador. Fica no fim
   da navegação lateral e no menu da pessoa (no celular). O resto que já morou
   aqui (origem dos contatos, acesso da IA de fora, devolução das vendas) saiu
   da tela na rodada 11; as rotas do servidor continuam funcionando.
   ============================================================================ */

import { h, trocar } from '../dom.js';
import { vazio } from '../pecas.js';
import { ehAdmin as papelAdmin } from '../rotas.js';
import { cabeca } from './cabeca.js';
import * as Conexoes from './gavetas/conexoes.js';
import * as Metas from './gavetas/metas.js';

export const ehAdmin = (eu) => papelAdmin(eu && eu.papel);

export function mostrar(ctx) {
  if (!ehAdmin(ctx.eu)) {
    trocar(ctx.miolo, vazio({ titulo: 'Ajustes é só do administrador', texto: 'Peça para quem administra a oficina mudar conexões e metas.' }));
    return null;
  }
  const conexoes = h('div', { class: 'aj-corpo' });
  const metas = h('div', { class: 'aj-corpo' });
  trocar(ctx.miolo,
    cabeca(ctx, { linha: 'Só o administrador vê esta parte', titulo: 'Ajustes', semFiltro: true }),
    h('section', { class: 'cartao aj-parte', 'aria-labelledby': 'tConexoes' }, h('header', { class: 'cartao-cab' }, h('h2', { id: 'tConexoes' }, 'Conexões')), conexoes),
    h('section', { class: 'cartao aj-parte', 'aria-labelledby': 'tMetas' }, h('header', { class: 'cartao-cab' }, h('h2', { id: 'tMetas' }, 'Metas')), metas));
  const a = Conexoes.montar(ctx, conexoes);
  const b = Metas.montar(ctx, metas);
  return { sair() { a.sair(); b.sair(); } };
}
