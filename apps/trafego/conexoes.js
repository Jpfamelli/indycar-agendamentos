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
  [/appsecret_proof/i,
    'Segredo do app da Meta não confere', 'O segredo do app (META_APP_SECRET) do servidor não é do app que gerou o token. Confira no painel do app da Meta ou tire a variável.'],
  [/c[oó]digo 190|malformed access token|invalid oauth access token|session has expired|error validating access token/i,
    'Token da Meta inválido ou vencido', 'Gere um token novo de usuário do sistema (permissão ads_read, validade "Nunca") no Gerenciador de Negócios e cole aqui.'],
  [/c[oó]digo (10|200|294)\b|requires ads_read|ads_read permission|sem permiss[aã]o de an[uú]ncios/i,
    'Token sem permissão de anúncios', 'O token precisa da permissão ads_read e de acesso à conta de anúncios (usuário do sistema com a conta atribuída).'],
  [/c[oó]digo 2635|deprecated version|unknown version|unsupported version/i,
    'A Meta recusou a versão da API', 'O sistema já tenta a versão anterior sozinho. Se continuar, avise o suporte para atualizar a versão.'],
  [/c[oó]digo 100\b|unsupported get request|does not exist|cannot be loaded due to missing permissions/i,
    'Conta de anúncios não encontrada', 'Confira o número da conta (Gerenciador de Anúncios › Configurações da conta). Pode colar com ou sem "act_".'],
  [/c[oó]digo (4|17|32|613|8000[034]|80014)\b|rate limit|too many calls|request limit/i,
    'Meta pediu para esperar', 'Limite de chamadas atingido. O sistema tenta de novo sozinho na próxima coleta.'],
  [/invalid jwt|invalid_grant.*(jwt|signature|assertion)|private key|chave privada/i,
    'Chave da conta de serviço recusada', 'Gere uma chave JSON nova da conta de serviço no Google Cloud (IAM › Contas de serviço › Chaves) e cole o arquivo inteiro aqui.'],
  [/invalid_grant|token has been expired or revoked/i,
    'Autorização do Google vencida', 'O refresh token foi revogado ou expirou (no modo "Teste" ele vence em 7 dias). Prefira a conta de serviço, ou refaça a autorização e cole o refresh token novo.'],
  [/invalid_client|unauthorized_client/i,
    'Client ID ou secret do Google errados', 'Confira o ID do cliente OAuth e a chave secreta no Google Cloud (APIs e serviços › Credenciais).'],
  [/cloud_project_not_approved|action_not_permitted|not approved for production/i,
    'Projeto do Google Cloud ainda sem acesso às contas reais', 'No Google Cloud, abra a página "Google Ads API" › Overview do projeto e peça o nível Explorer (sai em minutos na maioria dos casos).'],
  [/service_disabled|has not been used in project|api.*(is )?disabled/i,
    'A Google Ads API não está ativada no projeto', 'No Google Cloud, em APIs e serviços › Biblioteca, ative a "Google Ads API" no mesmo projeto da conta de serviço.'],
  [/developer_token_not_approved|developer token is not approved|only approved for use with test accounts/i,
    'Acesso do Google ainda não aprovado para contas reais', 'Desde 09/09/2026 quem libera é o projeto do Google Cloud: peça o nível Explorer na página "Google Ads API" › Overview.'],
  [/developer.?token|developer_token_invalid/i,
    'Developer token do Google não é mais usado', 'Desde 09/09/2026 o Google não pede mais o developer token. Deixe o campo em branco e use a conta de serviço.'],
  [/user_permission_denied|login-customer-id|manager/i,
    'Falta liberar o acesso na conta (ou a conta gerenciadora)', 'Em Google Ads › Administrador › Acesso e segurança, adicione o e-mail da conta de serviço. Se a conta fica debaixo de uma conta gerenciadora (MCC), preencha também o ID dela.'],
  [/customer_not_enabled|customer.*not.*(found|enabled)|invalid customer id/i,
    'Conta do Google Ads não encontrada', 'Confira o ID do cliente (10 dígitos, aparece no topo do Google Ads). Pode colar com hífens.'],
  [/vers[aã]o v\d+ indispon[ií]vel|nenhuma vers[aã]o respondeu/i,
    'Versão da API do Google fora do ar', 'O sistema tenta as versões anteriores sozinho. Se continuar, avise o suporte para atualizar a versão.'],
  [/falta |não configurado/i,
    'Credencial incompleta', 'Preencha todos os campos obrigatórios e teste de novo.'],
  [/timeout|aborted|fetch failed|enotfound|econnreset|sem resposta/i,
    'Plataforma não respondeu', 'A internet ou a plataforma demorou demais. Tente de novo em instantes.'],
];

