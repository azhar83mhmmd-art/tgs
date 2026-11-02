-- =====================================================================
-- TugasKu v3 — 16_buku_dikumpul.sql
-- FITUR "BUKU DIKUMPUL": guru menandai buku suatu mapel sedang dikumpulkan (masih di guru, belum dibagikan
-- ke siswa), lalu menandainya "sudah dibagikan". Siswa melihat statusnya + mendapat notifikasi.
-- Opsional ditautkan ke satu tugas (chip "Buku masih di guru" muncul di tugas itu).
-- Prasyarat: 01, 02, 06. Idempotent: aman dijalankan berulang kali.
-- =====================================================================

create table if not exists public.book_collections (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  subject      text not null check (char_length(trim(subject)) > 0),
  note         text,
  task_id      uuid references public.tasks(id) on delete set null,
  status       text not null default 'dikumpul' check (status in ('dikumpul', 'dibagikan')),
  collected_at timestamptz not null default now(),
  returned_at  timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists book_collections_class_idx on public.book_collections (class_id, status, collected_at desc);
create index if not exists book_collections_task_idx  on public.book_collections (task_id) where task_id is not null;

drop trigger if exists trg_book_collections_updated on public.book_collections;
create trigger trg_book_collections_updated before update on public.book_collections
  for each row execute function public.set_updated_at();

-- Konsistensi status & waktu (klien tidak bisa memalsukan), kunci kelas, tugas harus sekelas
create or replace function public.book_collections_before() returns trigger
language plpgsql as $$
begin
  if new.task_id is not null and public.task_class(new.task_id) is distinct from new.class_id then
    raise exception 'Tugas yang ditautkan harus berasal dari kelas yang sama';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'dikumpul'; new.collected_at := now(); new.returned_at := null;
  else
    new.class_id := old.class_id; new.created_by := old.created_by;
    if new.status = 'dibagikan' and old.status = 'dikumpul' then
      new.returned_at := now(); new.collected_at := old.collected_at;
    elsif new.status = 'dikumpul' and old.status = 'dibagikan' then
      new.collected_at := now(); new.returned_at := null;        -- dikumpulkan lagi
    else
      new.collected_at := old.collected_at; new.returned_at := old.returned_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_book_collections_before on public.book_collections;
create trigger trg_book_collections_before before insert or update on public.book_collections
  for each row execute function public.book_collections_before();

-- Jenis notifikasi baru
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in
  ('new_task','reminder_h3','reminder_h1','reminder_h0','overdue','new_task_alert','announcement','exam_alert',
   'deadline_changed','status_updated','teacher_overdue','schedule','book_collected','book_returned'));

-- Notifikasi ke siswa kelas itu saat buku dikumpulkan / dibagikan (mengikuti pengaturan "Pengumuman")
create or replace function public.book_collections_notify() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_kind text; v_title text; v_body text;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then v_kind := 'book_collected';
  elsif new.status is distinct from old.status then
    v_kind := case new.status when 'dikumpul' then 'book_collected' else 'book_returned' end;
  else return new; end if;

  -- catatan kirim lama untuk buku ini digantikan agar notifikasi berikutnya tidak dianggap duplikat
  update public.notification_logs set superseded_at = now()
   where ref_id = new.id and kind in ('book_collected', 'book_returned') and superseded_at is null;

  if v_kind = 'book_collected' then
    v_title := '📚 Buku ' || new.subject || ' dikumpulkan';
    v_body  := 'Buku ' || new.subject || ' sedang berada di guru dan belum dibagikan ke siswa.'
               || coalesce(' ' || nullif(trim(new.note), ''), '');
  else
    v_title := '📖 Buku ' || new.subject || ' sudah dibagikan';
    v_body  := 'Buku ' || new.subject || ' sudah dibagikan kembali. Silakan ambil bukumu.';
  end if;

  for r in select user_id from public.class_members where class_id = new.class_id and member_role = 'siswa' loop
    perform public.push_notification(r.user_id, v_kind, v_title, v_body, new.class_id, new.id, 'announcement',
                                     jsonb_build_object('book_id', new.id, 'url', '#/buku'));
  end loop;
  return new;
end $$;
drop trigger if exists trg_book_collections_notify on public.book_collections;
create trigger trg_book_collections_notify after insert or update on public.book_collections
  for each row execute function public.book_collections_notify();
revoke all on function public.book_collections_notify() from public, anon, authenticated;

-- RLS: semua anggota kelas membaca; hanya guru kelas yang menulis
alter table public.book_collections enable row level security;
drop policy if exists book_collections_select on public.book_collections;
create policy book_collections_select on public.book_collections for select to authenticated
  using (public.is_class_member(class_id));
drop policy if exists book_collections_insert on public.book_collections;
create policy book_collections_insert on public.book_collections for insert to authenticated
  with check (public.is_class_teacher(class_id) and created_by = auth.uid());
drop policy if exists book_collections_update on public.book_collections;
create policy book_collections_update on public.book_collections for update to authenticated
  using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));
drop policy if exists book_collections_delete on public.book_collections;
create policy book_collections_delete on public.book_collections for delete to authenticated
  using (public.is_class_teacher(class_id));
revoke all on public.book_collections from anon, authenticated;
grant select, insert, update, delete on public.book_collections to authenticated;
grant all on public.book_collections to service_role;

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not (select puballtables from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = 'book_collections') then
    alter publication supabase_realtime add table public.book_collections;
  end if;
end $$;

notify pgrst, 'reload schema';
