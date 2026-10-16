// IndyCar Comunicar — servidor HTTP (somente módulos nativos do Node)
// A central de comunicação da oficina: réguas automáticas (lembrete de horário,
// pós-venda, avaliação, revisão por tipo de serviço, aniversário, orçamento
// parado, não fechou, reativação), campanhas por segmento e satisfação —
// tudo saindo pelo WhatsApp DA EMPRESA.
// Banco: o MESMO Supabase do CRM, da Agenda e do Atendimento.
//
// Aqui mora a "fiação": WhatsApp (whatsapp.js), carteiro, IA, login e arquivos
// estáticos. As rotas e o porteiro de cada uma estão em rotas.js (testados sem
// banco); as regras de papel/app em acesso.js; as automações da equipe em automacoes.js.
//
// Rodada 5 (preparo para a IndyCar Central): este arquivo EXPORTA
//   { handler, iniciar, VERSAO } — `handler(req, res)` serve tudo e aceita
//   `req.prefixo` (ex.: '/comunicar') ou a variável PREFIXO; o `listen` só
//   acontece quando este arquivo é o programa principal (`node server.js`).
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as dados from './dados.js';
import * as ia from './ia.js';
import * as acesso from './acesso.js';
import * as auto from './automacoes.js';
import * as carteiro from './carteiro.js';
import * as patio from './patio.js';
import { criarWhatsApp } from './whatsapp.js';
import { criarApi } from './rotas.js';
import { criarEstaticos } from './estaticos.js';
import { selecionarUm, conferirConfiguracao } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3500;
export const VERSAO = '5.0.0';

/* Token do carteiro externo (GitHub Actions e o pg_cron do Supabase chamam
   /api/rodar de fora, para o caso do servidor gratuito do Render estar dormindo). */
const RUNNER_TOKEN = (process.env.RUNNER_TOKEN || '').trim();
const EM_PRODUCAO = !!process.env.RENDER;
/* Prefixo em que o app está montado ('' sozinho; '/comunicar' dentro da Central).
   A Central também pode mandar `req.prefixo` em cada chamada (vale mais que a variável). */
