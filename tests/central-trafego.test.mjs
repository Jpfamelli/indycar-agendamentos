// IndyCar Central — rodada 8: o Tráfego (apps/trafego) montado em /trafego/.
// O que este arquivo prova: (1) o app sobe junto com os outros quatro e entra no /api/ping, na saúde e no
// desligamento; (2) as rotas públicas dele (rastreio, porta da IA, MCP, cron) atravessam a Central sem que ela
// exija login, responda OPTIONS, mexa em CORS ou troque cabeçalho ou corpo; (3) se ele não subir, só /trafego/*
// responde 503; (4) as rotinas dele ficam desligadas e só ligam com TRAFEGO_AUTOMATICO=1; (5) tudo que ele
// importa existe no node_modules da raiz (o Render instala só a raiz).
// Sem banco e sem rede: o Supabase aponta para uma porta morta e nada roda sozinho.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire, builtinModules } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ENV_TESTE = {
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
};
Object.assign(process.env, ENV_TESTE);
delete process.env.RENDER;
delete process.env.TRAFEGO_AUTOMATICO;
delete process.env.ADS_CRON_TOKEN;
delete process.env.ADS_DEMO;
// de propósito: o nome que o app lê quando roda sozinho NÃO pode ligar nada dentro da Central
process.env.ADS_AUTOMATICO = '1';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const lerJson = (...partes) => JSON.parse(readFileSync(join(RAIZ, ...partes), 'utf8'));
// As regras puras da Casa (cartões, permissões, links). O "await" fica aqui em cima, antes de qualquer test():
// com ele no meio do arquivo, um filtro por nome encerrava a raiz antes de os últimos testes serem registrados.
await import('../casa/logica.js');
const L = globalThis.CasaLogica;
const lerCasa = (f) => readFileSync(join(RAIZ, 'casa', f), 'utf8');
const ORIGEM_CENTRAL = 'https://indycar-agendamentos.onrender.com/';

let srv, porta, APPS, central;
before(async () => {
  central = await import('../central.js');
  ({ APPS } = await central.iniciarCentral({ ouvir: false }));
  // a saúde dos apps de fora (Pátio, Orçador) não vai à rede nos testes
  central.definirSondaParaTeste(async () => ({ ok: true, status: 200, ms: 1 }));
  srv = http.createServer(central.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  porta = srv.address().port;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));

/** Pedido com controle total de método, cabeçalhos e corpo (o fetch esconde ou reescreve alguns). */
function pedir(metodo, caminho, { headers = {}, corpo = null } = {}) {
  return new Promise((ok, falha) => {
    const req = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, headers }, (res) => {
      const partes = [];
      res.on('data', (d) => partes.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(partes);
        ok({ status: res.statusCode, headers: res.headers, corpo: buf, texto: buf.toString('utf8'), json: () => JSON.parse(buf.toString('utf8')) });
      });
    });
    req.on('error', falha);
    if (corpo !== null) req.write(corpo);
    req.end();
  });
}

/** Troca o Tráfego por um dublê que anota o que a Central entregou e responde o que o teste mandar. */
async function comDuble(responder, acao) {
  const original = APPS.trafego.handler;
  const vistos = [];
  APPS.trafego.handler = (req, res) => {
    const partes = [];
    req.on('data', (d) => partes.push(d));
    req.on('end', () => {
      vistos.push({ metodo: req.method, url: req.url, prefixo: req.prefixo, headers: { ...req.headers }, corpo: Buffer.concat(partes) });
      responder(req, res);
    });
  };
  try { return { resposta: await acao(), vistos }; } finally { APPS.trafego.handler = original; }
}

/* ------------------------------ 1) montagem ------------------------------ */

test('o Tráfego sobe junto com os outros quatro e o /api/ping da Central diz a versão dele', async () => {
  assert.equal(typeof APPS.trafego?.handler, 'function', 'Tráfego carregou' + (APPS.trafego?.erro ? ': ' + APPS.trafego.erro : ''));
  assert.equal(APPS.trafego.prefixo, '/trafego');
  const r = await pedir('GET', '/api/ping');
  assert.equal(r.status, 200);
  const j = r.json();
  assert.equal(j.ok, true);
  assert.deepEqual(Object.keys(j.apps), ['agenda', 'crm', 'comunicar', 'atendimento', 'trafego']);
  assert.deepEqual(j.apps.trafego, { ok: true, versao: lerJson('apps', 'trafego', 'package.json').version, prefixo: '/trafego/' });
  assert.match(j.versao, /central-r8$/, 'a versão da Central mudou junto (a fumaça compara com a publicada)');
});

