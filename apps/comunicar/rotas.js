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
import { montarSaude } from './whatsapp.js';

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
  async function executarCampanha({ corpo, detalhe, destinos, enviarEm, criador, campanhaId = null }) {
    const cfg = (await Promise.resolve(dados.obterConfig?.()).catch(() => null)) || {};
    const porteiro = await dados.carregarPorteiro({ intervalo_minimo_dias: 0 });
    const lote = randomUUID();
    const linhas = [];
    const pulados = { total: 0, nao_quer: 0, sem_link: 0 };
    // Pátio (16/10): {link_area} = convite da Área do Cliente, um link NOVO por cliente
    const area = patio.usaLinkArea(corpo);
    const tipo = area ? 'area_cliente' : 'campanha';
    const links = area ? await linksDaArea(destinos) : null;
    for (const d of destinos) {
      const clienteId = d.cliente_id ?? d.id ?? null;
      const v = porteiro.podeReceber({ cliente_id: clienteId, telefone: d.telefone, tipo });
      if (!v.ok) { pulados.total++; pulados.nao_quer++; continue; }
      const linkArea = area ? links.get(clienteId) : '';
      if (area && !linkArea) { pulados.total++; pulados.sem_link++; continue; }   // sem cadastro de cliente não dá para gerar o link
      linhas.push({
        cliente_id: clienteId, telefone: d.telefone, nome: d.nome ?? null, tipo,
        corpo: dados.renderTemplate(corpo, { nome: d.nome, carro: d.carro, placa: d.placa, detalhe: detalhe || '', link_area: linkArea }),
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
    const enfileirados = dist.linhas.length ? await dados.enfileirarVarios(dist.linhas) : 0;
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

  const segmentoValido = (f) => (dados.SEGMENTOS || []).some((s) => s.id === f);

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
  async function emCache(chave, ms, fn) {
    const c = cache.get(chave);
    if (c && relogio() - c.em < ms) return c.valor;
    const valor = await fn();
    cache.set(chave, { valor, em: relogio() });
    return valor;
  }
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
    const titulo = String(body.titulo || '').trim();
    if (titulo.length < 2) return bad(res, 'Escreva o que precisa ser feito.');
    if (titulo.length > 200) return bad(res, 'Título longo demais (até 200 letras).');
    let vence = null;
    if (body.vence_em) { const d = new Date(body.vence_em); if (Number.isNaN(d.getTime())) return bad(res, 'Prazo inválido.'); vence = d.toISOString(); }
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
    const [status, falhas, fila, cart, cfg] = await Promise.all([
      Promise.resolve(forcar ? whatsapp.status?.(true) : whatsapp.status?.()).catch(() => ({ ok: false, classe: 'instabilidade', erro: 'sem resposta' })),
      Promise.resolve(dados.falhasPorClasse?.(desde)).catch(() => ({})),
      Promise.resolve(dados.resumoDaFila?.()).catch(() => ({})),
      resumoDoCarteiro().catch(() => ({})),
      dados.obterConfig().catch(() => ({})),
    ]);
    const s = montarSaude({ status, falhas24h: falhas || {}, fila: fila || {}, carteiro: { ultimaEm: cart.ultimaEm, falhas24h: cart.falhas24h }, estadoGravado: cfg.whatsapp || null, agora: relogio() });
    return { ...s, cadencia: { porMinuto: cfg.limite_por_minuto, porHora: cfg.limite_por_hora, porDia: cfg.limite_por_dia, mesmoCliente: cfg.intervalo_mesmo_cliente_min, janela: { inicio: cfg.janela_inicio, fim: cfg.janela_fim }, soHorarioComercial: !!cfg.so_horario_comercial }, conferidoEm: new Date(relogio()).toISOString() };
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
    const mudaAceite = body.aceita_mensagens === true || body.aceita_mensagens === false;
    if (body.aceita_mensagens === true && !A.pode(usuario, 'optout_religar')) return proibido(res, 'optout_religar');
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
    const linhas = Array.isArray(body.linhas) ? body.linhas.slice(0, 2000) : [];
    if (!linhas.length) return bad(res, 'Nenhuma linha para importar.');
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
    if (!segmentoValido(String(body.filtro || ''))) return bad(res, 'Segmento desconhecido.');
    try {
      const s = await dados.salvarSegmento({ nome: body.nome, filtro: String(body.filtro || ''), valor: body.valor, criado_por: usuario.id, criado_por_nome: usuario.nome || usuario.email });
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
    if (!tel || tel.length < 10) return bad(res, 'Informe o telefone com DDD.');
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
    const corpo = String(url.searchParams.get('corpo') || '').slice(0, 2000);
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

  // ---- fila ----
  const filtrosEnvios = (sp, limite) => ({
    status: sp.get('status') || undefined, tipo: sp.get('tipo') || undefined, q: String(sp.get('q') || '').slice(0, 80) || undefined,
    de: sp.get('de') || undefined, ate: sp.get('ate') || undefined, intencao: sp.get('intencao') || undefined, limite, offset: Number(sp.get('offset')) || 0,
  });
  rota('GET', '/api/envios', async ({ res, url }) =>
    ok(res, await dados.listarEnvios(filtrosEnvios(url.searchParams, Math.min(Number(url.searchParams.get('limite')) || 300, 1000)))));

  /* Avulsa (1 cliente, qualquer um da equipe), campanha (gestor: sai direto) ou
     proposta (atendente com 2+ clientes: espera o gestor aprovar). */
  rota('POST', '/api/envios', async ({ res, usuario, body }) => {
    const corpo = String(body.corpo ?? '').trim();
    if (!corpo) return bad(res, 'Escreva a mensagem.');
    if (corpo.length > 2000) return bad(res, 'Mensagem longa demais (máximo 2.000 caracteres).');
    const enviarEm = body.enviar_em ? new Date(body.enviar_em) : new Date(relogio());
    if (Number.isNaN(enviarEm.getTime())) return bad(res, 'Data de envio inválida.');
    const destinos = await resolverDestinos(body);
    if (destinos === null) return bad(res, 'Segmento desconhecido.');
    if (!destinos.length) return bad(res, 'Escolha pelo menos um cliente.');
    const detalhe = body.detalhe ? String(body.detalhe).slice(0, 200) : '';
    if (patio.usaLinkArea(corpo) && destinos.length > LIMITE_AREA) {
      return bad(res, `O convite da Área do Cliente gera um link por pessoa: no máximo ${LIMITE_AREA} clientes por vez.`);
    }
    const caminho = auto.destinoDoPedido(usuario, destinos.length);

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
    const r = await executarCampanha({ corpo, detalhe, destinos, enviarEm: enviarEm.toISOString(), criador: usuario });
    if (dados.ehUuid(body.segmento_salvo_id)) dados.marcarSegmentoUsado?.(body.segmento_salvo_id).catch(() => null);
    auditar(usuario, 'campanha_enviada', 'posvenda_envios', r.lote, { total: destinos.length, enfileirados: r.enfileirados, pulados: r.pulados, dias: r.dias, segmento: body.segmento || null });
    return ok(res, { ok: true, ...r });
  });

  /* Rodada 5: "mandar para o MEU celular" — o texto da campanha chega no telefone do perfil
     de quem está escrevendo (qualquer um da equipe), fora da fila. */
  rota('POST', '/api/envios/teste-meu', async ({ res, usuario, body }) => {
    const telefone = dados.soDigitos(usuario.telefone || '');
    if (telefone.length < 10) return bad(res, 'Cadastre seu celular em "Meu perfil" para receber o teste.', { codigo: 'sem_telefone' });
    const texto = String(body.corpo || '').trim().slice(0, 2000);
    if (!texto) return bad(res, 'Escreva a mensagem antes de testar.');
    const corpo = dados.renderTemplate(texto, { ...EXEMPLO_PREVIA, nome: usuario.nome || EXEMPLO_PREVIA.nome, link_area: `${patio.PATIO_URL}/minha/?c=exemplo`, link_os: `${patio.PATIO_URL}/acompanhar/?t=exemplo` });
    const r = await whatsapp.enviar(telefone, `[teste] ${corpo}`);
    await dados.enfileirar({
      telefone, nome: `Teste (${usuario.nome || 'equipe'})`, tipo: 'avulsa', corpo, criado_por: usuario.nome || usuario.email,
      criado_por_id: usuario.id, status: r.ok ? 'enviado' : 'falhou',
    }).then((e) => e && r.ok && dados.marcarEnvio(e.id, 'enviado', null, 1)).catch(() => {});
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
  rota('POST', `/api/envios/${U}/cancelar`, mexerNoEnvio((id) => dados.cancelarEnvio(id), 'Só dá para cancelar mensagem que ainda não saiu.', 'envio_cancelado'));
  rota('POST', `/api/envios/${U}/reenviar`, mexerNoEnvio((id) => dados.reenfileirar(id), 'Só dá para reenviar mensagem que falhou, foi cancelada ou pulada.', 'envio_reenviado'));
  rota('POST', `/api/envios/${U}/desfazer-cancelamento`, mexerNoEnvio((id) => dados.desfazerCancelamento(id), 'Essa mensagem não está cancelada.', null));
  rota('POST', `/api/envios/${U}/encaminhar`, async ({ res, usuario, url }) => {
    const r = await dados.encaminharEnvio(idDe(url.pathname), usuario);
    if (!r) return naoAchou(res);
    return r.ok ? ok(res, r) : bad(res, r.erro);
  });

  /* Teste real: manda AGORA para o telefone de teste, fora da fila e da janela. */
  rota('POST', '/api/envios/teste', async ({ res, usuario, body }) => {
    const cfg = await dados.obterConfig();
    const telefone = dados.soDigitos(body.telefone || cfg.telefone_teste);
    if (telefone.length < 10) return bad(res, 'Informe um telefone de teste (em Réguas › Envio).');
    const corpo = dados.renderTemplate(String(body.corpo || 'Teste do IndyCar Comunicar: se você recebeu isto, o WhatsApp está saindo. 🏁').slice(0, 2000),
      { nome: usuario.nome || 'Equipe', carro: 'seu carro' });
    const r = await whatsapp.enviar(telefone, corpo);
    await dados.enfileirar({
      telefone, nome: `Teste (${usuario.nome || 'gestor'})`, tipo: 'avulsa', corpo, criado_por: usuario.nome || usuario.email,
      criado_por_id: usuario.id, status: r.ok ? 'enviado' : 'falhou',
    }).then((e) => e && r.ok && dados.marcarEnvio(e.id, 'enviado', null, 1)).catch(() => {});
    auditar(usuario, 'envio_teste', 'posvenda_envios', null, { telefone: mascararTel(telefone), ok: !!r.ok });
    return r.ok ? ok(res, { ok: true }) : send(res, 502, { erro: r.erro });
  });

  rota('GET', '/api/envios.csv', async ({ res, usuario, url }) => {
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
      criador: { id: c.criado_por, nome: c.criado_por_nome }, campanhaId: id });
    const final = await dados.completarCampanha(id, { lote: r.lote, enfileirados: r.enfileirados, pulados: r.pulados }) || { ...marcada, ...r };
    await auto.avisarDecisaoDeCampanha({ campanha: final, loja: dados }).catch(() => null);
    auditar(usuario, 'campanha_aprovada', 'comunicar_campanhas', id, { enfileirados: r.enfileirados, pulados: r.pulados, criado_por: c.criado_por });
    return ok(res, { ok: true, campanha: final, ...r });
  });
  rota('POST', `/api/campanhas/${U}/recusar`, async ({ res, usuario, url, body }) => {
    const id = idDe(url.pathname);
    const motivo = String(body.motivo || '').trim().slice(0, 200) || null;
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
    if (so && !dados.REGUAS.includes(so)) return bad(res, 'Régua desconhecida.');
    return ok(res, await dados.gerarTudo({ simular: true, so }));
  });

  // ---- configuração (o caminho antigo /api/posvenda/config continua) ----
  const lerConfig = async ({ res }) => ok(res, await dados.obterConfig());
  const salvarConfig = async ({ res, usuario, body }) => {
    const antes = await dados.obterConfig();
    const depois = await dados.salvarConfig(body);
    esquecerCache('resumo', 'pronto', 'projecao', 'carteiro');
    for (const r of dados.REGUAS) {
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
  rota('GET', '/api/regras-retorno', async ({ res }) => ok(res, await dados.listarRegras()));
  rota('POST', '/api/regras-retorno', async ({ res, usuario, body }) => {
    try {
      const r = await dados.criarRegra(body);
      auditar(usuario, 'regra_retorno_criada', 'comunicar_regras_retorno', r?.id, { rotulo: r?.rotulo, meses: r?.meses });
      return ok(res, r);
    } catch (e) { return bad(res, e.message); }
  });
  rota('PUT', `/api/regras-retorno/${U}`, async ({ res, usuario, body, url }) => {
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
    const de = url.searchParams.get('de') || null, ate = url.searchParams.get('ate') || null;
    if (de && ate && de > ate) return bad(res, 'O "de" precisa vir antes do "até".');
    return ok(res, await dados.relatorioRegua(regua || null, Math.min(Math.max(Number(url.searchParams.get('semanas')) || 8, 2), 26), { de, ate }));
  });
  /* Rodada 5: uma linha por régua no período — enviadas, responderam, agendaram depois, pediram para parar. */
  rota('GET', '/api/relatorio/reguas', async ({ res, url }) => {
    const de = url.searchParams.get('de') || null, ate = url.searchParams.get('ate') || null;
    if (de && ate && de > ate) return bad(res, 'O "de" precisa vir antes do "até".');
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
    const regua = String(body.regua || 'campanha');
    if (!ia?.VARIAVEIS_POR_REGUA?.[regua]) return bad(res, 'Régua desconhecida.');
    const pedido = String(body.pedido || '').slice(0, 500), texto = String(body.texto || '').slice(0, 1500);
    return chamadaIA(res, usuario, 'escrever_mensagem', (r) => `${r.variacoes.length} variações para ${dados.ROTULO_TIPO[regua] || regua}`, async (ctx) => {
      const r = await ia.escreverMensagem({ regua, pedido, textoAtual: texto, quantidade: 3 }, ctx);
      const ex = body.exemplo && typeof body.exemplo === 'object' ? body.exemplo : {};
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
      const [cfg, wa, carteiroR, comData, total, iaCfg, chave, testeOk, patioCfg, patioFila] = await Promise.all([
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
      ]);
      return { cfg, whatsapp: wa || {}, carteiro: carteiroR, aniversarios: { comData, total }, ia: { ativo: iaCfg.ativo, temChave: !!chave }, teste: { ultimoOkEm: testeOk },
        patio: { cfg: patioCfg, fila: patioFila } };
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
    const texto = String(body.texto ?? '');
    if (!texto.trim()) return bad(res, 'Cole a lista (ou escolha o arquivo) primeiro.');
    if (texto.length > 600_000) return bad(res, 'Lista grande demais: divida em partes de até 3.000 linhas.');
    const lido = aniv.lerLista(texto);
    if (!lido.linhas.length) return bad(res, 'Não achei nenhuma linha com conteúdo.');
    const clientes = await emCache('clientes-casar', 60_000, () => dados.clientesParaCasar());
    const itens = aniv.casarComClientes(lido.linhas, clientes);
    return ok(res, { itens, resumo: aniv.resumirAnalise(itens), cabecalho: lido.cabecalho, cortado: !!lido.cortado });
  });

  rota('POST', '/api/aniversarios/gravar', async ({ res, usuario, body }) => {
    const brutos = Array.isArray(body.itens) ? body.itens.slice(0, 3000) : [];
    const itens = brutos.filter((i) => i && dados.ehUuid(i.cliente_id) && aniv.lerData(i.nascimento))
      .map((i) => ({ cliente_id: i.cliente_id, nascimento: aniv.lerData(i.nascimento) }));
    if (!itens.length) return bad(res, 'Nada para gravar: escolha pelo menos um cliente com data válida.');
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
    const assunto = ASSUNTOS_PEDIDO[body.assunto] ? body.assunto : 'outro';
    const detalhe = String(body.detalhe || '').trim().slice(0, 300) || null;
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
