'use strict';
/* Coorte inventada para o mock da tela (nenhuma consulta ao Supabase).
   Calibrada como uma oficina: ~60% conversam no WhatsApp, ~45% agendam,
   ~25% fecham — e uma parte das vendas sem valor pago, como no CRM real. */
const NOMES = ['[Meta] Revisão + Troca de Óleo — Taubaté', '[Meta] Suspensão e Alinhamento', '[Search] troca de óleo taubaté', '[Search] oficina mecânica perto de mim'];

/* Vendedores inventados (o mock troca o id pelo nome). */
const RESP = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];

function coorte(de, ate, vazio = false) {
  if (vazio) return { leads: [], agendamentos: [], clientesComConversa: new Set() };
  const leads = [], agendamentos = [], conversa = new Set();
  let id = 0;
  for (let t = Date.parse(de); t <= Date.parse(ate); t += 86400000) {
    const dia = Math.round(t / 86400000);
    for (let i = 0; i < 6; i++) {
      const n = id++, sorte = ((dia * 7 + i * 13) % 20) / 20;
      const google = i % 2 === 0;
      const campanha = i === 5 ? null : NOMES[(google ? 2 : 0) + (i % 3 === 0 ? 1 : 0)];
      const fechou = sorte < 0.25, agendou = fechou || sorte < 0.45, falou = agendou || sorte < 0.6;
      const lead = { id: `demo-${n}`, cliente_id: `cli-${n}`, origem: i === 4 ? 'whatsapp' : google ? 'google' : 'meta',
        utm_source: google ? 'google' : 'instagram', utm_medium: i === 4 ? 'organic' : 'cpc', utm_campaign: campanha,
        status: fechou ? 'concluido' : sorte > 0.85 ? 'perdido' : agendou ? 'agendado' : 'contato',
        valor_pago: fechou && sorte > 0.08 ? 280 + i * 60 : null, created_at: new Date(t).toISOString(),
        responsavel_id: [RESP[0], RESP[1], RESP[0], RESP[2], null, RESP[1]][(i + dia) % 6] };
      leads.push(lead);
      if (falou) conversa.add(lead.cliente_id);
      if (agendou) agendamentos.push({ lead_id: lead.id, status: fechou ? 'concluido' : sorte < 0.35 ? 'nao_veio' : 'confirmado', valor: fechou ? 350 : null });
    }
  }
  return { leads, agendamentos, clientesComConversa: conversa };
}
module.exports = { coorte, RESP };
