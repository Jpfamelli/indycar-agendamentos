/* Casa, rodada 13 — "Mês da oficina": UM bloco enxuto para o dono (gestor e administrador). Faturamento do mês até
   hoje, a meta com a barra, a projeção pelo ritmo dos dias úteis e quanto falta por dia. Nada de faturamento do dia,
   da semana, conversão, consultores ou gráfico de 7 dias (moram nos apps).
   Lê r6_c1_painel_dono (só o faturamento) e a meta compartilhada em casa_metas (mês "2026-11"). A meta só se muda aqui,
   num campo do próprio bloco. As regras estão em logica5.js (resumoDoMes) e logica2.js (valorDaMeta). */
(function () {
  'use strict';
  const MOD = { nome: 'mes' };
  let C = null, L = null, L2 = null, L5 = null;
  let fat = null, meta = 0, lido = false, erroLeitura = false, editando = false, erroMeta = '', rascunho = '', gravando = false;
  let timer = null, ultima = 0, vez = 0;
  const $ = (s) => document.querySelector(s);
  const reais = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  async function carregar() {
    const minha = ++vez;
    try {
      const [p, m] = await Promise.all([
        C.sb.rpc('r6_c1_painel_dono'),
        C.sb.from('casa_metas').select('valor').eq('mes', L5.mesChave()).maybeSingle(),
      ]);
      if (minha !== vez) return;
      if (p.error) throw p.error;
      fat = (p.data && p.data.faturamento) || {};
      meta = !m.error && m.data ? Number(m.data.valor) || 0 : 0;
      lido = true; erroLeitura = false; ultima = Date.now();
    } catch (e) {
      if (minha !== vez) return;
      erroLeitura = true;
      try { C.sessaoVenceu && C.sessaoVenceu(e); } catch { /* segue */ }
    }
    desenhar();
  }

  function desenhar() {
    const sec = $('#mesOficina'), corpo = $('#mesCorpo'), selo = $('#mesSelo');
    if (!sec || !C) return;
    sec.hidden = false;
    if (!lido) {
      selo.hidden = true;
      corpo.innerHTML = erroLeitura
        ? '<p class="mes-vazio">Não consegui ler o faturamento agora. <button type="button" class="btn-link" data-mes-recarregar>tentar de novo</button></p>'
        : '<p class="mes-vazio">Lendo o mês…</p>';
      return;
    }
    const r = L5.resumoDoMes(fat, meta);
    selo.hidden = !r.selo;
    if (r.selo) { selo.textContent = r.selo.texto; selo.dataset.tom = r.selo.tom; }
    const metaHtml = r.meta
      ? `<div class="mes-barra" aria-hidden="true"><span class="mes-fill" data-w="${r.barra}"></span></div>
         <p class="mes-linha"><b>${r.pct}%</b> da meta de ${C.esc(reais(r.meta))}</p>`
      : '<p class="mes-linha mes-sem-meta">Sem meta para este mês.</p>';
    const conta = [];
    if (r.projecao != null) conta.push(`<div><dt>No ritmo de agora</dt><dd>${C.esc(reais(r.projecao))}</dd><small>${r.passados} de ${r.total} dias úteis passados</small></div>`);
    if (r.batida) conta.push('<div><dt>Meta</dt><dd>batida 🏁</dd></div>');
    else if (r.porDia != null) conta.push(`<div><dt>Falta por dia útil</dt><dd>${C.esc(reais(r.porDia))}</dd><small>${C.esc(reais(r.falta))} em ${r.faltamDias} ${r.faltamDias === 1 ? 'dia' : 'dias'}</small></div>`);
    corpo.innerHTML = `
      <p class="mes-rot">Faturamento de ${C.esc(r.mesNome)} até hoje</p>
      <p class="mes-valor">${C.esc(reais(r.valor))}</p>
      ${r.valor > 0 ? '' : '<p class="mes-apoio">Ainda nenhum "fechou" com valor na Agenda neste mês.</p>'}
      ${metaHtml}
      ${conta.length ? `<dl class="mes-conta">${conta.join('')}</dl>` : ''}
      ${r.semValor > 0 ? `<p class="mes-apoio">${r.semValor} ${r.semValor === 1 ? 'fechamento desta semana está' : 'fechamentos desta semana estão'} sem valor: o faturamento real é maior. <a class="link" href="${C.esc(C.bases.agenda)}" target="${C.esc(L.nomeDaAba('agenda'))}">Abrir a Agenda</a></p>` : ''}
      ${editando ? formulario(r.meta) : `<p class="mes-pe"><button type="button" class="btn-link" data-mes-meta>${r.meta ? 'mudar a meta' : 'definir a meta do mês'}</button></p>`}`;
    /* a CSP da Casa não deixa style="" no HTML: a largura da barra entra pelo CSSOM */
    corpo.querySelectorAll('[data-w]').forEach((e) => { e.style.width = Number(e.dataset.w) + '%'; });
    if (editando) { const i = $('#mesMetaValor'); if (i) { i.focus(); i.select(); } }
  }

  function formulario(m) {
    const valor = erroMeta ? rascunho : (m ? m.toLocaleString('pt-BR') : '');
    return `<form class="meta-form" data-mes-form novalidate>
      <label for="mesMetaValor">Meta de faturamento do mês</label>
      <div class="meta-form-linha"><input id="mesMetaValor" name="valor" inputmode="decimal" autocomplete="off" value="${C.esc(valor)}" placeholder="Ex.: 80.000 ou 80 mil"${erroMeta ? ' aria-invalid="true" aria-describedby="mesMetaErro"' : ''} />
      <button type="submit" class="btn btn-meta"${gravando ? ' disabled' : ''}>Guardar</button><button type="button" class="btn-link" data-mes-cancelar>Cancelar</button></div>
      ${erroMeta ? `<p id="mesMetaErro" class="mes-erro" role="alert">${C.esc(erroMeta)}</p>` : ''}
    </form>`;
  }

  async function guardar(texto) {
    if (gravando) return;
    const v = L2.valorDaMeta(texto);
    if (Number.isNaN(v)) { erroMeta = 'Não entendi o valor. Escreva, por exemplo, 80.000 ou 80 mil.'; rascunho = texto; return desenhar(); }
    gravando = true;
    try {
      const mes = L5.mesChave();
      const r = v
        ? await C.sb.from('casa_metas').upsert({ mes, valor: v, atualizado_por: C.perfil.id, updated_at: new Date().toISOString() }, { onConflict: 'mes' })
        : await C.sb.from('casa_metas').delete().eq('mes', mes);
      if (r.error) throw r.error;
      meta = v || 0; editando = false; erroMeta = ''; rascunho = '';
      C.toast(v ? 'Meta do mês guardada.' : 'Meta do mês tirada.', 'ok');
    } catch {
      erroMeta = 'Não consegui guardar a meta agora. Tente de novo.'; rascunho = texto;
    } finally { gravando = false; desenhar(); }
  }

  function aoClicar(e) {
    if (e.target.closest('[data-mes-recarregar]')) { lido = false; erroLeitura = false; desenhar(); return carregar(); }
    if (e.target.closest('[data-mes-meta]')) { editando = true; erroMeta = ''; return desenhar(); }
    if (e.target.closest('[data-mes-cancelar]')) { editando = false; erroMeta = ''; return desenhar(); }
  }
  function aoEnviar(e) {
    const f = e.target.closest('[data-mes-form]');
    if (!f) return;
    e.preventDefault();
    guardar(f.elements.valor.value);
  }
  function aoTecla(e) { if (e.key === 'Escape' && editando && e.target.closest('[data-mes-form]')) { editando = false; erroMeta = ''; desenhar(); const b = $('[data-mes-meta]'); if (b) b.focus(); } }
  function aoVisivel() { if (!document.hidden && C && Date.now() - ultima > 5 * 60_000 && !editando) carregar(); }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; L2 = window.CasaLogica2; L5 = window.CasaLogica5;
    fat = null; meta = 0; lido = false; erroLeitura = false; editando = false; erroMeta = ''; rascunho = ''; ultima = 0; vez++;
    const sec = $('#mesOficina');
    if (!casa.visao().dono) { sec.hidden = true; return; }
    desenhar();
    carregar();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden && !editando) carregar(); }, 5 * 60_000);
    sec.addEventListener('click', aoClicar); sec.addEventListener('submit', aoEnviar); sec.addEventListener('keydown', aoTecla);
    document.addEventListener('visibilitychange', aoVisivel);
  };
  MOD.desmontar = function () {
    clearInterval(timer); vez++;
    const sec = $('#mesOficina');
    if (sec) { sec.removeEventListener('click', aoClicar); sec.removeEventListener('submit', aoEnviar); sec.removeEventListener('keydown', aoTecla); sec.hidden = true; }
    document.removeEventListener('visibilitychange', aoVisivel);
    fat = null; meta = 0; lido = false;
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
