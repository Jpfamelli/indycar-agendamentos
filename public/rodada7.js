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

  const PURO = { digitos, semFone, emMin, hm, maisDias, primeiroNome, rotuloDaEntrada, deveOferecerOrcar, linkDeEntradaSeguro,
    minutosDesde, tempoCurto, LIMITES_ETAPA, tomDaEtapa, ordenarPatio, mensagemProntoOS, linkWhatsApp, avisadoDe };
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
    if (!d || semAcessoDeEquipe()) return;
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

  root.R7 = { aposDesenharQuadro, acaoDeEntrada, abrirEntrada, entradaDoCartao, entradaAuto, definirEntradaAuto, interruptorAuto, botaoAvisarPronto, marcarAvisado, avisados, PURO };
})(typeof globalThis !== 'undefined' ? globalThis : window);
