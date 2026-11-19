/* Rodada 8 (T6): Meta e Google contra as plataformas de mentira (scripts/mock-server.mjs). Sem rede de verdade. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const meta = require('../meta');
const google = require('../google');
const C = require('../conexoes');

let subir;
const esperas = [];
const esperar = async ms => { esperas.push(ms); };
test.before(async () => { ({ subirPlataformasFalsas: subir } = await import('../scripts/mock-server.mjs')); });

const credMeta = (token = 'TOKEN-FALSO', conta = 'act_1234567890', extra = {}) => ({ meta_ad_account_id: conta, meta_access_token: token, ...extra });
const DE = '2026-11-10', ATE = '2026-11-12';

test('Meta: coleta os três níveis na v27.0, com conversas, objetivo, situação e miniatura, seguindo as páginas', async () => {
  const P = await subir();
  try {
    const estado = {};
    const r = await meta.coletar(credMeta(), { de: DE, ate: ATE, base: P.meta, esperar, estado });
    assert.equal(r.versao, 'v27.0');
    assert.equal(r.linhas.filter(l => l.nivel === 'campanha').length, 6);
    assert.equal(r.linhas.filter(l => l.nivel === 'conjunto').length, 6);
    assert.equal(r.linhas.filter(l => l.nivel === 'anuncio').length, 12, 'anúncios vêm em 3 páginas de 4');
    const c1 = r.linhas.find(l => l.nivel === 'campanha' && l.campanha_ext === '120000000000001');
    assert.equal(c1.conversas, 3);
    assert.equal(c1.conversoes, 4, 'conversa iniciada e total de conexões não se somam: vale o maior');
    assert.equal(c1.objetivo, 'OUTCOME_ENGAGEMENT');
    assert.equal(c1.status, 'ACTIVE');
    assert.equal(c1.gasto, 25.5);
    assert.equal(r.linhas.find(l => l.nivel === 'campanha' && l.campanha_ext === '120000000000002').status, 'PAUSED');
    const ad = r.linhas.find(l => l.nivel === 'anuncio' && l.anuncio_ext === '1220000000000011');
    assert.match(ad.miniatura_url, /^https:\/\/scontent\.xx\.fbcdn\.net\//);
    assert.equal(r.linhas.find(l => l.anuncio_ext === '1220000000000012').status, 'PAUSED');
    assert.equal(r.token.expira_em, null, 'token de usuário do sistema que não vence');
    assert.ok(P.estado.pedidos.every(p => p.plataforma !== 'meta' || !/access_token=/.test(p.query)), 'o token nunca vai na URL');
    assert.ok(P.estado.pedidos.every(p => p.plataforma !== 'meta' || p.autorizacao), 'o token vai no cabeçalho');
  } finally { await P.fechar(); }
});

test('Meta: conta que ainda não aceita a v27.0 cai para a v26.0 sozinha', async () => {
  const P = await subir();
  try {
    const estado = {};
    const linhas = await meta.buscar(credMeta('TOKEN-FALSO', 'act_2222222222'), 'campanha', DE, DE, { base: P.meta, esperar, estado });
    assert.equal(linhas.length, 2);
    assert.equal(estado.versao, 'v26.0');
    assert.deepEqual(estado.versoes_recusadas, ['v27.0']);
  } finally { await P.fechar(); }
});

test('Meta: appsecret_proof quando há segredo do app; segredo errado vira frase clara', async () => {
  const P = await subir({ segredoApp: 'SEGREDO-FALSO' });
  try {
    const ok = await meta.testar(credMeta('TOKEN-FALSO', 'act_1234567890', { meta_app_secret: 'SEGREDO-FALSO' }), { base: P.meta, esperar });
    assert.equal(ok.nome, 'Oficina de Mentira');
    assert.equal(ok.versao, 'v27.0');
    await assert.rejects(meta.testar(credMeta('TOKEN-FALSO', 'act_1234567890', { meta_app_secret: 'OUTRO' }), { base: P.meta, esperar }), e => {
      assert.match(C.explicarErro(e.message).titulo, /Segredo do app/);
      assert.ok(!e.message.includes('TOKEN-FALSO'));
      return true;
    });
  } finally { await P.fechar(); }
});

test('Meta: limite estourado tenta de novo com espera; uso alto da conta faz esperar antes da próxima', async () => {
  const P = await subir();
  try {
    esperas.length = 0;
    const estado = {};
    const r = await meta.testar(credMeta('TOKEN-FALSO-LIMITE'), { base: P.meta, esperar, estado });
    assert.equal(r.moeda, 'BRL');
    assert.ok(esperas.includes(meta.ESPERAS_MS[0]), 'esperou antes de tentar de novo');
    assert.ok(estado.tentativas >= 1);
    esperas.length = 0;
    await meta.buscar(credMeta('TOKEN-FALSO-QUENTE'), 'campanha', DE, DE, { base: P.meta, esperar });
    assert.ok(esperas.includes(5_000), 'uso da conta em 85% pede uma pausa');
  } finally { await P.fechar(); }
});

test('Meta: acesso vencido, sem permissão, vencendo e conta inexistente viram frase com o que fazer', async () => {
  const P = await subir();
  const motores = { meta: { testar: c => meta.testar(c, { base: P.meta, esperar }) } };
  const lerIntegracoes = async () => [];
  try {
    const vencido = await C.testar('meta', credMeta('TOKEN-FALSO-VENCIDO'.padEnd(40, 'X')), { motores: { meta: { testar: c => meta.testar({ ...c, meta_access_token: 'TOKEN-FALSO-VENCIDO' }, { base: P.meta, esperar }) } }, lerIntegracoes });
    assert.equal(vencido.ok, false);
    assert.match(vencido.titulo, /inválido ou vencido/);
    assert.ok(!JSON.stringify(vencido).includes('TOKEN-FALSO-VENCIDO'));
    const semEscopo = await C.testar('meta', credMeta('TOKEN-FALSO-SEM-ESCOPO'.padEnd(40, 'X')), { motores: { meta: { testar: c => meta.testar({ ...c, meta_access_token: 'TOKEN-FALSO-SEM-ESCOPO' }, { base: P.meta, esperar }) } }, lerIntegracoes });
    assert.equal(semEscopo.ok, false);
    assert.match(semEscopo.titulo, /sem permissão/);
    const vencendo = await C.testar('meta', credMeta('TOKEN-FALSO-60D'.padEnd(40, 'X')), { motores: { meta: { testar: c => meta.testar({ ...c, meta_access_token: 'TOKEN-FALSO-60D' }, { base: P.meta, esperar }) } }, lerIntegracoes });
    assert.equal(vencendo.ok, true);
    assert.match(vencendo.expira_em, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(vencendo.avisos.some(a => /vence em/.test(a)));
    const inexistente = await C.testar('meta', { meta_ad_account_id: '0000000000' }, { motores, lerIntegracoes: async () => [{ canal: 'meta', meta_access_token: 'TOKEN-FALSO' }] });
    assert.match(inexistente.titulo, /não encontrada/);
    const semGasto = await meta.coletar(credMeta('TOKEN-FALSO', 'act_3333333333'), { de: DE, ate: ATE, base: P.meta, esperar });
    assert.equal(semGasto.linhas.length, 0, 'conta sem gasto: nenhuma linha, sem erro');
  } finally { await P.fechar(); }
});

test('Meta: paging.next para outro endereço não é seguido (o token não vaza)', () => {
  assert.equal(meta.proximaPagina('https://evil.example.com/v27.0/act_1/insights?access_token=x', 'https://graph.facebook.com'), null);
  assert.equal(meta.proximaPagina('https://graph.facebook.com/v27.0/act_1/insights?after=B&access_token=x', 'https://graph.facebook.com'),
    'https://graph.facebook.com/v27.0/act_1/insights?after=B');
  assert.equal(meta.provaDoSegredo('t', null), null);
  assert.equal(meta.provaDoSegredo('t', 's'), crypto.createHmac('sha256', 's').update('t').digest('hex'));
});

/* ---------------- Google ---------------- */

