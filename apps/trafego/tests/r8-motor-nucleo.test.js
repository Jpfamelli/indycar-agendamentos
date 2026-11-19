'use strict';
/* Rodada 8 (frente T2a) — o motor: cópia fiel do núcleo do Nexus Ads (motor/nucleo.mjs) e o adaptador
   que monta o conjunto de dados dele a partir de ads_metricas_dia e dos contatos da jornada. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const A = require('../motor/adaptador');
const T = require('../motor/texto');

const SHA_DA_ORIGEM = 'afab5bad1a28ac5fb04f316482da3b8fda13c29c8c709e8577547e97736211c2';

/* ---------- peças de teste ---------- */
const linha = (data, nivel, extra = {}) => ({
  plataforma: 'meta', data, nivel, campanha_ext: 'c1', campanha_nome: 'Troca de óleo R$ 169', conjunto_ext: nivel === 'campanha' ? null : 's1',
  conjunto_nome: nivel === 'campanha' ? null : 'Taubaté 30 km', anuncio_ext: nivel === 'anuncio' ? 'a1' : null, anuncio_nome: nivel === 'anuncio' ? 'Vídeo 2' : null,
  status: 'ACTIVE', impressoes: 1000, alcance: 800, frequencia: 1.25, cliques: 20, gasto: 50, conversoes: 4, valor_conversao: 0, fonte: 'meta', ...extra,
});
const contato = (id, chegou, extra = {}) => ({
  lead_id: id, nome: 'João S.', telefone_final: '0272', carro: 'Onix 2019', servico: 'Troca de óleo', chegou_em: chegou, cliente_novo: true,
  origem: { canal: 'meta', paga: true, rotulo: 'Anúncio da Meta', detalhe: null, campanha: { ext: 'c1', nome: 'Troca de óleo R$ 169' }, conjunto: null, anuncio: { ext: 'a1', nome: 'Vídeo 2' }, palavra_chave: null, como: 'ref', como_rotulo: 'pelo código do site', certeza: 'certa' },
  etapas: [{ id: 'contato', em: chegou }], etapa_atual: 'contato',
  desfecho: { tipo: 'aberto', valor: null, valor_fonte: null, motivo: null, obs: null, em: null, parado_dias: 1 }, responsavel: 'Carlos', pendencias: [], ...extra,
});

test('motor/nucleo.mjs é cópia fiel do núcleo do Nexus Ads e diz de onde veio', () => {
  const texto = fs.readFileSync(path.join(__dirname, '..', 'motor', 'nucleo.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const marca = '/* ---- início da cópia ---- */\n';
  const corte = texto.indexOf(marca);
  assert.ok(corte > 0, 'o cabeçalho com a origem precisa existir');
  const cabecalho = texto.slice(0, corte);
  assert.match(cabecalho, /nexus-ads/);
  assert.match(cabecalho, /web\/nucleo\.js/);
  assert.match(cabecalho, /commit 88b36d2/);
  assert.match(cabecalho, new RegExp(SHA_DA_ORIGEM));
  const corpo = texto.slice(corte + marca.length);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(corpo, 'utf8')).digest('hex'), SHA_DA_ORIGEM, 'o núcleo foi editado: traga a versão nova inteira e atualize o cabeçalho');
});

test('demonstração isolada: havendo dado real, linha de demonstração não entra; só demonstração fica marcada', () => {
  const real = linha('2026-11-10', 'campanha', { gasto: 80 });
  const demo = linha('2026-11-10', 'campanha', { gasto: 999, fonte: 'demo', campanha_ext: 'demo1' });
  const misto = A.separarDemo([demo, real, demo]);
  assert.equal(misto.tipo, 'real');
  assert.deepEqual(misto.linhas, [real]);
  assert.equal(misto.descartadas, 2);

  const soDemo = A.separarDemo([demo]);
  assert.equal(soDemo.tipo, 'demo');
  assert.deepEqual(soDemo.linhas, [demo]);

  assert.deepEqual(A.separarDemo([]), { tipo: 'vazio', linhas: [], descartadas: 0 });
  assert.equal(A.separarDemo(null).tipo, 'vazio');

  // existe dado real na tabela, mas fora do período pedido: a demonstração do período não aparece
  assert.deepEqual(A.separarDemo([demo, demo], { haRealNaTabela: true }), { tipo: 'vazio', linhas: [], descartadas: 2 });
});

