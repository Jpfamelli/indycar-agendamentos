/* Rodada 7 (C2) — pré-agendamentos do Orçador: regras puras (sem banco, sem tela).
   Quando o cliente aprova o orçamento pela página e escolhe "manhã" ou "tarde", o banco cria o horário com a hora PADRÃO
   (08:00 ou 13:00) e a observação "PRÉ-AGENDAMENTO ... Orçamento nº 0042 (Orçador)". A recepção precisa dar a hora de verdade. */

export const HORA_PADRAO = Object.freeze({ manha: '08:00', tarde: '13:00' });
const dia = (v) => String(v || '').slice(0, 10);
const hh = (v) => String(v || '').slice(0, 5);
const emMin = (hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : NaN; };
const maisDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** O horário veio do Orçador e ainda não foi confirmado com o cliente? */
export function ehPreAgendamento(a) {
  return !!a && /^\s*PR[ÉE]-?\s*AGENDAMENTO/i.test(String(a.observacoes || ''));
}
/** "Orçamento nº 0042" → "0042" (ou null). */
export function numeroDoOrcamento(obs) {
  const m = /Or[çc]amento\s+n[º°o.]*\s*(\d{1,8})/i.exec(String(obs || ''));
  return m ? m[1] : null;
}
/** manhã/tarde quando a hora ainda é a padrão do pedido; null quando alguém já combinou uma hora. */
export function periodoPedido(a) {
  const h = hh(a && a.hora);
  if (h === HORA_PADRAO.manha) return 'manha';
  if (h === HORA_PADRAO.tarde) return 'tarde';
  return null;
}
const periodoDaHora = (h) => (emMin(h) < 12 * 60 ? 'manha' : emMin(h) >= 13 * 60 ? 'tarde' : 'meio');

/** Tudo que a recepção quer saber de um pré-agendamento. `hoje` = AAAA-MM-DD (São Paulo); `agoraMs` para a idade. */
export function descreverPre(a, hoje, agoraMs = Date.now()) {
  const criado = a && a.created_at ? Date.parse(a.created_at) : NaN;
  const dias = Number.isFinite(criado) ? Math.max(0, Math.floor((agoraMs - criado) / 864e5)) : null;
  const periodo = periodoPedido(a);
  const dd = dia(a && a.data);
  const faltam = hoje && dd ? Math.round((Date.parse(`${dd}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 864e5) : null;
  return {
    id: a.id, cliente_nome: a.cliente_nome || '', telefone: a.telefone || '', servico: a.servico || '', data: dd, hora: hh(a.hora),
    consultor_id: a.consultor_id || null, consultor_nome: a.consultor_nome || null, valor: Number(a.valor) > 0 ? Number(a.valor) : null,
    orcamento_numero: numeroDoOrcamento(a.observacoes),
    periodo,                       // 'manha' | 'tarde' | null (hora já combinada)
    provisorio: periodo !== null,  // a hora é a padrão do período, não a de verdade
    dias_esperando: dias,
    faltam_dias: faltam,           // 0 = hoje, 1 = amanhã
    urgente: faltam !== null && faltam <= 1,
    sem_telefone: String(a.telefone || '').replace(/\D/g, '').length < 10,
  };
}

/** Ordem de trabalho da recepção: o que acontece primeiro, e dentro do dia o mais antigo. */
export function ordenarPre(lista) {
  return [...(lista || [])].sort((x, y) => (x.data + x.hora).localeCompare(y.data + y.hora) || (y.dias_esperando || 0) - (x.dias_esperando || 0));
}

/** Primeiro horário livre do período pedido (o consultor do pré tem prioridade). `livres` = [{hora, consultores_livres}]. */
export function sugerirHorarioParaPre(pre, livres) {
  const per = pre && (pre.periodo || periodoDaHora(pre.hora));
  const todos = [];
  for (const h of livres || []) {
    if (!h || !Number.isFinite(emMin(h.hora))) continue;
    if (periodoDaHora(h.hora) !== per) continue;
    const ids = (h.consultores_livres || []).length ? h.consultores_livres : [null];
    for (const id of ids) todos.push({ hora: hh(h.hora), consultor_id: id });
  }
  if (!todos.length) return null;
  todos.sort((a, b) => emMin(a.hora) - emMin(b.hora));
  const meu = pre.consultor_id && todos.find((t) => t.consultor_id === pre.consultor_id);
  return meu || todos[0];
}

const primeiroNome = (n) => { const p = (String(n || '').trim().split(/\s+/)[0] || '').replace(/[^\p{L}'’-]/gu, '').slice(0, 30); return p.length >= 2 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; };
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const rotuloDoDia = (iso, hoje) => {
  if (hoje && iso === hoje) return 'hoje';
  if (hoje && iso === maisDias(hoje, 1)) return 'amanhã';
  const d = new Date(`${iso}T12:00:00Z`); return `${DOW[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

/** Recado de WhatsApp que propõe a hora de verdade para o pedido feito na página do orçamento. */
export function textoDePropor({ nome, servico, data, hoje, periodo, sugestao } = {}) {
  const p = primeiroNome(nome);
  const oi = p ? `Oi ${p}!` : 'Oi!';
  const sv = String(servico || '').trim().slice(0, 70);
  const ped = periodo === 'manha' ? 'de manhã' : periodo === 'tarde' ? 'à tarde' : '';
  const base = `${oi} Aqui é da IndyCar 🏁 Recebemos sua aprovação${sv ? ' de ' + sv : ''}${ped && data ? ` e seu pedido para ${rotuloDoDia(data, hoje)} ${ped}` : ''}.`;
  if (sugestao && sugestao.hora) return `${base} Posso deixar marcado às ${sugestao.hora}${sugestao.consultor_nome ? ' com ' + primeiroNome(sugestao.consultor_nome) : ''}? É só responder aqui.`;
  return `${base} Qual hora fica melhor para você? É só responder aqui.`;
}
