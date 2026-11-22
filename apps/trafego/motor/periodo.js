/* ============================================================
   Período das rotas novas (rodada 8, frente T2a) — contrato da API:
     ?periodo=hoje|7d|30d|60d|mes|mes_passado   (padrão: mes)
     ?de=AAAA-MM-DD&ate=AAAA-MM-DD          (vence o parâmetro periodo)
   O dia é sempre o de Brasília. Tudo aqui é puro: recebe "hoje" de fora.
   ============================================================ */
'use strict';

const FUSO = 'America/Sao_Paulo';
const DATA_ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MES_ISO = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const MAX_DIAS = 366;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO });
const FMT_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });

/** Erro de entrada: vira 400 com esta frase na resposta. */
const recusar = frase => Object.assign(new Error(frase), { status: 400, publico: true });

/** Hoje em Brasília, AAAA-MM-DD. */
const hojeBR = (agora = Date.now()) => FMT_DIA.format(new Date(agora));

/** O dia (de Brasília) de um instante. Data pura (AAAA-MM-DD) fica como está; o que não é data vira null. */
function diaBR(iso) {
  if (iso == null || iso === '') return null;
  const s = String(iso);
  if (DATA_ISO.test(s)) return s;
  const t = Date.parse(s);
  return Number.isFinite(t) ? FMT_DIA.format(new Date(t)) : null;
}

/** A hora (de Brasília) de um instante, "09:41"; null se não for data. */
function horaBR(iso) {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? FMT_HORA.format(new Date(t)).replace(/^24/, '00') : null;
}

const aoMeioDia = iso => new Date(`${iso}T12:00:00Z`);
const isoDe = d => d.toISOString().slice(0, 10);

/** Data válida de verdade (30/02 não passa). */
const dataValida = s => DATA_ISO.test(String(s || '')) && Number.isFinite(Date.parse(`${s}T12:00:00Z`)) && isoDe(aoMeioDia(s)) === s;

function somarDias(iso, n) {
  const d = aoMeioDia(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDe(d);
}

/** Quantos dias de `de` até `ate`, contando os dois. */
const contarDias = (de, ate) => Math.round((aoMeioDia(ate) - aoMeioDia(de)) / 86400000) + 1;

/** Lista de dias de `de` até `ate`, contando os dois (vazia se `de` vier depois). */
function diasEntre(de, ate) {
  const n = contarDias(de, ate), saida = [];
  for (let i = 0; i < n; i++) saida.push(somarDias(de, i));
  return saida;
}

/** 0 = domingo … 6 = sábado. */
const diaDaSemana = iso => aoMeioDia(iso).getUTCDay();
/** "sex 20" */
const rotuloDoDia = iso => `${SEMANA[diaDaSemana(iso)]} ${Number(iso.slice(8, 10))}`;

const inicioDoMes = iso => `${iso.slice(0, 7)}-01`;
const fimDoMes = iso => { const [a, m] = iso.split('-').map(Number); return isoDe(new Date(Date.UTC(a, m, 0, 12))); };
/** O mesmo dia `n` meses atrás; se o mês for mais curto, o último dia dele. */
function mesmoDiaMesesAtras(iso, n = 1) {
  const [a, m, d] = iso.split('-').map(Number);
  const primeiro = new Date(Date.UTC(a, m - 1 - n, 1, 12));
  const ultimo = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + 1, 0, 12)).getUTCDate();
  primeiro.setUTCDate(Math.min(d, ultimo));
  return isoDe(primeiro);
}

const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaaaa = iso => `${ddmm(iso)}/${iso.slice(0, 4)}`;

/**
 * Lê o período do pedido. Devolve { de, ate, rotulo, anterior: { de, ate }, chave }.
 * `chave` é o nome do período (hoje, 7d, 30d, 60d, mes, mes_passado) ou "datas".
 */
function periodoDaConsulta(q, { hoje = hojeBR() } = {}) {
  const de = q.get('de'), ate = q.get('ate');
  if (de || ate) {
    if (!dataValida(de) || !dataValida(ate) || de > ate) throw recusar('Informe datas válidas, com início antes do fim.');
    const n = contarDias(de, ate);
    if (n > MAX_DIAS) throw recusar(`Escolha no máximo ${MAX_DIAS} dias.`);
    const mesmoAno = de.slice(0, 4) === ate.slice(0, 4);
    const rotulo = de === ate ? ddmm(de) : mesmoAno ? `${ddmm(de)} a ${ddmm(ate)}` : `${ddmmaaaa(de)} a ${ddmmaaaa(ate)}`;
    return { de, ate, rotulo, anterior: { de: somarDias(de, -n), ate: somarDias(de, -1) }, chave: 'datas' };
  }
  const chave = q.get('periodo') || 'mes';
  if (chave === 'hoje') return { de: hoje, ate: hoje, rotulo: 'Hoje', anterior: { de: somarDias(hoje, -1), ate: somarDias(hoje, -1) }, chave };
  if (chave === '7d' || chave === '30d' || chave === '60d') {
    const n = Number.parseInt(chave, 10), inicio = somarDias(hoje, -(n - 1));
    return { de: inicio, ate: hoje, rotulo: `Últimos ${n} dias`, anterior: { de: somarDias(inicio, -n), ate: somarDias(inicio, -1) }, chave };
  }
  if (chave === 'mes') {
    const inicio = inicioDoMes(hoje), antes = mesmoDiaMesesAtras(hoje, 1);
    return { de: inicio, ate: hoje, rotulo: 'Este mês', anterior: { de: inicioDoMes(antes), ate: antes }, chave };
  }
  if (chave === 'mes_passado') {
    const fim = somarDias(inicioDoMes(hoje), -1), inicio = inicioDoMes(fim);
    const fimAntes = somarDias(inicio, -1);
    return { de: inicio, ate: fim, rotulo: 'Mês passado', anterior: { de: inicioDoMes(fimAntes), ate: fimAntes }, chave };
  }
  throw recusar('Escolha um período: hoje, 7d, 30d, 60d, mes ou mes_passado.');
}

/** ?mes=AAAA-MM (padrão: o mês corrente). Mês corrente vai até hoje; mês que ainda não começou é recusado. */
function mesDaConsulta(q, { hoje = hojeBR() } = {}) {
  const mes = q.get('mes') || hoje.slice(0, 7);
  if (!MES_ISO.test(mes)) throw recusar('Informe o mês no formato AAAA-MM.');
  if (mes > hoje.slice(0, 7)) throw recusar('Escolha um mês que já começou.');
  const de = `${mes}-01`, fim = fimDoMes(de), fechado = fim < hoje;
  return { mes, de, ate: fechado ? fim : hoje, rotulo: `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`, fechado };
}

module.exports = {
  FUSO, MESES, SEMANA, MAX_DIAS, recusar,
  hojeBR, diaBR, horaBR, dataValida, somarDias, contarDias, diasEntre, diaDaSemana, rotuloDoDia,
  inicioDoMes, fimDoMes, mesmoDiaMesesAtras, ddmm, ddmmaaaa, periodoDaConsulta, mesDaConsulta,
};
