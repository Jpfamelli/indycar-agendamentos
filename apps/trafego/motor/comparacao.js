/* ============================================================
   Comparação entre o que a plataforma conta e o que a oficina recebeu,
   e as réguas de leitura das campanhas (rodada 8, frente T2a).

   ORIGEM das peças puras (repositório Nexus Ads, só leitura; commit 5ea0047 de 25/10/2026):
     nexus-ads/web/app/anuncios.js    ->  comparacaoCrmPlataformas  (aqui: comparacaoPlataformas)
     nexus-ads/web/app/rel-logica.js  ->  nivelCpa                  (aqui: nivelCusto)
                                          gastoMinCor               (aqui: gastoMinimoParaJulgar)
                                          situacaoCampanha          (aqui: situacaoDaCampanha)
                                          POR_QUE_DIFERE_ID         (aqui: POR_QUE_DIFERE)
   O que mudou na vinda: nomes e textos nas palavras da casa ("custo por contato", "serviço fechado",
   "sistema"); a situação da campanha devolve os valores do contrato da API
   (ativa | pausada | encerrada | desconhecida); a entrada é o dado da IndyCar, não o motor do Nexus.
   As contas e os limites são os mesmos.
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');

/* ---------- régua do custo (rel-logica.js: nivelCpa, gastoMinCor) ---------- */

const GASTO_MINIMO = 20;
/** Tolerância padrão acima da meta antes de virar "ruim" (a mesma do núcleo: 35%). */
const TOLERANCIA_PADRAO = 35;

/**
 * Como está o custo por contato contra a meta: 'bom' | 'atencao' | 'ruim' | 'neutro'.
 * Sem meta definida, ou com gasto abaixo do mínimo, não há julgamento ('neutro').
 * Gastou de verdade e não trouxe contato nenhum é 'ruim'; sem saber o gasto, é 'neutro'.
 */
function nivelCusto(custo, meta, gasto = null, minimo = GASTO_MINIMO, toleranciaPc = TOLERANCIA_PADRAO) {
  if (!(+meta > 0)) return 'neutro';
  if (gasto != null && (+gasto || 0) < (Number.isFinite(+minimo) && +minimo >= 0 ? +minimo : GASTO_MINIMO)) return 'neutro';
  if (!T.finito(custo)) return gasto != null ? 'ruim' : 'neutro';
  const tol = Number.isFinite(+toleranciaPc) && +toleranciaPc > 0 ? +toleranciaPc : TOLERANCIA_PADRAO;
  return custo <= meta ? 'bom' : custo <= meta * (1 + tol / 100) ? 'atencao' : 'ruim';
}

/**
 * Gasto mínimo para julgar uma campanha = um dia médio de investimento da conta, entre R$ 5 e R$ 500
 * (campanha de R$ 2 não é "ruim"; conta grande não julga campanha de R$ 30).
 */
function gastoMinimoParaJulgar(gastoMedioDia) {
  const v = +gastoMedioDia;
  if (!Number.isFinite(v) || v <= 0) return GASTO_MINIMO;
  return Math.min(500, Math.max(5, Math.round(v)));
}

/* ---------- situação da campanha (rel-logica.js: situacaoCampanha) ---------- */

const DIAS_PAUSADA = 3;

/**
 * Situação da campanha para o contrato: 'ativa' | 'pausada' | 'encerrada' | 'desconhecida'.
 * O status da plataforma vence; sem status, campanha que não gasta há 3 dias fechados é 'pausada'.
 * `ultimoGasto` é o último dia (AAAA-MM-DD) com gasto; `hoje` é o dia de Brasília.
 */
