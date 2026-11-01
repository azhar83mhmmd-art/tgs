\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ====================================================================
-- A. HASIL MIGRASI DATA LAMA
-- ====================================================================
do $$ begin
  perform test.eq((select count(*) from public.profiles), 5::bigint, 'A1 5 akun lama menjadi profiles');
  perform test.eq((select count(*) from public.profiles where role='guru'), 2::bigint, 'A2 admin -> guru');
  perform test.eq((select count(*) from public.profiles where role='siswa'), 3::bigint, 'A3 siswa tetap siswa');
  perform test.eq((select count(*) from auth.identities), 5::bigint, 'A4 identitas email dibuat');
  perform test.eq((select count(*) from public.users where password like '[dimigrasikan%'), 5::bigint,
                  'A5 password polos legacy dikosongkan');
  perform test.eq((select encrypted_password = extensions.crypt('budi123', encrypted_password)
                     from auth.users where email = 'budi@tugasku.local'), true,
                  'A6 password lama tetap bisa dipakai (tersimpan sebagai hash bcrypt)');
  perform test.eq((select encrypted_password like '$2%' from auth.users where email = 'budi@tugasku.local'), true, 'A7 hash bcrypt');
  perform test.eq((select count(*) from public.classes where name = 'Kelas Utama'), 1::bigint, 'A8 kelas bawaan dibuat');
  perform test.eq((select count(*) from public.class_members), 5::bigint, 'A9 semua akun lama jadi anggota kelas');
  perform test.eq((select count(*) from public.tasks), 3::bigint, 'A10 3 tugas termigrasi (termasuk id non-uuid)');
  perform test.eq((select count(*) from public.tasks where created_by is not null), 3::bigint, 'A11 pembuat tugas terpetakan');
  perform test.eq((select count(*) from public.task_status where is_done), 2::bigint, 'A12 hanya status selesai yang dibawa');
  perform test.eq((select count(*) from public.task_status), 2::bigint, 'A13 status proses menjadi default (tanpa baris)');
  perform test.eq((select count(*) from public.announcements where is_important), 1::bigint, 'A14 pengumuman termigrasi');
  perform test.eq((select count(*) from public.notifications), 0::bigint, 'A15 migrasi TIDAK mengirim notifikasi massal');
  perform test.eq((select count(*) from public.activity_logs), 0::bigint, 'A16 migrasi tidak membuat log aktivitas palsu');
  perform test.eq((select ts.updated_at from public.task_status ts join public.tasks t on t.id=ts.task_id
                    where t.legacy_id='33333333-3333-3333-3333-333333333331'
                      and ts.student_id=test.uid('budi')), '2026-02-20 10:00+07'::timestamptz,
                  'A17 waktu status lama dipertahankan');
  perform test.eq((select count(*) from public.tasks where legacy_id = 'id_task_legacy_2'), 1::bigint, 'A18 id lama non-uuid dipetakan');
end $$;

-- tabel lama terkunci
do $$ begin
  perform test.as_user(test.uid('budi'));
  perform test.fails('select * from public.users', 'A19 authenticated tak bisa baca tabel lama (password)');
  perform test.fails('select * from public.pengumpulan', 'A20 tabel pengumpulan lama terkunci');
  perform test.reset();
  perform test.as_anon();
  perform test.fails('select * from public.users', 'A21 anon tak bisa baca tabel lama');
  perform test.fails('select * from public.tasks', 'A22 anon tak bisa baca tasks');
  perform test.fails('select * from public.profiles', 'A23 anon tak bisa baca profiles');
  perform test.fails('select * from public.app_config', 'A24 anon tak bisa baca app_config');
end $$;
do $$ begin
  perform test.as_user(test.uid('burina'));
  perform test.fails('select * from public.app_config', 'A25 guru pun tak bisa baca app_config (kode guru rahasia)');
end $$;

-- Pengingat tidak boleh membanjiri data lama (tugas lama 2026-02, tugas lain 2027)
do $$ declare r jsonb; begin
  r := public.run_task_reminders();
  perform test.eq((r->>'student_notifications')::int, 0, 'A26 scheduler tidak spam tugas lama');
  perform test.eq((select count(*) from public.notifications), 0::bigint, 'A27 tidak ada notifikasi dari data lama');
end $$;

-- ====================================================================
-- B. PENDAFTARAN & PERAN
-- ====================================================================
do $$ declare v uuid; begin
  v := test.signup('dina', 'Dina Putri');
  perform test.eq((select role from public.profiles where id = v), 'siswa', 'B1 pendaftar default = siswa');
  perform test.eq((select count(*) from public.notification_settings where user_id = v), 1::bigint, 'B2 pengaturan notifikasi default dibuat');
  perform test.fails($q$ select test.signup('palsu1', 'Calon Guru', 'guru', 'SALAH') $q$, 'B3 daftar guru dengan kode salah ditolak');
  perform test.fails($q$ select test.signup('palsu2', 'Calon Guru', 'guru', null) $q$, 'B4 daftar guru tanpa kode ditolak');
  v := test.signup('bunita', 'Bu Nita', 'guru', 'KENZO');
  perform test.eq((select role from public.profiles where id = v), 'guru', 'B5 guru dengan kode benar');
  v := test.signup('hacker', 'Peretas', 'admin', 'KENZO');
  perform test.eq((select role from public.profiles where id = v), 'siswa', 'B6 role selain "guru" tidak menaikkan hak');
  perform test.eq((select count(*) from public.profiles where username in ('palsu1','palsu2')), 0::bigint, 'B7 pendaftaran gagal tidak meninggalkan profil');
  perform test.fails($q$ select test.signup('dina', 'Dina Kedua') $q$, 'B8 username ganda ditolak');
  perform test.fails($q$ select test.signup('DINA', 'Dina Besar') $q$, 'B9 username ganda beda huruf besar ditolak');
  perform test.as_anon();
  perform test.eq(public.username_available('dina'), false, 'B10 username_available: terpakai');
  perform test.eq(public.username_available('belumada'), true, 'B11 username_available: bebas');
