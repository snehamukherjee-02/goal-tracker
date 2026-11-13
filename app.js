/* ===========================================================
   My Goal Tracker — password-protected & encrypted
   -----------------------------------------------------------
   • Your goals, focus reminders, quotes and advice live ONLY in
     content.enc.js, encrypted with AES-256-GCM. The key comes from
     your password (PBKDF2-SHA256, 600,000 iterations).
   • Your daily ticks and notes are saved encrypted in this
     browser's storage, with a key from the same password.
   • No plain-text personal data is ever in this public code.
   =========================================================== */

const STATE_KEY = "myGoalTracker.enc";      // encrypted progress
const REMEMBER_KEY = "myGoalTracker.keys";  // optional "remember on this device"
const LEGACY_KEY = "myGoalTracker.v1";      // old unencrypted version (migrated)
const LOCAL_ITER = 600000;

/* ===========================================================
   Crypto helpers (Web Crypto API)
   =========================================================== */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64e = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
}
async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return { iv: b64e(iv), data: b64e(data) };
}
async function decryptText(key, ivB64, dataB64) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(ivB64) }, key, b64d(dataB64));
  return dec.decode(plain);
}
async function exportKey(key) { return b64e(await crypto.subtle.exportKey("raw", key)); }
async function importKey(b64) {
  return crypto.subtle.importKey("raw", b64d(b64), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
function storageDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

/* ===========================================================
   Content (filled in after unlocking)
   =========================================================== */
let DEFAULT_GOALS = [], FOCUS_MESSAGES = [], QUOTES = [], ADVICE = [], DEFAULT_VIDEOS = [];

/* Get the 11-character video ID from any YouTube link (youtu.be, watch?v=, shorts, embed, live) */
function youtubeId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s.startsWith("http") ? s : "https://" + s); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v");
    if (!id) {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) id = m[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

function ensureVideos() {
  if (!Array.isArray(state.videos)) {
    state.videos = DEFAULT_VIDEOS
      .map(v => ({ id: uid(), yt: youtubeId(v.url), title: v.title || "" }))
      .filter(v => v.yt);
    return true;
  }
  return false;
}

function cheerFor(count, total) {
  if (count === 0) return "";
  const pct = total ? count / total : 0;
  if (pct >= 1) return "🏆 You worked on EVERY goal today. Unstoppable!";
  if (pct >= 0.6) return "🌟 Amazing day! You're building your dream life.";
  if (pct >= 0.3) return "💪 Great work. Keep the momentum going!";
  if (count === 1) return "✨ One step is still progress. Proud of you!";
  return "🌸 Nice! Every tick is a vote for your future self.";
}

/* ===========================================================
   State
   =========================================================== */
let state = null;
let localKey = null;
let localSalt = null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function defaultState() {
  const now = dateKey(new Date());
  return {
    goals: DEFAULT_GOALS.map(g => ({
      id: uid(), title: g.title, category: g.category, tip: g.tip || "",
      achieved: false, achievedDate: null, createdAt: now
    })),
    log: {},
    notes: {}
  };
}
function normalize(s) {
  if (!s || !Array.isArray(s.goals)) return null;
  return { goals: s.goals, log: s.log || {}, notes: s.notes || {}, videos: s.videos };
}

let saveChain = Promise.resolve();
function saveState() {
  if (!localKey) return;
  const snapshot = JSON.stringify(state);
  saveChain = saveChain.then(async () => {
    const { iv, data } = await encryptText(localKey, snapshot);
    storageSet(STATE_KEY, JSON.stringify({ v: 1, salt: b64e(localSalt), iv, data }));
  }).catch(() => {});
}

/* ===========================================================
   Lock screen / unlock
   =========================================================== */
const $ = id => document.getElementById(id);

function showLockError(msg) {
  $("lockError").textContent = msg;
  $("unlockBtn").disabled = false;
  $("unlockBtn").textContent = "Unlock";
}

async function loadContent(contentKey) {
  const ec = window.ENCRYPTED_CONTENT;
  const content = JSON.parse(await decryptText(contentKey, ec.iv, ec.data));
  DEFAULT_GOALS = content.goals || [];
  FOCUS_MESSAGES = content.focus && content.focus.length ? content.focus : ["Focus on your goals today."];
  QUOTES = content.quotes && content.quotes.length ? content.quotes : ["Small steps every day."];
  ADVICE = content.advice && content.advice.length ? content.advice : ["Do one small step for a goal today."];
  DEFAULT_VIDEOS = Array.isArray(content.videos) ? content.videos : [];
}

async function loadLocalState(rec) {
  if (rec) {
    state = normalize(JSON.parse(await decryptText(localKey, rec.iv, rec.data)));
  }
  if (!state) {
    // migrate data from the old unencrypted version, if any
    try { state = normalize(JSON.parse(storageGet(LEGACY_KEY))); } catch (e) { state = null; }
    if (!state) state = defaultState();
    ensureVideos();
    saveState();
    await saveChain;
    storageDel(LEGACY_KEY);
  }
  if (ensureVideos()) saveState();
}

function readLocalRec() {
  try { return JSON.parse(storageGet(STATE_KEY)); } catch (e) { return null; }
}

async function unlockWithPassword(password, remember) {
  const ec = window.ENCRYPTED_CONTENT;
  let contentKey;
  try {
    contentKey = await deriveKey(password, b64d(ec.salt), ec.iter);
    await loadContent(contentKey);
  } catch (e) {
    throw new Error("Wrong password. Try again.");
  }

  const rec = readLocalRec();
  localSalt = rec ? b64d(rec.salt) : crypto.getRandomValues(new Uint8Array(16));
  localKey = await deriveKey(password, localSalt, LOCAL_ITER);
  try {
    await loadLocalState(rec);
  } catch (e) {
    // Progress on this device was saved under an older password.
    const old = prompt("Your saved progress on this device uses your OLD password.\nEnter the old password to keep it (Cancel = start fresh on this device):");
    if (old !== null) {
      try {
        const oldKey = await deriveKey(old, localSalt, LOCAL_ITER);
        state = normalize(JSON.parse(await decryptText(oldKey, rec.iv, rec.data)));
      } catch (err) {
        throw new Error("Old password didn't work. Progress was NOT changed. Reload to try again.");
      }
    } else {
      if (!confirm("Start fresh on this device? Your old encrypted progress here will be replaced.")) {
        throw new Error("Unlock cancelled. Nothing was changed.");
      }
      state = defaultState();
    }
    // re-encrypt with the new password
    localSalt = crypto.getRandomValues(new Uint8Array(16));
    localKey = await deriveKey(password, localSalt, LOCAL_ITER);
    saveState();
    await saveChain;
  }

  if (remember) {
    storageSet(REMEMBER_KEY, JSON.stringify({
      c: await exportKey(contentKey), l: await exportKey(localKey),
      cs: ec.salt, ls: b64e(localSalt)
    }));
  } else {
    storageDel(REMEMBER_KEY);
  }
}

async function tryRemembered() {
  const ec = window.ENCRYPTED_CONTENT;
  let r;
  try { r = JSON.parse(storageGet(REMEMBER_KEY)); } catch (e) { r = null; }
  if (!r || r.cs !== ec.salt) return false;
  try {
    await loadContent(await importKey(r.c));
    const rec = readLocalRec();
    if (rec && rec.salt !== r.ls) return false;
    localSalt = b64d(r.ls);
    localKey = await importKey(r.l);
    await loadLocalState(rec);
    return true;
  } catch (e) {
    storageDel(REMEMBER_KEY);
    return false;
  }
}

function showApp() {
  $("lockScreen").hidden = true;
  $("app").hidden = false;
  focusIndex = dayOfYear(new Date()) % FOCUS_MESSAGES.length;
  quoteIndex = dayOfYear(new Date()) % QUOTES.length;
  renderAll();
}

async function boot() {
  if (!window.crypto || !crypto.subtle) {
    showLockError("This browser can't decrypt. Open the page over https (the GitHub Pages link) in a modern browser.");
    $("unlockBtn").disabled = true;
    return;
  }
  if (!window.ENCRYPTED_CONTENT) {
    showLockError("Encrypted content not found. Run: node tools/encrypt.mjs");
    $("unlockBtn").disabled = true;
    return;
  }
  if (await tryRemembered()) { showApp(); return; }
  $("password").focus();
}

$("lockForm").addEventListener("submit", async e => {
  e.preventDefault();
  const pw = $("password").value;
  if (!pw) return;
  $("lockError").textContent = "";
  $("unlockBtn").disabled = true;
  $("unlockBtn").textContent = "Unlocking…";
  try {
    await unlockWithPassword(pw, $("remember").checked);
    $("password").value = "";
    showApp();
  } catch (err) {
    showLockError(err.message);
    $("password").select();
  }
});

$("lockBtn").onclick = () => {
  storageDel(REMEMBER_KEY);
  location.reload();
};

/* ===========================================================
   Date helpers
   =========================================================== */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayKey() { return dateKey(new Date()); }
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}
function prettyDate(k) {
  return parseKey(k).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

let selectedKey = todayKey();
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let focusIndex = 0;
let quoteIndex = 0;

/* ===========================================================
   Helpers
   =========================================================== */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function goalsAvailableOn(k) {
  return state.goals.filter(g => !g.createdAt || g.createdAt <= k);
}
function workedOn(k) {
  const ids = new Set(state.goals.map(g => g.id));
  return (state.log[k] || []).filter(id => ids.has(id));
}
function countDaysForGoal(id) {
  return Object.values(state.log).filter(arr => arr.includes(id)).length;
}
function lastWorked(id) {
  const days = Object.keys(state.log).filter(k => state.log[k].includes(id)).sort();
  return days[days.length - 1] || null;
}

/* ===========================================================
   Rendering
   =========================================================== */
function renderStats() {
  $("statToday").textContent = workedOn(todayKey()).length;
  let streak = 0;
  const d = new Date();
  if (workedOn(dateKey(d)).length === 0) d.setDate(d.getDate() - 1);
  while (workedOn(dateKey(d)).length > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  $("statStreak").textContent = streak;
  $("statDays").textContent = Object.keys(state.log).filter(k => workedOn(k).length > 0).length;
  $("statAchieved").textContent = `${state.goals.filter(g => g.achieved).length}/${state.goals.length}`;
}

function renderCalendar() {
  const first = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const t = todayKey();
  $("monthLabel").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  let html = "";
  for (let i = 0; i < first.getDay(); i++) html += `<div class="cal-day empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const k = dateKey(new Date(viewYear, viewMonth, day));
    const count = workedOn(k).length;
    const total = goalsAvailableOn(k).length || 1;
    const pct = count / total;
    let level = 0;
    if (count > 0) level = pct >= 0.75 ? 4 : pct >= 0.5 ? 3 : pct >= 0.25 ? 2 : 1;
    const cls = ["cal-day", `l${level}`];
    if (k === t) cls.push("today");
    if (k === selectedKey) cls.push("selected");
    const future = k > t;
    if (future) cls.push("future");
    html += `<button class="${cls.join(" ")}" data-key="${k}" ${future ? "disabled" : ""}
              title="${count} goal${count === 1 ? "" : "s"} worked on">
              ${day}${count ? `<small>${count}✓</small>` : ""}</button>`;
  }
  $("calGrid").innerHTML = html;
}

function renderDaily() {
  const isToday = selectedKey === todayKey();
  $("dayLabel").textContent = isToday ? "Today's goal check-in" : prettyDate(selectedKey);
  $("dayHint").textContent = isToday
    ? "Tick every goal you worked on today, even a small step counts."
    : "Editing a past day. Tick what you worked on that day.";

  const done = new Set(workedOn(selectedKey));
  const goals = goalsAvailableOn(selectedKey);
  $("dailyList").innerHTML = goals.length === 0
    ? `<li class="hint">No goals yet on this date.</li>`
    : goals.map(g => `
      <li><label>
        <input type="checkbox" data-goal="${g.id}" ${done.has(g.id) ? "checked" : ""}>
        <span>${esc(g.title)}${g.achieved ? `<span class="done-tag">✅ achieved</span>` : ""}</span>
      </label></li>`).join("");
  $("cheerText").textContent = cheerFor(done.size, goals.length);
  $("dayNote").value = state.notes[selectedKey] || "";
}

function renderGoals() {
  $("goalList").innerHTML = state.goals.map(g => `
    <li class="${g.achieved ? "achieved" : ""}" data-id="${g.id}">
      <input type="checkbox" class="big-check" data-achieve="${g.id}" ${g.achieved ? "checked" : ""}
             title="Mark as fully achieved">
      <div class="goal-body">
        <div class="goal-title">${esc(g.title)}</div>
        <div class="goal-meta">
          <span class="tag">${esc(g.category || "Self")}</span>
          ${g.achieved && g.achievedDate ? `Achieved on ${esc(g.achievedDate)} 🎉` : `Worked on ${countDaysForGoal(g.id)} day(s)`}
        </div>
        ${g.tip ? `<div class="goal-tip">💡 ${esc(g.tip)}</div>` : ""}
      </div>
      <div class="goal-actions">
        <button class="ghost" data-edit="${g.id}">Edit</button>
        <button class="ghost" data-del="${g.id}">Delete</button>
      </div>
    </li>`).join("");
}

function renderMotivation() {
  $("focusText").textContent = FOCUS_MESSAGES[focusIndex];
  $("quoteText").textContent = QUOTES[quoteIndex];

  const general = ADVICE[dayOfYear(new Date()) % ADVICE.length];
  const open = state.goals.filter(g => !g.achieved);
  let personal = "";
  if (open.length) {
    const neglected = open
      .map(g => ({ g, last: lastWorked(g.id) }))
      .sort((a, b) => (a.last || "").localeCompare(b.last || ""))[0];
    const when = neglected.last ? `since ${neglected.last}` : "yet";
    personal = ` You haven't worked on "${neglected.g.title}" ${when}. Try one small step for it today. ${neglected.g.tip || ""}`;
  }
  $("adviceText").textContent = general + personal;
}

function renderVideos() {
  const vids = state.videos || [];
  $("videoGrid").innerHTML = vids.length === 0
    ? `<p class="hint">No videos yet. Paste a YouTube link above to add one.</p>`
    : vids.map(v => `
      <div class="video-card">
        <div class="video-frame">
          <iframe src="https://www.youtube-nocookie.com/embed/${esc(v.yt)}?rel=0"
                  title="${esc(v.title || "YouTube video")}" loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
        </div>
        <div class="video-meta">
          <span class="video-title">${esc(v.title || "Untitled video")}</span>
          <span class="goal-actions">
            <a class="ghost-link" href="https://youtu.be/${esc(v.yt)}" target="_blank" rel="noopener">Open ↗</a>
            <button class="ghost" data-vrename="${v.id}">Rename</button>
            <button class="ghost" data-vdel="${v.id}">Remove</button>
          </span>
        </div>
      </div>`).join("");
}

function renderAll() {
  $("todayLabel").textContent = prettyDate(todayKey());
  renderVideos();
  renderStats();
  renderCalendar();
  renderDaily();
  renderGoals();
  renderMotivation();
}

/* ===========================================================
   Events
   =========================================================== */
$("calGrid").addEventListener("click", e => {
  const btn = e.target.closest("[data-key]");
  if (!btn || btn.disabled) return;
  selectedKey = btn.dataset.key;
  renderCalendar();
  renderDaily();
});

$("prevMonth").onclick = () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); };
$("nextMonth").onclick = () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); };
$("todayBtn").onclick = () => {
  const n = new Date();
  viewYear = n.getFullYear(); viewMonth = n.getMonth(); selectedKey = todayKey();
  renderCalendar(); renderDaily();
};

