/* ============================================================
   Auditoria da porta da IA (rodada 8, frente T5a) — uma linha em ia_acoes por chamada de ferramenta.

   origem = 'trafego' · tipo = 'porta:<ferramenta>' · status = executada | proposta | erro
   entrada = os argumentos (só valores curtos) + id e nome da chave + a porta (mcp | rest | gestor). Nunca a chave.
   saida   = só contagens e tamanho (quantos itens em cada lista, bytes), nunca o conteúdo.
   Falha ao auditar não derruba a resposta: vai para o log (sem dado de cliente).
   ============================================================ */
'use strict';

const Registro = require('../registro');

const MAX_TEXTO = 200;
const MAX_CAMPOS = 20;

/** Argumentos que podem ir para a auditoria: escalares curtos; objeto e lista viram só o tamanho. */
function argsParaAuditoria(args) {
  const saida = {};
  if (!args || typeof args !== 'object') return saida;
  for (const [k, v] of Object.entries(args).slice(0, MAX_CAMPOS)) {
    if (v == null || typeof v === 'number' || typeof v === 'boolean') saida[k] = v;
    else if (typeof v === 'string') saida[k] = Registro.limpar(v).slice(0, MAX_TEXTO);
    else if (Array.isArray(v)) saida[k] = { lista: v.length };
    else if (typeof v === 'object') saida[k] = { campos: Object.keys(v).length };
  }
  return saida;
}

/** O que sai da ferramenta, só em números: { bytes, listas: { itens: 20, … }, cortado }. */
function resumoDaSaida(obj) {
  if (obj == null) return null;
  let bytes = null;
  try { bytes = Buffer.byteLength(JSON.stringify(obj)); } catch { bytes = null; }
  const listas = {};
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) if (Array.isArray(v)) listas[k] = v.length;
  }
  return { bytes, listas, cortado: !!(obj && obj.cortado) };
}

/**
 * Cria o auditor. Opções (para teste): sb, agora.
 * registrar({ ferramenta, status, args, chave, porta, saida, erro, duracao_ms, resumo }) → Promise<boolean> (nunca rejeita).
 */
function criarAuditoria(opcoes = {}) {
  const cfg = { sb: null, agora: Date.now, ...opcoes };
  const banco = () => cfg.sb || require('../db').sb;

  async function registrar({ ferramenta, status = 'executada', args = {}, chave = null, porta = null, saida = null, erro = null, duracao_ms = null, resumo = null } = {}) {
    const linha = {
      origem: 'trafego',
      tipo: `porta:${String(ferramenta || 'desconhecida').slice(0, 40)}`,
      status,
      resumo: resumo ? Registro.limpar(String(resumo)).slice(0, 300) : null,
      entrada: { args: argsParaAuditoria(args), chave: chave ? { id: chave.id || null, nome: chave.nome || null } : null, porta },
      saida: resumoDaSaida(saida),
      erro: erro ? Registro.limpar(String(erro)).slice(0, 300) : null,
      duracao_ms: Number.isFinite(duracao_ms) ? Math.round(duracao_ms) : null,
      executada_em: status === 'executada' ? new Date(cfg.agora()).toISOString() : null,
    };
    try {
      const { error } = await banco().from('ia_acoes').insert(linha);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return true;
    } catch (e) {
      Registro.evento('warn', 'ia_auditoria_falhou', { ferramenta: linha.tipo, status, erro: Registro.limpar(e && e.message), codigo: (e && e.code) || null });
      return false;
    }
  }

  return { registrar, trocar(novas = {}) { Object.assign(cfg, novas); } };
}

let _padrao = null;
const padrao = () => (_padrao || (_padrao = criarAuditoria()));

module.exports = { argsParaAuditoria, resumoDaSaida, criarAuditoria, padrao };
