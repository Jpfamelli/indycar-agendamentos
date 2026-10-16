// -----------------------------------------------------------------------------
// Acesso do IndyCar Comunicar — tudo PURO (sem banco), testado em `npm test`.
//   • quem entra: papel da equipe + 'comunicar' em perfis.apps (admin sempre)
//   • o que cada papel pode fazer (PERMISSOES) e a regra de CADA rota (ROTAS)
//   • limite por usuário/IP (relógio injetável), CORS do ecossistema,
//     cabeçalhos de segurança e leitura de JSON com erro claro
// O servidor confere tudo isto em toda chamada — a tela só esconde botão.
// -----------------------------------------------------------------------------

import './public/apps.js'; // rodada 5: endereços dos apps num módulo só (tela e servidor)

export const APP = 'comunicar';
export const PAPEIS_EQUIPE = ['admin', 'gestor', 'atendente'];
export const ehGestor = (u) => u?.papel === 'admin' || u?.papel === 'gestor';
export const ehAdmin = (u) => u?.papel === 'admin';

/* Endereços dos apps do ecossistema (links do sino e tela "sem acesso") — vêm de public/apps.js. */
export const APPS = Object.fromEntries(Object.entries(globalThis.IndyApps.APPS)
  .filter(([k]) => ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'patio', 'ads'].includes(k))
  .map(([k, v]) => [k, { nome: v.nome, url: v.url }]));
export const LINKS = globalThis.IndyApps.LINKS;

/**
 * Quem pode usar o Comunicar. Devolve { ok } ou { ok:false, status, codigo, erro, apps }.
 *   • sem perfil / desativado → 401 (volta ao login com aviso)
 *   • papel 'agenda' (só presença) ou papel desconhecido → 403
 *   • não admin sem 'comunicar' em perfis.apps → 403 com a lista do que ela pode usar
 */
export function verificarAcesso(perfil) {
  if (!perfil) return { ok: false, status: 401, codigo: 'sem_perfil', erro: 'Seu usuário não tem perfil na equipe. Fale com o administrador.' };
  if (perfil.ativo === false) return { ok: false, status: 401, codigo: 'desativado', erro: 'Seu acesso foi desativado. Fale com o administrador.' };
  const apps = Array.isArray(perfil.apps) ? perfil.apps.filter((a) => APPS[a]) : [];
  const links = apps.filter((a) => a !== APP).map((a) => ({ app: a, ...APPS[a] })).filter((a) => a.url);
  if (perfil.papel === 'agenda') return { ok: false, status: 403, codigo: 'sem_acesso', erro: 'Você não tem acesso a este app.', apps: links.length ? links : [{ app: 'agenda', ...APPS.agenda }] };
  if (!PAPEIS_EQUIPE.includes(perfil.papel)) return { ok: false, status: 403, codigo: 'sem_acesso', erro: 'Você não tem acesso a este app.', apps: links };
  if (perfil.papel !== 'admin' && !apps.includes(APP)) return { ok: false, status: 403, codigo: 'sem_acesso', erro: 'Você não tem acesso a este app.', apps: links };
  return { ok: true };
}

