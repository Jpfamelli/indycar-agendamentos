/* Casa — sino unificado (rodada 6 + 7): avisos de TODOS os apps numa lista só, com filtro por app, busca por texto,
   "só não lidas", grupos por dia, marcar uma/todas, adiar com escolha (1 h, 3 h, amanhã 8h), "carregar mais",
   aba do navegador com a contagem e aviso do sistema (opcional) quando chega coisa nova com a Central em segundo plano.
   R14: o sino abre nas NÃO LIDAS (a caixa de entrada do dia); "Todas" traz também as já lidas. As não lidas vêm numa leitura
   só delas (até 100), então um aviso novo nunca fica escondido atrás de dezenas de avisos antigos já lidos.
   Aviso de "tarefas vencidas" (sem app e sem link no banco) leva para a aba Tarefas do Atendimento (rodada 11). */
(function () {
  'use strict';
  const MOD = { nome: 'sino' };
  let C = null, L = null, notifs = [], filtro = '', soNovas = true, canal = null, timerSync = null, primeiraCarga = true, buscaTexto = '', limite = 60, adiarAberto = null;
  /* rodada 9: estado da leitura, para o sino dizer "carregando" e "não consegui ler" em vez de ficar em branco */
  let leitura = 'carregando';
  /* rodada 10: relógio que junta uma rajada de avisos do tempo real numa leitura só */
  let debLeitura = null, lidoEm = 0;
  const LIMITE_MAX = 300;
  const LS_ADIADOS = 'indycar_central_sino_adiados';
  const M2 = () => window.CasaLogica2;
  const N4 = () => window.CasaLogica4;
  const lerAdiados = () => { try { return M2().aindaAdiados(JSON.parse(localStorage.getItem(LS_ADIADOS) || '{}')); } catch { return {}; } };
  const gravarAdiados = (o) => { try { localStorage.setItem(LS_ADIADOS, JSON.stringify(o)); } catch { /* sem armazenamento */ } };
  /** Avisos visíveis agora, com a busca aplicada e sem os adiados neste aparelho. */
  const visiveis = () => { const ad = lerAdiados(); return N4().filtrarPorTexto(notifs.filter((n) => !ad[n.id]), buscaTexto); };

  const $ = (s) => document.querySelector(s);
  const ROTULOS = { tarefas: 'Tarefas' };
  const rotuloApp = (k) => (L.APPS[k] ? L.APPS[k].nome : ROTULOS[k] || (k && k !== 'outros' ? String(k) : 'Outros'));
  const icoApp = (k) => (L.APPS[k] ? L.APPS[k].ico : k === 'tarefas' ? '📝' : '🔔');
  const gruposAbertos = new Set();
  const nomesPorTipo = {
    espera: ['conversa esperando resposta', 'conversas esperando resposta'],
    aguardando: ['conversa esperando consultor', 'conversas esperando consultor'],
    ia: ['aviso da IA', 'avisos da IA'],
  };

  function desenhar() {
    const lista = $('#listaNotif');
    const adiados = lerAdiados();
    const novas = notifs.filter((n) => !n.lida_em && !adiados[n.id]).length;
    const num = $('#sinoNum'); num.textContent = novas > 99 ? '99+' : String(novas); num.hidden = !novas;
    $('#bSino').setAttribute('aria-label', novas ? `Notificações: ${novas} sem ler` : 'Notificações');
    document.title = L.tituloDaAba(novas);

    // filtros por app (só os que aparecem na lista), com a contagem de não lidas
    const porApp = L.contagemPorApp(notifs);
    const apps = [...new Set(notifs.filter((n) => !soNovas || !n.lida_em).map((n) => n.app || 'outros'))];   // R14: em "Não lidas" só os apps que têm aviso novo
    $('#sinoFiltros').innerHTML = apps.length > 1 ? [`<button type="button" data-filtro="" aria-pressed="${filtro === ''}">Todos${novas ? ` <b>${novas}</b>` : ''}</button>`]
      .concat(apps.map((a) => `<button type="button" data-filtro="${C.esc(a)}" aria-pressed="${filtro === a}">${icoApp(a)} ${C.esc(rotuloApp(a))}${porApp[a] ? ` <b>${porApp[a]}</b>` : ''}</button>`)).join('') : '';

    const grupos = new Map();
    for (const g of L.organizarNotificacoes(visiveis(), { app: filtro, soNaoLidas: soNovas })) {
      for (const n of g.itens) {
        const tipo = n.tipo || 'outros';
        if (!grupos.has(tipo)) grupos.set(tipo, []);
        grupos.get(tipo).push(n);
      }
    }
    const nAd = Object.keys(adiados).length;
    const bN = $('#sinoModoNovas'), bT = $('#sinoModoTodas');
    if (bN && bT) {
      bN.setAttribute('aria-pressed', String(soNovas)); bT.setAttribute('aria-pressed', String(!soNovas));
      bN.innerHTML = 'Não lidas' + (novas ? ` <b>${novas > 99 ? '99+' : novas}</b>` : '');
    }
    const lerTodasBtn = $('#bLerTodas'); if (lerTodasBtn) lerTodasBtn.hidden = !novas;
    const item = (n) => `
        <li class="${n.lida_em ? '' : 'nova'}">
          <button type="button" class="notif-abrir" data-notif="${C.esc(n.id)}">
            <span class="n-ico" aria-hidden="true">${M2().iconeDoAviso(n)}</span>
            <span class="n-txt"><span class="n-tit">${n.lida_em ? '' : '<span class="n-nova">não lido</span>'}${C.esc(n.titulo || 'Aviso')}</span>
            ${n.corpo ? `<span class="n-corpo">${C.esc(n.corpo)}</span>` : ''}
            <span class="n-quando">${C.esc(L.quando(n.created_at))} · ${C.esc(rotuloApp(n.app))}</span></span>
          </button>
          ${n.lida_em ? '' : `<button type="button" class="notif-adiar" data-adiar-sino="${C.esc(n.id)}" aria-expanded="${adiarAberto === n.id}" aria-label="Adiar: ${C.esc(n.titulo || 'aviso')}" title="Esconder por um tempo">⏱</button>`}
          ${n.lida_em ? '' : `<button type="button" class="notif-ler" data-ler="${C.esc(n.id)}" aria-label="Marcar como lida: ${C.esc(n.titulo || 'aviso')}" title="Marcar como lida">✓</button>`}
          ${adiarAberto === n.id ? `<div class="notif-adiar-op" role="group" aria-label="Adiar este aviso por…">${N4().OPCOES_ADIAR.map((o) => `<button type="button" data-adiar-por="${o.k}" data-adiar-id="${C.esc(n.id)}">${C.esc(o.rotulo)}</button>`).join('')}</div>` : ''}
        </li>`;
    /* rodada 9: aviso sozinho do tipo dele aparece direto (sem "1 aviso · …" e sem abrir e fechar); grupo só com 2 ou mais */
    const blocos = [], soltos = [];
    for (const [tipo, itens] of grupos) {
      if (itens.length === 1) { soltos.push(itens[0]); continue; }
      const novos = itens.filter((n) => !n.lida_em);
      const rotulo = nomesPorTipo[tipo]?.[1] || M2().rotuloTipo(tipo);
      blocos.push(`
      <details class="notif-grupo" data-grupo-tipo="${C.esc(tipo)}" ${gruposAbertos.has(tipo) ? 'open' : ''}>
        <summary>${itens.length} ${C.esc(rotulo)}${novos.length && !soNovas ? ` · ${novos.length} sem ler` : ''}</summary>
        ${novos.length ? `<button type="button" class="btn-link" data-ler="${C.esc(novos.map((n) => n.id).join(','))}">Marcar este grupo como lido</button>` : ''}
        <ul>${itens.map(item).join('')}</ul></details>`);
    }
    if (soltos.length) blocos.push(`<div class="notif-grupo notif-soltos"><ul>${soltos.map(item).join('')}</ul></div>`);
    const tentar = '<button type="button" class="btn-link" data-sino-de-novo>tentar de novo</button>';
    lista.innerHTML = (leitura === 'carregando' && !notifs.length) ? '<p class="vazio" role="status">Carregando os avisos…</p>'
      : (leitura === 'falhou' && !notifs.length) ? `<p class="vazio vazio-erro" role="alert">Não consegui ler os avisos agora. ${tentar}</p>`
      : (leitura === 'falhou' ? `<p class="vazio vazio-erro" role="alert">Não consegui atualizar os avisos: mostrando a última leitura. ${tentar}</p>` : '')
        + (grupos.size ? blocos.join('')
          : `<p class="vazio">${buscaTexto ? `Nenhum aviso com “${C.esc(buscaTexto)}”.` : filtro ? 'Nada com esse filtro.' : soNovas ? '<span aria-hidden="true">🏁</span> Tudo lido. Nenhum aviso novo.' : 'Nada por aqui. Quando passarem uma conversa, um contato, um orçamento ou um carro para você, aparece aqui.'}${soNovas && !buscaTexto && !filtro ? '<br><button type="button" class="btn-link" data-sino-modo="todas">Ver também os já lidos</button>' : ''}</p>`);

    const rod = $('#sinoRodape');
    const volta = nAd ? N4().quandoVolta(Math.min(...Object.values(adiados).map(Number))) : '';
    const rodAd = nAd ? `<button type="button" class="btn-link" data-voltar-adiados>${nAd} adiado${nAd > 1 ? 's' : ''} (${C.esc(volta)}): mostrar agora</button> ` : '';
    const maisAvisos = notifs.length >= limite && limite < LIMITE_MAX ? '<button type="button" class="btn-link" data-mais-avisos>Carregar mais avisos</button> ' : '';
    const perm = ('Notification' in window) ? Notification.permission : 'indisponivel';
    rod.innerHTML = rodAd + maisAvisos + (perm === 'default'
      ? '<button type="button" class="btn-link" data-aviso-sistema>Ativar avisos do navegador (quando a Central estiver em segundo plano)</button>'
      : perm === 'granted' ? '<span class="vazio-mini">Avisos do navegador ativados.</span>' : '')
      + '<button type="button" class="btn sino-fechar" data-sino-fechar>Fechar</button>';   // R15: no celular o sino é a tela toda e o sino do topo fica longe do polegar
  }

  async function carregar() {
    const campos = 'id,tipo,titulo,corpo,link,app,lida_em,created_at';
    const nova = (so) => { let b = C.sb.from('notificacoes').select(campos); if (so) b = b.is('lida_em', null); return b.order('created_at', { ascending: false }).limit(so ? 100 : limite); };
    let nao = null, todas = null, error = null;
    const modo = soNovas;
    try {
      [nao, todas] = await Promise.all([nova(true), modo ? Promise.resolve(null) : nova(false)]);
      error = nao.error || (todas && todas.error) || null;
    } catch (e) { error = e; }
    if (!C) return;   // saiu enquanto lia
    if (error) { leitura = 'falhou'; desenhar(); C.sessaoVenceu && C.sessaoVenceu(error); return; }
    leitura = 'ok'; lidoEm = Date.now();
    const antes = new Set(notifs.map((n) => n.id));
    const adiados = lerAdiados();
    const mapa = new Map();
    for (const n of [...((todas && todas.data) || []), ...(nao.data || [])]) mapa.set(n.id, n.app ? n : { ...n, app: N4().appDoAviso(n) });
    const lista = [...mapa.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const novas = lista.filter((n) => !antes.has(n.id) && !n.lida_em && !adiados[n.id]);
    notifs = lista;
    desenhar();
    /* R14: "N tarefas vencidas" repetido: só o mais novo vale; os antigos saem das não lidas */
    const velhos = window.CasaLogica5.avisosSubstituidos(lista);
    if (velhos.length) marcar(velhos);
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

  /* rodada 9: a lista do sino é redesenhada a cada toque e o botão usado saía da página: o foco caía no começo dela e
     quem usa teclado ou leitor de tela tinha de voltar até o sino. Estes ajudantes devolvem o foco para o lugar certo. */
  const seguro = (id) => ((window.CSS && CSS.escape) ? CSS.escape(String(id)) : String(id).replace(/"/g, ''));
  function vizinhoDe(id) {
    const bs = [...document.querySelectorAll('#listaNotif [data-notif]')].filter((b) => b.dataset.notif === id || !b.closest('details:not([open])'));
    const i = bs.findIndex((b) => b.dataset.notif === id);
    const v = i < 0 ? null : (bs[i + 1] || bs[i - 1]);
    return v ? v.dataset.notif : null;
  }
  function focarAviso(id, reserva) {
    const achar = (x) => (x ? document.querySelector(`#listaNotif [data-notif="${seguro(x)}"]`) : null);
    const el = achar(id) || achar(reserva) || document.querySelector('#painelSino button, #painelSino input');
    if (el) el.focus();
  }
  function marcar(ids) {
    const agora = new Date().toISOString();
    const alvo = notifs.filter((n) => ids.includes(n.id) && !n.lida_em);
    if (!alvo.length) return Promise.resolve();
    alvo.forEach((n) => { n.lida_em = agora; });
    desenhar();
    return C.sb.from('notificacoes').update({ lida_em: agora }).in('id', alvo.map((n) => n.id)).is('lida_em', null).then(({ error }) => {
      if (error) { alvo.forEach((n) => { n.lida_em = null; }); desenhar(); C.toast('Não consegui marcar como lida agora.'); return false; }
      return true;
    });
  }
  function abrir(id) {
    const n = notifs.find((x) => x.id === id);
    if (!n) return;
    marcar([id]);
    const a = N4().acaoDoAviso(n, C.bases, location.origin);
    if (a.acao === 'abrir') return C.abrirNaAba(a.url);
    C.toast('Esse aviso não tem para onde ir.');
  }
  function lerTodas() {
    // "todas" vale para o que está na tela: o filtro de app, a busca e sem os adiados (antes marcava também o que a busca escondia)
    const ids = M2().idsParaLerTodas(visiveis(), filtro);
    if (!ids.length) return C.toast('Nada para marcar.');
    marcar(ids).then((ok) => { if (ok) C.toast(ids.length === 1 ? '1 aviso marcado como lido.' : `${ids.length} avisos marcados como lidos.`); });
  }

  function alternar(forcar) {
    const p = $('#painelSino');
    const abrirAgora = typeof forcar === 'boolean' ? forcar : p.hidden;
    p.hidden = !abrirAgora;
    $('#bSino').setAttribute('aria-expanded', String(abrirAgora));
    if (abrirAgora) { $('#menuPerfil').hidden = true; adiarAberto = null; carregar(); setTimeout(() => p.querySelector('button, input')?.focus(), 30); }
    else $('#bSino').focus();
  }

  /* rodada 11: o resumo "Pede atenção agora" no topo do sino repetia a lista da própria Casa, logo abaixo: saiu. */

  MOD.montar = function (casa) {
    gruposAbertos.clear();
    C = casa; L = casa.L; notifs = []; filtro = ''; soNovas = true; primeiraCarga = true; buscaTexto = ''; limite = 60; adiarAberto = null; leitura = 'carregando';
    C.alternarSino = alternar;
    C.sino = { carregar, naoLidas: () => notifs.filter((n) => !n.lida_em).length, lista: () => notifs.slice() };
    $('#bLerTodas').onclick = lerTodas;
    const busca = $('#sinoBusca');
    if (busca) { busca.value = ''; busca.oninput = () => { buscaTexto = busca.value.trim().slice(0, 60); desenhar(); }; }
    $('#painelSino').onclick = (e) => {
      // Ao redesenhar a lista, o botão clicado sai do DOM antes do clique
      // chegar ao listener da página, que o confundiria com um clique fora.
      e.stopPropagation();
      const grupo = e.target.closest('summary')?.parentElement;
      if (grupo?.dataset.grupoTipo) {
        if (grupo.open) gruposAbertos.delete(grupo.dataset.grupoTipo);
        else gruposAbertos.add(grupo.dataset.grupoTipo);
      }
      const modo = e.target.closest('[data-sino-modo]');
      if (modo) {
        soNovas = modo.dataset.sinoModo === 'novas'; filtro = '';
        if (soNovas) desenhar(); else { desenhar(); carregar(); }
        document.querySelector(soNovas ? '#sinoModoNovas' : '#sinoModoTodas')?.focus();
        return;
      }
      const f = e.target.closest('[data-filtro]');
      if (f) { filtro = f.dataset.filtro; desenhar(); [...document.querySelectorAll('#sinoFiltros [data-filtro]')].find((x) => x.dataset.filtro === filtro)?.focus(); return; }   // rodada 9: o foco fica no filtro (antes caía fora do sino)
      const ler = e.target.closest('[data-ler]');
      if (ler) {
        const tipo = ler.closest('[data-grupo-tipo]')?.dataset.grupoTipo;
        const ids = ler.dataset.ler.split(',');
        const viz = ids.length === 1 ? vizinhoDe(ids[0]) : null;
        marcar(ids);
        if (ids.length === 1) { focarAviso(ids[0], viz); return; }   // rodada 9: o ✓ de um aviso deixa o foco nele (ou no vizinho)
        [...document.querySelectorAll('[data-grupo-tipo]')].find((el) => el.dataset.grupoTipo === tipo)?.querySelector('summary')?.focus();
        return;
      }
      const por = e.target.closest('[data-adiar-por]');
      if (por) {
        const viz = vizinhoDe(por.dataset.adiarId);
        const o = lerAdiados(); o[por.dataset.adiarId] = N4().ateQuando(por.dataset.adiarPor, new Date()); gravarAdiados(o);
        adiarAberto = null; desenhar(); focarAviso(null, viz); C.toast('Aviso escondido: ' + N4().quandoVolta(o[por.dataset.adiarId]) + '.', 2400); return;
      }
      const ad = e.target.closest('[data-adiar-sino]');
      if (ad) {
        const id = ad.dataset.adiarSino;
        adiarAberto = adiarAberto === id ? null : id; desenhar();
        // rodada 9: abriu as opções → foco na primeira; fechou → volta ao ⏱
        document.querySelector(adiarAberto ? `#listaNotif [data-adiar-id="${seguro(id)}"]` : `#listaNotif [data-adiar-sino="${seguro(id)}"]`)?.focus();
        return;
      }
      if (e.target.closest('[data-sino-fechar]')) { alternar(false); return; }
      if (e.target.closest('[data-voltar-adiados]')) { gravarAdiados({}); desenhar(); return; }
      if (e.target.closest('[data-mais-avisos]')) { limite = Math.min(LIMITE_MAX, limite + 60); carregar(); return; }
      if (e.target.closest('[data-sino-de-novo]')) { leitura = 'carregando'; desenhar(); carregar(); $('#sinoBusca')?.focus(); return; }   // rodada 9: o foco fica no sino (o botão some ao redesenhar)
      const a = e.target.closest('[data-notif]');
      if (a) { alternar(false); abrir(a.dataset.notif); return; }
      if (e.target.closest('[data-aviso-sistema]')) {
        Notification.requestPermission().then(() => desenhar()).catch(() => {});
      }
    };
    carregar();
    try {
      canal = C.sb.channel('casa-sino-' + C.perfil.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${C.perfil.id}` }, agendarLeitura)
        .subscribe();
    } catch { /* sem tempo real: o relógio abaixo cobre */ }
    clearInterval(timerSync);
    timerSync = setInterval(() => { if (!document.hidden) carregar(); }, 90_000);
    document.addEventListener('visibilitychange', onVisivel);
    window.addEventListener('online', aoVoltarARede);   // rodada 10: a internet voltou, o sino relê na hora (antes esperava até 90 s)
  };
  /* dez avisos chegando juntos (a rotina da manhã, um lote do Comunicar) viravam dez leituras da lista inteira: agora uma, 400 ms depois do último */
  function agendarLeitura() { clearTimeout(debLeitura); debLeitura = setTimeout(() => { if (C && C.perfil) carregar(); }, 400); }
  function aoVoltarARede() { if (C && C.perfil) carregar(); }
  function onVisivel() { if (!document.hidden && C && C.perfil && Date.now() - lidoEm > 15_000) carregar(); }   // rodada 10: leitura de segundos atrás não se repete
  MOD.desmontar = function () {
    try { if (canal && C) C.sb.removeChannel(canal); } catch { /* segue */ }
    canal = null; clearInterval(timerSync); clearTimeout(debLeitura); notifs = []; lidoEm = 0;
    document.removeEventListener('visibilitychange', onVisivel);
    window.removeEventListener('online', aoVoltarARede);
    document.title = 'IndyCar Central';
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
