// Service Worker do IndyCar Comunicar — torna o site instalável (PWA) e, desde a
// rodada 4, abre a CASCA do app do cache quando o servidor está dormindo/fora
// (Render gratuito: 503 "hibernate-wake-error"). Os dados continuam sempre da
// rede — quem espera o servidor acordar é o acordar.js, com aviso na tela.
// Rodada 5: tudo RELATIVO ao lugar onde o SW foi registrado (BASE) — funciona em
// "/" sozinho e em "/comunicar/" dentro da IndyCar Central (escopo do prefixo).
const VERSAO = '5.0.1';   // 16/10: mensagens sem confirmação (Chegou / Reenviar)
const CACHE = `comunicar-v${VERSAO}`;
const EXTERNO = 'comunicar-externo-v1'; // supabase-js e fontes (versão fixa na URL)
const BASE = new URL('./', self.location.href).pathname; // '/' ou '/comunicar/'
/* Se QUALQUER item desta lista faltar, o addAll rejeita e o service worker
   NÃO instala. Mantenha só o que existe de verdade (e as MESMAS URLs do index.html). */
const CORE = [BASE, ...['styles.css', 'apps.js', 'acordar.js', 'conta.js', 'app.js', 'rodada4.js', 'rodada5.js'].map((a) => `${BASE}${a}?v=${VERSAO}`),
  `${BASE}manifest.json`, `${BASE}icon-192.png`, `${BASE}icon-512.png`, `${BASE}logo.png`];
const EXTERNOS_OK = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@\d|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;

/* NUNCA entra no cache: a API (dado de cliente muda a cada minuto e carrega
   token) e qualquer coisa que não seja GET. */
function passaDireto(req) {
  if (req.method !== 'GET') return true;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return !EXTERNOS_OK.test(req.url);
  return url.pathname.startsWith(`${BASE}api/`) || url.pathname === `${BASE}api`;
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('comunicar-') && k !== CACHE && k !== EXTERNO) /* Central: só os do Comunicar */.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Rede com tempo-limite: o servidor dormindo não pode prender a tela branca. */
function redeAte(req, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('demorou')), ms);
    fetch(req).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); falha(e); });
  });
}
const guardar = (nome, req, r) => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(nome).then((c) => c.put(req, cp)); } return r; };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (passaDireto(req)) return;                       // API e cia.: sempre rede, sem guardar
  const url = new URL(req.url);

  // supabase-js e fontes: cache primeiro (a URL já tem a versão)
  if (url.origin !== self.location.origin) {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => guardar(EXTERNO, req, r))));
    return;
  }

  // a página: rede por até 4 s; servidor fora (5xx), sem rede ou lento → a casca do cache
  if (req.mode === 'navigate' || url.pathname === BASE || url.pathname === `${BASE}index.html`) {
    e.respondWith(
      redeAte(req, 4000)
        .then((r) => (r.ok ? guardar(CACHE, BASE, r) : caches.match(BASE).then((m) => m || r)))
        .catch(() => caches.match(BASE).then((m) => m || fetch(req)))
    );
    return;
  }

  // arquivos da tela: o do cache na hora e a versão nova em segundo plano
  e.respondWith(
    caches.match(req).then((m) => {
      const novo = fetch(req).then((r) => (r.ok && r.type === 'basic' ? guardar(CACHE, req, r) : r)).catch(() => null);
      return m || novo.then((r) => r || caches.match(BASE));
    })
  );
});
