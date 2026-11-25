// Service Worker do IndyCar CRM — torna o app instalável e abre a casca
// rápido mesmo com internet ruim na oficina.
// v6 (14/10/2026, rodada 4): o Render gratuito dorme e responde 503 por alguns
// minutos ao acordar. A casca (HTML, CSS, JS) sai do cache quando o servidor
// demora mais de 3,5 s ou responde erro — a tela abre e avisa "acordando".
// Biblioteca do Supabase e fontes (endereços com versão) ficam em cache direto.
// v8 (16/10/2026, rodada 5): caminhos RELATIVOS ao escopo — o CRM pode estar na
// raiz (/) ou montado na IndyCar Central (/crm/); nada começa com "/" fixo.
const CACHE = 'indycar-crm-v22';   // v22 (25/11, rodada 18): tarefas atrasadas em lote e agendados sem horário (r18.css, r18-casa.js, r18.js); v21 (25/11, rodada 17): fila da atendente no alto, registrar com um toque (r17.css, r17.js); v20 (25/11, rodada 16): atalhos da lista de Contatos (r16.css, r16.js), títulos em ordem e sem borda grossa; v19 (25/11, rodada 15): carros entregues encurtados e faixa de etapas no Funil (r15.css, r15.js); v18 (24/11, rodada 14): faxina dos contatos parados (r14.css, r14-faxina.js, r14.js); v17 (22/11, rodada 13B): passagens na mesma janela e Hoje sem número falso; v16: tela Hoje (r13.css, r13-resumo.js, r13.js)
//    // v10 (16/10): lead de colega travado na tela
const CACHE_EXTERNO = 'indycar-crm-externo-v1';
/* Pasta do app: '/' ou '/crm/' (o escopo do registro é a pasta de sw.js). */
const RAIZ = new URL('./', self.registration ? self.registration.scope : self.location.href).pathname;

/* Se QUALQUER item desta lista faltar, o addAll rejeita e o service worker
   NÃO instala. Só o que existe de verdade. */
const CORE = ['', 'styles.css', 'apps.js', 'app.js', 'crm-utils.js', 'crm-r4.js', 'melhorias.js', 'acesso.js', 'equipe.js', 'rodada4.js', 'rodada5.js', 'rodada6.js', 'rodada6.css', 'rodada6c.js', 'rodada6c.css', 'rodada7.js', 'rodada7.css', 'crm-ia.js', 'crm-ia.css', 'r11.css', 'r13.css', 'r13-resumo.js', 'r13.js', 'r14.css', 'r14-faxina.js', 'r14.js', 'r15.css', 'r15.js', 'r16.css', 'r16.js', 'r17.css', 'r17.js', 'r18.css', 'r18-casa.js', 'r18.js',
              'manifest.json', 'icon-192.png', 'icon-512.png'].map((p) => RAIZ + p);
const EXTERNOS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@'];
const ESPERA_REDE_MS = 3500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('indycar-crm-') && k !== CACHE && k !== CACHE_EXTERNO) /* Central: só os do CRM */.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Rede primeiro, mas sem esperar para sempre: depois de ESPERA_REDE_MS (ou se a
   resposta for 5xx, como o 503 "hibernate" do Render) usa o que está guardado.
   A resposta da rede que chegar depois ainda atualiza o cache. */
function redeComPrazo(req, chave) {
  return new Promise((resolve) => {
    let respondeu = false;
    const doCache = () => caches.match(chave).then((m) => m || (req.mode === 'navigate' ? caches.match(RAIZ) : null));
    const timer = setTimeout(() => {
      doCache().then((m) => { if (m && !respondeu) { respondeu = true; resolve(m); } });
    }, ESPERA_REDE_MS);
    fetch(req).then((r) => {
      if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(chave, cp)); }
      if (respondeu) return;
      if (r.status >= 500) {
        return doCache().then((m) => { if (respondeu) return; respondeu = true; clearTimeout(timer); resolve(m || r); });
      }
      respondeu = true; clearTimeout(timer); resolve(r);
    }).catch(() => {
      doCache().then((m) => { if (respondeu) return; respondeu = true; clearTimeout(timer); resolve(m || Response.error()); });
    });
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // biblioteca do Supabase (com versão no endereço) e fontes: cache primeiro
  if (url.origin !== self.location.origin) {
    if (!EXTERNOS.some((p) => e.request.url.startsWith(p))) return;
    e.respondWith(caches.open(CACHE_EXTERNO).then((c) => c.match(e.request).then((m) => m || fetch(e.request).then((r) => {
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
      return r;
    }))));
    return;
  }

  /* Só o que está dentro do escopo deste app (na Central, /agenda/ é de outro service worker). */
  if (!url.pathname.startsWith(RAIZ)) return;
  /* NUNCA servir api/ do cache. Lead e valor mudam o tempo todo;
     número velho em tela de CRM leva a decisão errada. Links com ?lead=/?tel=
     usam a mesma casca (o cache não guarda telefone na chave). */
  if (url.pathname.startsWith(RAIZ + 'api/')) return;
  const chave = e.request.mode === 'navigate' ? RAIZ : url.pathname;
  e.respondWith(redeComPrazo(e.request, chave));
});
