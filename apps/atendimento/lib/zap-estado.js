/* ============================================================
   Estado do WhatsApp visto pelo servidor (Rodada 6 — C3)

   Quando o CodeWords recusa a chave (401), o WhatsApp da oficina desconecta
   ou a cota acaba, TODO envio falha do mesmo jeito. Insistir só gasta cota,
   enche o log de erro e — pior — pode misturar "não saiu" com "sem
   confirmação". Este disjuntor lembra do problema por um tempo e faz o
   próximo envio falhar NA HORA, sem rede, dizendo o motivo.

   - marcar(codigo): o envio falhou por um motivo que vale para todos os envios
   - limpar(): um envio deu certo, ou a chave foi trocada
   - passar(): pode tentar agora? Durante a pausa só UMA sondagem por janela
     passa para descobrir se voltou (as outras falham rápido).
   Nunca reenvia nada sozinho: só decide se vale a pena tentar.
   ============================================================ */
'use strict';

const CODIGOS_QUE_PARAM = new Set(['codewords-401', 'whatsapp-desconectado', 'cota']);

const TEXTO = {
  'codewords-401': 'WhatsApp parado: a chave do CodeWords foi recusada (401). Troque em Configurações › Integrações',
  'whatsapp-desconectado': 'WhatsApp parado: o celular da oficina está desconectado. Reconecte em Configurações › Conexão do WhatsApp',
  cota: 'WhatsApp parado: a cota do CodeWords acabou. Renove o plano ou aguarde virar o mês',
};

function criarZap({ agora = () => Date.now(), pausaMs = 90_000, sondagemMs = 30_000 } = {}) {
  let estado = null;            // { codigo, desde, ultimaTentativa, vezes }
  let sondando = false;

  return {
    /** O motivo vale para todos os envios? (só esses param o disjuntor) */
    ehPararTudo(codigo) { return CODIGOS_QUE_PARAM.has(codigo); },

    marcar(codigo) {
      if (!CODIGOS_QUE_PARAM.has(codigo)) return false;
      const t = agora();
      if (estado && estado.codigo === codigo) { estado.ultimaTentativa = t; estado.vezes++; }
      else estado = { codigo, desde: t, ultimaTentativa: t, vezes: 1 };
      sondando = false;
      return true;
    },

    limpar() { const tinha = !!estado; estado = null; sondando = false; return tinha; },

    /** { parado, codigo, desde, texto } — sem efeito colateral. */
    estado() {
      if (!estado) return { parado: false };
      return { parado: true, codigo: estado.codigo, desde: new Date(estado.desde).toISOString(), vezes: estado.vezes,
        texto: TEXTO[estado.codigo] || 'WhatsApp parado.' };
    },

    /**
     * Posso tentar enviar agora? { tentar:true } ou { tentar:false, codigo, texto }.
     * Passada a pausa, UMA sondagem sai; se der certo `limpar()`, se falhar `marcar()` de novo.
     */
    passar() {
      if (!estado) return { tentar: true };
      const t = agora();
      if (t - estado.ultimaTentativa >= (estado.vezes > 3 ? pausaMs : sondagemMs) && !sondando) {
        sondando = true;
        return { tentar: true, sondagem: true };
      }
      return { tentar: false, codigo: estado.codigo, texto: TEXTO[estado.codigo] || 'WhatsApp parado.' };
    },

    /** A sondagem terminou sem decidir (erro de outro tipo): libera a próxima. */
    fimDaSondagem() { sondando = false; if (estado) estado.ultimaTentativa = agora(); },
  };
}

module.exports = { criarZap, CODIGOS_QUE_PARAM, TEXTO };
