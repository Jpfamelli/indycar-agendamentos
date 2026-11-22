/* ============================================================
   Jornada — uma linha por contato, do primeiro "oi" até o carro entregue (rodada 8, frente T2b).

   Formato: o item do contrato da API (§5.3). Fontes: o CRM (`leads`), a Agenda (`agendamentos`), o Orçador
   (`orc_orcamentos`), o Pátio (`patio_os`, `patio_extras`) e as conversas (`trafego_primeiras_mensagens`).

   Regras que não mudam:
   - quem diz que o contato fechou ou não fechou é o CRM; a jornada só lê (e lança valor e motivo, que o CRM não tinha);
   - etapa só acende com evidência; `em` nulo = aconteceu, mas não se sabe quando;
   - `null` quando não se sabe, nunca zero;
   - nos trechos em que o sistema não registrou resposta de ninguém (achado 02), "respondido" fica DESCONHECIDO:
     a etapa vem com `desconhecido: true`, não vira pendência e não entra na conta de respondidos;
   - a lista leva nome curto e só o final do telefone; nome e telefone inteiros só no detalhe;
   - leituras em lote e memória curta por período: o número de idas ao banco não depende do número de contatos;
   - texto de cliente (nome, mensagem) é dado: sai limpo, cortado, e nunca vira instrução nem vai para log.
   ============================================================ */
'use strict';

const db = require('./db');
const A = require('./atribuicao');
const O = require('./origem');
const Leads = require('./leads');
const Ciclo = require('./ciclo');
const Dados = require('./jornada-db');
const enderecos = require('./enderecos');

const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;

/* ---------------- listas e textos de tela (contrato §5.1) ---------------- */

const ETAPAS = ['contato', 'respondido', 'orcamento', 'agendou', 'veio', 'oficina', 'fechou'];
const ROTULO_ETAPA = { contato: 'Contatos', respondido: 'Respondidos', orcamento: 'Com orçamento', agendou: 'Agendaram', veio: 'Vieram', oficina: 'Carro na oficina', fechou: 'Fecharam' };
const MOTIVOS = ['caro', 'concorrente', 'sem_retorno', 'desistiu', 'nao_fazemos', 'prazo', 'sem_urgencia', 'sem_vaga', 'outro'];
const ROTULO_MOTIVO = { caro: 'Achou caro', concorrente: 'Foi em outra oficina', sem_retorno: 'Parou de responder', desistiu: 'Desistiu do serviço',
  nao_fazemos: 'Não fazemos o serviço', prazo: 'Prazo não atendeu', sem_urgencia: 'Não era urgente', sem_vaga: 'Não tinha vaga', outro: 'Outro' };
const DESFECHOS = ['fechou', 'nao_fechou', 'aberto'];
const ROTULO_DESFECHO = { fechou: 'Fechou', nao_fechou: 'Não fechou', aberto: 'Em aberto' };
const PENDENCIAS = ['sem_origem', 'sem_valor', 'sem_motivo', 'sem_resposta'];
const ROTULO_PENDENCIA = { sem_origem: 'Sem origem', sem_valor: 'Fechou sem valor', sem_motivo: 'Não fechou sem motivo', sem_resposta: 'Esperando resposta' };
const ORDENS = ['recentes', 'valor', 'parados'];
const FONTES_DO_VALOR = ['patio', 'orcamento', 'agenda', 'manual'];
const ROTULO_FONTE = { patio: 'do Pátio', orcamento: 'do orçamento aprovado', agenda: 'da Agenda', manual: 'lançado à mão' };

const ESPERA_SEM_RESPOSTA_MIN = 30;
const horasDoAmbiente = (nome, padrao) => (Number(process.env[nome]) > 0 ? Number(process.env[nome]) : padrao);
/* Silêncio total de respostas confirmadas por mais que isto = o sistema não estava registrando (fim de semana comum não chega a 3 dias). */
const SEM_REGISTRO_MS = horasDoAmbiente('TRAFEGO_SEM_REGISTRO_H', 72) * HORA;
const TAMANHO_PADRAO = 50, TAMANHO_MAXIMO = 200, FILA_MAXIMA = 30, LINHA_DO_TEMPO_MAXIMA = 60;
const MEMORIA_MS = 45_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Erro que a rota devolve em JSON com o status certo ({ erro, ...extra }). */
const recusar = (status, frase, extra = {}) => Object.assign(new Error(frase), { status, publico: true, extra });
const FALTA_MIGRACAO = 'O banco ainda não recebeu a atualização do IndyCar Tráfego. Avise quem cuida do sistema.';

/* ---------------- utilitários puros ---------------- */

const tempo = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : null; };
const numero = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const arred = v => Math.round(Number(v) * 100) / 100;
const fracao = (a, b) => Math.round((a / b) * 10000) / 10000;

/** Instante em ISO com o fuso de Brasília (-03:00 fixo: o Brasil não tem horário de verão desde 2019). */
function isoBR(v) {
  const t = tempo(v);
  return t == null ? null : new Date(t - 3 * HORA).toISOString().slice(0, 19) + '-03:00';
}
const ddmm = t => { const s = isoBR(t); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : null; };
const hhmm = t => { const s = isoBR(t); return s ? s.slice(11, 16) : null; };
const FMT_REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const reais = v => FMT_REAIS.format(Number(v) || 0).replace(/\s/g, ' ');

/** "João da Silva" → "João S." (o que a lista mostra). */
function nomeCurto(nome) {
  const limpo = O.texto(nome, 120);
  if (!limpo) return null;
  const partes = limpo.split(' ').filter(Boolean);
  const primeiro = partes[0].slice(0, 24);
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : '';
  return /^\p{L}/u.test(ultimo) ? `${primeiro} ${ultimo[0].toUpperCase()}.` : primeiro;
}
const primeiroNome = nome => { const t = O.texto(nome, 60); return t ? t.split(' ')[0].slice(0, 24) : null; };
const digitos = v => String(v == null ? '' : v).replace(/\D/g, '');
/** Só os quatro últimos dígitos do telefone. */
function telefoneFinal(tel) { const d = digitos(tel); return d.length >= 4 ? d.slice(-4) : null; }
/** Telefone inteiro no formato dos links do ecossistema (55 + DDD + número). */
function telefoneInteiro(tel) { const d = digitos(tel); if (!d) return null; return d.length <= 11 ? `55${d}` : d; }
const placaLimpa = p => (p ? String(p).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || null : null);

/** O instante marcado de um agendamento: `inicio_em`, senão data + hora (Brasília). */
function instanteDoAgendamento(a) {
  if (!a) return null;
  const direto = tempo(a.inicio_em);
  if (direto != null) return direto;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.data || ''))) return null;
  const hora = /^\d{2}:\d{2}/.test(String(a.hora || '')) ? String(a.hora).slice(0, 5) : '00:00';
  return tempo(`${a.data}T${hora}:00-03:00`);
}

/* ---------------- resposta da oficina ---------------- */

/**
 * Trechos em que o sistema não registrou resposta de ninguém. Recebe as respostas confirmadas pelo aparelho:
 * a última antes do período (`antes`), a primeira dentro dele (`primeira`) e a última até o fim (`ultima`).
 * Devolve [{ de, ate }] em milissegundos; `de` nulo = desde sempre, `ate` nulo = até agora.
 */
function janelasSemRegistro({ inicio, fim, agora = Date.now(), antes = null, primeira = null, ultima = null, folgaMs = SEM_REGISTRO_MS } = {}) {
  const tAntes = tempo(antes), tPrimeira = tempo(primeira), tUltima = tempo(ultima);
  if (tUltima == null) return [{ de: null, ate: null }];
  const janelas = [];
  if (tPrimeira != null && tPrimeira > inicio && (tAntes == null || tPrimeira - tAntes > folgaMs)) janelas.push({ de: tAntes, ate: tPrimeira });
  if (Math.min(fim, agora) - tUltima > folgaMs) janelas.push({ de: tUltima, ate: null });
  return janelas;
}

