/* ============================================================
   Guia de conexão Meta/Google em passos (rodada 4, 14/10/2026).
   Lê só o que o servidor já manda (sim/não por campo, nunca o token)
   e diz: o que está feito, qual é o próximo passo e uma mensagem pronta
   para pedir o que falta a quem cuida das contas.
   Funciona no navegador (window.GuiaConexao) e no node:test.
   ============================================================ */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.GuiaConexao = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const sincOk = i => /^ok\b/i.test(String((i && i.ultimo_sync_status) || ''));
  const sincErro = i => /^erro\b/i.test(String((i && i.ultimo_sync_status) || ''));

  function diasAte(data, hoje) {
    if (!data) return null;
    const alvo = Date.parse(String(data).slice(0, 10) + 'T12:00:00Z');
    const base = Date.parse((hoje || new Date().toISOString()).slice(0, 10) + 'T12:00:00Z');
    if (!Number.isFinite(alvo) || !Number.isFinite(base)) return null;
    return Math.round((alvo - base) / 86400000);
  }

  /** Passos da Meta: [{ id, titulo, feito, como }] na ordem. */
  function passosMeta(i, hoje) {
    const x = i || {};
    const conta = !!(x.tem_meta_conta || x.meta_ad_account_id);
    const dias = diasAte(x.meta_token_expira_em, hoje);
    return [
      { id: 'conta', titulo: 'Número da conta de anúncios', feito: conta,
        como: 'Gerenciador de Anúncios → Configurações da conta (o número com "act_").' },
      { id: 'token', titulo: 'Token com a permissão ads_read', feito: !!x.tem_meta_token,
        como: 'Meta for Developers → app da oficina → Explorador da API: marque ads_read e gere um token de longa duração (60 dias).' },
      { id: 'teste', titulo: 'Conexão testada', feito: sincOk(x),
        como: sincErro(x) ? 'O último teste deu erro: toque em "Testar sem salvar" para ver o que fazer.' : 'Toque em "Testar sem salvar" e depois em "Salvar".' },
      { id: 'validade', titulo: 'Token dentro da validade', feito: dias === null ? !!x.tem_meta_token : dias > 7,
        como: dias !== null && dias <= 7
          ? (dias < 0 ? 'O token venceu: gere outro e cole aqui.' : `O token vence em ${dias} dia(s): gere outro antes.`)
          : 'Preencha "Vence em" para o painel avisar antes de o token vencer.' },
    ];
  }

  /** Passos do Google Ads. */
  function passosGoogle(i) {
    const x = i || {};
    return [
      { id: 'cliente', titulo: 'ID do cliente (10 dígitos)', feito: !!(x.tem_google_cliente || x.google_customer_id),
        como: 'Aparece no topo do Google Ads (123-456-7890). Se a conta fica numa MCC, preencha também a gerenciadora.' },
      { id: 'developer', titulo: 'Developer token aprovado', feito: !!x.tem_google_developer_token,
        como: 'Google Ads → Ferramentas → Central da API. A aprovação do Google leva alguns dias.' },
      { id: 'oauth', titulo: 'Client ID e Client secret', feito: !!x.tem_google_oauth,
        como: 'Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth.' },
      { id: 'refresh', titulo: 'Refresh token (autorização)', feito: !!x.tem_google_refresh,
        como: 'Faça o consentimento OAuth uma vez (ex.: OAuth Playground com o escopo adwords) e cole o refresh token.' },
      { id: 'teste', titulo: 'Conexão testada', feito: sincOk(x),
        como: sincErro(x) ? 'O último teste deu erro: toque em "Testar sem salvar" para ver o que fazer.' : 'Toque em "Testar sem salvar" e depois em "Salvar".' },
    ];
  }

  /** "2 de 4 passos" + o primeiro que falta. */
  function resumo(passos) {
    const feitos = passos.filter(p => p.feito).length;
    const proximo = passos.find(p => !p.feito) || null;
    return { feitos, total: passos.length, pronto: !proximo, proximo };
  }

  /** Mensagem pronta (sem segredo nenhum) para pedir o que falta a quem cuida da conta. */
  function mensagemPedido(canal, passos) {
    const faltam = passos.filter(p => !p.feito && p.id !== 'teste' && p.id !== 'validade');
    if (!faltam.length) return '';
    const nome = canal === 'google' ? 'Google Ads' : 'Meta (Facebook/Instagram)';
    const linhas = faltam.map(p => `- ${p.titulo}: ${p.como}`);
    return `Oi! Para ligar o painel de tráfego pago da IndyCar ao ${nome}, preciso de:\n${linhas.join('\n')}\nPode me mandar? Eu colo direto no painel (não precisa mandar senha de login).`;
  }

  return { passosMeta, passosGoogle, resumo, mensagemPedido, diasAte };
});
