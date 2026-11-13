/* ===========================================================
   My Goal Tracker — login + cloud sync (Supabase)
   -----------------------------------------------------------
   • Sign in with email + password on any device.
   • All data lives in one row per user in the `tracker_state`
     table, protected by Row Level Security (only you can read it).
   • Password reset by email (Supabase Auth, sent via SMTP).
   =========================================================== */

const $ = id => document.getElementById(id);
const CFG = window.APP_CONFIG || {};
const SITE_URL = location.origin + location.pathname;   // where email links come back to

/* ---------- Generic (non-personal) fallback messages ---------- */
const GENERIC_FOCUS = [
  "Your energy is limited. Spend it on your goals today.",
  "Close the chat. Open your goals. Future you is waiting.",
  "You can't control other people. You CAN control what you do today."
];
const GENERIC_QUOTES = [
  "Small steps every day add up to big results.",
  "Your only competition is who you were yesterday.",
  "Dream big. Start small. Act now."
];
const GENERIC_ADVICE = [
  "Pick 2–3 goals for today and do one small action for each.",
  "Missed a day? No guilt. Just don't miss two days in a row."
];

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
let sb = null;          // Supabase client
let user = null;        // signed-in user
let state = null;       // { goals, log, notes, videos, focus, quotes, advice }
let lastUpdated = null; // updated_at of the row we loaded / saved

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function emptyState() {
  return { goals: [], log: {}, notes: {}, videos: [], focus: [], quotes: [], advice: [] };
}

/* YouTube link → 11-char video id (youtu.be, watch?v=, shorts, embed, live) */
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

/* Accepts saved state, an old backup file, or the starter content file
   ({ goals:[{title,category,tip}], focus, quotes, advice, videos:[{url,title}] }) */
function normalize(s) {
  if (!s || typeof s !== "object" || !Array.isArray(s.goals)) return null;
  const today = todayKey();
  const strArr = a => Array.isArray(a) ? a.filter(x => typeof x === "string" && x.trim()) : [];
  return {
    goals: s.goals.filter(g => g && g.title).map(g => ({
      id: g.id || uid(),
      title: String(g.title),
      category: g.category || "Self",
      tip: g.tip || "",
      achieved: !!g.achieved,
      achievedDate: g.achievedDate || null,
      createdAt: g.createdAt || today,
      date: /^\d{4}-\d{2}-\d{2}$/.test(g.date || "") ? g.date : null   // set → goal only for that one day
    })),
    log: s.log && typeof s.log === "object" ? s.log : {},
    notes: s.notes && typeof s.notes === "object" ? s.notes : {},
    videos: (Array.isArray(s.videos) ? s.videos : []).map(v => ({
      id: v.id || uid(), yt: v.yt || youtubeId(v.url), title: v.title || ""
    })).filter(v => v.yt),
    focus: strArr(s.focus),
    quotes: strArr(s.quotes),
    advice: strArr(s.advice),
    seeded: !!s.seeded
  };
}

/* First time (empty account): load your default goals, videos, reminders, quotes
   and advice from the private `starter_content` table (only readable when logged in). */
async function maybeSeed() {
  if (state.seeded || state.goals.length > 0) return;
  const { data, error } = await sb.from("starter_content").select("data").eq("id", 1).maybeSingle();
  if (error || !data) return;              // table not set up yet → stay empty
  const starter = normalize(data.data);
  if (!starter) return;
  state = { ...starter, log: state.log, notes: state.notes, seeded: true };
  saveState();
}

const focusList = () => state.focus.length ? state.focus : GENERIC_FOCUS;
const quoteList = () => state.quotes.length ? state.quotes : GENERIC_QUOTES;
const adviceList = () => state.advice.length ? state.advice : GENERIC_ADVICE;

/* ===========================================================
   Cloud sync
   =========================================================== */
let saveTimer = null, dirty = false, saving = false;

function setSync(text) { $("syncStatus").textContent = text; }

function saveState() {
  dirty = true;
  setSync("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}

async function flush() {
  if (!user) return;
  if (saving) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700); return; }
  saving = true;
  dirty = false;
  const now = new Date().toISOString();
  const { error } = await sb.from("tracker_state")
    .upsert({ user_id: user.id, data: state, updated_at: now });
  saving = false;
  if (error) {
    dirty = true;
    setSync(navigator.onLine ? "⚠️ Not saved, retrying…" : "📴 Offline, will save when back online");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 5000);
    return;
  }
  lastUpdated = now;
  if (dirty) flush(); else setSync("Saved ✓");
}

