// -----------------------------------------------------------------------------
// Rodada 6 (21/10/2026) — o Comunicar ligado aos EVENTOS dos outros sistemas.
// Regras PURAS (sem banco, sem rede), testadas em scripts/testes-rodada6.mjs.
//
//   Pátio   → entrega da ordem dispara pós-venda/avaliação; histórico da ordem entra na revisão;
//             extra esperando o OK do cliente vira lembrete; carro na oficina segura as réguas.
//   Orçador → orçamento enviado e sem resposta vira lembrete (com o link do orçamento),
//             decidido no meio do caminho cancela o lembrete.
//   Segurança → reclamação aberta, texto repetido, retomada gradual quando o WhatsApp volta,
//             links de fora da casa em campanha.
//   Operação → "por que não saiu?", agenda de envios, resultados (resposta → agendou → voltou → faturou).
//
// Quem grava é o dados.js (geradores) e o rodada.js (carteiro): aqui só se decide.
// -----------------------------------------------------------------------------
import { somarDias, instanteSP, agoraSP, prazoDeRetorno, semAcento, telefoneNacional, soDigitos } from './dados.js';

export const ORCADOR_URL = 'https://indycar-orcador.netlify.app';

/** Etapas em que o carro ESTÁ dentro da oficina (inclui "pronto": ainda não foi retirado). */
export const ETAPAS_ATIVAS = ['recebido', 'diagnostico', 'aguardando_aprovacao', 'aguardando_peca', 'em_execucao', 'teste', 'pronto'];
export const ETAPA_ROTULO = {
  recebido: 'recebido', diagnostico: 'em diagnóstico', aguardando_aprovacao: 'esperando aprovação', aguardando_peca: 'esperando peça',
  em_execucao: 'em execução', teste: 'em teste', pronto: 'pronto para retirar', entregue: 'entregue', cancelado: 'cancelado',
};
export const osAtiva = (os) => !!os && ETAPAS_ATIVAS.includes(os.etapa);

export const diaSP = (iso) => (iso ? agoraSP(new Date(iso)).data : null);
const minutos = (a, b) => (a - b) / 60000;

