/* ============================================================
   Arquivos da tela (rodada 8, frente T2a).

   - Com tela/index.html, a raiz do app serve a tela nova (tela/).
     Sem ele, a raiz continua servindo a tela antiga (public/).
   - A tela antiga fica em /antiga/ nos dois casos, até a rodada de enxugar.
   - /vendor/supabase.js continua servido daqui.
   - O app pode morar num prefixo (a Central entrega req.prefixo = '/trafego'):
     nenhum redirecionamento supõe a raiz do domínio. A tela nova já nasce
     com endereços relativos e não é tocada. A tela antiga foi escrita para
     a raiz ('/api/…', '/fontes/…'): esses dois endereços são reescritos na
     hora de servir, só quando ela não está na raiz do domínio.
   - Sem <base href>: com ele, um link de âncora (href="#conteudo") numa
     página com consulta no endereço recarregaria a página.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const compressao = require('./compressao');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
/* HTML sempre revalida (uma publicação nova aparece na hora); CSS e JS ficam 5 min no navegador. */
const CACHE = { '.html': 'no-cache', '.css': 'public, max-age=300', '.js': 'public, max-age=300', '.mjs': 'public, max-age=300' };
/* Service worker e manifest nunca ficam presos no navegador (senão a versão nova demora a chegar). */
const SEMPRE_FRESCO = new Set(['sw.js', 'manifest.webmanifest', 'manifest.json']);
const TEXTO_ANTIGO = new Set(['.html', '.js', '.css']);

/** Prefixo em que o app está montado: '' (raiz) ou '/trafego'. Só caminho simples; o que vier estranho vira ''. */
function normalizarPrefixo(p) {
  const s = String(p == null ? '' : p).trim().replace(/[/]+$/, '');
  if (!s) return '';
  if (!/^(?:[/][A-Za-z0-9_-]+)+$/.test(s)) return '';
  return s;
}

function texto(res, status, frase, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(frase);
}

/**
 * A tela antiga chama '/api/…' e '/fontes/…' a partir da raiz do domínio. Fora da raiz
 * (dentro de um prefixo, ou em /antiga/) esses dois endereços passam a apontar para o lugar certo.
 * `prefixo` = onde o app está montado; `raiz` = onde a pasta da tela antiga está montada.
 */
