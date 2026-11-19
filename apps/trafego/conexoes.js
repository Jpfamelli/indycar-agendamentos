/* ============================================================
   Conexões — colar o token da Meta e do Google pela tela, testar
   antes de gravar e traduzir o erro da plataforma para o que fazer.
   Nenhum token volta para o navegador nem aparece em mensagem.
   ============================================================ */
'use strict';

const db = require('./db');
const meta = require('./meta');
const google = require('./google');

/* Erros conhecidos → [título curto, o que fazer]. A ordem importa: o
   primeiro padrão que casar vence. */
const TRADUCOES = [
  [/c[oó]digo 190|malformed access token|invalid oauth access token|session has expired|error validating access token/i,
    'Token da Meta inválido ou vencido', 'Gere um token novo de longa duração no Meta for Developers (permissão ads_read) e cole aqui.'],
  [/c[oó]digo (10|200|294)\b|requires ads_read|ads_read permission/i,
    'Token sem permissão de anúncios', 'O token precisa da permissão ads_read e de acesso à conta de anúncios no Gerenciador de Negócios.'],
  [/c[oó]digo 100\b|unsupported get request|does not exist|cannot be loaded due to missing permissions/i,
    'Conta de anúncios não encontrada', 'Confira o número da conta (Gerenciador de Anúncios → Configurações da conta). Pode colar com ou sem "act_".'],
  [/c[oó]digo (4|17|32|613)\b|rate limit|too many calls/i,
    'Meta pediu para esperar', 'Limite de chamadas atingido. Tente de novo em alguns minutos.'],
  [/invalid_grant|token has been expired or revoked/i,
    'Autorização do Google vencida', 'O refresh token foi revogado ou expirou. Refaça o consentimento OAuth e cole o refresh token novo.'],
  [/invalid_client|unauthorized_client/i,
    'Client ID ou secret do Google errados', 'Confira o OAuth Client ID e o Client Secret no Google Cloud Console (credenciais).'],
  [/developer_token_not_approved|developer token is not approved|only approved for use with test accounts/i,
    'Developer token do Google ainda não aprovado', 'O token só funciona em conta de teste até o Google aprovar (leva alguns dias). Acompanhe em Google Ads → Central da API.'],
  [/developer.?token|developer_token_invalid/i,
    'Developer token do Google inválido', 'Copie de novo o developer token em Google Ads → Ferramentas → Central da API.'],
  [/user_permission_denied|login-customer-id|manager/i,
    'Falta a conta gerenciadora (MCC)', 'Se a conta está debaixo de uma MCC, preencha o "ID da conta gerenciadora".'],
  [/customer_not_enabled|customer.*not.*(found|enabled)|invalid customer id/i,
    'Conta do Google Ads não encontrada', 'Confira o ID do cliente (10 dígitos, aparece no topo do Google Ads). Pode colar com hífens.'],
  [/falta |não configurado/i,
    'Credencial incompleta', 'Preencha todos os campos obrigatórios e teste de novo.'],
  [/timeout|aborted|fetch failed|enotfound|econnreset/i,
    'Plataforma não respondeu', 'A internet ou a plataforma demorou demais. Tente de novo em instantes.'],
];

/** Traduz o erro cru para { titulo, fazer }. Sempre devolve algo útil. */
function explicarErro(mensagem) {
  const texto = String(mensagem || '');
  for (const [re, titulo, fazer] of TRADUCOES) if (re.test(texto)) return { titulo, fazer };
  return { titulo: 'A plataforma recusou a conexão', fazer: 'Confira os dados colados e tente de novo. Se continuar, veja a mensagem técnica abaixo.' };
}

/* Tira qualquer coisa com cara de token da mensagem técnica. */
const semSegredo = s => String(s || '').replace(/(access_token=)[^&\s]+/gi, '$1***').replace(/\b(EAA|ya29\.|1\/\/)[\w.-]{8,}/g, '***');

const so = v => String(v ?? '').replace(/\D/g, '');

/**
 * Valida o que a tela mandou para UM canal. Devolve { ok, cred, erro }.
 * Formato só — se o token funciona é o teste que diz.
 */
