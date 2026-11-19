/* ============================================================================
   Campanhas, Gestor IA e Ajustes nesta versão: telas de espera honestas.
   Cada uma diz a pergunta que vai responder, o que vai mostrar e o que falta
   ligar para ela funcionar (lido de GET api/conexoes, contrato §5.5), e
   aponta o que já dá para fazer hoje. O conteúdo de verdade vem na onda 2.
   ============================================================================ */

import { h, icone, trocar } from '../dom.js';
import { selo } from '../pecas.js';
import { ESPERAS } from '../espera-textos.js';
import * as Estados from './estados.js';

export function mostrar(ctx) {
  const texto = ESPERAS[ctx.rota.tela] || ESPERAS.campanhas;
  Estados.buscar(ctx, 'api/conexoes', { forma: 'painel', pintar: (dados) => pintar(ctx, texto, dados) });
  return null;
}

function pintar(ctx, t, conexoes) {
  const passos = Array.isArray(conexoes && conexoes.passos) ? conexoes.passos : [];
  const faltam = passos.filter((p) => !p.feito).length;
  trocar(ctx.miolo,
    h('article', { class: 'espera', 'aria-labelledby': 'tEspera' },
      h('header', { class: 'espera-cab' },
        h('p', { class: 'rotulo espera-chapeu' }, t.chapeu),
        h('h1', { class: t.frase.length === 1 ? 'espera-frase espera-frase-curta' : 'espera-frase', id: 'tEspera' }, t.frase.map((p) => (p.destaque ? h('em', { class: 'destaque' }, p.texto) : p.texto))),
        h('p', { class: 'espera-apoio' }, t.apoio)),
      h('div', { class: 'espera-corpo' },
        h('section', { class: 'bloco espera-grade', 'aria-labelledby': 'tVaiResponder' },
          h('div', { class: 'bloco-cab' }, h('h2', { class: 'titulo-bloco', id: 'tVaiResponder' }, t.tituloPerguntas)),
          h('ol', { class: 'espera-perguntas' },
            t.perguntas.map((p, i) => h('li', { class: 'espera-pergunta' },
              h('span', { class: 'espera-posicao numero', 'aria-hidden': 'true' }, String(i + 1)),
              h('span', { class: 'espera-pergunta-texto' }, h('strong', null, p.pergunta), h('span', { class: 'apoio' }, p.como)))))),
        h('section', { class: 'bloco espera-falta', id: 'conexoes', 'aria-labelledby': 'tFalta', tabindex: '-1' },
          h('div', { class: 'bloco-cab' },
            h('h2', { class: 'titulo-bloco', id: 'tFalta' }, 'O que falta ligar'),
            passos.length ? h('p', null, faltam ? faltam + ' de ' + passos.length + ' ainda não estão prontos.' : 'Está tudo ligado.') : null),
          passos.length
            ? h('ol', { class: 'espera-passos' }, passos.map((p) => h('li', { class: 'espera-passo', data: { feito: p.feito ? 'sim' : 'nao' } },
              h('span', { class: 'espera-passo-nome' }, p.titulo),
              p.feito ? selo('bom', 'Pronto') : selo('atencao', 'Falta'),
              p.como ? h('span', { class: 'apoio espera-passo-como' }, p.como) : null)))
            : h('p', { class: 'suave' }, 'Sem informação das conexões agora.'),
          t.extra ? h('p', { class: 'espera-extra' }, selo('espera', t.extra.selo), ' ', t.extra.texto) : null),
        h('section', { class: 'bloco espera-agora', 'aria-labelledby': 'tAgora' },
          h('div', { class: 'bloco-cab' }, h('h2', { class: 'titulo-bloco', id: 'tAgora' }, 'Já dá para fazer hoje')),
          h('ul', { class: 'espera-atalhos' }, t.atalhos.map((a) => h('li', null, atalho(ctx, a))))))));
  if (ctx.rota.params.secao === 'conexoes') {
    const alvo = document.getElementById('conexoes');
    if (alvo) { alvo.scrollIntoView({ block: 'start' }); alvo.focus({ preventScroll: true }); }
  }
}

function atalho(ctx, a) {
  const corpo = [h('span', { class: 'espera-atalho-texto' }, h('strong', null, a.rotulo), h('span', { class: 'apoio' }, a.porque))];
  if (a.tela) {
    return h('a', { class: 'espera-atalho', href: ctx.hrefDaTela(a.tela, a.params || {}) }, corpo, icone('seta', 'icone-seta'));
  }
  // A tela antiga mora em antiga/, ao lado desta (mesmo app, mesma sessão).
  return h('a', { class: 'espera-atalho', href: a.caminho }, corpo, icone('seta', 'icone-seta'));
}
