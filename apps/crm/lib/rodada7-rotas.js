/* ============================================================
   IndyCar CRM — rodada 7 (25/10/2026, C3), rotas
   Funil que se mexe sozinho, retornos, painel do lead, perdas, indicações,
   origens com o Ads, qualidade dos dados (só leitura) e resumos do dono.
   Regra do atendente: só edita lead dele ou sem dono (travaLead / podeEditarLead).
   ============================================================ */
'use strict';

const U = require('./util-servidor');
const APPS = require('./apps');
const R5 = require('./rodada5');
const R6 = require('./rodada6');
const R7 = require('./rodada7');
const { ehUuid, falha, ehGestor, r2, DIA } = U;
const ABERTAS = R5.ABERTAS;
const e164 = R5.normalizarTelefone;
const ms = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : NaN; };
const iso = t => new Date(t).toISOString();
const pedacos = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function lerSeguro(consulta) { try { const { data, error } = await consulta; return error ? [] : (data || []); } catch { return []; } }
async function lerTodas(fazer) { try { const { data, error } = await U.todas(fazer); return error ? [] : (data || []); } catch { return []; } }
const META_CONTATOS_DIA = Math.max(1, Math.min(200, Number(process.env.CRM_META_CONTATOS_DIA) || 12));

async function rotasR7(c) {
  const { req, res, url, pathname: p, quem, json, freio, sb, prefixo = '' } = c;
  const m = req.method;
  const gestor = ehGestor(quem.papel);
  const precisa = () => { if (!sb) throw falha(503, 'Disponível só com o banco compartilhado (Supabase).'); return sb; };
  const frear = (nome, teto, janela = 60_000) => { if (!freio.dentro(nome + ':' + quem.id, teto, janela)) throw falha(429, 'Muitos pedidos seguidos. Espere um pouco.'); };
  const exigirGestor = msg => { if (!gestor) throw falha(403, msg, { codigo: 'so_gestor' }); };
  const agora = (c.agora || Date.now)();
  const pode = l => (c.podeEditarLead ? !!c.podeEditarLead(l, quem) : true);
  const deColega = async lead => { const t = c.travaLead ? await c.travaLead(quem, lead) : null; if (t) throw falha(403, t.erro, { codigo: t.codigo }); };
  const lerLead = async id => { if (!ehUuid(id)) throw falha(404, 'Lead não encontrado.'); const l = await c.store.getLead(id); if (!l) throw falha(404, 'Lead não encontrado.'); return l; };
  const limpar = () => { R6.esquecerSinais(); if (c.limparCache) c.limparCache(); };
  const nomesDe = async ids => { const u = [...new Set(ids.filter(ehUuid))]; if (!u.length) return new Map(); const r = await lerSeguro(sb.from('perfis').select('id,nome').in('id', u)); return new Map(r.map(x => [x.id, x.nome])); };
  const escopoDe = (leads, pedido) => {
    const esc = gestor ? (['todos', 'meus', 'sem'].includes(pedido) ? pedido : 'todos') : 'meus';
    const f = l => esc === 'sem' ? !l.responsavel_id : esc === 'meus' ? (l.responsavel_id === quem.id || (!gestor && !l.responsavel_id)) : true;
    return { escopo: esc, leads: leads.filter(f) };
  };
  const doLead = (lead, lista, chaveTel = 'telefone') => (lista || []).filter(x => x.lead_id === lead.id || (lead.cliente_id && x.cliente_id === lead.cliente_id) || (e164(lead.telefone) && e164(x[chaveTel]) === e164(lead.telefone)));
  const auditarLote = (acao, detalhes) => c.auditar ? c.auditar(quem, acao, { tabela: 'leads', detalhes }) : null;
  const registrarSistema = async (lead, texto) => { try { await sb.from('crm_atividades').insert({ lead_id: lead.id, cliente_id: lead.cliente_id || null, tipo: 'sistema', texto: String(texto).slice(0, 400), criado_por: quem.id }); } catch { /* o histórico é um extra */ } };

  /* ---------- o funil sugere mover (eventos dos outros sistemas) ---------- */
  if (p === '/api/funil/movimentos' && m === 'GET') {
    precisa(); frear('movimentos', 60);
    const s = await R6.sinaisAgora(c, { forcar: url.searchParams.get('agora') === '1' });
    const porId = new Map(s.leads.map(l => [l.id, l]));
    const todos = R7.sugerirMovimentos(s.leads, s.sinais, { agora, prefixo }).map(mv => ({ ...mv, pode_editar: pode(porId.get(mv.lead_id)) }));
    const visiveis = gestor ? todos : todos.filter(mv => mv.pode_editar);
    const por = {}; for (const mv of visiveis) por[mv.codigo] = (por[mv.codigo] || 0) + 1;
    json(res, 200, { gerado_em: iso(agora), total: visiveis.length, aplicaveis: visiveis.filter(x => x.aplicavel && x.pode_editar).length, para_revisar: visiveis.filter(x => !x.aplicavel).length, por_codigo: por, itens: visiveis.slice(0, 100) });
    return true;
  }
  if (p === '/api/funil/movimentos/aplicar' && m === 'POST') {
    precisa(); frear('movimentos-aplicar', 20);
    const b = await c.lerCorpo();
    const pedidos = Array.isArray(b?.itens) ? b.itens.filter(x => x && ehUuid(x.id)).slice(0, 50) : [];
    if (!pedidos.length) throw falha(400, 'Escolha de 1 a 50 leads.');
    const s = await R6.sinaisAgora(c, { forcar: true });
    const movs = R7.sugerirMovimentos(s.leads, s.sinais, { agora, prefixo });
    const porId = new Map(s.leads.map(l => [l.id, l]));
    const aplicados = [], pulados = [];
    for (const it of pedidos) {
      const lead = porId.get(it.id);
      if (!lead) { pulados.push({ id: it.id, motivo: 'nao_achei' }); continue; }
      if (!pode(lead)) { pulados.push({ id: it.id, nome: lead.nome, motivo: 'lead_de_outro' }); continue; }
      const mv = R7.movimentoAindaVale(movs, lead.id, String(it.para || ''));
      if (!mv) { pulados.push({ id: it.id, nome: lead.nome, motivo: 'mudou' }); continue; }
      const patch = { status: mv.para };
      if (mv.para === 'concluido') {
        const v = Number(it.valor_pago);
        if (!(v > 0 && v <= 10_000_000)) { pulados.push({ id: it.id, nome: lead.nome, motivo: 'falta_valor' }); continue; }
        patch.valor_pago = r2(v);
      }
      if (mv.para === 'perdido') {
        const escolhido = R5.MOTIVOS_PERDA.includes(it.motivo) ? it.motivo : (mv.motivo_perda || 'Outro');
        patch.observacoes = R7.observacoesComMotivo(lead.observacoes, escolhido);
      }
      if (mv.para === 'orcamento' && !(Number(lead.valor_orcado) > 0) && mv.valor_novo > 0) patch.valor_orcado = r2(mv.valor_novo);
      try { await c.store.updateLead(lead.id, patch); } catch { pulados.push({ id: it.id, nome: lead.nome, motivo: 'erro' }); continue; }
      await registrarSistema(lead, `Funil: ${R7.ROTULO_STATUS[lead.status] || lead.status} → ${R7.ROTULO_STATUS[mv.para] || mv.para} (${mv.titulo.toLowerCase()}).`);
      aplicados.push({ id: lead.id, nome: lead.nome, de: lead.status, para: mv.para, codigo: mv.codigo });
    }
    limpar();
    if (aplicados.length) await auditarLote('funil_movimento', { quantidade: aplicados.length, itens: aplicados.slice(0, 50), pulados: pulados.length });
    json(res, 200, { ok: true, aplicados, pulados });
    return true;
  }
  if (p === '/api/funil/movimentos/desfazer' && m === 'POST') {
    precisa(); frear('movimentos-desfazer', 20);
    const b = await c.lerCorpo();
    const pedidos = Array.isArray(b?.itens) ? b.itens.filter(x => x && ehUuid(x.id)).slice(0, 50) : [];
    if (!pedidos.length) throw falha(400, 'Nada para desfazer.');
    const voltaram = [], pulados = [];
    for (const it of pedidos) {
      const lead = await c.store.getLead(it.id);
      if (!lead) { pulados.push({ id: it.id, motivo: 'nao_achei' }); continue; }
      if (!pode(lead)) { pulados.push({ id: it.id, motivo: 'lead_de_outro' }); continue; }
      if (lead.status !== it.para || !ABERTAS.concat(['concluido', 'perdido']).includes(it.de) || it.de === it.para) { pulados.push({ id: it.id, motivo: 'mudou' }); continue; }
      await c.store.updateLead(lead.id, { status: it.de });
      await registrarSistema(lead, `Funil: movimento desfeito (${it.para} → ${it.de}).`);
      voltaram.push(lead.id);
    }
    limpar();
    if (voltaram.length) await auditarLote('funil_movimento_desfeito', { quantidade: voltaram.length });
    json(res, 200, { ok: true, voltaram: voltaram.length, ids: voltaram, pulados });
    return true;
  }

  /* ---------- retornos combinados: atrasados, hoje por período, amanhã, semana ---------- */
  if (p === '/api/retornos' && m === 'GET') {
    precisa(); frear('retornos', 60);
    const todos = await c.store.todosOsLeads();
    const { escopo, leads } = escopoDe(todos, url.searchParams.get('escopo'));
    const nomes = await nomesDe(todos.map(l => l.responsavel_id));
    json(res, 200, { escopo, gerado_em: iso(agora), ...R7.agruparRetornos(leads, { agora, nomes }) });
    return true;
  }

  /* ---------- painel do lead: saúde, melhor hora, canal, atalhos com tudo preenchido ---------- */
  const mp = p.match(/^\/api\/leads\/([0-9a-fA-F-]{36})\/painel$/);
  if (mp && m === 'GET') {
    precisa(); frear('painel-lead', 120);
    const lead = await lerLead(mp[1]);
    const tel = e164(lead.telefone);
    const s = await R6.sinaisAgora(c);
    const sn = s.sinais[lead.id] || { flags: [] };
    const [ativ, conv] = await Promise.all([
      lerSeguro(sb.from('crm_atividades').select('tipo,resultado,texto,created_at,criado_por').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(80)),
      tel ? lerSeguro(sb.from('conversas').select('id').in('telefone_e164', [tel]).limit(1)) : Promise.resolve([]),
    ]);
    const orcAprovado = doLead(lead, s.dados.orcs, 'cliente_telefone').filter(o => o.status === 'aprovado').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
    const agendamento = doLead(lead, s.dados.agendamentos).sort((a, b) => String(a.inicio_em || a.data).localeCompare(String(b.inicio_em || b.data)))[0] || null;
    const os = doLead(lead, s.dados.os).sort((a, b) => R6.ETAPAS_PATIO_ABERTAS.indexOf(b.etapa) - R6.ETAPAS_PATIO_ABERTAS.indexOf(a.etapa))[0] || null;
    const atalhos = R7.atalhosDoLead(lead, { orcAprovado, agendamento, os, conversaId: conv[0]?.id, clienteId: lead.cliente_id }, { prefixo });
    const movimento = R7.sugerirMovimentos([lead], { [lead.id]: sn }, { agora, prefixo })[0] || null;
    const reais = ativ.filter(a => a.tipo !== 'sistema' && a.tipo !== 'nota');
    json(res, 200, { lead_id: lead.id, saude: R7.saudeDoLead(lead, sn, agora), melhor_horario: R7.melhorHorario(reais), canal: R7.canalQueFunciona(reais), tempo: R7.tempoComoLead(lead, ativ, agora), atalhos,
      movimento: movimento ? { ...movimento, pode_editar: pode(lead) } : null,
      automaticos: ativ.filter(a => a.tipo === 'sistema').slice(0, 8).map(a => ({ texto: a.texto, quando: a.created_at })), pode_editar: pode(lead) });
    return true;
  }

  /* ---------- perdas com motivo, o que dava para recuperar ---------- */
  if (p === '/api/perdas' && m === 'GET') {
    precisa(); frear('perdas', 30);
    const dias = Math.max(7, Math.min(365, Number(url.searchParams.get('dias')) || 90));
    const todos = await c.store.todosOsLeads();
    const { escopo, leads } = escopoDe(todos, url.searchParams.get('escopo'));
    const nomes = await nomesDe(leads.map(l => l.responsavel_id));
    const r = R7.analisarPerdas(leads, { agora, dias, nomes });
    json(res, 200, { escopo, ...r, recuperaveis: r.recuperaveis.map(i => ({ ...i, pode_editar: pode(todos.find(l => l.id === i.id)) })) });
    return true;
  }
  if (p === '/api/perdas/reabordar' && m === 'POST') {
    precisa(); frear('perdas-reabordar', 10);
    const b = await c.lerCorpo();
    const ids = Array.isArray(b?.ids) ? [...new Set(b.ids.filter(ehUuid))] : [];
    if (!ids.length || ids.length > 30) throw falha(400, 'Escolha de 1 a 30 leads.');
    const todos = await c.store.todosOsLeads();
    const alvo = todos.filter(l => ids.includes(l.id));
    const reabertos = [], pulados = [];
    const quando = R6.resolverProximo('amanha', agora);
    for (const l of alvo) {
      if (l.status !== 'perdido') { pulados.push({ id: l.id, motivo: 'nao_esta_perdido' }); continue; }
      if (!pode(l)) { pulados.push({ id: l.id, nome: l.nome, motivo: 'lead_de_outro' }); continue; }
      await c.store.updateLead(l.id, { status: 'contato' });
      await sb.from('leads').update({ proximo_contato_em: iso(quando) }).eq('id', l.id);
      if (c.tarefas) { try { await c.tarefas.criar({ titulo: 'Reativação: retomar a conversa com ' + (l.nome || 'cliente'), vence_em: iso(quando), lead_id: l.id, responsavel_id: l.responsavel_id || quem.id }, quem); } catch { /* a tarefa é um extra */ } }
      await registrarSistema(l, 'Lead perdido reaberto para reabordar (retorno combinado para amanhã).');
      reabertos.push({ id: l.id, nome: l.nome });
    }
    limpar();
    pulados.push(...ids.filter(i => !alvo.some(l => l.id === i)).map(id => ({ id, motivo: 'nao_achei' })));
    if (reabertos.length) await auditarLote('perdidos_reabordar', { quantidade: reabertos.length, ids: reabertos.map(x => x.id) });
    json(res, 200, { ok: true, reabertos, pulados, proximo_contato_em: iso(quando) });
    return true;
  }

  /* ---------- indicações: quem indica, quem espera contato, quem merece um obrigado ---------- */
  if (p === '/api/indicacoes/painel' && m === 'GET') {
    precisa(); frear('indicacoes-painel', 30);
    const ind = await lerTodas(() => sb.from('indicacoes').select('id,indicado_por,nome,telefone,status,lead_id,created_at').order('id'));
    const todos = await c.store.todosOsLeads();
    const clientes = new Map();
    for (const parte of pedacos([...new Set(ind.map(i => i.indicado_por).filter(Boolean))], 150)) for (const x of await lerSeguro(sb.from('clientes').select('id,nome,telefone').in('id', parte))) clientes.set(x.id, x);
    const r = R7.painelIndicacoes(ind, todos, clientes, { agora, prefixo });
    const pelaPessoa = lista => gestor ? lista : lista.filter(x => { const l = todos.find(t => t.id === x.lead_id); return l && pode(l); });
    const resp = { ...r, esperando_contato: pelaPessoa(r.esperando_contato), agradecer: pelaPessoa(r.agradecer) };
    if (!gestor) { delete resp.ranking; resp.valor = null; resp.valor_medio = null; resp.agradecer = resp.agradecer.map(a => ({ ...a, valor: null })); }
    json(res, 200, resp);
    return true;
  }

  /* ---------- desempenho por origem, com o gasto do Ads ---------- */
  if (p === '/api/origens/desempenho' && m === 'GET') {
    precisa(); exigirGestor('Só um gestor vê o retorno por origem.'); frear('origens', 20);
    const b = R6.brt(agora);
    const dm = (v, padrao) => { const t = ms(v); return Number.isFinite(t) ? t : padrao; };
    const ini = dm(url.searchParams.get('de'), R6.deBrt(b.a, b.m, 1));
    const fim = dm(url.searchParams.get('ate'), agora) + DIA;
    if (fim <= ini) throw falha(400, 'O período está invertido.');
    if (fim - ini > 400 * DIA) throw falha(400, 'Período longo demais (máx. ~1 ano).');
    const metricas = await lerTodas(() => sb.from('ads_metricas_dia').select('plataforma,data,gasto,fonte').eq('nivel', 'campanha').gte('data', iso(ini).slice(0, 10)).lte('data', iso(fim - DIA).slice(0, 10)).order('id'));
    const fontes = [...new Set(metricas.map(x => x.fonte).filter(Boolean))];
    json(res, 200, { ...R7.desempenhoPorOrigem(await c.store.todosOsLeads(), metricas, { ini, fim }), so_demonstracao: fontes.length > 0 && fontes.every(f => /demo|teste|exemplo/i.test(f)) });
    return true;
  }

  /* ---------- qualidade dos dados: só mostra, não altera nada ---------- */
  if (p === '/api/qualidade/painel' && m === 'GET') {
    precisa(); exigirGestor('Só um gestor vê a qualidade dos dados.'); frear('qualidade-painel', 20);
    const s = await R6.sinaisAgora(c);
    const todos = s.leads;
    const semValor = todos.filter(l => l.status === 'concluido' && !(Number(l.valor_pago) > 0) && !/Cortesia: sem cobran/i.test(l.observacoes || '')).slice(0, 400);
    const ids = semValor.map(l => l.id);
    const ags = [], oss = [];
    for (const parte of pedacos(ids, 150)) { ags.push(...await lerSeguro(sb.from('agendamentos').select('lead_id,valor,data,status').in('lead_id', parte))); oss.push(...await lerSeguro(sb.from('patio_os').select('id,lead_id,numero').in('lead_id', parte))); }
    const extras = [];
    for (const parte of pedacos(oss.map(o => o.id), 150)) extras.push(...await lerSeguro(sb.from('patio_extras').select('os_id,valor,status').in('os_id', parte).eq('status', 'aprovado')));
    const sugestoes = new Map();
    for (const l of semValor) {
      const agL = ags.filter(a => a.lead_id === l.id && Number(a.valor) > 0 && a.status === 'concluido').sort((a, b) => String(b.data).localeCompare(String(a.data)))[0] || null;
      const orc = doLead(l, s.dados.orcs, 'cliente_telefone').filter(o => o.status === 'aprovado').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
      const osIds = new Set(oss.filter(o => o.lead_id === l.id).map(o => o.id));
      const ext = r2(extras.filter(x => osIds.has(x.os_id)).reduce((t, x) => t + (Number(x.valor) || 0), 0));
      const lista = R6.sugestaoValorEntregue({ lead: l, orcamento: orc, extrasAprovados: ext, agendamento: agL });
      if (lista.length) sugestoes.set(l.id, lista);
    }
    json(res, 200, { gerado_em: iso(agora), ...R7.qualidadePainel(todos, { os: s.dados.os, agendamentos: s.dados.agendamentos, orcs: s.dados.orcs, sugestoes }, agora), somente_leitura: true });
    return true;
  }

  /* ---------- resumo do dono: manhã, fechamento do dia, semana ---------- */
  if (p === '/api/dono/resumo' && m === 'GET') {
    precisa(); exigirGestor('Só um gestor vê o resumo do dono.'); frear('dono-resumo', 20);
    const tipo = R7.TIPOS_RESUMO.includes(url.searchParams.get('tipo')) ? url.searchParams.get('tipo') : 'manha';
    json(res, 200, await resumoPronto(tipo));
    return true;
  }
  if (p === '/api/dono/resumo/guardar' && m === 'POST') {
    precisa(); exigirGestor('Só um gestor guarda o resumo do dono.'); frear('dono-resumo-guardar', 20);
    const b = await c.lerCorpo();
    const tipo = R7.TIPOS_RESUMO.includes(b?.tipo) ? b.tipo : 'manha';
    const r = await resumoPronto(tipo);
    const dia = U.diaBRT(agora);
    const { error } = await sb.from('crm_resumos_dono').upsert({ dia, tipo, texto: r.texto, dados: r.numeros, criado_por: quem.id }, { onConflict: 'dia,tipo' });
    if (error) throw falha(503, 'Não consegui guardar o resumo agora.');
    json(res, 201, { ok: true, dia, tipo });
    return true;
  }
  if (p === '/api/dono/resumos' && m === 'GET') {
    precisa(); exigirGestor('Só um gestor vê os resumos guardados.'); frear('dono-resumos', 30);
    const rows = await lerSeguro(sb.from('crm_resumos_dono').select('id,dia,tipo,texto,created_at').order('dia', { ascending: false }).limit(30));
    json(res, 200, { resumos: rows.slice(0, 14).map(x => ({ id: x.id, dia: x.dia, tipo: x.tipo, texto: String(x.texto || '').slice(0, 3500), criado_em: x.created_at })) });
    return true;
  }

  async function resumoPronto(tipo) {
    const r = await R6.resumoDono(c, agora);
    const s = await R6.sinaisAgora(c);
    const b = R6.brt(agora), hoje0 = R6.deBrt(b.a, b.m, b.d), ontem0 = hoje0 - DIA;
    const dia = t => U.diaBRT(t);
    const nasc = (a, z) => s.leads.filter(l => { const t = ms(l.created_at); return t >= a && t < z; }).length;
    const fech = (a, z) => s.leads.filter(l => l.status === 'concluido' && ms(l.closed_at || l.updated_at) >= a && ms(l.closed_at || l.updated_at) < z);
    const soma = ls => r2(ls.reduce((t, l) => t + (Number(l.valor_pago) || 0), 0));
    const [atividades, agHoje, agAmanha, orcHoje] = await Promise.all([
      lerSeguro(sb.from('crm_atividades').select('criado_por,tipo').gte('created_at', iso(hoje0)).neq('tipo', 'sistema')),
      lerSeguro(sb.from('agendamentos').select('id').eq('data', dia(hoje0 + 12 * 3600_000)).in('status', ['aguardando', 'confirmado', 'compareceu', 'em_atendimento', 'concluido'])),
      lerSeguro(sb.from('agendamentos').select('id').eq('data', dia(hoje0 + DIA + 12 * 3600_000)).in('status', ['aguardando', 'confirmado'])),
      lerSeguro(sb.from('orc_orcamentos').select('id').gte('enviado_em', iso(hoje0))),
    ]);
    const porPessoa = new Map();
    for (const a of atividades) if (a.criado_por) porPessoa.set(a.criado_por, (porPessoa.get(a.criado_por) || 0) + 1);
    const nomes = await nomesDe([...porPessoa.keys()]);
    const contatosPorPessoa = [...porPessoa.entries()].map(([id, contatos]) => ({ nome: nomes.get(id) || 'Alguém', contatos })).sort((a, z) => z.contatos - a.contatos);
    const ret = R7.agruparRetornos(s.leads, { agora, nomes }).contagem;
    const fila = [];
    for (const l of s.leads) { if (!ABERTAS.includes(l.status)) continue; const pr = R6.prioridadeFila(l, s.sinais[l.id], agora); if (pr.score >= 85) fila.push({ nome: R7.primeiroNome(l.nome) || l.nome, texto: pr.principal.texto, score: pr.score }); }
    fila.sort((a, z) => z.score - a.score);
    const hojeFech = fech(hoje0, hoje0 + DIA), ontemFech = fech(ontem0, hoje0);
    const semValorTotal = s.leads.filter(l => l.status === 'concluido' && !(Number(l.valor_pago) > 0) && !/Cortesia: sem cobran/i.test(l.observacoes || '')).length;
    const x = { hoje: { leads: nasc(hoje0, hoje0 + DIA), contatos: atividades.length, vendas: hojeFech.length, faturamento: soma(hojeFech), orcamentos_enviados: orcHoje.length },
      ontem: { leads: nasc(ontem0, hoje0), vendas: ontemFech.length, faturamento: soma(ontemFech) }, agenda_hoje: agHoje.length, agenda_amanha: agAmanha.length, retornos: ret, contatos_por_pessoa: contatosPorPessoa,
      prioridades: fila.slice(0, 3), perdas: r.perdas, qualidade: { vendas_sem_valor: semValorTotal } };
    return { tipo, texto: R7.montarResumoDono(tipo, r, x, new Date(agora)), numeros: { ...x, prioridades: undefined }, gerado_em: iso(agora) };
  }

  return false;
}

module.exports = { rotasR7, META_CONTATOS_DIA };
