Uji ini memakai Postgres lokal + stub lingkungan Supabase (`tests/db/00_supabase_stub.sql`), bukan Supabase asli.
`db/run.sh` membuat database baru, memuat skema KelasKu lama + data contoh, menjalankan `sql/00…17` DUA kali (uji idempotensi), lalu `03_status_riwayat.sql` (status 3 tingkat & riwayat) dan `02_assertions.sql`.
`ui/smoke.js` memakai klien Supabase palsu (`ui/fake-supabase.js`) dan server statis di :8099 (`python3 -m http.server 8099`).

Catatan UI: `smoke.js` memakai `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` (sudah diset di dalam file) agar request service worker ikut diarahkan ke klien Supabase palsu.
