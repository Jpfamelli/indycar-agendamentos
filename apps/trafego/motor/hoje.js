/* ============================================================
   GET /api/hoje (rodada 8, frente T2a) — contrato da API §5.2.

   Duas partes:
   - montarHoje(dados): PURA. Recebe tudo já lido e devolve a resposta inteira, no formato do contrato.
   - responder({ q, pedido, fonte }): lê o que precisa em paralelo (motor/fonte.js), monta e guarda por 30 s.

   De onde vem cada coisa:
   - contatos, etapas, serviço fechado, valor: a jornada (jornada.listarBruto), na MESMA janela da tela Jornada,
     para o funil daqui bater com o de lá;
   - gasto: ads_metricas_dia no nível campanha, com a demonstração separada (motor/soma.js);
   - ritmo do mês: a projeção do núcleo (motor/nucleo.mjs, ritmoMes) com as frases de motor/ritmo.js;
   - agenda: a regra da Agenda (motor/agenda-oficina.js); conexões: motor/conexoes-estado.js.

   Decisões:
   - sem conta ligada, os campos de gasto vêm null e estado.gasto = 'sem_conta'. Gasto nunca é inventado;
   - com gasto de demonstração (estado.demo), custo por contato, custo por serviço e retorno vêm null:
     demonstração não entra em conta com dado de verdade da oficina, e a frase principal não promete retorno;
   - com ?plataforma=meta|google, tudo o que é de contato e de gasto fica só daquela plataforma;
     ritmo, agenda, conexões e "o que fazer" continuam da conta inteira.
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');
const S = require('./soma');
const Ritmo = require('./ritmo');
const Ad = require('./adaptador');
const Ag = require('./agenda-oficina');
const Fonte = require('./fonte');
const enderecos = require('../enderecos');

const MAX_FAZER = 6;
const MAX_HOJE = 30;
const MAX_ALERTAS = 3;
/** Contato de anúncio esperando resposta há mais que isto (minutos) entra em "o que fazer". */
const ESPERA_MIN = 30;
/** O motor do núcleo só precisa do mês corrente para o ritmo: 40 dias cobrem qualquer mês. */
const DIAS_DO_RITMO = 40;

const NOME_PLAT = Object.freeze({ meta: 'Meta', google: 'Google' });
const ROTULO_PLAT = Object.freeze({ meta: 'Anúncio da Meta', google: 'Anúncio do Google', anuncio: 'Anúncio (não sabemos de qual plataforma)' });
const ORDEM_GRAVIDADE = Object.freeze({ alta: 0, media: 1, baixa: 2 });
const NOME_DA_LEITURA = Object.freeze({
  metas: 'as metas', alertas: 'os alertas', rastreio: 'os cliques do site', conexoes: 'as contas de anúncio',
  whatsapp: 'a situação do WhatsApp', whatsapp_desde: 'a situação do WhatsApp', agenda: 'a agenda', agenda_capacidade: 'a agenda',
  agenda_servicos: 'a agenda', jornada: 'os detalhes dos contatos', termos: 'as palavras-chave',
});

/* ---------- entrada ---------- */

/** ?plataforma=meta|google (opcional). Outro valor é erro de entrada (400). */
function plataformaDaConsulta(q) {
  const p = q.get('plataforma');
  if (!p) return null;
  if (!S.PLATAFORMAS.includes(p)) throw P.recusar('Escolha a plataforma: meta ou google.');
  return p;
}

/** O período dentro de uma frase: "neste mês", "nos últimos 7 dias", "de 01/11 a 19/11". */
function noPeriodo(periodo) {
  switch (periodo.chave) {
    case 'hoje': return 'hoje';
    case '7d': return 'nos últimos 7 dias';
    case '30d': return 'nos últimos 30 dias';
    case '60d': return 'nos últimos 60 dias';
    case 'mes': return 'neste mês';
    case 'mes_passado': return 'no mês passado';
    default: return periodo.de === periodo.ate ? `em ${P.ddmm(periodo.de)}` : `de ${periodo.rotulo}`;
  }
}

/** "45 min", "3 h", "2 dias". */
function duracao(minutos) {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return T.plural(Math.round(m / 1440), 'dia', 'dias');
}

/** A oficina está aberta neste instante? (o expediente é o da Agenda) */
function emHorarioDeTrabalho(agora) {
  const hm = P.horaBR(new Date(agora).toISOString());
  if (!hm) return false;
  const minutos = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  return Ag.EXPEDIENTE.dias.includes(P.diaDaSemana(P.hojeBR(agora))) && minutos >= Ag.EXPEDIENTE.abre && minutos < Ag.EXPEDIENTE.fecha;
}

