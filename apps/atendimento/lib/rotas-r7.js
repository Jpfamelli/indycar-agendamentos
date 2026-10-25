/* ============================================================
   ROTAS DA RODADA 7 (C4) — login obrigatório em todas.

   GET  /api/r7/retomada/plano            o que ficou parado e o que a retomada faria (enviar / revisar / pular)
   POST /api/r7/retomada/iniciar          {ids?} reenvia com calma (uma por vez); gestor/admin/atendente (só as suas)
   POST /api/r7/retomada/parar            para depois da mensagem atual
   GET  /api/r7/retomada/estado           andamento do reenvio
   GET  /api/r7/links/:conversaId         links já preenchidos (entrada no Pátio, nova cotação, Orçador com IA) + serviços citados
   GET  /api/r7/horarios?servico=&consultor=&dias=   vagas reais da Agenda
   GET  /api/r7/cliente-links?tel=        Minha IndyCar / Indique / Acompanhar o carro
   GET  /api/r7/busca?q=                  busca global (cliente, placa, telefone, OS, orçamento)
   GET  /api/r7/agora                     resumo do dia (pátio, orçamentos, agenda, tarefas)
   GET  /api/r7/sinais                    conversas com manipulação (24 h) e avaliações ruins sem resposta
   ============================================================ */
'use strict';

const { ORIGENS_ECOSSISTEMA } = require('./seguranca.js');
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function criarRotasR7({ getSb, usuarioLogado, dentroDoLimite, readBody, retomada, dados, zap, tokenDe = () => null }) {
  const enviar = (req, res, code, data) => {
    const corpo = JSON.stringify(data);
    const cab = { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const origem = req.headers.origin;
    if (origem && ORIGENS_ECOSSISTEMA.has(origem)) { cab['Access-Control-Allow-Origin'] = origem; cab['Vary'] = 'Origin'; }
    res.writeHead(code, cab); res.end(corpo); return true;
  };
  const D = () => (typeof dados === 'function' ? dados() : dados);
  const RET = () => (typeof retomada === 'function' ? retomada() : retomada);

  return async function tratar(req, res, pathname, parametros) {
    if (!pathname.startsWith('/api/r7/')) return false;
    const quem = await usuarioLogado(req);
    if (!quem) return enviar(req, res, 401, { ok: false, erro: 'Faça login.' });
    const limitar = (chave, teto) => dentroDoLimite(`${chave}:${quem.id}`, teto, 60_000) || (enviar(req, res, 429, { ok: false, erro: 'Muitos pedidos seguidos. Espere um minuto.' }), false);
    if (!getSb()) return enviar(req, res, 503, { ok: false, erro: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY.' });
    const q = parametros && typeof parametros.get === 'function' ? parametros : new URLSearchParams(parametros || '');

    if (pathname === '/api/r7/retomada/plano' && req.method === 'GET') {
      if (!limitar('r7-plano', 30)) return true;
      const p = await RET().planejar({ papel: quem.papel, perfilId: quem.id });
      return enviar(req, res, 200, { ...p, resumo: RET().resumoPlano(p), whatsapp_parado: zap.estado().parado });
    }
    if (pathname === '/api/r7/retomada/iniciar' && req.method === 'POST') {
      if (!limitar('r7-iniciar', 6)) return true;
      const corpo = (await readBody(req).catch(() => ({}))) || {};
      const r = await RET().iniciar({ perfil: quem, ids: Array.isArray(corpo.ids) ? corpo.ids.slice(0, 200) : null });
      return enviar(req, res, r.ok ? 200 : (r.status || 500), r);
    }
    if (pathname === '/api/r7/retomada/parar' && req.method === 'POST') {
      if (!limitar('r7-parar', 12)) return true;
      const r = RET().parar();
      return enviar(req, res, r.ok ? 200 : (r.status || 409), r);
    }
    if (pathname === '/api/r7/retomada/estado' && req.method === 'GET') {
      if (!limitar('r7-estado', 240)) return true;
      return enviar(req, res, 200, { ok: true, ...RET().estado(), whatsapp: zap.estado() });
    }

    let m = /^\/api\/r7\/links\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'GET') {
      if (!limitar('r7-links', 120)) return true;
      const r = await D().contextoParaLinks(decodeURIComponent(m[1]));
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }
    if (pathname === '/api/r7/horarios' && req.method === 'GET') {
      if (!limitar('r7-horarios', 60)) return true;
      const r = await D().horariosReais(tokenDe(req), { servico: (q.get('servico') || '').slice(0, 120) || null, consultor: q.get('consultor') || null, dias: Number(q.get('dias')) || 5 });
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }
    if (pathname === '/api/r7/cliente-links' && req.method === 'GET') {
      if (!limitar('r7-clinks', 60)) return true;
      const r = await D().linksCliente(tokenDe(req), q.get('tel'));
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }
    if (pathname === '/api/r7/busca' && req.method === 'GET') {
      if (!limitar('r7-busca', 90)) return true;
      const r = await D().buscaGlobal(tokenDe(req), q.get('q'));
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }
    if (pathname === '/api/r7/agora' && req.method === 'GET') {
      if (!limitar('r7-agora', 60)) return true;
      const r = await D().agoraGeral(tokenDe(req));
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }
    if (pathname === '/api/r7/sinais' && req.method === 'GET') {
      if (!limitar('r7-sinais', 60)) return true;
      const [manip, ruins] = await Promise.all([D().conversasComManipulacao(24), D().avaliacoesRuins(14)]);
      return enviar(req, res, 200, { ok: true, manipulacao: manip, avaliacoes_ruins: ruins.map((a) => ({ os_id: a.os_id, cliente_id: a.cliente_id, nota: a.nota, em: a.created_at })) });
    }
    return enviar(req, res, 404, { ok: false, erro: 'rota r7 desconhecida' });
  };
}

module.exports = { criarRotasR7 };
