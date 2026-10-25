'use strict';
/* ============================================================
   Rodada 7 (C4) — o dia em que a chave do CodeWords voltar.

   Semanas de WhatsApp parado deixam um monte de linhas "falhou" em whatsapp_mensagens: respostas de atendentes
   e da IA que nunca chegaram ao cliente. Quando a chave volta, mandar tudo de uma vez seria o pior jeito:
   o cliente receberia frases repetidas, respostas de dias atrás (“te espero hoje às 9h” de uma terça que já
   passou) e dezenas de mensagens no mesmo segundo.

   Este módulo faz duas coisas:
     planejar()  → separa cada mensagem em ENVIAR / REVISAR / PULAR, com o motivo em português.
     iniciar()   → manda só as que podem sair, UMA POR VEZ, com intervalo, parando no primeiro sinal de problema.

   Garantias (todas testadas em test/r7c4-retomada.test.js):
     · nada sai sozinho: quem começa é uma pessoa (o clique em “Reenviar com calma”);
     · a mesma frase não sai duas vezes (duplicadas ficam de fora);
     · “não sabemos se chegou” (timeout) nunca é reenviada aqui — só pelo clique “Reenviar” da própria mensagem;
     · mensagem velha, de conversa que já seguiu ou que fala de “hoje/amanhã/horário” vai para REVISAR;
     · cada mensagem é “reservada” no banco antes de sair: se o servidor cair no meio, ela fica marcada como
       “sem confirmação” e não é reenviada por engano (nada duplica);
     · só um trabalho por vez; se o WhatsApp parar de novo, o trabalho para na hora;
     · atendente só mexe nas conversas dele ou sem dono; gestor e administrador em todas.
   O envio de verdade é injetado (`entregar`): é o MESMO entregador idempotente da tela.
   ============================================================ */

const R6 = require('../public/r6-regras.js');
const { normalizarCorpo } = require('./r7-envio.js');
const ENT = require('./entrega.js');

const DIA = 86_400_000;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* A retomada reserva a mensagem com este texto: se o servidor cair no meio, ela fica “sem confirmação”. */
const ERRO_RESERVA = ENT.PREFIXO_SEM_CONFIRMACAO + ': a retomada começou a reenviar e o servidor parou no meio — confira no WhatsApp antes de mandar de novo.';
const RE_TEMPO = /\b(hoje|amanha|agora|ontem|ainda\s+hoje|daqui\s+a\s+pouco|mais\s+tarde|[àa]s?\s+\d{1,2}\s*(h|:)|\d{1,2}\s*h(\d{2})?\b|\bdia\s+\d{1,2}\b|segunda|terca|quarta|quinta|sexta|sabado)\b/;

const MOTIVOS = {
  sem_confirmacao: { acao: 'revisar', rotulo: 'Não sabemos se chegou', ajuda: 'Confira na conversa do WhatsApp. Se não chegou, use “Reenviar” nesta mensagem.' },
  reservada: { acao: 'revisar', rotulo: 'Estava sendo reenviada', ajuda: 'O servidor parou no meio do reenvio: confira no WhatsApp antes de mandar de novo.' },
  conversa_seguiu: { acao: 'revisar', rotulo: 'A conversa já seguiu', ajuda: 'Depois desta mensagem já saiu outra para o cliente. Provavelmente não precisa mais.' },
  cliente_escreveu: { acao: 'revisar', rotulo: 'O cliente escreveu depois', ajuda: 'A resposta da IA pode não servir mais: leia o que o cliente falou e responda de novo.' },
  velha: { acao: 'revisar', rotulo: 'Mensagem velha', ajuda: 'Tem mais de 24 horas. Releia antes de mandar.' },
  horario_no_texto: { acao: 'revisar', rotulo: 'Fala de hoje/amanhã/horário', ajuda: 'O texto cita dia ou hora e já passou algum tempo: confira se ainda vale.' },
  promessa: { acao: 'revisar', rotulo: 'Promete prazo, peça ou brinde', ajuda: 'A IA não pode prometer isso. Edite antes de mandar.' },
  duplicada: { acao: 'pular', rotulo: 'Repetida', ajuda: 'Existe outra igual nesta conversa; só uma sai.' },
  preco: { acao: 'pular', rotulo: 'Cita preço (da IA)', ajuda: 'A IA nunca passa preço. Esta não sai.' },
  disparo: { acao: 'pular', rotulo: 'É do Comunicar', ajuda: 'Mensagens automáticas são do Comunicar, não desta tela.' },
  bloqueado: { acao: 'pular', rotulo: 'Número bloqueado ou grupo', ajuda: 'Número na lista de bloqueados ou grupo do WhatsApp.' },
  resolvida: { acao: 'pular', rotulo: 'Já resolvida', ajuda: 'Alguém marcou que resolveu por outro meio.' },
  de_outro: { acao: 'pular', rotulo: 'É de outro atendente', ajuda: 'Só o dono da conversa, um gestor ou o administrador reenvia.' },
};

