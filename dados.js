// -----------------------------------------------------------------------------
// Camada de dados da Agenda IndyCar — fala com o Supabase e devolve para o
// server.js / public/app.js EXATAMENTE o formato que eles já esperavam do SQLite.
//
// É aqui que ficam todas as conversões da migração:
//   • booleano  : Postgres usa true/false, a tela usa 0/1 (app.js compara ===0 e ===1)
//   • origem    : o enum canal_origem é minúsculo, a tela usa 'Google', 'WhatsApp'...
//   • hora      : o Postgres devolve '09:00:00', a tela espera '09:00'
//   • consultor : o PostgREST devolve consultores:{nome,cor} aninhado, a tela lê
//                 consultor_nome / consultor_cor no nível raiz
//   • veículo   : clientes.veiculo/modelo não existem no Supabase (carro_modelo/carro_ano)
//   • ids       : agora são uuid (string), não mais inteiro autoincremento
// -----------------------------------------------------------------------------

import {
  selecionar, selecionarUm, selecionarTudo,
  inserirUm, atualizar, atualizarUm, remover, contar,
} from './supabase.js';
import { randomBytes } from 'node:crypto';

// Tabelas de configuração ganharam o prefixo agenda_ no banco compartilhado.
const T = {
  agendamentos: 'agendamentos',
  clientes: 'clientes',
  consultores: 'consultores',
  servicos: 'servicos',
  mensagens: 'whatsapp_mensagens',
  empresa: 'agenda_empresa',
  waConfig: 'agenda_whatsapp_config',
  iaConfig: 'agenda_ia_config',
  integracoes: 'agenda_integracoes',
  templates: 'agenda_templates',
  // Tabelas compartilhadas com o CRM e o Atendimento — a Agenda só LÊ (exceto
  // o próprio nome em perfis, que cada pessoa altera na aba Configurações).
  perfis: 'perfis',
  janelas: 'janelas_agendamento',
  catalogo: 'catalogo_servicos',
};

// A linha única das tabelas de configuração tem id BOOLEAN true (não mais o inteiro 1).
const LINHA_UNICA = 'id=is.true';

const STATUS_VALIDOS = new Set([
  'aguardando', 'confirmado', 'em_atendimento', 'compareceu',
  'nao_veio', 'concluido', 'nao_fechou', 'cancelado',
]);

// Colunas GERADAS pelo banco: nunca podem ser enviadas em INSERT/UPDATE.
// agendamentos.inicio_em = (data + hora) AT TIME ZONE 'America/Sao_Paulo'
// clientes.telefone_e164 = normalização do telefone
const COLUNAS_GERADAS = new Set(['inicio_em', 'telefone_e164']);

// ============================================================================
// Conversores
// ============================================================================

export const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

/**
 * Reproduz em JS a função normalizar_telefone() do Postgres, que alimenta a coluna
 * GERADA clientes.telefone_e164. Apesar do nome, o formato canônico NÃO tem '+55':
 * são só os dígitos nacionais (DDD + número). Números com DDI 55 têm o prefixo
 * REMOVIDO. É por essa coluna que se procura um cliente já cadastrado — o CRM grava
 * o telefone com máscara ('(12) 99141-5355') e a agenda grava só dígitos.
 */
export function telefoneNacional(t) {
  const d = soDigitos(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d.slice(2);
  return d || null;
}

/**
 * Converte para booleano do Postgres tratando o que vem do formulário.
 * Corrige um bug antigo: `body.ativo ? 1 : 0` considerava a STRING '0' verdadeira.
 */
export function paraBool(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'nao' || s === 'não') return false;
  return true;
}

/** Booleano de 3 estados (compareceu): mantém null como null. */
export function paraBoolOuNulo(v) {
  if (v === null || v === undefined || v === '') return null;
  return paraBool(v);
}

/** Postgres -> tela: true/false vira 1/0 (app.js compara com === 1 e === 0). */
const bit = (v) => (v ? 1 : 0);
/** Postgres -> tela preservando o null (compareceu indefinido). */
const bitOuNulo = (v) => (v === null || v === undefined ? null : (v ? 1 : 0));

/** '09:00:00' -> '09:00' (a tela e o link do Google Agenda esperam HH:MM). */
export const horaCurta = (h) => (h ? String(h).slice(0, 5) : h ?? null);

