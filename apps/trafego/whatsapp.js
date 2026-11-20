/* ============================================================
   WhatsApp — por onde a mensagem sai (rodada 5).

   O Ads NÃO fala mais com o CodeWords nem com a Cloud API: toda mensagem
   (relatório diário, alertas do radar, teste de canal) entra na FILA DO
   COMUNICAR (`posvenda_envios`, criado_por 'ads') e o carteiro do Comunicar
   entrega pelo aparelho da oficina, respeitando horário, tentativas e o
   opt-out (PARAR). Aqui fica só a normalização do número e a leitura da
   situação da fila para a tela de Ajustes.

   `enviar()` e `enviarParaTodos()` mantêm a assinatura antiga: quem chamava
   continua funcionando, mas "ok: true" agora quer dizer "entrou na fila".
   ============================================================ */
'use strict';

const db = require('./db');
const Fila = require('./fila');
const Eco = require('./public/ecossistema.js');

const LIMITE_TEXTO = Fila.LIMITE_CORPO;

/** 5512977771234 — só dígitos, com país. */
const normalizar = Eco.telefone;

/* Injetável nos testes (fila falsa). */
let filaAtual = null;
const fila = () => filaAtual || Fila.fila();
function usarFila(f) { filaAtual = f; }

/**
 * Põe a mensagem na fila do Comunicar para UM destino.
 * @returns {{via:'fila', id, duplicada}}
 */
async function enviar(destino, texto, { chave = null, perfil_id = null } = {}) {
  const para = normalizar(destino);
  if (!para) throw new Error('Número de destino vazio.');
  if (!String(texto || '').trim()) throw new Error('Mensagem vazia.');
  // A chave ganha o telefone: o mesmo relatório pode ir para dois números, mas nunca duas vezes para o mesmo.
  const r = await fila().enfileirar({ telefone: para, corpo: String(texto).slice(0, LIMITE_TEXTO), chave: chave ? `${chave}:${para}` : null, perfil_id });
  return { via: 'fila', id: r.id, duplicada: r.duplicada, enviar_em: r.enviar_em };
}

/** Vários destinos; um número ruim não impede os outros. */
async function enviarParaTodos(destinos, texto, opcoes = {}) {
  const saida = [];
  for (const d of destinos || []) {
    try { const r = await enviar(d, texto, opcoes); saida.push({ destino: normalizar(d), ok: true, via: 'fila', id: r.id, duplicada: r.duplicada }); }
    catch (e) { saida.push({ destino: normalizar(d), ok: false, erro: e.message }); }
  }
  return saida;
}

/* ------------------------------------------------------------
   Situação do canal — só leitura (tela de Ajustes)
   ------------------------------------------------------------ */
let cacheStatus = { valor: null, em: 0 };
function limparCache() { cacheStatus = { valor: null, em: 0 }; }

/** Traduz o problema do vigia para a frase da tela (o mesmo vocabulário do Atendimento). */
const PROBLEMAS_CANAL = {
  'codewords-chave-recusada': 'chave do CodeWords recusada (401): gere uma chave nova e cole em Atendimento › Integrações; a fila guarda as mensagens até lá',
  'codewords-fora': 'o CodeWords (que leva as mensagens) não está respondendo; a fila guarda as mensagens até voltar',
  'whatsapp-desconectado': 'aparelho do WhatsApp desconectado: reconecte em Atendimento › Integrações',
  'whatsapp-sem-config': 'WhatsApp sem chave ou aparelho em Atendimento › Integrações',
  'whatsapp-sem-receber': 'o WhatsApp está conectado mas não recebe: religue o fluxo em Atendimento › Integrações',
  'comunicar-fora': 'o Comunicar (carteiro da fila) está fora do ar',
  'comunicar-carteiro-parado': 'o carteiro do Comunicar parou: as mensagens ficam na fila até ele voltar',
  'comunicar-fila-parada': 'a fila do Comunicar está parada (mensagens vencidas sem sair)',
};

async function status({ fresco = false, deps = {} } = {}) {
  if (!fresco && cacheStatus.valor && Date.now() - cacheStatus.em < 60_000) return cacheStatus.valor;
  const F = deps.fila || fila();
  const lerVigia = deps.lerVigia || (() => db.lerVigia({ fresco }));
  const [vigia, situacao] = await Promise.all([lerVigia().catch(() => null), F.situacao().catch(e => ({ erro: e.message }))]);
  const problema = vigia?.problema || null;
  const saida = {
    via: 'fila do Comunicar',
    fila: situacao.erro ? { erro: situacao.erro } : situacao,
    canal: {
      conectado: !problema || !PROBLEMAS_CANAL[problema],
      problema, erro: problema && PROBLEMAS_CANAL[problema] ? PROBLEMAS_CANAL[problema] : null,
      checado_em: vigia?.checado_em || null,
    },
    pronto: !(problema && PROBLEMAS_CANAL[problema]) && !situacao.erro,
    conferido_em: new Date().toISOString(),
  };
  cacheStatus = { valor: saida, em: Date.now() };
  return saida;
}

module.exports = { enviar, enviarParaTodos, normalizar, status, limparCache, usarFila, LIMITE_TEXTO, PROBLEMAS_CANAL };
