/* Casa, rodada 13 — regras puras do herói da Central e do bloco "Mês da oficina" (só gestor e administrador).
   Sem tela e sem banco: testadas em tests/r13-casa.test.mjs. Usa CasaLogica (brl, hojeSP, FUSO) e CasaLogica2
   (projecaoDoMes, progressoDaMeta). */
(function (root) {
  'use strict';
  const L = root.CasaLogica;
  const L2 = root.CasaLogica2;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  /**
   * Os números do dia que a pessoa pode ver, na ordem da frase: conversas, horários, pátio, orçamentos.
   * Cada item: { k, app, n, frase (como entra na frase), rotulo (embaixo do número grande), nome (do app) }.
   * Sem os dados ainda (d nulo): lista vazia.
   */
  function numerosDoDia(d, v) {
    if (!d || !v) return [];
    const out = [];
    const um = (n, a, b, zero) => (n === 0 ? zero : n === 1 ? a : b);
    if (v.conversas && d.conversas) {
      const n = num(d.conversas.esperando);
      out.push({ k: 'conversas', app: 'atendimento', nome: 'Atendimento', n, frase: um(n, 'conversa esperando', 'conversas esperando', 'nenhuma conversa esperando'), rotulo: um(n, 'conversa esperando', 'conversas esperando', 'conversas esperando') });
    }
    if ((v.agenda || v.recepcao) && d.agenda) {
      const n = num(d.agenda.total);
      out.push({ k: 'agenda', app: 'agenda', nome: 'Agenda', n, frase: um(n, 'horário na Agenda', 'horários na Agenda', 'nenhum horário na Agenda'), rotulo: um(n, 'horário hoje', 'horários hoje', 'horários hoje') });
      /* R14: a recepção quer saber quem já chegou (a Agenda dela é a presença) */
      if (v.recepcao && d.agenda.chegaram != null) {
        const c = num(d.agenda.chegaram);
        out.push({ k: 'chegaram', app: 'agenda', nome: 'Agenda', n: c, frase: um(c, 'cliente já chegou', 'clientes já chegaram', 'ninguém chegou ainda'), rotulo: um(c, 'já chegou', 'já chegaram', 'já chegaram') });
      }
    }
    if (v.patio && d.patio) {
      const n = num(d.patio.total);
      const seu = !!v.soMeusCarros;
      out.push({ k: 'patio', app: 'patio', nome: 'Pátio', n,
        frase: seu ? um(n, 'carro seu no pátio', 'carros seus no pátio', 'nenhum carro seu no pátio') : um(n, 'carro no pátio', 'carros no pátio', 'nenhum carro no pátio'),
        rotulo: seu ? um(n, 'carro seu', 'carros seus', 'carros seus') : um(n, 'carro no pátio', 'carros no pátio', 'carros no pátio') });
    }
    if (v.orcamentos && d.orcamentos) {
      const n = num(d.orcamentos.esperando);
      out.push({ k: 'orcamentos', app: 'orcador', nome: 'Orçador', n, frase: um(n, 'orçamento esperando resposta', 'orçamentos esperando resposta', 'nenhum orçamento esperando resposta'), rotulo: um(n, 'orçamento esperando', 'orçamentos esperando', 'orçamentos esperando') });
    }
    return out;
  }

  /**
   * A frase grande do herói, em pedaços: { texto } ou { n, texto, app } (o número vai em vermelho e leva ao app).
   * "Hoje tem 3 conversas esperando, 4 horários na Agenda, 4 carros no pátio e 2 orçamentos esperando resposta."
   * Zero entra por extenso ("nenhuma conversa esperando"), sem número. Tudo zero: uma frase calma. Sem nada que a pessoa
   * possa ver: null (o herói mostra só a saudação).
   */
  function fraseDoDia(itens, { mecanico = false } = {}) {
    if (!Array.isArray(itens) || !itens.length) return null;
    if (itens.every((i) => i.n === 0)) {
      return [{ texto: mecanico ? 'Nenhum carro seu no pátio agora. Dia calmo por aqui.' : 'Dia calmo até agora: nada esperando por você.' }];
    }
    const partes = [{ texto: mecanico ? 'Você tem ' : 'Hoje tem ' }];
    itens.forEach((i, idx) => {
      if (idx > 0) partes.push({ texto: idx === itens.length - 1 ? ' e ' : ', ' });
      if (i.n === 0) partes.push({ texto: i.frase });
      else { partes.push({ n: i.n, app: i.app, texto: ' ' + i.frase }); }
    });
    partes.push({ texto: '.' });
    return partes;
  }
  /** A mesma frase em texto corrido (leitor de tela, título, testes). */
  const fraseEmTexto = (partes) => (partes || []).map((p) => (p.n != null ? p.n + p.texto : p.texto)).join('');

  /* ---------------- R14: a Agenda da recepção (presença) e os carros do mecânico ---------------- */
  const minutosDe = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  function minutosAgora(agora) {
    const p = new Intl.DateTimeFormat('pt-BR', { timeZone: L.FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(agora).split(':');
    return (Number(p[0]) % 24) * 60 + Number(p[1]);
  }
  const TOLERANCIA_MIN = 15;
  /**
   * O dia da recepção a partir da lista que a Agenda dá a quem só marca presença (GET /agenda/api/agendamentos: hoje e
   * quem está na casa de outro dia, sem telefone). total = horários de hoje sem os cancelados; chegaram = já está na oficina
   * ou já saiu; faltam = ainda esperados; atrasados = esperados cuja hora passou há mais de 15 min (a recepção liga ou marca
   * "não veio"); mais_atrasado = a hora do primeiro deles.
   */
  function agendaDaRecepcao(lista, agora = new Date(), hojeIso = L.hojeSP(agora)) {
    const hoje = (Array.isArray(lista) ? lista : []).filter((a) => a && String(a.data || '').slice(0, 10) === hojeIso && a.status !== 'cancelado');
    const chegou = (a) => a.compareceu === 1 || L.CHEGARAM.includes(a.status);
    const espera = (a) => !chegou(a) && ['aguardando', 'confirmado'].includes(a.status);
    const agoraMin = minutosAgora(agora);
    const atras = hoje.filter((a) => espera(a) && minutosDe(a.hora) != null && agoraMin - minutosDe(a.hora) >= TOLERANCIA_MIN)
      .sort((a, b) => minutosDe(a.hora) - minutosDe(b.hora));
    return { total: hoje.length, chegaram: hoje.filter(chegou).length, faltam: hoje.filter(espera).length, atrasados: atras.length, mais_atrasado: atras.length ? String(atras[0].hora).slice(0, 5) : null };
  }
  /**
   * Os carros do mecânico, do que pede mais atenção para o que acabou de chegar: pronto primeiro, depois o que está há
   * mais tempo na etapa. Cada um: { id, titulo (placa e modelo), cliente, etapa, tempo, tom ('ok'|'atencao'|'atrasado'), previsao }.
   */
  function carrosDoMecanico(lista, agoraMs = Date.now()) {
    const arr = (Array.isArray(lista) ? lista : []).filter((o) => o && o.id);
    const peso = (o) => (o.etapa === 'pronto' ? 0 : 1);
    arr.sort((a, b) => peso(a) - peso(b) || (Date.parse(a.etapa_em) || agoraMs) - (Date.parse(b.etapa_em) || agoraMs));
    return arr.map((o) => {
      const t = Date.parse(o.etapa_em);
      const pv = L.previsao(o.previsao_entrega, o.etapa, agoraMs);
      return {
        id: o.id, titulo: [L.formatarPlaca(o.placa), o.veiculo].filter(Boolean).join(' · ') || 'Carro sem placa', cliente: o.nome || o.cliente_nome || '',
        etapa: L.rotuloEtapa(o.etapa), tempo: Number.isFinite(t) ? L.duracao(agoraMs - t) : '', tom: L.tomDaEtapa(o.etapa, o.etapa_em, agoraMs), previsao: pv.texto, previsaoAtrasada: pv.atrasada,
      };
    });
  }

  /**
   * R14: avisos que só valem enquanto são o mais novo da série. "N tarefas vencidas" chega várias vezes por semana com a
   * contagem do momento (118 no mês, 9 sem ler ao mesmo tempo): só o último diz a verdade. Devolve os ids dos não lidos
   * que já foram superados por outro mais novo do mesmo tipo (a Casa os marca como lidos, sem barulho).
   */
  const TIPOS_SUBSTITUIVEIS = ['tarefas_vencidas'];
  function avisosSubstituidos(lista) {
    const novos = new Map();
    for (const n of Array.isArray(lista) ? lista : []) {
      if (!n || !TIPOS_SUBSTITUIVEIS.includes(n.tipo)) continue;
      const atual = novos.get(n.tipo);
      if (!atual || String(n.created_at) > String(atual.created_at)) novos.set(n.tipo, n);
    }
    return (Array.isArray(lista) ? lista : []).filter((n) => n && !n.lida_em && novos.has(n.tipo) && novos.get(n.tipo).id !== n.id).map((n) => n.id);
  }

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  /** "2026-11" do dia em São Paulo (a chave da meta em casa_metas). */
  const mesChave = (hojeIso = L.hojeSP()) => String(hojeIso).slice(0, 7);

  /**
   * O bloco do mês para o dono: faturamento até hoje, meta, projeção pelo ritmo dos dias úteis e quanto falta por dia.
   * `fat` = faturamento de r6_c1_painel_dono ({ mes, sem_valor_semana }); `meta` em reais (0 = sem meta).
   * selo: { tom: 'bom'|'atencao'|'ruim', texto } comparando a projeção com a meta (Boa ≥ 100 %, Atenção ≥ 85 %, Ruim abaixo).
   */
  function resumoDoMes(fat, meta, hojeIso = L.hojeSP()) {
    const f = fat || {};
    const valor = num(f.mes);
    const m = num(meta) > 0 ? Math.round(num(meta)) : 0;
    const mesNome = MESES[Number(String(hojeIso).slice(5, 7)) - 1] || '';
    const p = L2.projecaoDoMes(valor, hojeIso);
    const projecao = valor > 0 ? p.projecao : null;
    const pm = L2.progressoDaMeta(valor, m);
    let selo = null, porDia = null;
    if (pm) {
      if (pm.batida) selo = { tom: 'bom', texto: 'Meta batida' };
      else if (projecao != null) {
        const r = projecao / m;
        selo = r >= 1 ? { tom: 'bom', texto: 'Boa' } : r >= 0.85 ? { tom: 'atencao', texto: 'Atenção' } : { tom: 'ruim', texto: 'Ruim' };
      }
      if (!pm.batida && p.faltam > 0) porDia = Math.ceil(pm.falta / p.faltam);
    }
    return {
      mesNome, valor, meta: m, pct: pm ? pm.pct : null, barra: pm ? Math.min(100, Math.max(0, pm.pct)) : 0, falta: pm ? pm.falta : null, batida: !!(pm && pm.batida),
      projecao, porDia, faltamDias: num(p.faltam), passados: num(p.passados), total: num(p.total), selo, semValor: num(f.sem_valor_semana),
    };
  }

  /** Hora do relógio do herói ("10:03"), no fuso da oficina. */
  function horaAgora(agora = new Date()) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: L.FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(agora);
  }
  /** A linha curta embaixo do relógio: "Oficina aberta até 17h30", "Fechada · abre segunda às 8h"… */
  function linhaDaOficina(agora = new Date()) {
    const c = L2.climaDaOficina(agora);
    if (c.estado === 'aberta') return { tom: 'bom', texto: 'Oficina aberta até 17h30' };
    if (c.estado === 'fechando') return { tom: 'atencao', texto: 'Fecha às 17h30 · falta ' + L.duracao(c.minutos * 60000) };
    if (c.estado === 'antes') return { tom: 'neutro', texto: 'Abre às 8h' };
    const dia = new Intl.DateTimeFormat('en-US', { timeZone: L.FUSO, weekday: 'short' }).format(agora);
    return { tom: 'neutro', texto: dia === 'Sat' || dia === 'Sun' ? 'Fechada · abre segunda às 8h' : 'Fechada · abre amanhã às 8h' };
  }

  root.CasaLogica5 = Object.freeze({ numerosDoDia, fraseDoDia, fraseEmTexto, resumoDoMes, mesChave, horaAgora, linhaDaOficina, agendaDaRecepcao, carrosDoMecanico, avisosSubstituidos, MESES });
})(typeof globalThis !== 'undefined' ? globalThis : window);
