/* ===== Buku Dikumpul: buku yang masih berada di guru (belum dibagikan ke siswa) ===== */
const scopedBooks = () => { const ids = new Set(scopeIds()); return state.books.filter(b => ids.has(b.class_id)); };
const heldBooks = () => scopedBooks().filter(b => b.status === 'dikumpul');
const bookChip = t => state.books.some(b => b.task_id === t.id && b.status === 'dikumpul')
  ? `<span class="book-chip" title="Buku untuk tugas ini masih berada di guru"><i class="fas fa-book"></i> Buku masih di guru</span>` : '';

function bookCard(b) {
  const g = isGuru(), held = b.status === 'dikumpul', t = b.task_id ? state.tasks.find(x => x.id === b.task_id) : null;
  return `<div class="book-card ${held ? 'held' : 'back'}" id="book-${b.id}">
    <div class="book-ico">${held ? '📚' : '📖'}</div>
    <div class="book-main">
      <div class="book-top"><b>Buku ${esc(b.subject)}</b>
        <span class="book-badge ${held ? 'held' : 'back'}">${held ? 'Masih di guru' : 'Sudah dibagikan'}</span></div>
      <div class="book-meta">${kelasTag(b.class_id)} <small>${held ? 'Dikumpulkan ' + fmtDateTime(b.collected_at) : 'Dibagikan ' + fmtDateTime(b.returned_at)}</small></div>
      ${t ? `<div class="book-meta"><small><i class="fas fa-link"></i> Tugas: <a href="#/tugas?task=${t.id}">${esc(t.title)}</a></small></div>` : ''}
      ${b.note ? `<div class="book-note">${nl2br(b.note)}</div>` : ''}
    </div>
    ${g ? `<div class="book-actions">
      ${held ? `<button class="btn-primary btn-sm" data-action="bookBack" data-id="${b.id}"><i class="fas fa-hand-holding"></i> Sudah dibagikan</button>`
             : `<button class="btn-secondary btn-sm" data-action="bookAgain" data-id="${b.id}"><i class="fas fa-rotate-left"></i> Kumpulkan lagi</button>`}
      <button class="btn-icon-danger" data-action="bookDelete" data-id="${b.id}" aria-label="Hapus"><i class="fas fa-trash"></i></button></div>` : ''}
  </div>`;
}

VIEWS.buku = el => {
  const g = isGuru(), all = scopedBooks();
  const held = all.filter(b => b.status === 'dikumpul').sort((a, b) => new Date(b.collected_at) - new Date(a.collected_at));
  const back = all.filter(b => b.status === 'dibagikan').sort((a, b) => new Date(b.returned_at) - new Date(a.returned_at)).slice(0, 20);
  el.innerHTML = `<div class="section-header row-between"><div><h2><i class="fas fa-book"></i> Buku Dikumpul</h2><p>Buku yang masih berada di guru dan belum dibagikan ke siswa</p></div>
    ${g && state.booksReady && state.classes.length ? `<button class="btn-primary" data-action="bookEdit"><i class="fas fa-plus"></i> Tandai Buku Dikumpul</button>` : ''}</div>
    ${!state.classes.length ? `<div class="card">${noClassState()}</div>`
    : !state.booksReady ? `<div class="alert alert-error"><i class="fas fa-circle-info"></i> <span>Fitur ini belum aktif di database. Jalankan <b>sql/16_buku_dikumpul.sql</b> di Supabase.</span></div>`
    : `${!g && held.length ? `<div class="book-alert"><i class="fas fa-book-open"></i><span><b>${held.length} buku masih ada di guru:</b> ${held.map(b => esc(b.subject)).join(', ')}. Kamu akan diberi tahu saat dibagikan.</span></div>` : ''}
      <h3 class="book-h">Masih di guru <span class="book-count">${held.length}</span></h3>
      ${held.length ? `<div class="book-list">${held.map(bookCard).join('')}</div>` : emptyState('fa-book', g ? 'Tidak ada buku yang sedang dikumpulkan' : 'Semua bukumu sudah ada di tanganmu')}
      ${back.length ? `<h3 class="book-h">Sudah dibagikan</h3><div class="book-list">${back.map(bookCard).join('')}</div>` : ''}`}`;
};

