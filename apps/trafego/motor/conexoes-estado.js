/* ============================================================
   Estado das conexões (rodada 8, frente T2a): o bloco `conexoes` de
   /api/hoje e de /api/conexoes (contrato da API, §5.2 e §5.5).

     meta, google  { ligado, situacao: nunca_ligou | ok | erro | token_vencendo, ultima_coleta, aviso } + { parada }
     site          { rastreio, ultimo_clique, cliques_7d }
     whatsapp      { ligado, situacao: ok | chave_recusada | sem_aparelho | sem_noticia, desde, aviso }   (campo a mais)

   Tudo aqui é puro e recebe o dado JÁ sem segredo: quem lê o banco (motor/fonte.js) troca
   chave e token por sim/não antes de chamar. Nenhum texto técnico da plataforma vai para a tela.

   Por que o WhatsApp tem "desde" vindo de fora: codewords_config.sincronia_erro_em é regravado a
   CADA tentativa que falha (apps/atendimento/server.js, registrarSaudeDaSincronia), então ele diz
   quando foi a última falha, não quando começou. O começo é a última mensagem da oficina que o
   sistema viu sair (whatsapp_mensagens); sem ela, o aviso sai sem data.
   ============================================================ */
'use strict';

const P = require('./periodo');
const enderecos = require('../enderecos');

const HORA = 3600000;
/** A coleta roda todo dia: mais de um dia e meio sem coletar é coleta parada. */
const COLETA_PARADA_H = 36;
/** Avisa do acesso vencendo com uma semana de antecedência. */
const DIAS_AVISO_VENCIMENTO = 7;
/** Fim de semana fechado dá até 39 h sem mensagem: só é "sem notícia" depois de 3 dias. */
const SEM_NOTICIA_H = 72;

const NOMES = Object.freeze({
  meta: { a: 'A Meta', da: 'da Meta', ir: 'ajustes?secao=conexoes' },
  google: { a: 'O Google', da: 'do Google', ir: 'ajustes?secao=conexoes' },
});
const nomeDe = canal => NOMES[canal] || { a: 'A plataforma', da: 'da plataforma', ir: 'ajustes?secao=conexoes' };

const instante = iso => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? t : null; };

/* ---------- Meta e Google ---------- */

/* O erro cru da plataforma -> a frase da tela. A ordem importa: o primeiro que casar vence. */
const ERROS = [
  [/requires ads_read|ads_read permission|permiss|permission|c[oó]digo (10|200|294)\b/i,
    n => `${n.a} recusou o acesso: falta permissão para ler os anúncios. Refaça a ligação em Ajustes.`],
  [/c[oó]digo 190|malformed access token|invalid oauth|session has expired|error validating access token|invalid_grant|expired or revoked|invalid_client|unauthorized_client/i,
    n => `${n.a} recusou o acesso: a autorização venceu ou é inválida. Refaça a ligação em Ajustes.`],
  [/customer_not_enabled|not[ _]found|does not exist|invalid customer id|c[oó]digo 100\b/i,
    n => `A conta de anúncios ${n.da} não foi encontrada. Confira a conta em Ajustes.`],
  [/rate limit|too many|timeout|aborted|fetch failed|enotfound|econnreset|c[oó]digo (4|17|32|613)\b/i,
    n => `${n.a} não respondeu na última coleta. O sistema tenta de novo sozinho.`],
];
function avisoDoErro(canal, status) {
  const n = nomeDe(canal), texto = String(status || '');
  for (const [re, frase] of ERROS) if (re.test(texto)) return frase(n);
  return `A última coleta ${n.da} deu erro. Confira a ligação em Ajustes.`;
}

/**
 * Situação de uma plataforma de anúncio. `linha` = { canal, ativo, tem_token, ultimo_sync_em, ultimo_sync_status, token_expira_em }
 * (sem segredo). `parada` (campo a mais) = a coleta não está acontecendo.
 */
