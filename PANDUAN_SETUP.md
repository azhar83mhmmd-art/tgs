# TugasKu v3 — Panduan Setup

Urutan: **Supabase → konfigurasi → deploy**. Estimasi 20 menit. Aman untuk project KelasKu/TugasKu lama (data dimigrasikan, tidak dihapus).

## 1. Supabase
1. **Authentication → Providers → Email**: matikan **Confirm email** (login memakai username, bukan email sungguhan).
2. **Database → Extensions**: aktifkan **pg_cron** (wajib untuk pengingat otomatis) dan **pg_net** (untuk Web Push).
3. **SQL Editor** → jalankan file di folder `sql/` **satu per satu, berurutan** (paste isi file → Run). Tiap file mengurus satu fitur dan aman diulang:

   | File | Fitur | Prasyarat |
   |---|---|---|
   | `00_dasar.sql` | ekstensi, `app_config` (kode guru), fungsi utilitas & format WIB | – |
   | `01_akun_kelas.sql` | profil, kelas, anggota, pendaftaran, kode kelas, RLS | 00 |
   | `02_tugas.sql` | **tugas** + status Sudah/Belum Selesai, RLS | 01 |
   | `03_pengumuman.sql` | pengumuman | 01 |
   | `04_jadwal.sql` | jadwal ujian/kuis/presentasi/kegiatan | 01 |
   | `05_aktivitas.sql` | Activity Monitor (log otomatis dari server) | 01, 02 |
   | `06_notifikasi.sql` | **10 template notifikasi resmi**, notifikasi, riwayat pengiriman (`notification_logs`), pengaturan, push, trigger tugas baru / ubah deadline / status / pengumuman | 01–04 |
   | `07_pengingat.sql` | pengingat H-3/H-1/H-0/overdue + Exam Alert H-1 + jadwal `pg_cron` | 01, 02, 06 |
   | `08_migrasi_kelasku.sql` | pindahkan data KelasKu lama & kunci tabel lama (tidak berefek di project baru) | 01–07 |
   | `09_realtime_storage.sql` | Realtime + bucket foto profil | 01–06 |
   | `11_push_diagnostik.sql` | Tombol **Kirim notifikasi tes** & **Diagnosis** di Pusat Notifikasi (untuk memeriksa rantai Web Push) | 06 |
   | `12_status_riwayat.sql` | **Modal Detail Tugas baru**: status 3 tingkat (Belum Dikerjakan / Sedang Dikerjakan / Sudah Selesai) + **riwayat perubahan status** (diisi otomatis oleh server, tidak bisa dipalsukan). Kolom `is_done` tetap sinkron, jadi notifikasi & pengingat tidak berubah. **Jalankan sesudah 00–11**; tanpa file ini modal tetap jalan (hanya 2 status, tanpa riwayat) | 01, 02, 05, 06 |
   | `13_perbaikan_pengingat.sql` | **Perbaikan pengingat deadline** (H-3, H-1, hari-H, overdue, perubahan deadline tidak muncul): pengingat tidak lagi tersangkut catatan "dilewati", satu baris gagal tidak menggagalkan semua, ada **cadangan** saat aplikasi dibuka bila `pg_cron` mati, dan **Diagnosis** kini menampilkan status pengingat. **Cukup jalankan file ini** pada database yang sudah jalan (isinya juga sudah ada di `06` & `07` untuk instalasi baru) | 00–07 |
   | `14_jam_pengingat.sql` | **Jam pengingat bisa diatur sendiri** oleh tiap siswa (mis. 07:00 atau 05:30 WIB) di Notifikasi → Pengaturan → *Jam pengingat*. Kosong = bawaan 07:00. Jalankan sesudah `13` | 06, 07 |
   | `10_daftar_tanpa_email.sql` | **Pendaftaran tanpa email** — memperbaiki error *"Email address ... is invalid"* dan *"email rate limit exceeded"* saat Daftar Akun | 00–01 |

   Mau tambah/ubah satu fitur saja (mis. tugas)? Cukup jalankan ulang file fitur itu. Perhatikan pesan *NOTICE*:
   - Setelah `08`: `Migrasi akun: N berhasil, 0 gagal` → akun lama pindah ke Supabase Auth, password lama tetap bisa dipakai (disimpan sebagai hash), password polos di tabel lama dihapus.
   - Setelah `07`: `Pengingat otomatis dijadwalkan tiap 5 menit` → pg_cron aktif. Jika muncul *"pg_cron tidak bisa diaktifkan"*, aktifkan lewat Dashboard lalu jalankan ulang `07`.
4. **Ganti kode pendaftaran guru** (bawaan `KENZO`, terlihat di kode lama):
   ```sql
   update public.app_config set value = 'KODE-RAHASIA-BARU' where key = 'teacher_code';
   ```
5. Data lama masuk ke kelas **"Kelas Utama"**. Siswa lama otomatis menjadi anggota; akun guru lama menjadi guru kelas itu.
6. Setelah semua beres, tabel arsip lama (`users`, `tugas`, `pengumpulan`, `pengumuman`) boleh dihapus — saat ini terkunci dan tidak bisa diakses lewat API.

