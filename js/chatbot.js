/* ===== Asisten TugasKu (aturan lokal; AI opsional bila CLAUDE_API_KEY diisi) ===== */
let chatHistory = [], chatTyping = false;
function chatReset() { chatHistory = []; $('#chatMessages').innerHTML = `<div class="chat-msg bot"><div class="chat-bubble">Halo! Saya Asisten TugasKu 🎓<br>Tanyakan: "tugas hari ini?", "deadline terdekat?", "tugas belum selesai?", atau "pengumuman".</div></div>`; }
function addChatMsg(html, role) {
  const el = $('#chatMessages'), d = document.createElement('div'); d.className = 'chat-msg ' + role;
  d.innerHTML = `<div class="chat-bubble">${html}</div>`; el.appendChild(d); el.scrollTop = el.scrollHeight;
}
async function sendChat() {
  if (chatTyping) return;
  const inp = $('#chatInput'), msg = inp.value.trim(); if (!msg) return;
  addChatMsg(esc(msg), 'user'); inp.value = ''; chatTyping = true; $('#chatSendBtn').disabled = true;
  chatHistory.push({ role: 'user', content: msg });
  const typing = document.createElement('div'); typing.className = 'chat-msg bot'; typing.innerHTML = '<div class="chat-bubble typing-indicator"><span></span><span></span><span></span></div>';
  $('#chatMessages').appendChild(typing);
  try {
    let reply;
    if (!CLAUDE_API_KEY) { await new Promise(r => setTimeout(r, 400)); reply = localReply(msg.toLowerCase()); }
    else reply = esc(await callClaude()).replace(/\n/g, '<br>');
    typing.remove(); addChatMsg(reply, 'bot');
    chatHistory.push({ role: 'assistant', content: reply.replace(/<[^>]+>/g, '') }); chatHistory = chatHistory.slice(-20);
  } catch { typing.remove(); addChatMsg('Maaf, terjadi kesalahan. Coba lagi ya 😅', 'bot'); }
  chatTyping = false; $('#chatSendBtn').disabled = false; inp.focus();
}
function ctxSummary() {
  const g = isGuru();
  return scopedTasks().slice(0, 12).map(t => `- ${t.title} (${t.subject}) | ${fmtDateTime(t.deadline)} | ${getCountdown(t.deadline).text}` +
    (g ? ` | selesai ${taskProgress(t).done}/${taskProgress(t).total}` : ` | status saya: ${myDone(t.id) ? 'Sudah Selesai' : 'Belum Selesai'}`)).join('\n');
}
async function callClaude() {
  const system = `Kamu adalah Asisten TugasKu, ramah dan singkat, berbahasa Indonesia. Pengguna: ${state.me.full_name} (${isGuru() ? 'Guru' : 'Siswa'}).\nTUGAS:\n${ctxSummary() || 'Belum ada tugas'}\nJawab berdasarkan data di atas.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, system, messages: chatHistory.slice(-8) }) });
  if (!r.ok) throw new Error('API error'); const d = await r.json(); return d.content?.[0]?.text || 'Maaf, tidak ada respons.';
}
function localReply(m) {
  const tasks = scopedTasks(), g = isGuru(), list = a => a.map(t => '• ' + esc(t.title)).join('<br>');
  if (/hari ini|tugas apa/.test(m)) { const td = tasks.filter(t => isoToWIB(t.deadline).date === todayWIB()); return td.length ? `Deadline hari ini:<br>${list(td)}` : 'Tidak ada deadline hari ini 😊'; }
  if (/belum (selesai|kumpul)/.test(m)) {
    if (!g) { const b = tasks.filter(t => !myDone(t.id)); return b.length ? `${b.length} tugas belum selesai:<br>${list(b)}` : 'Semua tugasmu sudah selesai! 🎉'; }
    const o = tasks.filter(t => taskProgress(t).belum > 0 && isOverdue(t)); return o.length ? `Lewat deadline & masih ada yang belum selesai:<br>${o.map(t => `• ${esc(t.title)} (${taskProgress(t).belum} siswa)`).join('<br>')}` : 'Tidak ada tugas lewat deadline yang belum selesai 🎉';
  }
  if (/pengumuman/.test(m)) { const p = scopedAnnouncements().slice(0, 3); return p.length ? `Pengumuman terbaru:<br>${list(p.map(x => ({ title: x.title })))}` : 'Belum ada pengumuman 📢'; }
  if (/berapa tugas/.test(m)) return `Total: <b>${tasks.length} tugas</b> 📚`;
  if (/deadline|terdekat/.test(m)) { const s = tasks.filter(t => !isOverdue(t)).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 3); return s.length ? `Deadline terdekat:<br>${s.map(t => `• ${esc(t.title)} — ${getCountdown(t.deadline).text}`).join('<br>')}` : 'Tidak ada tugas aktif.'; }
  if (/halo|hai/.test(m)) return `Halo, ${esc(state.me.full_name.split(' ')[0])}! 👋 Ada yang bisa dibantu?`;
  return 'Maaf, saya belum bisa menjawab itu 😅<br>Coba: "tugas hari ini?", "deadline terdekat?", "tugas belum selesai?", atau "pengumuman".';
}
Object.assign(ACTIONS, {});