/* ---------- frase principal ---------- */

/**
 * A frase do topo (contrato §5.2): retorno | falta_valor | sem_conta | comeco.
 * d = { periodo, estadoGasto, ligada, gasto, contatos, anuncio, fechadosAnuncio, semValorAnuncio, faturadoAnuncio, semOrigem }
 */
function frasePrincipal(d) {
  const quando = noPeriodo(d.periodo);
  const acaoValores = { rotulo: 'Lançar valores', ir: 'jornada?pendencia=sem_valor' };
  const acaoConta = { rotulo: 'Ligar conta de anúncios', ir: 'ajustes?secao=conexoes' };
  const deAnuncio = d.anuncio === 0 ? 'Nenhum veio de anúncio.' : d.anuncio === 1 ? '1 veio de anúncio.' : `${T.inteiro(d.anuncio)} vieram de anúncio.`;
  const contagem = d.contatos ? `${T.plural(d.contatos, 'contato novo', 'contatos novos')} ${quando}. ${deAnuncio}` : `Ainda não há contatos ${quando}.`;

  if (d.estadoGasto === 'real' && d.gasto > 0) {
    const investidos = `${T.dinheiro(d.gasto)} ${d.gasto === 1 ? 'investido' : 'investidos'}`;
    if (d.faturadoAnuncio > 0) {
      const falta = d.semValorAnuncio > 0
        ? (d.semValorAnuncio === 1 ? ' Falta o valor de 1 serviço: o retorno pode ser maior.' : ` Faltam os valores de ${T.inteiro(d.semValorAnuncio)} serviços: o retorno pode ser maior.`)
        : '';
      return { tipo: 'retorno',
        texto: `Cada R$ 1 em anúncio virou ${T.brl(d.faturadoAnuncio / d.gasto)} na oficina.`,
        apoio: `${investidos}, ${T.dinheiro(d.faturadoAnuncio)} em serviços fechados que vieram de anúncio.${falta}`,
        acao: falta ? acaoValores : null };
    }
    if (d.fechadosAnuncio > 0) {
      return { tipo: 'falta_valor',
        texto: `${investidos} trouxeram ${T.plural(d.anuncio, 'contato', 'contatos')}. Falta lançar o valor de ${T.plural(d.fechadosAnuncio, 'serviço', 'serviços')} para saber o retorno.`,
        apoio: 'Com os valores lançados, a tela mostra quanto cada real investido trouxe de volta.',
        acao: acaoValores };
    }
    if (d.anuncio > 0) {
      return { tipo: 'retorno',
        texto: `${investidos} trouxeram ${T.plural(d.anuncio, 'contato de anúncio', 'contatos de anúncio')}. Nenhum virou serviço fechado ainda.`,
        apoio: 'O retorno aparece quando o primeiro serviço que veio de anúncio for fechado e tiver o valor lançado.',
        acao: null };
    }
    return { tipo: 'retorno',
      texto: `${investidos} e nenhum contato de anúncio chegou à oficina ${quando}.`,
      apoio: d.semOrigem > 0
        ? `${d.semOrigem === 1 ? '1 contato está' : `${T.inteiro(d.semOrigem)} contatos estão`} sem origem: parte pode ter vindo de anúncio.`
        : 'Confira se o WhatsApp dos anúncios é o da oficina.',
      acao: d.semOrigem > 0 ? { rotulo: 'Marcar origem', ir: 'jornada?pendencia=sem_origem' } : { rotulo: 'Ver campanhas', ir: 'campanhas' } };
  }

  if (d.estadoGasto === 'sem_conta' || d.estadoGasto === 'demo') {
    if (!d.contatos && d.estadoGasto === 'sem_conta') {
      return { tipo: 'comeco', texto: contagem,
        apoio: 'Os primeiros passos: ligar o WhatsApp da oficina, o site e a conta de anúncios.',
        acao: { rotulo: 'Ver primeiros passos', ir: 'ajustes?secao=conexoes' } };
    }
    return { tipo: 'sem_conta', texto: contagem,
      apoio: d.estadoGasto === 'demo'
        ? 'Os números de anúncio desta tela são de demonstração. Ligue a conta para ver os da oficina.'
        : 'Ligue a conta de anúncios para ver quanto foi investido e o retorno de cada campanha.',
      acao: acaoConta };
  }

  // conta ligada sem número neste período, ou período sem gasto nenhum
  const semNumero = d.estadoGasto === 'sem_dados';
  return { tipo: 'comeco', texto: contagem,
    apoio: semNumero
      ? (d.ligada ? 'A conta de anúncios está ligada, mas ainda não chegou número deste período.' : 'Não há número de anúncio neste período.')
      : 'Os anúncios não tiveram gasto neste período.',
    acao: semNumero ? { rotulo: 'Ver conexões', ir: 'ajustes?secao=conexoes' } : null };
}

