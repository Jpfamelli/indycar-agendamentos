'use strict';
/* Rodada 13C: passagens do Atendimento dentro da Central — "/agenda/?tel=" com a barra, Orçador em /orcador/, Comunicar
   do endereço da Central (o servidor mandava o Render antigo fixo), Tráfego na aba indycar-trafego e a sessão única. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** apps.js de verdade numa página em <origem>/atendimento/ (como a Central monta). */
function appsNaCentral(origem = 'https://central.exemplo') {
  const abertas = [];
  const ctx = { location: new URL(origem + '/atendimento/'), URL, document: { querySelector: () => ({ getAttribute: () => '/atendimento/' }) },
    window: { open: (u, n) => { abertas.push([u, n]); return { focus() {} }; } } };
  ctx.globalThis = ctx;
  vm.runInNewContext(ler('public/apps.js'), ctx);
  return { A: ctx.window.IndyCarApps, abertas };
}

test('Central: Agenda, CRM e Comunicar com a barra ("/agenda/?tel=…", sem o 308 a mais); caminho sem "//"', () => {
  const { A } = appsNaCentral();
  assert.strictEqual(A.base, '/atendimento/');
  assert.strictEqual(A.link('agenda', '?tel=12999990001'), 'https://central.exemplo/agenda/?tel=12999990001');
  assert.strictEqual(A.link('crm', '?tel=12999990001'), 'https://central.exemplo/crm/?tel=12999990001');
  assert.strictEqual(A.link('comunicar', '?tel=1'), 'https://central.exemplo/comunicar/?tel=1');
  assert.strictEqual(A.link('crm', '/?lead=x'), 'https://central.exemplo/crm/?lead=x');
  assert.strictEqual(A.link('agenda'), 'https://central.exemplo/agenda/');
  // como a ficha monta: new URL(base) + searchParams.set('tel')
  const u = new URL(A.link('agenda')); u.searchParams.set('tel', '12999990001');
  assert.strictEqual(u.href, 'https://central.exemplo/agenda/?tel=12999990001');
});

test('Central: Orçador em /orcador/; link antigo do Netlify vira o mesmo orçamento na Central', () => {
  const { A } = appsNaCentral();
  assert.strictEqual(A.link('orcador', '#/historico/o1'), 'https://central.exemplo/orcador/#/historico/o1');
  assert.strictEqual(A.naCentralAtual('https://indycar-orcador.netlify.app/#/cotacao?tel=5512999990001'), 'https://central.exemplo/orcador/#/cotacao?tel=5512999990001');
  assert.strictEqual(A.naCentralAtual('https://indycar-patio.netlify.app/?os=1'), 'https://indycar-patio.netlify.app/?os=1', 'o Pátio continua no endereço dele');
  assert.strictEqual(A.appDoEndereco('https://central.exemplo/orcador/#/historico/o1'), 'orcador', 'antes caía como "agenda"');
  assert.strictEqual(A.appDoEndereco('https://central.exemplo/trafego/'), 'ads');
  assert.strictEqual(A.ORCADOR_NETLIFY, 'https://indycar-orcador.netlify.app');
  // a aba do Orçador dentro do Atendimento reconhece o endereço antigo pelo ORCADOR_NETLIFY
  assert.match(ler('public/app.js'), /const antigo = window\.IndyCarApps\?\.ORCADOR_NETLIFY \|\| window\.IndyCarApps\?\.apps\?\.orcador\?\.url;/);
});

test('cada app na aba nomeada dele; o Tráfego (chave "ads") abre em indycar-trafego, como na Casa e no CRM', () => {
  const { A, abertas } = appsNaCentral();
  A.abrir('agenda', A.link('agenda', '?tel=1'));
  A.abrir('ads', 'https://central.exemplo/trafego/');
  assert.deepStrictEqual(abertas, [['https://central.exemplo/agenda/?tel=1', 'indycar-agenda'], ['https://central.exemplo/trafego/', 'indycar-trafego']]);
  const html = ler('public/app.js');
  for (const k of ['agenda', 'crm', 'comunicar']) assert.match(html, new RegExp(`target="indycar-${k}"`));
});

test('Comunicar: o servidor não manda mais o Render antigo e a tela usa o endereço da Central primeiro', () => {
  const srv = ler('server.js');
  assert.doesNotMatch(srv, /comunicarUrl: 'https:\/\/indycar-posvenda/);
  const app = ler('public/app.js');
  assert.match(app, /linkComTelefone\(URL_COMUNICAR \|\| comunicarUrl, tel\)/);
  assert.match(app, /href="\$\{esc\(URL_COMUNICAR \|\| fx\?\.comunicarUrl\)\}"/);
  assert.doesNotMatch(ler('scripts/mock-server.mjs'), /comunicarUrl: 'https/);
});

test('avisos com endereço absoluto do ecossistema abrem (a lista de origens era um Proxy sem chaves) e o relativo vai com a barra', () => {
  const t = ler('public/tarefas.js');
  assert.doesNotMatch(t, /Object\.values\(LINKS_APP\)/);
  assert.match(t, /A\.enderecoSeguro\(A\.naCentralAtual\(link\)\)/);
  assert.match(t, /window\.IndyCarApps\.abrir\(app, window\.IndyCarApps\.link\(app, link\)\)/);
});

test('sessão: na Central "Manter conectado" some e a sessão fica na cópia compartilhada (não derruba a Casa e os outros apps)', () => {
  const a = ler('public/acesso.js');
  assert.match(a, /const naCentral = \(\) => !!\(window\.IndyCarApps && window\.IndyCarApps\.base && window\.IndyCarApps\.base !== '\/'\);/);
  assert.match(a, /const manter = \(\) => naCentral\(\) \|\| ls\.get\(K\.manter\) !== '0';/);
  assert.match(a, /if \(caixa\) caixa\.hidden = naCentral\(\);/);
  assert.match(a, /if \(!naCentral\(\)\) ls\.set\(K\.manter/);
  // o armazenamento de verdade: na Central, mesmo com '0' gravado de antes, grava no localStorage e não apaga a cópia dos outros
  const i = a.indexOf('  const naCentral = '), j = a.indexOf('  /* ---------------- Mensagens de erro claras');
  const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
  for (const [base, esperado] of [['/atendimento/', 'local'], ['/', 'sessao']]) {
    const localStorage = mk(), sessionStorage = mk();
    localStorage.setItem('indycar_manter_conectado', '0');
    localStorage.setItem('sb-x-auth-token', 'da-casa');
    const ctx = { window: { IndyCarApps: { base } }, localStorage, sessionStorage, K: { manter: 'indycar_manter_conectado' },
      ls: { get: (k) => localStorage.getItem(k) } };
    vm.runInNewContext(a.slice(i, j) + '\nthis.arm = armazenamentoDaSessao();', ctx);
    ctx.arm.setItem('sb-x-auth-token', 'renovado');
    if (esperado === 'local') {
      assert.strictEqual(localStorage.getItem('sb-x-auth-token'), 'renovado', 'Central: a cópia compartilhada recebe o token novo');
      assert.strictEqual(sessionStorage.getItem('sb-x-auth-token'), null);
    } else {
      assert.strictEqual(sessionStorage.getItem('sb-x-auth-token'), 'renovado', 'solto: desmarcado continua só nesta aba');
      assert.strictEqual(localStorage.getItem('sb-x-auth-token'), null);
    }
  }
});
