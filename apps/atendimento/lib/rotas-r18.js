/* ============================================================
   ROTAS DA RODADA 18 — login obrigatório em todas (lógica em lib/r18.js).

   GET  /api/r18/zap                          o WhatsApp está parado? desde quando, por quê e o que fazer (uma resposta só)
   GET  /api/r18/paradas?dias=30              quantas conversas esperam o consultor há mais de N dias (7/15/30/60/90)
   POST /api/r18/paradas/encerrar {dias, esperado}   encerra em lote (admin, gestor, atendente); registra quem fez
   POST /api/r18/paradas/desfazer {lote}      volta as conversas do lote (quem encerrou ou o administrador, até 24 h)
   ============================================================ */
'use strict';

const { enviarJson } = require('./resposta.js');
const R18 = require('./r18.js');

function criarRotasR18({ getSb, usuarioLogado, dentroDoLimite, readBody, zap, sincronia, lerSaude, auditar, agora = () => Date.now(), log = console.error }) {
  const enviar = enviarJson;
  const paradas = R18.criarParadas({ sb: getSb, auditar, agora, log });
  let ULTIMAS = { em: 0, entrada: null, saida: null };

  async function ultimasMensagens() {
    if (Date.now() - ULTIMAS.em < 60_000) return ULTIMAS;
    const b = getSb();
    if (!b) return ULTIMAS;
    try {
      const [e, s] = await Promise.all([
        b.from('whatsapp_mensagens').select('created_at').eq('direcao', 'entrada').order('created_at', { ascending: false }).limit(1),
        b.from('whatsapp_mensagens').select('created_at').eq('direcao', 'saida').eq('status', 'enviado').order('created_at', { ascending: false }).limit(1),
      ]);
      if (!e.error) ULTIMAS = { em: Date.now(), entrada: e.data?.[0]?.created_at || null, saida: s.data?.[0]?.created_at || null };
    } catch (err) { log('r18 ultimas:', err.message); }
    return ULTIMAS;
  }

  async function corpo(req) {
    try { return (await readBody(req)) || {}; }
    catch (e) { return { _erro: e }; }
  }

  return async function tratar(req, res, pathname, parametros) {
    if (!pathname.startsWith('/api/r18/')) return false;
    const quem = await usuarioLogado(req);
    if (!quem) return enviar(req, res, 401, { ok: false, erro: 'Faça login.' });
    const limitar = (chave, teto) => dentroDoLimite(`${chave}:${quem.id}`, teto, 60_000) || (enviar(req, res, 429, { ok: false, erro: 'Muitos pedidos seguidos. Espere um minuto.' }), false);
    const q = parametros && typeof parametros.get === 'function' ? parametros : new URLSearchParams(parametros || '');

    if (pathname === '/api/r18/zap' && req.method === 'GET') {
      if (!limitar('r18-zap', 120)) return true;
      let saude = {};
      try { saude = (await lerSaude?.()) || {}; } catch { /* sem vigia: segue com o resto */ }
      /* Só lê: quem marca e limpa o disjuntor é o envio e o vigia (lerSaude). Marcar daqui brigaria com a limpeza
         do vigia e o sino receberia "parou / voltou" a cada consulta. */
      const sinc = sincronia?.estado?.() || {};
      const ult = await ultimasMensagens();
      const r = R18.decidirZap({ zap: zap.estado(), sincronia: sinc, saude, ultimaEntrada: ult.entrada, ultimaSaida: ult.saida, agora: agora(), ehAdmin: quem.papel === 'admin' });
      return enviar(req, res, 200, r);
    }

    if (!getSb()) return enviar(req, res, 503, { ok: false, erro: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY.' });

    if (pathname === '/api/r18/paradas' && req.method === 'GET') {
      if (!limitar('r18-paradas', 60)) return true;
      const r = await paradas.contar({ dias: q.get('dias') || 30 });
      return enviar(req, res, r.ok ? 200 : (r.status || 500), r);
    }
    if (pathname === '/api/r18/paradas/encerrar' && req.method === 'POST') {
      if (!limitar('r18-encerrar', 6)) return true;
      const c = await corpo(req);
      if (c._erro) return enviar(req, res, 400, { ok: false, erro: 'Não consegui ler o pedido.' });
      const r = await paradas.encerrar({ dias: c.dias, perfil: quem, esperado: c.esperado ?? null });
      return enviar(req, res, r.ok ? 200 : (r.status || 500), r);
    }
    if (pathname === '/api/r18/paradas/desfazer' && req.method === 'POST') {
      if (!limitar('r18-desfazer', 6)) return true;
      const c = await corpo(req);
      if (c._erro) return enviar(req, res, 400, { ok: false, erro: 'Não consegui ler o pedido.' });
      const r = await paradas.desfazer({ lote: c.lote, perfil: quem });
      return enviar(req, res, r.ok ? 200 : (r.status || 500), r);
    }
    return enviar(req, res, 404, { ok: false, erro: 'rota não encontrada' });
  };
}

module.exports = { criarRotasR18 };
