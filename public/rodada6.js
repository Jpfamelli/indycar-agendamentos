/* ============================================================================
   Agenda — Rodada 6 (21/10/2026): a Agenda enxerga o Pátio e o Orçador.
     · cartão e ficha do horário mostram o orçamento ligado (número, situação, valor)
       e abrem o orçamento na aba "indycar-orcador";
     · ficha sem orçamento oferece "Criar orçamento" já com cliente e telefone;
     · Início ganha "No pátio agora" (etapa ao vivo de todos os carros) e
       "Orçamentos aprovados esperando horário" com o botão "Marcar horário";
     · TODO link para outro app abre na aba nomeada dele (nunca empilha abas).
   Usa o que o app.js já expõe (api, esc, $, $$, toast, state, emPresenca).
   ============================================================================ */
(function () {
  'use strict';
  const reais = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const ST_SEM_ORC = new Set(['cancelado', 'nao_veio']);
  const _orc = new Map();                 // agendamento_id -> { em, orc|null }
  let _faixas = { em: 0, patio: [], aprovados: [] };

  const semAcessoDeEquipe = () => (typeof emPresenca === 'function' && emPresenca()) || state?.perfil?.papel === 'agenda';

  /* ---------------- links para outros apps: sempre a aba nomeada ---------------- */
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !window.IndyCarApps) return;
    const k = IndyCarApps.appDoLink(a.href);
    if (!k || k === IndyCarApps.aqui) return;
    e.preventDefault();
    if (!IndyCarApps.abrir(a.href)) toast('O navegador bloqueou a nova aba. Libere pop-ups para esta página.', 'err');
  }, true);

  /* ---------------- orçamento de cada horário ---------------- */
  async function orcDe(ids, forcar = false) {
    const agora = Date.now();
    const faltam = ids.filter((id) => forcar || !_orc.has(id) || agora - _orc.get(id).em > 30_000);
    if (faltam.length) {
      const r = await api('GET', '/orcamentos/agendamentos?ids=' + encodeURIComponent(faltam.slice(0, 60).join(',')), null, { repetir: false }).catch(() => null);
      if (r && r.itens) for (const id of faltam) _orc.set(id, { em: agora, orc: r.itens[id] || null });
    }
    const saida = {};
    for (const id of ids) { const c = _orc.get(id); if (c?.orc) saida[id] = c.orc; }
    return saida;
  }
  function seloOrc(o) {
    const valor = o.total > 0 ? ' · ' + reais(o.total) : '';
    return `<a class="badge-pill ${esc(o.tom)} selo-orc" href="${esc(o.abrir)}" title="Orçamento ${esc(o.numero_rotulo)} no Orçador — toque para abrir"
      aria-label="Orçamento ${esc(o.numero_rotulo)}, ${esc(o.status_rotulo)}. Abrir no Orçador">🧾 ${esc(o.numero_rotulo)} · ${esc(o.status_rotulo)}${esc(valor)}${o.visto && o.status === 'enviado' ? ' · visto' : ''}</a>`;
  }
  async function decorarOrcamentos(root) {
    if (!root || semAcessoDeEquipe()) return;
    const cards = $$('.appt[data-id]', root).filter((c) => !ST_SEM_ORC.has(c.dataset.status));
    if (!cards.length) return;
    const mapa = await orcDe([...new Set(cards.map((c) => c.dataset.id))]);
    for (const card of cards) {
      const o = mapa[card.dataset.id];
      if (!o || !card.isConnected || $('.selo-orc', card)) continue;
      const alvo = $('.appt-badges', card);
      if (alvo) alvo.insertAdjacentHTML('afterbegin', seloOrc(o));
    }
  }
  /** "Criar orçamento" já com cliente e telefone (o Orçador converte ?cliente=&tel=&nome= em #/cotacao). */
  function linkNovoOrcamento(a) {
    const p = new URLSearchParams();
    if (/^[0-9a-f-]{36}$/i.test(String(a.cliente_id || ''))) p.set('cliente', a.cliente_id);
    let d = String(a.telefone || '').replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    if (d.length === 10 || d.length === 11) p.set('tel', '55' + d);
    const nome = String(a.cliente_nome || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (nome) p.set('nome', nome);
    const q = p.toString();
    return q ? IndyCarApps.url('orcador', '?' + q) : null;
  }
  async function blocoOrcamentoNaFicha(box, a) {
    if (!box || semAcessoDeEquipe()) return;
    const o = a.id ? (await orcDe([a.id], true))[a.id] : null;
    if (!box.isConnected) return;
    const criar = linkNovoOrcamento(a);
    if (!o && !criar) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="patio-ficha">
      <div class="patio-ficha-topo">${o ? seloOrc(o) : '<b>Orçamento</b>'}
        <small class="muted">${o ? esc(o.veiculo || '') + (o.placa ? ' · ' + esc(o.placa) : '') : 'nenhum orçamento ligado a este horário'}</small></div>
      <div class="eco-links">
        ${o ? `<a class="btn mini" href="${esc(o.abrir)}">🧾 Abrir orçamento ${esc(o.numero_rotulo)}</a>` : ''}
        ${criar ? `<a class="btn mini" href="${esc(criar)}">＋ ${o ? 'Outro orçamento' : 'Criar orçamento'} para ${esc(String(a.cliente_nome || 'o cliente').split(/\s+/)[0])}</a>` : ''}
      </div></div>`;
  }

  /* ---------------- Início: pátio ao vivo + aprovados esperando horário ---------------- */
  const duracao = (iso) => {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60);
    return h < 24 ? h + ' h' : Math.floor(h / 24) + ' d';
  };
  function htmlPatio(itens) {
    if (!itens.length) return '';
    const R = window.R7;                                  // rodada 7: prontos primeiro, tempo parado em cor, "Avisar: pronto"
    if (R) itens = R.PURO.ordenarPatio(itens);
    const pronto = itens.filter((x) => x.etapa === 'pronto').length;
    const extras = itens.reduce((s, x) => s + (x.extras_pendentes || 0), 0);
    return `<section class="r6-faixa" aria-label="No pátio agora">
      <header><h3>🔧 No pátio agora <em class="tab-num">${itens.length}</em></h3>
        <span class="muted">${pronto ? pronto + ' pronto' + (pronto > 1 ? 's' : '') + ' para retirar' : 'etapa ao vivo'}${extras ? ' · ' + extras + ' extra' + (extras > 1 ? 's' : '') + ' esperando o cliente' : ''}</span>
        <a href="${esc(IndyCarApps.url('patio'))}" class="r6-mais">Abrir o Pátio ↗</a></header>
      <ul>${itens.map((x) => {
        const parado = R ? R.PURO.minutosDesde(x.etapa_em) : null, tom = R ? R.PURO.tomDaEtapa(x.etapa, parado) : 'ok';
        return `<li class="r6-li${x.etapa === 'pronto' ? ' r7-pronto' : ''}"><a class="r6-linha" href="${esc(x.abrir)}">
          <span class="r6-a"><b>${x.numero ? '#' + esc(x.numero) : 'OS'}</b> ${esc(x.veiculo || x.cliente_nome || 'Carro')}${x.placa ? ' · ' + esc(x.placa) : ''}</span>
          <span class="r6-b"><span class="badge-pill ${esc(x.etapa_tom)}">${esc(x.etapa_rotulo)}</span> <small class="muted r7-parado r7-tom-${tom}" title="Há quanto tempo está nesta etapa">${esc(duracao(x.etapa_em))}</small>${x.extras_pendentes ? ` <span class="badge-pill bp-orange">${x.extras_pendentes} p/ aprovar</span>` : ''}</span>
          <span class="r6-c">${esc(x.cliente_nome || '')}</span></a>${R ? R.botaoAvisarPronto(x) : ''}</li>`; }).join('')}</ul></section>`;
  }
  function htmlAprovados(itens) {
    if (!itens.length) return '';
    return `<section class="r6-faixa" aria-label="Orçamentos aprovados esperando horário">
      <header><h3>🧾 Aprovados esperando horário <em class="tab-num">${itens.length}</em></h3>
        <span class="muted">o cliente já disse sim — falta marcar</span>
        <a href="${esc(IndyCarApps.url('orcador', '#/historico'))}" class="r6-mais">Abrir o Orçador ↗</a></header>
      <ul>${itens.map((x, i) => `<li class="r6-linha r6-linha-acao">
          <span class="r6-a"><b>${esc(x.numero_rotulo)}</b> ${esc(x.cliente_nome || 'Cliente')}${x.veiculo ? ' · ' + esc(x.veiculo) : ''}</span>
          <span class="r6-b">${x.total > 0 ? esc(reais(x.total)) : ''} <a class="btn mini" href="${esc(x.abrir)}">Abrir</a>
            <button type="button" class="btn mini primary" data-r6-marcar="${i}">Marcar horário</button></span></li>`).join('')}</ul></section>`;
  }
  function pintarFaixas(host) {
    host.innerHTML = htmlPatio(_faixas.patio) + htmlAprovados(_faixas.aprovados);
    host.hidden = !host.innerHTML.trim();
    $$('[data-r6-marcar]', host).forEach((b) => b.addEventListener('click', () => {
      const x = _faixas.aprovados[Number(b.dataset.r6Marcar)];
      if (!x) return;
      openAgendamentoModal(null, { cliente_nome: x.cliente_nome, telefone: x.telefone, cliente_id: x.cliente_id || undefined, veiculo: x.veiculo, placa: x.placa,
        observacoes: x.observacao, origem: 'Orçador', orcamento_id: x.id });
    }));
  }
  async function inicio() {
    if (semAcessoDeEquipe() || typeof view === 'undefined') return;
    const cols = $('.cols', view);
    if (!cols) return;
    const host = document.createElement('div');
    host.className = 'r6-faixas'; host.id = 'r6Faixas'; host.hidden = true;
    cols.parentNode.insertBefore(host, cols);
    if (_faixas.em) pintarFaixas(host);               // mostra o último que veio e atualiza por baixo
    if (Date.now() - _faixas.em < 20_000) return;
    const [p, o] = await Promise.all([
      api('GET', '/patio/agora?limite=10', null, { repetir: false }).catch(() => null),
      api('GET', '/orcamentos/aprovados?limite=6', null, { repetir: false }).catch(() => null),
    ]);
    if (!p && !o) return;
    _faixas = { em: Date.now(), patio: p?.itens || [], aprovados: o?.itens || [] };
    if (host.isConnected) pintarFaixas(host);
  }

  window.R6 = { decorarOrcamentos, blocoOrcamentoNaFicha, inicio, linkNovoOrcamento, seloOrc, orcDe };
})();