// ----------------------------------------------------------------------------
// Links e textos
// ----------------------------------------------------------------------------
const TOKEN_ORC = /^[A-Za-z0-9_-]{12,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Página do cliente no Orçador: {base}/#/o/<token_publico> (sem login). Token estranho → null. */
export function linkOrcamentoCliente(base, token) {
  const b = String(base || ORCADOR_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(b) || !TOKEN_ORC.test(String(token || ''))) return null;
  return `${b}/#/o/${token}`;
}

/** "o item X" · "2 itens (X e Y)" · "3 itens (X, Y e outro)" — para o lembrete do extra. */
export function listarItens(descricoes = []) {
  const l = descricoes.map((d) => String(d || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!l.length) return 'um item extra';
  if (l.length === 1) return `o item "${l[0].slice(0, 60)}"`;
  const mostra = l.slice(0, 2).map((d) => d.slice(0, 40));
  const resto = l.length - mostra.length;
  const lista = resto > 0 ? `${mostra.join(', ')} e mais ${resto}` : `${mostra[0]} e ${mostra[1]}`;
  return `${l.length} itens (${lista})`;
}

// ----------------------------------------------------------------------------
// PÁTIO → PÓS-VENDA / AVALIAÇÃO
// ----------------------------------------------------------------------------
/** Mesma chave do pós-venda da Agenda quando a ordem veio de um horário: o carro entregue nunca recebe dois. */
export const chavePosvendaPatio = (os) => (os?.agendamento_id ? `posvenda:${os.agendamento_id}` : `posvenda:patio:${os?.id}`);

/**
 * Uma ordem ENTREGUE no Pátio: manda o "ficou tudo certo?" N dias depois (mesma janela de 5 dias de
 * recuperação do pós-venda da Agenda)? Quem já avaliou o Pátio muda o caminho:
 *   nota ≤ 3 → pula (a equipe cuida; pergunta automática seria insistência);
 *   nota ≥ 4 → vai direto ao convite do Google (se a régua de avaliação e o link estão prontos).
 * { acao: 'ignorar'|'pular'|'posvenda'|'avaliacao', chave, motivo? }
 */
export function decidirPosvendaPatio(os, { hojeIso, diasPosvenda = 2, avaliacao = null, avaliacaoLigada = false, linkAvaliacao = '' } = {}) {
  if (!os || os.etapa !== 'entregue' || !os.entregue_em) return { acao: 'ignorar' };
  if (!soDigitos(os.telefone)) return { acao: 'ignorar' };
  const dia = diaSP(os.entregue_em);
  const ate = somarDias(hojeIso, -diasPosvenda), desde = somarDias(ate, -5);
  if (!dia || dia > ate || dia < desde) return { acao: 'ignorar' };
  const chave = chavePosvendaPatio(os);
  const nota = Number(avaliacao?.nota);
  if (Number.isFinite(nota) && nota >= 1 && nota <= 3) {
    return { acao: 'pular', chave, motivo: `o cliente já avaliou o Pátio com nota ${nota}: a equipe cuida antes de qualquer pergunta automática` };
  }
  if (Number.isFinite(nota) && nota >= 4 && avaliacaoLigada && /^https?:\/\//i.test(String(linkAvaliacao || ''))) {
    return { acao: 'avaliacao', chave: `avaliacao:patio:${os.id}`, nota };
  }
  return { acao: 'posvenda', chave };
}

// ----------------------------------------------------------------------------
// PÁTIO → REVISÃO (pelo histórico da ordem)
// ----------------------------------------------------------------------------
/** Mesma chave da Agenda quando há horário; 'retorno:patio:<os>' é a que o gatilho do Pátio já usa. */
export const chaveRetornoPatio = (os) => (os?.agendamento_id ? `retorno:${os.agendamento_id}` : `retorno:patio:${os?.id}`);

/** A revisão desta ordem entregue vence na janela de 7 dias? { vence, meses, regra } ou null. */
export function revisaoDoPatio(os, regras = [], mesesPadrao = 6, hojeIso) {
  if (!os || os.etapa !== 'entregue' || !os.entregue_em || !soDigitos(os.telefone)) return null;
  const dia = diaSP(os.entregue_em);
  const { meses, regra } = prazoDeRetorno(os.servico, regras, mesesPadrao);
  const vence = somarDias(dia, meses * 30);
  if (vence > hojeIso || vence < somarDias(hojeIso, -7)) return null;
  return { vence, meses, regra, dia };
}

/** Na hora de enviar a revisão: o cliente voltou (nova ordem ou horário) depois da entrega? Então não incomoda. */
export function conferirRetorno(envio, voltouEm) {
  if (voltouEm) return { acao: 'pular', motivo: `o cliente já voltou à oficina (${String(voltouEm).slice(0, 10).split('-').reverse().join('/')}): a revisão perdeu o sentido` };
  return { acao: 'enviar' };
}

// ----------------------------------------------------------------------------
// ORÇADOR → LEMBRETE
// ----------------------------------------------------------------------------
export const chaveOrcamento = (orc) => `orcamento:orc:${orc?.id}`;

/**
 * Orçamento ENVIADO no Orçador e sem decisão há N dias → lembrete (uma vez; janela de 7 dias).
 * Quem abriu o link (visualizado_em) recebe o texto de "ficou alguma dúvida?"; quem nem abriu, "conseguiu abrir?".
 * { elegivel, visto, motivo? }
 */
export function decidirOrcamentoParado(orc, { agora = Date.now(), dias = 3, hojeIso } = {}) {
  if (!orc || orc.status !== 'enviado' || !orc.enviado_em || orc.decidido_em) return { elegivel: false, motivo: 'não está esperando resposta' };
  if (!soDigitos(orc.cliente_telefone)) return { elegivel: false, motivo: 'sem telefone' };
  const enviado = Date.parse(orc.enviado_em);
  const idade = minutos(agora, enviado) / 1440;
  if (idade < dias) return { elegivel: false, motivo: 'ainda dentro do prazo de resposta' };
  if (idade > dias + 7) return { elegivel: false, motivo: 'parado há tempo demais para um lembrete' };
  const visto = !!orc.visualizado_em;
  // viu agora há pouco: dá um dia para ele decidir
  if (visto && minutos(agora, Date.parse(orc.visualizado_em)) < 1440) return { elegivel: false, visto, motivo: 'abriu o orçamento há menos de 1 dia' };
  if (orc.validade && hojeIso && String(orc.validade).slice(0, 10) < hojeIso) return { elegivel: false, visto, motivo: 'a validade do orçamento já passou' };
  return { elegivel: true, visto };
}

/** Na hora de enviar o lembrete do orçamento: ele já decidiu? foi apagado? voltou a rascunho? */
export function conferirOrcamento(envio, orc) {
  if (!orc) return { acao: 'pular', motivo: 'o orçamento foi apagado do Orçador' };
  if (orc.status === 'aprovado') return { acao: 'pular', motivo: 'o cliente já aprovou o orçamento' };
  if (orc.status === 'recusado') return { acao: 'pular', motivo: 'o cliente já recusou o orçamento' };
  if (orc.status === 'expirado') return { acao: 'pular', motivo: 'o orçamento expirou' };
  if (orc.decidido_em) return { acao: 'pular', motivo: 'o cliente já decidiu o orçamento' };
  if (orc.status !== 'enviado') return { acao: 'pular', motivo: 'o orçamento voltou para rascunho no Orçador' };
  return { acao: 'enviar' };
}

// ----------------------------------------------------------------------------
// PÁTIO → LEMBRETE DO EXTRA
// ----------------------------------------------------------------------------
export const chaveExtraLembrete = (osId) => `patio_extra_lembrete:${osId}`;

/**
 * Extra esperando o OK do cliente: depois de N horas SEM decisão — e só se o aviso inicial já SAIU
 * (nada de lembrete de um aviso que o cliente nunca recebeu) — manda UM lembrete por ordem.
 *   avisos = envios do tipo patio_extra desta ordem [{ status, enviado_em }]
 */
export function decidirExtraLembrete(os, extras = [], avisos = [], { agora = Date.now(), horas = 3 } = {}) {
  if (!osAtiva(os) || !soDigitos(os.telefone)) return { elegivel: false };
  const pend = (extras || []).filter((e) => e && e.status === 'pendente');
  if (!pend.length) return { elegivel: false };
  const enviados = (avisos || []).filter((a) => a.status === 'enviado' && a.enviado_em);
  if (!enviados.length) return { elegivel: false, motivo: 'o aviso inicial do extra ainda não saiu' };
  const ultimoAviso = Math.max(...enviados.map((a) => Date.parse(a.enviado_em)));
  const maisNovoExtra = Math.max(...pend.map((e) => Date.parse(e.created_at || 0) || 0));
  if (minutos(agora, ultimoAviso) < horas * 60) return { elegivel: false, motivo: 'o aviso inicial saiu há pouco' };
  if (maisNovoExtra && minutos(agora, maisNovoExtra) < horas * 60) return { elegivel: false, motivo: 'extra novo, ainda dentro do prazo' };
  return { elegivel: true, itens: pend.map((e) => e.descricao), chave: chaveExtraLembrete(os.id), n: pend.length };
}

// ----------------------------------------------------------------------------
// LEMBRETE DE HORÁRIO × CARRO JÁ NA OFICINA
// ----------------------------------------------------------------------------
export function conferirLembreteComOrdem(envio, os) {
  if (os && (osAtiva(os) || os.etapa === 'entregue')) {
    return { acao: 'pular', motivo: `o carro já está na oficina (ordem ${os.numero ?? ''} ${ETAPA_ROTULO[os.etapa] || os.etapa})`.replace('  ', ' ').trim() };
  }
  return { acao: 'enviar' };
}

// ----------------------------------------------------------------------------
// SEGURANÇA — quem está em atendimento ou reclamando não recebe régua de relacionamento
// ----------------------------------------------------------------------------
export const TIPOS_AUTOMATICOS_RELACIONAMENTO = new Set(['aniversario', 'reativacao', 'nao_fechou', 'retorno', 'orcamento']);

/**
 * situacao = { os: { numero, etapa } | null, reclamacao: { em, resumo, tarefaAberta } | null }
 * { acao: 'seguir' } ou { acao: 'adiar', ate: ISO, motivo, causa: 'oficina'|'reclamacao' }
 */
export function bloqueioDeRelacionamento(envio, situacao = {}, cfg = {}, agora = Date.now()) {
  if (!TIPOS_AUTOMATICOS_RELACIONAMENTO.has(envio?.tipo)) return { acao: 'seguir' };
  if (cfg.bloquear_com_carro_na_oficina !== false && situacao.os && osAtiva(situacao.os)) {
    return {
      acao: 'adiar', causa: 'oficina', ate: new Date(agora + 24 * 3600000).toISOString(),
      motivo: `o carro dele está na oficina agora (ordem ${situacao.os.numero ?? '—'}, ${ETAPA_ROTULO[situacao.os.etapa] || situacao.os.etapa}): espera a entrega`,
    };
  }
  if (cfg.bloquear_com_reclamacao !== false && situacao.reclamacao) {
    const dias = Number(cfg.dias_reclamacao_aberta) || 14;
    const idade = minutos(agora, Date.parse(situacao.reclamacao.em)) / 1440;
    // reclamou há pouco e a equipe ainda não resolveu (tarefa aberta ou sem tarefa): deixa quieto
    if (idade < dias && situacao.reclamacao.tarefaAberta !== false) {
      return { acao: 'adiar', causa: 'reclamacao', ate: new Date(agora + 24 * 3600000).toISOString(), motivo: `reclamou há ${Math.max(1, Math.round(idade))} dia(s) e a equipe ainda não resolveu: nenhuma mensagem automática de relacionamento até lá` };
    }
  }
  /* orçamento esperando resposta: quem está negociando fala com ele; "sumiu há meses" ou "não fechou" por cima seria desastre */
  if (cfg.bloquear_com_orcamento_aberto !== false && situacao.orcamento && ['reativacao', 'nao_fechou'].includes(envio.tipo)) {
    const validade = situacao.orcamento.validade ? String(situacao.orcamento.validade).slice(0, 10) : null;
    if (!validade || validade >= diaSP(new Date(agora).toISOString())) {
      return { acao: 'adiar', causa: 'orcamento', ate: new Date(agora + 48 * 3600000).toISOString(), motivo: `ele tem o orçamento ${situacao.orcamento.numero ? `nº ${situacao.orcamento.numero} ` : ''}esperando resposta no Orçador: quem está negociando fala com ele, nada de "sumiu" por cima` };
    }
  }
  return { acao: 'seguir' };
}

// ----------------------------------------------------------------------------
// SEGURANÇA — o mesmo texto para o mesmo número
// ----------------------------------------------------------------------------
export function normalizarTexto(t) {
  return semAcento(String(t || '')).replace(/https?:\/\/\S+/g, '#').replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Iguais depois de tirar acento, pontuação e emojis — ou palavras em comum ≥ 90 % (mesma frase com um nome diferente). */
export function textosParecidos(a, b) {
  const x = normalizarTexto(a), y = normalizarTexto(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  if (Math.min(A.size, B.size) < 6) return false;
  let comum = 0; for (const w of A) if (B.has(w)) comum++;
  return comum / Math.max(A.size, B.size) >= 0.9;
}
/** anteriores = [{ corpo, quando (ms) , origem }] do MESMO telefone. */
export function repetidoRecente(corpo, anteriores = [], { horas = 48, agora = Date.now() } = {}) {
  if (!horas) return null;
  for (const a of anteriores) {
    if (!a || !Number.isFinite(a.quando) || agora - a.quando > horas * 3600000) continue;
    if (textosParecidos(corpo, a.corpo)) return { quando: a.quando, origem: a.origem || 'comunicar' };
  }
  return null;
}

// ----------------------------------------------------------------------------
// SEGURANÇA — o WhatsApp voltou de uma queda: a primeira rodada sai devagar
// ----------------------------------------------------------------------------
/** Queda séria = a oficina ficou sem WhatsApp (instabilidade de um minuto não freia a fila). */
export const QUEDAS_SERIAS = ['chave_recusada', 'sem_chave', 'sem_aparelho', 'desconectado'];
export const ETAPAS_RETOMADA = [{ ateMin: 30, maximo: 8 }, { ateMin: 120, maximo: 25 }];
/**
 * { limite, motivo } com quantas ainda podem sair (já descontadas as `enviadasDesde` a volta) ou null (sem freio).
 * Só vale quando o estado ATUAL é 'ok' e o anterior não era (chave recusada, aparelho caído…).
 */
export function limiteDeRetomada({ ligada = true, estado, estadoEm, anterior, agora = Date.now(), enviadasDesde = 0 } = {}) {
  if (!ligada || estado !== 'ok' || !anterior || !QUEDAS_SERIAS.includes(anterior) || !estadoEm) return null;
  const min = minutos(agora, Date.parse(estadoEm));
  if (!Number.isFinite(min) || min < 0) return null;
  for (const f of ETAPAS_RETOMADA) {
    if (min < f.ateMin) {
      const sobra = Math.max(0, f.maximo - (Number(enviadasDesde) || 0));
      return { limite: sobra, maximo: f.maximo, motivo: `o WhatsApp acabou de voltar (${anterior.replace(/_/g, ' ')}): retomada gradual, no máximo ${f.maximo} mensagens nos primeiros ${f.ateMin} min` };
    }
  }
  return null;
}

/** Do status do CodeWords para o estado que o banco aceita (posvenda_config.whatsapp_estado). */
export function estadoDoWhatsapp(status) {
  if (!status) return null;
  if (status.chaveRecusada || status.classe === 'chave_recusada') return 'chave_recusada';
  if (status.classe === 'sem_chave') return 'sem_chave';
  if (status.ok && status.conectado) return 'ok';
  if (status.ok && status.conectado === false) return status.classe === 'sem_aparelho' ? 'sem_aparelho' : 'desconectado';
  if (status.ok === false) return status.classe === 'limite' ? 'limite' : 'instabilidade';
  return null;
}

// ----------------------------------------------------------------------------
// SEGURANÇA — links de fora da casa em campanha
// ----------------------------------------------------------------------------
export const DOMINIOS_DA_CASA = [
  'indycar-agendamentos.onrender.com', 'indycar-patio.netlify.app', 'indycar-orcador.netlify.app', 'indycar-taubate.netlify.app',
  'g.page', 'g.co', 'goo.gl', 'maps.app.goo.gl', 'google.com', 'maps.google.com', 'wa.me', 'instagram.com',
];
/** Links do texto que NÃO são da casa (nem Google/Maps/WhatsApp/Instagram). Variáveis {link_*} ficam de fora. */
export function linksForaDaCasa(texto, permitidos = DOMINIOS_DA_CASA) {
  /* além de https://… e www.…, pega endereço "pelado" (evil.com/oferta, bit.ly/x): o WhatsApp transforma em link clicável do mesmo jeito.
     Não pega e-mail (precedido de @) nem nome de arquivo comum. */
  const achados = String(texto || '').match(/https?:\/\/[^\s)>\]]+|(?:^|\s)(?:www\.)[^\s)>\]]+|(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|br|io|app|me|link|xyz|top|co|info|shop|site|online|ly|gl|cc|tk|ml|ga|cf|gq|club|vip|store|biz|dev|page|click|live|cloud|ru|cn|in)(?![a-z0-9-])(?:\/[^\s)>\]]*)?/gi) || [];
  const fora = [];
  for (const bruto of achados) {
    const url = bruto.trim();
    let host = '';
    try { host = new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { host = url.toLowerCase(); }
    if (!permitidos.some((d) => host === d || host.endsWith(`.${d}`))) fora.push(url.slice(0, 80));
  }
  return fora;
}

