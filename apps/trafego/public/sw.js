/* Service worker da Central de Tráfego Pago (rodada 4, 14/10/2026).
 *
 * O Render gratuito dorme e, ao acordar, pode responder 502/503 por alguns minutos. Com isto a casca do app
 * (HTML, CSS, JS e o cliente do Supabase) abre do cache do aparelho e a tela mostra "O sistema está acordando",
 * em vez da página de erro do Render.
 *
 *  - Casca (navegação e arquivos do app): REDE primeiro (versão nova chega na hora); se a rede falhar, demorar
 *    mais de 6 s ou o servidor responder 5xx, usa a última cópia boa.
 *  - /api/* e outras origens (Supabase): nunca passam por aqui (dados sempre frescos, nada sensível em cache).
 */
const VERSAO = 'ads-casca-v4';   // rodada 7: acoes.js
const CASCA = ['/', '/styles.css', '/tema.js', '/ecossistema.js', '/rede.js', '/busca.js', '/guia-conexao.js', '/app.js', '/ciclo.js', '/operacao.js', '/acoes.js', '/conta.js', '/vendor/supabase.js',
  '/fontes/dm-sans-variavel.woff2', '/fontes/barlow-condensed-500.woff2', '/fontes/barlow-condensed-600.woff2', '/fontes/barlow-condensed-700.woff2'];
const TEMPO_REDE_MS = 6000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSAO)
      .then((c) => Promise.all(CASCA.map((u) => fetch(u, { cache: 'reload' }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('ads-casca-') && n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function comTempo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('tempo esgotado')), ms);
    promessa.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); falha(e); });
  });
}

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  const chave = pedido.mode === 'navigate' ? '/' : url.pathname;
  if (pedido.mode !== 'navigate' && !CASCA.includes(chave)) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSAO);
      try {
        const r = await comTempo(fetch(pedido), TEMPO_REDE_MS);
        if (r.ok) {
          // Só guarda a página inicial (sem ?aba=...) e os arquivos da casca.
          if (pedido.mode !== 'navigate' || url.search === '') cache.put(chave, r.clone()).catch(() => {});
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
    })(),
  );
});
