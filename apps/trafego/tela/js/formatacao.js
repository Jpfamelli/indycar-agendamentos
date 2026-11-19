/* ============================================================================
   Formatação mínima da resposta do Gestor IA (lógica pura, testada em
   tela/_testes/formatacao.test.mjs). A resposta da IA é texto e continua texto:
   este interpretador só reconhece parágrafo (linha em branco), lista ("- ",
   "* ", "• " ou "1. ") e negrito (**assim**). Ele devolve uma árvore de dados;
   quem monta o DOM cria nós de texto (nunca innerHTML), então "<b>" escrito
   pela IA ou por um cliente aparece como "<b>", não vira marcação.
   ============================================================================ */

const ITEM_SOLTO = /^\s*(?:[-*•])\s+(.*)$/;
const ITEM_NUMERADO = /^\s*\d{1,3}[.)]\s+(.*)$/;
const TITULO = /^\s*#{1,6}\s+(.*)$/;
const MAX = 20000;

/** "a **b** c" → [{ texto: 'a ', forte: false }, { texto: 'b', forte: true }, { texto: ' c', forte: false }]. */
export function partesDaLinha(linha) {
  const texto = String(linha == null ? '' : linha);
  const partes = [];
  let i = 0;
  const empurrar = (t, forte) => {
    if (!t) return;
    const ultima = partes[partes.length - 1];
    if (ultima && ultima.forte === forte) ultima.texto += t; else partes.push({ texto: t, forte });
  };
  while (i < texto.length) {
    const abre = texto.indexOf('**', i);
    if (abre < 0) { empurrar(texto.slice(i), false); break; }
    const fecha = texto.indexOf('**', abre + 2);
    // Sem fechamento, ou negrito vazio: os asteriscos ficam como estão.
    if (fecha < 0 || fecha === abre + 2) { empurrar(texto.slice(i, abre + 2), false); i = abre + 2; continue; }
    empurrar(texto.slice(i, abre), false);
    empurrar(texto.slice(abre + 2, fecha), true);
    i = fecha + 2;
  }
  return partes;
}

/**
 * Texto → blocos:
 *   { tipo: 'paragrafo', partes: [...] }
 *   { tipo: 'lista', ordenada: boolean, itens: [[...partes]] }
 * Título com "#" vira parágrafo em negrito (a resposta do Gestor é curta; não precisa de títulos).
 */
export function blocosDoTexto(texto) {
  const linhas = String(texto == null ? '' : texto).slice(0, MAX).replace(/\r\n?/g, '\n').split('\n');
  const blocos = [];
  let paragrafo = null;
  let lista = null;
  const fecharParagrafo = () => { if (paragrafo && paragrafo.length) blocos.push({ tipo: 'paragrafo', partes: partesDaLinha(paragrafo.join(' ')) }); paragrafo = null; };
  const fecharLista = () => { if (lista) blocos.push(lista); lista = null; };
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (!linha) { fecharParagrafo(); fecharLista(); continue; }
    const solto = ITEM_SOLTO.exec(linha);
    const numerado = solto ? null : ITEM_NUMERADO.exec(linha);
    if (solto || numerado) {
      fecharParagrafo();
      const ordenada = Boolean(numerado);
      if (lista && lista.ordenada !== ordenada) fecharLista();
      if (!lista) lista = { tipo: 'lista', ordenada, itens: [] };
      lista.itens.push(partesDaLinha((solto || numerado)[1]));
      continue;
    }
    const titulo = TITULO.exec(linha);
    if (titulo) {
      fecharParagrafo(); fecharLista();
      blocos.push({ tipo: 'paragrafo', partes: [{ texto: titulo[1].replace(/\*\*/g, ''), forte: true }] });
      continue;
    }
    // Linha comum logo depois de um item: continua o item (a IA às vezes quebra a frase).
    if (lista && !paragrafo && /^\s/.test(bruta)) {
      const ultimo = lista.itens[lista.itens.length - 1];
      for (const p of partesDaLinha(' ' + linha)) ultimo.push(p);
      continue;
    }
    fecharLista();
    if (!paragrafo) paragrafo = [];
    paragrafo.push(linha);
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

/**
 * Monta os blocos em DOM com a função `h` da tela (js/dom.js), que só cria nós de texto.
 * Fica aqui, recebendo `h`, para o teste conferir a montagem sem navegador.
 */
export function montarBlocos(blocos, h) {
  const partes = (lista) => lista.map((p) => (p.forte ? h('strong', null, p.texto) : p.texto));
  return blocos.map((b) => (b.tipo === 'lista'
    ? h(b.ordenada ? 'ol' : 'ul', { class: 'fala-lista' }, b.itens.map((item) => h('li', null, partes(item))))
    : h('p', null, partes(b.partes))));
}
