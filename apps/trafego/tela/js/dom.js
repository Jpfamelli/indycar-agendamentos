/* ============================================================================
   Montagem de tela sem innerHTML. Todo texto (inclusive nome e mensagem de
   cliente) entra por nó de texto: o navegador nunca interpreta como HTML.
   ============================================================================ */

import { ICONES } from './icones.js';

const SVG = 'http://www.w3.org/2000/svg';

function anexar(pai, filho) {
  if (filho == null || filho === false || filho === true) return;
  if (Array.isArray(filho)) { for (const f of filho) anexar(pai, f); return; }
  pai.appendChild(filho instanceof Node ? filho : document.createTextNode(String(filho)));
}

/**
 * h('a', { class: 'botao', href: '#/hoje', on: { click }, data: { id }, style: { '--v': 0.4 } }, 'Texto', filho)
 * Chaves especiais: class, on, data, style, hidden. O resto vira atributo (null e false não entram).
 */
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props || {})) {
    if (valor == null || valor === false) continue;
    if (chave === 'class') el.className = valor;
    else if (chave === 'on') { for (const [evento, fn] of Object.entries(valor)) if (fn) el.addEventListener(evento, fn); }
    else if (chave === 'data') { for (const [k, v] of Object.entries(valor)) if (v != null && v !== false) el.dataset[k] = String(v); }
    else if (chave === 'style') { for (const [k, v] of Object.entries(valor)) if (v != null) el.style.setProperty(k, String(v)); }
    else if (chave === 'hidden') el.hidden = Boolean(valor);
    else el.setAttribute(chave, valor === true ? '' : String(valor));
  }
  anexar(el, filhos);
  return el;
}

/** Ícone desenhado em traço (um peso só para a tela inteira). Sempre decorativo: a palavra vai ao lado. */
export function icone(nome, classe = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', ('icone ' + classe).trim());
  for (const [forma, atributos] of ICONES[nome] || ICONES.ponto) {
    const no = document.createElementNS(SVG, forma);
    for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, String(v));
    svg.appendChild(no);
  }
  return svg;
}

export function limpar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function trocar(el, ...filhos) {
  limpar(el);
  anexar(el, filhos);
  return el;
}

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/** Texto só para leitor de tela. */
export const soLeitor = (texto) => h('span', { class: 'so-leitor' }, texto);

/** Leva o foco para um elemento que normalmente não recebe foco (título de tela, painel). */
export function focar(el) {
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
}

/** A pessoa pediu menos movimento? */
export const menosMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
