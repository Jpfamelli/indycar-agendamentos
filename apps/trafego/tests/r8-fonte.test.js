'use strict';
/* Rodada 8 (frente T2a) — a fonte de dados das rotas novas: uma consulta por tabela (nunca por contato),
   memória curta de 30 segundos, segredo que não sai, leitura secundária que falha sem derrubar a rota,
   e a reserva da jornada quando ./jornada não existe ou falha. Banco de mentira, sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { criarBanco } = require('./apoio/banco-falso');
const F = require('../motor/fonte');
const Reserva = require('../motor/reserva-jornada');

const AGORA = Date.parse('2026-11-19T15:00:00Z');   // quinta-feira, 12h em Brasília
function relogio(inicio = AGORA) { let t = inicio; const f = () => t; f.andar = ms => { t += ms; }; return f; }
const dois = n => String(n).padStart(2, '0');
const metrica = (n, extra = {}) => ({ id: `m${String(n).padStart(5, '0')}`, plataforma: 'meta', data: `2026-11-${dois(1 + (n % 19))}`, nivel: 'campanha',
  campanha_ext: 'c1', campanha_nome: 'Troca de óleo', gasto: '12.50', impressoes: '100', alcance: '80', cliques: '4', conversoes: '1', frequencia: '1.25', fonte: 'api', ...extra });
const calado = async fn => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

test('métricas: lê em páginas de 1.000, só o período e os níveis pedidos, e devolve número de verdade', async () => {
  const linhas = Array.from({ length: 2300 }, (_, n) => metrica(n));
  linhas.push(metrica(9000, { nivel: 'anuncio' }), metrica(9001, { data: '2026-10-31' }));
  const sb = criarBanco({ ads_metricas_dia: linhas });
  const f = F.criarFonte({ sb, agora: relogio() });
  const lidas = await f.metricas({ de: '2026-11-01', ate: '2026-11-19', niveis: ['campanha'] });
  assert.equal(lidas.length, 2300);
  assert.equal(sb.idas(), 3, '2.300 linhas = 3 páginas');
  assert.deepEqual([lidas[0].gasto, lidas[0].impressoes, lidas[0].frequencia, lidas[0].data], [12.5, 100, 1.25, '2026-11-01']);
  assert.ok(lidas.every(l => l.nivel === 'campanha' && l.data >= '2026-11-01'));
});

test('memória curta: 30 segundos por leitura; pedidos ao mesmo tempo dividem a ida ao banco; ?fresco lê de novo', async () => {
  const sb = criarBanco({ ads_metricas_dia: [metrica(1), metrica(2)] });
  const agora = relogio();
  const f = F.criarFonte({ sb, agora });
  const pedido = { de: '2026-11-01', ate: '2026-11-19', niveis: ['campanha'] };
  const [a, b] = await Promise.all([f.metricas(pedido), f.metricas(pedido)]);
  assert.equal(sb.idas(), 1, 'dois pedidos juntos, uma consulta');
  assert.equal(a, b);
  await f.metricas(pedido);
  assert.equal(sb.idas(), 1, 'dentro dos 30 segundos não volta ao banco');
  await f.metricas({ ...pedido, ate: '2026-11-18' });
  assert.equal(sb.idas(), 2, 'outro período é outra leitura');
  agora.andar(31_000);
  await f.metricas(pedido);
  assert.equal(sb.idas(), 3, 'passados os 30 segundos, lê de novo');
  await f.metricas(pedido, { fresco: true });
  assert.equal(sb.idas(), 4, 'fresco ignora a memória');
  f.esquecer();
  await f.metricas(pedido);
  assert.equal(sb.idas(), 5, 'esquecer() limpa tudo');
});

test('leitura essencial que falha estoura erro com frase limpa e não fica guardada', async () => {
  const falhas = { ads_metricas_dia: 'connection refused para postgres://usuario:senha-secreta-1234567890abcdef@host' };
  const sb = criarBanco({ ads_metricas_dia: [metrica(1)] }, { falhas });
  const f = F.criarFonte({ sb, agora: relogio() });
  const pedido = { de: '2026-11-01', ate: '2026-11-19', niveis: ['campanha'] };
  await assert.rejects(f.metricas(pedido), e => e instanceof F.FalhaDeLeitura && e.message === 'não foi possível ler as métricas dos anúncios' && !/senha-secreta/.test(e.detalhe));
  delete falhas.ads_metricas_dia;
  assert.equal((await f.metricas(pedido)).length, 1, 'a falha não ficou na memória');
});

test('existe dado real? linha de demonstração não conta; linha sem a marca de fonte conta como real', async () => {
  const soDemo = F.criarFonte({ sb: criarBanco({ ads_metricas_dia: [metrica(1, { fonte: 'demo' }), metrica(2, { fonte: 'demo' })] }), agora: relogio() });
  assert.equal(await soDemo.haReal(), false);
  assert.equal(await F.criarFonte({ sb: criarBanco({ ads_metricas_dia: [metrica(1, { fonte: 'demo' }), metrica(2)] }), agora: relogio() }).haReal(), true);
  assert.equal(await F.criarFonte({ sb: criarBanco({ ads_metricas_dia: [metrica(1, { fonte: null })] }), agora: relogio() }).haReal(), true);
  assert.equal(await F.criarFonte({ sb: criarBanco({ ads_metricas_dia: [] }), agora: relogio() }).haReal(), false);
});

test('metas: viram número; sem a linha ou sem a tabela, ninguém inventa meta', async () => {
  const f = F.criarFonte({ sb: criarBanco({ ads_config: [{ id: true, cpa_alvo: '90', orcamento_mensal: '9000.00', ticket_medio: null, extras: { cpa_alvo_google: 120 } }] }), agora: relogio() });
  assert.deepEqual(await f.config(), { cpa_alvo: 90, cpa_alvo_google: 120, orcamento_mensal: 9000, ticket_medio: null });
  const vazia = F.criarFonte({ sb: criarBanco({ ads_config: [] }), agora: relogio() });
  assert.deepEqual(await vazia.config(), { cpa_alvo: null, cpa_alvo_google: null, orcamento_mensal: null, ticket_medio: null });
  assert.deepEqual(vazia.falhas(), []);
  const semTabela = F.criarFonte({ sb: criarBanco({}), agora: relogio() });
  assert.deepEqual(await calado(() => semTabela.config()), {});
  assert.deepEqual(semTabela.falhas(), ['metas'], 'a leitura que falhou fica anotada para a resposta dizer que está incompleta');
});

test('conexões: nenhum segredo sai da fonte, a chave do CodeWords nem é pedida, e o "desde" do WhatsApp vem da última mensagem que saiu', async () => {
  const sb = criarBanco({
    integracoes_ads: [{ id: 'i1', canal: 'meta', ativo: true, meta_access_token: 'EAAB-segredo-123', meta_ad_account_id: 'act_1', ultimo_sync_em: '2026-11-19T10:10:00Z', ultimo_sync_status: 'ok — 42 linhas' }],
    codewords_config: [{ id: true, ativo: true, device_id: 'aparelho-1', api_key: 'cw-chave-secreta', ultimo_evento_em: '2026-11-18T20:08:00Z', sincronia_erro: 'o CodeWords respondeu 401: Unauthorized', sincronia_erro_em: '2026-11-19T10:09:00Z', sincronia_falhas: 75585 }],
    whatsapp_mensagens: [
      { id: 'w1', direcao: 'saida', status: 'enviado', gerada_por_ia: false, created_at: '2026-09-30T19:32:24Z' },
      { id: 'w2', direcao: 'saida', status: 'enviado', gerada_por_ia: true, created_at: '2026-11-18T10:03:19Z' },
      { id: 'w3', direcao: 'saida', status: 'falhou', gerada_por_ia: false, created_at: '2026-11-18T12:40:47Z' },
      { id: 'w4', direcao: 'entrada', status: 'recebido', gerada_por_ia: null, created_at: '2026-11-19T07:28:49Z' },
      { id: 'w5', direcao: 'saida', status: 'enviado', gerada_por_ia: null, created_at: '2026-09-29T12:00:00Z' },
    ],
    trafego_rastreio: [
      { id: 'r1', evento: 'clique', criado_em: '2026-11-19T12:00:00Z' }, { id: 'r2', evento: 'clique', criado_em: '2026-11-15T12:00:00Z' },
      { id: 'r3', evento: 'clique', criado_em: '2026-11-01T12:00:00Z' }, { id: 'r4', evento: 'visita', criado_em: '2026-11-19T13:00:00Z' },
    ],
  });
  const f = F.criarFonte({ sb, agora: relogio() });
  const con = await f.conexoes();
  assert.deepEqual(con.meta, { ligado: true, situacao: 'ok', ultima_coleta: '2026-11-19T10:10:00Z', aviso: null, parada: false });
  assert.equal(con.google.situacao, 'nunca_ligou');
  assert.deepEqual(con.site, { rastreio: true, ultimo_clique: '2026-11-19T12:00:00Z', cliques_7d: 2 });
  assert.equal(con.whatsapp.situacao, 'chave_recusada');
  assert.equal(con.whatsapp.desde, '2026-09-30', 'a última mensagem da oficina que saiu (a da IA e a que falhou não contam)');
  assert.doesNotMatch(JSON.stringify(con), /segredo|secreta|act_1/);
  const pedidoDoCodewords = sb.consultas.find(c => c.tabela === 'codewords_config');
  assert.doesNotMatch(String(pedidoDoCodewords.cols), /api_key|\*/, 'a chave não é pedida ao banco');
  assert.equal(sb.idas(), 5, 'contas, WhatsApp, 2 do rastreio e a última mensagem');
  await f.conexoes();
  assert.equal(sb.idas(), 5, 'segunda vez sai da memória');
});