> **Penting:** jalankan folder `sql/` dan deploy frontend baru **bersamaan**. Setelah migrasi, aplikasi KelasKu lama tidak bisa lagi membaca database (memang disengaja, agar password lama tidak terbuka).

## 2. Konfigurasi frontend
Edit `js/config.js`: `SUPABASE_URL`, `SUPABASE_ANON` (Settings → API). `EMAIL_DOMAIN` harus sama dengan `app_config.email_domain` (bawaan `tugasku.local`). Biarkan `CLAUDE_API_KEY` kosong kecuali Anda paham risikonya (kunci di browser bisa dibaca siapa saja).

## 3. Deploy
Vercel: drag & drop folder ini, atau hubungkan repo GitHub. Tidak ada build step. Wajib **HTTPS** agar service worker/notifikasi jalan (Vercel otomatis).

## 4. Notifikasi resmi & pengingat otomatis
Teks notifikasi **tidak ditulis di kode**: semuanya diambil dari tabel `notification_templates` (diisi `sql/06`, persis sesuai spesifikasi). Variabel `{mapel}`, `{nama_tugas}`, `{deadline}`, `{jam_deadline}` diisi otomatis dari database (WIB). Menjalankan ulang `06` mengembalikan teks ke versi resmi.

| # | Judul | Kapan / siapa penerimanya | Tautan (deep link) |
|---|---|---|---|
| 1 | 📚 Misi Baru Telah Tiba! | Guru membuat tugas → semua siswa kelas tujuan | detail tugas |
| 2 | ⚠️ Waktunya Mulai Bergerak! | H-3, 07.00 WIB → siswa **Belum Selesai** | detail tugas |
| 3 | 🚨 BESOK DEADLINE! | H-1, 07.00 WIB → siswa **Belum Selesai** | detail tugas |
| 4 | 🔥 LAST CALL — DEADLINE HARI INI! | Hari-H, 07.00 WIB → siswa **Belum Selesai** | detail tugas |
| 5 | ⛔ WAKTU TELAH HABIS! | Deadline lewat → siswa yang masih **Belum Selesai** | detail tugas |
| 6 | 🔔 NEW TASK ALERT! | Siswa baru bergabung ke kelas yang punya tugas aktif (1× per kelas) | daftar tugas |
| 7 | 📢 PENGUMUMAN PENTING! | Guru membuat pengumuman → siswa kelas tujuan | pengumuman |
| 8 | 📝 EXAM ALERT! | Sehari sebelum jadwal **ujian**, 07.00 WIB → siswa kelas itu | jadwal |
| 9 | 🔄 DEADLINE UPDATED! | Guru mengubah tanggal/jam deadline → siswa yang masih Belum Selesai | detail tugas |
| 10 | ✅ PROGRESS UPDATED! | Siswa menandai Sudah Selesai → hanya siswa itu | detail tugas |

Catatan perilaku:
- Guru **tidak** menerima notifikasi sistem (hanya siswa yang relevan). Notifikasi lama di luar 10 template ("jadwal baru", "peringatan guru") dihapus.
- #1 dan #6 tidak pernah dikirim berbarengan untuk satu tugas: #1 untuk tugas yang dibuat saat siswa sudah menjadi anggota, #6 untuk siswa yang baru bergabung. Ubah pemicu #6 di fungsi `class_members_after_insert()` (`sql/06`) bila maksudnya berbeda.
- Setiap notifikasi menyimpan `data.url` (deep link). Ketuk notifikasi di HP → aplikasi terbuka langsung di halaman tujuan.

Pengingat dijalankan **server-side** oleh `pg_cron` → `run_task_reminders()` tiap 5 menit (website boleh tertutup), zona **Asia/Jakarta**, mulai jam `app_config.reminder_hour` (bawaan 07:00 WIB):
- Hanya siswa **Belum Selesai**. Siswa menandai **Sudah Selesai** → pengingat berikutnya berhenti (dan Edge Function membatalkan push yang belum terkirim). Kembali ke **Belum Selesai** → pengingat yang masih relevan aktif lagi.
- Tidak ada notifikasi ganda (indeks unik di `notification_logs` + `tag` notifikasi di HP + pemeriksaan di Edge Function). Riwayat pengiriman tersimpan (guru: Notifikasi → *Riwayat pengiriman*).
- Deadline/tanggal ujian diubah → riwayat lama ditandai *superseded* (tetap tersimpan) dan pengingat dievaluasi ulang.
- Tugas yang baru dibuat <2 jam tidak langsung diingatkan; tugas yang sudah lewat >2 hari tidak ditagih (mencegah spam saat migrasi).
- Cek job: `select * from cron.job;` · riwayat: `select * from cron.job_run_details order by start_time desc limit 10;`
- Uji manual: `select public.run_task_reminders();` (hasil memuat `errors`; > 0 berarti ada baris gagal, lihat pesan WARNING)
- **Cadangan:** siswa yang membuka aplikasi (dan tiap 5 menit selama terbuka) memanggil `run_my_reminders()` → pengingat milik akun itu dibuat dengan aturan & pencegah duplikat yang sama. Berguna bila `pg_cron` belum aktif; Web Push ke HP tetap lewat trigger → Edge Function.
- **Periksa kenapa pengingat tidak muncul:** Notifikasi → **Diagnosis**: status `pg_cron`, kapan terakhir berjalan, apakah pengaturan *Pengingat deadline* hidup, dan tombol **Periksa pengingat sekarang**.
- Waktu pengingat: H-3/H-1/hari-H tepat 3/1/0 hari sebelum **tanggal** deadline (WIB), mulai pada **jam pengingat pilihan masing-masing siswa** (bawaan 07.00; ketelitian ±5 menit mengikuti pg_cron). Tugas yang baru dibuat < 2 jam belum diingatkan; tugas yang sudah selesai tidak diingatkan.

