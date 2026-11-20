'use strict';
/* Rodada 9 (Claude): tarefas pelo servidor (lib/tarefas.js): aviso em português de quem usa,
   leitura que falha não vira zero, e limite de linhas sempre são. Banco de mentira, feito à mão. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../lib/tarefas.js');

const GESTOR = { id: 'f0000000-0000-4000-8000-000000000003', papel: 'gestor' };
const ANA = 'f0000000-0000-4000-8000-000000000001';

/* dublê mínimo do cliente do Supabase: cada tabela responde { data, error } e anota o limit pedido */
function bancoDeMentira(respostas, anotado = {}) {
  return {
    from(tabela) {
      const q = {
        select() { return q; }, eq() { return q; }, neq() { return q; }, order() { return q; },
        limit(n) { anotado[tabela] = n; return q; },
        then(resolver) { return Promise.resolve(respostas[tabela] || { data: [], error: null }).then(resolver); },
      };
      return q;
    },
  };
}

test('R9 tarefas: vínculo quebrado avisa em português de quem usa, sem nome de coluna', () => {
  for (const [campo, nome] of [['conversa_id', 'a conversa'], ['cliente_id', 'o cliente'], ['lead_id', 'o lead'], ['agendamento_id', 'o horário']]) {
    const r = T.validarTarefa({ titulo: 'Ligar', [campo]: 'abc' });
    assert.equal(r.campo, campo);
    assert.ok(r.erro.includes(nome), r.erro);
    assert.ok(!/_id/.test(r.erro), 'nada de nome de coluna: ' + r.erro);
  }
});

test('R9 tarefas: se a leitura das conversas falha, a carga não sai com zero para todo mundo', async () => {
  const perfis = { data: [{ id: ANA, nome: 'Ana', papel: 'atendente', ativo: true }], error: null };
  const tarefas = { data: [], error: null };
  const quebrado = T.criarTarefas({ sb: bancoDeMentira({ perfis, tarefas, conversas: { data: null, error: { message: 'timeout' } } }) });
  const r = await quebrado.cargaDaEquipe(GESTOR);
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(r.codigo, 'banco_fora');
  assert.ok(!('pessoas' in r), 'não devolve número nenhum');
  assert.ok(!/timeout/.test(JSON.stringify(r)), 'o erro do banco não vaza');

  const inteiro = T.criarTarefas({ sb: bancoDeMentira({ perfis, tarefas, conversas: { data: [{ atribuida_a: ANA, aguardando_consultor: true, status: 'aberta' }], error: null } }) });
  const bom = await inteiro.cargaDaEquipe(GESTOR);
  assert.equal(bom.ok, true);
  assert.equal(bom.pessoas[0].conversas_abertas, 1);
  assert.equal(bom.pessoas[0].aguardando_consultor, 1);
});

test('R9 tarefas: limite de linhas sempre são (1 a 200; lixo vira 100)', async () => {
  assert.equal(T.limiteSeguro(50), 50);
  assert.equal(T.limiteSeguro('30'), 30);
  assert.equal(T.limiteSeguro(9999), 200);
  for (const lixo of [undefined, null, '', 'abc', NaN, -5, 0, {}, Infinity]) assert.equal(T.limiteSeguro(lixo), 100, String(lixo));
  assert.equal(T.limiteSeguro(12.9), 12);
  const anotado = {};
  const t = T.criarTarefas({ sb: bancoDeMentira({ tarefas: { data: [], error: null } }, anotado) });
  await t.daPessoa(GESTOR, ANA, { limite: 'abc' });
  assert.equal(anotado.tarefas, 100, 'texto não chega ao banco como NaN');
  await t.daPessoa(GESTOR, ANA, { limite: -1 });
  assert.equal(anotado.tarefas, 100);
  await t.daPessoa(GESTOR, ANA, { limite: 5000 });
  assert.equal(anotado.tarefas, 200);
});
