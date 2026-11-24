/* ============================================================================
   Peças de tela usadas por mais de uma tela (rodada 11: só o que sobrou):
   selo de estado, estado vazio e erro de campo.
   ============================================================================ */

import { h, icone, soLeitor } from './dom.js';
import { ehAdmin } from './rotas.js';

const ICONE_DO_TOM = { bom: 'certo', atencao: 'alerta', espera: 'relogio', grave: 'alerta', neutro: 'ponto' };

/** Estado em palavra, com ícone e cor: a cor nunca vai sozinha. */
export function selo(tom, texto, nomeDoIcone) {
  return h('span', { class: 'selo tom-' + (tom || 'neutro') }, icone(nomeDoIcone || ICONE_DO_TOM[tom] || 'ponto'), texto);
}

export function vazio({ titulo, texto, acao = null }) {
  return h('div', { class: 'vazio' }, h('p', { class: 'vazio-titulo' }, titulo), texto ? h('p', null, texto) : null, acao);
}

export { soLeitor };

/**
 * Cartão "Ligar a conta de anúncios" (rodada 14): aparece enquanto nenhuma conta da Meta ou do Google está ligada.
 * Três passos curtos e o botão para Ajustes (só o administrador vê o botão; os outros veem quem pedir).
 * `compacto`: uma linha com o botão, para as telas de baixo.
 */
export function ligarConta(ctx, { compacto = false } = {}) {
  const admin = ehAdmin(ctx.eu && ctx.eu.papel);
  const botao = admin ? h('a', { class: 'botao botao-forte', href: ctx.hrefDaTela('ajustes') }, 'Ligar a conta de anúncios', icone('seta', 'icone-seta')) : null;
  if (compacto) {
    return h('section', { class: 'cartao ligar ligar-compacto', 'aria-label': 'Conta de anúncios não ligada' },
      h('p', null, h('b', null, 'A conta de anúncios ainda não está ligada. '), 'Dá para ver as conversas e os clientes; falta o quanto cada um custou.'),
      botao || h('p', { class: 'suave' }, 'Peça ao administrador para ligar em Ajustes.'));
  }
  const passos = [
    ['Abra Ajustes', 'Na parte Conexões, escolha a Meta ou o Google.'],
    ['Cole o acesso', 'O número da conta de anúncios e a chave de acesso. A tela só guarda se o teste passar.'],
    ['Toque em Testar e Salvar', 'Depois, em Buscar os números agora. O gasto aparece aqui.'],
  ];
  return h('section', { class: 'cartao ligar', 'aria-labelledby': 'tLigar' },
    h('div', { class: 'ligar-txt' },
      h('p', { class: 'mini' }, 'Falta uma coisa'),
      h('h2', { id: 'tLigar' }, 'Ligue a conta de anúncios'),
      h('p', null, 'O que veio pelo WhatsApp e pela oficina já está aqui. Com a conta ligada entram também o quanto foi investido, o custo de cada conversa e de cada cliente, e quanto cada R$ 1 voltou.'),
      botao || h('p', { class: 'suave' }, 'Só o administrador liga a conta. Peça para ele abrir Ajustes.')),
    h('ol', { class: 'ligar-passos' }, passos.map(([t, d], i) => h('li', null, h('span', { class: 'ligar-n', 'aria-hidden': 'true' }, String(i + 1)), h('div', null, h('b', null, t), h('p', null, d))))));
}

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
