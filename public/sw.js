// Service Worker do IndyCar Agendamentos — torna o site instalável (PWA)
// e mantém a casca do app em cache para abrir rápido.
const CACHE = 'indycar-v12';
/* Se QUALQUER item desta lista faltar, o addAll rejeita e o service worker
   NÃO instala — o app deixa de ser instalável sem dizer por quê. Foi o que
   quase aconteceu quando o qrcode.min.js saiu junto com a tela de QR e
   continuou listado aqui. Mantenha só o que existe de verdade. */
const CORE = ['/', '/styles.css', '/planejamento.css', '/app.js', '/planejamento.js', '/agenda-planejada.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/logo.png'];

/* NUNCA entra no cache: a API (dado de cliente muda a cada minuto e carrega
   token), qualquer coisa que não seja GET e o que não é deste domínio (o
   supabase-js do jsDelivr e as fontes já têm o cache do próprio navegador). */
function passaDireto(req) {
  if (req.method !== 'GET') return true;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return true;
  return false;
}

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
  if (passaDireto(e.request)) return;                 // API e cia.: sempre rede, sem guardar
  // estático: rede primeiro (pega versão nova), cai pro cache se offline
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        // só guarda resposta boa deste domínio: um 404/500 em cache viraria tela quebrada offline
        if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
  );
});
