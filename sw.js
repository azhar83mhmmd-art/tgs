/* Service worker TugasKu: menerima Web Push (juga saat website ditutup) & menangani klik notifikasi.
   Sengaja TIDAK meng-cache halaman agar data/versi selalu terbaru.
   Teks notifikasi datang jadi dari server (template resmi) — di sini tidak ada kalimat yang dibuat. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'TugasKu', body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'TugasKu', {
    body: d.body || '',
    tag: d.tag || undefined,            // tag = id notifikasi: notifikasi yang sama tidak pernah tampil dua kali
    icon: 'icons/icon-192.png',         // Android butuh PNG (SVG tidak ditampilkan)
    badge: 'icons/badge-96.png',        // ikon kecil monokrom di status bar
    vibrate: [200, 100, 200],
    lang: 'id', timestamp: Date.now(),
    renotify: false,
    data: { url: d.url || './#/notifikasi' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './#/notifikasi', self.registration.scope).href;
  const hash = new URL(url).hash || '#/notifikasi';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // Aplikasi sudah terbuka: fokuskan lalu arahkan ke halaman tujuan (deep link) tanpa memuat ulang
    for (const c of list) if ('focus' in c) { c.postMessage({ type: 'tk-open', hash }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
