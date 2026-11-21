/* ============================================================================
   Tela Ajustes (rodada 11): uma página com Conexões e Metas, só para o
   administrador. O resto que morava aqui (origem dos contatos, acesso da IA de
   fora, relatórios, devolução das vendas) saiu da tela; as rotas do servidor
   e a porta da IA continuam funcionando.
   ============================================================================ */

import { h, trocar } from '../dom.js';
import { vazio } from '../pecas.js';
import * as Conexoes from './gavetas/conexoes.js';
import * as Metas from './gavetas/metas.js';

export const ehAdmin = (eu) => !eu || !eu.papel || eu.papel === 'admin' || eu.papel === 'dono';

export function mostrar(ctx) {
  if (!ehAdmin(ctx.eu)) {
    trocar(ctx.miolo, vazio({ titulo: 'Ajustes é só do administrador', texto: 'Peça para quem administra a oficina mudar conexões e metas.' }));
    return null;
  }
  const conexoes = h('div', { class: 'aj-corpo' });
  const metas = h('div', { class: 'aj-corpo' });
  trocar(ctx.miolo,
    h('header', { class: 'r-cab' }, h('h1', { class: 'ic-titulo' }, 'Ajustes')),
    h('section', { class: 'aj-parte', 'aria-labelledby': 'tConexoes' }, h('h2', { class: 'r-subtitulo', id: 'tConexoes' }, 'Conexões'), conexoes),
    h('section', { class: 'aj-parte', 'aria-labelledby': 'tMetas' }, h('h2', { class: 'r-subtitulo', id: 'tMetas' }, 'Metas'), metas));
  const a = Conexoes.montar(ctx, conexoes);
  const b = Metas.montar(ctx, metas);
  return { sair() { a.sair(); b.sair(); } };
}
