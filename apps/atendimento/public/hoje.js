/* ============================================================
   IndyCar Atendimento · hoje.js (Rodada 13, 22/11/2026)
   A tela de entrada: o resumo do que importa HOJE para a recepção, no estilo do herói do Tráfego.
     · computador: ocupa o meio enquanto nenhuma conversa está aberta (#hojePainel, dentro de #chatVazio);
     · celular: um cartão curto em cima da lista (#hojeMini).
   Frase grande com os números do dia, números que filtram a lista, "Atender agora" (a fila já pontuada pelo
   r6-regras.js), as chegadas hora a hora e os atalhos do dia (nova conversa, fazer orçamento, carros sem conversa).
   Só LÊ: contagens no banco (as mesmas dos selos dos filtros) e o que a fila e o pátio já carregaram.
   Nada é enviado daqui. Regras puras em hoje-regras.js.
   ============================================================ */
(function () {
  'use strict';
  const H = { c: { novos: 0, esperando: 0, naoLidas: 0 }, chegadas: [], contouEm: 0, okEm: 0, falhou: false, html: { painel: '', mini: '' } };
  const E = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const banco = () => (typeof sb !== 'undefined' ? sb : null);
  const quem = () => (typeof perfil !== 'undefined' ? perfil : null);
  const R = () => window.Hoje;

  function inicioDeHoje() {
    const dia = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    return new Date(dia + 'T00:00:00-03:00').toISOString();
  }

  /* ---- números do banco (os mesmos dos selos dos filtros) ---- */
  async function contar() {
    const s = banco();
    if (!s || !quem()) return;
    H.contouEm = Date.now();
    const inicio = inicioDeHoje();
    const head = { count: 'exact', head: true };
    const [novos, esperando, naoLidas, chegadas] = await Promise.all([
      s.from('conversas').select('id', head).eq('tipo', 'atendimento').gte('created_at', inicio),
      s.from('conversas').select('id', head).eq('aguardando_consultor', true),
      s.from('conversas').select('id', head).eq('tipo', 'atendimento').is('desfecho', null).gt('nao_lidas', 0),
      s.from('conversas').select('created_at').eq('tipo', 'atendimento').gte('created_at', inicio).limit(500),
    ].map((q) => Promise.resolve(q).catch((e) => ({ error: e || true }))));
    /* rodada 13B: com a rede caindo, os números ficam os da última leitura boa e a tela diz de quando são;
       nunca vira "tudo em dia" só porque o banco não respondeu */
    const respostas = [novos, esperando, naoLidas, chegadas];
    H.falhou = respostas.some((r) => !r || r.error || (r.count === undefined && !Array.isArray(r.data)));
    if (!novos?.error && typeof novos?.count === 'number') H.c.novos = novos.count;
    if (!esperando?.error && typeof esperando?.count === 'number') H.c.esperando = esperando.count;
    if (!naoLidas?.error && typeof naoLidas?.count === 'number') H.c.naoLidas = naoLidas.count;
    if (!chegadas?.error && Array.isArray(chegadas?.data)) H.chegadas = chegadas.data.map((x) => x.created_at);
    if (!H.falhou) H.okEm = Date.now();
    pintar();
  }

  /* ---- o que a fila (r6-tela.js) e o pátio (r6c5.js) já sabem ---- */
  function daFila() {
    const S = window.R6Tela?.estado;
    const ctx = S?.ctx || {};
    const naMesa = Object.values(ctx).filter((x) => x?.orc && ['enviado', 'parado', 'visualizado', 'recente', 'aprovado_sem_horario'].includes(x.orc.cod)).length;
    const marcadas = Array.isArray(S?.ultima) ? S.ultima : [];
    const urgentes = marcadas.filter((m) => !m.p?.fora && (m.p?.nivel === 'agora' || m.p?.nivel === 'logo')).length;
    const p = quem();
    const gestor = p?.papel === 'admin' || p?.papel === 'gestor';
    const fila = R().atenderAgora(marcadas, { meuId: p?.id || null, gestor, limite: 4 });
    const carros = window.R6C5?.estado?.carros?.carros || [];
    return { naMesa, urgentes, fila, carros: carros.length, prontos: carros.filter((c) => c.etapa === 'pronto').length };
  }

  const telefone = (t) => (typeof telefoneBonito === 'function' && t ? telefoneBonito(t) : t);
  const fraseHtml = (pedacos) => pedacos.map((p) => (p.n !== undefined ? `<em>${E(p.n)}</em>` : E(p.t))).join('');
  function dataDeHoje() {
    try {
      return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    } catch { return ''; }
  }
  const num = (valor, rotulo, filtro, dica) => `<button type="button" class="hoje-num${valor ? '' : ' zero'}" data-hoje-filtro="${E(filtro)}" title="${E(dica)}">
      <b>${E(valor)}</b><span>${E(rotulo)}</span></button>`;

  function grafico(ch) {
    const max = Math.max(1, ...ch.horas.map((h) => h.total));
    const agoraH = R().horaSP(Date.now())?.hora;
    const barras = ch.horas.map((h) => {
      const alt = h.total ? Math.max(8, Math.round((h.total / max) * 100)) : 3;
      return `<li class="hoje-barra${h.hora === agoraH ? ' agora' : ''}${h.total ? '' : ' vazia'}" title="${h.hora}h: ${h.total} conversa${h.total === 1 ? '' : 's'}">
        <i style="height:${alt}%"></i><small>${h.hora % 3 === 0 ? h.hora + 'h' : ''}</small></li>`;
    }).join('');
    return `<ol class="hoje-barras" aria-label="Conversas que chegaram hoje, hora a hora">${barras}</ol>`;
  }

  function filaHtml(fila) {
    if (!fila.length) return '<p class="hoje-vazio">Ninguém esperando por você agora. Quando um cliente escrever, ele aparece aqui.</p>';
    return `<ul class="hoje-lista">${fila.map((x) => `<li><button type="button" class="hoje-item" data-hoje-abrir="${E(x.id)}">
        <span class="avatar" aria-hidden="true">${E((x.nome || '#').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '#')}</span>
        <span class="hoje-item-txt"><b>${E(x.nome || telefone(x.telefone) || 'Cliente')}</b><small>${E(x.motivo || 'esperando resposta')}</small></span>
        <span class="hoje-selo tom-${E(x.selo.tom)}">${E(x.selo.rotulo)}</span></button></li>`).join('')}</ul>`;
  }

  function avisoConexao() {
    if (!H.falhou) return '';
    const hora = H.okEm ? new Date(H.okEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<p class="hoje-aviso" role="status">⚠ Sem resposta do banco agora${hora ? `: números das ${E(hora)}` : ''}. Tento de novo em 1 minuto.</p>`;
  }
  const carregando = (classe) => `<p class="hoje-frase hoje-carregando ${classe}" role="status">Contando o dia…</p>`;
  function montarPainel(c, f, ch) {
    if (!H.okEm && !H.falhou) return `<p class="hoje-sobre">Hoje · ${E(dataDeHoje())}</p>${carregando('')}`;
    if (!H.okEm) return `<p class="hoje-sobre">Hoje · ${E(dataDeHoje())}</p><p class="hoje-frase">Hoje: não consegui contar as conversas.</p>${avisoConexao()}
      <div class="hoje-acoes"><button type="button" class="btn btn-ghost hoje-acao" data-hoje="recontar">Tentar de novo</button></div>`;
    const frase = R().fraseDeHoje({ ...c, naMesa: f.naMesa });
    const carros = f.carros ? `<button type="button" class="hoje-carros" data-hoje="carros">
        <b>${E(f.carros)}</b> ${f.carros === 1 ? 'carro na oficina sem conversa' : 'carros na oficina sem conversa'}${f.prontos ? ` · <span class="hoje-pronto">${E(f.prontos)} pronto${f.prontos > 1 ? 's' : ''} para avisar</span>` : ''}</button>` : '';
    return `<p class="hoje-sobre">Hoje · ${E(dataDeHoje())}</p>
      <h1 class="hoje-frase" aria-live="polite">${fraseHtml(frase)}</h1>${avisoConexao()}
      <div class="hoje-nums" role="group" aria-label="Filtrar a lista">
        ${num(c.esperando, 'esperando consultor', 'aguardando', 'Mostrar quem a IA passou e espera um consultor')}
        ${num(c.naoLidas, c.naoLidas === 1 ? 'conversa sem ler' : 'conversas sem ler', 'nao_lidas', 'Mostrar só as conversas com mensagem sem ler')}
        ${num(f.urgentes, f.urgentes === 1 ? 'urgente' : 'urgentes', 'r6_urgentes', 'Mostrar as conversas que a fila marcou para agora')}
        ${num(f.naMesa, f.naMesa === 1 ? 'orçamento na mesa' : 'orçamentos na mesa', 'r6_orcamento', 'Orçamento enviado esperando resposta ou aprovado sem horário')}
      </div>
      <div class="hoje-grade">
        <section class="hoje-cartao" aria-labelledby="hojeFilaTit">
          <div class="hoje-cartao-topo"><h2 id="hojeFilaTit">Atender agora</h2>
            <button type="button" class="hoje-btn" data-hoje="proxima" ${f.fila.length ? '' : 'disabled'}>Abrir a próxima</button></div>
          ${filaHtml(f.fila)}
        </section>
        <section class="hoje-cartao" aria-labelledby="hojeChegTit">
          <div class="hoje-cartao-topo"><h2 id="hojeChegTit">Chegadas de hoje</h2>
            <span class="hoje-total"><b>${E(ch.total)}</b> ${ch.total === 1 ? 'conversa' : 'conversas'}</span></div>
          ${grafico(ch)}
          <p class="hoje-nota">${ch.pico ? `Mais movimento às ${E(ch.pico.hora)}h.` : 'Nenhuma conversa nova ainda hoje.'}</p>
        </section>
      </div>
      <div class="hoje-acoes">
        ${carros}
        <button type="button" class="btn btn-ghost hoje-acao" data-hoje="nova">+ Nova conversa</button>
        <button type="button" class="btn btn-primary hoje-acao" data-hoje="orcamento">🧾 Fazer orçamento</button>
      </div>`;
  }

  function montarMini(c, f) {
    if (!H.okEm && !H.falhou) return carregando('');
    if (!H.okEm) return `<p class="hoje-frase">Hoje: não consegui contar as conversas.</p>${avisoConexao()}<button type="button" class="hoje-carros" data-hoje="recontar">Tentar de novo</button>`;
    const frase = R().fraseDeHoje({ ...c, naMesa: f.naMesa });
    const carros = f.carros ? `<button type="button" class="hoje-carros" data-hoje="carros"><b>${E(f.carros)}</b> ${f.carros === 1 ? 'carro' : 'carros'} sem conversa${f.prontos ? ` · <span class="hoje-pronto">${E(f.prontos)} pronto${f.prontos > 1 ? 's' : ''}</span>` : ''}</button>` : '';
    return `<p class="hoje-frase">${fraseHtml(frase)}</p>${avisoConexao()}
      <div class="hoje-nums" role="group" aria-label="Filtrar a lista">
        ${num(c.esperando, 'esperando', 'aguardando', 'Quem a IA passou e espera um consultor')}
        ${num(c.naoLidas, 'sem ler', 'nao_lidas', 'Conversas com mensagem sem ler')}
        ${num(f.naMesa, 'na mesa', 'r6_orcamento', 'Orçamentos esperando resposta')}
      </div>${carros}`;
  }

  function pintar() {
    if (!R() || !quem()) return;
    const f = daFila();
    const painel = document.getElementById('hojePainel');
    const mini = document.getElementById('hojeMini');
    if (painel) {
      const h = montarPainel(H.c, f, R().chegadasPorHora(H.chegadas));
      if (h !== H.html.painel) { painel.innerHTML = h; H.html.painel = h; }
      painel.hidden = false;
    }
    if (mini) {
      const h = montarMini(H.c, f);
      if (h !== H.html.mini) { mini.innerHTML = h; H.html.mini = h; }
      mini.hidden = false;
    }
    marcarFiltro();
  }
  /* o número do filtro que está ligado fica marcado (e um toque nele volta para "Todas") */
  function marcarFiltro() {
    const atual = typeof filtroStatus !== 'undefined' ? filtroStatus : '';
    document.querySelectorAll('[data-hoje-filtro]').forEach((b) => {
      const liga = b.dataset.hojeFiltro === atual;
      b.classList.toggle('ligado', liga);
      b.setAttribute('aria-pressed', String(liga));
    });
  }
  function filtrar(cod) {
    const atual = typeof filtroStatus !== 'undefined' ? filtroStatus : '';
    const alvo = document.querySelector(`#aba-conversas .filtros-status [data-status="${cod === atual ? '' : cod}"]`);
    if (alvo) alvo.click();
    setTimeout(marcarFiltro, 0);
  }

  document.addEventListener('click', (ev) => {
    const f = ev.target.closest('[data-hoje-filtro]');
    if (f) { ev.preventDefault(); return filtrar(f.dataset.hojeFiltro); }
    const ab = ev.target.closest('[data-hoje-abrir]');
    if (ab && typeof abrirConversa === 'function') { ev.preventDefault(); return abrirConversa(ab.dataset.hojeAbrir, { focarCampo: true }); }
    const b = ev.target.closest('[data-hoje]');
    if (!b) {
      // trocou o filtro pelos chips de cima: os números acompanham
      if (ev.target.closest('#aba-conversas .filtros-status [data-status]')) setTimeout(marcarFiltro, 0);
      return;
    }
    ev.preventDefault();
    const acao = b.dataset.hoje;
    if (acao === 'recontar') return contar();
    if (acao === 'proxima') return window.R6Tela?.irParaProxima();
    if (acao === 'carros') return window.R6C5?.abrirCarros();
    if (acao === 'nova' && typeof abrirModalNova === 'function') return abrirModalNova();
    if (acao === 'orcamento') return window.AbaOrcador?.abrir('');
  });

  /* ---- arranque: espera o login, conta agora e a cada minuto; repinta quando a fila muda ---- */
  let agendado = 0;
  const pintarLogo = () => { if (!agendado) agendado = requestAnimationFrame(() => { agendado = 0; pintar(); }); };
  function iniciar() {
    contar();
    // a fila (r6Resumo) e a lista se refazem sozinhas: o resumo acompanha na hora, sem esperar o relógio
    for (const id of ['r6Resumo', 'listaConversas', 'c5Barra']) {
      const el = document.getElementById(id);
      if (el) new MutationObserver(pintarLogo).observe(el, { childList: true, subtree: id !== 'listaConversas', characterData: id === 'r6Resumo' });
    }
    setInterval(() => { if (!document.hidden) contar(); }, 60_000);
    setInterval(() => { if (!document.hidden) pintar(); }, 4_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - H.contouEm > 15_000) contar(); });
  }
  const esperar = setInterval(() => { if (quem() && banco() && window.Hoje) { clearInterval(esperar); iniciar(); } }, 500);
  setTimeout(() => clearInterval(esperar), 120_000);
  window.HojeTela = { contar, pintar, estado: H };
})();
