// Uji service worker: push masuk -> notifikasi tampil persis (judul/isi/ikon PNG/tag) & klik -> pesan deep link.
// Jalankan: node sw-test.js  (butuh playwright + server statis di :8099)
const { chromium } = require('playwright');
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail.push(m); console.log('GAGAL ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8099/manifest.webmanifest');
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; return r.scope; });
  ok(reg.endsWith('/'), 'service worker terdaftar: ' + reg);
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const payload = { title: '🔥 LAST CALL — DEADLINE HARI INI!', body: 'Ini kesempatan terakhirmu untuk menyelesaikan tugas IPA. Jangan sampai melewati batas waktu!', tag: 'n-123', url: './#/tugas?task=abc' };
  // panggil handler 'push' persis seperti browser: kirim PushEvent ke SW lewat dispatch
  const shown = await sw.evaluate(async (p) => {
    const calls = [];
    const orig = self.registration.showNotification.bind(self.registration);
    self.registration.showNotification = (t, o) => { calls.push({ t, o }); return Promise.resolve(); };
    const ev = new Event('push'); ev.data = { json: () => p, text: () => JSON.stringify(p) };
    let waited = []; ev.waitUntil = pr => waited.push(pr);
    self.dispatchEvent(ev); await Promise.all(waited);
    self.registration.showNotification = orig; return calls;
  }, payload);
  ok(shown.length === 1, 'push -> tepat 1 notifikasi');
  ok(shown[0]?.t === payload.title && shown[0]?.o.body === payload.body, 'judul & isi persis dari server (tidak diubah)');
  ok(shown[0]?.o.tag === 'n-123', 'tag = id notifikasi (anti ganda)');
  ok(/icon-192\.png$/.test(shown[0]?.o.icon) && /badge-96\.png$/.test(shown[0]?.o.badge), 'ikon & badge PNG (wajib untuk Android)');
  ok(Array.isArray(shown[0]?.o.vibrate) && shown[0].o.data.url === payload.url, 'getar + deep link tersimpan di data');
  for (const f of ['icons/icon-192.png', 'icons/badge-96.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
    const r = await page.request.get('http://127.0.0.1:8099/' + f); ok(r.ok() && /png/.test(r.headers()['content-type'] || ''), 'ikon tersedia: ' + f);
  }
  const man = await (await page.request.get('http://127.0.0.1:8099/manifest.webmanifest')).json();
  ok(man.icons.some(i => i.sizes === '192x192' && i.type === 'image/png') && man.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable') && man.display === 'standalone', 'manifest PWA: ikon PNG 192/512 + maskable, standalone');
  await browser.close();
  console.log(`\n${pass} lulus, ${fail.length} gagal`); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
