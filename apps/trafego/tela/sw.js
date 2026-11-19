/* ============================================================================
   Service worker da tela nova do IndyCar Tráfego (rodada 8).
   O servidor gratuito dorme e, ao acordar, responde 502/503 por um tempo. Com
   isto a casca (HTML, CSS, JS, fontes e o cliente do Supabase) abre da cópia
   do aparelho e a própria tela mostra "o sistema está acordando".

   - Casca: REDE primeiro (versão nova chega na hora); se a rede falhar, passar
     de 6 s ou responder 5xx, usa a última cópia boa.
   - api/…, antiga/… e outros domínios (Supabase) nunca passam por aqui: dado
     sempre fresco e nada sensível guardado.
   - Tudo relativo ao lugar do próprio arquivo: funciona em /trafego/ e na raiz.
   ============================================================================ */

const VERSAO = 'indycar-trafego-r9-1';
const PREFIXO = 'indycar-trafego-';
const TEMPO_REDE_MS = 6000;
const CASCA = [
  './', 'index.html', 'tema.js', 'manifest.json', 'img/logo.png', 'img/icone-192.png', 'vendor/supabase.js',
  'ds/tokens.css', 'ds/base.css', 'ds/componentes.css', 'css/ajustes.css', 'css/campanhas.css',
  'css/casca.css', 'css/gestor.css', 'css/hoje.css', 'css/jornada.css', 'css/relatorios.css',
  'fontes/archivo-variavel.woff2', 'fontes/barlow-condensed-600.woff2', 'fontes/barlow-condensed-700.woff2', 'fontes/barlow-condensed-800-italic.woff2',
  'js/acoes-logica.js', 'js/api.js', 'js/app.js', 'js/aviso.js', 'js/campanhas-logica.js',
  'js/contatos.js', 'js/desfazer.js', 'js/dom.js', 'js/ecossistema.js', 'js/filtros.js',
  'js/fluxo.js', 'js/formatacao.js', 'js/formato.js', 'js/frase.js', 'js/hoje-logica.js', 'js/icones.js',
  'js/mapa.js', 'js/pecas.js', 'js/rede.js', 'js/relatorios-logica.js', 'js/rotas.js',
  'js/sessao.js', 'js/setores.js', 'js/telas/ajustes.js', 'js/telas/apresentacao.js', 'js/telas/campanhas.js',
  'js/telas/detalhe.js', 'js/telas/estados.js', 'js/telas/fila.js', 'js/telas/folha.js', 'js/telas/gavetas/chaves.js',
  'js/telas/gavetas/conexoes.js', 'js/telas/gavetas/devolucao.js', 'js/telas/gavetas/metas.js', 'js/telas/gavetas/origem.js', 'js/telas/gavetas/relatorios.js',
  'js/telas/gestor.js', 'js/telas/gravar.js', 'js/telas/hoje.js', 'js/telas/jornada.js', 'js/telas/respostas.js',
];
const ESCOPO = new URL('./', self.location.href);
const endereco = (rel) => new URL(rel, ESCOPO).href;
const DA_CASCA = new Set(CASCA.map(endereco));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSAO)
      .then((c) => Promise.all(CASCA.map((rel) => fetch(endereco(rel), { cache: 'reload' }).then((r) => (r.ok ? c.put(endereco(rel), r) : null)).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith(PREFIXO) && n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function comTempo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('tempo esgotado')), ms);
    promessa.then((v) => { clearTimeout(t); ok(v); }, (erro) => { clearTimeout(t); falha(erro); });
  });
}

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(ESCOPO.href)) return;
  const rel = url.pathname.slice(ESCOPO.pathname.length);
  if (rel.startsWith('api/') || rel.startsWith('antiga/') || rel === 'antiga') return;
  // Navegação (com ou sem ?cenario=, #/…) sempre guarda e serve a mesma página.
  const chave = pedido.mode === 'navigate' ? endereco('./') : url.origin + url.pathname;
  if (pedido.mode !== 'navigate' && !DA_CASCA.has(chave)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    try {
      const r = await comTempo(fetch(pedido), TEMPO_REDE_MS);
      if (r.ok) {
        // navegação só fica guardada como "a tela" se a resposta for HTML (abrir /trafego/rastreio.js por um link não troca a tela)
        const html = /text\/html/i.test(r.headers.get('content-type') || '');
        if (pedido.mode !== 'navigate' || html) cache.put(chave, r.clone()).catch(() => {});
        return r;
      }
      if (r.status >= 500) {
        const guardado = await cache.match(chave);
        if (guardado) return guardado;
      }
      return r;
    } catch (erro) {
      const guardado = await cache.match(chave);
      if (guardado) return guardado;
      throw erro;
    }
  })());
});