function situacaoDaPlataforma(canal, linha, { agora = Date.now() } = {}) {
  if (!linha || linha.ativo === false || !linha.tem_token) {
    return { ligado: false, situacao: 'nunca_ligou', ultima_coleta: null, aviso: null, parada: false };
  }
  const n = nomeDe(canal);
  const vence = instante(linha.token_expira_em);
  if (vence != null && vence <= agora) {
    return { ligado: false, situacao: 'erro', ultima_coleta: null, parada: true,
      aviso: `O acesso ${n.da} venceu em ${P.ddmm(P.diaBR(linha.token_expira_em))}. Refaça a ligação em Ajustes.` };
  }
  if (/^erro/i.test(String(linha.ultimo_sync_status || ''))) {
    return { ligado: false, situacao: 'erro', ultima_coleta: null, parada: true, aviso: avisoDoErro(canal, linha.ultimo_sync_status) };
  }
  const ultima = instante(linha.ultimo_sync_em) != null ? linha.ultimo_sync_em : null;
  if (vence != null) {
    const dias = P.contarDias(P.hojeBR(agora), P.diaBR(linha.token_expira_em)) - 1;
    if (dias <= DIAS_AVISO_VENCIMENTO) {
      const quando = dias <= 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`;
      return { ligado: true, situacao: 'token_vencendo', ultima_coleta: ultima, parada: false,
        aviso: `O acesso ${n.da} ${quando} (${P.ddmm(P.diaBR(linha.token_expira_em))}). Renove antes para a coleta não parar.` };
    }
  }
  if (!ultima) return { ligado: true, situacao: 'ok', ultima_coleta: null, aviso: 'Ligada. A primeira coleta ainda não rodou.', parada: false };
  if (agora - instante(ultima) > COLETA_PARADA_H * HORA) {
    return { ligado: true, situacao: 'ok', ultima_coleta: ultima, parada: true,
      aviso: `A última coleta ${n.da} foi em ${P.ddmm(P.diaBR(ultima))}. Ela deveria rodar todo dia.` };
  }
  return { ligado: true, situacao: 'ok', ultima_coleta: ultima, aviso: null, parada: false };
}

/* ---------- site ---------- */

/** `r` = { existe, cliques_7d, ultimo_clique }. Tabela que ainda não existe: rastreio desligado e cliques "não sei" (null). */
function situacaoDoSite(r) {
  if (!r || !r.existe) return { rastreio: false, ultimo_clique: null, cliques_7d: null };
  const ultimo = instante(r.ultimo_clique) != null ? r.ultimo_clique : null;
  return { rastreio: !!ultimo, ultimo_clique: ultimo, cliques_7d: Number.isFinite(+r.cliques_7d) ? +r.cliques_7d : 0 };
}

/* ---------- WhatsApp da oficina ---------- */

const CHAVE_RECUSADA = /\b401\b|unauthori[sz]ed|recusad/i;

/**
 * Situação do WhatsApp automático. `cfg` = linha de codewords_config SEM a chave
 * (ativo, device_id, ultimo_evento_em, sincronia_erro, sincronia_falhas).
 * `ultimaSaida` = instante da última mensagem da oficina que o sistema viu sair.
 */
function situacaoDoWhatsapp(cfg, { agora = Date.now(), ultimaSaida = null, indisponivel = false } = {}) {
  if (indisponivel) return { ligado: false, situacao: 'sem_noticia', desde: null, aviso: 'Não deu para ler a situação do WhatsApp agora.' };
  if (!cfg || cfg.ativo === false || !String(cfg.device_id || '').trim()) {
    return { ligado: false, situacao: 'sem_aparelho', desde: null, aviso: 'O WhatsApp da oficina ainda não está ligado ao sistema.' };
  }
  const erro = String(cfg.sincronia_erro || '').trim();
  if (erro && CHAVE_RECUSADA.test(erro)) {
    const t = instante(ultimaSaida);
    const desde = t != null && t <= agora ? P.diaBR(ultimaSaida) : null;
    return { ligado: false, situacao: 'chave_recusada', desde,
      aviso: `A chave do WhatsApp foi recusada. Lembretes e respostas não estão saindo${desde ? ` desde ${P.ddmm(desde)}` : ''}. Só o dono da conta consegue gerar a chave nova.` };
  }
  if (erro) {
    return { ligado: false, situacao: 'sem_noticia', desde: null,
      aviso: 'O sistema não está conseguindo ler as conversas do WhatsApp. Confira a ligação em Atendimento.' };
  }
  const evento = instante(cfg.ultimo_evento_em);
  if (evento == null || agora - evento > SEM_NOTICIA_H * HORA) {
    const desde = evento != null ? P.diaBR(cfg.ultimo_evento_em) : null;
    return { ligado: false, situacao: 'sem_noticia', desde,
      aviso: `Nenhuma mensagem chega pelo WhatsApp${desde ? ` desde ${P.ddmm(desde)}` : ''}. Confira se o aparelho está ligado e com internet.` };
  }
  return { ligado: true, situacao: 'ok', desde: null, aviso: null };
}

/* ---------- tudo junto ---------- */

/**
 * O objeto `conexoes` do contrato. Entradas já sem segredo:
 *   integracoes [{ canal, ativo, tem_token, ultimo_sync_em, ultimo_sync_status, token_expira_em }]
 *   rastreio    { existe, cliques_7d, ultimo_clique }
 *   codewords   linha de codewords_config sem a chave (ou null); codewordsIndisponivel = a leitura falhou
 *   ultimaSaida instante da última mensagem da oficina que saiu
 */
function montarConexoes({ integracoes = [], rastreio = null, codewords = null, codewordsIndisponivel = false, ultimaSaida = null, agora = Date.now() } = {}) {
  const de = canal => (integracoes || []).find(i => i && i.canal === canal) || null;
  return {
    meta: situacaoDaPlataforma('meta', de('meta'), { agora }),
    google: situacaoDaPlataforma('google', de('google'), { agora }),
    site: situacaoDoSite(rastreio),
    whatsapp: situacaoDoWhatsapp(codewords, { agora, ultimaSaida, indisponivel: codewordsIndisponivel }),
  };
}

/**
 * Os passos para deixar tudo ligado, na ordem em que valem a pena: [{ feito, titulo, como, acao: { rotulo, ir } }].
 * `acao.ir` sem barra no começo é tela daqui; com barra é outro app da Central.
 */
function passosDeConexao(conexoes, { orcamento = null } = {}) {
  const c = conexoes || {};
  const atendimento = enderecos.caminhoNaCentral('atendimento', { aba: 'integracoes' });
  return [
    { feito: !!(c.whatsapp && c.whatsapp.situacao === 'ok'), titulo: 'WhatsApp da oficina ligado',
      como: 'No Atendimento, em Configurações e depois Integrações: gere uma chave nova no CodeWords e cole lá. Só o dono da conta consegue.',
      acao: { rotulo: 'Abrir o Atendimento', ir: atendimento } },
    { feito: !!(c.site && c.site.rastreio), titulo: 'Site avisando de onde vem cada contato',
      como: 'O botão de WhatsApp do site manda um código junto com a mensagem. Este passo fica pronto no primeiro clique.',
      acao: { rotulo: 'Ver de onde vêm os contatos', ir: 'ajustes?secao=origem' } },
    { feito: !!(c.meta && c.meta.ligado), titulo: 'Conta de anúncios da Meta ligada',
      como: 'Em Ajustes, na parte de Conexões: entre com a conta da Meta e escolha a conta de anúncios da oficina.',
      acao: { rotulo: 'Ligar a Meta', ir: NOMES.meta.ir } },
    { feito: !!(c.google && c.google.ligado), titulo: 'Conta do Google Ads ligada',
      como: 'Em Ajustes, na parte de Conexões: entre com a conta do Google e escolha a conta de anúncios da oficina.',
      acao: { rotulo: 'Ligar o Google', ir: NOMES.google.ir } },
    { feito: Number(orcamento) > 0, titulo: 'Orçamento do mês definido',
      como: 'Em Ajustes: diga quanto pretende investir por mês. Com isso a tela mostra se o gasto está no ritmo.',
      acao: { rotulo: 'Definir o orçamento', ir: 'ajustes?secao=metas' } },
  ];
}

module.exports = {
  COLETA_PARADA_H, DIAS_AVISO_VENCIMENTO, SEM_NOTICIA_H,
  situacaoDaPlataforma, situacaoDoSite, situacaoDoWhatsapp, montarConexoes, passosDeConexao, avisoDoErro,
};
