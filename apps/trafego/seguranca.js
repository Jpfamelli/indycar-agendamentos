/* ============================================================
   Segurança do servidor — padrão do ecossistema IndyCar:
   cabeçalhos (CSP, HSTS, Permissions-Policy…), CORS só para os
   domínios da casa, limite por IP/usuário e mensagens de erro sem
   detalhes internos.
   ============================================================ */
'use strict';

/* A tela só carrega coisas daqui, das fontes do Google e fala com o Supabase. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // style="width:…" das barras e gráficos (atributo, não <style> injetável)
  "style-src-attr 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

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
function criarLimitador() {
  const baldes = new Map();   // chave -> { n, inicio }
  function permitir(chave, max, janelaMs, agora = Date.now()) {
    let b = baldes.get(chave);
    if (!b || agora - b.inicio >= janelaMs) { b = { n: 0, inicio: agora }; baldes.set(chave, b); }
    b.n++;
    if (baldes.size > 10000) for (const [k, v] of baldes) if (agora - v.inicio >= janelaMs) baldes.delete(k);
    return b.n <= max ? { ok: true } : { ok: false, esperar: Math.ceil((b.inicio + janelaMs - agora) / 1000) };
  }
  return { permitir, limpar: () => baldes.clear() };
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
};

function ipDe(req) {
  // Atrás do Render/Netlify o IP real vem no primeiro item do X-Forwarded-For.
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'desconhecido';
}

/* ---------------- erros sem detalhe interno ---------------- */
const FRASE_PUBLICA = /^(Não foi possível|Coorte acima|Escolha|Informe|Cadastre|Sem |A IA|IA )/;
function mensagemPublica(e) {
  const status = e?.status || 500;
  if (status < 500) return e.message || 'pedido inválido';
  if (e?.publico || FRASE_PUBLICA.test(e?.message || '')) return e.message;
  return 'Algo deu errado aqui. Tente de novo em instantes.';
}

module.exports = { CSP, PERMISSOES, cabecalhos, cors, origemPermitida, criarLimitador, LIMITES_CAROS, ipDe, mensagemPublica, ORIGENS };
