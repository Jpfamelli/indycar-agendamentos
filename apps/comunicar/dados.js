// -----------------------------------------------------------------------------
// Camada de dados do IndyCar Comunicar — fala com o MESMO Supabase do CRM, da
// Agenda e do Atendimento. Aqui moram:
//   • clientes (tabela compartilhada: nascimento + consentimento)
//   • posvenda_config    — réguas automáticas, textos e janela de envio
//   • posvenda_envios    — fila e histórico de mensagens (com a resposta do cliente)
//   • posvenda_respostas — satisfação do cliente
//   • comunicar_regras_retorno — prazo de revisão por tipo de serviço
//   • comunicar_modelos  — biblioteca de mensagens prontas
// Os GERADORES (as réguas) também moram aqui: eles só enfileiram; quem envia é
// o server.js, pelo WhatsApp da empresa. Tudo passa pelo "porteiro": quem pediu
// para não receber não entra na fila, e ninguém recebe duas mensagens de
// relacionamento em menos de N dias.
// -----------------------------------------------------------------------------

import {
  selecionar, selecionarUm, selecionarTudo,
  inserir, inserirUm, atualizar, atualizarUm, remover, contar, rpc,
} from './supabase.js';
import { validadeDoEnvio, esperaDaTentativa } from './carteiro.js';
import { TIPOS_PATIO, ROTULO_PATIO, linkArea, linkOs, usaLinkArea, usaLinkOs, PATIO_URL } from './patio.js';
import { mesclarPreferencias, LINKS } from './acesso.js';
import { classificarErro } from './whatsapp.js';

const T = {
  clientes: 'clientes',
  agendamentos: 'agendamentos',
  leads: 'leads',
  config: 'posvenda_config',
  envios: 'posvenda_envios',
  respostas: 'posvenda_respostas',
  perfis: 'perfis',
  regras: 'comunicar_regras_retorno',
  modelos: 'comunicar_modelos',
  v360: 'v_cliente_360',
  vigia: 'vigia_estado',
  conversas: 'conversas',
  mensagens: 'whatsapp_mensagens',
  iaConfig: 'ia_config',
  iaAcoes: 'ia_acoes',
  agendaIa: 'agenda_ia_config',
};

const LINHA_UNICA = 'id=is.true';

/** As réguas automáticas, na ordem em que aparecem na tela. */
export const REGUAS = [
  'lembrete', 'posvenda', 'avaliacao', 'retorno', 'aniversario', 'orcamento', 'nao_fechou', 'reativacao',
];
/** Tipos que contam como "relacionamento" para o intervalo mínimo entre mensagens. */
const TIPOS_RELACIONAMENTO = new Set(['aniversario', 'retorno', 'reativacao', 'orcamento', 'nao_fechou', 'campanha', 'avulsa']);
export const TIPOS_ENVIO = ['aniversario', 'posvenda', 'retorno', 'campanha', 'avulsa', 'lembrete', 'remarcacao', 'orcamento', 'nao_fechou', 'reativacao', 'avaliacao', ...TIPOS_PATIO];

// ============================================================================
// UTILIDADES PURAS (sem banco) — testáveis com `npm test`
// ============================================================================

export const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

/** Mesma normalização da coluna gerada clientes.telefone_e164 (sem DDI 55). */
export function telefoneNacional(t) {
  const d = soDigitos(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d.slice(2);
  return d || null;
}

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Data de hoje no fuso da oficina — NUNCA toISOString (UTC vira amanhã às 21h). */
export function hoje() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Agora, no fuso da oficina: data ISO, hora (0-23), minuto e dia da semana (0=dom). */
export function agoraSP(instante = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(instante);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const semana = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: semana[p.weekday] ?? new Date().getDay(),
  };
}

/** Soma dias a uma data 'YYYY-MM-DD' sem sair do calendário (meio-dia evita virada). */
export function somarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Instante de uma data/hora da oficina como ISO UTC p/ o banco (SP = UTC-3 fixo). */
export function instanteSP(dataIso, horaHM = '00:00') {
  return new Date(`${dataIso}T${String(horaHM).slice(0, 5)}:00-03:00`);
}

/** Instante de hoje às HH:MM no fuso da oficina, como ISO UTC p/ o banco. */
function hojeAs(horaHM) {
  return instanteSP(hoje(), horaHM).toISOString();
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());
const uuidOuNulo = (v) => (ehUuid(v) ? String(v).trim() : null);

/** Escapa o termo de busca para dentro de or=(...) do PostgREST. */
function termoBusca(q) {
  const limpo = String(q ?? '').replace(/["\\(),]/g, ' ').trim();
  return `"*${limpo}*"`;
}

/** 'YYYY-MM-DD' válida ou null (aceita DD/MM/AAAA e DD/MM da planilha). */
export function dataBanco(d) {
  if (d === null || d === undefined) return null;
  const t = String(d).trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const p = (n) => String(n).padStart(2, '0');
    return `${m[3]}-${p(m[2])}-${p(m[1])}`;
  }
  // só dia/mês ('12/05'): para parabéns o ano não importa. 1904 (bissexto) é o marcador.
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const p = (n) => String(n).padStart(2, '0');
    const mes = Number(m[2]), dia = Number(m[1]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return `1904-${p(mes)}-${p(dia)}`;
  }
  return null;
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** "hoje às 14:30" · "amanhã às 09:00" · "sexta-feira (13/10) às 09:00". */
export function quandoRelativo(dataIso, horaHM, hojeIso = hoje()) {
  const hora = String(horaHM || '').slice(0, 5);
  const as = hora ? ` às ${hora}` : '';
  if (dataIso === hojeIso) return `hoje${as}`;
  if (dataIso === somarDias(hojeIso, 1)) return `amanhã${as}`;
  const d = new Date(dataIso + 'T12:00:00');
  const [, m, dia] = dataIso.split('-');
  return `${DIAS_SEMANA[d.getDay()]} (${dia}/${m})${as}`;
}

/**
 * Qual regra de retorno casa com o serviço? Devolve { meses, regra }.
 * Compara sem acento e sem caixa; a primeira regra (por ordem) que casar vence.
 */
export function prazoDeRetorno(servico, regras = [], padraoMeses = 6) {
  const s = semAcento(servico);
  if (s) {
    for (const r of regras) {
      if (r.ativo === false) continue;
      const palavras = Array.isArray(r.palavras) ? r.palavras : String(r.palavras || '').split(',');
      if (palavras.some((p) => p && s.includes(semAcento(p)))) return { meses: Number(r.meses) || padraoMeses, regra: r };
    }
  }
  return { meses: padraoMeses, regra: null };
}

/** Substitui {nome} {primeiro_nome} {carro} {placa} {servico} {meses} {quando} … no texto. */
export function renderTemplate(corpo, ctx = {}) {
  const primeiro = String(ctx.nome || '').trim().split(/\s+/)[0] || '';
  const mapa = { ...ctx, primeiro_nome: primeiro, carro: ctx.carro || 'seu carro' };
  return String(corpo ?? '').replace(/\{(\w+)\}/g, (_, k) => (mapa[k] ?? ''))
    .replace(/[ \t]{2,}/g, ' ').trim();
}

/** Espelho em JS da classificação feita pelo gatilho do banco (para prévia e testes). */
export function classificarResposta(texto) {
  const t = String(texto || '').trim().toLowerCase();
  if (!t) return 'neutra';
  const b = (re) => new RegExp(`(^|[^\\p{L}\\p{N}])(${re})([^\\p{L}\\p{N}]|$)`, 'u').test(t);
  if (b('parar|sair|remover|cancelar|descadastr|n[aã]o quero (mais )?(receber|mensag)|stop')) return 'parar';
  if (b('n[aã]o|nao ficou|ruim|p[eé]ssim|problema|reclama|insatisf|piorou|voltou|barulho|defeito|👎|😞|😡|😠')) return 'negativa';
  if (b('sim|ok|certo|tudo certo|tudo bem|[oó]tim|excelente|perfeito|show|top|maravilh|obrigad|valeu|gostei|ficou bom|confirm|pode ser|quero|vamos|bora|beleza|👍|🙏|😀|😊|❤|🏁')) return 'positiva';
  return 'neutra';
}

/** Rótulos legíveis dos tipos — a tela e o servidor usam os mesmos. */
export const ROTULO_TIPO = {
  lembrete: 'Lembrete de horário', posvenda: 'Pós-venda', avaliacao: 'Avaliação no Google',
  retorno: 'Revisão', aniversario: 'Aniversário', orcamento: 'Orçamento parado',
  nao_fechou: 'Não fechou', reativacao: 'Reativação', campanha: 'Campanha', avulsa: 'Avulsa',
  remarcacao: 'Horário remarcado', // rodada 5: aviso que a Agenda manda quando remarca (antes entrava como avulsa)
  ...ROTULO_PATIO,   // Pátio (16/10/2026): avisos da oficina e convite da Área do Cliente
};

// ============================================================================
// CLIENTES (tabela compartilhada)
// ============================================================================

function lerCliente(r) {
  if (!r) return null;
  return {
    id: r.id,
    nome: r.nome,
    telefone: r.telefone,
    carro: [r.carro_modelo, r.carro_ano].filter(Boolean).join(' ') || null,
    carro_modelo: r.carro_modelo ?? null,
    placa: r.placa ?? null,
    email: r.email ?? null,
    nascimento: r.nascimento ?? null,
    aceita_mensagens: r.aceita_mensagens !== false,
    aceita_mensagens_em: r.aceita_mensagens_em ?? null,
    aceita_mensagens_motivo: r.aceita_mensagens_motivo ?? null,
    observacoes: r.observacoes ?? null,
    created_at: r.created_at,
  };
}

const CAMPOS_CLIENTE = 'id,nome,telefone,carro_modelo,carro_ano,placa,email,nascimento,aceita_mensagens,aceita_mensagens_em,aceita_mensagens_motivo,observacoes,created_at';

export async function listarClientes(q, { limite = 500 } = {}) {
  const p = new URLSearchParams(`select=${CAMPOS_CLIENTE}`);
  if (q) {
    const t = termoBusca(q);
    const dig = soDigitos(q);
    const partes = [`nome.ilike.${t}`, `placa.ilike.${t}`];
    if (dig.length >= 4) partes.push(`telefone.ilike."*${dig}*"`, `telefone_e164.ilike."*${telefoneNacional(dig) || dig}*"`);
    p.set('or', `(${partes.join(',')})`);
  }
  p.set('order', 'nome.asc');
  p.set('limit', String(limite));
  const linhas = await selecionar(T.clientes, p);
  return linhas.map(lerCliente);
}

export async function obterCliente(id) {
  if (!ehUuid(id)) return null;
  return lerCliente(await selecionarUm(T.clientes, `select=${CAMPOS_CLIENTE}&id=eq.${id}`));
}

/** Só os campos que o Comunicar pode mexer — a ficha completa é do CRM. */
export async function atualizarCliente(id, dados, quem = null) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.nascimento !== undefined) campos.nascimento = dataBanco(dados.nascimento);
  if (dados.telefone !== undefined) campos.telefone = soDigitos(dados.telefone) || null;
  if (dados.email !== undefined) campos.email = dados.email || null;
  if (dados.observacoes !== undefined) campos.observacoes = dados.observacoes || null;
  if (dados.aceita_mensagens === true || dados.aceita_mensagens === false) {
    campos.aceita_mensagens = dados.aceita_mensagens;
    campos.aceita_mensagens_em = new Date().toISOString();
    campos.aceita_mensagens_motivo = dados.aceita_mensagens
      ? null
      : `desligado no painel${quem ? ` por ${quem}` : ''}${dados.motivo ? `: ${String(dados.motivo).slice(0, 120)}` : ''}`;
  }
  if (!Object.keys(campos).length) return obterCliente(id);
  return lerCliente(await atualizarUm(T.clientes, `id=eq.${id}&select=${CAMPOS_CLIENTE}`, campos));
}

/** Busca clientes por lista de ids, em lotes (a URL do PostgREST tem limite). */
async function clientesPorIds(ids) {
  const unicos = [...new Set(ids.filter(ehUuid))];
  const saida = [];
  for (let i = 0; i < unicos.length; i += 80) {
    const lote = unicos.slice(i, i + 80);
    const p = new URLSearchParams(`select=${CAMPOS_CLIENTE}`);
    p.set('id', `in.(${lote.join(',')})`);
    saida.push(...(await selecionar(T.clientes, p)).map(lerCliente));
  }
  return saida;
}

/**
 * Importação de planilha: upsert por telefone (telefone_e164). Só PREENCHE o que
 * está vazio — a planilha não sobrescreve a ficha viva; nascimento atualiza sempre.
 */
export async function importarClientes(linhas) {
  const resultado = { criados: 0, atualizados: 0, ignorados: 0, avisos: [] };
  for (const [i, l] of linhas.entries()) {
    try {
      const nome = String(l.nome ?? '').trim();
      const tel = soDigitos(l.telefone);
      if (!nome || !tel || tel.length < 8) {
        resultado.ignorados++;
        resultado.avisos.push(`Linha ${i + 1}: sem nome ou telefone válido — pulada.`);
        continue;
      }
      const nasc = l.nascimento !== undefined ? dataBanco(l.nascimento) : undefined;
      if (l.nascimento && nasc === null) {
        resultado.avisos.push(`Linha ${i + 1} (${nome}): não entendi a data "${l.nascimento}" — use DD/MM/AAAA.`);
      }

      const nacional = telefoneNacional(tel);
      const p = new URLSearchParams('select=id,nascimento,carro_modelo,placa,email');
      p.set('telefone_e164', `eq.${nacional}`);
      p.set('limit', '1');
      const existente = await selecionarUm(T.clientes, p);

      const extras = {};
      if (nasc) extras.nascimento = nasc;
      if (l.veiculo) extras.carro_modelo = String(l.veiculo).trim();
      if (l.placa) extras.placa = String(l.placa).trim().toUpperCase();
      if (l.email) extras.email = String(l.email).trim();

      if (existente) {
        const campos = {};
        for (const [k, v] of Object.entries(extras)) {
          if (existente[k] === null || existente[k] === undefined || existente[k] === '') campos[k] = v;
        }
        if (nasc) campos.nascimento = nasc;
        if (Object.keys(campos).length) {
          await atualizarUm(T.clientes, `id=eq.${existente.id}`, campos);
          resultado.atualizados++;
        } else {
          resultado.ignorados++;
        }
      } else {
        await inserirUm(T.clientes, { nome, telefone: tel, origem: 'organico', ...extras }, 'select=id');
        resultado.criados++;
      }
    } catch (e) {
      resultado.ignorados++;
      resultado.avisos.push(`Linha ${i + 1}: ${e?.message || e}`);
    }
  }
  return resultado;
}

// ============================================================================
// FICHA DO CLIENTE (o que o Comunicar sabe dele)
// ============================================================================

export async function fichaCliente(id) {
  const cliente = await obterCliente(id);
  if (!cliente) return null;
  const [v360, regras, cfg, ultimos, envios, respostas] = await Promise.all([
    selecionarUm(T.v360, `select=total_leads,total_agendamentos,servicos_feitos,faltas,total_gasto,ultimo_servico_em,proximo_horario&id=eq.${id}`),
    listarRegras(),
    obterConfig(),
    selecionar(T.agendamentos, `select=id,servico,data,hora,status,valor,veiculo&cliente_id=eq.${id}&order=data.desc,hora.desc&limit=6`),
    selecionar(T.envios, `select=id,tipo,status,corpo,enviar_em,enviado_em,respondido_em,resposta,resposta_tipo,agendou_depois_id,motivo_pulado&cliente_id=eq.${id}&order=created_at.desc&limit=10`),
    selecionar(T.respostas, `select=id,satisfeito,nota,comentario,origem,created_at&cliente_id=eq.${id}&order=created_at.desc&limit=5`),
  ]);
  const ultimoServico = ultimos.find((a) => a.status === 'concluido') || null;
  let proximaRevisao = null;
  if (ultimoServico) {
    const { meses, regra } = prazoDeRetorno(ultimoServico.servico, regras, cfg.meses_retorno);
    proximaRevisao = {
      data: somarDias(ultimoServico.data, meses * 30), meses,
      regra: regra?.rotulo || 'padrão', servico: ultimoServico.servico,
    };
  }
  // rodada 5: o que os outros apps sabem deste cliente (rpc cliente_360 pelo telefone normalizado)
  const ligacoes = cliente.telefone ? await ligacoesDoCliente(cliente.telefone).catch(() => null) : null;
  return {
    cliente,
    resumo: v360 ? {
      servicos_feitos: Number(v360.servicos_feitos) || 0, faltas: Number(v360.faltas) || 0,
      total_gasto: Number(v360.total_gasto) || 0, ultimo_servico_em: v360.ultimo_servico_em,
      proximo_horario: v360.proximo_horario,
    } : null,
    ultimoServico, proximaRevisao, agendamentos: ultimos, envios, respostas, ligacoes,
  };
}

