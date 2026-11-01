-- =====================================================================
-- TugasKu v3 — 12_status_riwayat.sql
-- Redesign Modal Detail Tugas:
--   (a) status 3 tingkat per siswa: belum | proses | selesai  (kolom task_status.status)
--   (b) riwayat perubahan status (task_status_history), diisi OTOMATIS oleh trigger server
-- Kolom lama task_status.is_done TETAP ada dan selalu sinkron (is_done = status 'selesai'),
-- sehingga notifikasi, pengingat, Web Push, Task Monitor, dan klien lama tidak terpengaruh.
-- Prasyarat: 01, 02, 05, 06
-- Idempotent: aman dijalankan berulang kali. Jalankan setelah 00 → 11.
-- =====================================================================

-- 1. Kolom status ------------------------------------------------------
alter table public.task_status add column if not exists status text not null default 'belum';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'task_status_status_check') then
    alter table public.task_status
      add constraint task_status_status_check check (status in ('belum', 'proses', 'selesai'));
  end if;
end $$;

-- 2. Trigger BEFORE: sinkronisasi status <-> is_done + penguncian identitas/waktu ----
-- (menggantikan versi di 02; perilaku lama dipertahankan)
create or replace function public.task_status_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.task_id    := old.task_id;                 -- kunci identitas baris
    new.student_id := old.student_id;
    if new.status is distinct from old.status then
      new.is_done := (new.status = 'selesai');     -- status yang berubah menentukan is_done
    elsif new.is_done is distinct from old.is_done then
      new.status := case when new.is_done then 'selesai' else 'belum' end;   -- klien lama hanya mengirim is_done
    end if;
    new.updated_at := case when new.status is distinct from old.status
                             or new.is_done is distinct from old.is_done
                           then now() else old.updated_at end;
  else
    if new.status = 'belum' and new.is_done then
      new.status := 'selesai';                     -- klien lama: insert is_done = true
    else
      new.is_done := (new.status = 'selesai');
    end if;
    if current_user in ('authenticated', 'anon') then
      new.updated_at := now();                     -- klien tidak boleh memalsukan waktu
    end if;
  end if;
  return new;
end $$;

-- Data lama: status ikut is_done. Trigger pengguna dimatikan sementara agar waktu & log lama tidak berubah.
alter table public.task_status disable trigger user;
update public.task_status set status = 'selesai' where is_done and status <> 'selesai';
alter table public.task_status enable trigger user;

-- 3. Riwayat perubahan status ----------------------------------------
create table if not exists public.task_status_history (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  old_status  text not null check (old_status in ('belum', 'proses', 'selesai')),
  new_status  text not null check (new_status in ('belum', 'proses', 'selesai')),
  changed_by  uuid references public.profiles(id) on delete set null,   -- null = sistem
  changed_at  timestamptz not null default now()
);
create index if not exists task_status_history_student_idx on public.task_status_history (student_id, task_id, changed_at desc);
create index if not exists task_status_history_task_idx    on public.task_status_history (task_id, changed_at desc);

create or replace function public.task_status_history_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  v_old := case when tg_op = 'INSERT' then 'belum' else old.status end;
  if v_old is distinct from new.status then
    insert into public.task_status_history (task_id, student_id, old_status, new_status, changed_by)
    values (new.task_id, new.student_id, v_old, new.status, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_task_status_history on public.task_status;
create trigger trg_task_status_history after insert or update on public.task_status
  for each row execute function public.task_status_history_write();

-- 4. Log aktivitas: insert status "proses" bukan "mark_undone" ----------
-- (menggantikan versi di 05; perilaku lama dipertahankan)
create or replace function public.task_status_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_class uuid; v_title text;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  if (tg_op = 'INSERT' and (new.is_done or new.status = 'belum'))
     or (tg_op = 'UPDATE' and old.is_done is distinct from new.is_done) then
    select class_id, title into v_class, v_title from public.tasks where id = new.task_id;
    insert into public.activity_logs (class_id, user_id, task_id, task_title, action)
    values (v_class, new.student_id, new.task_id, v_title,
            case when new.is_done then 'mark_done' else 'mark_undone' end);
  end if;
  return new;
end $$;

-- 5. RLS & hak akses ---------------------------------------------------
alter table public.task_status_history enable row level security;
drop policy if exists task_status_history_select on public.task_status_history;
create policy task_status_history_select on public.task_status_history for select to authenticated
  using (student_id = auth.uid() or public.is_class_teacher(public.task_class(task_id)));
-- Tidak ada policy insert/update/delete: riwayat hanya ditulis trigger, tidak bisa dipalsukan klien.

revoke all on public.task_status_history from anon, authenticated;
grant select on public.task_status_history to authenticated;
grant all on public.task_status_history to service_role;
revoke all on function public.task_status_history_write() from public, anon, authenticated;
revoke all on function public.task_status_audit() from public, anon, authenticated;

-- upsert klien kini juga menyetel kolom status
grant select, insert, update (task_id, student_id, is_done, status) on public.task_status to authenticated;
