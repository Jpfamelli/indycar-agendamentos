'use strict';
/* Rodada 8 (frente T2a) — GET /api/hoje montado pelo motor (motor/hoje.js) com banco de mentira e jornada dublê:
   a situação de hoje (sem conta de anúncio, WhatsApp parado desde 30/09), demonstração isolada, retorno,
   falta de valor, filtro de plataforma, "o que fazer agora", leitura que falha e desempenho. Sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');

const Hoje = require('../motor/hoje');
const T = require('../motor/texto');
const D = require('./apoio/trafego-dados');

const q = (s = '') => new URLSearchParams(s);
const limpo = r => { assert.deepEqual(T.naoFinitos(r), [], 'nada de NaN/Infinity'); assert.deepEqual(T.textosRuins(r), [], 'texto de tela limpo'); };

/** Métricas reais de novembro: Meta 10 dias × R$ 50, Google 5 dias × R$ 40, mais demonstração que não pode entrar. */
function metricasReais() {
  const linhas = [];
  for (let d = 1; d <= 10; d++) linhas.push(D.metrica(`m${d}`, { data: `2026-11-${String(d).padStart(2, '0')}`, gasto: 50 }));
  for (let d = 1; d <= 5; d++) linhas.push(D.metrica(`g${d}`, { plataforma: 'google', campanha_ext: 'g1', campanha_nome: 'Freios Taubaté', data: `2026-11-0${d}`, gasto: 40 }));
  linhas.push(D.metrica('demo-nov', { data: '2026-11-02', fonte: 'demo', gasto: 9999 }));
  return linhas;
}
const contaMetaLigada = [{ canal: 'meta', ativo: true, meta_access_token: 'segredo-que-nao-sai', ultimo_sync_em: '2026-11-19T11:00:00Z', ultimo_sync_status: 'ok', meta_token_expira_em: '2027-01-30T00:00:00Z' }];