/* O que cada papel faz no Comunicar. 'equipe' = admin|gestor|atendente; 'gestor' = admin|gestor. */
export const PERMISSOES = {
  ver: 'equipe',               // telas, listas, relatórios
  avulsa: 'equipe',            // mandar mensagem para UM cliente
  campanha_propor: 'equipe',   // atendente propõe campanha (fica aguardando aprovação)
  campanha_aprovar: 'gestor',  // aprovar/recusar, ou criar campanha que já sai
  cancelar_proprio: 'equipe',  // cancelar/reenviar o que a própria pessoa mandou
  cancelar_qualquer: 'gestor', // cancelar/reenviar mensagens de régua e de outros
  reguas: 'gestor',            // ligar/desligar régua, mudar texto, janela, regras de revisão
  teste: 'gestor',             // mandar teste de WhatsApp
  rodar: 'gestor',             // "Rodar agora" e "Ler respostas agora"
  exportar: 'gestor',          // CSV do histórico (telefones de todos)
  importar: 'gestor',          // importar planilha de clientes
  optout_desligar: 'equipe',   // cliente pediu para não receber: qualquer um respeita
  optout_religar: 'gestor',    // voltar a mandar para quem saiu da lista
  cliente_editar: 'equipe',    // aniversário, observação
  satisfacao_registrar: 'equipe',
  satisfacao_apagar: 'gestor',
  ia: 'equipe',                // escrever com IA, sugerir público, resumo
  conta: 'logado',             // meu perfil, sino, minhas tarefas (até com troca de senha pendente)
  // rodada 5
  teste_proprio: 'equipe',     // mandar o texto de uma campanha para o PRÓPRIO celular (perfis.telefone)
  segmentos_salvar: 'equipe',  // guardar um segmento com nome para reutilizar
  segmentos_apagar: 'gestor',  // apagar segmento salvo por outra pessoa
};

export function pode(usuario, permissao) {
  const regra = PERMISSOES[permissao];
  if (!regra || !usuario) return false;                      // permissão desconhecida: fecha
  if (regra === 'logado') return true;
  if (regra === 'equipe') return PAPEIS_EQUIPE.includes(usuario.papel);
  if (regra === 'gestor') return ehGestor(usuario);
  return false;
}

/* Texto do 403 por permissão (o mesmo que a tela mostra). */
export const MOTIVO_403 = {
  reguas: 'Só gestor altera as réguas.',
  teste: 'Só gestor pode mandar teste.',
  rodar: 'Só gestor dispara o carteiro e a leitura agora.',
  exportar: 'Só gestor exporta o histórico.',
  importar: 'Só gestor importa planilha de clientes.',
  campanha_aprovar: 'Só gestor aprova campanhas.',
  optout_religar: 'Só gestor volta a mandar mensagem para quem saiu da lista.',
  satisfacao_apagar: 'Só gestor apaga registro de satisfação.',
  cancelar_qualquer: 'Só gestor mexe em mensagem de régua ou de outra pessoa.',
  segmentos_apagar: 'Só gestor apaga segmento salvo por outra pessoa.',
};
export const motivo403 = (permissao) => MOTIVO_403[permissao] || 'Você não tem permissão para isso.';

const U = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
/**
 * TODAS as rotas da API com a permissão mínima. Rota que não está aqui = 404
 * (fecha por padrão). `publica` = sem login; `caro` = conta no limite apertado.
 * Algumas rotas refinam por dentro (ex.: POST /api/envios decide entre avulsa,
 * campanha direta e proposta; PUT /api/clientes/:id confere o opt-out).
 */
