/* Rodada 17 (25/11/2026): o fluxo de quem atende, medido no servidor de mentira.
   1. Atendente: a Fila do dia (e os retornos combinados) sobe para logo depois do resumo. Antes o primeiro
      "Registrar" ficava a quase 4 telas de rolagem no celular.
   2. A fila que se atualiza sozinha (45 s) ou depois de registrar não fecha a "Mensagem sugerida" aberta
      nem tira o foco do botão (o esqueleto que fazia a página pular saiu de rodada7.js).
   3. Registrar contato: "O que aconteceu" virou botões de um toque (antes era uma lista de escolher).
   4. Resumo da atendente: "pedem retorno" conta também os contatos sem responsável da fila; agora diz quantos.
   Usa o que as rodadas anteriores criaram: $, $$, esc, H6, R7, SOU_GESTOR, renderHoje6, renderHoje13, abrirDlg, RESULTADOS6. */

/* ---------- 1 e 2: a fila do dia ---------- */
let R17_SEM = null;
function filaFiltrada17() { return !!(H6.motivo || (typeof R7 !== 'undefined' && (R7.hoje.q || R7.hoje.origem))); }
function subirFila17() {
  if (SOU_GESTOR) return;
  const heroi = $('#r13Heroi'), fila = $('#hojeLista')?.closest('.card'); if (!heroi || !fila) return;
  if (heroi.nextElementSibling !== fila) heroi.after(fila);
  const ret = $('#r7Retornos'); if (ret && fila.nextElementSibling !== ret) fila.after(ret);
}
const _hoje6_17 = renderHoje6;
renderHoje6 = function () {
  const lista = $('#hojeLista');
  const abertos = new Set([...(lista?.querySelectorAll('.r6-linha details[open]') || [])].map(d => d.closest('.r6-linha')?.dataset.lead));
  const foco = document.activeElement && lista?.contains(document.activeElement) ? document.activeElement : null;
  const alvoFoco = foco ? { acao: foco.dataset.h6 || foco.dataset.h6c || '', id: foco.dataset.id || foco.closest('.r6-linha')?.dataset.lead || '' } : null;
  const d = H6.dados;
  if (d && !filaFiltrada17() && Number.isFinite(d.sem_responsavel)) R17_SEM = d.sem_responsavel;
  _hoje6_17();
  subirFila17();
  if (!lista) return;
  for (const id of abertos) { const det = lista.querySelector(`.r6-linha[data-lead="${CSS.escape(String(id))}"] details`); if (det) det.open = true; }
  if (alvoFoco?.acao && alvoFoco.id) {
    const b = lista.querySelector(`[data-h6="${CSS.escape(alvoFoco.acao)}"][data-id="${CSS.escape(alvoFoco.id)}"], [data-h6c="${CSS.escape(alvoFoco.acao)}"][data-id="${CSS.escape(alvoFoco.id)}"]`);
    if (b && !document.querySelector('dialog[open]')) b.focus({ preventScroll: true });
  }
};

/* ---------- 4: o número "pedem retorno" da atendente diz quantos são sem responsável ---------- */
function rotuloRetorno17(total, sem, gestor) {
  const base = total === 1 ? 'pede retorno' : 'pedem retorno';
  if (gestor || !(sem > 0) || !Number.isFinite(total)) return base;
  return sem >= total ? `${base}, todos sem responsável` : `${base}, ${sem} sem responsável`;
}
const _hoje13_17 = renderHoje13;
renderHoje13 = function () {
  _hoje13_17();
  const b = $('#r13Nums [data-r13-ir="retorno"] span'); if (!b) return;
  const total = Number.parseInt(b.previousElementSibling?.textContent, 10);
  b.textContent = rotuloRetorno17(total, R17_SEM, SOU_GESTOR);
};

/* ---------- 3: registrar contato com um toque no resultado ---------- */
function montarChips17() {
  const sel = $('#ct6Res'); if (!sel || $('#r17Res')) return;
  const rot = sel.closest('label'); if (!rot) return;
  rot.hidden = true;
  rot.insertAdjacentHTML('beforebegin', `<fieldset class="r17-res" id="r17Res"><legend>O que aconteceu</legend><div class="r17-chips">${RESULTADOS6.filter(([v]) => v).map(([v, r]) => `<button type="button" class="r17-chip" data-r17res="${esc(v)}" aria-pressed="false">${esc(r)}</button>`).join('')}</div></fieldset>`);
  $('#r17Res').addEventListener('click', e => {
    const b = e.target.closest('[data-r17res]'); if (!b) return;
    sel.value = sel.value === b.dataset.r17res ? '' : b.dataset.r17res;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    marcarChips17();
    if (sel.value) $('#ct6Erro').textContent = '';
  });
}
function marcarChips17() { const v = $('#ct6Res')?.value || ''; $$('#r17Res [data-r17res]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r17res === v))); }
const _abrirDlg17 = abrirDlg;
abrirDlg = function (dlg) {
  if (dlg?.id === 'dlgContato6') { montarChips17(); marcarChips17(); }
  return _abrirDlg17(dlg);
};

if (typeof module !== 'undefined') module.exports = { rotuloRetorno17 };
