/* ===== Dashboard, daftar tugas, detail tugas, form tugas, status tugas ===== */
let taskFilter = 'semua', taskSubject = '';

const kelasTag = cid => state.classes.length > 1 ? `<span class="kelas-tag"><i class="fas fa-school"></i> ${esc(className(cid))}</span>` : '';
const noClassState = () => isGuru()
  ? emptyState('fa-school', 'Kamu belum punya kelas', 'Buat kelas dulu, lalu bagikan kode kelas ke siswa.', `<button class="btn-primary" data-action="go" data-route="kelas"><i class="fas fa-plus"></i> Buat Kelas</button>`)
  : emptyState('fa-door-open', 'Kamu belum tergabung di kelas mana pun', 'Minta kode kelas ke gurumu, lalu masukkan di menu Kelas.', `<button class="btn-primary" data-action="go" data-route="kelas"><i class="fas fa-right-to-bracket"></i> Gabung Kelas</button>`);

function statusBadge(t) {
  if (isGuru()) return '';
  if (myDone(t.id)) return `<span class="status-pill done"><i class="fas fa-circle-check"></i> Sudah Selesai</span>`;
  if (isOverdue(t)) return `<span class="status-pill overdue"><i class="fas fa-triangle-exclamation"></i> Overdue</span>`;
  return `<span class="status-pill todo"><i class="far fa-circle"></i> Belum Selesai</span>`;
}
function progressBar(p, cls = '') {
  return `<div class="mini-progress ${cls}"><div class="mini-progress-fill" style="width:${p}%"></div></div>`;
}
const toggleBtn = (t, compact) => myDone(t.id)
  ? `<button class="btn-status done ${compact ? 'compact' : ''}" data-action="setDone" data-id="${t.id}" data-done="0" title="Klik untuk mengubah menjadi Belum Selesai"><i class="fas fa-circle-check"></i> Sudah Selesai</button>`
  : `<button class="btn-status todo ${compact ? 'compact' : ''}" data-action="setDone" data-id="${t.id}" data-done="1" title="Klik untuk menandai Sudah Selesai"><i class="far fa-circle"></i> Belum Selesai</button>`;

