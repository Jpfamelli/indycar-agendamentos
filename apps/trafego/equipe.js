/* ============================================================
   Equipe — quem pode usar o Tráfego pago, último acesso, perfil,
   auditoria, notificações e metas de marketing.
   Tudo pela service_role (o RLS de perfis/metas/notificacoes não
   precisa ser afrouxado para o servidor trabalhar).
   ============================================================ */
'use strict';

const APP = 'ads';

/* Os links do ecossistema (um lugar só: public/ecossistema.js), para a tela
   "Você não tem acesso" mandar a pessoa para onde ela pode trabalhar. */
const Eco = require('./public/ecossistema.js');
const APPS_ECOSSISTEMA = Object.fromEntries(Eco.COM_LOGIN.filter(a => a !== APP).map(a => [a, [Eco.nome(a), Eco.url(a)]]));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ehUuid = v => typeof v === 'string' && UUID.test(v);

const ehAdmin = u => !!u && (u.papel === 'admin' || u.papel === 'dono');

/**
 * Regra de acesso do Tráfego pago (pura, testada):
 *  - admin entra sempre;
 *  - gestor entra se 'ads' estiver em perfis.apps;
 *  - atendente e agenda ficam fora mesmo com 'ads' na lista
 *    (aqui aparece margem, faturamento e verba).
 */
function acessoAds(u) {
  if (!u) return { ok: false, motivo: 'login' };
  // Rodada 5: o banco conferiu usuario_pode('ads') com o token da pessoa e disse NÃO → não entra, seja quem for.
  if (u.pode_ads === false) return { ok: false, motivo: 'sem_app' };
  if (ehAdmin(u)) return { ok: true };
  if (u.papel === 'gestor') {
    return Array.isArray(u.apps) && u.apps.includes(APP) ? { ok: true } : { ok: false, motivo: 'sem_app' };
  }
  return { ok: false, motivo: 'papel' };
}

/** Apps do ecossistema que a pessoa pode abrir (para os links da tela de sem acesso). */
function appsDaPessoa(u) {
  if (!u) return [];
  const lista = ehAdmin(u) ? Object.keys(APPS_ECOSSISTEMA)
    : (Array.isArray(u.apps) ? u.apps : []).filter(a => APPS_ECOSSISTEMA[a]);
  // O papel 'agenda' só usa a Agenda, mesmo que a lista diga outra coisa.
  const permitidos = u.papel === 'agenda' ? lista.filter(a => a === 'agenda') : lista;
  return permitidos.map(a => ({ app: a, nome: APPS_ECOSSISTEMA[a][0], url: APPS_ECOSSISTEMA[a][1] }));
}

/** O que a tela pode saber sobre a própria pessoa (nada de segredo). */
function perfilPublico(u) {
  const acesso = acessoAds(u);
  return {
    id: u.id, email: u.email || null, nome: u.nome || null, papel: u.papel,
    cargo: u.cargo || null, telefone: u.telefone || null, avatar_cor: u.avatar_cor || null,
    apps: Array.isArray(u.apps) ? u.apps : [],
    precisa_trocar_senha: u.precisa_trocar_senha === true,
    preferencias: { notificacoes: notifPrefs(u.preferencias) },
    acesso: acesso.ok, motivo_sem_acesso: acesso.ok ? null : acesso.motivo,
    acesso_conferido_no_banco: typeof u.pode_ads === 'boolean',
    ultimo_acesso_em: u.ultimo_acesso_em || null, ultimo_app: u.ultimo_app || null,
    apps_disponiveis: appsDaPessoa(u),
    eh_admin: ehAdmin(u),
  };
}

/* Mescla as notificações do Ads no jsonb de preferências sem tocar nas chaves dos outros apps. */
function mesclarPreferencias(atual, notificacoes) {
  const base = atual && typeof atual === 'object' && !Array.isArray(atual) ? atual : {};
  const antes = base.notificacoes && typeof base.notificacoes === 'object' && !Array.isArray(base.notificacoes) ? base.notificacoes : {};
  return { ...base, notificacoes: { ...antes, ...(notificacoes || {}) } };
}

/* Preferências de notificação do Tráfego pago (padrão: tudo ligado). */
const PREFS_PADRAO = { ads_alertas: true, ads_semana: true };
function notifPrefs(pref) {
  const n = pref && typeof pref === 'object' && pref.notificacoes && typeof pref.notificacoes === 'object' ? pref.notificacoes : {};
  return { ads_alertas: n.ads_alertas !== false, ads_semana: n.ads_semana !== false };
}

