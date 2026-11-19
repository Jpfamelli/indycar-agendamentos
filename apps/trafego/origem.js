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

module.exports = {
  CANAIS, ROTULO_CANAL, ROTULO_ANUNCIO_SEM_PLATAFORMA, rotuloDoCanal, FORCA, COMOS, CANAIS_MARCAVEIS, ALFABETO_CODIGO,
  texto, comoDe, forcaDe, certezaDe, canalDoContato, origemDoContato,
  codigoDaMensagem, normalizarFrase, fraseDaMensagem, mensagemDeAnuncio, dadosDaOrigemManual, recusar,
};
