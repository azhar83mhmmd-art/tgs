/* ===== Task Monitor & Class Insights (guru) ===== */
let monitorTaskId = null, monitorFilter = 'semua', monitorQuery = '', insightsScope = 'semua', charts = [];

VIEWS.monitor = (el, params) => {
  const focusId = document.activeElement?.id, selStart = document.activeElement?.selectionStart;
  if (params.task) monitorTaskId = params.task;
  const tasks = scopedTasks().slice().sort((a, b) => {
    const ao = isOverdue(a), bo = isOverdue(b); if (ao !== bo) return ao ? 1 : -1;
    return ao ? new Date(b.deadline) - new Date(a.deadline) : new Date(a.deadline) - new Date(b.deadline);
  });
  const head = `<div class="section-header"><h2><i class="fas fa-list-check"></i> Task Monitor</h2><p>Pantau penyelesaian tugas siswa secara real-time</p></div>`;
  if (!state.classes.length) return el.innerHTML = head + `<div class="card">${noClassState()}</div>`;
  if (!tasks.length) return el.innerHTML = head + emptyState('fa-clipboard-list', 'Belum ada tugas', 'Buat tugas pertama untuk mulai memantau.', `<button class="btn-primary" data-action="go" data-route="tugas-baru"><i class="fas fa-plus"></i> Buat Tugas</button>`);
  let t = tasks.find(x => x.id === monitorTaskId) || tasks.find(x => !isOverdue(x)) || tasks[0];
  monitorTaskId = t.id;
  const studs = studentsOfClass(t.class_id), p = taskProgress(t), od = isOverdue(t);
  const q = monitorQuery.toLowerCase();
  const rows = studs.filter(s => {
    const d = isDone(t.id, s.id);
    return (monitorFilter === 'semua' || (monitorFilter === 'selesai' ? d : !d)) && (!q || s.full_name.toLowerCase().includes(q));
  });
  el.innerHTML = head + `
    <div class="card monitor-pick"><label class="muted">Pilih tugas</label>
      <select class="select-filter wide" data-action-change="monitorTask">${tasks.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${isOverdue(x) ? '⛔ ' : ''}${esc(x.title)} — ${esc(x.subject)}${state.classes.length > 1 ? ' · ' + esc(className(x.class_id)) : ''}</option>`).join('')}</select></div>
    <div class="card monitor-head">
      <div class="monitor-title">TUGAS ${esc(t.subject.toUpperCase())}</div>
      <div class="monitor-sub">${esc(t.title)} ${kelasTag(t.class_id)} · Deadline ${fmtDateTime(t.deadline)} ${od ? '<span class="status-pill overdue">Lewat deadline</span>' : ''}</div>
      <div class="monitor-numbers">
        <div><b>${p.total}</b><span>Total siswa</span></div>
        <div class="ok"><b>${p.done}</b><span>Sudah selesai</span></div>
        <div class="bad"><b>${p.belum}</b><span>Belum selesai</span></div></div>
      <div class="progress-wrap"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${p.pct}%"></div></div><span>${p.pct}%</span></div>
      <small class="muted">Progress penyelesaian: ${p.pct}%</small>
      ${od && p.belum ? `<div class="alert alert-warn"><i class="fas fa-triangle-exclamation"></i> <span>${p.belum} siswa belum menyelesaikan tugas yang sudah melewati deadline.</span></div>` : ''}</div>
    <div class="filter-bar"><div class="filter-chips">${[['semua', 'Semua siswa'], ['selesai', 'Sudah selesai'], ['belum', 'Belum selesai']].map(c => `<button class="chip ${monitorFilter === c[0] ? 'active' : ''}" data-action="monitorFilter" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>
      <div class="topbar-search inline"><i class="fas fa-search"></i><input id="monitorSearch" placeholder="Cari nama siswa..." value="${esc(monitorQuery)}"></div></div>
    <div class="card no-pad">${!studs.length ? emptyState('fa-user-slash', 'Belum ada siswa di kelas ini', 'Bagikan kode kelas agar siswa bergabung.') :
      !rows.length ? emptyState('fa-filter', 'Tidak ada siswa yang cocok') :
      `<div class="student-rows">${rows.map(s => {
        const row = statusRow(t.id, s.id), d = !!row?.is_done;
        return `<div class="student-row ${flashRow === t.id + '|' + s.id ? 'flash' : ''}">
          ${avatarHTML(s, 40)}<div class="sr-name"><b>${esc(s.full_name)}</b><small>@${esc(s.username)}</small></div>
          <div class="sr-status">${d ? '<span class="status-pill done"><i class="fas fa-circle-check"></i> Sudah Selesai</span>'
            : od ? '<span class="status-pill overdue"><i class="fas fa-triangle-exclamation"></i> Overdue</span>' : '<span class="status-pill todo"><i class="far fa-circle"></i> Belum Selesai</span>'}</div>
          <div class="sr-time"><small>Diperbarui</small>${row ? fmtDateTime(row.updated_at) : '<em>belum pernah</em>'}</div></div>`; }).join('')}</div>`}</div>`;
  const s = focusId && document.getElementById(focusId); if (s && s.focus) { s.focus(); try { s.setSelectionRange(selStart, selStart); } catch {} }
};
ACTIONS.monitorFilter = a => { monitorFilter = a.dataset.v; VIEWS.monitor($('#view'), {}); };
document.addEventListener('change', e => { const a = e.target.closest('[data-action-change="monitorTask"]'); if (a) { monitorTaskId = a.value; VIEWS.monitor($('#view'), {}); } });
document.addEventListener('input', e => { if (e.target.id === 'monitorSearch') { monitorQuery = e.target.value; VIEWS.monitor($('#view'), {}); } });

/* ===== Class Insights ===== */
function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch {} }); charts = []; }
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

