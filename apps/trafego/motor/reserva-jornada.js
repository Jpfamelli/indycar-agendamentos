/* ============================================================
   Reserva da jornada (rodada 8, frente T2a).

   As rotas /api/hoje e /api/campanhas pegam a origem e o desfecho de cada
   contato em jornada.listarBruto({ de, ate, sb }) (frente T2b, contrato §5.6).
   Enquanto ./jornada não existe (ou se ela falhar), o app não pode cair:
   este arquivo devolve o MESMO formato a partir do que já existe
   (leads.js para ler os contatos e origem.js para a origem), com menos detalhe:

   - etapas: só o que o status do contato no CRM conta (não lê agenda, orçamento nem pátio);
   - "respondido" vem marcado como desconhecido (as conversas não são lidas aqui): não conta no funil nem vira pendência;
   - valor do serviço fechado: o valor pago lançado no CRM (valor_fonte "manual").

   Quando ./jornada existir, este arquivo deixa de ser usado sozinho (a escolha é de motor/fonte.js).
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');

/* Status do CRM -> etapas da jornada que ele garante (além de "contato"). */
const ETAPAS_DO_STATUS = Object.freeze({
  novo: [], contato: [], orcamento: ['orcamento'], agendado: ['agendou'],
  em_servico: ['veio', 'oficina'], concluido: ['veio', 'fechou'], perdido: [],
});

const ROTULO_MOTIVO = Object.freeze({ caro: 'Achou caro', concorrente: 'Foi em outra oficina', sem_retorno: 'Parou de responder', desistiu: 'Desistiu do serviço',
  nao_fazemos: 'Não fazemos o serviço', prazo: 'Prazo não atendeu', sem_urgencia: 'Não era urgente', sem_vaga: 'Não tinha vaga', outro: 'Outro' });

const finalDoTelefone = v => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 4 ? d.slice(-4) : null; };
const dias = (de, ate) => { const a = Date.parse(de), b = Number(ate); return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.floor((b - a) / 86400000) : null; };

/**
 * Uma linha de `leads` -> o item da jornada do contrato (§5.3), no que dá para saber só pelo CRM.
 * `origemDoContato` é a regra única da origem (origem.js); vem por parâmetro para o teste não depender dela.
 */
function itemDoLead(l, { origemDoContato, agora = Date.now() } = {}) {
  const origem = origemDoContato(l);
  const quando = l.updated_at || l.created_at || null;
  // a resposta da oficina não é lida aqui: fica marcada como desconhecida (não conta no funil nem vira pendência)
  const etapas = [{ id: 'contato', em: l.created_at || null }, { id: 'respondido', em: null, minutos: null, desconhecido: true }];
  for (const id of ETAPAS_DO_STATUS[l.status] || []) {
    const etapa = { id, em: id === 'fechou' ? (l.closed_at || quando) : quando };
    if (id === 'agendou') etapa.para = null;
    etapas.push(etapa);
  }
  const valor = T.numOuNulo(l.valor_pago);
  const temValor = valor != null && valor > 0;
  let desfecho;
  if (l.status === 'concluido') {
    desfecho = { tipo: 'fechou', valor: temValor ? valor : null, valor_fonte: temValor ? 'manual' : null, motivo: null, motivo_rotulo: null, obs: null, em: l.closed_at || quando, parado_dias: null };
    if (temValor) etapas[etapas.length - 1].valor = valor;
  } else if (l.status === 'perdido') {
    const motivo = Object.prototype.hasOwnProperty.call(ROTULO_MOTIVO, l.motivo_perda) ? l.motivo_perda : null;
    desfecho = { tipo: 'nao_fechou', valor: null, valor_fonte: null, motivo, motivo_rotulo: motivo ? ROTULO_MOTIVO[motivo] : null, obs: l.motivo_perda_obs || null, em: l.closed_at || quando, parado_dias: null };
  } else {
    desfecho = { tipo: 'aberto', valor: null, valor_fonte: null, motivo: null, motivo_rotulo: null, obs: null, em: null, parado_dias: dias(quando, agora) };
  }
  const pendencias = [];
  if (origem.canal === 'desconhecida' && origem.paga !== true) pendencias.push('sem_origem');
  if (desfecho.tipo === 'fechou' && !temValor) pendencias.push('sem_valor');
  if (desfecho.tipo === 'nao_fechou' && !desfecho.motivo) pendencias.push('sem_motivo');
  return {
    lead_id: l.id,
    nome: String(l.nome || '').trim() || 'Sem nome',
    telefone_final: finalDoTelefone(l.telefone_e164 || l.telefone),
    carro: l.carro_modelo || null,
    servico: l.servico || null,
    chegou_em: l.created_at || null,
    cliente_novo: null,
    origem,
    etapas,
    etapa_atual: etapas.filter(e => !e.desconhecido).pop().id,
    desfecho,
    responsavel: null,
    pendencias,
    espera_min: null,
  };
}

/**
 * A mesma assinatura de jornada.listarBruto({ de, ate, sb }): contatos que chegaram entre `de` e `ate`
 * (dias de Brasília, contando os dois), do mais novo para o mais antigo.
 * `leads` e `origem` entram por parâmetro só para teste; o padrão são os módulos do app.
 */
async function listarBruto({ de, ate, sb, agora = Date.now(), leads = null, origem = null } = {}) {
  if (!P.dataValida(de) || !P.dataValida(ate) || de > ate) throw new Error('reserva da jornada: período inválido');
  const Leads = leads || require('../leads');
  const Origem = origem || require('../origem');
  const linhas = await Leads.lerLeads(de, ate, sb ? { sb } : {});
  return (linhas || []).map(l => itemDoLead(l, { origemDoContato: Origem.origemDoContato, agora }));
}

module.exports = { listarBruto, itemDoLead, ETAPAS_DO_STATUS, RESERVA: true };
