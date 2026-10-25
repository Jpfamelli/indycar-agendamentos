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
    ls.forEach((el, k) => { el.classList.toggle('ativa', k === ativo); el.setAttribute('aria-selected', String(k === ativo)); });
    ls[ativo].scrollIntoView({ block: 'nearest' });
    $('#buscaInput').setAttribute('aria-activedescendant', ls[ativo].id);
  }

  /* comandos da paleta: ">" + palavra, ou texto que casa com o nome do comando */
  function blocoComandos(lista, titulo) {
    if (!lista.length) return '';
    return `<section class="busca-grupo" aria-label="Comandos"><h3>⚡ ${C.esc(titulo)}</h3>${lista.map((c) => `<button type="button" class="busca-cmd" data-linha id="bc-${C.esc(c.id)}" role="option" aria-selected="false" data-cmd="${C.esc(c.id)}"><span>${C.esc(c.rotulo)}</span>${c.tecla ? `<kbd>${C.esc(c.tecla)}</kbd>` : ''}</button>`).join('')}</section>`;
  }
  function telaInicial() {
    const r = recentes();
    const apps = ['agenda', 'atendimento', 'crm', 'comunicar', 'patio', 'orcador'].filter((k) => C.podeUsar(k));
    $('#buscaDica').textContent = 'Digite um telefone, parte do nome, a placa ou o número da OS/orçamento.';
    $('#buscaFiltros').hidden = true; filtroBusca = '';
    $('#buscaLista').innerHTML =
      (r.length ? `<section class="busca-grupo"><h3>Buscas recentes <button type="button" class="busca-mini" data-limpar-recentes>limpar</button></h3>${r.map((x) => `<button type="button" class="busca-rec" data-recente="${C.esc(x)}">🕘 ${C.esc(x)}</button>`).join('')}</section>` : '') +
      blocoComandos(C.comandos ? C.comandos.lista().filter((c) => ['novo-horario', 'nova-entrada', 'novo-orcamento', 'nova-tarefa', 'modo-tv', 'tema'].includes(c.id)).slice(0, 5) : [], 'Comandos (digite > para ver todos)') +
      `<section class="busca-grupo"><h3>Ir para</h3><div class="busca-ir">${apps.map((k) => `<a href="${C.esc(C.bases[k])}" target="${C.esc(L.nomeDaAba(k))}" data-linha id="bl-ir-${k}" role="option">${L.APPS[k].ico} ${C.esc(L.APPS[k].nome)}</a>`).join('')}</div></section>`;
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
      <button type="button" class="busca-linha busca-pessoa" id="bp-${i}" data-linha data-ficha data-tel="${C.esc(p.tel55)}" data-nome="${C.esc(p.nome)}" role="option" aria-selected="false">
        <span class="b-tit">${L.destacar(p.nome, ultimoQ)}</span><span class="b-det">${C.esc(p.telefone)} · está em ${C.esc(p.achouEm.join(', ') || 'nenhum sistema')}</span><span class="pil">Ver ficha</span></button>
      <span class="busca-atalhos"><button type="button" class="busca-mini" data-copiar-tel="${C.esc(p.tel55)}" aria-label="Copiar o telefone de ${C.esc(p.nome)}">Copiar telefone</button></span></div>`).join('')}</section>`;
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
        <section class="busca-grupo"><h3>Telefone novo? Comece por aqui</h3><div class="busca-ir">
          ${C.podeUsar('agenda') ? `<a href="${C.esc(C.links.agendaNovo({ telefone: tel }))}" target="${L.nomeDaAba('agenda')}" data-linha id="bl-n1" role="option">📅 Marcar horário</a>` : ''}
          ${C.podeUsar('atendimento') ? `<a href="${C.esc(C.links.conversaTel(tel))}" target="${L.nomeDaAba('atendimento')}" data-linha id="bl-n2" role="option">💬 Abrir conversa</a>` : ''}
          ${C.podeUsar('orcador') ? `<a href="${C.esc(C.links.novoOrcamento({ telefone: tel }))}" target="${L.nomeDaAba('orcador')}" data-linha id="bl-n3" role="option">🧾 Novo orçamento</a>` : ''}
          ${C.podeUsar('crm') ? `<a href="${C.esc(C.links.crmTel({ telefone: tel }))}" target="${L.nomeDaAba('crm')}" data-linha id="bl-n4" role="option">📈 Ver no CRM</a>` : ''}
          <button type="button" class="busca-mini" data-copiar-tel="${C.esc(tel)}" data-linha id="bl-n5" role="option">📋 Copiar telefone</button>
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
    $('#buscaDica').textContent = `${total || pessoas.length} resultado${(total || pessoas.length) > 1 ? 's' : ''} em ${todos.length} sistema${todos.length > 1 ? 's' : ''}`;
    let n = 0;
    lista.innerHTML = (mostraPessoas ? blocoPessoas(pessoas) : '') + grupos.map((g) => {
      const alem = N.alemDoCorte(g, res.contagens);
      return `
      <section class="busca-grupo" aria-label="${C.esc(g.nome)}"><h3>${g.ico} ${C.esc(g.nome)} <small>${g.linhas.length}${alem ? ' de ' + (g.linhas.length + alem) : ''}</small></h3>
      ${g.linhas.map((r) => {
        const id = 'bl-' + (n++);
        return `<div class="busca-item" data-tel="${C.esc(r.tel || '')}">
          <a class="busca-linha" id="${id}" data-linha role="option" aria-selected="false" href="${C.esc(r.url)}" target="${C.esc(L.nomeDaAba(r.app))}" data-guardar>
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
    if (q.startsWith('>')) {
      const cs = C.comandos ? C.comandos.filtrar(q) : [];
      seq++;
      $('#buscaDica').textContent = cs.length ? 'Enter executa o comando escolhido.' : '';
      $('#buscaLista').innerHTML = cs.length ? blocoComandos(cs, 'Comandos') : `<p class="vazio">Nenhum comando parecido com “${C.esc(q.slice(1).trim())}”.</p>`;
      ativo = -1; if (linhasNav().length) marcarAtivo(0);
      return;
    }
    if (q.length < 2) { telaInicial(); return; }
    const c = L.classificarBusca(q);
    if (!c.valido) { telaInicial(); return; }
    const minha = ++seq;
    $('#buscaDica').textContent = 'Buscando…';
    try {
      const { data, error } = await C.sb.rpc('r6_busca_global', { p_termo: q, p_limite: 5 });
      if (minha !== seq) return;     // chegou uma busca mais nova: descarta esta
      if (error) throw error;
      desenhar(L.adaptarBusca(data), q);
      const cs = C.comandos ? C.comandos.filtrar(q).slice(0, 3) : [];
      if (cs.length && cs.length < (C.comandos.lista().length)) $('#buscaLista').insertAdjacentHTML('beforeend', blocoComandos(cs, 'Comandos que combinam'));
    } catch (e) {
      if (minha !== seq) return;
      $('#buscaDica').textContent = '';
      $('#buscaLista').innerHTML = `<p class="vazio vazio-erro">${navigator.onLine ? 'A busca não respondeu agora. Tente de novo em instantes.' : 'Sem internet.'}</p>`;
    }
  }

  function abrir(texto) {
    if (aberta) { $('#buscaInput').focus(); return; }
    aberta = true; ultimoFoco = document.activeElement;
    $('#busca').hidden = false;
    document.body.classList.add('modal-aberto');
    const inp = $('#buscaInput');
    inp.value = texto || '';
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
      if (e.target.closest('[data-limpar-recentes]')) { try { localStorage.removeItem(LS_RECENTES); } catch { /* sem armazenamento */ } telaInicial(); return; }
      if (e.target.closest('[data-guardar]')) { guardarRecente($('#buscaInput').value); setTimeout(fechar, 50); return; }
      const cmd = e.target.closest('[data-cmd]');
      if (cmd) { const id = cmd.dataset.cmd; fechar(); setTimeout(() => C.comandos.executar(id), 60); return; }
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
  };
  MOD.desmontar = function () { aberta = false; seq++; $('#busca').hidden = true; document.body.classList.remove('modal-aberto'); clearTimeout(timer); };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
