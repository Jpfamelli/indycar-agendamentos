// -----------------------------------------------------------------------------
// Rodada 7 (25/10/2026) — regras PURAS do Comunicar (sem banco, sem rede), testadas em scripts/testes-rodada7.mjs.
//
//   Reabordar recusados (Orçador)  · repetir campanha pelo MODELO · réguas dos eventos reais
//   (aprovou sem horário, faltou, orçamento vencendo, carro pronto esperando) · prévia exata
//   (quando CADA mensagem sai de verdade) · anti-spam (celular, rodapé PARAR, teto de campanhas,
//   freio automático, horário de marketing) · resultados (melhor horário, A/B) · retomada do WhatsApp.
//
// Quem grava é o dados7.js / dados.js / rodada.js; aqui só se decide.
// -----------------------------------------------------------------------------
import { semAcento, telefoneNacional, soDigitos, somarDias, instanteSP, agoraSP } from './dados.js';

const minutos = (a, b) => (a - b) / 60000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----------------------------------------------------------------------------
// ANTI-SPAM — número de celular
// ----------------------------------------------------------------------------
/** DDDs que existem no Brasil. */
export const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * { ok, tipo: 'celular'|'celular_sem_9'|'fixo'|'invalido', motivo?, nacional }
 * Fixo (3º dígito 2–5) não recebe WhatsApp; DDD inexistente, número curto/longo e dígitos repetidos ou em sequência são lixo de digitação.
 */
export function validarCelular(tel) {
  const nacional = telefoneNacional(tel) || '';
  const r = (ok, tipo, motivo) => ({ ok, tipo, ...(motivo ? { motivo } : {}), nacional });
  if (!nacional) return r(false, 'invalido', 'sem telefone');
  if (nacional.length < 10) return r(false, 'invalido', `número curto demais (${nacional.length} dígitos)`);
  if (nacional.length > 11) return r(false, 'invalido', `número longo demais (${nacional.length} dígitos)`);
  const ddd = Number(nacional.slice(0, 2));
  if (!DDDS.has(ddd)) return r(false, 'invalido', `DDD ${nacional.slice(0, 2)} não existe`);
  const assinante = nacional.slice(2);
  if (nacional.length === 11 && assinante[0] !== '9') return r(false, 'invalido', 'celular com 11 dígitos precisa começar com 9 depois do DDD');
  if (nacional.length === 10 && '2345'.includes(assinante[0])) return r(false, 'fixo', 'parece telefone fixo: não recebe WhatsApp');
  const ultimos = assinante.slice(-8);
  if (/^(\d)\1{7}$/.test(ultimos)) return r(false, 'invalido', 'dígitos todos iguais: número de mentira');
  const pas = [...ultimos].map(Number);
  const sobe = pas.every((d, i) => i === 0 || d === pas[i - 1] + 1);
  const desce = pas.every((d, i) => i === 0 || d === pas[i - 1] - 1);
  if (sobe || desce) return r(false, 'invalido', 'sequência de dígitos: número de mentira');
  return r(true, nacional.length === 10 ? 'celular_sem_9' : 'celular');
}

// ----------------------------------------------------------------------------
// ANTI-SPAM — rodapé PARAR, horário de marketing, teto de campanhas, freio
// ----------------------------------------------------------------------------
/** Mensagens "de venda": ganham o rodapé PARAR, ficam fora do fim da tarde e contam no teto de campanhas. */
export const TIPOS_MARKETING = new Set(['campanha', 'area_cliente', 'reativacao', 'aniversario', 'nao_fechou']);
export const ehMarketing = (tipo) => TIPOS_MARKETING.has(tipo);
export const RODAPE_PADRAO = 'Para não receber mais mensagens, responda PARAR.';

/** { corpo, aplicou } — só mensagem de marketing, só uma vez, e o rodapé sobrevive ao limite de 2.000 letras. */
export function aplicarRodape(corpo, tipo, cfg = {}) {
  const texto = String(corpo ?? '');
  if (!ehMarketing(tipo) || cfg.rodape_parar === false) return { corpo: texto, aplicou: false };
  if (/\bparar\b/i.test(texto)) return { corpo: texto, aplicou: false };
  const rodape = String(cfg.texto_rodape_parar || RODAPE_PADRAO).replace(/\s+/g, ' ').trim().slice(0, 140) || RODAPE_PADRAO;
  const sobra = 2000 - rodape.length - 2;
  return { corpo: `${texto.slice(0, sobra).trimEnd()}\n\n${rodape}`, aplicou: true };
}

/** Marketing depois do horário limite (padrão 18h) espera o dia seguinte. */
export function decidirHorarioMarketing({ tipo, hora, fim = 18 } = {}) {
  if (!ehMarketing(tipo)) return { segura: false };
  const limite = Number(fim) || 18;
  if (hora >= limite) return { segura: true, motivo: `mensagem de campanha/relacionamento não sai depois das ${limite}h: espera o próximo dia` };
  return { segura: false };
}

/** Teto de campanhas por cliente em 30 dias (0 = sem teto). `recebidas` = campanhas enviadas ou na fila nos últimos 30 dias. */
export function decidirTetoCampanhas({ tipo, recebidas = 0, max = 3 } = {}) {
  if (!['campanha', 'area_cliente'].includes(tipo)) return { segura: false };
  const m = Number(max);
  if (!(m > 0)) return { segura: false };
  if ((Number(recebidas) || 0) >= m) return { segura: true, motivo: `já recebeu ${recebidas} ${recebidas === 1 ? 'campanha' : 'campanhas'} nos últimos 30 dias (teto: ${m})` };
  return { segura: false };
}