test('métricas do banco viram linhas do núcleo: só campanha e anúncio; Meta conta conversas iniciadas quando a coluna existe', () => {
  const saida = A.metricasParaNucleo([
    linha('2026-11-10', 'campanha', { objetivo: 'Conversas', conversas: 6, conversoes: 9 }),
    linha('2026-11-10', 'anuncio', { conversas: null, conversoes: 3 }),
    linha('2026-11-10', 'conjunto'),
    linha('2026-11-10', 'conta'),
    linha('2026-11-10', 'campanha', { plataforma: 'google', campanha_ext: 'g1', campanha_nome: 'Pesquisa', conversoes: 2.5, conversas: 7 }),
  ]);
  assert.equal(saida.length, 3);
  assert.deepEqual(saida[0], { n: 'campanha', d: '2026-11-10', p: 'meta', c: 'c1', cn: 'Troca de óleo R$ 169', a: null, an: null, g: 50, imp: 1000, alc: 800, cli: 20, conv: 6, freq: 1.25, st: 'ACTIVE', obj: 'Conversas' });
  assert.equal(saida[1].n, 'anuncio');
  assert.equal(saida[1].conv, 3, 'sem a coluna conversas, vale conversoes');
  assert.equal(saida[1].a, 'a1');
  assert.equal(saida[2].conv, 2.5, 'no Google vale sempre a conversão da plataforma');
});

test('contato da jornada vira ficha do núcleo: anúncio com campanha, etapa pelo desfecho e dia de Brasília', () => {
  const aberto = A.contatoParaNucleo(contato('l1', '2026-11-19T02:30:00Z'));
  assert.equal(aberto.data_conversa, '2026-11-18', '23h30 do dia 18 em Brasília');
  assert.deepEqual([aberto.origem, aberto.plataforma, aberto.campanha_ext, aberto.anuncio_ext, aberto.etapa], ['anuncio', 'meta', 'c1', 'a1', 'nova']);
  assert.equal(aberto.telefone, '', 'telefone não entra no motor');
  assert.equal(aberto.nome, '', 'nome não entra no motor');

  const fechou = A.contatoParaNucleo(contato('l2', '2026-11-10T12:00:00-03:00', {
    etapas: [{ id: 'contato', em: '2026-11-10T12:00:00-03:00' }, { id: 'agendou', em: '2026-11-10T13:00:00-03:00', para: '2026-11-12T08:00:00-03:00' }, { id: 'veio', em: '2026-11-12T08:10:00-03:00' }, { id: 'fechou', em: '2026-11-12T17:00:00-03:00' }],
    desfecho: { tipo: 'fechou', valor: 750, valor_fonte: 'patio', motivo: null, obs: null, em: '2026-11-12T17:00:00-03:00', parado_dias: null },
  }));
  assert.deepEqual([fechou.etapa, fechou.data_agenda, fechou.data_consulta, fechou.valor], ['fechou', '2026-11-12', '2026-11-12', 750]);

  const semValor = A.contatoParaNucleo(contato('l3', '2026-11-10T12:00:00-03:00', { desfecho: { tipo: 'fechou', valor: null } }));
  assert.equal(semValor.valor, null, 'fechou sem valor continua sem valor (nada de estimar)');

  const perdeuSemVir = A.contatoParaNucleo(contato('l4', '2026-11-10T12:00:00-03:00', { desfecho: { tipo: 'nao_fechou', motivo: 'caro' } }));
  assert.equal(perdeuSemVir.etapa, 'perdida');
  const perdeuDepoisDeVir = A.contatoParaNucleo(contato('l5', '2026-11-10T12:00:00-03:00', {
    etapas: [{ id: 'contato', em: '2026-11-10T12:00:00-03:00' }, { id: 'veio', em: '2026-11-11T09:00:00-03:00' }], desfecho: { tipo: 'nao_fechou', motivo: 'caro' } }));
  assert.equal(perdeuDepoisDeVir.etapa, 'nao_fechou');
  const agendado = A.contatoParaNucleo(contato('l6', '2026-11-10T12:00:00-03:00', {
    etapas: [{ id: 'contato', em: '2026-11-10T12:00:00-03:00' }, { id: 'agendou', em: '2026-11-10T13:00:00-03:00', para: '2026-11-25T08:00:00-03:00' }] }));
  assert.deepEqual([agendado.etapa, agendado.data_agenda], ['agendada', '2026-11-25']);

  // tinha horário, o dia passou e o carro não veio: falta (só quando se sabe que dia é hoje)
  const item = contato('l7', '2026-11-10T12:00:00-03:00', {
    etapas: [{ id: 'contato', em: '2026-11-10T12:00:00-03:00' }, { id: 'agendou', em: '2026-11-10T13:00:00-03:00', para: '2026-11-25T08:00:00-03:00' }] });
  assert.equal(A.contatoParaNucleo(item, { hoje: '2026-11-25' }).etapa, 'agendada', 'no dia marcado ainda não é falta');
  assert.equal(A.contatoParaNucleo(item, { hoje: '2026-11-26' }).etapa, 'faltou');
});