function reescreverAntiga(conteudo, { prefixo = '', raiz = '' } = {}) {
  let s = String(conteudo);
  if (prefixo) s = s.replace(/(['"`])[/]api[/]/g, (_m, aspa) => `${aspa}${prefixo}/api/`);
  if (raiz) s = s.replace(/(['"`(])[/]fontes[/]/g, (_m, antes) => `${antes}${raiz}/fontes/`);
  return s;
}

function criar({ dirTela, dirAntiga, vendor = {} }) {
  const TELA = path.resolve(dirTela), ANTIGA = path.resolve(dirAntiga);

  /* A tela nova pode chegar com o servidor no ar (outra frente escreve a pasta): confere de tempos em tempos. */
  let visto = { em: 0, tem: false };
  function temTelaNova(agora = Date.now()) {
    if (agora - visto.em > 2000) visto = { em: agora, tem: fs.existsSync(path.join(TELA, 'index.html')) };
    return visto.tem;
  }

  /* Tela antiga reescrita: arquivo|prefixo|raiz -> { mtime, cru, gz } */
  const reescritos = new Map();
  function lerAntigaReescrita(arquivo, tipo, opcoes, cb) {
    compressao.lerArquivo(arquivo, tipo, (err, item) => {
      if (err) return cb(err);
      const chave = `${arquivo}|${opcoes.prefixo}|${opcoes.raiz}`;
      const guardado = reescritos.get(chave);
      if (guardado && guardado.mtime === item.mtime) return cb(null, guardado);
      const cru = Buffer.from(reescreverAntiga(item.cru.toString('utf8'), opcoes), 'utf8');
      const novo = { mtime: item.mtime, cru, gz: compressao.valeComprimir(tipo, cru.length) ? zlib.gzipSync(cru, { level: 9 }) : null };
      if (reescritos.size >= 60) reescritos.delete(reescritos.keys().next().value);
      reescritos.set(chave, novo);
      cb(null, novo);
    });
  }

  function enviar(req, res, arquivo, { tipo, cache, reescrever = null }) {
    const pronto = (err, item) => {
      if (err) return texto(res, 404, 'Não encontrado');
      const gz = item.gz && compressao.aceitaGzip(req);
      const corpo = gz ? item.gz : item.cru;
      res.writeHead(200, {
        'Content-Type': tipo, 'Cache-Control': cache, 'Content-Length': corpo.length, Vary: 'Accept-Encoding',
        ...(gz ? { 'Content-Encoding': 'gzip' } : {}),
      });
      res.end(req.method === 'HEAD' ? undefined : corpo);
    };
    if (reescrever) return lerAntigaReescrita(arquivo, tipo, reescrever, pronto);
    compressao.lerArquivo(arquivo, tipo, pronto);
  }

  /* Bastidor que mora dentro de tela/ e não é para o navegador: pasta/arquivo que começa com "_" ou ".",
     guias em .md e testes. Na tela antiga, só o que começa com ".". */
  function bloqueado(rel, ehTela) {
    const partes = rel.split(/[\\/]/);
    if (partes.some(p => p.startsWith('.'))) return true;
    // No Windows, "arquivo.md." e "arquivo.md::$DATA" abrem "arquivo.md": nome com ":" ou terminado em ponto/espaço não passa.
    if (/[:*?"<>|]/.test(rel) || partes.some(p => /[. ]$/.test(p))) return true;
    if (!ehTela) return false;
    if (partes.some(p => p.startsWith('_'))) return true;
    const nome = partes[partes.length - 1].toLowerCase();
    return nome.endsWith('.md') || /[.]test[.][cm]?js$/.test(nome);
  }

  /**
   * Serve um arquivo da tela. `caminho` é o caminho do pedido já sem o prefixo (a Central tira).
   */
  function servir(req, res, caminho) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 405, 'Método não permitido', { Allow: 'GET, HEAD' });
    const prefixo = normalizarPrefixo(req.prefixo);

    if (vendor[caminho]) return enviar(req, res, vendor[caminho], { tipo: MIME['.js'], cache: 'public, max-age=86400' });

    // /antiga sem a barra: os endereços relativos da página quebrariam. Vai para /antiga/ DENTRO do prefixo.
    if (caminho === '/antiga') {
      const consulta = (() => { const i = String(req.url || '').indexOf('?'); return i >= 0 ? String(req.url).slice(i) : ''; })();
      res.writeHead(308, { Location: `${prefixo}/antiga/${consulta}`, 'Cache-Control': 'no-store' });
      return res.end();
    }

    const naAntiga = caminho.startsWith('/antiga/');
    const ehTela = !naAntiga && temTelaNova();
    const base = ehTela ? TELA : ANTIGA;
    let resto = naAntiga ? caminho.slice('/antiga'.length) : caminho;
    if (naAntiga && vendor[resto]) return enviar(req, res, vendor[resto], { tipo: MIME['.js'], cache: 'public, max-age=86400' });

    let rel;
    try { rel = resto === '/' ? 'index.html' : decodeURIComponent(resto.slice(1)); }
    catch { return texto(res, 400, 'Caminho inválido'); }
    if (rel.includes('\0')) return texto(res, 404, 'Não encontrado');
    const arquivo = path.resolve(base, rel);
    if (!arquivo.startsWith(base + path.sep)) return texto(res, 403, 'Proibido');   // fuga de pasta
    if (bloqueado(path.relative(base, arquivo), ehTela)) return texto(res, 404, 'Não encontrado');

    const ext = path.extname(arquivo).toLowerCase();
    const nome = path.basename(arquivo);
    const cache = SEMPRE_FRESCO.has(nome) ? 'no-cache' : CACHE[ext] || 'public, max-age=3600';
    // Tela antiga fora da raiz do domínio: '/api/…' e '/fontes/…' apontam para o lugar certo.
    const raizAntiga = naAntiga ? `${prefixo}/antiga` : prefixo;
    const reescrever = !ehTela && TEXTO_ANTIGO.has(ext) && (prefixo || raizAntiga) ? { prefixo, raiz: raizAntiga } : null;

    // A tela nova navega por âncora (#/hoje, #/jornada…): não existe "endereço de tela" no servidor.
    // O que não é arquivo é 404, e um endereço digitado errado não passa por tela saudável.
    enviar(req, res, arquivo, { tipo: MIME[ext] || 'application/octet-stream', cache, reescrever });
  }

  return { servir, temTelaNova, dirTela: TELA, dirAntiga: ANTIGA };
}

module.exports = { criar, normalizarPrefixo, reescreverAntiga, MIME };