## 5. Push ke layar HP Android (saat website ditutup)
Tanpa langkah ini, notifikasi dalam aplikasi + notifikasi browser (saat tab terbuka/di latar) tetap berjalan, tetapi **tidak muncul di layar HP saat website ditutup**.
1. `npx web-push generate-vapid-keys` → simpan kunci publik & privat.
2. `js/config.js` → isi `VAPID_PUBLIC_KEY` (kunci **publik**).
3. Deploy fungsi (Supabase CLI):
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@sekolah.sch.id PUSH_WEBHOOK_SECRET=<string-acak-panjang>
   supabase functions deploy send-push --no-verify-jwt
   ```
4. Hubungkan trigger database (SQL Editor):
   ```sql
   insert into public.app_config (key, value) values
     ('push_function_url',   'https://<PROJECT_REF>.supabase.co/functions/v1/send-push'),
     ('push_webhook_secret', '<string-acak-yang-sama>')
   on conflict (key) do update set value = excluded.value;
   ```
5. Tiap siswa, di HP Android: buka TugasKu di **Chrome** → **Notifikasi → Push saat website ditutup → Aktifkan** → izinkan. Lalu menu ⋮ → **Instal aplikasi / Tambahkan ke Layar Utama** agar tampil dan berperilaku seperti aplikasi (ikon sendiri, tanpa bilah alamat). iPhone/iPad: wajib dipasang ke Layar Utama dulu (iOS 16.4+).

### Tanpa komputer (dari HP, lewat dashboard Supabase)
`VAPID_PUBLIC_KEY` sudah terisi di `js/config.js`. Kunci privat **tidak** ada di folder ini (rahasia). Dari browser HP (mode "Situs desktop"):
1. Supabase → **Edge Functions → Deploy a new function → Via Editor** → nama `send-push` → tempel isi `supabase/functions/send-push/index.ts` → Deploy. Di pengaturan fungsi, matikan **Verify JWT**.
2. **Edge Functions → Secrets**, tambah: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mis. `mailto:emailmu@gmail.com`), `PUSH_WEBHOOK_SECRET`.
3. SQL Editor: jalankan `insert into public.app_config ...` (langkah 4 di atas) dengan secret yang sama.
4. Deploy ulang folder ini ke Vercel (upload ulang ZIP/repo).

Cara kerja: notifikasi baru di database → trigger memanggil Edge Function `send-push` → dikirim lewat Web Push dengan `urgency: high` (diantar segera, termasuk saat HP hemat daya) → service worker `sw.js` menampilkannya sebagai notifikasi sistem Android (ikon PNG, getar, `tag` anti-ganda) → ketuk = buka halaman tujuan.

Jika notifikasi masuk tetapi hanya bergetar di status bar (tidak melayang di atas layar): itu pengaturan Android, bukan aplikasi. Buka **Pengaturan → Aplikasi → Chrome/TugasKu → Notifikasi** dan ubah kategori situs menjadi **Penting/Urgent** + aktifkan *Munculkan sebagai pop-up (heads-up)*. Pastikan juga mode Jangan Ganggu mati dan penghemat baterai tidak membatasi Chrome.

## 6. Keamanan (ringkas)
- Password hanya di Supabase Auth. Peran guru hanya bisa didapat dengan kode guru yang divalidasi **di server**; klien tidak bisa mengubah `role`/`username`.
- RLS: guru hanya mengelola kelas miliknya; siswa hanya melihat tugas kelasnya, hanya mengubah status miliknya, dan tidak bisa membaca profil siswa lain; notifikasi hanya terbaca pemiliknya; log aktivitas hanya ditulis server.
- `SUPABASE_ANON` memang publik; yang melindungi data adalah RLS.

## 7. Menjalankan uji
```bash
cd tests/db && PGHOST=<socket> PGPORT=5432 PGUSER=postgres ./run.sh   # migrasi, RLS, pengingat, 10 template resmi (butuh psql)
cd tests/ui && node smoke.js                                          # UI end-to-end dengan Supabase palsu
cd tests/ui && node sw-test.js                                        # service worker: push -> notifikasi, ikon PNG, manifest
```
