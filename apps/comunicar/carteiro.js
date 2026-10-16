// -----------------------------------------------------------------------------
// Carteiro tolerante (rodada 4) — regras PURAS do envio, testadas em `npm test`.
//
// Por que existe: em 14/10 o Render gratuito respondeu 503 "hibernate-wake-error"
// e estourou o tempo em 4 das ~24 chamadas do pg_cron. O carteiro precisa:
//   • reprocessar o que ficou para trás quando volta (as réguas têm janelas de
//     recuperação e a fila só anda para frente), SEM duplicar;
//   • não mandar o que perdeu o sentido (lembrete depois do horário, parabéns
//     dois dias depois);
//   • nunca reenviar sozinho uma mensagem que pode já ter saído.
//
// Como: cada envio é RESERVADO (enviando_em) antes de ir ao WhatsApp — só quem
// reservou envia. Reserva velha (> 15 min) e ainda pendente = o servidor caiu no
// meio: vira 'falhou' com aviso para conferir antes de reenviar. Cada envio tem
// uma VALIDADE (expira_em): passou, vira 'pulado' com o motivo.
// -----------------------------------------------------------------------------
import { instanteSP, somarDias, renderTemplate, quandoRelativo } from './dados.js';

export const RESERVA_PRESA_MIN = 15;
export const MOTIVO_EXPIRADO = 'passou da hora: o servidor ficou fora do ar e a mensagem perdeu o sentido';
export const ERRO_RESERVA_PRESA = 'O servidor reiniciou no meio do envio — confira na conversa se a mensagem saiu antes de reenviar.';

/**
 * Até quando a mensagem ainda faz sentido. null = não vence (campanha, avulsa,
 * avaliação). `base` = dia em que a régua gerou (fuso da oficina).
 */
export function validadeDoEnvio(tipo, { base, agendamento = null, horaEnvio = '09:30' } = {}) {
  if (tipo === 'lembrete') {
    if (!agendamento?.data) return null;
    return new Date(instanteSP(agendamento.data, agendamento.hora || '08:00').getTime() - 60 * 60000).toISOString();
  }
  const dias = { aniversario: 1, posvenda: 5, orcamento: 7, nao_fechou: 7, retorno: 10, reativacao: 20 }[tipo];
  if (dias === undefined || !base) return null;
  return instanteSP(somarDias(base, dias), '23:59').toISOString();
}

/** Passou da validade? */
export const envioVencido = (envio, agora = Date.now()) => !!envio?.expira_em && new Date(envio.expira_em).getTime() < agora;

/** Reserva antiga de um envio que continua pendente = o servidor caiu enquanto enviava. */
export function reservaPresa(envio, agora = Date.now(), minutos = RESERVA_PRESA_MIN) {
  return envio?.status === 'pendente' && !!envio.enviando_em && agora - new Date(envio.enviando_em).getTime() > minutos * 60000;
}

/**
 * Antes de mandar um lembrete, confere o horário de agora (pode ter sido
 * cancelado, concluído ou remarcado enquanto o servidor dormia).
 *   { acao:'enviar' } · { acao:'pular', motivo } · { acao:'atualizar', corpo, expira_em, enviar_em }
 */
export function conferirLembrete(envio, ag, cfg = {}, agora = Date.now(), hojeIso = null) {
  if (!ag) return { acao: 'pular', motivo: 'o horário foi apagado da Agenda' };
  if (!['aguardando', 'confirmado'].includes(ag.status)) {
    const rot = { cancelado: 'cancelado', concluido: 'já atendido', compareceu: 'já atendido', em_atendimento: 'já em atendimento', nao_veio: 'marcado como falta', nao_fechou: 'já atendido' }[ag.status] || ag.status;
    return { acao: 'pular', motivo: `o horário está ${rot}` };
  }
  const horario = instanteSP(ag.data, ag.hora || '08:00').getTime();
  if (horario - agora < 60 * 60000) return { acao: 'pular', motivo: MOTIVO_EXPIRADO };
  const validade = new Date(horario - 60 * 60000).toISOString();
  const mudou = envio?.expira_em && Math.abs(new Date(envio.expira_em).getTime() - (horario - 60 * 60000)) > 60000;
  if (!mudou) return { acao: 'enviar' };
  // remarcado: o texto acompanha o horário novo e, se ficou longe, espera a hora certa
  const horas = Number(cfg.horas_lembrete) || 20;
  const corpo = renderTemplate(cfg.msg_lembrete || envio.corpo, {
    nome: ag.cliente_nome, carro: ag.veiculo, placa: ag.placa, servico: ag.servico || 'o atendimento',
    quando: quandoRelativo(ag.data, ag.hora, hojeIso || undefined),
  });
  const enviarEm = horario - horas * 3600000 > agora ? new Date(horario - horas * 3600000).toISOString() : null;
  return { acao: 'atualizar', corpo: cfg.msg_lembrete ? corpo : envio.corpo, expira_em: validade, enviar_em: enviarEm };
}