/* ----- Dashboard ----- */
VIEWS.dashboard = (el) => {
  const me = state.me, jam = new Date().getHours();
  const sapa = jam < 11 ? 'Selamat Pagi' : jam < 15 ? 'Selamat Siang' : jam < 18 ? 'Selamat Sore' : 'Selamat Malam';
  const head = `<div class="section-header"><h2>${sapa}, ${esc(me.full_name.split(' ')[0])}! 👋</h2>
    <p>${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })}</p></div>`;
  if (!state.classes.length) return el.innerHTML = head + `<div class="card">${noClassState()}</div>`;
  const tasks = scopedTasks(), now = new Date();
  const upcoming = tasks.filter(t => !isOverdue(t)).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const anns = scopedAnnouncements().slice(0, 3);
  const events = upcomingEvents().slice(0, 5);
  const annHTML = anns.length ? anns.map(a => `<div class="pengumuman-mini ${a.is_important ? 'penting' : ''}" data-action="go" data-route="pengumuman">
      <div class="pengumuman-mini-icon">${a.is_important ? '🚨' : '📢'}</div>
      <div class="pengumuman-mini-content"><div class="pengumuman-mini-judul">${esc(a.title)}</div>
      <div class="pengumuman-mini-time">${fmtAgo(a.created_at)} ${kelasTag(a.class_id)}</div></div>
      ${a.is_important ? '<span class="badge-penting">Penting</span>' : ''}</div>`).join('')
    : `<p class="muted-center">Belum ada pengumuman 📢</p>`;
  const evHTML = events.length ? events.map(ev => eventRow(ev)).join('') : `<p class="muted-center">Tidak ada agenda mendatang</p>`;

  if (isGuru()) {
    const studs = new Set(scopeIds().flatMap(cid => studentsOfClass(cid).map(s => s.id)));
    let done = 0, total = 0;
    upcoming.forEach(t => { const p = taskProgress(t); done += p.done; total += p.total; });
    const attention = tasks.filter(t => isOverdue(t) && taskProgress(t).belum > 0)
      .sort((a, b) => new Date(b.deadline) - new Date(a.deadline)).slice(0, 5);
    el.innerHTML = head + `
      <div class="stats-grid">
        ${stat('fa-school', 'blue', scopeIds().length, 'Kelas')}
        ${stat('fa-users', 'green', studs.size, 'Total Siswa')}
        ${stat('fa-clipboard-list', 'purple', upcoming.length, 'Tugas Aktif')}
        ${stat('fa-chart-line', 'yellow', pct(done, total) + '%', 'Penyelesaian Tugas Aktif')}
      </div>
      ${attention.length ? `<div class="card alert-card"><div class="card-header-row"><h3><i class="fas fa-triangle-exclamation"></i> Perlu Perhatian (lewat deadline)</h3></div>
        ${attention.map(t => { const p = taskProgress(t); return `<div class="task-mini" data-action="go" data-route="monitor" data-key="task" data-id="${t.id}">
          <div class="task-mini-color" style="background:var(--danger)"></div>
          <div class="task-mini-info"><div class="task-mini-title">${esc(t.title)}</div><div class="task-mini-mapel"><span class="mapel-tag ${mapelClass(t.subject)}">${esc(t.subject)}</span> ${kelasTag(t.class_id)}</div></div>
          <div class="task-mini-right"><span class="count-pill danger">${p.belum} belum selesai</span></div></div>`; }).join('')}</div>` : ''}
      <div class="card"><div class="card-header-row"><h3><i class="fas fa-fire"></i> Tugas Aktif Terdekat</h3><button class="btn-link" data-action="go" data-route="monitor">Task Monitor →</button></div>
        ${upcoming.slice(0, 5).map(t => { const p = taskProgress(t), cd = getCountdown(t.deadline); return `<div class="task-mini" data-action="openTask" data-id="${t.id}">
          <div class="task-mini-color" style="background:var(--${cd.type === 'urgent' ? 'danger' : cd.type === 'warning' ? 'warning' : 'success'})"></div>
          <div class="task-mini-info"><div class="task-mini-title">${esc(t.title)}</div>
            <div class="task-mini-mapel"><span class="mapel-tag ${mapelClass(t.subject)}">${esc(t.subject)}</span> ${kelasTag(t.class_id)} ${progressBar(p.pct)}<small>${p.done}/${p.total} selesai (${p.pct}%)</small></div></div>
          <div class="task-mini-right"><div class="countdown-badge ${cd.type}">${cd.text}</div></div></div>`; }).join('') || `<p class="muted-center">Tidak ada tugas aktif 🎉</p>`}</div>
      <div class="grid-2"><div class="card"><div class="card-header-row"><h3><i class="fas fa-bullhorn"></i> Pengumuman Terbaru</h3><button class="btn-link" data-action="go" data-route="pengumuman">Semua →</button></div>${annHTML}</div>
      <div class="card"><div class="card-header-row"><h3><i class="fas fa-calendar-days"></i> Agenda Mendatang</h3><button class="btn-link" data-action="go" data-route="jadwal">Kalender →</button></div>${evHTML}</div></div>`;
    return;
  }
  const mine = tasks, doneN = mine.filter(t => myDone(t.id)).length;
  const overdue = mine.filter(t => !myDone(t.id) && isOverdue(t));
  const todo = upcoming.filter(t => !myDone(t.id));
  el.innerHTML = head + `
    <div class="stats-grid">
      ${stat('fa-tasks', 'blue', mine.length, 'Total Tugas')}
      ${stat('fa-circle-check', 'green', doneN, 'Sudah Selesai')}
      ${stat('fa-hourglass-half', 'yellow', mine.length - doneN - overdue.length, 'Belum Selesai')}
      ${stat('fa-triangle-exclamation', 'red', overdue.length, 'Overdue')}
    </div>
    <div class="card progress-card"><h3><i class="fas fa-chart-line"></i> Progress Tugas Kamu</h3>
      <div class="progress-wrap"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct(doneN, mine.length)}%"></div></div><span>${pct(doneN, mine.length)}%</span></div>
      <p>${doneN} dari ${mine.length} tugas sudah selesai</p></div>
    ${overdue.length ? `<div class="card alert-card"><div class="card-header-row"><h3><i class="fas fa-triangle-exclamation"></i> Melewati Deadline</h3></div>${overdue.slice(0, 5).map(t => miniTask(t)).join('')}</div>` : ''}
    <div class="card"><div class="card-header-row"><h3><i class="fas fa-fire"></i> Tugas Mendekati Deadline</h3><button class="btn-link" data-action="go" data-route="tugas">Lihat semua →</button></div>
      ${todo.slice(0, 5).map(t => miniTask(t)).join('') || `<p class="muted-center">Semua tugas aktifmu sudah selesai 🎉</p>`}</div>
    <div class="grid-2"><div class="card"><div class="card-header-row"><h3><i class="fas fa-bullhorn"></i> Pengumuman Terbaru</h3><button class="btn-link" data-action="go" data-route="pengumuman">Semua →</button></div>${annHTML}</div>
    <div class="card"><div class="card-header-row"><h3><i class="fas fa-calendar-days"></i> Agenda Mendatang</h3><button class="btn-link" data-action="go" data-route="jadwal">Kalender →</button></div>${evHTML}</div></div>`;
};
const stat = (icon, color, num, label) => `<div class="stat-card"><div class="stat-icon ${color}"><i class="fas ${icon}"></i></div><div class="stat-info"><div class="stat-num">${num}</div><div class="stat-label">${label}</div></div></div>`;
function miniTask(t) {
  const cd = getCountdown(t.deadline), col = cd.type === 'expired' ? 'danger' : cd.type === 'urgent' ? 'danger' : cd.type === 'warning' ? 'warning' : 'success';
  return `<div class="task-mini" data-action="openTask" data-id="${t.id}">
    <div class="task-mini-color" style="background:var(--${col})"></div>
    <div class="task-mini-info"><div class="task-mini-title">${esc(t.title)}</div>
      <div class="task-mini-mapel"><span class="mapel-tag ${mapelClass(t.subject)}">${esc(t.subject)}</span> ${kelasTag(t.class_id)}</div></div>
    <div class="task-mini-right"><div class="countdown-badge ${cd.type}">${cd.text}</div>${toggleBtn(t, true)}</div></div>`;
}

