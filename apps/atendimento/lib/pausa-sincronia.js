'use strict';

/* Rodada 8: quando o CodeWords recusa a chave (401/403), a sincronia de 40 em 40 s pedia de novo para cada uma das
   12 conversas, a cada rodada, e enchia o registro do servidor de "sincronia: 401" (milhares por dia, por 48 dias).
   Com a chave recusada, nenhuma conversa vai passar: a rodada para na primeira recusa e a próxima espera, dobrando
   de 5 em 5 min até 1 h. Uma linha no registro por pausa. Quando o CodeWords volta a aceitar, zera tudo.
   O botão "sincronizar" da tela (uma conversa só) não passa por aqui: quem pede na mão sempre tenta. */

const PRIMEIRA_MS = 5 * 60_000;
const MAXIMA_MS = 60 * 60_000;

function criarPausaSincronia({ agora = () => Date.now(), log = console.error } = {}) {
  let recusas = 0;
  let proximaEm = 0;
  return {
    recusada(status) {
      recusas++;
      const espera = Math.min(PRIMEIRA_MS * 2 ** (recusas - 1), MAXIMA_MS);
      proximaEm = agora() + espera;
      log(`sincronia: o CodeWords recusou a chave (${status}) ${recusas}x seguida(s); próxima tentativa em ${Math.round(espera / 60_000)} min`);
    },
    aceita() {
      if (recusas) log(`sincronia: o CodeWords voltou a aceitar a chave depois de ${recusas} recusa(s)`);
      recusas = 0; proximaEm = 0;
    },
    emPausa() { return agora() < proximaEm; },
    estado() { return { recusas, proximaEm }; },
  };
}

const ehRecusa = (status) => status === 401 || status === 403;

module.exports = { criarPausaSincronia, ehRecusa, PRIMEIRA_MS, MAXIMA_MS };
