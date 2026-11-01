-- =====================================================================
-- TugasKu v3 — 09_realtime_storage.sql
-- Realtime (tanpa menghapus publication yang ada) dan bucket Storage "avatars" untuk foto profil.
-- Prasyarat: 01-06
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

-- 11. Realtime (tidak menghapus publication yang sudah ada)
-- ---------------------------------------------------------------------
do $rt$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;                                   -- FOR ALL TABLES: sudah mencakup semuanya
  end if;
  foreach t in array array['classes','class_members','tasks','task_status','announcements',
                           'schedules','notifications','activity_logs'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
  -- tabel arsip lama tidak perlu realtime
  foreach t in array array['users','tugas','pengumpulan','pengumuman'] loop
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $rt$;

-- ---------------------------------------------------------------------
-- 12. Storage: foto profil (bucket "avatars", folder per-user)
-- ---------------------------------------------------------------------
do $st$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'Storage tidak tersedia: lewati bucket avatars';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

  drop policy if exists "tugasku avatars select" on storage.objects;
  create policy "tugasku avatars select" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "tugasku avatars insert" on storage.objects;
  create policy "tugasku avatars insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "tugasku avatars update" on storage.objects;
  create policy "tugasku avatars update" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "tugasku avatars delete" on storage.objects;
  create policy "tugasku avatars delete" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when insufficient_privilege then
  raise notice 'Tidak punya hak untuk membuat policy storage. Buat bucket "avatars" (public) lewat Dashboard → Storage.';
end $st$;
