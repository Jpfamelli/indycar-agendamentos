// -----------------------------------------------------------------------------
// Prévia do mês (rodada 4) — "o que sairia nos próximos 30 dias se tudo
// estivesse ligado". PURO: recebe os dados já lidos e devolve a projeção por
// dia e por régua (testado em `npm test`; o mock usa a mesma função).
//
// Segue as MESMAS regras dos geradores do dados.js (prazos, janelas de
// recuperação, quem voltou depois não recebe, um convite de revisão por cliente,
// opt-out fora) e as do carteiro (domingo, feriado nacional, intervalo mínimo
// entre mensagens de relacionamento). O que depende do futuro (pós-venda de quem
// ainda vai ser atendido, avaliação de quem vai responder bem) entra como
// ESTIMADO e aparece separado na tela.
// -----------------------------------------------------------------------------
import {
  REGUAS, somarDias, prazoDeRetorno, feriado, instanteSP, telefoneNacional, soDigitos,
  TIPOS_SEGURAM_NO_FERIADO,
} from './dados.js';

const RELACIONAMENTO = new Set(['aniversario', 'retorno', 'reativacao', 'orcamento', 'nao_fechou']);
const dow = (iso) => new Date(iso + 'T12:00:00').getDay();
const diaSP = (instante) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);

/** Dia em que a mensagem sai de verdade: pula domingo (se não envia) e, nas réguas que seguram, feriado. */
export function diaDeSaida(iso, tipo, enviaDomingo) {
  let d = iso;
  for (let i = 0; i < 10; i++) {
    const segura = (!enviaDomingo && dow(d) === 0) || (TIPOS_SEGURAM_NO_FERIADO.has(tipo) && feriado(d));
    if (!segura) return d;
    d = somarDias(d, 1);
  }
  return d;
}

/**
 * @param {object} p
 * @param {string} p.hoje          'AAAA-MM-DD' (fuso da oficina)
 * @param {object} p.cfg           configuração (dados.obterConfig)
 * @param {Array}  p.regras        regras de revisão por serviço
 * @param {Array}  p.agendamentos  id, cliente_id, cliente_nome, telefone, servico, data, hora, status
 * @param {Array}  p.clientes      id, nome, telefone, nascimento, aceita_mensagens
 * @param {Array}  p.leads         id, cliente_id, nome, telefone, status, updated_at
 * @param {number} [p.taxaAvaliacao] fração dos pós-vendas que viram avaliação (histórico)
 * @param {number} [p.dias=30]
 * @param {Date}   [p.agora]
 */