/** A mensagem do cliente caiu num trecho sem registro (ou até um dia antes de ele começar)? */
const semRegistroPara = (entrada, janelas) => janelas.some(j => (j.de == null || entrada >= j.de - DIA) && (j.ate == null || entrada < j.ate));
/** A saída está DENTRO de um trecho sem registro? (as pontas do trecho são respostas confirmadas) */
const saidaSemConfirmacao = (saida, janelas) => janelas.some(j => (j.de == null || saida > j.de) && (j.ate == null || saida < j.ate));

/**
 * O que se sabe da primeira resposta: 'respondido' (com hora e minutos), 'sem_resposta' (escreveu e ninguém respondeu),
 * 'desconhecida' (não dá para saber) ou 'sem_conversa' (o cliente não escreveu no WhatsApp).
 */
function classificarResposta(pm, { janelas = [], respostas = true } = {}) {
  if (!respostas) return { tipo: 'desconhecida', entrada: null };
  // A "primeira mensagem" é um aviso do sistema gravado como recebido (D1, item 6): o cliente pode nem ter escrito.
  // Não dá para saber quando ele escreveu, então não vira "esperando resposta" nem tempo de resposta.
  if (pm && O.ehAvisoDoSistema(pm.primeira_entrada_texto)) return { tipo: 'desconhecida', entrada: null };
  const entrada = tempo(pm && pm.primeira_entrada_em), saida = tempo(pm && pm.primeira_saida_em);
  if (entrada == null) return { tipo: 'sem_conversa', entrada: null };
  if (saida != null && saida >= entrada && !saidaSemConfirmacao(saida, janelas)) return { tipo: 'respondido', entrada, em: saida, minutos: Math.max(0, Math.round((saida - entrada) / MIN)) };
  if (semRegistroPara(entrada, janelas) || (saida != null && saida < entrada)) return { tipo: 'desconhecida', entrada };
  return { tipo: 'sem_resposta', entrada };
}

/* ---------------- valor do serviço ---------------- */

const valorDoOrcamento = orc => (orc.status === 'aprovado' ? arred(Ciclo.valorAprovado(orc)) : (orc.total == null ? null : arred(numero(orc.total))));

/** Valor do serviço fechado e de onde ele veio: Pátio (OS entregue) > orçamento aprovado > agendamento concluído > lançado à mão. */
function valorDoServico(l, { lig = null, orc = null, ags = [] } = {}) {
  const entregue = lig ? (lig.os || []).find(o => o.etapa === 'entregue') : null;
  const aprovado = orc && orc.status === 'aprovado' ? Ciclo.valorAprovado(orc) : 0;
  if (entregue) {
    const total = (aprovado > 0 ? aprovado : numero(entregue.orcamento_total)) + numero(lig.extras && lig.extras.aprovado);
    if (total > 0) return { valor: arred(total), fonte: 'patio' };
  }
  if (aprovado > 0) return { valor: arred(aprovado), fonte: 'orcamento' };
  const daAgenda = Math.max(0, ...ags.filter(a => a.status === 'concluido').map(a => numero(a.valor)));
  if (daAgenda > 0) return { valor: arred(daAgenda), fonte: 'agenda' };
  if (numero(l.valor_pago) > 0) return { valor: arred(numero(l.valor_pago)), fonte: 'manual' };
  return { valor: null, fonte: null };
}

/* ---------------- o item ---------------- */

/**
 * Monta o item da jornada de um contato e o que fica só no servidor (nome inteiro, telefone, placa, primeira mensagem).
 * contexto: lig (orçamentos, OS e extras do contato), ags (agendamentos), pm (primeiras mensagens), clienteDesde,
 * primeiroDoCliente, responsavel (nome), agora, janelas (trechos sem registro) e respostas (false = não deu para ler).
 */