/** Normaliza qualquer entrada de hora para 'HH:MM:SS'. Devolve null se não der. */
export function horaBanco(h) {
  if (h === null || h === undefined) return null;
  const t = String(h).trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\s*[:hH]?\s*(\d{1,2})?\s*:?\s*(\d{1,2})?/);
  if (!m) return null;
  const hh = Number(m[1]), mi = Number(m[2] ?? 0), ss = Number(m[3] ?? 0);
  if (!Number.isFinite(hh) || hh > 23 || mi > 59 || ss > 59) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mi)}:${p(ss)}`;
}

/** Normaliza data para 'YYYY-MM-DD' (aceita DD/MM/AAAA). Devolve null se não der. */
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
  return null;
}

// ---- enum canal_origem -------------------------------------------------------
// O banco só aceita: meta, google, indicacao, organico, whatsapp, passagem, telefone.
// A tela (public/app.js) usa os rótulos antigos — por isso o mapa vai nos DOIS sentidos.
const ORIGEM_PARA_BANCO = new Map(Object.entries({
  google: 'google', 'indicação': 'indicacao', indicacao: 'indicacao',
  instagram: 'meta', facebook: 'meta', meta: 'meta',
  whatsapp: 'whatsapp', 'whats app': 'whatsapp',
  passagem: 'passagem', telefone: 'telefone',
  'orgânico': 'organico', organico: 'organico',
}));

const ORIGEM_PARA_TELA = {
  google: 'Google', indicacao: 'Indicação',
  // 'Instagram' (e não 'Meta') porque é uma das opções do <select> da tela;
  // assim o valor volta selecionado. Facebook e Instagram compartilham o enum 'meta'.
  meta: 'Instagram',
  whatsapp: 'WhatsApp', passagem: 'Passagem',
  telefone: 'Telefone', organico: 'Orgânico',
};

export function origemBanco(v) {
  const chave = String(v ?? '').trim().toLowerCase();
  return ORIGEM_PARA_BANCO.get(chave) || 'organico';
}

export function origemTela(v) {
  return ORIGEM_PARA_TELA[String(v ?? '').trim().toLowerCase()] || 'Orgânico';
}

/** Data de hoje no fuso da oficina (America/Sao_Paulo), não em UTC. */
export function hoje() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());
/** Só devolve o uuid se for válido — evita mandar '' ou NaN para uma coluna uuid. */
const uuidOuNulo = (v) => (ehUuid(v) ? String(v).trim() : null);

/** Remove colunas geradas e chaves achatadas antes de gravar. */
function limparParaGravar(obj) {
  const saida = {};
  for (const [k, v] of Object.entries(obj)) {
    if (COLUNAS_GERADAS.has(k)) continue;
    if (v === undefined) continue;
    saida[k] = v;
  }
  return saida;
}

/** Escapa o termo de busca para uso dentro de or=(...) do PostgREST. */
function termoBusca(q) {
  const limpo = String(q ?? '').replace(/["\\]/g, ' ').trim();
  return `"*${limpo}*"`;
}

// ============================================================================
// Mapeamentos de leitura (banco -> formato que a tela já consome)
// ============================================================================

function lerAgendamento(r) {
  if (!r) return null;
  const { consultores, servicos, ...resto } = r;
  return {
    ...resto,
    hora: horaCurta(r.hora),
    confirmado: bit(r.confirmado),
    compareceu: bitOuNulo(r.compareceu),
    lembrete_enviado: bit(r.lembrete_enviado),
    origem: origemTela(r.origem),
    valor: r.valor === null || r.valor === undefined ? 0 : Number(r.valor),
    consultor_nome: consultores?.nome ?? null,
    consultor_cor: consultores?.cor ?? null,
  };
}

function lerCliente(r) {
  if (!r) return null;
  return {
    id: r.id,
    nome: r.nome,
    telefone: r.telefone,
    // clientes.veiculo/modelo não existem no Supabase: viraram carro_modelo/carro_ano
    veiculo: r.carro_modelo ?? null,
    modelo: r.carro_ano ?? null,
    placa: r.placa ?? null,
    email: r.email ?? null,
    origem: origemTela(r.origem),
    observacoes: r.observacoes ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

const lerConsultor = (r) => (r ? { ...r, ativo: bit(r.ativo) } : null);
const lerServico = (r) => (r ? { ...r, ativo: bit(r.ativo), preco: Number(r.preco ?? 0), duracao_min: Number(r.duracao_min ?? 60) } : null);
const lerTemplate = (r) => (r ? { ...r, ativo: bit(r.ativo) } : null);

// Seleções reutilizadas (JOIN achatado depois por lerAgendamento)
const SEL_AGENDAMENTO = 'select=*,consultores(nome,cor)';

// ============================================================================
// AGENDAMENTOS
// ============================================================================

export async function listarAgendamentos({ data, status, q } = {}) {
  const p = new URLSearchParams(SEL_AGENDAMENTO);
  if (data) p.set('data', `eq.${data}`);
  // status inválido viraria erro 22P02 no enum — melhor devolver lista vazia
  if (status) {
    if (!STATUS_VALIDOS.has(status)) return [];
    p.set('status', `eq.${status}`);
  }
  if (q) {
    const t = termoBusca(q);
    // LIKE do SQLite era case-insensitive; no Postgres precisa ser ilike
    p.set('or', `(cliente_nome.ilike.${t},placa.ilike.${t},veiculo.ilike.${t},telefone.ilike.${t})`);
  }
  p.set('order', 'data.desc,hora.asc');
  const linhas = await selecionarTudo(T.agendamentos, p);
  return linhas.map(lerAgendamento);
}

export async function obterAgendamento(id) {
  if (!ehUuid(id)) return null;
  const r = await selecionarUm(T.agendamentos, `${SEL_AGENDAMENTO}&id=eq.${id}`);
  return lerAgendamento(r);
}

/**
 * Dedupe: mesmo dia/hora e (mesmo telefone OU mesmo nome).
 *
 * A comparação de telefone é feita em JavaScript, e não com um filtro telefone=eq.X,
 * porque agendamentos.telefone está MISTO no banco compartilhado: o CRM grava com
 * máscara ('(12) 99688-1120') e a agenda grava só dígitos ('12996881120'). Um eq.
 * exato não casaria e o importador duplicaria os agendamentos a cada ciclo.
 * Buscar só por data+hora é barato (poucas linhas por horário).
 */
export async function agendamentoDuplicado(data, hora, telefone, nome) {
  const d = dataBanco(data), h = horaBanco(hora);
  if (!d || !h) return null;
  const tel = telefoneNacional(telefone);
  const alvoNome = nome ? String(nome).trim().toLowerCase() : null;
  if (!tel && !alvoNome) return null;

  const p = new URLSearchParams(SEL_AGENDAMENTO);
  p.set('data', `eq.${d}`);
  p.set('hora', `eq.${h}`);
  p.set('limit', '50');
  const candidatos = await selecionar(T.agendamentos, p);

  const achado = candidatos.find((r) => {
    if (tel && telefoneNacional(r.telefone) === tel) return true;
    if (alvoNome && String(r.cliente_nome || '').trim().toLowerCase() === alvoNome) return true;
    return false;
  });
  return lerAgendamento(achado);
}

/** Descobre o servico_id pelo nome (o catálogo é compartilhado com o CRM). */
async function servicoIdPorNome(nome) {
  const n = String(nome ?? '').trim();
  if (!n) return null;
  const p = new URLSearchParams('select=id');
  // Sem aspas: o PostgREST as trata como parte do texto procurado e nada casa.
  // URLSearchParams já escapa vírgula/espaço, que é o que poderia atrapalhar.
  p.set('nome', `ilike.${n.replace(/[%*]/g, ' ')}`);
  p.set('limit', '1');
  const r = await selecionarUm(T.servicos, p).catch(() => null);
  return r?.id ?? null;
}

export async function criarAgendamento(dados) {
  const data = dataBanco(dados.data);
  const hora = horaBanco(dados.hora);
  if (!data || !hora) throw new Error('Data ou hora em formato inválido.');

  const linha = limparParaGravar({
    cliente_id: uuidOuNulo(dados.cliente_id),
    consultor_id: uuidOuNulo(dados.consultor_id),
    servico_id: uuidOuNulo(dados.servico_id) ?? await servicoIdPorNome(dados.servico),
    cliente_nome: dados.cliente_nome,
    telefone: soDigitos(dados.telefone) || null,
    veiculo: dados.veiculo || null,
    placa: dados.placa || null,
    servico: dados.servico,
    data, hora,
    origem: origemBanco(dados.origem ?? 'Google'),
    status: STATUS_VALIDOS.has(dados.status) ? dados.status : 'aguardando',
    confirmado: paraBool(dados.confirmado),
    valor: Number(dados.valor ?? 0) || 0,
    observacoes: dados.observacoes || null,
  });
  const criado = await inserirUm(T.agendamentos, linha, SEL_AGENDAMENTO);
  return lerAgendamento(criado);
}

export async function atualizarAgendamento(id, dados) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.cliente_nome !== undefined) campos.cliente_nome = dados.cliente_nome;
  if (dados.telefone !== undefined) campos.telefone = soDigitos(dados.telefone) || null;
  if (dados.veiculo !== undefined) campos.veiculo = dados.veiculo || null;
  if (dados.placa !== undefined) campos.placa = dados.placa || null;
  if (dados.servico !== undefined) {
    campos.servico = dados.servico;
    // Só troca o vínculo se o nome realmente casar com o catálogo. Sobrescrever
    // com null apagaria a ligação de agendamentos criados pelo CRM, cujo texto
    // de serviço nem sempre existe aqui.
    const sid = await servicoIdPorNome(dados.servico);
    if (sid) campos.servico_id = sid;
  }
  if (dados.data !== undefined) {
    const d = dataBanco(dados.data);
    if (!d) throw new Error('Data em formato inválido.');
    campos.data = d;
  }
  if (dados.hora !== undefined) {
    const h = horaBanco(dados.hora);
    if (!h) throw new Error('Hora em formato inválido.');
    campos.hora = h;
  }
  if (dados.consultor_id !== undefined) campos.consultor_id = uuidOuNulo(dados.consultor_id);
  if (dados.cliente_id !== undefined) campos.cliente_id = uuidOuNulo(dados.cliente_id);
  if (dados.origem !== undefined) campos.origem = origemBanco(dados.origem);
  if (dados.status !== undefined && STATUS_VALIDOS.has(dados.status)) campos.status = dados.status;
  if (dados.confirmado !== undefined) campos.confirmado = paraBool(dados.confirmado);
  if (dados.compareceu !== undefined) campos.compareceu = paraBoolOuNulo(dados.compareceu);
  // valor é NOT NULL no Postgres: null viraria erro 23502
  if (dados.valor !== undefined) campos.valor = Number(dados.valor ?? 0) || 0;
  if (dados.observacoes !== undefined) campos.observacoes = dados.observacoes || null;

  const r = await atualizarUm(T.agendamentos, `id=eq.${id}&${SEL_AGENDAMENTO}`, limparParaGravar(campos));
  return lerAgendamento(r);
}

export async function removerAgendamento(id) {
  if (!ehUuid(id)) return false;
  const apagados = await remover(T.agendamentos, `id=eq.${id}`);
  return apagados.length > 0;
}

export async function listarFollowup() {
  const p = new URLSearchParams('select=*,consultores(nome,cor)');
  p.set('or', '(status.in.(nao_veio,nao_fechou),compareceu.is.false)');
  p.set('order', 'data.desc');
  const linhas = await selecionarTudo(T.agendamentos, p);
  return linhas.map(lerAgendamento);
}

export async function listarHistorico(limite = 200) {
  const p = new URLSearchParams('select=*,consultores(nome,cor)');
  p.set('order', 'data.desc,hora.desc');
  p.set('limit', String(limite));
  const linhas = await selecionar(T.agendamentos, p);
  return linhas.map(lerAgendamento);
}

/** Todos os agendamentos (ICS, CSV e espelho) — paginado para não vir truncado. */
export async function listarTodosAgendamentos(consulta) {
  const p = new URLSearchParams(consulta || 'select=*,consultores(nome,cor)');
  if (!p.has('order')) p.set('order', 'data.asc,hora.asc');
  const linhas = await selecionarTudo(T.agendamentos, p);
  return linhas.map(lerAgendamento);
}

/** Agendamentos do feed ICS: exclui não-fechou e cancelado. */
export async function agendamentosParaICS(limite = 500) {
  const p = new URLSearchParams('select=*,consultores(nome,cor)');
  p.set('status', 'not.in.(nao_fechou,cancelado)');
  // Só do mês passado para frente: a tabela agora é compartilhada com o CRM e,
  // ordenando por data.asc com teto de 500, o histórico antigo empurraria os
  // horários FUTUROS para fora do calendário — justo os que interessam.
  const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  p.set('data', `gte.${desde}`);
  p.set('order', 'data.asc,hora.asc');
  p.set('limit', String(limite));
  const linhas = await selecionar(T.agendamentos, p);
  return linhas.map(lerAgendamento);
}

/**
 * Agendamentos que precisam de lembrete.
 * A consulta antiga usava datetime(data || ' ' || hora) do SQLite. Aqui usamos a
 * coluna gerada inicio_em (timestamptz, já no fuso America/Sao_Paulo), comparada
 * com instantes reais — sem risco de erro de fuso.
 */
export async function agendamentosParaLembrete(horas = 24) {
  const agora = new Date();
  const limite = new Date(agora.getTime() + horas * 3600 * 1000);
  const p = new URLSearchParams('select=*');
  p.set('lembrete_enviado', 'is.false');
  p.set('status', 'in.(aguardando,confirmado)');
  p.set('telefone', 'not.is.null');
  p.set('inicio_em', `gt.${agora.toISOString()}`);
  p.append('inicio_em', `lte.${limite.toISOString()}`);
  p.set('order', 'inicio_em.asc');
  p.set('limit', '200');
  const linhas = await selecionar(T.agendamentos, p);
  // telefone vazio ('') não é pego por not.is.null — filtramos aqui
  return linhas.map(lerAgendamento).filter((a) => soDigitos(a.telefone));
}

export async function marcarLembreteEnviado(id) {
  if (!ehUuid(id)) return false;
  const r = await atualizarUm(T.agendamentos, `id=eq.${id}`, { lembrete_enviado: true });
  return !!r;
}

// ============================================================================
// CLIENTES
// ============================================================================

export async function listarClientes(q) {
  const p = new URLSearchParams('select=*');
  if (q) {
    const t = termoBusca(q);
    // telefone_e164 entra na busca para achar o cliente digitando só os números,
    // mesmo quando o CRM gravou o telefone com máscara
    p.set('or', `(nome.ilike.${t},telefone.ilike.${t},telefone_e164.ilike.${t},placa.ilike.${t})`);
  }
  p.set('order', 'nome.asc');
  const linhas = await selecionarTudo(T.clientes, p);
  return linhas.map(lerCliente);
}

export async function obterCliente(id) {
  if (!ehUuid(id)) return null;
  return lerCliente(await selecionarUm(T.clientes, `select=*&id=eq.${id}`));
}

function clienteParaBanco(dados) {
  const campos = {};
  if (dados.nome !== undefined) campos.nome = dados.nome;
  if (dados.telefone !== undefined) campos.telefone = soDigitos(dados.telefone) || null;
  if (dados.veiculo !== undefined) campos.carro_modelo = dados.veiculo || null;
  // carro_ano é compartilhada com o CRM e o Atendimento, que a exibem como ANO.
  // Só grava se for mesmo um ano — texto livre ali corromperia a ficha do cliente.
  if (dados.modelo !== undefined) {
    const ano = String(dados.modelo || '').match(/\b(19|20)\d{2}\b/);
    campos.carro_ano = ano ? ano[0] : null;
  }
  if (dados.placa !== undefined) campos.placa = dados.placa || null;
  if (dados.email !== undefined) campos.email = dados.email || null;
  if (dados.origem !== undefined) campos.origem = origemBanco(dados.origem);
  if (dados.observacoes !== undefined) campos.observacoes = dados.observacoes || null;
  return limparParaGravar(campos);
}

export async function criarCliente(dados) {
  const linha = clienteParaBanco({ origem: 'Google', ...dados });
  return lerCliente(await inserirUm(T.clientes, linha, 'select=*'));
}

export async function atualizarCliente(id, dados) {
  if (!ehUuid(id)) return null;
  return lerCliente(await atualizarUm(T.clientes, `id=eq.${id}&select=*`, clienteParaBanco(dados)));
}

export async function removerCliente(id) {
  if (!ehUuid(id)) return false;
  const apagados = await remover(T.clientes, `id=eq.${id}`);
  return apagados.length > 0;
}

/**
 * Acha o cliente pelo telefone ou cria um novo. Devolve o id (uuid).
 * A busca usa telefone_e164 (coluna GERADA) além do telefone cru, porque o CRM e o
 * app de Atendimento podem ter gravado o número com máscara ou +55 — sem isso a
 * agenda criaria um cliente duplicado a cada agendamento.
 */
export async function obterOuCriarCliente({ nome, telefone, veiculo, placa, origem }) {
  const tel = soDigitos(telefone);
  if (!tel) return null;
  const nacional = telefoneNacional(tel);
  const p = new URLSearchParams('select=id');
  // busca pela coluna GERADA telefone_e164: é a única forma de casar com o que o CRM
  // gravou com máscara — '(12) 99141-5355' e '12991415355' normalizam para o mesmo valor
  p.set('telefone_e164', `eq.${nacional}`);
  p.set('limit', '1');
  const existente = await selecionarUm(T.clientes, p);
  if (existente) return existente.id;

  const criado = await inserirUm(T.clientes, clienteParaBanco({
    nome, telefone: tel, veiculo: veiculo || null, placa: placa || null,
    origem: origem ?? 'Google',
  }), 'select=id');
  return criado?.id ?? null;
}

// ============================================================================
// CONSULTORES
// ============================================================================

export async function listarConsultores() {
  const linhas = await selecionarTudo(T.consultores, 'select=*&order=ativo.desc,nome.asc');
  return linhas.map(lerConsultor);
}

export async function criarConsultor(dados) {
  const linha = limparParaGravar({
    nome: dados.nome,
    telefone: soDigitos(dados.telefone) || null,
    cor: dados.cor || '#e6192e',
    ativo: dados.ativo === undefined ? true : paraBool(dados.ativo),
  });
  return lerConsultor(await inserirUm(T.consultores, linha, 'select=*'));
}

export async function atualizarConsultor(id, dados) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.nome !== undefined) campos.nome = dados.nome;
  if (dados.telefone !== undefined) campos.telefone = soDigitos(dados.telefone) || null;
  if (dados.cor !== undefined) campos.cor = dados.cor || '#e6192e';
  if (dados.ativo !== undefined) campos.ativo = paraBool(dados.ativo);
  return lerConsultor(await atualizarUm(T.consultores, `id=eq.${id}&select=*`, limparParaGravar(campos)));
}

export async function removerConsultor(id) {
  if (!ehUuid(id)) return false;
  const apagados = await remover(T.consultores, `id=eq.${id}`);
  return apagados.length > 0;
}

// ============================================================================
// SERVIÇOS (Arsenal)
// ============================================================================

export async function listarServicos(todos = false) {
  const p = new URLSearchParams('select=*');
  if (!todos) p.set('ativo', 'is.true');
  p.set('order', 'nome.asc');
  const linhas = await selecionarTudo(T.servicos, p);
  return linhas.map(lerServico);
}

export async function criarServico(dados) {
  const linha = limparParaGravar({
    nome: dados.nome,
    descricao: dados.descricao || null,
    preco: Number(dados.preco ?? 0) || 0,
    duracao_min: Number(dados.duracao_min ?? 60) || 60,
    categoria: dados.categoria || null,
    ativo: dados.ativo === undefined ? true : paraBool(dados.ativo),
  });
  return lerServico(await inserirUm(T.servicos, linha, 'select=*'));
}

export async function atualizarServico(id, dados) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.nome !== undefined) campos.nome = dados.nome;
  if (dados.descricao !== undefined) campos.descricao = dados.descricao || null;
  if (dados.preco !== undefined) campos.preco = Number(dados.preco ?? 0) || 0;
  if (dados.duracao_min !== undefined) campos.duracao_min = Number(dados.duracao_min ?? 60) || 60;
  if (dados.categoria !== undefined) campos.categoria = dados.categoria || null;
  if (dados.ativo !== undefined) campos.ativo = paraBool(dados.ativo);
  return lerServico(await atualizarUm(T.servicos, `id=eq.${id}&select=*`, limparParaGravar(campos)));
}

export async function removerServico(id) {
  if (!ehUuid(id)) return false;
  const apagados = await remover(T.servicos, `id=eq.${id}`);
  return apagados.length > 0;
}

// ============================================================================
// CONFIGURAÇÕES (linha única, id boolean true)
// ============================================================================

async function lerLinhaUnica(tabela) {
  return (await selecionarUm(tabela, `select=*&${LINHA_UNICA}`)) || {};
}

async function gravarLinhaUnica(tabela, campos) {
  const limpos = limparParaGravar({ ...campos, updated_at: new Date().toISOString() });
  const r = await atualizarUm(tabela, LINHA_UNICA, limpos);
  // Se a linha única ainda não existir, cria (id=true) em vez de falhar em silêncio.
  if (!r) return (await inserirUm(tabela, { id: true, ...limpos }, 'select=*')) || {};
  return r;
}

export async function obterEmpresa() {
  const e = await lerLinhaUnica(T.empresa);
  // GET /api/empresa não pode devolver undefined: a tela quebra no JSON.parse
  return { id: 1, nome: '', endereco: '', slogan: '', telefone: '', ...e };
}

export async function salvarEmpresa(dados) {
  await gravarLinhaUnica(T.empresa, {
    nome: dados.nome, endereco: dados.endereco,
    slogan: dados.slogan, telefone: dados.telefone,
  });
  return obterEmpresa();
}

// ============================================================================
// PERFIL DE QUEM ESTÁ LOGADO (tabela compartilhada `perfis`)
// O id vem SEMPRE do token conferido no servidor, nunca do corpo da requisição:
// assim ninguém consegue ler nem renomear o perfil de outra pessoa.
// ============================================================================

export async function obterPerfil(id, emailDoLogin = '') {
  const p = await selecionarUm(
    T.perfis, `select=id,nome,email,papel,ativo&id=eq.${encodeURIComponent(id)}`);
  return {
    id,
    nome: p?.nome ?? '',
    // o e-mail do Auth é a fonte da verdade quando o perfil ainda não tem um
    email: p?.email || emailDoLogin || '',
    papel: p?.papel ?? '',
    ativo: bit(p?.ativo ?? true),
  };
}

/** Troca só o nome — papel, e-mail e situação continuam com o administrador. */
export async function atualizarPerfilNome(id, nome, emailDoLogin = '') {
  await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`, {
    nome, updated_at: new Date().toISOString(),
  });
  return obterPerfil(id, emailDoLogin);
}

