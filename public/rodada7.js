/* ============================================================================
   Agenda — Rodada 7 / C2 (25/10/2026): a recepção que marca 30 horários por dia.
   Parte PURA (R7Puro, lida de verdade nos testes via node:vm) + parte de TELA (R7).
     Lote 1  · "Chegou" abre a ENTRADA PRONTA no Pátio (aba indycar-patio), "Orçar" só quando falta orçamento,
               "Avisar: pronto" no Início, pronto parado em cor.
   ============================================================================ */
(function (root) {
  'use strict';
  const digitos = (t) => String(t ?? '').replace(/\D/g, '');
  const semFone = (t) => { const d = digitos(t); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d; };
  const emMin = (hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : NaN; };
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const primeiroNome = (n) => {
    const p = (String(n || '').trim().split(/\s+/)[0] || '').replace(/[^\p{L}'’-]/gu, '').slice(0, 30);
    return p.length >= 2 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  };

  /* ------------------------------ Lote 1: Chegou → Pátio ------------------------------ */

  /** Texto do botão da entrada: diz quando o orçamento vai junto. */
  function rotuloDaEntrada(entrada) {
    const o = entrada && entrada.orcamento;
    if (o && o.numero_rotulo) return { texto: 'Dar entrada', titulo: `Abre a entrada pronta no Pátio, já com o orçamento ${o.numero_rotulo}`, comOrcamento: true };
    return { texto: 'Dar entrada', titulo: 'Abre a entrada pronta no Pátio (checklist, fotos e assinatura)', comOrcamento: false };
  }
  /** "Orçar" só aparece quando o carro chegou SEM orçamento ligado (aprovado, enviado ou em aberto). */
  const deveOferecerOrcar = (entrada) => !(entrada && entrada.orcamento);
  /** O link só vale se for https do Pátio com ?entrada=1 (nada de javascript:, nada de outro site). */
  function linkDeEntradaSeguro(link, appDoLink) {
    try {
      const u = new URL(String(link));
      if (u.protocol !== 'https:' || u.username || u.password) return null;
      if (u.searchParams.get('entrada') !== '1') return null;
      if (typeof appDoLink === 'function' && appDoLink(u.href) !== 'patio') return null;
      return u.href;
    } catch { return null; }
  }

  /** Minutos desde uma data ISO (null se a data for inválida ou do futuro). */
  function minutosDesde(iso, agoraMs) {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return null;
    const m = Math.floor(((agoraMs ?? Date.now()) - t) / 60000);
    return m < 0 ? null : m;
  }
  /** 5 → "5 min", 75 → "1h15", 1500 → "1 d". */
  function tempoCurto(min) {
    if (min === null || min === undefined || !Number.isFinite(min)) return '';
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    if (min < 1440) { const h = Math.floor(min / 60), r = min % 60; return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`; }
    return `${Math.floor(min / 1440)} d`;
  }
  /** Quanto tempo parado em cada etapa vira alerta (min): [laranja, vermelho]. Pronto espera pouco: o cliente quer o carro. */
  const LIMITES_ETAPA = { recebido: [60, 180], diagnostico: [120, 300], aguardando_aprovacao: [240, 1440], aguardando_peca: [1440, 4320], em_execucao: [240, 600], teste: [60, 180], pronto: [30, 120] };
  function tomDaEtapa(etapa, min) {
    const l = LIMITES_ETAPA[etapa]; if (!l || min === null || min === undefined) return 'ok';
    return min >= l[1] ? 'ruim' : min >= l[0] ? 'aviso' : 'ok';
  }
  /** No pátio agora: prontos primeiro (do que espera há mais tempo), depois por tempo parado. */
  function ordenarPatio(itens, agoraMs) {
    const peso = (x) => (x.etapa === 'pronto' ? 0 : x.etapa === 'aguardando_aprovacao' ? 1 : 2);
    return (itens || []).slice().sort((a, b) => peso(a) - peso(b)
      || (minutosDesde(b.etapa_em, agoraMs) ?? -1) - (minutosDesde(a.etapa_em, agoraMs) ?? -1));
  }
  /** Recado de carro pronto a partir da OS do Pátio (nome, carro e placa; nada inventado). */
  function mensagemProntoOS(x) {
    const n = primeiroNome(x && x.cliente_nome);
    const carro = [x && x.veiculo, x && x.placa].filter(Boolean).join(' ') || 'carro';
    return `${n ? 'Oi ' + n + '!' : 'Olá!'} Seu ${carro} está pronto aqui na IndyCar. Pode passar para retirar até as 17h30?`;
  }
  function linkWhatsApp(telefone, texto) {
    let d = digitos(telefone);
    if (d.length === 10 || d.length === 11) d = '55' + d;
    if (!/^55[0-9]{10,11}$/.test(d)) return null;
    return `https://wa.me/${d}?text=${encodeURIComponent(String(texto || '').slice(0, 900))}`;
  }
  /** "Avisado às 10:42" a partir do que o aparelho guardou (id da OS → carimbo). Carimbo velho (>1 dia) não vale. */
  function avisadoDe(guardado, osId, agoraMs) {
    const t = guardado && Number(guardado[osId]); if (!Number.isFinite(t) || t <= 0) return null;
    if ((agoraMs ?? Date.now()) - t > 864e5) return null;
    return t;
  }

  /* ------------------------------ Lote 2: Mover com horários livres em botões, remarcar com atalhos, encaixe ------------------------------ */
  const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const rotuloDia = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${DOW[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`; };
  const dataValida = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && !Number.isNaN(Date.parse(iso + 'T12:00:00Z'));
  /** Próximo dia em que a oficina abre (seg–sáb), depois de `iso`. */
  function proximoDiaAberto(iso, n = 1) {
    if (!dataValida(iso)) return null;
    let d = iso;
    for (let i = 0; i < n; i++) { do { d = maisDias(d, 1); } while (new Date(d + 'T12:00:00Z').getUTCDay() === 0); }
    return d;
  }
  /** Atalhos do "Remarcar": amanhã, depois de amanhã e a mesma data na semana que vem (nunca domingo, nunca no passado). */
  function atalhosDeRemarcar(dataAtual, hojeIso) {
    if (!dataValida(hojeIso)) return [];
    const base = dataValida(dataAtual) && dataAtual > hojeIso ? dataAtual : hojeIso;
    const amanha = proximoDiaAberto(hojeIso, 1), depois = proximoDiaAberto(hojeIso, 2);
    let semana = maisDias(base, 7); if (new Date(semana + 'T12:00:00Z').getUTCDay() === 0) semana = maisDias(semana, 1);
    const lista = [{ rotulo: 'Amanhã', data: amanha }, { rotulo: 'Depois de amanhã', data: depois }, { rotulo: 'Semana que vem', data: semana }];
    return lista.filter((x, i) => x.data && x.data !== dataAtual && lista.findIndex((y) => y.data === x.data) === i);
  }
  /**
   * Botões de horário livre para MOVER um cartão. `horarios` = [{ hora, livres, consultores_livres:[id] }] do dia.
   *   original { hora, consultor_id }   o que o cartão tem hoje (não vira botão)
   *   soMesmo   só o consultor do cartão
   * Cada botão é uma dupla hora + consultor; o mais perto da hora de hoje ganha `perto`. Ordem: cronológica.
   */
  function botoesDeHorario(horarios, opcoes) {
    const { original: orig, consultores = [], soMesmo = false, max = 18, excluirOriginal = true } = opcoes || {};
    const original = orig || {};
    const nome = new Map((consultores || []).map((c) => [c.id, c.nome]));
    const alvo = emMin(original.hora);
    let todos = [];
    for (const h of horarios || []) {
      const ids = (h.consultores_livres || []).length ? h.consultores_livres : ((h.livres || 0) > 0 ? [null] : []);
      for (const id of ids) {
        if (soMesmo && original.consultor_id && id !== original.consultor_id) continue;
        if (excluirOriginal && h.hora === String(original.hora || '').slice(0, 5) && (id || null) === (original.consultor_id || null)) continue;
        todos.push({ hora: h.hora, consultor_id: id, consultor_nome: id ? (nome.get(id) || null) : null, dist: Number.isFinite(alvo) ? Math.abs(emMin(h.hora) - alvo) : 0 });
      }
    }
    if (!todos.length) return { botoes: [], total: 0 };
    const melhor = todos.reduce((m, x) => (x.dist < m.dist || (x.dist === m.dist && x.consultor_id === original.consultor_id && m.consultor_id !== original.consultor_id) ? x : m), todos[0]);
    const total = todos.length;
    const cron = (a, b) => a.hora.localeCompare(b.hora) || String(a.consultor_nome).localeCompare(String(b.consultor_nome));
    let recorte = todos.slice().sort((a, b) => a.dist - b.dist || cron(a, b)).slice(0, max);
    if (!recorte.includes(melhor)) recorte = [melhor, ...recorte.slice(0, max - 1)];
    recorte.sort(cron);
    return { botoes: recorte.map((x) => ({ hora: x.hora, consultor_id: x.consultor_id, consultor_nome: x.consultor_nome, perto: x === melhor })), total };
  }
  /** Texto do botão: "10:30 · Gabriel" (ou só a hora quando ninguém é nomeado). */
  const rotuloDoBotao = (b) => `${b.hora}${b.consultor_nome ? ' · ' + primeiroNome(b.consultor_nome) : ''}`;
  /** Dias com vaga (saída de /horarios-livres/proximos) viram botões "ter 27/10 · 5". */
  function botoesDeDias(diasLivres, dataAtual, max = 6) {
    return (diasLivres || []).filter((d) => d && d.total > 0 && dataValida(d.data) && d.data !== dataAtual).slice(0, max)
      .map((d) => ({ data: d.data, rotulo: rotuloDia(d.data), total: d.total }));
  }
  /** Texto do WhatsApp que oferece um horário a quem está na espera. */
  function textoDeOferta(espera, data, hora, consultorNome) {
    const n = primeiroNome(espera && espera.cliente_nome);
    const com = consultorNome ? ` com ${primeiroNome(consultorNome)}` : '';
    return `${n ? 'Oi ' + n + '!' : 'Olá!'} Aqui é da IndyCar 🏁 Abriu um horário para ${String((espera && espera.servico) || 'o seu serviço').slice(0, 80)}: ${rotuloDia(data)} às ${hora}${com}. Posso reservar para você?`;
  }

  /* ------------------------------ Lote 3: falta e confirmação ------------------------------ */
  const MOTIVOS = [
    { id: 'esqueceu', rotulo: 'Esqueceu' }, { id: 'imprevisto', rotulo: 'Imprevisto' },
    { id: 'remarcou_outro_canal', rotulo: 'Remarcou por outro canal' }, { id: 'sem_resposta', rotulo: 'Não atendeu / sem resposta' },
    { id: 'resolveu_outro_lugar', rotulo: 'Resolveu em outro lugar' }, { id: 'outro', rotulo: 'Outro motivo' },
  ];
  const rotuloDoMotivo = (id) => { const m = MOTIVOS.find((x) => x.id === id); return m ? m.rotulo : ''; };
  /** Quem ainda não deu sinal no dia: vivo, não chegou, sem "confirmou". */
  function semConfirmacaoDoDia(lista, data) {
    return (lista || []).filter((a) => a && String(a.data || '').slice(0, 10) === data
      && ['aguardando', 'confirmado'].includes(a.status) && !(a.compareceu === 1 || a.compareceu === true)
      && !(a.confirmado === true || a.confirmado === 1) && (a.confirmacao && a.confirmacao.resposta) !== 'confirmou')
      .sort((x, y) => String(x.hora).localeCompare(String(y.hora)));
  }
  function placarDeConfirmacao(lista, data) {
    const vivos = (lista || []).filter((a) => a && String(a.data || '').slice(0, 10) === data && ['aguardando', 'confirmado'].includes(a.status));
    const ok = vivos.filter((a) => a.confirmado === true || a.confirmado === 1 || (a.confirmacao && a.confirmacao.resposta) === 'confirmou').length;
    return { total: vivos.length, confirmados: ok, pendentes: vivos.length - ok,
      pediramRemarcar: vivos.filter((a) => a.confirmacao && a.confirmacao.resposta === 'remarcar').length,
      naoVao: vivos.filter((a) => a.confirmacao && a.confirmacao.resposta === 'nao_vem').length };
  }
  /** Recado de WhatsApp para quem faltou. */
  function textoDeReagendar({ nome, servico, sugestao } = {}) {
    const p = primeiroNome(nome);
    const oi = p ? `Oi ${p}!` : 'Oi!';
    const sv = String(servico || '').trim().slice(0, 60);
    const alvo = sv ? ` de ${sv}` : '';
    if (sugestao && sugestao.rotulo && sugestao.hora) return `${oi} Aqui é da IndyCar 🏁 Sentimos sua falta no horário${alvo}. Posso remarcar para ${sugestao.rotulo} às ${sugestao.hora}? É só responder aqui.`;
    return `${oi} Aqui é da IndyCar 🏁 Sentimos sua falta no horário${alvo}. Quer que a gente remarque? Me diga o melhor dia e horário.`;
  }
  /** Recado simples de confirmação (vale para qualquer papel; o link com resposta no cartão continua existindo). */
  function textoDeConfirmar({ nome, servico, data, hora, hoje } = {}) {
    const p = primeiroNome(nome);
    const falado = hoje && data === hoje ? 'hoje' : hoje && data === maisDias(hoje, 1) ? 'amanhã' : rotuloDia(data);
    const quando = `${falado} às ${String(hora || '').slice(0, 5)}`;
    return `${p ? 'Oi ' + p + '!' : 'Olá!'} Aqui é da IndyCar 🏁 Seu horário${servico ? ' de ' + String(servico).slice(0, 60) : ''} está marcado para ${quando}. Confirma pra gente? Responda SIM, ou me diga se precisar remarcar.`;
  }

  const PURO = { digitos, semFone, emMin, hm, maisDias, primeiroNome, rotuloDaEntrada, deveOferecerOrcar, linkDeEntradaSeguro,
    minutosDesde, tempoCurto, LIMITES_ETAPA, tomDaEtapa, ordenarPatio, mensagemProntoOS, linkWhatsApp, avisadoDe,
    rotuloDia, proximoDiaAberto, atalhosDeRemarcar, botoesDeHorario, rotuloDoBotao, botoesDeDias, textoDeOferta,
    MOTIVOS, rotuloDoMotivo, semConfirmacaoDoDia, placarDeConfirmacao, textoDeReagendar, textoDeConfirmar };
  root.R7Puro = PURO;
  if (typeof document === 'undefined') return;

  /* ================================ TELA ================================ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const escH = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lerLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue */ } };
  const LS_AUTO = 'indycar_r7_entrada_auto', LS_AVISADOS = 'indycar_r7_avisados';
  const semAcessoDeEquipe = () => typeof state !== 'undefined' && state.perfil && state.perfil.papel === 'agenda';

  /* ---- "Chegou": a entrada pronta no Pátio ---- */
  const entradaAuto = () => lerLS(LS_AUTO) === '1';
  function definirEntradaAuto(v) { gravarLS(LS_AUTO, v ? '1' : '0'); $$('[data-r7-auto]').forEach((c) => { c.checked = !!v; }); }
  function abrirEntrada(link) {
    const seguro = linkDeEntradaSeguro(link, root.IndyCarApps && root.IndyCarApps.appDoLink);
    if (!seguro) { if (typeof toast === 'function') toast('O link da entrada não parece do Pátio — abra pelo botão do Pátio.', 'err'); return false; }
    const ok = root.IndyCarApps ? root.IndyCarApps.abrir(seguro) : !!root.open(seguro, 'indycar-patio');
    if (!ok && typeof toast === 'function') toast('O navegador bloqueou a nova aba. Libere pop-ups para esta página.', 'err');
    return ok;
  }
  /** Ação do recado do "Chegou". Se a pessoa ligou "abrir sozinho", abre na hora e devolve null (sem botão repetido). */
  function acaoDeEntrada(r) {
    const e = r && r.entrada; if (!e || !e.link) return null;
    if (entradaAuto()) { abrirEntrada(e.link); return null; }
    const rot = rotuloDaEntrada(e);
    return { rotulo: rot.texto, fn: () => abrirEntrada(e.link) };
  }
  /** Interruptor "abrir a entrada sozinho" (Quadro e Recepção). */
  function interruptorAuto() {
    const l = document.createElement('label');
    l.className = 'qd-opt r7-auto'; l.title = 'Ao marcar "Chegou", abre sozinho a entrada pronta no Pátio (aba do Pátio)';
    l.innerHTML = '<input type="checkbox" data-r7-auto> abrir a entrada do Pátio sozinho';
    $('input', l).checked = entradaAuto();
    return l;
  }
  document.addEventListener('change', (ev) => { const c = ev.target; if (c && c.matches && c.matches('input[data-r7-auto]')) definirEntradaAuto(c.checked); });

  /* ---- Quadro: botão "Entrada" no cartão de quem chegou ---- */
  function botaoEntradaNoQuadro(d) {
    for (const card of $$('#qdCorpo .qd-card')) {
      if (!['compareceu', 'em_atendimento'].includes(card.dataset.status)) continue;
      const acoes = $('.qd-acoes', card); if (!acoes || $('[data-qd-entrada]', acoes)) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn mini primary'; b.dataset.qdEntrada = card.dataset.id; b.textContent = '🔧 Entrada';
      b.title = 'Abre a entrada pronta no Pátio (checklist, fotos e assinatura)';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); entradaDoCartao(card.dataset.id, b); });
      acoes.insertBefore(b, acoes.firstChild);
    }
  }
  async function entradaDoCartao(id, botao) {
    if (botao) botao.disabled = true;
    try {
      const r = await api('GET', `/agendamentos/${id}/entrada-patio`, null, { repetir: false });
      abrirEntrada(r.link);
    } catch (e) { toast(e.message || 'Não consegui montar a entrada agora', 'err'); }
    finally { if (botao) botao.disabled = false; }
  }

  function aposDesenharQuadro(d) {
    if (!d) return;
    try { painelConfirmacao(d); } catch (e) { /* o painel nunca derruba o Quadro */ }
    if (semAcessoDeEquipe()) return;
    botaoEntradaNoQuadro(d);
    const barra = $('#qdFerr');
    if (barra && !$('.r7-auto', barra)) barra.appendChild(interruptorAuto());
  }

  /* ---- Início, "No pátio agora": WhatsApp para os carros prontos ---- */
  const avisados = () => { try { return JSON.parse(lerLS(LS_AVISADOS) || '{}') || {}; } catch { return {}; } };
  function marcarAvisado(osId) {
    const m = avisados(); const agora = Date.now();
    for (const k of Object.keys(m)) if (agora - Number(m[k]) > 864e5) delete m[k];
    m[osId] = agora; gravarLS(LS_AVISADOS, JSON.stringify(m));
  }
  const horaCurta = (ms) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  /** HTML do botão "Avisar" de um item do pátio (só carro pronto, com telefone válido). */
  function botaoAvisarPronto(x) {
    if (!x || x.etapa !== 'pronto') return '';
    const wa = linkWhatsApp(x.telefone, mensagemProntoOS(x));
    if (!wa) return '<small class="muted r7-sem-fone">sem telefone</small>';
    const quando = avisadoDe(avisados(), x.os_id);
    return `<a class="btn mini ${quando ? '' : 'primary'} r7-avisar" href="${escH(wa)}" target="_blank" rel="noopener" data-r7-avisar="${escH(x.os_id)}"
        title="Abre o WhatsApp com o recado de carro pronto">${quando ? '↻ Avisar de novo' : '💬 Avisar: pronto'}</a>${quando ? `<small class="muted r7-avisado">avisado ${escH(horaCurta(quando))}</small>` : ''}`;
  }
  document.addEventListener('click', (ev) => {
    const a = ev.target && ev.target.closest && ev.target.closest('[data-r7-avisar]');
    if (a) setTimeout(() => marcarAvisado(a.dataset.r7Avisar), 0);
  }, true);

  /* ---- Lote 2: Mover com horários livres em botões ---- */
  const pm = { a: null, dia: null, soMesmo: true, porDia: new Map(), proximos: null, max: 18, vez: 0 };
  const painelMover = () => $('#qdMoverPainel');
  async function carregarDiaLivre(a, data) {
    const hit = pm.porDia.get(data);
    if (hit && Date.now() - hit.em < 20000) return hit.r;
    const qs = new URLSearchParams({ data, ignorar: a.id }); if (a.servico) qs.set('servico', a.servico);
    const r = await api('GET', '/horarios-livres/dia?' + qs, null, { repetir: false }).catch(() => null);
    pm.porDia.set(data, { em: Date.now(), r });
    return r;
  }
  async function carregarProximos(a) {
    const qs = new URLSearchParams({ desde: maisDias(a.data, 1), dias: '14', quantosDias: '5' });
    if (a.servico) qs.set('servico', a.servico);
    if (pm.soMesmo && a.consultor_id) qs.set('consultor_id', a.consultor_id);
    const r = await api('GET', '/horarios-livres/proximos?' + qs, null, { repetir: false }).catch(() => null);
    return (r && r.dias_livres) || [];
  }
  async function abrirPainelMover(a) {
    const eu = ++pm.vez;
    Object.assign(pm, { a, dia: a.data, soMesmo: !!a.consultor_id, porDia: new Map(), proximos: null, max: 18 });
    const el = painelMover(); if (!el) return;
    el.hidden = false; el.innerHTML = '<span class="muted">Procurando horários livres…</span>';
    const [, prox] = await Promise.all([carregarDiaLivre(a, a.data), carregarProximos(a)]);
    if (eu !== pm.vez || !pm.a) return;
    pm.proximos = prox;
    desenharPainelMover();
  }
  function fecharPainelMover() {
    pm.vez++; pm.a = null;
    const el = painelMover(); if (el) { el.hidden = true; el.innerHTML = ''; }
  }
  function desenharPainelMover() {
    const el = painelMover(); const a = pm.a; if (!el || !a) return;
    const info = pm.porDia.get(pm.dia) && pm.porDia.get(pm.dia).r;
    const consultores = (typeof state !== 'undefined' && state.consultores) || [];
    const { botoes, total } = botoesDeHorario((info && info.horarios) || [], { original: { hora: String(a.hora).slice(0, 5), consultor_id: a.consultor_id || null }, consultores,
      soMesmo: pm.soMesmo && !!a.consultor_id, max: pm.max, excluirOriginal: pm.dia === a.data });
    const dias = botoesDeDias(pm.proximos, a.data);
    const hoje = (typeof agoraSP === 'function' && agoraSP().data) || a.data;
    const nomeCons = a.consultor_nome ? primeiroNome(a.consultor_nome) : '';
    const vazio = info && info.aberto === false ? `A oficina não abre ${pm.dia === a.data ? 'neste dia' : 'em ' + rotuloDia(pm.dia)}.` : 'Nenhum horário livre aqui — tente outro dia ou desligue o filtro do consultor.';
    el.innerHTML = `<div class="qdm-topo"><b>Horários livres para ${escH(primeiroNome(a.cliente_nome) || 'o cliente')}</b>
        <span class="muted">toque para mover · hoje ele está às ${escH(String(a.hora).slice(0, 5))}</span>
        ${a.consultor_id ? `<label class="qd-opt"><input type="checkbox" data-qdm-mesmo ${pm.soMesmo ? 'checked' : ''}> só com ${escH(nomeCons || 'o mesmo consultor')}</label>` : ''}
        <button type="button" class="btn mini" data-qdm-fechar>Cancelar (Esc)</button></div>
      <div class="qdm-dias" role="group" aria-label="Dia">
        <button type="button" class="pilula ${pm.dia === a.data ? 'ativa' : ''}" data-qdm-dia="${escH(a.data)}" aria-pressed="${pm.dia === a.data}">${a.data === hoje ? 'Hoje' : escH(rotuloDia(a.data))}</button>
        ${dias.map((d) => `<button type="button" class="pilula ${pm.dia === d.data ? 'ativa' : ''}" data-qdm-dia="${escH(d.data)}" aria-pressed="${pm.dia === d.data}">${escH(d.rotulo)} <em class="tab-num">${d.total}</em></button>`).join('')}
      </div>
      <div class="qdm-botoes" role="group" aria-label="Horários livres">${botoes.length ? botoes.map((b, i) => `<button type="button" class="btn mini qdm-btn${b.perto ? ' perto' : ''}" data-qdm-i="${i}" title="${b.perto ? 'O mais perto do horário de hoje' : 'Mover para este horário'}">${b.perto ? '★ ' : ''}${escH(rotuloDoBotao(b))}</button>`).join('') : `<span class="muted qdm-vazio">${escH(vazio)}</span>`}
        ${total > botoes.length ? `<button type="button" class="btn mini" data-qdm-mais>+${total - botoes.length} horários</button>` : ''}</div>`;
    el._botoes = botoes;
    $('[data-qdm-fechar]', el).addEventListener('click', () => { const s = document.getElementById('qdSoltar'); if (s) s.click(); });
    const mesmo = $('[data-qdm-mesmo]', el);
    if (mesmo) mesmo.addEventListener('change', async () => { pm.soMesmo = mesmo.checked; pm.proximos = await carregarProximos(a); if (pm.a === a) desenharPainelMover(); });
    $$('[data-qdm-dia]', el).forEach((b) => b.addEventListener('click', async () => {
      pm.dia = b.dataset.qdmDia; b.disabled = true;
      await carregarDiaLivre(a, pm.dia);
      if (pm.a === a) desenharPainelMover();
    }));
    const mais = $('[data-qdm-mais]', el); if (mais) mais.addEventListener('click', () => { pm.max = 200; desenharPainelMover(); });
    $$('[data-qdm-i]', el).forEach((b) => b.addEventListener('click', () => {
      const x = el._botoes[Number(b.dataset.qdmI)]; if (!x) return;
      $$('.qdm-btn', el).forEach((y) => { y.disabled = true; });
      root.R6b.mover(a, x.hora, x.consultor_id, pm.dia);
    }));
  }
  function aoConflitoDeMover() {
    if (!pm.a) return;
    pm.porDia.delete(pm.dia);
    carregarDiaLivre(pm.a, pm.dia).then(() => { if (pm.a) desenharPainelMover(); });
  }
  function destacarCelula(slot, consultorId) {
    const cel = document.querySelector(`#qdCorpo .qd-cel[data-slot="${Number(slot)}"][data-cons="${CSS.escape(consultorId || '')}"]`);
    if (!cel) return;
    try { cel.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* sem rolagem */ }
    cel.classList.add('recem-movido'); setTimeout(() => cel.classList.remove('recem-movido'), 2200);
  }

  /* ---- Lote 2: "Remarcar" com atalhos de data ---- */
  function atalhosNoRemarcar() {
    const data = document.getElementById('r_data'); if (!data || document.getElementById('r7Atalhos')) return;
    const hoje = (typeof agoraSP === 'function' && agoraSP().data) || null; if (!hoje) return;
    const lista = atalhosDeRemarcar(data.value, hoje); if (!lista.length) return;
    const caixa = document.createElement('div'); caixa.id = 'r7Atalhos'; caixa.className = 'sugestoes r7-atalhos'; caixa.setAttribute('role', 'group'); caixa.setAttribute('aria-label', 'Atalhos de data');
    caixa.innerHTML = '<span class="muted">Mesma hora:</span>' + lista.map((x) => `<button type="button" class="chip-sugestao" data-r7-data="${escH(x.data)}">${escH(x.rotulo)} <small class="muted">${escH(rotuloDia(x.data))}</small></button>`).join('');
    const grid = data.closest('.grid2') || data.parentElement;
    grid.parentNode.insertBefore(caixa, grid);
    $$('[data-r7-data]', caixa).forEach((b) => b.addEventListener('click', () => {
      data.value = b.dataset.r7Data; data.dispatchEvent(new Event('change', { bubbles: true }));
      $$('[data-r7-data]', caixa).forEach((y) => y.classList.toggle('ativo', y === b));
    }));
  }
  if (typeof root.abrirRemarcar === 'function' && !root.abrirRemarcar._r7) {
    const original = root.abrirRemarcar;
    const embrulhado = async function () { const r = await original.apply(this, arguments); try { atalhosNoRemarcar(); } catch { /* o modal segue como sempre */ } return r; };
    embrulhado._r7 = true; root.abrirRemarcar = embrulhado;
  }

  /* ---- Lote 2: "Quem cabe aqui?" — encaixe a partir de uma célula livre do Quadro ---- */
  function abrirNovoNaCelula(pre) { if (typeof openAgendamentoModal === 'function') openAgendamentoModal(null, pre); }
  async function encaixarAqui(pre) {
    const caixa = $('#qdEncaixe');
    const nEsp = typeof state !== 'undefined' && state.contagens && typeof state.contagens.espera === 'number' ? state.contagens.espera : null;
    if (!caixa || nEsp === 0 || semAcessoDeEquipe()) return abrirNovoNaCelula(pre);
    const qs = new URLSearchParams({ data: pre.data, hora: pre.hora }); if (pre.consultor_id) qs.set('consultor_id', pre.consultor_id);
    const r = await api('GET', '/espera/cabe?' + qs, null, { repetir: false }).catch(() => null);
    if (!r || !r.itens || !r.itens.length) { caixa.hidden = true; return abrirNovoNaCelula(pre); }
    const consultores = (typeof state !== 'undefined' && state.consultores) || [];
    const cons = consultores.find((c) => c.id === pre.consultor_id);
    const nomeCons = cons ? cons.nome : '';
    caixa.hidden = false;
    caixa.innerHTML = `<div class="qdm-topo"><b>${r.itens.length === 1 ? '1 pessoa da espera serve' : r.itens.length + ' pessoas da espera servem'} para ${escH(pre.hora)}${nomeCons ? ' com ' + escH(primeiroNome(nomeCons)) : ''}</b>
        <span class="muted">encaixe com um toque</span><button type="button" class="btn mini" data-qde-fechar>Fechar</button></div>
      <div class="qdm-botoes">${r.itens.map((e, i) => {
        const wa = linkWhatsApp(e.telefone, textoDeOferta(e, pre.data, pre.hora, nomeCons));
        return `<span class="qde-item"><button type="button" class="btn mini primary" data-qde="${i}" title="Encaixar ${escH(e.cliente_nome)} neste horário">${escH(primeiroNome(e.cliente_nome) || e.cliente_nome)} · ${escH(String(e.servico || '').slice(0, 28))}${e.dias_na_espera ? ` <small>${e.dias_na_espera} d</small>` : ''}</button>${wa ? `<a class="btn mini" href="${escH(wa)}" target="_blank" rel="noopener" title="Oferecer este horário pelo WhatsApp">💬</a>` : ''}</span>`;
      }).join('')}
        <button type="button" class="btn mini" data-qde-outro>Marcar outra pessoa</button></div>`;
    caixa._itens = r.itens;
    $('[data-qde-fechar]', caixa).addEventListener('click', () => { caixa.hidden = true; });
    $('[data-qde-outro]', caixa).addEventListener('click', () => { caixa.hidden = true; abrirNovoNaCelula(pre); });
    $$('[data-qde]', caixa).forEach((b) => b.addEventListener('click', () => {
      const e = caixa._itens[Number(b.dataset.qde)]; if (!e) return;
      caixa.hidden = true;
      abrirNovoNaCelula({ cliente_nome: e.cliente_nome, telefone: e.telefone || '', veiculo: e.veiculo || '', placa: e.placa || '', servico: e.servico, cliente_id: e.cliente_id || '',
        data: pre.data, hora: pre.hora, consultor_id: pre.consultor_id || '', espera_id: e.id, origem: 'WhatsApp' });
    }));
  }

  /* ---- Lote 3: motivo da falta (folha de baixo, um toque) ---- */
  let _motivoTimer = null;
  function fecharMotivo() { clearTimeout(_motivoTimer); const f = $('#r7Motivo'); if (f) f.remove(); }
  function pedirMotivo(id, nome) {
    if (!id) return;
    fecharMotivo();
    const f = document.createElement('div'); f.id = 'r7Motivo'; f.className = 'r7-motivo'; f.setAttribute('role', 'group'); f.setAttribute('aria-label', 'Por que não veio?');
    const p = primeiroNome(nome);
    f.innerHTML = `<div class="r7m-topo"><b>Por que ${p ? escH(p) + ' ' : ''}não veio?</b><span class="muted">um toque — ajuda o relatório de faltas</span><button type="button" class="btn mini" data-r7m-fechar>Depois</button></div>
      <div class="r7m-chips">${MOTIVOS.map((m) => `<button type="button" class="btn r7m-chip" data-r7m="${escH(m.id)}">${escH(m.rotulo)}</button>`).join('')}</div>`;
    document.body.appendChild(f);
    $('[data-r7m-fechar]', f).addEventListener('click', fecharMotivo);
    $$('[data-r7m]', f).forEach((b) => b.addEventListener('click', async () => {
      $$('[data-r7m]', f).forEach((x) => { x.disabled = true; });
      try {
        const r = await api('PATCH', `/agendamentos/${id}/motivo-falta`, { motivo: b.dataset.r7m }, { repetir: false });
        f.innerHTML = `<div class="r7m-topo"><b>Anotado: ${escH(r.rotulo || rotuloDoMotivo(b.dataset.r7m))} ✓</b></div>`;
        _motivoTimer = setTimeout(fecharMotivo, 1600);
        const dq = window.R6b && R6b.estado && R6b.estado.dados; const aq = dq && dq.lista && dq.lista.find((x) => x.id === id);
        if (aq) { aq.motivo_falta = b.dataset.r7m; if (R6b.redesenhar) R6b.redesenhar(); }
        const card = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
        const alvo = card && card.querySelector('[data-r7-falta]');
        if (alvo) alvo.outerHTML = faltaHtml({ id, status: 'nao_veio', motivo_falta: b.dataset.r7m });
      } catch (e) { $$('[data-r7m]', f).forEach((x) => { x.disabled = false; }); toast(e.message || 'Não consegui anotar o motivo', 'err'); }
    }));
    _motivoTimer = setTimeout(fecharMotivo, 25000);
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('#r7Motivo')) fecharMotivo(); });

  /** Bloquinho do cartão de quem faltou: o motivo (ou "Motivo?") e o recado de reagendar pelo WhatsApp. */
  function faltaHtml(a, linkWa) {
    if (!a || a.status !== 'nao_veio') return '';
    const mot = a.motivo_falta ? rotuloDoMotivo(a.motivo_falta) : '';
    return `<span class="r7-falta" data-r7-falta>${mot ? `<span class="badge-pill bp-gray" title="Motivo da falta">${escH(mot)}</span>` : `<button type="button" class="btn mini act" data-act="motivo" data-qd="motivo" title="Anotar por que não veio">Motivo?</button>`}${linkWa ? `<a class="btn mini" data-r7-wa href="${escH(linkWa)}" target="_blank" rel="noopener" title="Chamar no WhatsApp para remarcar">💬 Reagendar</a>` : ''}</span>`;
  }
  const linkDeReagendar = (a) => linkWhatsApp(a && a.telefone, textoDeReagendar({ nome: a && a.cliente_nome, servico: a && a.servico }));

  /* ---- Lote 3: painel "sem confirmar" do dia no Quadro ---- */
  const LS_ABERTO = 'indycar_r7_conf_aberto';
  function painelConfirmacao(d) {
    const quadro = $('#qdCorpo'); if (!quadro) return;
    let host = $('#qdConf');
    if (!host) { host = document.createElement('div'); host.id = 'qdConf'; host.className = 'r7-conf'; const ref = $('#qdEncaixe'); if (ref && ref.parentNode) ref.parentNode.insertBefore(host, ref.nextSibling); else quadro.parentNode.insertBefore(host, quadro); }
    const hoje = (typeof agoraSP === 'function' ? agoraSP().data : '');
    const lista = (d && d.lista) || [];
    const pl = placarDeConfirmacao(lista, d.data);
    const pend = semConfirmacaoDoDia(lista, d.data);
    if (!pl.total || (d.data < hoje)) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    const aberto = lerLS(LS_ABERTO) === '1' && pend.length > 0;
    const extra = [pl.pediramRemarcar ? `${pl.pediramRemarcar} pediram para remarcar` : '', pl.naoVao ? `${pl.naoVao} avisaram que não vêm` : ''].filter(Boolean).join(' · ');
    const comLink = !semAcessoDeEquipe();
    host.innerHTML = `<button type="button" class="r7c-cab ${pend.length ? 'pend' : 'ok'}" data-r7c-alt aria-expanded="${aberto}">
        <b>${pl.confirmados} de ${pl.total} confirmados</b>${pend.length ? ` · <span>${pend.length} sem confirmar</span>` : ' · tudo certo'}${extra ? ` · <span class="muted">${escH(extra)}</span>` : ''}
        ${pend.length ? `<span class="r7c-seta">${aberto ? '▲' : '▼'}</span>` : ''}</button>
      ${aberto ? `<ul class="r7c-lista">${pend.map((a) => {
        const wa = linkWhatsApp(a.telefone, textoDeConfirmar({ nome: a.cliente_nome, servico: a.servico, data: a.data, hora: a.hora, hoje }));
        return `<li data-r7c-id="${escH(a.id)}"><b>${escH(String(a.hora).slice(0, 5))}</b> <span class="r7c-nome">${escH(a.cliente_nome)}</span> <small class="muted">${escH(a.servico || '')}${a.consultor_nome ? ' · ' + escH(primeiroNome(a.consultor_nome)) : ''}</small>
          <span class="r7c-acoes">${wa ? `<a class="btn mini" href="${escH(wa)}" target="_blank" rel="noopener" title="Pedir a confirmação pelo WhatsApp (texto pronto)">💬 Pedir</a>` : '<small class="muted">sem telefone</small>'}
          ${comLink && a.telefone && typeof window.pedirConfirmacao === 'function' ? `<button type="button" class="btn mini" data-r7c-link title="Gerar o link em que o cliente toca em Confirmo">🔗 Link</button>` : ''}
          <button type="button" class="btn mini primary" data-r7c-ok title="O cliente já confirmou (por telefone ou conversa)">Já confirmou</button></span></li>`;
      }).join('')}</ul>` : ''}`;
    $('[data-r7c-alt]', host).addEventListener('click', () => { if (!pend.length) return; gravarLS(LS_ABERTO, aberto ? '0' : '1'); painelConfirmacao(d); });
    $$('[data-r7c-ok]', host).forEach((b) => b.addEventListener('click', async () => {
      const li = b.closest('[data-r7c-id]'); const id = li.dataset.r7cId; b.disabled = true;
      try {
        await api('PATCH', `/agendamentos/${id}/status`, { status: 'confirmado' }, { repetir: false });
        const a = lista.find((x) => x.id === id); if (a) { a.confirmado = true; a.status = 'confirmado'; }
        toast('Confirmado ✅'); painelConfirmacao(d);
        if (window.R6b && R6b.redesenhar) R6b.redesenhar();
      } catch (e) { b.disabled = false; toast(e.message || 'Não consegui marcar', 'err'); }
    }));
    $$('[data-r7c-link]', host).forEach((b) => b.addEventListener('click', () => window.pedirConfirmacao(b.closest('[data-r7c-id]').dataset.r7cId)));
  }

  root.R7 = { pedirMotivo, fecharMotivo, faltaHtml, linkDeReagendar, painelConfirmacao, abrirPainelMover, fecharPainelMover, aoConflitoDeMover, destacarCelula, encaixarAqui, atalhosNoRemarcar, aposDesenharQuadro, acaoDeEntrada, abrirEntrada, entradaDoCartao, entradaAuto, definirEntradaAuto, interruptorAuto, botaoAvisarPronto, marcarAvisado, avisados, PURO };
})(typeof globalThis !== 'undefined' ? globalThis : window);
