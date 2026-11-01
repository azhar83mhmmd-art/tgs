-- =====================================================================
-- TugasKu v3 — 08_migrasi_kelasku.sql
-- Migrasi data KelasKu LAMA (users/tugas/pengumpulan/pengumuman) + penguncian tabel lama. Tidak melakukan apa pun di project baru.
-- Prasyarat: 01-07
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

-- 10. Migrasi data lama (hanya berjalan jika tabel lama KelasKu ada)
-- ---------------------------------------------------------------------
do $mig$
declare
  u record; t record; p record; a record;
  v_domain text := coalesce((select value from public.app_config where key = 'email_domain'), 'tugasku.local');
  v_uid uuid; v_email text; v_ok int := 0; v_fail int := 0;
  v_class uuid; v_owner uuid; v_default_id text;
  v_task uuid; v_instance uuid := '00000000-0000-0000-0000-000000000000';
begin
  if to_regclass('public.users') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'users' and column_name = 'password')
  then
    return;                                   -- project baru / sudah tidak ada tabel lama
  end if;

  perform set_config('app.migrating', 'on', true);

  -- 10a. Akun -> Supabase Auth + profiles
  for u in select * from public.users order by dibuat loop
    continue when exists (select 1 from public.profiles where legacy_id = u.id);
    begin
      v_email := lower(u.username) || '@' || v_domain;
      select id into v_uid from auth.users where email = v_email;
      if v_uid is null then
        v_uid := gen_random_uuid();
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change)
        values (
          v_instance, v_uid, 'authenticated', 'authenticated', v_email,
          extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('username', lower(u.username), 'full_name', u.nama),
          coalesce(u.dibuat, now()), now(), '', '', '', '');
        insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                                     last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_uid::text, v_uid,
                jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
                'email', now(), coalesce(u.dibuat, now()), now());
      end if;
      insert into public.profiles (id, username, full_name, role, legacy_id, created_at)
      values (v_uid, lower(u.username), u.nama,
              case when u.role = 'admin' then 'guru' else 'siswa' end, u.id, coalesce(u.dibuat, now()));
      insert into public.notification_settings (user_id) values (v_uid) on conflict do nothing;
      -- password polos tidak lagi disimpan
      update public.users set password = '[dimigrasikan ke Supabase Auth]' where id = u.id;
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      raise warning 'Migrasi akun "%" gagal: %', u.username, sqlerrm;
    end;
  end loop;
  raise notice 'Migrasi akun: % berhasil, % gagal', v_ok, v_fail;

  -- 10b. Kelas bawaan
  select value into v_default_id from public.app_config where key = 'legacy_default_class_id';
  if v_default_id is not null and exists (select 1 from public.classes where id = v_default_id::uuid) then
    v_class := v_default_id::uuid;
  else
    select id into v_owner from public.profiles where legacy_id is not null and role = 'guru'
     order by created_at limit 1;
    if v_owner is not null then
      insert into public.classes (name, description, created_by)
      values ('Kelas Utama', 'Kelas bawaan hasil migrasi dari KelasKu', v_owner)
      returning id into v_class;
      insert into public.app_config (key, value) values ('legacy_default_class_id', v_class::text)
      on conflict (key) do update set value = excluded.value;
    end if;
  end if;

  if v_class is not null then
    insert into public.class_members (class_id, user_id, member_role)
    select v_class, id, role from public.profiles where legacy_id is not null
    on conflict do nothing;

    -- 10c. Tugas
    for t in select * from public.tugas loop
      continue when exists (select 1 from public.tasks where legacy_id = t.id);
      begin
        v_task := case when t.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then t.id::uuid else gen_random_uuid() end;
        insert into public.tasks (id, class_id, title, subject, description, assigned_date, deadline,
                                  created_by, legacy_id, created_at)
        values (v_task, v_class, t.judul, t.mapel, coalesce(t.deskripsi, ''),
                (coalesce(t.dibuat, now()) at time zone 'Asia/Jakarta')::date, t.deadline,
                (select id from public.profiles where legacy_id = t.oleh), t.id, coalesce(t.dibuat, now()));
      exception when others then
        raise warning 'Migrasi tugas "%" gagal: %', t.judul, sqlerrm;
      end;
    end loop;

    -- 10d. Status: hanya 'selesai' yang dibawa (selain itu = Belum Selesai = default)
    insert into public.task_status (task_id, student_id, is_done, updated_at)
    select tk.id, pr.id, true, coalesce(pg.waktu, now())
      from public.pengumpulan pg
      join public.tasks tk on tk.legacy_id = pg.tugas_id
      join public.profiles pr on pr.legacy_id = pg.siswa_id and pr.role = 'siswa'
     where pg.status = 'selesai'
    on conflict do nothing;

    -- 10e. Pengumuman
    for a in select * from public.pengumuman loop
      continue when exists (select 1 from public.announcements where legacy_id = a.id);
      insert into public.announcements (class_id, title, body, is_important, created_by, legacy_id, created_at)
      values (v_class, a.judul, a.isi, coalesce(a.penting, false),
              (select id from public.profiles where legacy_id = a.oleh), a.id, coalesce(a.dibuat, now()));
    end loop;
  else
    raise notice 'Tidak ada akun guru yang termigrasi: tugas & pengumuman lama belum dipindahkan. Jalankan ulang file ini setelah ada guru.';
  end if;

  perform set_config('app.migrating', 'off', true);
end $mig$;

-- 10f. Kunci tabel lama (menyimpan data arsip, tetapi tidak lagi bisa diakses lewat API)
do $lock$
declare t text; pol record;
begin
  foreach t in array array['users','tugas','pengumpulan','pengumuman'] loop
    if to_regclass('public.' || t) is not null and
       (t <> 'users' or exists (select 1 from information_schema.columns
                                where table_schema='public' and table_name='users' and column_name='password')) then
      execute format('alter table public.%I enable row level security', t);
      for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, t);
      end loop;
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('comment on table public.%I is %L', t,
                     'ARSIP KelasKu (dikunci oleh TugasKu v3). Boleh di-DROP setelah migrasi diverifikasi.');
    end if;
  end loop;
end $lock$;
