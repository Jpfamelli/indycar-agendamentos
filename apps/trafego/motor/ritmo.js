/* ============================================================
   Ritmo do mês (rodada 8, frente T2a): o bloco `ritmo` de /api/hoje.

   A projeção é a do núcleo (motor/nucleo.mjs, ritmoMes): só dias fechados, só a partir de 5 dias de anúncio no mês,
   contando desde o primeiro dia com gasto. Aqui entram o que é da tela: o gasto até hoje, o esperado até hoje,
   a situação em três estados e a frase.

   ORIGEM da frase (repositório Nexus Ads, só leitura; commit 5ea0047 de 25/10/2026):
     nexus-ads/web/app/anuncios.js  ->  textoRitmo, diarioSugerido   (cópia adaptada: palavras da casa,
     sem citar tela de outro produto; a conta é a mesma)
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');

/** Acima de 2% do orçamento a projeção já é "acima" (a mesma folga do núcleo). */
const FOLGA_ACIMA = 1.02;
/** Projeção abaixo de 80% do orçamento é "abaixo" (o mesmo corte do aviso de sobra do núcleo). */
const CORTE_ABAIXO = 0.8;
/** Nos primeiros dias (cedo para projetar) só é "acima" quem já gastou uma vez e meia o esperado. */
const FOLGA_CEDO = 1.5;
const DIA_MINIMO = 5;

/** Quanto dá para gastar por dia até o fim do mês sem passar do orçamento (null sem dias ou sem orçamento; 0 se já passou). */
function diarioSugerido(orcamento, gasto, restam) {
  if (!(+restam > 0) || !(+orcamento > 0)) return null;
  const saldo = +orcamento - (+gasto || 0);
  return saldo > 0 ? saldo / +restam : 0;
}

/**
 * A frase do orçamento do mês. `m` = M.ritmoMes(R) do núcleo ({ gasto, pass, restam, proj, cedo, desde, diasAbertosRestantes }).
 * Com o orçamento já todo usado diz só isso, com o que fazer.
 */
function textoRitmo(m, orcamento) {
  if (!m) return '';
  const orc = +orcamento > 0 ? +orcamento : 0;
  if (m.restam === 0) return `Mês fechado em ${T.brl0(m.gasto)}.`;
  if (orc && m.gasto >= orc) return `O orçamento do mês (${T.brl0(orc)}) já foi todo usado: ${T.brl0(m.gasto)} até ontem. Pause ou reduza as campanhas até o dia 1º, ou aumente o orçamento em Ajustes.`;
  if (m.cedo) {
    if (m.desde > 1) {
      const d = Math.max(1, m.pass - m.desde + 1);
      return `Cedo para projetar: os anúncios começaram no dia ${m.desde} e, com ${T.plural(d, 'dia', 'dias')} de anúncio, a conta ainda oscila muito. A projeção aparece a partir do dia ${m.desde + DIA_MINIMO - 1}.`;
    }
    return `Cedo para projetar: com ${T.plural(m.pass, 'dia', 'dias')} de mês a conta ainda oscila muito. A projeção aparece a partir do dia ${DIA_MINIMO}.`;
  }
  if (!orc) return `No ritmo atual o mês fecha em ${T.brl0(m.proj)}. Defina o orçamento do mês em Ajustes para saber se isso é muito ou pouco.`;
  const acima = m.proj > orc * FOLGA_ACIMA, noLimite = !acima && m.proj >= orc * 0.98;
  if (acima) {
    const abertos = Number.isFinite(m.diasAbertosRestantes) ? m.diasAbertosRestantes : null;
    const sugerido = diarioSugerido(orc, m.gasto, abertos != null ? abertos : m.restam);
    if (sugerido == null) return `No ritmo atual o mês fecha ${T.brl0(m.proj - orc)} acima do orçamento. Não há mais dias de atendimento no mês: pause os anúncios até o dia 1º.`;
    return `No ritmo atual o mês fecha ${T.brl0(m.proj - orc)} acima do orçamento. Para caber, o gasto por dia precisa ficar em ${T.brl(sugerido)} até o fim do mês.`;
  }
  if (noLimite) return `No limite: o mês deve fechar em ${T.brl0(m.proj)}, praticamente no orçamento.`;
  return `Dentro do orçamento: o mês deve fechar em ${T.brl0(m.proj)} (sobram ${T.brl0(orc - m.proj)}).`;
}

