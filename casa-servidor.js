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
/* rodada 10: quem erra o login 10 vezes em 1 minuto do mesmo endereço espera, sem a Central perguntar de novo ao Supabase */
const FALHAS_POR_MINUTO = 10;

/** De onde veio o pedido. Atrás da Cloudflare vale o cf-connecting-ip (o cliente não consegue forjar); sem ele, o de antes. */
export function ipDoPedido(req) {
  const cf = String(req?.headers?.['cf-connecting-ip'] || '').trim();
  if (/^[0-9a-f.:]{3,45}$/i.test(cf)) return cf;
  return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '?').split(',')[0].trim().slice(0, 64);
}

/**
 * rodada 10: tira do mapa só o que já venceu e, se ainda passar do teto, os mais antigos. Antes o mapa era zerado
 * inteiro ao passar do teto: uma enxurrada de endereços (ou de tokens inventados) apagava o freio de quem já estava
 * barrado e o login guardado de quem estava trabalhando.
 */
export function podar(mapa, teto, vivo, peso = () => 0) {
  if (mapa.size <= teto) return;
  for (const [k, v] of mapa) if (!vivo(v)) mapa.delete(k);
  if (mapa.size <= teto) return;
  // ainda sobra: sai primeiro quem pesa menos (um endereço que perguntou uma vez sai antes de quem já está freado)
  const ordem = [...mapa].sort((a, b) => peso(a[1]) - peso(b[1]));
  for (const [k] of ordem.slice(0, mapa.size - teto)) mapa.delete(k);
}

/** Um token do Supabase tem três pedaços em base64url e o do meio é um objeto JSON. O que não tem essa forma nem vai à rede. */
export function formaDeJwt(token) {
  if (typeof token !== 'string' || token.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return false;
  try { const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); return !!p && typeof p === 'object' && !Array.isArray(p); } catch { return false; }
}
/** O motivo que o banco devolve só passa se for um código curto (cliente_nao_encontrado); frase de erro do banco não vai para a tela. */
export const motivoSeguro = (m) => (typeof m === 'string' && /^[a-z][a-z0-9_]{2,39}$/.test(m) ? m : 'indisponivel');

