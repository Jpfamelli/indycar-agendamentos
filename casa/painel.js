/* Casa — painel (rodada 11). A Casa mostra só o que é dela: "Pede atenção agora" e, em cada cartão de app, o número que
   importa (conversas esperando, carros no pátio, orçamentos esperando, horários de hoje, contatos sem responsável). As listas
   longas (horários, conversas, carros, orçamentos) e a visão do dono saíram: cada uma mora no app dela.
   Uma chamada de banco por vez (r6_agora + r6_c1_agora_extras; o mecânico lê só os carros dele), com tempo real e
   relógio de reserva de 60 s. */
(function () {
  'use strict';
  const MOD = { nome: 'painel' };
  let C = null, L = null, V = null, links = null;
  let canal = null, timerPoll = null, deb = null, timerHora = null;
  let ultima = 0, carregando = false, dados = null, emFalha = false, online = true;
  /* rodada 10: quando começou a leitura em andamento e qual é a vez dela (uma leitura pendurada não trava mais o painel) */
  let carregandoDesde = 0, vezAgora = 0;
  const TEMPO_PENDURADO_MS = 25_000;
  /* R15: o último número lido (só contagens) pinta o herói na hora da abertura; a leitura de verdade troca logo depois */
  const LS_INSTANTE = 'indycar_central_heroi';
  let instante = null;   // o que está na tela vindo do aparelho (null = tudo é leitura de verdade)
  const lerInstante = () => { try { return JSON.parse(localStorage.getItem(LS_INSTANTE) || 'null'); } catch { return null; } };
  const gravarInstante = (d) => { try { const s = window.CasaLogica5.instantaneoDe(d, C.perfil.id); if (s) localStorage.setItem(LS_INSTANTE, JSON.stringify(s)); } catch { /* sem armazenamento */ } };
  const horaDe = (ms) => window.CasaLogica5.horaAgora(new Date(ms));

  const $ = (s) => document.querySelector(s);
  const alvo = (app) => `target="${C.esc(L.nomeDaAba(app))}"`;
  const linkA = (url, app, classe, html, extra = '') => `<a class="${classe}" href="${C.esc(url)}" ${alvo(app)} ${extra}>${html}</a>`;

  /* ---------------- "pede atenção agora" ---------------- */
  /* rodada 9: a gravidade aparece em palavra e ícone (Urgente, Atenção), não só na cor da borda */
  const seloGrav = (g) => (g >= 3 ? '<span class="a-selo a-selo-3"><span aria-hidden="true">⚠</span> Urgente</span>' : g === 2 ? '<span class="a-selo a-selo-2">Atenção</span>' : '');
  /* rodada 13B: a lista mostra as 5 mais graves e um "Ver mais" para o resto (no celular ela ficava comprida e escondia
     o resto da Central). Quem abriu continua com ela aberta quando os números atualizam. */
  const ATENCAO_VISIVEIS = 5;
  let atencaoAberta = false;
  function desenharAtencao(a) {
    const itens = L.atencao(a, V, links);
    const sec = $('#atencao');
    /* rodada 13: vazio vira um estado bonito ("Nada pedindo atenção agora"), não some; o mecânico só vê se tiver algo */
    /* R14: o mecânico tem "Seus carros" (com Atrasado e Atenção em cada um): repetir a lista aqui só empurrava o resto para baixo */
    sec.hidden = !!V.soMeusCarros && (!itens.length || !!(a.patio && (a.patio.lista || []).length));
    $('#atencaoVazio').hidden = itens.length > 0;
    $('#atencaoLista').hidden = !itens.length;
    const escondidos = Math.max(0, itens.length - ATENCAO_VISIVEIS);
    if (!escondidos) atencaoAberta = false;
    $('#atencaoLista').innerHTML = itens.map((i, idx) => `<li class="grav-${i.grav}"${idx >= ATENCAO_VISIVEIS && !atencaoAberta ? ' hidden' : ''}>${linkA(i.url, i.app, 'atencao-item',
      `<span class="a-num">${Number(i.n)}</span><span class="a-txt">${seloGrav(i.grav)}${C.esc(i.texto)}${i.extra ? `<small>${C.esc(i.extra)}</small>` : ''}</span><span class="a-seta" aria-hidden="true">›</span>`)}</li>`).join('');
    const mais = $('#atencaoMais');
    mais.hidden = !escondidos;
    mais.setAttribute('aria-expanded', String(atencaoAberta));
    mais.textContent = atencaoAberta ? 'Ver menos' : `Ver mais ${escondidos} ${escondidos === 1 ? 'aviso' : 'avisos'}`;
  }
  function alternarAtencao() {
    atencaoAberta = !atencaoAberta;
    if (dados) desenharAtencao(dados);
    /* abriu: o foco vai para o primeiro aviso que estava escondido (quem usa teclado continua de onde parou) */
    if (atencaoAberta) { const li = $('#atencaoLista').children[ATENCAO_VISIVEIS]; const a = li && li.querySelector('a'); if (a) a.focus(); }
  }

  /* ---------------- o número de cada cartão de app ---------------- */
  const plural = (n, um, varios) => (Number(n) === 1 ? um : varios);
  /** [número, texto] de cada app, só para quem pode ver aquele número. */
  function numerosDosApps(d) {
    const out = {};
    if (V.conversas && d.conversas) out.atendimento = [d.conversas.esperando, plural(d.conversas.esperando, 'conversa esperando', 'conversas esperando')];
    if (V.patio && d.patio) out.patio = [d.patio.total, V.soMeusCarros ? plural(d.patio.total, 'carro seu no pátio', 'carros seus no pátio') : plural(d.patio.total, 'carro no pátio', 'carros no pátio')];
    if (V.orcamentos && d.orcamentos && Number(d.orcamentos.esperando) > 0) out.orcador = [d.orcamentos.esperando, plural(d.orcamentos.esperando, 'orçamento esperando resposta', 'orçamentos esperando resposta')];
    if ((V.agenda || V.recepcao) && d.agenda) out.agenda = [d.agenda.total, plural(d.agenda.total, 'horário hoje', 'horários hoje')];
    if (V.leads && d.leads && d.leads.sem_dono != null) out.crm = [d.leads.sem_dono, plural(d.leads.sem_dono, 'contato sem responsável', 'contatos sem responsável')];
    return out;
  }
  /* rodada 13: o número que já está grande no herói não se repete no cartão do app (lá fica a frase curta do app) */
  function desenharNumeros(d, noHeroi = new Set()) {
    const nums = numerosDosApps(d);
    for (const k of noHeroi) delete nums[k];
    for (const el of document.querySelectorAll('[data-app-num]')) {
      const k = el.dataset.appNum;
      const desc = document.querySelector(`[data-app-desc="${k}"]`);
      const v = nums[k];
      if (!v || !Number.isFinite(Number(v[0]))) { el.hidden = true; el.textContent = ''; if (desc) desc.textContent = desc.dataset.padrao || ''; continue; }
      const n = Number(v[0]);
      el.hidden = false; el.textContent = String(n); el.classList.toggle('zero', n === 0);
      if (desc) desc.textContent = v[1];
    }
  }

  /* ---------------- herói: o dia da oficina numa frase e os números que levam ao app ---------------- */
  function desenharHeroi(d) {
    const L5 = window.CasaLogica5;
    const itens = L5.numerosDoDia(d, V);
    const partes = L5.fraseDoDia(itens, { mecanico: !!V.soMeusCarros });
    const fr = $('#heroiFrase');
    fr.hidden = !partes;
    if (partes) {
      const ultimo = partes.reduce((u, p, i) => (p.n != null ? i : u), -1);
      fr.innerHTML = partes.map((p, i) => (p.n != null
        ? `<span class="heroi-n${i === ultimo ? ' heroi-n-fim' : ''}">${Number(p.n)}</span>${C.esc(p.texto)}`
        : C.esc(p.texto))).join('');
    }
    const ul = $('#heroiNums');
    ul.hidden = !itens.length;
    ul.innerHTML = itens.map((i) => `<li>${linkA(C.bases[i.app] || '/', i.app, 'heroi-num' + (i.n === 0 ? ' zero' : ''),
      `<span class="heroi-num-n">${Number(i.n)}</span><span class="heroi-num-rot">${C.esc(i.rotulo)}</span><span class="heroi-num-app">${C.esc(i.nome)} <span aria-hidden="true">›</span></span>`,
      `aria-label="${C.esc(i.n + ' ' + i.rotulo + ': abrir ' + i.nome)}"`)}</li>`).join('');
    return new Set(itens.map((i) => i.app));
  }
  function relogio() {
    const L5 = window.CasaLogica5;
    const h = $('#heroiHora'), o = $('#heroiOficina');
    if (!h || !o) return;
    h.textContent = L5.horaAgora();
    const l = L5.linhaDaOficina();
    o.textContent = l.texto; o.dataset.tom = l.tom;
  }

  /* ---------------- R14: "Seus carros" (só o mecânico): o detalhe do que o número do herói conta ---------------- */
  const CARROS_VISIVEIS = 6;
  function desenharMeusCarros(d) {
    const sec = $('#meusCarros');
    if (!sec) return;
    const lista = V.soMeusCarros && d.patio ? window.CasaLogica5.carrosDoMecanico(d.patio.lista) : [];
    sec.hidden = !lista.length;
    $('#meusCarrosLista').innerHTML = lista.slice(0, CARROS_VISIVEIS).map((c) => '<li>' + linkA(links.os(c.id), 'patio', 'carro-item',
      `<span class="c-tit">${C.esc(c.titulo)}</span><span class="c-sub">${C.esc([c.cliente, c.etapa + (c.tempo ? ' há ' + c.tempo : ''), c.previsao].filter(Boolean).join(' · '))}</span>`
      + (c.tom === 'atrasado' ? '<span class="a-selo a-selo-3"><span aria-hidden="true">⚠</span> Atrasado</span>' : c.tom === 'atencao' ? '<span class="a-selo a-selo-2">Atenção</span>' : '')
      + '<span class="a-seta" aria-hidden="true">›</span>') + '</li>').join('');
    const mais = $('#meusCarrosMais');
    if (mais) { mais.hidden = lista.length <= CARROS_VISIVEIS; mais.href = C.bases.patio || '/'; mais.setAttribute('target', L.nomeDaAba('patio')); }
  }

  function desenharTudo(d) { instante = null; const fr = $('#heroiFrase'); if (fr) { fr.classList.remove('heroi-velho'); fr.removeAttribute('title'); } const noHeroi = desenharHeroi(d); desenharZap(); desenharNumeros(d, noHeroi); desenharAtencao(d); desenharMeusCarros(d); }

  /* R14: quem só marca presença não enxerga a agenda pelo banco (a regra do banco é da equipe): os horários de hoje vêm da
     própria Agenda, que já entrega a lista do dia sem telefone. Falhou: o herói só não mostra a Agenda (nunca um zero falso). */
  async function lerAgendaDaRecepcao() {
    try {
      const { data: { session } } = await C.sb.auth.getSession();
      const r = await fetch('/agenda/api/agendamentos', { headers: { Authorization: 'Bearer ' + (session ? session.access_token : '') }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw Object.assign(new Error('agenda'), { status: r.status, code: r.status === 401 ? 'PGRST301' : undefined });
      const lista = await r.json();
      if (!Array.isArray(lista)) return null;
      return window.CasaLogica5.agendaDaRecepcao(lista);
    } catch (e) { try { C.sessaoVenceu && C.sessaoVenceu(e); } catch { /* segue */ } return null; }
  }

  /* R15: as tarefas da própria pessoa que já passaram do prazo (uma leitura curta; falhou: o resto da Casa segue sem ela) */
  async function lerMinhasTarefas() {
    try {
      const agora = Date.now();
      const r = await C.sb.from('tarefas').select('vence_em', { count: 'exact' }).eq('status', 'aberta').eq('responsavel_id', C.perfil.id)
        .lt('vence_em', new Date(agora).toISOString()).order('vence_em', { ascending: true }).limit(100);
      if (r.error) throw r.error;
      const t = window.CasaLogica5.tarefasVencidas(r.data, agora, r.count);
      return { vencidas: t.n, mais_antiga: t.maisAntiga || 0 };
    } catch (e) { try { C.sessaoVenceu && C.sessaoVenceu(e); } catch { /* segue */ } return null; }
  }

  /* R18: o WhatsApp parado é o problema nº 1 do dia. Duas leituras curtas (o estado que o servidor anotou e a hora da última
     mensagem recebida), no máximo a cada 3 minutos; falhou: sem linha (nunca um alarme falso). */
  const ZAP_CADA_MS = 3 * 60_000;
  let zapLido = 0, zapDados = null;
  async function lerZap() {
    if (Date.now() - zapLido < ZAP_CADA_MS) return zapDados;
    try {
      const [z, m] = await Promise.all([
        C.sb.from('r7_c4_zap').select('parado,codigo,desde').limit(1).maybeSingle(),
        C.sb.from('whatsapp_mensagens').select('created_at').eq('direcao', 'entrada').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      zapDados = { zap: z.error ? null : z.data, ultimaEntrada: m.error || !m.data ? null : m.data.created_at };
      zapLido = Date.now();
    } catch { /* segue sem a linha */ }
    return zapDados;
  }
  function desenharZap() {
    const a = $('#heroiZap');
    if (!a) return;
    const L5 = window.CasaLogica5;
    const pode = V.conversas && C.podeUsar('atendimento') && C.bases.atendimento;
    const rpc = C.saude && C.saude.dados ? C.saude.dados().rpc : null;
    const p = pode && zapDados ? L5.whatsappParado({ ...zapDados, rpcWa: rpc && rpc.whatsapp }) : null;
    const l = L5.linhaDoZap(p, { papel: C.perfil.papel });
    if (C.aoZap) { try { C.aoZap(p); } catch { /* a saúde segue com o que tem */ } }
    a.hidden = !l;
    if (!l) { a.innerHTML = ''; return; }
    let url = C.bases.atendimento;
    try { url = new URL(l.q, new URL(C.bases.atendimento, location.origin)).href; } catch { /* fica a base */ }
    a.href = url; a.target = L.nomeDaAba('atendimento');
    a.innerHTML = `<span class="a-selo a-selo-3"><span aria-hidden="true">⚠</span> Parado</span><span class="heroi-zap-tit">${C.esc(l.titulo)}</span><span class="heroi-zap-passo">${C.esc(l.passo)} <b>${C.esc(l.rotulo)}</b></span><span class="a-seta" aria-hidden="true">›</span>`;
  }

  async function carregarAgora({ silencioso = false } = {}) {
    if (carregando && Date.now() - carregandoDesde < TEMPO_PENDURADO_MS) return;
    const vez = ++vezAgora;
    carregando = true; carregandoDesde = Date.now();
    try {
      let d;
      if (V.soMeusCarros) {
        const r = await C.sb.from('patio_os').select('id,numero,cliente_nome,veiculo,placa,etapa,etapa_em,previsao_entrega,orcamento_id')
          .eq('mecanico_id', C.perfil.id).not('etapa', 'in', '(entregue,cancelado)').order('etapa_em', { ascending: true }).limit(12);
        if (r.error) throw r.error;
        const lista = (r.data || []).map((o) => ({ ...o, nome: o.cliente_nome, extras_pendentes: 0 }));
        const por = {}; lista.forEach((o) => { por[o.etapa] = (por[o.etapa] || 0) + 1; });
        d = { patio: { total: lista.length, prontos: lista.filter((o) => o.etapa === 'pronto').length, atrasados: lista.filter((o) => o.previsao_entrega && Date.parse(o.previsao_entrega) < Date.now() && o.etapa !== 'pronto').length, extras_pendentes: 0, por_etapa: por, lista } };
      } else {
        // fonte única: r6_agora (X3); o que ele não traz vem de r6_c1_agora_extras
        // R13C: "sem responsável" com a regra do CRM (em aberto, qualquer data), contado junto e sem esperar a mais
        const [a, x, semDono, agendaRec, minhasTarefas] = await Promise.all([C.sb.rpc('r6_agora', { p_limite: 40 }), C.sb.rpc('r6_c1_agora_extras'),
          V.leads ? L.contarSemResponsavel(C.sb) : Promise.resolve(null), V.recepcao ? lerAgendaDaRecepcao() : Promise.resolve(null), V.tarefas ? lerMinhasTarefas() : Promise.resolve(null),
          V.conversas && C.podeUsar('atendimento') ? lerZap() : Promise.resolve(null)]);
        if (a.error) throw a.error;
        const ex = x.error ? {} : (x.data || {});
        d = L.adaptarAgora(a.data, { ...ex, leads: { ...(ex.leads || {}), sem_dono: semDono } });
        if (V.recepcao) d.agenda = agendaRec;
        d.minhas_tarefas = minhasTarefas;
      }
      if (vez !== vezAgora) return;   // chegou atrasada: já há uma leitura mais nova
      dados = d; ultima = Date.now(); emFalha = false;
      desenharTudo(d);
      gravarInstante(d);
      falha(false);
    } catch (e) {
      if (vez !== vezAgora) return;
      emFalha = true;
      try { C.sessaoVenceu && C.sessaoVenceu(e); } catch { /* segue mostrando a falha */ }
      if (!silencioso || !dados) falha(true);
    } finally { if (vez === vezAgora) carregando = false; }
  }
  /** Sem leitura: um aviso curto com "tentar de novo" (antes cada cartão dizia "sem dado"). */
  function falha(ligar) {
    const av = $('#avisoRede');
    if (!av || !online) return;
    av.hidden = !ligar;
    /* rodada 13: sem nenhuma leitura boa, o herói não fica dizendo "lendo…" para sempre */
    /* R15: com o último número do aparelho na tela, o herói não apaga: o aviso diz de que hora ele é */
    if (ligar && !dados && !instante) { const fr = $('#heroiFrase'); if (fr) fr.innerHTML = '<span class="heroi-lendo">Os números de hoje não carregaram.</span>'; }
    av.innerHTML = ligar ? (instante ? 'Não consegui atualizar. Os números são de ' + C.esc(horaDe(instante.em)) + '. ' : 'Não consegui ler os números agora. ') + '<button type="button" class="btn-link" data-recarregar>tentar de novo</button>' : '';
  }

  /* ---------------- tempo real ---------------- */
  function agendar() { clearTimeout(deb); deb = setTimeout(() => carregarAgora({ silencioso: true }), 700); }
  function ouvir() {
    try {
      canal = C.sb.channel('casa-painel-' + C.perfil.id);
      const tabelas = [];
      if (V.patio) tabelas.push('patio_os');
      if (V.orcamentos) tabelas.push('orc_orcamentos');
      if (V.conversas) tabelas.push('conversas');
      if (V.agenda) tabelas.push('agendamentos');
      for (const t of tabelas) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, agendar);
      if (V.tarefas) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: `responsavel_id=eq.${C.perfil.id}` }, agendar);
      canal.subscribe();
    } catch { /* sem tempo real: o relógio de 60 s cobre */ }
  }

  function aoRede() {
    online = navigator.onLine;
    const av = $('#avisoRede');
    av.hidden = online;
    av.textContent = online ? '' : 'Sem internet. A Central mostra o último que carregou e volta sozinha quando a conexão voltar.';
    if (online) carregarAgora({ silencioso: true });
  }
  /* rodada 10: com menos de 15 s da última leitura boa, voltar para a aba não vai ao banco de novo */
  function aoVisivel() { if (!document.hidden && C && C.perfil && Date.now() - ultima > 15_000) carregarAgora({ silencioso: true }); }
  function aoClicar(e) { if (e.target.closest('[data-recarregar]')) carregarAgora(); if (e.target.closest('#atencaoMais')) alternarAtencao(); }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; V = casa.visao(); links = casa.links; dados = null; atencaoAberta = false; ultima = 0; emFalha = false; carregando = false; vezAgora++;
    zapLido = 0; zapDados = null; { const z = $('#heroiZap'); if (z) { z.hidden = true; z.innerHTML = ''; } }
    online = navigator.onLine;
    $('#atencao').hidden = true;
    instante = null;
    /* R15: último número deste aparelho (mesma pessoa, mesmo dia, menos de 6 h) já no herói enquanto a leitura vem */
    { const snap = window.CasaLogica5.instantaneoValido(lerInstante(), C.perfil.id);
      if (snap) {
        instante = snap; desenharHeroi(snap.d);
        const fr = $('#heroiFrase'); fr.classList.add('heroi-velho'); fr.title = 'Número de ' + horaDe(snap.em) + ', atualizando…';
      } }
    { const mc = $('#meusCarros'); if (mc) mc.hidden = true; }
    relogio(); clearInterval(timerHora); timerHora = setInterval(relogio, 30_000);
    carregarAgora();
    ouvir();
    clearInterval(timerPoll);
    timerPoll = setInterval(() => { if (!document.hidden) carregarAgora({ silencioso: true }); }, 60_000);
    window.addEventListener('online', aoRede); window.addEventListener('offline', aoRede);
    document.addEventListener('visibilitychange', aoVisivel);
    $('#miolo').addEventListener('click', aoClicar);
    C.painel = { atualizar: () => carregarAgora(), dados: () => dados, redesenharZap: desenharZap };
  };
  MOD.desmontar = function () {
    try { if (canal && C) C.sb.removeChannel(canal); } catch { /* segue */ }
    canal = null; clearInterval(timerPoll); clearTimeout(deb); clearInterval(timerHora);
    window.removeEventListener('online', aoRede); window.removeEventListener('offline', aoRede);
    document.removeEventListener('visibilitychange', aoVisivel);
    try { $('#miolo').removeEventListener('click', aoClicar); } catch { /* sem miolo */ }
    dados = null; instante = null;
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