const PREFIXO = normalizarPrefixo(process.env.PREFIXO || '');
export function normalizarPrefixo(p) {
  const t = String(p || '').trim();
  if (!t || t === '/') return '';
  return ('/' + t.replace(/^\/+|\/+$/g, '')).replace(/\/{2,}/g, '/');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const SEGUROS = acesso.cabecalhosSeguros({ https: EM_PRODUCAO });

// ============================================================================
// WHATSAPP DA EMPRESA — mesma fonte dos outros painéis:
//   • chave e serviço do CodeWords: agenda_ia_config (linha única)
//   • aparelho conectado: codewords_config (o Atendimento mantém atualizado)
// A fiação do envio/status mora em whatsapp.js (testada com um CodeWords falso).
// ============================================================================

let _cacheCw = { valor: null, em: 0 };
async function configWhatsapp(forcar = false) {
  if (!forcar && _cacheCw.valor && Date.now() - _cacheCw.em < 5 * 60_000) return _cacheCw.valor;
  const [iaCfg, central] = await Promise.all([
    selecionarUm('agenda_ia_config', 'select=cw_api_key,cw_connect_service_id,cw_base_url&id=is.true'),
    selecionarUm('codewords_config', 'select=api_key,device_id&limit=1'),
  ]);
  const cfg = {
    api_key: central?.api_key || iaCfg?.cw_api_key || null,
    servico: iaCfg?.cw_connect_service_id || 'whatsapp_device_manager',
    base: (iaCfg?.cw_base_url || 'https://runtime.codewords.ai').replace(/\/+$/, ''),
    device_id: central?.device_id || null,
  };
  _cacheCw = { valor: cfg, em: Date.now() };
  return cfg;
}
const wa = criarWhatsApp({ configWhatsapp });
/** "Conferir agora": esquece a chave em cache (o João pode ter acabado de colar a nova) e o status. */
function reconferirWhatsapp() { _cacheCw = { valor: null, em: 0 }; wa.limparCache(); }

// ============================================================================
// CARTEIRO — gera o que as réguas mandam e envia o que venceu
// ============================================================================

const ultimaRodada = { em: null, resultado: null };
/* CARTEIRO_DESLIGADO=1: servidor local de conferência — sem timers e sem rodada
   (nada é gerado, nada é enviado, nada é gravado na fila). */
const CARTEIRO_DESLIGADO = /^(1|true|sim)$/i.test(String(process.env.CARTEIRO_DESLIGADO || '').trim());

/** O que o carteiro faz pela EQUIPE (não fala com cliente): falhas por régua e resumo semanal. */
async function equipeNaRodada() {
  const saida = {};
  saida.falhas = await auto.vigiarFalhas({ loja: dados.lojaEquipe }).catch((e) => ({ erro: String(e?.message || e) }));
  saida.resumo = await auto.resumoSemanalEquipe({ loja: dados.lojaEquipe }).catch((e) => ({ erro: String(e?.message || e) }));
  return saida;
}

/* Rodada 4: se já está rodando, quem chamou ESPERA a rodada atual (antes voltava
   "já está rodando" e o "Rodar agora" parecia falhar). */
let rodadaAtual = null;
function rodarCarteiro(origem = 'desconhecido') {
  if (CARTEIRO_DESLIGADO) return Promise.resolve({ ok: false, desligado: true, enviados: 0, falhas: 0, aviso: 'Carteiro desligado neste servidor (CARTEIRO_DESLIGADO=1): nada foi gerado nem enviado.' });
  if (rodadaAtual) return rodadaAtual.then((r) => ({ ...r, juntouComRodadaEmAndamento: true }));
  const inicio = Date.now();
  rodadaAtual = umaRodada()
    .catch((e) => {
      console.error('Carteiro:', e?.message || e);
      return { ok: false, erro: 'O carteiro não conseguiu rodar agora (banco ou rede fora). Ele tenta de novo sozinho na próxima chamada.', enviados: 0, falhas: 0, detalhe: String(e?.message || e).slice(0, 200) };
    })
    .then((r) => {
      dados.registrarBatida({
        origem, duracao_ms: Date.now() - inicio, ok: r.ok !== false, criados: r.gerado?.criados, enviados: r.enviados,
        falhas: r.falhas, expirados: r.expirados, presos: r.presos, aviso: r.aviso, erro: r.ok === false ? (r.detalhe || r.erro) : null, versao: VERSAO,
      });
      return { ...r, origem, duracao_ms: Date.now() - inicio };
    })
    .finally(() => { rodadaAtual = null; });
  return rodadaAtual;
}

/** "Ontem" ficou sem nenhuma rodada? (o servidor ficou fora o dia todo) */
function ontemSemRodada(ultimaRodadaEm) {
  if (!ultimaRodadaEm) return false; // nunca rodou: régua recém-ligada não manda parabéns atrasado
  const inicioDeOntem = dados.instanteSP(dados.somarDias(dados.hoje(), -1), '00:00').getTime();
  return new Date(ultimaRodadaEm).getTime() < inicioDeOntem;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function umaRodada() {
  const cfg = await dados.obterConfig();
  // 1. o que ficou para trás e não faz mais sentido, e envios presos de um servidor que caiu
  const presos = await dados.soltarReservasPresas(carteiro.ERRO_RESERVA_PRESA, carteiro.RESERVA_PRESA_MIN).catch(() => 0);
  const expirados = await dados.expirarVencidos(carteiro.MOTIVO_EXPIRADO).catch(() => 0);
  // 2. as réguas geram (idempotente: chave única por cliente/agendamento)
  const gerado = await dados.gerarTudo({ cfg, recuperarOntem: ontemSemRodada(cfg.ultima_rodada_em) });
  const base = { ok: true, gerado, enviados: 0, falhas: 0, adiados: 0, reagendados: 0, expirados, presos, versao: VERSAO };

  // a IA lê as respostas novas (independe da janela: ninguém recebe nada por isso)
  base.ia = await lerRespostasComIA().catch((e) => ({ erro: String(e?.message || e) }));

  if (cfg.pausa_geral) return anotar({ ...base, equipe: await equipeNaRodada(), aviso: 'Envios pausados: a pausa geral está ligada.' });
  const { hora, minuto, diaSemana, data } = dados.agoraSP();
  if (hora < cfg.janela_inicio || hora >= cfg.janela_fim) {
    return anotar({ ...base, equipe: await equipeNaRodada(), aviso: `Fora da janela de envio (${cfg.janela_inicio}h–${cfg.janela_fim}h).` });
  }
  if (diaSemana === 0 && !cfg.envia_domingo) return anotar({ ...base, equipe: await equipeNaRodada(), aviso: 'Domingo: envios automáticos pausados.' });
  // rodada 5: "só no horário da loja" (seg–sáb 8h–17h30), quem quiser
  if (cfg.so_horario_comercial && !carteiro.dentroDoHorarioComercial({ diaSemana, hora, minuto })) {
    return anotar({ ...base, equipe: await equipeNaRodada(), aviso: 'Fora do horário comercial (seg–sáb, 8h–17h30): os envios esperam a loja abrir.' });
  }

  // limites: por hora (padrão 60), por dia (padrão 300) e por minuto (padrão 10) — cadência segura
  const [ultimaHora, enviadasHoje] = await Promise.all([dados.enviadasNaUltimaHora().catch(() => 0), dados.enviadasHoje().catch(() => 0)]);
  const vagasHora = dados.vagasNestaRodada(cfg.limite_por_hora, ultimaHora);
  if (!vagasHora) return anotar({ ...base, equipe: await equipeNaRodada(), aviso: `Limite de ${cfg.limite_por_hora} mensagens por hora atingido — o resto sai na próxima rodada.` });
  const vagas = carteiro.vagasPorCadencia({ limitePorMinuto: cfg.limite_por_minuto, limitePorDia: cfg.limite_por_dia, enviadasHoje, vagasHora });
  if (!vagas) return anotar({ ...base, equipe: await equipeNaRodada(), aviso: `Limite diário de ${cfg.limite_por_dia} mensagens atingido — o resto sai amanhã.` });
  const pausaMs = carteiro.pausaEntreEnvios(cfg.limite_por_minuto);

  const nomeFeriado = dados.feriado(data);
  // a fila por PRIORIDADE (pátio pronto > lembrete > pós-venda > … > campanha) e um aviso por cliente por vez
  const bruta = await dados.enviosDevidos(Math.min(vagas + 10, 40)); // folga: alguns serão adiados
  const sep = carteiro.separarMesmoCliente(bruta, { minutos: cfg.intervalo_mesmo_cliente_min });
  for (const a of sep.adiados) await dados.adiarEnvio(a.envio.id, a.enviar_em, 'outra mensagem para o mesmo cliente saiu agora: espera um pouco').catch(() => {});
  const fila = sep.agora;
  // lembretes: confere o horário de AGORA (cancelado/remarcado enquanto o servidor dormia)
  const agendas = await dados.agendamentosPorIds(fila.filter((e) => e.tipo === 'lembrete').map((e) => e.agendamento_id)).catch(() => null);
  // avisos do Pátio: confere a ordem de AGORA (carro já entregue não recebe "está pronto")
  const ordensPatio = await dados.ordensDoPatio(fila.map((e) => patio.osIdDaChave(e.chave_unica)).filter(Boolean)).catch(() => null);
  let enviados = 0, falhas = 0, adiados = sep.adiados.length, reagendados = 0, pulados = 0, parouPor = null, classeParou = null;
  const porClasse = {};
  for (const envio of fila) {
    if (enviados >= vagas) break;
    if (carteiro.envioVencido(envio)) continue; // a faxina do começo pega na próxima
    // feriado nacional: régua de relacionamento espera o próximo dia útil
    if (nomeFeriado && dados.TIPOS_SEGURAM_NO_FERIADO.has(envio.tipo)) {
      await dados.adiarEnvio(envio.id, dados.proximoDiaDeEnvio(data, cfg.hora_envio, cfg.envia_domingo), `feriado (${nomeFeriado})`).catch(() => {});
      adiados++; continue;
    }
    if (envio.tipo === 'lembrete' && envio.agendamento_id && agendas) {
      const c = carteiro.conferirLembrete(envio, agendas.get(envio.agendamento_id), cfg);
      if (c.acao === 'pular') { await dados.marcarEnvio(envio.id, 'pulado', null, undefined, { motivo_pulado: c.motivo }).catch(() => {}); pulados++; continue; }
      if (c.acao === 'atualizar') {
        await dados.atualizarEnvio(envio.id, { corpo: c.corpo, expira_em: c.expira_em, ...(c.enviar_em ? { enviar_em: c.enviar_em } : {}) }).catch(() => {});
        if (c.enviar_em) { reagendados++; continue; }
        envio.corpo = c.corpo;
      }
    }
    if (envio.tipo?.startsWith('patio_')) {
      const osId = patio.osIdDaChave(envio.chave_unica);
      const os = osId && ordensPatio ? (ordensPatio.get(osId) || null) : undefined;
      const c = patio.conferirPatio(envio, os, os?.extras || []);
      if (c.acao === 'pular') { await dados.marcarEnvio(envio.id, 'pulado', null, undefined, { motivo_pulado: c.motivo }).catch(() => {}); pulados++; continue; }
    }
    // alguém está atendendo o cliente agora → espera 3 h
    let ocup = { ocupada: false, conversa: undefined };
    try { ocup = await dados.ocupacaoDaConversa(envio.telefone); } catch { /* sem leitura: segue */ }
    if (ocup.ocupada && dados.TIPOS_ESPERAM_ATENDIMENTO.has(envio.tipo)) {
      await dados.adiarEnvio(envio.id, new Date(Date.now() + 3 * 3600000).toISOString(), ocup.motivo).catch(() => {});
      adiados++; continue;
    }

    // reserva: só quem reservou manda (outro carteiro pode estar na mesma fila)
    const reservado = await dados.reservarEnvio(envio.id).catch(() => null);
    if (!reservado) continue;

    const r = await wa.enviar(envio.telefone, envio.corpo);
    const tentativas = (Number(envio.tentativas) || 0) + 1;
    if (r.ok) {
      /* Saiu: marcar como enviado com novas tentativas (o Supabase às vezes engasga).
         Se nem assim gravar, a reserva fica e vira "confira antes de reenviar" —
         nunca uma segunda mensagem para o cliente. */
      await carteiro.comTentativas(() => dados.marcarEnvio(envio.id, 'enviado', null, tentativas, { motivo_pulado: null, erro_classe: null }))
        .catch((e) => console.error(`Envio ${envio.id} saiu mas não consegui marcar:`, e?.message || e));
      enviados++;
      // aparece no histórico da conversa do Atendimento (só depois de sair de verdade)
      await dados.registrarNoHistorico(envio, ocup.conversa).catch((e) => console.error(`Histórico do envio ${envio.id}:`, e?.message || e));
    } else {
      console.error(`Envio ${envio.id} falhou [${r.classe}]: ${r.erro}`);
      porClasse[r.classe] = (porClasse[r.classe] || 0) + 1;
      if (r.estrutural) {
        /* Sem aparelho/chave TODOS falhariam igual: a mensagem volta para a
           fila (sem gastar tentativa) e a rodada para aqui, com o aviso claro. */
        await dados.marcarEnvio(envio.id, 'pendente', r.erro, Number(envio.tentativas) || 0, { erro_classe: r.classe }).catch(() => {});
        falhas++;
        parouPor = r.erro; classeParou = r.classe;
        break;
      }
      // falha passageira: até 3 re-tentativas, com espera crescente (5, 15, 45 min); número inválido falha de vez
      const d = dados.decidirFalha(r.erro, tentativas, Date.now(), r.definitivo);
      if (d.status === 'pendente') {
        await dados.marcarEnvio(envio.id, 'pendente', r.erro, tentativas, { enviar_em: d.enviar_em, erro_classe: r.classe });
        reagendados++;
      } else {
        await dados.marcarEnvio(envio.id, 'falhou', r.erro, tentativas, { erro_classe: r.classe });
        falhas++;
      }
    }
    await dormir(pausaMs); // cadência: respeita o limite por minuto, com variação (sem rajada)
  }
  // o estado do WhatsApp fica gravado (o painel "Saúde" lê mesmo com o servidor recém-acordado)
  if (classeParou) await dados.gravarEstadoWhatsapp(classeParou, parouPor).catch(() => {});
  else if (enviados) await dados.gravarEstadoWhatsapp('ok', null).catch(() => {});
  return anotar({ ...base, equipe: await equipeNaRodada(), enviados, falhas, adiados, reagendados, pulados, porClasse, cadencia: { vagas, pausaMs, enviadasHoje },
    feriado: nomeFeriado || undefined, aviso: parouPor || undefined, classe: classeParou || undefined });
}

function anotar(resultado) {
  ultimaRodada.em = new Date().toISOString();
  ultimaRodada.resultado = resultado;
  dados.salvarUltimaRodada(resultado).catch(() => {}); // o Render dorme: a memória do processo não basta
  return resultado;
}

// ============================================================================
// IA — contexto (chave, modelos, limite do dia) e leitura das respostas
// ============================================================================

/** Contexto da IA ou erro claro (desligada, sem chave, passou do limite do dia). */
async function contextoIA() {
  const cfg = await dados.iaConfig();
  if (!cfg.ativo) { const e = new Error('A IA está desligada (Atendimento › Configurações › IA).'); e.status = 503; throw e; }
  const chave = await dados.chaveIA();
  if (!chave) { const e = new Error('A IA está sem chave configurada.'); e.status = 503; throw e; }
  if ((await dados.chamadasIAHoje()) >= cfg.limite) { const e = new Error(`Limite de ${cfg.limite} chamadas de IA por dia atingido.`); e.status = 429; throw e; }
  return { chave, modelos: cfg.modelos, autonomia: cfg.autonomia };
}

/* A leitura das respostas avisa a equipe: tarefa para o dono da conversa e,
   em reclamação, notificação imediata aos gestores (automacoes.js). */
const lojaLeitura = {
  ...dados.lojaRespostas,
  depoisDaLeitura: (envio, r) => auto.aposLeituraDaIA({ envio, intencao: r.intencao, resumo: r.resumo, loja: dados.lojaEquipe }),
};

let lendoRespostas = false;
async function lerRespostasComIA() {
  if (lendoRespostas) return { pulou: 'já estava lendo' };
  lendoRespostas = true;
  try {
    const ctx = await contextoIA();
    return await ia.lerRespostas({ loja: lojaLeitura, ctx, autonomia: ctx.autonomia, limite: 20 });
  } catch (e) {
    return { erro: String(e?.message || e) };
  } finally { lendoRespostas = false; }
}

/** Uma chamada de IA da tela: mede, registra em ia_acoes e nunca derruba a rota. */
async function chamadaIA(res, usuario, tipo, resumo, fn) {
  const inicio = Date.now();
  let ctx;
  try { ctx = await contextoIA(); } catch (e) { return api.send(res, e.status || 503, { erro: e.message }); }
  try {
    const r = await fn(ctx);
    await dados.registrarAcaoIA({
      tipo, status: 'proposta', perfil_id: usuario?.id, resumo: typeof resumo === 'function' ? resumo(r) : resumo,
      saida: r.__log ?? null, modelo: r.modelo, tokens_entrada: r.uso?.input_tokens ?? null,
      tokens_saida: r.uso?.output_tokens ?? null, duracao_ms: Date.now() - inicio,
    });
    delete r.__log; delete r.uso;
    return api.send(res, 200, r);
  } catch (e) {
    await dados.registrarAcaoIA({ tipo, status: 'erro', perfil_id: usuario?.id, resumo: 'Falhou', erro: String(e?.message || e), duracao_ms: Date.now() - inicio });
    const status = e?.name === 'TimeoutError' ? 504 : 502;
    return api.send(res, status, { erro: e?.name === 'TimeoutError' ? 'A IA demorou demais. Tente de novo.' : 'A IA não respondeu agora. Tente de novo em instantes.' });
  }
}

// ============================================================================
// PORTEIRO — mesmo login do CRM, da Agenda e do Atendimento
//   token válido → perfil ativo → acesso ao app (acesso.js) → segundo fator
// ============================================================================

const SUPA_URL  = process.env.SUPABASE_URL || '';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || '';
const SUPA_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const CACHE_LOGIN = new Map();

function cargaDoToken(token) {
  try {
    const [, carga] = token.split('.');
    return JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) || {};
  } catch { return {}; }
}

function lembrar(token, resultado, ms) {
  if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
  CACHE_LOGIN.set(token, { resultado, expira: Date.now() + ms });
  return resultado;
}

/** Perfil mudou (desativado, apps, senha trocada…): a próxima chamada confere de novo. */
function esquecerSessao(perfilId) {
  for (const [t, v] of CACHE_LOGIN) if (v.resultado?.usuario?.id === perfilId) CACHE_LOGIN.delete(t);
}

async function autenticar(req) {
  const auth = req.headers['authorization'] || '';
  const achado = /^\s*bearer\s+(\S+)\s*$/i.exec(auth);
  const token = achado ? achado[1] : null;
  if (!token) return { status: 401, codigo: 'sem_login', erro: 'Faça login para usar o Comunicar.' };
  if (!SUPA_URL || !SUPA_ANON || !SUPA_SRV) return { status: 503, codigo: 'sem_config', erro: 'O servidor está sem a configuração do Supabase.' };

  const lembrado = CACHE_LOGIN.get(token);
  if (lembrado && lembrado.expira > Date.now()) return lembrado.resultado;

  const carga = cargaDoToken(token);
  const vence = Number.isFinite(carga.exp) ? carga.exp * 1000 : 0;
  if (vence && vence <= Date.now()) return { status: 401, codigo: 'sessao_expirada', erro: 'Sua sessão expirou. Entre de novo.' };

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return lembrar(token, { status: 401, codigo: 'sessao_expirada', erro: 'Sua sessão expirou. Entre de novo.' }, 30_000);
    const u = await r.json();
    if (!u?.id) return lembrar(token, { status: 401, codigo: 'sessao_expirada', erro: 'Sua sessão expirou. Entre de novo.' }, 30_000);

    const perfil = await dados.perfilCompleto(u.id);
    const v = acesso.verificarAcesso(perfil);
    if (!v.ok) return lembrar(token, v, 30_000);
    // verificação em duas etapas: quem tem fator verificado precisa do código nesta sessão
    if (acesso.exigeSegundoFator(u, carga.aal)) return lembrar(token, { status: 401, codigo: 'mfa_pendente', erro: 'Digite o código do seu app autenticador.' }, 15_000);

    const usuario = {
      id: u.id, email: u.email, nome: perfil.nome, papel: perfil.papel, apps: perfil.apps || [],
      cargo: perfil.cargo, telefone: perfil.telefone, avatar_cor: perfil.avatar_cor,
      preferencias: perfil.preferencias || {}, precisa_trocar_senha: !!perfil.precisa_trocar_senha,
    };
    return lembrar(token, { usuario }, Math.min(60_000, (vence || Infinity) - Date.now()));
  } catch {
    return { status: 503, codigo: 'sem_conexao', erro: 'Não consegui conferir seu login agora. Tente de novo.' };
  }
}

