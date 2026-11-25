/* ============================================================
   Rodada 18 (25/11/2026) — a casa em ordem

   1) WhatsApp parado, numa faixa só. Em 25/11 o WhatsApp estava parado desde 24/11 08:24 e NADA na tela dizia:
      o vigia acusava outra coisa (tarefas acumuladas), o disjuntor de envio estava limpo (ninguém tentou mandar)
      e a sincronia não tinha erro gravado. O único sinal era o silêncio: num dia útil chegam de 60 a 180 mensagens
      de cliente (10+ por hora). `decidirZap` junta tudo o que o servidor sabe numa resposta só:
        - confirmado: o disjuntor de envio (401, celular desconectado, cota), a sincronia recusada (401/403) ou o vigia;
        - silêncio: 4 horas de expediente (seg-sex 8h-18h, sáb 8h-12h, fuso de SP) sem nenhuma mensagem de cliente.
      O texto diz desde quando e o que fazer ("peça ao João para colar a chave em Ajustes › WhatsApp e chaves").

   2) Conversas esperando o consultor há semanas (253 em 25/11, 97 há mais de 30 dias, a mais antiga de maio):
      "Encerrar as paradas há mais de N dias" em lote. Conta antes, a pessoa confirma, registra quem fez (auditoria,
      com a lista e o estado anterior de cada uma) e dá para desfazer. Encerrar = status 'resolvida' e sai da fila
      do consultor. Nenhuma mensagem é apagada e o desfecho (fechou / não fechou) não é tocado; se o cliente
      escrever de novo a conversa reabre sozinha (gatilho tocar_conversa do banco).
   ============================================================ */
'use strict';

const TZ = 'America/Sao_Paulo';
const LIMIAR_SILENCIO_H = 4;
const MAX_LOTE = 500;
const DIAS_PERMITIDOS = [7, 15, 30, 60, 90];
const JANELA_DESFAZER_MS = 24 * 3600_000;
const ACAO_ENCERRAR = 'conversas.encerrar_paradas';
const ACAO_DESFAZER = 'conversas.desfazer_encerrar';
const PAPEIS_LOTE = new Set(['admin', 'gestor', 'atendente']);

/* São Paulo não tem horário de verão desde 2019: -03:00 fixo. */
const OFFSET_MS = 3 * 3600_000;
const emSP = (ms) => new Date(ms - OFFSET_MS);     // campos UTC deste Date = relógio de parede em SP

/** Janela de expediente do dia (em horas de parede): seg-sex 8-18, sáb 8-12, dom fechado. */
function expedienteDoDia(diaSemana) {
  if (diaSemana === 0) return null;
  if (diaSemana === 6) return [8, 12];
  return [8, 18];
}

