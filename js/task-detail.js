/* ===== Modal Detail Tugas (redesign) =====
   - Countdown real-time dari deadline asli di database (getDeadlineInfo di util.js)
   - Status 3 tingkat per siswa (belum | proses | selesai), disimpan ke Supabase LEBIH DULU, baru tampilan berubah
   - Progress, animasi penyelesaian, salin detail, tambah ke kalender (.ics), riwayat perubahan status
   Status bersifat pribadi: RLS di database membatasi siswa hanya pada barisnya sendiri (sql/02, sql/12). */

/* ----- Ikon SVG (gaya Lucide) ----- */
const TD_ICONS = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  calendarPlus: '<path d="M8 2v4M16 2v4M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8M3 10h18M16 19h6M19 16v6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  pen: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6l-4 1 1-4z"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  // ikon mata pelajaran
  calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8M16 14v4M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
  flask: '<path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5L14.2 10.4a2 2 0 0 1-.2-.9V2M8.5 2h7M7 16h10"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
  bookOpen: '<path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  languages: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.7-1.7H16c3 0 5.5-2.5 5.5-5.5C21.5 6 17.5 2 12 2z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
};
const tdSvg = (name, size = 18, cls = '') =>
  `<svg class="td-svg ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TD_ICONS[name] || ''}</svg>`;
function tdSubjectIcon(subject) {
  const s = String(subject || '').toLowerCase();
  const map = [[/mat|aritmat|aljabar|geometri/, 'calc'], [/ipa|biolog|fisika|kimia|sains/, 'flask'], [/ips|sejarah|geograf|ekonomi|sosiolog/, 'globe'],
    [/inggris|english/, 'languages'], [/pkn|ppkn|pancasila|kewarganegaraan/, 'landmark'], [/agama|pai\b|islam|kristen|katolik|hindu|budha|buddha/, 'heart'],
    [/seni|budaya|prakarya|musik/, 'palette'], [/penjas|jasmani|olahraga|pjok/, 'activity'], [/tik|informatika|komputer|teknologi|coding|program/, 'monitor'],
    [/indonesia|sastra|bahasa/, 'bookOpen']];
  return (map.find(([re]) => re.test(s)) || [null, 'book'])[1];
}

/* ----- State modal (satu modal tugas aktif pada satu waktu) ----- */
const TD_ORDER = TASK_STATUSES;                       // belum, proses, selesai
const TD_STATUS_ICON = { belum: 'circle', proses: 'pen', selesai: 'check' };
const TD_STATUS_TXT = { belum: ['Belum', 'Dikerjakan'], proses: ['Sedang', 'Dikerjakan'], selesai: ['Sudah', 'Selesai'] };
const tdFresh = id => ({ id, busy: null, err: '', historyOpen: false, history: null, hLoading: false, hErr: '', hTok: 0, sig: '', timer: null, celeb: null });
let TD = tdFresh(null);

function tdCleanup() {
  clearInterval(TD.timer); TD.celeb?.remove();
  const m = $('#modalOverlay .modal'); ['role', 'aria-modal', 'aria-label'].forEach(a => m?.removeAttribute(a));
  TD = tdFresh(null);
}
const tdTask = () => state.tasks.find(x => x.id === TD.id);
/* tanda tangan data yang tampil: modal dirender ulang hanya bila ini berubah (hemat & tidak mengganggu scroll/animasi) */
function tdSig(t) {
  const r = isGuru() ? null : statusRow(t.id, state.me.id), p = isGuru() ? taskProgress(t) : null;
  return JSON.stringify([t.title, t.description, t.subject, t.deadline, t.assigned_date, t.class_id, className(t.class_id), r?.status, r?.is_done, r?.updated_at, p && [p.done, p.total], isGuru()]);
}

