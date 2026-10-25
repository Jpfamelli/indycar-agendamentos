/* ============================================================
   IndyCar CRM — rodada 7 (25/10/2026, C3), funções puras
   - links prontos: abrir a entrada no Pátio e criar orçamento com tudo preenchido
   - o funil que se mexe sozinho: movimentos sugeridos pelos eventos dos outros sistemas
   - retornos combinados (agenda do vendedor), saúde do lead, melhor hora e melhor canal
   - perdas com motivo e recuperáveis, indicações, desempenho por origem (com o Ads)
   - qualidade dos dados (sem alterar nada) e os resumos do dono para copiar
   Tudo aqui é puro (sem banco, sem relógio): as rotas ficam em rodada7-rotas.js.
   ============================================================ */
'use strict';

const U = require('./util-servidor');
const APPS = require('./apps');
const R5 = require('./rodada5');
const R6 = require('./rodada6');
const R6C = require('./rodada6c');
const { ehUuid, r2, DIA } = U;
const ABERTAS = R5.ABERTAS;
const e164 = R5.normalizarTelefone;

const ms = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : NaN; };
const semControle = s => String(s ?? '').replace(/[\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim();
const limpa = (v, n) => semControle(String(v ?? '').replace(/[<>]/g, '')).slice(0, n);
const primeiroNome = n => { const p = semControle(n).split(' ')[0]; return p && !/fam[ií]lia|cliente|lead|sem nome/i.test(p) ? p : ''; };
const brl0 = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const RE_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const ROTULO_STATUS = { novo: 'Novo', contato: 'Em contato', orcamento: 'Orçamento', agendado: 'Agendado', em_servico: 'Em serviço', concluido: 'Concluído', perdido: 'Perdido' };
const ROTULO_ORIGEM = { whatsapp: 'WhatsApp', google: 'Google', meta: 'Meta (Instagram e Facebook)', organico: 'Orgânico', telefone: 'Telefone', indicacao: 'Indicação', site: 'Site', instagram: 'Instagram', balcao: 'Balcão' };
const rotuloOrigem = o => (!o || o === 'sem') ? 'Sem origem' : ROTULO_ORIGEM[o] || (semControle(o) ? semControle(o).slice(0, 30) : 'Sem origem');
const ORIGENS_PAGAS = ['meta', 'google'];

/* ============================================================ links prontos */
/**
 * Link da Entrada do carro no Pátio já preenchida (contrato do Pátio: ?entrada=1&orcamento=&agendamento=&lead=&cliente=
 * &tel=&nome=&placa=&carro=&servico=&conversa=&origem=). Nada é gravado até a pessoa concluir a entrada lá.
 * Parâmetro vazio ou inválido (uuid torto, placa fora do formato) sai de fora.
 */
function linkEntradaPatio(d = {}, opts) {
  const p = new URLSearchParams();
  p.set('entrada', '1');
  const uuid = (k, v) => { if (ehUuid(v)) p.set(k, String(v).toLowerCase()); };
  uuid('orcamento', d.orcamento_id); uuid('agendamento', d.agendamento_id); uuid('lead', d.lead_id); uuid('cliente', d.cliente_id); uuid('conversa', d.conversa_id);
  const t = e164(d.telefone); if (t) p.set('tel', '55' + t);
  const nome = limpa(d.nome, 80); if (nome) p.set('nome', nome);
  const placa = String(d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (RE_PLACA.test(placa)) p.set('placa', placa);
  const carro = limpa(d.veiculo || d.carro, 80); if (carro) p.set('carro', carro);
  const serv = limpa(d.servico, 200); if (serv) p.set('servico', serv);
  p.set('origem', 'crm');
  return APPS.linkApp('patio', '/?' + p.toString(), opts);
}

/**
 * Devolve os dois botões de ação do lead com TUDO que o CRM sabe, e diz por que cada um aparece.
 * ctx: { orcAprovado, agendamento, os, conversaId, clienteId }
 */
function atalhosDoLead(lead, ctx = {}, opts) {
  const base = { lead_id: lead.id, cliente_id: lead.cliente_id || ctx.clienteId, telefone: lead.telefone, nome: lead.nome, placa: lead.placa, veiculo: lead.carro_modelo, servico: lead.servico, conversa_id: ctx.conversaId };
  const orc = ctx.orcAprovado || null, ag = ctx.agendamento || null, os = ctx.os || null;
  const out = { novo_orcamento: null, entrada_patio: null };
  if (ABERTAS.includes(lead.status) || lead.status === 'concluido') {
    out.novo_orcamento = { href: R6C.linkNovoOrcamento({ ...base, agendamento_id: ag?.id, os_id: os?.id }, opts), motivo: orc ? 'Já existe um orçamento aprovado: crie outro só se for um serviço novo.' : 'Abre o Orçador com cliente, carro, placa e serviço preenchidos.' };
  }
  const aberto = ABERTAS.includes(lead.status);
  const temMotivo = !!orc || !!ag || lead.status === 'agendado';
  if (aberto && !os && temMotivo) {
    out.entrada_patio = { href: linkEntradaPatio({ ...base, orcamento_id: orc?.id, agendamento_id: ag?.id }, opts),
      motivo: orc && ag ? 'Orçamento aprovado e horário marcado: o cliente chegou? Abra a entrada já preenchida.' : orc ? 'Orçamento aprovado: abra a entrada do carro com os serviços previstos.' : 'Tem horário na Agenda: quando o carro chegar, abra a entrada já preenchida.' };
  }
  if (os) out.ordem_aberta = { numero: os.numero ?? null, etapa: os.etapa || null, href: ehUuid(os.id) ? APPS.linkApp('patio', '/?os=' + os.id) : null };
  return out;
}

/* ============================================================ o funil que se mexe sozinho */
const RANK_ETAPA = { novo: 0, contato: 1, orcamento: 2, agendado: 3, em_servico: 4 };
const CODIGOS_MOVIMENTO = ['carro_na_oficina', 'entregue_concluir', 'orcamento_enviado', 'horario_marcado', 'orcamento_recusado_perder', 'agendado_sem_horario', 'em_servico_sem_ordem'];
/**
 * Compara a etapa de cada lead aberto com o que os outros sistemas contam e sugere o movimento.
 * Só sugere: quem aplica é a pessoa (ou o gestor) e só no que ainda é verdade na hora.
 * sinais = R6.construirSinais(...). dados = o que o CRM leu do Pátio/Orçador/Agenda.
 */
function sugerirMovimentos(leads, sinais, { agora = Date.now(), prefixo = '' } = {}) {
  const out = [];
  for (const l of leads || []) {
    if (!l || !ABERTAS.includes(l.status)) continue;
    const s = (sinais || {})[l.id] || { flags: [] };
    const rank = RANK_ETAPA[l.status];
    const add = (codigo, para, titulo, motivo, extra = {}) => out.push({ lead_id: l.id, nome: l.nome, telefone: l.telefone || null, de: l.status, para, codigo, titulo, motivo, aplicavel: !!para,
      valor_orcado: Number(l.valor_orcado) || 0, responsavel_id: l.responsavel_id || null, ...extra });
    if (s.patio && rank < RANK_ETAPA.em_servico) {
      add('carro_na_oficina', 'em_servico', 'O carro está na oficina', `Ordem ${s.patio.numero ? 'nº ' + s.patio.numero + ' ' : ''}aberta no Pátio (${R6C.rotuloEtapa(s.patio.etapa)}).`, { app: 'patio', link: ehUuid(s.patio.id) ? APPS.linkApp('patio', '/?os=' + s.patio.id) : null });
      continue;
    }
    if (s.entregue && !s.patio) {
      add('entregue_concluir', 'concluido', 'O carro já foi entregue', `Ordem ${s.entregue.numero ? 'nº ' + s.entregue.numero + ' ' : ''}entregue${s.entregue.dias ? ' há ' + s.entregue.dias + ' d' : ' hoje'}. Falta registrar o valor pago.`, { app: 'patio', precisa_valor: true,
        link: ehUuid(s.entregue.id) ? APPS.linkApp('patio', '/?os=' + s.entregue.id) : null });
      continue;
    }
    if (s.orcamento?.status === 'enviado' && rank <= RANK_ETAPA.contato) {
      add('orcamento_enviado', 'orcamento', 'Orçamento já foi enviado', `Orçamento nº ${s.orcamento.numero ?? ''} enviado ao cliente${s.orcamento.visualizado ? ' (ele já abriu)' : ''}.`.replace('nº  ', ''), { app: 'orcador', valor_novo: s.orcamento.total || 0,
        link: ehUuid(s.orcamento.id) ? R6C.linkOrcamento(s.orcamento.id) : null });
      continue;
    }
    if (s.agendamento && rank <= RANK_ETAPA.orcamento) {
      add('horario_marcado', 'agendado', 'Tem horário na Agenda', `Horário marcado para ${new Date(ms(s.agendamento.quando)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}.`, { app: 'agenda',
        link: ehUuid(s.agendamento.id) ? APPS.linkApp('agenda', '/?agendamento=' + s.agendamento.id, { prefixo }) : null });
      continue;
    }
    if (l.status === 'orcamento' && s.orcamento_recusado && !s.orcamento) {
      const obs = R6C.lerObservacoes(l.observacoes), bruto = obs.recusas[s.orcamento_recusado.numero];
      const motivo = bruto ? R5.motivoPadrao(bruto) : 'Outro';
      add('orcamento_recusado_perder', 'perdido', 'O cliente recusou o orçamento', `Orçamento nº ${s.orcamento_recusado.numero ?? ''} recusado${bruto ? ' (' + bruto + ')' : ''} e não há outro em andamento.`, { app: 'orcador', motivo_perda: motivo,
        link: ehUuid(s.orcamento_recusado.id) ? R6C.linkOrcamento(s.orcamento_recusado.id) : null });
      continue;
    }
    if (l.status === 'agendado' && !s.agendamento && !s.patio && Number.isFinite(ms(l.updated_at)) && agora - ms(l.updated_at) > DIA) {
      add('agendado_sem_horario', 'contato', 'Está como Agendado, mas não há horário', 'Nenhum horário futuro na Agenda para este cliente. Volte para "Em contato" e combine uma nova data.', { app: 'agenda', link: APPS.linkApp('agenda', '/?tel=' + (e164(l.telefone) || ''), { prefixo }) });
      continue;
    }
    if (l.status === 'em_servico' && !s.patio && !s.entregue) {
      add('em_servico_sem_ordem', null, 'Está Em serviço, mas não há ordem aberta', 'Se o carro está na oficina, abra a entrada no Pátio. Se já foi embora, conclua o lead com o valor pago.', { app: 'patio',
        link: linkEntradaPatio({ lead_id: l.id, cliente_id: l.cliente_id, telefone: l.telefone, nome: l.nome, placa: l.placa, veiculo: l.carro_modelo, servico: l.servico }, { prefixo }) });
    }
  }
  const peso = m => (m.aplicavel ? 0 : 1);
  return out.sort((a, b) => peso(a) - peso(b) || b.valor_orcado - a.valor_orcado || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}
/** O movimento pedido ainda é o que o funil sugere agora? (a tela pode estar velha) */
function movimentoAindaVale(movimentos, leadId, para) { return (movimentos || []).find(m => m.lead_id === leadId && m.aplicavel && m.para === para) || null; }
/** Texto com "Motivo da perda: X" no fim das observações (não repete). */
function observacoesComMotivo(obs, motivo) {
  const base = String(obs ?? '').trimEnd();
  if (!motivo || R5.motivoDe(base)) return base;
  return (base ? base + '\n' : '') + 'Motivo da perda: ' + motivo;
}

/* ============================================================ retornos combinados (agenda do vendedor) */
const fusoBrt = t => new Date(t - U.FUSO_MS);
const fimDoDiaBrt = (t, mais = 0) => { const d = fusoBrt(t + mais * DIA); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + U.FUSO_MS; };
/**
 * Organiza os retornos combinados em atrasados, hoje (por período), amanhã, próximos 7 dias e "sem retorno".
 * leads: já filtrados para o escopo da pessoa.
 */
function agruparRetornos(leads, { agora = Date.now(), nomes = new Map(), limiteSem = 30 } = {}) {
  const abertos = (leads || []).filter(l => ABERTAS.includes(l.status));
  const fimHoje = fimDoDiaBrt(agora), fimAmanha = fimDoDiaBrt(agora, 1), fimSemana = fimDoDiaBrt(agora, 7);
  const item = l => ({ id: l.id, nome: l.nome, telefone: l.telefone || null, status: l.status, status_rotulo: ROTULO_STATUS[l.status] || l.status, quando: l.proximo_contato_em || null,
    horas_atraso: l.proximo_contato_em && ms(l.proximo_contato_em) < agora ? Math.round((agora - ms(l.proximo_contato_em)) / 3600_000) : 0,
    valor_orcado: Number(l.valor_orcado) || 0, responsavel_id: l.responsavel_id || null, responsavel_nome: l.responsavel_id ? nomes.get(l.responsavel_id) || null : null, tentativas: Number(l.tentativas_contato) || 0 });
  const g = { atrasados: [], hoje: [], amanha: [], semana: [], depois: [], sem_retorno: [] };
  for (const l of abertos) {
    const t = ms(l.proximo_contato_em);
    if (!Number.isFinite(t)) { g.sem_retorno.push(item(l)); continue; }
    if (t < agora) g.atrasados.push(item(l)); else if (t < fimHoje) g.hoje.push(item(l)); else if (t < fimAmanha) g.amanha.push(item(l)); else if (t < fimSemana) g.semana.push(item(l)); else g.depois.push(item(l));
  }
  const porQuando = (a, b) => String(a.quando).localeCompare(String(b.quando));
  g.atrasados.sort(porQuando); g.hoje.sort(porQuando); g.amanha.sort(porQuando); g.semana.sort(porQuando); g.depois.sort(porQuando);
  g.sem_retorno.sort((a, b) => b.valor_orcado - a.valor_orcado || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const hojePeriodo = { manha: [], tarde: [], fim: [] };
  for (const i of g.hoje) { const h = fusoBrt(ms(i.quando)); const min = h.getUTCHours() * 60 + h.getUTCMinutes(); (min < 12 * 60 ? hojePeriodo.manha : min < 15 * 60 ? hojePeriodo.tarde : hojePeriodo.fim).push(i); }
  const porPessoa = new Map();
  for (const l of abertos) {
    const k = l.responsavel_id || 'sem';
    const x = porPessoa.get(k) || { id: k, nome: k === 'sem' ? 'Sem responsável' : nomes.get(k) || 'Alguém', atrasados: 0, hoje: 0, sem_retorno: 0, abertos: 0 };
    x.abertos++; const t = ms(l.proximo_contato_em);
    if (!Number.isFinite(t)) x.sem_retorno++; else if (t < agora) x.atrasados++; else if (t < fimHoje) x.hoje++;
    porPessoa.set(k, x);
  }
  const semMuitos = g.sem_retorno.length;
  return { contagem: { atrasados: g.atrasados.length, hoje: g.hoje.length, amanha: g.amanha.length, semana: g.semana.length, depois: g.depois.length, sem_retorno: semMuitos, abertos: abertos.length },
    atrasados: g.atrasados.slice(0, 60), hoje: g.hoje.slice(0, 60), hoje_periodos: { manha: hojePeriodo.manha.length, tarde: hojePeriodo.tarde.length, fim: hojePeriodo.fim.length }, amanha: g.amanha.slice(0, 60), semana: g.semana.slice(0, 60),
    sem_retorno: g.sem_retorno.slice(0, limiteSem), sem_retorno_mais: Math.max(0, semMuitos - limiteSem),
    por_pessoa: [...porPessoa.values()].sort((a, b) => b.atrasados - a.atrasados || b.sem_retorno - a.sem_retorno), cobertura_pct: abertos.length ? Math.round((abertos.length - semMuitos) / abertos.length * 100) : 100 };
}

/* ============================================================ saúde do lead, melhor hora, melhor canal */
/** 0 a 100: o quanto esse lead está "quente". Só regras claras; devolve os motivos. */
function saudeDoLead(lead, s = { flags: [] }, agora = Date.now()) {
  let pts = 50; const motivos = [];
  const f = new Set(s.flags || []);
  const mais = (n, t) => { pts += n; motivos.push({ pontos: n, texto: t }); };
  const ult = ms(lead.ultimo_contato_em), criado = ms(lead.created_at);
  if (Number.isFinite(ult)) { const d = Math.floor((agora - ult) / DIA); if (d <= 2) mais(15, 'Falamos com o cliente há pouco'); else if (d <= 7) mais(5, `Último contato há ${d} dias`); else if (d > 14) mais(-15, `Sem contato há ${d} dias`); }
  else if (Number.isFinite(criado) && agora - criado > 2 * DIA) mais(-20, 'Nunca falamos com este cliente');
  if (s.patio) mais(25, 'Carro na oficina');
  if (s.agendamento) mais(20, 'Tem horário marcado');
  if (s.orcamento?.status === 'aprovado') mais(20, 'Orçamento aprovado');
  if (f.has('orcamento_visto')) mais(10, 'Abriu o orçamento');
  if (f.has('orcamento_parado')) mais(-10, 'Orçamento sem resposta');
  if (f.has('orcamento_recusado')) mais(-25, 'Recusou o orçamento');
  if (f.has('followup_vencido')) mais(-10, 'Retorno combinado venceu');
  if (!s.followup && ABERTAS.includes(lead.status) && !s.patio) mais(-5, 'Sem retorno combinado');
  if (Number(lead.tentativas_contato) >= 3) mais(-20, `${lead.tentativas_contato} tentativas sem resposta`);
  if (Number(lead.valor_orcado) > 0) mais(5, 'Tem valor orçado');
  const valor = Math.max(0, Math.min(100, pts));
  const nivel = valor >= 70 ? 'quente' : valor >= 40 ? 'morno' : 'frio';
  return { valor, nivel, rotulo: { quente: 'Quente', morno: 'Morno', frio: 'Frio' }[nivel], motivos: motivos.sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos)).slice(0, 4) };
}
const EFETIVOS = ['atendeu', 'respondeu', 'pediu_prazo', 'agendou'];
/** Em que parte do dia o cliente costuma responder (precisa de 2 contatos que deram certo). */
function melhorHorario(atividades) {
  const ok = (atividades || []).filter(a => EFETIVOS.includes(a.resultado) && Number.isFinite(ms(a.created_at)));
  if (ok.length < 2) return null;
  const faixa = t => { const d = fusoBrt(t); const m = d.getUTCHours() * 60 + d.getUTCMinutes(); return m < 12 * 60 ? 'manha' : m < 15 * 60 ? 'tarde' : 'fim'; };
  const c = { manha: 0, tarde: 0, fim: 0 }; for (const a of ok) c[faixa(ms(a.created_at))]++;
  const [k, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return { periodo: k, rotulo: { manha: 'de manhã (até 12h)', tarde: 'depois do almoço (12h às 15h)', fim: 'no fim da tarde (depois das 15h)' }[k], vezes: n, de: ok.length };
}
/** Qual jeito de falar funciona com este cliente: ligação ou WhatsApp (precisa de 3 tentativas ao todo). */
function canalQueFunciona(atividades) {
  const por = {};
  for (const a of atividades || []) { if (!['ligacao', 'whatsapp'].includes(a.tipo) || !a.resultado) continue; const x = por[a.tipo] || (por[a.tipo] = { tentativas: 0, deram_certo: 0 }); x.tentativas++; if (EFETIVOS.includes(a.resultado)) x.deram_certo++; }
  const total = Object.values(por).reduce((t, x) => t + x.tentativas, 0);
  if (total < 3) return null;
  const lista = Object.entries(por).map(([tipo, x]) => ({ tipo, ...x, taxa: Math.round(x.deram_certo / x.tentativas * 100) })).sort((a, b) => b.taxa - a.taxa || b.tentativas - a.tentativas);
  const melhor = lista[0];
  return { melhor: melhor.deram_certo ? melhor.tipo : null, rotulo: melhor.deram_certo ? (melhor.tipo === 'whatsapp' ? 'WhatsApp funciona melhor' : 'Ligação funciona melhor') : 'Nenhum canal funcionou ainda', canais: lista };
}
/** Há quanto tempo o lead existe, quantos contatos teve e quanto demoramos para falar com ele. */
function tempoComoLead(lead, atividades, agora = Date.now()) {
  const criado = ms(lead.created_at);
  const contatos = (atividades || []).filter(a => a.tipo !== 'nota' && a.tipo !== 'sistema');
  const primeiro = contatos.map(a => ms(a.created_at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  return { dias: Number.isFinite(criado) ? Math.max(0, Math.floor((agora - criado) / DIA)) : null, contatos: contatos.length, primeiro_contato_h: Number.isFinite(criado) && Number.isFinite(primeiro) ? Math.max(0, Math.round((primeiro - criado) / 360_000) / 10) : null };
}

/* ============================================================ perdas com motivo */
const MOTIVOS_RECUPERAVEIS = ['Achou caro', 'Prazo não atendeu', 'Sem retorno do cliente'];
function scriptReabordar(motivo, lead) {
  const nome = primeiroNome(lead?.nome), oi = nome ? `Oi, ${nome}!` : 'Oi!';
  const carro = lead?.carro_modelo ? ` do seu ${lead.carro_modelo}` : '';
  switch (motivo) {
    case 'Achou caro': return `${oi} Aqui é da IndyCar. Você chegou a olhar o serviço${carro} com a gente. Se ainda faz sentido, posso rever o orçamento com você e ver o que dá pra ajustar.`;
    case 'Prazo não atendeu': return `${oi} Aqui é da IndyCar. Da última vez o prazo não encaixou${carro}. Me diz o melhor dia que eu vejo o horário pra você. A gente atende de segunda a sábado, das 8h às 17h30.`;
    default: return `${oi} Aqui é da IndyCar. Passando pra saber se você ainda precisa de ajuda${carro}. Qualquer coisa é só chamar. Quem conhece, Indyca! 🏎`;
  }
}
/**
 * Perdas dos últimos `dias` dias: por motivo, por origem, por vendedor, o que dava para recuperar.
 * `leads` já vem no escopo da pessoa.
 */
function analisarPerdas(leads, { agora = Date.now(), dias = 90, nomes = new Map() } = {}) {
  const quando = l => ms(l.closed_at || l.updated_at);
  const janela = (leads || []).filter(l => Number.isFinite(quando(l)) && quando(l) >= agora - dias * DIA);
  const perdidos = janela.filter(l => l.status === 'perdido'), ganhos = janela.filter(l => l.status === 'concluido');
  const motivoDoLead = l => { const bruto = R5.motivoDe(l.observacoes); return { bruto, padrao: bruto ? R5.motivoPadrao(bruto) : null }; };
  const porMotivo = new Map();
  for (const l of perdidos) { const m = motivoDoLead(l).padrao || 'Sem motivo'; const x = porMotivo.get(m) || { motivo: m, quantidade: 0, valor: 0 }; x.quantidade++; x.valor += Number(l.valor_orcado) || 0; porMotivo.set(m, x); }
  const motivos = [...porMotivo.values()].map(x => ({ ...x, valor: r2(x.valor), pct: perdidos.length ? Math.round(x.quantidade / perdidos.length * 100) : 0, recuperavel: MOTIVOS_RECUPERAVEIS.includes(x.motivo) })).sort((a, b) => b.quantidade - a.quantidade);
  const porOrigem = new Map();
  for (const l of [...perdidos, ...ganhos]) { const k = l.origem || 'sem'; const x = porOrigem.get(k) || { origem: k, rotulo: rotuloOrigem(k), perdidos: 0, ganhos: 0 }; if (l.status === 'perdido') x.perdidos++; else x.ganhos++; porOrigem.set(k, x); }
  const origens = [...porOrigem.values()].map(x => ({ ...x, taxa_perda: Math.round(x.perdidos / (x.perdidos + x.ganhos) * 100) })).sort((a, b) => b.perdidos - a.perdidos);
  const porDono = new Map();
  for (const l of perdidos) { const k = l.responsavel_id || 'sem'; const x = porDono.get(k) || { id: k, nome: k === 'sem' ? 'Sem responsável' : nomes.get(k) || 'Alguém', perdidos: 0, valor: 0 }; x.perdidos++; x.valor += Number(l.valor_orcado) || 0; porDono.set(k, x); }
  const recuperaveis = perdidos.filter(l => { const m = motivoDoLead(l).padrao; const d = (agora - quando(l)) / DIA; return (MOTIVOS_RECUPERAVEIS.includes(m) || !m) && d >= 7 && !(l.proximo_contato_em && ms(l.proximo_contato_em) > agora); })
    .sort((a, b) => (Number(b.valor_orcado) || 0) - (Number(a.valor_orcado) || 0) || quando(b) - quando(a)).slice(0, 40)
    .map(l => { const m = motivoDoLead(l).padrao; return { id: l.id, nome: l.nome, telefone: l.telefone || null, motivo: m || 'Sem motivo', motivo_detalhe: motivoDoLead(l).bruto || null, valor_orcado: Number(l.valor_orcado) || 0, carro_modelo: l.carro_modelo || null,
      perdido_ha_dias: Math.floor((agora - quando(l)) / DIA), responsavel_id: l.responsavel_id || null, script: scriptReabordar(m, l) }; });
  const semMotivo = perdidos.filter(l => !motivoDoLead(l).bruto);
  const dur = perdidos.map(l => (quando(l) - ms(l.created_at)) / DIA).filter(d => Number.isFinite(d) && d >= 0);
  const valorPerdido = r2(perdidos.reduce((t, l) => t + (Number(l.valor_orcado) || 0), 0));
  const insights = [];
  if (perdidos.length) {
    if (motivos[0] && motivos[0].quantidade >= 3 && motivos[0].motivo !== 'Sem motivo') insights.push(`O motivo mais comum é "${motivos[0].motivo.toLowerCase()}": ${plural(motivos[0].quantidade, 'lead', 'leads')} (${motivos[0].pct}%).`);
    if (semMotivo.length >= 3) insights.push(`${plural(semMotivo.length, 'lead perdido está', 'leads perdidos estão')} sem motivo: sem isso não dá para saber o que melhorar.`);
    if (recuperaveis.length) insights.push(`${plural(recuperaveis.length, 'lead dá', 'leads dão')} para reabordar (preço, prazo ou sem retorno).`);
    const pior = origens.find(o => o.perdidos + o.ganhos >= 5 && o.taxa_perda >= 70);
    if (pior) insights.push(`${pior.rotulo} perde ${pior.taxa_perda}% dos leads que fecham (${pior.perdidos} de ${pior.perdidos + pior.ganhos}).`);
  }
  return { dias, perdidos: perdidos.length, ganhos: ganhos.length, taxa_perda: perdidos.length + ganhos.length ? Math.round(perdidos.length / (perdidos.length + ganhos.length) * 100) : 0, valor_perdido: valorPerdido,
    tempo_medio_ate_perder_dias: dur.length ? Math.round(dur.reduce((a, b) => a + b, 0) / dur.length * 10) / 10 : null, motivos, origens, vendedores: [...porDono.values()].map(x => ({ ...x, valor: r2(x.valor) })).sort((a, b) => b.perdidos - a.perdidos).slice(0, 8),
    sem_motivo: { total: semMotivo.length, exemplos: semMotivo.slice(0, 10).map(l => ({ id: l.id, nome: l.nome, perdido_em: l.closed_at || l.updated_at })) }, recuperaveis, recuperaveis_valor: r2(recuperaveis.reduce((t, i) => t + i.valor_orcado, 0)), insights };
}

/* ============================================================ indicações */
/** Mensagem para agradecer quem indicou (só depois que o indicado fez o serviço). */
function scriptAgradecerIndicacao(indicador, indicado) {
  const a = primeiroNome(indicador), b = primeiroNome(indicado);
  return `${a ? `Oi, ${a}!` : 'Oi!'} Aqui é da IndyCar. ${b ? `Seu amigo ${b}` : 'Quem você indicou'} já fez o serviço com a gente. Obrigado pela confiança! Quem conhece, Indyca! 🏎`;
}
/**
 * indicacoes: linhas da tabela `indicacoes`; leads: todos; clientes: Map(id → {nome, telefone}).
 * Ranking de quem mais indica, indicados esperando contato e quem merece um agradecimento.
 */
function painelIndicacoes(indicacoes, leads, clientes, { agora = Date.now(), prefixo = '' } = {}) {
  const lead = new Map((leads || []).map(l => [l.id, l]));
  const lista = (indicacoes || []).map(i => ({ ...i, lead: i.lead_id ? lead.get(i.lead_id) || null : null }));
  const porIndicador = new Map();
  for (const i of lista) {
    const c = clientes.get(i.indicado_por) || {};
    const x = porIndicador.get(i.indicado_por) || { cliente_id: i.indicado_por, nome: c.nome || 'Cliente', telefone: c.telefone || null, indicacoes: 0, viraram: 0, em_andamento: 0, perdidos: 0, valor: 0, ultima: null };
    x.indicacoes++;
    if (i.lead?.status === 'concluido') { x.viraram++; x.valor += Number(i.lead.valor_pago) || 0; } else if (i.lead?.status === 'perdido') x.perdidos++; else if (i.lead) x.em_andamento++;
    if (!x.ultima || String(i.created_at) > String(x.ultima)) x.ultima = i.created_at;
    porIndicador.set(i.indicado_por, x);
  }
  const ranking = [...porIndicador.values()].map(x => ({ ...x, valor: r2(x.valor) })).sort((a, b) => b.viraram - a.viraram || b.valor - a.valor || b.indicacoes - a.indicacoes).slice(0, 15);
  const comLead = lista.filter(i => i.lead), viraram = comLead.filter(i => i.lead.status === 'concluido');
  const esperando = comLead.filter(i => i.lead.status === 'novo' && !i.lead.ultimo_contato_em && agora - ms(i.created_at) >= 3600_000)
    .map(i => ({ lead_id: i.lead_id, nome: i.nome, telefone: i.telefone || i.lead.telefone || null, indicado_por: clientes.get(i.indicado_por)?.nome || null, horas: Math.round((agora - ms(i.created_at)) / 3600_000), responsavel_id: i.lead.responsavel_id || null }))
    .sort((a, b) => b.horas - a.horas).slice(0, 20);
  const agradecer = viraram.filter(i => agora - ms(i.lead.closed_at || i.lead.updated_at) <= 30 * DIA).map(i => { const c = clientes.get(i.indicado_por) || {}; return { lead_id: i.lead_id, indicado: i.nome, indicador: c.nome || null, telefone_indicador: c.telefone || null,
    valor: r2(i.lead.valor_pago), concluido_em: i.lead.closed_at || i.lead.updated_at, script: scriptAgradecerIndicacao(c.nome, i.nome) }; }).sort((a, b) => String(b.concluido_em).localeCompare(String(a.concluido_em))).slice(0, 15);
  const valor = r2(viraram.reduce((t, i) => t + (Number(i.lead.valor_pago) || 0), 0));
  return { total: lista.length, com_lead: comLead.length, viraram: viraram.length, taxa: comLead.length ? Math.round(viraram.length / comLead.length * 100) : 0, valor, valor_medio: viraram.length ? r2(valor / viraram.length) : 0,
    ranking, esperando_contato: esperando, agradecer, leads_de_indicacao: (leads || []).filter(l => l.origem === 'indicacao').length };
}

/* ============================================================ desempenho por origem (com o Ads) */
const mediana = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
function resumoOrigem(leads) {
  const fechados = leads.filter(l => ['concluido', 'perdido'].includes(l.status)), ganhos = leads.filter(l => l.status === 'concluido');
  const fat = ganhos.reduce((t, l) => t + (Number(l.valor_pago) || 0), 0);
  const dias = ganhos.map(l => (ms(l.closed_at || l.updated_at) - ms(l.created_at)) / DIA).filter(d => Number.isFinite(d) && d >= 0);
  return { leads: leads.length, orcaram: leads.filter(l => ['orcamento', 'agendado', 'em_servico', 'concluido'].includes(l.status) || Number(l.valor_orcado) > 0).length, ganhos: ganhos.length, perdidos: fechados.length - ganhos.length, abertos: leads.length - fechados.length,
    faturamento: r2(fat), ticket: ganhos.length ? r2(fat / ganhos.length) : 0, conversao: fechados.length ? Math.round(ganhos.length / fechados.length * 1000) / 10 : null, dias_ate_fechar: dias.length ? Math.round(mediana(dias) * 10) / 10 : null,
    sem_valor: ganhos.filter(l => !(Number(l.valor_pago) > 0)).length };
}
/**
 * Desempenho de cada origem no período [ini, fim) comparado com o período anterior do mesmo tamanho,
 * cruzado com o gasto do Ads (só Meta e Google têm gasto). metricas: ads_metricas_dia (nível campanha).
 */
function desempenhoPorOrigem(leads, metricas, { ini, fim } = {}) {
  const tam = fim - ini, dentro = (l, a, b) => { const t = ms(l.created_at); return t >= a && t < b; };
  const atual = (leads || []).filter(l => dentro(l, ini, fim)), anterior = (leads || []).filter(l => dentro(l, ini - tam, ini));
  const gasto = {};
  for (const m of metricas || []) gasto[m.plataforma] = (gasto[m.plataforma] || 0) + (Number(m.gasto) || 0);
  const chaves = [...new Set([...atual, ...anterior].map(l => l.origem || 'sem'))];
  const linhas = chaves.map(k => {
    const a = resumoOrigem(atual.filter(l => (l.origem || 'sem') === k)), b = resumoOrigem(anterior.filter(l => (l.origem || 'sem') === k));
    const g = ORIGENS_PAGAS.includes(k) ? r2(gasto[k] || 0) : null;
    return { origem: k, rotulo: rotuloOrigem(k), paga: ORIGENS_PAGAS.includes(k), ...a, leads_anterior: b.leads, variacao_leads: b.leads ? Math.round((a.leads - b.leads) / b.leads * 100) : (a.leads ? null : 0), faturamento_anterior: b.faturamento,
      gasto: g, cpl: g != null && a.leads ? r2(g / a.leads) : null, cac: g != null && a.ganhos ? r2(g / a.ganhos) : null, roas: g ? r2(a.faturamento / g) : null };
  }).sort((x, y) => y.faturamento - x.faturamento || y.leads - x.leads);
  const soma = (f, campo) => f.reduce((t, x) => t + (x[campo] || 0), 0);
  const pagas = linhas.filter(x => x.paga), organicas = linhas.filter(x => !x.paga);
  const bloco = ls => ({ leads: soma(ls, 'leads'), ganhos: soma(ls, 'ganhos'), faturamento: r2(soma(ls, 'faturamento')), gasto: r2(soma(ls, 'gasto')) });
  const tot = bloco(linhas), insights = [];
  const melhorFat = linhas.find(x => x.faturamento > 0), conv = linhas.filter(x => x.ganhos + x.perdidos >= 5).sort((a, b) => (b.conversao ?? 0) - (a.conversao ?? 0))[0];
  if (melhorFat && tot.faturamento > 0) insights.push(`${melhorFat.rotulo} trouxe a maior parte do faturamento: ${brl0(melhorFat.faturamento)} (${Math.round(melhorFat.faturamento / tot.faturamento * 100)}%).`);
  if (conv && conv.origem !== melhorFat?.origem) insights.push(`${conv.rotulo} é a que mais fecha: ${conv.conversao}% dos leads decididos viram venda.`);
  for (const x of linhas) if (x.leads >= 10 && x.ganhos === 0) insights.push(`${x.rotulo} trouxe ${x.leads} leads e nenhuma venda no período.`);
  for (const x of pagas) if (x.gasto > 0 && x.ganhos === 0) insights.push(`${x.rotulo}: gastou ${brl0(x.gasto)} e não trouxe venda.`);
  for (const x of pagas) if (x.roas != null && x.roas >= 1) insights.push(`${x.rotulo} devolveu ${x.roas}x o que foi gasto.`);
  const sem = linhas.find(x => x.origem === 'sem'); if (sem && sem.leads >= 3) insights.push(`${plural(sem.leads, 'lead chegou', 'leads chegaram')} sem origem: preencha para o retorno ficar certo.`);
  const semValor = soma(linhas, 'sem_valor'); if (semValor) insights.push(`${plural(semValor, 'venda está', 'vendas estão')} sem valor pago: o faturamento por origem está subestimado.`);
  return { periodo: { ini: new Date(ini).toISOString(), fim: new Date(fim).toISOString(), dias: Math.round(tam / DIA) }, linhas, total: tot, pago: bloco(pagas), organico: bloco(organicas), anterior: { leads: anterior.length }, insights };
}

/* ============================================================ qualidade dos dados (só leitura) */
const RE_NOME_RUIM = /^(cliente|lead|teste|sem nome|n\/?a|\.+|[0-9\s()+-]*)$/i;
/**
 * Confere os leads contra os outros sistemas e diz o que está torto, com o caminho para consertar.
 * ctx: { os: [{lead_id,cliente_id,telefone,etapa}], agendamentos:[...], sugestoes: Map(leadId → [{rotulo,valor}]), orcs: [...] }
 * NÃO altera nada: é só a lista que o gestor usa para corrigir.
 */
function qualidadePainel(leads, ctx = {}, agora = Date.now()) {
  const todos = leads || [], abertos = todos.filter(l => ABERTAS.includes(l.status));
  const osAberta = (ctx.os || []).filter(o => !['entregue', 'cancelada', 'cancelado'].includes(o.etapa));
  const temOs = l => osAberta.some(o => o.lead_id === l.id || (l.cliente_id && o.cliente_id === l.cliente_id) || (e164(o.telefone) && e164(o.telefone) === e164(l.telefone)));
  const ags = (ctx.agendamentos || []).filter(a => ['aguardando', 'confirmado'].includes(a.status));
  const temAg = l => ags.some(a => a.lead_id === l.id || (l.cliente_id && a.cliente_id === l.cliente_id) || (e164(a.telefone) && e164(a.telefone) === e164(l.telefone)));
  const orcs = ctx.orcs || [];
  const temOrc = l => orcs.some(o => o.lead_id === l.id || (l.cliente_id && o.cliente_id === l.cliente_id) || (e164(o.cliente_telefone) && e164(o.cliente_telefone) === e164(l.telefone)));
  const ex = (l, detalhe) => ({ id: l.id, nome: l.nome, status: l.status, telefone: l.telefone || null, detalhe: detalhe || null, responsavel_id: l.responsavel_id || null });
  const verificacoes = [];
  const add = (codigo, titulo, gravidade, peso, itens, comoCorrigir, extra = {}) => { if (itens.length) verificacoes.push({ codigo, titulo, gravidade, peso, total: itens.length, exemplos: itens.slice(0, 12), como_corrigir: comoCorrigir, ...extra }); };
  const concl = todos.filter(l => l.status === 'concluido');
  const semValor = concl.filter(l => !(Number(l.valor_pago) > 0) && !/Cortesia: sem cobran/i.test(l.observacoes || ''));
  add('concluidos_sem_valor', 'Vendas concluídas sem valor pago', 'alta', 30, semValor.map(l => { const s = ctx.sugestoes?.get(l.id) || []; return { ...ex(l, s[0] ? `Sugestão: ${brl0(s[0].valor)} (${s[0].rotulo})` : 'Sem sugestão: pergunte a quem atendeu'), sugestoes: s.slice(0, 3) }; }),
    'Gestor: abra "Preencher valores" e use as sugestões ou marque cortesia. Nada foi alterado.', { acao: 'valores' });
  add('concluidos_sem_responsavel', 'Vendas sem vendedor', 'media', 12, concl.filter(l => !l.responsavel_id).map(l => ex(l, Number(l.valor_pago) > 0 ? brl0(l.valor_pago) : null)), 'Sem vendedor a venda não entra no ranking nem no tempo de resposta. Atribua quem atendeu.');
  add('concluidos_sem_data', 'Concluídos sem data de fechamento', 'media', 6, concl.filter(l => !l.closed_at).map(l => ex(l)), 'Reabra e conclua de novo para gravar a data.');
  add('em_servico_sem_ordem', 'Em serviço, mas sem ordem aberta no Pátio', 'alta', 18, abertos.filter(l => l.status === 'em_servico' && !temOs(l)).map(l => ex(l, 'O carro está mesmo na oficina?')), 'Se o carro está na oficina, abra a entrada no Pátio; se já saiu, conclua o lead com o valor.', { acao: 'movimentos' });
  add('agendado_sem_horario', 'Agendado, mas sem horário na Agenda', 'media', 10, abertos.filter(l => l.status === 'agendado' && !temAg(l) && !temOs(l)).map(l => ex(l)), 'Marque o horário na Agenda ou volte o lead para "Em contato".', { acao: 'movimentos' });
  add('orcamento_sem_orcamento', 'Em Orçamento, mas sem orçamento no Orçador', 'baixa', 4, abertos.filter(l => l.status === 'orcamento' && !temOrc(l) && !(Number(l.valor_orcado) > 0)).map(l => ex(l)), 'Crie o orçamento no Orçador ou registre o valor orçado.');
  add('valor_estranho', 'Valor pago fora do normal', 'media', 8, concl.filter(l => Number(l.valor_pago) > 80000 || (Number(l.valor_pago) > 0 && Number(l.valor_orcado) > 0 && (l.valor_pago > l.valor_orcado * 5 || l.valor_pago < l.valor_orcado * 0.15))).map(l => ex(l, `Pago ${brl0(l.valor_pago)} · orçado ${brl0(l.valor_orcado)}`)), 'Confira se não foi um zero a mais ou a menos.');
  add('perdidos_sem_motivo', 'Perdidos sem motivo', 'media', 10, todos.filter(l => l.status === 'perdido' && !R5.motivoDe(l.observacoes)).map(l => ex(l)), 'Sem motivo não dá para saber o que melhorar. Registre o motivo na ficha.', { acao: 'perdas' });
  add('nome_ruim', 'Nome que não ajuda a ligar', 'baixa', 3, abertos.filter(l => RE_NOME_RUIM.test(semControle(l.nome)) || semControle(l.nome).length < 3).map(l => ex(l)), 'Peça o nome ao cliente na próxima conversa.');
  add('placa_invalida', 'Placa fora do formato', 'baixa', 3, abertos.filter(l => String(l.placa || '').trim() && !RE_PLACA.test(String(l.placa).toUpperCase().replace(/[^A-Z0-9]/g, ''))).map(l => ex(l, l.placa)), 'Placa precisa ter 3 letras, 1 número, 1 letra ou número e 2 números.');
  add('origem_incerta', 'Veio de anúncio (utm) mas a origem não é Meta nem Google', 'baixa', 3, abertos.filter(l => /facebook|instagram|google|meta|fb|ig/i.test(String(l.utm_source || '')) && !ORIGENS_PAGAS.includes(l.origem)).map(l => ex(l, `utm: ${semControle(l.utm_source).slice(0, 30)} · origem: ${l.origem}`)), 'Corrija a origem para o retorno do Ads ficar certo.');
  const dup = new Map(); for (const l of abertos) { const t = e164(l.telefone); if (t) (dup.get(t) || dup.set(t, []).get(t)).push(l); }
  add('duplicados', 'Telefone repetido em leads abertos', 'media', 8, [...dup.values()].filter(v => v.length > 1).flat().map(l => ex(l, 'Mesmo telefone em mais de um lead aberto')), 'Junte no lead mais completo e conclua ou perca os outros.');
  add('sem_telefone', 'Sem telefone válido', 'alta', 12, abertos.filter(l => !e164(l.telefone)).map(l => ex(l)), 'Sem telefone não dá para chamar nem receber aviso.');
  add('sem_dono', 'Abertos sem responsável', 'baixa', 4, abertos.filter(l => !l.responsavel_id).map(l => ex(l)), 'Distribua em "Distribuir".', { acao: 'distribuir' });
  const penal = verificacoes.reduce((t, v) => t + Math.min(v.peso, v.peso * (v.total / Math.max(8, todos.length * 0.1))), 0);
  const nota = Math.max(0, Math.min(100, Math.round(100 - penal)));
  const ordem = { alta: 0, media: 1, baixa: 2 };
  verificacoes.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || b.total - a.total);
  return { nota, nivel: nota >= 85 ? 'boa' : nota >= 60 ? 'regular' : 'ruim', total_leads: todos.length, verificacoes, a_corrigir: verificacoes.reduce((t, v) => t + v.total, 0),
    valor_sem_registro_estimado: r2(semValor.reduce((t, l) => t + (ctx.sugestoes?.get(l.id)?.[0]?.valor || 0), 0)) };
}

/* ============================================================ resumos do dono (copiar e colar) */
const TIPOS_RESUMO = ['manha', 'fechamento', 'semana'];
const TITULO_RESUMO = { manha: 'Bom dia', fechamento: 'Fechamento do dia', semana: 'Resumo da semana' };
/**
 * Texto pronto para o WhatsApp do dono enquanto o envio automático está parado.
 * r = resumoDono(); x = { hoje, ontem, agenda_hoje, agenda_amanha, retornos, contatos_por_pessoa, prioridades, perdas, qualidade }.
 */
function montarResumoDono(tipo, r, x = {}, quando = new Date()) {
  if (!TIPOS_RESUMO.includes(tipo)) tipo = 'manha';
  const dia = quando.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const L = [`🏎 *IndyCar · ${TITULO_RESUMO[tipo]}* (${dia})`];
  const m = r?.mes;
  const meta = () => { if (m?.ritmo?.meta > 0) L.push(`💰 Mês: ${brl0(m.ritmo.realizado)} de ${brl0(m.ritmo.meta)} (${m.ritmo.pct}%). No ritmo, fecha em ${brl0(m.ritmo.projecao)}${m.ritmo.risco ? ` ⚠️ faltam ${brl0(m.ritmo.por_dia_util)} por dia útil` : ''}.`);
    else if (m) L.push(`💰 Mês: ${brl0(m.faturamento)} em ${plural(m.vendas, 'serviço', 'serviços')}.`); };
  if (tipo === 'manha') {
    if (x.ontem) L.push(`📅 Ontem: ${plural(x.ontem.leads, 'lead novo', 'leads novos')}, ${plural(x.ontem.vendas, 'venda', 'vendas')}, ${brl0(x.ontem.faturamento)}.`);
    meta();
    if (x.agenda_hoje != null) L.push(`🗓 Hoje na Agenda: ${plural(x.agenda_hoje, 'cliente', 'clientes')}${x.agenda_amanha != null ? ` (amanhã ${x.agenda_amanha})` : ''}.`);
    if (r?.patio) L.push(`🔧 Oficina agora: ${plural(r.patio.no_patio, 'carro', 'carros')}, ${plural(r.patio.prontos, 'pronto', 'prontos')}.`);
    if (x.retornos) L.push(`⏰ Retornos combinados: ${x.retornos.hoje} para hoje, ${x.retornos.atrasados} atrasados.`);
    if (r?.orcamentos) L.push(`🧾 Orçamentos esperando resposta: ${r.orcamentos.enviados} (${brl0(r.orcamentos.valor_enviado)}).`);
  } else if (tipo === 'fechamento') {
    const h = x.hoje || {};
    L.push(`✅ Hoje: ${plural(h.leads || 0, 'lead novo', 'leads novos')}, ${plural(h.contatos || 0, 'contato registrado', 'contatos registrados')}, ${plural(h.vendas || 0, 'venda', 'vendas')} (${brl0(h.faturamento || 0)}).`);
    if (h.orcamentos_enviados != null) L.push(`🧾 Orçamentos enviados hoje: ${h.orcamentos_enviados}.`);
    if (r?.patio) L.push(`🔧 Entregues hoje: ${r.patio.entregues_hoje}. Ainda na oficina: ${r.patio.no_patio}.`);
    meta();
    if (x.agenda_amanha != null) L.push(`🗓 Amanhã na Agenda: ${plural(x.agenda_amanha, 'cliente', 'clientes')}.`);
    if (x.contatos_por_pessoa?.length) L.push(`📞 Contatos: ${x.contatos_por_pessoa.slice(0, 4).map(p => `${p.nome.split(' ')[0]} ${p.contatos}`).join(' · ')}.`);
  } else {
    if (r?.semana) L.push(`📈 Semana: ${r.semana.leads} leads, ${r.semana.vendas} vendas, ${brl0(r.semana.faturamento)}, conversão ${r.semana.conversao}%.`);
    if (r?.anterior && r.anterior.faturamento > 0) { const d = Math.round((r.semana.faturamento - r.anterior.faturamento) / r.anterior.faturamento * 100); L.push(`${d >= 0 ? '▲' : '▼'} Faturamento ${d >= 0 ? 'subiu' : 'caiu'} ${Math.abs(d)}% contra a semana anterior.`); }
    meta();
    if (r?.ads) L.push(`📣 Anúncios no mês: gasto ${brl0(r.ads.gasto_mes)}, ${plural(r.ads.ganhos, 'venda', 'vendas')}${r.ads.roas != null ? `, retorno ${r.ads.roas}x` : ''}.`);
    if (x.perdas?.length) L.push(`📉 Por que perdemos: ${x.perdas.slice(0, 3).map(p => `${p.motivo.toLowerCase()} (${p.qtd})`).join(', ')}.`);
    if (r?.avaliacoes) L.push(`⭐ Nota média ${r.avaliacoes.media} (${r.avaliacoes.total} avaliações).`);
  }
  const pontos = (r?.insights || []).filter(i => i.nivel !== 'ok').slice(0, tipo === 'semana' ? 5 : 4);
  if (x.qualidade?.vendas_sem_valor) pontos.push({ texto: `${plural(x.qualidade.vendas_sem_valor, 'venda concluída está', 'vendas concluídas estão')} sem valor pago: o faturamento real é maior que o mostrado.` });
  if (pontos.length) { L.push('', '*Atenção:*'); for (const p of pontos.slice(0, 6)) L.push('• ' + p.texto); }
  if (tipo === 'manha' && x.prioridades?.length) { L.push('', '*Para começar:*'); for (const p of x.prioridades.slice(0, 3)) L.push(`• ${p.nome}: ${p.texto}`); }
  return L.join('\n').slice(0, 3500);
}

module.exports = {
  linkEntradaPatio, atalhosDoLead, sugerirMovimentos, movimentoAindaVale, observacoesComMotivo, CODIGOS_MOVIMENTO, RANK_ETAPA,
  agruparRetornos, saudeDoLead, melhorHorario, canalQueFunciona, tempoComoLead,
  analisarPerdas, scriptReabordar, MOTIVOS_RECUPERAVEIS, painelIndicacoes, scriptAgradecerIndicacao,
  desempenhoPorOrigem, resumoOrigem, rotuloOrigem, ROTULO_ORIGEM, qualidadePainel, montarResumoDono, TIPOS_RESUMO,
  primeiroNome, fimDoDiaBrt, ROTULO_STATUS,
};
