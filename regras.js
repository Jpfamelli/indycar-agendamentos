// -----------------------------------------------------------------------------
// Regras de acesso e de situação da Agenda — funções PURAS (sem banco, sem rede).
// O server.js consulta estas regras em TODA rota; os testes (tests/regras.test.mjs)
// cobrem cada papel. Esconder botão na tela não protege nada: quem decide é aqui.
//
// Papéis (tabela perfis): admin · gestor · atendente · agenda (presença, Franklin).
// Acesso por app: admin sempre; os demais precisam de 'agenda' em perfis.apps.
// -----------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'node:crypto';

export const APP = 'agenda';
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const casa = (padrao) => new RegExp(`^${padrao.replace(/:id/g, UUID)}$`);

export const ehGestor = (papel) => papel === 'admin' || papel === 'gestor';
export const ehEquipe = (papel) => ['admin', 'gestor', 'atendente'].includes(papel);

/** Pode usar a Agenda? admin sempre; o resto precisa de 'agenda' em apps. */
export function podeUsarApp(perfil, app = APP) {
  if (!perfil || !perfil.ativo) return false;
  if (perfil.papel === 'admin') return true;
  const apps = Array.isArray(perfil.apps) ? perfil.apps : [];
  return apps.includes(app);
}

/* Papel 'agenda' (Franklin): entra SÓ para marcar presença. ALLOWLIST — o que
   não está aqui é 403. Sino e "minhas tarefas" entram (só as DELE). */
const ROTAS_DA_PRESENCA = [
  ['GET', '/api/perfil'], ['PUT', '/api/perfil'], ['POST', '/api/perfil/senha-trocada'],
  ['GET', '/api/empresa'], ['GET', '/api/saude'],
  ['GET', '/api/agendamentos'], ['PATCH', '/api/agendamentos/:id/status'],
  ['GET', '/api/notificacoes'], ['POST', '/api/notificacoes/lidas'],
  ['GET', '/api/tarefas'], ['PATCH', '/api/tarefas/:id'],
  // Pátio (16/10): o selo da etapa no cartão de quem chegou (só leitura)
  ['GET', '/api/patio/agendamentos'],
  // rodada 7 (C2): a entrada pronta no Pátio de quem acabou de chegar (sem telefone nem nome na resposta)
  ['GET', '/api/agendamentos/:id/entrada-patio'],
  ['PATCH', '/api/agendamentos/:id/motivo-falta'],
  ['GET', '/api/pre-agendamentos'], ['POST', '/api/parar'],
].map(([m, p]) => [m, casa(p)]);

export function rotaDaPresenca(metodo, rota) {
  return ROTAS_DA_PRESENCA.some(([m, re]) => m === metodo && re.test(rota));
}

/* Quem NÃO tem a Agenda nos apps ainda pode ler o próprio perfil (para a tela
   mostrar "Você não tem acesso" com os apps que ela pode usar) e terminar a
   troca obrigatória de senha. Mais nada. */
const ROTAS_SEM_APP = [['GET', '/api/perfil'], ['POST', '/api/perfil/senha-trocada'], ['GET', '/api/saude']]
  .map(([m, p]) => [m, casa(p)]);

/* Só gestor/admin: apagar (o RLS da base também só deixa gestor apagar),
   exportar, configuração da oficina/WhatsApp/IA/integrações e cadastro de
   consultores. A conta da equipe (cadastrar login, papel, apps) é só admin —
   conferido nas próprias rotas. */
const ROTAS_DE_GESTOR = [
  ['DELETE', '/api/agendamentos/:id'], ['DELETE', '/api/clientes/:id'], ['DELETE', '/api/consultores/:id'],
  ['DELETE', '/api/servicos/:id'], ['DELETE', '/api/whatsapp/templates/:id'],
  ['GET', '/api/export/agendamentos.csv'], ['GET', '/api/export/clientes.csv'],
  ['PUT', '/api/empresa'],
  ['PUT', '/api/whatsapp/config'], ['POST', '/api/whatsapp/testar'],
  ['PUT', '/api/whatsapp/ia/config'], ['POST', '/api/codewords/run'],
  ['GET', '/api/integracoes'], ['PUT', '/api/integracoes'], ['POST', '/api/integracoes/testar-webhook'],
  ['POST', '/api/consultores'], ['PUT', '/api/consultores/:id'],
  ['POST', '/api/servicos'], ['PUT', '/api/servicos/:id'],
  ['GET', '/api/equipe/nomes'],
  ['GET', '/api/auditoria'],
  // rodada 4: painel de valores, pendências antigas e consultor ↔ login
  ['GET', '/api/valores/pendentes'], ['PUT', '/api/agendamentos/:id/valor'],
  ['GET', '/api/pendencias-antigas'],
  ['GET', '/api/consultores/sugestoes-login'], ['POST', '/api/consultores/distribuir'],
  // Pátio (16/10): carros entregues sem desfecho na Agenda (Pendências)
  ['GET', '/api/patio/entregues'],
  // rodada 5: apagar da lista de espera (cancelar/agendar é da equipe; apagar é do gestor); resumo das confirmações
  ['DELETE', '/api/espera/:id'], ['GET', '/api/confirmacoes/resumo'],
  // rodada 7: relatório do dono (ocupação, faltas, por consultor)
  ['GET', '/api/relatorios/dono'],
].map(([m, p]) => [m, casa(p)]);

