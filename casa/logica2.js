/* Casa — regras puras da Rodada 6 / C1b (21/10/2026). Sem DOM, sem rede: testadas em tests/casa-c1b.test.mjs.
   Carregado DEPOIS de logica.js (usa CasaLogica). Reúne: saúde do Pátio/Orçador, comandos da paleta (Ctrl+K),
   "Meu dia", ordem dos cartões por papel, tarefas (filtros, prazos, adiar), sino (tipo, adiar, agrupar),
   visão do dono (metas, projeção, ranking, resumo do dia) e atalhos extras. */
(function (root) {
  'use strict';
  const L = root.CasaLogica;
  const FUSO = L.FUSO;
  const num = (x) => Number(x) || 0;
  const sa = (t) => L.semAcento(t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------------- saúde do Pátio e do Orçador ---------------- */
  const NOMES_FORA = { patio: 'Pátio', orcador: 'Orçador' };
  const MOTIVOS = { tempo_esgotado: 'demorou demais para responder', sem_resposta: 'não respondeu', http_500: 'deu erro no servidor', http_502: 'está fora do ar (502)', http_503: 'está em manutenção ou fora do ar (503)', http_504: 'não respondeu a tempo (504)' };
  const rotuloMotivo = (m) => MOTIVOS[m] || (/^http_\d+$/.test(String(m || '')) ? 'devolveu erro ' + String(m).slice(5) : 'não respondeu');
  function horaDe(ms) {
    if (!Number.isFinite(ms)) return '';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  }
  /** O que mostrar para a equipe: só quem está "fora" (2 falhas seguidas) vira aviso; 1 falha só marca como "suspeito". */
  function avisosDeApps(saude, agora = Date.now()) {
    const out = [];
    for (const k of Object.keys(NOMES_FORA)) {
      const s = saude && saude.apps && saude.apps[k];
      if (!s || !s.fora) continue;
      const min = Number.isFinite(s.desde) ? Math.max(0, Math.round((agora - s.desde) / 60000)) : 0;
      out.push({ app: k, nome: NOMES_FORA[k], desde: s.desde, minutos: min, desdeHora: horaDe(s.desde), motivo: rotuloMotivo(s.motivo),
        texto: `${NOMES_FORA[k]} ${rotuloMotivo(s.motivo)}${min >= 1 ? ' há ' + L.duracao(min * 60000) : ''}` });
    }
    return out;
  }
  /** Quem voltou ao ar entre duas leituras (para o aviso "o Pátio voltou"). */
  function voltaramAoAr(antes, depois) {
    return Object.keys(NOMES_FORA).filter((k) => antes && antes.apps && antes.apps[k] && antes.apps[k].fora && depois && depois.apps && depois.apps[k] && !depois.apps[k].fora).map((k) => NOMES_FORA[k]);
  }
  /** Plano B de cada app fora do ar: o que a pessoa faz enquanto isso. */
  const PLANO_B = {
    patio: 'Anote o carro no papel (placa, cliente, o que foi pedido) e lance no Pátio quando voltar. A Agenda e as conversas seguem normais.',
    orcador: 'Passe o valor pelo Atendimento com o preço da tabela e registre o orçamento no Orçador quando voltar. A Agenda e as conversas seguem normais.',
  };

  /* ---------------- paleta de comandos (Ctrl+K) ---------------- */
  /** Comandos que a pessoa pode usar. `acao` é um nome que a Casa sabe executar (não é função: dá para testar). */
  function comandos(perfil, V = L.visao(perfil)) {
    const c = [];
    const add = (id, rotulo, extra = {}) => c.push({ id, rotulo, palavras: extra.palavras || '', app: extra.app || null, tecla: extra.tecla || '' });
    if (V.agenda || V.recepcao) add('novo-horario', 'Novo horário na Agenda', { app: 'agenda', palavras: 'agendar marcar cliente agenda' });
    if (!V.soMeusCarros && L.podeUsar(perfil, 'patio')) add('nova-entrada', 'Nova entrada no pátio', { app: 'patio', palavras: 'carro chegou receber os ordem' });
    if (V.orcamentos) add('novo-orcamento', 'Novo orçamento', { app: 'orcador', palavras: 'cotacao preco orcar' });
    if (L.podeUsar(perfil, 'patio')) add('modo-tv', 'Modo TV do pátio', { app: 'patio', palavras: 'televisao tela grande painel' });
    add('nova-tarefa', 'Nova tarefa para mim', { tecla: 'n', palavras: 'lembrete afazer criar tarefa' });
    add('atualizar', 'Atualizar o painel agora', { tecla: 'r', palavras: 'recarregar refresh' });
    add('tema', 'Trocar tema claro/escuro', { palavras: 'escuro claro cor noite dia' });
    add('sino', 'Abrir o sino de avisos', { tecla: 's', palavras: 'notificacoes avisos alertas' });
    add('marcar-lidas', 'Marcar todos os avisos como lidos', { palavras: 'notificacoes limpar sino' });
    add('atalhos', 'Ver os atalhos do teclado', { tecla: '?', palavras: 'ajuda teclas' });
    if (V.dono) { add('visao-dono', 'Ir para a visão do dono', { tecla: 'd', palavras: 'faturamento gestor numeros' }); add('visao-operacao', 'Ir para a operação', { palavras: 'painel agora' }); }
    for (const [k, app] of Object.entries(L.APPS)) if (L.podeUsar(perfil, k)) add('abrir-' + k, 'Abrir ' + app.nome, { app: k, palavras: app.desc });
    add('sair', 'Sair da Central', { palavras: 'logout encerrar' });
    return c;
  }
  /** Filtra pelo que foi digitado: sem acento, por palavras; o rótulo vale mais que as palavras-chave. */
  function filtrarComandos(lista, texto) {
    const t = sa(texto).replace(/^>\s*/, '');
    if (!t) return lista.slice();
    const ps = t.split(' ');
    return lista.map((c) => {
      const r = sa(c.rotulo), alvo = r + ' ' + sa(c.palavras);
      if (!ps.every((p) => alvo.includes(p))) return null;
      return { c, pts: (r.startsWith(t) ? 0 : r.includes(t) ? 1 : ps.every((p) => r.includes(p)) ? 2 : 3) };
    }).filter(Boolean).sort((x, y) => x.pts - y.pts).map((x) => x.c);
  }

  /* ---------------- ordem dos cartões por papel ---------------- */
  const ORDEM_CARTOES = {
    admin: ['cPatio', 'cOrc', 'cConversas', 'cHoje', 'cLeads'],
    gestor: ['cPatio', 'cOrc', 'cConversas', 'cHoje', 'cLeads'],
    atendente: ['cConversas', 'cHoje', 'cOrc', 'cLeads', 'cPatio'],
    agenda: ['cHoje', 'cPatio'],
    mecanico: ['cPatio'],
  };
  const ordemDosCartoes = (papel) => (ORDEM_CARTOES[papel] || ORDEM_CARTOES.gestor).slice();

  /* ---------------- "Meu dia" ---------------- */
  /** Resume o que é DA pessoa: conversas dela, tarefas dela, horários do consultor dela. `dados` = saída de adaptarAgora. */
  function meuDia({ perfil, dados, tarefas = [], consultorId = null, agoraMs = Date.now() }) {
    if (!perfil || !dados) return null;
    const eu = perfil.id;
    const conversas = (dados.conversas?.lista || []).filter((c) => c.atribuida_a === eu);
    const semDono = (dados.conversas?.lista || []).filter((c) => !c.atribuida_a).length;
    const minhasTarefas = tarefas.filter((t) => t.status !== 'feita' && (t.responsavel_id === eu || !t.responsavel_id));
    const vencidas = minhasTarefas.filter((t) => t.vence_em && Date.parse(t.vence_em) < agoraMs);
    const hojeIso = L.hojeSP(new Date(agoraMs));
    const ate = new Date(agoraMs); ate.setHours(ate.getHours() + 12);
    const horarios = consultorId ? (dados.agenda?.lista || []).filter((a) => a.consultor_id === consultorId && ['aguardando', 'confirmado'].includes(a.status)) : [];
    const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(agoraMs));
    const proximo = horarios.filter((a) => L.hora5(a.hora) >= hm).sort((a, b) => L.hora5(a.hora).localeCompare(L.hora5(b.hora)))[0] || null;
    const itens = [];
    if (conversas.length) itens.push({ k: 'conversas', n: conversas.length, texto: `${conversas.length} ${conversas.length === 1 ? 'conversa sua esperando' : 'conversas suas esperando'} resposta`, app: 'atendimento' });
    if (vencidas.length) itens.push({ k: 'vencidas', n: vencidas.length, texto: `${vencidas.length} ${vencidas.length === 1 ? 'tarefa vencida' : 'tarefas vencidas'}`, app: null });
    if (horarios.length) itens.push({ k: 'horarios', n: horarios.length, texto: `${horarios.length} ${horarios.length === 1 ? 'horário seu' : 'horários seus'} por vir hoje`, extra: proximo ? `o próximo é ${L.hora5(proximo.hora)} — ${proximo.nome || ''}` : '', app: 'agenda' });
    if (semDono && !conversas.length) itens.push({ k: 'sem-dono', n: semDono, texto: `${semDono} ${semDono === 1 ? 'conversa sem dono' : 'conversas sem dono'} — pegue uma`, app: 'atendimento' });
    return { hojeIso, itens, total: itens.reduce((s, i) => s + i.n, 0), proximo, vencidas: vencidas.length };
  }

  /* ---------------- tarefas ---------------- */
  /** Prazos prontos. Depois das 17h30 "hoje" vira amanhã cedo (não nasce vencida). */
  function prazoDaTarefa(codigo, agora = new Date()) {
    if (!codigo) return null;
    const hojeIso = L.hojeSP(agora);
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(agora);
    const mais = (iso, d) => { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
    const pula = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() === 0 ? mais(iso, 1) : iso);
    if (codigo === 'hoje') return hm >= '17:30' ? `${pula(mais(hojeIso, 1))}T09:00:00-03:00` : `${hojeIso}T17:30:00-03:00`;
    if (codigo === 'amanha') return `${pula(mais(hojeIso, 1))}T09:00:00-03:00`;
    if (codigo === 'semana') return `${pula(mais(hojeIso, 7))}T09:00:00-03:00`;
    return null;
  }
  /** Adiar uma tarefa: +1 dia útil (a partir do prazo dela ou de agora, o que for maior), sempre 9h; nunca domingo. */
  function adiarTarefa(venceEm, agora = new Date(), dias = 1) {
    const base = venceEm && Date.parse(venceEm) > agora.getTime() ? new Date(venceEm) : agora;
    let iso = L.hojeSP(base);
    for (let i = 0; i < dias; i++) {
      const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
      iso = d.toISOString().slice(0, 10);
    }
    return `${iso}T09:00:00-03:00`;
  }
  /** Situação de uma tarefa para a lista: 'vencida' | 'hoje' | 'proxima' | 'sem-prazo' | 'feita'. */
  function situacaoDaTarefa(t, agora = new Date()) {
    if (t.status === 'feita') return 'feita';
    if (!t.vence_em) return 'sem-prazo';
    const v = Date.parse(t.vence_em);
    if (v < agora.getTime()) return 'vencida';
    return L.hojeSP(new Date(v)) === L.hojeSP(agora) ? 'hoje' : 'proxima';
  }
  const PESO = { vencida: 0, hoje: 1, proxima: 2, 'sem-prazo': 3, concluida: 4 };
  /** Filtros da lista: todas | hoje | vencidas | urgentes | equipe (as de outras pessoas, só gestor). */
  function filtrarTarefas(lista, filtro, perfil, agora = new Date()) {
    const abertas = lista.filter((t) => t.status !== 'feita');
    let r;
    if (filtro === 'hoje') r = abertas.filter((t) => ['hoje', 'vencida'].includes(situacaoDaTarefa(t, agora)));
    else if (filtro === 'vencidas') r = abertas.filter((t) => situacaoDaTarefa(t, agora) === 'vencida');
    else if (filtro === 'urgentes') r = abertas.filter((t) => num(t.prioridade) === 1);
    else if (filtro === 'equipe') r = abertas.filter((t) => t.responsavel_id && t.responsavel_id !== perfil?.id);
    else r = abertas.filter((t) => !t.responsavel_id || t.responsavel_id === perfil?.id);
    return r.sort((a, b) => PESO[situacaoDaTarefa(a, agora)] - PESO[situacaoDaTarefa(b, agora)] || num(a.prioridade) - num(b.prioridade) || String(a.vence_em || '9').localeCompare(String(b.vence_em || '9')));
  }
  function contagemDeTarefas(lista, perfil, agora = new Date()) {
    const minhas = lista.filter((t) => t.status !== 'feita' && (!t.responsavel_id || t.responsavel_id === perfil?.id));
    return {
      todas: minhas.length,
      hoje: minhas.filter((t) => ['hoje', 'vencida'].includes(situacaoDaTarefa(t, agora))).length,
      vencidas: minhas.filter((t) => situacaoDaTarefa(t, agora) === 'vencida').length,
      urgentes: minhas.filter((t) => num(t.prioridade) === 1).length,
      equipe: lista.filter((t) => t.status !== 'feita' && t.responsavel_id && t.responsavel_id !== perfil?.id).length,
    };
  }
  /** Texto de prazo para a linha da tarefa ("venceu ontem 17:30", "hoje 17:30", "amanhã 09:00", "sex 24/10"). */
  function textoDoPrazo(venceEm, agora = new Date()) {
    if (!venceEm) return '';
    const d = new Date(venceEm);
    if (Number.isNaN(d.getTime())) return '';
    const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const dia = L.hojeSP(d), hoje = L.hojeSP(agora);
    if (dia === hoje) return 'hoje ' + hm;
    if (dia === L.hojeSP(new Date(agora.getTime() - 864e5))) return 'ontem ' + hm;
    if (dia === L.hojeSP(new Date(agora.getTime() + 864e5))) return 'amanhã ' + hm;
    return d.toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '') + ' ' + hm;
  }

  /* ---------------- sino ---------------- */
  const ICONES_TIPO = { atraso: '⏰', falta: '🚫', nao_veio: '🚫', extra: '➕', pronto: '🏁', orcamento: '🧾', aprovado: '✅', recusado: '❌', conversa: '💬', mensagem: '💬', lead: '📈', tarefa: '📝', patio: '🔧', erro: '⚠️' };
  const iconeDoAviso = (n) => ICONES_TIPO[n?.tipo] || { agenda: '📅', atendimento: '💬', crm: '📈', comunicar: '📣', patio: '🔧', orcador: '🧾' }[n?.app] || '🔔';
  /** Agrupa avisos repetidos do mesmo app+tipo+título-base (ex.: "João está 35 min atrasado" ×3 → "3 horários atrasados"). */
  function agruparAvisos(lista) {
    const mapa = new Map();
    const out = [];
    for (const n of lista) {
      if (n.lida_em) { out.push(n); continue; }
      const k = (n.app || '') + '|' + (n.tipo || '');
      if (!n.tipo) { out.push(n); continue; }
      if (!mapa.has(k)) { mapa.set(k, []); }
      mapa.get(k).push(n);
    }
    for (const g of mapa.values()) {
      if (g.length >= 3) out.push({ ...g[0], id: 'grupo:' + g[0].id, grupo: g.map((x) => x.id), titulo: `${g.length} avisos: ${rotuloTipo(g[0].tipo)}`, corpo: g.slice(0, 3).map((x) => x.titulo).join(' · ') + (g.length > 3 ? ' · …' : '') });
      else out.push(...g);
    }
    return out.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  }
  const ROTULO_TIPO = { atraso: 'atrasos', falta: 'faltas', nao_veio: 'faltas', extra: 'extras esperando', pronto: 'carros prontos', orcamento: 'orçamentos', aprovado: 'aprovados', recusado: 'recusados', conversa: 'conversas', mensagem: 'mensagens', lead: 'leads', tarefa: 'tarefas', patio: 'pátio' };
  const rotuloTipo = (t) => ROTULO_TIPO[t] || t || 'avisos';
  /** Adiados neste aparelho: { id: ateMs }. Devolve só os que ainda não voltaram. */
  function aindaAdiados(mapa, agoraMs = Date.now()) {
    const out = {};
    for (const [id, ate] of Object.entries(mapa || {})) if (num(ate) > agoraMs) out[id] = ate;
    return out;
  }

  /* ---------------- visão do dono ---------------- */
  /** Projeção do mês: quanto fecha se o ritmo dos dias úteis passados se mantiver. Seg–sáb contam. */
  function projecaoDoMes(valorMes, hojeIso) {
    const [a, m, d] = hojeIso.split('-').map(Number);
    const util = (dia) => new Date(Date.UTC(a, m - 1, dia, 12)).getUTCDay() !== 0;
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    let passados = 0, total = 0;
    for (let i = 1; i <= ultimo; i++) { if (!util(i)) continue; total++; if (i <= d) passados++; }
    if (!passados || !total) return { projecao: null, passados, total };
    return { projecao: Math.round((num(valorMes) / passados) * total), passados, total, faltam: total - passados };
  }
  /** Meta do mês guardada no aparelho: 0..100+ %. */
  function progressoDaMeta(valorMes, meta) {
    const m = num(meta);
    if (!(m > 0)) return null;
    const pct = Math.round((num(valorMes) / m) * 100);
    return { pct, falta: Math.max(0, m - num(valorMes)), batida: num(valorMes) >= m };
  }
  /** Ranking por consultor (30 dias) vindo de r6_c1b_painel_consultores: ordena por faturamento. */
  function rankingConsultores(linhas) {
    return (linhas || []).map((r) => ({ nome: r.nome || 'Sem consultor', marcados: num(r.marcados), vieram: num(r.vieram), fecharam: num(r.fecharam), faltaram: num(r.faltaram), valor: num(r.valor),
      taxaFalta: L.taxa(r.faltaram, num(r.vieram) + num(r.faltaram)), taxaFecha: L.taxa(r.fecharam, r.vieram) }))
      .sort((a, b) => b.valor - a.valor || b.fecharam - a.fecharam);
  }
  /** Texto pronto do resumo do dia para o dono colar no WhatsApp. */
  function resumoDoDia({ dono, agora, nome = 'IndyCar', hojeIso }) {
    if (!dono) return '';
    const f = dono.faturamento || {};
    const p = agora?.patio || {};
    const o = agora?.orcamentos || {};
    const c = agora?.conversas || {};
    const h = agora?.agenda || {};
    const linhas = [`*${nome} — resumo de ${hojeIso ? hojeIso.split('-').reverse().join('/') : 'hoje'}*`,
      `Faturado hoje: ${L.brl(f.hoje)} (${num(f.fechados_hoje)} ${num(f.fechados_hoje) === 1 ? 'fechamento' : 'fechamentos'})`,
      `Semana: ${L.brl(f.semana)} · Mês: ${L.brl(f.mes)}`,
      `Carros no pátio: ${num(p.total)}${num(p.prontos) ? ` (${p.prontos} pronto${p.prontos > 1 ? 's' : ''} p/ retirar)` : ''}`,
      `Horários de hoje: ${num(h.total)} · ${num(h.chegaram)} já chegaram`,
      `Orçamentos esperando resposta: ${num(o.esperando)}${num(o.aprovados_sem_horario) ? ` · ${o.aprovados_sem_horario} aprovado${o.aprovados_sem_horario > 1 ? 's' : ''} sem horário` : ''}`,
      `Conversas esperando o consultor: ${num(c.esperando)}`];
    return linhas.join('\n');
  }

  /* ---------------- atalhos extras ---------------- */
  const ATALHOS_NUMERO = { 1: 'agenda', 2: 'atendimento', 3: 'crm', 4: 'comunicar', 5: 'patio', 6: 'orcador' };
  /** Estados vazios que ensinam: o que dizer e qual o próximo passo em cada cartão. */
  const VAZIOS = {
    cPatio: { texto: 'Nenhum carro dentro da oficina agora.', dica: 'Quando um cliente chega, toque em "Chegou" na Agenda ou em "+ Nova entrada" — o carro aparece aqui com a etapa ao vivo.' },
    cOrc: { texto: 'Nenhum orçamento esperando resposta.', dica: 'Orçamento enviado e ainda sem resposta aparece aqui, com o tempo de espera e se o cliente já abriu o link.' },
    cConversas: { texto: 'Ninguém esperando o consultor.', dica: 'Conversa em que o cliente escreveu por último e a equipe ainda não respondeu aparece aqui, da mais antiga para a mais nova.' },
    cHoje: { texto: 'Nenhum horário marcado para hoje.', dica: 'Use "+ Novo horário" ou peça ao Atendimento para oferecer horários livres ao cliente.' },
    cLeads: { texto: 'Todo lead novo tem responsável.', dica: 'Leads dos últimos 7 dias sem dono aparecem aqui para alguém assumir no CRM.' },
  };
  /** Clima da oficina: aberta, abre em, fecha em. */
  function climaDaOficina(agora = new Date()) {
    const dia = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short' }).format(agora);
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(agora);
    const [h, m] = hm.split(':').map(Number);
    const min = h * 60 + m;
    if (dia === 'Sun') return { estado: 'fechada', texto: 'Domingo — a oficina está fechada. Abre segunda às 8h.' };
    if (min < 8 * 60) return { estado: 'antes', texto: `A oficina abre em ${L.duracao((8 * 60 - min) * 60000)} (8h).`, minutos: 8 * 60 - min };
    if (min >= 17 * 60 + 30) return { estado: 'depois', texto: `Expediente encerrado às 17h30. ${dia === 'Sat' ? 'Abre segunda às 8h.' : 'Abre amanhã às 8h.'}` };
    const falta = 17 * 60 + 30 - min;
    return { estado: falta <= 60 ? 'fechando' : 'aberta', texto: falta <= 60 ? `Faltam ${L.duracao(falta * 60000)} para fechar (17h30).` : 'Oficina aberta (até 17h30).', minutos: falta };
  }

  root.CasaLogica2 = Object.freeze({
    avisosDeApps, voltaramAoAr, rotuloMotivo, PLANO_B, horaDe,
    comandos, filtrarComandos, ordemDosCartoes, ORDEM_CARTOES,
    meuDia, prazoDaTarefa, adiarTarefa, situacaoDaTarefa, filtrarTarefas, contagemDeTarefas, textoDoPrazo,
    iconeDoAviso, agruparAvisos, aindaAdiados, rotuloTipo,
    projecaoDoMes, progressoDaMeta, rankingConsultores, resumoDoDia,
    ATALHOS_NUMERO, VAZIOS, climaDaOficina,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
