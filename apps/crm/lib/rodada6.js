/* ============================================================
   IndyCar CRM — rodada 6 (21/10/2026), servidor
   - sinais ao vivo dos leads (Pátio, Orçador, Atendimento, Agenda, tarefas, follow-up)
   - registrar contato (ligação, WhatsApp, visita, nota), próximo contato, cadências
   - fila do dia (quem contatar agora e por quê), entregues esperando fechar
   - ecossistema do lead e ficha 360 enriquecida (avaliações, extras, segmento)
   - ROI por campanha (cruza o Ads), qualidade dos dados, resumo do dono
   Funções puras no topo (testáveis sem banco); rotas embaixo.
   ============================================================ */
'use strict';

const U = require('./util-servidor');
const APPS = require('./apps');
const R5 = require('./rodada5');
const { ehUuid, falha, ehGestor, texto, r2, FUSO_MS, DIA } = U;
const ABERTAS = R5.ABERTAS;

/* ---------------- tempo (America/Sao_Paulo, UTC-3) ---------------- */
const ms = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : NaN; };
const pad = n => String(n).padStart(2, '0');
/** Partes de data no fuso de São Paulo. */
const brt = t => { const d = new Date(t - FUSO_MS); return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }; };
/** Instante (ms) de uma data/hora no fuso de São Paulo. */
const deBrt = (a, m, d, h = 0, mi = 0) => Date.UTC(a, m - 1, d, h, mi) + FUSO_MS;
const HORA_ABRE = 8, HORA_FECHA_MIN = 17 * 60 + 30;

/** Dia útil da oficina (segunda a sábado). */
const ehDiaUtil = t => brt(t).dow !== 0;
/** Instante de `hora`:`min` daqui a `dias` dias úteis (pula domingo). dias=0 = hoje (se já passou, o próximo dia útil). */
function diaUtil(agora, dias, hora = 9, min = 0) {
  const p = brt(agora);
  let t = deBrt(p.a, p.m, p.d, hora, min);
  let n = Math.max(0, Math.round(dias));
  if (n === 0 && t <= agora) n = 1;
  while (n > 0) { t += DIA; if (ehDiaUtil(t)) n--; }
  while (!ehDiaUtil(t)) t += DIA;
  return t;
}
/** Daqui a `horas` horas, mas sempre dentro do expediente (seg a sáb, 8h às 17h30). */
function emHorasUteis(agora, horas) {
  let t = agora + horas * 3600_000;
  const p = brt(t);
  const minDia = p.h * 60 + p.mi;
  if (!ehDiaUtil(t)) return diaUtil(t, 0, HORA_ABRE + 1);
  if (minDia < HORA_ABRE * 60) return deBrt(p.a, p.m, p.d, HORA_ABRE + 1, 0);
  if (minDia > HORA_FECHA_MIN) return diaUtil(t, 1, HORA_ABRE + 1);
  return t;
}

/* ---------------- contato registrado ---------------- */
const TIPOS_CONTATO = ['ligacao', 'whatsapp', 'visita', 'nota', 'followup'];
const RESULTADOS = ['atendeu', 'nao_atendeu', 'caixa_postal', 'respondeu', 'sem_resposta', 'agendou', 'pediu_prazo', 'recusou', 'outro'];
const ROTULO_RESULTADO = { atendeu: 'Atendeu', nao_atendeu: 'Não atendeu', caixa_postal: 'Caiu na caixa postal', respondeu: 'Respondeu', sem_resposta: 'Sem resposta', agendou: 'Agendou', pediu_prazo: 'Pediu um prazo', recusou: 'Recusou', outro: 'Outro' };
const SEM_CONTATO = ['nao_atendeu', 'caixa_postal', 'sem_resposta'];
const CONTATO_EFETIVO = ['atendeu', 'respondeu', 'pediu_prazo', 'agendou', 'recusou'];
const TENTATIVAS_PARA_PERDER = 4;
const PRESETS_PROXIMO = ['2h', 'hoje', 'amanha', '3d', '1sem', '2sem'];

/** Quando falar de novo, a partir de um preset ou de uma data. null = sem próximo contato. */
function resolverProximo(valor, agora = Date.now()) {
  if (valor === null || valor === undefined || valor === '' || valor === 'nenhum') return null;
  switch (valor) {
    case '2h': return emHorasUteis(agora, 2);
    case 'hoje': { const t = deBrt(brt(agora).a, brt(agora).m, brt(agora).d, 17, 0); return t > agora ? t : diaUtil(agora, 1, 9); }
    case 'amanha': return diaUtil(agora, 1, 9);
    case '3d': return diaUtil(agora, 3, 9);
    case '1sem': return diaUtil(agora, 6, 9);
    case '2sem': return diaUtil(agora, 12, 9);
  }
  const t = ms(valor);
  if (!Number.isFinite(t)) throw falha(400, 'Data do próximo contato inválida.');
  if (t < agora - 3600_000) throw falha(400, 'O próximo contato já passou.');
  if (t > agora + 400 * DIA) throw falha(400, 'Próximo contato longe demais (máx. 1 ano).');
  return t;
}
/** Sugestão de quando falar de novo conforme o que aconteceu. */
function proximoSugerido(resultado, agora = Date.now()) {
  switch (resultado) {
    case 'nao_atendeu': return { preset: '2h', em: emHorasUteis(agora, 2) };
    case 'caixa_postal': return { preset: 'amanha', em: diaUtil(agora, 1, 9) };
    case 'sem_resposta': return { preset: 'amanha', em: diaUtil(agora, 1, 9) };
    case 'pediu_prazo': return { preset: '3d', em: diaUtil(agora, 3, 9) };
    case 'atendeu': case 'respondeu': return { preset: '3d', em: diaUtil(agora, 3, 9) };
    default: return null;
  }
}

/** Valida o corpo de POST /api/leads/:id/contato. */
function validarContato(b, agora = Date.now()) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw falha(400, 'Contato inválido.');
  const tipo = TIPOS_CONTATO.includes(b.tipo) ? b.tipo : 'ligacao';
  const resultado = b.resultado == null || b.resultado === '' ? null : b.resultado;
  if (resultado !== null && !RESULTADOS.includes(resultado)) throw falha(400, 'Resultado do contato inválido.');
  if (tipo !== 'nota' && !resultado && !String(b.texto || '').trim()) throw falha(400, 'Diga o que aconteceu (resultado ou uma anotação).');
  const t = texto(b.texto, 3000).replace(/\s+/g, ' ').trim();
  if (t.length > 1000) throw falha(400, 'Anotação longa demais (máx. 1.000 caracteres).');
  let proximo;                                   // undefined = não mexer; null = limpar; número = nova data
  if ('proximo' in b) proximo = resolverProximo(b.proximo, agora);
  else if (resultado && b.sugerir !== false && proximoSugerido(resultado, agora)) proximo = proximoSugerido(resultado, agora).em;
  return { tipo, resultado, texto: t || null, proximo, tarefa: b.criar_tarefa === true };
}
/** Depois do contato: o que fazer com a etapa e o contador de tentativas. */
function efeitoDoContato(lead, c) {
  const tentativas = SEM_CONTATO.includes(c.resultado) ? (Number(lead.tentativas_contato) || 0) + 1 : (CONTATO_EFETIVO.includes(c.resultado) ? 0 : (Number(lead.tentativas_contato) || 0));
  const status = lead.status === 'novo' && CONTATO_EFETIVO.includes(c.resultado) && c.resultado !== 'recusou' ? 'contato' : null;
  let sugestao = null;
  if (c.resultado === 'recusou') sugestao = { codigo: 'perder', motivo: 'Desistiu do serviço', texto: 'O cliente recusou. Quer marcar o lead como perdido?' };
  else if (tentativas >= TENTATIVAS_PARA_PERDER) sugestao = { codigo: 'perder', motivo: 'Sem retorno do cliente', texto: `${tentativas} tentativas sem resposta. Quer marcar o lead como perdido (sem retorno)?` };
  else if (c.resultado === 'agendou') sugestao = { codigo: 'agendar', texto: 'Cliente topou. Marque o horário na Agenda.' };
  return { tentativas, status, sugestao };
}

/* ---------------- cadências de tarefas ---------------- */
const CADENCIAS = {
  orcamento: { rotulo: 'Cadência de orçamento', passos: [
    { dias: 1, titulo: 'Orçamento: confirmar que o cliente recebeu' },
    { dias: 3, titulo: 'Orçamento: perguntar se ficou alguma dúvida' },
    { dias: 7, titulo: 'Orçamento: última tentativa antes de encerrar' }] },
  posvenda: { rotulo: 'Cadência de pós-venda', passos: [
    { dias: 2, titulo: 'Pós-venda: perguntar como ficou o carro' },
    { dias: 30, titulo: 'Pós-venda: lembrar da revisão e pedir indicação' }] },
  reativacao: { rotulo: 'Cadência de reativação', passos: [
    { dias: 0, titulo: 'Reativação: retomar a conversa' },
    { dias: 4, titulo: 'Reativação: oferecer diagnóstico digital gratuito' }] },
};
function planoCadencia(tipo, agora = Date.now()) {
  const c = CADENCIAS[tipo];
  if (!c) throw falha(400, 'Cadência desconhecida.');
  return c.passos.map(p => ({ titulo: p.titulo, vence_em: new Date(diaUtil(agora, p.dias, 9)).toISOString() }));
}

