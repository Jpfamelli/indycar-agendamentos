/* ===================== IndyCar Comunicar — Rodada 4 (14/10/2026) =====================
   • "Pronto para ligar": checklist do que falta, com o que fazer em cada item
   • Carteiro: as últimas 24 h (rodadas, 503 do Render, tempo esgotado, reforços)
   • Próximos 30 dias: o que sairia se tudo estivesse ligado (por régua e por dia)
   • Aniversários: colar lista, arquivo CSV, procurar nas conversas e no CRM
   • Indicadores por pessoa, "Pedir ao gestor", tour de boas-vindas e ajuda por papel
   • Rascunhos guardados no aparelho (réguas e campanha) e aviso ao sair
   Usa as funções do app.js (api, openModal, toast, esc, svg, I, state, route…).
   Regra da casa: esc() em TODO dado que vira HTML.
   ======================================================================================= */
(function () {
  'use strict';
  const R4 = {};
  const guardar = (k, v) => { try { if (v === null || v === undefined || v === '') localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço/privado */ } };
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const eu = () => state.perfil?.id || 'anonimo';
  const ROTULO = (t) => TIPO[t]?.rotulo || t;
  const EMOJI = (t) => TIPO[t]?.emoji || '✉️';

  // ======================================================================
  // RASCUNHOS — o que a pessoa escreveu fica no aparelho até salvar/enviar
  // ======================================================================
  const SETE_DIAS = 7 * 86400000;
  R4.lerRascunho = (chave) => {
    const r = ler(`comunicar_rascunho_${eu()}_${chave}`);
    if (!r || Date.now() - (r.em || 0) > SETE_DIAS) return '';
    return typeof r.v === 'string' ? r.v : '';
  };
  R4.guardarRascunho = debounce((chave, valor) => guardar(`comunicar_rascunho_${eu()}_${chave}`, valor ? { v: String(valor).slice(0, 4000), em: Date.now() } : null), 400);
  /* Réguas: só volta se ninguém salvou as réguas depois (mesma "versão" da configuração). */
  R4.lerRascunhoReguas = (cfg) => {
    const r = ler(`comunicar_reguas_${eu()}`);
    if (!r || Date.now() - (r.em || 0) > SETE_DIAS || !r.edit) return null;
    if (r.base !== (cfg.updated_at || null)) { guardar(`comunicar_reguas_${eu()}`, null); return null; }
    const edit = {};
    for (const [k, v] of Object.entries(r.edit)) if (String(v) !== String(cfg[k] ?? '')) edit[k] = v;
    return edit;
  };
  R4.guardarRascunhoReguas = (edit) => {
    const n = Object.keys(edit || {}).length;
    guardar(`comunicar_reguas_${eu()}`, n ? { base: state.cfg?.updated_at || null, edit, em: Date.now() } : null);
  };
  window.addEventListener('beforeunload', (e) => {
    if (state.route === 'reguas' && Object.keys(state.cfgEdit || {}).length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ======================================================================
  // PEDIR AO GESTOR — quem não pode fazer algo pede com um clique
  // ======================================================================
  R4.pedirGestor = async (assunto, detalhe = '', btn = null) => {
    if (btn) btn.disabled = true;
    try {
      const r = await api('POST', '/pedir-gestor', { assunto, detalhe });
      toast(r.avisados ? `Pedido enviado: ${plural(r.avisados, 'gestor avisado', 'gestores avisados')} no sino.` : 'Pedido registrado.', 'ok', 5000);
      if (btn) { btn.textContent = '✓ Pedido enviado'; }
    } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
  };
  const botaoPedir = (assunto, detalhe, rotulo = 'Pedir ao gestor') =>
    `<button type="button" class="btn btn-mini pedir" data-pedir="${esc(assunto)}" data-detalhe="${esc(detalhe || '')}">🙋 ${esc(rotulo)}</button>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pedir]'); if (!b) return;
    R4.pedirGestor(b.dataset.pedir, b.dataset.detalhe || '', b);
  });

  // ======================================================================
  // INÍCIO — "Pronto para ligar" + indicadores por pessoa
  // ======================================================================
  const ICO_ESTADO = { ok: ['✓', 'ok', 'pronto'], falta: ['!', 'falta', 'falta'], aviso: ['•', 'aviso', 'atenção'] };
  function acaoDoItem(it) {
    const a = it.acao; if (!a) return '';
    if (a.tipo === 'rota' && a.alvo === 'reguas' && !pode('reguas'))
      return botaoPedir(it.id === 'reguas' ? 'ligar' : 'reguas', it.titulo);
    if (a.tipo === 'modal' && a.alvo === 'aniversarios' && !pode('importar') && it.estado !== 'ok')
      return `<button type="button" class="btn btn-mini" data-pronto-acao="modal:aniversarios">${esc(a.rotulo)}</button>`;
    if (a.tipo === 'link') return `<a class="btn btn-mini" href="${esc(a.alvo)}" target="_blank" rel="noopener">${esc(a.rotulo)} ↗</a>`;
    return `<button type="button" class="btn btn-mini${it.estado === 'falta' ? ' primary' : ''}" data-pronto-acao="${esc(a.tipo)}:${esc(a.alvo)}">${esc(a.rotulo)}</button>`;
  }
  R4.pintarPronto = async function () {
    const box = $('#painelPronto'); if (!box) return;
    let r;
    try { r = await api('GET', '/pronto'); } catch { box.innerHTML = ''; return; }
    if (!$('#painelPronto')) return;
    state.pronto = r;
    const aberto = ler('comunicar_pronto_aberto');
    const abrir = aberto === null ? !r.pronto || r.faltam > 0 : aberto;
    const pct = Math.round((r.prontos / r.total) * 100);
    const titulo = r.pronto && !r.faltam ? 'Tudo pronto para o Comunicar trabalhar sozinho' : r.pronto ? 'Pronto para ligar — falta pouco' : 'Pronto para ligar?';
    box.innerHTML = `<details class="panel pronto${r.pronto ? ' tudo-ok' : ''}" ${abrir ? 'open' : ''}>
      <summary class="pronto-topo">
        <span class="pronto-anel" style="--p:${pct}" role="img" aria-label="${r.prontos} de ${r.total} itens prontos"><b>${r.prontos}</b><small>/${r.total}</small></span>
        <span class="pronto-tit"><b>${esc(titulo)}</b><small>${r.faltam ? `${plural(r.faltam, 'item impede', 'itens impedem')} de funcionar` : 'nada impede de funcionar'}${r.avisos ? ` · ${plural(r.avisos, 'ponto de atenção', 'pontos de atenção')}` : ''}${r.proximo && r.proximo.estado !== 'ok' ? ` · próximo passo: ${esc(r.proximo.titulo)}` : ''}</small></span>
        <span class="pronto-seta" aria-hidden="true">▾</span>
      </summary>
      <ol class="pronto-lista">${r.itens.map(it => {
        const [ic, cls, rot] = ICO_ESTADO[it.estado] || ICO_ESTADO.aviso;
        return `<li class="pi ${cls}"><span class="pi-ico" aria-hidden="true">${ic}</span>
          <div class="pi-txt"><b>${esc(it.titulo)}<span class="sr-only"> — ${rot}</span>${it.essencial && it.estado !== 'ok' ? ' <em>essencial</em>' : ''}</b><p>${esc(it.texto)}</p></div>
          <div class="pi-acao">${it.estado === 'ok' && it.id !== 'carteiro' && it.id !== 'aniversarios' ? '' : acaoDoItem(it)}</div></li>`;
      }).join('')}</ol>
    </details>`;
    const det = $('details', box);
    det.addEventListener('toggle', () => guardar('comunicar_pronto_aberto', det.open));
    $$('[data-pronto-acao]', box).forEach(b => b.addEventListener('click', () => {
      const [tipo, alvo] = b.dataset.prontoAcao.split(':');
      if (tipo === 'rota') return route(alvo);
      if (alvo === 'aniversarios') return R4.abrirAniversarios();
      if (alvo === 'carteiro') return R4.abrirCarteiro();
    }));
  };

  R4.pintarIndicadores = async function () {
    const alvo = $('#iaLinha'); if (!alvo) return;
    let r; try { r = await api('GET', '/equipe/indicadores?dias=30'); } catch { return; }
    if (!$('#iaLinha') || $('#painelPessoas')) return;
    const pessoas = r.pessoas || [];
    const div = document.createElement('div');
    div.className = 'panel pessoas'; div.id = 'painelPessoas';
    const linhas = pessoas.length ? pessoas.map(p => `<div class="pe-l">
        <span class="pe-n"><span class="pe-av" aria-hidden="true">${esc(iniciais(p.nome))}</span><b>${esc(p.perfil_id === state.perfil?.id ? `${p.nome} (você)` : p.nome)}</b></span>
        <span class="num">${p.enviadas}<small>enviadas</small></span>
        <span class="num">${p.taxaResposta === null ? '—' : `${p.taxaResposta}%`}<small>responderam</small></span>
        <span class="num">${p.agendaram}<small>agendaram</small></span>
        <span class="num">${p.propostas}<small>campanhas</small></span>
      </div>`).join('')
      : `<p class="dica">${r.gestor ? 'Ninguém da equipe mandou mensagem manual nestes 30 dias. As automáticas não entram aqui.' : 'Você ainda não mandou mensagem por aqui nestes 30 dias. Comece pela ficha de um cliente: "Mandar mensagem".'}</p>`;
    div.innerHTML = `<div class="panel-head"><h2>${svg(I.user)} ${r.gestor ? 'Equipe' : 'Você'} · 30 dias</h2><span class="panel-sub">mensagens manuais e campanhas de cada um</span></div>
      <div class="panel-body pe">${linhas}</div>`;
    alvo.insertAdjacentElement('afterend', div);
  };

  R4.pintarInicio = function () { R4.pintarPronto(); R4.pintarIndicadores(); };

  // ======================================================================
  // CARTEIRO — as últimas 24 h
  // ======================================================================
  const SIT = { ok: ['respondeu', 'bp-green'], dormindo: ['servidor dormindo (503)', 'bp-orange'], demorou: ['demorou demais', 'bp-orange'], erro: ['erro', 'bp-red'], sem_resposta: ['sem resposta ainda', 'bp-gray'] };
  const ORIGEM = { cron: 'a cada 15 min', reforco: 'reforço', timer: 'servidor acordado', inicio: 'servidor ligou', manual: 'Rodar agora', github: 'GitHub', desconhecido: '—' };
  R4.abrirCarteiro = async function () {
    openModal(`<div class="modal-head"><h3>${svg(I.clock)} Carteiro · últimas 24 h</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body" id="cartCorpo"><div class="skel" style="height:160px"></div></div>
      <div class="modal-foot">${pode('rodar') ? `<button type="button" class="btn primary esq" id="cartRodar">${svg(I.play)} Rodar agora</button>` : ''}<button type="button" class="btn" data-fechar>Fechar</button></div>`, { larga:true });
    $('#cartRodar')?.addEventListener('click', async (e) => { e.currentTarget.disabled = true; closeModal(); if (state.route !== 'inicio') await route('inicio'); rodarAgora(); });
    let c; try { c = await api('GET', '/carteiro'); } catch (e) { $('#cartCorpo').innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
    const agora = Date.now(), ini = agora - 24 * 3600000;
    const pos = (ts) => Math.max(0, Math.min(100, ((new Date(ts).getTime() - ini) / (24 * 3600000)) * 100));
    const marcas = [...(c.batidas || []).map(b => ({ x: pos(b.em), cls: b.ok ? (b.enviados ? 'env' : 'ok') : 'err', t: `${horaBR(b.em)} · ${ORIGEM[b.origem] || b.origem}${b.enviados ? ` · ${b.enviados} enviadas` : ''}${b.ok ? '' : ' · falhou'}` })),
      ...(c.chamadas || []).filter(x => ['dormindo', 'demorou', 'erro'].includes(x.situacao)).map(x => ({ x: pos(x.em), cls: 'dorm', t: `${horaBR(x.em)} · ${SIT[x.situacao][0]}` }))];
    $('#cartCorpo').innerHTML = `
      <div class="rel-nums">
        <div><b>${c.rodadas24h}</b><small>rodadas</small></div>
        <div class="g"><b>${c.enviadas24h}</b><small>mensagens saíram</small></div>
        <div class="${c.falhas24h ? 'p' : ''}"><b>${c.falhas24h}</b><small>chamadas sem resposta</small></div>
        <div><b>${c.reforcosOk}</b><small>salvas pelo reforço</small></div>
      </div>
      <div class="cart-linha" role="img" aria-label="Linha do tempo das últimas 24 horas: ${c.rodadas24h} rodadas e ${c.falhas24h} chamadas sem resposta">
        ${marcas.map(m => `<i class="${m.cls}" style="left:${m.x.toFixed(2)}%" title="${esc(m.t)}"></i>`).join('')}
        <span class="cl-a">${esc(horaBR(new Date(ini)))}</span><span class="cl-z">agora</span>
      </div>
      <div class="g-legenda"><span><i class="b-env"></i>enviou</span><span><i class="b-resp"></i>rodou</span><span><i class="b-dorm"></i>servidor dormindo / demorou</span></div>
      <p class="dica">O servidor gratuito dorme. O banco chama o carteiro a cada 15 min (8h–20h); se a chamada encontra o servidor dormindo, o <b>reforço</b> tenta de novo em 5 min. O que ficou para trás sai na rodada seguinte, <b>sem duplicar</b>: cada mensagem é reservada antes de sair, e o que perdeu o sentido (lembrete depois do horário) é pulado com o motivo.</p>
      ${c.buracos?.length ? `<div class="lista-sep">Buracos no horário de envio <em>${c.buracos.length}</em></div>${c.buracos.map(b => `<div class="ag-linha"><span class="s">${esc(horaBR(b.de))} → ${esc(horaBR(b.ate))}</span><small class="muted">${b.minutos} min sem rodar</small></div>`).join('')}` : ''}
      <div class="lista-sep">Chamadas do banco <em>${c.chamadas24h}</em></div>
      ${(c.chamadas || []).length ? (c.chamadas || []).slice(0, 30).map(x => `<div class="ag-linha"><span class="d">${esc(horaBR(x.em))}</span><span class="s">${esc(ORIGEM[x.origem] || x.origem)}</span><span class="badge-pill ${SIT[x.situacao]?.[1] || 'bp-gray'}">${esc(SIT[x.situacao]?.[0] || x.situacao)}</span></div>`).join('')
        : '<p class="dica">Nenhuma chamada anotada ainda (começam a aparecer na próxima chamada do banco).</p>'}`;
  };

  // ======================================================================
  // PRÓXIMOS 30 DIAS — o que sairia se tudo estivesse ligado
  // ======================================================================
  let _projecao = null;
  async function projecao(forcar = false) {
    if (!forcar && _projecao && Date.now() - _projecao.em < 5 * 60000) return _projecao.v;
    const v = await api('GET', '/projecao');
    _projecao = { v, em: Date.now() };
    return v;
  }
  R4.abrirMes = async function () {
    openModal(`<div class="modal-head"><h3>${svg(I.calendar)} Próximos 30 dias</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body" id="mesCorpo"><div class="skel" style="height:220px"></div></div>
      <div class="modal-foot">${pode('reguas') ? `<button type="button" class="btn esq" id="mesReguas">${svg(I.regua)} Abrir réguas</button>` : ''}<button type="button" class="btn primary" data-fechar>Pronto</button></div>`, { larga:true, classe:'modal-mes' });
    $('#mesReguas')?.addEventListener('click', () => { closeModal(); route('reguas'); });
    let p; try { p = await projecao(); } catch (e) { $('#mesCorpo').innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
    const maxR = Math.max(1, ...Object.values(p.porRegua).map(r => r.total));
    const maxD = Math.max(1, ...p.dias.map(d => d.total));
    const sem = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const primeiro = new Date(p.de + 'T12:00:00').getDay();
    $('#mesCorpo').innerHTML = `
      <div class="mes-topo"><div class="mes-n"><b>${p.total}</b><small>mensagens sairiam de ${esc(dataCurta(p.de))} a ${esc(dataCurta(p.ate))} com as 8 réguas ligadas</small></div>
        <div class="mes-n g"><b>${p.comAsLigadasHoje}</b><small>com as réguas ligadas hoje</small></div></div>
      ${p.avisos?.length ? `<div class="dica alerta">${p.avisos.map(esc).join('<br>')}</div>` : ''}
      <div class="lista-sep">Por régua</div>
      <div class="mes-reguas">${REGUAS.map(t => { const r = p.porRegua[t] || { total:0 }; return `<div class="mr${r.ligada ? '' : ' off'}">
          <span class="mr-n">${EMOJI(t)} <b>${esc(ROTULO(t))}</b>${r.ligada ? '<span class="chip on">ligada</span>' : '<span class="chip">desligada</span>'}</span>
          <span class="mr-barra" aria-hidden="true"><i style="width:${(r.total / maxR) * 100}%"></i></span>
          <span class="mr-t"><b>${r.total}</b>${r.estimados ? `<small>${r.estimados} estimad${r.estimados === 1 ? 'a' : 'as'}</small>` : ''}</span>
          ${r.exemplos?.length ? `<span class="mr-ex">${r.exemplos.slice(0, 3).map(x => `${esc(String(x.nome || '').split(' ')[0])} ${esc(dataCurta(x.data))}`).join(' · ')}${r.total > 3 ? ' …' : ''}</span>` : ''}
        </div>`; }).join('')}</div>
      <div class="lista-sep">Por dia</div>
      <div class="mes-cal" role="grid" aria-label="Mensagens por dia nos próximos 30 dias">
        ${sem.map(d => `<span class="mc-h" role="columnheader">${d}</span>`).join('')}
        ${'<span class="mc-vazio"></span>'.repeat(primeiro)}
        ${p.dias.map(d => { const nivel = d.total ? Math.ceil((d.total / maxD) * 4) : 0;
          const det = Object.entries(d.porRegua).map(([t, n]) => `${ROTULO(t)}: ${n}`).join(', ');
          return `<button type="button" class="mc-d n${nivel}" role="gridcell" data-dia="${esc(d.data)}" aria-label="${esc(dataBR(d.data))}: ${plural(d.total, 'mensagem', 'mensagens')}${det ? ` (${esc(det)})` : ''}" title="${esc(det || 'nada')}"><span>${esc(d.data.slice(8))}</span><b>${d.total || ''}</b></button>`; }).join('')}
      </div>
      <div id="mesDia" class="mes-dia" aria-live="polite"></div>
      <p class="dica">Estimativa com os dados de hoje: lembretes dos horários já marcados, pós-venda e avaliação de quem ainda vai ser atendido (<b>estimadas</b>), revisões e reativações pelos prazos, aniversários cadastrados e orçamentos parados no CRM. Já tira quem pediu para não receber, domingo, feriado e o intervalo mínimo${p.seguradosPeloIntervalo ? ` (${p.seguradosPeloIntervalo} seguradas por ele)` : ''}.</p>`;
    $$('.mc-d', $('#mesCorpo')).forEach(b => b.addEventListener('click', () => {
      $$('.mc-d.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
      const lista = (p.itens || []).filter(i => i.data === b.dataset.dia);
      $('#mesDia').innerHTML = `<div class="lista-sep">${esc(rotuloDia(b.dataset.dia))} <em>${lista.length}</em></div>` + (lista.length
        ? lista.slice(0, 40).map(i => `<div class="ag-linha"><span class="s">${EMOJI(i.tipo)} <b>${esc(i.nome || 'cliente')}</b></span><small class="muted">${esc(ROTULO(i.tipo))}${i.estimado ? ' · estimada' : ''}</small></div>`).join('')
        : '<p class="dica">Nada sairia neste dia.</p>');
    }));
  };

  /* Réguas: alcance de cada régua + pedir ao gestor no aviso de "só gestor". */
  R4.pintarReguas = async function () {
    if (!pode('reguas')) {
      const aviso = $('.so-gestor', view);
      if (aviso && !$('.pedir', aviso.parentElement)) aviso.insertAdjacentHTML('afterend', botaoPedir('reguas', 'Quero mudar uma régua'));
    }
    let p; try { p = await projecao(); } catch { return; }
    if (state.route !== 'reguas') return;
    for (const t of REGUAS) {
      const card = $(`.regua[data-regua="${t}"] .regua-titulo div`, view); if (!card || $('.alcance', card)) continue;
      const r = p.porRegua[t] || { total: 0 };
      card.insertAdjacentHTML('beforeend', `<button type="button" class="alcance" data-mes title="Ver os próximos 30 dias">≈ <b>${r.total}</b> ${r.total === 1 ? 'mensagem' : 'mensagens'} em 30 dias${r.estimados ? ' (estimado)' : ''}</button>`);
    }
    $$('[data-mes]', view).forEach(b => b.addEventListener('click', R4.abrirMes));
  };

  // ======================================================================
  // ANIVERSÁRIOS — colar lista · arquivo CSV · procurar nas conversas e no CRM
  // ======================================================================
  const EXEMPLO_LISTA = 'Maria Souza; (12) 99999-0001; 14/05/1988\nJoão Lima 12 98888-0002 02/11\nCarla Dias - 3 de março';
  const STATUS_AN = { casou: ['achei', 'bp-green'], ambiguo: ['mais de um', 'bp-orange'], nao_achou: ['não achei', 'bp-gray'], invalida: ['data?', 'bp-red'] };

  function lerArquivo(arquivo) {
    return new Promise((res, rej) => {
      const leitor = new FileReader();
      leitor.onerror = () => rej(new Error('Não consegui ler o arquivo.'));
      leitor.onload = () => {
        const t = String(leitor.result || '');
        if (!t.includes(String.fromCharCode(0xfffd))) return res(t);
        // planilha salva pelo Excel em "ANSI": lê de novo como Windows-1252
        const l2 = new FileReader(); l2.onload = () => res(String(l2.result || '')); l2.onerror = () => res(t);
        l2.readAsText(arquivo, 'windows-1252');
      };
      leitor.readAsText(arquivo, 'utf-8');
    });
  }

  R4.abrirAniversarios = function (aba = 'colar') {
    const gestor = pode('importar');
    openModal(`<div class="modal-head"><h3>${svg(I.gift)} Aniversários dos clientes</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="abas" role="tablist" aria-label="Como cadastrar">
        <button type="button" role="tab" class="aba" data-aba="colar" aria-selected="false">📋 Colar lista</button>
        <button type="button" role="tab" class="aba" data-aba="arquivo" aria-selected="false">📄 Arquivo CSV</button>
        <button type="button" role="tab" class="aba" data-aba="procurar" aria-selected="false">🔎 Procurar nas conversas</button>
        <button type="button" role="tab" class="aba" data-aba="base" aria-selected="false">🎂 Quem já tem</button>
      </div>
      <div class="modal-body" id="anCorpo" role="tabpanel"></div>
      <div class="modal-foot" id="anPe"><button type="button" class="btn" data-fechar>Fechar</button></div>`, { larga:true, classe:'modal-aniv' });
    const corpo = $('#anCorpo'), pe = $('#anPe');
    const ir = (a) => {
      $$('.aba', modal).forEach(b => { const s = b.dataset.aba === a; b.classList.toggle('ativa', s); b.setAttribute('aria-selected', String(s)); });
      pe.innerHTML = '<button type="button" class="btn" data-fechar>Fechar</button>';
      ({ colar: abaColar, arquivo: abaArquivo, procurar: abaProcurar, base: abaBase })[a]();
    };
    $$('.aba', modal).forEach(b => b.addEventListener('click', () => ir(b.dataset.aba)));

    function abaColar() {
      corpo.innerHTML = `<p class="dica">Cole do jeito que tiver: <b>nome, telefone e data</b> numa linha por cliente, em qualquer ordem e separados por espaço, vírgula, ponto e vírgula ou tabulação (dá para copiar direto do Excel). Datas como 14/05/1988, 14/05, 14-05-88 ou "14 de maio" valem. Ninguém recebe nada agora: você confere antes de gravar.</p>
        <div class="field"><label for="anTexto">Lista</label><textarea id="anTexto" style="min-height:150px" placeholder="${esc(EXEMPLO_LISTA)}">${esc(R4.lerRascunho('aniversarios'))}</textarea></div>
        <div id="anResultado"></div>`;
      const ta = $('#anTexto');
      ta.addEventListener('input', () => R4.guardarRascunho('aniversarios', ta.value));
      pe.innerHTML = `<button type="button" class="btn" data-fechar>Fechar</button><button type="button" class="btn primary" id="anConferir">${svg(I.check)} Conferir</button>`;
      $('#anConferir').addEventListener('click', () => analisar(ta.value, 'lista'));
      setTimeout(() => ta.focus(), 30);
    }
    function abaArquivo() {
      corpo.innerHTML = `<p class="dica">Uma planilha salva como <b>CSV</b> (Excel: Arquivo › Salvar como › CSV). Com cabeçalho <i>nome · telefone · nascimento</i> as colunas são achadas sozinhas; sem cabeçalho, cada linha é lida como na lista colada.</p>
        <label class="arquivo-caixa" for="anArq"><span>${svg(I.upload)}</span><b>Escolher arquivo</b><small>.csv ou .txt, até 3.000 linhas</small></label>
        <input type="file" id="anArq" accept=".csv,.txt,text/csv,text/plain" class="sr-only">
        <div id="anResultado"></div>`;
      $('#anArq').addEventListener('change', async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        if (f.size > 3_000_000) return toast('Arquivo grande demais (máximo 3 MB).', 'err');
        try { analisar(await lerArquivo(f), 'csv'); } catch (err) { toast(err.message, 'err'); }
      });
    }
    async function abaProcurar() {
      corpo.innerHTML = `<p class="dica">Procura datas perto de "aniversário", "nasci", "nascimento" nas observações da ficha, nos leads do CRM e no que os clientes escreveram no WhatsApp. Confira o trecho antes de gravar.</p><div id="anResultado"><div class="skel" style="height:120px"></div></div>`;
      let r; try { r = await api('GET', '/aniversarios/sugestoes'); } catch (e) { $('#anResultado').innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
      const box = $('#anResultado'); if (!box) return;
      const lidos = `${r.lidos.fichas} ficha(s), ${r.lidos.crm} lead(s) e ${r.lidos.conversas} mensagem(ns) com a palavra`;
      if (!r.sugestoes.length) { box.innerHTML = vazio(I.search, 'Nenhuma data encontrada', `Li ${esc(lidos)} e não achei datas novas. Use a lista colada ou o arquivo.`); return; }
      box.innerHTML = `<p class="muted">Li ${esc(lidos)}. Achei <b>${r.sugestoes.length}</b>:</p>
        <div class="an-lista">${r.sugestoes.map((s, i) => `<label class="an-item">
          <input type="checkbox" data-sug="${i}" ${s.troca ? '' : 'checked'}>
          <span class="an-q"><b>${esc(s.nome)}</b> <small>${esc(telBR(s.telefone))}</small><br><span class="badge-pill bp-blue">🎂 ${esc(nascBR(s.data))}</span>${s.troca ? ` <span class="badge-pill bp-orange">hoje: ${esc(nascBR(s.atual))}</span>` : ''} <small class="muted">${esc({ ficha:'ficha', crm:'CRM', conversa:'conversa' }[s.fonte] || s.fonte)}</small>
          <q>${esc(s.trecho)}</q></span></label>`).join('')}</div>`;
      pe.innerHTML = `<button type="button" class="btn" data-fechar>Fechar</button><button type="button" class="btn primary" id="anGravarSug">${svg(I.check)} Gravar as marcadas</button>`;
      $('#anGravarSug').addEventListener('click', () => {
        const itens = $$('[data-sug]:checked', box).map(c => r.sugestoes[Number(c.dataset.sug)]).map(s => ({ cliente_id: s.cliente_id, nascimento: s.data }));
        const troca = $$('[data-sug]:checked', box).some(c => r.sugestoes[Number(c.dataset.sug)].troca);
        gravar(itens, troca, 'conversas');
      });
    }
    async function abaBase() {
      corpo.innerHTML = '<div class="skel" style="height:160px"></div>';
      let d; try { d = await api('GET', '/aniversarios'); } catch (e) { corpo.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
      const pct = d.total ? Math.round((d.comData / d.total) * 100) : 0;
      corpo.innerHTML = `<div class="rel-nums"><div><b>${d.comData}</b><small>com aniversário</small></div><div><b>${d.total}</b><small>clientes com telefone</small></div><div class="g"><b>${d.proximos.length}</b><small>nos próximos 30 dias</small></div></div>
        <div class="barra-prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Clientes com aniversário"><i style="width:${Math.max(pct, d.comData ? 2 : 0)}%"></i></div>
        <p class="dica">A ficha do cliente é a mesma no CRM, na Agenda e no Atendimento: quem já tem data entra sozinho na régua Aniversário.</p>
        ${d.proximos.length ? `<div class="lista-sep">Próximos 30 dias <em>${d.proximos.length}</em></div>${d.proximos.slice(0, 20).map(p => `<div class="ag-linha"><span class="d">${esc(dataCurta(p.data))}</span><span class="s"><b>${esc(p.nome)}</b>${p.aceita ? '' : ' <span class="selo">não quer mensagens</span>'}</span><small class="muted">${p.em_dias === 0 ? 'hoje 🎂' : `em ${plural(p.em_dias, 'dia', 'dias')}`}</small></div>`).join('')}` : ''}
        ${d.semDataRecentes.length ? `<div class="lista-sep">Atendidos há pouco, sem data <em>${d.semDataRecentes.length}</em></div>${d.semDataRecentes.map(c => `<div class="ag-linha"><span class="s"><b>${esc(c.nome)}</b> <small class="muted">${esc(telBR(c.telefone))}</small></span><button type="button" class="btn btn-mini" data-nasc-r4="${esc(c.id)}">${svg(I.gift)} Pôr data</button></div>`).join('')}` : ''}`;
      $$('[data-nasc-r4]', corpo).forEach(b => b.addEventListener('click', () => { const c = d.semDataRecentes.find(x => x.id === b.dataset.nascR4); closeModal(); openNascimentoModal(c); }));
    }

    async function analisar(texto, origem) {
      const box = $('#anResultado'); if (!box) return;
      if (!String(texto || '').trim()) return toast('Cole a lista primeiro.', 'err');
      box.innerHTML = '<div class="skel" style="height:120px"></div>';
      let r; try { r = await api('POST', '/aniversarios/analisar', { texto }); } catch (e) { box.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
      const s = r.resumo;
      const grava = r.itens.filter(i => i.status === 'casou' && !i.igual);
      box.innerHTML = `<div class="rel-nums an-nums">
          <div class="g"><b>${s.novos}</b><small>datas novas</small></div><div><b>${s.trocas}</b><small>trocariam a data</small></div>
          <div><b>${s.iguais}</b><small>já estavam certas</small></div><div class="${s.ambiguos + s.nao_achou + s.invalidas ? 'p' : ''}"><b>${s.ambiguos + s.nao_achou + s.invalidas}</b><small>para conferir</small></div></div>
        ${r.cortado ? '<p class="form-msg erro">Só as primeiras 3.000 linhas foram lidas.</p>' : ''}
        ${s.trocas ? `<label class="lembrar"><input type="checkbox" id="anSubst" ${gestor ? '' : 'disabled'}> Trocar também as ${s.trocas} datas que já existem${gestor ? '' : ' (só gestor)'}</label>` : ''}
        <div class="an-tabela" role="table" aria-label="Conferência da lista">
          <div class="an-l an-h" role="row"><span role="columnheader" aria-label="Linha">Nº</span><span role="columnheader">Na lista</span><span role="columnheader">Cliente</span><span role="columnheader">Data</span></div>
          ${r.itens.slice(0, 400).map((i, k) => { const [rot, cor] = STATUS_AN[i.status] || ['?', 'bp-gray'];
            return `<div class="an-l" role="row"><span role="cell" class="muted">${i.linha}</span>
              <span role="cell">${esc(i.nome || '—')}${i.telefone ? `<small>${esc(telBR(i.telefone))}</small>` : ''}</span>
              <span role="cell"><span class="badge-pill ${cor}">${esc(rot)}</span> ${i.status === 'casou' ? `${esc(i.cliente_nome)}<small>pelo ${esc(i.como)}</small>` : ''}
                ${i.status === 'ambiguo' ? `<select class="inp an-esc" data-k="${k}" aria-label="Qual cliente é a linha ${i.linha}?"><option value="">qual destes?</option>${i.candidatos.map(c => `<option value="${esc(c.id)}">${esc(c.nome)} · ${esc(telBR(c.telefone))}</option>`).join('')}</select>` : ''}
                ${i.status === 'invalida' ? `<small>${esc(i.erro)}</small>` : ''}</span>
              <span role="cell">${i.data ? esc(nascBR(i.data)) : '—'}${i.troca ? `<small>hoje: ${esc(nascBR(i.atual))}</small>` : ''}${i.igual ? '<small>igual</small>' : ''}</span></div>`; }).join('')}
          ${r.itens.length > 400 ? `<p class="dica">+${r.itens.length - 400} linhas (todas entram na gravação).</p>` : ''}
        </div>`;
      const escolhidos = new Map();
      $$('.an-esc', box).forEach(sel => sel.addEventListener('change', () => { const it = r.itens[Number(sel.dataset.k)]; if (sel.value) escolhidos.set(it.linha, { cliente_id: sel.value, nascimento: it.data }); else escolhidos.delete(it.linha); atualizarBotao(); }));
      const montar = () => {
        const subst = $('#anSubst')?.checked;
        const itens = grava.filter(i => subst || !i.troca).map(i => ({ cliente_id: i.cliente_id, nascimento: i.data }));
        return [...itens, ...escolhidos.values()];
      };
      const atualizarBotao = () => { const b = $('#anGravar'); if (b) { const n = montar().length; b.disabled = !n; b.innerHTML = `${svg(I.check)} Gravar ${plural(n, 'data', 'datas')}`; } };
      pe.innerHTML = `<button type="button" class="btn" data-fechar>Fechar</button>${gestor || montar().length <= 1 ? `<button type="button" class="btn primary" id="anGravar"></button>` : botaoPedir('importar', `Lista com ${montar().length} aniversários para gravar`, 'Pedir ao gestor para gravar')}`;
      $('#anSubst')?.addEventListener('change', atualizarBotao);
      atualizarBotao();
      $('#anGravar')?.addEventListener('click', () => gravar(montar(), !!$('#anSubst')?.checked, origem));
    }

    async function gravar(itens, substituir, origem) {
      if (!itens.length) return toast('Nada marcado para gravar.', 'err');
      const b = $('#anGravar') || $('#anGravarSug'); if (b) b.disabled = true;
      try {
        const r = await api('POST', '/aniversarios/gravar', { itens, substituir, origem });
        R4.guardarRascunho('aniversarios', '');
        toast(`${plural(r.gravados, 'aniversário gravado', 'aniversários gravados')}${r.ignorados ? ` · ${r.ignorados} já tinham data (não troquei)` : ''}.`, 'ok', 6000);
        _projecao = null;
        closeModal();
        if (state.route === 'inicio' || state.route === 'clientes') route(null, { quieto:true });
      } catch (e) { toast(e.message, 'err', 6000); if (b) b.disabled = false; }
    }
    ir(aba);
  };

  // ======================================================================
  // AJUDA por papel (com busca) e TOUR de boas-vindas
  // ======================================================================
  const AJUDA = [
    { p: 'todos', t: 'Mandar mensagem para um cliente', d: 'Clientes › abra a ficha › "Mandar mensagem". Sai pelo WhatsApp da oficina dentro da janela de envio e aparece na conversa do Atendimento.' },
    { p: 'todos', t: 'Ver o que saiu e o que o cliente respondeu', d: 'Mensagens: filtre por status, régua, período ou pela leitura da IA ("quer agendar", "reclamou"…). A resposta aparece no balão colorido.' },
    { p: 'todos', t: 'Cliente pediu para não receber', d: 'Na ficha, desligue "aceita mensagens". Quem responde PARAR sai sozinho. Para voltar a mandar, só o gestor.' },
    { p: 'todos', t: 'Cadastrar aniversários', d: 'Clientes › Aniversários: cole uma lista, suba um CSV ou procure nas conversas. Um por vez: na ficha do cliente.' },
    { p: 'todos', t: 'Ver o que vai sair', d: 'Início › "Prévia de hoje" (o que a régua faria agora) e "Próximos 30 dias" (o mês inteiro, por régua e por dia).' },
    { p: 'atendente', t: 'Campanha para vários clientes', d: 'Nova campanha (tecla N) › escolha o grupo › escreva › "Pedir aprovação". O gestor aprova no sino e aí entra na fila.' },
    { p: 'atendente', t: 'Não consigo mudar uma régua', d: 'Réguas, teste, CSV e importar são do gestor. Use o botão 🙋 "Pedir ao gestor": ele recebe o aviso no sino.' },
    { p: 'atendente', t: 'Minhas tarefas', d: 'Cliente que pediu horário, quer orçamento ou reclamou vira tarefa para quem cuida da conversa. Elas ficam no ✓ do topo.' },
    { p: 'gestor', t: 'Ligar o Comunicar', d: 'Início › "Pronto para ligar" mostra o que falta (chave do WhatsApp, réguas, link de avaliação, telefone de teste, aniversários) e leva direto ao lugar certo.' },
    { p: 'gestor', t: 'Ligar ou mudar uma régua', d: 'Réguas: interruptor, texto (ou ✨ 3 opções da IA), o número de dias/horas e "Mandar teste para mim". Salve na barra de baixo.' },
    { p: 'gestor', t: 'Aprovar campanha da equipe', d: 'O sino avisa. Campanhas › "Para aprovar": Aprovar coloca na fila; Recusar avisa quem pediu, com o motivo.' },
    { p: 'gestor', t: 'O servidor dormiu, perdi mensagens?', d: 'Não. O carteiro é chamado de 15 em 15 min e tem reforço de 5 em 5 quando a chamada falha; o que ficou para trás sai na rodada seguinte, sem duplicar. Veja em Início › "carteiro rodou…".' },
    { p: 'gestor', t: 'Pausar tudo', d: 'Réguas › Envio › Pausa geral. A fila continua se formando; nada sai até desligar.' },
  ];
  R4.abrirAjuda = function () {
    const gestor = pode('reguas');
    const minhas = AJUDA.filter(a => a.p === 'todos' || (gestor ? a.p === 'gestor' : a.p === 'atendente'));
    openModal(`<div class="modal-head"><h3>❔ Como faço…</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="modal-body ajuda">
        <div class="search" style="max-width:none">${svg(I.search)}<input id="ajBusca" placeholder="Procurar na ajuda (ex.: aniversário, aprovar, parar)" aria-label="Procurar na ajuda"></div>
        <p class="muted">Você entrou como <b>${esc({ admin:'administrador', gestor:'gestor', atendente:'atendente' }[state.perfil?.papel] || 'equipe')}</b>${gestor ? '' : ' — réguas, teste e importação são do gestor (use 🙋 "Pedir ao gestor")'}.</p>
        <div id="ajLista">${minhas.map(a => `<details class="aj"><summary>${esc(a.t)}</summary><p>${esc(a.d)}</p></details>`).join('')}</div>
        <div class="ajuda-item"><span>⌨️</span><div><b>Atalhos</b><p><kbd>N</kbd> nova campanha · <kbd>/</kbd> buscar · <kbd>?</kbd> esta ajuda · <kbd>Esc</kbd> fecha</p></div></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn esq" id="ajTour">▶ Rever o tour</button>${gestor ? '' : botaoPedir('outro', 'Preciso de ajuda no Comunicar', 'Pedir ajuda ao gestor')}<button type="button" class="btn primary" data-fechar>Entendi</button></div>`);
    $('#ajBusca').addEventListener('input', (e) => {
      const q = semAcentoTela(e.target.value);
      $$('#ajLista .aj').forEach(d => { const ok = !q || semAcentoTela(d.textContent).includes(q); d.hidden = !ok; if (q && ok) d.open = true; });
    });
    $('#ajTour').addEventListener('click', () => { closeModal(); R4.tour(true); });
  };
  const SEM_MARCAS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
  const semAcentoTela = (s) => String(s || '').normalize('NFD').replace(SEM_MARCAS, '').toLowerCase().trim();

  function passosDoTour() {
    const gestor = pode('reguas');
    const comum = [
      { alvo: '[data-route="mensagens"]', t: 'Mensagens', d: 'Tudo o que saiu, está na fila ou falhou — com a resposta do cliente e o que a IA leu nela.' },
      { alvo: '[data-route="clientes"]', t: 'Clientes', d: 'A mesma ficha do CRM e da Agenda. Aqui você manda mensagem para um cliente e cadastra aniversários.' },
    ];
    if (gestor) return [
      { alvo: '#painelPronto', t: 'Pronto para ligar', d: 'O que falta para o Comunicar trabalhar sozinho. Cada item tem o botão que leva ao lugar certo.' },
      { alvo: '[data-route="reguas"]', t: 'Réguas', d: 'As 8 mensagens automáticas. Ligue, ajuste o texto, mande um teste para você e salve.' },
      ...comum,
      { alvo: '[data-route="campanhas"]', t: 'Campanhas', d: 'Mensagem para um grupo. O que a equipe pede para mandar chega aqui para você aprovar.' },
      { alvo: '#btnAjuda', t: 'Ajuda', d: 'Dúvida? "Como faço…" com busca. A tecla ? também abre.' },
    ];
    return [
      { alvo: '#faixaEquipe:not([hidden]), .hero-dia', t: 'Seu dia', d: 'Aqui aparecem as suas tarefas e as campanhas que você pediu. A situação do WhatsApp fica logo abaixo.' },
      ...comum,
      { alvo: '[data-route="campanhas"]', t: 'Campanhas', d: 'Para um grupo de clientes: você escreve e o gestor aprova. Para um cliente só, sai direto.' },
      { alvo: '#btnSino:not([hidden]), #btnAjuda', t: 'Avisos', d: 'O sino mostra o que é seu: tarefa nova, campanha aprovada ou recusada.' },
      { alvo: '#btnAjuda', t: 'Ajuda', d: 'Dúvida? "Como faço…" com busca. A tecla ? também abre.' },
    ];
  }
  const SEM_TOUR = new URLSearchParams(location.search).get('tour') === '0'; // roteiros de teste
  R4.talvezTour = function () {
    if (SEM_TOUR || !state.perfil?.id || ler(`comunicar_tour_v1_${eu()}`)) return;
    if (window.innerHeight < 420) return; // tela muito baixa: só pela ajuda
    setTimeout(() => R4.tour(false), 900);
  };
  R4.tour = function (forcado) {
    const passos = passosDoTour().filter(p => document.querySelector(p.alvo));
    if (!passos.length) return;
    let i = 0;
    const fundo = document.createElement('div'); fundo.className = 'tour-fundo';
    const luz = document.createElement('div'); luz.className = 'tour-luz';
    const card = document.createElement('div'); card.className = 'tour-card';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tourTit');
    document.body.append(fundo, luz, card);
    const antes = document.activeElement;
    const fechar = () => {
      guardar(`comunicar_tour_v1_${eu()}`, { em: Date.now() });
      fundo.remove(); luz.remove(); card.remove();
      document.removeEventListener('keydown', teclas, true);
      window.removeEventListener('resize', pintar);
      antes?.focus?.();
    };
    const teclas = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); proximo(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) { i--; pintar(); } }
      else if (e.key === 'Tab') { prenderTab(e, card); }
    };
    const proximo = () => { if (i >= passos.length - 1) return fechar(); i++; pintar(); };
    function pintar() {
      const p = passos[i];
      const el = document.querySelector(p.alvo);
      if (el) {
        el.scrollIntoView?.({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        Object.assign(luz.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
        const larg = Math.min(320, window.innerWidth - 32);
        let x = r.right + 16, y = r.top;
        if (x + larg > window.innerWidth - 16) { x = Math.max(16, Math.min(r.left, window.innerWidth - larg - 16)); y = r.bottom + 14; }
        if (y + 200 > window.innerHeight) y = Math.max(16, r.top - 214);
        Object.assign(card.style, { left: `${x}px`, top: `${y}px`, width: `${larg}px` });
      }
      card.innerHTML = `<small class="tour-n">${i + 1} de ${passos.length}</small><h3 id="tourTit">${esc(p.t)}</h3><p>${esc(p.d)}</p>
        <div class="tour-acoes"><button type="button" class="btn btn-mini ghost" data-t="pular">${forcado ? 'Fechar' : 'Pular o tour'}</button>
          ${i ? '<button type="button" class="btn btn-mini" data-t="voltar">Voltar</button>' : ''}
          <button type="button" class="btn btn-mini primary" data-t="prox">${i === passos.length - 1 ? 'Começar' : 'Próximo'}</button></div>`;
      $('[data-t="prox"]', card).focus();
    }
    card.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (t === 'pular') fechar(); else if (t === 'voltar') { i--; pintar(); } else if (t === 'prox') proximo();
    });
    fundo.addEventListener('click', fechar);
    document.addEventListener('keydown', teclas, true);
    window.addEventListener('resize', pintar);
    pintar();
  };

  // ======================================================================
  // VOLTOU / APARELHO DE VOLTA — atualiza a tela sem piscar
  // ======================================================================
  let _escondidoEm = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { _escondidoEm = Date.now(); return; }
    if (_escondidoEm && Date.now() - _escondidoEm > 2 * 60000 && !document.body.classList.contains('deslogado') && state.perfil) {
      carregarSaude(); if (!modalAberto() && !gavetaAberta() && state.route !== 'reguas') route(null, { quieto:true });
    }
  });
  window.Acordar?.ouvir((tipo) => {
    if (tipo !== 'voltou' || !state.perfil) return;
    carregarSaude();
    if (!modalAberto() && !gavetaAberta() && state.route !== 'reguas') setTimeout(() => route(null, { quieto:true }), 300);
  });

  window.R4 = R4;
})();
