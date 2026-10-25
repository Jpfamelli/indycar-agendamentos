/* ===================== IndyCar Comunicar — Rodada 6 (21/10/2026) =====================
   • Início: ligações com o Pátio, o Orçador e o CRM (números reais) + resultados dos últimos 30 dias
   • Mensagens: agenda de envios (por dia, com o teto), "por que não saiu?", adiar à mão,
     simular a rodada do carteiro, resultados (respondeu → agendou → voltou → faturou)
   • Réguas: interruptores das ligações novas, anti-spam e os três textos novos
   • Campanhas: prévia EXATA (as linhas que vão para a fila), "não repetir para quem recebeu
     campanha há N dias" e aviso de link de fora da IndyCar; resultado por campanha
   Usa as funções do app.js (api, openModal, toast, esc, svg, I, state, route…).
   Regra da casa: esc() em TODO dado que vira HTML.
   ======================================================================================= */
(function () {
  'use strict';
  const R6 = {};
  const LINKS = (window.IndyApps && window.IndyApps.LINKS) || {};
  const ROT = (t) => TIPO[t]?.rotulo || t;
  const EMOJI = (t) => TIPO[t]?.emoji || '✉️';
  const n0 = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
  const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const diaLongo = (iso) => { const d = new Date(`${iso}T12:00:00`); return isNaN(d) ? String(iso) : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }); };
  const hhmm = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }); };
  const fechar = '<button type="button" class="modal-close" aria-label="Fechar">×</button>';
  const erroHtml = (e) => `<p class="form-msg erro">${esc(e?.message || String(e))}</p>`;
  const APP_COR = { patio: 'bp-orange', orcador: 'bp-blue', crm: 'bp-purple' };
  const APP_NOME = { patio: 'Pátio', orcador: 'Orçador', crm: 'CRM' };

  // ======================================================================
  // INÍCIO — ligações e resultados
  // ======================================================================
  function htmlConexoes(con) {
    if (!con || con.erro || !Array.isArray(con.itens)) return `<p class="dica">Não consegui ler os outros sistemas agora${con?.erro ? `: ${esc(con.erro)}` : ''}.</p>`;
    return `<div class="r6-cons">${con.itens.map(i => `<div class="r6-con ${i.ligada ? 'on' : 'off'}" data-con="${esc(i.id)}">
        <span class="badge-pill ${APP_COR[i.app] || 'bp-gray'}">${esc(APP_NOME[i.app] || i.app)}</span>
        <b class="r6-num">${i.lido ? n0(i.valor) : '—'}</b>
        <span class="r6-rot">${esc(i.rotulo)}</span>
        <small>${i.lido ? esc(i.detalhe) : 'sem leitura agora'}</small>
        <span class="r6-liga ${i.ligada ? 'on' : 'off'}">${i.ligada ? '● usando' : '○ desligado'}</span>
      </div>`).join('')}</div>`;
  }
  function htmlFunil(res) {
    const t = res?.total;
    if (!t || !t.enviadas) return `<p class="dica">Ainda não há mensagens enviadas neste período para medir. Os números aparecem sozinhos depois das primeiras rodadas.</p>`;
    const passo = (rot, n, extra) => `<div class="r6-passo"><b>${n0(n)}</b><span>${rot}</span>${extra ? `<small>${extra}</small>` : ''}<i style="width:${Math.max(4, Math.min(100, Math.round((n / t.enviadas) * 100)))}%"></i></div>`;
    return `<div class="r6-funil">${passo('enviadas', t.enviadas)}${passo('responderam', t.responderam, pct(t.taxaResposta))}${passo('agendaram', t.agendaram)}${passo('voltaram', t.voltaram, pct(t.taxaVoltou))}
      <div class="r6-passo fat"><b>${dinheiro(t.faturou)}</b><span>faturou</span><small>${t.enviadas ? `${dinheiro(t.porMensagem)} por mensagem` : ''}</small></div></div>`;
  }
  R6.pintarInicio = async function () {
    const ancora = $('#painelSaudeWA') || $('#painelPronto');
    if (!ancora || $('#painelR6Con')) return;
    const box = document.createElement('section');
    box.className = 'panel r6-painel'; box.id = 'painelR6Con'; box.setAttribute('aria-label', 'Ligações com os outros apps e resultados');
    box.innerHTML = `<div class="panel-head"><h2>${svg(I.externo)} Ligações e resultados</h2><span class="panel-sub">o que o Pátio, o Orçador e o CRM entregam ao Comunicar</span></div>
      <div class="panel-body"><div id="r6ConCorpo"><div class="skel" style="height:96px"></div></div>
        <h3 class="r6-sub">Resultado dos últimos 30 dias <button type="button" class="btn btn-mini ghost" id="r6VerRes">${svg(I.seta)} detalhes</button></h3>
        <div id="r6ResCorpo"><div class="skel" style="height:64px"></div></div></div>`;
    ancora.insertAdjacentElement('afterend', box);
    $('#r6VerRes').addEventListener('click', () => R6.abrirResultados());
    const [con, res] = await Promise.all([api('GET', '/conexoes').catch(e => ({ erro: e.message })), api('GET', '/resultados').catch(e => ({ erro: e.message }))]);
    if (!$('#r6ConCorpo')) return;
    $('#r6ConCorpo').innerHTML = htmlConexoes(con);
    $('#r6ResCorpo').innerHTML = res?.erro ? erroHtml({ message: res.erro }) : htmlFunil(res);
  };

  // ======================================================================
  // MENSAGENS — botões na barra e em cada mensagem da fila
  // ======================================================================
  R6.barraMensagens = function () {
    const dir = $('.toolbar .right', view);
    if (!dir || $('#r6Agenda')) return;
    dir.insertAdjacentHTML('afterbegin', `<button type="button" class="btn btn-mini" id="r6Agenda" title="O que sai em cada dia e hora, com o limite por dia">${svg(I.calendar)} Agenda de envios</button>
      <button type="button" class="btn btn-mini" id="r6Resultados" title="Respondeu, agendou, voltou e faturou">📊 Resultados</button>
      ${pode('rodar') ? `<button type="button" class="btn btn-mini" id="r6Simular" title="O que o carteiro faria AGORA, sem enviar nada">${svg(I.olho)} Simular rodada</button>` : ''}`);
    $('#r6Agenda').addEventListener('click', () => R6.abrirAgenda());
    $('#r6Resultados').addEventListener('click', () => R6.abrirResultados());
    $('#r6Simular')?.addEventListener('click', () => R6.abrirSimulacao());
  };
  /** Botões extras do cartão da mensagem. */
  R6.botoesEnvio = function (e, meu) {
    const id = esc(e.id);
    if (e.status === 'pendente') {
      return `<button type="button" class="btn btn-mini ghost" data-r6-porque="${id}" title="Mostra o que está segurando esta mensagem">${svg(I.olho)} Por que não saiu?</button>`
        + (meu ? `<button type="button" class="btn btn-mini ghost" data-r6-adiar="${id}" data-r6-exp="${esc(e.expira_em || '')}">${svg(I.clock)} Adiar</button>` : '');
    }
    if (e.intencao === 'quer_orcamento') {
      const href = LINKS.novoOrcamento?.({ cliente_id: e.cliente_id, telefone: e.telefone, nome: e.nome });
      if (href) return `<a class="btn btn-mini primary" href="${esc(href)}" target="_blank" rel="noopener" title="Abre a cotação nova no Orçador já com o cliente">${svg(I.money)} Criar orçamento</a>`;
    }
    return '';
  };
  /** Ficha do cliente: o que ainda vai sair para ele, com "Por que não saiu?" e "Adiar". */
  R6.htmlProgramadas = function (lista) {
    if (!Array.isArray(lista) || !lista.length) return '';
    return `<div class="g-sec r6-programadas"><h4>Na fila para este cliente <small>${plural(lista.length, 'mensagem', 'mensagens')}</small></h4>${lista.map(e => `<div class="mini-envio"><div class="m-top"><span>${EMOJI(e.tipo)} ${esc(ROT(e.tipo))} · sai ${esc(dataHoraBR(e.enviar_em))}</span></div>
      <div class="m-corpo">${esc(e.corpo)}</div>${e.motivo_pulado ? `<small class="r6-motivo">⏭ ${esc(e.motivo_pulado)}</small>` : ''}
      <div class="r6-acoes">${R6.botoesEnvio({ id: e.id, status: 'pendente', expira_em: e.expira_em }, pode('cancelar_qualquer'))}</div></div>`).join('')}</div>`;
  };
  document.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-r6-porque]'); if (p) { R6.abrirPorque(p.dataset.r6Porque); return; }
    const a = ev.target.closest('[data-r6-adiar]'); if (a) R6.abrirAdiar(a.dataset.r6Adiar, a.dataset.r6Exp);
  });

  // ---- por que não saiu --------------------------------------------------
  const ICONE_PASSO = { ok: '✅', espera: '⏳', bloqueio: '⛔', info: 'ℹ️' };
  R6.abrirPorque = async function (id, { voltar = null } = {}) {
    openModal(`<div class="modal-head"><h3>${svg(I.olho)} Por que esta mensagem não saiu?</h3>${fechar}</div>
      <div class="modal-body" id="r6PqCorpo"><div class="skel" style="height:140px"></div></div>
      <div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`);
    let r; try { r = await api('GET', `/envios/${encodeURIComponent(id)}/porque`); } catch (e) { $('#r6PqCorpo').innerHTML = erroHtml(e); return; }
    const e = r.envio || {};
    const cls = r.bloqueios ? 'bloq' : r.esperas ? 'espera' : 'ok';
    $('#r6PqCorpo').innerHTML = `<div class="cli-escolhido"><span><b>${esc(e.nome || 'Cliente')}</b><small>${EMOJI(e.tipo)} ${esc(ROT(e.tipo))}${r.quando ? ` · programada para ${esc(dataHoraBR(r.quando))}` : ''}</small></span></div>
      <div class="r6-veredito ${cls}">${esc(r.resumo || '')}</div>
      <ol class="r6-passos">${(r.passos || []).map(p => `<li class="n-${esc(p.nivel)}"><span aria-hidden="true">${ICONE_PASSO[p.nivel] || '•'}</span><span>${esc(p.texto)}</span></li>`).join('')}</ol>
      <p class="dica">Isto é a mesma conta que o carteiro faz na hora de enviar — se algo mudar (cliente respondeu, WhatsApp voltou), a conclusão muda junto.</p>`;
  };

  // ---- adiar --------------------------------------------------------------
  R6.abrirAdiar = function (id, expira, depois) {
    const h = hojeSP();
    const manha = (n) => new Date(`${somaDias(h, n)}T09:30:00-03:00`);
    const opcoes = [
      ['Em 1 hora', new Date(Date.now() + 3600000)],
      ['Amanhã às 9h30', manha(1)],
      ['Em 2 dias às 9h30', manha(2)],
      ['Na semana que vem às 9h30', manha(7)],
    ].filter(([, d]) => !expira || d.getTime() <= Date.parse(expira));
    openModal(`<div class="modal-head"><h3>${svg(I.clock)} Adiar esta mensagem</h3>${fechar}</div>
      <div class="modal-body">
        <p class="dica">Só muda o horário — a mensagem continua na fila e respeita a janela, os limites e o PARAR.${expira ? ` Ela perde a validade em ${esc(dataHoraBR(expira))}.` : ''}</p>
        <div class="r6-adiar-op">${opcoes.map(([r, d], i) => `<button type="button" class="btn" data-r6-quando="${esc(d.toISOString())}">${esc(r)}</button>`).join('') || '<p class="form-msg erro">Não há horário possível antes da validade desta mensagem.</p>'}</div>
        <div class="field"><label for="r6Data">Ou escolha o dia e a hora</label><input id="r6Data" type="datetime-local" class="inp"></div>
        <p class="form-msg erro" id="r6AdiarErro" hidden></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="r6AdiarOk">${svg(I.check)} Adiar para a data escolhida</button></div>`);
    const enviar = async (iso, btn) => {
      const erro = $('#r6AdiarErro'); erro.hidden = true;
      if (btn) btn.disabled = true;
      try {
        await api('POST', `/envios/${encodeURIComponent(id)}/adiar`, { enviar_em: iso });
        closeModal(); toast('Horário mudado — ela continua na fila.');
        if (depois) depois(); else if (state.route === 'mensagens') route(null, { quieto: true });
      } catch (e) { erro.textContent = e.message; erro.hidden = false; if (btn) btn.disabled = false; }
    };
    $$('[data-r6-quando]', modal).forEach(b => b.addEventListener('click', () => enviar(b.dataset.r6Quando, b)));
    $('#r6AdiarOk').addEventListener('click', (ev) => {
      const v = $('#r6Data').value; if (!v) { const er = $('#r6AdiarErro'); er.textContent = 'Escolha o dia e a hora.'; er.hidden = false; return; }
      enviar(new Date(v).toISOString(), ev.currentTarget);
    });
  };

  // ---- agenda de envios ---------------------------------------------------
  R6.abrirAgenda = async function () {
    openModal(`<div class="modal-head"><h3>${svg(I.calendar)} Agenda de envios</h3>${fechar}</div>
      <div class="modal-body" id="r6AgCorpo"><div class="skel" style="height:180px"></div></div>
      <div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    let a; try { a = await api('GET', '/agenda'); } catch (e) { $('#r6AgCorpo').innerHTML = erroHtml(e); return; }
    if (!$('#r6AgCorpo')) return;
    const cfg = a.cfg || {};
    const dias = a.dias || [];
    const topo = `<div class="r6-ag-topo"><span class="badge-pill bp-gray">${plural(a.total, 'mensagem na fila', 'mensagens na fila')}</span>
        ${a.atrasadas ? `<span class="badge-pill bp-orange" title="Programadas há mais de 2 horas e ainda não saíram">${plural(a.atrasadas, 'atrasada', 'atrasadas')}</span>` : ''}
        <span class="badge-pill bp-gray">teto de ${n0(cfg.limite_por_dia || a.limite)} por dia</span>
        <span class="badge-pill bp-gray">campanhas saem às ${esc(cfg.hora_envio || '09:30')}</span></div>${a.cortada ? `<p class="form-msg erro">A fila é maior que ${n0(a.limiteLeitura)} mensagens: os dias mais distantes não aparecem aqui. As contagens são das primeiras ${n0(a.limiteLeitura)}.</p>` : ''}`;
    if (!dias.length) { $('#r6AgCorpo').innerHTML = topo + vazio(I.calendar, 'Nada programado', 'Quando as réguas e campanhas colocarem mensagens na fila, elas aparecem aqui por dia.'); return; }
    const linhaTipos = (d) => Object.entries(d.porTipo || {}).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<span class="chip">${EMOJI(t)} ${esc(ROT(t))} · ${n}</span>`).join('');
    $('#r6AgCorpo').innerHTML = topo + `<div class="r6-dias">${dias.map((d, i) => {
      const larg = Math.min(100, Math.round((d.total / (d.limite || 300)) * 100));
      const avisos = [
        d.domingo && !cfg.envia_domingo ? '<span class="badge-pill bp-orange">domingo: não envia</span>' : '',
        d.feriado ? `<span class="badge-pill bp-orange">feriado: ${esc(d.feriado)}</span>` : '',
        d.excede ? `<span class="badge-pill bp-red">passa do teto: o resto sai no dia seguinte</span>` : '',
        d.atrasadas ? `<span class="badge-pill bp-orange">${d.atrasadas} atrasada(s)</span>` : '',
      ].join('');
      return `<details class="r6-dia${d.excede ? ' excede' : ''}"${i === 0 ? ' open' : ''}>
        <summary><span class="r6-dia-nome">${esc(rotuloDia(d.data) === dataBR(d.data) ? diaLongo(d.data) : `${rotuloDia(d.data)} · ${dataCurta(d.data)}`)}</span>
          <b>${plural(d.total, 'mensagem', 'mensagens')}</b><span class="r6-barra" aria-hidden="true"><i style="width:${larg}%"></i></span></summary>
        <div class="r6-dia-corpo">${avisos ? `<div class="r6-avisos">${avisos}</div>` : ''}<div class="r6-tipos">${linhaTipos(d)}</div>${pode('cancelar_qualquer') && d.total ? `<div class="r6-dia-acoes"><button type="button" class="btn btn-mini ghost" data-r6-adiar-dia="${esc(d.data)}" data-r6-dia-qtd="${d.total}">${svg(I.clock)} Adiar o dia todo</button></div>` : ''}
          <ul class="r6-itens">${(d.itens || []).map(it => `<li><span class="r6-hora">${esc(hhmm(it.enviar_em))}</span><span class="r6-it-txt"><b>${EMOJI(it.tipo)} ${esc(it.nome || telBR(it.telefone))}</b><small>${esc(it.corpo)}</small>${it.motivo_pulado ? `<small class="r6-motivo">⏭ ${esc(it.motivo_pulado)}</small>` : ''}</span>
            <span class="r6-it-acoes"><button type="button" class="btn btn-mini ghost" data-r6-porque="${esc(it.id)}">${svg(I.olho)} Por quê</button>${pode('cancelar_qualquer') ? `<button type="button" class="btn btn-mini ghost" data-r6-adiar-ag="${esc(it.id)}">${svg(I.clock)} Adiar</button>` : ''}</span></li>`).join('')}</ul>
          ${d.total > (d.itens || []).length ? `<small class="muted">mostrando as ${(d.itens || []).length} primeiras de ${d.total}</small>` : ''}</div></details>`;
    }).join('')}</div>`;
    $$('[data-r6-adiar-ag]', modal).forEach(b => b.addEventListener('click', () => R6.abrirAdiar(b.dataset.r6AdiarAg, '', () => R6.abrirAgenda())));
    $$('[data-r6-adiar-dia]', modal).forEach(b => b.addEventListener('click', () => R6.abrirAdiarDia(b.dataset.r6AdiarDia, Number(b.dataset.r6DiaQtd) || 0)));
  };

  // ---- adiar o dia inteiro (gestor) ----------------------------------------
  R6.abrirAdiarDia = function (dia, qtd) {
    const h = hojeSP();
    const base = dia > h ? dia : h;
    const manha = (n) => new Date(`${somaDias(base, n)}T09:30:00-03:00`);
    const opcoes = [['Amanhã às 9h30', manha(1)], ['Em 2 dias às 9h30', manha(2)], ['Na semana que vem às 9h30', manha(7)]];
    openModal(`<div class="modal-head"><h3>${svg(I.clock)} Adiar o dia todo</h3>${fechar}</div>
      <div class="modal-body">
        <p class="dica">As ${plural(qtd, 'mensagem', 'mensagens')} de ${esc(dataBR(dia))} que ainda não saíram vão para o novo horário. A que passaria da validade fica onde está, e tudo continua respeitando a janela, os limites e o PARAR.</p>
        <div class="r6-adiar-op">${opcoes.map(([r, d]) => `<button type="button" class="btn" data-r6-quando="${esc(d.toISOString())}">${esc(r)}</button>`).join('')}</div>
        <div class="field"><label for="r6DataDia">Ou escolha o dia e a hora</label><input id="r6DataDia" type="datetime-local" class="inp"></div>
        <p class="form-msg erro" id="r6AdiarDiaErro" hidden></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="r6AdiarDiaOk">${svg(I.check)} Adiar para a data escolhida</button></div>`);
    const enviar = async (iso, btn) => {
      const erro = $('#r6AdiarDiaErro'); erro.hidden = true;
      if (btn) btn.disabled = true;
      try {
        const r = await api('POST', '/agenda/adiar-dia', { dia, enviar_em: iso });
        closeModal(); toast(r.aviso ? `${plural(r.adiadas, 'mensagem adiada', 'mensagens adiadas')}. ${r.aviso}` : `${plural(r.adiadas, 'mensagem adiada', 'mensagens adiadas')}.`);
        R6.abrirAgenda();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; if (btn) btn.disabled = false; }
    };
    $$('[data-r6-quando]', modal).forEach(b => b.addEventListener('click', () => enviar(b.dataset.r6Quando, b)));
    $('#r6AdiarDiaOk').addEventListener('click', (ev) => {
      const v = $('#r6DataDia').value; if (!v) { const er = $('#r6AdiarDiaErro'); er.textContent = 'Escolha o dia e a hora.'; er.hidden = false; return; }
      enviar(new Date(v).toISOString(), ev.currentTarget);
    });
  };

  // ---- simular a rodada ---------------------------------------------------
  R6.abrirSimulacao = async function () {
    openModal(`<div class="modal-head"><h3>${svg(I.olho)} Simular a rodada do carteiro</h3>${fechar}</div>
      <div class="modal-body" id="r6SimCorpo"><div class="skel" style="height:160px"></div></div>
      <div class="modal-foot"><button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    let s; try { s = await api('POST', '/rodada/simular', {}); } catch (e) { $('#r6SimCorpo').innerHTML = erroHtml(e); return; }
    if (!$('#r6SimCorpo')) return;
    const lista = (titulo, itens, fmt, vazioTxt) => `<section class="r6-sim-bloco"><h4>${titulo} <span class="badge-pill bp-gray">${(itens || []).length}</span></h4>
      ${(itens || []).length ? `<ul class="r6-itens">${itens.slice(0, 40).map(fmt).join('')}</ul>${itens.length > 40 ? `<small class="muted">e mais ${itens.length - 40}…</small>` : ''}` : `<p class="muted">${esc(vazioTxt)}</p>`}</section>`;
    const quem = (x) => `<b>${EMOJI(x.tipo)} ${esc(x.nome || telBR(x.telefone))}</b>`;
    $('#r6SimCorpo').innerHTML = `<div class="r6-veredito ${s.bloqueado ? 'bloq' : 'ok'}">${s.bloqueado ? esc(s.aviso || 'O carteiro não envia nada agora.') : `Se o carteiro rodasse agora, ${plural((s.enviaria || []).length, 'mensagem sairia', 'mensagens sairiam')}.`}</div>
      <p class="dica">Nada foi enviado, reservado ou gravado: é só a conta do carteiro, feita agora, com os dados de agora.</p>
      ${s.retomada ? `<p class="dica">🐢 Retomada gradual: ${esc(s.retomada.motivo || '')} (limite desta rodada: ${n0(s.retomada.limite)}).</p>` : ''}
      ${lista('✅ Sairiam', s.enviaria, x => `<li><span class="r6-it-txt">${quem(x)}<small>${esc(String(x.corpo || '').slice(0, 140))}</small></span></li>`, 'Nenhuma mensagem sairia agora.')}
      ${lista('⏭ Seriam puladas', s.pularia, x => `<li><span class="r6-it-txt">${quem(x)}<small class="r6-motivo">${esc(x.motivo)}</small></span></li>`, 'Nenhuma seria pulada.')}
      ${lista('⏳ Seriam adiadas', s.adiaria, x => `<li><span class="r6-it-txt">${quem(x)}<small class="r6-motivo">${esc(x.motivo)}${x.quando ? ` · para ${esc(dataHoraBR(x.quando))}` : ''}</small></span></li>`, 'Nenhuma seria adiada.')}
      ${(s.reagendaria || []).length || (s.atualizaria || []).length ? lista('🔄 Reagendadas ou atualizadas', [...(s.reagendaria || []), ...(s.atualizaria || [])], x => `<li><span class="r6-it-txt">${quem(x)}<small class="r6-motivo">${esc(x.motivo || (x.campos || []).join(', '))}</small></span></li>`, '') : ''}`;
  };

  // ---- resultados ---------------------------------------------------------
  R6.abrirResultados = async function (opts = {}) {
    const h = hojeSP();
    const f = { de: opts.de || somaDias(h, -30), ate: opts.ate || h, regua: opts.regua || 'todas' };
    openModal(`<div class="modal-head"><h3>📊 Resultados das mensagens</h3>${fechar}</div>
      <div class="modal-body">
        <div class="campos-linha rel-filtros">
          <div class="field"><label for="r6ResRegua">Tipo</label><select id="r6ResRegua"><option value="todas">Todos</option>${[...REGUAS, 'campanha', 'avulsa', 'remarcacao', ...TIPOS_PATIO].map(t => `<option value="${esc(t)}" ${f.regua === t ? 'selected' : ''}>${EMOJI(t)} ${esc(ROT(t))}</option>`).join('')}</select></div>
          <div class="field curto"><label for="r6ResDe">De</label><input type="date" id="r6ResDe" class="inp" value="${esc(f.de)}"></div>
          <div class="field curto"><label for="r6ResAte">Até</label><input type="date" id="r6ResAte" class="inp" value="${esc(f.ate)}"></div>
        </div>
        <div id="r6ResModal"><div class="skel" style="height:220px"></div></div>
      </div>
      <div class="modal-foot">${pode('exportar') ? `<button type="button" class="btn" id="r6ResCsv">${svg(I.upload)} Baixar planilha</button>` : ''}<button type="button" class="btn primary" data-fechar>Fechar</button></div>`, { larga: true });
    const consulta = () => { const q = new URLSearchParams(); if (f.de) q.set('de', f.de); if (f.ate) q.set('ate', f.ate); if (f.regua !== 'todas') q.set('regua', f.regua); return q; };
    const csv = $('#r6ResCsv');
    if (csv) csv.addEventListener('click', async () => {
      f.regua = $('#r6ResRegua').value; f.de = $('#r6ResDe').value; f.ate = $('#r6ResAte').value;
      if (f.de && f.ate && f.de > f.ate) { toast('O "de" precisa vir antes do "até".'); return; }
      csv.disabled = true;
      try {
        const r = await fetch(API + '/resultados.csv?' + consulta(), { headers: await authCabecalhos() });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || 'Não deu para exportar.'); }
        const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `comunicar-resultados-${hojeSP()}.csv`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Planilha baixada — abre direto no Excel.');
      } catch (e) { toast(e.message); } finally { csv.disabled = false; }
    });
    const carregar = async () => {
      const caixa = $('#r6ResModal'); if (!caixa) return;
      f.regua = $('#r6ResRegua').value; f.de = $('#r6ResDe').value; f.ate = $('#r6ResAte').value;
      if (f.de && f.ate && f.de > f.ate) { caixa.innerHTML = '<p class="form-msg erro">O "de" precisa vir antes do "até".</p>'; return; }
      caixa.innerHTML = '<div class="skel" style="height:220px"></div>';
      const q = consulta(); q.set('detalhe', '1');
      let r; try { r = await api('GET', '/resultados?' + q); } catch (e) { caixa.innerHTML = erroHtml(e); return; }
      if (!$('#r6ResModal')) return;
      const tipos = Object.entries(r.porTipo || {}).sort((a, b) => b[1].enviadas - a[1].enviadas);
      const lotes = Object.entries(r.porLote || {}).sort((a, b) => String(b[1].quando || '').localeCompare(String(a[1].quando || ''))).slice(0, 15);
      const linha = (rot, s, sub) => `<div class="r6-res-linha"><div class="r6-res-nome"><b>${rot}</b>${sub ? `<small>${sub}</small>` : ''}</div>
        <div class="r6-res-nums"><span><b>${n0(s.enviadas)}</b>enviadas</span><span><b>${n0(s.responderam)}</b>responderam${s.taxaResposta != null ? ` <i>${s.taxaResposta}%</i>` : ''}</span><span><b>${n0(s.agendaram)}</b>agendaram</span><span><b>${n0(s.voltaram)}</b>voltaram${s.taxaVoltou != null ? ` <i>${s.taxaVoltou}%</i>` : ''}</span><span class="fat"><b>${dinheiro(s.faturou)}</b>faturou</span></div></div>`;
      caixa.innerHTML = `${htmlFunil(r)}
        ${tipos.length ? `<h4 class="r6-sub">Por tipo de mensagem</h4>${tipos.map(([t, s]) => linha(`${EMOJI(t)} ${esc(ROT(t))}`, s)).join('')}` : ''}
        ${lotes.length ? `<h4 class="r6-sub">Por campanha</h4>${lotes.map(([l, s]) => linha(`${EMOJI(s.tipo || 'campanha')} ${s.quando ? esc(dataBR(diaSP(s.quando))) : 'campanha'}`, s, esc(s.texto || ''))).join('')}` : ''}
        ${(r.quemVoltou || []).length ? `<h4 class="r6-sub">Quem voltou${r.quantosVoltaram > r.quemVoltou.length ? ` (${n0(r.quemVoltou.length)} de ${n0(r.quantosVoltaram)})` : ''}</h4><ul class="r6-itens">${r.quemVoltou.map(l => `<li><span class="r6-hora">${esc(dataCurta(diaSP(l.enviado_em)))}</span><span class="r6-it-txt"><b>${EMOJI(l.tipo)} ${esc(l.nome || telBR(l.telefone))}</b><small>${esc(ROT(l.tipo))}${l.aprovou ? ' · orçamento aprovado' : ''}${l.faturou ? ` · ${esc(dinheiro(l.faturou))}` : ''}</small></span></li>`).join('')}</ul>` : ''}
        <details class="r6-regra"><summary>Como contamos</summary><p>${esc(r.regra || '')}</p><p>Mensagens de teste não entram. "Voltaram" conta visita na Agenda, carro no Pátio, orçamento aprovado ou serviço pago.</p></details>`;
      window.R7?.pintarResultados(caixa, f);
    };
    $('#r6ResRegua').addEventListener('change', carregar);
    $('#r6ResDe').addEventListener('change', carregar);
    $('#r6ResAte').addEventListener('change', carregar);
    carregar();
  };

  // ======================================================================
  // CAMPANHAS — resultado de cada campanha no histórico
  // ======================================================================
  R6.pintarCampanhas = async function () {
    const artigos = $$('.camp[data-lote]', view); if (!artigos.length) return;
    const h = hojeSP();
    let r; try { r = await api('GET', `/resultados?de=${somaDias(h, -90)}&ate=${h}&regua=campanha`); } catch { return; }
    for (const a of artigos) {
      const s = r.porLote?.[a.dataset.lote]; const alvo = $('.camp-nums', a);
      if (!s || !alvo || $('.r6-camp-res', a)) continue;
      alvo.insertAdjacentHTML('beforeend', `<div class="r6-camp-res" title="Visita, carro no Pátio, orçamento aprovado ou serviço pago depois da mensagem"><b>${n0(s.voltaram)}</b><small>voltaram${s.faturou ? ` · ${esc(dinheiro(s.faturou))}` : ''}</small></div>`);
    }
  };

  // ======================================================================
  // RÉGUAS — ligações novas, anti-spam e textos
  // ======================================================================
  const TEXTOS = {
    msg_orcador_novisto: { rotulo: 'Orçamento do Orçador · cliente nem abriu', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'link_orcamento'], obrig: 'link_orcamento' },
    msg_orcador_visto: { rotulo: 'Orçamento do Orçador · cliente abriu e não decidiu', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'link_orcamento'], obrig: 'link_orcamento' },
    msg_extra_lembrete: { rotulo: 'Lembrete do extra esperando o OK', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'itens', 'link_os'], obrig: 'link_os' },
  };
  const EXEMPLO6 = { link_orcamento: 'https://indycar-orcador.netlify.app/#/o/…', link_os: `${PATIO_URL}/acompanhar/?t=…`, itens: '2 itens (pastilha de freio e disco)', servico: 'freios' };
  const INTERRUPTORES = [
    { campo: 'usa_patio_posvenda', titulo: 'Pós-venda pelo Pátio', desc: 'Carro entregue no Pátio (mesmo sem horário na Agenda) recebe o "ficou tudo certo?". Nota 4–5 no Pátio vai direto ao convite do Google; nota 1–3 fica para a equipe.' },
    { campo: 'usa_patio_revisao', titulo: 'Revisão pelo histórico do Pátio', desc: 'O prazo do serviço entregue no Pátio também gera o convite de revisão (um convite por cliente, somando Agenda e Pátio).' },
    { campo: 'usa_orcador', titulo: 'Lembrete de orçamento do Orçador', desc: 'Orçamento enviado e sem decisão vira lembrete com o link do orçamento; quem abriu e quem nem abriu recebem textos diferentes. Usa a régua "Orçamento parado".' },
    { campo: 'ativo_extra_lembrete', titulo: 'Lembrete do extra esperando o OK', desc: 'Depois do aviso do Pátio, um lembrete com o link de acompanhar. Respeita o "avisar extra" do próprio Pátio.', numero: { campo: 'horas_extra_lembrete', antes: 'depois de', depois: 'horas sem resposta', min: 1, max: 48 } },
  ];
  const ANTISPAM = [
    { campo: 'bloquear_com_carro_na_oficina', titulo: 'Esperar enquanto o carro está na oficina', desc: 'Aniversário, reativação, revisão e orçamento não chegam com o carro do cliente dentro do Pátio.' },
    { campo: 'bloquear_com_reclamacao', titulo: 'Esperar enquanto há reclamação sem resolver', desc: 'Resposta negativa recente com tarefa aberta segura as mensagens automáticas de relacionamento.', numero: { campo: 'dias_reclamacao_aberta', antes: 'olhar os últimos', depois: 'dias', min: 1, max: 60 } },
    { campo: 'bloquear_com_orcamento_aberto', titulo: 'Esperar enquanto há orçamento aberto', desc: 'Reativação ("sumiu") e "não fechou" esperam enquanto o cliente tem orçamento enviado e sem resposta no Orçador — quem está negociando fala com ele.' },
    { campo: 'retomada_gradual', titulo: 'Retomada gradual do WhatsApp', desc: 'Quando o WhatsApp volta de uma queda, a primeira meia hora sai devagar (poucas mensagens) em vez de soltar a fila inteira de uma vez.' },
  ];
  const NUMEROS = [
    { campo: 'evitar_texto_repetido_h', titulo: 'Não repetir o mesmo texto', antes: 'nas últimas', depois: 'horas (0 = desligado)', min: 0, max: 336, desc: 'O mesmo texto para o mesmo número é pulado, olhando também o que o Atendimento mandou.' },
    { campo: 'max_mensagens_cliente_dia', titulo: 'Teto de mensagens por cliente no dia', antes: 'no máximo', depois: 'mensagens automáticas por cliente por dia', min: 1, max: 10, desc: 'Passou do teto, a mensagem espera o próximo dia. Lembrete de horário e avisos do carro no Pátio não entram na conta.' },
    { campo: 'campanha_repetir_dias', titulo: 'Campanha: não repetir para quem já recebeu', antes: 'padrão de', depois: 'dias (0 = desligado)', min: 0, max: 90, desc: 'Valor sugerido na hora de criar uma campanha.' },
  ];
  R6.pintarReguas = function () {
    const grid = $('.reguas-grid', view); if (!grid || $('#painelR6Reguas')) return;
    const gestor = ehGestor();
    const v = (c) => (state.cfgEdit[c] !== undefined ? state.cfgEdit[c] : state.cfg[c]);
    const sw = (campo) => `<label class="sw"><input type="checkbox" data-r6cfg="${campo}" ${v(campo) !== false ? 'checked' : ''} ${gestor ? '' : 'disabled'} aria-label="Ligar"><span class="tr"></span><span class="sw-txt">${v(campo) !== false ? 'Ligado' : 'Desligado'}</span></label>`;
    const num = (n) => `<span class="r6-param">${esc(n.antes)} <input type="number" inputmode="numeric" min="${n.min}" max="${n.max}" step="1" value="${esc(v(n.campo))}" data-r6cfg="${n.campo}" class="inp" aria-label="${esc(`${n.antes} ${n.depois}`)}" ${gestor ? '' : 'disabled'}> ${esc(n.depois)}</span>`;
    const item = (i) => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${esc(i.titulo)}</b><p>${esc(i.desc)}</p>${i.numero ? num(i.numero) : ''}</div>${i.campo ? sw(i.campo) : ''}</div>`;
    const caixa = document.createElement('section');
    caixa.className = 'panel r6-painel'; caixa.id = 'painelR6Reguas';
    caixa.innerHTML = `<div class="panel-head"><h2>${svg(I.externo)} Ligações com Pátio e Orçador</h2><span class="panel-sub">o que os outros sistemas disparam aqui</span></div>
      <div class="panel-body">${INTERRUPTORES.map(item).join('')}
        <h3 class="r6-sub">Cuidado com o cliente</h3>
        ${ANTISPAM.map(item).join('')}
        ${NUMEROS.map(n => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${esc(n.titulo)}</b><p>${esc(n.desc)}</p>${num(n)}</div></div>`).join('')}
        <h3 class="r6-sub">Textos novos</h3>
        ${Object.entries(TEXTOS).map(([campo, t]) => `<div class="field r6-texto"><label for="r6t_${campo}">${esc(t.rotulo)}</label>
            <textarea id="r6t_${campo}" maxlength="1000" data-r6cfg="${campo}" ${gestor ? '' : 'disabled'}>${esc(v(campo))}</textarea>
            <div class="var-chips">${t.vars.map(x => `<button type="button" class="var-chip${x === t.obrig ? ' link' : ''}" data-r6var="${esc(x)}" data-r6alvo="r6t_${campo}" ${gestor ? '' : 'disabled'}>{${esc(x)}}</button>`).join('')}</div>
            <small class="r6-erro-texto" id="r6e_${campo}" hidden></small>
            <div class="previa"><small>Prévia</small>${celularWA(`<div class="bolha wa-rec" id="r6b_${campo}"></div>`, { mini: true })}</div></div>`).join('')}
      </div>`;
    grid.insertAdjacentElement('beforebegin', caixa);

    const validarTexto = (campo) => {
      const t = TEXTOS[campo], valor = String($(`#r6t_${campo}`).value);
      const usadas = [...valor.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      const desconhecida = usadas.find(x => !t.vars.includes(x));
      let msg = '';
      if (valor.trim().length < 10) msg = 'Escreva pelo menos uma frase.';
      else if (desconhecida) msg = `A variável {${desconhecida}} não existe neste texto.`;
      else if (!usadas.includes(t.obrig)) msg = `O texto precisa ter {${t.obrig}} — sem o link o cliente não consegue abrir.`;
      const e = $(`#r6e_${campo}`); e.textContent = msg; e.hidden = !msg;
      $(`#r6t_${campo}`).classList.toggle('invalido', !!msg);
      return !msg;
    };
    const pintar = (campo) => {
      const ta = $(`#r6t_${campo}`);
      pintarBolha($(`#r6b_${campo}`), renderTemplate(ta.value, { ...EXEMPLO, ...EXEMPLO6 }), state.cfgEdit.hora_envio || state.cfg.hora_envio || '09:30', 'Escreva o texto para ver a prévia.');
    };
    $$('[data-r6cfg]', caixa).forEach(el => {
      const campo = el.dataset.r6cfg, ehTexto = campo in TEXTOS;
      if (ehTexto) pintar(campo);
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        let novo = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
        if (el.type === 'number') { const n = Number(el.value); el.classList.toggle('invalido', el.value === '' || n < Number(el.min) || n > Number(el.max) || !Number.isInteger(n)); }
        if (ehTexto) { validarTexto(campo); pintar(campo); }
        if (String(novo) === String(state.cfg[campo] ?? '')) delete state.cfgEdit[campo]; else state.cfgEdit[campo] = novo;
        if (el.type === 'checkbox') $('.sw-txt', el.closest('.sw')).textContent = novo ? 'Ligado' : 'Desligado';
        atualizarBarra();
      });
    });
    $$('[data-r6var]', caixa).forEach(b => b.addEventListener('click', () => {
      const ta = $('#' + b.dataset.r6alvo); if (!ta || ta.disabled) return;
      const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini, tok = `{${b.dataset.r6var}}`;
      ta.value = ta.value.slice(0, ini) + tok + ta.value.slice(fim); ta.focus(); ta.setSelectionRange(ini + tok.length, ini + tok.length);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }));
  };

  // ======================================================================
  // CAMPANHAS — passo 3: prévia exata, "não repetir" e link de fora
  // ======================================================================
  /** Monta o corpo do pedido igual ao do envio final (sem a data). */
  function corpoDoPedido(c, segmentos) {
    const corpo = c.corpo.trim();
    if (c.alvo === 'cliente') return { corpo, destinos: [{ cliente_id: c.cliente.id, telefone: c.cliente.telefone, nome: c.cliente.nome, carro: c.cliente.carro, placa: c.cliente.placa }] };
    return { corpo, segmento: { filtro: c.filtro, valor: c.valor || segmentos.find(s => s.id === c.filtro)?.valor } };
  }
  R6.pintarPasso3 = function (c, { segmentos, corpoEl }) {
    const box = document.createElement('div');
    box.className = 'r6-passo3'; box.id = 'r6Passo3';
    const padrao = Number(state.cfg?.campanha_repetir_dias ?? 14);
    if (c.evitarDias === undefined) c.evitarDias = c.alvo === 'segmento' ? padrao : 0;
    box.innerHTML = `${c.alvo === 'segmento' ? `<label class="r6-evitar"><input type="checkbox" id="r6Evitar" ${c.evitarDias > 0 ? 'checked' : ''}> <span>Não repetir para quem já recebeu campanha nos últimos <input type="number" id="r6EvitarDias" class="inp" min="1" max="90" value="${esc(c.evitarDias || padrao || 14)}"> dias</span></label>` : ''}
      <div id="r6Linkfora"></div>
      <div id="r6Exata" aria-live="polite"><div class="skel" style="height:72px"></div></div>`;
    corpoEl.appendChild(box);
    const carregar = debounce(async () => {
      const cx = $('#r6Exata'); if (!cx) return;
      cx.innerHTML = '<div class="skel" style="height:72px"></div>';
      const ev = $('#r6Evitar')?.checked ? Math.min(Math.max(Number($('#r6EvitarDias').value) || 14, 1), 90) : 0;
      c.evitarDias = ev;
      let r; try { r = await api('POST', '/campanhas/previa', { ...corpoDoPedido(c, segmentos), evitar_dias: ev, enviar_em: c.quando === 'data' && c.enviar_em ? new Date(c.enviar_em).toISOString() : undefined }); }
      catch (e) { cx.innerHTML = erroHtml(e); return; }
      if (!$('#r6Exata')) return;
      c.linksFora = r.linksForaDaCasa || [];
      const lf = $('#r6Linkfora');
      lf.innerHTML = c.linksFora.length ? `<div class="r6-linkfora" role="alert"><b>${svg(I.alerta)} Link de fora da IndyCar no texto</b>
          <p>${c.linksFora.map(l => `<code>${esc(l)}</code>`).join(' ')}</p>
          ${ehGestor() ? `<label class="r6-evitar"><input type="checkbox" id="r6ConfirmaLink" ${c.confirmarLinks ? 'checked' : ''}> <span>Conheço este link e quero enviar mesmo assim</span></label>` : '<p>Só o gestor pode enviar mensagem com link de fora (risco de golpe e de bloqueio do número). Troque o link ou peça ao gestor.</p>'}</div>` : '';
      $('#r6ConfirmaLink')?.addEventListener('change', (e) => { c.confirmarLinks = e.target.checked; });
      if (!c.linksFora.length) c.confirmarLinks = false;
      const pul = r.puladosDetalhe || {};
      const motivos = [pul.nao_quer ? `${pul.nao_quer} pediram para parar` : '', pul.invalido ? `${pul.invalido} sem telefone válido ou repetido` : '', pul.recente ? `${pul.recente} já receberam campanha há pouco` : '', pul.sem_link ? `${pul.sem_link} sem cadastro para o link` : ''].filter(Boolean);
      const dias = Object.entries(r.porDia || {});
      cx.innerHTML = `<div class="r6-exata"><div class="r6-exata-top"><span class="n">${n0(r.total)}</span><span>${r.total === 1 ? 'mensagem vai' : 'mensagens vão'} para a fila${r.pulados ? ` · <b>${n0(r.pulados)}</b> ficam de fora` : ''}</span></div>
        ${motivos.length ? `<small class="muted">${esc(motivos.join(' · '))}</small>` : ''}
        ${dias.length > 1 ? `<small class="muted">Escalonadas em ${dias.length} dias (teto de ${n0(r.limitePorDia)} por dia): ${esc(dias.slice(0, 5).map(([d, n]) => `${dataCurta(d)}: ${n}`).join(' · '))}${dias.length > 5 ? '…' : ''}</small>` : ''}
        <h4>Como vão sair (as primeiras linhas, já com o nome de cada um)</h4>
        <ul class="r6-linhas">${(r.linhas || []).map(l => `<li><b>${esc(l.nome || telBR(l.telefone))}</b><small>${esc(telBR(l.telefone))}</small><span>${esc(l.corpo)}</span></li>`).join('') || '<li class="muted">Ninguém recebe com estas escolhas.</li>'}</ul></div>`;
    }, 250);
    $('#r6Evitar')?.addEventListener('change', carregar);
    $('#r6EvitarDias')?.addEventListener('input', carregar);
    carregar();
  };
  /** Ajusta o pedido final (campanha) e trata o aviso de link de fora. Devolve o payload. */
  R6.completarPedido = function (c, payload) {
    if (c.evitarDias > 0) payload.evitar_dias = c.evitarDias;
    if (c.confirmarLinks) payload.confirmar_links_externos = true;
    return payload;
  };
  R6.bloqueioDeEnvio = function (c) {
    if ((c.linksFora || []).length && !ehGestor()) return 'O texto tem um link de fora da IndyCar. Só o gestor pode enviar assim: troque o link ou peça ao gestor.';
    if ((c.linksFora || []).length && !c.confirmarLinks) return 'O texto tem um link de fora da IndyCar. Marque que conhece o link para enviar mesmo assim.';
    return null;
  };

  window.R6 = R6;
})();
