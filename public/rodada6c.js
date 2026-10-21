/* ============================================================================
   Agenda — Rodada 6 / C1c (21/10/2026): o Quadro e o balcão para quem marca 30 horários por dia.
     · PURO (testado em tests/c1c-agenda.test.mjs, sem navegador): duração no cartão, cauda do serviço nas linhas
       seguintes, filtro do Quadro, texto do dia para copiar, link de WhatsApp dos atrasados, "marcar rápido".
     · TELA: ferramentas do Quadro (busca, só quem falta, copiar, imprimir, tour, atrasados com WhatsApp, faixa
       da semana) e, no Novo agendamento, avisos de contexto (já tem horário? carro no pátio? orçamento?) e a
       linha "marcar rápido".
   ============================================================================ */
(function (root) {
  'use strict';
  const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const DOW_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const emMin = (hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : NaN; };
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  /** 45 → "45 min", 60 → "1h", 90 → "1h30", 300 → "5h". */
  function duracaoLabel(min) {
    const n = Math.round(Number(min));
    if (!(n > 0)) return '';
    if (n < 60) return `${n} min`;
    const h = Math.floor(n / 60), r = n % 60;
    return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
  }
  /** Hora em que o serviço termina (só informa; passa das 17h30 vira "17:30+"). */
  function fimDoServico(hora, min, fecha = 17 * 60 + 30) {
    const i = emMin(hora); if (!Number.isFinite(i) || !(min > 0)) return '';
    const f = i + Math.round(min);
    return f > fecha ? hm(fecha) + '+' : hm(f);
  }
  /**
   * Quantas linhas de 30 min o serviço ocupa DEPOIS da linha em que começa, sem passar do próximo cartão da
   * mesma coluna nem do fim do expediente. `proximos` = minutos de início dos outros cartões da coluna.
   */
  function caudaDoCartao(inicio, duracaoMin, proximos = [], { passo = 30, fecha = 17 * 60 + 30 } = {}) {
    if (!(duracaoMin > passo) || !Number.isFinite(inicio)) return 0;
    const fimServico = Math.min(inicio + duracaoMin, fecha);
    const limite = proximos.filter((p) => p > inicio).sort((a, b) => a - b)[0];
    const fim = Math.min(fimServico, Number.isFinite(limite) ? limite : fimServico);
    return Math.max(0, Math.ceil((fim - inicio) / passo) - 1);
  }
  /** Carga do consultor no dia: minutos de serviço dos horários que contam. */
  function cargaEmMin(lista, duracoes, consultorId) {
    return (lista || []).filter((a) => (a.consultor_id || null) === (consultorId || null) && ['aguardando', 'confirmado', 'compareceu', 'em_atendimento', 'concluido', 'nao_fechou'].includes(a.status))
      .reduce((s, a) => s + (Number(duracoes && duracoes[a.id]) || 60), 0);
  }
  /** Filtro do Quadro: texto (nome, placa, telefone, serviço, carro) e "só quem falta chegar". */
  function filtrarCartoes(lista, { busca = '', soFalta = false } = {}) {
    const t = semAcento(busca).trim();
    const dig = String(busca).replace(/\D/g, '');
    return (lista || []).filter((a) => {
      if (soFalta && !['aguardando', 'confirmado'].includes(a.status)) return false;
      if (!t) return true;
      const alvo = semAcento([a.cliente_nome, a.placa, a.veiculo, a.servico].join(' ')).replace(/[^a-z0-9 ]/g, ' ');
      if (t.split(/\s+/).every((p) => alvo.includes(p.replace(/[^a-z0-9]/g, '')))) return true;
      return dig.length >= 4 && String(a.telefone || '').replace(/\D/g, '').includes(dig);
    });
  }
  /** Texto do dia para colar no WhatsApp da equipe: um horário por linha, agrupado por consultor. */
  function textoDoDia(lista, data, { duracoes = {}, nomeOficina = 'IndyCar' } = {}) {
    const vivos = (lista || []).filter((a) => a.status !== 'cancelado').sort((x, y) => String(x.hora).localeCompare(String(y.hora)));
    const [, m, d] = data.split('-');
    const dow = DOW_LONGO[new Date(data + 'T12:00:00Z').getUTCDay()];
    const linhas = [`*${nomeOficina} — agenda de ${dow}, ${d}/${m}*`, `${vivos.length} horário${vivos.length === 1 ? '' : 's'}`];
    if (!vivos.length) return linhas.concat('Nenhum horário marcado.').join('\n');
    const grupos = new Map();
    for (const x of vivos) { const k = x.consultor_nome || 'Sem consultor'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); }
    for (const [nome, itens] of grupos) {
      linhas.push('', `*${nome}* (${itens.length})`);
      for (const x of itens) {
        const dur = duracaoLabel(duracoes[x.id]);
        const marca = x.status === 'nao_veio' ? ' ✖ não veio' : ['compareceu', 'em_atendimento', 'concluido', 'nao_fechou'].includes(x.status) ? ' ✔' : '';
        linhas.push(`${String(x.hora).slice(0, 5)} ${x.cliente_nome} — ${x.servico || ''}${x.veiculo || x.placa ? ' (' + [x.veiculo, x.placa].filter(Boolean).join(' ') + ')' : ''}${dur ? ' · ' + dur : ''}${marca}`);
      }
    }
    return linhas.join('\n');
  }
  /** wa.me com texto pronto para um horário (telefone nacional ou com 55). */
  function linkWhatsApp(telefone, texto) {
    let d = String(telefone || '').replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    if (!/^55\d{10,11}$/.test(d)) return null;
    return `https://wa.me/${d}?text=${encodeURIComponent(String(texto || '').slice(0, 900))}`;
  }
  /** Mensagem para quem está atrasado: curta, sem cobrança. */
  function textoDoAtrasado(a, atrasoMin) {
    const primeiro = String(a.cliente_nome || '').trim().split(/\s+/)[0] || 'tudo bem';
    return `Oi ${primeiro}, tudo bem? Aqui é da IndyCar 🏁 Seu horário de ${a.servico || 'hoje'} era às ${String(a.hora).slice(0, 5)}${atrasoMin >= 5 ? ` (já passou ${atrasoMin} min)` : ''}. Você vem? Se precisar, a gente reajusta o horário.`;
  }
  /** Quem passou do horário e ainda não chegou (hoje), do mais atrasado para o menos. */
  function atrasados(lista, agoraMin, folga = 10) {
    return (lista || []).filter((a) => ['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1 && emMin(a.hora) < agoraMin - folga)
      .map((a) => ({ a, atraso: agoraMin - emMin(a.hora) })).sort((x, y) => y.atraso - x.atraso);
  }
  /** Rótulo de um dia da faixa da semana: "ter 21". */
  const rotuloDiaCurto = (iso) => `${DOW[new Date(iso + 'T12:00:00Z').getUTCDay()]} ${iso.slice(8, 10)}`;

  /* ---------------------- "marcar rápido": uma linha vira um horário quase pronto ---------------------- */
  const PADRAO_TEL = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/;
  const PADRAO_PLACA = /\b[a-z]{3}-?\d[a-z0-9]\d{2}\b/i;
  const DIAS_SEM = { dom: 0, domingo: 0, seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6 };
  const CARROS = /^(gol|onix|hb20|corolla|civic|palio|uno|fox|polo|argo|mobi|kwid|creta|compass|ka|fiesta|focus|celta|corsa|cruze|tracker|strada|saveiro|siena|etios|yaris|sandero|logan|duster|ranger|hilux|s10|l200|amarok|fusca|up|virtus|nivus|t-cross|tcross|renegade|toro|montana|spin|prisma|cobalt|versa|kicks|march|hr-v|hrv|fit|city)$/i;
  const titulo = (t) => String(t).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, e, c) => e + c.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());
  function parseRapido(texto, hojeIso, servicos = []) {
    let t = ' ' + String(texto || '').replace(/\s+/g, ' ').trim() + ' ';
    const r = { cliente_nome: '', telefone: '', placa: '', hora: '', data: '', servico: '', veiculo: '' };
    const tira = (re) => { const m = re.exec(t); if (!m) return null; t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); return m; };
    let m = tira(PADRAO_TEL);
    if (m) { let d = m[0].replace(/\D/g, ''); if (d.length >= 12 && d.startsWith('55')) d = d.slice(2); r.telefone = d; }
    m = tira(PADRAO_PLACA); if (m) r.placa = m[0].toUpperCase().replace('-', '');
    m = tira(/(?:\bàs?\s+|\bas\s+)?\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?(?!\d)/i);
    if (m) r.hora = `${String(+m[1]).padStart(2, '0')}:${m[2] || '00'}`;
    const s = semAcento(t);
    let dia = null;
    const mdm = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
    if (mdm) {
      const ano = mdm[3] ? (mdm[3].length === 2 ? 2000 + +mdm[3] : +mdm[3]) : +hojeIso.slice(0, 4);
      let iso = `${ano}-${String(+mdm[2]).padStart(2, '0')}-${String(+mdm[1]).padStart(2, '0')}`;
      if (!mdm[3] && iso < hojeIso) iso = `${ano + 1}${iso.slice(4)}`;
      if (!Number.isNaN(Date.parse(iso + 'T12:00:00Z'))) dia = iso;
      t = t.replace(mdm[0], ' ');
    } else if (/\bdepois de amanha\b/.test(s)) { dia = maisDias(hojeIso, 2); t = t.replace(/depois de aman[hã]+/i, ' '); }
    else if (/\bamanha\b/.test(s)) { dia = maisDias(hojeIso, 1); t = t.replace(/aman[hã]+/i, ' '); }
    else if (/\bhoje\b/.test(s)) { dia = hojeIso; t = t.replace(/hoje/i, ' '); }
    else {
      const w = /\b(domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|dom|seg|ter|qua|qui|sex|sab)\b/i.exec(t);
      if (w) {
        const alvo = DIAS_SEM[semAcento(w[1])];
        const hojeDow = new Date(hojeIso + 'T12:00:00Z').getUTCDay();
        dia = maisDias(hojeIso, ((alvo - hojeDow + 7) % 7) || 7);
        t = t.replace(w[0], ' ');
      }
    }
    if (dia) r.data = dia;
    // serviço do catálogo: o nome mais longo que aparece no que sobrou (ou uma palavra-chave dele com 4+ letras)
    const sobra = ' ' + semAcento(t).replace(/[^a-z0-9 ]/g, ' ') + ' ';
    let melhor = null;
    for (const sv of servicos || []) {
      const n = semAcento(sv.nome).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); if (!n) continue;
      const palavras = n.split(' ').filter((p) => p.length >= 4);
      let pontos = 0, quais = [];
      if (sobra.includes(` ${n} `)) { pontos = n.length + 100; quais = n.split(' '); }
      else { const achou = palavras.filter((p) => sobra.includes(` ${p} `) || sobra.includes(` ${p.slice(0, -1)}`)); if (achou.length) { pontos = achou.join('').length; quais = achou; } }
      if (pontos && (!melhor || pontos > melhor.pontos)) melhor = { sv, pontos, quais };
    }
    if (melhor) {
      r.servico = melhor.sv.nome;
      t = t.split(' ').filter((tok) => { const nt = semAcento(tok).replace(/[^a-z0-9]/g, ''); return !(nt && melhor.quais.some((q) => nt === q || nt === q.slice(0, -1) || (nt.length >= 4 && q.startsWith(nt)))); }).join(' ');
    }
    const resto = t.replace(/\b(as|às|dia|com|para|pra|no|na|em|um|uma|marcar|marca|agendar)\b/gi, ' ').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    const nomePal = [], carroPal = [];
    let noCarro = false;
    for (const p of resto.split(' ').filter(Boolean)) {
      if (!noCarro && nomePal.length >= 1 && CARROS.test(p)) noCarro = true;
      (noCarro ? carroPal : nomePal).push(p);
    }
    r.cliente_nome = titulo(nomePal.join(' ').replace(/^(de|do|da)\s+/i, '').replace(/\s+(de|do|da)$/i, ''));
    r.veiculo = titulo(carroPal.join(' '));
    return r;
  }
  /** O que ainda falta para o horário poder ser salvo (a linha diz em voz alta). */
  function faltaNoRapido(r) { const f = []; if (!r.cliente_nome) f.push('nome'); if (!r.servico) f.push('serviço'); if (!r.data) f.push('dia'); if (!r.hora) f.push('hora'); return f; }

  const PURO = { duracaoLabel, fimDoServico, caudaDoCartao, cargaEmMin, filtrarCartoes, textoDoDia, linkWhatsApp, textoDoAtrasado, atrasados, rotuloDiaCurto, parseRapido, faltaNoRapido, emMin, hm, maisDias, semAcento };
  root.R6cPuro = PURO;
  if (typeof document === 'undefined') return;

  /* ================================ TELA ================================ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const semAcesso = () => (typeof emPresenca === 'function' && emPresenca()) || (typeof state !== 'undefined' && state.perfil && state.perfil.papel === 'agenda');
  const Q = () => (root.R6b && root.R6b.estado) || {};
  const LS_TOUR = 'indycar_tour_quadro_v1';
  const lerLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

  /** Pedaço de HTML da duração no cartão: "~1h30 · até 10:30". */
  function duracaoHtml(a, duracoes) {
    const min = duracoes && duracoes[a.id];
    if (!(min > 0)) return '';
    const fim = fimDoServico(String(a.hora).slice(0, 5), min);
    return `<div class="qd-dur" title="Duração estimada do serviço (cadastro de serviços): só organiza a oficina, não bloqueia horário">⏱ ~${esc(duracaoLabel(min))}${fim ? ` · até ${esc(fim)}` : ''}</div>`;
  }

  /* ---------- ferramentas do Quadro ---------- */
  function montarFerramentas() {
    if (semAcesso()) return;
    const antes = $('#qdChips'); if (!antes || $('#qdFerr')) return;
    const q = Q();
    const box = document.createElement('div');
    box.id = 'qdFerr'; box.className = 'qd-ferr';
    box.innerHTML = `<input type="search" id="qdBusca" class="qd-busca" placeholder="Achar no quadro: nome, placa, telefone…" aria-label="Achar no quadro" value="${esc(q.busca || '')}" autocomplete="off">
      <label class="qd-opt"><input type="checkbox" id="qdSoFalta" ${q.soFalta ? 'checked' : ''}> só quem falta chegar</label>
      <button type="button" class="btn mini" id="qdAtrasados" hidden></button>
      <button type="button" class="btn mini" id="qdCopiar" title="Copia a agenda do dia em texto, pronta para o WhatsApp da equipe">📋 Copiar o dia</button>
      <button type="button" class="btn mini" id="qdImprimir" title="Imprime o quadro do dia">🖨 Imprimir</button>
      <button type="button" class="btn mini" id="qdTour" title="Mostra de novo o tour do Quadro">? Tour</button>`;
    antes.parentNode.insertBefore(box, antes);
    const faixa = document.createElement('div'); faixa.id = 'qdSemana'; faixa.className = 'qd-semana'; faixa.setAttribute('role', 'group'); faixa.setAttribute('aria-label', 'Próximos dias');
    box.parentNode.insertBefore(faixa, box);
    const painel = document.createElement('div'); painel.id = 'qdPainelAtrasados'; painel.className = 'qd-atrasados'; painel.hidden = true;
    antes.parentNode.insertBefore(painel, antes);
    const redesenhar = () => root.R6b && root.R6b.redesenhar && root.R6b.redesenhar();
    $('#qdBusca').addEventListener('input', (e) => { Q().busca = e.target.value; redesenhar(); });
    $('#qdSoFalta').addEventListener('change', (e) => { Q().soFalta = e.target.checked; redesenhar(); });
    $('#qdCopiar').addEventListener('click', copiarDia);
    $('#qdImprimir').addEventListener('click', () => { document.body.classList.add('imprimindo-quadro'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('imprimindo-quadro'), 300); }, 50); });
    $('#qdTour').addEventListener('click', () => tourDoQuadro(true));
    $('#qdAtrasados').addEventListener('click', () => { painel.hidden = !painel.hidden; });
  }

  async function copiarDia() {
    const d = Q().dados; if (!d) return toast('Espere o quadro carregar.', 'err');
    const nome = (typeof state !== 'undefined' && state.empresa && state.empresa.nome) || 'IndyCar';
    const txt = textoDoDia(d.lista, d.data, { duracoes: d.duracoes || {}, nomeOficina: nome.split(' ')[0] });
    try { await navigator.clipboard.writeText(txt); toast('Agenda do dia copiada — é só colar no WhatsApp ✅'); }
    catch { window.prompt('Copie o texto (Ctrl+C):', txt); }
  }

  function aposDesenhar(d) {
    if (semAcesso() || !d) return;
    montarFerramentas();
    const hojeFlag = d.data === agoraSP().data;
    const btn = $('#qdAtrasados'), painel = $('#qdPainelAtrasados');
    if (btn && painel) {
      const lista = hojeFlag ? atrasados(d.lista, agoraSP().min) : [];
      btn.hidden = !lista.length;
      btn.textContent = `⏰ ${lista.length} atrasado${lista.length === 1 ? '' : 's'}`;
      if (!lista.length) painel.hidden = true;
      painel.innerHTML = lista.length ? `<b>Passaram do horário e não chegaram</b><ul>${lista.map(({ a, atraso }) => {
        const wa = a.telefone ? linkWhatsApp(a.telefone, textoDoAtrasado(a, atraso)) : null;
        return `<li><span><b>${esc(String(a.hora).slice(0, 5))}</b> ${esc(a.cliente_nome)} <small class="muted">· ${esc(a.servico || '')} · ${atraso} min</small></span>
          ${wa ? `<a class="btn mini" href="${esc(wa)}" target="_blank" rel="noopener">💬 Perguntar se vem</a>` : '<small class="muted">sem telefone</small>'}
          <button type="button" class="btn mini" data-qd-atr-abrir="${esc(a.id)}">Abrir</button></li>`; }).join('')}</ul>` : '';
      $$('[data-qd-atr-abrir]', painel).forEach((b) => b.addEventListener('click', () => openAgendamentoModal(b.dataset.qdAtrAbrir)));
    }
    desenharSemana(d.data);
    if (!lerLS(LS_TOUR)) setTimeout(() => { if (state.route === 'quadro' && !document.querySelector('#tour, .modal-backdrop:not([hidden])')) tourDoQuadro(); }, 700);
  }

  /* ---------- faixa da semana ---------- */
  const _semana = { chave: '', dados: null, em: 0 };
  async function desenharSemana(dataAtual) {
    const box = $('#qdSemana'); if (!box) return;
    const desde = dataAtual;
    let dias = _semana.chave === desde && Date.now() - _semana.em < 60_000 ? _semana.dados : null;
    if (!dias) {
      try { dias = (await api('GET', '/quadro/semana?data=' + encodeURIComponent(desde) + '&dias=7', null, { repetir: false })).dias; _semana.chave = desde; _semana.dados = dias; _semana.em = Date.now(); }
      catch { box.innerHTML = ''; return; }
    }
    if (!box.isConnected) return;
    const hoje = agoraSP().data;
    box.innerHTML = dias.map((x) => `<button type="button" class="qd-dia${x.data === dataAtual ? ' atual' : ''}${x.data === hoje ? ' hoje' : ''}${x.aberto ? '' : ' fechado'}" data-qd-dia="${esc(x.data)}" aria-pressed="${x.data === dataAtual}"
        aria-label="${esc(rotuloDiaCurto(x.data))}: ${x.aberto ? x.total + ' horários' : 'oficina fechada'}" title="${x.aberto ? x.vivos + ' ainda por vir' + (x.faltaram ? ' · ' + x.faltaram + ' não vieram' : '') : 'A oficina não abre'}">
        <span class="qd-dia-n">${esc(rotuloDiaCurto(x.data))}</span><b>${x.aberto ? x.total : '–'}</b>
        ${x.lotacao !== null ? `<span class="qd-lot" aria-hidden="true"><i data-lot="${x.lotacao}"></i></span>` : ''}</button>`).join('');
    $$('[data-lot]', box).forEach((i) => { i.style.width = Math.max(4, Number(i.dataset.lot)) + '%'; });
    $$('[data-qd-dia]', box).forEach((b) => b.addEventListener('click', () => {
      const e = $('#qdData'); if (e) { e.value = b.dataset.qdDia; e.dispatchEvent(new Event('change', { bubbles: true })); }
    }));
  }

  /* ---------- tour curto do Quadro ---------- */
  const PASSOS_TOUR = [
    { alvo: '#qdSemana', titulo: 'A semana de relance', texto: 'Cada botão é um dia com o número de horários e a barra de lotação. Toque para ir direto.' },
    { alvo: '.qd-grade', titulo: 'Uma coluna por consultor', texto: 'Linhas de 30 min. O cartão mostra a duração do serviço e as linhas de baixo ficam marcadas até o fim dele.' },
    { alvo: '.qd-card [data-qd="mover"]', titulo: 'Remarcar sem abrir nada', texto: 'Arraste o cartão ou toque em ⇄ Mover: as células verdes são as que cabem. Errou? "Desfazer" no recado.' },
    { alvo: '#qdBusca', titulo: 'Achar alguém', texto: 'Digite nome, placa ou telefone: o quadro mostra só quem combina.' },
    { alvo: '#qdCopiar', titulo: 'Passar o dia para a equipe', texto: 'Copia a agenda do dia em texto, por consultor, pronta para o WhatsApp.' },
  ];
  function tourDoQuadro(forcar) {
    if (semAcesso()) return;
    if (!forcar && lerLS(LS_TOUR)) return;
    $('#tour')?.remove();
    const passos = PASSOS_TOUR.filter((p) => { const e = $(p.alvo); return e && e.offsetParent !== null; });
    if (!passos.length) return;
    let i = 0;
    const caixa = document.createElement('div');
    caixa.className = 'tour'; caixa.id = 'tour'; caixa.setAttribute('role', 'dialog'); caixa.setAttribute('aria-labelledby', 'tourTitulo');
    document.body.append(caixa);
    const fecha = () => { gravarLS(LS_TOUR, '1'); $$('.tour-alvo').forEach((x) => x.classList.remove('tour-alvo')); caixa.remove(); };
    const pinta = () => {
      $$('.tour-alvo').forEach((x) => x.classList.remove('tour-alvo'));
      const p = passos[i], alvo = $(p.alvo);
      if (alvo) { alvo.classList.add('tour-alvo'); alvo.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
      caixa.innerHTML = `<div class="tour-passo">${i + 1} de ${passos.length}</div><h3 id="tourTitulo">${esc(p.titulo)}</h3><p>${esc(p.texto)}</p>
        <div class="tour-botoes"><button type="button" class="btn" id="tqPular">Pular</button>${i ? '<button type="button" class="btn" id="tqVoltar">Voltar</button>' : ''}
        <button type="button" class="btn primary" id="tqProx">${i === passos.length - 1 ? 'Entendi 🏁' : 'Próximo'}</button></div>`;
      const w = Math.min(340, innerWidth - 24), r = alvo ? alvo.getBoundingClientRect() : null;
      caixa.style.width = w + 'px';
      caixa.classList.toggle('centro', !r);
      if (r) { caixa.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px'; caixa.style.top = (r.bottom + 12 + 190 < innerHeight ? r.bottom + 12 : Math.max(12, r.top - 12 - 190)) + 'px'; }
      $('#tqPular').addEventListener('click', fecha);
      $('#tqVoltar')?.addEventListener('click', () => { i--; pinta(); });
      $('#tqProx').addEventListener('click', () => { if (i === passos.length - 1) return fecha(); i++; pinta(); });
      $('#tqProx').focus({ preventScroll: true });
    };
    caixa.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fecha(); } });
    pinta();
  }

  /* ---------- Novo agendamento: "marcar rápido" e avisos de contexto ---------- */
  function preencher(campo, valor) {
    const el = document.getElementById(campo); if (!el || valor === '' || valor == null) return false;
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  const CAMPO_DE = { nome: 'f_nome', serviço: 'f_serv', dia: 'f_data', hora: 'f_hora' };
  function aoAbrirFormulario({ id, a, pre } = {}) {
    if (semAcesso()) return;
    const box = document.getElementById('f_rapido');
    if (box && !id) {
      box.hidden = false;
      box.innerHTML = `<label for="f_rapido_txt"><b>⚡ Marcar rápido</b> <small class="muted">escreva tudo numa linha e aperte Enter</small></label>
        <div class="linha"><input id="f_rapido_txt" autocomplete="off" placeholder="Ana Souza 12 99182-1234 óleo amanhã 10h gol abc1d23" aria-describedby="f_rapido_dica">
        <button type="button" class="btn" id="f_rapido_ok">Preencher</button></div><span class="dica" id="f_rapido_dica" aria-live="polite"></span>`;
      const aplicar = () => {
        const txt = document.getElementById('f_rapido_txt').value; if (!txt.trim()) return;
        const r = parseRapido(txt, agoraSP().data, state.servicos || []);
        preencher('f_nome', r.cliente_nome); preencher('f_tel', r.telefone ? mascaraTelefone(r.telefone) : ''); preencher('f_placa', r.placa);
        preencher('f_veic', r.veiculo); preencher('f_serv', r.servico); preencher('f_data', r.data); preencher('f_hora', r.hora);
        const falta = faltaNoRapido(r);
        const dica = document.getElementById('f_rapido_dica');
        dica.textContent = falta.length ? `Preenchi o que entendi. Falta: ${falta.join(', ')}.` : 'Tudo preenchido — confira e salve.';
        if (falta.length) document.getElementById(CAMPO_DE[falta[0]])?.focus(); else document.getElementById('f_save')?.focus();
      };
      document.getElementById('f_rapido_ok').addEventListener('click', aplicar);
      document.getElementById('f_rapido_txt').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } });
      if (!(pre && (pre.telefone || pre.cliente_nome || pre.cliente_id))) setTimeout(() => document.getElementById('f_rapido_txt')?.focus(), 60);
    }
    // contexto: já tem horário? carro no pátio? orçamento?
    const ctx = document.getElementById('f_ctx6c'); if (!ctx) return;
    let vez = 0;
    const consultar = async () => {
      const tel = document.getElementById('f_tel')?.value || '', placa = document.getElementById('f_placa')?.value || '';
      const minha = ++vez;
      if (nacionalDe(tel).length < 10 && placaDe(placa).length < 7) { ctx.innerHTML = ''; return; }
      try {
        const r = await api('GET', `/contexto-cliente?tel=${encodeURIComponent(tel)}&placa=${encodeURIComponent(placa)}${id ? '&ignorar=' + encodeURIComponent(id) : ''}`, null, { repetir: false });
        if (minha !== vez || !ctx.isConnected) return;
        ctx.innerHTML = (r.avisos || []).map((v) => {
          const alvo = v.tipo === 'futuro' ? r.futuros[0] : v.tipo === 'patio' ? r.patio[0] : (r.orcamentos.find((o) => (v.texto.includes(o.numero_rotulo))) || r.orcamentos[0]);
          const bot = v.tipo === 'futuro' ? `<button type="button" class="btn mini" data-r6c-ag="${esc(alvo.id)}">Abrir esse horário</button>`
            : alvo ? `<a class="btn mini" href="${esc(alvo.abrir)}" data-r6c-app>${v.tipo === 'patio' ? 'Abrir no Pátio' : 'Abrir o orçamento'} ↗</a>` : '';
          return `<div class="aviso ${esc(v.tom)}"><span>${v.tipo === 'futuro' ? '📅' : v.tipo === 'patio' ? '🔧' : '🧾'} ${esc(v.texto)}</span>${bot}</div>`;
        }).join('');
        ctx.querySelectorAll('[data-r6c-ag]').forEach((b) => b.addEventListener('click', () => { closeModal(); openAgendamentoModal(b.dataset.r6cAg); }));
        ctx.querySelectorAll('[data-r6c-app]').forEach((b) => b.addEventListener('click', (e) => { if (root.IndyCarApps && IndyCarApps.abrir) { e.preventDefault(); IndyCarApps.abrir(b.href); } }));
      } catch { if (minha === vez) ctx.innerHTML = ''; }
    };
    const deb = debounce(consultar, 350);
    for (const k of ['f_tel', 'f_placa']) { const el = document.getElementById(k); el?.addEventListener('input', deb); el?.addEventListener('change', deb); }
    consultar();
  }
  const nacionalDe = (t) => { const d = String(t || '').replace(/\D/g, ''); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d; };
  const placaDe = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  root.R6c = { montarFerramentas, aposDesenhar, duracaoHtml, tourDoQuadro, aoAbrirFormulario, PURO,
    filtrar: (lista) => filtrarCartoes(lista, { busca: Q().busca || '', soFalta: !!Q().soFalta }) };
})(typeof globalThis !== 'undefined' ? globalThis : window);
