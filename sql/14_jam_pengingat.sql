-- =====================================================================
-- TugasKu v3 — 14_jam_pengingat.sql
-- FITUR: jam pengingat deadline bisa diatur sendiri oleh tiap siswa (mis. 07:00, 05:30), zona WIB.
-- Kolom notification_settings.reminder_time (null = bawaan app_config.reminder_hour, 07:00).
-- Berlaku untuk pengingat H-3, H-1, hari-H dan Exam Alert. Overdue tetap dikirim begitu deadline lewat.
-- Ketelitian mengikuti pg_cron (tiap 5 menit). Prasyarat: 06, 07 (disarankan 13). Idempotent.
-- =====================================================================

alter table public.notification_settings add column if not exists reminder_time time;

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

notify pgrst, 'reload schema';
