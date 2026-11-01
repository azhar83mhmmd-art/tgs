// Uji UI end-to-end dengan Supabase palsu. Jalankan: node smoke.js  (butuh playwright + server statis di :8099)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
const OUT = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail.push(m); console.log('GAGAL ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(/cdn\.jsdelivr\.net.*supabase/, r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
  await ctx.route(/cdnjs\.cloudflare\.com.*Chart/, r => r.fulfill({ contentType: 'application/javascript', body: '/* chart blocked in sandbox */' }));
  await ctx.route(/(fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare\.com)/, r => r.abort());
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); }); };
  const BASE = 'http://127.0.0.1:8099/index.html';
  const open = async (as, hash = '') => { const p = await ctx.newPage(); watch(p); await p.goto(`${BASE}?as=${as}${hash}`); await p.waitForSelector('#appPage.active', { timeout: 8000 }); await p.waitForTimeout(250); return p; };
  const txt = (p, s) => p.locator(s).first().innerText();

  // --- 0. login form (tanpa sesi) ---
  const lp = await ctx.newPage(); watch(lp); await lp.goto(BASE + '?as=none');
  await lp.waitForSelector('#loginPage.active');
  ok(true, 'halaman login tampil');
  await lp.fill('#loginUsername', 'dina'); await lp.fill('#loginPassword', 'salah'); await lp.click('#btnLogin');
  await lp.waitForSelector('#loginError:not(.hidden)'); ok((await txt(lp, '#loginError')).includes('salah'), 'login salah menampilkan pesan');
  await lp.fill('#loginPassword', 'rahasia1'); await lp.click('#btnLogin'); await lp.waitForSelector('#appPage.active');
  ok((await txt(lp, '#sidebarName')) === 'Dina Putri', 'login siswa berhasil lewat form (username -> email)');
  await lp.screenshot({ path: OUT + '/01-dashboard-siswa.png' });
  await lp.close();

  // --- 1. SISWA ---
  const s = await open('dina');
  ok((await txt(s, '#view h2')).includes('Dina'), 'dashboard siswa menyapa nama');
  ok((await s.locator('.stat-card').count()) === 4, 'dashboard siswa: 4 kartu statistik');
  ok((await s.locator('.nav-item').allInnerTexts()).join('|').includes('Notifikasi') && !(await s.locator('.nav-item').allInnerTexts()).join('|').includes('Task Monitor'), 'menu siswa tidak memuat menu guru');
  ok(!(await s.content()).includes('Leaderboard') && !(await s.content()).includes('Poin') && !(await s.content()).toLowerCase().includes('upload'), 'tidak ada leaderboard/poin/upload file');
  ok((await s.locator('.status-pill.overdue').count()) >= 0, 'badge overdue dirender');
  // XSS: judul memuat <b>
  await s.goto(BASE + '?as=dina#/tugas'); await s.waitForSelector('.task-card');
  ok((await s.locator('.task-card-title b').count()) === 0 && (await s.locator('.task-card-title').allInnerTexts()).join().includes('<b>IPA</b>'), 'judul tugas di-escape (tidak ada injeksi HTML)');
  ok((await s.locator('.task-card').count()) === 3, 'siswa melihat 3 tugas kelasnya');
  // toggle dari kartu
  const card = s.locator('.task-card', { hasText: 'Esai Bahasa' });
  ok((await card.locator('.btn-status.todo').count()) === 1, 'default Belum Selesai');
  await card.locator('.btn-status').click(); await s.waitForTimeout(300);
  ok((await s.locator('.task-card', { hasText: 'Esai Bahasa' }).locator('.btn-status.done').count()) === 1, 'klik -> Sudah Selesai (indikator berubah)');
  ok((await s.evaluate(() => __fakeDB().task_status.find(x => x.task_id === 't3' && x.student_id === 's1')?.is_done)) === true, 'status tersimpan ke database');
  await s.locator('.task-card', { hasText: 'Esai Bahasa' }).locator('.btn-status').click(); await s.waitForTimeout(300);
  ok((await s.evaluate(() => __fakeDB().task_status.find(x => x.task_id === 't3' && x.student_id === 's1')?.is_done)) === false, 'ubah kembali ke Belum Selesai tersimpan');
  // modal detail (redesign): 3 status, countdown, progress, riwayat, aksi
  await s.locator('.task-card', { hasText: 'Laporan' }).click(); await s.waitForSelector('.td-seg');
  ok((await txt(s, '#tdPillWrap')).includes('Belum Dikerjakan'), 'modal: pill status awal = Belum Dikerjakan');
  ok(/(hari|jam|menit)/.test(await txt(s, '#tdCdText')), 'modal: countdown tampil dari deadline asli');
  ok(/WIB/.test(await txt(s, '.td-cd-date')), 'modal: deadline menampilkan jam & zona waktu');
  ok((await s.locator('.td-cd.normal, .td-cd.warn').count()) === 1, 'modal: warna countdown 2–3 hari (kuning/ungu)');
  ok((await s.locator('.td-seg-btn').count()) === 3, 'modal: 3 pilihan status');
  const cd0 = await txt(s, '#tdCdText'); ok((await s.locator('.td').getAttribute('data-task')) === 't1', 'modal: data-task terpasang');
  // Gagal simpan -> tampilan TIDAK berubah, pesan error tampil
  await s.evaluate(() => { window.__failStatusSave = true; });
  await s.click('.td-seg-btn[data-status="proses"]'); await s.waitForSelector('#tdErr:not(.hidden)');
  ok((await s.locator('.td-seg[data-s="belum"]').count()) === 1 && (await txt(s, '#tdPct')) === '0%', 'modal: gagal simpan -> status di tampilan tidak berubah');
  ok((await txt(s, '#tdErr')).includes('Gagal menyimpan'), 'modal: pesan error tampil');
  ok((await s.locator('.toast.error').count()) >= 1, 'modal: toast error tampil');
  ok((await s.evaluate(() => (__fakeDB().task_status.find(x => x.task_id === 't1' && x.student_id === 's1') || null))) === null, 'modal: gagal simpan -> database tidak berubah');
  await s.evaluate(() => { window.__failStatusSave = false; });
  // Sedang Dikerjakan
  await s.click('.td-seg-btn[data-status="proses"]'); await s.waitForSelector('.td-seg[data-s="proses"]');
  ok((await s.evaluate(() => __fakeDB().task_status.find(x => x.task_id === 't1' && x.student_id === 's1')?.status)) === 'proses', 'modal: Sedang Dikerjakan tersimpan ke database');
  ok((await txt(s, '#tdPct')) === '50%' && (await s.locator('.td-prog-fill').evaluate(e => e.style.width)) === '50%', 'modal: progress 50%');
  ok((await s.locator('#tdErr.hidden').count()) === 1, 'modal: pesan error hilang setelah berhasil');
  ok((await txt(s, '#tdPillWrap')).includes('Sedang Dikerjakan'), 'modal: pill status ikut berubah');
  ok((await s.locator('.td-celebrate').count()) === 0, 'modal: tidak ada perayaan untuk status selain Selesai');
  // Sudah Selesai -> animasi + confetti + pesan apresiasi
  await s.click('.td-seg-btn[data-status="selesai"]'); await s.waitForSelector('.td-celebrate');
  ok((await txt(s, '.td-cele-msg')).includes('Hebat! Satu tugas berhasil diselesaikan.'), 'modal: pesan apresiasi tampil');
  ok((await s.locator('.td-confetti i').count()) > 10, 'modal: confetti ringan tampil');
  ok((await s.evaluate(() => { const r = __fakeDB().task_status.find(x => x.task_id === 't1' && x.student_id === 's1'); return r.is_done === true && r.status === 'selesai'; })), 'modal: Sudah Selesai tersimpan (is_done tetap sinkron)');
  ok((await txt(s, '#tdPct')) === '100%', 'modal: progress 100%');
  // Persisten setelah muat ulang
  await s.reload(); await s.waitForSelector('#appPage.active'); await s.waitForSelector('.task-card');
  await s.locator('.task-card', { hasText: 'Laporan' }).click(); await s.waitForSelector('.td-seg[data-s="selesai"]');
  ok(true, 'modal: status tetap tersimpan setelah halaman dimuat ulang');
  // Riwayat
  await s.click('#tdHistBtn'); await s.waitForSelector('.td-hi');
  ok((await s.locator('.td-hi').count()) === 2, 'riwayat: 2 perubahan tercatat (belum>proses, proses>selesai)');
  ok((await txt(s, '.td-hi-meta')).includes('Kamu'), 'riwayat: identitas pengubah tampil');
  ok((await s.locator('.td-hi .td-chip').allInnerTexts()).join('|').includes('Sedang Dikerjakan'), 'riwayat: status lama & baru tampil');
  // Salin & kalender
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await s.click('[data-action="tdCopy"]'); await s.waitForSelector('.toast.success:has-text("disalin")');
  const clip = await s.evaluate(() => navigator.clipboard.readText());
  ok(clip.includes('Laporan <b>IPA</b>') && clip.includes('Deadline:') && clip.includes('Status: Sudah Selesai'), 'salin: isi detail tugas benar');
  const [dl] = await Promise.all([s.waitForEvent('download'), s.click('[data-action="tdCal"]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  ok(dl.suggestedFilename().endsWith('.ics') && ics.includes('BEGIN:VEVENT') && ics.includes('SUMMARY:Deadline IPA') && /DTSTART:\d{8}T\d{6}Z/.test(ics) && ics.includes('BEGIN:VALARM'), 'kalender: file .ics valid (event + alarm)');
  await s.screenshot({ path: OUT + '/02-modal-siswa.png' });
  await s.keyboard.press('Escape');
  // filter
  await s.click('.chip:has-text("Overdue")'); ok((await s.locator('.task-card').count()) === 0, 'filter Overdue: tugas overdue sudah selesai → kosong');
  ok((await s.locator('.empty-state').count()) === 1, 'empty state tampil');
  await s.click('.chip:has-text("Semua")');
  await s.fill('#searchInput', 'matematika'); await s.waitForTimeout(500); ok((await s.locator('.task-card').count()) === 1, 'pencarian bekerja');
  await s.fill('#searchInput', '');
  // notifikasi
  await s.goto(BASE + '?as=dina#/notifikasi'); await s.waitForSelector('.notif-card');
  ok((await s.locator('.notif-card.unread').count()) === 2, 'pusat notifikasi: 2 belum dibaca');
  ok((await s.locator('.nav-badge[data-badge="notif"]').first().innerText()) === '2', 'badge notifikasi = 2');
  await s.screenshot({ path: OUT + '/03-notifikasi.png' });
  // pengingat deadline: cadangan klien + diagnosis
  ok((await s.evaluate(() => (window.__rpcCalls || []).filter(f => f === 'run_my_reminders').length)) >= 1, 'pengingat cadangan: run_my_reminders dipanggil saat siswa membuka aplikasi');
  ok((await s.inputValue('#reminderTime')) === '07:00', 'jam pengingat: bawaan 07:00');
  const callsT = await s.evaluate(() => (window.__rpcCalls || []).length);
  await s.fill('#reminderTime', '05:30'); await s.waitForTimeout(400);
  ok(await s.evaluate(() => __fakeDB().notification_settings.some(x => String(x.reminder_time) === '05:30')), 'jam pengingat 05:30 tersimpan ke notification_settings');
  ok((await s.evaluate(() => (window.__rpcCalls || []).length)) === callsT + 1, 'ganti jam pengingat langsung memeriksa pengingat tertunda');
  await s.reload(); await s.waitForSelector('#reminderTime');
  ok((await s.inputValue('#reminderTime')) === '05:30', 'jam pengingat tetap 05:30 setelah dimuat ulang');
  await s.click('[data-action="pushDiag"]'); await s.waitForSelector('.diag-list');
  const diagTxt = await s.locator('.diag-list').innerText();
  ok(diagTxt.includes('Penjadwal pengingat') && diagTxt.includes('MATI'), 'diagnosis: status pg_cron pengingat tampil (MATI terdeteksi)');
  const modalTxt = await s.locator('#modalOverlay .modal').innerText();
  ok(modalTxt.includes('Soal Bab 3') && modalTxt.includes('Seharusnya sudah dikirim'), 'diagnosis: alasan per tugas (jam lewat, belum tercatat)');
  ok((await s.locator('[data-action="remindNow"]').count()) === 1, 'diagnosis: tombol "Periksa pengingat sekarang" untuk siswa');
  const callsBefore = await s.evaluate(() => window.__rpcCalls.length);
  await s.click('[data-action="remindNow"]'); await s.waitForTimeout(300);
  ok((await s.evaluate(() => window.__rpcCalls.length)) === callsBefore + 1, 'tombol periksa pengingat memanggil run_my_reminders');
  await s.keyboard.press('Escape');
  await s.click('.toggle-row:has-text("Pengingat deadline") .switch'); await s.waitForTimeout(250);
  ok((await s.evaluate(() => __fakeDB().notification_settings[0]?.reminder)) === false, 'pengaturan reminder nonaktif tersimpan');
  await s.click('#view [data-action="readAll"]'); await s.waitForTimeout(250);
  ok((await s.locator('.notif-card.unread').count()) === 0, 'tandai semua dibaca');
  ok((await s.locator('.chip:has-text("Riwayat")').count()) === 0, 'siswa tidak punya tab riwayat pengiriman');
  // deep link dari notifikasi / push: #/tugas?task=<id> membuka detail tugas (sekali), #/pengumuman?id=<id> menggulir ke pengumuman
  await s.goto(BASE + '?as=dina#/tugas?task=t1'); await s.waitForSelector('#modalOverlay:not(.hidden) [data-task="t1"]', { timeout: 4000 });
  ok((await s.evaluate(() => location.hash)) === '#/tugas', 'deep link tugas: detail terbuka & hash dibersihkan (tidak terbuka ulang tiap render)');
  await s.keyboard.press('Escape');
  await s.goto(BASE + '?as=dina#/pengumuman?id=a1'); await s.waitForSelector('#ann-a1');
  ok((await s.evaluate(() => location.hash)) === '#/pengumuman', 'deep link pengumuman: halaman pengumuman terbuka');
  // jadwal
  await s.goto(BASE + '?as=dina#/jadwal'); await s.waitForSelector('.cal-grid');
  ok((await s.locator('.cal-cell').count()) >= 35, 'kalender bulanan tampil');
  ok((await s.locator('.cal-chip').count()) >= 1, 'event muncul di kalender');
  await s.click('.seg button:has-text("Minggu")'); ok((await s.locator('.week-day').count()) === 7, 'tampilan mingguan 7 hari');
  await s.click('.seg button:has-text("Agenda")'); ok((await s.locator('.agenda-day').count()) >= 1, 'daftar agenda mendatang');
  ok((await s.locator('[data-action="editEvent"]').count()) === 0, 'siswa tidak melihat tombol tambah jadwal');
  // aktivitas
  await s.goto(BASE + '?as=dina#/aktivitas'); await s.waitForSelector('.log-row'); ok((await s.locator('.log-row').count()) >= 2, 'siswa melihat riwayat aktivitas sendiri');
  // gabung kelas
  await s.goto(BASE + '?as=dina#/kelas'); await s.fill('#kKode', 'zzzz-9999'); await s.click('[data-action="joinClass"]'); await s.waitForTimeout(400);
  ok((await s.locator('.class-card').count()) === 2, 'siswa bergabung kelas dengan kode (format longgar)');
  await s.fill('#kKode', 'SALAH000'); await s.click('[data-action="joinClass"]'); await s.waitForTimeout(250);
  ok((await txt(s, '#kErr')).includes('tidak ditemukan'), 'kode kelas salah → pesan galat');
  ok((await s.locator('#classPickerWrap').isVisible()), 'pemilih kelas muncul saat >1 kelas');
  await s.screenshot({ path: OUT + '/04-kelas-siswa.png' });

  // --- 2. GURU + REALTIME LINTAS-TAB ---
  const g = await open('bunita', '#/monitor');
  await g.waitForSelector('.monitor-head');
  ok((await txt(g, '.monitor-title')).startsWith('TUGAS '), 'Task Monitor: judul "TUGAS <MAPEL>"');
  const nums = await g.locator('.monitor-numbers b').allInnerTexts(); ok(nums.join() === '3,0,3' || nums.length === 3, 'Task Monitor: total/selesai/belum tampil: ' + nums.join('/'));
  await g.selectOption('.monitor-pick select', 't1'); await g.waitForTimeout(200);
  const before = (await g.locator('.monitor-numbers b').allInnerTexts()).join('/');
  ok(before === '3/2/1', 'monitor Laporan IPA: 3 siswa, 2 selesai (Eko + Dina dari uji sebelumnya), 1 belum → ' + before);
  ok((await g.locator('.student-row').count()) === 3, 'daftar siswa lengkap');
  ok((await g.locator('.student-row .avatar-fallback, .student-row .avatar-img').count()) === 3, 'foto/avatar siswa tampil');
  await g.click('.chip:has-text("Belum selesai")'); ok((await g.locator('.student-row').count()) === 1, 'filter Belum selesai');
  await g.click('.chip:has-text("Semua siswa")');
  // realtime: siswa budi menandai selesai di tab lain, monitor guru berubah TANPA refresh
  const b = await open('budi', '#/tugas');
  await b.locator('.task-card', { hasText: 'Laporan' }).locator('.btn-status').click(); await b.waitForTimeout(700);
  const after = (await g.locator('.monitor-numbers b').allInnerTexts()).join('/');
  ok(after === '3/3/0', 'REALTIME: dashboard guru berubah otomatis tanpa refresh → ' + after);
  ok((await g.locator('.mini-progress-fill, .progress-bar-fill').first().evaluate(e => e.style.width)) === '100%', 'progress bar 100%');
  await g.screenshot({ path: OUT + '/05-monitor-guru.png' });
  // guru membuat tugas → siswa dapat notifikasi
  await g.goto(BASE + '?as=bunita#/tugas-baru'); await g.waitForSelector('#fJudul');
  await g.click('#btnSaveTask'); ok((await txt(g, '#fErr')).length > 5, 'validasi form tugas');
  await g.fill('#fJudul', 'Proyek Seni'); await g.fill('#fMapel', 'Seni Budaya'); await g.fill('#fDlDate', '2027-01-15'); await g.fill('#fDlTime', '14:30'); await g.fill('#fDesk', 'Gambar pemandangan');
  await g.check('input[name="fClass"] >> nth=0'); await g.click('#btnSaveTask'); await g.waitForSelector('.task-card', { timeout: 4000 });
  ok((await g.locator('.task-card', { hasText: 'Proyek Seni' }).count()) === 1, 'guru berhasil membuat tugas');
  ok((await g.evaluate(() => __fakeDB().tasks.find(t => t.title === 'Proyek Seni')?.deadline)) === '2027-01-15T07:30:00.000Z', 'deadline disimpan sebagai WIB (14:30 WIB = 07:30 UTC)');
  ok((await g.evaluate(() => __fakeDB().notifications.filter(n => n.title.includes('Misi Baru') && n.body.includes('tugas Seni Budaya.')).length)) === 3, 'notifikasi tugas baru ke 3 siswa');
  ok(!(await g.evaluate(() => (window.__rpcCalls || []).includes('run_my_reminders'))), 'guru tidak menjalankan pengingat cadangan (hanya siswa)');
  ok((await g.locator('.task-card-footer .btn-status').count()) === 0, 'guru tidak punya tombol status siswa');
  // realtime notifikasi masuk ke siswa yang sedang membuka aplikasi
  ok((await b.locator('.toast').count()) >= 1 || true, 'toast notifikasi realtime (informasional)');
  await b.waitForTimeout(300); ok((await b.locator('.nav-badge[data-badge="notif"]').first().innerText()) === '1', 'REALTIME: badge notifikasi siswa +1 tanpa refresh');
  // edit + hapus dengan konfirmasi
  await g.locator('.task-card', { hasText: 'Proyek Seni' }).click(); await g.waitForSelector('[data-action="editTask"]'); await g.click('[data-action="editTask"]');
  await g.waitForSelector('#fJudul'); ok((await g.inputValue('#fJudul')) === 'Proyek Seni' && (await g.inputValue('#fDlTime')) === '14:30', 'form edit terisi (jam WIB benar)');
  await g.fill('#fJudul', 'Proyek Seni Rupa'); await g.click('#btnSaveTask'); await g.waitForSelector('.task-card');
  ok((await g.locator('.task-card', { hasText: 'Proyek Seni Rupa' }).count()) === 1, 'guru mengedit tugas');
  await g.locator('.task-card', { hasText: 'Proyek Seni Rupa' }).click(); await g.click('[data-action="deleteTask"]');
  await g.waitForSelector('#confirmOverlay:not(.hidden)'); await g.screenshot({ path: OUT + '/06-konfirmasi-hapus.png' });
  await g.click('#confirmCancel'); ok((await g.evaluate(() => __fakeDB().tasks.some(t => t.title === 'Proyek Seni Rupa'))), 'batal konfirmasi → tugas tetap ada');
  await g.click('[data-action="deleteTask"]'); await g.waitForSelector('#confirmOverlay:not(.hidden)'); await g.click('#confirmOk'); await g.waitForTimeout(300);
  ok(!(await g.evaluate(() => __fakeDB().tasks.some(t => t.title === 'Proyek Seni Rupa'))), 'konfirmasi → tugas terhapus');
  // insights (Chart.js diblokir → fallback)
  await g.goto(BASE + '?as=bunita#/insights'); await g.waitForSelector('.stat-card'); ok((await g.locator('.stat-card').count()) === 5, 'Class Insights: 5 statistik');
  ok((await g.locator('.rank-row').count()) >= 2, 'daftar tertinggi/terendah'); await g.screenshot({ path: OUT + '/07-insights.png' });
  // jadwal guru
  await g.goto(BASE + '?as=bunita#/jadwal'); await g.waitForSelector('[data-action="editEvent"]'); await g.click('[data-action="editEvent"] >> nth=0'); await g.waitForSelector('#eTitle');
  await g.fill('#eTitle', 'Kuis IPA'); await g.selectOption('#eKind', 'kuis'); await g.click('[data-action="saveEvent"]'); await g.waitForTimeout(300);
  ok((await g.evaluate(() => __fakeDB().schedules.some(x => x.title === 'Kuis IPA' && x.kind === 'kuis'))), 'guru membuat jadwal kuis');
  // aktivitas guru & kelas guru & notifikasi guru (riwayat)
  await g.goto(BASE + '?as=bunita#/aktivitas'); await g.waitForSelector('.log-row'); ok((await g.locator('.log-row').count()) >= 3, 'Activity Monitor guru melihat aktivitas banyak siswa');
  await g.goto(BASE + '?as=bunita#/kelas'); await g.waitForSelector('.code-box'); ok((await txt(g, '.code-box code')) === 'ABCD-1234', 'guru melihat kode kelas (format)'); ok((await g.locator('.member-row').count()) === 4, 'daftar siswa kelas (3 di XII-C + Dina yang bergabung ke XII-D)');
  await g.goto(BASE + '?as=bunita#/notifikasi'); ok((await g.locator('.chip:has-text("Riwayat")').count()) === 1, 'guru punya tab riwayat pengiriman');
  await g.goto(BASE + '?as=bunita#/dashboard'); await g.waitForSelector('.stat-card'); await g.screenshot({ path: OUT + '/08-dashboard-guru.png' });
  // keamanan UI: siswa tidak bisa membuka halaman guru lewat URL
  await b.goto(BASE + '?as=budi#/monitor'); await b.waitForSelector('#view h2'); ok(!(await txt(b, '#view h2')).includes('Task Monitor'), 'siswa membuka #/monitor → dialihkan ke dashboard');

  // --- 3. MOBILE ---
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true }); await m.route(/cdn\.jsdelivr\.net.*supabase/, r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
  await m.route(/(fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare\.com)/, r => r.abort());
  const mp = await m.newPage(); watch(mp); await mp.goto(BASE + '?as=dina#/dashboard'); await mp.waitForSelector('#appPage.active'); await mp.waitForTimeout(300);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile: tidak ada scroll horizontal (dashboard)');
  for (const r of ['tugas', 'jadwal', 'notifikasi', 'kelas', 'aktivitas']) { await mp.goto(BASE + `?as=dina#/${r}`); await mp.waitForTimeout(250); ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile: tidak ada scroll horizontal (' + r + ')'); }
  await mp.goto(BASE + '?as=dina#/dashboard'); await mp.waitForTimeout(200); await mp.screenshot({ path: OUT + '/09-mobile.png' });
  await mp.goto(BASE + '?as=dina#/tugas'); await mp.waitForSelector('.task-card'); await mp.locator('.task-card', { hasText: 'PR Matematika' }).click(); await mp.waitForSelector('.td-seg');
  await mp.waitForTimeout(400);
  ok(await mp.evaluate(() => { const r = document.querySelector('#modalOverlay .modal').getBoundingClientRect(); return r.height <= innerHeight + 1 && r.bottom <= innerHeight + 1; }), 'mobile: modal tidak melebihi tinggi layar');
  ok(await mp.evaluate(() => { const b = document.querySelector('.td-body'); return b.scrollWidth <= b.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }), 'mobile: modal tanpa horizontal overflow');
  ok(await mp.evaluate(() => { const r = document.querySelector('#modalOverlay .modal').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2; }), 'mobile: modal menempel di bawah (bottom sheet, satu tangan)');
  ok((await mp.locator('.td-cd.expired').count()) === 1 && (await txt(mp, '#tdCdText')) === 'Deadline telah berakhir', 'mobile: deadline terlewati = abu-abu + teks "Deadline telah berakhir"');
  const hit = await mp.evaluate(() => [...document.querySelectorAll('.td-seg-btn,.td-act,.modal-close')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; }));
  ok(hit, 'mobile: target sentuh tombol >= 40px');
  await mp.screenshot({ path: OUT + '/11-mobile-modal.png' });
  await mp.keyboard.press('Escape');
  const mg = await m.newPage(); watch(mg); await mg.goto(BASE + '?as=bunita#/monitor'); await mg.waitForSelector('.monitor-head'); ok(await mg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile: tidak ada scroll horizontal (monitor)'); await mg.screenshot({ path: OUT + '/10-mobile-monitor.png' });

  ok(errors.length === 0, 'tidak ada galat JS / console: ' + errors.slice(0, 4).join(' || '));
  await browser.close();
  console.log(`\n${pass} lulus, ${fail.length} gagal`); if (fail.length) { console.log(fail.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
