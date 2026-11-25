/* ============================================================
   IndyCar CRM — rodada 18 (25/11/2026), servidor: a casa em ordem
   1. Tarefas atrasadas em lote (concluir, passar para hoje/amanhã, passar para outra
      pessoa), com contagem antes, Desfazer e registro de quem fez (auditoria).
   2. Contatos "Agendado" sem horário na Agenda (só leitura; voltar a etapa usa o PATCH de sempre).
   Nada é apagado. O Desfazer só volta o que continua exatamente como o lote deixou.
   ============================================================ */
'use strict';

const U = require('./util-servidor');
const R6 = require('./rodada6');
const C = require('../public/r18-casa.js');
const { ehUuid, falha, ehGestor, podeCrm } = U;

const COLS = 'id,titulo,lead_id,cliente_id,responsavel_id,criado_por,vence_em,prioridade,status,origem';
const pedacos = (lista, k) => { const out = []; for (let i = 0; i < lista.length; i += k) out.push(lista.slice(i, i + k)); return out; };

async function nomesDe(sb, ids) {
  const m = new Map(); ids = [...new Set(ids.filter(ehUuid))];
  if (!ids.length) return m;
  const { data } = await sb.from('perfis').select('id,nome').in('id', ids);
  for (const p of data || []) m.set(p.id, p.nome || null);
  return m;
}
async function lerTarefas(sb, ids) {
  const out = [];
  for (const parte of pedacos(ids, 150)) {
    const { data, error } = await sb.from('tarefas').select(COLS).in('id', parte);
    if (error) throw falha(503, 'Não consegui ler as tarefas.');
    out.push(...(data || []));
  }
  return new Map(out.map(t => [t.id, t]));
}

