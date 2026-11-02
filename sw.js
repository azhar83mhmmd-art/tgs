/* Service worker TugasKu:
   1) Web Push (juga saat website ditutup) + aksi cepat di notifikasi ("Tandai selesai", "Ingatkan 1 jam lagi")
   2) Mode offline: menyimpan kerangka aplikasi (HTML/CSS/JS + pustaka CDN) agar aplikasi tetap terbuka tanpa internet.
      Halaman memakai "jaringan dulu" (selalu versi terbaru bila online), cache hanya cadangan saat offline.
      Data Supabase TIDAK di-cache di sini (disimpan aplikasi di IndexedDB).
   Teks notifikasi datang jadi dari server (template resmi) — di sini tidak ada kalimat notifikasi yang dibuat,
   selain konfirmasi singkat setelah aksi cepat. */
importScripts('js/config.js');            // SUPABASE_URL & SUPABASE_ANON (kunci publik)

const CACHE = 'tugasku-shell-v1';
const SHELL = ['./', 'index.html', 'style.css', 'v3.css', 'task-detail.css', 'manifest.webmanifest',
  'js/config.js', 'js/util.js', 'js/install.js', 'js/data.js', 'js/auth.js', 'js/views-tasks.js', 'js/task-detail.js', 'js/views-monitor.js',
  'js/views-schedule.js', 'js/views-misc.js', 'js/views-buku.js', 'js/chatbot.js', 'js/offline.js', 'js/main.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/badge-96.png', 'icons/apple-touch-icon.png'];
const CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'];
const CDN_HOSTS = new Set(['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...SHELL.map(u => c.add(u).catch(() => {})),
    ...CDN.map(u => c.add(new Request(u, { mode: 'no-cors' })).catch(() => {})),
  ])));
});
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tugasku-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), 4000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const nav = req.mode === 'navigate';
    const hit = await cache.match(req, { ignoreSearch: nav }) || (nav ? (await cache.match('index.html') || await cache.match('./')) : null);
    return hit || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
  else if (CDN_HOSTS.has(url.hostname)) event.respondWith(staleWhileRevalidate(req));
  // selain itu (mis. *.supabase.co) tidak disentuh
});

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
    requireInteraction: false,
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],     // tombol aksi cepat (tugas)
    data: { url: d.url || './#/notifikasi', token: d.token || null },
  }));
});

/* Aksi cepat: dijalankan tanpa membuka aplikasi. Token acak per notifikasi (lihat sql/17) menggantikan login. */
async function quickAction(action, data) {
  const done = action === 'done';
  const confirmTag = 'tk-action-' + (data.token || Date.now());
  const show = (body, extra = {}) => self.registration.showNotification('TugasKu', {
    body, tag: confirmTag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', lang: 'id', silent: true, ...extra });
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/notification_action', {
      method: 'POST', headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: data.token, p_action: action }),
    });
    const out = res.ok ? await res.json() : null;
    if (!out?.ok) throw new Error(out?.error || 'gagal');
    await show(done ? `Ditandai selesai: ${out.title}` : `Diingatkan lagi 1 jam lagi: ${out.title}`);
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    list.forEach(c => c.postMessage({ type: 'tk-refresh' }));          // aplikasi yang terbuka memuat ulang datanya
    await new Promise(r => setTimeout(r, 4000));
    (await self.registration.getNotifications({ tag: confirmTag })).forEach(n => n.close());
  } catch {
    await show('Aksi belum berhasil (offline atau kedaluwarsa). Ketuk untuk membuka aplikasi.', { data: { url: data.url || './#/notifikasi' } });
  }
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  if ((event.action === 'done' || event.action === 'snooze') && data.token) {
    event.waitUntil(quickAction(event.action, data));
    return;
  }
  const url = new URL(data.url || './#/notifikasi', self.registration.scope).href;
  const hash = new URL(url).hash || '#/notifikasi';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // Aplikasi sudah terbuka: fokuskan lalu arahkan ke halaman tujuan (deep link) tanpa memuat ulang
    for (const c of list) if ('focus' in c) { c.postMessage({ type: 'tk-open', hash }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

// Browser memutar endpoint langganan push -> daftarkan ulang otomatis (klien menyimpannya lagi saat aplikasi dibuka)
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then(list => list.forEach(c => c.postMessage({ type: 'tk-resync-push' }))));
});
