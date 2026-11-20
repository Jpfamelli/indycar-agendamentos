const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { subirServidor, PESSOAS } = require('./servidor-falso.cjs');

test('R10-CRM-001: cadastro preserva caracteres UTF-8 divididos entre blocos HTTP', async (t) => {
  const app = await subirServidor();
  t.after(() => app.fechar());
  const corpo = Buffer.from(JSON.stringify({ nome: 'João', telefone: '12999990000' }));
  const corte = corpo.indexOf(Buffer.from('ã')) + 1;
  const resposta = await new Promise((resolve, reject) => {
    const pedido = http.request(app.url + '/api/leads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer tok-${PESSOAS.gestor.id}-r10`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      res.on('error', reject);
      res.on('end', () => resolve(res.statusCode));
      res.resume();
    });
    pedido.on('error', reject);
    pedido.write(corpo.subarray(0, corte));
    pedido.end(corpo.subarray(corte));
  });
  assert.equal(resposta, 201);
  assert.equal(app.db.leads[0].nome, 'João');
});
