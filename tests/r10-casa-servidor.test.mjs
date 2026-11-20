// Casa, rodada 10 (segurança): os links do cliente pelo servidor da Central. Tudo sem rede (fetch de mentira).
// Cada teste aqui falha no código de antes da rodada 10 e passa no de agora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../casa-servidor.js';
const { criarLinksCliente } = S;
const podar = (...a) => S.podar(...a), formaDeJwt = (...a) => S.formaDeJwt(...a), motivoSeguro = (...a) => S.motivoSeguro(...a), ipDoPedido = (...a) => S.ipDoPedido(...a);

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-x', SUPABASE_SERVICE_ROLE_KEY: 'srv-secreta-x' };
const jwt = (extra = {}) => 'h.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, aal: 'aal1', ...extra })).toString('base64url') + '.s';
const req = (token, corpo, { metodo = 'POST', ip = '' } = {}) => {
  const chunks = [Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo ?? {}))];
  return Object.assign((async function* () { yield* chunks; })(), { method: metodo, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) } });
};
const subDe = (op) => { try { return JSON.parse(Buffer.from(String(op.headers.Authorization).split(' ')[1].split('.')[1], 'base64url').toString('utf8')).sub || 'u1'; } catch { return null; } };
/** fetch de mentira: cada token é uma pessoa (o "sub" do token); `recusar(sub)` faz o Supabase dizer 401 para ela */
function fakeFetch({ perfil = { ativo: true, papel: 'atendente' }, links = null, recusar = () => false, perfilStatus = 200 } = {}) {
  const chamadas = [];
  const f = async (url, op = {}) => {
    chamadas.push({ url: String(url), op });
    const resp = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo });
    if (/\/auth\/v1\/user/.test(url)) { const sub = subDe(op); return recusar(sub) ? resp({}, 401) : resp({ id: sub, factors: [] }); }
    if (/\/rest\/v1\/perfis/.test(url)) return resp(perfil ? [perfil] : [], perfilStatus);
    if (/rpc\/r7_p3b_links_cliente/.test(url)) return resp(links ?? { ok: true, nome: 'Ana', aceita_mensagens: true, minha: 'https://indycar-patio.netlify.app/minha/?c=tok' });
    throw new Error('url inesperada ' + url);
  };
  f.chamadas = chamadas; f.doAuth = () => chamadas.filter((c) => /\/auth\/v1\/user/.test(c.url));
  return f;
}
const novo = (ff, relogio = { t: Date.now() }) => ({ s: criarLinksCliente({ env: ENV, fetchFn: ff, agora: () => relogio.t }), relogio });
const TEL = { telefone: '12991821234' };

test('r10-corpo: pedido que não é um objeto ("null", número, texto, lista) volta 400, sem derrubar a rota', async () => {
  const { s } = novo(fakeFetch());
  for (const corpo of ['null', '5', '"oi"', '[]', '[{"telefone":"12991821234"}]', 'true']) {
    const r = await s.tratar(req(jwt(), corpo));   // antes: "null" estourava TypeError (erro 500 na Central)
    assert.equal(r.status, 400, corpo);
    assert.equal(r.corpo.erro, 'Pedido inválido.');
  }
  assert.equal((await s.tratar(req(jwt(), TEL))).status, 200, 'o pedido certo continua passando');
});

test('r10-forma-do-token: o que não tem forma de token do Supabase é recusado sem perguntar nada à rede', async () => {
  const ff = fakeFetch();
  const { s } = novo(ff);
  for (const lixo of ['abc', 'a.b.c', 'x'.repeat(5000), 'h.' + Buffer.from('"texto"').toString('base64url') + '.s', 'h.' + Buffer.from('[1]').toString('base64url') + '.s', 'só..isso']) {
    const r = await s.tratar(req(lixo, TEL, { ip: '9.9.9.' + (lixo.length % 250) }));
    assert.equal(r.status, 401, lixo.slice(0, 12));
  }
  assert.equal(ff.chamadas.length, 0, 'nenhuma consulta ao Supabase por causa de lixo');
  assert.equal(formaDeJwt(jwt()), true); assert.equal(formaDeJwt(''), false); assert.equal(formaDeJwt(null), false);
});

test('r10-freio-de-login: 10 logins recusados em 1 minuto do mesmo endereço e o 11º espera, sem ir ao Supabase', async () => {
  const ff = fakeFetch({ recusar: (sub) => String(sub).startsWith('ruim') });
  const { s, relogio } = novo(ff);
  for (let i = 0; i < 10; i++) assert.equal((await s.tratar(req(jwt({ sub: 'ruim' + i }), TEL, { ip: '200.1.1.1' }))).status, 401, 'tentativa ' + i);
  const antes = ff.chamadas.length;
  const r = await s.tratar(req(jwt({ sub: 'ruim-11' }), TEL, { ip: '200.1.1.1' }));
  assert.equal(r.status, 429);
  assert.equal(r.cabecalhos['Retry-After'], '60');
  assert.equal(ff.chamadas.length, antes, 'o 11º nem chegou ao Supabase');
  assert.equal((await s.tratar(req(jwt({ sub: 'boa' }), TEL, { ip: '200.1.1.1' }))).status, 429, 'o endereço freado espera mesmo com token bom');
  assert.equal((await s.tratar(req(jwt({ sub: 'boa' }), TEL, { ip: '200.2.2.2' }))).status, 200, 'outro endereço não é afetado');
  relogio.t += 61_000;
  assert.equal((await s.tratar(req(jwt({ sub: 'boa' }), TEL, { ip: '200.1.1.1' }))).status, 200, 'passado 1 minuto, volta');
});

