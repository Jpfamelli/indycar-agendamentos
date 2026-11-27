// R20 — CRM e Atendimento num app só: a regra do redirecionamento (pura), a Central de verdade (handler, sem rede)
// e o cartão único da Casa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { destinoDoAtendimento } from '../lib/crm-atendimento.js';


test('destinoDoAtendimento: a página do Atendimento vai para /crm/ na aba Conversas, levando o endereço antigo', () => {
  assert.equal(destinoDoAtendimento('/atendimento/', ''), '/crm/?aba=conversas');
  assert.equal(destinoDoAtendimento('/atendimento/index.html', ''), '/crm/?aba=conversas');
  assert.equal(destinoDoAtendimento('/atendimento/', '?conversa=c0000000-0000-4000-8000-000000000002'), '/crm/?aba=conversas&atd=' + encodeURIComponent('conversa=c0000000-0000-4000-8000-000000000002'));
  const d = destinoDoAtendimento('/atendimento/', '?aba=orcador&tel=12977776666&nome=Renata Souza');
  const q = new URL(d, 'http://x').searchParams;
  assert.equal(q.get('aba'), 'conversas');
  assert.equal(new URLSearchParams(q.get('atd')).get('nome'), 'Renata Souza', 'o que vinha no endereço chega inteiro');
  assert.ok(!d.includes('#'), 'sem "#": o fragmento do link antigo (#/historico/<id>) sobrevive ao redirecionamento');
  assert.equal(destinoDoAtendimento('/atendimento/', 'tel=12977776666'), '/crm/?aba=conversas&atd=tel%3D12977776666', 'com ou sem "?" na frente');
});

test('destinoDoAtendimento: embutido, API, arquivos e outros métodos passam direto', () => {
  assert.equal(destinoDoAtendimento('/atendimento/', '?embutido=1'), null);
  assert.equal(destinoDoAtendimento('/atendimento/', '?embutido=1&painel=1&tel=12977776666'), null);
  assert.notEqual(destinoDoAtendimento('/atendimento/', '?embutido=0'), null, 'só embutido=1 vale');
  assert.notEqual(destinoDoAtendimento('/atendimento/', '?x=embutido=1'), null);
  for (const c of ['/atendimento/api/config', '/atendimento/app.js', '/atendimento/sw.js', '/atendimento/manifest.json', '/atendimento', '/crm/', '/', '/atendimento/webhook/whatsapp']) assert.equal(destinoDoAtendimento(c, ''), null, c);
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.equal(destinoDoAtendimento('/atendimento/', '', m), null, m);
  assert.notEqual(destinoDoAtendimento('/atendimento/', '', 'HEAD'), null);
});

/* ---------------- a Central de verdade ---------------- */
const PROJETO = 'projeto-de-teste-r20.supabase.co';
const fetchDeVerdade = globalThis.fetch;
globalThis.fetch = (url, ...resto) => (/\.supabase\.co/.test(String(url && url.url ? url.url : url))
  ? Promise.reject(new TypeError('teste sem rede: Supabase bloqueado')) : fetchDeVerdade(url, ...resto));