export function rotaDeGestor(metodo, rota) {
  return ROTAS_DE_GESTOR.some(([m, re]) => m === metodo && re.test(rota));
}

/**
 * Decide se a pessoa pode chamar a rota. null = pode; senão {status, codigo, erro}.
 *   perfil  { papel, ativo, apps } (já conferido pelo token) ou null
 */
export function decidirAcesso({ perfil, metodo, rota }) {
  if (!perfil) return { status: 401, codigo: 'sem_login', erro: 'Faça login para usar a Agenda.' };
  if (!perfil.ativo) {
    return { status: 403, codigo: 'desativado', erro: 'Seu acesso foi desativado. Fale com o administrador.' };
  }
  if (!podeUsarApp(perfil)) {
    if (ROTAS_SEM_APP.some(([m, re]) => m === metodo && re.test(rota))) return null;
    return { status: 403, codigo: 'sem_acesso_app', erro: 'Você não tem acesso à Agenda. Peça ao administrador para liberar.' };
  }
  if (perfil.papel === 'agenda') {
    if (rotaDaPresenca(metodo, rota)) return null;
    return { status: 403, codigo: 'so_presenca', erro: 'Seu acesso é só para marcar presença na agenda de hoje.' };
  }
  if (rotaDeGestor(metodo, rota) && !ehGestor(perfil.papel)) {
    return { status: 403, codigo: 'so_gestor', erro: 'Só o gestor ou o administrador pode fazer isso.' };
  }
  return null;
}

/* ---------------------------------------------------------------------------
   AVISO DE FALTA PELA EDIÇÃO
   O gatilho do banco (agendamentos_no_show) manda o WhatsApp de falta sempre
   que o status VIRA nao_veio com no_show_notificado_em vazio. O cartão já
   carimba o campo quando ele mesmo envia. Pela EDIÇÃO isso disparava sem
   ninguém querer — então a edição só vira "Não veio" com resposta explícita:
     avisar_cliente: true  → mesmo fluxo do cartão (envia uma vez e carimba)
     avisar_cliente: false → carimba junto, o gatilho não dispara
     sem resposta          → 409 pedindo a confirmação
   --------------------------------------------------------------------------- */
export function decidirNaoVeioNaEdicao(antes, corpo) {
  if (!corpo || corpo.status !== 'nao_veio' || antes?.status === 'nao_veio') return { acao: 'nada' };
  if (antes?.no_show_notificado_em) return { acao: 'nada' };          // já carimbado: o gatilho não dispara
  if (corpo.no_show_notificado_em) return { acao: 'carimbar' };       // desfazer remarcação devolve o carimbo
  if (corpo.avisar_cliente === true) return { acao: 'avisar' };
  if (corpo.avisar_cliente === false) return { acao: 'carimbar' };
  return { acao: 'perguntar' };
}

/* ---------------------------------------------------------------------------
   PRESENÇA (papel 'agenda', o Franklin na recepção) — o que ele pode marcar:
     · "Chegou" (compareceu) e "Não veio" — se o cliente ainda não tem desfecho
       comercial (Veio e fechou / Veio e não fechou são do atendimento);
     · DESFAZER uma chegada marcada por engano: de "compareceu" de volta para
       "aguardando"/"confirmado" (só isso — "Não veio" já mandou o WhatsApp de
       falta e não tem volta por aqui).
   Devolve null (pode) ou o recado da recusa.
   --------------------------------------------------------------------------- */