function montar(l, { lig = null, ags = [], pm = null, clienteDesde = null, primeiroDoCliente = true, responsavel = null,
  agora = Date.now(), janelas = [], respostas = true } = {}) {
  const criado = tempo(l.created_at);
  const origem = O.origemDoContato(l);
  const validos = (ags || []).filter(a => a && A.AG_VALIDO.has(a.status));
  const orc = lig ? Ciclo.melhorOrcamento(lig.orcamentos || []) : null;
  const osValidas = lig ? (lig.os || []).filter(o => o.etapa !== 'cancelado') : [];
  const naOficinaPeloCrm = l.status === 'em_servico' || l.status === 'concluido';

  // orçamento: só com orçamento de verdade (Orçador) ou valor orçado no CRM. A coluna "Orçamento" do CRM sozinha não prova nada:
  // o copiloto do Atendimento põe o contato lá quando o cliente demonstra interesse.
  let eOrcamento = null;
  if (orc) eOrcamento = { id: 'orcamento', em: isoBR(orc.enviado_em || orc.created_at), valor: valorDoOrcamento(orc), numero: orc.numero ?? null };
  else if (numero(l.valor_orcado) > 0) eOrcamento = { id: 'orcamento', em: null, valor: arred(numero(l.valor_orcado)), numero: null };

  // agendou: agendamento que não foi cancelado, ou o CRM dizendo "Agendado"
  const comInstante = validos.map(a => ({ a, t: instanteDoAgendamento(a) })).filter(x => x.t != null);
  const porInstante = (x, y) => x.t - y.t;
  const vieram = comInstante.filter(x => A.AG_VEIO.has(x.a.status)).sort(porInstante);
  const futuros = comInstante.filter(x => x.t >= agora && (x.a.status === 'aguardando' || x.a.status === 'confirmado')).sort(porInstante);
  const principal = vieram[0] || futuros[0] || [...comInstante].sort((x, y) => y.t - x.t)[0] || null;
  let eAgendou = null;
  if (validos.length) {
    const marcadoEm = Math.min(...validos.map(a => tempo(a.created_at)).filter(t => t != null));
    eAgendou = { id: 'agendou', em: Number.isFinite(marcadoEm) ? isoBR(marcadoEm) : null, para: principal ? isoBR(principal.t) : null };
  } else if (l.status === 'agendado') eAgendou = { id: 'agendou', em: null, para: null };

  // veio e oficina: quem pisou na oficina; e o carro que ficou (OS do Pátio, atendimento em curso ou o CRM em serviço)
  const entradasOS = osValidas.map(o => tempo(o.created_at)).filter(t => t != null);
  const primeiraOS = entradasOS.length ? Math.min(...entradasOS) : null;
  let eVeio = null;
  if (vieram.length || osValidas.length) {
    const quando = [vieram[0] ? vieram[0].t : null, primeiraOS].filter(t => t != null);
    eVeio = { id: 'veio', em: quando.length ? isoBR(Math.min(...quando)) : null };
  } else if (naOficinaPeloCrm) eVeio = { id: 'veio', em: null };

  const ficou = comInstante.filter(x => x.a.status === 'em_atendimento' || x.a.status === 'concluido').sort(porInstante)[0] || null;
  let eOficina = null;
  if (osValidas.length) eOficina = { id: 'oficina', em: isoBR(primeiraOS), os: (Ciclo.osPrincipal(osValidas) || {}).numero ?? null };
  else if (ficou) eOficina = { id: 'oficina', em: isoBR(ficou.t), os: null };
  else if (naOficinaPeloCrm) eOficina = { id: 'oficina', em: null, os: null };

  const eFechou = l.status === 'concluido' ? { id: 'fechou', em: isoBR(l.closed_at) } : null;

  // respondido: resposta registrada; senão, o contato andou (alguém o atendeu, só não se sabe em quanto tempo); senão, não se sabe
  const r = classificarResposta(pm, { janelas, respostas });
  const andou = !!(eOrcamento || eAgendou || eVeio || eOficina || eFechou);
  let eRespondido = null;
  if (r.tipo === 'respondido') eRespondido = { id: 'respondido', em: isoBR(r.em), minutos: r.minutos };
  else if (andou) eRespondido = { id: 'respondido', em: null, minutos: null };
  else if (r.tipo === 'desconhecida') eRespondido = { id: 'respondido', em: null, minutos: null, desconhecido: true };

  const etapas = [{ id: 'contato', em: isoBR(criado) }, eRespondido, eOrcamento, eAgendou, eVeio, eOficina, eFechou].filter(Boolean);
  const certas = etapas.filter(e => !e.desconhecido);
  const etapaAtual = certas[certas.length - 1].id;

  // desfecho
  const motivo = MOTIVOS.includes(l.motivo_perda) ? l.motivo_perda : null;
  let desfecho;
  if (l.status === 'concluido') {
    const v = valorDoServico(l, { lig, orc, ags: validos });
    desfecho = { tipo: 'fechou', valor: v.valor, valor_fonte: v.fonte, motivo: null, motivo_rotulo: null, obs: null, em: isoBR(l.closed_at), parado_dias: null };
  } else if (l.status === 'perdido') {
    desfecho = { tipo: 'nao_fechou', valor: null, valor_fonte: null, motivo, motivo_rotulo: motivo ? ROTULO_MOTIVO[motivo] : null, obs: O.texto(l.motivo_perda_obs, 300), em: isoBR(l.closed_at), parado_dias: null };
  } else {
    const marcos = [criado, tempo(l.ultimo_contato_em), r.entrada, ...etapas.map(e => tempo(e.em))].filter(t => t != null && t <= agora);
    const parado = futuros.length ? 0 : (marcos.length ? Math.max(0, Math.floor((agora - Math.max(...marcos)) / DIA)) : null);
    desfecho = { tipo: 'aberto', valor: null, valor_fonte: null, motivo: null, motivo_rotulo: null, obs: null, em: null, parado_dias: parado };
  }

  // espera e pendências
  const esperando = desfecho.tipo === 'aberto' && !eRespondido && r.tipo === 'sem_resposta';
  const esperaMin = esperando ? Math.max(0, Math.floor((agora - r.entrada) / MIN)) : null;
  const pendencias = [];
  if (origem.certeza === 'nenhuma') pendencias.push('sem_origem');
  if (desfecho.tipo === 'fechou' && desfecho.valor == null) pendencias.push('sem_valor');
  if (desfecho.tipo === 'nao_fechou' && !motivo) pendencias.push('sem_motivo');
  if (esperando && esperaMin > ESPERA_SEM_RESPOSTA_MIN) pendencias.push('sem_resposta');

  const clienteCriado = tempo(clienteDesde);
  const clienteNovo = !l.cliente_id || clienteCriado == null || criado == null ? null : (primeiroDoCliente ? criado - clienteCriado <= DIA : false);

  const item = {
    lead_id: l.id,
    nome: nomeCurto(l.nome),
    telefone_final: telefoneFinal(l.telefone_e164 || l.telefone),
    carro: O.texto(l.carro_modelo, 60),
    servico: O.texto(l.servico, 80),
    chegou_em: isoBR(criado),
    cliente_novo: clienteNovo,
    origem,
    etapas,
    etapa_atual: etapaAtual,
    desfecho,
    responsavel: primeiroNome(responsavel),
    pendencias,
    espera_min: esperaMin,
  };
  const interno = {
    nome: O.texto(l.nome, 120), telefone: telefoneInteiro(l.telefone_e164 || l.telefone), placa: placaLimpa(l.placa),
    primeira_mensagem: pm && !O.ehAvisoDoSistema(pm.primeira_entrada_texto) ? O.texto(pm.primeira_entrada_texto, 300) : null, orcamento_id: orc ? orc.id : null,
    os_id: osValidas.length ? (Ciclo.osPrincipal(osValidas) || {}).id || null : null,
  };
  return { item, interno };
}

/** O item do contrato (§5.3) de um contato. Pura. */
const montarItem = (l, contexto) => montar(l, contexto).item;

/** O contato passou pela etapa? (etapa desconhecida não conta) */
const temEtapa = (item, id) => item.etapas.some(e => e.id === id && !e.desconhecido);
const respostaDesconhecida = item => item.etapas.some(e => e.id === 'respondido' && e.desconhecido);

/* ---------------- totais, funil, filtros (puros) ---------------- */

function totais(itens) {
  const conta = f => itens.reduce((n, i) => n + (f(i) ? 1 : 0), 0);
  const fechados = itens.filter(i => i.desfecho.tipo === 'fechou');
  const comValor = fechados.filter(i => i.desfecho.valor != null);
  const confirmados = conta(i => temEtapa(i, 'respondido')), desconhecidos = conta(respostaDesconhecida);
  return {
    contatos: itens.length,
    de_anuncio: conta(i => i.origem.paga === true),
    respondidos: desconhecidos ? null : confirmados,
    com_orcamento: conta(i => temEtapa(i, 'orcamento')),
    agendaram: conta(i => temEtapa(i, 'agendou')),
    vieram: conta(i => temEtapa(i, 'veio')),
    fecharam: fechados.length,
    nao_fecharam: conta(i => i.desfecho.tipo === 'nao_fechou'),
    abertos: conta(i => i.desfecho.tipo === 'aberto'),
    // fechou e nenhum valor conhecido: não se sabe quanto entrou (nulo, não zero)
    faturado: fechados.length && !comValor.length ? null : arred(comValor.reduce((s, i) => s + i.desfecho.valor, 0)),
    sem_origem: conta(i => i.pendencias.includes('sem_origem')),
    sem_valor: conta(i => i.pendencias.includes('sem_valor')),
    sem_motivo: conta(i => i.pendencias.includes('sem_motivo')),
    sem_resposta: conta(i => i.pendencias.includes('sem_resposta')),
    // a mais do contrato
    na_oficina: conta(i => temEtapa(i, 'oficina')),
    respondidos_confirmados: confirmados,
    resposta_desconhecida: desconhecidos,
  };
}

/** Funil do contrato (§5.2): sete etapas, total, só de anúncio e a passagem da etapa anterior (nula quando não há taxa honesta). */
function funil(itens) {
  const pagos = itens.filter(i => i.origem.paga === true);
  const etapas = [];
  for (const id of ETAPAS) {
    const total = itens.filter(i => temEtapa(i, id)).length, anuncio = pagos.filter(i => temEtapa(i, id)).length;
    const linha = { id, rotulo: ROTULO_ETAPA[id], total, anuncio, passagem: null };
    if (id === 'respondido') {
      const desconhecidos = itens.filter(respostaDesconhecida).length;
      linha.confirmados = total; linha.desconhecidos = desconhecidos;
      if (desconhecidos) { linha.total = null; linha.anuncio = pagos.some(respostaDesconhecida) ? null : anuncio; }
    }
    const anterior = etapas[etapas.length - 1];
    if (anterior && linha.total != null && anterior.total != null && anterior.total > 0 && linha.total <= anterior.total) linha.passagem = fracao(linha.total, anterior.total);
    etapas.push(linha);
  }
  const perdidos = itens.filter(i => i.desfecho.tipo === 'nao_fechou');
  return { etapas, nao_fecharam: { total: perdidos.length, motivos: contarMotivos(perdidos), sem_motivo: perdidos.filter(i => !i.desfecho.motivo).length } };
}

function contarMotivos(itens) {
  const n = new Map();
  for (const i of itens) if (i.desfecho.motivo) n.set(i.desfecho.motivo, (n.get(i.desfecho.motivo) || 0) + 1);
  return MOTIVOS.filter(m => n.has(m)).map(m => ({ id: m, rotulo: ROTULO_MOTIVO[m], n: n.get(m) })).sort((a, b) => b.n - a.n);
}