$("dailyList").addEventListener("change", e => {
  const id = e.target.dataset.goal;
  if (!id) return;
  const list = new Set(state.log[selectedKey] || []);
  e.target.checked ? list.add(id) : list.delete(id);
  if (list.size) state.log[selectedKey] = [...list]; else delete state.log[selectedKey];
  saveState();
  renderStats(); renderCalendar(); renderGoals(); renderMotivation();
  $("cheerText").textContent = cheerFor(list.size, goalsAvailableOn(selectedKey).length);
});

$("dayNote").addEventListener("input", e => {
  const v = e.target.value;
  if (v.trim()) state.notes[selectedKey] = v; else delete state.notes[selectedKey];
  saveState();
});

$("addForm").addEventListener("submit", e => {
  e.preventDefault();
  const title = $("newGoal").value.trim();
  if (!title) return;
  state.goals.push({
    id: uid(), title, category: $("newCategory").value, tip: "",
    achieved: false, achievedDate: null, createdAt: todayKey()
  });
  $("newGoal").value = "";
  saveState();
  renderAll();
});

$("goalList").addEventListener("click", e => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editId) {
    const g = state.goals.find(x => x.id === editId);
    const title = prompt("Edit your goal:", g.title);
    if (title === null) return;
    if (title.trim()) g.title = title.trim();
    const tip = prompt("Your personal tip / plan for this goal (optional):", g.tip || "");
    if (tip !== null) g.tip = tip.trim();
    saveState(); renderAll();
  }
  if (delId) {
    const g = state.goals.find(x => x.id === delId);
    if (!confirm(`Delete this goal?\n\n"${g.title}"`)) return;
    state.goals = state.goals.filter(x => x.id !== delId);
    saveState(); renderAll();
  }
});

