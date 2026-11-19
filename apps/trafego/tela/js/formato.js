/* ============================================================================
   Formatação de tela (lógica pura, testada em tela/_testes/formato.test.mjs).
   Regra da casa: "não sei" é null e vira palavra na tela; nunca zero, nunca traço.
   Nada aqui calcula regra de negócio: só transforma o que a API manda em texto.
   ============================================================================ */

/** Espaço que não quebra (entre "R$" e o número). Por código, para nenhum editor trocar. */
export const ESPACO_FIXO = String.fromCharCode(160);

const FUSO = 'America/Sao_Paulo';
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** É um número de verdade? (null, undefined, NaN e infinito não são.) */
export const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

function agrupar(digitos) {
  let saida = '';
  for (let i = 0; i < digitos.length; i++) {
    if (i > 0 && (digitos.length - i) % 3 === 0) saida += '.';
    saida += digitos[i];
  }
  return saida;
}

/** 1234.5 → "1.234,50" (casas fixas). null quando não há número. */
export function numero(v, casas = 0) {
  if (!ehNumero(v)) return null;
  const fixo = Math.abs(v).toFixed(casas);
  const [inteira, fracao] = fixo.split('.');
  const zero = Number(fixo) === 0;
  return (v < 0 && !zero ? '-' : '') + agrupar(inteira) + (fracao ? ',' + fracao : '');
}

export const inteiro = (v) => numero(ehNumero(v) ? Math.round(v) : v, 0);

/**
 * Dinheiro em reais. De mil para cima e valores redondos saem sem centavos ("R$ 2.340", "R$ 750");
 * valores quebrados abaixo de mil saem com centavos ("R$ 38,40").
 */
export function dinheiro(v, { centavos = 'auto' } = {}) {
  if (!ehNumero(v)) return null;
  const arredondado = Math.round(v * 100) / 100;
  let casas = 2;
  if (centavos === false) casas = 0;
  else if (centavos === 'auto') casas = Math.abs(arredondado) >= 1000 || Number.isInteger(arredondado) ? 0 : 2;
  const texto = numero(Math.abs(arredondado), casas);
  const negativo = arredondado < 0 && Number(Math.abs(arredondado).toFixed(casas)) !== 0;
  return (negativo ? '-' : '') + 'R$' + ESPACO_FIXO + texto;
}

/** Fração de 0 a 1 → "11%". Abaixo de 1% (e acima de zero) diz "menos de 1%". */
export function porcento(fracao, { casas = 0 } = {}) {
  if (!ehNumero(fracao)) return null;
  const p = fracao * 100;
  if (casas === 0 && p !== 0 && Math.abs(p) < 0.5) return 'menos de 1%';
  return numero(p, casas) + '%';
}

/** Escolhe o formato pelo campo `formato` da API ("dinheiro" ou "inteiro"). */
export function valorPorFormato(v, formato) {
  return formato === 'dinheiro' ? dinheiro(v) : inteiro(v);
}

/** "3 contatos", "1 contato". */
export function contagem(n, um, varios) {
  if (!ehNumero(n)) return null;
  return inteiro(n) + ' ' + (Math.round(n) === 1 ? um : varios);
}
export const plural = (n, um, varios) => (Math.round(Number(n)) === 1 ? um : varios);

/**
 * Variação por extenso: 0.114 → "subiu 11%", -0.04 → "caiu 4%", 0 → "ficou igual", 1 → "dobrou".
 * Devolve { texto, direcao: 'sobe' | 'desce' | 'igual' } ou null quando não há número.
 */
export function variacaoPorExtenso(variacao) {
  if (!ehNumero(variacao)) return null;
  const tamanho = Math.abs(variacao);
  if (tamanho < 0.005) return { texto: 'ficou igual', direcao: 'igual' };
  if (variacao > 0) {
    if (tamanho >= 0.995 && tamanho < 1.005) return { texto: 'dobrou', direcao: 'sobe' };
    return { texto: 'subiu ' + inteiro(tamanho * 100) + '%', direcao: 'sobe' };
  }
  if (tamanho >= 0.995) return { texto: 'zerou', direcao: 'desce' };
  return { texto: 'caiu ' + inteiro(tamanho * 100) + '%', direcao: 'desce' };
}

/**
 * Linha de comparação de um número da tela Hoje.
 * `sentido` vem da API ("bom", "ruim", "neutro"): a tela não decide se subir é bom.
 * Devolve { texto, detalhe, tom: 'bom' | 'atencao' | 'neutro', direcao }.
 */
export function comparacao({ valor, antes, variacao, sentido, formato } = {}) {
  const v = variacaoPorExtenso(variacao);
  if (!v) {
    if (ehNumero(antes) && antes === 0 && ehNumero(valor) && valor > 0) return { texto: 'antes era zero', detalhe: null, tom: 'neutro', direcao: 'sobe' };
    return { texto: 'sem período anterior para comparar', detalhe: null, tom: 'neutro', direcao: null };
  }
  const tom = v.direcao === 'igual' ? 'neutro' : sentido === 'bom' ? 'bom' : sentido === 'ruim' ? 'atencao' : 'neutro';
  const antesTexto = valorPorFormato(antes, formato);
  return { texto: v.texto, detalhe: antesTexto ? 'antes ' + antesTexto : null, tom, direcao: v.direcao };
}