// ============================================================================
// RODADA 5 — ficha 360 (rpc cliente_360), ligações cruzadas e links nas réguas
// ============================================================================

/** A ficha inteira de um telefone, como o banco devolve (rpc cliente_360). null sem telefone válido. */
export async function cliente360(telefone) {
  const t = telefoneNacional(telefone);
  if (!t || t.length < 10) return null;
  const r = await rpc('cliente_360', { p_telefone: t });
  return r && typeof r === 'object' ? r : null;
}

/** Pura: do JSON do cliente_360 para os links que a tela mostra (conversa, leads, OS, orçamentos, tarefas). */
export function montarLigacoes(c360) {
  if (!c360 || typeof c360 !== 'object') return null;
  const conv = c360.conversa || null;
  const leads = Array.isArray(c360.leads) ? c360.leads : [];
  const patio = Array.isArray(c360.patio) ? c360.patio : [];
  const orcs = Array.isArray(c360.orcamentos) ? c360.orcamentos : [];
  const tarefas = Array.isArray(c360.tarefas) ? c360.tarefas : [];
  const ags = Array.isArray(c360.agendamentos) ? c360.agendamentos : [];
  const ind = c360.indicacoes || {};
  const naOficina = patio.find((o) => o && !['entregue', 'cancelado'].includes(o.etapa)) || null;
  return {
    telefone: c360.telefone || null,
    conversa: conv ? { id: conv.id, status: conv.status || null, etapa: conv.etapa || null, atribuida_a: conv.atribuida_a_nome || conv.atribuida_a || null, aguardando_consultor: !!conv.aguardando_consultor, link: LINKS.conversa(conv.id) } : null,
    leads: leads.slice(0, 5).map((l) => ({ id: l.id, status: l.status, servico: l.servico || null, valor_orcado: l.valor_orcado ?? null, responsavel: l.responsavel_nome || null, created_at: l.created_at || null, link: LINKS.lead(l.id) })),
    patio: patio.slice(0, 5).map((o) => ({ id: o.id, numero: o.numero ?? null, etapa: o.etapa, veiculo: o.veiculo || null, placa: o.placa || null, extras_pendentes: Number(o.extras_pendentes) || 0, link: LINKS.os(o.id), link_cliente: o.link_cliente || null })),
    carroNaOficina: naOficina ? { id: naOficina.id, numero: naOficina.numero ?? null, etapa: naOficina.etapa, link: LINKS.os(naOficina.id), link_cliente: naOficina.link_cliente || null } : null,
    orcamentos: orcs.slice(0, 5).map((o) => ({ id: o.id, status: o.status, total: o.total ?? o.valor ?? null, created_at: o.created_at || null, link: LINKS.orcamento(o.id) })),
    agendamentos: ags.slice(0, 5).map((a) => ({ id: a.id, data: a.data, hora: a.hora, servico: a.servico, status: a.status, consultor: a.consultor_nome || null, link: LINKS.agendamento(a.id) })),
    tarefas: tarefas.slice(0, 5).map((t) => ({ id: t.id, titulo: t.titulo, vence_em: t.vence_em || null, responsavel: t.responsavel_nome || null, origem: t.origem || null })),
    indicacoes: { fez: Array.isArray(ind.fez) ? ind.fez.length : 0, foiIndicadoPor: ind.foi_indicado_por?.nome || ind.foi_indicado_por || null },
    resumo: c360.resumo || null,
  };
}

/** Ligações de um telefone (conversa, lead, pátio, orçamentos, tarefas) — pela rpc. */
export async function ligacoesDoCliente(telefone) {
  return montarLigacoes(await cliente360(telefone));
}

/** Ordens do Pátio pelos agendamentos (para {link_os} nas réguas e para a ficha do envio). */
export async function ordensPorAgendamento(ids) {
  const lista = [...new Set((ids || []).filter(ehUuid))];
  if (!lista.length) return new Map();
  const linhas = await selecionar('patio_os', `select=id,numero,etapa,agendamento_id,token_publico&agendamento_id=in.(${lista.join(',')})&order=created_at.desc`).catch(() => []);
  const mapa = new Map();
  for (const o of linhas) if (!mapa.has(o.agendamento_id)) mapa.set(o.agendamento_id, o);
  return mapa;
}

/**
 * Ficha de um envio: onde ele toca nos outros apps — conversa (Atendimento),
 * lead (CRM), horário (Agenda) e ordem (Pátio). Busca pelo telefone normalizado
 * o que o envio não trouxe gravado.
 */
export async function ligacoesDoEnvio(id) {
  if (!ehUuid(id)) return null;
  const e = await selecionarUm(T.envios, `select=${CAMPOS_ENVIO}&id=eq.${id}`);
  if (!e) return null;
  const c360 = await cliente360(e.telefone).catch(() => null);
  const lig = montarLigacoes(c360) || {};
  let osId = /^patio_(entrada|extra|pronto):([0-9a-f-]{36})/i.exec(String(e.chave_unica || ''))?.[2] || null;
  if (!osId && e.agendamento_id) osId = (await ordensPorAgendamento([e.agendamento_id])).get(e.agendamento_id)?.id || null;
  const conversaId = e.conversa_id || lig.conversa?.id || null;
  return {
    envio: { id: e.id, tipo: e.tipo, status: e.status, nome: e.nome, telefone: e.telefone, cliente_id: e.cliente_id, enviar_em: e.enviar_em, enviado_em: e.enviado_em },
    links: {
      conversa: conversaId ? LINKS.conversa(conversaId) : LINKS.conversaTel(e.telefone),
      lead: LINKS.lead(e.lead_id || lig.leads?.[0]?.id || null),
      agendamento: LINKS.agendamento(e.agendamento_id),
      os: LINKS.os(osId || lig.carroNaOficina?.id || null),
      cliente_crm: LINKS.clienteCrm(e.cliente_id, e.telefone),
    },
    ligacoes: lig,
  };
}

/**
 * Links que uma régua pode usar no texto: {link_os} (acompanhar a ordem do Pátio
 * ligada ao agendamento) e {link_area} (Área do Cliente — um link novo por
 * cliente). O gerador só gasta consulta/rpc quando o texto pede.
 *   ctx.links = { os: Map(agendamento_id → link|null), area: Map(cliente_id → link|null) }
 * Em simulação o {link_area} vira um marcador (a rpc gera um token de verdade).
 */
export async function linksDaRegua(template, { cliente_id = null, agendamento_id = null }, ctx = {}) {
  const saida = {};
  ctx.links ||= { os: new Map(), area: new Map(), areaGastos: 0 };
  if (usaLinkOs(template)) {
    let link = null;
    if (ehUuid(agendamento_id)) {
      if (!ctx.links.os.has(agendamento_id)) {
        const o = (await ordensPorAgendamento([agendamento_id]).catch(() => new Map())).get(agendamento_id);
        const cfgP = await patioConfig().catch(() => null);
        ctx.links.os.set(agendamento_id, o?.token_publico ? linkOs(cfgP?.link_base || PATIO_URL, o.token_publico) : null);
      }
      link = ctx.links.os.get(agendamento_id);
    }
    saida.link_os = link || '';
  }
  if (usaLinkArea(template)) {
    let link = null;
    if (ehUuid(cliente_id)) {
      if (ctx.simular) link = `${PATIO_URL}/minha/?c=(link-do-cliente)`;
      else if (ctx.links.area.has(cliente_id)) link = ctx.links.area.get(cliente_id);
      else if (ctx.links.areaGastos < 60) { // teto por rodada: a rpc gera um token por chamada
        ctx.links.areaGastos++;
        link = await gerarLinkArea(cliente_id).catch(() => null);
        ctx.links.area.set(cliente_id, link);
      }
    }
    saida.link_area = link || '';
  }
  return saida;
}

/** Pura: o texto tem {link_os}/{link_area} mas o cliente não tem o link? Então a mensagem não sai (link quebrado não vai para o cliente). */
export function faltaLink(template, links) {
  if (usaLinkOs(template) && !links?.link_os) return 'sem ordem no Pátio para este horário (o {link_os} ficaria vazio)';
  if (usaLinkArea(template) && !links?.link_area) return 'sem cadastro de cliente para gerar o {link_area}';
  return null;
}

// ============================================================================
// CONFIGURAÇÃO (linha única)
// ============================================================================

const FAIXAS = {
  dias_posvenda: [0, 30], meses_retorno: [1, 24], horas_lembrete: [1, 72], dias_orcamento: [1, 30],
  dias_nao_fechou: [1, 60], meses_reativacao: [3, 36], intervalo_minimo_dias: [0, 60],
  janela_inicio: [0, 23], janela_fim: [1, 24], limite_por_hora: [1, 500],
  // rodada 5: cadência segura
  limite_por_minuto: [1, 60], limite_por_dia: [1, 5000], intervalo_mesmo_cliente_min: [0, 1440],
};
export const PADRAO_NUM = {
  dias_posvenda: 2, meses_retorno: 6, horas_lembrete: 20, dias_orcamento: 3, dias_nao_fechou: 7,
  meses_reativacao: 12, intervalo_minimo_dias: 7, janela_inicio: 8, janela_fim: 20, limite_por_hora: 60,
  limite_por_minuto: 10, limite_por_dia: 300, intervalo_mesmo_cliente_min: 60,
};

export async function obterConfig() {
  const c = (await selecionarUm(T.config, `select=*&${LINHA_UNICA}`)) || {};
  const cfg = {};
  for (const r of REGUAS) {
    cfg[`ativo_${r}`] = !!c[`ativo_${r}`];
    cfg[`msg_${r}`] = c[`msg_${r}`] || '';
  }
  for (const [k, padrao] of Object.entries(PADRAO_NUM)) cfg[k] = Number(c[k] ?? padrao);
  cfg.hora_envio = String(c.hora_envio || '09:30').slice(0, 5);
  cfg.link_avaliacao = c.link_avaliacao || '';
  cfg.envia_domingo = !!c.envia_domingo;
  cfg.pausa_geral = !!c.pausa_geral;
  cfg.telefone_teste = c.telefone_teste || '';
  cfg.carteiro_configurado = !!c.runner_token;
  cfg.ultima_rodada_em = c.ultima_rodada_em || null;
  cfg.ia_resumo = c.ia_resumo || null;
  cfg.ia_resumo_em = c.ia_resumo_em || null;
  cfg.updated_at = c.updated_at || null;
  // rodada 5: só horário comercial (seg–sáb 8h–17h30) e o estado do WhatsApp que o carteiro gravou
  cfg.so_horario_comercial = !!c.so_horario_comercial;
  cfg.whatsapp = { estado: c.whatsapp_estado || null, em: c.whatsapp_estado_em || null, motivo: c.whatsapp_motivo || null };
  return cfg;
}

/** O carteiro grava o estado do WhatsApp que viu (o Render dorme e perde a memória) — só quando muda. */
export async function gravarEstadoWhatsapp(estado, motivo = null, atual = null) {
  const a = atual || (await selecionarUm(T.config, `select=whatsapp_estado,whatsapp_motivo&${LINHA_UNICA}`).catch(() => null)) || {};
  if (a.whatsapp_estado === estado && (a.whatsapp_motivo || null) === (motivo || null)) return false;
  await atualizarUm(T.config, LINHA_UNICA, { whatsapp_estado: estado, whatsapp_estado_em: new Date().toISOString(), whatsapp_motivo: motivo ? String(motivo).slice(0, 300) : null }).catch(() => null);
  return true;
}

export async function salvarConfig(dados) {
  const campos = {};
  for (const r of REGUAS) {
    if (dados[`ativo_${r}`] !== undefined) campos[`ativo_${r}`] = dados[`ativo_${r}`] === true;
    const msg = dados[`msg_${r}`];
    if (msg !== undefined && String(msg).trim()) campos[`msg_${r}`] = String(msg).trim().slice(0, 1000);
  }
  for (const [k, [min, max]] of Object.entries(FAIXAS)) {
    if (dados[k] === undefined) continue;
    const n = Number(dados[k]);
    if (Number.isInteger(n) && n >= min && n <= max) campos[k] = n;
  }
  if (campos.janela_inicio !== undefined || campos.janela_fim !== undefined) {
    const atual = await obterConfig();
    const ini = campos.janela_inicio ?? atual.janela_inicio;
    const fim = campos.janela_fim ?? atual.janela_fim;
    if (ini >= fim) { delete campos.janela_inicio; delete campos.janela_fim; }
  }
  if (dados.hora_envio !== undefined) {
    const m = String(dados.hora_envio).match(/^(\d{1,2}):(\d{2})/);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) campos.hora_envio = `${String(m[1]).padStart(2, '0')}:${m[2]}:00`;
  }
  if (dados.link_avaliacao !== undefined) {
    const l = String(dados.link_avaliacao || '').trim();
    campos.link_avaliacao = /^https?:\/\/\S+$/i.test(l) ? l.slice(0, 500) : null;
  }
  if (dados.envia_domingo !== undefined) campos.envia_domingo = dados.envia_domingo === true;
  if (dados.pausa_geral !== undefined) campos.pausa_geral = dados.pausa_geral === true;
  if (dados.so_horario_comercial !== undefined) campos.so_horario_comercial = dados.so_horario_comercial === true;
  if (dados.telefone_teste !== undefined) {
    const t = soDigitos(dados.telefone_teste);
    campos.telefone_teste = t.length >= 10 ? t : null;
  }
  if (Object.keys(campos).length) await atualizarUm(T.config, LINHA_UNICA, campos);
  return obterConfig();
}

// ============================================================================
// REGRAS DE RETORNO (prazo por tipo de serviço) e MODELOS
// ============================================================================

function lerRegra(r) {
  return {
    id: r.id, rotulo: r.rotulo, palavras: Array.isArray(r.palavras) ? r.palavras : [],
    meses: Number(r.meses), mensagem: r.mensagem || '', ativo: r.ativo !== false, ordem: Number(r.ordem ?? 100),
  };
}
const palavrasDaEntrada = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/))
  .map((p) => String(p).trim().toLowerCase()).filter(Boolean).slice(0, 30);

export async function listarRegras() {
  return (await selecionar(T.regras, 'select=*&order=ordem.asc,rotulo.asc')).map(lerRegra);
}

export async function criarRegra(d) {
  const rotulo = String(d.rotulo ?? '').trim().slice(0, 80);
  const palavras = palavrasDaEntrada(d.palavras);
  const meses = Number(d.meses);
  if (!rotulo || !palavras.length) throw new Error('Dê um nome à regra e pelo menos uma palavra do serviço.');
  if (!Number.isInteger(meses) || meses < 1 || meses > 36) throw new Error('Prazo em meses entre 1 e 36.');
  const linha = await inserirUm(T.regras, {
    rotulo, palavras, meses, mensagem: String(d.mensagem ?? '').trim().slice(0, 1000) || null,
    ativo: d.ativo !== false, ordem: Number.isInteger(Number(d.ordem)) ? Number(d.ordem) : 100,
  }, 'select=*');
  return lerRegra(linha);
}