export function presencaPodeMarcar(statusAntes, statusNovo) {
  if (['concluido', 'nao_fechou'].includes(statusAntes)) {
    return 'Este cliente já tem o desfecho registrado pelo atendimento. Só o painel principal pode mudar.';
  }
  // quem já chegou não vira "Não veio" por aqui: o aviso de falta sairia no WhatsApp de um cliente que está na oficina
  if (statusNovo === 'nao_veio' && ['compareceu', 'em_atendimento'].includes(statusAntes)) return 'Esse cliente já chegou. Para corrigir, use "Desfazer chegada" no cartão dele.';
  if (['compareceu', 'nao_veio'].includes(statusNovo)) return null;
  if (['aguardando', 'confirmado'].includes(statusNovo) && statusAntes === 'compareceu') return null;
  return 'Seu acesso só permite marcar se o cliente veio ou não.';
}

export const DESFECHOS = new Set(['concluido', 'nao_fechou', 'nao_veio']);
/** Mudar um desfecho JÁ registrado (Veio e fechou / não fechou / Não veio) é ação sensível: vai para a auditoria. */
export function mudaDesfechoRegistrado(statusAntes, statusNovo) {
  return DESFECHOS.has(statusAntes) && !!statusNovo && statusNovo !== statusAntes;
}

/* ---------------------------------------------------------------------------
   CORS — só os domínios do ecossistema. Mesmo domínio passa sempre.
   --------------------------------------------------------------------------- */
export const ORIGENS_DO_ECOSSISTEMA = [
  'https://indycar-agendamentos.onrender.com', 'https://indycar-atendimento.onrender.com',
  'https://indycar-crm.onrender.com', 'https://indycar-posvenda.onrender.com',
  'https://indycar-orcador.netlify.app', 'https://indycar-taubate.netlify.app',
];
export function origemPermitida(origem, host) {
  if (!origem) return true;                              // sem Origin: navegação ou servidor
  try {
    const u = new URL(origem);
    if (u.host === host) return true;                    // mesmo domínio
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.host) && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host || '')) return true;
    return ORIGENS_DO_ECOSSISTEMA.includes(u.origin);
  } catch { return false; }
}

/** Erro que pode ir para a tela? Só os nossos (em português); o resto vira genérico. */
export function mensagemSegura(e, rid = '') {
  const status = Number.isInteger(e?.status) && e.status >= 400 && e.status < 600 ? e.status : 500;
  if (e?.publico || (status >= 400 && status < 500 && e?.name !== 'ErroSupabase')) return { status, erro: String(e?.message || 'Requisição inválida.') };
  // `new Error('…')` do nosso código (dados.js) é recado em português para quem digitou:
  // "Data em formato inválido.", "Aniversário inválido…". TypeError & cia. são bug: genérico.
  if (e && e.name === 'Error' && e.constructor === Error && !e.status) return { status: 400, erro: String(e.message) };
  // configuração faltando (SUPABASE_URL…) é recado para quem instala, não detalhe interno
  if (e?.name === 'ErroSupabase' && e.status === 0 && /não configurado/.test(String(e.message))) return { status: 500, erro: e.message };
  if (e?.name === 'ErroSupabase' && /consultores_perfil_uk/i.test(String(e.detalhe || e.message))) {
    return { status: 409, erro: 'Esse login já está ligado a outro consultor. Desligue lá primeiro (Equipe › editar o outro consultor).' };
  }
  if (e?.name === 'ErroSupabase' && /23505|duplicate key|slot_uk/i.test(String(e.detalhe || e.message))) {
    return { status: 409, erro: 'Esse consultor já tem um carro nesse horário. Escolha outro consultor ou outro horário.' };
  }
  return { status: e?.name === 'ErroSupabase' || status >= 500 ? 500 : status, erro: `Algo deu errado do nosso lado. Tente de novo em instantes${rid ? ` (código ${rid})` : ''}.` };
}

// -----------------------------------------------------------------------------
// 16/10 (decisão do João): WhatsApp — timeout ou conexão caída DEPOIS de mandar o
// pedido ao CodeWords = "não sabemos se chegou". O aviso de falta NÃO fica liberado
// para sair de novo no próximo clique (o cliente receberia dois); recusa ANTES de
// enviar (DNS, conexão recusada, TLS) continua liberando como antes.
// -----------------------------------------------------------------------------
const RE_ANTES_DE_ENVIAR = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT|ERR_TLS|CERT_|ERR_INVALID_URL/i;
const RE_CAIU_NO_MEIO = /ECONNRESET|EPIPE|ECONNABORTED|UND_ERR_SOCKET|UND_ERR_CLOSED|other side closed|socket hang up|terminated/i;
export function semConfirmacaoDoErro(e) {
  if (!e) return false;
  if (e.name === 'TimeoutError' || e.name === 'AbortError' || e?.cause?.name === 'TimeoutError') return true;
  const t = [e.code, e.message, e.cause?.code, e.cause?.message].filter(Boolean).join(' ');
  if (RE_ANTES_DE_ENVIAR.test(t)) return false;
  return RE_CAIU_NO_MEIO.test(t);
}


