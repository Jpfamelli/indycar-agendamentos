/* ============================================================
   Origem — de onde veio cada contato (rodada 8, frente T2b).

   Duas partes:
   1. Regras puras: `origemDoContato(lead)` monta o objeto `origem` do contrato da API (§5.1).
      É a ÚNICA fonte desse objeto no app (jornada, campanhas, hoje, porta da IA usam esta função).
      O canal pago vem de atribuicao.canal (regra única do contrato §1.1).
   2. Ajustes › De onde vêm os contatos: frases da primeira mensagem, candidatas, testar mensagem,
      passar a régua no passado, mensagem pronta com código e situação do rastreio do site.

   Princípios (pesquisa 01 e skill de atribuição):
   - "veio de anúncio" com certeza só com identificador (código nosso, referência do anúncio); frase é indício;
   - a origem anda sempre com o "como soubemos" e a força da evidência; evidência fraca nunca rebaixa a forte
     (quem decide a gravação é o banco: trafego_aplicar_origem);
   - identificador de clique (gclid, fbclid, ctwa_clid) ligado a telefone é dado pessoal: não é lido,
     não vai para log e não sai em resposta nenhuma daqui;
   - texto de cliente (mensagem, nome) é dado: nunca vira instrução nem entra em HTML sem escapar.
   ============================================================ */
'use strict';

const A = require('./atribuicao');

const norm = A.normalizar;

/* ---------------- listas e textos de tela (contrato §5.1) ---------------- */

const CANAIS = ['meta', 'google', 'site', 'instagram', 'indicacao', 'passagem', 'telefone', 'whatsapp', 'desconhecida'];
const ROTULO_CANAL = {
  meta: 'Anúncio da Meta', google: 'Anúncio do Google', site: 'Site', instagram: 'Instagram (link da bio)',
  indicacao: 'Indicação', passagem: 'Passou na porta', telefone: 'Telefone', whatsapp: 'WhatsApp direto',
  desconhecida: 'Ainda não sabemos',
};
const ROTULO_ANUNCIO_SEM_PLATAFORMA = 'Anúncio (não sabemos de qual plataforma)';
const rotuloDoCanal = id => ROTULO_CANAL[id] || ROTULO_CANAL.desconhecida;

/* Força da evidência (contrato §1.1): só grava se for mais forte que a atual. */
const FORCA = { ref: 5, referral: 5, formulario: 5, manual: 4, utm: 3, frase: 3, frase_padrao: 2, ia: 1 };
const COMOS = Object.keys(FORCA);

const FONTES_SITE = new Set(['site', 'landing', 'website']);
const FONTES_INSTAGRAM = new Set(['instagram', 'ig']);

