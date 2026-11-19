/* ============================================================
   GET /api/campanhas e GET /api/campanhas/:plataforma/:chave (rodada 8, frente T2a) — contrato da API §5.4.

   Duas partes, como em motor/hoje.js:
   - montarLista(dados) e montarDetalhe(dados): PURAS. Recebem tudo já lido e devolvem a resposta inteira.
   - responderLista / responderDetalhe: leem em paralelo (motor/fonte.js), montam e guardam por 30 s.

   Como cada contato entra numa campanha:
   - só contato de anúncio (origem.paga === true);
   - pelo identificador da campanha (origem.campanha.ext) na mesma plataforma; sem ele, pelo nome (sem acento,
     sem diferença de maiúscula); contato de anúncio sem plataforma conhecida procura nas duas;
   - campanha que o contato conhece e a coleta não (sem conta ligada, ou nome que veio só no rastreio ou na frase)
     entra na lista do mesmo jeito, com os campos de gasto em null ("campanhas conhecidas pelos contatos");
   - contato de anúncio sem campanha nenhuma vai para `sem_campanha`.

   Gasto: só ads_metricas_dia, demonstração separada (motor/soma.js). Com gasto de demonstração os números da
   plataforma aparecem, mas custo por contato, custo por serviço e retorno ficam null (não se mistura com dado da oficina).
   A leitura de cada campanha usa a régua do custo do Nexus Ads (motor/comparacao.js, nivelCusto) e o retorno.
   Régua do retorno (integração r8, igual ao plano de escala e às instruções do Gestor): com a margem m da oficina
   (ads_config.margem_pct), ruim abaixo de 1/m (não se paga), atenção de 1/m até 2/m, bom acima de 2/m. Sem margem
   cadastrada (nula, 0 ou 100%, que é o valor antigo de quando o campo ficava vazio) vale 45% e a frase diz que é premissa.
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');
const S = require('./soma');
const Cmp = require('./comparacao');
const H = require('./horarios');
const Fonte = require('./fonte');

/** Margem usada quando a oficina não cadastrou a dela (premissa dita na frase). */
const MARGEM_PREMISSA = 45;
const MAX_CONTATOS_DETALHE = 200;
const PLATAFORMAS_DA_ROTA = Object.freeze(['meta', 'google', 'anuncio']);

const normal = s => String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const texto = v => (v == null || !String(v).trim() ? null : String(v).trim());

/**
 * A régua do retorno pela margem: { margem_pct, premissa, ruim_abaixo, bom_acima }.
 * ruim: retorno < 1/m; atenção: de 1/m até 2/m; bom: > 2/m (m = margem em fração).
 * Margem nula, 0, negativa ou de 100% ou mais não é margem de oficina: vale a premissa de 45%.
 */
function reguaDoRetorno(margemPct) {
  const m = Number(margemPct);
  const cadastrada = margemPct != null && margemPct !== '' && Number.isFinite(m) && m > 0 && m < 100;
  const pct = cadastrada ? m : MARGEM_PREMISSA;
  return { margem_pct: pct, premissa: !cadastrada, ruim_abaixo: T.arredondar(100 / pct), bom_acima: T.arredondar(200 / pct) };
}

/** Endereço da miniatura pelo próprio app (img-src 'self'); nulo quando a coleta não trouxe imagem. */
const ID_ANUNCIO = /^[0-9A-Za-z_-]{1,40}$/;
function miniaturaDoApp(plataforma, anuncioExt, urlColetada) {
  if (!texto(urlColetada) || !['meta', 'google'].includes(plataforma) || !ID_ANUNCIO.test(String(anuncioExt || ''))) return null;
  return require('../coletor').enderecoMiniatura(plataforma, anuncioExt);
}

/* ---------- entrada ---------- */

function plataformaDaConsulta(q) {
  const p = q.get('plataforma');
  if (!p) return null;
  if (!S.PLATAFORMAS.includes(p)) throw P.recusar('Escolha a plataforma: meta ou google.');
  return p;
}

/** A chave de uma campanha no endereço: o identificador da plataforma, ou "nome:<nome>" quando só o nome é conhecido. */
const chaveDaCampanha = (ext, nome) => (texto(ext) ? String(ext).trim() : `nome:${normal(nome)}`);

/* ---------- lado da plataforma ---------- */

