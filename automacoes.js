// -----------------------------------------------------------------------------
// Automações da Agenda (rodada 3). Sem WhatsApp: o lembrete ao cliente é do
// Comunicar. Aqui só nascem TAREFAS e NOTIFICAÇÕES para a equipe:
//   1. 16h: horário do próximo dia útil ainda sem confirmação → tarefa
//      "Confirmar com o cliente" para o consultor (ou um gestor).
//   2. Cliente faltou (nao_veio) → tarefa "Reagendar" para quem atendeu a
//      conversa dele (ou o consultor, ou um gestor).
//   3. Horário de hoje 30 min atrasado sem desfecho → notificação.
//
// `planejar` é PURA (relógio injetável, testada em tests/automacoes.test.mjs);
// `rodarAutomacoes` lê o banco, planeja e grava — sem repetir: tarefa por
// agendamento+título, notificação pela `chave` (índice único do banco).
// -----------------------------------------------------------------------------

export const TITULO_CONFIRMAR = 'Confirmar com o cliente';
export const TITULO_REAGENDAR = 'Reagendar';
export const HORA_CONFIRMAR = 16 * 60;   // 16h
export const ATRASO_MIN = 30;

/** Data/hora no fuso da oficina para um Date qualquer (relógio injetável). */
export function relogioSP(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(agora).reduce((o, p) => (o[p.type] = p.value, o), {});
  const h = partes.hour === '24' ? 0 : Number(partes.hour);
  const data = `${partes.year}-${partes.month}-${partes.day}`;
  return { data, min: h * 60 + Number(partes.minute), diaSemana: new Date(`${data}T12:00:00Z`).getUTCDay() };
}

const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const minDe = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : null; };
const dataBR = (iso) => String(iso || '').split('-').reverse().slice(0, 2).join('/');
const soDig = (t) => String(t ?? '').replace(/\D/g, '');
const nacional = (t) => { const d = soDig(t); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d; };

/** Próximo dia em que a oficina abre (seg–sáb): sábado → segunda. */
export function proximoDiaUtil(iso) {
  let d = somaDias(iso, 1);
  while (dow(d) === 0) d = somaDias(d, 1);
  return d;
}

/** Fim do expediente de um dia, em ISO com fuso (-03:00) — prazo das tarefas. */
const prazo = (iso, hhmm = '17:30') => `${iso}T${hhmm}:00-03:00`;

/**
 * Planeja o que fazer agora. PURA.
 *   agora         Date (injetável)
 *   agendamentos  [{id, data, hora, status, confirmado, compareceu, consultor_id, cliente_id, telefone, cliente_nome, servico}]
 *   tarefas       [{agendamento_id, titulo}] já existentes (qualquer status)
 *   consultores   [{id, perfil_id, nome}]
 *   conversas     [{cliente_id, telefone_e164, atribuida_a}] (mais recentes primeiro)
 *   gestores      [{id}] ativos (o primeiro recebe o que não tem dono)
 * Devolve { tarefas:[...], notificacoes:[...] }.
 */