end $$;

-- ====================================================================
-- C. KELAS, RLS SISWA vs GURU vs GURU LAIN
-- ====================================================================
do $$ declare c_b uuid; c_n uuid; code text; begin
  -- guru membuat kelas
  perform test.as_user(test.uid('bunita'));
  insert into public.classes (name, created_by) values ('XII-C', test.uid('bunita')) returning id, join_code into c_n, code;
  perform test.eq((select member_role from public.class_members where class_id=c_n and user_id=test.uid('bunita')), 'guru', 'C1 pembuat kelas otomatis jadi guru kelas');
  perform test.fails(format($q$ insert into public.classes (name, created_by) values ('Curang', %L) $q$, test.uid('burina')), 'C2 tak bisa membuat kelas atas nama orang lain');
  perform test.reset();

  -- siswa: tidak bisa buat kelas; bisa join dengan kode
  perform test.as_user(test.uid('dina'));
  perform test.fails(format($q$ insert into public.classes (name, created_by) values ('Siswa Kelas', %L) $q$, test.uid('dina')), 'C3 siswa tidak bisa membuat kelas');
  perform test.fails($q$ select public.join_class('KODESALAH') $q$, 'C4 kode kelas salah ditolak');
  perform public.join_class(code);
  perform public.join_class(lower(substr(code,1,4) || '-' || substr(code,5)));   -- format longgar, idempotent
  perform test.eq((select count(*) from public.class_members where user_id = test.uid('dina')), 1::bigint, 'C5 join kelas dengan kode (format longgar, tanpa duplikat)');
  perform test.reset();

  -- guru tidak bisa memakai join_class
  perform test.as_user(test.uid('bunita'));
  perform test.fails(format($q$ select public.join_class(%L) $q$, code), 'C6 guru tak bisa join_class');
  perform test.reset();
end $$;

do $$ declare k_utama uuid := (select id from public.classes where name='Kelas Utama'); begin
  -- SISWA budi
  perform test.as_user(test.uid('budi'));
  perform test.eq((select count(*) from public.tasks), 3::bigint, 'C7 siswa melihat tugas kelasnya');
  perform test.eq((select count(*) from public.profiles where username = 'sari'), 0::bigint, 'C8 siswa TIDAK bisa melihat profil siswa lain');
  perform test.eq((select count(*) from public.profiles where username = 'burina'), 1::bigint, 'C9 siswa melihat profil gurunya');
  perform test.eq((select count(*) from public.profiles), 3::bigint, 'C10 siswa hanya melihat diri sendiri + 2 guru kelas');
  perform test.eq((select count(*) from public.class_members), 1::bigint, 'C11 siswa hanya melihat keanggotaannya sendiri');
  perform test.eq((select count(*) from public.task_status), 2::bigint, 'C12 siswa hanya melihat statusnya (2 baris miliknya)');
  perform test.eq((select count(*) from public.classes), 1::bigint, 'C13 siswa tidak melihat kelas lain');
  perform test.fails(format($q$ insert into public.tasks (class_id,title,subject,deadline,created_by) values (%L,'x','y',now()+interval '1 day',%L) $q$, k_utama, test.uid('budi')), 'C14 siswa tak bisa membuat tugas');
  perform test.eq(test.affected($q$ update public.tasks set title='diretas' $q$), 0::bigint, 'C15 siswa tak bisa mengedit tugas');
  perform test.eq(test.affected($q$ delete from public.tasks $q$), 0::bigint, 'C16 siswa tak bisa menghapus tugas');
  perform test.fails($q$ update public.profiles set role = 'guru' where username = 'budi' $q$, 'C17 siswa tak bisa menaikkan role sendiri');
  perform test.fails($q$ update public.profiles set username = 'baru' where username = 'budi' $q$, 'C18 username tak bisa diubah');
  update public.profiles set full_name = 'Budi S.' where username = 'budi';
  perform test.eq((select full_name from public.profiles where username='budi'), 'Budi S.', 'C19 siswa bisa ubah nama sendiri');
  perform test.fails($q$ insert into public.announcements (class_id,title,body,created_by) select id,'x','y',null from public.classes $q$, 'C20 siswa tak bisa membuat pengumuman');
  perform test.fails($q$ insert into public.schedules (class_id,title,kind,event_date) select id,'x','ujian',current_date from public.classes $q$, 'C21 siswa tak bisa membuat jadwal');
  perform test.fails($q$ update public.classes set join_code = 'AAAAAAAA' $q$, 'C22 join_code tak bisa diubah langsung');
  perform test.fails(format($q$ select public.regenerate_join_code(%L) $q$, k_utama), 'C23 siswa tak bisa regenerate kode kelas');
  perform test.reset();
end $$;

-- status tugas: individual
do $$
declare t1 uuid := (select id from public.tasks where legacy_id='33333333-3333-3333-3333-333333333331');
        t2 uuid := (select id from public.tasks where legacy_id='id_task_legacy_2');
        old_ts timestamptz;