/** Freio automático: muita gente pedindo PARAR de uma mesma campanha = pare tudo que falta e chame o gestor. */
export function freioDaCampanha({ enviadas = 0, pararam = 0, minEnvios = 20, pct = 5 } = {}) {
  const p = Number(pct);
  if (!(p > 0)) return { freiar: false, taxa: null };
  const taxa = enviadas ? Math.round((pararam / enviadas) * 1000) / 10 : 0;
  if (enviadas < (Number(minEnvios) || 20)) return { freiar: false, taxa, motivo: `poucos envios para julgar (${enviadas} de ${minEnvios})` };
  if (taxa >= p) return { freiar: true, taxa, motivo: `${pararam} de ${enviadas} (${String(taxa).replace('.', ',')}%) pediram para parar — passou de ${p}%` };
  return { freiar: false, taxa };
}

/** O mesmo número, o mesmo texto, em poucos minutos: duplo clique. `recentes` = [{ telefone, corpo, quando }] */
export function ehMensagemDuplicada({ telefone, corpo, recentes = [], minutos: janela = 10, agora = Date.now() } = {}) {
  if (!(janela > 0)) return null;
  const t = telefoneNacional(telefone);
  const c = semAcento(String(corpo || '')).replace(/\s+/g, ' ').trim();
  for (const r of recentes) {
    if (telefoneNacional(r.telefone) !== t) continue;
    if (!Number.isFinite(r.quando) || agora - r.quando > janela * 60000) continue;
    if (semAcento(String(r.corpo || '')).replace(/\s+/g, ' ').trim() === c) return r;
  }
  return null;
}

/** Espelho do gatilho r7_c5_voltar_pelo_whatsapp: VOLTAR / "quero receber" / "pode mandar" sozinhos. */
export function ehPedidoDeVoltar(texto) {
  const t = String(texto ?? '').toLowerCase().trim();
  return /^[^\p{L}\p{N}]*(voltar|pode voltar|quero voltar a receber|quero receber|pode mandar|pode enviar|reativar|reativa)[^\p{L}\p{N}]*$/u.test(t);
}

// ----------------------------------------------------------------------------
// REABORDAR RECUSADOS (Orçador → Comunicar)
// ----------------------------------------------------------------------------
export const MOTIVOS_RECUSA = {
  preco: 'o valor', prazo: 'o prazo', sem_urgencia: 'sem urgência', sem_motivo: 'sem motivo informado',
};
export const chaveReabordar = (orcId) => `reabordar:orc:${orcId}`;
/** Variáveis aceitas nos textos de reabordagem. Preço, desconto e prazo prometido NUNCA entram (a IA/ninguém inventa). */
export const VARS_REABORDAR = ['nome', 'primeiro_nome', 'carro', 'placa', 'servico'];
export const MODELOS_REABORDAR = {
  preco: 'Oi, {primeiro_nome}! Aqui é da IndyCar. Vi que o orçamento do {carro} não fechou na época. Se o valor foi o que pesou, me conta o que ficou apertado: a gente revê as opções com você (peças, forma de pagamento) para caber. Posso te ajudar? 🏎',
  prazo: 'Oi, {primeiro_nome}! Aqui é da IndyCar. Lembrei do orçamento do {carro}: se o prazo foi o problema, abriram horários novos esta semana. Quer que eu veja um dia que encaixe na sua rotina? 🏎',
  sem_urgencia: 'Oi, {primeiro_nome}! Aqui é da IndyCar. Passando só para lembrar que o orçamento do {carro} continua com a gente. Quando fizer sentido retomar, é só responder aqui que eu preparo tudo. 🏎',
  sem_motivo: 'Oi, {primeiro_nome}! Aqui é da IndyCar. Ficou alguma dúvida sobre o orçamento do {carro}? Se ainda faz sentido, a gente atualiza e agenda um horário com você. É só responder aqui. 🏎',
};
const MOTIVO_NORMAL = (m) => (Object.keys(MOTIVOS_RECUSA).includes(m) ? m : 'sem_motivo');

/**
 * lista = o que orc_recusados_recuperaveis devolve (jsonb). Fora: sem telefone, sem nome do carro quebrado, já reabordado.
 * Devolve { candidatos, porMotivo: { motivo: { n, valor } }, valorTotal, fora: { sem_telefone, ja_reabordado, repetido } }
 */
export function prepararRecusados(lista = [], { jaReabordados = new Set() } = {}) {
  const candidatos = [], fora = { sem_telefone: 0, ja_reabordado: 0, repetido: 0 };
  const porMotivo = {};
  const vistos = new Set();
  for (const o of Array.isArray(lista) ? lista : []) {
    if (!o || typeof o !== 'object') continue;
    const tel = telefoneNacional(o.telefone_55);
    if (!tel || tel.length < 10) { fora.sem_telefone++; continue; }
    if (jaReabordados.has(String(o.id))) { fora.ja_reabordado++; continue; }
    if (vistos.has(tel)) { fora.repetido++; continue; }
    vistos.add(tel);
    const motivo = MOTIVO_NORMAL(o.motivo);
    const valor = Number(o.valor) || 0;
    (porMotivo[motivo] ||= { n: 0, valor: 0 });
    porMotivo[motivo].n++; porMotivo[motivo].valor = Math.round((porMotivo[motivo].valor + valor) * 100) / 100;
    candidatos.push({
      orcamento_id: String(o.id), numero: o.numero ?? null, cliente_id: UUID.test(String(o.cliente_id || '')) ? o.cliente_id : null,
      nome: String(o.nome || '').trim() || null, telefone: tel, carro: o.carro || '', placa: o.placa || '', servico: '',
      motivo, valor, dias_desde: Number(o.dias_desde) || 0, link: o.link || null, chave_unica: chaveReabordar(o.id),
    });
  }
  const valorTotal = Math.round(candidatos.reduce((s, c) => s + c.valor, 0) * 100) / 100;
  return { candidatos, porMotivo, valorTotal, fora };
}

