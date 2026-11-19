/* ============================================================
   Devolver a venda às plataformas (rodada 8, frente T6) — só o que dá para fazer com segurança agora.
   NADA aqui envia dado a plataforma nenhuma: o app monta o arquivo e a lista, e uma pessoa sobe ou marca.

   1. Google: arquivo com as vendas fechadas que têm gclid, gbraid ou wbraid.
      - formato "central" (padrão): Central de dados do Google Ads (Data Manager). Primeira linha com os
        cabeçalhos, um identificador de clique por linha (ordem do Google: gclid, wbraid, gbraid), data e hora
        em ISO 8601 com fuso (-03:00). Fonte: support.google.com/google-ads-data-manager/answer/14184381
        (os nomes das colunas são mapeados na tela do Google; aqui vão os nomes que ele mostra).
      - formato "legado": importação antiga por arquivo (Metas › Conversões › Uploads), com a linha
        Parameters:TimeZone=America/Sao_Paulo e as colunas Google Click ID, Conversion Name… Só aceita gclid.
        Fonte: support.google.com/google-ads/answer/7014069 (marcada pelo Google como "legado").
      - sem colunas de consentimento e sem telefone: o app ainda não registra o consentimento do cliente,
        e consentimento não pode ir "concedido" por padrão (LGPD, pesquisa 01 §8).
   2. Meta: lista das vendas de contatos que vieram de anúncio da Meta, para o dono marcar a conversa no
      WhatsApp Business (Ferramentas › Atividade de clientes; listas "Pago" ou "Pedido concluído") em até
      7 dias do clique. Fonte: faq.whatsapp.com/732422085323636.
   O valor da venda é o da Jornada (mesma regra de toda a tela): jornada.listarBruto.
   Identificador de clique é dado pessoal ligado ao telefone: só sai em rota com login, nunca em log.
   ============================================================ */
'use strict';

const db = require('./db');

const DIA = 86400000;
const DIAS_GOOGLE = 90;   // clique com mais de 90 dias não é aceito
const DIAS_META = 7;      // a marcação na conversa vale até 7 dias depois do clique
const ID_CLIQUE = /^[A-Za-z0-9_-]{10,300}$/;
const NOME_PADRAO = 'Venda na oficina';

const hojeBR = (agora = Date.now()) => new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const instante = v => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : null; };
/** '2026-11-18T14:35:00-03:00' (Brasil sem horário de verão desde 2019). */
const isoBR = t => `${new Date(t - 3 * 3600000).toISOString().slice(0, 19)}-03:00`;
const limpo = v => (v != null && ID_CLIQUE.test(String(v)) ? String(v) : null);
const semColuna = e => !!e && (e.code === '42703' || e.code === 'PGRST204' || e.code === 'PGRST205' || /does not exist|could not find/i.test(String(e.message || '')));

/* ---------------- leitura ---------------- */

/**
 * Vendas fechadas (com valor) dos últimos `dias`, com os identificadores de clique de cada contato.
 * Devolve { pronto, motivo?, vendas: [{ lead_id, nome, telefone_final, valor, vendido_em, chegou_em,
 *   plataforma, gclid, gbraid, wbraid, clique_em, ctwa_clid, fbclid, anuncio_ext, anuncio_nome, campanha_nome }] }.
 */
async function lerVendas({ sb = db.sb, listar = null, agora = Date.now(), dias = DIAS_GOOGLE } = {}) {
  const ate = hojeBR(agora), de = somarDias(ate, -dias);
  const listarBruto = listar || require('./jornada').listarBruto;
  const itens = await listarBruto({ de, ate, sb });
  const fechadas = (itens || []).filter(i => i?.desfecho?.tipo === 'fechou' && Number(i.desfecho.valor) > 0);
  if (!fechadas.length) return { pronto: true, vendas: [] };
  const ids = fechadas.map(i => i.lead_id);
  const { data: leads, error } = await sb.from('leads')
    .select('id, nome, telefone_e164, created_at, closed_at, origem, origem_paga, origem_plataforma, gclid, fbclid, ctwa_clid, anuncio_ext, anuncio_nome, campanha_nome, rastreio')
    .in('id', ids);
  if (error) {
    if (semColuna(error)) return { pronto: false, motivo: 'O banco ainda não guarda os identificadores de clique (falta aplicar a atualização do banco).', vendas: [] };
    throw new Error(`devolucao: ${error.message}`);
  }
  const porId = new Map((leads || []).map(l => [l.id, l]));
  const cliques = new Map();
  const r = await sb.from('trafego_rastreio').select('lead_id, gclid, gbraid, wbraid, fbclid, criado_em').in('lead_id', ids);
  if (!r.error) for (const x of r.data || []) if (!cliques.has(x.lead_id) || (instante(x.criado_em) || 0) > (instante(cliques.get(x.lead_id).criado_em) || 0)) cliques.set(x.lead_id, x);

  const vendas = fechadas.map(i => {
    const l = porId.get(i.lead_id) || {};
    const c = cliques.get(i.lead_id) || {};
    const rast = l.rastreio && typeof l.rastreio === 'object' ? l.rastreio : {};
    const digitos = String(l.telefone_e164 || '').replace(/\D/g, '');
    return {
      lead_id: i.lead_id,
      nome: String(l.nome || i.nome || '').trim().split(/\s+/)[0] || null,
      telefone_final: digitos.length >= 4 ? digitos.slice(-4) : null,
      valor: Math.round(Number(i.desfecho.valor) * 100) / 100,
      vendido_em: instante(i.desfecho.em) ?? instante(l.closed_at),
      chegou_em: instante(l.created_at),
      plataforma: l.origem_plataforma || (l.origem === 'meta' || l.origem === 'google' ? l.origem : null),
      gclid: limpo(l.gclid) || limpo(c.gclid) || limpo(rast.gclid),
      gbraid: limpo(c.gbraid) || limpo(rast.gbraid),
      wbraid: limpo(c.wbraid) || limpo(rast.wbraid),
      clique_em: instante(c.criado_em) ?? instante(l.created_at),
      ctwa_clid: limpo(l.ctwa_clid) || limpo(rast.ctwa_clid),
      fbclid: limpo(l.fbclid) || limpo(c.fbclid),
      anuncio_ext: l.anuncio_ext || null, anuncio_nome: l.anuncio_nome || null, campanha_nome: l.campanha_nome || null,
    };
  });
  return { pronto: true, vendas };
}