export async function atualizarRegra(id, d) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (d.rotulo !== undefined) campos.rotulo = String(d.rotulo).trim().slice(0, 80);
  if (d.palavras !== undefined) campos.palavras = palavrasDaEntrada(d.palavras);
  if (d.meses !== undefined) {
    const n = Number(d.meses);
    if (Number.isInteger(n) && n >= 1 && n <= 36) campos.meses = n;
  }
  if (d.mensagem !== undefined) campos.mensagem = String(d.mensagem ?? '').trim().slice(0, 1000) || null;
  if (d.ativo !== undefined) campos.ativo = d.ativo === true;
  if (d.ordem !== undefined && Number.isInteger(Number(d.ordem))) campos.ordem = Number(d.ordem);
  if (!Object.keys(campos).length) return lerRegra(await selecionarUm(T.regras, `select=*&id=eq.${id}`));
  const r = await atualizarUm(T.regras, `id=eq.${id}&select=*`, campos);
  return r ? lerRegra(r) : null;
}

export async function removerRegra(id) {
  if (!ehUuid(id)) return false;
  return (await remover(T.regras, `id=eq.${id}`)).length > 0;
}

export async function listarModelos() {
  return selecionar(T.modelos, 'select=id,titulo,categoria,corpo,ordem&order=ordem.asc,titulo.asc');
}

// ============================================================================
// FILA DE ENVIOS
// ============================================================================

/* rodada 4: colunas explícitas (antes select=*) — é o que a tela e o CSV usam */
const CAMPOS_ENVIO = 'id,cliente_id,agendamento_id,lead_id,telefone,nome,tipo,corpo,enviar_em,enviado_em,status,erro,tentativas,motivo_pulado,chave_unica,criado_por,criado_por_id,campanha_id,lote,resposta,resposta_tipo,respondido_em,agendou_depois_id,intencao,intencao_em,intencao_resumo,encaminhado_em,tarefa_id,expira_em,conversa_id,mensagem_id,created_at';
export async function listarEnvios({ status, tipo, q, de, ate, intencao, limite = 300, offset = 0 } = {}) {
  const p = new URLSearchParams(`select=${CAMPOS_ENVIO}`);
  const desloc = Math.max(0, Math.min(Number(offset) || 0, 100000));
  if (desloc) p.set('offset', String(desloc));
  if (status && status !== 'todas') p.set('status', `eq.${status}`);
  if (intencao && intencao !== 'todas') p.set('intencao', intencao === 'qualquer' ? 'not.is.null' : `eq.${intencao}`);
  // período no fuso da oficina (de/até inclusivos, 'YYYY-MM-DD')
  const dIni = dataBanco(de), dFim = dataBanco(ate);
  if (dIni) p.append('enviar_em', `gte.${instanteSP(dIni, '00:00').toISOString()}`);
  if (dFim) p.append('enviar_em', `lt.${instanteSP(somarDias(dFim, 1), '00:00').toISOString()}`);
  if (tipo && tipo !== 'todos') p.set('tipo', `eq.${tipo}`);
  if (q) {
    const t = termoBusca(q);
    const dig = soDigitos(q);
    const partes = [`nome.ilike.${t}`, `corpo.ilike.${t}`, `resposta.ilike.${t}`];
    // rodada 5: telefone normalizado (coluna gerada telefone_e164, com índice) — com ou sem 55, com máscara
    if (dig.length >= 10) partes.push(`telefone_e164.eq.${telefoneNacional(dig)}`);
    else if (dig.length >= 4) partes.push(`telefone.ilike."*${dig}*"`, `telefone_e164.ilike."*${dig}*"`);
    p.set('or', `(${partes.join(',')})`);
  }
  p.set('order', 'enviar_em.desc');
  p.set('limit', String(Math.min(Number(limite) || 300, 5000)));
  return Number(limite) > 1000 ? selecionarTudo(T.envios, p) : selecionar(T.envios, p);
}

/** Envios de um telefone (qualquer formato) pela coluna normalizada — a ficha e o 360 usam. */
export async function enviosDoTelefone(telefone, limite = 20) {
  const t = telefoneNacional(telefone);
  if (!t) return [];
  return selecionar(T.envios, `select=${CAMPOS_ENVIO}&telefone_e164=eq.${t}&order=created_at.desc&limit=${Math.min(Number(limite) || 20, 100)}`);
}

/**
 * Enfileira uma mensagem. Com chave_unica repetida devolve null em silêncio —
 * é assim que os geradores podem rodar quantas vezes for sem duplicar.
 */
export async function enfileirar({
  cliente_id = null, agendamento_id = null, lead_id = null, telefone, nome = null,
  tipo, corpo, enviar_em = null, chave_unica = null, criado_por = null,
  status = 'pendente', motivo_pulado = null, lote = null, criado_por_id = null, campanha_id = null,
  expira_em = null,
}) {
  const tel = soDigitos(telefone);
  if (!tel || !corpo || !tipo) return null;
  try {
    return await inserirUm(T.envios, {
      cliente_id: uuidOuNulo(cliente_id),
      agendamento_id: uuidOuNulo(agendamento_id),
      lead_id: uuidOuNulo(lead_id),
      telefone: tel, nome, tipo, corpo: String(corpo).slice(0, 2000),
      enviar_em: enviar_em || new Date().toISOString(),
      chave_unica, criado_por, status, motivo_pulado, lote: uuidOuNulo(lote),
      criado_por_id: uuidOuNulo(criado_por_id), campanha_id: uuidOuNulo(campanha_id),
      ...(expira_em ? { expira_em } : {}),
    }, 'select=*');
  } catch (e) {
    if (e?.status === 409) return null; // chave_unica repetida: já estava na fila
    throw e;
  }
}

export async function cancelarEnvio(id) {
  if (!ehUuid(id)) return null;
  // só cancela o que ainda não saiu — um enviado é história, não se reescreve
  return atualizarUm(T.envios, `id=eq.${id}&status=eq.pendente`, { status: 'cancelado' });
}

/** Desfaz um cancelamento: a mensagem volta à fila no MESMO horário (se já passou, sai na próxima rodada). */
export async function desfazerCancelamento(id) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.envios, `id=eq.${id}&status=eq.cancelado`, { status: 'pendente' });
}

/** Falhou/cancelada/pulada volta para a fila agora. */
export async function reenfileirar(id) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.envios, `id=eq.${id}&status=in.(falhou,cancelado,pulado)`, {
    status: 'pendente', erro: null, motivo_pulado: null, enviar_em: new Date().toISOString(), tentativas: 0,
  });
}

/** Pendentes que já venceram — o carteiro do server.js chama isto. */
export const CAMPOS_FILA = 'id,cliente_id,agendamento_id,lead_id,telefone,nome,tipo,corpo,enviar_em,tentativas,status,enviando_em,expira_em,mensagem_id,criado_por_id,chave_unica,created_at';
export async function enviosDevidos(limite = 25) {
  const p = new URLSearchParams(`select=${CAMPOS_FILA}`);
  p.set('status', 'eq.pendente');
  p.set('enviando_em', 'is.null'); // reservado = outro carteiro está mandando agora
  p.set('enviar_em', `lte.${new Date().toISOString()}`);
  p.set('order', 'enviar_em.asc');
  p.set('limit', String(limite));
  return selecionar(T.envios, p);
}

export async function marcarEnvio(id, status, erro = null, tentativas = undefined, extra = {}) {
  const campos = {
    status, erro,
    enviado_em: status === 'enviado' ? new Date().toISOString() : null,
    enviando_em: null, // a reserva acaba aqui (saiu, falhou ou voltou para a fila)
    ...extra,
  };
  if (Number.isInteger(tentativas)) campos.tentativas = tentativas;
  return atualizarUm(T.envios, `id=eq.${id}`, campos);
}

// ============================================================================
// SATISFAÇÃO
// ============================================================================

export async function listarRespostas(limite = 200) {
  const p = new URLSearchParams('select=*,clientes(nome,telefone)');
  p.set('order', 'created_at.desc');
  p.set('limit', String(limite));
  const linhas = await selecionar(T.respostas, p);
  return linhas.map((r) => {
    const { clientes, ...resto } = r;
    return { ...resto, cliente_nome: clientes?.nome ?? null, cliente_telefone: clientes?.telefone ?? null };
  });
}

export async function registrarResposta({ cliente_id, envio_id = null, agendamento_id = null,
  satisfeito, nota = null, comentario = null, registrado_por = null }) {
  return inserirUm(T.respostas, {
    cliente_id: uuidOuNulo(cliente_id),
    envio_id: uuidOuNulo(envio_id),
    agendamento_id: uuidOuNulo(agendamento_id),
    satisfeito: satisfeito === true,
    nota: Number.isInteger(Number(nota)) && nota >= 1 && nota <= 5 ? Number(nota) : null,
    comentario: comentario ? String(comentario).slice(0, 1000) : null,
    registrado_por, origem: 'manual',
  }, 'select=*');
}

export async function removerResposta(id) {
  if (!ehUuid(id)) return false;
  const r = await remover(T.respostas, `id=eq.${id}`);
  return r.length > 0;
}

// ============================================================================
// PORTEIRO — consentimento e intervalo mínimo entre mensagens
// ============================================================================

export async function carregarPorteiro(cfg) {
  const optOut = await selecionarTudo(T.clientes, 'select=id,telefone_e164&aceita_mensagens=is.false');
  const idsFora = new Set(optOut.map((c) => c.id));
  const telsFora = new Set(optOut.map((c) => c.telefone_e164).filter(Boolean));

  const recentes = new Set();
  const dias = Number(cfg.intervalo_minimo_dias) || 0;
  if (dias > 0) {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const p = new URLSearchParams('select=telefone,cliente_id');
    p.set('status', 'in.(enviado,pendente)');
    p.set('enviar_em', `gte.${desde}`);
    p.set('tipo', `in.(${[...TIPOS_RELACIONAMENTO].join(',')})`);
    for (const e of await selecionarTudo(T.envios, p)) {
      const t = telefoneNacional(e.telefone);
      if (t) recentes.add(t);
      if (e.cliente_id) recentes.add(e.cliente_id);
    }
  }

  return {
    totalForaDaLista: optOut.length,
    /** { ok } ou { ok:false, motivo, definitivo } — definitivo = grava 'pulado'; senão só adia. */
    podeReceber({ cliente_id, telefone, tipo }) {
      const t = telefoneNacional(telefone);
      if ((cliente_id && idsFora.has(cliente_id)) || (t && telsFora.has(t))) {
        return { ok: false, definitivo: true, motivo: 'cliente pediu para não receber mensagens' };
      }
      if (TIPOS_RELACIONAMENTO.has(tipo) && ((cliente_id && recentes.has(cliente_id)) || (t && recentes.has(t)))) {
        return { ok: false, definitivo: false, motivo: `já recebeu mensagem há menos de ${dias} dias` };
      }
      return { ok: true };
    },
    marcar({ cliente_id, telefone }) {
      const t = telefoneNacional(telefone);
      if (t) recentes.add(t);
      if (cliente_id) recentes.add(cliente_id);
    },
  };
}

/** Passa pelo porteiro e enfileira (ou só anota, em simulação). */
async function entregarAoPorteiro(porteiro, dados, ctx) {
  const veredito = porteiro.podeReceber(dados);
  if (!veredito.ok) {
    const anotado = { ...dados, motivo: veredito.motivo, definitivo: veredito.definitivo };
    if (veredito.definitivo) {
      if (!ctx.simular) {
        const p = await enfileirar({ ...dados, status: 'pulado', motivo_pulado: veredito.motivo });
        if (!p) return null; // já estava anotado
      }
      ctx.pulados.push(anotado);
    } else {
      ctx.adiados.push(anotado);
    }
    return null;
  }
  if (ctx.simular) { ctx.previa.push(dados); return dados; }
  const criado = await enfileirar(dados);
  if (criado) { porteiro.marcar(dados); ctx.criados.push(criado); }
  return criado;
}

// ============================================================================
// GERADORES (as réguas) — olham o banco e ENFILEIRAM (não enviam nada)
// ============================================================================

const A_SEL = 'select=id,cliente_id,lead_id,cliente_nome,telefone,servico,veiculo,placa,data,hora,status';

/**
 * Rodada 5: monta o corpo de uma régua, resolvendo {link_os}/{link_area} quando o
 * texto pede. Sem o link (cliente sem cadastro, horário sem ordem no Pátio) a
 * mensagem NÃO sai — vai para "pulados" da prévia com o motivo. null = não manda.
 */
async function corpoDaRegua(template, vars, ids, ctx, info = {}) {
  const precisa = usaLinkOs(template) || usaLinkArea(template);
  const extra = precisa ? await linksDaRegua(template, ids, ctx) : {};
  const falta = precisa ? faltaLink(template, extra) : null;
  if (falta) { ctx.pulados.push({ ...info, motivo: falta, definitivo: false }); return null; }
  return renderTemplate(template, { ...vars, ...extra });
}

/** Lembrete de horário: X horas antes do agendamento (aguardando/confirmado). */
export async function gerarLembretes(cfg, porteiro, ctx) {
  const h = hoje();
  const ate = somarDias(h, Math.ceil(cfg.horas_lembrete / 24));
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'in.(aguardando,confirmado)');
  p.set('data', `gte.${h}`);
  p.append('data', `lte.${ate}`);
  const agora = Date.now();
  for (const a of await selecionar(T.agendamentos, p)) {
    if (!soDigitos(a.telefone)) continue;
    const faltam = (instanteSP(a.data, a.hora || '08:00').getTime() - agora) / 36e5;
    if (faltam < 1 || faltam > cfg.horas_lembrete) continue; // tarde demais, ou ainda cedo
    const corpo = await corpoDaRegua(cfg.msg_lembrete, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o atendimento',
      quando: quandoRelativo(a.data, a.hora, h),
    }, { cliente_id: a.cliente_id, agendamento_id: a.id }, ctx, { tipo: 'lembrete', nome: a.cliente_nome, telefone: a.telefone, cliente_id: a.cliente_id });
    if (corpo === null) continue;
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'lembrete', corpo, enviar_em: new Date().toISOString(), chave_unica: `lembrete:${a.id}`, criado_por: 'gerador',
      expira_em: validadeDoEnvio('lembrete', { agendamento: a }),
    }, ctx);
  }
}

/** Aniversariantes de hoje → fila. Dedupe por cliente+ano. */
export async function gerarAniversarios(cfg, porteiro, ctx) {
  const d = hoje();
  /* Recuperação: se o servidor não rodou NENHUMA vez ontem (Render fora do ar o
     dia todo), os aniversariantes de ontem ainda recebem hoje — uma vez só
     (a chave é por cliente e ano) e com validade até o fim de hoje. */
  const dias = [d];
  if (ctx.recuperarOntem) dias.push(somarDias(d, -1));
  const clientes = await selecionarTudo(T.clientes, 'select=id,nome,telefone,carro_modelo,carro_ano,placa,nascimento&nascimento=not.is.null');
  for (const dia of dias) {
    const mmdd = dia.slice(5);
    const ano = dia.slice(0, 4);
    for (const c of clientes) {
      if (String(c.nascimento || '').slice(5) !== mmdd) continue;
      if (!soDigitos(c.telefone)) continue;
      const corpo = await corpoDaRegua(cfg.msg_aniversario, {
        nome: c.nome, carro: [c.carro_modelo, c.carro_ano].filter(Boolean).join(' '), placa: c.placa,
      }, { cliente_id: c.id }, ctx, { tipo: 'aniversario', nome: c.nome, telefone: c.telefone, cliente_id: c.id });
      if (corpo === null) continue;
      await entregarAoPorteiro(porteiro, {
        cliente_id: c.id, telefone: c.telefone, nome: c.nome, tipo: 'aniversario', corpo,
        enviar_em: dia === d ? hojeAs(cfg.hora_envio) : new Date().toISOString(),
        chave_unica: `aniversario:${c.id}:${ano}`, criado_por: 'gerador',
        expira_em: validadeDoEnvio('aniversario', { base: dia }),
      }, ctx);
    }
  }
}