test('situação de hoje: sem conta ligada, gasto null, frase sem_conta e o WhatsApp parado no topo do que fazer', async () => {
  const { fonte, sb, jornada } = D.fonteDeTeste();
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.deepEqual(r.periodo, { de: '2026-11-01', ate: '2026-11-19', rotulo: 'Este mês', anterior: { de: '2026-10-01', ate: '2026-10-19' } });
  assert.equal(r.estado.gasto, 'sem_conta');
  assert.equal(r.estado.demo, false, 'demonstração de agosto não liga o modo demonstração em novembro');
  assert.equal(r.estado.valores, 'faltam');
  assert.equal(r.estado.origem, 'parcial');
  assert.equal(r.frase.tipo, 'sem_conta');
  assert.equal(r.frase.texto, '6 contatos novos neste mês. 4 vieram de anúncio.');
  assert.deepEqual(r.frase.acao, { rotulo: 'Ligar conta de anúncios', ir: 'ajustes?secao=conexoes' });

  assert.deepEqual(r.numeros.map(n => n.id), ['investido', 'contatos', 'fechados', 'faturado']);
  const [investido, contatos, fechados, faturado] = r.numeros;
  assert.equal(investido.valor, null, 'gasto nunca é inventado');
  assert.deepEqual(investido.serie, []);
  assert.equal(investido.apoio, 'Conta de anúncios não ligada');
  assert.deepEqual([contatos.valor, contatos.antes, contatos.apoio], [6, 1, '4 de anúncio']);
  assert.equal(contatos.serie.length, 19, 'um ponto por dia do período');
  assert.equal(fechados.valor, 2);
  assert.equal(faturado.valor, 420, 'serviço sem valor fica de fora da soma, não vira zero');

  assert.equal(r.derivados.custo_por_contato, null);
  assert.equal(r.derivados.custo_por_servico, null);
  assert.equal(r.derivados.retorno, null);
  assert.equal(r.derivados.tempo_resposta_min, null, 'sem resposta registrada não há tempo de resposta');
  assert.equal(r.derivados.ticket_medio, 420);

  assert.ok(r.fazer.length >= 1 && r.fazer.length <= Hoje.MAX_FAZER);
  assert.deepEqual(r.fazer[0], { id: 'whatsapp_parado', gravidade: 'alta', origem: 'conexao',
    titulo: 'O WhatsApp automático está parado desde 30/09',
    porque: 'Lembretes e respostas não estão saindo. Só o dono da conta consegue gerar a chave nova.',
    acao: { rotulo: 'Abrir o Atendimento', ir: '/atendimento/?aba=integracoes' } });
  assert.ok(!r.fazer.some(f => f.origem === 'radar'), 'alerta de 13/08 (demonstração) não é "o que fazer agora"');
  assert.ok(!r.fazer.some(f => f.id === 'sem_resposta'), 'com o WhatsApp parado não dá para dizer quem espera');
  assert.deepEqual(r.fazer.map(f => f.id).slice(1, 4), ['sem_valor', 'sem_origem', 'sem_motivo']);

  assert.equal(r.funil.etapas.length, 7);
  assert.equal(r.funil.etapas[1].total, null, 'há contato com resposta desconhecida');
  assert.deepEqual(r.funil.nao_fecharam, { total: 2, motivos: [{ id: 'caro', rotulo: 'Achou caro', n: 1 }], sem_motivo: 1 });
  assert.deepEqual(r.origens.map(o => o.id), ['meta', 'google', 'desconhecida', 'indicacao'], 'pagas primeiro');
  assert.ok(r.origens.every(o => o.gasto === null && o.custo_por_contato === null && o.retorno === null));
  assert.deepEqual(r.hoje.map(h => [h.lead_id, h.hora, h.espera_min]), [['lead-06', '08:20', 100]]);

  assert.equal(r.agenda.dias.length, 7);
  assert.equal(r.agenda.situacao, 'vazia');
  assert.equal(r.ritmo.situacao, 'sem_meta');
  assert.equal(r.ritmo.gasto_ate_hoje, null);
  assert.equal(r.ritmo.dias.length, 19);
  assert.ok(r.ritmo.dias.every(d => d.gasto === null));
  assert.deepEqual(Object.keys(r.conexoes), ['meta', 'google', 'site', 'whatsapp']);
  assert.equal(r.conexoes.whatsapp.situacao, 'chave_recusada');
  assert.equal(r.conexoes.meta.situacao, 'nunca_ligou');
  assert.doesNotMatch(JSON.stringify(r), /segredo|api_key|access_token/);

  // uma consulta por tabela, nunca por contato; a jornada pedida uma vez por janela
  assert.equal(sb.idas(), 12);
  assert.deepEqual(jornada.chamadas.map(c => `${c.de}..${c.ate}`).sort(), ['2026-10-01..2026-10-19', '2026-11-01..2026-11-19']);
  const de_novo = await Hoje.responder({ q: q(), fonte });
  assert.equal(sb.idas(), 12, 'dentro de 30 s a resposta sai da memória');
  assert.equal(de_novo, r);
});

test('demonstração isolada: só demonstração no período liga estado.demo e não entra em conta com dado da oficina', async () => {
  const tabelas = D.tabelasDeHoje({ ads_metricas_dia: [D.metrica('d1', { data: '2026-11-03', fonte: 'demo', gasto: 120 }), D.metrica('d2', { data: '2026-11-04', fonte: 'demo', gasto: 80 })] });
  const { fonte } = D.fonteDeTeste({ tabelas });
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.estado.demo, true);
  assert.equal(r.estado.gasto, 'demo');
  assert.equal(r.numeros[0].valor, 200);
  assert.equal(r.numeros[0].apoio, 'Número de demonstração');
  assert.deepEqual([r.derivados.custo_por_contato, r.derivados.custo_por_servico, r.derivados.retorno], [null, null, null]);
  assert.notEqual(r.frase.tipo, 'retorno', 'demonstração não promete retorno');
  assert.match(r.frase.apoio, /demonstração/);
  const meta = r.origens.find(o => o.id === 'meta');
  assert.equal(meta.custo_por_contato, null);
  assert.equal(meta.retorno, null);
});

