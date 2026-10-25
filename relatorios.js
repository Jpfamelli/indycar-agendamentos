/* Rodada 7 (C2) — relatórios do dono: funções PURAS (sem banco, sem tela). O servidor e o servidor de mentira chamam a mesma.
   Responde: a agenda está cheia? quem falta, quando e por quê? como cada consultor está? de onde vêm os clientes? */
import { EXPEDIENTE, STATUS_INDICE, duracaoDoServico, diaDaSemana, somaDias, minutos } from './horarios.js';
import { MOTIVOS_FALTA } from './faltas.js';

const DIA = (v) => String(v || '').slice(0, 10);
const dataOk = (iso) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false; const d = new Date(`${iso}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso; };   // 30/02 não existe
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const dia1 = (n) => Math.round(n * 10) / 10;
export const MINUTOS_DO_EXPEDIENTE = EXPEDIENTE.fecha - EXPEDIENTE.abre;     // 570 por consultor por dia aberto
const VEIO = new Set(['compareceu', 'em_atendimento', 'concluido', 'nao_fechou']);
const ehConfirmado = (a) => a.confirmado === true || a.confirmado === 1 || (a.confirmacao && a.confirmacao.resposta) === 'confirmou';

/** Dias entre duas datas, inclusive (máximo 400, para ninguém pedir dez anos). */
export function diasDoPeriodo(inicio, fim) {
  if (!dataOk(inicio) || !dataOk(fim) || fim < inicio) return [];
  const out = [];
  for (let d = inicio, n = 0; d <= fim && n < 400; d = somaDias(d, 1), n++) out.push(d);
  return out;
}

/** Valida e ajusta o período pedido: padrão = últimos 30 dias até hoje; limite de 180 dias. */
export function periodoPedido({ inicio, fim } = {}, hoje) {
  let f = dataOk(fim) ? fim : hoje;
  let i = dataOk(inicio) ? inicio : somaDias(f, -29);
  if (i > f) [i, f] = [f, i];
  if (diasDoPeriodo(i, f).length > 180) i = somaDias(f, -179);
  return { inicio: i, fim: f, dias: diasDoPeriodo(i, f).length };
}

/** Minutos que o horário ocupa na agenda (a duração do serviço, cortada no fechamento). */
export function minutosDoHorario(a, servicos) {
  const ini = minutos(a && a.hora); if (ini === null) return 0;
  const dur = duracaoDoServico(a.servico, servicos || []);
  return Math.max(0, Math.min(dur, EXPEDIENTE.fecha - ini));
}

export function relatorioDoDono({ lista = [], consultores = [], servicos = [], inicio, fim, anterior = null } = {}) {
  const dias = diasDoPeriodo(inicio, fim);
  const ativos = (consultores || []).filter((c) => c && c.id && c.ativo !== false && c.ativo !== 0);
  const abertos = dias.filter((d) => EXPEDIENTE.dias.includes(diaDaSemana(d)));
  const set = new Set(dias);
  const todos = (lista || []).filter((a) => a && set.has(DIA(a.data)));
  const seguraram = todos.filter((a) => STATUS_INDICE.has(a.status));          // ocuparam a casa (veio, vai vir ou já fechou)
  const faltas = todos.filter((a) => a.status === 'nao_veio');
  const cancelados = todos.filter((a) => a.status === 'cancelado');
  const marcados = todos.filter((a) => a.status !== 'cancelado');
  const encerrados = marcados.filter((a) => VEIO.has(a.status) || a.status === 'nao_veio');       // já tiveram o desfecho de presença
  const vieram = marcados.filter((a) => VEIO.has(a.status));
  const concluidos = marcados.filter((a) => a.status === 'concluido');
  const faturado = concluidos.reduce((s, a) => s + (Number(a.valor) > 0 ? Number(a.valor) : 0), 0);
  const comValor = concluidos.filter((a) => Number(a.valor) > 0);

  // ---- ocupação por dia ----
  const capDia = Math.max(1, ativos.length) * MINUTOS_DO_EXPEDIENTE;
  const porDiaMap = new Map(abertos.map((d) => [d, { data: d, dow: DOW[diaDaSemana(d)], capacidade_min: capDia, ocupado_min: 0, faltas_min: 0, marcados: 0, faltas: 0 }]));
  for (const a of marcados) {
    const d = porDiaMap.get(DIA(a.data)); if (!d) continue;
    const m = minutosDoHorario(a, servicos);
    d.marcados++;
    if (a.status === 'nao_veio') { d.faltas++; d.faltas_min += m; } else d.ocupado_min += m;
  }
  const porDia = [...porDiaMap.values()].map((d) => ({ ...d, pct: pct(d.ocupado_min, d.capacidade_min), pct_com_faltas: pct(d.ocupado_min + d.faltas_min, d.capacidade_min) }));
  const capTotal = capDia * abertos.length;
  const ocupadoTotal = porDia.reduce((s, d) => s + d.ocupado_min, 0);
  const faltasMinTotal = porDia.reduce((s, d) => s + d.faltas_min, 0);
  const diasComMovimento = porDia.filter((d) => d.marcados > 0);
  const melhor = [...diasComMovimento].sort((a, b) => b.pct - a.pct)[0] || null;
  const pior = [...diasComMovimento].sort((a, b) => a.pct - b.pct)[0] || null;

  // ---- dia da semana (média) ----
  const porDiaSemana = [1, 2, 3, 4, 5, 6].map((n) => {
    const ds = porDia.filter((d) => diaDaSemana(d.data) === n);
    const cap = ds.reduce((s, d) => s + d.capacidade_min, 0), oc = ds.reduce((s, d) => s + d.ocupado_min, 0);
    return { dia: DOW[n], dias: ds.length, marcados: ds.reduce((s, d) => s + d.marcados, 0), faltas: ds.reduce((s, d) => s + d.faltas, 0), pct: pct(oc, cap) };
  });

  // ---- por consultor ----
  const nomes = new Map(ativos.map((c) => [c.id, c.nome]));
  const chave = (a) => a.consultor_id || '';
  const ids = [...new Set([...ativos.map((c) => c.id), ...marcados.map(chave)])];
  const porConsultor = ids.map((id) => {
    const meus = marcados.filter((a) => chave(a) === id);
    const ocup = meus.filter((a) => a.status !== 'nao_veio').reduce((s, a) => s + minutosDoHorario(a, servicos), 0);
    const f = meus.filter((a) => a.status === 'nao_veio').length;
    const cap = id ? MINUTOS_DO_EXPEDIENTE * abertos.length : 0;
    const feitos = meus.filter((a) => a.status === 'concluido');
    return {
      consultor_id: id || null, consultor: id ? (nomes.get(id) || (meus[0] && meus[0].consultor_nome) || 'Outro') : 'Sem consultor',
      marcados: meus.length, vieram: meus.filter((a) => VEIO.has(a.status)).length, faltas: f, taxa_falta: pct(f, meus.filter((a) => VEIO.has(a.status) || a.status === 'nao_veio').length),
      ocupado_min: ocup, capacidade_min: cap, pct: cap ? pct(ocup, cap) : null,
      concluidos: feitos.length, faturado: feitos.reduce((s, a) => s + (Number(a.valor) > 0 ? Number(a.valor) : 0), 0),
    };
  }).filter((c) => c.marcados > 0 || c.consultor_id).sort((a, b) => b.marcados - a.marcados);

  // ---- hora do dia (onde a agenda enche e onde sobra) ----
  const porHoraMap = new Map();
  for (const a of seguraram) { const m = minutos(a.hora); if (m === null) continue; const h = Math.floor(m / 60); porHoraMap.set(h, (porHoraMap.get(h) || 0) + 1); }
  const porHora = [];
  for (let h = Math.floor(EXPEDIENTE.abre / 60); h < Math.ceil(EXPEDIENTE.fecha / 60); h++) porHora.push({ hora: `${String(h).padStart(2, '0')}h`, marcados: porHoraMap.get(h) || 0 });

  // ---- origem e serviço ----
  const agrupar = (arr, fn) => { const m = new Map(); for (const a of arr) { const k = fn(a); const v = m.get(k) || { marcados: 0, faltas: 0, vieram: 0 }; v.marcados++; if (a.status === 'nao_veio') v.faltas++; if (VEIO.has(a.status)) v.vieram++; m.set(k, v); } return m; };
  const porOrigem = [...agrupar(marcados, (a) => a.origem || 'Sem origem')].map(([origem, v]) => ({ origem, ...v, taxa_falta: pct(v.faltas, v.vieram + v.faltas) })).sort((a, b) => b.marcados - a.marcados);
  const porServico = [...agrupar(marcados, (a) => a.servico || '—')].map(([servico, v]) => ({ servico, ...v, taxa_falta: pct(v.faltas, v.vieram + v.faltas) })).sort((a, b) => b.marcados - a.marcados).slice(0, 10);

  // ---- faltas ----
  const faltasPorMotivo = MOTIVOS_FALTA.map((m) => ({ id: m.id, rotulo: m.rotulo, n: faltas.filter((a) => a.motivo_falta === m.id).length }));
  const semMotivo = faltas.filter((a) => !a.motivo_falta).length;
  const dosConf = encerrados.filter(ehConfirmado), dosNao = encerrados.filter((a) => !ehConfirmado(a));
  const faltaConf = pct(dosConf.filter((a) => a.status === 'nao_veio').length, dosConf.length);
  const faltaSemConf = pct(dosNao.filter((a) => a.status === 'nao_veio').length, dosNao.length);
  const faltasPorHora = [...agrupar(faltas, (a) => `${String(a.hora || '').slice(0, 2)}h`)].map(([hora, v]) => ({ hora, n: v.marcados })).sort((a, b) => a.hora.localeCompare(b.hora));
  const faltasPorDiaSemana = porDiaSemana.map((d) => ({ dia: d.dia, faltas: d.faltas, marcados: d.marcados, taxa: pct(d.faltas, d.marcados) }));

  const totais = {
    marcados: marcados.length, cancelados: cancelados.length, vieram: vieram.length, faltas: faltas.length, concluidos: concluidos.length,
    taxa_falta: pct(faltas.length, encerrados.length), taxa_comparecimento: pct(vieram.length, encerrados.length),
    confirmados: marcados.filter(ehConfirmado).length, pct_confirmados: pct(marcados.filter(ehConfirmado).length, marcados.length),
    faturado, ticket_medio: comValor.length ? dia1(faturado / comValor.length) : null, concluidos_sem_valor: concluidos.length - comValor.length,
    ocupacao_pct: pct(ocupadoTotal, capTotal), perdido_por_faltas_pct: pct(faltasMinTotal, capTotal), horas_perdidas_por_faltas: dia1(faltasMinTotal / 60),
    dias_abertos: abertos.length, consultores_ativos: ativos.length,
  };

  const rel = {
    periodo: { inicio, fim, dias: dias.length, dias_abertos: abertos.length },
    totais, porDia, porDiaSemana, porConsultor, porHora, porOrigem, porServico,
    faltas: { total: faltas.length, taxa: totais.taxa_falta, porMotivo: faltasPorMotivo, semMotivo, porHora: faltasPorHora, porDiaSemana: faltasPorDiaSemana, taxa_confirmados: faltaConf, taxa_sem_confirmar: faltaSemConf },
    melhorDia: melhor ? { data: melhor.data, dow: melhor.dow, pct: melhor.pct } : null,
    piorDia: pior && melhor && pior.data !== melhor.data ? { data: pior.data, dow: pior.dow, pct: pior.pct } : null,
    comparacao: anterior ? compararPeriodos(totais, anterior) : null,
  };
  rel.destaques = destaquesDoDono(rel);
  return rel;
}

/** Diferença de um período para o anterior (pontos percentuais nas taxas, valores nas contagens). `anterior` = totais do período de antes. */
export function compararPeriodos(atual, anterior) {
  const d = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : dia1(a - b));
  return {
    marcados: d(atual.marcados, anterior.marcados), faltas: d(atual.faltas, anterior.faltas), taxa_falta: d(atual.taxa_falta, anterior.taxa_falta),
    ocupacao_pct: d(atual.ocupacao_pct, anterior.ocupacao_pct), faturado: d(atual.faturado, anterior.faturado),
  };
}

const reais = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const longo = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', 'sáb': 'sábado', dom: 'domingo' };

/** Frases curtas para o dono ler em dez segundos. Só diz o que os números sustentam. */
export function destaquesDoDono(r) {
  const out = [], t = r.totais;
  if (!t.marcados) return ['Nenhum horário marcado neste período.'];
  if (t.ocupacao_pct !== null) out.push(`A agenda ficou ${t.ocupacao_pct}% ocupada (${t.marcados} horários em ${r.periodo.dias_abertos} dias de oficina aberta).`);
  const dias = r.porDiaSemana.filter((d) => d.dias >= 2 && d.pct !== null);
  if (dias.length >= 2) {
    const a = [...dias].sort((x, y) => y.pct - x.pct), top = a[0], baixo = a[a.length - 1];
    if (top.pct - baixo.pct >= 10) out.push(`${longo[top.dia][0].toUpperCase()}${longo[top.dia].slice(1)} é o dia mais cheio (${top.pct}%) e ${longo[baixo.dia]} o mais vazio (${baixo.pct}%): dá para encaixar mais gente na ${longo[baixo.dia]}.`);
  }
  if (t.taxa_falta !== null && r.faltas.total > 0) {
    out.push(`Faltaram ${r.faltas.total} (${t.taxa_falta}% de quem já teve desfecho); isso deixou ${t.horas_perdidas_por_faltas} h de oficina parada.`);
    if (r.faltas.taxa_confirmados !== null && r.faltas.taxa_sem_confirmar !== null && r.faltas.taxa_sem_confirmar - r.faltas.taxa_confirmados >= 5) {
      out.push(`Quem confirmou faltou ${r.faltas.taxa_confirmados}%; quem não confirmou, ${r.faltas.taxa_sem_confirmar}%. Confirmar na véspera funciona.`);
    }
    const mot = [...r.faltas.porMotivo].sort((a, b) => b.n - a.n)[0];
    if (mot && mot.n >= 2 && mot.n / r.faltas.total >= 0.4) out.push(`O motivo mais comum é "${mot.rotulo.toLowerCase()}" (${mot.n} de ${r.faltas.total}).`);
    if (r.faltas.semMotivo / r.faltas.total >= 0.5 && r.faltas.total >= 3) out.push(`${r.faltas.semMotivo} faltas estão sem motivo anotado: um toque no cartão resolve.`);
  }
  const cons = r.porConsultor.filter((c) => c.consultor_id && c.pct !== null);
  if (cons.length >= 2) {
    const a = [...cons].sort((x, y) => y.pct - x.pct);
    if (a[0].pct - a[a.length - 1].pct >= 15) out.push(`${a[0].consultor} está com ${a[0].pct}% de ocupação e ${a[a.length - 1].consultor} com ${a[a.length - 1].pct}%: vale distribuir os próximos horários.`);
  }
  if (t.faturado > 0) out.push(`Fechou ${reais(t.faturado)} em ${t.concluidos} serviços${t.ticket_medio ? ` (ticket médio ${reais(t.ticket_medio)})` : ''}${t.concluidos_sem_valor ? `; ${t.concluidos_sem_valor} concluído${t.concluidos_sem_valor > 1 ? 's' : ''} sem valor` : ''}.`);
  const og = r.porOrigem.filter((o) => o.marcados >= 3 && o.taxa_falta !== null).sort((a, b) => b.taxa_falta - a.taxa_falta)[0];
  if (og && og.taxa_falta >= 20) out.push(`A origem "${og.origem}" falta mais: ${og.taxa_falta}% (${og.faltas} de ${og.vieram + og.faltas}).`);
  return out;
}

/** O resumo pronto para mandar no WhatsApp do dono. */
export function textoDoResumo(r, nomeOficina = 'IndyCar') {
  const f = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const t = r.totais;
  const linhas = [`*${nomeOficina} · agenda de ${f(r.periodo.inicio)} a ${f(r.periodo.fim)}*`,
    `• Horários: ${t.marcados} · vieram ${t.vieram} · faltaram ${t.faltas}${t.taxa_falta !== null ? ` (${t.taxa_falta}%)` : ''}`,
    `• Ocupação: ${t.ocupacao_pct === null ? '—' : t.ocupacao_pct + '%'}${t.horas_perdidas_por_faltas ? ` · ${t.horas_perdidas_por_faltas} h paradas por faltas` : ''}`];
  if (t.faturado > 0) linhas.push(`• Fechado: ${reais(t.faturado)} em ${t.concluidos} serviços`);
  for (const c of r.porConsultor.filter((x) => x.consultor_id).slice(0, 5)) linhas.push(`• ${c.consultor}: ${c.marcados} horários, ${c.pct === null ? '—' : c.pct + '%'} ocupado, ${c.faltas} falta${c.faltas === 1 ? '' : 's'}`);
  for (const d of r.destaques.slice(0, 3)) linhas.push(`→ ${d}`);
  return linhas.join('\n');
}

/** Uma célula de planilha: aspas dobradas, vírgula decimal e sem "fórmula escondida" (=, +, -, @ no começo viram texto). */
export function celulaCsv(v) {
  let t = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = `'${t}`;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
/** O relatório em planilha (abre direto no Excel em português: separador ;). Duas tabelas: por dia e por consultor. */
export function csvDoRelatorio(r) {
  const L = (...c) => c.map(celulaCsv).join(';');
  const linhas = [L('Dia', 'Data', 'Horários', 'Ocupação %', 'Faltas', 'Minutos ocupados', 'Minutos de expediente')];
  for (const d of r.porDia || []) linhas.push(L(d.dow, d.data, d.marcados, d.pct, d.faltas, d.ocupado_min, d.capacidade_min));
  linhas.push('', L('Consultor', 'Horários', 'Vieram', 'Faltas', 'Taxa de falta %', 'Ocupação %', 'Fechado (R$)'));
  for (const c of r.porConsultor || []) linhas.push(L(c.consultor, c.marcados, c.vieram, c.faltas, c.taxa_falta, c.pct, c.faturado));
  linhas.push('', L('Motivo da falta', 'Quantidade'));
  for (const m of (r.faltas && r.faltas.porMotivo) || []) linhas.push(L(m.rotulo, m.n));
  linhas.push(L('Sem motivo anotado', (r.faltas && r.faltas.semMotivo) || 0));
  return linhas.join('\r\n');
}