const semAcento = v => A.normalizar(v);
const chaveDaCampanha = c => (c ? (c.ext || c.nome || null) : null);

/** O item passa por UM filtro? */
function passa(item, chave, valor, interno) {
  if (valor == null || valor === '') return true;
  if (chave === 'canal') return item.origem.canal === valor;
  if (chave === 'paga') return item.origem.paga === valor;
  if (chave === 'campanha') return chaveDaCampanha(item.origem.campanha) === valor;
  if (chave === 'desfecho') return item.desfecho.tipo === valor;
  if (chave === 'etapa') return temEtapa(item, valor);
  if (chave === 'pendencia') return item.pendencias.includes(valor);
  if (chave === 'q') {
    const termo = semAcento(valor), numeros = digitos(valor), junto = termo.replace(/[^a-z0-9]/g, '');
    const textos = [interno && interno.nome, item.nome, item.carro, item.servico].map(semAcento);
    if (termo && textos.some(t => t.includes(termo))) return true;
    if (numeros.length >= 3 && !/[a-z]/.test(termo) && interno && interno.telefone && interno.telefone.includes(numeros)) return true;
    return !!(junto.length >= 3 && interno && interno.placa && interno.placa.toLowerCase().includes(junto));
  }
  return true;
}
const CHAVES_DE_FILTRO = ['canal', 'paga', 'campanha', 'desfecho', 'etapa', 'pendencia', 'q'];

/** Filtra sem mexer na ordem. `internos` = Map(lead_id -> { nome, telefone, placa }) para a busca por nome inteiro, telefone e placa. */
function filtrar(itens, filtros = {}, internos = null, menos = null) {
  const chaves = CHAVES_DE_FILTRO.filter(k => k !== menos && filtros[k] != null && filtros[k] !== '');
  if (!chaves.length) return itens.slice();
  return itens.filter(i => chaves.every(k => passa(i, k, filtros[k], internos ? internos.get(i.lead_id) : null)));
}

const valorParaOrdenar = i => (i.desfecho.valor != null ? i.desfecho.valor : ((i.etapas.find(e => e.id === 'orcamento') || {}).valor || 0));
const recentes = (a, b) => String(b.chegou_em || '').localeCompare(String(a.chegou_em || ''));
function ordenar(itens, ordem = 'recentes') {
  const l = itens.slice();
  if (ordem === 'valor') return l.sort((a, b) => valorParaOrdenar(b) - valorParaOrdenar(a) || recentes(a, b));
  if (ordem === 'parados') {
    const aberto = i => (i.desfecho.tipo === 'aberto' ? 1 : 0);
    return l.sort((a, b) => aberto(b) - aberto(a) || (b.desfecho.parado_dias || 0) - (a.desfecho.parado_dias || 0) || recentes(a, b));
  }
  return l.sort(recentes);
}

/** As opções de cada filtro com a contagem do que sobra aplicando os OUTROS filtros (para a tela trocar de opção sem zerar a lista). */
function facetas(itens, filtros = {}, internos = null) {
  const base = chave => filtrar(itens, filtros, internos, chave);
  const contar = (lista, de) => { const n = new Map(); for (const i of lista) { const k = de(i); if (k != null) n.set(k, (n.get(k) || 0) + 1); } return n; };

  const porCanal = contar(base('canal'), i => i.origem.canal);
  const canais = O.CANAIS.filter(c => porCanal.has(c)).map(c => ({ id: c, rotulo: O.rotuloDoCanal(c), n: porCanal.get(c) })).sort((a, b) => b.n - a.n);

  const campanhas = new Map();
  for (const i of base('campanha')) {
    const c = i.origem.campanha, chave = chaveDaCampanha(c);
    if (!chave) continue;
    if (!campanhas.has(chave)) campanhas.set(chave, { ext: c.ext || null, nome: c.nome || null, plataforma: i.origem.canal === 'meta' || i.origem.canal === 'google' ? i.origem.canal : null, n: 0 });
    campanhas.get(chave).n++;
  }

  const porDesfecho = contar(base('desfecho'), i => i.desfecho.tipo);
  const pend = base('pendencia'), etp = base('etapa');
  return {
    canais,
    campanhas: [...campanhas.values()].sort((a, b) => b.n - a.n).slice(0, 100),
    desfechos: DESFECHOS.map(d => ({ id: d, rotulo: ROTULO_DESFECHO[d], n: porDesfecho.get(d) || 0 })),
    motivos: contarMotivos(base('desfecho').filter(i => i.desfecho.tipo === 'nao_fechou')),
    pendencias: PENDENCIAS.map(p => ({ id: p, rotulo: ROTULO_PENDENCIA[p], n: pend.filter(i => i.pendencias.includes(p)).length })),
    etapas: ETAPAS.map(e => ({ id: e, rotulo: ROTULO_ETAPA[e], n: etp.filter(i => temEtapa(i, e)).length })),
  };
}

/** Confere e arruma os filtros que chegaram da tela. Valor fora da lista é erro de quem chamou (400), não vira lista vazia calada. */
function normalizarFiltros(f = {}) {
  const um = (chave, lista, nome) => {
    const v = f[chave];
    if (v == null || v === '') return null;
    if (!lista.includes(v)) throw recusar(400, `Escolha ${nome} da lista: ${lista.join(', ')}.`, { campo: chave });
    return v;
  };
  let paga = null;
  if (f.paga === true || f.paga === '1' || f.paga === 'true') paga = true;
  else if (f.paga === false || f.paga === '0' || f.paga === 'false') paga = false;
  else if (f.paga != null && f.paga !== '') throw recusar(400, 'Informe paga=1 (veio de anúncio) ou paga=0 (não veio de anúncio).', { campo: 'paga' });
  const inteiro = (v, padrao) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 1 ? n : padrao; };
  return {
    canal: um('canal', O.CANAIS, 'um canal'),
    paga,
    campanha: O.texto(f.campanha, 120),
    desfecho: um('desfecho', DESFECHOS, 'um desfecho'),
    etapa: um('etapa', ETAPAS, 'uma etapa'),
    pendencia: um('pendencia', PENDENCIAS, 'uma pendência'),
    q: O.texto(f.q, 80),
    ordem: um('ordem', ORDENS, 'uma ordem') || 'recentes',
    pagina: inteiro(f.pagina, 1),
    tamanho: Math.min(TAMANHO_MAXIMO, inteiro(f.tamanho, TAMANHO_PADRAO)),
  };
}

/* ---------------- leitura do período (com memória curta) ---------------- */

const DATA = /^\d{4}-\d{2}-\d{2}$/;
function conferirPeriodo(de, ate) {
  if (!DATA.test(String(de || '')) || !DATA.test(String(ate || '')) || de > ate) throw recusar(400, 'Informe datas válidas, com início antes do fim.');
}

let geracao = 0;
const memoria = new WeakMap();   // banco -> Map(chave -> { em, geracao, promessa })
/** Esquece o que estava guardado (toda escrita chama; os testes também). A fonte do Hoje e das Campanhas guarda a
 *  lista por 30 s em cima desta: sem esquecer lá também, voltar ao Hoje logo depois de lançar os valores ainda
 *  mostrava "4 serviços sem valor". */
function esquecer() {
  geracao++;
  require('./motor/fonte').esquecerLeituras();
}

function lembrar(sb, chave, fresco, montarAgora) {
  let doBanco = memoria.get(sb);
  if (!doBanco) { doBanco = new Map(); memoria.set(sb, doBanco); }
  const guardado = doBanco.get(chave);
  if (!fresco && guardado && guardado.geracao === geracao && Date.now() - guardado.em < MEMORIA_MS) return guardado.promessa;
  const promessa = montarAgora();
  doBanco.set(chave, { em: Date.now(), geracao, promessa });
  promessa.catch(() => { if ((doBanco.get(chave) || {}).promessa === promessa) doBanco.delete(chave); });
  if (doBanco.size > 40) for (const [k, v] of doBanco) if (v.geracao !== geracao || Date.now() - v.em >= MEMORIA_MS) doBanco.delete(k);
  return promessa;
}

