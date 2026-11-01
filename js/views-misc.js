/* ===== Pengumuman, Pusat Notifikasi, Aktivitas, Kelas, Profil ===== */

/* ---------- Pengumuman ---------- */
VIEWS.pengumuman = (el, params = {}, soft) => {
  const list = scopedAnnouncements();
  el.innerHTML = `<div class="section-header row-between"><div><h2><i class="fas fa-bullhorn"></i> Pengumuman</h2><p>Informasi dan pemberitahuan dari guru</p></div>
    ${isGuru() && state.classes.length ? `<button class="btn-primary" data-action="editAnn" data-id=""><i class="fas fa-plus"></i> Buat Pengumuman</button>` : ''}</div>
    ${!state.classes.length ? `<div class="card">${noClassState()}</div>` : !list.length ? emptyState('fa-bullhorn', 'Belum ada pengumuman') :
    `<div class="pengumuman-grid">${list.map(a => { const by = state.profiles.get(a.created_by);
      return `<div class="pengumuman-card ${a.is_important ? 'penting' : ''}" id="ann-${a.id}"><div class="pengumuman-card-header">
        <div class="pengumuman-icon-wrap">${a.is_important ? '🚨' : '📢'}</div>
        <div class="pengumuman-meta"><div class="pengumuman-judul">${esc(a.title)}</div><div class="pengumuman-info">${esc(by?.full_name || 'Guru')} · ${fmtDateTime(a.created_at)} ${kelasTag(a.class_id)}</div></div>
        ${a.is_important ? '<span class="badge-penting">⚡ Penting</span>' : ''}
        ${isGuru() ? `<button class="btn-icon" data-action="editAnn" data-id="${a.id}" aria-label="Edit"><i class="fas fa-pen"></i></button><button class="btn-icon-danger" data-action="deleteAnn" data-id="${a.id}" aria-label="Hapus"><i class="fas fa-trash"></i></button>` : ''}</div>
        <div class="pengumuman-isi">${nl2br(a.body)}</div></div>`; }).join('')}</div>`}`;
  if (params.id && !soft) {                       // deep link dari notifikasi: #/pengumuman?id=<id>
    const id = params.id; history.replaceState(null, '', location.pathname + location.search + '#/pengumuman'); currentParams = {};
    setTimeout(() => document.getElementById('ann-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }
};
ACTIONS.editAnn = a => {
  const x = a.dataset.id ? state.announcements.find(i => i.id === a.dataset.id) : null;
  const def = state.activeClass !== 'all' ? [state.activeClass] : state.classes.length === 1 ? [state.classes[0].id] : [];
  openModal(`<div class="modal-title">${x ? 'Edit Pengumuman' : 'Buat Pengumuman'}</div><div class="form-grid">
    <div class="form-group col-2"><label>Kelas Tujuan *</label><div class="check-list">${state.classes.map(c => `<label class="check-item"><input type="checkbox" name="aClass" value="${c.id}" ${x ? (x.class_id === c.id ? 'checked' : 'disabled') : def.includes(c.id) ? 'checked' : ''}> <span>${esc(c.name)}</span></label>`).join('')}</div></div>
    <div class="form-group col-2"><label>Judul *</label><input id="aTitle" maxlength="120" value="${esc(x?.title || '')}"></div>
    <div class="form-group col-2"><label>Isi *</label><textarea id="aBody" rows="5">${esc(x?.body || '')}</textarea></div>
    <div class="form-group col-2"><label class="check-item"><input type="checkbox" id="aImp" ${x?.is_important ? 'checked' : ''}> <span>🚨 Tandai sebagai pengumuman penting</span></label></div></div>
    <div id="aErr" class="alert alert-error hidden"><i class="fas fa-exclamation-circle"></i> <span></span></div>
    <div class="modal-actions"><button class="btn-secondary" data-action="closeModal">Batal</button><button class="btn-primary" data-action="saveAnn" data-id="${x?.id || ''}"><i class="fas fa-paper-plane"></i> ${x ? 'Simpan' : 'Kirim'}</button></div>`);
};
ACTIONS.saveAnn = async a => {
  const id = a.dataset.id, title = $('#aTitle').value.trim(), body = $('#aBody').value.trim(), imp = $('#aImp').checked;
  const classes = $$('input[name="aClass"]:checked').map(i => i.value);
  if (!classes.length) return showErr('#aErr', 'Pilih minimal satu kelas!');
  if (!title || !body) return showErr('#aErr', 'Judul dan isi wajib diisi!');
  setBtnLoading(a, true, 'Mengirim...');
  let r;
  if (id) r = await sb.from('announcements').update({ title, body, is_important: imp }).eq('id', id).select();
  else r = await sb.from('announcements').insert(classes.map(class_id => ({ class_id, title, body, is_important: imp, created_by: state.me.id }))).select();
  setBtnLoading(a, false);
  if (r.error) return showErr('#aErr', 'Gagal: ' + errMsg(r.error));
  r.data.forEach(row => { const i = state.announcements.findIndex(x => x.id === row.id); if (i >= 0) state.announcements[i] = row; else state.announcements.unshift(row); });
  closeModal(); showToast(id ? 'Pengumuman diperbarui.' : 'Pengumuman terkirim ke siswa.', 'success'); renderRoute();
};
ACTIONS.deleteAnn = async a => {
  if (!await confirmDialog({ title: 'Hapus pengumuman ini?', message: 'Pengumuman akan hilang untuk seluruh siswa.' })) return;
  const { error } = await sb.from('announcements').delete().eq('id', a.dataset.id);
  if (error) return showToast('Gagal menghapus: ' + errMsg(error), 'error');
  state.announcements = state.announcements.filter(x => x.id !== a.dataset.id); showToast('Pengumuman dihapus.', 'info'); renderRoute();
};

/* ---------- Pusat Notifikasi ---------- */
let notifTab = 'semua';
const NOTIF_STYLE = { new_task: 'n-new', new_task_alert: 'n-new', reminder_h3: 'n-warn', reminder_h1: 'n-urgent', reminder_h0: 'n-urgent', overdue: 'n-over', teacher_overdue: 'n-over', announcement: 'n-info', schedule: 'n-info', exam_alert: 'n-warn', deadline_changed: 'n-warn', status_updated: 'n-new' };
const NOTIF_LABEL = { new_task: 'Tugas Baru', new_task_alert: 'Tugas Baru', reminder_h3: 'Pengingat H-3', reminder_h1: 'Pengingat H-1', reminder_h0: 'Deadline Hari Ini', overdue: 'Overdue', teacher_overdue: 'Peringatan Guru', announcement: 'Pengumuman', schedule: 'Jadwal', exam_alert: 'Ujian Besok', deadline_changed: 'Deadline Berubah', status_updated: 'Status Diperbarui' };

function notifItem(n) {
  return `<div class="notif-card ${NOTIF_STYLE[n.type] || ''} ${n.read_at ? '' : 'unread'}" data-action="openNotif" data-id="${n.id}">
    <div class="notif-card-main"><div class="notif-card-top"><span class="notif-type">${NOTIF_LABEL[n.type] || n.type}</span><small>${fmtAgo(n.created_at)}</small></div>
      <div class="notif-card-title">${esc(n.title)}</div><div class="notif-card-body">${esc(n.body)}</div></div>
    <div class="notif-card-actions">${n.read_at ? '' : `<button class="btn-icon" data-action="readNotif" data-id="${n.id}" title="Tandai dibaca" aria-label="Tandai dibaca"><i class="fas fa-check"></i></button>`}
      <button class="btn-icon" data-action="delNotif" data-id="${n.id}" title="Hapus" aria-label="Hapus"><i class="fas fa-trash"></i></button></div></div>`;
}
function renderNotifPanel() {
  const l = state.notifications.slice(0, 6);
  $('#notifList').innerHTML = l.length ? l.map(n => `<div class="notif-item ${n.read_at ? '' : 'unread'}" data-action="openNotif" data-id="${n.id}"><div><div class="notif-text"><b>${esc(n.title)}</b></div><div class="notif-time">${fmtAgo(n.created_at)}</div></div></div>`).join('')
    : `<div class="notif-empty"><i class="fas fa-bell-slash"></i>Belum ada notifikasi</div>`;
}
function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  return localStorage.getItem('tk_push') === state.me.id ? 'on' : 'off';
}
VIEWS.notifikasi = async (el) => {
  const un = state.notifications.filter(n => !n.read_at), list = notifTab === 'belum' ? un : state.notifications;
  const S = state.settings, perm = 'Notification' in window ? Notification.permission : 'unsupported', ps = pushState();
  const tog = (k, label, sub) => `<label class="toggle-row"><div><b>${label}</b><small>${sub}</small></div><input type="checkbox" class="switch" data-action-change="setting" data-key="${k}" ${S[k] ? 'checked' : ''}></label>`;
  el.innerHTML = `<div class="section-header row-between"><div><h2><i class="fas fa-bell"></i> Pusat Notifikasi</h2><p>${un.length ? un.length + ' belum dibaca' : 'Semua sudah dibaca'}</p></div>
    <div class="btn-row"><button class="btn-secondary" data-action="readAll"><i class="fas fa-check-double"></i> Tandai semua dibaca</button></div></div>
    <div class="filter-bar"><div class="filter-chips">
      <button class="chip ${notifTab === 'semua' ? 'active' : ''}" data-action="notifTab" data-v="semua">Semua</button>
      <button class="chip ${notifTab === 'belum' ? 'active' : ''}" data-action="notifTab" data-v="belum">Belum dibaca (${un.length})</button>
      ${isGuru() ? `<button class="chip ${notifTab === 'riwayat' ? 'active' : ''}" data-action="notifTab" data-v="riwayat">Riwayat pengiriman</button>` : ''}</div></div>
    <div class="grid-notif"><div id="notifMain">${notifTab === 'riwayat' ? '<div class="skeleton-wrap">' + skeletonCards(3) + '</div>' :
      list.length ? list.map(notifItem).join('') : emptyState('fa-bell-slash', notifTab === 'belum' ? 'Tidak ada notifikasi belum dibaca' : 'Belum ada notifikasi', 'Notifikasi tugas, pengingat, dan pengumuman muncul di sini.')}</div>
    <div class="card settings-card"><h3><i class="fas fa-sliders"></i> Pengaturan Notifikasi</h3>
      ${tog('new_task', 'Tugas baru', 'Saat guru memberi tugas baru')}${tog('reminder', 'Pengingat deadline', 'H-3, H-1, hari-H, overdue, dan perubahan deadline')}
      ${tog('announcement', 'Pengumuman', 'Pengumuman dari guru')}${tog('schedule', 'Pengingat ujian', 'Sehari sebelum ujian')}
      <hr><h3><i class="fas fa-mobile-screen"></i> Notifikasi di perangkat</h3>
      <div class="device-row"><div><b>Notifikasi browser</b><small>${perm === 'granted' ? 'Aktif' : perm === 'denied' ? 'Diblokir di pengaturan browser' : perm === 'unsupported' ? 'Tidak didukung perangkat ini' : 'Belum diizinkan'}</small></div>
        ${perm === 'default' ? `<button class="btn-primary btn-sm" data-action="askPerm">Izinkan</button>` : `<span class="status-pill ${perm === 'granted' ? 'done' : 'todo'}">${perm === 'granted' ? 'Aktif' : '—'}</span>`}</div>
      <div class="device-row"><div><b>Push saat website ditutup</b><small>${{ unsupported: 'Browser ini tidak mendukung Web Push', unconfigured: 'Belum dikonfigurasi admin (VAPID)', denied: 'Diblokir di pengaturan browser', on: 'Aktif di perangkat ini', off: 'Nonaktif di perangkat ini' }[ps]}</small></div>
        ${ps === 'off' ? `<button class="btn-primary btn-sm" data-action="pushOn">Aktifkan</button>` : ps === 'on' ? `<button class="btn-secondary btn-sm" data-action="pushOff">Matikan</button>` : ''}</div>
      <p class="muted" style="font-size:12px;margin:8px 2px 0">Agar notifikasi muncul di atas layar HP seperti aplikasi biasa: aktifkan push, lalu pasang TugasKu ke Layar Utama (menu ⋮ browser → Instal aplikasi).</p></div></div>`;
  if (notifTab === 'riwayat') {
    const { data, error } = await sb.from('notification_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (currentRoute !== 'notifikasi' || notifTab !== 'riwayat') return;
    state.logs = data || [];
    $('#notifMain').innerHTML = error ? emptyState('fa-circle-exclamation', 'Gagal memuat riwayat') : !state.logs.length ? emptyState('fa-clock-rotate-left', 'Belum ada riwayat pengiriman') :
      `<div class="card no-pad"><div class="log-table">${state.logs.map(l => { const u = state.profiles.get(l.user_id);
        return `<div class="log-row"><span class="status-pill ${l.status === 'sent' ? 'done' : 'todo'}">${l.status === 'sent' ? 'Terkirim' : l.status === 'skipped' ? 'Dilewati' : 'Gagal'}</span>
          <div><b>${esc(NOTIF_LABEL[l.kind] || l.kind)}</b> → ${esc(u?.full_name || 'Pengguna')}<small>${esc(l.channel === 'push' ? 'Push' : 'Dalam aplikasi')}${l.detail ? ' · ' + esc(l.detail) : ''}${l.superseded_at ? ' · digantikan (deadline berubah)' : ''}</small></div>
          <small>${fmtDateTime(l.created_at)}</small></div>`; }).join('')}</div></div>`;
  }
};
ACTIONS.notifTab = a => { notifTab = a.dataset.v; VIEWS.notifikasi($('#view')); };
document.addEventListener('change', async e => {
  const a = e.target.closest('[data-action-change="setting"]'); if (!a) return;
  const k = a.dataset.key, prev = state.settings[k]; state.settings[k] = a.checked;
  const { error } = await sb.from('notification_settings').upsert({ user_id: state.me.id, new_task: state.settings.new_task, reminder: state.settings.reminder,
    announcement: state.settings.announcement, schedule: state.settings.schedule }, { onConflict: 'user_id' });
  if (error) { state.settings[k] = prev; a.checked = prev; showToast('Gagal menyimpan pengaturan: ' + errMsg(error), 'error'); } else showToast('Pengaturan disimpan.', 'success');
});
async function markRead(ids) {
  const now = new Date().toISOString(); ids = ids.filter(Boolean); if (!ids.length) return;
  state.notifications.forEach(n => { if (ids.includes(n.id)) n.read_at ||= now; });
  updateBadges();
  const { error } = await sb.from('notifications').update({ read_at: now }).in('id', ids);
  if (error) showToast('Gagal menandai dibaca: ' + errMsg(error), 'error');
}
ACTIONS.readNotif = async (a, e) => { e.stopPropagation(); await markRead([a.dataset.id]); renderRoute(); };
ACTIONS.readAll = async () => { await markRead(state.notifications.filter(n => !n.read_at).map(n => n.id)); renderRoute(); renderNotifPanel(); };
ACTIONS.delNotif = async (a, e) => {
  e.stopPropagation(); const id = a.dataset.id;
  const { error } = await sb.from('notifications').delete().eq('id', id);
  if (error) return showToast('Gagal menghapus: ' + errMsg(error), 'error');
  state.notifications = state.notifications.filter(n => n.id !== id); updateBadges(); renderRoute();
};
ACTIONS.openNotif = async a => {
  const n = state.notifications.find(x => x.id === a.dataset.id); if (!n) return;
  markRead([n.id]); $('#notifPanel').classList.add('hidden');
  if (typeof n.data?.url === 'string' && n.data.url.startsWith('#/')) return openDeepLink(n.data.url);   // deep link yang sama dengan push
  const tid = n.data?.task_id;
  if (n.type === 'teacher_overdue' && tid) return go('monitor', { task: tid });
  if (tid && state.tasks.some(t => t.id === tid)) { if (currentRoute !== 'tugas') go('tugas'); return openTask(tid); }
  if (n.type === 'announcement') return go('pengumuman');
  if (n.type === 'schedule') return go('jadwal');
  renderRoute();
};
ACTIONS.askPerm = async () => { await Notification.requestPermission(); renderRoute(); };

/* Web Push */
const b64ToU8 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
async function savePushSub(sub) {
  const j = sub.toJSON();
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await sb.from('push_subscriptions').insert({ user_id: state.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
  if (error) throw error;
  localStorage.setItem('tk_push', state.me.id);
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Izin notifikasi tidak diberikan.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY) });
  try { await savePushSub(sub); } catch (e) { await sub.unsubscribe(); throw e; }
}
/* Saat aplikasi dibuka: pastikan langganan push perangkat ini masih tersimpan di server (browser bisa memutar endpoint). */
async function syncPush() {
  try {
    if (pushState() !== 'on') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() ||
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY) });
    await savePushSub(sub);
  } catch { /* gagal diam-diam; pengguna bisa mengaktifkan ulang dari Pusat Notifikasi */ }
}
async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration(); const sub = await reg?.pushManager.getSubscription();
  if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  localStorage.removeItem('tk_push');
}
ACTIONS.pushOn = async () => { try { await enablePush(); showToast('Push aktif di perangkat ini.', 'success'); } catch (e) { showToast('Gagal mengaktifkan push: ' + errMsg(e), 'error'); } renderRoute(); };
ACTIONS.pushOff = async () => { try { await disablePush(); showToast('Push dimatikan.', 'info'); } catch (e) { showToast(errMsg(e), 'error'); } renderRoute(); };