// ============================================================================
// JANELAS DE AGENDAMENTO (o que a IA do WhatsApp usa para oferecer horário)
// e CATÁLOGO DE SERVIÇOS — somente leitura aqui; quem edita é o CRM.
// ============================================================================

export async function listarJanelas() {
  const linhas = await selecionar(T.janelas,
    'select=id,tipo_servico,dias,inicio,fim,observacao&order=tipo_servico.asc,dias.asc,inicio.asc');
  // 'time' volta como '08:00:00'; a tela mostra HH:MM, igual ao resto do app.
  return linhas.map((j) => ({ ...j, inicio: horaCurta(j.inicio), fim: horaCurta(j.fim) }));
}

export async function listarCatalogo() {
  // selecionarTudo: são 138 linhas hoje, mas o PostgREST corta a resposta em
  // silêncio se um dia passar do limite — paginar evita catálogo pela metade.
  const linhas = await selecionarTudo(T.catalogo,
    'select=id,categoria,servico,escopo,fazemos,tipo_veiculo,observacao&order=categoria.asc,servico.asc');
  return linhas.map((s) => ({ ...s, fazemos: bit(s.fazemos) }));
}

export async function obterWaConfig() {
  const c = await lerLinhaUnica(T.waConfig);
  return {
    ...c,
    ativo: bit(c.ativo),
    lembrete_ativo: bit(c.lembrete_ativo),
    lembrete_horas: Number(c.lembrete_horas ?? 24),
    verify_token: c.verify_token ?? 'indycar',
    api_version: c.api_version ?? 'v21.0',
  };
}