test('r10-poda: enxurrada de outras pessoas não solta quem bateu no limite nem apaga o login guardado de quem está trabalhando', async () => {
  const ff = fakeFetch({ recusar: (sub) => String(sub).startsWith('lixo') });
  const { s } = novo(ff);
  const meu = jwt({ sub: 'ana' });
  for (let i = 0; i < 20; i++) assert.equal((await s.tratar(req(meu, TEL, { ip: '10.0.0.1' }))).status, 200);
  assert.equal((await s.tratar(req(meu, TEL, { ip: '10.0.0.1' }))).status, 429, 'a Ana bateu nos 20 por minuto');
  for (let i = 0; i < 520; i++) await s.tratar(req(jwt({ sub: 'p' + i }), TEL, { ip: '11.0.' + (i >> 8) + '.' + (i & 255) }));
  assert.equal((await s.tratar(req(meu, TEL, { ip: '10.0.0.1' }))).status, 429, 'antes: o mapa era zerado com 500 pessoas e a Ana voltava a pedir');

  // login guardado: 320 tokens inventados (um endereço cada) não fazem a Central reconferir a Bia no Supabase
  const ff2 = fakeFetch({ recusar: (sub) => String(sub).startsWith('lixo') });
  const { s: s2 } = novo(ff2);
  const bia = jwt({ sub: 'bia' });
  assert.equal((await s2.tratar(req(bia, TEL, { ip: '10.0.0.2' }))).status, 200);
  for (let i = 0; i < 320; i++) await s2.tratar(req(jwt({ sub: 'lixo' + i }), TEL, { ip: '12.0.' + (i >> 8) + '.' + (i & 255) }));
  assert.equal((await s2.tratar(req(bia, TEL, { ip: '10.0.0.2' }))).status, 200);
  const daBia = ff2.doAuth().filter((c) => c.op.headers.Authorization === 'Bearer ' + bia).length;
  assert.equal(daBia, 1, 'o login da Bia foi conferido uma vez só (antes: 2, o guardado era apagado junto com o lixo)');

  // a regra pura: tira os vencidos e, se ainda sobra, quem pesa menos
  const m = new Map([['a', { vivo: true, n: 9 }], ['b', { vivo: false, n: 9 }], ['c', { vivo: true, n: 1 }], ['d', { vivo: true, n: 5 }]]);
  podar(m, 2, (v) => v.vivo, (v) => v.n);
  assert.deepEqual([...m.keys()], ['a', 'd']);
});

test('r10-motivo: frase de erro do banco não vai para a tela; só código curto passa', async () => {
  const pedir = async (erro) => (await novo(fakeFetch({ links: { ok: false, erro } })).s.tratar(req(jwt(), TEL))).corpo;
  assert.deepEqual(await pedir('cliente_nao_encontrado'), { ok: false, motivo: 'cliente_nao_encontrado' });
  assert.deepEqual(await pedir('permission denied for table clientes'), { ok: false, motivo: 'indisponivel' });
  assert.deepEqual(await pedir('ERROR: relation "public.x" does not exist'), { ok: false, motivo: 'indisponivel' });
  assert.deepEqual(await pedir({ message: 'x' }), { ok: false, motivo: 'indisponivel' });
  assert.equal(motivoSeguro(undefined), 'indisponivel');
});

test('r10-esperar: 405 diz o método (Allow), limite e "não consegui conferir o acesso" dizem em quanto tempo tentar (Retry-After)', async () => {
  const { s } = novo(fakeFetch());
  const r405 = await s.tratar(req(jwt(), TEL, { metodo: 'GET' }));
  assert.equal(r405.status, 405); assert.equal(r405.cabecalhos.Allow, 'POST');
  for (let i = 0; i < 20; i++) await s.tratar(req(jwt(), TEL));
  const r429 = await s.tratar(req(jwt(), TEL));
  assert.equal(r429.status, 429); assert.equal(r429.cabecalhos['Retry-After'], '60');
  const r503 = await novo(fakeFetch({ perfilStatus: 500 })).s.tratar(req(jwt(), TEL));
  assert.equal(r503.status, 503); assert.equal(r503.cabecalhos['Retry-After'], '30');
});

test('r10-ip: o endereço do pedido vem da Cloudflare quando existe; cabeçalho estranho é ignorado', () => {
  assert.equal(ipDoPedido({ headers: { 'cf-connecting-ip': '187.10.20.30', 'x-forwarded-for': '1.2.3.4' } }), '187.10.20.30');
  assert.equal(ipDoPedido({ headers: { 'cf-connecting-ip': '<script>', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '1.2.3.4');
  assert.equal(ipDoPedido({ headers: {}, socket: { remoteAddress: '10.0.0.9' } }), '10.0.0.9');
  assert.equal(ipDoPedido({}), '?');
});
