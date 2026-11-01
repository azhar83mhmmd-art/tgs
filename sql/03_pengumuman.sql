-- =====================================================================
-- TugasKu v3 — 03_pengumuman.sql
-- Fitur PENGUMUMAN: tabel announcements + RLS. (Notifikasinya ada di 06.)
-- Prasyarat: 01
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  title        text not null check (char_length(trim(title)) > 0),
  body         text not null check (char_length(trim(body)) > 0),
  is_important boolean not null default false,
  created_by   uuid references public.profiles(id) on delete set null,
  legacy_id    text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists announcements_class_idx on public.announcements (class_id, created_at desc);

-- updated_at otomatis
drop trigger if exists trg_announcements_updated on public.announcements;
create trigger trg_announcements_updated before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

-- announcements
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (public.is_class_member(class_id));
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
  with check (public.is_class_teacher(class_id) and created_by = auth.uid());
drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements for update to authenticated
  using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));
drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete to authenticated
  using (public.is_class_teacher(class_id));

revoke all on public.announcements from anon, authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
