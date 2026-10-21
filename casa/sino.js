/* Casa — sino unificado (rodada 6): avisos de TODOS os apps numa lista só, com filtro por app,
   "só não lidas", grupos por dia, marcar uma/todas, aba do navegador com a contagem e aviso do
   sistema (opcional) quando chega coisa nova com a Central em segundo plano. */
(function () {
  'use strict';
  const MOD = { nome: 'sino' };
  let C = null, L = null, notifs = [], filtro = '', soNovas = false, canal = null, timerSync = null, primeiraCarga = true;
  const VISTAS_MAX = 60;

  const $ = (s) => document.querySelector(s);
  const rotuloApp = (k) => (L.APPS[k] ? L.APPS[k].nome : k ? String(k) : 'Outros');
  const icoApp = (k) => (L.APPS[k] ? L.APPS[k].ico : '🔔');

  function desenhar() {
    const lista = $('#listaNotif');
    const novas = notifs.filter((n) => !n.lida_em).length;
    const num = $('#sinoNum'); num.textContent = novas > 99 ? '99+' : String(novas); num.hidden = !novas;
    $('#bSino').setAttribute('aria-label', novas ? `Notificações: ${novas} sem ler` : 'Notificações');
    document.title = L.tituloDaAba(novas);

    // filtros por app (só os que aparecem na lista), com a contagem de não lidas
    const porApp = L.contagemPorApp(notifs);
    const apps = [...new Set(notifs.map((n) => n.app || 'outros'))];
    $('#sinoFiltros').innerHTML = apps.length > 1 ? [`<button type="button" data-filtro="" aria-pressed="${filtro === ''}">Todos${novas ? ` <b>${novas}</b>` : ''}</button>`]
      .concat(apps.map((a) => `<button type="button" data-filtro="${C.esc(a)}" aria-pressed="${filtro === a}">${icoApp(a)} ${C.esc(rotuloApp(a))}${porApp[a] ? ` <b>${porApp[a]}</b>` : ''}</button>`)).join('') : '';

    const grupos = L.organizarNotificacoes(notifs, { app: filtro, soNaoLidas: soNovas });
    lista.innerHTML = grupos.length ? grupos.map((g) => `
      <section class="notif-grupo"><h3 class="notif-dia">${C.esc(g.nome)}</h3><ul>${g.itens.map((n) => `
        <li class="${n.lida_em ? '' : 'nova'}">
          <button type="button" class="notif-abrir" data-notif="${C.esc(n.id)}">
            <span class="n-ico" aria-hidden="true">${icoApp(n.app)}</span>
            <span class="n-txt"><span class="n-tit">${C.esc(n.titulo || 'Aviso')}</span>
            ${n.corpo ? `<span class="n-corpo">${C.esc(n.corpo)}</span>` : ''}
            <span class="n-quando">${C.esc(L.quando(n.created_at))} · ${C.esc(rotuloApp(n.app))}</span></span>
          </button>
          ${n.lida_em ? '' : `<button type="button" class="notif-ler" data-ler="${C.esc(n.id)}" aria-label="Marcar como lida: ${C.esc(n.titulo || 'aviso')}" title="Marcar como lida">✓</button>`}
        </li>`).join('')}</ul></section>`).join('')
      : `<p class="vazio">${notifs.length ? 'Nada com esse filtro.' : 'Nada por aqui. Quando passarem uma conversa, um lead, um orçamento ou um carro para você, aparece aqui.'}</p>`;

    const rod = $('#sinoRodape');
    const perm = ('Notification' in window) ? Notification.permission : 'indisponivel';
    rod.innerHTML = perm === 'default'
      ? '<button type="button" class="btn-link" data-aviso-sistema>Ativar avisos do navegador (quando a Central estiver em segundo plano)</button>'
      : perm === 'granted' ? '<span class="vazio-mini">Avisos do navegador ativados.</span>' : '';
  }

  async function carregar() {
    const { data, error } = await C.sb.from('notificacoes').select('id,tipo,titulo,corpo,link,app,lida_em,created_at')
      .order('created_at', { ascending: false }).limit(VISTAS_MAX);
    if (error) return;
    const antes = new Set(notifs.map((n) => n.id));
    const novas = (data || []).filter((n) => !antes.has(n.id) && !n.lida_em);
    notifs = data || [];
    desenhar();
    if (!primeiraCarga && novas.length && document.hidden) avisarSistema(novas);
    primeiraCarga = false;
  }

  function avisarSistema(novas) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const n = novas[0];
      const t = new Notification(novas.length > 1 ? `${novas.length} avisos novos na Central` : (n.titulo || 'Aviso novo'), {
        body: novas.length > 1 ? novas.slice(0, 3).map((x) => x.titulo).join(' · ') : (n.corpo || ''), tag: 'indycar-central', icon: '/casa/icon-192.png',
      });
      t.onclick = () => { window.focus(); if (novas.length === 1) abrir(n.id); t.close(); };
    } catch { /* navegador sem suporte */ }
  }

  function marcar(ids) {
    const agora = new Date().toISOString();
    const alvo = notifs.filter((n) => ids.includes(n.id) && !n.lida_em);
    if (!alvo.length) return Promise.resolve();
    alvo.forEach((n) => { n.lida_em = agora; });
    desenhar();
    return C.sb.from('notificacoes').update({ lida_em: agora }).in('id', alvo.map((n) => n.id)).then(({ error }) => {
      if (error) { alvo.forEach((n) => { n.lida_em = null; }); desenhar(); C.toast('Não consegui marcar como lida agora.'); }
    });
  }
  function abrir(id) {
    const n = notifs.find((x) => x.id === id);
    if (!n) return;
    marcar([id]);
    C.abrirNaAba(L.linkDaNotificacao(n, C.bases, location.origin));
  }
  function lerTodas() {
    // com um filtro de app ligado, "todas" vale para o que está na tela
    const ids = notifs.filter((n) => !n.lida_em && (!filtro || n.app === filtro)).map((n) => n.id);
    if (!ids.length) return C.toast('Nada para marcar.');
    marcar(ids).then(() => C.toast(ids.length === 1 ? '1 aviso marcado como lido.' : `${ids.length} avisos marcados como lidos.`));
  }

  function alternar(forcar) {
    const p = $('#painelSino');
    const abrirAgora = typeof forcar === 'boolean' ? forcar : p.hidden;
    p.hidden = !abrirAgora;
    $('#bSino').setAttribute('aria-expanded', String(abrirAgora));
    if (abrirAgora) { $('#menuPerfil').hidden = true; carregar(); setTimeout(() => p.querySelector('button, input')?.focus(), 30); }
    else $('#bSino').focus();
  }

  /** Resumo do que pede atenção (vem do painel) aparece no topo do sino. */
  function mostrarAtencao(itens) {
    const el = $('#sinoAtencao');
    const top = (itens || []).slice(0, 3);
    el.hidden = !top.length;
    el.innerHTML = top.length ? '<strong>Pede atenção agora</strong>' + top.map((i) => `<a href="${C.esc(i.url)}" target="${C.esc(L.nomeDaAba(i.app))}">${C.esc(i.texto)}</a>`).join('') : '';
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; notifs = []; filtro = ''; soNovas = false; primeiraCarga = true;
    C.alternarSino = alternar;
    C.sino = { carregar, mostrarAtencao, naoLidas: () => notifs.filter((n) => !n.lida_em).length };
    $('#bLerTodas').onclick = lerTodas;
    $('#sinoSoNovas').checked = false;
    $('#sinoSoNovas').onchange = (e) => { soNovas = e.target.checked; desenhar(); };
    $('#painelSino').onclick = (e) => {
      const f = e.target.closest('[data-filtro]');
      if (f) { filtro = f.dataset.filtro; desenhar(); return; }
      const ler = e.target.closest('[data-ler]');
      if (ler) { marcar([ler.dataset.ler]); return; }
      const a = e.target.closest('[data-notif]');
      if (a) { alternar(false); abrir(a.dataset.notif); return; }
      if (e.target.closest('[data-aviso-sistema]')) {
        Notification.requestPermission().then(() => desenhar()).catch(() => {});
      }
    };
    carregar();
    try {
      canal = C.sb.channel('casa-sino-' + C.perfil.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${C.perfil.id}` }, () => carregar())
        .subscribe();
    } catch { /* sem tempo real: o relógio abaixo cobre */ }
    clearInterval(timerSync);
    timerSync = setInterval(() => { if (!document.hidden) carregar(); }, 90_000);
    document.addEventListener('visibilitychange', onVisivel);
  };
  function onVisivel() { if (!document.hidden && C && C.perfil) carregar(); }
  MOD.desmontar = function () {
    try { if (canal && C) C.sb.removeChannel(canal); } catch { /* segue */ }
    canal = null; clearInterval(timerSync); notifs = [];
    document.removeEventListener('visibilitychange', onVisivel);
    document.title = 'IndyCar Central';
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
