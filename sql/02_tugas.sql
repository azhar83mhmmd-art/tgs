-- =====================================================================
-- TugasKu v3 — 02_tugas.sql
-- Fitur TUGAS: tasks + task_status (status Sudah/Belum Selesai per siswa), RLS-nya.
-- Prasyarat: 01
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  title         text not null check (char_length(trim(title)) > 0),
  subject       text not null check (char_length(trim(subject)) > 0),
  description   text not null default '',
  assigned_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  deadline      timestamptz not null,
  created_by    uuid references public.profiles(id) on delete set null,
  legacy_id     text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tasks_class_deadline_idx on public.tasks (class_id, deadline);

-- Baris hanya ada jika siswa pernah mengubah status. Tidak ada baris = Belum Selesai.
create table if not exists public.task_status (
  task_id     uuid not null references public.tasks(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  is_done     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (task_id, student_id)
);
create index if not exists task_status_student_idx on public.task_status (student_id);

-- updated_at otomatis
drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

create or replace function public.task_class(p_task uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select class_id from public.tasks where id = p_task
$$;

-- Profil yang boleh dilihat: diri sendiri; siswa di kelas yang saya ajar; guru di kelas saya.
-- Siswa TIDAK bisa melihat profil siswa lain.

create or replace function public.task_status_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.task_id    := old.task_id;                 -- kunci identitas baris
    new.student_id := old.student_id;
    new.updated_at := case when new.is_done is distinct from old.is_done
                           then now() else old.updated_at end;
  elsif current_user in ('authenticated', 'anon') then
    new.updated_at := now();                       -- klien tidak boleh memalsukan waktu
  end if;
  return new;
end $$;
drop trigger if exists trg_task_status_before on public.task_status;
create trigger trg_task_status_before before insert or update on public.task_status
  for each row execute function public.task_status_before();

-- ---------------------------------------------------------------------
-- RLS & hak akses
-- ---------------------------------------------------------------------
alter table public.tasks       enable row level security;
alter table public.task_status enable row level security;

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_class_member(class_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_class_teacher(class_id) and created_by = auth.uid());
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_class_teacher(class_id));

-- task_status: siswa hanya miliknya; guru melihat kelasnya (tidak bisa mengubah)
drop policy if exists task_status_select on public.task_status;
create policy task_status_select on public.task_status for select to authenticated
  using (student_id = auth.uid() or public.is_class_teacher(public.task_class(task_id)));
drop policy if exists task_status_insert on public.task_status;
create policy task_status_insert on public.task_status for insert to authenticated
  with check (student_id = auth.uid() and public.is_class_student(public.task_class(task_id)));
drop policy if exists task_status_update on public.task_status;
create policy task_status_update on public.task_status for update to authenticated
  using (student_id = auth.uid() and public.is_class_student(public.task_class(task_id)))
  with check (student_id = auth.uid() and public.is_class_student(public.task_class(task_id)));

revoke all on public.tasks, public.task_status from anon, authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
-- upsert PostgREST menyetel semua kolom payload, jadi kolom kunci perlu hak UPDATE;
-- trigger task_status_before() mengunci task_id/student_id agar tidak bisa diubah.
grant select, insert, update (task_id, student_id, is_done) on public.task_status to authenticated;
grant all on public.tasks, public.task_status to service_role;
revoke all on function public.task_status_before() from public, anon, authenticated;
revoke all on function public.task_class(uuid) from public, anon;
grant execute on function public.task_class(uuid) to authenticated;