test('conexões com o banco de antes da migração: sem rastreio, sem tabela do WhatsApp e mesmo assim responde', async () => {
  const f = F.criarFonte({ sb: criarBanco({ integracoes_ads: [] }), agora: relogio() });
  const con = await calado(() => f.conexoes());
  assert.deepEqual(con.site, { rastreio: false, ultimo_clique: null, cliques_7d: null });
  assert.equal(con.meta.situacao, 'nunca_ligou');
  assert.equal(con.whatsapp.situacao, 'sem_aparelho');
  assert.deepEqual(f.falhas(), [], 'tabela que ainda não existe não é falha: é "ainda não tem"');
});

test('agenda: três consultas (agenda, consultores, serviços); sem os consultores a ocupação fica null', async () => {
  const tabelas = {
    agendamentos: [{ id: 'a1', data: '2026-11-19', hora: '08:00:00', servico: 'Troca de óleo', status: 'aguardando' }, { id: 'a2', data: '2026-11-30', hora: '08:00:00', servico: 'Troca de óleo', status: 'aguardando' }],
    consultores: [{ id: 'c1', ativo: true }], servicos: [{ nome: 'Troca de óleo', duracao_min: 45 }],
  };
  const sb = criarBanco(tabelas);
  const f = F.criarFonte({ sb, agora: relogio() });
  const a = await f.agenda();
  assert.equal(sb.idas(), 3);
  assert.deepEqual(a.dias[0], { data: '2026-11-19', rotulo: 'qui 19', ocupacao: 0.08, marcados: 1, vagas: 8 });
  assert.equal(a.dias.length, 7);

  const semCapacidade = F.criarFonte({ sb: criarBanco({ agendamentos: tabelas.agendamentos, servicos: tabelas.servicos }), agora: relogio() });
  const b = await calado(() => semCapacidade.agenda());
  assert.equal(b.situacao, 'sem_capacidade');
  assert.equal(b.dias[0].ocupacao, null);
  assert.equal(b.dias[0].marcados, 1);
  assert.deepEqual(semCapacidade.falhas(), ['agenda_capacidade']);
});

