/* ============================================================
   Gestor IA: rotas (rodada 8, frente T5b). Formatos em API-gestor.md §1 e §2.

   POST /api/gestor/perguntar        { pergunta, conversa_id?, dado_pessoal? } → text/event-stream
                                      (texto | ferramenta | proposta | fim | erro). Erro antes do fluxo: JSON com status.
   GET  /api/gestor/conversas        → { ligado, aviso, conversas }
   GET  /api/gestor/conversas/:id    → a conversa (da pessoa, ou um plano da semana)
   POST /api/gestor/conversas        { titulo? } → { ok, conversa }
   GET  /api/gestor/plano            → { ligado, aviso, plano }
   POST /api/gestor/plano            → { ok, plano }   (até 90 s; 502 com o que chegou, se a IA não terminou)
   POST|GET /api/cron/plano?chave=   → a rotina da semana (sem login, chave do cron)

   O Gestor só lê e propõe: nenhuma rota daqui decide, marca como feita ou muda status (isso é rotas/acoes-trafego.js,
   e só por pessoa logada). Dado pessoal (dado_pessoal: true) só para administrador, e fica auditado.
   ============================================================ */
'use strict';

const G = require('../ia/gestor');
const Plano = require('../ia/plano');

const BATIDA_MS = 15_000;

module.exports = (ctx) => {
  const { rota, rotaPublica, exigirCron, equipe, limitador } = ctx;

  /** O Gestor do processo, com o limitador do app (30 perguntas por hora por pessoa). */
  const gestor = () => {
    const g = G.padrao();
    if (!g.config.limitador) g.trocar({ limitador });
    return g;
  };
  const plano = () => { gestor(); return Plano.padrao(); };
  const comEspera = (res, e) => { if (e && e.esperar) res.setHeader('Retry-After', String(e.esperar)); return e; };
  const auditar = (usuario, acao, registro, detalhes) =>
    Promise.resolve().then(() => equipe.banco().auditar(usuario, acao, { tabela: 'trafego_ia_conversas', registro, detalhes })).catch(() => {});

  rota('POST', '/api/gestor/perguntar', async ({ res, usuario, corpo }) => {
    const g = gestor();
    const c = await corpo();
    let pedido;
    try { pedido = await g.preparar({ usuario, corpo: c, ehAdmin: equipe.ehAdmin(usuario) }); }
    catch (e) { throw comEspera(res, e); }
    if (pedido.dadoPessoal) {
      await auditar(usuario, 'trafego_gestor_dado_pessoal', pedido.conversa.id || null, { pergunta_letras: pedido.pergunta.length });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    res.write(': gestor\n\n');
    const controle = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controle.abort(); });
    const batida = setInterval(() => { if (!res.writableEnded && !res.destroyed) res.write(': batida\n\n'); }, BATIDA_MS);
    if (typeof batida.unref === 'function') batida.unref();
    const emitir = (tipo, dados) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
    };
    try {
      await g.responder(pedido, { emitir, sinal: controle.signal });
    } finally {
      clearInterval(batida);
      if (!res.writableEnded) res.end();
    }
  });

  rota('GET', '/api/gestor/conversas', ({ usuario }) => gestor().listarConversas(usuario));

  rota('GET', /^\/api\/gestor\/conversas\/([^/]+)$/, ({ usuario, m }) => gestor().abrirConversa(decodeURIComponent(m[1]).toLowerCase(), usuario));

  rota('POST', '/api/gestor/conversas', async ({ usuario, corpo }) => gestor().criarConversa(await corpo(), usuario));

  rota('GET', '/api/gestor/plano', () => plano().ultimo());

  rota('POST', '/api/gestor/plano', async ({ res, usuario }) => {
    try { return await plano().gerar({ usuario }); }
    catch (e) { throw comEspera(res, e); }
  });

  const rotinaDoPlano = ({ q, req }) => { exigirCron(q, req); return plano().rotina(); };
  rotaPublica('POST', '/api/cron/plano', rotinaDoPlano);
  rotaPublica('GET', '/api/cron/plano', rotinaDoPlano);
};
