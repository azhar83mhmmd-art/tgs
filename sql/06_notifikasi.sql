-- =====================================================================
-- TugasKu v3 — 06_notifikasi.sql
-- Fitur NOTIFIKASI: notifications, notification_logs (riwayat), pengaturan, langganan push, template resmi (notification_templates),
-- mesin push_notification, trigger (tugas baru, perubahan deadline, status berubah, pengumuman, anggota baru), hook Web Push.
-- Prasyarat: 01, 02, 03, 04
-- Idempotent: aman dijalankan berulang kali. Jalankan berurutan 00 → 09.
-- =====================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('new_task','reminder_h3','reminder_h1','reminder_h0','overdue',
                                           'new_task_alert','announcement','exam_alert','deadline_changed','status_updated',
                                           'teacher_overdue','schedule')),   -- 2 terakhir: peninggalan versi lama (baris lama tetap valid)
  title      text not null,
  body       text not null,
  class_id   uuid references public.classes(id) on delete cascade,
  ref_id     uuid,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- tabel yang sudah ada dari versi sebelumnya: perbarui daftar jenis notifikasi
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in
  ('new_task','reminder_h3','reminder_h1','reminder_h0','overdue','new_task_alert','announcement','exam_alert',
   'deadline_changed','status_updated','teacher_overdue','schedule'));

-- Riwayat pengiriman. Indeks unik parsial (user, jenis, referensi, kanal) = mencegah notifikasi ganda.
-- Saat deadline tugas diubah, log lama diberi superseded_at (riwayat tetap ada) sehingga
-- pengingat untuk deadline baru bisa dikirim lagi.
create table if not exists public.notification_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  class_id        uuid references public.classes(id) on delete cascade,
  kind            text not null,
  ref_id          uuid not null,
  channel         text not null default 'in_app' check (channel in ('in_app','push')),
  status          text not null check (status in ('sent','skipped','failed')),
  detail          text,
  notification_id uuid references public.notifications(id) on delete set null,
  superseded_at   timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.notification_logs add column if not exists superseded_at timestamptz;
create unique index if not exists notification_logs_dedupe
  on public.notification_logs (user_id, kind, ref_id, channel) where superseded_at is null;
create index if not exists notification_logs_class_idx on public.notification_logs (class_id, created_at desc);