test('contato que não é de anúncio fica fora do funil dos anúncios, com a origem dele', () => {
  const casos = [['site', false, 'site'], ['indicacao', false, 'indicacao'], ['instagram', false, 'organico'], ['whatsapp', false, 'whatsapp'], ['passagem', false, 'manual'], ['telefone', false, 'manual'], ['desconhecida', null, 'whatsapp']];
  for (const [canal, paga, esperado] of casos) {
    const f = A.contatoParaNucleo(contato('x', '2026-11-10T12:00:00-03:00', { origem: { canal, paga, campanha: { ext: 'c1' }, anuncio: null } }));
    assert.deepEqual([f.origem, f.plataforma, f.campanha_ext], [esperado, null, null], canal);
  }
  const semOrigem = A.contatoParaNucleo(contato('y', '2026-11-10T12:00:00-03:00', { origem: null }));
  assert.equal(semOrigem.origem, 'whatsapp');
  assert.equal(A.contatoParaNucleo(contato('z', 'data ruim')), null, 'contato sem data de chegada não entra');
});

test('montarMotor: vertical oficina, assinatura IndyCar Tráfego, metas do ads_config e nenhuma regra de alerta do núcleo ligada', async () => {
  const metricas = [], contatos = [];
  // 20 dias de campanha gastando R$ 50 por dia sem nenhuma conversa: no Nexus isso acenderia "campanha sem conversa"
  for (let d = 1; d <= 18; d++) {
    const data = `2026-11-${String(d).padStart(2, '0')}`;
    metricas.push(linha(data, 'campanha', { conversoes: 0 }), linha(data, 'anuncio', { conversoes: 0 }));
  }
  contatos.push(contato('l1', '2026-11-05T10:00:00-03:00'));
  const { M } = await A.montarMotor({ metricas, contatos, config: { cpa_alvo: 90, orcamento_mensal: 3000, ticket_medio: 420 }, hoje: '2026-11-19', dias: 60 });
  assert.equal(M.vertical, 'oficina');
  assert.equal(M.CFG.assinatura, 'IndyCar Tráfego');
  assert.equal(M.NOME, 'IndyCar');
  assert.equal(M.CFG.orcamento, 3000);
  assert.equal(M.CFG.cpaAlvo, 90);
  assert.deepEqual(M.CFG.ticket, {}, 'ticket médio não vira receita estimada');
  assert.deepEqual(M.avaliar(M.R, true), [], 'o radar é o radar.js: o núcleo não avalia regra nenhuma aqui');
  assert.match(M.PAINEL, /\/trafego\/$/, 'o link do painel nos textos aponta para /trafego/');

  const ritmo = M.ritmoMes(M.R);
  assert.equal(ritmo.gasto, 900, '18 dias de R$ 50 (a linha de campanha não soma em dobro com a do anúncio)');
  assert.equal(ritmo.pass, 18);
  assert.equal(M.crmTot(0, M.R).conversas, 1);
});