/** Pura: o texto de reabordagem é seguro? (variável que existe, sem R$/desconto, sem "prezado"). Devolve o erro ou null. */
export function validarTextoReabordar(texto) {
  const t = String(texto ?? '').trim();
  if (t.length < 20) return 'Escreva pelo menos uma frase.';
  if (t.length > 1000) return 'No máximo 1000 letras.';
  const usadas = [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const x = usadas.find((v) => !VARS_REABORDAR.includes(v));
  if (x) return `A variável {${x}} não existe aqui (use ${VARS_REABORDAR.map((v) => `{${v}}`).join(', ')}).`;
  if (/R\$|\breais?\b|\d+\s?%|desconto|promo[cç][aã]o|gr[aá]tis/i.test(t)) return 'Não prometa preço, desconto ou promoção por aqui: o valor quem fala é o consultor.';
  if (/prezad|efetuar|comparecer|ve[ií]culo/i.test(t)) return 'Evite "prezado", "efetuar", "comparecer" e "veículo": fale como a casa fala.';
  if (/\{[^}]*$|^[^{]*\}/.test(t.replace(/\{\w+\}/g, ''))) return 'Tem uma chave { } solta no texto.';
  return null;
}

// ----------------------------------------------------------------------------
// RÉGUAS DOS EVENTOS REAIS
// ----------------------------------------------------------------------------
export const R7_REGUAS = [
  { id: 'aprovou', emoji: '✅', rotulo: 'Aprovou, falta o horário', fonte: 'orcador', param: 'horas_aprovou', unidade: 'horas', faixa: [1, 72],
    explica: 'Orçamento aprovado no Orçador e ainda sem horário na Agenda: depois de N horas, convida para marcar.' },
  { id: 'faltou', emoji: '🔄', rotulo: 'Faltou ao horário', fonte: 'agenda', param: 'horas_faltou', unidade: 'horas', faixa: [1, 48],
    explica: 'Cliente que não veio ao horário da Agenda: depois de N horas, convida a remarcar (sem cobrança).' },
  { id: 'vencendo', emoji: '⏳', rotulo: 'Orçamento vencendo', fonte: 'orcador', param: 'dias_vencendo', unidade: 'dias', faixa: [1, 7],
    explica: 'Orçamento enviado, ainda sem decisão, que vence em até N dia(s): avisa a validade com o link.' },
  { id: 'pronto_lembrete', emoji: '🔑', rotulo: 'Carro pronto esperando', fonte: 'patio', param: 'horas_pronto_lembrete', unidade: 'horas', faixa: [4, 168],
    explica: 'Carro pronto no Pátio e não retirado: depois de N horas, um lembrete com o link de acompanhar (só depois do aviso de pronto ter saído).' },
];
export const TEXTOS_R7 = {
  msg_aprovou: { rotulo: 'Aprovou, falta o horário', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico'], obrigatorias: [] },
  msg_faltou: { rotulo: 'Faltou ao horário', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'quando'], obrigatorias: [] },
  msg_vencendo: { rotulo: 'Orçamento vencendo', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'validade', 'link_orcamento'], obrigatorias: ['link_orcamento'] },
  msg_pronto_lembrete: { rotulo: 'Carro pronto esperando', vars: ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'link_os'], obrigatorias: ['link_os'] },
};
export const BOOLEANOS_R7 = ['ativo_aprovou', 'ativo_faltou', 'ativo_vencendo', 'ativo_pronto_lembrete', 'rodape_parar', 'validar_celular', 'retomada_so_essencial'];
export const FAIXAS_R7 = {
  horas_aprovou: [1, 72], horas_faltou: [1, 48], dias_vencendo: [1, 7], horas_pronto_lembrete: [4, 168],
  max_campanhas_30d: [0, 30], freio_optout_pct: [0, 50], freio_min_envios: [5, 500], retomada_max_30min: [1, 100], retomada_max_2h: [1, 300],
  marketing_fim: [8, 24], dedupe_avulsa_min: [0, 120],
};
export const PADRAO_R7 = {
  horas_aprovou: 4, horas_faltou: 2, dias_vencendo: 1, horas_pronto_lembrete: 24, max_campanhas_30d: 3, freio_optout_pct: 5, freio_min_envios: 20,
  retomada_max_30min: 8, retomada_max_2h: 25, marketing_fim: 18, dedupe_avulsa_min: 10,
};

