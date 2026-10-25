/* ============================================================
   IA DO FUNIL (rodada 5 — 16/10/2026)
   O copiloto deixa de só sugerir e passa a CONDUZIR o atendimento pelo
   WhatsApp, respeitando a autonomia configurada em `ia_config`
   (geral + por etapa: responder, agendar, crm, humano).

   Caminho: mensagem do cliente → gatilho `at_ia_enfileirar` (banco) grava
   em `at_ia_fila` e acorda este servidor (POST /api/ia/funil/acordar com o
   token do webhook) → `processarFila()` agrupa por conversa e chama
   `conduzir()`:
     1. identifica o cliente pelo telefone (rpc cliente_360, via lib/contexto)
        e religa `conversas.cliente_id` quando estava solto;
     2. conversa de quem já tem horário marcado vai para "Agendado"
        (achado do simulador: nascia em "Primeiro contato");
     3. decide se é caso de HUMANO (preço, urgência, pede pessoa, reclamação)
        por regra do sistema, além do julgamento da IA;
     4. roda o copiloto em modo funil (lib/ia-copiloto.js → PAPEL_FUNIL):
        automatico executa (inclusive agendar e responder), confirmar deixa
        a proposta e AVISA o dono da conversa (rpc notificar) para um clique,
        sugerir só propõe;
     5. registra tudo em `ia_acoes` (perfil_id nulo = foi a IA sozinha).

   Nunca manda mensagem se um atendente humano escreveu nos últimos 30 min
   (aí a mensagem vira proposta para ele). Nunca inventa preço nem prazo —
   quem valida é o copiloto. Testado em test/ia-funil.test.js com banco e IA
   de mentira.
   ============================================================ */
'use strict';

const CTX = require('./contexto.js');
const R6 = require('../public/r6-regras.js');

const HUMANO_RECENTE_MIN = 30;
/* Rodada 6: trava contra laço — a IA não manda mais que isto por conversa por hora (o resto vira proposta para a equipe). */
const LIMITE_IA_POR_HORA = 6;
const INTERVALO_FILA_MS = 15_000;
/* Rodada 7 (C4): a IA não responde sozinha mensagem velha (o cliente pode ter resolvido por outro meio, e depois de dias
   com o WhatsApp parado isso viraria uma enxurrada de "bom dia" atrasados): vira proposta para uma pessoa revisar. */
const ANTIGA_MIN = 12 * 60;
/* Passou de 2 h esperando: a resposta começa pedindo desculpa pela demora. */
const DEMORA_DESCULPA_MIN = 120;
/* Cliente mandando mensagem em rajada (colando texto, robô, brincadeira): a IA para e uma pessoa olha. */
const RAJADA_MENSAGENS = 8;
const RAJADA_JANELA_MIN = 3;
const LOTE = 8;

/* Regras do sistema para passar para gente (a IA também julga, mas isto não depende dela).
   "Quero um orçamento" NÃO entra aqui de propósito: numa oficina isso é pedido de diagnóstico
   (gratuito) + horário, que a IA conduz; só a pergunta de VALOR vai para o consultor. */
const RE_PRECO = /\b(pre[çc]os?|cust(a|am|o|os)|cobram?|valor(es)?|quanto\s+(custa|fica|sai|vai\s+ficar|que\s+fica|cobra|[ée])|caro|barato|desconto|parcel\w*)\b/i;
const RE_URGENCIA = /\b(socorro|urgente|urg[êe]ncia|parou|n[ãa]o\s+(liga|pega|anda|freia)|na\s+estrada|no\s+meio\s+da\s+(rua|pista|estrada)|acidente|bati|fuma[çc]a|fogo|pegando\s+fogo|guincho|reboque|agora\s+mesmo)\b|\bAGORA\b/;
const RE_PESSOA = /\b(falar\s+com\s+(alguém|alguem|uma\s+pessoa|um\s+atendente|um\s+humano|o\s+dono|o\s+gerente|um\s+consultor|um\s+mec[âa]nico)|atendente\s+humano|quero\s+uma\s+pessoa|(é|e|eh)\s+(um\s+)?rob[oô]|n[ãa]o\s+quero\s+falar\s+com\s+(rob[oô]|m[áa]quina|ia|intelig))/i;
const RE_RECLAMACAO = /\b(reclama\w*|p[ée]ssimo|horr[íi]vel|absurdo|vergonha|procon|advogado|processar|enganad\w*|voltou\s+(o\s+)?(problema|barulho|defeito)|n[ãa]o\s+resolveu|fizeram\s+errado|cobraram\s+errado|insatisfeit\w*)\b/i;

