'use strict';
/* R14 — mede /api/hoje e /api/campanhas com um banco de mentira que demora como o Supabase visto do Render (~LAT ms por ida).
   Mostra, para cada tela, o tempo frio (nada guardado), o tempo logo depois e o tempo "velho" (passou da memória curta), as idas ao banco
   e o hash do resultado (tem de ser o mesmo antes e depois de qualquer ajuste). Uso: node scripts/r14-medir-telas.js [lat=180] [qtd=120] [velho=1]
   Não fala com rede nenhuma. */
const crypto = require('node:crypto');
const F = require('../motor/fonte');
const Hoje = require('../motor/hoje');
const Camp = require('../motor/campanhas');
const J = require('../jornada');
const { criarBanco } = require('../tests/apoio/banco-falso');

const LAT = Number(process.argv[2]) || 180, QTD = Number(process.argv[3]) || 120, COM_VELHO = process.argv[4] !== '0';
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

const dia = n => new Date(AGORA - n * 86400000).toISOString().slice(0, 10);

function banco(qtd) {
  const leads = [], agendamentos = [], clientes = [], pms = [], os = [], metricas = [];
  for (let i = 0; i < qtd; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const criado = AGORA - (i + 1) * 12 * 3600000;
    const status = ['novo', 'contato', 'agendado', 'concluido', 'perdido', 'orcamento'][i % 6];
    leads.push({ id, cliente_id: `cli-${i}`, responsavel_id: null, nome: `Cliente ${i}`, telefone: '12991230272', telefone_e164: '+5512991230272', origem: 'whatsapp', status,
      valor_pago: status === 'concluido' ? 300 : null, valor_orcado: null, servico: 'Óleo', carro_modelo: 'Onix', placa: 'ABC1D23', utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: `camp${i % 4}`,
      created_at: new Date(criado).toISOString(), closed_at: null, updated_at: new Date(criado).toISOString(), ultimo_contato_em: null });
    clientes.push({ id: `cli-${i}`, created_at: new Date(criado - 60000).toISOString() });
    if (status === 'agendado' || status === 'concluido') agendamentos.push({ id: `ag-${i}`, lead_id: id, data: '2026-11-18', hora: '08:00', inicio_em: null, status: status === 'concluido' ? 'concluido' : 'confirmado', valor: status === 'concluido' ? 280 : null, created_at: new Date(criado + 600000).toISOString() });
    if (i === 3) os.push({ id: 'os-1', numero: 1, lead_id: null, orcamento_id: null, agendamento_id: `ag-${i}`, etapa: 'entregue', etapa_em: null, entregue_em: null, created_at: new Date(criado).toISOString(), token_publico: null, orcamento_total: 450, orcamento_total_a_vista: null });
    pms.push({ lead_id: id, primeira_entrada_em: new Date(criado).toISOString(), primeira_entrada_texto: 'Olá, quero orçamento', primeira_saida_em: new Date(criado + 300000).toISOString(), entradas: 1, saidas: 1 });
  }
  let n = 0;
  for (let d = 0; d < 75; d++) for (let c = 0; c < 4; c++) metricas.push({ id: `m${String(n++).padStart(6, '0')}`, plataforma: c % 2 ? 'google' : 'meta', data: dia(d), nivel: 'campanha', campanha_ext: `c${c}`, campanha_nome: `Campanha ${c}`,
    gasto: '40.5', impressoes: '900', alcance: '700', cliques: '30', conversoes: '3', frequencia: '1.2', fonte: 'api' });
  return criarBanco({ leads, agendamentos, clientes, orc_orcamentos: [], patio_os: os, patio_extras: [{ os_id: 'os-1', valor: 50, status: 'aprovado' }],
    perfis: [], conversas: [], ads_metricas_dia: metricas, ads_config: [{ id: true, cpa_alvo: 80, orcamento_mensal: 3000 }], ads_alertas: [], integracoes_ads: [], consultores: [{ id: 'c1', ativo: true }], servicos: [],
    agendamentos_futuros: [], trafego_rastreio: [],
    whatsapp_mensagens: Array.from({ length: 80 }, (_, d) => ({ id: `s${d}`, direcao: 'saida', status: 'enviado', wamid: `w${d}`, created_at: new Date(AGORA - d * 86400000).toISOString() })),
  }, { rpc: { trafego_primeiras_mensagens: ({ p_leads }) => pms.filter(p => p_leads.includes(p.lead_id)) } });
}

const hash = o => crypto.createHash('sha256').update(JSON.stringify(o, (k, v) => (k === 'gerado_em' || k === 'medidas' ? undefined : v))).digest('hex').slice(0, 16);

(async () => {
  J.esquecer();
  const base = banco(QTD), sb = comAtraso(base, LAT);
  let agora = AGORA;
  const relogio = () => agora;
  const fonte = F.criarFonte({ sb, agora: relogio, ...(process.env.R14_VELHO ? { velho: Number(process.env.R14_VELHO) } : {}) });
  const passo = async (rotulo, fn) => {
    base.zerar && base.zerar();
    const t0 = Date.now(), r = await fn();
    console.log(`${rotulo.padEnd(34)} ${String(Date.now() - t0).padStart(5)} ms · idas ${base.idas()} · ${hash(r)}`);
  };
  const q = p => new URLSearchParams(p);
  const telas = async (p) => Promise.all([Hoje.responder({ q: q(p), fonte }), Camp.responderLista({ q: q(p), fonte })]);
  await passo('30d, frio (hoje + campanhas)', () => telas('periodo=30d'));
  await passo('30d, de novo', () => telas('periodo=30d'));
  await passo('7d, frio', () => telas('periodo=7d'));
  await passo('60d, frio', () => telas('periodo=60d'));
  await passo('30d + Meta, depois de 30d', () => telas('periodo=30d&plataforma=meta'));
  if (COM_VELHO) {
    agora += 45000; // passou da memória curta de 30 s
    await passo('30d, 45 s depois (passou da memória)', () => telas('periodo=30d'));
    await dorme(LAT * 8); // dá tempo de uma releitura em segundo plano, se houver
    await passo('30d, logo depois da releitura', () => telas('periodo=30d'));
  }
})().catch(e => { console.error(e); process.exit(1); });