export function criarLinksCliente({ env = process.env, fetchFn = globalThis.fetch, agora = () => Date.now() } = {}) {
  const cacheLogin = new Map();           // token → { usuario, expira }
  const janelas = new Map();              // user id → [instantes]
  const falhas = new Map();               // endereço → [instantes de login recusado]

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
    if (!formaDeJwt(token)) return { erro: 'sem_login' };   // rodada 10: lixo não vira consulta ao Supabase
    const lembrado = cacheLogin.get(token);
    if (lembrado && lembrado.expira > agora()) return lembrado.erro ? { erro: lembrado.erro } : { usuario: lembrado.usuario };
    const vence = venceEm(token);
    if (vence && vence <= agora()) return { erro: 'sem_login' };
    const guardar = (v) => { cacheLogin.set(token, v); podar(cacheLogin, 300, (x) => x.expira > agora(), (x) => (x.usuario ? 1 : 0)); };
    const negar = (erro) => { guardar({ erro, expira: agora() + 30_000 }); return { erro }; };
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
      guardar({ usuario, expira: Math.min(agora() + 60_000, vence || Infinity) });
      return { usuario };
    } catch { return { erro: 'indisponivel' }; }
  }

  function dentroDoLimite(id) {
    const t = agora();
    const lista = (janelas.get(id) || []).filter((x) => t - x < 60_000);
    if (lista.length >= LIMITE_POR_MINUTO) { janelas.set(id, lista); return false; }
    lista.push(t); janelas.set(id, lista);
    podar(janelas, 500, (l) => l.some((x) => t - x < 60_000), (l) => l.length);
    return true;
  }
  const falhasDe = (ip) => (falhas.get(ip) || []).filter((x) => agora() - x < 60_000);
  function anotarFalha(ip) {
    const lista = falhasDe(ip); lista.push(agora()); falhas.set(ip, lista);
    podar(falhas, 500, (l) => l.some((x) => agora() - x < 60_000), (l) => l.length);
  }

  const soHttps = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch { return null; } };

  async function lerCorpo(req, max = 2048) {
    let n = 0; const partes = [];
    for await (const c of req) { n += c.length; if (n > max) throw Object.assign(new Error('grande'), { codigo: 413 }); partes.push(c); }
    let v;
    try { v = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('json'), { codigo: 400 }); }
    // rodada 10: "null", número, texto ou lista não são um pedido (antes "null" derrubava a rota com erro 500)
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Object.assign(new Error('forma'), { codigo: 400 });
    return v;
  }

  /** Devolve { status, corpo, cabecalhos? }. Quem chama escreve a resposta (assim o roteador da Central mantém os cabeçalhos dele). */
  async function tratar(req) {
    if (req.method !== 'POST') return { status: 405, corpo: { erro: 'Use POST.' }, cabecalhos: { Allow: 'POST' } };
    const ip = ipDoPedido(req);
    if (falhasDe(ip).length >= FALHAS_POR_MINUTO) return { status: 429, corpo: { erro: 'Muitas tentativas sem login válido. Espere um minuto.', codigo: 'limite' }, cabecalhos: { 'Retry-After': '60' } };
    const q = await quemE(req);
    if (q.erro) {
      const status = q.erro === 'sem_login' || q.erro === 'mfa_pendente' ? 401 : q.erro === 'indisponivel' ? 503 : 403;
      if (q.erro === 'sem_login') anotarFalha(ip);
      return { status, ...(status === 503 ? { cabecalhos: { 'Retry-After': '30' } } : {}), corpo: { erro: { sem_login: 'Entre de novo na Central.', mfa_pendente: 'Falta o código de verificação.', desativado: 'Seu acesso foi desativado.', sem_permissao: 'Só a equipe gera esses links.', indisponivel: 'Não consegui conferir o seu acesso agora.' }[q.erro], codigo: q.erro } };
    }
    if (!dentroDoLimite(q.usuario.id)) return { status: 429, corpo: { erro: 'Muitos pedidos seguidos. Espere um minuto.', codigo: 'limite' }, cabecalhos: { 'Retry-After': '60' } };
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
      if (!d || d.ok !== true) return { status: 200, corpo: { ok: false, motivo: motivoSeguro(d && d.erro) } };
      return { status: 200, corpo: {
        ok: true, nome: String(d.nome || '').slice(0, 80), aceita_mensagens: d.aceita_mensagens !== false,
        minha: soHttps(d.minha), indique: soHttps(d.indique), acompanhar: soHttps(d.acompanhar),
        os: d.os ? { numero: Number(d.os.numero) || null, etapa_rotulo: String(d.os.etapa_rotulo || '').slice(0, 40) } : null,
      } };
    } catch { return { status: 502, corpo: { erro: 'O banco não respondeu os links agora.', codigo: 'banco' } }; }
  }

  return { tratar, quemE, limparCache: () => { cacheLogin.clear(); janelas.clear(); falhas.clear(); } };
}

/* ============================================================
   R13C — GET /api/central/faturamento  →  { faturamento: { mes, sem_valor_semana, fechados_mes, com_valor_mes, por_fonte } }

   O "Faturamento do mês" da Casa pela MESMA regra do CRM e do Tráfego (lib/valor-servico.cjs): serviço fechado = contato
   concluído; valor = Pátio > orçamento aprovado > Agenda > lançado. Antes a Casa somava só agendamentos.valor
   (r6_c1_painel_dono) e um valor lançado no CRM ou no Tráfego não aparecia. Só gestor/administrador (como a função do
   banco, que recusa com so_gestor). Só leitura; nenhum nome ou telefone sai daqui, só somas.
   ============================================================ */
const GESTORES = new Set(['admin', 'gestor']);

/** Início do mês e da semana (segunda) no fuso da oficina, como instantes. São Paulo não tem horário de verão desde 2019. */
export function trechosDoFaturamento(agora = Date.now()) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(agora));
  const meiaNoite = (dia) => Date.parse(`${dia}T00:00:00-03:00`);
  const t = meiaNoite(hoje);
  const dow = new Date(t + 3 * 3600e3).getUTCDay();             // 0 = domingo, no dia de São Paulo
  const segunda = t - ((dow + 6) % 7) * 86400e3;
  return { hoje, inicioMes: meiaNoite(hoje.slice(0, 7) + '-01'), inicioSemana: segunda, fim: t + 86400e3 };
}

