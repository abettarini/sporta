// Service worker di Sporta.
// - La versione arriva da version.js (generato da package.json): il browser controlla anche
//   i file importati, quindi cambiando versione parte l'aggiornamento.
// - Ogni versione ha la sua cache con tutti i file dell'app: la pagina usa sempre un
//   insieme coerente di file della stessa versione.
// - La nuova versione resta "in attesa" finché l'utente non tocca "Aggiorna" nell'app
//   (messaggio SKIP_WAITING); solo al primo avvio si attiva subito.
// - Le API restano sempre in rete, tranne le foto delle ricette (immutabili, in cache).
importScripts('/version.js');

const VERSION = self.SPORTA_VERSION || 'dev';
const CACHE = 'sporta-' + VERSION;
const PHOTOS = 'sporta-photos';
const SHELL = ['/index.html', '/version.js', '/styles.css', '/shared.js', '/js/icons.js', '/js/core.js', '/js/lists.js', '/js/listtypes.js', '/js/members.js',
  '/js/recipes.js', '/js/trips.js', '/js/events.js', '/js/overview.js', '/js/webmcp.js', '/js/settings.js', '/manifest.webmanifest',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

// Cache delle prime versioni, che non sapevano mostrare l'avviso di aggiornamento.
const LEGACY = /^(spesa|sporta)-v\d+$/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // cache: 'reload' evita di prendere file vecchi dalla cache HTTP del browser.
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    // Passaggio una tantum dalle versioni senza avviso: ci attiviamo subito.
    if ((await caches.keys()).some((k) => LEGACY.test(k))) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('sporta-') || k.startsWith('spesa-')) && k !== CACHE && k !== PHOTOS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'GET_VERSION' && e.ports[0]) e.ports[0].postMessage(VERSION);
});

// Notifiche push: mostriamo l'avviso e lo diciamo alle pagine aperte (rileggono gli avvisi).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) c.postMessage({ type: 'PUSH', data: d });
    await self.registration.showNotification(d.title || 'Sporta', {
      body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/' },
      icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', lang: 'it',
    });
  })());
});

// Tocco sulla notifica: apriamo (o portiamo in primo piano) l'app sulla lista giusta.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (w) { await w.focus(); w.postMessage({ type: 'OPEN', url }); return; }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Foto: immutabili, prima dalla cache.
  if (url.pathname.startsWith('/api/photos/')) {
    e.respondWith(caches.open(PHOTOS).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  // App: dalla cache della versione installata; navigazioni (anche /r/<token>) -> index.html.
  const key = e.request.mode === 'navigate' ? '/index.html' : url.pathname;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(key);
    if (hit) return hit;
    return fetch(e.request);
  }));
});