Object.assign(process.env, {
  SUPABASE_URL: `https://${PROJETO}`, SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;

let srv, base, central;
before(async () => {
  central = await import('../central.js');
  await central.iniciarCentral({ ouvir: false });
  srv = http.createServer(central.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));
const pega = (p, op = {}) => fetch(base + p, { redirect: 'manual', ...op });
const parte = (csp, nome) => (csp || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(nome + ' ')) || '';

test('Central: /atendimento/ responde 302 para /crm/ (sem cache), com o endereço antigo em "atd"', async () => {
  const r = await pega('/atendimento/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/crm/?aba=conversas');
  assert.match(r.headers.get('cache-control') || '', /no-store/, 'o navegador não pode decorar o redirecionamento');
  const c = await pega('/atendimento/?conversa=c0000000-0000-4000-8000-000000000002');
  assert.equal(c.status, 302);
  assert.equal(new URLSearchParams(new URL(c.headers.get('location'), base).searchParams.get('atd')).get('conversa'), 'c0000000-0000-4000-8000-000000000002');
  assert.equal((await pega('/atendimento/index.html')).status, 302);
  assert.equal((await pega('/atendimento/', { method: 'HEAD' })).status, 302);
});

test('Central: embutido=1 entrega a página do Atendimento, que só pode ser emoldurada pelo próprio site', async () => {
  const r = await pega('/atendimento/?embutido=1');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /id="telaApp"/);
  assert.match(html, /r20\.js/);
  const csp = r.headers.get('content-security-policy');
  assert.equal(parte(csp, 'frame-ancestors'), "frame-ancestors 'self'");
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  const api = await pega('/atendimento/api/config');
  assert.notEqual(api.status, 302, 'a API do Atendimento não é redirecionada');
  assert.equal(api.headers.get('x-frame-options'), 'DENY', 'a API continua sem poder ser emoldurada');
  for (const arq of ['app.js', 'apps.js', 'r20.js', 'r20-regras.js', 'r20.css', 'sw.js']) assert.equal((await pega('/atendimento/' + arq)).status, 200, arq);
});

test('Central: a página do CRM pode emoldurar o próprio site (e só ele) e continua sem poder ser emoldurada', async () => {
  const r = await pega('/crm/');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<title>[^<]*CRM e Atendimento/);
  const csp = r.headers.get('content-security-policy');
  assert.equal(parte(csp, 'frame-src'), "frame-src 'self'");
  assert.equal(parte(csp, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('permissions-policy') || '', /microphone=\(self\)/, 'gravar áudio na conversa embutida precisa do microfone liberado para o próprio site');
  assert.equal((await pega('/crm/?aba=conversas&atd=tel%3D12977776666')).status, 200, 'o destino do redirecionamento abre');
  for (const arq of ['r20.js', 'r20-regras.js', 'r20.css']) assert.equal((await pega('/crm/' + arq)).status, 200, arq);
});

test('Central: o Orçador continua em /orcador/ e as outras rotas do Atendimento não mudaram', async () => {
  const o = await pega('/orcador/');
  assert.ok([200, 404].includes(o.status), 'servido quando o build existe');
  if (o.status === 200) assert.doesNotMatch(parte(o.headers.get('content-security-policy'), 'frame-ancestors'), /'none'/, 'o Orçador precisa abrir dentro do app');
  assert.notEqual((await pega('/atendimento/api/health')).status, 302);
  assert.notEqual((await pega('/atendimento/', { method: 'POST' })).status, 302);
});

/* ---------------- Casa: um cartão só ---------------- */
await import('../casa/logica.js');
const L = globalThis.CasaLogica;
const ORDEM = JSON.parse(/const ORDEM_APPS = (\[[^\]]+\]);/.exec(readFileSync(new URL('../casa/casa.js', import.meta.url), 'utf8'))[1].replace(/'/g, '"'));
const nomes = (p) => L.cartoesDaCasa(p, ORDEM).map((c) => c.nome);

test('Casa: CRM e Atendimento viram um cartão só, "CRM e Atendimento", que abre /crm/', () => {
  const admin = L.cartoesDaCasa({ papel: 'admin', ativo: true }, ORDEM);
  assert.deepEqual(admin.map((c) => c.nome), ['Agenda', 'CRM e Atendimento', 'Comunicar', 'Pátio', 'Orçador', 'Tráfego']);
  const unico = admin.find((c) => c.nome === 'CRM e Atendimento');
  assert.equal(unico.k, 'crm');
  assert.equal(L.bases().crm, '/crm/');
  assert.equal(unico.num, 'atendimento', 'o número do cartão é o de conversas esperando');
  assert.equal(admin.filter((c) => c.k === 'crm' || c.k === 'atendimento').length, 1);
});

test('Casa: quem tinha só um dos dois continua vendo o cartão; quem não tinha nenhum, não', () => {
  const soAtd = { papel: 'atendente', ativo: true, apps: ['atendimento'] };
  const soCrm = { papel: 'atendente', ativo: true, apps: ['crm', 'agenda'] };
  assert.deepEqual(nomes(soAtd), ['CRM e Atendimento']);
  assert.equal(L.cartoesDaCasa(soAtd, ORDEM)[0].num, 'atendimento');
  assert.deepEqual(nomes(soCrm), ['Agenda', 'CRM e Atendimento']);
  assert.equal(L.cartoesDaCasa(soCrm, ORDEM)[1].num, 'crm', 'sem conversas, o número é o de contatos sem responsável');
  assert.deepEqual(nomes({ papel: 'agenda', ativo: true, apps: ['agenda', 'patio', 'crm', 'atendimento'] }), ['Agenda', 'Pátio'], 'recepção continua sem o cartão');
  assert.deepEqual(nomes({ papel: 'gestor', ativo: false, apps: ['crm'] }), []);
  assert.deepEqual(nomes(null), []);
});

test('Casa: a grade usa os cartões novos e os links antigos de conversa continuam apontando para /atendimento/', () => {
  const casa = readFileSync(new URL('../casa/casa.js', import.meta.url), 'utf8');
  assert.match(casa, /L\.cartoesDaCasa\(perfil, ORDEM_APPS\)/);
  assert.match(casa, /data-app-num="\$\{esc\(a\.num\)\}"/);
  const l = L.links(L.bases());
  assert.equal(l.conversaTel('12977776666').split('?')[0], '/atendimento/', 'o servidor redireciona: nada na Casa precisou mudar de endereço');
});
