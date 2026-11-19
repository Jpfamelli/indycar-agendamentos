/* ============================================================================
   Mapa de dia e hora (o "quando chegam os contatos" das Campanhas).
   Grade com rótulo direto (dias e horas escritos), um tom só do fraco ao forte,
   o horário de pico com o número escrito, uma linha de leitura que diz a célula
   apontada (mouse, toque ou setas) e a tabela de verdade logo abaixo. A cor
   nunca vai sozinha: o número está na leitura e na tabela.
   No computador, dias nas linhas e horas nas colunas; no celular, ao contrário
   (sete colunas cabem em 375 px, catorze não).
   ============================================================================ */

import { h } from './dom.js';
import { montarMapa, descreverCelula, NIVEIS_DO_MAPA } from './campanhas-logica.js';
import { inteiro } from './formato.js';

const deitado = () => !(typeof matchMedia === 'function' && matchMedia('(max-width: 47.99em)').matches);

/**
 * `horarios`: o bloco da API ({ dias, horas, celulas, pico, leitura, total, base }).
 * Devolve null quando a forma não serve (a tela diz "sem dado").
 */
export function mapaDeHorarios(horarios, { nome = 'Contatos por dia e hora' } = {}) {
  const mapa = montarMapa(horarios);
  if (!mapa) return null;
  const um = horarios.base === 'anuncio' ? 'contato de anúncio' : 'contato';
  const varios = horarios.base === 'anuncio' ? 'contatos de anúncio' : 'contatos';
  const picos = mapa.maior > 0 ? mapa.celulas.filter((c) => c.n === mapa.maior) : [];
  const descreve = (c) => descreverCelula(c, { um, varios });
  const parado = () => (picos.length
    ? ['Mais movimento: ', h('strong', null, picos.slice(0, 2).map(descreve).join(' e ')), picos.length > 2 ? ' (e mais ' + inteiro(picos.length - 2) + ')' : '', '.']
    : ['Nenhum ' + um + ' no período.']);
  const leitura = h('p', { class: 'grafico-leitura mapa-leitura', 'aria-live': 'polite' }, parado());

  const celulas = mapa.celulas.map((c) => h('span', {
    class: 'mapa-celula',
    data: { nivel: c.n == null ? 'nada' : String(c.nivel), pico: picos.includes(c) ? '1' : null },
    style: { '--d': c.di + 2, '--hr': c.hi + 2 },
  }, picos.includes(c) && picos.length <= 3 ? h('span', { class: 'mapa-numero' }, inteiro(c.n)) : null));
  const rotulosDia = mapa.dias.map((d, i) => h('span', { class: 'mapa-dia', style: { '--d': i + 2 } }, d.rotulo));
  const rotulosHora = mapa.horas.map((hh, i) => h('span', { class: 'mapa-hora', style: { '--hr': i + 2 } }, hh.rotulo));
  const grade = h('div', { class: 'mapa-grade', style: { '--dias': mapa.dias.length, '--horas': mapa.horas.length } }, rotulosDia, rotulosHora, celulas);

  let ativa = -1;
  const apontar = (i) => {
    if (i === ativa) return;
    if (ativa >= 0 && celulas[ativa]) delete celulas[ativa].dataset.ativa;
    ativa = i;
    while (leitura.firstChild) leitura.removeChild(leitura.firstChild);
    if (i >= 0 && celulas[i]) { celulas[i].dataset.ativa = '1'; leitura.appendChild(h('strong', null, descreve(mapa.celulas[i]))); }
    else for (const parte of parado()) leitura.append(parte);
  };
  const indice = (di, hi) => di * mapa.horas.length + hi;
  grade.addEventListener('pointermove', (e) => {
    const alvo = e.target.closest && e.target.closest('.mapa-celula');
    if (alvo) apontar(celulas.indexOf(alvo));
  });
  grade.addEventListener('pointerdown', (e) => {
    const alvo = e.target.closest && e.target.closest('.mapa-celula');
    if (alvo) apontar(celulas.indexOf(alvo));
  });
  grade.addEventListener('pointerleave', () => apontar(-1));

  const area = h('div', { class: 'mapa-area', tabindex: '0', role: 'group', 'aria-label': nome + '. Use as setas para ler cada horário; os mesmos números estão na tabela logo abaixo.' }, grade);
  area.addEventListener('keydown', (e) => {
    const teclas = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape'];
    if (!teclas.includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') return apontar(-1);
    if (e.key === 'Home') return apontar(0);
    if (e.key === 'End') return apontar(celulas.length - 1);
    const atual = mapa.celulas[ativa] || null;
    if (!atual) return apontar(picos.length ? mapa.celulas.indexOf(picos[0]) : 0);
    // As setas andam como a grade aparece: no computador, ←→ trocam a hora; no celular, ←→ trocam o dia.
    const horizontal = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const mudaHora = deitado() ? horizontal : !horizontal;
    let { di, hi } = atual;
    if (mudaHora) hi = Math.min(mapa.horas.length - 1, Math.max(0, hi + passo));
    else di = Math.min(mapa.dias.length - 1, Math.max(0, di + passo));
    return apontar(indice(di, hi));
  });
  area.addEventListener('blur', () => apontar(-1));

  const tabela = h('details', { class: 'mapa-tabela' },
    h('summary', { class: 'ligacao' }, 'Ver os números em tabela'),
    h('div', { class: 'mapa-rolagem', tabindex: '0', role: 'region', 'aria-label': 'Tabela: ' + nome },
      h('table', null,
        h('caption', { class: 'so-leitor' }, nome + ' (' + varios + ')'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Hora'), mapa.dias.map((d) => h('th', { scope: 'col', abbr: d.extenso }, d.rotulo)))),
        h('tbody', null, mapa.horas.map((hh, hi) => h('tr', null,
          h('th', { scope: 'row' }, hh.rotulo),
          mapa.dias.map((_d, di) => {
            const c = mapa.celulas[indice(di, hi)];
            return h('td', { data: { pico: picos.includes(c) ? '1' : null } }, c.n == null ? 'sem dado' : inteiro(c.n));
          })))))));

  return h('figure', { class: 'mapa' },
    area,
    leitura,
    h('p', { class: 'legenda mapa-legenda' },
      h('span', null, 'Menos'),
      h('span', { class: 'mapa-escala', 'aria-hidden': 'true' }, Array.from({ length: NIVEIS_DO_MAPA }, (_, i) => h('i', { data: { nivel: String(i + 1) } }))),
      h('span', null, 'Mais ' + varios),
      h('span', { class: 'mapa-legenda-zero' }, h('i', { 'aria-hidden': 'true' }), 'nenhum')),
    tabela);
}
