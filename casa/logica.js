/* ============================================================================
   Casa — regras puras (sem DOM, sem rede). Carregado no navegador antes de
   casa.js e importado direto pelos testes (tests/casa-r6.test.mjs).
   Rodada 6 (21/10/2026).
   ============================================================================ */
(function (root) {
  'use strict';

  const FUSO = 'America/Sao_Paulo';
  const PATIO_PADRAO = 'https://indycar-patio.netlify.app';
  const ORCADOR_PADRAO = 'https://indycar-orcador.netlify.app';

  /* ---------------- texto ---------------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Escapa o texto e envolve em <mark> os pedaços que casam com a busca (sem acento, sem maiúscula). */
  function destacar(texto, busca) {
    const t = String(texto ?? '');
    const q = semAcento(busca).trim();
    if (!q || q.length < 2) return esc(t);
    const base = semAcento(t);
    // tirar acento pode mudar o tamanho do texto (letras decompostas): nesse caso não destaca, só escapa
    if (base.length !== t.length) return esc(t);
    let out = '', de = 0, i;
    while ((i = base.indexOf(q, de)) >= 0) {
      out += esc(t.slice(de, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>';
      de = i + q.length;
    }
    return out + esc(t.slice(de));
  }

  /* ---------------- telefone, placa, dinheiro ---------------- */
  const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
  /** 55DDDNÚMERO (E.164 sem o +). Vazio se não parecer telefone brasileiro. */
  function telefoneE164(v) {
    let d = soDigitos(v);
    if (d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return /^55\d{10,11}$/.test(d) ? d : '';
  }
  function formatarTelefone(v) {
    const e = telefoneE164(v);
    if (!e) return String(v ?? '');
    const dd = e.slice(2, 4), n = e.slice(4);
    return n.length === 9 ? `(${dd}) ${n.slice(0, 5)}-${n.slice(5)}` : `(${dd}) ${n.slice(0, 4)}-${n.slice(4)}`;
  }
  const normalizarPlaca = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function formatarPlaca(v) {
    const p = normalizarPlaca(v);
    return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p.slice(0, 3) + '-' + p.slice(3) : p;
  }
  function brl(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'R$ 0,00';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  /** Versão curta para cartão grande: 1.250 → "R$ 1,3 mil"; abaixo de mil mostra inteiro. */
  function brlCurto(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (Math.abs(n) >= 1e4) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  /** Variação percentual de a (agora) sobre b (antes): null quando não dá para comparar. */
  function variacao(a, b) {
    const x = Number(a) || 0, y = Number(b) || 0;
    if (y <= 0) return x > 0 ? { pct: null, sinal: 1, novo: true } : null;
    const pct = Math.round(((x - y) / y) * 100);
    return { pct, sinal: pct > 0 ? 1 : pct < 0 ? -1 : 0, novo: false };
  }
  const taxa = (parte, todo) => (Number(todo) > 0 ? Math.round((Number(parte) / Number(todo)) * 100) : null);

  /* ---------------- tempo ---------------- */
  function duracao(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    if (h < 24) return m && h < 10 ? `${h} h ${m} min` : `${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? '1 dia' : `${d} dias`;
  }
  function quando(iso, agora = Date.now()) {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const ms = agora - t;
    if (ms < 0) return 'agora';
    const min = Math.round(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    return new Date(t).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
  }
  /** AAAA-MM-DD no fuso da oficina. */
  function hojeSP(agora = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  }
  function diaDe(iso, agora = new Date()) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return 'Antes';
    const dia = hojeSP(new Date(t)), hoje = hojeSP(agora);
    if (dia === hoje) return 'Hoje';
    const ontem = hojeSP(new Date(agora.getTime() - 864e5));
    if (dia === ontem) return 'Ontem';
    return agora.getTime() - t < 7 * 864e5 ? 'Esta semana' : 'Antes';
  }
  const hora5 = (h) => String(h ?? '').slice(0, 5);
  function saudacao(agora = new Date()) {
    const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: 'numeric', hour12: false }).format(agora)) % 24;
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  /* ---------------- Pátio: etapas ---------------- */
  const ETAPAS = [
    { k: 'recebido', rotulo: 'Recebido', limiteH: 2 },
    { k: 'diagnostico', rotulo: 'Diagnóstico', limiteH: 4 },
    { k: 'aguardando_aprovacao', rotulo: 'Aguardando aprovação', limiteH: 24 },
    { k: 'aguardando_peca', rotulo: 'Aguardando peça', limiteH: 72 },
    { k: 'em_execucao', rotulo: 'Em execução', limiteH: 8 },
    { k: 'teste', rotulo: 'Teste', limiteH: 2 },
    { k: 'pronto', rotulo: 'Pronto', limiteH: 4 },
  ];
  const ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.k, e.rotulo]));
  const rotuloEtapa = (k) => ETAPA[k] || (k ? String(k).replace(/_/g, ' ') : '');
  /** ok · atencao (passou da metade do limite) · atrasado (passou do limite) — por quanto tempo está parado na etapa. */
  function tomDaEtapa(etapa, etapaEm, agora = Date.now()) {
    const e = ETAPAS.find((x) => x.k === etapa);
    const t = Date.parse(etapaEm);
    if (!e || !Number.isFinite(t)) return 'ok';
    const h = (agora - t) / 36e5;
    return h >= e.limiteH ? 'atrasado' : h >= e.limiteH / 2 ? 'atencao' : 'ok';
  }
  /** "Previsão 15:30" / "previsão atrasada 2 h" / "" */
  function previsao(previsaoEntrega, etapa, agora = Date.now()) {
    if (!previsaoEntrega || ['pronto', 'entregue', 'cancelado'].includes(etapa)) return { texto: '', atrasada: false };
    const t = Date.parse(previsaoEntrega);
    if (!Number.isFinite(t)) return { texto: '', atrasada: false };
    if (t < agora) return { texto: 'previsão passou há ' + duracao(agora - t), atrasada: true };
    const hora = new Date(t).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
    const mesmoDia = hojeSP(new Date(t)) === hojeSP(new Date(agora));
    return { texto: mesmoDia ? 'previsão ' + hora : 'previsão ' + new Date(t).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }) + ' ' + hora, atrasada: false };
  }

  /* ---------------- Orçador ---------------- */
  const STATUS_ORC = { aberto: 'em aberto', enviado: 'esperando resposta', aprovado: 'aprovado', recusado: 'recusado', expirado: 'vencido' };
  const rotuloOrc = (s) => STATUS_ORC[s] || (s ? String(s) : '');
  const numeroOrc = (n) => '#' + String(Number(n) || 0).padStart(4, '0');

  /* ---------------- Agenda ---------------- */
  const STATUS_AG = { aguardando: 'aguardando', confirmado: 'confirmado', em_atendimento: 'na oficina', compareceu: 'na oficina',
    nao_veio: 'não veio', concluido: 'fechou', nao_fechou: 'não fechou', cancelado: 'cancelado' };
  const rotuloAg = (s) => STATUS_AG[s] || s || '';
  const CHEGARAM = ['compareceu', 'em_atendimento', 'concluido', 'nao_fechou'];

  /* ---------------- apps e links ---------------- */
  const APPS = {
    agenda:      { k: 'agenda',      nome: 'Agenda',      desc: 'horários e presença',      ico: '📅', base: '/agenda/' },
    atendimento: { k: 'atendimento', nome: 'Atendimento', desc: 'conversas do WhatsApp',    ico: '💬', base: '/atendimento/' },
    crm:         { k: 'crm',         nome: 'CRM',         desc: 'leads e funil',            ico: '📈', base: '/crm/' },
    comunicar:   { k: 'comunicar',   nome: 'Comunicar',   desc: 'lembretes e réguas',       ico: '📣', base: '/comunicar/' },
    patio:       { k: 'patio',       nome: 'Pátio',       desc: 'carro dentro da oficina',  ico: '🔧', base: PATIO_PADRAO + '/', fora: true },
    orcador:     { k: 'orcador',     nome: 'Orçador',     desc: 'orçamentos com IA',        ico: '🧾', base: ORCADOR_PADRAO + '/', fora: true },
  };
  /** Nome da aba de cada app (window.open(url, nome)): a Casa nunca vira o app e clicar de novo volta para a aba dele. */
  const nomeDaAba = (k) => 'indycar-' + k;

  /** Endereços configuráveis: o servidor manda `apps` em /api/central/config (PATIO_URL, ORCADOR_URL); sem isso, produção. */
  function bases(cfgApps) {
    const out = {};
    for (const [k, a] of Object.entries(APPS)) out[k] = a.base;
    const ok = (u) => typeof u === 'string' && /^https:\/\/[a-z0-9.-]+(\/|$)/i.test(u);
    if (cfgApps && ok(cfgApps.patio)) out.patio = cfgApps.patio.replace(/\/*$/, '/');
    if (cfgApps && ok(cfgApps.orcador)) out.orcador = cfgApps.orcador.replace(/\/*$/, '/');
    return out;
  }
  const q = (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
    const s = p.toString();
    return s ? '?' + s : '';
  };
  const ehUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ''));

  /** Os endereços de cada registro em cada app (rotas que os apps já aceitam hoje). */
  function links(b = bases()) {
    return {
      agenda: (id) => b.agenda + (ehUuid(id) ? q({ agendamento: id }) : ''),
      agendaNovo: (o = {}) => b.agenda + q({ novo: 1, tel: telefoneE164(o.telefone), cliente: ehUuid(o.cliente) ? o.cliente : '' }),
      agendaCliente: (o = {}) => b.agenda + q({ tel: telefoneE164(o.telefone), cliente: ehUuid(o.cliente) ? o.cliente : '' }),
      crmLead: (id) => b.crm + (ehUuid(id) ? q({ lead: id }) : ''),
      crmTel: (o = {}) => b.crm + q({ tel: telefoneE164(o.telefone), cliente: ehUuid(o.cliente) ? o.cliente : '' }),
      conversa: (id) => b.atendimento + (ehUuid(id) ? q({ conversa: id }) : ''),
      conversaTel: (tel) => b.atendimento + q({ tel: telefoneE164(tel) }),
      comunicarTel: (o = {}) => b.comunicar + q({ tel: telefoneE164(o.telefone), cliente: ehUuid(o.cliente) ? o.cliente : '' }),
      os: (id) => b.patio + (ehUuid(id) ? q({ os: id }) : ''),
      patioEntrada: () => b.patio + '#/entrada',
      patioPainel: () => b.patio + '#/patio',
      patioTv: () => b.patio + '?tv=1',
      orcamento: (id) => b.orcador + (ehUuid(id) ? '#/historico/' + id : '#/historico'),
      orcamentosLista: (filtro) => b.orcador + '#/historico' + (filtro ? '?busca=' + encodeURIComponent(filtro) : ''),
      novoOrcamento: (o = {}) => b.orcador + q({ tel: telefoneE164(o.telefone), nome: String(o.nome || '').slice(0, 80), cliente: ehUuid(o.cliente) ? o.cliente : '' }),
    };
  }

  /** Qual app é dono deste endereço (para abrir na aba nomeada). */
  function appDoLink(url, origem, b = bases()) {
    try {
      const u = new URL(url, origem || 'http://central.local/');
      for (const k of Object.keys(b)) {
        const base = new URL(b[k], origem || 'http://central.local/');
        if (u.origin === base.origin && (u.pathname === base.pathname.replace(/\/$/, '') || u.pathname.startsWith(base.pathname))) {
          // o Pátio e o Orçador moram na raiz do domínio deles; os da Central têm prefixo
          return k;
        }
      }
    } catch { /* lixo */ }
    return null;
  }

  /* ---------------- quem vê o quê ---------------- */
  const EQUIPE = new Set(['admin', 'gestor', 'atendente']);
  function podeUsar(p, app) {
    if (!p || p.ativo === false) return false;
    if (p.papel === 'admin') return true;
    if (!Array.isArray(p.apps)) return EQUIPE.has(p.papel);
    if (p.papel === 'agenda' && !['agenda', 'patio'].includes(app)) return false;
    return p.apps.includes(app);
  }
  /** Quais blocos aparecem para este perfil. */
  function visao(p) {
    const equipe = !!p && EQUIPE.has(p.papel);
    const dono = !!p && ['admin', 'gestor'].includes(p.papel);
    return {
      dono,
      equipe,
      conversas: equipe && podeUsar(p, 'atendimento'),
      leads: equipe && podeUsar(p, 'crm'),
      agenda: equipe && podeUsar(p, 'agenda'),
      recepcao: p?.papel === 'agenda' && podeUsar(p, 'agenda'),
      patio: podeUsar(p, 'patio') && (equipe || ['mecanico', 'agenda'].includes(p?.papel)),
      orcamentos: equipe && podeUsar(p, 'orcador'),
      soMeusCarros: p?.papel === 'mecanico',
      padrao: dono ? 'dono' : 'operacao',
    };
  }

  /* ---------------- sino unificado ---------------- */
  function linkDaNotificacao(n, b = bases(), origem = 'http://central.local/') {
    const base = b[n?.app] || '/';
    const l = String(n?.link || '').trim();
    if (!l) return base;
    if (/^https?:\/\//i.test(l)) {
      try {
        const u = new URL(l);
        const o = new URL(origem);
        const dentro = u.origin === o.origin || Object.values(b).some((x) => { try { return new URL(x, origem).origin === u.origin; } catch { return false; } });
        if (dentro) return u.href;
      } catch { /* lixo */ }
      return base;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(l) || l.startsWith('//')) return base;   // javascript:, data:, //evil
    const rel = l.replace(/^\/+/, '');
    const raiz = new URL(base, origem);
    return raiz.href.replace(/\/$/, '') + '/' + rel;
  }
  /** Agrupa por dia e filtra por app/lida — a lista que o sino desenha. */
  function organizarNotificacoes(lista, { app = '', soNaoLidas = false, agora = new Date() } = {}) {
    const ordem = ['Hoje', 'Ontem', 'Esta semana', 'Antes'];
    const grupos = new Map(ordem.map((g) => [g, []]));
    for (const n of lista || []) {
      if (app && n.app !== app) continue;
      if (soNaoLidas && n.lida_em) continue;
      grupos.get(diaDe(n.created_at, agora)).push(n);
    }
    return ordem.filter((g) => grupos.get(g).length).map((g) => ({ nome: g, itens: grupos.get(g) }));
  }
  function contagemPorApp(lista) {
    const c = {};
    for (const n of lista || []) if (!n.lida_em) c[n.app || 'outros'] = (c[n.app || 'outros'] || 0) + 1;
    return c;
  }
  const tituloDaAba = (naoLidas, base = 'IndyCar Central') => (naoLidas > 0 ? `(${naoLidas > 99 ? '99+' : naoLidas}) ${base}` : base);

  /* ---------------- "Agora": alertas que pedem atenção ---------------- */
  /** Lista priorizada do que está pegando fogo, a partir do que a r6_c1_agora devolveu. */
  function atencao(a, v, l, agora = Date.now()) {
    const out = [];
    if (!a) return out;
    const n = (x) => Number(x) || 0;
    if (v.patio && n(a.patio?.prontos) > 0) {
      const velho = (a.patio.lista || []).filter((o) => o.etapa === 'pronto' && agora - Date.parse(o.etapa_em) > 4 * 36e5).length;
      out.push({ k: 'prontos', grav: velho ? 3 : 1, n: n(a.patio.prontos), texto: n(a.patio.prontos) === 1 ? '1 carro pronto esperando retirada' : `${a.patio.prontos} carros prontos esperando retirada`, extra: velho ? `${velho} há mais de 4 h` : '', app: 'patio', url: l.patioPainel() });
    }
    if (v.patio && n(a.patio?.extras_pendentes) > 0) {
      out.push({ k: 'extras', grav: 2, n: n(a.patio.extras_pendentes), texto: `${a.patio.extras_pendentes} ${n(a.patio.extras_pendentes) === 1 ? 'serviço extra esperando' : 'serviços extras esperando'} o cliente aprovar`, app: 'patio', url: l.patioPainel() });
    }
    if (v.patio && n(a.patio?.atrasados) > 0) {
      out.push({ k: 'atrasados', grav: 3, n: n(a.patio.atrasados), texto: `${a.patio.atrasados} ${n(a.patio.atrasados) === 1 ? 'carro com previsão de entrega vencida' : 'carros com previsão de entrega vencida'}`, app: 'patio', url: l.patioPainel() });
    }
    if (v.conversas && n(a.conversas?.esperando) > 0) {
      const lista = a.conversas.lista || [];
      const demora = lista.length ? agora - Date.parse(lista[0].aguardando_desde) : 0;
      out.push({ k: 'conversas', grav: demora > 2 * 36e5 ? 3 : 2, n: n(a.conversas.esperando), texto: `${a.conversas.esperando} ${n(a.conversas.esperando) === 1 ? 'conversa esperando' : 'conversas esperando'} o consultor`, extra: demora > 6e4 ? 'a mais antiga há ' + duracao(demora) : '', app: 'atendimento', url: lista[0] ? l.conversa(lista[0].id) : l.conversa() });
    }
    if (v.orcamentos && n(a.orcamentos?.aprovados_sem_horario) > 0) {
      out.push({ k: 'aprovados', grav: 2, n: n(a.orcamentos.aprovados_sem_horario), texto: `${a.orcamentos.aprovados_sem_horario} ${n(a.orcamentos.aprovados_sem_horario) === 1 ? 'orçamento aprovado' : 'orçamentos aprovados'} ainda sem horário na Agenda`, app: 'orcador', url: l.orcamentosLista() });
    }
    if (v.orcamentos && n(a.orcamentos?.esperando) > 0) {
      const lista = a.orcamentos.lista || [];
      const velho = lista.length && lista[0].enviado_em ? agora - Date.parse(lista[0].enviado_em) : 0;
      out.push({ k: 'orcamentos', grav: velho > 24 * 36e5 ? 2 : 1, n: n(a.orcamentos.esperando), texto: `${a.orcamentos.esperando} ${n(a.orcamentos.esperando) === 1 ? 'orçamento esperando' : 'orçamentos esperando'} resposta do cliente`, extra: velho > 36e5 ? 'o mais antigo há ' + duracao(velho) : '', app: 'orcador', url: lista[0] ? l.orcamento(lista[0].id) : l.orcamentosLista() });
    }
    if (v.agenda && n(a.agenda?.sem_confirmar) > 0) {
      out.push({ k: 'confirmar', grav: 1, n: n(a.agenda.sem_confirmar), texto: `${a.agenda.sem_confirmar} ${n(a.agenda.sem_confirmar) === 1 ? 'horário de hoje' : 'horários de hoje'} sem confirmação`, app: 'agenda', url: l.agenda() });
    }
    if (v.leads && n(a.leads?.novos_sem_dono) > 0) {
      out.push({ k: 'leads', grav: 1, n: n(a.leads.novos_sem_dono), texto: `${a.leads.novos_sem_dono} ${n(a.leads.novos_sem_dono) === 1 ? 'lead novo' : 'leads novos'} sem responsável`, app: 'crm', url: l.crmLead() });
    }
    return out.sort((x, y) => y.grav - x.grav || y.n - x.n);
  }

  /* ---------------- visão do dono ---------------- */
  function gargalos(d, l) {
    const g = d?.gargalos;
    if (!g) return [];
    const n = (x) => Number(x) || 0;
    const out = [];
    const etapas = (g.patio || []).filter((e) => e.etapa !== 'pronto');
    for (const e of etapas) {
      const lim = (ETAPAS.find((x) => x.k === e.etapa) || {}).limiteH || 24;
      if (Number(e.horas_mais_antigo) >= lim) {
        out.push({ k: 'etapa-' + e.etapa, grav: 3, texto: `${e.n} ${n(e.n) === 1 ? 'carro' : 'carros'} em "${rotuloEtapa(e.etapa)}"`, extra: `o mais antigo está parado há ${duracao(Number(e.horas_mais_antigo) * 36e5)}`, app: 'patio', url: l.patioPainel() });
      }
    }
    if (n(g.pronto_parado_4h)) out.push({ k: 'pronto', grav: 2, texto: `${g.pronto_parado_4h} ${n(g.pronto_parado_4h) === 1 ? 'carro pronto' : 'carros prontos'} há mais de 4 h sem retirar`, extra: 'ligue para o cliente', app: 'patio', url: l.patioPainel() });
    if (n(g.conversas_2h)) out.push({ k: 'conversas', grav: 3, texto: `${g.conversas_2h} ${n(g.conversas_2h) === 1 ? 'conversa' : 'conversas'} sem resposta há mais de 2 h`, extra: 'cliente esfria rápido', app: 'atendimento', url: l.conversa() });
    if (n(g.orcamentos_24h)) out.push({ k: 'orcamentos', grav: 2, texto: `${g.orcamentos_24h} ${n(g.orcamentos_24h) === 1 ? 'orçamento enviado' : 'orçamentos enviados'} há mais de 24 h sem resposta`, extra: 'vale um lembrete', app: 'orcador', url: l.orcamentosLista() });
    if (n(g.leads_sem_dono)) out.push({ k: 'leads', grav: 2, texto: `${g.leads_sem_dono} ${n(g.leads_sem_dono) === 1 ? 'lead novo' : 'leads novos'} sem responsável`, app: 'crm', url: l.crmLead() });
    if (n(g.horarios_sem_desfecho)) out.push({ k: 'desfecho', grav: 1, texto: `${g.horarios_sem_desfecho} ${n(g.horarios_sem_desfecho) === 1 ? 'horário passado' : 'horários passados'} sem desfecho`, extra: 'o faturamento só conta quem foi marcado "fechou"', app: 'agenda', url: l.agenda() });
    return out.sort((x, y) => y.grav - x.grav);
  }
  /** Taxas da visão do dono (null quando não há base para comparar). */
  function conversao(d) {
    const c = d?.conversao || {};
    const o = d?.orcamentos || {};
    return {
      leadsAgendaram: taxa(c.agendaram, c.leads),
      leadsFecharam: taxa(c.fecharam, c.leads),
      fechamento: taxa(c.fechou, (Number(c.fechou) || 0) + (Number(c.nao_fechou) || 0)),
      falta: taxa(c.nao_veio, (Number(c.veio) || 0) + (Number(c.nao_veio) || 0)),
      orcAprovados: taxa(o.aprovados, o.enviados),
    };
  }
  /** Barras do gráfico de 7 dias: alturas em % (mínimo 4 quando há valor). */
  function barras(serie) {
    const max = Math.max(0, ...(serie || []).map((s) => Number(s.valor) || 0));
    return (serie || []).map((s) => {
      const v = Number(s.valor) || 0;
      return { dia: s.dia, valor: v, pct: max > 0 ? Math.max(v > 0 ? 4 : 0, Math.round((v / max) * 100)) : 0 };
    });
  }
  const diaCurto = (iso) => {
    const t = Date.parse(iso + 'T12:00:00Z');
    return Number.isFinite(t) ? new Date(t).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '') : '';
  };

  /* ---------------- busca global ---------------- */
  /** O que a pessoa digitou: telefone, placa, número (OS/orçamento) ou nome. */
  function classificarBusca(texto) {
    const t = String(texto ?? '').trim();
    const dig = soDigitos(t);
    const placa = normalizarPlaca(t);
    if (t.length < 2) return { tipo: 'curta', valido: false };
    if (/^[#nN°º. ]*\d{1,6}$/.test(t)) return { tipo: 'numero', valido: true, numero: Number(dig) };
    if (/^[0-9()+ .-]+$/.test(t) && dig.length >= 4) return { tipo: 'telefone', valido: true, digitos: dig };
    if (placa.length >= 3 && placa.length <= 7 && /[A-Z]/.test(placa) && /\d/.test(placa) && /^[A-Za-z0-9 -]+$/.test(t)) return { tipo: 'placa', valido: true, placa };
    return { tipo: 'nome', valido: true };
  }

  const GRUPOS_BUSCA = [
    { k: 'clientes', nome: 'Clientes', ico: '👤', app: 'agenda' },
    { k: 'agendamentos', nome: 'Agenda', ico: '📅', app: 'agenda' },
    { k: 'patio', nome: 'Pátio', ico: '🔧', app: 'patio' },
    { k: 'orcamentos', nome: 'Orçamentos', ico: '🧾', app: 'orcador' },
    { k: 'conversas', nome: 'Conversas', ico: '💬', app: 'atendimento' },
    { k: 'leads', nome: 'Leads (CRM)', ico: '📈', app: 'crm' },
    { k: 'envios', nome: 'Mensagens enviadas', ico: '📣', app: 'comunicar' },
  ];

  /** Transforma o JSON de r6_c1_busca_global em linhas prontas para desenhar (título, detalhe, link principal e atalhos). */
  function linhasDaBusca(res, perfil, b = bases()) {
    const l = links(b);
    const out = [];
    if (!res || res.vazio) return out;
    for (const g of GRUPOS_BUSCA) {
      const itens = Array.isArray(res[g.k]) ? res[g.k] : [];
      if (!itens.length) continue;
      const linhas = itens.map((r) => linhaDe(g.k, r, l, perfil)).filter(Boolean);
      if (linhas.length) out.push({ ...g, linhas });
    }
    return out;
  }
  function linhaDe(tipo, r, l, perfil) {
    const tel = r.telefone ? formatarTelefone(r.telefone) : '';
    const juntar = (...p) => p.filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(' · ');
    const ctx = { telefone: r.telefone, cliente: r.id, nome: r.nome };
    switch (tipo) {
      case 'clientes':
        return { id: r.id, titulo: r.nome || tel || 'Cliente', detalhe: juntar(tel, r.carro, r.placa && formatarPlaca(r.placa)), url: l.agendaCliente({ telefone: r.telefone, cliente: r.id }), app: 'agenda',
          atalhos: atalhos(perfil, [
            ['crm', 'CRM', l.crmTel({ telefone: r.telefone, cliente: r.id })],
            ['atendimento', 'Conversa', l.conversaTel(r.telefone)],
            ['comunicar', 'Comunicar', l.comunicarTel({ telefone: r.telefone, cliente: r.id })],
            ['orcador', 'Novo orçamento', l.novoOrcamento({ telefone: r.telefone, nome: r.nome, cliente: r.id })],
          ], !!r.telefone) };
      case 'agendamentos': {
        const dia = r.data ? String(r.data).split('-').reverse().slice(0, 2).join('/') : '';
        return { id: r.id, titulo: r.nome || 'Horário', detalhe: r.detalhe || juntar(dia && `${dia} ${hora5(r.hora)}`, r.veiculo, r.servico), selo: rotuloAg(r.status), seloTom: r.status === 'nao_veio' ? 'ruim' : CHEGARAM.includes(r.status) ? 'bom' : '',
          etapa: r.patio_etapa ? rotuloEtapa(r.patio_etapa) : '', url: l.agenda(r.id), app: 'agenda',
          atalhos: atalhos(perfil, [
            ['patio', r.patio_etapa ? `Pátio #${r.patio_numero}` : '', r.patio_etapa ? l.patioPainel() : ''],
            ['atendimento', 'Conversa', l.conversaTel(r.telefone)],
          ], !!r.telefone) };
      }
      case 'leads':
        return { id: r.id, titulo: r.nome || tel || 'Lead', detalhe: r.detalhe || juntar(tel, r.carro, r.servico), selo: r.status, url: l.crmLead(r.id), app: 'crm',
          atalhos: atalhos(perfil, [['atendimento', 'Conversa', l.conversaTel(r.telefone)], ['agenda', 'Agendar', l.agendaNovo({ telefone: r.telefone })]], !!r.telefone) };
      case 'conversas':
        return { id: r.id, titulo: r.nome || tel || 'Conversa', detalhe: juntar(tel, r.previa), selo: r.aguardando ? 'esperando' : '', seloTom: r.aguardando ? 'ruim' : '', url: l.conversa(r.id), app: 'atendimento',
          atalhos: atalhos(perfil, [['crm', 'CRM', l.crmTel({ telefone: r.telefone })], ['agenda', 'Agendar', l.agendaNovo({ telefone: r.telefone })]], !!r.telefone) };
      case 'patio':
        return { id: r.id, titulo: `#${r.numero} ${r.veiculo || r.nome || 'Carro'}`.trim(), detalhe: juntar(r.nome, r.placa && formatarPlaca(r.placa)), selo: rotuloEtapa(r.etapa) || r.etapa, seloTom: ['entregue', 'cancelado'].includes(r.etapa) ? '' : tomDaEtapa(r.etapa, r.etapa_em) === 'atrasado' ? 'ruim' : 'bom', url: l.os(r.id), app: 'patio', atalhos: [] };
      case 'orcamentos':
        return { id: r.id, titulo: `${numeroOrc(r.numero)} ${r.nome || ''}`.trim(), detalhe: juntar(r.veiculo, r.placa && formatarPlaca(r.placa), r.total ? brl(r.total) : r.detalhe), selo: rotuloOrc(r.status), seloTom: r.status === 'aprovado' ? 'bom' : r.status === 'recusado' ? 'ruim' : '', url: l.orcamento(r.id), app: 'orcador', atalhos: [] };
      case 'envios':
        return { id: r.id, titulo: r.nome || tel || 'Mensagem', detalhe: juntar(r.tipo, r.status, r.enviar_em && quando(r.enviar_em)), url: l.comunicarTel({ telefone: r.telefone }), app: 'comunicar', atalhos: [] };
      default: return null;
    }
  }
  function atalhos(perfil, lista, temTelefone) {
    return lista.filter(([app, rotulo, url]) => rotulo && url && podeUsar(perfil, app) && (temTelefone || app === 'orcador' || app === 'patio'))
      .map(([app, rotulo, url]) => ({ app, rotulo, url }));
  }
  /** Tira do resultado os grupos de apps que a pessoa não pode usar (o RLS já esconde as linhas; isto cobre o painel). */
  function filtrarPorPermissao(grupos, perfil) {
    return grupos.filter((g) => podeUsar(perfil, g.app) || g.k === 'clientes');
  }

  /* ---------------- adaptadores: r6_agora / r6_busca_global (X3) → o formato que a Casa desenha ---------------- */
  const num = (x) => Number(x) || 0;
  function adaptarAgora(x3, extras = {}) {
    const a = x3 || {};
    const ex = extras || {};
    const p = a.patio || {};
    const carros = (p.por_etapa || []).flatMap((e) => (e.carros || []).map((c) => ({ ...c, etapa: e.etapa })));
    carros.sort((x, y) => (y.etapa === 'pronto') - (x.etapa === 'pronto') || Date.parse(x.desde) - Date.parse(y.desde));
    const porEtapa = {};
    for (const e of p.por_etapa || []) if (num(e.quantidade) > 0) porEtapa[e.etapa] = num(e.quantidade);
    const o = a.orcamentos || {};
    const cv = a.conversas_sem_resposta || {};
    const ag = a.agendamentos_hoje || {};
    const itens = ag.itens || [];
    return {
      hoje: a.hoje, gerado_em: a.gerado_em,
      patio: { total: num(p.total), prontos: num(p.prontos_esperando_retirada), atrasados: num(p.atrasados), extras_pendentes: num(p.extras_pendentes), por_etapa: porEtapa,
        lista: carros.slice(0, 8).map((c) => ({ id: c.id, numero: c.numero, nome: c.cliente, veiculo: c.veiculo, placa: c.placa, etapa: c.etapa, etapa_em: c.desde,
          previsao_entrega: c.previsao_entrega, orcamento_id: c.orcamento_id, extras_pendentes: num(c.extras_pendentes) })) },
      orcamentos: { esperando: num(o.esperando_total), vistos: num(ex.orcamentos?.vistos), aprovados_sem_horario: num(o.aprovados_sem_horario_total), recusados_7d: num(ex.orcamentos?.recusados_7d),
        lista: (o.esperando || []).slice(0, 6).map((q) => ({ id: q.id, numero: q.numero, nome: q.cliente, total: q.total, enviado_em: q.enviado_em, visualizado_em: q.visualizado_em, validade: q.validade })) },
      conversas: { esperando: num(cv.total), antigas: num(ex.conversas?.antigas), nao_lidas: num(ex.conversas?.nao_lidas),
        lista: (cv.itens || []).slice(0, 6).map((v) => ({ id: v.id, nome: v.nome, telefone: v.telefone_55, aguardando_desde: v.desde, previa: v.previa, atribuida_a: v.dono || null })) },
      agenda: { total: num(ag.total), chegaram: num(ex.agenda?.chegaram), sem_confirmar: num(ex.agenda?.sem_confirmar), faltaram: num(ex.agenda?.faltaram),
        lista: itens.map((i) => {
          const q = ex.agenda?.orcamentos?.[i.id];
          return { id: i.id, hora: i.hora, nome: i.cliente, veiculo: i.veiculo, servico: i.servico, status: i.status, confirmado: i.status === 'confirmado',
            patio_etapa: i.os_etapa || null, os_id: i.os_id || null, orc_id: q?.id || null, orc_numero: q?.numero, orc_status: q?.status };
        }) },
      leads: { novos_sem_dono: num(ex.leads?.novos_sem_dono), novos_hoje: num(ex.leads?.novos_hoje) },
      tarefas: a.tarefas || null,
    };
  }
  function adaptarBusca(x3) {
    const g = (x3 && x3.grupos) || {};
    const lista = (k) => (Array.isArray(g[k]) ? g[k] : []);
    if (!x3 || x3.aviso || !g) return { vazio: true };
    return {
      q: x3.termo,
      clientes: lista('clientes').map((i) => ({ id: i.id, nome: i.nome, telefone: i.telefone_55, carro: i.extra?.carro, placa: i.extra?.placa })),
      agendamentos: lista('agendamentos').map((i) => ({ id: i.id, nome: i.nome || i.titulo, telefone: i.telefone_55, detalhe: i.detalhe, status: i.status,
        patio_etapa: i.extra?.os_etapa || null, patio_numero: i.extra?.os_numero })),
      leads: lista('leads').map((i) => ({ id: i.id, nome: i.nome, telefone: i.telefone_55, status: i.status, detalhe: i.detalhe })),
      conversas: lista('conversas').map((i) => ({ id: i.id, nome: i.nome, telefone: i.telefone_55, previa: i.detalhe, aguardando: !!i.extra?.aguardando_consultor })),
      patio: lista('patio').map((i) => ({ id: i.id, numero: i.extra?.numero, nome: i.nome, veiculo: i.extra?.veiculo || '', placa: i.extra?.placa, etapa: i.extra?.etapa, etapa_em: i.quando, detalhe: i.detalhe })),
      orcamentos: lista('orcamentos').map((i) => ({ id: i.id, numero: i.extra?.numero, nome: i.nome, status: i.status, total: i.extra?.total, detalhe: i.detalhe })),
    };
  }

  /* ---------------- atalhos de teclado ---------------- */
  const ATALHOS_G = { a: 'agenda', c: 'crm', t: 'atendimento', m: 'comunicar', p: 'patio', o: 'orcador' };
  const AJUDA_ATALHOS = [
    ['Ctrl+K  ou  /', 'Buscar por telefone, nome ou placa em tudo'],
    ['g  depois  a', 'Abrir a Agenda'],
    ['g  depois  t', 'Abrir o Atendimento (conversas)'],
    ['g  depois  c', 'Abrir o CRM'],
    ['g  depois  m', 'Abrir o Comunicar'],
    ['g  depois  p', 'Abrir o Pátio'],
    ['g  depois  o', 'Abrir o Orçador'],
    ['1 … 6', 'Abrir o app da posição (1 Agenda, 2 Atendimento, 3 CRM, 4 Comunicar, 5 Pátio, 6 Orçador)'],
    ['>', 'Na busca: comandos (novo horário, nova entrada, tema…)'],
    ['j  ou  k', 'Descer / subir na lista “Pede atenção agora” (Enter abre)'],
    ['d', 'Alternar Operação / Visão do dono'],
    ['n', 'Nova tarefa para mim'],
    ['s', 'Abrir o sino de avisos'],
    ['r', 'Atualizar o painel agora'],
    ['?', 'Mostrar esta ajuda'],
    ['Esc', 'Fechar o que estiver aberto'],
  ];
  const ehCampo = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

  root.CasaLogica = Object.freeze({
    esc, semAcento, destacar, soDigitos, telefoneE164, formatarTelefone, normalizarPlaca, formatarPlaca, brl, brlCurto, variacao, taxa,
    duracao, quando, hojeSP, diaDe, hora5, saudacao, ETAPAS, ETAPA, rotuloEtapa, tomDaEtapa, previsao, STATUS_ORC, rotuloOrc, numeroOrc,
    STATUS_AG, rotuloAg, CHEGARAM, APPS, nomeDaAba, bases, links, appDoLink, podeUsar, visao, EQUIPE, linkDaNotificacao, organizarNotificacoes,
    contagemPorApp, tituloDaAba, atencao, gargalos, conversao, barras, diaCurto, classificarBusca, GRUPOS_BUSCA, linhasDaBusca, filtrarPorPermissao,
    ATALHOS_G, AJUDA_ATALHOS, ehCampo, ehUuid, FUSO, adaptarAgora, adaptarBusca,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
