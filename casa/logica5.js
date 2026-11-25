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
    /* R17: o Orçador não tem uso real (0 orçamentos na semana): com zero esperando, o número sai do herói em vez de ocupar
       uma linha inteira no celular com "0". Volta sozinho no dia em que houver orçamento esperando. */
    if (v.orcamentos && d.orcamentos && num(d.orcamentos.esperando) > 0) {
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

  /* ---------------- R15: tarefas suas vencidas e o "último número" que aparece na hora ---------------- */
  /**
   * As tarefas abertas que são da pessoa e já passaram do prazo (o banco tem 61 abertas e 59 vencidas: sem separar o que é
   * seu, a Casa só repetiria o barulho do sino). `lista` = linhas de `tarefas` ({ vence_em }), `total` = a contagem do
   * banco quando a lista veio cortada. { n, maisAntiga: há quantos ms venceu a mais velha | null }.
   */
  function tarefasVencidas(lista, agoraMs = Date.now(), total = null) {
    const venc = (Array.isArray(lista) ? lista : []).map((t) => Date.parse(t && t.vence_em)).filter((ms) => Number.isFinite(ms) && ms < agoraMs);
    if (!venc.length) return { n: 0, maisAntiga: null };
    return { n: Number.isFinite(total) && total >= venc.length ? total : venc.length, maisAntiga: agoraMs - Math.min(...venc) };
  }

  /**
   * O que a Casa guarda no aparelho para pintar o herói NA HORA da próxima abertura (só contagens, nenhum nome, telefone ou
   * valor): { em, perfil, dia, d }. A leitura de verdade chega logo depois e troca tudo.
   */
  function instantaneoDe(d, perfilId, agoraMs = Date.now(), hojeIso = L.hojeSP(new Date(agoraMs))) {
    if (!d || !perfilId) return null;
    const s = {};
    if (d.conversas) s.conversas = { esperando: num(d.conversas.esperando) };
    if (d.agenda) s.agenda = { total: num(d.agenda.total), ...(d.agenda.chegaram != null ? { chegaram: num(d.agenda.chegaram) } : {}) };
    if (d.patio) s.patio = { total: num(d.patio.total) };
    if (d.orcamentos) s.orcamentos = { esperando: num(d.orcamentos.esperando) };
    return Object.keys(s).length ? { em: agoraMs, perfil: String(perfilId), dia: hojeIso, d: s } : null;
  }
  /** O instantâneo só vale para a mesma pessoa, no mesmo dia e com menos de 6 horas; senão null (a Casa mostra "lendo…"). */
  function instantaneoValido(snap, perfilId, agoraMs = Date.now(), hojeIso = L.hojeSP(new Date(agoraMs))) {
    if (!snap || typeof snap !== 'object' || !snap.d || snap.perfil !== String(perfilId) || snap.dia !== hojeIso) return null;
    const idade = agoraMs - Number(snap.em);
    return Number.isFinite(idade) && idade >= 0 && idade < 6 * 36e5 ? snap : null;
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

  /* ---------------- R18: WhatsApp parado (o problema nº 1 do dia) ---------------- */
  /* No banco de 25/11 o estado guardado dizia "ok" (r7_c4_zap e posvenda_config), mas nenhuma mensagem de cliente chegava
     desde 24/11 08:24. Por isso, além do que o servidor anotou, conta o silêncio: com ~80 mensagens por dia, a maior
     pausa normal em 30 dias foi de 18 h (a noite); 20 h sem nenhuma mensagem chegando é parada. */
  const SILENCIO_H = 20;
  const MOTIVOS_ZAP = {
    'codewords-401': 'a chave do CodeWords foi recusada',
    'whatsapp-desconectado': 'o celular da oficina está desconectado',
    cota: 'a cota do CodeWords acabou',
    chave_recusada: 'a chave do CodeWords foi recusada',
    sem_chave: 'não há chave do CodeWords colada',
    sem_aparelho: 'não há celular conectado',
    desconectado: 'o celular da oficina está desconectado',
    'sem-receber': 'nenhuma mensagem de cliente chega',
  };
  /**
   * { zap: linha de r7_c4_zap ({ parado, codigo, desde }), rpcWa: whatsapp de r7_c1_saude_sistemas ({ estado, desde }),
   *   ultimaEntrada: created_at da última mensagem recebida (null = não deu para ler), agoraMs }
   * → null (funcionando ou sem leitura) ou { codigo, desdeMs, ms, motivo }.
   */
  function whatsappParado({ zap = null, rpcWa = null, ultimaEntrada = null, agoraMs = Date.now(), silencioH = SILENCIO_H } = {}) {
    const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };
    const pronto = (codigo, desde) => {
      const d = desde != null && desde <= agoraMs ? desde : null;
      return { codigo, desdeMs: d, ms: d == null ? null : agoraMs - d, motivo: MOTIVOS_ZAP[codigo] || 'o WhatsApp da oficina não responde' };
    };
    if (zap && zap.parado === true) return pronto(String(zap.codigo || 'parado'), ms(zap.desde));
    if (rpcWa && ['chave_recusada', 'sem_chave', 'sem_aparelho', 'desconectado'].includes(rpcWa.estado)) return pronto(rpcWa.estado, ms(rpcWa.desde));
    const ult = ms(ultimaEntrada);
    if (ult != null && agoraMs - ult >= silencioH * 36e5) return pronto('sem-receber', ult);
    return null;
  }
  /**
   * A linha do herói: { titulo, passo, rotulo, q }. Quem cola a chave é o administrador (o João): para ele o passo é fazer;
   * para o resto da equipe, pedir a ele. Leva ao Atendimento (a faixa completa mora lá; aqui não se repete).
   */
  function linhaDoZap(p, { papel = '', agora = new Date() } = {}) {
    if (!p) return null;
    const quando = p.desdeMs != null && L2 && L2.textoDoPrazo ? L2.textoDoPrazo(new Date(p.desdeMs).toISOString(), agora) : '';
    const titulo = 'WhatsApp parado' + (quando ? ' desde ' + quando : '') + (p.ms != null && p.ms >= 36e5 ? ' (' + L.duracao(p.ms) + ')' : '') + ': ' + p.motivo + '.';
    const dono = papel === 'admin';
    const chave = p.codigo !== 'whatsapp-desconectado' && p.codigo !== 'desconectado' && p.codigo !== 'sem_aparelho';
    const passo = chave
      ? (dono ? 'Cole a chave do CodeWords em Atendimento › Ajustes › WhatsApp e chaves.' : 'Peça ao João para colar a chave em Ajustes › WhatsApp e chaves.')
      : (dono ? 'Reconecte o celular da oficina no Atendimento.' : 'Peça ao João para reconectar o celular da oficina.');
    return { titulo, passo, rotulo: 'Abrir o Atendimento', q: ['admin', 'gestor'].includes(papel) ? '?aba=integracoes' : '' };
  }

  /* ---------------- R18: o sino com 131 não lidas, agrupado por tipo ---------------- */
  const ROTULOS_SINO = {
    patio: ['aviso do Pátio', 'avisos do Pátio'], tarefa: ['tarefa', 'tarefas'], atraso: ['horário atrasado', 'horários atrasados'],
    aguardando: ['conversa esperando consultor', 'conversas esperando consultor'], espera: ['conversa esperando resposta', 'conversas esperando resposta'],
    tarefas_vencidas: ['aviso de tarefas vencidas', 'avisos de tarefas vencidas'], resumo: ['resumo', 'resumos'], ia: ['aviso da IA', 'avisos da IA'],
    sugestao_perdido: ['contato para dar como perdido', 'contatos para dar como perdidos'], falhas: ['aviso de envio com falha', 'avisos de envio com falha'],
    resumo_semanal: ['resumo da semana', 'resumos da semana'], whatsapp: ['aviso do WhatsApp', 'avisos do WhatsApp'],
    whatsapp_voltou: ['aviso de WhatsApp de volta', 'avisos de WhatsApp de volta'], whatsapp_caiu: ['aviso de WhatsApp caído', 'avisos de WhatsApp caído'],
    lead: ['contato novo', 'contatos novos'], lead_sem_contato: ['contato sem conversa', 'contatos sem conversa'], conversa: ['conversa', 'conversas'],
    extra: ['extra esperando', 'extras esperando'], orcamento_visto: ['orçamento visto', 'orçamentos vistos'],
  };
  /** "34 avisos do Pátio", "1 tarefa"… (tipo desconhecido: o rótulo do sino antigo). */
  function rotuloDoGrupo(tipo, n) {
    const r = ROTULOS_SINO[tipo];
    if (r) return n + ' ' + (n === 1 ? r[0] : r[1]);
    return n + ' ' + (L2 && L2.rotuloTipo ? L2.rotuloTipo(tipo) : (tipo || 'avisos'));
  }
  /**
   * Os avisos em grupos por tipo, do grupo com mais não lidos para o com menos (empate: o de aviso mais novo primeiro).
   * Cada grupo: { tipo, itens (mais novo primeiro), novos (ids não lidos), maisNovo (created_at) }.
   */
  function gruposDoSino(lista) {
    const mapa = new Map();
    for (const n of Array.isArray(lista) ? lista : []) {
      if (!n || !n.id) continue;
      const t = n.tipo || 'outros';
      if (!mapa.has(t)) mapa.set(t, []);
      mapa.get(t).push(n);
    }
    const out = [...mapa.entries()].map(([tipo, itens]) => {
      itens.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return { tipo, itens, novos: itens.filter((n) => !n.lida_em).map((n) => n.id), maisNovo: itens[0].created_at || '' };
    });
    return out.sort((a, b) => b.novos.length - a.novos.length || String(b.maisNovo).localeCompare(String(a.maisNovo)) || b.itens.length - a.itens.length);
  }
  /** O texto do pedido de confirmação de uma marcação em lote ("Marcar 131 avisos como lidos?"). */
  const perguntaDoLote = (n, grupo = false) => (n === 1 ? 'Marcar 1 aviso como lido?' : `Marcar ${grupo ? 'os ' + n + ' avisos deste grupo' : n + ' avisos'} como lidos?`);

  root.CasaLogica5 = Object.freeze({ numerosDoDia, fraseDoDia, fraseEmTexto, resumoDoMes, mesChave, horaAgora, linhaDaOficina, agendaDaRecepcao, carrosDoMecanico, avisosSubstituidos, tarefasVencidas, instantaneoDe, instantaneoValido, MESES,
    whatsappParado, linhaDoZap, SILENCIO_H, gruposDoSino, rotuloDoGrupo, perguntaDoLote });
})(typeof globalThis !== 'undefined' ? globalThis : window);
