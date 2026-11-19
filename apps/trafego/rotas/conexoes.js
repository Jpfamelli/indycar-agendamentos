/* ============================================================
   Rota das conexões (rodada 8, frente T2a) — contrato da API §5.5.

     GET /api/conexoes[?fresco=1]
       -> { meta, google, site, whatsapp, passos: [ { feito, titulo, como, acao } ], faltam, estado: { incompleto } }

   O objeto de cada conexão é o mesmo de /api/hoje (motor/conexoes-estado.js), sem segredo nenhum:
   chave e token viram sim/não antes de sair do banco (motor/fonte.js). As rotas antigas
   (/api/integracoes*, /api/sync, /api/config, /api/metas, /api/eu) continuam valendo.
   Erro: 503 { codigo: "leitura" } só se nada der para ler (as leituras daqui são tolerantes).
   ============================================================ */
'use strict';

const Fonte = require('../motor/fonte');
const C = require('../motor/conexoes-estado');
const { comLeitura } = require('../motor/rota');

/** A resposta de GET /api/conexoes. */
async function responder({ q = new URLSearchParams(), fonte = Fonte.padrao() } = {}) {
  const o = { fresco: q.get('fresco') === '1' };
  const [conexoes, config] = await Promise.all([fonte.conexoes(o), fonte.config(o)]);
  const passos = C.passosDeConexao(conexoes, { orcamento: config && config.orcamento_mensal });
  return {
    meta: conexoes.meta, google: conexoes.google, site: conexoes.site, whatsapp: conexoes.whatsapp,
    passos,
    // a mais do contrato
    faltam: passos.filter(p => !p.feito).length,
    estado: { incompleto: fonte.falhas() },
  };
}

module.exports = (ctx) => {
  ctx.rota('GET', '/api/conexoes', comLeitura(ctx, ({ q }) => responder({ q })));
};
module.exports.responder = responder;
