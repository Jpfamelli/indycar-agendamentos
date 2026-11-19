/* ============================================================
   Leads — do anúncio (ou do site/WhatsApp) ao CRM (rodada 5).
   Lista os leads de um período com canal, campanha, status, valor,
   responsável e os links cruzados (CRM ?lead=, Atendimento ?tel=,
   Agenda ?tel=), e conta "quantos chegaram hoje" por canal.
   Quem vê isto é admin/gestor com acesso ao Ads — a mesma gente que
   abre o CRM. Telefone sai formatado; nenhum segredo.
   ============================================================ */
'use strict';

const db = require('./db');
const A = require('./atribuicao');
const Eco = require('./public/ecossistema.js');
const Ciclo = require('./ciclo');

const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const CANAIS = ['meta', 'google', 'site', 'whatsapp', 'indicacao', 'organico', 'telefone', 'outro'];
const PAGOS = new Set(['meta', 'google']);
const STATUS = ['novo', 'contato', 'orcamento', 'agendado', 'em_servico', 'concluido', 'perdido'];
const STATUS_NOME = { novo: 'Novo', contato: 'Em contato', orcamento: 'Orçamento', agendado: 'Agendado', em_servico: 'Em serviço', concluido: 'Venda fechada', perdido: 'Perdido' };
const AG_VALIDO = A.AG_VALIDO;

/** Canal do lead para a tela: pago (meta/google) pela regra de atribuição; site pela UTM; senão a origem do CRM. */
function canalDe(l) {
  const pago = A.canal(l);
  if (pago) return pago;
  const fonte = norm(l.utm_source), origem = norm(l.origem);
  if (fonte === 'site' || fonte === 'landing' || fonte === 'website') return 'site';
  if (CANAIS.includes(origem)) return origem;
  return 'outro';
}

const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/* Colunas lidas (explícitas): nada de observações/orçamento detalhado. */
const COLUNAS = 'id, cliente_id, responsavel_id, nome, telefone, origem, status, valor_pago, valor_orcado, servico, carro_modelo, placa, utm_source, utm_medium, utm_campaign, created_at, closed_at, updated_at';

/** Lê os leads criados no período (horário de Brasília), paginando (teto 5 mil). */
async function lerLeads(de, ate, { sb = db.sb } = {}) {
  const linhas = [];
  for (let inicio = 0; inicio < 5000; inicio += 1000) {
    const { data, error } = await sb.from('leads').select(COLUNAS)
      .gte('created_at', db.inicioBR(de)).lt('created_at', db.inicioBR(db.diaSeguinte(ate)))
      .order('created_at', { ascending: false }).order('id').range(inicio, inicio + 999);
    if (error) throw new Error('Não foi possível ler os leads do CRM. Tente novamente.');
    linhas.push(...(data || []));
    if ((data || []).length < 1000) return linhas;
  }
  return linhas;
}

/** Próximo agendamento (ou o último) de cada lead — só data/hora/status. */
async function agendamentosDe(leadIds, { sb = db.sb } = {}) {
  const unicos = [...new Set(leadIds.filter(Boolean))], mapa = new Map();
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await sb.from('agendamentos').select('id, lead_id, data, hora, status, valor').in('lead_id', unicos.slice(i, i + 150));
    if (error) continue;   // sem agendamento a lista continua útil
    for (const a of data || []) {
      if (!AG_VALIDO.has(a.status)) continue;
      const atual = mapa.get(a.lead_id);
      if (!atual || String(a.data) > String(atual.data)) mapa.set(a.lead_id, a);
    }
  }
  return mapa;
}

/** Monta a linha que vai para a tela (pura, testada). */
function montarLinha(l, { agendamento = null, responsavel = null, ciclo = null, agora = Date.now() } = {}) {
  const canal = canalDe(l);
  const tel = Eco.telefone(l.telefone);
  return {
    id: l.id, cliente_id: l.cliente_id || null,
    nome: l.nome || '(sem nome)', telefone: tel || null,
    canal, pago: PAGOS.has(canal),
    campanha: l.utm_campaign ? String(l.utm_campaign).slice(0, 120) : null,
    utm_source: l.utm_source || null, utm_medium: l.utm_medium || null,
    status: l.status, status_nome: STATUS_NOME[l.status] || l.status,
    servico: l.servico || null, carro: l.carro_modelo || null, placa: l.placa ? String(l.placa).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : null,
    // Rodada 6: quanto tempo o lead novo espera por um primeiro toque (parado = mais de 24 h sem sair de "Novo").
    idade_horas: l.created_at ? Math.max(0, Math.floor((agora - Date.parse(l.created_at)) / 3600000)) : null,
    parado: l.status === 'novo' && l.created_at ? (agora - Date.parse(l.created_at)) / 3600000 > 24 : false,
    ciclo,
    valor_pago: l.valor_pago == null ? null : Number(l.valor_pago),
    valor_orcado: l.valor_orcado == null ? null : Number(l.valor_orcado),
    sem_valor: l.status === 'concluido' && !(Number(l.valor_pago) > 0),
    criado_em: l.created_at, fechado_em: l.closed_at || null,
    responsavel: responsavel ? responsavel.nome : null, sem_responsavel: !l.responsavel_id,
    agendamento: agendamento ? { id: agendamento.id, data: agendamento.data, hora: agendamento.hora, status: agendamento.status } : null,
    links: {
      crm: Eco.linkLead(l.id),
      atendimento: Eco.linkConversaTel(tel),
      agenda: agendamento ? Eco.linkAgendamento(agendamento.id) : Eco.linkAgendaTel(tel),
      comunicar: Eco.linkComunicarTel(tel),
      orcador: Eco.linkOrcadorTel(tel, l.nome, l.cliente_id, l.id),
      orcamento: ciclo?.orcamento?.link || null,
      os: ciclo?.os?.link || null,
    },
  };
}

