-- =====================================================================
-- TugasKu v3 — 07_pengingat.sql
-- Fitur PENGINGAT OTOMATIS: run_task_reminders() (H-3/H-1/H-0/overdue + exam alert H-1) dan jadwal pg_cron tiap 5 menit.
-- Prasyarat: 01, 02, 06
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

-- Pengingat otomatis (server-side, zona Asia/Jakarta). Dipanggil pg_cron tiap 5 menit.
--   #2 H-3, #3 H-1, #4 hari-H : mulai pukul 07:00 WIB, hanya siswa yang BELUM selesai
--   #5 Overdue                : setelah deadline lewat, hanya siswa yang BELUM selesai
--   #8 Exam alert             : sehari sebelum jadwal ujian (07:00 WIB), untuk siswa kelas tersebut
-- Teks diambil dari notification_templates (template resmi, lihat 06). Duplikat dicegah indeks unik notification_logs.
-- p_now hanya untuk pengujian (simulasi waktu).
create or replace function public.run_task_reminders(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_hour_cfg int := coalesce((select value::int from public.app_config where key = 'reminder_hour'), 7);
  v_local_hour int := extract(hour from p_now at time zone 'Asia/Jakarta')::int;
  v_today date := (p_now at time zone 'Asia/Jakarta')::date;
  v_kind text; v_days int; v_notif uuid;
  c_student int := 0; c_exam int := 0;
begin
  -- siswa yang belum selesai
  for r in
    select t.id as task_id, t.title, t.subject, t.deadline, t.class_id, cm.user_id as student_id
      from public.tasks t
      join public.class_members cm on cm.class_id = t.class_id and cm.member_role = 'siswa'
      left join public.task_status ts on ts.task_id = t.id and ts.student_id = cm.user_id
     where coalesce(ts.is_done, false) = false                       -- hanya yang belum selesai
       and t.created_at <= p_now - interval '2 hours'                -- tidak menumpuk dgn notif "tugas baru"
       and t.deadline > p_now - interval '2 days'                    -- jangan spam tugas lama
  loop
    v_days := (r.deadline at time zone 'Asia/Jakarta')::date - v_today;
    v_kind := null;

    if p_now > r.deadline then
      v_kind := 'overdue';
    elsif v_local_hour >= v_hour_cfg then
      v_kind := case v_days when 3 then 'reminder_h3' when 1 then 'reminder_h1'
                            when 0 then 'reminder_h0' else null end;
    end if;
    continue when v_kind is null;

    v_notif := public.push_template(
      r.student_id, v_kind, public.task_template_vars(r.subject, r.title, r.deadline),
      r.class_id, r.task_id, 'reminder',
      jsonb_build_object('task_id', r.task_id, 'url', '#/tugas?task=' || r.task_id::text));
    if v_notif is not null then c_student := c_student + 1; end if;
  end loop;

  -- ujian besok
  if v_local_hour >= v_hour_cfg then
    for r in
      select s.id as sched_id, s.class_id, s.title, s.subject, cm.user_id as student_id
        from public.schedules s
        join public.class_members cm on cm.class_id = s.class_id and cm.member_role = 'siswa'
       where s.kind = 'ujian' and s.event_date = v_today + 1
    loop
      v_notif := public.push_template(
        r.student_id, 'exam_alert',
        jsonb_build_object('mapel', coalesce(nullif(trim(r.subject), ''), r.title)),
        r.class_id, r.sched_id, 'schedule',
        jsonb_build_object('schedule_id', r.sched_id, 'url', '#/jadwal'));
      if v_notif is not null then c_exam := c_exam + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('student_notifications', c_student, 'exam_notifications', c_exam, 'ran_at', p_now);
end $$;

revoke all on function public.run_task_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.run_task_reminders(timestamptz) to service_role;

-- 13. Penjadwal otomatis (pg_cron) — berjalan di server, website boleh ditutup
-- ---------------------------------------------------------------------
do $cron$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron tidak bisa diaktifkan otomatis (%). Aktifkan di Dashboard → Database → Extensions → pg_cron, lalu jalankan ulang file ini.', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    -- nama job sama = jadwal diperbarui, bukan digandakan
    perform cron.schedule('tugasku-reminders', '*/5 * * * *', 'select public.run_task_reminders()');
    raise notice 'Pengingat otomatis dijadwalkan tiap 5 menit (tugasku-reminders).';
  end if;
end $cron$;

-- Opsional: pg_net dipakai untuk memanggil Edge Function Web Push (lihat PANDUAN_SETUP.md)
do $net$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net tidak aktif: Web Push (saat website tertutup) belum tersedia. Notifikasi dalam aplikasi tetap berjalan.';
  end;
end $net$;
