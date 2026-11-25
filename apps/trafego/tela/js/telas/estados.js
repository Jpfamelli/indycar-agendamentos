/* ============================================================================
   Estados de tela: carregando, erro, sem sessão e sem acesso. São telas
   diferentes entre si (e diferentes do "vazio", que mora em pecas.js):
     carregando → esqueleto com a forma da tela, sem texto piscando;
     erro       → o que houve, em frase de gente, e o botão para tentar de novo;
     sem sessão → o login é o da Central; sem acesso → quem libera.
   ============================================================================ */

import { h, icone, trocar } from '../dom.js';

const osso = (classe) => h('span', { class: 'esqueleto ' + classe });
const repetir = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

const FORMAS = {
  lista: () => [osso('esq-titulo'), h('div', { class: 'esq-linhas' }, repetir(5, () => osso('esq-linha')))],
  painel: () => [osso('esq-titulo'), h('div', { class: 'esq-linhas' }, repetir(5, () => osso('esq-linha')))],
};

/** Carregando: blocos com a forma do que vem. Quem usa leitor de tela ouve "Carregando". */
export function esqueleto(alvo, forma = 'painel') {
  trocar(alvo,
    h('div', { class: 'esq esq-' + forma, 'aria-hidden': 'true' }, (FORMAS[forma] || FORMAS.painel)()),
    h('p', { class: 'so-leitor', role: 'status' }, 'Carregando'));
}

/** Erro: o que houve e como sair. `mensagem` já vem em frase de gente (api.js). */
export function falha(alvo, { titulo = 'Não deu para carregar', mensagem, aoTentar = null, nivel = 'h1' } = {}) {
  trocar(alvo,
    h('section', { class: 'falha', role: 'alert' },
      h(nivel, { class: 'falha-titulo' }, icone('alerta', 'icone-g tom-grave'), titulo),
      h('p', null, mensagem || 'Tente de novo em instantes.'),
      aoTentar ? h('button', { class: 'botao botao-forte', type: 'button', on: { click: aoTentar } }, icone('atualizar'), 'Tentar de novo') : null));
}

/** Frase do erro para a pessoa: a da API quando é erro de conversa com o servidor; genérica quando é da tela. */
export function fraseDoErro(erro) {
  if (erro && erro.name === 'ErroApi' && erro.message) return erro.message;
  return 'A tela encontrou um problema para se montar. Tente de novo; se continuar, avise quem cuida do sistema.';
}

/**
 * Busca `caminho` e trata carregando e erro do mesmo jeito em toda tela:
 * o que já estava na memória aparece na hora (sem piscar esqueleto) e é trocado quando o dado novo chega;
 * se a atualização falhar, o dado antigo continua na tela e um aviso explica.
 */
export async function buscar(ctx, caminho, { alvo = ctx.miolo, forma = 'painel', pintar, vivo = ctx.vivo, manter = false, mesma = false, nivel = 'h1' }) {
  const guardado = ctx.leitor.espiar(caminho);
  // "manter": o que já está na tela fica (meio apagado pelo aria-busy) até o dado novo chegar, em vez do esqueleto.
  const fica = !guardado && manter && alvo.childElementCount > 0;
  if (guardado) { pintar(guardado.dados, { primeira: false }); ctx.marcarAtualizado(guardado.em); }
  else if (!fica) esqueleto(alvo, forma);
  alvo.setAttribute('aria-busy', 'true');
  try {
    const lido = await ctx.leitor.ler(caminho, { forcar: ctx.forcar });
    if (!vivo()) return null;
    if (!guardado || !lido.daMemoria) pintar(lido.dados, { primeira: !guardado && !fica });
    ctx.faixa('falha', null);
    ctx.marcarAtualizado(lido.em);
    return lido.dados;
  } catch (erro) {
    if (!vivo()) return null;
    if (!(erro && erro.name === 'ErroApi')) console.error(erro);
    const mensagem = fraseDoErro(erro);
    if (guardado || (fica && mesma)) {
      ctx.faixa('falha', {
        icone: 'alerta',
        texto: 'Não consegui atualizar agora: o que está na tela é de ' + ((guardado && ctx.idade(guardado.em)) || 'antes') + '. ' + mensagem,
        acao: h('button', { class: 'botao', type: 'button', on: { click: () => ctx.recarregar() } }, 'Tentar de novo'),
      });
    } else {
      falha(alvo, { mensagem, aoTentar: () => ctx.recarregar(), nivel });
    }
    return null;
  } finally {
    if (vivo()) alvo.removeAttribute('aria-busy');
  }
}

/** Ninguém logado e já tentamos mandar para a Central: mostra o caminho, sem ficar indo e voltando. */
export function semSessao(alvo, { href }) {
  trocar(alvo,
    h('section', { class: 'vazio' },
      h('h1', { class: 'vazio-titulo' }, 'Entre pela Central para abrir o Tráfego'),
      h('a', { class: 'botao botao-forte', href }, 'Entrar pela Central', icone('seta', 'icone-seta'))));
}

export function semAcesso(alvo, { mensagem, hrefCentral }) {
  trocar(alvo,
    h('section', { class: 'vazio' },
      h('h1', { class: 'vazio-titulo' }, 'Você não tem acesso ao Tráfego'),
      h('p', null, mensagem || 'Peça para quem administra a equipe liberar este app no seu usuário.'),
      h('a', { class: 'botao', href: hrefCentral }, icone('voltar'), 'Voltar para a Central')));
}

/** Uma linha só, enquanto a página decide para onde ir. */
export function recado(alvo, texto) {
  trocar(alvo, h('p', { class: 'abrindo', role: 'status' }, texto));
}
