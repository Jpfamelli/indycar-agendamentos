// Rodada 13C: regra única de passagens da Central (cada app na aba nomeada "indycar-<app>") e a conversão dos links da
// IA da ficha sem estragar link que já está no endereço da Central.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

/** naCentral() de crm-ia.js rodando com o apps.js de verdade numa página em <origem>/crm/. */
function naCentralEm(origem, pathname = '/crm/') {
  const ctx = { location: { pathname, origin: origem, href: origem + pathname }, document: {}, URL };
  ctx.window = ctx;
  vm.runInNewContext(pub('apps.js'), ctx);
  const ia = pub('crm-ia.js');
  const i = ia.indexOf('  function naCentral(u) {'), j = ia.indexOf('  function abrirLink(url) {');
  assert.ok(i > 0 && j > i);
  vm.runInNewContext(ia.slice(i, j) + '\nthis.naCentral = naCentral;', ctx);
  return ctx.naCentral;
}

test('IA: link já da Central fica no app certo (nada de /agenda/crm/…); endereço antigo vira o caminho da Central', () => {
  const PROD = 'https://indycar-agendamentos.onrender.com';
  for (const origem of [PROD, 'http://localhost:3614']) {
    const n = naCentralEm(origem);
    assert.equal(n(PROD + '/crm/?lead=abc'), '/crm/?lead=abc', origem);
    assert.equal(n(PROD + '/atendimento/?conversa=c1'), '/atendimento/?conversa=c1');
    assert.equal(n(PROD + '/agenda/?tel=5512999990001'), '/agenda/?tel=5512999990001');
    assert.equal(n(PROD + '/comunicar'), '/comunicar/');
    assert.equal(n(PROD + '/orcador/#/historico/o1'), '/orcador/#/historico/o1');
    assert.equal(n(PROD + '/?agendamento=a1'), '/agenda/?agendamento=a1', 'link antigo da Agenda na raiz');
    assert.equal(n(origem + '/trafego/'), '/trafego/');
    assert.equal(n('https://indycar-atendimento.onrender.com/?tel=5512999990001'), '/atendimento/?tel=5512999990001');
    assert.equal(n('https://indycar-posvenda.onrender.com/?cliente=x'), '/comunicar/?cliente=x');
    assert.equal(n('https://indycar-orcador.netlify.app/#/historico/o1'), '/orcador/#/historico/o1');
    assert.equal(n('https://indycar-patio.netlify.app/?os=1'), null, 'o Pátio mora em outro endereço: segue como veio');
    assert.equal(n('https://site-de-fora.example/crm/'), null);
    assert.equal(n(PROD + '/casa/indycar.css'), null, 'raiz da Central que não é de app irmão');
  }
});

test('passagens: cada app abre na aba nomeada dele; Comunicar do lote de campanha também (antes _self na Central)', () => {
  const r6 = pub('rodada6.js');
  assert.match(r6, /\['patio', 'orcador', 'atendimento', 'agenda', 'comunicar', 'trafego', 'site'\]/);
  assert.match(r6, /e\.preventDefault\(\); abrirNomeada6\(a\.href, app\);/);
  // abrirNomeada6 de verdade: window.open com o nome; bloqueada, sai nesta janela
  const ctx = { abertas: [], saidas: [], window: { open: (u, n) => { ctx.abertas.push([u, n]); return ctx.devolve; } }, location: { assign: u => ctx.saidas.push(u) }, document: { querySelector: () => null }, confirm: () => true };
  const i = r6.indexOf('const mesmaJanela6'), j = r6.indexOf('const abrirApp6');
  vm.runInNewContext(r6.slice(i, j) + '\nthis.abrir = abrirNomeada6;', ctx);
  ctx.devolve = { focus() {} };
  ctx.abrir('/agenda/?tel=1', 'agenda'); ctx.abrir('/trafego/', 'trafego');
  assert.deepEqual(ctx.abertas, [['/agenda/?tel=1', 'indycar-agenda'], ['/trafego/', 'indycar-trafego']]);
  ctx.devolve = null;
  ctx.abrir('/comunicar/?cliente=1', 'comunicar');
  assert.deepEqual(ctx.saidas, ['/comunicar/?cliente=1'], 'pop-up bloqueado: vai nesta janela');
  assert.match(pub('rodada5.js'), /abrirNomeada6\(r\.abrir, 'comunicar'\)/);
  assert.doesNotMatch(pub('rodada5.js'), /'_self'/);
});