/** Serviços concluídos há N dias → "ficou tudo certo?". Dedupe por agendamento. */
export async function gerarPosvenda(cfg, porteiro, ctx) {
  const ate = somarDias(hoje(), -cfg.dias_posvenda);
  const desde = somarDias(ate, -5);            // janela de recuperação de 5 dias
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'eq.concluido');
  p.set('data', `gte.${desde}`);
  p.append('data', `lte.${ate}`);
  for (const a of await selecionar(T.agendamentos, p)) {
    if (!soDigitos(a.telefone)) continue;
    const corpo = await corpoDaRegua(cfg.msg_posvenda, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o serviço',
    }, { cliente_id: a.cliente_id, agendamento_id: a.id }, ctx, { tipo: 'posvenda', nome: a.cliente_nome, telefone: a.telefone, cliente_id: a.cliente_id });
    if (corpo === null) continue;
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'posvenda', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `posvenda:${a.id}`, criado_por: 'gerador',
      expira_em: validadeDoEnvio('posvenda', { base: hoje() }),
    }, ctx);
  }
}

/** Visitas posteriores por cliente (qualquer status que não seja falta/cancelamento). */
async function ultimaVisitaDepoisDe(clientesIds, dataMinima) {
  const mapa = new Map(); // cliente_id -> maior data
  const ids = [...new Set(clientesIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 80) {
    const q = new URLSearchParams('select=cliente_id,data');
    q.set('cliente_id', `in.(${ids.slice(i, i + 80).join(',')})`);
    q.set('data', `gt.${dataMinima}`);
    q.set('status', 'not.in.(cancelado,nao_veio)');
    for (const n of await selecionarTudo(T.agendamentos, q)) {
      if (!mapa.has(n.cliente_id) || mapa.get(n.cliente_id) < n.data) mapa.set(n.cliente_id, n.data);
    }
  }
  return mapa;
}

/**
 * Revisão: cada serviço concluído tem um prazo (regra por tipo de serviço; sem
 * regra, meses_retorno). Quando o prazo vence (janela de 7 dias) e o cliente não
 * voltou depois, convida. Dedupe por agendamento.
 */
export async function gerarRetornos(cfg, porteiro, ctx, regras) {
  const h = hoje();
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'eq.concluido');
  p.set('data', `gte.${somarDias(h, -(36 * 30 + 10))}`);
  p.append('data', `lte.${somarDias(h, -25)}`);
  p.set('order', 'data.desc');
  const antigos = await selecionarTudo(T.agendamentos, p);
  if (!antigos.length) return;

  const candidatos = [];
  for (const a of antigos) {
    const { meses, regra } = prazoDeRetorno(a.servico, regras, cfg.meses_retorno);
    const vence = somarDias(a.data, meses * 30);
    if (vence > h || vence < somarDias(h, -7)) continue;
    candidatos.push({ ...a, meses, regra });
  }
  if (!candidatos.length) return;

  const voltaram = await ultimaVisitaDepoisDe(candidatos.map((a) => a.cliente_id), candidatos.reduce((m, a) => (a.data < m ? a.data : m), h));
  const jaConvidado = new Set();
  for (const a of candidatos) {
    if (!soDigitos(a.telefone)) continue;
    if (a.cliente_id && (voltaram.get(a.cliente_id) || '') > a.data) continue; // voltou depois: não convida
    const chaveCliente = a.cliente_id || telefoneNacional(a.telefone);
    if (jaConvidado.has(chaveCliente)) continue;                                   // um convite por cliente
    jaConvidado.add(chaveCliente);
    const corpo = await corpoDaRegua(a.regra?.mensagem || cfg.msg_retorno, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o último serviço', meses: a.meses,
    }, { cliente_id: a.cliente_id, agendamento_id: a.id }, ctx, { tipo: 'retorno', nome: a.cliente_nome, telefone: a.telefone, cliente_id: a.cliente_id });
    if (corpo === null) continue;
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'retorno', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `retorno:${a.id}`, criado_por: 'gerador',
      expira_em: validadeDoEnvio('retorno', { base: hoje() }),
    }, ctx);
  }
}

/** Orçamento parado há N dias no CRM → "conseguiu olhar?". Dedupe por lead. */
export async function gerarOrcamentos(cfg, porteiro, ctx) {
  const ate = new Date(Date.now() - cfg.dias_orcamento * 86400000).toISOString();
  const desde = new Date(Date.now() - (cfg.dias_orcamento + 7) * 86400000).toISOString();
  const p = new URLSearchParams('select=id,cliente_id,nome,telefone,carro_modelo,placa,servico,updated_at');
  p.set('status', 'eq.orcamento');
  p.set('updated_at', `lte.${ate}`);
  p.append('updated_at', `gte.${desde}`);
  for (const l of await selecionar(T.leads, p)) {
    if (!soDigitos(l.telefone)) continue;
    const corpo = await corpoDaRegua(cfg.msg_orcamento, {
      nome: l.nome, carro: l.carro_modelo, placa: l.placa, servico: l.servico || 'o serviço',
    }, { cliente_id: l.cliente_id }, ctx, { tipo: 'orcamento', nome: l.nome, telefone: l.telefone, cliente_id: l.cliente_id });
    if (corpo === null) continue;
    await entregarAoPorteiro(porteiro, {
      cliente_id: l.cliente_id, lead_id: l.id, telefone: l.telefone, nome: l.nome,
      tipo: 'orcamento', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `orcamento:${l.id}`, criado_por: 'gerador',
      expira_em: validadeDoEnvio('orcamento', { base: hoje() }),
    }, ctx);
  }
}

/** Veio e não fechou há N dias → "ainda posso ajudar?". Dedupe por agendamento. */
export async function gerarNaoFechou(cfg, porteiro, ctx) {
  const ate = somarDias(hoje(), -cfg.dias_nao_fechou);
  const desde = somarDias(ate, -5);
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'eq.nao_fechou');
  p.set('data', `gte.${desde}`);
  p.append('data', `lte.${ate}`);
  const lista = await selecionar(T.agendamentos, p);
  if (!lista.length) return;
  const voltaram = await ultimaVisitaDepoisDe(lista.map((a) => a.cliente_id), desde);
  for (const a of lista) {
    if (!soDigitos(a.telefone)) continue;
    if (a.cliente_id && (voltaram.get(a.cliente_id) || '') > a.data) continue;
    const corpo = await corpoDaRegua(cfg.msg_nao_fechou, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o serviço',
    }, { cliente_id: a.cliente_id, agendamento_id: a.id }, ctx, { tipo: 'nao_fechou', nome: a.cliente_nome, telefone: a.telefone, cliente_id: a.cliente_id });
    if (corpo === null) continue;
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'nao_fechou', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `nao_fechou:${a.id}`, criado_por: 'gerador',
      expira_em: validadeDoEnvio('nao_fechou', { base: hoje() }),
    }, ctx);
  }
}

/** Último serviço por cliente + última visita de qualquer tipo (lê os agendamentos uma vez). */
async function historicoPorCliente() {
  const todos = await selecionarTudo(T.agendamentos, 'select=id,cliente_id,cliente_nome,telefone,servico,veiculo,placa,data,status&cliente_id=not.is.null&order=data.asc');
  const mapa = new Map();
  for (const a of todos) {
    const h = mapa.get(a.cliente_id) || { ultimoServico: null, ultimaVisita: null, faltas30: 0 };
    if (a.status === 'concluido' && (!h.ultimoServico || h.ultimoServico.data <= a.data)) h.ultimoServico = a;
    if (!['cancelado', 'nao_veio'].includes(a.status) && (!h.ultimaVisita || h.ultimaVisita < a.data)) h.ultimaVisita = a.data;
    mapa.set(a.cliente_id, h);
  }
  return mapa;
}

/**
 * Reativação: cliente que já foi atendido, cujo último serviço foi há N meses
 * (janela de 30 dias) e que não voltou nem tem horário marcado. Uma vez por ano.
 */
export async function gerarReativacao(cfg, porteiro, ctx) {
  const h = hoje();
  const limiteSup = somarDias(h, -cfg.meses_reativacao * 30);
  const limiteInf = somarDias(limiteSup, -30);
  const historico = await historicoPorCliente();
  const alvos = [];
  for (const [clienteId, info] of historico) {
    const u = info.ultimoServico;
    if (!u || u.data > limiteSup || u.data < limiteInf) continue;
    if ((info.ultimaVisita || '') > u.data) continue; // voltou (ou tem horário) depois do último serviço
    alvos.push({ clienteId, u });
  }
  if (!alvos.length) return;
  const fichas = new Map((await clientesPorIds(alvos.map((x) => x.clienteId))).map((c) => [c.id, c]));
  for (const { clienteId, u } of alvos) {
    const c = fichas.get(clienteId);
    const telefone = c?.telefone || u.telefone;
    if (!soDigitos(telefone)) continue;
    const corpo = await corpoDaRegua(cfg.msg_reativacao, {
      nome: c?.nome || u.cliente_nome, carro: c?.carro || u.veiculo, placa: c?.placa || u.placa, servico: u.servico,
    }, { cliente_id: clienteId, agendamento_id: u.id }, ctx, { tipo: 'reativacao', nome: c?.nome || u.cliente_nome, telefone, cliente_id: clienteId });
    if (corpo === null) continue;
    await entregarAoPorteiro(porteiro, {
      cliente_id: clienteId, agendamento_id: u.id, telefone, nome: c?.nome || u.cliente_nome,
      tipo: 'reativacao', corpo, enviar_em: hojeAs(cfg.hora_envio),
      chave_unica: `reativacao:${clienteId}:${h.slice(0, 4)}`, criado_por: 'gerador',
      expira_em: validadeDoEnvio('reativacao', { base: h }),
    }, ctx);
  }
}

const GERADORES = {
  lembrete: gerarLembretes, posvenda: gerarPosvenda, retorno: gerarRetornos, aniversario: gerarAniversarios,
  orcamento: gerarOrcamentos, nao_fechou: gerarNaoFechou, reativacao: gerarReativacao,
  // 'avaliacao' é disparada pelo gatilho do banco quando o cliente responde bem ao pós-venda
};

/**
 * Roda as réguas. Em modo normal, só as ligadas, e enfileira de verdade.
 * Em simulação (`simular:true`) roda TODAS sem gravar nada e devolve o que
 * entraria na fila — é a "Prévia" da tela.
 */
export async function gerarTudo({ cfg = null, simular = false, so = null, recuperarOntem = false } = {}) {
  cfg = cfg || await obterConfig();
  const [porteiro, regras] = await Promise.all([carregarPorteiro(cfg), listarRegras()]);
  const ctx = { simular, recuperarOntem, criados: [], pulados: [], adiados: [], previa: [], erros: [] };
  const porRegua = {};
  for (const [tipo, gerar] of Object.entries(GERADORES)) {
    if (so && so !== tipo) continue;
    if (!simular && !cfg[`ativo_${tipo}`]) continue;
    const antes = { c: ctx.criados.length, p: ctx.pulados.length, a: ctx.adiados.length, v: ctx.previa.length };
    try {
      await gerar(cfg, porteiro, ctx, regras);
    } catch (e) {
      ctx.erros.push({ tipo, erro: String(e?.message || e) });
    }
    porRegua[tipo] = {
      ligada: !!cfg[`ativo_${tipo}`],
      criados: ctx.criados.length - antes.c, previa: ctx.previa.length - antes.v,
      pulados: ctx.pulados.length - antes.p, adiados: ctx.adiados.length - antes.a,
    };
  }
  return {
    simulado: simular, porRegua,
    criados: ctx.criados.length, pulados: ctx.pulados.length, adiados: ctx.adiados.length,
    previa: simular ? ctx.previa : undefined,
    puladosDetalhe: simular ? ctx.pulados : undefined,
    adiadosDetalhe: simular ? ctx.adiados : undefined,
    erros: ctx.erros,
    // compatibilidade com a tela antiga
    aniversario: porRegua.aniversario?.criados || 0,
    posvenda: porRegua.posvenda?.criados || 0,
    retorno: porRegua.retorno?.criados || 0,
  };
}

// ============================================================================
// SEGMENTOS (para campanhas) — sempre sem quem pediu para não receber
// ============================================================================

export const SEGMENTOS = [
  { id: 'todos', rotulo: 'Todos os clientes com telefone' },
  { id: 'aniversariantes_mes', rotulo: 'Aniversariantes deste mês' },
  { id: 'atendidos', rotulo: 'Atendidos nos últimos N dias', valor: 90, unidade: 'dias' },
  { id: 'sem_voltar', rotulo: 'Sem voltar há mais de N meses', valor: 6, unidade: 'meses' },
  { id: 'faltaram', rotulo: 'Faltaram nos últimos 30 dias' },
  { id: 'servico', rotulo: 'Fizeram um serviço (palavra)', valor: 'óleo', unidade: 'texto' },
];

/** Os candidatos BRUTOS de um segmento (antes de tirar opt-out, sem telefone e repetidos). */
async function candidatosDoSegmento(filtro, valor) {
  const h = hoje();
  switch (filtro) {
    case 'todos':
      return (await selecionarTudo(T.clientes, `select=${CAMPOS_CLIENTE}&telefone=not.is.null&order=nome.asc`)).map(lerCliente);
    case 'aniversariantes_mes': {
      const mes = h.slice(5, 7);
      const lista = await selecionarTudo(T.clientes, `select=${CAMPOS_CLIENTE}&nascimento=not.is.null&order=nome.asc`);
      return lista.filter((c) => String(c.nascimento).slice(5, 7) === mes).map(lerCliente);
    }
    case 'atendidos': {
      const dias = Math.min(Math.max(Number(valor) || 90, 1), 3650);
      const ags = await selecionarTudo(T.agendamentos, `select=cliente_id&status=eq.concluido&data=gte.${somarDias(h, -dias)}&cliente_id=not.is.null`);
      return clientesPorIds(ags.map((a) => a.cliente_id));
    }
    case 'sem_voltar': {
      const meses = Math.min(Math.max(Number(valor) || 6, 1), 60);
      const limite = somarDias(h, -meses * 30);
      const historico = await historicoPorCliente();
      const ids = [];
      for (const [id, info] of historico) {
        if (info.ultimoServico && info.ultimoServico.data <= limite && (info.ultimaVisita || '') <= info.ultimoServico.data) ids.push(id);
      }
      return clientesPorIds(ids);
    }
    case 'faltaram': {
      const ags = await selecionarTudo(T.agendamentos, `select=cliente_id&status=eq.nao_veio&data=gte.${somarDias(h, -30)}&cliente_id=not.is.null`);
      return clientesPorIds(ags.map((a) => a.cliente_id));
    }
    case 'servico': {
      const palavra = String(valor || '').trim();
      if (palavra.length < 2) return [];
      const p = new URLSearchParams('select=cliente_id');
      p.set('status', 'eq.concluido');
      p.set('cliente_id', 'not.is.null');
      p.set('servico', `ilike.*${palavra.replace(/[%*,()]/g, ' ')}*`);
      const ags = await selecionarTudo(T.agendamentos, p);
      return clientesPorIds(ags.map((a) => a.cliente_id));
    }
    default:
      throw new Error('Segmento desconhecido.');
  }
}

/** Pura: separa quem recebe de quem é pulado (e por quê). Quem recebeu outra mensagem há menos de N dias RECEBE mesmo assim
 *  (campanha é decisão de gente), mas é contado em `recentes` para a prévia avisar. */
export function peneirarSegmento(lista, { optOut = new Set(), porteiro = null } = {}) {
  const vistos = new Set();
  const recebem = [];
  const pulados = { nao_quer: 0, sem_telefone: 0, repetido: 0 };
  let recentes = 0;
  for (const c of lista) {
    if (!c) continue;
    if (vistos.has(c.id)) { pulados.repetido++; continue; }
    vistos.add(c.id);
    if (!soDigitos(c.telefone)) { pulados.sem_telefone++; continue; }
    if (optOut.has(c.id) || c.aceita_mensagens === false) { pulados.nao_quer++; continue; }
    if (porteiro && !porteiro.podeReceber({ cliente_id: c.id, telefone: c.telefone, tipo: 'campanha' }).ok) recentes++;
    recebem.push(c);
  }
  return { recebem, pulados, recentes, total: lista.filter(Boolean).length };
}

export async function segmentar(filtro, valor) {
  const optOut = new Set((await selecionarTudo(T.clientes, 'select=id&aceita_mensagens=is.false')).map((c) => c.id));
  return peneirarSegmento(await candidatosDoSegmento(filtro, valor), { optOut }).recebem;
}

