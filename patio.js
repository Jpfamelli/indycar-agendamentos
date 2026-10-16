// -----------------------------------------------------------------------------
// Ligação da Agenda com o IndyCar Pátio (16/10/2026) — funções PURAS (testadas
// em tests/patio.test.mjs). O banco é quem abre a ordem do pátio quando a Agenda
// marca "Chegou" (gatilho patio_da_agenda); aqui a Agenda só LÊ a ordem para:
//   · o selo da etapa no cartão de quem chegou + "Abrir no Pátio";
//   · o "Link de acompanhamento" do cliente (copiar / mandar pelo WhatsApp);
//   · somar os extras APROVADOS pelo cliente à sugestão do "Veio e fechou";
//   · a lista de carros entregues no Pátio sem desfecho na Agenda (Pendências).
// -----------------------------------------------------------------------------

export const PATIO_URL = 'https://indycar-patio.netlify.app';

export const ETAPAS_PATIO = {
  recebido: { rotulo: 'Recebido', tom: 'bp-gray' },
  diagnostico: { rotulo: 'Diagnóstico', tom: 'bp-blue' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', tom: 'bp-orange' },
  aguardando_peca: { rotulo: 'Aguardando peça', tom: 'bp-orange' },
  em_execucao: { rotulo: 'Em execução', tom: 'bp-blue' },
  teste: { rotulo: 'Em teste', tom: 'bp-blue' },
  pronto: { rotulo: 'Pronto', tom: 'bp-green' },
  entregue: { rotulo: 'Entregue', tom: 'bp-purple' },
  cancelado: { rotulo: 'Cancelado', tom: 'bp-gray' },
};

/** Desfechos que encerram o horário na Agenda (o resto ainda precisa de alguém). */
export const DESFECHOS_DA_AGENDA = new Set(['concluido', 'nao_fechou', 'nao_veio', 'cancelado']);

const TOKEN_RE = /^[0-9a-f]{16,128}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Link que o CLIENTE abre: {link_base}/acompanhar/?t=<token>. Token estranho → null. */
export function linkAcompanhar(linkBase, token) {
  if (!token || !TOKEN_RE.test(String(token))) return null;
  const base = String(linkBase || PATIO_URL).trim().replace(/\/+$/, '') || PATIO_URL;
  if (!/^https:\/\//i.test(base)) return null;
  return `${base}/acompanhar/?t=${encodeURIComponent(token)}`;
}

/** Link que a EQUIPE abre (o app do Pátio na ordem certa). */
export function linkPatio(osId) {
  return UUID_RE.test(String(osId || '')) ? `${PATIO_URL}/?os=${osId}` : PATIO_URL;
}

const centavos = (v) => Math.round((Number(v) || 0) * 100);

/** Soma dos extras que o cliente APROVOU (com valor). Os outros não entram. */
export function somaExtrasAprovados(extras = []) {
  const aprovados = (extras || []).filter((e) => e && e.status === 'aprovado' && Number(e.valor) > 0);
  return { total: aprovados.reduce((s, e) => s + centavos(e.valor), 0) / 100, quantidade: aprovados.length };
}

/**
 * A sugestão do "Veio e fechou" + os extras aprovados no Pátio. Nunca troca a
 * fonte da sugestão que já existia (ela decide se o campo vem preenchido); só
 * soma. Sem sugestão nenhuma, os extras sozinhos viram a sugestão (como botão).
 */
export function juntarSugestaoComExtras(sugestao = {}, extras = []) {
  const s = sugestao || {};
  const { total, quantidade } = somaExtrasAprovados(extras);
  if (!(total > 0)) return { ...s };
  const rotuloExtras = `${quantidade} ${quantidade === 1 ? 'extra aprovado' : 'extras aprovados'} no Pátio`;
  if (Number(s.valor) > 0) {
    return { ...s, valor: (centavos(s.valor) + centavos(total)) / 100, base: Number(s.valor),
      extras_patio: total, rotulo: `${s.rotulo || 'sugestão'} + ${rotuloExtras}` };
  }
  return { ...s, valor: total, base: null, extras_patio: total, fonte: 'patio', rotulo: rotuloExtras };
}

/** Resumo de uma ordem para a tela da Agenda (sem nada além do necessário). */
export function resumoDaOs(os, extras = [], linkBase = PATIO_URL) {
  if (!os || !os.id) return null;
  const e = ETAPAS_PATIO[os.etapa] || { rotulo: os.etapa || 'Pátio', tom: 'bp-gray' };
  const doOs = (extras || []).filter((x) => x && x.os_id === os.id);
  const { total, quantidade } = somaExtrasAprovados(doOs);
  return {
    os_id: os.id,
    numero: os.numero ?? null,
    agendamento_id: os.agendamento_id ?? null,
    etapa: os.etapa,
    etapa_rotulo: e.rotulo,
    etapa_tom: e.tom,
    etapa_em: os.etapa_em ?? null,
    previsao_entrega: os.previsao_entrega ?? null,
    entregue_em: os.entregue_em ?? null,
    extras_pendentes: doOs.filter((x) => x.status === 'pendente').length,
    extras_aprovados: quantidade,
    valor_aprovado: total,
    abrir: linkPatio(os.id),
    link_cliente: os.etapa === 'cancelado' ? null : linkAcompanhar(linkBase, os.token_publico),
  };
}

/**
 * Carros entregues no Pátio cujo horário na Agenda ainda está sem desfecho
 * (ninguém marcou "Veio e fechou" / "Veio e não fechou"). Função pura:
 * recebe as ordens entregues e os horários delas.
 */
export function entreguesSemDesfecho(ordens = [], agendamentos = []) {
  const porId = new Map((agendamentos || []).filter(Boolean).map((a) => [a.id, a]));
  return (ordens || [])
    .filter((o) => o && o.etapa === 'entregue' && o.agendamento_id && porId.has(o.agendamento_id)
      && !DESFECHOS_DA_AGENDA.has(porId.get(o.agendamento_id).status))
    .map((o) => ({ os: o, agendamento: porId.get(o.agendamento_id) }))
    .sort((x, y) => String(y.os.entregue_em || '').localeCompare(String(x.os.entregue_em || '')));
}

/** Texto pronto para o WhatsApp do cliente (sem "prezado/veículo"). */
export function textoDoLink({ nome, veiculo, link } = {}) {
  if (!link) return '';
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || 'tudo bem';
  const carro = String(veiculo || '').trim() || 'seu carro';
  return `Oi ${primeiro}! Você acompanha o ${carro} aqui na IndyCar por este link, etapa por etapa: ${link} 🏁`;
}

/** Lista de ids de agendamento vinda da URL (?ids=a,b,c): só uuid, sem repetir, até 60. */
export function idsDeAgendamento(texto) {
  return [...new Set(String(texto || '').split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s)))].slice(0, 60);
}