export const ROTAS = [
  ['GET',    '/api/config',                              { publica: true }],
  ['GET',    '/api/ping',                                { publica: true }],
  ['POST',   '/api/rodar',                               { publica: true, token: true }],
  ['GET',    '/api/perfil',                              { perm: 'conta' }],
  ['PUT',    '/api/perfil',                              { perm: 'conta' }],
  ['POST',   '/api/perfil/senha-trocada',                { perm: 'conta' }],
  ['GET',    '/api/notificacoes',                        { perm: 'conta' }],
  ['POST',   '/api/notificacoes/lidas',                  { perm: 'conta' }],
  ['POST',   `/api/notificacoes/${U}/lida`,              { perm: 'conta' }],
  ['GET',    '/api/tarefas',                             { perm: 'conta' }],
  ['POST',   '/api/tarefas',                             { perm: 'ver' }],
  ['POST',   `/api/tarefas/${U}/concluir`,               { perm: 'ver' }],
  ['GET',    '/api/resumo',                              { perm: 'ver' }],
  ['GET',    '/api/saude',                               { perm: 'ver' }],
  ['GET',    '/api/whatsapp/status',                     { perm: 'ver' }],
  ['GET',    '/api/clientes',                            { perm: 'ver' }],
  ['PUT',    `/api/clientes/${U}`,                       { perm: 'cliente_editar' }],
  ['GET',    `/api/clientes/${U}/ficha`,                 { perm: 'ver' }],
  ['POST',   '/api/clientes/importar',                   { perm: 'importar', caro: true }],
  ['GET',    '/api/segmentos',                           { perm: 'ver' }],
  ['GET',    '/api/segmentos/previa',                    { perm: 'ver' }],
  ['GET',    '/api/envios',                              { perm: 'ver' }],
  ['POST',   '/api/envios',                              { perm: 'avulsa', caro: true }],
  ['POST',   `/api/envios/${U}/cancelar`,                { perm: 'cancelar_proprio' }],
  ['POST',   `/api/envios/${U}/reenviar`,                { perm: 'cancelar_proprio' }],
  ['POST',   `/api/envios/${U}/desfazer-cancelamento`,   { perm: 'cancelar_proprio' }],
  ['POST',   `/api/envios/${U}/encaminhar`,              { perm: 'ver' }],
  ['POST',   '/api/envios/teste',                        { perm: 'teste', caro: true }],
  ['GET',    '/api/envios.csv',                          { perm: 'exportar', caro: true }],
  ['GET',    '/api/campanhas/aprovacao',                 { perm: 'ver' }],
  ['POST',   `/api/campanhas/${U}/aprovar`,              { perm: 'campanha_aprovar', caro: true }],
  ['POST',   `/api/campanhas/${U}/recusar`,              { perm: 'campanha_aprovar' }],
  ['POST',   `/api/campanhas/${U}/cancelar`,             { perm: 'campanha_propor' }],
  ['POST',   '/api/rodar-agora',                         { perm: 'rodar', caro: true }],
  ['GET',    '/api/previa',                              { perm: 'ver' }],
  ['GET',    '/api/comunicar/config',                    { perm: 'ver' }],
  ['GET',    '/api/posvenda/config',                     { perm: 'ver' }],
  ['PUT',    '/api/comunicar/config',                    { perm: 'reguas' }],
  ['PUT',    '/api/posvenda/config',                     { perm: 'reguas' }],
  ['GET',    '/api/regras-retorno',                      { perm: 'ver' }],
  ['POST',   '/api/regras-retorno',                      { perm: 'reguas' }],
  ['PUT',    `/api/regras-retorno/${U}`,                 { perm: 'reguas' }],
  ['DELETE', `/api/regras-retorno/${U}`,                 { perm: 'reguas' }],
  ['GET',    '/api/relatorio',                           { perm: 'ver' }],
  ['GET',    '/api/intencoes',                           { perm: 'ver' }],
  ['GET',    '/api/aniversarios',                        { perm: 'ver' }],
  ['GET',    '/api/ia/status',                           { perm: 'ver' }],
  ['POST',   '/api/ia/escrever',                         { perm: 'ia', caro: true }],
  ['POST',   '/api/ia/publico',                          { perm: 'ia', caro: true }],
  ['GET',    '/api/ia/resumo',                           { perm: 'ver' }],
  ['POST',   '/api/ia/resumo',                           { perm: 'ia', caro: true }],
  ['POST',   '/api/ia/ler-respostas',                    { perm: 'rodar', caro: true }],
  ['GET',    '/api/modelos',                             { perm: 'ver' }],
  ['GET',    '/api/satisfacao',                          { perm: 'ver' }],
  ['POST',   '/api/satisfacao',                          { perm: 'satisfacao_registrar' }],
  ['DELETE', `/api/satisfacao/${U}`,                     { perm: 'satisfacao_apagar' }],
  // rodada 4
  ['GET',    '/api/carteiro',                            { perm: 'ver' }],
  ['GET',    '/api/fila/contagem',                       { perm: 'ver' }],
  ['GET',    '/api/pronto',                              { perm: 'ver' }],
  ['GET',    '/api/projecao',                            { perm: 'ver' }],
  ['POST',   '/api/aniversarios/analisar',               { perm: 'cliente_editar', caro: true }],
  ['POST',   '/api/aniversarios/gravar',                 { perm: 'cliente_editar', caro: true }],
  ['GET',    '/api/aniversarios/sugestoes',              { perm: 'ver' }],
  ['POST',   '/api/pedir-gestor',                        { perm: 'ver', caro: true }],
  ['GET',    '/api/equipe/indicadores',                  { perm: 'ver' }],
  // rodada 5
  ['GET',    '/api/whatsapp/saude',                      { perm: 'ver' }],
  ['POST',   '/api/whatsapp/reconferir',                 { perm: 'rodar', caro: true }],
  ['GET',    '/api/segmentos/salvos',                    { perm: 'ver' }],
  ['POST',   '/api/segmentos/salvos',                    { perm: 'segmentos_salvar' }],
  ['DELETE', `/api/segmentos/salvos/${U}`,               { perm: 'segmentos_salvar' }],
  ['POST',   '/api/envios/teste-meu',                    { perm: 'teste_proprio', caro: true }],
  ['GET',    '/api/clientes/360',                        { perm: 'ver' }],
  ['GET',    `/api/envios/${U}/ligacoes`,                { perm: 'ver' }],
  ['GET',    '/api/relatorio/reguas',                    { perm: 'ver' }],
  ['GET',    '/api/previa/mensagem',                     { perm: 'ver' }],
].map(([metodo, padrao, regra]) => ({ metodo, padrao, re: new RegExp(`^${padrao}$`), ...regra }));

