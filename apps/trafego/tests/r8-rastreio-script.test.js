'use strict';
/* Rodada 8 (T2b) — o script portátil de rastreio (rastreio/rastreio.js) rodando em node:vm com um documento de
   mentira: links, armazenamento, fetch e relógio. Roda a versão SERVIDA (sem comentários, compactada), a mesma
   que o navegador recebe de GET /rastreio.js. Casos do recado: chegada com anúncio, volta sem anúncio (não apaga),
   sem localStorage, fetch que falha, link sem texto, link já marcado, página com 200 links. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { scriptServido } = require('../rotas/rastreio');

const CODIGO = 'K7M2P';
const SCRIPT = scriptServido();

function criarLink(href, extra = {}) {
  const attrs = { href, ...extra };
  return { tagName: 'A', parentNode: null, getAttribute: k => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); }, attrs };
}

/**
 * Monta a página de mentira e roda o script.
 * armazenamento: 'ok' | 'bloqueado' (o acesso lança erro) | 'ausente' (não existe);  rede: 'ok' | 'falha' | 'lixo' | 'sem_fetch'.
 */
function pagina({ search = '', referrer = '', armazenamento = 'ok', rede = 'ok', links = [], guardado, readyState = 'complete', registro } = {}) {
  const ouvintes = {}, ouvintesDoc = {}, timers = [], pedidos = [];
  const store = new Map();
  if (guardado !== undefined) store.set('indycar_rastreio', typeof guardado === 'string' ? guardado : JSON.stringify(guardado));
  const anchors = links.map(l => (typeof l === 'string' ? criarLink(l) : l));
  const document = {
    currentScript: { src: 'https://indycar-agendamentos.onrender.com/trafego/rastreio.js', getAttribute: k => (k === 'data-registro' ? registro || null : null) },
    referrer, readyState, visibilityState: 'visible',
    querySelector: () => null,
    querySelectorAll: sel => { assert.equal(sel, 'a[href]'); return anchors; },
    addEventListener: (t, f) => { (ouvintesDoc[t] = ouvintesDoc[t] || []).push(f); },
  };
  const window = {
    location: { search, pathname: '/servicos/troca-de-oleo', hostname: 'oficina.com.br' },
    addEventListener: (t, f) => { (ouvintes[t] = ouvintes[t] || []).push(f); },
    removeEventListener: (t, f) => { ouvintes[t] = (ouvintes[t] || []).filter(x => x !== f); },
    setTimeout: (f, ms) => { timers.push({ f, ms }); },
  };
  if (rede !== 'sem_fetch') {
    window.fetch = (url, o) => {
      pedidos.push({ url, method: o.method, keepalive: o.keepalive, corpo: JSON.parse(o.body) });
      if (rede === 'falha') return Promise.reject(new TypeError('Failed to fetch'));
      if (rede === 'lixo') return Promise.resolve({ json: async () => ({ ok: true, codigo: '<img>' }) });
      return Promise.resolve({ json: async () => ({ ok: true, codigo: CODIGO }) });
    };
  }
  if (armazenamento === 'ok') window.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } };
  else if (armazenamento === 'bloqueado') Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  vm.runInNewContext(SCRIPT, { window, document });
  const guardadoAgora = () => (store.has('indycar_rastreio') ? JSON.parse(store.get('indycar_rastreio')) : null);
  const interagir = async (tipo = 'pointerdown') => { for (const f of [...(ouvintes[tipo] || [])]) f({}); await new Promise(r => setImmediate(r)); };
  const clicar = async (link) => { for (const f of ouvintesDoc.click || []) f({ target: link }); await new Promise(r => setImmediate(r)); };
  return { pedidos, timers, anchors, ouvintes, ouvintesDoc, guardadoAgora, interagir, clicar, store };
}

