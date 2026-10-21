// Service worker da Casa (raiz da IndyCar Central). Escopo "/", mas só cuida da Casa:
// "/", "/index.html" e "/casa/*". Os apps (/agenda/, /crm/, /comunicar/, /atendimento/)
// têm o service worker deles, com escopo mais específico — aqui eles passam direto.
// Também substitui o service worker antigo da Agenda, que morava em "/" antes da Central.
const CACHE = 'indycar-casa-v7';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js';
const CORE = ['/', '/casa/casa.css', '/casa/painel.css', '/casa/casa.js', '/casa/logica.js', '/casa/logica2.js', '/casa/logica3.js', '/casa/comando.js', '/casa/sino.js', '/casa/painel.js', '/casa/manha.js', '/casa/tarefas.js', '/casa/busca.js', '/casa/atalhos.js', '/casa/tema.js', '/casa/icon-192.png', '/casa/logo.png', '/manifest.json'];
const ehDaCasa = (u) => u.origin === self.location.origin && (u.pathname === '/' || u.pathname === '/index.html' || u.pathname.startsWith('/casa/') || u.pathname === '/manifest.json');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(CORE);
    try { await c.add(new Request(LIB, { mode: 'cors' })); } catch { /* próximo uso */ }
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    // só o que é da Casa — e o cache antigo da Agenda na raiz ("indycar-v16" e anteriores)
    .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('indycar-casa-') && k !== CACHE) || /^indycar-v[0-9]+$/.test(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url === LIB) { e.respondWith(caches.match(LIB).then((m) => m || fetch(req))); return; }
  const u = new URL(req.url);
  if (!ehDaCasa(u)) return;                 // apps, API e tudo o mais: rede, sem tocar
  const chave = (u.pathname === '/index.html' || req.mode === 'navigate') ? '/' : u.pathname;
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(chave, cp)).catch(() => {}); }
    if (!r.ok && r.status >= 500) return caches.match(chave).then((m) => m || r);
    return r;
  }).catch(() => caches.match(chave).then((m) => m || Response.error())));
});
