# TugasKu

Aplikasi pemberitahuan tugas sekolah: guru memberi tugas & memantau penyelesaian, siswa menerima pengingat otomatis dan menandai tugas **Sudah Selesai / Belum Selesai**. Tanpa penilaian, tanpa upload tugas.

Frontend statis (HTML/CSS/JS murni) + Supabase (Auth, Postgres + RLS, Realtime, pg_cron, Edge Function untuk push Android). Notifikasi memakai 10 template teks resmi (tabel `notification_templates`). Deploy ke Vercel. **Mulai dari [PANDUAN_SETUP.md](PANDUAN_SETUP.md).**

| Peran | Fitur |
|---|---|
| Guru | Buat/edit/hapus tugas (mapel, tanggal diberikan, deadline WIB, banyak kelas), pengumuman, jadwal (ujian/kuis/presentasi/kegiatan), **Task Monitor** real-time, **Class Insights** (grafik), Activity Monitor, kelola kelas & siswa |
| Siswa | Daftar tugas dengan indikator status, ubah status sendiri, kalender (bulan/minggu/agenda), pusat notifikasi + pengaturan, riwayat aktivitas sendiri |

```
index.html  style.css  v3.css  sw.js  manifest.webmanifest  vercel.json
js/         config · util · data(realtime) · auth · views-* · chatbot · main
sql/        SQL per fitur (00–09), dijalankan berurutan, masing-masing idempotent
supabase/functions/send-push   Web Push ke HP (notifikasi saat website ditutup)
tests/db    uji database (psql)      tests/ui   uji UI (Playwright)
```
Perubahan dari versi KelasKu: poin/leaderboard, upload file, dan "Laporan" lama dihapus (bertentangan dengan konsep tanpa penilaian/pengumpulan); "Kelola Siswa" kini mengeluarkan siswa dari kelas, bukan menghapus akunnya.
