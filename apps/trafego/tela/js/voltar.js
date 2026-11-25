/* ============================================================================
   Botão "voltar" do celular fecha a ficha aberta (rodada 16).
   Abrir a ficha/gaveta guarda uma entrada no histórico; voltar tira a entrada e fecha a gaveta
   (em vez de sair da tela). Fechar por Esc, X ou fora do quadro devolve a entrada sozinho.
   Trocar uma gaveta por outra reaproveita a mesma entrada. O endereço (#/…) não muda.
   ============================================================================ */

const gaveta = { dlg: null, empilhado: false };
const marcada = () => Boolean(history.state && history.state.gaveta);

export function voltarFecha(dlg) {
  gaveta.dlg = dlg;
  if (!gaveta.empilhado) {
    try { history.pushState({ gaveta: true }, '', location.href); gaveta.empilhado = true; } catch { /* sem histórico: só não fecha no voltar */ }
  }
  dlg.addEventListener('close', () => {
    if (gaveta.dlg !== dlg) return;            // outra gaveta tomou o lugar: a entrada continua valendo
    gaveta.dlg = null;
    if (gaveta.empilhado) { gaveta.empilhado = false; if (marcada()) history.back(); }
  });
}

/** Ligar uma vez, na casca. Devolve o que precisa para teste. */
export function ligarVoltar() {
  window.addEventListener('popstate', () => {
    if (gaveta.empilhado && !marcada()) {      // a pessoa voltou (ou foi para outro endereço): fecha a gaveta
      gaveta.empilhado = false;
      const d = gaveta.dlg; gaveta.dlg = null;
      if (d && d.open) d.close();
    } else if (!gaveta.empilhado && marcada() && !document.querySelector('dialog.dlg[open]')) {
      history.back();                          // sobrou uma entrada de gaveta já fechada: pula
    }
  });
}

export const _estado = gaveta;