async function loadRemote() {
  const { data, error } = await sb.from("tracker_state")
    .select("data, updated_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    state = normalize(data.data) || emptyState();
    lastUpdated = data.updated_at;
  } else {
    state = emptyState();
    lastUpdated = null;
  }
}

/* When you come back to the tab, pull changes made on another device */
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !user || dirty || saving) return;
  const { data, error } = await sb.from("tracker_state")
    .select("data, updated_at").eq("user_id", user.id).maybeSingle();
  if (error || !data || data.updated_at === lastUpdated || dirty || saving) return;
  state = normalize(data.data) || state;
  lastUpdated = data.updated_at;
  renderAll();
  setSync("Updated from another device ✓");
});

window.addEventListener("online", () => { if (dirty) flush(); });
window.addEventListener("beforeunload", e => {
  if (dirty || saving) { e.preventDefault(); e.returnValue = ""; }
});

/* ===========================================================
   Auth screens
   =========================================================== */
const FORMS = { signin: "signInForm", signup: "signUpForm", forgot: "forgotForm", newpass: "newPassForm" };

function showMode(mode) {
  Object.entries(FORMS).forEach(([m, id]) => { $(id).hidden = m !== mode; });
  authMsg(""); authErr("");
}
function authMsg(t) { $("authMsg").textContent = t; }
function authErr(t) { $("authError").textContent = t; }
function busy(form, on, label) {
  const b = form.querySelector("button[type=submit]");
  if (on) { b.dataset.label = b.textContent; b.textContent = label || "Please wait…"; b.disabled = true; }
  else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
}

document.querySelectorAll("[data-mode]").forEach(a => a.addEventListener("click", e => {
  e.preventDefault();
  showMode(a.dataset.mode);
}));

