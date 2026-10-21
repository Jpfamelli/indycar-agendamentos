// -----------------------------------------------------------------------------
// Contexto de quem está sendo marcado (rodada 6 / C1c) — funções PURAS, testadas em tests/c1c-agenda.test.mjs.
// Na hora de marcar um horário, a recepção precisa saber em um relance: este cliente JÁ tem horário marcado?
// O carro dele JÁ está no pátio? Tem orçamento esperando resposta ou aprovado sem horário? O servidor junta
// as três respostas aqui (uma ida só) e a tela mostra avisos — nada bloqueia o salvar.
// -----------------------------------------------------------------------------
import { ETAPAS_PATIO, linkPatio } from './patio.js';
import { linkOrcamento, numeroDoOrcamento, ROTULO_ORC } from './orcador.js';

const soDig = (t) => String(t ?? '').replace(/\D/g, '');
/** Telefone sem o 55 — a forma de comparar números gravados com e sem máscara. */
export function nacional(t) {
  const d = soDig(t);
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
}
/** Placa sem hífen/espaço e em maiúsculas; menos de 7 caracteres não vale como placa. */
export function placaLimpa(p) {
  const s = String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length >= 7 ? s : '';
}
const VIVOS = new Set(['aguardando', 'confirmado']);
const ABERTA = (etapa) => etapa && !['entregue', 'cancelado'].includes(etapa);

/**
 * Junta o que o servidor leu (listas cruas) no recado para a tela.
 *   agendamentos: horários a partir de hoje · os: ordens do pátio (qualquer etapa) · orcamentos: do Orçador
 */
export function resumoDoContexto({ tel, placa, ignorar = null, hojeIso, agendamentos = [], os = [], orcamentos = [] } = {}) {
  const t = nacional(tel), p = placaLimpa(placa);
  const casaTel = (x) => t.length >= 10 && nacional(x) === t;
  const futuros = (agendamentos || [])
    .filter((a) => a && a.id !== ignorar && VIVOS.has(a.status) && String(a.data) >= String(hojeIso || '') && (casaTel(a.telefone) || (p && placaLimpa(a.placa) === p)))
    .sort((x, y) => String(x.data + x.hora).localeCompare(String(y.data + y.hora)))
    .slice(0, 5)
    .map((a) => ({ id: a.id, data: a.data, hora: String(a.hora || '').slice(0, 5), servico: a.servico || '', status: a.status, consultor_nome: a.consultor_nome || null }));
  const patio = (os || [])
    .filter((o) => o && ABERTA(o.etapa) && (casaTel(o.telefone) || (p && placaLimpa(o.placa) === p)))
    .slice(0, 3)
    .map((o) => ({ id: o.os_id || o.id, numero: o.numero ?? null, etapa: o.etapa, etapa_rotulo: (ETAPAS_PATIO[o.etapa] || {}).rotulo || o.etapa, placa: placaLimpa(o.placa), abrir: linkPatio(o.os_id || o.id) }));
  const orcs = (orcamentos || [])
    .filter((o) => o && ['enviado', 'aprovado'].includes(o.status) && !o.agendamento_id && (casaTel(o.cliente_telefone) || casaTel(o.telefone)))
    .slice(0, 3)
    .map((o) => ({ id: o.id, numero: o.numero ?? null, numero_rotulo: numeroDoOrcamento(o.numero), status: o.status, status_rotulo: ROTULO_ORC[o.status] || o.status, total: Number(o.total) || 0, abrir: linkOrcamento(o.id) }));
  const avisos = [];
  if (futuros.length) avisos.push({ tipo: 'futuro', tom: 'aviso', texto: futuros.length === 1 ? `Já tem um horário marcado: ${futuros[0].data.split('-').reverse().slice(0, 2).join('/')} às ${futuros[0].hora} (${futuros[0].servico}).` : `Já tem ${futuros.length} horários marcados (o próximo é ${futuros[0].data.split('-').reverse().slice(0, 2).join('/')} às ${futuros[0].hora}).` });
  if (patio.length) avisos.push({ tipo: 'patio', tom: 'aviso', texto: `O carro já está no pátio: OS ${patio[0].numero ?? ''} · ${patio[0].etapa_rotulo}.` });
  const aprov = orcs.filter((o) => o.status === 'aprovado');
  if (aprov.length) avisos.push({ tipo: 'orcamento', tom: 'bom', texto: `Orçamento ${aprov[0].numero_rotulo} aprovado e ainda sem horário — este é o horário dele.` });
  const esper = orcs.filter((o) => o.status === 'enviado');
  if (esper.length) avisos.push({ tipo: 'orcamento', tom: 'neutro', texto: `Orçamento ${esper[0].numero_rotulo} enviado, esperando resposta do cliente.` });
  return { futuros, patio, orcamentos: orcs, avisos };
}

/** Dias da semana do Quadro: de `desde` por `n` dias, com quantos horários vivos e quantos já passaram. */
export function semanaDoQuadro({ desde, n = 7, agendamentos = [], capacidadePorDia = 0, diasAbertos = [1, 2, 3, 4, 5, 6] } = {}) {
  const porDia = new Map();
  for (const a of agendamentos || []) {
    if (!a || a.status === 'cancelado') continue;
    const d = porDia.get(a.data) || { total: 0, vivos: 0, faltaram: 0 };
    d.total++; if (VIVOS.has(a.status)) d.vivos++; if (a.status === 'nao_veio') d.faltaram++;
    porDia.set(a.data, d);
  }
  const dias = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(`${desde}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10); const c = porDia.get(iso) || { total: 0, vivos: 0, faltaram: 0 };
    const aberto = diasAbertos.includes(d.getUTCDay());
    dias.push({ data: iso, dow: d.getUTCDay(), aberto, total: c.total, vivos: c.vivos, faltaram: c.faltaram,
      lotacao: aberto && capacidadePorDia > 0 ? Math.min(100, Math.round((c.total / capacidadePorDia) * 100)) : null });
  }
  return dias;
}

/** Duração de cada horário (min), pelo cadastro de serviços — para o tamanho do cartão no Quadro. */
export function duracoesDaLista(lista, duracaoDe) {
  const saida = {};
  for (const a of lista || []) if (a && a.id) saida[a.id] = Math.max(15, Math.min(480, Number(duracaoDe(a.servico)) || 60));
  return saida;
}
