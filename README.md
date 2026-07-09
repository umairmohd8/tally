# tally

A warm, paper-textured habit tracker that's kind on the hard days — with optional cross-device sync.

![status](https://img.shields.io/badge/status-live-3E8E5A) ![stack](https://img.shields.io/badge/stack-React%2018%20%2B%20Babel-1B1A17) ![backend](https://img.shields.io/badge/backend-Supabase-3ECF8E)

**Live:** https://umairmohd8.github.io/tally/

## What it does

- **Track daily habits** with per-habit schedules, colors, and time-of-day buckets.
- **Edit, delete, and set deadlines** — tap a habit's name to edit; give it an end date after
  which it finishes and bows out of your day.
- **Streaks that survive paused days**, so a planned break doesn't reset your progress.
- **"Life happens" pause** — pause some or all habits for a date range; when it expires you get a
  gentle recovery screen instead of a wall of broken streaks.
- **Minimum viable day (MVD)** — a lighter check-in that still counts, for low-energy days.
- **Friends & sharing** — a Friends tab showing friends' progress on the habits they share; each
  habit has a private/shared toggle. (Friends are locally simulated for now.)
- **"N checked in today"** — a real, privacy-safe count of people who logged a habit today.
- **Weekly review**, **light/dark themes** in a hand-tuned *Inkwell* palette.

## Sign in & sync

- **Guest / local** — without signing in, everything lives in your browser's `localStorage`.
- **Sign in** (Google, or email magic link) → your habits sync live across devices via Supabase,
  protected per-user by Row-Level Security. Friends only ever see what you mark shared.
- New visitors land on a **landing page** with a live, non-persisting demo; the tracker itself
  opens after sign-in.

## Run it locally

No dependencies to install — `.jsx` is transpiled in the browser by `@babel/standalone`.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Backend config lives in `config.js` (gitignored; copy from `config.example.js` and add your
Supabase URL + anon key). **Without** `config.js`, the app runs in local-only guest mode. **With**
it, signed-out visitors see the landing page and can sign in to sync.

## How it's built

Zero-build by design: `index.html` loads `.jsx` modules in dependency order and each attaches to
`window.*`. Backend is Supabase (Postgres + Auth + Realtime + RLS); the app is deployed to GitHub
Pages via a GitHub Actions workflow that injects `config.js` from repo secrets at build time.

| File | Role |
|------|------|
| `index.html` | Shell + all CSS (the *Inkwell* palette and themes) |
| `config.js` | Supabase URL + anon key → `window.sb` (gitignored; see `config.example.js`) |
| `tweaks-panel.jsx` | Draggable dev "Tweaks" panel + `useTweaks` hook |
| `icons.jsx` | Inline SVG icons (`window.Icons`) |
| `components.jsx` | Habit/date/streak utils + core UI (`HabitRow`, add/edit modal) |
| `screens.jsx` | Larger screens & copy (recovery, weekly review, MVD, check-in counter) |
| `social.jsx` | Friends & sharing UI (`window.Social`) |
| `sync.jsx` | Supabase data layer — auth, CRUD, migration, realtime (`window.Sync`) |
| `auth.jsx` | Sign-in modal + account control (`window.Auth`) |
| `landing.jsx` | Signed-out landing page + ephemeral demo (`window.Landing`) |
| `app.jsx` | `App` root — gating (landing/tracker/guest), state, wiring, mount |

See [`CLAUDE.md`](./CLAUDE.md) for the deep map, and `docs/superpowers/` for design specs + plans.

## Status

Live and in use — a personal project. Open items (auth setup notes, the check-in-counter SQL,
optional email-code/SMTP) are tracked in [`tasks/todo.md`](./tasks/todo.md).
