/* ============================================================================
   Peças de tela usadas por mais de uma tela (rodada 11: só o que sobrou):
   selo de estado, estado vazio e erro de campo.
   ============================================================================ */

import { h, icone, soLeitor } from './dom.js';

const ICONE_DO_TOM = { bom: 'certo', atencao: 'alerta', espera: 'relogio', grave: 'alerta', neutro: 'ponto' };

/** Estado em palavra, com ícone e cor: a cor nunca vai sozinha. */
export function selo(tom, texto, nomeDoIcone) {
  return h('span', { class: 'selo tom-' + (tom || 'neutro') }, icone(nomeDoIcone || ICONE_DO_TOM[tom] || 'ponto'), texto);
}

export function vazio({ titulo, texto, acao = null }) {
  return h('div', { class: 'vazio' }, h('p', { class: 'vazio-titulo' }, titulo), texto ? h('p', null, texto) : null, acao);
}

export { soLeitor };

/** Mostra (ou tira) o erro de um campo, ligado a ele para o leitor de tela. */
export function erroNoCampo(campo, texto) {
  if (!campo) return;
  const id = (campo.id || 'campo') + '-erro';
  let msg = campo.parentElement && campo.parentElement.querySelector('#' + CSS.escape(id));
  if (!texto) {
    campo.removeAttribute('aria-invalid');
    if (msg) msg.remove();
    return;
  }
  if (!msg) { msg = h('p', { class: 'campo-erro', id }); campo.insertAdjacentElement('afterend', msg); }
  msg.textContent = texto;
  campo.setAttribute('aria-invalid', 'true');
  campo.setAttribute('aria-describedby', [campo.getAttribute('aria-describedby'), id].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' '));
}