/**
 * Rodada 5: a prévia honesta da campanha — quantos recebem e quantos ficam de fora, com o motivo
 * (pediu para parar, sem telefone, repetido, recebeu outra mensagem há menos de N dias).
 */
export async function segmentarComMotivos(filtro, valor, cfg = null) {
  const c = cfg || await obterConfig();
  const [bruto, porteiro] = await Promise.all([candidatosDoSegmento(filtro, valor), carregarPorteiro(c)]);
  const r = peneirarSegmento(bruto, { porteiro });
  return { lista: r.recebem, total: r.recebem.length, bruto: r.total, pulados: r.pulados, recentes: r.recentes, intervalo_dias: Number(c.intervalo_minimo_dias) || 0 };
}

// ---- segmentos salvos (rodada 5) -----------------------------------------------
T.segmentos = 'comunicar_segmentos';
const CAMPOS_SEG = 'id,nome,filtro,valor,criado_por,criado_por_nome,usado_em,usos,created_at';
export async function listarSegmentosSalvos() {
  return selecionar(T.segmentos, `select=${CAMPOS_SEG}&order=usado_em.desc.nullslast,created_at.desc&limit=60`);
}
export async function salvarSegmento({ nome, filtro, valor, criado_por, criado_por_nome }) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (n.length < 2) throw new Error('Dê um nome ao segmento (2 a 60 letras).');
  if (!SEGMENTOS.some((s) => s.id === filtro)) throw new Error('Segmento desconhecido.');
  const seg = SEGMENTOS.find((s) => s.id === filtro);
  const v = seg.valor === undefined ? null : (seg.unidade === 'texto' ? String(valor ?? '').trim().slice(0, 60) || null : (Number.isFinite(Number(valor)) ? Number(valor) : null));
  return inserirUm(T.segmentos, { nome: n, filtro, valor: v === null ? null : String(v), criado_por: uuidOuNulo(criado_por), criado_por_nome: criado_por_nome || null }, `select=${CAMPOS_SEG}`);
}
export async function obterSegmentoSalvo(id) {
  if (!ehUuid(id)) return null;
  return selecionarUm(T.segmentos, `select=${CAMPOS_SEG}&id=eq.${id}`);
}
export async function apagarSegmentoSalvo(id) {
  if (!ehUuid(id)) return false;
  return (await remover(T.segmentos, `id=eq.${id}`)).length > 0;
}
export async function marcarSegmentoUsado(id) {
  if (!ehUuid(id)) return null;
  const s = await obterSegmentoSalvo(id);
  if (!s) return null;
  return atualizarUm(T.segmentos, `id=eq.${id}&select=id`, { usado_em: new Date().toISOString(), usos: (Number(s.usos) || 0) + 1 }).catch(() => null);
}

// ============================================================================
// RESUMO DO PAINEL
// ============================================================================

export async function resumo() {
  const d = hoje();
  const mes = d.slice(5, 7);
  const agora = Date.now();
  const inicioDia = instanteSP(d, '00:00').toISOString();
  const ini7 = new Date(agora - 7 * 86400000).toISOString();
  const ini30 = new Date(agora - 30 * 86400000).toISOString();
  const duasHorasAtras = new Date(agora - 2 * 3600000).toISOString();

  const [cfg, pendentes, vencidos, envios30, clientesComNasc, respostas, foraDaLista, proximos48h] = await Promise.all([
    obterConfig(),
    contar(T.envios, 'status=eq.pendente'),
    contar(T.envios, `status=eq.pendente&enviar_em=lte.${encodeURIComponent(duasHorasAtras)}`),
    selecionarTudo(T.envios, `select=id,tipo,status,enviado_em,respondido_em,resposta_tipo,agendou_depois_id,created_at,erro,intencao,encaminhado_em&created_at=gte.${encodeURIComponent(ini30)}`),
    selecionarTudo(T.clientes, 'select=id,nome,telefone,nascimento&nascimento=not.is.null'),
    selecionar(T.respostas, 'select=satisfeito,nota,created_at&order=created_at.desc&limit=1000'),
    contar(T.clientes, 'aceita_mensagens=is.false'),
    contar(T.agendamentos, `status=in.(aguardando,confirmado)&data=gte.${d}&data=lte.${somarDias(d, 1)}`),
  ]);

  const enviados30 = envios30.filter((e) => e.status === 'enviado');
  const enviados7 = enviados30.filter((e) => e.enviado_em >= ini7);
  const enviadosHoje = enviados30.filter((e) => e.enviado_em >= inicioDia).length;
  const respondidas30 = enviados30.filter((e) => e.respondido_em).length;
  const falhas = envios30.filter((e) => e.status === 'falhou').length;
  const ultimoErro = envios30.filter((e) => e.status === 'falhou' && e.erro).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]?.erro || null;

  // atribuição: agendamentos que vieram depois de uma mensagem (até 21 dias)
  const idsAg = enviados30.map((e) => e.agendou_depois_id).filter(Boolean);
  let agendaram = idsAg.length, receita = 0, concluidos = 0;
  if (idsAg.length) {
    const p = new URLSearchParams('select=id,valor,status');
    p.set('id', `in.(${idsAg.slice(0, 200).join(',')})`);
    for (const a of await selecionar(T.agendamentos, p)) {
      if (a.status === 'concluido') { concluidos++; receita += Number(a.valor) || 0; }
    }
  }

  const porRegua = {};
  for (const tipo of TIPOS_ENVIO) {
    const meus = enviados30.filter((e) => e.tipo === tipo);
    if (!meus.length && !cfg[`ativo_${tipo}`]) continue;
    porRegua[tipo] = {
      rotulo: ROTULO_TIPO[tipo] || tipo,
      ligada: cfg[`ativo_${tipo}`] ?? null,
      enviadas: meus.length,
      respondidas: meus.filter((e) => e.respondido_em).length,
      positivas: meus.filter((e) => e.resposta_tipo === 'positiva').length,
      negativas: meus.filter((e) => e.resposta_tipo === 'negativa').length,
      pararam: meus.filter((e) => e.resposta_tipo === 'parar').length,
      agendaram: meus.filter((e) => e.agendou_depois_id).length,
    };
  }

  const aniversariantesDoMes = clientesComNasc
    .filter((c) => String(c.nascimento).slice(5, 7) === mes)
    .map((c) => ({ nome: c.nome, telefone: c.telefone, dia: Number(String(c.nascimento).slice(8, 10)) }))
    .sort((a, b) => a.dia - b.dia);

  const total = respostas.length;
  const satisfeitos = respostas.filter((r) => r.satisfeito).length;
  const notas = respostas.map((r) => Number(r.nota)).filter((n) => n >= 1 && n <= 5);

  const intencoes7 = {};
  for (const e of envios30) if (e.intencao && (e.respondido_em || '') >= ini7) intencoes7[e.intencao] = (intencoes7[e.intencao] || 0) + 1;

  return {
    pendentes, vencidos, enviadosHoje, falhas, ultimoErro, intencoes7,
    limitePorHora: cfg.limite_por_hora,
    semana: { enviadas: enviados7.length, respondidas: enviados7.filter((e) => e.respondido_em).length, agendaram: enviados7.filter((e) => e.agendou_depois_id).length },
    mes30: { enviadas: enviados30.filter((e) => e.status === 'enviado').length, respondidas: respondidas30, agendaram, concluidos, receita },
    porRegua,
    reguasLigadas: REGUAS.filter((r) => cfg[`ativo_${r}`]),
    pausaGeral: cfg.pausa_geral,
    janela: { inicio: cfg.janela_inicio, fim: cfg.janela_fim, domingo: cfg.envia_domingo },
    carteiroConfigurado: cfg.carteiro_configurado,
    comNascimento: clientesComNasc.length,
    aniversariantesDoMes,
    foraDaLista,
    proximos48h,
    satisfacao: {
      total, satisfeitos, insatisfeitos: total - satisfeitos,
      pct: total ? Math.round((satisfeitos / total) * 100) : null,
      notaMedia: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null,
    },
  };
}

// ============================================================================
// SAÚDE DO SISTEMA (o vigia escreve, os painéis leem)
// ============================================================================

/** O carteiro grava o resultado da rodada no banco: o Render dorme e perde a memória do processo. */
export async function salvarUltimaRodada(resultado) {
  const compacto = { ...resultado };
  delete compacto.gerado?.previa; delete compacto.gerado?.puladosDetalhe; delete compacto.gerado?.adiadosDetalhe;
  return atualizarUm(T.config, LINHA_UNICA, { ultima_rodada: compacto, ultima_rodada_em: new Date().toISOString() }).catch(() => null);
}

export async function saude() {
  const [v, c] = await Promise.all([
    selecionarUm(T.vigia, 'select=problema,desde,checado_em,ultimo_resumo,avisado_em&id=is.true'),
    selecionarUm(T.config, `select=ultima_rodada,ultima_rodada_em&${LINHA_UNICA}`),
  ]);
  const problema = v?.problema || null;
  return {
    ultimaRodada: c?.ultima_rodada_em ? { em: c.ultima_rodada_em, resultado: c.ultima_rodada } : null,
    ok: !problema,
    problema,
    desde: v?.desde || null,
    checado_em: v?.checado_em || null,
    resumo: v?.ultimo_resumo || null,
    whatsappParado: /codewords|whatsapp/i.test(problema || ''),
  };
}

// ============================================================================
// PERFIL (porteiro — mesma tabela compartilhada)
// ============================================================================

export async function perfilAtivo(id) {
  const p = await selecionarUm(T.perfis, `select=ativo,papel,nome&id=eq.${encodeURIComponent(id)}`);
  return p?.ativo ? p : null;
}

// ============================================================================
// RODADA 2 — feriados, falhas transitórias, limite por hora, "alguém está
// atendendo", histórico no Atendimento, IA (config, chave, log), relatórios
// ============================================================================

/** Feriados nacionais 2026–2027 (lista fixa). Régua de relacionamento não sai neles. */
export const FERIADOS = {
  '2026-01-01': 'Confraternização Universal', '2026-02-16': 'Carnaval', '2026-02-17': 'Carnaval',
  '2026-04-03': 'Sexta-feira Santa', '2026-04-21': 'Tiradentes', '2026-05-01': 'Dia do Trabalho',
  '2026-06-04': 'Corpus Christi', '2026-09-07': 'Independência', '2026-10-12': 'Nossa Senhora Aparecida',
  '2026-11-02': 'Finados', '2026-11-15': 'Proclamação da República', '2026-11-20': 'Consciência Negra',
  '2026-12-25': 'Natal',
  '2027-01-01': 'Confraternização Universal', '2027-02-08': 'Carnaval', '2027-02-09': 'Carnaval',
  '2027-03-26': 'Sexta-feira Santa', '2027-04-21': 'Tiradentes', '2027-05-01': 'Dia do Trabalho',
  '2027-05-27': 'Corpus Christi', '2027-09-07': 'Independência', '2027-10-12': 'Nossa Senhora Aparecida',
  '2027-11-02': 'Finados', '2027-11-15': 'Proclamação da República', '2027-11-20': 'Consciência Negra',
  '2027-12-25': 'Natal',
};
export const feriado = (dataIso) => FERIADOS[String(dataIso || '').slice(0, 10)] || null;
/** Réguas que esperam o feriado passar (lembrete, aniversário e avaliação saem no dia; campanha é decisão de gente). */
export const TIPOS_SEGURAM_NO_FERIADO = new Set(['posvenda', 'retorno', 'reativacao', 'orcamento', 'nao_fechou']);
/** Réguas que esperam quando alguém está atendendo o cliente agora. */
export const TIPOS_ESPERAM_ATENDIMENTO = new Set(['posvenda', 'retorno', 'reativacao', 'orcamento', 'nao_fechou', 'aniversario', 'campanha']);

/** Próximo dia (a partir de amanhã) que não é feriado nem domingo (se domingo não envia), às HH:MM. */
export function proximoDiaDeEnvio(dataIso, horaHM = '09:30', enviaDomingo = false) {
  let d = somarDias(dataIso, 1);
  for (let i = 0; i < 10; i++) {
    const dow = new Date(d + 'T12:00:00').getDay();
    if (!feriado(d) && (enviaDomingo || dow !== 0)) break;
    d = somarDias(d, 1);
  }
  return instanteSP(d, horaHM).toISOString();
}

export const MAX_TENTATIVAS = 4; // rodada 5: 3 re-tentativas (5, 15 e 45 min) antes de falhar de vez
/** Erro que não melhora tentando de novo (número inválido, sem WhatsApp). */
const ERRO_DEFINITIVO = /inv[aá]lid|not.*(registered|on whatsapp|exist)|n[aã]o (tem|possui|est[aá] no) whatsapp|n[aã]o existe/i;

/**
 * O que fazer com um envio que falhou (erro não estrutural):
 * transitório e abaixo do máximo → volta à fila com espera CRESCENTE (5, 15, 45 min);
 * número inválido (ou `definitivo` dito pela classificação) → falhou de vez.
 */
export function decidirFalha(erro, tentativas, agora = Date.now(), definitivo = null) {
  const def = definitivo === null ? ERRO_DEFINITIVO.test(String(erro || '')) : !!definitivo;
  if (def || tentativas >= MAX_TENTATIVAS) {
    return { status: 'falhou', enviar_em: null };
  }
  const esperaMin = esperaDaTentativa(tentativas);
  return { status: 'pendente', enviar_em: new Date(agora + esperaMin * 60000).toISOString(), esperaMin };
}

/** Quantas saíram hoje (fuso da oficina) — limite diário da cadência. */
export async function enviadasHoje() {
  return contar(T.envios, `status=eq.enviado&enviado_em=gte.${encodeURIComponent(instanteSP(hoje(), '00:00').toISOString())}`);
}

/** Falhas por CLASSE de erro desde `desdeIso` (chave recusada ≠ número inválido ≠ instabilidade). */
export async function falhasPorClasse(desdeIso) {
  const p = new URLSearchParams('select=tipo,erro,erro_classe,enviar_em,status');
  p.set('status', 'in.(falhou,pendente)');
  p.set('erro', 'not.is.null');
  p.set('enviar_em', `gte.${desdeIso}`);
  p.set('order', 'enviar_em.desc');
  p.set('limit', '500');
  const saida = {};
  for (const e of await selecionar(T.envios, p)) {
    const classe = e.erro_classe || classificarErro({ texto: e.erro }).classe;
    const s = (saida[classe] ||= { total: 0, ultimoErro: null, ultimoEm: null, tipos: {} });
    s.total++;
    s.tipos[e.tipo] = (s.tipos[e.tipo] || 0) + 1;
    if (!s.ultimoErro && e.erro) { s.ultimoErro = String(e.erro).slice(0, 160); s.ultimoEm = e.enviar_em; }
  }
  return saida;
}

/** A fila, em números, para o painel de saúde: pendentes, atrasadas (> 2 h) e a mais antiga. */
export async function resumoDaFila() {
  const duasHoras = new Date(Date.now() - 2 * 3600000).toISOString();
  const [pendentes, atrasados, antiga] = await Promise.all([
    contar(T.envios, 'status=eq.pendente'),
    contar(T.envios, `status=eq.pendente&enviar_em=lte.${encodeURIComponent(duasHoras)}`),
    selecionarUm(T.envios, 'select=enviar_em&status=eq.pendente&order=enviar_em.asc&limit=1').catch(() => null),
  ]);
  return { pendentes, atrasados, maisAntigoEm: antiga?.enviar_em || null };
}

/** Quantas cabem nesta rodada sem passar do limite por hora (e do lote máximo). */
export function vagasNestaRodada(limitePorHora, enviadasUltimaHora, loteMax = 25) {
  const lim = Math.max(1, Number(limitePorHora) || 60);
  return Math.max(0, Math.min(loteMax, lim - (Number(enviadasUltimaHora) || 0)));
}

export async function enviadasNaUltimaHora() {
  return contar(T.envios, `status=eq.enviado&enviado_em=gte.${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}`);
}

/** Adia um pendente (alguém atendendo, feriado…) com o motivo visível na tela. */
export async function adiarEnvio(id, enviarEm, motivo) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.envios, `id=eq.${id}&status=eq.pendente`, { enviar_em: enviarEm, motivo_pulado: motivo ? `adiado: ${motivo}`.slice(0, 200) : null });
}