/** Junta as linhas de um nível por identificador: Map(chave -> { ext, nome, gasto, ..., dias: Map }). */
function juntarLinhas(linhas, campoExt, campoNome) {
  const grupos = new Map();
  for (const l of linhas || []) {
    const ext = texto(l[campoExt]);
    if (!ext) continue;
    const k = `${l.plataforma}|${ext}`;
    if (!grupos.has(k)) grupos.set(k, { plataforma: l.plataforma, ext, nome: null, linhas: [], ultimaData: '', status: null, objetivo: null, miniatura_url: null, pai: null });
    const g = grupos.get(k);
    g.linhas.push(l);
    if (l.data >= g.ultimaData) {
      g.ultimaData = l.data;
      g.nome = texto(l[campoNome]) || g.nome;
      g.status = texto(l.status) || g.status;
      g.objetivo = texto(l.objetivo) || g.objetivo;
      g.miniatura_url = texto(l.miniatura_url) || g.miniatura_url;
    }
    if (campoExt === 'anuncio_ext') g.pai = texto(l.conjunto_ext) || g.pai;
  }
  for (const g of grupos.values()) {
    g.soma = S.somaDasLinhas(g.linhas);
    g.ultimoGasto = g.linhas.reduce((m, l) => ((+l.gasto || 0) > 0 && l.data > (m || '') ? l.data : m), null);
  }
  return grupos;
}

const OBJETIVO = Object.freeze({
  OUTCOME_ENGAGEMENT: 'Conversas', MESSAGES: 'Conversas', OUTCOME_LEADS: 'Cadastros', LEAD_GENERATION: 'Cadastros',
  OUTCOME_TRAFFIC: 'Visitas ao site', LINK_CLICKS: 'Visitas ao site', OUTCOME_AWARENESS: 'Alcance', REACH: 'Alcance',
  OUTCOME_SALES: 'Vendas', CONVERSIONS: 'Vendas', SEARCH: 'Busca no Google', PERFORMANCE_MAX: 'Máximo desempenho',
  LOCAL: 'Visitas à oficina', DISPLAY: 'Banners', VIDEO: 'Vídeo',
});
const objetivoDaCasa = o => (o == null ? null : OBJETIVO[String(o).trim().toUpperCase()] || T.textoDaCasa(String(o)));

/* ---------- lado da oficina ---------- */

/** Liga cada contato de anúncio a uma campanha da coleta, a uma campanha só dos contatos, ou a nenhuma. */
function ligarContatos(pagos, campanhasDaColeta) {
  const porExt = new Map(), porNome = new Map();
  for (const c of campanhasDaColeta.values()) {
    porExt.set(`${c.plataforma}|${c.ext}`, c);
    const n = normal(c.nome);
    if (n && !porNome.has(`${c.plataforma}|${n}`)) porNome.set(`${c.plataforma}|${n}`, c);
  }
  const achar = (pl, ext, nome) => {
    const plats = pl === S.ANUNCIO ? S.PLATAFORMAS : [pl];
    for (const p of plats) if (ext && porExt.has(`${p}|${ext}`)) return porExt.get(`${p}|${ext}`);
    for (const p of plats) if (nome && porNome.has(`${p}|${normal(nome)}`)) return porNome.get(`${p}|${normal(nome)}`);
    return null;
  };
  const daColeta = new Map(), soDosContatos = new Map(), semCampanha = [];
  for (const i of pagos) {
    const pl = S.plataformaDe(i), c = S.campanhaDe(i);
    if (!c) { semCampanha.push(i); continue; }
    const achada = achar(pl, c.ext, c.nome);
    if (achada) {
      const k = `${achada.plataforma}|${achada.ext}`;
      if (!daColeta.has(k)) daColeta.set(k, []);
      daColeta.get(k).push(i);
      continue;
    }
    const k = `${pl}|${chaveDaCampanha(c.ext, c.nome)}`;
    if (!soDosContatos.has(k)) soDosContatos.set(k, { plataforma: pl, ext: c.ext, nome: c.nome || c.ext, itens: [] });
    soDosContatos.get(k).itens.push(i);
  }
  return { daColeta, soDosContatos, semCampanha };
}

/* ---------- números e leitura ---------- */

/**
 * Os números de uma linha (campanha, conjunto ou anúncio): o que a plataforma diz e o que a oficina viu.
 * `soma` null = gasto não conhecido (sem conta); `confiavel` = gasto real (custos e retorno só com ele).
 */
