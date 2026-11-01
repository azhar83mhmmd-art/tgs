-- =====================================================================
-- TugasKu v3 — 05_aktivitas.sql
-- Fitur ACTIVITY MONITOR: activity_logs + pencatatan otomatis dari server (ubah status, buka detail tugas).
-- Prasyarat: 01, 02
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  task_title text,
  action     text not null check (action in ('view_task','mark_done','mark_undone')),
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_class_idx on public.activity_logs (class_id, created_at desc);
create index if not exists activity_logs_user_idx  on public.activity_logs (user_id, created_at desc);

create or replace function public.task_status_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_class uuid; v_title text;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' or old.is_done is distinct from new.is_done then
    select class_id, title into v_class, v_title from public.tasks where id = new.task_id;
    insert into public.activity_logs (class_id, user_id, task_id, task_title, action)
    values (v_class, new.student_id, new.task_id, v_title,
            case when new.is_done then 'mark_done' else 'mark_undone' end);
  end if;
  return new;
end $$;
drop trigger if exists trg_task_status_audit on public.task_status;
create trigger trg_task_status_audit after insert or update on public.task_status
  for each row execute function public.task_status_audit();

-- Catat siswa membuka detail tugas (maks. 1x per 30 menit per tugas)
create or replace function public.log_task_view(p_task uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_class uuid; v_title text;
begin
  select class_id, title into v_class, v_title from public.tasks where id = p_task;
  if v_class is null or not public.is_class_student(v_class) then return; end if;
  if exists (select 1 from public.activity_logs
             where user_id = auth.uid() and task_id = p_task and action = 'view_task'
               and created_at > now() - interval '30 minutes') then return; end if;
  insert into public.activity_logs (class_id, user_id, task_id, task_title, action)
  values (v_class, auth.uid(), p_task, v_title, 'view_task');
end $$;

alter table public.activity_logs enable row level security;

-- activity_logs: siswa hanya miliknya; guru untuk kelas yang diajar
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs for select to authenticated
  using (user_id = auth.uid() or public.is_class_teacher(class_id));

revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;
grant all on public.activity_logs to service_role;
revoke all on function public.task_status_audit() from public, anon, authenticated;
revoke all on function public.log_task_view(uuid) from public, anon;
grant execute on function public.log_task_view(uuid) to authenticated;
