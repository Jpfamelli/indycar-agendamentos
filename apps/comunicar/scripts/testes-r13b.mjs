// Rodada 13B · passagens entre apps, velocidade da tela de entrada e "Desfazer" (o roteiro de navegador de ponta a
// ponta é scripts/qa-r13b-passagens.mjs, com o servidor de mentira).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = ler('../public/app.js');

function appsNa(pathname) {
  const raiz = { location: { pathname, origin: 'https://central.exemplo' } };
  raiz.globalThis = raiz;
  vm.runInNewContext(ler('../public/apps.js'), raiz);
  return raiz.IndyApps;
}

test('na Central, os links para os outros apps são da mesma origem e levam o cliente certo (telefone sem 55)', () => {
  const { LINKS } = appsNa('/comunicar/');
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(LINKS.conversaTel('5512999990001'), 'https://central.exemplo/atendimento/?tel=12999990001');
  assert.equal(LINKS.clienteCrm(id, '5512999990001'), `https://central.exemplo/crm/?cliente=${id}&tel=12999990001`);
  assert.equal(LINKS.clienteAgenda(id, '(12) 99999-0001'), `https://central.exemplo/agenda/?cliente=${id}&tel=12999990001`);
});

test('a tela usa os links de apps.js; nenhum link solto com target="_blank" (a aba de cada app vem do ouvinte de apps.js)', () => {
  assert.doesNotMatch(app, /target="_blank"/, 'nenhum link do Comunicar abre aba sem nome');
  assert.match(app, /function linkCliente\(app, c\)[\s\S]{0,200}LINKS\.clienteCrm\?\.\(c\.id, c\.telefone\)/);
  assert.match(app, /function linkConversa\(tel\) \{ return LINKS\.conversaTel\?\.\(tel\)/);
  assert.match(app, /href="\$\{esc\(linkCliente\('crm', c\)\)\}"/);
  assert.match(app, /href="\$\{esc\(linkCliente\('agenda', c\)\)\}"/);
});

test('chegando por link de outro app, vai direto ao destino (sem desenhar as Réguas antes) e cai nas Réguas se não achar', () => {
  assert.match(app, /const comLink = \[\.\.\.new URLSearchParams\(location\.search\)\.keys\(\)\]\.some/);
  assert.match(app, /if \(!comLink\) await route\('reguas'\);\n  await abrirPorLink\(\);\n  if \(!state\._vez\) await route\('reguas'\);/);
});

test('tela de entrada leve: Réguas não pedem os prazos por serviço e a projeção é pedida uma vez só', () => {
  assert.match(app, /async function carregarConfig\(vez, \{ comRegras = false \} = \{\}\)/);
  assert.match(app, /carregarConfig\(vez, \{ comRegras: true \}\)/);
  assert.equal((app.match(/comRegras: true/g) || []).length, 1, 'só Ajustes pede os prazos');
  const r4 = ler('../public/rodada4.js');
  assert.match(r4, /if \(!forcar && _projecaoNoAr\) return _projecaoNoAr;/);
});

test('apagar um prazo por serviço oferece "Desfazer", que cria a regra de novo com os mesmos dados', () => {
  assert.match(app, /toastAcao\('Regra apagada\.', 'Desfazer', async \(\) => \{/);
  assert.match(app, /api\('POST', '\/regras-retorno', \{ rotulo, palavras: \(palavras \|\| \[\]\)\.join\(', '\), meses, mensagem: mensagem \|\| '', ativo, ordem \}\)/);
});

test('mesmos nomes do CRM: "contato" e "funil", não "lead" na tela', () => {
  assert.doesNotMatch(ler('../public/rodada4.js'), /lead\(s\)/);
  assert.doesNotMatch(app, /leads\/pipeline/);
});

/* ------------------------------ rodada 13C ------------------------------ */
function appsComJanela(pathname) {
  const abertas = [];
  const ouvintes = [];
  const raiz = { location: { pathname, origin: 'https://central.exemplo', href: 'https://central.exemplo' + pathname, assign() {} },
    document: { addEventListener: (tipo, fn) => ouvintes.push([tipo, fn]) },
    open: (u, nome) => { abertas.push([u, nome]); return { focus() {} }; }, URL, URLSearchParams };
  raiz.globalThis = raiz;
  vm.runInNewContext(ler('../public/apps.js'), raiz);
  const clicar = (href) => {
    let parado = false;
    const a = { href: new URL(href, raiz.location.href).href };
    const ev = { defaultPrevented: false, button: 0, target: { closest: () => a }, preventDefault() { parado = true; } };
    for (const [t, fn] of ouvintes) if (t === 'click') fn(ev);
    return parado;
  };
  return { I: raiz.IndyApps, abertas, clicar };
}

test('13C: cada app abre na aba nomeada dele; os links do próprio Comunicar seguem na mesma janela', () => {
  const { abertas, clicar } = appsComJanela('/comunicar/');
  assert.equal(clicar('/crm/?cliente=1'), true);
  assert.equal(clicar('/agenda/?cliente=1'), true);
  assert.equal(clicar('/atendimento/?tel=12999990001'), true);
  assert.equal(clicar('/orcador/#/orcamento/1'), true);
  assert.equal(clicar('https://indycar-patio.netlify.app/?os=1'), true);
  assert.deepEqual(abertas.map((x) => x[1]), ['indycar-crm', 'indycar-agenda', 'indycar-atendimento', 'indycar-orcador', 'indycar-patio']);
  assert.equal(clicar('/comunicar/?tela=mensagens'), false, 'tela do próprio Comunicar: mesma janela');
  assert.equal(clicar('https://wa.me/5512999990001'), false, 'WhatsApp e sites de fora não passam pelo ouvinte');
  assert.equal(abertas.length, 5);
});

test('13C: Orçador em /orcador/ da Central; link antigo do Netlify vira o mesmo orçamento na Central', () => {
  const { I, abertas, clicar } = appsComJanela('/comunicar/');
  const id = '00000000-0000-4000-8000-000000000040';
  assert.equal(I.LINKS.orcamento(id), `https://central.exemplo/orcador/#/orcamento/${id}`);
  assert.equal(I.LINKS.novoOrcamento({ telefone: '5512999990001', nome: 'Ana' }), 'https://central.exemplo/orcador/?tel=12999990001&nome=Ana');
  assert.equal(I.naCentral('https://indycar-orcador.netlify.app/#/historico/' + id), 'https://central.exemplo/orcador/#/historico/' + id);
  assert.equal(clicar('https://indycar-orcador.netlify.app/?tel=5512999990001'), true);
  assert.deepEqual(abertas[0], ['https://central.exemplo/orcador/?tel=5512999990001', 'indycar-orcador']);
  // no servidor (sem página) o Orçador também é o da Central, não o Netlify
  const raiz = { URL, URLSearchParams }; raiz.globalThis = raiz;
  vm.runInNewContext(ler('../public/apps.js'), raiz);
  assert.equal(raiz.IndyApps.LINKS.orcamento(id), `https://indycar-agendamentos.onrender.com/orcador/#/orcamento/${id}`);
});

test('13C: arquivo oculto, nome com ponto e pasta interna que não existem dão 404; tela sem ponto continua com a página', async () => {
  const { criarEstaticos, naoEPagina } = await import('../estaticos.js');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const http = (await import('node:http')).default;
  const pasta = mkdtempSync(join(tmpdir(), 'comunicar-13c-'));
  writeFileSync(join(pasta, 'index.html'), '<!doctype html><title>tela</title>');
  const servir = criarEstaticos({ pasta, mime: { '.html': 'text/html' } });
  const srv = http.createServer((req, res) => servir(req, res, new URL(req.url, 'http://x').pathname));
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    for (const p of ['/.env', '/.git/config', '/scripts/', '/tests/', '/node_modules/x', '/README.md', '/nao-existe.html', '/x/.htaccess']) {
      assert.equal((await fetch(base + p)).status, 404, p);
    }
    for (const p of ['/', '/qualquer-tela', '/mensagens/hoje']) assert.equal((await fetch(base + p)).status, 200, p);
    assert.equal(naoEPagina('/index.html'), true, 'só vale depois de o arquivo não existir (o index.html existe e é servido antes)');
  } finally { srv.close(); rmSync(pasta, { recursive: true, force: true }); }
});