/* ---------------------------------------------------------------------------
   RODADA 9: validações puras das telas de cadastro e do webhook de saída.
   Tudo aqui devolve { ok:true, ... } ou { ok:false, erro } com o recado em português.
   --------------------------------------------------------------------------- */

/** Endereço de webhook que o SERVIDOR vai chamar: só https, com nome de domínio público.
    Sem isso, quem salva o endereço fazia o servidor bater em máquina interna (localhost, 10.x, 169.254.x). */
export function urlDeWebhookSegura(valor) {
  const txt = typeof valor === 'string' ? valor.trim() : '';
  if (!txt) return { ok: false, erro: 'Informe o endereço do webhook.' };
  if (txt.length > 500) return { ok: false, erro: 'Endereço do webhook longo demais (até 500 letras).' };
  let u;
  try { u = new URL(txt); } catch { return { ok: false, erro: 'Endereço do webhook inválido. Ele começa com https://' }; }
  if (u.protocol !== 'https:') return { ok: false, erro: 'O endereço do webhook precisa começar com https://' };
  if (u.username || u.password) return { ok: false, erro: 'O endereço do webhook não pode levar usuário e senha.' };
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const interno = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
    || !host.includes('.')                        // nome de máquina da rede, sem domínio
    || /^\d+(\.\d+){3}$/.test(host)               // qualquer IP escrito em números (127.0.0.1, 10.x, 169.254.169.254…)
    || host.includes(':');                        // IPv6 literal
  if (interno) return { ok: false, erro: 'Use o endereço público do serviço (Zapier, Make, n8n). Endereço de rede interna não é aceito.' };
  return { ok: true, url: u.toString() };
}

/** Serviço do catálogo: nome de verdade, preço que não é negativo e duração entre 5 min e 24 h.
    `parcial` = edição (só confere o que veio). Devolve os campos já limpos em `campos`. */
export function validarServico(corpo, { parcial = false } = {}) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const campos = {};
  if (!parcial || c.nome !== undefined) {
    const nome = typeof c.nome === 'string' ? c.nome.trim() : '';
    if (!nome) return { ok: false, erro: 'Informe o nome do serviço.' };
    if (nome.length > 120) return { ok: false, erro: 'Nome do serviço longo demais (até 120 letras).' };
    campos.nome = nome;
  }
  if (c.preco !== undefined && c.preco !== null && c.preco !== '') {
    const p = Number(c.preco);
    if (!Number.isFinite(p) || p < 0 || p > 1_000_000) return { ok: false, erro: 'Preço inválido. Use um valor de 0 a 1.000.000.' };
    campos.preco = p;
  }
  if (c.duracao_min !== undefined && c.duracao_min !== null && c.duracao_min !== '') {
    const d = Number(c.duracao_min);
    if (!Number.isInteger(d) || d < 5 || d > 1440) return { ok: false, erro: 'Duração inválida. Use de 5 a 1440 minutos.' };
    campos.duracao_min = d;
  }
  if (c.descricao !== undefined && c.descricao !== null && String(c.descricao).length > 500) return { ok: false, erro: 'Descrição longa demais (até 500 letras).' };
  return { ok: true, campos };
}

/** Modelo de mensagem do WhatsApp: nome e texto de verdade, com tamanho que o WhatsApp aceita. */
export function validarModelo(corpo, { parcial = false } = {}) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const campos = {};
  for (const [k, max, falta, longo] of [
    ['nome', 80, 'Informe o nome do modelo.', 'Nome do modelo longo demais (até 80 letras).'],
    ['corpo', 2000, 'Escreva o texto do modelo.', 'Texto do modelo longo demais (até 2000 letras).'],
  ]) {
    if (parcial && c[k] === undefined) continue;
    const v = typeof c[k] === 'string' ? c[k].trim() : '';
    if (!v) return { ok: false, erro: falta };
    if (v.length > max) return { ok: false, erro: longo };
    campos[k] = v;
  }
  if (c.gatilho !== undefined && !/^[a-z_]{1,40}$/.test(String(c.gatilho))) return { ok: false, erro: 'Gatilho inválido.' };
  return { ok: true, campos };
}