/* ---------- os quatro números ---------- */

function numero({ id, rotulo, formato, valor, antes, serie, apoio, subirEBom }) {
  const variacao = S.variar(valor, antes);
  const sentido = !subirEBom || variacao == null ? 'neutro' : variacao > 0.02 ? 'bom' : variacao < -0.02 ? 'ruim' : 'neutro';
  return { id, rotulo, valor, formato, apoio, antes, variacao, sentido, serie };
}

/* ---------- origens ---------- */

/** Uma linha por origem com contato no período (e por plataforma que gastou sem trazer contato), pagas primeiro. */
function origensDoPeriodo(itens, gP) {
  const gastoDe = pl => (gP.conhecido && S.PLATAFORMAS.includes(pl) ? S.somaDasLinhas(gP.linhas.filter(l => l.plataforma === pl)).gasto : null);
  const linha = (id, rotulo, paga, lista, pl) => {
    const r = S.resumo(lista), gasto = pl ? gastoDe(pl) : null;
    const gastoReal = gP.tipo === 'real' ? gasto : null;       // demonstração não entra em conta com dado da oficina
    return { id, rotulo, paga, contatos: r.contatos, fecharam: r.fecharam, faturado: r.faturado, gasto,
      custo_por_contato: T.arredondar(T.dividir(gastoReal, r.contatos)),
      retorno: gastoReal > 0 ? T.arredondar(T.dividir(r.faturado, gastoReal)) : null };
  };
  const grupos = S.agrupar(itens, i => { const pl = S.plataformaDe(i); return pl ? `p|${pl}` : `n|${(i.origem && i.origem.canal) || 'desconhecida'}`; });
  const linhas = [], vistas = new Set();
  for (const [chave, lista] of grupos) {
    const paga = chave.startsWith('p|'), canal = chave.slice(2);
    const o = lista[0].origem || {};
    if (paga) {
      vistas.add(canal);
      linhas.push(linha(canal, o.rotulo || ROTULO_PLAT[canal], true, lista, canal));
    } else {
      const id = S.PLATAFORMAS.includes(canal) ? `${canal}_sem_anuncio` : canal;
      linhas.push(linha(id, o.rotulo || 'Ainda não sabemos', o.paga === false ? false : null, lista, null));
    }
  }
  // plataforma que gastou e não trouxe contato nenhum não some da lista
  for (const pl of S.PLATAFORMAS) if (!vistas.has(pl) && gastoDe(pl) > 0) linhas.push(linha(pl, ROTULO_PLAT[pl], true, [], pl));
  return linhas.sort((a, b) => (a.paga === true ? 0 : 1) - (b.paga === true ? 0 : 1) || b.contatos - a.contatos || String(a.id).localeCompare(String(b.id)));
}

/* ---------- o que fazer agora ---------- */

const doLadoDaOficina = a => /^ciclo_/.test(String((a && a.metrica) || '')) || /^(crm|ciclo)[|]/.test(String((a && a.chave) || ''));
const GRAVIDADE_DO_ALERTA = Object.freeze({ critico: 'alta', alerta: 'media', info: 'baixa' });

/**
 * A lista "o que fazer agora": no máximo 6, do mais importante para o menos.
 * Ordem: gravidade (alta, média, baixa) e, dentro dela, WhatsApp parado, contato esperando, radar, conta de anúncio,
 * pendências e agenda.
 */
