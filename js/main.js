/* ===== Shell aplikasi: boot, router, navigasi, notifikasi browser, event delegation ===== */
const NAV = [
  { id: 'dashboard',  icon: 'fa-home',         label: 'Dashboard' },
  { id: 'tugas',      icon: 'fa-tasks',        label: 'Semua Tugas', badge: 'tugas' },
  { id: 'tugas-baru', icon: 'fa-plus-circle',  label: 'Buat Tugas',  role: 'guru' },
  { id: 'monitor',    icon: 'fa-list-check',   label: 'Task Monitor', role: 'guru' },
  { id: 'insights',   icon: 'fa-chart-pie',    label: 'Class Insights', role: 'guru' },
  { id: 'jadwal',     icon: 'fa-calendar-days',label: 'Jadwal' },
  { id: 'pengumuman', icon: 'fa-bullhorn',     label: 'Pengumuman' },
  { id: 'notifikasi', icon: 'fa-bell',         label: 'Notifikasi', badge: 'notif' },
  { id: 'aktivitas',  icon: 'fa-clock-rotate-left', label: 'Aktivitas' },
  { id: 'kelas',      icon: 'fa-school',       label: 'Kelas' },
  { id: 'profil',     icon: 'fa-user-gear',    label: 'Profil' },
];
const NO_RERENDER = new Set(['tugas-baru', 'profil']);   // halaman berformulir
let currentRoute = 'dashboard', currentParams = {};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, ''), [path, q] = h.split('?');
  return { route: path || 'dashboard', params: Object.fromEntries(new URLSearchParams(q || '')) };
}
function go(route, params) {
  const q = params ? '?' + new URLSearchParams(params) : '';
  const next = '#/' + route + q;
  if (location.hash === next) renderRoute(); else location.hash = next;
}

function renderNav() {
  $('#sidebarNav').innerHTML = NAV.filter(n => !n.role || n.role === state.me.role).map(n =>
    `<a href="#/${n.id}" class="nav-item ${n.id === currentRoute ? 'active' : ''}" data-nav="${n.id}">
       <i class="fas ${n.icon}"></i><span>${n.label}</span>${n.badge ? `<span class="nav-badge" data-badge="${n.badge}" style="display:none">0</span>` : ''}
     </a>`).join('');
  updateBadges();
}
function updateBadges() {
  const un = unreadCount();
  $$('[data-badge="notif"]').forEach(b => { b.textContent = un > 99 ? '99+' : un; b.style.display = un ? '' : 'none'; });
  const belum = !isGuru() ? scopedTasks().filter(t => !myDone(t.id) && !isOverdue(t)).length : 0;
  $$('[data-badge="tugas"]').forEach(b => { b.textContent = belum; b.style.display = belum ? '' : 'none'; });
  const dot = $('#notifDot'); if (dot) { dot.textContent = un > 9 ? '9+' : un || ''; dot.classList.toggle('show', un > 0); }
}
function renderClassPicker() {
  const sel = $('#classPicker');
  sel.innerHTML = `<option value="all">Semua kelas</option>` + state.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.value = state.activeClass;
  $('#classPickerWrap').style.display = state.classes.length > 1 ? '' : 'none';
}
function renderUserBox() {
  const me = state.me;
  $('#sidebarAvatar').innerHTML = avatarHTML(me, 42);
  $('#topbarAvatar').innerHTML = avatarHTML(me, 38);
  $('#sidebarName').textContent = me.full_name;
  $('#sidebarRole').textContent = me.role === 'guru' ? '👑 Guru' : '🎓 Siswa';
}

function renderRoute() {
  const { route, params } = parseHash();
  currentRoute = VIEWS[route] ? route : 'dashboard'; currentParams = params;
  if ((currentRoute === 'tugas-baru' || currentRoute === 'monitor' || currentRoute === 'insights') && !isGuru()) currentRoute = 'dashboard';
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === currentRoute));
  const view = $('#view');
  const fn = VIEWS[currentRoute] || VIEWS.dashboard;
  view.classList.remove('view-in'); void view.offsetWidth; view.classList.add('view-in');
  fn(view, currentParams);
  if (innerWidth <= 900) closeSidebar();
  window.scrollTo({ top: 0 });
}
const rerenderSoft = debounce(() => {
  if (NO_RERENDER.has(currentRoute)) return;
  const y = window.scrollY; VIEWS[currentRoute]?.($('#view'), currentParams, true); window.scrollTo({ top: y });
  refreshOpenModal();
}, 120);

