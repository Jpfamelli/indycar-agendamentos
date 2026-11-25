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

  /** Ficha do cliente: o que ainda vai sair para ele e quando. */
  R6.htmlProgramadas = function (lista) {
    if (!Array.isArray(lista) || !lista.length) return '';
    return `<div class="g-sec r6-programadas"><h4>Na fila para este cliente <small>${plural(lista.length, 'mensagem', 'mensagens')}</small></h4>${lista.map(e => `<div class="mini-envio"><div class="m-top"><span>${EMOJI(e.tipo)} ${esc(ROT(e.tipo))} · ${state.envioParado ? "retida: era para" : "sai"} ${esc(dataHoraBR(e.enviar_em))}</span></div>
      <div class="m-corpo">${esc(e.corpo)}</div></div>`).join('')}</div>`;
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
  R6.pintarReguas = function (modo = 'reguas') {
    const grid = $('.reguas-grid', view); if (!grid || $('#painelR6Reguas')) return;
    const gestor = ehGestor();
    const v = (c) => (state.cfgEdit[c] !== undefined ? state.cfgEdit[c] : state.cfg[c]);
    const sw = (campo) => `<label class="sw"><input type="checkbox" data-r6cfg="${campo}" ${v(campo) !== false ? 'checked' : ''} ${gestor ? '' : 'disabled'} aria-label="Ligar"><span class="tr"></span><span class="sw-txt">${v(campo) !== false ? 'Ligado' : 'Desligado'}</span></label>`;
    const num = (n) => `<span class="r6-param">${esc(n.antes)} <input type="number" inputmode="numeric" min="${n.min}" max="${n.max}" step="1" value="${esc(v(n.campo))}" data-r6cfg="${n.campo}" class="inp" aria-label="${esc(`${n.antes} ${n.depois}`)}" ${gestor ? '' : 'disabled'}> ${esc(n.depois)}</span>`;
    const item = (i) => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${esc(i.titulo)}</b><p>${esc(i.desc)}</p>${i.numero ? num(i.numero) : ''}</div>${i.campo ? sw(i.campo) : ''}</div>`;
    const caixa = document.createElement('section');
    caixa.className = 'panel r6-painel'; caixa.id = 'painelR6Reguas';
    caixa.innerHTML = modo === 'ajustes' ? `<div class="panel-head"><h2>Cuidado com o cliente</h2></div>
      <div class="panel-body">${ANTISPAM.map(item).join('')}</div>` : `<div class="panel-head"><h2>Pátio e Orçador</h2></div>
      <div class="panel-body">${INTERRUPTORES.map(item).join('')}
        <details class="regua-editar r6-textos"><summary>Editar as mensagens do Pátio e do Orçador</summary>${Object.entries(TEXTOS).map(([campo, t]) => `<div class="field r6-texto"><label for="r6t_${campo}">${esc(t.rotulo)}</label>
            <textarea id="r6t_${campo}" maxlength="1000" data-r6cfg="${campo}" ${gestor ? '' : 'disabled'}>${esc(v(campo))}</textarea>
            <div class="var-chips">${t.vars.map(x => `<button type="button" class="var-chip${x === t.obrig ? ' link' : ''}" data-r6var="${esc(x)}" data-r6alvo="r6t_${campo}" ${gestor ? '' : 'disabled'}>{${esc(x)}}</button>`).join('')}</div>
            <small class="r6-erro-texto" id="r6e_${campo}" hidden></small>
            <div class="previa"><small>Prévia</small>${celularWA(`<div class="bolha wa-rec" id="r6b_${campo}"></div>`, { mini: true })}</div></div>`).join('')}</details>
      </div>`;
    if (modo === 'ajustes') grid.insertAdjacentElement('beforebegin', caixa); else grid.insertAdjacentElement('afterend', caixa);

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
