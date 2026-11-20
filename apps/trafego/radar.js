/* ============================================================
   Radar — motor de regras. Roda de tempos em tempos, compara cada
   campanha/criativo com os limites configurados e dispara aviso.
   É o módulo que protege dinheiro: relatório informa depois, o radar
   avisa enquanto ainda dá para agir.
   ============================================================ */
'use strict';

const db = require('./db');
const M = require('./metricas');
const whatsapp = require('./whatsapp');
const Vocab = require('./vocabulario');

const iso = d => d.toISOString().slice(0, 10);
const NL = String.fromCharCode(10);

/**
 * A janela termina ONTEM, não hoje. O dia corrente está incompleto: às 9h da
 * manhã toda campanha tem "CPA altíssimo" porque gastou e ainda não converteu.
 * Avaliar dia fechado elimina essa classe inteira de alarme falso.
 */
function janela(dias, agora = Date.now()) {
  const ontem = new Date(agora - 86400000);
  const inicio = new Date(ontem.getTime() - (dias - 1) * 86400000);
  return { de: iso(inicio), ate: iso(ontem) };
}

const COMPARA = {
  '>':  (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<':  (a, b) => a < b,
  '<=': (a, b) => a <= b,
};

const PLATAFORMA_NOME = { meta: 'Meta', google: 'Google' };

/* ------------------------------------------------------------
   Validação de regra — o mesmo contrato do servidor e da tela
   ------------------------------------------------------------ */
const NIVEIS = ['conta', 'campanha', 'conjunto', 'anuncio'];
const PLATAFORMAS = ['meta', 'google'];
const SEVERIDADES = ['info', 'alerta', 'critico'];
const METRICAS = Object.keys(M.ROTULO);
const LIMITES = { janela_dias: [1, 90], cooldown_horas: [1, 720] };

/**
 * Devolve { ok:true, regra } com os campos normalizados, ou { ok:false, erro }.
 * Nada aqui toca o banco: é a mesma função que o teste chama.
 */
function validarRegra(entrada) {
  const e = entrada || {};
  const nome = String(e.nome ?? '').trim();
  if (!nome) return { ok: false, erro: 'Dê um nome à regra.' };
  if (nome.length > 80) return { ok: false, erro: 'O nome pode ter até 80 caracteres.' };

  const nivel = e.nivel ?? 'campanha';
  if (!NIVEIS.includes(nivel)) return { ok: false, erro: 'Onde olhar: escolha conta, campanha, conjunto ou criativo.' };

  const plataforma = e.plataforma || null;
  if (plataforma && !PLATAFORMAS.includes(plataforma)) return { ok: false, erro: 'Plataforma deve ser Meta, Google ou ambas.' };

  if (!METRICAS.includes(e.metrica)) return { ok: false, erro: 'Métrica desconhecida.' };
  if (!COMPARA[e.operador]) return { ok: false, erro: 'Operador deve ser >, >=, < ou <=.' };

  const valor = Number(e.valor);
  if (e.valor === '' || e.valor == null || !Number.isFinite(valor)) return { ok: false, erro: 'Informe o valor limite (um número).' };
  if (valor < 0) return { ok: false, erro: 'O valor limite não pode ser negativo.' };

  const inteiro = (campo, padrao, rotulo) => {
    const v = e[campo] == null || e[campo] === '' ? padrao : Number(e[campo]);
    const [min, max] = LIMITES[campo];
    if (!Number.isInteger(v) || v < min || v > max) return { erro: `${rotulo}: use um número inteiro entre ${min} e ${max}.` };
    return { v };
  };
  const janela_dias = inteiro('janela_dias', 3, 'Janela (dias)');
  if (janela_dias.erro) return { ok: false, erro: janela_dias.erro };
  const cooldown_horas = inteiro('cooldown_horas', 24, 'Repetir só após (h)');
  if (cooldown_horas.erro) return { ok: false, erro: cooldown_horas.erro };

  const piso = campo => {
    const v = e[campo] == null || e[campo] === '' ? 0 : Number(e[campo]);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const min_gasto = piso('min_gasto'), min_impressoes = piso('min_impressoes'), min_conversoes = piso('min_conversoes');
  if (min_gasto == null || min_impressoes == null || min_conversoes == null) {
    return { ok: false, erro: 'Os mínimos (gasto, impressões, conversões) devem ser números maiores ou iguais a zero.' };
  }

  const severidade = e.severidade ?? 'alerta';
  if (!SEVERIDADES.includes(severidade)) return { ok: false, erro: 'Severidade deve ser informativo, alerta ou crítico.' };

  const mensagem = e.mensagem == null ? null : String(e.mensagem).trim().slice(0, 300) || null;

  const regra = {
    nome, nivel, plataforma, metrica: e.metrica, operador: e.operador, valor,
    janela_dias: janela_dias.v, cooldown_horas: cooldown_horas.v,
    min_gasto, min_impressoes, min_conversoes, severidade, mensagem,
    ativa: e.ativa !== false,
  };
  if (e.id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(e.id))) return { ok: false, erro: 'Id da regra inválido.' };
    regra.id = e.id;
  }
  return { ok: true, regra };
}