function textoDasRespostas(situacao, janela) {
  if (situacao === 'indisponivel') return 'Ainda não dá para ler as respostas da oficina no WhatsApp. A etapa "Respondidos" fica sem dado.';
  if (situacao !== 'sem_registro') return null;
  const porIsso = 'Por isso não dá para dizer quem ficou sem resposta nem medir o tempo de resposta.';
  if (janela.de == null) return `O sistema não tem registro do que a oficina responde pelo WhatsApp. ${porIsso}`;
  if (janela.ate == null) return `Desde ${ddmm(janela.de)} o sistema não registra o que a oficina responde pelo WhatsApp. ${porIsso}`;
  return `De ${ddmm(janela.de)} a ${ddmm(janela.ate)} o sistema não registrou o que a oficina respondeu pelo WhatsApp. Nesse trecho não dá para dizer quem ficou sem resposta.`;
}

function montarEstado(itens, { respostas, janelas, ciclo }) {
  const fechados = itens.filter(i => i.desfecho.tipo === 'fechou'), semValor = fechados.filter(i => i.desfecho.valor == null).length;
  const semOrigem = itens.filter(i => i.origem.certeza === 'nenhuma').length;
  const situacao = !respostas ? 'indisponivel' : (janelas.length ? 'sem_registro' : 'ok');
  const janela = janelas.find(j => j.ate == null) || janelas[0] || null;
  return {
    gasto: null,                                           // quem sabe do gasto é a frente do servidor base; a rota completa
    valores: !semValor ? 'ok' : (semValor === fechados.length ? 'nenhum' : 'faltam'),
    origem: !semOrigem ? 'ok' : (semOrigem === itens.length ? 'nenhuma' : 'parcial'),
    demo: false,                                           // a jornada só lê contato de verdade
    respostas: situacao,
    respostas_desde: situacao === 'sem_registro' ? isoBR(janela.de) : null,
    respostas_ate: situacao === 'sem_registro' ? isoBR(janela.ate) : null,
    respostas_texto: textoDasRespostas(situacao, janela),
    ciclo,                                                 // 'ok' | 'parcial' (Pátio fora) | 'indisponivel' (Orçador, Agenda e Pátio fora)
  };
}

async function lerPeriodo({ de, ate, sb, agora, esperaRetryMs }) {
  const inicio = db.inicioBR(de), fimDoPeriodo = Date.parse(db.inicioBR(db.diaSeguinte(ate)));
  const fim = Math.min(fimDoPeriodo, agora);
  const leads = await Leads.lerLeads(de, ate, { sb });
  const ids = leads.map(l => l.id);
  const [ciclo, pms, clientes, nomes, saidas] = await Promise.all([
    Ciclo.ler(ids, { sb, ...(esperaRetryMs ? { esperaRetryMs } : {}) }),
    Dados.primeirasMensagens(ids, { sb }),
    Dados.clientes(leads.map(l => l.cliente_id), { sb }),
    Dados.nomes(leads.map(l => l.responsavel_id), { sb }),
    Dados.saidasConfirmadas({ inicio, fim: new Date(Math.max(fim, Date.parse(inicio))).toISOString(), sb }),
  ]);
  const respostas = pms.ok && saidas.ok;
  const janelas = respostas ? janelasSemRegistro({ inicio: Date.parse(inicio), fim, agora, antes: saidas.antes, primeira: saidas.primeira, ultima: saidas.ultima }) : [];

  const agsPorLead = new Map();
  for (const a of ciclo.agendamentos || []) { if (!agsPorLead.has(a.lead_id)) agsPorLead.set(a.lead_id, []); agsPorLead.get(a.lead_id).push(a); }
  // o primeiro contato de cada cliente dentro do período (os demais não são "cliente novo")
  const primeiroDoCliente = new Map();
  for (const l of leads) {
    if (!l.cliente_id) continue;
    const atual = primeiroDoCliente.get(l.cliente_id);
    if (!atual || String(l.created_at) < String(atual.created_at)) primeiroDoCliente.set(l.cliente_id, l);
  }

  const itens = [], internos = new Map(), telefones = new Set();
  for (const l of leads) {
    const { item, interno } = montar(l, {
      lig: ciclo.porLead.get(l.id) || null, ags: agsPorLead.get(l.id) || [], pm: pms.mapa.get(l.id) || null,
      clienteDesde: clientes.get(l.cliente_id) || null, primeiroDoCliente: !l.cliente_id || primeiroDoCliente.get(l.cliente_id) === l,
      responsavel: (nomes.get(l.responsavel_id)) || null, agora, janelas, respostas,
    });
    itens.push(item); internos.set(l.id, interno);
    if (l.telefone_e164) telefones.add(l.telefone_e164);
  }
  const estado = montarEstado(itens, { respostas, janelas, ciclo: !ciclo.ok ? 'indisponivel' : (ciclo.parcial ? 'parcial' : 'ok') });
  return { itens, internos, telefones, estado, janelas, respostas };
}

/** Tudo do período, já montado. Guardado por 45 s por período (e por banco). */
function carregar({ de, ate, sb = db.sb, agora = Date.now(), fresco = false, esperaRetryMs } = {}) {
  conferirPeriodo(de, ate);
  return lembrar(sb, `jornada|${de}|${ate}`, fresco, () => lerPeriodo({ de, ate, sb, agora, esperaRetryMs }));
}

/**
 * Para as outras frentes (campanhas, hoje, porta da IA): os itens do período, sem paginação.
 * O estado do período vem em `itens.estado` (propriedade que não entra no JSON). Quem recebe pode mexer na lista à vontade.
 */
async function listarBruto(opcoes = {}) {
  const b = await carregar(opcoes);
  const itens = structuredClone(b.itens);
  Object.defineProperty(itens, 'estado', { value: { ...b.estado }, enumerable: false });
  return itens;
}

/* ---------------- conversas novas do período (achado 01) ---------------- */

async function lerConversas({ de, ate, sb, agora }) {
  const inicio = db.inicioBR(de), fim = new Date(Math.min(Date.parse(db.inicioBR(db.diaSeguinte(ate))), Math.max(agora, Date.parse(inicio)))).toISOString();
  // integração r8: a função do banco conta e classifica (primeira mensagem da história de cada telefone, mesma régua da origem)
  const doBanco = await Dados.conversasNovasDoBanco({ inicio, fim, sb });
  if (doBanco.ok) return { total: doBanco.total, telefones: [], anuncio: doBanco.anuncio, viraram: doBanco.viraram, fonte: 'banco' };
  // banco sem a função (ou ela falhou): o caminho de antes, pela tabela `conversas`
  const lidas = await Dados.conversasNovas({ inicio, fim, sb });
  if (!lidas.ok) return { total: null, telefones: [], anuncio: null };
  const telefones = lidas.conversas.map(c => c.telefone_e164).filter(Boolean);
  if (!lidas.conversas.length) return { total: 0, telefones, anuncio: 0 };
  // quantas vieram de anúncio: a primeira mensagem de cada uma, lida com a mesma régua do banco (códigos e frases cadastradas)
  const frases = await Dados.frasesAtivas({ sb });
  if (!frases.ok) return { total: lidas.conversas.length, telefones, anuncio: null };
  const primeiras = await Dados.primeirasDasConversas(lidas.conversas, { sb });
  if (!primeiras.ok) return { total: lidas.conversas.length, telefones, anuncio: null };
  // conversa aberta por um aviso do sistema gravado como recebido não é cliente escrevendo (D1, item 6)
  const avisos = [...primeiras.mapa.values()].filter(O.ehAvisoDoSistema).length;
  const textos = [...primeiras.mapa.values()].filter(t => !O.ehAvisoDoSistema(t));
  const codigos = [...new Set(textos.map(O.codigoDaMensagem).filter(Boolean))];
  const rastreios = codigos.length ? await Dados.rastreiosPorCodigo(codigos, { sb }) : new Map();
  const anuncio = textos.filter(t => O.mensagemDeAnuncio(t, { frases: frases.frases, rastreios })).length;
  return { total: lidas.conversas.length - avisos, telefones, anuncio };
}
const conversasDoPeriodo = ({ de, ate, sb = db.sb, agora = Date.now(), fresco = false }) =>
  lembrar(sb, `conversas|${de}|${ate}`, fresco, () => lerConversas({ de, ate, sb, agora }));