test('saúde que a Casa lê: o Tráfego entra na lista dos apps internos', async () => {
  const j = (await pedir('GET', '/api/central/saude-apps')).json();
  assert.deepEqual(j.internos.trafego, { ok: true });
  assert.deepEqual(Object.keys(j.internos), ['agenda', 'crm', 'comunicar', 'atendimento', 'trafego']);
  const i = central.internosDaCentral({ agenda: { handler: () => {} }, trafego: { handler: null, erro: 'x' } });
  assert.deepEqual(i.trafego, { ok: false, motivo: 'nao_subiu' });
  assert.deepEqual(central.internosDaCentral({}).trafego, { ok: false, motivo: 'ausente' });
});

test('/trafego sem barra vira /trafego/ (308) mantendo a consulta e o método', async () => {
  let r = await pedir('GET', '/trafego?periodo=7d&x=%C3%A1');
  assert.equal(r.status, 308); assert.equal(r.headers.location, '/trafego/?periodo=7d&x=%C3%A1');
  r = await pedir('POST', '/trafego', { headers: { 'Content-Type': 'application/json' }, corpo: '{"a":1}' });
  assert.equal(r.status, 308); assert.equal(r.headers.location, '/trafego/');
  r = await pedir('GET', '/trafegozinho');
  assert.notEqual(r.headers.location, '/trafegozinho/', 'só /trafego e /trafego/… são do app');
});

test('rotas do app de verdade através da Central: ping, tela, API sem login e cron sem chave', async () => {
  let r = await pedir('GET', '/trafego/api/ping');
  assert.equal(r.status, 200); assert.match(r.headers['content-type'], /application\/json/); assert.equal(r.json().ok, true);
  r = await pedir('GET', '/trafego/');
  assert.equal(r.status, 200); assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.texto, /<html/i);
  // rota com login: a Central não pede login por conta própria; quem responde 401 é o app, em JSON
  r = await pedir('GET', '/trafego/api/hoje');
  assert.equal(r.status, 401); assert.match(r.headers['content-type'], /application\/json/);
  assert.equal(typeof r.json().erro, 'string');
  // cron: quem confere a chave é o app (a resposta fala da chave, não de login)
  r = await pedir('POST', '/trafego/api/cron/sync?chave=errada');
  assert.equal(r.status, 401); assert.match(r.json().erro, /chave/);
  // a biblioteca do login da tela vem do node_modules da raiz do monorrepo
  r = await pedir('GET', '/trafego/vendor/supabase.js');
  assert.equal(r.status, 200); assert.match(r.headers['content-type'], /javascript/);
  assert.ok(r.corpo.length > 10_000, 'o arquivo do Supabase veio inteiro');
});

/* --------------- 2) a Central não fica no meio do caminho --------------- */

test('a Central entrega o pedido inteiro: método, caminho sem o prefixo, consulta, cabeçalhos (Authorization, Origin, Mcp-*) e corpo', async () => {
  const corpo = Buffer.concat([Buffer.from('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"saúde","lixo":"', 'utf8'), Buffer.alloc(200_000, 0x61), Buffer.from('"}}', 'utf8')]);
  const enviados = {
    Authorization: 'Bearer ica_' + 'x'.repeat(40), Origin: 'https://site-de-fora.example', 'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'saude',
    'Mcp-Session-Id': 'sessao-de-teste', 'X-Forwarded-For': '203.0.113.7, 10.0.0.1', 'Content-Length': String(corpo.length),
  };
  const { resposta, vistos } = await comDuble((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); },
    () => pedir('POST', '/trafego/mcp?x=1&y=%C3%A1%20b', { headers: enviados, corpo }));
  assert.equal(resposta.status, 200);
  assert.equal(vistos.length, 1);
  const v = vistos[0];
  assert.equal(v.metodo, 'POST');
  assert.equal(v.url, '/mcp?x=1&y=%C3%A1%20b', 'sem o prefixo e com a consulta como veio');
  assert.equal(v.prefixo, '/trafego');
  for (const [nome, valor] of Object.entries(enviados)) assert.equal(v.headers[nome.toLowerCase()], valor, nome);
  assert.equal(v.headers.host, `127.0.0.1:${porta}`, 'Host intacto (o app compara com a Origin)');
  assert.ok(v.corpo.equals(corpo), 'corpo de 200 KB byte a byte');
});

