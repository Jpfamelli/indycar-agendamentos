/* ============================================================
   Registro (log) do servidor — rodada 8, frente T2a.

   Perguntas que isto precisa responder quando algo dá errado em produção:
     1. A tela ficou lenta: qual pedido foi, e qual leitura demorou?
     2. Deu erro numa rota: em que etapa, com que tipo de erro?
     3. É o mesmo pedido que a Central registrou? (mesmo identificador)

   O que sai no log:
     - a linha de sempre por pedido (método, caminho, status, tempo), agora
       com o identificador do pedido no fim;
     - "pedido_lento" (JSON, uma linha) quando o pedido passa de 1 s, com o
       tempo de cada etapa;
     - "erro_pedido" (JSON, uma linha) com rota, etapa e tipo do erro.
   Nunca vai para o log: telefone, e-mail, CPF, chave, texto de cliente,
   corpo do pedido nem a consulta do endereço (?q=…).
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

const APP = 'trafego';
const LIMITE_LENTO_MS = 1000;
const ID_VALIDO = /^[A-Za-z0-9._-]{6,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identificador do pedido. A Central já escolhe um e o põe no cabeçalho da RESPOSTA antes de
 * entregar o pedido ao app: vale esse. Com o app sozinho, vale o x-request-id do pedido (se for
 * curto e simples) ou um novo. A resposta sempre leva o identificador.
 */
function idDoPedido(req, res) {
  const daResposta = String((res && res.getHeader && res.getHeader('x-request-id')) || '');
  if (ID_VALIDO.test(daResposta)) return daResposta;
  const doPedido = String((req && req.headers && req.headers['x-request-id']) || '');
  const id = ID_VALIDO.test(doPedido) ? doPedido : crypto.randomUUID();
  try { res.setHeader('X-Request-Id', id); } catch { /* resposta já enviada */ }
  return id;
}

/** Tira do texto o que não pode ir para o log (e-mail, CPF, chave, número comprido) e corta em 400 caracteres. */
function limpar(texto) {
  if (texto == null) return '';
  return String(texto).slice(0, 2000)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}/g, '«email»')
    .replace(/[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}/g, '«cpf»')
    .replace(/[A-Za-z0-9_-]{24,}/g, m => (UUID.test(m) ? m : '«chave»'))
    .replace(/[0-9]{8,}/g, '«número»')
    .slice(0, 400);
}

const limparValor = v => {
  if (typeof v === 'string') return limpar(v);
  if (Array.isArray(v)) return v.slice(0, 20).map(limparValor);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => [k, limparValor(x)]));
  return typeof v === 'number' && !Number.isFinite(v) ? null : v;
};

/**
 * Escreve UM evento em uma linha de JSON: { evento, app, nivel, quando, ...campos }.
 * Campo vazio não entra; texto passa pela limpeza. `saida.escrever` existe para o teste ler a linha.
 */
function evento(nivel, nome, campos = {}, saida = {}) {
  const linha = { evento: nome, app: APP, nivel, quando: new Date().toISOString() };
  for (const [k, v] of Object.entries(campos || {})) {
    if (v == null) continue;
    linha[k] = limparValor(v);
  }
  const texto = JSON.stringify(linha);
  if (saida.escrever) saida.escrever(texto);
  else if (nivel === 'error') console.error(texto);
  else if (nivel === 'warn') console.warn(texto);
  else console.log(texto);
  return linha;
}

/** Caminho do pedido para o log: identificador (número, uuid, nome de campanha capturado pela rota) vira ":id". */
function rotaDoLog(caminho, capturas = []) {
  const trocar = new Set((capturas || []).filter(c => typeof c === 'string' && c && !/^[a-z_]{1,12}$/.test(c)));
  return String(caminho || '').split('/').map(parte => {
    let p = parte;
    try { p = decodeURIComponent(parte); } catch { /* fica como veio */ }
    if (trocar.has(p) || trocar.has(parte)) return ':id';
    if (/^[0-9]+$/.test(p) || UUID.test(p)) return ':id';
    return parte.length > 60 ? ':id' : parte;
  }).join('/');
}

/**
 * Acompanha um pedido: tempo de cada etapa (leitura do banco, montagem) e os resumos para o log.
 * `medir(nome, fn)` roda a etapa e devolve o resultado dela; `marcar` registra uma etapa já medida.
 */
function criarPedido({ id, metodo = 'GET', rota = '', entrada = 'http', relogio = () => performance.now() } = {}) {
  const lista = [];
  const pedido = {
    id, metodo, rota, entrada,
    definirRota(r) { pedido.rota = r; },
    marcar(nome, ms, extra = {}) { lista.push({ nome, ms: Math.max(0, Math.round(ms)), ...extra }); },
    async medir(nome, fn) {
      const inicio = relogio();
      try { const v = await fn(); pedido.marcar(nome, relogio() - inicio); return v; }
      catch (e) { pedido.marcar(nome, relogio() - inicio, { falhou: true }); throw e; }
    },
    etapas: () => lista.map(e => ({ ...e })),
    /** Só descreve o pedido quando ele passou de 1 s: da etapa mais demorada para a menos. */
    resumoSeLento({ status, ms }) {
      if (!(ms >= LIMITE_LENTO_MS)) return null;
      const etapas = lista.filter(e => e.ms >= 1).sort((a, b) => b.ms - a.ms).slice(0, 8).map(e => ({ ...e }));
      return { evento: 'pedido_lento', campos: { id: pedido.id, entrada: pedido.entrada, metodo: pedido.metodo, rota: pedido.rota, status, ms: Math.round(ms), etapas } };
    },
    /** Erro com contexto: rota, etapa que falhou, tipo e código do erro. A frase passa pela limpeza. */
    resumoDoErro(e, { status, quem } = {}) {
      const falhou = lista.find(x => x.falhou);
      const pilha = status >= 500 && e && e.stack ? String(e.stack).split('\n').slice(1, 4).map(l => l.trim().replace(/^at /, '')) : null;
      return { evento: 'erro_pedido', campos: limparValor({
        id: pedido.id, entrada: pedido.entrada, metodo: pedido.metodo, rota: pedido.rota, status,
        tipo: e && e.name ? e.name : 'Error', codigo: e && e.code != null ? String(e.code) : null,
        erro: e ? e.message : null, etapa: falhou ? falhou.nome : null, quem: quem || null, pilha,
      }) };
    },
  };
  return pedido;
}

module.exports = { APP, LIMITE_LENTO_MS, idDoPedido, limpar, evento, rotaDoLog, criarPedido };