function validarCredencial(canal, c = {}) {
  const t = v => (v == null ? '' : String(v).trim());
  if (canal === 'meta') {
    const conta = t(c.meta_ad_account_id).replace(/^act_/i, '');
    const token = t(c.meta_access_token);
    if (conta && !/^\d{5,20}$/.test(conta)) return { ok: false, erro: 'Número da conta da Meta: só dígitos (com ou sem "act_").' };
    if (token && (token.length < 30 || /\s/.test(token))) return { ok: false, erro: 'O token da Meta parece incompleto: copie de novo, sem espaços.' };
    const expira = t(c.meta_token_expira_em);
    if (expira && !/^\d{4}-\d{2}-\d{2}$/.test(expira)) return { ok: false, erro: 'Validade do token: use uma data.' };
    return { ok: true, cred: { meta_ad_account_id: conta ? `act_${conta}` : '', meta_access_token: token, meta_token_expira_em: expira } };
  }
  if (canal === 'google') {
    const cliente = so(c.google_customer_id), gerente = so(c.google_login_customer_id);
    if (c.google_customer_id && cliente.length !== 10) return { ok: false, erro: 'ID do cliente do Google: 10 dígitos (ex.: 123-456-7890).' };
    if (c.google_login_customer_id && gerente.length !== 10) return { ok: false, erro: 'ID da conta gerenciadora: 10 dígitos.' };
    const cred = {
      google_customer_id: cliente, google_login_customer_id: gerente,
      google_developer_token: t(c.google_developer_token), google_client_id: t(c.google_client_id),
      google_client_secret: t(c.google_client_secret), google_refresh_token: t(c.google_refresh_token),
    };
    if (cred.google_client_id && !/\.apps\.googleusercontent\.com$/.test(cred.google_client_id)) {
      return { ok: false, erro: 'O Client ID do Google termina em .apps.googleusercontent.com.' };
    }
    return { ok: true, cred };
  }
  return { ok: false, erro: 'Canal deve ser meta ou google.' };
}

/* Campo vazio na tela = "manter o que já está gravado". */
function mesclar(gravada = {}, nova = {}) {
  const saida = { ...gravada };
  for (const [k, v] of Object.entries(nova)) if (v) saida[k] = v;
  return saida;
}

/**
 * Testa a credencial (a colada por cima da gravada) SEM gravar nada.
 * `motores` injetável para teste.
 */
async function testar(canal, entrada = {}, { motores = { meta, google }, lerIntegracoes = db.lerIntegracoes } = {}) {
  const v = validarCredencial(canal, entrada);
  if (!v.ok) return { canal, ok: false, titulo: 'Dados em formato errado', fazer: v.erro };
  const gravada = (await lerIntegracoes()).find(i => i.canal === canal) || {};
  const cred = mesclar(gravada, v.cred);
  if (canal === 'google' && motores.google.esquecerToken) motores.google.esquecerToken();
  const inicio = Date.now();
  try {
    const r = await motores[canal].testar(cred);
    return { canal, ok: true, titulo: 'Conexão funcionando', fazer: `Conta: ${r.nome || 'sem nome'}${r.moeda ? ` · ${r.moeda}` : ''}. Pode salvar.`,
      nome: r.nome || null, moeda: r.moeda || null, ms: Date.now() - inicio };
  } catch (e) {
    const tecnico = semSegredo(e.message);
    return { canal, ok: false, ...explicarErro(tecnico), erro: tecnico, ms: Date.now() - inicio };
  }
}

/** Grava a credencial (validada). Devolve a versão mascarada. */
async function salvar(canal, entrada = {}, { gravar = db.salvarIntegracao } = {}) {
  const v = validarCredencial(canal, entrada);
  if (!v.ok) { const e = new Error(v.erro); e.status = 400; throw e; }
  if (!Object.values(v.cred).some(Boolean)) { const e = new Error('Cole ao menos um campo para salvar.'); e.status = 400; throw e; }
  const nome = entrada.conta_nome ? String(entrada.conta_nome).trim().slice(0, 80) : null;
  const linha = await gravar(canal, v.cred, nome);
  if (canal === 'google') google.esquecerToken?.();
  return db.mascararIntegracao(linha);
}

module.exports = { explicarErro, validarCredencial, testar, salvar, mesclar, semSegredo, TRADUCOES };