/** Texto curto e limpo (sem caractere de controle, espaços simples, cortado). null quando vazio. */
function texto(v, max = 120) {
  if (v == null) return null;
  const s = String(v).replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

const primeiroNome = v => { const t = texto(v, 60); return t ? t.split(' ')[0].slice(0, 30) : null; };

/** Como soubemos (uma das chaves de FORCA) ou null. */
function comoDe(l) {
  const c = norm(l && l.origem_como);
  return Object.prototype.hasOwnProperty.call(FORCA, c) ? c : null;
}

/**
 * Força da evidência de um contato (0 a 5).
 * Com origem_como: a tabela do contrato. Sem origem_como (contato antigo): 4 se a origem do CRM não é
 * whatsapp/orgânico (alguém marcou à mão no passado); 3 se existe endereço gravado (utm_source do site antigo ou
 * de um anúncio) ou a coluna origem_paga já foi preenchida; senão 0.
 */
function forcaDe(l) {
  if (!l) return 0;
  const como = comoDe(l);
  if (como) return FORCA[como];
  const origem = norm(l.origem);
  if (origem && origem !== 'whatsapp' && origem !== 'organico') return 4;
  if (norm(l.utm_source) || typeof l.origem_paga === 'boolean') return 3;
  return 0;
}

/** certa (força 5 e 4) · provavel (3 e 2) · palpite (1) · nenhuma (0). */
function certezaDe(forca) {
  if (forca >= 4) return 'certa';
  if (forca >= 2) return 'provavel';
  if (forca >= 1) return 'palpite';
  return 'nenhuma';
}

/** Canal do contato, um dos CANAIS. Nunca chuta: sem evidência é 'desconhecida'. */
function canalDoContato(l) {
  if (!l) return 'desconhecida';
  const pago = A.canal(l);
  if (pago) return pago;
  if (l.origem_paga === true) return 'desconhecida';          // é anúncio, mas a plataforma não veio: não chuta
  const fonte = norm(l.utm_source), origem = norm(l.origem);
  if (FONTES_INSTAGRAM.has(fonte)) return 'instagram';        // só chega aqui com origem_paga falso (link da bio)
  if (fonte) return 'site';                                   // endereço gravado e não é anúncio: passou pelo site
  if (origem === 'indicacao' || origem === 'passagem' || origem === 'telefone') return origem;
  // WhatsApp ou orgânico: "direto" só quando alguma evidência disse que não é anúncio.
  if (forcaDe(l) > 0 || l.origem_paga === false) return 'whatsapp';
  return 'desconhecida';
}

function pagaDe(l, canal) {
  if (typeof l.origem_paga === 'boolean') return l.origem_paga;
  if (canal === 'meta' || canal === 'google') return true;    // regra antiga
  if (canal === 'desconhecida') return null;
  return false;
}

function comoRotulo(l, como, paga, forca) {
  const r = l.rastreio && typeof l.rastreio === 'object' ? l.rastreio : {};
  if (como === 'ref') return r.permanente === true ? 'pelo código da mensagem pronta' : 'pelo código do site';
  if (como === 'referral') return 'pelo anúncio (WhatsApp)';
  if (como === 'formulario') return 'pelo formulário do site';
  if (como === 'manual') {
    const nome = primeiroNome(l.origem_por_nome || r.marcado_por_nome);
    return nome ? `marcado por ${nome}` : 'marcado à mão';
  }
  if (como === 'utm') return paga === true ? 'pelo endereço do anúncio' : 'pelo endereço de onde veio';
  if (como === 'frase') return 'pela primeira mensagem';
  if (como === 'frase_padrao') return 'pela mensagem padrão de anúncio';
  if (como === 'ia') return 'palpite da IA';
  // contato antigo, sem origem_como
  if (forca >= 4) return 'marcado no CRM';
  if (forca === 3) return paga === true ? 'pelo endereço do anúncio' : 'pelo endereço de onde veio';
  return null;
}

const par = (ext, nome) => {
  const e = texto(ext, 64), n = texto(nome);
  return e || n ? { ext: e, nome: n } : null;
};

/**
 * O objeto `origem` do contrato da API (§5.1), montado a partir da linha de `leads`.
 * Pura. Aceita, opcionais: `lead.rastreio` (jsonb do banco) e `lead.origem_por_nome` (quem marcou à mão).
 */
function origemDoContato(l) {
  const lead = l || {};
  const canal = canalDoContato(lead);
  const paga = pagaDe(lead, canal);
  const como = comoDe(lead);
  const forca = forcaDe(lead);
  const deAnuncio = paga === true;

  // Contato antigo de anúncio: a campanha era o utm_campaign. Fora de anúncio, utm_campaign é o código do site.
  const campanha = par(lead.campanha_ext, lead.campanha_nome || (deAnuncio ? lead.utm_campaign : null));
  const conjunto = par(lead.conjunto_ext, lead.conjunto_nome);
  const anuncio = par(lead.anuncio_ext, lead.anuncio_nome);
  const palavra = texto(lead.palavra_chave) || (canal === 'google' ? texto(lead.utm_term) : null);

  let partes = [campanha, conjunto, anuncio].map(p => p && p.nome).filter(Boolean);
  if (palavra) partes.push(`“${palavra}”`);
  if (!partes.length && canal === 'site') {
    const fonte = norm(lead.utm_source);
    partes = [FONTES_SITE.has(fonte) ? null : texto(lead.utm_source, 40), texto(lead.utm_campaign, 80)].filter(Boolean);
  }

  return {
    canal,
    paga,
    rotulo: canal === 'desconhecida' && deAnuncio ? ROTULO_ANUNCIO_SEM_PLATAFORMA : rotuloDoCanal(canal),
    detalhe: partes.length ? partes.join(' › ').slice(0, 300) : null,
    campanha, conjunto, anuncio,
    palavra_chave: palavra,
    como,
    como_rotulo: comoRotulo(lead, como, paga, forca),
    certeza: certezaDe(forca),
  };
}

/* ---------------- primeira mensagem: código e frase (a mesma régua do banco, para ler muitas de uma vez) ---------------- */

/** Erro que a rota devolve em JSON com o status certo ({ erro, ...extra }). */
const recusar = (status, frase, extra = {}) => Object.assign(new Error(frase), { status, publico: true, extra });

const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RE_CODIGO_REF = /\[ref\s+([a-z0-9]{5})\]/i;        // script portátil e mensagem pronta: "[ref K7M2P]"
const RE_CODIGO_SITE = /--r-([a-z0-9]{5})\)/i;           // site da IndyCar: "(site/cambio--google--r-k7m2p)"

/** O código de rastreio dentro de uma mensagem, em maiúsculas; null se não há. */
function codigoDaMensagem(mensagem) {
  const s = String(mensagem == null ? '' : mensagem).slice(0, 2000);
  const m = RE_CODIGO_REF.exec(s) || RE_CODIGO_SITE.exec(s);
  return m ? m[1].toUpperCase() : null;
}

/** Como o banco normaliza (trafego_normalizar_frase): minúsculas, sem acento, espaços simples, sem pontuação nem emoji no fim. */
function normalizarFrase(mensagem) {
  return String(mensagem == null ? '' : mensagem).slice(0, 2000).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}]+$/u, '').trim();
}

