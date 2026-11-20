/* ============================================================
   Chaves da IA de fora (rodada 8, frente T5a) — tabela trafego_ia_chaves.

   - Formato: "ica_" + 40 caracteres aleatórios do alfabeto base 62 (sorteio sem viés).
   - No banco fica só o SHA-256 em hexadecimal e o prefixo (8 primeiros caracteres, "ica_" + 4).
     A chave em claro existe uma única vez: na resposta de criar().
   - Conferência: o hash do que chegou é procurado no banco (índice único) e comparado de novo com
     crypto.timingSafeEqual, em tempo constante. Formato errado nem chega ao banco.
   - Memória de no máximo 30 s por hash (inclusive a resposta "não existe"): revogar por aqui apaga a
     memória na hora; revogado por outro processo vale em até 30 s.
   - Uso (ultimo_uso_em, usos) é gravado depois da resposta, em lote, no máximo uma escrita por chave a
     cada 10 s. Falha ao gravar o uso vai para o log e não derruba nada.
   - Limite por chave: 120 chamadas por minuto e 5.000 por dia (dia de Brasília).
   - Sem a migração (tabela inexistente): conferir() devolve { motivo: 'indisponivel' } e a rota responde 503.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');
const Registro = require('../registro');

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TAMANHO = 40;
const PREFIXO = 'ica_';
const FORMATO = /^ica_[A-Za-z0-9]{40}$/;
const PARECE_CHAVE = /ica_[A-Za-z0-9]{20,}/;
const ESCOPOS = ['ler', 'propor'];
const MEMORIA_MS = 30_000;
const USO_A_CADA_MS = 10_000;
const POR_MINUTO = 120;
const POR_DIA = 5000;
const COLUNAS = 'id, nome, prefixo, escopos, ver_pii, criada_por, criada_em, ultimo_uso_em, usos, revogada_em';
const SEM_TABELA = 'As chaves da IA ainda não existem no banco: falta aplicar a atualização do IndyCar Tráfego (r8_trafego_v1).';

const tabelaAusente = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .* does not exist/i.test(String(e.message || '')));

class ErroDeChave extends Error {
  constructor(status, mensagem, codigo) { super(mensagem); this.status = status; this.publico = true; this.codigo = codigo; this.extra = { codigo }; }
}

/** Sorteia uma chave nova: "ica_" + 40 caracteres base 62, sem viés (descarta bytes >= 248). */
function gerarChave() {
  let saida = '';
  while (saida.length < TAMANHO) {
    for (const b of crypto.randomBytes(64)) {
      if (b >= 248) continue;                 // 248 = 62 × 4: o resto fica uniforme
      saida += ALFABETO[b % 62];
      if (saida.length === TAMANHO) break;
    }
  }
  return PREFIXO + saida;
}

const hashDe = chave => crypto.createHash('sha256').update(String(chave), 'utf8').digest('hex');
const formatoValido = s => typeof s === 'string' && FORMATO.test(s);

/** Compara dois hashes hexadecimais de 64 caracteres em tempo constante. */
function mesmoHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) return false;
  const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex');
  if (ba.length !== 32 || bb.length !== 32) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** A chave que veio no cabeçalho Authorization: { chave } | { erro: 'sem_chave' | 'formato' }. */
function chaveDoCabecalho(req) {
  const bruto = String((req && req.headers && req.headers.authorization) || '').trim();
  if (!bruto) return { erro: 'sem_chave' };
  const m = /^Bearer\s+(\S+)$/i.exec(bruto);
  if (!m) return { erro: 'formato' };
  return formatoValido(m[1]) ? { chave: m[1] } : { erro: 'formato' };
}

/** A URL traz chave? (?chave=, ?key=, ?token=… ou qualquer valor com cara de chave ica_). */
function chaveNaUrl(q) {
  if (!q) return false;
  for (const [k, v] of q) {
    if (/^(chave|key|api_key|apikey|token|access_token|bearer|authorization)$/i.test(k)) return true;
    if (PARECE_CHAVE.test(String(v)) || PARECE_CHAVE.test(String(k))) return true;
  }
  return false;
}

/** Valida o pedido de criação: { nome, escopos, ver_pii }. */
function validarNova(dados = {}) {
  const nome = String(dados.nome == null ? '' : dados.nome).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nome.length < 2 || nome.length > 60) throw new ErroDeChave(422, 'Dê um nome à chave (de 2 a 60 letras), por exemplo "Claude Code do João".', 'nome');
  let escopos = dados.escopos == null ? ['ler'] : dados.escopos;
  if (typeof escopos === 'string') escopos = escopos.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(escopos) || !escopos.length || escopos.some(e => !ESCOPOS.includes(e))) {
    throw new ErroDeChave(422, 'Escolha o que a chave pode fazer: "ler" e, se quiser, "propor".', 'escopos');
  }
  escopos = ESCOPOS.filter(e => escopos.includes(e) || e === 'ler');   // quem propõe também lê (a proposta precisa de evidência)
  if (dados.ver_pii != null && typeof dados.ver_pii !== 'boolean') throw new ErroDeChave(422, 'ver_pii é sim ou não (true ou false).', 'ver_pii');
  return { nome, escopos, ver_pii: dados.ver_pii === true };
}