function oQueFazer({ agora, conexoes = null, alertas = [], itens = [], esperando = [], estadoGasto, respostas = 'ok', agenda = null, jaTeveNumero = false, incompleto = [] }) {
  const lista = [];
  const por = (ordem, item) => lista.push({ ordem, ...item });
  const atendimento = { rotulo: 'Abrir o Atendimento', ir: enderecos.caminhoNaCentral('atendimento', { aba: 'integracoes' }) };
  const verConexoes = 'ajustes?secao=conexoes';

  const wa = conexoes && conexoes.whatsapp;
  const waLido = !incompleto.includes('whatsapp');
  if (wa && waLido && wa.situacao === 'chave_recusada') {
    por(0, { id: 'whatsapp_parado', gravidade: 'alta', origem: 'conexao',
      titulo: `O WhatsApp automático está parado${wa.desde ? ` desde ${P.ddmm(wa.desde)}` : ''}`,
      porque: 'Lembretes e respostas não estão saindo. Só o dono da conta consegue gerar a chave nova.', acao: atendimento });
  } else if (wa && waLido && wa.situacao === 'sem_noticia') {
    por(1, { id: 'whatsapp_sem_noticia', gravidade: 'alta', origem: 'conexao', titulo: 'O WhatsApp da oficina parou de dar notícia',
      porque: wa.aviso || 'Nenhuma mensagem chega ao sistema.', acao: atendimento });
  } else if (wa && waLido && wa.situacao === 'sem_aparelho') {
    por(6, { id: 'whatsapp_desligado', gravidade: 'media', origem: 'conexao', titulo: 'O WhatsApp da oficina não está ligado ao sistema',
      porque: 'Sem ele o sistema não vê as conversas nem manda lembretes.', acao: atendimento });
  }

  // contato de anúncio esperando: só quando as respostas estão sendo registradas e a oficina está aberta
  const naFila = (esperando || []).filter(i => S.deAnuncio(i) && (T.numOuNulo(i.espera_min) || 0) > ESPERA_MIN && !S.fechou(i) && !S.naoFechou(i));
  if (naFila.length && respostas === 'ok' && wa && wa.situacao === 'ok' && emHorarioDeTrabalho(agora)) {
    const maior = Math.max(...naFila.map(i => i.espera_min));
    por(2, { id: 'sem_resposta', gravidade: 'alta', origem: 'resposta',
      titulo: T.plural(naFila.length, 'contato de anúncio esperando resposta', 'contatos de anúncio esperando resposta'),
      porque: `${naFila.length === 1 ? 'Espera' : 'O mais antigo espera'} há ${duracao(maior)}. Quem responde rápido fecha mais.`,
      acao: { rotulo: 'Ver quem espera', ir: 'jornada?pendencia=sem_resposta' } });
  }

  // radar: sem gasto de verdade, só valem os alertas do lado da oficina (os outros nasceram de número que não é real)
  const ordemSev = { critico: 0, alerta: 1, info: 2 };
  const usaveis = (alertas || []).filter(a => a && (estadoGasto === 'real' || doLadoDaOficina(a)))
    .sort((a, b) => (ordemSev[a.severidade] ?? 3) - (ordemSev[b.severidade] ?? 3) || String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
  for (const a of usaveis.slice(0, MAX_ALERTAS)) {
    por(3, { id: `radar_${a.id}`, gravidade: GRAVIDADE_DO_ALERTA[a.severidade] || 'media', origem: 'radar',
      titulo: T.textoDaCasa(a.regra_nome || 'Alerta do radar'), porque: T.textoDaCasa(a.mensagem || ''),
      acao: doLadoDaOficina(a) ? { rotulo: 'Ver na Jornada', ir: 'jornada' } : { rotulo: 'Ver campanhas', ir: a.plataforma && S.PLATAFORMAS.includes(a.plataforma) ? `campanhas?plataforma=${a.plataforma}` : 'campanhas' } });
  }

  for (const pl of S.PLATAFORMAS) {
    const c = conexoes && conexoes[pl];
    if (!c || incompleto.includes('conexoes')) continue;
    const de = pl === 'meta' ? 'da Meta' : 'do Google';
    if (c.situacao === 'token_vencendo') {
      por(4, { id: `conexao_${pl}`, gravidade: 'media', origem: 'conexao', titulo: `O acesso ${de} está vencendo`, porque: c.aviso, acao: { rotulo: 'Renovar acesso', ir: verConexoes } });
    } else if (c.situacao === 'erro' && jaTeveNumero) {
      por(4, { id: `conexao_${pl}`, gravidade: 'alta', origem: 'conexao', titulo: `A coleta ${de} parou`, porque: c.aviso, acao: { rotulo: 'Ver conexões', ir: verConexoes } });
    } else if (c.situacao === 'ok' && c.parada) {
      por(4, { id: `conexao_${pl}`, gravidade: 'alta', origem: 'conexao', titulo: `A coleta ${de} está atrasada`, porque: c.aviso, acao: { rotulo: 'Ver conexões', ir: verConexoes } });
    }
  }

  const quantos = id => (itens || []).filter(i => S.temPendencia(i, id)).length;
  const semValor = quantos('sem_valor'), semOrigem = quantos('sem_origem'), semMotivo = quantos('sem_motivo');
  if (semValor) {
    por(5, { id: 'sem_valor', gravidade: estadoGasto === 'real' ? 'alta' : 'media', origem: 'pendencia',
      titulo: T.plural(semValor, 'serviço fechado sem valor', 'serviços fechados sem valor'),
      porque: 'Sem o valor não dá para saber o retorno de cada anúncio.', acao: { rotulo: 'Lançar agora', ir: 'jornada?pendencia=sem_valor' } });
  }
  if (semOrigem) {
    por(5, { id: 'sem_origem', gravidade: 'media', origem: 'pendencia', titulo: T.plural(semOrigem, 'contato sem origem', 'contatos sem origem'),
      porque: 'Sem saber de onde veio o contato não dá para dizer qual anúncio funciona.', acao: { rotulo: 'Marcar origem', ir: 'jornada?pendencia=sem_origem' } });
  }
  if (semMotivo) {
    por(5, { id: 'sem_motivo', gravidade: 'baixa', origem: 'pendencia',
      titulo: T.plural(semMotivo, 'contato não fechou e está sem motivo', 'contatos não fecharam e estão sem motivo'),
      porque: 'Saber por que não fechou mostra o que ajustar: preço, prazo ou atendimento.', acao: { rotulo: 'Marcar motivo', ir: 'jornada?pendencia=sem_motivo' } });
  }

  if (agenda && agenda.situacao === 'cheia' && estadoGasto === 'real') {
    por(7, { id: 'agenda_cheia', gravidade: 'media', origem: 'agenda', titulo: 'Agenda cheia nos próximos dias', porque: agenda.leitura, acao: { rotulo: 'Ver campanhas', ir: 'campanhas' } });
  } else if (agenda && agenda.situacao === 'vazia') {
    por(7, { id: 'agenda_vazia', gravidade: 'baixa', origem: 'agenda', titulo: 'Agenda com folga nos próximos dias', porque: agenda.leitura,
      acao: estadoGasto === 'real' ? { rotulo: 'Ver campanhas', ir: 'campanhas' } : { rotulo: 'Ligar conta de anúncios', ir: verConexoes } });
  }

  return lista
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade] || a.ordem - b.ordem || a.i - b.i)
    .slice(0, MAX_FAZER)
    .map(({ ordem, i, ...item }) => item);
}

