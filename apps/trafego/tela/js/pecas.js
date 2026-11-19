/* ============================================================================
   Peças de tela usadas por mais de uma tela: mini-setores, selo de estado,
   marca "de anúncio", barra, colunas por dia, botão de ação vindo da API,
   estado vazio. Só montam DOM; as regras estão em setores.js e formato.js.
   ============================================================================ */

import { h, icone, soLeitor } from './dom.js';
import { miniSetores, descricaoDosSetores, palavraDoEstado } from './setores.js';
import { diaDaSemana, inteiro, contagem, ehNumero, partesDaData } from './formato.js';

const ICONE_DO_TOM = { bom: 'certo', atencao: 'alerta', espera: 'relogio', grave: 'alerta', recorde: 'recorde', fora: 'fora', neutro: 'ponto' };

/** Estado em palavra, com ícone e cor de setor: a cor nunca vai sozinha. */
export function selo(tom, texto, nomeDoIcone) {
  return h('span', { class: 'selo tom-' + (tom || 'neutro') }, icone(nomeDoIcone || ICONE_DO_TOM[tom] || 'ponto'), texto);
}

/** Os sete traços de um contato. `acender` liga a entrada em fila (só na primeira carga). */
export function setores(item, { tamanho = '', atraso = 0 } = {}) {
  const lista = miniSetores(item);
  return h('span', { class: ('setores ' + (tamanho ? 'setores-' + tamanho : '')).trim(), role: 'img', 'aria-label': descricaoDosSetores(item), style: { '--atraso': atraso + 'ms' } },
    lista.map((s, i) => h('span', { class: 'setor', data: { estado: s.estado, tom: s.tom }, style: { '--i': i }, title: s.rotulo + ': ' + palavraDoEstado(s.estado) })));
}

/** "Anúncio da Meta" com o paralelogramo vermelho quando é de anúncio. */
export function origem(o, { detalhe = false } = {}) {
  const rotulo = (o && o.rotulo) || 'Ainda não sabemos';
  return h('span', { class: 'origem' },
    o && o.paga === true ? h('span', { class: 'marca-anuncio', 'aria-hidden': 'true' }) : null,
    h('span', { class: 'origem-rotulo corta' }, rotulo),
    detalhe && o && o.detalhe ? h('span', { class: 'origem-detalhe corta' }, o.detalhe) : null);
}

/** Barra horizontal com uma ou duas partes: [{ v: 0..1, marca: bool }]. Decorativa: o número vai ao lado. */
export function barra(partes, classe = '') {
  return h('span', { class: ('barra ' + classe).trim(), 'aria-hidden': 'true' },
    partes.filter((p) => ehNumero(p.v) && p.v > 0).map((p) => h('i', { class: p.marca ? 'de-marca' : '', style: { '--v': Math.min(1, p.v).toFixed(4) } })));
}

/** Botão que leva para onde a API mandou (`acao.ir`). `ctx.destino` decide se é tela daqui ou outro app. */
export function botaoDaAcao(ctx, acao, classe = 'botao') {
  if (!acao || !acao.rotulo) return null;
  const d = ctx.destino(acao.ir);
  if (!d) return null;
  return h('a', { class: classe, href: d.href, target: d.target, rel: d.rel },
    acao.rotulo, icone(d.target ? 'abre-fora' : 'seta', d.target ? '' : 'icone-seta'));
}

export function vazio({ titulo, texto, acao = null }) {
  return h('div', { class: 'vazio' }, h('p', { class: 'vazio-titulo' }, titulo), texto ? h('p', null, texto) : null, acao);
}

/**
 * Uma escolha entre poucas (segmentos com papel de rádio): setas trocam e escolhem, como o período da casca.
 * `opcoes`: [{ id, rotulo }]. Quem chama decide o que acontece em `aoEscolher(id)`.
 */