/** Texto de régua nova válido? Devolve a mensagem em português ou null. */
export function validarTextoR7(campo, texto) {
  const def = TEXTOS_R7[campo];
  if (!def) return null;
  const t = String(texto ?? '').trim();
  if (t.length < 10) return `${def.rotulo}: escreva pelo menos uma frase.`;
  if (t.length > 1000) return `${def.rotulo}: no máximo 1000 letras.`;
  const usadas = [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const x = usadas.find((v) => !def.vars.includes(v));
  if (x) return `${def.rotulo}: a variável {${x}} não existe aqui (use ${def.vars.map((v) => `{${v}}`).join(', ')}).`;
  const falta = def.obrigatorias.find((v) => !usadas.includes(v));
  if (falta) return `${def.rotulo}: o texto precisa ter {${falta}} — sem o link o cliente não consegue abrir.`;
  if (/\{[^}]*$|^[^{]*\}/.test(t.replace(/\{\w+\}/g, ''))) return `${def.rotulo}: tem uma chave { } solta no texto.`;
  if (/R\$|\d+\s?%\s*(de )?desconto|desconto de/i.test(t)) return `${def.rotulo}: não prometa preço nem desconto pela mensagem.`;
  if (/prezad|efetuar|comparecer|ve[ií]culo/i.test(t)) return `${def.rotulo}: evite "prezado", "efetuar", "comparecer" e "veículo" — fale como a casa fala (use "carro").`;
  return null;
}

export const chaveAprovou = (orcId) => `aprovou:orc:${orcId}`;
export const chaveFaltou = (agId) => `faltou:${agId}`;
export const chaveVencendo = (orcId) => `orcamento:vencendo:${orcId}`;
export const chaveProntoLembrete = (osId) => `patio_pronto_lembrete:${osId}`;

/**
 * Orçamento aprovado há N horas (e até 7 dias) sem horário na Agenda e sem ordem no Pátio.
 *   orc = { id, status, decidido_em, agendamento_id, cliente_telefone }
 *   ctx = { agora, horas, temAgendamentoDepois: boolean, temOrdem: boolean }
 */
export function decidirAprovou(orc, { agora = Date.now(), horas = 4, temAgendamentoDepois = false, temOrdem = false } = {}) {
  if (!orc || orc.status !== 'aprovado' || !orc.decidido_em) return { elegivel: false, motivo: 'não está aprovado' };
  if (orc.agendamento_id) return { elegivel: false, motivo: 'já tem horário na Agenda' };
  if (temAgendamentoDepois) return { elegivel: false, motivo: 'o cliente já marcou um horário depois de aprovar' };
  if (temOrdem) return { elegivel: false, motivo: 'o carro já tem ordem no Pátio' };
  const h = minutos(agora, Date.parse(orc.decidido_em)) / 60;
  if (!Number.isFinite(h)) return { elegivel: false, motivo: 'data de aprovação inválida' };
  if (h < horas) return { elegivel: false, motivo: `aprovou há menos de ${horas} h` };
  if (h > 7 * 24) return { elegivel: false, motivo: 'aprovou há mais de 7 dias: o convite perdeu o sentido' };
  return { elegivel: true, chave: chaveAprovou(orc.id), horasDesde: Math.floor(h) };
}
/** Na hora de sair: se o cliente marcou horário (ou a ordem abriu) enquanto a mensagem esperava, ela não vai. */
export function conferirAprovou(envio, orc, { temAgendamentoDepois = false, temOrdem = false } = {}) {
  if (!orc) return { acao: 'pular', motivo: 'o orçamento foi apagado no Orçador' };
  if (orc.status !== 'aprovado') return { acao: 'pular', motivo: `o orçamento ${orc.numero ? `nº ${orc.numero} ` : ''}não está mais aprovado` };
  if (orc.agendamento_id || temAgendamentoDepois) return { acao: 'pular', motivo: 'o cliente já marcou o horário' };
  if (temOrdem) return { acao: 'pular', motivo: 'o carro já tem ordem aberta no Pátio' };
  return { acao: 'enviar' };
}

/**
 * Faltou ao horário (status nao_veio): N horas depois da hora marcada e até 48 h. Se marcou outro horário, não incomoda.
 *   ag = { id, status, data, hora, cliente_id, telefone }
 */
export function decidirFaltou(ag, { agora = Date.now(), horas = 2, remarcou = false } = {}) {
  if (!ag || ag.status !== 'nao_veio') return { elegivel: false, motivo: 'não faltou' };
  if (remarcou) return { elegivel: false, motivo: 'o cliente já marcou outro horário' };
  const hora = String(ag.hora || '08:00').slice(0, 5);
  const quando = instanteSP(String(ag.data).slice(0, 10), hora).getTime();
  if (!Number.isFinite(quando)) return { elegivel: false, motivo: 'data inválida' };
  const h = (agora - quando) / 3600000;
  if (h < horas) return { elegivel: false, motivo: `faltou há menos de ${horas} h` };
  if (h > 48) return { elegivel: false, motivo: 'faltou há mais de 48 h' };
  return { elegivel: true, chave: chaveFaltou(ag.id) };
}
export function conferirFaltou(envio, ag, { remarcou = false } = {}) {
  if (!ag) return { acao: 'pular', motivo: 'o horário foi apagado da Agenda' };
  if (ag.status !== 'nao_veio') return { acao: 'pular', motivo: ag.status === 'concluido' ? 'o cliente apareceu depois' : 'a Agenda mudou o horário depois da falta' };
  if (remarcou) return { acao: 'pular', motivo: 'o cliente já marcou outro horário' };
  return { acao: 'enviar' };
}

/**
 * Orçamento enviado, sem decisão, que vence em até N dias (a partir de hoje). Não repete se o lembrete de "parado" saiu nas últimas 24 h.
 *   orc = { id, status, validade, decidido_em, token_publico }
 */
export function decidirVencendo(orc, { hojeIso, dias = 1, lembreteParadoEm = null, agora = Date.now() } = {}) {
  if (!orc || orc.status !== 'enviado' || orc.decidido_em) return { elegivel: false, motivo: 'já foi decidido' };
  const v = orc.validade ? String(orc.validade).slice(0, 10) : null;
  if (!v) return { elegivel: false, motivo: 'sem validade' };
  if (v < hojeIso) return { elegivel: false, motivo: 'já venceu' };
  if (v > somarDias(hojeIso, dias)) return { elegivel: false, motivo: `só vence depois de ${dias} dia(s)` };
  if (lembreteParadoEm && agora - Date.parse(lembreteParadoEm) < 24 * 3600000) return { elegivel: false, motivo: 'o lembrete de orçamento parado saiu há menos de 24 h' };
  return { elegivel: true, chave: chaveVencendo(orc.id), validade: v };
}
export function conferirVencendo(envio, orc, hojeIso) {
  if (!orc) return { acao: 'pular', motivo: 'o orçamento foi apagado no Orçador' };
  if (orc.status !== 'enviado' || orc.decidido_em) return { acao: 'pular', motivo: `o orçamento ${orc.numero ? `nº ${orc.numero} ` : ''}já foi decidido` };
  if (orc.validade && String(orc.validade).slice(0, 10) < hojeIso) return { acao: 'pular', motivo: 'o orçamento já venceu' };
  return { acao: 'enviar' };
}

/**
 * Carro PRONTO e não retirado há N horas: um lembrete (uma vez por ordem), só se o aviso de pronto já saiu e a ordem ainda está em "pronto".
 *   os = { id, etapa, etapa_em }   avisos = [{ status, chave_unica }]
 */
export function decidirProntoLembrete(os, avisos = [], { agora = Date.now(), horas = 24 } = {}) {
  if (!os || os.etapa !== 'pronto') return { elegivel: false, motivo: 'o carro não está em "pronto"' };
  const h = (agora - Date.parse(os.etapa_em)) / 3600000;
  if (!Number.isFinite(h)) return { elegivel: false, motivo: 'sem a hora em que ficou pronto' };
  if (h < horas) return { elegivel: false, motivo: `pronto há menos de ${horas} h` };
  if (h > 14 * 24) return { elegivel: false, motivo: 'pronto há mais de 14 dias: caso para a equipe' };
  const meus = avisos.filter((a) => !String(a.chave_unica || '').startsWith('patio_pronto_lembrete:'));
  if (!meus.some((a) => a.status === 'enviado')) return { elegivel: false, motivo: 'o aviso de pronto ainda não saiu' };
  return { elegivel: true, chave: chaveProntoLembrete(os.id), horasProntoFim: Math.floor(h) };
}

// ----------------------------------------------------------------------------
// QUANDO CADA MENSAGEM SAI DE VERDADE (prévia exata, agenda por hora, plano de retomada)
// ----------------------------------------------------------------------------
const PRIORIDADE = {
  patio_pronto: 1, patio_extra: 2, lembrete: 3, remarcacao: 3, patio_entrada: 4, avaliacao: 5, posvenda: 6,
  area_cliente: 7, avulsa: 8, aprovou: 8, faltou: 8, retorno: 9, orcamento: 10, nao_fechou: 11, aniversario: 12, reativacao: 13, campanha: 14,
};
const prio = (t) => PRIORIDADE[t] ?? 20;
const SEGURAM_FERIADO = new Set(['posvenda', 'retorno', 'reativacao', 'orcamento', 'nao_fechou']);
const OPERACIONAL = (t) => t === 'lembrete' || t === 'remarcacao' || String(t || '').startsWith('patio_');
const ESSENCIAL = (t) => OPERACIONAL(t) || ['avaliacao', 'posvenda', 'aprovou', 'faltou', 'avulsa'].includes(t);
/** O que sai mesmo na retomada do WhatsApp: o dia a dia da oficina. Campanha e relacionamento esperam. */
export const ehEssencial = ESSENCIAL;
export const MINUTOS_DAS_RODADAS = [5, 20, 35, 50];   // o pg_cron do carteiro (hora cheia + 5, 20, 35, 50)
export const LOTE_MAX = 25;

function aberto(ms, cfg, feriadoFn) {
  const { hora, minuto, diaSemana } = agoraSP(new Date(ms));
  if (hora < (cfg.janela_inicio ?? 8) || hora >= (cfg.janela_fim ?? 20)) return false;
  if (diaSemana === 0 && !cfg.envia_domingo) return false;
  if (cfg.so_horario_comercial) {
    if (diaSemana === 0) return false;
    const m = hora * 60 + minuto;
    if (m < 8 * 60 || m >= 17 * 60 + 30) return false;
  }
  return true;
}
/** Próxima rodada do carteiro (minutos 5, 20, 35 e 50 de cada hora) a partir de `ms`. */
export function proximaRodada(ms) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  for (let i = 0; i < 61; i++) {
    const t = new Date(d.getTime() + i * 60000);
    if (MINUTOS_DAS_RODADAS.includes(t.getUTCMinutes()) && t.getTime() >= ms) return t.getTime();
  }
  return ms;
}

