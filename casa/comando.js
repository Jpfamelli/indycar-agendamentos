/* Casa — painel de comando, parte 2 (rodada 6, C1b): saúde do Pátio/Orçador, clima da oficina, "Meu dia",
   ordem e recolher dos cartões por papel, comandos da paleta (Ctrl+K) e o resumo do dia do dono.
   Usa CasaLogica2 (regras puras, testadas). Nada aqui grava no banco. */
(function () {
  'use strict';
  const MOD = { nome: 'comando' };
  const LS_RECOLHIDOS = 'indycar_central_recolhidos';
  const LS_ADIADOS = 'indycar_central_sino_adiados';
  let C = null, L = null, M = null, timerSaude = null, timerClima = null, ultimaSaude = null, consultorId = null, falhasSaude = 0;
  const $ = (s) => document.querySelector(s);
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  /* ---------------- saúde do Pátio e do Orçador ---------------- */
  async function verificarApps({ forcar = false } = {}) {
    let s = null;
    try {
      const r = await fetch('/api/central/saude-apps', { cache: 'no-store' });
      if (r.ok) s = await r.json();
    } catch { /* sem internet: o aviso de rede cuida */ }
    if (!s) { falhasSaude++; return; }
    falhasSaude = 0;
    const voltou = M.voltaramAoAr(ultimaSaude, s);
    ultimaSaude = s;
    if (voltou.length) C.toast(voltou.length === 1 ? `${voltou[0]} voltou ao ar.` : `${voltou.join(' e ')} voltaram ao ar.`, 4500);
    pintarSaude(s);
    try { C.aoSaudeApps && C.aoSaudeApps(s); } catch { /* a faixa de saúde é um extra */ }
    if (forcar && !voltou.length && !M.avisosDeApps(s).length) C.toast('Pátio e Orçador estão respondendo.', 2500);
  }
  function pintarSaude(s) {
    const av = M.avisosDeApps(s);
    const box = $('#avisoApps');
    const fora = new Set(av.map((a) => a.app));
    if (box) {
      box.hidden = !av.length;
      box.innerHTML = av.map((a) => `<div class="aviso-app" data-app-fora="${C.esc(a.app)}"><strong>⚠ ${C.esc(a.texto)}</strong>
        <span>${a.desdeHora ? `Desde as ${C.esc(a.desdeHora)}. ` : ''}Os números abaixo vêm do banco e continuam certos. ${C.esc(M.PLANO_B[a.app] || '')}</span></div>`).join('')
        + (av.length ? '<button type="button" class="btn-link" data-verificar-apps>verificar de novo</button>' : '');
    }
    document.querySelectorAll('.grade-apps .app').forEach((el) => {
      const f = fora.has(el.dataset.app);
      el.classList.toggle('app-fora-do-ar', f);
      el.title = f ? 'Este app não está respondendo agora. Clique só se precisar.' : '';
    });
    document.querySelectorAll('#acoes .acao').forEach((el) => {
      const k = (el.getAttribute('target') || '').replace('indycar-', '');
      el.classList.toggle('acao-fora', fora.has(k));
    });
    for (const [id, app] of [['#cPatio', 'patio'], ['#cOrc', 'orcador']]) {
      const det = document.querySelector(id + ' [data-det]');
      if (!det) continue;
      det.dataset.fora = fora.has(app) ? '1' : '';
      det.classList.toggle('det-fora', fora.has(app));
    }
  }

  /* ---------------- clima da oficina ---------------- */
  function pintarClima() {
    const el = $('#clima'); if (!el) return;
    const c = M.climaDaOficina(new Date());
    el.textContent = c.texto; el.dataset.estado = c.estado;
  }

  /* ---------------- recolher e ordenar cartões ---------------- */
  function aplicarOrdem() {
    const ordem = M.ordemDosCartoes(C.perfil.papel);
    ordem.forEach((id, i) => { const el = document.getElementById(id); if (el) el.style.order = String(i + 1); });
    const md = $('#cMeuDia'); if (md) md.style.order = '0';
  }
  function aplicarRecolhidos() {
    const rec = ler(LS_RECOLHIDOS) || {};
    document.querySelectorAll('#agora .agora-cartao').forEach((el) => {
      const fechado = !!rec[el.id];
      el.classList.toggle('recolhido', fechado);
      const b = el.querySelector('.recolher'); if (b) { b.setAttribute('aria-expanded', String(!fechado)); b.textContent = fechado ? '▸' : '▾'; b.title = fechado ? 'Mostrar a lista' : 'Esconder a lista'; }
    });
  }
  function ligarRecolher() {
    document.querySelectorAll('#agora .agora-cartao').forEach((el) => {
      if (el.querySelector('.recolher')) return;
      const cab = el.querySelector('.agora-cab'); if (!cab) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'recolher'; b.setAttribute('aria-label', 'Esconder ou mostrar ' + (cab.querySelector('.agora-rotulo')?.textContent || 'o cartão'));
      b.dataset.recolher = el.id;
      cab.appendChild(b);
    });
    aplicarRecolhidos();
  }
  /** Tecla "e": se algum cartão está aberto, recolhe todos; se todos estão recolhidos, abre todos. */
  function recolherTodos() {
    const ids = [...document.querySelectorAll('#agora .agora-cartao:not([hidden])')].map((el) => el.id);
    if (!ids.length) return;
    const rec = ler(LS_RECOLHIDOS) || {};
    const todosFechados = ids.every((id) => rec[id]);
    const novo = {}; if (!todosFechados) ids.forEach((id) => { novo[id] = 1; });
    gravar(LS_RECOLHIDOS, novo); aplicarRecolhidos();
    C.toast(todosFechados ? 'Cartões abertos.' : 'Cartões recolhidos.', 1400);
  }
  function alternarRecolhido(id) {
    const rec = ler(LS_RECOLHIDOS) || {};
    if (rec[id]) delete rec[id]; else rec[id] = 1;
    gravar(LS_RECOLHIDOS, rec); aplicarRecolhidos();
  }

  /* ---------------- Meu dia ---------------- */
  async function descobrirConsultor() {
    try {
      const { data } = await C.sb.from('consultores').select('id').eq('perfil_id', C.perfil.id).eq('ativo', true).limit(1);
      consultorId = data && data[0] ? data[0].id : null;
    } catch { consultorId = null; }
  }
  /* 🔗 pré-agendamentos do Orçador esperando confirmação (uma contagem leve, guardada 60 s) */
  let preN = 0, preEm = 0;
  async function contarPre() {
    if (Date.now() - preEm < 60000) return;
    preEm = Date.now();
    try {
      const { count } = await C.sb.from('agendamentos').select('id', { count: 'exact', head: true }).eq('status', 'aguardando').ilike('observacoes', 'PRÉ-AGENDAMENTO%').gte('data', L.hojeSP());
      const novo = Number(count) || 0;
      if (novo !== preN) { preN = novo; if (C.painel && C.painel.redesenhar) C.painel.redesenhar(); }
    } catch { /* sem a contagem, o resto do "Meu dia" continua igual */ }
  }
  function pintarMeuDia(dados) {
    const el = $('#cMeuDia'); if (!el) return;
    const V = C.visao();
    if (V.soMeusCarros || V.recepcao || !dados) { el.hidden = true; return; }
    const r = M.meuDia({ perfil: C.perfil, dados, tarefas: (C.tarefas && C.tarefas.lista && C.tarefas.lista()) || [], consultorId });
    if (!r) { el.hidden = true; return; }
    contarPre();
    const pre = M.itemPreAgendamento(preN);
    if (pre && C.podeUsar('agenda')) { r.itens.push(pre); r.total += pre.n; }
    /* rodada 7 🔗: tarefas de reabordar que o Orçador criou para recusados que ainda dá para recuperar */
    const rea = window.CasaLogica4 && C.tarefas && C.tarefas.ligas ? window.CasaLogica4.contarReabordar((C.tarefas.lista() || []).filter((t) => t.responsavel_id === C.perfil.id || !t.responsavel_id), C.tarefas.ligas()) : 0;
    if (rea > 0) { r.itens.push({ k: 'reabordar', n: rea, texto: `${rea} ${rea === 1 ? 'orçamento recusado para reabordar' : 'orçamentos recusados para reabordar'}`, extra: 'o Orçador achou que ainda dá para recuperar', app: null, tarefas: 'orcador' }); r.total += rea; }
    el.hidden = false;
    el.querySelector('[data-num]').textContent = String(r.total);
    el.querySelector('[data-det]').textContent = r.itens.length ? 'o que é seu agora' : 'tudo em dia com você. Bom trabalho! 🏁';
    el.querySelector('[data-lista]').innerHTML = r.itens.map((i) => {
      const alvo = i.app ? `<a class="linha" href="${C.esc(C.bases[i.app])}" target="${C.esc(L.nomeDaAba(i.app))}">` : `<a class="linha" href="#tTarefas" data-ir-tarefas${i.tarefas ? ' data-filtro-tarefas="' + C.esc(i.tarefas) + '"' : ''}>`;
      return `<li>${alvo}<span class="l-a"><b>${i.n}</b> ${C.esc(i.texto.replace(/^\d+\s/, ''))}</span>${i.extra ? `<span class="l-c">${C.esc(i.extra)}</span>` : ''}</a></li>`;
    }).join('') || `<li class="vazio vazio-ensina">${C.esc('Quando uma conversa, uma tarefa ou um horário for seu, aparece aqui.')}</li>`;
  }

  /* ---------------- comandos da paleta ---------------- */
  function executar(id) {
    const l = C.links;
    const abrir = (url) => C.abrirNaAba(url);
    switch (id) {
      case 'novo-horario': return abrir(l.agendaNovo());
      case 'nova-entrada': return abrir(l.patioEntrada());
      case 'novo-orcamento': return abrir(l.novoOrcamento());
      case 'modo-tv': return abrir(l.patioTv());
      case 'nova-tarefa': return C.focarTarefa && C.focarTarefa();
      case 'atualizar': C.painel && C.painel.atualizar(); verificarApps({ forcar: true }); return C.toast('Atualizando…', 1200);
      case 'tema': return $('#bTema').click();
      case 'sino': return C.alternarSino && C.alternarSino(true);
      case 'marcar-lidas': return $('#bLerTodas').click();
      case 'atalhos': return $('#bAjuda').click();
      case 'saude': return C.saude && C.saude.abrir(true);
      case 'tarefas-vencidas': C.tarefas && C.tarefas.filtrar('vencidas'); return document.querySelector('#tTarefas').scrollIntoView({ block: 'start', behavior: 'smooth' });
      case 'tarefas-orcador': C.tarefas && C.tarefas.filtrar('orcador'); return document.querySelector('#tTarefas').scrollIntoView({ block: 'start', behavior: 'smooth' });
      case 'recolher': return recolherTodos();
      case 'ligacoes': C.painel && C.painel.trocarVisao('dono'); return setTimeout(() => { const b = document.querySelector('#donoLigacoes'); if (b) b.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 150);
      case 'visao-dono': return C.painel && C.painel.trocarVisao('dono');
      case 'visao-operacao': return C.painel && C.painel.trocarVisao('operacao');
      case 'sair': return document.querySelector('[data-acao="sair"]').click();
      default:
        if (id.startsWith('abrir-')) { const k = id.slice(6); if (C.podeUsar(k)) return abrir(C.bases[k]); }
    }
  }
  const comandosDaPessoa = () => M.comandos(C.perfil, C.visao());

  /* ---------------- resumo do dia (dono) ---------------- */
  async function copiarResumo(dono, agora) {
    const texto = M.resumoDoDia({ dono, agora, hojeIso: L.hojeSP() });
    try { await navigator.clipboard.writeText(texto); C.toast('Resumo do dia copiado — é só colar no WhatsApp.'); }
    catch { C.toast('Não consegui copiar neste navegador.'); }
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; M = window.CasaLogica2; ultimaSaude = null; falhasSaude = 0;
    C.comandos = { lista: comandosDaPessoa, executar, filtrar: (t) => M.filtrarComandos(comandosDaPessoa(), t) };
    C.verificarApps = verificarApps; C.copiarResumo = copiarResumo; C.recolherTodos = recolherTodos;
    C.aoAgora = (d) => { pintarMeuDia(d); ligarRecolher(); };
    aplicarOrdem(); ligarRecolher(); pintarClima();
    descobrirConsultor().then(() => { if (C.painel) C.painel.redesenhar && C.painel.redesenhar(); });
    verificarApps();
    clearInterval(timerSaude); clearInterval(timerClima);
    timerSaude = setInterval(() => { if (!document.hidden) verificarApps(); }, 60_000);
    timerClima = setInterval(pintarClima, 60_000);
    $('#miolo').addEventListener('click', clicarNoMiolo);
    document.addEventListener('visibilitychange', aoVisivel);
  };
  function clicarNoMiolo(e) {
    if (e.target.closest('[data-verificar-apps]')) { verificarApps({ forcar: true }); return; }
    const r = e.target.closest('[data-recolher]'); if (r) { alternarRecolhido(r.dataset.recolher); return; }
    const ir = e.target.closest('[data-ir-tarefas]');
    if (ir) { e.preventDefault(); if (ir.dataset.filtroTarefas && C.tarefas && C.tarefas.filtrar) C.tarefas.filtrar(ir.dataset.filtroTarefas); C.focarTarefa && C.focarTarefa(); }
  }
  function aoVisivel() { if (!document.hidden && C && C.perfil) verificarApps(); }
  MOD.desmontar = function () {
    clearInterval(timerSaude); clearInterval(timerClima);
    document.removeEventListener('visibilitychange', aoVisivel);
    try { $('#miolo').removeEventListener('click', clicarNoMiolo); } catch { /* sem miolo */ }
    ultimaSaude = null; C = null;
  };
  MOD.LS_ADIADOS = LS_ADIADOS;
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
