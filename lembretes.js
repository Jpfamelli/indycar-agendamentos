// -----------------------------------------------------------------------------
// LEMBRETES da Agenda ligados ao Comunicar (rodada 6, C1b, 21/10/2026) — funções PURAS, testadas em
// tests/lembretes.test.mjs. Quem MANDA o lembrete é o Comunicar (fila posvenda_envios, tipo 'lembrete',
// chave `lembrete:<agendamento>`). A Agenda aqui só (1) explica a situação de cada horário e (2) deixa a
// recepção pedir o lembrete AGORA, pela mesma fila, respeitando as mesmas travas (sem telefone, cliente
// pediu para parar, pausa geral, horário já encerrado).
// -----------------------------------------------------------------------------
const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const telefoneNacional = (t) => { const d = soDigitos(t); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d || null; };

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** "hoje às 14:00", "amanhã às 09:30", "sexta (24/10) às 08:00" — o mesmo jeito de falar do Comunicar. */
export function quandoRelativo(dataIso, hora, hojeIso) {
  const h = String(hora || '').slice(0, 5);
  const as = h ? ` às ${h}` : '';
  if (dataIso === hojeIso) return `hoje${as}`;
  if (dataIso === somaDias(hojeIso, 1)) return `amanhã${as}`;
  const d = new Date(`${dataIso}T12:00:00Z`);
  const [, m, dia] = dataIso.split('-');
  return `${DIAS_SEMANA[d.getUTCDay()]} (${dia}/${m})${as}`;
}

/** Modelo do Comunicar (`{primeiro_nome}`, `{servico}`, `{quando}`, `{carro}`, `{placa}`, `{nome}`) preenchido com o horário. */
export function textoDoLembrete(modelo, a, hojeIso) {
  const nome = String(a?.cliente_nome || '').trim();
  const mapa = {
    nome, primeiro_nome: nome.split(/\s+/)[0] || '', carro: a?.veiculo || 'seu carro', placa: a?.placa || '',
    servico: a?.servico || 'o atendimento', quando: quandoRelativo(a?.data, a?.hora, hojeIso),
  };
  const base = modelo && String(modelo).trim() ? modelo : 'Oi {primeiro_nome}! Lembrete da IndyCar: seu horário para {servico} é {quando}. Posso confirmar? Se precisar remarcar, é só responder por aqui. 🏁';
  return String(base).replace(/\{(\w+)\}/g, (_, k) => mapa[k] ?? '').replace(/[ \t]{2,}/g, ' ').trim();
}

const ENVIADOS = new Set(['enviado', 'entregue', 'lido', 'respondido']);
const NA_FILA = new Set(['pendente', 'agendado', 'fila', 'enviando']);

/** Instante (ms) em que o horário acontece, no fuso da oficina (UTC-3, sem horário de verão). */
export const instanteDoHorario = (data, hora) => Date.parse(`${data}T${String(hora || '08:00').slice(0, 5)}:00-03:00`);

/**
 * A verdade sobre o lembrete de UM horário.
 *   a        { id, data, hora, status, telefone, compareceu }
 *   envio    o envio mais recente do tipo 'lembrete' deste horário (ou null)
 *   cfg      { ativo_lembrete, horas_lembrete, pausa_geral }
 *   cliente  { aceita_mensagens } (ou null)
 *   agora    ms
 * Devolve { codigo, rotulo, tom, podeMandar, motivo, saiEm, resposta }.
 *   tom: 'bom' | 'aviso' | 'ruim' | 'neutro'
 */
