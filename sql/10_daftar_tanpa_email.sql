-- =====================================================================
-- 10 — Pendaftaran tanpa email (memperbaiki "Email address ... is invalid"
--      dan "email rate limit exceeded")
-- ---------------------------------------------------------------------
-- Kedua error itu muncul karena Supabase mencoba MENGIRIM email konfirmasi ke
-- alamat palsu username@tugasku.local. Fungsi ini membuat akun langsung
-- (sudah terkonfirmasi, tanpa email apa pun), jadi tidak bergantung pada
-- pengaturan "Confirm email" di dashboard dan tidak kena batas email.
-- Aman dijalankan ulang. Prasyarat: 00 dan 01.
-- =====================================================================

create or replace function public.register_account(
  p_username text, p_full_name text, p_password text,
  p_role text default 'siswa', p_teacher_code text default null)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uname  text := lower(trim(coalesce(p_username, '')));
  v_name   text := trim(coalesce(p_full_name, ''));
  v_role   text := case when p_role = 'guru' then 'guru' else 'siswa' end;
  v_domain text := coalesce((select value from public.app_config where key = 'email_domain'), 'tugasku.local');
  v_email  text;
  v_uid    uuid := gen_random_uuid();
begin
  if length(v_name) < 2 then raise exception 'Nama lengkap minimal 2 karakter!'; end if;
  if v_uname !~ '^[a-z0-9._-]{4,30}$' then raise exception 'Username 4-30 karakter: huruf kecil, angka, titik, strip, garis bawah.'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password minimal 6 karakter!'; end if;
  if v_role = 'guru' and coalesce(p_teacher_code, '') is distinct from
     (select value from public.app_config where key = 'teacher_code') then
    raise exception 'Kode guru salah';
  end if;

  v_email := v_uname || '@' || v_domain;
  -- sisa percobaan daftar lama yang gagal kirim email (belum terkonfirmasi) dibersihkan
  delete from auth.users where email = v_email and email_confirmed_at is null;

  if exists (select 1 from public.profiles where lower(username) = v_uname)
     or exists (select 1 from auth.users where email = v_email) then
    raise exception 'Username sudah digunakan, coba yang lain!';
  end if;

  -- trigger on_auth_user_created (sql/01) membuat baris profiles + notification_settings
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', v_uname, 'full_name', v_name, 'role', v_role,
                       'teacher_code', case when v_role = 'guru' then p_teacher_code end),
    now(), now(), '', '', '', '', '', '', '', '');

  insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid::text, v_uid,
          jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());
end $$;

revoke all on function public.register_account(text, text, text, text, text) from public;
grant execute on function public.register_account(text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