test('havendo dado real em qualquer lugar da tabela, linha de demonstração não entra em soma nenhuma', async () => {
  const tabelas = D.tabelasDeHoje({ ads_metricas_dia: metricasReais(), integracoes_ads: contaMetaLigada });
  const { fonte } = D.fonteDeTeste({ tabelas });
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.estado.gasto, 'real');
  assert.equal(r.estado.demo, false);
  assert.equal(r.numeros[0].valor, 700, '500 da Meta + 200 do Google, sem os 9.999 de demonstração');
  assert.equal(r.numeros[0].apoio, 'Meta R$ 500 · Google R$ 200');
  assert.equal(r.ritmo.gasto_ate_hoje, 700);
  // período antigo que só tem demonstração também fica sem gasto
  const { fonte: f2 } = D.fonteDeTeste({ tabelas: D.tabelasDeHoje({ ads_metricas_dia: [...metricasReais(), ...D.tabelasDeHoje().ads_metricas_dia] }) });
  const agosto = await D.calado(() => Hoje.responder({ q: q('de=2026-08-01&ate=2026-08-31'), fonte: f2 }));
  assert.equal(agosto.numeros[0].valor, null);
  assert.equal(agosto.estado.gasto, 'sem_dados');
});

test('retorno: gasto real e serviço de anúncio com valor; o serviço sem valor vira aviso e ação', async () => {
  const tabelas = D.tabelasDeHoje({ ads_metricas_dia: metricasReais(), integracoes_ads: contaMetaLigada, ads_config: [{ id: true, orcamento_mensal: 1500, extras: {} }] });
  const { fonte } = D.fonteDeTeste({ tabelas });
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.frase.tipo, 'retorno');
  assert.equal(r.frase.texto, `Cada R$ 1 em anúncio virou ${T.brl(420 / 700)} na oficina.`);
  assert.match(r.frase.apoio, /^R\$ 700 investidos, R\$ 420 em serviços fechados que vieram de anúncio\. Falta o valor de 1 serviço/);
  assert.deepEqual(r.frase.acao, { rotulo: 'Lançar valores', ir: 'jornada?pendencia=sem_valor' });
  assert.equal(r.derivados.custo_por_contato, 175, 'R$ 700 / 4 contatos de anúncio');
  assert.equal(r.derivados.custo_por_servico, 350);
  assert.equal(r.derivados.retorno, 0.6);
  const meta = r.origens.find(o => o.id === 'meta');
  assert.deepEqual([meta.gasto, meta.custo_por_contato, meta.retorno], [500, T.arredondar(500 / 3), T.arredondar(420 / 500)]);
  assert.equal(r.ritmo.orcamento_mes, 1500);
  assert.ok(['acima', 'no_ritmo', 'abaixo'].includes(r.ritmo.situacao));
  assert.equal(r.fazer.find(f => f.id === 'sem_valor').gravidade, 'alta', 'com gasto real, valor faltando pesa mais');
});

test('falta_valor: gasto real e nenhum serviço de anúncio com valor', async () => {
  const itens = D.contatosDeHoje().map(i => (i.lead_id === 'lead-01' ? { ...i, desfecho: { ...i.desfecho, valor: null }, pendencias: ['sem_valor'] } : i));
  const { fonte } = D.fonteDeTeste({ tabelas: D.tabelasDeHoje({ ads_metricas_dia: metricasReais(), integracoes_ads: contaMetaLigada }), itens });
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.frase.tipo, 'falta_valor');
  assert.equal(r.frase.texto, 'R$ 700 investidos trouxeram 4 contatos. Falta lançar o valor de 2 serviços para saber o retorno.');
  assert.equal(r.derivados.retorno, null);
  assert.equal(r.numeros[3].valor, null, 'fechou e nenhum valor: faturado null, não zero');
});

