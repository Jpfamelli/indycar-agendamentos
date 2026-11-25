/* Rodada 15 (25/11/2026): polimento do dia a dia, sem tela nova.
   1. Hoje: "Carros entregues" mostra 5 e abre o resto num toque (no celular a página passava de 8 mil px).
   2. Funil no celular: faixa de etapas no alto (com a conta de cada uma) para pular de coluna sem arrastar.
   Só usa o que as rodadas anteriores já criaram: renderHoje6, renderKanban, $ e $$. */
const R15_ENT_VISIVEIS = 5;
let R15_ENT_TODOS = false;

/* ---------- 1. carros entregues ---------- */
function encurtarEntregues15() {
  const box = $('#hojeEntregues'); if (!box) return;
  box.querySelector('.r15-ent-mais')?.remove();
  const linhas = [...box.children].filter(x => x.classList.contains('r6-linha'));
  linhas.forEach((x, i) => { x.hidden = !R15_ENT_TODOS && i >= R15_ENT_VISIVEIS; });
  if (linhas.length > R15_ENT_VISIVEIS && !R15_ENT_TODOS) box.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-ghost r15-ent-mais" data-r15-ent>Mostrar os outros ${linhas.length - R15_ENT_VISIVEIS} carros entregues</button>`);
}
const _hoje6_15 = renderHoje6;
renderHoje6 = function () { _hoje6_15(); encurtarEntregues15(); };
$('#hojeEntregues')?.addEventListener('click', e => { if (e.target.closest('[data-r15-ent]')) { R15_ENT_TODOS = true; encurtarEntregues15(); } });

/* ---------- 2. funil no celular: faixa de etapas ---------- */
function faixaEtapas15() {
  const kb = $('#kanban'); if (!kb) return;
  let faixa = $('#r15Etapas');
  if (!faixa) { kb.insertAdjacentHTML('beforebegin', '<nav class="r15-etapas" id="r15Etapas" aria-label="Ir para a etapa"></nav>'); faixa = $('#r15Etapas'); }
  const cols = $$('#kanban .kb-col[data-etapa]');
  faixa.hidden = !cols.length;
  faixa.innerHTML = cols.map(c => `<button type="button" class="r15-etapa" data-r15-etapa="${esc(c.dataset.etapa)}" aria-pressed="false"><span>${esc($('.kb-head span', c)?.textContent || c.dataset.etapa)}</span><b>${esc($('.kb-count', c)?.textContent || '0')}</b></button>`).join('');
  marcarEtapa15();
}
function marcarEtapa15() {
  const kb = $('#kanban'), faixa = $('#r15Etapas'); if (!kb || !faixa) return;
  const cols = $$('#kanban .kb-col[data-etapa]'); if (!cols.length) return;
  const k0 = kb.getBoundingClientRect().left; let atual = cols[0];
  if (kb.clientWidth) for (const c of cols) if (c.getBoundingClientRect().left - k0 <= 24) atual = c;
  $$('.r15-etapa', faixa).forEach(b => {
    const on = b.dataset.r15Etapa === atual.dataset.etapa;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && faixa.scrollWidth > faixa.clientWidth) faixa.scrollTo({ left: b.offsetLeft - (faixa.clientWidth - b.offsetWidth) / 2 });
  });
}
const _kanban15 = renderKanban;
renderKanban = function () { _kanban15(); faixaEtapas15(); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-r15-etapa]'); if (!b) return;
  const col = $(`#kanban .kb-col[data-etapa="${b.dataset.r15Etapa}"]`); if (!col) return;
  const kb = $('#kanban'); kb.scrollTo({ left: kb.scrollLeft + col.getBoundingClientRect().left - kb.getBoundingClientRect().left - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
let _r15Raf = 0;
$('#kanban')?.addEventListener('scroll', () => { cancelAnimationFrame(_r15Raf); _r15Raf = requestAnimationFrame(marcarEtapa15); }, { passive: true });
/* o funil nasce escondido (outra aba): quando aparece, marca a etapa certa */
if (typeof ResizeObserver === 'function' && $('#kanban')) new ResizeObserver(marcarEtapa15).observe($('#kanban'));