$("signInForm").addEventListener("submit", async e => {
  e.preventDefault();
  authErr(""); busy(e.target, true, "Signing in…");
  const { error } = await sb.auth.signInWithPassword({
    email: $("siEmail").value.trim(), password: $("siPassword").value
  });
  busy(e.target, false);
  if (error) authErr(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
  else $("siPassword").value = "";
});

$("signUpForm").addEventListener("submit", async e => {
  e.preventDefault();
  authErr(""); busy(e.target, true, "Creating…");
  const { data, error } = await sb.auth.signUp({
    email: $("suEmail").value.trim(), password: $("suPassword").value,
    options: { emailRedirectTo: SITE_URL }
  });
  busy(e.target, false);
  if (error) { authErr(error.message); return; }
  $("suPassword").value = "";
  if (!data.session) authMsg("✅ Account created! Check your email and click the confirmation link, then sign in.");
});

$("forgotForm").addEventListener("submit", async e => {
  e.preventDefault();
  authErr(""); busy(e.target, true, "Sending…");
  const { error } = await sb.auth.resetPasswordForEmail($("fpEmail").value.trim(), { redirectTo: SITE_URL });
  busy(e.target, false);
  if (error) authErr(error.message);
  else authMsg("📧 If that email has an account, a reset link is on its way. Check your inbox (and spam).");
});

let inRecovery = false;
$("newPassForm").addEventListener("submit", async e => {
  e.preventDefault();
  const p1 = $("npPassword").value, p2 = $("npPassword2").value;
  if (p1 !== p2) { authErr("Passwords don't match."); return; }
  authErr(""); busy(e.target, true, "Saving…");
  const { error } = await sb.auth.updateUser({ password: p1 });
  busy(e.target, false);
  if (error) { authErr(error.message); return; }
  $("npPassword").value = ""; $("npPassword2").value = "";
  inRecovery = false;
  alert("✅ Password changed! You're signed in.");
  const { data } = await sb.auth.getSession();
  if (data.session) enterApp(data.session.user);
});

$("signOutBtn").onclick = async () => {
  if (dirty) await flush();
  await sb.auth.signOut();
};

function showAuth() {
  user = null; state = null;
  $("app").hidden = true;
  $("authScreen").hidden = false;
}

let entering = false;
async function enterApp(u) {
  if (inRecovery || entering) return;
  if (user && user.id === u.id && state) return;
  entering = true;
  user = u;
  try {
    await loadRemote();
    await maybeSeed();
  } catch (err) {
    entering = false;
    user = null;
    authErr("Couldn't load your data: " + err.message);
    return;
  }
  entering = false;
  $("authScreen").hidden = true;
  $("app").hidden = false;
  $("userEmail").textContent = u.email;
  setSync("Saved ✓");
  focusIndex = dayOfYear(new Date()) % focusList().length;
  quoteIndex = dayOfYear(new Date()) % quoteList().length;
  renderAll();
  showPage(location.hash.slice(1));
}

/* ===========================================================
   Hamburger menu + pages
   =========================================================== */
const PAGES = { today: "Today", calendar: "Calendar", goals: "My goals", motivation: "Motivation", videos: "Videos" };
let currentPage = "today";

function openMenu() {
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
  $("drawerBackdrop").hidden = false;
  $("menuBtn").setAttribute("aria-expanded", "true");
  const active = document.querySelector(".drawer-links a.active");
  if (active) active.focus();
}
function closeMenu() {
  $("drawer").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
  $("drawerBackdrop").hidden = true;
  $("menuBtn").setAttribute("aria-expanded", "false");
}

function showPage(p) {
  if (!PAGES[p]) p = "today";
  currentPage = p;
  document.querySelectorAll(".page").forEach(el => { el.hidden = el.dataset.page !== p; });
  document.querySelectorAll(".drawer-links a").forEach(a => a.classList.toggle("active", a.dataset.page === p));
  $("pageTitle").textContent = PAGES[p];

  // The daily check-in card is shared by the Today and Calendar pages
  const card = $("checkinCard");
  if (p === "today") {
    $("slotToday").appendChild(card);
    if (state && selectedKey !== todayKey()) {
      selectedKey = todayKey();
      viewYear = new Date().getFullYear(); viewMonth = new Date().getMonth();
      renderDaily(); renderCalendar();
    }
  } else if (p === "calendar") {
    $("slotCalendar").appendChild(card);
  }
  card.hidden = !(p === "today" || p === "calendar");
  closeMenu();
  window.scrollTo(0, 0);
}

$("menuBtn").onclick = () => ($("drawer").classList.contains("open") ? closeMenu() : openMenu());
$("closeMenuBtn").onclick = closeMenu;
$("drawerBackdrop").onclick = closeMenu;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
window.addEventListener("hashchange", () => { if (state) showPage(location.hash.slice(1)); });
$("drawer").addEventListener("click", e => {
  if (e.target.closest("#exportBtn, #signOutBtn")) closeMenu();
});
$("importInput").addEventListener("click", closeMenu);

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
/* Life goals (no date) show on EVERY calendar day.
   A goal with a date shows only on that one day. */
function goalsAvailableOn(k) {
  return state.goals.filter(g => !g.date || g.date === k);
}
function shortDate(k) {
  return parseKey(k).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
/* A dated goal is "achieved" exactly when it's ticked on its day */
function syncDatedGoal(g) {
  if (!g.date) return;
  const done = (state.log[g.date] || []).includes(g.id);
  g.achieved = done;
  g.achievedDate = done ? g.date : null;
}
function setLogged(k, id, on) {
  const list = new Set(state.log[k] || []);
  on ? list.add(id) : list.delete(id);
  if (list.size) state.log[k] = [...list]; else delete state.log[k];
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
    const planned = state.goals.some(g => g.date === k);
    const mark = count ? `<small>${count}✓</small>` : planned ? `<small>📌</small>` : "";
    html += `<button class="${cls.join(" ")}" data-key="${k}"
              title="${count} goal${count === 1 ? "" : "s"} worked on${planned ? " · has a goal for this day" : ""}">
              ${day}${mark}</button>`;
  }
  $("calGrid").innerHTML = html;
}

function renderDaily() {
  const isToday = selectedKey === todayKey();
  const isFuture = selectedKey > todayKey();
  $("dayLabel").textContent = isToday ? "Today's goal check-in" : prettyDate(selectedKey);
  $("dayHint").textContent = isToday
    ? "Tick every goal you worked on today, even a small step counts."
    : isFuture
      ? "A future day. Goals marked 📌 are planned just for this day."
      : "Editing a past day. Tick what you worked on that day.";

  const done = new Set(workedOn(selectedKey));
  // goals set for this specific day first, then life goals
  const goals = goalsAvailableOn(selectedKey).sort((a, b) => (b.date ? 1 : 0) - (a.date ? 1 : 0));
  $("dailyList").innerHTML = goals.length === 0
    ? `<li class="hint">No goals yet. Add some on the "My goals" page.</li>`
    : goals.map(g => `
      <li><label>
        <input type="checkbox" data-goal="${g.id}" ${done.has(g.id) ? "checked" : ""}>
        <span>${g.date ? "📌 " : ""}${esc(g.title)}${g.date ? `<span class="tag day-tag">only this day</span>` : ""}${!g.date && g.achieved ? `<span class="done-tag">✅ achieved</span>` : ""}</span>
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
          ${g.date ? `<span class="tag day-tag">📌 ${esc(shortDate(g.date))}</span>` : ""}
          ${g.achieved && g.achievedDate ? `Achieved on ${esc(g.achievedDate)} 🎉`
            : g.date ? "Not done yet"
            : `Worked on ${countDaysForGoal(g.id)} day(s)`}
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
  const F = focusList(), Q = quoteList(), A = adviceList();
  $("focusText").textContent = F[focusIndex % F.length];
  $("quoteText").textContent = Q[quoteIndex % Q.length];

  const general = A[dayOfYear(new Date()) % A.length];
  const open = state.goals.filter(g => !g.achieved && !g.date);
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
  const vids = state.videos;
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
  $("welcomeBanner").hidden = state.goals.length > 0;
  renderStats();
  renderCalendar();
  renderDaily();
  renderGoals();
  renderMotivation();
  renderVideos();
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
  setLogged(selectedKey, id, e.target.checked);
  const g = state.goals.find(x => x.id === id);
  if (g) syncDatedGoal(g);
  saveState();
  renderStats(); renderCalendar(); renderGoals(); renderMotivation();
  $("cheerText").textContent = cheerFor(workedOn(selectedKey).length, goalsAvailableOn(selectedKey).length);
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
  const date = $("newDate").value || null;
  state.goals.push({
    id: uid(), title, category: $("newCategory").value, tip: "",
    achieved: false, achievedDate: null, createdAt: todayKey(), date
  });
  $("newGoal").value = "";
  $("newDate").value = "";
  saveState();
  renderAll();
  if (date) setSync(`📌 Added for ${shortDate(date)}`);
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
    const d = prompt("Only for one day? Enter a date as YYYY-MM-DD.\nLeave empty to show it on every day.", g.date || "");
    if (d !== null) {
      const nd = d.trim();
      if (nd && !/^\d{4}-\d{2}-\d{2}$/.test(nd)) alert("Date not changed. Please use the format YYYY-MM-DD, e.g. 2026-11-20.");
      else if ((nd || null) !== g.date) {
        if (g.date) setLogged(g.date, g.id, false);   // old day's tick no longer applies
        g.date = nd || null;
        if (g.date) syncDatedGoal(g); else { g.achieved = false; g.achievedDate = null; }
      }
    }
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
  if (g.date) {
    // day goal: the big box and the calendar tick are the same thing
    setLogged(g.date, g.id, e.target.checked);
    syncDatedGoal(g);
  } else {
    g.achieved = e.target.checked;
    g.achievedDate = g.achieved ? todayKey() : null;
  }
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

$("newFocusBtn").onclick = () => { focusIndex++; renderMotivation(); };
$("newQuoteBtn").onclick = () => { quoteIndex++; renderMotivation(); };

/* ---------- Backup / import ---------- */
$("exportBtn").onclick = () => {
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
    e.target.value = "";
    let s;
    try { s = normalize(JSON.parse(reader.result)); } catch (err) { s = null; }
    if (!s) { alert("That file doesn't look like a goals file or Goal Tracker backup."); return; }
    const msg = state.goals.length
      ? `Replace ALL your current data with this file?\n(${s.goals.length} goals, ${s.videos.length} videos)`
      : `Import ${s.goals.length} goals and ${s.videos.length} videos?`;
    if (!confirm(msg)) return;
    state = { ...s, seeded: true };
    saveState(); renderAll();
    alert("Imported ✅ It's saved to your account.");
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

/* ===========================================================
   Start
   =========================================================== */
function boot() {
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
    authErr("Setup not finished: add your Supabase URL and key to config.js.");
    document.querySelectorAll(".auth-form button").forEach(b => { b.disabled = true; });
    return;
  }
  if (!window.supabase) {
    authErr("Couldn't load the login library. Check your internet connection and reload.");
    return;
  }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  sb.auth.onAuthStateChange((event, session) => {
    // run outside the auth callback (supabase-js recommendation)
    setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") {
        inRecovery = true;
        $("app").hidden = true;
        $("authScreen").hidden = false;
        showMode("newpass");
        return;
      }
      if (event === "SIGNED_OUT" || !session) { showAuth(); showMode("signin"); return; }
      if (session && session.user) enterApp(session.user);
    }, 0);
  });

  // Errors coming back in an email link (e.g. expired reset link)
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("error_description")) {
    authErr(hash.get("error_description").replace(/\+/g, " ") + ". Please request a new link.");
    history.replaceState(null, "", location.pathname);
  }
}

boot();
