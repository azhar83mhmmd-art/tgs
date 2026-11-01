/* ===== Utilitas umum ===== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const nl2br = v => esc(v).replace(/\n/g, '<br>');

/* Tanggal selalu ditampilkan / dimasukkan dalam WIB (Asia/Jakarta). */
function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) + ', ' +
         d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).replace('.', ':') + ' WIB';
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}
function fmtTimeOnly(iso) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).replace('.', ':');
}
function fmtAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 604800) return Math.floor(s / 86400) + ' hari lalu';
  return fmtDate(iso);
}
/* "2026-11-10" + "20:00" (WIB) -> ISO */
function wibToISO(dateStr, timeStr) { return new Date(`${dateStr}T${timeStr || '00:00'}:00+07:00`).toISOString(); }
/* ISO -> {date:'YYYY-MM-DD', time:'HH:mm'} di WIB */
function isoToWIB(iso) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
const todayWIB = () => isoToWIB(new Date().toISOString()).date;

function getCountdown(iso) {
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return { text: 'Lewat deadline', type: 'expired' };
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  if (h < 24) return { text: h > 0 ? `${h}j ${m}m lagi` : `${m}m lagi`, type: h < 6 ? 'urgent' : 'warning' };
  const d = Math.floor(h / 24);
  return { text: `${d} hari lagi`, type: d <= 2 ? 'warning' : 'normal' };
}

/* Countdown detail untuk modal tugas. Selalu dihitung dari deadline asli (timestamptz di database).
   Warna: >3 hari normal (ungu/biru) | 1–3 hari warn (kuning) | <24 jam soon (oranye) | <3 jam urgent (merah) | lewat expired (abu-abu) */
function getDeadlineInfo(iso, now = Date.now()) {
  const diff = new Date(iso) - now;
  if (!(diff > 0)) return { text: 'Deadline telah berakhir', type: 'expired', expired: true, diff: 0 };
  const mins = Math.floor(diff / 60000), d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const p2 = n => String(n).padStart(2, '0');
  let text;
  if (d > 0) text = `${d} hari ${p2(h)} jam ${p2(m)} menit`;
  else if (h > 0) text = `${h} jam ${p2(m)} menit`;
  else text = mins < 1 ? 'Kurang dari 1 menit lagi' : `${m} menit lagi`;
  const type = diff > 3 * 86400000 ? 'normal' : diff >= 86400000 ? 'warn' : diff >= 3 * 3600000 ? 'soon' : 'urgent';
  return { text, type, expired: false, diff };
}

const avatarChar = n => (n || '?').trim().charAt(0).toUpperCase();
function gradientFor(s) {
  const g = ['#4f46e5,#7c3aed','#0ea5e9,#2563eb','#10b981,#059669','#f59e0b,#d97706','#ef4444,#dc2626','#ec4899,#db2777'];
  return g[(s || 'a').charCodeAt(0) % g.length];
}
function avatarHTML(p, size = 36) {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px`;
  if (p?.avatar_url) return `<img class="avatar-img" style="${st}" src="${esc(p.avatar_url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar-fallback',style:'${st}',textContent:'${esc(avatarChar(p?.full_name))}'}))">`;
  return `<span class="avatar-fallback" style="${st};background:linear-gradient(135deg,${gradientFor(p?.username)})">${esc(avatarChar(p?.full_name))}</span>`;
}
const mapelClass = m => 'mapel-' + String(m || '').replace(/\s/g, '');
const colorClass = m => 'color-' + (m ? String(m).replace(/\s/g, '') : 'default');
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ===== Toast ===== */
function showToast(msg, type = 'info') {
  const svg = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const icons = {
    success: svg('<circle cx="12" cy="12" r="10"/><path d="m8 12.5 2.8 2.8L16 9.5"/>'),
    error:   svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
    info:    svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    warning: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.innerHTML = `<span class="toast-ic">${icons[type] || ''}</span> <span>${esc(msg)}</span>`;
  $('#toastContainer').appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3800);
}

/* ===== Modal & konfirmasi ===== */
/* Pembersih modal (timer countdown, overlay perayaan, dll). Didaftarkan oleh modal yang membutuhkannya. */
const modalCleanups = [];
function runModalCleanups() { while (modalCleanups.length) { try { modalCleanups.pop()(); } catch {} } }
function openModal(html, opts = {}) {
  const ov = $('#modalOverlay');
  runModalCleanups();
  $('#modalContent').innerHTML = html;
  const m = $('.modal', ov);
  m.classList.toggle('modal-wide', !!opts.wide);
  m.classList.toggle('modal-task', !!opts.task);
  ov.classList.toggle('has-task', !!opts.task);
  ov.classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeModal() {
  runModalCleanups();
  $('#modalOverlay').classList.add('hidden');
  document.body.classList.remove('modal-open');
}
/* Konfirmasi kustom (menggantikan window.confirm). Mengembalikan Promise<boolean>. */
function confirmDialog({ title, message, confirmText = 'Ya, Hapus', danger = true, icon = 'fa-trash' }) {
  return new Promise(res => {
    const ov = $('#confirmOverlay');
    $('#confirmIcon').innerHTML = `<i class="fas ${icon}"></i>`;
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = message || '';
    const ok = $('#confirmOk'); ok.textContent = confirmText;
    ok.className = danger ? 'btn-danger' : 'btn-primary';
    ov.classList.remove('hidden');
    const done = v => { ov.classList.add('hidden'); ok.onclick = cancel.onclick = null; res(v); };
    const cancel = $('#confirmCancel');
    ok.onclick = () => done(true); cancel.onclick = () => done(false);
    ov.onclick = e => { if (e.target === ov) done(false); };
  });
}

function setBtnLoading(btn, loading, label) {
  if (!btn) return;
  if (loading) { btn.dataset.orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${esc(label || 'Memproses...')}`; }
  else { btn.disabled = false; if (btn.dataset.orig) btn.innerHTML = btn.dataset.orig; }
}
function showErr(el, msg) { if (typeof el === 'string') el = $(el); if (!el) return; $('span', el).textContent = msg; el.classList.remove('hidden'); }
function hideEl(el) { if (typeof el === 'string') el = $(el); el?.classList.add('hidden'); }

/* Pesan galat Supabase -> Indonesia */
function errMsg(e) {
  const m = (e?.message || String(e || '')).toLowerCase();
  if (m.includes('failed to fetch') || m.includes('network')) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Kamu tidak punya izin untuk tindakan ini.';
  if (m.includes('kode kelas tidak ditemukan')) return 'Kode kelas tidak ditemukan.';
  return e?.message || 'Terjadi kesalahan.';
}

/* Skeleton & empty state */
const skeletonCards = (n = 3) => Array.from({ length: n }, () =>
  `<div class="skeleton-card"><div class="sk sk-line w40"></div><div class="sk sk-line w80"></div><div class="sk sk-line w60"></div></div>`).join('');
const emptyState = (icon, text, sub = '', actionHTML = '') =>
  `<div class="empty-state"><i class="fas ${icon}"></i><p>${esc(text)}</p>${sub ? `<small>${esc(sub)}</small>` : ''}${actionHTML}</div>`;

/* Registri tampilan & aksi (diisi oleh js/views-*.js, dipakai js/main.js) */
const VIEWS = {};
const ACTIONS = {};
