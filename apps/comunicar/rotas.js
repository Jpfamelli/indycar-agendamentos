// -----------------------------------------------------------------------------
// API do IndyCar Comunicar — o porteiro de TODAS as rotas e os seus handlers.
// `criarApi(deps)` não conhece o banco nem o WhatsApp diretamente: recebe tudo
// por parâmetro (deps.dados, deps.whatsapp, deps.carteiro, deps.autenticar…).
// O server.js passa o de verdade; os testes (`npm test`) passam falsos e
// conferem papéis, aprovação, auditoria e limites sem banco e sem rede.
//
// Ordem de cada chamada: rota existe? (404/405) → CORS → limite por IP →
// login (401) → acesso ao app (403) → segundo fator (401) → troca de senha
// obrigatória (403) → permissão do papel (403) → limite por usuário (429) →
// JSON válido (400/413) → handler. Erro inesperado = 500 sem detalhe interno.
// -----------------------------------------------------------------------------
import { randomUUID } from 'node:crypto';
import * as A from './acesso.js';
import * as auto from './automacoes.js';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import * as carteiroPuro from './carteiro.js';
import * as prontidao from './prontidao.js';
import * as projecao from './projecao.js';
import * as aniv from './aniversarios.js';
import * as patio from './patio.js';
import * as conexoes from './conexoes.js';
import { montarSaude } from './whatsapp.js';
import * as r7 from './r7.js';
import { registrarRotas7 } from './rotas7.js';

const LIMITE_AREA = 300;      // convite da Área do Cliente: um link (rpc) por pessoa
const LIMITE_CORPO = 2_000_000; // importação de planilha pode ser grande

/* Cliente de exemplo para a prévia das variações da IA. */
const EXEMPLO_PREVIA = { nome: 'Maria Aparecida Souza', carro: 'HB20 2019', placa: 'FHR6F16', servico: 'troca de óleo', quando: 'amanhã às 09:00', meses: 6, detalhe: 'sábado até 12h' };

function lerCorpo(req, limite = LIMITE_CORPO) {
  return new Promise((resolve) => {
    let raw = '', estourou = false;
    req.on('data', (c) => {
      if (estourou) return;
      raw += c;
      if (raw.length > limite) { estourou = true; raw = ''; resolve({ __grande: true }); req.resume(); }
    });
    req.on('end', () => { if (!estourou) resolve(A.lerJson(raw)); });
    req.on('error', () => resolve({ __invalido: true }));
  });
}

