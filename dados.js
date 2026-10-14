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
  inserirUm, atualizar, atualizarUm, remover, contar, criarUsuarioAuth, rpc, trocarSenhaAuth,
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
  // Tabelas compartilhadas com o CRM e o Atendimento. A Agenda só LÊ janelas e
  // catálogo; em `perfis` ela também escreve — cada pessoa muda o próprio nome
  // e o administrador cuida da equipe (Configurações › Equipe). O que se faz
  // aqui vale nos três sistemas: é o mesmo login.
  perfis: 'perfis',
  janelas: 'janelas_agendamento',
  catalogo: 'catalogo_servicos',
  // Do Atendimento: as conversas do WhatsApp (nome + telefone de quem já falou
  // com a oficina). A Agenda só LÊ, para achar o telefone pelo nome.
  conversas: 'conversas',
  // Do Comunicar (ex-Pós-venda): a Agenda só LÊ — quem grava é ele.
  envios: 'posvenda_envios',
  respostas: 'posvenda_respostas',
  regrasRetorno: 'comunicar_regras_retorno',
  // Do vigia: linha única (id=true) com o problema atual do sistema, se houver.
  vigia: 'vigia_estado',
};

/* ---------------------------------------------------------------------------
   Sonda de capacidade do banco.
   A migração comunicar_v1 chega por partes (o banco é do coordenador): uma
   coluna que ainda não existe derruba o PATCH inteiro com 400 do PostgREST. Em
   vez de supor, a Agenda PERGUNTA uma vez (select=coluna&limit=0) e guarda a
   resposta: "sim" vale para sempre, "ainda não" é reconferido em 5 minutos.
   --------------------------------------------------------------------------- */
const _capacidade = new Map(); // chave -> { tem, ate }
async function temColuna(tabela, coluna) {
  const chave = `${tabela}.${coluna}`;
  const memo = _capacidade.get(chave);
  if (memo && (memo.tem || memo.ate > Date.now())) return memo.tem;
  let tem = false;
  try { await selecionar(tabela, `select=${coluna}&limit=0`); tem = true; }
  catch { tem = false; }
  _capacidade.set(chave, { tem, ate: Date.now() + 5 * 60 * 1000 });
  return tem;
}

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

/* ---- aniversário (clientes.nascimento) --------------------------------------
   Combinado do ecossistema: o ano 1904 quer dizer "só sei dia e mês" (é
   bissexto, então 29/02 cabe). A tela aceita DD/MM ou DD/MM/AAAA.
   Devolve: 'YYYY-MM-DD' | null (vazio = limpar) | undefined (não entendi). */
export const ANO_SEM_ANO = 1904;
export function nascimentoBanco(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t) return null;
  const p = (n) => String(n).padStart(2, '0');
  let dia, mes, ano;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) { ano = +m[1]; mes = +m[2]; dia = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2}|\d{4}))?$/))) {
    dia = +m[1]; mes = +m[2];
    ano = m[3] === undefined ? ANO_SEM_ANO : (m[3].length === 2 ? 1900 + +m[3] + (+m[3] <= 30 ? 100 : 0) : +m[3]);
  } else return undefined;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return undefined;
  // dia que não existe no mês (31/02): new Date "vira" o mês — detecta e recusa
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return undefined;
  if (ano !== ANO_SEM_ANO && (ano < 1900 || ano > new Date().getUTCFullYear())) return undefined;
  return `${ano}-${p(mes)}-${p(dia)}`;
}

/** 'YYYY-MM-DD' -> 'DD/MM' (ano 1904) ou 'DD/MM/AAAA'. */
export function nascimentoTela(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return +m[1] === ANO_SEM_ANO ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/** Soma meses a uma data ISO sem depender do fuso (meio-dia UTC). 31/01 + 1 → 28/02. */
export function somarMeses(iso, meses) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const alvoMes = +m[2] - 1 + Number(meses || 0);
  const d = new Date(Date.UTC(+m[1], alvoMes, 1, 12));
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(+m[3], ultimo));
  return d.toISOString().slice(0, 10);
}

