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
  // CAMPANHAS — Repetir, A/B, Reabordar recusados
  // ======================================================================
  R7.pintarCampanhas = async function () {
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
  R7.pintarReguas = function (modo = 'reguas') {
    const grid = $('.reguas-grid', view); if (!grid || $('#painelR7Reguas')) return;
    const gestor = ehGestor();
    const v = (c) => (state.cfgEdit[c] !== undefined ? state.cfgEdit[c] : state.cfg[c]);
    const sw = (campo) => `<label class="sw"><input type="checkbox" data-r7cfg="${campo}" ${v(campo) !== false && v(campo) !== undefined ? 'checked' : ''} ${gestor ? '' : 'disabled'} aria-label="Ligar"><span class="tr"></span><span class="sw-txt">${v(campo) !== false && v(campo) !== undefined ? 'Ligado' : 'Desligado'}</span></label>`;
    const num = (n) => `<span class="r6-param">${esc(n.antes)} <input type="number" inputmode="numeric" min="${n.min}" max="${n.max}" step="1" value="${esc(v(n.campo) ?? '')}" data-r7cfg="${n.campo}" class="inp" aria-label="${esc(n.titulo)}" ${gestor ? '' : 'disabled'}> ${esc(n.depois)}</span>`;
    const caixa = document.createElement('section');
    caixa.className = 'panel r6-painel r7-painel'; caixa.id = 'painelR7Reguas';
    caixa.innerHTML = modo === 'ajustes' ? `<div class="panel-head"><h2>Rodapé PARAR</h2></div>
      <div class="panel-body">${ANTI.map((i) => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${esc(i.titulo)}</b><p>${esc(i.desc)}</p></div>${sw(i.campo)}</div>`).join('')}
        <div class="field r6-texto"><label for="r7t_texto_rodape_parar">Frase do rodapé</label><input id="r7t_texto_rodape_parar" class="inp" maxlength="140" data-r7cfg="texto_rodape_parar" value="${esc(v('texto_rodape_parar') ?? '')}" ${gestor ? '' : 'disabled'}><small class="r6-erro-texto" id="r7e_texto_rodape_parar" hidden></small></div>
      </div>` : `<div class="panel-head"><h2>Avisos de outros apps</h2></div>
      <div class="panel-body">${EVENTOS.map((e) => `<div class="r6-cfg-item"><div class="r6-cfg-txt"><b>${e.emoji} ${esc(e.rotulo)}</b><p>${esc(e.desc)}</p>${num({ ...e.param, titulo: e.rotulo })}</div>${sw(e.campo)}</div>
          <div class="previa r7-previa">${celularWA(`<div class="bolha wa-rec" data-r7previa="${e.texto}"></div>`, { mini: true })}</div>
          <details class="regua-editar r7-editar"><summary>Editar mensagem</summary><div class="field r6-texto"><label for="r7t_${e.texto}">Texto: ${esc(e.rotulo)}</label><textarea id="r7t_${e.texto}" maxlength="1000" data-r7cfg="${e.texto}" ${gestor ? '' : 'disabled'}>${esc(v(e.texto) ?? '')}</textarea>
            <div class="var-chips">${e.vars.map((x) => `<button type="button" class="var-chip${x === e.obrig ? ' link' : ''}" data-r7var="${esc(x)}" data-r7alvo="r7t_${e.texto}" ${gestor ? '' : 'disabled'}>{${esc(x)}}</button>`).join('')}</div>
            <small class="r6-erro-texto" id="r7e_${e.texto}" hidden></small></div></details>`).join('')}
      </div>`;
    if (modo === 'ajustes') grid.insertAdjacentElement('beforebegin', caixa); else ($('#painelR6Reguas') || grid).insertAdjacentElement('afterend', caixa);
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
    const EX = () => ({ ...EXEMPLO, validade: '26/11', link_orcamento: location.origin + '/orcador/#/o/…', link_os: location.origin + '/acompanhar/?t=…' });
    const prever = (campo) => {
      const b = $(`[data-r7previa="${campo}"]`, caixa), t = $(`#r7t_${campo}`, caixa);
      if (b && t) pintarBolha(b, renderTemplate(t.value, EX()), state.cfgEdit.hora_envio || state.cfg.hora_envio || '09:30', 'Escreva a mensagem para ver a prévia.');
    };
    EVENTOS.forEach((e) => prever(e.texto));
    $$('[data-r7cfg]', caixa).forEach((el) => {
      const campo = el.dataset.r7cfg;
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const novo = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
        if (el.type === 'number') { const n = Number(el.value); el.classList.toggle('invalido', el.value === '' || n < Number(el.min) || n > Number(el.max) || !Number.isInteger(n)); }
        if (EVENTOS.some((x) => x.texto === campo)) { validar(campo); prever(campo); }
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

  window.R7 = R7;
})();