begin
  perform test.as_user(test.uid('budi'));
  -- default: tugas 2 belum ada baris = belum selesai. Tandai selesai (upsert seperti klien).
  insert into public.task_status (task_id, student_id, is_done) values (t2, test.uid('budi'), true)
    on conflict (task_id, student_id) do update set task_id = excluded.task_id, student_id = excluded.student_id, is_done = excluded.is_done;
  perform test.eq((select is_done from public.task_status where task_id=t2 and student_id=test.uid('budi')), true, 'C24 siswa menandai Sudah Selesai (upsert)');
  -- kembali ke belum selesai (waktu dimundurkan dulu: dalam satu transaksi now() tidak berubah)
  perform test.reset();
  update public.task_status set updated_at = '2020-01-01' where task_id=t2 and student_id=test.uid('budi');
  perform test.as_user(test.uid('budi'));
  insert into public.task_status (task_id, student_id, is_done) values (t2, test.uid('budi'), false)
    on conflict (task_id, student_id) do update set task_id = excluded.task_id, student_id = excluded.student_id, is_done = excluded.is_done;
  perform test.eq((select is_done from public.task_status where task_id=t2 and student_id=test.uid('budi')), false, 'C25 siswa kembali ke Belum Selesai');
  perform test.eq((select updated_at > now() - interval '1 minute' from public.task_status where task_id=t2 and student_id=test.uid('budi')), true, 'C26 waktu perubahan terakhir diperbarui');
  -- memalsukan
  perform test.fails(format($q$ insert into public.task_status (task_id, student_id, is_done) values (%L, %L, true) $q$, t2, test.uid('sari')), 'C27 tak bisa mengisi status milik siswa lain');
  perform test.eq(test.affected(format($q$ update public.task_status set is_done = false where student_id = %L $q$, test.uid('sari'))), 0::bigint, 'C28 tak bisa mengubah status siswa lain');
  -- sari memalsukan waktu saat insert pertama: harus ditimpa server
  perform test.reset(); perform test.as_user(test.uid('andi'));
  insert into public.task_status (task_id, student_id, is_done, updated_at) values (t1, test.uid('andi'), true, '2000-01-01');
  perform test.eq((select updated_at > now() - interval '1 minute' from public.task_status where task_id=t1 and student_id=test.uid('andi')), true, 'C29 klien tak bisa memalsukan waktu status');
  perform test.reset(); perform test.as_user(test.uid('budi'));
  insert into public.task_status (task_id, student_id, is_done) values (t1, test.uid('budi'), true) on conflict (task_id, student_id) do update set is_done = excluded.is_done;
  -- identitas baris tidak bisa dipindah
  update public.task_status set task_id = t1 where task_id = t2 and student_id = test.uid('budi');
  perform test.eq((select count(*) from public.task_status where task_id = t2 and student_id = test.uid('budi')), 1::bigint, 'C30 task_id tidak bisa dipindahkan (dikunci trigger)');
  perform test.reset();

  -- log aktivitas otomatis dari server
  perform test.as_user(test.uid('budi'));
  perform test.eq((select count(*) from public.activity_logs where action in ('mark_done','mark_undone')), 2::bigint, 'C31 perubahan status tercatat (selesai lalu belum); upsert tanpa perubahan tidak dicatat');
  perform test.fails($q$ insert into public.activity_logs (class_id,user_id,action) select id, id, 'view_task' from public.classes $q$, 'C32 klien tak bisa menulis activity_logs langsung');
  perform public.log_task_view(t1); perform public.log_task_view(t1);
  perform test.eq((select count(*) from public.activity_logs where action = 'view_task'), 1::bigint, 'C33 log "buka detail" tidak ganda dalam 30 menit');
  perform test.reset();

  -- siswa lain tidak melihat aktivitas budi
  perform test.as_user(test.uid('sari'));
  perform test.eq((select count(*) from public.activity_logs), 0::bigint, 'C34 siswa hanya melihat riwayat aktivitasnya sendiri');
  perform test.eq((select count(*) from public.task_status), 0::bigint, 'C35 sari tidak melihat status budi');
  perform test.reset();

  -- GURU burina
  perform test.as_user(test.uid('burina'));
  perform test.eq((select count(*) from public.task_status), 4::bigint, 'C36 guru melihat status siswa kelasnya');
  perform test.eq((select count(*) from public.profiles), 5::bigint, 'C37 guru melihat profil siswa kelasnya + diri + co-guru');
  perform test.eq((select count(*) from public.class_members), 5::bigint, 'C38 guru melihat anggota kelasnya');
  perform test.eq(test.affected($q$ update public.task_status set is_done = true $q$), 0::bigint, 'C39 guru tidak bisa mengubah status siswa');
  perform test.fails($q$ insert into public.task_status (task_id, student_id, is_done) select id, test.uid('sari'), true from public.tasks limit 1 $q$, 'C40 guru tak bisa memalsukan status siswa');
  perform test.eq((select count(*) from public.activity_logs where user_id = test.uid('budi')), 3::bigint, 'C41 guru melihat aktivitas siswa kelasnya');
  update public.tasks set description = 'diedit guru' where legacy_id = '33333333-3333-3333-3333-333333333331';
  perform test.eq((select description from public.tasks where legacy_id = '33333333-3333-3333-3333-333333333331'), 'diedit guru', 'C42 guru dapat mengedit tugas kelasnya');
  perform test.eq((select count(*) from public.notifications), 0::bigint, 'C43 guru tidak melihat notifikasi orang lain');
  perform test.reset();

  -- GURU LAIN (bunita, kelas XII-C) terisolasi dari Kelas Utama
  perform test.as_user(test.uid('bunita'));
  perform test.eq((select count(*) from public.tasks), 0::bigint, 'C44 guru lain tak melihat tugas kelas yang bukan miliknya');
  perform test.eq((select count(*) from public.task_status), 0::bigint, 'C45 guru lain tak melihat status siswa kelas lain');
  perform test.eq((select count(*) from public.profiles where username in ('budi','sari','andi')), 0::bigint, 'C46 guru lain tak melihat profil siswa kelas lain');
  perform test.eq((select count(*) from public.activity_logs), 0::bigint, 'C47 guru lain tak melihat aktivitas kelas lain');
  perform test.eq((select count(*) from public.classes), 1::bigint, 'C48 guru lain hanya melihat kelasnya');
  perform test.fails(format($q$ insert into public.tasks (class_id,title,subject,deadline,created_by) values (%L,'x','y',now()+interval '1 day',%L) $q$,
                            (select id from public.classes where name='Kelas Utama'), test.uid('bunita')), 'C49 guru lain tak bisa membuat tugas di kelas ini');
  perform test.fails(format($q$ select public.regenerate_join_code(%L) $q$, (select id from public.classes where name='Kelas Utama')), 'C50 guru lain tak bisa mengganti kode kelas ini');
  perform test.fails(format($q$ select public.add_class_teacher(%L, 'bunita') $q$, (select id from public.classes where name='Kelas Utama')), 'C51 guru lain tak bisa menambah diri jadi guru kelas ini');
  perform test.reset();

  -- kelas XII-C: siswa dina lihat guru, tidak lihat kelas utama
  perform test.as_user(test.uid('dina'));
  perform test.eq((select count(*) from public.tasks), 0::bigint, 'C52 siswa baru tak melihat tugas kelas lain');
  perform test.eq((select count(*) from public.profiles), 2::bigint, 'C53 siswa baru: diri + guru kelasnya saja');
  perform test.reset();
