-- =====================================================================
-- TugasKu v3 — 15_penjelasan_pengingat.sql
-- Diagnosis: menjelaskan per tugas kenapa pengingat sudah / belum dikirim (tombol Diagnosis di Pusat Notifikasi).
-- Prasyarat: 02, 06, 07. Idempotent.
-- =====================================================================

-- Penjelasan per tugas: kenapa pengingat sudah / belum dibuat untuk akun yang login (bahan tombol Diagnosis).
create or replace function public.reminder_explain() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now   timestamptz := now();
  v_hour  int := coalesce((select case when trim(value) ~ '^[0-9]{1,2}$' then trim(value)::int end
                             from public.app_config where key = 'reminder_hour'), 7);
  v_at    time := coalesce((select s.reminder_time from public.notification_settings s where s.user_id = auth.uid()),
                           make_time(v_hour, 0, 0));
  v_today date := (v_now at time zone 'Asia/Jakarta')::date;
  v_rows  jsonb;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  select coalesce(jsonb_agg(x order by x.deadline), '[]'::jsonb) into v_rows from (
    select t.title, t.subject, t.deadline,
           ((t.deadline at time zone 'Asia/Jakarta')::date - v_today) as days_left,
           (t.created_at > v_now - interval '2 hours') as too_new,
           (select string_agg(l.kind || ' / ' || l.channel || ' / ' || l.status || coalesce(' (' || left(l.detail, 60) || ')', ''),
                              '; ' order by l.created_at)
              from public.notification_logs l
             where l.user_id = auth.uid() and l.ref_id = t.id and l.superseded_at is null
               and l.kind in ('reminder_h3', 'reminder_h1', 'reminder_h0', 'overdue')) as log
      from public.tasks t
      join public.class_members cm on cm.class_id = t.class_id and cm.user_id = auth.uid() and cm.member_role = 'siswa'
      left join public.task_status ts on ts.task_id = t.id and ts.student_id = cm.user_id
     where coalesce(ts.is_done, false) = false and t.deadline > v_now - interval '2 days'
     order by t.deadline limit 10) x;
  return jsonb_build_object('now_wib', to_char(v_now at time zone 'Asia/Jakarta', 'HH24:MI'),
                            'remind_at', to_char(v_at, 'HH24:MI'), 'tasks', v_rows);
end $$;
revoke all on function public.reminder_explain() from public, anon;
grant execute on function public.reminder_explain() to authenticated;

notify pgrst, 'reload schema';