/**
 * Simula a fila do carteiro, rodada a rodada, com as MESMAS regras da vida real: janela, domingo, feriado (réguas que esperam),
 * horário de marketing, limites por hora/dia/minuto, lote de 25, intervalo e teto por cliente no dia, retomada gradual.
 * fila = [{ id, tipo, telefone, enviar_em, expira_em?, ... }]. Devolve { saidas: Map(id → {saiEm, rodada, posicao}), sem: [{id,motivo}], rodadas }.
 */
export function simularSaidas(fila = [], { agora = Date.now(), cfg = {}, feriado = () => null, enviadasHoje = 0, enviadasUltimaHora = 0, retomada = null, maxRodadas = 1800 } = {}) {
  const limHora = Math.max(1, Number(cfg.limite_por_hora) || 60), limDia = Math.max(1, Number(cfg.limite_por_dia) || 300), limMin = Math.max(1, Number(cfg.limite_por_minuto) || 10);
  const intervalo = Math.max(0, Number(cfg.intervalo_mesmo_cliente_min ?? 60)), maxCliente = Number(cfg.max_mensagens_cliente_dia) >= 1 ? Number(cfg.max_mensagens_cliente_dia) : 3;
  const pausa = Math.max(1200, Math.ceil(60000 / limMin));
  const pend = fila.map((e) => ({ e, eff: Math.max(Date.parse(e.enviar_em) || agora, agora - 1), prio: prio(e.tipo) }));
  const saidas = new Map(), sem = [];
  const saiuHora = [];          // instantes de saída na última hora (simulados)
  for (let i = 0; i < enviadasUltimaHora; i++) saiuHora.push(agora - 30 * 60000);
  const contagemDia = new Map(), ultimoCliente = new Map();
  const hojeDe = (ms) => agoraSP(new Date(ms)).data;
  const porDia = new Map([[hojeDe(agora), enviadasHoje]]);
  let rodada = proximaRodada(agora), rodadas = 0;
  const comecoRetomada = retomada && retomada.desde ? Number(retomada.desde) : null;
  let desdeVolta = retomada ? (Number(retomada.jaSairam) || 0) : 0;   // quantas já saíram desde a volta do WhatsApp
  while (pend.length && rodadas < maxRodadas) {
    rodadas++;
    if (!aberto(rodada, cfg, feriado)) { rodada = proximaRodada(rodada + 60000); continue; }
    const { hora, data } = agoraSP(new Date(rodada));
    const feriadoHoje = feriado(data);
    // vagas desta rodada
    while (saiuHora.length && rodada - saiuHora[0] >= 3600000) saiuHora.shift();
    let vagas = Math.min(LOTE_MAX, limHora - saiuHora.length, limDia - (porDia.get(data) || 0), limMin * 15);
    let essencial = false;
    if (comecoRetomada) {
      const min = minutos(rodada, comecoRetomada);
      const fase = min < 30 ? retomada.max30 : min < 120 ? retomada.max120 : null;
      if (fase != null) { vagas = Math.min(vagas, fase - desdeVolta); essencial = !!retomada.soEssencial; }
    }
    if (vagas <= 0) { rodada = proximaRodada(rodada + 60000); continue; }
    const elegiveis = pend.filter((p) => p.eff <= rodada).sort((a, b) => (a.prio - b.prio) || (a.eff - b.eff));
    let k = 0, saiuAgora = 0;
    for (const p of elegiveis) {
      if (saiuAgora >= vagas) break;
      const e = p.e, tel = telefoneNacional(e.telefone) || e.id;
      const amanha = () => instanteSP(somarDias(data, 1), `${String(cfg.hora_envio || '09:30').slice(0, 5)}`).getTime();
      if (e.expira_em && Date.parse(e.expira_em) < rodada) { sem.push({ id: e.id, motivo: 'passa da validade antes de sair' }); p.feito = true; continue; }
      if (feriadoHoje && SEGURAM_FERIADO.has(e.tipo)) { p.eff = amanha(); continue; }
      if (essencial && !ESSENCIAL(e.tipo)) { p.eff = rodada + 15 * 60000; continue; }
      if (ehMarketing(e.tipo) && decidirHorarioMarketing({ tipo: e.tipo, hora, fim: cfg.marketing_fim ?? 18 }).segura) { p.eff = amanha(); continue; }
      if (!OPERACIONAL(e.tipo)) {
        const c = contagemDia.get(`${data}|${tel}`) || 0;
        if (c >= maxCliente) { p.eff = amanha(); continue; }
        const ult = ultimoCliente.get(tel);
        if (ult && intervalo && rodada - ult < intervalo * 60000) { p.eff = ult + intervalo * 60000; continue; }
      }
      const saiEm = rodada + k * pausa; k++; saiuAgora++;
      saidas.set(e.id, { saiEm: new Date(saiEm).toISOString(), rodada: new Date(rodada).toISOString(), posicao: saidas.size + 1, dia: data });
      contagemDia.set(`${data}|${tel}`, (contagemDia.get(`${data}|${tel}`) || 0) + 1);
      ultimoCliente.set(tel, saiEm);
      saiuHora.push(saiEm);
      porDia.set(data, (porDia.get(data) || 0) + 1);
      if (retomada) desdeVolta++;
      p.feito = true;
    }
    for (let i = pend.length - 1; i >= 0; i--) if (pend[i].feito) pend.splice(i, 1);
    rodada = proximaRodada(rodada + 60000);
  }
  for (const p of pend) sem.push({ id: p.e.id, motivo: 'não cabe nos próximos dias com os limites de hoje' });
  return { saidas, sem, rodadas };
}

