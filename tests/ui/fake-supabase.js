/* Klien Supabase PALSU untuk uji UI (tanpa jaringan). Data disimpan di localStorage, mutasi
   disiarkan antar-tab lewat BroadcastChannel agar alur realtime bisa diuji. Tidak menegakkan RLS
   (RLS diuji di tests/db). */
(function () {
  const KEY = 'fakeDB', bc = new BroadcastChannel('fakedb');
  const as = new URLSearchParams(location.search).get('as');
  const now = () => new Date().toISOString(), uid = () => crypto.randomUUID();
  const day = n => new Date(Date.now() + n * 864e5).toISOString();
  function seed() {
    const P = (id, username, full_name, role) => ({ id, username, full_name, role, avatar_url: null, created_at: now() });
    const g = P('g1', 'bunita', 'Bu Nita', 'guru'), s1 = P('s1', 'dina', 'Dina Putri', 'siswa'), s2 = P('s2', 'ekoprast', 'Eko Prasetyo', 'siswa'), s3 = P('s3', 'budi', 'Budi Santoso', 'siswa');
    return {
      users: [g, s1, s2, s3].map(p => ({ id: p.id, email: p.username + '@tugasku.local', password: 'rahasia1' })),
      profiles: [g, s1, s2, s3],
      classes: [{ id: 'c1', name: 'XII-C', description: null, join_code: 'ABCD1234', created_by: 'g1', created_at: now() },
                { id: 'c2', name: 'XII-D', description: null, join_code: 'ZZZZ9999', created_by: 'g1', created_at: now() }],
      class_members: [['c1', 'g1', 'guru'], ['c2', 'g1', 'guru'], ['c1', 's1', 'siswa'], ['c1', 's2', 'siswa'], ['c1', 's3', 'siswa']].map(([c, u, r]) => ({ class_id: c, user_id: u, member_role: r, joined_at: now() })),
      tasks: [
        { id: 't1', class_id: 'c1', title: 'Laporan <b>IPA</b>', subject: 'IPA', description: 'Tulis laporan praktikum', assigned_date: '2026-10-30', deadline: day(3), created_by: 'g1', created_at: now(), updated_at: now() },
        { id: 't2', class_id: 'c1', title: 'PR Matematika', subject: 'Matematika', description: 'Hal 45', assigned_date: '2026-10-20', deadline: day(-1), created_by: 'g1', created_at: now(), updated_at: now() },
        { id: 't3', class_id: 'c1', title: 'Esai Bahasa', subject: 'Bahasa Indonesia', description: '', assigned_date: '2026-10-30', deadline: day(1), created_by: 'g1', created_at: now(), updated_at: now() }],
      task_status: [{ task_id: 't2', student_id: 's1', is_done: true, updated_at: day(-2) }, { task_id: 't1', student_id: 's2', is_done: true, updated_at: day(-0.1) }],
      announcements: [{ id: 'a1', class_id: 'c1', title: 'UTS Minggu Depan', body: 'Siapkan diri\nBelajar ya', is_important: true, created_by: 'g1', created_at: now(), updated_at: now() }],
      schedules: [{ id: 'sc1', class_id: 'c1', title: 'UTS Matematika', description: null, kind: 'ujian', subject: 'Matematika', event_date: new Date(Date.now() + 2 * 864e5 + 252e5).toISOString().slice(0, 10), start_time: '08:00:00', end_time: '09:30:00', created_by: 'g1', created_at: now(), updated_at: now() }],
      notifications: [
        { id: 'n1', user_id: 's1', type: 'new_task', title: '📚 Misi Baru Telah Tiba!', body: 'Guru baru saja memberikan tugas IPA. Jangan sampai tertinggal! Buka TugasKu dan cek detail tugasmu.', class_id: 'c1', ref_id: 't1', data: { task_id: 't1' }, read_at: null, created_at: now() },
        { id: 'n2', user_id: 's1', type: 'reminder_h1', title: '🚨 BESOK DEADLINE!', body: 'Tugas Bahasa Indonesia masih menunggumu! Waktu tersisa hanya 24 jam. Pastikan tugasmu selesai sebelum batas waktu berakhir.', class_id: 'c1', ref_id: 't3', data: { task_id: 't3' }, read_at: null, created_at: now() },
        { id: 'n3', user_id: 'g1', type: 'teacher_overdue', title: '⚠️ PERHATIAN! TUGAS BELUM SELESAI', body: 'Tugas PR Matematika', class_id: 'c1', ref_id: 't2', data: { task_id: 't2' }, read_at: null, created_at: now() }],
      notification_settings: [], activity_logs: [], notification_logs: [], push_subscriptions: [],
    };
  }
  let db = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();
  const save = () => localStorage.setItem(KEY, JSON.stringify(db));
  if (!localStorage.getItem(KEY)) save();
  window.__fakeDB = () => db;

  let current = as ? db.users.find(u => u.email.startsWith(as + '@')) : (() => { const s = sessionStorage.getItem('fakeUser'); return s ? db.users.find(u => u.id === s) : null; })();
  const sessionObj = () => current ? { access_token: 'x', user: { id: current.id, email: current.email } } : null;
  const handlers = [], authCbs = [];
  const PK = { task_status: r => r.task_id + '|' + r.student_id, class_members: r => r.class_id + '|' + r.user_id };
  const key = (t, r) => (PK[t] || (x => x.id))(r);
  const me = () => db.profiles.find(p => p.id === current?.id);

  function emit(table, eventType, row, old) {
    bc.postMessage({ table, eventType, row, old });
    fire(table, eventType, row, old);
  }
  function fire(table, eventType, row, old) {
    handlers.filter(h => h.table === table).forEach(h => {
      if (h.filter) { const [k, v] = h.filter.split('=eq.'); if (row[k] !== v) return; }
      setTimeout(() => h.cb({ eventType, new: row, old: old || {} }), 5);
    });
  }
  bc.onmessage = e => { db = JSON.parse(localStorage.getItem(KEY)); fire(e.data.table, e.data.eventType, e.data.row, e.data.old); };

  // pengganti trigger database
  function afterInsert(table, r) {
    if (table === 'tasks') db.class_members.filter(m => m.class_id === r.class_id && m.member_role === 'siswa').forEach(m => {
      const n = { id: uid(), user_id: m.user_id, type: 'new_task', title: '📚 Misi Baru Telah Tiba!', body: `Guru baru saja memberikan tugas ${r.subject}. Jangan sampai tertinggal! Buka TugasKu dan cek detail tugasmu.`, class_id: r.class_id, ref_id: r.id, data: { task_id: r.id, url: '#/tugas?task=' + r.id }, read_at: null, created_at: now() };
      db.notifications.unshift(n); emit('notifications', 'INSERT', n);
    });
    if (table === 'classes') { const m = { class_id: r.id, user_id: r.created_by, member_role: 'guru', joined_at: now() }; db.class_members.push(m); emit('class_members', 'INSERT', m); }
  }

  function run(q) {
    const t = q.table; let rows = db[t] || (db[t] = []);
    const match = r => q.filters.every(f => f(r));
    const visible = rows => {                         // pembatasan seperlunya (meniru RLS agar UI tidak bergantung pada data terlarang)
      const m = me(); if (t === 'notifications' && m) return rows.filter(r => r.user_id === m.id);
      if (!m || m.role === 'guru') return rows;
      if (t === 'profiles') return rows.filter(p => p.id === m.id || p.role === 'guru');
      if (t === 'class_members') return rows.filter(r => r.user_id === m.id);
      if (t === 'task_status') return rows.filter(r => r.student_id === m.id);
      if (t === 'activity_logs') return rows.filter(r => r.user_id === m.id);
      return rows;
    };
    let out, err = null;
    if (q.op === 'select') { out = visible(rows).filter(match); }
    else if (q.op === 'insert' || q.op === 'upsert') {
      out = [];
      for (const raw of q.rows) {
        const r = { ...raw };
        if (!r.id && !['task_status', 'class_members', 'notification_settings'].includes(t)) r.id = uid();
        if (t === 'classes') r.join_code = r.join_code || ('J' + uid().slice(0, 7).toUpperCase());
        r.created_at ||= now();
        const pk = t === 'notification_settings' ? (x => x.user_id) : (x => key(t, x));
        const ex = rows.find(x => pk(x) === pk(r));
        if (ex) { if (q.op === 'insert') { err = { message: 'duplicate key value violates unique constraint' }; break; } Object.assign(ex, r, t === 'task_status' ? { updated_at: now() } : {}); out.push(ex); emit(t, 'UPDATE', ex); }
        else { if (t === 'task_status') r.updated_at = now(); rows.push(r); out.push(r); emit(t, 'INSERT', r); afterInsert(t, r); if (t === 'task_status') { const task = db.tasks.find(x => x.id === r.task_id); const a = { id: uid(), class_id: task.class_id, user_id: r.student_id, task_id: r.task_id, task_title: task.title, action: r.is_done ? 'mark_done' : 'mark_undone', created_at: now() }; db.activity_logs.unshift(a); emit('activity_logs', 'INSERT', a); } }
        if (t === 'task_status' && ex) { const task = db.tasks.find(x => x.id === ex.task_id); const a = { id: uid(), class_id: task.class_id, user_id: ex.student_id, task_id: ex.task_id, task_title: task.title, action: ex.is_done ? 'mark_done' : 'mark_undone', created_at: now() }; db.activity_logs.unshift(a); emit('activity_logs', 'INSERT', a); }
      }
    } else if (q.op === 'update') { out = rows.filter(match); out.forEach(r => { const old = { ...r }; Object.assign(r, q.patch); emit(t, 'UPDATE', r, old); }); }
    else if (q.op === 'delete') { out = rows.filter(match); db[t] = rows.filter(r => !match(r)); out.forEach(r => emit(t, 'DELETE', {}, r)); if (t === 'tasks') out.forEach(o => { db.task_status = db.task_status.filter(s => s.task_id !== o.id); }); }
    if (q.order) { const [k, asc] = q.order; out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
    if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
    if (q.limit) out = out.slice(0, q.limit);
    save();
    if (err) return { data: null, error: err };
    if (q.single) return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'no rows' } };
    if (q.maybe) return { data: out[0] || null, error: null };
    return { data: (q.op === 'select' || q.returning) ? JSON.parse(JSON.stringify(out)) : null, error: null };
  }
  function from(table) {
    const q = { table, op: 'select', filters: [], returning: false };
    const b = {
      select() { q.returning = true; return b; }, insert(r) { q.op = 'insert'; q.rows = [].concat(r); return b; },
      update(p) { q.op = 'update'; q.patch = p; return b; }, upsert(r) { q.op = 'upsert'; q.rows = [].concat(r); return b; }, delete() { q.op = 'delete'; return b; },
      eq(k, v) { q.filters.push(r => r[k] === v); return b; }, in(k, a) { q.filters.push(r => a.includes(r[k])); return b; },
      order(k, o) { q.order = [k, !o || o.ascending !== false]; return b; }, limit(n) { q.limit = n; return b; }, range(a, z) { q.range = [a, z]; return b; },
      single() { q.single = true; return b; }, maybeSingle() { q.maybe = true; return b; },
      then(res, rej) { return Promise.resolve().then(() => run(q)).then(res, rej); },
    };
    return b;
  }
  const rpc = async (fn, a) => {
    const m = me();
    if (fn === 'username_available') return { data: !db.profiles.some(p => p.username === a.p_username), error: null };
    if (fn === 'register_account') {
      if (a.p_role === 'guru' && a.p_teacher_code !== 'KENZO') return { data: null, error: { message: 'Kode guru salah' } };
      const email = a.p_username + '@tugasku.local';
      if (db.users.some(u => u.email === email)) return { data: null, error: { message: 'Username sudah digunakan, coba yang lain!' } };
      const id = uid(); db.users.push({ id, email, password: a.p_password });
      db.profiles.push({ id, username: a.p_username, full_name: a.p_full_name, role: a.p_role === 'guru' ? 'guru' : 'siswa', avatar_url: null, created_at: now() }); save();
      return { data: null, error: null };
    }
    if (fn === 'join_class') { const c = db.classes.find(x => x.join_code === a.p_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()); if (!c) return { data: null, error: { message: 'Kode kelas tidak ditemukan' } };
      if (!db.class_members.some(x => x.class_id === c.id && x.user_id === m.id)) { const r = { class_id: c.id, user_id: m.id, member_role: 'siswa', joined_at: now() }; db.class_members.push(r); save(); emit('class_members', 'INSERT', r); } return { data: c.id, error: null }; }
    if (fn === 'log_task_view') { const t = db.tasks.find(x => x.id === a.p_task); const r = { id: uid(), class_id: t.class_id, user_id: m.id, task_id: t.id, task_title: t.title, action: 'view_task', created_at: now() }; db.activity_logs.unshift(r); save(); emit('activity_logs', 'INSERT', r); return { data: null, error: null }; }
    if (fn === 'regenerate_join_code') { const c = db.classes.find(x => x.id === a.p_class); c.join_code = 'NEWCODE' + Math.floor(Math.random() * 10); save(); return { data: c.join_code, error: null }; }
    return { data: null, error: { message: 'rpc tidak dikenal: ' + fn } };
  };
  const auth = {
    async getSession() { return { data: { session: sessionObj() } }; },
    onAuthStateChange(cb) { authCbs.push(cb); setTimeout(() => cb('INITIAL_SESSION', sessionObj()), 0); return { data: { subscription: {} } }; },
    async signInWithPassword({ email, password }) {
      const u = db.users.find(x => x.email === email && x.password === password);
      if (!u) return { data: {}, error: { message: 'Invalid login credentials' } };
      current = u; sessionStorage.setItem('fakeUser', u.id); authCbs.forEach(cb => cb('SIGNED_IN', sessionObj())); return { data: { session: sessionObj() }, error: null };
    },
    async signUp({ email, password, options }) {
      if (db.users.some(u => u.email === email)) return { data: {}, error: { message: 'User already registered' } };
      const id = uid(), d = options.data; if (d.role === 'guru' && d.teacher_code !== 'KENZO') return { data: {}, error: { message: 'Database error saving new user' } };
      db.users.push({ id, email, password }); db.profiles.push({ id, username: d.username, full_name: d.full_name, role: d.role === 'guru' ? 'guru' : 'siswa', avatar_url: null, created_at: now() }); save();
      current = db.users.find(u => u.id === id); sessionStorage.setItem('fakeUser', id); setTimeout(() => authCbs.forEach(cb => cb('SIGNED_IN', sessionObj())), 0); return { data: { session: sessionObj() }, error: null };
    },
    async signOut() { current = null; sessionStorage.removeItem('fakeUser'); authCbs.forEach(cb => cb('SIGNED_OUT', null)); return { error: null }; },
    async updateUser() { return { error: null }; },
  };
  const channel = () => { const c = { on(_t, cfg, cb) { handlers.push({ table: cfg.table, filter: cfg.filter, cb, ch: c }); return c; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 5); return c; } }; return c; };
  window.supabase = { createClient: () => ({ from, rpc, auth, channel, removeChannel: c => { for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i].ch === c) handlers.splice(i, 1); },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' } }) }) } }) };
})();
