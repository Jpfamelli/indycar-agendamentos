// -----------------------------------------------------------------------------
// Pátio + Área do Cliente (16/10/2026) — regras PURAS do Comunicar para os
// avisos que o IndyCar Pátio põe na fila (testadas em scripts/testes-patio.mjs).
//
// Quem ENFILEIRA é o banco (gatilhos do Pátio, chave_unica 'patio_<tipo>:<os_id>…',
// respeita clientes.aceita_mensagens). O Comunicar só:
//   • mostra os tipos com rótulo/ícone (telas, filtros, relatórios, "Pronto para ligar");
//   • confere a ordem na hora de enviar (carro já entregue → não manda "está pronto");
//   • monta o convite da Área do Cliente ({link_area}) com um link por cliente.
// Os avisos do Pátio NÃO contam no intervalo mínimo das réguas de relacionamento
// e NÃO substituem o pós-venda (que continua saindo dias depois do serviço).
// -----------------------------------------------------------------------------

export const PATIO_URL = 'https://indycar-patio.netlify.app';
export const TIPOS_PATIO = ['patio_entrada', 'patio_extra', 'patio_pronto', 'area_cliente'];
export const ROTULO_PATIO = {
  patio_entrada: 'Pátio: carro recebido', patio_extra: 'Pátio: extra para aprovar',
  patio_pronto: 'Pátio: carro pronto', area_cliente: 'Área do Cliente',
};
/** Validade dos avisos operacionais: depois disso o aviso perdeu o sentido. */
export const VALIDADE_PATIO_H = { patio_entrada: 24, patio_extra: 48, patio_pronto: 72 };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TOKEN_RE = /^[0-9a-f]{16,128}$/i;

/** 'patio_extra:<os_id>:2026101610' → '<os_id>' (null se não for do Pátio). */
export function osIdDaChave(chave) {
  const m = /^patio_(entrada|extra|pronto):([0-9a-f-]{36})/i.exec(String(chave || ''));
  return m && UUID.test(m[2]) ? m[2].toLowerCase() : null;
}

/**
 * Antes de mandar um aviso do Pátio, confere a ordem de AGORA (o servidor pode
 * ter dormido). { acao:'enviar' } ou { acao:'pular', motivo }.
 *   os      = { id, etapa } da ordem (null = apagada)
 *   extras  = [{ status }] da ordem (para patio_extra)
 */
export function conferirPatio(envio, os, extras = [], agora = Date.now()) {
  const tipo = envio?.tipo;
  if (!['patio_entrada', 'patio_extra', 'patio_pronto'].includes(tipo)) return { acao: 'enviar' };
  const criado = Date.parse(envio.created_at || envio.enviar_em || '');
  const horas = VALIDADE_PATIO_H[tipo];
  if (Number.isFinite(criado) && agora - criado > horas * 3600000) return { acao: 'pular', motivo: `aviso do Pátio com mais de ${horas} h: perdeu o sentido` };
  if (os === undefined) return { acao: 'enviar' };        // sem como conferir (sem chave / leitura falhou): manda como o banco pediu
  if (!os) return { acao: 'pular', motivo: 'a ordem do pátio foi apagada' };
  if (os.etapa === 'cancelado') return { acao: 'pular', motivo: 'a ordem do pátio foi cancelada' };
  if (tipo === 'patio_pronto') {
    if (os.etapa === 'entregue') return { acao: 'pular', motivo: 'o carro já foi entregue' };
    if (os.etapa !== 'pronto') return { acao: 'pular', motivo: 'o carro voltou para o serviço' };
  }
  if (tipo === 'patio_extra') {
    if (os.etapa === 'entregue') return { acao: 'pular', motivo: 'o carro já foi entregue' };
    if (!(extras || []).some((e) => e && e.status === 'pendente')) return { acao: 'pular', motivo: 'o cliente já decidiu os extras' };
  }
  if (tipo === 'patio_entrada' && ['pronto', 'entregue'].includes(os.etapa)) {
    return { acao: 'pular', motivo: os.etapa === 'entregue' ? 'o carro já foi entregue' : 'o carro já está pronto (o aviso de pronto sai no lugar)' };
  }
  return { acao: 'enviar' };
}

/** O texto usa o link da Área do Cliente? (cada cliente recebe o seu) */
export const usaLinkArea = (corpo) => /\{link_area\}/.test(String(corpo || ''));

/** {link_base}/minha/?c=<token> — token/base estranhos → null. */
export function linkArea(linkBase, token) {
  const b = String(linkBase || PATIO_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(b) || !TOKEN_RE.test(String(token || ''))) return null;
  return `${b}/minha/?c=${encodeURIComponent(token)}`;
}

/** O texto usa o link de acompanhamento da ordem do Pátio? */
export const usaLinkOs = (corpo) => /\{link_os\}/.test(String(corpo || ''));

/** {link_base}/acompanhar/?t=<token_publico> — o mesmo link que o Pátio manda ao cliente. */
export function linkOs(linkBase, token) {
  const b = String(linkBase || PATIO_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(b) || !TOKEN_RE.test(String(token || ''))) return null;
  return `${b}/acompanhar/?t=${encodeURIComponent(token)}`;
}

/** O modelo pronto da biblioteca (o mesmo que vai para comunicar_modelos). */
export const MODELO_CONVITE_AREA = {
  titulo: 'Convite para a Área do Cliente',
  categoria: 'relacionamento',
  corpo: 'Oi {primeiro_nome}! Agora você tem a sua Área do Cliente da IndyCar: histórico do {carro}, próximas revisões e pedido de horário, tudo pelo celular. O link é só seu: {link_area} 🏁 Quem conhece, Indyca!',
};

/**
 * Item do "Pronto para ligar": os avisos do Pátio (ligados no app do Pátio, em
 * patio_config) e se há aviso parado na fila. PURO.
 *   cfgPatio = { avisar_pronto, avisar_extra, enviar_link_entrada } | null (sem leitura)
 *   fila     = { pendentes, maisAntigoEm }
 */
export function itemPatioProntidao(cfgPatio, fila = {}, agora = Date.now()) {
  const base = { id: 'patio', titulo: 'Avisos do Pátio (carro recebido, extra, pronto)', acao: { tipo: 'link', alvo: PATIO_URL, rotulo: 'Abrir o Pátio' } };
  if (!cfgPatio) return { ...base, estado: 'aviso', texto: 'Não consegui ler a configuração do Pátio agora.' };
  const lig = [cfgPatio.enviar_link_entrada && 'carro recebido', cfgPatio.avisar_extra && 'extra para aprovar', cfgPatio.avisar_pronto && 'carro pronto'].filter(Boolean);
  const velho = fila.maisAntigoEm && agora - Date.parse(fila.maisAntigoEm) > 2 * 3600000;
  if (velho) return { ...base, estado: 'aviso', texto: `${fila.pendentes} aviso(s) do Pátio esperando na fila há mais de 2 h — confira o WhatsApp e o carteiro.` };
  if (!lig.length) return { ...base, estado: 'aviso', texto: 'Os avisos do Pátio estão desligados: o cliente não recebe o link de acompanhamento. Ligue no app do Pátio › Configurações.' };
  return { ...base, estado: 'ok', texto: `Ligados no Pátio: ${lig.join(', ')}. Saem pela mesma fila e respeitam quem pediu para parar.` };
}