/* ------------------------------------------------------------
   Mensagem e avaliação
   ------------------------------------------------------------ */

function montarMensagem(regra, ctx) {
  const modelo = regra.mensagem
    || '{regra}: {entidade} está com {metrica} em {valor} (limite {limite}).';
  return modelo
    .replace(/{regra}/g, regra.nome)
    .replace(/{campanha}/g, ctx.campanha || '—')
    // Um mesmo criativo costuma rodar em várias campanhas com o mesmo nome.
    // Sem a campanha ao lado, o dono recebe seis avisos idênticos e não
    // consegue saber qual pausar.
    .replace(/{entidade}/g, regra.nivel !== 'campanha' && ctx.campanha
      ? `${ctx.nome} (em ${ctx.campanha})` : ctx.nome)
    .replace(/{plataforma}/g, PLATAFORMA_NOME[ctx.plataforma] || ctx.plataforma)
    .replace(/{metrica}/g, M.ROTULO[regra.metrica] || regra.metrica)
    .replace(/{valor}/g, M.formatar(regra.metrica, ctx.valor))
    .replace(/{limite}/g, M.formatar(regra.metrica, regra.valor))
    .replace(/{janela}/g, String(regra.janela_dias));
}

/**
 * Avalia UMA regra sobre as linhas da janela dela. Pura: recebe o mapa de
 * últimos disparos e o relógio, devolve o que dispara e o que o cooldown
 * segurou. É o coração do radar — e o que o teste automatizado cobre.
 *
 * @param {Map<string,string>} disparos  chave -> ISO do último disparo
 *   (é MUTADO: cada novo disparo entra, para duas regras iguais não
 *   dispararem na mesma rodada).
 */
function avaliarRegra(regra, linhas, { disparos = new Map(), agora = Date.now() } = {}) {
  const novos = [], suprimidos = [];
  if (!linhas?.length) return { novos, suprimidos };

  // Agrupa por objeto (campanha, conjunto ou criativo) somando a janela.
  const porEntidade = new Map();
  for (const l of linhas) {
    const k = `${l.plataforma}|${l.entidade_ext}`;
    if (!porEntidade.has(k)) porEntidade.set(k, []);
    porEntidade.get(k).push(l);
  }

  const cooldownMs = (regra.cooldown_horas || 24) * 3600000;

  for (const [chaveEnt, ls] of porEntidade) {
    const t = M.consolidar(ls);
    const [plataforma, ext] = chaveEnt.split('|');
    const ultima = ls[ls.length - 1];
    const nome = ultima.entidade_nome || ext;
    const campanha = regra.nivel === 'campanha' ? null : ultima.campanha_nome;

    // Pisos de significância. Sem eles o radar vira ruído: uma campanha
    // com R$ 6 gastos dispararia "sem conversão" todo santo dia.
    if (t.gasto < (regra.min_gasto || 0)) continue;
    if (t.conversoes < (regra.min_conversoes || 0)) continue;
    if (t.impressoes < (regra.min_impressoes || 0)) continue;

    const valor = t[regra.metrica];
    // null = métrica sem base (CPA sem conversão, ROAS sem gasto).
    // Esse caso é coberto por uma regra de "conversoes <= 0", não aqui.
    if (valor == null || !Number.isFinite(valor)) continue;
    if (!COMPARA[regra.operador]?.(valor, regra.valor)) continue;

    const chave = `${regra.id}|${plataforma}|${ext}`;
    const ultimo = disparos.get(chave);
    if (ultimo && agora - new Date(ultimo).getTime() < cooldownMs) {
      suprimidos.push({ chave, nome, regra: regra.nome });
      continue;
    }

    novos.push({
      regra_id: regra.id, regra_nome: regra.nome,
      plataforma, nivel: regra.nivel, entidade_ext: ext, entidade_nome: nome,
      metrica: regra.metrica, valor_medido: valor, valor_limite: regra.valor,
      severidade: regra.severidade,
      mensagem: montarMensagem(regra, { nome, plataforma, valor, campanha }),
      chave,
    });
    disparos.set(chave, new Date(agora).toISOString());
  }
  return { novos, suprimidos };
}