/** O erro guardado indica que não dá para afirmar se saiu? */
const eSemConfirmacao = (erro) => ENT.ehSemConfirmacao(erro);
const eReservada = (erro) => String(erro || '') === ERRO_RESERVA;

/**
 * Classifica UMA mensagem que falhou. Pura: recebe o que o banco sabe em volta dela.
 *   m: { id, corpo, erro, created_at, gerada_por_ia }
 *   ctx: { agora, conversa:{tipo,atribuida_a,bloqueado}, depoisSaiu:boolean, depoisEntrou:boolean, repetida:boolean, idadeMaxH }
 * Devolve { acao:'enviar'|'revisar'|'pular', motivo|null }.
 */
function classificar(m, ctx = {}) {
  const agora = ctx.agora ? new Date(ctx.agora) : new Date();
  const idadeMin = Math.max(0, Math.round((agora - Date.parse(m.created_at)) / 60000));
  const fim = (motivo) => ({ acao: motivo ? MOTIVOS[motivo].acao : 'enviar', motivo: motivo || null, idade_min: idadeMin });
  if (/^Resolvido/.test(m.erro || '')) return fim('resolvida');
  if (eReservada(m.erro)) return fim('reservada');
  if (eSemConfirmacao(m.erro)) return fim('sem_confirmacao');
  if (ctx.conversa && (ctx.conversa.tipo || 'atendimento') !== 'atendimento') return fim('disparo');
  if (ctx.conversa?.bloqueado) return fim('bloqueado');
  if (ctx.deOutro) return fim('de_outro');
  if (ctx.repetida) return fim('duplicada');
  if (m.gerada_por_ia && R6.textoTemPreco(m.corpo)) return fim('preco');
  if (m.gerada_por_ia && R6.textoPrometeDemais(m.corpo).length) return fim('promessa');
  if (ctx.depoisSaiu) return fim('conversa_seguiu');
  if (idadeMin > (ctx.idadeMaxH || 24) * 60) return fim('velha');
  if (m.gerada_por_ia && ctx.depoisEntrou) return fim('cliente_escreveu');
  if (idadeMin > 180 && RE_TEMPO.test(R6.semAcento(m.corpo))) return fim('horario_no_texto');
  return fim(null);
}

