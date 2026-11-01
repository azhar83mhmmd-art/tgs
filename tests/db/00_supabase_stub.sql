-- Meniru bagian Supabase yang dibutuhkan schema.sql (HANYA untuk pengujian lokal).
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255),
  email varchar(255) unique, encrypted_password varchar(255), email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token varchar(255), recovery_token varchar(255),
  email_change_token_new varchar(255), email_change varchar(255)
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  email text generated always as (lower(identity_data->>'email')) stored,
  unique (provider_id, provider)
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select string_to_array(name, '/') $$;

-- Supabase memberi hak default ke anon/authenticated/service_role di schema public
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- stub pg_net: mencatat panggilan agar bisa diuji
create schema net;
create table net.calls (id serial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                              headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls(url, body, headers) values (url, body, headers) returning id::bigint $$;

-- helper pengujian
create schema test;
create function test.as_user(p_uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_uid::text, true); set local role authenticated; end $$;
create function test.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); set local role anon; end $$;
create function test.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'GAGAL: % — diharapkan %, dapat %', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok   %', p_label;
end $$;
create function test.fails(p_sql text, p_label text) returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok   % (ditolak: %)', p_label, left(sqlerrm, 70);
    return;
  end;
  raise exception 'GAGAL: % — seharusnya ditolak tetapi berhasil', p_label;
end $$;
create function test.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint; begin execute 'select count(*) from (' || p_sql || ') q' into v; return v; end $$;

create function test.uid(p_username text) returns uuid language plpgsql security definer as
  $$ declare v uuid; begin select id into v from public.profiles where username = p_username; return v; end $$;
create function test.reset() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create function test.signup(p_username text, p_name text, p_role text default 'siswa', p_code text default null)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v, p_username || '@tugasku.local',
          jsonb_strip_nulls(jsonb_build_object('username', p_username, 'full_name', p_name,
                                               'role', p_role, 'teacher_code', p_code)));
  return v;
end $$;
grant usage on schema test to anon, authenticated;
grant execute on all functions in schema test to anon, authenticated;

create function test.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
grant execute on function test.affected(text) to anon, authenticated;