/* ---------- a resposta ---------- */

/** Frase para a tela quando alguma leitura falhou (a tela segue com o que deu para ler). */
function avisoDeIncompleto(incompleto, reserva) {
  const nomes = [...new Set((incompleto || []).map(n => NOME_DA_LEITURA[n]).filter(Boolean))];
  const partes = [];
  if (nomes.length) partes.push(`Não deu para ler agora: ${nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0]}.`);
  if (reserva) partes.push('Os contatos vêm só do cadastro: sem agenda, orçamento, pátio nem resposta da oficina.');
  return partes.length ? partes.join(' ') : null;
}

/**
 * Monta a resposta de /api/hoje. PURA: recebe
 *   periodo ({ de, ate, rotulo, anterior, chave }), plataforma (meta | google | null), hoje (dia de Brasília), agora (ms),
 *   contatos { periodo, anterior, mes } (itens da jornada), reserva, estadoJornada ({ respostas, respostas_texto } | null),
 *   linhas (ads_metricas_dia, nível campanha, cobrindo período, período anterior e mês corrente), haReal,
 *   config (metas), alertas (não lidos), conexoes, agenda, nucleoRitmo (M.ritmoMes(M.R) | null), incompleto (leituras que falharam).
 */
function montarHoje(d) {
  const { periodo, plataforma = null, hoje, agora } = d;
  const contatos = d.contatos || {};
  const itens = S.daPlataforma(contatos.periodo, plataforma);
  const antes = S.daPlataforma(contatos.anterior, plataforma);
  const doMes = contatos.mes || [];
  const pagos = itens.filter(S.deAnuncio);
  const r = S.resumo(itens), rAn = S.resumo(pagos), rAntes = S.resumo(antes);
  const config = d.config || {}, conexoes = d.conexoes || {}, incompleto = d.incompleto || [];
  const haReal = !!d.haReal;

  /* gasto do período e do período anterior, sem demonstração misturada */
  const linhas = S.linhasDaPlataforma(d.linhas, plataforma);
  const gP = S.gastoDoTrecho(S.linhasEntre(linhas, periodo.de, periodo.ate), { haReal });
  const gA = S.gastoDoTrecho(S.linhasEntre(linhas, periodo.anterior.de, periodo.anterior.ate), { haReal });
  const estadoGasto = S.estadoDoGasto(gP.tipo, { haReal, conexoes });
  const gasto = gP.conhecido ? S.somaDasLinhas(gP.linhas).gasto : null;
  const gastoAntes = gA.conhecido && gA.tipo === gP.tipo ? S.somaDasLinhas(gA.linhas).gasto : null;
  const gastoReal = gP.tipo === 'real' ? gasto : null;
  const ligada = !!((conexoes.meta && conexoes.meta.ligado) || (conexoes.google && conexoes.google.ligado));

  /* estado */
  const eC = S.estadoDosContatos(itens);
  const ej = d.estadoJornada || null;
  const semRegistro = !!d.reserva || itens.some(S.respostaDesconhecida) || !!(ej && ej.respostas === 'sem_registro');
  const respostas = ej && ej.respostas === 'indisponivel' ? 'indisponivel' : semRegistro ? 'sem_registro' : 'ok';
  const estado = {
    gasto: estadoGasto, valores: eC.valores, origem: eC.origem, demo: estadoGasto === 'demo',
    // a mais do contrato
    respostas, respostas_texto: (ej && ej.respostas_texto) || null,
    incompleto: incompleto.slice(), reserva: !!d.reserva, aviso: avisoDeIncompleto(incompleto, d.reserva),
  };

  /* frase */
  const semOrigem = itens.filter(i => S.temPendencia(i, 'sem_origem')).length;
  const frase = frasePrincipal({ periodo, estadoGasto, ligada, gasto, contatos: r.contatos, anuncio: rAn.contatos,
    fechadosAnuncio: rAn.fecharam, semValorAnuncio: rAn.sem_valor, faturadoAnuncio: rAn.faturado || 0, semOrigem });

  /* os quatro números */
  const dias = P.diasEntre(periodo.de, periodo.ate);
  const cDia = S.porDia(itens), gDia = gP.conhecido ? S.gastoPorDia(gP.linhas) : null;
  const doDia = (dia, campo) => { const x = cDia.get(dia); return x ? x[campo] : 0; };
  const porPlat = gP.conhecido ? S.PLATAFORMAS.map(pl => ({ pl, g: S.somaDasLinhas(gP.linhas.filter(l => l.plataforma === pl)).gasto })).filter(x => x.g > 0) : [];
  let apoioInvestido;
  if (!gP.conhecido) apoioInvestido = estadoGasto === 'sem_conta' ? 'Conta de anúncios não ligada' : 'Sem número de anúncio neste período';
  else if (gP.tipo === 'demo') apoioInvestido = 'Número de demonstração';
  else if (!porPlat.length) apoioInvestido = 'Sem gasto neste período';
  else if (porPlat.length === 1) apoioInvestido = porPlat[0].pl === 'meta' ? 'Tudo na Meta' : 'Tudo no Google';
  else apoioInvestido = porPlat.map(x => `${NOME_PLAT[x.pl]} ${T.dinheiro(x.g)}`).join(' · ');
  const faltaValor = r.sem_valor ? `falta o valor de ${T.plural(r.sem_valor, 'serviço', 'serviços')}` : '';
  let apoioFaturado;
  if (r.faturado == null) apoioFaturado = `Falta o valor de ${T.plural(r.sem_valor, 'serviço', 'serviços')}`;
  else {
    const deAnuncio = rAn.faturado != null ? `${T.dinheiro(rAn.faturado)} de anúncio` : 'serviços de anúncio ainda sem valor';
    apoioFaturado = faltaValor ? `${deAnuncio} · ${faltaValor}` : deAnuncio;
  }
  const numeros = [
    numero({ id: 'investido', rotulo: 'Investido em anúncio', formato: 'dinheiro', valor: gasto, antes: gastoAntes, apoio: apoioInvestido, subirEBom: false,
      serie: gDia ? dias.map(dia => T.arredondar(gDia.get(dia) || 0)) : [] }),
    numero({ id: 'contatos', rotulo: 'Contatos', formato: 'inteiro', valor: r.contatos, antes: rAntes.contatos, apoio: `${T.inteiro(rAn.contatos)} de anúncio`, subirEBom: true,
      serie: dias.map(dia => doDia(dia, 'total')) }),
    numero({ id: 'fechados', rotulo: 'Serviços fechados', formato: 'inteiro', valor: r.fecharam, antes: rAntes.fecharam, apoio: `${T.inteiro(rAn.fecharam)} de anúncio`, subirEBom: true,
      serie: dias.map(dia => doDia(dia, 'fecharam')) }),
    numero({ id: 'faturado', rotulo: 'Faturado', formato: 'dinheiro', valor: r.faturado, antes: rAntes.faturado, apoio: apoioFaturado, subirEBom: true,
      serie: dias.map(dia => T.arredondar(doDia(dia, 'faturado'))) }),
  ];

  /* contas derivadas (gasto de demonstração não entra em conta com dado da oficina) */
  const derivados = {
    custo_por_contato: T.arredondar(T.dividir(gastoReal, rAn.contatos)),
    custo_por_servico: T.arredondar(T.dividir(gastoReal, rAn.fecharam)),
    retorno: gastoReal > 0 ? T.arredondar(T.dividir(rAn.faturado, gastoReal)) : null,
    ticket_medio: T.arredondar(T.dividir(r.faturado, r.com_valor)),
    taxa_fechamento: T.arredondar(T.dividir(r.fecharam, r.contatos), 4),
    tempo_resposta_min: S.tempoDeResposta(itens),
    taxa_falta: S.taxaDeFalta(itens, agora),
  };

  /* ritmo do mês corrente (da conta inteira) */
  const mesDe = P.inicioDoMes(hoje);
  const gM = S.gastoDoTrecho(S.linhasEntre(d.linhas, mesDe, hoje), { haReal });
  const ritmo = Ritmo.ritmoDoMes({ hoje, orcamento: config.orcamento_mensal, nucleo: d.nucleoRitmo || null,
    gastoPorDia: gM.conhecido ? S.gastoPorDia(gM.linhas) : null, ultimoDiaColetado: gM.conhecido ? S.ultimoDia(gM.linhas) : null,
    contatosPorDia: S.porDia(doMes) });

  /* quem chegou hoje */
  const instante = i => { const t = Date.parse(String(i.chegou_em ?? '')); return Number.isFinite(t) ? t : 0; };
  const chegaramHoje = S.daPlataforma(doMes.filter(i => S.diaDe(i) === hoje), plataforma)
    .sort((a, b) => instante(b) - instante(a)).slice(0, MAX_HOJE)
    .map(i => ({ lead_id: i.lead_id, nome: i.nome ?? null, hora: P.horaBR(i.chegou_em), origem: i.origem || null, etapa_atual: i.etapa_atual || 'contato', espera_min: T.numOuNulo(i.espera_min),
      // a mais do contrato (integração r8): o que os mini-setores da tela leem, vindo da jornada
      etapas: Array.isArray(i.etapas) ? i.etapas : [], desfecho: i.desfecho || null, pendencias: Array.isArray(i.pendencias) ? i.pendencias : [] }));

  /* o que fazer agora */
  const vistos = new Set(), esperando = [];
  for (const i of [...(contatos.periodo || []), ...doMes]) if (i && !vistos.has(i.lead_id)) { vistos.add(i.lead_id); esperando.push(i); }
  const fazer = oQueFazer({ agora, conexoes, alertas: d.alertas || [], itens: contatos.periodo || [], esperando, estadoGasto, respostas,
    agenda: d.agenda || null, jaTeveNumero: haReal, incompleto });

  const agenda = d.agenda ? { dias: d.agenda.dias, leitura: d.agenda.leitura, situacao: d.agenda.situacao, ocupacao_media: d.agenda.ocupacao_media ?? null } : { dias: [], leitura: 'Não deu para ler a agenda agora.', situacao: 'indisponivel', ocupacao_media: null };

  return {
    periodo: { de: periodo.de, ate: periodo.ate, rotulo: periodo.rotulo, anterior: { de: periodo.anterior.de, ate: periodo.anterior.ate } },
    estado, frase, numeros, derivados, fazer, ritmo,
    funil: S.funil(itens),
    origens: origensDoPeriodo(itens, gP),
    hoje: chegaramHoje,
    agenda,
    conexoes: { meta: conexoes.meta || null, google: conexoes.google || null, site: conexoes.site || null, whatsapp: conexoes.whatsapp || null },
    // a mais do contrato
    plataforma,
    gerado_em: new Date(agora).toISOString(),
  };
}