/* ---------------- validação do "Meu perfil" ---------------- */
const CORES = /^#[0-9a-f]{6}$/i;
function validarPerfil(c = {}) {
  const saida = {};
  const texto = (campo, max) => {
    if (!(campo in c)) return;
    if (c[campo] == null || String(c[campo]).trim() === '') { saida[campo] = null; return; }
    const v = String(c[campo]).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (v.length > max) throw Object.assign(new Error(`${campo}: no máximo ${max} caracteres`), { status: 400 });
    saida[campo] = v;
  };
  texto('nome', 80); texto('cargo', 60);
  if ('nome' in saida && !saida.nome) throw Object.assign(new Error('nome: não pode ficar vazio'), { status: 400 });
  if ('telefone' in c) {
    const d = String(c.telefone || '').replace(/\D/g, '');
    if (d && (d.length < 10 || d.length > 13)) throw Object.assign(new Error('telefone: use DDD + número'), { status: 400 });
    saida.telefone = d || null;
  }
  if ('avatar_cor' in c) {
    if (c.avatar_cor && !CORES.test(String(c.avatar_cor))) throw Object.assign(new Error('avatar_cor: use uma cor #rrggbb'), { status: 400 });
    saida.avatar_cor = c.avatar_cor || null;
  }
  if ('notificacoes' in c) {
    const n = c.notificacoes || {};
    saida.notificacoes = { ads_alertas: n.ads_alertas !== false, ads_semana: n.ads_semana !== false };
  }
  return saida;
}

/* ---------------- metas de marketing (tabela metas, perfil_id nulo = loja) ---------------- */
const MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
function validarMeta(c = {}) {
  const mes = String(c.mes || '');
  if (!MES.test(mes)) throw Object.assign(new Error('mes: use AAAA-MM'), { status: 400 });
  const saida = { mes: `${mes}-01` };
  for (const campo of ['leads', 'agendamentos', 'vendas']) {
    if (!(campo in c)) continue;
    if (c[campo] === null || c[campo] === '') { saida[campo] = null; continue; }
    const v = Number(c[campo]);
    if (!Number.isInteger(v) || v < 1 || v > 100000) throw Object.assign(new Error(`${campo}: use um número inteiro de 1 a 100 mil`), { status: 400 });
    saida[campo] = v;
  }
  return saida;
}

/** Progresso de uma meta mensal: feito, % e projeção pelo dia do mês. */
function progresso(feito, meta, dia, diasMes) {
  if (!meta) return null;
  const frac = diasMes > 0 ? Math.min(1, Math.max(0, dia / diasMes)) : 0;
  const projecao = frac > 0 ? Math.round(feito / frac) : 0;
  return {
    feito, meta, pct: Math.min(100, Math.round((feito / meta) * 1000) / 10),
    projecao, faltam: Math.max(0, meta - feito),
    situacao: feito >= meta ? 'batida' : projecao >= meta ? 'no_ritmo' : 'abaixo',
  };
}