/* ---------------- sinais ao vivo ---------------- */
const ETAPAS_PATIO_ABERTAS = ['recebido', 'diagnostico', 'aguardando_aprovacao', 'aguardando_peca', 'em_execucao', 'teste', 'pronto'];
const ORDEM_PATIO = ETAPAS_PATIO_ABERTAS;
const SINAIS_ROTULO = {
  esperando: 'Cliente esperando resposta', patio: 'Carro na oficina', pronto_retirar: 'Carro pronto para retirar', entregue_fechar: 'Carro entregue: falta concluir',
  orcamento_parado: 'Orçamento sem resposta', orcamento_aprovado: 'Orçamento aprovado sem horário', tarefa_atrasada: 'Tarefa atrasada', sem_tarefa: 'Sem tarefa',
  followup_vencido: 'Follow-up vencido', primeiro_contato: 'Primeiro contato atrasado', extra_pendente: 'Extra esperando o cliente',
  orcamento_visto: 'Cliente abriu o orçamento e não respondeu', orcamento_recusado: 'Orçamento recusado', pre_agendamento: 'Pré-agendamento para confirmar',
};
const e164 = R5.normalizarTelefone;
const MAX_ESPERA_PRIMEIRO_CONTATO_H = 2;

/**
 * Cruza os leads abertos com o que os outros sistemas sabem agora.
 * dados: { os[], extras[], orcs[], conversas[], tarefas[], agendamentos[], entregues[] }
 * Devolve { [leadId]: sinais } só para leads com algum sinal ou dado útil.
 */
function construirSinais(leads, dados = {}, agora = Date.now()) {
  const abertos = (leads || []).filter(l => l && ABERTAS.includes(l.status));
  const idx = (lista, chaveLead = 'lead_id', chaveCli = 'cliente_id', chaveTel = 'telefone') => {
    const porLead = new Map(), porCli = new Map(), porTel = new Map();
    const add = (m, k, x) => { if (!k) return; (m.get(k) || m.set(k, []).get(k)).push(x); };
    for (const x of lista || []) { add(porLead, x[chaveLead], x); add(porCli, x[chaveCli], x); const t = e164(x[chaveTel]); add(porTel, t, x); }
    return l => { const v = new Set(); for (const x of [...(porLead.get(l.id) || []), ...(l.cliente_id ? porCli.get(l.cliente_id) || [] : []), ...(e164(l.telefone) ? porTel.get(e164(l.telefone)) || [] : [])]) v.add(x); return [...v]; };
  };
  const dePatio = idx(dados.os), dePatioEntregue = idx(dados.entregues), deOrc = idx(dados.orcs, 'lead_id', 'cliente_id', 'cliente_telefone'), deConv = idx(dados.conversas, 'lead_id', 'cliente_id', 'telefone_e164'),
    deTarefa = idx(dados.tarefas, 'lead_id', 'cliente_id', 'nada'), deAg = idx(dados.agendamentos, 'lead_id', 'cliente_id', 'telefone');
  const extrasPorOs = new Map();
  for (const x of dados.extras || []) extrasPorOs.set(x.os_id, (extrasPorOs.get(x.os_id) || 0) + 1);
  const out = {};
  for (const l of abertos) {
    const s = { flags: [] };
    const os = dePatio(l).sort((a, b) => ORDEM_PATIO.indexOf(b.etapa) - ORDEM_PATIO.indexOf(a.etapa))[0];
    if (os) {
      s.patio = { id: os.id, numero: os.numero ?? null, etapa: os.etapa, etapa_em: os.etapa_em || null, previsao_entrega: os.previsao_entrega || null, placa: os.placa || null, extras_pendentes: extrasPorOs.get(os.id) || 0 };
      s.flags.push(os.etapa === 'pronto' ? 'pronto_retirar' : 'patio');
      if (s.patio.extras_pendentes) s.flags.push('extra_pendente');
    }
    const ent = dePatioEntregue(l).sort((a, b) => String(b.entregue_em).localeCompare(String(a.entregue_em)))[0];
    if (ent && !os) { s.entregue = { id: ent.id, numero: ent.numero ?? null, entregue_em: ent.entregue_em, dias: Math.max(0, Math.floor((agora - ms(ent.entregue_em)) / DIA)) }; s.flags.push('entregue_fechar'); }
    const todosOrcs = deOrc(l).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const orcs = todosOrcs.filter(o => ['enviado', 'aprovado'].includes(o.status));
    const orc = orcs[0];
    if (orc) {
      const dias = orc.enviado_em ? Math.max(0, Math.floor((agora - ms(orc.enviado_em)) / DIA)) : 0;
      s.orcamento = { id: orc.id, numero: orc.numero ?? null, status: orc.status, total: Number(orc.total_aprovado) > 0 ? Number(orc.total_aprovado) : Number(orc.total) || 0, dias, visualizado: !!orc.visualizado_em, validade: orc.validade || null, follow_up_em: orc.follow_up_em || null };
      if (orc.status === 'enviado' && dias >= 2) s.flags.push('orcamento_parado');
      if (orc.status === 'aprovado' && !orc.agendamento_id && !os) s.flags.push('orcamento_aprovado');
      if (orc.status === 'enviado' && orc.visualizado_em && (agora - ms(orc.visualizado_em)) >= DIA) { s.orcamento.visto_dias = Math.floor((agora - ms(orc.visualizado_em)) / DIA); s.flags.push('orcamento_visto'); }
    }
    // recusado nos últimos 14 dias e sem outro orçamento mais novo em andamento
    const rec = todosOrcs.find(o => o.status === 'recusado' && Number.isFinite(ms(o.decidido_em || o.created_at)) && (agora - ms(o.decidido_em || o.created_at)) <= 14 * DIA);
    if (rec && !(orc && String(orc.created_at) > String(rec.created_at))) {
      s.orcamento_recusado = { id: rec.id, numero: rec.numero ?? null, dias: Math.max(0, Math.floor((agora - ms(rec.decidido_em || rec.created_at)) / DIA)), total: Number(rec.total) || 0 };
      s.flags.push('orcamento_recusado');
    }
    const conv = deConv(l).filter(c => c.aguardando_consultor).sort((a, b) => String(a.aguardando_desde).localeCompare(String(b.aguardando_desde)))[0];
    if (conv) { const h = conv.aguardando_desde ? Math.max(0, Math.round((agora - ms(conv.aguardando_desde)) / 3600_000)) : 0; s.esperando = { conversa_id: conv.id, horas: h }; s.flags.push('esperando'); }
    const tar = deTarefa(l).filter(t => t.status === 'aberta').sort((a, b) => (a.vence_em ? ms(a.vence_em) : Infinity) - (b.vence_em ? ms(b.vence_em) : Infinity));
    if (tar.length) {
      const t = tar[0], atrasada = !!t.vence_em && ms(t.vence_em) < agora;
      s.tarefa = { id: t.id, titulo: t.titulo, vence_em: t.vence_em || null, atrasada, abertas: tar.length };
      if (tar.some(x => x.vence_em && ms(x.vence_em) < agora)) { s.flags.push('tarefa_atrasada'); s.tarefa.atrasada = true; }
    } else s.flags.push('sem_tarefa');
    const ag = deAg(l).filter(a => ['aguardando', 'confirmado'].includes(a.status) && ms(a.inicio_em || `${a.data}T${String(a.hora || '00:00').slice(0, 5)}:00-03:00`) >= agora - 3600_000)
      .sort((a, b) => String(a.inicio_em || a.data).localeCompare(String(b.inicio_em || b.data)))[0];
    if (ag) s.agendamento = { id: ag.id, quando: ag.inicio_em || `${ag.data}T${String(ag.hora || '00:00').slice(0, 5)}:00-03:00`, status: ag.status };
    const pre = deAg(l).filter(a => a.status === 'aguardando' && /^s*PR[ÉE]-AGENDAMENTO/i.test(String(a.observacoes || ''))).sort((a, b) => String(a.data).localeCompare(String(b.data)))[0];
    if (pre) { s.pre_agendamento = { id: pre.id, quando: pre.inicio_em || `${pre.data}T${String(pre.hora || '00:00').slice(0, 5)}:00-03:00` }; s.flags.push('pre_agendamento'); }
    if (l.proximo_contato_em) {
      const vencido = ms(l.proximo_contato_em) <= agora;
      s.followup = { em: l.proximo_contato_em, vencido };
      if (vencido) s.flags.push('followup_vencido');
    }
    if (l.status === 'novo' && !l.ultimo_contato_em && Number.isFinite(ms(l.created_at))) {
      const h = (agora - ms(l.created_at)) / 3600_000;
      if (h >= MAX_ESPERA_PRIMEIRO_CONTATO_H && h <= 72) { s.primeiro_contato_h = Math.round(h); s.flags.push('primeiro_contato'); }
    }
    if (l.ultimo_contato_em) s.ultimo_contato_dias = Math.max(0, Math.floor((agora - ms(l.ultimo_contato_em)) / DIA));
    if (Number(l.tentativas_contato) > 0) s.tentativas = Number(l.tentativas_contato);
    // "sem tarefa" sozinho não é sinal: só vale se há outro motivo para agir
    out[l.id] = s;
  }
  return out;
}
/** Contagem por sinal (para os filtros e o selo da navegação). */
function contarSinais(sinais) {
  const c = {};
  for (const s of Object.values(sinais || {})) for (const f of s.flags) c[f] = (c[f] || 0) + 1;
  return c;
}