/** Conta com a regra única: contatos fechados → valores → somas do mês e da semana. `leads` já lidos. */
export function somarFaturamento(VS, leads, valores, agora = Date.now()) {
  const tr = trechosDoFaturamento(agora);
  const mes = VS.faturamento(leads, valores, { de: tr.inicioMes, ate: tr.fim });
  const semana = VS.faturamento(leads, valores, { de: tr.inicioSemana, ate: tr.fim });
  const porFonte = {};
  for (const l of leads) {
    const tl = VS.fechadoEm(l), v = valores.get(l.id);
    if (!VS.fechou(l) || !(tl >= tr.inicioMes && tl < tr.fim) || !v || v.valor == null) continue;
    porFonte[v.fonte] = Math.round(((porFonte[v.fonte] || 0) + v.valor) * 100) / 100;
  }
  return { mes: mes.total, fechados_mes: mes.fechados, com_valor_mes: mes.com_valor, sem_valor_semana: semana.sem_valor, por_fonte: porFonte, hoje: tr.hoje };
}

export function criarFaturamento({ env = process.env, quemE, agora = () => Date.now(), sb = null, VS = null } = {}) {
  const janelas = new Map();
  let cliente = sb, regra = VS;
  async function banco() {
    if (cliente) return cliente;
    const { createClient } = await import('@supabase/supabase-js');
    cliente = createClient(String(env.SUPABASE_URL || ''), String(env.SUPABASE_SERVICE_ROLE_KEY || ''), { auth: { persistSession: false, autoRefreshToken: false } });
    return cliente;
  }
  async function valorServico() {
    if (regra) return regra;
    const { createRequire } = await import('node:module');
    regra = createRequire(import.meta.url)('./lib/valor-servico.cjs');
    return regra;
  }
  function dentroDoLimite(id) {
    const t = agora();
    const lista = (janelas.get(id) || []).filter((x) => t - x < 60_000);
    if (lista.length >= LIMITE_POR_MINUTO) { janelas.set(id, lista); return false; }
    lista.push(t); janelas.set(id, lista);
    podar(janelas, 500, (l) => l.some((x) => t - x < 60_000), (l) => l.length);
    return true;
  }

  async function lerFechados(sbc, desde) {
    const linhas = [];
    const iso = new Date(desde).toISOString();
    for (let i = 0; i < 20000; i += 1000) {
      // updated_at >= closed_at sempre: quem fechou no trecho foi atualizado no trecho (a conta fina é feita depois)
      const { data, error } = await sbc.from('leads').select('id, status, valor_pago, observacoes, closed_at, updated_at, created_at')
        .eq('status', 'concluido').or(`updated_at.gte.${iso},updated_at.is.null`).order('id').range(i, i + 999);
      if (error) throw new Error('leads: ' + error.message);
      linhas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return linhas;
  }

  /** Devolve { status, corpo, cabecalhos? } como LINKS_CLIENTE.tratar. */
  async function tratar(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return { status: 405, corpo: { erro: 'Use GET.' }, cabecalhos: { Allow: 'GET' } };
    const q = await quemE(req);
    if (q.erro) {
      const status = q.erro === 'sem_login' || q.erro === 'mfa_pendente' ? 401 : q.erro === 'indisponivel' ? 503 : 403;
      return { status, corpo: { erro: status === 401 ? 'Entre de novo na Central.' : status === 503 ? 'Não consegui conferir o seu acesso agora.' : 'Sem acesso.', codigo: q.erro } };
    }
    if (!GESTORES.has(q.usuario.papel)) return { status: 403, corpo: { erro: 'Só o gestor vê o faturamento.', codigo: 'so_gestor' } };
    if (!dentroDoLimite(q.usuario.id)) return { status: 429, corpo: { erro: 'Muitos pedidos seguidos. Espere um minuto.', codigo: 'limite' }, cabecalhos: { 'Retry-After': '60' } };
    try {
      const [sbc, R] = await Promise.all([banco(), valorServico()]);
      const tr = trechosDoFaturamento(agora());
      const leads = await lerFechados(sbc, Math.min(tr.inicioMes, tr.inicioSemana));
      const valores = await R.valoresDosFechados(sbc, leads);
      return { status: 200, corpo: { faturamento: somarFaturamento(R, leads, valores, agora()), regra: 'patio>orcamento>agenda>lancado' } };
    } catch {
      return { status: 502, corpo: { erro: 'O banco não respondeu o faturamento agora.', codigo: 'banco' } };
    }
  }
  return { tratar, limparCache: () => janelas.clear() };
}
