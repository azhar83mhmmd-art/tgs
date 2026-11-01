/* TugasKu — konfigurasi. Kunci "anon/publishable" Supabase memang publik; keamanan data
   dijaga oleh RLS di database (lihat folder sql/), bukan oleh kerahasiaan kunci ini. */
const SUPABASE_URL  = 'https://omclpamxktsdxlfxdjco.supabase.co';
const SUPABASE_ANON = 'sb_publishable_SlgdJp5d-q6l2MK4IeBttA_yd3BLn2A';

// Harus sama dengan app_config.email_domain di sql/00_dasar.sql (login memakai username@domain).
const EMAIL_DOMAIN = 'tugasku.local';

// Kunci PUBLIK VAPID untuk Web Push (opsional). Buat dengan: npx web-push generate-vapid-keys
// Kosongkan jika belum memakai Web Push; notifikasi dalam aplikasi tetap jalan.
const VAPID_PUBLIC_KEY = 'BLxPBxkEpFAOSUu8YJaxBjEv9N9OqH44w1guZ38qCL6J66m-ZLfn8m4MiQSYwGIsnT2-IROcHfNByHyu5HqpC6Q';

// Opsional: asisten AI. PERINGATAN: kunci di sisi klien bisa dibaca siapa saja.
// Biarkan kosong untuk memakai asisten bawaan (aturan lokal), atau pakai proxy server sendiri.
const CLAUDE_API_KEY = '';

const TZ = 'Asia/Jakarta';
const MAPEL_DEFAULT = ['Matematika','Bahasa Indonesia','IPA','IPS','Bahasa Inggris','PKN','Agama','Seni Budaya','Penjaskes','TIK'];
