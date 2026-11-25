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
    /* R19: o "antes" de cada tarefa fica na auditoria (fotos), e é dela que o Desfazer lê. Antes o Desfazer confiava no
       "antes" que a tela mandava: dava para reabrir ou tomar a tarefa de um colega com um pedido montado à mão. */
    let lote = null;
    if (feitos.length) lote = await c.auditar(quem, 'tarefas_lote', { tabela: 'tarefas', detalhes: { acao: v.acao, quantidade: feitos.length, pulados: pulados.length,
      para: v.responsavel_id || undefined, vence_em: feitos[0].depois.vence_em && v.acao !== 'concluir' && v.acao !== 'reatribuir' ? feitos[0].depois.vence_em : undefined, ids: feitos.map(f => f.id),
      fotos: C.empacotarFotos(feitos) } });
    c.limparCache?.();
    json(res, 200, { ok: true, acao: v.acao, para: v.responsavel_id ? { id: v.responsavel_id, nome: nomePara } : null, atualizadas: feitos.length, feitos, pulados, lote: lote == null ? null : String(lote) });
    return true;
  }

  /* R19: o Desfazer vale só para o que a PRÓPRIA pessoa mudou em lote nos últimos 7 dias, e volta para o "antes" que o
     servidor guardou na auditoria. Do pedido só se aproveitam os ids (o "antes"/"depois" da tela serve apenas para os
     lotes antigos, gravados sem as fotos, e mesmo assim só de tarefa que está num lote dela). */
  if (p === '/api/tarefas/lote/desfazer' && m === 'POST') {
    frear('r18-lote', 12, 60_000);
    const b = await lerCorpo();
    const itens = Array.isArray(b.itens) ? b.itens.slice(0, C.MAX_LOTE) : [];
    if (!itens.length) throw falha(400, 'Nada para desfazer.');
    const daTela = new Map();
    for (const x of itens) if (x && ehUuid(x.id) && !daTela.has(x.id)) daTela.set(x.id, x);
    const pulados = itens.filter(x => !x || !ehUuid(x.id)).map(x => x && x.id);
    let voltaram = 0; const usados = new Set();
    if (daTela.size) {
      const { data: lotes, error: eLotes } = await sb.from('auditoria').select('id,perfil_id,acao,detalhes,created_at').eq('acao', 'tarefas_lote').eq('perfil_id', quem.id)
        .gte('created_at', new Date(agora - C.JANELA_DESFAZER_MS).toISOString()).order('created_at', { ascending: false }).limit(80);
      if (eLotes) throw falha(503, 'Não consegui ler o registro dos lotes. Nada foi mudado.');
      const planos = C.planosDeDesfazer([...daTela.keys()], lotes || [], daTela);
      const atuais = await lerTarefas(sb, [...planos.keys()]);
      for (const id of daTela.keys()) {
        const pl = planos.get(id), t = atuais.get(id);
        if (!pl || !C.aindaComoDepois(t, pl.depois)) { pulados.push(id); continue; }
        const volta = { status: 'aberta', vence_em: pl.antes.vence_em, responsavel_id: pl.antes.responsavel_id };
        let q = sb.from('tarefas').update(volta).eq('id', id).eq('status', pl.depois.status);
        q = pl.depois.responsavel_id ? q.eq('responsavel_id', pl.depois.responsavel_id) : q.is('responsavel_id', null);
        const { data, error } = await q.select('id').maybeSingle();
        if (error || !data) pulados.push(id); else { voltaram++; usados.add(String(pl.lote)); }
      }
    }
    await c.auditar(quem, 'tarefas_lote_desfeito', { tabela: 'tarefas', registro: usados.size === 1 ? [...usados][0] : null, detalhes: { quantidade: voltaram, pulados: pulados.length, lotes: [...usados].slice(0, 20) } });
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