/** A conversa do cliente no Atendimento (uma por telefone). */
export async function conversaDoTelefone(telefone) {
  const t = telefoneNacional(telefone);
  if (!t) return null;
  return selecionarUm(T.conversas, `select=id,cliente_id,nome,telefone,aguardando_consultor,aguardando_desde,nao_lidas,ia_ativa&telefone_e164=eq.${encodeURIComponent(t)}&limit=1`);
}

/**
 * Pura: alguém está atendendo agora? Sim se a conversa está esperando o
 * consultor, ou se a última mensagem é do CLIENTE, sem resposta, nas últimas 2 h.
 */
export function conversaOcupada(conversa, ultimaMensagem, agora = Date.now()) {
  if (!conversa) return { ocupada: false };
  if (conversa.aguardando_consultor) return { ocupada: true, motivo: 'o cliente está esperando o consultor no Atendimento' };
  if (ultimaMensagem?.direcao === 'entrada') {
    const idade = agora - new Date(ultimaMensagem.created_at).getTime();
    if (idade >= 0 && idade < 2 * 3600000) return { ocupada: true, motivo: 'o cliente mandou mensagem há pouco e ainda não foi respondido' };
  }
  return { ocupada: false };
}

export async function ocupacaoDaConversa(telefone) {
  const conversa = await conversaDoTelefone(telefone);
  if (!conversa) return { ocupada: false, conversa: null };
  const ultima = await selecionarUm(T.mensagens, `select=direcao,created_at&conversa_id=eq.${conversa.id}&order=created_at.desc&limit=1`);
  return { ...conversaOcupada(conversa, ultima), conversa };
}

/**
 * Depois que o carteiro envia, a mensagem aparece no histórico da conversa do
 * Atendimento: uma linha em whatsapp_mensagens (saída, enviado, sem wamid —
 * a sincronia do Atendimento "adota" a linha quando o aparelho a devolver).
 * Só grava quando a conversa JÁ existe (não abre conversa nem lead novo por
 * causa de um parabéns) e só uma vez por envio (posvenda_envios.mensagem_id).
 * O gatilho de saída zera a espera do consultor e as não lidas: devolvemos
 * como estavam — mensagem automática não é atendimento.
 */
export async function registrarNoHistorico(envio, conversa = undefined) {
  if (!envio?.id || envio.mensagem_id) return { gravou: false, motivo: 'já registrada' };
  const conv = conversa === undefined ? await conversaDoTelefone(envio.telefone) : conversa;
  if (!conv) return { gravou: false, motivo: 'cliente sem conversa no Atendimento' };
  const msg = await inserirUm(T.mensagens, {
    conversa_id: conv.id, cliente_id: uuidOuNulo(envio.cliente_id) || conv.cliente_id || null,
    lead_id: uuidOuNulo(envio.lead_id), agendamento_id: uuidOuNulo(envio.agendamento_id),
    telefone: envio.telefone, nome: envio.nome || conv.nome || null,
    corpo: envio.corpo, direcao: 'saida', status: 'enviado', gerada_por_ia: false,
  }, 'select=id,conversa_id');
  if (!msg) return { gravou: false, motivo: 'descartada como duplicada pelo Atendimento' };
  const volta = {};
  if (conv.aguardando_consultor) { volta.aguardando_consultor = true; volta.aguardando_desde = conv.aguardando_desde; }
  if (Number(conv.nao_lidas) > 0) volta.nao_lidas = Number(conv.nao_lidas);
  if (Object.keys(volta).length) await atualizarUm(T.conversas, `id=eq.${conv.id}`, volta).catch(() => null);
  await atualizarUm(T.envios, `id=eq.${envio.id}`, { mensagem_id: msg.id, conversa_id: msg.conversa_id || conv.id }).catch(() => null);
  return { gravou: true, mensagem_id: msg.id };
}

// ---- IA: configuração, chave e log ------------------------------------------

let _cacheIaCfg = { valor: null, em: 0 };
/** ia_config (cache 60 s) com os modelos de reserva. */
export async function iaConfig() {
  if (_cacheIaCfg.valor && Date.now() - _cacheIaCfg.em < 60_000) return _cacheIaCfg.valor;
  const c = await selecionarUm(T.iaConfig, 'select=ativo,modelo_rapido,modelo_forte,autonomia,limite_chamadas_dia&id=is.true').catch(() => null);
  const v = {
    ativo: c?.ativo !== false,
    autonomia: ['sugerir', 'confirmar', 'automatico'].includes(c?.autonomia) ? c.autonomia : 'confirmar',
    limite: Number(c?.limite_chamadas_dia) || 500,
    modelos: {
      rapido: c?.modelo_rapido || 'claude-sonnet-5-5',
      forte: c?.modelo_forte || 'claude-opus-5-5',
      barato: 'claude-haiku-5-5',
    },
  };
  _cacheIaCfg = { valor: v, em: Date.now() };
  return v;
}

let _cacheChave = { valor: null, em: 0 };
/** Chave da IA: ANTHROPIC_API_KEY ou, se faltar, agenda_ia_config.api_key (service role). Nunca sai do servidor. */
export async function chaveIA() {
  const env = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (env) return env;
  if (_cacheChave.valor && Date.now() - _cacheChave.em < 5 * 60_000) return _cacheChave.valor;
  const r = await selecionarUm(T.agendaIa, 'select=api_key&id=is.true').catch(() => null);
  _cacheChave = { valor: r?.api_key || null, em: Date.now() };
  return _cacheChave.valor;
}

export async function chamadasIAHoje() {
  return contar(T.iaAcoes, `origem=eq.comunicar&created_at=gte.${encodeURIComponent(instanteSP(hoje(), '00:00').toISOString())}`).catch(() => 0);
}

/** Tudo o que a IA faz no Comunicar vai para ia_acoes (origem 'comunicar'). */
export async function registrarAcaoIA(a) {
  return inserirUm(T.iaAcoes, {
    origem: 'comunicar', tipo: a.tipo, status: a.status || 'executada',
    conversa_id: uuidOuNulo(a.conversa_id), cliente_id: uuidOuNulo(a.cliente_id), lead_id: uuidOuNulo(a.lead_id),
    agendamento_id: uuidOuNulo(a.agendamento_id), perfil_id: uuidOuNulo(a.perfil_id),
    resumo: a.resumo ? String(a.resumo).slice(0, 500) : null, entrada: a.entrada ?? null, saida: a.saida ?? null,
    erro: a.erro ? String(a.erro).slice(0, 500) : null, modelo: a.modelo || null,
    tokens_entrada: Number.isInteger(a.tokens_entrada) ? a.tokens_entrada : null,
    tokens_saida: Number.isInteger(a.tokens_saida) ? a.tokens_saida : null,
    duracao_ms: Number.isInteger(a.duracao_ms) ? a.duracao_ms : null,
    executada_em: a.executada_em || null,
  }, 'select=id').catch((e) => { console.error('ia_acoes:', e?.message || e); return null; });
}

/** Marca a conversa do envio como "esperando o consultor" (o Atendimento atende). */
export async function chamarConsultor(envio) {
  let convId = uuidOuNulo(envio.conversa_id);
  if (!convId) convId = (await conversaDoTelefone(envio.telefone))?.id || null;
  if (!convId) return false;
  // não sobrescreve a hora de quem já estava esperando
  const ja = await atualizarUm(T.conversas, `id=eq.${convId}&aguardando_consultor=is.true`, { updated_at: new Date().toISOString() });
  const r = ja || await atualizarUm(T.conversas, `id=eq.${convId}`, {
    aguardando_consultor: true, aguardando_desde: envio.respondido_em || new Date().toISOString(),
  });
  if (r && envio.conversa_id !== convId && envio.id) await atualizarUm(T.envios, `id=eq.${envio.id}`, { conversa_id: convId }).catch(() => null);
  return !!r;
}

/** A "loja" que a leitura das respostas usa (ia.js › lerRespostas). */
export const lojaRespostas = {
  async pendentes(limite = 20) {
    const p = new URLSearchParams('select=id,tipo,corpo,resposta,resposta_tipo,respondido_em,cliente_id,lead_id,agendamento_id,conversa_id,telefone,intencao,nome,tarefa_id');
    p.set('respondido_em', `gte.${new Date(Date.now() - 72 * 3600000).toISOString()}`);
    p.set('intencao', 'is.null');
    p.set('resposta_tipo', 'neq.parar');
    p.set('order', 'respondido_em.asc');
    p.set('limit', String(limite));
    return selecionar(T.envios, p);
  },
  gravarIntencao: (id, campos) => atualizarUm(T.envios, `id=eq.${id}`, campos),
  chamarConsultor,
  registrar: registrarAcaoIA,
};

/** Respostas lidas pela IA nos últimos N dias (para a tela). */
export async function intencoesRecentes(dias = 7) {
  const p = new URLSearchParams('select=id,tipo,nome,telefone,cliente_id,conversa_id,resposta,respondido_em,intencao,intencao_resumo,encaminhado_em');
  p.set('intencao', 'not.is.null');
  p.set('respondido_em', `gte.${new Date(Date.now() - dias * 86400000).toISOString()}`);
  p.set('order', 'respondido_em.desc');
  p.set('limit', '200');
  const lista = await selecionar(T.envios, p);
  const contagem = {};
  for (const e of lista) contagem[e.intencao] = (contagem[e.intencao] || 0) + 1;
  return { contagem, lista };
}

/** Clique "Passar ao Atendimento" (modo confirmar). */
export async function encaminharEnvio(id, perfil = null) {
  if (!ehUuid(id)) return null;
  const e = await selecionarUm(T.envios, `select=*&id=eq.${id}`);
  if (!e) return null;
  const ok = await chamarConsultor(e);
  if (!ok) return { ok: false, erro: 'Esse cliente ainda não tem conversa no Atendimento.' };
  await atualizarUm(T.envios, `id=eq.${id}`, { encaminhado_em: new Date().toISOString() });
  await registrarAcaoIA({
    tipo: 'chamar_consultor', status: 'executada', cliente_id: e.cliente_id, conversa_id: e.conversa_id, perfil_id: perfil?.id,
    resumo: `Passou ao consultor (${e.intencao || 'resposta'}) com um clique${perfil?.nome ? ` de ${perfil.nome}` : ''}`,
    entrada: { envio_id: id }, executada_em: new Date().toISOString(),
  });
  return { ok: true };
}

/** Resumo da IA guardado em cache (6 h) na configuração. */
export async function salvarResumoIA(texto) {
  return atualizarUm(T.config, LINHA_UNICA, { ia_resumo: texto, ia_resumo_em: new Date().toISOString() });
}

/** Números compactos da semana para a IA (sem nome de cliente). */
export async function numerosDaSemana() {
  const r = await resumo();
  const { contagem } = await intencoesRecentes(7).catch(() => ({ contagem: {} }));
  const sd = await saude().catch(() => null);
  const porRegua = Object.fromEntries(Object.entries(r.porRegua).map(([k, v]) => [k, {
    ligada: v.ligada, enviadas_30d: v.enviadas, responderam: v.respondidas, positivas: v.positivas,
    negativas: v.negativas, pediram_parar: v.pararam, agendaram: v.agendaram,
  }]));
  return {
    hoje: hoje(), na_fila: r.pendentes, atrasadas: r.vencidos, falhas_30d: r.falhas, ultimo_erro: r.ultimoErro,
    semana: r.semana, mes30: r.mes30, por_regua: porRegua, intencoes_7d: contagem,
    satisfacao: r.satisfacao, fora_da_lista: r.foraDaLista, horarios_48h: r.proximos48h,
    aniversariantes_mes: r.aniversariantesDoMes.length, clientes_com_aniversario: r.comNascimento,
    pausa_geral: r.pausaGeral, reguas_ligadas: r.reguasLigadas,
    whatsapp_parado: !!sd?.whatsappParado, problema_do_sistema: sd?.problema || null,
  };
}

/** Pura: agrupa envios em semanas (segunda a domingo) para o gráfico do relatório. */
export function semanasDoRelatorio(envios, semanas = 8, hojeIso = hoje()) {
  const dow = new Date(hojeIso + 'T12:00:00').getDay();
  const segunda = somarDias(hojeIso, -((dow + 6) % 7));
  const lista = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const ini = somarDias(segunda, -7 * i);
    lista.push({ inicio: ini, fim: somarDias(ini, 6), enviadas: 0, respondidas: 0, positivas: 0, negativas: 0, agendaram: 0 });
  }
  for (const e of envios) {
    if (e.status !== 'enviado' || !e.enviado_em) continue;
    const d = agoraSP(new Date(e.enviado_em)).data;
    const s = lista.find((x) => d >= x.inicio && d <= x.fim);
    if (!s) continue;
    s.enviadas++;
    if (e.respondido_em) s.respondidas++;
    if (e.resposta_tipo === 'positiva') s.positivas++;
    if (e.resposta_tipo === 'negativa') s.negativas++;
    if (e.agendou_depois_id) s.agendaram++;
  }
  return lista;
}

/** Relatório de uma régua (ou de todas): 8 semanas, taxas e intenções. Rodada 5: aceita período (de/até). */
export async function relatorioRegua(tipo = null, semanas = 8, { de = null, ate = null } = {}) {
  const dIni = dataBanco(de), dFim = dataBanco(ate);
  const desde = dIni ? instanteSP(dIni, '00:00').toISOString() : instanteSP(somarDias(hoje(), -7 * semanas - 7), '00:00').toISOString();
  const p = new URLSearchParams('select=tipo,status,enviado_em,respondido_em,resposta_tipo,agendou_depois_id,intencao,erro_classe');
  p.set('status', 'in.(enviado,falhou)');
  p.set('enviar_em', `gte.${desde}`);
  if (dFim) p.append('enviar_em', `lt.${instanteSP(somarDias(dFim, 1), '00:00').toISOString()}`);
  if (tipo && tipo !== 'todas') p.set('tipo', `eq.${tipo}`);
  const envios = await selecionarTudo(T.envios, p);
  return montarRelatorio(envios, tipo, semanas, hoje(), { de: dIni, ate: dFim });
}

/** Pura: relatório a partir dos envios (o mock usa a mesma). Rodada 5: opt-out, falhas e período. */
export function montarRelatorio(envios, tipo = null, semanas = 8, hojeIso = hoje(), periodo = {}) {
  const linhas = semanasDoRelatorio(envios, semanas, hojeIso);
  const enviados = envios.filter((e) => e.status === 'enviado');
  const tot = {
    enviadas: enviados.length,
    respondidas: enviados.filter((e) => e.respondido_em).length,
    agendaram: enviados.filter((e) => e.agendou_depois_id).length,
    positivas: enviados.filter((e) => e.resposta_tipo === 'positiva').length,
    negativas: enviados.filter((e) => e.resposta_tipo === 'negativa').length,
    optout: enviados.filter((e) => e.resposta_tipo === 'parar').length,
    falharam: envios.filter((e) => e.status === 'falhou').length,
  };
  const intencoes = {};
  for (const e of envios) if (e.intencao) intencoes[e.intencao] = (intencoes[e.intencao] || 0) + 1;
  const pct = (n) => (tot.enviadas ? Math.round((n / tot.enviadas) * 100) : null);
  return {
    tipo: tipo || 'todas', semanas: linhas, total: tot, intencoes, periodo: { de: periodo.de || null, ate: periodo.ate || null },
    taxaResposta: pct(tot.respondidas), taxaAgendamento: pct(tot.agendaram), taxaOptout: pct(tot.optout),
  };
}

