'use strict';
/* Conexões: erro cru da Meta/Google vira "o que fazer"; formato validado
   antes de gastar chamada; teste não grava; token nunca vaza na mensagem. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../conexoes');

test('explicarErro: Meta 190, permissão, conta errada e limite', () => {
  assert.match(C.explicarErro('Meta API 400: Malformed access token (código 190)').titulo, /inválido ou vencido/);
  assert.match(C.explicarErro('Meta API 403: (#200) Requires ads_read permission (código 200)').titulo, /sem permissão/);
  assert.match(C.explicarErro('Meta API 400: Unsupported get request (código 100)').titulo, /não encontrada/);
  assert.match(C.explicarErro('Meta API 400: User request limit reached (código 17)').titulo, /esperar/);
});

test('explicarErro: Google invalid_grant, developer token, MCC e rede', () => {
  assert.match(C.explicarErro('OAuth Google 400: invalid_grant').titulo, /vencida/);
  assert.match(C.explicarErro('Google Ads 403: DEVELOPER_TOKEN_NOT_APPROVED').titulo, /não aprovado/);
  assert.match(C.explicarErro('Google Ads 403: USER_PERMISSION_DENIED').titulo, /gerenciadora/);
  assert.match(C.explicarErro('fetch failed').titulo, /não respondeu/);
  const generico = C.explicarErro('qualquer outra coisa');
  assert.ok(generico.titulo && generico.fazer);
});

test('validarCredencial Meta: aceita act_, recusa conta com letras e token curto', () => {
  const ok = C.validarCredencial('meta', { meta_ad_account_id: 'act_1234567890', meta_access_token: 'EAA' + 'x'.repeat(40) });
  assert.equal(ok.ok, true);
  assert.equal(ok.cred.meta_ad_account_id, 'act_1234567890');
  assert.equal(C.validarCredencial('meta', { meta_ad_account_id: '12ab' }).ok, false);
  assert.equal(C.validarCredencial('meta', { meta_access_token: 'curto' }).ok, false);
  assert.equal(C.validarCredencial('meta', { meta_access_token: 'EAA' + 'x'.repeat(20) + ' ' + 'y'.repeat(20) }).ok, false);
});

test('validarCredencial Google: customer id com hífen vira 10 dígitos; client id conferido', () => {
  const ok = C.validarCredencial('google', { google_customer_id: '123-456-7890', google_client_id: 'abc.apps.googleusercontent.com' });
  assert.equal(ok.ok, true);
  assert.equal(ok.cred.google_customer_id, '1234567890');
  assert.equal(C.validarCredencial('google', { google_customer_id: '12345' }).ok, false);
  assert.equal(C.validarCredencial('google', { google_client_id: 'qualquer' }).ok, false);
  assert.equal(C.validarCredencial('tiktok', {}).ok, false);
});

test('mesclar: campo vazio na tela mantém o gravado', () => {
  assert.deepEqual(C.mesclar({ a: '1', b: '2' }, { a: '', b: '3' }), { a: '1', b: '3' });
});

test('testar: usa a credencial colada por cima da gravada, não grava, e traduz o erro sem vazar token', async () => {
  let recebida = null;
  const token = 'EAA' + 'S'.repeat(40);
  const motores = { meta: { testar: async cred => { recebida = cred; throw new Error(`Meta API 400: Malformed access token (código 190) access_token=${token}`); } } };
  const r = await C.testar('meta', { meta_access_token: token }, { motores, lerIntegracoes: async () => [{ canal: 'meta', meta_ad_account_id: 'act_999' }] });
  assert.equal(r.ok, false);
  assert.equal(recebida.meta_ad_account_id, 'act_999');
  assert.equal(recebida.meta_access_token, token);
  assert.match(r.titulo, /inválido ou vencido/);
  assert.ok(!JSON.stringify(r).includes(token), 'token não aparece na resposta');
});

test('testar: sucesso devolve nome da conta e "pode salvar"', async () => {
  const motores = { google: { esquecerToken() {}, testar: async () => ({ nome: 'IndyCar', moeda: 'BRL' }) } };
  const r = await C.testar('google', { google_customer_id: '1234567890' }, { motores, lerIntegracoes: async () => [] });
  assert.equal(r.ok, true);
  assert.match(r.fazer, /IndyCar · BRL/);
});

test('testar: formato errado nem chama a plataforma', async () => {
  let chamou = false;
  const r = await C.testar('meta', { meta_ad_account_id: 'abc' }, { motores: { meta: { testar: async () => { chamou = true; } } }, lerIntegracoes: async () => [] });
  assert.equal(r.ok, false);
  assert.equal(chamou, false);
});

test('salvar: recusa vazio e devolve a versão mascarada (sem token)', async () => {
  await assert.rejects(C.salvar('meta', {}, { gravar: async () => ({}) }), e => e.status === 400);
  const token = 'EAA' + 'z'.repeat(40);
  const m = await C.salvar('meta', { meta_access_token: token, meta_ad_account_id: '123456' },
    { gravar: async (canal, cred) => ({ id: 'x', canal, ativo: true, ...cred }) });
  assert.equal(m.tem_meta_token, true);
  assert.equal(m.meta_ad_account_id, 'act_123456');
  assert.ok(!JSON.stringify(m).includes(token));
});

test('semSegredo apaga token da Meta e do Google da mensagem técnica', () => {
  const s = C.semSegredo('erro access_token=EAAabc123456789 e ya29.abcdefghijk');
  assert.ok(!s.includes('EAAabc') && !s.includes('ya29.abc'));
});