export function escolhas({ rotulo, opcoes, atual, aoEscolher, classe = '' }) {
  const grupo = h('div', { class: ('segmentos ' + classe).trim(), role: 'radiogroup', 'aria-label': rotulo },
    opcoes.map((o) => h('button', {
      class: 'segmento', type: 'button', role: 'radio', 'aria-checked': String(o.id === atual), tabindex: o.id === atual ? '0' : '-1',
      data: { id: o.id }, on: { click: () => { if (o.id !== atual) aoEscolher(o.id); } },
    }, o.rotulo)));
  if (!opcoes.some((o) => o.id === atual) && grupo.firstChild) grupo.firstChild.setAttribute('tabindex', '0');
  grupo.addEventListener('keydown', (e) => {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const botoes = [...grupo.querySelectorAll('.segmento')];
    const agora = botoes.indexOf(document.activeElement);
    const proximo = botoes[((agora < 0 ? 0 : agora) + passo + botoes.length) % botoes.length];
    proximo.focus();
    aoEscolher(proximo.dataset.id);
  });
  return grupo;
}

/** A mesma escolha como lista de opções (para o celular, onde os segmentos não cabem). */
export function escolhaEmLista({ rotulo, opcoes, atual, aoEscolher, classe = '' }) {
  const select = h('select', { on: { change: (e) => aoEscolher(e.target.value) } }, opcoes.map((o) => h('option', { value: o.id }, o.rotulo)));
  select.value = atual;
  return h('label', { class: ('campo ' + classe).trim() }, h('span', { class: 'campo-rotulo' }, rotulo), select);
}

/** O "não sei" da casa: palavra, nunca zero e nunca traço. */
export const semDado = (texto = 'sem dado') => h('span', { class: 'sem-dado' }, texto);

/**
 * Colunas por dia. `dias`: [{ data, total, marca }] (marca = parte "de anúncio", pode ser null).
 * Rótulo direto: a linha de leitura embaixo diz o dia apontado (mouse, toque ou setas) e,
 * parada, diz o melhor dia. Para leitor de tela há uma tabela com os mesmos números.
 */
