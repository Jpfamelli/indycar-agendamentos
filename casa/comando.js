/* Casa — Pátio e Orçador no ar? (rodada 6, C1b; enxugado na rodada 11). O Pátio e o Orçador moram em outro endereço:
   a Central confere de minuto em minuto se respondem e, se um cair, a Casa avisa no alto e marca o cartão do app.
   Rodada 11: saíram o clima da oficina, o "Meu dia", recolher cartões, a paleta de comandos e o resumo do dono.
   Usa CasaLogica2 (regras puras, testadas). Nada aqui grava no banco. */
(function () {
  'use strict';
  const MOD = { nome: 'comando' };
  let C = null, M = null, timerSaude = null, ultimaSaude = null, falhasSaude = 0, saudeEm = 0;
  const $ = (s) => document.querySelector(s);

  async function verificarApps({ forcar = false } = {}) {
    let s = null;
    saudeEm = Date.now();
    try {
      const r = await fetch('/api/central/saude-apps', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (r.ok) s = await r.json();
    } catch { /* sem internet: o aviso de rede cuida */ }
    if (!C) return;
    if (!s) { falhasSaude++; if (falhasSaude >= 2 && navigator.onLine) semLeituraDosApps(); return; }
    falhasSaude = 0;
    const voltou = M.voltaramAoAr(ultimaSaude, s);
    ultimaSaude = s;
    if (voltou.length) C.toast(voltou.length === 1 ? `${voltou[0]} voltou ao ar.` : `${voltou.join(' e ')} voltaram ao ar.`, 4500);
    pintarSaude(s);
    try { C.aoSaudeApps && C.aoSaudeApps(s); } catch { /* a faixa de saúde é um extra */ }
    if (forcar && !voltou.length && !M.avisosDeApps(s).length) C.toast('Pátio e Orçador estão respondendo.', 2500);
  }
  /* rodada 10: na segunda falha seguida da própria conferência, com internet, a Casa diz que não conseguiu conferir */
  function semLeituraDosApps() {
    const box = $('#avisoApps');
    if (!box || box.querySelector('[data-app-fora]')) return;   // um aviso de app fora do ar, já na tela, vale mais
    box.hidden = false;
    box.innerHTML = '<div class="aviso-app" data-sem-leitura><strong>Não consegui conferir se o Pátio e o Orçador estão no ar.</strong> <span>Se um deles não abrir, espere um minuto e tente de novo.</span></div><button type="button" class="btn-link" data-verificar-apps>verificar de novo</button>';
  }
  function pintarSaude(s) {
    const av = M.avisosDeApps(s);
    const box = $('#avisoApps');
    const fora = new Set(av.map((a) => a.app));
    if (box) {
      box.hidden = !av.length;
      box.innerHTML = av.map((a) => `<div class="aviso-app" data-app-fora="${C.esc(a.app)}"><strong>⚠ ${C.esc(a.texto)}</strong>
        <span>${a.desdeHora ? `Desde as ${C.esc(a.desdeHora)}. ` : ''}${C.esc(M.PLANO_B[a.app] || '')}</span></div>`).join('')
        + (av.length ? '<button type="button" class="btn-link" data-verificar-apps>verificar de novo</button>' : '');
    }
    document.querySelectorAll('.grade-apps .app').forEach((el) => {
      const f = fora.has(el.dataset.app);
      el.classList.toggle('app-fora-do-ar', f);
      el.title = f ? 'Este app não está respondendo agora. Clique só se precisar.' : '';
    });
  }

  function clicarNoMiolo(e) { if (e.target.closest('[data-verificar-apps]')) verificarApps({ forcar: true }); }
  function aoVisivel() { if (!document.hidden && C && C.perfil && Date.now() - saudeEm > 30_000) verificarApps(); }   // rodada 10: a resposta vale 40 s no servidor

  MOD.montar = function (casa) {
    C = casa; M = window.CasaLogica2; ultimaSaude = null; falhasSaude = 0;
    C.verificarApps = verificarApps;
    verificarApps();
    clearInterval(timerSaude);
    timerSaude = setInterval(() => { if (!document.hidden) verificarApps(); }, 60_000);
    $('#miolo').addEventListener('click', clicarNoMiolo);
    document.addEventListener('visibilitychange', aoVisivel);
  };
  MOD.desmontar = function () {
    clearInterval(timerSaude);
    document.removeEventListener('visibilitychange', aoVisivel);
    try { $('#miolo').removeEventListener('click', clicarNoMiolo); } catch { /* sem miolo */ }
    ultimaSaude = null; C = null;
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