/* ----- Potongan tampilan ----- */
function tdPill(t) {
  if (isGuru()) return isOverdue(t)
    ? `<span class="td-pill expired">${tdSvg('clock', 14)} Lewat deadline</span>`
    : `<span class="td-pill proses">${tdSvg('clock', 14)} Aktif</span>`;
  const s = myStatus(t.id);
  return `<span class="td-pill ${s}">${tdSvg(TD_STATUS_ICON[s], 14)} ${STATUS_LABEL[s]}</span>`;
}
function tdProgressHTML(pctVal, s) {
  return `<div class="td-prog" data-s="${s}"><div class="td-prog-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctVal}" aria-label="Progress tugas">
    <div class="td-prog-fill" style="width:${pctVal}%"></div></div>
    <div class="td-prog-marks"><span class="${pctVal >= 0 ? 'on' : ''}">0%</span><span class="${pctVal >= 50 ? 'on' : ''}">50%</span><span class="${pctVal >= 100 ? 'on' : ''}">100%</span></div></div>`;
}
function tdUpdatedText(t) {
  if (TD.busy) return 'Menyimpan perubahan…';
  const row = statusRow(t.id, state.me.id);
  return row ? `Terakhir diperbarui ${fmtDateTime(row.updated_at)}` : 'Belum pernah diubah (default: Belum Dikerjakan)';
}
function tdStudentSection(t) {
  const s = myStatus(t.id), i = TD_ORDER.indexOf(s);
  const btn = k => `<button type="button" class="td-seg-btn ${k === s ? 'active' : ''}" data-action="tdStatus" data-id="${t.id}" data-status="${k}"
      aria-pressed="${k === s}" aria-label="${STATUS_LABEL[k]}" ${TD.busy ? 'disabled' : ''}>
      <span class="td-ic">${tdSvg(TD_STATUS_ICON[k], 20)}</span><b>${TD_STATUS_TXT[k][0]}</b><span>${TD_STATUS_TXT[k][1]}</span></button>`;
  return `<section class="td-sec" id="tdStatus" aria-labelledby="tdStatusH">
    <div class="td-sec-head"><h3 id="tdStatusH">Status Tugasmu</h3><span class="td-pct" id="tdPct">${STATUS_PCT[s]}%</span></div>
    <div class="td-seg" data-i="${i}" data-s="${s}" role="group" aria-label="Pilih status tugasmu"><span class="td-seg-thumb" aria-hidden="true"></span>${TD_ORDER.map(btn).join('')}</div>
    ${tdProgressHTML(STATUS_PCT[s], s)}
    <p class="td-upd" id="tdUpd" aria-live="polite">${esc(tdUpdatedText(t))}</p>
    <div class="td-err ${TD.err ? '' : 'hidden'}" id="tdErr" role="alert">${tdSvg('alert', 16)}<span>${esc(TD.err)}</span></div>
  </section>`;
}
function tdTeacherSection(t) {
  const p = taskProgress(t);
  return `<section class="td-sec" aria-labelledby="tdStatusH">
    <div class="td-sec-head"><h3 id="tdStatusH">Penyelesaian Siswa</h3><span class="td-pct">${p.pct}%</span></div>
    ${tdProgressHTML(p.pct, p.pct >= 100 ? 'selesai' : p.pct > 0 ? 'proses' : 'belum')}
    <p class="td-upd">${p.done} selesai · ${p.belum} belum selesai · ${p.total} siswa</p>
    <div class="td-teacher-actions">
      <button type="button" class="td-btn" data-action="go" data-route="monitor" data-key="task" data-id="${t.id}">${tdSvg('list', 16)} Task Monitor</button>
      <button type="button" class="td-btn" data-action="editTask" data-id="${t.id}">${tdSvg('edit', 16)} Edit</button>
      <button type="button" class="td-btn danger" data-action="deleteTask" data-id="${t.id}">${tdSvg('trash', 16)} Hapus</button></div>
  </section>`;
}
function tdHTML(t) {
  const info = getDeadlineInfo(t.deadline), g = isGuru();
  TD.sig = tdSig(t);
  return `<div class="td" data-task="${t.id}">
    <header class="td-head">
      <div class="td-head-top">
        <span class="td-subj-ic">${tdSvg(tdSubjectIcon(t.subject), 22)}</span>
        <div class="td-subj"><b>${esc(t.subject)}</b><span>${esc(className(t.class_id))}</span></div>
      </div>
      <div class="td-head-pill" id="tdPillWrap">${tdPill(t)}</div>
      <h2 class="td-title">${esc(t.title)}</h2>
    </header>
    <div class="td-body">
      <p class="td-desc ${t.description ? '' : 'empty'}">${nl2br(t.description) || 'Tidak ada deskripsi.'}</p>
      <div class="td-cd ${info.type}" id="tdCd">
        <span class="td-cd-ic">${tdSvg('clock', 22)}</span>
        <div class="td-cd-main"><small id="tdCdLabel">${info.expired ? 'Status deadline' : 'Sisa waktu'}</small><strong id="tdCdText">${esc(info.text)}</strong>
          <span class="td-cd-date">${fmtDeadlineLong(t.deadline)}</span></div>
      </div>
      <dl class="td-meta">
        <div><dt>${tdSvg('calendar', 16)} Diberikan</dt><dd>${fmtDate(t.assigned_date + 'T12:00:00+07:00')}</dd></div>
        <div><dt>${tdSvg('users', 16)} Kelas</dt><dd>${esc(className(t.class_id))}</dd></div>
      </dl>
      ${g ? tdTeacherSection(t) : tdStudentSection(t)}
      <div class="td-actions" role="group" aria-label="Aksi tugas">
        <button type="button" class="td-act" data-action="tdCopy" data-id="${t.id}">${tdSvg('copy', 18)}<span>Salin</span></button>
        <button type="button" class="td-act" data-action="tdCal" data-id="${t.id}">${tdSvg('calendarPlus', 18)}<span>Kalender</span></button>
        <button type="button" class="td-act ${TD.historyOpen ? 'active' : ''}" id="tdHistBtn" data-action="tdHistory" data-id="${t.id}" aria-expanded="${TD.historyOpen}" aria-controls="tdHistory">${tdSvg('history', 18)}<span>Riwayat</span></button>
      </div>
      <section class="td-history ${TD.historyOpen ? '' : 'hidden'}" id="tdHistory" aria-label="Riwayat perubahan status">${tdHistoryInner()}</section>
    </div>
  </div>`;
}
const fmtDeadlineLong = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }) + ' · ' + fmtTimeOnly(iso) + ' WIB';
};

