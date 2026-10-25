// Service Worker do IndyCar Agendamentos — torna o site instalável (PWA)
// e mantém a casca do app em cache para abrir rápido (e abrir mesmo com o
// servidor fora do ar: a tela aparece, avisa e tenta de novo sozinha).
/* Central (16/10): nome com o app — no mesmo domínio moram 5 service workers e cada um só
   apaga o que é SEU (antes apagava o cache dos outros apps ao ativar). */
const CACHE = 'indycar-agenda-v26';
/* Se QUALQUER item desta lista faltar, o addAll rejeita e o service worker
   NÃO instala — o app deixa de ser instalável sem dizer por quê. Foi o que
   quase aconteceu quando o qrcode.min.js saiu junto com a tela de QR e
   continuou listado aqui. Mantenha só o que existe de verdade. */
/* RODADA 5 (Central): tudo RELATIVO ao escopo do service worker. Sozinho, o escopo
   é '/'; sob a Central é '/agenda/' — a casca guardada é a certa nos dois casos. */
const RAIZ = new URL('./', self.registration.scope).pathname;
const CORE = ['', 'styles.css', 'planejamento.css', 'rodada4.css', 'rodada5.css', 'rodada6.css', 'rodada6b.css', 'rodada6c.css', 'rodada7.css', 'conta.css', 'apps.js', 'planejamento.js', 'app.js', 'rodada6.js', 'rodada6b.js', 'rodada6c.js', 'rodada6d.js', 'rodada7.js', 'conta.js',
  'agenda-planejada.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'logo.png'].map((c) => RAIZ + c);

/* A biblioteca do login (supabase-js) com a versão FIXA: o arquivo nunca muda
   (o jsDelivr manda "immutable"), então pode ficar guardado. Sem ela, a casca
   abriria offline e travaria no login. */
const LIB_LOGIN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js';

/* Quanto a rede pode demorar antes de a casca guardada ser servida: com o
   Render acordando, a página não fica em branco esperando. */
const PACIENCIA_MS = 3000;

/* NUNCA entra no cache: a API (dado de cliente muda a cada minuto e carrega
   token), qualquer coisa que não seja GET e o que não é deste domínio (exceto
   a biblioteca do login acima). */
function passaDireto(req) {
  if (req.method !== 'GET') return true;
  const url = new URL(req.url);
  if (req.url === LIB_LOGIN) return false;
  if (url.origin !== self.location.origin) return true;
  if (!url.pathname.startsWith(RAIZ)) return true;   // Central: outro app no mesmo domínio não é nosso
  if (url.pathname.startsWith(RAIZ + 'api/') || url.pathname === RAIZ + 'api') return true;
  // a página do cliente (/confirmar/) muda de resposta a cada toque: sempre rede
  if (url.pathname.startsWith(RAIZ + 'confirmar')) return true;
  return false;
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(CORE);
    // a biblioteca é bônus: se o CDN falhar agora, o SW instala do mesmo jeito
    try { await c.add(new Request(LIB_LOGIN, { mode: 'cors' })); } catch { /* tenta no próximo uso */ }
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k.startsWith('indycar-agenda-') || /^indycar-v[0-9]+$/.test(k))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Guarda só resposta boa (200 do próprio domínio, ou a lib com CORS). */
function guardar(req, r) {
  if (r && r.ok && (r.type === 'basic' || r.type === 'cors')) {
    const cp = r.clone();
    caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
  }
  return r;
}

self.addEventListener('fetch', (e) => {
  if (passaDireto(e.request)) return;                 // API e cia.: sempre rede, sem guardar
  // biblioteca do login: versão fixa → cache primeiro
  if (e.request.url === LIB_LOGIN) {
    e.respondWith(caches.match(LIB_LOGIN).then((m) => m || fetch(e.request).then((r) => guardar(LIB_LOGIN, r))));
    return;
  }
  /* Casca do app: rede primeiro (pega a versão nova — o servidor responde 304
     barato com ETag), mas se a rede demorar mais de 3 s ou falhar, serve o que
     está guardado. A resposta da rede, quando chega, atualiza o cache. */
  const daRede = fetch(e.request).then((r) => guardar(e.request, r));
  e.respondWith(new Promise((responder) => {
    let respondeu = false;
    const doCache = () => caches.match(e.request)
      .then((m) => m || (e.request.mode === 'navigate' ? caches.match(RAIZ) : null));
    const timer = setTimeout(() => {
      doCache().then((m) => { if (m && !respondeu) { respondeu = true; responder(m); } });
    }, PACIENCIA_MS);
    daRede.then((r) => {
      clearTimeout(timer);
      if (respondeu) return;
      // 502/503 do Render acordando: a casca guardada é melhor que a página de erro dele
      if (!r.ok && r.status >= 500) return doCache().then((m) => { respondeu = true; responder(m || r); });
      respondeu = true; responder(r);
    }).catch(() => {
      clearTimeout(timer);
      if (respondeu) return;
      doCache().then((m) => { respondeu = true; responder(m || Response.error()); });
    });
  }));
});
