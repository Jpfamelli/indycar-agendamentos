/* ============================================================
   IndyCar Atendimento — r6-regras.js (Rodada 6, 21/10/2026)
   Regras PURAS que a tela e o servidor compartilham (sem rede, sem DOM):
     · guarda de preço (a IA nunca fala valor)
     · o que o cliente está pedindo (urgência, preço, "meu carro está pronto?"…)
     · pontuação da fila (quem atender primeiro e por quê)
     · orçamento do Orçador: rótulo, tom, próxima ação
     · carro no pátio: passos da etapa
     · links cruzados (Orçador, CRM, Agenda, Pátio) com nome de aba
     · respostas rápidas por situação (sem IA, sem preço)
     · progresso do funil (falta carro? serviço? horário?)
     · WhatsApp parado: textos e conta das mensagens que não saíram
   Carregado no navegador (window.R6) e no Node (require). Testado em
   test/r6-regras.test.js.
   ============================================================ */
(function (raiz) {
  'use strict';

  const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');
  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const primeiroNome = (n) => {
    const p = String(n ?? '').trim().split(/\s+/)[0] || '';
    return /^[\p{L}][\p{L}'-]*$/u.test(p) && p.length <= 24 ? p : '';
  };
  const minutosEntre = (de, ate) => {
    const a = Date.parse(de || ''), b = Number(ate instanceof Date ? ate.getTime() : ate);
    return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 60000)) : null;
  };

  /* ---------------- 1) Guarda de preço ----------------
     Mais rigorosa que a do copiloto: pega "trezentos reais", "3x de 120", "fica 350",
     "mil e quinhentos", "$ 90". Texto de oficina com número pequeno que NÃO é dinheiro
     ("12 meses de garantia", "30 minutos", "às 9h") não conta. */
  const NUM_EXTENSO = '(?:um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)';
  const PADROES_PRECO = [
    /R\s?\$\s*\d/i,                                              // R$ 90 · R$90
    /R\s?\$\s*\[?valor/i,                                        // "R$ [valor]" (o contexto troca valores assim)
    /(?:^|[^\w])\$\s*\d/,                                        // $ 90
    /\b\d+(?:[.,]\d+)*\s*(?:reais|real|conto|contos|pila|pilas|paus?)\b/i,
    new RegExp(`\\b${NUM_EXTENSO}(?:\\s+e\\s+${NUM_EXTENSO})*\\s+(?:reais|real|conto|contos|pilas?)\\b`, 'i'),
    /\b\d{1,3}\s*(?:mil|k)\b(?!\s*(?:km|quil))/i,               // 2 mil · 2k (não km)
    /\b\d+\s*x\s*(?:de\s*)?(?:R\s?\$\s*)?\d{2,}/i,               // 3x de 120 · 10x 89
    /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/,                             // 1.200,50 · 89,90
    /\b(?:custa|custam|cobramos|cobra|cobro|vale|sai|fica|ficou|ficaria|sairia)\s+(?:por\s+|em\s+|uns\s+|cerca\s+de\s+|a\s+)*(?:R\s?\$\s*)?\d{2,}(?![\d:h])(?!\s*(?:km|min|minutos|dias?|horas?|meses|mes|anos?|%))/i,
    /\b(?:pre[çc]o|valor|total|or[çc]amento)\s+(?:[ée]|fica|ficou|de|seria|sai)\s+(?:de\s+|em\s+|uns\s+)?(?:R\s?\$\s*)?\d{2,}/i,
    /\b(?:por|a)\s+(?:apenas\s+|s[óo]\s+|somente\s+)?(?:R\s?\$\s*)?\d{2,}\s*(?:,|\.|!|\?|$|\n)/i,
    /\b\d+(?:[.,]\d+)?\s*(?:%|por\s*cento)\s*(?:de\s+)?(?:desconto|off|mais\s+barato|a\s+menos)/i,
    /\b(?:dou|damos|fa[cç]o|faremos|concedo|conseguimos|garanto|garantimos)\s+(?:um\s+|o\s+)?(?:desconto|abatimento)\b/i,
    /\bdesconto\s+de\s+\d/i,
    /\b(?:pix|cart[ãa]o|dinheiro|[àa]\s+vista)\b[^\n.!?]{0,30}\b\d{2,}\s*(?:reais|real|,\d{2})/i,
  ];
  /** O texto cita preço/valor/desconto? (a IA e as respostas prontas não podem). */
  function textoTemPreco(t) {
    const s = String(t ?? '');
    if (!s.trim()) return false;
    return PADROES_PRECO.some((re) => re.test(s));
  }

  /* ---------------- 2) O que o cliente está pedindo ---------------- */
  /* Tudo aqui é aplicado ao texto SEM acento e em minúsculas ( do JavaScript não enxerga letra acentuada). */
  /* Tudo aqui é aplicado ao texto SEM acento e em minúsculas (o \b do JavaScript não enxerga letra acentuada). */
  const RE = {
    urgencia: /\b(socorro|urgente|urgencia|parou|morreu|apagou|nao\s+(liga|pega|anda|freia|funciona|acelera)|na\s+estrada|no\s+meio\s+da\s+(rua|pista|estrada|avenida)|acidente|bati|batida|fumaca|fogo|pegando\s+fogo|cheiro\s+de\s+queimado|guincho|reboque|perdi\s+(o\s+)?freio|sem\s+freio|agora\s+mesmo|preciso\s+hoje|pra\s+hoje)\b/,
    reclamacao: /\b(reclama\w*|pessimo|horrivel|absurdo|vergonha|procon|advogado|processar|enganad\w*|voltou\s+(o\s+)?(problema|barulho|defeito|a\s+falhar)|nao\s+resolveu|fizeram\s+errado|cobraram\s+errado|insatisfeit\w*|decepcion\w*|lamentavel|descaso|demora\s+demais|ninguem\s+(me\s+)?(responde|atende)|ainda\s+nao\s+(me\s+)?(responderam|retornaram))\b/,
    pessoa: /\b(falar\s+com\s+(alguem|uma\s+pessoa|um\s+atendente|um\s+humano|o\s+dono|o\s+gerente|um\s+consultor|um\s+mecanico|o\s+responsavel|o\s+joao|o\s+gabriel|o\s+franklin)|atendente\s+humano|quero\s+uma\s+pessoa|(e|eh)\s+(um\s+)?robo|nao\s+quero\s+falar\s+com\s+(robo|maquina|ia|intelig)|chama\s+(o\s+)?(dono|gerente|responsavel))\b/,
    preco: /\b(precos?|cust(a|am|o|os)|cobram?|valor(es)?|quanto\s+(custa|fica|sai|vai\s+ficar|que\s+fica|cobra|e|seria|pagaria|vou\s+pagar|ta|deu|ficou)|caro|barato|desconto|parcel\w*|em\s+quantas\s+vezes)\b/,
    ligacao: /\b(me\s+liga\w*|liga\s+pra\s+mim|pode\s+ligar|prefiro\s+(que\s+)?(ligue|ligar|liga)|ligue\s+(pra|para)\s+mim|retorna\s+(a\s+)?ligacao|me\s+chama\s+no\s+telefone)\b/,
    estado_carro: /\b(meu\s+carro|o\s+carro|minha\s+(caminhonete|pickup)|o\s+(onix|gol|hb20|corolla|civic|uno|palio|polo|fox|ka|sandero|logan|kwid|renegade|compass|hilux|ranger|strada|saveiro))\b[^.\n]{0,60}\b(pronto|ficou|terminou|acabou|como\s+esta|ja\s+esta|liberado|andamento)\b|\b(ja\s+(ficou|esta)\s+pronto|ficou\s+pronto|ta\s+pronto|como\s+esta\s+(o\s+)?(meu\s+)?carro|alguma\s+novidade\s+do\s+carro|posso\s+buscar|posso\s+retirar|quando\s+(posso\s+)?(buscar|retirar|pegar)|previsao\s+de\s+entrega|que\s+horas\s+(fica|sai)\s+pronto)\b/,
    orc_status: /\b(orcamento|proposta|cotacao)\b[^.\n]{0,50}\b(mandou|enviou|chegou|saiu|ficou|ja|cade|aprovei|aprovado|fechado)\b|\b(cade|e\s+o|ja\s+(mandou|enviou)|ainda\s+nao\s+recebi)\s+(o\s+)?(meu\s+)?orcamento\b/,
    aprovou: /\b(aprovo|aprovado|pode\s+(fazer|executar|seguir|tocar|trocar)|vamos\s+fazer|quero\s+fazer|autorizo|manda\s+ver|bora\s+fazer)\b/,
    horario: /\b(que\s+horas|tem\s+vaga|tem\s+horario|posso\s+(ir|passar|levar)|vou\s+(ai|passar)|amanha|hoje\s+a\s+tarde|hoje\s+de\s+manha|sabado|segunda|terca|quarta|quinta|sexta|marcar|agendar|agendamento|encaixar|horario)\b/,
    endereco: /\b(onde\s+(fica|e|esta|voces\s+ficam)|endereco|localizacao|como\s+chego|manda\s+a\s+localiza|mapa|maps|waze)\b/,
    remarcar: /\b(remarc\w+|trocar\s+(o\s+)?(dia|horario)|mudar\s+(o\s+)?(dia|horario)|outro\s+(dia|horario)|adiar|nao\s+vou\s+conseguir\s+(ir|chegar))\b/,
    cancelar: /\b(cancel\w+|desmarc\w+|nao\s+vou\s+mais|desisti|nao\s+quero\s+mais)\b/,
    garantia: /\b(garantia|garantido|dentro\s+da\s+garantia)\b/,
    pagamento: /\b(pix|cartao|credito|debito|dinheiro|boleto|a\s+vista|parcel\w*|em\s+\d+\s*x|formas?\s+de\s+pagamento|aceitam)\b/,
    nota_fiscal: /\b(nota\s+fiscal|nfe?|recibo|comprovante|cupom\s+fiscal)\b/,
    pensar: /\b(vou\s+pensar|vou\s+ver|depois\s+(eu\s+)?(vejo|falo|te\s+falo|retorno)|deixa\s+eu\s+(ver|pensar|falar)|preciso\s+(falar|ver)\s+com|vou\s+falar\s+com\s+(minha|meu)|te\s+aviso|qualquer\s+coisa\s+(eu\s+)?(chamo|falo))\b/,
    audio_foto: /\[(?:audio|foto|video|documento|imagem)\]/,
  };
  const RE_AGRADECIMENTO = /^\s*(ok(ay)?|blz|beleza|show|valeu|obrigad[oa]|vlw|top|perfeito|combinado|fechou|certo|entendi|ta\s+bom|tudo\s+bem)[\s.!]*(muito\s+)?(obrigad[oa])?[\s.!]*$/;
  const SO_EMOJI = /^[\s\p{Extended_Pictographic}️]+$/u;

  /** Lista de coisas que o cliente pediu nas mensagens ainda sem resposta (ordem de importância). */
  function oQueOClientePediu(textos = []) {
    const bruto = (Array.isArray(textos) ? textos : [textos]).map((x) => String(x ?? '')).join('\n');
    const limpo = bruto.trim();
    if (!limpo) return [];
    const t = semAcento(bruto);
    const achou = [];
    for (const chave of ['urgencia', 'reclamacao', 'pessoa', 'ligacao', 'preco', 'estado_carro', 'orc_status', 'aprovou',
      'remarcar', 'cancelar', 'horario', 'endereco', 'garantia', 'pagamento', 'nota_fiscal', 'pensar']) {
      if (RE[chave].test(t)) achou.push(chave);
    }
    // "AGORA" em maiúsculas (grito) também é urgência
    if (!achou.includes('urgencia') && /\bAGORA\b/.test(bruto)) achou.unshift('urgencia');
    if (RE.audio_foto.test(t) && t.replace(/\[[^\]]+\]/g, '').trim().length < 3) achou.push('so_midia');
    if (!achou.length && (RE_AGRADECIMENTO.test(t.trim()) || SO_EMOJI.test(limpo))) achou.push('agradecimento');
    return achou;
  }

  const MOTIVO_HUMANO = {
    urgencia: { rotulo: 'Urgência', icone: '🚨', texto: 'Cliente com urgência (carro parado ou perigo)' },
    reclamacao: { rotulo: 'Reclamação', icone: '😠', texto: 'Cliente reclamando' },
    pessoa: { rotulo: 'Pediu uma pessoa', icone: '🙋', texto: 'Cliente quer falar com uma pessoa' },
    ligacao: { rotulo: 'Quer ligação', icone: '📞', texto: 'Cliente pediu para ligarem' },
    preco: { rotulo: 'Pediu valor', icone: '💲', texto: 'Cliente quer saber o valor' },
    so_midia: { rotulo: 'Mandou áudio/foto', icone: '🎤', texto: 'Cliente mandou só áudio ou foto (a IA não ouve nem enxerga)' },
    nota_fiscal: { rotulo: 'Nota fiscal', icone: '🧾', texto: 'Cliente pediu nota fiscal ou comprovante' },
    cancelar: { rotulo: 'Quer cancelar', icone: '✖', texto: 'Cliente quer cancelar' },
  };
  MOTIVO_HUMANO.pediu_pessoa = MOTIVO_HUMANO.pessoa;   // nome que o funil da rodada 5 já usava
  /** Ordem em que o sistema decide passar a conversa para uma pessoa (antes do julgamento da IA). */
  const ORDEM_HUMANO = ['urgencia', 'reclamacao', 'pessoa', 'ligacao', 'preco', 'so_midia', 'nota_fiscal', 'cancelar'];
  /** Primeiro motivo para passar a gente, ou null. */
  function motivoParaHumano(textos = []) {
    const pedidos = oQueOClientePediu(textos);
    for (const m of ORDEM_HUMANO) if (pedidos.includes(m)) return m;
    return null;
  }

  /* ---------------- 3) Pontuação da fila ---------------- */
  const PONTOS = {
    urgencia: 100, reclamacao: 80, pessoa: 70, ligacao: 50, preco: 55, so_midia: 20, cancelar: 45,
    estado_carro: 30, orc_status: 30, aprovou: 50, remarcar: 25, nota_fiscal: 15,
    carro_pronto: 60, extra_pendente: 55, extra_pendente_antigo: 70,
    orc_aprovado_sem_horario: 45, orc_visualizado: 35, orc_parado: 25,
    aguardando_consultor: 40, sem_dono: 10, meu: 8, de_colega: -25,
    agendada: -15, ia_respondendo: -20, fixada: 500, adiada: -300, agradecimento: -30,
  };
  const LIMIAR = { agora: 100, logo: 60, hoje: 30 };

  const NIVEIS = {
    agora: { rotulo: 'Agora', cor: 'vermelho', icone: '🔴' },
    logo: { rotulo: 'Logo', cor: 'laranja', icone: '🟠' },
    hoje: { rotulo: 'Hoje', cor: 'amarelo', icone: '🟡' },
    normal: { rotulo: 'Normal', cor: 'cinza', icone: '⚪' },
  };

  /** Espera → pontos (cliente sem resposta). */
  function pontosDeEspera(min) {
    if (min === null || min === undefined) return 0;
    if (min < 5) return 0;
    if (min < 15) return 10;
    if (min < 60) return 25;
    if (min < 240) return 40;
    return 50;
  }

  /**
   * Quanto vale atender esta conversa AGORA e por quê.
   * c: linha de conversas. ctx: o que o servidor sabe (pedidos, patio, orc). opc: { agora, meuId, ehAgendada, iaRespondendo, fixada, adiadaAte }.
   * Devolve { pontos, nivel, motivos:[{cod,texto,icone,pontos}], espera }.
   */
  function pontuarConversa(c = {}, ctx = {}, opc = {}) {
    const agora = opc.agora ? new Date(opc.agora) : new Date();
    const motivos = [];
    let pontos = 0;
    const somar = (cod, texto, icone, p = PONTOS[cod]) => { if (!p) return; pontos += p; motivos.push({ cod, texto, icone, pontos: p }); };

    if (c.tipo === 'disparo' || c.desfecho) return { pontos: -1000, nivel: 'normal', motivos: [], espera: null, fora: true };

    // espera: mensagem do cliente sem resposta (aguardando consultor conta desde quando a IA passou)
    const semResposta = (c.nao_lidas > 0) || !!ctx.sem_resposta;
    const desde = c.aguardando_consultor ? (c.aguardando_desde || c.ultima_mensagem_em) : (semResposta ? c.ultima_mensagem_em : null);
    const espera = desde ? minutosEntre(desde, agora) : null;
    if (espera !== null) {
      const pe = pontosDeEspera(espera);
      if (pe) somar('espera', `Esperando há ${rotuloMinutos(espera)}`, '⏱', pe);
    }
    if (c.aguardando_consultor) {
      const extra = Math.min(30, Math.floor((espera || 0) / 10));
      somar('aguardando_consultor', 'A IA passou para um consultor', '⏳', PONTOS.aguardando_consultor + extra);
    }
    if (c.nao_lidas > 0) somar('nao_lidas', `${c.nao_lidas} mensagem${c.nao_lidas > 1 ? 's' : ''} sem ler`, '✉', Math.min(c.nao_lidas, 5) * 3);

    // o que o cliente pediu (só vale com mensagem sem resposta)
    if (semResposta) {
      for (const p of ctx.pedidos || []) {
        const m = MOTIVO_HUMANO[p];
        if (p === 'agradecimento') { somar('agradecimento', 'Só agradeceu', '🙏'); continue; }
        if (PONTOS[p]) somar(p, m?.texto || ROTULO_PEDIDO[p] || p, m?.icone || ICONE_PEDIDO[p] || '•');
      }
    }

    // 🔗 carro no pátio
    const pat = ctx.patio;
    if (pat) {
      if (pat.etapa === 'pronto') somar('carro_pronto', 'O carro está pronto para retirar', '🏁');
      if (pat.extras_pendentes > 0) {
        const velho = (pat.extra_min || 0) >= 120;
        somar(velho ? 'extra_pendente_antigo' : 'extra_pendente',
          `Extra esperando o cliente aprovar${velho ? ' há ' + rotuloMinutos(pat.extra_min) : ''}`, '⚠️', velho ? PONTOS.extra_pendente_antigo : PONTOS.extra_pendente);
      }
    }
    // 🔗 orçamento do Orçador
    const orc = ctx.orc;
    if (orc) {
      const s = situacaoOrcamento(orc, agora);
      if (s.cod === 'aprovado_sem_horario') somar('orc_aprovado_sem_horario', 'Orçamento aprovado e sem horário', '✅');
      else if (s.cod === 'visualizado') somar('orc_visualizado', 'O cliente abriu o orçamento e não respondeu', '👀');
      else if (s.cod === 'parado') somar('orc_parado', 'Orçamento enviado sem resposta', '📄');
    }

    if (!c.atribuida_a) somar('sem_dono', 'Ninguém é dono', '★');
    else if (opc.meuId && c.atribuida_a === opc.meuId) somar('meu', 'É seu', '★');
    else if (opc.meuId && c.atribuida_a !== opc.meuId) somar('de_colega', 'É de um colega', '👤');
    if (opc.ehAgendada) somar('agendada', 'Já tem horário marcado', '📅');
    if (opc.iaRespondendo) somar('ia_respondendo', 'A IA está respondendo agora', '✨');
    if (opc.fixada) somar('fixada', 'Fixada por você', '📌');
    if (opc.adiadaAte && Date.parse(opc.adiadaAte) > agora.getTime()) somar('adiada', 'Adiada por você', '💤');

    const nivel = pontos >= LIMIAR.agora ? 'agora' : pontos >= LIMIAR.logo ? 'logo' : pontos >= LIMIAR.hoje ? 'hoje' : 'normal';
    motivos.sort((a, b) => b.pontos - a.pontos);
    return { pontos, nivel, motivos, espera };
  }

  const ROTULO_PEDIDO = {
    estado_carro: 'Perguntou do carro', orc_status: 'Perguntou do orçamento', aprovou: 'Parece ter aprovado',
    remarcar: 'Quer remarcar', cancelar: 'Quer cancelar', horario: 'Falou de horário', endereco: 'Pediu o endereço',
    garantia: 'Falou de garantia', pagamento: 'Falou de pagamento', pensar: 'Vai pensar', nota_fiscal: 'Pediu nota fiscal',
  };
  const ICONE_PEDIDO = { estado_carro: '🚗', orc_status: '📄', aprovou: '✅', remarcar: '📅', cancelar: '✖', nota_fiscal: '🧾' };

  /** Ordena do mais urgente ao menos. Empate: quem espera há mais tempo; depois o mais recente. */
  function ordenarPorPrioridade(lista = [], ctxPor = {}, opc = {}) {
    const marca = lista.map((c) => ({ c, p: pontuarConversa(c, ctxPor[c.id] || {}, {
      ...opc,
      ehAgendada: opc.ehAgendada ? opc.ehAgendada(c) : false,
      iaRespondendo: opc.iaRespondendo ? opc.iaRespondendo(c.id) : false,
      fixada: opc.fixadas ? opc.fixadas.has(c.id) : false,
      adiadaAte: opc.adiadas ? opc.adiadas.get(c.id) : null,
    }) }));
    marca.sort((a, b) => (b.p.pontos - a.p.pontos)
      || ((b.p.espera ?? -1) - (a.p.espera ?? -1))
      || String(b.c.ultima_mensagem_em || '').localeCompare(String(a.c.ultima_mensagem_em || '')));
    return marca;
  }

  /** "5 min", "2 h", "1 dia" */
  function rotuloMinutos(min) {
    if (min === null || min === undefined) return '';
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.round(min / 60)} h`;
    const d = Math.round(min / 1440);
    return `${d} dia${d > 1 ? 's' : ''}`;
  }

  /** Resumo do topo da lista: "2 agora · 4 logo". */
  function resumoDaFila(marcadas = []) {
    const n = { agora: 0, logo: 0, hoje: 0, normal: 0 };
    for (const m of marcadas) if (!m.p.fora) n[m.p.nivel]++;
    const partes = [];
    if (n.agora) partes.push(`${n.agora} agora`);
    if (n.logo) partes.push(`${n.logo} logo`);
    if (n.hoje) partes.push(`${n.hoje} hoje`);
    return { ...n, texto: partes.join(' · ') };
  }

  /** A próxima conversa a atender: a de maior pontuação com cliente esperando que não seja de colega. */
  function proximaDaFila(marcadas = [], { meuId = null, ignorar = null } = {}) {
    return marcadas.find((m) => !m.p.fora && m.c.id !== ignorar && m.p.nivel !== 'normal'
      && (!m.c.atribuida_a || m.c.atribuida_a === meuId) && m.p.pontos > 0) || null;
  }

  /* ---------------- 4) Orçamento do Orçador ---------------- */
  const ROTULO_ORC = {
    aberto: 'Em montagem', rascunho: 'Em montagem', enviado: 'Enviado ao cliente', visualizado: 'Cliente abriu',
    aprovado: 'Aprovado', recusado: 'Recusado', expirado: 'Vencido', cancelado: 'Cancelado',
  };
  const TOM_ORC = { aberto: 'neutro', rascunho: 'neutro', enviado: 'atencao', visualizado: 'atencao', aprovado: 'ok', recusado: 'ruim', expirado: 'ruim', cancelado: 'ruim' };

  /** Situação para a ficha: rótulo, tom, e o que fazer a seguir. */
  function situacaoOrcamento(o = {}, agora = new Date()) {
    let status = String(o.status || 'aberto');
    if (status === 'enviado' && o.visualizado_em) status = 'visualizado';
    const base = { status, rotulo: ROTULO_ORC[status] || status, tom: TOM_ORC[status] || 'neutro' };
    const agoraMs = agora instanceof Date ? agora.getTime() : Number(agora);
    const venc = o.validade ? Date.parse(String(o.validade).slice(0, 10) + 'T23:59:59-03:00') : null;
    if (['enviado', 'visualizado'].includes(status) && venc && venc < agoraMs) {
      return { ...base, status: 'expirado', rotulo: ROTULO_ORC.expirado, tom: 'ruim', cod: 'vencido', acao: 'Venceu: refaça ou renove o orçamento no Orçador.' };
    }
    if (status === 'aprovado') {
      return o.agendamento_id
        ? { ...base, cod: 'aprovado', acao: 'Aprovado e com horário marcado.' }
        : { ...base, cod: 'aprovado_sem_horario', acao: 'Aprovado: marque o horário do serviço.' };
    }
    if (status === 'visualizado') {
      const min = minutosEntre(o.visualizado_em, agora);
      return { ...base, cod: min !== null && min >= 60 ? 'visualizado' : 'recente', acao: 'O cliente abriu e não respondeu: pergunte se ficou alguma dúvida.' };
    }
    if (status === 'enviado') {
      const min = minutosEntre(o.enviado_em || o.created_at, agora);
      return min !== null && min >= 48 * 60
        ? { ...base, cod: 'parado', acao: `Enviado há ${rotuloMinutos(min)} sem resposta: dê um retorno.` }
        : { ...base, cod: 'enviado', acao: 'Enviado: aguarde o cliente ou pergunte se recebeu.' };
    }
    if (status === 'recusado') return { ...base, cod: 'recusado', acao: o.motivo_recusa ? `Recusou: ${o.motivo_recusa}` : 'Recusado: entenda o motivo antes de desistir.' };
    return { ...base, cod: status, acao: status === 'aberto' || status === 'rascunho' ? 'Ainda em montagem no Orçador.' : '' };
  }

  /** Dos orçamentos do cliente, o que mais importa agora (aprovado sem horário > visualizado > parado > enviado > o mais novo). */
  function orcamentoQueImporta(lista = [], agora = new Date()) {
    const ordem = ['aprovado_sem_horario', 'visualizado', 'parado', 'enviado', 'recente', 'aprovado', 'aberto'];
    const comSit = (lista || []).filter(Boolean).map((o) => ({ o, s: situacaoOrcamento(o, agora) }));
    comSit.sort((a, b) => {
      const ia = ordem.indexOf(a.s.cod), ib = ordem.indexOf(b.s.cod);
      return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || String(b.o.created_at || '').localeCompare(String(a.o.created_at || ''));
    });
    const topo = comSit[0];
    return topo ? { ...topo.o, situacao: topo.s } : null;
  }

  /* ---------------- 5) Carro no pátio ---------------- */
  const PASSOS_PATIO = [
    { cod: 'recebido', rotulo: 'Recebido' },
    { cod: 'diagnostico', rotulo: 'Diagnóstico' },
    { cod: 'aguardando_aprovacao', rotulo: 'Aprovação' },
    { cod: 'em_execucao', rotulo: 'Execução' },
    { cod: 'teste', rotulo: 'Teste' },
    { cod: 'pronto', rotulo: 'Pronto' },
    { cod: 'entregue', rotulo: 'Entregue' },
  ];
  /** Passos da trilha com feito/atual/futuro. "Aguardando peça" fica na execução (com selo). */
  function passosDoPatio(etapa) {
    const e = etapa === 'aguardando_peca' ? 'em_execucao' : etapa;
    const i = PASSOS_PATIO.findIndex((p) => p.cod === e);
    return PASSOS_PATIO.map((p, k) => ({ ...p, estado: i < 0 ? 'futuro' : k < i ? 'feito' : k === i ? 'atual' : 'futuro' }));
  }

  /* ---------------- 6) Links cruzados ---------------- */
  const BASES = {
    orcador: 'https://indycar-orcador.netlify.app',
    patio: 'https://indycar-patio.netlify.app',
    central: 'https://indycar-agendamentos.onrender.com',
  };
  const NOME_ABA = { orcador: 'indycar-orcador', patio: 'indycar-patio', crm: 'indycar-crm', agenda: 'indycar-agenda', comunicar: 'indycar-comunicar', atendimento: 'indycar-atendimento' };
  const limparTexto = (t, max) => String(t ?? '').replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);

  /** Orçador já com cliente/carro (?cliente= ?tel= ?nome= que ele lê hoje; ?carro= ?placa= pedidos ao O1). */
  function linkNovoOrcamento(d = {}, base = BASES.orcador) {
    const p = new URLSearchParams();
    p.set('origem', 'atendimento');
    if (RE_UUID.test(String(d.conversaId || ''))) p.set('conversa', d.conversaId);
    let tel = soDigitos(d.telefone);
    if (/^\d{10,11}$/.test(tel)) tel = '55' + tel;
    if (/^55\d{10,11}$/.test(tel)) p.set('tel', tel);
    const nome = limparTexto(d.nome, 80);
    if (nome) p.set('nome', nome);
    const placa = String(d.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) p.set('placa', placa);
    const veiculo = limparTexto(d.veiculo || d.carro, 60);
    if (veiculo) p.set('veiculo', veiculo);
    if (RE_UUID.test(String(d.leadId || ''))) p.set('lead', d.leadId);
    if (!p.has('conversa') && !p.has('tel')) return null;      // sem conversa nem telefone o Orçador não sabe de quem é
    return `${String(base).replace(/\/+$/, '')}/#/cotacao?${p.toString()}`;
  }
  const linkOrcamento = (id, base = BASES.orcador) => (RE_UUID.test(String(id || '')) ? `${String(base).replace(/\/+$/, '')}/#/historico/${id}` : null);
  const linkOrcamentoDoCliente = (token, base = BASES.orcador) => (/^[A-Za-z0-9_-]{8,128}$/.test(String(token || '')) ? `${String(base).replace(/\/+$/, '')}/#/o/${token}` : null);
  const relCrmLead = (id) => (RE_UUID.test(String(id || '')) ? `/?lead=${id}` : null);
  const relAgendamento = (id) => (RE_UUID.test(String(id || '')) ? `/?agendamento=${id}` : null);
  const relPatioOs = (id) => (RE_UUID.test(String(id || '')) ? `/?os=${id}` : null);

  /* ---------------- 7) Respostas rápidas por situação ---------------- */
  function saudacao(nome, h) { const n = primeiroNome(nome); return n ? `${n}, ` : ''; }

  /**
   * Respostas prontas para o que o cliente acabou de pedir (sem IA, SEM preço).
   * ficha: { nome, carro, patio:{etapa_rotulo,previsao,link_cliente?}, orc:{numero,link}, horarios:[rótulos], foraDoHorario }
   * Devolve [{ id, rotulo, texto, acao? }] — a primeira é a mais indicada. Uma pergunta por mensagem.
   */
  function respostasRapidas(pedidos = [], ficha = {}) {
    const n = saudacao(ficha.nome);
    const carro = ficha.carro ? `o ${ficha.carro}` : 'o carro';
    const out = [];
    const add = (id, rotulo, texto, extra = {}) => { if (!out.some((o) => o.id === id)) out.push({ id, rotulo, texto, ...extra }); };
    const h = (ficha.horarios || []).slice(0, 2);
    const doisHorarios = h.length === 2 ? `Tenho ${h[0]} ou ${h[1]}. Qual fica melhor para você?` : h.length === 1 ? `Tenho ${h[0]}. Fica bom para você?` : 'Qual dia e horário ficam melhores para você?';
    const fora = ficha.foraDoHorario ? ' Estamos fora do horário agora (seg–sáb, 8h às 17h30), então ele responde assim que abrirmos.' : '';

    for (const p of pedidos) {
      if (p === 'urgencia') {
        add('urgencia', 'Urgência', `${n}entendi que é urgente. Já estou chamando um consultor agora para te ajudar.${fora} O carro está parado em local seguro?`, { acao: 'passar-consultor' });
      } else if (p === 'reclamacao') {
        add('reclamacao', 'Reclamação', `${n}sinto muito por isso, de verdade. Vou chamar um consultor agora para resolver com você.${fora} Pode me contar o que aconteceu?`, { acao: 'passar-consultor' });
      } else if (p === 'pessoa' || p === 'ligacao') {
        add('pessoa', 'Chamar consultor', `${n}claro! Já chamei um consultor para falar com você.${fora} Qual o melhor horário para ele te ligar?`, { acao: 'passar-consultor' });
      } else if (p === 'preco') {
        add('preco', 'Valor com o consultor', `${n}para não te passar um valor errado, o consultor confirma o valor certinho depois de ver ${carro}. O diagnóstico digital aqui é gratuito. ${doisHorarios}`, { acao: 'passar-consultor' });
      } else if (p === 'estado_carro') {
        if (ficha.patio && ficha.patio.etapa === 'pronto') {
          add('carro_pronto', 'Carro pronto', `${n}${carro} já está pronto! Pode retirar de segunda a sábado, das 8h às 17h30. Que horário você vem?`);
        } else if (ficha.patio && ficha.patio.etapa !== 'entregue') {
          const prev = ficha.patio.previsao ? ` A previsão que a equipe registrou é ${ficha.patio.previsao}.` : ' A equipe avisa assim que ficar pronto.';
          add('carro_andamento', 'Como está o carro', `${n}${carro} está em: ${ficha.patio.etapa_rotulo}.${prev} Quer que eu te mande o link para acompanhar etapa por etapa?`, { acao: 'colar-link-patio' });
        } else {
          add('carro_nao_achei', 'Carro não está no pátio', `${n}não achei ${carro} na oficina agora. Me confirma a placa para eu ver certinho?`);
        }
      } else if (p === 'orc_status') {
        if (ficha.orc && ficha.orc.numero) add('orc_status', 'Sobre o orçamento', `${n}o orçamento nº ${ficha.orc.numero} está ${String(ficha.orc.rotulo || 'enviado').toLowerCase()}. Ficou alguma dúvida que eu possa tirar?`, { acao: 'colar-link-orcamento' });
        else add('orc_nao_tem', 'Orçamento não feito', `${n}ainda não fechei o orçamento de ${carro}. O consultor monta e te manda hoje. Pode ser?`, { acao: 'criar-orcamento' });
      } else if (p === 'aprovou') {
        add('aprovou', 'Combinar horário', `${n}ótimo, vamos fazer! ${doisHorarios}`);
      } else if (p === 'remarcar') {
        add('remarcar', 'Remarcar', `${n}sem problema, a gente remarca. ${doisHorarios}`);
      } else if (p === 'cancelar') {
        add('cancelar', 'Cancelar', `${n}tudo bem, posso cancelar. Só para eu entender: aconteceu alguma coisa que a gente possa resolver?`, { acao: 'passar-consultor' });
      } else if (p === 'horario') {
        add('horario', 'Dois horários', `${n}${doisHorarios}`);
      } else if (p === 'endereco') {
        add('endereco', 'Endereço', `Ficamos na Av. Bandeirantes, 875 — Parque Paduan, Taubaté. Atendemos de segunda a sábado, das 8h às 17h30. Quer que eu já deixe um horário reservado no seu nome?`);
      } else if (p === 'garantia') {
        add('garantia', 'Garantia', `${n}a garantia é de 12 meses em peça e em mão de obra. Teve algum problema com o serviço?`);
      } else if (p === 'pagamento') {
        add('pagamento', 'Pagamento', `${n}as formas de pagamento o consultor confirma certinho junto com o valor. Posso pedir para ele te chamar?`, { acao: 'passar-consultor' });
      } else if (p === 'nota_fiscal') {
        add('nota', 'Nota fiscal', `${n}claro! Vou pedir para a equipe separar e te mando por aqui. Qual o nome ou CPF/CNPJ da nota?`, { acao: 'passar-consultor' });
      } else if (p === 'pensar') {
        add('pensar', 'Vai pensar', `${n}combinado, sem pressa! Se quiser, deixo um horário reservado sem compromisso. Prefere de manhã ou à tarde?`);
      } else if (p === 'so_midia') {
        add('midia', 'Recebi o áudio/foto', `${n}recebi aqui! Já vou ver com calma e te respondo. Pode me dizer em uma frase o que está acontecendo com ${carro}?`);
      } else if (p === 'agradecimento') {
        add('agradece', 'De nada', `Por nada${n ? ', ' + primeiroNome(ficha.nome) : ''}! Qualquer coisa é só chamar. Quem conhece, Indyca! 🏎`);
      }
    }
    if (!out.length) {
      add('aguarde', 'Já estou vendo', `${n}já estou vendo aqui e te respondo em instantes.`);
    }
    return out;
  }

  /* ---------------- 8) Progresso do funil (o que a IA ainda precisa descobrir) ---------------- */
  function progressoDoFunil(f = {}) {
    const cli = f.cliente || {}, lead = f.leadAberto || {};
    const carro = !!(cli.carro_modelo || lead.carro_modelo || f.patio?.veiculo);
    const servico = !!(lead.servico || f.patio?.servico || (f.agendamentos?.futuros || []).length);
    const horario = (f.agendamentos?.futuros || []).length > 0;
    const passos = [
      { cod: 'carro', rotulo: 'Carro', feito: carro },
      { cod: 'servico', rotulo: 'Serviço', feito: servico },
      { cod: 'horario', rotulo: 'Horário', feito: horario },
    ];
    const falta = passos.find((p) => !p.feito);
    return { passos, falta: falta ? falta.cod : null, completo: !falta,
      texto: falta ? ({ carro: 'Falta saber o carro', servico: 'Falta saber o serviço', horario: 'Falta marcar o horário' })[falta.cod] : 'Carro, serviço e horário definidos' };
  }

  /* ---------------- 9) WhatsApp parado ---------------- */
  const TEXTO_PARADO = {
    'codewords-401': 'A chave do CodeWords foi recusada. Nada sai pelo WhatsApp até o administrador trocar a chave.',
    'whatsapp-desconectado': 'O WhatsApp da oficina está desconectado. Nada sai até reconectar o aparelho.',
    cota: 'A cota do CodeWords acabou. Nada sai até renovar o plano.',
    padrao: 'O WhatsApp está fora do ar. Nada sai por enquanto.',
  };
  function textoWhatsappParado(codigo) { return TEXTO_PARADO[codigo] || TEXTO_PARADO.padrao; }

  /** Mensagens de saída que não saíram, separadas pelo que fazer com cada uma. */
  function classificarNaoSairam(linhas = [], agora = new Date()) {
    const out = { nao_saiu: [], sem_confirmacao: [], total: 0 };
    for (const m of linhas) {
      if (!m || m.direcao !== 'saida' || m.status !== 'falhou') continue;
      const item = { ...m, ha_min: minutosEntre(m.created_at, agora) };
      if (String(m.erro || '').startsWith('Sem confirmação')) out.sem_confirmacao.push(item); else out.nao_saiu.push(item);
      out.total++;
    }
    return out;
  }

  /** Mensagem de passagem para o consultor quando a IA/sistema encaminha (sem preço, uma pergunta). */
  function textoDeEncaminhamento(motivo, nome, foraDoHorario = false) {
    const n = saudacao(nome);
    const fora = foraDoHorario ? ' Estamos fora do horário agora (seg–sáb, 8h às 17h30); ele responde assim que abrirmos.' : '';
    switch (motivo) {
      case 'urgencia': return `${n}entendi que é urgente. Já avisei um consultor agora.${fora} O carro está em local seguro?`;
      case 'reclamacao': return `${n}sinto muito pelo transtorno. Já chamei um consultor para resolver isso com você.${fora} Pode me contar o que aconteceu?`;
      case 'pessoa': case 'ligacao': return `${n}claro! Já chamei um consultor para falar com você.${fora} Qual o melhor horário para ele te chamar?`;
      case 'preco': return `${n}o valor certinho o consultor confirma depois de ver o carro, para não te passar nada errado.${fora} O diagnóstico digital é gratuito: quer que eu veja um horário?`;
      case 'so_midia': return `${n}recebi seu envio! Já passei para um consultor ver com calma.${fora} Pode me contar em uma frase o que está acontecendo?`;
      case 'nota_fiscal': return `${n}vou pedir para a equipe separar a nota e te mando por aqui.${fora} Qual o nome ou CPF/CNPJ da nota?`;
      case 'cancelar': return `${n}tudo bem. Um consultor vai falar com você sobre isso.${fora} Aconteceu alguma coisa que a gente possa resolver?`;
      default: return `${n}já chamei um consultor para te ajudar.${fora}`;
    }
  }

  /** A oficina está aberta agora? (seg–sáb 8h–17h30, fuso de São Paulo). Devolve { aberta, reabre }. */
  function oficinaAberta(agora = new Date()) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(agora);
    const get = (t) => f.find((x) => x.type === t)?.value;
    const dia = get('weekday');
    const min = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
    const util = dia !== 'Sun';
    const aberta = util && min >= 8 * 60 && min < 17 * 60 + 30;
    let reabre = null;
    if (!aberta) {
      if (dia === 'Sun' || (dia === 'Sat' && min >= 17 * 60 + 30)) reabre = 'segunda às 8h';
      else if (min >= 17 * 60 + 30) reabre = 'amanhã às 8h';
      else reabre = 'hoje às 8h';
    }
    return { aberta, reabre, dia, minutos: min };
  }

  /* ---------------- 10) Formulário do site ----------------
     O site manda uma mensagem do tipo "Nome: … / Placa: … / Horário: …". Lemos esses campos para a IA e a ficha não perguntarem de novo. */
  function lerFormularioSite(textos = []) {
    const out = {};
    const mapa = { nome: 'nome', placa: 'placa', horario: 'horario', 'horario preferido': 'horario', servico: 'servico', carro: 'carro', veiculo: 'carro', modelo: 'carro' };
    for (const t of (Array.isArray(textos) ? textos : [textos])) {
      for (const linha of String(t ?? '').split(/\r?\n/)) {
        const m = /^\s*[-*•]?\s*([A-Za-zÀ-ÿ ]{3,20}?)\s*:\s*(.{1,80})$/.exec(linha);
        if (!m) continue;
        const chave = mapa[semAcento(m[1]).trim()];
        if (!chave) continue;
        const valor = limparTexto(m[2], 60);
        if (!valor) continue;
        if (chave === 'placa') {
          const placa = valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) out.placa = placa;
        } else out[chave] = valor;
      }
    }
    return out;
  }

  const API = {
    semAcento, soDigitos, primeiroNome, minutosEntre, rotuloMinutos,
    textoTemPreco, PADROES_PRECO,
    RE_PEDIDO: RE, oQueOClientePediu, motivoParaHumano, MOTIVO_HUMANO, ORDEM_HUMANO, ROTULO_PEDIDO,
    PONTOS, LIMIAR, NIVEIS, pontuarConversa, ordenarPorPrioridade, resumoDaFila, proximaDaFila, pontosDeEspera,
    ROTULO_ORC, situacaoOrcamento, orcamentoQueImporta,
    PASSOS_PATIO, passosDoPatio,
    BASES, NOME_ABA, linkNovoOrcamento, linkOrcamento, linkOrcamentoDoCliente, relCrmLead, relAgendamento, relPatioOs,
    respostasRapidas, progressoDoFunil,
    textoWhatsappParado, classificarNaoSairam, textoDeEncaminhamento, oficinaAberta, lerFormularioSite,
  };
  raiz.R6 = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
