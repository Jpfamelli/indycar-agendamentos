/* Casa — saúde dos sistemas e ligações entre sistemas (rodada 7, C1).
   1) Faixa "Saúde dos sistemas": uma linha que diz se está tudo em ordem; ao abrir, cada sistema (Pátio, Orçador, WhatsApp, Comunicar,
      Movere, IA, backup, Central) com o que houve e o que fazer enquanto não volta. Junta a sonda do servidor (Pátio/Orçador/apps da Central),
      a RPC r7_c1_saude_sistemas (WhatsApp, Comunicar, Movere, monitor) e, para o gestor, r7_x3_saude (rotinas e gatilhos do banco).
   2) Visão do dono: "Ligações entre sistemas" (r7_x3_ligacoes_quebradas): onde um sistema não conversa com o outro, com o link do primeiro caso.
   Só equipe vê (admin, gestor, atendente). Nada aqui grava no banco. */
(function () {
  'use strict';
  const MOD = { nome: 'saude' };
  let C = null, L = null, N = null, sonda = null, rpc = null, banco = null, leituraEm = 0, timer = null, timerBanco = null, antes = null, aberto = false, ligEm = 0;
  const $ = (s) => document.querySelector(s);
  let vigia = null, montagem = 0, leituraVigia = 0;
  const CHAVE = 'codewords-chave-recusada';
  const planos = [
    [/^(whatsapp-|codewords-|webhook-)/, 'Abra Integrações no Atendimento, confira a conexão e faça o teste de envio.'],
    [/^anthropic-/, 'Confira a chave e o saldo da IA nas Integrações do Atendimento.'],
    [/^comunicar-/, 'Abra o Comunicar e confira a fila e o carteiro.'],
    [/^patio-/, 'Abra o Pátio e confira a rotina de avisos.'],
    [/^backup-/, 'Peça ao suporte para conferir o último backup e testar a restauração.'],
    [/^(exclusao-em-massa|admin-novo)$/, 'Confira a atividade da equipe e confirme com o administrador.'],
  ];

  function desenharVigia() {
    const avisos = [];
    if (vigia?.erro) avisos.push('<li>Não deu para conferir os avisos do Vigia agora.</li>');
    for (const aviso of vigia?.graves || []) {
      const chave = aviso.codigo === CHAVE;
      const titulo = chave ? 'WhatsApp recusado' : (aviso.resumo || N.regraDoCodigo(aviso.codigo)?.frase || 'Problema detectado pelo Vigia');
      const tempo = Number.isInteger(aviso.dias) && aviso.dias > 0 ? ` há ${aviso.dias} dia${aviso.dias === 1 ? '' : 's'}` : '';
      const passo = chave ? 'Gere uma chave nova no CodeWords e cole em Atendimento › Integrações.'
        : planos.find(([codigo]) => codigo.test(aviso.codigo))?.[1] || 'Confira o sistema afetado e peça ajuda ao suporte se a falha continuar.';
      const link = chave && C.podeUsar('atendimento') ? ` <a href="${C.esc(new URL('?aba=integracoes', new URL(C.bases.atendimento, location.origin)).href)}" target="${C.esc(L.nomeDaAba('atendimento'))}">Abrir Integrações</a>` : '';
      avisos.push(`<li><strong>${C.esc(titulo + tempo)}</strong><span>${C.esc(passo)}${link}</span></li>`);
    }
    if (vigia?.vigia_parado) {
      const horas = Math.max(1, Math.floor((Date.parse(vigia.gerado_em) - Date.parse(vigia.vigia_conferiu_em)) / 3600000));
      const titulo = Number.isFinite(horas) ? `O Vigia não confere há ${horas} horas` : 'O Vigia está sem registro da última conferência';
      avisos.push(`<li><strong>${titulo}</strong><span>Peça ao suporte para conferir a rotina do Vigia.</span></li>`);
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
    const topo = document.querySelector('.topo-marca');
    if (topo) { topo.dataset.saude = r.tom; topo.title = r.tom === 'ok' ? '' : r.texto; }
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
    if (antes) {
      for (const i of s.itens) {
        if (antes[i.k] && antes[i.k] !== 'ruim' && i.tom === 'ruim') C.toast(`${i.nome} ficou com problema.`, 5000);
        else if (antes[i.k] === 'ruim' && i.tom === 'ok') C.toast(`${i.nome} voltou ao normal.`, 4000);
      }
    }
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

  /* ---------------- Visão do dono: ligações entre sistemas ---------------- */
  async function carregarLigacoes() {
    const box = $('#donoLigacoes');
    if (!box || !C.visao().dono) return;
    if (box.dataset.em && Date.now() - Number(box.dataset.em) < 60_000) return;
    try {
      const { data, error } = await C.sb.rpc('r7_x3_ligacoes_quebradas', { p_amostra: 3 });
      if (error) throw error;
      box.dataset.em = String(Date.now());
      desenharLigacoes(N.resumoLigacoes(data, C.bases, location.origin));
    } catch {
      if (!box.dataset.ok) box.innerHTML = '<h3 class="dono-h">Ligações entre sistemas</h3><p class="vazio vazio-erro">Não deu para conferir as ligações agora. <button type="button" class="btn-link" data-recarregar-ligacoes>tentar de novo</button></p>';
    }
  }
  function desenharLigacoes(r) {
    const box = $('#donoLigacoes');
    box.dataset.ok = '1';
    const cab = '<h3 class="dono-h">Ligações entre sistemas</h3>';
    if (!r.itens.length) { box.innerHTML = cab + '<p class="vazio vazio-ensina"><b>Tudo ligado. 🔗</b><span>Pátio, Orçador, Agenda, CRM e Atendimento estão se enxergando: nenhum caso solto agora.</span></p>'; return; }
    box.innerHTML = cab + `<p class="dono-nota">${r.total} caso${r.total === 1 ? '' : 's'} em ${r.tipos} tipo${r.tipos === 1 ? '' : 's'}${r.alta ? ` · ${r.alta} grave${r.alta === 1 ? '' : 's'}` : ''}</p><ul class="ligacoes">${r.itens.map((i) => {
      const app = C.podeUsar(i.app) ? i.app : null;
      const alvo = i.link || (app ? C.bases[app] : '');
      const miolo = `<span class="a-num">${i.n}</span><span class="a-txt">${C.esc(i.texto)}<small>${C.esc(i.appNome)} · ${C.esc(i.como)}</small></span><span class="a-seta" aria-hidden="true">›</span>`;
      return `<li class="grav-${i.grav === 'alta' ? 3 : i.grav === 'media' ? 2 : 1}" data-ligacao="${C.esc(i.codigo)}">${alvo ? `<a class="atencao-item" href="${C.esc(alvo)}" target="${C.esc(L.nomeDaAba(L.appDoLink(alvo, location.origin, C.bases) || i.app))}">${miolo}</a>` : `<span class="atencao-item">${miolo}</span>`}</li>`;
    }).join('')}</ul>`;
  }

  MOD.montar = function (casa) {
    montagem++;
    vigia = null;
    C = casa; L = casa.L; N = window.CasaLogica4; sonda = null; rpc = null; banco = null; leituraEm = 0; antes = null; aberto = false; ligEm = 0;
    const sec = $('#saudeSist');
    const equipe = ['admin', 'gestor', 'atendente'].includes(C.perfil.papel);
    if (sec) sec.hidden = true;
    if (!equipe) return;
    const lig = $('#donoLigacoes'); if (lig) delete lig.dataset.em;
    C.aoSaudeApps = (s) => { sonda = s; desenhar(); };
    C.saude = { atualizar: ler, abrir: (v) => { aberto = typeof v === 'boolean' ? v : !aberto; desenhar(); }, estaAberto: () => aberto, ligacoes: carregarLigacoes, dados: () => ({ rpc, sonda, banco }) };
    C.aoDono = carregarLigacoes;
    $('#saudeBotao').onclick = () => C.saude.abrir();
    $('#saudePainel').onclick = (e) => { if (e.target.closest('[data-saude-atualizar]')) { ler(); C.verificarApps && C.verificarApps({ forcar: false }); C.toast('Conferindo os sistemas…', 1400); } };
    $('#donoLigacoes').onclick = (e) => { if (e.target.closest('[data-recarregar-ligacoes]')) { delete $('#donoLigacoes').dataset.em; carregarLigacoes(); } };
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