/**
 * O pg_cron deve chamar de novo? (espelho da função SQL comunicar_carteiro_reforco).
 * Só no horário (8h–20h), se a última rodada que o servidor gravou tem mais de
 * 17 min (a chamada normal de 15 em 15 não pegou) e o último reforço tem 4+ min.
 */
export function deveReforcar({ ultimaRodadaEm, ultimoReforcoEm, agora = Date.now(), horaSP }) {
  if (!(horaSP >= 8 && horaSP <= 20)) return false;
  if (ultimaRodadaEm && agora - new Date(ultimaRodadaEm).getTime() < 17 * 60000) return false;
  if (ultimoReforcoEm && agora - new Date(ultimoReforcoEm).getTime() < 4 * 60000) return false;
  return true;
}

/** Como a chamada do pg_cron terminou (net._http_response). */
export function situacaoDaChamada(c) {
  if (!c) return 'sem_resposta';
  if (c.timed_out) return 'demorou';
  if (c.status_code === 200 || c.status_code === 202) return 'ok';
  if (c.status_code === 503 || c.status_code === 502) return 'dormindo';
  if (c.status_code) return 'erro';
  return c.erro ? 'erro' : 'sem_resposta';
}

/**
 * Resumo das últimas 24 h para a tela "Carteiro": quando rodou, quantas chamadas
 * deram 503/tempo esgotado, quantas o reforço salvou e os buracos (> 20 min sem
 * rodar dentro do horário de envio).
 */
export function resumirCarteiro({ batidas = [], chamadas = [], agora = Date.now(), janela = { inicio: 8, fim: 20 } }) {
  const desde = agora - 24 * 3600000;
  const b = batidas.filter((x) => new Date(x.em).getTime() >= desde).sort((x, y) => new Date(x.em) - new Date(y.em));
  const c = chamadas.filter((x) => new Date(x.em).getTime() >= desde).sort((x, y) => new Date(x.em) - new Date(y.em))
    .map((x) => ({ ...x, situacao: situacaoDaChamada(x) }));
  const falhas = c.filter((x) => ['dormindo', 'demorou', 'erro'].includes(x.situacao));
  const reforcosOk = c.filter((x) => x.origem === 'reforco' && x.situacao === 'ok').length;
  const horaSP = (ms) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date(ms))) % 24;
  const buracos = [];
  for (let i = 1; i < b.length; i++) {
    const a = new Date(b[i - 1].em).getTime(), z = new Date(b[i].em).getTime();
    if (z - a > 20 * 60000 && horaSP(a) >= janela.inicio && horaSP(a) < janela.fim) buracos.push({ de: b[i - 1].em, ate: b[i].em, minutos: Math.round((z - a) / 60000) });
  }
  const ultima = b[b.length - 1] || null;
  return {
    ultimaEm: ultima?.em || null, ultima, rodadas24h: b.length,
    chamadas24h: c.length, falhas24h: falhas.length,
    dormindo: falhas.filter((x) => x.situacao === 'dormindo').length,
    demorou: falhas.filter((x) => x.situacao === 'demorou').length,
    reforcosOk, buracos: buracos.slice(-10),
    enviadas24h: b.reduce((s, x) => s + (Number(x.enviados) || 0), 0),
    porOrigem: b.reduce((m, x) => { m[x.origem] = (m[x.origem] || 0) + 1; return m; }, {}),
    chamadas: c.slice(-60).reverse(), batidas: b.slice(-60).reverse(),
  };
}

/** Espera a promessa até `ms`; se não der tempo, devolve `seDemorar` (e a promessa segue). */
export function esperarAte(promessa, ms, seDemorar) {
  let t;
  return Promise.race([
    promessa.finally(() => clearTimeout(t)),
    new Promise((r) => { t = setTimeout(() => r(seDemorar), ms); t.unref?.(); }),
  ]);
}

/** Tenta de novo uma gravação curta no banco (o Supabase às vezes engasga). */
export async function comTentativas(fn, { vezes = 3, esperaMs = 700 } = {}) {
  let ultimo;
  for (let i = 0; i < vezes; i++) {
    try { return await fn(); } catch (e) { ultimo = e; if (i < vezes - 1) await new Promise((r) => setTimeout(r, esperaMs * (i + 1))); }
  }
  throw ultimo;
}

// =============================================================================
// RODADA 5 (16/10/2026) — cadência segura quando o CodeWords volta, prioridade
// entre tipos, intervalo por cliente e limite diário. Tudo PURO.
// =============================================================================

/** Ordem de saída quando a fila acumulou: quem o cliente está esperando sai primeiro. */
export const PRIORIDADE = {
  patio_pronto: 1, patio_extra: 2, lembrete: 3, remarcacao: 3, patio_entrada: 4, avaliacao: 5, posvenda: 6,
  area_cliente: 7, avulsa: 8, retorno: 9, orcamento: 10, nao_fechou: 11, aniversario: 12, reativacao: 13, campanha: 14,
};
export const prioridadeDe = (tipo) => PRIORIDADE[tipo] ?? 20;

