/* Casa — atalhos de teclado (rodada 6). Ctrl+K ou "/" busca; "g" + letra abre o app na aba dele;
   "n" nova tarefa, "s" sino, "r" atualizar, "?" ajuda. Nunca dispara com a pessoa digitando num campo. */
(function () {
  'use strict';
  const MOD = { nome: 'atalhos' };
  let C = null, L = null, esperandoG = false, timerG = null, aberta = false, ultimoFoco = null, dicaG = null;
  const $ = (s) => document.querySelector(s);

  function abrirAjuda() {
    if (aberta) return;
    aberta = true; ultimoFoco = document.activeElement;
    $('#ajudaLista').innerHTML = L.AJUDA_ATALHOS.map(([k, d]) => `<div><dt>${k.split(/\s{2,}/).map((p) => `<kbd>${C.esc(p)}</kbd>`).join(' ')}</dt><dd>${C.esc(d)}</dd></div>`).join('');
    $('#ajuda').hidden = false;
    document.body.classList.add('modal-aberto');
    $('#ajudaFechar').focus();
  }
  function fecharAjuda() {
    if (!aberta) return;
    aberta = false; $('#ajuda').hidden = true; document.body.classList.remove('modal-aberto');
    try { ultimoFoco && ultimoFoco.focus && ultimoFoco.focus(); } catch { /* sumiu */ }
  }

  function dica(texto) {
    const t = $('#toast');
    t.textContent = texto; t.hidden = false;
    clearTimeout(dicaG); dicaG = setTimeout(() => { if (t.textContent === texto) t.hidden = true; }, 1300);
  }

  function teclado(e) {
    if (!C || !C.perfil) return;
    if (e.key === 'Escape') {
      if (aberta) { e.preventDefault(); fecharAjuda(); }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    // Ctrl/⌘ + K funciona até dentro de campos
    if (mod && !e.altKey && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      C.busca && (C.busca.aberta() ? C.busca.fechar() : C.busca.abrir());
      return;
    }
    if (mod || e.altKey) return;
    if (L.ehCampo(e.target) || (C.busca && C.busca.aberta()) || aberta || document.body.classList.contains('modal-aberto')) return;
    const k = e.key;
    if (esperandoG) {
      esperandoG = false; clearTimeout(timerG);
      const app = L.ATALHOS_G[String(k).toLowerCase()];
      if (app) {
        e.preventDefault();
        if (C.podeUsar(app)) C.abrirNaAba(C.bases[app]); else C.toast(`Você não tem acesso ao ${L.APPS[app].nome}.`);
      }
      return;
    }
    if (k === '/') { e.preventDefault(); C.busca && C.busca.abrir(); }
    else if (k === '?') { e.preventDefault(); abrirAjuda(); }
    else if (k === 'g' || k === 'G') { esperandoG = true; dica('g…  a Agenda · t Atendimento · c CRM · m Comunicar · p Pátio · o Orçador'); clearTimeout(timerG); timerG = setTimeout(() => { esperandoG = false; }, 1500); }
    else if (/^[1-6]$/.test(k)) {
      const app = window.CasaLogica2.ATALHOS_NUMERO[k];
      e.preventDefault();
      if (C.podeUsar(app)) C.abrirNaAba(C.bases[app]); else C.toast(`Você não tem acesso ao ${L.APPS[app].nome}.`);
    }
    else if (k === 'd' || k === 'D') { if (C.visao().dono && C.painel) { e.preventDefault(); C.painel.trocarVisao(C.painel.visao() === 'dono' ? 'operacao' : 'dono'); } }
    else if (k === 'j' || k === 'k' || k === 'J' || k === 'K') {
      const itens = [...document.querySelectorAll('#atencaoLista .atencao-item')];
      if (!itens.length) return;
      e.preventDefault();
      const i = itens.indexOf(document.activeElement);
      const prox = /j/i.test(k) ? (i + 1) % itens.length : (i <= 0 ? itens.length - 1 : i - 1);
      itens[prox].focus();
    }
    else if (k === 'h' || k === 'H') { if (C.saude) { e.preventDefault(); C.saude.abrir(); } }
    else if (k === 'e' || k === 'E') { if (C.recolherTodos) { e.preventDefault(); C.recolherTodos(); } }
    else if (k === 't' || k === 'T') { const t = document.querySelector('#tTarefas'); if (t) { e.preventDefault(); t.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
    else if (k === 'n' || k === 'N') { e.preventDefault(); C.focarTarefa && C.focarTarefa(); }
    else if (k === 's' || k === 'S') { e.preventDefault(); C.alternarSino && C.alternarSino(); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); C.painel && C.painel.atualizar(); C.toast('Atualizando…', 1200); }
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; esperandoG = false;
    $('#bAjuda').onclick = abrirAjuda;
    $('#ajudaFechar').onclick = fecharAjuda;
    $('#ajuda').onclick = (e) => { if (e.target.id === 'ajuda') fecharAjuda(); };
    document.addEventListener('keydown', teclado);
  };
  MOD.desmontar = function () { document.removeEventListener('keydown', teclado); fecharAjuda(); esperandoG = false; C = C && null; };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
