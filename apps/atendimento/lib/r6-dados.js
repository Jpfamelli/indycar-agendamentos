/* ============================================================
   IndyCar Atendimento — dados da Rodada 6 (C3)
   Tudo que a fila priorizada e o painel lateral precisam saber de OUTROS
   sistemas (Pátio, Orçador, CRM, Agenda), lido pelo servidor com a chave de
   serviço — o navegador do atendente nem sempre tem permissão nessas tabelas.

     filaContexto()          → por conversa: o que o cliente pediu, carro no pátio,
                               orçamento, mensagens que não saíram
     painelCliente(id)       → ficha conectada (r6_cliente_360 + regras desta rodada)
     patioAoVivo(id)         → só a etapa do carro (para atualizar a cada 20 s)
     naoSairam()             → mensagens de saída que falharam (WhatsApp parado)
     resolverFora(...)       → "resolvi por telefone": a mensagem não precisa ser reenviada
     passarParaConsultor()   → marca aguardando consultor + tarefa, com um clique
     estadoIA(conversaId)    → o que a IA está fazendo nesta conversa e por quê

   O banco é injetado (sb) para testar com dublê.
   ============================================================ */
'use strict';

const R6 = require('../public/r6-regras.js');
const PAT = require('./patio.js');
const COM = require('./comunicar.js');
const C5 = require('./r6c5.js');

const ABERTAS = PAT.ABERTAS;
const DIA = 86_400_000;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chave para casar telefones gravados de jeitos diferentes: DDD + últimos 8 dígitos. */
function chaveTel(t) {
  let d = String(t ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

/** As mensagens do cliente depois da última resposta da loja → textos (anexo sem texto vira [áudio]/[foto]). */
function textosSemResposta(mensagens = []) {
  const out = [];
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m.direcao === 'saida') break;
    if (m.direcao !== 'entrada') continue;
    let t = String(m.corpo ?? '').trim();
    if (!t && m.anexo) {
      const mime = String(m.anexo_mime || '');
      t = mime.startsWith('audio/') ? '[áudio]' : mime.startsWith('video/') ? '[vídeo]' : mime.startsWith('image/') ? '[foto]' : '[documento]';
    }
    if (t) out.unshift(t);
  }
  return out;
}