// ============================================================================
// API (rotas.js) e arquivos estáticos
// ============================================================================

const api = criarApi({
  dados, ia, versao: VERSAO, runnerToken: RUNNER_TOKEN, https: EM_PRODUCAO, autenticar, esquecerSessao, chamadaIA, prefixo: PREFIXO,
  supabase: { url: SUPA_URL, anon: SUPA_ANON, configurado: !!(SUPA_URL && SUPA_ANON && SUPA_SRV) },
  whatsapp: { enviar: wa.enviar, status: wa.status, reconferir: reconferirWhatsapp },
  carteiro: { rodar: rodarCarteiro, lerRespostas: lerRespostasComIA, ultimaRodada: () => (ultimaRodada.em ? ultimaRodada : null) },
});

/* Rodada 4: arquivos da tela em memória, comprimidos e com ETag (estaticos.js). */
const serveStatic = criarEstaticos({ pasta: PUBLIC, mime: MIME, seguros: SEGUROS });

/**
 * O handler de tudo (exportado para a IndyCar Central). Aceita `req.prefixo`
 * ('/comunicar') ou a variável PREFIXO: o prefixo é tirado do caminho antes de
 * decidir entre API e arquivo. A Central pode também já mandar `req.url` sem o
 * prefixo — aí nada muda.
 */