export async function salvarWaConfig(dados) {
  await gravarLinhaUnica(T.waConfig, {
    ativo: paraBool(dados.ativo),
    phone_number_id: dados.phone_number_id ?? null,
    access_token: dados.access_token ?? null,
    business_account_id: dados.business_account_id ?? null,
    verify_token: dados.verify_token || 'indycar',
    api_version: dados.api_version || 'v21.0',
    numero_exibicao: dados.numero_exibicao ?? null,
    lembrete_ativo: paraBool(dados.lembrete_ativo),
    lembrete_horas: Number(dados.lembrete_horas) || 24,
  });
  return obterWaConfig();
}

export async function obterIaConfig() {
  const c = await lerLinhaUnica(T.iaConfig);
  return { ...c, ativo: bit(c.ativo) };
}

export async function salvarIaConfig(dados) {
  await gravarLinhaUnica(T.iaConfig, {
    ativo: paraBool(dados.ativo),
    motor: dados.motor ?? 'anthropic',
    api_key: dados.api_key ?? null,
    modelo: dados.modelo ?? 'claude-opus-4-8',
    persona: dados.persona ?? null,
    saudacao: dados.saudacao ?? null,
    cw_api_key: dados.cw_api_key ?? null,
    cw_service_id: dados.cw_service_id ?? null,
    cw_db_service_id: dados.cw_db_service_id ?? null,
    cw_noshow_service_id: dados.cw_noshow_service_id ?? null,
    cw_connect_service_id: dados.cw_connect_service_id ?? null,
    cw_device_id: dados.cw_device_id ?? null,
    cw_base_url: dados.cw_base_url ?? 'https://runtime.codewords.ai',
  });
  return obterIaConfig();
}