/* ------------------------------------------------------------
   Alertas do CRM — o que a plataforma não vê: campanha que gasta
   e não gera lead no CRM, e custo por agendamento acima do alvo.
   ------------------------------------------------------------ */
const CRM_TIPOS = {
  sem_lead: { nome: 'Campanha sem lead no CRM', metrica: 'leads_crm', severidade: 'alerta' },
  custo_agendamento: { nome: 'Custo por agendamento alto', metrica: 'custo_agendamento', severidade: 'alerta' },
  custo_venda: { nome: 'Custo por venda alto', metrica: 'custo_venda', severidade: 'critico' },
};
const CRM_COOLDOWN_H = 24;

/**
 * Pura: transforma os avisos de atribuicao.consolidar em linhas de
 * ads_alertas, respeitando o cooldown de 24 h por campanha e tipo.
 */
function alertasDoCRM(resultado, { disparos = new Map(), agora = Date.now(), cpaAlvo = null } = {}) {
  const novos = [], suprimidos = [];
  for (const a of resultado?.alertas || []) {
    const tipo = CRM_TIPOS[a.tipo];
    if (!tipo || !PLATAFORMAS.includes(a.canal)) continue;
    const chave = `crm|${a.tipo}|${a.canal}|${a.campanha}`;
    const ultimo = disparos.get(chave);
    if (ultimo && agora - new Date(ultimo).getTime() < CRM_COOLDOWN_H * 3600000) { suprimidos.push({ chave }); continue; }
    novos.push({
      regra_id: null, regra_nome: tipo.nome, plataforma: a.canal, nivel: 'campanha',
      entidade_ext: `crm:${a.campanha}`.slice(0, 200), entidade_nome: a.campanha,
      metrica: tipo.metrica, valor_medido: a.valor ?? (a.tipo === 'sem_lead' ? 0 : null),
      valor_limite: a.tipo === 'sem_lead' ? null : cpaAlvo, severidade: tipo.severidade,
      mensagem: `${tipo.nome}: ${a.campanha} (${PLATAFORMA_NOME[a.canal]}) — ${a.texto}`, chave,
    });
    disparos.set(chave, new Date(agora).toISOString());
  }
  return { novos, suprimidos };
}

/* ------------------------------------------------------------
   Rodada 8: regras da CONTA inteira trazidas do núcleo do Nexus Ads (motor/nucleo.mjs, regras r5 e r6; no núcleo
   ficam desligadas, para não existir um segundo radar). As contas e os limites são os do núcleo:
   - gasto_parou (r5): o gasto de ontem ficou abaixo de 30% da média dos 7 dias anteriores (média de pelo menos
     R$ 20 por dia, com gasto em 5 dos 7 dias). Domingo a oficina não abre: não avalia. Com mais de uma plataforma,
     avalia também cada uma (o Google zerado com a Meta firme não some na soma).
   - contatos_sumiram (r6): nos últimos 3 dias a Meta contou pelo menos 6 conversas e menos de 40% chegaram à
     oficina como contato da Meta, quando nas 2 semanas antes chegavam (só avisa QUEDA).
   Linhas de demonstração não entram. Um aviso por chave a cada 24 h.
   ------------------------------------------------------------ */
const CONTA_TIPOS = {
  gasto_parou: { nome: 'O investimento parou de repente', metrica: 'conta_gasto', severidade: 'critico' },
  contatos_sumiram: { nome: 'Conversas da Meta não chegam à oficina', metrica: 'conta_contatos', severidade: 'alerta' },
};
const DIA_MS = 86400000;
const somarDiaIso = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/**
 * Pura. `linhas` = ads_metricas_dia (nível campanha) dos 17 dias até ontem; `contatosMeta` = Map(dia -> contatos que
 * chegaram pela Meta); `ontem` = dia AAAA-MM-DD. Devolve { novos, suprimidos } no formato de ads_alertas.
 */
