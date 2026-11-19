/* ============================================================
   Rotas da origem (rodada 8, frente T2b) — Ajustes › De onde vêm os contatos (contrato da API §5.5).

     GET    /api/origem/frases          frases da primeira mensagem (e a origem que cada uma dá)
     POST   /api/origem/frases          cadastra uma frase
     POST   /api/origem/frases/:id      muda uma frase (texto, tipo, origem, ligada ou não)
     DELETE /api/origem/frases/:id      desliga a frase (não apaga: os contatos marcados ficam como estão)
     GET    /api/origem/candidatas      primeiras mensagens que se repetem e ainda não têm origem
     POST   /api/origem/testar          { mensagem } → o que essa mensagem viraria
     POST   /api/origem/reaplicar       { simular, desde } → passa a régua no passado (sempre simula antes)
     POST   /api/origem/link            mensagem pronta com código permanente, link do WhatsApp e QR code
     GET    /api/origem/rastreio        situação do rastreio do site e a linha <script> para colar no site de fora

   Todas exigem login e o acesso ao app. Toda escrita é auditada (sem texto livre na auditoria) e tem limite por pessoa.
   Banco sem a migração da rodada 8: leitura devolve `ligado: false` com aviso; escrita devolve 503 `sem_migracao`.
   ============================================================ */
'use strict';

const Origem = require('../origem');

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const DEZ_MIN = 10 * 60_000;

module.exports = (ctx) => {
  const { rota, ErroHttp, equipe, limitador, enderecos } = ctx;

  function limitar(res, usuario, chave, maximo) {
    const r = limitador.permitir(`u|${usuario.id}|origem:${chave}`, maximo, DEZ_MIN);
    if (r.ok) return;
    res.setHeader('Retry-After', String(r.esperar));
    throw new ErroHttp(429, `Você fez isso muitas vezes agora. Espere ${Math.max(1, Math.ceil(r.esperar / 60))} min.`, { codigo: 'limite' });
  }
  const objeto = c => (c && typeof c === 'object' && !Array.isArray(c) ? c : {});
  const auditar = (usuario, acao, tabela, registro, detalhes) => equipe.banco().auditar(usuario, acao, { tabela, registro, detalhes });

  /* ---------------- frases ---------------- */

  rota('GET', '/api/origem/frases', async ({ res, usuario }) => {
    limitar(res, usuario, 'leitura', 300);
    return Origem.listarFrases();
  });

  rota('POST', '/api/origem/frases', async ({ corpo, res, usuario }) => {
    limitar(res, usuario, 'escrita', 60);
    const f = await Origem.criarFrase(objeto(await corpo()), { quem: usuario });
    await auditar(usuario, 'trafego_frase_criada', 'trafego_frases', f.id, { tipo: f.tipo, canal: f.vira ? f.vira.canal : null, paga: f.paga });
    return { ok: true, frase: f };
  });

  rota('POST', new RegExp(`^/api/origem/frases/${ID}$`, 'i'), async ({ m, corpo, res, usuario }) => {
    limitar(res, usuario, 'escrita', 60);
    const f = await Origem.editarFrase(m[1].toLowerCase(), objeto(await corpo()));
    await auditar(usuario, 'trafego_frase_editada', 'trafego_frases', f.id, { tipo: f.tipo, canal: f.vira ? f.vira.canal : null, paga: f.paga, ativa: f.ativa });
    return { ok: true, frase: f };
  });

  rota('DELETE', new RegExp(`^/api/origem/frases/${ID}$`, 'i'), async ({ m, res, usuario }) => {
    limitar(res, usuario, 'escrita', 60);
    const f = await Origem.desligarFrase(m[1].toLowerCase());
    await auditar(usuario, 'trafego_frase_desligada', 'trafego_frases', f.id, { ativa: false });
    return { ok: true, frase: f };
  });

  /* ---------------- candidatas e teste ---------------- */

  rota('GET', '/api/origem/candidatas', async ({ res, usuario }) => {
    limitar(res, usuario, 'pesada', 30);
    return Origem.candidatas();
  });

  rota('POST', '/api/origem/testar', async ({ corpo, res, usuario }) => {
    limitar(res, usuario, 'testar', 120);
    const c = objeto(await corpo());
    return Origem.testarMensagem(c.mensagem);
  });

  /* ---------------- passar a régua no passado ---------------- */

  rota('POST', '/api/origem/reaplicar', async ({ corpo, res, usuario }) => {
    limitar(res, usuario, 'reaplicar', 20);
    const c = objeto(await corpo());
    const r = await Origem.reaplicar({ simular: c.simular, desde: c.desde, quem: usuario });
    if (!r.simulado) await auditar(usuario, 'trafego_origem_reaplicada', 'leads', null, { desde: r.desde, mudaram: r.mudaram, por_origem: r.por_origem });
    return r;
  });

  /* ---------------- mensagem pronta ---------------- */

  rota('POST', '/api/origem/link', async ({ corpo, res, usuario }) => {
    limitar(res, usuario, 'link', 30);
    const r = await Origem.criarLink(objeto(await corpo()), { quem: usuario });
    await auditar(usuario, 'trafego_mensagem_pronta_criada', 'trafego_rastreio', r.frase.codigo, { codigo: r.frase.codigo, canal: r.frase.origem ? r.frase.origem.canal : null });
    return { ok: true, ...r };
  });

  /* ---------------- rastreio do site ---------------- */

  rota('GET', '/api/origem/rastreio', async ({ res, usuario }) => {
    limitar(res, usuario, 'leitura', 300);
    const src = enderecos.urlDoTrafego('rastreio.js');
    return Origem.situacaoDoRastreio({ script: `<script src="${src}" async></script>` });
  });
};