/* ---------------- lista, pendências ---------------- */

const periodoPublico = p => ({ de: p.de, ate: p.ate, ...(p.rotulo !== undefined ? { rotulo: p.rotulo } : {}), ...(p.anterior !== undefined ? { anterior: p.anterior } : {}) });

/** GET /api/jornada: totais, funil e facetas já com os filtros; itens paginados. */
async function listar({ periodo, filtros = {}, sb = db.sb, agora = Date.now(), fresco = false } = {}) {
  const f = normalizarFiltros(filtros);
  const { de, ate } = periodo || {};
  conferirPeriodo(de, ate);
  const [b, conversas] = await Promise.all([carregar({ de, ate, sb, agora, fresco }), conversasDoPeriodo({ de, ate, sb, agora, fresco })]);
  const filtrados = ordenar(filtrar(b.itens, f, b.internos), f.ordem);
  const total = filtrados.length;
  const atual = Math.min(f.pagina, Math.max(1, Math.ceil(total / f.tamanho)));
  return {
    periodo: periodoPublico(periodo),
    estado: { ...b.estado },
    totais: {
      ...totais(filtrados),
      // conversas novas são do período inteiro (primeira mensagem de cada telefone), não dos filtros
      conversas_novas: conversas.total,
      conversas_novas_anuncio: conversas.anuncio,
      conversas_novas_viraram_contato: conversas.total == null ? null
        : (conversas.viraram != null ? conversas.viraram : conversas.telefones.filter(t => b.telefones.has(t)).length),
    },
    funil: funil(filtrados),
    filtros: facetas(b.itens, f, b.internos),
    itens: filtrados.slice((atual - 1) * f.tamanho, atual * f.tamanho),
    pagina: { atual, tamanho: f.tamanho, total },
  };
}

/** GET /api/pendencias: quatro filas de trabalho, até 30 itens cada. A de origem leva a primeira mensagem do cliente. */
async function pendencias({ periodo = null, de = periodo && periodo.de, ate = periodo && periodo.ate, sb = db.sb, agora = Date.now(), fresco = false } = {}) {
  const b = await carregar({ de, ate, sb, agora, fresco });
  const fila = (id, ordem, comMensagem = false) => {
    const todos = b.itens.filter(i => i.pendencias.includes(id)).sort(ordem);
    return { n: todos.length, itens: todos.slice(0, FILA_MAXIMA).map(i => (comMensagem ? { ...i, primeira_mensagem: (b.internos.get(i.lead_id) || {}).primeira_mensagem || null } : i)) };
  };
  const fechouAntes = (a, c) => String(c.desfecho.em || '').localeCompare(String(a.desfecho.em || '')) || recentes(a, c);
  return {
    periodo: periodoPublico(periodo || { de, ate }),
    estado: { ...b.estado },
    sem_valor: fila('sem_valor', fechouAntes),
    sem_motivo: fila('sem_motivo', fechouAntes),
    sem_origem: fila('sem_origem', recentes, true),
    sem_resposta: fila('sem_resposta', (a, c) => (c.espera_min || 0) - (a.espera_min || 0)),
  };
}

/* ---------------- detalhe de um contato ---------------- */

const NOME_STATUS_AG = { aguardando: 'aguardando confirmação', confirmado: 'confirmado', em_atendimento: 'em atendimento', compareceu: 'veio', nao_veio: 'não veio', concluido: 'serviço feito', nao_fechou: 'veio e não fechou', cancelado: 'cancelado' };
const NOME_STATUS_ORC = { aberto: 'criado', enviado: 'enviado', aprovado: 'aprovado', recusado: 'recusado', expirado: 'venceu' };
const quando = t => `${ddmm(t)} às ${hhmm(t)}`;

/** Linha do tempo do contato, do mais antigo ao mais novo, com no máximo 60 linhas (mensagens do meio saem primeiro). */
function linhaDoTempo({ l, item, lig, ags, mensagens, atividades }) {
  const fixos = [], conversa = [];
  const por = (lista, em, tipo, titulo, detalhe = null) => { const t = tempo(em); if (t != null) lista.push({ t, em: isoBR(t), tipo, titulo, detalhe: O.texto(detalhe, 300) }); };

  por(fixos, l.created_at, 'mudanca', 'Contato chegou', item.servico);
  if (l.origem_em) por(fixos, l.origem_em, 'origem', `Origem: ${item.origem.rotulo}`, [item.origem.como_rotulo, item.origem.detalhe].filter(Boolean).join(' · ') || null);
  for (const o of (lig && lig.orcamentos) || []) {
    const n = o.numero != null ? ` nº ${o.numero}` : '';
    por(fixos, o.enviado_em || o.created_at, 'orcamento', `Orçamento${n} ${o.enviado_em ? 'enviado' : 'criado'}`, o.total != null ? reais(o.total) : null);
    if (o.decidido_em && (o.status === 'aprovado' || o.status === 'recusado')) por(fixos, o.decidido_em, 'orcamento', `Orçamento${n} ${NOME_STATUS_ORC[o.status]}`, o.status === 'aprovado' ? reais(Ciclo.valorAprovado(o)) : (Ciclo.MOTIVO_NOME[o.motivo_cod] || null));
  }
  for (const a of ags || []) {
    const para = instanteDoAgendamento(a);
    por(fixos, a.created_at, 'agendamento', para != null ? `Agendou para ${quando(para)}` : 'Agendou', NOME_STATUS_AG[a.status] || null);
    if (para != null && para <= Date.now() && A.AG_VEIO.has(a.status)) por(fixos, para, 'agendamento', 'Veio no horário marcado', a.valor != null && numero(a.valor) > 0 ? reais(a.valor) : null);
    if (para != null && a.status === 'nao_veio') por(fixos, para, 'agendamento', 'Não veio no horário marcado');
  }
  for (const o of (lig && lig.os) || []) {
    const n = o.numero != null ? ` (OS nº ${o.numero})` : '';
    por(fixos, o.created_at, 'os', `Carro entrou na oficina${n}`, Ciclo.NOME_ETAPA[o.etapa] ? `Hoje: ${Ciclo.NOME_ETAPA[o.etapa]}` : null);
    if (o.entregue_em) por(fixos, o.entregue_em, 'os', `Carro entregue${n}`);
  }
  for (const at of atividades || []) por(fixos, at.created_at, 'mudanca', at.tipo ? `CRM: ${O.texto(at.tipo, 40)}` : 'Registro no CRM', at.resultado || at.texto);
  if (item.desfecho.tipo === 'fechou') por(fixos, l.closed_at, 'mudanca', 'Fechou o serviço', item.desfecho.valor != null ? `${reais(item.desfecho.valor)} (${ROTULO_FONTE[item.desfecho.valor_fonte]})` : 'Falta lançar o valor');
  if (item.desfecho.tipo === 'nao_fechou') por(fixos, l.closed_at, 'mudanca', 'Não fechou', item.desfecho.motivo_rotulo || 'Falta dizer o motivo');

  for (const m of mensagens || []) {
    const aviso = m.direcao === 'entrada' && O.ehAvisoDoSistema(m.corpo);   // gravado como recebido, mas é o sistema
    const doCliente = m.direcao === 'entrada' && !aviso;
    const titulo = aviso ? 'Aviso do sistema' : doCliente ? 'Cliente escreveu' : (m.status === 'falhou' ? 'Resposta que não saiu' : (m.gerada_por_ia ? 'Resposta automática' : 'Oficina respondeu'));
    por(conversa, m.created_at, doCliente ? 'mensagem_cliente' : 'mensagem_oficina', titulo, m.corpo);
  }

  const porTempo = (a, b) => a.t - b.t;
  fixos.sort(porTempo); conversa.sort(porTempo);
  const fixosQueFicam = fixos.slice(-LINHA_DO_TEMPO_MAXIMA);
  const vagas = LINHA_DO_TEMPO_MAXIMA - fixosQueFicam.length;
  const conversaQueFica = conversa.length <= vagas ? conversa : [...conversa.slice(0, Math.ceil(vagas / 2)), ...conversa.slice(conversa.length - Math.floor(vagas / 2))];
  return [...fixosQueFicam, ...conversaQueFica].sort(porTempo).map(({ t, ...resto }) => resto);
}

