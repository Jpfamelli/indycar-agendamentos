/* Rodada 7 (C2) — faltas e confirmações: regras puras (sem banco, sem tela).
   Servem ao servidor, ao servidor de mentira e aos testes. */

export const MOTIVOS_FALTA = Object.freeze([
  { id: 'esqueceu', rotulo: 'Esqueceu' },
  { id: 'imprevisto', rotulo: 'Imprevisto' },
  { id: 'remarcou_outro_canal', rotulo: 'Remarcou por outro canal' },
  { id: 'sem_resposta', rotulo: 'Não atendeu / sem resposta' },
  { id: 'resolveu_outro_lugar', rotulo: 'Resolveu em outro lugar' },
  { id: 'outro', rotulo: 'Outro motivo' },
]);

const IDS = new Set(MOTIVOS_FALTA.map((m) => m.id));

/** O motivo é um dos conhecidos? ("" e null valem como "limpar".) */
export function motivoDeFaltaValido(m) {
  return m === null || m === '' || (typeof m === 'string' && IDS.has(m));
}

export function rotuloDoMotivo(id) {
  const m = MOTIVOS_FALTA.find((x) => x.id === id);
  return m ? m.rotulo : '';
}

/** Só quem faltou ou cancelou tem motivo de falta. */
export function aceitaMotivo(agendamento) {
  return !!agendamento && ['nao_veio', 'cancelado'].includes(agendamento.status);
}

const dia = (v) => String(v || '').slice(0, 10);

/** Quem ainda não deu sinal: vivo (aguardando/confirmado), com data futura ou de hoje, sem "confirmou" no link. */
export function semConfirmacaoDoDia(lista, data) {
  return (lista || []).filter((a) => a && dia(a.data) === dia(data)
    && ['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1 && a.compareceu !== true
    && a.confirmado !== true && a.confirmado !== 1
    && (a.confirmacao?.resposta || '') !== 'confirmou')
    .sort((x, y) => String(x.hora).localeCompare(String(y.hora)));
}

/** Quantos dos vivos do dia já confirmaram (para o "7 de 10 confirmados"). */
export function placarDeConfirmacao(lista, data) {
  const vivos = (lista || []).filter((a) => a && dia(a.data) === dia(data) && ['aguardando', 'confirmado'].includes(a.status));
  const confirmados = vivos.filter((a) => a.confirmado === true || a.confirmado === 1 || a.confirmacao?.resposta === 'confirmou').length;
  const pediramRemarcar = vivos.filter((a) => a.confirmacao?.resposta === 'remarcar').length;
  const naoVao = vivos.filter((a) => a.confirmacao?.resposta === 'nao_vem').length;
  return { total: vivos.length, confirmados, pendentes: vivos.length - confirmados, pediramRemarcar, naoVao };
}

const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return /[A-Za-zÀ-ÿ]{2}/.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; };

/** Recado de WhatsApp para quem faltou, já oferecendo um horário (ou só perguntando, se não houver). */
export function textoDeReagendar({ nome, servico, sugestao } = {}) {
  const p = primeiroNome(nome);
  const oi = p ? `Oi ${p}!` : 'Oi!';
  const sv = String(servico || '').trim().slice(0, 60);
  const alvo = sv ? ` de ${sv}` : '';
  if (sugestao && sugestao.rotulo && sugestao.hora) {
    return `${oi} Aqui é da IndyCar 🏁 Sentimos sua falta no horário${alvo}. Posso remarcar para ${sugestao.rotulo} às ${sugestao.hora}? É só responder aqui.`;
  }
  return `${oi} Aqui é da IndyCar 🏁 Sentimos sua falta no horário${alvo}. Quer que a gente remarque? Me diga o melhor dia e horário.`;
}

/** Resumo para o dono (relatório de faltas): por motivo, dia da semana, hora, serviço e consultor. */
export function resumoDeFaltas(lista, { inicio, fim } = {}) {
  const em = (a) => (!inicio || dia(a.data) >= inicio) && (!fim || dia(a.data) <= fim);
  const todos = (lista || []).filter((a) => a && em(a));
  const marcados = todos.filter((a) => !['cancelado'].includes(a.status));
  const faltas = todos.filter((a) => a.status === 'nao_veio');
  const cont = (arr, chave) => { const m = new Map(); for (const a of arr) { const k = chave(a); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const porMotivo = MOTIVOS_FALTA.map((m) => ({ id: m.id, rotulo: m.rotulo, n: faltas.filter((a) => a.motivo_falta === m.id).length }));
  const semMotivo = faltas.filter((a) => !a.motivo_falta).length;
  const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
  const NOMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const porDiaSemana = NOMES.map((n, i) => ({ dia: n, faltas: faltas.filter((a) => diaSemana(dia(a.data)) === i).length, marcados: marcados.filter((a) => diaSemana(dia(a.data)) === i).length }));
  const porHora = [...cont(faltas, (a) => String(a.hora || '').slice(0, 2) + 'h')].map(([hora, n]) => ({ hora, n })).sort((a, b) => a.hora.localeCompare(b.hora));
  const porServico = [...cont(faltas, (a) => a.servico || '—')].map(([servico, n]) => ({ servico, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  const porConsultor = [...cont(marcados, (a) => a.consultor_nome || 'Sem consultor')].map(([consultor, total]) => {
    const f = faltas.filter((a) => (a.consultor_nome || 'Sem consultor') === consultor).length;
    return { consultor, marcados: total, faltas: f, taxa: total ? Math.round((f / total) * 1000) / 10 : 0 };
  }).sort((a, b) => b.marcados - a.marcados);
  const confirmou = (a) => a.confirmado === true || a.confirmado === 1 || a.confirmacao?.resposta === 'confirmou';
  const dosConf = marcados.filter(confirmou), dosNao = marcados.filter((a) => !confirmou(a));
  const taxa = (arr) => (arr.length ? Math.round((arr.filter((a) => a.status === 'nao_veio').length / arr.length) * 1000) / 10 : null);
  return {
    marcados: marcados.length, faltas: faltas.length, taxa: marcados.length ? Math.round((faltas.length / marcados.length) * 1000) / 10 : 0,
    porMotivo, semMotivo, porDiaSemana, porHora, porServico, porConsultor,
    faltaConfirmados: taxa(dosConf), faltaSemConfirmar: taxa(dosNao),
  };
}