/* ---------- Aktivitas ---------- */
let actStudent = '', actAction = '';
const ACT_TEXT = { view_task: ['fa-eye', 'membuka detail tugas'], mark_done: ['fa-circle-check', 'menandai Sudah Selesai'], mark_undone: ['fa-rotate-left', 'mengubah menjadi Belum Selesai'] };
VIEWS.aktivitas = (el) => {
  const ids = new Set(scopeIds());
  let rows = state.activity.filter(a => ids.has(a.class_id));
  const studs = [...new Set(rows.map(a => a.user_id))].map(id => state.profiles.get(id)).filter(Boolean);
  if (actStudent) rows = rows.filter(a => a.user_id === actStudent);
  if (actAction) rows = rows.filter(a => a.action === actAction);
  const g = isGuru();
  el.innerHTML = `<div class="section-header"><h2><i class="fas fa-clock-rotate-left"></i> ${g ? 'Activity Monitor' : 'Riwayat Aktivitasmu'}</h2>
    <p>${g ? 'Aktivitas akademik siswa di kelas yang kamu ajar' : 'Hanya kamu yang dapat melihat riwayat ini'}</p></div>
    <div class="privacy-note"><i class="fas fa-shield-halved"></i> Hanya mencatat aktivitas akademik di TugasKu (buka detail tugas & perubahan status). Tidak ada pesan pribadi, riwayat browsing, atau aktivitas di luar aplikasi.</div>
    <div class="filter-bar">${g ? `<select class="select-filter" data-action-change="actStudent"><option value="">Semua siswa</option>${studs.map(s => `<option value="${s.id}" ${s.id === actStudent ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select>` : ''}
      <select class="select-filter" data-action-change="actAction"><option value="">Semua aktivitas</option>${Object.entries(ACT_TEXT).map(([k, v]) => `<option value="${k}" ${k === actAction ? 'selected' : ''}>${v[1]}</option>`).join('')}</select></div>
    <div class="card no-pad">${rows.length ? `<div class="log-table">${rows.slice(0, 200).map(a => { const u = state.profiles.get(a.user_id), t = ACT_TEXT[a.action];
      return `<div class="log-row">${avatarHTML(u, 34)}<div><b>${esc(a.user_id === state.me.id ? 'Kamu' : u?.full_name || 'Siswa')}</b> ${t[1]} <b>${esc(a.task_title || '(tugas dihapus)')}</b>
        <small>${esc(className(a.class_id))}</small></div><small title="${fmtDateTime(a.created_at)}"><i class="fas ${t[0]}"></i> ${fmtAgo(a.created_at)}</small></div>`; }).join('')}</div>`
      : emptyState('fa-clock-rotate-left', 'Belum ada aktivitas')}</div>`;
};
document.addEventListener('change', e => {
  const a = e.target.closest('[data-action-change]'); if (!a) return;
  if (a.dataset.actionChange === 'actStudent') { actStudent = a.value; VIEWS.aktivitas($('#view')); }
  if (a.dataset.actionChange === 'actAction') { actAction = a.value; VIEWS.aktivitas($('#view')); }
});

/* ---------- Kelas ---------- */
const fmtCode = c => c.slice(0, 4) + '-' + c.slice(4);
function kelasList() {
  if (!state.classes.length) return emptyState('fa-school', isGuru() ? 'Belum ada kelas' : 'Belum bergabung di kelas mana pun');
  return state.classes.map(c => {
    const studs = studentsOfClass(c.id);
    const teachers = state.members.filter(m => m.class_id === c.id && m.member_role === 'guru').map(m => state.profiles.get(m.user_id)).filter(Boolean);
    const owner = c.created_by === state.me.id;
    return `<div class="card class-card"><div class="card-header-row"><div><h3>${esc(c.name)}</h3>${c.description ? `<small class="muted">${esc(c.description)}</small>` : ''}</div>
        ${isGuru() ? (owner ? `<button class="btn-icon-danger" data-action="deleteClass" data-id="${c.id}" title="Hapus kelas" aria-label="Hapus kelas"><i class="fas fa-trash"></i></button>` : '') : `<button class="btn-link danger" data-action="leaveClass" data-id="${c.id}">Keluar</button>`}</div>
      <div class="meta-line"><i class="fas fa-chalkboard-user"></i> ${teachers.map(t => esc(t.full_name)).join(', ') || '-'}</div>
      ${isGuru() ? `<div class="code-box"><div><small>Kode kelas (bagikan ke siswa)</small><code>${fmtCode(c.join_code)}</code></div>
        <div class="btn-row"><button class="btn-secondary btn-sm" data-action="copyCode" data-code="${c.join_code}"><i class="fas fa-copy"></i> Salin</button><button class="btn-secondary btn-sm" data-action="regenCode" data-id="${c.id}"><i class="fas fa-rotate"></i> Ganti</button></div></div>
        <h4>Siswa (${studs.length})</h4>${studs.length ? `<div class="member-list">${studs.map(s => `<div class="member-row">${avatarHTML(s, 32)}<div><b>${esc(s.full_name)}</b><small>@${esc(s.username)}</small></div>
          <button class="btn-kick" data-action="removeMember" data-class="${c.id}" data-user="${s.id}" data-name="${esc(s.full_name)}"><i class="fas fa-user-minus"></i> Keluarkan</button></div>`).join('')}</div>` : '<p class="muted">Belum ada siswa. Bagikan kode kelas.</p>'}
        <div class="inline-form"><input id="co-${c.id}" placeholder="Username guru lain (co-guru)"><button class="btn-secondary btn-sm" data-action="addTeacher" data-id="${c.id}"><i class="fas fa-user-plus"></i> Tambah guru</button></div>` : ''}</div>`;
  }).join('');
}
VIEWS.kelas = (el, _p, soft) => {
  if (soft && $('#kelasList')) { $('#kelasList').innerHTML = kelasList(); return; }
  el.innerHTML = `<div class="section-header"><h2><i class="fas fa-school"></i> Kelas</h2><p>${isGuru() ? 'Buat kelas dan kelola siswa' : 'Gabung kelas dengan kode dari gurumu'}</p></div>
    <div class="card form-card">${isGuru() ? `<h3>Buat Kelas Baru</h3><div class="form-grid"><div class="form-group"><label>Nama Kelas *</label><input id="kNama" maxlength="80" placeholder="Contoh: XI IPA 1"></div>
        <div class="form-group"><label>Deskripsi</label><input id="kDesk" maxlength="200" placeholder="Opsional"></div></div>
        <div id="kErr" class="alert alert-error hidden"><i class="fas fa-exclamation-circle"></i> <span></span></div>
        <div class="form-actions"><button class="btn-primary" data-action="createClass"><i class="fas fa-plus"></i> Buat Kelas</button></div>`
      : `<h3>Gabung Kelas</h3><div class="inline-form"><input id="kKode" placeholder="Masukkan kode kelas (mis. A1B2-C3D4)" maxlength="12" style="text-transform:uppercase"><button class="btn-primary" data-action="joinClass"><i class="fas fa-right-to-bracket"></i> Gabung</button></div>
        <div id="kErr" class="alert alert-error hidden"><i class="fas fa-exclamation-circle"></i> <span></span></div>`}</div>
    <div id="kelasList">${kelasList()}</div>`;
};
ACTIONS.createClass = async a => {
  const name = $('#kNama').value.trim(); if (name.length < 2) return showErr('#kErr', 'Nama kelas minimal 2 karakter!');
  setBtnLoading(a, true, 'Membuat...');
  const { data, error } = await sb.from('classes').insert({ name, description: $('#kDesk').value.trim() || null, created_by: state.me.id }).select().single();
  if (error) { setBtnLoading(a, false); return showErr('#kErr', 'Gagal: ' + errMsg(error)); }
  await refreshProfilesAndClasses(); setBtnLoading(a, false);
  $('#kNama').value = ''; $('#kDesk').value = ''; hideEl('#kErr');
  renderClassPicker(); renderRoute(); showToast(`Kelas "${data.name}" dibuat. Bagikan kodenya ke siswa.`, 'success');
};
ACTIONS.joinClass = async a => {
  const code = $('#kKode').value.trim(); if (!code) return showErr('#kErr', 'Masukkan kode kelas!');
  setBtnLoading(a, true, 'Bergabung...');
  const { error } = await sb.rpc('join_class', { p_code: code });
  if (error) { setBtnLoading(a, false); return showErr('#kErr', errMsg(error)); }
  await loadAll(); setBtnLoading(a, false); renderClassPicker(); updateBadges(); renderRoute(); showToast('Berhasil bergabung ke kelas!', 'success');
};
ACTIONS.leaveClass = async a => {
  if (!await confirmDialog({ title: 'Keluar dari kelas ini?', message: 'Kamu tidak akan menerima tugas dan notifikasi kelas ini lagi.', confirmText: 'Ya, Keluar', icon: 'fa-door-open' })) return;
  const { error } = await sb.from('class_members').delete().eq('class_id', a.dataset.id).eq('user_id', state.me.id);
  if (error) return showToast(errMsg(error), 'error');
  await loadAll(); renderClassPicker(); updateBadges(); renderRoute();
};
ACTIONS.copyCode = async a => { try { await navigator.clipboard.writeText(a.dataset.code); showToast('Kode kelas disalin.', 'success'); } catch { showToast('Salin manual: ' + a.dataset.code, 'info'); } };
ACTIONS.regenCode = async a => {
  if (!await confirmDialog({ title: 'Ganti kode kelas?', message: 'Kode lama tidak berlaku lagi. Siswa yang sudah bergabung tidak terpengaruh.', confirmText: 'Ya, Ganti', danger: false, icon: 'fa-rotate' })) return;
  const { error } = await sb.rpc('regenerate_join_code', { p_class: a.dataset.id });
  if (error) return showToast(errMsg(error), 'error');
  await refreshProfilesAndClasses(); renderRoute(); showToast('Kode kelas diganti.', 'success');
};
ACTIONS.removeMember = async a => {
  if (!await confirmDialog({ title: `Keluarkan ${a.dataset.name}?`, message: 'Siswa tidak lagi menerima tugas kelas ini. Akunnya tidak dihapus.', confirmText: 'Ya, Keluarkan', icon: 'fa-user-minus' })) return;
  const { error } = await sb.from('class_members').delete().eq('class_id', a.dataset.class).eq('user_id', a.dataset.user);
  if (error) return showToast(errMsg(error), 'error');
  state.members = state.members.filter(m => !(m.class_id === a.dataset.class && m.user_id === a.dataset.user)); renderRoute(); showToast('Siswa dikeluarkan dari kelas.', 'info');
};
ACTIONS.addTeacher = async a => {
  const u = $('#co-' + a.dataset.id).value.trim(); if (!u) return showToast('Isi username guru.', 'warning');
  const { error } = await sb.rpc('add_class_teacher', { p_class: a.dataset.id, p_username: u });
  if (error) return showToast(errMsg(error), 'error');
  await refreshProfilesAndClasses(); renderRoute(); showToast('Guru ditambahkan ke kelas.', 'success');
};
ACTIONS.deleteClass = async a => {
  const c = state.classes.find(x => x.id === a.dataset.id);
  if (!await confirmDialog({ title: `Hapus kelas "${c.name}"?`, message: 'SEMUA tugas, status, pengumuman, dan jadwal kelas ini ikut terhapus permanen.' })) return;
  const { error } = await sb.from('classes').delete().eq('id', c.id);
  if (error) return showToast(errMsg(error), 'error');
  await loadAll(); renderClassPicker(); updateBadges(); renderRoute(); showToast('Kelas dihapus.', 'info');
};

/* ---------- Profil ---------- */
VIEWS.profil = (el) => {
  const me = state.me;
  el.innerHTML = `<div class="section-header"><h2><i class="fas fa-user-gear"></i> Profil</h2><p>@${esc(me.username)} · ${me.role === 'guru' ? 'Guru' : 'Siswa'}</p></div>
    <div class="card form-card"><div class="profile-head">${avatarHTML(me, 84)}<div><label class="btn-secondary btn-sm file-btn"><i class="fas fa-camera"></i> Ganti foto<input type="file" id="pFoto" accept="image/*" hidden></label>
      <small class="muted">Foto akan diperkecil otomatis. Terlihat oleh guru/siswa sekelas yang berwenang.</small></div></div>
      <div class="form-grid"><div class="form-group col-2"><label>Nama Lengkap</label><input id="pNama" maxlength="80" value="${esc(me.full_name)}"></div></div>
      <div class="form-actions"><button class="btn-primary" data-action="saveProfile"><i class="fas fa-save"></i> Simpan Nama</button></div></div>
    <div class="card form-card"><h3>Ganti Password</h3><div class="form-grid"><div class="form-group"><label>Password baru</label><input type="password" id="pPass" autocomplete="new-password" placeholder="Min. 6 karakter"></div>
      <div class="form-group"><label>Ulangi password</label><input type="password" id="pPass2" autocomplete="new-password"></div></div>
      <div id="pErr" class="alert alert-error hidden"><i class="fas fa-exclamation-circle"></i> <span></span></div>
      <div class="form-actions"><button class="btn-primary" data-action="savePass"><i class="fas fa-key"></i> Ganti Password</button></div></div>
    <div class="card"><button class="btn-danger" data-action="logout"><i class="fas fa-sign-out-alt"></i> Keluar</button></div>`;
  $('#pFoto').addEventListener('change', e => uploadAvatar(e.target.files[0]));
};
ACTIONS.saveProfile = async a => {
  const name = $('#pNama').value.trim(); if (name.length < 2) return showToast('Nama minimal 2 karakter.', 'warning');
  const { error } = await sb.from('profiles').update({ full_name: name }).eq('id', state.me.id);
  if (error) return showToast(errMsg(error), 'error');
  state.me.full_name = name; renderUserBox(); showToast('Nama disimpan.', 'success');
};
ACTIONS.savePass = async a => {
  const p = $('#pPass').value; if (p.length < 6) return showErr('#pErr', 'Password minimal 6 karakter!');
  if (p !== $('#pPass2').value) return showErr('#pErr', 'Password tidak sama!');
  setBtnLoading(a, true, 'Menyimpan...'); const { error } = await sb.auth.updateUser({ password: p }); setBtnLoading(a, false);
  if (error) return showErr('#pErr', errMsg(error));
  hideEl('#pErr'); $('#pPass').value = $('#pPass2').value = ''; showToast('Password diganti.', 'success');
};
async function uploadAvatar(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return showToast('File harus berupa gambar.', 'warning');
  try {
    const bmp = await createImageBitmap(file), S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const m = Math.min(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, (bmp.width - m) / 2, (bmp.height - m) / 2, m, m, 0, 0, S, S);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .85));
    const path = `${state.me.id}/avatar.jpg`;
    const up = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
    const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', state.me.id);
    if (error) throw error;
    state.me.avatar_url = url; renderUserBox(); renderRoute(); showToast('Foto profil diperbarui.', 'success');
  } catch (e) { showToast('Gagal mengunggah foto: ' + errMsg(e), 'error'); }
}
