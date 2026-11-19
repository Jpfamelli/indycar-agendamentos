/* ============================================================
   Porteiro — mesma lógica do CRM e do Atendimento: o navegador faz
   login no Supabase Auth e manda o token; aqui conferimos se ele é
   válido E se o perfil continua ativo. Quem pode usar o app (admin, ou
   gestor com 'ads' em perfis.apps) é decidido em equipe.acessoAds.
   ============================================================ */
'use strict';

const { acessoAds } = require('./equipe');

const URL_SB = process.env.SUPABASE_URL || '';
const ANON   = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

/* token -> { usuario, expira } | { motivo, expira }. 30 s: desativar alguém
   no meio do uso derruba a sessão em no máximo meio minuto. */
const CACHE = new Map();
const TTL = 30_000;

function validadeDoToken(token) {
  try {
    const [, carga] = token.split('.');
    const { exp } = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
}

function aalDoToken(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).aal || 'aal1'; }
  catch { return 'aal1'; }
}

const CAMPOS_PERFIL = 'ativo,papel,nome,email,apps,cargo,telefone,avatar_cor,precisa_trocar_senha,ultimo_acesso_em,ultimo_app,preferencias';

/**
 * Quem está chamando. Devolve { usuario } ou { motivo } com
 * motivo ∈ 'sem_token' | 'vencido' | 'invalido' | 'desativado' | 'sem_perfil' | 'indisponivel'.
 */
async function identificar(req) {
  const m = /^\s*bearer\s+(\S+)\s*$/i.exec(req.headers['authorization'] || '');
  const token = m ? m[1] : null;
  if (!token) return { motivo: 'sem_token' };
  const vence = validadeDoToken(token);
  if (vence && vence <= Date.now()) return { motivo: 'vencido' };      // já venceu: nem pergunta ao Supabase
  if (!URL_SB || !ANON || !SERVICE) return { motivo: 'indisponivel' };

  const lembrado = CACHE.get(token);
  if (lembrado && lembrado.expira > Date.now()) return lembrado.motivo ? { motivo: lembrado.motivo } : { usuario: lembrado.usuario };

  const guardar = valor => {
    if (CACHE.size > 500) CACHE.clear();
    CACHE.set(token, { ...valor, expira: Math.min(Date.now() + TTL, vence || Infinity) });
    return valor.motivo ? { motivo: valor.motivo } : { usuario: valor.usuario };
  };

  try {
    const r = await fetch(`${URL_SB}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return guardar({ motivo: 'invalido' });
    const usuario = await r.json();
    if (!usuario?.id) return guardar({ motivo: 'invalido' });

    const p = await fetch(
      `${URL_SB}/rest/v1/perfis?select=${CAMPOS_PERFIL}&id=eq.${encodeURIComponent(usuario.id)}`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }, signal: AbortSignal.timeout(8000) });
    if (!p.ok) return { motivo: 'indisponivel' };
    const [perfil] = await p.json();
    if (!perfil) return guardar({ motivo: 'sem_perfil' });
    if (!perfil.ativo) return guardar({ motivo: 'desativado' });

    // Rodada 5: o banco confere usuario_pode('ads') com o token da própria pessoa (RLS/função da casa).
    // true/false quando respondeu; null quando não deu para conferir (aí vale a regra local).
    const pode_ads = await podeNoBanco(token, 'ads');

    const enxuto = {
      ...perfil, pode_ads,
      id: usuario.id, email: usuario.email || perfil.email || null,
      // nível de garantia da sessão (aal1 = só senha, aal2 = senha + código)
      aal: aalDoToken(token),
      // tem verificação em duas etapas ligada? Então a sessão precisa ser aal2.
      mfa: Array.isArray(usuario.factors) && usuario.factors.some(f => f.status === 'verified'),
    };
    return guardar({ usuario: enxuto });
  } catch { return { motivo: 'indisponivel' }; }
}

/** rpc usuario_pode(app) com o token da pessoa. Devolve true/false, ou null se não deu para perguntar. */
async function podeNoBanco(token, app, fetchFn = fetch) {
  try {
    const r = await fetchFn(`${URL_SB}/rest/v1/rpc/usuario_pode`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_app: app }), signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v === 'boolean' ? v : null;
  } catch { return null; }
}

/* Compatível com o código antigo: só o usuário (ou null). */
async function usuarioLogado(req) {
  const r = await identificar(req);
  return r.usuario || null;
}

/* Números de tráfego são informação de dono/gestor. */
const ehDono = u => acessoAds(u).ok;

const configurado = () => !!(URL_SB && ANON && SERVICE);

function esquecer() { CACHE.clear(); }

module.exports = { identificar, usuarioLogado, ehDono, configurado, esquecer, podeNoBanco, ANON, URL_SB };