const chaves = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVADA = chaves.privateKey.export({ type: 'pkcs8', format: 'pem' });
const credOauth = (cliente = '123-456-7890', extra = {}) => ({ google_customer_id: cliente, google_client_id: 'cliente.apps.googleusercontent.com',
  google_client_secret: 'segredo-falso', google_refresh_token: 'refresh-falso', google_developer_token: 'DEV-TOKEN-ANTIGO', ...extra });
const credServico = (cliente = '1234567890') => ({ google_customer_id: cliente, google_client_id: 'painel@projeto-falso.iam.gserviceaccount.com', google_client_secret: PRIVADA });
const subirGoogle = (extra = {}) => subir({ chavePublica: chaves.publicKey, hoje: '2026-11-19', cliques: { '2026-11-15': [{ gclid: 'Cj0KCQiA-falso-1', palavra: 'troca de oleo' }] }, ...extra });
const opG = (P, extra = {}) => ({ base: P.google, oauth: P.oauth, esperar, ...extra });

test('Google: OAuth antigo coleta os três níveis na v26, sem mandar o developer token, com palavras e termos', async () => {
  const P = await subirGoogle();
  google.esquecerToken();
  try {
    const r = await google.coletar(credOauth(), { de: DE, ate: ATE, ...opG(P) });
    assert.equal(r.versao, 'v26');
    assert.equal(r.linhas.length, 9);
    const camp = r.linhas.find(l => l.nivel === 'campanha');
    assert.deepEqual([camp.campanha_ext, camp.gasto, camp.status, camp.objetivo, camp.conta_ext], ['2000001', 15.5, 'ENABLED', 'SEARCH', '1234567890']);
    assert.equal(r.linhas.find(l => l.nivel === 'anuncio').anuncio_ext, '4000001');
    const palavras = r.termos.filter(t => t.termo == null);
    const termos = r.termos.filter(t => t.termo != null);
    assert.equal(palavras.length, 3);
    assert.equal(termos.length, 3, 'o mesmo termo em dois tipos de correspondência vira uma linha');
    assert.deepEqual([termos[0].cliques, termos[0].gasto, termos[0].palavra_chave, termos[0].correspondencia], [10, 8, 'oficina mecanica', 'PHRASE']);
    assert.ok(P.estado.pedidos.filter(p => p.plataforma === 'google').every(p => !p.devToken), 'developer-token não vai mais');
  } finally { await P.fechar(); }
});

