/* ============================================================
   Apoio dos testes da rodada 10: sobe o servidor de verdade numa porta livre, com porteiro de mentira
   (o papel vem no cabeçalho x-papel) e auditoria que só anota. Nada sai para a rede nem para o banco real.
   Não é arquivo de teste (o nome não termina em .test.js).
   ============================================================ */
'use strict';

const net = require('node:net');

const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PAPEIS = {
  admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true, nome: 'Marina Costa' } },
  gestor: { usuario: { id: ID(2), papel: 'gestor', apps: ['ads'], ativo: true, nome: 'Rafa Lima' } },
  fora: { usuario: { id: ID(3), papel: 'gestor', apps: ['crm'], ativo: true } },
};

/**
 * Sobe o app. Devolve { base, porta, servidor, auditoria, pedir, cru, fechar }.
 *   pedir(caminho, { metodo, papel, corpo, cabecalhos })  → { status, json, texto, cabecalhos }
 *   cru(pedacos, { pausa })  → manda os pedaços (Buffer ou texto; número = espera em ms) direto no soquete e devolve a
 *                              resposta em texto. Para de mandar assim que o servidor responde.
 */
async function subir() {
  const auth = require('../../auth');
  const equipe = require('../../equipe');
  const { servidor, limitador } = require('../../server');
  const orig = { identificar: auth.identificar, banco: equipe.banco };
  const auditoria = [];
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async (u, acao, extra) => { auditoria.push({ quem: u && u.id, acao, ...extra }); return true; } });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const porta = servidor.address().port;
  const base = `http://127.0.0.1:${porta}`;

  async function pedir(caminho, { metodo = 'GET', papel = 'admin', corpo, cabecalhos = {} } = {}) {
    const r = await fetch(base + caminho, {
      method: metodo, redirect: 'manual',
      headers: { ...(papel ? { 'x-papel': papel } : {}), ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...cabecalhos },
      body: corpo === undefined ? undefined : (typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo)),
    });
    const texto = await r.text();
    let json = null; try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto, cabecalhos: r.headers };
  }

  function cru(pedacos, { pausa = 30 } = {}) {
    return new Promise((resolve, reject) => {
      const s = net.connect(porta, '127.0.0.1');
      let saida = '';
      s.setEncoding('utf8');
      s.on('data', d => { saida += d; });
      s.on('end', () => resolve(saida));
      s.on('close', () => resolve(saida));
      s.on('error', () => resolve(saida));   // o servidor pode fechar antes de lermos tudo o que ainda íamos mandar
      s.on('connect', async () => {
        for (const p of pedacos) {
          if (saida || s.destroyed) break;     // já respondeu (ex.: 413 no meio do envio): para de mandar
          if (typeof p === 'number') { await new Promise(r => setTimeout(r, p)); continue; }   // número = espera (ms)
          s.write(p);
          await new Promise(r => setTimeout(r, pausa));
        }
      });
      setTimeout(() => { s.destroy(); resolve(saida); }, 4000).unref();
    });
  }

  async function fechar() {
    auth.identificar = orig.identificar; equipe.banco = orig.banco;
    limitador.limpar();
    servidor.closeAllConnections?.();
    await new Promise(r => servidor.close(r));
  }
  return { base, porta, servidor, auditoria, limitador, pedir, cru, fechar };
}

module.exports = { subir, ID, PAPEIS };
