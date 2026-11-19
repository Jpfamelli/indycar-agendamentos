/* ============================================================================
   A frase principal da tela Hoje (lógica pura, testada em tests/tela-frase.test.mjs).
   O texto vem pronto da API (`frase.texto`). Aqui só se decide o que é de
   apresentação: qual trecho ganha o destaque da casa (itálico vermelho) e que
   tamanho de letra cabe, pelo comprimento.
   Se a API mandar `frase.destaque` (campo a mais, opcional), ele manda.
   ============================================================================ */

const ESPACOS = '[ ' + String.fromCharCode(160) + ']';
const DINHEIRO = new RegExp('R[$]' + ESPACOS + '?[0-9][0-9.]*(?:,[0-9]{1,2})?', 'g');
const CONTATOS = new RegExp('[0-9][0-9.]*' + ESPACOS + 'contatos?');

function trechoDoDestaque(texto, tipo, destaque) {
  if (destaque) {
    const i = texto.indexOf(destaque);
    if (i >= 0) return [i, i + destaque.length];
  }
  if (tipo === 'retorno') {
    let ultimo = null;
    for (const m of texto.matchAll(DINHEIRO)) ultimo = m;
    return ultimo ? [ultimo.index, ultimo.index + ultimo[0].length] : null;
  }
  if (tipo === 'sem_conta') {
    const i = texto.indexOf('. ');
    if (i > 0 && i + 2 < texto.length) return [i + 2, texto.endsWith('.') ? texto.length - 1 : texto.length];
    return null;
  }
  if (tipo === 'falta_valor') {
    const m = CONTATOS.exec(texto);
    return m ? [m.index, m.index + m[0].length] : null;
  }
  return null;
}

/** Quebra o texto em pedaços: [{ texto, destaque }]. Nunca perde nem troca caractere. */
export function partesDaFrase({ texto, tipo, destaque } = {}) {
  const t = String(texto == null ? '' : texto);
  if (!t) return [];
  const trecho = trechoDoDestaque(t, tipo, destaque ? String(destaque) : '');
  if (!trecho) return [{ texto: t, destaque: false }];
  const [a, b] = trecho;
  return [
    { texto: t.slice(0, a), destaque: false },
    { texto: t.slice(a, b), destaque: true },
    { texto: t.slice(b), destaque: false },
  ].filter((p) => p.texto);
}

/**
 * A frase em linhas, uma por sentença ("100 contatos novos neste mês." / "30 vieram de anúncio."):
 * [[{ texto, destaque }]]. O ponto fica com a sentença dele; só o espaço entre as sentenças sai.
 */
/** Onde cada sentença termina no texto inteiro: [[inicio, fim)]. O espaço entre duas sentenças fica de fora. */
function sentencas(texto) {
  const faixas = [];
  let inicio = 0;
  for (;;) {
    const ponto = texto.indexOf('. ', inicio);
    if (ponto < 0 || ponto + 2 >= texto.length) break;
    faixas.push([inicio, ponto + 1]);
    inicio = ponto + 2;
  }
  if (inicio < texto.length) faixas.push([inicio, texto.length]);
  return faixas;
}

export function linhasDaFrase(frase) {
  const partes = partesDaFrase(frase);
  const texto = partes.map((p) => p.texto).join('');
  return sentencas(texto).map(([a, b]) => {
    const linha = [];
    let pos = 0;
    for (const parte of partes) {
      const de = Math.max(a, pos), ate = Math.min(b, pos + parte.texto.length);
      if (ate > de) linha.push({ texto: texto.slice(de, ate), destaque: parte.destaque });
      pos += parte.texto.length;
    }
    return linha;
  }).filter((l) => l.length);
}

/**
 * Tamanho da letra pela sentença mais comprida: 'g' (cabe gigante numa linha), 'm' ou 'p' (frase comprida).
 * Assim cada sentença tende a ocupar uma ou duas linhas, sem deixar palavra sozinha.
 */
export function tamanhoDaFrase(texto) {
  const t = String(texto == null ? '' : texto);
  const maior = Math.max(0, ...sentencas(t).map(([a, b]) => b - a));
  if (maior <= 22) return 'g';
  if (maior <= 48) return 'm';
  return 'p';
}
