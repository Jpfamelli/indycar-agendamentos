// Service Worker do IndyCar Agendamentos — torna o site instalável (PWA)
// e mantém a casca do app em cache para abrir rápido.
const CACHE = 'indycar-v5';
/* Se QUALQUER item desta lista faltar, o addAll rejeita e o service worker
   NÃO instala — o app deixa de ser instalável sem dizer por quê. Foi o que
   quase aconteceu quando o qrcode.min.js saiu junto com a tela de QR e
   continuou listado aqui. Mantenha só o que existe de verdade. */
const CORE = ['/', '/styles.css', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // API: sempre rede
  // estático: rede primeiro (pega versão nova), cai pro cache se offline
  e.respondWith(
    fetch(e.request)
      .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
  );
});