test('Google: conta de serviço (JWT assinado) entra; a chave colada na tela vira as colunas que já existem', async () => {
  const P = await subirGoogle();
  google.esquecerToken();
  try {
    const r = await google.testar(credServico(), opG(P));
    assert.deepEqual([r.nome, r.moeda, r.acesso, r.versao], ['Oficina de Mentira', 'BRL', 'conta_servico', 'v26']);
    const v = C.validarCredencial('google', { google_customer_id: '123-456-7890',
      google_conta_servico: JSON.stringify({ type: 'service_account', client_email: 'painel@projeto-falso.iam.gserviceaccount.com', private_key: PRIVADA }) });
    assert.equal(v.ok, true);
    assert.equal(v.cred.google_client_id, 'painel@projeto-falso.iam.gserviceaccount.com');
    assert.equal(google.modoDeAcesso(v.cred), 'conta_servico');
    assert.equal(google.temAcesso(v.cred), true);
    assert.equal(C.validarCredencial('google', { google_conta_servico: '{"client_email":"x@y.com"}' }).ok, false);
    const outra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    google.esquecerToken();
    await assert.rejects(google.testar({ ...credServico(), google_client_secret: outra }, opG(P)), e => {
      assert.match(C.explicarErro(e.message).titulo, /conta de serviço recusada/);
      assert.ok(!C.semSegredo(`${e.message} ${outra}`).includes('PRIVATE KEY'));
      return true;
    });
  } finally { await P.fechar(); }
});

