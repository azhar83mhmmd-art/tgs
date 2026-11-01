-- =====================================================================
-- TugasKu v3 — 04_jadwal.sql
-- Fitur JADWAL: tabel schedules (tugas/ujian/kuis/presentasi/kegiatan) + RLS. (Notifikasinya ada di 06.)
-- Prasyarat: 01
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  title       text not null check (char_length(trim(title)) > 0),
  description text,
  kind        text not null default 'kegiatan'
              check (kind in ('tugas','ujian','kuis','presentasi','kegiatan')),
  subject     text,
  event_date  date not null,
  start_time  time not null default '07:00',
  end_time    time,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);
create index if not exists schedules_class_date_idx on public.schedules (class_id, event_date);

-- updated_at otomatis
drop trigger if exists trg_schedules_updated on public.schedules;
create trigger trg_schedules_updated before update on public.schedules
  for each row execute function public.set_updated_at();

alter table public.schedules enable row level security;

-- schedules
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules for select to authenticated
  using (public.is_class_member(class_id));
drop policy if exists schedules_insert on public.schedules;
create policy schedules_insert on public.schedules for insert to authenticated
  with check (public.is_class_teacher(class_id) and created_by = auth.uid());
drop policy if exists schedules_update on public.schedules;
create policy schedules_update on public.schedules for update to authenticated
  using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));
drop policy if exists schedules_delete on public.schedules;
create policy schedules_delete on public.schedules for delete to authenticated
  using (public.is_class_teacher(class_id));

revoke all on public.schedules from anon, authenticated;
grant select, insert, update, delete on public.schedules to authenticated;
grant all on public.schedules to service_role;
