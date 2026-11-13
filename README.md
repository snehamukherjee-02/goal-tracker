# 🎯 My Goal Tracker

A personal life-goal tracker with a **calendar**, **daily checkboxes**, **streaks**, **advice** and **motivation**.
It's **password-protected and encrypted**: the code is public, but the goals and messages inside are not.

---

## 🔒 Privacy and security

- All personal content (goals, tips, focus reminders, quotes, advice) is stored only in
  `content.enc.js`, **encrypted with AES-256-GCM**. The key comes from your password
  (PBKDF2-SHA256, 600,000 iterations).
- The plain-text version lives in `private/content.json`, which is **never uploaded**
  (it's listed in `.gitignore`).
- Your daily ticks and notes are saved **encrypted** in the browser on each device.
- The password is never stored in the code or on GitHub. **If you forget it, nobody can recover the content.**
- Use a strong password (12+ characters, e.g. 3–4 random words plus a number).
  Anyone can download the encrypted file and try to guess passwords, so a weak password is the only real risk.

---

## ▶️ How to open it

- **Anywhere (phone or laptop):** open your GitHub Pages link and enter your password.
  Tick *Remember on this device* on your own phone or laptop so you don't have to type it every time.
- **On this computer:** double-click `index.html`.
- Press **🔒 Lock** to lock it and forget the password on that device.

> Each device keeps its own progress. To move progress from one device to another, press
> **Backup** on the first device and **Restore** on the other.
> ⚠️ The backup file is NOT encrypted, so keep it private.

---

## 🔑 Reset or change your password (on GitHub, works from your phone)

The website is built by GitHub Actions from two **repository secrets**, which nobody else can see:
- `GOAL_PASSWORD`: your password
- `CONTENT_JSON`: your goals, messages and starting videos (plain JSON)

**To change or reset the password:**
1. Go to the repository → **Settings** → **Secrets and variables** → **Actions**.
2. Click ✏️ next to **GOAL_PASSWORD**, type the new password (8+ characters, 12+ is better) and save.
3. Go to **Actions** → **Deploy encrypted site** → **Run workflow** → **Run workflow**.
4. Wait about 1 minute, then open the site and unlock with the new password.

On each device, the first unlock with a new password asks for the **old** password, so that device can keep its saved
progress. If you've forgotten it, choose *Cancel* to start fresh on that device. Restore a backup if you have one.

**To change the starting goals or messages:** edit `private/content.json` on your computer, then update the
`CONTENT_JSON` secret with its contents and run the workflow again.

**Local copy (optional):** to open `index.html` straight from your computer, run `node tools/encrypt.mjs` once
in this folder. It creates `content.enc.js` locally, and that file is never uploaded.

---

## 🗂️ Project files

| File | What it does | Public? |
|------|--------------|---------|
| `index.html` | Page layout and lock screen | ✅ |
| `style.css`  | Design (dark mode automatically) | ✅ |
| `app.js`     | App logic and decryption | ✅ |
| `content.enc.js` | Your goals and messages, **encrypted**. Built by GitHub Actions | 🌐 on the website only (unreadable without the password) |
| `tools/encrypt.mjs` | Encrypts your content with your password | ✅ |
| `.github/workflows/deploy.yml` | Builds and publishes the site from your secrets | ✅ |
| `private/content.json` | Your goals in plain text | ❌ never uploaded |

---

## ✨ Features

- **Goal list:** tips, a big "achieved" checkbox with a celebration, and add / edit / delete with categories.
- **Calendar:** tick the goals you worked on each day, a pink heat map, and daily notes.
- **Stats:** today's count, 🔥 streak, active days, goals achieved.
- **Focus reminders:** daily messages that keep your energy on your own goals.
- **Daily quote and advice**, including a nudge for the goal you've neglected longest.
- **Backup / Restore** to a JSON file.
- **🎬 Motivation videos:** YouTube videos play right on the page. Paste any YouTube link
  (youtu.be, youtube.com/watch, Shorts, live) in **Add video**. You can rename or remove videos.
  Videos only play on the website link, not when opening `index.html` from your computer.

---

## 💡 How to use it every day (5 minutes)

1. **Morning:** read the focus reminder and advice, and pick 2–3 goals.
2. **During the day:** do at least one small action for each.
3. **Night:** tick what you did, write a one-line note, and plan tomorrow.
4. **Rule:** missed a day? No guilt. Just never miss **two** days in a row.

---

## 📝 Updates (changelog)

### v2.2 — 13 November 2026
- 🔑 **Password reset through GitHub:** the password and content live in repository secrets.
  Change `GOAL_PASSWORD` and re-run the workflow.
- GitHub Actions encrypts the content and publishes the site to GitHub Pages automatically.
- Published as a public repository with clean history. The old private repository is kept as an archive.

### v2.1 — 13 November 2026
- 🎬 New **"My motivation videos"** section with embedded YouTube videos.
- **Add video** box: paste any YouTube link to play it on the page. Rename or remove videos.
- The starting videos are inside the encrypted content. Videos you add are saved encrypted on the device.

### v2.0 — 13 November 2026
- 🔒 Password lock screen and **encryption** (AES-256-GCM) for all personal content.
- Progress saved encrypted in the browser; optional "remember on this device"; 🔒 Lock button.
- Personal content moved to `private/content.json` (not uploaded) and `content.enc.js` (encrypted).
- Published on GitHub Pages so it opens from a phone or laptop anywhere.
- Old data from v1 is moved over automatically and encrypted the first time you unlock.

### v1.1 — 13 November 2026
- More focus reminders and advice.
- Motivation messages use neutral wording.

### v1.0 — 13 November 2026
- First version: goal list, calendar check-ins, heat map, notes, stats, motivation, backup and restore.
