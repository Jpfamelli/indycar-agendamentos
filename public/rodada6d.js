/* Agenda — rodada 6 (C1c, lote 4): o dia a dia da recepção.
   - todo link para outro sistema (Pátio, Orçador, CRM, Atendimento, Comunicar, WhatsApp) abre na aba NOMEADA dele
     (clicar de novo volta para a mesma aba em vez de empilhar abas);
   - passar o mouse/foco num cartão do Quadro destaca os outros horários da mesma pessoa/carro;
   - "↻ Repetir": novo horário já com cliente, telefone, carro e serviço;
   - carro pronto no Pátio: botão "Avisar" abre o WhatsApp com o recado pronto (Quadro e lista do dia);
   - atalhos no Quadro: / procura no Quadro; N abre o horário novo já no dia que está na tela (ver app.js).
   A parte pura (nomeDaAba, chaveDoCliente, mensagemPronto, ...) é carregada sozinha nos testes (node:vm). */
(function (root) {
  'use strict';
  const digitos = (t) => String(t || '').replace(/\D/g, '');
  const semFone = (t) => { const d = digitos(t); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d; };

  /** Nome da aba para um endereço: WhatsApp → indycar-whatsapp; app do ecossistema → indycar-<app>; o resto → null. */
  function nomeDaAba(href, appDoLink) {
    let u;
    try { u = new URL(String(href), 'https://indycar.invalido/'); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    if (u.host === 'wa.me' || u.host === 'api.whatsapp.com' || u.host === 'web.whatsapp.com') return 'indycar-whatsapp';
    const k = typeof appDoLink === 'function' ? appDoLink(String(href)) : null;
    return k ? 'indycar-' + k : null;
  }

  /** Chave que junta os horários de uma mesma pessoa: telefone sem 55 (10+ dígitos) ou, sem ele, a placa. */
  function chaveDoCliente(a) {
    const t = semFone(a && a.telefone);
    if (t.length >= 10) return 't' + t;
    const p = String((a && a.placa) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return p.length >= 7 ? 'p' + p : '';
  }
  /** ids que dividem a chave com o `id` (fora ele mesmo); só horários que ainda valem. */
  function mesmosDoCliente(lista, id) {
    const alvo = (lista || []).find((x) => x.id === id);
    const k = alvo && chaveDoCliente(alvo);
    if (!k) return [];
    return lista.filter((x) => x.id !== id && x.status !== 'cancelado' && chaveDoCliente(x) === k).map((x) => x.id);
  }

  const primeiroNome = (n) => {
    const p = (String(n || '').trim().split(/\s+/)[0] || '').replace(/[^\p{L}'’-]/gu, '').slice(0, 30);
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  };
  function linkWhatsApp(telefone, texto) {
    let d = digitos(telefone);
    if (d.length === 10 || d.length === 11) d = '55' + d;
    if (!/^55[0-9]{10,11}$/.test(d)) return null;
    return `https://wa.me/${d}?text=${encodeURIComponent(String(texto || '').slice(0, 900))}`;
  }
  /** Recado de carro pronto: nome, o carro e a hora limite; sem inventar nada que a Agenda não sabe. */
  function mensagemPronto(a) {
    const n = primeiroNome(a && a.cliente_nome);
    const carro = [a && a.veiculo, a && a.placa].filter(Boolean).join(' ') || 'carro';
    return `${n ? 'Oi ' + n + '!' : 'Olá!'} Seu ${carro} está pronto aqui na IndyCar. Pode passar para retirar até as 17h30?`;
  }
  /** Dados para "Repetir": o que vale carregar para um novo horário do mesmo cliente. */
  function paraRepetir(a, origensValidas = []) {
    const o = {};
    for (const k of ['cliente_nome', 'telefone', 'veiculo', 'placa', 'servico', 'cliente_id', 'consultor_id']) if (a && a[k]) o[k] = a[k];
    if (a && a.origem && (!origensValidas.length || origensValidas.includes(a.origem))) o.origem = a.origem;
    return o;
  }
  const PURO = { nomeDaAba, chaveDoCliente, mesmosDoCliente, mensagemPronto, paraRepetir, linkWhatsApp, primeiroNome, semFone };
  root.R6dPuro = PURO;
  if (typeof document === 'undefined') return;

  /* ================================ TELA ================================ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcesso = () => typeof emPresenca === 'function' && emPresenca();
  const Q = () => (root.R6b && root.R6b.estado) || {};
  const CHEGOU = new Set(['compareceu', 'em_atendimento', 'concluido', 'nao_fechou']);

  /* ---- 1) links entre sistemas: sempre a aba nomeada ---- */
  document.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target && ev.target.closest && ev.target.closest('a[href][target="_blank"]');
    if (!a) return;
    const nome = nomeDaAba(a.href, root.IndyCarApps && root.IndyCarApps.appDoLink);
    if (!nome) return;
    ev.preventDefault();
    const w = root.open(a.href, nome);
    try { w && w.focus(); } catch { /* outra origem */ }
    if (!w) { try { root.location.assign(a.href); } catch { /* bloqueado */ } }
  }, true);

  /* ---- 2) mesma pessoa: destaque ao passar o mouse / foco ---- */
  function ligarDestaque(host) {
    if (!host || host._r6dDestaque) return;
    host._r6dDestaque = true;
    const limpar = () => $$('.qd-card.mesmo', host).forEach((c) => c.classList.remove('mesmo'));
    const marcar = (card) => {
      limpar();
      const d = Q().dados; if (!card || !d) return;
      for (const id of mesmosDoCliente(d.lista, card.dataset.id)) { const c = host.querySelector(`.qd-card[data-id="${CSS.escape(id)}"]`); if (c) c.classList.add('mesmo'); }
    };
    host.addEventListener('mouseover', (e) => marcar(e.target.closest && e.target.closest('.qd-card')));
    host.addEventListener('mouseleave', limpar);
    host.addEventListener('focusin', (e) => marcar(e.target.closest && e.target.closest('.qd-card')));
    host.addEventListener('focusout', limpar);
    host._r6dMarcar = marcar;
  }

  /* ---- 3) "Repetir" e 4) "Avisar: pronto" nos cartões do Quadro ---- */
  function acrescentarBotoes(d) {
    for (const card of $$('#qdCorpo .qd-card')) {
      const a = d.lista.find((x) => x.id === card.dataset.id); if (!a) continue;
      const acoes = $('.qd-acoes', card); if (!acoes) continue;
      if (!$('[data-qd-repetir]', acoes) && a.status !== 'cancelado') {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn mini'; b.dataset.qdRepetir = a.id; b.textContent = '↻ Repetir';
        b.title = 'Novo horário para este cliente e este carro';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); repetir(a); });
        acoes.appendChild(b);
      }
    }
  }
  function repetir(a) {
    if (typeof openAgendamentoModal !== 'function') return;
    const origens = typeof ORIGENS !== 'undefined' ? ORIGENS : [];
    openAgendamentoModal(null, paraRepetir(a, origens));
    if (typeof toast === 'function') toast('Novo horário para ' + (primeiroNome(a.cliente_nome) || 'o cliente') + ' — escolha o dia e a hora.', 'ok');
  }
  async function avisarProntos(d) {
    if (typeof patioDe !== 'function') return;
    const candidatos = d.lista.filter((a) => CHEGOU.has(a.status) && a.telefone);
    if (!candidatos.length) return;
    const mapa = await patioDe(candidatos.map((a) => a.id)).catch(() => ({}));
    if (Q().dados !== d || !$('#qdCorpo')) return;
    for (const a of candidatos) {
      const os = mapa[a.id]; if (!os || os.etapa !== 'pronto') continue;
      const card = $(`#qdCorpo .qd-card[data-id="${CSS.escape(a.id)}"]`); const acoes = card && $('.qd-acoes', card);
      if (!acoes || $('.qd-avisar', acoes)) continue;
      const wa = linkWhatsApp(a.telefone, mensagemPronto(a)); if (!wa) continue;
      acoes.insertAdjacentHTML('afterbegin', `<a class="btn mini primary qd-avisar" href="${esc(wa)}" target="_blank" rel="noopener" title="Abre o WhatsApp com o recado de carro pronto">💬 Avisar: pronto</a>`);
    }
  }

  function aposDesenhar(d) {
    if (semAcesso() || !d) return;
    const host = $('#qdCorpo');
    ligarDestaque(host);
    // o quadro foi redesenhado debaixo do mouse/foco: o destaque volta sozinho
    const sob = host && host.querySelector('.qd-card:hover, .qd-card:focus-within');
    if (sob && host._r6dMarcar) host._r6dMarcar(sob);
    acrescentarBotoes(d);
    avisarProntos(d).catch(() => { /* sem Pátio: cartão como sempre */ });
  }

  /* ---- lista do dia / recepção: "Avisar" ao lado do ícone do Pátio ---- */
  async function avisarNaLista(raiz) {
    if (typeof patioDe !== 'function' || !raiz) return;
    const cards = $$('.appt[data-id]', raiz).filter((c) => CHEGOU.has(c.dataset.status));
    if (!cards.length) return;
    const mapa = await patioDe([...new Set(cards.map((c) => c.dataset.id))]).catch(() => ({}));
    for (const c of cards) {
      const os = mapa[c.dataset.id]; if (!os || os.etapa !== 'pronto' || !c.isConnected || $('.avisar-pronto', c)) continue;
      const fim = $('.act-fim', c); if (!fim) continue;
      const tel = c.dataset.tel || '';
      const wa = linkWhatsApp(tel, mensagemPronto({ cliente_nome: c.dataset.nome, veiculo: c.dataset.veic, placa: c.dataset.placa }));
      if (!wa) continue;
      fim.insertAdjacentHTML('afterbegin', `<a class="act ico avisar-pronto" href="${esc(wa)}" target="_blank" rel="noopener" title="Avisar o cliente que o carro está pronto (WhatsApp)" aria-label="Avisar ${esc(c.dataset.nome || 'o cliente')} que o carro está pronto">💬</a>`);
    }
  }
  if (typeof root.decorarPatio === 'function' && !root.decorarPatio._r6d) {
    const original = root.decorarPatio;
    const embrulhado = async function (raiz) { const r = await original.apply(this, arguments); try { await avisarNaLista(raiz); } catch { /* segue */ } return r; };
    embrulhado._r6d = true;
    root.decorarPatio = embrulhado;
  }

  /* ---- 5) atalho do Quadro: / procura (o N e as setas já vêm do app; aqui só o que faltava) ---- */
  document.addEventListener('keydown', (ev) => {
    if (typeof state === 'undefined' || state.route !== 'quadro' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (typeof modalAberto === 'function' && modalAberto()) return;
    if (ev.key === '/') { const b = $('#qdBusca'); if (b) { ev.preventDefault(); b.focus(); b.select(); } }
  });

  root.R6d = { aposDesenhar, avisarNaLista, repetir, PURO };
})(typeof globalThis !== 'undefined' ? globalThis : window);
