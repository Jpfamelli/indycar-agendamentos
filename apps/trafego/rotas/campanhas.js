/* ============================================================
   Rotas das campanhas (rodada 8, frente T2a) — contrato da API §5.4.

     GET /api/campanhas[?periodo=…|de=&ate=][&plataforma=meta|google][&fresco=1]
     GET /api/campanhas/:plataforma/:chave[?periodo=…]
         :plataforma = meta | google | anuncio (contato de anúncio sem plataforma conhecida)
         :chave      = o identificador da campanha na plataforma, ou "nome:<nome>" para a campanha que só os
                       contatos conhecem (o campo `chave` de cada campanha da lista já vem pronto)

   A montagem mora em motor/campanhas.js. Erros: 400 entrada inválida; 404 campanha que não aparece no período;
   503 { codigo: "leitura" } quando o banco não respondeu.
   ============================================================ */
'use strict';

const Campanhas = require('../motor/campanhas');
const { comLeitura } = require('../motor/rota');

module.exports = (ctx) => {
  ctx.rota('GET', '/api/campanhas', comLeitura(ctx, ({ q, pedido }) => Campanhas.responderLista({ q, pedido })));
  ctx.rota('GET', /^\/api\/campanhas\/([a-z]+)\/([^/]+)$/, comLeitura(ctx, async ({ q, pedido, m }) => {
    const r = await Campanhas.responderDetalhe({ plataforma: m[1], chave: m[2], q, pedido });
    if (!r) throw new ctx.ErroHttp(404, 'Essa campanha não aparece neste período.', { codigo: 'sem_campanha' });
    return r;
  }));
};
