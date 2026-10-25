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

// -----------------------------------------------------------------------------
// Rodada 7 (C2) — "Chegou" abre a ENTRADA PRONTA no Pátio.
// Contrato do Pátio (indycar-patio/app/js/conexoes.js › lerLinkDeEntrada):
//   {PATIO}/?entrada=1&agendamento=<uuid>&orcamento=<uuid>[&cliente=<uuid>][&placa=][&carro=][&servico=]
// O Pátio resolve nome e telefone pelo agendamento (RPC patio_agenda_hoje) e pelo orçamento: por isso o telefone
// e o nome do cliente NÃO viajam na barra de endereço (ficam fora do histórico do navegador e dos logs).
// -----------------------------------------------------------------------------
const PLACA_RE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;
const limpaTexto = (t, max) => String(t ?? '').replace(/[\p{C}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Orçamento que vale levar para a entrada: o que ainda pode virar serviço (aprovado, enviado ou em aberto). */
export function orcamentoParaEntrada(orc) {
  if (!orc || !UUID_RE.test(String(orc.id || ''))) return null;
  return ['aprovado', 'enviado', 'aberto'].includes(orc.status) ? orc : null;
}

/** Link da entrada pronta no Pátio. Id fora do padrão, placa torta e texto hostil são descartados — nunca viram parâmetro. */
export function linkEntradaPatio({ agendamento_id, orcamento_id, cliente_id, placa, veiculo, servico } = {}, base = PATIO_URL) {
  let raiz = PATIO_URL;
  try { const u = new URL(String(base || '').trim()); if (u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash) raiz = u.origin; } catch { /* base torta: fica o endereço do Pátio */ }
  const p = new URLSearchParams();
  p.set('entrada', '1');
  if (UUID_RE.test(String(agendamento_id || ''))) p.set('agendamento', agendamento_id);
  if (UUID_RE.test(String(orcamento_id || ''))) p.set('orcamento', orcamento_id);
  if (UUID_RE.test(String(cliente_id || ''))) p.set('cliente', cliente_id);
  const pl = String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (PLACA_RE.test(pl)) p.set('placa', pl);
  const carro = limpaTexto(veiculo, 80); if (carro) p.set('carro', carro);
  const serv = limpaTexto(servico, 200); if (serv) p.set('servico', serv);
  return `${raiz}/?${p.toString()}`;
}

/** O que a Agenda devolve no "Chegou": o link pronto e o orçamento que foi junto (para o recado dizer). */
export function entradaDoChegou(agendamento, orcamento, base = PATIO_URL) {
  const orc = orcamentoParaEntrada(orcamento);
  return {
    link: linkEntradaPatio({ agendamento_id: agendamento?.id, orcamento_id: orc?.id, cliente_id: agendamento?.cliente_id,
      placa: agendamento?.placa, veiculo: agendamento?.veiculo, servico: agendamento?.servico }, base),
    orcamento: orc ? { id: orc.id, numero_rotulo: orc.numero_rotulo || null, status: orc.status, status_rotulo: orc.status_rotulo || null, total: Number(orc.total) || 0 } : null,
  };
}
