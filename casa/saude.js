/* Casa — saúde dos sistemas e ligações entre sistemas (rodada 7, C1).
   1) Faixa "Saúde dos sistemas": uma linha que diz se está tudo em ordem; ao abrir, cada sistema (Pátio, Orçador, WhatsApp, Comunicar,
      Movere, IA, backup, Central) com o que houve e o que fazer enquanto não volta. Junta a sonda do servidor (Pátio/Orçador/apps da Central),
      a RPC r7_c1_saude_sistemas (WhatsApp, Comunicar, Movere, monitor) e, para o gestor, r7_x3_saude (rotinas e gatilhos do banco).
   Só equipe vê (admin, gestor, atendente). Nada aqui grava no banco. */
(function () {
  'use strict';
  const MOD = { nome: 'saude' };
  let C = null, L = null, N = null, sonda = null, rpc = null, banco = null, leituraEm = 0, timer = null, timerBanco = null, antes = null, aberto = false, ligEm = 0;
  const $ = (s) => document.querySelector(s);
  let vigia = null, montagem = 0, leituraVigia = 0;

  /* rodada 9: título curto e o que fazer para cada um dos 23 avisos graves (N.faixaDoVigia); o texto cru do Vigia vira detalhe pequeno;
     selo "Urgente" com ícone e palavra (não só a cor); link para o app certo quando a pessoa tem acesso */
  function linkDoVigia(abrir) {
    if (!abrir || !C.podeUsar(abrir.app) || !C.bases[abrir.app]) return '';
    try {
      const url = new URL(abrir.q || '', new URL(C.bases[abrir.app], location.origin)).href;
      return ` <a href="${C.esc(url)}" target="${C.esc(L.nomeDaAba(abrir.app))}">${C.esc(abrir.rotulo)}</a>`;
    } catch { return ''; }
  }
  function desenharVigia() {
    const avisos = [];
    if (vigia?.erro) avisos.push('<li class="vigia-item vigia-leve"><strong>Não deu para conferir os avisos do Vigia agora.</strong><span>A Casa tenta de novo sozinha em alguns minutos.</span></li>');
    for (const a of N.faixaDoVigia(vigia)) {
      avisos.push(`<li class="vigia-item"><span class="vigia-selo"><span aria-hidden="true">⚠</span> Urgente</span><strong>${C.esc(a.titulo)}${a.tempo ? ' ' + C.esc(a.tempo) : ''}</strong><span>${C.esc(a.passo)}${linkDoVigia(a.abrir)}</span>${a.detalhe ? `<small class="vigia-detalhe">O Vigia anotou: ${C.esc(a.detalhe)}</small>` : ''}</li>`);
    }
    for (const el of document.querySelectorAll('[data-avisos-vigia]')) {
      el.hidden = !avisos.length;
      el.innerHTML = avisos.length ? `<ul>${avisos.join('')}</ul>` : '';
    }
  }

  async function lerVigia() {
    if (!['admin', 'gestor'].includes(C.perfil.papel)) return;
    const vez = ++leituraVigia;
    const atual = montagem;
    let resultado;
    try {
      const { data, error } = await C.sb.rpc('vigia_avisos_abertos');
      if (error || !Array.isArray(data?.graves)) throw new Error('leitura indisponível');
      resultado = data;
    } catch { resultado = { ...vigia, erro: true }; }
    if (atual !== montagem || vez !== leituraVigia) return;
    vigia = resultado;
    desenharVigia();
    desenhar();
  }
  const TOM_ROTULO = { ok: 'em ordem', aviso: 'atenção', ruim: 'com problema', neutro: 'sem leitura' };

  function desenhar() {
    const sec = $('#saudeSist');
    if (!sec) return;
    const s = N.saudeSistemas({ rpc, vigia, sonda, banco, agoraMs: Date.now() });
    const r = N.resumoDaSaude(rpc || vigia || sonda ? s : null);
    sec.hidden = false;
    sec.dataset.tom = r.tom;
    $('#saudeTxt').textContent = r.texto;
    $('#saudeHora').textContent = leituraEm ? 'lido ' + L.quando(new Date(leituraEm).toISOString()).replace('agora', 'agora há pouco') : '';
    $('#saudeBotao').setAttribute('aria-expanded', String(aberto));
    $('#saudePainel').hidden = !aberto;
    const topo = document.querySelector('.ic-marca');
    // rodada 9: o ponto ao lado do logo era só cor e só "title" (que o leitor de tela não lê com aria-label e o celular não mostra)
    if (topo) { topo.dataset.saude = r.tom; topo.title = r.tom === 'ok' || r.tom === 'neutro' ? '' : r.texto; topo.setAttribute('aria-label', N.rotuloDoLogo(r)); }
    $('#saudeLista').innerHTML = s.itens.map((i) => {
      const app = i.app && C.podeUsar(i.app) ? `<a class="saude-abrir" href="${C.esc(C.bases[i.app])}" target="${C.esc(L.nomeDaAba(i.app))}">Abrir ${C.esc(L.APPS[i.app].nome)} ↗</a>` : '';
      return `<li class="saude-item tom-${C.esc(i.tom)}" data-sistema="${C.esc(i.k)}">
        <span class="saude-ico" aria-hidden="true">${i.ico}</span>
        <span class="saude-corpo"><b>${C.esc(i.nome)}</b> <span class="saude-estado">${C.esc(TOM_ROTULO[i.tom] || '')}</span>
        <span class="saude-resumo-linha">${C.esc(i.resumo)}</span>
        ${i.detalhes.slice(1, 4).map((d) => `<span class="saude-detalhe">${C.esc(d)}</span>`).join('')}
        ${i.plano && (i.tom === 'ruim' || i.tom === 'aviso') ? `<span class="saude-plano"><b>Enquanto isso:</b> ${C.esc(i.plano)}</span>` : ''}</span>
        ${app}</li>`;
    }).join('') || '<li class="vazio">Sem leitura da saúde ainda.</li>';
    avisarMudancas(s);
  }
  /** Avisa uma vez quando um sistema piora ou volta (comparando com a leitura anterior). */
  function avisarMudancas(s) {
    const agora = Object.fromEntries(s.itens.map((i) => [i.k, i.tom]));
    const aviso = N.avisoDeMudancas(antes, s.itens);
    if (aviso) C.toast(aviso.texto, aviso.ruim ? 5000 : 4000);
    antes = agora;
  }

  async function ler() {
    const atual = montagem;
    lerVigia();
    try {
      const [a, b] = await Promise.all([C.sb.rpc('r7_c1_saude_sistemas'), C.visao().dono && Date.now() - ligEm > 4 * 60_000 ? C.sb.rpc('r7_x3_saude') : Promise.resolve(null)]);
      if (atual !== montagem) return;
      if (a.error) throw a.error;
      rpc = a.data; leituraEm = Date.now();
      if (b) { ligEm = Date.now(); if (!b.error) banco = b.data; }
    } catch { /* sem a leitura nova o painel mostra a anterior, com a hora dela */ }
    if (atual === montagem) desenhar();
  }

  /* rodada 11: as "Ligações entre sistemas" moravam na visão do dono, que saiu da Casa junto com os números por app. */

  MOD.montar = function (casa) {
    montagem++;
    vigia = null;
    C = casa; L = casa.L; N = window.CasaLogica4; sonda = null; rpc = null; banco = null; leituraEm = 0; antes = null; aberto = false; ligEm = 0;
    const sec = $('#saudeSist');
    const equipe = ['admin', 'gestor', 'atendente'].includes(C.perfil.papel);
    if (sec) sec.hidden = true;
    if (!equipe) return;
    C.aoSaudeApps = (s) => { sonda = s; desenhar(); };
    C.saude = { atualizar: ler, abrir: (v) => { aberto = typeof v === 'boolean' ? v : !aberto; desenhar(); }, estaAberto: () => aberto, dados: () => ({ rpc, sonda, banco }) };
    $('#saudeBotao').onclick = () => C.saude.abrir();
    $('#saudePainel').onclick = (e) => { if (e.target.closest('[data-saude-atualizar]')) { ler(); C.verificarApps && C.verificarApps({ forcar: false }); C.toast('Conferindo os sistemas…', 1400); } };
    ler();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) ler(); }, 120_000);
    document.addEventListener('visibilitychange', aoVisivel);
  };
  function aoVisivel() { if (!document.hidden && C && C.perfil && Date.now() - leituraEm > 60_000) ler(); }
  MOD.desmontar = function () {
    montagem++;
    vigia = null;
    desenharVigia();
    clearInterval(timer); clearInterval(timerBanco);
    document.removeEventListener('visibilitychange', aoVisivel);
    const sec = $('#saudeSist'); if (sec) sec.hidden = true;
    rpc = null; sonda = null; banco = null; antes = null;
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