const PESO_DO_TIPO = { exata: 3, comeca: 2, contem: 1 };
/** A frase cadastrada que casa com a mensagem: exata > começa > contém; no empate, a mais comprida. null se nenhuma. */
function fraseDaMensagem(mensagem, frases) {
  const n = normalizarFrase(mensagem);
  if (!n) return null;
  let melhor = null;
  for (const f of frases || []) {
    const alvo = f && typeof f.frase === 'string' ? f.frase : '';
    if (!alvo || f.ativa === false || !PESO_DO_TIPO[f.tipo]) continue;
    const casa = f.tipo === 'exata' ? n === alvo : (f.tipo === 'comeca' ? n.startsWith(alvo) : n.includes(alvo));
    if (!casa) continue;
    if (!melhor || PESO_DO_TIPO[f.tipo] > PESO_DO_TIPO[melhor.tipo] || (PESO_DO_TIPO[f.tipo] === PESO_DO_TIPO[melhor.tipo] && alvo.length > melhor.frase.length)) melhor = f;
  }
  return melhor;
}

/**
 * A primeira mensagem aponta para anúncio? O código de rastreio manda quando a linha dele existe (é identificador);
 * sem código, vale a frase cadastrada (indício). `rastreios` = Map(CODIGO -> { paga, referencia_tipo }).
 */
function mensagemDeAnuncio(mensagem, { frases = [], rastreios = new Map() } = {}) {
  const codigo = codigoDaMensagem(mensagem);
  const linha = codigo ? rastreios.get(codigo) : null;
  if (linha) return linha.paga === true || linha.referencia_tipo === 'anuncio';
  const f = fraseDaMensagem(mensagem, frases);
  return !!f && f.paga === true;
}

/* ---------------- origem marcada por uma pessoa ---------------- */

const CANAIS_MARCAVEIS = CANAIS.filter(c => c !== 'desconhecida');
const semNulos = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

/**
 * O que vai para trafego_aplicar_origem(lead, dados, 'manual') quando alguém marca a origem na tela.
 * Entrada: { canal, campanha_ext?, campanha_nome?, anuncio_ext?, anuncio_nome?, obs? } (corpo da rota).
 * Devolve { canal, dados }. Canal fora da lista ou campo que não é texto: erro 422.
 */
function dadosDaOrigemManual(entrada, quem = null) {
  const e = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {};
  if (!CANAIS_MARCAVEIS.includes(e.canal)) throw recusar(422, 'Escolha de onde veio o contato.', { campo: 'canal', opcoes: CANAIS_MARCAVEIS.map(c => ({ id: c, rotulo: rotuloDoCanal(c) })) });
  for (const k of ['campanha_ext', 'campanha_nome', 'anuncio_ext', 'anuncio_nome', 'obs']) {
    if (e[k] != null && typeof e[k] !== 'string' && typeof e[k] !== 'number') throw recusar(422, 'Esse campo precisa ser um texto.', { campo: k });
  }
  let dados;
  if (e.canal === 'meta' || e.canal === 'google') {
    dados = { paga: true, plataforma: e.canal, origem: e.canal, campanha_ext: texto(e.campanha_ext, 64), campanha_nome: texto(e.campanha_nome),
      anuncio_ext: texto(e.anuncio_ext, 64), anuncio_nome: texto(e.anuncio_nome) };
  } else if (e.canal === 'site') dados = { paga: false, origem: 'organico', utm_source: 'site' };
  else if (e.canal === 'instagram') dados = { paga: false, origem: 'organico', utm_source: 'instagram', utm_medium: 'bio' };
  else dados = { paga: false, origem: e.canal };                 // indicacao, passagem, telefone, whatsapp
  const assinatura = { obs: texto(e.obs, 300), marcado_por: quem && quem.id ? String(quem.id).slice(0, 40) : null, marcado_por_nome: primeiroNome(quem && quem.nome) };
  return { canal: e.canal, dados: semNulos({ ...dados, ...assinatura }) };
}

/* ============================================================
   Ajustes › De onde vêm os contatos (contrato da API §5.5). Banco por injeção (`sb`), como em jornada-db.js.
   Banco ainda sem a migração da rodada 8: leitura devolve `ligado: false` com aviso; escrita recusa com 503
   e `codigo: 'sem_migracao'`. Nada daqui devolve identificador de clique nem põe texto de cliente em log.
   ============================================================ */

const db = require('./db');
const crypto = require('node:crypto');
const QR = require('./rastreio/qr');

