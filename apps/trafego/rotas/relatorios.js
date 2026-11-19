/* ============================================================
   Rotas dos relatórios da tela nova (rodada 8, frente T2a) — contrato da API §5.5.

     GET /api/relatorios/texto?tipo=diario|semanal|mensal[&mes=AAAA-MM]   -> { tipo, titulo, texto, periodo, estado, motor }
     GET /api/relatorios/folha?mes=AAAA-MM                                -> dados da folha A4 do mês
     GET /api/relatorios/apresentacao[?periodo=…|de=&ate=]                 -> { periodo, estado, telas: [ … ] }

   A montagem mora em motor/relatorios.js. A rota antiga GET /api/relatorios (lista dos enviados) continua no server.js.
   Erros: 400 entrada inválida; 503 { codigo: "leitura" } quando o banco não respondeu.
   ============================================================ */
'use strict';

const Relatorios = require('../motor/relatorios');
const { comLeitura } = require('../motor/rota');

module.exports = (ctx) => {
  ctx.rota('GET', '/api/relatorios/texto', comLeitura(ctx, ({ q, pedido }) => Relatorios.responderTexto({ q, pedido })));
  ctx.rota('GET', '/api/relatorios/folha', comLeitura(ctx, ({ q, pedido }) => Relatorios.responderFolha({ q, pedido })));
  ctx.rota('GET', '/api/relatorios/apresentacao', comLeitura(ctx, ({ q, pedido }) => Relatorios.responderApresentacao({ q, pedido })));
};
