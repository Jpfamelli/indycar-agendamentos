/* ============================================================================
   Lógica pura da tela Hoje (testada em tela/_testes/hoje-logica.test.mjs).
   Nada de DOM aqui: só decide o que a tela diz.
   ============================================================================ */

/** Alguma conexão pede ação? Com tudo funcionando, o link da Hoje não diz "falta ligar". */
export function faltaLigar(c) {
  if (!c || typeof c !== 'object') return true;
  const conta = (x) => !x || x.situacao !== 'ok' || Boolean(x.parada);
  return conta(c.meta) || conta(c.google) || !(c.site && c.site.rastreio) || !(c.whatsapp && c.whatsapp.situacao === 'ok');
}
