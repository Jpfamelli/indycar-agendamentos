/* ============================================================
   Rota da tela Hoje (rodada 8, frente T2a) — contrato da API §5.2.

     GET /api/hoje[?periodo=hoje|7d|30d|60d|mes|mes_passado][&de=AAAA-MM-DD&ate=AAAA-MM-DD][&plataforma=meta|google][&fresco=1]

   Exige login e acesso ao app (ctx.rota). A montagem mora em motor/hoje.js; aqui só o encaixe.
   Erros: 400 período ou plataforma inválidos; 503 { codigo: "leitura" } quando o banco não respondeu.
   ============================================================ */
'use strict';

const Hoje = require('../motor/hoje');
const { comLeitura } = require('../motor/rota');

module.exports = (ctx) => {
  ctx.rota('GET', '/api/hoje', comLeitura(ctx, ({ q, pedido }) => Hoje.responder({ q, pedido })));
};