/** A regra da rota (ou null = não existe). `metodoErrado` quando o caminho existe com outro método. */
export function regraDaRota(metodo, caminho) {
  let existe = false;
  for (const r of ROTAS) {
    if (!r.re.test(caminho)) continue;
    existe = true;
    if (r.metodo === metodo) return r;
  }
  return existe ? { metodoErrado: true } : null;
}

// ---- limite por usuário/IP (janela deslizante simples, relógio injetável) ----
export function criarLimitador({ janelaMs = 60_000, max = 60, relogio = () => Date.now(), tamanhoMax = 5000 } = {}) {
  const baldes = new Map();
  return {
    /** true = pode; false = passou do limite. Devolve também quanto falta. */
    tentar(chave) {
      const agora = relogio();
      let b = baldes.get(chave);
      if (!b || agora - b.inicio >= janelaMs) { b = { inicio: agora, n: 0 }; baldes.set(chave, b); }
      b.n++;
      if (baldes.size > tamanhoMax) { // faxina: joga fora as janelas vencidas
        for (const [k, v] of baldes) if (agora - v.inicio >= janelaMs) baldes.delete(k);
      }
      const ok = b.n <= max;
      return { ok, restante: Math.max(0, max - b.n), esperaS: ok ? 0 : Math.ceil((b.inicio + janelaMs - agora) / 1000) };
    },
    limpar() { baldes.clear(); },
  };
}

// ---- CORS: só os domínios do ecossistema ------------------------------------
export const ORIGENS_PERMITIDAS = new Set([
  'https://indycar-posvenda.onrender.com', 'https://indycar-atendimento.onrender.com',
  'https://indycar-crm.onrender.com', 'https://indycar-agendamentos.onrender.com',
  'https://indycar-orcador.netlify.app', 'https://indycar-taubate.netlify.app',
]);
export function origemPermitida(origem, extras = []) {
  if (!origem) return false;
  if (ORIGENS_PERMITIDAS.has(origem) || extras.includes(origem)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem); // desenvolvimento local
}

// ---- cabeçalhos de segurança ------------------------------------------------
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