const AVISO_SEM_MIGRACAO = 'Esta parte ainda não está ligada: falta aplicar no banco a atualização do Tráfego (rodada 8).';
const semMigracao = () => recusar(503, AVISO_SEM_MIGRACAO, { codigo: 'sem_migracao' });
const CODIGOS_DE_AUSENCIA = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);
const ausente = e => !!e && (CODIGOS_DE_AUSENCIA.has(e.code) || /does not exist|could not find the (function|table|column)|in the schema cache/i.test(String(e.message || '')));
/** Erro do banco numa escrita: sem a migração vira 503 explicado; o resto, frase curta (o detalhe técnico não sai). */
const falhaDoBanco = (e, frase) => (ausente(e) ? semMigracao() : recusar(502, frase));
const ehUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/* ---------------- de canal escolhido na tela para os campos de origem ---------------- */

/** Escolhas da tela para uma frase ou mensagem pronta: os canais marcáveis e mais "anúncio sem plataforma" e "a confirmar". */
const DESTINOS = [...CANAIS_MARCAVEIS, 'anuncio', 'a_confirmar'];
const ROTULO_DESTINO = { ...ROTULO_CANAL, anuncio: ROTULO_ANUNCIO_SEM_PLATAFORMA, a_confirmar: 'A confirmar' };
const opcoesDeDestino = () => DESTINOS.map(id => ({ id, rotulo: ROTULO_DESTINO[id] }));

/** Campos de origem de um canal escolhido (os mesmos da marcação à mão). */
function camposDoDestino(canal) {
  if (canal === 'meta' || canal === 'google') return { paga: true, plataforma: canal, origem: canal };
  if (canal === 'anuncio') return { paga: true, plataforma: null, origem: null };
  if (canal === 'a_confirmar') return { paga: null, plataforma: null, origem: null };
  if (canal === 'site') return { paga: false, plataforma: null, origem: 'organico', utm_source: 'site' };
  if (canal === 'instagram') return { paga: false, plataforma: null, origem: 'organico', utm_source: 'instagram', utm_medium: 'bio' };
  return { paga: false, plataforma: null, origem: canal };            // indicacao, passagem, telefone, whatsapp
}

/**
 * Origem (§5.1) de uma evidência já resolvida pelo banco (trafego_origem_da_mensagem) ou de uma frase cadastrada.
 * Mesma regra de origemDoContato; identificador de clique não passa.
 */
function origemDaEvidencia(ev) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return null;
  const como = ['frase', 'frase_padrao', 'ref', 'utm'].includes(ev.como) ? ev.como : null;
  return origemDoContato({
    origem_paga: typeof ev.paga === 'boolean' ? ev.paga : null,
    origem_plataforma: ev.plataforma === 'meta' || ev.plataforma === 'google' ? ev.plataforma : null,
    origem: typeof ev.origem === 'string' ? ev.origem : null,
    origem_como: como,
    utm_source: ev.utm_source, utm_campaign: ev.utm_campaign, utm_term: ev.utm_term,
    campanha_ext: ev.campanha_ext, campanha_nome: ev.campanha_nome, conjunto_ext: ev.conjunto_ext, conjunto_nome: ev.conjunto_nome,
    anuncio_ext: ev.anuncio_ext, anuncio_nome: ev.anuncio_nome, palavra_chave: ev.palavra_chave,
    rastreio: { permanente: ev.permanente === true },
  });
}

/* ---------------- frases ---------------- */

const COLUNAS_FRASE = 'id, frase, tipo, como, paga, plataforma, origem, utm_source, utm_medium, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome, rotulo, ativa, acertos, ultimo_acerto_em, created_at';
const MINIMO_DO_TIPO = { exata: 2, comeca: 6, contem: 8 };

/** Frase como sai para a tela: os campos da tabela e `vira` (a origem que ela dá, §5.1). */
function frasePublica(f) {
  return {
    id: f.id, frase: f.frase, tipo: f.tipo, como: f.como, ativa: f.ativa !== false,
    paga: typeof f.paga === 'boolean' ? f.paga : null, plataforma: f.plataforma || null,
    campanha_ext: f.campanha_ext || null, campanha_nome: f.campanha_nome || null, anuncio_ext: f.anuncio_ext || null, anuncio_nome: f.anuncio_nome || null,
    rotulo: f.rotulo || null, acertos: Number(f.acertos) || 0, ultimo_acerto_em: f.ultimo_acerto_em || null, criada_em: f.created_at || null,
    vira: origemDaEvidencia({ ...f, como: f.como || 'frase' }),
  };
}

async function listarFrases({ sb = db.sb } = {}) {
  const { data, error } = await sb.from('trafego_frases').select(COLUNAS_FRASE).order('ativa', { ascending: false })
    .order('acertos', { ascending: false }).order('created_at', { ascending: true }).limit(500);
  if (error) {
    if (ausente(error)) return { ligado: false, aviso: AVISO_SEM_MIGRACAO, frases: [], destinos: opcoesDeDestino() };
    throw recusar(502, 'Não foi possível ler as frases agora. Tente de novo.');
  }
  return { ligado: true, frases: (data || []).map(frasePublica), destinos: opcoesDeDestino() };
}

/**
 * Valida o corpo de criar/editar frase. `parcial` (edição): só confere o que veio.
 * Entrada: { frase, tipo?, canal, como?, rotulo?, campanha_ext?, campanha_nome?, anuncio_ext?, anuncio_nome?, ativa? }.
 */