function situacaoDaCampanha({ status = null, ultimoGasto = null, hoje = null } = {}) {
  const st = String(status || '').trim().toUpperCase();
  if (/REMOV|DELET|ARCHIV|ENCERR/.test(st)) return 'encerrada';
  if (/PAUS|DISABLED|INATIV/.test(st)) return 'pausada';
  if (/^(ACTIVE|ENABLED|ATIVA|ATIVO)$/.test(st)) return 'ativa';
  if (!ultimoGasto || !hoje || !P.dataValida(ultimoGasto) || !P.dataValida(hoje)) return 'desconhecida';
  const ontem = P.somarDias(hoje, -1);
  const diasSemGasto = P.contarDias(ultimoGasto, ontem) - 1;
  return diasSemGasto >= DIAS_PAUSADA ? 'pausada' : 'ativa';
}

/* ---------- plataformas lado a lado (anuncios.js: comparacaoCrmPlataformas) ---------- */

/** Só há "a mais barata" com pelo menos este número de serviços fechados em cada plataforma. */
const AMOSTRA_MINIMA = 3;
const NOME_DA_PLATAFORMA = { meta: 'Meta', google: 'Google' };
const nomeDaPlataforma = p => NOME_DA_PLATAFORMA[p] || (p ? String(p).charAt(0).toUpperCase() + String(p).slice(1) : 'Anúncio');

/**
 * Meta × Google pela régua da oficina (a justa): custo por contato que chegou e por serviço fechado.
 * Entrada: [{ plataforma, gasto, contatos, fecharam }]. Plataforma sem gasto fica de fora.
 * `destaque` só sai com duas plataformas e amostra nas duas.
 */
function comparacaoPlataformas(lista = []) {
  const linhas = (lista || []).filter(x => x && (+x.gasto || 0) > 0).map(x => {
    const gasto = +x.gasto, contatos = +x.contatos || 0, fecharam = +x.fecharam || 0;
    const porContato = T.arredondar(T.dividir(gasto, contatos)), porServico = T.arredondar(T.dividir(gasto, fecharam));
    return {
      plataforma: x.plataforma, custo_por_contato: porContato, custo_por_servico: porServico, fecharam,
      texto: `${nomeDaPlataforma(x.plataforma)}: ${porContato != null ? `${T.dinheiro(porContato)} por contato` : 'nenhum contato'} · ${porServico != null ? `${T.dinheiro(porServico)} por serviço fechado` : 'nenhum serviço fechado'}`,
    };
  });
  const comServico = linhas.filter(l => l.custo_por_servico != null && l.fecharam >= AMOSTRA_MINIMA);
  const melhor = linhas.length === 2 && comServico.length === 2 ? comServico.slice().sort((a, b) => a.custo_por_servico - b.custo_por_servico)[0] : null;
  return { linhas, destaque: melhor ? `Pelos contatos da oficina, o ${nomeDaPlataforma(melhor.plataforma)} trouxe serviço fechado mais barato no período.` : '' };
}

/* ---------- por que os números diferem (rel-logica.js: POR_QUE_DIFERE_ID) ---------- */

const POR_QUE_DIFERE = Object.freeze({
  plataforma: 'A plataforma conta o contato quando a pessoa toca no anúncio e abre a conversa. A oficina só conta quando a primeira mensagem chega.',
  desistiu: 'Quem toca no botão e desiste antes de mandar mensagem conta na plataforma e não na oficina.',
  google: 'O Google conta o que estiver configurado na conta (às vezes em fração, como 1,5). Não são conversas no WhatsApp.',
  aparelho: 'WhatsApp desligado ou número diferente no anúncio fazem contatos sumirem do sistema.',
  origem: 'Contato que chega sem dizer de onde veio não entra em campanha nenhuma: fica na Jornada como "Ainda não sabemos".',
});

/** As frases pedidas, na ordem pedida (id que não existe é ignorado). */
const porQueDifere = (...ids) => ids.map(id => POR_QUE_DIFERE[id]).filter(Boolean);

module.exports = {
  GASTO_MINIMO, TOLERANCIA_PADRAO, DIAS_PAUSADA, AMOSTRA_MINIMA,
  nivelCusto, gastoMinimoParaJulgar, situacaoDaCampanha, comparacaoPlataformas, nomeDaPlataforma, POR_QUE_DIFERE, porQueDifere,
};