export async function handler(req, res) {
  const inicio = Date.now();
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400, SEGUROS); return res.end(); }
  const prefixo = normalizarPrefixo(req.prefixo ?? PREFIXO);
  if (prefixo && (url.pathname === prefixo || url.pathname.startsWith(prefixo + '/'))) {
    url.pathname = url.pathname.slice(prefixo.length) || '/';
  }
  req.prefixo = prefixo;
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/')) {
      const ms = Date.now() - inicio;
      if (ms > 2000 || res.statusCode >= 500) console.log(`${req.method} ${url.pathname} → ${res.statusCode} em ${ms} ms`);
    }
  });
  try {
    if (url.pathname.startsWith('/api/')) return await api.api(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    api.erroInterno(res, e);
  }
}

// ============================================================================
// Servidor e agendadores — só quando este arquivo é o programa principal
// ============================================================================
const aviso = (onde) => (e) => console.error(`${onde}:`, e?.message || e);
let server = null, timerCarteiro = null, timerInicial = null;

/**
 * Liga os timers do carteiro (a cada 10 min + 15 s depois de subir). A Central
 * chama isto UMA vez para o Comunicar; sozinho, `iniciar()` chama.
 * No Render gratuito o servidor DORME — por isso o pg_cron do Supabase e o
 * GitHub Actions também chamam /api/rodar. CARTEIRO_DESLIGADO=1: nenhum timer.
 */
