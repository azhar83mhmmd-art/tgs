/* ===== Pasang sebagai aplikasi (PWA) =====
   - Event `beforeinstallprompt` ditangkap lebih awal oleh skrip kecil di <head> index.html (window.__tkInstall).
   - Tombol "Install Aplikasi" muncul di halaman login, sidebar, dan topbar selama aplikasi belum terpasang.
   - Chrome/Edge/Android: satu ketukan -> dialog install bawaan browser.
   - Browser tanpa dialog (iPhone Safari, dsb.): panduan langkah singkat yang sesuai perangkat. */
const PWA = (() => {
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const inApp = /FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|Snapchat|; wv\)|WhatsApp|Telegram/i.test(ua);   // browser dalam aplikasi lain
  const isFirefox = /firefox|fxios/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios|edg|opr|android/i.test(ua);
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; } catch { return false; } };
  const flagGet = () => { try { return localStorage.getItem('tk_installed') === '1'; } catch { return false; } };
  const flagSet = v => { try { v ? localStorage.setItem('tk_installed', '1') : localStorage.removeItem('tk_installed'); } catch {} };
  const evt = () => window.__tkInstall || null;

  /* Tampilkan tombol bila: belum berjalan sebagai aplikasi, dan (dialog install tersedia, atau belum pernah terpasang). */
  const visible = () => !standalone() && (!!evt() || !flagGet());
  function refresh() {
    const show = visible();
    document.querySelectorAll('[data-install-ui]').forEach(el => { el.hidden = !show; });
  }

  /* Menunggu event install dari browser (maks. `ms`). Chrome kadang baru mengirimnya beberapa detik setelah halaman dibuka. */
  const waitEvt = ms => new Promise(res => {
    if (evt()) return res(evt());
    const done = () => { clearTimeout(t); window.removeEventListener('tk-install-ready', done); res(evt()); };
    const t = setTimeout(done, ms); window.addEventListener('tk-install-ready', done);
  });
  let busy = false;
  async function install() {
    if (standalone()) return showToast('TugasKu sudah berjalan sebagai aplikasi.', 'info');
    if (busy) return; busy = true;
    try {
      let e = evt();
      if (!e && !isIOS && !inApp && !isFirefox) { showToast('Menyiapkan instalasi…', 'info'); e = await waitEvt(4000); }   // browser yang mendukung install satu-ketukan
      if (!e) return showGuide();
      window.__tkInstall = null;                                // prompt() hanya bisa dipakai sekali
      try {
        await e.prompt();
        const { outcome } = await e.userChoice;
        showToast(outcome === 'accepted' ? 'Memasang TugasKu… cek layar utama / daftar aplikasimu.' : 'Instalasi dibatalkan. Ketuk Install Aplikasi lagi kapan saja.', outcome === 'accepted' ? 'success' : 'info');
      } catch { showGuide(); }
    } finally { busy = false; refresh(); }
  }

  function guideSteps() {
    if (inApp) return { title: 'Buka lewat browser dulu', steps: [
      'Ketuk menu <b>⋮</b> atau ikon <b>bagikan</b> di pojok layar.',
      `Pilih <b>Buka di browser</b> (${isIOS ? 'Safari' : 'Chrome'}).`,
      'Setelah terbuka di browser, ketuk <b>Install Aplikasi</b> lagi.'] };
    if (isIOS) return isSafari ? { title: 'Install di iPhone / iPad', steps: [
      'Ketuk ikon <b>Bagikan</b> <i class="fas fa-arrow-up-from-bracket"></i> di bilah bawah Safari.',
      'Geser ke bawah, pilih <b>Tambah ke Layar Utama</b> (Add to Home Screen).',
      'Ketuk <b>Tambah</b>. Ikon TugasKu muncul di layar utama.'] } : { title: 'Install di iPhone / iPad', steps: [
      'Di iPhone, instalasi paling andal lewat <b>Safari</b>. Salin tautan ini lalu buka di Safari.',
      'Ketuk ikon <b>Bagikan</b> <i class="fas fa-arrow-up-from-bracket"></i> → <b>Tambah ke Layar Utama</b>.',
      'Ketuk <b>Tambah</b>.'] };
    if (isAndroid) return { title: 'Install tidak tersedia dari sini', steps: [
      'Browser tidak mengirim izin install untuk halaman ini. Biasanya karena <b>TugasKu sudah terpasang</b> di HP ini — cari ikon TugasKu di layar utama atau daftar aplikasi.',
      'Kalau belum terpasang: menu <b>⋮</b> → <b>Instal aplikasi</b>. Kalau menunya tidak ada, muat ulang halaman lalu ketuk Install Aplikasi lagi.'] };
    if (isFirefox) return { title: 'Install di komputer', steps: [
      'Firefox di komputer belum mendukung instalasi aplikasi web.',
      'Buka TugasKu di <b>Chrome</b> atau <b>Edge</b>, lalu ketuk <b>Install Aplikasi</b> lagi.'] };
    if (isSafari) return { title: 'Install di Mac', steps: [
      'Di menu Safari, pilih <b>File → Tambahkan ke Dock</b> (Add to Dock).',
      'Ketuk <b>Tambah</b>.'] };
    return { title: 'Install di komputer', steps: [
      'Cari ikon <b>Install</b> <i class="fas fa-download"></i> di sisi kanan kolom alamat browser, atau buka menu <b>⋮</b>.',
      'Pilih <b>Instal TugasKu</b> / <b>Install TugasKu</b>.',
      'Klik <b>Instal</b>. TugasKu terbuka di jendelanya sendiri.'] };
  }
  function showGuide() {
    const g = guideSteps();
    openModal(`<div class="install-guide"><div class="install-guide-icon"><i class="fas fa-download"></i></div>
      <h3>${g.title}</h3>
      <p class="muted">Pasang TugasKu agar terbuka seperti aplikasi biasa, lebih cepat, dan bisa dipakai offline.</p>
      <ol>${g.steps.map(s => `<li>${s}</li>`).join('')}</ol>
      <button class="btn-primary btn-full" data-action="closeModal">Mengerti</button></div>`);
  }

  window.addEventListener('tk-install-ready', refresh);
  window.addEventListener('appinstalled', () => { window.__tkInstall = null; flagSet(true); refresh(); showToast('TugasKu berhasil dipasang! 🎉', 'success'); });
  try { matchMedia('(display-mode: standalone)').addEventListener('change', refresh); } catch {}
  if (standalone()) flagSet(true);
  document.addEventListener('DOMContentLoaded', refresh);
  ACTIONS.installApp = install;
  return { refresh, install, showGuide };
})();
