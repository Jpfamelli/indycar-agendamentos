// -----------------------------------------------------------------------------
// HORÁRIOS LIVRES COMO SERVIÇO (rodada 5, 16/10/2026) — funções PURAS, sem
// banco e sem rede, testadas em tests/horarios.test.mjs. É daqui que a IA do
// Atendimento (e qualquer outro app) descobre que horário oferecer ao cliente.
//
// As regras são as da oficina (regras de sempre, as mesmas de dados.js ›
// horariosLivres): seg–sáb, das 8h às 17h30, em passos de 30 min; cada horário
// ativo ocupa a meia hora em que começa; a recepção comporta tantos carros por
// meia hora quantos consultores ativos houver; um consultor nunca tem dois
// carros na mesma meia hora (índice agendamentos_slot_uk). Novidades aqui:
//   · DURAÇÃO POR SERVIÇO (servicos.duracao_min; sem cadastro, palavras-chave;
//     sem nada, 60 min): o serviço precisa caber até as 17h30;
//   · JANELAS DE AGENDAMENTO (janelas_agendamento): quando o serviço casa com
//     um tipo da tabela, só os horários dentro das faixas daquele tipo valem
//     (é a mesma regra que a IA já respeitava à mão);
//   · HOJE: só a partir de 30 min de agora.
// A função SQL agenda_horarios_livres(p_dia, p_servico) (scripts/sql) replica
// EXATAMENTE isto para quem não depende do servidor; mudou aqui? Muda lá.
// -----------------------------------------------------------------------------

export const EXPEDIENTE = Object.freeze({ abre: 8 * 60, fecha: 17 * 60 + 30, passo: 30, dias: [1, 2, 3, 4, 5, 6] });
export const STATUS_OCUPA = new Set(['aguardando', 'confirmado', 'compareceu', 'em_atendimento']);
// o índice agendamentos_slot_uk também segura a casa de quem já teve desfecho (só cancelado e nao_veio liberam)
export const STATUS_INDICE = new Set([...STATUS_OCUPA, 'concluido', 'nao_fechou']);
const ANTECEDENCIA_MIN = 30;
const DURACAO_PADRAO = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const minutos = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const diaDaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dataValida = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && !Number.isNaN(Date.parse(`${iso}T12:00:00Z`));

/**
 * Duração estimada de um serviço, em minutos. 1º o cadastro (`servicos`,
 * nome igual ou contido — o mais específico ganha); 2º palavras-chave; 3º 60.
 *   servicos: [{ nome, duracao_min }]
 */
export function duracaoDoServico(servico, servicos = []) {
  const s = normalizar(servico);
  if (s) {
    let melhor = null;
    for (const x of servicos || []) {
      const n = normalizar(x?.nome), min = Number(x?.duracao_min);
      if (!n || !(min > 0)) continue;
      if (n === s) return min;
      if (n.length >= 4 && (s.includes(n) || n.includes(s)) && (!melhor || n.length > melhor[0].length)) melhor = [n, min];
    }
    if (melhor) return melhor[1];
    if (/revisao de motor|embreagem/.test(s)) return 300;
    if (/correia/.test(s)) return 240;
    if (/cambio|suspensao|amortecedor|direcao|revisao/.test(s)) return 120;
    if (/freio|pastilha|bico/.test(s)) return 90;
    if (/pneu|balanceamento|ar condicionado/.test(s)) return 60;
    if (/oleo|alinhamento/.test(s)) return 45;
    if (/diagnostico|scanner/.test(s)) return 30;
  }
  return DURACAO_PADRAO;
}

/** Em que dias da semana vale uma janela ("seg-sex", "sabado", "seg-sab", "todos", "domingo"). */
export function diasDaJanela(dias) {
  const d = normalizar(dias);
  if (/^seg ?-? ?sab/.test(d) || d === 'segunda a sabado') return [1, 2, 3, 4, 5, 6];
  if (/^seg ?-? ?sex/.test(d) || d === 'segunda a sexta') return [1, 2, 3, 4, 5];
  if (/^sab/.test(d)) return [6];
  if (/^dom/.test(d)) return [0];
  if (/^todos/.test(d)) return [0, 1, 2, 3, 4, 5, 6];
  return [1, 2, 3, 4, 5, 6];
}

/**
 * Faixas de chegada que valem para este serviço neste dia: as janelas cujo
 * tipo casa com o nome do serviço (sem acento, uma palavra-chave em comum com
 * 4+ letras) e cujo dia inclui `diaSemana`. Sem janela que case → [] (= o
 * expediente inteiro vale). Faixa vazia (inicio = fim) é ignorada.
 *   janelas: [{ tipo_servico, dias, inicio, fim }]
 */
