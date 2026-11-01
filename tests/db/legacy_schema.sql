-- =====================================================
-- KelasKu — Supabase Schema (v2 — dengan Pengumuman)
-- Jalankan file ini di: Supabase Dashboard → SQL Editor
-- =====================================================

-- Tabel: users (siswa & guru)
create table if not exists public.users (
  id          text primary key,
  nama        text not null,
  username    text not null unique,
  password    text not null,
  role        text not null default 'siswa',
  avatar      text,
  dibuat      timestamptz default now()
);

-- Tabel: tugas
create table if not exists public.tugas (
  id          text primary key,
  judul       text not null,
  mapel       text not null,
  deskripsi   text not null,
  deadline    timestamptz not null,
  jenis       text default 'individu',
  poin        int default 10,
  dibuat      timestamptz default now(),
  oleh        text references public.users(id) on delete set null
);

-- Tabel: pengumpulan
create table if not exists public.pengumpulan (
  id          text primary key,
  tugas_id    text not null references public.tugas(id) on delete cascade,
  siswa_id    text not null references public.users(id) on delete cascade,
  status      text not null default 'proses',
  catatan     text default '',
  waktu       timestamptz default now(),
  unique(tugas_id, siswa_id)
);

-- Tabel: pengumuman (BARU)
create table if not exists public.pengumuman (
  id          text primary key,
  judul       text not null,
  isi         text not null,
  penting     boolean default false,
  oleh        text references public.users(id) on delete set null,
  oleh_nama   text not null,
  dibuat      timestamptz default now()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
alter table public.users       enable row level security;
alter table public.tugas       enable row level security;
alter table public.pengumpulan enable row level security;
alter table public.pengumuman  enable row level security;

create policy "users_select_all"      on public.users       for select using (true);
create policy "users_insert_signup"   on public.users       for insert with check (true);
create policy "users_delete_admin"    on public.users       for delete using (true);

create policy "tugas_select_all"      on public.tugas       for select using (true);
create policy "tugas_insert_all"      on public.tugas       for insert with check (true);
create policy "tugas_delete_all"      on public.tugas       for delete using (true);

create policy "pengumpulan_select_all"  on public.pengumpulan for select using (true);
create policy "pengumpulan_insert_all"  on public.pengumpulan for insert with check (true);
create policy "pengumpulan_update_all"  on public.pengumpulan for update using (true);
create policy "pengumpulan_delete_all"  on public.pengumpulan for delete using (true);

create policy "pengumuman_select_all"   on public.pengumuman  for select using (true);
create policy "pengumuman_insert_all"   on public.pengumuman  for insert with check (true);
create policy "pengumuman_delete_all"   on public.pengumuman  for delete using (true);

-- =====================================================
-- REALTIME
-- =====================================================
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.tugas;
alter publication supabase_realtime add table public.pengumpulan;
alter publication supabase_realtime add table public.pengumuman;