test('?plataforma=google: contatos e gasto só do Google; plataforma ou período inválidos viram 400', async () => {
  const { fonte } = D.fonteDeTeste({ tabelas: D.tabelasDeHoje({ ads_metricas_dia: metricasReais(), integracoes_ads: contaMetaLigada }) });
  const r = await D.calado(() => Hoje.responder({ q: q('plataforma=google'), fonte }));
  limpo(r);
  assert.equal(r.plataforma, 'google');
  assert.equal(r.numeros[0].valor, 200);
  assert.equal(r.numeros[1].valor, 1);
  assert.deepEqual(r.origens.map(o => o.id), ['google']);
  assert.throws(() => Hoje.responder({ q: q('plataforma=tiktok'), fonte }), e => e.status === 400 && /meta ou google/.test(e.message));
  assert.throws(() => Hoje.responder({ q: q('periodo=ano'), fonte }), e => e.status === 400);
  assert.throws(() => Hoje.responder({ q: q('de=2026-11-10&ate=2026-11-01'), fonte }), e => e.status === 400);
});

test('o que fazer: no máximo 6, por gravidade; contato esperando só com WhatsApp ok, respostas registradas e oficina aberta', () => {
  const wOk = { situacao: 'ok', ligado: true };
  const esperando = [D.item(1, { canal: 'meta', espera_min: 95 }), D.item(2, { canal: 'meta', espera_min: 40 }), D.item(3, { canal: 'site', espera_min: 400 })];
  const itens = [D.item(4, { desfecho: 'fechou', etapas: ['contato', 'fechou'] }), D.item(5, { canal: 'desconhecida' }), D.item(6, { desfecho: 'nao_fechou' })];
  const alertas = [
    { id: 'a1', regra_nome: 'Custo por contato alto', severidade: 'critico', plataforma: 'meta', mensagem: 'O custo por contato subiu 60%.', criado_em: '2026-11-18T10:00:00Z' },
    { id: 'a2', regra_nome: 'Contatos sem resposta', severidade: 'alerta', metrica: 'ciclo_sem_resposta', mensagem: 'Três contatos sem resposta.', criado_em: '2026-11-18T09:00:00Z' },
  ];
  const conexoes = { whatsapp: wOk, meta: { situacao: 'token_vencendo', aviso: 'O acesso da Meta vence em 5 dias.' }, google: { situacao: 'nunca_ligou' } };
  const agenda = { situacao: 'cheia', leitura: 'Sexta está quase cheia.' };
  const base = { agora: D.AGORA, conexoes, alertas, itens, esperando, estadoGasto: 'real', respostas: 'ok', agenda, jaTeveNumero: true };

  const f = Hoje.oQueFazer(base);
  assert.equal(f.length, 6);
  assert.deepEqual(f.map(x => x.id), ['sem_resposta', 'radar_a1', 'sem_valor', 'radar_a2', 'conexao_meta', 'sem_origem']);
  assert.equal(f[0].titulo, '2 contatos de anúncio esperando resposta');
  assert.equal(f[0].porque, 'O mais antigo espera há 2 h. Quem responde rápido fecha mais.');
  for (const x of f) assert.ok(['alta', 'media', 'baixa'].includes(x.gravidade) && x.acao && x.acao.ir);

  const noite = Hoje.oQueFazer({ ...base, agora: Date.parse('2026-11-19T23:30:00Z') });
  assert.ok(!noite.some(x => x.id === 'sem_resposta'), 'fora do horário de trabalho ninguém cobra resposta');
  const semRegistro = Hoje.oQueFazer({ ...base, respostas: 'sem_registro' });
  assert.ok(!semRegistro.some(x => x.id === 'sem_resposta'));
  const semConta = Hoje.oQueFazer({ ...base, estadoGasto: 'sem_conta', jaTeveNumero: false });
  assert.deepEqual(semConta.filter(x => x.origem === 'radar').map(x => x.id), ['radar_a2'], 'sem gasto real só vale alerta do lado da oficina');
  assert.ok(!semConta.some(x => x.id === 'agenda_cheia'), 'agenda cheia só pede para segurar verba quando há verba');
});