/** Grava um campo isolado da config de IA (usado pelo fluxo de QR Code). */
export async function salvarCampoIa(coluna, valor) {
  const permitidas = new Set([
    'api_key', 'cw_api_key', 'cw_service_id', 'cw_db_service_id',
    'cw_noshow_service_id', 'cw_connect_service_id', 'cw_device_id', 'cw_base_url',
  ]);
  if (!permitidas.has(coluna)) throw new Error(`Campo de configuração inválido: ${coluna}`);
  await gravarLinhaUnica(T.iaConfig, { [coluna]: valor });
  return true;
}

export async function obterIntegracoes() {
  const c = await lerLinhaUnica(T.integracoes);
  return { ...c, webhook_ativo: bit(c.webhook_ativo), webhook_url: c.webhook_url ?? '' };
}

export async function salvarIntegracoes(dados) {
  const atual = await obterIntegracoes();
  await gravarLinhaUnica(T.integracoes, {
    webhook_url: dados.webhook_url !== undefined ? dados.webhook_url : atual.webhook_url,
    webhook_ativo: dados.webhook_ativo !== undefined ? paraBool(dados.webhook_ativo) : paraBool(atual.webhook_ativo),
  });
  return obterIntegracoes();
}

/**
 * Gera o token do feed ICS só se ainda NÃO houver um.
 * Regenerar o token quebraria o calendário já assinado no Google Agenda do dono.
 */