test('alertas: só os não lidos dos últimos 7 dias (alerta velho sem leitura não é o que fazer agora)', async () => {
  const sb = criarBanco({ ads_alertas: [
    { id: 'x1', regra_nome: 'Campanha sem conversão', severidade: 'alerta', mensagem: 'm1', chave: 'k1', criado_em: '2026-11-18T10:00:00Z', lido_em: null },
    { id: 'x2', regra_nome: 'Lido', severidade: 'alerta', mensagem: 'm2', chave: 'k2', criado_em: '2026-11-18T11:00:00Z', lido_em: '2026-11-18T12:00:00Z' },
    { id: 'x3', regra_nome: 'Da demonstração de agosto', severidade: 'critico', mensagem: 'm3', chave: 'k3', criado_em: '2026-08-13T10:00:00Z', lido_em: null },
  ] });
  const lista = await F.criarFonte({ sb, agora: relogio() }).alertas();
  assert.deepEqual(lista.map(a => a.id), ['x1']);
});

test('contatos: vêm da jornada com a assinatura do contrato; se ela falhar ou não existir, entra a reserva sem derrubar', async () => {
  const leads = [
    { id: 'l1', nome: 'Marcos Silva', telefone: '12991234567', origem: 'whatsapp', status: 'concluido', valor_pago: '750.00', servico: 'Freios', carro_modelo: 'Onix', created_at: '2026-11-10T15:00:00Z', closed_at: '2026-11-12T20:00:00Z', updated_at: '2026-11-12T20:00:00Z' },
    { id: 'l2', nome: 'Fora do período', telefone: '12990000000', origem: 'whatsapp', status: 'novo', created_at: '2026-10-01T15:00:00Z' },
  ];
  const sb = criarBanco({ leads });
  const chamadas = [];
  // a jornada de verdade devolve a lista com o estado do período numa propriedade que não entra no JSON
  const jornada = { listarBruto: async p => {
    chamadas.push(p);
    const itens = [{ lead_id: 'j1', chegou_em: '2026-11-10T15:00:00Z' }];
    Object.defineProperty(itens, 'estado', { value: { respostas: 'sem_registro', respostas_texto: 'Desde 30/09 o sistema não registra o que a oficina responde.' }, enumerable: false });
    return itens;
  } };
  const f = F.criarFonte({ sb, agora: relogio(), jornada });
  const r = await f.contatos({ de: '2026-11-01', ate: '2026-11-19' });
  assert.deepEqual(r.itens, [{ lead_id: 'j1', chegou_em: '2026-11-10T15:00:00Z' }]);
  assert.equal(r.reserva, false);
  assert.deepEqual(r.estado, { respostas: 'sem_registro', respostas_texto: 'Desde 30/09 o sistema não registra o que a oficina responde.' });
  // assinatura do contrato (de, ate, sb) e mais o relógio e o pedido de leitura nova
  assert.deepEqual(Object.keys(chamadas[0]).sort(), ['agora', 'ate', 'de', 'fresco', 'sb']);
  assert.deepEqual([chamadas[0].de, chamadas[0].ate, chamadas[0].agora, chamadas[0].fresco], ['2026-11-01', '2026-11-19', AGORA, false]);
  assert.equal(chamadas[0].sb, sb);
  await f.contatos({ de: '2026-11-01', ate: '2026-11-19' });
  assert.equal(chamadas.length, 1, 'memória curta também para os contatos');
  await f.contatos({ de: '2026-11-01', ate: '2026-11-19' }, { fresco: true });
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[1].fresco, true, 'pedido de leitura nova chega até a jornada');

  const quebrada = F.criarFonte({ sb, agora: relogio(), jornada: { listarBruto: async () => { throw new Error('column leads.origem_paga does not exist'); } } });
  const q = await calado(() => quebrada.contatos({ de: '2026-11-01', ate: '2026-11-19' }));
  assert.equal(q.reserva, true);
  assert.deepEqual(q.itens.map(i => i.lead_id), ['l1']);
  assert.deepEqual(quebrada.falhas(), ['jornada']);

  const semJornada = F.criarFonte({ sb, agora: relogio(), jornada: null });
  const s = await semJornada.contatos({ de: '2026-11-01', ate: '2026-11-19' });
  assert.equal(s.reserva, true);
  assert.equal(s.estado, null);
  assert.equal(s.itens[0].desfecho.valor, 750);
  assert.deepEqual(semJornada.falhas(), []);

  const semNada = F.criarFonte({ sb: criarBanco({}), agora: relogio(), jornada: null });
  await assert.rejects(semNada.contatos({ de: '2026-11-01', ate: '2026-11-19' }), e => e instanceof F.FalhaDeLeitura && e.message === 'não foi possível ler os contatos');
});