/** O que o rastreio do site guardou sobre a chegada (nunca identificador de clique). null quando não há. */
function rastreioDoContato(l) {
  const r = l.rastreio && typeof l.rastreio === 'object' ? l.rastreio : {};
  const saida = {
    pagina: O.texto(r.pagina, 120), servico: O.texto(r.servico, 40),
    utm_source: O.texto(l.utm_source, 60), utm_medium: O.texto(l.utm_medium, 60), utm_campaign: O.texto(l.utm_campaign, 120),
    codigo: O.texto(r.codigo, 8), clique_em: isoBR(r.clique_em || r.criado_em || null),
  };
  return Object.values(saida).some(v => v != null) ? saida : null;
}

function historicoDoCliente(l, { agsDoCliente, clienteDesde }) {
  const criado = tempo(l.created_at);
  if (!Array.isArray(agsDoCliente) || criado == null) return { visitas_antes: null, gasto_antes: null, cliente_desde: isoBR(clienteDesde) };
  const antes = agsDoCliente.filter(a => a.lead_id !== l.id && A.AG_VEIO.has(a.status)).filter(a => { const t = instanteDoAgendamento(a); return t != null && t < criado; });
  const comValor = antes.filter(a => numero(a.valor) > 0);
  return {
    visitas_antes: antes.length,
    gasto_antes: !antes.length ? 0 : (comValor.length ? arred(comValor.reduce((s, a) => s + numero(a.valor), 0)) : null),
    cliente_desde: isoBR(clienteDesde),
  };
}

/** Links para abrir o contato nos outros apps: os da Central são relativos à raiz dela; Orçador e Pátio moram em outro endereço. */
function linksDoContato(l, interno) {
  const links = {};
  const por = (chave, valor) => { if (valor) links[chave] = valor; };
  por('crm', enderecos.caminhoNaCentral('crm', { lead: l.id }));
  if (interno.telefone) {
    por('atendimento', enderecos.caminhoNaCentral('atendimento', { tel: interno.telefone }));
    por('agenda', enderecos.caminhoNaCentral('agenda', { tel: interno.telefone }));
  }
  if (interno.orcamento_id) por('orcamento', `${enderecos.caminhoNaCentral('orcador')}#/historico/${encodeURIComponent(interno.orcamento_id)}`);   // rodada 13C: /orcador/ da Central
  if (interno.os_id) por('patio', `${enderecos.APPS.patio.url}/?os=${encodeURIComponent(interno.os_id)}`);
  return links;
}

/** Lê UM contato com o mesmo cuidado da lista (ciclo, respostas, cliente, responsável). null se não existe. */
async function lerContato(leadId, { sb = db.sb, agora = Date.now(), leve = false } = {}) {
  if (!UUID.test(String(leadId || ''))) throw recusar(400, 'Contato inválido.');
  const l = await Leads.lerLead(leadId, { sb });
  if (!l) return null;
  const criado = tempo(l.created_at) ?? agora;
  const [ciclo, pms, clientes, nomes, saidas] = await Promise.all([
    Ciclo.ler([l.id], { sb }),
    leve ? { ok: false, mapa: new Map() } : Dados.primeirasMensagens([l.id], { sb }),
    leve ? new Map() : Dados.clientes([l.cliente_id], { sb }),
    leve ? new Map() : Dados.nomes([l.responsavel_id], { sb }),
    leve ? { ok: false } : Dados.saidasConfirmadas({ inicio: new Date(criado).toISOString(), fim: new Date(Math.max(agora, criado)).toISOString(), sb }),
  ]);
  const respostas = pms.ok && saidas.ok;
  const janelas = respostas ? janelasSemRegistro({ inicio: criado, fim: agora, agora, antes: saidas.antes, primeira: saidas.primeira, ultima: saidas.ultima }) : [];
  const ags = (ciclo.agendamentos || []).filter(a => a.lead_id === l.id);
  const lig = ciclo.porLead.get(l.id) || null;
  const pm = pms.mapa.get(l.id) || null;
  const clienteDesde = clientes.get(l.cliente_id) || null;
  const { item, interno } = montar(l, { lig, ags, pm, clienteDesde, responsavel: nomes.get(l.responsavel_id) || null, agora, janelas, respostas });
  return { l, item, interno, lig, ags, pm, clienteDesde };
}

/** GET /api/jornada/:lead_id: o item e mais a linha do tempo, a primeira mensagem, o rastreio, o histórico e os links. */
async function detalhe(leadId, { sb = db.sb, agora = Date.now() } = {}) {
  const c = await lerContato(leadId, { sb, agora });
  if (!c) return null;
  const [mensagens, atividades, agsDoCliente] = await Promise.all([
    Dados.mensagensDoContato(c.l, { sb }), Dados.atividadesDoContato(c.l.id, { sb }), Dados.agendamentosDoCliente(c.l.cliente_id, { sb }),
  ]);
  const primeiraDoCliente = mensagens.find(m => m.direcao === 'entrada' && !O.ehAvisoDoSistema(m.corpo));
  return {
    ...c.item,
    nome: c.interno.nome,
    telefone: c.interno.telefone,
    linha_do_tempo: linhaDoTempo({ l: c.l, item: c.item, lig: c.lig, ags: c.ags, mensagens, atividades }),
    primeira_mensagem: c.interno.primeira_mensagem || O.texto(primeiraDoCliente && primeiraDoCliente.corpo, 300),
    rastreio: rastreioDoContato(c.l),
    historico: historicoDoCliente(c.l, { agsDoCliente, clienteDesde: c.clienteDesde }),
    links: linksDoContato(c.l, c.interno),
  };
}

/* ---------------- escritas (a rota audita e limita por pessoa) ---------------- */

/** Aceita 750, 750.5, "750,50", "1.250,00" e "R$ 750". Devolve o valor com duas casas, entre 1 e 100.000. */
function conferirValor(v) {
  let n = v;
  if (typeof v === 'string') {
    const s = v.trim().replace(/^R\$\s*/i, '');
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
    else if (/^\d+(\.\d{1,2})?$/.test(s)) n = Number(s);
    else n = NaN;
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) throw recusar(422, 'Informe o valor do serviço em reais, por exemplo 750 ou 750,50.', { campo: 'valor' });
  const valor = arred(n);
  if (valor < 1 || valor > 100000) throw recusar(422, 'O valor do serviço precisa ficar entre R$ 1 e R$ 100.000.', { campo: 'valor' });
  return valor;
}