end $$;

-- guru: regenerate kode & tambah co-guru
do $$ declare c uuid := (select id from public.classes where name='XII-C'); old text; new_c text; begin
  perform test.as_user(test.uid('bunita'));
  select join_code into old from public.classes where id = c;
  new_c := public.regenerate_join_code(c);
  perform test.eq(new_c is distinct from old, true, 'C54 kode kelas dapat diganti oleh guru kelas');
  perform public.add_class_teacher(c, 'pakjoko');
  perform test.eq((select count(*) from public.class_members where class_id=c and member_role='guru'), 2::bigint, 'C55 guru kelas dapat menambah co-guru');
  perform test.fails($q$ select public.add_class_teacher((select id from public.classes where name='XII-C'), 'dina') $q$, 'C56 tak bisa menambah siswa sebagai guru');
  perform test.reset();
end $$;

-- ====================================================================
-- D. NOTIFIKASI: tugas baru, pengumuman, jadwal, pengaturan, kepemilikan
-- ====================================================================
do $$ declare k uuid := (select id from public.classes where name='Kelas Utama'); tid uuid; n int; begin
  perform test.as_user(test.uid('burina'));
  insert into public.tasks (class_id, title, subject, description, deadline, created_by)
  values (k, 'PR Pecahan', 'Matematika', 'hal 10', '2026-12-20 17:00+07', test.uid('burina')) returning id into tid;
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where type='new_task' and ref_id = tid), 3::bigint, 'D1 semua siswa kelas tujuan menerima notifikasi tugas baru');
  perform test.eq((select count(*) from public.notifications where type='new_task' and ref_id = tid and user_id in (test.uid('burina'), test.uid('pakjoko'))), 0::bigint, 'D2 guru tidak menerima notifikasi tugas baru');
  perform test.eq((select count(*) from public.notifications where user_id = test.uid('dina')), 0::bigint, 'D3 siswa kelas lain tidak ikut menerima');
  perform test.eq((select title from public.notifications where type='new_task' and user_id = test.uid('budi') order by created_at desc limit 1), '📚 Misi Baru Telah Tiba!', 'D4 judul notifikasi tugas baru = template resmi #1');
  raise notice 'contoh isi notifikasi tugas baru:%', E'\n' || (select body from public.notifications where type='new_task' and user_id = test.uid('budi') limit 1);
  perform test.eq((select body from public.notifications where type='new_task' and user_id = test.uid('budi') order by created_at desc limit 1),
                  'Guru baru saja memberikan tugas Matematika. Jangan sampai tertinggal! Buka TugasKu dan cek detail tugasmu.', 'D5 isi notifikasi tugas baru = template resmi #1, {mapel} dari database');
  perform test.eq((select data ->> 'url' from public.notifications where type='new_task' and user_id = test.uid('budi') order by created_at desc limit 1),
                  '#/tugas?task=' || tid::text, 'D5b deep link menuju tugas');

  -- pengaturan: sari mematikan notifikasi tugas baru
  perform test.as_user(test.uid('sari'));
  update public.notification_settings set new_task = false where user_id = test.uid('sari');
  perform test.reset();
  perform test.as_user(test.uid('burina'));
  insert into public.tasks (class_id, title, subject, description, deadline, created_by)
  values (k, 'PR Geometri', 'Matematika', '', '2026-12-21 17:00+07', test.uid('burina')) returning id into tid;
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and user_id = test.uid('sari')), 0::bigint, 'D6 pengaturan "tugas baru" nonaktif dihormati');
  perform test.eq((select status from public.notification_logs where ref_id = tid and user_id = test.uid('sari')), 'skipped', 'D7 riwayat mencatat status skipped');
  perform test.eq((select count(*) from public.notifications where ref_id = tid and user_id = test.uid('budi')), 1::bigint, 'D8 siswa lain tetap menerima');

  -- pengumuman
  perform test.as_user(test.uid('burina'));
  insert into public.announcements (class_id, title, body, created_by) values (k, 'Libur Nasional', 'Besok libur', test.uid('burina')) returning id into tid;
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where type='announcement' and ref_id = tid), 3::bigint, 'D9 pengumuman baru memberi notifikasi ke semua siswa kelas');
  perform test.eq((select title from public.notifications where type='announcement' and ref_id = tid limit 1), '📢 PENGUMUMAN PENTING!', 'D10 judul notifikasi pengumuman = template resmi #7');
  perform test.eq((select body from public.notifications where type='announcement' and ref_id = tid limit 1), 'Guru baru saja membagikan informasi untuk kelasmu.', 'D10b isi pengumuman = template resmi #7');

  -- jadwal
  perform test.as_user(test.uid('burina'));
  insert into public.schedules (class_id, title, kind, subject, event_date, start_time, end_time, created_by)
  values (k, 'UTS Matematika', 'ujian', 'Matematika', '2026-11-20', '08:00', '09:30', test.uid('burina')) returning id into tid;
  perform test.fails(format($q$ insert into public.schedules (class_id,title,kind,event_date,start_time,end_time,created_by) values (%L,'x','ujian','2026-11-20','10:00','09:00',%L) $q$, k, test.uid('burina')), 'D11 jam selesai harus setelah jam mulai');
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid), 0::bigint, 'D12 jadwal baru TIDAK mengirim notifikasi (hanya Exam Alert H-1 yang resmi)');
  perform test.eq((select count(*) from public.notification_logs where kind = 'new_task'), 6::bigint, 'D14 riwayat pengiriman tersimpan (2 tugas x 3 siswa, 1 di antaranya skipped)');

  -- kepemilikan notifikasi
  perform test.as_user(test.uid('budi'));
  perform test.eq((select count(*) from public.notifications where user_id <> test.uid('budi')), 0::bigint, 'D15 notifikasi hanya dapat dibaca pemiliknya');
  perform test.fails($q$ insert into public.notifications (user_id,type,title,body) values (auth.uid(),'new_task','palsu','palsu') $q$, 'D16 klien tak bisa membuat notifikasi');
  perform test.fails($q$ update public.notifications set title = 'diubah' $q$, 'D17 klien tak bisa mengubah isi notifikasi');
  update public.notifications set read_at = now();
  perform test.eq((select count(*) from public.notifications where read_at is null), 0::bigint, 'D18 klien bisa menandai dibaca');
  perform test.eq((select count(*) from public.notification_logs where user_id <> test.uid('budi')), 0::bigint, 'D19 siswa hanya melihat riwayat pengirimannya sendiri');
  perform test.reset();
  perform test.as_user(test.uid('burina'));
  perform test.eq((select count(*) from public.notification_logs where user_id in (test.uid('budi'),test.uid('sari'),test.uid('andi'))) > 0, true, 'D20 guru melihat riwayat pengiriman kelasnya');
  perform test.reset();
  perform test.as_user(test.uid('bunita'));
  perform test.eq((select count(*) from public.notification_logs), 0::bigint, 'D21 guru lain tak melihat riwayat kelas ini');
  perform test.reset();
