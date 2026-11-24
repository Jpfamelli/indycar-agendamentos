/* ============================================================
   IndyCar CRM — rodada 14 (24/11/2026), servidor
   Faxina dos contatos parados: o que ficou sem mexer por muito tempo vira "perdido
   (sem retorno do cliente)" em lote, com a prévia na mão do gestor e Desfazer.
   NADA é apagado: o contato continua na lista de perdidos e pode ser reaberto.
   Duas travas contra marcar errado: contato com conversa de WhatsApp recente e
   contato com retorno combinado para o futuro ficam de fora.
   ============================================================ */
'use strict';

const U = require('./util-servidor');
const R5 = require('./rodada5');
const { ehUuid, falha, ehGestor, texto } = U;

const C = require('../public/r14-faxina.js');
const { selecionarFaxina, resumoFaxina, observacoesDaFaxina, diasParado, diasValidos, escopoValido, ETAPAS_FAXINA, MOTIVO_FAXINA } = C;

const DIA = 864e5;
const COLS = 'id,cliente_id,nome,status,origem,valor_orcado,observacoes,responsavel_id,created_at,updated_at,ultimo_contato_em,proximo_contato_em';
const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; };
const pedacos = (lista, n) => { const out = []; for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n)); return out; };

/* ---------------- servidor ---------------- */
/** Última mensagem do WhatsApp (qualquer direção) de cada contato, nos últimos `janela` dias. */
async function ultimasConversas(sb, leads, agora, janela) {
  const out = new Map();
  const comCliente = (leads || []).filter(l => l.cliente_id);
  if (!comCliente.length) return out;
  const porCliente = new Map();
  for (const l of comCliente) { if (!porCliente.has(l.cliente_id)) porCliente.set(l.cliente_id, []); porCliente.get(l.cliente_id).push(l.id); }
  const conv = new Map();                                   // conversa_id -> cliente_id
  for (const parte of pedacos([...porCliente.keys()], 150)) {
    const { data, error } = await sb.from('conversas').select('id,cliente_id').in('cliente_id', parte);
    if (error) throw falha(503, 'Não consegui conferir as conversas dos contatos.');
    for (const c of data || []) conv.set(c.id, c.cliente_id);
  }
  const desde = new Date(agora - janela * DIA).toISOString();
  for (const parte of pedacos([...conv.keys()], 100)) {
    const { data, error } = await sb.from('whatsapp_mensagens').select('conversa_id,created_at').in('conversa_id', parte).gte('created_at', desde).order('created_at', { ascending: false }).limit(5000);
    if (error) throw falha(503, 'Não consegui conferir as mensagens dos contatos.');
    for (const m of data || []) {
      const cli = conv.get(m.conversa_id), t = ms(m.created_at);
      if (!cli || !Number.isFinite(t)) continue;
      for (const id of porCliente.get(cli) || []) if (!(out.get(id) >= t)) out.set(id, t);
    }
  }
  return out;
}

async function lerAbertos(sb) {
  const { data, error } = await U.todas(() => sb.from('leads').select(COLS).in('status', R5.ABERTAS).order('id'));
  if (error) throw falha(503, 'Não consegui ler os contatos.');
  return data || [];
}

