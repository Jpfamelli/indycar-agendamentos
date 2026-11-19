/* Casa — regras puras da Rodada 7 / C1 (25/10/2026). Sem DOM, sem rede: testadas em tests/casa-r7.test.mjs.
   Carregado DEPOIS de logica.js, logica2.js e logica3.js. Reúne: o PARAR do Comunicar (quem pediu para não receber
   mensagem), as tarefas por origem (incluindo as do Orçador), a saúde dos sistemas, as ligações quebradas entre
   sistemas, a ficha rápida do cliente e as opções de adiar do sino. */
(function (root) {
  'use strict';
  const L = root.CasaLogica;
  const num = (x) => Number(x) || 0;
  const texto = (v, max = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  /* ---------------- telefone nacional (a chave do PARAR no banco) ---------------- */
  /** DDD+número (10 ou 11 dígitos), a partir de qualquer formato. Vazio se não parecer telefone brasileiro. */
  function nacional(v) {
    const e = L.telefoneE164(v);
    return e ? e.slice(2) : '';
  }
  /** Telefone de um link do WhatsApp (https://wa.me/55DDDNUMERO?text=…). Vazio se o link não for do wa.me. */
  function telefoneDoLinkWa(href) {
    const m = /^https:\/\/wa\.me\/(\d{10,13})(?:[?#]|$)/.exec(String(href || ''));
    return m ? nacional(m[1]) : '';
  }

  /* ---------------- PARAR: cache de 5 minutos por telefone ---------------- */
  const VALIDADE_PARAR_MS = 5 * 60_000;
  const MOTIVOS_PARAR = {
    optout: 'pediu para não receber mensagens',
    parar: 'respondeu PARAR a uma mensagem da oficina',
  };
  const rotuloParar = (motivo) => MOTIVOS_PARAR[motivo] || MOTIVOS_PARAR.optout;
  /** 'bloqueado' (com motivo) | 'livre' | 'desconhecido' (nunca perguntou ou o cache venceu). */
  function estadoParar(cache, tel, agoraMs = Date.now()) {
    const n = nacional(tel);
    if (!n) return { estado: 'invalido' };
    const c = cache && cache[n];
    if (!c || agoraMs - num(c.em) > VALIDADE_PARAR_MS) return { estado: 'desconhecido', tel: n };
    return c.motivo ? { estado: 'bloqueado', motivo: c.motivo, tel: n } : { estado: 'livre', tel: n };
  }
  /** Quais telefones ainda precisam ir ao banco (sem repetir, sem lixo, no máximo 80 por chamada). */
  function paraConsultar(telefones, cache, agoraMs = Date.now()) {
    const out = new Set();
    for (const t of telefones || []) {
      const e = estadoParar(cache, t, agoraMs);
      if (e.estado === 'desconhecido') out.add(e.tel);
      if (out.size >= 80) break;
    }
    return [...out];
  }
  /** Guarda a resposta de r7_c1_parar: quem veio no mapa está bloqueado; quem foi perguntado e não veio está livre. */
  function guardarParar(cache, consultados, resposta, agoraMs = Date.now()) {
    const r = resposta && typeof resposta === 'object' ? resposta : {};
    for (const n of consultados || []) cache[n] = { motivo: r[n] === 'optout' || r[n] === 'parar' ? r[n] : null, em: agoraMs };
    return cache;
  }
  /** Texto do botão que substitui o do WhatsApp quando o cliente pediu para parar. */
  function textoBloqueado(motivo) {
    return `Pediu para parar: não mande mensagem (${rotuloParar(motivo)})`;
  }
  const AVISO_PARAR_SEM_CONFERIR = 'Não consegui conferir se este cliente pediu PARAR (sem conexão com o banco). Abrir o WhatsApp mesmo assim?';
  const AVISO_PARAR_BLOQUEADO = 'Este cliente pediu para não receber mensagens. Só o gestor volta a liberar, no Comunicar.';

  /* ---------------- tarefas: origem, tipo do Orçador, mensagem ---------------- */
  const ORIGENS_TAREFA = {
    manual: { ico: '📝', rotulo: 'minha' },
    atendimento: { ico: '💬', rotulo: 'Atendimento', app: 'atendimento' },
    crm: { ico: '📈', rotulo: 'CRM', app: 'crm' },
    agenda: { ico: '📅', rotulo: 'Agenda', app: 'agenda' },
    comunicar: { ico: '📣', rotulo: 'Comunicar', app: 'comunicar' },
    orcador: { ico: '🧾', rotulo: 'Orçador', app: 'orcador' },
    ia: { ico: '🤖', rotulo: 'IA' },
    automacao: { ico: '⚙️', rotulo: 'automática' },
    ads: { ico: '📢', rotulo: 'Anúncios' },
    patio: { ico: '🔧', rotulo: 'Pátio', app: 'patio' },
    site: { ico: '🌐', rotulo: 'Site' },
    area_cliente: { ico: '🙋', rotulo: 'Área do cliente' },
  };
  const TIPOS_ORC_TAREFA = {
    reabordar: { ico: '🔁', rotulo: 'Reabordar', wa: 'reabordar', dica: 'orçamento recusado que ainda dá para recuperar' },
    followup: { ico: '📞', rotulo: 'Acompanhar', wa: 'orcamento', dica: 'orçamento enviado esperando resposta' },
    sem_resposta: { ico: '⏳', rotulo: 'Sem resposta', wa: 'orcamento', dica: 'orçamento enviado há dias sem resposta' },
    agendar: { ico: '📅', rotulo: 'Agendar', wa: 'aprovado', dica: 'orçamento aprovado sem horário' },
    manual: { ico: '📝', rotulo: 'Do orçamento', wa: null, dica: 'tarefa ligada a um orçamento' },
  };
  /** O que desenhar numa tarefa: ícone da origem, selo do tipo (Orçador) e para onde ela leva. `liga` = linha de orc_tarefas ({orcamento_id,tipo}) ou null. */
  function infoDaTarefa(t, liga = null) {
    const o = ORIGENS_TAREFA[t && t.origem] || ORIGENS_TAREFA.manual;
    const tipo = liga && TIPOS_ORC_TAREFA[liga.tipo] ? { k: liga.tipo, ...TIPOS_ORC_TAREFA[liga.tipo] } : null;
    const orcId = liga && L.ehUuid(liga.orcamento_id) ? liga.orcamento_id : null;
    return { ico: tipo ? tipo.ico : o.ico, origem: o.rotulo, app: o.app || null, tipo, orcamentoId: orcId, querWa: !!(tipo && tipo.wa) };
  }
  /** Tarefas que vieram do Orçador (origem) — para o filtro "Do Orçador" e a contagem. */
  const ehDoOrcador = (t) => !!t && t.origem === 'orcador' && t.status !== 'feita';
  /** Quantas tarefas de reabordar abertas existem (precisa do mapa tarefa_id → tipo vindo de orc_tarefas). */
  function contarReabordar(tarefas, ligas) {
    let n = 0;
    for (const t of tarefas || []) if (t.status !== 'feita' && ligas && ligas[t.id] && ligas[t.id].tipo === 'reabordar') n++;
    return n;
  }
  /** O primeiro endereço do texto que seja de um app da IndyCar (a descrição das tarefas do Orçador traz o link do orçamento). */
  function linkDaDescricao(desc, bases, origem) {
    const achados = String(desc || '').match(/https:\/\/[^\s)<>"']+/g) || [];
    for (const u of achados) { if (L.appDoLink(u, origem, bases)) return u; }
    return '';
  }
  /** A descrição sem o endereço (o botão "abrir" já leva lá) e cortada. */
  const descricaoLimpa = (desc) => texto(String(desc || '').replace(/https?:\/\/\S+/g, ''), 220);

  /* ---------------- saúde dos sistemas ---------------- */
  const NOME_SIST = { patio: 'Pátio', orcador: 'Orçador', whatsapp: 'WhatsApp', comunicar: 'Comunicar', movere: 'Movere', monitor: 'Monitor', ia: 'IA', backup: 'Backup', apps: 'Central' };
  const ICO_SIST = { patio: '🔧', orcador: '🧾', whatsapp: '💬', comunicar: '📣', movere: '📦', monitor: '🩺', ia: '🤖', backup: '💾', apps: '🏠' };
  const ESTADOS_WHATSAPP = {
    ok: { tom: 'ok', frase: 'conectado' },
    chave_recusada: { tom: 'ruim', frase: 'chave recusada: nada sai nem entra pelo WhatsApp da oficina', plano: 'Mande pelo seu WhatsApp (botão 💬). O gestor troca a chave no Atendimento.' },
    sem_chave: { tom: 'ruim', frase: 'sem chave configurada', plano: 'Mande pelo seu WhatsApp (botão 💬). O gestor configura a chave no Atendimento.' },
    sem_aparelho: { tom: 'ruim', frase: 'sem aparelho conectado', plano: 'Mande pelo seu WhatsApp (botão 💬). Reconecte o aparelho no Atendimento.' },
    desconectado: { tom: 'ruim', frase: 'desconectado', plano: 'Mande pelo seu WhatsApp (botão 💬). Reconecte o aparelho no Atendimento.' },
    instabilidade: { tom: 'aviso', frase: 'instável: algumas mensagens podem demorar', plano: 'Confira se a mensagem chegou antes de repetir.' },
    limite: { tom: 'aviso', frase: 'no limite de envios', plano: 'O Comunicar segura o que passar do limite e manda depois.' },
  };
  /** Código do monitor (vigia) → onde ele se encaixa, o quanto pesa e a frase para a equipe. */
  const REGRAS_VIGIA = [
    { t: /^codewords-chave-recusada$/, area: 'whatsapp', tom: 'ruim', frase: 'A chave do WhatsApp (CodeWords) foi recusada.' },
    { t: /^(codewords-fora|whatsapp-desconectado|whatsapp-sem-config|webhook-fora)$/, area: 'whatsapp', tom: 'ruim', frase: 'O WhatsApp da oficina está com falha.' },
    { t: /^whatsapp-sem-receber$/, area: 'whatsapp', tom: 'aviso', frase: 'O WhatsApp da oficina não está recebendo mensagens.' },
    { t: /^anthropic-(chave-recusada|sem-credito)$/, area: 'ia', tom: 'ruim', frase: 'A IA está sem acesso (chave ou crédito).' },
    { t: /^(anthropic-fora|ia-desligada)$/, area: 'ia', tom: 'aviso', frase: 'A IA está fora do ar agora.' },
    { t: /^ia-limite-perto$/, area: 'ia', tom: 'aviso', frase: 'A IA está perto do limite de uso do dia.' },
    { t: /^backup-/, area: 'backup', tom: 'aviso', frase: 'O backup precisa de conferência.' },
    { t: /^comunicar-/, area: 'comunicar', tom: 'aviso', frase: 'As mensagens automáticas do Comunicar estão paradas.' },
    { t: /^(crm|agenda|atendimento)-fora$/, area: 'apps', tom: 'ruim', frase: 'Um dos apps da Central não está respondendo.' },
    { t: /^sincronia-/, area: 'apps', tom: 'aviso', frase: 'A sincronia entre os apps está parada.' },
    { t: /^cliente-esperando$/, area: 'monitor', tom: 'aviso', frase: 'Tem cliente esperando resposta no Atendimento.' },
    { t: /^orcador-conexao-falhou$/, area: 'orcador', tom: 'ruim', frase: 'Uma aprovação recente não chegou inteira ao CRM, à Agenda ou ao sino.' },
    { t: /^tarefas-acumuladas$/, area: 'monitor', tom: 'aviso', frase: 'Tem tarefa demais acumulada: vale conferir e concluir as velhas.' },
    { t: /^notificacoes-acumuladas$/, area: 'monitor', tom: 'aviso', frase: 'Tem aviso demais acumulado no sino: vale marcar como lidos.' },
    { t: /^e2e-/, area: 'monitor', tom: 'aviso', frase: 'O teste automático de ponta a ponta falhou. Avise o administrador.' },
  ];
  /**
   * Rodada 9: os 23 avisos graves do Vigia viram título curto + o que fazer, para quem não é técnico.
   * Antes o título era o texto cru do Vigia (até 400 letras) e só 6 famílias tinham plano; sincronia, apps fora, Orçador e site caíam no genérico.
   * abrir: app + endereço dentro dele (só aparece para quem tem acesso ao app).
   */
  const INTEG = { app: 'atendimento', q: '?aba=integracoes', rotulo: 'Abrir Integrações' };
  const APP_FORA = (nome) => ({ titulo: `${nome} fora do ar`, passo: 'Recarregue a página. Se continuar fora por mais de 10 minutos, avise o suporte: a Central roda num serviço só.' });
  const FAIXA_VIGIA = {
    'whatsapp-sem-config': { titulo: 'WhatsApp sem configuração', passo: 'Preencha a conexão do WhatsApp em Atendimento › Integrações.', abrir: INTEG },
    'codewords-chave-recusada': { titulo: 'WhatsApp recusado', passo: 'Gere uma chave nova no CodeWords e cole em Atendimento › Integrações.', abrir: INTEG },
    'codewords-fora': { titulo: 'Serviço do WhatsApp fora do ar', passo: 'As mensagens podem não sair. Mande pelo seu WhatsApp enquanto isso e avise o suporte se passar de 1 hora.' },
    'whatsapp-desconectado': { titulo: 'WhatsApp da oficina desconectado', passo: 'Reconecte o aparelho em Atendimento › Configurações (Conexão do WhatsApp).', abrir: { app: 'atendimento', q: '', rotulo: 'Abrir o Atendimento' } },
    'whatsapp-sem-receber': { titulo: 'WhatsApp não está recebendo mensagens', passo: 'Mande uma mensagem de teste para o número da oficina. Se não chegar, confira Atendimento › Integrações.', abrir: INTEG },
    'sincronia-parada': { titulo: 'Sincronia entre os apps parada', passo: 'O que chega pelo WhatsApp pode não aparecer na Agenda e no CRM. Confira Atendimento › Integrações e avise o suporte.', abrir: INTEG },
    'webhook-fora': { titulo: 'Entrada de mensagens do WhatsApp fora', passo: 'Faça o teste de envio em Atendimento › Integrações.', abrir: INTEG },
    'atendimento-fora': APP_FORA('Atendimento'),
    'agenda-fora': APP_FORA('Agenda'),
    'comunicar-fora': APP_FORA('Comunicar'),
    'crm-fora': APP_FORA('CRM'),
    'orcador-fora': { titulo: 'Orçador fora do ar', passo: 'Anote o orçamento no papel ou no WhatsApp e lance no Orçador quando voltar. Se passar de 1 hora, avise o suporte.' },
    'site-fora': { titulo: 'Site da oficina fora do ar', passo: 'Quem procura a oficina na internet não consegue abrir o site. Avise o suporte.' },
    'exclusao-em-massa': { titulo: 'Muita coisa apagada de uma vez', passo: 'Confirme com a equipe quem apagou. Se não foi de propósito, peça ao suporte para restaurar do backup.' },
    'admin-novo': { titulo: 'Novo administrador criado', passo: 'Confirme se foi você ou alguém de confiança. Se não foi, tire o acesso em Atendimento › Equipe.', abrir: { app: 'atendimento', q: '', rotulo: 'Abrir o Atendimento' } },
    'anthropic-chave-recusada': { titulo: 'Chave da IA recusada', passo: 'A IA parou de responder. Peça ao suporte uma chave nova e cole nas Integrações do Atendimento.', abrir: INTEG },
    'anthropic-sem-credito': { titulo: 'IA sem crédito', passo: 'Coloque crédito na conta da IA (o suporte sabe onde). Até lá a equipe responde sem a IA.' },
    'anthropic-fora': { titulo: 'IA fora do ar', passo: 'A equipe responde sem a IA por enquanto. Ela volta sozinha.' },
    'comunicar-carteiro-parado': { titulo: 'Mensagens automáticas paradas', passo: 'Lembretes e pós-venda podem estar atrasados. Abra o Comunicar e confira o carteiro.', abrir: { app: 'comunicar', q: '', rotulo: 'Abrir o Comunicar' } },
    'comunicar-fila-parada': { titulo: 'Fila do Comunicar parada', passo: 'Mensagens podem estar acumulando. Abra o Comunicar e confira a fila.', abrir: { app: 'comunicar', q: '', rotulo: 'Abrir o Comunicar' } },
    'patio-avisos-parados': { titulo: 'Avisos do Pátio parados', passo: 'O cliente pode não estar sabendo da etapa do carro. Abra o Pátio e confira a rotina de avisos.', abrir: { app: 'patio', q: '', rotulo: 'Abrir o Pátio' } },
    'backup-faltando': { titulo: 'Backup do banco atrasado', passo: 'Peça ao suporte para conferir a cópia diária do banco.' },
    'backup-ensaio-falhou': { titulo: 'Teste de restauração do backup falhou', passo: 'Peça ao suporte para refazer o teste de restauração.' },
  };
  /** Itens da faixa do Vigia: { codigo, titulo, tempo, passo, detalhe, abrir } + a linha de Vigia parado (horas até 47 h; depois, dias). */
  function faixaDoVigia(vigia) {
    const out = [];
    for (const a of (vigia && Array.isArray(vigia.graves) ? vigia.graves : [])) {
      const c = String(a && a.codigo || '').trim().toLowerCase();
      const f = FAIXA_VIGIA[c];
      const r = f ? null : regraDoCodigo(c);
      const dias = Number.isInteger(a.dias) && a.dias > 0 ? a.dias : 0;
      const resumo = String(a.resumo || '').replace(/\s+/g, ' ').trim();
      out.push({
        codigo: c,
        titulo: f ? f.titulo : (r ? r.frase.replace(/\.$/, '') : 'Problema detectado pelo Vigia'),
        tempo: dias ? `há ${dias} dia${dias === 1 ? '' : 's'}` : '',
        passo: f ? f.passo : 'Confira o sistema afetado e peça ajuda ao suporte se a falha continuar.',
        detalhe: resumo ? (resumo.length > 160 ? resumo.slice(0, 159) + '…' : resumo) : '',
        abrir: f && f.abrir ? f.abrir : null,
      });
    }
    if (vigia && vigia.vigia_parado) {
      const h = Math.floor((Date.parse(vigia.gerado_em) - Date.parse(vigia.vigia_conferiu_em)) / 3600000);
      const horas = Math.max(1, h);
      const titulo = !Number.isFinite(h) ? 'O Vigia está sem registro da última conferência'
        : horas >= 48 ? `O Vigia não confere há ${Math.floor(horas / 24)} dias` : `O Vigia não confere há ${horas} hora${horas === 1 ? '' : 's'}`;
      out.push({ codigo: 'vigia-parado', titulo, tempo: '', passo: 'Peça ao suporte para conferir a rotina do Vigia. Enquanto isso, ninguém está de olho nos sistemas.', detalhe: '', abrir: null });
    }
    return out;
  }
  const CODIGO_OK = /^[a-z0-9][a-z0-9_-]{0,60}$/;
  function regraDoCodigo(codigo) {
    const c = String(codigo || '').trim().toLowerCase();
    if (!CODIGO_OK.test(c)) return null;
    const r = REGRAS_VIGIA.find((x) => x.t.test(c));
    return r ? { codigo: c, area: r.area, tom: r.tom, frase: r.frase } : { codigo: c, area: 'monitor', tom: 'aviso', frase: 'O monitor achou um problema. Avise o administrador.' };
  }
  const PESO_TOM = { ruim: 2, aviso: 1, neutro: 0, ok: 0 };
  const piorTom = (a, b) => (PESO_TOM[b] > PESO_TOM[a] ? b : a);
  const minutosDesde = (iso, agoraMs) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.round((agoraMs - t) / 60000)) : null; };
  const haQuanto = (min) => (min === null ? '' : min < 2 ? 'agora há pouco' : 'há ' + L.duracao(min * 60000));

  /**
   * Junta a RPC r7_c1_saude_sistemas, a sonda do servidor (Pátio/Orçador/apps da Central) e, para o gestor, r7_x3_saude
   * em UMA lista de sistemas: { k, nome, ico, tom, resumo, detalhes[], plano, app }.
   */
  function saudeSistemas({ rpc = null, vigia = null, sonda = null, banco = null, agoraMs = Date.now() } = {}) {
    const itens = {};
    const garantir = (k) => (itens[k] = itens[k] || { k, nome: NOME_SIST[k], ico: ICO_SIST[k], tom: 'ok', resumo: '', detalhes: [], plano: '', app: null });
    const marca = (k, tom, detalhe, plano) => { const i = garantir(k); i.tom = piorTom(i.tom, tom); if (detalhe) i.detalhes.push(detalhe); if (plano && !i.plano) i.plano = plano; };
    // Pátio e Orçador: a sonda do servidor
    for (const k of ['patio', 'orcador']) {
      const s = sonda && sonda.apps && sonda.apps[k];
      garantir(k).app = k;
      if (s && s.fora) {
        const min = Number.isFinite(s.desde) ? Math.max(0, Math.round((agoraMs - s.desde) / 60000)) : 0;
        marca(k, 'ruim', `${NOME_SIST[k]} ${root.CasaLogica2 ? root.CasaLogica2.rotuloMotivo(s.motivo) : 'não respondeu'}${min >= 1 ? ' há ' + L.duracao(min * 60000) : ''}`, root.CasaLogica2 ? root.CasaLogica2.PLANO_B[k] : '');
      } else if (s && s.suspeito) marca(k, 'aviso', `${NOME_SIST[k]} demorou a responder agora; conferindo de novo.`);
    }
    // apps da própria Central que não subiram
    const internos = (sonda && sonda.internos) || {};
    for (const [k, v] of Object.entries(internos)) if (v && v.ok === false) marca('apps', 'ruim', `${String(k).slice(0, 20)} não subiu nesta Central.`, 'Avise o suporte: o resto da Central continua no ar.');
    const r = rpc || null;
    if (r) {
      const wa = r.whatsapp || {};
      const est = ESTADOS_WHATSAPP[wa.estado];
      garantir('whatsapp').app = 'atendimento';
      if (est) {
        marca('whatsapp', est.tom, wa.estado === 'ok' ? '' : `WhatsApp ${est.frase}${wa.desde ? ' (' + haQuanto(minutosDesde(wa.desde, agoraMs)) + ')' : ''}`, est.plano);
        if (wa.motivo && est.tom !== 'ok') itens.whatsapp.detalhes.push(texto(wa.motivo, 140));
      }
      const c = r.comunicar || {};
      garantir('comunicar').app = 'comunicar';
      if (c.pausa_geral) marca('comunicar', 'aviso', 'Em pausa geral: nada sai automaticamente.', 'O gestor liga de novo no Comunicar.');
      if (num(c.falhas_24h) > 0) marca('comunicar', num(c.falhas_24h) >= 5 ? 'ruim' : 'aviso', `${num(c.falhas_24h)} envio${num(c.falhas_24h) === 1 ? '' : 's'} com falha nas últimas 24 h.`, 'Abra o Comunicar para ver o motivo de cada um.');
      const rod = minutosDesde(c.ultima_rodada_em, agoraMs);
      if (num(c.fila) > 0 && rod !== null && rod > 90) marca('comunicar', 'aviso', `${num(c.fila)} mensagem${num(c.fila) === 1 ? '' : 'ns'} na fila e o carteiro não roda ${haQuanto(rod).replace('há ', 'há ')}.`, 'Abra o Comunicar e toque em "rodar agora".');
      const m = r.movere || {};
      garantir('movere').app = 'orcador';
      if (!m.ultima_carga) { itens.movere.tom = 'neutro'; itens.movere.detalhes.push('Ainda sem acesso real ao Movere: o Orçador usa a tabela cadastrada.'); }
      else {
        const dias = Math.floor((minutosDesde(m.ultima_carga, agoraMs) || 0) / 1440);
        if (dias >= 7) marca('movere', 'aviso', `Última carga do Movere há ${dias} dias.`, 'Rode a carga no Orçador (Configurações).');
      }
      if (num(r.patio_falhas_24h) > 0) marca('patio', 'aviso', `${num(r.patio_falhas_24h)} erro${num(r.patio_falhas_24h) === 1 ? '' : 's'} registrado${num(r.patio_falhas_24h) === 1 ? '' : 's'} no Pátio nas últimas 24 h.`);
    }
    if (vigia?.erro) marca('monitor', 'aviso', 'Não deu para conferir o Vigia.');
    if (vigia?.vigia_parado) marca('monitor', 'ruim', 'O Vigia parou de conferir os sistemas.');
    for (const aviso of vigia?.graves || []) {
      const g = regraDoCodigo(aviso.codigo);
      if (g) marca(g.area, 'ruim', g.frase, g.area === 'whatsapp' ? 'Mande pelo seu WhatsApp. O gestor resolve nas Integrações do Atendimento.' : '');
    }
    // só o gestor: gatilhos, tarefas agendadas e tabelas do banco
    if (banco && typeof banco === 'object') {
      const falhas = Array.isArray(banco.cron && banco.cron.falhas_24h) ? banco.cron.falhas_24h.length : 0;
      const faltando = [].concat(banco.gatilhos && banco.gatilhos.faltando || [], banco.cron && banco.cron.faltando || [], banco.funcoes_faltando || [], banco.tabelas_faltando || []).length;
      if (falhas) marca('monitor', 'aviso', `${falhas} rotina${falhas === 1 ? '' : 's'} agendada${falhas === 1 ? '' : 's'} do banco falhou nas últimas 24 h.`);
      if (faltando) marca('monitor', 'ruim', `${faltando} peça${faltando === 1 ? '' : 's'} esperada${faltando === 1 ? '' : 's'} do banco não existe${faltando === 1 ? '' : 'm'} (gatilho, rotina, função ou tabela).`);
    }
    const ordem = ['whatsapp', 'patio', 'orcador', 'comunicar', 'movere', 'ia', 'backup', 'apps', 'monitor'];
    const lista = ordem.filter((k) => itens[k]).map((k) => {
      const i = itens[k];
      i.resumo = i.tom === 'ok' ? 'tudo certo' : i.tom === 'neutro' ? (i.detalhes[0] || 'sem leitura') : (i.detalhes[0] || 'precisa de atenção');
      return i;
    });
    const pior = lista.reduce((p, i) => piorTom(p, i.tom), 'ok');
    return { itens: lista, pior, problemas: lista.filter((i) => i.tom === 'ruim' || i.tom === 'aviso').length };
  }
  /** Pílula do topo: o que aparece fechado. */
  function resumoDaSaude(s) {
    if (!s || !s.itens || !s.itens.length) return { tom: 'neutro', texto: 'Saúde dos sistemas: sem leitura' };
    const ruins = s.itens.filter((i) => i.tom === 'ruim'), avisos = s.itens.filter((i) => i.tom === 'aviso');
    if (ruins.length) return { tom: 'ruim', texto: ruins.length === 1 ? `${ruins[0].nome} com problema` : `${ruins.length} sistemas com problema` };
    if (avisos.length) return { tom: 'aviso', texto: avisos.length === 1 ? `${avisos[0].nome} pede atenção` : `${avisos.length} sistemas pedem atenção` };
    return { tom: 'ok', texto: 'Todos os sistemas em ordem' };
  }

  /* ---------------- ligações quebradas entre sistemas (r7_x3_ligacoes_quebradas) ---------------- */
  const PESO_GRAV = { alta: 3, media: 2, baixa: 1 };
  const APP_DA_LIGACAO = [[/^Agenda/, 'agenda'], [/^Pátio/, 'patio'], [/^Orçador/, 'orcador'], [/^CRM/, 'crm'], [/^Atendimento/, 'atendimento'], [/^Comunicar/, 'comunicar']];
  /** As verificações com problema, as mais graves e mais recentes primeiro, com o primeiro link que a Casa sabe abrir. */
  function resumoLigacoes(rel, bases, origem, limite = 6) {
    const v = rel && Array.isArray(rel.verificacoes) ? rel.verificacoes : [];
    const itens = v.filter((x) => num(x.quantidade) > 0).map((x) => {
      const app = (APP_DA_LIGACAO.find(([re]) => re.test(String(x.app || ''))) || [null, 'agenda'])[1];
      const link = (Array.isArray(x.links) ? x.links : []).find((u) => L.appDoLink(u, origem, bases)) || '';
      return { codigo: String(x.codigo || '').slice(0, 60), app, appNome: texto(x.app, 30), texto: texto(x.descricao, 140), como: texto(x.como_resolver, 160), n: num(x.quantidade), recentes: num(x.recentes), grav: String(x.gravidade || 'baixa'), link };
    });
    itens.sort((a, b) => (PESO_GRAV[b.grav] || 0) - (PESO_GRAV[a.grav] || 0) || b.recentes - a.recentes || b.n - a.n);
    return { total: itens.reduce((s, i) => s + i.n, 0), tipos: itens.length, itens: itens.slice(0, limite), alta: itens.filter((i) => i.grav === 'alta').length };
  }

  /* ---------------- ficha rápida do cliente (r6_cliente_360) ---------------- */
  const ROTULO_ACAO = { extra_pendente: 'Extra esperando o cliente', enviar_link_acompanhar: 'Mandar o link de acompanhar', cobrar_orcamento: 'Cobrar o orçamento', agendar_orcamento: 'Marcar horário do orçamento aprovado', responder: 'Responder a conversa', responder_avaliacao: 'Responder a avaliação', criar_orcamento: 'Criar orçamento', nao_mandar_mensagens: 'Não mandar mensagens (pediu para parar)' };
  /** Resumo da ficha: tudo já escapado na hora de desenhar; aqui só limites e links que a Casa sabe abrir. */
  function fichaDe(c, bases, origem) {
    const f = c && typeof c === 'object' ? c : {};
    const cli = f.cliente || {};
    const seguro = (u) => (u && L.appDoLink(u, origem, bases) ? String(u) : '');
    const r = f.resumo || {};
    const tel = L.formatarTelefone(cli.telefone_55 || cli.telefone || '');
    const patio = (Array.isArray(f.patio) ? f.patio : []).filter((o) => o && o.aberta !== false && !['entregue', 'cancelado'].includes(o.etapa)).slice(0, 3)
      .map((o) => ({ numero: o.numero, veiculo: texto(o.veiculo, 60), placa: o.placa ? L.formatarPlaca(o.placa) : '', etapa: o.etapa_rotulo || L.rotuloEtapa(o.etapa), atrasado: !!o.atrasado, extras: Array.isArray(o.extras) ? o.extras.length : 0, link: seguro(o.link_equipe) }));
    const orcamentos = (Array.isArray(f.orcamentos) ? f.orcamentos : []).slice(0, 4)
      .map((q) => ({ numero: q.numero, status: q.status_rotulo || L.rotuloOrc(q.status), total: num(q.total), veiculo: texto(q.veiculo, 60), esperandoHoras: num(q.horas_esperando), link: seguro(q.link_equipe) }));
    const agenda = (Array.isArray(f.agendamentos) ? f.agendamentos : []).filter((a) => a && a.data && a.data >= (L.hojeSP())).slice(0, 3)
      .map((a) => ({ data: a.data, hora: L.hora5(a.hora), servico: texto(a.servico, 60), status: L.rotuloAg(a.status), link: seguro(a.link_equipe) }));
    const acoes = (Array.isArray(f.acoes_sugeridas) ? f.acoes_sugeridas : []).slice(0, 5).map((a) => ({ codigo: String(a.codigo || '').slice(0, 40), app: String(a.app || '').slice(0, 20), titulo: texto(a.titulo || ROTULO_ACAO[a.codigo] || 'Ação sugerida', 90), motivo: texto(a.motivo, 140), link: seguro(a.link) }));
    const linha = (Array.isArray(f.linha_do_tempo) ? f.linha_do_tempo : []).slice(0, 10).map((e) => ({ quando: e.quando || null, app: String(e.app || '').slice(0, 20), titulo: texto(e.titulo, 90), detalhe: texto(e.detalhe, 120), link: seguro(e.link) }));
    const chips = [];
    if (num(r.orcamentos_total)) chips.push(`${num(r.orcamentos_total)} orçamento${num(r.orcamentos_total) === 1 ? '' : 's'}`);
    if (num(r.orcamentos_aprovados)) chips.push(`${num(r.orcamentos_aprovados)} aprovado${num(r.orcamentos_aprovados) === 1 ? '' : 's'}`);
    if (num(r.valor_orcamentos_em_aberto) > 0) chips.push(`${L.brl(r.valor_orcamentos_em_aberto)} em aberto`);
    if (r.nota_media) chips.push(`nota ${Number(r.nota_media).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`);
    if (r.dias_desde_ultima_visita !== undefined && r.dias_desde_ultima_visita !== null) chips.push(r.dias_desde_ultima_visita === 0 ? 'esteve aqui hoje' : `última visita há ${num(r.dias_desde_ultima_visita)} dia${num(r.dias_desde_ultima_visita) === 1 ? '' : 's'}`);
    return {
      nome: texto(cli.nome, 80) || tel || 'Cliente', telefone: tel, tel55: L.telefoneE164(cli.telefone_55 || cli.telefone || ''), aceita: cli.aceita_mensagens !== false && !(acoes.some((a) => a.codigo === 'nao_mandar_mensagens')),
      chips, patio, orcamentos, agenda, acoes, linha, vazio: !patio.length && !orcamentos.length && !agenda.length && !linha.length,
      links: { crm: seguro(f.links && f.links.crm), comunicar: seguro(f.links && f.links.comunicar), atendimento: seguro(f.links && f.links.atendimento), cotacao: seguro(f.links && f.links.nova_cotacao) },
    };
  }

  /* ---------------- sino: adiar com escolha ---------------- */
  const OPCOES_ADIAR = [{ k: '1h', rotulo: '1 hora' }, { k: '3h', rotulo: '3 horas' }, { k: 'amanha', rotulo: 'amanhã 8h' }];
  /** Até quando esconder o aviso (ms). 'amanha' = 8h do próximo dia (pulando domingo), no fuso da oficina. */
  function ateQuando(opcao, agora = new Date()) {
    if (opcao === '1h') return agora.getTime() + 3600_000;
    if (opcao === '3h') return agora.getTime() + 3 * 3600_000;
    if (opcao === 'amanha') {
      const d = new Date(L.hojeSP(agora) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
      return Date.parse(d.toISOString().slice(0, 10) + 'T08:00:00-03:00');
    }
    return agora.getTime() + 3600_000;
  }
  const quandoVolta = (ate, agoraMs = Date.now()) => {
    const min = Math.max(1, Math.round((num(ate) - agoraMs) / 60000));
    return min < 60 ? `volta em ${min} min` : `volta em ${L.duracao(min * 60000)}`;
  };

  /* ---------------- sino: para onde cada aviso leva ---------------- */
  /** O aviso de "tarefas vencidas" não tem app nem link (28 no banco): leva para a lista de tarefas da própria Casa, não para uma aba. */
  function acaoDoAviso(n, bases, origem) {
    if (!n) return { acao: 'nada' };
    if (n.tipo === 'tarefas_vencidas' || n.app === 'tarefas') return { acao: 'tarefas', filtro: 'vencidas' };
    const url = L.linkDaNotificacao(n, bases, origem);
    return L.appDoLink(url, origem, bases) ? { acao: 'abrir', url } : { acao: 'nada' };
  }
  /** O "app" que o sino usa para filtrar: avisos sem app (tarefas vencidas) viram o filtro Tarefas. */
  const appDoAviso = (n) => n.app || (n.tipo === 'tarefas_vencidas' ? 'tarefas' : null);
  /** Texto de busca de um aviso (sem acento, tudo junto) para o campo de busca do sino. */
  const textoDoAviso = (n) => L.semAcento([n && n.titulo, n && n.corpo, n && n.app, n && n.tipo].filter(Boolean).join(' '));
  function filtrarPorTexto(lista, busca) {
    const q = L.semAcento(busca).trim();
    if (!q) return lista;
    const ps = q.split(/\s+/);
    return lista.filter((n) => { const t = textoDoAviso(n); return ps.every((p) => t.includes(p)); });
  }

  /* ---------------- busca: pessoas e filtros por tipo ---------------- */
  /** `pessoas` do r6_busca_global: uma linha por telefone, com onde ela aparece. */
  function pessoasDaBusca(x3, limite = 4) {
    const p = x3 && Array.isArray(x3.pessoas) ? x3.pessoas : [];
    const NOME = { agendamento: 'Agenda', cliente: 'cliente', conversa: 'conversa', lead: 'CRM', orcamento: 'orçamento', os: 'Pátio' };
    return p.filter((x) => x && nacional(x.telefone_55 || x.telefone)).slice(0, limite).map((x) => ({
      nome: texto(x.nome, 80) || L.formatarTelefone(x.telefone_55 || x.telefone), telefone: L.formatarTelefone(x.telefone_55 || x.telefone), tel55: L.telefoneE164(x.telefone_55 || x.telefone),
      achouEm: [...new Set((Array.isArray(x.achou_em) ? x.achou_em : []).map((a) => NOME[a] || String(a).slice(0, 20)))],
    }));
  }
  /** Chips de filtro da busca com a contagem real (contagens vem do banco, antes do corte por grupo). */
  function filtrosDaBusca(grupos, contagens) {
    const c = contagens || {};
    return [{ k: '', nome: 'Tudo', n: grupos.reduce((s, g) => s + g.linhas.length, 0) }].concat(grupos.map((g) => ({ k: g.k, nome: g.nome, n: Math.max(g.linhas.length, num(c[g.k])) })));
  }
  /** Quantos resultados o banco achou além dos que aparecem (para "mostrando 5 de 12"). */
  const alemDoCorte = (g, contagens) => Math.max(0, num(contagens && contagens[g.k]) - g.linhas.length);
  /** Erro dos links do cliente em português: a mensagem do servidor (já escrita para a equipe) ou, se a rede caiu, o que fazer. Nada de "Failed to fetch". */
  function erroDosLinks(e, online = true) {
    const m = String((e && e.message) || '').trim();
    if (!online) return 'Sem internet agora. Confira a conexão e tente de novo.';
    if (!m || m === 'falhou' || /failed to fetch|networkerror|load failed|network request failed/i.test(m) || (e && e.name === 'TypeError')) return 'A Central não respondeu. Tente de novo em instantes.';
    return m.length > 140 ? m.slice(0, 139) + '…' : m;
  }
  /** Linha de contagem da busca. Antes, quando só achava pessoas, dizia "2 resultados em 0 sistema". */
  function dicaDaBusca(total, nPessoas, nSistemas) {
    const t = num(total), p = num(nPessoas), s = num(nSistemas);
    const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
    if (!t && !p) return '';
    if (!t) return pl(p, 'pessoa achada', 'pessoas achadas');
    const r = `${pl(t, 'resultado', 'resultados')} em ${pl(s, 'sistema', 'sistemas')}`;
    return p ? `${pl(p, 'pessoa', 'pessoas')} · ${r}` : r;
  }

  /* ---------------- papéis: recepção e mecânico ---------------- */
  /** Cartão de chegadas da recepção: quem falta chegar primeiro, por horário; o próximo em destaque. */
  function chegadasDaRecepcao(lista, hm, hoje) {
    const itens = (lista || []).filter((x) => x && x.hora).slice().sort((a, b) => L.hora5(a.hora).localeCompare(L.hora5(b.hora)));
    const falta = itens.filter((x) => ['aguardando', 'confirmado'].includes(x.status));
    const proximo = falta.find((x) => L.hora5(x.hora) >= hm) || null;
    const atrasados = falta.filter((x) => L.hora5(x.hora) < hm);
    const chegaram = itens.filter((x) => L.CHEGARAM.includes(x.status) || x.os_id);
    return { total: itens.length, falta: falta.length, proximo, atrasados, chegaram: chegaram.length, hoje };
  }
  /** Ordem dos carros do mecânico: pronto primeiro (precisa de retirada), depois os mais antigos na etapa. */
  function ordemDoMecanico(carros, agoraMs = Date.now()) {
    return (carros || []).slice().sort((a, b) => (b.etapa === 'pronto') - (a.etapa === 'pronto') || Date.parse(a.etapa_em || 0) - Date.parse(b.etapa_em || 0))
      .map((c) => ({ ...c, tom: L.tomDaEtapa(c.etapa, c.etapa_em, agoraMs) }));
  }

  root.CasaLogica4 = Object.freeze({
    nacional, telefoneDoLinkWa, VALIDADE_PARAR_MS, MOTIVOS_PARAR, rotuloParar, estadoParar, paraConsultar, guardarParar, textoBloqueado, AVISO_PARAR_SEM_CONFERIR, AVISO_PARAR_BLOQUEADO,
    ORIGENS_TAREFA, TIPOS_ORC_TAREFA, infoDaTarefa, ehDoOrcador, contarReabordar, linkDaDescricao, descricaoLimpa,
    NOME_SIST, ESTADOS_WHATSAPP, REGRAS_VIGIA, regraDoCodigo, FAIXA_VIGIA, faixaDoVigia, saudeSistemas, resumoDaSaude,
    resumoLigacoes, ROTULO_ACAO, fichaDe, OPCOES_ADIAR, ateQuando, quandoVolta, acaoDoAviso, appDoAviso, textoDoAviso, filtrarPorTexto,
    pessoasDaBusca, filtrosDaBusca, alemDoCorte, dicaDaBusca, erroDosLinks, chegadasDaRecepcao, ordemDoMecanico,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