/** Horas de expediente (fuso de SP) entre dois instantes. */
function horasComerciais(deMs, ateMs) {
  if (!Number.isFinite(deMs) || !Number.isFinite(ateMs) || ateMs <= deMs) return 0;
  let total = 0;
  // anda dia a dia no relógio de SP
  const ini = emSP(deMs);
  let dia = Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), ini.getUTCDate());   // meia-noite em SP (como UTC "de parede")
  const fimParede = ateMs - OFFSET_MS;
  const iniParede = deMs - OFFSET_MS;
  for (let i = 0; i < 400 && dia < fimParede; i++, dia += 86400_000) {
    const j = expedienteDoDia(new Date(dia).getUTCDay());
    if (!j) continue;
    const a = Math.max(dia + j[0] * 3600_000, iniParede);
    const b = Math.min(dia + j[1] * 3600_000, fimParede);
    if (b > a) total += b - a;
  }
  return total / 3600_000;
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "ter 24/11 às 08:24" no fuso da oficina. */
function quandoTexto(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const p = emSP(t);
  const dd = String(p.getUTCDate()).padStart(2, '0'), mm = String(p.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(p.getUTCHours()).padStart(2, '0'), mi = String(p.getUTCMinutes()).padStart(2, '0');
  return `${DIAS_CURTOS[p.getUTCDay()]} ${dd}/${mm} às ${hh}:${mi}`;
}

const ONDE = 'Ajustes › WhatsApp e chaves';
const MOTIVO_DO_CODIGO = { 'codewords-401': 'chave', 'whatsapp-desconectado': 'celular', cota: 'cota' };
const MOTIVO_DO_VIGIA = { 'codewords-fora': 'chave', 'whatsapp-fora': 'celular' };

/** O que fazer, por motivo. Quem pode resolver (administrador) lê a ação direta; o resto, a quem pedir. */
function oQueFazer(motivo, ehAdmin) {
  if (motivo === 'celular') return ehAdmin ? `Reconecte o celular da oficina em ${ONDE}.` : `Peça ao João para reconectar o celular em ${ONDE}.`;
  if (motivo === 'cota') return ehAdmin ? 'Renove o plano do CodeWords: as mensagens voltam a sair sozinhas.' : 'Peça ao João para renovar o plano do CodeWords.';
  if (motivo === 'silencio') return ehAdmin ? `Confira em ${ONDE}: se a chave foi recusada, cole uma nova.` : `Peça ao João para colar a chave em ${ONDE}.`;
  return ehAdmin ? `Cole a chave nova do CodeWords em ${ONDE}.` : `Peça ao João para colar a chave em ${ONDE}.`;
}

/**
 * Junta o que o servidor sabe numa resposta só.
 * @param {object} p
 * @param {object} p.zap        ZAP.estado() — { parado, codigo, desde }
 * @param {object} p.sincronia  pausaSincronia.estado() — { recusas }
 * @param {object} p.saude      { problema, desde } do vigia
 * @param {string} p.ultimaEntrada  ISO da última mensagem de cliente
 * @param {string} p.ultimaSaida    ISO da última mensagem que saiu de verdade
 * @param {number} p.agora      ms
 * @param {boolean} p.ehAdmin
 */
function decidirZap({ zap = {}, sincronia = {}, saude = {}, ultimaEntrada = null, ultimaSaida = null, agora = Date.now(), ehAdmin = false, limiarH = LIMIAR_SILENCIO_H } = {}) {
  let motivo = null, desde = null, confirmado = false;
  if (zap.parado && MOTIVO_DO_CODIGO[zap.codigo]) { motivo = MOTIVO_DO_CODIGO[zap.codigo]; desde = zap.desde || null; confirmado = true; }
  else if (MOTIVO_DO_VIGIA[saude.problema]) { motivo = MOTIVO_DO_VIGIA[saude.problema]; desde = saude.desde || null; confirmado = true; }
  else if ((sincronia.recusas || 0) > 0) { motivo = 'chave'; desde = ultimaEntrada || null; confirmado = true; }
  else if (ultimaEntrada) {
    const h = horasComerciais(Date.parse(ultimaEntrada), agora);
    if (h >= limiarH) { motivo = 'silencio'; desde = ultimaEntrada; }
  }
  const base = { ultima_entrada: ultimaEntrada || null, ultima_saida: ultimaSaida || null };
  if (!motivo) return { ok: true, parado: false, ...base };
  const quando = quandoTexto(desde);
  const situacao = {
    chave: 'o CodeWords recusou a chave: nada sai e nada chega.',
    celular: 'o celular da oficina está desconectado: nada sai e nada chega.',
    cota: 'a cota do CodeWords acabou: nada sai.',
    silencio: 'nenhuma mensagem de cliente chegou depois disso (num dia útil chegam várias por hora).',
  }[motivo];
  const titulo = quando ? `WhatsApp parado desde ${quando}` : 'WhatsApp parado';
  return {
    ok: true, parado: true, motivo, confirmado, desde, ...base,
    titulo, situacao,
    texto: `${titulo}: ${situacao}`,
    acao: oQueFazer(motivo, ehAdmin),
    // o envio, quando parado de verdade, não sai; no silêncio pode até sair, mas ninguém garante
    envio: confirmado && motivo !== 'silencio' ? 'retido' : 'incerto',
  };
}

/* ---------------- encerrar conversas paradas ---------------- */

const diasValidos = (d) => DIAS_PERMITIDOS.includes(Number(d)) ? Number(d) : null;
const corteDe = (dias, agora) => new Date(agora - dias * 86400_000).toISOString();
const empacotar = (itens) => itens.map(i => `${i.id},${i.status || 'aberta'},${i.desde || ''}`).join(';');
function desempacotar(txt) {
  return String(txt || '').split(';').filter(Boolean).map(s => {
    const [id, status, desde] = s.split(',');
    return { id, status: status || 'aberta', desde: desde || null };
  }).filter(i => /^[0-9a-f-]{36}$/i.test(i.id));
}

function criarParadas({ sb, auditar, agora = () => Date.now(), log = console.error } = {}) {
  const banco = () => (typeof sb === 'function' ? sb() : sb);

  /** Conversas esperando o consultor há mais de N dias (fila de atendimento, sem desfecho). */
  async function candidatas(dias, { limite = MAX_LOTE + 1 } = {}) {
    const b = banco();
    const corte = corteDe(dias, agora());
    const base = () => b.from('conversas').select('id,status,aguardando_desde,ultima_mensagem_em')
      .eq('tipo', 'atendimento').is('desfecho', null).eq('aguardando_consultor', true);
    const [r1, r2] = await Promise.all([
      base().lt('aguardando_desde', corte).order('aguardando_desde', { ascending: true }).limit(limite),
      // sem a data de quando passou para o consultor: vale a última mensagem
      base().is('aguardando_desde', null).lt('ultima_mensagem_em', corte).limit(limite),
    ]);
    if (r1.error || r2.error) throw new Error((r1.error || r2.error).message);
    return [...(r1.data || []), ...(r2.data || [])];
  }

  async function contar({ dias }) {
    const d = diasValidos(dias);
    if (!d) return { ok: false, status: 400, erro: 'Escolha 7, 15, 30, 60 ou 90 dias.' };
    if (!banco()) return { ok: false, status: 503, erro: 'Servidor sem banco.' };
    try {
      const lista = await candidatas(d);
      const datas = lista.map(c => c.aguardando_desde || c.ultima_mensagem_em).filter(Boolean).sort();
      return { ok: true, dias: d, total: Math.min(lista.length, MAX_LOTE), acima_do_teto: lista.length > MAX_LOTE, teto: MAX_LOTE, mais_antiga: datas[0] || null };
    } catch (e) { log('r18 contar:', e.message); return { ok: false, status: 503, erro: 'Não consegui contar agora. Tente de novo.' }; }
  }

  async function encerrar({ dias, perfil, esperado = null }) {
    const d = diasValidos(dias);
    if (!d) return { ok: false, status: 400, erro: 'Escolha 7, 15, 30, 60 ou 90 dias.' };
    if (!perfil || !PAPEIS_LOTE.has(perfil.papel)) return { ok: false, status: 403, erro: 'Só administrador, gestor ou atendente encerram em lote.' };
    const b = banco();
    if (!b) return { ok: false, status: 503, erro: 'Servidor sem banco.' };
    let lista;
    try { lista = (await candidatas(d)).slice(0, MAX_LOTE); }
    catch (e) { log('r18 encerrar/ler:', e.message); return { ok: false, status: 503, erro: 'Não consegui ler as conversas agora. Nada foi mudado.' }; }
    if (!lista.length) return { ok: true, dias: d, encerradas: 0, lote: null };
    // a contagem cresceu entre o "ver" e o "confirmar" (outra pessoa encerrou, ou chegou cliente)? pede para conferir
    if (Number.isFinite(Number(esperado)) && esperado !== null && lista.length > Number(esperado)) {
      return { ok: false, status: 409, codigo: 'contagem_mudou', total: lista.length, erro: `Agora são ${lista.length} conversas, não ${esperado}. Confira o número e confirme de novo.` };
    }
    const itens = lista.map(c => ({ id: c.id, status: c.status, desde: c.aguardando_desde || null }));
    // primeiro registra (quem, quando e o estado de antes de cada uma): sem registro não há desfazer, então não mexe
    const reg = await auditar({ perfil: perfil.id, acao: ACAO_ENCERRAR, tabela: 'conversas', registro: null, detalhes: { dias: d, total: itens.length, itens: empacotar(itens) } });
    if (!reg?.ok || reg.id == null) return { ok: false, status: 503, erro: 'Não consegui registrar quem encerrou. Nada foi mudado.' };
    let encerradas = 0;
    for (let i = 0; i < itens.length; i += 100) {
      const ids = itens.slice(i, i + 100).map(x => x.id);
      const { data, error } = await b.from('conversas').update({ status: 'resolvida', aguardando_consultor: false, aguardando_desde: null })
        .in('id', ids).eq('aguardando_consultor', true).select('id');
      if (error) { log('r18 encerrar:', error.message); break; }
      encerradas += (data || []).length;
    }
    return { ok: true, dias: d, encerradas, lote: String(reg.id), quando: new Date(agora()).toISOString() };
  }

  async function desfazer({ lote, perfil }) {
    if (!perfil) return { ok: false, status: 401, erro: 'Faça login.' };
    if (!/^\d{1,19}$/.test(String(lote || ''))) return { ok: false, status: 400, erro: 'Lote inválido.' };
    const b = banco();
    if (!b) return { ok: false, status: 503, erro: 'Servidor sem banco.' };
    const { data: reg, error } = await b.from('auditoria').select('id,perfil_id,acao,detalhes,created_at').eq('id', Number(lote)).maybeSingle();
    if (error || !reg || reg.acao !== ACAO_ENCERRAR) return { ok: false, status: 404, erro: 'Não achei esse encerramento.' };
    if (reg.perfil_id !== perfil.id && perfil.papel !== 'admin') return { ok: false, status: 403, erro: 'Só quem encerrou (ou o administrador) desfaz.' };
    if (agora() - Date.parse(reg.created_at) > JANELA_DESFAZER_MS) return { ok: false, status: 409, erro: 'Passou de 24 horas: desfaça abrindo as conversas uma a uma.' };
    const { data: ja } = await b.from('auditoria').select('id').eq('acao', ACAO_DESFAZER).eq('registro_id', String(reg.id)).limit(1);
    if ((ja || []).length) return { ok: false, status: 409, erro: 'Esse encerramento já foi desfeito.' };
    const itens = desempacotar(reg.detalhes?.itens);
    const inicio = new Date(agora() - 1000).toISOString();
    let voltaram = 0, ficaram = 0;
    // uma por vez (cada uma volta com a data em que passou para o consultor); só as que ninguém mexeu depois
    for (const it of itens) {
      const { data, error: e } = await b.from('conversas')
        .update({ status: it.status, aguardando_consultor: true, aguardando_desde: it.desde })
        .eq('id', it.id).eq('status', 'resolvida').eq('aguardando_consultor', false).select('id');
      if (e) { log('r18 desfazer:', e.message); ficaram++; continue; }
      if ((data || []).length) voltaram++; else ficaram++;
    }
    /* Voltar a "esperando consultor" dispara o aviso do sino (gatilho notificar_conversa) para cada uma: isso é
       desfazer, não cliente novo. Os avisos criados agora por essas conversas já nascem lidos. */
    if (voltaram) {
      try {
        const links = itens.map(i => '/?conversa=' + i.id);
        for (let i = 0; i < links.length; i += 100) {
          await b.from('notificacoes').update({ lida_em: new Date(agora()).toISOString() })
            .eq('tipo', 'aguardando').gte('created_at', inicio).in('link', links.slice(i, i + 100)).is('lida_em', null);
        }
      } catch (e) { log('r18 desfazer/sino:', e.message); }
    }
    await auditar({ perfil: perfil.id, acao: ACAO_DESFAZER, tabela: 'conversas', registro: String(reg.id), detalhes: { voltaram, ficaram } });
    return { ok: true, voltaram, ficaram };
  }

  return { contar, encerrar, desfazer, candidatas };
}

module.exports = {
  horasComerciais, quandoTexto, decidirZap, oQueFazer, criarParadas, empacotar, desempacotar,
  LIMIAR_SILENCIO_H, MAX_LOTE, DIAS_PERMITIDOS, ACAO_ENCERRAR, ACAO_DESFAZER, PAPEIS_LOTE,
};