/* ---------------- Google ---------------- */

/** Vendas que o Google aceita: com identificador de clique, vendidas depois do clique e com clique de até 90 dias. */
function vendasParaGoogle(vendas, { agora = Date.now() } = {}) {
  return vendas.filter(v => (v.gclid || v.gbraid || v.wbraid) && v.vendido_em
    && (v.clique_em == null || (v.vendido_em >= v.clique_em && agora - v.clique_em < DIAS_GOOGLE * DIA)));
}

/* CSV: aspas quando precisa, e nada de fórmula de planilha (=, +, -, @ no começo). */
function celula(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const linhaCsv = cols => cols.map(celula).join(',');
const valorCsv = v => (Math.round(Number(v) * 100) / 100).toFixed(2);

/**
 * Monta o arquivo para o Google. formato: 'central' (Central de dados, padrão) ou 'legado' (Uploads antigo, só gclid).
 * Número do pedido = id do contato: o Google ignora o mesmo pedido mandado de novo (pode reenviar sem duplicar).
 */
function csvGoogle(vendas, { nome = NOME_PADRAO, formato = 'central', agora = Date.now() } = {}) {
  const lista = vendasParaGoogle(vendas, { agora });
  const nomeAcao = String(nome || NOME_PADRAO).slice(0, 100);
  if (formato === 'legado') {
    const linhas = ['Parameters:TimeZone=America/Sao_Paulo',
      linhaCsv(['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency', 'Order ID'])];
    for (const v of lista.filter(x => x.gclid)) {
      linhas.push(linhaCsv([v.gclid, nomeAcao, isoBR(v.vendido_em).slice(0, 19).replace('T', ' '), valorCsv(v.valor), 'BRL', v.lead_id]));
    }
    return { csv: `${linhas.join('\r\n')}\r\n`, linhas: linhas.length - 2 };
  }
  const linhas = [linhaCsv(['GCLID', 'GBRAID', 'WBRAID', 'Conversion action', 'Conversion date and time', 'Conversion value', 'Currency', 'Order ID'])];
  for (const v of lista) {
    // Um identificador por linha, na ordem que o Google usa: gclid, depois wbraid, depois gbraid.
    const id = v.gclid ? [v.gclid, '', ''] : v.wbraid ? ['', '', v.wbraid] : ['', v.gbraid, ''];
    linhas.push(linhaCsv([...id, nomeAcao, isoBR(v.vendido_em), valorCsv(v.valor), 'BRL', v.lead_id]));
  }
  return { csv: `${linhas.join('\r\n')}\r\n`, linhas: linhas.length - 1 };
}

/* ---------------- Meta ---------------- */

/** Vendas de contatos de anúncio da Meta, para marcar no WhatsApp Business. A mais nova primeiro. */
function listaMeta(vendas, { agora = Date.now() } = {}) {
  return vendas.filter(v => v.plataforma === 'meta' || v.ctwa_clid)
    .map(v => {
      const base = v.clique_em ?? v.chegou_em;
      const dias = base == null ? null : Math.floor((agora - base) / DIA);
      const noPrazo = dias != null && dias < DIAS_META;
      return {
        lead_id: v.lead_id, nome: v.nome, telefone_final: v.telefone_final,
        valor: v.valor, vendido_em: v.vendido_em ? isoBR(v.vendido_em) : null, contato_em: base ? isoBR(base) : null,
        anuncio_ext: v.anuncio_ext, anuncio_nome: v.anuncio_nome, campanha_nome: v.campanha_nome,
        veio_do_anuncio_certo: !!v.ctwa_clid,
        dias_desde_o_contato: dias, no_prazo: noPrazo,
        lista: 'Pedido concluído',
        fazer: noPrazo
          ? `No WhatsApp Business, abra a conversa${v.nome ? ` de ${v.nome}` : ''}${v.telefone_final ? ` (final ${v.telefone_final})` : ''} e ponha na lista "Pedido concluído" (ou "Pago").`
          : 'Passou de 7 dias do contato: a Meta não conta mais esta venda pela conversa.',
      };
    })
    .sort((a, b) => String(b.vendido_em).localeCompare(String(a.vendido_em)));
}

module.exports = { lerVendas, vendasParaGoogle, csvGoogle, listaMeta, celula, isoBR, DIAS_GOOGLE, DIAS_META, NOME_PADRAO };