/** O navegador aceita esta compressão? ("gzip, deflate, br;q=1.0" → br e gzip sim). */
export function aceitaCodificacao(cabecalho, nome) {
  return String(cabecalho || '').toLowerCase().split(',').some((p) => {
    const [tok, ...params] = p.trim().split(';');
    if (tok.trim() !== nome) return false;
    const q = params.map((x) => x.trim()).find((x) => x.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
}

const mascararTel = (t) => { const d = String(t || '').replace(/\D/g, ''); return d ? `…${d.slice(-4)}` : null; };

export function criarApi(deps) {
  const {
    dados, ia = null, whatsapp = {}, carteiro = {}, autenticar, versao = 'dev',
    runnerToken = '', relogio = () => Date.now(), https = false, origensExtras = [],
    supabase = { url: '', anon: '', configurado: false }, log = console,
  } = deps;
  const seguros = A.cabecalhosSeguros({ https });
  const limIp = deps.limiteIp || A.criarLimitador({ janelaMs: 60_000, max: 300, relogio });
  const limCaro = deps.limiteCaro || A.criarLimitador({ janelaMs: 60_000, max: 20, relogio });
  const limAvulsa = deps.limiteAvulsa || A.criarLimitador({ janelaMs: 3_600_000, max: 30, relogio });
  const marcarAcesso = A.criarMarcadorDeAcesso({ relogio });

  // ---- respostas ---------------------------------------------------------------
  /* Rodada 4: resposta grande vai comprimida (brotli ou gzip, o que o navegador aceitar). */
  function send(res, status, data, headers = {}) {
    let body = typeof data === 'string' ? data : JSON.stringify(data);
    const extra = {};
    if (body.length > 1400 && res.__aceita) {
      if (aceitaCodificacao(res.__aceita, 'br')) { body = brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 4 } }); extra['Content-Encoding'] = 'br'; }
      else if (aceitaCodificacao(res.__aceita, 'gzip')) { body = gzipSync(body, { level: 6 }); extra['Content-Encoding'] = 'gzip'; }
      if (extra['Content-Encoding']) extra.Vary = 'Accept-Encoding';
    }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...seguros, ...(res.__cors || {}), ...extra, ...headers });
    res.end(body);
  }
  const ok = (res, d) => send(res, 200, d);
  const bad = (res, msg, extra = {}) => send(res, 400, { erro: msg, ...extra });
  const naoAchou = (res) => send(res, 404, { erro: 'Não encontrado.' });
  const proibido = (res, perm) => send(res, 403, { erro: A.motivo403(perm), codigo: 'sem_permissao' });

  const auditar = (u, acao, tabela, registro, detalhes) =>
    Promise.resolve(dados.auditar?.(u?.id || null, acao, tabela, registro, detalhes)).catch(() => null);

  /** Enfileira a campanha (já aprovada ou feita por gestor). Rodada 5: respeita o limite diário (escalona nos dias seguintes). */
  async function executarCampanha({ corpo, detalhe, destinos, enviarEm, criador, campanhaId = null, simular = false, evitarDias = 0, segmento = null, repeteLote = null, origem = 'comunicar', variante = null, abGrupo = null }) {
    const cfg = (await Promise.resolve(dados.obterConfig?.()).catch(() => null)) || {};
    const porteiro = await dados.carregarPorteiro({ intervalo_minimo_dias: 0 });
    const lote = randomUUID();
    const linhas = [];
    const pulados = { total: 0, nao_quer: 0, sem_link: 0, recente: 0 };
    const recentes = evitarDias > 0 ? await dados.recebeuCampanhaRecente?.(evitarDias).catch(() => null) : null;
    // Pátio (16/10): {link_area} = convite da Área do Cliente, um link NOVO por cliente
    const area = patio.usaLinkArea(corpo);
    const tipo = area ? 'area_cliente' : 'campanha';
    const links = area ? (simular ? new Map(destinos.map((d) => [d.cliente_id ?? d.id ?? null, `${patio.PATIO_URL}/minha/?c=(link-do-cliente)`])) : await linksDaArea(destinos)) : null;
    const vistosTel = new Set();
    // rodada 7: teto de campanhas por cliente em 30 dias (0 = sem teto)
    const teto = Number(cfg.max_campanhas_30d) > 0 && dados.campanhasRecebidas30d ? await dados.campanhasRecebidas30d(destinos.map((x) => x.telefone)).catch(() => null) : null;
    for (const d of destinos) {
      const clienteId = d.cliente_id ?? d.id ?? null;
      const digs = String(d.telefone ?? '').replace(/\D/g, '');
      const telN = digs.length >= 12 && digs.startsWith('55') ? digs.slice(2) : digs;
      // telefone repetido (dois cadastros do mesmo número, lista com duplicata) recebe UMA vez só; número curto demais não é WhatsApp
      if (!telN || telN.length < 10 || vistosTel.has(telN)) { pulados.total++; pulados.invalido = (pulados.invalido || 0) + 1; continue; }
      // rodada 7: fixo, DDD que não existe e número de mentira nunca entram na campanha
      if (cfg.validar_celular !== false && !r7.validarCelular(d.telefone).ok) { pulados.total++; pulados.celular = (pulados.celular || 0) + 1; continue; }
      if (teto && (teto.get(telN) || 0) >= Number(cfg.max_campanhas_30d)) { pulados.total++; pulados.teto = (pulados.teto || 0) + 1; continue; }
      const v = porteiro.podeReceber({ cliente_id: clienteId, telefone: d.telefone, tipo });
      if (!v.ok) { pulados.total++; pulados.nao_quer++; continue; }
      // rodada 6: quem recebeu campanha há pouco fica de fora quando a pessoa pediu "não repetir"
      if (recentes && ((clienteId && recentes.ids.has(clienteId)) || recentes.tels.has(telN))) { pulados.total++; pulados.recente++; continue; }
      const linkArea = area ? links.get(clienteId) : '';
      if (area && !linkArea) { pulados.total++; pulados.sem_link++; continue; }   // sem cadastro de cliente não dá para gerar o link
      vistosTel.add(telN);
      linhas.push({
        cliente_id: clienteId, telefone: d.telefone, nome: d.nome ?? null, tipo,
        corpo: dados.renderTemplate(corpo, { nome: d.nome, carro: d.carro, placa: d.placa, servico: d.servico || '', detalhe: detalhe || '', link_area: linkArea }),
        enviar_em: enviarEm, criado_por: criador?.nome || null, criado_por_id: criador?.id || null, lote, campanha_id: campanhaId,
      });
    }
    // limite diário: o que não cabe hoje é programado para os próximos dias, na hora de envio
    const hojeIso = dados.hoje?.() || new Date().toISOString().slice(0, 10);
    const diaDoEnvio = dados.agoraSP ? dados.agoraSP(new Date(enviarEm)).data : hojeIso;
    const jaHoje = diaDoEnvio === hojeIso ? await (dados.cargaDeHoje?.() ?? Promise.resolve(0)).catch(() => 0) : 0;
    const dist = carteiroPuro.distribuirPorDia(linhas, {
      limitePorDia: cfg.limite_por_dia || 300, jaHoje, inicioIso: enviarEm, hoje: diaDoEnvio,
      horaEnvio: cfg.hora_envio || '09:30', enviaDomingo: !!cfg.envia_domingo, feriado: dados.feriado || (() => null),
    });
    if (simular) {
      return { simulado: true, total: dist.linhas.length, pulados: pulados.total, puladosDetalhe: pulados, dias: dist.dias, porDia: dist.porDia, limitePorDia: cfg.limite_por_dia || 300, tipo,
        rodape: r7.aplicarRodape('x', tipo, cfg).aplicou, marketing_fim: cfg.marketing_fim ?? 18,
        linhas: dist.linhas.slice(0, 8).map((l) => ({ nome: l.nome, telefone: l.telefone, corpo: r7.aplicarRodape(l.corpo, tipo, cfg).corpo, enviar_em: l.enviar_em })) };
    }
    const enfileirados = dist.linhas.length ? await dados.enfileirarVarios(dist.linhas) : 0;
    // rodada 7: o MODELO fica guardado (com {primeiro_nome}…), nunca o texto já preenchido do primeiro cliente: é o que o "Repetir" usa
    await Promise.resolve(dados.guardarLote?.({ lote, modelo: corpo, detalhe, segmento, origem, evitar_dias: evitarDias, total: destinos.length, enfileirados, pulados: pulados.total,
      criado_por_id: criador?.id, criado_por_nome: criador?.nome, repete_lote: repeteLote, variante, ab_grupo: abGrupo })).catch(() => null);
    return { enfileirados, pulados: pulados.total, puladosDetalhe: pulados, lote, dias: dist.dias, porDia: dist.porDia, limitePorDia: cfg.limite_por_dia || 300 };
  }

  /** Um link da Área do Cliente por cliente (de 5 em 5; quem não tem cadastro fica sem). */
  async function linksDaArea(destinos) {
    const ids = [...new Set(destinos.map((d) => d.cliente_id ?? d.id ?? null).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x || ''))))].slice(0, LIMITE_AREA);
    const mapa = new Map();
    for (let i = 0; i < ids.length; i += 5) {
      const parte = ids.slice(i, i + 5);
      const feitos = await Promise.all(parte.map((id) => dados.gerarLinkArea(id).catch(() => null)));
      parte.forEach((id, k) => { if (feitos[k]) mapa.set(id, feitos[k]); });
    }
    return mapa;
  }

  const pedidosRecentes = new Map(); // assinatura do pedido → instante (anti duplo clique)
  const segmentoValido = (f) => (dados.SEGMENTOS || []).some((s) => s.id === f);

  function validarPedidoCampanha(body) {
    if (body.destinos != null && (!Array.isArray(body.destinos) || body.destinos.length > 2000)) {
      return ['destinos', 'Informe uma lista de até 2.000 destinatários.'];
    }
    if (body.destinos?.some((destino) => !destino || typeof destino !== 'object' || Array.isArray(destino))) {
      return ['destinos', 'Revise os destinatários selecionados.'];
    }
    if (body.segmento != null && (typeof body.segmento !== 'object' || Array.isArray(body.segmento)
        || typeof body.segmento.filtro !== 'string' || !segmentoValido(body.segmento.filtro))) {
      return ['segmento', 'Escolha um segmento válido.'];
    }
    if (body.detalhe != null && (typeof body.detalhe !== 'string' || body.detalhe.length > 200)) {
      return ['detalhe', 'Descreva a campanha em até 200 caracteres.'];
    }
    if (body.evitar_dias != null && (!Number.isInteger(body.evitar_dias) || body.evitar_dias < 0 || body.evitar_dias > 90)) {
      return ['evitar_dias', 'Informe um intervalo inteiro de 0 a 90 dias.'];
    }
    if (body.confirmar_links_externos !== undefined && typeof body.confirmar_links_externos !== 'boolean') {
      return ['confirmar_links_externos', 'Confirme se os links externos podem ser enviados.'];
    }
    return null;
  }

  async function resolverDestinos(body) {
    let destinos = Array.isArray(body.destinos) ? body.destinos.slice(0, 2000) : [];
    destinos = destinos.filter((d) => d && typeof d === 'object');
    if (!destinos.length && body.segmento?.filtro) {
      if (!segmentoValido(body.segmento.filtro)) return null;
      const l = await dados.segmentar(String(body.segmento.filtro), body.segmento.valor);
      destinos = l || [];
    }
    return destinos;
  }

  /** Atendente só mexe no que ele mesmo mandou; gestor em tudo. */
  async function podeMexerNoEnvio(usuario, id) {
    if (A.ehGestor(usuario)) return true;
    const e = await dados.obterEnvio(id);
    return !!e && e.criado_por_id === usuario.id;
  }

  /* Cache curto no servidor (por processo): telas que várias pessoas abrem ao
     mesmo tempo não repetem as mesmas leituras pesadas. */
  const cache = new Map();
  const CACHE_MAX = 200;
  async function emCache(chave, ms, fn) {
    const c = cache.get(chave);
    if (c && relogio() - c.em < ms) return c.valor;
    const valor = await fn();
    cache.set(chave, { valor, em: relogio(), ms });
    /* rodada 6: as chaves de resultados vêm da URL (datas, tipo): sem limite, alguém girando as datas encheria a memória do servidor */
    if (cache.size > CACHE_MAX) {
      const agora = relogio();
      for (const [k, v] of cache) if (agora - v.em >= (v.ms ?? 0)) cache.delete(k);
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    return valor;
  }
  deps.tamanhoDoCache = () => cache.size;
  const esquecerCache = (...chaves) => { for (const k of chaves) cache.delete(k); };
  deps.esquecerCache = esquecerCache;

  // ---- handlers (chave = "MÉTODO padrão" de acesso.ROTAS) ------------------------
  const H = {};
  const rota = (metodo, padrao, fn) => { H[`${metodo} ${padrao}`] = fn; };
  const U = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  const idDe = (pathname) => (pathname.match(new RegExp(U)) || [])[0];

  rota('GET', '/api/config', ({ res, req }) => ok(res, {
    supabaseUrl: supabase.url, supabaseAnonKey: supabase.anon, configurado: !!supabase.configurado,
    app: 'IndyCar Comunicar', versao,
    // rodada 5 (Central): o prefixo em que o app está montado ('' sozinho, '/comunicar' na Central)
    prefixo: String(req?.prefixo ?? deps.prefixo ?? ''),
  }));
  rota('GET', '/api/ping', ({ res }) => ok(res, { ok: true, versao }));
  /* Carteiro externo (pg_cron/GitHub). Rodada 4: diz de onde veio (?origem=) e
     responde em até 25 s — se a rodada for longa, devolve 202 e ela segue
     sozinha (antes o pg_cron estourava 90 s esperando). */
  rota('POST', '/api/rodar', async ({ req, res, url }) => {
    const t = req.headers['x-runner-token'] || url.searchParams.get('t') || '';
    if (!runnerToken || t !== runnerToken) return send(res, 403, { erro: 'Token do carteiro inválido.' });
    const pedida = String(url.searchParams.get('origem') || req.headers['x-origem'] || 'cron').toLowerCase();
    const origem = ['cron', 'reforco', 'github'].includes(pedida) ? pedida : 'cron';
    const r = await carteiroPuro.esperarAte(Promise.resolve(carteiro.rodar(origem)), deps.esperaRodarMs ?? 25_000, null);
    esquecerCache('resumo', 'fila', 'carteiro', 'pronto');
    return r ? ok(res, r) : send(res, 202, { ok: true, emAndamento: true, origem, aviso: 'A rodada continua no servidor.' });
  });

  // ---- conta: perfil, sino, tarefas ----
  rota('GET', '/api/perfil', ({ res, usuario }) => ok(res, {
    id: usuario.id, nome: usuario.nome || '', email: usuario.email, papel: usuario.papel,
    cargo: usuario.cargo || '', telefone: usuario.telefone || '', avatar_cor: usuario.avatar_cor || null,
    apps: usuario.apps || [], precisa_trocar_senha: !!usuario.precisa_trocar_senha,
    notificacoes: usuario.preferencias?.notificacoes || {},
    pode: Object.fromEntries(Object.keys(A.PERMISSOES).map((p) => [p, A.pode(usuario, p)])),
  }));
  rota('PUT', '/api/perfil', async ({ res, usuario, body }) => {
    const { campos, erro } = A.camposDoMeuPerfil(body);
    if (erro) return bad(res, erro);
    const p = await dados.atualizarMeuPerfil(usuario.id, campos);
    deps.esquecerSessao?.(usuario.id);
    return ok(res, { ok: true, nome: p?.nome, cargo: p?.cargo, telefone: p?.telefone, avatar_cor: p?.avatar_cor, notificacoes: p?.preferencias?.notificacoes || {} });
  });
  rota('POST', '/api/perfil/senha-trocada', async ({ res, usuario }) => {
    await dados.senhaTrocada(usuario.id);
    deps.esquecerSessao?.(usuario.id);
    auditar(usuario, 'senha_trocada', 'perfis', usuario.id, null);
    return ok(res, { ok: true });
  });
  rota('GET', '/api/notificacoes', async ({ res, usuario, url }) =>
    ok(res, await dados.minhasNotificacoes(usuario.id, Number(url.searchParams.get('limite')) || 30)));
  rota('POST', '/api/notificacoes/lidas', async ({ res, usuario }) => ok(res, { ok: true, marcadas: await dados.marcarTodasLidas(usuario.id) }));
  rota('POST', `/api/notificacoes/${U}/lida`, async ({ res, usuario, url }) => {
    const r = await dados.marcarNotificacaoLida(usuario.id, idDe(url.pathname));
    return r ? ok(res, r) : naoAchou(res);
  });
  rota('GET', '/api/tarefas', async ({ res, usuario }) => ok(res, await dados.minhasTarefas(usuario.id)));
  rota('POST', '/api/tarefas', async ({ res, usuario, body }) => {
    const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
    if (titulo.length < 2) return bad(res, 'Escreva o que precisa ser feito.');
    if (titulo.length > 200) return bad(res, 'Título longo demais (até 200 letras).');
    if (body.descricao != null && typeof body.descricao !== 'string') return bad(res, 'A descrição precisa ser texto.');
    if (body.descricao?.length > 2000) return bad(res, 'Descrição longa demais (até 2.000 caracteres).');
    if (body.prioridade != null && ![1, 2, 3, '1', '2', '3'].includes(body.prioridade)) return bad(res, 'Escolha uma prioridade de 1 a 3.');
    let vence = null;
    if (body.vence_em != null && body.vence_em !== '') {
      if (typeof body.vence_em !== 'string') return bad(res, 'Prazo inválido.');
      const d = new Date(body.vence_em);
      if (Number.isNaN(d.getTime())) return bad(res, 'Prazo inválido.');
      vence = d.toISOString();
    }
    for (const k of ['cliente_id', 'conversa_id', 'lead_id', 'agendamento_id', 'responsavel_id'])
      if (body[k] != null && body[k] !== '' && !dados.ehUuid(body[k])) return bad(res, 'Identificador inválido.');
    const t = await dados.criarTarefa({
      titulo, descricao: body.descricao, prioridade: body.prioridade, vence_em: vence, origem: 'comunicar',
      responsavel_id: body.responsavel_id || usuario.id, criado_por: usuario.id,
      cliente_id: body.cliente_id, conversa_id: body.conversa_id, lead_id: body.lead_id, agendamento_id: body.agendamento_id,
    });
    return t ? ok(res, t) : bad(res, 'Não consegui criar a tarefa.');
  });
  rota('POST', `/api/tarefas/${U}/concluir`, async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    const t = await dados.obterTarefa(id);
    if (!t) return naoAchou(res);
    if (!A.ehGestor(usuario) && t.responsavel_id !== usuario.id && t.criado_por !== usuario.id)
      return send(res, 403, { erro: 'Essa tarefa é de outra pessoa.', codigo: 'sem_permissao' });
    const r = await dados.concluirTarefa(id, usuario.id);
    return r ? ok(res, r) : bad(res, 'Essa tarefa já foi concluída.');
  });

  // ---- painel ----
  rota('GET', '/api/resumo', async ({ res }) => ok(res, await emCache('resumo', 15_000, () => dados.resumo())));
  rota('GET', '/api/saude', async ({ res }) => {
    const s = await dados.saude();
    const ur = carteiro.ultimaRodada?.();
    return ok(res, { ...s, versao, ultimaRodada: ur?.em ? ur : s.ultimaRodada });
  });
  rota('GET', '/api/whatsapp/status', async ({ res }) => ok(res, await whatsapp.status()));

  /* Rodada 5: "Saúde do WhatsApp" — estado, motivo em português e o botão para o lugar certo. */
  async function saudeDoWhatsapp(forcar = false) {
    const desde = new Date(relogio() - 24 * 3600000).toISOString();
    const [status, falhas, fila, cart, cfg, duvida] = await Promise.all([
      Promise.resolve(forcar ? whatsapp.status?.(true) : whatsapp.status?.()).catch(() => ({ ok: false, classe: 'instabilidade', erro: 'sem resposta' })),
      Promise.resolve(dados.falhasPorClasse?.(desde)).catch(() => ({})),
      Promise.resolve(dados.resumoDaFila?.()).catch(() => ({})),
      resumoDoCarteiro().catch(() => ({})),
      dados.obterConfig().catch(() => ({})),
      Promise.resolve(dados.contarSemConfirmacao?.()).catch(() => 0),
    ]);
    const s = montarSaude({ status, falhas24h: falhas || {}, fila: fila || {}, carteiro: { ultimaEm: cart.ultimaEm, falhas24h: cart.falhas24h }, estadoGravado: cfg.whatsapp || null, agora: relogio(), semConfirmacao: Number(duvida) || 0 });
    // rodada 6: o WhatsApp acabou de voltar? a fila sai devagar de propósito — a tela diz quanto ainda cabe
    const ret = cfg.whatsapp?.em && cfg.retomada_gradual !== false && cfg.whatsapp?.estado === 'ok'
      ? conexoes.limiteDeRetomada({ ligada: true, estado: cfg.whatsapp.estado, estadoEm: cfg.whatsapp.em, anterior: cfg.whatsapp.anterior, agora: relogio(), enviadasDesde: Number(await Promise.resolve(dados.enviadasDesde?.(cfg.whatsapp.em)).catch(() => 0)) || 0 })
      : null;
    return { ...s, retomada: ret ? { motivo: ret.motivo, maximo: ret.maximo, restam: ret.limite } : null, semConfirmacao: Number(duvida) || 0, cadencia: { porMinuto: cfg.limite_por_minuto, porHora: cfg.limite_por_hora, porDia: cfg.limite_por_dia, mesmoCliente: cfg.intervalo_mesmo_cliente_min, janela: { inicio: cfg.janela_inicio, fim: cfg.janela_fim }, soHorarioComercial: !!cfg.so_horario_comercial }, conferidoEm: new Date(relogio()).toISOString() };
  }
  rota('GET', '/api/whatsapp/saude', async ({ res }) => ok(res, await emCache('wa-saude', 20_000, () => saudeDoWhatsapp(false))));
  rota('POST', '/api/whatsapp/reconferir', async ({ res, usuario }) => {
    await Promise.resolve(whatsapp.reconferir?.()).catch(() => null);
    esquecerCache('wa-saude', 'pronto', 'resumo');
    const s = await saudeDoWhatsapp(true);
    cache.set('wa-saude', { valor: s, em: relogio() });
    auditar(usuario, 'whatsapp_reconferido', 'posvenda_config', 'whatsapp', { estado: s.estado });
    return ok(res, s);
  });

  // ---- clientes ----
  rota('GET', '/api/clientes', async ({ res, url }) => ok(res, await dados.listarClientes(String(url.searchParams.get('q') || '').slice(0, 80) || undefined)));
  rota('PUT', `/api/clientes/${U}`, async ({ res, usuario, body, url }) => {
    const id = idDe(url.pathname);
    const mudaAceite = body.aceita_mensagens !== undefined;
    if (mudaAceite && typeof body.aceita_mensagens !== 'boolean') return bad(res, 'Informe se o cliente aceita mensagens.');
    if (body.aceita_mensagens === true && !A.pode(usuario, 'optout_religar')) return proibido(res, 'optout_religar');
    const { nascimento, telefone, email, observacoes, motivo } = body;
    if (nascimento != null && (typeof nascimento !== 'string' || (nascimento.trim() && !dados.dataBanco(nascimento)))) {
      return bad(res, 'Informe uma data de aniversário válida.', { campo: 'nascimento' });
    }
    if (telefone != null && (typeof telefone !== 'string' ||
        (telefone.trim() && (!/^\+?[\d ().-]+$/.test(telefone.trim()) || ![10, 11].includes(dados.telefoneNacional(telefone)?.length))))) {
      return bad(res, 'Informe um telefone com DDD.', { campo: 'telefone' });
    }
    if (email != null && (typeof email !== 'string' ||
        (email !== '' && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))) {
      return bad(res, 'Informe um e-mail válido.', { campo: 'email' });
    }
    if (observacoes != null && (typeof observacoes !== 'string' || observacoes.length > 2000)) {
      return bad(res, 'Informe observações em até 2.000 caracteres.', { campo: 'observacoes' });
    }
    if (motivo != null && (typeof motivo !== 'string' || motivo.length > 120)) {
      return bad(res, 'Informe o motivo em até 120 caracteres.', { campo: 'motivo' });
    }
    const antes = mudaAceite ? await dados.obterCliente(id) : null;
    const c = await dados.atualizarCliente(id, body, usuario.nome || usuario.email);
    if (!c) return naoAchou(res);
    if (mudaAceite && antes && antes.aceita_mensagens !== c.aceita_mensagens) {
      auditar(usuario, c.aceita_mensagens ? 'cliente_optin' : 'cliente_optout', 'clientes', id,
        { aceita_mensagens: c.aceita_mensagens, motivo: body.motivo ? String(body.motivo).slice(0, 120) : null });
    }
    return ok(res, c);
  });
  rota('GET', `/api/clientes/${U}/ficha`, async ({ res, url }) => {
    const f = await dados.fichaCliente(idDe(url.pathname));
    return f ? ok(res, f) : naoAchou(res);
  });
  rota('POST', '/api/clientes/importar', async ({ res, usuario, body }) => {
    const linhas = Array.isArray(body.linhas) ? body.linhas : [];
    if (!linhas.length) return bad(res, 'Nenhuma linha para importar.');
    if (linhas.length > 2000) return bad(res, 'Importe até 2.000 linhas por vez.', { campo: 'linhas' });
    if (linhas.some((linha) => !linha || typeof linha !== 'object' || Array.isArray(linha))) {
      return bad(res, 'Confira o formato das linhas antes de importar.', { campo: 'linhas' });
    }
    const r = await dados.importarClientes(linhas);
    auditar(usuario, 'clientes_importados', 'clientes', null, { linhas: linhas.length, criados: r?.criados, atualizados: r?.atualizados, ignorados: r?.ignorados });
    return ok(res, r);
  });

  // ---- segmentos ----
  rota('GET', '/api/segmentos', ({ res }) => ok(res, dados.SEGMENTOS));
  rota('GET', '/api/segmentos/previa', async ({ res, url }) => {
    const filtro = url.searchParams.get('filtro') || 'todos';
    if (!segmentoValido(filtro)) return bad(res, 'Segmento desconhecido.');
    // rodada 5: quantos recebem E quantos ficam de fora, com o motivo
    if (dados.segmentarComMotivos) {
      const r = await dados.segmentarComMotivos(filtro, url.searchParams.get('valor'));
      return ok(res, { total: r.total, bruto: r.bruto, pulados: r.pulados, recentes: r.recentes, intervalo_dias: r.intervalo_dias, amostra: r.lista.slice(0, 12).map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, carro: c.carro, placa: c.placa })) });
    }
    const lista = await dados.segmentar(filtro, url.searchParams.get('valor'));
    return ok(res, { total: lista.length, amostra: lista.slice(0, 12).map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, carro: c.carro })) });
  });

  // ---- rodada 5: segmentos salvos ----
  rota('GET', '/api/segmentos/salvos', async ({ res }) => ok(res, await dados.listarSegmentosSalvos()));
  rota('POST', '/api/segmentos/salvos', async ({ res, usuario, body }) => {
    if (typeof body.filtro !== 'string' || !segmentoValido(body.filtro)) {
      return bad(res, 'Segmento desconhecido.', { campo: 'filtro' });
    }
    const segmento = dados.SEGMENTOS?.find((item) => item.id === body.filtro);
    const valor = body.valor;
    if (segmento?.unidade === 'texto' && valor != null &&
        (typeof valor !== 'string' || valor.trim().length > 60)) {
      return bad(res, 'Informe um termo de até 60 caracteres.', { campo: 'valor' });
    }
    if (['dias', 'meses'].includes(segmento?.unidade) && valor != null && valor !== '' &&
        ((typeof valor !== 'string' && typeof valor !== 'number') || !Number.isInteger(Number(valor)) || Number(valor) < 1)) {
      return bad(res, 'Informe um período inteiro maior que zero.', { campo: 'valor' });
    }
    const nome = typeof body.nome === 'string' ? body.nome.trim().replace(/\s+/g, ' ') : '';
    if (nome.length < 2 || nome.length > 60) return bad(res, 'Dê um nome ao segmento (2 a 60 caracteres).');
    try {
      const s = await dados.salvarSegmento({ nome, filtro: body.filtro, valor, criado_por: usuario.id, criado_por_nome: usuario.nome || usuario.email });
      auditar(usuario, 'segmento_salvo', 'comunicar_segmentos', s?.id, { nome: s?.nome, filtro: s?.filtro, valor: s?.valor });
      esquecerCache('seg-salvos');
      return ok(res, s);
    } catch (e) { return bad(res, e.message); }
  });
  rota('DELETE', `/api/segmentos/salvos/${U}`, async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    const s = await dados.obterSegmentoSalvo(id);
    if (!s) return naoAchou(res);
    if (s.criado_por !== usuario.id && !A.pode(usuario, 'segmentos_apagar')) return proibido(res, 'segmentos_apagar');
    const okk = await dados.apagarSegmentoSalvo(id);
    if (okk) auditar(usuario, 'segmento_apagado', 'comunicar_segmentos', id, { nome: s.nome });
    return ok(res, { ok: okk });
  });

  // ---- rodada 5: ficha 360 pelo telefone e ligações de um envio ----
  rota('GET', '/api/clientes/360', async ({ res, url }) => {
    const bruto = String(url.searchParams.get('tel') || '').replace(/\D/g, '');
    const tel = dados.telefoneNacional?.(bruto) || bruto; // com ou sem 55: a coluna normalizada não tem o DDI
    if (!tel || ![10, 11].includes(tel.length)) return bad(res, 'Informe o telefone com DDD.', { campo: 'tel' });
    const c360 = await dados.cliente360(tel).catch((e) => { const err = new Error('Não consegui ler a ficha 360 agora.'); err.causa = e; throw err; });
    return ok(res, { telefone: tel, ligacoes: dados.montarLigacoes(c360), cliente: c360?.cliente || null, resumo: c360?.resumo || null });
  });
  rota('GET', `/api/envios/${U}/ligacoes`, async ({ res, url }) => {
    const r = await dados.ligacoesDoEnvio(idDe(url.pathname));
    return r ? ok(res, r) : naoAchou(res);
  });

  /* Rodada 5: prévia REAL de um texto de régua para um cliente de verdade (nome/carro/placa e,
     se o texto pedir, {link_os} da última ordem do Pátio e {link_area} de exemplo). Nada é gravado. */
  rota('GET', '/api/previa/mensagem', async ({ res, url }) => {
    const id = url.searchParams.get('cliente_id');
    const regua = url.searchParams.get('regua') || 'campanha';
    const corpo = url.searchParams.get('corpo') || '';
    if (corpo.length > 2000) return bad(res, 'Mensagem longa demais (máximo 2.000 caracteres).', { campo: 'corpo' });
    if (!dados.ehUuid(id)) return bad(res, 'Escolha o cliente.');
    const c = await dados.obterCliente(id);
    if (!c) return naoAchou(res);
    const cfg = await dados.obterConfig();
    const ags = await dados.agendamentosDoCliente?.(id, 1).catch(() => []) ?? [];
    const a = ags[0] || null;
    const links = await dados.linksDaRegua(corpo, { cliente_id: id, agendamento_id: a?.id || null }, { simular: true }).catch(() => ({}));
    const vars = { nome: c.nome, carro: c.carro, placa: c.placa, servico: a?.servico || 'o serviço', meses: cfg.meses_retorno,
      quando: a ? dados.quandoRelativo(a.data, a.hora) : 'amanhã às 09:00', link_avaliacao: cfg.link_avaliacao || 'https://g.page/r/indycar', detalhe: '…', ...links };
    const falta = dados.faltaLink(corpo, links);
    return ok(res, { cliente: { id: c.id, nome: c.nome, telefone: c.telefone, carro: c.carro, placa: c.placa }, agendamento: a, texto: dados.renderTemplate(corpo, vars), vars, falta, regua });
  });

  // ---- rodada 6: prévia EXATA da campanha (as mesmas linhas que seriam enfileiradas, sem gravar nada) ----
  rota('POST', '/api/campanhas/previa', async ({ res, usuario, body }) => {
    if (body.corpo != null && typeof body.corpo !== 'string') return bad(res, 'Escreva a mensagem em texto.', { campo: 'corpo' });
    const corpo = (body.corpo ?? '').trim();
    if (!corpo) return bad(res, 'Escreva a mensagem.');
    if (corpo.length > 2000) return bad(res, 'Mensagem longa demais (máximo 2.000 caracteres).');
    if (body.enviar_em != null && typeof body.enviar_em !== 'string') {
      return bad(res, 'Informe a data de envio em texto.', { campo: 'enviar_em' });
    }
    const destinos = await resolverDestinos(body);
    if (destinos === null) return bad(res, 'Segmento desconhecido.');
    if (!destinos.length) return bad(res, 'Escolha pelo menos um cliente.');
    const enviarEm = body.enviar_em ? new Date(body.enviar_em) : new Date(relogio());
    if (Number.isNaN(enviarEm.getTime())) return bad(res, 'Data de envio inválida.');
    const r = await executarCampanha({ corpo, detalhe: body.detalhe ? String(body.detalhe).slice(0, 200) : '', destinos, enviarEm: enviarEm.toISOString(), criador: usuario, simular: true, evitarDias: Math.min(Math.max(Number(body.evitar_dias) || 0, 0), 90), segmento: body.segmento || null });
    return ok(res, { ...r, linksForaDaCasa: conexoes.linksForaDaCasa(corpo), caminho: auto.destinoDoPedido(usuario, destinos.length) });
  });

  // ---- rodada 6: agenda de envios, por que não saiu, simular rodada, resultados, conexões ----
  rota('GET', '/api/agenda', async ({ res }) => ok(res, await emCache('agenda', 10_000, () => dados.agendaDeEnvios())));
  rota('POST', `/api/envios/${U}/adiar`, async ({ res, usuario, body, url }) => {
    const id = idDe(url.pathname);
    if (!(await podeMexerNoEnvio(usuario, id))) return proibido(res, 'cancelar_qualquer');
    if (typeof body.enviar_em !== 'string') return bad(res, 'Escolha uma data e hora válidas.', { campo: 'enviar_em' });
    const r = await dados.adiarManual(id, body.enviar_em);
    if (!r.ok) return send(res, r.status || 400, { erro: r.erro });
    esquecerCache('agenda', 'fila', 'resumo');
    auditar(usuario, 'envio_adiado', 'posvenda_envios', id, { para: r.quando });
    return ok(res, r);
  });
  rota('POST', '/api/agenda/adiar-dia', async ({ res, usuario, body }) => {
    const dia = typeof body.dia === 'string' && conexoes.diaValido(body.dia);
    if (!dia) return bad(res, 'Informe o dia no formato AAAA-MM-DD.', { campo: 'dia' });
    if (body.tipo != null && !dados.TIPOS_ENVIO.includes(body.tipo)) {
      return bad(res, 'Escolha um tipo de mensagem válido.', { campo: 'tipo' });
    }
    if (typeof body.enviar_em !== 'string') return bad(res, 'Escolha uma data e hora válidas.', { campo: 'enviar_em' });
    const r = await dados.adiarDia(dia, body.enviar_em, body.tipo ?? null);
    if (!r.ok) return bad(res, r.erro);
    esquecerCache('agenda', 'fila', 'resumo');
    auditar(usuario, 'dia_adiado', 'posvenda_envios', null, { dia: body.dia, para: r.quando, adiadas: r.adiadas, ficaram: r.ficaram });
    return ok(res, r);
  });
  rota('GET', `/api/envios/${U}/porque`, async ({ res, url }) => {
    const r = await dados.explicarEnvio(idDe(url.pathname));
    return r ? ok(res, r) : naoAchou(res);
  });
  rota('POST', '/api/rodada/simular', async ({ res, usuario }) => {
    if (!carteiro.simular) return send(res, 503, { erro: 'A simulação não está disponível neste servidor.' });
    const r = await carteiro.simular();
    auditar(usuario, 'rodada_simulada', 'posvenda_envios', null, { sairiam: r.enviaria?.length || 0 });
    return ok(res, r);
  });
  const periodoDe = (url) => {
    const de = url.searchParams.get('de') || null, ate = url.searchParams.get('ate') || null;
    return { de, ate, invalido: !!((de && !conexoes.diaValido(de)) || (ate && !conexoes.diaValido(ate))), invertido: !!(de && ate && de > ate) };
  };
  rota('GET', '/api/resultados', async ({ res, url }) => {
    const p = periodoDe(url);
    if (p.invalido) return bad(res, 'Data inválida: use o formato AAAA-MM-DD.');
    if (p.invertido) return bad(res, 'O "de" precisa vir antes do "até".');
    const tipo = url.searchParams.get('regua') || null;
    if (tipo && tipo !== 'todas' && !dados.TIPOS_ENVIO.includes(tipo)) return bad(res, 'Régua desconhecida.');
    const detalhe = url.searchParams.get('detalhe') === '1';
    const out = await emCache(`res:${p.de}:${p.ate}:${tipo}:${detalhe ? 'd' : ''}`, 60_000, () => dados.resultados({ de: p.de, ate: p.ate, tipo, detalhe }));
    if (!detalhe) return ok(res, out);
    const { linhas = [], ...resto } = out;
    return ok(res, { ...resto, quemVoltou: linhas.filter((l) => l.voltou).slice(0, 40), quantosVoltaram: linhas.filter((l) => l.voltou).length });
  });
  rota('GET', '/api/resultados.csv', async ({ res, usuario, url }) => {
    const p = periodoDe(url);
    if (p.invalido) return bad(res, 'Data inválida: use o formato AAAA-MM-DD.');
    if (p.invertido) return bad(res, 'O "de" precisa vir antes do "até".');
    const tipo = url.searchParams.get('regua') || null;
    if (tipo && tipo !== 'todas' && !dados.TIPOS_ENVIO.includes(tipo)) return bad(res, 'Régua desconhecida.');
    const out = await dados.resultados({ de: p.de, ate: p.ate, tipo, detalhe: true });
    auditar(usuario, 'exportar_csv', 'posvenda_envios', null, { linhas: out.linhas.length, resultados: true, periodo: out.periodo });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comunicar-resultados-${dados.hoje()}.csv"`, 'Cache-Control': 'no-store', ...seguros, ...(res.__cors || {}) });
    return res.end(dados.paraCSV(out.linhas, dados.COLUNAS_CSV_RESULTADOS));
  });
  rota('GET', `/api/lotes/${U}/resultado`, async ({ res, url }) => {
    const lote = idDe(url.pathname);
    const p = periodoDe(url);
    if (p.invalido) return bad(res, 'Data inválida: use o formato AAAA-MM-DD.');
    const r = await dados.resultados({ de: p.de || '2020-01-01', ate: p.ate || null, lote });
    return ok(res, { lote, ...(r.porLote[lote] || r.total), periodo: r.periodo, regra: r.regra });
  });
  rota('GET', '/api/conexoes', async ({ res }) => ok(res, await emCache('conexoes', 30_000, () => dados.statusDasConexoes())));

  // ---- fila ----
  const filtrosEnvios = (sp, limite) => ({
    status: sp.get('status') || undefined, tipo: sp.get('tipo') || undefined, q: String(sp.get('q') || '').slice(0, 80) || undefined,
    de: sp.get('de') || undefined, ate: sp.get('ate') || undefined, intencao: sp.get('intencao') || undefined, origem: sp.get('origem') || undefined, limite, offset: Number(sp.get('offset')) || 0,
  });
  const origemRuim = (sp) => { const o = sp.get('origem'); return !!o && o !== 'todas' && !dados.ORIGENS_ENVIO.includes(o); };
  rota('GET', '/api/envios', async ({ res, url }) =>
    origemRuim(url.searchParams) ? bad(res, 'Origem desconhecida.') : ok(res, await dados.listarEnvios(filtrosEnvios(url.searchParams, Math.min(Number(url.searchParams.get('limite')) || 300, 1000)))));

  /* Avulsa (1 cliente, qualquer um da equipe), campanha (gestor: sai direto) ou
     proposta (atendente com 2+ clientes: espera o gestor aprovar). */
  rota('POST', '/api/envios', async ({ res, usuario, body }) => {
    const invalido = validarPedidoCampanha(body);
    if (invalido) return bad(res, invalido[1], { campo: invalido[0] });
    if (body.corpo != null && typeof body.corpo !== 'string') return bad(res, 'Escreva a mensagem em texto.', { campo: 'corpo' });
    const corpo = (body.corpo ?? '').trim();
    if (!corpo) return bad(res, 'Escreva a mensagem.');
    if (corpo.length > 2000) return bad(res, 'Mensagem longa demais (máximo 2.000 caracteres).');
    const enviarEm = body.enviar_em ? new Date(body.enviar_em) : new Date(relogio());
    if (Number.isNaN(enviarEm.getTime())) return bad(res, 'Data de envio inválida.');
    const destinos = await resolverDestinos(body);
    if (destinos === null) return bad(res, 'Segmento desconhecido.');
    if (!destinos.length) return bad(res, 'Escolha pelo menos um cliente.');
    const detalhe = body.detalhe ? String(body.detalhe).slice(0, 200) : '';
    /* rodada 6: link de fora da casa em mensagem para clientes é risco de golpe/spam — só o gestor, e confirmando. */
    const foraDaCasa = conexoes.linksForaDaCasa(corpo);
    if (foraDaCasa.length) {
      if (!A.ehGestor(usuario)) return send(res, 403, { erro: `O texto tem link de fora da IndyCar (${foraDaCasa[0]}). Peça ao gestor para enviar.`, codigo: 'link_externo', links: foraDaCasa });
      if (body.confirmar_links_externos !== true) return send(res, 409, { erro: `O texto tem link de fora da IndyCar (${foraDaCasa[0]}). Confirme para enviar mesmo assim.`, codigo: 'link_externo', links: foraDaCasa });
      auditar(usuario, 'link_externo_confirmado', 'posvenda_envios', null, { links: foraDaCasa });
    }
    const evitarDias = Math.min(Math.max(Number(body.evitar_dias) || 0, 0), 90);
    if (patio.usaLinkArea(corpo) && destinos.length > LIMITE_AREA) {
      return bad(res, `O convite da Área do Cliente gera um link por pessoa: no máximo ${LIMITE_AREA} clientes por vez.`);
    }
    const caminho = auto.destinoDoPedido(usuario, destinos.length);

    /* Duplo clique / reenvio do navegador: o MESMO pedido para 2+ clientes (mesma pessoa, texto, hora e destinos) em 30 s é recusado
       — antes cada clique enfileirava a campanha inteira de novo e os clientes recebiam em dobro. */
    const assinatura = [usuario.id, corpo, body.enviar_em || '', destinos.length, (destinos.map((d) => String(d.telefone ?? '').replace(/\D/g, '')).sort().join(',')), body.segmento ? JSON.stringify(body.segmento) : ''].join('|');
    const agora0 = relogio();
    for (const [k, t] of pedidosRecentes) if (agora0 - t > 30_000) pedidosRecentes.delete(k);
    if (destinos.length > 1 && pedidosRecentes.has(assinatura)) return send(res, 409, { erro: 'Esse mesmo pedido acabou de ser enviado. Confira na fila antes de repetir.', codigo: 'pedido_repetido' });
    if (destinos.length > 1) pedidosRecentes.set(assinatura, agora0);

    if (caminho === 'proposta') {
      const segmento = !Array.isArray(body.destinos) || !body.destinos.length ? { filtro: String(body.segmento.filtro), valor: body.segmento.valor ?? null } : null;
      const camp = await dados.criarPropostaCampanha({
        corpo, detalhe, segmento,
        destinos: segmento ? null : destinos.map((d) => ({ cliente_id: d.cliente_id ?? d.id ?? null, telefone: d.telefone, nome: d.nome ?? null, carro: d.carro ?? null, placa: d.placa ?? null })),
        total_previsto: destinos.length, enviar_em: body.enviar_em ? enviarEm.toISOString() : null,
        criado_por: usuario.id, criado_por_nome: usuario.nome || usuario.email,
      });
      const avisados = await auto.avisarPropostaDeCampanha({ campanha: camp, loja: dados }).catch(() => 0);
      auditar(usuario, 'campanha_proposta', 'comunicar_campanhas', camp?.id, { total: destinos.length, segmento });
      return ok(res, { ok: true, aguardando: true, campanha: camp, avisados, enfileirados: 0, pulados: 0 });
    }

    if (caminho === 'avulsa') {
      if (!A.ehGestor(usuario) && !limAvulsa.tentar(`avulsa:${usuario.id}`).ok)
        return send(res, 429, { erro: 'Muitas mensagens avulsas nesta hora. Para muita gente, monte uma campanha.' });
      const d = destinos[0];
      // rodada 7: fixo/DDD inexistente não vira mensagem; o mesmo texto para o mesmo número em minutos é duplo clique
      const cfgA = (await Promise.resolve(dados.obterConfig?.()).catch(() => null)) || {};
      if (cfgA.validar_celular !== false) { const vc = r7.validarCelular(d.telefone); if (!vc.ok) return ok(res, { ok: true, enfileirados: 0, pulados: 1, motivo: vc.motivo || 'esse número não parece um celular com WhatsApp' }); }
      if (await Promise.resolve(dados.envioIgualRecente?.(d.telefone, corpo, cfgA.dedupe_avulsa_min ?? 10)).catch(() => null)) return send(res, 409, { erro: 'Essa mesma mensagem já foi para esse número há poucos minutos. Confira na fila antes de repetir.', codigo: 'mensagem_repetida' });
      const porteiro = await dados.carregarPorteiro({ intervalo_minimo_dias: 0 });
      const v = porteiro.podeReceber({ cliente_id: d.cliente_id ?? d.id ?? null, telefone: d.telefone, tipo: 'avulsa' });
      if (!v.ok) return ok(res, { ok: true, enfileirados: 0, pulados: 1, motivo: v.motivo || 'cliente fora da lista' });
      const area = patio.usaLinkArea(corpo);
      const linkArea = area ? await dados.gerarLinkArea(d.cliente_id ?? d.id ?? null).catch(() => null) : '';
      if (area && !linkArea) return ok(res, { ok: true, enfileirados: 0, pulados: 1, motivo: 'sem cadastro de cliente: não dá para gerar o link da Área do Cliente' });
      const criado = await dados.enfileirar({
        cliente_id: d.cliente_id ?? d.id ?? null, telefone: d.telefone, nome: d.nome ?? null, tipo: area ? 'area_cliente' : 'avulsa',
        corpo: dados.renderTemplate(corpo, { nome: d.nome, carro: d.carro, placa: d.placa, detalhe, link_area: linkArea }),
        enviar_em: enviarEm.toISOString(), criado_por: usuario.nome || usuario.email, criado_por_id: usuario.id,
      });
      auditar(usuario, 'mensagem_avulsa', 'posvenda_envios', criado?.id, { cliente_id: d.cliente_id ?? d.id ?? null });
      return ok(res, { ok: true, enfileirados: criado ? 1 : 0, pulados: 0, envio: criado });
    }

    esquecerCache('resumo', 'fila');
    const segmentoGuardado = body.segmento?.filtro && segmentoValido(String(body.segmento.filtro)) ? { filtro: String(body.segmento.filtro), valor: body.segmento.valor ?? null } : null;
    const repeteLote = dados.ehUuid(body.repete_lote) ? body.repete_lote : null;
    const corpoB = typeof body.corpo_b === 'string' ? body.corpo_b.trim() : '';
    let r;
    if (corpoB) {
      /* rodada 7: teste A/B. Metade recebe cada texto (a divisão é estável por telefone) e os resultados comparam os dois */
      if (corpoB.length > 2000) return bad(res, 'O texto B é longo demais (máximo 2.000 caracteres).');
      if (destinos.length < 40) return bad(res, 'Para comparar dois textos precisa de pelo menos 40 clientes (20 em cada). Para menos gente, mande um texto só.');
      const { A: ladoA, B: ladoB } = r7.dividirAB(destinos);
      const ab = randomUUID();
      const ra = await executarCampanha({ corpo, detalhe, destinos: ladoA, enviarEm: enviarEm.toISOString(), criador: usuario, evitarDias, segmento: segmentoGuardado, repeteLote, variante: 'A', abGrupo: ab });
      const rb = await executarCampanha({ corpo: corpoB, detalhe, destinos: ladoB, enviarEm: enviarEm.toISOString(), criador: usuario, evitarDias, segmento: segmentoGuardado, repeteLote, variante: 'B', abGrupo: ab });
      r = { enfileirados: ra.enfileirados + rb.enfileirados, pulados: ra.pulados + rb.pulados, lote: ra.lote, loteB: rb.lote, ab, dias: Math.max(ra.dias, rb.dias), porDia: ra.porDia, limitePorDia: ra.limitePorDia, puladosDetalhe: ra.puladosDetalhe, ladoA: ra.enfileirados, ladoB: rb.enfileirados };
    } else {
      r = await executarCampanha({ corpo, detalhe, destinos, enviarEm: enviarEm.toISOString(), criador: usuario, evitarDias, segmento: segmentoGuardado, repeteLote, origem: repeteLote ? 'repeticao' : 'comunicar' });
    }
    if (dados.ehUuid(body.segmento_salvo_id)) dados.marcarSegmentoUsado?.(body.segmento_salvo_id).catch(() => null);
    auditar(usuario, 'campanha_enviada', 'posvenda_envios', r.lote, { total: destinos.length, enfileirados: r.enfileirados, pulados: r.pulados, dias: r.dias, segmento: body.segmento || null });
    return ok(res, { ok: true, ...r });
  });

  /* Rodada 5: "mandar para o MEU celular" — o texto da campanha chega no telefone do perfil
     de quem está escrevendo (qualquer um da equipe), fora da fila. */
  rota('POST', '/api/envios/teste-meu', async ({ res, usuario, body }) => {
    if (typeof body.corpo !== 'string' || !body.corpo.trim() || body.corpo.trim().length > 2000) {
      return bad(res, 'Escreva uma mensagem de até 2.000 caracteres antes de testar.', { campo: 'corpo' });
    }
    const telefone = dados.soDigitos(usuario.telefone || '');
    if (telefone.length < 10) return bad(res, 'Cadastre seu celular em "Meu perfil" para receber o teste.', { codigo: 'sem_telefone' });
    const texto = body.corpo.trim();
    const corpo = dados.renderTemplate(texto, { ...EXEMPLO_PREVIA, nome: usuario.nome || EXEMPLO_PREVIA.nome, link_area: `${patio.PATIO_URL}/minha/?c=exemplo`, link_os: `${patio.PATIO_URL}/acompanhar/?t=exemplo` });
    const r = await whatsapp.enviar(telefone, `[teste] ${corpo}`);
    await dados.enfileirar({
      telefone, nome: `Teste (${usuario.nome || 'equipe'})`, tipo: 'avulsa', corpo, criado_por: usuario.nome || usuario.email,
      criado_por_id: usuario.id, status: r.ok ? 'enviado' : 'falhou',
    }).then((e) => e && (r.ok ? dados.marcarEnvio(e.id, 'enviado', null, 1)
      : dados.marcarEnvio(e.id, 'falhou', r.erro || null, 1, r.classe === 'sem_confirmacao' ? { erro_classe: 'sem_confirmacao' } : {}))).catch(() => {});
    auditar(usuario, 'envio_teste_proprio', 'posvenda_envios', null, { telefone: mascararTel(telefone), ok: !!r.ok, classe: r.classe || null });
    return r.ok ? ok(res, { ok: true, telefone: mascararTel(telefone) }) : send(res, 502, { erro: r.erro, classe: r.classe || null, fazer: r.fazer || null });
  });

  const mexerNoEnvio = (fn, erro, acao) => async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    if (!(await podeMexerNoEnvio(usuario, id))) return proibido(res, 'cancelar_qualquer');
    const r = await fn(id);
    if (!r) return bad(res, erro);
    if (acao) auditar(usuario, acao, 'posvenda_envios', id, null);
    return ok(res, r);
  };
  /* Cancelar a campanha NO MEIO: o que ainda não saiu do lote é cancelado de uma vez (só gestor). */
  rota('POST', `/api/lotes/${U}/cancelar`, async ({ res, usuario, url }) => {
    const lote = idDe(url.pathname);
    const cancelados = await dados.cancelarLote(lote);
    esquecerCache('resumo', 'fila');
    auditar(usuario, 'campanha_lote_cancelado', 'posvenda_envios', lote, { cancelados });
    return ok(res, { ok: true, cancelados });
  });
  rota('POST', `/api/envios/${U}/cancelar`, mexerNoEnvio((id) => dados.cancelarEnvio(id), 'Só dá para cancelar mensagem que ainda não saiu.', 'envio_cancelado'));
  rota('POST', `/api/envios/${U}/reenviar`, mexerNoEnvio((id) => dados.reenfileirar(id), 'Só dá para reenviar mensagem que falhou, foi cancelada ou pulada.', 'envio_reenviado'));
  /* 16/10: "Chegou" — a equipe conferiu no WhatsApp que a mensagem sem confirmação saiu. */
  rota('POST', `/api/envios/${U}/chegou`, async (ctx) => {
    const r = await mexerNoEnvio((id) => dados.confirmarChegou(id), 'Só dá para marcar "Chegou" em mensagem sem confirmação.', 'envio_chegou_confirmado')(ctx);
    esquecerCache('wa-saude', 'resumo');
    return r;
  });
  rota('POST', `/api/envios/${U}/desfazer-cancelamento`, mexerNoEnvio((id) => dados.desfazerCancelamento(id), 'Essa mensagem não está cancelada.', null));
  rota('POST', `/api/envios/${U}/encaminhar`, async ({ res, usuario, url }) => {
    const r = await dados.encaminharEnvio(idDe(url.pathname), usuario);
    if (!r) return naoAchou(res);
    return r.ok ? ok(res, r) : bad(res, r.erro);
  });

  /* Teste real: manda AGORA para o telefone de teste, fora da fila e da janela. */
  rota('POST', '/api/envios/teste', async ({ res, usuario, body }) => {
    if (body.telefone != null && typeof body.telefone !== 'string') return bad(res, 'Informe o telefone em texto.', { campo: 'telefone' });
    if (body.corpo != null && typeof body.corpo !== 'string') return bad(res, 'Escreva a mensagem em texto.', { campo: 'corpo' });
    if (body.corpo?.length > 2000) return bad(res, 'Escreva uma mensagem de até 2.000 caracteres.', { campo: 'corpo' });
    const cfg = await dados.obterConfig();
    const telefone = dados.soDigitos(body.telefone || cfg.telefone_teste);
    if (telefone.length < 10) return bad(res, 'Informe um telefone de teste (em Réguas › Envio).');
    const corpo = dados.renderTemplate(body.corpo || 'Teste do IndyCar Comunicar: se você recebeu isto, o WhatsApp está saindo. 🏁',
      { nome: usuario.nome || 'Equipe', carro: 'seu carro' });
    const r = await whatsapp.enviar(telefone, corpo);
    await dados.enfileirar({
      telefone, nome: `Teste (${usuario.nome || 'gestor'})`, tipo: 'avulsa', corpo, criado_por: usuario.nome || usuario.email,
      criado_por_id: usuario.id, status: r.ok ? 'enviado' : 'falhou',
    }).then((e) => e && (r.ok ? dados.marcarEnvio(e.id, 'enviado', null, 1)
      : dados.marcarEnvio(e.id, 'falhou', r.erro || null, 1, r.classe === 'sem_confirmacao' ? { erro_classe: 'sem_confirmacao' } : {}))).catch(() => {});
    auditar(usuario, 'envio_teste', 'posvenda_envios', null, { telefone: mascararTel(telefone), ok: !!r.ok });
    return r.ok ? ok(res, { ok: true }) : send(res, 502, { erro: r.erro });
  });

  rota('GET', '/api/envios.csv', async ({ res, usuario, url }) => {
    if (origemRuim(url.searchParams)) return bad(res, 'Origem desconhecida.');
    const filtros = filtrosEnvios(url.searchParams, 5000);
    const lista = await dados.listarEnvios(filtros);
    auditar(usuario, 'exportar_csv', 'posvenda_envios', null, { linhas: lista.length, filtros: { ...filtros, limite: undefined } });
    const nome = `comunicar-mensagens-${dados.hoje()}.csv`;
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store', ...seguros, ...(res.__cors || {}) });
    return res.end(dados.paraCSV(lista, dados.COLUNAS_CSV_ENVIOS));
  });

  // ---- campanhas com aprovação ----
  rota('GET', '/api/campanhas/aprovacao', async ({ res, usuario, url }) => {
    const gestor = A.ehGestor(usuario);
    const status = url.searchParams.get('status') || 'todas';
    const lista = await dados.listarCampanhas({ status, criadoPor: gestor ? null : usuario.id, limite: 40 });
    return ok(res, { lista, aguardando: lista.filter((c) => c.status === 'aguardando').length, gestor });
  });
  rota('POST', `/api/campanhas/${U}/aprovar`, async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    const c = await dados.obterCampanha(id);
    if (!c) return naoAchou(res);
    if (c.status !== 'aguardando') return send(res, 409, { erro: 'Essa campanha já foi decidida.' });
    const destinos = c.segmento?.filtro ? (segmentoValido(c.segmento.filtro) ? await dados.segmentar(c.segmento.filtro, c.segmento.valor) : []) : (c.destinos || []);
    const marcada = await dados.decidirCampanha(id, { status: 'aprovada', decidido_por: usuario.id, decidido_por_nome: usuario.nome || usuario.email, decidido_em: new Date(relogio()).toISOString() });
    if (!marcada) return send(res, 409, { erro: 'Outra pessoa decidiu essa campanha agora há pouco.' });
    const quando = c.enviar_em && new Date(c.enviar_em).getTime() > relogio() ? c.enviar_em : new Date(relogio()).toISOString();
    const r = await executarCampanha({ corpo: c.corpo, detalhe: c.detalhe, destinos: destinos || [], enviarEm: quando,
      criador: { id: c.criado_por, nome: c.criado_por_nome }, campanhaId: id, segmento: c.segmento || null });
    const final = await dados.completarCampanha(id, { lote: r.lote, enfileirados: r.enfileirados, pulados: r.pulados }) || { ...marcada, ...r };
    await auto.avisarDecisaoDeCampanha({ campanha: final, loja: dados }).catch(() => null);
    auditar(usuario, 'campanha_aprovada', 'comunicar_campanhas', id, { enfileirados: r.enfileirados, pulados: r.pulados, criado_por: c.criado_por });
    return ok(res, { ok: true, campanha: final, ...r });
  });
  rota('POST', `/api/campanhas/${U}/recusar`, async ({ res, usuario, url, body }) => {
    const id = idDe(url.pathname);
    if (body.motivo != null && typeof body.motivo !== 'string') return bad(res, 'Escreva o motivo em texto.', { campo: 'motivo' });
    const motivo = body.motivo?.trim().slice(0, 200) || null;
    const c = await dados.decidirCampanha(id, { status: 'recusada', decidido_por: usuario.id, decidido_por_nome: usuario.nome || usuario.email, decidido_em: new Date(relogio()).toISOString(), motivo_recusa: motivo });
    if (!c) return (await dados.obterCampanha(id)) ? send(res, 409, { erro: 'Essa campanha já foi decidida.' }) : naoAchou(res);
    await auto.avisarDecisaoDeCampanha({ campanha: c, loja: dados }).catch(() => null);
    auditar(usuario, 'campanha_recusada', 'comunicar_campanhas', id, { motivo, criado_por: c.criado_por });
    return ok(res, { ok: true, campanha: c });
  });
  rota('POST', `/api/campanhas/${U}/cancelar`, async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    const c0 = await dados.obterCampanha(id);
    if (!c0) return naoAchou(res);
    if (!A.ehGestor(usuario) && c0.criado_por !== usuario.id) return send(res, 403, { erro: 'Só quem propôs (ou um gestor) cancela essa campanha.', codigo: 'sem_permissao' });
    const c = await dados.decidirCampanha(id, { status: 'cancelada', decidido_por: usuario.id, decidido_por_nome: usuario.nome || usuario.email, decidido_em: new Date(relogio()).toISOString() });
    if (!c) return send(res, 409, { erro: 'Essa campanha já foi decidida.' });
    auditar(usuario, 'campanha_cancelada', 'comunicar_campanhas', id, null);
    return ok(res, { ok: true, campanha: c });
  });

  // ---- carteiro e prévia ----
  rota('POST', '/api/rodar-agora', async ({ res, usuario }) => {
    const r = await carteiro.rodar('manual');
    esquecerCache('resumo', 'fila', 'carteiro', 'pronto');
    auditar(usuario, 'carteiro_manual', 'posvenda_envios', null, { enviados: r?.enviados ?? 0, falhas: r?.falhas ?? 0 });
    return ok(res, r);
  });
  rota('GET', '/api/previa', async ({ res, url }) => {
    const so = url.searchParams.get('regua') || null;
    if (so && !dados.REGUAS.includes(so) && !r7.R7_REGUAS.some((x) => x.id === so)) return bad(res, 'Régua desconhecida.');
    return ok(res, await dados.gerarTudo({ simular: true, so }));
  });

  // ---- configuração (o caminho antigo /api/posvenda/config continua) ----
  const lerConfig = async ({ res }) => ok(res, await dados.obterConfig());
  const salvarConfig = async ({ res, usuario, body }) => {
    const alternadores = [
      'pausa_geral', 'envia_domingo', 'so_horario_comercial',
      ...dados.REGUAS.map((regua) => `ativo_${regua}`),
      ...(dados.BOOLEANOS_R6 || []), ...r7.BOOLEANOS_R7,
    ];
    for (const campo of alternadores) {
      if (body[campo] !== undefined && typeof body[campo] !== 'boolean') {
        return bad(res, 'Informe se a opção está ligada ou desligada.', { campo });
      }
    }
    for (const regua of dados.REGUAS) {
      const campo = `msg_${regua}`;
      const texto = body[campo];
      if (texto !== undefined && (typeof texto !== 'string' || !texto.trim() || texto.trim().length > 1000)) {
        return bad(res, 'Escreva uma mensagem de até 1.000 caracteres.', { campo });
      }
    }
    for (const campo of ['janela_inicio', 'janela_fim']) {
      if (body[campo] !== undefined && !Number.isInteger(body[campo])) {
        return bad(res, 'Informe a hora da janela como número inteiro.', { campo });
      }
    }
    if (body.hora_envio !== undefined &&
        (typeof body.hora_envio !== 'string' || !/^(?:[01]?\d|2[0-3]):[0-5]\d(?::00)?$/.test(body.hora_envio))) {
      return bad(res, 'Informe o horário no formato HH:MM.', { campo: 'hora_envio' });
    }
    const link = body.link_avaliacao;
    if (link != null && (typeof link !== 'string' ||
        (link.trim() && (link.trim().length > 500 || !/^https?:\/\/\S+$/i.test(link.trim()) || !URL.canParse(link.trim()))))) {
      return bad(res, 'Informe um link de avaliação válido.', { campo: 'link_avaliacao' });
    }
    /* rodada 6: texto novo com erro NÃO é ignorado em silêncio (antes dizia "salvo" e mantinha o antigo) */
    for (const k of Object.keys(dados.TEXTOS_R6 || {})) {
      if (body?.[k] === undefined) continue;
      const erro = dados.validarTextoR6(k, body[k]);
      if (erro) return bad(res, erro, { campo: k });
    }
    for (const k of Object.keys(r7.TEXTOS_R7)) {   // rodada 7: textos das réguas dos eventos reais
      if (body?.[k] === undefined) continue;
      const erro = r7.validarTextoR7(k, body[k]);
      if (erro) return bad(res, erro, { campo: k });
    }
    if (body.texto_rodape_parar !== undefined) {
      const rodape = typeof body.texto_rodape_parar === 'string' ? body.texto_rodape_parar.replace(/\s+/g, ' ').trim() : '';
      if (rodape.length < 10 || rodape.length > 140 || !/\bparar\b/i.test(rodape)) {
        return bad(res, 'Use de 10 a 140 caracteres no rodapé e inclua a palavra PARAR.', { campo: 'texto_rodape_parar' });
      }
    }
    const antes = await dados.obterConfig();
    const depois = await dados.salvarConfig(body);
    esquecerCache('resumo', 'pronto', 'projecao', 'carteiro');
    for (const r of [...dados.REGUAS, ...r7.R7_REGUAS.map((x) => x.id)]) {
      const k = `ativo_${r}`;
      if (antes[k] !== depois[k]) auditar(usuario, depois[k] ? 'regua_ligada' : 'regua_desligada', 'posvenda_config', r, { regua: r });
    }
    if (antes.pausa_geral !== depois.pausa_geral) auditar(usuario, depois.pausa_geral ? 'pausa_geral_ligada' : 'pausa_geral_desligada', 'posvenda_config', 'pausa_geral', null);
    const mudou = Object.keys(depois).filter((k) => !/^ativo_|^pausa_geral$|^updated_at$|^ia_resumo/.test(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
    if (mudou.length) auditar(usuario, 'reguas_alteradas', 'posvenda_config', null, { campos: mudou });
    return ok(res, depois);
  };
  rota('GET', '/api/comunicar/config', lerConfig);
  rota('GET', '/api/posvenda/config', lerConfig);
  rota('PUT', '/api/comunicar/config', salvarConfig);
  rota('PUT', '/api/posvenda/config', salvarConfig);

  // ---- regras de retorno ----
  function validarRegraRetorno(body) {
    const { rotulo, palavras, meses, mensagem, ativo, ordem } = body;
    if (rotulo !== undefined && (typeof rotulo !== 'string' || !rotulo.trim() || rotulo.trim().length > 80)) {
      return ['rotulo', 'Informe um nome de até 80 caracteres.'];
    }
    if (palavras !== undefined) {
      const termos = typeof palavras === 'string' ? palavras.split(/[,;\n]/) : palavras;
      if (!Array.isArray(termos) || termos.some((termo) => typeof termo !== 'string')) {
        return ['palavras', 'Informe as palavras do serviço em texto.'];
      }
      const preenchidos = termos.filter((termo) => termo.trim());
      if (!preenchidos.length || preenchidos.length > 30) return ['palavras', 'Informe de 1 a 30 palavras do serviço.'];
    }
    if (meses !== undefined && (!Number.isInteger(meses) || meses < 1 || meses > 36)) {
      return ['meses', 'Informe um prazo inteiro de 1 a 36 meses.'];
    }
    if (mensagem != null && (typeof mensagem !== 'string' || mensagem.trim().length > 1000)) {
      return ['mensagem', 'Escreva uma mensagem de até 1.000 caracteres.'];
    }
    if (ativo !== undefined && typeof ativo !== 'boolean') return ['ativo', 'Informe se a regra está ativa.'];
    if (ordem !== undefined && (!Number.isInteger(ordem) || ordem < -2147483648 || ordem > 2147483647)) {
      return ['ordem', 'Informe a ordem como número inteiro válido.'];
    }
    return null;
  }

  rota('GET', '/api/regras-retorno', async ({ res }) => ok(res, await dados.listarRegras()));
  rota('POST', '/api/regras-retorno', async ({ res, usuario, body }) => {
    const invalido = validarRegraRetorno(body);
    if (invalido) return bad(res, invalido[1], { campo: invalido[0] });
    try {
      const r = await dados.criarRegra(body);
      auditar(usuario, 'regra_retorno_criada', 'comunicar_regras_retorno', r?.id, { rotulo: r?.rotulo, meses: r?.meses });
      return ok(res, r);
    } catch (e) { return bad(res, e.message); }
  });
  rota('PUT', `/api/regras-retorno/${U}`, async ({ res, usuario, body, url }) => {
    const invalido = validarRegraRetorno(body);
    if (invalido) return bad(res, invalido[1], { campo: invalido[0] });
    const id = idDe(url.pathname);
    const r = await dados.atualizarRegra(id, body);
    if (!r) return naoAchou(res);
    auditar(usuario, 'regra_retorno_alterada', 'comunicar_regras_retorno', id, { campos: Object.keys(body || {}) });
    return ok(res, r);
  });
  rota('DELETE', `/api/regras-retorno/${U}`, async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    const okk = await dados.removerRegra(id);
    if (okk) auditar(usuario, 'regra_retorno_apagada', 'comunicar_regras_retorno', id, null);
    return ok(res, { ok: okk });
  });

  // ---- relatórios ----
  rota('GET', '/api/relatorio', async ({ res, url }) => {
    const regua = url.searchParams.get('regua');
    if (regua && regua !== 'todas' && !dados.TIPOS_ENVIO.includes(regua)) return bad(res, 'Régua desconhecida.');
    const { de, ate, invalido, invertido } = periodoDe(url);
    if (invalido) return bad(res, 'Informe as datas no formato AAAA-MM-DD.');
    if (invertido) return bad(res, 'O "de" precisa vir antes do "até".');
    return ok(res, await dados.relatorioRegua(regua || null, Math.min(Math.max(Number(url.searchParams.get('semanas')) || 8, 2), 26), { de, ate }));
  });
  /* Rodada 5: uma linha por régua no período — enviadas, responderam, agendaram depois, pediram para parar. */
  rota('GET', '/api/relatorio/reguas', async ({ res, url }) => {
    const { de, ate, invalido, invertido } = periodoDe(url);
    if (invalido) return bad(res, 'Informe as datas no formato AAAA-MM-DD.');
    if (invertido) return bad(res, 'O "de" precisa vir antes do "até".');
    return ok(res, await emCache(`rel-reguas:${de}:${ate}`, 60_000, () => dados.relatorioPorRegua({ de, ate })));
  });
  rota('GET', '/api/intencoes', async ({ res, url }) => ok(res, await dados.intencoesRecentes(Math.min(Math.max(Number(url.searchParams.get('dias')) || 7, 1), 60))));
  rota('GET', '/api/aniversarios', async ({ res }) => ok(res, await dados.aniversariosDaBase()));

  // ---- IA ----
  const chamadaIA = deps.chamadaIA || (async (res) => send(res, 503, { erro: 'A IA não está disponível neste servidor.' }));
  rota('GET', '/api/ia/status', async ({ res }) => {
    const [cfg, chave, hojeN] = await Promise.all([dados.iaConfig(), dados.chaveIA(), dados.chamadasIAHoje()]);
    return ok(res, { ativo: cfg.ativo, temChave: !!chave, autonomia: cfg.autonomia, chamadasHoje: hojeN, limite: cfg.limite });
  });
  rota('POST', '/api/ia/escrever', async ({ res, usuario, body }) => {
    if (body.pedido != null && (typeof body.pedido !== 'string' || body.pedido.length > 500)) {
      return bad(res, 'Escreva o pedido em texto com até 500 caracteres.', { campo: 'pedido' });
    }
    const regua = body.regua ?? 'campanha';
    if (typeof regua !== 'string') {
      return bad(res, 'Régua desconhecida.', { campo: 'regua' });
    }
    if (body.texto != null && (typeof body.texto !== 'string' || body.texto.length > 1500)) {
      return bad(res, 'Informe o texto atual com até 1.500 caracteres.', { campo: 'texto' });
    }
    if (body.exemplo != null && (typeof body.exemplo !== 'object' || Array.isArray(body.exemplo)
        || ['nome', 'carro', 'placa'].some((campo) => body.exemplo[campo] != null && typeof body.exemplo[campo] !== 'string'))) {
      return bad(res, 'Informe nome, carro e placa do exemplo em texto.', { campo: 'exemplo' });
    }
    const pedido = body.pedido ?? '', texto = body.texto ?? '';
    if (!Object.hasOwn(ia?.VARIAVEIS_POR_REGUA ?? {}, regua)) return bad(res, 'Régua desconhecida.', { campo: 'regua' });
    return chamadaIA(res, usuario, 'escrever_mensagem', (r) => `${r.variacoes.length} variações para ${dados.ROTULO_TIPO[regua] || regua}`, async (ctx) => {
      const r = await ia.escreverMensagem({ regua, pedido, textoAtual: texto, quantidade: 3 }, ctx);
      const ex = body.exemplo ?? {};
      const exemplo = {
        ...EXEMPLO_PREVIA,
        nome: String(ex.nome || EXEMPLO_PREVIA.nome).slice(0, 80), carro: String(ex.carro || EXEMPLO_PREVIA.carro).slice(0, 60),
        placa: String(ex.placa || EXEMPLO_PREVIA.placa).slice(0, 10),
        link_avaliacao: (await dados.obterConfig()).link_avaliacao || 'https://g.page/r/indycar',
      };
      const variacoes = r.variacoes.map((v) => ({ ...v, previa: dados.renderTemplate(v.texto, exemplo) }));
      return { variacoes, modelo: r.modelo, uso: r.uso, __log: { regua, pedido: pedido || null, variacoes: variacoes.map((v) => ({ texto: v.texto, ok: v.ok, problemas: v.problemas })) } };
    });
  });
  rota('POST', '/api/ia/publico', async ({ res, usuario }) =>
    chamadaIA(res, usuario, 'sugerir_publico', (r) => `Sugeriu ${r.rotulo}${r.valor ? ` (${r.valor})` : ''}`, async (ctx) => {
      const numeros = await dados.numerosDaSemana();
      const r = await ia.sugerirPublico({ numeros, segmentos: dados.SEGMENTOS }, ctx);
      const lista = segmentoValido(r.segmento) ? await dados.segmentar(r.segmento, r.valor).catch(() => []) : [];
      return { ...r, previa: { total: (lista || []).length, amostra: (lista || []).slice(0, 8).map((c) => ({ id: c.id, nome: c.nome, carro: c.carro })) }, __log: { segmento: r.segmento, valor: r.valor, motivo: r.motivo, mensagem: r.mensagem } };
    }));
  const idadeResumoH = (cfg) => (cfg.ia_resumo_em ? (relogio() - new Date(cfg.ia_resumo_em).getTime()) / 36e5 : null);
  rota('GET', '/api/ia/resumo', async ({ res }) => {
    const cfg = await dados.obterConfig();
    const h = idadeResumoH(cfg);
    return ok(res, { texto: cfg.ia_resumo, em: cfg.ia_resumo_em, valido: h !== null && h < 6 });
  });
  rota('POST', '/api/ia/resumo', async ({ res, usuario, body }) => {
    if (body.forcar !== undefined && typeof body.forcar !== 'boolean') return bad(res, 'Confirme se deseja atualizar o resumo.', { campo: 'forcar' });
    const cfg = await dados.obterConfig();
    const h = idadeResumoH(cfg);
    if (!body.forcar && cfg.ia_resumo && h !== null && h < 6) return ok(res, { texto: cfg.ia_resumo, em: cfg.ia_resumo_em, valido: true, cache: true });
    return chamadaIA(res, usuario, 'resumo_semana', 'Resumo da semana do Comunicar', async (ctx) => {
      const numeros = await dados.numerosDaSemana();
      const r = await ia.resumirSemana({ numeros }, ctx);
      if (!r.texto) throw new Error('a IA voltou sem texto');
      const salvo = await dados.salvarResumoIA(r.texto).catch(() => null);
      return { texto: r.texto, em: salvo?.ia_resumo_em || new Date(relogio()).toISOString(), valido: true, cache: false, modelo: r.modelo, uso: r.uso, __log: { texto: r.texto } };
    });
  });
  rota('POST', '/api/ia/ler-respostas', async ({ res }) => {
    const r = await carteiro.lerRespostas();
    return r?.erro ? send(res, 503, r) : ok(res, r);
  });

  // ---- modelos e satisfação ----
  rota('GET', '/api/modelos', async ({ res }) => ok(res, await dados.listarModelos()));
  rota('GET', '/api/satisfacao', async ({ res }) => ok(res, await dados.listarRespostas()));
  rota('POST', '/api/satisfacao', async ({ res, usuario, body }) => {
    if (!dados.ehUuid(body.cliente_id)) return bad(res, 'Escolha o cliente.');
    if (body.satisfeito !== true && body.satisfeito !== false) return bad(res, 'Diga se o cliente ficou satisfeito ou não.');
    if (body.nota != null && (
      !['number', 'string'].includes(typeof body.nota) || !/^[1-5]$/.test(String(body.nota))
    )) return bad(res, 'Use uma nota de 1 a 5.');
    if (body.comentario != null && (typeof body.comentario !== 'string' || body.comentario.length > 1000))
      return bad(res, 'Use até 1.000 caracteres no comentário.');
    if (body.envio_id != null && !dados.ehUuid(body.envio_id)) return bad(res, 'Envio inválido.');
    if (body.agendamento_id != null && !dados.ehUuid(body.agendamento_id)) return bad(res, 'Agendamento inválido.');
    return ok(res, await dados.registrarResposta({ ...body, registrado_por: usuario.nome || usuario.email }));
  });
  rota('DELETE', `/api/satisfacao/${U}`, async ({ res, usuario, url }) => {
    const id = idDe(url.pathname);
    await dados.removerResposta(id);
    auditar(usuario, 'satisfacao_apagada', 'posvenda_respostas', id, null);
    return ok(res, { ok: true });
  });

  // ---- RODADA 4: carteiro, prontidão, prévia do mês, aniversários, equipe ----

  async function resumoDoCarteiro() {
    const [batidas, chamadas, cfg] = await Promise.all([
      dados.batidasRecentes?.(24).catch(() => []) ?? [],
      dados.chamadasRecentes?.(24).catch(() => []) ?? [],
      dados.obterConfig(),
    ]);
    const r = carteiroPuro.resumirCarteiro({ batidas, chamadas, agora: relogio(), janela: { inicio: cfg.janela_inicio, fim: cfg.janela_fim } });
    // a última rodada gravada na config vale mesmo sem batida (servidor antigo)
    if (!r.ultimaEm && cfg.ultima_rodada_em) r.ultimaEm = cfg.ultima_rodada_em;
    return { ...r, configurado: !!cfg.carteiro_configurado, janela: { inicio: cfg.janela_inicio, fim: cfg.janela_fim } };
  }

  rota('GET', '/api/carteiro', async ({ res }) => ok(res, await emCache('carteiro', 20_000, resumoDoCarteiro)));
  rota('GET', '/api/fila/contagem', async ({ res }) => ok(res, { pendentes: await emCache('fila', 10_000, () => dados.contarPendentes()) }));

  rota('GET', '/api/pronto', async ({ res, usuario }) => {
    const fatos = await emCache('pronto', 30_000, async () => {
      const [cfg, wa, carteiroR, comData, total, iaCfg, chave, testeOk, patioCfg, patioFila, con] = await Promise.all([
        dados.obterConfig(),
        Promise.resolve(whatsapp.status?.()).catch(() => ({ ok: false })),
        resumoDoCarteiro().catch(() => ({})),
        dados.contarComNascimento().catch(() => 0),
        dados.contarClientesComTelefone().catch(() => 0),
        dados.iaConfig().catch(() => ({})),
        dados.chaveIA().catch(() => null),
        dados.ultimoTesteOk().catch(() => null),
        dados.patioConfig?.().catch(() => null) ?? null,
        dados.filaDoPatio?.().catch(() => ({})) ?? {},
        dados.statusDasConexoes?.().catch(() => null) ?? null,
      ]);
      const retomada = conexoes.limiteDeRetomada({ ligada: cfg.retomada_gradual !== false, estado: cfg.whatsapp?.estado, estadoEm: cfg.whatsapp?.em, anterior: cfg.whatsapp?.anterior, agora: relogio(), enviadasDesde: cfg.whatsapp?.em ? (Number(await Promise.resolve(dados.enviadasDesde?.(cfg.whatsapp.em)).catch(() => 0)) || 0) : 0 });
      return { cfg, whatsapp: wa || {}, carteiro: carteiroR, aniversarios: { comData, total }, ia: { ativo: iaCfg.ativo, temChave: !!chave }, teste: { ultimoOkEm: testeOk },
        patio: { cfg: patioCfg, fila: patioFila },
        r6: con ? { itens: con.itens, semLink: con.semLink, retomada: retomada ? { motivo: retomada.motivo } : null } : undefined };
    });
    const r = prontidao.montarProntidao({ ...fatos, agora: relogio() });
    return ok(res, { ...r, gestor: A.ehGestor(usuario) });
  });

  rota('GET', '/api/projecao', async ({ res }) => {
    const r = await emCache('projecao', 10 * 60_000, async () => {
      const d = await dados.dadosDaProjecao();
      return projecao.projetarMes({ hoje: dados.hoje(), ...d, agora: new Date(relogio()) });
    });
    return ok(res, r);
  });

  rota('POST', '/api/aniversarios/analisar', async ({ res, body }) => {
    const texto = body.texto ?? '';
    if (typeof texto !== 'string') return bad(res, 'Informe a lista em texto.', { campo: 'texto' });
    if (!texto.trim()) return bad(res, 'Cole a lista (ou escolha o arquivo) primeiro.');
    if (texto.length > 600_000) return bad(res, 'Lista grande demais: divida em partes de até 3.000 linhas.');
    const lido = aniv.lerLista(texto);
    if (!lido.linhas.length) return bad(res, 'Não achei nenhuma linha com conteúdo.');
    const clientes = await emCache('clientes-casar', 60_000, () => dados.clientesParaCasar());
    const itens = aniv.casarComClientes(lido.linhas, clientes);
    return ok(res, { itens, resumo: aniv.resumirAnalise(itens), cabecalho: lido.cabecalho, cortado: !!lido.cortado });
  });

  rota('POST', '/api/aniversarios/gravar', async ({ res, usuario, body }) => {
    if (!Array.isArray(body.itens) || !body.itens.length || body.itens.length > 3000) {
      return bad(res, 'Escolha de 1 a 3.000 aniversários por vez.', { campo: 'itens' });
    }
    const itens = [];
    for (const item of body.itens) {
      const nascimento = typeof item?.nascimento === 'string' ? aniv.lerData(item.nascimento) : null;
      if (!dados.ehUuid(item?.cliente_id) || !nascimento) {
        return bad(res, 'Confira o cliente e a data de cada aniversário selecionado.', { campo: 'itens' });
      }
      itens.push({ cliente_id: item.cliente_id, nascimento });
    }
    if (itens.length > 1 && !A.pode(usuario, 'importar'))
      return send(res, 403, { erro: 'Gravar uma lista inteira é com o gestor. Peça a ele, ou cadastre um por vez na ficha.', codigo: 'sem_permissao' });
    const r = await dados.gravarNascimentos(itens, { substituir: body.substituir === true && A.pode(usuario, 'importar') });
    esquecerCache('pronto', 'projecao', 'clientes-casar');
    auditar(usuario, 'aniversarios_gravados', 'clientes', null, { pedidos: itens.length, gravados: r.gravados, substituir: body.substituir === true, origem: String(body.origem || 'lista').slice(0, 20) });
    return ok(res, { ok: true, ...r, ignorados: itens.length - r.gravados });
  });

  rota('GET', '/api/aniversarios/sugestoes', async ({ res }) => {
    const r = await emCache('sugestoes-aniv', 5 * 60_000, async () => {
      const textos = await dados.textosComAniversario();
      const ids = [...textos.leads.map((l) => l.cliente_id), ...textos.mensagens.map((m) => m.conversa?.cliente_id)].filter(dados.ehUuid);
      const fichas = ids.length ? await dados.buscarClientesPorIds(ids) : [];
      const mapa = new Map(fichas.map((c) => [c.id, c]));
      const sugestoes = aniv.montarSugestoes(textos, mapa);
      return { sugestoes, lidos: { fichas: textos.fichas.length, crm: textos.leads.length, conversas: textos.mensagens.length } };
    });
    return ok(res, r);
  });

  const ASSUNTOS_PEDIDO = {
    reguas: 'mudar uma régua', ligar: 'ligar o Comunicar (réguas)', importar: 'importar aniversários/planilha', teste: 'mandar um teste de WhatsApp',
    rodar: 'rodar o carteiro agora', optout: 'voltar a mandar para um cliente que saiu da lista', campanha: 'aprovar uma campanha', outro: 'uma ajuda no Comunicar',
  };
  rota('POST', '/api/pedir-gestor', async ({ res, usuario, body }) => {
    const assunto = typeof body.assunto === 'string' && Object.hasOwn(ASSUNTOS_PEDIDO, body.assunto) ? body.assunto : 'outro';
    if (body.detalhe != null && typeof body.detalhe !== 'string') {
      return bad(res, 'Escreva o detalhe do pedido em texto.', { campo: 'detalhe' });
    }
    const detalhe = body.detalhe?.trim().slice(0, 300) || null;
    const ids = (await dados.gestores().catch(() => [])).filter((id) => id !== usuario.id);
    if (!ids.length) return bad(res, 'Não achei um gestor para avisar. Fale com o administrador.');
    const dia = dados.hoje();
    let avisados = 0;
    for (const perfil of ids) {
      const r = await dados.notificar({
        perfil, tipo: 'pedido', titulo: `${usuario.nome || 'Alguém da equipe'} pede: ${ASSUNTOS_PEDIDO[assunto]}`,
        corpo: detalhe, link: assunto === 'campanha' ? '/?tela=campanhas' : '/?tela=reguas', app: 'comunicar',
        chave: `pedido:${usuario.id}:${assunto}:${dia}`,
      }).catch(() => null);
      if (r !== null) avisados++;
    }
    auditar(usuario, 'pedido_ao_gestor', 'notificacoes', null, { assunto, avisados });
    return ok(res, { ok: true, avisados });
  });

  rota('GET', '/api/equipe/indicadores', async ({ res, usuario, url }) => {
    const dias = Math.min(Math.max(Number(url.searchParams.get('dias')) || 30, 7), 90);
    const todos = await emCache(`indicadores:${dias}`, 60_000, () => dados.indicadoresEquipe(dias));
    const gestor = A.ehGestor(usuario);
    return ok(res, { dias, gestor, pessoas: gestor ? todos : todos.filter((p) => p.perfil_id === usuario.id) });
  });

  // ---- rodada 7: reabordar, repetir, fila do Pátio, anti-spam, retomada, resultados… ----
  registrarRotas7({ rota, ok, bad, send, naoAchou, proibido, idDe, U, auditar, dados, A, emCache, esquecerCache, relogio, executarCampanha, carteiro, conexoes });

  // ---- o porteiro ------------------------------------------------------------------
  async function api(req, res, url) {
    const { pathname } = url;
    const m = req.method;

    // CORS: só o ecossistema; outro site não lê nada daqui
    const origem = req.headers.origin;
    if (origem) {
      if (!A.origemPermitida(origem, origensExtras)) return send(res, 403, { erro: 'Origem não permitida.' });
      res.__cors = { 'Access-Control-Allow-Origin': origem, Vary: 'Origin', 'Access-Control-Allow-Credentials': 'false' };
      if (m === 'OPTIONS') {
        res.writeHead(204, { ...res.__cors, 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Runner-Token', 'Access-Control-Max-Age': '600', ...seguros });
        return res.end();
      }
    }

    res.__aceita = String(req.headers['accept-encoding'] || '');
    const regra = A.regraDaRota(m, pathname);
    if (!regra) return naoAchou(res);
    if (regra.metodoErrado) return send(res, 405, { erro: 'Método não permitido.' });
    const fn = H[`${regra.metodo} ${regra.padrao}`];
    if (!fn) return naoAchou(res); // rota sem handler: fecha

    const ip = A.ipDe(req);
    const li = limIp.tentar(`ip:${ip}`);
    if (!li.ok) return send(res, 429, { erro: 'Muitas requisições. Espere um pouco.' }, { 'Retry-After': String(li.esperaS) });

    let usuario = null;
    if (!regra.publica) {
      const a = await autenticar(req);
      if (!a?.usuario) return send(res, a?.status || 401, { erro: a?.erro || 'Faça login para usar o Comunicar.', codigo: a?.codigo || 'sem_login', apps: a?.apps });
      usuario = a.usuario;
      if (usuario.precisa_trocar_senha && regra.perm !== 'conta')
        return send(res, 403, { erro: 'Troque sua senha para continuar.', codigo: 'trocar_senha' });
      if (!A.pode(usuario, regra.perm)) return proibido(res, regra.perm);
      if (regra.caro) {
        const lc = limCaro.tentar(`u:${usuario.id}`);
        if (!lc.ok) return send(res, 429, { erro: `Calma: muitas ações seguidas. Tente de novo em ${lc.esperaS} s.` }, { 'Retry-After': String(lc.esperaS) });
      }
      if (marcarAcesso(usuario.id)) Promise.resolve(dados.marcarAcesso?.(usuario.id)).catch(() => {});
    }

    let body = {};
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
      body = await lerCorpo(req);
      if (body.__grande) return send(res, 413, { erro: 'Conteúdo grande demais.' });
      if (body.__invalido) return bad(res, 'O corpo da requisição não é um JSON válido.');
    }
    return fn({ req, res, url, usuario, body });
  }

  /** Chamado pelo servidor quando algo explode: nada de detalhe interno na resposta. */
  function erroInterno(res, e) {
    const ref = randomUUID().slice(0, 8);
    log.error?.(`[${ref}]`, e?.stack || e);
    if (!res.headersSent) send(res, 500, { erro: `Algo deu errado aqui dentro. Tente de novo (ref. ${ref}).` });
    else res.end();
  }

  return { api, erroInterno, handlers: H, send };
}
