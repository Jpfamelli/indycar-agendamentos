// Casa — pedaços do servidor da Central que só a Casa usa (rodada 7, C1).
//
//   POST /api/central/links-cliente  { telefone }  →  { ok, nome, aceita_mensagens, minha, indique, acompanhar, os }
//
// Os links do cliente (Minha IndyCar, indique um amigo, acompanhar o carro) nascem no banco por funções que só o servidor
// pode chamar (r7_p3b_links_cliente, service_role). Aqui a Central confere QUEM está pedindo (login do Supabase + perfil ativo
// da equipe + verificação em duas etapas, se tiver) e só então chama a função. O token do cliente nunca é registrado em log.
// Tudo injetável (fetch, relógio, ambiente) para os testes rodarem sem rede.

const EQUIPE = new Set(['admin', 'gestor', 'atendente']);
const LIMITE_POR_MINUTO = 20;

export function criarLinksCliente({ env = process.env, fetchFn = globalThis.fetch, agora = () => Date.now() } = {}) {
  const cacheLogin = new Map();           // token → { usuario, expira }
  const janelas = new Map();              // user id → [instantes]

  const url = () => String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const configurado = () => !!(url() && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);

  function nivelDoToken(token) {
    try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).aal || 'aal1'; } catch { return 'aal1'; }
  }
  function venceEm(token) {
    try { const e = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp; return Number.isFinite(e) ? e * 1000 : 0; } catch { return 0; }
  }

  /** { usuario } ou { erro: 'sem_login' | 'desativado' | 'mfa_pendente' | 'sem_permissao' | 'indisponivel' } */
  async function quemE(req) {
    const m = /^\s*bearer\s+(\S+)\s*$/i.exec(String(req.headers['authorization'] || ''));
    const token = m ? m[1] : null;
    if (!token || !configurado()) return { erro: 'sem_login' };
    const lembrado = cacheLogin.get(token);
    if (lembrado && lembrado.expira > agora()) return lembrado.erro ? { erro: lembrado.erro } : { usuario: lembrado.usuario };
    const vence = venceEm(token);
    if (vence && vence <= agora()) return { erro: 'sem_login' };
    const negar = (erro) => { if (cacheLogin.size > 300) cacheLogin.clear(); cacheLogin.set(token, { erro, expira: agora() + 30_000 }); return { erro }; };
    try {
      const r = await fetchFn(`${url()}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return negar('sem_login');
      const u = await r.json();
      if (!u || !u.id) return negar('sem_login');
      if ((u.factors || []).some((f) => f.status === 'verified') && nivelDoToken(token) !== 'aal2') return negar('mfa_pendente');
      const p = await fetchFn(`${url()}/rest/v1/perfis?select=ativo,papel&id=eq.${encodeURIComponent(u.id)}`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(8000) });
      if (!p.ok) return { erro: 'indisponivel' };
      const [perfil] = await p.json();
      if (!perfil) return negar('sem_login');
      if (!perfil.ativo) return negar('desativado');
      if (!EQUIPE.has(perfil.papel)) return negar('sem_permissao');
      const usuario = { id: u.id, papel: perfil.papel };
      if (cacheLogin.size > 300) cacheLogin.clear();
      cacheLogin.set(token, { usuario, expira: Math.min(agora() + 60_000, vence || Infinity) });
      return { usuario };
    } catch { return { erro: 'indisponivel' }; }
  }

  function dentroDoLimite(id) {
    const t = agora();
    const lista = (janelas.get(id) || []).filter((x) => t - x < 60_000);
    if (lista.length >= LIMITE_POR_MINUTO) { janelas.set(id, lista); return false; }
    lista.push(t); janelas.set(id, lista);
    if (janelas.size > 500) janelas.clear();
    return true;
  }

  const soHttps = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch { return null; } };

  async function lerCorpo(req, max = 2048) {
    let n = 0; const partes = [];
    for await (const c of req) { n += c.length; if (n > max) throw Object.assign(new Error('grande'), { codigo: 413 }); partes.push(c); }
    try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('json'), { codigo: 400 }); }
  }

  /** Devolve { status, corpo }. Quem chama escreve a resposta (assim o roteador da Central mantém os cabeçalhos dele). */
  async function tratar(req) {
    if (req.method !== 'POST') return { status: 405, corpo: { erro: 'Use POST.' } };
    const q = await quemE(req);
    if (q.erro) {
      const status = q.erro === 'sem_login' || q.erro === 'mfa_pendente' ? 401 : q.erro === 'indisponivel' ? 503 : 403;
      return { status, corpo: { erro: { sem_login: 'Entre de novo na Central.', mfa_pendente: 'Falta o código de verificação.', desativado: 'Seu acesso foi desativado.', sem_permissao: 'Só a equipe gera esses links.', indisponivel: 'Não consegui conferir o seu acesso agora.' }[q.erro], codigo: q.erro } };
    }
    if (!dentroDoLimite(q.usuario.id)) return { status: 429, corpo: { erro: 'Muitos pedidos seguidos. Espere um minuto.', codigo: 'limite' } };
    let corpo;
    try { corpo = await lerCorpo(req); } catch (e) { return { status: e.codigo || 400, corpo: { erro: e.codigo === 413 ? 'Pedido grande demais.' : 'Pedido inválido.' } }; }
    const tel = String(corpo.telefone || '').replace(/\D/g, '');
    if (!/^(55)?\d{10,11}$/.test(tel)) return { status: 422, corpo: { erro: 'Telefone inválido.', codigo: 'telefone' } };
    try {
      const r = await fetchFn(`${url()}/rest/v1/rpc/r7_p3b_links_cliente`, {
        method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_telefone: tel }), signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return { status: 502, corpo: { erro: 'O banco não respondeu os links agora.', codigo: 'banco' } };
      const d = await r.json();
      if (!d || d.ok !== true) return { status: 200, corpo: { ok: false, motivo: String(d && d.erro || 'indisponivel').slice(0, 40) } };
      return { status: 200, corpo: {
        ok: true, nome: String(d.nome || '').slice(0, 80), aceita_mensagens: d.aceita_mensagens !== false,
        minha: soHttps(d.minha), indique: soHttps(d.indique), acompanhar: soHttps(d.acompanhar),
        os: d.os ? { numero: Number(d.os.numero) || null, etapa_rotulo: String(d.os.etapa_rotulo || '').slice(0, 40) } : null,
      } };
    } catch { return { status: 502, corpo: { erro: 'O banco não respondeu os links agora.', codigo: 'banco' } }; }
  }

  return { tratar, quemE, limparCache: () => { cacheLogin.clear(); janelas.clear(); } };
}
