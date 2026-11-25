/* ============================================================================
   Contas de tela da rodada 12 (sem DOM; testadas em _testes/r12-tela.test.mjs).
   Gasto, contatos, clientes e valores vêm prontos da API. Aqui só se junta
   (somar os dias das campanhas), se divide para mostrar a passagem de uma
   etapa para a outra e se dá nome às coisas. "Não sei" continua null.
   ============================================================================ */

import { ehNumero, inteiro, partesDaData } from './formato.js';

/** a / b, só quando os dois são número e b > 0. */
export function fracao(a, b) {
  return ehNumero(a) && ehNumero(b) && b > 0 ? a / b : null;
}

const NOME_DA_FONTE = { meta: 'Meta', google: 'Google' };

/**
 * O herói da Visão geral, a partir de `totais` de GET api/campanhas.
 * Devolve os três números do funil (conversas, agendaram, clientes), a passagem entre eles,
 * o dinheiro (faturado e retorno) e a frase em pedaços: { texto } e { numero }.
 */
export function heroi(totais, fonte = '') {
  const t = totais || {};
  const conversas = ehNumero(t.contatos) ? t.contatos : null;
  const agendaram = ehNumero(t.agendaram) ? t.agendaram : null;
  const clientes = ehNumero(t.fecharam) ? t.fecharam : null;
  const quem = fonte === 'meta' ? 'Os anúncios da Meta' : fonte === 'google' ? 'Os anúncios do Google' : 'Os anúncios';
  const frase = conversas
    ? [{ texto: quem + ' trouxeram ' }, { numero: inteiro(conversas), valor: conversas }, { texto: conversas === 1 ? ' conversa no WhatsApp, ' : ' conversas no WhatsApp, ' },
      { numero: inteiro(agendaram || 0), valor: agendaram || 0 }, { texto: agendaram === 1 ? ' agendamento e ' : ' agendamentos e ' },
      { numero: inteiro(clientes || 0), valor: clientes || 0 }, { texto: clientes === 1 ? ' cliente na oficina.' : ' clientes na oficina.' }]
    : [{ texto: (fonte ? quem : 'Os anúncios') + ' ainda não trouxeram conversa neste período.' }];
  return {
    frase,
    etapas: [
      { id: 'conversas', rotulo: 'Conversas no WhatsApp', valor: conversas },
      { id: 'agendaram', rotulo: 'Agendaram', valor: agendaram, passagem: fracao(agendaram, conversas) },
      { id: 'clientes', rotulo: 'Viraram clientes', valor: clientes, passagem: fracao(clientes, agendaram) },
    ],
    vieram: ehNumero(t.vieram) ? t.vieram : null,
    gasto: ehNumero(t.gasto) ? t.gasto : null,
    faturado: ehNumero(t.faturado) ? t.faturado : null,
    retorno: ehNumero(t.retorno) ? t.retorno : null,
    custo_por_cliente: ehNumero(t.custo_por_servico) ? t.custo_por_servico : null,
    custo_por_conversa: ehNumero(t.custo_por_contato) ? t.custo_por_contato : null,
    nome_da_fonte: NOME_DA_FONTE[fonte] || null,
  };
}

/**
 * Os dias do período, somando a série de cada campanha (GET api/campanhas, campo `serie`):
 * [{ data, meta, google, gasto, contatos }]. Gasto do dia null quando nenhuma campanha sabe o gasto dele.
 */
export function somarDias(campanhas) {
  const dias = new Map();
  for (const c of Array.isArray(campanhas) ? campanhas : []) {
    if (!c || !Array.isArray(c.serie)) continue;
    const plat = c.plataforma === 'google' ? 'google' : c.plataforma === 'meta' ? 'meta' : null;
    for (const d of c.serie) {
      if (!d || !partesDaData(d.data)) continue;
      if (!dias.has(d.data)) dias.set(d.data, { data: d.data, meta: null, google: null, gasto: null, contatos: 0 });
      const dia = dias.get(d.data);
      if (ehNumero(d.gasto)) {
        dia.gasto = arred((dia.gasto || 0) + d.gasto);
        if (plat) dia[plat] = arred((dia[plat] || 0) + d.gasto);
      }
      if (ehNumero(d.contatos)) dia.contatos += d.contatos;
    }
  }
  return [...dias.values()].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}
const arred = (v) => Math.round(v * 100) / 100;

/** Média dos últimos 7 valores (ou menos, no começo), para a linha de conversas não pular de dia para dia. */
export function mediaMovel(valores, janela = 7) {
  const lista = Array.isArray(valores) ? valores : [];
  return lista.map((_, i) => {
    const pedaco = lista.slice(Math.max(0, i - janela + 1), i + 1).filter(ehNumero);
    return pedaco.length ? arred(pedaco.reduce((s, v) => s + v, 0) / pedaco.length) : null;
  });
}

