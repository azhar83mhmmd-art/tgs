-- =====================================================================
-- TugasKu v3 — 00_dasar.sql
-- Fondasi: ekstensi, konfigurasi server (app_config), fungsi utilitas & format tanggal WIB.
-- Prasyarat: tidak ada
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 0. Konfigurasi sisi-server (tidak bisa dibaca klien)
-- ---------------------------------------------------------------------
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;   -- tanpa policy = tertutup

insert into public.app_config (key, value) values
  ('teacher_code', 'KENZO'),          -- kode pendaftaran guru. GANTI setelah setup!
  ('email_domain', 'tugasku.local'),  -- harus sama dengan EMAIL_DOMAIN di js/config.js
  ('reminder_hour', '7')              -- jam (WIB) pengingat H-3/H-1/H-0 mulai dikirim
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 1. Fungsi utilitas
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- SECURITY DEFINER: harus melihat SEMUA kelas (bukan hanya yang lolos RLS) agar kode benar-benar unik.
create or replace function public.gen_join_code() returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v text;
begin
  loop
    v := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.classes where join_code = v);
  end loop;
  return v;
end $$;

-- Format tanggal Indonesia, zona Asia/Jakarta: "31 Okt 2026, 13:02 WIB"
create or replace function public.fmt_id_datetime(p timestamptz) returns text
language sql stable set search_path = public as $$
  select to_char(p at time zone 'Asia/Jakarta', 'FMDD') || ' ' ||
         (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])
           [extract(month from p at time zone 'Asia/Jakarta')::int] || ' ' ||
         to_char(p at time zone 'Asia/Jakarta', 'YYYY') || ', ' ||
         to_char(p at time zone 'Asia/Jakarta', 'HH24:MI') || ' WIB'
$$;

create or replace function public.fmt_id_date(p timestamptz) returns text
language sql stable set search_path = public as $$
  select to_char(p at time zone 'Asia/Jakarta', 'FMDD') || ' ' ||
         (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])
           [extract(month from p at time zone 'Asia/Jakarta')::int] || ' ' ||
         to_char(p at time zone 'Asia/Jakarta', 'YYYY')
$$;

-- Hak akses fungsi & tabel konfigurasi
revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.gen_join_code() from public, anon;
grant execute on function public.gen_join_code() to authenticated;   -- dibutuhkan DEFAULT kolom classes.join_code
grant execute on function public.fmt_id_datetime(timestamptz), public.fmt_id_date(timestamptz) to authenticated, service_role;