function criarRetomada({ sb, entregar, zap, agora = () => new Date(), dormir = (ms) => new Promise((r) => setTimeout(r, ms)), intervaloMs = 4000, jitterMs = 600,
  maximoPorTrabalho = 40, auditar = async () => ({ ok: true }), log = console.error } = {}) {
  if (!sb || typeof entregar !== 'function') throw new Error('retomada sem banco ou entregador');
  let trabalho = null;          // o trabalho em andamento (ou o último terminado)
  let rodando = false;

  async function ler(consulta) { try { const { data, error } = await consulta; if (error) { log('retomada ler:', error.message); return []; } return data || []; } catch (e) { log('retomada ler:', e.message); return []; } }

  /** Tudo o que não saiu nos últimos dias, já separado em enviar / revisar / pular. */
  async function planejar({ dias = 7, papel = 'atendente', perfilId = null, idadeMaxH = 24 } = {}) {
    const t0 = agora();
    const desde = new Date(t0.getTime() - Math.min(30, Math.max(1, dias)) * DIA).toISOString();
    const falhas = await ler(sb.from('whatsapp_mensagens').select('id,conversa_id,corpo,erro,created_at,gerada_por_ia,enviado_por,telefone,nome')
      .eq('direcao', 'saida').eq('status', 'falhou').gte('created_at', desde).order('created_at', { ascending: true }).limit(500));
    const convIds = [...new Set(falhas.map((m) => m.conversa_id).filter(Boolean))];
    const conversas = convIds.length ? await ler(sb.from('conversas').select('id,nome,telefone,telefone_e164,tipo,atribuida_a,cliente_id').in('id', convIds.slice(0, 300))) : [];
    const porConv = new Map(conversas.map((c) => [c.id, c]));
    // quem escreveu/enviou depois: pega as mensagens recentes dessas conversas de uma vez só
    const recentes = convIds.length ? await ler(sb.from('whatsapp_mensagens').select('id,conversa_id,direcao,status,created_at')
      .in('conversa_id', convIds.slice(0, 300)).gte('created_at', desde).order('created_at', { ascending: true }).limit(5000)) : [];
    const porConvMsgs = new Map();
    for (const r of recentes) { if (!porConvMsgs.has(r.conversa_id)) porConvMsgs.set(r.conversa_id, []); porConvMsgs.get(r.conversa_id).push(r); }
    const bloqueados = new Set((await ler(sb.from('numeros_bloqueados').select('telefone').limit(500))).map((b) => String(b.telefone || '').replace(/\D/g, '').slice(-10)));

    const vistos = new Map();      // conversa|corpo → id da primeira (a mais antiga) que fica
    const itens = [];
    for (const m of falhas) {
      const c = porConv.get(m.conversa_id) || null;
      const msgs = porConvMsgs.get(m.conversa_id) || [];
      const depois = msgs.filter((x) => x.created_at > m.created_at && x.id !== m.id);
      const depoisSaiu = depois.some((x) => x.direcao === 'saida' && ENT.JA_SAIU.has(x.status));
      const depoisEntrou = depois.some((x) => x.direcao === 'entrada');
      const tel10 = String(c?.telefone_e164 || c?.telefone || m.telefone || '').replace(/\D/g, '').slice(-10);
      const ehGrupo = /@g\.us|@broadcast/.test(String(c?.telefone || m.telefone || '')) || String(c?.telefone || '').replace(/\D/g, '').length > 15;
      const chave = m.conversa_id + '|' + normalizarCorpo(m.corpo);
      let repetida = false;
      if (!eSemConfirmacao(m.erro) && !/^Resolvido/.test(m.erro || '')) {
        if (vistos.has(chave)) repetida = true; else vistos.set(chave, m.id);
      }
      const deOutro = papel === 'atendente' && !!c?.atribuida_a && c.atribuida_a !== perfilId;
      const cl = classificar(m, { agora: t0, conversa: c ? { tipo: c.tipo, bloqueado: bloqueados.has(tel10) || ehGrupo } : null, depoisSaiu, depoisEntrou, repetida, idadeMaxH, deOutro });
      itens.push({ id: m.id, conversa_id: m.conversa_id, nome: R6.nomeSeguro(c?.nome || m.nome) || null, telefone: c?.telefone || m.telefone || null,
        corpo: String(m.corpo || '').slice(0, 280), ia: !!m.gerada_por_ia, erro: m.erro || null, created_at: m.created_at, idade_min: cl.idade_min,
        acao: cl.acao, motivo: cl.motivo, motivo_rotulo: cl.motivo ? MOTIVOS[cl.motivo].rotulo : null, ajuda: cl.motivo ? MOTIVOS[cl.motivo].ajuda : 'Pode sair agora.' });
    }
    const por = (a) => itens.filter((i) => i.acao === a);
    return { ok: true, gerado_em: t0.toISOString(), total: itens.length, enviar: por('enviar'), revisar: por('revisar'), pular: por('pular'),
      por_conversa: new Set(por('enviar').map((i) => i.conversa_id)).size,
      segundos_estimados: Math.round(Math.min(por('enviar').length, maximoPorTrabalho) * (intervaloMs / 1000)) };
  }

  async function reservar(item) {
    // reserva atômica: só quem ainda a encontra “falhou” com o mesmo erro leva
    let q = sb.from('whatsapp_mensagens').update({ erro: ERRO_RESERVA }).eq('id', item.id).eq('status', 'falhou');
    q = item.erro === null || item.erro === undefined ? q.is('erro', null) : q.eq('erro', item.erro);
    const { data, error } = await q.select('id');
    return !error && Array.isArray(data) && data.length === 1;
  }

  /** Reavalia uma mensagem na hora de sair (ela pode ter mudado nos últimos segundos). */
  async function aindaPodeSair(item) {
    const { data: m } = await sb.from('whatsapp_mensagens').select('id,status,erro,created_at,conversa_id').eq('id', item.id).maybeSingle();
    if (!m || m.status !== 'falhou') return { ok: false, motivo: 'ja_saiu' };
    if (eSemConfirmacao(m.erro) || /^Resolvido/.test(m.erro || '')) return { ok: false, motivo: 'mudou' };
    const { data: depois } = await sb.from('whatsapp_mensagens').select('id,status,direcao').eq('conversa_id', m.conversa_id).eq('direcao', 'saida').gt('created_at', m.created_at).limit(10);
    if ((depois || []).some((x) => ENT.JA_SAIU.has(x.status))) return { ok: false, motivo: 'conversa_seguiu' };
    return { ok: true, erro: m.erro ?? null };
  }

  async function gravarTrabalho(fim = false) {
    if (!trabalho) return;
    const linha = { total: trabalho.total, enviadas: trabalho.enviadas, puladas: trabalho.puladas, falhas: trabalho.falhas, sem_confirmacao: trabalho.sem_confirmacao,
      parou_por: trabalho.parou_por || null, resumo: { motivos_puladas: trabalho.motivos, ids_enviados: trabalho.ids_enviados.slice(0, 100) }, ...(fim ? { terminou_em: agora().toISOString() } : {}) };
    try {
      if (!trabalho.registro) {
        const { data } = await sb.from('r7_c4_retomadas').insert({ iniciado_por: trabalho.por?.id || null, iniciado_em: trabalho.iniciado_em, ...linha }).select('id').maybeSingle();
        trabalho.registro = data?.id || 'x';
      } else if (trabalho.registro !== 'x') await sb.from('r7_c4_retomadas').update(linha).eq('id', trabalho.registro);
    } catch (e) { log('retomada gravar:', e.message); }
  }

  async function executar(fila) {
    rodando = true;
    try {
      for (let i = 0; i < fila.length; i++) {
        const item = fila[i];
        if (trabalho.pedirParada) { trabalho.parou_por = 'pedido'; break; }
        const z = zap?.estado ? zap.estado() : { parado: false };
        if (z.parado) { trabalho.parou_por = 'whatsapp_parado'; trabalho.motivo_texto = z.texto || null; break; }
        trabalho.atual = { id: item.id, nome: item.nome };
        const ainda = await aindaPodeSair(item);
        if (!ainda.ok) { trabalho.puladas++; trabalho.motivos[ainda.motivo] = (trabalho.motivos[ainda.motivo] || 0) + 1; continue; }
        if (!(await reservar({ id: item.id, erro: ainda.erro }))) { trabalho.puladas++; trabalho.motivos.reservada_por_outro = (trabalho.motivos.reservada_por_outro || 0) + 1; continue; }
        let r;
        try { r = await entregar({ telefone: item.telefone, corpo: item.corpo_inteiro, nome: item.nome, conversaId: item.conversa_id, reenviar: true }, item.id); }
        catch (e) { r = { ok: false, erro: e.message || 'falha', excecao: true }; }
        if (r && r.ok) { trabalho.enviadas++; trabalho.ids_enviados.push(item.id); }
        else if (r && (r.codigo === 'whatsapp_parado' || r.parado)) {
          // devolve para “falhou” comum (não chegou a sair) e para
          await sb.from('whatsapp_mensagens').update({ erro: r.erro || 'WhatsApp parado' }).eq('id', item.id).eq('status', 'falhou');
          trabalho.parou_por = 'whatsapp_parado'; trabalho.motivo_texto = r.erro || null; break;
        } else if (r && (r.semConfirmacao || r.codigo === 'sem_confirmacao')) { trabalho.sem_confirmacao++; }
        else if (r && r.status === 409) { trabalho.puladas++; trabalho.motivos[r.codigo || 'conflito'] = (trabalho.motivos[r.codigo || 'conflito'] || 0) + 1; }
        else { trabalho.falhas++; trabalho.ultimo_erro = r?.erro || null; if (trabalho.falhas >= 3) { trabalho.parou_por = 'muitas_falhas'; break; } }
        if (i < fila.length - 1) await dormir(intervaloMs + Math.round((Math.random() - 0.5) * 2 * jitterMs));
      }
      if (!trabalho.parou_por) trabalho.parou_por = null;
    } catch (e) {
      log('retomada executar:', e.message);
      trabalho.parou_por = 'erro'; trabalho.ultimo_erro = e.message;
    } finally {
      trabalho.atual = null;
      trabalho.terminou_em = agora().toISOString();
      trabalho.concluido = true;
      rodando = false;
      await gravarTrabalho(true);
      await auditar({ perfil: trabalho.por?.id, acao: 'whatsapp.retomada_fim', tabela: 'whatsapp_mensagens', detalhes: { enviadas: trabalho.enviadas, puladas: trabalho.puladas, falhas: trabalho.falhas, sem_confirmacao: trabalho.sem_confirmacao, parou_por: trabalho.parou_por } });
    }
  }

  /**
   * Começa a reenviar com calma. `ids` (opcional) restringe a algumas mensagens do plano; sem ids vai tudo que está em ENVIAR.
   * Devolve { ok, trabalho } ou { ok:false, status, codigo, erro }.
   */
  async function iniciar(opc = {}) {
    if (rodando) return { ok: false, status: 409, codigo: 'ja_rodando', erro: 'Já existe um reenvio em andamento. Espere terminar ou pare.', trabalho: estado().trabalho };
    rodando = true;                       // trava ANTES de qualquer await: dois cliques seguidos não passam os dois
    try {
      const r = await prepararEIniciar(opc);
      if (!r.ok) rodando = false;
      return r;
    } catch (e) { rodando = false; throw e; }
  }
  async function prepararEIniciar({ perfil, ids = null, dias = 7, aguardar = false } = {}) {
    const z = zap?.estado ? zap.estado() : { parado: false };
    if (z.parado) return { ok: false, status: 409, codigo: 'whatsapp_parado', erro: z.texto || 'O WhatsApp ainda está parado.' };
    const plano = await planejar({ dias, papel: perfil?.papel || 'atendente', perfilId: perfil?.id || null });
    let lista = plano.enviar;
    if (Array.isArray(ids)) { const set = new Set(ids.filter((x) => RE_UUID.test(String(x)))); lista = lista.filter((i) => set.has(i.id)); }
    if (!lista.length) return { ok: false, status: 422, codigo: 'nada_para_enviar', erro: 'Não há mensagem pronta para sair agora.', plano: resumoPlano(plano) };
    const cortada = lista.length > maximoPorTrabalho;
    lista = lista.slice(0, maximoPorTrabalho);
    // o corpo inteiro vem do banco (o plano só guarda um recorte para a tela)
    const completos = await ler(sb.from('whatsapp_mensagens').select('id,corpo').in('id', lista.map((i) => i.id)));
    const corpoDe = new Map(completos.map((c) => [c.id, c.corpo]));
    const fila = lista.map((i) => ({ ...i, corpo_inteiro: String(corpoDe.get(i.id) ?? i.corpo).trim() })).filter((i) => i.corpo_inteiro);
    trabalho = { id: 'r7-' + agora().getTime().toString(36), por: perfil ? { id: perfil.id || null, nome: R6.nomeSeguro(perfil.nome) || null } : null, iniciado_em: agora().toISOString(),
      total: fila.length, enviadas: 0, puladas: 0, falhas: 0, sem_confirmacao: 0, motivos: {}, ids_enviados: [], atual: null, parou_por: null, concluido: false,
      pedirParada: false, restantes_no_plano: Math.max(0, plano.enviar.length - fila.length), cortada, intervalo_s: Math.round(intervaloMs / 1000), registro: null };
    await gravarTrabalho(false);
    await auditar({ perfil: perfil?.id, acao: 'whatsapp.retomada_inicio', tabela: 'whatsapp_mensagens', detalhes: { total: fila.length, revisar: plano.revisar.length, pular: plano.pular.length } });
    const corrida = executar(fila);
    if (aguardar) await corrida; else corrida.catch(() => {});
    return { ok: true, trabalho: publico(trabalho) };
  }

  function parar() { if (!trabalho || trabalho.concluido) return { ok: false, status: 409, erro: 'Não há reenvio em andamento.' }; trabalho.pedirParada = true; return { ok: true }; }
  const publico = (t) => t && ({ id: t.id, por: t.por?.nome || null, iniciado_em: t.iniciado_em, terminou_em: t.terminou_em || null, total: t.total, enviadas: t.enviadas,
    puladas: t.puladas, falhas: t.falhas, sem_confirmacao: t.sem_confirmacao, atual: t.atual, parou_por: t.parou_por, motivo_texto: t.motivo_texto || null,
    concluido: !!t.concluido, restantes_no_plano: t.restantes_no_plano, cortada: !!t.cortada, intervalo_s: t.intervalo_s, motivos: t.motivos, ultimo_erro: t.ultimo_erro || null });
  function estado() { return { rodando, trabalho: publico(trabalho) }; }
  const resumoPlano = (p) => ({ total: p.total, enviar: p.enviar.length, revisar: p.revisar.length, pular: p.pular.length });

  return { planejar, iniciar, parar, estado, resumoPlano };
}

module.exports = { criarRetomada, classificar, MOTIVOS, ERRO_RESERVA };