test('reserva da jornada: o contato do CRM no formato do contrato, só com o que o status garante', () => {
  const origemDoContato = l => ({ canal: l.origem_paga ? 'meta' : 'desconhecida', paga: l.origem_paga === true ? true : null, rotulo: 'x', detalhe: null, campanha: null, conjunto: null, anuncio: null, palavra_chave: null, como: null, como_rotulo: null, certeza: 'nenhuma' });
  const base = { id: 'l1', nome: '  Marcos Silva ', telefone: '(12) 99123-4567', status: 'novo', servico: 'Freios', carro_modelo: 'Onix 2019', created_at: '2026-11-10T15:00:00Z', updated_at: '2026-11-11T15:00:00Z' };
  const item = l => Reserva.itemDoLead(l, { origemDoContato, agora: AGORA });

  const novo = item(base);
  assert.deepEqual(Object.keys(novo), ['lead_id', 'nome', 'telefone_final', 'carro', 'servico', 'chegou_em', 'cliente_novo', 'origem', 'etapas', 'etapa_atual', 'desfecho', 'responsavel', 'pendencias', 'espera_min']);
  assert.deepEqual([novo.nome, novo.telefone_final, novo.carro, novo.etapa_atual, novo.desfecho.tipo, novo.desfecho.parado_dias, novo.espera_min], ['Marcos Silva', '4567', 'Onix 2019', 'contato', 'aberto', 8, null]);
  assert.deepEqual(novo.pendencias, ['sem_origem']);
  // a reserva não lê as conversas: a resposta da oficina fica DESCONHECIDA (não afirma que respondeu nem que deixou de responder)
  assert.deepEqual(novo.etapas.find(e => e.id === 'respondido'), { id: 'respondido', em: null, minutos: null, desconhecido: true });
  const certas = i => i.etapas.filter(e => !e.desconhecido).map(e => e.id);

  const fechou = item({ ...base, status: 'concluido', valor_pago: '750.00', closed_at: '2026-11-12T20:00:00Z', origem_paga: true });
  assert.deepEqual(certas(fechou), ['contato', 'veio', 'fechou']);
  assert.equal(fechou.etapa_atual, 'fechou');
  assert.deepEqual(fechou.desfecho, { tipo: 'fechou', valor: 750, valor_fonte: 'manual', motivo: null, motivo_rotulo: null, obs: null, em: '2026-11-12T20:00:00Z', parado_dias: null });
  assert.deepEqual(fechou.pendencias, []);

  const semValor = item({ ...base, status: 'concluido', valor_pago: 0, origem_paga: true });
  assert.equal(semValor.desfecho.valor, null, 'valor zero é "não lançaram", não é serviço de graça');
  assert.deepEqual(semValor.pendencias, ['sem_valor']);

  const perdeu = item({ ...base, status: 'perdido', origem_paga: true });
  assert.deepEqual([perdeu.desfecho.tipo, perdeu.desfecho.motivo, perdeu.pendencias], ['nao_fechou', null, ['sem_motivo']]);
  const caro = item({ ...base, status: 'perdido', motivo_perda: 'caro', origem_paga: true });
  assert.deepEqual([caro.pendencias, caro.desfecho.motivo, caro.desfecho.motivo_rotulo], [[], 'caro', 'Achou caro']);
  assert.equal(item({ ...base, status: 'perdido', motivo_perda: 'inventado', origem_paga: true }).desfecho.motivo, null, 'motivo fora da lista não passa');

  assert.deepEqual(certas(item({ ...base, status: 'agendado' })), ['contato', 'agendou']);
  assert.deepEqual(certas(item({ ...base, status: 'em_servico' })), ['contato', 'veio', 'oficina']);
  assert.equal(item({ ...base, status: 'em_servico' }).etapa_atual, 'oficina');
  assert.equal(item({ ...base, nome: null, telefone: null }).nome, 'Sem nome');
  assert.equal(item({ ...base, nome: null, telefone: null }).telefone_final, null);
});
