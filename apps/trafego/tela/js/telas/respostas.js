/* ============================================================================
   As três respostas que a pessoa dá na Jornada: quanto foi o serviço, por que
   não fechou e de onde veio o contato. As mesmas peças servem ao detalhe do
   contato e ao mutirão de pendências, para a pergunta ser sempre igual.
   Aqui só se monta a tela e se confere o que foi digitado; gravar é com gravar.js.
   ============================================================================ */

import { h, icone } from '../dom.js';
import { MOTIVOS, ORIGENS_MANUAIS } from '../setores.js';
import { dinheiro, lerDinheiro, ehNumero } from '../formato.js';

export const VALOR_MINIMO = 1;
export const VALOR_MAXIMO = 100000;

let serie = 0;
const novoId = (prefixo) => prefixo + '-' + (++serie);

/** Confere o valor digitado. Devolve { valor } ou { erro } (frase para a pessoa). */
export function conferirValor(texto) {
  const valor = lerDinheiro(texto);
  if (!ehNumero(valor)) return { erro: 'Digite o valor em reais, por exemplo 750 ou 750,50.' };
  if (valor < VALOR_MINIMO || valor > VALOR_MAXIMO) return { erro: 'O valor precisa ficar entre R$ 1 e R$ 100.000.' };
  return { valor };
}

/**
 * Campo de dinheiro com o botão de gravar. Enter grava.
 * `sugestao`: { valor, rotulo } (o valor do orçamento, quando existe) vira um botão que preenche e grava.
 * Devolve { no, focar(), campo }.
 */
export function campoDeValor({ rotulo, sugestao = null, inicial = null, textoDoBotao = 'Lançar valor', aoGravar, atalhoDaSugestao = false }) {
  const idErro = novoId('erro-valor');
  const campo = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', maxlength: '12', 'aria-label': rotulo, 'aria-describedby': idErro, placeholder: '0,00' });
  if (ehNumero(inicial)) campo.value = dinheiro(inicial).replace(/[^0-9.,]/g, '');
  const erro = h('p', { class: 'campo-erro', id: idErro, role: 'alert', hidden: true });
  const mostrarErro = (frase) => { erro.textContent = frase || ''; erro.hidden = !frase; campo.setAttribute('aria-invalid', frase ? 'true' : 'false'); };
  const gravar = (texto) => {
    const r = conferirValor(texto);
    if (r.erro) { mostrarErro(r.erro); campo.focus(); return; }
    mostrarErro(null);
    aoGravar(r.valor);
  };
  campo.addEventListener('input', () => { if (!erro.hidden) mostrarErro(null); });
  const usarSugestao = () => gravar(String(sugestao.valor));
  const no = h('form', { class: 'resposta resposta-valor', novalidate: true, on: { submit: (e) => { e.preventDefault(); gravar(campo.value); } } },
    h('label', { class: 'entrada-valor' }, h('span', { 'aria-hidden': 'true' }, 'R$'), campo),
    erro,
    h('div', { class: 'resposta-botoes' },
      h('button', { class: 'botao botao-forte botao-g', type: 'submit' }, textoDoBotao),
      sugestao && ehNumero(sugestao.valor)
        ? h('button', { class: 'botao botao-g', type: 'button', on: { click: usarSugestao } }, atalhoDaSugestao ? tecla('U') : null, 'Usar ' + dinheiro(sugestao.valor), h('span', { class: 'resposta-apoio' }, sugestao.rotulo))
        : null));
  return { no, campo, focar: () => campo.focus({ preventScroll: true }), usarSugestao: sugestao && ehNumero(sugestao.valor) ? usarSugestao : null };
}

/** A tecla desenhada dentro do botão (só em tela com teclado; o CSS esconde no toque). */
export function tecla(texto) {
  return h('kbd', { class: 'tecla', 'aria-hidden': 'true' }, texto);
}

/**
 * Grade de escolhas de um toque. `opcoes`: [{ id, rotulo, apoio }]. `atual` marca a escolhida hoje.
 * Com `numeradas`, cada botão mostra a tecla (1 a 9) que faz o mesmo.
 */
export function escolhas({ nome, opcoes, atual = null, numeradas = false, aoEscolher }) {
  return h('div', { class: 'resposta resposta-escolhas', role: 'group', 'aria-label': nome },
    opcoes.map((o, i) => h('button', { class: 'escolha', type: 'button', 'aria-pressed': atual ? String(o.id === atual) : null, data: { id: o.id }, on: { click: () => aoEscolher(o) } },
      numeradas && i < 9 ? tecla(String(i + 1)) : null,
      h('span', { class: 'escolha-rotulo' }, o.rotulo),
      o.apoio ? h('span', { class: 'escolha-apoio' }, o.apoio) : null,
      atual && o.id === atual ? icone('certo', 'icone-p') : null)));
}

export const OPCOES_DE_MOTIVO = MOTIVOS.map((m) => ({ id: m.id, rotulo: m.rotulo }));
export const OPCOES_DE_ORIGEM = ORIGENS_MANUAIS.map((o) => ({ id: o.canal, rotulo: o.rotulo, apoio: o.apoio }));

/** Valor do orçamento do contato, quando a jornada tem um: vira a sugestão do campo de dinheiro. */
export function sugestaoDoOrcamento(item) {
  const etapa = (item && item.etapas ? item.etapas : []).find((e) => e.id === 'orcamento' && ehNumero(e.valor) && e.valor > 0);
  if (!etapa) return null;
  return { valor: etapa.valor, rotulo: etapa.numero != null ? 'do orçamento nº ' + etapa.numero : 'do orçamento' };
}
