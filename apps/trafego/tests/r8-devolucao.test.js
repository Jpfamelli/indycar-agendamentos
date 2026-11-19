/* Rodada 8 (T6): arquivo de vendas para o Google e lista para marcar no WhatsApp Business. Nada é enviado. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarBanco } = require('./apoio/banco-falso');
const D = require('../devolucao');

const AGORA = Date.parse('2026-11-19T15:00:00Z');
const t = s => Date.parse(s);
const venda = (extra = {}) => ({ lead_id: 'aaaaaaaa-0000-0000-0000-000000000001', nome: 'Paula', telefone_final: '0001', valor: 850,
  vendido_em: t('2026-11-18T17:35:00Z'), chegou_em: t('2026-11-15T13:00:00Z'), clique_em: t('2026-11-15T12:58:00Z'),
  plataforma: 'google', gclid: 'EAIaIQobChMI-falso', gbraid: null, wbraid: null, ctwa_clid: null, ...extra });

test('Google, Central de dados: cabeçalho, um identificador por linha (gclid > wbraid > gbraid), hora com fuso e pedido único', () => {
  const r = D.csvGoogle([
    venda(),
    venda({ lead_id: 'L2', gclid: null, wbraid: 'WBRAID-falso-123', gbraid: 'GBRAID-falso-123', valor: 120.5 }),
    venda({ lead_id: 'L3', gclid: null, gbraid: 'GBRAID-falso-999' }),
    venda({ lead_id: 'L4', gclid: null }),                                            // sem clique: fica fora
    venda({ lead_id: 'L5', clique_em: t('2026-07-01T12:00:00Z') }),                  // clique com mais de 90 dias
    venda({ lead_id: 'L6', vendido_em: t('2026-11-10T12:00:00Z') }),                 // vendido antes do clique
  ], { agora: AGORA });
  const linhas = r.csv.trim().split('\r\n');
  assert.equal(linhas[0], 'GCLID,GBRAID,WBRAID,Conversion action,Conversion date and time,Conversion value,Currency,Order ID');
  assert.equal(linhas[1], 'EAIaIQobChMI-falso,,,Venda na oficina,2026-11-18T14:35:00-03:00,850.00,BRL,aaaaaaaa-0000-0000-0000-000000000001');
  assert.equal(linhas[2], ',,WBRAID-falso-123,Venda na oficina,2026-11-18T14:35:00-03:00,120.50,BRL,L2');
  assert.equal(linhas[3], ',GBRAID-falso-999,,Venda na oficina,2026-11-18T14:35:00-03:00,850.00,BRL,L3');
  assert.equal(r.linhas, 3);
});

test('Google, formato legado: linha de fuso, colunas antigas, só gclid; nome com vírgula e fórmula não quebram a planilha', () => {
  const r = D.csvGoogle([venda(), venda({ lead_id: 'L2', gclid: null, wbraid: 'WBRAID-falso-123' })], { agora: AGORA, formato: 'legado', nome: '=Venda, oficina' });
  const linhas = r.csv.trim().split('\r\n');
  assert.equal(linhas[0], 'Parameters:TimeZone=America/Sao_Paulo');
  assert.equal(linhas[1], 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID');
  assert.equal(linhas[2], `EAIaIQobChMI-falso,"'=Venda, oficina",2026-11-18 14:35:00,850.00,BRL,aaaaaaaa-0000-0000-0000-000000000001`);
  assert.equal(r.linhas, 1);
});

test('Meta: lista para marcar no WhatsApp Business, com prazo de 7 dias e só o final do telefone', () => {
  const lista = D.listaMeta([
    venda({ plataforma: 'meta', gclid: null, ctwa_clid: 'ARAkLm-falso', anuncio_nome: 'Troca de óleo', clique_em: t('2026-11-15T12:58:00Z') }),
    venda({ lead_id: 'L2', plataforma: 'meta', gclid: null, clique_em: t('2026-11-01T12:00:00Z') }),
    venda({ lead_id: 'L3' }),   // Google: não entra
  ], { agora: AGORA });
  assert.equal(lista.length, 2);
  assert.deepEqual([lista[0].no_prazo, lista[0].veio_do_anuncio_certo, lista[0].lista, lista[0].telefone_final], [true, true, 'Pedido concluído', '0001']);
  assert.match(lista[0].fazer, /Pedido concluído/);
  assert.equal(lista[1].no_prazo, false);
  assert.match(lista[1].fazer, /7 dias/);
  assert.ok(!JSON.stringify(lista).includes('ARAkLm'), 'o identificador do clique não sai na lista');
});

test('lerVendas: valor da Jornada + clique do contato e do site; banco sem as colunas novas diz o que falta', async () => {
  const itens = [
    { lead_id: 'L1', desfecho: { tipo: 'fechou', valor: 850, em: '2026-11-18T14:35:00-03:00' } },
    { lead_id: 'L2', desfecho: { tipo: 'fechou', valor: null, em: null } },
    { lead_id: 'L3', desfecho: { tipo: 'nao_fechou' } },
  ];
  const listar = async () => itens;
  const sb = criarBanco({
    leads: [{ id: 'L1', nome: 'Paula Mendes', telefone_e164: '+5512999990001', created_at: '2026-11-15T13:00:00Z', closed_at: '2026-11-18T17:35:00Z',
      origem: 'google', origem_paga: true, origem_plataforma: 'google', gclid: null, fbclid: null, ctwa_clid: null, anuncio_ext: null, anuncio_nome: null, campanha_nome: 'Pesquisa', rastreio: { wbraid: 'WBRAID-do-rastreio-1' } }],
    trafego_rastreio: [{ lead_id: 'L1', gclid: 'EAIaIQobChMI-do-site', gbraid: null, wbraid: null, fbclid: null, criado_em: '2026-11-15T12:58:00Z' }],
  });
  const r = await D.lerVendas({ sb, listar, agora: AGORA });
  assert.equal(r.pronto, true);
  assert.equal(r.vendas.length, 1);
  assert.deepEqual([r.vendas[0].nome, r.vendas[0].telefone_final, r.vendas[0].gclid, r.vendas[0].wbraid, r.vendas[0].valor], ['Paula', '0001', 'EAIaIQobChMI-do-site', 'WBRAID-do-rastreio-1', 850]);
  const velho = criarBanco({ leads: [] }, { colunasAusentes: { leads: ['gclid'] } });
  const v = await D.lerVendas({ sb: velho, listar, agora: AGORA });
  assert.equal(v.pronto, false);
  assert.match(v.motivo, /atualização do banco/);
});
