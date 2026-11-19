const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../public/crm-utils');

test('motivo estruturado preserva observações e exige texto em Outro', () => {
  assert.deepEqual(U.camposPerda('Ligou hoje', 'caro'), {
    motivo_perda: 'caro', motivo_perda_obs: null, observacoes: 'Ligou hoje\nMotivo da perda: Achou caro'
  });
  assert.equal(U.camposPerda('', 'outro', '   '), null);
  assert.equal(U.camposPerda('', 'outro', ' Mudou de cidade ').motivo_perda_obs, 'Mudou de cidade');
});

test('origem reconhece anúncios, contatos não pagos e ausência de evidência', () => {
  const meta = { origem_paga: true, origem_plataforma: 'meta', campanha_nome: 'Revisão', origem_como: 'ref' };
  assert.match(U.origemCaptada(meta), /Meta.*Revisão.*Link rastreado/);
  assert.equal(U.casaOrigem(meta, 'pago_meta'), true);
  assert.equal(U.casaOrigem(meta, 'pago_google'), false);
  assert.equal(U.casaOrigem({ origem_paga: false }, 'nao_pago'), true);
  assert.equal(U.casaOrigem({}, 'origem_incerta'), true);
  assert.equal(U.origemCaptada({}), 'Não sei de onde veio');
});