end $$;

-- ====================================================================
-- E. PENGINGAT OTOMATIS H-3 / H-1 / H-0 / OVERDUE (waktu disimulasikan)
-- ====================================================================
do $$
declare k uuid; tid uuid; declare_code text; g uuid := test.uid('bunita'); s1 uuid := test.uid('dina'); s2 uuid; r jsonb;
begin
  s2 := test.signup('ekoprast', 'Eko Prasetyo');
  select id into k from public.classes where name = 'XII-C';
  declare_code := (select join_code from public.classes where id = k);
  perform test.as_user(s2); perform public.join_class(declare_code); perform test.reset();
  -- tugas: deadline 10 Nov 2026 20:00 WIB, dibuat jauh sebelumnya
  perform test.as_user(g);
  insert into public.tasks (class_id, title, subject, deadline, created_by)
  values (k, 'Laporan IPA', 'IPA', '2026-11-10 20:00+07', g) returning id into tid;
  perform test.reset();
  update public.tasks set created_at = '2026-11-01 08:00+07' where id = tid;
  delete from public.notifications where ref_id = tid;   -- abaikan notif "tugas baru" agar hitungan bersih

  r := public.run_task_reminders('2026-11-07 06:00+07');
  perform test.eq((r->>'student_notifications')::int, 0, 'E1 H-3 sebelum jam 07:00 WIB belum dikirim');
  r := public.run_task_reminders('2026-11-07 08:00+07');
  perform test.eq((r->>'student_notifications')::int, 2, 'E2 H-3 dikirim ke 2 siswa yang belum selesai');
  perform test.eq((select title from public.notifications where type='reminder_h3' and user_id=s1), '⚠️ Waktunya Mulai Bergerak!', 'E3 judul H-3 = template resmi #2');
  perform test.eq((select body from public.notifications where type='reminder_h3' and user_id=s1),
                  'Tugas IPA akan berakhir dalam 3 hari lagi. Jangan tunggu sampai deadline mendekat. Sedikit demi sedikit, yang penting selesai!', 'E4 isi H-3 = template resmi #2');
  r := public.run_task_reminders('2026-11-07 08:10+07');
  perform test.eq((r->>'student_notifications')::int, 0, 'E5 tidak ada notifikasi ganda untuk H-3');
  r := public.run_task_reminders('2026-11-07 23:50+07');
  perform test.eq((r->>'student_notifications')::int, 0, 'E6 tetap tidak ganda sepanjang hari');
  r := public.run_task_reminders('2026-11-08 08:00+07');
  perform test.eq((r->>'student_notifications')::int, 0, 'E7 H-2 tidak ada pengingat');

  -- s1 menyelesaikan -> reminder berikutnya berhenti untuknya
  perform test.as_user(s1);
  insert into public.task_status (task_id, student_id, is_done) values (tid, s1, true);
  perform test.reset();
  r := public.run_task_reminders('2026-11-09 08:00+07');
  perform test.eq((r->>'student_notifications')::int, 1, 'E8 H-1 hanya ke siswa yang belum selesai');
  perform test.eq((select count(*) from public.notifications where type='reminder_h1' and user_id=s1), 0::bigint, 'E9 siswa yang sudah selesai tidak diingatkan');
  perform test.eq((select title from public.notifications where type='reminder_h1' and user_id=s2), '🚨 BESOK DEADLINE!', 'E10 judul H-1 = template resmi #3');
  perform test.eq((select body from public.notifications where type='reminder_h1' and user_id=s2),
                  'Tugas IPA masih menunggumu! Waktu tersisa hanya 24 jam. Pastikan tugasmu selesai sebelum batas waktu berakhir.', 'E10b isi H-1 = template resmi #3');

  -- s1 membatalkan -> reminder yang masih relevan aktif lagi
  perform test.as_user(s1);
  update public.task_status set is_done = false where task_id = tid and student_id = s1;
  perform test.reset();
  r := public.run_task_reminders('2026-11-10 08:00+07');
  perform test.eq((r->>'student_notifications')::int, 2, 'E11 H-0: s1 (dibatalkan) & s2 mendapat pengingat');
  perform test.eq((select title from public.notifications where type='reminder_h0' and user_id=s1), '🔥 LAST CALL — DEADLINE HARI INI!', 'E12 judul H-0 = template resmi #4');
  perform test.eq((select body from public.notifications where type='reminder_h0' and user_id=s1),
                  'Ini kesempatan terakhirmu untuk menyelesaikan tugas IPA. Jangan sampai melewati batas waktu!', 'E12b isi H-0 = template resmi #4');
  r := public.run_task_reminders('2026-11-10 08:05+07');
  perform test.eq((r->>'student_notifications')::int, 0, 'E13 H-0 tidak ganda');

  -- s2 selesai sebelum deadline; deadline lewat
  perform test.as_user(s2);
  insert into public.task_status (task_id, student_id, is_done) values (tid, s2, true);
  perform test.reset();
  r := public.run_task_reminders('2026-11-10 19:59+07');
  perform test.eq((r->>'student_notifications')::int + (r->>'exam_notifications')::int, 0, 'E14 belum ada overdue sebelum deadline');
  r := public.run_task_reminders('2026-11-10 20:01+07');
  perform test.eq((r->>'student_notifications')::int, 1, 'E15 overdue hanya untuk yang belum selesai');
  perform test.eq((select count(*) from public.notifications where type='overdue' and user_id=s2), 0::bigint, 'E16 status Sudah Selesai tidak terganggu / tidak ditagih');
  perform test.eq((select is_done from public.task_status where task_id=tid and student_id=s2), true, 'E17 overdue tidak mengubah status selesai milik siswa');
  perform test.eq((select title from public.notifications where type='overdue' and user_id=s1), '⛔ WAKTU TELAH HABIS!', 'E18 judul overdue = template resmi #5');
  perform test.eq((select body from public.notifications where type='overdue' and user_id=s1),
                  'Tugas IPA sudah melewati deadline, tetapi statusmu masih belum selesai. Segera periksa tugas tersebut di TugasKu.', 'E18b isi overdue = template resmi #5');
  perform test.eq((select count(*) from public.notifications where user_id = g), 0::bigint, 'E19 guru tidak menerima notifikasi (hanya siswa yang relevan)');
  r := public.run_task_reminders('2026-11-10 21:00+07');
  perform test.eq((r->>'student_notifications')::int + (r->>'exam_notifications')::int, 0, 'E21 overdue tidak ganda');
  perform test.eq((select count(*) from public.notifications where user_id = s2 and type like 'reminder%'), 3::bigint, 'E22 s2 menerima H-3, H-1, H-0 (saat belum selesai) dan tidak ada setelah selesai');

  -- deadline digeser -> pengingat dievaluasi ulang untuk deadline baru
  perform test.as_user(g);
  update public.tasks set deadline = '2026-11-20 20:00+07' where id = tid;
  perform test.reset();
  r := public.run_task_reminders('2026-11-17 08:00+07');
  perform test.eq((r->>'student_notifications')::int, 1, 'E23 deadline diubah: H-3 baru dikirim untuk siswa yang belum selesai');

  -- tugas yang baru dibuat (<2 jam) tidak langsung diingatkan
  perform test.as_user(g);
  insert into public.tasks (class_id, title, subject, deadline, created_by) values (k, 'Baru Saja', 'IPA', now() + interval '1 hour', g) returning id into tid;
  perform test.reset();
  r := public.run_task_reminders(now() + interval '30 minutes');
  perform test.eq(coalesce((select count(*) from public.notifications where ref_id = tid and type like 'reminder%'),0), 0::bigint, 'E24 tugas baru dibuat tidak langsung ditimpa pengingat');
  perform test.eq((select count(*) from public.notification_logs where kind = 'overdue' and superseded_at is not null), 1::bigint, 'E25 riwayat overdue lama TETAP tersimpan (ditandai superseded, tidak dihapus)');
  perform test.eq((select count(*) from public.notification_logs where kind = 'reminder_h3' and ref_id = (select id from public.tasks where title='Laporan IPA')), 3::bigint, 'E26 riwayat H-3 lama (2) + H-3 deadline baru (1) = 3 baris');