function validarFrase(entrada, { parcial = false } = {}) {
  const e = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {};
  for (const k of ['frase', 'rotulo', 'campanha_ext', 'campanha_nome', 'anuncio_ext', 'anuncio_nome']) {
    if (e[k] != null && typeof e[k] !== 'string' && typeof e[k] !== 'number') throw recusar(422, 'Esse campo precisa ser um texto.', { campo: k });
  }
  const linha = {};
  const tipo = e.tipo == null ? (parcial ? null : 'contem') : e.tipo;
  if (tipo != null) {
    if (!MINIMO_DO_TIPO[tipo]) throw recusar(422, 'Escolha como a frase deve casar: igual, começa com ou contém.', { campo: 'tipo', opcoes: ['exata', 'comeca', 'contem'] });
    linha.tipo = tipo;
  }
  if (e.frase != null || !parcial) {
    const frase = normalizarFrase(e.frase).slice(0, 300).trim();
    const minimo = MINIMO_DO_TIPO[tipo || 'contem'];
    if (frase.length < minimo) throw recusar(422, `Escreva a frase com pelo menos ${minimo} letras.`, { campo: 'frase' });
    linha.frase = frase;
  }
  if (e.canal != null || !parcial) {
    if (!DESTINOS.includes(e.canal)) throw recusar(422, 'Escolha de onde vem quem manda essa frase.', { campo: 'canal', opcoes: opcoesDeDestino() });
    Object.assign(linha, { utm_source: null, utm_medium: null }, camposDoDestino(e.canal));
  }
  if (e.como != null) {
    if (e.como !== 'frase' && e.como !== 'frase_padrao') throw recusar(422, 'Tipo de frase inválido.', { campo: 'como' });
    linha.como = e.como;
  } else if (!parcial) linha.como = 'frase';
  for (const [k, max] of [['rotulo', 120], ['campanha_ext', 64], ['campanha_nome', 120], ['anuncio_ext', 64], ['anuncio_nome', 120]]) {
    if (k in e) linha[k] = texto(e[k], max);
  }
  if ('ativa' in e) {
    if (typeof e.ativa !== 'boolean') throw recusar(422, 'Diga se a frase fica ligada (sim ou não).', { campo: 'ativa' });
    linha.ativa = e.ativa;
  }
  if (parcial && !Object.keys(linha).length) throw recusar(422, 'Nada para mudar.');
  return linha;
}

async function criarFrase(entrada, { quem = null, sb = db.sb } = {}) {
  const linha = validarFrase(entrada);
  if (quem && ehUuid(quem.id)) linha.criada_por = quem.id;
  let r = await sb.from('trafego_frases').insert(linha).select(COLUNAS_FRASE);
  if (r.error && r.error.code === '23503' && linha.criada_por) {            // quem criou não está em perfis: grava sem
    delete linha.criada_por;
    r = await sb.from('trafego_frases').insert(linha).select(COLUNAS_FRASE);
  }
  if (r.error) {
    if (r.error.code === '23505') throw recusar(409, 'Essa frase já está cadastrada.', { campo: 'frase', codigo: 'repetida' });
    throw falhaDoBanco(r.error, 'Não foi possível gravar a frase. Tente de novo.');
  }
  return frasePublica((r.data || [])[0] || linha);
}

async function editarFrase(id, entrada, { sb = db.sb } = {}) {
  if (!ehUuid(id)) throw recusar(404, 'Frase não encontrada.');
  const patch = validarFrase(entrada, { parcial: true });
  if (patch.frase && !patch.tipo) {                                         // o mínimo depende do tipo já gravado
    const atual = await sb.from('trafego_frases').select('tipo').eq('id', id).maybeSingle();
    if (atual.error) throw falhaDoBanco(atual.error, 'Não foi possível ler a frase. Tente de novo.');
    if (!atual.data) throw recusar(404, 'Frase não encontrada.');
    const minimo = MINIMO_DO_TIPO[atual.data.tipo] || 8;
    if (patch.frase.length < minimo) throw recusar(422, `Escreva a frase com pelo menos ${minimo} letras.`, { campo: 'frase' });
  }
  const r = await sb.from('trafego_frases').update(patch).eq('id', id).select(COLUNAS_FRASE);
  if (r.error) {
    if (r.error.code === '23505') throw recusar(409, 'Essa frase já está cadastrada.', { campo: 'frase', codigo: 'repetida' });
    throw falhaDoBanco(r.error, 'Não foi possível gravar a frase. Tente de novo.');
  }
  if (!(r.data || []).length) throw recusar(404, 'Frase não encontrada.');
  return frasePublica(r.data[0]);
}

/** "Apagar" na tela só desliga: a frase sai da régua e os contatos que ela já marcou ficam como estão. */
const desligarFrase = (id, opcoes) => editarFrase(id, { ativa: false }, opcoes);

