'use strict';
/* Rodada 10 (segurança do servidor): rotas da tela antiga fechadas, corpo do pedido lido em bytes,
   teto das metas, tentativas de chave de rotina e erro de biblioteca que não vaza. */
process.env.ADS_CRON_TOKEN = 'chave-de-teste-r10';
delete process.env.TRAFEGO_TELA_ANTIGA;
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const coletor = require('../coletor');
const Radar = require('../radar');
const relatorio = require('../relatorio');
const whatsapp = require('../whatsapp');
const { ctxRotas } = require('../server');
const { subir } = require('./apoio/r10-http');

let app;
const chamadas = [];
const salvas = [];
const orig = { sincronizar: coletor.sincronizar, testar: coletor.testarConexoes, popular: coletor.popularDemo, apagar: db.apagarDemo, rodar: Radar.rodar,
  gerar: relatorio.gerarEEnviar, enviar: whatsapp.enviarParaTodos, lerConfig: db.lerConfig, salvarConfig: db.salvarConfig, lerIntegracoes: db.lerIntegracoes,
  listarRegras: db.listarRegras, salvarRegra: db.salvarRegra, apagarRegra: db.apagarRegra };

test.before(async () => {
  const anota = nome => async (...a) => { chamadas.push(nome); return nome === 'enviar' ? a[0].map(d => ({ destino: d, ok: true })) : { ok: true, alertas: [] }; };
  coletor.sincronizar = anota('sincronizar'); coletor.testarConexoes = anota('testar'); coletor.popularDemo = anota('popular');
  db.apagarDemo = anota('apagar'); Radar.rodar = anota('radar'); relatorio.gerarEEnviar = anota('relatorio'); whatsapp.enviarParaTodos = anota('enviar');
  db.listarRegras = async () => { chamadas.push('regras'); return []; };
  db.salvarRegra = anota('salvarRegra'); db.apagarRegra = anota('apagarRegra');
  db.lerConfig = async () => ({ whatsapp_destinos: ['5512990001234'], margem_pct: 45, orcamento_mensal: 3000 });
  db.salvarConfig = async v => { salvas.push(v); return v; };
  db.lerIntegracoes = async () => [];
  // rotas só deste teste: devolver o corpo lido e simular um erro de biblioteca com "status"
  ctxRotas.rota('POST', '/api/_r10/eco', async ({ corpo }) => ({ veio: await corpo() }));
  ctxRotas.rota('GET', '/api/_r10/erro-de-biblioteca', async () => { throw Object.assign(new Error('401 invalid x-api-key sk-interna-123'), { status: 401 }); });
  app = await subir();
});
test.after(async () => {
  Object.assign(coletor, { sincronizar: orig.sincronizar, testarConexoes: orig.testar, popularDemo: orig.popular });
  Object.assign(db, { apagarDemo: orig.apagar, lerConfig: orig.lerConfig, salvarConfig: orig.salvarConfig, lerIntegracoes: orig.lerIntegracoes,
    listarRegras: orig.listarRegras, salvarRegra: orig.salvarRegra, apagarRegra: orig.apagarRegra });
  Radar.rodar = orig.rodar; relatorio.gerarEEnviar = orig.gerar; whatsapp.enviarParaTodos = orig.enviar;
  await app.fechar();
});

const QUE_GRAVAM = [['/api/sync', { dias: 7 }], ['/api/testar-conexoes', {}], ['/api/demo', { dias: 30 }], ['/api/radar', { enviar: true }],
  ['/api/relatorio', { enviar: true }], ['/api/whatsapp/testar', {}], ['/api/fechamento/enviar', {}], ['/api/regras', { nome: 'x' }],
  ['/api/metas', { mes: '2026-11', leads: 10 }], ['/api/semanal', {}], ['/api/ia/leitura', {}], ['/api/integracoes/testar', { canal: 'meta' }],
  ['/api/eu', { nome: 'Outro Nome' }], ['/api/eu/senha-trocada', {}], ['/api/alertas/lidos', { ids: [] }]];
const QUE_LEEM = ['/api/saude', '/api/painel', '/api/ranking', '/api/mes', '/api/leads', '/api/leads.csv', '/api/resultados', '/api/regras', '/api/alertas',
  '/api/relatorios', '/api/fila', '/api/whatsapp/status', '/api/acoes', '/api/ligacao', '/api/preparo', '/api/fechamento', '/api/historico?entidade=c1', '/api/metas', '/api/oficina-agora'];

test('rotas da tela antiga: fechadas enquanto a tela antiga está desligada (nada roda, nada sai)', async () => {
  chamadas.length = 0;
  for (const [caminho, corpo] of QUE_GRAVAM) {
    const r = await app.pedir(caminho, { metodo: 'POST', corpo });
    assert.equal(r.status, 404, caminho);
    assert.equal(r.json.codigo, 'tela_antiga', caminho);
  }
  assert.equal((await app.pedir('/api/regras?id=11111111-1111-4111-8111-111111111111', { metodo: 'DELETE' })).status, 404);
  for (const caminho of QUE_LEEM) {
    const r = await app.pedir(caminho);
    assert.equal(r.status, 404, caminho);
    assert.equal(r.json.codigo, 'tela_antiga', caminho);
  }
  assert.deepEqual(chamadas, [], 'nenhuma coleta, radar, relatório, envio ou regra rodou');
});

test('rotas que a tela nova usa continuam abertas: metas, acessos e quem sou eu', async () => {
  assert.equal((await app.pedir('/api/config')).status, 200);
  assert.equal((await app.pedir('/api/integracoes')).status, 200);
  assert.equal((await app.pedir('/api/eu')).status, 200);
  assert.equal((await app.pedir('/api/eu', { papel: 'fora' })).status, 200, 'quem não tem o app ainda descobre quem é');
  assert.equal((await app.pedir('/api/ping', { papel: null })).status, 200);
});

