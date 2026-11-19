/* ============================================================
   Agenda da oficina vista pelo Tráfego (rodada 8, frente T2a):
   ocupação dos próximos 7 dias de trabalho, para decidir se vale
   acelerar ou segurar a verba dos anúncios.

   A REGRA É A DA AGENDA (monorrepo indycar-agendamentos, arquivos só de leitura):
     horarios.js    ->  EXPEDIENTE (segunda a sábado, 8h às 17h30), duracaoDoServico, minutos
     relatorios.js  ->  MINUTOS_DO_EXPEDIENTE (570 por consultor por dia aberto), minutosDoHorario,
                        capacidade do dia = max(1, consultores ativos) × 570,
                        ocupado = soma dos minutos dos horários que não são cancelado nem falta
   As funções abaixo são cópia dessa regra (a Agenda é módulo ES e é outro app; aqui é CommonJS).
   tests/r8-agenda-oficina.test.js compara esta cópia com os arquivos da Agenda: se a Agenda mudar
   a regra, o teste acusa.

   Tabelas (as mesmas da Agenda): agendamentos (data, hora, servico, status), consultores (ativo),
   servicos (nome, duracao_min).
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');

/* ---------- cópia da regra da Agenda ---------- */

const EXPEDIENTE = Object.freeze({ abre: 8 * 60, fecha: 17 * 60 + 30, dias: Object.freeze([1, 2, 3, 4, 5, 6]) });
const MINUTOS_DO_EXPEDIENTE = EXPEDIENTE.fecha - EXPEDIENTE.abre;     // 570 por consultor por dia aberto
const DURACAO_PADRAO = 60;
/** Quem não segura a casa: cancelou ou faltou. */
const NAO_OCUPA = new Set(['cancelado', 'nao_veio']);

const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const minutos = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };

/**
 * Duração estimada de um serviço, em minutos. 1º o cadastro (nome igual ou contido; o mais específico ganha);
 * 2º palavras-chave; 3º 60.   servicos: [{ nome, duracao_min }]
 */
function duracaoDoServico(servico, servicos = []) {
  const s = normalizar(servico);
  if (s) {
    let melhor = null;
    for (const x of servicos || []) {
      const n = normalizar(x?.nome), min = Number(x?.duracao_min);
      if (!n || !(min > 0)) continue;
      if (n === s) return min;
      if (n.length >= 4 && (s.includes(n) || n.includes(s)) && (!melhor || n.length > melhor[0].length)) melhor = [n, min];
    }
    if (melhor) return melhor[1];
    if (/revisao de motor|embreagem/.test(s)) return 300;
    if (/correia/.test(s)) return 240;
    if (/cambio|suspensao|amortecedor|direcao|revisao/.test(s)) return 120;
    if (/freio|pastilha|bico/.test(s)) return 90;
    if (/pneu|balanceamento|ar condicionado/.test(s)) return 60;
    if (/oleo|alinhamento/.test(s)) return 45;
    if (/diagnostico|scanner/.test(s)) return 30;
  }
  return DURACAO_PADRAO;
}

/** Minutos que o horário ocupa na agenda (a duração do serviço, cortada no fechamento). */
function minutosDoHorario(a, servicos) {
  const ini = minutos(a && a.hora);
  if (ini === null) return 0;
  const dur = duracaoDoServico(a.servico, servicos || []);
  return Math.max(0, Math.min(dur, EXPEDIENTE.fecha - ini));
}

const consultoresAtivos = consultores => (consultores || []).filter(c => c && c.id && c.ativo !== false && c.ativo !== 0);

/* ---------- o que é daqui ---------- */

const LIMITE_CHEIA = 0.85;
const LIMITE_VAZIA = 0.4;

/** Os próximos `n` dias em que a oficina abre, começando hoje (se hoje abrir). */
function proximosDiasDeTrabalho(hoje, n = 7) {
  const saida = [];
  for (let d = hoje, i = 0; saida.length < n && i < n * 3; d = P.somarDias(d, 1), i++) {
    if (EXPEDIENTE.dias.includes(P.diaDaSemana(d))) saida.push(d);
  }
  return saida;
}