export function projetarMes({ hoje, cfg, regras = [], agendamentos = [], clientes = [], leads = [], taxaAvaliacao = null, dias = 30, agora = new Date() }) {
  const fim = somarDias(hoje, dias);             // exclusivo
  const dentro = (d) => d >= hoje && d < fim;
  const fichas = new Map(clientes.map((c) => [c.id, c]));
  const foraIds = new Set(clientes.filter((c) => c.aceita_mensagens === false).map((c) => c.id));
  const foraTels = new Set(clientes.filter((c) => c.aceita_mensagens === false).map((c) => telefoneNacional(c.telefone)).filter(Boolean));
  const fora = (clienteId, tel) => (clienteId && foraIds.has(clienteId)) || (tel && foraTels.has(telefoneNacional(tel)));
  const itens = [];
  const avisos = [];
  const add = (tipo, data, x, extra = {}) => {
    const tel = x.telefone || fichas.get(x.cliente_id)?.telefone;
    if (!soDigitos(tel)) return;
    if (fora(x.cliente_id, tel)) return;
    const saida = diaDeSaida(data, tipo, !!cfg.envia_domingo);
    if (!dentro(saida)) return;
    itens.push({ tipo, data: saida, cliente_id: x.cliente_id || null, nome: x.nome || x.cliente_nome || fichas.get(x.cliente_id)?.nome || null, telefone: tel, ...extra });
  };

  // visitas por cliente (para "voltou depois" — mesma regra dos geradores)
  const visitas = new Map();
  const ultimoServico = new Map();
  for (const a of agendamentos) {
    if (!a.cliente_id) continue;
    if (!['cancelado', 'nao_veio'].includes(a.status)) {
      const v = visitas.get(a.cliente_id) || [];
      v.push(a.data); visitas.set(a.cliente_id, v);
    }
    if (a.status === 'concluido' && (!ultimoServico.get(a.cliente_id) || ultimoServico.get(a.cliente_id).data <= a.data)) ultimoServico.set(a.cliente_id, a);
  }
  const voltouDepois = (clienteId, data) => (visitas.get(clienteId) || []).some((d) => d > data);

  // ---- lembrete: horários marcados nos próximos 30 dias
  const hLemb = Number(cfg.horas_lembrete) || 20;
  for (const a of agendamentos) {
    if (!['aguardando', 'confirmado'].includes(a.status)) continue;
    if (!(a.data >= hoje && a.data <= fim)) continue;
    const horario = instanteSP(a.data, a.hora || '08:00');
    if (horario.getTime() - agora.getTime() < 3600000) continue;          // menos de 1 h: não sai mais
    let saida = diaSP(new Date(Math.max(horario.getTime() - hLemb * 3600000, agora.getTime())));
    if (!cfg.envia_domingo && dow(saida) === 0) saida = somarDias(saida, 1);
    if (saida > a.data) continue;
    add('lembrete', saida, a, { referente: a.data });
  }

  // ---- pós-venda: concluídos (certo) + marcados que vão ser atendidos (estimado)
  const dPos = Number(cfg.dias_posvenda) || 0;
  const posvendas = [];
  for (const a of agendamentos) {
    const certo = a.status === 'concluido';
    const futuro = ['aguardando', 'confirmado', 'em_atendimento', 'compareceu'].includes(a.status);
    if (!certo && !futuro) continue;
    let d = somarDias(a.data, dPos);
    if (certo && d < hoje && d >= somarDias(hoje, -5)) d = hoje;          // janela de recuperação do gerador
    if (!dentro(d)) continue;
    const antes = itens.length;
    add('posvenda', d, a, futuro ? { estimado: true } : {});
    if (itens.length > antes) posvendas.push(itens[itens.length - 1]);
  }

  // ---- avaliação: só quem responde bem ao pós-venda (estimado pela taxa histórica)
  {
    const taxa = Number.isFinite(taxaAvaliacao) && taxaAvaliacao !== null ? taxaAvaliacao : 0.3;
    let acumulado = 0;
    for (const pv of posvendas) {
      acumulado += taxa;
      if (acumulado >= 1) { acumulado -= 1; add('avaliacao', somarDias(pv.data, 1), pv, { estimado: true }); }
    }
    if (!cfg.link_avaliacao) avisos.push('A régua Avaliação está sem o link do Google: nada sai até cadastrar.');
  }

  // ---- revisão: prazo do serviço vencendo (janela de 7 dias), um convite por cliente
  const convidados = new Set();
  const concluidos = agendamentos.filter((a) => a.status === 'concluido').sort((x, y) => (x.data < y.data ? 1 : -1));
  for (const a of concluidos) {
    const { meses } = prazoDeRetorno(a.servico, regras, Number(cfg.meses_retorno) || 6);
    let vence = somarDias(a.data, meses * 30);
    if (vence < somarDias(hoje, -7)) continue;
    if (vence < hoje) vence = hoje;
    if (!dentro(vence)) continue;
    const chave = a.cliente_id || telefoneNacional(a.telefone);
    if (convidados.has(chave)) continue;
    if (a.cliente_id && voltouDepois(a.cliente_id, a.data)) continue;
    convidados.add(chave);
    add('retorno', vence, a, { meses });
  }

  // ---- aniversário: quem faz aniversário nos próximos 30 dias
  for (const c of clientes) {
    if (!c.nascimento) continue;
    const mmdd = String(c.nascimento).slice(5, 10);
    for (let i = 0; i < dias; i++) {
      const d = somarDias(hoje, i);
      if (d.slice(5) === mmdd) { add('aniversario', d, { cliente_id: c.id, nome: c.nome, telefone: c.telefone }); break; }
    }
  }

  // ---- orçamento parado: N dias depois da última mexida no lead
  const dOrc = Number(cfg.dias_orcamento) || 3;
  let orcamentosAntigos = 0;
  for (const l of leads) {
    if (l.status !== 'orcamento' || !l.updated_at) continue;
    let d = somarDias(diaSP(new Date(l.updated_at)), dOrc);
    if (d < somarDias(hoje, -7)) { if (!fora(l.cliente_id, l.telefone) && soDigitos(l.telefone)) orcamentosAntigos++; continue; }
    if (d < hoje) d = hoje;
    add('orcamento', d, { cliente_id: l.cliente_id, nome: l.nome, telefone: l.telefone });
  }
  if (orcamentosAntigos) avisos.push(`${orcamentosAntigos} orçamento(s) parado(s) há mais de ${dOrc + 7} dias ficam fora da régua (ela pega os de ${dOrc} a ${dOrc + 7} dias). Para esses, uma campanha "fizeram um serviço" ou uma ligação.`);

  // ---- não fechou: N dias depois da visita, se não voltou
  const dNF = Number(cfg.dias_nao_fechou) || 7;
  for (const a of agendamentos) {
    if (a.status !== 'nao_fechou') continue;
    let d = somarDias(a.data, dNF);
    if (d < somarDias(hoje, -5)) continue;
    if (d < hoje) d = hoje;
    if (a.cliente_id && voltouDepois(a.cliente_id, a.data)) continue;
    add('nao_fechou', d, a);
  }

  // ---- reativação: último serviço há N meses, sem voltar (janela de 30 dias)
  const mReat = Number(cfg.meses_reativacao) || 12;
  for (const [clienteId, u] of ultimoServico) {
    let d = somarDias(u.data, mReat * 30);
    if (d < somarDias(hoje, -30)) continue;
    if (d < hoje) d = hoje;
    if (voltouDepois(clienteId, u.data)) continue;
    add('reativacao', d, { ...u, cliente_id: clienteId });
  }

  // ---- intervalo mínimo entre mensagens de relacionamento (mesma pessoa)
  const intervalo = Number(cfg.intervalo_minimo_dias) || 0;
  itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const ultimaRel = new Map();
  const finais = [];
  let seguradosPeloIntervalo = 0;
  for (const it of itens) {
    if (intervalo > 0 && RELACIONAMENTO.has(it.tipo)) {
      const k = it.cliente_id || telefoneNacional(it.telefone);
      const u = ultimaRel.get(k);
      if (u && somarDias(u, intervalo) > it.data) { seguradosPeloIntervalo++; continue; }
      ultimaRel.set(k, it.data);
    }
    finais.push(it);
  }

  // ---- montar a saída
  const porRegua = Object.fromEntries(REGUAS.map((t) => [t, { total: 0, estimados: 0, ligada: !!cfg[`ativo_${t}`], exemplos: [] }]));
  const porDia = new Map();
  for (let i = 0; i < dias; i++) porDia.set(somarDias(hoje, i), { data: somarDias(hoje, i), total: 0, porRegua: {} });
  for (const it of finais) {
    const r = porRegua[it.tipo];
    r.total++; if (it.estimado) r.estimados++;
    if (r.exemplos.length < 6) r.exemplos.push({ nome: it.nome, data: it.data, estimado: !!it.estimado });
    const d = porDia.get(it.data);
    if (d) { d.total++; d.porRegua[it.tipo] = (d.porRegua[it.tipo] || 0) + 1; }
  }
  const total = finais.length;
  const ligadas = finais.filter((i) => cfg[`ativo_${i.tipo}`]).length;
  const listaDias = [...porDia.values()];
  const pico = listaDias.reduce((m, d) => (d.total > m.total ? d : m), { total: 0, data: null });
  const limiteDia = (Number(cfg.limite_por_hora) || 60) * Math.max(1, (Number(cfg.janela_fim) || 20) - (Number(cfg.janela_inicio) || 8));
  if (pico.total > limiteDia) avisos.push(`No dia ${pico.data} sairiam ${pico.total} mensagens — mais que o limite por hora deixa num dia (${limiteDia}). O resto passa para o dia seguinte.`);
  return {
    de: hoje, ate: somarDias(fim, -1), dias: listaDias, porRegua, total, comAsLigadasHoje: ligadas,
    estimados: finais.filter((i) => i.estimado).length, seguradosPeloIntervalo, pico, avisos,
    itens: finais.slice(0, 400).map(({ telefone, ...x }) => x),
  };
}