/** Agrupa as saídas simuladas por hora cheia do dia pedido (fuso da oficina): [{ hora, total, porTipo }]. */
export function saidasPorHora(fila, saidas, dia) {
  const horas = new Map();
  for (const e of fila) {
    const s = saidas.get(e.id);
    if (!s || s.dia !== dia) continue;
    const h = agoraSP(new Date(s.saiEm)).hora;
    const x = horas.get(h) || { hora: h, total: 0, porTipo: {} };
    x.total++; x.porTipo[e.tipo] = (x.porTipo[e.tipo] || 0) + 1;
    horas.set(h, x);
  }
  return [...horas.values()].sort((a, b) => a.hora - b.hora);
}

/** "hoje às 14:20", "amanhã às 09:35", "sexta (30/10) às 09:35" — para dizer ao atendente quando a mensagem sai. */
export function rotuloDeSaida(iso, hojeIso) {
  const p = agoraSP(new Date(iso));
  const hm = `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`;
  if (p.data === hojeIso) return `hoje às ${hm}`;
  if (p.data === somarDias(hojeIso, 1)) return `amanhã às ${hm}`;
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return `${dias[p.diaSemana]} (${p.data.slice(8, 10)}/${p.data.slice(5, 7)}) às ${hm}`;
}

// ----------------------------------------------------------------------------
// RETOMADA DO WHATSAPP
// ----------------------------------------------------------------------------
/** Idade (horas) a partir da qual a mensagem pendente, por tipo, perdeu o sentido depois de uma queda. */
export const SENTIDO_DEPOIS_DA_QUEDA_H = { campanha: 48, area_cliente: 48, avulsa: 36, avaliacao: 36, remarcacao: 12, aniversario: 24, lembrete: 0, aprovou: 72, faltou: 48 };