test('a Central não responde OPTIONS no lugar do app nem põe CORS: o preflight de um site de fora chega ao Tráfego', async () => {
  const { resposta, vistos } = await comDuble((req, res) => {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    res.end();
  }, () => pedir('OPTIONS', '/trafego/api/rastreio', { headers: { Origin: 'https://site-de-fora.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }));
  assert.equal(vistos[0].metodo, 'OPTIONS');
  assert.equal(vistos[0].url, '/api/rastreio');
  assert.equal(vistos[0].headers.origin, 'https://site-de-fora.example');
  assert.equal(vistos[0].headers['access-control-request-method'], 'POST');
  assert.equal(resposta.status, 204);
  assert.equal(resposta.headers['access-control-allow-origin'], '*');
  assert.equal(resposta.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
  assert.equal(resposta.headers['access-control-allow-headers'], 'Content-Type, Authorization');
});

test('a resposta do app sai como ele mandou: a Central só acrescenta o X-Request-Id (nada de CSP, X-Frame-Options ou CORS por cima)', async () => {
  // o que o app não mandou, a Central não inventa
  let { resposta } = await comDuble((req, res) => { res.writeHead(200); res.end('ok'); }, () => pedir('GET', '/trafego/rastreio.js'));
  const DO_NODE = new Set(['date', 'connection', 'keep-alive', 'transfer-encoding', 'content-length']);
  assert.deepEqual(Object.keys(resposta.headers).filter((h) => !DO_NODE.has(h)), ['x-request-id']);
  // o que o app mandou chega igual (script de fora: JavaScript, CORS livre, pode ser embutido em outro site)
  const doApp = {
    'Content-Type': 'text/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff',
  };
  ({ resposta } = await comDuble((req, res) => { res.writeHead(200, doApp); res.end('/* rastreio */'); }, () => pedir('GET', '/trafego/rastreio.js')));
  for (const [nome, valor] of Object.entries(doApp)) assert.equal(resposta.headers[nome.toLowerCase()], valor, nome);
  for (const proibido of ['content-security-policy', 'x-frame-options', 'x-indycar-app', 'strict-transport-security']) assert.equal(resposta.headers[proibido], undefined, proibido);
  assert.equal(resposta.texto, '/* rastreio */');
});

test('recusas do app chegam inteiras: 405 com Allow (GET no MCP) e 401 com WWW-Authenticate (sem chave)', async () => {
  let { resposta } = await comDuble((req, res) => { res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"erro":"use POST"}'); },
    () => pedir('GET', '/trafego/mcp'));
  assert.equal(resposta.status, 405); assert.equal(resposta.headers.allow, 'POST'); assert.equal(resposta.json().erro, 'use POST');
  ({ resposta } = await comDuble((req, res) => { res.writeHead(401, { 'WWW-Authenticate': 'Bearer', 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"erro":"sem chave"}'); },
    () => pedir('POST', '/trafego/api/ia/v1/saude', { headers: { 'Content-Type': 'application/json' }, corpo: '{}' })));
  assert.equal(resposta.status, 401); assert.equal(resposta.headers['www-authenticate'], 'Bearer'); assert.equal(resposta.json().erro, 'sem chave');
});

test('caminho com barras a mais depois do prefixo chega ao app como caminho (nunca como endereço de outro site)', async () => {
  const { vistos } = await comDuble((req, res) => { res.writeHead(200); res.end('ok'); }, async () => {
    await pedir('GET', '/trafego//evil.example/api/ping?a=1');
    await pedir('GET', '/trafego///mcp');
    return pedir('GET', '/trafego/api/../mcp');
  });
  assert.deepEqual(vistos.map((v) => v.url), ['/evil.example/api/ping?a=1', '/mcp', '/mcp']);
});

/* --------------------- 3) um app caído não leva os outros --------------------- */

test('sem sessão, /?voltar=/trafego/ abre a Casa (antes ia parar na Agenda); links antigos da Agenda continuam indo para /agenda/', async () => {
  let r = await pedir('GET', '/?voltar=' + encodeURIComponent('/trafego/#/jornada'));
  assert.equal(r.status, 200, 'a Casa responde, sem redirecionar');
  assert.match(r.texto, /\/casa\/casa\.js\?v=/, 'é a página da Casa');
  r = await pedir('GET', '/?agendamento=123');
  assert.equal(r.status, 308); assert.equal(r.headers.location, '/agenda/?agendamento=123');
  r = await pedir('GET', '/?busca=placa');
  assert.equal(r.status, 200, '/?busca= continua sendo da Casa');
});

test('se o Tráfego não subir, a Central segue no ar e responde 503 só em /trafego/*', async () => {
  const antes = APPS.trafego;
  APPS.trafego = { prefixo: '/trafego', handler: null, erro: 'não carregou (teste)' };   // o estado que carregar() deixa quando o require falha
  try {
    for (const caminho of ['/trafego/', '/trafego/api/ping', '/trafego/rastreio.js', '/trafego/mcp']) {
      const r = await pedir(caminho.endsWith('/mcp') ? 'POST' : 'GET', caminho);
      assert.equal(r.status, 503, caminho);
      assert.equal(r.headers['retry-after'], '60', caminho);
      const j = r.json();
      assert.equal(j.app, 'trafego'); assert.match(j.erro, /^O Tráfego não subiu nesta Central\./);
      assert.doesNotMatch(r.texto, /não carregou \(teste\)/, 'o motivo interno não vai para fora');
    }
    assert.equal((await pedir('GET', '/crm/api/ping')).status, 200);
    assert.equal((await pedir('GET', '/comunicar/api/ping')).status, 200);
    assert.equal((await pedir('GET', '/agenda/api/config')).status, 200);
    assert.equal((await pedir('GET', '/')).status, 200);
    const ping = await pedir('GET', '/api/ping');
    assert.equal(ping.status, 200);
    const j = ping.json();
    assert.equal(j.ok, false, 'a Central avisa que falta um app');
    assert.deepEqual(j.apps.trafego, { ok: false });
    assert.equal(j.apps.crm.ok, true);
    assert.deepEqual(central.internosDaCentral().trafego, { ok: false, motivo: 'nao_subiu' });
  } finally { APPS.trafego = antes; }
  assert.equal((await pedir('GET', '/trafego/api/ping')).status, 200, 'voltou');
});

/* ------------------------------ 4) rotinas ------------------------------ */

test('rotinas do Tráfego: desligadas por padrão, mesmo com ADS_AUTOMATICO=1; a porta própria do app não abre', () => {
  assert.equal(central.rotinasDoTrafegoLigadas({}), false);
  assert.equal(central.rotinasDoTrafegoLigadas({ ADS_AUTOMATICO: '1' }), false);
  assert.equal(central.rotinasDoTrafegoLigadas({ TRAFEGO_AUTOMATICO: '0' }), false);
  assert.equal(central.rotinasDoTrafegoLigadas({ TRAFEGO_AUTOMATICO: 'true' }), false, 'só o valor 1 liga');
  assert.equal(central.rotinasDoTrafegoLigadas({ TRAFEGO_AUTOMATICO: '1' }), true);
  assert.deepEqual(APPS.trafego.ligado, { automatico: false });
  assert.equal(require('../apps/trafego/agenda.js').estado.ligado, false, 'o piloto automático do app está parado');
  assert.equal(process.env.ADS_AUTOMATICO, '0', 'a Central repassa a decisão dela ao app (a tela do app diz a verdade)');
  assert.equal(require('../apps/trafego/server.js').servidor.listening, false, 'o app sobe dentro da Central sem abrir porta própria');
});

test('rotinas do Tráfego: TRAFEGO_AUTOMATICO=1 liga o piloto e o desligamento da Central para ele', () => {
  const codigo = `
    const c = await import('${new URL('../central.js', import.meta.url).href}');
    const { createRequire } = await import('node:module');
    const { EventEmitter } = await import('node:events');
    const piloto = createRequire('${new URL('../central.js', import.meta.url).href}')('./apps/trafego/agenda.js');
    const { APPS } = await c.iniciarCentral({ ouvir: false });
    console.log('ANTES ligado=' + piloto.estado.ligado + ' automatico=' + APPS.trafego.ligado.automatico + ' env=' + process.env.ADS_AUTOMATICO);
    process.on('exit', () => console.log('DEPOIS ligado=' + piloto.estado.ligado));
    const proc = new EventEmitter(); proc.exit = () => {};
    c.instalarGuardas(proc);
    proc.emit('SIGTERM');
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { env: { ...process.env, ...ENV_TESTE, TRAFEGO_AUTOMATICO: '1', ADS_AUTOMATICO: '0' }, encoding: 'utf8', timeout: 60_000, cwd: RAIZ });
  assert.match(r.stdout, /ANTES ligado=true automatico=true env=1/, r.stdout + r.stderr);
  assert.match(r.stdout, /DEPOIS ligado=false/, r.stdout + r.stderr);
  assert.equal(r.status, 0, r.stderr);
});

/* --------------------------- 5) dependências --------------------------- */

/** Pacotes de fora (nem "node:", nem caminho relativo) que o código do app importa, fora das pastas só de desenvolvimento. */
function pacotesImportados(pasta) {
  const SO_DESENVOLVIMENTO = new Set(['node_modules', 'tests', 'test', 'scripts', 'qa-out']);
  const achados = new Map();
  const anotar = (alvo, arquivo) => {
    if (/^(\.|\/|node:|[a-z]+:)/.test(alvo)) return;
    const pacote = alvo.startsWith('@') ? alvo.split('/').slice(0, 2).join('/') : alvo.split('/')[0];
    if (builtinModules.includes(pacote)) return;
    if (!achados.has(pacote)) achados.set(pacote, []);
    achados.get(pacote).push(arquivo);
  };
  const andar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) { if (!SO_DESENVOLVIMENTO.has(e.name) && !/^[._]/.test(e.name)) andar(caminho); continue; }
      if (!/\.[cm]?js$/.test(e.name) || /\.test\.[cm]?js$/.test(e.name)) continue;
      const texto = readFileSync(caminho, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of texto.matchAll(/\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g)) anotar(m[2], caminho);
      for (const m of texto.matchAll(/\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g)) anotar(m[2], caminho);
      // import/export … from 'x' (pode quebrar em várias linhas; entre a palavra e o "from" não há aspas nem ponto e vírgula)
      for (const m of texto.matchAll(/(?:^|[\n;])\s*(?:import|export)\b[^'";]*?\bfrom\s*(['"])([^'"\n]+)\1/g)) anotar(m[2], caminho);
      for (const m of texto.matchAll(/(?:^|[\n;])\s*import\s*(['"])([^'"\n]+)\1/g)) anotar(m[2], caminho);
    }
  };
  andar(pasta);
  return achados;
}

test('dependências: a varredura acusa pacote de fora em require, import e import() e ignora o que é só de desenvolvimento', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'central-trafego-'));
  try {
    mkdirSync(join(pasta, 'rotas')); mkdirSync(join(pasta, 'tests')); mkdirSync(join(pasta, 'tela', '_mock'), { recursive: true });
    writeFileSync(join(pasta, 'a.js'), "const x = require('pacote-um');\n// require('so-comentario')\nconst fs = require('node:fs'), z = require('zlib'), l = require('./local');\n");
    writeFileSync(join(pasta, 'rotas', 'b.mjs'), "import {\n  um,\n  dois,\n} from '@escopo/pacote-dois/sub';\nimport 'pacote-tres';\nexport { x } from \"pacote-quatro\";\nconst m = await import('pacote-cinco');\nconst sql = db.from('tabela');\n");
    writeFileSync(join(pasta, 'tests', 'c.test.js'), "require('so-de-teste');\n");
    writeFileSync(join(pasta, 'tela', '_mock', 'd.mjs'), "import p from 'puppeteer-core';\n");
    assert.deepEqual([...pacotesImportados(pasta).keys()].sort(), ['@escopo/pacote-dois', 'pacote-cinco', 'pacote-quatro', 'pacote-tres', 'pacote-um']);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('dependências: tudo que o Tráfego importa está no package.json da raiz e instalado no node_modules da raiz', () => {
  const raiz = lerJson('package.json').dependencies || {};
  const importados = pacotesImportados(join(RAIZ, 'apps', 'trafego'));
  assert.ok(importados.has('@supabase/supabase-js') && importados.has('@anthropic-ai/sdk'), 'a varredura enxerga os pacotes conhecidos: ' + [...importados.keys()].join(', '));
  for (const [pacote, arquivos] of importados) {
    assert.ok(pacote in raiz, `${pacote} (usado em ${arquivos[0].slice(RAIZ.length)}) precisa estar em "dependencies" do package.json da raiz: o Render instala só a raiz`);
    assert.ok(existsSync(join(RAIZ, 'node_modules', ...pacote.split('/'), 'package.json')), `${pacote} instalado no node_modules da raiz`);
  }
  // o que o app declara como dependência dele também tem de existir na raiz
  for (const pacote of Object.keys(lerJson('apps', 'trafego', 'package.json').dependencies || {})) assert.ok(pacote in raiz, `${pacote} está no package.json do app mas não no da raiz`);
});

/* ------------------------------ 6) cartão na Casa ------------------------------ */

test('Casa: cartão "Tráfego" abre em /trafego/, com a chave de acesso "ads" e o desenho dos outros cartões', () => {
  assert.deepEqual(L.APPS.ads, { k: 'ads', nome: 'Tráfego', desc: 'anúncios e de onde vêm os clientes', ico: '📢', base: '/trafego/' });
  assert.equal(L.bases().ads, '/trafego/');
  assert.equal(L.nomeDaAba('ads'), 'indycar-ads', 'a mesma aba nomeada que os outros apps usam para o Tráfego');
  assert.equal(L.appDoLink('/trafego/?periodo=7d', ORIGEM_CENTRAL), 'ads');
  assert.equal(L.appDoLink('/trafego', ORIGEM_CENTRAL), 'ads');
  assert.equal(L.appDoLink('https://site-de-fora.example/trafego/', ORIGEM_CENTRAL), null);
  // sem emoji novo: o ícone é o que a Casa já usa para "Anúncios" na origem das tarefas
  assert.ok(lerCasa('logica4.js').includes(`ads: { ico: '${L.APPS.ads.ico}'`), 'ícone já usado pela Casa');
  // palavras do dono: sem sigla, sem "lead", sem "veículo", sem travessão
  assert.doesNotMatch(L.APPS.ads.nome + ' ' + L.APPS.ads.desc, /lead|roas|cpa|ctr|ve[ií]culo|—|–/i);
});

test('Casa: o cartão aparece para quem tem o app "ads" liberado (mesma regra dos outros cartões)', () => {
  assert.equal(L.podeUsar({ papel: 'admin', ativo: true, apps: [] }, 'ads'), true, 'administrador vê todos');
  assert.equal(L.podeUsar({ papel: 'gestor', ativo: true, apps: ['crm', 'ads'] }, 'ads'), true);
  assert.equal(L.podeUsar({ papel: 'gestor', ativo: true, apps: ['crm', 'agenda'] }, 'ads'), false);
  assert.equal(L.podeUsar({ papel: 'atendente', ativo: true, apps: ['atendimento', 'crm'] }, 'ads'), false);
  assert.equal(L.podeUsar({ papel: 'mecanico', ativo: true, apps: ['patio'] }, 'ads'), false);
  assert.equal(L.podeUsar({ papel: 'agenda', ativo: true, apps: ['agenda', 'ads'] }, 'ads'), false, 'recepção só usa Agenda e Pátio');
  assert.equal(L.podeUsar({ papel: 'gestor', ativo: false, apps: ['ads'] }, 'ads'), false, 'desativado não vê nada');
});

test('Casa: aviso do Tráfego no sino leva para dentro de /trafego/ (antes caía na raiz e ia parar na Agenda)', () => {
  const b = L.bases();
  assert.equal(L.linkDaNotificacao({ app: 'ads', link: '/?aba=radar' }, b, ORIGEM_CENTRAL), 'https://indycar-agendamentos.onrender.com/trafego/?aba=radar');
  assert.equal(L.linkDaNotificacao({ app: 'ads', link: '' }, b, ORIGEM_CENTRAL), '/trafego/');
  assert.equal(L.linkDaNotificacao({ app: 'ads', link: 'javascript:alert(1)' }, b, ORIGEM_CENTRAL), '/trafego/');
  assert.equal(L.linkDaNotificacao({ app: 'ads', link: 'https://site-de-fora.example/x' }, b, ORIGEM_CENTRAL), '/trafego/');
});

test('Casa: a grade desenha o Tráfego por último (as posições 1 a 6 dos atalhos não mudam) e a página pede os arquivos novos', () => {
  const ordem = JSON.parse(/const ORDEM_APPS = (\[[^\]]+\]);/.exec(lerCasa('casa.js'))[1].replace(/'/g, '"'));
  assert.deepEqual(ordem, ['agenda', 'atendimento', 'crm', 'comunicar', 'patio', 'orcador', 'ads']);
  for (const k of ordem) assert.equal(L.APPS[k]?.k, k, `${k} existe na lista de apps (senão a grade quebra ao desenhar)`);
  const html = lerCasa('index.html');
  assert.ok(Number(/\/casa\/logica\.js\?v=(\d+)/.exec(html)[1]) >= 5, 'logica.js com versão nova no endereço');
  assert.ok(Number(/\/casa\/casa\.js\?v=(\d+)/.exec(html)[1]) >= 6, 'casa.js com versão nova no endereço');
  assert.match(html, /Um login só para Agenda, Atendimento, CRM, Comunicar, Tráfego, Pátio e Orçador\./);
});

/* ------------------- revisão de regressão (19/11): entrar pela Casa e voltar ao Tráfego ------------------- */

test('Casa: só volta para caminho interno de um app da Central (nada de endereço de fora)', () => {
  assert.equal(L.voltarSeguro('/trafego/'), '/trafego/');
  assert.equal(L.voltarSeguro('/trafego/#/jornada?contato=1'), '/trafego/#/jornada?contato=1');
  assert.equal(L.voltarSeguro('/crm/?lead=1'), '/crm/?lead=1');
  for (const ruim of ['//site-de-fora.example/trafego/', '/\site-de-fora.example', 'https://site-de-fora.example/trafego/',
    'javascript:alert(1)', '/casa/', '/', '', null, undefined, 42, '/trafego/\u0000x', '/trafego/' + 'x'.repeat(400)]) {
    assert.equal(L.voltarSeguro(ruim), '', `recusa ${JSON.stringify(ruim)}`);
  }
  assert.equal(L.voltarSeguro('/trafego/../agenda/'), '/agenda/', 'caminho normalizado, ainda interno');
  const casa = lerCasa('casa.js');
  assert.match(casa, /voltarPedido = L\.voltarSeguro\(p\.get\('voltar'\) \|\| ''\)/, 'a Casa lê o voltar pela regra segura');
  assert.match(casa, /if \(voltarPedido\) \{ const v = voltarPedido; voltarPedido = ''; location\.replace\(v\); return; \}/, 'e volta depois do login');
});

test('Casa: o cartão do Tráfego segue a regra do app (administrador, ou gestor com "ads" na lista)', () => {
  assert.equal(L.podeUsar({ papel: 'atendente', ativo: true, apps: ['ads'] }, 'ads'), false, 'atendente com ads na lista: o app recusa, a Casa não mostra');
  assert.equal(L.podeUsar({ papel: 'atendente', ativo: true }, 'ads'), false, 'atendente sem lista');
  assert.equal(L.podeUsar({ papel: 'gestor', ativo: true }, 'ads'), false, 'gestor sem lista');
  assert.equal(L.podeUsar({ papel: 'gestor', ativo: true, apps: ['ads'] }, 'ads'), true);
  assert.equal(L.podeUsar({ papel: 'admin', ativo: true }, 'ads'), true);
  assert.equal(L.podeUsar({ papel: 'gestor', ativo: true }, 'crm'), true, 'os outros cartões não mudam');
});
