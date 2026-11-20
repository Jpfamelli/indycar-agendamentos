/* ============================================================
   Segurança do servidor — padrão do ecossistema IndyCar:
   cabeçalhos (CSP, HSTS, Permissions-Policy…), CORS só para os
   domínios da casa, limite por IP/usuário e mensagens de erro sem
   detalhes internos.
   ============================================================ */
'use strict';

/* A tela só carrega coisas daqui e fala com o banco da casa.
   Rodada 10: connect-src leva só o endereço do projeto do Supabase (SUPABASE_URL), não mais qualquer *.supabase.co
   (um projeto de outra pessoa também é *.supabase.co), e sem wss: a tela nova não usa canal em tempo real.
   Sem endereço https configurado (desenvolvimento), vale o padrão antigo. */
function cspPara(urlDoSupabase, { tempoReal = false } = {}) {
  let banco = 'https://*.supabase.co';
  try {
    const u = new URL(String(urlDoSupabase || ''));
    if (u.protocol === 'https:' && u.hostname && !u.username && !u.password) banco = u.origin;
  } catch { /* fica o padrão */ }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // style="width:…" das barras e gráficos (atributo, não <style> injetável)
    "style-src-attr 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    // a tela antiga (religada por TRAFEGO_TELA_ANTIGA=1) ouve o sino em tempo real: só aí entra o wss, e só do mesmo endereço
    "connect-src 'self' " + banco + (tempoReal ? ' ' + banco.replace(/^https:/, 'wss:') : ''),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
const CSP = cspPara(process.env.SUPABASE_URL, { tempoReal: process.env.TRAFEGO_TELA_ANTIGA === '1' });

const PERMISSOES = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()';

function cabecalhos(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', PERMISSOES);
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

/* ---------------- CORS ---------------- */
// Rodada 8: a lista de origens mora no servidor (enderecos.js), não na pasta de tela.
const ORIGENS = new Set(require('./enderecos').origens());
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** A origem pode chamar a API? Sem Origin (curl, mesma aba GET) ou mesma origem = sim. */
function origemPermitida(origem, host) {
  if (!origem) return true;
  try { if (new URL(origem).host === host) return true; } catch { return false; }
  return ORIGENS.has(origem) || LOCAL.test(origem);
}

/** Aplica CORS. Devolve false se a origem não é da casa (a rota responde 403). */
function cors(req, res) {
  const origem = req.headers.origin;
  if (!origemPermitida(origem, req.headers.host)) return false;
  if (origem) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  return true;
}

/* ---------------- limite por IP / usuário ---------------- */
const MAX_BALDES = 10000;
function criarLimitador() {
  const baldes = new Map();   // chave -> { n, inicio, janela }
  function faxina(agora) {
    for (const [k, v] of baldes) if (agora - v.inicio >= v.janela) baldes.delete(k);
    // ainda cheio (muitos endereços dentro da janela): solta os mais antigos até a metade
    if (baldes.size > MAX_BALDES / 2) for (const k of baldes.keys()) { baldes.delete(k); if (baldes.size <= MAX_BALDES / 2) break; }
  }
  function permitir(chave, max, janelaMs, agora = Date.now()) {
    let b = baldes.get(chave);
    if (!b || agora - b.inicio >= janelaMs) {
      if (!b && baldes.size >= MAX_BALDES) faxina(agora);
      b = { n: 0, inicio: agora, janela: janelaMs }; baldes.delete(chave); baldes.set(chave, b);
    }
    b.n++;
    return b.n <= max ? { ok: true } : { ok: false, esperar: Math.ceil((b.inicio + janelaMs - agora) / 1000) };
  }
  /** Só olha (não conta): quantas vezes a chave já bateu na janela e quanto falta para ela zerar. */
  function espiar(chave, janelaMs, agora = Date.now()) {
    const b = baldes.get(chave);
    if (!b || agora - b.inicio >= janelaMs) return { n: 0, esperar: 0 };
    return { n: b.n, esperar: Math.max(1, Math.ceil((b.inicio + janelaMs - agora) / 1000)) };
  }
  return { permitir, espiar, limpar: () => baldes.clear(), tamanho: () => baldes.size };
}

/* Rotas caras (IA, plataformas, WhatsApp, exportar): por usuário, em 10 min. */
const LIMITES_CAROS = {
  'POST /api/ia/leitura': 6,
  'POST /api/sync': 10,
  'POST /api/testar-conexoes': 20,
  'POST /api/integracoes/testar': 20,
  'POST /api/integracoes': 20,
  'POST /api/whatsapp/testar': 5,
  'POST /api/relatorio': 10,
  'POST /api/radar': 20,
  'POST /api/demo': 6,
  'POST /api/semanal': 5,
  'GET /api/resultados.csv': 30,
  'GET /api/ranking.csv': 30,
  'GET /api/leads.csv': 30,
  'GET /api/alertas.csv': 30,
  'GET /api/ciclo.csv': 30,
  'GET /api/oficina-agora': 120,
  'GET /api/acoes': 120,
  'GET /api/acoes.csv': 30,
  'GET /api/ligacao': 30,
  'GET /api/fechamento': 30,
  'GET /api/fechamento.csv': 30,
  'POST /api/fechamento/enviar': 5,
  'POST /api/gestor/conversas': 30,   // rodada 9: cada uma é uma linha nova no banco
  // rodada 10: gravações que não tinham limite nenhum por pessoa
  'POST /api/config': 30,
  'POST /api/ia/chaves': 10,
  'GET /api/ia/chaves': 120,          // cada leitura da lista grava uma linha na auditoria
};

/* Revisão de segurança (19/11): o primeiro item do X-Forwarded-For é o que o visitante escreve, então não serve
   para limite. O Render fica atrás da Cloudflare, que grava o IP que viu em cf-connecting-ip (e apaga o que vier
   do visitante). Sem ele: o ÚLTIMO item do X-Forwarded-For, que é o que o proxy acrescenta. É a mesma regra do
   banco (trafego_rastreio_registrar). */
const IP_VALIDO = /^[0-9a-f.:]{3,45}$/i;
function ipDe(req) {
  const h = (req && req.headers) || {};
  const cf = String(h['cf-connecting-ip'] || '').trim();
  if (IP_VALIDO.test(cf)) return cf;
  const partes = String(h['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const ultimo = partes.length ? partes[partes.length - 1] : '';
  if (IP_VALIDO.test(ultimo)) return ultimo;
  return (req && req.socket && req.socket.remoteAddress) || 'desconhecido';
}

/* ---------------- erros sem detalhe interno ---------------- */
const FRASE_PUBLICA = /^(Não foi possível|Coorte acima|Escolha|Informe|Cadastre|Sem |A IA|IA )/;
function mensagemPublica(e) {
  const status = e?.status || 500;
  if (status < 500) return e.message || 'pedido inválido';
  if (e?.publico || FRASE_PUBLICA.test(e?.message || '')) return e.message;
  return 'Algo deu errado aqui. Tente de novo em instantes.';
}

module.exports = { CSP, cspPara, PERMISSOES, cabecalhos, cors, origemPermitida, criarLimitador, LIMITES_CAROS, ipDe, mensagemPublica, ORIGENS };