export async function garantirIcsToken() {
  const c = await obterIntegracoes();
  if (c.ics_token) return c.ics_token;
  const token = (process.env.ICS_TOKEN || '') || randomBytes(16).toString('hex');
  await gravarLinhaUnica(T.integracoes, { ics_token: token });
  return token;
}

/**
 * Preenche a config de IA a partir de variáveis de ambiente (deploy no Render).
 * Só preenche o que ainda está vazio — nunca sobrescreve o que foi salvo na tela.
 */
export async function aplicarConfigDoAmbiente() {
  const mapa = {
    api_key: 'ANTHROPIC_API_KEY',
    cw_api_key: 'CW_API_KEY',
    cw_service_id: 'CW_SERVICE_ID',
    cw_db_service_id: 'CW_DB_SERVICE_ID',
    cw_noshow_service_id: 'CW_NOSHOW_SERVICE_ID',
    cw_connect_service_id: 'CW_CONNECT_SERVICE_ID',
    cw_device_id: 'CW_DEVICE_ID',
  };
  const atual = await obterIaConfig();
  const novos = {};
  for (const [coluna, env] of Object.entries(mapa)) {
    if (process.env[env] && !atual[coluna]) novos[coluna] = process.env[env];
  }
  if (Object.keys(novos).length) await gravarLinhaUnica(T.iaConfig, novos);
  return Object.keys(novos);
}

