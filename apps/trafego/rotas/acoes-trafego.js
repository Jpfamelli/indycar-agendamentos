/* ============================================================
   Diário de decisões: rotas (rodada 8, frente T5b). Formatos em API-gestor.md §3.

   GET  /api/acoes-trafego?status=&limite=     → { ligado, aviso, total, contagem, acoes }
   POST /api/acoes-trafego/:id/decidir         { decisao: 'aceitar'|'recusar', nota? } → { ok, acao }
   POST /api/acoes-trafego/:id/feita           { nota? } → { ok, acao, aviso }
   POST /api/acoes-trafego                     { tipo, titulo, porque?, alvo?, medir_em?, ja_fiz?, nota? } → { ok, acao }
   POST|GET /api/cron/medir?chave=             → expira propostas velhas e mede o que chegou na data (sem login)

   Decidir, marcar como feita e registrar: SÓ pessoa logada (estas rotas exigem login), e tudo vai para a auditoria.
   Nenhuma ferramenta da IA chega aqui; aceitar não muda nada no anúncio, só registra a decisão.
   ============================================================ */
'use strict';

const Decisoes = require('../ia/decisoes');

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';

module.exports = (ctx) => {
  const { rota, rotaPublica, exigirCron, equipe } = ctx;
  const diario = () => Decisoes.padrao();
  const auditar = (usuario, acao, registro, detalhes) =>
    Promise.resolve().then(() => equipe.banco().auditar(usuario, acao, { tabela: 'trafego_acoes', registro, detalhes })).catch(() => {});

  rota('GET', '/api/acoes-trafego', ({ q }) => diario().listar({ status: q.get('status'), limite: q.get('limite') }));

  rota('POST', new RegExp(`^/api/acoes-trafego/${ID}/decidir$`, 'i'), async ({ usuario, corpo, m }) => {
    const c = await corpo();
    const acao = await diario().decidir(m[1].toLowerCase(), c, usuario);
    await auditar(usuario, acao.status === 'aceita' ? 'trafego_acao_aceita' : 'trafego_acao_recusada', acao.id, { tipo: acao.tipo, origem: acao.origem });
    return { ok: true, acao };
  });

  rota('POST', new RegExp(`^/api/acoes-trafego/${ID}/feita$`, 'i'), async ({ usuario, corpo, m }) => {
    const r = await diario().marcarFeita(m[1].toLowerCase(), await corpo(), usuario);
    await auditar(usuario, 'trafego_acao_feita', r.acao.id, { tipo: r.acao.tipo, medir_em: r.acao.medir_em });
    return { ok: true, acao: r.acao, aviso: r.aviso };
  });

  rota('POST', '/api/acoes-trafego', async ({ usuario, corpo }) => {
    const acao = await diario().registrarPropria(await corpo(), usuario);
    await auditar(usuario, 'trafego_acao_registrada', acao.id, { tipo: acao.tipo, status: acao.status });
    return { ok: true, acao };
  });

  const rotinaDeMedir = ({ q, req }) => { exigirCron(q, req); return diario().rodarRotina(); };
  rotaPublica('POST', '/api/cron/medir', rotinaDeMedir);
  rotaPublica('GET', '/api/cron/medir', rotinaDeMedir);
};
