/* ============================================================
   Gestor IA (rodada 8, frente T5b): o laço de conversa com ferramentas, no servidor.

   - Lê pela mesma porta das ferramentas da IA (ia/ferramentas.js, T5a): F.executar(nome, args, { permissoes, autor: 'gestor',
     porta: 'gestor', origemDaAcao: 'ia' }). A camada valida os argumentos pelo esquema, impõe a permissão e audita.
   - Só lê e PROPÕE (proposta_criar). Decidir, marcar como feita e mudar status são rotas de pessoa (rotas/acoes-trafego.js):
     nenhuma ferramenta passada ao modelo chega lá.
   - Modelo: ia_config.modelo_forte; esforço "medium"; pensamento adaptativo (o padrão dos modelos 5.5); fluxo com finalMessage();
     no máximo 8 idas ao modelo (a 8ª com tool_choice "none", para responder com o que já leu) e 90 s.
   - Cache de prompt: marcador no fim do texto de sistema (cobre ferramentas + sistema) e o cache automático da conversa.
   - Recusa: Opus 5.5 e Sonnet 5.5 vão com fallbacks "default" (beta server-side-fallback-2026-07-01); GESTOR_FALLBACK=0 desliga.
   - Cada chamada ao modelo vira uma linha em ia_acoes (origem 'trafego', tipo 'gestor'); a pergunta e a resposta não vão para lá.
   - A conversa fica em trafego_ia_conversas (até 40 mensagens; as mais antigas viram um resumo). Sem a tabela, responde e não guarda.
   - Texto de cliente só chega ao modelo como resultado de ferramenta, dentro de `texto_do_cliente`. Nada de chave, token ou
     endereço do banco entra no contexto.
   ============================================================ */
'use strict';

const F = require('./ferramentas');
const I = require('./instrucoes');
const Decisoes = require('./decisoes');
const P = require('../motor/periodo');
const O = require('../origem');
const Registro = require('../registro');

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { Anthropic = null; }

const MAX_VOLTAS = 8;
const PRAZO_MS = 90_000;
const MAX_MENSAGENS = 40;
const MAX_PERGUNTA = 2000;
const MAX_TOKENS = 16_000;
const POR_HORA = 30;
const JANELA_HORA_MS = 3_600_000;
const MAX_PROPOSTAS = 2;
const ESFORCO = 'medium';
const MAX_CONVERSAS = 30;
const MAX_RESUMO = 3000;
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUNAS_CONVERSA = 'id, perfil_id, titulo, mensagens, criada_em, atualizada_em';
const FALTA_MIGRACAO = 'As conversas ainda não ficam guardadas: falta aplicar a atualização do banco do IndyCar Tráfego.';
const SEM_TEXTO = 'Não consegui escrever uma resposta desta vez. Tente perguntar de outro jeito.';

const FRASE_ERRO = Object.freeze({
  tempo: 'A resposta passou de 90 segundos e eu parei aqui. O que já chegou continua valendo; pergunte de novo, mais direto, se quiser o resto.',
  modelo: 'A IA não respondeu agora. Tente de novo em instantes; o que já chegou continua valendo.',
  modelo_ocupado: 'A IA está sobrecarregada agora. Tente de novo em instantes.',
  recusa: 'A IA não quis responder a esta pergunta. Tente perguntar de outro jeito.',
  interno: 'Algo deu errado aqui. O que já chegou continua valendo.',
});

/* ---------- erro antes do fluxo ---------- */

/** Erro com status, código e (no 429) a espera em segundos. A rota devolve JSON { erro, codigo }. */
class ErroDoGestor extends Error {
  constructor(status, codigo, mensagem, { esperar = null, extra = {} } = {}) {
    super(mensagem); this.name = 'ErroDoGestor'; this.status = status; this.codigo = codigo; this.publico = true; this.esperar = esperar;
    this.extra = { codigo, ...extra };
  }
}
const tabelaAusente = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .* does not exist/i.test(String(e.message || '')));
const objeto = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/* ---------- peças puras ---------- */

/** As ferramentas no formato da API da Anthropic (ordem fixa, para o cache). */
function ferramentasParaModelo(lista) {
  return lista.map(f => ({ name: f.nome, description: f.descricao, input_schema: f.entrada }));
}