// ----------------------------------------------------------------------------
// OPERAÇÃO — "por que esta mensagem ainda não saiu?"
// ----------------------------------------------------------------------------
/**
 * Passo a passo, na mesma ordem em que o carteiro decide, do que segura UMA mensagem pendente.
 * ctx = { cfg, agora (ms), hoje:{data,hora,minuto,diaSemana}, enviadasHora, enviadasHoje, aFrente, whatsapp:{estado,motivo},
 *         clienteFora, ultimoDoCliente (ms), hojeDoCliente, feriado, situacao, osDoLembrete, maxPorDia, tiposSeguramFeriado }
 * Devolve { quando, passos:[{ nivel:'bloqueio'|'espera'|'ok'|'info', texto }], resumo }.
 */
export function explicarPendente(envio, ctx = {}) {
  const { cfg = {}, agora = Date.now() } = ctx;
  const hoje = ctx.hoje || agoraSP(new Date(agora));
  const passos = [];
  const add = (nivel, texto) => passos.push({ nivel, texto });
  if (!envio || envio.status !== 'pendente') return { quando: null, passos: [{ nivel: 'info', texto: 'Esta mensagem não está na fila (já saiu, falhou ou foi cancelada).' }], resumo: 'Não está na fila.' };

  if (envio.enviando_em) add('info', 'Está sendo enviada agora pelo carteiro.');
  const programada = Date.parse(envio.enviar_em);
  if (Number.isFinite(programada) && programada > agora) add('espera', `Está programada para ${new Date(programada).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — o carteiro só olha para ela depois dessa hora.`);
  if (envio.motivo_pulado && /^adiado/i.test(envio.motivo_pulado)) add('espera', `O carteiro adiou: ${envio.motivo_pulado.replace(/^adiado:\s*/i, '')}.`);
  if (envio.expira_em && Date.parse(envio.expira_em) < agora) add('bloqueio', 'Passou da validade: na próxima rodada vira "pulada" (perdeu o sentido).');
  if (ctx.clienteFora) add('bloqueio', 'O cliente pediu para não receber mensagens: ela será pulada e nunca sai.');
  if (!soDigitos(envio.telefone) || soDigitos(envio.telefone).length < 10) add('bloqueio', 'Telefone inválido: não dá para enviar.');

  if (cfg.pausa_geral) add('bloqueio', 'A PAUSA GERAL está ligada (Réguas › Envio): nada sai até desligar.');
  if (hoje.hora < cfg.janela_inicio || hoje.hora >= cfg.janela_fim) add('espera', `Fora da janela de envio (${cfg.janela_inicio}h às ${cfg.janela_fim}h): sai quando a janela abrir.`);
  if (hoje.diaSemana === 0 && !cfg.envia_domingo) add('espera', 'Hoje é domingo e o envio aos domingos está desligado.');
  if (cfg.so_horario_comercial && (hoje.diaSemana === 0 || hoje.hora < 8 || (hoje.hora * 60 + hoje.minuto) >= 17 * 60 + 30)) add('espera', 'O modo "só horário da loja" está ligado (seg–sáb, 8h–17h30).');
  if (ctx.feriado && (ctx.tiposSeguramFeriado || []).includes(envio.tipo)) add('espera', `Hoje é feriado (${ctx.feriado}): este tipo espera o próximo dia útil.`);

  const estado = ctx.whatsapp?.estado;
  if (estado && estado !== 'ok') add('bloqueio', `O WhatsApp está com problema (${String(estado).replace(/_/g, ' ')})${ctx.whatsapp?.motivo ? `: ${ctx.whatsapp.motivo}` : ''}. A mensagem fica na fila e NÃO é perdida nem reenviada em dobro.`);
  if (Number(cfg.limite_por_hora) && ctx.enviadasHora >= cfg.limite_por_hora) add('espera', `O limite de ${cfg.limite_por_hora} mensagens por hora foi atingido (saíram ${ctx.enviadasHora}).`);
  if (Number(cfg.limite_por_dia) && ctx.enviadasHoje >= cfg.limite_por_dia) add('espera', `O limite de ${cfg.limite_por_dia} mensagens por dia foi atingido: o resto sai amanhã.`);
  if (Number(ctx.aFrente) > 0) add('espera', `Tem ${ctx.aFrente} mensagem(ns) de prioridade igual ou maior na frente (a fila sai por prioridade e depois pela hora).`);

  const operacional = envio.tipo === 'lembrete' || envio.tipo === 'remarcacao' || String(envio.tipo).startsWith('patio_');
  if (!operacional) {
    const min = Number(cfg.intervalo_mesmo_cliente_min) || 0;
    if (min && ctx.ultimoDoCliente && agora - ctx.ultimoDoCliente < min * 60000) add('espera', `Outra mensagem para este cliente saiu há ${Math.max(1, Math.round((agora - ctx.ultimoDoCliente) / 60000))} min; espera completar ${min} min.`);
    if ((ctx.maxPorDia || 3) > 0 && (ctx.hojeDoCliente || 0) >= (ctx.maxPorDia || 3)) add('espera', `Este cliente já recebeu ${ctx.hojeDoCliente} ${ctx.hojeDoCliente === 1 ? 'mensagem' : 'mensagens'} hoje (o teto é ${ctx.maxPorDia || 3}): sai no próximo dia útil.`);
  }
  const s = ctx.situacao || {};
  if (TIPOS_AUTOMATICOS_RELACIONAMENTO.has(envio.tipo)) {
    const b = bloqueioDeRelacionamento(envio, s, cfg, agora);
    if (b.acao === 'adiar') add('espera', `Segurada de propósito: ${b.motivo}.`);
  }
  if (envio.tipo === 'lembrete' && ctx.osDoLembrete) {
    const c = conferirLembreteComOrdem(envio, ctx.osDoLembrete);
    if (c.acao === 'pular') add('bloqueio', `Será pulada: ${c.motivo}.`);
  }
  // conferências de AGORA com os outros sistemas (Pátio, Orçador, Agenda, Atendimento): as mesmas que o carteiro faz antes de enviar
  for (const c of ctx.conferencias || []) if (c && c.texto) add(c.nivel === 'espera' ? 'espera' : 'bloqueio', c.texto);
  if (ctx.repetido) add('bloqueio', 'O mesmo texto já foi para este número há pouco (pelo Comunicar ou pelo Atendimento): será pulada para não repetir.');

  const bloqueios = passos.filter((p) => p.nivel === 'bloqueio').length;
  const esperas = passos.filter((p) => p.nivel === 'espera').length;
  if (!bloqueios && !esperas && !envio.enviando_em) add('ok', 'Nada a segura: sai na próxima rodada do carteiro (a cada 5 a 15 minutos, dentro da janela).');
  const resumo = bloqueios ? 'Segurada: vai ser pulada ou depende de você resolver.' : esperas ? 'Esperando o momento certo.' : 'Pronta para sair.';
  return { quando: Number.isFinite(programada) ? new Date(programada).toISOString() : null, passos, resumo, bloqueios, esperas };
}