/* ---------------- fila do dia ---------------- */
/** Pontuação de urgência e motivo principal de um lead. Maior = fazer primeiro. */
function prioridadeFila(lead, s, agora = Date.now()) {
  const motivos = [];
  const add = (codigo, pontos, texto_) => motivos.push({ codigo, pontos, texto: texto_ });
  const f = new Set(s?.flags || []);
  if (f.has('esperando')) add('esperando', 100 + Math.min(40, s.esperando.horas), `Cliente esperando resposta${s.esperando.horas ? ` há ${s.esperando.horas} h` : ''}`);
  if (f.has('entregue_fechar')) add('entregue_fechar', 90 + Math.min(9, s.entregue.dias), `Carro entregue${s.entregue.dias ? ` há ${s.entregue.dias} d` : ' hoje'}: concluir o lead com o valor pago`);
  if (f.has('primeiro_contato')) add('primeiro_contato', 85, `Lead novo sem contato há ${s.primeiro_contato_h} h`);
  if (f.has('orcamento_aprovado')) add('orcamento_aprovado', 75, 'Orçamento aprovado: marcar o horário');
  if (f.has('followup_vencido')) { const d = Math.max(0, Math.floor((agora - ms(lead.proximo_contato_em)) / DIA)); add('followup_vencido', 80 + Math.min(15, d), d ? `Retorno combinado venceu há ${d} d` : 'Retorno combinado para hoje'); }
  if (f.has('tarefa_atrasada')) add('tarefa_atrasada', 70, `Tarefa atrasada: ${s.tarefa?.titulo || ''}`.trim());
  if (f.has('pre_agendamento')) add('pre_agendamento', 78, 'Pré-agendamento do Orçador: confirmar o horário com o cliente');
  if (f.has('orcamento_visto')) add('orcamento_visto', 72, `O cliente abriu o orçamento há ${s.orcamento.visto_dias} d e não respondeu`);
  if (f.has('orcamento_recusado')) add('orcamento_recusado', 58, `Orçamento recusado${s.orcamento_recusado.dias ? ' há ' + s.orcamento_recusado.dias + ' d' : ' hoje'}: entender o motivo`);
  if (f.has('pronto_retirar')) add('pronto_retirar', 65, 'Carro pronto: avisar o cliente para retirar');
  if (f.has('orcamento_parado')) add('orcamento_parado', 60 + Math.min(20, s.orcamento.dias), `Orçamento sem resposta há ${s.orcamento.dias} d`);
  if (f.has('extra_pendente')) add('extra_pendente', 62, 'Extra do Pátio esperando o cliente decidir');
  if (!motivos.length && lead && ABERTAS.includes(lead.status)) {
    const d = Math.floor((agora - ms(lead.updated_at || lead.created_at)) / DIA);
    const limite = { novo: 1, contato: 3, orcamento: 4, agendado: 7, em_servico: 5 }[lead.status] || 5;
    if (d >= limite) add('parado', 40 + Math.min(20, d - limite), `Parado há ${d} dias em ${lead.status.replace('_', ' ')}`);
  }
  motivos.sort((a, b) => b.pontos - a.pontos);
  return { score: motivos[0]?.pontos || 0, motivos, principal: motivos[0] || null };
}
/** Texto para começar a conversa (sem preço, vocabulário da casa). Só sugestão: quem manda é a pessoa. */
function scriptSugerido(codigo, lead) {
  const nome = String(lead?.nome || '').trim().split(/\s+/)[0];
  const oi = nome && !/família|familia|cliente/i.test(nome) ? `Oi, ${nome}!` : 'Oi!';
  const carro = lead?.carro_modelo ? ` do seu ${lead.carro_modelo}` : '';
  switch (codigo) {
    case 'esperando': return `${oi} Aqui é da IndyCar. Desculpa a demora! Vi a sua mensagem e já te ajudo.`;
    case 'primeiro_contato': return `${oi} Aqui é da IndyCar. Vi que você nos procurou${carro ? ' para cuidar' + carro : ''}. Como posso ajudar?`;
    case 'followup_vencido': return `${oi} Aqui é da IndyCar. Combinamos de nos falar hoje${carro}. Ainda faz sentido pra você?`;
    case 'orcamento_parado': return `${oi} Aqui é da IndyCar. Conseguiu ver o orçamento${carro}? Qualquer dúvida eu te explico por aqui.`;
    case 'orcamento_aprovado': return `${oi} Aqui é da IndyCar. Que bom que você aprovou! Qual dia e horário ficam bons pra trazer o carro? A gente atende de segunda a sábado, das 8h às 17h30.`;
    case 'pronto_retirar': return `${oi} Aqui é da IndyCar. O seu carro ficou pronto! Pode vir retirar quando quiser, até as 17h30.`;
    case 'entregue_fechar': return `${oi} Aqui é da IndyCar. Obrigado por confiar na gente! Como ficou o carro? Qualquer coisa é só chamar. Quem conhece, Indyca! 🏎`;
    case 'extra_pendente': return `${oi} Aqui é da IndyCar. Mandei no seu link de acompanhamento um serviço extra que o mecânico viu${carro}. Dá uma olhada e me diz se pode fazer?`;
    case 'orcamento_visto': return `${oi} Aqui é da IndyCar. Vi que você já deu uma olhada no orçamento${carro}. Ficou alguma dúvida que eu possa tirar?`;
    case 'orcamento_recusado': return `${oi} Aqui é da IndyCar. Entendi que o orçamento não serviu${carro}. Posso saber o que pesou? Se der, eu vejo outra opção com você.`;
    case 'pre_agendamento': return `${oi} Aqui é da IndyCar. Recebi o seu pedido de horário${carro}. Posso confirmar? A gente atende de segunda a sábado, das 8h às 17h30.`;
    case 'tarefa_atrasada': case 'parado': return `${oi} Aqui é da IndyCar. Passando pra saber se ainda posso ajudar${carro}.`;
    default: return `${oi} Aqui é da IndyCar. Posso ajudar${carro}?`;
  }
}

/* ---------------- valor sugerido ao concluir (carro entregue) ---------------- */
function sugestaoValorEntregue({ lead, orcamento, extrasAprovados = 0, agendamento = null }) {
  const out = [];
  const add = (rotulo, v) => { const n = r2(v); if (n > 0 && n <= 10000000 && !out.some(o => o.valor === n)) out.push({ rotulo, valor: n }); };
  const orc = orcamento ? (Number(orcamento.total_aprovado) > 0 ? Number(orcamento.total_aprovado) : Number(orcamento.total) || 0) : 0;
  const ext = r2(extrasAprovados);
  if (orc && ext) add('Orçamento aprovado + extras do Pátio', orc + ext);
  if (orc) add('Orçamento aprovado', orc);
  if (Number(lead?.valor_orcado) > 0 && ext) add('Orçado no CRM + extras do Pátio', Number(lead.valor_orcado) + ext);
  if (Number(lead?.valor_orcado) > 0) add('Orçado no CRM', lead.valor_orcado);
  if (agendamento && Number(agendamento.valor) > 0) add('Valor na Agenda', agendamento.valor);
  return out;
}

/* ---------------- ROI por campanha (cruza o Ads) ---------------- */
const slug = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/** A campanha do lead (utm) bate com a do Ads? Igual, ou uma contém a outra (mín. 5 letras). */
function mesmaCampanha(utm, nomeAds) {
  const a = slug(utm), b = slug(nomeAds);
  if (!a || !b) return false;
  if (a === b) return true;
  return (a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b));
}
/**
 * metricas: linhas de ads_metricas_dia (nivel campanha); leads: leads criados no período.
 * Devolve campanhas (gasto × leads × vendas), resumo por canal e leads sem campanha.
 */
function roiCampanhas(metricas, leads, { ate } = {}) {
  const porCamp = new Map();
  for (const m of metricas || []) {
    const k = `${m.plataforma}|${m.campanha_nome || m.entidade_nome || m.campanha_ext}`;
    const c = porCamp.get(k) || { plataforma: m.plataforma, campanha: m.campanha_nome || m.entidade_nome || m.campanha_ext, gasto: 0, cliques: 0, impressoes: 0, conversoes_ads: 0, dias: new Set() };
    c.gasto += Number(m.gasto) || 0; c.cliques += Number(m.cliques) || 0; c.impressoes += Number(m.impressoes) || 0; c.conversoes_ads += Number(m.conversoes) || 0; c.dias.add(m.data);
    porCamp.set(k, c);
  }
  const lista = [...porCamp.values()].map(c => ({ ...c, dias: c.dias.size, leads: 0, orcaram: 0, ganhos: 0, perdidos: 0, faturamento: 0, usados: new Set() }));
  const semMatch = new Map();
  let semCampanha = 0;
  for (const l of leads || []) {
    const doAds = ['meta', 'google'].includes(l.origem);
    if (!String(l.utm_campaign || '').trim()) { if (doAds) semCampanha++; continue; }
    const plat = l.origem === 'google' ? 'google' : l.origem === 'meta' ? 'meta' : null;
    const alvo = lista.find(c => (!plat || c.plataforma === plat) && mesmaCampanha(l.utm_campaign, c.campanha)) || lista.find(c => mesmaCampanha(l.utm_campaign, c.campanha));
    if (!alvo) { const k = slug(l.utm_campaign); const x = semMatch.get(k) || { campanha: l.utm_campaign, leads: 0, ganhos: 0, faturamento: 0 }; x.leads++; if (l.status === 'concluido') { x.ganhos++; x.faturamento += Number(l.valor_pago) || 0; } semMatch.set(k, x); continue; }
    alvo.leads++;
    if (['orcamento', 'agendado', 'em_servico', 'concluido'].includes(l.status) || Number(l.valor_orcado) > 0) alvo.orcaram++;
    if (l.status === 'concluido') { alvo.ganhos++; alvo.faturamento += Number(l.valor_pago) || 0; }
    if (l.status === 'perdido') alvo.perdidos++;
  }
  const campanhas = lista.map(({ usados, ...c }) => ({
    ...c, gasto: r2(c.gasto), faturamento: r2(c.faturamento),
    cpl: c.leads ? r2(c.gasto / c.leads) : null, cac: c.ganhos ? r2(c.gasto / c.ganhos) : null,
    roas: c.gasto > 0 ? r2(c.faturamento / c.gasto) : null, conversao: c.leads ? Math.round((c.ganhos / c.leads) * 1000) / 10 : 0,
    cpc: c.cliques ? r2(c.gasto / c.cliques) : null,
    veredito: c.gasto <= 0 ? 'sem_gasto' : !c.leads ? 'sem_lead' : !c.ganhos ? 'sem_venda' : (c.faturamento / c.gasto >= 1 ? 'lucra' : 'prejuizo'),
  })).sort((a, b) => b.gasto - a.gasto);
  const canal = {};
  for (const c of campanhas) { const x = canal[c.plataforma] || (canal[c.plataforma] = { plataforma: c.plataforma, gasto: 0, leads: 0, ganhos: 0, faturamento: 0 }); x.gasto += c.gasto; x.leads += c.leads; x.ganhos += c.ganhos; x.faturamento += c.faturamento; }
  const canais = Object.values(canal).map(x => ({ ...x, gasto: r2(x.gasto), faturamento: r2(x.faturamento), cpl: x.leads ? r2(x.gasto / x.leads) : null, roas: x.gasto > 0 ? r2(x.faturamento / x.gasto) : null }));
  return { campanhas, canais, sem_campanha_no_ads: [...semMatch.values()].map(x => ({ ...x, faturamento: r2(x.faturamento) })).sort((a, b) => b.leads - a.leads).slice(0, 20), leads_do_ads_sem_campanha: semCampanha,
    totais: { gasto: r2(campanhas.reduce((s, c) => s + c.gasto, 0)), leads: campanhas.reduce((s, c) => s + c.leads, 0), ganhos: campanhas.reduce((s, c) => s + c.ganhos, 0), faturamento: r2(campanhas.reduce((s, c) => s + c.faturamento, 0)) } };
}