/** Teto "redondo" do eixo: 137 → 150, 8 → 8, 0 → 1. */
export function tetoDoEixo(maior) {
  if (!ehNumero(maior) || maior <= 0) return 1;
  if (maior <= 10) return Math.ceil(maior);
  const casa = 10 ** Math.floor(Math.log10(maior));
  for (const passo of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (passo * casa >= maior) return passo * casa;
  return 10 * casa;
}

/** Largura da barra do funil em escala de "ordem de grandeza" (impressões e clientes cabem no mesmo desenho). 0 a 1. */
export function larguraDoFunil(valor, maior) {
  if (!ehNumero(valor) || valor <= 0 || !ehNumero(maior) || maior <= 0) return 0;
  return Math.max(0.04, Math.min(1, Math.log10(valor + 1) / Math.log10(maior + 1)));
}

/** "de cada 100 que viram, 2 tocaram": quantos de cada 100 passaram. null quando não dá para dizer. */
export function deCada100(parte, todo) {
  const f = fracao(parte, todo);
  if (f == null) return null;
  return Math.round(f * 100);
}

/** As campanhas que trouxeram cliente mais barato (pelo menos 1 cliente). Empate: mais clientes primeiro. */
export function melhoresCampanhas(campanhas, quantas = 3) {
  const custo = (c) => (ehNumero(c.custo_por_servico) ? c.custo_por_servico : Infinity);
  return (Array.isArray(campanhas) ? campanhas : [])
    .filter((c) => c && ehNumero(c.fecharam) && c.fecharam > 0)
    .slice().sort((a, b) => custo(a) - custo(b) || b.fecharam - a.fecharam || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .slice(0, quantas);
}

/** Selo da campanha: o tom da API vira palavra curta. Neutro não ganha selo. */
const SELOS = { bom: ['bom', 'Boa'], atencao: ['atencao', 'Atenção'], ruim: ['grave', 'Ruim'] };
export function seloDaCampanha(campanha) {
  const tom = campanha && campanha.leitura && campanha.leitura.tom;
  return SELOS[tom] || null;
}

export const ORDENS = [
  { id: 'gasto', rotulo: 'Maior gasto' },
  { id: 'clientes', rotulo: 'Mais clientes' },
  { id: 'custo', rotulo: 'Cliente mais barato' },
];
/** Ordem da lista de campanhas. Padrão: quem gastou mais primeiro (é onde está o dinheiro). */
export function ordenarCampanhas(lista, ordem = 'gasto') {
  const v = (x, k, falta = -1) => (ehNumero(x[k]) ? x[k] : falta);
  const nome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  const regra = {
    gasto: (a, b) => v(b, 'gasto') - v(a, 'gasto') || v(b, 'contatos') - v(a, 'contatos') || nome(a, b),
    clientes: (a, b) => v(b, 'fecharam') - v(a, 'fecharam') || v(b, 'faturado') - v(a, 'faturado') || nome(a, b),
    custo: (a, b) => v(a, 'custo_por_servico', Infinity) - v(b, 'custo_por_servico', Infinity) || v(b, 'fecharam') - v(a, 'fecharam') || nome(a, b),
  }[ordem] || null;
  return (Array.isArray(lista) ? lista : []).filter(Boolean).slice().sort(regra || ((a, b) => v(b, 'gasto') - v(a, 'gasto') || nome(a, b)));
}

/* ------------------------------ clientes (jornada) ------------------------------ */

export const COLUNAS = [
  { id: 'conversa', rotulo: 'Conversando' },
  { id: 'agendou', rotulo: 'Agendou' },
  { id: 'veio', rotulo: 'Veio na oficina' },
  { id: 'fechou', rotulo: 'Fechou serviço' },
  { id: 'nao_fechou', rotulo: 'Não fechou' },
];

/** Em que coluna o contato está agora (pela etapa e pelo desfecho que a API manda). */
export function colunaDoCliente(item) {
  const tipo = item && item.desfecho && item.desfecho.tipo;
  if (tipo === 'fechou') return 'fechou';
  if (tipo === 'nao_fechou') return 'nao_fechou';
  const etapa = item && item.etapa_atual;
  if (etapa === 'veio' || etapa === 'oficina' || etapa === 'fechou') return 'veio';
  if (etapa === 'agendou') return 'agendou';
  return 'conversa';
}

const passou = (item, ids) => Array.isArray(item.etapas) && item.etapas.some((e) => ids.includes(e.id) && e.em);

/**
 * A jornada de um contato em cinco passos: anúncio → conversa → agendou → veio → valor.
 * Cada passo: { id, rotulo, feito, detalhe }. O valor só conta quando foi lançado.
 */
export function jornadaDoCliente(item) {
  const c = item || {};
  const origem = c.origem || {};
  const desfecho = c.desfecho || {};
  const fechou = desfecho.tipo === 'fechou';
  const veio = passou(c, ['veio', 'oficina']) || fechou;
  const agendou = passou(c, ['agendou']) || veio;
  return [
    { id: 'anuncio', rotulo: 'Anúncio', feito: origem.paga === true, detalhe: (origem.campanha && origem.campanha.nome) || origem.rotulo || null },
    { id: 'conversa', rotulo: 'Conversa', feito: passou(c, ['contato']) || Boolean(c.chegou_em), detalhe: null },
    { id: 'agendou', rotulo: 'Agendou', feito: agendou, detalhe: null },
    { id: 'veio', rotulo: 'Veio', feito: veio, detalhe: null },
    { id: 'valor', rotulo: 'Valor', feito: fechou && ehNumero(desfecho.valor), detalhe: fechou && !ehNumero(desfecho.valor) ? 'falta lançar' : null, valor: fechou && ehNumero(desfecho.valor) ? desfecho.valor : null },
  ];
}

/** Junta os contatos por coluna, na ordem das COLUNAS. */
export function agruparClientes(itens) {
  const grupos = new Map(COLUNAS.map((c) => [c.id, []]));
  for (const item of Array.isArray(itens) ? itens : []) if (item) grupos.get(colunaDoCliente(item)).push(item);
  return COLUNAS.map((c) => ({ ...c, itens: grupos.get(c.id) }));
}

/** Sem acento, sem maiúscula, espaços únicos: "Troca de Óleo" casa com "oleo". */
export const semAcento = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Busca na lista de clientes (nome, carro, serviço e campanha). Cada palavra digitada precisa aparecer em algum deles. */
export function filtrarClientes(itens, consulta) {
  const lista = Array.isArray(itens) ? itens : [];
  const palavras = semAcento(consulta).split(' ').filter(Boolean);
  if (!palavras.length) return lista;
  return lista.filter((c) => {
    if (!c) return false;
    const o = c.origem || {};
    const alvo = semAcento([c.nome, c.carro, c.servico, o.campanha && o.campanha.nome, o.rotulo].filter(Boolean).join(' '));
    return palavras.every((p) => alvo.includes(p));
  });
}

/* ------------------------------ radar ------------------------------ */

const PESO = { alta: 0, media: 1, baixa: 2 };
/** Avisos do radar (campo `fazer` de GET api/hoje) do mais grave para o mais leve, e o número do selo vermelho. */
export function radar(fazer) {
  const lista = (Array.isArray(fazer) ? fazer : []).filter((a) => a && a.titulo)
    .slice().sort((a, b) => (PESO[a.gravidade] ?? 3) - (PESO[b.gravidade] ?? 3));
  const urgentes = lista.filter((a) => a.gravidade === 'alta').length;
  const atencao = lista.filter((a) => a.gravidade === 'media').length;
  return { lista, urgentes, atencao, leves: lista.length - urgentes - atencao, selo: urgentes + atencao };
}

/* ------------------------------ relatório ------------------------------ */

/**
 * O texto do relatório vem no jeito do WhatsApp (*negrito*, "• item"). Vira linhas para a tela:
 * [{ tipo: 'titulo' | 'secao' | 'item' | 'texto', partes: [{ texto, forte }] }]. Linha vazia separa blocos.
 */
export function linhasDoRelatorio(texto) {
  const linhas = [];
  const brutas = String(texto == null ? '' : texto).split(/\r?\n/);
  brutas.forEach((bruta, i) => {
    const t = bruta.trim();
    if (!t) return;
    const inteiraForte = /^\*[^*]+\*$/.test(t);
    let tipo = 'texto';
    let corpo = t;
    if (inteiraForte) { tipo = linhas.length === 0 && i < 2 ? 'titulo' : 'secao'; corpo = t.slice(1, -1); }
    else if (/^[•\-–]\s+/.test(t)) { tipo = 'item'; corpo = t.replace(/^[•\-–]\s+/, ''); }
    linhas.push({ tipo, partes: inteiraForte ? [{ texto: corpo, forte: false }] : partesFortes(corpo) });
  });
  return linhas;
}
function partesFortes(texto) {
  const partes = [];
  const re = /\*([^*]+)\*/g;
  let ultimo = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push({ texto: texto.slice(ultimo, m.index), forte: false });
    partes.push({ texto: m[1], forte: true });
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), forte: false });
  return partes;
}

/* ------------------------------ sem conta de anúncios (rodada 14) ------------------------------ */

/** A conta de anúncios (Meta ou Google) não está ligada: o servidor diz em estado.gasto. */
export function semContaDe(estado) {
  return Boolean(estado) && (estado.gasto === 'sem_conta' || estado.gasto === 'sem_dados');
}

/** A frase "Ligue a conta de anúncios para ver o custo." repete em cada campanha; sem conta ela sai (o passo para ligar mora num cartão só). */
export function semPedidoDeConta(texto) {
  return String(texto || '').replace(/\s*Ligue a conta de anúncios para ver o custo\.?/gi, '').replace(/\s{2,}/g, ' ').trim();
}