const textoDo = href => decodeURIComponent((/[?&]text=([^&#]*)/.exec(href) || [])[1] || '');

test('o script servido cabe em 4 KB, não tem comentário e é JavaScript válido', () => {
  assert.ok(Buffer.byteLength(SCRIPT) < 4096, `tem ${Buffer.byteLength(SCRIPT)} bytes`);
  assert.equal(/\/\*|^\/\//m.test(SCRIPT), false);
  assert.doesNotThrow(() => new vm.Script(SCRIPT));
});

test('chegada com anúncio: registra na primeira interação, guarda o código e marca os links de WhatsApp', async () => {
  const p = pagina({
    search: '?utm_source=google&utm_medium=cpc&utm_campaign=Oleo%20Nov&gclid=AbC-12_xYz&outro=1',
    referrer: 'https://www.google.com/',
    links: ['https://wa.me/5512996830272?text=Quero%20agendar', 'https://oficina.com.br/contato'],
  });
  assert.equal(p.pedidos.length, 0, 'nada vai para a rede antes da interação');
  assert.equal(p.timers[0].ms, 4000);
  await p.interagir('scroll');
  assert.equal(p.pedidos.length, 1);
  const r = p.pedidos[0];
  assert.equal(r.url, 'https://indycar-agendamentos.onrender.com/trafego/api/rastreio');
  assert.equal(r.method, 'POST');
  assert.deepEqual(r.corpo, {
    utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Oleo Nov', gclid: 'AbC-12_xYz',
    pagina: '/servicos/troca-de-oleo', referencia: 'www.google.com', referencia_tipo: 'anuncio', evento: 'visita',
  });
  assert.equal(p.guardadoAgora().codigo, CODIGO);
  assert.equal(p.guardadoAgora().dados.gclid, 'AbC-12_xYz', 'identificador de clique guardado como chegou');
  assert.equal(textoDo(p.anchors[0].attrs.href), `Quero agendar [ref ${CODIGO}]`);
  assert.equal(p.anchors[1].attrs.href, 'https://oficina.com.br/contato');
  // segunda interação e o relógio de 4 s não registram de novo
  await p.interagir('keydown');
  p.timers[0].f();
  await new Promise(r2 => setImmediate(r2));
  assert.equal(p.pedidos.length, 1);
});

test('clique no WhatsApp registra o clique (keepalive) com o serviço do link', async () => {
  const link = criarLink('https://api.whatsapp.com/send?phone=5512996830272', { 'data-servico': 'cambio' });
  const filho = { tagName: 'SPAN', parentNode: link };
  const p = pagina({ search: '?fbclid=IwAR0xYz', links: [link] });
  await p.interagir();
  await p.clicar(filho);
  assert.equal(p.pedidos.length, 2);
  assert.deepEqual(p.pedidos[1].corpo, { codigo: CODIGO, evento: 'clique', servico: 'cambio' });
  assert.equal(p.pedidos[1].keepalive, true);
  assert.equal(textoDo(link.attrs.href), `Olá! [ref ${CODIGO}]`);
});

test('volta sem anúncio não apaga o anúncio guardado e não registra de novo', async () => {
  const guardado = { dados: { gclid: 'AbC', referencia_tipo: 'anuncio', pagina: '/' }, codigo: 'QWERT', quando: Date.now() - 2 * 86400000 };
  const p = pagina({ guardado, links: ['https://wa.me/5512996830272'] });
  assert.deepEqual(p.guardadoAgora(), guardado);
  await p.interagir();
  assert.equal(p.pedidos.length, 0);
  assert.equal(textoDo(p.anchors[0].attrs.href), 'Olá! [ref QWERT]');
  // navegação dentro do próprio site também não apaga
  const p2 = pagina({ guardado, referrer: 'https://oficina.com.br/servicos', links: [] });
  assert.equal(p2.guardadoAgora().codigo, 'QWERT');
});

test('chegada com anúncio novo substitui o guardado; guardado vencido (mais de 30 dias) é trocado', async () => {
  const velho = { dados: { referencia_tipo: 'busca', referencia: 'www.google.com', pagina: '/' }, codigo: 'QWERT', quando: Date.now() };
  const p = pagina({ guardado: velho, search: '?utm_medium=paid_social&utm_source=instagram' });
  assert.equal(p.guardadoAgora().dados.referencia_tipo, 'anuncio');
  assert.equal(p.guardadoAgora().codigo, null);
  await p.interagir();
  assert.equal(p.pedidos.length, 1);
  const vencido = { dados: { gclid: 'X', referencia_tipo: 'anuncio' }, codigo: 'QWERT', quando: Date.now() - 31 * 86400000 };
  const p2 = pagina({ guardado: vencido, referrer: 'https://www.bing.com/' });
  assert.equal(p2.guardadoAgora().dados.referencia_tipo, 'busca');
});

test('sem localStorage (bloqueado ou inexistente) tudo funciona só com a memória da página', async () => {
  for (const armazenamento of ['bloqueado', 'ausente']) {
    const p = pagina({ armazenamento, search: '?gclid=Zz9', links: ['whatsapp://send?phone=5512996830272&text=Oi'] });
    await p.interagir();
    assert.equal(p.pedidos.length, 1, armazenamento);
    assert.equal(textoDo(p.anchors[0].attrs.href), `Oi [ref ${CODIGO}]`, armazenamento);
  }
});

test('guardado corrompido não trava e vira chegada nova', async () => {
  const p = pagina({ guardado: '{isto não é json', links: ['https://wa.me/5512996830272'] });
  await p.interagir();
  assert.equal(p.pedidos.length, 1);
  assert.equal(p.guardadoAgora().codigo, CODIGO);
});

test('fetch que falha, resposta estranha ou navegador sem fetch: a página segue e os links ficam como estão', async () => {
  for (const rede of ['falha', 'lixo', 'sem_fetch']) {
    const p = pagina({ rede, search: '?gclid=Zz9', links: ['https://wa.me/5512996830272?text=Oi'] });
    await p.interagir();
    await new Promise(r => setImmediate(r));
    assert.equal(p.anchors[0].attrs.href, 'https://wa.me/5512996830272?text=Oi', rede);
    assert.equal(p.guardadoAgora().codigo, null, rede);
  }
});

test('link sem texto ganha "Olá! [ref …]"; link com âncora e outros parâmetros continua certo', async () => {
  const p = pagina({ search: '?gclid=1', links: ['https://wa.me/5512996830272', 'https://wa.me/5512996830272?text=', 'https://api.whatsapp.com/send?phone=5512996830272&text=Oi+tudo+bem&type=phone#topo'] });
  await p.interagir();
  assert.equal(p.anchors[0].attrs.href, `https://wa.me/5512996830272?text=${encodeURIComponent(`Olá! [ref ${CODIGO}]`)}`);
  assert.equal(textoDo(p.anchors[1].attrs.href), `Olá! [ref ${CODIGO}]`);
  assert.equal(p.anchors[2].attrs.href, `https://api.whatsapp.com/send?phone=5512996830272&text=${encodeURIComponent(`Oi tudo bem [ref ${CODIGO}]`)}&type=phone#topo`);
});

test('link já marcado não é marcado de novo (nem no clique)', async () => {
  const marcado = `https://wa.me/5512996830272?text=${encodeURIComponent('Oi [ref ABCDE]')}`;
  const p = pagina({ search: '?gclid=1', links: [marcado] });
  await p.interagir();
  assert.equal(p.anchors[0].attrs.href, marcado);
  await p.clicar(p.anchors[0]);
  assert.equal(p.anchors[0].attrs.href, marcado);
});

test('página com 200 links: marca só os de WhatsApp, uma vez cada, rápido', async () => {
  const links = Array.from({ length: 200 }, (_, i) => (i % 4 === 0 ? `https://wa.me/55129968302${String(i).padStart(2, '0')}?text=Oi%20${i}` : `https://oficina.com.br/p/${i}`));
  const p = pagina({ search: '?gclid=1', links });
  const t0 = process.hrtime.bigint();
  await p.interagir();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const wa = p.anchors.filter(a => a.attrs.href.includes('wa.me'));
  assert.equal(wa.length, 50);
  for (const a of wa) assert.equal((a.attrs.href.match(/%5Bref%20/g) || []).length, 1);
  assert.ok(p.anchors.filter(a => !a.attrs.href.includes('wa.me')).every((a, i) => a.attrs.href.startsWith('https://oficina.com.br/p/')));
  assert.ok(ms < 200, `levou ${ms} ms`);
});

test('data-registro troca o endereço do registro; endereço que não é http(s) é ignorado', async () => {
  const p = pagina({ search: '?gclid=1', registro: 'https://outro.exemplo.com/trafego/api/rastreio' });
  await p.interagir();
  assert.equal(p.pedidos[0].url, 'https://outro.exemplo.com/trafego/api/rastreio');
  const p2 = pagina({ search: '?gclid=1', registro: 'javascript:alert(1)' });
  await p2.interagir();
  assert.equal(p2.pedidos[0].url, 'https://indycar-agendamentos.onrender.com/trafego/api/rastreio');
});

test('de onde veio: busca, Instagram, Facebook, outro site e direto (sem nome, telefone ou e-mail)', async () => {
  const casos = [
    [{ referrer: 'https://www.google.com.br/' }, 'busca'],
    [{ referrer: 'https://l.instagram.com/' }, 'instagram'],
    [{ search: '?utm_source=instagram&utm_medium=bio' }, 'instagram'],
    [{ referrer: 'https://m.facebook.com/' }, 'facebook'],
    [{ referrer: 'https://blog.exemplo.com/post' }, 'outro_site'],
    [{}, 'direto'],
  ];
  for (const [entrada, tipo] of casos) {
    const p = pagina({ ...entrada });
    await p.interagir();
    assert.equal(p.pedidos[0].corpo.referencia_tipo, tipo, JSON.stringify(entrada));
    assert.deepEqual(Object.keys(p.pedidos[0].corpo).filter(k => /nome|telefone|email/.test(k)), []);
  }
});
