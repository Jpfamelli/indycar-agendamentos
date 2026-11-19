/* ============================================================
   Chaves da IA de fora — Ajustes › Chaves da IA (rodada 8, frente T5a). Só administrador; tudo auditado.

   GET    /api/ia/chaves      → { ligado, aviso, chaves: [{ id, nome, prefixo, escopos, ver_pii, criada_em, ultimo_uso_em, usos, revogada_em, ativa }] }
   POST   /api/ia/chaves      { nome, escopos: ['ler'] | ['ler','propor'], ver_pii } → { ok, chave (em claro, UMA vez), aviso, registro }
   DELETE /api/ia/chaves/:id  → { ok, registro, ja_estava }   (revoga na hora; outro processo deixa de aceitar em até 30 s)
   A chave em claro só aparece na resposta do POST (Cache-Control: no-store). Nunca vai para log nem auditoria.
   ============================================================ */
'use strict';

const Chaves = require('../ia/chaves');

module.exports = (ctx) => {
  const { rota, ErroHttp, equipe } = ctx;

  const exigirAdmin = usuario => {
    if (!equipe.ehAdmin(usuario)) throw new ErroHttp(403, 'Só o administrador cria, vê e revoga as chaves da IA.', { codigo: 'so_admin' });
  };
  const auditar = (usuario, acao, registro, detalhes) => equipe.banco().auditar(usuario, acao, { tabela: 'trafego_ia_chaves', registro, detalhes });

  rota('GET', '/api/ia/chaves', async ({ usuario }) => {
    exigirAdmin(usuario);
    const r = await Chaves.padrao().listar();
    await auditar(usuario, 'trafego_ia_chaves_vistas', null, { quantas: r.chaves.length });
    return r;
  });

  rota('POST', '/api/ia/chaves', async ({ usuario, corpo }) => {
    exigirAdmin(usuario);
    const r = await Chaves.padrao().criar(await corpo(), { criada_por: usuario.id });
    await auditar(usuario, 'trafego_ia_chave_criada', r.registro.id, { nome: r.registro.nome, prefixo: r.registro.prefixo, escopos: r.registro.escopos, ver_pii: r.registro.ver_pii });
    return {
      ok: true,
      chave: r.chave,
      aviso: 'Copie a chave agora e guarde num lugar seguro: ela não aparece de novo. Quem tiver a chave lê os dados da oficina.',
      registro: r.registro,
    };
  });

  rota('DELETE', /^\/api\/ia\/chaves\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, async ({ usuario, m }) => {
    exigirAdmin(usuario);
    const r = await Chaves.padrao().revogar(m[1].toLowerCase());
    if (!r) throw new ErroHttp(404, 'Chave não encontrada.', { codigo: 'nao_existe' });
    await auditar(usuario, 'trafego_ia_chave_revogada', r.registro.id, { prefixo: r.registro.prefixo, ja_estava: r.ja_estava });
    return { ok: true, registro: r.registro, ja_estava: r.ja_estava };
  });
};