async function rotasR14(c) {
  const { req, res, url, pathname: p, quem, json, lerCorpo, freio } = c;
  const m = req.method, sb = c.sb;
  if (!p.startsWith('/api/leads/faxina')) return false;
  if (!ehGestor(quem.papel)) throw falha(403, 'Só um gestor faz a faxina dos contatos parados.', { codigo: 'so_gestor' });
  if (!sb) throw falha(503, 'Disponível só com o banco compartilhado (Supabase).');
  const frear = (nome, teto, janela) => { if (!freio.dentro(`${nome}:${quem.id}`, teto, janela)) throw falha(429, 'Muitos pedidos seguidos. Espere um pouco.'); };
  const agora = (c.agora || Date.now)();

  if (p === '/api/leads/faxina' && m === 'GET') {
    frear('faxina', 30, 60_000);
    const dias = diasValidos(url.searchParams.get('dias') || 30), escopo = escopoValido(url.searchParams.get('escopo'));
    const leads = await lerAbertos(sb);
    const cand = leads.filter(l => ETAPAS_FAXINA.includes(l.status) && diasParado(l, agora) >= Math.min(14, dias) && (escopo === 'todos' || !l.responsavel_id));
    const ultimaConversa = await ultimasConversas(sb, cand, agora, 90);
    const resumo = resumoFaxina(leads, { dias, escopo, agora, ultimaConversa });
    /* o rodízio sugerido é só do que está vivo: o que vai para a faxina não entra (e distribuir mexe na data, então a faxina vem primeiro) */
    let rodizio = null;
    const eq = c.equipe;
    if (eq) {
      const [gente, cargas] = await Promise.all([eq.vendedores({ soRecebe: true }), eq.cargas()]);
      const vendedores = gente.map(v => ({ ...eq.publico(v), abertos: cargas.get(v.id) || 0 }));
      const noLixo = new Set(resumo.itens.map(i => i.id));
      rodizio = R5.sugerirRodizio(leads.filter(l => !noLixo.has(l.id)), vendedores, { cargas, agora });
    }
    json(res, 200, { ...resumo, rodizio });
    return true;
  }

  if (p === '/api/leads/faxina/arquivar' && m === 'POST') {
    frear('faxina-gravar', 10, 60_000);
    const b = await lerCorpo();
    const ids = Array.isArray(b.ids) ? b.ids : [];
    if (!ids.length || ids.length > 500) throw falha(400, 'Escolha de 1 a 500 contatos por vez.');
    const vistos = new Set();
    for (const id of ids) { if (!ehUuid(id) || vistos.has(id)) throw falha(400, 'Lista com contato inválido ou repetido.'); vistos.add(id); }
    const dias = diasValidos(b.dias), escopo = escopoValido(b.escopo);
    const leads = await lerAbertos(sb);
    const cand = leads.filter(l => vistos.has(l.id));
    const ultimaConversa = await ultimasConversas(sb, cand, agora, dias);
    const ok = new Map(selecionarFaxina(cand, { dias, escopo, agora, ultimaConversa }).itens.map(i => [i.id, i]));
    const porId = new Map(cand.map(l => [l.id, l]));
    const feitos = [], pulados = [];
    for (const id of ids) {
      const l = porId.get(id);
      if (!l) { pulados.push({ id, motivo: 'já não está aberto' }); continue; }
      if (!ok.has(id)) { pulados.push({ id, nome: l.nome, motivo: 'mexeram nele depois da prévia ou há conversa recente' }); continue; }
      const observacoes = observacoesDaFaxina(l.observacoes, ok.get(id).dias);
      const { data, error } = await sb.from('leads').update({ status: 'perdido', observacoes }).eq('id', id).eq('status', l.status).select('id,observacoes').maybeSingle();
      if (error || !data) { pulados.push({ id, nome: l.nome, motivo: 'não consegui gravar' }); continue; }
      feitos.push({ id, nome: l.nome, antes: { status: l.status, observacoes: l.observacoes ?? '' }, depois: { status: 'perdido', observacoes: data.observacoes ?? observacoes } });
    }
    if (feitos.length) await c.auditar(quem, 'faxina_lote', { tabela: 'leads', detalhes: { quantidade: feitos.length, dias, escopo, motivo: MOTIVO_FAXINA, pulados: pulados.length,
      porEtapa: feitos.reduce((o, f) => { o[f.antes.status] = (o[f.antes.status] || 0) + 1; return o; }, {}), ids: feitos.map(f => f.id).slice(0, 500) } });
    c.limparStats?.();
    json(res, 200, { ok: true, atualizados: feitos.length, feitos, pulados });
    return true;
  }

  if (p === '/api/leads/faxina/desfazer' && m === 'POST') {
    frear('faxina-gravar', 10, 60_000);
    const b = await lerCorpo();
    const itens = Array.isArray(b.itens) ? b.itens.slice(0, 500) : [];
    if (!itens.length) throw falha(400, 'Nada para desfazer.');
    let voltaram = 0; const pulados = [];
    for (const x of itens) {
      if (!x || !ehUuid(x.id) || !x.antes || !x.depois || !R5.ABERTAS.includes(x.antes.status)) { pulados.push(x && x.id); continue; }
      const { data: atual } = await sb.from('leads').select('id,status,observacoes').eq('id', x.id).maybeSingle();
      if (!atual || atual.status !== 'perdido' || (atual.observacoes ?? '') !== texto(x.depois.observacoes, 4000)) { pulados.push(x.id); continue; }
      const { data, error } = await sb.from('leads').update({ status: x.antes.status, observacoes: texto(x.antes.observacoes, 4000) }).eq('id', x.id).eq('status', 'perdido').select('id').maybeSingle();
      if (error || !data) pulados.push(x.id); else voltaram++;
    }
    await c.auditar(quem, 'faxina_desfeita', { tabela: 'leads', detalhes: { quantidade: voltaram, pulados: pulados.length } });
    c.limparStats?.();
    json(res, 200, { ok: true, voltaram, pulados });
    return true;
  }
  return false;
}

module.exports = { rotasR14, ...C };