function toggleSidebar() { $('#sidebar').classList.toggle('open'); $('#sidebarOverlay').classList.toggle('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarOverlay').classList.remove('show'); }

/* ===== Reaksi Realtime ===== */
function onRealtime(table, p) {
  if (table === 'notifications' && p.eventType === 'INSERT') {
    const n = p.new;
    if (n.type !== 'status_updated') showToast(n.title, 'info');     // aksi sendiri sudah punya toast
    browserNotify(n);
  }
  if (table === 'task_status' && p.eventType !== 'DELETE' && isGuru()) {
    const s = p.new, st = state.profiles.get(s.student_id), t = state.tasks.find(x => x.id === s.task_id);
    if (st && t) { flashRow = s.task_id + '|' + s.student_id; setTimeout(() => flashRow = null, 2500); }
  }
  updateBadges(); renderClassPicker();
  rerenderSoft();
}
let flashRow = null;

/* ===== Notifikasi browser (saat tab terbuka / di latar) ===== */
async function browserNotify(n) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;   // sudah terlihat di aplikasi
  // tidak ada pengecualian untuk push server: `tag: n.id` membuat notifikasi yang sama saling menggantikan (tidak ganda),
  // dan notifikasi tetap tampil walau push server belum berfungsi.
  const opts = { body: n.body, tag: n.id, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', vibrate: [200, 100, 200],
                 data: { url: location.origin + location.pathname + (n.data?.url || '#/notifikasi') } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(n.title, opts); else new Notification(n.title, opts);
  } catch {}
}

/* Deep link dari notifikasi: hash rute, mis. "#/tugas?task=<id>". Bila hash sama, render ulang agar modal terbuka. */
function openDeepLink(hash) {
  if (!state.session || !state.loaded) { location.hash = hash; return; }
  if (location.hash === hash) renderRoute(); else location.hash = hash;
}

/* ===== Boot ===== */
async function boot() {
  const st = initSupabase();
  if (st !== 'ok') return showSetupPage(st);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // klik notifikasi saat aplikasi sudah terbuka -> buka halaman tujuan (deep link)
    navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'tk-open' && e.data.hash) openDeepLink(e.data.hash); if (e.data?.type === 'tk-resync-push') syncPush(); });
  }

  sb.auth.onAuthStateChange((evt, session) => {
    if (evt === 'SIGNED_OUT') return onSignedOut();
    if ((evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION') && session && !state.session) {
      state.session = session;
      setTimeout(initApp, 0);                  // hindari deadlock di dalam callback auth
    }
  });
  const { data } = await sb.auth.getSession();
  if (!data.session) { $('#loadingScreen').classList.add('hidden'); $('#loginPage').classList.add('active'); }
}

/* Pengingat deadline: server (pg_cron) tetap yang utama; ini hanya memastikan pengingat yang jatuh tempo tidak terlewat
   (saat aplikasi dibuka, tiap 5 menit selama terbuka, dan saat kembali ke aplikasi). Idempoten di server. */
let reminderFallbackOn = false;
function startReminderFallback() {
  runMyReminders();
  if (reminderFallbackOn) return;
  reminderFallbackOn = true;
  setInterval(runMyReminders, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runMyReminders(); });
}

