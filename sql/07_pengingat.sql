-- =====================================================================
-- TugasKu v3 — 07_pengingat.sql
-- Fitur PENGINGAT OTOMATIS: run_task_reminders() (H-3/H-1/H-0/overdue + exam alert H-1) dan jadwal pg_cron tiap 5 menit.
-- Prasyarat: 01, 02, 06
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

-- Pengingat otomatis (server-side, zona Asia/Jakarta). Dipanggil pg_cron tiap 5 menit, dan oleh run_my_reminders()
-- (cadangan saat aplikasi dibuka, hanya untuk pengguna itu sendiri).
--   #2 H-3, #3 H-1, #4 hari-H : mulai pukul 07:00 WIB, hanya siswa yang BELUM selesai
--   #5 Overdue                : setelah deadline lewat, hanya siswa yang BELUM selesai
--   #8 Exam alert             : sehari sebelum jadwal ujian (07:00 WIB), untuk siswa kelas tersebut
-- Teks diambil dari notification_templates (template resmi, lihat 06). Duplikat dicegah indeks unik notification_logs.
-- Jam mulai pengingat tiap siswa = notification_settings.reminder_time (WIB); kosong = app_config.reminder_hour (bawaan 07:00).
-- p_now hanya untuk pengujian (simulasi waktu). p_user = batasi ke satu siswa (null = semua).
-- Satu baris yang gagal tidak lagi menggagalkan seluruh putaran (dicatat sebagai peringatan + hitungan "errors").
drop function if exists public.run_task_reminders(timestamptz);
create or replace function public.run_task_reminders(p_now timestamptz default now(), p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_hour_cfg int := coalesce((select case when trim(value) ~ '^[0-9]{1,2}$' then trim(value)::int end
                                from public.app_config where key = 'reminder_hour'), 7);
  v_local_time time := (p_now at time zone 'Asia/Jakarta')::time;
  v_today date := (p_now at time zone 'Asia/Jakarta')::date;
  v_kind text; v_days int; v_notif uuid;
  c_student int := 0; c_exam int := 0; c_err int := 0;
begin
  -- siswa yang belum selesai
  for r in
    select t.id as task_id, t.title, t.subject, t.deadline, t.class_id, cm.user_id as student_id,
           coalesce(ns.reminder_time, make_time(v_hour_cfg, 0, 0)) as remind_at
      from public.tasks t
      join public.class_members cm on cm.class_id = t.class_id and cm.member_role = 'siswa'
      left join public.task_status ts on ts.task_id = t.id and ts.student_id = cm.user_id
      left join public.notification_settings ns on ns.user_id = cm.user_id
     where coalesce(ts.is_done, false) = false                       -- hanya yang belum selesai
       and (p_user is null or cm.user_id = p_user)
       and t.created_at <= p_now - interval '2 hours'                -- tidak menumpuk dgn notif "tugas baru"
       and t.deadline > p_now - interval '2 days'                    -- jangan spam tugas lama
  loop
    begin
      v_days := (r.deadline at time zone 'Asia/Jakarta')::date - v_today;
      v_kind := null;

      if p_now > r.deadline then
        v_kind := 'overdue';
      elsif v_local_time >= r.remind_at then
        v_kind := case v_days when 3 then 'reminder_h3' when 1 then 'reminder_h1'
                              when 0 then 'reminder_h0' else null end;
      end if;

      if v_kind is not null then
        v_notif := public.push_template(
          r.student_id, v_kind, public.task_template_vars(r.subject, r.title, r.deadline),
          r.class_id, r.task_id, 'reminder',
          jsonb_build_object('task_id', r.task_id, 'url', '#/tugas?task=' || r.task_id::text));
        if v_notif is not null then c_student := c_student + 1; end if;
      end if;
    exception when others then
      c_err := c_err + 1;
      raise warning 'run_task_reminders: tugas % / siswa % gagal: %', r.task_id, r.student_id, sqlerrm;
    end;
  end loop;

  -- ujian besok (mulai pada jam pengingat masing-masing siswa)
  begin
    for r in
      select s.id as sched_id, s.class_id, s.title, s.subject, cm.user_id as student_id
        from public.schedules s
        join public.class_members cm on cm.class_id = s.class_id and cm.member_role = 'siswa'
        left join public.notification_settings ns on ns.user_id = cm.user_id
       where s.kind = 'ujian' and s.event_date = v_today + 1
         and (p_user is null or cm.user_id = p_user)
         and v_local_time >= coalesce(ns.reminder_time, make_time(v_hour_cfg, 0, 0))
    loop
      begin
        v_notif := public.push_template(
          r.student_id, 'exam_alert',
          jsonb_build_object('mapel', coalesce(nullif(trim(r.subject), ''), r.title)),
          r.class_id, r.sched_id, 'schedule',
          jsonb_build_object('schedule_id', r.sched_id, 'url', '#/jadwal'));
        if v_notif is not null then c_exam := c_exam + 1; end if;
      exception when others then
        c_err := c_err + 1;
        raise warning 'run_task_reminders: ujian % / siswa % gagal: %', r.sched_id, r.student_id, sqlerrm;
      end;
    end loop;
  end;

  -- detak jantung: kapan scheduler server terakhir benar-benar jalan (dibaca reminder_diagnostics)
  if p_user is null then
    insert into public.app_config (key, value) values ('reminder_last_run', now()::text)
    on conflict (key) do update set value = excluded.value;
  end if;

  return jsonb_build_object('student_notifications', c_student, 'exam_notifications', c_exam,
                            'errors', c_err, 'ran_at', p_now);
end $$;

revoke all on function public.run_task_reminders(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.run_task_reminders(timestamptz, uuid) to service_role;

-- Cadangan bila pg_cron belum aktif / terlambat: dipanggil aplikasi saat dibuka (dan berkala saat terbuka).
-- Hanya memproses PENGGUNA YANG LOGIN, memakai jam server (tidak bisa dimajukan klien), dan memakai
-- aturan + pencegah duplikat yang sama persis dengan scheduler. Push ke HP tetap lewat trigger -> Edge Function.
create or replace function public.run_my_reminders() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  return public.run_task_reminders(now(), auth.uid());
end $$;
revoke all on function public.run_my_reminders() from public, anon;
grant execute on function public.run_my_reminders() to authenticated;

-- Diagnosis pengingat (tombol "Diagnosis" di Pusat Notifikasi): status pg_cron, eksekusi terakhir, pengaturan pengguna.
create or replace function public.reminder_diagnostics() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cron boolean := to_regnamespace('cron') is not null;
  v_job jsonb := null; v_runs jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  if v_cron then
    begin
      execute $q$select to_jsonb(j) from (select jobname, schedule, active from cron.job where jobname = 'tugasku-reminders') j$q$ into v_job;
    exception when others then v_job := null; end;
    begin
      execute $q$select coalesce(jsonb_agg(r), '[]'::jsonb) from (
                   select status, left(coalesce(return_message, ''), 160) as detail, start_time
                     from cron.job_run_details
                    where jobid = (select jobid from cron.job where jobname = 'tugasku-reminders')
                    order by start_time desc limit 3) r$q$ into v_runs;
    exception when others then v_runs := '[]'::jsonb; end;
  end if;
  return jsonb_build_object(
    'cron_installed', v_cron,
    'job', v_job,
    'last_runs', v_runs,
    'last_run_at', (select value from public.app_config where key = 'reminder_last_run'),
    'reminder_enabled', coalesce((select s.reminder from public.notification_settings s where s.user_id = auth.uid()), true),
    'open_tasks', (select count(*) from public.tasks t
                     join public.class_members cm on cm.class_id = t.class_id and cm.user_id = auth.uid() and cm.member_role = 'siswa'
                     left join public.task_status ts on ts.task_id = t.id and ts.student_id = cm.user_id
                    where coalesce(ts.is_done, false) = false and t.deadline > now() - interval '2 days'),
    'my_reminders', (select count(*) from public.notifications
                      where user_id = auth.uid() and type in ('reminder_h3', 'reminder_h1', 'reminder_h0', 'overdue', 'deadline_changed')),
    'skipped_by_setting', (select count(*) from public.notification_logs
                            where user_id = auth.uid() and status = 'skipped' and superseded_at is null
                              and kind in ('reminder_h3', 'reminder_h1', 'reminder_h0', 'overdue', 'deadline_changed')));
end $$;
revoke all on function public.reminder_diagnostics() from public, anon;
grant execute on function public.reminder_diagnostics() to authenticated;

-- 13. Penjadwal otomatis (pg_cron) — berjalan di server, website boleh ditutup
do $cron$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise warning 'pg_cron TIDAK aktif (%). Aktifkan di Dashboard → Database → Extensions → pg_cron, lalu jalankan ulang file ini. Sementara itu pengingat tetap dibuat saat siswa membuka aplikasi.', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    -- nama job sama = jadwal diperbarui, bukan digandakan
    perform cron.schedule('tugasku-reminders', '*/5 * * * *', 'select public.run_task_reminders()');
    raise notice 'Pengingat otomatis dijadwalkan tiap 5 menit (tugasku-reminders).';
  end if;
exception when others then
  raise warning 'Gagal menjadwalkan pengingat: %', sqlerrm;
end $cron$;

-- Opsional: pg_net dipakai untuk memanggil Edge Function Web Push (lihat PANDUAN_SETUP.md)
do $net$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise warning 'pg_net tidak aktif: Web Push (saat website tertutup) belum tersedia. Notifikasi dalam aplikasi tetap berjalan.';
  end;
end $net$;