/* ---------------- candidatas ---------------- */

/** Palpite para uma frase que se repete (indício fraco, só para a pessoa confirmar). Devolve um dos DESTINOS ou null. */
function sugestaoDaFrase(frase) {
  const f = normalizarFrase(frase);
  if (!f) return null;
  if (/\banuncio\b/.test(f)) return /\bgoogle\b/.test(f) ? 'google' : (/\b(instagram|insta|facebook|face)\b/.test(f) ? 'meta' : 'anuncio');
  if (/\blink da bio\b|\b(bio|perfil) do (instagram|insta)\b/.test(f)) return 'instagram';
  if (/\b(site|pagina)\b/.test(f)) return 'site';
  if (/\bindica(cao|ou|do|da)\b/.test(f)) return 'indicacao';
  return null;
}

async function candidatas({ sb = db.sb, minimo = 3, dias = 180 } = {}) {
  const { data, error } = await sb.rpc('trafego_frases_candidatas', { p_min: minimo, p_dias: dias });
  if (error) {
    if (ausente(error)) return { ligado: false, aviso: AVISO_SEM_MIGRACAO, candidatas: [] };
    throw recusar(502, 'Não foi possível ler as mensagens que se repetem agora. Tente de novo.');
  }
  return {
    ligado: true,
    candidatas: (Array.isArray(data) ? data : []).slice(0, 100).map(c => {
      const canal = sugestaoDaFrase(c.frase);
      return {
        frase: texto(c.frase, 300), n: Number(c.n) || 0, exemplo: texto(c.exemplo, 300), ultima_em: c.ultima_em || null,
        sugestao: canal ? { canal, rotulo: ROTULO_DESTINO[canal] } : null,
      };
    }),
  };
}

/* ---------------- testar uma mensagem ---------------- */

async function testarMensagem(mensagem, { sb = db.sb } = {}) {
  if (typeof mensagem !== 'string' || !mensagem.trim()) throw recusar(422, 'Cole a mensagem que o cliente mandou.', { campo: 'mensagem' });
  if (mensagem.length > 2000) throw recusar(422, 'Mensagem comprida demais (até 2.000 letras).', { campo: 'mensagem' });
  const { data, error } = await sb.rpc('trafego_origem_da_mensagem', { p_texto: mensagem });
  if (error) throw falhaDoBanco(error, 'Não foi possível testar agora. Tente de novo.');
  const ev = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  return {
    origem: origemDaEvidencia(ev),
    frase_id: ev && ehUuid(ev.frase_id) ? ev.frase_id : null,
    codigo: ev && typeof ev.codigo === 'string' && /^[A-Z0-9]{5}$/.test(ev.codigo) ? ev.codigo : null,
    rotulo: ev ? texto(ev.rotulo, 120) : null,
  };
}

/* ---------------- passar a régua no passado ---------------- */

const DEZ_MINUTOS = 10 * 60_000;
const simulacoes = new Map();     // id da pessoa -> { desde, em }: a última simulação de cada um

