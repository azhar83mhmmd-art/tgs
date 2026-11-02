-- =====================================================================
-- TugasKu v3 — 17_aksi_notifikasi.sql
-- AKSI CEPAT DI NOTIFIKASI HP: tombol "Tandai selesai" dan "Ingatkan 1 jam lagi" langsung di notifikasi push,
-- tanpa membuka aplikasi.
--   * notifications.action_token : token acak (tidak bisa ditebak) per notifikasi, ikut dikirim di push
--   * notification_action(token, aksi) : dipanggil Service Worker TANPA login; hanya bisa berbuat untuk
--     pemilik notifikasi itu, hanya untuk notifikasi tugas, dan kedaluwarsa 3 hari
--   * notification_snoozes + fire_due_snoozes : notifikasi diulang setelah 1 jam (dijalankan pg_cron / cadangan aplikasi)
-- Prasyarat: 02, 06, 07 (disarankan 12–15). Jalankan TERAKHIR (mengganti jadwal pg_cron & run_my_reminders).
-- Idempotent.
-- =====================================================================

alter table public.notifications add column if not exists action_token uuid not null default gen_random_uuid();
create unique index if not exists notifications_action_token_idx on public.notifications (action_token);

create table if not exists public.notification_snoozes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  due_at          timestamptz not null,
  fired_at        timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists notification_snoozes_due_idx on public.notification_snoozes (due_at) where fired_at is null;
alter table public.notification_snoozes enable row level security;     -- tanpa policy: hanya fungsi server
revoke all on public.notification_snoozes from anon, authenticated;
grant all on public.notification_snoozes to service_role;

create or replace function public.notification_action(p_token uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.notifications%rowtype; v_title text;
begin
  select * into n from public.notifications where action_token = p_token;
  if not found or n.created_at < now() - interval '3 days' then
    return jsonb_build_object('ok', false, 'error', 'kedaluwarsa');
  end if;
  if n.ref_id is null or n.type not in ('new_task', 'reminder_h3', 'reminder_h1', 'reminder_h0', 'overdue', 'deadline_changed') then
    return jsonb_build_object('ok', false, 'error', 'tidak didukung');
  end if;
  select title into v_title from public.tasks where id = n.ref_id;
  if v_title is null then return jsonb_build_object('ok', false, 'error', 'tugas tidak ditemukan'); end if;

  if p_action = 'done' then
    -- riwayat status mencatat pelakunya = pemilik notifikasi (bukan "Sistem")
    perform set_config('request.jwt.claim.sub', n.user_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', n.user_id)::text, true);
    insert into public.task_status (task_id, student_id, is_done, status)
    values (n.ref_id, n.user_id, true, 'selesai')
    on conflict (task_id, student_id) do update set status = 'selesai', is_done = true;
    update public.notifications set read_at = coalesce(read_at, now()) where id = n.id;
    return jsonb_build_object('ok', true, 'action', 'done', 'title', v_title);
  elsif p_action = 'snooze' then
    insert into public.notification_snoozes (user_id, notification_id, due_at)
    values (n.user_id, n.id, now() + interval '1 hour');
    update public.notifications set read_at = coalesce(read_at, now()) where id = n.id;
    return jsonb_build_object('ok', true, 'action', 'snooze', 'title', v_title);
  end if;
  return jsonb_build_object('ok', false, 'error', 'aksi tidak dikenal');
end $$;
revoke all on function public.notification_action(uuid, text) from public;
grant execute on function public.notification_action(uuid, text) to anon, authenticated;

-- Ulangi notifikasi yang ditunda bila jamnya tiba (dan tugas belum selesai / masih ada)
create or replace function public.fire_due_snoozes(p_now timestamptz default now(), p_user uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; c int := 0; v_skip boolean;
begin
  for r in
    select s.id as sid, n.id as nid, n.user_id, n.type, n.title, n.body, n.class_id, n.ref_id, n.data
      from public.notification_snoozes s
      join public.notifications n on n.id = s.notification_id
     where s.fired_at is null and s.due_at <= p_now and (p_user is null or s.user_id = p_user)
     order by s.due_at limit 200
  loop
    update public.notification_snoozes set fired_at = p_now where id = r.sid;
    v_skip := r.ref_id is null
              or not exists (select 1 from public.tasks t where t.id = r.ref_id)
              or exists (select 1 from public.task_status ts
                          where ts.task_id = r.ref_id and ts.student_id = r.user_id and ts.is_done);
    if not v_skip then
      insert into public.notifications (user_id, type, title, body, class_id, ref_id, data)
      values (r.user_id, r.type, 'Pengingat ulang · ' || r.title, r.body, r.class_id, r.ref_id,
              coalesce(r.data, '{}'::jsonb) || jsonb_build_object('snoozed_from', r.nid));
      c := c + 1;
    end if;
  end loop;
  return c;
end $$;
revoke all on function public.fire_due_snoozes(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.fire_due_snoozes(timestamptz, uuid) to service_role;

-- Cadangan aplikasi: ikut memproses notifikasi tertunda milik akun yang login
create or replace function public.run_my_reminders() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_snz int; v jsonb;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  v_snz := public.fire_due_snoozes(now(), auth.uid());
  v := public.run_task_reminders(now(), auth.uid());
  return v || jsonb_build_object('snoozed_notifications', v_snz);
end $$;
revoke all on function public.run_my_reminders() from public, anon;
grant execute on function public.run_my_reminders() to authenticated;

-- Jadwal pg_cron: pengingat + notifikasi tertunda, tiap 5 menit
do $cron$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('tugasku-reminders', '*/5 * * * *',
                          'select public.run_task_reminders(); select public.fire_due_snoozes();');
    raise notice 'Jadwal pengingat + notifikasi tertunda diperbarui (tiap 5 menit).';
  else
    raise warning 'pg_cron belum aktif: notifikasi "Ingatkan 1 jam lagi" baru diproses saat aplikasi dibuka.';
  end if;
exception when others then
  raise warning 'Gagal memperbarui jadwal pg_cron: %', sqlerrm;
end $cron$;

notify pgrst, 'reload schema';