$("goalList").addEventListener("change", e => {
  const id = e.target.dataset.achieve;
  if (!id) return;
  const g = state.goals.find(x => x.id === id);
  g.achieved = e.target.checked;
  g.achievedDate = g.achieved ? todayKey() : null;
  saveState(); renderAll();
  if (g.achieved) alert(`🎉 CONGRATULATIONS! 🎉\n\nYou achieved:\n"${g.title}"\n\nYou kept your promise to yourself. Be proud!`);
});

$("videoForm").addEventListener("submit", e => {
  e.preventDefault();
  const yt = youtubeId($("videoUrl").value);
  if (!yt) { $("videoError").textContent = "That doesn't look like a YouTube link. Try copying it again from YouTube's Share button."; return; }
  $("videoError").textContent = "";
  state.videos.push({ id: uid(), yt, title: $("videoTitle").value.trim() });
  $("videoUrl").value = ""; $("videoTitle").value = "";
  saveState(); renderVideos();
});

$("videoGrid").addEventListener("click", e => {
  const renameId = e.target.dataset.vrename;
  const delId = e.target.dataset.vdel;
  if (renameId) {
    const v = state.videos.find(x => x.id === renameId);
    const t = prompt("Name this video:", v.title || "");
    if (t === null) return;
    v.title = t.trim();
    saveState(); renderVideos();
  }
  if (delId) {
    const v = state.videos.find(x => x.id === delId);
    if (!confirm(`Remove this video?\n\n${v.title || "Untitled video"}`)) return;
    state.videos = state.videos.filter(x => x.id !== delId);
    saveState(); renderVideos();
  }
});

$("newFocusBtn").onclick = () => { focusIndex = (focusIndex + 1) % FOCUS_MESSAGES.length; renderMotivation(); };
$("newQuoteBtn").onclick = () => { quoteIndex = (quoteIndex + 1) % QUOTES.length; renderMotivation(); };

/* ---------- Backup / restore (backup file is NOT encrypted, keep it safe) ---------- */
$("exportBtn").onclick = () => {
  if (!confirm("The backup file is readable (not encrypted). Keep it private. Download it?")) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `goal-tracker-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$("importInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = normalize(JSON.parse(reader.result));
      if (!s) throw new Error("bad file");
      if (!confirm("Replace your current data on this device with this backup?")) return;
      state = s;
      ensureVideos();
      saveState(); renderAll();
      alert("Backup restored ✅");
    } catch (err) {
      alert("That file doesn't look like a Goal Tracker backup.");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
});

/* Refresh "today" if the page stays open past midnight */
let lastToday = todayKey();
setInterval(() => {
  if (!state) return;
  if (todayKey() !== lastToday) {
    if (selectedKey === lastToday) selectedKey = todayKey();
    lastToday = todayKey();
    renderAll();
  }
}, 60000);

boot();