export function janelasDoServico(servico, janelas = [], diaSemana = 1) {
  const s = normalizar(servico);
  if (!s) return [];
  const palavras = new Set(s.split(' ').filter((p) => p.length >= 4));
  const casa = (tipo) => {
    const t = normalizar(tipo);
    if (!t) return false;
    if (t.includes(s) || s.includes(t)) return true;
    return t.split(' ').some((p) => p.length >= 4 && palavras.has(p));
  };
  return (janelas || [])
    .filter((j) => j && casa(j.tipo_servico) && diasDaJanela(j.dias).includes(diaSemana))
    .map((j) => ({ inicio: minutos(j.inicio), fim: minutos(j.fim) }))
    .filter((j) => j.inicio !== null && j.fim !== null && j.fim > j.inicio)
    .sort((a, b) => a.inicio - b.inicio)
    .map((j) => ({ inicio: hhmm(j.inicio), fim: hhmm(j.fim) }));
}

/**
 * TODOS os horários livres de um dia (não só 3 sugestões). PURA.
 *   data          'YYYY-MM-DD'
 *   agora         { data, min } no fuso da oficina (hoje só sugere daqui a 30 min)
 *   agendamentos  [{ id, data, hora, status, consultor_id }] (do dia; os de outros dias são ignorados)
 *   consultores   [{ id, nome, ativo }] — capacidade = ativos (mínimo 1)
 *   duracao       minutos do serviço (o serviço precisa caber até as 17h30)
 *   janelas       faixas já filtradas por janelasDoServico ([] = o dia inteiro)
 *   consultor_id  se informado, só os horários em que ELE está livre
 *   ignorar       id de agendamento que não ocupa (o próprio, ao remarcar)
 * Devolve { data, aberto, motivo, duracao_min, capacidade, janelas, horarios:[{ hora, fim, livres, consultores_livres }] }.
 */
export function livresDoDia({ data, agora = null, agendamentos = [], consultores = [], duracao = DURACAO_PADRAO, janelas = [], consultor_id = null, ignorar = null } = {}) {
  const base = { data, duracao_min: Math.max(1, Number(duracao) || DURACAO_PADRAO), janelas: janelas || [], horarios: [] };
  if (!dataValida(data)) return { ...base, aberto: false, motivo: 'data_invalida', capacidade: 0 };
  const ativos = (consultores || []).filter((c) => c && c.id && c.ativo !== false && c.ativo !== 0);
  const capacidade = Math.max(1, ativos.length);
  if (!EXPEDIENTE.dias.includes(diaDaSemana(data))) return { ...base, aberto: false, motivo: 'domingo', capacidade };
  if (agora?.data && data < agora.data) return { ...base, aberto: false, motivo: 'passou', capacidade };
  if (consultor_id && !ativos.some((c) => c.id === consultor_id)) return { ...base, aberto: false, motivo: 'consultor_inativo', capacidade };

  const ocupacao = new Map();          // janela(min) -> quantos
  const doConsultor = new Map();       // janela(min) -> Set(consultor_id)
  for (const a of agendamentos || []) {
    if (!a || a.data !== data || !STATUS_INDICE.has(a.status) || (ignorar && a.id === ignorar)) continue;
    const m = minutos(a.hora); if (m === null) continue;
    const jan = Math.floor(m / EXPEDIENTE.passo) * EXPEDIENTE.passo;
    if (STATUS_OCUPA.has(a.status)) ocupacao.set(jan, (ocupacao.get(jan) || 0) + 1);
    if (a.consultor_id) { if (!doConsultor.has(jan)) doConsultor.set(jan, new Set()); doConsultor.get(jan).add(a.consultor_id); }
  }
  const corte = agora?.data === data ? agora.min + ANTECEDENCIA_MIN : -1;
  const faixas = (janelas || []).map((j) => ({ inicio: minutos(j.inicio), fim: minutos(j.fim) })).filter((j) => j.inicio !== null && j.fim !== null);
  const dentroDaJanela = (t) => !faixas.length || faixas.some((j) => t >= j.inicio && t <= j.fim);
  const horarios = [];
  let candidatos = 0;   // casas dentro do expediente, da janela e ainda à frente (para explicar o "nenhum")
  for (let t = EXPEDIENTE.abre; t + base.duracao_min <= EXPEDIENTE.fecha && t <= EXPEDIENTE.fecha - EXPEDIENTE.passo; t += EXPEDIENTE.passo) {
    if (t < corte || !dentroDaJanela(t)) continue;
    candidatos++;
    const usados = ocupacao.get(t) || 0;
    if (usados >= capacidade) continue;
    const ocupados = doConsultor.get(t) || new Set();
    const livresIds = ativos.filter((c) => !ocupados.has(c.id)).map((c) => c.id);
    if (consultor_id) {
      if (ocupados.has(consultor_id)) continue;
      horarios.push({ hora: hhmm(t), fim: hhmm(t + base.duracao_min), livres: 1, consultores_livres: [consultor_id] });
      continue;
    }
    if (ativos.length && !livresIds.length) continue;
    horarios.push({ hora: hhmm(t), fim: hhmm(t + base.duracao_min), livres: capacidade - usados, consultores_livres: livresIds });
  }
  const motivo = horarios.length ? null
    : corte > EXPEDIENTE.fecha - EXPEDIENTE.passo ? 'encerrado'          // hoje, depois do último começo
    : (candidatos === 0 && faixas.length) ? 'fora_da_janela'              // a janela do serviço não cabe mais neste dia
    : 'lotado';
  return { ...base, aberto: true, motivo, capacidade, horarios };
}