export function planejar({ agora = new Date(), agendamentos = [], tarefas = [], consultores = [], conversas = [], gestores = [] } = {}) {
  const r = relogioSP(agora);
  const jaTem = new Set(tarefas.map((t) => `${t.agendamento_id}|${t.titulo}`));
  const perfilDoConsultor = new Map(consultores.filter((c) => c.perfil_id).map((c) => [c.id, c.perfil_id]));
  const gestor = gestores[0]?.id || null;
  const donoDaConversa = (a) => {
    const tel = nacional(a.telefone);
    const c = conversas.find((x) => x.atribuida_a && ((a.cliente_id && x.cliente_id === a.cliente_id) || (tel && tel.length >= 10 && x.telefone_e164 === tel)));
    return c?.atribuida_a || null;
  };
  const saida = { tarefas: [], notificacoes: [] };
  const quem = (a) => perfilDoConsultor.get(a.consultor_id) || null;

  // 1) Confirmar com o cliente — a partir das 16h, horários do próximo dia útil sem confirmação
  if (r.diaSemana !== 0 && r.min >= HORA_CONFIRMAR) {
    const alvo = proximoDiaUtil(r.data);
    for (const a of agendamentos) {
      if (a.data !== alvo || a.status !== 'aguardando' || a.confirmado === true || a.confirmado === 1) continue;
      if (jaTem.has(`${a.id}|${TITULO_CONFIRMAR}`)) continue;
      // o cliente JÁ respondeu pelo link (remarcar / não vem) e a equipe tem essa tarefa: pedir "confirme" de novo seria contraditório
      if (jaTem.has(`${a.id}|Remarcar`) || jaTem.has(`${a.id}|Cliente avisou que não vem`)) continue;
      const responsavel = quem(a) || gestor;
      saida.tarefas.push({
        titulo: TITULO_CONFIRMAR, origem: 'automacao', prioridade: 2,
        descricao: `${a.cliente_nome} — ${a.servico}, ${dataBR(a.data)} às ${String(a.hora).slice(0, 5)}. O lembrete automático é do Comunicar; aqui é a confirmação da equipe.`,
        responsavel_id: responsavel, agendamento_id: a.id, cliente_id: a.cliente_id || null,
        vence_em: prazo(r.data, '17:30'),
      });
      jaTem.add(`${a.id}|${TITULO_CONFIRMAR}`);
    }
  }

  // 2) Reagendar — faltou nos últimos 3 dias e ninguém pegou ainda
  const desde = somaDias(r.data, -3);
  for (const a of agendamentos) {
    if (a.status !== 'nao_veio' || a.data < desde || a.data > r.data) continue;
    if (jaTem.has(`${a.id}|${TITULO_REAGENDAR}`)) continue;
    const responsavel = donoDaConversa(a) || quem(a) || gestor;
    saida.tarefas.push({
      titulo: TITULO_REAGENDAR, origem: 'automacao', prioridade: 1,
      descricao: `${a.cliente_nome} não veio (${a.servico}, ${dataBR(a.data)} às ${String(a.hora).slice(0, 5)}). Chame para remarcar.`,
      responsavel_id: responsavel, agendamento_id: a.id, cliente_id: a.cliente_id || null,
      vence_em: prazo(proximoDiaUtil(r.data), '12:00'),
    });
    jaTem.add(`${a.id}|${TITULO_REAGENDAR}`);
  }

  // 3) Atrasado 30 min sem desfecho (só hoje, em dia de oficina)
  if (r.diaSemana !== 0) {
    for (const a of agendamentos) {
      if (a.data !== r.data || !['aguardando', 'confirmado'].includes(a.status)) continue;
      if (a.compareceu === true || a.compareceu === 1) continue;
      const m = minDe(a.hora);
      if (m === null || r.min < m + ATRASO_MIN) continue;
      const atraso = r.min - m;
      const para = quem(a) ? [quem(a)] : gestores.map((g) => g.id);
      for (const perfil_id of para) {
        saida.notificacoes.push({
          perfil_id, tipo: 'atraso', app: 'agenda', chave: `atraso:${a.id}`,
          titulo: `${a.cliente_nome} está ${atraso} min atrasado`,
          corpo: `${a.servico} às ${String(a.hora).slice(0, 5)} — marque se veio ou não veio.`,
          link: `/?agendamento=${a.id}`,
        });
      }
    }
  }
  return saida;
}

/**
 * Roda uma vez: lê o banco, planeja e grava. `dados` é injetável (testes).
 * Nunca derruba o servidor: erro vira log e o próximo ciclo tenta de novo.
 */
export async function rodarAutomacoes({ dados, agora = new Date(), log = console } = {}) {
  const r = relogioSP(agora);
  const de = somaDias(r.data, -3), ate = proximoDiaUtil(r.data);
  const agendamentos = await dados.agendamentosParaAutomacao(de, ate);
  if (!agendamentos.length) return { tarefas: 0, notificacoes: 0 };
  const faltas = agendamentos.filter((a) => a.status === 'nao_veio');
  const [tarefas, consultores, conversas, gestores] = await Promise.all([
    dados.tarefasDosAgendamentos(agendamentos.map((a) => a.id)),
    dados.listarConsultores(),
    faltas.length ? dados.donosDasConversas({ clienteIds: faltas.map((a) => a.cliente_id).filter(Boolean), telefones: faltas.map((a) => a.telefone).filter(Boolean) }) : [],
    dados.gestoresAtivos(),
  ]);
  const plano = planejar({ agora, agendamentos, tarefas, consultores, conversas, gestores });
  let t = 0, n = 0;
  for (const tarefa of plano.tarefas) {
    try { await dados.criarTarefa(tarefa); t++; } catch (e) { log.error('Automação (tarefa):', e?.message || e); }
  }
  for (const nota of plano.notificacoes) {
    try { if (await dados.notificar(nota)) n++; } catch (e) { log.error('Automação (notificação):', e?.message || e); }
  }
  if (t || n) log.log(`Automações: ${t} tarefa(s), ${n} notificação(ões).`);
  return { tarefas: t, notificacoes: n };
}