function alertasDaConta(linhas, { contatosMeta = null, ontem, disparos = new Map(), agora = Date.now() } = {}) {
  const T = require('./motor/texto');
  const Ad = require('./motor/adaptador');
  const reais = (linhas || []).filter(l => l && l.fonte !== 'demo');
  const novos = [], suprimidos = [];
  const emitir = (tipo, chave, campos) => {
    const ultimo = disparos.get(chave);
    if (ultimo && agora - new Date(ultimo).getTime() < CRM_COOLDOWN_H * 3600000) { suprimidos.push({ chave }); return; }
    const t = CONTA_TIPOS[tipo];
    novos.push({ regra_id: null, regra_nome: t.nome, nivel: 'conta', entidade_ext: 'conta', entidade_nome: 'Conta inteira',
      metrica: t.metrica, severidade: t.severidade, chave, plataforma: null, valor_limite: null, ...campos });
    disparos.set(chave, new Date(agora).toISOString());
  };
  const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const reais$ = v => (Math.abs(v) >= 100 ? T.brl0(v) : T.brl(v));

  // gasto_parou (r5)
  const domingo = new Date(`${ontem}T12:00:00Z`).getUTCDay() === 0;
  const queda = plat => {
    const g = [];
    for (let i = 7; i >= 0; i--) {
      const dia = somarDiaIso(ontem, -i);
      g.push(reais.filter(l => l.data === dia && (!plat || l.plataforma === plat)).reduce((s, l) => s + (+l.gasto || 0), 0));
    }
    const antes = g.slice(0, 7), media = antes.reduce((a, b) => a + b, 0) / 7, comGasto = antes.filter(x => x > 0.009).length, ontemG = g[7];
    return { media, ontem: ontemG, caiu: media >= 20 && comGasto >= 5 && ontemG < media * 0.3 };
  };
  if (!domingo) {
    const total = queda(null);
    const plats = [...new Set(reais.map(l => l.plataforma).filter(Boolean))].sort();
    const quedas = plats.length > 1 ? plats.map(p => ({ p, ...queda(p) })).filter(x => x.caiu) : [];
    const det = x => `${PLATAFORMA_NOME[x.p] || x.p}: ${reais$(x.media)} por dia, ontem ${reais$(x.ontem)}`;
    if (total.caiu) {
      emitir('gasto_parou', 'conta|gasto_parou', { valor_medido: Math.round(total.ontem * 100) / 100,
        mensagem: `O investimento caiu de ${reais$(total.media)} por dia (média dos 7 dias anteriores) para ${reais$(total.ontem)} em ${ddmm(ontem)}: cartão recusado, anúncio reprovado ou saldo zerado?${quedas.length ? ` (${quedas.map(det).join('; ')})` : ''}` });
    } else for (const x of quedas) {
      emitir('gasto_parou', `conta|gasto_parou|${x.p}`, { plataforma: x.p, valor_medido: Math.round(x.ontem * 100) / 100,
        mensagem: `O investimento ${x.p === 'meta' ? 'na Meta' : `no ${PLATAFORMA_NOME[x.p] || x.p}`} caiu de ${reais$(x.media)} por dia para ${reais$(x.ontem)} em ${ddmm(ontem)}, enquanto o resto seguiu normal: cartão recusado, anúncio reprovado ou saldo zerado?` });
    }
  }

  // contatos_sumiram (r6)
  if (contatosMeta instanceof Map) {
    const conta = (de, ate) => {
      let plataforma = 0, oficina = 0;
      for (const l of reais) if (l.plataforma === 'meta' && l.data >= de && l.data <= ate) plataforma += Ad.contatosDaPlataforma(l);
      for (const [dia, n] of contatosMeta) if (dia >= de && dia <= ate) oficina += n;
      return { plataforma, oficina };
    };
    const agoraC = conta(somarDiaIso(ontem, -2), ontem), antesC = conta(somarDiaIso(ontem, -16), somarDiaIso(ontem, -3));
    if (agoraC.plataforma >= 6 && agoraC.oficina < agoraC.plataforma * 0.4 && antesC.plataforma >= 10 && antesC.oficina >= antesC.plataforma * 0.4) {
      emitir('contatos_sumiram', 'conta|contatos_sumiram|meta', { plataforma: 'meta', valor_medido: agoraC.oficina,
        mensagem: `Nos últimos 3 dias a Meta contou ${T.plural(Math.round(agoraC.plataforma), 'conversa', 'conversas')}, mas só ${agoraC.oficina} ${agoraC.oficina === 1 ? 'chegou' : 'chegaram'} à oficina (antes chegavam ${Math.round(antesC.oficina / antesC.plataforma * 100)}%). Confira se o WhatsApp do anúncio é o da oficina e se o aparelho está ligado.` });
    }
  }
  return { novos, suprimidos };
}

