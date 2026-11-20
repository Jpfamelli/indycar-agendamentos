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

/**
 * O selo do ritmo da verba, dito pelo que vai acontecer: "acima" do servidor tanto é quem já passou
 * quanto quem vai passar no ritmo de hoje (antes os dois diziam "Acima da verba", mesmo com R$ 2.341 de R$ 3.000).
 */
export function seloDoRitmo(r) {
  if (!r) return null;
  const n = (v) => typeof v === 'number' && Number.isFinite(v);
  switch (r.situacao) {
    case 'acima': return n(r.gasto_ate_hoje) && n(r.orcamento_mes) && r.gasto_ate_hoje >= r.orcamento_mes ? ['atencao', 'Passou da verba'] : ['atencao', 'Vai passar da verba'];
    case 'no_ritmo': return ['bom', 'No ritmo da verba'];
    case 'abaixo': return ['espera', 'Vai sobrar verba'];
    default: return null;
  }
}