/**
 * Bloco `agenda` do contrato da API (§5.2): { dias: [{ data, rotulo, ocupacao, marcados, vagas }], leitura }
 * mais { situacao, ocupacao_media }.
 *   ocupacao = fração 0–1 dos minutos do dia já tomados (null sem saber a capacidade)
 *   marcados = horários que seguram a casa (fora cancelado e falta)
 *   vagas    = quantos serviços de 1 hora ainda cabem (null sem saber a capacidade)
 *   situacao = 'cheia' | 'equilibrada' | 'vazia' | 'sem_capacidade' | 'indisponivel'
 * `agendamentos` null = não deu para ler a agenda; `consultores` null = não deu para saber a capacidade.
 */
function agendaDaOficina({ hoje, agendamentos, consultores, servicos = [], dias = 7 } = {}) {
  const datas = proximosDiasDeTrabalho(hoje, dias);
  const rotulo = d => P.rotuloDoDia(d);
  if (!Array.isArray(agendamentos)) {
    return {
      dias: datas.map(d => ({ data: d, rotulo: rotulo(d), ocupacao: null, marcados: null, vagas: null })),
      leitura: 'Não deu para ler a agenda agora.', situacao: 'indisponivel', ocupacao_media: null,
    };
  }
  const temCapacidade = Array.isArray(consultores);
  const capDia = temCapacidade ? Math.max(1, consultoresAtivos(consultores).length) * MINUTOS_DO_EXPEDIENTE : null;
  const porDia = new Map(datas.map(d => [d, { ocupado: 0, marcados: 0 }]));
  for (const a of agendamentos) {
    if (!a || NAO_OCUPA.has(a.status)) continue;
    const d = porDia.get(String(a.data || '').slice(0, 10));
    if (!d) continue;
    d.marcados++;
    d.ocupado += minutosDoHorario(a, servicos);
  }
  let ocupadoTotal = 0, marcadosTotal = 0;
  const saida = datas.map(d => {
    const x = porDia.get(d);
    ocupadoTotal += x.ocupado; marcadosTotal += x.marcados;
    return {
      data: d, rotulo: rotulo(d),
      ocupacao: capDia ? T.arredondar(Math.min(1, x.ocupado / capDia)) : null,
      marcados: x.marcados,
      vagas: capDia ? Math.max(0, Math.floor((capDia - x.ocupado) / DURACAO_PADRAO)) : null,
    };
  });
  const n = datas.length;
  const quantos = `próximos ${n} dias de trabalho`;
  if (!capDia) {
    return { dias: saida, leitura: `${T.plural(marcadosTotal, 'carro marcado', 'carros marcados')} nos ${quantos}.`, situacao: 'sem_capacidade', ocupacao_media: null };
  }
  const media = T.arredondar(Math.min(1, ocupadoTotal / (capDia * n)));
  const pct = T.porcento(media);
  let situacao, leitura;
  if (media >= LIMITE_CHEIA) {
    situacao = 'cheia';
    leitura = `Agenda cheia: ${pct} dos horários dos ${quantos} já estão tomados. Segure a verba dos anúncios para não trazer gente sem vaga.`;
  } else if (media < LIMITE_VAZIA) {
    situacao = 'vazia';
    leitura = `Agenda com folga: ${pct} dos horários dos ${quantos} estão tomados. Vale acelerar os anúncios.`;
  } else {
    situacao = 'equilibrada';
    leitura = `Agenda equilibrada: ${pct} dos horários dos ${quantos} estão tomados.`;
  }
  return { dias: saida, leitura, situacao, ocupacao_media: media };
}

module.exports = {
  EXPEDIENTE, MINUTOS_DO_EXPEDIENTE, DURACAO_PADRAO, LIMITE_CHEIA, LIMITE_VAZIA,
  duracaoDoServico, minutosDoHorario, consultoresAtivos, proximosDiasDeTrabalho, agendaDaOficina,
};
