/* ============================================================
   RESPOSTA JSON das rotas (rodada 10)
   Uma só para lib/rotas-ia.js, rotas-r6.js, rotas-r7.js e rotas-equipe.js (cada uma tinha a sua
   cópia, sem compressão): sem cache, sem "adivinhar" o tipo, CORS só para os apps do ecossistema
   e gzip acima de 2 kB quando o navegador aceita. A fila das conversas, a equipe e a ficha são
   as respostas grandes do dia a dia; no 4G da oficina elas pesavam inteiras.
   ============================================================ */
'use strict';

const zlib = require('node:zlib');
const { ORIGENS_ECOSSISTEMA } = require('./seguranca.js');

const MINIMO_PARA_COMPRIMIR = 2048;

/** @returns {true} para a rota poder fazer `return enviarJson(...)` */
function enviarJson(req, res, code, data) {
  const pedido = req || res.req;
  let corpo = Buffer.from(JSON.stringify(data));
  const cab = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const varia = [];
  const origem = pedido?.headers?.origin;
  if (origem && ORIGENS_ECOSSISTEMA.has(origem)) { cab['Access-Control-Allow-Origin'] = origem; varia.push('Origin'); }
  if (corpo.length > MINIMO_PARA_COMPRIMIR && /\bgzip\b/.test(String(pedido?.headers?.['accept-encoding'] || ''))) {
    corpo = zlib.gzipSync(corpo, { level: 6 });
    cab['Content-Encoding'] = 'gzip';
    varia.push('Accept-Encoding');
  }
  if (varia.length) cab.Vary = varia.join(', ');
  cab['Content-Length'] = corpo.length;
  res.writeHead(code, cab);
  res.end(corpo);
  return true;
}

module.exports = { enviarJson, MINIMO_PARA_COMPRIMIR };