/** Traduz o erro cru para { titulo, fazer }. Sempre devolve algo útil. */
function explicarErro(mensagem) {
  const texto = String(mensagem || '');
  for (const [re, titulo, fazer] of TRADUCOES) if (re.test(texto)) return { titulo, fazer };
  return { titulo: 'A plataforma recusou a conexão', fazer: 'Confira os dados colados e tente de novo. Se continuar, veja a mensagem técnica abaixo.' };
}

/* Tira qualquer coisa com cara de token da mensagem técnica. */
const semSegredo = s => String(s || '')
  .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '***')
  .replace(/((?:access_token|appsecret_proof|input_token|refresh_token|client_secret|assertion)=)[^&\s]+/gi, '$1***')
  .replace(/\b(EAA|ya29\.|1\/\/)[\w.-]{8,}/g, '***')
  .replace(/Bearer\s+[\w.~+/=-]{8,}/gi, 'Bearer ***');

/**
 * A chave JSON da conta de serviço (o arquivo que o Google Cloud baixa) → { email, chave }.
 * Aceita o texto colado ou o objeto. Devolve null se não for uma chave de conta de serviço.
 */
function lerContaDeServico(v) {
  if (!v) return null;
  let j = v;
  if (typeof v === 'string') { try { j = JSON.parse(v); } catch { return null; } }
  if (!j || typeof j !== 'object') return null;
  const email = String(j.client_email || '').trim(), chave = String(j.private_key || '');
  if (!/\.iam\.gserviceaccount\.com$/i.test(email) || !/-----BEGIN PRIVATE KEY-----/.test(chave)) return null;
  return { email, chave };
}

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
    // Rodada 8: conta de serviço (o caminho que o Google recomenda). O e-mail vai em google_client_id e a
    // chave privada em google_client_secret: as colunas que já existem em integracoes_ads.
    if (c.google_conta_servico) {
      const cs = lerContaDeServico(c.google_conta_servico);
      if (!cs) return { ok: false, erro: 'A chave da conta de serviço é o arquivo JSON que o Google Cloud baixa (tem "client_email" e "private_key"). Cole o arquivo inteiro.' };
      cred.google_client_id = cs.email;
      cred.google_client_secret = cs.chave;
      cred.google_refresh_token = '';
    }
    const servico = /\.iam\.gserviceaccount\.com$/i.test(cred.google_client_id);
    if (cred.google_client_id && !servico && !/\.apps\.googleusercontent\.com$/.test(cred.google_client_id)) {
      return { ok: false, erro: 'O Client ID do Google termina em .apps.googleusercontent.com (ou cole a chave JSON da conta de serviço).' };
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
    const base = { canal, nome: r.nome || null, moeda: r.moeda || null, versao: r.versao || null, expira_em: r.expira_em || null,
      acesso: r.acesso || null, ms: Date.now() - inicio };
    // A conta respondeu, mas o token não pode ler anúncios: a coleta ia falhar no primeiro relatório.
    if (r.falta_permissao === true) return { ...base, ok: false, ...explicarErro('sem permissão de anúncios'), erro: 'o token não tem ads_read' };
    const avisos = [];
    if (canal === 'meta' && r.status != null && Number(r.status) !== 1) avisos.push(`A conta de anúncios não está ativa na Meta (situação ${r.status}): confira pagamentos e restrições no Gerenciador de Anúncios.`);
    if (r.expira_em) avisos.push(`Este acesso vence em ${r.expira_em.split('-').reverse().join('/')}. Para não vencer, gere um token de usuário do sistema com validade "Nunca".`);
    if (canal === 'google' && cred.google_developer_token) avisos.push('O developer token salvo não é mais usado pelo Google (desde 09/09/2026). Pode apagar.');
    return { ...base, ok: true, titulo: 'Conexão funcionando', fazer: `Conta: ${r.nome || 'sem nome'}${r.moeda ? ` · ${r.moeda}` : ''}. Pode salvar.`, avisos };
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

module.exports = { explicarErro, validarCredencial, testar, salvar, mesclar, semSegredo, lerContaDeServico, TRADUCOES };