/** Pura: uma linha por régua/tipo no período (enviadas, responderam, agendaram depois, pediram para parar, falharam). */
export function montarRelatorioPorRegua(envios, tipos = TIPOS_ENVIO) {
  const linhas = {};
  for (const t of tipos) linhas[t] = { tipo: t, rotulo: ROTULO_TIPO[t] || t, enviadas: 0, respondidas: 0, agendaram: 0, optout: 0, negativas: 0, falharam: 0 };
  for (const e of envios) {
    const l = linhas[e.tipo] || (linhas[e.tipo] = { tipo: e.tipo, rotulo: ROTULO_TIPO[e.tipo] || e.tipo, enviadas: 0, respondidas: 0, agendaram: 0, optout: 0, negativas: 0, falharam: 0 });
    if (e.status === 'falhou') { l.falharam++; continue; }
    if (e.status !== 'enviado') continue;
    l.enviadas++;
    if (e.respondido_em) l.respondidas++;
    if (e.agendou_depois_id) l.agendaram++;
    if (e.resposta_tipo === 'parar') l.optout++;
    if (e.resposta_tipo === 'negativa') l.negativas++;
  }
  return Object.values(linhas).filter((l) => l.enviadas || l.falharam || REGUAS.includes(l.tipo))
    .map((l) => ({ ...l, taxaResposta: l.enviadas ? Math.round((l.respondidas / l.enviadas) * 100) : null, taxaAgendamento: l.enviadas ? Math.round((l.agendaram / l.enviadas) * 100) : null }))
    .sort((a, b) => b.enviadas - a.enviadas || a.rotulo.localeCompare(b.rotulo));
}

/** Relatório por régua num período (padrão: 30 dias). */
export async function relatorioPorRegua({ de = null, ate = null } = {}) {
  const dIni = dataBanco(de) || somarDias(hoje(), -30), dFim = dataBanco(ate) || hoje();
  const p = new URLSearchParams('select=tipo,status,enviar_em,respondido_em,resposta_tipo,agendou_depois_id');
  p.set('status', 'in.(enviado,falhou)');
  p.set('enviar_em', `gte.${instanteSP(dIni, '00:00').toISOString()}`);
  p.append('enviar_em', `lt.${instanteSP(somarDias(dFim, 1), '00:00').toISOString()}`);
  const envios = await selecionarTudo(T.envios, p);
  return { periodo: { de: dIni, ate: dFim }, linhas: montarRelatorioPorRegua(envios) };
}

/** Pura: CSV (separador ; e BOM, abre direto no Excel em pt-BR). Fórmulas neutralizadas. */
export function paraCSV(linhas, colunas) {
  const cel = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = colunas.map((c) => cel(c.rotulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => cel(typeof c.valor === 'function' ? c.valor(l) : l[c.campo])).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n');
}

const dataHoraSP = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const a = agoraSP(d);
  return `${a.data.split('-').reverse().join('/')} ${String(a.hora).padStart(2, '0')}:${String(a.minuto).padStart(2, '0')}`;
};
export const COLUNAS_CSV_ENVIOS = [
  { rotulo: 'Programada para', valor: (e) => dataHoraSP(e.enviar_em) },
  { rotulo: 'Enviada em', valor: (e) => dataHoraSP(e.enviado_em) },
  { rotulo: 'Tipo', valor: (e) => ROTULO_TIPO[e.tipo] || e.tipo },
  { rotulo: 'Status', campo: 'status' },
  { rotulo: 'Cliente', campo: 'nome' },
  { rotulo: 'Telefone', campo: 'telefone' },
  { rotulo: 'Mensagem', campo: 'corpo' },
  { rotulo: 'Resposta', campo: 'resposta' },
  { rotulo: 'Tom da resposta', campo: 'resposta_tipo' },
  { rotulo: 'Intenção (IA)', campo: 'intencao' },
  { rotulo: 'Agendou depois', valor: (e) => (e.agendou_depois_id ? 'sim' : '') },
  { rotulo: 'Tentativas', campo: 'tentativas' },
  { rotulo: 'Erro', campo: 'erro' },
  { rotulo: 'Criada por', campo: 'criado_por' },
];

/**
 * Aniversários na base compartilhada (a mesma do CRM e do Atendimento):
 * quantos têm data, os próximos 30 dias e quem foi atendido recentemente sem data.
 */
export async function aniversariosDaBase() {
  const h = hoje();
  const [comData, total, recentes] = await Promise.all([
    selecionarTudo(T.clientes, 'select=id,nome,telefone,nascimento,aceita_mensagens&nascimento=not.is.null'),
    contar(T.clientes, 'telefone=not.is.null'),
    selecionar(T.agendamentos, 'select=cliente_id,data&status=eq.concluido&cliente_id=not.is.null&order=data.desc&limit=300'),
  ]);
  return montarAniversarios(comData, total, recentes, h, clientesPorIds);
}

/** Meio-pura (a busca dos sem-data é injetada): o mock usa a mesma. */
export async function montarAniversarios(comData, total, recentes, h, buscarClientes) {
  const proximos = [];
  for (const c of comData) {
    const mmdd = String(c.nascimento).slice(5, 10);
    for (let i = 0; i <= 30; i++) {
      const d = somarDias(h, i);
      if (d.slice(5) === mmdd) { proximos.push({ id: c.id, nome: c.nome, telefone: c.telefone, data: d, em_dias: i, aceita: c.aceita_mensagens !== false }); break; }
    }
  }
  proximos.sort((a, b) => a.em_dias - b.em_dias);
  const comDataIds = new Set(comData.map((c) => c.id));
  const semDataIds = [...new Set(recentes.map((a) => a.cliente_id).filter((id) => id && !comDataIds.has(id)))].slice(0, 12);
  const semData = semDataIds.length ? await buscarClientes(semDataIds) : [];
  return { total, comData: comData.length, proximos: proximos.slice(0, 40), semDataRecentes: semData.slice(0, 12) };
}

// ============================================================================
// RODADA 3 (13/10/2026) — equipe: perfil, último acesso, sino, tarefas,
// gestores, auditoria, campanhas com aprovação, falhas por régua
// ============================================================================

T.tarefas = 'tarefas';
T.notificacoes = 'notificacoes';
T.campanhas = 'comunicar_campanhas';

const CAMPOS_PERFIL = 'id,nome,email,papel,ativo,apps,cargo,telefone,avatar_cor,preferencias,precisa_trocar_senha,ultimo_acesso_em,ultimo_app';

/** Perfil completo (porteiro da rodada 3: papel, apps, troca de senha). */
export async function perfilCompleto(id) {
  if (!ehUuid(id)) return null;
  return selecionarUm(T.perfis, `select=${CAMPOS_PERFIL}&id=eq.${id}`);
}

/** A própria pessoa muda nome/cargo/telefone/cor/preferências (as preferências dos outros apps ficam). */
export async function atualizarMeuPerfil(id, campos) {
  if (!ehUuid(id) || !campos || !Object.keys(campos).length) return perfilCompleto(id);
  const c = { ...campos };
  if (c.preferencias) {
    const atual = (await selecionarUm(T.perfis, `select=preferencias&id=eq.${id}`))?.preferencias || {};
    c.preferencias = mesclarPreferencias(atual, c.preferencias); // merge profundo: não apaga o que os outros apps guardaram
  }
  return atualizarUm(T.perfis, `id=eq.${id}&select=${CAMPOS_PERFIL}`, c);
}

export async function marcarAcesso(id) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.perfis, `id=eq.${id}&select=id`, { ultimo_acesso_em: new Date().toISOString(), ultimo_app: 'comunicar' });
}

export async function senhaTrocada(id) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.perfis, `id=eq.${id}&select=id,precisa_trocar_senha`, { precisa_trocar_senha: false });
}

// ---- sino --------------------------------------------------------------------
export async function minhasNotificacoes(perfilId, limite = 30) {
  if (!ehUuid(perfilId)) return { lista: [], naoLidas: 0 };
  const [lista, naoLidas] = await Promise.all([
    selecionar(T.notificacoes, `select=id,tipo,titulo,corpo,link,app,lida_em,created_at&perfil_id=eq.${perfilId}&order=created_at.desc&limit=${Math.min(Number(limite) || 30, 100)}`),
    contar(T.notificacoes, `perfil_id=eq.${perfilId}&lida_em=is.null`),
  ]);
  return { lista, naoLidas };
}
export async function marcarNotificacaoLida(perfilId, id) {
  if (!ehUuid(perfilId) || !ehUuid(id)) return null;
  return atualizarUm(T.notificacoes, `id=eq.${id}&perfil_id=eq.${perfilId}&select=id,lida_em`, { lida_em: new Date().toISOString() });
}
export async function marcarTodasLidas(perfilId) {
  if (!ehUuid(perfilId)) return 0;
  return (await atualizar(T.notificacoes, `perfil_id=eq.${perfilId}&lida_em=is.null&select=id`, { lida_em: new Date().toISOString() })).length;
}

// ---- tarefas -----------------------------------------------------------------
const CAMPOS_TAREFA = 'id,titulo,descricao,responsavel_id,criado_por,cliente_id,lead_id,conversa_id,agendamento_id,origem,prioridade,vence_em,status,created_at';
export async function minhasTarefas(perfilId, limite = 50) {
  if (!ehUuid(perfilId)) return [];
  const p = new URLSearchParams(`select=${CAMPOS_TAREFA},clientes(nome,telefone)`);
  p.set('responsavel_id', `eq.${perfilId}`);
  p.set('status', 'eq.aberta');
  p.set('order', 'prioridade.asc,vence_em.asc.nullslast,created_at.desc');
  p.set('limit', String(limite));
  return (await selecionar(T.tarefas, p)).map(({ clientes, ...t }) => ({ ...t, cliente_nome: clientes?.nome ?? null, cliente_telefone: clientes?.telefone ?? null }));
}
export async function obterTarefa(id) {
  if (!ehUuid(id)) return null;
  return selecionarUm(T.tarefas, `select=${CAMPOS_TAREFA}&id=eq.${id}`);
}
export async function criarTarefa(t) {
  const titulo = String(t.titulo || '').trim().slice(0, 200);
  if (!titulo) return null;
  return inserirUm(T.tarefas, {
    titulo, descricao: t.descricao ? String(t.descricao).slice(0, 2000) : null,
    responsavel_id: uuidOuNulo(t.responsavel_id), criado_por: uuidOuNulo(t.criado_por),
    cliente_id: uuidOuNulo(t.cliente_id), lead_id: uuidOuNulo(t.lead_id), conversa_id: uuidOuNulo(t.conversa_id),
    agendamento_id: uuidOuNulo(t.agendamento_id), origem: t.origem || 'comunicar',
    prioridade: [1, 2, 3].includes(Number(t.prioridade)) ? Number(t.prioridade) : 2,
    vence_em: t.vence_em || null,
  }, `select=${CAMPOS_TAREFA}`);
}
export async function concluirTarefa(id, perfilId) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.tarefas, `id=eq.${id}&status=eq.aberta&select=${CAMPOS_TAREFA}`,
    { status: 'feita', concluida_em: new Date().toISOString(), concluida_por: uuidOuNulo(perfilId) });
}

// ---- gestores, notificações e auditoria (rpc do banco, só service role) --------
/** Quem recebe os avisos do Comunicar (admin sempre; gestor com o app), sem quem desligou esse tipo. */
export async function gestores(tipo = null) {
  const r = await rpc('comunicar_gestores', { p_tipo: tipo });
  return (Array.isArray(r) ? r : []).map((x) => (typeof x === 'string' ? x : x?.comunicar_gestores)).filter(ehUuid);
}
export async function notificar({ perfil, tipo, titulo, corpo = null, link = null, app = 'comunicar', chave = null }) {
  if (!ehUuid(perfil)) return null;
  return rpc('notificar', { p_perfil: perfil, p_tipo: tipo, p_titulo: titulo, p_corpo: corpo, p_link: link, p_app: app, p_chave: chave });
}
export async function auditar(perfilId, acao, tabela = null, registro = null, detalhes = null) {
  return rpc('registrar_auditoria', {
    p_perfil: uuidOuNulo(perfilId), p_app: 'comunicar', p_acao: acao,
    p_tabela: tabela, p_registro: registro == null ? null : String(registro), p_detalhes: detalhes,
  }).catch((e) => { console.error('auditoria:', e?.message || e); return null; });
}

/** Dono da conversa do envio (perfil ativo da equipe) — para a tarefa ir para ele. */
export async function donoDaConversa(envio) {
  let conv = null;
  if (ehUuid(envio?.conversa_id)) conv = await selecionarUm(T.conversas, `select=id,atribuida_a&id=eq.${envio.conversa_id}`);
  if (!conv && envio?.telefone) conv = await conversaDoTelefone(envio.telefone).catch(() => null);
  if (!conv) return { conversaId: null, dono: null };
  let dono = conv.atribuida_a || null;
  if (dono) {
    const p = await selecionarUm(T.perfis, `select=id,ativo,papel&id=eq.${dono}`).catch(() => null);
    if (!p?.ativo || !['admin', 'gestor', 'atendente'].includes(p.papel)) dono = null;
  }
  return { conversaId: conv.id, dono };
}
export async function ligarTarefaAoEnvio(envioId, tarefaId) {
  if (!ehUuid(envioId) || !ehUuid(tarefaId)) return null;
  return atualizarUm(T.envios, `id=eq.${envioId}&tarefa_id=is.null&select=id`, { tarefa_id: tarefaId });
}

/** Falhas definitivas por régua desde `desdeIso` (para o aviso "régua falhou 3 vezes"). */
export async function falhasPorTipo(desdeIso) {
  const p = new URLSearchParams('select=tipo,erro,enviar_em');
  p.set('status', 'eq.falhou');
  p.set('enviar_em', `gte.${desdeIso}`);
  p.set('order', 'enviar_em.desc');
  p.set('limit', '500');
  const saida = {};
  for (const e of await selecionar(T.envios, p)) {
    const s = (saida[e.tipo] ||= { total: 0, ultimoErro: null });
    s.total++;
    if (!s.ultimoErro && e.erro) s.ultimoErro = String(e.erro).slice(0, 160);
  }
  return saida;
}

export async function ultimoResumoEquipe() {
  return (await selecionarUm(T.config, `select=resumo_equipe_em&${LINHA_UNICA}`).catch(() => null))?.resumo_equipe_em || null;
}
export async function marcarResumoEquipe(iso) {
  return atualizarUm(T.config, LINHA_UNICA, { resumo_equipe_em: iso }).catch(() => null);
}

/** A loja das automações da equipe (automacoes.js). */
export const lojaEquipe = {
  donoDaConversa, gestores, notificar,
  criarTarefa: (t) => criarTarefa(t),
  ligarTarefa: ligarTarefaAoEnvio,
  falhasPorTipo, ultimoResumoEquipe, marcarResumoEquipe,
  numerosDaSemana: () => numerosDaSemana(),
};

// ---- fila em lote (campanha grande sem 2.000 requisições) ----------------------
export async function enfileirarVarios(linhas) {
  const boas = linhas.filter((l) => soDigitos(l.telefone) && l.corpo && l.tipo).map((l) => ({
    cliente_id: uuidOuNulo(l.cliente_id), agendamento_id: null, lead_id: null,
    telefone: soDigitos(l.telefone), nome: l.nome ?? null, tipo: l.tipo, corpo: String(l.corpo).slice(0, 2000),
    enviar_em: l.enviar_em || new Date().toISOString(), chave_unica: null, criado_por: l.criado_por ?? null,
    status: 'pendente', motivo_pulado: null, lote: uuidOuNulo(l.lote),
    criado_por_id: uuidOuNulo(l.criado_por_id), campanha_id: uuidOuNulo(l.campanha_id),
  }));
  let criados = 0;
  for (let i = 0; i < boas.length; i += 200) criados += (await inserir(T.envios, boas.slice(i, i + 200), 'select=id')).length;
  return criados;
}

export async function obterEnvio(id) {
  if (!ehUuid(id)) return null;
  return selecionarUm(T.envios, `select=id,tipo,status,criado_por,criado_por_id,cliente_id,telefone,nome&id=eq.${id}`);
}