end $$;

-- ====================================================================
-- F. WEB PUSH HOOK (pg_net) hanya aktif bila dikonfigurasi
-- ====================================================================
do $$ declare k uuid := (select id from public.classes where name='XII-C'); g uuid := test.uid('bunita'); n0 bigint; begin
  perform test.eq((select count(*) from net.calls), 0::bigint, 'F1 tanpa konfigurasi tidak memanggil Edge Function');
  insert into public.app_config values ('push_function_url', 'https://x.supabase.co/functions/v1/send-push'), ('push_webhook_secret', 'rahasia');
  perform test.as_user(g);
  insert into public.announcements (class_id, title, body, created_by) values (k, 'Tes Push', 'isi', g);
  perform test.reset();
  perform test.eq((select count(*) from net.calls), 2::bigint, 'F2 tiap notifikasi baru memicu 1 panggilan push (2 siswa)');
  perform test.eq((select headers->>'x-webhook-secret' from net.calls limit 1), 'rahasia', 'F3 panggilan membawa secret webhook');
  perform test.eq((select count(*) from net.calls c join public.notifications n on n.id = (c.body->>'notification_id')::uuid), 2::bigint, 'F4 body memuat notification_id yang valid');
  delete from public.app_config where key like 'push_%';
end $$;

-- ====================================================================
-- G. Hak akses fungsi internal
-- ====================================================================
do $$ begin
  perform test.as_user(test.uid('budi'));
  perform test.fails($q$ select public.run_task_reminders() $q$, 'G1 klien tak bisa menjalankan scheduler');
  perform test.fails($q$ select public.push_notification(auth.uid(),'new_task','t','b',null,gen_random_uuid(),null) $q$, 'G2 klien tak bisa memanggil push_notification');
  perform test.reset();
  perform test.as_anon();
  perform test.fails($q$ select public.join_class('ABC') $q$, 'G3 anon tak bisa join_class');
end $$;