/** O registro que pode sair (nunca o hash). */
function publico(l) {
  if (!l) return null;
  return {
    id: l.id, nome: l.nome, prefixo: l.prefixo, escopos: Array.isArray(l.escopos) ? l.escopos : [], ver_pii: l.ver_pii === true,
    criada_por: l.criada_por || null, criada_em: l.criada_em || null, ultimo_uso_em: l.ultimo_uso_em || null,
    usos: Number(l.usos) || 0, revogada_em: l.revogada_em || null, ativa: !l.revogada_em,
  };
}

/** Início do próximo dia de Brasília (UTC-3, sem horário de verão). */
function proximaMeiaNoiteBR(agora) {
  const dia = Math.floor((agora - 3 * 3_600_000) / 86_400_000);
  return (dia + 1) * 86_400_000 + 3 * 3_600_000;
}
const diaBR = agora => new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Cria o guardião das chaves. Opções (para teste): sb (cliente do Supabase), agora (função), memoriaMs,
 * usoACadaMs, porMinuto, porDia. Sem sb, usa o banco do app (lido na hora, para o teste poder trocar db.sb).
 */
function criarChaves(opcoes = {}) {
  const cfg = { sb: null, agora: Date.now, memoriaMs: MEMORIA_MS, usoACadaMs: USO_A_CADA_MS, porMinuto: POR_MINUTO, porDia: POR_DIA, ...opcoes };
  const banco = () => cfg.sb || require('../db').sb;
  const memoria = new Map();      // hash -> { em, linha | null }
  const contagem = new Map();     // id -> { minuto, nMinuto, dia, nDia }
  const usos = new Map();         // id -> { n, ultimo }
  const gravadoEm = new Map();    // id -> instante da última escrita de uso
  let timer = null;

  async function criar(dados, { criada_por = null } = {}) {
    const v = validarNova(dados);
    const chave = gerarChave();
    const linha = { id: crypto.randomUUID(), nome: v.nome, prefixo: chave.slice(0, 8), hash: hashDe(chave), escopos: v.escopos, ver_pii: v.ver_pii, criada_por: criada_por || null };
    let r = await banco().from('trafego_ia_chaves').insert(linha).select(COLUNAS).single();
    // quem cria pode não estar em perfis (chave estrangeira): grava sem o autor em vez de falhar
    if (r.error && r.error.code === '23503' && linha.criada_por) r = await banco().from('trafego_ia_chaves').insert({ ...linha, criada_por: null }).select(COLUNAS).single();
    if (r.error) {
      if (tabelaAusente(r.error)) throw new ErroDeChave(503, SEM_TABELA, 'sem_migracao');
      throw Object.assign(new Error('Não foi possível criar a chave agora. Tente de novo em instantes.'), { status: 503, publico: true, causa: r.error.code || null });
    }
    return { chave, registro: publico(r.data) };
  }

  async function listar() {
    const { data, error } = await banco().from('trafego_ia_chaves').select(COLUNAS).order('criada_em', { ascending: false }).limit(200);
    if (error) {
      if (tabelaAusente(error)) return { ligado: false, aviso: SEM_TABELA, chaves: [] };
      throw Object.assign(new Error('Não foi possível ler as chaves agora. Tente de novo em instantes.'), { status: 503, publico: true });
    }
    return { ligado: true, aviso: null, chaves: (data || []).map(publico) };
  }

  /** Revoga já (e esquece a memória). Devolve { registro, ja_estava }, ou null se não existe. Revogar de novo não muda a data. */
  async function revogar(id) {
    const agoraIso = new Date(cfg.agora()).toISOString();
    const { data, error } = await banco().from('trafego_ia_chaves').update({ revogada_em: agoraIso }).eq('id', id).is('revogada_em', null).select(COLUNAS);
    if (error) {
      if (tabelaAusente(error)) throw new ErroDeChave(503, SEM_TABELA, 'sem_migracao');
      throw Object.assign(new Error('Não foi possível revogar a chave agora. Tente de novo em instantes.'), { status: 503, publico: true });
    }
    for (const [h, m] of memoria) if (m.linha && m.linha.id === id) memoria.delete(h);
    if (data && data[0]) return { registro: publico(data[0]), ja_estava: false };
    const atual = await banco().from('trafego_ia_chaves').select(COLUNAS).eq('id', id).maybeSingle();
    if (atual.error || !atual.data) return null;
    return { registro: publico(atual.data), ja_estava: true };
  }

  /**
   * Confere a chave em claro. Devolve:
   *   { ok: true, chave: { id, nome, prefixo, escopos, ver_pii } }
   *   { ok: false, motivo: 'formato' | 'nao_existe' | 'revogada' }
   *   { ok: false, motivo: 'indisponivel', aviso, sem_tabela }   (tabela não existe ou banco fora)
   */
  async function conferir(chave) {
    if (!formatoValido(chave)) return { ok: false, motivo: 'formato' };
    const h = hashDe(chave), t = cfg.agora();
    let m = memoria.get(h);
    if (!m || t - m.em >= cfg.memoriaMs) {
      const { data, error } = await banco().from('trafego_ia_chaves').select(`${COLUNAS}, hash`).eq('hash', h).maybeSingle();
      if (error) return { ok: false, motivo: 'indisponivel', sem_tabela: tabelaAusente(error), aviso: tabelaAusente(error) ? SEM_TABELA : 'Não deu para conferir a chave agora. Tente de novo em instantes.' };
      m = { em: t, linha: data || null };
      memoria.set(h, m);
      if (memoria.size > 1000) for (const [k, v] of memoria) if (t - v.em >= cfg.memoriaMs) memoria.delete(k);
    }
    const l = m.linha;
    if (!l || !mesmoHash(l.hash, h)) return { ok: false, motivo: 'nao_existe' };
    if (l.revogada_em) return { ok: false, motivo: 'revogada' };
    return { ok: true, chave: { id: l.id, nome: l.nome, prefixo: l.prefixo, escopos: Array.isArray(l.escopos) ? l.escopos : ['ler'], ver_pii: l.ver_pii === true } };
  }

  /** Conta uma chamada da chave. { ok } ou { ok: false, esperar (s), motivo: 'minuto' | 'dia' }. */
  function limitar(id) {
    const t = cfg.agora(), minuto = Math.floor(t / 60_000), dia = diaBR(t);
    let c = contagem.get(id);
    if (!c) { c = { minuto, nMinuto: 0, dia, nDia: 0 }; contagem.set(id, c); }
    if (c.minuto !== minuto) { c.minuto = minuto; c.nMinuto = 0; }
    if (c.dia !== dia) { c.dia = dia; c.nDia = 0; }
    if (c.nDia >= cfg.porDia) return { ok: false, motivo: 'dia', esperar: Math.max(1, Math.ceil((proximaMeiaNoiteBR(t) - t) / 1000)) };
    if (c.nMinuto >= cfg.porMinuto) return { ok: false, motivo: 'minuto', esperar: Math.max(1, Math.ceil(((minuto + 1) * 60_000 - t) / 1000)) };
    c.nMinuto++; c.nDia++;
    return { ok: true };
  }

  /** Anota o uso. A escrita sai depois, em lote, sem travar a resposta. */
  function registrarUso(id) {
    const u = usos.get(id) || { n: 0, ultimo: 0 };
    u.n++; u.ultimo = cfg.agora();
    usos.set(id, u);
    if (timer) return;
    const espera = Math.max(0, cfg.usoACadaMs - (cfg.agora() - (gravadoEm.get(id) || 0)));
    timer = setTimeout(() => { timer = null; descarregar().catch(() => {}); }, espera);
    if (timer.unref) timer.unref();
  }

  /** Grava agora o uso pendente (o teste chama direto). Uma gravação por vez: ler e somar não pode cruzar com outra. */
  let fila = Promise.resolve();
  function descarregar() {
    if (timer) { clearTimeout(timer); timer = null; }
    fila = fila.then(gravarPendentes, gravarPendentes);
    return fila;
  }
  async function gravarPendentes() {
    const pendentes = [...usos.entries()];
    usos.clear();
    for (const [id, u] of pendentes) {
      gravadoEm.set(id, cfg.agora());
      try {
        const atual = await banco().from('trafego_ia_chaves').select('usos').eq('id', id).maybeSingle();
        if (atual.error) throw atual.error;
        const total = (Number(atual.data && atual.data.usos) || 0) + u.n;
        const { error } = await banco().from('trafego_ia_chaves').update({ usos: total, ultimo_uso_em: new Date(u.ultimo).toISOString() }).eq('id', id);
        if (error) throw error;
      } catch (e) {
        Registro.evento('warn', 'ia_chave_uso_nao_gravado', { chave_id: id, erro: Registro.limpar(e && e.message), codigo: (e && e.code) || null });
      }
    }
  }

  return {
    criar, listar, revogar, conferir, limitar, registrarUso, descarregar,
    esquecer() { memoria.clear(); contagem.clear(); },
    trocar(novas = {}) { Object.assign(cfg, novas); memoria.clear(); contagem.clear(); usos.clear(); gravadoEm.clear(); if (timer) { clearTimeout(timer); timer = null; } },
  };
}

