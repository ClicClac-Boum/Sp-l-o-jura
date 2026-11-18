// Service worker : l'app fonctionne hors ligne (sous terre !).
// - Fichiers de l'app : réseau d'abord (pour recevoir les mises à jour), sinon cache.
// - Leaflet : cache d'abord.
// - Tuiles swisstopo : cache d'abord. Les zones déjà affichées restent visibles sans réseau.
const APP = 'speleo-app-v2';
const TILES = 'speleo-tuiles-v1';
const MAX_TILES = 4000;
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.json',
  'js/store.js', 'js/meteo.js', 'js/alerte.js', 'js/carnet.js', 'js/equipement.js',
  'js/profil.js', 'js/encours.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== TILES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function limiterTuiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'wmts.geo.admin.ch') {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); limiterTuiles(); }
      return res;
    }));
    return;
  }

  if (url.hostname === 'unpkg.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      caches.open(APP).then((c) => c.put(req, res.clone()));
      return res;
    })));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(APP).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
  }
  // Le reste (météo…) passe directement par le réseau.
});