/* Regras de retorno do Comunicar: cada uma tem um rótulo, palavras que casam
   com o nome do serviço e um prazo em meses. Função pura — testável.
   Sem regra que case (ou sem tabela ainda), vale a revisão geral de 6 meses. */
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const PRAZO_PADRAO = { meses: 6, rotulo: 'Revisão geral' };
export function prazoDeRetorno(servico, regras) {
  const alvo = semAcento(servico);
  if (!alvo) return PRAZO_PADRAO;
  for (const r of Array.isArray(regras) ? regras : []) {
    if (r?.ativo === false) continue;
    const palavras = Array.isArray(r?.palavras) ? r.palavras : String(r?.palavras ?? '').split(/[,;]/);
    if (palavras.some((p) => semAcento(p) && alvo.includes(semAcento(p)))) {
      return { meses: Number(r.meses) || PRAZO_PADRAO.meses, rotulo: r.rotulo || PRAZO_PADRAO.rotulo };
    }
  }
  return PRAZO_PADRAO;
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

/* ---------------------------------------------------------------------------
   BUSCA SEM ACENTO (sem a extensão unaccent no banco — nada de DDL).
   O ilike do Postgres diferencia "oleo" de "Óleo". Então a busca vai em duas
   formas: a digitada e uma "larga", sem acento e com o curinga _ (um caractere
   qualquer) no lugar de cada vogal e do ç — "oleo" vira *_l__*, que casa
   "Óleo", "óleo", "Oleo"… A forma larga pega a mais; o JS (casaBusca) confere
   sem acento e joga fora o que não é. Funções puras, testadas.
   --------------------------------------------------------------------------- */
export function padraoSemAcento(q) {
  const base = semAcento(q).replace(/[%*"\\(),:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (base.length < 2) return null;
  const largo = base.replace(/[aeiouc]/g, '_');
  // só curinga (ex.: "ao") pegaria a tabela inteira: aí fica só a forma digitada
  if (!/[^_ ]/.test(largo)) return null;
  return `"*${largo}*"`;
}
/** Filtros or=(...) de busca: cada coluna na forma digitada e na forma sem acento. */
export function filtrosDeBusca(q, colunas) {
  const t = termoBusca(q), largo = padraoSemAcento(q);
  const f = [];
  for (const c of colunas) {
    f.push(`${c}.ilike.${t}`);
    if (largo && largo !== t) f.push(`${c}.ilike.${largo}`);
  }
  return f;
}
/** Confere em JS, sem acento e sem maiúscula. Telefone casa pelos dígitos (com ou sem máscara/55). */
export function casaBusca(valores, q, telefone = null) {
  const alvo = semAcento(q);
  if (!alvo) return true;
  if (valores.some((v) => semAcento(v).includes(alvo))) return true;
  const dig = soDigitos(q);
  if (dig.length >= 4 && telefone) {
    const tel = soDigitos(telefone);
    const nac = telefoneNacional(dig) || dig;
    if (tel.includes(nac) || tel.includes(dig.slice(-8))) return true;
  }
  return false;
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
    // Comunicar: aniversário e a chave de mensagens automáticas. Enquanto a
    // coluna não existir no banco ela vem undefined — e o padrão é "aceita".
    nascimento: r.nascimento ? String(r.nascimento).slice(0, 10) : null,
    nascimento_tela: nascimentoTela(r.nascimento),
    aceita_mensagens: r.aceita_mensagens === undefined || r.aceita_mensagens === null ? 1 : bit(r.aceita_mensagens),
    aceita_mensagens_em: r.aceita_mensagens_em ?? null,
    aceita_mensagens_motivo: r.aceita_mensagens_motivo ?? null,
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

export async function listarAgendamentos({ data, status, q, de, ate, consultor_id } = {}) {
  const p = new URLSearchParams(SEL_AGENDAMENTO);
  if (data) p.set('data', `eq.${data}`);
  // intervalo (visão Semana/Mês): só o período pedido, não a tabela inteira
  else if (de || ate) {
    const d1 = dataBanco(de), d2 = dataBanco(ate);
    if (d1 && d2) p.set('and', `(data.gte.${d1},data.lte.${d2})`);
    else if (d1) p.set('data', `gte.${d1}`);
    else if (d2) p.set('data', `lte.${d2}`);
  }
  // status inválido viraria erro 22P02 no enum — melhor devolver lista vazia
  if (status) {
    if (!STATUS_VALIDOS.has(status)) return [];
    p.set('status', `eq.${status}`);
  }
  if (q) {
    // LIKE do SQLite era case-insensitive; no Postgres precisa ser ilike.
    // Sem acento: "oleo" acha "Óleo" — o ilike vai nas DUAS formas (a digitada e
    // uma com curinga no lugar de cada vogal/ç) e o JS confere de verdade depois.
    // Serviço também entra; e só os dígitos acham o telefone gravado com máscara pelo CRM.
    const filtros = filtrosDeBusca(q, ['cliente_nome', 'placa', 'veiculo', 'telefone', 'servico']);
    const padraoTel = padraoTelefone(q);
    if (padraoTel) filtros.push(`telefone.ilike.${padraoTel}`);
    p.set('or', `(${filtros.join(',')})`);
  }
  // "Minha agenda": só os horários de um consultor
  if (ehUuid(consultor_id)) p.set('consultor_id', `eq.${consultor_id}`);
  p.set('order', 'data.desc,hora.asc');
  let linhas = await selecionarTudo(T.agendamentos, p);
  if (q) linhas = linhas.filter((r) => casaBusca([r.cliente_nome, r.placa, r.veiculo, r.servico, r.telefone], q, r.telefone));
  // selo "lembrete enviado / respondeu" do Comunicar nos cartões pendentes
  return anexarLembretes(linhas.map(lerAgendamento));
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
  // carimbo do aviso de ausência (dedupe do "Não veio" — ver server.js)
  if (dados.no_show_notificado_em !== undefined) campos.no_show_notificado_em = dados.no_show_notificado_em;

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
  // O corte parte de hoje() no fuso da oficina (meio-dia evita virada de dia);
  // com toISOString direto, das 21h em diante o corte avançava um dia.
  const base = new Date(hoje() + 'T12:00:00');
  base.setDate(base.getDate() - 30);
  const desde = base.toISOString().slice(0, 10);
  p.set('data', `gte.${desde}`);
  p.set('order', 'data.asc,hora.asc');
  p.set('limit', String(limite));
  const linhas = await selecionar(T.agendamentos, p);
  return linhas.map(lerAgendamento);
}

/* Lembretes de agendamento: quem manda é o COMUNICAR (indycar-posvenda), com a
   régua dele e a resposta do cliente gravada em posvenda_envios. A Agenda só
   mostra o selinho no cartão. (agendamentosParaLembrete/marcarLembreteEnviado
   saíram daqui junto com o agendador do server.js.) */

/**
 * Para cada agendamento, o lembrete que o Comunicar mandou (se mandou) e o que
 * o cliente respondeu. Uma consulta barata por lote de ids; qualquer falha
 * devolve um mapa vazio — o selo é um extra, nunca pode derrubar a lista.
 * resposta_tipo ainda pode não existir no banco: se o PostgREST recusar,
 * repete só com status.
 */
export async function lembretesPorAgendamento(ids) {
  const mapa = new Map();
  const validos = [...new Set((ids || []).filter(ehUuid))].slice(0, 300);
  if (!validos.length) return mapa;
  const consultar = async (lote, comResposta) => {
    const p = new URLSearchParams(`select=agendamento_id,status${comResposta ? ',resposta_tipo,resposta' : ''}`);
    p.set('tipo', 'eq.lembrete');
    p.set('agendamento_id', `in.(${lote.join(',')})`);
    p.set('order', 'created_at.desc');
    return selecionar(T.envios, p);
  };
  for (let i = 0; i < validos.length; i += 100) {
    const lote = validos.slice(i, i + 100);
    let linhas = [];
    try { linhas = await consultar(lote, true); }
    catch (e) {
      if (e?.status === 400) { try { linhas = await consultar(lote, false); } catch { linhas = []; } }
    }
    for (const l of linhas) {
      if (!mapa.has(l.agendamento_id)) {   // o mais recente manda (order=created_at.desc)
        mapa.set(l.agendamento_id, { status: l.status ?? null, resposta: l.resposta_tipo ?? null,
          // o que o cliente escreveu (cortado): aparece ao passar o mouse no selo do cartão
          texto: l.resposta ? String(l.resposta).slice(0, 160) : null });
      }
    }
  }
  return mapa;
}

/** Anexa `lembrete` a quem ainda não tem desfecho (só esses recebem lembrete). */
export async function anexarLembretes(lista) {
  const alvo = lista.filter((a) => a && ['aguardando', 'confirmado'].includes(a.status));
  if (!alvo.length) return lista;
  const mapa = await lembretesPorAgendamento(alvo.map((a) => a.id));
  if (!mapa.size) return lista;
  for (const a of alvo) if (mapa.has(a.id)) a.lembrete = mapa.get(a.id);
  return lista;
}

/* ---- saúde do sistema (vigia_estado, linha única) ----------------------------
   O vigia (indycar-vigia) carimba aqui o problema atual — ex.: 'codewords-fora'
   quando a chave do CodeWords leva 401 e nenhum WhatsApp automático sai. */
export async function obterSaude() {
  try {
    const v = await selecionarUm(T.vigia, 'select=problema,desde,checado_em,ultimo_resumo&id=is.true');
    return {
      ok: !v?.problema,
      problema: v?.problema ?? null,
      desde: v?.desde ?? null,
      checado_em: v?.checado_em ?? null,
      resumo: v?.ultimo_resumo ?? null,
    };
  } catch (e) {
    // sem leitura não é problema do sistema: a faixa só aparece com problema real
    return { ok: true, problema: null, desde: null, checado_em: null, resumo: null, sem_leitura: true };
  }
}

// ============================================================================
// CLIENTES
// ============================================================================

export async function listarClientes(q) {
  const p = new URLSearchParams('select=*');
  if (q) {
    const t = termoBusca(q);
    // telefone_e164 entra na busca para achar o cliente digitando só os números,
    // mesmo quando o CRM gravou o telefone com máscara. Nome e placa também sem acento.
    const f = [...filtrosDeBusca(q, ['nome', 'placa']), `telefone.ilike.${t}`, `telefone_e164.ilike.${t}`];
    p.set('or', `(${f.join(',')})`);
  }
  p.set('order', 'nome.asc');
  let linhas = await selecionarTudo(T.clientes, p);
  if (q) linhas = linhas.filter((r) => casaBusca([r.nome, r.placa, r.telefone, r.telefone_e164], q, r.telefone_e164 || r.telefone));
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
  if (dados.nascimento !== undefined) {
    const n = nascimentoBanco(dados.nascimento);
    if (n === undefined) throw new Error('Aniversário inválido. Use DD/MM ou DD/MM/AAAA.');
    campos.nascimento = n;
  }
  /* A chave "aceita mensagens automáticas" é lida pelo Comunicar antes de cada
     envio. Desligar carimba quando e por quê (a pessoa pediu no balcão, por
     exemplo); religar limpa o carimbo. */
  if (dados.aceita_mensagens !== undefined) {
    const aceita = paraBool(dados.aceita_mensagens);
    campos.aceita_mensagens = aceita;
    campos.aceita_mensagens_em = aceita ? null : new Date().toISOString();
    campos.aceita_mensagens_motivo = aceita ? null
      : (String(dados.aceita_mensagens_motivo || '').trim().slice(0, 200) || 'Pedido feito na Agenda');
  }
  return limparParaGravar(campos);
}

/* Tira do PATCH/INSERT as colunas do Comunicar que o banco AINDA não tem —
   senão o PostgREST recusa a gravação inteira (400) e nem o nome salva. Assim
   que a migração chegar, a sonda devolve "tem" e nada mais é removido. */
const COLUNAS_COMUNICAR_CLIENTE = ['nascimento', 'aceita_mensagens', 'aceita_mensagens_em', 'aceita_mensagens_motivo'];
async function soColunasQueExistem(campos) {
  const saida = { ...campos };
  for (const col of COLUNAS_COMUNICAR_CLIENTE) {
    if (saida[col] === undefined) continue;
    if (!(await temColuna(T.clientes, col))) {
      delete saida[col];
      console.warn(`clientes.${col} ainda não existe no banco — campo ignorado por enquanto.`);
    }
  }
  return saida;
}

export async function criarCliente(dados) {
  const linha = await soColunasQueExistem(clienteParaBanco({ origem: 'Google', ...dados }));
  return lerCliente(await inserirUm(T.clientes, linha, 'select=*'));
}

export async function atualizarCliente(id, dados) {
  if (!ehUuid(id)) return null;
  const campos = await soColunasQueExistem(clienteParaBanco(dados));
  return lerCliente(await atualizarUm(T.clientes, `id=eq.${id}&select=*`, campos));
}

/**
 * "Achar pelo nome": quem já falou com a oficina no WhatsApp (conversas) ou já
 * tem ficha (clientes). Devolve até 8 contatos COM telefone, os mais recentes
 * primeiro, sem repetir o mesmo número. Serve para o formulário de agendamento
 * não nascer sem telefone — 92 dos 159 agendamentos do banco nasceram assim e
 * ficaram sem lembrete, sem pós-venda e sem ficha no CRM.
 */
export async function acharContato(q) {
  // Filtro direto de coluna: SEM aspas (o PostgREST as trataria como texto e nada
  // casaria — ver servicoIdPorNome). Tira o que tem sentido especial no ilike.
  const termo = String(q ?? '').replace(/[%*"\\(),]/g, ' ').replace(/\s+/g, ' ').trim();
  if (termo.length < 2) return [];
  const t = `*${termo}*`;
  // sem acento: "jose" acha "José" (forma larga no ilike + conferência em JS logo abaixo)
  const largo = padraoSemAcento(termo);
  const filtroNome = largo ? `(nome.ilike.${termoBusca(termo)},nome.ilike.${largo})` : null;
  const pc = new URLSearchParams('select=nome,telefone,cliente_id,ultima_mensagem_em');
  if (filtroNome) pc.set('or', filtroNome); else pc.set('nome', `ilike.${t}`);
  pc.set('telefone', 'not.is.null');
  pc.set('order', 'ultima_mensagem_em.desc.nullslast');
  pc.set('limit', '40');
  const pk = new URLSearchParams('select=id,nome,telefone,carro_modelo,placa,updated_at');
  if (filtroNome) pk.set('or', filtroNome); else pk.set('nome', `ilike.${t}`);
  pk.set('telefone', 'not.is.null');
  pk.set('order', 'updated_at.desc.nullslast');
  pk.set('limit', '40');
  const [conversasT, clientesT] = await Promise.all([
    selecionar(T.conversas, pc).catch(() => []),
    selecionar(T.clientes, pk).catch(() => []),
  ]);
  // a forma larga traz a mais: aqui fica só quem casa de verdade (sem acento)
  const conversas = conversasT.filter((c) => casaBusca([c.nome], termo));
  const clientes = clientesT.filter((c) => casaBusca([c.nome], termo));
  const vistos = new Set();
  const saida = [];
  const por = (tel) => telefoneNacional(tel);
  for (const c of conversas) {
    const chave = por(c.telefone);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ nome: c.nome, telefone: chave, cliente_id: c.cliente_id ?? null, origem: 'conversa',
      quando: c.ultima_mensagem_em ?? null, veiculo: null, placa: null });
  }
  for (const k of clientes) {
    const chave = por(k.telefone);
    if (!chave) continue;
    if (vistos.has(chave)) {       // já veio da conversa: só completa carro/placa/id
      const j = saida.find((s) => s.telefone === chave);
      if (j) { j.cliente_id = j.cliente_id ?? k.id; j.veiculo = k.carro_modelo ?? null; j.placa = k.placa ?? null; }
      continue;
    }
    vistos.add(chave);
    saida.push({ nome: k.nome, telefone: chave, cliente_id: k.id, origem: 'cliente',
      quando: k.updated_at ?? null, veiculo: k.carro_modelo ?? null, placa: k.placa ?? null });
  }
  return saida.slice(0, 8);
}

/** Quantos agendamentos dos últimos `dias` nasceram sem telefone (não recebem nada do Comunicar). */
export async function contarSemTelefone(dias = 30) {
  const desde = diasAntes(hoje(), dias);
  const linhas = await selecionar(T.agendamentos, `select=id,telefone&data=gte.${desde}&limit=2000`).catch(() => []);
  return linhas.filter((a) => !soDigitos(a.telefone)).length;
}

/* ---- regras de retorno do Comunicar (cache de 5 min) ------------------------ */
let _regras = { lista: [], ate: 0 };
export async function regrasDeRetorno() {
  if (_regras.ate > Date.now()) return _regras.lista;
  let lista = [];
  try {
    lista = await selecionar(T.regrasRetorno, 'select=rotulo,palavras,meses,ativo,ordem&ativo=is.true&order=ordem.asc');
  } catch { lista = []; /* tabela ainda não existe: vale o prazo padrão */ }
  _regras = { lista, ate: Date.now() + 5 * 60 * 1000 };
  return lista;
}

/**
 * Ficha do cliente para o modal: cadastro + última visita (último agendamento
 * CONCLUÍDO dele) + próxima revisão prevista (última visita + prazo da regra
 * que casar com o serviço; sem regra, 6 meses). Casa pelo cliente_id e também
 * pelo telefone, porque agendamentos antigos nem sempre têm o vínculo.
 */
export async function fichaDoCliente(id) {
  const cliente = await obterCliente(id);
  if (!cliente) return null;
  const p = new URLSearchParams('select=id,data,hora,servico,status');
  const tel = soDigitos(cliente.telefone);
  const nacional = telefoneNacional(tel);
  const filtros = [`cliente_id.eq.${id}`];
  if (tel) filtros.push(`telefone.eq.${tel}`);
  if (nacional && nacional !== tel) filtros.push(`telefone.eq.${nacional}`);
  p.set('or', `(${filtros.join(',')})`);
  p.set('status', 'eq.concluido');
  p.set('order', 'data.desc,hora.desc');
  p.set('limit', '1');
  const [ultimo, regras, total] = await Promise.all([
    selecionarUm(T.agendamentos, p).catch(() => null),
    regrasDeRetorno(),
    contar(T.agendamentos, `or=(${filtros.join(',')})`).catch(() => 0),
  ]);
  let ultima_visita = null, proxima_revisao = null;
  if (ultimo) {
    const prazo = prazoDeRetorno(ultimo.servico, regras);
    ultima_visita = { data: ultimo.data, servico: ultimo.servico, agendamento_id: ultimo.id };
    proxima_revisao = { data: somarMeses(ultimo.data, prazo.meses), meses: prazo.meses, rotulo: prazo.rotulo };
  }
  return { ...cliente, ultima_visita, proxima_revisao, total_agendamentos: total };
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

/* Ligação opcional consultor → login (perfis), coluna `consultores.perfil_id`
   (migração ag_consultor_perfil). Só entra no INSERT/PATCH quando a coluna
   existe — mesma sonda das colunas do Comunicar. Vazio desliga. */
async function campoPerfilDoConsultor(dados, campos) {
  if (dados.perfil_id === undefined) return campos;
  if (!(await temColuna(T.consultores, 'perfil_id'))) return campos;
  campos.perfil_id = uuidOuNulo(dados.perfil_id);
  return campos;
}

export async function criarConsultor(dados) {
  const linha = await campoPerfilDoConsultor(dados, limparParaGravar({
    nome: String(dados.nome).trim().slice(0, 80),
    telefone: soDigitos(dados.telefone) || null,
    cor: /^#[0-9a-fA-F]{6}$/.test(dados.cor || '') ? dados.cor : '#e6192e',
    ativo: dados.ativo === undefined ? true : paraBool(dados.ativo),
  }));
  return lerConsultor(await inserirUm(T.consultores, linha, 'select=*'));
}

export async function atualizarConsultor(id, dados) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.nome !== undefined) campos.nome = String(dados.nome).trim().slice(0, 80);
  if (dados.telefone !== undefined) campos.telefone = soDigitos(dados.telefone) || null;
  if (dados.cor !== undefined) campos.cor = /^#[0-9a-fA-F]{6}$/.test(dados.cor || '') ? dados.cor : '#e6192e';
  if (dados.ativo !== undefined) campos.ativo = paraBool(dados.ativo);
  await campoPerfilDoConsultor(dados, campos);
  return lerConsultor(await atualizarUm(T.consultores, `id=eq.${id}&select=*`, limparParaGravar(campos)));
}

/** O consultor ligado a um login (ou null). É o que liga "Minha agenda". */
export async function consultorDoPerfil(perfilId) {
  if (!ehUuid(perfilId) || !(await temColuna(T.consultores, 'perfil_id'))) return null;
  return lerConsultor(await selecionarUm(T.consultores, `select=*&perfil_id=eq.${perfilId}&limit=1`));
}

/**
 * Função PURA (testada): carga de cada consultor num dia — quantos horários
 * ATIVOS (ainda vão acontecer ou estão acontecendo) cada um tem, mais a linha
 * "sem consultor". Inativo só aparece se tiver horário.
 */
export function cargaDoDia(consultores = [], agendamentos = [], data = null) {
  const conta = new Map();
  let sem = 0;
  for (const a of agendamentos) {
    if (!a || (data && a.data !== data) || !STATUS_OCUPA.has(a.status)) continue;
    if (a.consultor_id) conta.set(a.consultor_id, (conta.get(a.consultor_id) || 0) + 1);
    else sem++;
  }
  const linhas = consultores
    .filter((c) => (c.ativo !== 0 && c.ativo !== false) || conta.get(c.id))
    .map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, ativo: c.ativo, perfil_id: c.perfil_id ?? null, total: conta.get(c.id) || 0 }))
    .sort((x, y) => x.total - y.total || String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
  return { data, consultores: linhas, sem_consultor: sem };
}

/**
 * Função PURA (testada): qual consultor sugerir para um horário — SÓ sugere,
 * nunca bloqueia. Fora quem já tem carro naquela meia hora (o banco recusaria:
 * índice agendamentos_slot_uk), fica o de MENOR carga no dia; empate → nome.
 * Ninguém livre → null (a tela deixa escolher mesmo assim).
 */
export function sugerirConsultor({ consultores = [], agendamentos = [], data, hora, ignorar = null } = {}) {
  const ativos = consultores.filter((c) => c.ativo !== 0 && c.ativo !== false);
  if (!ativos.length || !data) return null;
  const doDia = agendamentos.filter((a) => a && a.data === data && STATUS_OCUPA.has(a.status) && (!ignorar || a.id !== ignorar));
  const janela = (h) => { const m = minDe(h); return m === null ? null : Math.floor(m / EXPEDIENTE.passo) * EXPEDIENTE.passo; };
  const jan = hora ? janela(hora) : null;
  const ocupados = new Set(jan === null ? [] : doDia.filter((a) => a.consultor_id && janela(a.hora) === jan).map((a) => a.consultor_id));
  const carga = cargaDoDia(ativos, doDia, data).consultores.filter((c) => !ocupados.has(c.id));
  if (!carga.length) return null;
  const melhor = carga[0];
  return { id: melhor.id, nome: melhor.nome, total: melhor.total,
    motivo: melhor.total === 0 ? 'livre o dia todo' : `${melhor.total} ${melhor.total === 1 ? 'carro' : 'carros'} no dia` };
}

/** Carga do dia lida do banco: consultores + horários ativos daquela data. */
export async function cargaPorConsultor(data) {
  const d = dataBanco(data) || hoje();
  const [consultores, linhas] = await Promise.all([
    listarConsultores(),
    selecionar(T.agendamentos, `select=id,data,hora,status,consultor_id&data=eq.${d}&limit=1000`),
  ]);
  return { ...cargaDoDia(consultores, linhas.map((r) => ({ ...r, hora: horaCurta(r.hora) })), d), linhas };
}

/** Sugestão de consultor para data/hora (modal de agendamento). */
export async function consultorSugerido({ data, hora, ignorar } = {}) {
  const d = dataBanco(data);
  if (!d) return { sugestao: null, carga: [] };
  const { consultores, linhas } = await cargaPorConsultor(d);
  const todos = await listarConsultores();
  const sugestao = sugerirConsultor({ consultores: todos, agendamentos: linhas.map((r) => ({ ...r, hora: horaCurta(r.hora) })),
    data: d, hora: horaBanco(hora) ? horaCurta(horaBanco(hora)) : null, ignorar: ehUuid(ignorar) ? ignorar : null });
  return { sugestao, carga: consultores };
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

/* Colunas do perfil ampliado (migração rodada3_base). Se ainda não existirem
   (banco antigo / teste), o select cai para o básico em vez de quebrar o login. */
const SEL_PERFIL = 'id,nome,email,papel,ativo,avatar_cor,apps,cargo,telefone,precisa_trocar_senha,preferencias,ultimo_acesso_em,ultimo_app';
const SEL_PERFIL_BASICO = 'id,nome,email,papel,ativo';
export const APPS_DO_ECOSSISTEMA = ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'ads'];

/** Normaliza o perfil para a tela (pura, testada). `apps` do papel agenda é sempre só ['agenda']. */
export function perfilParaTela(p, id, emailDoLogin = '') {
  const papel = p?.papel ?? '';
  const apps = papel === 'agenda' ? ['agenda']
    : (Array.isArray(p?.apps) ? p.apps.filter((a) => APPS_DO_ECOSSISTEMA.includes(a)) : APPS_DO_ECOSSISTEMA.slice());
  return {
    id,
    nome: p?.nome ?? '',
    // o e-mail do Auth é a fonte da verdade quando o perfil ainda não tem um
    email: p?.email || emailDoLogin || '',
    papel,
    ativo: bit(p?.ativo ?? true),
    avatar_cor: /^#[0-9a-fA-F]{6}$/.test(p?.avatar_cor || '') ? p.avatar_cor : '#e50914',
    cargo: p?.cargo ?? '',
    telefone: p?.telefone ?? '',
    apps,
    pode_agenda: papel === 'admin' || apps.includes('agenda'),
    gestor: papel === 'admin' || papel === 'gestor',
    precisa_trocar_senha: !!p?.precisa_trocar_senha,
    preferencias: p?.preferencias && typeof p.preferencias === 'object' ? p.preferencias : {},
    ultimo_acesso_em: p?.ultimo_acesso_em ?? null,
  };
}

async function lerPerfilBruto(id) {
  try { return await selecionarUm(T.perfis, `select=${SEL_PERFIL}&id=eq.${encodeURIComponent(id)}`); }
  catch { return selecionarUm(T.perfis, `select=${SEL_PERFIL_BASICO}&id=eq.${encodeURIComponent(id)}`); }
}

export async function obterPerfil(id, emailDoLogin = '') {
  const [p, consultor] = await Promise.all([lerPerfilBruto(id), consultorDoPerfil(id).catch(() => null)]);
  return { ...perfilParaTela(p, id, emailDoLogin), consultor_id: consultor?.id ?? null, consultor_nome: consultor?.nome ?? null };
}

/** Troca só o nome — papel, e-mail e situação continuam com o administrador. */
export async function atualizarPerfilNome(id, nome, emailDoLogin = '') {
  await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`, {
    nome, updated_at: new Date().toISOString(),
  });
  return obterPerfil(id, emailDoLogin);
}

/** "Meu perfil": nome, cargo, telefone, cor do avatar e preferências de notificação.
    O e-mail fica só leitura; papel/apps/ativo NUNCA passam por aqui. */
export async function atualizarMeuPerfil(id, campos, emailDoLogin = '') {
  const permitido = {};
  for (const k of ['nome', 'cargo', 'telefone', 'avatar_cor', 'preferencias']) if (campos[k] !== undefined) permitido[k] = campos[k];
  /* preferências: junta com as que já estão no perfil (os outros apps guardam
     as deles na MESMA coluna — substituir apagaria as escolhas feitas lá) */
  if (permitido.preferencias) {
    const atual = await selecionarUm(T.perfis, `select=preferencias&id=eq.${encodeURIComponent(id)}`).catch(() => null);
    permitido.preferencias = juntarPreferencias(atual?.preferencias, permitido.preferencias);
  }
  await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`, { ...permitido, updated_at: new Date().toISOString() });
  return obterPerfil(id, emailDoLogin);
}