/* ---------- leitura ---------- */

/**
 * As janelas de métricas que /api/hoje precisa: do começo do período anterior ao fim do período, e o mês corrente.
 * Quando as duas se tocam (o caso de sempre), vira uma leitura só.
 */
function janelasDeMetricas(periodo, mes) {
  const a = { de: periodo.anterior.de < periodo.de ? periodo.anterior.de : periodo.de, ate: periodo.ate };
  if (mes.de <= P.somarDias(a.ate, 1) && a.de <= P.somarDias(mes.ate, 1)) return [{ de: a.de < mes.de ? a.de : mes.de, ate: a.ate > mes.ate ? a.ate : mes.ate }];
  return [a, { de: mes.de, ate: mes.ate }];
}

const medirCom = pedido => (nome, fn) => (pedido && typeof pedido.medir === 'function' ? pedido.medir(nome, fn) : fn());

/** Lê tudo em paralelo e monta. `periodo` já validado; `fonte` é a de motor/fonte.js. */
async function carregarEMontar({ periodo, plataforma = null, fonte, fresco = false, pedido = null }) {
  const o = { fresco }, medir = medirCom(pedido);
  const hoje = fonte.hoje(), agora = fonte.agora();
  const mes = { de: P.inicioDoMes(hoje), ate: hoje };
  const mesmoMes = mes.de === periodo.de && mes.ate === periodo.ate;
  const [paginas, haReal, doPeriodo, doAnterior, doMes, config, alertas, conexoes, agenda] = await Promise.all([
    medir('metricas', () => Promise.all(janelasDeMetricas(periodo, mes).map(j => fonte.metricas({ de: j.de, ate: j.ate, niveis: ['campanha'] }, o)))),
    medir('ha_real', () => fonte.haReal(o)),
    medir('contatos', () => fonte.contatos({ de: periodo.de, ate: periodo.ate }, o)),
    medir('contatos_antes', () => fonte.contatos({ de: periodo.anterior.de, ate: periodo.anterior.ate }, o)),
    mesmoMes ? null : medir('contatos_mes', () => fonte.contatos(mes, o)),
    medir('metas', () => fonte.config(o)),
    medir('alertas', () => fonte.alertas(o)),
    medir('conexoes', () => fonte.conexoes(o)),
    medir('agenda', () => fonte.agenda(o)),
  ]);
  const linhas = paginas.flat();
  const mesContatos = mesmoMes ? doPeriodo : doMes;

  // o ritmo vem do núcleo, que trabalha com dias fechados: precisa de pelo menos um dia do mês já passado
  let nucleoRitmo = null;
  const gM = S.gastoDoTrecho(S.linhasEntre(linhas, mes.de, mes.ate), { haReal });
  if (gM.conhecido && hoje > mes.de) {
    nucleoRitmo = await medir('motor', async () => {
      const { M } = await Ad.montarMotor({ metricas: gM.linhas, contatos: [], config, hoje, dias: DIAS_DO_RITMO });
      return M.ritmoMes(M.R);
    });
  }

  return montarHoje({
    periodo, plataforma, hoje, agora,
    contatos: { periodo: doPeriodo.itens, anterior: doAnterior.itens, mes: mesContatos.itens },
    reserva: doPeriodo.reserva, estadoJornada: doPeriodo.estado,
    linhas, haReal, config, alertas, conexoes, agenda, nucleoRitmo, incompleto: fonte.falhas(),
  });
}

/**
 * A resposta de GET /api/hoje para uma consulta (URLSearchParams). Guardada por 30 s por período e plataforma;
 * ?fresco=1 lê de novo. Também é o que a porta da IA chama para o resumo do período.
 */
function responder({ q = new URLSearchParams(), pedido = null, fonte = Fonte.padrao() } = {}) {
  const periodo = P.periodoDaConsulta(q, { hoje: fonte.hoje() });
  const plataforma = plataformaDaConsulta(q);
  const fresco = q.get('fresco') === '1';
  return fonte.guardar(`hoje|${periodo.de}|${periodo.ate}|${plataforma || ''}`, (r) => carregarEMontar({ periodo, plataforma, fonte, fresco: fresco || !!(r && r.renovando), pedido: r && r.renovando ? null : pedido }), { fresco });
}

module.exports = {
  MAX_FAZER, MAX_HOJE, ESPERA_MIN,
  plataformaDaConsulta, noPeriodo, duracao, emHorarioDeTrabalho, frasePrincipal, origensDoPeriodo, oQueFazer, avisoDeIncompleto,
  montarHoje, janelasDeMetricas, carregarEMontar, responder,
};