/* ----- Buka / render ulang ----- */
function openTask(id, silent) {
  const t = state.tasks.find(x => x.id === id); if (!t) return closeModal();
  if (!isGuru() && !silent) sb.rpc('log_task_view', { p_task: id }).then(() => {});
  const isOpen = !$('#modalOverlay').classList.contains('hidden');
  if (!isOpen || TD.id !== id) {
    runModalCleanups();                               // bersihkan modal lama (timer, overlay) sebelum state baru dibuat
    TD = tdFresh(id);
    openModal(tdHTML(t), { task: true });
    const m = $('#modalOverlay .modal'); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Detail tugas');
    modalCleanups.push(tdCleanup);
    tdStartTimer();
    return;
  }
  if (tdSig(t) === TD.sig) return;                    // tidak ada perubahan data -> jangan ganggu tampilan
  const sc = $('.td-body')?.scrollTop || 0;
  $('#modalContent').innerHTML = tdHTML(t);
  const body = $('.td-body'); if (body) body.scrollTop = sc;
  tdStartTimer();
}
function refreshOpenModal() {
  if ($('#modalOverlay').classList.contains('hidden')) return;
  const id = $('#modalContent [data-task]')?.dataset.task; if (id) openTask(id, true);
}

/* ----- Countdown real-time ----- */
function tdStartTimer() { clearInterval(TD.timer); tdTick(); TD.timer = setInterval(tdTick, 1000); }
function tdTick() {
  const t = tdTask(), box = $('#tdCd'); if (!t || !box) return;
  const info = getDeadlineInfo(t.deadline), txt = $('#tdCdText');
  if (txt.textContent !== info.text) txt.textContent = info.text;
  const cls = 'td-cd ' + info.type;
  if (box.className !== cls) {
    box.className = cls;
    $('#tdCdLabel').textContent = info.expired ? 'Status deadline' : 'Sisa waktu';
    const w = $('#tdPillWrap'); if (w) w.innerHTML = tdPill(t);
  }
}