// ----------------------------------------------------------------------------
// OPERAÇÃO — agenda de envios (o que sai em cada dia e hora)
// ----------------------------------------------------------------------------
/**
 * Agrupa as pendentes por dia (fuso da oficina) com o teto diário, domingo/feriado e as atrasadas.
 * { dias: [{ data, total, atrasadas, porTipo, porHora, excede, domingo, feriado, itens }], atrasadas, total }
 */
export function montarAgendaDeEnvios(pendentes = [], cfg = {}, hojeIso, { feriado = () => null, agora = Date.now(), maxItens = 40 } = {}) {
  const mapa = new Map();
  let atrasadas = 0;
  for (const e of pendentes) {
    const quando = Date.parse(e.enviar_em);
    if (!Number.isFinite(quando)) continue;
    const dia = diaSP(e.enviar_em);
    const atrasada = quando < agora - 2 * 3600000;
    const chave = dia < hojeIso ? hojeIso : dia;
    let d = mapa.get(chave);
    if (!d) {
      const dow = new Date(`${chave}T12:00:00`).getDay();
      d = { data: chave, total: 0, atrasadas: 0, porTipo: {}, porHora: {}, domingo: dow === 0, feriado: feriado(chave) || null, itens: [] };
      mapa.set(chave, d);
    }
    d.total++; d.porTipo[e.tipo] = (d.porTipo[e.tipo] || 0) + 1;
    if (atrasada) { d.atrasadas++; atrasadas++; }
    const h = String(agoraSP(new Date(Math.max(quando, instanteSP(chave, '00:00').getTime()))).hora).padStart(2, '0');
    d.porHora[h] = (d.porHora[h] || 0) + 1;
    if (d.itens.length < maxItens) d.itens.push({ id: e.id, nome: e.nome, telefone: e.telefone, tipo: e.tipo, enviar_em: e.enviar_em, corpo: String(e.corpo || '').slice(0, 140), motivo_pulado: e.motivo_pulado || null });
  }
  const limite = Number(cfg.limite_por_dia) || 300;
  const dias = [...mapa.values()].sort((a, b) => (a.data < b.data ? -1 : 1)).map((d) => ({
    ...d, limite, excede: d.total > limite, seguraPorCalendario: (d.domingo && !cfg.envia_domingo) || !!d.feriado,
    itens: d.itens.sort((a, b) => (a.enviar_em < b.enviar_em ? -1 : 1)),
  }));
  return { dias, atrasadas, total: pendentes.length, limite };
}