function numeros(soma, itens, { confiavel, oficina = true }) {
  const r = oficina ? S.resumo(itens) : { contatos: null, agendaram: null, vieram: null, fecharam: null, faturado: null, sem_valor: null };
  const gasto = soma ? soma.gasto : null, gastoReal = confiavel && soma ? soma.gasto : null;
  return {
    gasto,
    impressoes: soma ? soma.impressoes : null,
    cliques: soma ? soma.cliques : null,
    taxa_clique: soma ? T.arredondar(T.dividir(soma.cliques, soma.impressoes), 4) : null,
    custo_por_clique: soma ? T.arredondar(T.dividir(soma.gasto, soma.cliques)) : null,
    contatos_plataforma: soma ? soma.contatos_plataforma : null,
    contatos: r.contatos, agendaram: r.agendaram, vieram: r.vieram, fecharam: r.fecharam, faturado: r.faturado,
    custo_por_contato: T.arredondar(T.dividir(gastoReal, r.contatos)),
    custo_por_servico: T.arredondar(T.dividir(gastoReal, r.fecharam)),
    retorno: gastoReal > 0 && r.faturado != null ? T.arredondar(T.dividir(r.faturado, gastoReal)) : null,
    // a mais do contrato: serviços fechados sem valor (o faturado e o retorno podem ser maiores)
    sem_valor: r.sem_valor,
  };
}

/**
 * A leitura de uma campanha em uma frase, com o tom: bom | atencao | ruim | neutro.
 * `tipo` = 'real' | 'demo' | 'vazio' (gasto não conhecido); `meta` = custo por contato alvo; `minimo` = gasto mínimo para julgar;
 * `regua` = reguaDoRetorno(margem) (sem ela, a premissa de 45%).
 */
function leituraDaCampanha(n, { tipo, meta = null, minimo = Cmp.GASTO_MINIMO, regua = reguaDoRetorno(null) } = {}) {
  const faltaValor = !(n.sem_valor > 0) ? '' : n.faturado == null ? ' Falta lançar o valor dos serviços fechados.'
    : ` Falta o valor de ${T.plural(n.sem_valor, 'serviço', 'serviços')}: o retorno pode ser maior.`;
  if (tipo === 'demo') return { tom: 'neutro', texto: 'Números de demonstração: ligue a conta para ver os da oficina.' };
  if (tipo === 'sem_numero') {
    return { tom: 'neutro', texto: `${T.plural(n.contatos, 'contato chegou', 'contatos chegaram')} por esta campanha, mas a coleta não trouxe número dela neste período.${faltaValor}` };
  }
  if (tipo !== 'real' || n.gasto == null) {
    if (!n.contatos) return { tom: 'neutro', texto: 'Sem número da plataforma neste período.' };
    return { tom: 'neutro', texto: `${T.plural(n.contatos, 'contato chegou', 'contatos chegaram')} por esta campanha. Ligue a conta de anúncios para ver o custo.${faltaValor}` };
  }
  if (n.gasto < minimo) return { tom: 'neutro', texto: `Gastou ${T.dinheiro(n.gasto)} até agora: pouco para julgar.` };
  if (!n.contatos) return { tom: 'ruim', texto: `Gastou ${T.dinheiro(n.gasto)} e nenhum contato chegou à oficina.` };
  if (n.retorno != null && n.faturado > 0) {
    const virou = `cada R$ 1 virou ${T.brl(n.retorno)} em serviço fechado.`;
    const premissa = regua.premissa ? ` Conta feita com margem de ${regua.margem_pct}%, uma premissa: cadastre a margem da oficina em Ajustes.` : '';
    if (n.retorno > regua.bom_acima) return { tom: 'bom', texto: `Se paga bem: ${virou}${faltaValor}${premissa}` };
    if (n.retorno >= regua.ruim_abaixo) return { tom: 'atencao', texto: `Se paga com folga pequena: ${virou} Fica bom acima de ${T.brl(regua.bom_acima)}.${faltaValor}${premissa}` };
    return { tom: 'ruim', texto: `Ainda não se paga: ${virou} Para se pagar, precisa passar de ${T.brl(regua.ruim_abaixo)}.${faltaValor}${premissa}` };
  }
  const nivel = Cmp.nivelCusto(n.custo_por_contato, meta, n.gasto, minimo);
  const custo = `${T.dinheiro(n.custo_por_contato)} por contato`;
  const fechou = n.fecharam ? ` ${T.plural(n.fecharam, 'serviço fechado', 'serviços fechados')}.` : ' Nenhum virou serviço fechado ainda.';
  if (nivel === 'bom') return { tom: 'bom', texto: `Traz contato barato: ${custo}.${fechou}${faltaValor}` };
  if (nivel === 'atencao') return { tom: 'atencao', texto: `Custo por contato um pouco acima da meta: ${custo}.${fechou}${faltaValor}` };
  if (nivel === 'ruim') return { tom: 'ruim', texto: `Custo por contato alto: ${custo}, a meta é ${T.dinheiro(meta)}.${fechou}${faltaValor}` };
  return { tom: 'neutro', texto: `${custo}.${fechou}${faltaValor || ' Defina a meta de custo por contato em Ajustes para saber se é bom.'}` };
}