create table if not exists public.notification_settings (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  new_task     boolean not null default true,
  reminder     boolean not null default true,
  announcement boolean not null default true,
  schedule     boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- updated_at otomatis
drop trigger if exists trg_notification_settings_updated on public.notification_settings;
create trigger trg_notification_settings_updated before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- TEMPLATE NOTIFIKASI RESMI — sumber tunggal teks push/notifikasi TugasKu.
-- Teks di bawah ditetapkan pemilik produk: JANGAN diubah gayanya / diganti kalimat alternatif.
-- Variabel {mapel} {nama_tugas} {deadline} {jam_deadline} diisi otomatis dari database oleh render_notification().
-- Menjalankan ulang file ini mengembalikan teks ke versi resmi.
-- ---------------------------------------------------------------------
create table if not exists public.notification_templates (
  kind       text primary key,
  title      text not null,
  body       text not null,
  updated_at timestamptz not null default now()
);
alter table public.notification_templates enable row level security;   -- tanpa policy = tertutup untuk klien

insert into public.notification_templates (kind, title, body) values
  ('new_task',         $t$📚 Misi Baru Telah Tiba!$t$,
                       $t$Guru baru saja memberikan tugas {mapel}. Jangan sampai tertinggal! Buka TugasKu dan cek detail tugasmu.$t$),
  ('reminder_h3',      $t$⚠️ Waktunya Mulai Bergerak!$t$,
                       $t$Tugas {mapel} akan berakhir dalam 3 hari lagi. Jangan tunggu sampai deadline mendekat. Sedikit demi sedikit, yang penting selesai!$t$),
  ('reminder_h1',      $t$🚨 BESOK DEADLINE!$t$,
                       $t$Tugas {mapel} masih menunggumu! Waktu tersisa hanya 24 jam. Pastikan tugasmu selesai sebelum batas waktu berakhir.$t$),
  ('reminder_h0',      $t$🔥 LAST CALL — DEADLINE HARI INI!$t$,
                       $t$Ini kesempatan terakhirmu untuk menyelesaikan tugas {mapel}. Jangan sampai melewati batas waktu!$t$),
  ('overdue',          $t$⛔ WAKTU TELAH HABIS!$t$,
                       $t$Tugas {mapel} sudah melewati deadline, tetapi statusmu masih belum selesai. Segera periksa tugas tersebut di TugasKu.$t$),
  ('new_task_alert',   $t$🔔 NEW TASK ALERT!$t$,
                       $t$Ada tugas baru yang perlu kamu perhatikan.$t$),
  ('announcement',     $t$📢 PENGUMUMAN PENTING!$t$,
                       $t$Guru baru saja membagikan informasi untuk kelasmu.$t$),
  ('exam_alert',       $t$📝 EXAM ALERT!$t$,
                       $t$Ujian {mapel} akan dilaksanakan besok.$t$),
  ('deadline_changed', $t$🔄 DEADLINE UPDATED!$t$,
                       $t$Batas waktu tugas {mapel} telah diperbarui.$t$),
  ('status_updated',   $t$✅ PROGRESS UPDATED!$t$,
                       $t$Status tugasmu berhasil diperbarui menjadi Sudah Selesai.$t$)
on conflict (kind) do update set title = excluded.title, body = excluded.body, updated_at = now();

-- Isi template dengan variabel: {kunci} diganti nilai p_vars ->> 'kunci'
create or replace function public.render_notification(p_kind text, p_vars jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.notification_templates%rowtype; v_title text; v_body text; k text;
begin
  select * into t from public.notification_templates where kind = p_kind;
  if not found then raise exception 'Template notifikasi "%" tidak ditemukan', p_kind; end if;
  v_title := t.title; v_body := t.body;
  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    v_title := replace(v_title, '{' || k || '}', coalesce(p_vars ->> k, ''));
    v_body  := replace(v_body,  '{' || k || '}', coalesce(p_vars ->> k, ''));
  end loop;
  return jsonb_build_object('title', v_title, 'body', v_body);
end $$;

-- Variabel tugas (WIB): mapel, nama_tugas, deadline ("20 Nov 2026"), jam_deadline ("20:00 WIB")
create or replace function public.task_template_vars(p_subject text, p_title text, p_deadline timestamptz) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'mapel', p_subject, 'nama_tugas', p_title,
    'deadline', public.fmt_id_date(p_deadline),
    'jam_deadline', to_char(p_deadline at time zone 'Asia/Jakarta', 'HH24:MI') || ' WIB')
$$;

-- Satu pintu pembuatan notifikasi: cek pengaturan pengguna, cegah duplikat, catat riwayat.
create or replace function public.push_notification(
  p_user uuid, p_type text, p_title text, p_body text,
  p_class uuid, p_ref uuid, p_setting text, p_data jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_enabled boolean := true; v_log uuid; v_notif uuid;
begin
  if p_setting is not null then
    select coalesce((to_jsonb(s) ->> p_setting)::boolean, true) into v_enabled
      from public.notification_settings s where s.user_id = p_user;
    v_enabled := coalesce(v_enabled, true);
  end if;

  insert into public.notification_logs (user_id, class_id, kind, ref_id, channel, status, detail)
  values (p_user, p_class, p_type, p_ref, 'in_app',
          case when v_enabled then 'sent' else 'skipped' end,
          case when v_enabled then null else 'dinonaktifkan oleh pengguna' end)
  on conflict (user_id, kind, ref_id, channel) where superseded_at is null do nothing
  returning id into v_log;

  if v_log is null or not v_enabled then return null; end if;   -- duplikat / dinonaktifkan

  insert into public.notifications (user_id, type, title, body, class_id, ref_id, data)
  values (p_user, p_type, p_title, p_body, p_class, p_ref, coalesce(p_data, '{}'::jsonb))
  returning id into v_notif;
  update public.notification_logs set notification_id = v_notif where id = v_log;
  return v_notif;
end $$;

-- Kirim notifikasi dari template resmi (teks persis, variabel diisi dari database)
create or replace function public.push_template(
  p_user uuid, p_kind text, p_vars jsonb, p_class uuid, p_ref uuid, p_setting text, p_data jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb := public.render_notification(p_kind, p_vars);
begin
  return public.push_notification(p_user, p_kind, r ->> 'title', r ->> 'body', p_class, p_ref, p_setting, p_data);
end $$;

-- 1. TUGAS BARU — guru membuat tugas -> semua siswa kelas tujuan
create or replace function public.tasks_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  for r in select user_id from public.class_members
            where class_id = new.class_id and member_role = 'siswa' loop
    perform public.push_template(
      r.user_id, 'new_task', public.task_template_vars(new.subject, new.title, new.deadline),
      new.class_id, new.id, 'new_task',
      jsonb_build_object('task_id', new.id, 'url', '#/tugas?task=' || new.id::text));
  end loop;
  return new;
end $$;
drop trigger if exists trg_tasks_after_insert on public.tasks;
create trigger trg_tasks_after_insert after insert on public.tasks
  for each row execute function public.tasks_after_insert();

-- 9. PERUBAHAN DEADLINE — guru mengubah tanggal/jam deadline.
-- Riwayat pengingat & pemberitahuan lama ditandai superseded (tetap tersimpan) sehingga pengingat
-- untuk deadline baru dievaluasi ulang. Hanya siswa yang masih Belum Selesai yang diberi tahu.
create or replace function public.tasks_after_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if new.deadline is distinct from old.deadline then
    update public.notification_logs set superseded_at = now()
     where ref_id = new.id and superseded_at is null
       and kind in ('reminder_h3','reminder_h1','reminder_h0','overdue','teacher_overdue','deadline_changed');
    if coalesce(current_setting('app.migrating', true), '') <> 'on' then
      for r in select cm.user_id from public.class_members cm
                left join public.task_status ts on ts.task_id = new.id and ts.student_id = cm.user_id
               where cm.class_id = new.class_id and cm.member_role = 'siswa'
                 and coalesce(ts.is_done, false) = false loop
        perform public.push_template(
          r.user_id, 'deadline_changed', public.task_template_vars(new.subject, new.title, new.deadline),
          new.class_id, new.id, 'reminder',
          jsonb_build_object('task_id', new.id, 'url', '#/tugas?task=' || new.id::text));
      end loop;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_after_update on public.tasks;
create trigger trg_tasks_after_update after update on public.tasks
  for each row execute function public.tasks_after_update();

-- 10. STATUS BERUBAH — siswa menandai Sudah Selesai -> konfirmasi hanya untuk siswa itu.
-- (Pengingat berikutnya otomatis batal: run_task_reminders & Edge Function memeriksa status saat kirim.)
create or replace function public.task_status_after_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare t record;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  if new.is_done is not true then return new; end if;
  if tg_op = 'UPDATE' and old.is_done is true then return new; end if;     -- bukan perubahan status
  select id, class_id, subject, title, deadline into t from public.tasks where id = new.task_id;
  if not found then return new; end if;
  -- selesai -> batal -> selesai lagi = perubahan baru yang sah: riwayat lama ditandai superseded
  update public.notification_logs set superseded_at = now()
   where user_id = new.student_id and ref_id = new.task_id and kind = 'status_updated' and superseded_at is null;
  perform public.push_template(
    new.student_id, 'status_updated', public.task_template_vars(t.subject, t.title, t.deadline),
    t.class_id, new.task_id, null,
    jsonb_build_object('task_id', new.task_id, 'url', '#/tugas?task=' || new.task_id::text));
  return new;
end $$;
drop trigger if exists trg_task_status_notify on public.task_status;
create trigger trg_task_status_notify after insert or update on public.task_status
  for each row execute function public.task_status_after_write();

-- 7. PENGUMUMAN — guru membuat pengumuman baru -> siswa kelas tujuan
create or replace function public.announcements_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  for r in select user_id from public.class_members
            where class_id = new.class_id and member_role = 'siswa' loop
    perform public.push_template(
      r.user_id, 'announcement', '{}'::jsonb, new.class_id, new.id, 'announcement',
      jsonb_build_object('announcement_id', new.id, 'url', '#/pengumuman?id=' || new.id::text));
  end loop;
  return new;
end $$;
drop trigger if exists trg_announcements_after_insert on public.announcements;
create trigger trg_announcements_after_insert after insert on public.announcements
  for each row execute function public.announcements_after_insert();

-- 6. NEW TASK ALERT — siswa baru bergabung ke kelas yang sudah punya tugas aktif (belum lewat deadline).
-- Satu notifikasi per siswa per kelas (teks template bersifat umum). Tugas yang dibuat SETELAH siswa
-- bergabung memakai template #1 (Misi Baru), jadi siswa tidak pernah menerima dua notifikasi untuk satu tugas.
create or replace function public.class_members_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  if new.member_role <> 'siswa' then return new; end if;
  if exists (select 1 from public.tasks t
              where t.class_id = new.class_id and t.deadline > now()) then
    perform public.push_template(
      new.user_id, 'new_task_alert', '{}'::jsonb, new.class_id, new.class_id, 'new_task',
      jsonb_build_object('url', '#/tugas'));
  end if;
  return new;
end $$;
drop trigger if exists trg_class_members_after_insert on public.class_members;
create trigger trg_class_members_after_insert after insert on public.class_members
  for each row execute function public.class_members_after_insert();

-- 8. JADWAL UJIAN — dikirim oleh run_task_reminders() sehari sebelum ujian (lihat 07).
-- Notifikasi "jadwal baru" versi lama dihapus karena tidak termasuk template resmi.
drop trigger if exists trg_schedules_after_insert on public.schedules;
drop function if exists public.schedules_after_insert();
-- Tanggal ujian diubah -> peringatan H-1 dievaluasi ulang untuk tanggal baru
create or replace function public.schedules_after_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.event_date is distinct from old.event_date then
    update public.notification_logs set superseded_at = now()
     where ref_id = new.id and superseded_at is null and kind = 'exam_alert';
  end if;
  return new;
end $$;
drop trigger if exists trg_schedules_after_update on public.schedules;
create trigger trg_schedules_after_update after update on public.schedules
  for each row execute function public.schedules_after_update();

-- Notifikasi baru -> panggil Edge Function "send-push" (Web Push) bila sudah dikonfigurasi
create or replace function public.notifications_push_hook() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text; v_secret text;
begin
  if coalesce(current_setting('app.migrating', true), '') = 'on' then return new; end if;
  select value into v_url    from public.app_config where key = 'push_function_url';
  select value into v_secret from public.app_config where key = 'push_webhook_secret';
  if v_url is null or v_secret is null or to_regnamespace('net') is null then return new; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using v_url, jsonb_build_object('notification_id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret);
  exception when others then
    null;   -- kegagalan push tidak boleh menggagalkan pembuatan notifikasi
  end;
  return new;
end $$;
drop trigger if exists trg_notifications_push on public.notifications;
create trigger trg_notifications_push after insert on public.notifications
  for each row execute function public.notifications_push_hook();

alter table public.notifications         enable row level security;
alter table public.notification_logs     enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_subscriptions    enable row level security;

-- notifications: hanya pemilik; klien hanya boleh mengubah read_at (lihat GRANT di bawah)
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- notification_logs: milik sendiri, atau guru kelas terkait
drop policy if exists notification_logs_select on public.notification_logs;
create policy notification_logs_select on public.notification_logs for select to authenticated
  using (user_id = auth.uid() or (class_id is not null and public.is_class_teacher(class_id)));
-- notification_settings & push_subscriptions: milik sendiri
drop policy if exists notification_settings_all on public.notification_settings;
create policy notification_settings_all on public.notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists push_subscriptions_all on public.push_subscriptions;
create policy push_subscriptions_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notifications, public.notification_logs, public.notification_settings, public.push_subscriptions from anon, authenticated;
grant select, delete, update (read_at)  on public.notifications         to authenticated;
grant select                            on public.notification_logs     to authenticated;
grant select, insert, update            on public.notification_settings to authenticated;
grant select, insert, delete            on public.push_subscriptions    to authenticated;
grant all on public.notifications, public.notification_logs, public.notification_settings, public.push_subscriptions to service_role;
revoke all on function public.push_notification(uuid, text, text, text, uuid, uuid, text, jsonb),
  public.push_template(uuid, text, jsonb, uuid, uuid, text, jsonb),
  public.render_notification(text, jsonb), public.task_template_vars(text, text, timestamptz),
  public.tasks_after_insert(), public.tasks_after_update(), public.task_status_after_write(),
  public.announcements_after_insert(), public.class_members_after_insert(), public.schedules_after_update(),
  public.notifications_push_hook() from public, anon, authenticated;
revoke all on public.notification_templates from anon, authenticated;
grant all on public.notification_templates to service_role;