function conferirMotivo({ motivo, obs } = {}) {
  if (!MOTIVOS.includes(motivo)) throw recusar(422, 'Escolha um motivo da lista.', { campo: 'motivo', opcoes: MOTIVOS.map(m => ({ id: m, rotulo: ROTULO_MOTIVO[m] })) });
  if (obs != null && typeof obs !== 'string') throw recusar(422, 'A observação precisa ser um texto.', { campo: 'obs' });
  return { motivo, obs: O.texto(obs, 300) };
}

async function desfechoAtual(leadId, { sb, agora }) {
  const c = await lerContato(leadId, { sb, agora, leve: true });
  return c ? c.item.desfecho : null;
}

/** Lança o valor do serviço de um contato que já fechou (grava em leads.valor_pago). */
async function lancarValor(leadId, valorBruto, { sb = db.sb, agora = Date.now(), comDesfecho = true } = {}) {
  if (!UUID.test(String(leadId || ''))) throw recusar(400, 'Contato inválido.');
  const valor = conferirValor(valorBruto);
  const antes = await Dados.situacaoDoContato(leadId, { sb });
  if (!antes) throw recusar(404, 'Contato não encontrado.');
  if (antes.status !== 'concluido') throw recusar(409, 'Só dá para lançar valor em contato que já fechou.', { codigo: 'nao_fechou' });
  const gravado = await Dados.gravarValor(leadId, valor, { sb });
  if (!gravado) throw recusar(409, 'O contato mudou enquanto você lançava. Atualize a tela e tente de novo.', { codigo: 'mudou' });
  esquecer();
  const saida = { ok: true, antes: antes.valor_pago == null ? null : Number(antes.valor_pago), valor };
  if (!comDesfecho) return saida;
  const desfecho = await desfechoAtual(leadId, { sb, agora });
  // fonte mais forte que o lançamento à mão continua valendo: avisa em vez de fingir que o número mudou
  const aviso = desfecho && desfecho.valor_fonte && desfecho.valor_fonte !== 'manual' && desfecho.valor !== valor
    ? `O valor que vale continua sendo o ${ROTULO_FONTE[desfecho.valor_fonte]} (${reais(desfecho.valor)}). O que você lançou ficou guardado.` : null;
  return { ...saida, desfecho, aviso };
}

/** Marca por que um contato não fechou (grava em leads.motivo_perda e motivo_perda_obs). */
async function marcarMotivo(leadId, dados, { sb = db.sb, agora = Date.now(), comDesfecho = true } = {}) {
  if (!UUID.test(String(leadId || ''))) throw recusar(400, 'Contato inválido.');
  const { motivo, obs } = conferirMotivo(dados);
  const antes = await Dados.situacaoDoContato(leadId, { sb });
  if (!antes) throw recusar(404, 'Contato não encontrado.');
  if (antes.status !== 'perdido') throw recusar(409, 'Só dá para marcar o motivo em contato que não fechou.', { codigo: 'nao_perdido' });
  const gravado = await Dados.gravarMotivo(leadId, { motivo, obs }, { sb });
  if (gravado && gravado.ausente) throw recusar(503, FALTA_MIGRACAO, { codigo: 'falta_migracao' });
  if (!gravado) throw recusar(409, 'O contato mudou enquanto você marcava. Atualize a tela e tente de novo.', { codigo: 'mudou' });
  esquecer();
  const saida = { ok: true, motivo, obs };
  return comDesfecho ? { ...saida, desfecho: await desfechoAtual(leadId, { sb, agora }) } : saida;
}

/** Marca a origem à mão. Quem grava é o banco (trafego_aplicar_origem com 'manual': marcação de pessoa sempre entra). */
async function marcarOrigem(leadId, dados, { sb = db.sb, quem = null, comOrigem = true } = {}) {
  if (!UUID.test(String(leadId || ''))) throw recusar(400, 'Contato inválido.');
  const { canal, dados: pedido } = O.dadosDaOrigemManual(dados, quem);
  const existe = await Dados.situacaoDoContato(leadId, { sb });
  if (!existe) throw recusar(404, 'Contato não encontrado.');
  const r = await Dados.aplicarOrigem(leadId, pedido, { sb });
  if (!r.ok) throw recusar(503, r.ausente ? FALTA_MIGRACAO : 'Não foi possível gravar a origem agora. Tente de novo em instantes.', { codigo: r.ausente ? 'falta_migracao' : 'banco' });
  if (!r.aplicou) throw recusar(409, 'O banco não aceitou a origem deste contato. Atualize a tela e tente de novo.', { codigo: 'nao_aplicou' });
  esquecer();
  const saida = { ok: true, canal };
  if (!comOrigem) return saida;
  const l = await Leads.lerLead(leadId, { sb });
  return { ...saida, origem: O.origemDoContato(l || {}) };
}

/**
 * Lote (até 50): cada item pode trazer valor, motivo (+obs) e origem. Um item com erro não derruba os outros.
 * Devolve { ok, feitos, erros: [{ lead_id, erro }], gravados: [{ lead_id, acao, ... }] } (`gravados` é para a auditoria da rota).
 */
async function lote(itens, { sb = db.sb, quem = null } = {}) {
  if (!Array.isArray(itens) || !itens.length) throw recusar(422, 'Mande a lista de contatos em "itens".', { campo: 'itens' });
  if (itens.length > 50) throw recusar(422, 'Mande no máximo 50 contatos por vez.', { campo: 'itens' });
  const erros = [], gravados = [];
  let feitos = 0;
  for (const it of itens) {
    const id = it && typeof it === 'object' ? it.lead_id : null;
    try {
      if (!UUID.test(String(id || ''))) throw recusar(422, 'Contato inválido.');
      const temValor = it.valor != null && it.valor !== '', temMotivo = it.motivo != null && it.motivo !== '', temOrigem = it.origem != null && it.origem !== '';
      if (!temValor && !temMotivo && !temOrigem) throw recusar(422, 'Nada para gravar neste contato.');
      if (temValor) { const r = await lancarValor(id, it.valor, { sb, comDesfecho: false }); gravados.push({ lead_id: id, acao: 'valor', antes: r.antes, valor: r.valor }); }
      if (temMotivo) { const r = await marcarMotivo(id, { motivo: it.motivo, obs: it.obs }, { sb, comDesfecho: false }); gravados.push({ lead_id: id, acao: 'motivo', motivo: r.motivo }); }
      if (temOrigem) {
        const dados = typeof it.origem === 'string' ? { canal: it.origem } : it.origem;
        const r = await marcarOrigem(id, dados, { sb, quem, comOrigem: false }); gravados.push({ lead_id: id, acao: 'origem', canal: r.canal });
      }
      feitos++;
    } catch (e) {
      erros.push({ lead_id: typeof id === 'string' ? id.slice(0, 40) : null, erro: e && e.status && e.status < 500 ? e.message : 'Não foi possível gravar este contato agora.' });
    }
  }
  return { ok: erros.length === 0, feitos, erros, gravados };
}

module.exports = {
  ETAPAS, ROTULO_ETAPA, MOTIVOS, ROTULO_MOTIVO, DESFECHOS, ROTULO_DESFECHO, PENDENCIAS, ROTULO_PENDENCIA, ORDENS, FONTES_DO_VALOR,
  ESPERA_SEM_RESPOSTA_MIN, TAMANHO_PADRAO, TAMANHO_MAXIMO,
  isoBR, nomeCurto, telefoneFinal, instanteDoAgendamento, janelasSemRegistro, classificarResposta, valorDoServico,
  montarItem, temEtapa, totais, funil, filtrar, ordenar, facetas, normalizarFiltros,
  carregar, listarBruto, listar, pendencias, detalhe, esquecer,
  conferirValor, conferirMotivo, lancarValor, marcarMotivo, marcarOrigem, lote,
  linhaDoTempo, rastreioDoContato, historicoDoCliente,
};