/**
 * Depois de uma troca de modelo no meio da resposta (bloco "fallback"), o que volta para o histórico e quais pedidos de
 * ferramenta valem. Antes do último bloco "fallback" só ficam texto e o próprio bloco (pensamento e pedidos de ferramenta
 * do modelo que recusou saem); depois dele, tudo. Sem "fallback", tudo como veio. Bloco de texto vazio nunca volta.
 */
function paraEco(conteudo) {
  const lista = (Array.isArray(conteudo) ? conteudo : []).filter(b => b && !(b.type === 'text' && !String(b.text || '').trim()));
  let limite = -1;
  lista.forEach((b, i) => { if (b.type === 'fallback') limite = i; });
  const eco = limite < 0 ? lista : lista.filter((b, i) => i >= limite || b.type === 'text');
  const valendo = limite < 0 ? lista : lista.slice(limite + 1);
  return { eco, pedidos: valendo.filter(b => b.type === 'tool_use') };
}

/** Resumo curto (sem modelo) das mensagens mais antigas: as perguntas e o começo de cada resposta. */
function resumir(anterior, velhas) {
  const linhas = anterior && anterior.texto ? [String(anterior.texto)] : [];
  for (const m of velhas) {
    const dia = P.diaBR(m.em);
    const quando = dia ? ` (${P.ddmm(dia)})` : '';
    const t = O.texto(m.texto, 4000) || '';
    if (m.papel === 'pessoa') linhas.push(`Pergunta${quando}: ${t.slice(0, 200)}`);
    else if (m.papel === 'gestor') {
      const frase = (t.match(/^[^.!?\n]+[.!?]?/) || [t])[0];
      linhas.push(`Resposta: ${frase.slice(0, 240)}${(m.propostas || []).length ? ` (com ${m.propostas.length} proposta)` : ''}`);
    } else if (m.papel === 'resumo') linhas.push(t);
  }
  let texto = linhas.join('\n');
  if (texto.length > MAX_RESUMO) texto = `…${texto.slice(texto.length - MAX_RESUMO + 1)}`;
  const ultima = velhas.length ? velhas[velhas.length - 1].em : (anterior && anterior.em) || null;
  return { papel: 'resumo', texto, em: ultima, mensagens_resumidas: ((anterior && anterior.mensagens_resumidas) || 0) + velhas.length };
}

/** No máximo 40 mensagens guardadas: as mais antigas viram UMA mensagem "resumo" no começo. */
function encaixar(mensagens, max = MAX_MENSAGENS) {
  const lista = Array.isArray(mensagens) ? mensagens : [];
  if (lista.length <= max) return lista;
  const anterior = lista[0] && lista[0].papel === 'resumo' ? lista[0] : null;
  const resto = anterior ? lista.slice(1) : lista;
  const sobra = resto.length - (max - 1);
  return [resumir(anterior, resto.slice(0, sobra)), ...resto.slice(sobra)];
}

