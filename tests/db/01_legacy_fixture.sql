-- Data KelasKu lama (password polos, id campuran uuid / non-uuid)
insert into public.users (id, nama, username, password, role, avatar, dibuat) values
 ('11111111-1111-1111-1111-111111111111','Bu Rina','burina','guru123','admin','B','2026-01-10 08:00+07'),
 ('id_legacy_guru2','Pak Joko','pakjoko','rahasia','admin','P','2026-01-11 08:00+07'),
 ('22222222-2222-2222-2222-222222222221','Budi Santoso','budi','budi123','siswa','B','2026-01-12 08:00+07'),
 ('22222222-2222-2222-2222-222222222222','Sari Dewi','sari','sari123','siswa','S','2026-01-12 09:00+07'),
 ('id_1700000000_abc','Andi Pratama','andi','andi123','siswa','A','2026-01-13 09:00+07');

insert into public.tugas (id, judul, mapel, deskripsi, deadline, jenis, poin, dibuat, oleh) values
 ('33333333-3333-3333-3333-333333333331','Latihan Bab 3','Matematika','Kerjakan hal 45','2027-03-01 23:59+07','individu',10,'2026-02-01 10:00+07','11111111-1111-1111-1111-111111111111'),
 ('id_task_legacy_2','Esai Lingkungan','Bahasa Indonesia','Tulis 2 halaman','2027-03-05 12:00+07','individu',20,'2026-02-02 10:00+07','id_legacy_guru2'),
 ('33333333-3333-3333-3333-333333333333','Tugas Lama','IPA','Sudah lewat lama','2026-02-10 12:00+07','individu',10,'2026-02-01 10:00+07','11111111-1111-1111-1111-111111111111');

insert into public.pengumpulan (id, tugas_id, siswa_id, status, catatan, waktu) values
 ('44444444-4444-4444-4444-444444444441','33333333-3333-3333-3333-333333333331','22222222-2222-2222-2222-222222222221','selesai','','2026-02-20 10:00+07'),
 ('44444444-4444-4444-4444-444444444442','33333333-3333-3333-3333-333333333331','22222222-2222-2222-2222-222222222222','proses','','2026-02-21 10:00+07'),
 ('44444444-4444-4444-4444-444444444443','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222221','selesai','','2026-02-09 10:00+07');

insert into public.pengumuman (id, judul, isi, penting, oleh, oleh_nama, dibuat) values
 ('55555555-5555-5555-5555-555555555551','UTS Minggu Depan','Persiapkan diri','t','11111111-1111-1111-1111-111111111111','Bu Rina','2026-02-15 08:00+07');