/* ------------------------------------------------------------
   Rodada 7: alertas do CICLO (anúncio -> orçamento -> carro). O radar também avisa
   quando um cliente de anúncio está esperando o consultor: orçamento que ele abriu e
   não respondeu, desconto pedido, carro pronto sem retirar... Um alerta por tipo, 24 h de cooldown.
   ------------------------------------------------------------ */
const CICLO_SEVERIDADE = { desconto_pedido: 'alerta', horario_pedido: 'alerta', orc_quente: 'alerta', pronto_parado: 'alerta', follow_vencido: 'alerta',
  validade_vencendo: 'alerta', aprovado_sem_os: 'alerta', orcamento_parado: 'alerta', lead_parado: 'alerta', orc_nao_aberto: 'info', sem_orcamento: 'info', valor_sugerido: 'info' };
/**
 * Pura: o aviso do ciclo sobe de "alerta" para "crítico" quando o cliente espera tempo demais:
 * desconto pedido há mais de 24 h, carro pronto há mais de 72 h, aprovado sem OS há mais de 7 dias.
 */
function severidadeDoCiclo(a) {
  const base = CICLO_SEVERIDADE[a?.tipo];
  if (!base) return null;
  const max = Math.max(0, ...((a.itens || []).map(i => Number(i.horas) || 0)));
  if (a.tipo === 'desconto_pedido' && max >= 24) return 'critico';
  if (a.tipo === 'pronto_parado' && max >= 72) return 'critico';
  if (a.tipo === 'aprovado_sem_os' && max >= 168) return 'critico';
  return base;
}
const brlR = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Pura: avisos do ciclo -> linhas de ads_alertas (nível conta; plataforma = canal que mais aparece nos itens). */
function alertasDoCiclo(acoes, { disparos = new Map(), agora = Date.now() } = {}) {
  const novos = [], suprimidos = [];
  if (!acoes || acoes.indisponivel) return { novos, suprimidos };
  for (const a of acoes.alertas || []) {
    const sev = severidadeDoCiclo(a);
    if (!sev || !(a.quantidade > 0)) continue;
    const chave = `ciclo|${a.tipo}`;
    const ultimo = disparos.get(chave);
    if (ultimo && agora - new Date(ultimo).getTime() < CRM_COOLDOWN_H * 3600000) { suprimidos.push({ chave }); continue; }
    const contagem = {};
    for (const it of a.itens || []) if (PLATAFORMAS.includes(it.canal)) contagem[it.canal] = (contagem[it.canal] || 0) + 1;
    const plataforma = Object.entries(contagem).sort((x, y) => y[1] - x[1])[0]?.[0] || 'meta';
    const nomes = (a.itens || []).slice(0, 3).map(it => `${String(it.nome || '').split(/\s+/)[0]}${it.valor > 0 ? ` (${brlR(it.valor)})` : ''}`).filter(Boolean).join(', ');
    novos.push({
      regra_id: null, regra_nome: 'Do anúncio à oficina', plataforma, nivel: 'conta', entidade_ext: `ciclo:${a.tipo}`, entidade_nome: 'Do anúncio à oficina',
      metrica: 'ciclo_' + a.tipo, valor_medido: a.quantidade, valor_limite: null, severidade: sev,
      mensagem: `${a.texto}${nomes ? ` Quem: ${nomes}${a.quantidade > 3 ? ' e outros' : ''}.` : ''}`, chave,
    });
    disparos.set(chave, new Date(agora).toISOString());
  }
  return { novos, suprimidos };
}

