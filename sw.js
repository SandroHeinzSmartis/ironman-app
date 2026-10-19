const CACHE = 'ironman-v6';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'lebensmittel.js', 'grafik.js', 'essen.js', 'plan.json', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
// Nur eigene Dateien: Netz zuerst (damit Plan-Updates ankommen), offline aus dem Cache.
// Anfragen an intervals.icu laufen direkt ans Netz.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
