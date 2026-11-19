/* ============================================================
   Compressão e cache curto das respostas (rodada 4, 14/10/2026).
   O Render gratuito acorda devagar; quanto menos bytes depois que ele
   acorda, mais rápido a tela aparece. JSON e arquivos de texto acima de
   1 KB vão com gzip quando o navegador aceita; os arquivos da pasta
   public/ ficam na memória já comprimidos (relidos se o arquivo mudar).
   ============================================================ */
'use strict';

const fs = require('fs');
const zlib = require('zlib');

const MINIMO = 1024;
const TIPOS_TEXTO = /json|text|javascript|css|svg|html|xml|manifest/;

/** O navegador aceita gzip? (Accept-Encoding: gzip, deflate, br — "gzip;q=0" conta como não.) */
function aceitaGzip(req) {
  const ae = String((req && req.headers && req.headers['accept-encoding']) || '').toLowerCase();
  return ae.split(',').some(p => {
    const [nome, q] = p.trim().split(';');
    return nome.trim() === 'gzip' && !/q=0(\.0+)?$/.test((q || '').trim());
  });
}

/** Vale comprimir este corpo? (texto, a partir de 1 KB) */
function valeComprimir(tipo, tamanho) {
  return tamanho >= MINIMO && TIPOS_TEXTO.test(String(tipo || ''));
}

/** Devolve { corpo, cabecalhos } já comprimido quando vale a pena e o navegador aceita. */
function preparar(req, buf, tipo) {
  if (!valeComprimir(tipo, buf.length) || !aceitaGzip(req)) return { corpo: buf, cabecalhos: { Vary: 'Accept-Encoding' } };
  return { corpo: zlib.gzipSync(buf, { level: 6 }), cabecalhos: { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } };
}

/* Memória dos arquivos estáticos: caminho → { mtime, cru, gz }. */
const memoria = new Map();
const LIMITE_MEMORIA = 40;

/** Lê o arquivo (da memória se não mudou) e devolve o cru e o comprimido. */
function lerArquivo(arquivo, tipo, cb) {
  fs.stat(arquivo, (errStat, st) => {
    if (errStat) return cb(errStat);
    const guardado = memoria.get(arquivo);
    if (guardado && guardado.mtime === st.mtimeMs) return cb(null, guardado);
    fs.readFile(arquivo, (err, cru) => {
      if (err) return cb(err);
      const item = { mtime: st.mtimeMs, cru, gz: valeComprimir(tipo, cru.length) ? zlib.gzipSync(cru, { level: 9 }) : null };
      if (memoria.size >= LIMITE_MEMORIA) memoria.delete(memoria.keys().next().value);
      memoria.set(arquivo, item);
      cb(null, item);
    });
  });
}

module.exports = { aceitaGzip, valeComprimir, preparar, lerArquivo, MINIMO };