/** Fila por prioridade e, dentro dela, pela ordem de envio (a mais antiga primeiro). */
export function ordenarFila(fila = []) {
  return [...fila].sort((a, b) => (prioridadeDe(a.tipo) - prioridadeDe(b.tipo)) || (String(a.enviar_em || '') < String(b.enviar_em || '') ? -1 : String(a.enviar_em || '') > String(b.enviar_em || '') ? 1 : 0));
}

/** Pausa entre dois envios para respeitar o limite por minuto (com um pouco de variação, sem cara de disparo). */
export function pausaEntreEnvios(limitePorMinuto, { minimoMs = 1200, aleatorio = Math.random } = {}) {
  const lim = Math.max(1, Number(limitePorMinuto) || 10);
  const base = Math.max(minimoMs, Math.ceil(60000 / lim));
  return Math.round(base * (0.9 + 0.2 * Math.min(1, Math.max(0, aleatorio()))));
}

/** Quantas cabem agora pelo limite por minuto e pelo limite diário (além do por hora, que já existe). */
export function vagasPorCadencia({ limitePorMinuto = 10, limitePorDia = 300, enviadasHoje = 0, vagasHora = 25 } = {}) {
  const porDia = Math.max(0, (Number(limitePorDia) || 300) - (Number(enviadasHoje) || 0));
  return Math.max(0, Math.min(Number(vagasHora) || 0, porDia, Math.max(1, Number(limitePorMinuto) || 10) * 15));
}

const telDe = (t) => String(t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
/**
 * Dois avisos para o MESMO cliente na mesma rodada: o segundo espera N minutos
 * (o cliente não recebe duas mensagens da oficina em sequência).
 * Devolve { agora: [...], adiados: [{ envio, enviar_em }] }. Avisos do Pátio e
 * lembrete nunca são adiados por isto (são operacionais e têm hora).
 */
export function separarMesmoCliente(fila = [], { minutos = 60, agora = Date.now(), recentes = new Map() } = {}) {
  const vistos = new Map(recentes); // tel → último instante em que saiu algo
  const saem = [], adiados = [];
  for (const e of ordenarFila(fila)) {
    const tel = telDe(e.telefone);
    const ultimo = tel ? vistos.get(tel) : null;
    const operacional = e.tipo === 'lembrete' || e.tipo === 'remarcacao' || String(e.tipo || '').startsWith('patio_');
    if (tel && ultimo !== undefined && ultimo !== null && !operacional && agora - ultimo < minutos * 60000) {
      adiados.push({ envio: e, enviar_em: new Date(ultimo + minutos * 60000).toISOString() });
      continue;
    }
    saem.push(e);
    if (tel) vistos.set(tel, agora);
  }
  return { agora: saem, adiados };
}

/** Horário comercial da oficina (seg–sáb 8h–17h30) — quem quiser "só no horário da loja" liga isto. */
export function dentroDoHorarioComercial({ diaSemana, hora, minuto = 0 }) {
  if (diaSemana === 0) return false;
  const m = hora * 60 + minuto;
  return m >= 8 * 60 && m < 17 * 60 + 30;
}

/** Espera crescente entre tentativas de uma falha passageira: 5, 15 e 45 min. */
export const ESPERAS_MIN = [5, 15, 45];
export const esperaDaTentativa = (tentativas) => ESPERAS_MIN[Math.max(0, Math.min(ESPERAS_MIN.length - 1, (Number(tentativas) || 1) - 1))];

/**
 * Campanha grande respeita o limite diário: o que não cabe hoje é programado para os
 * dias seguintes, na hora de envio, pulando domingo (se não envia) e feriado.
 *   linhas      = envios já montados (sem enviar_em final)
 *   jaHoje      = quantas já saíram/estão programadas para hoje
 * Devolve as linhas com `enviar_em` e um resumo por dia.
 */
export function distribuirPorDia(linhas, { limitePorDia = 300, jaHoje = 0, inicioIso, hoje, horaEnvio = '09:30', enviaDomingo = false, feriado = () => null } = {}) {
  const lim = Math.max(1, Number(limitePorDia) || 300);
  const saida = [], porDia = {};
  let dia = hoje, vagas = Math.max(0, lim - (Number(jaHoje) || 0)), quando = inicioIso;
  const proximoDia = () => {
    for (let i = 0; i < 14; i++) {
      dia = somarDias(dia, 1);
      const dow = new Date(dia + 'T12:00:00').getDay();
      if (!feriado(dia) && (enviaDomingo || dow !== 0)) break;
    }
    vagas = lim; quando = instanteSP(dia, horaEnvio).toISOString();
  };
  for (const l of linhas) {
    if (vagas <= 0) proximoDia();
    saida.push({ ...l, enviar_em: quando });
    porDia[dia] = (porDia[dia] || 0) + 1;
    vagas--;
  }
  return { linhas: saida, porDia, dias: Object.keys(porDia).length };
}