/** "AAAA-MM-DD" válido, não no futuro e não antes de 2024. Devolve { dia, iso } (meia-noite de Brasília). */
function validarDesde(desde, agora = Date.now()) {
  const s = typeof desde === 'string' ? desde.trim().slice(0, 10) : '';
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00-03:00`) : NaN;
  if (!Number.isFinite(t) || new Date(t - 3 * 3600_000).toISOString().slice(0, 10) !== s) throw recusar(422, 'Escolha a data de início (dia, mês e ano).', { campo: 'desde' });
  if (t > agora) throw recusar(422, 'A data de início não pode ser no futuro.', { campo: 'desde' });
  if (s < '2024-01-01') throw recusar(422, 'Escolha uma data a partir de 2024.', { campo: 'desde' });
  return { dia: s, iso: new Date(t).toISOString() };
}

/**
 * Passa a régua de origem nos contatos desde uma data. Sempre simula primeiro: só aplica com `simular: false`
 * e o mesmo `desde` de uma simulação feita há menos de 10 minutos pela mesma pessoa (cada simulação vale uma aplicação).
 */
async function reaplicar({ simular, desde, quem, sb = db.sb, agora = Date.now() } = {}) {
  const chave = quem && quem.id ? String(quem.id) : null;
  if (!chave) throw recusar(403, 'Faça login de novo.');
  const d = validarDesde(desde, agora);
  const aplicar = simular === false;
  if (aplicar) {
    const s = simulacoes.get(chave);
    if (!s || s.desde !== d.dia || agora - s.em > DEZ_MINUTOS || agora < s.em) {
      throw recusar(409, 'Simule primeiro (a simulação vale por 10 minutos e para a mesma data).', { codigo: 'simule_primeiro' });
    }
    simulacoes.delete(chave);
  }
  const { data, error } = await sb.rpc('trafego_reaplicar_origem', { p_desde: d.iso, p_simular: !aplicar });
  if (error) throw falhaDoBanco(error, aplicar ? 'Não foi possível aplicar agora. Nada mudou.' : 'Não foi possível simular agora. Tente de novo.');
  const r = data && typeof data === 'object' ? data : {};
  const saida = {
    simulado: !aplicar, desde: d.dia,
    analisados: Number(r.analisados) || 0, com_mensagem: Number(r.com_mensagem) || 0, com_sinal: Number(r.com_sinal) || 0,
    por_origem: Array.isArray(r.por_origem) ? r.por_origem.slice(0, 50).map(x => ({ rotulo: texto(x.rotulo, 120), n: Number(x.n) || 0 })) : [],
    por_frase: Array.isArray(r.por_frase) ? r.por_frase.slice(0, 50).map(x => ({ frase: texto(x.frase, 300), n: Number(x.n) || 0 })) : [],
  };
  if (aplicar) saida.mudaram = Number(r.mudaram) || 0;
  else {
    saida.mudariam = Number(r.mudariam) || 0;
    simulacoes.set(chave, { desde: d.dia, em: agora });
    saida.aplicar_ate = new Date(agora + DEZ_MINUTOS).toISOString();
  }
  return saida;
}
const esquecerSimulacoes = () => simulacoes.clear();

/* ---------------- mensagem pronta (código permanente) ---------------- */

const TEXTO_PADRAO = 'Olá! Quero saber mais.';

/** Telefone para o wa.me: só dígitos, com 55 na frente. null se não parece telefone do Brasil. */
function telefoneParaLink(tel) {
  let d = String(tel == null ? '' : tel).replace(/\D+/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? d : null;
}

function codigoNovo() {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)];
  return c;
}

/** Valida o corpo de POST /api/origem/link: { rotulo, plataforma?, paga?, campanha_ext?, campanha_nome?, anuncio_nome?, texto? }. */
function validarLink(entrada) {
  const e = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {};
  for (const k of ['rotulo', 'campanha_ext', 'campanha_nome', 'anuncio_nome', 'texto']) {
    if (e[k] != null && typeof e[k] !== 'string' && typeof e[k] !== 'number') throw recusar(422, 'Esse campo precisa ser um texto.', { campo: k });
  }
  const rotulo = texto(e.rotulo, 80);
  if (!rotulo || rotulo.length < 2) throw recusar(422, 'Dê um nome para a mensagem pronta (ex.: "Anúncio troca de óleo", "Bio do Instagram").', { campo: 'rotulo' });
  if (e.plataforma != null && e.plataforma !== 'meta' && e.plataforma !== 'google') throw recusar(422, 'Plataforma inválida (Meta ou Google).', { campo: 'plataforma' });
  if (e.paga != null && typeof e.paga !== 'boolean') throw recusar(422, 'Diga se é anúncio (sim ou não).', { campo: 'paga' });
  const t = texto(e.texto, 200);
  if (t && /\[\s*ref\b/i.test(t)) throw recusar(422, 'Escreva só a mensagem: o código entra sozinho no fim.', { campo: 'texto' });
  const plataforma = e.plataforma || null;
  return {
    rotulo, plataforma, paga: plataforma ? true : (e.paga === true),
    campanha_ext: texto(e.campanha_ext, 64), campanha_nome: texto(e.campanha_nome, 120), anuncio_nome: texto(e.anuncio_nome, 120),
    texto: t || TEXTO_PADRAO,
  };
}

/** Telefone da oficina para o link (empresa.telefone, linha única). null quando não dá para ler. */
async function telefoneDaOficina({ sb = db.sb } = {}) {
  try {
    const { data, error } = await sb.from('empresa').select('telefone').eq('id', true).maybeSingle();
    return error || !data ? null : telefoneParaLink(data.telefone);
  } catch { return null; }
}

/**
 * Cria a mensagem pronta: linha permanente em trafego_rastreio (contrato de rastreio §6.6) com um código novo, e devolve
 * { frase, texto, link_whatsapp, qr_svg }. `frase` descreve a mensagem pronta (código, nome e a origem que ela dá).
 * Não cadastra texto livre em trafego_frases: o código já é o identificador (certeza máxima), e um "Olá! Quero saber mais."
 * cadastrado como frase marcaria como anúncio quem nunca viu o anúncio.
 */
async function criarLink(entrada, { quem = null, sb = db.sb } = {}) {
  const v = validarLink(entrada);
  const linha = {
    evento: 'link', permanente: true, rotulo: v.rotulo, plataforma: v.plataforma, paga: v.paga,
    campanha_ext: v.campanha_ext, campanha_nome: v.campanha_nome, anuncio_nome: v.anuncio_nome,
    ...(quem && ehUuid(quem.id) ? { criado_por: quem.id } : {}),
  };
  let gravada = null, erro = null;
  for (let tentativa = 0; tentativa < 6 && !gravada; tentativa++) {
    const r = await sb.from('trafego_rastreio').insert({ ...linha, codigo: codigoNovo() }).select('codigo, criado_em');
    if (!r.error) { gravada = (r.data || [])[0] || null; break; }
    erro = r.error;
    if (r.error.code === '23503' && linha.criado_por) { delete linha.criado_por; continue; }
    if (r.error.code !== '23505') break;                                   // 23505 = código repetido: sorteia outro
  }
  if (!gravada) throw falhaDoBanco(erro, 'Não foi possível criar a mensagem pronta. Tente de novo.');
  const codigo = String(gravada.codigo).toUpperCase();
  const textoFinal = `${v.texto} [ref ${codigo}]`;
  const telefone = await telefoneDaOficina({ sb });
  const link = telefone ? `https://wa.me/${telefone}?text=${encodeURIComponent(textoFinal)}` : null;
  let qr = null;
  try { qr = link ? QR.svg(link, { nivel: 'M' }) : null; } catch { qr = null; }
  const destino = v.plataforma || (v.paga ? 'anuncio' : 'a_confirmar');
  return {
    frase: {
      codigo, rotulo: v.rotulo, criada_em: gravada.criado_em || null,
      origem: origemDaEvidencia({ ...camposDoDestino(destino), como: 'ref', permanente: true,
        campanha_ext: v.campanha_ext, campanha_nome: v.campanha_nome, anuncio_nome: v.anuncio_nome }),
    },
    texto: textoFinal,
    link_whatsapp: link,
    qr_svg: qr,
    ...(telefone ? {} : { aviso: 'Falta o telefone da oficina no cadastro da empresa. Copie o texto e cole no anúncio.' }),
  };
}

