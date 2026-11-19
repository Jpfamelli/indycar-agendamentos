/* ============================================================
   Fonte de dados das rotas novas (rodada 8, frente T2a).

   Um lugar só para ler o que /api/hoje, /api/campanhas, /api/relatorios e
   /api/conexoes precisam, com três cuidados:

   1. Nada de consulta por contato. Cada leitura é UMA consulta por tabela
      (métricas em páginas de 1.000 linhas, que é o teto do banco por pedido).
   2. Memória curta: 30 segundos por leitura e por período. Dois pedidos ao
      mesmo tempo dividem a mesma ida ao banco; leitura que falha não fica guardada.
   3. Segredo não sai daqui: chave e token viram sim/não antes de qualquer
      outro arquivo ver a linha; a chave do CodeWords nem é pedida ao banco.

   O que é essencial (métricas, contatos) estoura erro se falhar: a rota responde 500 e a tela oferece
   tentar de novo. O resto (alertas, agenda, conexões, rastreio, metas) é tolerante: devolve o "não sei"
   e marca a leitura em `falhas()`, para a resposta sair com estado.incompleto.

   Os contatos vêm de jornada.listarBruto({ de, ate, sb }) (frente T2b). Se ./jornada ainda não
   existe, ou se ela falhar, entra a reserva (motor/reserva-jornada.js), sem derrubar a rota.
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');
const C = require('./conexoes-estado');
const Ag = require('./agenda-oficina');
const Registro = require('../registro');

const TTL_MS = 30_000;
const PAGINA = 1000;
const MAX_PAGINAS = 30;
const DIAS_DE_ALERTA = 7;
const NUMERICAS = ['gasto', 'conversoes', 'valor_conversao', 'impressoes', 'alcance', 'cliques'];

const tabelaAusente = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .* does not exist/i.test(String(e.message || '')));
const tem = v => !!(v && String(v).trim());

class FalhaDeLeitura extends Error {
  constructor(fonte, erro) {
    super(`não foi possível ler ${fonte}`);
    this.name = 'FalhaDeLeitura';
    this.fonte = fonte;
    this.detalhe = Registro.limpar(erro && erro.message ? erro.message : erro);
    this.codigo = (erro && erro.code) || null;
  }
}

function normalizarMetrica(l) {
  const o = { ...l, data: String(l.data ?? '').slice(0, 10) };
  for (const c of NUMERICAS) o[c] = T.numOuNulo(l[c]) || 0;
  o.frequencia = T.numOuNulo(l.frequencia);
  if ('conversas' in l) o.conversas = T.numOuNulo(l.conversas);
  return o;
}

/** A linha de integracoes_ads sem segredo nenhum: só sim/não e datas. */
function semSegredo(i) {
  return {
    canal: i.canal,
    ativo: i.ativo !== false,
    tem_token: i.canal === 'meta' ? tem(i.meta_access_token) : tem(i.google_refresh_token) && tem(i.google_developer_token),
    ultimo_sync_em: i.ultimo_sync_em || null,
    ultimo_sync_status: i.ultimo_sync_status ? String(i.ultimo_sync_status).slice(0, 300) : null,
    token_expira_em: i.canal === 'meta' ? (i.meta_token_expira_em || null) : null,
  };
}

/**
 * Acha o módulo da jornada (frente T2b). null enquanto ele não existe.
 * Se o arquivo existe mas não carrega (erro dentro dele), também devolve null e deixa um aviso no log:
 * as rotas seguem pela reserva em vez de cair.
 */