/**
 * O bloco `ritmo` do contrato (§5.2), sempre do mês corrente:
 *   { orcamento_mes, gasto_ate_hoje, esperado_ate_hoje, projecao, situacao, meta_contatos, dias } + { leitura }
 * Entradas:
 *   hoje             dia de Brasília
 *   orcamento        ads_config.orcamento_mensal (null = não definido)
 *   gastoPorDia      Map(dia -> gasto) do mês, ou null quando o gasto não é conhecido (sem conta)
 *   ultimoDiaColetado  último dia com linha de métrica (dias depois dele ainda não foram coletados: gasto null)
 *   contatosPorDia   Map(dia -> { total, anuncio })
 *   nucleo           M.ritmoMes(M.R) do núcleo, ou null (dia 1º do mês, ou sem métrica)
 * `situacao` é 'sem_meta' também quando o gasto não é conhecido (o contrato não tem valor próprio para isso);
 * `leitura` diz o motivo.
 */
function ritmoDoMes({ hoje, orcamento = null, gastoPorDia = null, ultimoDiaColetado = null, contatosPorDia = new Map(), nucleo = null } = {}) {
  const inicio = P.inicioDoMes(hoje), fim = P.fimDoMes(hoje);
  const diasNoMes = P.contarDias(inicio, fim), diaDoMes = P.contarDias(inicio, hoje);
  const orc = T.numOuNulo(orcamento) > 0 ? T.numOuNulo(orcamento) : null;
  const conhecido = gastoPorDia instanceof Map;

  let gasto = 0;
  const dias = P.diasEntre(inicio, hoje).map(data => {
    const c = contatosPorDia.get(data) || { total: 0, anuncio: 0 };
    const coletado = conhecido && ultimoDiaColetado != null && data <= ultimoDiaColetado;
    const g = coletado ? T.arredondar(gastoPorDia.get(data) || 0) : null;
    if (g != null) gasto += g;
    return { data, gasto: g, contatos: c.total, contatos_anuncio: c.anuncio };
  });
  const temGasto = conhecido && dias.some(d => d.gasto != null);
  const gastoAteHoje = temGasto ? T.arredondar(gasto) : null;
  const esperado = orc ? T.arredondar(orc * diaDoMes / diasNoMes) : null;
  // o núcleo fala de ONTEM: no dia 1º ele ainda está no mês passado e não serve para este mês
  const doMes = nucleo && diaDoMes > 1 ? nucleo : null;
  const projecao = temGasto && doMes && !doMes.cedo && T.finito(doMes.proj) ? T.arredondar(doMes.proj) : null;

  let situacao = 'sem_meta', leitura;
  if (!temGasto) {
    leitura = conhecido ? 'A coleta ainda não trouxe o gasto deste mês.' : 'Sem a conta de anúncios ligada não dá para acompanhar o gasto do mês.';
  } else if (!orc) {
    leitura = doMes ? textoRitmo(doMes, null) : `${T.brl0(gastoAteHoje)} investidos neste mês. Defina o orçamento do mês em Ajustes para acompanhar o ritmo.`;
  } else {
    if (gastoAteHoje >= orc) situacao = 'acima';
    else if (projecao != null) situacao = projecao > orc * FOLGA_ACIMA ? 'acima' : projecao < orc * CORTE_ABAIXO ? 'abaixo' : 'no_ritmo';
    else situacao = esperado != null && gastoAteHoje > esperado * FOLGA_CEDO ? 'acima' : 'no_ritmo';
    leitura = doMes ? textoRitmo(doMes, orc) : `${T.brl0(gastoAteHoje)} de ${T.brl0(orc)} investidos neste mês.`;
  }
  return { orcamento_mes: orc, gasto_ate_hoje: gastoAteHoje, esperado_ate_hoje: esperado, projecao, situacao, meta_contatos: null, dias, leitura };
}

module.exports = { FOLGA_ACIMA, CORTE_ABAIXO, FOLGA_CEDO, DIA_MINIMO, diarioSugerido, textoRitmo, ritmoDoMes };
