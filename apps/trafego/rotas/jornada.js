/* ============================================================
   Rotas da jornada (rodada 8, frente T2b) — contrato da API §5.3 e §5.5.

     GET  /api/jornada                      lista com totais, funil, filtros e itens paginados
     GET  /api/jornada/:lead_id             um contato: item + linha do tempo, primeira mensagem, rastreio, histórico, links
     GET  /api/pendencias                   quatro filas de trabalho (sem valor, sem motivo, sem origem, sem resposta)
     POST /api/jornada/:lead_id/origem      marca a origem à mão
     POST /api/jornada/:lead_id/valor       lança o valor do serviço (só contato que fechou)
     POST /api/jornada/:lead_id/motivo      marca por que não fechou (só contato que não fechou)
     POST /api/jornada/lote                 até 50 contatos de uma vez

   Todas exigem login e o acesso ao app (ctx.rota). Toda escrita é auditada e tem limite por pessoa.
   A lista leva nome curto e o final do telefone; nome e telefone inteiros só no detalhe.
   Erro sai sempre como { erro, ...extra } com o status certo (400 filtro, 404 não existe, 409 situação não permite, 422 campo inválido, 429 limite).
   ============================================================ */
'use strict';

const Jornada = require('../jornada');
const Periodo = require('../motor/periodo');

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const FILTROS = ['canal', 'paga', 'campanha', 'desfecho', 'etapa', 'pendencia', 'q', 'ordem', 'pagina', 'tamanho'];
const DEZ_MIN = 10 * 60_000;

module.exports = (ctx) => {
  const { rota, ErroHttp, equipe, limitador, db } = ctx;

  const medir = (pedido, nome, fn) => (pedido && typeof pedido.medir === 'function' ? pedido.medir(nome, fn) : fn());
  const fresco = q => q.get('fresco') === '1';

  /** Limite por pessoa (além do limite por IP do servidor): 429 com Retry-After. */
  function limitar(res, usuario, chave, maximo) {
    const r = limitador.permitir(`u|${usuario.id}|jornada:${chave}`, maximo, DEZ_MIN);
    if (r.ok) return;
    res.setHeader('Retry-After', String(r.esperar));
    throw new ErroHttp(429, `Você fez isso muitas vezes agora. Espere ${Math.max(1, Math.ceil(r.esperar / 60))} min.`, { codigo: 'limite' });
  }

  /* O gasto é da frente do servidor base; aqui só o suficiente para `estado.gasto` e `estado.demo` baterem com as outras telas.
     Um minuto de memória; se a leitura falhar, `gasto` fica nulo (não se sabe). */
  let gastoGuardado = { em: 0, valor: null };
  async function estadoDoGasto() {
    if (gastoGuardado.valor && Date.now() - gastoGuardado.em < 60_000) return gastoGuardado.valor;
    let valor = { gasto: null, demo: false };
    try {
      const [reais, algum] = await Promise.all([db.temDadosReais(), db.temDados()]);
      if (reais) valor = { gasto: 'real', demo: false };
      else if (algum) valor = { gasto: 'demo', demo: true };
      else valor = { gasto: (await db.temChaves()) ? 'sem_dados' : 'sem_conta', demo: false };
    } catch { /* fica nulo */ }
    gastoGuardado = { em: Date.now(), valor };
    return valor;
  }
  const comGasto = async resposta => ({ ...resposta, estado: { ...resposta.estado, ...(await estadoDoGasto()) } });

  /* ---------------- leituras ---------------- */

  rota('GET', '/api/jornada', async ({ q, res, usuario, pedido }) => {
    limitar(res, usuario, 'lista', 600);
    const periodo = Periodo.periodoDaConsulta(q);
    const filtros = Object.fromEntries(FILTROS.map(k => [k, q.get(k)]));
    return comGasto(await medir(pedido, 'jornada', () => Jornada.listar({ periodo, filtros, fresco: fresco(q) })));
  });

  rota('GET', '/api/pendencias', async ({ q, res, usuario, pedido }) => {
    limitar(res, usuario, 'lista', 600);
    const periodo = Periodo.periodoDaConsulta(q);
    return comGasto(await medir(pedido, 'pendencias', () => Jornada.pendencias({ periodo, fresco: fresco(q) })));
  });

  rota('GET', new RegExp(`^/api/jornada/${ID}$`, 'i'), async ({ m, res, usuario, pedido }) => {
    limitar(res, usuario, 'detalhe', 300);
    const contato = await medir(pedido, 'contato', () => Jornada.detalhe(m[1]));
    if (!contato) throw new ErroHttp(404, 'Contato não encontrado.');
    return contato;
  });

  /* ---------------- escritas ---------------- */

  const auditar = (usuario, acao, leadId, detalhes) => equipe.banco().auditar(usuario, acao, { tabela: 'leads', registro: leadId, detalhes });
  const objeto = c => (c && typeof c === 'object' && !Array.isArray(c) ? c : {});

  rota('POST', new RegExp(`^/api/jornada/${ID}/origem$`, 'i'), async ({ m, corpo, res, usuario }) => {
    limitar(res, usuario, 'escrita', 120);
    const c = objeto(await corpo());
    const r = await Jornada.marcarOrigem(m[1], c, { quem: usuario });
    // na auditoria vai o que foi escolhido, nunca texto livre
    await auditar(usuario, 'trafego_origem_marcada', m[1], { canal: r.canal, campanha_ext: r.origem.campanha ? r.origem.campanha.ext : null, campanha: r.origem.campanha ? r.origem.campanha.nome : null });
    return { ok: true, origem: r.origem };
  });

  rota('POST', new RegExp(`^/api/jornada/${ID}/valor$`, 'i'), async ({ m, corpo, res, usuario }) => {
    limitar(res, usuario, 'escrita', 120);
    const c = objeto(await corpo());
    const r = await Jornada.lancarValor(m[1], c.valor);
    await auditar(usuario, 'trafego_valor_lancado', m[1], { antes: r.antes, valor: r.valor });
    return { ok: true, desfecho: r.desfecho, ...(r.aviso ? { aviso: r.aviso } : {}) };
  });

  rota('POST', new RegExp(`^/api/jornada/${ID}/motivo$`, 'i'), async ({ m, corpo, res, usuario }) => {
    limitar(res, usuario, 'escrita', 120);
    const c = objeto(await corpo());
    const r = await Jornada.marcarMotivo(m[1], { motivo: c.motivo, obs: c.obs });
    await auditar(usuario, 'trafego_motivo_marcado', m[1], { motivo: r.motivo, com_observacao: !!r.obs });
    return { ok: true, desfecho: r.desfecho };
  });

  rota('POST', '/api/jornada/lote', async ({ corpo, res, usuario }) => {
    limitar(res, usuario, 'lote', 12);
    const c = objeto(await corpo());
    const r = await Jornada.lote(c.itens, { quem: usuario });
    const acoes = { valor: 'trafego_valor_lancado', motivo: 'trafego_motivo_marcado', origem: 'trafego_origem_marcada' };
    await Promise.all(r.gravados.map(({ lead_id, acao, ...detalhes }) => auditar(usuario, acoes[acao], lead_id, { ...detalhes, em_lote: true })));
    return { ok: r.ok, feitos: r.feitos, erros: r.erros };
  });
};