/** Dados da oficina (Configurações): tamanhos que cabem no topo da tela e telefone com DDD. */
export function validarEmpresa(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const txt = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  const nome = txt(c.nome);
  if (!nome) return { ok: false, erro: 'Informe o nome da oficina.' };
  if (nome.length > 120) return { ok: false, erro: 'Nome da oficina longo demais (até 120 letras).' };
  if (txt(c.endereco).length > 200) return { ok: false, erro: 'Endereço longo demais (até 200 letras).' };
  if (txt(c.slogan).length > 120) return { ok: false, erro: 'Frase da oficina longa demais (até 120 letras).' };
  const tel = txt(c.telefone).replace(/\D/g, '');
  if (tel && (tel.length < 10 || tel.length > 13)) return { ok: false, erro: 'Telefone incompleto: use DDD + número, ex.: (12) 99999-9999.' };
  return { ok: true, campos: { nome, endereco: txt(c.endereco), slogan: txt(c.slogan), telefone: txt(c.telefone) } };
}

/* ---------------------------------------------------------------------------
   RODADA 10: conexões, segurança e desempenho. Funções puras; quem chama é o server.js.
   --------------------------------------------------------------------------- */

/** Compara dois segredos sem entregar, pelo tempo de resposta, quantas letras bateram. Vazio nunca é igual. */
export function igualSeguro(a, b) {
  const x = Buffer.from(typeof a === 'string' ? a : ''), y = Buffer.from(typeof b === 'string' ? b : '');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** Token de verificação do webhook da Meta: 12 a 120 letras, sem espaço. O padrão antigo ("indycar") era o
    mesmo em toda instalação e estava escrito no código: quem soubesse assinava o webhook no lugar da oficina. */
export function tokenDeVerificacaoValido(t) {
  return typeof t === 'string' && t.length >= 12 && t.length <= 120 && !/\s/.test(t) && t.toLowerCase() !== 'indycar';
}

/** A Meta assina cada entrega com o segredo do app (cabeçalho X-Hub-Signature-256: "sha256=<hmac do corpo cru>"). */
export function assinaturaDaMetaConfere(bruto, cabecalho, segredo) {
  if (!segredo || !Buffer.isBuffer(bruto)) return false;
  const veio = /^sha256=([0-9a-f]{64})$/i.exec(String(cabecalho || '').trim());
  if (!veio) return false;
  return igualSeguro(veio[1].toLowerCase(), createHmac('sha256', String(segredo)).update(bruto).digest('hex'));
}

/** As situações que uma mensagem do histórico pode ter. Fora disso nada é gravado (o texto ia direto para a tela). */
export const SITUACOES_DE_MENSAGEM = ['pendente', 'enviado', 'entregue', 'lido', 'falhou', 'recebido'];
const RECIBO_DA_META = { sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'falhou' };

/** Lê uma entrega do webhook da Meta e devolve só o que pode ir para o banco:
    { mensagem: { telefone, nome, texto } | null, recibo: { wamid, status } | null }. */
export function lerWebhookDaMeta(corpo) {
  const valor = corpo?.entry?.[0]?.changes?.[0]?.value;
  const saida = { mensagem: null, recibo: null };
  if (!valor || typeof valor !== 'object') return saida;
  const msg = Array.isArray(valor.messages) ? valor.messages[0] : null;
  if (msg && typeof msg === 'object') {
    const telefone = typeof msg.from === 'string' ? msg.from.replace(/\D/g, '') : '';
    if (telefone.length >= 10 && telefone.length <= 15) {
      const tipo = typeof msg.type === 'string' && /^[a-z_]{1,20}$/.test(msg.type) ? msg.type : 'mensagem';
      const corpoTxt = typeof msg.text?.body === 'string' ? msg.text.body.trim() : '';
      const nome = valor.contacts?.[0]?.profile?.name;
      saida.mensagem = { telefone, nome: typeof nome === 'string' && nome.trim() ? nome.trim().slice(0, 120) : null,
        texto: corpoTxt ? corpoTxt.slice(0, 4096) : `[${tipo}]` };
    }
  }
  const st = Array.isArray(valor.statuses) ? valor.statuses[0] : null;
  if (st && typeof st.id === 'string' && st.id.length > 0 && st.id.length <= 200 && RECIBO_DA_META[st.status]) {
    saida.recibo = { wamid: st.id, status: RECIBO_DA_META[st.status] };
  }
  return saida;
}
