/* ============================================================================
   Resumo e Campanhas (rodada 11): contas de tela, sem DOM (testadas em
   tela/_testes/r11-resumo.test.mjs). Nada de conta de negócio: gasto,
   contatos e clientes vêm da API; aqui só se agrupa e se dá nome.
   ============================================================================ */

import { ehNumero, partesDaData } from './formato.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Dias da API ([{ data, gasto, contatos_anuncio }]) → semanas de 7 dias a partir do primeiro dia:
 * [{ rotulo: '1 a 7 nov', gasto, contatos }]. Gasto null quando nenhum dia da semana tem gasto.
 */
export function porSemana(dias) {
  const lista = (Array.isArray(dias) ? dias : []).filter((d) => d && partesDaData(d.data));
  const semanas = [];
  for (let i = 0; i < lista.length; i += 7) {
    const grupo = lista.slice(i, i + 7);
    const ini = partesDaData(grupo[0].data), fim = partesDaData(grupo[grupo.length - 1].data);
    const mes = (p) => MESES[p.mes - 1] || '';
    const rotulo = ini.dia === fim.dia && ini.mes === fim.mes ? ini.dia + ' ' + mes(ini)
      : ini.mes === fim.mes ? ini.dia + ' a ' + fim.dia + ' ' + mes(fim) : ini.dia + ' ' + mes(ini) + ' a ' + fim.dia + ' ' + mes(fim);
    const comGasto = grupo.filter((d) => ehNumero(d.gasto));
    semanas.push({
      rotulo,
      gasto: comGasto.length ? Math.round(comGasto.reduce((s, d) => s + d.gasto, 0) * 100) / 100 : null,
      contatos: grupo.reduce((s, d) => s + (ehNumero(d.contatos_anuncio) ? d.contatos_anuncio : 0), 0),
    });
  }
  return semanas;
}

/** Selo da campanha: o tom da API vira palavra curta. Neutro não ganha selo. */
const SELOS = { bom: ['bom', 'Boa'], atencao: ['atencao', 'Atenção'], ruim: ['grave', 'Ruim'] };
export function seloDaCampanha(campanha) {
  const tom = campanha && campanha.leitura && campanha.leitura.tom;
  return SELOS[tom] || null;
}

/** Ordem da lista: quem gastou mais primeiro (é onde está o dinheiro); sem gasto, por contatos. */
export function ordenarCampanhas(lista) {
  const v = (x, k) => (ehNumero(x[k]) ? x[k] : -1);
  return (Array.isArray(lista) ? lista : []).filter(Boolean).slice()
    .sort((a, b) => v(b, 'gasto') - v(a, 'gasto') || v(b, 'contatos') - v(a, 'contatos') || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}