/** Pode adiar a mensagem para `quandoIso`? Não passa da validade, não vai para o passado distante. */
export function validarAdiamento(envio, quandoIso, agora = Date.now()) {
  const q = Date.parse(quandoIso);
  if (!Number.isFinite(q)) return { ok: false, erro: 'Escolha uma data e hora válidas.' };
  if (!envio || envio.status !== 'pendente') return { ok: false, erro: 'Só dá para mudar o horário de mensagem que ainda não saiu.' };
  if (envio.enviando_em) return { ok: false, erro: 'Essa mensagem está sendo enviada agora.' };
  if (q < agora - 60000) return { ok: false, erro: 'Escolha um horário que ainda não passou.' };
  if (q > agora + 60 * 86400000) return { ok: false, erro: 'No máximo 60 dias à frente.' };
  if (envio.expira_em && q > Date.parse(envio.expira_em)) return { ok: false, erro: 'Esse horário passa da validade da mensagem — ela perderia o sentido. Cancele ou escolha antes.' };
  return { ok: true, quando: new Date(q).toISOString() };
}

// ----------------------------------------------------------------------------
// RESULTADOS — resposta → agendou → voltou → faturou (última mensagem recebida leva o crédito)
// ----------------------------------------------------------------------------
const chavesDe = (x) => {
  const k = [];
  if (x.cliente_id) k.push(`c:${x.cliente_id}`);
  const t = telefoneNacional(x.telefone || x.cliente_telefone);
  if (t && t.length >= 10) k.push(`t:${t}`);
  return k;
};
const ATENDIDO = new Set(['concluido', 'compareceu', 'em_atendimento', 'nao_fechou']);