/* ----- Daftar tugas ----- */
VIEWS.tugas = (el, params = {}, soft) => {
  const q = ($('#searchInput').value || '').toLowerCase().trim();
  const all = scopedTasks();
  const subjects = [...new Set(all.map(t => t.subject))].sort();
  if (taskSubject && !subjects.includes(taskSubject)) taskSubject = '';
  const chips = isGuru() ? [['semua', 'Semua'], ['aktif', 'Aktif'], ['lewat', 'Lewat Deadline']]
                         : [['semua', 'Semua'], ['belum', 'Belum Selesai'], ['selesai', 'Sudah Selesai'], ['overdue', 'Overdue']];
  if (!chips.some(c => c[0] === taskFilter)) taskFilter = 'semua';
  const list = all.filter(t => {
    if (q && !(t.title + ' ' + t.subject + ' ' + t.description).toLowerCase().includes(q)) return false;
    if (taskSubject && t.subject !== taskSubject) return false;
    const done = !isGuru() && myDone(t.id), od = isOverdue(t);
    switch (taskFilter) {
      case 'belum': return !done; case 'selesai': return done; case 'overdue': return !done && od;
      case 'aktif': return !od; case 'lewat': return od; default: return true;
    }
  }).sort((a, b) => {
    const ad = !isGuru() && myDone(a.id), bd = !isGuru() && myDone(b.id);
    if (ad !== bd) return ad ? 1 : -1;
    const ao = isOverdue(a), bo = isOverdue(b);
    if (ao !== bo) return ao ? 1 : -1;
    return ao ? new Date(b.deadline) - new Date(a.deadline) : new Date(a.deadline) - new Date(b.deadline);
  });
  el.innerHTML = `<div class="section-header"><h2>Semua Tugas</h2><p>${isGuru() ? 'Kelola dan pantau tugas kelasmu' : 'Daftar tugas untuk kelasmu'}</p></div>
    <div class="filter-bar"><div class="filter-chips">${chips.map(c => `<button class="chip ${c[0] === taskFilter ? 'active' : ''}" data-action="taskFilter" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>
      <select class="select-filter" data-action-change="taskSubject"><option value="">Semua Mapel</option>${subjects.map(s => `<option ${s === taskSubject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <div class="tasks-grid">${!state.classes.length ? '' : list.map(taskCard).join('')}</div>
    ${!state.classes.length ? `<div class="card">${noClassState()}</div>` : !list.length ? emptyState('fa-inbox', 'Tidak ada tugas ditemukan', q || taskSubject || taskFilter !== 'semua' ? 'Coba ubah pencarian atau filter.' : '') : ''}`;
  // Deep link dari notifikasi: #/tugas?task=<id> membuka detail tugas (sekali saja, bukan tiap render ulang otomatis)
  if (params.task && !soft) {
    const id = params.task;
    history.replaceState(null, '', location.pathname + location.search + '#/tugas'); currentParams = {};
    if (state.tasks.some(t => t.id === id)) setTimeout(() => openTask(id), 0);
  }
};
function taskCard(t) {
  const cd = getCountdown(t.deadline), g = isGuru(), p = g ? taskProgress(t) : null;
  const done = !g && myDone(t.id);
  return `<div class="task-card ${done ? 'is-done' : ''} ${!done && isOverdue(t) ? 'is-overdue' : ''}" data-action="openTask" data-id="${t.id}">
    <div class="task-card-color-bar ${colorClass(t.subject)}"></div>
    <div class="task-card-body">
      <div class="task-card-meta"><span class="mapel-tag ${mapelClass(t.subject)}">${esc(t.subject)}</span>${kelasTag(t.class_id)}${statusBadge(t)}</div>
      <div class="task-card-title">${esc(t.title)}</div>
      <div class="task-card-desc">${esc(t.description)}</div>
      ${g ? `<div class="task-prog">${progressBar(p.pct)}<small>${p.done}/${p.total} siswa selesai (${p.pct}%)</small></div>` : ''}
      <div class="task-card-footer"><div class="deadline-info"><i class="fas fa-clock"></i><span class="countdown-badge ${cd.type}">${cd.text}</span><small>${fmtDateTime(t.deadline)}</small></div>
        ${g ? '' : toggleBtn(t, true)}</div>
    </div></div>`;
}
ACTIONS.taskFilter = a => { taskFilter = a.dataset.v; VIEWS.tugas($('#view')); };
document.addEventListener('change', e => { const a = e.target.closest('[data-action-change]'); if (a?.dataset.actionChange === 'taskSubject') { taskSubject = a.value; VIEWS.tugas($('#view')); } });

/* ----- Status tugas siswa ----- */
async function setDone(taskId, done) {
  if (isGuru()) return;
  const prev = statusRow(taskId, state.me.id), prevCopy = prev ? { ...prev } : null;
  const nowISO = new Date().toISOString();
  if (prev) { prev.is_done = done; prev.updated_at = nowISO; }
  else state.statuses.push({ task_id: taskId, student_id: state.me.id, is_done: done, updated_at: nowISO });
  updateBadges(); rerenderSoft(); refreshOpenModal();
  const { data, error } = await sb.from('task_status')
    .upsert({ task_id: taskId, student_id: state.me.id, is_done: done }, { onConflict: 'task_id,student_id' }).select().single();
  if (error) {                                            // batalkan perubahan optimistis
    if (prevCopy) Object.assign(statusRow(taskId, state.me.id), prevCopy);
    else state.statuses = state.statuses.filter(s => !(s.task_id === taskId && s.student_id === state.me.id));
    updateBadges(); rerenderSoft(); refreshOpenModal();
    return showToast('Gagal menyimpan status: ' + errMsg(error), 'error');
  }
  Object.assign(statusRow(taskId, state.me.id), data);
  showToast(done ? 'Ditandai Sudah Selesai ✓' : 'Diubah menjadi Belum Selesai', done ? 'success' : 'info');
}
ACTIONS.setDone = (a, e) => { e.stopPropagation(); setDone(a.dataset.id, a.dataset.done === '1'); };

/* ----- Detail tugas ----- */
ACTIONS.openTask = a => openTask(a.dataset.id);
function openTask(id, silent) {
  const t = state.tasks.find(x => x.id === id); if (!t) return closeModal();
  const cd = getCountdown(t.deadline), g = isGuru();
  if (!g && !silent) sb.rpc('log_task_view', { p_task: id }).then(() => {});
  let extra;
  if (g) {
    const p = taskProgress(t);
    extra = `<div class="modal-submit-section"><h4>📊 Penyelesaian Siswa</h4>
      <div class="progress-wrap"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${p.pct}%"></div></div><span>${p.pct}%</span></div>
      <p class="muted">${p.done} selesai · ${p.belum} belum selesai · ${p.total} siswa</p>
      <div class="modal-actions">
        <button class="btn-secondary" data-action="go" data-route="monitor" data-key="task" data-id="${t.id}"><i class="fas fa-list-check"></i> Task Monitor</button>
        <button class="btn-secondary" data-action="editTask" data-id="${t.id}"><i class="fas fa-pen"></i> Edit</button>
        <button class="btn-danger" data-action="deleteTask" data-id="${t.id}"><i class="fas fa-trash"></i> Hapus</button></div></div>`;
  } else {
    const row = statusRow(t.id, state.me.id), done = !!row?.is_done;
    extra = `<div class="modal-submit-section"><h4>Status Tugasmu</h4>
      <div class="status-choice">
        <button class="choice ${done ? 'active done' : ''}" data-action="setDone" data-id="${t.id}" data-done="1"><i class="fas fa-circle-check"></i> ✓ Sudah Selesai</button>
        <button class="choice ${!done ? 'active todo' : ''}" data-action="setDone" data-id="${t.id}" data-done="0"><i class="far fa-circle"></i> ○ Belum Selesai</button></div>
      <p class="muted">${row ? `Terakhir diperbarui ${fmtDateTime(row.updated_at)}` : 'Belum pernah diubah (default: Belum Selesai)'}</p></div>`;
  }
  openModal(`<div data-task="${t.id}"><div class="modal-mapel-tag"><span class="mapel-tag ${mapelClass(t.subject)}">${esc(t.subject)}</span> ${kelasTag(t.class_id)} ${statusBadge(t)}</div>
    <div class="modal-title">${esc(t.title)}</div><div class="modal-desc">${nl2br(t.description) || '<em>Tidak ada deskripsi.</em>'}</div>
    <div class="modal-info-grid">
      <div class="modal-info-item"><div class="modal-info-label">Diberikan</div><div class="modal-info-value">${fmtDate(t.assigned_date + 'T12:00:00+07:00')}</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Deadline</div><div class="modal-info-value">${fmtDateTime(t.deadline)}</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Sisa Waktu</div><div class="modal-info-value"><span class="countdown-badge ${cd.type}">${cd.text}</span></div></div>
      <div class="modal-info-item"><div class="modal-info-label">Kelas</div><div class="modal-info-value">${esc(className(t.class_id))}</div></div></div>
    ${extra}</div>`);
}
function refreshOpenModal() {
  if ($('#modalOverlay').classList.contains('hidden')) return;
  const id = $('#modalContent [data-task]')?.dataset.task; if (id) openTask(id, true);
}
ACTIONS.deleteTask = async a => {
  const t = state.tasks.find(x => x.id === a.dataset.id); if (!t) return;
  if (!await confirmDialog({ title: 'Hapus tugas ini?', message: `"${t.title}" beserta status penyelesaian seluruh siswa akan dihapus permanen.` })) return;
  const { error } = await sb.from('tasks').delete().eq('id', t.id);
  if (error) return showToast('Gagal menghapus: ' + errMsg(error), 'error');
  state.tasks = state.tasks.filter(x => x.id !== t.id); state.statuses = state.statuses.filter(s => s.task_id !== t.id);
  closeModal(); showToast('Tugas berhasil dihapus.', 'info'); renderRoute();
};
ACTIONS.editTask = a => { closeModal(); go('tugas-baru', { edit: a.dataset.id }); };

/* ----- Form buat / edit tugas ----- */
VIEWS['tugas-baru'] = (el, params) => {
  const edit = params.edit ? state.tasks.find(t => t.id === params.edit) : null;
  if (!state.classes.length) return el.innerHTML = `<div class="section-header"><h2>Buat Tugas</h2></div><div class="card">${noClassState()}</div>`;
  const dl = edit ? isoToWIB(edit.deadline) : { date: '', time: '15:00' };
  const subjects = [...new Set([...MAPEL_DEFAULT, ...state.tasks.map(t => t.subject)])];
  const def = state.activeClass !== 'all' ? [state.activeClass] : state.classes.length === 1 ? [state.classes[0].id] : [];
  el.innerHTML = `<div class="section-header"><h2>${edit ? 'Edit Tugas' : 'Buat Tugas Baru'}</h2><p>${edit ? 'Perubahan deadline akan menjadwalkan ulang pengingat otomatis' : 'Siswa di kelas tujuan akan langsung mendapat notifikasi'}</p></div>
    <div class="card form-card"><div class="form-grid">
      <div class="form-group col-2"><label>Kelas Tujuan <span class="req">*</span></label>
        <div class="check-list">${state.classes.map(c => `<label class="check-item"><input type="checkbox" name="fClass" value="${c.id}" ${edit ? (edit.class_id === c.id ? 'checked' : 'disabled') : def.includes(c.id) ? 'checked' : ''}> <span>${esc(c.name)}</span></label>`).join('')}</div>
        ${edit ? '<small class="form-hint">Kelas tidak dapat dipindah saat mengedit.</small>' : '<small class="form-hint">Pilih lebih dari satu untuk membuat tugas yang sama di beberapa kelas.</small>'}</div>
      <div class="form-group col-2"><label>Judul Tugas <span class="req">*</span></label><input id="fJudul" maxlength="120" value="${esc(edit?.title || '')}" placeholder="Contoh: Latihan Soal Matematika Bab 3"></div>
      <div class="form-group"><label>Mata Pelajaran <span class="req">*</span></label><input id="fMapel" list="mapelList" maxlength="60" value="${esc(edit?.subject || '')}" placeholder="Pilih atau ketik mapel"><datalist id="mapelList">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="form-group"><label>Tanggal Diberikan <span class="req">*</span></label><input type="date" id="fAssigned" value="${edit?.assigned_date || todayWIB()}"></div>
      <div class="form-group"><label>Tanggal Deadline <span class="req">*</span></label><input type="date" id="fDlDate" value="${dl.date}"></div>
      <div class="form-group"><label>Jam Deadline (WIB) <span class="req">*</span></label><input type="time" id="fDlTime" value="${dl.time}"></div>
      <div class="form-group col-2"><label>Deskripsi / Instruksi</label><textarea id="fDesk" rows="5" placeholder="Jelaskan instruksi tugas secara detail...">${esc(edit?.description || '')}</textarea></div></div>
      <div id="fErr" class="alert alert-error hidden"><i class="fas fa-exclamation-circle"></i> <span></span></div>
      <div class="form-actions"><button class="btn-secondary" data-action="go" data-route="${edit ? 'tugas' : 'dashboard'}"><i class="fas fa-xmark"></i> Batal</button>
        <button class="btn-primary" id="btnSaveTask" data-action="saveTask" data-id="${edit?.id || ''}"><i class="fas fa-save"></i> ${edit ? 'Simpan Perubahan' : 'Simpan Tugas'}</button></div></div>`;
};
ACTIONS.saveTask = async a => {
  const id = a.dataset.id, edit = id ? state.tasks.find(t => t.id === id) : null;
  const title = $('#fJudul').value.trim(), subject = $('#fMapel').value.trim(), desc = $('#fDesk').value.trim();
  const assigned = $('#fAssigned').value, dlDate = $('#fDlDate').value, dlTime = $('#fDlTime').value;
  const classes = $$('input[name="fClass"]:checked').map(i => i.value);
  const E = m => showErr('#fErr', m);
  if (!classes.length) return E('Pilih minimal satu kelas tujuan!');
  if (!title || !subject) return E('Judul dan mata pelajaran wajib diisi!');
  if (!assigned || !dlDate || !dlTime) return E('Tanggal diberikan dan deadline wajib diisi!');
  const deadline = wibToISO(dlDate, dlTime);
  if (dlDate < assigned) return E('Deadline tidak boleh sebelum tanggal diberikan!');
  if ((!edit || edit.deadline !== deadline) && new Date(deadline) <= new Date()) return E('Deadline harus di masa depan!');
  setBtnLoading(a, true, 'Menyimpan...');
  let error;
  if (edit) {
    ({ error } = await sb.from('tasks').update({ title, subject, description: desc, assigned_date: assigned, deadline }).eq('id', edit.id));
    if (!error) Object.assign(edit, { title, subject, description: desc, assigned_date: assigned, deadline });
  } else {
    const rows = classes.map(class_id => ({ class_id, title, subject, description: desc, assigned_date: assigned, deadline, created_by: state.me.id }));
    const r = await sb.from('tasks').insert(rows).select(); error = r.error;
    if (!error) r.data.forEach(t => { if (!state.tasks.some(x => x.id === t.id)) state.tasks.push(t); });
  }
  setBtnLoading(a, false);
  if (error) return E('Gagal menyimpan: ' + errMsg(error));
  showToast(edit ? 'Tugas diperbarui.' : `Tugas dibuat untuk ${classes.length} kelas. Siswa sudah diberi notifikasi.`, 'success');
  go('tugas');
};
