/* Rodada 16 (25/11/2026): polimento.
   Contatos: faixa de atalhos (Todos, Meus, Sem responsável, Parados) fora da gaveta "Mais filtros".
   Os atalhos só mexem nos filtros que já existem (#fResp e #soParados) e acompanham o que a pessoa escolher lá dentro.
   Usa só o que as rodadas anteriores criaram: refiltrarTela, salvarResp, $ e $$. */
const R16_ATALHOS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'meus', rotulo: 'Meus' },
  { id: 'sem', rotulo: 'Sem responsável' },
  { id: 'parados', rotulo: 'Parados' }
];
function atalhoAtual16(resp, parados) {
  if (parados) return 'parados';
  if (resp === 'meus') return 'meus';
  if (resp === 'sem') return 'sem';
  return resp ? '' : 'todos';
}
function marcarAtalhos16() {
  const faixa = $('#r16Atalhos'); if (!faixa) return;
  const atual = atalhoAtual16($('#fResp')?.value || '', !!$('#soParados')?.checked);
  $$('.r16-atalho', faixa).forEach(b => b.setAttribute('aria-pressed', b.dataset.r16 === atual ? 'true' : 'false'));
}
function montarAtalhos16() {
  const filtros = $('#view-leads .filters'); if (!filtros || $('#r16Atalhos')) return;
  filtros.insertAdjacentHTML('afterbegin', `<div class="r16-atalhos" id="r16Atalhos" role="group" aria-label="Atalhos da lista">${R16_ATALHOS.map(a => `<button type="button" class="r16-atalho" data-r16="${a.id}" aria-pressed="false">${a.rotulo}</button>`).join('')}</div>`);
  $('#r16Atalhos').addEventListener('click', e => {
    const b = e.target.closest('[data-r16]'); if (!b) return;
    const id = b.dataset.r16;
    $('#fResp').value = id === 'meus' ? 'meus' : id === 'sem' ? 'sem' : '';
    $('#soParados').checked = id === 'parados';
    salvarResp(); PAG_LEADS = 1; refiltrarTela(); marcarAtalhos16();
  });
  $('#fResp')?.addEventListener('change', () => setTimeout(marcarAtalhos16, 0));
  $('#soParados')?.addEventListener('change', () => setTimeout(marcarAtalhos16, 0));
  $('#limparFiltros')?.addEventListener('click', () => setTimeout(marcarAtalhos16, 0));
  marcarAtalhos16();
}
montarAtalhos16();
/* outros botões do app (Ver na lista, Painel, Funil) também mexem nesses filtros: depois de qualquer clique o atalho acompanha */
document.addEventListener('click', () => setTimeout(marcarAtalhos16, 50));
if (typeof ResizeObserver === 'function' && $('#view-leads')) new ResizeObserver(marcarAtalhos16).observe($('#view-leads'));