// ============================================================================
// TEMPLATES DE WHATSAPP (agenda_templates)
// ============================================================================

export async function listarTemplates() {
  // ORDER BY id não serve mais: o id virou uuid aleatório e embaralharia a lista
  const linhas = await selecionar(T.templates, 'select=*&order=created_at.asc&limit=200');
  return linhas.map(lerTemplate);
}

export async function obterTemplate(id) {
  if (!ehUuid(id)) return null;
  return lerTemplate(await selecionarUm(T.templates, `select=*&id=eq.${id}`));
}

export async function templatePorGatilho(gatilho) {
  const p = new URLSearchParams('select=*');
  p.set('gatilho', `eq.${gatilho}`);
  p.set('ativo', 'is.true');
  p.set('limit', '1');
  return lerTemplate(await selecionarUm(T.templates, p));
}

export async function criarTemplate(dados) {
  const linha = limparParaGravar({
    nome: dados.nome,
    gatilho: dados.gatilho ?? 'manual',
    corpo: dados.corpo,
    ativo: dados.ativo === undefined ? true : paraBool(dados.ativo),
  });
  return lerTemplate(await inserirUm(T.templates, linha, 'select=*'));
}

export async function atualizarTemplate(id, dados) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.nome !== undefined) campos.nome = dados.nome;
  if (dados.gatilho !== undefined) campos.gatilho = dados.gatilho;
  if (dados.corpo !== undefined) campos.corpo = dados.corpo;
  if (dados.ativo !== undefined) campos.ativo = paraBool(dados.ativo);
  return lerTemplate(await atualizarUm(T.templates, `id=eq.${id}&select=*`, limparParaGravar(campos)));
}

export async function removerTemplate(id) {
  if (!ehUuid(id)) return false;
  const apagados = await remover(T.templates, `id=eq.${id}`);
  return apagados.length > 0;
}

// ============================================================================
// MENSAGENS DE WHATSAPP (tabela COMPARTILHADA com o app de Atendimento)
// ============================================================================

/**
 * Grava uma mensagem no histórico.
 * ATENÇÃO: whatsapp_mensagens.template_id é FK para a tabela whatsapp_templates
 * (do app de Atendimento), NÃO para agenda_templates. Gravar o id de um template
 * da agenda ali violaria a chave estrangeira (23503) — por isso não é enviado.
 */
export async function registrarMensagem({
  agendamento_id = null, cliente_id = null, telefone, nome = null,
  corpo, direcao = 'saida', status = 'pendente', wamid = null, erro = null,
}) {
  const linha = limparParaGravar({
    agendamento_id: uuidOuNulo(agendamento_id),
    cliente_id: uuidOuNulo(cliente_id),
    telefone: soDigitos(telefone),
    nome, corpo, direcao, status, wamid, erro,
  });
  return inserirUm(T.mensagens, linha, 'select=*');
}