export function colunasPorDia(dias, { nome = 'Contatos por dia', um = 'contato', varios = 'contatos', comRecorde = true, altura = null, comMarca = true } = {}) {
  const validos = dias.filter((d) => ehNumero(d.total));
  const max = Math.max(1, ...validos.map((d) => d.total));
  const maior = validos.length ? validos.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const temRecorde = comRecorde && maior && maior.total > 0 && validos.length >= 5;
  const descreve = (d) => {
    if (!d) return '';
    const partes = [diaDaSemana(d.data) + ': ' + (ehNumero(d.total) ? contagem(d.total, um, varios) : 'sem dado')];
    if (comMarca && ehNumero(d.marca) && ehNumero(d.total) && d.total > 0) partes.push(inteiro(d.marca) + ' de anúncio');
    return partes.join(', ');
  };
  const parado = () => {
    if (!maior || maior.total === 0) return h('span', null, 'Nenhum ' + um + ' no período.');
    const deAnuncio = comMarca && ehNumero(maior.marca) ? ', ' + inteiro(maior.marca) + ' de anúncio' : '';
    return h('span', null, 'Melhor dia: ', h('strong', null, diaDaSemana(maior.data) + ', com ' + contagem(maior.total, um, varios) + deAnuncio), '.');
  };
  const leitura = h('p', { class: 'grafico-leitura', 'aria-hidden': 'true' }, parado());
  const colunas = dias.map((d, i) => {
    const total = ehNumero(d.total) ? d.total : 0;
    const marca = comMarca && ehNumero(d.marca) ? Math.min(d.marca, total) : 0;
    return h('span', { class: 'coluna', data: { i, recorde: temRecorde && d === maior ? '1' : null } },
      marca > 0 ? h('i', { class: 'de-marca', style: { '--a': (marca / max).toFixed(4) } }) : null,
      total - marca > 0 ? h('i', { style: { '--a': ((total - marca) / max).toFixed(4) } }) : null);
  });
  const passo = dias.length > 16 ? 5 : dias.length > 8 ? 2 : 1;
  const eixo = dias.map((d, i) => {
    const p = partesDaData(d.data);
    const mostra = i === 0 || i === dias.length - 1 || ((i + 1) % passo === 0 && i < dias.length - 2);
    return h('span', null, mostra && p ? String(p.dia) : '');
  });
  const area = h('div', { class: 'colunas', style: altura ? { '--colunas-altura': altura } : null }, colunas);
  let ativa = -1;
  const apontar = (i) => {
    if (i === ativa) return;
    if (ativa >= 0 && colunas[ativa]) delete colunas[ativa].dataset.ativa;
    ativa = i;
    while (leitura.firstChild) leitura.removeChild(leitura.firstChild);
    if (i >= 0 && colunas[i]) { colunas[i].dataset.ativa = '1'; leitura.appendChild(h('strong', null, descreve(dias[i]))); }
    else leitura.appendChild(parado());
  };
  const indiceDoPonteiro = (e) => {
    const caixa = area.getBoundingClientRect();
    if (!caixa.width) return -1;
    return Math.min(dias.length - 1, Math.max(0, Math.floor(((e.clientX - caixa.left) / caixa.width) * dias.length)));
  };
  area.addEventListener('pointermove', (e) => apontar(indiceDoPonteiro(e)));
  area.addEventListener('pointerdown', (e) => apontar(indiceDoPonteiro(e)));
  area.addEventListener('pointerleave', () => apontar(-1));
  const figura = h('figure', { class: 'grafico', tabindex: '0', role: 'group', 'aria-label': nome + '. Use as setas para ler dia a dia.' },
    area,
    h('div', { class: 'colunas-eixo', 'aria-hidden': 'true' }, eixo),
    leitura,
    h('table', { class: 'so-leitor' },
      h('caption', null, nome),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Dia'), h('th', { scope: 'col' }, 'Total'), comMarca ? h('th', { scope: 'col' }, 'De anúncio') : null)),
      h('tbody', null, dias.map((d) => h('tr', null, h('th', { scope: 'row' }, diaDaSemana(d.data)), h('td', null, ehNumero(d.total) ? inteiro(d.total) : 'sem dado'), comMarca ? h('td', null, ehNumero(d.marca) ? inteiro(d.marca) : 'sem dado') : null)))));
  figura.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End' && e.key !== 'Escape') return;
    e.preventDefault();
    if (e.key === 'Escape') return apontar(-1);
    if (e.key === 'Home') return apontar(0);
    if (e.key === 'End') return apontar(dias.length - 1);
    const proximo = ativa < 0 ? (e.key === 'ArrowRight' ? 0 : dias.length - 1) : ativa + (e.key === 'ArrowRight' ? 1 : -1);
    apontar(Math.min(dias.length - 1, Math.max(0, proximo)));
  });
  figura.addEventListener('blur', () => apontar(-1));
  return figura;
}

export { soLeitor };

/* ------------------------------ copiar, baixar e erro de campo (Ajustes e relatórios) ------------------------------ */

/** Copia o texto. Sem a área de transferência (página sem https, navegador antigo), cai no jeito antigo. */
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
  } catch { /* tenta o jeito antigo */ }
  const area = h('textarea', { class: 'so-leitor', readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
  area.value = texto;
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

/** Botão "Copiar" que avisa no pé da tela. `texto` pode ser uma função (lê na hora do clique). */
export function botaoCopiar(ctx, texto, { rotulo = 'Copiar', classe = 'botao', aviso = 'Copiado.' } = {}) {
  return h('button', { class: classe, type: 'button', on: { click: async (e) => {
    const valor = typeof texto === 'function' ? texto() : texto;
    const ok = await copiarTexto(String(valor == null ? '' : valor));
    ctx.avisar(ok ? aviso : 'Não deu para copiar sozinho. Selecione o texto e copie com o dedo ou com Ctrl+C.');
    e.currentTarget.focus();
  } } }, icone('copiar'), rotulo);
}

/** Entrega um arquivo para a pessoa salvar (o login vai no cabeçalho, então o arquivo vem como blob). */
export function salvarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome, class: 'so-leitor', tabindex: '-1', 'aria-hidden': 'true' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
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
