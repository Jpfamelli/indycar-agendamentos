// -----------------------------------------------------------------------------
// Arquivos da tela (rodada 4) — mais rápido sem mudar o que é servido:
//   • guarda na memória o arquivo já lido e já comprimido (brotli e gzip)
//   • ETag: o navegador que já tem a versão recebe 304 (sem corpo)
//   • HTML e service worker continuam "no-cache" (sempre conferem a versão);
//     imagens e fontes têm cache de 1 dia
// Testado em `npm test` com uma pasta temporária.
// -----------------------------------------------------------------------------
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import { aceitaCodificacao } from './rotas.js';

const TEXTO = /\.(html|css|js|json|webmanifest|svg|txt)$/;

export function criarEstaticos({ pasta, mime = {}, seguros = {}, emMemoria = true }) {
  const memoria = new Map();

  async function carregar(caminho) {
    const info = await stat(caminho);
    const lembrado = memoria.get(caminho);
    if (lembrado && lembrado.mtime === info.mtimeMs && lembrado.tamanho === info.size) return lembrado;
    const bruto = await readFile(caminho);
    const ext = extname(caminho);
    const item = {
      mtime: info.mtimeMs, tamanho: info.size, bruto, ext,
      etag: `"${createHash('sha1').update(bruto).digest('base64url').slice(0, 20)}"`,
      br: null, gz: null,
    };
    if (TEXTO.test(ext) && bruto.length > 1024) {
      item.br = brotliCompressSync(bruto, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } });
      item.gz = gzipSync(bruto, { level: 9 });
    }
    if (emMemoria) memoria.set(caminho, item);
    return item;
  }

  function responder(req, res, item) {
    const cab = {
      'Content-Type': mime[item.ext] || 'application/octet-stream',
      'Cache-Control': /\.(png|svg|ico|woff2)$/.test(item.ext) ? 'public, max-age=86400' : 'no-cache, must-revalidate',
      ETag: item.etag,
      ...seguros,
    };
    if (item.br || item.gz) cab.Vary = 'Accept-Encoding';
    if (req.headers['if-none-match'] === item.etag) { res.writeHead(304, cab); return res.end(); }
    const aceita = req.headers['accept-encoding'] || '';
    let corpo = item.bruto;
    if (item.br && aceitaCodificacao(aceita, 'br')) { corpo = item.br; cab['Content-Encoding'] = 'br'; }
    else if (item.gz && aceitaCodificacao(aceita, 'gzip')) { corpo = item.gz; cab['Content-Encoding'] = 'gzip'; }
    cab['Content-Length'] = corpo.length;
    res.writeHead(200, cab);
    return res.end(req.method === 'HEAD' ? undefined : corpo);
  }

  return async function servir(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD', ...seguros }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); }
    catch { res.writeHead(400, seguros); return res.end(); }
    const caminho = normalize(join(pasta, rel));
    if (caminho !== pasta && !caminho.startsWith(pasta + sep)) { res.writeHead(404, seguros); return res.end(); }
    const ext = extname(caminho);
    try {
      return responder(req, res, await carregar(caminho));
    } catch {
      if (ext && ext !== '.html') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...seguros }); return res.end('Não encontrado'); }
      try { return responder(req, res, await carregar(join(pasta, 'index.html'))); }
      catch { res.writeHead(404, seguros); return res.end(); }
    }
  };
}