/* ---------------- acesso ao banco (injeção para os testes) ---------------- */
function criar(sb) {
  const tocados = new Map();   // perfil -> último toque (ms)

  /** Grava último acesso no máximo a cada 5 min por pessoa; nunca derruba a rota. */
  async function tocarAcesso(u, agora = Date.now()) {
    if (!u?.id) return false;
    const ultimo = tocados.get(u.id) || (u.ultimo_acesso_em && u.ultimo_app === APP ? Date.parse(u.ultimo_acesso_em) : 0);
    if (agora - ultimo < 5 * 60000) return false;
    tocados.set(u.id, agora);
    if (tocados.size > 2000) tocados.clear();
    try {
      await sb.from('perfis').update({ ultimo_acesso_em: new Date(agora).toISOString(), ultimo_app: APP }).eq('id', u.id);
      return true;
    } catch { return false; }
  }

  /** registrar_auditoria — ação sensível. Falha de auditoria não derruba a ação. */
  async function auditar(u, acao, { tabela = null, registro = null, detalhes = null } = {}) {
    try {
      const { error } = await sb.rpc('registrar_auditoria', {
        p_perfil: u?.id || null, p_app: APP, p_acao: String(acao).slice(0, 80),
        p_tabela: tabela, p_registro: registro == null ? null : String(registro), p_detalhes: detalhes,
      });
      if (error) throw error;
      return true;
    } catch (e) { console.warn('⚠️  auditoria não gravou:', acao, e.message || e); return false; }
  }

  async function salvarPerfil(u, campos) {
    const patch = {};
    for (const k of ['nome', 'cargo', 'telefone', 'avatar_cor']) if (k in campos) patch[k] = campos[k];
    if (campos.notificacoes) {
      // Rodada 4: perfis.preferencias é de TODOS os apps. Relê o valor atual e muda só "notificacoes"; se a releitura
      // falhar, não grava (antes gravava em cima de {} e apagava o que a Agenda, o CRM e o Orçador guardaram).
      const { data, error } = await sb.from('perfis').select('preferencias').eq('id', u.id).maybeSingle();
      if (error || !data) throw new Error('Não consegui ler suas preferências agora. Nada foi alterado; tente de novo.');
      patch.preferencias = mesclarPreferencias(data.preferencias, campos.notificacoes);
    }
    if (!Object.keys(patch).length) return;
    patch.updated_at = new Date().toISOString();
    const { error } = await sb.from('perfis').update(patch).eq('id', u.id);
    if (error) throw new Error('Não foi possível salvar o perfil agora.');
  }

  async function senhaTrocada(u) {
    const { error } = await sb.from('perfis').update({ precisa_trocar_senha: false }).eq('id', u.id);
    if (error) throw new Error('Não foi possível registrar a troca de senha.');
  }

  /** Quem recebe as notificações do Tráfego pago: os mesmos que podem abrir o app. */
  async function gestoresDoAds() {
    const { data, error } = await sb.from('perfis').select('id, papel, apps, ativo, preferencias').eq('ativo', true);
    if (error) throw new Error('Não foi possível ler a equipe.');
    return (data || []).filter(p => acessoAds(p).ok);
  }

  /** Notifica os gestores do Ads (respeitando a preferência de cada um). `chave` evita repetir. */
  async function notificarGestores({ tipo, titulo, corpo, link = '/', chave = null, preferencia }) {
    const pessoas = await gestoresDoAds();
    let enviadas = 0;
    for (const p of pessoas) {
      if (preferencia && notifPrefs(p.preferencias)[preferencia] === false) continue;
      const { data, error } = await sb.rpc('notificar', {
        p_perfil: p.id, p_tipo: tipo, p_titulo: titulo, p_corpo: corpo, p_link: link, p_app: APP,
        p_chave: chave ? `${chave}` : null,
      });
      if (!error && data) enviadas++;
    }
    return { destinatarios: pessoas.length, enviadas };
  }

  async function notificarUm(perfilId, { tipo, titulo, corpo, link = '/' }) {
    const { data, error } = await sb.rpc('notificar', {
      p_perfil: perfilId, p_tipo: tipo, p_titulo: titulo, p_corpo: corpo, p_link: link, p_app: APP, p_chave: null,
    });
    if (error) throw new Error('Não foi possível criar a notificação.');
    return !!data;
  }

  /** Nomes (só id e nome) dos responsáveis — nada de e-mail ou telefone na tela de mídia. */
  async function nomesDosPerfis(ids) {
    const unicos = [...new Set(ids.filter(ehUuid))];
    if (!unicos.length) return new Map();
    const { data, error } = await sb.from('perfis').select('id, nome, ativo').in('id', unicos);
    if (error) return new Map();
    return new Map((data || []).map(p => [p.id, { nome: p.nome || 'Sem nome', ativo: p.ativo !== false }]));
  }

  async function lerMetaLoja(mes) {
    const { data, error } = await sb.from('metas').select('id, mes, leads, agendamentos, vendas, updated_at')
      .is('perfil_id', null).eq('mes', mes).maybeSingle();
    if (error) throw new Error('Não foi possível ler as metas.');
    return data || null;
  }

  async function salvarMetaLoja(meta) {
    const atual = await lerMetaLoja(meta.mes);
    const campos = {};
    for (const k of ['leads', 'agendamentos', 'vendas']) if (k in meta) campos[k] = meta[k];
    if (atual) {
      const { data, error } = await sb.from('metas').update({ ...campos, updated_at: new Date().toISOString() })
        .eq('id', atual.id).select('id, mes, leads, agendamentos, vendas, updated_at').single();
      if (error) throw new Error('Não foi possível salvar a meta.');
      return data;
    }
    const { data, error } = await sb.from('metas').insert({ perfil_id: null, mes: meta.mes, ...campos })
      .select('id, mes, leads, agendamentos, vendas, updated_at').single();
    if (error) throw new Error('Não foi possível salvar a meta.');
    return data;
  }

  return { tocarAcesso, auditar, salvarPerfil, senhaTrocada, gestoresDoAds, notificarGestores, notificarUm, nomesDosPerfis, lerMetaLoja, salvarMetaLoja };
}

let padrao = null;
function banco() {
  if (!padrao) padrao = criar(require('./db').sb);
  return padrao;
}

module.exports = {
  APP, APPS_ECOSSISTEMA, acessoAds, appsDaPessoa, perfilPublico, ehAdmin, ehUuid, UUID,
  notifPrefs, PREFS_PADRAO, mesclarPreferencias, validarPerfil, validarMeta, progresso, criar, banco,
};
