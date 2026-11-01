-- =====================================================================
-- TugasKu v3 — 01_akun_kelas.sql
-- Akun & kelas: profiles, classes, class_members, pendaftaran (peran divalidasi server), kode kelas.
-- Prasyarat: 00
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null check (username ~ '^[a-z0-9._-]{4,30}$'),
  full_name   text not null check (char_length(trim(full_name)) between 2 and 80),
  role        text not null default 'siswa' check (role in ('guru','siswa')),
  avatar_url  text,
  legacy_id   text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 80),
  description text,
  join_code   text not null unique default public.gen_join_code(),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id    uuid not null references public.classes(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('guru','siswa')),
  joined_at   timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists class_members_user_idx on public.class_members (user_id);

-- updated_at otomatis
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Fungsi bantu RLS (SECURITY DEFINER agar tidak rekursif)
-- ---------------------------------------------------------------------
create or replace function public.is_guru() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'guru')
$$;

create or replace function public.is_class_member(p_class uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.class_members where class_id = p_class and user_id = auth.uid())
$$;

create or replace function public.is_class_teacher(p_class uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.class_members
                 where class_id = p_class and user_id = auth.uid() and member_role = 'guru')
$$;

create or replace function public.is_class_student(p_class uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.class_members
                 where class_id = p_class and user_id = auth.uid() and member_role = 'siswa')
$$;

create or replace function public.can_view_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_target = auth.uid() or exists (
    select 1
    from public.class_members me
    join public.class_members tg on tg.class_id = me.class_id
    where me.user_id = auth.uid() and tg.user_id = p_target
      and (me.member_role = 'guru' or tg.member_role = 'guru'))
$$;

-- 4. Pembuatan profil saat pendaftaran (server-side, tidak bisa dipalsukan)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_uname text;
  v_name  text;
  v_role  text := 'siswa';
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then
    return new;                                  -- migrasi mengisi profil sendiri
  end if;

  v_uname := lower(coalesce(nullif(v_meta->>'username', ''), split_part(new.email, '@', 1)));
  v_name  := coalesce(nullif(trim(v_meta->>'full_name'), ''), v_uname);

  if v_meta->>'role' = 'guru' then
    if coalesce(v_meta->>'teacher_code', '') is distinct from
       (select value from public.app_config where key = 'teacher_code') then
      raise exception 'Kode guru salah';
    end if;
    v_role := 'guru';
  end if;

  insert into public.profiles (id, username, full_name, role)
  values (new.id, v_uname, v_name, v_role);
  insert into public.notification_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Klien tidak boleh mengubah role / username / id
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.username is distinct from old.username
       or new.legacy_id is distinct from old.legacy_id then
      raise exception 'Kolom id, role, dan username tidak dapat diubah';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- 5. Kelas & keanggotaan
-- ---------------------------------------------------------------------
create or replace function public.classes_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.class_members (class_id, user_id, member_role)
  values (new.id, new.created_by, 'guru') on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_classes_after_insert on public.classes;
create trigger trg_classes_after_insert after insert on public.classes
  for each row execute function public.classes_after_insert();

create or replace function public.class_members_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = new.user_id;
  if v_role is distinct from new.member_role then
    raise exception 'Peran anggota kelas harus sama dengan peran akun';
  end if;
  return new;
end $$;
drop trigger if exists trg_class_members_check on public.class_members;
create trigger trg_class_members_check before insert or update on public.class_members
  for each row execute function public.class_members_check();

-- Siswa bergabung dengan kode kelas
create or replace function public.join_class(p_code text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_class uuid; v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'siswa') then
    raise exception 'Hanya siswa yang dapat bergabung dengan kode kelas';
  end if;
  select id into v_class from public.classes where join_code = v_code;
  if v_class is null then raise exception 'Kode kelas tidak ditemukan'; end if;
  insert into public.class_members (class_id, user_id, member_role)
  values (v_class, auth.uid(), 'siswa') on conflict do nothing;
  return v_class;
end $$;

create or replace function public.regenerate_join_code(p_class uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v text;
begin
  if not public.is_class_teacher(p_class) then raise exception 'Bukan guru kelas ini'; end if;
  v := public.gen_join_code();
  update public.classes set join_code = v where id = p_class;
  return v;
end $$;

create or replace function public.add_class_teacher(p_class uuid, p_username text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid;
begin
  if not public.is_class_teacher(p_class) then raise exception 'Bukan guru kelas ini'; end if;
  select id into v_user from public.profiles
   where lower(username) = lower(trim(p_username)) and role = 'guru';
  if v_user is null then raise exception 'Akun guru dengan username itu tidak ditemukan'; end if;
  insert into public.class_members (class_id, user_id, member_role)
  values (p_class, v_user, 'guru') on conflict do nothing;
end $$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(trim(p_username)))
$$;

-- ---------------------------------------------------------------------
-- RLS & hak akses
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.classes       enable row level security;
alter table public.class_members enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_profile(id));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- classes
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
  using (public.is_class_member(id) or created_by = auth.uid());
drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes for insert to authenticated
  with check (created_by = auth.uid() and public.is_guru());
drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes for update to authenticated
  using (public.is_class_teacher(id)) with check (public.is_class_teacher(id));
drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes for delete to authenticated
  using (created_by = auth.uid());

-- class_members: siswa hanya melihat barisnya sendiri; guru melihat seluruh anggota kelasnya
drop policy if exists class_members_select on public.class_members;
create policy class_members_select on public.class_members for select to authenticated
  using (user_id = auth.uid() or public.is_class_teacher(class_id));
drop policy if exists class_members_delete on public.class_members;
create policy class_members_delete on public.class_members for delete to authenticated
  using (member_role = 'siswa' and (user_id = auth.uid() or public.is_class_teacher(class_id)));

revoke all on public.profiles, public.classes, public.class_members from anon, authenticated;
grant select, update (full_name, avatar_url)             on public.profiles      to authenticated;
grant select, insert, delete, update (name, description) on public.classes       to authenticated;
grant select, delete                                     on public.class_members to authenticated;
grant all on public.profiles, public.classes, public.class_members to service_role;

revoke all on function public.handle_new_user(), public.profiles_guard(), public.classes_after_insert(),
  public.class_members_check() from public, anon, authenticated;
revoke all on function public.is_guru(), public.is_class_member(uuid), public.is_class_teacher(uuid),
  public.is_class_student(uuid), public.can_view_profile(uuid), public.join_class(text),
  public.regenerate_join_code(uuid), public.add_class_teacher(uuid, text), public.username_available(text)
  from public, anon;
grant execute on function public.is_guru(), public.is_class_member(uuid), public.is_class_teacher(uuid),
  public.is_class_student(uuid), public.can_view_profile(uuid), public.join_class(text),
  public.regenerate_join_code(uuid), public.add_class_teacher(uuid, text) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
