/* ===== Autentikasi (Supabase Auth; login memakai username -> username@EMAIL_DOMAIN) ===== */
const emailOf = u => `${String(u).trim().toLowerCase()}@${EMAIL_DOMAIN}`;

function switchTab(tab) {
  const login = tab === 'login';
  $('#tabLogin').classList.toggle('active', login);
  $('#tabDaftar').classList.toggle('active', !login);
  $('#formLogin').classList.toggle('hidden', !login);
  $('#formDaftar').classList.toggle('hidden', login);
  ['#loginError', '#daftarError', '#daftarSuccess'].forEach(hideEl);
}

function updateRolePicker() {
  const guru = $('input[name="daftarRole"]:checked')?.value === 'guru';
  $('#kodeGuruWrap').classList.toggle('hidden', !guru);
  $('#kodeKelasWrap').classList.toggle('hidden', guru);
  $('#roleOptGuru').classList.toggle('active', guru);
  $('#roleOptSiswa').classList.toggle('active', !guru);
}

async function handleLogin() {
  const username = $('#loginUsername').value.trim().toLowerCase(), password = $('#loginPassword').value;
  if (!username || !password) return showErr('#loginError', 'Username dan password wajib diisi!');
  try { localStorage.setItem('tk_remember', $('#rememberMe').checked ? '1' : '0'); } catch {}
  const btn = $('#btnLogin'); setBtnLoading(btn, true, 'Masuk...');
  const { error } = await sb.auth.signInWithPassword({ email: emailOf(username), password });
  setBtnLoading(btn, false);
  if (error) {
    const m = error.message.toLowerCase();
    return showErr('#loginError', m.includes('confirm') ? 'Email belum dikonfirmasi: matikan "Confirm email" di Supabase (Auth → Providers → Email).'
      : m.includes('invalid') ? 'Username atau password salah!' : errMsg(error));
  }
  hideEl('#loginError');
  // onAuthStateChange memulai aplikasi
}

async function handleDaftar() {
  const nama = $('#daftarNama').value.trim(), username = $('#daftarUsername').value.trim().toLowerCase();
  const password = $('#daftarPassword').value, role = $('input[name="daftarRole"]:checked')?.value || 'siswa';
  const kode = $('#kodeGuru').value.trim(), kodeKelas = $('#kodeKelas').value.trim();
  const E = m => showErr('#daftarError', m);
  if (nama.length < 2) return E('Nama lengkap minimal 2 karakter!');
  if (!/^[a-z0-9._-]{4,30}$/.test(username)) return E('Username 4–30 karakter: huruf kecil, angka, titik, strip, garis bawah (tanpa spasi).');
  if (password.length < 6) return E('Password minimal 6 karakter!');
  if (role === 'guru' && !kode) return E('Kode guru wajib diisi!');
  const btn = $('#btnDaftar'); setBtnLoading(btn, true, 'Mendaftar...');
  try {
    const { data: free } = await sb.rpc('username_available', { p_username: username });
    if (free === false) throw new Error('Username sudah digunakan, coba yang lain!');
    try { localStorage.setItem('tk_remember', '1'); } catch {}
    // Jalur utama: buat akun lewat RPC (tanpa email apa pun -> tidak kena "email invalid"/"rate limit").
    let created = false;
    const rpc = await sb.rpc('register_account', {
      p_username: username, p_full_name: nama, p_password: password, p_role: role,
      p_teacher_code: role === 'guru' ? kode : null });
    if (!rpc.error) created = true;
    else if (!/could not find the function|schema cache|PGRST202|42883/i.test(`${rpc.error.code} ${rpc.error.message}`))
      throw new Error(rpc.error.message);          // mis. kode guru salah / username dipakai
    if (!created) {                                // cadangan: sql/10 belum dijalankan -> signUp biasa
      const { data, error } = await sb.auth.signUp({
        email: emailOf(username), password,
        options: { data: { username, full_name: nama, role, teacher_code: role === 'guru' ? kode : undefined } },
      });
      if (error) {
        const m = error.message.toLowerCase();
        throw new Error(m.includes('rate limit') || m.includes('invalid') && m.includes('email')
          ? 'Server menolak pengiriman email konfirmasi. Jalankan sql/10_daftar_tanpa_email.sql di Supabase SQL Editor (atau matikan "Confirm email" di Auth → Providers → Email), lalu coba lagi.'
          : m.includes('database error') ? 'Gagal membuat akun. Pastikan kode guru benar dan username belum dipakai.'
          : m.includes('already') ? 'Username sudah digunakan, coba yang lain!' : errMsg(error));
      }
      if (data.session) created = 'session';
    }
    if (created !== 'session') {
      const r = await sb.auth.signInWithPassword({ email: emailOf(username), password });
      if (r.error) throw new Error('Akun dibuat, tetapi login otomatis gagal. Silakan masuk lewat tab Masuk.');
    }
    if (role === 'siswa' && kodeKelas) {
      const r = await sb.rpc('join_class', { p_code: kodeKelas });
      if (r.error) showToast('Akun dibuat, tetapi kode kelas tidak valid. Masukkan ulang di menu Kelas.', 'warning');
    }
  } catch (e) { E(e.message); }
  setBtnLoading(btn, false);
}

async function handleLogout() {
  unsubscribeRealtime();
  try { await disablePush(); } catch {}           // endpoint push milik perangkat ini tidak boleh terbawa ke akun lain
  await sb.auth.signOut();
}
