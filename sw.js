const CACHE = 'binance-chart-studio-v154-iphone-layout';
const SHELL = [
  './','./index.html','./manifest.webmanifest','./src/styles.css','./src/app.js',
  './src/utils.js','./src/storage.js','./src/binance.js','./src/ta.js','./src/chart.js',
  './src/drawings.js','./src/scripts.js','./src/backtest.js','./src/replay.js','./src/paper.js','./src/scanner.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first: always get the newest code when online, fall back to cache offline.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http') || url.hostname.includes('binance.com')) return;
  event.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(c => c || caches.match('./index.html'))));
});
