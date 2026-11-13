# 🎯 My Goal Tracker

A personal life-goal tracker with a **calendar**, **daily checkboxes**, **streaks**, **advice**, **motivation** and
**YouTube videos**. Sign in with email and password on **any device** (phone, laptop) and your progress is always in sync.

🔗 **Website:** https://snehamukherjee-02.github.io/goal-tracker/

---

## 🔒 How your data is protected

- The website code is public, but it contains **no personal data**.
- Your goals, ticks, notes and videos are stored in your own free **Supabase** database (PostgreSQL).
- **Row Level Security** means a logged-in user can only read and change **their own** data.
  Without your email and password, nobody can see anything.
- Forgot your password? Click **Forgot password?** and you get a reset link by email (sent via SMTP).
- The Supabase key in `config.js` is the *public* key, so it's safe in public code.
  The **secret / service_role** key must never go in the code.

---

## 🛠️ One-time setup (about 10 minutes)

### 1. Create a free Supabase project
1. Go to https://supabase.com, click **Start your project**, and sign in with GitHub.
2. Click **New project**. Name it `goal-tracker`, set a strong database password (save it somewhere),
   pick the region closest to you (e.g. *Southeast Asia (Singapore)*), and keep the **Free** plan.

### 2. Create the database table
1. In the project, open **SQL Editor** and click **New query**.
2. Paste everything from [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should say *Success*.

### 3. Set the website address for email links
**Authentication → URL Configuration**
- **Site URL:** `https://snehamukherjee-02.github.io/goal-tracker/`
- **Redirect URLs:** click *Add URL* and add the same address.

### 4. Connect the website
**Project Settings → API Keys** (or **API**). Copy the **Project URL** and the **anon / publishable** key
into `config.js`, then push. Never copy the *service_role / secret* key.

### 5. Send emails through your own SMTP (recommended)
Supabase's built-in email is only for testing and sends just a few emails per hour.
To use your own SMTP, go to **Authentication → Emails → SMTP Settings → Enable custom SMTP**.

With **Gmail**:
1. Turn on 2-Step Verification on your Google account.
2. Create an **App Password** at https://myaccount.google.com/apppasswords.
3. Fill in:

| Field | Value |
|------|------|
| Sender email | your Gmail address |
| Sender name | My Goal Tracker |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | your Gmail address |
| Password | the 16-letter App Password (not your normal Gmail password) |

Other free SMTP options: **Brevo** (300 emails a day), **Resend** or **Zoho Mail**. Use their SMTP host, port, username and password.

### 6. Create your account and lock sign-ups
1. Open the website, click **Create account**, confirm the email, and sign in.
2. Click **Import** and choose `private/content.json` from this folder. Your goals, messages and videos load into your account.
3. In Supabase, go to **Authentication → Sign In / Providers** and turn **off** *Allow new users to sign up*.
   Now nobody else can create an account.

---

## 📱 Daily use

- Open the website on any device and sign in. You stay signed in on your own devices.
- Ticks, notes, goals and videos save automatically. The status next to your email shows **Saved ✓**.
- Switch devices any time. When you come back to a tab, it picks up changes made elsewhere.
- **Backup** downloads a copy of all your data. **Import** loads a goals file or backup.

> ⚠️ The free Supabase plan **pauses a project after 7 days with no use**. Using the tracker regularly keeps it awake.
> If it pauses, open the Supabase dashboard and click **Restore project**. Your data is kept.

---

## 🗂️ Project files

| File | What it does | Public? |
|------|--------------|---------|
| `index.html` | Login screens and app layout | ✅ |
| `style.css`  | Design (dark mode automatically) | ✅ |
| `app.js`     | App logic, login, password reset, cloud sync | ✅ |
| `config.js`  | Supabase project URL and public key | ✅ (safe) |
| `supabase/schema.sql` | Database table and security rules | ✅ |
| `.github/workflows/deploy.yml` | Publishes the site to GitHub Pages | ✅ |
| `private/content.json` | Your starting goals, messages and videos, for importing | ❌ never uploaded |

---

## ✨ Features

- **Goal list:** tips, a big "achieved" checkbox with a celebration, and add / edit / delete with categories.
- **Calendar:** tick the goals you worked on each day, a pink heat map, and daily notes.
- **Stats:** today's count, 🔥 streak, active days, goals achieved.
- **Focus reminders, daily quote and advice**, including a nudge for the goal you've neglected longest.
- **🎬 Motivation videos:** paste any YouTube link to play it on the page. Rename or remove videos.
- **Accounts:** email and password login, password reset by email, sync across all devices.

---

## 💡 How to use it every day (5 minutes)

1. **Morning:** read the focus reminder and advice, and pick 2–3 goals.
2. **During the day:** do at least one small action for each.
3. **Night:** tick what you did, write a one-line note, and plan tomorrow.
4. **Rule:** missed a day? No guilt. Just never miss **two** days in a row.

---

## 📝 Updates (changelog)

### v3.0 — 13 November 2026
- 👤 **Email and password accounts** (Supabase Auth). Sign in from any device.
- ☁️ **Cloud database** (Supabase PostgreSQL, free plan). Ticks, notes, goals and videos sync across devices.
- 📧 **Password reset by email** through SMTP (e.g. Gmail App Password or Brevo).
- 🔒 Row Level Security: each account can only access its own data.
- Removed the old password-file encryption and the GitHub-secret password.
- **Import** loads your goals file (`private/content.json`) or any backup.

### v2.2 / v2.1 / v2.0 — 13 November 2026
- Encrypted content with a password, GitHub Pages hosting, and embedded YouTube videos.

### v1.1 / v1.0 — 13 November 2026
- First version: goal list, calendar check-ins, heat map, notes, stats, motivation, backup.