test('com TRAFEGO_TELA_ANTIGA=1 as rotas antigas voltam (a mesma chave que religa a tela antiga)', async () => {
  process.env.TRAFEGO_TELA_ANTIGA = '1';
  try {
    chamadas.length = 0;
    assert.equal((await app.pedir('/api/sync', { metodo: 'POST', corpo: { dias: 7 } })).status, 200);
    assert.equal((await app.pedir('/api/regras')).status, 200);
    assert.deepEqual(chamadas, ['sincronizar', 'regras']);
  } finally { delete process.env.TRAFEGO_TELA_ANTIGA; }
});

test('corpo do pedido: letra com acento partida entre dois pacotes chega inteira', async () => {
  const corpo = Buffer.from(JSON.stringify({ nota: 'troca de óleo e revisão do câmbio' }), 'utf8');
  const corte = corpo.indexOf(0xc3) + 1;   // no meio do "ó" (c3 b3)
  const cabeca = `POST /api/_r10/eco HTTP/1.1\r\nHost: x\r\nx-papel: admin\r\nContent-Type: application/json\r\nContent-Length: ${corpo.length}\r\nConnection: close\r\n\r\n`;
  const resposta = await app.cru([cabeca, corpo.subarray(0, corte), corpo.subarray(corte)]);
  assert.match(resposta, /^HTTP\/1\.1 200/);
  assert.ok(resposta.includes('troca de óleo e revisão do câmbio'), 'o texto voltou sem letra trocada: ' + resposta.slice(-120));
});

test('corpo do pedido: o teto de 1 MB conta bytes (texto acentuado sem tamanho anunciado não passa com 1,05 MB)', async () => {
  const pedaco = Buffer.from('ã'.repeat(35_000), 'utf8');   // 70 kB por pedaço, 35 mil letras
  const partes = [`POST /api/_r10/eco HTTP/1.1\r\nHost: x\r\nx-papel: admin\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n`];
  const abre = Buffer.from('{"nota":"');
  partes.push(Buffer.concat([Buffer.from(abre.length.toString(16) + '\r\n'), abre, Buffer.from('\r\n')]));
  for (let i = 0; i < 15; i++) partes.push(Buffer.concat([Buffer.from(pedaco.length.toString(16) + '\r\n'), pedaco, Buffer.from('\r\n')]));
  // 1,05 MB já foram: o servidor tem de recusar aqui. Só se ele ficar esperando (o defeito antigo) o pedido é fechado.
  partes.push(600, Buffer.from('2\r\n"}\r\n0\r\n\r\n'));
  const resposta = await app.cru(partes, { pausa: 5 });
  assert.match(resposta, /^HTTP\/1\.1 413/, resposta.slice(0, 80));
});

test('metas: número absurdo ou que não é número é recusado antes de chegar ao banco', async () => {
  salvas.length = 0;
  for (const corpo of [{ orcamento_mensal: 1e12 }, { ticket_medio: 5e8 }, { cpa_alvo: true }, { roas_alvo: [5] }, { cpa_alvo: {} }, { orcamento_mensal: '1e400' }]) {
    const r = await app.pedir('/api/config', { metodo: 'POST', corpo });
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.match(r.json.erro, /número/, JSON.stringify(corpo));
  }
  assert.equal(salvas.length, 0, 'nada foi gravado');
  const bom = await app.pedir('/api/config', { metodo: 'POST', corpo: { orcamento_mensal: '3500,50', ticket_medio: 480 } });
  assert.equal(bom.status, 200);
  assert.deepEqual(salvas[0], { orcamento_mensal: 3500.5, ticket_medio: 480 }, 'vírgula de centavos é aceita');
});

test('chave das rotinas: depois de 10 chaves erradas do mesmo endereço, a porta fecha por 10 minutos', async () => {
  app.limitador.limpar();
  const de = { 'cf-connecting-ip': '203.0.113.77' };
  for (let i = 0; i < 10; i++) {
    const r = await app.pedir('/api/cron/sync', { papel: null, cabecalhos: { ...de, 'x-cron-chave': 'errada-' + i } });
    assert.equal(r.status, 401, 'tentativa ' + i);
  }
  chamadas.length = 0;
  const bloqueado = await app.pedir('/api/cron/sync', { papel: null, cabecalhos: { ...de, 'x-cron-chave': 'chave-de-teste-r10' } });
  assert.equal(bloqueado.status, 429);
  assert.ok(Number(bloqueado.cabecalhos.get('retry-after')) > 0);
  assert.deepEqual(chamadas, [], 'nem a chave certa roda a rotina durante o bloqueio');
  const rotaNova = await app.pedir('/api/cron/medir', { papel: null, cabecalhos: { ...de, 'x-cron-chave': 'errada' } });
  assert.equal(rotaNova.status, 429, 'vale também para as rotinas registradas em rotas/');
  const outro = await app.pedir('/api/cron/sync', { papel: null, cabecalhos: { 'cf-connecting-ip': '203.0.113.78', 'x-cron-chave': 'chave-de-teste-r10' } });
  assert.equal(outro.status, 200, 'outro endereço com a chave certa segue normal');
});

test('erro de biblioteca com "status" (ex.: 401 da IA) não vira 401 na tela nem mostra o texto interno', async () => {
  const r = await app.pedir('/api/_r10/erro-de-biblioteca');
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.texto, /sk-interna|x-api-key/);
  assert.ok(r.json.pedido, 'leva o número do pedido para achar no log');
});