/* ---------------- situação do rastreio do site ---------------- */

/**
 * Para a tela: o site está mandando visitas? quando foi o último clique no WhatsApp? de quais páginas?
 * `script` é a linha para colar no site de fora (vem da rota, que sabe o endereço público do app).
 */
async function situacaoDoRastreio({ sb = db.sb, script = null, agora = Date.now() } = {}) {
  const desde30 = new Date(agora - 30 * 86400_000).toISOString(), t7 = agora - 7 * 86400_000;
  const base = { script, instalado_no_site: false, ultima_visita: null, ultimo_clique: null, cliques_7d: 0, visitas_7d: 0, por_pagina: [] };
  const r = await sb.from('trafego_rastreio').select('evento, pagina, criado_em, atualizado_em').eq('permanente', false)
    .gte('criado_em', desde30).order('criado_em', { ascending: false }).limit(5000);
  if (r.error) {
    if (ausente(r.error)) return { ligado: false, aviso: AVISO_SEM_MIGRACAO, ...base, cliques_7d: null, visitas_7d: null };
    throw recusar(502, 'Não foi possível ler o rastreio do site agora. Tente de novo.');
  }
  const linhas = r.data || [];
  const paginas = new Map();
  let ultimoClique = null, cliques = 0, visitas = 0;
  for (const l of linhas) {
    const recente = Date.parse(l.criado_em) >= t7;
    if (l.evento === 'clique') {
      const em = l.atualizado_em || l.criado_em;
      if (!ultimoClique || Date.parse(em) > Date.parse(ultimoClique)) ultimoClique = em;
      if (recente) cliques++;
    }
    if (recente) {
      visitas++;
      const p = texto(l.pagina, 120) || '/';
      const conta = paginas.get(p) || { n: 0, cliques: 0 };
      conta.n++;
      if (l.evento === 'clique') conta.cliques++;
      paginas.set(p, conta);
    }
  }
  return {
    ligado: true, ...base,
    instalado_no_site: linhas.length > 0,
    ultima_visita: linhas[0] ? linhas[0].criado_em : null,
    ultimo_clique: ultimoClique, cliques_7d: cliques, visitas_7d: visitas,
    // Por página, nos mesmos 7 dias: n = visitas (cada visitante conta uma vez), cliques = quantos deles tocaram no WhatsApp.
    por_pagina: [...paginas].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(([pagina, c]) => ({ pagina, n: c.n, cliques: c.cliques })),
  };
}

module.exports = {
  CANAIS, ROTULO_CANAL, ROTULO_ANUNCIO_SEM_PLATAFORMA, rotuloDoCanal, FORCA, COMOS, CANAIS_MARCAVEIS, ALFABETO_CODIGO,
  texto, comoDe, forcaDe, certezaDe, canalDoContato, origemDoContato,
  codigoDaMensagem, normalizarFrase, fraseDaMensagem, mensagemDeAnuncio, dadosDaOrigemManual, recusar,
  // Ajustes › De onde vêm os contatos
  AVISO_SEM_MIGRACAO, DESTINOS, DEZ_MINUTOS, camposDoDestino, origemDaEvidencia,
  validarFrase, listarFrases, criarFrase, editarFrase, desligarFrase, sugestaoDaFrase, candidatas, testarMensagem,
  validarDesde, reaplicar, esquecerSimulacoes, telefoneParaLink, validarLink, telefoneDaOficina, criarLink, situacaoDoRastreio,
};
