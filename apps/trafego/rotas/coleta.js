/* ============================================================
   Rotas da coleta e da devolução de vendas (rodada 8, frente T6). Descritas em API-coleta.md.

   Com login (acesso "ads"):
     POST /api/coleta/agora           coleta agora (no máximo 1 a cada 2 minutos, para o app inteiro)
     GET  /api/coleta/situacao        está rodando? como foi a última? cada conta, sem segredo
     POST /api/coleta/testar          testa um acesso ({ canal, …campos colados }) ou todos os salvos ({})
     GET  /api/devolucao/google.csv   vendas fechadas com clique do Google, prontas para subir (?formato=central|legado)
     GET  /api/devolucao/meta         vendas de anúncio da Meta para marcar no WhatsApp Business
   Públicas:
     GET|POST /api/cron/cliques?chave=   liga contato com gclid à campanha e palavra (click_view)
     GET  /api/coleta/miniatura/:plataforma/:anuncio   imagem do anúncio pelo próprio app (img-src 'self')
   As rotas antigas (/api/integracoes*, /api/sync, /api/testar-conexoes, /api/cron/sync) continuam no server.js.
   ============================================================ */
'use strict';

const DOIS_MINUTOS = 2 * 60_000;

function resumoDaColeta(r) {
  const plataformas = {};
  for (const [canal, p] of Object.entries(r.plataformas || {})) {
    plataformas[canal] = p.ok
      ? { ok: true, linhas: p.linhas, termos: p.termos, ms: p.ms, versao: p.versao, avisos: p.avisos || [], acesso_expira_em: p.acesso_expira_em ?? undefined }
      : { ok: false, titulo: p.titulo, fazer: p.fazer, detalhe: p.erro, ms: p.ms };
  }
  return {
    de: r.de, ate: r.ate, inicio: r.inicio, fim: r.fim, ms: r.ms, origem: r.origem,
    ja_estava_rodando: !!r.ja_estava_rodando, demo_removida: !!r.demo_removida,
    plataformas, erros: r.erros || [],
  };
}

function registrar(ctx) {
  const { rota, rotaPublica, exigirCron, ErroHttp, limitador } = ctx;
  const d = () => registrar.dependencias;
  const auditar = async (usuario, acao, extra) => {
    try { await ctx.equipe.banco().auditar(usuario, acao, extra); } catch { /* auditoria não derruba a rota */ }
  };

  rota('POST', '/api/coleta/agora', async ({ usuario, corpo, res }) => {
    const c = (await corpo().catch(() => null)) || {};
    const lim = limitador.permitir('coleta|agora', 1, DOIS_MINUTOS);
    if (!lim.ok) {
      res.setHeader('Retry-After', String(lim.esperar));
      throw new ErroHttp(429, `A coleta acabou de rodar. Espere ${lim.esperar} segundos para pedir de novo.`, { codigo: 'coleta_recente', esperar: lim.esperar });
    }
    const dias = Math.min(30, Math.max(1, parseInt(c.dias, 10) || 7));
    await auditar(usuario, 'ads_coleta_agora', { tabela: 'ads_metricas_dia', detalhes: { dias } });
    const r = await d().coletor.sincronizar({ dias, origem: 'pessoa' });
    // Os números novos já valem: as telas não podem responder com a leitura guardada de antes da busca.
    (d().fonte || require('../motor/fonte')).esquecerLeituras();
    return resumoDaColeta(r);
  });

  rota('GET', '/api/coleta/situacao', async () => {
    const s = await d().coletor.situacao();
    return { ...s, ultima: s.ultima ? resumoDaColeta(s.ultima) : null };
  });

  rota('POST', '/api/coleta/testar', async ({ usuario, corpo, res }) => {
    const lim = limitador.permitir(`coleta|testar|${usuario?.id || '?'}`, 20, 10 * 60_000);
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.esperar)); throw new ErroHttp(429, `Muitos testes seguidos. Espere ${Math.ceil(lim.esperar / 60)} min.`); }
    const c = (await corpo().catch(() => null)) || {};
    if (c.canal == null) return { resultados: await d().coletor.testarConexoes() };
    if (c.canal !== 'meta' && c.canal !== 'google') throw new ErroHttp(400, 'Escolha meta ou google.');
    return { resultados: [await d().conexoes.testar(c.canal, c)] };
  });

  rota('GET', '/api/devolucao/google.csv', async ({ q, res, usuario }) => {
    const formato = q.get('formato') === 'legado' ? 'legado' : 'central';
    const acao = String(q.get('acao') || '').trim().slice(0, 100) || null;
    const v = await d().devolucao.lerVendas();
    if (!v.pronto) throw new ErroHttp(409, v.motivo, { codigo: 'banco_sem_colunas' });
    const r = d().devolucao.csvGoogle(v.vendas, { formato, nome: acao || undefined });
    await auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: `devolucao-google-${formato}`, quantidade: r.linhas } });
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendas-google-${formato}-${hoje}.csv"`,
      'Cache-Control': 'no-store',
      'X-Vendas': String(r.linhas),   // quantas vendas foram no arquivo: com zero, a tela avisa em vez de baixar um arquivo vazio
    });
    res.end(r.csv);
  });

  rota('GET', '/api/devolucao/meta', async () => {
    const v = await d().devolucao.lerVendas({ dias: 30 });
    if (!v.pronto) return { pronto: false, motivo: v.motivo, itens: [], no_prazo: 0 };
    const itens = d().devolucao.listaMeta(v.vendas);
    return {
      pronto: true, itens, no_prazo: itens.filter(i => i.no_prazo).length,
      como: 'No app WhatsApp Business: Ferramentas › Atividade de clientes › ligar "Permitir que a Meta receba dados de eventos". Depois, em cada venda abaixo, ponha a conversa na lista "Pedido concluído" (ou "Pago") em até 7 dias do contato.',
    };
  });

  /* Rotina externa (mesma chave das outras rotinas). */
  const cliques = async ({ q, req }) => { exigirCron(q, req); return d().coletor.ligarCliques(); };
  rotaPublica('POST', '/api/cron/cliques', cliques);
  rotaPublica('GET', '/api/cron/cliques', cliques);

  /* Miniatura: pública porque <img> não manda o login; só serve imagem de anúncio já coletado (anúncio é público
     na Biblioteca de Anúncios) e de endereço da lista de domínios da Meta e do Google. */
  rotaPublica('GET', /^\/api\/coleta\/miniatura\/(meta|google)\/([0-9A-Za-z_-]{1,40})$/, async ({ res, m }) => {
    const r = await d().coletor.miniatura({ plataforma: m[1], anuncio: m[2] });
    if (!r.ok) throw new ErroHttp(404, 'Imagem do anúncio indisponível.');
    res.writeHead(200, { 'Content-Type': r.tipo, 'Content-Length': String(r.corpo.length), 'Cache-Control': 'private, max-age=21600', 'X-Content-Type-Options': 'nosniff' });
    res.end(r.corpo);
  });
}

/* Trocáveis nos testes. */
registrar.dependencias = {
  get coletor() { return require('../coletor'); },
  get devolucao() { return require('../devolucao'); },
  get conexoes() { return require('../conexoes'); },
  get fonte() { return require('../motor/fonte'); },
};
registrar.resumoDaColeta = resumoDaColeta;

module.exports = registrar;
