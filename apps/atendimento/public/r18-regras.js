/* Rodada 18: regras puras da tela (fila do consultor em ordem de espera e textos do encerrar em lote).
   Serve à tela (window.R18Regras) e aos testes (require). */
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.R18Regras = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIAS = [7, 15, 30, 60, 90];
  const PAPEIS_LOTE = ['admin', 'gestor', 'atendente'];

  /** Desde quando a conversa espera o consultor (a data em que a IA passou, ou a última mensagem). */
  const esperaDesde = (c) => (c && (c.aguardando_desde || c.ultima_mensagem_em)) || '';

  /** Fila "esperando o consultor": quem espera há mais tempo primeiro, sempre (não depende do seletor de ordem). */
  function ordenarEspera(lista) {
    return [...(lista || [])].sort((a, b) => {
      const da = esperaDesde(a), db = esperaDesde(b);
      if (!da && db) return 1;
      if (da && !db) return -1;
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }

  function dataCurta(iso) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return '';
    const p = new Date(t - 3 * 3600_000);   // fuso de SP, sem horário de verão
    return `${String(p.getUTCDate()).padStart(2, '0')}/${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  const conversas = (n) => `${n} conversa${n === 1 ? '' : 's'}`;

  /** Linha da barra: quantas e desde quando. */
  function textoContagem({ total = 0, dias = 30, mais_antiga = null, acima_do_teto = false, teto = 500 } = {}) {
    if (!total) return `Nenhuma conversa espera o consultor há mais de ${dias} dias.`;
    const desde = dataCurta(mais_antiga);
    return `${acima_do_teto ? `Mais de ${teto}` : conversas(total)} ${total === 1 && !acima_do_teto ? 'espera' : 'esperam'} o consultor há mais de ${dias} dias${desde ? ` (a mais antiga desde ${desde})` : ''}.`
      + (acima_do_teto ? ` Encerra ${teto} por vez.` : '');
  }

  /** Texto da confirmação: o que acontece e o que NÃO acontece. */
  function textoConfirmar(total, dias) {
    return `${conversas(total)} paradas há mais de ${dias} dias saem da fila do consultor e ficam como resolvidas.\n`
      + 'Nenhuma mensagem é apagada e o fechou / não fechou não muda. Se o cliente escrever de novo, a conversa reabre sozinha.\n'
      + 'Fica registrado que foi você, e dá para desfazer por 24 horas.';
  }

  function textoFeito(encerradas, quando) {
    const t = Date.parse(quando || '');
    const hora = Number.isFinite(t) ? (() => { const p = new Date(t - 3 * 3600_000); return `${String(p.getUTCHours()).padStart(2, '0')}:${String(p.getUTCMinutes()).padStart(2, '0')}`; })() : '';
    return `✓ ${conversas(encerradas)} encerrada${encerradas === 1 ? '' : 's'} por você${hora ? ` às ${hora}` : ''}.`;
  }

  const podeEncerrar = (papel) => PAPEIS_LOTE.includes(papel);

  return { DIAS, ordenarEspera, esperaDesde, dataCurta, textoContagem, textoConfirmar, textoFeito, podeEncerrar };
});