VIEWS.insights = (el) => {
  destroyCharts();
  const head = `<div class="section-header"><h2><i class="fas fa-chart-pie"></i> Class Insights</h2><p>Statistik penyelesaian tugas kelas</p></div>`;
  if (!state.classes.length) return el.innerHTML = head + `<div class="card">${noClassState()}</div>`;
  const all = scopedTasks(), active = all.filter(t => !isOverdue(t));
  const scope = insightsScope === 'aktif' ? active : all;
  const studIds = new Set(scopeIds().flatMap(cid => studentsOfClass(cid).map(s => s.id)));
  let done = 0, total = 0; const per = [];
  scope.forEach(t => { const p = taskProgress(t); done += p.done; total += p.total; if (p.total) per.push({ t, ...p }); });
  const top = per.slice().sort((a, b) => b.pct - a.pct || b.total - a.total).slice(0, 5);
  const low = per.slice().sort((a, b) => a.pct - b.pct || b.total - a.total).slice(0, 5);
  const list = arr => arr.length ? arr.map(x => `<div class="rank-row"><div class="rank-info"><b>${esc(x.t.title)}</b><small>${esc(x.t.subject)} ${kelasTag(x.t.class_id)}</small>${progressBar(x.pct)}</div><div class="rank-pct">${x.pct}%</div></div>`).join('') : `<p class="muted-center">Belum ada data</p>`;
  el.innerHTML = head + `
    <div class="filter-bar"><div class="filter-chips">${[['semua', 'Semua tugas'], ['aktif', 'Tugas aktif saja']].map(c => `<button class="chip ${insightsScope === c[0] ? 'active' : ''}" data-action="insightsScope" data-v="${c[0]}">${c[1]}</button>`).join('')}</div></div>
    <div class="stats-grid">
      ${stat('fa-users', 'blue', studIds.size, 'Total Siswa')}
      ${stat('fa-clipboard-list', 'purple', active.length, 'Total Tugas Aktif')}
      ${stat('fa-circle-check', 'green', done, 'Penyelesaian (sudah selesai)')}
      ${stat('fa-hourglass-half', 'red', total - done, 'Belum Selesai')}
      ${stat('fa-chart-line', 'yellow', pct(done, total) + '%', 'Persentase Penyelesaian')}</div>
    <div class="grid-2">
      <div class="card"><div class="card-header-row"><h3><i class="fas fa-arrow-trend-up"></i> Penyelesaian Tertinggi</h3></div>${list(top)}</div>
      <div class="card"><div class="card-header-row"><h3><i class="fas fa-arrow-trend-down"></i> Penyelesaian Terendah</h3></div>${list(low)}</div></div>
    <div class="grid-2">
      <div class="card"><div class="card-header-row"><h3>Penyelesaian Mingguan</h3></div><div class="chart-box"><canvas id="chWeek"></canvas></div><small class="muted">Jumlah tugas yang ditandai selesai per minggu (8 minggu terakhir)</small></div>
      <div class="card"><div class="card-header-row"><h3>Selesai vs Belum Selesai</h3></div><div class="chart-box"><canvas id="chRatio"></canvas></div></div></div>
    <div class="card"><div class="card-header-row"><h3>Progres per Mata Pelajaran</h3></div><div class="chart-box tall"><canvas id="chSubject"></canvas></div></div>`;
  drawCharts(scope, done, total);
};
ACTIONS.insightsScope = a => { insightsScope = a.dataset.v; VIEWS.insights($('#view')); };