export function ligarCarteiro() {
  if (CARTEIRO_DESLIGADO || timerCarteiro) return false;
  timerCarteiro = setInterval(() => rodarCarteiro('timer').catch(aviso('Carteiro')), 10 * 60 * 1000);
  timerInicial = setTimeout(() => rodarCarteiro('inicio').catch(aviso('Carteiro')), 15 * 1000);
  return true;
}
export function desligarCarteiro() {
  clearInterval(timerCarteiro); clearTimeout(timerInicial);
  timerCarteiro = null; timerInicial = null;
}

function encerrar(sinal) {
  console.log(`\n  ${sinal}: encerrando com calma…`);
  desligarCarteiro();
  if (server) server.close(() => process.exit(0)); else process.exit(0);
  setTimeout(() => process.exit(0), 5000).unref();
}

export function iniciar({ porta = PORT } = {}) {
  conferirConfiguracao();
  if (CARTEIRO_DESLIGADO) console.warn('  ⏸  CARTEIRO_DESLIGADO=1: nenhum envio, nenhuma rodada automática.');
  if (!RUNNER_TOKEN) console.warn('  ⚠  RUNNER_TOKEN não definido: /api/rodar (carteiro externo) fica fechado.');
  if (PREFIXO) console.log(`  ↳ montado em ${PREFIXO}/ (PREFIXO)`);
  server = http.createServer(handler);
  server.headersTimeout = 30_000;
  server.requestTimeout = 60_000;
  ligarCarteiro();
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
  server.listen(porta, () => {
    console.log(`\n  🏁 IndyCar Comunicar v${VERSAO} rodando em http://localhost:${porta}${PREFIXO}/`);
    console.log('  Banco: Supabase (PostgREST) — o mesmo do CRM, Agenda e Atendimento\n');
  });
  return server;
}

const ehPrincipal = (() => { try { return process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url; } catch { return false; } })();
if (ehPrincipal) iniciar();