-- ====================================================================
-- H. TEMPLATE RESMI #1–#10: teks persis, variabel dari database, pemicu & penerima
-- ====================================================================
do $$ declare bad text; v jsonb; begin
  -- H1: seluruh teks identik dengan spesifikasi (judul + isi, per kolom)
  select string_agg(e.kind, ',') into bad from (values
    ('new_task',         '📚 Misi Baru Telah Tiba!',           'Guru baru saja memberikan tugas {mapel}. Jangan sampai tertinggal! Buka TugasKu dan cek detail tugasmu.'),
    ('reminder_h3',      '⚠️ Waktunya Mulai Bergerak!',        'Tugas {mapel} akan berakhir dalam 3 hari lagi. Jangan tunggu sampai deadline mendekat. Sedikit demi sedikit, yang penting selesai!'),
    ('reminder_h1',      '🚨 BESOK DEADLINE!',                 'Tugas {mapel} masih menunggumu! Waktu tersisa hanya 24 jam. Pastikan tugasmu selesai sebelum batas waktu berakhir.'),
    ('reminder_h0',      '🔥 LAST CALL — DEADLINE HARI INI!',  'Ini kesempatan terakhirmu untuk menyelesaikan tugas {mapel}. Jangan sampai melewati batas waktu!'),
    ('overdue',          '⛔ WAKTU TELAH HABIS!',              'Tugas {mapel} sudah melewati deadline, tetapi statusmu masih belum selesai. Segera periksa tugas tersebut di TugasKu.'),
    ('new_task_alert',   '🔔 NEW TASK ALERT!',                 'Ada tugas baru yang perlu kamu perhatikan.'),
    ('announcement',     '📢 PENGUMUMAN PENTING!',             'Guru baru saja membagikan informasi untuk kelasmu.'),
    ('exam_alert',       '📝 EXAM ALERT!',                     'Ujian {mapel} akan dilaksanakan besok.'),
    ('deadline_changed', '🔄 DEADLINE UPDATED!',               'Batas waktu tugas {mapel} telah diperbarui.'),
    ('status_updated',   '✅ PROGRESS UPDATED!',               'Status tugasmu berhasil diperbarui menjadi Sudah Selesai.')
  ) as e(kind, title, body)
  left join public.notification_templates t on t.kind = e.kind
  where t.kind is null or t.title is distinct from e.title or t.body is distinct from e.body;
  perform test.eq(coalesce(bad, ''), '', 'H1 10 template resmi persis sesuai spesifikasi (judul & isi)');
  perform test.eq((select count(*) from public.notification_templates), 10::bigint, 'H1b tepat 10 template');

  -- H2: semua variabel ({mapel}, {nama_tugas}, {deadline}, {jam_deadline}) terisi dari database
  insert into public.notification_templates (kind, title, body) values ('_uji', '{nama_tugas}', '{mapel}|{deadline}|{jam_deadline}');
  v := public.render_notification('_uji', public.task_template_vars('IPA', 'Laporan Bab 2', '2026-11-20 20:00+07'));
  perform test.eq(v ->> 'title', 'Laporan Bab 2', 'H2 {nama_tugas} terisi');
  perform test.eq(v ->> 'body', 'IPA|20 Nov 2026|20:00 WIB', 'H2b {mapel} {deadline} {jam_deadline} terisi (WIB)');
  delete from public.notification_templates where kind = '_uji';
  perform test.fails($q$ select public.render_notification('tidak_ada', '{}') $q$, 'H2c template tak dikenal ditolak');
end $$;

do $$
declare k uuid := (select id from public.classes where name = 'XII-C'); g uuid := test.uid('bunita');
        s1 uuid := test.uid('dina'); s2 uuid := test.uid('ekoprast'); tid uuid; sid uuid; r jsonb;
