'use strict';
/* Rodada 8 (frente T2a) — o que o servidor escreve no log para achar defeito em produção:
   identificador do pedido (o da Central, quando ela mandou), duração por etapa quando o pedido
   passa de 1 s, e erro com contexto e sem dado pessoal. */
const test = require('node:test');
const assert = require('node:assert/strict');

const Registro = require('../registro');

const resDeMentira = (cabecalhos = {}) => {
  const c = Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), v]));
  return { getHeader: n => c[n.toLowerCase()], setHeader: (n, v) => { c[n.toLowerCase()] = v; }, cabecalhos: c };
};

test('identificador do pedido: vale o que a Central já pôs na resposta; senão o do cabeçalho; senão um novo', () => {
  const daCentral = resDeMentira({ 'X-Request-Id': 'central-123456' });
  assert.equal(Registro.idDoPedido({ headers: { 'x-request-id': 'outro-abcdef' } }, daCentral), 'central-123456');

  const sozinho = resDeMentira();
  assert.equal(Registro.idDoPedido({ headers: { 'x-request-id': 'proxy-abcdef12' } }, sozinho), 'proxy-abcdef12');
  assert.equal(sozinho.cabecalhos['x-request-id'], 'proxy-abcdef12', 'a resposta leva o identificador');

  const novo = resDeMentira();
  const id = Registro.idDoPedido({ headers: {} }, novo);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(novo.cabecalhos['x-request-id'], id);
});

test('identificador do pedido: cabeçalho comprido, com espaço ou com quebra de linha é ignorado', () => {
  for (const ruim of ['a'.repeat(65), 'tem espaço aqui', 'x\r\nSet-Cookie: a=b', 'curto', '<script>']) {
    const res = resDeMentira();
    const id = Registro.idDoPedido({ headers: { 'x-request-id': ruim } }, res);
    assert.match(id, /^[0-9a-f-]{36}$/, ruim);
  }
});

test('limpar: telefone, e-mail, CPF e chave não vão para o log; o resto da frase fica', () => {
  const s = Registro.limpar('duplicate key (telefone)=(5512974032299) para joao.silva@gmail.com, cpf 123.456.789-09, token EAAGm0PX4ZCpsBAKZAabc123def456ghi789jkl e Bearer ica_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd');
  assert.doesNotMatch(s, /5512974032299|joao\.silva|123\.456\.789-09|EAAGm0PX4ZCps|ica_AbCd/);
  assert.match(s, /duplicate key/);
  assert.match(s, /telefone/);
  assert.ok(Registro.limpar('x'.repeat(2000)).length <= 400, 'frase longa é cortada');
  assert.equal(Registro.limpar(null), '');
  assert.equal(Registro.limpar('relation "ads_config" does not exist'), 'relation "ads_config" does not exist');
});

test('evento: uma linha em JSON com nome estável, sem campo vazio e com texto limpo', () => {
  const linhas = [];
  Registro.evento('warn', 'pedido_lento', { id: 'abc-123456', rota: '/api/hoje', ms: 1520, erro: 'falhou para 12974032299', nada: undefined, nulo: null }, { escrever: l => linhas.push(l) });
  assert.equal(linhas.length, 1);
  const o = JSON.parse(linhas[0]);
  assert.equal(o.evento, 'pedido_lento');
  assert.equal(o.app, 'trafego');
  assert.equal(o.nivel, 'warn');
  assert.equal(o.id, 'abc-123456');
  assert.equal(o.ms, 1520);
  assert.ok(!('nada' in o) && !('nulo' in o));
  assert.doesNotMatch(o.erro, /12974032299/);
});

test('pedido: guarda a duração de cada etapa e só descreve o pedido lento (1 s ou mais)', async () => {
  let agora = 1000;
  const p = Registro.criarPedido({ id: 'abc-123456', metodo: 'GET', rota: '/api/hoje', relogio: () => agora });
  const valor = await p.medir('metricas', async () => { agora += 1200; return 42; });
  assert.equal(valor, 42, 'medir devolve o que a etapa devolveu');
  await p.medir('agenda', async () => { agora += 30; });
  await assert.rejects(p.medir('jornada', async () => { agora += 300; throw new Error('caiu'); }), /caiu/);
  p.marcar('memoria', 0, { da_memoria: true });

  const etapas = p.etapas();
  assert.deepEqual(etapas.map(e => e.nome), ['metricas', 'agenda', 'jornada', 'memoria']);
  assert.equal(etapas[0].ms, 1200);
  assert.equal(etapas[2].falhou, true);

  const lento = p.resumoSeLento({ status: 200, ms: 1530 });
  assert.equal(lento.evento, 'pedido_lento');
  assert.equal(lento.campos.id, 'abc-123456');
  assert.equal(lento.campos.rota, '/api/hoje');
  assert.deepEqual(lento.campos.etapas.map(e => e.nome), ['metricas', 'jornada', 'agenda'], 'da mais demorada para a menos; etapa instantânea fica de fora');
  assert.equal(p.resumoSeLento({ status: 200, ms: 400 }), null, 'pedido rápido não escreve nada a mais');
});

test('erro do pedido: contexto (rota, etapa que falhou, tipo do erro) e nenhuma informação pessoal', () => {
  const p = Registro.criarPedido({ id: 'abc-123456', metodo: 'GET', rota: '/api/campanhas/:plataforma/:ext', relogio: () => 0 });
  p.marcar('jornada', 12, { falhou: true });
  const e = Object.assign(new Error('insert falhou para o telefone 5512974032299 de Maria'), { code: '23505' });
  const r = p.resumoDoErro(e, { status: 500, quem: 'gestor:1a2b3c4d' });
  assert.equal(r.evento, 'erro_pedido');
  assert.equal(r.campos.rota, '/api/campanhas/:plataforma/:ext');
  assert.equal(r.campos.status, 500);
  assert.equal(r.campos.codigo, '23505');
  assert.equal(r.campos.etapa, 'jornada');
  assert.equal(r.campos.quem, 'gestor:1a2b3c4d');
  assert.doesNotMatch(JSON.stringify(r.campos), /5512974032299/);
});

test('rotaDoLog: caminho com identificador vira modelo (o log não guarda id de contato nem de campanha)', () => {
  assert.equal(Registro.rotaDoLog('/api/hoje'), '/api/hoje');
  assert.equal(Registro.rotaDoLog('/api/campanhas/meta/120212345678901234'), '/api/campanhas/meta/:id');
  assert.equal(Registro.rotaDoLog('/api/jornada/3f2b8c1e-1111-4222-8333-444455556666/valor'), '/api/jornada/:id/valor');
  assert.equal(Registro.rotaDoLog('/api/origem/frases/42'), '/api/origem/frases/:id');
});
