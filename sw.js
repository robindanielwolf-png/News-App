// Service Worker: App-Hülle offline. Tagesdateien speichert app.js selbst (7 Tage).
// 0.9.1: Cache-Namen mit Pfad, damit Vorschau und Live getrennt bleiben. Der Live-SW bedient nie die Vorschau.
const VERSION = '1.1.0';
const BEREICH = new URL(self.registration.scope).pathname; // '/…/News-App/' (Live) bzw. '/…/News-App/vorschau/'
const IST_VORSCHAU = BEREICH.endsWith('/vorschau/');
const PRAEFIX = 'news-app-huelle:' + BEREICH + ':';
const HUELLE = PRAEFIX + VERSION;
const ALTES_FORMAT = /^news-app-huelle-\d/; // vor 0.9.1 ohne Pfad; gab es nur in der Vorschau
const DATEIEN = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg',
  'schriften/inter-latin-wght.woff2', 'schriften/newsreader-latin-opsz.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(HUELLE).then(c => c.addAll(DATEIEN.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Nur eigene Caches löschen: alte Versionen dieses Bereichs (und in der Vorschau das alte Format). Fremde nie.
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k =>
      (k.startsWith(PRAEFIX) && k !== HUELLE) || (IST_VORSCHAU && ALTES_FORMAT.test(k))
    ).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Nur der eigene Bereich. Die Vorschau (eigene App) beantwortet dieser Dienst nie.
  if (!url.pathname.startsWith(BEREICH) || url.pathname.startsWith(BEREICH + 'vorschau/')) return;
  if (url.pathname.endsWith('.json')) return; // Daten: immer Netz, app.js kümmert sich um offline
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(r => r || fetch(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