/* PARAR de verdade: a mensagem INTEIRA é o pedido ("PARAR", "stop", "não quero mais receber"). Frase solta como
   "quero cancelar o horário" não conta. A IA não responde a quem pediu para parar. */
const RE_PARAR_TOTAL = /^\s*(parar|pare|p[aá]ra|stop|sair|descadastrar|descadastre|n[aã]o\s+quero\s+(mais\s+)?receber(\s+mais)?(\s+(mensagens?|msgs?|propagandas?|nada))?|chega\s+de\s+mensagens?)[\s.!]*$/i;
function pediuParar(textos = []) {
  return (Array.isArray(textos) ? textos : [textos]).some(x => RE_PARAR_TOTAL.test(String(x || '').replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')));
}

/** Motivo para passar a um humano, olhando as mensagens do cliente desde a última resposta da loja. */
function precisaHumano(textos = []) {
  const t = (Array.isArray(textos) ? textos : [textos]).map(x => String(x || '')).join('\n');
  if (!t.trim()) return null;
  if (R6.detectarManipulacao(t).suspeita) return 'manipulacao';   // Rodada 7: ordem escondida em mensagem de cliente
  if (RE_URGENCIA.test(t)) return 'urgencia';
  if (RE_RECLAMACAO.test(t)) return 'reclamacao';
  if (RE_PESSOA.test(t)) return 'pediu_pessoa';
  if (R6.oQueOClientePediu([t]).includes('negociacao')) return 'negociacao';   // Rodada 7: negociar valor é com o consultor
  if (RE_PRECO.test(t)) return 'preco';
  /* Rodada 6: regras extras (sem acento, mais palavras): pedido de ligação, só áudio/foto, nota fiscal, cancelar. */
  const extra = R6.motivoParaHumano(textos);
  return extra === 'pessoa' ? 'pediu_pessoa' : extra;
}

/* Contrato do Site (rodada 5): a mensagem do botão do site começa com "Olá! Vim pelo site" e, com
   serviço, "quero orçar: <serviço>." seguido de "(site/<código>)"; campanha paga vira "(site/cambio--meta)". */
const RE_SITE = /\(site\/([a-z0-9_-]+?)(?:--([a-z0-9_-]+))?\)/i;
function origemDoSite(textos = []) {
  const t = (Array.isArray(textos) ? textos : [textos]).map(x => String(x || '')).join('\n');
  if (!/vim pelo site/i.test(t) && !RE_SITE.test(t)) return null;
  const m = RE_SITE.exec(t);
  const serv = /quero or[çc]ar:\s*([^.\n(]+)/i.exec(t);
  return { site: true, servico: serv ? serv[1].trim() : null, codigo: m ? m[1] : null, campanha: m && m[2] ? m[2] : null };
}

/** As mensagens do cliente depois da última resposta da loja (o que ainda não foi tratado). */
function textosSemResposta(mensagens = []) {
  const out = [];
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m.direcao === 'saida') break;
    if (m.direcao === 'entrada') out.unshift(String(m.corpo || ''));
  }
  return out;
}

/** Rodada 7: há quantos minutos o cliente espera (primeira mensagem dele depois da última resposta da loja). null = não espera. */
function minutosEsperando(mensagens = [], agora = new Date()) {
  let primeira = null;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (!m) continue;
    if (m.direcao === 'saida') break;
    if (m.direcao === 'entrada' && Number.isFinite(Date.parse(m.created_at || ''))) primeira = m;
  }
  return primeira ? Math.max(0, Math.round((Number(agora) - Date.parse(primeira.created_at)) / 60000)) : null;
}
/** Rodada 7: rajada de mensagens do cliente nos últimos minutos. */
function emRajada(mensagens = [], agora = new Date(), { minimo = RAJADA_MENSAGENS, janelaMin = RAJADA_JANELA_MIN } = {}) {
  const limite = Number(agora) - janelaMin * 60_000;
  return (mensagens || []).filter(m => m && m.direcao === 'entrada' && Date.parse(m.created_at || '') >= limite).length >= minimo;
}

