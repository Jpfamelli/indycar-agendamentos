// -----------------------------------------------------------------------------
// Ligação da Agenda com o IndyCar Orçador (rodada 6, 21/10/2026) — funções PURAS
// (testadas em tests/orcador.test.mjs). O Orçador mora em outro endereço (Netlify);
// a Agenda só LÊ os orçamentos ligados ao horário (orc_orcamentos.agendamento_id)
// para mostrar o selo no cartão, abrir o orçamento na aba "indycar-orcador" e
// oferecer "Marcar horário" para quem já aprovou.
// -----------------------------------------------------------------------------

export const ORCADOR_PADRAO = 'https://indycar-orcador.netlify.app';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Endereço do Orçador: só https, sem usuário/senha; qualquer outra coisa volta ao padrão. */
export function baseDoOrcador(valor) {
  try {
    const u = new URL(String(valor || ''));
    return u.protocol === 'https:' && !u.username && !u.password ? u.origin : ORCADOR_PADRAO;
  } catch { return ORCADOR_PADRAO; }
}

export const ROTULO_ORC = { aberto: 'em aberto', enviado: 'esperando resposta', aprovado: 'aprovado', recusado: 'recusado', expirado: 'vencido' };
export const TOM_ORC = { aberto: 'bp-gray', enviado: 'bp-orange', aprovado: 'bp-green', recusado: 'bp-red', expirado: 'bp-gray' };

export const numeroDoOrcamento = (n) => '#' + String(Number(n) || 0).padStart(4, '0');

/** A rota que o Orçador abre de verdade: #/historico/<id>. */
export function linkOrcamento(id, base = ORCADOR_PADRAO) {
  return UUID_RE.test(String(id || '')) ? `${baseDoOrcador(base)}/#/historico/${id}` : `${baseDoOrcador(base)}/#/historico`;
}

/** "Criar orçamento" já com o cliente: o Orçador converte ?cliente=&tel=&nome= em #/cotacao?… */
export function linkNovoOrcamento({ cliente_id, telefone, nome } = {}, base = ORCADOR_PADRAO) {
  const p = new URLSearchParams();
  if (UUID_RE.test(String(cliente_id || ''))) p.set('cliente', cliente_id);
  let d = String(telefone ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) p.set('tel', '55' + d);
  const n = String(nome || '').replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (n) p.set('nome', n);
  const q = p.toString();
  return `${baseDoOrcador(base)}/${q ? '?' + q : ''}`;
}

/** O veículo do orçamento vem em jsonb ({montadora, modelo, ano, motor, placa}). */
export function veiculoDoOrcamento(v) {
  if (!v || typeof v !== 'object') return { texto: '', placa: '' };
  const texto = [v.montadora, v.modelo, v.ano].filter(Boolean).join(' ').trim();
  return { texto, placa: String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') };
}

/** Resumo para o cartão/ficha. */
export function resumoDoOrcamento(o, base = ORCADOR_PADRAO) {
  if (!o || !o.id) return null;
  const v = veiculoDoOrcamento(o.veiculo);
  return {
    id: o.id,
    numero: o.numero ?? null,
    numero_rotulo: numeroDoOrcamento(o.numero),
    status: o.status,
    status_rotulo: ROTULO_ORC[o.status] || String(o.status || ''),
    tom: TOM_ORC[o.status] || 'bp-gray',
    total: Number(o.total) || 0,
    visto: !!o.visualizado_em,
    enviado_em: o.enviado_em ?? null,
    decidido_em: o.decidido_em ?? null,
    veiculo: v.texto,
    placa: v.placa,
    abrir: linkOrcamento(o.id, base),
  };
}

/** Orçamentos APROVADOS que ainda não viraram horário, prontos para "Marcar horário" (nome, telefone e carro vão para o formulário). */
export function aprovadoParaAgendar(o, base = ORCADOR_PADRAO) {
  const r = resumoDoOrcamento(o, base);
  if (!r) return null;
  return {
    ...r,
    cliente_id: o.cliente_id || null,
    lead_id: o.lead_id || null,
    cliente_nome: String(o.cliente_nome || '').trim(),
    telefone: String(o.cliente_telefone || ''),
    observacao: `Orçamento ${r.numero_rotulo} aprovado${r.total > 0 ? ' — ' + r.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}`,
  };
}

/** Mapa agendamento_id → resumo (se houver mais de um orçamento no horário, vale o aprovado, depois o mais novo). */
export function orcamentoPorAgendamento(linhas = [], base = ORCADOR_PADRAO) {
  const peso = { aprovado: 3, enviado: 2, aberto: 1, expirado: 0, recusado: 0 };
  const saida = {};
  for (const o of linhas || []) {
    if (!o || !o.agendamento_id) continue;
    const atual = saida[o.agendamento_id];
    const novo = resumoDoOrcamento(o, base);
    if (!novo) continue;
    if (!atual || (peso[novo.status] ?? 0) > (peso[atual.status] ?? 0)) saida[o.agendamento_id] = novo;
  }
  return saida;
}