/** Série por dia do período: [{ data, gasto, contatos }] (gasto null quando não é conhecido). */
function serieDaCampanha(dias, linhas, itens) {
  const g = linhas ? S.gastoPorDia(linhas) : null, c = S.porDia(itens);
  return dias.map(data => ({ data, gasto: g ? T.arredondar(g.get(data) || 0) : null, contatos: (c.get(data) || { total: 0 }).total }));
}

const metaDe = (config, plataforma) => (plataforma === 'google' && config.cpa_alvo_google > 0 ? config.cpa_alvo_google : config.cpa_alvo) || null;

/* ---------- estado (o mesmo de /api/hoje) ---------- */

function estadoDaResposta({ tipo, haReal, conexoes, itens, incompleto = [], reserva = false }) {
  const estadoGasto = S.estadoDoGasto(tipo, { haReal, conexoes });
  const eC = S.estadoDosContatos(itens);
  return { gasto: estadoGasto, valores: eC.valores, origem: eC.origem, demo: estadoGasto === 'demo', incompleto: incompleto.slice(), reserva: !!reserva };
}

/* ---------- lista ---------- */

/**
 * Monta GET /api/campanhas. PURA. d = { periodo, plataforma, hoje, linhas (níveis campanha e conjunto), haReal,
 * itens (jornada do período), config, conexoes, incompleto, reserva }.
 */
