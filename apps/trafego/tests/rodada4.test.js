'use strict';
process.env.TRAFEGO_TELA_ANTIGA = '1'; // estes testes conferem a tela antiga (desligada por padrão desde a rodada 8)
/* Rodada 4 (14/10/2026): servidor acordando (novas tentativas), guia de conexão em passos, gzip e memória dos
   estáticos, service worker, fontes no próprio app e preferências gravadas sem apagar os outros apps. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const Rede = require('../public/rede.js');
const Guia = require('../public/guia-conexao.js');
const compressao = require('../compressao');
const E = require('../equipe');
const { mascararIntegracao } = require('../db');

/* ---------------- rede ---------------- */

test('rede: só 502/503/504, rede caída, 408/429 e 52x são passageiros', () => {
  for (const s of [0, 408, 429, 502, 503, 504, 520, 524]) assert.equal(Rede.passageiro(s), true, String(s));
  for (const s of [200, 400, 401, 403, 404, 409, 413, 500]) assert.equal(Rede.passageiro(s), false, String(s));
});

test('rede: só leitura (GET) repete sozinha; gravação nunca', () => {
  assert.equal(Rede.podeRepetir(undefined), true);
  assert.equal(Rede.podeRepetir('get'), true);
  assert.equal(Rede.podeRepetir('POST'), false);
  assert.equal(Rede.podeRepetir('DELETE'), false);
});

test('rede: esperas crescentes somam ~3 min e a frase nunca é "Erro 503"', () => {
  const total = Rede.ESPERAS.reduce((a, b) => a + b, 0);
  assert.ok(total >= 150000 && total <= 240000, String(total));
  assert.equal(Rede.textoEspera(5000), 'em 5 s');
  assert.equal(Rede.textoEspera(90000), 'em 1 min 30 s');
  assert.match(Rede.mensagem(503), /acordando/);
  assert.match(Rede.mensagem(0, false), /Sem internet/);
  assert.equal(Rede.mensagem(400), null);
});

test('rede: tenta de novo em 503 e para no primeiro sucesso, avisando cada espera', async () => {
  let n = 0;
  const avisos = [];
  const r = await Rede.comNovasTentativas(async () => {
    n++;
    if (n < 3) throw Object.assign(new Error('x'), { status: 503 });
    return 'ok';
  }, { dormir: async () => {}, aoEsperar: (ms, t) => avisos.push([ms, t]) });
  assert.equal(r, 'ok');
  assert.deepEqual(avisos, [[2000, 1], [5000, 2]]);
});

test('rede: erro de regra (400/403) sai na hora; depois da última espera desiste', async () => {
  let n = 0;
  await assert.rejects(Rede.comNovasTentativas(async () => { n++; throw Object.assign(new Error('x'), { status: 403 }); }, { dormir: async () => {} }));
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(Rede.comNovasTentativas(async () => { n++; throw Object.assign(new Error('x'), { status: 0 }); }, { dormir: async () => {}, esperas: [1, 1] }));
  assert.equal(n, 3);
});

/* ---------------- guia de conexão ---------------- */

test('guia Meta: sem nada → 0 de 4, próximo é o número da conta e a mensagem pede conta e token', () => {
  const p = Guia.passosMeta({}, '2026-10-14');
  const r = Guia.resumo(p);
  assert.equal(r.feitos, 0);
  assert.equal(r.total, 4);
  assert.equal(r.proximo.id, 'conta');
  const m = Guia.mensagemPedido('meta', p);
  assert.match(m, /Número da conta/);
  assert.match(m, /ads_read/);
  assert.doesNotMatch(m, /Conexão testada/);
});

test('guia Meta: tudo certo e token longe de vencer → pronto; vencendo em 3 dias → avisa', () => {
  const base = { tem_meta_conta: true, tem_meta_token: true, ultimo_sync_status: 'ok — 120 linhas' };
  assert.equal(Guia.resumo(Guia.passosMeta({ ...base, meta_token_expira_em: '2026-12-01' }, '2026-10-14')).pronto, true);
  const vencendo = Guia.passosMeta({ ...base, meta_token_expira_em: '2026-10-17' }, '2026-10-14');
  const v = vencendo.find(x => x.id === 'validade');
  assert.equal(v.feito, false);
  assert.match(v.como, /vence em 3 dia/);
  const vencido = Guia.passosMeta({ ...base, meta_token_expira_em: '2026-10-01' }, '2026-10-14');
  assert.match(vencido.find(x => x.id === 'validade').como, /venceu/);
  const comErro = Guia.passosMeta({ ...base, ultimo_sync_status: 'erro — Meta API 400' }, '2026-10-14');
  assert.match(comErro.find(x => x.id === 'teste').como, /deu erro/);
});

test('guia Google: cada credencial vira um passo; sem segredo na mensagem', () => {
  const i = { tem_google_cliente: true, tem_google_developer_token: true, tem_google_oauth: false, tem_google_refresh: false };
  const p = Guia.passosGoogle(i);
  const r = Guia.resumo(p);
  // integração r8: o Google não pede mais o developer token; o passo saiu (ter um salvo não conta como passo feito)
  assert.equal(p.some(x => x.id === 'developer'), false);
  assert.equal(r.feitos, 1);
  assert.equal(r.proximo.id, 'oauth');
  const m = Guia.mensagemPedido('google', p);
  assert.match(m, /Client ID/);
  assert.match(m, /Refresh token/);
  assert.match(m, /não precisa mandar senha/);
});