/**
 * Triagem da fila acumulada: por tipo, quantas estão atrasadas demais e a sugestão (manter/cancelar).
 * pendentes = [{ id, tipo, enviar_em, expira_em }]. Devolve grupos ordenados pelo que mais merece atenção.
 */
export function triarFila(pendentes = [], agora = Date.now()) {
  const grupos = new Map();
  for (const e of pendentes) {
    const g = grupos.get(e.tipo) || { tipo: e.tipo, total: 0, atrasadas: 0, perderamSentido: 0, ids_perderam: [], maisAntigaH: 0 };
    g.total++;
    const h = Math.max(0, (agora - Date.parse(e.enviar_em)) / 3600000);
    if (h >= 1) g.atrasadas++;
    g.maisAntigaH = Math.max(g.maisAntigaH, Math.round(h));
    const lim = SENTIDO_DEPOIS_DA_QUEDA_H[e.tipo];
    const venceu = e.expira_em && Date.parse(e.expira_em) < agora;
    if (venceu || (lim !== undefined && h >= lim && (lim > 0 || h >= 1))) { g.perderamSentido++; g.ids_perderam.push(e.id); }
    grupos.set(e.tipo, g);
  }
  return [...grupos.values()].map((g) => ({
    ...g,
    sugestao: g.perderamSentido ? 'cancelar' : 'manter',
    motivo: g.perderamSentido ? `${g.perderamSentido} de ${g.total} esperam há tempo demais e perderam o sentido` : 'dentro do prazo: sai na retomada',
  })).sort((a, b) => (b.perderamSentido - a.perderamSentido) || (b.total - a.total));
}

/**
 * O plano da retomada: quanto sai em cada fase, em quanto tempo a fila escoa e o que sai primeiro.
 * Usa a simulação rodada a rodada, com o freio da retomada ligado desde `desde` (hora em que o WhatsApp voltou).
 */
export function planoDeRetomada(fila = [], { cfg = {}, agora = Date.now(), desde = agora, jaSairam = 0, feriado = () => null, enviadasHoje = 0, enviadasUltimaHora = 0 } = {}) {
  const retomada = cfg.retomada_gradual === false ? null : { desde, max30: cfg.retomada_max_30min ?? 8, max120: cfg.retomada_max_2h ?? 25, jaSairam, soEssencial: cfg.retomada_so_essencial !== false };
  const sim = simularSaidas(fila, { agora, cfg, feriado, enviadasHoje, enviadasUltimaHora, retomada });
  const saidas = fila.map((e) => ({ e, s: sim.saidas.get(e.id) })).filter((x) => x.s).sort((a, b) => a.s.saiEm.localeCompare(b.s.saiEm));
  const fase = (a, b) => saidas.filter((x) => { const m = minutos(Date.parse(x.s.saiEm), desde); return m >= a && m < b; });
  const porTipo = {};
  for (const e of fila) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
  const ultimo = saidas.length ? saidas[saidas.length - 1].s.saiEm : null;
  return {
    total: fila.length, saem: saidas.length, naoCabem: sim.sem.length,
    primeiraMeiaHora: fase(0, 30).length, ateDuasHoras: fase(30, 120).length, depois: fase(120, Infinity).length,
    primeiraSaida: saidas[0]?.s.saiEm || null, ultimaSaida: ultimo,
    dias: new Set(saidas.map((x) => x.s.dia)).size,
    porTipo, essencialPrimeiro: !!(retomada && retomada.soEssencial),
    comRetomada: !!retomada, semRetomada: undefined,
  };
}

// ----------------------------------------------------------------------------
// RESULTADOS — melhor horário, tempo de resposta, comparação com o período anterior, A/B
// ----------------------------------------------------------------------------
/** Por hora e por dia da semana (fuso da oficina): quantas saíram e quantas responderam. Só diz "melhor" com amostra mínima. */
export function melhorHorario(envios = [], { minimo = 15 } = {}) {
  const porHora = {}, porDia = {};
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  for (const e of envios) {
    if (!e.enviado_em) continue;
    const p = agoraSP(new Date(e.enviado_em));
    const resp = e.respondido_em ? 1 : 0, ag = e.agendou_depois_id || e.agendou ? 1 : 0;
    const h = (porHora[p.hora] ||= { hora: p.hora, enviadas: 0, responderam: 0, agendaram: 0 });
    const d = (porDia[p.diaSemana] ||= { dia: p.diaSemana, rotulo: dias[p.diaSemana], enviadas: 0, responderam: 0, agendaram: 0 });
    for (const x of [h, d]) { x.enviadas++; x.responderam += resp; x.agendaram += ag; }
  }
  const taxa = (x) => ({ ...x, taxaResposta: x.enviadas ? Math.round((x.responderam / x.enviadas) * 1000) / 10 : null });
  const horas = Object.values(porHora).map(taxa).sort((a, b) => a.hora - b.hora);
  const semana = Object.values(porDia).map(taxa).sort((a, b) => a.dia - b.dia);
  const melhor = (lista) => lista.filter((x) => x.enviadas >= minimo).sort((a, b) => (b.taxaResposta - a.taxaResposta) || (b.enviadas - a.enviadas))[0] || null;
  return { horas, semana, melhorHora: melhor(horas), melhorDia: melhor(semana), minimo, suficiente: horas.some((x) => x.enviadas >= minimo) };
}

