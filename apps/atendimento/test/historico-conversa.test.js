const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('histórico: um clique por página, com o mesmo limite após falha', async () => {
  const fonte = readFileSync(join(__dirname, '../public/app.js'), 'utf8');
  const consulta = fonte.slice(fonte.indexOf('let limiteMsgs = PAGINA_MSGS;'), fonte.indexOf('/** Esqueleto do chat'));
  const pedidos = [];
  const avisos = [];
  const contexto = {
    PAGINA_MSGS: 2,
    conversaAtual: { id: 'a' },
    conversaRenderizada: 'a',
    MENSAGENS: [{}],
    Recuperador: { marcar() {} },
    guardarMsgsEmMemoria() {},
    renderMensagens() {},
    toast: texto => avisos.push(texto),
    sb: {
      from() { return this; },
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit(limite) {
        return new Promise(resolver => pedidos.push({ limite, resolver }));
      },
    },
  };
  const carregar = runInNewContext(consulta + '\ncarregarMensagens', contexto);
  const primeira = carregar({ anteriores: true });
  await carregar({ anteriores: true });
  assert.deepEqual(pedidos.map(p => p.limite), [4]);
  pedidos[0].resolver({ error: new Error('Falha simulada') });
  await primeira;
  assert.match(avisos[0], /mensagens anteriores/);

  const segunda = carregar({ anteriores: true });
  const tempoReal = carregar();
  assert.deepEqual(pedidos.map(p => p.limite), [4, 4, 4]);
  pedidos[2].resolver({ data: [{}, {}] });
  await tempoReal;
  pedidos[1].resolver({ error: new Error('Resposta antiga') });
  await segunda;
  assert.equal(avisos.length, 1);
});
