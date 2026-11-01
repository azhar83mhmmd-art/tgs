-- =====================================================================
-- 11 — Diagnosis & tes Web Push (untuk tombol "Kirim notifikasi tes" di Pusat Notifikasi)
-- Prasyarat: 06. Aman dijalankan ulang.
-- =====================================================================

-- Kirim 1 notifikasi tes ke diri sendiri lewat jalur yang SAMA dengan notifikasi asli
-- (insert -> trigger -> pg_net -> Edge Function send-push -> HP).
create or replace function public.send_test_push() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  insert into public.notifications (user_id, type, title, body, ref_id, data)
  values (auth.uid(), 'announcement', '🔔 Tes Notifikasi TugasKu',
          'Jika ini muncul di layar HP saat aplikasi ditutup, notifikasi latar belakang sudah berfungsi.',
          gen_random_uuid(), jsonb_build_object('url', '#/notifikasi'));
end $$;

-- Ringkasan kondisi rantai push, tanpa membocorkan rahasia.
create or replace function public.push_diagnostics() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_resp jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  v := jsonb_build_object(
    'url_set',    exists (select 1 from public.app_config where key = 'push_function_url' and coalesce(value, '') <> ''),
    'secret_set', exists (select 1 from public.app_config where key = 'push_webhook_secret' and coalesce(value, '') <> ''),
    'pg_net',     to_regnamespace('net') is not null,
    'my_subscriptions', (select count(*) from public.push_subscriptions where user_id = auth.uid()));
  if to_regnamespace('net') is not null then
    begin
      execute $q$select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select status_code, left(coalesce(error_msg, content, ''), 160) as detail, created
          from net._http_response order by created desc limit 3) r$q$ into v_resp;
    exception when others then v_resp := '[]'::jsonb;
    end;
  end if;
  return v || jsonb_build_object('last_responses', v_resp);
end $$;

revoke all on function public.send_test_push(), public.push_diagnostics() from public, anon;
grant execute on function public.send_test_push(), public.push_diagnostics() to authenticated;
notify pgrst, 'reload schema';
