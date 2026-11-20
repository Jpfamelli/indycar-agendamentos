/* Apoio dos testes da rodada 10 (não é teste: o node --test carrega e não acha nada).
   Sobe o server.js DE VERDADE numa porta livre, com:
   - banco de mentira (sb-falso) no lugar do supabase-js;
   - login de mentira (o /auth/v1/user é atendido aqui, por token);
   - rede de mentira: todo fetch que não seja para o próprio servidor de teste passa por `rede`
     (quem não for atendido falha, como rede caída). Nada sai desta máquina: nem Supabase, nem
     CodeWords, nem IA. */
'use strict';
const path = require('node:path');
const { criarSbFalso } = require('./sb-falso.js');
const { criarAuthFalsa } = require('./auth-falsa.js');

const RAIZ = path.join(__dirname, '..', '..');
const SUPA = 'http://supabase.mentira.invalid';
const CODEWORDS = 'http://codewords.mentira.invalid';
const ID = {
  admin: '11111111-1111-4111-8111-111111111111', atendente: '22222222-2222-4222-8222-222222222222',
  gestor: '33333333-3333-4333-8333-333333333333', conversa: 'c0000000-0000-4000-8000-000000000001',
  conversa2: 'c0000000-0000-4000-8000-000000000002', cliente: 'd0000000-0000-4000-8000-000000000001',
};
const APPS = ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'ads'];
const perfil = (id, papel, nome) => ({ id, nome, email: `${papel}@teste.invalid`, papel, ativo: true, apps: APPS, recebe_leads: true,
  precisa_trocar_senha: false, preferencias: {}, ultimo_acesso_em: new Date().toISOString(), ultimo_app: 'atendimento' });

/** Tabelas mínimas: três pessoas, o CodeWords configurado (endereço de mentira) e uma conversa. */
function tabelasBase(extra = {}) {
  return {
    perfis: [perfil(ID.admin, 'admin', 'Dono'), perfil(ID.atendente, 'atendente', 'Ana'), perfil(ID.gestor, 'gestor', 'Gil')],
    codewords_config: [{ id: true, ativo: true, api_key: 'chave-de-mentira', service_id: 'fluxo_teste', base_url: CODEWORDS, device_id: 'aparelho-1',
      numero_whatsapp: '5512996830272', token_webhook: 'segredo-do-webhook', modo_envio: 'dispositivo',
      device_numero: '5512996830272', device_numero_conferido_em: new Date().toISOString() }],
    conversas: [{ id: ID.conversa, telefone: '12988887777', telefone_e164: '5512988887777', nome: 'Camila', cliente_id: ID.cliente, atribuida_a: null, status: 'aberta' }],
    whatsapp_mensagens: [], codewords_eventos: [], auditoria: [], notificacoes: [], clientes: [{ id: ID.cliente, nome: 'Camila', telefone: '12988887777' }],
    ...extra,
  };
}

const jwt = id => `x.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.y`;
const resposta = (status, corpo, cab = {}) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  { status, headers: { 'Content-Type': typeof corpo === 'string' ? 'text/plain' : 'application/json', ...cab } });

function esquecerModulos() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(RAIZ + path.sep) && !k.includes(`${path.sep}node_modules${path.sep}`) && !k.includes(`${path.sep}test${path.sep}`)) delete require.cache[k];
  }
}

/**
 * @param opcoes.tabelas  tabelas do banco de mentira (padrão: tabelasBase())
 * @param opcoes.rede     (url, opts) => Response | null   o que o CodeWords/Storage de mentira responde
 * @param fn              async ({ base, pedir, sb, chamadas, logs, app }) => {}
 */
async function comServidorR10(opcoes, fn) {
  const { tabelas = tabelasBase(), rpc = {}, falhas = {}, rede = () => null, env = {} } = opcoes || {};
  const sb = criarSbFalso(tabelas, { rpc: { registrar_auditoria: async (a, db) => { (db.auditoria = db.auditoria || []).push(a); return { data: null, error: null }; }, ...rpc }, falhas });
  sb.auth = { admin: criarAuthFalsa({ db: sb.db }).admin };
  const chamadas = [];                       // toda saída de rede que o servidor tentou
  const fetchReal = globalThis.fetch;
  const envAntes = { ...process.env };
  const idSupa = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
  const supaAntes = require.cache[idSupa];

  Object.assign(process.env, { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'servico-de-teste',
    SO_FUNCOES: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', ...env });
  for (const k of ['ANTHROPIC_API_KEY', 'RENDER', 'PREFIXO', 'CONFIAR_PROXY']) if (!(k in env)) delete process.env[k];
  require.cache[idSupa] = { id: idSupa, filename: idSupa, loaded: true, exports: { createClient: () => sb } };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url?.url || url);
    if (/^http:\/\/127\.0\.0\.1:\d+\//.test(u)) return fetchReal(url, opts);
    if (u === `${SUPA}/auth/v1/user`) {
      const m = /^Bearer (.+)$/.exec(opts.headers?.Authorization || '');
      let id = null;
      try { id = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString()).sub; } catch { /* token torto */ }
      const p = (sb.db.perfis || []).find(x => x.id === id);
      return p ? resposta(200, { id: p.id, email: p.email, factors: [] }) : resposta(401, { msg: 'invalid' });
    }
    chamadas.push({ url: u, metodo: opts.method || 'GET', opts });
    const r = await rede(u, opts);
    if (r) return r;
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED', message: 'rede de mentira: ' + u } });
  };
  esquecerModulos();
  const errosAntes = console.error;
  const logs = [];
  console.error = (...a) => logs.push(a.map(String).join(' '));
  let app;
  try {
    app = require(path.join(RAIZ, 'server.js'));
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const pedir = async (caminho, { metodo = 'GET', como = null, corpo, cabecalhos = {}, cru = false } = {}) => {
      const h = { ...cabecalhos };
      if (como) h.Authorization = `Bearer ${jwt(ID[como] || como)}`;
      let body;
      if (corpo !== undefined) { body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo); h['Content-Type'] = h['Content-Type'] || 'application/json'; }
      const r = await fetchReal(base + caminho, { method: metodo, headers: h, body });
      if (cru) return r;
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch { /* não é JSON */ }
      return { status: r.status, corpo: j, texto: txt, cab: r.headers };
    };
    await fn({ base, pedir, sb, chamadas, logs, app, jwt });
  } finally {
    console.error = errosAntes;
    if (app) { try { app.LIMITE.zerar(); app.ACESSO.limparCache(); } catch { /* servidor não subiu */ } await new Promise(r => app.server.close(r)); }
    globalThis.fetch = fetchReal;
    for (const k of Object.keys(process.env)) if (!(k in envAntes)) delete process.env[k];
    Object.assign(process.env, envAntes);
    if (supaAntes) require.cache[idSupa] = supaAntes; else delete require.cache[idSupa];
    esquecerModulos();
  }
}

module.exports = { comServidorR10, tabelasBase, resposta, jwt, ID, SUPA, CODEWORDS, perfil };
