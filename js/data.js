/* ===== State, akses data Supabase, dan Realtime ===== */
const state = {
  me: null, session: null,
  classes: [], members: [], profiles: new Map(),
  tasks: [], statuses: [], announcements: [], schedules: [],
  notifications: [], activity: [], logs: [], books: [], booksReady: false, offline: false, offlineSavedAt: null,
  settings: { new_task: true, reminder: true, announcement: true, schedule: true, reminder_time: null },
  activeClass: 'all', loaded: false,
};
let sb = null, channel = null;

/* Penyimpanan sesi: "Ingat saya" -> localStorage, jika tidak -> sessionStorage */
const authStorage = {
  getItem: k => { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { (localStorage.getItem('tk_remember') === '0' ? sessionStorage : localStorage).setItem(k, v); } catch {} },
  removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} },
};

function initSupabase() {
  if (typeof supabase === 'undefined') return 'lib';
  if (!SUPABASE_URL || SUPABASE_URL.includes('GANTI') || SUPABASE_ANON.includes('GANTI')) return 'config';
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, storage: authStorage },
  });
  return 'ok';
}

/* Ambil semua baris (PostgREST membatasi 1000 baris/permintaan) */
async function fetchAll(build) {
  const out = [], size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

async function loadAll() {
  const uid = state.session.user.id;
  const [profiles, classes, members, tasks, statuses, anns, scheds, notifs, acts, settings, books] = await Promise.all([
    fetchAll(() => sb.from('profiles').select('*')),
    fetchAll(() => sb.from('classes').select('*').order('created_at')),
    fetchAll(() => sb.from('class_members').select('*')),
    fetchAll(() => sb.from('tasks').select('*').order('deadline')),
    fetchAll(() => sb.from('task_status').select('*')),
    fetchAll(() => sb.from('announcements').select('*').order('created_at', { ascending: false })),
    fetchAll(() => sb.from('schedules').select('*').order('event_date')),
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(200).then(r => { if (r.error) throw r.error; return r.data; }),
    sb.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(500).then(r => { if (r.error) throw r.error; return r.data; }),
    sb.from('notification_settings').select('*').eq('user_id', uid).maybeSingle().then(r => r.data),
    // Buku Dikumpul (sql/16): bila belum dijalankan, fitur lain tetap jalan
    fetchAll(() => sb.from('book_collections').select('*').order('collected_at', { ascending: false })).then(rows => ({ ok: true, rows })).catch(() => ({ ok: false, rows: [] })),
  ]);
  state.profiles = new Map(profiles.map(p => [p.id, p]));
  state.me = state.profiles.get(uid);
  Object.assign(state, { classes, members, tasks, statuses, announcements: anns, schedules: scheds, notifications: notifs, activity: acts });
  if (settings) state.settings = settings;
  state.books = books.rows; state.booksReady = books.ok;
  let saved = null; try { saved = localStorage.getItem('tk_class'); } catch {}
  state.activeClass = saved && (saved === 'all' || classes.some(c => c.id === saved)) ? saved : 'all';
  state.loaded = true;
}

/* ===== Selektor turunan ===== */
const isGuru = () => state.me?.role === 'guru';
const myClassIds = () => state.classes.map(c => c.id);
const scopeIds = () => state.activeClass === 'all' ? myClassIds() : [state.activeClass];
const className = id => state.classes.find(c => c.id === id)?.name || 'Kelas';
const scopedTasks = () => { const ids = new Set(scopeIds()); return state.tasks.filter(t => ids.has(t.class_id)); };
const scopedAnnouncements = () => { const ids = new Set(scopeIds()); return state.announcements.filter(a => ids.has(a.class_id)); };
const scopedSchedules = () => { const ids = new Set(scopeIds()); return state.schedules.filter(s => ids.has(s.class_id)); };
const studentsOfClass = cid => state.members.filter(m => m.class_id === cid && m.member_role === 'siswa')
  .map(m => state.profiles.get(m.user_id)).filter(Boolean)
  .sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'));
const statusRow = (taskId, studentId) => state.statuses.find(s => s.task_id === taskId && s.student_id === studentId);
const isDone = (taskId, studentId) => !!statusRow(taskId, studentId)?.is_done;
const myDone = taskId => isDone(taskId, state.me.id);
/* Status 3 tingkat per siswa: belum | proses | selesai. Baris lama tanpa kolom status diturunkan dari is_done. */
const TASK_STATUSES = ['belum', 'proses', 'selesai'];
const STATUS_LABEL = { belum: 'Belum Dikerjakan', proses: 'Sedang Dikerjakan', selesai: 'Sudah Selesai' };
const STATUS_PCT = { belum: 0, proses: 50, selesai: 100 };
const statusOf = (taskId, studentId) => { const r = statusRow(taskId, studentId); return !r ? 'belum' : (TASK_STATUSES.includes(r.status) ? r.status : r.is_done ? 'selesai' : 'belum'); };
const myStatus = taskId => statusOf(taskId, state.me.id);
const isOverdue = t => new Date(t.deadline) < new Date();
/* Statistik penyelesaian satu tugas (sisi guru) */
function taskProgress(t) {
  const studs = studentsOfClass(t.class_id);
  const done = studs.filter(s => isDone(t.id, s.id)).length;
  return { total: studs.length, done, belum: studs.length - done, pct: pct(done, studs.length) };
}
const unreadCount = () => state.notifications.filter(n => !n.read_at).length;

/* ===== Realtime ===== */
const RT_KEYS = { task_status: r => r.task_id + '|' + r.student_id, class_members: r => r.class_id + '|' + r.user_id };
const RT_LISTS = { tasks: 'tasks', task_status: 'statuses', announcements: 'announcements', schedules: 'schedules',
                   notifications: 'notifications', activity_logs: 'activity', classes: 'classes', class_members: 'members', book_collections: 'books' };
const keyOf = (table, r) => (RT_KEYS[table] || (x => x.id))(r);

function applyChange(table, p) {
  const list = state[RT_LISTS[table]];
  if (p.eventType === 'DELETE') {
    const old = p.old || {};
    const idx = list.findIndex(r => keyOf(table, r) === keyOf(table, old) || (old.id && r.id === old.id));
    if (idx >= 0) list.splice(idx, 1);
    return;
  }
  const row = p.new, idx = list.findIndex(r => keyOf(table, r) === keyOf(table, row));
  if (idx >= 0) list[idx] = row;
  else if (table === 'notifications' || table === 'activity_logs' || table === 'announcements') list.unshift(row);
  else list.push(row);
}

function setRTStatus(s) {
  const dot = $('#rtDot'), txt = $('#rtStatus'); if (!dot) return;
  dot.className = 'rt-dot ' + (s === 'connected' ? 'connected' : s === 'error' ? 'error' : '');
  txt.textContent = s === 'connected' ? 'Real-time aktif' : s === 'error' ? 'Koneksi terputus' : s === 'connecting' ? 'Menghubungkan...' : 'Offline';
}

function subscribeRealtime() {
  unsubscribeRealtime();
  setRTStatus('connecting');
  const uid = state.session.user.id;
  channel = sb.channel('tugasku-' + uid);
  Object.keys(RT_LISTS).filter(t => t !== 'book_collections' || state.booksReady).forEach(table => {
    const cfg = { event: '*', schema: 'public', table };
    if (table === 'notifications') cfg.filter = `user_id=eq.${uid}`;
    channel.on('postgres_changes', cfg, async p => {
      applyChange(table, p);
      if (table === 'class_members' || table === 'classes') await refreshProfilesAndClasses();
      onRealtime(table, p);
    });
  });
  channel.subscribe(s => {
    if (s === 'SUBSCRIBED') setRTStatus('connected');
    else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setRTStatus('error');
    else if (s === 'CLOSED') setRTStatus('offline');
  });
}
function unsubscribeRealtime() { if (channel && sb) sb.removeChannel(channel); channel = null; }

async function refreshProfilesAndClasses() {
  const [p, c, m] = await Promise.all([
    fetchAll(() => sb.from('profiles').select('*')),
    fetchAll(() => sb.from('classes').select('*').order('created_at')),
    fetchAll(() => sb.from('class_members').select('*')),
  ]);
  state.profiles = new Map(p.map(x => [x.id, x])); state.me = state.profiles.get(state.session.user.id) || state.me;
  state.classes = c; state.members = m;
  if (state.activeClass !== 'all' && !c.some(x => x.id === state.activeClass)) state.activeClass = 'all';
}