// ---- campanhas com aprovação --------------------------------------------------
const CAMPOS_CAMPANHA = 'id,status,corpo,detalhe,segmento,destinos,total_previsto,enviar_em,criado_por,criado_por_nome,decidido_por,decidido_por_nome,decidido_em,motivo_recusa,lote,enfileirados,pulados,created_at,origem';
export async function criarPropostaCampanha(c) {
  return inserirUm(T.campanhas, {
    status: 'aguardando', corpo: String(c.corpo).slice(0, 2000), detalhe: c.detalhe ? String(c.detalhe).slice(0, 200) : null,
    segmento: c.segmento || null, destinos: c.destinos || null, total_previsto: Number.isInteger(c.total_previsto) ? c.total_previsto : null,
    enviar_em: c.enviar_em || null, criado_por: uuidOuNulo(c.criado_por), criado_por_nome: c.criado_por_nome || null,
  }, `select=${CAMPOS_CAMPANHA}`);
}
export async function listarCampanhas({ status = 'aguardando', criadoPor = null, limite = 50 } = {}) {
  const p = new URLSearchParams(`select=${CAMPOS_CAMPANHA}`);
  if (status && status !== 'todas') p.set('status', `eq.${status}`);
  if (ehUuid(criadoPor)) p.set('criado_por', `eq.${criadoPor}`);
  p.set('order', 'created_at.desc');
  p.set('limit', String(Math.min(Number(limite) || 50, 200)));
  return selecionar(T.campanhas, p);
}
export async function obterCampanha(id) {
  if (!ehUuid(id)) return null;
  return selecionarUm(T.campanhas, `select=${CAMPOS_CAMPANHA}&id=eq.${id}`);
}
/** Só decide o que ainda está aguardando (dois gestores clicando juntos: só um vence). */
export async function decidirCampanha(id, campos) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.campanhas, `id=eq.${id}&status=eq.aguardando&select=${CAMPOS_CAMPANHA}`, { ...campos, updated_at: new Date().toISOString() });
}
export async function completarCampanha(id, campos) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.campanhas, `id=eq.${id}&select=${CAMPOS_CAMPANHA}`, { ...campos, updated_at: new Date().toISOString() });
}

// ============================================================================
// RODADA 4 (14/10/2026) — carteiro tolerante, prontidão, aniversários, prévia
// do mês, indicadores por pessoa. As regras puras moram em carteiro.js,
// prontidao.js, aniversarios.js e projecao.js; aqui só as leituras/gravações.
// ============================================================================

T.batidas = 'comunicar_carteiro_batidas';

/**
 * Reserva o envio antes de ir ao WhatsApp: só passa se ainda está pendente e
 * sem reserva. Dois carteiros ao mesmo tempo (timer + pg_cron, ou dois
 * processos durante um deploy) nunca mandam a mesma mensagem.
 */
export async function reservarEnvio(id) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.envios, `id=eq.${id}&status=eq.pendente&enviando_em=is.null&select=id`, { enviando_em: new Date().toISOString() });
}

/** Volta para a fila sem gastar tentativa (lembrete remarcado, régua esperou…). */
export async function atualizarEnvio(id, campos) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.envios, `id=eq.${id}&status=eq.pendente`, { enviando_em: null, ...campos });
}

/** Pendentes cuja validade passou → 'pulado' com o motivo (lembrete depois do horário, parabéns velho). */
export async function expirarVencidos(motivo, agoraIso = new Date().toISOString()) {
  const linhas = await atualizar(T.envios, `status=eq.pendente&expira_em=lt.${agoraIso}&select=id,tipo`, { status: 'pulado', motivo_pulado: motivo, enviando_em: null });
  return linhas.length;
}

/** Reservas de mais de 15 min ainda pendentes = o servidor caiu no meio: 'falhou' (NUNCA reenvia sozinho). */
export async function soltarReservasPresas(erro, minutos = 15) {
  const limite = new Date(Date.now() - minutos * 60000).toISOString();
  const linhas = await atualizar(T.envios, `status=eq.pendente&enviando_em=lt.${limite}&select=id`, { status: 'falhou', erro, enviando_em: null });
  return linhas.length;
}

/** Agendamentos (para conferir os lembretes antes de sair). */
export async function agendamentosPorIds(ids) {
  const lista = [...new Set((ids || []).filter(ehUuid))];
  if (!lista.length) return new Map();
  const linhas = await selecionar(T.agendamentos, `${A_SEL}&id=in.(${lista.join(',')})`);
  return new Map(linhas.map((a) => [a.id, a]));
}

/** Cada rodada do carteiro fica anotada (a tela mostra as últimas 24 h). */
export async function registrarBatida(b) {
  const linha = {
    origem: ['cron', 'reforco', 'timer', 'inicio', 'manual', 'github'].includes(b.origem) ? b.origem : 'desconhecido',
    duracao_ms: Number.isFinite(b.duracao_ms) ? Math.round(b.duracao_ms) : null, ok: b.ok !== false,
    criados: Number(b.criados) || 0, enviados: Number(b.enviados) || 0, falhas: Number(b.falhas) || 0,
    expirados: Number(b.expirados) || 0, presos: Number(b.presos) || 0,
    aviso: b.aviso ? String(b.aviso).slice(0, 300) : null, erro: b.erro ? String(b.erro).slice(0, 300) : null,
    versao: b.versao || null,
  };
  return inserirUm(T.batidas, linha).catch((e) => { console.error('batida do carteiro:', e?.message || e); return null; });
}

export async function batidasRecentes(horas = 24) {
  const desde = new Date(Date.now() - horas * 3600000).toISOString();
  return selecionar(T.batidas, `select=em,origem,duracao_ms,ok,criados,enviados,falhas,expirados,presos,aviso,erro&em=gte.${desde}&order=em.desc&limit=400`);
}

/** Chamadas do pg_cron com o resultado (200 / 503 / tempo esgotado) — rpc só do servidor. */
export async function chamadasRecentes(horas = 24) {
  const r = await rpc('comunicar_chamadas_recentes', { p_horas: horas }).catch(() => []);
  return Array.isArray(r) ? r : [];
}

/** O último "Mandar teste para mim" que saiu bem (para o checklist). */
export async function ultimoTesteOk() {
  const p = new URLSearchParams('select=enviado_em');
  p.set('tipo', 'eq.avulsa'); p.set('status', 'eq.enviado'); p.set('nome', 'like.Teste (*');
  p.set('order', 'enviado_em.desc.nullslast'); p.set('limit', '1');
  return (await selecionarUm(T.envios, p))?.enviado_em || null;
}

/** Selo da aba Mensagens sem baixar a fila inteira. */
export async function contarPendentes() {
  return contar(T.envios, 'status=eq.pendente');
}

/** Clientes para casar com a lista de aniversários (só o necessário). */
export async function clientesParaCasar() {
  return selecionarTudo(T.clientes, 'select=id,nome,telefone,nascimento&order=nome.asc');
}

/** Grava as datas escolhidas (uma requisição por cliente; ids e datas validados). */
export async function gravarNascimentos(itens, { substituir = false } = {}) {
  let gravados = 0; const erros = [];
  for (const i of itens) {
    if (!ehUuid(i.cliente_id) || !/^\d{4}-\d{2}-\d{2}$/.test(String(i.nascimento || ''))) continue;
    try {
      const r = await atualizarUm(T.clientes, `id=eq.${i.cliente_id}${substituir ? '' : '&nascimento=is.null'}&select=id`, { nascimento: i.nascimento });
      if (r) gravados++;
    } catch (e) { erros.push(String(e?.message || e).slice(0, 120)); }
  }
  return { gravados, erros: erros.slice(0, 5) };
}

/**
 * Textos onde costuma aparecer o aniversário: observações da ficha, observações
 * do lead (CRM) e mensagens que o próprio cliente mandou no WhatsApp.
 * Filtra no banco pelas palavras-chave para não baixar tudo.
 */
export async function textosComAniversario() {
  const filtro = 'or=(observacoes.ilike.*anivers*,observacoes.ilike.*nasc*,observacoes.ilike.*niver*)';
  const [fichas, leads, msgs] = await Promise.all([
    selecionar(T.clientes, `select=id,nome,telefone,nascimento,observacoes&${filtro}&limit=500`).catch(() => []),
    selecionar(T.leads, `select=id,cliente_id,nome,telefone,observacoes&${filtro}&limit=500`).catch(() => []),
    selecionar(T.mensagens, 'select=id,conversa_id,corpo,created_at&direcao=eq.entrada&or=(corpo.ilike.*anivers*,corpo.ilike.*nasci*,corpo.ilike.*niver*)&order=created_at.desc&limit=500').catch(() => []),
  ]);
  const conversaIds = [...new Set(msgs.map((m) => m.conversa_id).filter(ehUuid))];
  const conversas = new Map();
  for (let i = 0; i < conversaIds.length; i += 80) {
    const lote = await selecionar(T.conversas, `select=id,cliente_id,telefone,nome&id=in.(${conversaIds.slice(i, i + 80).join(',')})`).catch(() => []);
    for (const c of lote) conversas.set(c.id, c);
  }
  return { fichas, leads, mensagens: msgs.map((m) => ({ ...m, conversa: conversas.get(m.conversa_id) || null })) };
}

/** Tudo que a prévia do mês precisa (cache curto em rotas.js). */
export async function dadosDaProjecao() {
  const desde = somarDias(hoje(), -(36 * 30 + 40));
  const [cfg, regras, agendamentos, clientes, leads, taxa] = await Promise.all([
    obterConfig(),
    listarRegras(),
    selecionarTudo(T.agendamentos, `select=id,cliente_id,cliente_nome,telefone,servico,data,hora,status&data=gte.${desde}`),
    selecionarTudo(T.clientes, 'select=id,nome,telefone,nascimento,aceita_mensagens'),
    selecionarTudo(T.leads, 'select=id,cliente_id,nome,telefone,status,updated_at&status=eq.orcamento'),
    taxaDeAvaliacao(),
  ]);
  return { cfg, regras, agendamentos, clientes, leads, taxaAvaliacao: taxa };
}

/** Fração dos pós-vendas enviados que viraram avaliação (180 dias); null sem histórico. */
export async function taxaDeAvaliacao() {
  const desde = new Date(Date.now() - 180 * 86400000).toISOString();
  const [pos, aval] = await Promise.all([
    contar(T.envios, `tipo=eq.posvenda&status=eq.enviado&enviado_em=gte.${desde}`).catch(() => 0),
    contar(T.envios, `tipo=eq.avaliacao&status=in.(enviado,pendente)&enviar_em=gte.${desde}`).catch(() => 0),
  ]);
  return pos >= 10 ? Math.min(1, aval / pos) : null;
}

/**
 * Indicadores por pessoa (30 dias): mensagens que cada um mandou, quantas
 * tiveram resposta, quantas viraram agendamento, campanhas propostas/aprovadas.
 * Atendente vê só a dele (filtro feito em rotas.js).
 */
export async function indicadoresEquipe(dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const [envios, campanhas] = await Promise.all([
    selecionarTudo(T.envios, `select=criado_por_id,criado_por,nome,tipo,status,respondido_em,agendou_depois_id&criado_por_id=not.is.null&enviar_em=gte.${desde}`),
    selecionar(T.campanhas, `select=criado_por,criado_por_nome,status,decidido_por,decidido_por_nome&created_at=gte.${desde}&limit=500`).catch(() => []),
  ]);
  return montarIndicadores(envios, campanhas);
}

/** Pura: agrupa por pessoa (testes de WhatsApp não contam). */
export function montarIndicadores(envios, campanhas = []) {
  const pessoas = new Map();
  const p = (id, nome) => {
    if (!pessoas.has(id)) pessoas.set(id, { perfil_id: id, nome: nome || 'Equipe', enviadas: 0, naFila: 0, falharam: 0, responderam: 0, agendaram: 0, propostas: 0, aprovadas: 0, decidiu: 0 });
    const x = pessoas.get(id); if (nome && x.nome === 'Equipe') x.nome = nome; return x;
  };
  for (const e of envios) {
    if (!e.criado_por_id || /^Teste \(/.test(e.nome || '')) continue;
    const x = p(e.criado_por_id, e.criado_por);
    if (e.status === 'enviado') x.enviadas++;
    else if (e.status === 'pendente') x.naFila++;
    else if (e.status === 'falhou') x.falharam++;
    if (e.respondido_em) x.responderam++;
    if (e.agendou_depois_id) x.agendaram++;
  }
  for (const c of campanhas) {
    if (c.criado_por) { const x = p(c.criado_por, c.criado_por_nome); x.propostas++; if (c.status === 'aprovada') x.aprovadas++; }
    if (c.decidido_por && ['aprovada', 'recusada'].includes(c.status)) p(c.decidido_por, c.decidido_por_nome).decidiu++;
  }
  return [...pessoas.values()].map((x) => ({ ...x, taxaResposta: x.enviadas ? Math.round((x.responderam / x.enviadas) * 100) : null }))
    .sort((a, b) => (b.enviadas + b.propostas) - (a.enviadas + a.propostas));
}
export const buscarClientesPorIds = (ids) => clientesPorIds(ids);

/** Para o checklist: quantos clientes têm aniversário e quantos têm telefone. */
export const contarComNascimento = () => contar(T.clientes, 'nascimento=not.is.null');
export const contarClientesComTelefone = () => contar(T.clientes, 'telefone=not.is.null');

// ============================================================================
// PÁTIO + ÁREA DO CLIENTE (16/10/2026) — só leitura do Pátio e o link da Área
// ============================================================================
/** Ordens do pátio (etapa + extras) por id, para o carteiro conferir antes de enviar. */
export async function ordensDoPatio(ids) {
  const lista = [...new Set((ids || []).filter(ehUuid))];
  if (!lista.length) return new Map();
  const [ordens, extras] = await Promise.all([
    selecionar('patio_os', `select=id,etapa&id=in.(${lista.join(',')})`),
    selecionar('patio_extras', `select=os_id,status&os_id=in.(${lista.join(',')})&limit=1000`),
  ]);
  return new Map(ordens.map((o) => [o.id, { ...o, extras: extras.filter((e) => e.os_id === o.id) }]));
}

let _patioCfg = { em: 0, valor: null };
/** patio_config (avisos ligados e link_base), cache de 60 s; null se não deu para ler. */
export async function patioConfig() {
  if (_patioCfg.valor && Date.now() - _patioCfg.em < 60_000) return _patioCfg.valor;
  const c = await selecionarUm('patio_config', 'select=link_base,avisar_pronto,avisar_extra,enviar_link_entrada&id=is.true').catch(() => null);
  if (c) _patioCfg = { em: Date.now(), valor: c };
  return c;
}

/** Avisos do Pátio parados na fila (para o "Pronto para ligar"). */
export async function filaDoPatio() {
  const p = new URLSearchParams('select=id,enviar_em');
  p.set('status', 'eq.pendente');
  p.set('tipo', 'in.(patio_entrada,patio_extra,patio_pronto)');
  p.set('order', 'enviar_em.asc');
  p.set('limit', '200');
  const l = await selecionar(T.envios, p);
  return { pendentes: l.length, maisAntigoEm: l[0]?.enviar_em || null };
}

/** Link NOVO da Área do Cliente (a rpc devolve o token uma vez; o banco guarda só o hash). */
export async function gerarLinkArea(clienteId) {
  if (!ehUuid(clienteId)) return null;
  const token = await rpc('cliente_gerar_acesso', { p_cliente: clienteId });
  const cfg = await patioConfig().catch(() => null);
  return linkArea(cfg?.link_base || PATIO_URL, typeof token === 'string' ? token : null);
}

/** Quantas já saíram hoje + quantas estão programadas para hoje (limite diário das campanhas). */
export async function cargaDeHoje() {
  const ini = instanteSP(hoje(), '00:00').toISOString(), fim = instanteSP(somarDias(hoje(), 1), '00:00').toISOString();
  const [saiu, programadas] = await Promise.all([
    contar(T.envios, `status=eq.enviado&enviado_em=gte.${encodeURIComponent(ini)}`),
    contar(T.envios, `status=eq.pendente&enviar_em=gte.${encodeURIComponent(ini)}&enviar_em=lt.${encodeURIComponent(fim)}`),
  ]);
  return (Number(saiu) || 0) + (Number(programadas) || 0);
}

/** Últimos agendamentos de um cliente (para a prévia real das réguas). */
export async function agendamentosDoCliente(clienteId, limite = 3) {
  if (!ehUuid(clienteId)) return [];
  return selecionar(T.agendamentos, `${A_SEL}&cliente_id=eq.${clienteId}&order=data.desc,hora.desc&limit=${Math.min(Number(limite) || 3, 20)}`);
}