/**
 * Avalia todas as regras ativas.
 * @param {boolean} enviar  true = manda no WhatsApp; false = só simula.
 * @param {boolean} ignorarCooldown  true = útil no botão "testar agora".
 * @param {boolean} gravar  persiste em ads_alertas. Segue o `enviar` por
 *   padrão: sem isso, cada clique em "testar agora" enchia o histórico de
 *   alertas que ninguém recebeu — e eles ainda vazavam para o relatório.
 */
async function rodar({ enviar = true, ignorarCooldown = false, gravar = enviar, crm = true, ciclo = true, conta = crm } = {}) {
  const cfg = await db.lerConfig();
  const regras = await db.listarRegras({ somenteAtivas: true });
  const agora = Date.now();

  // Um único lookback cobre o maior cooldown configurado.
  const maiorCooldown = Math.max(24, ...regras.map(r => r.cooldown_horas || 24));
  const disparos = ignorarCooldown
    ? new Map()
    : await db.ultimosDisparos(new Date(agora - maiorCooldown * 3600000).toISOString());

  const novos = [], suprimidos = [];
  for (const regra of regras) {
    const { de, ate } = janela(regra.janela_dias, agora);
    const linhas = await db.lerMetricas({
      de, ate, nivel: regra.nivel, plataforma: regra.plataforma || null,
    });
    const r = avaliarRegra(regra, linhas, { disparos, agora });
    novos.push(...r.novos);
    suprimidos.push(...r.suprimidos);
  }

  // CRM: últimos 7 dias fechados. Falha do CRM não derruba o radar.
  let erroCRM = null;
  if (crm) {
    try {
      const { de, ate } = janela(7, agora);
      const r = await require('./resultados').resumo({ de, ate });
      const c = alertasDoCRM(r, { disparos, agora, cpaAlvo: cfg.cpa_alvo });
      novos.push(...c.novos);
      suprimidos.push(...c.suprimidos);
    } catch (e) { erroCRM = e.message; }
  }

  // Rodada 8: regras da conta inteira (do núcleo). Falha na leitura não derruba o radar.
  let erroConta = null;
  if (conta) {
    try {
      const { ate: ontem } = janela(1, agora);
      const de = somarDiaIso(ontem, -16);
      const [linhas, contatosMeta] = await Promise.all([db.lerMetricas({ de, ate: ontem, nivel: 'campanha' }), rodar.leitorContatosMeta({ de, ate: ontem })]);
      const c = alertasDaConta(linhas, { contatosMeta, ontem, disparos, agora });
      novos.push(...c.novos);
      suprimidos.push(...c.suprimidos);
    } catch (e) { erroConta = e.message; }
  }

  // Rodada 7: cliente de anúncio esperando o consultor. Orçador/Pátio fora do ar não derrubam o radar.
  let erroCiclo = null;
  if (ciclo) {
    try {
      const c = alertasDoCiclo(await rodar.leitorCiclo(), { disparos, agora });
      novos.push(...c.novos);
      suprimidos.push(...c.suprimidos);
    } catch (e) { erroCiclo = e.message; }
  }

  const gravados = (gravar && novos.length) ? await db.gravarAlertas(novos) : novos;

  // Sino dos gestores: todo alerta gravado vira notificação (além do
  // registro em ads_alertas), mesmo com o WhatsApp desligado ou fora.
  let notificacao = null;
  if (gravar && gravados.length) {
    try {
      const n = notificacaoDosAlertas(gravados);
      notificacao = await rodar.notificador.notificarGestores({ ...n, preferencia: 'ads_alertas' });
    } catch (e) { notificacao = { erro: e.message }; }
  }

  let envio = null;
  if (enviar && gravados.length && cfg.alertas_ativos && cfg.whatsapp_destinos?.length) {
    const texto = textoDoAlerta(gravados);
    // Rodada 5: pela fila do Comunicar; a chave (primeiro alerta da rodada) impede repetir a mesma rodada.
    const ids = gravados.map(a => a.id).filter(Boolean).sort();
    envio = await whatsapp.enviarParaTodos(cfg.whatsapp_destinos, texto, { chave: ids.length ? `ads:radar:${ids[0]}` : null });
    if (gravar && envio.some(e => e.ok)) await db.marcarAlertasEnviados(gravados.map(a => a.id));
  }

  return {
    avaliadas: regras.length,
    simulacao: !gravar,
    disparados: gravados.length,
    suprimidos: suprimidos.length,
    alertas: gravados,
    envio,
    notificacao,
    erro_crm: erroCRM,
    erro_ciclo: erroCiclo,
    erro_conta: erroConta,
    motivo_sem_envio: !enviar ? 'simulação'
      : !gravados.length ? 'nada disparou'
      : !cfg.alertas_ativos ? 'alertas desligados na configuração'
      : !cfg.whatsapp_destinos?.length ? 'nenhum número de destino cadastrado'
      : envio && !envio.some(e => e.ok) ? `envio falhou: ${envio.map(e => e.erro).filter(Boolean)[0] || 'motivo desconhecido'}`
      : null,
  };
}