/** Texto curto e humano para a IA/tela: "Sex 17/10: 08:00, 08:30, 14:00 (+5)". */
export function resumoDoDia(dia, maximo = 6) {
  if (!dia) return '';
  const [a, m, d] = String(dia.data || '').split('-');
  const rotulo = `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][diaDaSemana(dia.data)] || ''} ${d}/${m}`.trim();
  if (!dia.aberto) return `${rotulo}: ${{ domingo: 'a oficina não abre', passou: 'já passou', data_invalida: 'data inválida', consultor_inativo: 'consultor inativo' }[dia.motivo] || 'sem horário'}`;
  if (!dia.horarios?.length) return `${rotulo}: ${{ fora_da_janela: 'esse serviço não entra nesse dia', encerrado: 'o dia já encerrou', lotado: 'lotado' }[dia.motivo] || 'lotado'}`;
  const horas = dia.horarios.map((h) => h.hora);
  return `${rotulo}: ${horas.slice(0, maximo).join(', ')}${horas.length > maximo ? ` (+${horas.length - maximo})` : ''}`;
}

/**
 * Os próximos dias com horário livre, a partir de `desde` (inclusive), até
 * `dias` dias corridos ou `quantosDias` dias com vaga. `porDia(data)` entrega
 * os agendamentos daquele dia (já carregados). PURA.
 */
export function proximosDias({ desde, agora = null, dias = 14, quantosDias = 5, porDia = () => [], ...resto } = {}) {
  const inicio = desde && (!agora?.data || desde >= agora.data) ? desde : agora?.data;
  if (!dataValida(inicio)) return [];
  const saida = [];
  for (let n = 0; n < dias && saida.filter((d) => d.horarios.length).length < quantosDias; n++) {
    const data = somaDias(inicio, n);
    const dia = livresDoDia({ ...resto, data, agora, agendamentos: porDia(data), janelas: resto.janelasPorDia ? resto.janelasPorDia(diaDaSemana(data)) : resto.janelas });
    if (dia.aberto) saida.push(dia);
  }
  return saida;
}

/** O que a rota aceita na URL: data válida, serviço (até 120 letras), consultor uuid, dias 1–30. */
export function lerParametros(sp) {
  const g = (k) => (typeof sp?.get === 'function' ? sp.get(k) : sp?.[k]) ?? '';
  const data = dataValida(g('data')) ? g('data') : null;
  const servico = String(g('servico') || '').trim().slice(0, 120) || null;
  const consultor_id = UUID_RE.test(String(g('consultor_id') || '')) ? String(g('consultor_id')).toLowerCase() : null;
  const ignorar = UUID_RE.test(String(g('ignorar') || '')) ? String(g('ignorar')).toLowerCase() : null;
  const dias = Math.min(30, Math.max(1, Number(g('dias')) || 7));
  return { data, servico, consultor_id, ignorar, dias, dataInvalida: !!g('data') && !data };
}

/* ---------------------------------------------------------------------------
   Rodada 6 (C1b): ENCAIXE com horários livres reais. A lista de espera guarda uma PREFERÊNCIA
   ("Manhã", "Tarde", "Começo do dia", "Fim do dia", "Sábado", "Qualquer horário"); estas funções
   PURAS dizem se um horário livre serve e montam os melhores candidatos entre os dias livres.
   --------------------------------------------------------------------------- */
export function casaComPreferencia(preferencia, hora, data) {
  const p = normalizar(preferencia);
  const m = minutos(hora);
  if (m === null) return false;
  if (!p || p === 'qualquer horario') return true;
  if (p === 'manha') return m < 12 * 60;
  if (p === 'tarde') return m >= 12 * 60;
  if (p === 'comeco do dia') return m <= 10 * 60;
  if (p === 'fim do dia') return m >= 15 * 60;
  if (p === 'sabado') return diaDaSemana(data) === 6;
  return true;
}

/**
 * Os melhores horários livres para UMA pessoa da espera.
 *   dias        [{ data, aberto, horarios:[{ hora, consultores_livres:[id] }] }]  (saída de livresDoDia)
 *   preferencia texto da espera;  de/ate  janela de datas da espera (podem ser null)
 *   max         quantos candidatos devolver (padrão 6); no máximo 3 por dia, para mostrar dias diferentes
 * Devolve [{ data, hora, consultor_id }] em ordem cronológica.
 */
export function candidatosDaEspera({ dias = [], preferencia = null, de = null, ate = null, max = 6 } = {}) {
  const saida = [];
  for (const d of dias) {
    if (!d || !d.aberto || (de && d.data < de) || (ate && d.data > ate)) continue;
    let doDia = 0;
    for (const h of d.horarios || []) {
      if (!casaComPreferencia(preferencia, h.hora, d.data)) continue;
      saida.push({ data: d.data, hora: h.hora, consultor_id: (h.consultores_livres || [])[0] || null });
      if (++doDia >= 3) break;
    }
    if (saida.length >= max) break;
  }
  return saida.slice(0, max);
}
