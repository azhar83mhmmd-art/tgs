\set ON_ERROR_STOP on
set client_min_messages = notice;
-- Uji sql/12_status_riwayat.sql. Dijalankan dalam transaksi lalu di-ROLLBACK agar tidak mengubah data uji lain.
begin;
do $$
declare t1 uuid := (select id from public.tasks where legacy_id='33333333-3333-3333-3333-333333333331');
        t2 uuid := (select id from public.tasks where legacy_id='id_task_legacy_2');
        b uuid := test.uid('budi'); s uuid := test.uid('sari'); g uuid := test.uid('burina'); g2 uuid := test.uid('bunita');
begin
  perform test.eq((select count(*) from public.task_status where is_done and status <> 'selesai'), 0::bigint, 'R1 data lama: is_done=true -> status selesai');
  perform test.eq((select count(*) from public.task_status_history), 0::bigint, 'R2 migrasi tidak membuat riwayat palsu');

  perform test.as_user(b);
  -- belum -> proses (klien baru kirim status + is_done)
  insert into public.task_status (task_id, student_id, status, is_done) values (t2, b, 'proses', false)
    on conflict (task_id, student_id) do update set status = excluded.status, is_done = excluded.is_done;
  perform test.eq((select status from public.task_status where task_id=t2 and student_id=b), 'proses', 'R3 siswa menyimpan Sedang Dikerjakan');
  perform test.eq((select is_done from public.task_status where task_id=t2 and student_id=b), false, 'R4 proses -> is_done false');
  perform test.eq((select count(*) from public.activity_logs where task_id=t2 and user_id=b and action in ('mark_done','mark_undone')), 0::bigint, 'R5 insert proses tidak dicatat sebagai mark_undone');
  -- proses -> selesai
  update public.task_status set status='selesai', is_done=true where task_id=t2 and student_id=b;
  perform test.eq((select is_done from public.task_status where task_id=t2 and student_id=b), true, 'R6 selesai -> is_done true');
  -- klien lama: hanya is_done=false
  update public.task_status set is_done=false where task_id=t2 and student_id=b;
  perform test.eq((select status from public.task_status where task_id=t2 and student_id=b), 'belum', 'R7 klien lama is_done=false -> status belum');
  -- status ngawur ditolak
  perform test.fails(format($q$ update public.task_status set status='lulus' where task_id=%L and student_id=%L $q$, t2, b), 'R8 status tidak valid ditolak');
  -- riwayat siswa sendiri
  perform test.eq((select count(*) from public.task_status_history where task_id=t2), 3::bigint, 'R9 3 perubahan tercatat (belum>proses, proses>selesai, selesai>belum)');
  perform test.eq((select count(*) from public.task_status_history where task_id=t2 and changed_by=b), 3::bigint, 'R10 identitas pengubah = siswa itu');
  perform test.eq((select old_status||'>'||new_status from public.task_status_history where task_id=t2 order by changed_at, new_status limit 1) is not null, true, 'R11 status lama & baru terisi');
  -- tidak bisa menulis/mengubah riwayat
  perform test.fails(format($q$ insert into public.task_status_history (task_id, student_id, old_status, new_status) values (%L, %L, 'belum', 'selesai') $q$, t2, b), 'R12 klien tak bisa menulis riwayat');
  perform test.fails($q$ update public.task_status_history set new_status = 'belum' $q$, 'R13 klien tak bisa mengubah riwayat');
  perform test.fails($q$ delete from public.task_status_history $q$, 'R14 klien tak bisa menghapus riwayat');
  perform test.reset();

  -- siswa lain tidak melihat riwayat budi
  perform test.as_user(s);
  perform test.eq((select count(*) from public.task_status_history), 0::bigint, 'R15 siswa lain tidak melihat riwayat budi');
  perform test.eq(test.affected(format($q$ update public.task_status set status='selesai' where student_id=%L $q$, b)), 0::bigint, 'R16 siswa lain tak bisa mengubah status budi');
  perform test.reset();

  -- guru kelas melihat riwayat kelasnya
  perform test.as_user(g);
  perform test.eq((select count(*) from public.task_status_history where student_id=b) >= 3, true, 'R17 guru kelas melihat riwayat siswanya');
  perform test.fails(format($q$ insert into public.task_status (task_id, student_id, status) values (%L, %L, 'proses') $q$, t1, s), 'R18 guru tak bisa memalsukan status siswa');
  perform test.reset();

  -- guru kelas lain terisolasi
  perform test.as_user(g2);
  perform test.eq((select count(*) from public.task_status_history), 0::bigint, 'R17b guru kelas lain tak melihat riwayat kelas ini');
  perform test.reset();

  -- anon tidak bisa
  perform test.as_anon();
  perform test.fails('select * from public.task_status_history', 'R19 anon tak bisa membaca riwayat');
  perform test.reset();
end $$;
rollback;
