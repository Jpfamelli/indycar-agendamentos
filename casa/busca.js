/* Casa — busca global (Ctrl+K ou "/"): telefone, nome, placa ou número da OS/orçamento em TODOS os
   sistemas de uma vez (r6_busca_global, do X3). Cada resultado abre na aba nomeada do app dele, já no
   registro certo; clientes trazem atalhos para as outras telas (CRM, conversa, Comunicar, orçamento). */
(function () {
  'use strict';
  const MOD = { nome: 'busca' };
  const LS_RECENTES = 'indycar_central_buscas';
  let C = null, L = null, N = null, aberta = false, seq = 0, timer = null, ativo = -1, ultimoFoco = null, ultimaBusca = '';
  const $ = (s) => document.querySelector(s);

  const recentes = () => { try { return JSON.parse(localStorage.getItem(LS_RECENTES) || '[]').filter((x) => typeof x === 'string').slice(0, 6); } catch { return []; } };
  function guardarRecente(q) {
    const t = String(q || '').trim();
    if (t.length < 2 || t.startsWith('>')) return;
    try { localStorage.setItem(LS_RECENTES, JSON.stringify([t, ...recentes().filter((x) => x !== t)].slice(0, 6))); } catch { /* sem armazenamento */ }
  }

  const linhasNav = () => [...document.querySelectorAll('#buscaLista [data-linha]')];
  function marcarAtivo(i) {
    const ls = linhasNav();
    if (!ls.length) { ativo = -1; return; }
    ativo = (i + ls.length) % ls.length;
    ls.forEach((el, k) => el.classList.toggle('ativa', k === ativo));
    ls[ativo].scrollIntoView({ block: 'nearest' });
    $('#buscaInput').setAttribute('aria-activedescendant', ls[ativo].id);
    /* rodada 9: sem a lista falsa de opções (o leitor de tela acusava erro grave); quem usa leitor ouve o item marcado pelas setas */
    const an = $('#buscaAnuncio');
    if (an) an.textContent = (ls[ativo].getAttribute('aria-label') || ls[ativo].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  }

  /* rodada 11: a tela inicial da busca mostra só as buscas recentes. Saíram a paleta de comandos (">") e o "Ir para"
     (repetia os cartões de app da Casa). */
  function telaInicial() {
    const r = recentes();
    $('#buscaDica').textContent = '';
    $('#buscaFiltros').hidden = true; filtroBusca = '';
    $('#buscaLista').innerHTML =
      (r.length ? `<section class="busca-grupo"><h3>Buscas recentes <button type="button" class="busca-mini" data-limpar-recentes>limpar</button></h3>${r.map((x, i) => `<button type="button" class="busca-rec" data-linha id="br-${i}" data-recente="${C.esc(x)}" aria-label="Buscar de novo: ${C.esc(x)}">🕘 ${C.esc(x)}</button>`).join('')}</section>` : '');
    ativo = -1;
  }

  let filtroBusca = '', ultimoRes = null, ultimoQ = '';
  /** Chips de tipo (Tudo · Pessoas · Pátio · Orçamentos…) com a contagem real do banco; só aparecem quando há mais de um tipo. */
  function desenharFiltros(grupos, pessoas, contagens) {
    const box = $('#buscaFiltros');
    const f = N.filtrosDaBusca(grupos, contagens);
    if (pessoas.length) f.splice(1, 0, { k: 'pessoas', nome: 'Pessoas', n: pessoas.length });
    box.hidden = f.length <= 2;
    box.innerHTML = f.length <= 2 ? '' : f.map((x) => `<button type="button" data-filtro-busca="${C.esc(x.k)}" aria-pressed="${filtroBusca === x.k}">${C.esc(x.nome)} <b>${x.n}</b></button>`).join('');
  }
  function blocoPessoas(pessoas) {
    if (!pessoas.length) return '';
    return `<section class="busca-grupo busca-pessoas" aria-label="Pessoas"><h3>👤 Pessoas <small>${pessoas.length}</small></h3>${pessoas.map((p, i) => `<div class="busca-item">
      <button type="button" class="busca-linha busca-pessoa" id="bp-${i}" data-linha data-ficha data-tel="${C.esc(p.tel55)}" data-nome="${C.esc(p.nome)}">
        <span class="b-tit">${L.destacar(p.nome, ultimoQ)}</span><span class="b-det">${C.esc(p.telefone)} · está em ${C.esc(p.achouEm.join(', ') || 'nenhum sistema')}</span><span class="pil">Ver ficha</span></button>
      <span class="busca-atalhos"><button type="button" class="busca-mini" data-copiar-tel="${C.esc(p.tel55)}" aria-label="Copiar telefone de ${C.esc(p.nome)}">Copiar telefone</button></span></div>`).join('')}</section>`;
  }

  function desenhar(res, q) {
    ultimoRes = res; ultimoQ = q;
    const todos = L.filtrarPorPermissao(L.linhasDaBusca(res, C.perfil, C.bases), C.perfil);
    const pessoas = C.ficha ? N.pessoasDaBusca(res.vazio ? null : { pessoas: res.pessoas }) : [];
    const lista = $('#buscaLista');
    if (!todos.length && !pessoas.length) {
      const c = L.classificarBusca(q);
      const tel = c.tipo === 'telefone' ? L.telefoneE164(q) : '';
      $('#buscaDica').textContent = '';
      $('#buscaFiltros').hidden = true;
      lista.innerHTML = `<p class="vazio">Nada achado para “${C.esc(q)}” em nenhum sistema.</p>` + (tel ? `
        <section class="busca-grupo"><h3>Telefone novo</h3><div class="busca-ir">
          ${C.podeUsar('agenda') ? `<a href="${C.esc(C.links.agendaNovo({ telefone: tel }))}" target="${L.nomeDaAba('agenda')}" data-linha id="bl-n1">📅 Marcar horário</a>` : ''}
          ${C.podeUsar('atendimento') ? `<a href="${C.esc(C.links.conversaTel(tel))}" target="${L.nomeDaAba('atendimento')}" data-linha id="bl-n2">💬 Abrir conversa</a>` : ''}
          ${C.podeUsar('orcador') ? `<a href="${C.esc(C.links.novoOrcamento({ telefone: tel }))}" target="${L.nomeDaAba('orcador')}" data-linha id="bl-n3">🧾 Novo orçamento</a>` : ''}
          ${C.podeUsar('crm') ? `<a href="${C.esc(C.links.crmTel({ telefone: tel }))}" target="${L.nomeDaAba('crm')}" data-linha id="bl-n4">📈 Ver no CRM</a>` : ''}
          <button type="button" class="busca-mini" data-copiar-tel="${C.esc(tel)}" data-linha id="bl-n5">📋 Copiar telefone</button>
        </div></section>` : '');
      ativo = -1; if (linhasNav().length) marcarAtivo(0);
      return;
    }
    desenharFiltros(todos, pessoas, res.contagens);
    if (filtroBusca && filtroBusca !== 'pessoas' && !todos.some((g) => g.k === filtroBusca)) filtroBusca = '';
    if (filtroBusca === 'pessoas' && !pessoas.length) filtroBusca = '';
    const grupos = filtroBusca && filtroBusca !== 'pessoas' ? todos.filter((g) => g.k === filtroBusca) : (filtroBusca === 'pessoas' ? [] : todos);
    const mostraPessoas = !filtroBusca || filtroBusca === 'pessoas';
    const total = grupos.reduce((s, g) => s + g.linhas.length, 0);
    $('#buscaDica').textContent = N.dicaDaBusca(total, pessoas.length, todos.length);
    let n = 0;
    lista.innerHTML = (mostraPessoas ? blocoPessoas(pessoas) : '') + grupos.map((g) => {
      const alem = N.alemDoCorte(g, res.contagens);
      return `
      <section class="busca-grupo" aria-label="${C.esc(g.nome)}"><h3>${g.ico} ${C.esc(g.nome)} <small>${g.linhas.length}${alem ? ' de ' + (g.linhas.length + alem) : ''}</small></h3>
      ${g.linhas.map((r) => {
        const id = 'bl-' + (n++);
        return `<div class="busca-item" data-tel="${C.esc(r.tel || '')}">
          <a class="busca-linha" id="${id}" data-linha href="${C.esc(r.url)}" target="${C.esc(L.nomeDaAba(r.app))}" data-guardar>
            <span class="b-tit">${L.destacar(r.titulo, q)}</span>
            <span class="b-det">${L.destacar(r.detalhe || '', q)}</span>
            ${r.selo ? `<span class="pil${r.seloTom ? ' pil-' + r.seloTom : ''}">${C.esc(r.selo)}</span>` : ''}${r.etapa ? `<span class="pil pil-aviso">🔧 ${C.esc(r.etapa)}</span>` : ''}
          </a>
          ${(r.atalhos && r.atalhos.length) || r.tel ? `<span class="busca-atalhos">${r.tel && C.ficha ? `<button type="button" class="busca-mini" data-ficha data-tel="${C.esc(r.tel)}" data-nome="${C.esc(r.titulo)}">Ficha</button>` : ''}${(r.atalhos || []).map((a) => `<a href="${C.esc(a.url)}" target="${C.esc(L.nomeDaAba(a.app))}" data-guardar>${C.esc(a.rotulo)} ↗</a>`).join('')}</span>` : ''}
        </div>`;
      }).join('')}${alem ? `<p class="busca-corte">Mostrando ${g.linhas.length} de ${g.linhas.length + alem}: digite mais para afinar.</p>` : ''}</section>`;
    }).join('');
    marcarAtivo(0);
  }

  async function buscar(texto) {
    const q = String(texto || '').trim();
    ultimaBusca = q;
    if (q.length < 2) { telaInicial(); return; }
    const c = L.classificarBusca(q);
    if (!c.valido) { telaInicial(); return; }
    const minha = ++seq;
    $('#buscaDica').textContent = 'Buscando…';
    try {
      const { data, error } = await C.sb.rpc('r6_busca_global', { p_termo: q, p_limite: 5 }).abortSignal(AbortSignal.timeout(15000));   // rodada 10: "Buscando…" não fica para sempre
      if (minha !== seq) return;     // chegou uma busca mais nova: descarta esta
      if (error) throw error;
      desenhar(L.adaptarBusca(data), q);
    } catch (e) {
      if (minha !== seq) return;
      $('#buscaDica').textContent = '';
      // rodada 9: antes não tinha como repetir (só apagando e digitando de novo)
      $('#buscaLista').innerHTML = `<p class="vazio vazio-erro" role="alert">${navigator.onLine ? 'A busca não respondeu agora.' : 'Sem internet.'} <button type="button" class="btn-link" data-busca-de-novo>tentar de novo</button></p>`;
    }
  }

  function abrir(texto) {
    if (aberta) { $('#buscaInput').focus(); return; }
    aberta = true; ultimoFoco = document.activeElement;
    $('#busca').hidden = false;
    document.body.classList.add('modal-aberto');
    const inp = $('#buscaInput');
    inp.value = texto || '';
    /* rodada 9: a pesquisa da vez anterior ficava como "última busca"; com o campo vazio, setas + Enter na tela inicial
       achavam que o texto tinha mudado e só redesenhavam a tela, sem abrir o item marcado */
    ultimaBusca = '';
    if (inp.value) buscar(inp.value); else telaInicial();
    setTimeout(() => { inp.focus(); inp.select(); }, 20);
  }
  function fechar() {
    if (!aberta) return;
    aberta = false; seq++;
    $('#busca').hidden = true;
    document.body.classList.remove('modal-aberto');
    clearTimeout(timer);
    try { ultimoFoco && ultimoFoco.focus && ultimoFoco.focus(); } catch { /* elemento sumiu */ }
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; N = window.CasaLogica4; aberta = false; filtroBusca = '';
    C.busca = { abrir, fechar, aberta: () => aberta };
    const inp = $('#buscaInput');
    inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => buscar(inp.value), 220); };
    inp.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); marcarAtivo(ativo + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marcarAtivo(ativo - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        // Enter antes da busca terminar: primeiro busca; se já tem resultado, abre o escolhido
        const ls = linhasNav();
        if (e.shiftKey && ls[ativo]) {      // Shift+Enter: abre a ficha de quem tem telefone
          const tel = (ls[ativo].closest('[data-tel]') || {}).dataset?.tel || '';
          if (tel && C.ficha) { guardarRecente(inp.value); const nome = ls[ativo].dataset.nome || ''; fechar(); setTimeout(() => C.ficha.abrir({ tel55: tel, nome }), 60); }
          return;
        }
        if (ls[ativo] && inp.value.trim() === ultimaBusca) { guardarRecente(inp.value); ls[ativo].click(); }
        else buscar(inp.value);
      } else if (e.key === 'Tab' && !e.shiftKey && ativo >= 0 && e.target === inp) { /* Tab segue para os atalhos da linha */ }
    };
    $('#buscaFechar').onclick = fechar;
    $('#busca').onclick = (e) => {
      if (e.target.id === 'busca') return fechar();
      const fi = e.target.closest('[data-ficha]');
      if (fi) { guardarRecente($('#buscaInput').value); const d = { tel55: fi.dataset.tel, nome: fi.dataset.nome || '' }; fechar(); setTimeout(() => C.ficha && C.ficha.abrir(d), 60); return; }
      const ct = e.target.closest('[data-copiar-tel]');
      if (ct) { const n = L.formatarTelefone(ct.dataset.copiarTel); (navigator.clipboard ? navigator.clipboard.writeText(n) : Promise.reject()).then(() => C.toast('Telefone copiado.'), () => C.toast('Não consegui copiar neste navegador.')); return; }
      const fb = e.target.closest('[data-filtro-busca]');
      if (fb) { filtroBusca = fb.dataset.filtroBusca; if (ultimoRes) desenhar(ultimoRes, ultimoQ); $('#buscaInput').focus(); return; }
      if (e.target.closest('[data-limpar-recentes]')) {
        try { localStorage.removeItem(LS_RECENTES); } catch { /* sem armazenamento */ }
        telaInicial();
        // rodada 9: o botão "limpar" some com a lista; o foco caía no corpo da página. Volta ao campo e o leitor de tela ouve o que houve
        $('#buscaInput').focus();
        const an = $('#buscaAnuncio'); if (an) an.textContent = 'Buscas recentes apagadas.';
        return;
      }
      if (e.target.closest('[data-guardar]')) { guardarRecente($('#buscaInput').value); setTimeout(fechar, 50); return; }
      if (e.target.closest('[data-busca-de-novo]')) { buscar(inp.value); inp.focus(); return; }
      const rec = e.target.closest('[data-recente]');
      if (rec) { inp.value = rec.dataset.recente; buscar(inp.value); inp.focus(); return; }
      if (e.target.closest('#buscaLista a[data-linha]')) setTimeout(fechar, 50);
    };
    $('#bBusca').onclick = () => abrir();
    $('#busca').onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
      if (e.key === 'Tab') {   // o foco não sai da caixa
        const foc = [...$('#busca').querySelectorAll('input, a[href], button')].filter((el) => el.offsetParent !== null);
        if (!foc.length) return;
        const p = foc[0], u = foc[foc.length - 1];
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); }
        else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
      }
    };
    document.addEventListener('keydown', teclado);
  };
  /* rodada 11: das teclas de atalho, ficou só a da busca: Ctrl+K (até dentro de um campo) ou "/" fora de campo */
  function teclado(e) {
    if (!C || !C.perfil || !C.visao().equipe) return;   // R14: recepção e mecânico não têm a busca
    if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'k') { e.preventDefault(); if (aberta) fechar(); else abrir(); return; }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !aberta && !L.ehCampo(e.target) && !document.body.classList.contains('modal-aberto')) { e.preventDefault(); abrir(); }
  }
  MOD.desmontar = function () { aberta = false; seq++; $('#busca').hidden = true; document.body.classList.remove('modal-aberto'); clearTimeout(timer); document.removeEventListener('keydown', teclado); };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