test('leitura secundária que falha não derruba: estado.incompleto e aviso; métrica que falha vira FalhaDeLeitura', async () => {
  const { fonte } = D.fonteDeTeste({ opcoesBanco: { falhas: { ads_alertas: 'timeout', consultores: 'timeout' } } });
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.deepEqual(r.estado.incompleto, ['agenda_capacidade', 'alertas']);
  assert.equal(r.estado.aviso, 'Não deu para ler agora: a agenda e os alertas.');
  assert.ok(r.agenda.dias.every(d => d.ocupacao === null), 'sem os consultores a ocupação fica null');

  const { fonte: quebrada } = D.fonteDeTeste({ opcoesBanco: { falhas: { ads_metricas_dia: 'connection refused' } } });
  await assert.rejects(D.calado(() => Hoje.responder({ q: q(), fonte: quebrada })), e => e.name === 'FalhaDeLeitura');
});

test('jornada que falha: a reserva (cadastro) entra e a resposta avisa', async () => {
  const jornada = { listarBruto: async () => { throw new Error('quebrou'); } };
  const { fonte } = D.fonteDeTeste({ jornada, tabelas: D.tabelasDeHoje({ leads: [] }) });
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.estado.reserva, true);
  assert.match(r.estado.aviso, /só do cadastro/);
  assert.ok(r.estado.incompleto.includes('jornada'));
});

test('desempenho: 1.000 contatos e 90 dias de métricas em menos de 1,5 s, sem consulta por contato', async () => {
  const canais = ['meta', 'google', 'site', 'indicacao', 'whatsapp', 'desconhecida'];
  const itens = Array.from({ length: 1000 }, (_, n) => {
    const dia = `2026-${n % 2 ? '11' : '10'}-${String(1 + (n % 19)).padStart(2, '0')}`;
    const canal = canais[n % canais.length];
    const fechou = n % 5 === 0;
    return D.item(n, { dia, hora: `${String(8 + (n % 9)).padStart(2, '0')}:15`, canal, campanha: canal === 'meta' ? { ext: `c${n % 4}`, nome: `Campanha ${n % 4}` } : null,
      etapas: fechou ? ['contato', 'respondido', 'agendou', 'veio', 'fechou'] : ['contato', 'respondido'], minutos: n % 50, desfecho: fechou ? 'fechou' : (n % 7 === 0 ? 'nao_fechou' : 'aberto'),
      valor: fechou && n % 3 ? 300 + n : null, motivo: n % 14 === 0 ? 'caro' : null });
  });
  const linhas = [];
  for (let d = 0; d < 90; d++) {
    const data = new Date(Date.parse('2026-08-22T12:00:00Z') + d * 86400000).toISOString().slice(0, 10);
    for (let c = 0; c < 6; c++) linhas.push(D.metrica(`p${d}-${c}`, { data, plataforma: c < 4 ? 'meta' : 'google', campanha_ext: `c${c}`, gasto: 20 + c }));
  }
  const { fonte, sb } = D.fonteDeTeste({ itens, tabelas: D.tabelasDeHoje({ ads_metricas_dia: linhas, integracoes_ads: contaMetaLigada, ads_config: [{ id: true, orcamento_mensal: 3000, extras: {} }] }) });
  const t0 = performance.now();
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  const ms = performance.now() - t0;
  limpo(r);
  assert.ok(ms < 1500, `levou ${Math.round(ms)} ms`);
  assert.equal(r.numeros[1].valor, itens.filter(i => i.chegou_em >= '2026-11-01').length);
  assert.ok(sb.idas() <= 15, `foram ${sb.idas()} consultas`);
  assert.ok(r.ritmo.projecao != null, 'com gasto real desde o dia 1º o núcleo projeta o mês');
});