function jornadaDoApp() {
  try {
    const j = require('../jornada');
    return j && typeof j.listarBruto === 'function' ? j : null;
  } catch (e) {
    const primeiraLinha = String((e && e.message) || '').split('\n')[0];
    const aindaNaoExiste = e && e.code === 'MODULE_NOT_FOUND' && /['"][.][.][/]jornada['"]/.test(primeiraLinha);
    if (!aindaNaoExiste) Registro.evento('warn', 'jornada_nao_carregou', { erro: Registro.limpar(primeiraLinha), tipo: (e && e.name) || null });
    return null;
  }
}

/**
 * Cria uma fonte. Opções (todas para teste; o padrão é o banco do app e o relógio de verdade):
 *   sb       cliente do Supabase            jornada  módulo com listarBruto({ de, ate, sb })
 *   agora    função que devolve o instante  ttl      milissegundos de memória
 */
function criarFonte(opcoes = {}) {
  const cfg = { sb: null, agora: Date.now, jornada: undefined, ttl: TTL_MS, ...opcoes };
  const memoria = new Map();
  const falhasVistas = new Map();     // leitura tolerante que falhou -> { em, erro }

  const banco = () => cfg.sb || require('../db').sb;
  const instante = () => cfg.agora();
  const hoje = () => P.hojeBR(instante());

  function lembrar(chave, carregar, { fresco = false } = {}) {
    const t = instante(), guardado = memoria.get(chave);
    if (guardado && !fresco && t - guardado.em < cfg.ttl) return guardado.promessa;
    const entrada = { em: t, promessa: null };
    entrada.promessa = Promise.resolve().then(carregar);
    memoria.set(chave, entrada);
    entrada.promessa.catch(() => { if (memoria.get(chave) === entrada) memoria.delete(chave); });
    if (memoria.size > 300) for (const [k, v] of memoria) if (t - v.em >= cfg.ttl) memoria.delete(k);
    return entrada.promessa;
  }

  /** Leitura que não derruba a rota: em caso de erro devolve `neutro` e anota a falha. */
  async function tolerante(nome, neutro, ler) {
    try {
      const valor = await ler();
      falhasVistas.delete(nome);
      return valor;
    } catch (e) {
      const erro = e instanceof FalhaDeLeitura ? e.detalhe : Registro.limpar(e && e.message);
      falhasVistas.set(nome, { em: instante(), erro });
      Registro.evento('warn', 'leitura_falhou', { fonte: nome, erro, codigo: (e && (e.codigo || e.code)) || null });
      return neutro;
    }
  }

  /* ---------- métricas (essencial) ---------- */

  /** Linhas de ads_metricas_dia do período, nos níveis pedidos, em páginas de 1.000. */
  function metricas({ de, ate, niveis = ['campanha'], plataforma = null, campanha = null } = {}, o = {}) {
    const chave = `metricas|${de}|${ate}|${niveis.join(',')}|${plataforma || ''}|${campanha || ''}`;
    return lembrar(chave, async () => {
      const linhas = [];
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        let q = banco().from('ads_metricas_dia').select('*').gte('data', de).lte('data', ate).in('nivel', niveis);
        if (plataforma) q = q.eq('plataforma', plataforma);
        if (campanha) q = q.eq('campanha_ext', campanha);
        const { data, error } = await q.order('data', { ascending: true }).order('id', { ascending: true }).range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
        if (error) throw new FalhaDeLeitura('as métricas dos anúncios', error);
        for (const l of data || []) linhas.push(normalizarMetrica(l));
        if ((data || []).length < PAGINA) break;
      }
      return linhas;
    }, o);
  }

  /** Existe alguma linha real (que não é demonstração) na tabela inteira? */
  function haReal(o = {}) {
    return lembrar('ha_real', async () => {
      const { count, error } = await banco().from('ads_metricas_dia').select('id', { count: 'exact', head: true }).or('fonte.is.null,fonte.neq.demo');
      if (error) throw new FalhaDeLeitura('as métricas dos anúncios', error);
      return (count || 0) > 0;
    }, o);
  }

  /* ---------- contatos (essencial, com reserva) ---------- */

  /**
   * Itens da jornada que chegaram entre `de` e `ate`. Devolve { itens, reserva, estado }:
   *   reserva = veio do caminho antigo (sem agenda, orçamento, pátio nem resposta);
   *   estado  = o que a jornada sabe do período (respostas: ok | sem_registro | indisponivel, e o texto pronto), ou null.
   */
  function contatos({ de, ate } = {}, o = {}) {
    return lembrar(`contatos|${de}|${ate}`, async () => {
      const sb = banco();
      const jornada = cfg.jornada === undefined ? jornadaDoApp() : cfg.jornada;
      if (jornada) {
        try {
          const itens = await jornada.listarBruto({ de, ate, sb, agora: instante(), fresco: !!o.fresco });
          if (!Array.isArray(itens)) throw new Error('a jornada não devolveu uma lista');
          falhasVistas.delete('jornada');
          return { itens, reserva: false, estado: itens.estado && typeof itens.estado === 'object' ? { ...itens.estado } : null };
        } catch (e) {
          const erro = Registro.limpar(e && e.message);
          falhasVistas.set('jornada', { em: instante(), erro });
          Registro.evento('warn', 'jornada_falhou', { erro, de, ate });
        }
      }
      try {
        const itens = await require('./reserva-jornada').listarBruto({ de, ate, sb, agora: instante() });
        return { itens, reserva: true, estado: null };
      } catch (e) {
        throw new FalhaDeLeitura('os contatos', e);
      }
    }, o);
  }

  /* ---------- o resto (tolerante) ---------- */

  /** Metas do ads_config: { cpa_alvo, cpa_alvo_google, orcamento_mensal, ticket_medio }; null no que não está definido. */
  function config(o = {}) {
    return lembrar('config', () => tolerante('metas', {}, async () => {
      const { data, error } = await banco().from('ads_config').select('*').eq('id', true).maybeSingle();
      if (error) throw new FalhaDeLeitura('as metas', error);
      const c = data || {};
      const extras = c.extras && typeof c.extras === 'object' ? c.extras : {};
      return {
        cpa_alvo: T.numOuNulo(c.cpa_alvo), cpa_alvo_google: T.numOuNulo(extras.cpa_alvo_google),
        orcamento_mensal: T.numOuNulo(c.orcamento_mensal), ticket_medio: T.numOuNulo(c.ticket_medio),
      };
    }), o);
  }

  /** Alertas do radar ainda não lidos e recentes (7 dias): alerta velho sem leitura não é "o que fazer agora". */
  function alertas(o = {}) {
    return lembrar('alertas', () => tolerante('alertas', [], async () => {
      const desde = new Date(instante() - DIAS_DE_ALERTA * 86400000).toISOString();
      const { data, error } = await banco().from('ads_alertas')
        .select('id, regra_nome, plataforma, nivel, entidade_ext, entidade_nome, metrica, severidade, mensagem, chave, criado_em')
        .is('lido_em', null).gte('criado_em', desde).order('criado_em', { ascending: false }).limit(30);
      if (error) throw new FalhaDeLeitura('os alertas', error);
      return data || [];
    }), o);
  }

  /** Cliques do site nos últimos 7 dias e o último clique: { existe, cliques_7d, ultimo_clique }. */
  function rastreio(o = {}) {
    return lembrar('rastreio', () => tolerante('rastreio', { existe: false }, async () => {
      const sb = banco(), desde = new Date(instante() - 7 * 86400000).toISOString();
      const [semana, ultimo] = await Promise.all([
        sb.from('trafego_rastreio').select('id', { count: 'exact', head: true }).eq('evento', 'clique').gte('criado_em', desde),
        sb.from('trafego_rastreio').select('criado_em').eq('evento', 'clique').order('criado_em', { ascending: false }).limit(1),
      ]);
      if (tabelaAusente(semana.error) || tabelaAusente(ultimo.error)) return { existe: false };
      if (semana.error || ultimo.error) throw new FalhaDeLeitura('o rastreio do site', semana.error || ultimo.error);
      return { existe: true, cliques_7d: semana.count || 0, ultimo_clique: (ultimo.data && ultimo.data[0] && ultimo.data[0].criado_em) || null };
    }), o);
  }

  /**
   * Palavras-chave e termos de busca de uma campanha no período (ads_termos_dia, que a coleta do Google preenche).
   * Devolve { existe, linhas }; tabela que ainda não existe ou leitura que falha: { existe: false, linhas: [] }.
   */
  function termos({ de, ate, plataforma = null, campanha = null } = {}, o = {}) {
    return lembrar(`termos|${de}|${ate}|${plataforma || ''}|${campanha || ''}`, () => tolerante('termos', { existe: false, linhas: [] }, async () => {
      const linhas = [];
      for (let pagina = 0; pagina < 5; pagina++) {
        let q = banco().from('ads_termos_dia').select('data, plataforma, campanha_ext, conjunto_ext, conjunto_nome, palavra_chave, correspondencia, termo, impressoes, cliques, gasto, conversoes, fonte')
          .gte('data', de).lte('data', ate);
        if (plataforma) q = q.eq('plataforma', plataforma);
        if (campanha) q = q.eq('campanha_ext', campanha);
        const { data, error } = await q.order('data', { ascending: true }).range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
        if (tabelaAusente(error)) return { existe: false, linhas: [] };
        if (error) throw new FalhaDeLeitura('as palavras-chave', error);
        for (const l of data || []) linhas.push(l);
        if ((data || []).length < PAGINA) break;
      }
      return { existe: true, linhas };
    }), o);
  }

  /** O objeto `conexoes` do contrato (Meta, Google, site e WhatsApp), já sem segredo. */
  function conexoes(o = {}) {
    return lembrar('conexoes', async () => {
      const sb = banco();
      const [integracoes, codewords, site] = await Promise.all([
        tolerante('conexoes', [], async () => {
          const { data, error } = await sb.from('integracoes_ads').select('*');
          if (error) throw new FalhaDeLeitura('as contas de anúncio', error);
          return (data || []).map(semSegredo);
        }),
        tolerante('whatsapp', { indisponivel: true }, async () => {
          // a chave (api_key) fica de fora de propósito: este app nunca a lê
          const { data, error } = await sb.from('codewords_config')
            .select('ativo, device_id, ultimo_evento_em, sincronia_erro, sincronia_erro_em, sincronia_falhas').eq('id', true).maybeSingle();
          if (tabelaAusente(error)) return { linha: null };
          if (error) throw new FalhaDeLeitura('a situação do WhatsApp', error);
          return { linha: data || null };
        }),
        rastreio(o),
      ]);
      let whatsapp = C.situacaoDoWhatsapp(codewords.linha, { agora: instante(), indisponivel: !!codewords.indisponivel });
      if (whatsapp.situacao === 'chave_recusada') {
        // desde quando: a última mensagem da oficina que o sistema viu sair (o erro gravado é regravado a cada tentativa)
        const ultimaSaida = await tolerante('whatsapp_desde', null, async () => {
          const { data, error } = await sb.from('whatsapp_mensagens').select('created_at')
            .eq('direcao', 'saida').eq('status', 'enviado').not('gerada_por_ia', 'is', true).order('created_at', { ascending: false }).limit(1);
          if (tabelaAusente(error)) return null;
          if (error) throw new FalhaDeLeitura('as mensagens do WhatsApp', error);
          return (data && data[0] && data[0].created_at) || null;
        });
        whatsapp = C.situacaoDoWhatsapp(codewords.linha, { agora: instante(), ultimaSaida });
      }
      return {
        meta: C.situacaoDaPlataforma('meta', integracoes.find(i => i.canal === 'meta') || null, { agora: instante() }),
        google: C.situacaoDaPlataforma('google', integracoes.find(i => i.canal === 'google') || null, { agora: instante() }),
        site: C.situacaoDoSite(site),
        whatsapp,
      };
    }, o);
  }

  /** O bloco `agenda` do contrato: ocupação dos próximos 7 dias de trabalho, pela regra da Agenda. */
  function agenda(o = {}) {
    const dia = hoje();
    return lembrar(`agenda|${dia}`, async () => {
      const sb = banco(), datas = Ag.proximosDiasDeTrabalho(dia, 7);
      const [agendamentos, consultores, servicos] = await Promise.all([
        tolerante('agenda', null, async () => {
          const { data, error } = await sb.from('agendamentos').select('data, hora, servico, status').gte('data', datas[0]).lte('data', datas[datas.length - 1]).limit(2000);
          if (error) throw new FalhaDeLeitura('a agenda', error);
          return data || [];
        }),
        tolerante('agenda_capacidade', null, async () => {
          const { data, error } = await sb.from('consultores').select('id, ativo');
          if (error) throw new FalhaDeLeitura('os consultores', error);
          return data || [];
        }),
        tolerante('agenda_servicos', [], async () => {
          const { data, error } = await sb.from('servicos').select('nome, duracao_min');
          if (error) throw new FalhaDeLeitura('os serviços', error);
          return data || [];
        }),
      ]);
      return Ag.agendaDaOficina({ hoje: dia, agendamentos, consultores, servicos });
    }, o);
  }

  /** Nomes das leituras tolerantes que falharam há pouco (para estado.incompleto). */
  function falhas() {
    const t = instante(), saida = [];
    for (const [nome, f] of falhasVistas) {
      if (t - f.em > cfg.ttl * 2) falhasVistas.delete(nome);
      else saida.push(nome);
    }
    return saida.sort();
  }

  /** Guarda (ou busca) um resultado já montado, pela mesma memória curta. */
  const guardar = (chave, montar, o = {}) => lembrar(`pronto|${chave}`, montar, o);

  return {
    metricas, haReal, contatos, config, alertas, rastreio, termos, conexoes, agenda, falhas, guardar,
    agora: instante, hoje,
    /** Esquece tudo o que está guardado (quem grava alguma coisa chama isto para a tela ver na hora). */
    esquecer() { memoria.clear(); },
    /** Só para teste: troca o banco, a jornada ou o relógio e esquece o que estava guardado. */
    trocar(novas = {}) { Object.assign(cfg, novas); memoria.clear(); falhasVistas.clear(); },
    get tamanho() { return memoria.size; },
  };
}

let _padrao = null;
/** A fonte do app (banco de verdade, relógio de verdade). */
function padrao() {
  if (!_padrao) _padrao = criarFonte();
  return _padrao;
}

module.exports = { criarFonte, padrao, FalhaDeLeitura, normalizarMetrica, semSegredo, tabelaAusente, TTL_MS, PAGINA };