/* ------------------------------ datas (sempre no horário de Brasília) ------------------------------ */

function comoData(valor) {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number') return new Date(valor);
  const texto = String(valor || '');
  // Data sem hora ("2026-11-19"): meio-dia de Brasília, para o fuso nunca empurrar para o dia vizinho.
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(texto)) return new Date(texto + 'T12:00:00-03:00');
  return new Date(texto);
}

const leitor = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Partes da data no fuso de Brasília: { ano, mes, dia, hora, minuto, semana } ou null. */
export function partesDaData(valor) {
  const d = comoData(valor);
  if (Number.isNaN(d.getTime())) return null;
  const p = {};
  for (const parte of leitor.formatToParts(d)) p[parte.type] = parte.value;
  const ano = Number(p.year), mes = Number(p.month), dia = Number(p.day);
  return { ano, mes, dia, hora: Number(p.hour) % 24, minuto: Number(p.minute), semana: new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() };
}

const dois = (n) => String(n).padStart(2, '0');

/** "12/11" */
export function dataCurta(valor) {
  const p = partesDaData(valor);
  return p ? dois(p.dia) + '/' + dois(p.mes) : null;
}
/** "12 de novembro" */
export function dataLonga(valor) {
  const p = partesDaData(valor);
  return p ? p.dia + ' de ' + MESES[p.mes - 1] : null;
}
/** "qui 19" */
export function diaDaSemana(valor) {
  const p = partesDaData(valor);
  return p ? DIAS[p.semana] + ' ' + p.dia : null;
}
/** "09:41" */
export function hora(valor) {
  const p = partesDaData(valor);
  return p ? dois(p.hora) + ':' + dois(p.minuto) : null;
}
/** "12/11 às 09:41" */
export function dataHora(valor) {
  const d = dataCurta(valor), h = hora(valor);
  return d && h ? d + ' às ' + h : null;
}
/** Chave do dia ("2026-11-19") no fuso de Brasília. */
export function chaveDoDia(valor) {
  const p = partesDaData(valor);
  return p ? p.ano + '-' + dois(p.mes) + '-' + dois(p.dia) : null;
}

/** "agora", "há 3 min", "há 2 h", "ontem", "há 5 dias". */
export function haQuanto(quando, agora = Date.now()) {
  const d = comoData(quando);
  if (Number.isNaN(d.getTime())) return null;
  const seg = Math.max(0, Math.round((comoData(agora).getTime() - d.getTime()) / 1000));
  if (seg < 60) return 'agora';
  const min = Math.floor(seg / 60);
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'há ' + h + ' h';
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'ontem' : 'há ' + dias + ' dias';
}

/** O "intervalo" da torre: há quantos dias o contato está parado. */
export function paradoHa(dias) {
  if (!ehNumero(dias)) return null;
  const n = Math.max(0, Math.round(dias));
  if (n === 0) return 'parado desde hoje';
  return 'parado há ' + n + (n === 1 ? ' dia' : ' dias');
}

/** Minutos → "12 min", "1 h 20 min", "2 dias". */
export function duracao(minutos) {
  if (!ehNumero(minutos)) return null;
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return m + ' min';
  if (m < 1440) {
    const h = Math.floor(m / 60), resto = m % 60;
    return resto ? h + ' h ' + resto + ' min' : h + ' h';
  }
  const dias = Math.round(m / 1440);
  return dias + (dias === 1 ? ' dia' : ' dias');
}

/** 5512990000101 → "(12) 99000-0101". O que não parecer telefone volta como veio (só dígitos). */
export function telefone(v) {
  let n = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (!n) return null;
  if (n.length > 11 && n.startsWith('55')) n = n.slice(2);
  if (n.length === 11) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 7) + '-' + n.slice(7);
  if (n.length === 10) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 6) + '-' + n.slice(6);
  return n;
}

/** "João da Silva" → "JS". */
export function iniciais(nome) {
  const partes = String(nome || '').trim().split(/ +/).filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0] || '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] || '' : '';
  return (primeira + ultima).toUpperCase() || '?';
}

/** Texto digitado ("1.250,50", "1250.5", "R$ 890") → número em reais, ou null se não for valor. */
export function lerDinheiro(texto) {
  let t = String(texto == null ? '' : texto).replace(/[^0-9.,]/g, '');
  if (!t) return null;
  const virgula = t.lastIndexOf(','), ponto = t.lastIndexOf('.');
  if (virgula >= 0) t = t.slice(0, virgula).replace(/[.,]/g, '') + '.' + t.slice(virgula + 1).replace(/[.,]/g, '');
  else if (ponto >= 0 && t.length - ponto - 1 === 3) t = t.replace(/[.]/g, '');   // "1.250" é mil duzentos e cinquenta
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export const PERIODOS = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_passado', rotulo: 'Mês passado' },
];
export const PERIODO_PADRAO = 'mes';
export const periodoValido = (id) => (PERIODOS.some((p) => p.id === id) ? id : PERIODO_PADRAO);