export async function listarMensagens({ agendamento_id } = {}) {
  const p = new URLSearchParams('select=*');
  if (agendamento_id) {
    if (!ehUuid(agendamento_id)) return [];
    p.set('agendamento_id', `eq.${agendamento_id}`);
    p.set('order', 'created_at.asc');
    p.set('limit', '500');
  } else {
    // ORDER BY id perdeu o sentido cronológico com uuid
    p.set('order', 'created_at.desc');
    p.set('limit', '100');
  }
  return selecionar(T.mensagens, p);
}

export async function atualizarStatusMensagem(id, status) {
  if (!ehUuid(id)) return false;
  const r = await atualizarUm(T.mensagens, `id=eq.${id}`, { status });
  return !!r;
}

/** Recibo de entrega/leitura da Meta: casa pelo wamid (único por mensagem). */
export async function atualizarStatusPorWamid(wamid, status) {
  if (!wamid) return false;
  const filtro = new URLSearchParams();
  filtro.set('wamid', `eq.${wamid}`);
  const alteradas = await atualizar(T.mensagens, filtro, { status });
  return alteradas.length > 0;
}

// ============================================================================
// MÉTRICAS
// ============================================================================

/**
 * Painel. Os 6 cards do dia são calculados a partir da MESMA lista da agenda de
 * hoje (1 requisição em vez de 6 COUNT), o que também garante que os números e a
 * timeline nunca fiquem inconsistentes entre si.
 */
export async function estatisticas() {
  const d = hoje();

  const [agendaHoje, ultimosBrutos, totalClientes, totalConsult] = await Promise.all([
    listarAgendamentos({ data: d }).then((l) => l.slice().sort((a, b) => String(a.hora).localeCompare(String(b.hora)))),
    selecionar(T.agendamentos, `${SEL_AGENDAMENTO}&order=created_at.desc&limit=8`),
    contar(T.clientes),
    contar(T.consultores, 'ativo=is.true'),
  ]);

  const emAberto = new Set(['aguardando', 'confirmado', 'em_atendimento']);
  const cards = {
    totalHoje: agendaHoje.length,
    concluidosHoje: agendaHoje.filter((a) => a.status === 'concluido').length,
    compareceram: agendaHoje.filter((a) => a.compareceu === 1).length,
    naoVieram: agendaHoje.filter((a) => a.compareceu === 0).length,
    naoFechou: agendaHoje.filter((a) => a.status === 'nao_fechou').length,
    aguardando: agendaHoje.filter((a) => a.compareceu === null && emAberto.has(a.status)).length,
    totalClientes,
    totalConsult,
  };

  return { cards, agendaHoje, ultimos: ultimosBrutos.map(lerAgendamento), data: d };
}

/**
 * Aba CRM. GROUP BY / SUM(CASE WHEN) não existem no PostgREST: as agregações são
 * feitas em JavaScript sobre as linhas cruas.
 */
export async function metricasCrm() {
  const [linhas, consultores] = await Promise.all([
    // ordem fixa: LIMIT/OFFSET sem ORDER BY no Postgres pode repetir e pular
    // linhas entre páginas, e as métricas sairiam erradas sem nenhum erro
    selecionarTudo(T.agendamentos, 'select=origem,status,compareceu,consultor_id&order=id.asc'),
    listarConsultores(),
  ]);

  const total = linhas.length;
  const compareceram = linhas.filter((a) => a.compareceu === true).length;
  const naoVieram = linhas.filter((a) => a.compareceu === false).length;
  const concluidos = linhas.filter((a) => a.status === 'concluido').length;

  const contagemOrigem = new Map();
  for (const a of linhas) {
    const rotulo = origemTela(a.origem);
    contagemOrigem.set(rotulo, (contagemOrigem.get(rotulo) || 0) + 1);
  }
  const porOrigem = [...contagemOrigem.entries()]
    .map(([origem, total]) => ({ origem, total }))
    .sort((x, y) => y.total - x.total);

  // LEFT JOIN: todo consultor aparece, mesmo com zero agendamentos
  const porConsultor = consultores.map((c) => {
    const meus = linhas.filter((a) => a.consultor_id === c.id);
    return {
      nome: c.nome,
      total: meus.length,
      concluidos: meus.filter((a) => a.status === 'concluido').length,
    };
  }).sort((x, y) => y.total - x.total);

  return {
    total, compareceram, naoVieram, concluidos,
    taxaComparecimento: total ? Math.round((compareceram / total) * 100) : 0,
    taxaConversao: compareceram ? Math.round((concluidos / compareceram) * 100) : 0,
    porOrigem, porConsultor,
  };
}

/** Tabela nome -> duração e id -> duração, usada para calcular o fim do evento no ICS. */
export async function duracoesDeServicos() {
  const linhas = await selecionarTudo(T.servicos, 'select=id,nome,duracao_min');
  const porNome = new Map(), porId = new Map();
  for (const s of linhas) {
    porNome.set(String(s.nome).trim().toLowerCase(), Number(s.duracao_min) || 60);
    porId.set(s.id, Number(s.duracao_min) || 60);
  }
  return { porNome, porId };
}
