// Service worker C.A.T.U.R. Templat ini diisi saat build oleh plugin di vite.config.ts
// (versi + daftar file). Ia menyimpan cangkang aplikasi agar bisa dibuka offline;
// permainan online tetap butuh jaringan.

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `catur-${VERSION}`;
// Server bisa mengirim `Vary: Origin`, padahal skrip modul diminta dengan header Origin
// dan cache diisi tanpa itu. Nama aset sudah berisi hash, jadi Vary aman diabaikan.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  // Tanpa skipWaiting: versi baru aktif setelah semua tab lama ditutup, jadi cache
  // lama aman dihapus di sini tanpa memutus halaman yang masih berjalan.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('catur-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Halaman: selalu versi terbaru dari jaringan; saat offline pakai cangkang tersimpan.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html', MATCH).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Aset (nama berisi hash): dari cache bila ada, selain itu dari jaringan.
  event.respondWith(caches.match(request, MATCH).then((cached) => cached ?? fetch(request)));
});