/** Último acesso (o servidor chama no máximo a cada 5 min por pessoa). */
export async function marcarUltimoAcesso(id, app = 'agenda') {
  await atualizar(T.perfis, `id=eq.${encodeURIComponent(id)}`, { ultimo_acesso_em: new Date().toISOString(), ultimo_app: app });
}

/** A pessoa trocou a senha obrigatória: desliga a marca. */
export async function marcarSenhaTrocada(id) {
  await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`, { precisa_trocar_senha: false });
}

/** Admin: quais apps a pessoa usa (o papel agenda fica sempre só com ['agenda']). */
export async function definirApps(id, apps) {
  const lista = [...new Set((apps || []).filter((a) => APPS_DO_ECOSSISTEMA.includes(a)))];
  await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`, { apps: lista, updated_at: new Date().toISOString() });
  return lista;
}

/** Admin: senha temporária (12 caracteres sem confusão 0/O, 1/l) + troca obrigatória no próximo login. */
export function gerarSenhaTemporaria() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const b = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += alfabeto[b[i] % alfabeto.length];
  return s;
}
export async function definirSenhaTemporaria(id) {
  const senha = gerarSenhaTemporaria();
  await trocarSenhaAuth(id, senha);
  await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`, { precisa_trocar_senha: true, updated_at: new Date().toISOString() });
  return senha;
}

// ============================================================================
// EQUIPE — quem tem acesso ao sistema (mesma tabela `perfis`)
// Cadastrar alguém aqui dá acesso à Agenda, ao CRM e ao Atendimento de uma vez.
// Estas funções não perguntam QUEM está chamando: as travas (só admin, e nunca
// derrubar o último administrador) ficam no server.js, junto do token conferido.
// ============================================================================

/** Lista a equipe. Com um id, devolve só aquela pessoa (é o que o não-admin vê). */
export async function listarEquipe(soEsteId = null) {
  const filtro = soEsteId ? `&id=eq.${encodeURIComponent(soEsteId)}` : '';
  const linhas = await selecionar(T.perfis,
    `select=id,nome,email,papel,ativo,created_at,apps,cargo,ultimo_acesso_em,ultimo_app,precisa_trocar_senha&order=created_at.asc${filtro}`)
    .catch(() => selecionar(T.perfis, `select=id,nome,email,papel,ativo,created_at&order=created_at.asc${filtro}`));
  return linhas.map((p) => ({ ...p, ativo: bit(p.ativo),
    apps: p.papel === 'agenda' ? ['agenda'] : (Array.isArray(p.apps) ? p.apps : APPS_DO_ECOSSISTEMA.slice()) }));
}

/** Quantas pessoas já têm acesso — é isto que decide se o primeiro acesso está aberto. */
export const contarPerfis = () => contar(T.perfis);

/** Administradores que ainda conseguem entrar. Chegar a zero tranca todo mundo. */
export const contarAdminsAtivos = () => contar(T.perfis, 'papel=eq.admin&ativo=is.true');

/** Função e situação de alguém, para conferir ANTES de mexer. null se não existir. */
export async function resumoDoPerfil(id) {
  const p = await selecionarUm(T.perfis, `select=papel,ativo&id=eq.${encodeURIComponent(id)}`);
  return p ? { papel: p.papel ?? '', ativo: !!p.ativo } : null;
}

/** Cria o acesso e acerta nome e função no perfil que o gatilho do banco criou. */
export async function criarMembro({ nome, email, senha, papel = 'atendente', convidadoPor = null, trocarSenha = false }) {
  const usuario = await criarUsuarioAuth({ email, senha, nome });

  /* O gatilho criar_perfil_novo_usuario já inseriu a linha em `perfis`; aqui só
     acertamos nome e função. Se ESTE passo falhar, o acesso já existe — repetir
     o cadastro esbarraria em "e-mail já cadastrado" e a pessoa ficaria sem
     entender. Por isso devolvemos um aviso em vez de estourar o erro. */
  try {
    const extras = {
      ...(papel === 'agenda' ? { apps: ['agenda'] } : {}),
      ...(ehUuid(convidadoPor) ? { convidado_por: convidadoPor } : {}),
      // senha criada pelo admin: a pessoa escolhe a dela no primeiro login
      ...(trocarSenha ? { precisa_trocar_senha: true } : {}),
    };
    const gravado = await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(usuario.id)}`,
      { nome, papel, ativo: true, ...extras, updated_at: new Date().toISOString() })
      .catch(() => atualizarUm(T.perfis, `id=eq.${encodeURIComponent(usuario.id)}`,
        { nome, papel, ativo: true, updated_at: new Date().toISOString() }));
    /* Sem gatilho no banco, o UPDATE não acha linha nenhuma e a pessoa ficaria
       com login mas sem perfil — e o porteiro do servidor recusa quem não tem
       perfil. Criar aqui evita um acesso que não entra em lugar nenhum. */
    if (!gravado) {
      await inserirUm(T.perfis, { id: usuario.id, nome, email, papel, ativo: true });
    }
  } catch (e) {
    return { id: usuario.id, nome, email, papel,
      aviso: 'Criei o acesso, mas não consegui gravar nome e função: ' + (e?.message || e)
           + ' Ajuste direto na lista da equipe.' };
  }
  return { id: usuario.id, nome, email, papel, aviso: null };
}