/* ----- Simpan status (database dulu, tampilan sesudahnya) ----- */
const tdMissingColumn = e => !!e && (e.code === 'PGRST204' || e.code === '42703' || /column .*status|schema cache/i.test(e.message || ''));
async function persistStatus(taskId, status) {
  const base = { task_id: taskId, student_id: state.me.id };
  const up = payload => sb.from('task_status').upsert({ ...base, ...payload }, { onConflict: 'task_id,student_id' }).select().single();
  let r = await up({ status, is_done: status === 'selesai' });
  if (r.error && tdMissingColumn(r.error)) {          // database belum dimigrasi (sql/12): kembali ke mode lama 2 status
    if (status === 'proses') return { data: null, error: { message: 'Status "Sedang Dikerjakan" butuh pembaruan database. Jalankan sql/12_status_riwayat.sql di Supabase.' } };
    r = await up({ is_done: status === 'selesai' });
  }
  return r;
}
async function tdSetStatus(taskId, status) {
  if (isGuru() || TD.busy || TD.id !== taskId || !TD_ORDER.includes(status)) return;
  if (myStatus(taskId) === status) return;
  TD.busy = status; TD.err = ''; tdPatchStatus();
  const { data, error } = await persistStatus(taskId, status);
  const stillOpen = TD.id === taskId;
  if (stillOpen) TD.busy = null;
  if (error) {
    const msg = errMsg(error);
    if (stillOpen) { TD.err = 'Gagal menyimpan status: ' + msg; tdPatchStatus(); }
    return showToast('Gagal menyimpan status: ' + msg, 'error');
  }
  const row = statusRow(taskId, state.me.id);
  if (row) Object.assign(row, data); else state.statuses.push({ ...data });
  const saved = statusRow(taskId, state.me.id); if (!saved.status || !TD_ORDER.includes(saved.status)) saved.status = status;
  updateBadges(); rerenderSoft();
  if (stillOpen) { TD.history = null; tdPatchStatus(); if (TD.historyOpen) tdLoadHistory(); }
  showToast(status === 'selesai' ? 'Status diperbarui: Sudah Selesai' : `Status diperbarui: ${STATUS_LABEL[status]}`, 'success');
  if (status === 'selesai' && stillOpen) tdCelebrate();
}
/* Perbarui bagian status pada DOM yang sudah ada (agar transisi geser tetap halus) */
function tdPatchStatus() {
  const t = tdTask(), root = $('#tdStatus'); if (!t || !root) return;
  const s = myStatus(t.id), seg = $('.td-seg', root);
  seg.dataset.i = TD_ORDER.indexOf(s); seg.dataset.s = s; seg.classList.toggle('busy', !!TD.busy);
  $$('.td-seg-btn', root).forEach(b => {
    const on = b.dataset.status === s;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); b.disabled = !!TD.busy; b.classList.toggle('loading', TD.busy === b.dataset.status);
  });
  $('#tdPct').textContent = STATUS_PCT[s] + '%';
  const pr = $('.td-prog', root), pv = STATUS_PCT[s];            // ubah elemen yang ada agar lebar progress beranimasi
  pr.dataset.s = s; $('.td-prog-fill', pr).style.width = pv + '%'; $('[role=progressbar]', pr).setAttribute('aria-valuenow', pv);
  $$('.td-prog-marks span', pr).forEach((m, i) => m.classList.toggle('on', pv >= [0, 50, 100][i]));
  $('#tdUpd').textContent = tdUpdatedText(t);
  const err = $('#tdErr'); err.classList.toggle('hidden', !TD.err); $('span', err).textContent = TD.err;
  const w = $('#tdPillWrap'); if (w) w.innerHTML = tdPill(t);
  TD.sig = tdSig(t);
}
ACTIONS.tdStatus = a => tdSetStatus(a.dataset.id, a.dataset.status);