ACTIONS.bookEdit = () => {
  const def = state.activeClass !== 'all' ? state.activeClass : state.classes[0]?.id;
  const subjects = [...new Set([...MAPEL_DEFAULT, ...state.tasks.map(t => t.subject)])].sort((a, b) => a.localeCompare(b, 'id'));
  openModal(`<div class="modal-title">Tandai Buku Dikumpul</div><div class="form-grid">
    <div class="form-group col-2"><label>Kelas *</label><select id="bkClass" data-action-change="bookClass">${state.classes.map(c => `<option value="${c.id}" ${c.id === def ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="form-group col-2"><label>Mata Pelajaran *</label><input id="bkSubject" list="bkSubjects" maxlength="60" placeholder="mis. Matematika"><datalist id="bkSubjects">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
    <div class="form-group col-2"><label>Tautkan ke tugas (opsional)</label><select id="bkTask"></select></div>
    <div class="form-group col-2"><label>Catatan (opsional)</label><textarea id="bkNote" rows="2" maxlength="300" placeholder="mis. Dikumpulkan untuk dinilai, dibagikan hari Senin"></textarea></div></div>
    <div id="bkErr" class="alert alert-error hidden"><i class="fas fa-exclamation-circle"></i> <span></span></div>
    <div class="modal-actions"><button class="btn-secondary" data-action="closeModal">Batal</button><button class="btn-primary" data-action="bookSave"><i class="fas fa-check"></i> Simpan</button></div>`);
  fillBookTasks();
};
function fillBookTasks() {
  const cid = $('#bkClass')?.value, sel = $('#bkTask'); if (!sel) return;
  sel.innerHTML = `<option value="">— Tanpa tautan —</option>` + state.tasks.filter(t => t.class_id === cid).sort((a, b) => new Date(b.deadline) - new Date(a.deadline)).map(t => `<option value="${t.id}">${esc(t.subject)} — ${esc(t.title)}</option>`).join('');
}
document.addEventListener('change', e => { if (e.target.closest('[data-action-change="bookClass"]')) fillBookTasks(); });
ACTIONS.bookSave = async a => {
  const class_id = $('#bkClass').value, subject = $('#bkSubject').value.trim(), note = $('#bkNote').value.trim(), task_id = $('#bkTask').value || null;
  if (!subject) return showErr('#bkErr', 'Mata pelajaran wajib diisi!');
  setBtnLoading(a, true, 'Menyimpan...');
  const { data, error } = await sb.from('book_collections').insert({ class_id, subject, note: note || null, task_id, created_by: state.me.id }).select().single();
  setBtnLoading(a, false);
  if (error) return showErr('#bkErr', 'Gagal: ' + errMsg(error));
  if (!state.books.some(b => b.id === data.id)) state.books.unshift(data);
  closeModal(); showToast('Buku ditandai dikumpulkan — siswa diberi tahu.', 'success'); updateBadges(); renderRoute();
};
async function bookSetStatus(id, status, okMsg) {
  const { data, error } = await sb.from('book_collections').update({ status }).eq('id', id).select().single();
  if (error) return showToast('Gagal: ' + errMsg(error), 'error');
  const i = state.books.findIndex(b => b.id === id); if (i >= 0) state.books[i] = data;
  showToast(okMsg, 'success'); updateBadges(); renderRoute();
}
ACTIONS.bookBack = a => bookSetStatus(a.dataset.id, 'dibagikan', 'Ditandai sudah dibagikan — siswa diberi tahu.');
ACTIONS.bookAgain = a => bookSetStatus(a.dataset.id, 'dikumpul', 'Buku ditandai dikumpulkan lagi.');
ACTIONS.bookDelete = async a => {
  if (!await confirmDialog({ title: 'Hapus catatan buku ini?', message: 'Catatan akan hilang untuk seluruh siswa.' })) return;
  const { error } = await sb.from('book_collections').delete().eq('id', a.dataset.id);
  if (error) return showToast('Gagal menghapus: ' + errMsg(error), 'error');
  state.books = state.books.filter(b => b.id !== a.dataset.id); showToast('Catatan buku dihapus.', 'info'); updateBadges(); renderRoute();
};
