/* ===== Mode offline =====
   - Setelah data berhasil dimuat, salinan terakhir disimpan di IndexedDB (snapshot).
   - Tanpa internet: aplikasi tetap terbuka (kerangka dari service worker) dan menampilkan snapshot itu.
   - Status tugas yang diubah saat offline masuk antrean (outbox) dan disinkronkan otomatis begitu online.
   - Fitur lain yang menulis ke server menampilkan pesan "butuh internet" (tidak ada yang hilang diam-diam). */
const OFF = { db: null, pending: 0, flushing: false, saved: null };
const isOffline = () => state.offline || navigator.onLine === false;
const isNetErr = e => !!e && (e instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed|offline/i.test(e.message || String(e)));

/* ----- IndexedDB kecil: kv ----- */
const offDB = () => OFF.db || (OFF.db = new Promise((res, rej) => {
  const r = indexedDB.open('tugasku-offline', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
async function kvGet(k) {
  try { const db = await offDB(); return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error); }); } catch { return null; }
}
async function kvSet(k, v) {
  try { const db = await offDB(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch {}
}
async function kvDel(k) {
  try { const db = await offDB(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch {}
}
async function clearOfflineData() { await kvDel('snapshot'); await kvDel('outbox'); OFF.pending = 0; updateOfflineBar(); }   // dipanggil saat logout

/* ----- Snapshot data ----- */
async function saveSnapshot() {
  if (!state.loaded || !state.me || state.offline) return;
  await kvSet('snapshot', {
    uid: state.me.id, savedAt: new Date().toISOString(),
    profiles: [...state.profiles.values()], classes: state.classes, members: state.members, tasks: state.tasks,
    statuses: state.statuses, announcements: state.announcements, schedules: state.schedules,
    notifications: state.notifications.slice(0, 100), activity: state.activity.slice(0, 100),
    books: state.books, booksReady: state.booksReady, settings: state.settings,
  });
}
const saveSnapshotSoon = debounce(saveSnapshot, 2500);

function applySnapshot(s) {
  let saved = null; try { saved = localStorage.getItem('tk_class'); } catch {}
  Object.assign(state, {
    session: { user: { id: s.uid } }, profiles: new Map(s.profiles.map(p => [p.id, p])),
    classes: s.classes, members: s.members, tasks: s.tasks, statuses: s.statuses, announcements: s.announcements,
    schedules: s.schedules, notifications: s.notifications, activity: s.activity, books: s.books || [], booksReady: !!s.booksReady,
    settings: s.settings || state.settings, offline: true, offlineSavedAt: s.savedAt, loaded: true,
  });
  state.me = state.profiles.get(s.uid);
  state.activeClass = saved && (saved === 'all' || s.classes.some(c => c.id === saved)) ? saved : 'all';
}

/* ----- Klien Supabase "offline": penulisan/pembacaan lewat jaringan ditolak dengan pesan jelas ----- */
const OFFLINE_ERR = { message: 'Kamu sedang offline — fitur ini butuh internet.', code: 'OFFLINE' };
function offlineBuilder() {
  const p = new Proxy(function () {}, {
    get: (_, k) => k === 'then' ? (res, rej) => Promise.resolve({ data: null, error: OFFLINE_ERR }).then(res, rej) : () => p,
    apply: () => p,
  });
  return p;
}
function patchOfflineClient() {
  if (OFF.saved) return;
  const own = k => Object.prototype.hasOwnProperty.call(sb, k);
  OFF.saved = Object.fromEntries(['from', 'rpc', 'channel'].map(k => [k, own(k) ? { v: sb[k] } : null]));
  sb.from = () => offlineBuilder(); sb.rpc = () => offlineBuilder();
  sb.channel = () => { const c = { on: () => c, subscribe: () => c }; return c; };
}
function unpatchOfflineClient() {
  if (!OFF.saved) return;
  for (const k of ['from', 'rpc', 'channel']) { if (OFF.saved[k]) sb[k] = OFF.saved[k].v; else delete sb[k]; }
  OFF.saved = null;
}

/* ----- Antrean perubahan status ----- */
async function queueStatus(taskId, status) {
  const box = (await kvGet('outbox')) || [], me = state.me.id;
  const it = { task_id: taskId, student_id: me, status, at: new Date().toISOString() };
  const i = box.findIndex(x => x.task_id === taskId && x.student_id === me);
  if (i >= 0) box[i] = it; else box.push(it);
  await kvSet('outbox', box);
  OFF.pending = box.length; updateOfflineBar();
  return { data: { task_id: taskId, student_id: me, status, is_done: status === 'selesai', updated_at: it.at, _queued: true }, error: null };
}
async function applyOutboxToState() {
  const box = (await kvGet('outbox')) || []; OFF.pending = box.length;
  for (const it of box) {
    if (it.student_id !== state.me?.id) continue;
    const row = statusRow(it.task_id, it.student_id), patch = { status: it.status, is_done: it.status === 'selesai', updated_at: it.at };
    if (row) Object.assign(row, patch); else state.statuses.push({ task_id: it.task_id, student_id: it.student_id, ...patch });
  }
}
async function flushOutbox() {
  if (OFF.flushing || isOffline() || !state.session) return 0;
  const box = (await kvGet('outbox')) || [];
  if (!box.length) { OFF.pending = 0; updateOfflineBar(); return 0; }
  OFF.flushing = true; updateOfflineBar();
  let ok = 0, rejected = 0; const rest = [];
  for (const it of box) {
    if (it.student_id !== state.session.user.id) { rest.push(it); continue; }
    const { error } = await persistStatus(it.task_id, it.status, { noQueue: true });
    if (!error) ok++; else if (isNetErr(error)) rest.push(it); else rejected++;   // ditolak server (mis. tugas sudah dihapus) -> dibuang
  }
  await kvSet('outbox', rest); OFF.pending = rest.length; OFF.flushing = false;
  if (ok) showToast(`${ok} perubahan status offline berhasil disinkronkan.`, 'success');
  if (rejected) showToast(`${rejected} perubahan offline ditolak server dan dilewati.`, 'warning');
  updateOfflineBar();
  return ok;
}

/* ----- Spanduk status ----- */
function updateOfflineBar() {
  let bar = document.getElementById('offlineBar');
  const off = isOffline();
  if (!off && !OFF.pending) { bar?.remove(); document.body.classList.remove('has-offline-bar'); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'offlineBar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
  document.body.classList.add('has-offline-bar');
  bar.className = 'offline-bar' + (off ? '' : ' syncing');
  bar.innerHTML = off
    ? `<i class="fas fa-plane"></i><span>Mode offline — menampilkan data terakhir${state.offlineSavedAt ? ' (' + esc(fmtAgo(state.offlineSavedAt)) + ')' : ''}${OFF.pending ? ' · ' + OFF.pending + ' perubahan menunggu sinkron' : ''}</span>`
    : `<i class="fas fa-rotate"></i><span>Menyinkronkan ${OFF.pending} perubahan…</span>`;
}

/* ----- Masuk / keluar mode offline ----- */
let offlineTick = false;
function enterOffline(snap) {
  applySnapshot(snap); patchOfflineClient();
  $('#loginPage').classList.remove('active'); $('#loadingScreen').classList.add('hidden'); $('#appPage').classList.add('active');
  applyOutboxToState().then(() => {
    renderUserBox(); renderNav(); renderClassPicker(); setRTStatus('offline'); updateOfflineBar();
    if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
    renderRoute();
  });
  if (!offlineTick) { offlineTick = true; setInterval(() => { if (state.session && !NO_RERENDER.has(currentRoute)) rerenderSoft(); }, 60000); }
}
async function goOnline() {
  if (!state.session) { updateOfflineBar(); return; }
  if (!state.offline) { await flushOutbox(); updateOfflineBar(); runMyReminders(); return; }    // sesi tetap hidup: cukup sinkronkan antrean
  const { data } = await sb.auth.getSession().catch(() => ({ data: {} }));
  if (!data?.session) {                                                                         // sesi habis selama offline
    unpatchOfflineClient(); Object.assign(state, { offline: false, session: null, loaded: false });
    $('#appPage').classList.remove('active'); $('#loginPage').classList.add('active'); updateOfflineBar();
    showErr('#loginError', 'Sesi berakhir. Masuk lagi — perubahan yang kamu buat saat offline akan disinkronkan otomatis.');
    return;
  }
  unpatchOfflineClient(); state.offline = false; state.session = data.session;
  try {
    await flushOutbox(); await loadAll();
    subscribeRealtime(); syncPush(); renderUserBox(); renderNav(); renderClassPicker(); renderRoute();
    showToast('Kembali online — data disinkronkan.', 'success');
  } catch (e) { patchOfflineClient(); state.offline = true; showToast('Belum bisa menyinkronkan: ' + errMsg(e), 'warning'); }
  updateOfflineBar(); runMyReminders();
}
window.addEventListener('online', () => { updateOfflineBar(); goOnline(); });
window.addEventListener('offline', () => { updateOfflineBar(); setRTStatus('offline'); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'tk-refresh' && state.loaded && !isOffline()) loadAll().then(() => { updateBadges(); rerenderSoft(); }).catch(() => {}); });