export function situacaoDoLembrete({ a, envio = null, cfg = {}, cliente = null, agora = Date.now() }) {
  const base = { podeMandar: false, motivo: null, saiEm: null, resposta: envio?.resposta_tipo || null };
  const vivo = ['aguardando', 'confirmado'].includes(a?.status) && a?.compareceu !== true && a?.compareceu !== 1;
  if (!vivo) return { ...base, codigo: 'encerrado', rotulo: 'sem lembrete (horário já teve desfecho)', tom: 'neutro' };
  const quando = instanteDoHorario(a.data, a.hora);
  if (Number.isFinite(quando) && quando < agora) return { ...base, codigo: 'passou', rotulo: 'horário já passou', tom: 'neutro' };

  const r = envio?.resposta_tipo;
  if (r === 'positiva') return { ...base, codigo: 'respondeu_sim', rotulo: 'cliente respondeu que vem 👍', tom: 'bom' };
  if (r === 'negativa') return { ...base, codigo: 'respondeu_nao', rotulo: 'cliente respondeu que não vem 👎', tom: 'ruim' };
  if (r === 'parar') return { ...base, codigo: 'parar', rotulo: 'cliente pediu para não receber mensagens', tom: 'ruim', motivo: 'O cliente pediu para parar.' };

  const tel = telefoneNacional(soDigitos(a.telefone));
  if (!tel || tel.length < 10) return { ...base, codigo: 'sem_telefone', rotulo: 'sem telefone — não recebe lembrete', tom: 'aviso', motivo: 'Este horário não tem telefone.' };
  if (cliente && cliente.aceita_mensagens === false) return { ...base, codigo: 'nao_aceita', rotulo: 'cliente não aceita mensagens automáticas', tom: 'ruim', motivo: 'O cliente pediu para não receber mensagem automática.' };

  if (envio && ENVIADOS.has(envio.status)) return { ...base, codigo: 'enviado', rotulo: 'lembrete enviado, sem resposta ainda', tom: 'bom', motivo: 'O lembrete já foi enviado.', podeMandar: false, reenviavel: true };
  if (envio && NA_FILA.has(envio.status)) return { ...base, codigo: 'na_fila', rotulo: 'lembrete na fila do Comunicar', tom: 'neutro', motivo: 'Já está na fila.', podeMandar: false };
  if (cfg.pausa_geral) return { ...base, codigo: 'pausa_geral', rotulo: 'Comunicar em pausa geral', tom: 'aviso', motivo: 'O Comunicar está em pausa geral — nada sai agora.' };
  if (envio && envio.status === 'falhou') return { ...base, codigo: 'falhou', rotulo: 'o último lembrete falhou', tom: 'ruim', motivo: envio.erro || 'Falha no envio.', podeMandar: true };
  if (envio && ['pulado', 'cancelado'].includes(envio.status)) return { ...base, codigo: 'pulado', rotulo: 'lembrete não saiu' + (envio.motivo_pulado ? ` (${envio.motivo_pulado})` : ''), tom: 'aviso', motivo: envio.motivo_pulado || null, podeMandar: true };

  const horas = Number(cfg.horas_lembrete) || 20;
  const saiEm = Number.isFinite(quando) ? quando - horas * 3600_000 : null;
  if (cfg.ativo_lembrete === false) {
    return { ...base, codigo: 'automatico_desligado', rotulo: 'lembrete automático desligado no Comunicar', tom: 'aviso', podeMandar: true,
      motivo: 'O lembrete automático está desligado. Mande agora, se quiser.' };
  }
  if (saiEm && saiEm > agora) return { ...base, codigo: 'agendado', rotulo: 'sai sozinho', tom: 'neutro', saiEm, podeMandar: true };
  return { ...base, codigo: 'pendente_de_sair', rotulo: 'vai sair na próxima rodada do Comunicar', tom: 'neutro', saiEm, podeMandar: true };
}

/** Chave da fila: a do Comunicar para o 1º lembrete; reenvios ganham sufixo (um por hora, para não duplicar clique duplo). */
export function chaveDoLembrete(agendamentoId, { reenvio = false, agora = Date.now() } = {}) {
  return reenvio ? `lembrete:${agendamentoId}:r${Math.floor(agora / 3600_000)}` : `lembrete:${agendamentoId}`;
}

/** Quando o lembrete deixa de valer: 30 min depois do horário (o carteiro pula o que perdeu o sentido). */
export function validadeDoLembrete(a) {
  const q = instanteDoHorario(a.data, a.hora);
  return new Date((Number.isFinite(q) ? q : Date.now()) + 30 * 60_000).toISOString();
}

/** Resumo de um dia para a faixa do Início ("Amanhã: 12 horários · 3 sem lembrete · 1 sem telefone"). */
export function resumoDosLembretes(itens) {
  const r = { total: itens.length, enviados: 0, respondeu: 0, na_fila: 0, sem_telefone: 0, bloqueados: 0, pendentes: 0, falhou: 0, podeMandar: 0 };
  for (const i of itens) {
    const c = i.situacao.codigo;
    if (['enviado'].includes(c)) r.enviados++;
    else if (['respondeu_sim', 'respondeu_nao'].includes(c)) r.respondeu++;
    else if (c === 'na_fila') r.na_fila++;
    else if (c === 'sem_telefone') r.sem_telefone++;
    else if (['parar', 'nao_aceita', 'pausa_geral'].includes(c)) r.bloqueados++;
    else if (c === 'falhou') r.falhou++;
    else if (['agendado', 'pendente_de_sair', 'automatico_desligado', 'pulado'].includes(c)) r.pendentes++;
    if (i.situacao.podeMandar) r.podeMandar++;
  }
  return r;
}