async function rotasR18(c) {
  const { req, res, url, pathname: p, quem, json, lerCorpo, freio } = c;
  const m = req.method, sb = c.sb;
  const ehTarefas = p === '/api/tarefas/atrasadas' || p === '/api/tarefas/lote' || p === '/api/tarefas/lote/desfazer';
  if (!ehTarefas && p !== '/api/agendados-sem-horario') return false;
  if (!sb) throw falha(503, 'Disponível só com o banco compartilhado (Supabase).');
  const gestor = ehGestor(quem.papel);
  const frear = (nome, teto, janela) => { if (!freio.dentro(`${nome}:${quem.id}`, teto, janela)) throw falha(429, 'Muitos pedidos seguidos. Espere um pouco.'); };
  const agora = (c.agora || Date.now)();

  /* ---------- tarefas atrasadas: gestor vê a equipe; atendente, as dele ---------- */
  if (p === '/api/tarefas/atrasadas' && m === 'GET') {
    frear('r18-atrasadas', 60, 60_000);
    const escopo = gestor && url.searchParams.get('escopo') !== 'minhas' ? 'todas' : 'minhas';
    let q = sb.from('tarefas').select(COLS).eq('status', 'aberta').lt('vence_em', new Date(agora).toISOString());
    if (escopo === 'minhas') q = q.eq('responsavel_id', quem.id);
    const { data, error } = await q.order('vence_em', { ascending: true }).limit(1000);
    if (error) throw falha(503, 'Não consegui ler as tarefas atrasadas.');
    const lista = C.ordenarAtrasadas(data || []);
    const idsLead = [...new Set(lista.map(t => t.lead_id).filter(ehUuid))];
    const leads = new Map();
    for (const parte of pedacos(idsLead, 150)) { const { data: ls } = await sb.from('leads').select('id,nome,status').in('id', parte); for (const l of ls || []) leads.set(l.id, l); }
    const nomes = await nomesDe(sb, lista.map(t => t.responsavel_id));
    const itens = lista.map(t => ({ id: t.id, titulo: t.titulo, vence_em: t.vence_em, dias: C.diasAtraso(t.vence_em, agora), prioridade: Number(t.prioridade) || 2,
      lead: t.lead_id ? (leads.get(t.lead_id) || { id: t.lead_id, nome: null, status: null }) : null, responsavel_id: t.responsavel_id || null,
      responsavel_nome: t.responsavel_id ? nomes.get(t.responsavel_id) || null : null, pode_mexer: C.podeMexerTarefa(t, quem, gestor) }));
    json(res, 200, { escopo, total: itens.length, minhas: itens.filter(t => t.responsavel_id === quem.id).length, itens, por_pessoa: C.porPessoa(lista, nomes),
      prazos: { hoje: C.novoPrazo('hoje', agora), amanha: C.novoPrazo('amanha', agora) }, gerado_em: new Date(agora).toISOString() });
    return true;
  }

  /* ---------- lote: concluir / hoje / amanhã / reatribuir ---------- */
  if (p === '/api/tarefas/lote' && m === 'POST') {
    frear('r18-lote', 12, 60_000);
    const v = C.validarLote(await lerCorpo());
    if (v.erro) throw falha(400, v.erro);
    let nomePara = null;
    if (v.acao === 'reatribuir') {
      const { data: pessoa, error } = await sb.from('perfis').select('id,nome,papel,ativo,apps').eq('id', v.responsavel_id).maybeSingle();
      if (error) throw falha(503, 'Não consegui ler a equipe.');
      if (!podeCrm(pessoa)) throw falha(400, 'Essa pessoa não pode receber tarefas do CRM.');
      nomePara = pessoa.nome || null;
    }
    const atuais = await lerTarefas(sb, v.ids);
    const feitos = [], pulados = [];
    for (const id of v.ids) {
      const t = atuais.get(id);
      const fora = C.motivoFora(t, v.acao, quem, gestor, { para: v.responsavel_id });
      if (fora) { pulados.push({ id, titulo: t?.titulo || null, motivo: fora }); continue; }
      const mud = C.mudanca(v.acao, t, { agora, para: v.responsavel_id });
      if (v.acao === 'concluir') mud.concluida_por = quem.id;   // o gatilho não vê auth.uid() no servidor
      const { data, error } = await sb.from('tarefas').update(mud).eq('id', id).eq('status', 'aberta').select(COLS).maybeSingle();
      if (error || !data) { pulados.push({ id, titulo: t.titulo, motivo: 'mudou enquanto gravava' }); continue; }
      feitos.push({ id, titulo: t.titulo, antes: C.foto(t), depois: C.foto(data) });
    }
    if (feitos.length) await c.auditar(quem, 'tarefas_lote', { tabela: 'tarefas', detalhes: { acao: v.acao, quantidade: feitos.length, pulados: pulados.length,
      para: v.responsavel_id || undefined, vence_em: feitos[0].depois.vence_em && v.acao !== 'concluir' && v.acao !== 'reatribuir' ? feitos[0].depois.vence_em : undefined, ids: feitos.map(f => f.id) } });
    c.limparCache?.();
    json(res, 200, { ok: true, acao: v.acao, para: v.responsavel_id ? { id: v.responsavel_id, nome: nomePara } : null, atualizadas: feitos.length, feitos, pulados });
    return true;
  }

  if (p === '/api/tarefas/lote/desfazer' && m === 'POST') {
    frear('r18-lote', 12, 60_000);
    const b = await lerCorpo();
    const itens = Array.isArray(b.itens) ? b.itens.slice(0, C.MAX_LOTE) : [];
    if (!itens.length) throw falha(400, 'Nada para desfazer.');
    const validos = itens.filter(C.itemDesfazerValido);
    const atuais = await lerTarefas(sb, [...new Set(validos.map(x => x.id))]);
    let voltaram = 0; const pulados = itens.filter(x => !C.itemDesfazerValido(x)).map(x => x && x.id);
    for (const x of validos) {
      const t = atuais.get(x.id);
      if (!C.aindaComoDepois(t, x.depois) || !C.podeMexerTarefa(t, quem, gestor) && !C.podeMexerTarefa({ ...t, ...x.antes }, quem, gestor)) { pulados.push(x.id); continue; }
      const volta = { status: 'aberta', vence_em: x.antes.vence_em, responsavel_id: x.antes.responsavel_id };
      const { data, error } = await sb.from('tarefas').update(volta).eq('id', x.id).eq('status', x.depois.status).select('id').maybeSingle();
      if (error || !data) pulados.push(x.id); else voltaram++;
    }
    await c.auditar(quem, 'tarefas_lote_desfeito', { tabela: 'tarefas', detalhes: { quantidade: voltaram, pulados: pulados.length } });
    c.limparCache?.();
    json(res, 200, { ok: true, voltaram, pulados });
    return true;
  }

  /* ---------- agendados sem horário ---------- */
  if (p === '/api/agendados-sem-horario' && m === 'GET') {
    frear('r18-agendados', 30, 60_000);
    if (!c.store) throw falha(503, 'Contatos indisponíveis.');
    const s = await R6.sinaisAgora(c);
    const meus = l => gestor || l.responsavel_id === quem.id || !l.responsavel_id;
    const itens = C.agendadosSemHorario(s.leads.filter(meus), s.sinais, { agora });
    json(res, 200, { total: itens.length, itens, gerado_em: new Date(agora).toISOString() });
    return true;
  }
  throw falha(405, 'método não permitido');
}

module.exports = { rotasR18, ...C };