test('Google: versão que sumiu cai para a anterior; 429 tenta de novo; erros viram frase', async () => {
  const P = await subirGoogle({ versoesGoogle: ['v24', 'v25'] });
  google.esquecerToken();
  try {
    const estado = {};
    await google.testar(credOauth(), opG(P, { estado }));
    assert.equal(estado.versao, 'v25');
    esperas.length = 0;
    const r = await google.testar(credOauth('555-555-5555'), opG(P));
    assert.equal(r.id, '5555555555');
    assert.ok(esperas.includes(google.ESPERAS_MS[0]));
    await assert.rejects(google.testar(credOauth('111-111-1111'), opG(P)), e => /sem acesso às contas reais/.test(C.explicarErro(e.message).titulo));
    await assert.rejects(google.testar(credOauth('444-444-4444'), opG(P)), e => /gerenciadora/.test(C.explicarErro(e.message).titulo));
    google.esquecerToken();
    await assert.rejects(google.testar(credOauth('123-456-7890', { google_refresh_token: 'refresh-vencido' }), opG(P)), e => /vencida/.test(C.explicarErro(e.message).titulo));
    google.esquecerToken();
    await assert.rejects(google.testar(credOauth('123-456-7890', { google_client_secret: 'segredo-errado' }), opG(P)), e => /Client ID/.test(C.explicarErro(e.message).titulo));
  } finally { await P.fechar(); }
});

test('Google: click_view de um dia devolve campanha, grupo, anúncio e palavra; mais de 90 dias nem pergunta', async () => {
  const P = await subirGoogle();
  google.esquecerToken();
  try {
    const agora = Date.parse('2026-11-19T15:00:00Z');
    const lista = await google.cliques(credOauth(), '2026-11-15', opG(P, { agora }));
    assert.deepEqual(lista, [{ gclid: 'Cj0KCQiA-falso-1', data: '2026-11-15', campanha_ext: '2000001', campanha_nome: 'Pesquisa oficina Taubaté',
      conjunto_ext: '3000001', conjunto_nome: 'oficina mecânica', anuncio_ext: '4000001', palavra_chave: 'troca de oleo', correspondencia: 'PHRASE' }]);
    const antes = P.estado.pedidos.length;
    await assert.rejects(google.cliques(credOauth(), '2026-08-01', opG(P, { agora })), e => e.fora_da_janela === true);
    assert.equal(P.estado.pedidos.length, antes);
    await assert.rejects(google.cliques(credOauth(), "2026-11-15' OR 1=1", opG(P, { agora })), /dia inválido/);
  } finally { await P.fechar(); }
});

test('Conexões: textos novos do Google e do developer token; o segredo some da mensagem técnica', () => {
  assert.match(C.explicarErro('Google Ads 403: not approved [CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION]').fazer, /Explorer/);
  assert.match(C.explicarErro('Google Ads 403: API has not been used in project 123 [SERVICE_DISABLED]').titulo, /não está ativada/);
  assert.match(C.explicarErro('Meta API 400: (#2635) You are calling a deprecated version (código 2635)').titulo, /versão/);
  const s = C.semSegredo('erro Bearer ya29.abcdefghijk appsecret_proof=abc123 -----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY----- fim');
  assert.ok(!/ya29\.abc|abc123|MIIE/.test(s), s);
  assert.equal(google.temAcesso({ google_customer_id: '1234567890', google_client_id: 'a.apps.googleusercontent.com', google_client_secret: 'x', google_refresh_token: 'y' }), true,
    'sem developer token também vale');
});