let _padrao = null;
const padrao = () => (_padrao || (_padrao = criarChaves()));

const { ipDe, criarLimitador } = require('../seguranca');
const MAX_ERRADAS = 20, JANELA_ERRADAS_MS = 10 * 60_000;
const tentativas = criarLimitador();

const ENSINA = 'Envie a chave no cabeçalho "Authorization: Bearer ica_…" (crie a chave em Ajustes › Chaves da IA).';

/**
 * A porta (REST ou MCP) confere quem chama. Devolve { ok: true, chave } ou
 * { ok: false, status, codigo, mensagem, cabecalhos } — a porta escreve a resposta no formato dela.
 * Ordem: chave na URL (400) → sem chave (401) → chave que não confere (401) → banco sem a tabela (503) → limite (429).
 */
async function autenticar(req, q, chaves = padrao()) {
  if (chaveNaUrl(q)) {
    return { ok: false, status: 400, codigo: 'chave_na_url', cabecalhos: {},
      mensagem: `Não mande a chave no endereço: ela fica gravada em histórico e em log. ${ENSINA} Se a chave já foi para algum endereço, revogue e crie outra.` };
  }
  const veio = chaveDoCabecalho(req);
  if (veio.erro === 'sem_chave') return { ok: false, status: 401, codigo: 'sem_chave', mensagem: `Falta a chave. ${ENSINA}`, cabecalhos: { 'WWW-Authenticate': 'Bearer realm="indycar-trafego"' } };
  /* Rodada 10: vinte chaves erradas do mesmo endereço em 10 minutos fecham a porta para ele até a janela acabar,
     sem nem perguntar ao banco (cada chave errada era uma consulta). Chave certa não conta. */
  const doIp = `ia-chave-errada|${ipDe(req)}`;
  const visto = tentativas.espiar(doIp, JANELA_ERRADAS_MS);
  if (visto.n >= MAX_ERRADAS) {
    return { ok: false, status: 429, codigo: 'limite', cabecalhos: { 'Retry-After': String(visto.esperar) },
      mensagem: `Muitas chaves erradas seguidas deste endereço. Espere ${Math.max(1, Math.ceil(visto.esperar / 60))} min e confira a chave em Ajustes › Chaves da IA.` };
  }
  const errou = () => { tentativas.permitir(doIp, MAX_ERRADAS, JANELA_ERRADAS_MS); };
  if (veio.erro) { errou(); return { ok: false, status: 401, codigo: 'chave_invalida', mensagem: `Chave em formato errado. ${ENSINA}`, cabecalhos: { 'WWW-Authenticate': 'Bearer realm="indycar-trafego", error="invalid_token"' } }; }
  const r = await chaves.conferir(veio.chave);
  if (!r.ok && r.motivo === 'indisponivel') return { ok: false, status: 503, codigo: r.sem_tabela ? 'sem_migracao' : 'indisponivel', mensagem: r.aviso, cabecalhos: { 'Retry-After': '30' } };
  if (!r.ok) { errou(); return { ok: false, status: 401, codigo: 'chave_invalida', mensagem: 'Chave inválida ou revogada. Peça uma chave nova ao administrador (Ajustes › Chaves da IA).', cabecalhos: { 'WWW-Authenticate': 'Bearer realm="indycar-trafego", error="invalid_token"' } }; }
  const lim = chaves.limitar(r.chave.id);
  if (!lim.ok) {
    return { ok: false, status: 429, codigo: 'limite', cabecalhos: { 'Retry-After': String(lim.esperar) },
      mensagem: lim.motivo === 'dia' ? `Esta chave passou de ${POR_DIA} chamadas hoje. Volta a funcionar à meia-noite (horário de Brasília).` : `Muitas chamadas seguidas (${POR_MINUTO} por minuto). Espere ${lim.esperar} s.` };
  }
  chaves.registrarUso(r.chave.id);
  return { ok: true, chave: r.chave };
}

module.exports = {
  ALFABETO, TAMANHO, FORMATO, ESCOPOS, MEMORIA_MS, POR_MINUTO, POR_DIA, SEM_TABELA,
  ErroDeChave, gerarChave, hashDe, formatoValido, mesmoHash, chaveDoCabecalho, chaveNaUrl, validarNova, publico, proximaMeiaNoiteBR,
  tabelaAusente, criarChaves, padrao, autenticar, tentativas, MAX_ERRADAS,
};