function montarLista(d) {
  const { periodo, plataforma = null, hoje } = d;
  const config = d.config || {};
  const itens = S.daPlataforma(d.itens, plataforma);
  const pagos = itens.filter(S.deAnuncio);
  const todas = S.linhasEntre(S.linhasDaPlataforma(d.linhas, plataforma), periodo.de, periodo.ate);
  const g = S.gastoDoTrecho(todas.filter(l => l.nivel === 'campanha'), { haReal: !!d.haReal });
  const conjuntos = S.gastoDoTrecho(todas.filter(l => l.nivel === 'conjunto'), { haReal: !!d.haReal });
  const confiavel = g.tipo === 'real';
  const dias = P.diasEntre(periodo.de, periodo.ate);
  const regua = reguaDoRetorno(config.margem_pct);

  const daColeta = juntarLinhas(g.linhas, 'campanha_ext', 'campanha_nome');
  const filhosDe = new Map();
  for (const l of conjuntos.linhas) {
    const k = `${l.plataforma}|${texto(l.campanha_ext)}`, ext = texto(l.conjunto_ext);
    if (!ext) continue;
    if (!filhosDe.has(k)) filhosDe.set(k, new Set());
    filhosDe.get(k).add(ext);
  }
  const ligados = ligarContatos(pagos, daColeta);
  const contaInteira = S.somaDasLinhas(g.linhas);
  const minimo = Cmp.gastoMinimoParaJulgar(dias.length ? contaInteira.gasto / dias.length : null);

  const campanhas = [];
  for (const [k, c] of daColeta) {
    const lista = ligados.daColeta.get(k) || [];
    const n = numeros(c.soma, lista, { confiavel });
    campanhas.push({ plataforma: c.plataforma, ext: c.ext, nome: c.nome || c.ext,
      situacao: Cmp.situacaoDaCampanha({ status: c.status, ultimoGasto: c.ultimoGasto, hoje }), objetivo: objetivoDaCasa(c.objetivo),
      ...n, leitura: leituraDaCampanha(n, { tipo: g.tipo, meta: metaDe(config, c.plataforma), minimo, regua }),
      serie: serieDaCampanha(dias, c.linhas, lista), filhos: filhosDe.has(k) ? filhosDe.get(k).size : 0,
      // a mais do contrato
      chave: chaveDaCampanha(c.ext, c.nome), so_dos_contatos: false });
  }
  for (const c of ligados.soDosContatos.values()) {
    const n = numeros(null, c.itens, { confiavel: false });
    campanhas.push({ plataforma: c.plataforma, ext: c.ext || null, nome: c.nome, situacao: 'desconhecida', objetivo: null,
      ...n, leitura: leituraDaCampanha(n, { tipo: g.conhecido && g.linhas.some(l => l.plataforma === c.plataforma) ? 'sem_numero' : 'vazio' }), serie: serieDaCampanha(dias, null, c.itens), filhos: null,
      chave: chaveDaCampanha(c.ext, c.nome), so_dos_contatos: true });
  }
  campanhas.sort((a, b) => (b.gasto ?? -1) - (a.gasto ?? -1) || b.contatos - a.contatos || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const rT = numeros(g.conhecido ? contaInteira : null, pagos, { confiavel });
  const totais = { gasto: rT.gasto, impressoes: rT.impressoes, cliques: rT.cliques, contatos: rT.contatos, agendaram: rT.agendaram, vieram: rT.vieram,
    fecharam: rT.fecharam, faturado: rT.faturado, custo_por_contato: rT.custo_por_contato, custo_por_servico: rT.custo_por_servico, retorno: rT.retorno,
    contatos_plataforma: rT.contatos_plataforma };

  const rSem = S.resumo(ligados.semCampanha);
  const porPlat = S.PLATAFORMAS.map(pl => ({ plataforma: pl, gasto: S.somaDasLinhas(g.linhas.filter(l => l.plataforma === pl)).gasto,
    contatos: pagos.filter(i => S.plataformaDe(i) === pl).length, fecharam: pagos.filter(i => S.plataformaDe(i) === pl && S.fechou(i)).length }));

  return {
    periodo: { de: periodo.de, ate: periodo.ate, rotulo: periodo.rotulo, anterior: { de: periodo.anterior.de, ate: periodo.anterior.ate } },
    estado: estadoDaResposta({ tipo: g.tipo, haReal: !!d.haReal, conexoes: d.conexoes, itens, incompleto: d.incompleto, reserva: d.reserva }),
    totais, campanhas,
    sem_campanha: { contatos: rSem.contatos, fecharam: rSem.fecharam, faturado: rSem.faturado,
      texto: rSem.contatos ? 'Contatos de anúncio que não conseguimos ligar a uma campanha.' : 'Todo contato de anúncio está ligado a uma campanha.' },
    horarios: H.horariosDosContatos(itens),
    // a mais do contrato
    plataforma,
    regua_retorno: regua,
    comparacao: confiavel && !plataforma ? Cmp.comparacaoPlataformas(porPlat) : null,
    por_que_difere: Cmp.porQueDifere('plataforma', 'desistiu', ...(plataforma !== 'meta' ? ['google'] : []), 'origem'),
  };
}

/* ---------- detalhe ---------- */

/**
 * Monta GET /api/campanhas/:plataforma/:chave. PURA. d = os mesmos campos da lista + linhasDetalhe (níveis conjunto e anúncio
 * da campanha), termos ({ existe, linhas }), alvo { plataforma, chave }.
 * Devolve null quando a campanha não aparece no período (nem na coleta, nem nos contatos).
 */
function montarDetalhe(d) {
  const lista = montarLista({ ...d, plataforma: null });
  const { alvo } = d;
  const campanha = lista.campanhas.find(c => (c.plataforma === alvo.plataforma) && (c.chave === alvo.chave || (c.ext != null && String(c.ext) === alvo.chave)));
  if (!campanha) return null;

  const itens = (d.itens || []).filter(S.deAnuncio);
  const ligados = ligarContatos(itens, juntarLinhas(S.gastoDoTrecho(S.linhasEntre(d.linhas, d.periodo.de, d.periodo.ate).filter(l => l.nivel === 'campanha'), { haReal: !!d.haReal }).linhas, 'campanha_ext', 'campanha_nome'));
  const k = `${campanha.plataforma}|${campanha.so_dos_contatos ? chaveDaCampanha(campanha.ext, campanha.nome) : campanha.ext}`;
  const dela = campanha.so_dos_contatos ? ((ligados.soDosContatos.get(k) || {}).itens || []) : (ligados.daColeta.get(k) || []);

  const g = S.gastoDoTrecho(S.linhasEntre(d.linhasDetalhe || [], d.periodo.de, d.periodo.ate), { haReal: !!d.haReal });
  const confiavel = g.tipo === 'real';
  const grupos = juntarLinhas(g.linhas.filter(l => l.nivel === 'conjunto'), 'conjunto_ext', 'conjunto_nome');
  const anuncios = juntarLinhas(g.linhas.filter(l => l.nivel === 'anuncio'), 'anuncio_ext', 'anuncio_nome');
  const doContato = (i, campo) => { const o = i.origem && i.origem[campo]; return o && typeof o === 'object' ? o : null; };
  const casa = (par, ext, nome) => !!par && ((texto(par.ext) && texto(par.ext) === ext) || (!texto(par.ext) && normal(par.nome) && normal(par.nome) === normal(nome)));

  // contato que não diz o conjunto (ou o anúncio) não dá para somar por conjunto: os números da oficina ficam null, não zero
  const ligaConjunto = dela.some(i => doContato(i, 'conjunto')), ligaAnuncio = dela.some(i => doContato(i, 'anuncio'));
  const conjuntos = [...grupos.values()].map(cj => {
    const seus = dela.filter(i => casa(doContato(i, 'conjunto'), cj.ext, cj.nome));
    const filhos = [...anuncios.values()].filter(a => a.pai === cj.ext).map(a => {
      const deles = dela.filter(i => casa(doContato(i, 'anuncio'), a.ext, a.nome));
      return { ext: a.ext, nome: a.nome || a.ext, miniatura_url: miniaturaDoApp(a.plataforma, a.ext, a.miniatura_url), ...numeros(a.soma, deles, { confiavel, oficina: ligaAnuncio }) };
    }).sort((x, y) => y.gasto - x.gasto);
    return { ext: cj.ext, nome: cj.nome || cj.ext, ...numeros(cj.soma, seus, { confiavel, oficina: ligaConjunto }), anuncios: filhos };
  }).sort((x, y) => y.gasto - x.gasto);

  // palavras-chave (linha sem termo) e termos de busca (linha com termo), do Google
  const termos = d.termos && d.termos.existe ? d.termos.linhas.filter(l => l.plataforma === campanha.plataforma && texto(l.campanha_ext) === texto(campanha.ext)) : [];
  const palavras = new Map(), buscas = new Map();
  for (const l of termos) {
    if (texto(l.termo)) {
      const k2 = normal(l.termo);
      const b = buscas.get(k2) || { termo: texto(l.termo), cliques: 0, gasto: 0 };
      b.cliques += +l.cliques || 0; b.gasto += +l.gasto || 0; buscas.set(k2, b);
    } else if (texto(l.palavra_chave)) {
      const k2 = `${normal(l.palavra_chave)}|${l.correspondencia || ''}`;
      const p = palavras.get(k2) || { palavra: texto(l.palavra_chave), correspondencia: texto(l.correspondencia), gasto: 0, cliques: 0 };
      p.gasto += +l.gasto || 0; p.cliques += +l.cliques || 0; palavras.set(k2, p);
    }
  }
  const palavrasSaida = [...palavras.values()].map(p => {
    const deles = dela.filter(i => normal(i.origem && i.origem.palavra_chave) === normal(p.palavra));
    const r = S.resumo(deles);
    return { palavra: p.palavra, correspondencia: p.correspondencia, gasto: T.arredondar(p.gasto), cliques: Math.round(p.cliques),
      contatos: r.contatos, fecharam: r.fecharam, faturado: r.faturado };
  }).sort((x, y) => y.gasto - x.gasto);
  const termosSaida = [...buscas.values()].map(b => ({ termo: b.termo, cliques: Math.round(b.cliques), gasto: T.arredondar(b.gasto) }))
    .sort((x, y) => y.cliques - x.cliques || y.gasto - x.gasto).slice(0, 100);

  const recentes = dela.slice().sort((a, b) => String(b.chegou_em || '').localeCompare(String(a.chegou_em || ''))).slice(0, MAX_CONTATOS_DETALHE);
  return {
    periodo: lista.periodo,
    estado: { ...lista.estado, termos: d.termos && d.termos.existe ? 'ok' : 'sem_tabela' },
    campanha, conjuntos, palavras: palavrasSaida, termos: termosSaida, contatos: recentes,
    // a mais do contrato
    contatos_total: dela.length,
    regua_retorno: lista.regua_retorno,
  };
}

/* ---------- leitura ---------- */

const medirCom = pedido => (nome, fn) => (pedido && typeof pedido.medir === 'function' ? pedido.medir(nome, fn) : fn());

async function lerBase({ periodo, fonte, o, medir }) {
  const [linhas, haReal, contatos, config, conexoes] = await Promise.all([
    medir('metricas', () => fonte.metricas({ de: periodo.de, ate: periodo.ate, niveis: ['campanha', 'conjunto'] }, o)),
    medir('ha_real', () => fonte.haReal(o)),
    medir('contatos', () => fonte.contatos({ de: periodo.de, ate: periodo.ate }, o)),
    medir('metas', () => fonte.config(o)),
    medir('conexoes', () => fonte.conexoes(o)),
  ]);
  return { linhas, haReal, itens: contatos.itens, reserva: contatos.reserva, config, conexoes };
}

/** GET /api/campanhas: guardada por 30 s por período e plataforma; ?fresco=1 lê de novo. */
function responderLista({ q = new URLSearchParams(), pedido = null, fonte = Fonte.padrao() } = {}) {
  const periodo = P.periodoDaConsulta(q, { hoje: fonte.hoje() });
  const plataforma = plataformaDaConsulta(q);
  const fresco = q.get('fresco') === '1', o = { fresco };
  return fonte.guardar(`campanhas|${periodo.de}|${periodo.ate}|${plataforma || ''}`, async () => {
    const base = await lerBase({ periodo, fonte, o, medir: medirCom(pedido) });
    return montarLista({ periodo, plataforma, hoje: fonte.hoje(), ...base, incompleto: fonte.falhas() });
  }, o);
}

/** Lê a chave do endereço: plataforma (meta | google | anuncio) e o identificador ou "nome:<nome>". 400 se não serve. */
function alvoDoEndereco(plataforma, chaveCrua) {
  if (!PLATAFORMAS_DA_ROTA.includes(plataforma)) throw P.recusar('Escolha a plataforma: meta ou google.');
  let chave;
  try { chave = decodeURIComponent(String(chaveCrua || '')).trim(); } catch { throw P.recusar('Endereço de campanha inválido.'); }
  if (!chave || chave.length > 300) throw P.recusar('Endereço de campanha inválido.');
  return { plataforma, chave: chave.startsWith('nome:') ? `nome:${normal(chave.slice(5))}` : chave };
}

/** GET /api/campanhas/:plataforma/:chave. Devolve null quando a campanha não existe no período (a rota responde 404). */
function responderDetalhe({ plataforma, chave, q = new URLSearchParams(), pedido = null, fonte = Fonte.padrao() } = {}) {
  const alvo = alvoDoEndereco(plataforma, chave);
  const periodo = P.periodoDaConsulta(q, { hoje: fonte.hoje() });
  const fresco = q.get('fresco') === '1', o = { fresco }, medir = medirCom(pedido);
  return fonte.guardar(`campanha|${periodo.de}|${periodo.ate}|${alvo.plataforma}|${alvo.chave}`, async () => {
    const porExt = alvo.chave.startsWith('nome:') || alvo.plataforma === S.ANUNCIO ? null : alvo.chave;
    const [base, linhasDetalhe, termos] = await Promise.all([
      lerBase({ periodo, fonte, o, medir }),
      porExt ? medir('metricas_detalhe', () => fonte.metricas({ de: periodo.de, ate: periodo.ate, niveis: ['conjunto', 'anuncio'], plataforma: alvo.plataforma, campanha: porExt }, o)) : [],
      porExt && alvo.plataforma === 'google' ? medir('termos', () => fonte.termos({ de: periodo.de, ate: periodo.ate, plataforma: 'google', campanha: porExt }, o)) : { existe: false, linhas: [] },
    ]);
    return montarDetalhe({ periodo, hoje: fonte.hoje(), ...base, linhasDetalhe, termos, alvo, incompleto: fonte.falhas() });
  }, o);
}

module.exports = {
  MARGEM_PREMISSA, MAX_CONTATOS_DETALHE, reguaDoRetorno, miniaturaDoApp,
  chaveDaCampanha, juntarLinhas, ligarContatos, numeros, leituraDaCampanha, objetivoDaCasa, alvoDoEndereco,
  montarLista, montarDetalhe, responderLista, responderDetalhe,
};
