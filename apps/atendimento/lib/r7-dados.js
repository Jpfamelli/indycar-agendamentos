/* ============================================================
   Rodada 7 (C4) — dados que a tela do Atendimento pede aos outros sistemas.
     · contextoParaLinks   tudo que o Pátio e o Orçador precisam já preenchido (conversa → cliente → carro → pedido → lead/agendamento)
     · horariosReais       vagas de verdade da Agenda (agenda_horarios_livres) dos próximos dias úteis
     · linksCliente        Minha IndyCar / Indique / Acompanhar o carro (r7_p3b_links_cliente)
     · buscaGlobal         r6_busca_global (cliente, placa, telefone, OS, orçamento)
     · agora               r6_agora (pátio, orçamentos, agenda, tarefas num olhar)
   As RPCs rodam COM O JWT de quem está logado (RLS e auth.uid() valem).
   Tudo que vem de texto do cliente passa por R6.campoSeguro / nomeSeguro antes de virar link.
   ============================================================ */
'use strict';

const R6 = require('../public/r6-regras.js');
const R7 = require('../public/r7-regras.js');
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function criarR7Dados({ sb, c5, agora = () => new Date(), log = console.error } = {}) {
  const cache = new Map();
  const doCache = (k, ms) => { const c = cache.get(k); return c && agora().getTime() - c.t < ms ? c.v : null; };
  const guardar = (k, v) => { cache.set(k, { t: agora().getTime(), v }); if (cache.size > 200) cache.delete(cache.keys().next().value); return v; };

  async function nomesDeServicos() {
    const c = doCache('servicos', 10 * 60_000);
    if (c) return c;
    try {
      const { data } = await sb().from('servicos').select('id,nome,duracao_min').eq('ativo', true).limit(200);
      return guardar('servicos', (data || []).map((s) => ({ id: s.id, nome: s.nome, duracao_min: s.duracao_min })));
    } catch (e) { log('serviços:', e.message); return []; }
  }

  async function leadAberto(banco, clienteId, tel) {
    try {
      const col = 'id,servico,placa,carro_modelo,status,created_at';
      const buscas = [];
      if (clienteId) buscas.push(banco.from('leads').select(col).eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(5));
      if (tel) buscas.push(banco.from('leads').select(col).eq('telefone_e164', String(tel).replace(/[^d+]/g, '')).order('created_at', { ascending: false }).limit(5));
      const lin = (await Promise.all(buscas)).flatMap((r) => r.data || []).filter((l) => !['concluido', 'perdido'].includes(l.status));
      lin.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
      return lin[0] || null;
    } catch (e) { log('lead aberto:', e.message); return null; }
  }

  /** Tudo que os links "Abrir entrada no Pátio" e "Criar orçamento" levam. Nada daqui carrega mensagem inteira: só serviço do catálogo e a queixa curta. */
  async function contextoParaLinks(conversaId) {
    if (!RE_UUID.test(String(conversaId || ''))) return { ok: false, status: 400, erro: 'id de conversa inválido' };
    const banco = sb();
    const { data: cv, error } = await banco.from('conversas').select('id,cliente_id,telefone,telefone_e164,nome,atribuida_a').eq('id', conversaId).maybeSingle();
    if (error) { log('ctx links:', error.message); return { ok: false, status: 503, erro: 'Não consegui ler a conversa agora.' }; }
    if (!cv) return { ok: false, status: 404, erro: 'Conversa não encontrada.' };
    const tel = cv.telefone_e164 || cv.telefone;
    let [cli, msgs, lead, agd, os, servicos] = await Promise.all([
      cv.cliente_id ? banco.from('clientes').select('id,nome,carro_modelo,carro_ano,placa').eq('id', cv.cliente_id).maybeSingle().then((r) => r.data).catch(() => null) : null,
      banco.from('whatsapp_mensagens').select('corpo,created_at').eq('conversa_id', conversaId).eq('direcao', 'entrada').order('created_at', { ascending: false }).limit(8).then((r) => r.data || []).catch(() => []),
      leadAberto(banco, cv.cliente_id, tel),
      cv.cliente_id ? banco.from('agendamentos').select('id,data,hora,status,servico_id').eq('cliente_id', cv.cliente_id).in('status', ['aguardando', 'confirmado']).gte('data', agora().toISOString().slice(0, 10)).order('data').limit(1).then((r) => r.data?.[0] || null).catch(() => null) : null,
      cv.cliente_id ? banco.from('patio_os').select('id,numero,etapa,placa,veiculo').eq('cliente_id', cv.cliente_id).not('etapa', 'in', '(entregue,cancelado)').order('created_at', { ascending: false }).limit(1).then((r) => r.data?.[0] || null).catch(() => null) : null,
      nomesDeServicos(),
    ]);
    // [OS NNN] vindo da página Acompanhar: só o número, só OS do MESMO telefone da conversa
    let osMarcada = null;
    for (const m of msgs) {
      const n = R7.marcadorOS(m.corpo);
      if (n == null) continue;
      try {
        const { data: o } = await banco.from('patio_os').select('id,numero,etapa,placa,veiculo,telefone,cliente_id').eq('numero', n).maybeSingle();
        if (o && R7.mesmoTelefone(o.telefone, tel)) osMarcada = o;
      } catch (e) { log('OS marcada:', e.message); }
      break;
    }
    if (osMarcada && !os) os = osMarcada;
    const textos = msgs.map((m) => String(m.corpo || '')).filter((t) => t && !R6.detectarManipulacao(t).suspeita);
    const citados = R7.servicosCitados(textos.slice(0, 5), servicos.map((s) => s.nome));
    const manipulou = msgs.some((m) => R6.detectarManipulacao(String(m.corpo || '')).suspeita);
    const placa = (os?.placa || cli?.placa || lead?.placa || '').toString();
    const carro = os?.veiculo || cli?.carro_modelo || lead?.carro_modelo || '';
    const base = {
      conversaId, clienteId: cv.cliente_id || null, telefone: tel, nome: cli?.nome || cv.nome || '', placa, carro,
      ano: cli?.carro_ano || null, leadId: lead?.id || null, agendamentoId: agd?.id || null, osId: os?.id || null,
      servico: citados.join(' + ') || (lead?.servico ? R6.campoSeguro(lead.servico, 120) : ''), pedido: citados.join(' + ') || (lead?.servico ? R6.campoSeguro(lead.servico, 120) : ''),
    };
    return {
      ok: true, os_marcada: osMarcada ? { id: osMarcada.id, numero: osMarcada.numero, etapa: osMarcada.etapa, veiculo: osMarcada.veiculo || null, placa: osMarcada.placa || null } : null, manipulacao: manipulou, citados, servicos_citados_ids: servicos.filter((s) => citados.includes(s.nome)).map((s) => s.id),
      os: os ? { id: os.id, numero: os.numero, etapa: os.etapa } : null, agendamento: agd ? { id: agd.id, data: agd.data, hora: String(agd.hora || '').slice(0, 5) } : null,
      lead: lead ? { id: lead.id, servico: lead.servico || null } : null, consultor_id: cv.atribuida_a || null,
      entrada_patio: R7.linkEntradaPatio(base), nova_cotacao: R7.linkNovaCotacaoCompleta(base), nova_cotacao_ia: base.pedido ? R7.linkNovaCotacaoCompleta(base, { ia: true }) : null,
      dados: { ...base, ano: base.ano ? Number(base.ano) || null : null },
    };
  }

  /** Vagas reais dos próximos dias úteis. A Agenda decide quem está livre (expediente, almoço, capacidade, bloqueios). */
  async function horariosReais(token, { servico = null, consultor = null, dias = 5 } = {}) {
    const k = `hor:${servico || ''}:${consultor || ''}:${dias}`;
    const c = doCache(k, 20_000);
    if (c) return c;
    const lista = R7.proximosDiasUteis(agora(), Math.min(Math.max(Number(dias) || 5, 1), 7));
    const respostas = await Promise.all(lista.map((d) => c5.rpcComoUsuario(token, 'agenda_horarios_livres', { p_dia: d, p_servico: servico || null, p_consultor: RE_UUID.test(String(consultor || '')) ? consultor : null })));
    if (respostas.every((r) => !r.ok)) return { ok: false, status: respostas[0]?.motivo === 'sem_permissao' ? 403 : 503, erro: 'Não consegui consultar a Agenda agora. Escolha o horário digitando.', motivo: respostas[0]?.motivo };
    const dados = respostas.map((r, i) => (r.ok && r.dados ? { ...r.dados, data: r.dados.data || lista[i] } : null));
    const resumo = R7.resumirDias(dados, agora());
    const r = { ok: true, dias: resumo, sugestoes: R7.duasOpcoes(resumo).map((o) => ({ ...o, texto: R7.textoOpcao(o) })), atualizado_em: agora().toISOString() };
    return guardar(k, r);
  }

  async function linksCliente(token, telefone) {
    const tel = R7.telE164(telefone);
    if (!tel) return { ok: false, status: 400, erro: 'telefone inválido' };
    const r = await c5.rpcComoUsuario(token, 'r7_p3b_links_cliente', { p_telefone: tel });
    if (!r.ok) return { ok: false, status: r.motivo === 'sem_permissao' ? 403 : 503, erro: 'Não consegui gerar os links agora.', motivo: r.motivo };
    const d = r.dados || {};
    if (d.ok === false) return { ok: false, status: 404, erro: d.erro || d.motivo || 'Cliente sem cadastro para gerar os links.' };
    return { ok: true, nome: d.nome || null, aceita_mensagens: d.aceita_mensagens !== false, minha: d.minha || null, indique: d.indique || null, acompanhar: d.acompanhar || null, os: d.os || null };
  }

  async function buscaGlobal(token, termo, limite = 8) {
    const t = String(termo || '').trim().slice(0, 80);
    if (t.length < 2) return { ok: true, total: 0, grupos: {}, pessoas: [], aviso: 'Digite pelo menos 2 letras ou 4 números.' };
    const r = await c5.rpcComoUsuario(token, 'r6_busca_global', { p_termo: t, p_limite: Math.min(Math.max(Number(limite) || 8, 1), 20) });
    if (!r.ok) return { ok: false, status: r.motivo === 'sem_permissao' ? 403 : 503, erro: 'A busca geral não respondeu agora.' };
    return { ok: true, ...(r.dados || {}) };
  }

  async function agoraGeral(token) {
    const c = doCache('agora:' + String(token).slice(-12), 15_000);
    if (c) return c;
    const r = await c5.rpcComoUsuario(token, 'r6_agora', { p_limite: 12 });
    if (!r.ok) return { ok: false, status: r.motivo === 'sem_permissao' ? 403 : 503, erro: 'O resumo do dia não respondeu agora.' };
    return guardar('agora:' + String(token).slice(-12), { ok: true, ...(r.dados || {}) });
  }

  /** Quem tentou manipular a IA nas últimas 24 h (chip 🛡 na fila). */
  async function conversasComManipulacao(horas = 24) {
    try {
      const desde = new Date(agora().getTime() - horas * 3_600_000).toISOString();
      const { data } = await sb().from('ia_acoes').select('conversa_id,created_at').eq('tipo', 'bloqueio_manipulacao').gte('created_at', desde).limit(200);
      return [...new Set((data || []).map((x) => x.conversa_id).filter(Boolean))];
    } catch (e) { log('manipulação:', e.message); return []; }
  }

  /** Clientes que deram nota ruim (≤3) e ainda não tiveram resposta: a conversa deles sobe na fila. */
  async function avaliacoesRuins(dias = 14) {
    try {
      const desde = new Date(agora().getTime() - dias * 86_400_000).toISOString();
      const { data, error } = await sb().from('patio_avaliacoes').select('os_id,cliente_id,nota,created_at,respondido_em').lte('nota', 3).gte('created_at', desde).limit(100);
      if (error) return [];
      return (data || []).filter((a) => !a.respondido_em);
    } catch (e) { log('avaliações ruins:', e.message); return []; }
  }

  return { contextoParaLinks, horariosReais, linksCliente, buscaGlobal, agoraGeral, conversasComManipulacao, avaliacoesRuins, nomesDeServicos };
}

module.exports = { criarR7Dados };
