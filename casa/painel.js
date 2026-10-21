/* Casa — painel de comando (rodada 6): "Agora" (pátio com etapa ao vivo, orçamentos esperando,
   conversas sem resposta, horários de hoje, leads), "Pede atenção agora", ações rápidas e a
   visão do dono (faturamento, conversão, gargalos). Tudo numa chamada de banco por vez
   (r6_agora (X3) + r6_c1_agora_extras / r6_c1_painel_dono), com tempo real e relógio de reserva. */
(function () {
  'use strict';
  const MOD = { nome: 'painel' };
  const LS_VISAO = 'indycar_central_visao';
  let C = null, L = null, V = null, links = null;
  let canal = null, timerPoll = null, timerRelogio = null, deb = null;
  let visao = 'operacao', ultima = 0, ultimaDono = 0, carregando = false, filtroHoje = 'todos', dados = null, dono = null, emFalha = false, online = true;

  const $ = (s) => document.querySelector(s);
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

  /* ---------------- pedaços de HTML ---------------- */
  const alvo = (app) => `target="${C.esc(L.nomeDaAba(app))}"`;
  const linkA = (url, app, classe, html, extra = '') => `<a class="${classe}" href="${C.esc(url)}" ${alvo(app)} ${extra}>${html}</a>`;
  const W = () => window.CasaLogica3;
  /** botão de WhatsApp com a mensagem pronta (o consultor só aperta enviar); abre na aba nomeada do WhatsApp */
  function waBtn(tipo, i, hojeIso, data) {
    const a = W() && W().acaoDaLinha(tipo, i, hojeIso, data);
    if (!a) return '';
    return `<a class="wa-mini" href="${C.esc(a.url)}" target="${C.esc(L.nomeDaAba('whatsapp'))}" rel="noopener noreferrer" title="Abre o WhatsApp com a mensagem pronta" aria-label="${C.esc(a.rotulo)} ${C.esc(i.nome || 'cliente')} pelo WhatsApp">💬 ${C.esc(a.rotulo)}</a>`;
  }
  const itemLi = (inner, wa) => (wa ? `<li class="com-acao">${inner}${wa}</li>` : `<li>${inner}</li>`);
  function pilula(texto, tom) { return `<span class="pil${tom ? ' pil-' + tom : ''}">${C.esc(texto)}</span>`; }

  function cartao(id, { num, det, linhas, erro }) {
    const el = $(id);
    el.hidden = false;
    const n = el.querySelector('[data-num]'); if (n) n.textContent = num;
    const d = el.querySelector('[data-det]'); if (d) d.textContent = det;
    const l = el.querySelector('[data-lista]');
    const ensina = window.CasaLogica2 && window.CasaLogica2.VAZIOS[el.id];
    if (l) l.innerHTML = erro ? `<li class="vazio vazio-erro">${C.esc(erro)} <button type="button" class="btn-link" data-recarregar>tentar de novo</button></li>` : (linhas || (ensina && Number(num) === 0 ? `<li class="vazio vazio-ensina"><b>${C.esc(ensina.texto)}</b><span>${C.esc(ensina.dica)}</span></li>` : ''));
    el.classList.toggle('carregou', !erro);
  }
  function rodapeLinks(id, mapa) {
    const el = $(id);
    for (const [seletor, [url, app]] of Object.entries(mapa)) {
      const a = el.querySelector(seletor);
      if (!a) continue;
      a.setAttribute('href', url); a.setAttribute('target', L.nomeDaAba(app));
    }
  }

  /* ---------------- cartões do "Agora" ---------------- */
  function desenharPatio(p, proprios) {
    const lista = p.lista || [];
    const agora = Date.now();
    const rotulo = $('#cPatio .agora-rotulo');
    if (rotulo) rotulo.textContent = V.soMeusCarros ? 'Meus carros no pátio' : 'Carros no pátio';
    const etapas = $('#cPatio [data-etapas]');
    etapas.innerHTML = L.ETAPAS.filter((e) => Number(p.por_etapa?.[e.k]) > 0).map((e) =>
      `<span class="chip-etapa et-${C.esc(e.k)}" title="${C.esc(e.rotulo)}"><b>${Number(p.por_etapa[e.k])}</b> ${C.esc(e.rotulo)}</span>`).join('');
    const partes = [];
    if (p.prontos) partes.push(`${p.prontos} pronto${p.prontos > 1 ? 's' : ''} para retirar`);
    if (p.atrasados) partes.push(`${p.atrasados} com previsão vencida`);
    if (p.extras_pendentes) partes.push(`${p.extras_pendentes} extra${p.extras_pendentes > 1 ? 's' : ''} esperando aprovação`);
    cartao('#cPatio', {
      num: String(p.total || 0),
      det: p.total ? 'dentro da oficina' + (partes.length ? ' · ' + partes.join(' · ') : '') : (V.soMeusCarros ? 'nenhum carro com você agora' : 'pátio vazio agora'),
      linhas: lista.map((o) => {
        const tom = L.tomDaEtapa(o.etapa, o.etapa_em, agora);
        const prev = L.previsao(o.previsao_entrega, o.etapa, agora);
        const carro = [o.veiculo || o.nome || 'Carro', o.placa ? L.formatarPlaca(o.placa) : ''].filter(Boolean).join(' · ');
        return itemLi(linkA(links.os(o.id), 'patio', 'linha linha-2' + (proprios ? ' meu' : ''),
          `<span class="l-a"><b>#${C.esc(o.numero)}</b> ${C.esc(carro)}${o.extras_pendentes > 0 ? ` <span class="pil pil-aviso" title="serviços extras esperando o cliente">${o.extras_pendentes} extra${o.extras_pendentes > 1 ? 's' : ''}</span>` : ''}</span>` +
          `<span class="l-b">${pilula(L.rotuloEtapa(o.etapa), tom === 'atrasado' ? 'ruim' : tom === 'atencao' ? 'aviso' : o.etapa === 'pronto' ? 'bom' : '')} <span class="tempo tempo-${tom}">${C.esc(L.duracao(agora - Date.parse(o.etapa_em)))}</span></span>` +
          `<span class="l-c">${C.esc(o.nome || '')}${prev.texto ? ` · <span class="${prev.atrasada ? 'txt-ruim' : ''}">${C.esc(prev.texto)}</span>` : ''}</span>`, 'data-os="' + C.esc(o.id) + '"'), o.etapa === 'pronto' ? waBtn('pronto', o, hojeIso()) : '');
      }).join(''),
    });
    rodapeLinks('#cPatio', { '[data-abrir]': [links.patioPainel(), 'patio'], '[data-tv]': [links.patioTv(), 'patio'], '[data-nova]': [links.patioEntrada(), 'patio'] });
    $('#cPatio [data-nova]').hidden = V.soMeusCarros;
  }

  const hojeIso = () => (dados && dados.hoje) || L.hojeSP();
  function desenharOrc(o) {
    const lista = o.lista || [];
    const agora = Date.now();
    const partes = [];
    if (o.vistos) partes.push(`${o.vistos} já ${o.vistos > 1 ? 'viram' : 'viu'} a proposta`);
    if (o.aprovados_sem_horario) partes.push(`${o.aprovados_sem_horario} aprovado${o.aprovados_sem_horario > 1 ? 's' : ''} sem horário`);
    if (o.recusados_7d) partes.push(`${o.recusados_7d} recusado${o.recusados_7d > 1 ? 's' : ''} em 7 dias`);
    cartao('#cOrc', {
      num: String(o.esperando || 0),
      det: o.esperando ? (partes.join(' · ') || 'esperando o cliente decidir') : (partes.join(' · ') || 'nenhum orçamento esperando'),
      linhas: lista.map((q) => {
        const idade = q.enviado_em ? agora - Date.parse(q.enviado_em) : 0;
        return itemLi(linkA(links.orcamento(q.id), 'orcador', 'linha',
          `<span class="l-a"><b>${C.esc(L.numeroOrc(q.numero))}</b> ${C.esc(q.nome || 'Cliente')}${q.visualizado_em ? ' <span class="pil pil-bom" title="o cliente abriu o link">visto</span>' : ''}</span>` +
          `<span class="l-b">${C.esc(L.brl(q.total))} · <span class="tempo tempo-${idade > 24 * 36e5 ? 'atrasado' : idade > 6 * 36e5 ? 'atencao' : 'ok'}">${C.esc(q.enviado_em ? L.duracao(idade) : '')}</span></span>`), idade > 6 * 36e5 ? waBtn('orcamento', q, hojeIso()) : '');
      }).join('') + (o.aprovados || []).map((q) => itemLi(linkA(links.orcamento(q.id), 'orcador', 'linha',
          `<span class="l-a"><b>${C.esc(L.numeroOrc(q.numero))}</b> ${C.esc(q.nome || 'Cliente')} ${pilula('aprovado · sem horário', 'bom')}</span><span class="l-b">${C.esc(L.brl(q.total))}</span>`),
          waBtn('aprovado', q, hojeIso()) + (q.telefone && C.podeUsar('agenda') ? `<a class="wa-mini wa-agenda" href="${C.esc(links.agendaNovo({ telefone: q.telefone }))}" target="${C.esc(L.nomeDaAba('agenda'))}" aria-label="Marcar horário para ${C.esc(q.nome || 'cliente')} na Agenda">📅 Marcar</a>` : ''))).join(''),
    });
    rodapeLinks('#cOrc', { '[data-abrir]': [links.orcamentosLista(), 'orcador'], '[data-nova]': [links.novoOrcamento(), 'orcador'] });
  }

  function desenharConversas(c) {
    const agora = Date.now();
    const antigas = c.antigas ? ` · ${c.antigas} há mais de 7 dias` : '';
    cartao('#cConversas', {
      num: String(c.esperando || 0),
      det: (c.esperando ? 'esperando consultor' : 'ninguém esperando agora') + antigas + ` · ${c.nao_lidas || 0} com mensagem não lida`,
      linhas: (c.lista || []).map((v) => {
        const espera = agora - Date.parse(v.aguardando_desde);
        return `<li>${linkA(links.conversa(v.id), 'atendimento', 'linha linha-2',
          `<span class="l-a">${C.esc(v.nome || (v.telefone ? L.formatarTelefone(v.telefone) : 'Cliente'))}</span>` +
          `<span class="l-b"><span class="tempo tempo-${espera > 2 * 36e5 ? 'atrasado' : espera > 30 * 6e4 ? 'atencao' : 'ok'}">${C.esc(L.duracao(espera))}</span></span>` +
          `<span class="l-c">${C.esc(v.previa || '')}</span>`)}</li>`;
      }).join(''),
    });
    rodapeLinks('#cConversas', { '[data-abrir]': [c.lista?.[0] ? links.conversa(c.lista[0].id) : links.conversa(), 'atendimento'] });
  }

  function desenharHoje(a) {
    const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: L.FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const todos = a.lista || [];
    const porVir = todos.filter((x) => L.hora5(x.hora) >= hm && ['aguardando', 'confirmado'].includes(x.status));
    const por = filtroHoje === 'vir' ? porVir : filtroHoje === 'chegou' ? todos.filter((x) => L.CHEGARAM.includes(x.status) || x.os_id) : todos;
    const partes = [];
    if (a.total) partes.push(`${a.chegaram || 0} já chegaram`, `${porVir.length} por vir`);
    if (a.sem_confirmar) partes.push(`${a.sem_confirmar} sem confirmar`);
    if (a.faltaram) partes.push(`${a.faltaram} não veio`);
    cartao('#cHoje', {
      num: String(a.total || 0),
      det: a.total ? partes.join(' · ') : 'nenhum horário marcado hoje',
      linhas: (a.total > 1 ? `<li class="filtro-hoje" role="group" aria-label="Filtrar horários de hoje">${[['todos', 'Todos'], ['vir', 'Por vir'], ['chegou', 'Na oficina']].map(([k, n]) => `<button type="button" data-filtro-hoje="${k}" aria-pressed="${filtroHoje === k}">${n}</button>`).join('')}</li>` : '') +
        (por.length ? por.slice(0, 12).map((x) => itemLi(linkA(links.agenda(x.id), 'agenda', 'linha linha-2',
          `<span class="l-a"><b>${C.esc(L.hora5(x.hora))}</b> ${C.esc(x.nome || '')}</span>` +
          `<span class="l-b">${pilula(L.rotuloAg(x.status), x.status === 'nao_veio' ? 'ruim' : L.CHEGARAM.includes(x.status) ? 'bom' : x.confirmado ? 'bom' : '')}` +
          `${x.patio_etapa ? ' ' + pilula('🔧 ' + L.rotuloEtapa(x.patio_etapa), x.patio_etapa === 'pronto' ? 'bom' : 'aviso') : ''}` +
          `${x.orc_id ? ' ' + pilula('🧾 ' + L.rotuloOrc(x.orc_status), x.orc_status === 'aprovado' ? 'bom' : x.orc_status === 'recusado' ? 'ruim' : '') : ''}</span>` +
          `<span class="l-c">${C.esc([x.veiculo, x.servico].filter(Boolean).join(' · '))}</span>`), x.status === 'aguardando' && !x.confirmado ? waBtn('lembrar', { ...x, data: a.hoje || undefined }, hojeIso(), a.hoje || hojeIso()) : '')).join('')
          : (a.total ? '<li class="vazio">Nenhum horário nesse filtro.</li>' : '')),
    });
    rodapeLinks('#cHoje', { '[data-abrir]': [links.agenda(), 'agenda'], '[data-nova]': [links.agendaNovo(), 'agenda'] });
  }

  function desenharLeads(l) {
    cartao('#cLeads', {
      num: String(l.novos_sem_dono || 0),
      det: `${l.novos_sem_dono ? 'novos sem responsável (7 dias)' : 'todo lead novo tem dono'} · ${l.novos_hoje || 0} chegaram hoje`,
      linhas: '',
    });
    rodapeLinks('#cLeads', { '[data-abrir]': [links.crmLead(), 'crm'] });
  }

  function placarRecepcao() {
    const c = $('#cHoje'); c.hidden = false;
    c.querySelector('[data-num]').textContent = '📅';
    c.querySelector('[data-det]').textContent = 'Abra a Agenda para marcar a presença de hoje.';
    c.querySelector('[data-lista]').innerHTML = '';
    rodapeLinks('#cHoje', { '[data-abrir]': [links.agenda(), 'agenda'], '[data-nova]': [links.agenda(), 'agenda'] });
    c.querySelector('[data-nova]').hidden = true;
  }

  /* ---------------- "pede atenção agora" + selos dos apps ---------------- */
  function desenharAtencao(a) {
    const itens = L.atencao(a, V, links);
    const sec = $('#atencao');
    sec.hidden = !itens.length;
    $('#atencaoLista').innerHTML = itens.map((i) => `<li class="grav-${i.grav}">${linkA(i.url, i.app, 'atencao-item',
      `<span class="a-num">${Number(i.n)}</span><span class="a-txt">${C.esc(i.texto)}${i.extra ? `<small>${C.esc(i.extra)}</small>` : ''}</span><span class="a-seta" aria-hidden="true">›</span>`)}</li>`).join('');
    C.sino && C.sino.mostrarAtencao(itens);
    // selos nas peças da grade de apps
    const selo = { atendimento: a.conversas?.esperando, patio: a.patio?.total, orcador: a.orcamentos?.esperando, agenda: a.agenda?.total, crm: a.leads?.novos_sem_dono };
    for (const [k, n] of Object.entries(selo)) {
      const el = document.querySelector(`[data-app-selo="${k}"]`);
      if (el) { el.textContent = Number(n) > 0 ? String(n) : ''; el.hidden = !(Number(n) > 0); el.title = { atendimento: 'conversas esperando', patio: 'carros no pátio', orcador: 'orçamentos esperando resposta', agenda: 'horários hoje', crm: 'leads novos sem dono' }[k] || ''; }
    }
  }

  /* ---------------- ao vivo ---------------- */
  function relogio() {
    const ponto = $('#vivoPonto'), txt = $('#vivoTxt');
    if (!online) { ponto.className = 'vivo-ponto ruim'; txt.textContent = 'sem internet — mostrando o último que carregou'; return; }
    if (!ultima) { ponto.className = 'vivo-ponto'; txt.textContent = emFalha ? 'não consegui carregar' : 'carregando…'; return; }
    const seg = Math.round((Date.now() - ultima) / 1000);
    const velho = seg > 600 || emFalha;
    ponto.className = 'vivo-ponto ' + (velho ? 'ruim' : seg > 150 ? 'aviso' : 'bom');
    txt.textContent = (emFalha ? 'falhou a última atualização · ' : 'ao vivo · ') + (seg < 20 ? 'atualizado agora' : 'atualizado ' + L.quando(new Date(ultima).toISOString()).replace('há ', 'há '));
    // os tempos de etapa e de espera andam sozinhos: redesenha sem ir ao banco a cada minuto
    if (dados && seg > 0 && seg % 60 === 0) redesenhar();
  }
  function redesenhar() { if (dados) try { desenharTudo(dados); } catch { /* mantém a tela */ } }

  function desenharTudo(d) {
    if (V.patio && d.patio) desenharPatio(d.patio, false); else if (!V.patio) $('#cPatio').hidden = true;
    if (V.orcamentos && d.orcamentos) desenharOrc(d.orcamentos); else $('#cOrc').hidden = true;
    if (V.conversas && d.conversas) desenharConversas(d.conversas); else $('#cConversas').hidden = true;
    if (V.agenda && d.agenda) desenharHoje(d.agenda); else if (V.recepcao) placarRecepcao(); else $('#cHoje').hidden = true;
    if (V.leads && d.leads) desenharLeads(d.leads); else $('#cLeads').hidden = true;
    desenharAtencao(d);
  }

  async function carregarAgora({ silencioso = false } = {}) {
    if (carregando) return;
    carregando = true;
    try {
      let d;
      if (V.soMeusCarros) {
        const r = await C.sb.from('patio_os').select('id,numero,cliente_nome,veiculo,placa,etapa,etapa_em,previsao_entrega,orcamento_id')
          .eq('mecanico_id', C.perfil.id).not('etapa', 'in', '(entregue,cancelado)').order('etapa_em', { ascending: true }).limit(12);
        if (r.error) throw r.error;
        const lista = (r.data || []).map((o) => ({ ...o, nome: o.cliente_nome, extras_pendentes: 0 }));
        const por = {}; lista.forEach((o) => { por[o.etapa] = (por[o.etapa] || 0) + 1; });
        d = { patio: { total: lista.length, prontos: lista.filter((o) => o.etapa === 'pronto').length, atrasados: lista.filter((o) => o.previsao_entrega && Date.parse(o.previsao_entrega) < Date.now() && o.etapa !== 'pronto').length, extras_pendentes: 0, por_etapa: por, lista } };
      } else {
        // fonte única: r6_agora (X3); o que ele não traz vem de r6_c1_agora_extras
        const [a, x] = await Promise.all([C.sb.rpc('r6_agora', { p_limite: 40 }), C.sb.rpc('r6_c1_agora_extras')]);
        if (a.error) throw a.error;
        d = L.adaptarAgora(a.data, x.error ? {} : x.data);
      }
      dados = d; ultima = Date.now(); emFalha = false;
      desenharTudo(d);
      try { C.aoAgora && C.aoAgora(d); } catch { /* extras nunca derrubam o painel */ }
    } catch (e) {
      emFalha = true;
      if (!silencioso || !dados) {
        const msg = navigator.onLine ? 'não deu para ler agora' : 'sem internet';
        for (const [id, ok] of [['#cPatio', V.patio], ['#cOrc', V.orcamentos], ['#cConversas', V.conversas], ['#cHoje', V.agenda], ['#cLeads', V.leads]]) {
          if (ok && !dados) cartao(id, { num: '—', det: msg, linhas: '', erro: msg });
        }
      }
    } finally { carregando = false; relogio(); }
  }

  /* ---------------- visão do dono ---------------- */
  function seta(v) {
    if (!v) return '';
    if (v.novo) return '<span class="delta bom">novo</span>';
    if (!v.sinal) return '<span class="delta">igual</span>';
    return `<span class="delta ${v.sinal > 0 ? 'bom' : 'ruim'}">${v.sinal > 0 ? '▲' : '▼'} ${Math.abs(v.pct)}%</span>`;
  }
  /* a CSP da Casa não deixa style="" no HTML: alturas e larguras entram pelo CSSOM */
  function medidas(raiz) {
    raiz.querySelectorAll('[data-h]').forEach((e) => { e.style.height = Number(e.dataset.h) + '%'; });
    raiz.querySelectorAll('[data-w]').forEach((e) => { e.style.width = Number(e.dataset.w) + '%'; });
  }
  function desenharDono(d) {
    const f = d.faturamento || {};
    const tile = (rot, valor, sub, extra = '') => `<div class="cartao tile"><span class="tile-rot">${C.esc(rot)}</span><span class="tile-num">${valor}</span><span class="tile-sub">${sub}</span>${extra}</div>`;
    const conv = L.conversao(d);
    const o = d.orcamentos || {};
    $('#donoTiles').innerHTML =
      tile('Faturamento hoje', C.esc(L.brl(f.hoje)), `${f.fechados_hoje || 0} fechado${f.fechados_hoje === 1 ? '' : 's'} · ontem ${C.esc(L.brl(f.ontem))}`) +
      tile('Faturamento da semana', C.esc(L.brl(f.semana)), `${f.fechados_semana || 0} fechados · ticket ${C.esc(L.brl(f.ticket_semana))}`, seta(L.variacao(f.semana, f.semana_passada)) + '<small class="tile-peq">vs. mesma altura da semana passada</small>') +
      tile('Faturamento do mês', C.esc(L.brl(f.mes)), 'só conta quem foi marcado "fechou" na Agenda') +
      tile('Orçamentos aprovados (30 dias)', C.esc(L.brl(o.valor_aprovado)), `${o.aprovados || 0} de ${o.enviados || 0} enviados${conv.orcAprovados === null ? '' : ' · ' + conv.orcAprovados + '%'}`);
    const bs = L.barras(d.serie7);
    $('#donoBarras').innerHTML = bs.map((b) => `<div class="barra" title="${C.esc(L.brl(b.valor))}"><span class="barra-v">${b.valor ? C.esc(L.brlCurto(b.valor)) : ''}</span><span class="barra-col"><span class="barra-fill" data-h="${b.pct}"></span></span><span class="barra-d">${C.esc(L.diaCurto(b.dia))}</span></div>`).join('');
    $('#donoBarras').setAttribute('aria-label', 'Faturamento por dia: ' + bs.map((b) => `${L.diaCurto(b.dia)} ${L.brl(b.valor)}`).join(', '));
    const nota = $('#donoNota');
    nota.hidden = !(f.sem_valor_semana > 0);
    if (!nota.hidden) nota.innerHTML = `⚠ ${Number(f.sem_valor_semana)} fechamento${f.sem_valor_semana > 1 ? 's' : ''} desta semana sem valor informado: o faturamento está subestimado. ${linkA(links.agenda(), 'agenda', 'link', 'Abrir a Agenda')}`;
    const barraConv = (rot, v, bom = true) => `<div class="conv-linha"><span>${C.esc(rot)}</span><span class="conv-barra" aria-hidden="true"><span class="conv-fill ${bom ? '' : 'ruim'}" data-w="${v === null ? 0 : Math.min(100, v)}"></span></span><b>${v === null ? '—' : v + '%'}</b></div>`;
    const cv = d.conversao || {};
    $('#donoConv').innerHTML =
      barraConv(`Leads que agendaram (${cv.agendaram || 0} de ${cv.leads || 0})`, conv.leadsAgendaram) +
      barraConv(`Leads que fecharam (${cv.fecharam || 0})`, conv.leadsFecharam) +
      barraConv(`Quem veio e fechou (${cv.fechou || 0} de ${(cv.fechou || 0) + (cv.nao_fechou || 0)})`, conv.fechamento) +
      barraConv(`Faltas (${cv.nao_veio || 0} não vieram)`, conv.falta, false) +
      barraConv(`Orçamentos aprovados (${o.aprovados || 0} de ${o.enviados || 0})`, conv.orcAprovados);
    desenharMeta(f);
    medidas($('#visaoDono'));
    const g = L.gargalos(d, links);
    $('#donoGargalos').innerHTML = g.length ? g.map((x) => `<li class="grav-${x.grav}">${linkA(x.url, x.app, 'atencao-item', `<span class="a-num">${x.grav >= 3 ? '!' : '•'}</span><span class="a-txt">${C.esc(x.texto)}${x.extra ? `<small>${C.esc(x.extra)}</small>` : ''}</span><span class="a-seta" aria-hidden="true">›</span>`)}</li>`).join('')
      : '<li class="vazio">Nenhum gargalo agora. Oficina andando. 🏁</li>';
  }
  /* meta do mês (guardada neste aparelho) + projeção pelo ritmo dos dias úteis */
  const LS_META = 'indycar_central_meta_mes';
  /* meta do mês compartilhada (casa_metas, só gestor/admin): vale em todo aparelho; o localStorage fica de reserva */
  let metaRemota;   // undefined = ainda não leu · null = não há meta no banco · número
  const mesChave = () => L.hojeSP().slice(0, 7);
  const metaAtual = () => (metaRemota != null ? metaRemota : Number(ler(LS_META)) || 0);
  async function salvarMeta(n, silencioso) {
    gravar(LS_META, n ? String(n) : '');
    try {
      if (n) { const r = await C.sb.from('casa_metas').upsert({ mes: mesChave(), valor: n, atualizado_por: C.perfil.id, updated_at: new Date().toISOString() }, { onConflict: 'mes' }); if (r.error) throw r.error; metaRemota = n; }
      else { const r = await C.sb.from('casa_metas').delete().eq('mes', mesChave()); if (r.error) throw r.error; metaRemota = null; }
      if (!silencioso) C.toast(n ? 'Meta guardada para todos os aparelhos.' : 'Meta tirada.', 'ok');
    } catch { if (!silencioso) C.toast('Guardei só neste aparelho: não consegui salvar a meta para todos.', 'err'); }
  }
  async function carregarMeta() {
    try {
      const r = await C.sb.from('casa_metas').select('valor').eq('mes', mesChave()).maybeSingle();
      if (r.error) throw r.error;
      metaRemota = r.data ? Number(r.data.valor) : null;
      const local = Number(ler(LS_META)) || 0;
      if (metaRemota === null && local > 0) await salvarMeta(local, true);   // meta que estava só neste aparelho sobe uma vez
    } catch { metaRemota = undefined; }
    if (dono) desenharMeta(dono.faturamento || {});
  }
  function desenharMeta(f) {
    const M2 = window.CasaLogica2, box = $('#donoMeta');
    if (!box || !M2) return;
    const meta = metaAtual();
    const p = M2.projecaoDoMes(f.mes, L.hojeSP());
    const pm = M2.progressoDaMeta(f.mes, meta);
    box.innerHTML = '<h3 class="dono-h">Ritmo do mês</h3>' +
      (p.projecao === null ? '<p class="dono-nota">Sem dias úteis para projetar.</p>' :
        `<p class="meta-linha">No ritmo de agora o mês fecha em <b>${C.esc(L.brl(p.projecao))}</b> <small>(${p.passados} de ${p.total} dias úteis passados)</small></p>`) +
      (pm ? `<div class="conv-linha"><span>Meta de ${C.esc(L.brl(meta))}</span><span class="conv-barra" aria-hidden="true"><span class="conv-fill ${pm.batida ? '' : 'ruim'}" data-w="${Math.min(100, pm.pct)}"></span></span><b>${pm.pct}%</b></div>
        <p class="dono-nota">${pm.batida ? 'Meta batida! 🏁' : 'Faltam ' + C.esc(L.brl(pm.falta)) + (p.faltam ? ' em ' + p.faltam + ' dias úteis (' + C.esc(L.brl(Math.ceil(pm.falta / p.faltam))) + ' por dia)' : '')}</p>` : '<p class="dono-nota">Defina uma meta para acompanhar a barra.</p>') +
      `<div class="dono-botoes"><button type="button" class="btn-link" data-meta>${meta ? 'mudar a meta' : 'definir a meta do mês'}</button> <button type="button" class="btn-link" data-copiar-resumo>copiar resumo do dia</button></div>`;
    medidas(box);
  }
  function desenharConsultores(r) {
    const M2 = window.CasaLogica2, box = $('#donoConsultores');
    if (!box || !M2) return;
    const rk = M2.rankingConsultores(r && r.consultores);
    const org = (r && r.origens) || [];
    box.innerHTML = '<h3 class="dono-h">Desempenho (30 dias)</h3>' + (rk.length ? `<div class="tabela-rolavel"><table class="tab-dono"><thead><tr><th>Consultor</th><th>Marcados</th><th>Vieram</th><th>Fecharam</th><th>Faltas</th><th>Faturado</th></tr></thead><tbody>${rk.map((x) => `<tr><th scope="row">${C.esc(x.nome)}</th><td>${x.marcados}</td><td>${x.vieram}</td><td>${x.fecharam}${x.taxaFecha === null ? '' : ` <small>${x.taxaFecha}%</small>`}</td><td class="${x.taxaFalta >= 30 ? 'txt-ruim' : ''}">${x.faltaram}${x.taxaFalta === null ? '' : ` <small>${x.taxaFalta}%</small>`}</td><td>${C.esc(L.brl(x.valor))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dono-nota">Sem horários nos últimos 30 dias.</p>') +
      (org.length ? `<h3 class="dono-h dono-h2">Origem que mais fecha</h3><ul class="origens">${org.slice(0, 5).map((o) => `<li><span>${C.esc(o.origem)}</span><b>${Number(o.fecharam)}</b><small>de ${Number(o.marcados)} marcados · ${C.esc(L.brl(o.valor))}</small></li>`).join('')}</ul>` : '');
  }
  async function carregarConsultores() {
    try {
      const { data, error } = await C.sb.rpc('r6_c1b_painel_consultores');
      if (error) throw error;
      desenharConsultores(data);
    } catch { const b = $('#donoConsultores'); if (b && !b.dataset.ok) b.innerHTML = '<p class="vazio vazio-erro">Não deu para ler o desempenho agora.</p>'; }
  }
  async function carregarDono() {
    if (!V.dono) return;
    try {
      const { data, error } = await C.sb.rpc('r6_c1_painel_dono');
      if (error) throw error;
      dono = data; ultimaDono = Date.now();
      desenharDono(data);
      carregarConsultores();
      carregarMeta();
    } catch (e) {
      if (!dono) $('#donoTiles').innerHTML = '<p class="vazio vazio-erro">Não deu para ler a visão do dono agora. <button type="button" class="btn-link" data-recarregar>tentar de novo</button></p>';
    }
  }

  function trocarVisao(v) {
    visao = v === 'dono' && V.dono ? 'dono' : 'operacao';
    gravar(LS_VISAO, visao);
    $('#visaoOperacao').hidden = visao !== 'operacao';
    $('#visaoDono').hidden = visao !== 'dono';
    document.querySelectorAll('#seletorVisao [data-visao]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.visao === visao)));
    if (visao === 'dono' && (!dono || Date.now() - ultimaDono > 30_000)) carregarDono();
  }

  /* ---------------- ações rápidas ---------------- */
  function desenharAcoes() {
    const itens = [];
    const add = (app, rotulo, url, ico) => { if (C.podeUsar(app)) itens.push(linkA(url, app, 'acao', `<span aria-hidden="true">${ico}</span> ${C.esc(rotulo)}`)); };
    if (!V.soMeusCarros) {
      if (V.agenda || V.recepcao) add('agenda', 'Novo horário', links.agendaNovo(), '📅');
      add('patio', 'Nova entrada no pátio', links.patioEntrada(), '🔧');
      if (V.orcamentos) add('orcador', 'Novo orçamento', links.novoOrcamento(), '🧾');
    }
    add('patio', 'Modo TV do pátio', links.patioTv(), '📺');
    $('#acoes').innerHTML = `<button type="button" class="acao acao-busca" data-abrir-busca><span aria-hidden="true">🔎</span> Buscar cliente <kbd>Ctrl K</kbd></button>` + itens.join('');
  }

  /* ---------------- tempo real ---------------- */
  function agendar() {
    clearTimeout(deb);
    deb = setTimeout(() => { carregarAgora({ silencioso: true }); if (visao === 'dono' && Date.now() - ultimaDono > 20_000) carregarDono(); }, 700);
  }
  function ouvir() {
    try {
      canal = C.sb.channel('casa-painel-' + C.perfil.id);
      const tabelas = [];
      if (V.patio) tabelas.push('patio_os', 'patio_extras');
      if (V.orcamentos) tabelas.push('orc_orcamentos');
      if (V.conversas) tabelas.push('conversas');
      if (V.agenda) tabelas.push('agendamentos');
      for (const t of tabelas) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, agendar);
      canal.subscribe();
    } catch { /* sem tempo real: o relógio de 60 s cobre */ }
  }

  function aoRede() {
    online = navigator.onLine;
    const av = $('#avisoRede');
    av.hidden = online;
    av.textContent = online ? '' : 'Sem internet. O painel mostra o último que carregou e volta sozinho quando a conexão voltar.';
    if (online) carregarAgora({ silencioso: true });
    relogio();
  }
  function aoVisivel() { if (!document.hidden && C && C.perfil) { carregarAgora({ silencioso: true }); if (visao === 'dono' && Date.now() - ultimaDono > 60_000) carregarDono(); } }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; V = casa.visao(); links = casa.links; dados = null; dono = null; ultima = 0; emFalha = false; filtroHoje = 'todos';
    V.recepcao = C.perfil.papel === 'agenda';
    online = navigator.onLine;
    for (const id of ['#cPatio', '#cOrc', '#cConversas', '#cHoje', '#cLeads']) $(id).hidden = true;
    $('#atencao').hidden = true;
    desenharAcoes();
    $('#seletorVisao').hidden = !V.dono;
    const guardada = ler(LS_VISAO);
    trocarVisao(V.dono ? (guardada === 'operacao' || guardada === 'dono' ? guardada : V.padrao) : 'operacao');
    // se o dono abriu direto na visão dele, a Operação carrega em paralelo (os selos dos apps e o sino precisam dela)
    carregarAgora();
    ouvir();
    clearInterval(timerPoll); clearInterval(timerRelogio);
    timerPoll = setInterval(() => { if (!document.hidden) carregarAgora({ silencioso: true }); }, 60_000);
    timerRelogio = setInterval(relogio, 5_000);
    window.addEventListener('online', aoRede); window.addEventListener('offline', aoRede);
    document.addEventListener('visibilitychange', aoVisivel);
    C.painel = { atualizar: () => { carregarAgora(); if (visao === 'dono') carregarDono(); }, trocarVisao, visao: () => visao, dados: () => dados, dono: () => dono, redesenhar: () => { if (dados) { redesenhar(); try { C.aoAgora && C.aoAgora(dados); } catch { /* segue */ } } } };

    $('#bAtualizar').onclick = () => { C.painel.atualizar(); C.toast('Atualizando…', 1200); };
    $('#seletorVisao').onclick = (e) => { const b = e.target.closest('[data-visao]'); if (b) trocarVisao(b.dataset.visao); };
    $('#miolo').onclick = (e) => {
      if (e.target.closest('[data-recarregar]')) { C.painel.atualizar(); return; }
      const f = e.target.closest('[data-filtro-hoje]');
      if (f) { filtroHoje = f.dataset.filtroHoje; if (dados?.agenda) desenharHoje(dados.agenda); return; }
      if (e.target.closest('[data-abrir-busca]')) { C.busca && C.busca.abrir(); return; }
      if (e.target.closest('[data-meta]')) {
        const atual = metaAtual() || '';
        const v = window.prompt('Meta de faturamento do mês, em reais (deixe vazio para tirar):', atual);
        if (v === null) return;
        const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
        const meta = Number.isFinite(n) && n > 0 && n < 1e8 ? Math.round(n) : 0;
        if (!meta && String(v).trim()) { C.toast('Não entendi esse valor. Use só números, ex.: 80000.', 'err'); return; }
        metaRemota = meta || null;                       // a barra já mostra o valor novo; o banco confirma em seguida
        gravar(LS_META, meta ? String(meta) : '');
        if (dono) desenharMeta(dono.faturamento || {});
        salvarMeta(meta);
        return;
      }
      if (e.target.closest('[data-copiar-resumo]')) { if (dono && dados) C.copiarResumo(dono, dados); else C.toast('Espere o painel carregar.'); }
    };
    relogio();
  };
  MOD.desmontar = function () {
    try { if (canal && C) C.sb.removeChannel(canal); } catch { /* segue */ }
    canal = null; clearInterval(timerPoll); clearInterval(timerRelogio); clearTimeout(deb);
    window.removeEventListener('online', aoRede); window.removeEventListener('offline', aoRede);
    document.removeEventListener('visibilitychange', aoVisivel);
    dados = null; dono = null; metaRemota = undefined;
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
