/* ============================================================
   Apoio das rotas novas (rodada 8, frente T2a): o que rotas/hoje.js, rotas/campanhas.js,
   rotas/relatorios.js e rotas/conexoes.js têm em comum.

   - Leitura essencial que falha (métricas, contatos) vira 503 com frase de gente e o código "leitura":
     a tela oferece "tentar de novo"; o log recebe a rota, a etapa e o tipo do erro (server.js), sem dado pessoal.
   - Erro de entrada (período, plataforma) já nasce com status 400 e frase pronta (motor/periodo.js).
   ============================================================ */
'use strict';

const { FalhaDeLeitura } = require('./fonte');

/**
 * Envolve o tratador de uma rota: troca a falha de leitura por um erro HTTP 503 que a tela entende.
 * `ctx` é o contexto do encaixe (server.js): usa só o ErroHttp.
 */
function comLeitura(ctx, tratar) {
  return async (pedidoHttp) => {
    try {
      return await tratar(pedidoHttp);
    } catch (e) {
      if (e instanceof FalhaDeLeitura) {
        const erro = new ctx.ErroHttp(503, `Não deu para ler ${e.fonte} agora. Tente de novo em instantes.`, { codigo: 'leitura' });
        erro.name = 'FalhaDeLeitura';
        erro.code = e.codigo || undefined;
        erro.stack = e.stack;
        throw erro;
      }
      throw e;
    }
  };
}

module.exports = { comLeitura };