/* ----- Animasi penyelesaian ----- */
function tdCelebrate() {
  const m = $('#modalOverlay .modal'); if (!m) return;
  TD.celeb?.remove();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cols = ['#6366f1', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'];
  const pieces = reduce ? '' : Array.from({ length: 26 }, (_, i) => {
    const dx = Math.round((Math.random() - .5) * 340), uy = -Math.round(60 + Math.random() * 90), dy = Math.round(80 + Math.random() * 170);
    return `<i style="--dx:${dx}px;--uy:${uy}px;--dy:${dy}px;--rot:${Math.round(Math.random() * 720 - 360)}deg;--c:${cols[i % cols.length]};--d:${(Math.random() * .12).toFixed(2)}s;--w:${6 + (i % 3) * 2}px"></i>`;
  }).join('');
  const el = document.createElement('div'); el.className = 'td-celebrate'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="td-cele-card"><svg class="td-cele-check" viewBox="0 0 52 52" width="52" height="52" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle class="c" cx="26" cy="26" r="23"/><path class="k" d="M15 27.5l8 8 14.5-16"/></svg>
    <div class="td-cele-msg">Hebat! Satu tugas berhasil diselesaikan.</div></div><div class="td-confetti">${pieces}</div>`;
  m.appendChild(el); TD.celeb = el;
  setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); if (TD.celeb === el) TD.celeb = null; }, 260); }, 2300);
}

/* ----- Aksi: salin detail ----- */
function tdPlainText(t) {
  const info = getDeadlineInfo(t.deadline);
  return [t.title, '',
    `Mata pelajaran: ${t.subject}`, `Kelas: ${className(t.class_id)}`,
    `Diberikan: ${fmtDate(t.assigned_date + 'T12:00:00+07:00')}`, `Deadline: ${fmtDateTime(t.deadline)}`,
    `Sisa waktu: ${info.text}`, ...(isGuru() ? [] : [`Status: ${STATUS_LABEL[myStatus(t.id)]}`]),
    '', 'Deskripsi:', t.description || 'Tidak ada deskripsi.'].join('\n');
}
async function tdCopyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {                                               // cadangan untuk konteks tanpa Clipboard API (mis. HTTP / WebView lama)
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
ACTIONS.tdCopy = async a => {
  const t = state.tasks.find(x => x.id === a.dataset.id); if (!t) return;
  if (await tdCopyText(tdPlainText(t))) showToast('Detail tugas disalin ke papan klip', 'success');
  else showToast('Tidak dapat menyalin. Izinkan akses papan klip di browser.', 'error');
};

/* ----- Aksi: tambah ke kalender (.ics) ----- */
const icsEsc = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
const icsTime = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function tdIcs(t) {
  const end = new Date(t.deadline), start = new Date(end.getTime() - 30 * 60000);
  const desc = `Mata pelajaran: ${t.subject}\nKelas: ${className(t.class_id)}\nDeadline: ${fmtDateTime(t.deadline)}` + (t.description ? `\n\n${t.description}` : '');
  const alarm = (trig, text) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(text)}`, `TRIGGER:${trig}`, 'END:VALARM'];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TugasKu//Deadline Tugas//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:task-${t.id}@tugasku`, `DTSTAMP:${icsTime(Date.now())}`, `DTSTART:${icsTime(start)}`, `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsEsc(`Deadline ${t.subject}: ${t.title}`)}`, `DESCRIPTION:${icsEsc(desc)}`,
    ...alarm('-P1D', `Besok deadline: ${t.title}`), ...alarm('-PT1H', `1 jam lagi deadline: ${t.title}`),
    'END:VEVENT', 'END:VCALENDAR'].map(icsFold).join('\r\n') + '\r\n';
}
ACTIONS.tdCal = async a => {
  const t = state.tasks.find(x => x.id === a.dataset.id); if (!t) return;
  const name = 'tugas-' + (t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'deadline') + '.ics';
  const file = new File([tdIcs(t)], name, { type: 'text/calendar' });
  try {
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {   // ponsel: lembar bagikan -> pilih aplikasi Kalender
      await navigator.share({ files: [file], title: t.title }); return;
    }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast('File kalender diunduh. Buka file tersebut untuk menambahkannya ke kalender.', 'success');
};

/* ----- Riwayat perubahan status ----- */
function tdHistoryInner() {
  if (TD.hLoading) return `<div class="td-hist-load"><span class="td-spin"></span> Memuat riwayat…</div>`;
  if (TD.hErr) return `<div class="td-err">${tdSvg('alert', 16)}<span>${esc(TD.hErr)}</span></div>`;
  if (!TD.history) return '';
  if (!TD.history.length) return `<p class="td-hist-empty">Belum ada perubahan status.</p>`;
  const g = isGuru();
  return `<h3 class="td-hist-h">Riwayat Status</h3><ol class="td-hist-list">${TD.history.map(h => {
    const by = !h.changed_by ? 'Sistem' : h.changed_by === state.me.id ? 'Kamu' : (state.profiles.get(h.changed_by)?.full_name || 'Pengguna');
    const who = g ? `${esc(state.profiles.get(h.student_id)?.full_name || 'Siswa')} · diubah oleh ${esc(by)}` : `Diubah oleh ${esc(by)}`;
    return `<li class="td-hi"><span class="td-hi-dot ${h.new_status}"></span><div class="td-hi-body">
      <div class="td-hi-main"><span class="td-chip ${h.old_status}">${esc(STATUS_LABEL[h.old_status] || h.old_status)}</span>${tdSvg('arrow', 14)}<span class="td-chip ${h.new_status}">${esc(STATUS_LABEL[h.new_status] || h.new_status)}</span></div>
      <div class="td-hi-meta">${fmtDateTime(h.changed_at)} · ${who}</div></div></li>`;
  }).join('')}</ol>`;
}
function tdPaintHistory() {
  const box = $('#tdHistory'); if (!box) return;
  box.classList.toggle('hidden', !TD.historyOpen); box.innerHTML = tdHistoryInner();
  const b = $('#tdHistBtn'); if (b) { b.classList.toggle('active', TD.historyOpen); b.setAttribute('aria-expanded', TD.historyOpen); }
}
async function tdLoadHistory() {
  const id = TD.id, tok = ++TD.hTok;
  TD.hLoading = true; TD.hErr = ''; tdPaintHistory();
  let q = sb.from('task_status_history').select('*').eq('task_id', id).order('changed_at', { ascending: false }).limit(100);
  if (!isGuru()) q = q.eq('student_id', state.me.id);
  const { data, error } = await q;
  if (TD.id !== id || tok !== TD.hTok) return;       // modal sudah berganti / ada permintaan yang lebih baru
  TD.hLoading = false;
  if (error) TD.hErr = (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || ''))
    ? 'Riwayat belum aktif. Jalankan sql/12_status_riwayat.sql di Supabase.' : 'Gagal memuat riwayat: ' + errMsg(error);
  else TD.history = data;
  tdPaintHistory();
}
ACTIONS.tdHistory = () => {
  if (!TD.id) return;
  TD.historyOpen = !TD.historyOpen;
  if (TD.historyOpen && !TD.history && !TD.hLoading) tdLoadHistory(); else tdPaintHistory();
  if (TD.historyOpen) setTimeout(() => $('#tdHistory')?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 60);
};
