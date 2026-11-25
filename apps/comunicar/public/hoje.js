/* ===================== IndyCar Comunicar — Rodada 13 (22/11/2026) =====================
   O resumo de HOJE no alto das Réguas, no molde do herói do Tráfego:
   uma frase grande com os números do dia, três números fortes, os próximos 14 dias
   num gráfico simples e o "hoje por régua".
   Se o WhatsApp da oficina estiver parado (chave recusada, sem aparelho) ou o envio
   em pausa, a frase diz isso de um jeito simples: o aviso completo, com o que fazer,
   mora na Central e não se repete aqui.
   `montarHoje` é PURO (testado em scripts/testes-r13-hoje.mjs); `pintarHoje` desenha.
   Regra da casa: esc() em TODO dado que vira HTML.
   ======================================================================================= */
(function () {
  'use strict';
  const NOME_CURTO = {
    lembrete: 'Lembrete', posvenda: 'Pós-venda', avaliacao: 'Avaliação', retorno: 'Revisão', aniversario: 'Aniversário',
    orcamento: 'Orçamento parado', nao_fechou: 'Não fechou', reativacao: 'Reativação',
  };
  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const fmt = (x) => n(x).toLocaleString('pt-BR');
  const escH = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  /** Do status do WhatsApp (e da pausa geral) para o estado do dia: ok · atencao · parado · pausa · desconhecido. */
  function estadoEnvio(status, cfg) {
    if (cfg && cfg.pausa_geral) return 'pausa';
    if (!status) return 'desconhecido';
    if (status.chaveRecusada || status.classe === 'chave_recusada' || status.classe === 'sem_chave') return 'parado';
    if (status.ok && status.conectado === false) return 'parado';
    if (status.ok === false) return 'atencao';
    return 'ok';
  }

  /**
   * Monta o resumo do dia. PURO.
   *   resumo   = /api/resumo   (pendentes, semana { enviadas, respondidas })
   *   status   = /api/whatsapp/status (ou null se não respondeu a tempo)
   *   projecao = /api/projecao (dias[] com total e porRegua; vale para as réguas LIGADAS)
   *   cfg      = configuração salva (ativo_<régua>, pausa_geral)
   */
  function montarHoje({ resumo = {}, status = null, projecao = null, cfg = {}, hoje = null } = {}) {
    const reguas = Object.keys(NOME_CURTO);
    const ligada = (t) => !!cfg[`ativo_${t}`];
    const dias = Array.isArray(projecao?.dias) ? projecao.dias : [];
    const contaLigadas = (d) => Object.entries(d?.porRegua || {}).reduce((s, [t, q]) => s + (ligada(t) ? n(q) : 0), 0);
    const diaHoje = dias.find((d) => d.data === hoje) || dias[0] || null;
    const saemHoje = diaHoje ? contaLigadas(diaHoje) : 0;
    const porRegua = reguas.filter((t) => ligada(t) && n(diaHoje?.porRegua?.[t]) > 0)
      .map((t) => ({ tipo: t, rotulo: NOME_CURTO[t], total: n(diaHoje.porRegua[t]) }))
      .sort((a, b) => b.total - a.total);
    const proximos = dias.slice(0, 14).map((d) => ({ data: d.data, total: contaLigadas(d), hoje: d === diaHoje }));
    const pico = proximos.reduce((m, d) => (d.total > m.total ? d : m), { total: 0, data: null });
    const fila = n(resumo.pendentes);
    const enviadas7 = n(resumo.semana?.enviadas), respondidas7 = n(resumo.semana?.respondidas);
    return {
      estado: estadoEnvio(status, cfg),
      saemHoje, fila, enviadas7, respondidas7,
      taxa7: enviadas7 ? Math.round((respondidas7 / enviadas7) * 100) : null,
      ligadas: reguas.filter(ligada).length, totalReguas: reguas.length,
      porRegua, proximos, pico: pico.total ? pico : null,
      temProjecao: dias.length > 0,
      domingo: !!hoje && new Date(hoje + 'T12:00:00').getDay() === 0 && !cfg.envia_domingo,
    };
  }

  /** A frase grande (HTML, com os números em destaque). */
  function frase(h) {
    const N = (x, fim = false) => `<span class="heroi-n${fim ? ' heroi-n-fim' : ''}">${fmt(x)}</span>`;
    const msgs = (x) => (x === 1 ? 'mensagem' : 'mensagens');
    if (h.estado === 'parado' || h.estado === 'pausa') {
      const motivo = h.estado === 'pausa' ? 'o envio está em pausa' : 'o WhatsApp da oficina está parado';
      const esperam = h.saemHoje + h.fila;
      return `Hoje nenhuma mensagem automática sai: ${motivo}.` +
        (esperam ? ` ${N(esperam, true)} ${msgs(esperam)} ${esperam === 1 ? 'espera' : 'esperam'} ele voltar.` : '');
    }
    const resp = h.respondidas7
      ? ` ${N(h.respondidas7, true)} ${h.respondidas7 === 1 ? 'cliente respondeu' : 'clientes responderam'} nesta semana.`
      : '';
    if (!h.saemHoje && h.domingo) return `Hoje é domingo: as réguas descansam e voltam amanhã.${resp}`;
    if (!h.saemHoje) return `Hoje nenhuma régua tem mensagem para sair.${resp}`;
    return `Hoje saem ${N(h.saemHoje)} ${msgs(h.saemHoje)} automáticas para os clientes.${resp}`;
  }

  const SELO = {
    ok: ['bom', 'WhatsApp no ar'],
    atencao: ['atencao', 'WhatsApp instável: pode atrasar'],
    parado: ['ruim', 'WhatsApp parado'],
    pausa: ['ruim', 'Envio em pausa'],
  };

  function grafico(h) {
    if (!h.proximos.length) return '';
    const max = Math.max(1, ...h.proximos.map((d) => d.total));
    const L = 300, A = 150, gap = 4, w = (L - gap * (h.proximos.length - 1)) / h.proximos.length;
    const barras = h.proximos.map((d, i) => {
      const alt = d.total ? Math.max(4, Math.round((d.total / max) * (A - 22))) : 2;
      const x = i * (w + gap), y = A - 18 - alt;
      const dt = new Date(d.data + 'T12:00:00');
      const rot = i === 0 || (i >= 3 && dt.getDay() === 1) ? `<text x="${i === 0 ? x : x + w / 2}" y="${A - 4}" text-anchor="${i === 0 ? 'start' : 'middle'}">${i === 0 ? 'hoje' : String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0')}</text>` : '';
      return `<rect class="${d.hoje ? 'b-hoje' : d.total ? 'b-dia' : 'b-zero'}" x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${alt}" rx="2"><title>${escH(`${SEMANA[dt.getDay()]} ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}: ${d.total}`)}</title></rect>${rot}`;
    }).join('');
    const pico = h.pico ? (() => { const dt = new Date(h.pico.data + 'T12:00:00'); return `Dia mais cheio: ${SEMANA[dt.getDay()]} ${h.pico.data.slice(8, 10)}/${h.pico.data.slice(5, 7)}, ${fmt(h.pico.total)} ${h.pico.total === 1 ? 'mensagem' : 'mensagens'}.`; })() : 'Nenhuma mensagem nos próximos 14 dias.';
    return `<figure class="hoje-graf">
        <figcaption class="mini">Próximos 14 dias</figcaption>
        <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Mensagens das réguas ligadas nos próximos 14 dias. ${escH(pico)}">${barras}</svg>
        <p class="hoje-graf-pe">${escH(pico)}</p>
      </figure>`;
  }

  function html(h, { hojeIso }) {
    const dt = new Date(hojeIso + 'T12:00:00');
    const dia = `${SEMANA[dt.getDay()]} ${hojeIso.slice(8, 10)}/${hojeIso.slice(5, 7)}`;
    const selo = SELO[h.estado];
    const parado = h.estado === 'parado' || h.estado === 'pausa';
    const num = (valor, rotulo, apoio = '') => `<div class="hoje-num"><span class="hoje-n">${valor}</span><span class="hoje-rot">${rotulo}</span>${apoio ? `<span class="hoje-apoio">${apoio}</span>` : ''}</div>`;
    const resp = h.taxa7 === null ? '—' : `${fmt(h.respondidas7)}`;
    const apoioResp = h.enviadas7 ? `de ${fmt(h.enviadas7)} enviadas (${h.taxa7}%)` : 'nada saiu nesta semana';
    const porRegua = h.porRegua.length
      ? `<ul class="hoje-reguas">${h.porRegua.map((r) => `<li><span>${escH(r.rotulo)}</span><b>${fmt(r.total)}</b></li>`).join('')}</ul>`
      : '<p class="hoje-sem">Nenhuma régua ligada tem cliente para hoje.</p>';
    const rodape = h.estado === 'pausa'
      ? '<button type="button" class="btn btn-mini" data-hoje-ir="ajustes">Abrir Ajustes</button>'
      : h.estado === 'parado' ? '<a class="btn btn-mini" href="/">Ver o aviso na Central</a>' : '';
    return `<div class="heroi-in">
        <p class="mini hoje-topo"><span>Hoje · ${escH(dia)}</span>${selo ? `<span class="selo selo-${selo[0]}">${escH(selo[1])}</span>` : ''}</p>
        <p class="heroi-frase">${frase(h)}</p>
        <div class="hoje-nums">
          ${num(fmt(h.saemHoje), parado ? 'Seriam hoje' : 'Saem hoje', 'das réguas ligadas')}
          ${num(fmt(h.fila), 'Na fila', parado ? 'esperando o WhatsApp' : 'prontas para sair')}
          ${num(resp, 'Responderam', apoioResp)}
        </div>
        <div class="hoje-conta">
          <div><p class="mini">Hoje por régua</p>${porRegua}</div>
          <div><p class="mini">Réguas ligadas</p><p class="hoje-ligadas"><b>${fmt(h.ligadas)}</b> de ${fmt(h.totalReguas)}</p>${rodape}</div>
        </div>
      </div>
      ${grafico(h)}`;
  }

  /** Busca os dados e desenha o herói dentro de `alvo`. Não trava a tela: o status do WhatsApp tem 4 s. */
  async function pintarHoje(alvo, { cfg, vez } = {}) {
    if (!alvo) return;
    const hojeIso = typeof hojeSP === 'function' ? hojeSP() : new Date().toISOString().slice(0, 10);
    const tempo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
    const projecao = window.R4?.projecao ? window.R4.projecao() : api('GET', '/projecao');
    const [resumo, status, proj] = await Promise.all([
      api('GET', '/resumo').catch(() => null),
      tempo(api('GET', '/whatsapp/status').catch(() => null), 4000),
      projecao.catch(() => null),
    ]);
    if (!alvo.isConnected || (vez !== undefined && vez !== state._vez)) return;
    if (!resumo && !proj) {
      alvo.innerHTML = '<div class="heroi-in"><p class="mini">Hoje</p><p class="hoje-sem">Não deu para montar o resumo de hoje agora. As réguas abaixo seguem normais.</p></div>';
      alvo.removeAttribute('aria-busy');
      return;
    }
    const h = montarHoje({ resumo: resumo || {}, status, projecao: proj, cfg: cfg || state.cfg || {}, hoje: hojeIso });
    state.envioParado = h.estado === 'parado' || h.estado === 'pausa' ? h.estado : null;
    /* R18: cada régua ligada diz que está retida e quantas esperam (o status é o mesmo do herói) */
    if (h.estado !== 'desconhecido') window.R18?.definir(h.estado);
    window.R18?.pintarReguas(alvo.parentNode, h.estado, resumo?.filaPorTipo);
    alvo.innerHTML = html(h, { hojeIso });
    alvo.dataset.estado = h.estado;
    alvo.removeAttribute('aria-busy');
    alvo.querySelector('[data-hoje-ir]')?.addEventListener('click', (e) => route(e.currentTarget.dataset.hojeIr));
    revisarDepois(alvo, h.estado, cfg);
  }

  /* R14: com o WhatsApp parado (ou o envio em pausa), a tela olha de novo a cada minuto. Quando a chave nova entrar,
     o resumo vira "no ar" sozinho, sem ninguém apertar nada. Para sozinha quando sai da tela ou volta ao normal. */
  let relogio = null;
  function revisarDepois(alvo, estado, cfg) {
    clearTimeout(relogio); relogio = null;
    if (estado !== 'parado') return;
    relogio = setTimeout(async () => {
      if (!alvo.isConnected) return;
      if (document.visibilityState === 'hidden') return revisarDepois(alvo, estado, cfg);
      await pintarHoje(alvo, { cfg });
      if (alvo.dataset.estado !== 'parado' && alvo.dataset.estado !== 'pausa' && typeof toast === 'function') toast('O WhatsApp voltou. As mensagens da fila começam a sair aos poucos.', 'ok', 7000);
    }, 60000);
  }

  window.R13 = { montarHoje, estadoEnvio, frase, pintarHoje };
})();