function weekStartWIB(iso) {
  const [y, m, d] = isoToWIB(iso).date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function drawCharts(scope, done, total) {
  const ids = new Set(scope.map(t => t.id));
  // mingguan
  const weeks = []; let cur = weekStartWIB(new Date().toISOString());
  for (let i = 0; i < 8; i++) { weeks.unshift(cur); const d = new Date(cur + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); cur = d.toISOString().slice(0, 10); }
  const counts = Object.fromEntries(weeks.map(w => [w, 0]));
  state.statuses.forEach(s => { if (s.is_done && ids.has(s.task_id)) { const w = weekStartWIB(s.updated_at); if (w in counts) counts[w]++; } });
  const wl = weeks.map(w => new Date(w + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }));
  // per mapel
  const bySub = {};
  scope.forEach(t => { const p = taskProgress(t); const o = bySub[t.subject] ||= { d: 0, t: 0 }; o.d += p.done; o.t += p.total; });
  const subs = Object.entries(bySub).filter(([, v]) => v.t).map(([k, v]) => [k, pct(v.d, v.t)]).sort((a, b) => b[1] - a[1]);

  if (typeof Chart === 'undefined') {                       // fallback tanpa library
    $('#chWeek').parentElement.innerHTML = weeks.map((w, i) => `<div class="rank-row"><div class="rank-info"><small>${wl[i]}</small>${progressBar(Math.min(100, counts[w] * 10))}</div><div class="rank-pct">${counts[w]}</div></div>`).join('');
    $('#chRatio').parentElement.innerHTML = `<div class="rank-info">${progressBar(pct(done, total))}<small>${done} selesai · ${total - done} belum</small></div>`;
    $('#chSubject').parentElement.innerHTML = subs.map(([k, v]) => `<div class="rank-row"><div class="rank-info"><b>${esc(k)}</b>${progressBar(v)}</div><div class="rank-pct">${v}%</div></div>`).join('');
    return;
  }
  const c1 = cssVar('--primary') || '#4f46e5', c2 = cssVar('--success') || '#10b981', c3 = cssVar('--danger') || '#ef4444', txt = cssVar('--text-light') || '#64748b';
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif"; Chart.defaults.color = txt;
  const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 600 } };
  charts.push(new Chart($('#chWeek'), { type: 'line', data: { labels: wl, datasets: [{ label: 'Tugas diselesaikan', data: weeks.map(w => counts[w]), borderColor: c1, backgroundColor: c1 + '22', fill: true, tension: .35, pointRadius: 4 }] },
    options: { ...base, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }));
  charts.push(new Chart($('#chRatio'), { type: 'doughnut', data: { labels: ['Sudah selesai', 'Belum selesai'], datasets: [{ data: [done, total - done], backgroundColor: [c2, c3], borderWidth: 0 }] },
    options: { ...base, cutout: '66%', plugins: { legend: { position: 'bottom' } } } }));
  charts.push(new Chart($('#chSubject'), { type: 'bar', data: { labels: subs.map(s => s[0]), datasets: [{ label: '% selesai', data: subs.map(s => s[1]), backgroundColor: c1, borderRadius: 8 }] },
    options: { ...base, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x + '% selesai' } } }, scales: { x: { min: 0, max: 100, ticks: { callback: v => v + '%' } } } } }));
}
