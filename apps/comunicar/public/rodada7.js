/* ===================== IndyCar Comunicar — Rodada 7 (25/10/2026) =====================
   • Início: cuidado com o cliente (PARAR, barrados, freio), respostas sem atender e aviso de retomada do WhatsApp
   • Mensagens: "Quando sai" (hora exata), agenda por hora, Antecipar, retomada (plano + triagem), CSV da agenda
   • Campanhas: Repetir (pelo MODELO), teste A/B, Reabordar recusados (Orçador)
   • Réguas: eventos reais (aprovou, faltou, vencendo, carro pronto esperando) e o anti-spam novo
   • Resultados avançados: melhor horário, comparação com o período anterior, A/B e ranking
   Usa as funções do app.js (api, openModal, toast, esc, svg, I, state, route…).
   Regra da casa: esc() em TODO dado que vira HTML.
   ======================================================================================= */
(function () {
  'use strict';
  const R7 = {};
  const n0 = (n) => Number(n || 0).toLocaleString('pt-BR');
  const fechar = '<button type="button" class="modal-close" aria-label="Fechar">×</button>';
  const erroHtml = (e) => `<p class="form-msg erro">${esc(e?.message || String(e))}</p>`;
  const ROT = (t) => (typeof TIPO !== 'undefined' && TIPO[t]?.rotulo) || t;
  const EMO = (t) => (typeof TIPO !== 'undefined' && TIPO[t]?.emoji) || '✉️';
  const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hhmm = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }); };
  const quando = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

  // ======================================================================
  // INÍCIO — cuidado com o cliente, respostas sem atender, WhatsApp voltando
  // ======================================================================
  R7.pintarInicio = async function () {
    const ancora = $('#painelR6Con') || $('#painelSaudeWA') || $('#painelPronto');
    if (!ancora || $('#painelR7')) return;
    const box = document.createElement('section');
    box.className = 'panel r7-painel'; box.id = 'painelR7'; box.setAttribute('aria-label', 'Cuidado com o cliente');
    box.innerHTML = `<div class="panel-head"><h2>${svg(I.olho)} Cuidado com o cliente</h2><span class="panel-sub">PARAR, números ruins, respostas sem atender</span></div>
      <div class="panel-body"><div id="r7Retomada"></div><div id="r7Anti"><div class="skel" style="height:72px"></div></div><div id="r7Pend"></div></div>`;
    ancora.insertAdjacentElement('afterend', box);
    const [anti, pend, ret] = await Promise.all([
      api('GET', '/antispam').catch((e) => ({ erro: e.message })),
      api('GET', '/respostas/pendentes?horas=2').catch(() => null),
      api('GET', '/retomada').catch(() => null),
    ]);
    if (!$('#r7Anti')) return;
    if (ret && (ret.emQueda || ret.retomadaAtiva)) {
      $('#r7Retomada').innerHTML = `<div class="r7-aviso ${ret.emQueda ? 'queda' : 'volta'}" role="status"><b>${ret.emQueda ? 'O WhatsApp está parado' : 'O WhatsApp voltou: a fila sai devagar de propósito'}</b>
        <span>${n0(ret.fila)} na fila. ${ret.plano ? `Primeira meia hora: ${n0(ret.plano.primeiraMeiaHora)}; até 2 h: ${n0(ret.plano.ateDuasHoras)}.` : ''}</span>
        <button type="button" class="btn btn-mini" id="r7AbrirRetomada">Ver o plano</button></div>`;
      $('#r7AbrirRetomada').addEventListener('click', () => R7.abrirRetomada());
    }
    if (anti.erro) { $('#r7Anti').innerHTML = `<p class="dica">Não consegui ler agora: ${esc(anti.erro)}</p>`; }
    else {
      const b = anti.barrados || {};
      const itens = [['pediram para parar', anti.pararam30], ['taxa de PARAR', `${String(anti.taxaParar ?? 0).replace('.', ',')}%`], ['voltaram pelo WhatsApp', anti.voltaram30],
        ['barrados: pediu para parar', b.pediu_para_parar], ['barrados: número ruim', b.numero_ruim], ['barrados: texto repetido', b.texto_repetido], ['barrados: teto de campanhas', b.teto_campanhas], ['campanhas freadas', anti.freios]];
      $('#r7Anti').innerHTML = `<p class="r7-nivel ${esc(anti.nivel || 'ok')}">${esc(anti.texto || '')}</p>
        <div class="r7-num-grid">${itens.map(([r, n]) => `<div><b>${typeof n === 'string' ? esc(n) : n0(n)}</b><small>${esc(r)}</small></div>`).join('')}</div>
        <small class="muted">Últimos 30 dias. ${anti.config?.rodape_parar ? 'O rodapé "responda PARAR" vai em campanhas e réguas de marketing.' : 'O rodapé de PARAR está desligado.'}</small>`;
    }
    const lista = Array.isArray(pend) ? pend : [];
    $('#r7Pend').innerHTML = lista.length ? `<h3 class="r6-sub">Responderam e ninguém atendeu <span class="badge-pill bp-orange">${lista.length}</span></h3>
      <ul class="r7-pend">${lista.slice(0, 8).map((p) => `<li><b>${esc(p.nome || telBR(p.telefone))}</b><small>${esc(ROT(p.tipo))} · há ${n0(p.horas)} h</small><span>${esc(p.resposta)}</span></li>`).join('')}</ul>
      ${lista.length > 8 ? `<small class="muted">e mais ${lista.length - 8}…</small>` : ''}` : '';
  };

  // ======================================================================
  // MENSAGENS — barra, "quando sai", agenda por hora, antecipar, retomada
  // ======================================================================
  R7.barraMensagens = function () {
    const dir = $('.toolbar .right', view);
    if (!dir || $('#r7Exata')) return;
    dir.insertAdjacentHTML('afterbegin', `<button type="button" class="btn btn-mini" id="r7Exata" title="O que as réguas gerariam agora e a hora exata em que cada uma sai">${svg(I.olho)} Prévia exata</button>
      <button type="button" class="btn btn-mini" id="r7Hora" title="Quantas saem em cada hora de hoje">🕒 Por hora</button>
      <button type="button" class="btn btn-mini" id="r7Ret" title="O plano de saída depois de uma queda do WhatsApp">🐢 Retomada</button>`);
    $('#r7Exata').addEventListener('click', () => R7.abrirPreviaExata());
    $('#r7Hora').addEventListener('click', () => R7.abrirPorHora());
    $('#r7Ret').addEventListener('click', () => R7.abrirRetomada());
  };
  R7.botoesEnvio = function (e, meu) {
    if (e.status !== 'pendente') return '';
    const id = esc(e.id);
    return `<button type="button" class="btn btn-mini ghost" data-r7-quando="${id}" title="A hora em que ela deve sair">${svg(I.clock)} Quando sai?</button>`
      + (meu ? `<button type="button" class="btn btn-mini ghost" data-r7-antecipar="${id}" title="Trazer para a próxima rodada">⏩ Antecipar</button>` : '');
  };
  document.addEventListener('click', async (ev) => {
    const q = ev.target.closest?.('[data-r7-quando]'), a = ev.target.closest?.('[data-r7-antecipar]');
    if (q) {
      q.disabled = true;
      try { const r = await api('GET', `/envios/${q.dataset.r7Quando}/quando`); toast(r.sai_em ? `Sai ${r.rotulo}${r.posicao ? ` (nº ${r.posicao} da fila)` : ''}. É uma estimativa.` : `Não tem hora ainda: ${r.rotulo}.`, 'ok', 6000); }
      catch (e) { toast(e.message, 'err'); } finally { q.disabled = false; }
    }
    if (a) {
      a.disabled = true;
      try { await api('POST', `/envios/${a.dataset.r7Antecipar}/antecipar`, {}); toast('Na próxima rodada do carteiro.'); route(null, { quieto: true }); }
      catch (e) { toast(e.message, 'err'); a.disabled = false; }
    }
  });

  R7.abrirPreviaExata = async function () {
    openModal(`<div class="modal-head"><h3>${svg(I.olho)} Prévia exata</h3>${fechar}</div>
      <div class="modal-body"><div class="r7-filtros"><label class="field"><span>Régua</span><select id="r7ExRegua"><option value="">Todas</option></select></label>
        <label class="r6-evitar"><input type="checkbox" id="r7ExFila"> <span>Contar o que já está na fila (hora mais realista)</span></label></div>
        <div id="r7ExCorpo"><div class="skel" style="height:160px"></div></div></div>
      <div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    const reg = $('#r7ExRegua');
    for (const [id, rot] of [['aniversario', 'Aniversário'], ['lembrete', 'Lembrete'], ['posvenda', 'Pós-venda'], ['avaliacao', 'Avaliação'], ['revisao', 'Revisão'], ['orcamento', 'Orçamento'], ['naofechou', 'Não fechou'], ['reativacao', 'Reativação'], ['aprovou', 'Aprovou, falta o horário'], ['faltou', 'Faltou ao horário'], ['vencendo', 'Orçamento vencendo'], ['pronto_lembrete', 'Carro pronto esperando']]) reg.insertAdjacentHTML('beforeend', `<option value="${esc(id)}">${esc(rot)}</option>`);
    const carregar = async () => {
      const c = $('#r7ExCorpo'); if (!c) return;
      c.innerHTML = '<div class="skel" style="height:160px"></div>';
      let r; try { r = await api('GET', `/previa/exata?${reg.value ? `regua=${encodeURIComponent(reg.value)}&` : ''}fila=${$('#r7ExFila').checked ? 1 : 0}`); } catch (e) { c.innerHTML = erroHtml(e); return; }
      if (!$('#r7ExCorpo')) return;
      const dias = Object.entries(r.porDia || {});
      c.innerHTML = `<div class="r6-veredito ok">${r.total ? `${n0(r.total)} mensagem(ns) seriam geradas${dias.length ? `: ${esc(dias.slice(0, 5).map(([d, n]) => `${d.slice(8)}/${d.slice(5, 7)}: ${n}`).join(' · '))}` : ''}.` : 'As réguas não gerariam nada agora.'}</div>
        <p class="dica">${esc(r.aviso || '')}</p>
        <ul class="r6-itens">${(r.linhas || []).slice(0, 60).map((l) => `<li><span class="r6-it-txt"><b>${EMO(l.tipo)} ${esc(l.nome || telBR(l.telefone))}</b><small>${esc(ROT(l.tipo))} · <b>${esc(l.rotulo_saida || '')}</b></small><small class="r7-texto">${esc(l.corpo)}</small></span></li>`).join('')}</ul>
        ${r.cortada ? '<small class="muted">Mostrando as primeiras 60.</small>' : ''}
        ${(r.puladas || []).length ? `<h4>Ficariam de fora (${r.puladas.length})</h4><ul class="r6-itens">${r.puladas.slice(0, 20).map((p) => `<li><span class="r6-it-txt"><b>${esc(p.nome || telBR(p.telefone))}</b><small class="r6-motivo">${esc(p.motivo || '')}</small></span></li>`).join('')}</ul>` : ''}`;
    };
    reg.addEventListener('change', carregar); $('#r7ExFila').addEventListener('change', carregar);
    carregar();
  };

  R7.abrirPorHora = async function () {
    openModal(`<div class="modal-head"><h3>🕒 O que sai em cada hora</h3>${fechar}</div>
      <div class="modal-body"><label class="field"><span>Dia</span><input type="date" id="r7HoraDia"></label><div id="r7HoraCorpo"><div class="skel" style="height:140px"></div></div></div>
      <div class="modal-foot">${pode('exportar') ? '<button type="button" class="btn ghost esq" id="r7AgendaCsv">Baixar a fila em planilha</button>' : ''}<button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    const carregar = async () => {
      const c = $('#r7HoraCorpo'); if (!c) return;
      const dia = $('#r7HoraDia').value;
      let r; try { r = await api('GET', `/agenda/por-hora${dia ? `?dia=${encodeURIComponent(dia)}` : ''}`); } catch (e) { c.innerHTML = erroHtml(e); return; }
      if (!$('#r7HoraCorpo')) return;
      if (!$('#r7HoraDia').value) $('#r7HoraDia').value = r.dia;
      const max = Math.max(1, ...r.horas.map((h) => h.total));
      c.innerHTML = `<p><b>${n0(r.total)}</b> mensagem(ns) saem neste dia${r.naoCabem ? ` · <b>${n0(r.naoCabem)}</b> não cabem nos próximos dias` : ''}. Estimativa com os limites de hoje.</p>
        ${r.horas.length ? `<div class="r7-horas">${r.horas.map((h) => `<div class="r7-hora"><span>${String(h.hora).padStart(2, '0')}h</span><i style="width:${Math.max(4, Math.round((h.total / max) * 100))}%"></i><b>${n0(h.total)}</b><small>${esc(Object.entries(h.porTipo).map(([t, n]) => `${ROT(t)} ${n}`).join(' · '))}</small></div>`).join('')}</div>` : '<p class="muted">Nada programado para este dia.</p>'}`;
    };
    $('#r7HoraDia').addEventListener('change', carregar);
    $('#r7AgendaCsv')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await fetch(API + '/agenda.csv', { headers: await authCabecalhos() }); if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || 'Não deu para exportar.'); } const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `comunicar-agenda-${hojeSP()}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; }
    });
    carregar();
  };

  R7.abrirRetomada = async function () {
    openModal(`<div class="modal-head"><h3>🐢 Quando o WhatsApp volta</h3>${fechar}</div><div class="modal-body" id="r7RetCorpo"><div class="skel" style="height:160px"></div></div>
      <div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    const desenhar = async () => {
      let r; try { r = await api('GET', '/retomada'); } catch (e) { $('#r7RetCorpo').innerHTML = erroHtml(e); return; }
      if (!$('#r7RetCorpo')) return;
      const p = r.plano || {};
      const estado = r.emQueda ? 'O WhatsApp está parado agora.' : r.retomadaAtiva ? 'O WhatsApp voltou: retomada gradual em andamento.' : 'O WhatsApp está normal. Isto é o plano para quando voltar de uma queda.';
      $('#r7RetCorpo').innerHTML = `<div class="r6-veredito ${r.emQueda ? 'bloq' : 'ok'}">${esc(estado)}</div>
        <div class="r7-num-grid"><div><b>${n0(r.fila)}</b><small>na fila</small></div><div><b>${n0(p.primeiraMeiaHora)}</b><small>na 1ª meia hora (máx. ${n0(r.limites?.max30)})</small></div>
          <div><b>${n0(p.ateDuasHoras)}</b><small>até 2 h (máx. ${n0(r.limites?.max120)})</small></div><div><b>${p.ultimaSaida ? esc(quando(p.ultimaSaida)) : '—'}</b><small>última sai</small></div>
          <div><b>${n0(r.semRetomada?.primeiraMeiaHora)}</b><small>na 1ª meia hora, sem o freio</small></div></div>
        <p class="dica">${r.limites?.soEssencial ? 'Nas primeiras 2 horas só saem as mensagens essenciais (lembrete de horário, avisos do carro, respostas); campanhas esperam.' : 'Campanhas também saem na retomada.'}</p>
        <h4>O que fazer com a fila acumulada</h4>
        ${(r.triagem || []).length ? `<ul class="r7-triagem">${r.triagem.map((g) => `<li><label><input type="checkbox" data-r7-tri="${esc(g.tipo)}" ${g.sugestao === 'cancelar' && pode('cancelar_qualquer') ? 'checked' : ''} ${pode('cancelar_qualquer') ? '' : 'disabled'}> <b>${EMO(g.tipo)} ${esc(ROT(g.tipo))}</b></label>
            <span>${n0(g.total)} na fila · a mais antiga espera ${n0(g.maisAntigaH)} h</span><small class="${g.perderamSentido ? 'r6-motivo' : 'muted'}">${esc(g.motivo)}</small></li>`).join('')}</ul>
          ${pode('cancelar_qualquer') ? `<button type="button" class="btn danger" id="r7Triar">Cancelar o que perdeu o sentido nos tipos marcados</button>` : '<p class="muted">Só o gestor cancela.</p>'}` : '<p class="muted">A fila está vazia.</p>'}
        ${r.retomadaAtiva && pode('rodar') ? '<p><button type="button" class="btn ghost" id="r7Encerrar">Já está firme: encerrar a retomada agora</button></p>' : ''}`;
      $('#r7Triar')?.addEventListener('click', async (e) => {
        const tipos = $$('[data-r7-tri]:checked', $('#r7RetCorpo')).map((x) => x.dataset.r7Tri);
        if (!tipos.length) return toast('Marque pelo menos um tipo.', 'err');
        if (!confirm('Cancelar só as mensagens desses tipos que já perderam o sentido? Não dá para desfazer em lote.')) return;
        e.currentTarget.disabled = true;
        try { const x = await api('POST', '/retomada/triagem', { tipos, so_perderam: true }); toast(`${plural(x.cancelados, 'mensagem cancelada', 'mensagens canceladas')}.`); desenhar(); }
        catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
      });
      $('#r7Encerrar')?.addEventListener('click', async () => { try { await api('POST', '/retomada/encerrar', {}); toast('Retomada encerrada.'); desenhar(); } catch (err) { toast(err.message, 'err'); } });
    };
    desenhar();
  };

  // ======================================================================
  // CAMPANHAS — Repetir, A/B, Reabordar recusados
  // ======================================================================
  R7.pintarCampanhas = async function () {
    const topo = $('.toolbar .right', view);
    if (topo && !$('#r7Reab')) {
      topo.insertAdjacentHTML('afterbegin', `<button type="button" class="btn" id="r7Reab" title="Orçamentos recusados que ainda dá para recuperar (Orçador)">${svg(I.money)} Reabordar recusados</button>`);
      $('#r7Reab').addEventListener('click', () => R7.abrirReabordar());
    }
    for (const a of $$('.camp[data-lote]', view)) {
      if ($('.r7-repetir', a)) continue;
      const alvo = $('.camp-txt', a); if (!alvo) continue;
      alvo.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-mini r7-repetir" data-r7-repetir="${esc(a.dataset.lote)}" title="Abre a campanha de novo com o texto-modelo e o público">↻ Repetir</button>`);
    }
    $$('[data-r7-repetir]', view).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const m = await api('GET', `/lotes/${b.dataset.r7Repetir}/modelo`);
        window.openCampanhaModal({ repetir: m });
      } catch (e) { toast(e.message, 'err', 6000); } finally { b.disabled = false; }
    }));
  };
  /** O Repetir entra pelo `pre.repetir`: o texto-MODELO e o público da campanha original (nunca o texto já preenchido do primeiro cliente). */
  R7.aplicarRepetir = function (c, pre) {
    const m = pre?.repetir; if (!m) return;
    c.corpo = m.modelo; c.repete_lote = m.lote;
    if (m.segmento?.filtro) { c.filtro = m.segmento.filtro; c.valor = m.segmento.valor ?? ''; }
    if (m.evitar_dias) c.evitarDias = m.evitar_dias;
    setTimeout(() => toast(m.segmento?.filtro ? 'Repetindo: o texto e o público são os da campanha original. Confira a prévia.' : 'Repetindo o texto. Escolha para quem vai (a original foi para uma lista manual).', 'ok', 5500), 300);
  };
  R7.pintarPasso3 = function (c, { corpoEl }) {
    if (c.alvo !== 'segmento' || !pode('campanha_aprovar') || $('#r7AB', corpoEl)) return;
    const box = document.createElement('div');
    box.className = 'r7-ab'; box.id = 'r7AB';
    box.innerHTML = `<label class="r6-evitar"><input type="checkbox" id="r7ABliga" ${c.corpo_b ? 'checked' : ''}> <span>Testar dois textos (metade recebe cada um; precisa de pelo menos 40 clientes)</span></label>
      <div id="r7ABcampo" ${c.corpo_b ? '' : 'hidden'}><label class="field"><span>Texto B</span><textarea id="r7ABtexto" maxlength="2000" placeholder="Outra forma de dizer a mesma coisa. Pode usar {primeiro_nome}, {carro}…">${esc(c.corpo_b || '')}</textarea></label>
      <small class="muted">Depois de uns dias, em Resultados, o app diz qual funcionou melhor.</small></div>`;
    corpoEl.appendChild(box);
    $('#r7ABliga').addEventListener('change', (e) => { $('#r7ABcampo').hidden = !e.target.checked; if (!e.target.checked) c.corpo_b = ''; });
    $('#r7ABtexto').addEventListener('input', (e) => { c.corpo_b = e.target.value; });
  };
  R7.completarPedido = function (c, payload) {
    if (c.repete_lote) payload.repete_lote = c.repete_lote;
    if (c.corpo_b && c.corpo_b.trim()) payload.corpo_b = c.corpo_b.trim();
    return payload;
  };

  R7.abrirReabordar = async function () {
    openModal(`<div class="modal-head"><h3>${svg(I.money)} Reabordar orçamentos recusados</h3>${fechar}</div>
      <div class="modal-body" id="r7ReabCorpo"><div class="skel" style="height:180px"></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-fechar>Fechar</button>${pode('campanha_aprovar') ? '<button type="button" class="btn primary" id="r7ReabEnviar" disabled>Enfileirar</button>' : ''}</div>`, { larga: true });
    let dias = 30;
    const desenhar = async () => {
      const c = $('#r7ReabCorpo'); if (!c) return;
      c.innerHTML = '<div class="skel" style="height:180px"></div>';
      let r; try { r = await api('GET', `/reabordar?dias=${dias}`); } catch (e) { c.innerHTML = erroHtml(e); return; }
      if (!$('#r7ReabCorpo')) return;
      const f = r.fora || {};
      const fora = [f.nao_quer ? `${f.nao_quer} pediram para parar` : '', f.reclamacao ? `${f.reclamacao} com reclamação aberta` : '', f.na_oficina ? `${f.na_oficina} com o carro na oficina` : '', f.celular_ruim ? `${f.celular_ruim} sem celular válido` : '', f.ja_reabordado ? `${f.ja_reabordado} já reabordados` : ''].filter(Boolean);
      const motivos = Object.entries(r.motivos || {});
      c.innerHTML = `<label class="field"><span>Recusados nos últimos</span><select id="r7ReabDias">${[7, 15, 30, 60, 90].map((d) => `<option value="${d}" ${d === dias ? 'selected' : ''}>${d} dias</option>`).join('')}</select></label>
        <div class="r7-num-grid"><div><b>${n0(r.total)}</b><small>podem receber</small></div><div><b>${esc(reais(r.valorTotal))}</b><small>em jogo</small></div></div>
        ${fora.length ? `<small class="muted">Ficam de fora: ${esc(fora.join(' · '))}.</small>` : ''}
        ${r.total ? motivos.map(([m, rot]) => { const x = r.porMotivo?.[m]; if (!x) return ''; return `<section class="r7-motivo"><label class="r6-evitar"><input type="checkbox" data-r7-motivo="${esc(m)}" checked> <span><b>${esc(rot)}</b>: ${n0(x.n)} · ${esc(reais(x.valor))}</span></label>
            <textarea data-r7-texto="${esc(m)}" maxlength="1000" ${pode('campanha_aprovar') ? '' : 'disabled'}>${esc(r.modelos?.[m] || '')}</textarea>
            <small class="r6-erro-texto" data-r7-erro="${esc(m)}" hidden></small></section>`; }).join('') : '<p class="muted">Ninguém para reabordar agora.</p>'}
        <p class="dica">O texto nunca promete preço nem desconto: o valor quem fala é o consultor. Cada orçamento recebe uma mensagem só, uma vez.</p>
        ${r.total ? `<h4>Quem recebe (os primeiros)</h4><ul class="r6-itens">${(r.candidatos || []).slice(0, 25).map((x) => `<li><span class="r6-it-txt"><b>${esc(x.nome || telBR(x.telefone))}</b><small>${esc([x.carro, x.numero ? `orç. ${x.numero}` : '', reais(x.valor), `há ${x.dias_desde} dias`].filter(Boolean).join(' · '))}</small></span></li>`).join('')}</ul>` : ''}`;
      $('#r7ReabDias').addEventListener('change', (e) => { dias = Number(e.target.value); desenhar(); });
      const btn = $('#r7ReabEnviar'); if (btn) btn.disabled = !r.total;
    };
    desenhar();
    $('#r7ReabEnviar')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const textos = {}; for (const t of $$('[data-r7-texto]')) textos[t.dataset.r7Texto] = t.value;
      const motivos = $$('[data-r7-motivo]:checked').map((x) => x.dataset.r7Motivo);
      if (!motivos.length) return toast('Marque pelo menos um motivo.', 'err');
      if (!confirm('Colocar essas mensagens na fila? Cada orçamento recebe uma só.')) return;
      b.disabled = true;
      try {
        const r = await api('POST', '/reabordar/enviar', { dias, motivos, textos });
        toast(`${plural(r.enfileirados, 'mensagem na fila', 'mensagens na fila')} (${esc0(reais(r.valor))} em jogo).`, 'ok', 6000);
        document.querySelector('.modal [data-fechar]')?.click(); route(null, { quieto: true });
      } catch (err) {
        if (err.campo) { const el = document.querySelector(`[data-r7-erro="${CSS.escape(err.campo)}"]`); if (el) { el.textContent = err.message; el.hidden = false; } }
        toast(err.message, 'err', 6000); b.disabled = false;
      }
    });
  };
  const esc0 = (s) => String(s);

  // ======================================================================
  // RÉGUAS — eventos reais e anti-spam novo
  // ======================================================================
  const EVENTOS = [
    { id: 'aprovou', emoji: '✅', rotulo: 'Aprovou, falta o horário', fonte: 'Orçador → Agenda', campo: 'ativo_aprovou', param: { campo: 'horas_aprovou', antes: 'depois de', depois: 'horas', min: 1, max: 72 }, texto: 'msg_aprovou', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico'], obrig: null, desc: 'Orçamento aprovado no Orçador e ainda sem horário na Agenda nem ordem no Pátio: convida a marcar.' },
    { id: 'faltou', emoji: '🔄', rotulo: 'Faltou ao horário', fonte: 'Agenda', campo: 'ativo_faltou', param: { campo: 'horas_faltou', antes: 'depois de', depois: 'horas', min: 1, max: 48 }, texto: 'msg_faltou', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'quando'], obrig: null, desc: 'Cliente marcado como "não veio": convida a remarcar, sem cobrança. Se já marcou outro horário, não incomoda.' },
    { id: 'vencendo', emoji: '⏳', rotulo: 'Orçamento vencendo', fonte: 'Orçador', campo: 'ativo_vencendo', param: { campo: 'dias_vencendo', antes: 'quando faltar até', depois: 'dia(s)', min: 1, max: 7 }, texto: 'msg_vencendo', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'validade', 'link_orcamento'], obrig: 'link_orcamento', desc: 'Orçamento enviado e sem decisão que vence logo: avisa a validade com o link.' },
    { id: 'pronto_lembrete', emoji: '🔑', rotulo: 'Carro pronto esperando', fonte: 'Pátio', campo: 'ativo_pronto_lembrete', param: { campo: 'horas_pronto_lembrete', antes: 'depois de', depois: 'horas parado', min: 4, max: 168 }, texto: 'msg_pronto_lembrete', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'link_os'], obrig: 'link_os', desc: 'Carro pronto no Pátio e ainda não retirado: um lembrete com o link de acompanhar (só depois do aviso de pronto ter saído).' },
  ];
  const ANTI = [
    { campo: 'rodape_parar', titulo: 'Rodapé "responda PARAR" nas campanhas e réguas de marketing', desc: 'Quem não quer mais receber sabe como sair. Avisos do carro e lembretes de horário não levam.' },
    { campo: 'validar_celular', titulo: 'Só mandar para celular de verdade', desc: 'Telefone fixo, DDD que não existe e número de mentira ficam de fora, e o número que já deu "sem WhatsApp" não é tentado de novo.' },
    { campo: 'retomada_so_essencial', titulo: 'Na retomada do WhatsApp, só o essencial', desc: 'Nas 2 primeiras horas depois de uma queda, campanhas esperam; lembrete de horário e avisos do carro saem.' },
  ];
  const NUM7 = [
    { campo: 'max_campanhas_30d', titulo: 'Teto de campanhas por cliente', antes: 'no máximo', depois: 'campanhas em 30 dias (0 = sem teto)', min: 0, max: 30 },
    { campo: 'marketing_fim', titulo: 'Campanha e réguas de marketing até que hora', antes: 'param às', depois: 'h (a janela geral continua valendo para o resto)', min: 8, max: 24 },
    { campo: 'freio_optout_pct', titulo: 'Freio automático de campanha', antes: 'parar a campanha se', depois: '% pedirem PARAR (0 = desligado)', min: 0, max: 50 },
    { campo: 'freio_min_envios', titulo: 'Freio: só avaliar depois de', antes: '', depois: 'mensagens enviadas', min: 5, max: 500 },
    { campo: 'retomada_max_30min', titulo: 'Retomada: primeira meia hora', antes: 'no máximo', depois: 'mensagens', min: 1, max: 100 },
    { campo: 'retomada_max_2h', titulo: 'Retomada: até 2 horas', antes: 'no máximo', depois: 'mensagens', min: 1, max: 300 },
    { campo: 'dedupe_avulsa_min', titulo: 'Mensagem avulsa repetida', antes: 'mesmo texto para o mesmo número em', depois: 'min vira duplo clique (0 = desligado)', min: 0, max: 120 },
  ];
  R7.pintarReguas = function () {
    const grid = $('.reguas-grid', view); if (!grid || $('#painelR7Reguas')) return;
    const gestor = ehGestor();
    const v = (c) => (state.cfgEdit[c] !== undefined ? state.cfgEdit[c] : state.cfg[c]);
    const sw = (campo) => `<label class="sw"><input type="checkbox" data-r7cfg="${campo}" ${v(campo) !== false && v(campo) !== undefined ? 'checked' : ''} ${gestor ? '' : 'disabled'} aria-label="Ligar"><span class="tr"></span><span class="sw-txt">${v(campo) !== false && v(campo) !== undefined ? 'Ligado' : 'Desligado'}</span></label>`;
    const num = (n) => `<span class="r6-param">${esc(n.antes)} <input type="number" inputmode="numeric" min="${n.min}" max="${n.max}" step="1" value="${esc(v(n.campo) ?? '')}" data-r7cfg="${n.campo}" class="inp" aria-label="${esc(n.titulo)}" ${gestor ? '' : 'disabled'}> ${esc(n.depois)}</span>`;
    const caixa = document.createElement('section');
    caixa.className = 'panel r6-painel r7-painel'; caixa.id = 'painelR7Reguas';
    caixa.innerHTML = `<div class="panel-head"><h2>${svg(I.externo)} Eventos reais</h2><span class="panel-sub">o que acontece nos outros sistemas e vira mensagem aqui</span></div>
      <div class="panel-body">${EVENTOS.map((e) => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${e.emoji} ${esc(e.rotulo)} <span class="badge-pill bp-gray">${esc(e.fonte)}</span></b><p>${esc(e.desc)}</p>${num({ ...e.param, titulo: e.rotulo })}</div>${sw(e.campo)}</div>
          <div class="field r6-texto"><label for="r7t_${e.texto}">Texto: ${esc(e.rotulo)}</label><textarea id="r7t_${e.texto}" maxlength="1000" data-r7cfg="${e.texto}" ${gestor ? '' : 'disabled'}>${esc(v(e.texto) ?? '')}</textarea>
            <div class="var-chips">${e.vars.map((x) => `<button type="button" class="var-chip${x === e.obrig ? ' link' : ''}" data-r7var="${esc(x)}" data-r7alvo="r7t_${e.texto}" ${gestor ? '' : 'disabled'}>{${esc(x)}}</button>`).join('')}</div>
            <small class="r6-erro-texto" id="r7e_${e.texto}" hidden></small></div>`).join('')}
        <h3 class="r6-sub">Cuidado com o cliente (novo)</h3>
        ${ANTI.map((i) => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${esc(i.titulo)}</b><p>${esc(i.desc)}</p></div>${sw(i.campo)}</div>`).join('')}
        <div class="field r6-texto"><label for="r7t_texto_rodape_parar">Frase do rodapé</label><input id="r7t_texto_rodape_parar" class="inp" maxlength="140" data-r7cfg="texto_rodape_parar" value="${esc(v('texto_rodape_parar') ?? '')}" ${gestor ? '' : 'disabled'}><small class="r6-erro-texto" id="r7e_texto_rodape_parar" hidden></small></div>
        ${NUM7.map((n) => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${esc(n.titulo)}</b>${num(n)}</div></div>`).join('')}
      </div>`;
    grid.insertAdjacentElement('beforebegin', caixa);
    const validar = (campo) => {
      const e = EVENTOS.find((x) => x.texto === campo); if (!e) return true;
      const valor = String($(`#r7t_${campo}`).value);
      const usadas = [...valor.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const desconhecida = usadas.find((x) => !e.vars.includes(x));
      let msg = '';
      if (valor.trim().length < 10) msg = 'Escreva pelo menos uma frase.';
      else if (desconhecida) msg = `A variável {${desconhecida}} não existe neste texto.`;
      else if (e.obrig && !usadas.includes(e.obrig)) msg = `O texto precisa ter {${e.obrig}}: sem o link o cliente não consegue abrir.`;
      else if (/R\$|desconto/i.test(valor)) msg = 'Não prometa preço nem desconto pela mensagem.';
      const el = $(`#r7e_${campo}`); el.textContent = msg; el.hidden = !msg;
      $(`#r7t_${campo}`).classList.toggle('invalido', !!msg);
      return !msg;
    };
    $$('[data-r7cfg]', caixa).forEach((el) => {
      const campo = el.dataset.r7cfg;
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const novo = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
        if (el.type === 'number') { const n = Number(el.value); el.classList.toggle('invalido', el.value === '' || n < Number(el.min) || n > Number(el.max) || !Number.isInteger(n)); }
        if (EVENTOS.some((x) => x.texto === campo)) validar(campo);
        if (campo === 'texto_rodape_parar') { const m = $('#r7e_texto_rodape_parar'); const ruim = !/parar/i.test(el.value); m.textContent = ruim ? 'A frase precisa dizer PARAR.' : ''; m.hidden = !ruim; el.classList.toggle('invalido', ruim); }
        if (String(novo) === String(state.cfg[campo] ?? '')) delete state.cfgEdit[campo]; else state.cfgEdit[campo] = novo;
        if (el.type === 'checkbox') $('.sw-txt', el.closest('.sw')).textContent = novo ? 'Ligado' : 'Desligado';
        atualizarBarra();
      });
    });
    $$('[data-r7var]', caixa).forEach((b) => b.addEventListener('click', () => {
      const ta = $('#' + b.dataset.r7alvo); if (!ta || ta.disabled) return;
      const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini, tok = `{${b.dataset.r7var}}`;
      ta.value = ta.value.slice(0, ini) + tok + ta.value.slice(fim); ta.focus(); ta.setSelectionRange(ini + tok.length, ini + tok.length);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }));
  };

  // ======================================================================
  // RESULTADOS AVANÇADOS — chamado pela janela de resultados da rodada 6
  // ======================================================================
  R7.htmlAvancados = async function (de, ate) {
    let r; try { r = await api('GET', `/resultados/avancados?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`); } catch (e) { return erroHtml(e); }
    const cmp = (rot, c) => `<div><b>${n0(c.atual)}</b><small>${esc(rot)}</small><em class="${c.delta > 0 ? 'sobe' : c.delta < 0 ? 'desce' : ''}">${c.pct === null ? (c.delta ? `${c.delta > 0 ? '+' : ''}${c.delta}` : '=') : `${c.delta > 0 ? '+' : ''}${String(c.pct).replace('.', ',')}%`} vs. período anterior</em></div>`;
    const mh = r.melhorHorario || {};
    const ab = (r.ab || []).map((g) => `<li><b>${esc((g.A?.modelo || '').slice(0, 50))}</b> contra <b>${esc((g.B?.modelo || '').slice(0, 50))}</b><small>A: ${n0(g.A?.enviadas)} env., ${n0(g.A?.responderam)} resp. · B: ${n0(g.B?.enviadas)} env., ${n0(g.B?.responderam)} resp.</small><span class="${g.decisao?.vencedor ? 'r7-vence' : 'muted'}">${esc(g.decisao ? (g.decisao.vencedor ? `Venceu o ${g.decisao.vencedor}: ${g.decisao.motivo}` : g.decisao.motivo) : '')}</span></li>`).join('');
    return `<section class="r7-avancado"><h4>Comparação e horários</h4>
      <div class="r7-num-grid">${cmp('enviadas', r.comparacao.enviadas)}${cmp('responderam', r.comparacao.responderam)}${cmp('agendaram', r.comparacao.agendaram)}${cmp('pediram PARAR', r.comparacao.pararam)}
        <div><b>${r.tempoMedianoRespostaMin === null || r.tempoMedianoRespostaMin === undefined ? '—' : `${n0(r.tempoMedianoRespostaMin)} min`}</b><small>tempo típico até responder</small></div></div>
      <p class="dica">${mh.melhorHora ? `Melhor hora para enviar: <b>${String(mh.melhorHora.hora).padStart(2, '0')}h</b> (${String(mh.melhorHora.taxaResposta).replace('.', ',')}% responderam).` : 'Ainda não há mensagens suficientes para dizer qual é a melhor hora.'}
        ${mh.melhorDia ? ` Melhor dia: <b>${esc(mh.melhorDia.rotulo)}</b>.` : ''}</p>
      ${ab ? `<h4>Teste A/B</h4><ul class="r7-ab-lista">${ab}</ul>` : ''}
      ${(r.ranking || []).length ? `<h4>Campanhas que mais tiveram resposta</h4><ol class="r7-rank">${r.ranking.map((x) => `<li><b>${String(x.taxaResposta).replace('.', ',')}%</b> <span>${esc(x.modelo || 'campanha')}</span><small>${n0(x.enviadas)} enviadas</small></li>`).join('')}</ol>` : ''}</section>`;
  };
  R7.pintarResultados = async function (caixa, f) {
    if (!caixa || !f?.de || !f?.ate || caixa.querySelector('.r7-avancado')) return;
    const html = await R7.htmlAvancados(f.de, f.ate);
    if (caixa.isConnected && !caixa.querySelector('.r7-avancado')) caixa.insertAdjacentHTML('beforeend', html);
  };

  window.R7 = R7;
})();