export function cabecalhosSeguros({ https = false } = {}) {
  const c = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Content-Security-Policy': CSP,
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (https) c['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return c;
}

/** JSON do corpo: {} se vazio; { __invalido } se não é JSON; { __grande } se passou do limite. */
export function lerJson(texto) {
  if (!texto || !String(texto).trim()) return {};
  try {
    const v = JSON.parse(texto);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { __invalido: true };
  } catch { return { __invalido: true }; }
}

/** IP de quem chamou (o Render põe o cliente no primeiro x-forwarded-for). */
export function ipDe(req) {
  const xf = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || 'desconhecido';
}

/** Último acesso: grava no máximo a cada 5 min por pessoa. */
export function criarMarcadorDeAcesso({ intervaloMs = 5 * 60_000, relogio = () => Date.now() } = {}) {
  const vistos = new Map();
  return (perfilId) => {
    const agora = relogio();
    if (vistos.has(perfilId) && agora - vistos.get(perfilId) < intervaloMs) return false;
    vistos.set(perfilId, agora);
    if (vistos.size > 2000) vistos.clear();
    return true;
  };
}

/** A sessão exige o segundo fator? (fator TOTP verificado e token ainda aal1) */
export function exigeSegundoFator(usuarioAuth, aalDoToken) {
  const verificados = (usuarioAuth?.factors || []).filter((f) => f?.status === 'verified');
  return verificados.length > 0 && aalDoToken !== 'aal2';
}

/** Campos do perfil que a própria pessoa pode mudar pelo Comunicar. */
export function camposDoMeuPerfil(corpo = {}) {
  const c = {};
  if (corpo.nome !== undefined) {
    const n = String(corpo.nome || '').trim().replace(/\s+/g, ' ');
    if (n.length < 2 || n.length > 80) return { erro: 'Nome precisa ter de 2 a 80 letras.' };
    c.nome = n;
  }
  if (corpo.cargo !== undefined) c.cargo = String(corpo.cargo || '').trim().slice(0, 60) || null;
  if (corpo.telefone !== undefined) {
    const t = String(corpo.telefone || '').replace(/\D/g, '');
    if (t && (t.length < 10 || t.length > 13)) return { erro: 'Telefone com DDD, só números.' };
    c.telefone = t || null;
  }
  if (corpo.avatar_cor !== undefined) {
    if (corpo.avatar_cor && !/^#[0-9a-fA-F]{6}$/.test(corpo.avatar_cor)) return { erro: 'Cor inválida.' };
    c.avatar_cor = corpo.avatar_cor || null;
  }
  if (corpo.preferencias !== undefined) {
    const p = corpo.preferencias && typeof corpo.preferencias === 'object' ? corpo.preferencias : {};
    const notif = {};
    for (const k of TIPOS_NOTIFICACAO) if (typeof p.notificacoes?.[k] === 'boolean') notif[k] = p.notificacoes[k];
    c.preferencias = { notificacoes: notif };
  }
  return { campos: c };
}

/** Tipos de aviso do Comunicar que a pessoa pode desligar (Meu perfil › Notificações). */
export const TIPOS_NOTIFICACAO = ['reclamacao', 'aprovacao', 'falhas', 'resumo_semanal'];

/**
 * Rodada 4: merge PROFUNDO das preferências. perfis.preferencias é de TODOS os
 * apps (Agenda, CRM, Atendimento…): gravar o jsonb inteiro apagaria o que os
 * outros guardaram. Objetos se juntam chave a chave; o resto (número, texto,
 * lista, null) é trocado pelo novo. Não altera os originais.
 */
export function mesclarPreferencias(atual, novo) {
  const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!ehObj(novo)) return ehObj(atual) ? { ...atual } : {};
  const saida = ehObj(atual) ? { ...atual } : {};
  for (const [k, v] of Object.entries(novo)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    saida[k] = ehObj(v) && ehObj(saida[k]) ? mesclarPreferencias(saida[k], v) : (ehObj(v) ? mesclarPreferencias({}, v) : v);
  }
  return saida;
}
