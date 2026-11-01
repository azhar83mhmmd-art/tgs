/* ===== Jadwal: kalender bulanan / mingguan / agenda ===== */
const KIND = {
  tugas: { label: 'Tugas', icon: 'fa-clipboard-list', cls: 'k-tugas' }, ujian: { label: 'Ujian', icon: 'fa-file-pen', cls: 'k-ujian' },
  kuis: { label: 'Kuis', icon: 'fa-circle-question', cls: 'k-kuis' }, presentasi: { label: 'Presentasi', icon: 'fa-person-chalkboard', cls: 'k-presentasi' },
  kegiatan: { label: 'Kegiatan Sekolah', icon: 'fa-flag', cls: 'k-kegiatan' }, deadline: { label: 'Deadline Tugas', icon: 'fa-hourglass-end', cls: 'k-deadline' },
};
let calView = 'bulan', calCursor = todayWIB();
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const addDays = (ds, n) => { const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = ds => (new Date(ds + 'T00:00:00Z').getUTCDay() + 6) % 7;            // Senin = 0
const fmtLongDate = ds => new Date(ds + 'T12:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function allEvents() {
  const ev = scopedSchedules().map(s => ({ type: 'schedule', id: s.id, kind: s.kind, title: s.title, date: s.event_date, start: s.start_time.slice(0, 5),
    end: s.end_time?.slice(0, 5), subject: s.subject, class_id: s.class_id, desc: s.description }));
  scopedTasks().forEach(t => { const w = isoToWIB(t.deadline); ev.push({ type: 'deadline', id: t.id, kind: 'deadline', title: t.title, date: w.date, start: w.time,
    subject: t.subject, class_id: t.class_id, done: !isGuru() && myDone(t.id) }); });
  return ev.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
function upcomingEvents() { const t = todayWIB(); return allEvents().filter(e => e.date >= t && !e.done); }
function eventRow(ev) {
  const k = KIND[ev.kind];
  return `<div class="event-row ${k.cls}" data-action="openEvent" data-type="${ev.type}" data-id="${ev.id}">
    <div class="event-date"><b>${ev.date.slice(8)}</b><small>${BULAN[+ev.date.slice(5, 7) - 1].slice(0, 3)}</small></div>
    <div class="event-info"><div class="event-title">${esc(ev.title)}</div>
      <small><i class="fas ${k.icon}"></i> ${k.label} · ${ev.start}${ev.end ? '–' + ev.end : ''} WIB ${ev.subject ? '· ' + esc(ev.subject) : ''} ${kelasTag(ev.class_id)}</small></div></div>`;
}
const chip = ev => `<div class="cal-chip ${KIND[ev.kind].cls} ${ev.done ? 'is-done' : ''}" data-action="openEvent" data-type="${ev.type}" data-id="${ev.id}" title="${esc(ev.title)}">${ev.start} ${esc(ev.title)}</div>`;

VIEWS.jadwal = (el) => {
  const events = allEvents(), byDate = {};
  events.forEach(e => (byDate[e.date] ||= []).push(e));
  const today = todayWIB();
  let title, body;
  if (calView === 'bulan') {
    const [y, m] = calCursor.split('-').map(Number), first = `${y}-${String(m).padStart(2, '0')}-01`;
    const start = addDays(first, -dow(first)); title = `${BULAN[m - 1]} ${y}`;
    const cells = []; for (let i = 0; i < 42; i++) { const d = addDays(start, i); cells.push(d); }
    const rowsN = cells[35].slice(5, 7) === String(m).padStart(2, '0') ? 6 : 5;
    body = `<div class="cal-grid">${HARI.map(h => `<div class="cal-dow">${h}</div>`).join('')}${cells.slice(0, rowsN * 7).map(d => {
      const evs = byDate[d] || [], inM = +d.slice(5, 7) === m;
      return `<div class="cal-cell ${inM ? '' : 'out'} ${d === today ? 'today' : ''}" data-action="openDay" data-date="${d}">
        <div class="cal-num">${+d.slice(8)}</div><div class="cal-evs">${evs.slice(0, 2).map(chip).join('')}${evs.length > 2 ? `<div class="cal-more">+${evs.length - 2} lagi</div>` : ''}</div>
        ${evs.length ? `<div class="cal-dots">${evs.slice(0, 4).map(e => `<i class="${KIND[e.kind].cls}"></i>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`;
  } else if (calView === 'minggu') {
    const start = addDays(calCursor, -dow(calCursor)), end = addDays(start, 6);
    title = `${fmtLongDate(start).split(',')[1].trim().replace(/ \d{4}$/, '')} – ${fmtLongDate(end).split(',')[1].trim()}`;
    body = `<div class="week-list">${Array.from({ length: 7 }, (_, i) => addDays(start, i)).map(d => `<div class="week-day ${d === today ? 'today' : ''}">
      <div class="week-head"><b>${HARI[dow(d)]}</b> ${+d.slice(8)} ${BULAN[+d.slice(5, 7) - 1].slice(0, 3)}</div>
      ${(byDate[d] || []).map(eventRow).join('') || '<small class="muted">Tidak ada agenda</small>'}</div>`).join('')}</div>`;
  } else {
    title = 'Agenda Mendatang';
    const up = events.filter(e => e.date >= today), groups = {}; up.forEach(e => (groups[e.date] ||= []).push(e));
    body = Object.keys(groups).length ? Object.entries(groups).map(([d, evs]) => `<div class="agenda-day"><div class="agenda-head">${d === today ? 'Hari ini · ' : ''}${fmtLongDate(d)}</div>${evs.map(eventRow).join('')}</div>`).join('')
      : emptyState('fa-calendar-check', 'Tidak ada agenda mendatang');
  }
  el.innerHTML = `<div class="section-header row-between"><div><h2><i class="fas fa-calendar-days"></i> Jadwal</h2><p>Tugas, ujian, kuis, presentasi, dan kegiatan sekolah</p></div>
      ${isGuru() && state.classes.length ? `<button class="btn-primary" data-action="editEvent" data-id=""><i class="fas fa-plus"></i> Tambah Jadwal</button>` : ''}</div>
    ${!state.classes.length ? `<div class="card">${noClassState()}</div>` : `
    <div class="cal-toolbar"><div class="seg">${[['bulan', 'Bulan'], ['minggu', 'Minggu'], ['agenda', 'Agenda']].map(v => `<button class="${calView === v[0] ? 'active' : ''}" data-action="calView" data-v="${v[0]}">${v[1]}</button>`).join('')}</div>
      ${calView !== 'agenda' ? `<div class="cal-nav"><button class="btn-icon" data-action="calNav" data-d="-1" aria-label="Sebelumnya"><i class="fas fa-chevron-left"></i></button><b>${esc(title)}</b>
        <button class="btn-icon" data-action="calNav" data-d="1" aria-label="Berikutnya"><i class="fas fa-chevron-right"></i></button><button class="chip" data-action="calToday">Hari ini</button></div>` : ''}</div>
    <div class="cal-legend">${Object.entries(KIND).map(([k, v]) => `<span class="${v.cls}"><i class="fas ${v.icon}"></i> ${v.label}</span>`).join('')}</div>
    <div class="card no-pad cal-card">${body}</div>`}`;
};
ACTIONS.calView = a => { calView = a.dataset.v; VIEWS.jadwal($('#view')); };
ACTIONS.calToday = () => { calCursor = todayWIB(); VIEWS.jadwal($('#view')); };
ACTIONS.calNav = a => {
  const n = +a.dataset.d;
  if (calView === 'bulan') { const [y, m] = calCursor.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); calCursor = d.toISOString().slice(0, 10); }
  else calCursor = addDays(calCursor, 7 * n);
  VIEWS.jadwal($('#view'));
};
ACTIONS.openDay = (a, e) => {
  const d = a.dataset.date, evs = allEvents().filter(x => x.date === d);
  openModal(`<div class="modal-title">${fmtLongDate(d)}</div>${evs.map(eventRow).join('') || '<p class="muted-center">Tidak ada agenda.</p>'}
    ${isGuru() && state.classes.length ? `<div class="modal-actions"><button class="btn-primary" data-action="editEvent" data-id="" data-date="${d}"><i class="fas fa-plus"></i> Tambah jadwal di tanggal ini</button></div>` : ''}`);
};
ACTIONS.openEvent = (a, e) => {
  e.stopPropagation();
  if (a.dataset.type === 'deadline') return openTask(a.dataset.id);
  const s = state.schedules.find(x => x.id === a.dataset.id); if (!s) return;
  const k = KIND[s.kind];
  openModal(`<div class="modal-mapel-tag"><span class="event-kind ${k.cls}"><i class="fas ${k.icon}"></i> ${k.label}</span> ${kelasTag(s.class_id)}</div>
    <div class="modal-title">${esc(s.title)}</div><div class="modal-desc">${nl2br(s.description) || '<em>Tidak ada deskripsi.</em>'}</div>
    <div class="modal-info-grid"><div class="modal-info-item"><div class="modal-info-label">Tanggal</div><div class="modal-info-value">${fmtLongDate(s.event_date)}</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Waktu</div><div class="modal-info-value">${s.start_time.slice(0, 5)}${s.end_time ? '–' + s.end_time.slice(0, 5) : ''} WIB</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Mata Pelajaran</div><div class="modal-info-value">${esc(s.subject || '-')}</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Kelas</div><div class="modal-info-value">${esc(className(s.class_id))}</div></div></div>
    ${isGuru() ? `<div class="modal-actions"><button class="btn-secondary" data-action="editEvent" data-id="${s.id}"><i class="fas fa-pen"></i> Edit</button><button class="btn-danger" data-action="deleteEvent" data-id="${s.id}"><i class="fas fa-trash"></i> Hapus</button></div>` : ''}`);
};
ACTIONS.editEvent = a => {
  const s = a.dataset.id ? state.schedules.find(x => x.id === a.dataset.id) : null;
  const def = state.activeClass !== 'all' ? state.activeClass : state.classes[0].id;
  const subjects = [...new Set([...MAPEL_DEFAULT, ...state.tasks.map(t => t.subject)])];
  openModal(`<div class="modal-title">${s ? 'Edit Jadwal' : 'Tambah Jadwal'}</div><div class="form-grid">
    <div class="form-group"><label>Kelas Tujuan *</label><select id="eClass" ${s ? 'disabled' : ''}>${state.classes.map(c => `<option value="${c.id}" ${(s?.class_id || def) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Jenis Kegiatan *</label><select id="eKind">${['tugas', 'ujian', 'kuis', 'presentasi', 'kegiatan'].map(k => `<option value="${k}" ${(s?.kind || 'ujian') === k ? 'selected' : ''}>${KIND[k].label}</option>`).join('')}</select></div>
    <div class="form-group col-2"><label>Judul *</label><input id="eTitle" maxlength="120" value="${esc(s?.title || '')}"></div>
    <div class="form-group"><label>Mata Pelajaran</label><input id="eSubject" list="mapelList2" value="${esc(s?.subject || '')}"><datalist id="mapelList2">${subjects.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="form-group"><label>Tanggal *</label><input type="date" id="eDate" value="${s?.event_date || a.dataset.date || todayWIB()}"></div>
    <div class="form-group"><label>Jam Mulai (WIB) *</label><input type="time" id="eStart" value="${s?.start_time.slice(0, 5) || '07:00'}"></div>
    <div class="form-group"><label>Jam Selesai (opsional)</label><input type="time" id="eEnd" value="${s?.end_time?.slice(0, 5) || ''}"></div>
    <div class="form-group col-2"><label>Deskripsi</label><textarea id="eDesc" rows="3">${esc(s?.description || '')}</textarea></div></div>
    <div id="eErr" class="alert alert-error hidden"><i class="fas fa-exclamation-circle"></i> <span></span></div>
    <div class="modal-actions"><button class="btn-secondary" data-action="closeModal">Batal</button><button class="btn-primary" data-action="saveEvent" data-id="${s?.id || ''}"><i class="fas fa-save"></i> Simpan</button></div>`);
};
ACTIONS.saveEvent = async a => {
  const id = a.dataset.id, row = { title: $('#eTitle').value.trim(), kind: $('#eKind').value, subject: $('#eSubject').value.trim() || null,
    event_date: $('#eDate').value, start_time: $('#eStart').value, end_time: $('#eEnd').value || null, description: $('#eDesc').value.trim() || null };
  if (!row.title || !row.event_date || !row.start_time) return showErr('#eErr', 'Judul, tanggal, dan jam mulai wajib diisi!');
  if (row.end_time && row.end_time <= row.start_time) return showErr('#eErr', 'Jam selesai harus setelah jam mulai!');
  setBtnLoading(a, true, 'Menyimpan...');
  let r;
  if (id) r = await sb.from('schedules').update(row).eq('id', id).select().single();
  else r = await sb.from('schedules').insert({ ...row, class_id: $('#eClass').value, created_by: state.me.id }).select().single();
  setBtnLoading(a, false);
  if (r.error) return showErr('#eErr', 'Gagal menyimpan: ' + errMsg(r.error));
  const i = state.schedules.findIndex(x => x.id === r.data.id); if (i >= 0) state.schedules[i] = r.data; else state.schedules.push(r.data);
  closeModal(); showToast(id ? 'Jadwal diperbarui.' : 'Jadwal dibuat. Siswa sudah diberi notifikasi.', 'success'); renderRoute();
};
ACTIONS.deleteEvent = async a => {
  if (!await confirmDialog({ title: 'Hapus jadwal ini?', message: 'Jadwal akan hilang dari kalender seluruh siswa.' })) return;
  const { error } = await sb.from('schedules').delete().eq('id', a.dataset.id);
  if (error) return showToast('Gagal menghapus: ' + errMsg(error), 'error');
  state.schedules = state.schedules.filter(x => x.id !== a.dataset.id); closeModal(); showToast('Jadwal dihapus.', 'info'); renderRoute();
};