/**
 * envios = enviados no período [{ id, tipo, cliente_id, telefone, enviado_em, respondido_em, agendou_depois_id, lote }]
 * eventos = { agendamentos:[{id,cliente_id,telefone,data,status,valor,created_at}], os:[{id,cliente_id,telefone,created_at,etapa}],
 *             orcamentos:[{id,cliente_id,cliente_telefone,status,total,decidido_em,agendamento_id}],
 *             leads:[{id,cliente_id,telefone,status,valor_pago,closed_at}] }
 * Cada evento vai para a ÚLTIMA mensagem enviada ao cliente antes dele, dentro da janela (dias).
 * Faturou = o MAIOR entre agendamentos concluídos, leads concluídos e orçamentos aprovados (o mesmo serviço
 * aparece nos três: somar contaria em dobro — a ficha 360 usa a mesma regra).
 */
export function atribuirResultados({ envios = [], eventos = {}, janelaDias = 30 } = {}) {
  const porChave = new Map();
  for (const e of envios) {
    const t = Date.parse(e.enviado_em);
    if (!Number.isFinite(t)) continue;
    for (const k of chavesDe(e)) { if (!porChave.has(k)) porChave.set(k, []); porChave.get(k).push({ id: e.id, t }); }
  }
  for (const l of porChave.values()) l.sort((a, b) => a.t - b.t);
  const j = janelaDias * 86400000;
  const donoDe = (alvo, quandoMs) => {
    if (!Number.isFinite(quandoMs)) return null;
    let melhor = null;
    for (const k of chavesDe(alvo)) {
      for (const c of porChave.get(k) || []) if (c.t <= quandoMs && quandoMs - c.t <= j && (!melhor || c.t > melhor.t)) melhor = c;
    }
    return melhor?.id || null;
  };
  const r = new Map(envios.map((e) => [e.id, { respondeu: !!e.respondido_em, agendou: !!e.agendou_depois_id, voltou: false, aprovou: false, fAg: 0, fLead: 0, fOrc: 0, faturou: 0 }]));
  const get = (id) => (id ? r.get(id) : null);
  for (const a of eventos.agendamentos || []) {
    if (a.status === 'cancelado') continue;
    const criado = get(donoDe(a, Date.parse(a.created_at)));
    if (criado) criado.agendou = true;
    if (ATENDIDO.has(a.status)) {
      const dono = get(donoDe(a, Date.parse(`${a.data}T12:00:00-03:00`)));
      if (dono) { dono.voltou = true; if (a.status === 'concluido') dono.fAg += Number(a.valor) || 0; }
    }
  }
  for (const o of eventos.os || []) {
    const dono = get(donoDe(o, Date.parse(o.created_at)));
    if (dono) dono.voltou = true;
  }
  for (const q of eventos.orcamentos || []) {
    if (q.status !== 'aprovado') continue;
    const dono = get(donoDe(q, Date.parse(q.decidido_em)));
    if (dono) { dono.aprovou = true; dono.voltou = true; dono.fOrc += Number(q.total) || 0; }
  }
  for (const l of eventos.leads || []) {
    if (l.status !== 'concluido' || !l.closed_at) continue;
    const dono = get(donoDe(l, Date.parse(l.closed_at)));
    if (dono) { dono.voltou = true; dono.fLead += Number(l.valor_pago) || 0; }
  }
  for (const v of r.values()) v.faturou = Math.max(v.fAg, v.fLead, v.fOrc);
  return r;
}