function criarR6({ sb, agora = () => new Date(), log = console.error, patio = null, auditar = async () => ({ ok: true }) } = {}) {
  if (!sb) throw new Error('r6 sem banco');
  const pat = patio || PAT.criarPatio({ sb, agora });
  const cache = new Map();   // chave -> { em, valor }
  const doCache = (k, ttl) => { const c = cache.get(k); return c && Date.now() - c.em < ttl ? c.valor : null; };
  const guarda = (k, valor) => { if (cache.size > 50) cache.clear(); cache.set(k, { em: Date.now(), valor }); return valor; };

  async function ler(rotulo, consulta, avisos) {
    try {
      const { data, error } = await consulta;
      if (error) { avisos.push(`${rotulo}: ${error.message}`); return []; }
      return data || [];
    } catch (e) { avisos.push(`${rotulo}: ${e.message}`); return []; }
  }

  /* ---------------- Fila: o que sabemos de cada conversa ---------------- */
  async function filaContexto({ forcar = false } = {}) {
    const c = !forcar && doCache('fila', 12_000);
    if (c) return c;
    const avisos = [];
    const t0 = agora();
    const desde7 = new Date(t0.getTime() - 7 * DIA).toISOString();
    const desde3 = new Date(t0.getTime() - 3 * DIA).toISOString();
    const desde90 = new Date(t0.getTime() - 90 * DIA).toISOString();

    const desde14 = new Date(t0.getTime() - 14 * DIA).toISOString();
    const [convs, oss, orcs, falhas, preAg, avalRuins, manipulacoes] = await Promise.all([
      ler('conversas', sb.from('conversas')
        .select('id,cliente_id,telefone,telefone_e164,nao_lidas,aguardando_consultor,aguardando_desde,ultima_mensagem_em,atribuida_a')
        .eq('tipo', 'atendimento').is('desfecho', null).gte('ultima_mensagem_em', desde7)
        .order('ultima_mensagem_em', { ascending: false }).limit(400), avisos),
      ler('pátio', sb.from('patio_os')
        .select('id,numero,etapa,etapa_em,cliente_id,telefone,veiculo,placa,previsao_entrega,orcamento_id,token_publico')
        .in('etapa', ABERTAS).limit(300), avisos),
      ler('orçamentos', sb.from('orc_orcamentos')
        .select('id,numero,status,cliente_id,cliente_telefone,enviado_em,visualizado_em,decidido_em,validade,agendamento_id,created_at,token_publico')
        .in('status', ['enviado', 'aprovado', 'recusado']).gte('created_at', desde90).limit(400), avisos),
      ler('mensagens que falharam', sb.from('whatsapp_mensagens')
        .select('id,conversa_id,erro,created_at').eq('direcao', 'saida').eq('status', 'falhou').gte('created_at', desde3).limit(500), avisos),
      ler('pré-agendamentos', sb.from('agendamentos')
        .select('id,cliente_id,telefone,telefone_e164,data,hora,status,observacoes')
        .ilike('observacoes', '%agendamento pedido pelo cliente%').eq('status', 'aguardando').gte('data', desde3.slice(0, 10)).limit(200), avisos),
      // Rodada 7: nota ruim sem resposta e tentativas de manipulação (últimas 24 h)
      ler('avaliações ruins', sb.from('patio_avaliacoes').select('cliente_id,nota,created_at,respondido_em').lte('nota', 3).gte('created_at', desde14).limit(100), avisos),
      ler('manipulação', sb.from('ia_acoes').select('conversa_id').eq('tipo', 'bloqueio_manipulacao').gte('created_at', new Date(t0.getTime() - DIA).toISOString()).limit(200), avisos),
    ]);
    const ruimPorCliente = new Map();
    for (const a of avalRuins) if (a.cliente_id && !a.respondido_em && !ruimPorCliente.has(a.cliente_id)) ruimPorCliente.set(a.cliente_id, { nota: a.nota });
    const manipuladas = new Set(manipulacoes.map(x => x.conversa_id));

    const ids = convs.map(x => x.id);
    const msgs = ids.length ? await ler('mensagens', sb.from('whatsapp_mensagens')
      .select('conversa_id,direcao,corpo,anexo,anexo_mime,created_at')
      .in('conversa_id', ids.slice(0, 400)).gte('created_at', desde7)
      .order('created_at', { ascending: false }).limit(4000), avisos) : [];
    const por = new Map();
    for (const m of msgs) { if (!por.has(m.conversa_id)) por.set(m.conversa_id, []); por.get(m.conversa_id).push(m); }

    // extras esperando o cliente (por OS)
    const osIds = oss.map(o => o.id);
    const extras = osIds.length ? await ler('extras do pátio', sb.from('patio_extras')
      .select('os_id,status,created_at').eq('status', 'pendente').in('os_id', osIds.slice(0, 300)), avisos) : [];
    const extraPorOs = new Map();
    for (const e of extras) {
      const a = extraPorOs.get(e.os_id) || { n: 0, desde: e.created_at };
      a.n++; if (String(e.created_at) < String(a.desde)) a.desde = e.created_at;
      extraPorOs.set(e.os_id, a);
    }
    const osPorCliente = new Map(), osPorTel = new Map();
    for (const o of oss) {
      if (o.cliente_id && !osPorCliente.has(o.cliente_id)) osPorCliente.set(o.cliente_id, o);
      const k = chaveTel(o.telefone); if (k && !osPorTel.has(k)) osPorTel.set(k, o);
    }
    const orcPorCliente = new Map(), orcPorTel = new Map();
    // recusado só conta nos últimos 14 dias (depois disso o cliente já seguiu em frente)
    const pesoOrc = o => { if (o.status === 'recusado') return String(o.decidido_em || o.created_at) >= desde14 ? 5 : -1; const s = R6.situacaoOrcamento(o, t0); return ['aprovado_sem_horario', 'visualizado', 'parado', 'enviado', 'aprovado'].indexOf(s.cod); };
    const guardaOrc = (mapa, k, o) => { if (!k) return; const a = mapa.get(k); if (!a || (pesoOrc(o) >= 0 && (pesoOrc(a) < 0 || pesoOrc(o) < pesoOrc(a)))) mapa.set(k, o); };
    for (const o of orcs) { if (o.status === 'recusado' && String(o.decidido_em || o.created_at) < desde14) continue; guardaOrc(orcPorCliente, o.cliente_id, o); guardaOrc(orcPorTel, chaveTel(o.cliente_telefone), o); }

    const preCliente = new Map(), preTel = new Map();
    for (const a of preAg) {
      if (!R6.ehPreAgendamento(a.observacoes)) continue;
      const item = { id: a.id, data: a.data, hora: a.hora ? String(a.hora).slice(0, 5) : null };
      if (a.cliente_id && !preCliente.has(a.cliente_id)) preCliente.set(a.cliente_id, item);
      const k = chaveTel(a.telefone_e164 || a.telefone); if (k && !preTel.has(k)) preTel.set(k, item);
    }

    const falhaPorConversa = new Map();
    for (const f of falhas) {
      const a = falhaPorConversa.get(f.conversa_id) || { nao_saiu: 0, sem_confirmacao: 0 };
      if (/^Resolvido/.test(f.erro || '')) continue;
      if (/^Sem confirmação/.test(f.erro || '')) a.sem_confirmacao++; else a.nao_saiu++;
      falhaPorConversa.set(f.conversa_id, a);
    }

    const conversas = {};
    for (const cv of convs) {
      const lista = (por.get(cv.id) || []).slice().reverse();     // do mais antigo ao mais novo
      const sem = textosSemResposta(lista);
      const semResposta = lista.length ? lista[lista.length - 1].direcao === 'entrada' : (cv.nao_lidas > 0);
      const o = osPorCliente.get(cv.cliente_id) || osPorTel.get(chaveTel(cv.telefone_e164 || cv.telefone)) || null;
      const orc = orcPorCliente.get(cv.cliente_id) || orcPorTel.get(chaveTel(cv.telefone_e164 || cv.telefone)) || null;
      const item = { sem_resposta: !!semResposta, pedidos: semResposta ? R6.oQueOClientePediu(sem) : [] };
      if (o) {
        const ex = extraPorOs.get(o.id);
        item.patio = { os_id: o.id, numero: o.numero, etapa: o.etapa, etapa_rotulo: PAT.ETAPAS[o.etapa] || o.etapa,
          tom: o.etapa === 'pronto' ? 'ok' : (ex ? 'atencao' : 'andamento'), extras_pendentes: ex ? ex.n : 0,
          extra_min: ex ? R6.minutosEntre(ex.desde, t0) : null, min_na_etapa: R6.minutosEntre(o.etapa_em, t0) };
      }
      if (orc) {
        const s = R6.situacaoOrcamento(orc, t0);
        item.orc = { id: orc.id, decidido_em: orc.decidido_em || null, numero: orc.numero, status: orc.status, enviado_em: orc.enviado_em, visualizado_em: orc.visualizado_em,
          validade: orc.validade, agendamento_id: orc.agendamento_id, created_at: orc.created_at, rotulo: s.rotulo, cod: s.cod };
      }
      const fl = falhaPorConversa.get(cv.id);
      if (fl) item.falhas = fl;
      const pre = preCliente.get(cv.cliente_id) || preTel.get(chaveTel(cv.telefone_e164 || cv.telefone)) || null;
      if (pre) item.pre = pre;
      const ruim = ruimPorCliente.get(cv.cliente_id);
      if (ruim) item.avaliacao_ruim = ruim;
      if (manipuladas.has(cv.id) && semResposta) item.manipulacao = true;
      if (semResposta && !cv.cliente_id && lista.length && !lista.some(m => m.direcao === 'saida')) item.primeiro_contato = true;
      if (item.sem_resposta || item.patio || item.orc || item.falhas || item.pre || item.avaliacao_ruim) conversas[cv.id] = item;
    }
    const resumo = { conversas: Object.keys(conversas).length, no_patio: oss.length,
      orcamentos_abertos: orcs.length, mensagens_que_nao_sairam: [...falhaPorConversa.values()].reduce((s, a) => s + a.nao_saiu + a.sem_confirmacao, 0) };
    return guarda('fila', { ok: true, gerado_em: t0.toISOString(), conversas, resumo, avisos });
  }

  /* ---------------- Painel conectado do cliente ---------------- */
  const rotuloLead = { novo: 'Novo', contato: 'Em contato', orcamento: 'Orçamento', agendado: 'Agendado', em_servico: 'Em serviço', concluido: 'Concluído', perdido: 'Perdido' };

  async function painelCliente(clienteId) {
    if (!RE_UUID.test(String(clienteId || ''))) return { ok: false, status: 400, erro: 'id de cliente inválido' };
    const c = doCache('painel:' + clienteId, 4_000);
    if (c) return c;
    const { data: cli, error } = await sb.from('clientes')
      .select('id,nome,telefone,telefone_e164,carro_modelo,carro_ano,placa').eq('id', clienteId).maybeSingle();
    if (error) { log('painel:', error.message); return { ok: false, status: 503, erro: 'Não consegui ler o cliente agora.' }; }
    if (!cli) return { ok: false, status: 404, erro: 'Cliente não encontrado.' };
    const tel = cli.telefone_e164 || cli.telefone;
    let r360 = null, aviso = null;
    try {
      const { data, error: e2 } = await sb.rpc('r6_cliente_360', { p_telefone: tel });
      if (e2) aviso = 'ficha conectada: ' + e2.message; else r360 = data;
    } catch (e) { aviso = 'ficha conectada: ' + e.message; }
    r360 = r360 || {};
    const t0 = agora();

    // orçamentos com situação e links
    const orcamentos = (r360.orcamentos || []).map(o => {
      const s = R6.situacaoOrcamento(o, t0);
      return { id: o.id, numero: o.numero, status: o.status, rotulo: s.rotulo, tom: s.tom, cod: s.cod, acao: s.acao,
        total: o.total ?? null, total_a_vista: o.total_a_vista ?? null, pedido: o.pedido || null,
        veiculo: typeof o.veiculo === 'string' ? o.veiculo : (o.veiculo?.modelo || null), placa: o.placa || o.veiculo?.placa || null,
        enviado_em: o.enviado_em || null, visualizado_em: o.visualizado_em || null, decidido_em: o.decidido_em || null,
        validade: o.validade || null, created_at: o.created_at || null, agendamento_id: o.agendamento_id || null, lead_id: o.lead_id || null,
        os_numero: o.os_numero || null, os_etapa: o.os_etapa || null,
        abrir: R6.linkOrcamento(o.id), link_cliente: o.link_cliente || null };
    });
    const principal = R6.orcamentoQueImporta(orcamentos, t0);

    // pátio: a ordem aberta (ou entregue há pouco); o r6_cliente_360 já traz a lista
    const ordens = (r360.patio || []).filter(o => o && o.etapa !== 'cancelado');
    const aberta = ordens.find(o => ABERTAS.includes(o.etapa)) || ordens.find(o => o.etapa === 'entregue' && t0 - Date.parse(o.entregue_em || o.etapa_em || 0) <= 2 * DIA) || null;
    let patioPainel = null;
    // o r6_cliente_360 não traz quando o cliente abriu o link de acompanhar: lê direto da OS
    let linkVistoEm = aberta?.link_visto_em || null;
    if (aberta && !linkVistoEm) {
      try { const { data: v } = await sb.from('patio_os').select('link_visto_em').eq('id', aberta.id).maybeSingle(); linkVistoEm = v?.link_visto_em || null; }
      catch (e) { log('link_visto_em:', e.message); }
    }
    if (aberta) {
      patioPainel = {
        id: aberta.id, numero: aberta.numero ?? null, etapa: aberta.etapa, etapa_rotulo: aberta.etapa_rotulo || PAT.ETAPAS[aberta.etapa] || aberta.etapa,
        minutos_na_etapa: aberta.minutos_na_etapa ?? R6.minutosEntre(aberta.etapa_em, t0), atrasado: !!aberta.atrasado,
        veiculo: aberta.veiculo || null, placa: aberta.placa || null, servico: aberta.servico || null,
        previsao_entrega: aberta.previsao_entrega || null, entregue_em: aberta.entregue_em || null,
        extras: (aberta.extras || []).map(e => ({ descricao: e.descricao, urgencia: e.urgencia, valor: e.valor ?? null })),
        orcamento_numero: aberta.orcamento_numero || null, orcamento_id: aberta.orcamento_id || null,
        link_cliente: aberta.link_cliente || null, abrir: aberta.link_equipe || R6.relPatioOs(aberta.id),
        passos: R6.passosDoPatio(aberta.etapa), link_visto_em: linkVistoEm,
        texto_link: aberta.link_cliente ? PAT.textoDoAcompanhamento({ nome: cli.nome, veiculo: aberta.veiculo || cli.carro_modelo, link: aberta.link_cliente }) : '',
      };
    }

    // agenda e CRM
    const agendamentos = (r360.agendamentos || []).map(a => ({ id: a.id, data: a.data, hora: a.hora ? String(a.hora).slice(0, 5) : null,
      inicio_em: a.inicio_em, status: a.status, servico: a.servico, consultor: a.consultor || null, veiculo: a.veiculo || null,
      os_numero: a.os_numero || null, os_etapa_rotulo: a.os_etapa_rotulo || null, orcamento_numero: a.orcamento_numero || null,
      abrir: a.link_equipe || null }));
    const futuros = agendamentos.filter(a => a.inicio_em && Date.parse(a.inicio_em) >= t0.getTime() - 3600_000 && !['cancelado', 'nao_veio', 'concluido'].includes(a.status))
      .sort((a, b) => String(a.inicio_em).localeCompare(String(b.inicio_em)));
    const leads = (r360.leads || []).map(l => ({ id: l.id, status: l.status, rotulo: rotuloLead[l.status] || l.status, servico: l.servico,
      valor_orcado: l.valor_orcado ?? null, valor_pago: l.valor_pago ?? null, responsavel_id: l.responsavel_id || null, responsavel_nome: l.responsavel_nome || null,
      origem: l.origem || null, created_at: l.created_at, abrir: l.link_equipe || null }));
    const leadAberto = leads.find(l => !['concluido', 'perdido'].includes(l.status)) || null;

    // eventos do Orçador (conexão com a conversa/agenda, enviado, aprovado, recusado)
    const TITULO_EVENTO = { conexao: 'conectado a esta conversa', enviado: 'enviado ao cliente', aprovado: 'aprovado pelo cliente', recusado: 'recusado pelo cliente' };
    let eventosOrc = [];
    const idsOrc = orcamentos.map(o => o.id).filter(Boolean);
    if (idsOrc.length) {
      try {
        const { data: ev } = await sb.from('orc_eventos').select('orcamento_id,tipo,detalhe,created_at').in('orcamento_id', idsOrc).in('tipo', Object.keys(TITULO_EVENTO)).order('created_at', { ascending: false }).limit(12);
        eventosOrc = (ev || []).map(e => {
          const o = orcamentos.find(x => x.id === e.orcamento_id);
          return { quando: e.created_at, tipo: 'orcamento', app: 'orcador', evento: e.tipo, titulo: `Orçamento nº ${o?.numero ?? '—'} ${TITULO_EVENTO[e.tipo]}`, detalhe: null, link: o?.abrir || null };
        });
      } catch (e) { log('orc_eventos:', e.message); }
    }
    // linha do tempo: tudo menos a conversa em si (as 2 últimas mensagens ficam)
    const tl = [...(r360.linha_do_tempo || []), ...eventosOrc];
    const naoMsg = tl.filter(e => e.tipo !== 'mensagem');
    const linha = [...naoMsg, ...tl.filter(e => e.tipo === 'mensagem').slice(0, 2)]
      .sort((a, b) => String(b.quando).localeCompare(String(a.quando))).slice(0, 14);

    const links = {
      novo_orcamento: R6.linkNovoOrcamento({ clienteId: cli.id, telefone: tel, nome: cli.nome, carro: [cli.carro_modelo, cli.carro_ano].filter(Boolean).join(' ') || patioPainel?.veiculo, placa: cli.placa || patioPainel?.placa }),
      crm_cliente: r360.links?.crm || null, comunicar: r360.links?.comunicar || null,
      crm_lead: leadAberto?.abrir || null,
    };
    const resumo = r360.resumo || {};
    const situacao = [];
    if (patioPainel && patioPainel.etapa !== 'entregue') situacao.push(`Carro: ${patioPainel.etapa_rotulo}`);
    if (principal) situacao.push(`Orçamento nº ${principal.numero ?? '—'}: ${principal.situacao.rotulo.toLowerCase()}`);
    if (futuros[0]) situacao.push(`Horário ${futuros[0].data.split('-').reverse().slice(0, 2).join('/')}${futuros[0].hora ? ' às ' + futuros[0].hora : ''}`);
    if (leadAberto) situacao.push(`Lead: ${leadAberto.rotulo.toLowerCase()}`);

    const proximos = [];
    if (patioPainel?.extras?.length && patioPainel.etapa === 'aguardando_aprovacao') proximos.push({ cod: 'extra', icone: '⚠️', texto: 'Há extra esperando o cliente aprovar no link de acompanhamento.' });
    if (principal?.situacao.cod === 'aprovado_sem_horario') proximos.push({ cod: 'agendar', icone: '📅', texto: 'Orçamento aprovado sem horário: marque o serviço.' });
    else if (principal && ['visualizado', 'parado'].includes(principal.situacao.cod)) proximos.push({ cod: 'cobrar', icone: '📄', texto: principal.situacao.acao });
    if (patioPainel && patioPainel.etapa === 'pronto') proximos.push({ cod: 'retirar', icone: '🏁', texto: 'Carro pronto: avise o cliente que já pode retirar.' });
    if (patioPainel && patioPainel.link_cliente && !patioPainel.link_visto_em && patioPainel.etapa !== 'entregue') proximos.push({ cod: 'link', icone: '🔗', texto: 'O cliente ainda não abriu o link de acompanhar: mande o link.' });
    if (!orcamentos.length && leadAberto && ['orcamento', 'contato'].includes(leadAberto.status)) proximos.push({ cod: 'orcar', icone: '🧾', texto: 'Lead pedindo orçamento e nenhum feito: crie no Orçador.' });
    if (!futuros.length && leadAberto && leadAberto.status === 'agendado') proximos.push({ cod: 'sem_horario', icone: '📅', texto: 'Lead "agendado" sem horário na Agenda: confira.' });

    const out = {
      ok: true, gerado_em: t0.toISOString(), aviso,
      cliente: { id: cli.id, nome: cli.nome, telefone: tel, carro: [cli.carro_modelo, cli.carro_ano].filter(Boolean).join(' ') || null, placa: cli.placa || null },
      situacao, proximos, patio: patioPainel,
      orcamentos: orcamentos.slice(0, 6), orcamento_principal: principal ? principal.id : null,
      agendamentos: { proximo: futuros[0] || null, futuros: futuros.slice(0, 3), recentes: agendamentos.filter(a => !futuros.includes(a)).slice(0, 4) },
      lead: leadAberto, leads: leads.slice(0, 3),
      tarefas_abertas: (r360.tarefas || []).filter(t => t.status === 'aberta').length || resumo.tarefas_abertas || 0,
      tarefas: (r360.tarefas || []).slice(0, 4),
      resumo: { total_gasto: resumo.total_gasto ?? null, servicos_feitos: resumo.servicos_feitos ?? 0, nota_media: resumo.nota_media ?? null, dias_desde_ultima_visita: resumo.dias_desde_ultima_visita ?? null,
        orcamentos_esperando: resumo.orcamentos_esperando ?? 0, extras_pendentes: resumo.extras_pendentes ?? 0 },
      indicacoes: r360.indicacoes || null,
      acoes: C5.acoesDoR360(r360.acoes_sugeridas),
      timeline: linha, eventos_orcamento: eventosOrc, links,
    };
    return guarda('painel:' + clienteId, out);
  }

  /** Só a etapa do carro (leve): a ficha chama a cada 20 s. */
  async function patioAoVivo(clienteId) {
    if (!RE_UUID.test(String(clienteId || ''))) return { ok: false, status: 400, erro: 'id de cliente inválido' };
    const r = await pat.lerPatio({ clienteId });
    const o = r?.ordem;
    if (!o) return { ok: true, patio: null };
    return { ok: true, patio: { id: o.id, numero: o.numero, etapa: o.etapa, etapa_rotulo: o.etapa_rotulo, tom: o.tom,
      minutos_na_etapa: o.minutos_na_etapa, previsao_entrega: o.previsao_entrega, extras_pendentes: o.extras_pendentes.length,
      link_visto_em: o.link_visto_em, passos: R6.passosDoPatio(o.etapa) } };
  }

  /* ---------------- WhatsApp parado: o que não saiu ---------------- */
  async function naoSairam({ dias = 3, limite = 150 } = {}) {
    const avisos = [];
    const desde = new Date(agora().getTime() - Math.min(30, Math.max(1, dias)) * DIA).toISOString();
    const linhas = await ler('mensagens que falharam', sb.from('whatsapp_mensagens')
      .select('id,conversa_id,corpo,erro,created_at,direcao,status,gerada_por_ia,enviado_por,nome')
      .eq('direcao', 'saida').eq('status', 'falhou').gte('created_at', desde)
      .order('created_at', { ascending: false }).limit(Math.min(300, limite)), avisos);
    const pendentes = linhas.filter(m => !/^Resolvido/.test(m.erro || ''));
    const cls = R6.classificarNaoSairam(pendentes, agora());
    const convIds = [...new Set(pendentes.map(m => m.conversa_id).filter(Boolean))];
    const nomes = convIds.length ? await ler('conversas', sb.from('conversas').select('id,nome,telefone').in('id', convIds.slice(0, 200)), avisos) : [];
    const porId = new Map(nomes.map(c => [c.id, c]));
    const enriquecer = m => ({ id: m.id, conversa_id: m.conversa_id, nome: porId.get(m.conversa_id)?.nome || m.nome || null,
      telefone: porId.get(m.conversa_id)?.telefone || null, corpo: String(m.corpo || '').slice(0, 240), erro: m.erro || null,
      created_at: m.created_at, ha_min: m.ha_min, ia: !!m.gerada_por_ia });
    return { ok: true, total: cls.total, nao_saiu: cls.nao_saiu.map(enriquecer), sem_confirmacao: cls.sem_confirmacao.map(enriquecer), avisos };
  }

  async function resolverFora({ mensagemId, perfil, nota = '' } = {}) {
    if (!RE_UUID.test(String(mensagemId || ''))) return { ok: false, status: 400, erro: 'id de mensagem inválido' };
    const { data: m, error } = await sb.from('whatsapp_mensagens').select('id,conversa_id,direcao,status,erro').eq('id', mensagemId).maybeSingle();
    if (error) return { ok: false, status: 503, erro: 'Não consegui ler a mensagem agora.' };
    if (!m) return { ok: false, status: 404, erro: 'Mensagem não encontrada.' };
    if (m.direcao !== 'saida' || m.status !== 'falhou') return { ok: false, status: 409, erro: 'Só mensagem que não saiu pode ser marcada como resolvida.' };
    const notaLimpa = String(nota || '').replace(/[\p{C}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const texto = `Resolvido fora do WhatsApp por ${String(perfil?.nome || 'a equipe').replace(/[\p{C}\p{Zl}\p{Zp}]+/gu, ' ').trim().slice(0, 60)}${notaLimpa ? ': ' + notaLimpa : ''}`;
    const { data: ok, error: e2 } = await sb.from('whatsapp_mensagens').update({ erro: texto }).eq('id', mensagemId).eq('status', 'falhou').select('id');
    if (e2 || !ok?.length) return { ok: false, status: 503, erro: 'Não consegui marcar agora.' };
    try { await sb.from('r6_c3_marcas').insert({ perfil_id: perfil?.id, tipo: 'fora_whatsapp', conversa_id: m.conversa_id, mensagem_id: m.id, nota: notaLimpa || null }); }
    catch (e) { log('marca fora_whatsapp:', e.message); }
    await auditar({ perfil: perfil?.id, acao: 'mensagem.resolvida_fora', tabela: 'whatsapp_mensagens', registro: m.id, detalhes: { conversa: m.conversa_id } });
    return { ok: true, erro_texto: texto };
  }

  /* ---------------- Passar para o consultor com um clique ---------------- */
  async function passarParaConsultor({ conversaId, perfil, motivo = 'preco' } = {}) {
    if (!RE_UUID.test(String(conversaId || ''))) return { ok: false, status: 400, erro: 'id de conversa inválido' };
    const { data: cv, error } = await sb.from('conversas').select('id,nome,telefone,cliente_id,atribuida_a,aguardando_consultor,tipo').eq('id', conversaId).maybeSingle();
    if (error) return { ok: false, status: 503, erro: 'Não consegui ler a conversa agora.' };
    if (!cv) return { ok: false, status: 404, erro: 'Conversa não encontrada.' };
    const m = R6.MOTIVO_HUMANO[motivo] || { rotulo: 'Atenção do consultor' };
    const agoraIso = agora().toISOString();
    const jaEstava = !!cv.aguardando_consultor;
    const { error: e2 } = await sb.from('conversas').update({ aguardando_consultor: true, aguardando_desde: cv.aguardando_consultor ? undefined : agoraIso }).eq('id', conversaId);
    if (e2) return { ok: false, status: 503, erro: 'Não consegui marcar agora.' };
    // tarefa para o dono da conversa (ou para quem clicou), sem duplicar se já existe uma aberta igual
    const responsavel = cv.atribuida_a || perfil?.id || null;
    let tarefa = null;
    if (responsavel) {
      const titulo = `${m.rotulo}: responder ${String(cv.nome || cv.telefone || 'cliente').split(' ')[0]}`.slice(0, 120);
      const { data: abertas } = await sb.from('tarefas').select('id,titulo').eq('conversa_id', conversaId).eq('status', 'aberta').eq('origem', 'atendimento').limit(5);
      if (!(abertas || []).some(t => t.titulo === titulo)) {
        const { data: t, error: e3 } = await sb.from('tarefas').insert({ titulo, descricao: `${m.texto || m.rotulo}. Marcada por ${perfil?.nome || 'a equipe'} no Atendimento.`,
          responsavel_id: responsavel, criado_por: perfil?.id || null, cliente_id: cv.cliente_id || null, conversa_id: conversaId, origem: 'atendimento',
          prioridade: motivo === 'urgencia' || motivo === 'reclamacao' ? 1 : 2, vence_em: new Date(agora().getTime() + 30 * 60_000).toISOString(), status: 'aberta' }).select('id').maybeSingle();
        if (!e3) tarefa = t?.id || null;
      }
    }
    await auditar({ perfil: perfil?.id, acao: 'conversa.passar_consultor', tabela: 'conversas', registro: conversaId, detalhes: { motivo, tarefa: !!tarefa } });
    return { ok: true, ja_estava: jaEstava, tarefa_id: tarefa, responsavel_id: responsavel };
  }

  /* ---------------- O que a IA está fazendo nesta conversa ---------------- */
  async function estadoIA(conversaId, { funil = null, config = null } = {}) {
    if (!RE_UUID.test(String(conversaId || ''))) return { ok: false, status: 400, erro: 'id de conversa inválido' };
    const avisos = [];
    const [cvLista, acoes, fila] = await Promise.all([
      ler('conversa', sb.from('conversas').select('id,ia_ativa,assumida_em,atribuida_a,aguardando_consultor,cliente_id').eq('id', conversaId).limit(1), avisos),
      ler('ações da IA', sb.from('ia_acoes').select('id,tipo,status,resumo,entrada,saida,created_at,perfil_id')
        .eq('conversa_id', conversaId).order('created_at', { ascending: false }).limit(40), avisos),
      ler('fila', sb.from('at_ia_fila').select('status,motivo,created_at,concluido_em,resultado').eq('conversa_id', conversaId).order('created_at', { ascending: false }).limit(3), avisos),
    ]);
    const cv = cvLista[0] || {};
    const rodada = acoes.find(a => a.tipo === 'copiloto' && a.entrada?.funil);
    const humano = rodada?.entrada?.funil?.humano || null;
    const sozinhas = acoes.filter(a => !a.perfil_id && a.status === 'executada' && !['copiloto', 'classificar', 'resumir'].includes(a.tipo)).length;
    const esperando = acoes.filter(a => a.status === 'proposta' && !['copiloto'].includes(a.tipo)).length;
    const ultimaFila = fila[0] || null;
    let situacao = 'ligada';
    if (config && config.ativo === false) situacao = 'desligada';
    else if (config && config.funil_ativo === false) situacao = 'so_copiloto';
    else if (cv.assumida_em || cv.ia_ativa === false) situacao = 'humano_assumiu';
    else if (ultimaFila && ['pendente', 'processando'].includes(ultimaFila.status)) situacao = 'respondendo';
    const mot = humano ? R6.MOTIVO_HUMANO[humano] : null;
    return { ok: true, situacao, ia_ativa: cv.ia_ativa !== false, assumida_em: cv.assumida_em || null,
      humano: humano ? { cod: humano, rotulo: mot?.rotulo || humano, texto: mot?.texto || humano } : null,
      ultima_rodada: rodada ? { em: rodada.created_at, resumo: rodada.resumo || null, enviadas: (rodada.saida?.enviadas || []).length, para_confirmar: (rodada.saida?.para_confirmar || []).length, proxima_acao: rodada.saida?.proxima_acao || null } : null,
      sozinhas, esperando_clique: esperando, fila: ultimaFila ? { status: ultimaFila.status, motivo: ultimaFila.motivo || null, em: ultimaFila.concluido_em || ultimaFila.created_at } : null, avisos };
  }

  return { filaContexto, painelCliente, patioAoVivo, naoSairam, resolverFora, passarParaConsultor, estadoIA, limparCache: () => cache.clear() };
}

module.exports = { criarR6, chaveTel, textosSemResposta };