/** O histórico guardado no formato de mensagens do modelo (só texto: as voltas de ferramenta não ficam guardadas). */
function paraModelo(mensagens) {
  const msgs = [];
  for (const m of Array.isArray(mensagens) ? mensagens : []) {
    if (!m || typeof m !== 'object') continue;
    if (m.papel === 'resumo') msgs.push({ role: 'user', content: `Resumo do começo desta conversa (as mensagens mais antigas):\n${m.texto || ''}` });
    else if (m.papel === 'pessoa') msgs.push({ role: 'user', content: String(m.texto || '').trim() || '(pergunta vazia)' });
    else if (m.papel === 'gestor') {
      let t = String(m.texto || '').trim() || '(a resposta parou no meio, sem texto)';
      const ids = Array.isArray(m.propostas) ? m.propostas.filter(Boolean) : [];
      if (ids.length) t += `\n\n(Nesta resposta registrei ${ids.length === 1 ? 'uma proposta' : `${ids.length} propostas`} no diário de decisões: ${ids.join(', ')}.)`;
      msgs.push({ role: 'assistant', content: t });
    }
  }
  if (msgs.length && msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(continuação de uma conversa anterior)' });
  return msgs;
}

/** O título da conversa: o começo da pergunta, numa linha. */
const tituloDa = pergunta => {
  const t = O.texto(pergunta, 200) || 'Conversa com o Gestor';
  return t.length > 80 ? `${t.slice(0, t.lastIndexOf(' ', 78) > 30 ? t.lastIndexOf(' ', 78) : 78)}…` : t;
};
const ehPlano = c => !!c && c.perfil_id == null && Array.isArray(c.mensagens) && !!(c.mensagens[0] && c.mensagens[0].plano === true);

/** Classifica um erro da chamada ao modelo: 'abortado' | 'modelo_ocupado' | 'pedido_recusado' | 'modelo'. */
function classificarErro(e) {
  if (Anthropic && Anthropic.APIUserAbortError && e instanceof Anthropic.APIUserAbortError) return 'abortado';
  if (e && (e.name === 'AbortError' || e.name === 'APIUserAbortError')) return 'abortado';
  const status = e && typeof e.status === 'number' ? e.status : null;
  if (Anthropic && Anthropic.RateLimitError && e instanceof Anthropic.RateLimitError) return 'modelo_ocupado';
  if (status === 429 || status === 529) return 'modelo_ocupado';
  if ((Anthropic && Anthropic.BadRequestError && e instanceof Anthropic.BadRequestError) || status === 400) return 'pedido_recusado';
  return 'modelo';
}
/** O 400 foi por causa da troca automática de modelo (beta não liberada)? Então tentamos de novo sem ela. */
const recusouFallback = e => classificarErro(e) === 'pedido_recusado' && /fallback/i.test(String((e && e.message) || ''));

/* ---------- o Gestor ---------- */

/**
 * Cria o Gestor. Opções (para teste): sb, cliente (objeto com messages.stream/beta.messages.stream; null = sem chave),
 * ferramentas (a camada T5a), diario (ia/decisoes), lerConfig(), limitador, agora(), prazoMs, maxVoltas, fallback (true/false).
 */
function criarGestor(opcoes = {}) {
  const cfg = { sb: null, cliente: undefined, ferramentas: null, diario: null, lerConfig: null, limitador: null, agora: null,
    prazoMs: PRAZO_MS, maxVoltas: MAX_VOLTAS, fallback: undefined, ...opcoes };
  const banco = () => cfg.sb || require('../db').sb;
  const camada = () => cfg.ferramentas || F;
  const diario = () => cfg.diario || Decisoes.padrao();
  const agora = () => (cfg.agora ? cfg.agora() : Date.now());
  const iso = () => new Date(agora()).toISOString();
  const lerConfig = async () => {
    try { return await (cfg.lerConfig ? cfg.lerConfig() : require('../db').lerIaConfig()); }
    catch { return { ativo: true, modelo_forte: 'claude-opus-5-5', limite_chamadas_dia: 2000 }; }
  };
  let _cliente = null;
  let fallbackRecusado = false;
  const pendentes = new Set();

  function temChave() { return cfg.cliente !== undefined ? cfg.cliente !== null : !!process.env.ANTHROPIC_API_KEY; }
  function cliente() {
    if (cfg.cliente !== undefined) return cfg.cliente;
    if (!process.env.ANTHROPIC_API_KEY || !Anthropic) return null;
    if (!_cliente) _cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: PRAZO_MS });
    return _cliente;
  }
  function usarFallback(modelo) {
    if (fallbackRecusado) return false;
    if (cfg.fallback !== undefined) return cfg.fallback === true;
    if (process.env.GESTOR_FALLBACK === '0') return false;
    return /^claude-(opus|sonnet)-5-5/.test(String(modelo));
  }

  /** Uma linha em ia_acoes por chamada ao modelo. Não trava a resposta; falha vai para o log. */
  function registrarChamada(linha) {
    const p = (async () => {
      try {
        const { error } = await banco().from('ia_acoes').insert({ origem: 'trafego', tipo: 'gestor', created_at: iso(), ...linha });
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
      } catch (e) {
        Registro.evento('warn', 'gestor_registro_falhou', { erro: Registro.limpar(e && e.message), codigo: (e && e.code) || null });
      }
    })();
    pendentes.add(p);
    p.finally(() => pendentes.delete(p));
    return p;
  }
  /** Espera os registros em ia_acoes que ainda estão gravando (o teste chama; a resposta nunca espera). */
  async function registrosPendentes() { while (pendentes.size) await Promise.all([...pendentes]); }

  /** Chamadas do Gestor ao modelo hoje (horário de Brasília). Falha na contagem não bloqueia. */
  async function chamadasDeHoje() {
    try {
      const inicio = D_inicioDoDia(agora());
      const { count, error } = await banco().from('ia_acoes').select('id', { count: 'exact', head: true })
        .eq('origem', 'trafego').eq('tipo', 'gestor').gte('created_at', inicio);
      return error ? 0 : count || 0;
    } catch { return 0; }
  }

  /* ---------- conversas ---------- */

  async function lerConversa(id) {
    const { data, error } = await banco().from('trafego_ia_conversas').select(COLUNAS_CONVERSA).eq('id', id).maybeSingle();
    if (error) {
      if (tabelaAusente(error)) throw new ErroDoGestor(503, 'sem_migracao', FALTA_MIGRACAO);
      throw new ErroDoGestor(503, 'temporario', 'Não deu para abrir a conversa agora. Tente de novo em instantes.');
    }
    return data || null;
  }

  /** GET /api/gestor/conversas */
  async function listarConversas(usuario) {
    const { data, error } = await banco().from('trafego_ia_conversas').select(COLUNAS_CONVERSA)
      .eq('perfil_id', usuario.id).order('atualizada_em', { ascending: false }).limit(MAX_CONVERSAS);
    if (error) {
      if (tabelaAusente(error)) return { ligado: false, aviso: FALTA_MIGRACAO, conversas: [] };
      throw new ErroDoGestor(503, 'temporario', 'Não deu para ler as conversas agora. Tente de novo em instantes.');
    }
    return {
      ligado: true, aviso: null,
      conversas: (data || []).map(c => {
        const ms = Array.isArray(c.mensagens) ? c.mensagens : [];
        const ultima = [...ms].reverse().find(m => m && m.texto);
        return { id: c.id, titulo: c.titulo || 'Conversa com o Gestor', criada_em: c.criada_em || null, atualizada_em: c.atualizada_em || null,
          mensagens: ms.length, ultima: ultima ? O.texto(ultima.texto, 120) : null };
      }),
    };
  }

  const publica = c => ({ id: c.id, titulo: c.titulo || 'Conversa com o Gestor', criada_em: c.criada_em || null, atualizada_em: c.atualizada_em || null,
    plano: ehPlano(c), mensagens: Array.isArray(c.mensagens) ? c.mensagens : [] });

  /** GET /api/gestor/conversas/:id (da pessoa, ou um plano da semana). */
  async function abrirConversa(id, usuario) {
    if (!UUID.test(String(id || ''))) throw new ErroDoGestor(404, 'conversa', 'Essa conversa não existe mais.');
    const c = await lerConversa(id);
    if (!c || (c.perfil_id !== usuario.id && !ehPlano(c))) throw new ErroDoGestor(404, 'conversa', 'Essa conversa não existe mais.');
    return publica(c);
  }

  /** POST /api/gestor/conversas: abre uma conversa vazia. */
  async function criarConversa(corpo, usuario) {
    const c = objeto(corpo) || {};
    if (c.titulo != null && typeof c.titulo !== 'string') throw new ErroDoGestor(422, 'titulo', 'O título precisa ser um texto.');
    const titulo = c.titulo ? tituloDa(c.titulo) : 'Conversa nova';
    const agoraIso = iso();
    const { data, error } = await banco().from('trafego_ia_conversas')
      .insert({ perfil_id: usuario.id, titulo, mensagens: [], criada_em: agoraIso, atualizada_em: agoraIso }).select(COLUNAS_CONVERSA).single();
    if (error) {
      if (tabelaAusente(error)) throw new ErroDoGestor(503, 'sem_migracao', FALTA_MIGRACAO);
      throw new ErroDoGestor(503, 'temporario', 'Não deu para abrir a conversa agora. Tente de novo em instantes.');
    }
    return { ok: true, conversa: publica(data) };
  }

  /* ---------- antes do fluxo ---------- */

  /**
   * Confere tudo antes de abrir o fluxo (os erros daqui viram JSON com status). Devolve o pedido para responder().
   * plano: true = a pergunta fixa do plano da semana (sem dono; usuario pode ser null, quando quem pede é a rotina).
   */
  async function preparar({ usuario = null, corpo = {}, plano = false, ehAdmin = false } = {}) {
    const c = objeto(corpo) || {};
    let pergunta;
    if (plano) pergunta = I.perguntaDoPlano(agora());
    else {
      if (typeof c.pergunta !== 'string' || !c.pergunta.trim()) throw new ErroDoGestor(422, 'pergunta', 'Escreva a sua pergunta.');
      pergunta = String(c.pergunta).replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, ' ').trim();
      if (pergunta.length > MAX_PERGUNTA) throw new ErroDoGestor(422, 'pergunta', `A pergunta pode ter no máximo ${MAX_PERGUNTA} letras.`);
      if (c.conversa_id != null && c.conversa_id !== '' && !UUID.test(String(c.conversa_id))) throw new ErroDoGestor(422, 'conversa_id', 'Conversa inválida.');
    }
    const dadoPessoal = !plano && c.dado_pessoal === true;
    if (dadoPessoal && !ehAdmin) throw new ErroDoGestor(403, 'so_admin', 'Só o administrador pode abrir dado pessoal (nome, telefone e conversa do cliente) no Gestor.');

    if (!temChave()) throw new ErroDoGestor(503, 'sem_chave', 'O Gestor IA está desligado: falta a chave da IA no servidor. O resto do app segue funcionando.');
    const ia = await lerConfig();
    if (ia.ativo === false) throw new ErroDoGestor(503, 'ia_desligada', 'A IA está desligada nas configurações do ecossistema. O resto do app segue funcionando.');
    const limite = Number(ia.limite_chamadas_dia) || 0;
    if (limite > 0 && (await chamadasDeHoje()) >= limite) {
      throw new ErroDoGestor(429, 'limite_dia', `A IA já fez as ${limite} chamadas do dia. Volta amanhã, ou o administrador aumenta o limite.`);
    }

    let conversa = { id: null, titulo: plano ? I.tituloDoPlano(agora()) : tituloDa(pergunta), mensagens: [], semente: null };
    if (plano) {
      const sonda = await banco().from('trafego_ia_conversas').select('id').limit(1);
      if (sonda.error && tabelaAusente(sonda.error)) throw new ErroDoGestor(503, 'sem_migracao', `O plano da semana fica guardado no banco: ${FALTA_MIGRACAO.charAt(0).toLowerCase()}${FALTA_MIGRACAO.slice(1)}`);
    } else if (c.conversa_id) {
      const atual = await lerConversa(c.conversa_id);
      if (atual && ehPlano(atual)) {
        // Pergunta sobre um plano da semana: abre uma conversa da pessoa que começa com o plano.
        conversa = { id: null, titulo: `Sobre o ${I.PREFIXO_DO_PLANO.toLowerCase()} (${P.ddmm(P.diaBR(atual.criada_em) || P.hojeBR(agora()))})`,
          mensagens: atual.mensagens.map(m => ({ ...m, plano: undefined })), semente: atual.id };
      } else if (!atual || !usuario || atual.perfil_id !== usuario.id) {
        throw new ErroDoGestor(404, 'conversa', 'Essa conversa não existe mais.');
      } else {
        conversa = { id: atual.id, titulo: atual.titulo, mensagens: Array.isArray(atual.mensagens) ? atual.mensagens : [], semente: null };
      }
    }

    if (usuario && cfg.limitador) {
      const r = cfg.limitador.permitir(`gestor|${usuario.id}`, POR_HORA, JANELA_HORA_MS, agora());
      if (!r.ok) throw new ErroDoGestor(429, 'limite_hora', `Você já fez ${POR_HORA} perguntas ao Gestor nesta hora. Espere ${Math.ceil(r.esperar / 60)} min.`, { esperar: r.esperar });
    }

    return {
      usuario, perfilId: usuario && UUID.test(String(usuario.id)) ? usuario.id : null, pergunta, plano, dadoPessoal,
      permissoes: { escopos: ['ler', 'propor'], ver_pii: dadoPessoal },
      modelo: ia.modelo_forte || 'claude-opus-5-5', conversa,
    };
  }

  /* ---------- o laço ---------- */

  /**
   * Conversa com o modelo até ele responder (ou bater 8 voltas / 90 s / a pessoa parar).
   * Devolve { texto, ferramentas, propostas, uso, parou, erro, modelo }. Emite texto, ferramenta e proposta.
   */
  async function rodarLaco({ pedido, historico, conversaId, emitir, sinal }) {
    const api = cliente();
    const ferramentas = ferramentasParaModelo(camada().disponiveis({ permissoes: pedido.permissoes }));
    const sistema = [{ type: 'text', text: I.SISTEMA, cache_control: { type: 'ephemeral' } }];
    const msgs = historico.slice();
    const out = { texto: '', ferramentas: [], propostas: [], uso: { entrada: 0, saida: 0, cache_lido: 0, cache_criado: 0, chamadas: 0, ferramentas: 0 },
      parou: null, erro: null, modelo: pedido.modelo };
    const controlador = new AbortController();
    let motivo = null;
    const parar = m => { if (!motivo) { motivo = m; controlador.abort(); } };
    const relogio = setTimeout(() => parar('tempo'), cfg.prazoMs);
    if (typeof relogio.unref === 'function') relogio.unref();
    const aoParar = () => parar('cliente');
    if (sinal) { if (sinal.aborted) parar('cliente'); else sinal.addEventListener('abort', aoParar, { once: true }); }
    const falhar = codigo => { out.erro = { codigo, erro: FRASE_ERRO[codigo] || FRASE_ERRO.interno }; };
    const mandarTexto = t => { if (!t) return; out.texto += t; emitir('texto', { texto: t }); };

    try {
      for (let volta = 1; volta <= cfg.maxVoltas; volta++) {
        if (motivo) break;
        const ultima = volta === cfg.maxVoltas;
        const comFallback = usarFallback(pedido.modelo);
        const corpo = {
          model: pedido.modelo, max_tokens: MAX_TOKENS, system: sistema, tools: ferramentas, messages: msgs,
          output_config: { effort: ESFORCO }, cache_control: { type: 'ephemeral' },
          ...(ultima ? { tool_choice: { type: 'none' } } : {}),
          ...(comFallback ? { betas: [BETA_FALLBACK], fallbacks: 'default' } : {}),
        };
        const inicio = Date.now();
        let primeiroDaVolta = true;
        let msg;
        try {
          const canal = comFallback ? api.beta.messages : api.messages;
          const fluxo = canal.stream(corpo, { signal: controlador.signal });
          fluxo.on('text', delta => {
            if (motivo || !delta) return;
            if (primeiroDaVolta && out.texto && !/\n\s*$/.test(out.texto)) mandarTexto('\n\n');
            primeiroDaVolta = false;
            mandarTexto(delta);
          });
          msg = await fluxo.finalMessage();
        } catch (e) {
          const tipo = motivo ? 'abortado' : classificarErro(e);
          out.uso.chamadas++;
          registrarChamada({ status: 'erro', perfil_id: pedido.perfilId, modelo: pedido.modelo, resumo: 'Gestor IA: a chamada ao modelo falhou',
            erro: Registro.limpar(e && e.message).slice(0, 300), duracao_ms: Date.now() - inicio,
            entrada: { ato: pedido.plano ? 'plano' : 'pergunta', conversa_id: conversaId, volta }, saida: { parou: tipo } });
          if (tipo === 'abortado' || motivo) break;
          if (comFallback && recusouFallback(e)) { fallbackRecusado = true; volta--; continue; }
          Registro.evento('warn', 'gestor_modelo_falhou', { tipo, status: (e && e.status) || null, erro: Registro.limpar(e && e.message) });
          falhar(tipo === 'modelo_ocupado' ? 'modelo_ocupado' : 'modelo');
          return out;
        }

        const u = msg.usage || {};
        out.uso.chamadas++;
        out.uso.entrada += Number(u.input_tokens) || 0;
        out.uso.saida += Number(u.output_tokens) || 0;
        out.uso.cache_lido += Number(u.cache_read_input_tokens) || 0;
        out.uso.cache_criado += Number(u.cache_creation_input_tokens) || 0;
        if (msg.model) out.modelo = msg.model;
        const { eco, pedidos } = paraEco(msg.content);
        registrarChamada({ status: 'executada', perfil_id: pedido.perfilId, modelo: msg.model || pedido.modelo,
          resumo: `Gestor IA: ${pedido.plano ? 'plano da semana' : 'pergunta'}, volta ${volta}`,
          tokens_entrada: Number(u.input_tokens) || 0, tokens_saida: Number(u.output_tokens) || 0, duracao_ms: Date.now() - inicio,
          entrada: { ato: pedido.plano ? 'plano' : 'pergunta', conversa_id: conversaId, volta },
          saida: { parou: msg.stop_reason || null, cache_lido: Number(u.cache_read_input_tokens) || 0, cache_criado: Number(u.cache_creation_input_tokens) || 0,
            ferramentas_pedidas: pedidos.map(p => p.name) },
          executada_em: iso() });

        if (msg.stop_reason === 'refusal') { falhar('recusa'); return out; }
        if (msg.stop_reason === 'max_tokens') { out.parou = 'max_tokens'; break; }
        if (msg.stop_reason === 'pause_turn') { msgs.push({ role: 'assistant', content: eco }); continue; }
        if (!pedidos.length) { out.parou = 'fim'; break; }
        if (ultima) {
          out.parou = 'voltas';
          mandarTexto(`${out.texto ? '\n\n' : ''}Parei de consultar aqui para não demorar demais. Se quiser, pergunte de novo sobre o ponto que ficou faltando.`);
          break;
        }

        msgs.push({ role: 'assistant', content: eco });
        const resultados = [];
        for (const p of pedidos) {
          if (motivo) break;
          emitir('ferramenta', { nome: p.name, rotulo: I.rotuloDa(p.name) });
          out.ferramentas.push(p.name);
          out.uso.ferramentas++;
          if (p.name === 'proposta_criar' && out.propostas.length >= MAX_PROPOSTAS) {
            resultados.push({ type: 'tool_result', tool_use_id: p.id, is_error: true,
              content: `Já há ${MAX_PROPOSTAS} propostas nesta resposta: não registre mais. Fale das outras ideias só no texto.` });
            continue;
          }
          try {
            const saida = await camada().executar(p.name, p.input, { permissoes: pedido.permissoes, autor: 'gestor', porta: 'gestor', origemDaAcao: 'ia' });
            if (p.name === 'proposta_criar' && saida && saida.proposta && saida.proposta.id) {
              const acao = await diario().lerAcao(saida.proposta.id).catch(() => null)
                || { id: saida.proposta.id, status: 'proposta', titulo: saida.proposta.titulo, tipo: saida.proposta.tipo, risco: saida.proposta.risco, risco_motivo: saida.proposta.risco_motivo, medir_em: saida.proposta.medir_em };
              out.propostas.push(saida.proposta.id);
              emitir('proposta', { proposta: acao });
            }
            resultados.push({ type: 'tool_result', tool_use_id: p.id, content: JSON.stringify(saida) });
          } catch (e) {
            const frase = e && e.publico && e.message ? e.message : 'Algo deu errado ao montar esta resposta. Tente de novo em instantes.';
            if (!(e && e.publico)) Registro.evento('warn', 'gestor_ferramenta_falhou', { ferramenta: p.name, erro: Registro.limpar(e && e.message) });
            resultados.push({ type: 'tool_result', tool_use_id: p.id, is_error: true, content: frase });
          }
        }
        if (motivo) break;
        if (volta === cfg.maxVoltas - 1) {
          resultados.push({ type: 'text', text: 'Você já consultou o bastante: responda agora com o que já leu, sem chamar mais ferramentas.' });
        }
        msgs.push({ role: 'user', content: resultados });
      }
    } finally {
      clearTimeout(relogio);
      if (sinal) sinal.removeEventListener('abort', aoParar);
    }

    if (motivo === 'tempo') { falhar('tempo'); return out; }
    if (motivo === 'cliente') { out.parou = 'cliente'; return out; }
    if (!out.parou) out.parou = 'fim';
    if (!out.texto.trim()) mandarTexto(SEM_TEXTO);
    return out;
  }

  /* ---------- a resposta inteira (laço + guardar + evento final) ---------- */

  /**
   * Roda o pedido preparado: guarda a pergunta, conversa com o modelo, guarda a resposta e emite `fim` ou `erro`.
   * emitir(tipo, dados) recebe texto, ferramenta, proposta, fim e erro. sinal = AbortSignal (a pessoa fechou a conexão).
   */
  async function responder(pedido, { emitir = () => {}, sinal = null } = {}) {
    const emite = (tipo, dados) => { try { emitir(tipo, dados); } catch { /* quem ouve caiu: segue para guardar */ } };
    const quando = iso();
    const periodos = pedido.plano ? I.periodosDoPlano(agora()) : null;
    const msgPessoa = { papel: 'pessoa', texto: pedido.pergunta, em: quando,
      ...(pedido.plano ? { plano: true, pedido_por: pedido.perfilId } : {}) };
    const anteriores = pedido.conversa.mensagens || [];
    let conversaId = pedido.conversa.id, aviso = null;
    if (!conversaId) {
      const { data, error } = await banco().from('trafego_ia_conversas')
        .insert({ perfil_id: pedido.plano ? null : pedido.perfilId, titulo: pedido.conversa.titulo, mensagens: [...anteriores, msgPessoa], criada_em: quando, atualizada_em: quando })
        .select('id').single().then(r => r, e => ({ error: e }));
      if (error) {
        aviso = tabelaAusente(error) ? FALTA_MIGRACAO : 'Não deu para guardar esta conversa agora; a resposta vale do mesmo jeito.';
        if (!tabelaAusente(error)) Registro.evento('warn', 'gestor_conversa_nao_gravou', { erro: Registro.limpar(error.message) });
      } else conversaId = data.id;
    }

    const historico = paraModelo(anteriores);
    historico.push({ role: 'user', content: `${I.linhaDoDia(agora())}\n\n${pedido.pergunta}` });

    let out;
    try { out = await rodarLaco({ pedido, historico, conversaId, emitir: emite, sinal }); }
    catch (e) {
      Registro.evento('error', 'gestor_falhou', { erro: Registro.limpar(e && e.message), tipo: (e && e.name) || null });
      out = { texto: '', ferramentas: [], propostas: [], uso: { entrada: 0, saida: 0, cache_lido: 0, cache_criado: 0, chamadas: 0, ferramentas: 0 },
        parou: null, erro: { codigo: 'interno', erro: FRASE_ERRO.interno }, modelo: pedido.modelo };
    }

    const msgGestor = { papel: 'gestor', texto: out.texto, em: iso(), ferramentas: [...new Set(out.ferramentas)], propostas: out.propostas,
      parou: out.erro ? null : out.parou, erro: out.erro || (out.parou === 'cliente' ? { codigo: 'parado', erro: 'A resposta foi parada no meio.' } : null),
      ...(pedido.plano ? { plano: true, baseado_em: { de: periodos.p30.de, ate: periodos.p30.ate, dias: [7, 30] } } : {}) };
    if (conversaId) {
      const mensagens = encaixar([...anteriores, msgPessoa, msgGestor]);
      const r = await banco().from('trafego_ia_conversas').update({ mensagens, atualizada_em: msgGestor.em }).eq('id', conversaId)
        .then(x => x, e => ({ error: e }));
      if (r.error) { aviso = 'Não deu para guardar a resposta nesta conversa agora.'; Registro.evento('warn', 'gestor_conversa_nao_gravou', { erro: Registro.limpar(r.error.message) }); }
    }

    if (out.erro) emite('erro', { erro: out.erro.erro, codigo: out.erro.codigo, conversa_id: conversaId });
    else if (out.parou !== 'cliente') emite('fim', { conversa_id: conversaId, uso: out.uso, modelo: out.modelo, parou: out.parou, aviso });
    return { ...out, conversa_id: conversaId, aviso, em: msgGestor.em, baseado_em: msgGestor.baseado_em || null };
  }

  return {
    preparar, responder, rodarLaco, listarConversas, abrirConversa, criarConversa, lerConversa, chamadasDeHoje, registrosPendentes,
    temChave, trocar(novas = {}) { Object.assign(cfg, novas); },
    get config() { return cfg; },
  };
}

/** Meia-noite de hoje em Brasília, como instante ISO (Brasil sem horário de verão: -03:00). */
function D_inicioDoDia(agora) {
  return `${P.hojeBR(agora)}T03:00:00.000Z`;
}

let _padrao = null;
const padrao = () => (_padrao || (_padrao = criarGestor()));

module.exports = {
  MAX_VOLTAS, PRAZO_MS, MAX_MENSAGENS, MAX_PERGUNTA, POR_HORA, MAX_PROPOSTAS, ESFORCO, BETA_FALLBACK, FALTA_MIGRACAO, FRASE_ERRO,
  ErroDoGestor, ferramentasParaModelo, paraEco, resumir, encaixar, paraModelo, tituloDa, ehPlano, classificarErro,
  criarGestor, padrao,
};