/** Soma o resultado por tipo (ou por lote): { chave: { enviadas, responderam, agendaram, voltaram, aprovaram, faturou } }. */
export function resumirResultados(envios, porEnvio, agrupar = (e) => e.tipo) {
  const saida = {};
  for (const e of envios) {
    const k = agrupar(e); if (k === null || k === undefined) continue;
    const s = (saida[k] ||= { enviadas: 0, responderam: 0, agendaram: 0, voltaram: 0, aprovaram: 0, faturou: 0 });
    const v = porEnvio.get(e.id) || {};
    s.enviadas++;
    if (v.respondeu) s.responderam++;
    if (v.agendou) s.agendaram++;
    if (v.voltou) s.voltaram++;
    if (v.aprovou) s.aprovaram++;
    s.faturou += Number(v.faturou) || 0;
  }
  for (const s of Object.values(saida)) {
    s.faturou = Math.round(s.faturou * 100) / 100;
    s.taxaResposta = s.enviadas ? Math.round((s.responderam / s.enviadas) * 100) : null;
    s.taxaVoltou = s.enviadas ? Math.round((s.voltaram / s.enviadas) * 100) : null;
    s.porMensagem = s.enviadas ? Math.round((s.faturou / s.enviadas) * 100) / 100 : 0;
  }
  return saida;
}

/** "Hyundai HB20 2019" a partir do veiculo (jsonb) do Orçador; vazio se não houver nada. */
export function descreverCarro(v) {
  if (!v || typeof v !== 'object') return '';
  return [v.montadora, v.modelo, v.ano].filter((x) => x !== null && x !== undefined && String(x).trim()).join(' ');
}

export const ehUuid = (v) => typeof v === 'string' && UUID.test(v);

/** 'AAAA-MM-DD' que existe no calendário (2026-02-31 e 2026-13-45 não) — senão null. */
export function diaValido(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
