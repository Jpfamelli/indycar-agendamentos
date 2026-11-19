/* ============================================================
   Texto e número do jeito da casa (rodada 8, frente T2a).

   Todo texto que as rotas novas mandam para a tela passa por aqui:
   - dinheiro e número no formato do Brasil, com espaço comum;
   - null quando não se sabe (nunca 0, NaN ou Infinity);
   - as palavras do dono: "custo por contato", "retorno", "carro";
     nada de sigla solta nem de travessão.

   Os textos do núcleo (motor/nucleo.mjs) nasceram para outro produto
   e passam por textoDaCasa() antes de sair.
   ============================================================ */
'use strict';

const Vocab = require('../vocabulario');

/* ---------- números ---------- */

const finito = v => typeof v === 'number' && Number.isFinite(v);

/** Número de verdade ou null ("" e texto que não é número viram null; nunca NaN). */
function numOuNulo(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** a ÷ b, ou null quando a conta não existe (divisor zero, parcela desconhecida). */
function dividir(a, b) {
  const x = numOuNulo(a), y = numOuNulo(b);
  if (x == null || y == null || y === 0) return null;
  const r = x / y;
  return Number.isFinite(r) ? r : null;
}

/** Arredonda para `casas` (padrão 2); o que não é número finito vira null. */
function arredondar(v, casas = 2) {
  if (!finito(v)) return null;
  const f = 10 ** casas;
  const r = Math.round((v + Number.EPSILON) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** Soma tratando o que não é número como zero. */
const somar = lista => (lista || []).reduce((s, v) => s + (numOuNulo(v) || 0), 0);

const formatar = (v, casas) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const reais = (v, casas) => (finito(v) ? `${v < 0 ? '-' : ''}R$ ${formatar(v, casas)}` : null);

/** "R$ 1.234,50" (sempre com centavos); null quando não é número. */
const brl = v => reais(v, 2);
/** "R$ 2.341" (sem centavos); null quando não é número. */
const brl0 = v => (finito(v) ? reais(Math.round(v), 0) : null);
/** Dinheiro para frase: a partir de R$ 100 sem centavos, abaixo disso com centavos. */
const dinheiro = v => (finito(v) ? (Math.abs(v) >= 100 ? brl0(v) : brl(v)) : null);
/** "12.345" */
const inteiro = v => (finito(v) ? Math.round(v).toLocaleString('pt-BR') : null);
/** "1 contato", "0 contatos", "12 contatos" */
const plural = (n, um, varios) => `${inteiro(numOuNulo(n) || 0)} ${Math.round(numOuNulo(n) || 0) === 1 ? um : varios}`;
/** Fração 0–1 como "12%"; null quando não é número. */
const porcento = (fracao, casas = 0) => (finito(fracao) ? `${formatar(fracao * 100, casas)}%` : null);
/** "4,2" (uma casa, vírgula); null quando não é número. */
const decimal = (v, casas = 1) => (finito(v) ? `${v < 0 ? '-' : ''}${formatar(v, casas)}` : null);

/* ---------- palavras ---------- */

const MAIUSCULA = /^\p{Lu}/u;
const comInicial = (troca, original) => (MAIUSCULA.test(original) ? troca.charAt(0).toUpperCase() + troca.slice(1) : troca);
/* Sigla no começo de frase ou de linha (depois de marcador, de negrito ou de ponto) ganha maiúscula. */
const COMECO_DE_FRASE = /(?:^|[\n.!?]\s*|[•👉]\s*)[*_]*$/u;

/* [regex, troca]: frases inteiras primeiro, depois palavras. A troca pode ser função (m, antes) => texto. */
const FRASES = [
  [/Equipe Nexus · gestão de tráfego/g, 'IndyCar Tráfego'],
  [/Órbita/g, 'IndyCar Tráfego'],
  [/registre o valor no negócio \(CRM\) para entrar na conta/g, 'lance o valor do serviço para entrar na conta'],
  [/\bCTR baix[oa]\b/g, 'taxa de clique baixa'],
  [/\bCTR alt[oa]\b/g, 'taxa de clique alta'],
  [/\bcustos? por lead\b/gi, m => comInicial(/^custos/i.test(m) ? 'custos por contato' : 'custo por contato', m)],
];
const SIGLAS = [
  [/\bCRM\b/g, 'sistema'],
  [/\bCTR\b/g, 'taxa de clique'],
  [/\bCPA\b/g, 'custo por contato'],
  [/\bCPL\b/g, 'custo por contato'],
  [/\bCPC\b/g, 'custo por clique'],
  [/\bCPM\b/g, 'custo por mil exibições'],
  [/\bROAS\b/g, 'retorno'],
  [/\bROI\b/g, 'retorno'],
];
const PALAVRAS = [
  [/\bleads\b/gi, 'contatos'],
  [/\blead\b/gi, 'contato'],
  [/\bcriativos\b/gi, 'anúncios'],
  [/\bcriativo\b/gi, 'anúncio'],
];

function semTravessao(texto) {
  return texto
    // intervalo colado: "8h–12h", "seg–sáb", "2–3"
    .replace(/([\p{L}\d])[–—]([\p{L}\d])/gu, '$1 a $2')
    // travessão sozinho no lugar de um valor: "Custo: —"
    .replace(/(^|[ \t(:])[—–](?=[ \t]*(?:$|[\n.,;)·]))/gmu, '$1sem dado')
    // travessão no começo da linha (fala, item de lista)
    .replace(/^([ \t]*)[—–][ \t]*/gmu, '$1')
    // travessão entre duas partes da frase
    .replace(/[ \t]+[—–][ \t]+/g, ', ')
    // o que sobrar
    .replace(/[—–]/g, 'sem dado');
}

/**
 * Passa um texto para as palavras da casa: sem travessão, sem sigla solta,
 * "contato" no lugar de "lead", "anúncio" no lugar de "criativo", "carro" no lugar de "veículo".
 * Texto vazio ou ausente vira "".
 */
function textoDaCasa(texto) {
  if (texto == null) return '';
  let t = String(texto);
  for (const [re, troca] of FRASES) t = t.replace(re, troca);
  for (const [re, troca] of SIGLAS) {
    t = t.replace(re, (m, pos, inteiroTexto) => (COMECO_DE_FRASE.test(inteiroTexto.slice(0, pos)) ? troca.charAt(0).toUpperCase() + troca.slice(1) : troca));
  }
  for (const [re, troca] of PALAVRAS) t = t.replace(re, m => comInicial(troca, m));
  t = semTravessao(t);
  return Vocab.limpar(t);
}

/* ---------- conferência do que sai ---------- */

/* Campos que guardam dado digitado por alguém ou vindo da plataforma (nome de campanha, serviço, endereço):
   neles só se procura sujeira técnica, não estilo. */
const CHAVES_DE_DADO = new Set([
  'nome', 'ext', 'id', 'lead_id', 'url', 'miniatura_url', 'detalhe', 'palavra', 'palavra_chave', 'termo', 'obs', 'servico', 'carro',
  'responsavel', 'ir', 'codigo', 'telefone_final', 'campanha_nome', 'conjunto_nome', 'anuncio_nome', 'pagina', 'pedido',
]);
const SUJEIRA = /\bNaN\b|\bInfinity\b|\bundefined\b|\bnull\b|\[object Object\]/;
const ESTILO = [
  [/[—–]/, 'travessão'],
  [/\b(?:CRM|CTR|CPA|CPL|CPC|CPM|ROAS|ROI)\b/, 'sigla solta'],
  [/\bleads?\b/i, 'palavra de fora (lead)'],
];

function andar(valor, caminho, chave, visita) {
  if (Array.isArray(valor)) { valor.forEach((v, i) => andar(v, `${caminho}[${i}]`, chave, visita)); return; }
  if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) andar(v, caminho ? `${caminho}.${k}` : k, k, visita);
    return;
  }
  visita(valor, caminho, chave);
}

/** Caminhos dos números que não são números de verdade (NaN, Infinity). Lista vazia = resposta limpa. */
function naoFinitos(objeto) {
  const achados = [];
  andar(objeto, '', '', (v, caminho) => { if (typeof v === 'number' && !Number.isFinite(v)) achados.push(caminho); });
  return achados;
}

/**
 * Textos com problema: sujeira técnica ("NaN", "undefined") em qualquer campo;
 * travessão, sigla solta e palavra proibida nos campos de texto de tela.
 * Devolve [{ caminho, motivo, texto }].
 */
function textosRuins(objeto, { dados = CHAVES_DE_DADO } = {}) {
  const achados = [];
  andar(objeto, '', '', (v, caminho, chave) => {
    if (typeof v !== 'string' || !v) return;
    if (SUJEIRA.test(v)) { achados.push({ caminho, motivo: 'sujeira técnica', texto: v }); return; }
    if (dados.has(chave)) return;
    for (const [re, motivo] of ESTILO) if (re.test(v)) { achados.push({ caminho, motivo, texto: v }); return; }
    const proibidas = Vocab.conferir(v);
    if (proibidas.length) achados.push({ caminho, motivo: `palavra proibida (${proibidas[0]})`, texto: v });
  });
  return achados;
}

module.exports = {
  finito, numOuNulo, dividir, arredondar, somar,
  brl, brl0, dinheiro, inteiro, plural, porcento, decimal,
  textoDaCasa, semTravessao, naoFinitos, textosRuins, CHAVES_DE_DADO,
};
