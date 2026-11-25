/* Cabeçalho de toda tela (rodada 12): a linha pequena de cima, o título grande
   e os filtros (7 / 30 / 60 dias e Tudo / Meta / Google), iguais em todas. */

import { h, icone } from '../dom.js';
import { PERIODOS_DA_TELA, PERIODO_DA_TELA, FONTES } from '../rotas.js';

function grupo(rotulo, opcoes, atual, href) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': rotulo },
    opcoes.map((o) => h('a', { class: 'seg-op', href: href(o.id), 'aria-current': o.id === atual ? 'true' : null }, o.rotulo)));
}

export function filtros(ctx, { fonte = true } = {}) {
  const tela = ctx.rota.tela;
  const extra = { ...ctx.rota.params };
  delete extra.periodo; delete extra.fonte;
  return h('div', { class: 'cab-filtros' },
    grupo('Período', PERIODOS_DA_TELA, ctx.periodo, (id) => ctx.hrefDaTela(tela, { ...extra, periodo: id === PERIODO_DA_TELA ? null : id })),
    fonte ? grupo('De onde', FONTES, ctx.fonte, (id) => ctx.hrefDaTela(tela, { ...extra, fonte: id || null })) : null);
}

/** "Atualizado há 2 min" e o botão que lê tudo de novo (rodada 15). O texto é mantido pela casca (app.js) e muda sozinho. */
function atualiza(ctx) {
  const texto = ctx.textoAtualizado ? ctx.textoAtualizado() : 'Atualizar';
  return h('button', { class: 'cab-atualiza', type: 'button', 'data-atualiza': '', 'aria-label': 'Atualizar os números agora', on: { click: (e) => {
    const t = e.currentTarget.querySelector('.cab-atualiza-txt');
    if (t) t.textContent = 'Atualizando…';
    ctx.recarregar();
  } } }, icone('atualizar', 'icone-p'), h('span', { class: 'cab-atualiza-txt' }, texto));
}

/** cabeca(ctx, { linha: 'Anúncios → WhatsApp → oficina', titulo: 'Visão geral', fonte: true, acoes }) */
export function cabeca(ctx, { linha, titulo, fonte = true, semFiltro = false, acoes = null } = {}) {
  return h('header', { class: 'cab' },
    h('div', { class: 'cab-txt' },
      linha ? h('p', { class: 'cab-linha' }, linha) : null,
      h('h1', { class: 'cab-titulo' }, titulo),
      ctx.recarregar ? atualiza(ctx) : null),
    h('div', { class: 'cab-lado' }, semFiltro ? null : filtros(ctx, { fonte }), acoes));
}

/** "21/10 a 19/11" a partir do período que a API devolve. */
export function datasDoPeriodo(p) {
  if (!p || !p.de || !p.ate) return '';
  const dm = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
  return dm(p.de) + ' a ' + dm(p.ate);
}