test('montarMotor: dados de hoje não entram nas contas de dia fechado e data ruim não derruba', async () => {
  const { M, ds } = await A.montarMotor({
    metricas: [linha('2026-11-19', 'campanha'), linha('2026-11-18', 'campanha'), linha('data-ruim', 'campanha')],
    contatos: [contato('l1', '2026-11-19T10:00:00-03:00'), contato('l2', null)],
    config: {}, hoje: '2026-11-19', dias: 30,
  });
  assert.equal(M.consolidar(M.linhasDe(0, M.R)).gasto, 50, 'só o dia 18');
  assert.equal(ds.LEADS.length, 1, 'contato sem data fica de fora');
  assert.equal(M.CFG.orcamento, null, 'sem orçamento configurado não existe orçamento');
});

test('texto da casa: sem travessão, sem sigla solta e com as palavras do dono', () => {
  const t = T.textoDaCasa('📊 *IndyCar · Tráfego pago* — quarta-feira\n• No CRM: 3 leads · CTR 1,2% · CPA R$ 30 — ROAS 4x\n• Criativo com CTR baixo; o veículo compareceu. Custo: —\n• das 8h–12h');
  assert.doesNotMatch(t, /—|–/);
  assert.doesNotMatch(t, /\b(CRM|CTR|CPA|ROAS|leads?|[Cc]riativos?|ve[ií]culo|compareceu)\b/);
  assert.match(t, /No sistema: 3 contatos/);
  assert.match(t, /taxa de clique/);
  assert.match(t, /custo por contato R\$ 30/);
  assert.match(t, /retorno 4x/);
  assert.match(t, /Anúncio com taxa de clique baixa/);
  assert.match(t, /o carro veio/);
  assert.match(t, /Custo: sem dado/);
  assert.match(t, /das 8h a 12h/);
  assert.equal(T.textoDaCasa(null), '');
});

test('dinheiro e números: formato do Brasil, espaço comum e null quando não se sabe', () => {
  assert.equal(T.brl(1234.5), 'R$ 1.234,50');
  assert.equal(T.brl0(2340.5), 'R$ 2.341');
  assert.equal(T.dinheiro(4.2), 'R$ 4,20');
  assert.equal(T.dinheiro(2340.5), 'R$ 2.341');
  assert.equal(T.dinheiro(169), 'R$ 169');
  assert.equal(T.dinheiro(null), null);
  assert.equal(T.dinheiro(NaN), null);
  assert.doesNotMatch(T.brl(1234.5), / /, 'sem espaço especial entre R$ e o número');
  assert.equal(T.inteiro(12345), '12.345');
  assert.equal(T.plural(1, 'contato', 'contatos'), '1 contato');
  assert.equal(T.plural(0, 'contato', 'contatos'), '0 contatos');
  assert.equal(T.dividir(10, 0), null);
  assert.equal(T.dividir(null, 2), null);
  assert.equal(T.dividir(10, 4), 2.5);
  assert.equal(T.arredondar(1 / 3, 2), 0.33);
  assert.equal(T.arredondar(Infinity), null);
  assert.equal(T.numOuNulo('12.5'), 12.5);
  assert.equal(T.numOuNulo(''), null);
  assert.equal(T.numOuNulo('abc'), null);
});

test('conferência da resposta: acha número que não é número e texto com sujeira', () => {
  const ruim = { a: 1, b: { c: NaN, d: [1, Infinity] }, texto: 'custou R$ NaN', outro: 'valor undefined', rotulo: 'ok — não', sigla: 'ROAS de 4' };
  assert.deepEqual(T.naoFinitos(ruim), ['b.c', 'b.d[1]']);
  assert.deepEqual(T.textosRuins(ruim).map(x => x.caminho), ['texto', 'outro', 'rotulo', 'sigla']);
  const bom = { a: null, b: [0, 1.5], texto: 'Cada R$ 1 em anúncio virou R$ 4,20 na oficina.' };
  assert.deepEqual(T.naoFinitos(bom), []);
  assert.deepEqual(T.textosRuins(bom), []);
});