/** Quantos minutos a mediana dos clientes levou para responder (só quem respondeu). */
export function tempoMedianoDeResposta(envios = []) {
  const t = envios.filter((e) => e.enviado_em && e.respondido_em).map((e) => minutos(Date.parse(e.respondido_em), Date.parse(e.enviado_em))).filter((m) => Number.isFinite(m) && m >= 0).sort((a, b) => a - b);
  if (!t.length) return null;
  const meio = Math.floor(t.length / 2);
  return Math.round(t.length % 2 ? t[meio] : (t[meio - 1] + t[meio]) / 2);
}

/** Variação entre dois períodos: { atual, anterior, delta, pct } (pct nulo se o anterior é zero). */
export function compararPeriodos(atual, anterior) {
  const a = Number(atual) || 0, b = Number(anterior) || 0;
  return { atual: a, anterior: b, delta: Math.round((a - b) * 100) / 100, pct: b ? Math.round(((a - b) / b) * 1000) / 10 : null };
}

/** A/B: divide os destinos de forma estável (o mesmo telefone cai sempre no mesmo lado). */
export function dividirAB(destinos = []) {
  const lado = (d) => {
    const t = telefoneNacional(d.telefone) || String(d.id || '');
    let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 2 === 0 ? 'A' : 'B';
  };
  const A = [], B = [];
  for (const d of destinos) (lado(d) === 'A' ? A : B).push(d);
  // se a divisão ficou muito torta (listas pequenas), equilibra sem repetir ninguém
  while (Math.abs(A.length - B.length) > Math.max(1, Math.floor(destinos.length * 0.1))) {
    if (A.length > B.length) B.push(A.pop()); else A.push(B.pop());
  }
  return { A, B };
}

/** Quem ganhou o A/B: precisa de amostra (30+ cada) e diferença que não seja sorte (z de duas proporções ≥ 1,64). */
export function compararAB(a = {}, b = {}, { minimo = 30 } = {}) {
  const na = Number(a.enviadas) || 0, nb = Number(b.enviadas) || 0;
  const pa = na ? (Number(a.responderam) || 0) / na : 0, pb = nb ? (Number(b.responderam) || 0) / nb : 0;
  const base = { A: { enviadas: na, taxa: Math.round(pa * 1000) / 10 }, B: { enviadas: nb, taxa: Math.round(pb * 1000) / 10 } };
  if (na < minimo || nb < minimo) return { ...base, vencedor: null, motivo: `poucos envios para decidir (${na} e ${nb}; precisa de ${minimo} em cada)` };
  const p = ((Number(a.responderam) || 0) + (Number(b.responderam) || 0)) / (na + nb);
  const ep = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  const z = ep ? (pa - pb) / ep : 0;
  if (Math.abs(z) < 1.64) return { ...base, vencedor: null, z: Math.round(z * 100) / 100, motivo: 'a diferença é pequena demais: pode ser sorte' };
  return { ...base, vencedor: z > 0 ? 'A' : 'B', z: Math.round(z * 100) / 100, motivo: `${z > 0 ? 'A' : 'B'} teve mais respostas, com folga` };
}

/** Respostas de campanha/régua que ninguém atendeu: respondeu há mais de N horas e a conversa não tem saída depois. */
export function respostasSemAtender(envios = [], conversas = new Map(), { agora = Date.now(), horas = 2 } = {}) {
  const lista = [];
  for (const e of envios) {
    if (!e.respondido_em || e.resposta_tipo === 'parar') continue;
    const h = (agora - Date.parse(e.respondido_em)) / 3600000;
    if (h < horas || h > 72) continue;
    const c = conversas.get(telefoneNacional(e.telefone)) || null;
    if (c && c.ultimaSaidaEm && Date.parse(c.ultimaSaidaEm) > Date.parse(e.respondido_em)) continue;
    lista.push({ id: e.id, nome: e.nome, telefone: e.telefone, tipo: e.tipo, resposta: String(e.resposta || '').slice(0, 120), horas: Math.floor(h), conversa_id: c?.id || e.conversa_id || null, intencao: e.intencao || null });
  }
  return lista.sort((a, b) => b.horas - a.horas);
}

/** Saúde anti-spam em números: pedidos de PARAR, barrados e a taxa — para o painel. */
export function resumoAntispam({ enviadas30 = 0, pararam30 = 0, barrados = {}, freios = 0, voltaram30 = 0 } = {}) {
  const taxa = enviadas30 ? Math.round((pararam30 / enviadas30) * 1000) / 10 : 0;
  const total = Object.values(barrados).reduce((s, n) => s + (Number(n) || 0), 0);
  const nivel = taxa >= 3 ? 'alto' : taxa >= 1.5 ? 'atencao' : 'ok';
  return { enviadas30, pararam30, taxaParar: taxa, barrados, totalBarrados: total, freios, voltaram30, nivel,
    texto: nivel === 'alto' ? `${String(taxa).replace('.', ',')}% pediram para parar em 30 dias: acima do saudável (3%). Revise os textos e o público.`
      : nivel === 'atencao' ? `${String(taxa).replace('.', ',')}% pediram para parar: dá para melhorar. Veja quais campanhas mais incomodaram.` : 'Pedidos de PARAR dentro do normal.' };
}

/** Guarda um modelo de campanha sem nome de gente dentro: se o texto "modelo" tem o primeiro nome de um dos destinos, avisa. */
export function modeloPareceJaPreenchido(modelo, destinos = []) {
  const m = semAcento(String(modelo || ''));
  for (const d of destinos.slice(0, 50)) {
    const p = semAcento(String(d.nome || '').trim().split(/\s+/)[0]);
    if (p.length >= 4 && new RegExp(`\\b${p}\\b`).test(m)) return true;
  }
  return false;
}
export const telefoneValido = (t) => soDigitos(t).length >= 10;
