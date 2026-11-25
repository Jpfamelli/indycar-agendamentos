/* ============================================================
   Rodada 18 (25/11/2026) — a casa em ordem
   1) WhatsApp parado: /api/r18/zap diz se está parado, desde quando e o que fazer. Vira a faixa do topo
      (#faixaSaude, desenhada por mostrarSaude no app.js) e só ela: a tarja de conexão e o aviso do chat
      saem enquanto a faixa diz o mesmo. O botão Enviar vira "Salvar" quando nada sai.
   2) Fila "Aguardando consultor": mais antigo primeiro, e "Encerrar paradas há mais de N dias" em lote,
      com a contagem antes, confirmação, registro de quem fez e desfazer por 24 h.
   Usa do app.js: perfil, filtroStatus, authCabecalhos, toast, esc, mostrarSaude, SAUDE_ATUAL, carregarConversas.
   ============================================================ */
(function () {
  'use strict';
  const R = window.R18Regras;
  const $ = (s) => document.querySelector(s);
  const LOTE_KEY = 'indycar_r18_lote';
  const st = { zap: null, dias: 30, contagem: null, ocupado: false, filtroAntes: null, pedindo: 0 };

  const lerLote = () => {
    try {
      const v = JSON.parse(sessionStorage.getItem(LOTE_KEY) || 'null');
      return v && Date.now() - Date.parse(v.quando) < 24 * 3600_000 ? v : null;
    } catch { return null; }
  };
  const gravarLote = (v) => { try { v ? sessionStorage.setItem(LOTE_KEY, JSON.stringify(v)) : sessionStorage.removeItem(LOTE_KEY); } catch { /* sem armazenamento: o desfazer some ao recarregar */ } };

  async function api(caminho, { metodo = 'GET', corpo } = {}) {
    try {
      const r = await fetch(caminho, { method: metodo, headers: await authCabecalhos(), body: corpo ? JSON.stringify(corpo) : undefined });
      if (r.headers.get('x-indycar-sintetica')) return { ok: false, acordando: true, erro: 'O sistema está acordando. Tente de novo em instantes.' };
      const j = await r.json().catch(() => ({}));
      return { ...j, ok: r.ok && j.ok !== false, status: r.status };
    } catch (e) { return { ok: false, erro: e.message || 'sem conexão' }; }
  }

  /* ---------------- 1) WhatsApp parado ---------------- */
  async function verZap() {
    if (typeof perfil === 'undefined' || !perfil) return;
    const r = await api('/api/r18/zap');
    if (!r.ok || r.acordando) return;           // sem resposta: não inventa nem apaga o que está na tela
    const antes = st.zap;
    st.zap = r.parado ? r : { parado: false };
    if (antes?.parado && !r.parado) toast('✅ O WhatsApp voltou. O que não saiu está em “⚠ Não saiu”: revise e reenvie.', 'ok');
    if (typeof mostrarSaude === 'function') mostrarSaude(typeof SAUDE_ATUAL !== 'undefined' && SAUDE_ATUAL ? SAUDE_ATUAL : {});
    pintarEnviar();
  }

  /** Nada sai (chave recusada, celular, cota): o botão não finge que manda. */
  function pintarEnviar() {
    const btn = $('#btnEnviar');
    if (!btn) return;
    const retido = st.zap?.parado && st.zap.envio === 'retido';
    const r6Parado = !!window.R6Tela?.estado?.zap?.parado;
    if (retido) {
      btn.textContent = 'Salvar';
      btn.title = 'WhatsApp parado: a mensagem fica salva aqui e NÃO chega ao cliente';
      btn.classList.add('r6-parado');
    } else if (!r6Parado && btn.textContent === 'Salvar') {
      btn.textContent = 'Enviar'; btn.title = 'Enviar (Enter ou Ctrl+Enter)'; btn.classList.remove('r6-parado');
    }
  }

  /** Depois de um envio que o CodeWords aceitou, com o WhatsApp em silêncio: avisa que não há garantia. */
  function depoisDeEnviar(ok) {
    if (ok && st.zap?.parado && st.zap.motivo === 'silencio') {
      toast('⚠️ Saiu para o CodeWords, mas nenhuma mensagem de cliente chega há horas: confira no celular da oficina se chegou.');
    }
  }

  /* ---------------- 2) Encerrar conversas paradas ---------------- */
  function caixa() {
    let el = $('#r18Lote');
    if (el && !el.dataset.montado) {
      el.dataset.montado = '1';
      el.innerHTML = `<p class="r18-lote-txt" id="r18LoteTexto" aria-live="polite">Contando…</p>
        <div class="r18-lote-acoes">
          <label class="r18-lote-dias">Paradas há mais de
            <select id="r18Dias" class="mini-select" aria-label="Paradas há mais de quantos dias">
              ${R.DIAS.map(d => `<option value="${d}"${d === st.dias ? ' selected' : ''}>${d}</option>`).join('')}
            </select> dias</label>
          <button type="button" class="btn sm r18-encerrar" id="r18Encerrar" disabled>Encerrar</button>
        </div>
        <div class="r18-feito" id="r18Feito" hidden></div>`;
      el.querySelector('#r18Dias').addEventListener('change', (e) => { st.dias = Number(e.target.value) || 30; contar(); });
      el.querySelector('#r18Encerrar').addEventListener('click', encerrar);
      el.addEventListener('click', (e) => { if (e.target.closest('[data-r18="desfazer"]')) desfazer(); });
    }
    return el;
  }

  function pintarFeito() {
    const f = $('#r18Feito');
    if (!f) return;
    const l = lerLote();
    f.hidden = !l;
    f.innerHTML = l ? `<span>${esc(R.textoFeito(l.encerradas, l.quando))}</span> <button type="button" class="btn btn-ghost sm" data-r18="desfazer">↶ Desfazer</button>` : '';
  }

  async function contar() {
    const el = caixa(); if (!el) return;
    const minha = ++st.pedindo;
    const btn = $('#r18Encerrar');
    btn.disabled = true;
    $('#r18LoteTexto').textContent = 'Contando…';
    const r = await api(`/api/r18/paradas?dias=${st.dias}`);
    if (minha !== st.pedindo) return;
    if (!r.ok) { $('#r18LoteTexto').textContent = '⚠️ ' + (r.erro || 'Não consegui contar agora.'); return; }
    st.contagem = r;
    $('#r18LoteTexto').textContent = R.textoContagem(r);
    btn.disabled = !r.total || st.ocupado;
    btn.textContent = r.total ? `Encerrar ${r.total}` : 'Encerrar';
    pintarFeito();
  }

  async function encerrar() {
    const c = st.contagem;
    if (!c?.total || st.ocupado) return;
    const sim = await Acesso.confirmar({ titulo: `Encerrar ${c.total} conversa${c.total === 1 ? '' : 's'} parada${c.total === 1 ? '' : 's'}?`,
      texto: R.textoConfirmar(c.total, c.dias), botao: `Encerrar ${c.total}`, perigo: false });
    if (!sim) return;
    st.ocupado = true;
    const btn = $('#r18Encerrar'); btn.disabled = true; btn.textContent = 'Encerrando…';
    const r = await api('/api/r18/paradas/encerrar', { metodo: 'POST', corpo: { dias: c.dias, esperado: c.total } });
    st.ocupado = false;
    if (!r.ok) {
      toast('⚠️ ' + (r.erro || 'Não consegui encerrar. Nada foi mudado.'));
      return contar();
    }
    if (r.encerradas && r.lote) gravarLote({ lote: r.lote, encerradas: r.encerradas, quando: r.quando || new Date().toISOString() });
    toast(r.encerradas ? R.textoFeito(r.encerradas, r.quando) + ' Dá para desfazer logo abaixo.' : 'Nenhuma conversa para encerrar agora.', 'ok');
    await carregarConversas();
    contar();
  }

  async function desfazer() {
    const l = lerLote();
    if (!l || st.ocupado) return;
    st.ocupado = true;
    const b = document.querySelector('[data-r18="desfazer"]'); if (b) { b.disabled = true; b.textContent = 'Desfazendo…'; }
    const r = await api('/api/r18/paradas/desfazer', { metodo: 'POST', corpo: { lote: l.lote } });
    st.ocupado = false;
    if (!r.ok) { toast('⚠️ ' + (r.erro || 'Não consegui desfazer.')); if (r.status === 409 || r.status === 404) gravarLote(null); pintarFeito(); return; }
    gravarLote(null);
    toast(`↶ ${r.voltaram} conversa${r.voltaram === 1 ? '' : 's'} voltaram para a fila do consultor${r.ficaram ? ` (${r.ficaram} já tinham mudado e ficaram como estão)` : ''}.`, 'ok');
    await carregarConversas();
    contar();
  }

  /** Chamado a cada desenho da lista: mostra a barra só na fila do consultor, e conta ao entrar nela. */
  function aoRenderLista() {
    const el = $('#r18Lote');
    if (!el) return;
    const naFila = typeof filtroStatus !== 'undefined' && filtroStatus === 'aguardando' && R.podeEncerrar(perfil?.papel);
    el.hidden = !naFila;
    if (naFila && st.filtroAntes !== 'aguardando') contar();
    st.filtroAntes = naFila ? 'aguardando' : (typeof filtroStatus !== 'undefined' ? filtroStatus : null);
  }

  window.R18 = { get zap() { return st.zap; }, verZap, aoRenderLista, depoisDeEnviar, pintarEnviar, contar };

  /* liga depois do login (perfil chega do app.js) e confere a cada 2 min com a aba à vista */
  let tentativas = 0;
  const arrancar = setInterval(() => {
    if (typeof perfil !== 'undefined' && perfil) { clearInterval(arrancar); verZap(); }
    else if (++tentativas > 120) clearInterval(arrancar);
  }, 1000);
  setInterval(() => { if (document.visibilityState === 'visible') verZap(); }, 120_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verZap(); });
})();
