'use strict';
/* Ciclo inventado para o mock (rodada 6): orçamento e OS ligados a alguns leads, passando pelo ciclo.js REAL. */
const C = require('../ciclo.js');

function porLeadDemo(leads, agora = Date.now()) {
  const orcamentos = [], os = [], extras = [];
  leads.forEach((l, i) => {
    if (i % 3 !== 0) return;
    const status = ['aprovado', 'enviado', 'recusado', 'aprovado'][(i / 3) % 4 | 0];
    orcamentos.push({ id: `orc-${l.id}`, numero: 100 + i, lead_id: l.id, status, total: 380 + (i % 7) * 110, enviado_em: new Date(agora - (30 + i * 7) * 3600000).toISOString(),
      visualizado_em: status === 'enviado' && Math.floor(i / 12) % 2 === 0 ? new Date(agora - 6 * 3600000).toISOString() : null, desconto_pedido_em: status === 'enviado' && Math.floor(i / 12) % 2 === 1 ? new Date(agora - 8 * 3600000).toISOString() : null,
      decidido_em: status === 'enviado' ? null : new Date(agora - 20 * 3600000).toISOString(), motivo_cod: status === 'recusado' ? 'preco' : null, created_at: l.created_at });
    if (status === 'aprovado') {
      const etapa = ['recebido', 'em_execucao', 'pronto', 'entregue'][(i / 3) % 4 | 0];
      os.push({ id: `os-${l.id}`, numero: 40 + i, lead_id: l.id, etapa, etapa_em: new Date(agora - (26 + i) * 3600000).toISOString(), created_at: l.created_at });
      if (i % 2 === 0) extras.push({ os_id: `os-${l.id}`, valor: 120, status: 'aprovado' });
    }
  });
  return C.ligar({ leadIds: leads.map(l => l.id), orcamentos, os, extras });
}
module.exports = { porLeadDemo };
