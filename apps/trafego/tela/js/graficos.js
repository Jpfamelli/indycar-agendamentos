/* ============================================================================
   Gráficos da rodada 12, montados com DOM (sem biblioteca e sem innerHTML):
   barras em HTML (crescem do chão), linha e faísca em SVG com traço que não
   estica. Toda cor vem do CSS (painel.css): aqui só forma e número.
   ============================================================================ */

import { h } from './dom.js';
import { dinheiro, inteiro, ehNumero, dataCurta, diaDaSemana } from './formato.js';
import { mediaMovel, tetoDoEixo, larguraDoFunil, deCada100 } from './painel-logica.js';

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, atributos = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) if (v != null) el.setAttribute(k, String(v));
  return el;
}

/** Pontos de uma linha num quadro 100 × 100 (o SVG estica; o traço não). */
function pontos(valores, teto) {
  const n = valores.length;
  return valores.map((v, i) => (ehNumero(v) ? [n === 1 ? 50 : (i / (n - 1)) * 100, 100 - (v / teto) * 100] : null)).filter(Boolean);
}
const caminho = (pts) => pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join(' ');

/** Linha fininha com área por baixo, para o canto dos números. */
export function faisca(valores, { classe = '' } = {}) {
  const lista = (Array.isArray(valores) ? valores : []).map((v) => (ehNumero(v) ? v : 0));
  const svg = s('svg', { class: ('faisca ' + classe).trim(), viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  if (lista.length < 2) return svg;
  const teto = Math.max(...lista) || 1;
  const pts = pontos(lista, teto * 1.1);
  svg.appendChild(s('path', { class: 'faisca-area', d: caminho(pts) + ' L100 100 L0 100 Z' }));
  svg.appendChild(s('path', { class: 'faisca-linha', d: caminho(pts), 'vector-effect': 'non-scaling-stroke' }));
  return svg;
}

/**
 * Investimento (barras Meta + Google) e conversas por dia (linha, média de 7 dias).
 * `dias`: [{ data, meta, google, gasto, contatos }] de painel-logica.somarDias.
 */
export function graficoDiario(dias, { fonte = '', palavra = ['conversa', 'conversas'], janela = 7 } = {}) {
  const lista = Array.isArray(dias) ? dias : [];
  const temGasto = lista.some((d) => ehNumero(d.gasto));
  const tetoGasto = tetoDoEixo(Math.max(0, ...lista.map((d) => d.gasto || 0)));
  const media = mediaMovel(lista.map((d) => d.contatos), janela);
  const tetoConversa = tetoDoEixo(Math.max(1, ...lista.map((d) => d.contatos || 0), ...media.filter(ehNumero)));

  const leitura = h('p', { class: 'gd-leitura', 'aria-live': 'polite' });
  const lerDia = (i) => {
    const d = lista[i];
    if (!d) return;
    const partes = [diaDaSemana(d.data) + ' · ' + dataCurta(d.data)];
    if (ehNumero(d.gasto)) partes.push(dinheiro(d.gasto, { centavos: false }) + ' investidos');
    partes.push(d.contatos === 1 ? '1 ' + palavra[0] : inteiro(d.contatos) + ' ' + palavra[1]);
    leitura.textContent = partes.join(' · ');
    colunas.forEach((c, j) => c.classList.toggle('ativa', j === i));
  };

  const colunas = lista.map((d, i) => {
    const meta = fonte === 'google' ? 0 : d.meta || 0, google = fonte === 'meta' ? 0 : d.google || 0;
    const resto = Math.max(0, (d.gasto || 0) - meta - google);
    return h('div', { class: 'gd-col', data: { i }, on: { pointerenter: () => lerDia(i) } },
      h('span', { class: 'gd-barra gd-google', style: { '--v': (google / tetoGasto).toFixed(4) } }),
      h('span', { class: 'gd-barra gd-meta', style: { '--v': ((meta + resto) / tetoGasto).toFixed(4) } }));
  });

  const linha = s('svg', { class: 'gd-linha', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  const pts = pontos(media, tetoConversa).map(([x, y]) => [lista.length > 1 ? (x * (lista.length - 1) + 50) / lista.length : 50, y]);
  if (pts.length > 1) linha.appendChild(s('path', { d: caminho(pts), 'vector-effect': 'non-scaling-stroke' }));

  const marcas = (teto, fmt) => [1, 0.5, 0].map((f) => h('span', { style: { '--y': f } }, fmt(teto * f)));
  const passo = Math.max(1, Math.ceil(lista.length / 6));
  const area = h('div', {
    class: 'gd-area', tabindex: '0', role: 'group',
    'aria-label': 'Gráfico por dia. Use as setas para ler cada dia.',
    on: {
      keydown: (e) => {
        const atual = colunas.findIndex((c) => c.classList.contains('ativa'));
        let i = atual;
        if (e.key === 'ArrowRight') i = Math.min(lista.length - 1, atual + 1);
        else if (e.key === 'ArrowLeft') i = Math.max(0, atual < 0 ? lista.length - 1 : atual - 1);
        else if (e.key === 'Home') i = 0;
        else if (e.key === 'End') i = lista.length - 1;
        else return;
        e.preventDefault();
        lerDia(i);
      },
    },
  },
  h('div', { class: 'gd-eixo gd-eixo-e', 'aria-hidden': 'true' }, temGasto ? marcas(tetoGasto, (v) => dinheiro(v, { centavos: false })) : null),
  h('div', { class: 'gd-quadro' }, h('div', { class: 'gd-grade', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('div', { class: 'gd-cols' }, colunas), linha),
  h('div', { class: 'gd-eixo gd-eixo-d', 'aria-hidden': 'true' }, marcas(tetoConversa, (v) => inteiro(v))),
  h('div', { class: 'gd-datas', 'aria-hidden': 'true' }, lista.map((d, i) => (i % passo === 0 ? h('span', { style: { '--x': ((i + 0.5) / lista.length).toFixed(4) } }, dataCurta(d.data)) : null))));

  // dia mais movimentado já aparece escrito (quem não passa o dedo também lê alguma coisa)
  let pico = 0;
  lista.forEach((d, i) => { if ((d.contatos || 0) > (lista[pico].contatos || 0)) pico = i; });
  if (lista.length) lerDia(pico);
  return h('div', { class: 'grafico-dia' }, area, leitura);
}

/**
 * O funil do anúncio até o serviço fechado. `etapas`: [{ rotulo, apoio, valor, cor: 'frio' | 'quente' }].
 * A largura vai por ordem de grandeza (milhares de pessoas viram, dezenas viraram cliente).
 */
export function funil(etapas) {
  const lista = (Array.isArray(etapas) ? etapas : []).filter((e) => ehNumero(e.valor));
  const maior = Math.max(1, ...lista.map((e) => e.valor));
  return h('ol', { class: 'funil' }, lista.map((e, i) => {
    const antes = i ? lista[i - 1] : null;
    const cada = antes ? deCada100(e.valor, antes.valor) : null;
    return h('li', { class: 'funil-linha funil-' + (e.cor || 'frio') },
      h('div', { class: 'funil-nome' }, h('strong', null, e.rotulo), e.apoio ? h('span', null, e.apoio) : null),
      h('div', { class: 'funil-trilho' },
        h('span', { class: 'funil-barra', style: { '--v': larguraDoFunil(e.valor, maior).toFixed(4) } }, h('b', null, inteiro(e.valor)))),
      cada != null ? h('p', { class: 'funil-passa' }, e.passa ? e.passa(cada) : cada + '% de quem ' + (antes.quem || 'chegou antes')) : null);
  }));
}