/* Ordem da lista (pura): recentes (padrão), antigos, valor (pago, depois orçado), nome. */
const ORDENS = ['recentes', 'antigos', 'valor', 'nome', 'parados'];
function ordenar(lista, criterio = 'recentes') {
  const l = [...lista];
  const valor = x => (x.valor_pago > 0 ? x.valor_pago : x.valor_orcado > 0 ? x.valor_orcado : 0);
  // Mais parados primeiro: lead "Novo" há mais tempo, depois os demais por data.
  if (criterio === 'parados') return l.sort((a, b) => (b.status === 'novo') - (a.status === 'novo') || (a.status === 'novo' ? String(a.criado_em).localeCompare(String(b.criado_em)) : String(b.criado_em).localeCompare(String(a.criado_em))));
  if (criterio === 'antigos') return l.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
  if (criterio === 'valor') return l.sort((a, b) => valor(b) - valor(a) || String(b.criado_em).localeCompare(String(a.criado_em)));
  if (criterio === 'nome') return l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return l.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
}

/* Rodada 6: filtros pelo que aconteceu depois do CRM (Orçador/Pátio). */
const ETAPAS_CICLO = ['oficina', 'patio', 'orc_esperando', 'orc_aprovado', 'entregue', 'sem_orcamento', 'orc_quente', 'desconto', 'follow_vencido'];
function noCiclo(l, etapa) {
  const c = l.ciclo;
  if (etapa === 'oficina') return !!c?.os && c.os.etapa !== 'cancelado';
  if (etapa === 'patio') return !!c?.os?.no_patio;
  if (etapa === 'entregue') return !!c?.os?.entregue;
  if (etapa === 'orc_esperando') return c?.orcamento?.status === 'enviado';
  if (etapa === 'orc_aprovado') return c?.orcamento?.status === 'aprovado';
  // Rodada 7: abriu e não respondeu, desconto pedido, retorno combinado vencido.
  if (etapa === 'orc_quente') return !!c?.orcamento?.quente;
  if (etapa === 'desconto') return !!c?.orcamento?.desconto_pedido;
  if (etapa === 'follow_vencido') return !!c?.orcamento?.follow_vencido;
  if (etapa === 'sem_orcamento') return !c?.orcamento && ['agendado', 'em_servico', 'orcamento'].includes(l.status);
  return true;
}

/** Filtro de tela (puro): canal, status, busca por nome/telefone/campanha. */
function filtrar(lista, { canal = null, status = null, q = null, soPagos = false, semResponsavel = false, etapa = null } = {}) {
  const termo = norm(q), digitos = String(q || '').replace(/\D/g, '');
  return lista.filter(l => {
    if (canal && canal !== 'todos' && l.canal !== canal) return false;
    if (soPagos && !l.pago) return false;
    if (semResponsavel && !l.sem_responsavel) return false;
    if (status && status !== 'todos' && l.status !== status) return false;
    if (etapa && !noCiclo(l, etapa)) return false;
    if (termo) {
      const alvo = norm(`${l.nome} ${l.campanha || ''} ${l.servico || ''} ${l.carro || ''} ${l.responsavel || ''} ${l.placa || ''}`);
      if (!alvo.includes(termo) && !(digitos.length >= 4 && String(l.telefone || '').includes(digitos))) return false;
    }
    return true;
  });
}

