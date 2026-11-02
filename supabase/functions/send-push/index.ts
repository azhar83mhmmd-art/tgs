// Edge Function "send-push": mengirim Web Push (Android/desktop) untuk satu baris notifications.
// Dipanggil oleh trigger database (pg_net) setiap ada notifikasi baru, sehingga push
// tetap terkirim saat website ditutup. Lihat PANDUAN_SETUP.md bagian "Web Push".
//
// Teks judul/isi sudah final dari template resmi di database (notification_templates);
// fungsi ini TIDAK membuat atau mengubah kalimat apa pun.
//
// Secrets yang dibutuhkan (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mis. mailto:admin@sekolah.sch.id),
//   PUSH_WEBHOOK_SECRET (sama dengan app_config.push_webhook_secret)
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY disediakan otomatis oleh Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Jenis yang hanya relevan selama siswa masih "Belum Selesai" (aturan 2 & 3).
const ONLY_IF_NOT_DONE = new Set(["reminder_h3", "reminder_h1", "reminder_h0", "overdue", "deadline_changed"]);

// Notifikasi tugas yang mendapat tombol aksi cepat di HP (butuh sql/17: kolom action_token)
const QUICK_TYPES = new Set(["new_task", "reminder_h3", "reminder_h1", "reminder_h0", "overdue", "deadline_changed"]);

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function writeLog(n: Record<string, any>, status: "sent" | "skipped" | "failed", detail: string) {
  // indeks unik parsial (user, kind, ref_id, channel): duplikat diabaikan -> tidak ada log ganda
  const { error } = await sb.from("notification_logs").insert({
    user_id: n.user_id, class_id: n.class_id, kind: n.type, ref_id: n.ref_id ?? n.id, channel: "push",
    status, detail, notification_id: n.id,
  });
  if (error && error.code !== "23505") console.error(error.message);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("PUSH_WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const { notification_id } = await req.json().catch(() => ({}));
  if (!notification_id) return new Response("bad request", { status: 400 });

  const { data: n } = await sb.from("notifications").select("*").eq("id", notification_id).maybeSingle();
  if (!n) return new Response("not found", { status: 404 });

  // Jangan kirim dua kali untuk notifikasi yang sama (mis. pemanggilan ulang)
  const { count: already } = await sb.from("notification_logs").select("id", { count: "exact", head: true })
    .eq("notification_id", n.id).eq("channel", "push");
  if (already) return json({ skipped: "sudah pernah diproses" });

  // Aturan 3: siswa sudah menandai Sudah Selesai sebelum push terkirim -> batalkan
  if (ONLY_IF_NOT_DONE.has(n.type) && n.ref_id) {
    const { data: st } = await sb.from("task_status").select("is_done")
      .eq("task_id", n.ref_id).eq("student_id", n.user_id).maybeSingle();
    if (st?.is_done) {
      await writeLog(n, "skipped", "siswa sudah menyelesaikan tugas");
      return json({ skipped: "sudah selesai" });
    }
  }

  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", n.user_id);
  if (!subs?.length) return json({ sent: 0, failed: 0, note: "tidak ada langganan push" });

  // Deep link: hash rute di dalam aplikasi (disimpan trigger di notifications.data.url)
  const hash = typeof n.data?.url === "string" && n.data.url.startsWith("#") ? n.data.url : "#/notifikasi";
  const quick = QUICK_TYPES.has(n.type) && n.ref_id && n.action_token;
  const payload = JSON.stringify({
    title: n.title, body: n.body, tag: n.id, url: "./" + hash, type: n.type,
    ...(quick ? { token: n.action_token, actions: [
      { action: "done", title: "Tandai selesai" },
      { action: "snooze", title: "Ingatkan 1 jam lagi" },
    ] } : {}),
  });

  let sent = 0, failed = 0;
  for (const s of subs) {
    try {
      // urgency "high": FCM mengantar segera (tembus mode hemat daya/Doze) agar langsung muncul di atas layar HP
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 86400, urgency: "high" },
      );
      sent++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); // langganan kedaluwarsa
    }
  }
  await writeLog(n, sent > 0 ? "sent" : "failed", `terkirim ${sent}, gagal ${failed}`);
  return json({ sent, failed });
});