/* ---------------- qualidade dos dados ---------------- */
function qualidadeDados(leads, agora = Date.now()) {
  const abertos = (leads || []).filter(l => ABERTAS.includes(l.status));
  const porTel = new Map();
  for (const l of abertos) { const t = e164(l.telefone); if (t) (porTel.get(t) || porTel.set(t, []).get(t)).push(l); }
  const duplicados = [...porTel.entries()].filter(([, v]) => v.length > 1).map(([tel, v]) => ({ telefone: tel, leads: v.map(l => ({ id: l.id, nome: l.nome, status: l.status, servico: l.servico || null, created_at: l.created_at, responsavel_id: l.responsavel_id || null })) }))
    .sort((a, b) => b.leads.length - a.leads.length).slice(0, 30);
  const resumo = l => ({ id: l.id, nome: l.nome, status: l.status, telefone: l.telefone || null, created_at: l.created_at });
  const lista = (f) => { const x = abertos.filter(f); return { total: x.length, exemplos: x.slice(0, 20).map(resumo) }; };
  return {
    duplicados: { total: duplicados.length, grupos: duplicados },
    sem_telefone_valido: lista(l => !e164(l.telefone)),
    ads_sem_campanha: lista(l => ['meta', 'google'].includes(l.origem) && !String(l.utm_campaign || '').trim()),
    orcamento_sem_valor: lista(l => ['orcamento', 'agendado'].includes(l.status) && !(Number(l.valor_orcado) > 0)),
    sem_carro: lista(l => !String(l.carro_modelo || '').trim() && !String(l.placa || '').trim()),
    sem_responsavel: lista(l => !l.responsavel_id),
    velhos: lista(l => (agora - ms(l.created_at)) > 90 * DIA && (agora - ms(l.updated_at || l.created_at)) > 60 * DIA),
    concluidos_sem_valor: (() => { const x = (leads || []).filter(l => l.status === 'concluido' && !(Number(l.valor_pago) > 0) && !/Cortesia: sem cobran/i.test(l.observacoes || '')); return { total: x.length, exemplos: x.slice(0, 20).map(resumo) }; })(),
  };
}

