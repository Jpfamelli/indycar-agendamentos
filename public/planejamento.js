/* ============================================================================
   Planejamento da Agenda — regras PURAS (sem DOM, sem banco, sem preço).
   Carregado antes do app.js no navegador (window.Planejamento) e importado
   pelos testes no Node (globalThis.Planejamento). Tudo aqui é testável.
   ============================================================================ */
(function (root) {
  'use strict';
  /* Status que já tiveram desfecho (ou não vão acontecer): não ocupam horário. */
  const FINAIS = new Set(['concluido', 'nao_fechou', 'nao_veio', 'cancelado']);
  const ATIVO = (a) => a && !FINAIS.has(a.status);
  const ORIGEM_ATENDIMENTO = 'https://indycar-atendimento.onrender.com/';
  const ORIGEM_CRM = 'https://indycar-crm.onrender.com/';
  const ORIGEM_COMUNICAR = 'https://indycar-posvenda.onrender.com/';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /* Janela de recepção: um consultor recebe um carro a cada 30 min. Dois
     horários que começam a menos de 30 min um do outro disputam a mesma pessoa. */
  const JANELA_MIN = 30;

  const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  /** Só os dígitos nacionais (DDD + número), sem o 55 — igual a clientes.telefone_e164. */
  const telefone = (v) => {
    const d = String(v ?? '').replace(/\D/g, '');
    return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
  };
  const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());

  function dia(v, n = 0) {
    const d = new Date(String(v) + 'T12:00:00Z');
    if (!Number.isFinite(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  /** Os dias de um período: 'dia' = [v]; 'semana' = seg→dom da semana de v; 'mes' = o mês de v. */
  function periodo(v, modo) {
    const d = new Date(String(v) + 'T12:00:00Z');
    if (!Number.isFinite(d.getTime())) return [];
    if (modo === 'mes') {
      const base = v.slice(0, 7) + '-01';
      const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      return Array.from({ length: fim }, (_, i) => dia(base, i));
    }
    if (modo === 'semana') {
      const base = dia(v, -((d.getUTCDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => dia(base, i));
    }
    return [v];
  }
  /** Anda um período para frente/trás (o mês anda pelo dia 1, sem pular fevereiro). */
  function andar(v, modo, n) {
    if (modo === 'mes') {
      const d = new Date(v.slice(0, 7) + '-01T12:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + n);
      return d.toISOString().slice(0, 10);
    }
    return dia(v, n * (modo === 'semana' ? 7 : 1));
  }

  /** Mapa nome normalizado -> minutos, a partir da lista de /api/servicos (duracao_min). */
  function tabelaDuracoes(servicos) {
    const m = new Map();
    for (const s of servicos || []) {
      const min = Number(s?.duracao_min);
      if (s?.nome && Number.isFinite(min) && min > 0) m.set(normalizar(s.nome), min);
    }
    return m;
  }
  /** Duração ESTIMADA do serviço (só para organizar o dia; nunca vai para o cliente).
      1º o cadastro de serviços (nome igual ou contido); 2º palavras-chave; 3º 60 min. */
  function duracao(servico, tabela) {
    const s = normalizar(servico);
    if (tabela && s) {
      if (tabela.has(s)) return tabela.get(s);
      let melhor = null;
      for (const [nome, min] of tabela) {
        if (nome.length >= 4 && s.includes(nome) && (!melhor || nome.length > melhor[0].length)) melhor = [nome, min];
      }
      if (melhor) return melhor[1];
    }
    if (/revisaodemotor|embreagem/.test(s)) return 300;
    if (/correia/.test(s)) return 240;
    if (/cambio|suspensao|amortecedor|direcao/.test(s)) return 120;
    if (/freio|pastilha|bico/.test(s)) return 90;
    if (/pneu|balanceamento/.test(s)) return 60;
    if (/oleo|alinhamento/.test(s)) return 45;
    if (/diagnostico|scanner/.test(s)) return 30;
    return 60;
  }
  function minutos(h) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(h || ''));
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  }
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  /**
   * Possíveis conflitos de um horário: outros agendamentos ATIVOS do mesmo dia
   * que chegam a menos de 30 min. Com consultor escolhido, só os dele contam;
   * sem consultor, só vira conflito quando a recepção lota (>= capacidade).
   */
  function conflitos(lista, atual, capacidade = 1) {
    const ini = minutos(atual?.hora);
    if (ini === null || !atual?.data || !ATIVO(atual)) return [];
    const perto = (lista || []).filter((a) => a.id !== atual.id && a.data === atual.data && ATIVO(a)
      && minutos(a.hora) !== null && Math.abs(minutos(a.hora) - ini) < JANELA_MIN);
    if (atual.consultor_id) {
      const meus = perto.filter((a) => a.consultor_id === atual.consultor_id);
      if (meus.length) return meus;
    }
    return perto.length >= Math.max(1, capacidade) ? perto : [];
  }

  /** Ocupação do dia: quantos horários ativos x vagas de recepção (19 janelas de 30 min x capacidade). */
  function ocupacao(lista, data, capacidade = 1, tabela) {
    const ativos = (lista || []).filter((a) => a.data === data && ATIVO(a));
    const vagas = 19 * Math.max(1, capacidade);
    const carga = ativos.reduce((s, a) => s + duracao(a.servico, tabela), 0);
    return { ativos: ativos.length, vagas, pct: Math.min(100, Math.round(ativos.length / vagas * 100)), cargaMin: carga };
  }

  function filtrar(lista, f = {}) {
    const q = normalizar(f.q);
    const tq = String(f.q || '').replace(/\D/g, '');
    return (lista || []).filter((a) => (!f.inicio || a.data >= f.inicio) && (!f.fim || a.data <= f.fim)
      && (!f.status || a.status === f.status) && (!f.consultor || a.consultor_id === f.consultor)
      && (!f.origem || a.origem === f.origem) && (!f.semTelefone || !telefone(a.telefone))
      && (!q || [a.cliente_nome, a.placa, a.veiculo, a.servico, a.consultor_nome].some((v) => normalizar(v).includes(q))
        || (tq.length >= 3 && telefone(a.telefone).includes(tq))));
  }

  /** veio = esteve na oficina; fechou = concluído; faltou = não veio. Taxas sobre quem já tem desfecho. */
  function resumo(lista) {
    const l = lista || [];
    const total = l.length;
    const fechou = l.filter((a) => a.status === 'concluido').length;
    const naoFechou = l.filter((a) => a.status === 'nao_fechou').length;
    const faltou = l.filter((a) => a.status === 'nao_veio').length;
    const veio = l.filter((a) => ['concluido', 'nao_fechou', 'compareceu', 'em_atendimento'].includes(a.status)).length;
    const resolvidos = fechou + naoFechou + faltou;
    return {
      total, fechou, naoFechou, faltou, veio,
      pendentes: l.filter(ATIVO).length,
      cancelados: l.filter((a) => a.status === 'cancelado').length,
      taxaFalta: resolvidos ? Math.round(faltou / resolvidos * 100) : 0,
      conversao: veio ? Math.round(fechou / veio * 100) : 0,
    };
  }
  function grupos(lista, campo) {
    const m = new Map();
    for (const a of lista || []) {
      const k = a[campo] || 'Não informado';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return [...m].map(([nome, itens]) => ({ nome, ...resumo(itens) }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  /** CSV para o Excel BR (;), com BOM e proteção contra fórmula (=, +, -, @ no começo). */
  function csv(lista, rotulos = {}) {
    const campo = (v) => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const cab = ['Data', 'Hora', 'Cliente', 'Telefone', 'Carro', 'Placa', 'Serviço', 'Consultor', 'Origem', 'Situação'];
    const linhas = (lista || []).map((a) => [a.data, a.hora, a.cliente_nome, a.telefone, a.veiculo, a.placa, a.servico,
      a.consultor_nome, a.origem, rotulos[a.status] || a.status]);
    return '﻿' + [cab, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n');
  }

  /**
   * Links de saída para o ecossistema (contrato combinado entre os apps):
   *   Atendimento → ?tel=<dígitos>
   *   CRM         → ?cliente=<uuid>&tel=<dígitos>
   *   Comunicar   → ?cliente=<uuid>&tel=<dígitos>
   * Sem telefone nem ficha, o link daquele app não aparece.
   */
  function links(a) {
    const t = telefone(a?.telefone);
    const cid = ehUuid(a?.cliente_id) ? a.cliente_id.trim() : '';
    const q = (pares) => {
      const p = new URLSearchParams();
      for (const [k, v] of pares) if (v) p.set(k, v);
      const s = p.toString();
      return s ? '?' + s : '';
    };
    const out = {};
    if (t) out.atendimento = ORIGEM_ATENDIMENTO + q([['tel', t]]);
    if (t || cid) {
      out.crm = ORIGEM_CRM + q([['cliente', cid], ['tel', t]]);
      out.comunicar = ORIGEM_COMUNICAR + q([['cliente', cid], ['tel', t]]);
    }
    return out;
  }

  /**
   * Link de ENTRADA (?tel=<dígitos>&cliente=<uuid>&agendamento=<uuid>) vindo do
   * Atendimento, CRM ou Comunicar. Devolve null quando não há nada aproveitável;
   * telefone com menos de 10 dígitos é ignorado (não dá para achar ninguém com ele).
   */
  function lerEntrada(search) {
    const p = new URLSearchParams(search || '');
    const t = telefone(p.get('tel') || p.get('telefone') || '');
    const tel = t.length >= 10 && t.length <= 11 ? t : '';
    const cliente = ehUuid(p.get('cliente') || '') ? p.get('cliente').trim().toLowerCase() : '';
    const agendamento = ehUuid(p.get('agendamento') || '') ? p.get('agendamento').trim().toLowerCase() : '';
    if (!tel && !cliente && !agendamento) return null;
    return { tel, cliente, agendamento };
  }
  /** A mesma URL sem os parâmetros de entrada (o telefone não fica na barra nem no histórico). */
  function semEntrada(href) {
    const u = new URL(href);
    for (const k of ['tel', 'telefone', 'cliente', 'agendamento']) u.searchParams.delete(k);
    return u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash;
  }

  root.Planejamento = Object.freeze({
    FINAIS, JANELA_MIN, normalizar, telefone, ehUuid, dia, periodo, andar, tabelaDuracoes, duracao, minutos, hhmm,
    conflitos, ocupacao, filtrar, resumo, grupos, csv, links, lerEntrada, semEntrada,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