begin
  perform test.as_user(g);
  insert into public.tasks (class_id, title, subject, deadline, created_by)
  values (k, 'Proyek Seni', 'Seni Budaya', '2027-06-01 20:00+07', g) returning id into tid;
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'new_task'), 2::bigint, 'H3 tugas baru: 2 siswa kelas, bukan guru');

  -- #10 status berubah -> hanya siswa yang bersangkutan
  perform test.as_user(s1);
  insert into public.task_status (task_id, student_id, is_done) values (tid, s1, true);
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'status_updated' and user_id = s1), 1::bigint, 'H4 status Sudah Selesai -> 1 notifikasi untuk siswa itu');
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'status_updated' and user_id <> s1), 0::bigint, 'H4b siswa lain & guru tidak menerima');
  perform test.eq((select title from public.notifications where ref_id = tid and type = 'status_updated'), '✅ PROGRESS UPDATED!', 'H4c judul = template resmi #10');
  perform test.eq((select body from public.notifications where ref_id = tid and type = 'status_updated'), 'Status tugasmu berhasil diperbarui menjadi Sudah Selesai.', 'H4d isi = template resmi #10');
  perform test.as_user(s1);
  update public.task_status set is_done = true where task_id = tid and student_id = s1;      -- tidak ada perubahan
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'status_updated'), 1::bigint, 'H5 tanpa perubahan status -> tidak ada notifikasi ganda');
  perform test.as_user(s1);
  update public.task_status set is_done = false where task_id = tid and student_id = s1;     -- kembali Belum Selesai: tidak diberitahu
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'status_updated'), 1::bigint, 'H5b kembali ke Belum Selesai tidak mengirim notifikasi');
  perform test.as_user(s1);
  update public.task_status set is_done = true where task_id = tid and student_id = s1;      -- selesai lagi = perubahan baru
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'status_updated'), 2::bigint, 'H5c Sudah Selesai lagi = perubahan baru, diberitahu');
  perform test.eq((select count(*) from public.notification_logs where ref_id = tid and kind = 'status_updated' and channel = 'in_app' and superseded_at is null), 1::bigint, 'H5d riwayat: 1 aktif, yang lama superseded (tidak dihapus)');

  -- #9 perubahan deadline -> hanya siswa yang belum selesai (s1 sudah selesai, s2 belum)
  perform test.as_user(g);
  update public.tasks set deadline = '2027-06-05 20:00+07' where id = tid;
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'deadline_changed'), 1::bigint, 'H6 deadline diubah -> hanya 1 siswa belum selesai diberi tahu');
  perform test.eq((select user_id from public.notifications where ref_id = tid and type = 'deadline_changed'), s2, 'H6b penerima = siswa yang belum selesai');
  perform test.eq((select title from public.notifications where ref_id = tid and type = 'deadline_changed'), '🔄 DEADLINE UPDATED!', 'H6c judul = template resmi #9');
  perform test.eq((select body from public.notifications where ref_id = tid and type = 'deadline_changed'), 'Batas waktu tugas Seni Budaya telah diperbarui.', 'H6d isi = template resmi #9 ({mapel} dari database)');
  perform test.as_user(g);
  update public.tasks set title = 'Proyek Seni Rupa' where id = tid;                         -- deadline tetap
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'deadline_changed'), 1::bigint, 'H6e ubah judul saja tidak memicu notifikasi deadline');
  perform test.as_user(g);
  update public.tasks set deadline = '2027-06-08 20:00+07' where id = tid;                   -- perubahan kedua yang sah
  perform test.reset();
  perform test.eq((select count(*) from public.notifications where ref_id = tid and type = 'deadline_changed'), 2::bigint, 'H6f perubahan deadline kedua diberitahu lagi');
  perform test.eq((select count(*) from public.notification_logs where ref_id = tid and kind = 'deadline_changed' and superseded_at is null), 1::bigint, 'H6g riwayat deadline lama tersimpan (superseded), 1 aktif');

  -- #8 exam alert: sehari sebelum ujian, pukul 07:00 WIB, hanya siswa kelas itu
  perform test.as_user(g);
  insert into public.schedules (class_id, title, kind, subject, event_date, start_time, created_by)
  values (k, 'UAS IPA', 'ujian', 'IPA', '2026-12-15', '08:00', g) returning id into sid;
  insert into public.schedules (class_id, title, kind, subject, event_date, start_time, created_by)
  values (k, 'Kuis Seni', 'kuis', 'Seni Budaya', '2026-12-15', '10:00', g);
  perform test.reset();
  r := public.run_task_reminders('2026-12-14 06:30+07');
  perform test.eq((r ->> 'exam_notifications')::int, 0, 'H7 exam alert sebelum 07:00 WIB belum dikirim');
  r := public.run_task_reminders('2026-12-13 08:00+07');
  perform test.eq((r ->> 'exam_notifications')::int, 0, 'H7b dua hari sebelum ujian: belum');
  r := public.run_task_reminders('2026-12-14 07:00+07');
  perform test.eq((r ->> 'exam_notifications')::int, 2, 'H7c H-1 pukul 07:00 WIB -> 2 siswa kelas itu (kuis tidak ikut)');
  perform test.eq((select title from public.notifications where ref_id = sid and user_id = s1), '📝 EXAM ALERT!', 'H7d judul = template resmi #8');
  perform test.eq((select body from public.notifications where ref_id = sid and user_id = s1), 'Ujian IPA akan dilaksanakan besok.', 'H7e isi = template resmi #8');
  perform test.eq((select data ->> 'url' from public.notifications where ref_id = sid and user_id = s1), '#/jadwal', 'H7f deep link ke jadwal');
  r := public.run_task_reminders('2026-12-14 07:05+07');
  perform test.eq((r ->> 'exam_notifications')::int, 0, 'H7g tidak ada exam alert ganda');
  perform test.eq((select count(*) from public.notifications where ref_id = sid and user_id not in (s1, s2)), 0::bigint, 'H7h siswa kelas lain tidak menerima');
  perform test.as_user(g);
  update public.schedules set event_date = '2026-12-16' where id = sid;                     -- ujian digeser
  perform test.reset();
  r := public.run_task_reminders('2026-12-15 08:00+07');
  perform test.eq((r ->> 'exam_notifications')::int, 2, 'H7i tanggal ujian diubah -> peringatan H-1 untuk tanggal baru');

  -- #6 new task alert: siswa baru bergabung ke kelas yang punya tugas aktif
  declare s3 uuid := test.signup('siswabaru', 'Siswa Baru'); begin
    perform test.as_user(s3); perform public.join_class((select join_code from public.classes where id = k)); perform test.reset();
    perform test.eq((select count(*) from public.notifications where user_id = s3 and type = 'new_task_alert'), 1::bigint, 'H8 siswa baru di kelas dengan tugas aktif -> 1 NEW TASK ALERT');
    perform test.eq((select title from public.notifications where user_id = s3 and type = 'new_task_alert'), '🔔 NEW TASK ALERT!', 'H8b judul = template resmi #6');
    perform test.eq((select body from public.notifications where user_id = s3 and type = 'new_task_alert'), 'Ada tugas baru yang perlu kamu perhatikan.', 'H8c isi = template resmi #6');
    perform test.as_user(s3); perform public.join_class((select join_code from public.classes where id = k)); perform test.reset();
    perform test.eq((select count(*) from public.notifications where user_id = s3 and type = 'new_task_alert'), 1::bigint, 'H8d join ulang tidak menggandakan');
  end;

  -- aturan: guru tidak menerima notifikasi apa pun dari sistem
  perform test.eq((select count(*) from public.notifications where user_id = g), 0::bigint, 'H9 guru tidak menerima notifikasi sistem (hanya siswa yang relevan)');
  perform test.eq((select count(*) from public.notifications where type in ('teacher_overdue', 'schedule')), 0::bigint, 'H9b jenis notifikasi non-resmi tidak dikirim lagi');
  -- semua notifikasi punya deep link
  perform test.eq((select count(*) from public.notifications where coalesce(data ->> 'url', '') not like '#/%'), 0::bigint, 'H10 semua notifikasi memiliki deep link');
end $$;

\echo
\echo '>>> SEMUA ASERSI DATABASE LULUS'