/** Um atendente humano (não a IA) escreveu nos últimos `min` minutos? */
function humanoEscreveuRecentemente(mensagens = [], agora = new Date(), min = HUMANO_RECENTE_MIN) {
  const limite = Number(agora) - min * 60_000;
  return (mensagens || []).some(m => m && m.direcao === 'saida' && !m.gerada_por_ia
    && Number.isFinite(Date.parse(m.created_at || '')) && Date.parse(m.created_at) >= limite
    && !/^\s*\[sistema\]/i.test(String(m.corpo || '')));
}

/** Cliente com horário futuro e conversa ainda na primeira etapa (ou sem etapa) → etapa "Agendado". */
function etapaAgendadoPendente(ficha = {}) {
  const futuros = ficha.agendamentos?.futuros || [];
  if (!futuros.length) return null;
  const etapas = ficha.funil?.etapas || [];
  const alvo = etapas.find(e => /^agendad/i.test(String(e.nome || '')));
  if (!alvo) return null;
  const atual = ficha.funil?.etapaAtual;
  if (!atual) return alvo;
  if (atual.id === alvo.id) return null;
  const primeira = etapas.slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))[0];
  return primeira && primeira.id === atual.id ? alvo : null;
}

function criarFunil({ sb, copiloto, contexto, agora = () => new Date(), log = console.error, zapParado = () => ({ parado: false }), enviarMensagem = null } = {}) {
  if (!sb || !copiloto || !contexto) throw new Error('funil sem banco, copiloto ou contexto');
  let processando = false, relogio = null, pedidoPendente = null;

  async function registrar(linha) {
    try { return await copiloto.registrar({ status: 'executada', executada_em: agora().toISOString(), ...linha }); }
    catch (e) { log('funil registrar:', e.message); return null; }
  }

  async function destinosDoAviso(conv) {
    if (conv.atribuida_a) return [conv.atribuida_a];
    const { data } = await sb.from('perfis').select('id,papel,ativo,apps,recebe_leads').eq('ativo', true);
    return (data || []).filter(p => ['admin', 'gestor'].includes(p.papel) || (p.recebe_leads && (p.apps || []).includes('atendimento'))).map(p => p.id);
  }

  /** Nível "confirmar": o dono (ou os gestores) recebe um aviso com um clique para aprovar. */
  async function avisarDono(conv, propostas, runId) {
    if (!propostas.length) return 0;
    const nome = (conv.nome && String(conv.nome).trim()) || conv.telefone || 'Cliente';
    const resumos = propostas.map(p => p.resumo).filter(Boolean);
    const titulo = `✨ IA propôs para ${nome}: ${resumos[0] || propostas[0].tipo}`.slice(0, 140);
    const corpo = (resumos.length > 1 ? `${resumos.length} propostas: ${resumos.join(' · ')}` : 'Abra a conversa e aprove com um clique.').slice(0, 400);
    let avisos = 0;
    for (const id of await destinosDoAviso(conv)) {
      const { data, error } = await sb.rpc('notificar', { p_perfil: id, p_tipo: 'ia', p_titulo: titulo, p_corpo: corpo,
        p_link: `/?conversa=${conv.id}`, p_app: 'atendimento', p_chave: `ia-proposta:${conv.id}:${runId || Date.now()}` });
      if (!error && data) avisos++;
    }
    return avisos;
  }

  /** Rodada 7: a mensagem tenta dar ordens à IA/sistema. Nada de IA, nada de ação: marca, avisa quem cuida e (se der) manda o texto neutro. */
  async function bloquearManipulacao({ conversaId, conv, f, textos, podeResponder, cfg, expediente, feitas }) {
    const manip = R6.detectarManipulacao((textos || []).join(String.fromCharCode(10)));
    const trecho = R6.campoSeguro((textos || []).join(' '), 120) || '(texto suspeito omitido)';
    const a = await registrar({ tipo: 'bloqueio_manipulacao', conversa_id: conversaId, cliente_id: conv.cliente_id || null, perfil_id: null,
      resumo: 'Mensagem tentou dar ordens à IA: bloqueada, uma pessoa assume', entrada: { motivos: manip.motivos, nivel: manip.nivel, trecho },
      saida: { automatica: true, bloqueada: true } });
    feitas.push({ tipo: 'bloqueio_manipulacao', id: a?.id || null });
    const niveis = cfg.funil_niveis || {};
    if (niveis.humano !== 'sugerir') {
      await sb.from('conversas').update({ aguardando_consultor: true, aguardando_desde: conv.aguardando_consultor ? undefined : agora().toISOString() }).eq('id', conversaId);
    }
    let avisos = 0;
    try {
      const nome = R6.nomeSeguro(f.cliente?.nome || conv.nome || '') || conv.telefone || 'Cliente';
      for (const id of await destinosDoAviso(conv)) {
        const { data, error } = await sb.rpc('notificar', { p_perfil: id, p_tipo: 'ia', p_titulo: `🛡 Mensagem suspeita de ${nome}: a IA não leu`.slice(0, 140),
          p_corpo: 'A mensagem tenta dar ordens à IA. Nada foi feito; confira e responda você mesmo.', p_link: `/?conversa=${conversaId}`, p_app: 'atendimento', p_chave: `ia-manip:${conversaId}:${a?.id || Date.now()}` });
        if (!error && data) avisos++;
      }
    } catch (e) { log('funil manipulação:', e.message); }
    let encaminhou = null;
    if (podeResponder && typeof enviarMensagem === 'function' && niveis.responder === 'automatico') {
      try {
        const texto = R6.textoDeEncaminhamento('manipulacao', R6.nomeSeguro(f.cliente?.nome || conv.nome || ''), !expediente.aberta);
        const env = await enviarMensagem({ conversa: conv, cliente_id: conv.cliente_id || f.cliente?.id || null, texto });
        if (env && env.mensagem_id) encaminhou = env.mensagem_id;
      } catch (e) { log('funil manipulação envio:', e.message); }
    }
    contexto.invalidar(conversaId);
    return { ok: true, status: 'pulada', motivo: 'mensagem suspeita: a IA não leu', manipulacao: manip, humano: 'manipulacao', encaminhou, avisos, feitas };
  }

  /**
   * Conduz UMA conversa agora. Devolve { ok, status: 'feita'|'pulada'|'erro', motivo?, ... }.
   */
  async function conduzir(conversaId, { origem = 'fila' } = {}) {
    const cfg = await copiloto.lerConfig();
    if (!cfg.ativo) return { ok: true, status: 'pulada', motivo: 'IA desligada' };
    if (cfg.funil_ativo === false) return { ok: true, status: 'pulada', motivo: 'IA do funil desligada' };
    const ctx = await contexto.montarContexto(conversaId, { forcar: true });
    if (!ctx.ok) return { ok: false, status: 'erro', motivo: ctx.erro || 'conversa não encontrada' };
    const f = ctx.ficha;
    const conv = f.conversa;
    if ((conv.tipo || 'atendimento') !== 'atendimento') return { ok: true, status: 'pulada', motivo: 'conversa de disparo' };
    const sit = CTX.situacaoDaConversa(f.mensagens || [], agora());
    const feitas = [];

    // 1) cliente reconhecido pelo telefone: religa a conversa ao cadastro
    if (f.ligadoPeloTelefone && !conv.cliente_id) {
      const { error } = await sb.from('conversas').update({ cliente_id: f.ligadoPeloTelefone }).eq('id', conversaId).is('cliente_id', null);
      if (!error) {
        conv.cliente_id = f.ligadoPeloTelefone;
        const a = await registrar({ tipo: 'vincular_cliente', conversa_id: conversaId, cliente_id: f.ligadoPeloTelefone, perfil_id: null,
          resumo: `Cliente reconhecido pelo telefone: ${f.cliente?.nome || 'cadastro existente'}`, entrada: { telefone: conv.telefone_e164 || conv.telefone }, saida: { automatica: true } });
        feitas.push({ tipo: 'vincular_cliente', id: a?.id || null });
      }
    }

    // 2) já tem horário marcado e a conversa nasceu em "Primeiro contato" → "Agendado"
    const alvo = etapaAgendadoPendente(f);
    if (alvo) {
      let q = sb.from('conversas').update({ etapa_id: alvo.id, etapa_por_ia: true }).eq('id', conversaId);
      q = f.funil.etapaAtual ? q.eq('etapa_id', f.funil.etapaAtual.id) : q.is('etapa_id', null);
      const { data, error } = await q.select('id');
      if (!error && data?.length) {
        const a = await registrar({ tipo: 'mover_etapa', conversa_id: conversaId, cliente_id: conv.cliente_id || null, perfil_id: null,
          resumo: `Mover para "${alvo.nome}" (cliente já tem horário marcado)`,
          entrada: { etapa_id: alvo.id, etapa: alvo.nome, antes: { etapa_id: f.funil.etapaAtual?.id || null, etapa: f.funil.etapaAtual?.nome || null } },
          saida: { automatica: true, antes: { etapa_id: f.funil.etapaAtual?.id || null, etapa: f.funil.etapaAtual?.nome || null }, depois: { etapa_id: alvo.id, etapa: alvo.nome } } });
        feitas.push({ tipo: 'mover_etapa', id: a?.id || null, etapa: alvo.nome });
        f.funil.etapaAtual = { id: alvo.id, nome: alvo.nome };
      }
    }

    if (!sit.semResposta) return { ok: true, status: 'pulada', motivo: 'já respondida', feitas };

    const textos = textosSemResposta(f.mensagens || []);

    // 2b) PARAR: quem pediu para parar não recebe resposta da IA; desliga as mensagens automáticas (desfazível)
    if (pediuParar(textos)) {
      const clienteId = conv.cliente_id || f.cliente?.id || null;
      if (clienteId && f.cliente?.aceita_mensagens !== false) {
        const quando = agora().toISOString();
        const antes = { aceita_mensagens: true, aceita_mensagens_em: f.cliente?.aceita_mensagens_em || null, aceita_mensagens_motivo: f.cliente?.aceita_mensagens_motivo || null };
        const depois = { aceita_mensagens: false, aceita_mensagens_em: quando, aceita_mensagens_motivo: 'pediu pelo WhatsApp: PARAR (IA do funil)' };
        const { error } = await sb.from('clientes').update(depois).eq('id', clienteId);
        if (!error) {
          await sb.from('posvenda_envios').update({ status: 'pulado', motivo_pulado: 'cliente pediu para parar' }).eq('status', 'pendente').eq('cliente_id', clienteId);
          const a = await registrar({ tipo: 'atualizar_ficha', conversa_id: conversaId, cliente_id: clienteId, perfil_id: null,
            resumo: 'Cliente pediu PARAR: mensagens automáticas desligadas', entrada: { campos: { aceita_mensagens: false } },
            saida: { automatica: true, cliente_id: clienteId, antes, depois } });
          feitas.push({ tipo: 'atualizar_ficha', id: a?.id || null, parar: true });
        }
      }
      return { ok: true, status: 'pulada', motivo: 'cliente pediu para parar', feitas };
    }

    // 3) humano? (regra do sistema; a IA também julga)
    const humano = precisaHumano(textos);
    // veio pelo botão do site? a IA já sabe o serviço e a origem — não pergunta de novo
    const site = origemDoSite(textos);
    const instrucao = site ? `O CLIENTE VEIO PELO SITE${site.campanha ? ` (campanha ${site.campanha})` : ''}${site.servico ? ` pedindo orçamento de "${site.servico}": não pergunte o serviço; chame "registrar_interesse" com ele` : ''}. Pergunte só o carro (se a ficha não tiver) e ofereça o diagnóstico digital gratuito com duas opções de horário.` : null;
    // humano assumiu (botão Assumir grava assumida_em) OU escreveu há pouco: a IA só sugere, não envia
    let podeResponder = !conv.assumida_em && !humanoEscreveuRecentemente(f.mensagens || [], agora());
    // Rodada 6: WhatsApp fora do ar → nada sai sozinho (vira proposta para a equipe), sem insistir nem gastar cota
    const zap = (() => { try { return zapParado() || { parado: false }; } catch { return { parado: false }; } })();
    if (zap.parado) podeResponder = false;
    // Rodada 6: trava contra laço — muitas mensagens da IA seguidas nesta conversa
    let limiteHora = false;
    if (podeResponder) {
      const desde = new Date(agora().getTime() - 3600_000).toISOString();
      const { data: ultimas } = await sb.from('whatsapp_mensagens').select('id').eq('conversa_id', conversaId).eq('direcao', 'saida').eq('gerada_por_ia', true).gte('created_at', desde).limit(LIMITE_IA_POR_HORA + 1);
      if ((ultimas || []).length >= LIMITE_IA_POR_HORA) { podeResponder = false; limiteHora = true; }
    }
    // Rodada 6: oficina fechada → a IA sabe e não promete resposta imediata
    const expediente = R6.oficinaAberta(agora());
    const instrucaoFinal = [instrucao, !expediente.aberta ? `A oficina está FECHADA agora (reabre ${expediente.reabre}, seg–sáb 8h às 17h30): diga isso com naturalidade e não prometa resposta imediata de consultor.` : null].filter(Boolean).join(' ') || null;

    // 3b) Rodada 7: mensagem velha e rajada não saem sozinhas; demora grande pede desculpa
    const esperaMin = minutosEsperando(f.mensagens || [], agora());
    let antiga = false, rajada = false;
    if (esperaMin !== null && esperaMin > ANTIGA_MIN && podeResponder) { podeResponder = false; antiga = true; }
    if (emRajada(f.mensagens || [], agora()) && podeResponder) { podeResponder = false; rajada = true; }
    const instrucaoDemora = !antiga && esperaMin !== null && esperaMin > DEMORA_DESCULPA_MIN
      ? `O cliente espera há ${R6.rotuloMinutos(esperaMin)}: comece pedindo desculpa pela demora, em meia frase e sem exagero.` : null;

    // 3c) Rodada 7: tentativa de dar ordens à IA pela mensagem → a IA nem lê; uma pessoa assume
    if (humano === 'manipulacao') {
      return bloquearManipulacao({ conversaId, conv, f, textos, podeResponder, cfg, expediente, feitas });
    }

    // 4) a IA conduz
    let r;
    try { r = await copiloto.rodar({ conversaId, perfil: null, funil: { humano, podeResponder, origem, instrucao: [instrucaoFinal, instrucaoDemora].filter(Boolean).join(' ') || null, site } }); }
    catch (e) { return { ok: false, status: 'erro', motivo: e.message || 'falha na IA', feitas }; }
    if (!r.ok) return { ok: false, status: r.status === 429 || r.status === 503 ? 'pulada' : 'erro', motivo: r.erro || 'IA não respondeu', feitas };

    /* 4b) Rodada 6: caso de gente e a IA não respondeu o cliente (calada, recusou, só propôs): o cliente nunca fica no vácuo.
       Sai a mensagem de encaminhamento do SISTEMA (sem preço, uma pergunta) e a conversa fica "aguardando consultor". */
    let encaminhou = null;
    const niveisR = r.niveis || {};
    if (humano && podeResponder && typeof enviarMensagem === 'function' && niveisR.responder === 'automatico'
        && !(r.enviadas || []).length && !(r.para_confirmar || []).some(p => p.tipo === 'responder')) {
      try {
        const nome = f.cliente?.nome || conv.nome || '';
        const texto = R6.textoDeEncaminhamento(humano === 'pediu_pessoa' ? 'pessoa' : humano, nome, !expediente.aberta);
        if (!R6.textoTemPreco(texto)) {
          const env = await enviarMensagem({ conversa: conv, cliente_id: conv.cliente_id || f.cliente?.id || null, texto });
          if (env && env.mensagem_id) {
            await registrar({ tipo: 'responder', conversa_id: conversaId, cliente_id: conv.cliente_id || null, perfil_id: null,
              resumo: `Encaminhei para o consultor (${R6.MOTIVO_HUMANO[humano === 'pediu_pessoa' ? 'pessoa' : humano]?.rotulo || humano})`,
              entrada: { texto, fallback: 'encaminhamento', motivo: humano }, saida: { enviada: true, automatica: true, mensagem_id: env.mensagem_id, entregue: !!env.ok } });
            encaminhou = env.mensagem_id;
            if (niveisR.humano !== 'sugerir') {
              await sb.from('conversas').update({ aguardando_consultor: true, aguardando_desde: agora().toISOString() }).eq('id', conversaId);
            }
          }
        }
      } catch (e) { log('funil encaminhar:', e.message); }
    }

    // 5) nível "confirmar": avisa quem está com a conversa
    let avisos = 0;
    if (r.para_confirmar?.length) avisos = await avisarDono(conv, r.para_confirmar, r.id).catch(() => 0);
    contexto.invalidar(conversaId);

    return {
      ok: true, status: 'feita', run_id: r.id, humano, podeResponder, site, feitas, antiga, rajada, espera_min: esperaMin, zap_parado: !!zap.parado, limite_hora: limiteHora, encaminhou,
      enviadas: (r.enviadas || []).length, para_confirmar: (r.para_confirmar || []).length, avisos,
      executadas: (r.acoes || []).filter(a => a.status === 'executada').map(a => a.tipo),
      propostas: (r.acoes || []).filter(a => a.status === 'proposta').map(a => a.tipo),
      intencao: r.intencao || null, temperatura: r.temperatura || null, proxima_acao: r.proxima_acao?.texto || null,
      duracao_ms: r.duracao_ms,
    };
  }

  /** Há trabalho vencido na fila? */
  async function pendentes() {
    const { data, error } = await sb.from('at_ia_fila').select('id,conversa_id,agendado_para,created_at')
      .eq('status', 'pendente').order('agendado_para', { ascending: true }).limit(200);
    if (error) { log('fila da IA:', error.message); return []; }
    return data || [];
  }

  /** Drena a fila: agrupa por conversa, pula quem ainda está digitando, conduz e marca o resultado. */
  async function processarFila({ limite = LOTE } = {}) {
    if (processando) return { pulou: 'já rodando' };
    processando = true;
    const saida = { conversas: 0, feitas: 0, puladas: 0, erros: 0 };
    try {
      const todas = await pendentes();
      if (!todas.length) return saida;
      const agoraIso = agora().toISOString();
      const porConversa = new Map();
      for (const l of todas) { if (!porConversa.has(l.conversa_id)) porConversa.set(l.conversa_id, []); porConversa.get(l.conversa_id).push(l); }
      let feitasAgora = 0;
      for (const [conversaId, linhas] of porConversa) {
        if (feitasAgora >= limite) break;
        // cliente ainda digitando (há linha agendada para o futuro): espera a próxima rodada
        if (linhas.some(l => l.agendado_para > agoraIso)) continue;
        const ids = linhas.map(l => l.id);
        const { data: pegas } = await sb.from('at_ia_fila').update({ status: 'processando', iniciado_em: agoraIso }).in('id', ids).eq('status', 'pendente').select('id');
        if (!pegas?.length) continue;                      // outro servidor pegou
        feitasAgora++;
        saida.conversas++;
        let r;
        try { r = await conduzir(conversaId, { origem: 'fila' }); }
        catch (e) { r = { ok: false, status: 'erro', motivo: e.message || 'falha' }; }
        const status = r.status === 'feita' ? 'feita' : r.status === 'pulada' ? 'pulada' : 'erro';
        saida[status === 'feita' ? 'feitas' : status === 'pulada' ? 'puladas' : 'erros']++;
        const { motivo, ...resto } = r;
        await sb.from('at_ia_fila').update({ status, motivo: motivo ? String(motivo).slice(0, 200) : null,
          concluido_em: agora().toISOString(), resultado: resto }).in('id', pegas.map(p => p.id));
      }
      return saida;
    } finally { processando = false; }
  }

  /** Alguém avisou que há mensagem nova: processa daqui a pouco (respeita a espera da fila). */
  function acordar({ atrasoMs = 1500 } = {}) {
    if (pedidoPendente) return false;
    pedidoPendente = setTimeout(async () => {
      pedidoPendente = null;
      try {
        const r = await processarFila();
        // sobrou linha ainda não vencida (cliente digitando)? volta em 8 s
        const resto = await pendentes();
        if (resto.length) acordar({ atrasoMs: 8_500 });
        return r;
      } catch (e) { log('funil acordar:', e.message); }
    }, atrasoMs);
    pedidoPendente.unref?.();
    return true;
  }

  /** Subiu agora (Render reiniciou/deploy): linha "processando" há mais de 2 min é de um processo que morreu — volta para a fila
      em vez de esperar os 5 min do pg_cron. Mais novas ficam (pode ser a instância antiga terminando o deploy). */
  async function recuperarTravadas({ minSeg = 120 } = {}) {
    try {
      const limite = new Date(agora().getTime() - minSeg * 1000).toISOString();
      const { data } = await sb.from('at_ia_fila').select('id,tentativas').eq('status', 'processando').lt('iniciado_em', limite).limit(50);
      for (const l of data || []) {
        await sb.from('at_ia_fila').update({ status: 'pendente', tentativas: (l.tentativas || 0) + 1, iniciado_em: null }).eq('id', l.id).eq('status', 'processando');
      }
      return (data || []).length;
    } catch (e) { log('funil recuperar:', e.message); return 0; }
  }

  function ligar({ intervaloMs = INTERVALO_FILA_MS, atrasoMs = 3_000 } = {}) {
    if (relogio) return false;
    recuperarTravadas().finally(() => acordar({ atrasoMs }));  // acabou de subir (acordou?): recupera as travadas e drena o que ficou
    relogio = setInterval(() => { pendentes().then(p => { if (p.length) acordar({ atrasoMs: 10 }); }).catch(() => {}); }, intervaloMs);
    relogio.unref?.();
    return true;
  }
  function desligar() { if (relogio) clearInterval(relogio); relogio = null; if (pedidoPendente) clearTimeout(pedidoPendente); pedidoPendente = null; }

  /** Estado da fila para a tela (hoje). */
  async function estado() {
    const desde = copiloto.inicioDoDia();
    const { data, error } = await sb.from('at_ia_fila').select('id,status,conversa_id,created_at,concluido_em,motivo').gte('created_at', desde).limit(2000);
    if (error) return { ok: false, erro: error.message };
    const por = { pendente: 0, processando: 0, feita: 0, pulada: 0, erro: 0 };
    for (const l of data || []) por[l.status] = (por[l.status] || 0) + 1;
    return { ok: true, hoje: por, processando: (data || []).filter(l => l.status === 'processando').map(l => l.conversa_id) };
  }

  /** "IA em ação": o que a IA fez hoje, por conversa (para a tela). */
  async function hoje({ limite = 300 } = {}) {
    const desde = copiloto.inicioDoDia();
    const { data, error } = await sb.from('ia_acoes')
      .select('id,tipo,status,resumo,conversa_id,cliente_id,perfil_id,created_at,executada_em,erro,saida,entrada')
      .eq('origem', 'atendimento').gte('created_at', desde).order('created_at', { ascending: false }).limit(limite);
    if (error) return { ok: false, status: 503, erro: error.message };
    const acoes = (data || []).filter(a => !['classificar', 'resumir', 'config', 'sugerir', 'classificar_etapa', 'resumo_do_dia'].includes(a.tipo));
    const ids = [...new Set(acoes.map(a => a.conversa_id).filter(Boolean))];
    let nomes = {};
    if (ids.length) {
      const { data: convs } = await sb.from('conversas').select('id,nome,telefone,etapa_id,atribuida_a').in('id', ids.slice(0, 200));
      nomes = Object.fromEntries((convs || []).map(c => [c.id, c]));
    }
    const grupos = new Map();
    for (const a of acoes) {
      const k = a.conversa_id || 'sem';
      if (!grupos.has(k)) grupos.set(k, { conversa_id: a.conversa_id, nome: nomes[k]?.nome || null, telefone: nomes[k]?.telefone || null, atribuida_a: nomes[k]?.atribuida_a || null, acoes: [] });
      grupos.get(k).acoes.push({ id: a.id, tipo: a.tipo, status: a.status, resumo: a.resumo, created_at: a.created_at, executada_em: a.executada_em,
        sozinha: !a.perfil_id && (a.status === 'executada' || a.status === 'proposta') && a.tipo !== 'copiloto',
        automatica: !!a.saida?.automatica || !!a.saida?.enviada, erro: a.erro || null,
        reversivel: a.status === 'executada' && ['agendar', 'remarcar', 'cancelar_agendamento', 'mover_etapa', 'atualizar_ficha', 'registrar_interesse', 'marcar_aguardando_consultor', 'agendar_retorno', 'criar_tarefa'].includes(a.tipo),
        enviada: !!a.saida?.enviada, texto: a.tipo === 'responder' ? (a.entrada?.texto || null) : null });
    }
    const totais = { conversas: grupos.size, executadas: 0, propostas: 0, enviadas: 0, agendamentos: 0, humano: 0, erros: 0 };
    for (const a of acoes) {
      if (a.tipo === 'copiloto') continue;
      if (a.status === 'executada') totais.executadas++;
      if (a.status === 'proposta') totais.propostas++;
      if (a.status === 'erro') totais.erros++;
      if (a.tipo === 'responder' && a.saida?.enviada) totais.enviadas++;
      if (a.tipo === 'agendar' && a.status === 'executada') totais.agendamentos++;
      if (a.tipo === 'marcar_aguardando_consultor' && a.status === 'executada') totais.humano++;
    }
    const fila = await estado().catch(() => null);
    return { ok: true, desde, totais, fila: fila?.ok ? fila.hoje : null, processando: fila?.ok ? fila.processando : [], conversas: [...grupos.values()] };
  }

  return { conduzir, processarFila, acordar, ligar, desligar, estado, hoje, pendentes, recuperarTravadas };
}

module.exports = { minutosEsperando, emRajada, ANTIGA_MIN, DEMORA_DESCULPA_MIN, RAJADA_MENSAGENS, pediuParar, criarFunil, precisaHumano, origemDoSite, textosSemResposta, humanoEscreveuRecentemente, etapaAgendadoPendente, HUMANO_RECENTE_MIN };