async function initApp() {
  $('#loadingScreen').classList.remove('hidden'); $('#loadingMsg').textContent = 'Memuat data...';
  $('#loginPage').classList.remove('active');
  try {
    await loadAll();
    if (!state.me) throw new Error('Profil tidak ditemukan. Jalankan file di folder sql/ (00 → 09) di Supabase.');
  } catch (e) {
    console.error(e);
    $('#loadingScreen').classList.add('hidden');
    $('#loginPage').classList.add('active');
    showErr('#loginError', 'Gagal memuat data: ' + errMsg(e));
    state.session = null; await sb.auth.signOut().catch(() => {});
    return;
  }
  $('#appPage').classList.add('active');
  $('#loadingScreen').classList.add('hidden');
  renderUserBox(); renderNav(); renderClassPicker();
  subscribeRealtime();
  chatReset();
  syncPush();                                                  // perbarui langganan push perangkat ini (bila aktif)
  startReminderFallback();                                     // cadangan pengingat deadline bila pg_cron belum aktif
  renderPushBanner();
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
  renderRoute();
  setInterval(() => { if (state.session && !NO_RERENDER.has(currentRoute)) rerenderSoft(); }, 60000);
}

function onSignedOut() {
  state.session = null; state.loaded = false; unsubscribeRealtime();
  Object.assign(state, { me: null, classes: [], members: [], tasks: [], statuses: [], announcements: [], schedules: [], notifications: [], activity: [], logs: [] });
  $('#pushBanner')?.remove(); $('#appPage').classList.remove('active'); $('#loadingScreen').classList.add('hidden');
  $('#loginPage').classList.add('active');
  $('#loginPassword').value = ''; closeModal(); setRTStatus('offline'); location.hash = '';
}

function showSetupPage(why) {
  $('#loadingScreen').classList.add('hidden');
  document.body.innerHTML = `<div class="setup-page"><div class="setup-card"><div style="font-size:48px">⚙️</div>
    <h2>${why === 'lib' ? 'Library Supabase gagal dimuat' : 'Konfigurasi Supabase diperlukan'}</h2>
    <p>${why === 'lib' ? 'Periksa koneksi internet atau pemblokir skrip, lalu muat ulang.' : 'Isi <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON</code> di <code>js/config.js</code>, lalu jalankan file di folder <code>sql/</code> (urut 00 → 09) di SQL Editor Supabase. Lihat PANDUAN_SETUP.md.'}</p></div></div>`;
}

/* ===== Event delegation ===== */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-action]'); if (!a) {
    if (!e.target.closest('#notifPanel,#notifBtn')) $('#notifPanel')?.classList.add('hidden');
    return;
  }
  const act = a.dataset.action;
  if (ACTIONS[act]) { e.preventDefault(); ACTIONS[act](a, e); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('#notifPanel')?.classList.add('hidden'); } });
window.addEventListener('hashchange', () => { if (state.session && state.loaded) renderRoute(); });
window.addEventListener('DOMContentLoaded', () => {
  $('#modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });
  $('#classPicker').addEventListener('change', e => {
    state.activeClass = e.target.value; try { localStorage.setItem('tk_class', state.activeClass); } catch {}
    updateBadges(); renderRoute();
  });
  $('#searchInput').addEventListener('input', debounce(() => {
    if (currentRoute === 'tugas') VIEWS.tugas($('#view'), currentParams, true);
    else if ($('#searchInput').value.trim()) go('tugas');      // kolom kosong tidak boleh memindahkan halaman
  }, 250));
  boot();
});

Object.assign(ACTIONS, {
  login: handleLogin, daftar: handleDaftar, logout: handleLogout,
  tab: a => switchTab(a.dataset.tab),
  togglePass: a => { const i = $('#' + a.dataset.target); const p = i.type === 'password'; i.type = p ? 'text' : 'password'; $('i', a).className = p ? 'fas fa-eye-slash' : 'fas fa-eye'; },
  sidebar: toggleSidebar, closeModal,
  bell: () => { const p = $('#notifPanel'); if (p.classList.toggle('hidden') === false) renderNotifPanel(); },
  go: a => { $('#notifPanel').classList.add('hidden'); go(a.dataset.route, a.dataset.id ? { [a.dataset.key || 'id']: a.dataset.id } : undefined); },
  chatToggle: () => $('#chatbotBox').classList.toggle('hidden'),
  chatSend: sendChat,
});

/* Enter untuk login & pemilih peran */
document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'loginUsername' || e.target.id === 'loginPassword')) handleLogin(); if (e.key === 'Enter' && e.target.id === 'chatInput') sendChat(); });
document.addEventListener('change', e => { if (e.target.name === 'daftarRole') updateRolePicker(); });