test('integração mascarada: só sim/não por campo, nunca o valor de token ou segredo', () => {
  const m = mascararIntegracao({
    id: 1, canal: 'google', meta_access_token: 'EAAsegredo', google_developer_token: 'dev-segredo', google_client_id: 'id.apps',
    google_client_secret: 'segredo-x', google_refresh_token: '1//segredo', google_customer_id: '1234567890', google_login_customer_id: '',
  });
  const texto = JSON.stringify(m);
  for (const s of ['EAAsegredo', 'dev-segredo', 'segredo-x', '1//segredo']) assert.equal(texto.includes(s), false, s);
  assert.equal(m.tem_google_developer_token, true);
  assert.equal(m.tem_google_oauth, true);
  assert.equal(m.tem_google_refresh, true);
  assert.equal(m.tem_google_mcc, false);
  assert.equal(m.tem_meta_conta, false);
});

/* ---------------- compressão ---------------- */

test('gzip: aceita "gzip" (não "gzip;q=0"), só texto a partir de 1 KB', () => {
  assert.equal(compressao.aceitaGzip({ headers: { 'accept-encoding': 'gzip, deflate, br' } }), true);
  assert.equal(compressao.aceitaGzip({ headers: { 'accept-encoding': 'br, gzip;q=0' } }), false);
  assert.equal(compressao.aceitaGzip({ headers: {} }), false);
  assert.equal(compressao.valeComprimir('application/json', 2000), true);
  assert.equal(compressao.valeComprimir('application/json', 200), false);
  assert.equal(compressao.valeComprimir('image/png', 50000), false);
  const grande = Buffer.from(JSON.stringify({ linhas: Array.from({ length: 300 }, (_, i) => ({ campanha: 'Campanha ' + i, gasto: i })) }));
  const { corpo, cabecalhos } = compressao.preparar({ headers: { 'accept-encoding': 'gzip' } }, grande, 'application/json');
  assert.equal(cabecalhos['Content-Encoding'], 'gzip');
  assert.ok(corpo.length < grande.length / 3);
  assert.deepEqual(zlib.gunzipSync(corpo), grande);
});

test('memória dos estáticos: relê só quando o arquivo muda', async () => {
  const arq = path.join(os.tmpdir(), `ads-r4-${process.pid}.js`);
  fs.writeFileSync(arq, 'a'.repeat(3000));
  const ler = () => new Promise((ok, falha) => compressao.lerArquivo(arq, 'text/javascript', (e, i) => (e ? falha(e) : ok(i))));
  const a = await ler();
  const b = await ler();
  assert.equal(a, b, 'mesmo item da memória');
  assert.ok(a.gz && a.gz.length < 200);
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(arq, 'b'.repeat(4000));
  fs.utimesSync(arq, new Date(), new Date(Date.now() + 5000));
  const c = await ler();
  assert.notEqual(c, a);
  assert.equal(c.cru.length, 4000);
  fs.unlinkSync(arq);
});

/* ---------------- preferências (coordenador, 14/10) ---------------- */

test('preferências: mescla só "notificacoes" e mantém as chaves dos outros apps', () => {
  const r = E.mesclarPreferencias({ agenda: { visao: 'semana' }, orcador: { tour_visto: 1 }, notificacoes: { crm_x: false } }, { ads_alertas: false });
  assert.deepEqual(r, { agenda: { visao: 'semana' }, orcador: { tour_visto: 1 }, notificacoes: { crm_x: false, ads_alertas: false } });
  assert.deepEqual(E.mesclarPreferencias(null, { ads_semana: true }), { notificacoes: { ads_semana: true } });
  assert.deepEqual(E.mesclarPreferencias(['estragado'], {}), { notificacoes: {} });
});

test('preferências: se a releitura do perfil falhar, nada é gravado (não apaga o que os outros apps guardaram)', async () => {
  const updates = [];
  const sb = {
    from() {
      return {
        select() { return { eq() { return { maybeSingle: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }; } }; },
        update(p) { updates.push(p); return { eq: async () => ({ error: null }) }; },
      };
    },
  };
  await assert.rejects(E.criar(sb).salvarPerfil({ id: 'u1' }, { notificacoes: { ads_alertas: false } }), /Nada foi alterado/);
  assert.equal(updates.length, 0);
});

/* ---------------- servidor: sw.js, gzip, fontes e CSP ---------------- */

test('servidor: sw.js sem cache, supabase.js e app.js com gzip, fontes servidas e CSP sem o Google', async () => {
  // Rodada 8: a tela antiga (public/) é servida em /antiga/; a raiz passa a ser da tela nova quando ela existir.
  const { servidor } = require('../server');
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const sw = await fetch(base + '/antiga/sw.js');
    assert.equal(sw.status, 200);
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.match(await sw.text(), /ads-casca-/);
    const vendor = await fetch(base + '/vendor/supabase.js', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(vendor.status, 200);
    assert.equal(vendor.headers.get('content-encoding'), 'gzip');
    const app = await fetch(base + '/antiga/app.js', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(app.headers.get('content-encoding'), 'gzip');
    assert.match(await app.text(), /mostrarAcordando/);
    const fonte = await fetch(base + '/antiga/fontes/dm-sans-variavel.woff2');
    assert.equal(fonte.status, 200);
    assert.equal(fonte.headers.get('content-type'), 'font/woff2');
    const html = await fetch(base + '/antiga/');
    const csp = html.headers.get('content-security-policy');
    assert.doesNotMatch(csp, /googleapis|gstatic/);
    assert.match(csp, /font-src 'self'/);
    const corpo = await html.text();
    assert.doesNotMatch(corpo, /fonts\.googleapis/);
    assert.match(corpo, /id="faixa-acordando"/);
    assert.match(corpo, /rede\.js/);
  } finally {
    servidor.closeAllConnections?.();
    await new Promise(r => servidor.close(r));
  }
});