export async function definirPapel(id, papel, papelAntes = null) {
  /* O papel 'agenda' (presença) só usa a Agenda: apps = ['agenda']. Saindo
     dele, a pessoa volta a ter todos os apps (o admin restringe depois). */
  const extra = papel === 'agenda' ? { apps: ['agenda'] }
    : (papelAntes === 'agenda' ? { apps: APPS_DO_ECOSSISTEMA.slice() } : {});
  try {
    await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`,
      { papel, ...extra, updated_at: new Date().toISOString() });
  } catch (e) {
    if (!Object.keys(extra).length) throw e;      // banco sem a coluna apps: grava só o papel
    await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`, { papel, updated_at: new Date().toISOString() });
  }
}

/** Liga/desliga o acesso. Desligado, o porteiro do servidor recusa o token. */
export async function definirAtivo(id, ativo) {
  await atualizarUm(T.perfis, `id=eq.${encodeURIComponent(id)}`,
    { ativo: !!ativo, updated_at: new Date().toISOString() });
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
  // lembrete_ativo/lembrete_horas ficaram no banco mas não saem mais daqui:
  // o lembrete de agendamento é do Comunicar.
  const { lembrete_ativo, lembrete_horas, ...c } = await lerLinhaUnica(T.waConfig);
  return {
    ...c,
    ativo: bit(c.ativo),
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
/** Hora de agora (HH:MM) no fuso da oficina — par do hoje(). */
export function agoraHHMM() {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return p === '24:00' ? '00:00' : p;   // alguns motores devolvem 24:00 à meia-noite
}

/** `dias` atrás de uma data ISO (YYYY-MM-DD), sem depender do fuso do servidor. */
function diasAntes(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Ordem do painel "Últimos agendamentos" (pedido do dono 2026-09-17):
 * o que está MAIS PERTO DE ACONTECER vem primeiro; depois, o que já passou,
 * do mais novo para o mais velho. Função pura, para poder testar.
 *   proximos : data/hora >= agora, em ordem crescente (o próximo no topo)
 *   passados : data/hora <  agora, em ordem decrescente (o mais recente antes)
 * data é ISO e hora é HH:MM — comparar texto já ordena certo.
 */
export function ordenarPorProximidade(lista, hojeIso, agora) {
  const chave = (a) => `${a.data} ${String(a.hora || '').slice(0, 5)}`;
  const corte = `${hojeIso} ${agora}`;
  const proximos = [], passados = [];
  for (const a of lista) (chave(a) >= corte ? proximos : passados).push(a);
  proximos.sort((x, y) => chave(x).localeCompare(chave(y)));
  passados.sort((x, y) => chave(y).localeCompare(chave(x)));
  return [
    ...proximos.map((a) => ({ ...a, secao: 'proximos' })),
    ...passados.map((a) => ({ ...a, secao: 'passados' })),
  ];
}

/* Quem aparece em "Últimos agendamentos": só quem ainda NÃO tem desfecho de
   visita — aguardando, confirmado — e quem faltou (para remarcar). Quem VEIO
   (compareceu, em atendimento, concluído, não fechou) sai daqui: o lugar dele
   é o CRM. Cancelado também não entra: é ruído. */
const STATUS_EM_ULTIMOS = 'status=in.(aguardando,confirmado,nao_veio)';
const ULTIMOS_LIMITE = 10;
const ULTIMOS_DIAS_PASSADOS = 7;   // pendência mais velha que isso já é Follow-up/Histórico
const ULTIMOS_RESERVA_PASSADOS = 4; // vagas garantidas para "Já passaram", mesmo com a agenda cheia

/**
 * Corta a lista de "Últimos agendamentos" sem deixar uma seção engolir a outra:
 * com 10+ horários futuros, os que JÁ PASSARAM sem desfecho (os que mais pedem
 * atenção) sumiriam. Reserva até 4 vagas para eles; o que sobrar vai para o outro lado.
 */
export function montarUltimos(lista, hojeIso, agora, limite = ULTIMOS_LIMITE) {
  const ord = ordenarPorProximidade(lista, hojeIso, agora);
  const prox = ord.filter((a) => a.secao === 'proximos');
  const pass = ord.filter((a) => a.secao === 'passados');
  const nPass = Math.min(pass.length, Math.max(ULTIMOS_RESERVA_PASSADOS, limite - prox.length));
  const nProx = Math.min(prox.length, limite - nPass);
  return [...prox.slice(0, nProx), ...pass.slice(0, nPass)];
}

export async function estatisticas() {
  const d = hoje();

  const [agendaHoje, deHojeEmDiante, passadosRecentes, naOficinaDeAntes, totalClientes, totalConsult, semTelefone30d] = await Promise.all([
    listarAgendamentos({ data: d }).then((l) => l.slice().sort((a, b) => String(a.hora).localeCompare(String(b.hora)))),
    selecionar(T.agendamentos,
      `${SEL_AGENDAMENTO}&${STATUS_EM_ULTIMOS}&data=gte.${d}&order=data.asc,hora.asc&limit=${ULTIMOS_LIMITE * 2}`),
    selecionar(T.agendamentos,
      `${SEL_AGENDAMENTO}&${STATUS_EM_ULTIMOS}&data=lt.${d}&data=gte.${diasAntes(d, ULTIMOS_DIAS_PASSADOS)}`
      + `&order=data.desc,hora.desc&limit=${ULTIMOS_LIMITE}`),
    /* Chegou em outro dia e AINDA não tem desfecho: o carro pode ficar dias na
       oficina. Vai para a aba "Na oficina" do Início — sem isto sumiria de tudo e
       o lead ficaria preso em "Em serviço" no CRM. (Os de hoje vêm em agendaHoje.) */
    selecionar(T.agendamentos,
      `${SEL_AGENDAMENTO}&status=in.(compareceu,em_atendimento)&data=lt.${d}&data=gte.${diasAntes(d, ULTIMOS_DIAS_PASSADOS)}`
      + '&order=data.desc,hora.desc&limit=20'),
    contar(T.clientes),
    contar(T.consultores, 'ativo=is.true'),
    // agendamentos sem telefone nos últimos 30 dias: só aparece na tela quando > 0
    contarSemTelefone(30),
  ]);

  /* MESMA regra das abas do painel (grupoDoDia em public/app.js): status vivo
     primeiro, depois o bit compareceu. Se os dois divergirem, o card diz um
     número e a aba mostra outro — foi bug real. Mudou lá? Muda aqui. */
  // o STATUS explícito manda antes do bit compareceu (que pode ter ficado velho)
  const esperando = (a) => ['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1;
  const faltouPeloStatus = (a) => ['nao_veio', 'cancelado'].includes(a.status);
  const veio = (a) => ['concluido', 'nao_fechou'].includes(a.status)
    || (!faltouPeloStatus(a) && (a.compareceu === 1 || ['compareceu', 'em_atendimento'].includes(a.status)));
  const faltou = (a) => !esperando(a) && !veio(a) && (faltouPeloStatus(a) || a.compareceu === 0);
  const cards = {
    totalHoje: agendaHoje.length,
    concluidosHoje: agendaHoje.filter((a) => a.status === 'concluido').length,
    compareceram: agendaHoje.filter((a) => !esperando(a) && veio(a)).length,
    naoVieram: agendaHoje.filter(faltou).length,
    naoFechou: agendaHoje.filter((a) => a.status === 'nao_fechou').length,
    aguardando: agendaHoje.filter(esperando).length,
    totalClientes,
    totalConsult,
    semTelefone30d,
  };

  const ultimos = await anexarLembretes(
    montarUltimos([...deHojeEmDiante, ...passadosRecentes].map(lerAgendamento), d, agoraHHMM()));
  return { cards, agendaHoje, ultimos, naOficina: naOficinaDeAntes.map(lerAgendamento), data: d, agora: agoraHHMM() };
}

/**
 * Aba CRM. GROUP BY / SUM(CASE WHEN) não existem no PostgREST: as agregações são
 * feitas em JavaScript sobre as linhas cruas.
 */
export async function metricasCrm() {
  const [linhas, consultores] = await Promise.all([
    // ordem fixa: LIMIT/OFFSET sem ORDER BY no Postgres pode repetir e pular
    // linhas entre páginas, e as métricas sairiam erradas sem nenhum erro
    selecionarTudo(T.agendamentos, 'select=origem,status,compareceu,consultor_id,valor&order=id.asc'),
    listarConsultores(),
  ]);

  const total = linhas.length;
  const compareceram = linhas.filter((a) => a.compareceu === true).length;
  const naoVieram = linhas.filter((a) => a.compareceu === false).length;
  const concluidos = linhas.filter((a) => a.status === 'concluido').length;

  /* Por origem: além do total, quantos faltaram — a TAXA DE FALTA por canal
     mostra de onde vem o cliente que marca e não aparece. A taxa é sobre quem
     já tem desfecho de visita (veio ou faltou), não sobre o que ainda vai acontecer. */
  const contagemOrigem = new Map();
  for (const a of linhas) {
    const rotulo = origemTela(a.origem);
    const o = contagemOrigem.get(rotulo) || { total: 0, faltas: 0, vieram: 0, fechou: 0 };
    o.total++;
    if (a.status === 'nao_veio' || a.compareceu === false) o.faltas++;
    else if (a.compareceu === true || ['concluido', 'nao_fechou'].includes(a.status)) o.vieram++;
    if (a.status === 'concluido') o.fechou++;
    contagemOrigem.set(rotulo, o);
  }
  const taxa = (parte, todo) => (todo ? Math.round((parte / todo) * 100) : 0);
  const porOrigem = [...contagemOrigem.entries()]
    .map(([origem, o]) => ({ origem, ...o, taxaFalta: taxa(o.faltas, o.faltas + o.vieram), taxaFechamento: taxa(o.fechou, o.vieram) }))
    .sort((x, y) => y.total - x.total);

  // LEFT JOIN: todo consultor aparece, mesmo com zero agendamentos
  const porConsultor = consultores.map((c) => {
    const meus = linhas.filter((a) => a.consultor_id === c.id);
    const vieram = meus.filter((a) => a.compareceu === true || ['concluido', 'nao_fechou'].includes(a.status)).length;
    const faltas = meus.filter((a) => a.status === 'nao_veio' || a.compareceu === false).length;
    const concluidos = meus.filter((a) => a.status === 'concluido').length;
    return {
      nome: c.nome, ativo: c.ativo,
      faturamento: Math.round(meus.filter((a) => a.status === 'concluido').reduce((s, a) => s + (Number(a.valor) || 0), 0) * 100) / 100,
      total: meus.length, vieram, faltas, concluidos,
      naoFechou: meus.filter((a) => a.status === 'nao_fechou').length,
      taxaFechamento: taxa(concluidos, vieram),
      taxaFalta: taxa(faltas, faltas + vieram),
    };
  }).sort((x, y) => y.total - x.total);
  // agendamento sem consultor também conta: é o buraco que o dono quer ver
  const semConsultor = linhas.filter((a) => !a.consultor_id).length;

  /* Rodada 4: o faturamento que a Agenda registrou (valor dos concluídos) e
     quantos concluídos ainda estão SEM valor — o buraco do CRM. */
  const fechados = linhas.filter((a) => a.status === 'concluido');
  const comValor = fechados.filter((a) => Number(a.valor) > 0);
  const somaValor = Math.round(comValor.reduce((s, a) => s + Number(a.valor), 0) * 100) / 100;
  const faturamento = { soma: somaValor, comValor: comValor.length, semValor: fechados.length - comValor.length,
    ticketMedio: comValor.length ? Math.round(somaValor / comValor.length * 100) / 100 : 0 };
  return {
    total, compareceram, naoVieram, concluidos, faturamento,
    taxaComparecimento: total ? Math.round((compareceram / total) * 100) : 0,
    taxaConversao: compareceram ? Math.round((concluidos / compareceram) * 100) : 0,
    porOrigem, porConsultor, semConsultor,
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

// ============================================================================
// RODADA 2 (09/10/2026) — conectividade, histórico, horários livres, busca
// ============================================================================

/**
 * Padrão ilike que acha um telefone gravado COM ou SEM máscara pelos 8 últimos
 * dígitos: '(12) 99141-5355' e '12991415355' casam com '*9141*5355*'. Menos de
 * 8 dígitos: procura os dígitos seguidos. Menos de 4: nada (pegaria meio banco).
 */
export function padraoTelefone(q) {
  const d = soDigitos(q);
  if (d.length < 4) return null;
  if (d.length < 8) return `*${d}*`;
  const ult = d.slice(-8);
  return `*${ult.slice(0, 4)}*${ult.slice(4)}*`;
}

/** Os dois jeitos de um telefone estar gravado: só nacional e com 55 na frente. */
export function variantesTelefone(t) {
  const n = telefoneNacional(t);
  if (!n || n.length < 10) return [];
  return [n, '55' + n];
}

const mesmoTelefone = (a, b) => {
  const x = telefoneNacional(a), y = telefoneNacional(b);
  return !!x && x === y;
};

/** Filtro or=(...) que acha os agendamentos de um cliente pela ficha OU pelo telefone (com/sem máscara). */
function filtroDoCliente(clienteId, telefone) {
  const f = [];
  if (ehUuid(clienteId)) f.push(`cliente_id.eq.${clienteId}`);
  const pt = telefone ? padraoTelefone(telefoneNacional(telefone)) : null;
  if (pt && soDigitos(telefone).length >= 10) f.push(`telefone.ilike.${pt}`);
  return f.length ? `(${f.join(',')})` : null;
}

/**
 * Histórico do cliente na Agenda: os últimos agendamentos (qualquer situação),
 * do mais recente para o mais antigo. Casa pela ficha e pelo telefone, e
 * confere o telefone em JS (o padrão ilike pelos 8 últimos dígitos é largo).
 */
export async function historicoDoCliente({ cliente_id, telefone } = {}, limite = 20) {
  const or = filtroDoCliente(cliente_id, telefone);
  if (!or) return [];
  const p = new URLSearchParams(SEL_AGENDAMENTO);
  p.set('or', or);
  p.set('order', 'data.desc,hora.desc');
  p.set('limit', String(Math.min(60, limite * 2)));
  const linhas = await selecionar(T.agendamentos, p);
  return linhas
    .filter((r) => (ehUuid(cliente_id) && r.cliente_id === cliente_id) || (telefone && mesmoTelefone(r.telefone, telefone)))
    .slice(0, limite)
    .map(lerAgendamento);
}

/* Rótulos dos envios do Comunicar, em português de oficina. */
const TIPO_ENVIO = {
  lembrete: 'Lembrete do horário', aniversario: 'Feliz aniversário', revisao: 'Lembrete de revisão',
  pos_venda: 'Pós-venda', posvenda: 'Pós-venda', satisfacao: 'Pesquisa de satisfação', retorno: 'Convite de retorno',
  ausencia: 'Aviso de falta', avulsa: 'Mensagem avulsa', reativacao: 'Reativação',
};
export const rotuloEnvio = (tipo) => TIPO_ENVIO[tipo] || (tipo ? String(tipo).replace(/_/g, ' ') : 'Mensagem');

/**
 * Mensagens automáticas que o COMUNICAR mandou para o cliente e o que ele
 * respondeu (posvenda_envios) + as notas de satisfação (posvenda_respostas).
 * A Agenda só LÊ. Qualquer falha devolve listas vazias: é um extra da ficha.
 */
export async function mensagensDoCliente({ cliente_id, telefone } = {}, limite = 15) {
  const f = [];
  if (ehUuid(cliente_id)) f.push(`cliente_id.eq.${cliente_id}`);
  for (const v of variantesTelefone(telefone)) f.push(`telefone.eq.${v}`);
  if (!f.length) return { envios: [], respostas: [] };
  const pe = new URLSearchParams('select=id,tipo,status,corpo,enviar_em,enviado_em,resposta,resposta_tipo,respondido_em,agendamento_id,created_at');
  pe.set('or', `(${f.join(',')})`);
  pe.set('order', 'created_at.desc');
  pe.set('limit', String(limite));
  const pr = new URLSearchParams('select=id,satisfeito,nota,comentario,created_at,agendamento_id');
  if (ehUuid(cliente_id)) { pr.set('cliente_id', `eq.${cliente_id}`); pr.set('order', 'created_at.desc'); pr.set('limit', '5'); }
  const [envios, respostas] = await Promise.all([
    selecionar(T.envios, pe).catch(() => []),
    ehUuid(cliente_id) ? selecionar(T.respostas, pr).catch(() => []) : Promise.resolve([]),
  ]);
  return {
    envios: envios.map((e) => ({
      id: e.id, tipo: e.tipo, rotulo: rotuloEnvio(e.tipo), status: e.status ?? null,
      // o texto vai cortado: a ficha mostra um resumo, não o histórico inteiro do WhatsApp
      corpo: e.corpo ? String(e.corpo).slice(0, 280) : null,
      quando: e.enviado_em || e.enviar_em || e.created_at || null,
      resposta: e.resposta ? String(e.resposta).slice(0, 280) : null,
      resposta_tipo: e.resposta_tipo ?? null, respondido_em: e.respondido_em ?? null,
      agendamento_id: e.agendamento_id ?? null,
    })),
    respostas: respostas.map((r) => ({
      id: r.id, satisfeito: r.satisfeito, nota: r.nota ?? null,
      comentario: r.comentario ? String(r.comentario).slice(0, 280) : null, quando: r.created_at,
    })),
  };
}

/**
 * Link de entrada (?tel=&cliente=) vindo do Atendimento/CRM/Comunicar.
 * Acha a ficha pelo id; senão pelo telefone (telefone_e164 = só nacional, que
 * já casa com quem gravou com ou sem 55). Devolve a ficha (ou null) e os
 * agendamentos dele — os pendentes à parte, do mais próximo ao mais distante.
 */
export async function abrirPeloLink({ cliente, tel } = {}) {
  let c = null;
  if (ehUuid(cliente)) c = await obterCliente(cliente).catch(() => null);
  const nacional = telefoneNacional(tel);
  if (!c && nacional && nacional.length >= 10) {
    const p = new URLSearchParams('select=*');
    p.set('telefone_e164', `eq.${nacional}`);
    p.set('limit', '1');
    c = lerCliente(await selecionarUm(T.clientes, p).catch(() => null));
  }
  const telefone = c?.telefone || nacional || null;
  const agendamentos = await historicoDoCliente({ cliente_id: c?.id, telefone }, 20).catch(() => []);
  const pendentes = agendamentos.filter((a) => STATUS_OCUPA.has(a.status))
    .sort((x, y) => `${x.data} ${x.hora}`.localeCompare(`${y.data} ${y.hora}`));
  return { cliente: c, telefone: nacional || telefoneNacional(c?.telefone) || null, pendentes, agendamentos };
}

/* ---- horários livres ("✨ Sugerir horário") --------------------------------
   Calculado AQUI, sem IA e sem outro sistema: seg–sáb, das 8h às 17h (último
   começo sugerido; a oficina fecha 17h30), em passos de 30 min. Cada horário
   ativo ocupa a janela de 30 min em que começa; a janela comporta tantos carros
   quantos consultores ativos houver (a recepção é quem limita). */
export const EXPEDIENTE = { abre: 8 * 60, ultimoInicio: 17 * 60, passo: 30, dias: [1, 2, 3, 4, 5, 6] };
const STATUS_OCUPA = new Set(['aguardando', 'confirmado', 'compareceu', 'em_atendimento']);

const minDe = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaDaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/**
 * Função PURA (testada): as próximas `quantos` janelas livres a partir de `desde`.
 *   agora         { data:'YYYY-MM-DD', min } — hoje só sugere daqui a 30 min em diante
 *   agendamentos  [{data, hora, status, consultor_id}]
 *   capacidade    quantos carros por janela (consultores ativos; mínimo 1)
 *   consultor_id  se informado, conta só os horários DELE e a capacidade vira 1
 *   ignorar       id de um agendamento que não ocupa (o próprio, ao remarcar)
 * Espalha as sugestões: no máximo 2 por dia e com 90 min entre elas, para a
 * pessoa ter escolha de verdade (manhã/tarde/outro dia), não 8h, 8h30 e 9h.
 */
export function horariosLivres({ desde, agora, agendamentos = [], capacidade = 1, consultor_id = null, ignorar = null,
  consultores = [], quantos = 3, diasAFrente = 14, porDia = 2, intervalo = 90 } = {}) {
  const inicio = desde && (!agora?.data || desde >= agora.data) ? desde : (agora?.data || desde);
  if (!inicio || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return [];
  /* Capacidade POR CONSULTOR: cada consultor atende um carro por meia hora (o
     banco recusa dois — índice agendamentos_slot_uk) e a recepção comporta
     `capacidade` carros no total (consultores ativos). Com consultor_id, a
     janela só serve se ELE está livre E a recepção ainda tem vaga. Sem
     consultor, basta a recepção; e cada sugestão diz quem está livre
     (`consultores_livres`), para o modal já pré-escolher. */
  const capTotal = Math.max(1, Number(capacidade) || 1);
  const ocupacao = new Map();               // 'data|janela' -> quantos (todos)
  const doConsultor = new Map();            // 'data|janela' -> Set(consultor_id)
  for (const a of agendamentos) {
    if (!a || !STATUS_OCUPA.has(a.status) || (ignorar && a.id === ignorar)) continue;
    const m = minDe(a.hora); if (m === null) continue;
    const jan = Math.floor(m / EXPEDIENTE.passo) * EXPEDIENTE.passo;
    const k = `${a.data}|${jan}`;
    ocupacao.set(k, (ocupacao.get(k) || 0) + 1);
    if (a.consultor_id) { if (!doConsultor.has(k)) doConsultor.set(k, new Set()); doConsultor.get(k).add(a.consultor_id); }
  }
  const ativos = (consultores || []).filter(Boolean);
  const cap = consultor_id ? 1 : capTotal;
  const saida = [];
  for (let n = 0; n <= diasAFrente && saida.length < quantos; n++) {
    const d = somaDias(inicio, n);
    if (!EXPEDIENTE.dias.includes(diaDaSemana(d))) continue;
    const corte = agora?.data === d ? agora.min + 30 : -1;
    let noDia = 0, ultimo = -Infinity;
    for (let t = EXPEDIENTE.abre; t <= EXPEDIENTE.ultimoInicio && saida.length < quantos && noDia < porDia; t += EXPEDIENTE.passo) {
      if (t < corte || t - ultimo < intervalo) continue;
      const k = `${d}|${t}`;
      const usados = ocupacao.get(k) || 0;
      const ocupadosAqui = doConsultor.get(k) || new Set();
      if (usados >= capTotal) continue;                               // recepção lotada
      if (consultor_id && ocupadosAqui.has(consultor_id)) continue;   // ele já tem carro aqui
      const livresIds = ativos.filter((id) => !ocupadosAqui.has(id));
      if (!consultor_id && ativos.length && !livresIds.length) continue;
      saida.push({ data: d, hora: hhmm(t), livres: consultor_id ? 1 : capTotal - usados, capacidade: cap,
        ...(ativos.length ? { consultores_livres: consultor_id ? [consultor_id] : livresIds } : {}) });
      noDia++; ultimo = t;
    }
  }
  return saida;
}

/** Horários livres de verdade: lê os agendamentos ativos dos próximos 15 dias e os consultores ativos. */
export async function sugerirHorarios({ data, consultor_id, ignorar } = {}) {
  const hojeIso = hoje();
  const pedido = dataBanco(data);
  const desde = pedido && pedido >= hojeIso ? pedido : hojeIso;
  const ate = somaDias(desde, 15);
  const p = new URLSearchParams('select=id,data,hora,status,consultor_id');
  p.set('and', `(data.gte.${desde},data.lte.${ate})`);
  p.set('status', 'in.(aguardando,confirmado,compareceu,em_atendimento)');
  p.set('order', 'data.asc,hora.asc');
  p.set('limit', '1000');
  const [linhas, ativos] = await Promise.all([
    selecionar(T.agendamentos, p),
    selecionar(T.consultores, 'select=id&ativo=is.true').catch(() => []),
  ]);
  const capacidade = Math.max(1, ativos.length || 1);
  const [h, m] = agoraHHMM().split(':').map(Number);
  return {
    capacidade,
    sugestoes: horariosLivres({
      desde, agora: { data: hojeIso, min: h * 60 + m }, capacidade, consultores: ativos.map((c) => c.id),
      consultor_id: ehUuid(consultor_id) ? consultor_id : null, ignorar: ehUuid(ignorar) ? ignorar : null,
      agendamentos: linhas.map((r) => ({ ...r, hora: horaCurta(r.hora) })),
    }),
  };
}

/** Busca global (Ctrl+K): agendamentos e clientes de uma vez, poucos de cada. */
export async function buscaGlobal(q) {
  const termo = String(q ?? '').trim().slice(0, 80);
  if (termo.length < 2) return { agendamentos: [], clientes: [] };
  const t = termoBusca(termo);
  const pa = new URLSearchParams(SEL_AGENDAMENTO);
  const fa = filtrosDeBusca(termo, ['cliente_nome', 'placa', 'veiculo', 'servico']);
  const pt = padraoTelefone(termo);
  if (pt) fa.push(`telefone.ilike.${pt}`);
  pa.set('or', `(${fa.join(',')})`);
  pa.set('order', 'data.desc,hora.desc');
  pa.set('limit', '60');      // a forma sem acento traz a mais; o JS corta em 12
  const pc = new URLSearchParams('select=*');
  const fc = filtrosDeBusca(termo, ['nome', 'placa', 'carro_modelo']);
  const dig = soDigitos(termo);
  if (dig.length >= 4) fc.push(`telefone_e164.ilike.*${telefoneNacional(dig)}*`);
  pc.set('or', `(${fc.join(',')})`);
  pc.set('order', 'updated_at.desc.nullslast');
  pc.set('limit', '40');
  const [ag, cl] = await Promise.all([
    selecionar(T.agendamentos, pa).catch(() => []),
    selecionar(T.clientes, pc).catch(() => []),
  ]);
  return {
    agendamentos: ag.filter((r) => casaBusca([r.cliente_nome, r.placa, r.veiculo, r.servico], termo, r.telefone))
      .slice(0, 12).map(lerAgendamento),
    clientes: cl.filter((r) => casaBusca([r.nome, r.placa, r.carro_modelo], termo, r.telefone_e164 || r.telefone))
      .slice(0, 8).map(lerCliente),
  };
}

// ============================================================================
// RODADA 3 (13/10/2026) — auditoria, notificações, tarefas e automações
// Tudo pelo servidor (service role). O id de quem pede vem SEMPRE do token
// conferido no server.js — nunca do corpo da requisição.
// ============================================================================

/** Registra quem fez o quê (rpc da base). Nunca derruba a ação: só avisa no log. */
export async function auditar(perfilId, acao, tabela = null, registro = null, detalhes = null) {
  try {
    await rpc('registrar_auditoria', {
      p_perfil: ehUuid(perfilId) ? perfilId : null, p_app: 'agenda', p_acao: String(acao).slice(0, 80),
      p_tabela: tabela, p_registro: registro ? String(registro).slice(0, 80) : null, p_detalhes: detalhes,
    });
    return true;
  } catch (e) {
    console.error('Auditoria (não gravou):', e?.message || e);
    return false;
  }
}

/** Notificação para alguém (rpc da base; `chave` evita repetir). */
export async function notificar({ perfil_id, tipo, titulo, corpo = null, link = null, app = 'agenda', chave = null }) {
  if (!ehUuid(perfil_id)) return null;
  return rpc('notificar', { p_perfil: perfil_id, p_tipo: tipo, p_titulo: titulo, p_corpo: corpo,
    p_link: link, p_app: app, p_chave: chave });
}

export async function listarNotificacoes(perfilId, limite = 30) {
  if (!ehUuid(perfilId)) return { itens: [], naoLidas: 0 };
  const [itens, naoLidas] = await Promise.all([
    selecionar('notificacoes', `select=id,tipo,titulo,corpo,link,app,lida_em,created_at&perfil_id=eq.${perfilId}&order=created_at.desc&limit=${limite}`),
    contar('notificacoes', `perfil_id=eq.${perfilId}&lida_em=is.null`),
  ]);
  return { itens, naoLidas };
}

/** Marca como lidas (só as da própria pessoa: o filtro perfil_id vai junto). */
export async function marcarNotificacoesLidas(perfilId, ids = null) {
  if (!ehUuid(perfilId)) return 0;
  const p = new URLSearchParams();
  p.set('perfil_id', `eq.${perfilId}`);
  p.set('lida_em', 'is.null');
  if (Array.isArray(ids)) {
    const validos = ids.filter(ehUuid).slice(0, 100);
    if (!validos.length) return 0;
    p.set('id', `in.(${validos.join(',')})`);
  }
  const r = await atualizar('notificacoes', p, { lida_em: new Date().toISOString() });
  return r.length;
}

const SEL_TAREFA = 'id,titulo,descricao,responsavel_id,criado_por,cliente_id,agendamento_id,lead_id,conversa_id,origem,prioridade,vence_em,status,concluida_em,created_at';

export async function listarTarefasDe(perfilId, { status = 'aberta', limite = 50 } = {}) {
  if (!ehUuid(perfilId)) return [];
  const p = new URLSearchParams(`select=${SEL_TAREFA}`);
  p.set('responsavel_id', `eq.${perfilId}`);
  if (status) p.set('status', `eq.${status}`);
  p.set('order', 'vence_em.asc.nullslast,created_at.desc');
  p.set('limit', String(limite));
  return selecionar('tarefas', p);
}

export async function obterTarefa(id) {
  if (!ehUuid(id)) return null;
  return selecionarUm('tarefas', `select=${SEL_TAREFA}&id=eq.${id}`);
}

export async function criarTarefa(t) {
  const linha = limparParaGravar({
    titulo: String(t.titulo || '').trim().slice(0, 200),
    descricao: t.descricao ? String(t.descricao).slice(0, 1000) : null,
    responsavel_id: uuidOuNulo(t.responsavel_id),
    criado_por: uuidOuNulo(t.criado_por),
    cliente_id: uuidOuNulo(t.cliente_id),
    agendamento_id: uuidOuNulo(t.agendamento_id),
    lead_id: uuidOuNulo(t.lead_id),
    conversa_id: uuidOuNulo(t.conversa_id),
    origem: ['manual', 'agenda', 'automacao'].includes(t.origem) ? t.origem : 'agenda',
    prioridade: [1, 2, 3].includes(Number(t.prioridade)) ? Number(t.prioridade) : 2,
    vence_em: t.vence_em || null,
  });
  if (!linha.titulo) throw new Error('Escreva o que precisa ser feito.');
  return inserirUm('tarefas', linha, `select=${SEL_TAREFA}`);
}

export async function mudarStatusTarefa(id, status) {
  if (!ehUuid(id) || !['aberta', 'feita', 'cancelada'].includes(status)) return null;
  return atualizarUm('tarefas', `id=eq.${id}&select=${SEL_TAREFA}`, { status });
}

/* ---- leituras das automações (janela pequena, poucas consultas) ------------ */

/** Agendamentos entre duas datas (só o que as automações olham). */
export async function agendamentosParaAutomacao(de, ate) {
  const p = new URLSearchParams('select=id,cliente_id,cliente_nome,telefone,servico,data,hora,status,confirmado,compareceu,consultor_id,no_show_notificado_em,updated_at');
  p.set('and', `(data.gte.${de},data.lte.${ate})`);
  p.set('status', 'in.(aguardando,confirmado,nao_veio)');
  p.set('limit', '1000');
  return (await selecionar(T.agendamentos, p)).map((r) => ({ ...r, hora: horaCurta(r.hora) }));
}

/** Tarefas da automação já criadas para estes agendamentos (para não repetir). */
export async function tarefasDosAgendamentos(ids) {
  const validos = (ids || []).filter(ehUuid);
  if (!validos.length) return [];
  const saida = [];
  for (let i = 0; i < validos.length; i += 100) {
    const p = new URLSearchParams('select=id,titulo,agendamento_id,status,origem');
    p.set('agendamento_id', `in.(${validos.slice(i, i + 100).join(',')})`);
    saida.push(...await selecionar('tarefas', p));
  }
  return saida;
}

/** Quem está com a conversa de cada cliente/telefone (para "Reagendar"). */
export async function donosDasConversas({ clienteIds = [], telefones = [] } = {}) {
  const f = [];
  const ids = clienteIds.filter(ehUuid);
  if (ids.length) f.push(`cliente_id.in.(${ids.slice(0, 100).join(',')})`);
  const tels = [...new Set(telefones.map(telefoneNacional).filter((t) => t && t.length >= 10))].slice(0, 100);
  if (tels.length) f.push(`telefone_e164.in.(${tels.join(',')})`);
  if (!f.length) return [];
  const p = new URLSearchParams('select=id,cliente_id,telefone_e164,atribuida_a,ultima_mensagem_em');
  p.set('or', `(${f.join(',')})`);
  p.set('atribuida_a', 'not.is.null');
  p.set('order', 'ultima_mensagem_em.desc.nullslast');
  p.set('limit', '300');
  return selecionar(T.conversas, p).catch(() => []);
}

/** Gestores/admins ativos (quem recebe o que não tem dono). */
export async function gestoresAtivos() {
  return selecionar(T.perfis, 'select=id,nome,papel&ativo=is.true&papel=in.(admin,gestor)&order=papel.desc,created_at.asc')
    .catch(() => []);
}

/** Últimas ações registradas pela Agenda (tela do admin). */
export async function ultimasAuditorias(limite = 50) {
  return selecionar('auditoria', `select=id,perfil_id,app,acao,tabela,registro_id,detalhes,created_at&app=eq.agenda&order=created_at.desc&limit=${limite}`)
    .catch(() => []);
}

// ============================================================================
// RODADA 4 (14/10/2026) — valor ao concluir, consultor ligado ao login,
// pendências antigas e contagens baratas para o Início.
// ============================================================================

/* Teto de um valor de serviço digitado na tela: acima disso é erro de digitação
   (um zero a mais), não um serviço de verdade numa oficina. */
export const VALOR_MAXIMO = 200000;

/**
 * Função PURA (testada): o que a pessoa digitou no campo "Valor do serviço"
 * vira número. Aceita 350 · "350" · "350,50" · "1.234,56" · "R$ 1.234" ·
 * "1234.5". Vazio → null (concluir sem valor é permitido). Inválido → NaN.
 */
export function valorDeEntrada(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  if (typeof v !== 'string') return NaN;
  let t = v.replace(/R\$|\s/gi, '').trim();
  if (!t) return null;
  if (!/^[\d.,]+$/.test(t)) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');           // padrão BR: 1.234,56
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');          // 1.234 (milhar sem centavos)
  if ((t.match(/\./g) || []).length > 1) return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Valor aceito pelo servidor? null = sem valor (ok); número entre 0 e o teto. */
export function valorValido(n) {
  return n === null || (Number.isFinite(n) && n >= 0 && n <= VALOR_MAXIMO);
}

/** Mediana (ignora zero e lixo). */
function mediana(nums) {
  const l = nums.map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!l.length) return null;
  const m = Math.floor(l.length / 2);
  return Math.round((l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2) * 100) / 100;
}

/**
 * Função PURA (testada): a SUGESTÃO de valor quando alguém marca "Veio e
 * fechou". Só sugere — a pessoa confirma, troca ou deixa em branco.
 * Ordem (do mais confiável ao menos):
 *   1. orçamento do Orçador aprovado ligado a este horário/lead/cliente
 *   2. o valor que já está no agendamento
 *   3. o valor orçado do lead no CRM
 *   4. a mediana do que a oficina cobrou nos últimos serviços com o mesmo nome
 */
export function sugerirValor({ agendamento = {}, orcamentos = [], lead = null, historico = [] } = {}) {
  const totalOrc = (o) => (Number(o?.total_a_vista) > 0 ? Number(o.total_a_vista) : Number(o?.total) || 0);
  const orc = orcamentos.filter((o) => o && ['aprovado', 'fechado'].includes(o.status) && totalOrc(o) > 0)
    .sort((x, y) => String(y.decidido_em || y.updated_at || '').localeCompare(String(x.decidido_em || x.updated_at || '')))[0];
  if (orc) return { valor: Math.round(totalOrc(orc) * 100) / 100, fonte: 'orcamento', rotulo: orc.numero ? `orçamento nº ${orc.numero} aprovado` : 'orçamento aprovado' };
  if (Number(agendamento.valor) > 0) return { valor: Number(agendamento.valor), fonte: 'agendamento', rotulo: 'valor já anotado no horário' };
  if (Number(lead?.valor_orcado) > 0) return { valor: Number(lead.valor_orcado), fonte: 'lead', rotulo: 'valor orçado no CRM' };
  const alvo = semAcento(agendamento.servico);
  const parecidos = alvo ? historico.filter((h) => semAcento(h.servico) === alvo && h.id !== agendamento.id) : [];
  const med = mediana(parecidos.map((h) => h.valor));
  if (med) return { valor: med, fonte: 'historico', rotulo: `média de ${parecidos.length} ${parecidos.length === 1 ? 'serviço igual' : 'serviços iguais'}` };
  return { valor: null, fonte: null, rotulo: null };
}

/** Sugestão de valor lida do banco (orçamentos, lead, histórico do serviço). */
export async function valorSugerido(id) {
  const a = await obterAgendamento(id);
  if (!a) return null;
  const filtrosOrc = [`agendamento_id.eq.${a.id}`];
  if (ehUuid(a.lead_id)) filtrosOrc.push(`lead_id.eq.${a.lead_id}`);
  if (ehUuid(a.cliente_id)) filtrosOrc.push(`cliente_id.eq.${a.cliente_id}`);
  const p = new URLSearchParams('select=id,numero,status,total,total_a_vista,decidido_em,updated_at');
  p.set('or', `(${filtrosOrc.join(',')})`);
  p.set('order', 'updated_at.desc');
  p.set('limit', '5');
  const h = new URLSearchParams('select=id,servico,valor');
  h.set('status', 'eq.concluido'); h.set('valor', 'gt.0');
  h.set('servico', `ilike.${String(a.servico || '').replace(/[%*,()]/g, ' ').trim()}`);
  h.set('order', 'data.desc'); h.set('limit', '20');
  const [orcamentos, lead, historico] = await Promise.all([
    selecionar('orc_orcamentos', p).catch(() => []),
    ehUuid(a.lead_id) ? selecionarUm('leads', `select=id,valor_orcado,valor_pago,status&id=eq.${a.lead_id}`).catch(() => null) : null,
    a.servico ? selecionar(T.agendamentos, h).catch(() => []) : [],
  ]);
  return { ...sugerirValor({ agendamento: a, orcamentos, lead, historico }), atual: a.valor || 0 };
}

const SEL_SEM_VALOR = 'select=id,cliente_nome,telefone,servico,data,hora,status,valor,lead_id,cliente_id,consultor_id,veiculo,placa,origem,confirmado,compareceu,consultores(nome,cor)';

/** Concluídos sem valor (painel do gestor): os mais recentes primeiro. */
export async function concluidosSemValor({ dias = 120, limite = 200 } = {}) {
  const p = new URLSearchParams(SEL_SEM_VALOR);
  p.set('status', 'eq.concluido');
  p.set('valor', 'lte.0');
  p.set('data', `gte.${diasAntes(hoje(), dias)}`);
  p.set('order', 'data.desc,hora.desc');
  p.set('limit', String(Math.min(500, limite)));
  return (await selecionar(T.agendamentos, p)).map(lerAgendamento);
}

/** Só o número (chip do Início): HEAD + count, sem trazer linha nenhuma. */
export const contarConcluidosSemValor = (dias = 120) =>
  contar(T.agendamentos, `status=eq.concluido&valor=lte.0&data=gte.${diasAntes(hoje(), dias)}`);

/** Follow-up só contado (o selo do menu não precisa da lista inteira). */
export const contarFollowup = () => contar(T.agendamentos, 'or=(status.in.(nao_veio,nao_fechou),compareceu.is.false)');

/**
 * Preenche o valor de um serviço JÁ concluído (painel do gestor). O gatilho do
 * banco só copia agendamentos.valor para leads.valor_pago quando a SITUAÇÃO
 * muda; aqui a situação não muda — então o lead é atualizado junto, mas só se
 * ele está Concluído e ainda sem valor (ou com o valor antigo deste horário).
 */
export async function preencherValor(id, valor) {
  const a = await obterAgendamento(id);
  if (!a) return null;
  const antigo = Number(a.valor) || 0;
  const atualizado = await atualizarAgendamento(id, { valor });
  let lead = false;
  if (ehUuid(a.lead_id) && a.status === 'concluido') {
    const filtro = `id=eq.${a.lead_id}&status=eq.concluido&or=(valor_pago.is.null,valor_pago.eq.0${antigo > 0 ? `,valor_pago.eq.${antigo}` : ''})`;
    const linhas = await atualizar('leads', filtro, { valor_pago: valor }).catch(() => []);
    lead = linhas.length > 0;
  }
  return { agendamento: atualizado, lead_atualizado: lead, antes: antigo };
}

/**
 * Pendências antigas (gestor): horário que passou há mais de 7 dias e nunca
 * teve desfecho — chegou e ficou em "Compareceu"/"Em atendimento", ou ficou
 * "Aguardando"/"Confirmado". Some do Início (que olha 7 dias) e prende o lead
 * do CRM. Só LISTA: quem resolve é a pessoa, pelos botões de sempre.
 */
export async function pendenciasAntigas({ limite = 100 } = {}) {
  const p = new URLSearchParams(SEL_AGENDAMENTO);
  p.set('status', 'in.(compareceu,em_atendimento,aguardando,confirmado)');
  p.set('data', `lt.${diasAntes(hoje(), 7)}`);
  p.set('order', 'data.desc,hora.desc');
  p.set('limit', String(Math.min(300, limite)));
  return (await selecionar(T.agendamentos, p)).map(lerAgendamento);
}
export const contarPendenciasAntigas = () =>
  contar(T.agendamentos, `status=in.(compareceu,em_atendimento,aguardando,confirmado)&data=lt.${diasAntes(hoje(), 7)}`);

/* Palavras que não ajudam a achar quem é a pessoa ("Consultor Presencial Gabriel"). */
const PALAVRAS_DE_CARGO = new Set(['consultor', 'consultora', 'presencial', 'prensencial', 'atendente', 'recepcao', 'recepcionista',
  'vendedor', 'vendedora', 'gestor', 'gerente', 'tecnico', 'mecanico', 'de', 'da', 'do', 'dos', 'das']);
const nomesDe = (s) => semAcento(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PALAVRAS_DE_CARGO.has(p));

/**
 * Função PURA (testada): qual login provavelmente É este consultor. Compara os
 * nomes sem acento e sem as palavras de cargo; precisa de pelo menos um nome
 * em comum, e o primeiro nome do login vale um ponto a mais. Fica de fora só
 * quem já está ligado a outro consultor (o banco recusaria: índice único).
 * Empate de pontos → nenhuma sugestão (melhor não chutar).
 */
export function sugerirLoginDoConsultor(consultor, perfis = [], usados = new Set()) {
  if (!consultor || consultor.perfil_id) return null;
  const alvo = new Set(nomesDe(consultor.nome));
  if (!alvo.size) return null;
  const notas = perfis
    .filter((p) => p && p.id && !usados.has(p.id) && p.ativo !== false && p.ativo !== 0)
    .map((p) => {
      const nomes = nomesDe(p.nome);
      const comuns = nomes.filter((n) => alvo.has(n));
      const pontos = comuns.length * 2 + (nomes[0] && alvo.has(nomes[0]) ? 1 : 0);
      return { id: p.id, nome: p.nome, papel: p.papel, pontos };
    })
    .filter((p) => p.pontos > 0)
    .sort((x, y) => y.pontos - x.pontos);
  if (!notas.length || (notas[1] && notas[1].pontos === notas[0].pontos)) return null;
  return { perfil_id: notas[0].id, nome: notas[0].nome, papel: notas[0].papel };
}

/**
 * Função PURA (testada): distribui os horários SEM consultor de um dia entre
 * os consultores ativos — o de menor carga primeiro, sem pôr dois carros do
 * mesmo consultor na mesma meia hora (o índice agendamentos_slot_uk recusaria).
 * Devolve [{ id, consultor_id, consultor_nome }]; quem não coube fica de fora.
 */
export function distribuirSemConsultor({ consultores = [], agendamentos = [] } = {}) {
  const ativos = consultores.filter((c) => c.ativo !== 0 && c.ativo !== false);
  if (!ativos.length) return [];
  const janela = (hr) => { const m = minDe(hr); return m === null ? null : Math.floor(m / EXPEDIENTE.passo) * EXPEDIENTE.passo; };
  const vivos = agendamentos.filter((a) => a && STATUS_OCUPA.has(a.status));
  const carga = new Map(ativos.map((c) => [c.id, 0]));
  const ocupado = new Set();
  for (const a of vivos) {
    if (!a.consultor_id) continue;
    if (carga.has(a.consultor_id)) carga.set(a.consultor_id, carga.get(a.consultor_id) + 1);
    ocupado.add(`${a.consultor_id}|${a.data}|${janela(a.hora)}`);
  }
  const saida = [];
  const semCons = vivos.filter((a) => !a.consultor_id)
    .sort((x, y) => `${x.data} ${x.hora}`.localeCompare(`${y.data} ${y.hora}`));
  for (const a of semCons) {
    const livre = ativos
      .filter((c) => !ocupado.has(`${c.id}|${a.data}|${janela(a.hora)}`))
      .sort((x, y) => carga.get(x.id) - carga.get(y.id) || String(x.nome).localeCompare(String(y.nome), 'pt-BR'))[0];
    if (!livre) continue;
    carga.set(livre.id, carga.get(livre.id) + 1);
    ocupado.add(`${livre.id}|${a.data}|${janela(a.hora)}`);
    saida.push({ id: a.id, consultor_id: livre.id, consultor_nome: livre.nome });
  }
  return saida;
}

/** Horários vivos de uma data (para distribuir consultor). */
export async function agendamentosVivosDoDia(data) {
  const d = dataBanco(data);
  if (!d) return [];
  return (await selecionar(T.agendamentos,
    `select=id,data,hora,status,consultor_id,cliente_nome&data=eq.${d}&status=in.(aguardando,confirmado,compareceu,em_atendimento)&limit=500`))
    .map((r) => ({ ...r, hora: horaCurta(r.hora) }));
}

/* Preferências do perfil são COMPARTILHADAS pelos apps (mesma linha de `perfis`):
   grava as chaves da Agenda por cima das que já existem, sem apagar as dos
   outros apps. Função pura, testada. */
export function juntarPreferencias(atuais, novas) {
  const base = atuais && typeof atuais === 'object' && !Array.isArray(atuais) ? atuais : {};
  return { ...base, ...(novas && typeof novas === 'object' && !Array.isArray(novas) ? novas : {}) };
}