/** Contagens por canal e por status (puro). */
function resumo(lista) {
  const por_canal = {}, por_status = {};
  let pagos = 0, fechados = 0, receita = 0, sem_valor = 0, sem_responsavel = 0, agendados = 0;
  let orc_quentes = 0, descontos = 0, sem_orcamento = 0, no_patio = 0, orc_esperando = 0, orc_aprovado = 0, entregues_oficina = 0, valor_orcado_aberto = 0, parados = 0;
  for (const l of lista) {
    if (noCiclo(l, 'sem_orcamento')) sem_orcamento++;
    if (l.ciclo?.os?.no_patio) no_patio++;
    if (l.ciclo?.orcamento?.quente) orc_quentes++;
    if (l.ciclo?.orcamento?.desconto_pedido) descontos++;
    if (l.ciclo?.os?.entregue) entregues_oficina++;
    if (l.ciclo?.orcamento?.status === 'enviado') { orc_esperando++; valor_orcado_aberto += l.ciclo.orcamento.total || 0; }
    if (l.ciclo?.orcamento?.status === 'aprovado') orc_aprovado++;
    if (l.parado) parados++;
    por_canal[l.canal] = (por_canal[l.canal] || 0) + 1;
    por_status[l.status] = (por_status[l.status] || 0) + 1;
    if (l.pago) pagos++;
    if (l.agendamento) agendados++;
    if (l.status === 'concluido') { fechados++; if (l.valor_pago > 0) receita += l.valor_pago; else sem_valor++; }
    if (l.sem_responsavel) sem_responsavel++;
  }
  return { total: lista.length, orc_quentes, descontos, sem_orcamento, no_patio, orc_esperando, orc_aprovado, entregues_oficina, valor_orcado_aberto, parados, pagos, agendados, fechados, receita, sem_valor, sem_responsavel, por_canal, por_status };
}

/**
 * Lista completa de um período, já com agendamento e responsável.
 * `nomes` e `sb` injetáveis para os testes.
 */
async function listar({ de, ate, canal = null, status = null, q = null, soPagos = false, semResponsavel = false, etapa = null, limite = 500, ordem = 'recentes',
  sb = db.sb, nomes = ids => require('./equipe').banco().nomesDosPerfis(ids), ler = Ciclo.ler, agora = Date.now() } = {}) {
  const brutos = await lerLeads(de, ate, { sb });
  const [ags, mapaNomes] = await Promise.all([
    agendamentosDe(brutos.map(l => l.id), { sb }),
    nomes(brutos.map(l => l.responsavel_id).filter(Boolean)).catch(() => new Map()),
  ]);
  const todos = brutos.map(l => montarLinha(l, { agendamento: ags.get(l.id) || null, responsavel: l.responsavel_id ? mapaNomes.get(l.responsavel_id) : null, agora }));
  const base = filtrar(todos, { canal, status, q, soPagos, semResponsavel });
  // Orçador e Pátio só para quem passou nos filtros (teto de 1.500 leads); se não responderem, a lista segue sem os chips.
  const paraCiclo = base.slice(0, 1500);
  const lido = await ler(paraCiclo.map(l => l.id), { sb });
  for (const l of paraCiclo) l.ciclo = Ciclo.resumoDoLead(lido.porLead.get(l.id), agora);
  for (const l of paraCiclo) { l.links.orcamento = l.ciclo?.orcamento?.link || null; l.links.os = l.ciclo?.os?.link || null; }
  const filtrados = ordenar(etapa ? base.filter(l => noCiclo(l, etapa)) : base, ordem);
  return {
    ciclo_ok: lido.ok, ciclo_erro: lido.ok ? null : 'Orçador e Pátio não responderam; a lista está sem as etapas deles.',
    periodo: { de, ate }, total_periodo: todos.length,
    resumo: resumo(filtrados), resumo_periodo: resumo(todos),
    leads: filtrados.slice(0, limite), cortado: filtrados.length > limite,
    canais: CANAIS, status_nomes: STATUS_NOME,
  };
}

/** "Leads de hoje": contagens por canal + os últimos chegados (para o cartão do Painel). Cache de 30 s: o cartão
    se atualiza sozinho em cada navegador aberto e não precisa bater no banco a cada um. */
let cacheHoje = { valor: null, em: 0 };
async function hoje({ sb = db.sb, nomes, fresco = false } = {}) {
  if (!fresco && cacheHoje.valor && Date.now() - cacheHoje.em < 30_000 && cacheHoje.valor.dia === hojeBR()) return cacheHoje.valor;
  const dia = hojeBR();
  const r = await listar({ de: dia, ate: dia, limite: 8, sb, ...(nomes ? { nomes } : {}) });
  const ultimo = r.leads[0] || null;
  const saida = { dia, ...r.resumo_periodo, ultimos: r.leads, ultimo_em: ultimo ? ultimo.criado_em : null,
    link_crm: Eco.link('crm'), link_atendimento: Eco.link('atendimento') };
  if (!sb || sb === db.sb) cacheHoje = { valor: saida, em: Date.now() };
  return saida;
}
function esquecerHoje() { cacheHoje = { valor: null, em: 0 }; }