/* ---------------- segmento do cliente (ficha 360) ---------------- */
function segmentoCliente(f, agora = Date.now()) {
  const r = f.resumo || {}, c = f.cliente || {};
  const gasto = Number(r.total_gasto) || 0, servicos = Number(r.servicos_feitos) || 0;
  const ultima = r.ultima_visita ? ms(r.ultima_visita) : NaN;
  const diasSem = Number.isFinite(ultima) ? Math.floor((agora - ultima) / DIA) : null;
  const ltv = gasto, ticket = servicos ? r2(gasto / servicos) : 0;
  let codigo = 'novo', rotulo = 'Cliente novo';
  if ((f.patio || []).some(o => !['entregue', 'cancelado'].includes(o.etapa))) { codigo = 'na_oficina'; rotulo = 'Carro na oficina agora'; }
  else if (Number(r.faltas) >= 2) { codigo = 'risco'; rotulo = 'Falta bastante: confirmar sempre'; }
  else if (gasto >= 3000 || servicos >= 4) { codigo = 'vip'; rotulo = 'Cliente fiel (VIP)'; }
  else if (servicos >= 2 && (diasSem == null || diasSem <= 240)) { codigo = 'recorrente'; rotulo = 'Cliente recorrente'; }
  else if (diasSem != null && diasSem > 240) { codigo = 'sumido'; rotulo = `Sumido há ${Math.round(diasSem / 30)} meses`; }
  else if (servicos === 1) { codigo = 'primeira_compra'; rotulo = 'Fez um serviço (conquistar a volta)'; }
  const proxima = Number.isFinite(ultima) ? new Date(ultima + 180 * DIA).toISOString() : null;
  const revisaoVencida = proxima ? ms(proxima) < agora : false;
  const aniversario = c.nascimento ? String(c.nascimento).slice(5, 10) : null;
  return { codigo, rotulo, ltv: r2(ltv), ticket, servicos, dias_sem_visita: diasSem, proxima_revisao: proxima, revisao_vencida: revisaoVencida, aniversario };
}
const NOTA_DETRATOR = 3;
function notaMedia(avs) {
  const notas = (avs || []).map(a => Number(a.nota)).filter(n => n >= 1 && n <= 5);
  return notas.length ? { media: Math.round(notas.reduce((s, n) => s + n, 0) / notas.length * 10) / 10, total: notas.length, detratores: notas.filter(n => n <= NOTA_DETRATOR).length } : null;
}
/** Linha do tempo única do cliente: junta tudo o que a rpc devolve em ordem cronológica (mais novo primeiro). */
function linhaDoTempoCliente(f) {
  const out = [];
  const add = (tipo, quando, titulo, detalhe = '') => { if (quando && Number.isFinite(ms(quando))) out.push({ tipo, quando, titulo, detalhe }); };
  for (const l of f.leads || []) { add('lead', l.created_at, `Lead · ${l.servico || 'serviço não informado'}`, [l.status, l.responsavel_nome].filter(Boolean).join(' · ')); if (l.closed_at) add('lead', l.closed_at, l.status === 'perdido' ? 'Lead perdido' : 'Lead concluído', l.status === 'concluido' && Number(l.valor_pago) ? `R$ ${Number(l.valor_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''); }
  for (const a of f.agendamentos || []) add('agenda', a.inicio_em || (a.data ? `${a.data}T${String(a.hora || '00:00').slice(0, 5)}:00-03:00` : null), `Horário · ${a.servico || 'serviço'}`, a.status);
  for (const o of f.patio || []) { add('patio', o.created_at, `Pátio · carro recebido (ordem ${o.numero ?? ''})`.replace(' ()', ''), [o.veiculo, o.placa].filter(Boolean).join(' · ')); if (o.entregue_em) add('patio', o.entregue_em, 'Pátio · carro entregue', ''); }
  for (const q of f.orcamentos || []) { add('orcamento', q.enviado_em || q.created_at, `Orçamento nº ${q.numero ?? ''} · ${q.status}`, q.total != null ? `R$ ${Number(q.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''); if (q.decidido_em) add('orcamento', q.decidido_em, `Orçamento nº ${q.numero ?? ''} ${q.status === 'recusado' ? 'recusado' : 'decidido'}`, q.motivo_recusa || ''); }
  for (const e of f.comunicar || []) add('comunicar', e.enviado_em || e.enviar_em, `Comunicar · ${String(e.tipo || '').replace(/_/g, ' ')}`, [e.status, e.respondido_em ? 'respondeu' : ''].filter(Boolean).join(' · '));
  for (const m of (f.mensagens || []).slice(0, 5)) add('mensagem', m.created_at, m.direcao === 'entrada' ? 'Cliente escreveu' : 'Oficina respondeu', String(m.corpo || '').slice(0, 120));
  for (const i of (f.indicacoes?.fez || [])) add('indicacao', i.created_at, `Indicou ${i.nome}`, i.status);
  for (const a of f.avaliacoes || []) add('avaliacao', a.created_at, `Avaliou o serviço: ${a.nota} de 5`, a.comentario || '');
  return out.sort((a, b) => ms(b.quando) - ms(a.quando)).slice(0, 80);
}

/* ---------------- resumo do dono ---------------- */
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const pct = (a, b) => b ? Math.round((a / b) * 1000) / 10 : 0;
/** Dias úteis (seg-sáb) entre dois instantes, contando o primeiro e não o último. */
function diasUteisEntre(de, ate) { let n = 0; for (let t = de; t < ate; t += DIA) if (ehDiaUtil(t)) n++; return n; }
function janela(leads, ini, fim) {
  const dentro = v => { const t = ms(v); return Number.isFinite(t) && t >= ini && t < fim; };
  const entraram = leads.filter(l => dentro(l.created_at));
  const fechados = leads.filter(l => ['concluido', 'perdido'].includes(l.status) && dentro(l.closed_at || l.updated_at));
  const ganhos = fechados.filter(l => l.status === 'concluido');
  const fat = ganhos.reduce((s, l) => s + (Number(l.valor_pago) || 0), 0);
  return { leads: entraram.length, vendas: ganhos.length, perdidos: fechados.length - ganhos.length, faturamento: r2(fat), ticket: ganhos.length ? r2(fat / ganhos.length) : 0, conversao: pct(ganhos.length, fechados.length) };
}
/** Projeção do mês pelo ritmo (dias úteis) e o que falta por dia útil para bater a meta. */
function ritmoMeta({ realizado, meta, agora = Date.now() }) {
  const p = brt(agora);
  const ini = deBrt(p.a, p.m, 1), fim = p.m === 12 ? deBrt(p.a + 1, 1, 1) : deBrt(p.a, p.m + 1, 1);
  const uteisTotal = diasUteisEntre(ini, fim), uteisPassados = Math.max(1, diasUteisEntre(ini, agora + DIA - 1)), uteisRestantes = Math.max(0, uteisTotal - uteisPassados);
  const projecao = r2(realizado / uteisPassados * uteisTotal);
  const falta = Math.max(0, r2(meta - realizado));
  return { meta: r2(meta), realizado: r2(realizado), pct: meta > 0 ? Math.round(realizado / meta * 100) : null, projecao, falta, dias_uteis_restantes: uteisRestantes,
    por_dia_util: uteisRestantes ? r2(falta / uteisRestantes) : falta, risco: meta > 0 && projecao < meta * 0.9 && falta > 0, bateu: meta > 0 && realizado >= meta };
}
/** Frases curtas do que mudou e do que pede atenção (regras, sem IA). */
function insightsDono(r) {
  const out = [];
  const { semana, anterior, mes, patio, orcamentos, conversas, ads, avaliacoes, qualidade } = r;
  if (semana && anterior) {
    const dv = semana.faturamento - anterior.faturamento;
    if (anterior.faturamento > 0 && Math.abs(dv) / anterior.faturamento >= 0.15) out.push({ nivel: dv < 0 ? 'alerta' : 'ok', texto: `Faturamento da semana ${dv < 0 ? 'caiu' : 'subiu'} ${Math.round(Math.abs(dv) / anterior.faturamento * 100)}% (${brl0(semana.faturamento)} contra ${brl0(anterior.faturamento)}).` });
    if (anterior.leads >= 5 && semana.leads <= anterior.leads * 0.7) out.push({ nivel: 'alerta', texto: `Entraram ${semana.leads} leads na semana, bem menos que os ${anterior.leads} da anterior.` });
    if (semana.vendas + semana.perdidos >= 5 && semana.conversao + 8 <= anterior.conversao) out.push({ nivel: 'alerta', texto: `Conversão caiu para ${semana.conversao}% (era ${anterior.conversao}%).` });
  }
  if (mes?.ritmo?.risco) out.push({ nivel: 'alerta', texto: `No ritmo atual o mês fecha em ${brl0(mes.ritmo.projecao)}, abaixo da meta de ${brl0(mes.ritmo.meta)}. Faltam ${brl0(mes.ritmo.por_dia_util)} por dia útil.` });
  if (mes?.ritmo?.bateu) out.push({ nivel: 'ok', texto: `Meta do mês batida: ${brl0(mes.ritmo.realizado)} de ${brl0(mes.ritmo.meta)}. 🏁` });
  if (conversas?.esperando) out.push({ nivel: 'alerta', texto: `${conversas.esperando} cliente${conversas.esperando === 1 ? '' : 's'} esperando resposta${conversas.maior_espera_h ? ` (o mais antigo há ${conversas.maior_espera_h} h)` : ''}.` });
  if (orcamentos?.parados) out.push({ nivel: 'atencao', texto: `${orcamentos.parados} orçamento${orcamentos.parados === 1 ? '' : 's'} sem resposta há 2 dias ou mais (${brl0(orcamentos.valor_parado)}).` });
  if (patio?.prontos) out.push({ nivel: 'atencao', texto: `${patio.prontos} carro${patio.prontos === 1 ? '' : 's'} pronto${patio.prontos === 1 ? '' : 's'} esperando o cliente retirar.` });
  if (patio?.entregues_sem_fechar) out.push({ nivel: 'atencao', texto: `${patio.entregues_sem_fechar} carro${patio.entregues_sem_fechar === 1 ? '' : 's'} entregue${patio.entregues_sem_fechar === 1 ? '' : 's'} com o lead ainda aberto: falta registrar o valor pago.` });
  if (avaliacoes?.detratores) out.push({ nivel: 'alerta', texto: `${avaliacoes.detratores} avaliação${avaliacoes.detratores === 1 ? '' : 'ões'} com nota 3 ou menos nos últimos 30 dias.` });
  if (ads?.pior && ads.pior.gasto > 0 && !ads.pior.ganhos) out.push({ nivel: 'atencao', texto: `A campanha "${ads.pior.campanha}" gastou ${brl0(ads.pior.gasto)} e ainda não gerou venda.` });
  if (ads?.alertas) out.push({ nivel: 'atencao', texto: `${ads.alertas} alerta${ads.alertas === 1 ? '' : 's'} do Ads sem leitura.` });
  if (qualidade?.sem_dono) out.push({ nivel: 'atencao', texto: `${qualidade.sem_dono} lead${qualidade.sem_dono === 1 ? '' : 's'} aberto${qualidade.sem_dono === 1 ? '' : 's'} sem responsável.` });
  return out;
}
/** Texto pronto para mandar no WhatsApp do dono (sem preço de cliente, só números da casa). */
function textoWhatsAppDono(r, quando = new Date()) {
  const dia = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const L = [`🏎 *IndyCar · resumo ${dia}*`];
  const m = r.mes;
  if (m?.ritmo?.meta > 0) L.push(`💰 Mês: ${brl0(m.ritmo.realizado)} de ${brl0(m.ritmo.meta)} (${m.ritmo.pct}%). Projeção ${brl0(m.ritmo.projecao)}.`);
  else if (m) L.push(`💰 Mês: ${brl0(m.faturamento)} em ${m.vendas} serviço${m.vendas === 1 ? '' : 's'}.`);
  if (r.semana) L.push(`📈 Semana: ${r.semana.leads} leads, ${r.semana.vendas} vendas, ${brl0(r.semana.faturamento)}, conversão ${r.semana.conversao}%.`);
  if (r.patio) L.push(`🔧 Oficina: ${r.patio.no_patio} carro${r.patio.no_patio === 1 ? '' : 's'} agora, ${r.patio.prontos} pronto${r.patio.prontos === 1 ? '' : 's'}, ${r.patio.entregues_hoje} entregue${r.patio.entregues_hoje === 1 ? '' : 's'} hoje.`);
  if (r.orcamentos) L.push(`🧾 Orçamentos esperando resposta: ${r.orcamentos.enviados} (${brl0(r.orcamentos.valor_enviado)}).`);
  if (r.avaliacoes) L.push(`⭐ Nota média ${r.avaliacoes.media} (${r.avaliacoes.total} avaliações).`);
  const pontos = (r.insights || []).filter(i => i.nivel !== 'ok').slice(0, 4);
  if (pontos.length) { L.push('', '*Atenção:*'); for (const p of pontos) L.push('• ' + p.texto); }
  return L.join('\n');
}


/* ============================================================ leitura dos outros sistemas */
const iso = t => new Date(t).toISOString();
async function lerSeguro(consulta) { try { const { data, error } = await consulta; return error ? [] : (data || []); } catch { return []; } }
async function lerTodas(fazer) { try { const { data, error } = await U.todas(fazer); return error ? [] : (data || []); } catch { return []; } }
const inicioDiaBRT = t => deBrt(brt(t).a, brt(t).m, brt(t).d, 0, 0);

/** Lê, de uma vez, o que o Pátio, o Orçador, o Atendimento, a Agenda e as tarefas sabem agora. */
async function carregarDadosSinais(sb, agora = Date.now()) {
  const [os, entregues, extras, orcs, conversas, tarefas, agendamentos] = await Promise.all([
    lerSeguro(sb.from('patio_os').select('id,numero,etapa,etapa_em,lead_id,cliente_id,telefone,placa,previsao_entrega,agendamento_id').in('etapa', ETAPAS_PATIO_ABERTAS)),
    lerSeguro(sb.from('patio_os').select('id,numero,etapa,lead_id,cliente_id,telefone,placa,entregue_em').eq('etapa', 'entregue').gte('entregue_em', iso(agora - 14 * DIA))),
    lerSeguro(sb.from('patio_extras').select('os_id').eq('status', 'pendente')),
    lerTodas(() => sb.from('orc_orcamentos').select('id,numero,status,cliente_id,cliente_telefone,lead_id,total,total_aprovado,enviado_em,visualizado_em,decidido_em,validade,agendamento_id,follow_up_em,created_at').in('status', ['enviado', 'aprovado', 'recusado']).order('id')),
    lerSeguro(sb.from('conversas').select('id,cliente_id,telefone_e164,aguardando_desde').eq('aguardando_consultor', true)),
    lerTodas(() => sb.from('tarefas').select('id,titulo,lead_id,cliente_id,vence_em,prioridade,responsavel_id,status').eq('status', 'aberta').not('lead_id', 'is', null).order('id')),
    lerTodas(() => sb.from('agendamentos').select('id,lead_id,cliente_id,telefone,data,hora,inicio_em,status,observacoes').in('status', ['aguardando', 'confirmado']).gte('data', iso(inicioDiaBRT(agora)).slice(0, 10)).order('id')),
  ]);
  return { os, entregues, extras, orcs, conversas, tarefas, agendamentos };
}

let CACHE_SINAIS = null;
const SINAIS_TTL = 20_000;
async function sinaisAgora(c, { forcar = false } = {}) {
  const agora = Date.now();
  if (!forcar && CACHE_SINAIS && CACHE_SINAIS.expira > agora && CACHE_SINAIS.sb === c.sb) return CACHE_SINAIS;
  const [leads, dados] = await Promise.all([c.store.todosOsLeads(), carregarDadosSinais(c.sb, agora)]);
  const sinais = construirSinais(leads, dados, agora);
  CACHE_SINAIS = { sb: c.sb, expira: agora + SINAIS_TTL, leads, dados, sinais, em: agora };
  return CACHE_SINAIS;
}
const esquecerSinais = () => { CACHE_SINAIS = null; };

/** Abre o orçamento no Orçador (a rota "orcamento" cai na lista já com o orçamento). */
const linkOrcamento = (id, opts) => APPS.linkApp('orcador', '/#/historico/' + encodeURIComponent(id), opts);
/** Nova cotação no Orçador já com o cliente, o lead, o carro e o serviço (contrato r6_link_nova_cotacao; ver rodada6c). */
const linkNovoOrcamento = (d, opts) => require('./rodada6c').linkNovoOrcamento(d, opts);

/* ---------------- ficha 360 enriquecida ---------------- */
async function enriquecerFicha(sb, ficha, agora = Date.now()) {
  if (!ficha || typeof ficha !== 'object') return ficha;
  const osIds = (ficha.patio || []).map(o => o.id).filter(Boolean);
  const [avs, ext] = osIds.length ? await Promise.all([
    lerSeguro(sb.from('patio_avaliacoes').select('os_id,nota,comentario,created_at').in('os_id', osIds)),
    lerSeguro(sb.from('patio_extras').select('os_id,descricao,valor,status').in('os_id', osIds)),
  ]) : [[], []];
  ficha.avaliacoes = avs;
  ficha.nota = notaMedia(avs);
  const aprov = new Map();
  for (const x of ext) if (x.status === 'aprovado') aprov.set(x.os_id, (aprov.get(x.os_id) || 0) + (Number(x.valor) || 0));
  ficha.patio = (ficha.patio || []).map(o => ({ ...o, extras_aprovados_valor: r2(aprov.get(o.id) || 0), extras_total: ext.filter(x => x.os_id === o.id).length }));
  ficha.segmento = segmentoCliente(ficha, agora);
  ficha.linha_do_tempo = linhaDoTempoCliente(ficha);
  return ficha;
}

/* ============================================================ rotas */
async function rotasR6(c) {
  const { req, res, url, pathname: p, quem, json, lerCorpo, freio, sb, prefixo = '' } = c;
  const m = req.method;
  const gestor = ehGestor(quem.papel);
  const precisa = () => { if (!sb) throw falha(503, 'Disponível só com o banco compartilhado (Supabase).'); return sb; };
  const frear = (nome, teto, janela_) => { if (!freio.dentro(nome + ':' + quem.id, teto, janela_)) throw falha(429, 'Muitos pedidos seguidos. Espere um pouco.'); };
  const exigirGestor = msg => { if (!gestor) throw falha(403, msg, { codigo: 'so_gestor' }); };
  const agora = (c.agora || Date.now)();
  const deColega = async lead => { const t = c.travaLead ? await c.travaLead(quem, lead) : null; if (t) throw falha(403, t.erro, { codigo: t.codigo }); };
  const lerLead = async id => { if (!ehUuid(id)) throw falha(404, 'Lead não encontrado.'); const l = await c.store.getLead(id); if (!l) throw falha(404, 'Lead não encontrado.'); return l; };
  const limpar = () => { esquecerSinais(); if (c.limparCache) c.limparCache(); };
  const pessoas = async ids => { const u = [...new Set(ids.filter(Boolean))]; if (!u.length) return new Map(); const r = await lerSeguro(sb.from('perfis').select('id,nome').in('id', u)); return new Map(r.map(x => [x.id, x.nome])); };

  /* ---------- sinais ao vivo (funil, lista, ficha) ---------- */
  if (p === '/api/pipeline/sinais' && m === 'GET') {
    precisa(); frear('sinais', 60, 60_000);
    const s = await sinaisAgora(c, { forcar: url.searchParams.get('agora') === '1' });
    const leads = {};
    for (const [id, x] of Object.entries(s.sinais)) if (x.flags.some(f => f !== 'sem_tarefa') || x.patio || x.orcamento || x.agendamento || x.followup || x.tarefa || x.tentativas) leads[id] = x;
    json(res, 200, { gerado_em: iso(s.em), leads, contagem: contarSinais(s.sinais), rotulos: SINAIS_ROTULO });
    return true;
  }

  /* ---------- adiar o retorno de vários leads (lote) ---------- */
  if (p === '/api/leads/followup-lote' && m === 'POST') {
    precisa(); frear('followup-lote', 20, 60_000);
    const b = await lerCorpo();
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter(ehUuid))] : [];
    if (!ids.length || ids.length > 200) throw falha(400, 'Escolha de 1 a 200 leads.');
    const quando = b.limpar === true ? null : resolverProximo(b.proximo, agora);
    if (b.limpar !== true && quando === null) throw falha(400, 'Escolha quando falar de novo.');
    const todos = await c.store.todosOsLeads();
    const alvo = todos.filter(l => ids.includes(String(l.id)));
    const abertos = alvo.filter(l => ABERTAS.includes(l.status));
    const podem = abertos.filter(l => c.podeEditarLead ? c.podeEditarLead(l, quem) : true);
    if (podem.length) {
      const { error } = await sb.from('leads').update({ proximo_contato_em: quando ? iso(quando) : null }).in('id', podem.map(l => l.id));
      if (error) throw falha(503, 'Não consegui adiar agora.');
    }
    limpar();
    await c.auditar(quem, 'followup_lote', { tabela: 'leads', detalhes: { quantidade: podem.length, para: quando ? iso(quando) : null, de_colegas: abertos.length - podem.length, fechados: alvo.length - abertos.length } });
    json(res, 200, { ok: true, atualizados: podem.length, ids: podem.map(l => l.id), de_colegas: abertos.length - podem.length, fechados: alvo.length - abertos.length, proximo_contato_em: quando ? iso(quando) : null,
      anteriores: Object.fromEntries(podem.map(l => [l.id, l.proximo_contato_em || null])) });
    return true;
  }

  /* ---------- registrar contato / histórico / cadência / ecossistema do lead ---------- */
  const ml = p.match(/^\/api\/leads\/([0-9a-fA-F-]{36})\/(contato|atividades|cadencia|ecossistema)$/);
  if (ml) {
    precisa();
    const [, id, oque] = ml;
    if (oque === 'atividades' && m === 'GET') {
      await lerLead(id); frear('atividades', 120, 60_000);
      const rows = await lerSeguro(sb.from('crm_atividades').select('id,tipo,resultado,texto,proximo_contato_em,criado_por,created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(60));
      const nomes = await pessoas(rows.map(r => r.criado_por));
      json(res, 200, { atividades: rows.map(r => ({ ...r, autor: nomes.get(r.criado_por) || null, resultado_rotulo: ROTULO_RESULTADO[r.resultado] || null })) });
      return true;
    }
    if (oque === 'contato' && m === 'POST') {
      frear('contato', 120, 60_000);
      const lead = await lerLead(id); await deColega(lead);
      const b = validarContato(await lerCorpo(), agora);
      const fechado = ['concluido', 'perdido'].includes(lead.status);
      const ef = efeitoDoContato(lead, b);
      const { data: ativ, error } = await sb.from('crm_atividades').insert({ lead_id: id, cliente_id: lead.cliente_id || null, tipo: b.tipo, resultado: b.resultado, texto: b.texto,
        proximo_contato_em: b.proximo ? iso(b.proximo) : null, criado_por: quem.id }).select('id,tipo,resultado,texto,proximo_contato_em,created_at').single();
      if (error || !ativ) throw falha(503, 'Não consegui registrar o contato agora.');
      const patch = {};
      if (b.tipo !== 'nota') { patch.ultimo_contato_em = iso(agora); patch.tentativas_contato = ef.tentativas; }
      if (b.proximo !== undefined && !fechado) patch.proximo_contato_em = b.proximo ? iso(b.proximo) : null;
      if (Object.keys(patch).length) { const { error: e2 } = await sb.from('leads').update(patch).eq('id', id); if (e2) throw falha(503, 'O contato foi anotado, mas não consegui atualizar o lead.'); }
      if (ef.status && b.tipo !== 'nota') { try { await c.store.updateLead(id, { status: ef.status }); } catch { /* a anotação já está salva */ } }
      let tarefa = null;
      if (b.tarefa && b.proximo && !fechado && c.tarefas) {
        try { tarefa = await c.tarefas.criar({ titulo: 'Retornar: ' + (lead.nome || 'cliente'), vence_em: iso(b.proximo), lead_id: id, responsavel_id: lead.responsavel_id || quem.id }, quem); } catch { tarefa = null; }
      }
      limpar();
      await c.auditar(quem, 'lead_contato', { tabela: 'leads', registro: id, detalhes: { tipo: b.tipo, resultado: b.resultado, proximo: b.proximo ? iso(b.proximo) : null, tentativas: ef.tentativas } });
      json(res, 201, { ok: true, atividade: { ...ativ, autor: quem.nome || null, resultado_rotulo: ROTULO_RESULTADO[ativ.resultado] || null },
        lead: { id, status: ef.status && b.tipo !== 'nota' ? ef.status : lead.status, ultimo_contato_em: patch.ultimo_contato_em ?? lead.ultimo_contato_em ?? null,
          proximo_contato_em: 'proximo_contato_em' in patch ? patch.proximo_contato_em : lead.proximo_contato_em ?? null, tentativas_contato: 'tentativas_contato' in patch ? patch.tentativas_contato : Number(lead.tentativas_contato) || 0 },
        sugestao: b.tipo === 'nota' ? null : ef.sugestao, tarefa: tarefa ? { id: tarefa.id, titulo: tarefa.titulo } : null });
      return true;
    }
    if (oque === 'cadencia' && m === 'POST') {
      frear('cadencia', 30, 60_000);
      if (!c.tarefas) throw falha(503, 'Tarefas indisponíveis.');
      const lead = await lerLead(id); await deColega(lead);
      const b = await lerCorpo();
      const plano = planoCadencia(b.tipo, agora);
      if (['concluido', 'perdido'].includes(lead.status) && b.tipo !== 'posvenda') throw falha(400, 'Esse lead já foi fechado: só a cadência de pós-venda faz sentido.');
      const jaTem = await c.tarefas.listar({ quem, leadId: id, status: 'aberta' });
      const titulos = new Set(jaTem.tarefas.map(t => t.titulo));
      const criadas = [];
      for (const passo of plano) {
        if (titulos.has(passo.titulo)) continue;
        const t = await c.tarefas.criar({ titulo: passo.titulo, vence_em: passo.vence_em, lead_id: id, responsavel_id: lead.responsavel_id || quem.id }, quem);
        criadas.push({ id: t.id, titulo: t.titulo, vence_em: t.vence_em });
      }
      if (criadas.length && !lead.proximo_contato_em && !['concluido', 'perdido'].includes(lead.status)) await sb.from('leads').update({ proximo_contato_em: criadas[0].vence_em }).eq('id', id);
      limpar();
      await c.auditar(quem, 'lead_cadencia', { tabela: 'leads', registro: id, detalhes: { tipo: b.tipo, criadas: criadas.length } });
      json(res, 201, { ok: true, rotulo: CADENCIAS[b.tipo].rotulo, criadas, puladas: plano.length - criadas.length });
      return true;
    }
    if (oque === 'ecossistema' && m === 'GET') {
      frear('ecossistema', 60, 60_000);
      const lead = await lerLead(id);
      const tel = e164(lead.telefone);
      let ficha = null;
      if (tel) {
        const { data, error } = await require('./rodada6c').fichaDoCliente(sb, tel);
        if (error) { if (/não existe|does not exist|function/i.test(String(error.message))) throw falha(503, 'A ficha completa ainda não está disponível no banco.'); throw falha(503, 'Não consegui montar o ecossistema agora.'); }
        ficha = data && typeof data === 'object' ? data : null;
        if (ficha) await enriquecerFicha(sb, ficha, agora);
      }
      const s = await sinaisAgora(c);
      const L = ficha ? R5.linksFicha(ficha, { prefixo }) : {};
      const pr = prioridadeFila(lead, s.sinais[id], agora);
      json(res, 200, { lead_id: id, sinais: s.sinais[id] || { flags: [] }, proxima_acao: pr.principal ? { codigo: pr.principal.codigo, texto: pr.principal.texto, script: scriptSugerido(pr.principal.codigo, lead) } : null, ficha,
        links: { ...L, novoOrcamento: linkNovoOrcamento({ cliente_id: lead.cliente_id || ficha?.cliente?.id, telefone: lead.telefone, nome: lead.nome, lead_id: lead.id, placa: lead.placa, veiculo: lead.carro_modelo, servico: lead.servico }, { prefixo }) } });
      return true;
    }
  }

  /* ---------- fila do dia: quem contatar agora e por quê ---------- */
  if (p === '/api/fila-do-dia' && m === 'GET') {
    precisa(); frear('fila', 60, 60_000);
    const s = await sinaisAgora(c);
    let escopo = url.searchParams.get('escopo') || (gestor ? 'todos' : 'meus');
    if (!['meus', 'todos', 'sem'].includes(escopo)) escopo = gestor ? 'todos' : 'meus';
    if (!gestor && escopo === 'todos') escopo = 'meus';
    const doEscopo = l => escopo === 'sem' ? !l.responsavel_id : escopo === 'meus' ? (l.responsavel_id === quem.id || (!gestor && !l.responsavel_id)) : true;
    const itens = [];
    for (const l of s.leads) {
      if (!ABERTAS.includes(l.status) || !doEscopo(l)) continue;
      const sn = s.sinais[l.id]; const pr = prioridadeFila(l, sn, agora);
      if (!pr.score) continue;
      itens.push({ lead: { id: l.id, nome: l.nome, telefone: l.telefone, status: l.status, servico: l.servico || null, carro_modelo: l.carro_modelo || null, placa: l.placa || null, valor_orcado: Number(l.valor_orcado) || 0,
          responsavel_id: l.responsavel_id || null, origem: l.origem, proximo_contato_em: l.proximo_contato_em || null, ultimo_contato_em: l.ultimo_contato_em || null, tentativas_contato: Number(l.tentativas_contato) || 0 },
        score: pr.score, motivos: pr.motivos.slice(0, 3), principal: pr.principal.codigo, texto: pr.principal.texto, script: scriptSugerido(pr.principal.codigo, l),
        sinais: { patio: sn.patio || null, orcamento: sn.orcamento || null, tarefa: sn.tarefa || null, agendamento: sn.agendamento || null } });
    }
    itens.sort((a, b) => b.score - a.score || String(a.lead.nome).localeCompare(String(b.lead.nome), 'pt-BR'));
    // último contato registrado de cada lead da fila (quem ligou, quando, o que deu)
    const topo = itens.slice(0, 80), idsTopo = topo.map(i => i.lead.id);
    if (idsTopo.length) {
      const ats = await lerSeguro(sb.from('crm_atividades').select('lead_id,tipo,resultado,texto,created_at,criado_por').in('lead_id', idsTopo).order('created_at', { ascending: false }).limit(800));
      const nomes = await pessoas(ats.map(a => a.criado_por));
      const visto = new Set();
      for (const a of ats) { if (visto.has(a.lead_id)) continue; visto.add(a.lead_id); const it = topo.find(i => i.lead.id === a.lead_id); if (it) it.ultimo_contato = { tipo: a.tipo, resultado: a.resultado, resultado_rotulo: ROTULO_RESULTADO[a.resultado] || null, texto: a.texto ? String(a.texto).slice(0, 140) : null, quando: a.created_at, autor: nomes.get(a.criado_por) || null }; }
    }
    const feitos = await lerSeguro(sb.from('crm_atividades').select('id').eq('criado_por', quem.id).gte('created_at', iso(inicioDiaBRT(agora))));
    const porMotivo = {}; for (const it of itens) porMotivo[it.principal] = (porMotivo[it.principal] || 0) + 1;
    json(res, 200, { escopo, total: itens.length, mostrando: Math.min(80, itens.length), itens: itens.slice(0, 80), por_motivo: porMotivo, feitos_hoje: feitos.length, gerado_em: iso(agora) });
    return true;
  }

  /* ---------- carros entregues esperando o lead ser concluído ---------- */
  if (p === '/api/entregues-sem-fechar' && m === 'GET') {
    precisa(); frear('entregues', 30, 60_000);
    const s = await sinaisAgora(c);
    const doLead = s.leads.filter(l => ABERTAS.includes(l.status) && s.sinais[l.id]?.entregue);
    const osIds = doLead.map(l => s.sinais[l.id].entregue.id);
    const ext = osIds.length ? await lerSeguro(sb.from('patio_extras').select('os_id,valor,status').in('os_id', osIds).eq('status', 'aprovado')) : [];
    const somaExtras = new Map(); for (const x of ext) somaExtras.set(x.os_id, (somaExtras.get(x.os_id) || 0) + (Number(x.valor) || 0));
    const itens = doLead.map(l => {
      const sn = s.sinais[l.id], os = sn.entregue;
      const orc = s.dados.orcs.filter(o => o.status === 'aprovado' && (o.lead_id === l.id || (l.cliente_id && o.cliente_id === l.cliente_id) || (e164(o.cliente_telefone) && e164(o.cliente_telefone) === e164(l.telefone))))[0] || null;
      const extras = r2(somaExtras.get(os.id) || 0);
      return { lead: { id: l.id, nome: l.nome, telefone: l.telefone, servico: l.servico || null, carro_modelo: l.carro_modelo || null, valor_orcado: Number(l.valor_orcado) || 0, responsavel_id: l.responsavel_id || null, status: l.status },
        os: { id: os.id, numero: os.numero, entregue_em: os.entregue_em, dias: os.dias }, extras_aprovados: extras,
        orcamento: orc ? { id: orc.id, numero: orc.numero, total: Number(orc.total_aprovado) > 0 ? Number(orc.total_aprovado) : Number(orc.total) || 0 } : null,
        sugestoes: sugestaoValorEntregue({ lead: l, orcamento: orc, extrasAprovados: extras }),
        pode_editar: c.podeEditarLead ? !!c.podeEditarLead(l, quem) : true };
    }).sort((a, b) => b.os.dias - a.os.dias);
    json(res, 200, { total: itens.length, itens });
    return true;
  }

  /* ---------- ROI por campanha, cruzando o Ads (gestor) ---------- */
  if (p === '/api/roi/campanhas' && m === 'GET') {
    precisa(); exigirGestor('Só um gestor vê o investimento e o retorno das campanhas.'); frear('roi-camp', 20, 60_000);
    const dm = (v, padrao) => { const t = ms(v); return Number.isFinite(t) ? t : padrao; };
    const pb = brt(agora);
    const ini = dm(url.searchParams.get('de'), deBrt(pb.a, pb.m, 1));
    const fim = dm(url.searchParams.get('ate'), agora) + DIA;
    if (fim <= ini) throw falha(400, 'O período está invertido.');
    if (fim - ini > 400 * DIA) throw falha(400, 'Período longo demais (máx. ~1 ano).');
    const dIni = iso(ini + 0).slice(0, 10), dFim = iso(fim - DIA).slice(0, 10);
    const metricas = await lerTodas(() => sb.from('ads_metricas_dia').select('plataforma,data,campanha_ext,campanha_nome,entidade_nome,gasto,cliques,impressoes,conversoes,valor_conversao,fonte').eq('nivel', 'campanha').gte('data', dIni).lte('data', dFim).order('id'));
    const leads = (await c.store.todosOsLeads()).filter(l => { const t = ms(l.created_at); return t >= ini && t < fim; });
    const alertas = await lerSeguro(sb.from('ads_alertas').select('id,severidade,mensagem,entidade_nome,criado_em').is('lido_em', null).order('criado_em', { ascending: false }).limit(5));
    const r = roiCampanhas(metricas, leads);
    const fontes = [...new Set(metricas.map(x => x.fonte).filter(Boolean))];
    json(res, 200, { de: dIni, ate: dFim, ...r, alertas, fontes, so_demonstracao: fontes.length > 0 && fontes.every(f => /demo|teste|exemplo/i.test(f)) });
    return true;
  }

  /* ---------- qualidade dos dados (gestor) ---------- */
  if (p === '/api/qualidade' && m === 'GET') {
    precisa(); exigirGestor('Só um gestor vê a qualidade dos dados.'); frear('qualidade', 20, 60_000);
    json(res, 200, qualidadeDados(await c.store.todosOsLeads(), agora));
    return true;
  }

  /* ---------- resumo do dono (gestor) ---------- */
  if (p === '/api/dono' && m === 'GET') {
    precisa(); exigirGestor('Só um gestor vê o resumo do dono.'); frear('dono', 20, 60_000);
    json(res, 200, await resumoDono(c, agora));
    return true;
  }

  return false;
}

/** Quanto o time demora para falar com um lead novo (leads com contato registrado; mediana e média em horas, por pessoa). */
function tempoAtePrimeiroContato(leads, nomes = new Map()) {
  const h = l => (ms(l.ultimo_contato_em) - ms(l.created_at)) / 3600_000;
  const com = (leads || []).filter(l => l.ultimo_contato_em && Number.isFinite(h(l)) && h(l) >= 0);
  const mediana = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  const porPessoa = new Map();
  for (const l of com) { const k = l.responsavel_id || 'sem'; (porPessoa.get(k) || porPessoa.set(k, []).get(k)).push(h(l)); }
  const todas = com.map(h);
  return { leads: (leads || []).length, com_contato: com.length, sem_contato: (leads || []).length - com.length, mediana_h: r1(mediana(todas)), media_h: r1(media(todas)),
    por_pessoa: [...porPessoa.entries()].map(([id, a]) => ({ id, nome: id === 'sem' ? 'Sem responsável' : nomes.get(id) || 'Alguém', leads: a.length, mediana_h: r1(mediana(a)) })).sort((a, b) => (a.mediana_h ?? 1e9) - (b.mediana_h ?? 1e9)) };
}
const nomesPorId = m => m;
async function pessoas_(sb, ids) { const u = [...new Set(ids.filter(ehUuid))]; if (!u.length) return new Map(); const r = await lerSeguro(sb.from('perfis').select('id,nome').in('id', u)); return new Map(r.map(x => [x.id, x.nome])); }

/** Junta tudo o que o dono quer ver numa tela só. */
async function resumoDono(c, agora = Date.now()) {
  const sb = c.sb;
  const pb = brt(agora);
  const mesIni = deBrt(pb.a, pb.m, 1), mesAnoMes = `${pb.a}-${pad(pb.m)}`;
  const s = await sinaisAgora(c);
  const leads = s.leads;
  const semana = janela(leads, agora - 7 * DIA, agora + 1), anterior = janela(leads, agora - 14 * DIA, agora - 7 * DIA);
  const mes = janela(leads, mesIni, agora + 1);
  const metas = await lerSeguro(sb.from('metas').select('perfil_id,mes,leads,agendamentos,vendas,faturamento').eq('mes', `${mesAnoMes}-01`));
  const metaLoja = metas.find(x => !x.perfil_id) || null;
  const ritmo = ritmoMeta({ realizado: mes.faturamento, meta: Number(metaLoja?.faturamento) || 0, agora });
  const dados = s.dados;
  const porEtapa = {}; for (const o of dados.os) porEtapa[o.etapa] = (porEtapa[o.etapa] || 0) + 1;
  const hoje0 = inicioDiaBRT(agora);
  const patio = { no_patio: dados.os.length, por_etapa: porEtapa, prontos: porEtapa.pronto || 0, entregues_hoje: dados.entregues.filter(o => ms(o.entregue_em) >= hoje0).length,
    entregues_sem_fechar: Object.values(s.sinais).filter(x => x.flags.includes('entregue_fechar')).length, extras_pendentes: dados.extras.length };
  const enviados = dados.orcs.filter(o => o.status === 'enviado');
  const parados = enviados.filter(o => o.enviado_em && (agora - ms(o.enviado_em)) >= 2 * DIA);
  const soma = l => r2(l.reduce((t, o) => t + (Number(o.total_aprovado) > 0 ? Number(o.total_aprovado) : Number(o.total) || 0), 0));
  const orcamentos = { enviados: enviados.length, valor_enviado: soma(enviados), parados: parados.length, valor_parado: soma(parados), aprovados_sem_horario: dados.orcs.filter(o => o.status === 'aprovado' && !o.agendamento_id).length };
  const horasEspera = dados.conversas.map(x => x.aguardando_desde ? Math.round((agora - ms(x.aguardando_desde)) / 3600_000) : 0);
  const conversas = { esperando: dados.conversas.length, maior_espera_h: horasEspera.length ? Math.max(...horasEspera) : 0 };
  const avs = await lerSeguro(sb.from('patio_avaliacoes').select('nota,comentario,created_at,os_id').gte('created_at', iso(agora - 30 * DIA)));
  const avaliacoes = notaMedia(avs);
  const [metricas, alertas, ags] = await Promise.all([
    lerTodas(() => sb.from('ads_metricas_dia').select('plataforma,data,campanha_ext,campanha_nome,entidade_nome,gasto,cliques,impressoes,conversoes,valor_conversao').eq('nivel', 'campanha').gte('data', iso(mesIni).slice(0, 10)).order('id')),
    lerSeguro(sb.from('ads_alertas').select('id').is('lido_em', null)),
    lerTodas(() => sb.from('agendamentos').select('id,status,data').gte('data', iso(agora - 30 * DIA).slice(0, 10)).order('id')),
  ]);
  const roi = roiCampanhas(metricas, leads.filter(l => ms(l.created_at) >= mesIni));
  const comGasto = roi.campanhas.filter(x => x.gasto > 0);
  const ads = { gasto_mes: roi.totais.gasto, leads: roi.totais.leads, ganhos: roi.totais.ganhos, faturamento: roi.totais.faturamento, roas: roi.totais.gasto > 0 ? r2(roi.totais.faturamento / roi.totais.gasto) : null,
    melhor: [...comGasto].filter(x => x.ganhos).sort((a, b) => (b.roas || 0) - (a.roas || 0))[0] || null, pior: [...comGasto].filter(x => !x.ganhos).sort((a, b) => b.gasto - a.gasto)[0] || null, alertas: alertas.length };
  const fechadas30 = ags.filter(a => ['concluido', 'nao_veio', 'nao_fechou'].includes(a.status));
  const agenda = { no_show_pct: pct(ags.filter(a => a.status === 'nao_veio').length, fechadas30.length), fechadas: fechadas30.length };
  const motivos = {};
  for (const l of leads) if (l.status === 'perdido' && ms(l.closed_at || l.updated_at) >= agora - 30 * DIA) { const mo = R5.motivoPadrao(R5.motivoDe(l.observacoes)) || 'Sem motivo'; motivos[mo] = (motivos[mo] || 0) + 1; }
  const perdas = Object.entries(motivos).map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 5);
  const porVend = new Map();
  for (const l of leads) if (l.status === 'concluido' && ms(l.closed_at || l.updated_at) >= mesIni) { const k = l.responsavel_id || 'sem'; const x = porVend.get(k) || { id: k, vendas: 0, faturamento: 0 }; x.vendas++; x.faturamento += Number(l.valor_pago) || 0; porVend.set(k, x); }
  const nomes = await (async () => { const u = [...porVend.keys()].filter(ehUuid); if (!u.length) return new Map(); const r = await lerSeguro(sb.from('perfis').select('id,nome').in('id', u)); return new Map(r.map(x => [x.id, x.nome])); })();
  const vendedores = [...porVend.values()].map(x => ({ ...x, faturamento: r2(x.faturamento), nome: x.id === 'sem' ? 'Sem responsável' : nomes.get(x.id) || 'Alguém' })).sort((a, b) => b.faturamento - a.faturamento).slice(0, 5);
  const primeiro = tempoAtePrimeiroContato(leads.filter(l => ms(l.created_at) >= agora - 14 * DIA), nomesPorId(await pessoas_(sb, leads.map(l => l.responsavel_id))));
  const abertos = leads.filter(l => ABERTAS.includes(l.status));
  const qualidade = { sem_dono: abertos.filter(l => !l.responsavel_id).length, tarefas_atrasadas: Object.values(s.sinais).filter(x => x.flags.includes('tarefa_atrasada')).length,
    followups_vencidos: Object.values(s.sinais).filter(x => x.flags.includes('followup_vencido')).length };
  const r = { gerado_em: iso(agora), mes: { ...mes, mes: mesAnoMes, ritmo, meta_loja: metaLoja ? { leads: metaLoja.leads, agendamentos: metaLoja.agendamentos, vendas: metaLoja.vendas, faturamento: Number(metaLoja.faturamento) || 0 } : null },
    semana, anterior, patio, orcamentos, conversas, avaliacoes, ads, agenda, perdas, vendedores, qualidade, primeiro_contato: primeiro, abertos: { total: abertos.length, valor: r2(abertos.reduce((t, l) => t + (Number(l.valor_orcado) || 0), 0)) } };
  r.insights = insightsDono(r);
  r.texto_whatsapp = textoWhatsAppDono(r, new Date(agora));
  return r;
}


R5.enriquecer = enriquecerFicha;

module.exports = {
  rotasR6, sinaisAgora, esquecerSinais, enriquecerFicha, carregarDadosSinais, linkOrcamento, linkNovoOrcamento, resumoDono,
  brt, deBrt, diaUtil, emHorasUteis, ehDiaUtil, TIPOS_CONTATO, RESULTADOS, ROTULO_RESULTADO, PRESETS_PROXIMO, TENTATIVAS_PARA_PERDER,
  resolverProximo, proximoSugerido, validarContato, efeitoDoContato, CADENCIAS, planoCadencia,
  construirSinais, contarSinais, SINAIS_ROTULO, prioridadeFila, scriptSugerido, sugestaoValorEntregue,
  slug, mesmaCampanha, roiCampanhas, qualidadeDados, segmentoCliente, notaMedia, linhaDoTempoCliente,
  tempoAtePrimeiroContato, janela, ritmoMeta, insightsDono, textoWhatsAppDono, diasUteisEntre, ETAPAS_PATIO_ABERTAS,
};