/* Injetável nos testes: a leitura do ciclo (Orçador + Pátio). */
rodar.leitorCiclo = () => require('./ciclo').acoes();

/* Injetável nos testes: contatos que chegaram pela Meta, por dia (a jornada, pela fonte das rotas novas). */
rodar.leitorContatosMeta = async ({ de, ate }) => {
  const S = require('./motor/soma');
  const { itens } = await require('./motor/fonte').padrao().contatos({ de, ate });
  const porDia = new Map();
  for (const i of itens) if (S.plataformaDe(i) === 'meta') { const d = S.diaDe(i); if (d) porDia.set(d, (porDia.get(d) || 0) + 1); }
  return porDia;
};

/* Injetável nos testes; por padrão, a equipe no banco. */
rodar.notificador = { notificarGestores: (...a) => require('./equipe').banco().notificarGestores(...a) };

/** Notificação (pura) de uma rodada de alertas: título, corpo curto e chave sem repetição. */
function notificacaoDosAlertas(alertas) {
  const ordenados = [...alertas].sort((a, b) => (ORDEM[a.severidade] ?? 3) - (ORDEM[b.severidade] ?? 3));
  const criticos = ordenados.filter(a => a.severidade === 'critico').length;
  const n = ordenados.length;
  const titulo = criticos
    ? `Radar: ${criticos} alerta(s) crítico(s)${n > criticos ? ` e mais ${n - criticos}` : ''}`
    : `Radar: ${n} alerta(s) de tráfego`;
  const corpo = ordenados.slice(0, 3).map(a => String(a.mensagem || '').split(/[\r\n]/)[0].slice(0, 120)).join(' · ')
    + (n > 3 ? ` · +${n - 3}` : '');
  const ids = ordenados.map(a => a.id).filter(Boolean).sort();
  return { tipo: 'ads_alerta', titulo, corpo: corpo.slice(0, 400), link: '/?aba=radar',
    chave: ids.length ? `ads-alerta-${ids[0]}` : null };
}

const ICONE = { critico: '🔴', alerta: '🟠', info: '🔵' };
const ORDEM = { critico: 0, alerta: 1, info: 2 };

function textoDoAlerta(alertas) {
  const ordenados = [...alertas].sort((a, b) => (ORDEM[a.severidade] ?? 3) - (ORDEM[b.severidade] ?? 3));
  const linhas = ordenados.map(a => `${ICONE[a.severidade] || '•'} ${a.mensagem}`);
  const criticos = ordenados.filter(a => a.severidade === 'critico').length;
  const cabecalho = criticos
    ? `⚠️ *IndyCar · Radar de tráfego* — ${criticos} ${criticos === 1 ? 'item crítico' : 'itens críticos'}`
    : '📡 *IndyCar · Radar de tráfego*';
  const rodape = '_Avaliado sobre dias fechados. Abra o painel para ver o histórico._';
  return Vocab.limpar([cabecalho, linhas.join(NL + NL), rodape].join(NL + NL));
}

module.exports = {
  rodar, alertasDaConta, CONTA_TIPOS, alertasDoCiclo, severidadeDoCiclo, CICLO_SEVERIDADE, notificacaoDosAlertas, janela, textoDoAlerta, alertasDoCRM, CRM_TIPOS, montarMensagem, avaliarRegra, validarRegra,
  NIVEIS, PLATAFORMAS, SEVERIDADES, METRICAS, COMPARA,
};