/** Linha "no CRM, por canal" para o relatório diário de uma data (pura sobre a lista). */
function fraseDoDia(res) {
  if (!res || !res.total) return 'Nenhum lead novo no CRM.';
  const partes = [];
  const n = c => res.por_canal[c] || 0;
  if (n('site')) partes.push(`${n('site')} do site`);
  if (n('whatsapp')) partes.push(`${n('whatsapp')} pelo WhatsApp`);
  if (n('meta') || n('google')) partes.push(`${n('meta') + n('google')} de anúncio${n('meta') && n('google') ? ` (Meta ${n('meta')} · Google ${n('google')})` : ''}`);
  const outros = res.total - n('site') - n('whatsapp') - n('meta') - n('google');
  if (outros > 0) partes.push(`${outros} de outros canais`);
  return `${res.total} lead(s) novo(s) no CRM: ${partes.join(', ')}.${res.sem_responsavel ? ` ${res.sem_responsavel} sem responsável.` : ''}`;
}

/** Rodada 7: frase curta do que o cliente fez com o orçamento (puro; vai no CSV). */
function sinalDoOrcamento(o) {
  if (!o) return '';
  const p = [];
  if (o.quente) p.push(`abriu há ${o.visto_horas ?? 0} h e não respondeu`);
  else if (o.status === 'enviado') p.push('ainda não abriu');
  if (o.desconto_pedido) p.push('pediu desconto');
  if (o.follow_vencido) p.push('retorno vencido');
  if (o.pediu_horario) p.push('pediu horário');
  return p.join('; ');
}

/* CSV dos leads (sem observações). */
const CAMPOS_CSV = [['criado_em', 'Criado em'], ['nome', 'Nome'], ['telefone', 'Telefone'], ['canal', 'Canal'], ['campanha', 'Campanha (UTM)'],
  ['status_nome', 'Status'], ['idade_horas', 'Idade (h)'], ['servico', 'Serviço'], ['carro', 'Carro'], ['valor_orcado', 'Valor orçado'], ['valor_pago', 'Valor pago'],
  ['responsavel', 'Responsável'], ['agendamento_txt', 'Agendamento'], ['placa', 'Placa'],
  ['orcamento_txt', 'Orçamento'], ['orc_sinal_txt', 'Sinal do orçamento'], ['patio_txt', 'Pátio'], ['link_crm', 'Link no CRM'], ['link_orcamento', 'Link do orçamento'], ['link_os', 'Link da OS']];
const CANAL_NOME = { meta: 'Meta', google: 'Google', site: 'Site', whatsapp: 'WhatsApp', indicacao: 'Indicação', organico: 'Orgânico', telefone: 'Telefone', outro: 'Outro' };
function csv(lista) {
  return A.montarCSV(CAMPOS_CSV, lista.map(l => ({
    ...l, canal: CANAL_NOME[l.canal] || l.canal,
    criado_em: l.criado_em ? new Date(l.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
    agendamento_txt: l.agendamento ? `${l.agendamento.data} ${String(l.agendamento.hora || '').slice(0, 5)} (${l.agendamento.status})` : '',
    link_crm: l.links.crm,
    orcamento_txt: l.ciclo?.orcamento ? `${l.ciclo.orcamento.status_nome}${l.ciclo.orcamento.total != null ? ' R$ ' + String(l.ciclo.orcamento.total).replace('.', ',') : ''}` : '',
    patio_txt: l.ciclo?.os ? l.ciclo.os.etapa_nome : '',
    orc_sinal_txt: sinalDoOrcamento(l.ciclo?.orcamento),
    link_orcamento: l.links.orcamento || '', link_os: l.links.os || '',
  })));
}

/** Leads do mês corrente (todos os canais) para o cartão "Mês corrente": total, pagos e custo por lead pago. */
async function resumoDoMes({ sb = db.sb, gastoMes = 0 } = {}) {
  const hoje = hojeBR();
  const r = await listar({ de: `${hoje.slice(0, 7)}-01`, ate: hoje, limite: 1, sb, nomes: async () => new Map(), ler: async () => ({ porLead: new Map(), ok: true }) });
  const t = r.resumo_periodo;
  return { total: t.total, pagos: t.pagos, agendados: t.agendados, fechados: t.fechados, sem_responsavel: t.sem_responsavel,
    custo_lead_pago: t.pagos > 0 && gastoMes > 0 ? gastoMes / t.pagos : null };
}

module.exports = { sinalDoOrcamento, listar, hoje, esquecerHoje, filtrar, resumo, ordenar, resumoDoMes, montarLinha, canalDe, fraseDoDia, csv, CANAIS, CANAL_NOME, STATUS, STATUS_NOME, ORDENS, ETAPAS_CICLO, noCiclo, lerLeads, hojeBR };
