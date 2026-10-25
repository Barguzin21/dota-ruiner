// Сервис-воркер: сайт открывается как приложение и показывает недавнее без интернета.
// Страница и данные OpenDota — сначала сеть (чтобы не застревать на старой версии), кэш — запасной.
// Файлы с ?v=… в адресе, картинки и 3D-модели — из кэша: при обновлении у них меняется адрес.
const CACHE = 'ruiner-v2'; // поднимать, когда меняются картинки по старым адресам (они берутся из кэша)

self.addEventListener('install', () => self.skipWaiting());
// новая версия кэша (после пересборки моделей) — удаляем старые, чтобы не отдавать устаревшее
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const stable = url.searchParams.has('v') || /\.(webp|png|svg|glb|woff2?)$/.test(url.pathname) || url.hostname.includes('jsdelivr');
  e.respondWith(stable ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && (req.url.startsWith(self.location.origin) || req.url.includes('api.opendota.com/api/matches'))) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw err;
  }
}
