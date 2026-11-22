'use strict';
/* R13C — mede a etapa "contatos" (jornada.listarBruto) com um banco de mentira que demora como o Supabase de verdade
   visto do Render (~LAT ms por ida). Mostra o tempo e quantas idas. Uso: node scripts/r13c-medir-contatos.js [lat=180] [qtd=120]
   Não fala com rede nenhuma. */
const J = require('../jornada');
const { criarBanco } = require('../tests/apoio/banco-falso');

const LAT = Number(process.argv[2]) || 180, QTD = Number(process.argv[3]) || 120;
const dorme = ms => new Promise(r => setTimeout(r, ms));
const AGORA = Date.parse('2026-11-19T15:00:00-03:00');

function comAtraso(sb, ms) {
  const embrulhar = q => new Proxy(q, {
    get(alvo, k) {
      if (k === 'then') return (ok, falhou) => dorme(ms).then(() => alvo.then(ok, falhou));
      const v = alvo[k];
      return typeof v === 'function' ? (...a) => { const r = v.apply(alvo, a); return r === alvo ? embrulhar(alvo) : r; } : v;
    },
  });
  return { ...sb, from: t => embrulhar(sb.from(t)), rpc: async (...a) => { await dorme(ms); return sb.rpc(...a); } };
}

function banco(qtd) {
  const leads = [], agendamentos = [], clientes = [], pms = [], os = [];
  for (let i = 0; i < qtd; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const criado = AGORA - (i + 1) * 3 * 3600000;
    const status = ['novo', 'contato', 'agendado', 'concluido', 'perdido', 'orcamento'][i % 6];
    leads.push({ id, cliente_id: `cli-${i}`, responsavel_id: null, nome: `Cliente ${i}`, telefone: '12991230272', telefone_e164: '+5512991230272', origem: 'whatsapp', status,
      valor_pago: status === 'concluido' ? 300 : null, valor_orcado: null, servico: 'Óleo', carro_modelo: 'Onix', placa: 'ABC1D23', utm_source: null, utm_medium: null, utm_campaign: null,
      created_at: new Date(criado).toISOString(), closed_at: null, updated_at: new Date(criado).toISOString(), ultimo_contato_em: null });
    clientes.push({ id: `cli-${i}`, created_at: new Date(criado - 60000).toISOString() });
    if (status === 'agendado' || status === 'concluido') agendamentos.push({ id: `ag-${i}`, lead_id: id, data: '2026-11-18', hora: '08:00', inicio_em: null, status: status === 'concluido' ? 'concluido' : 'confirmado', valor: status === 'concluido' ? 280 : null, created_at: new Date(criado + 600000).toISOString() });
    if (i === 3) os.push({ id: 'os-1', numero: 1, lead_id: null, orcamento_id: null, agendamento_id: `ag-${i}`, etapa: 'entregue', etapa_em: null, entregue_em: null, created_at: new Date(criado).toISOString(), token_publico: null, orcamento_total: 450, orcamento_total_a_vista: null });
    pms.push({ lead_id: id, primeira_entrada_em: new Date(criado).toISOString(), primeira_entrada_texto: 'Olá, quero orçamento', primeira_saida_em: new Date(criado + 300000).toISOString(), entradas: 1, saidas: 1 });
  }
  return criarBanco({ leads, agendamentos, clientes, orc_orcamentos: [], patio_os: os, patio_extras: [{ os_id: 'os-1', valor: 50, status: 'aprovado' }],
    perfis: [], conversas: [],
    whatsapp_mensagens: Array.from({ length: 26 }, (_, d) => ({ id: `s${d}`, direcao: 'saida', status: 'enviado', wamid: `w${d}`, created_at: new Date(Date.parse('2026-10-25T12:00:00Z') + d * 86400000).toISOString() })),
  }, { rpc: { trafego_primeiras_mensagens: ({ p_leads }) => pms.filter(p => p_leads.includes(p.lead_id)) } });
}

(async () => {
  const tempos = [];
  let assinatura = null;
  for (let r = 0; r < 3; r++) {
    J.esquecer();
    const base = banco(QTD), sb = comAtraso(base, LAT);
    const t0 = Date.now();
    const itens = await J.listarBruto({ de: '2026-11-01', ate: '2026-11-19', sb, agora: AGORA });
    tempos.push(Date.now() - t0);
    assinatura = JSON.stringify(itens);
    if (r === 0) console.log(`idas ao banco: ${base.idas()}`);
  }
  const hash = require('node:crypto').createHash('sha256').update(assinatura).digest('hex').slice(0, 16);
  console.log(`contatos (${QTD}, ${LAT} ms por ida): ${tempos.join(' / ')} ms · resultado ${hash}`);
})();
