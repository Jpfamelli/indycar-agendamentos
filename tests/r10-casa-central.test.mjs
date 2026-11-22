// Casa e Central, rodada 10 (segurança, falha e desempenho): o roteador da Central pela porta, sem banco e sem rede.
// Cada teste aqui falha no código de antes da rodada 10 e passa no de agora.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';

Object.assign(process.env, {
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;

let srv, base, central, APPS;
before(async () => {
  central = await import('../central.js');
  ({ APPS } = await central.iniciarCentral({ ouvir: false }));
  srv = http.createServer(central.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));
const pega = (p, op = {}) => fetch(base + p, { redirect: 'manual', ...op });

test('r10-metodos: as rotas da Central e os arquivos da Casa só aceitam leitura (405 com Allow no resto)', async () => {
  for (const [metodo, rota] of [['POST', '/api/ping'], ['DELETE', '/api/ping'], ['POST', '/api/central/config'], ['PUT', '/api/central/config'], ['POST', '/api/central/saude-apps'], ['POST', '/casa/casa.js'], ['DELETE', '/casa/index.html']]) {
    const r = await pega(rota, { method: metodo });
    assert.equal(r.status, 405, `${metodo} ${rota}`);
    assert.equal(r.headers.get('allow'), 'GET, HEAD', `${metodo} ${rota}`);
    assert.equal(r.headers.get('x-indycar-app'), 'central');
  }
  const links = await pega('/api/central/links-cliente');
  assert.equal(links.status, 405); assert.equal(links.headers.get('allow'), 'POST');
  for (const rota of ['/api/ping', '/api/central/config', '/casa/casa.js']) assert.equal((await pega(rota)).status, 200, 'GET continua valendo em ' + rota);
  assert.equal((await pega('/api/ping', { method: 'HEAD' })).status, 200);
});

test('r10-rota-desconhecida: /api/central/<o que não existe> é 404 da Central (antes caía na Agenda)', async () => {
  for (const [metodo, rota] of [['GET', '/api/central/nao-existe'], ['POST', '/api/central/links-clientes'], ['GET', '/api/central'], ['GET', '/api/central/config/extra']]) {
    const r = await pega(rota, { method: metodo });
    assert.equal(r.status, 404, `${metodo} ${rota}`);
    assert.equal(r.headers.get('x-indycar-app'), 'central', rota);
    assert.deepEqual(await r.json(), { erro: 'Essa rota da Central não existe.' });
  }
});

test('r10-csp-banco: a Casa só fala com o Supabase da oficina (sem curinga *.supabase.co)', async () => {
  const csp = (await pega('/')).headers.get('content-security-policy');
  assert.doesNotMatch(csp, /\*\.supabase\.co/);
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:9 ws:\/\/127\.0\.0\.1:9 https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[\d.]+\/(;|$)/);
  const de = (u) => central.cspDaCasa({ SUPABASE_URL: u });
  assert.match(de('https://nppfq.supabase.co'), /connect-src 'self' https:\/\/nppfq\.supabase\.co wss:\/\/nppfq\.supabase\.co https:\/\/cdn/);
  assert.doesNotMatch(de('https://nppfq.supabase.co/'), /\*/);
  // endereço que não serve (vazio, http de fora, com senha embutida) não entra na política: fica o curinga de antes
  for (const ruim of ['', 'nada', 'http://outro.site', 'https://u:s@nppfq.supabase.co', 'javascript:alert(1)']) assert.match(de(ruim), /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co /, ruim);
});

test('r10-csp-imagens: imagem só da própria Casa (sem "data:"), e nenhuma tela da Casa usa imagem embutida', async () => {
  const csp = (await pega('/')).headers.get('content-security-policy');
  assert.match(csp, /img-src 'self'(;|$)/);
  const pasta = new URL('../casa/', import.meta.url);
  for (const f of readdirSync(pasta).filter((x) => /\.(js|css|html)$/.test(x))) {
    assert.doesNotMatch(readFileSync(new URL(f, pasta), 'utf8'), /data:image|url\(\s*["']?data:|toDataURL|createObjectURL/, f);
  }
});

test('r10-marca: cada CSS e JS do index leva a marca do conteúdo e, pedido com ela, fica guardado 1 ano (sem conferir a cada abertura)', async () => {
  const r = await pega('/');
  assert.equal(r.headers.get('cache-control'), 'no-cache', 'o index sempre confere');
  const html = await r.text();
  const pedidos = [...html.matchAll(/(?:href|src)="(\/casa\/([\w.-]+\.(?:css|js))\?v=([\w-]+))"/g)];
  assert.equal(pedidos.length, 22, '7 folhas de estilo e 15 scripts (rodada 11: saíram manha.js, tarefas.js e atalhos.js; entraram indycar.css e r11.css; rodada 13: entraram r13.css, logica5.js e mes.js)');
  const marcas = new Set();
  for (const [, url, nome, marca] of pedidos) {
    assert.match(marca, /^[\w-]{12}$/, nome + ': marca do conteúdo, não número escrito à mão');
    marcas.add(marca);
    const a = await pega(url, { headers: { 'Accept-Encoding': 'br' } });
    assert.equal(a.status, 200, url);
    assert.equal(a.headers.get('cache-control'), 'public, max-age=31536000, immutable', nome);
    assert.equal(a.headers.get('content-encoding'), 'br', nome);
  }
  assert.equal(marcas.size, 22, 'arquivos diferentes, marcas diferentes');
  // marca velha, marca inventada ou sem marca: confere com o servidor como antes (nunca fica preso num arquivo antigo)
  for (const url of ['/casa/casa.js', '/casa/casa.js?v=12', '/casa/casa.js?v=aaaaaaaaaaaa', '/casa/casa.css?v=']) assert.equal((await pega(url)).headers.get('cache-control'), 'no-cache', url);
  // o service worker e o index nunca ficam fixos, mesmo com "?v="
  assert.equal((await pega('/sw.js?v=qualquer')).headers.get('cache-control'), 'no-cache');
  assert.equal((await pega('/casa/archivo-variavel.woff2')).headers.get('cache-control'), 'public, max-age=2592000');
  // o ETag do index muda quando muda a marca de um arquivo (é calculado depois da troca)
  assert.notEqual(r.headers.get('etag'), null);
  assert.equal((await pega('/', { headers: { 'If-None-Match': r.headers.get('etag') } })).status, 304);
});

test('r10-log: pedido lento não escreve no log o token do link do cliente (pedaço comprido do endereço sai cortado)', () => {
  const c = central.caminhoParaLog;
  assert.equal(c('/confirmar/AbCdEf0123456789xyzQ'), '/confirmar/AbCd…');
  assert.equal(c('/api/ics/3f9c2b7a1d5e4f60a1b2c3d4e5f60718'), '/api/ics/3f9c…');
  assert.equal(c('/agenda/api/agendamentos'), '/agenda/api/agendamentos');
  assert.equal(c('/casa/barlow-condensed-800-italic.woff2'), '/casa/barlow-condensed-800-italic.woff2');
  assert.ok(c('/' + 'a/'.repeat(300)).length <= 160);
});

test('r10-app-fora: quem abre pelo navegador um app que não subiu vê uma página que explica (antes: JSON cru); a API continua em JSON', async () => {
  const guardado = APPS.crm.handler;
  APPS.crm.handler = null;
  try {
    const r = await pega('/crm/', { headers: { Accept: 'text/html,application/xhtml+xml' } });
    assert.equal(r.status, 503);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('retry-after'), '60');
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const html = await r.text();
    assert.match(html, /<h1[^>]*>O CRM não abriu agora<\/h1>/);
    assert.match(html, /O resto da Central continua funcionando/);
    assert.match(html, /<a class="btn btn-forte" href="\/crm\/">Tentar de novo<\/a>/);
    assert.match(html, /<a class="btn-link" href="\/">Voltar para a Casa<\/a>/);
    assert.doesNotMatch(html, /<script(?! src="\/casa\/tema\.js")|style=|—/, 'nada que a política de conteúdo barre, sem travessão');
    const api = await pega('/crm/api/config', { headers: { Accept: 'text/html' } });
    assert.equal(api.status, 503); assert.match(api.headers.get('content-type'), /json/);
    const js = await pega('/crm/', { headers: { Accept: 'application/json' } });
    assert.match(js.headers.get('content-type'), /json/);
    assert.equal((await pega('/crm/', { method: 'POST', headers: { Accept: 'text/html' } })).headers.get('content-type').includes('json'), true);
  } finally { APPS.crm.handler = guardado; }
});

test('r10-freio-saude: 600 endereços novos não soltam o endereço que já estava freado', () => {
  const t = Date.now();
  for (let i = 0; i < 40; i++) assert.equal(central.dentroDoFreioDaSaude('201.9.9.9', t), true);
  assert.equal(central.dentroDoFreioDaSaude('201.9.9.9', t), false);
  for (let i = 0; i < 600; i++) central.dentroDoFreioDaSaude('202.' + (i >> 8) + '.' + (i & 255) + '.1', t + 1);
  assert.equal(central.dentroDoFreioDaSaude('201.9.9.9', t + 2), false, 'antes: o mapa era zerado e o freado voltava a perguntar');
  assert.equal(central.dentroDoFreioDaSaude('201.9.9.9', t + 61_000), true, 'depois de 1 minuto, volta');
});

test('r10-sw-marcas: o service worker pede os mesmos endereços com marca que a página baixou (não baixa tudo de novo na primeira visita)', async () => {
  const html = await (await pega('/')).text();
  const doIndex = Object.fromEntries([...html.matchAll(/"(\/casa\/[\w.-]+\.(?:css|js))\?v=([\w-]+)"/g)].map((m) => [m[1], m[2]]));
  const r = await pega('/sw.js');
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  const fonte = await r.text();
  const marcas = JSON.parse(/const MARCAS = (\{[^;]*\});/.exec(fonte)[1]);
  for (const [caminho, marca] of Object.entries(doIndex)) assert.equal(marcas[caminho], marca, caminho + ': a mesma marca do index');
  assert.ok(Object.keys(doIndex).length >= 19);

  // roda a instalação do service worker servido, com rede e cache de mentira
  const pedidos = [], guardados = [], ouvintes = {};
  const cache = { put: async (chave, resp) => { guardados.push([chave, resp.url]); }, add: async () => {} };
  const mundo = {
    self: { addEventListener: (ev, fn) => { ouvintes[ev] = fn; }, skipWaiting: async () => {}, location: { origin: 'http://casa.local' }, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => [], match: async () => null, delete: async () => true },
    fetch: async (alvo) => { const url = typeof alvo === 'string' ? alvo : alvo.url; pedidos.push(url); return { ok: true, status: 200, type: 'basic', url, clone() { return this; } }; },
    Request: class { constructor(url) { this.url = url; } }, Response: { error: () => ({ ok: false }) }, URL, Promise, Error,
  };
  new Function(...Object.keys(mundo), fonte)(...Object.values(mundo));
  let espera = null;
  ouvintes.install({ waitUntil: (p) => { espera = p; } });
  await espera;
  for (const [caminho, marca] of Object.entries(doIndex)) {
    assert.ok(pedidos.includes(`${caminho}?v=${marca}`), 'pede com a marca: ' + caminho);
    assert.ok(guardados.some(([chave, url]) => chave === caminho && url === `${caminho}?v=${marca}`), 'guarda pelo caminho sem a marca: ' + caminho);
    assert.ok(!pedidos.includes(caminho), 'não pede de novo sem a marca: ' + caminho);
  }
  assert.ok(pedidos.includes('/'), 'a página inicial continua guardada para abrir sem internet');

  // um arquivo que falha derruba a instalação (não fica um cache pela metade)
  mundo.fetch = async (alvo) => ({ ok: !String(alvo).includes('painel.js'), status: 500, url: String(alvo) });
  const ouvintes2 = {};
  mundo.self.addEventListener = (ev, fn) => { ouvintes2[ev] = fn; };
  new Function(...Object.keys(mundo), fonte)(...Object.values(mundo));
  let espera2 = null;
  ouvintes2.install({ waitUntil: (p) => { espera2 = p; } });
  await assert.rejects(espera2, /falhou \/casa\/painel\.js/);
});
