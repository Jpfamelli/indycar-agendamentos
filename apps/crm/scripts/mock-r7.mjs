// Rodada 7 (C3): rotas do servidor FALSO para a interface nova. Mesmos contratos do servidor real
// (lib/rodada7-rotas.js), com dados inventados em memória e as MESMAS funções puras (lib/rodada7.js).
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const req_ = createRequire(import.meta.url);
const R5 = req_('../lib/rodada5.js');
const R6 = req_('../lib/rodada6.js');
const R7 = req_('../lib/rodada7.js');
const DIA = 86400000;
const ABERTAS = R5.ABERTAS;
const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarRotasMockR7(ctx) {
  const { ativ, getTarefas, indicacoes, EU, equipeDe } = ctx;
  const leads0 = ctx.getLeads();
  const resumosGuardados = [];
  const hAtras = h => new Date(Date.now() - h * 3600000).toISOString();

  /* o rastro automático do funil em alguns leads, para a ficha mostrar "automático" */
  leads0.filter(l => ABERTAS.includes(l.status)).slice(0, 12).forEach((l, i) => {
    ativ.push({ id: crypto.randomUUID(), lead_id: l.id, tipo: 'sistema', resultado: null, texto: i % 2 ? `Orçamento nº ${300 + i} enviado ao cliente (R$ ${800 + i * 10},00).` : 'Horário marcado para 28/10 às 09:00 (Revisão).', criado_por: null, autor: null, created_at: hAtras(5 + i) });
  });

  /** o que os outros sistemas contam agora (mesma montagem do bloco da rodada 6, mais horários de amanhã) */
  function dadosMock(agora) {
    const leads = ctx.getLeads();
    const abertos = leads.filter(l => ABERTAS.includes(l.status));
    const amanha = new Date(agora + DIA).toISOString().slice(0, 10);
    return {
      os: abertos.filter((_, i) => i % 9 === 0).map((l, i) => ({ id: 'os-' + l.id, numero: 100 + i, etapa: ['recebido', 'em_execucao', 'pronto'][i % 3], etapa_em: hAtras(3 + i), lead_id: l.id, cliente_id: l.cliente_id, telefone: l.telefone, placa: l.placa })),
      entregues: abertos.filter((_, i) => i % 13 === 5).map((l, i) => ({ id: 'ose-' + l.id, numero: 200 + i, etapa: 'entregue', entregue_em: hAtras(30 + i * 10), lead_id: l.id, cliente_id: l.cliente_id, telefone: l.telefone, placa: l.placa })),
      extras: [],
      orcs: abertos.filter((_, i) => i % 7 === 3).map((l, i) => ({ id: 'orc-' + l.id, numero: 300 + i, status: i % 4 === 0 ? 'aprovado' : 'enviado', lead_id: l.id, cliente_id: l.cliente_id, cliente_telefone: l.telefone, total: 800 + i * 10, enviado_em: hAtras(24 * (1 + (i % 4))), visualizado_em: i % 3 === 0 ? hAtras(30) : null, created_at: hAtras(24 * (1 + (i % 4))) })),
      conversas: abertos.filter((_, i) => i % 11 === 2).map((l, i) => ({ id: 'cv-' + l.id, telefone_e164: R5.normalizarTelefone(l.telefone), aguardando_desde: hAtras(2 + i) })),
      tarefas: getTarefas().filter(t => t.status === 'aberta' && t.lead_id),
      agendamentos: abertos.filter((_, i) => i % 6 === 1).map((l, i) => ({ id: 'ag-' + l.id, lead_id: l.id, cliente_id: l.cliente_id, telefone: l.telefone, data: amanha, hora: '09:00', inicio_em: `${amanha}T09:00:00-03:00`, status: 'confirmado', observacoes: '' })),
    };
  }
  const pode = (l, gestor) => gestor || !l.responsavel_id || l.responsavel_id === EU;
  const nomesMap = pp => new Map(equipeDe(pp).map(x => [x.id, x.nome]));
  const escopo = (gestor, pedido) => { const e = gestor ? (['todos', 'meus', 'sem'].includes(pedido) ? pedido : 'todos') : 'meus'; return { e, f: l => e === 'sem' ? !l.responsavel_id : e === 'meus' ? (l.responsavel_id === EU || (!gestor && !l.responsavel_id)) : true }; };

  function resumoMock(agora) {
    const leads = ctx.getLeads();
    const abertos = leads.filter(l => ABERTAS.includes(l.status));
    const mes = R6.janela(leads, agora - 20 * DIA, agora + 1);
    const r = { gerado_em: new Date(agora).toISOString(), mes: { ...mes, mes: new Date(agora).toISOString().slice(0, 7), ritmo: R6.ritmoMeta({ realizado: mes.faturamento, meta: 40000, agora }), meta_loja: { faturamento: 40000 } },
      semana: R6.janela(leads, agora - 7 * DIA, agora + 1), anterior: R6.janela(leads, agora - 14 * DIA, agora - 7 * DIA),
      patio: { no_patio: 4, por_etapa: {}, prontos: 1, entregues_hoje: 1, entregues_sem_fechar: 2, extras_pendentes: 0 }, orcamentos: { enviados: 4, valor_enviado: 3600, parados: 2, valor_parado: 1800, aprovados_sem_horario: 1 },
      conversas: { esperando: 3, maior_espera_h: 9 }, avaliacoes: { media: 4.6, total: 8, detratores: 0 }, ads: { gasto_mes: 530, leads: 18, ganhos: 3, faturamento: 4200, roas: 7.9, melhor: null, pior: null, alertas: 1 },
      agenda: { no_show_pct: 8, fechadas: 20 }, perdas: [{ motivo: 'Achou caro', qtd: 4 }], vendedores: [], qualidade: { sem_dono: abertos.filter(l => !l.responsavel_id).length, tarefas_atrasadas: 2, followups_vencidos: 1 }, abertos: { total: abertos.length, valor: 5200 } };
    r.insights = R6.insightsDono(r);
    return r;
  }

  return async function rotas({ p, req, url, d, json, pp, gestor, agora = Date.now() }) {
    const m = req.method, leads = ctx.getLeads(), clientes = ctx.getClientes();
    if (p === '/api/funil/movimentos' && m === 'GET') {
      const dados = dadosMock(agora), sinais = R6.construirSinais(leads, dados, agora);
      const todos = R7.sugerirMovimentos(leads, sinais, { agora }).map(x => ({ ...x, pode_editar: pode(leads.find(l => l.id === x.lead_id), gestor) }));
      const vis = gestor ? todos : todos.filter(x => x.pode_editar);
      return json({ gerado_em: new Date(agora).toISOString(), total: vis.length, aplicaveis: vis.filter(x => x.aplicavel && x.pode_editar).length, para_revisar: vis.filter(x => !x.aplicavel).length, itens: vis.slice(0, 100) });
    }
    if (p === '/api/funil/movimentos/aplicar' && m === 'POST') {
      const dados = dadosMock(agora), sinais = R6.construirSinais(leads, dados, agora), movs = R7.sugerirMovimentos(leads, sinais, { agora });
      const aplicados = [], pulados = [];
      for (const it of (Array.isArray(d.itens) ? d.itens : []).slice(0, 50)) {
        const l = leads.find(x => x.id === it.id); if (!l) { pulados.push({ id: it.id, motivo: 'nao_achei' }); continue; }
        if (!pode(l, gestor)) { pulados.push({ id: l.id, nome: l.nome, motivo: 'lead_de_outro' }); continue; }
        const mv = R7.movimentoAindaVale(movs, l.id, String(it.para || '')); if (!mv) { pulados.push({ id: l.id, nome: l.nome, motivo: 'mudou' }); continue; }
        if (mv.para === 'concluido') { const v = Number(it.valor_pago); if (!(v > 0)) { pulados.push({ id: l.id, nome: l.nome, motivo: 'falta_valor' }); continue; } l.valor_pago = v; }
        if (mv.para === 'perdido') l.observacoes = R7.observacoesComMotivo(l.observacoes, R5.MOTIVOS_PERDA.includes(it.motivo) ? it.motivo : (mv.motivo_perda || 'Outro'));
        if (mv.para === 'orcamento' && !(Number(l.valor_orcado) > 0) && mv.valor_novo > 0) l.valor_orcado = mv.valor_novo;
        const de = l.status; l.status = mv.para; l.updated_at = new Date(agora).toISOString();
        ativ.unshift({ id: crypto.randomUUID(), lead_id: l.id, tipo: 'sistema', texto: `Funil: ${R7.ROTULO_STATUS[de]} → ${R7.ROTULO_STATUS[mv.para]} (${mv.titulo.toLowerCase()}).`, criado_por: EU, created_at: new Date(agora).toISOString() });
        aplicados.push({ id: l.id, nome: l.nome, de, para: mv.para, codigo: mv.codigo });
      }
      return json({ ok: true, aplicados, pulados });
    }
    if (p === '/api/funil/movimentos/desfazer' && m === 'POST') {
      const voltaram = [], pulados = [];
      for (const it of (Array.isArray(d.itens) ? d.itens : [])) { const l = leads.find(x => x.id === it.id); if (!l || l.status !== it.para) { pulados.push({ id: it.id, motivo: 'mudou' }); continue; } l.status = it.de; voltaram.push(l.id); }
      return json({ ok: true, voltaram: voltaram.length, ids: voltaram, pulados });
    }
    if (p === '/api/retornos' && m === 'GET') {
      const { e, f } = escopo(gestor, url.searchParams.get('escopo'));
      return json({ escopo: e, gerado_em: new Date(agora).toISOString(), ...R7.agruparRetornos(leads.filter(f), { agora, nomes: nomesMap(pp) }) });
    }
    const mp = p.match(/^\/api\/leads\/([0-9a-f-]{36})\/painel$/);
    if (mp && m === 'GET') {
      const l = leads.find(x => x.id === mp[1]); if (!l) return json({ erro: 'Lead não encontrado.' }, 404);
      const dados = dadosMock(agora), sinais = R6.construirSinais(leads, dados, agora), sn = sinais[l.id] || { flags: [] };
      const doL = lista => lista.filter(x => x.lead_id === l.id);
      const orcAprovado = doL(dados.orcs).find(o => o.status === 'aprovado') || null, agendamento = doL(dados.agendamentos)[0] || null, os = doL(dados.os)[0] || null;
      const reais = ativ.filter(a => a.lead_id === l.id && a.tipo !== 'sistema' && a.tipo !== 'nota');
      const mov = R7.sugerirMovimentos([l], { [l.id]: sn }, { agora })[0] || null;
      return json({ lead_id: l.id, saude: R7.saudeDoLead(l, sn, agora), melhor_horario: R7.melhorHorario(reais), canal: R7.canalQueFunciona(reais), tempo: R7.tempoComoLead(l, ativ.filter(a => a.lead_id === l.id), agora),
        atalhos: R7.atalhosDoLead(l, { orcAprovado: orcAprovado && { id: crypto.randomUUID() }, agendamento: agendamento && { id: crypto.randomUUID() }, os: os && { id: crypto.randomUUID(), numero: os.numero, etapa: os.etapa }, conversaId: crypto.randomUUID() }),
        movimento: mov ? { ...mov, pode_editar: pode(l, gestor) } : null, automaticos: ativ.filter(a => a.lead_id === l.id && a.tipo === 'sistema').slice(0, 8).map(a => ({ texto: a.texto, quando: a.created_at })), pode_editar: pode(l, gestor) });
    }
    if (p === '/api/perdas' && m === 'GET') {
      const dias = Math.max(7, Math.min(365, Number(url.searchParams.get('dias')) || 90)), { e, f } = escopo(gestor, url.searchParams.get('escopo'));
      const r = R7.analisarPerdas(leads.filter(f), { agora, dias, nomes: nomesMap(pp) });
      return json({ escopo: e, ...r, recuperaveis: r.recuperaveis.map(i => ({ ...i, pode_editar: pode(leads.find(l => l.id === i.id), gestor) })) });
    }
    if (p === '/api/perdas/reabordar' && m === 'POST') {
      const ids = Array.isArray(d.ids) ? [...new Set(d.ids.filter(x => EH_UUID.test(String(x))))] : [];
      if (!ids.length || ids.length > 30) return json({ erro: 'Escolha de 1 a 30 leads.' }, 400);
      const reabertos = [], pulados = [], quando = R6.resolverProximo('amanha', agora);
      for (const id of ids) { const l = leads.find(x => x.id === id); if (!l) { pulados.push({ id, motivo: 'nao_achei' }); continue; } if (l.status !== 'perdido') { pulados.push({ id, motivo: 'nao_esta_perdido' }); continue; } if (!pode(l, gestor)) { pulados.push({ id, motivo: 'lead_de_outro' }); continue; }
        l.status = 'contato'; l.proximo_contato_em = new Date(quando).toISOString(); reabertos.push({ id, nome: l.nome }); }
      return json({ ok: true, reabertos, pulados, proximo_contato_em: new Date(quando).toISOString() });
    }
    if (p === '/api/indicacoes/painel' && m === 'GET') {
      const cl = new Map(clientes.map(c => [c.id, c]));
      const r = R7.painelIndicacoes(indicacoes, leads, cl, { agora });
      const filtra = lista => gestor ? lista : lista.filter(x => { const l = leads.find(t => t.id === x.lead_id); return l && pode(l, gestor); });
      const resp = { ...r, esperando_contato: filtra(r.esperando_contato), agradecer: filtra(r.agradecer) };
      if (!gestor) { delete resp.ranking; resp.valor = null; resp.valor_medio = null; }
      return json(resp);
    }
    if (p === '/api/origens/desempenho' && m === 'GET') {
      if (!gestor) return json({ erro: 'Só um gestor vê o retorno por origem.', codigo: 'so_gestor' }, 403);
      const de = url.searchParams.get('de'), ini = de ? Date.parse(de) : agora - 30 * DIA, fim = agora + DIA;
      const met = [{ plataforma: 'meta', gasto: 320 }, { plataforma: 'google', gasto: 210 }];
      return json({ ...R7.desempenhoPorOrigem(leads, met, { ini, fim }), so_demonstracao: true });
    }
    if (p === '/api/qualidade/painel' && m === 'GET') {
      if (!gestor) return json({ erro: 'Só um gestor vê a qualidade dos dados.', codigo: 'so_gestor' }, 403);
      const dados = dadosMock(agora), sug = new Map();
      for (const l of leads.filter(x => x.status === 'concluido' && !(Number(x.valor_pago) > 0)).slice(0, 40)) sug.set(l.id, [{ rotulo: 'Orçado no CRM', valor: 450 }]);
      return json({ gerado_em: new Date(agora).toISOString(), ...R7.qualidadePainel(leads, { os: dados.os, agendamentos: dados.agendamentos, orcs: dados.orcs, sugestoes: sug }, agora), somente_leitura: true });
    }
    if (p === '/api/dono/resumo' && m === 'GET') {
      if (!gestor) return json({ erro: 'Só um gestor vê o resumo do dono.', codigo: 'so_gestor' }, 403);
      const tipo = R7.TIPOS_RESUMO.includes(url.searchParams.get('tipo')) ? url.searchParams.get('tipo') : 'manha', r = resumoMock(agora);
      const x = { hoje: { leads: 3, contatos: ativ.filter(a => a.criado_por === EU && a.tipo !== 'sistema').length, vendas: 1, faturamento: 700, orcamentos_enviados: 2 }, ontem: { leads: 5, vendas: 2, faturamento: 1500 }, agenda_hoje: 6, agenda_amanha: 5, retornos: { hoje: 4, atrasados: 2 },
        contatos_por_pessoa: [{ nome: 'Equipe de teste', contatos: 3 }], prioridades: [{ nome: 'Carla', texto: 'Cliente esperando resposta há 3 h' }], perdas: r.perdas, qualidade: { vendas_sem_valor: leads.filter(l => l.status === 'concluido' && !(Number(l.valor_pago) > 0)).length } };
      return json({ tipo, texto: R7.montarResumoDono(tipo, r, x, new Date(agora)), numeros: x, gerado_em: new Date(agora).toISOString() });
    }
    if (p === '/api/dono/resumo/guardar' && m === 'POST') {
      if (!gestor) return json({ erro: 'Só um gestor guarda o resumo do dono.', codigo: 'so_gestor' }, 403);
      const tipo = R7.TIPOS_RESUMO.includes(d.tipo) ? d.tipo : 'manha', dia = new Date(agora).toISOString().slice(0, 10);
      const texto = R7.montarResumoDono(tipo, resumoMock(agora), {}, new Date(agora)), i = resumosGuardados.findIndex(x => x.dia === dia && x.tipo === tipo);
      const novo = { id: crypto.randomUUID(), dia, tipo, texto, criado_em: new Date(agora).toISOString() }; if (i >= 0) resumosGuardados[i] = novo; else resumosGuardados.unshift(novo);
      return json({ ok: true, dia, tipo }, 201);
    }
    if (p === '/api/dono/resumos' && m === 'GET') {
      if (!gestor) return json({ erro: 'Só um gestor vê os resumos guardados.', codigo: 'so_gestor' }, 403);
      return json({ resumos: resumosGuardados.slice(0, 14) });
    }
    return null;
  };
}
